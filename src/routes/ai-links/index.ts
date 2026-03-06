import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import {
  AIClientService,
  type SimilarityRegulationCandidate,
} from "../../services/ai-client.service";
import { LinkService } from "../../services/link.service";
import { CaseService } from "../../services/case.service";
import { RegulationSubscriptionService } from "../../services/regulation-subscription.service";
import { DocumentExtractionService } from "../../services/document-extraction.service";
import { NotificationDeliveryService } from "../../services/notification-delivery.service";
import { RegulationRagService } from "../../services/regulation-rag.service";
import type { Database } from "../../db/connection";
import { env } from "../../config/env";
import { desc } from "drizzle-orm";
import { regulationVersions } from "../../db/schema";

type RequestWithUser<P> = FastifyRequest<{ Params: P }> & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  broadcastToOrg: (orgId: number, event: string, data: any) => void;
  emitToUser?: (
    userId: string,
    event: string,
    data: Record<string, unknown>
  ) => void;
  db: Database;
};

function mapCaseTypeToRegulationCategory(caseType: string | null | undefined) {
  switch (caseType) {
    case "labor":
      return "labor_law";
    case "commercial":
      return "commercial_law";
    case "civil":
      return "civil_law";
    case "criminal":
      return "criminal_law";
    case "administrative":
      return "procedural_law";
    default:
      return null;
  }
}

function parseMatchExplanation(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function serializeLinkForClient(
  link: any,
  isSubscribed?: boolean
) {
  let evidenceSources: unknown[] = [];
  if (typeof link.evidenceSources === "string") {
    try {
      const parsed = JSON.parse(link.evidenceSources);
      evidenceSources = Array.isArray(parsed) ? parsed : [];
    } catch {
      evidenceSources = [];
    }
  } else if (Array.isArray(link.evidenceSources)) {
    evidenceSources = link.evidenceSources;
  }

  const regulation = link.regulation
    ? {
        ...link.regulation,
        regulation_number: link.regulation.regulationNumber,
        source_url: link.regulation.sourceUrl,
      }
    : undefined;
  const matchExplanation = parseMatchExplanation(link.matchExplanation);

  return {
    ...link,
    case_id: link.caseId,
    regulation_id: link.regulationId,
    similarity_score:
      typeof link.similarityScore === "string"
        ? Number.parseFloat(link.similarityScore)
        : link.similarityScore,
    verified_by: link.verifiedBy,
    verified_at: link.verifiedAt,
    created_at: link.createdAt,
    updated_at: link.updatedAt,
    isSubscribed: typeof isSubscribed === "boolean" ? isSubscribed : false,
    is_subscribed: typeof isSubscribed === "boolean" ? isSubscribed : false,
    evidenceSources,
    evidence_sources: evidenceSources,
    matchedRegulationVersionId: link.matchedRegulationVersionId || null,
    matched_regulation_version_id: link.matchedRegulationVersionId || null,
    matchExplanation,
    match_explanation: matchExplanation,
    matchedWithDocuments: Boolean(link.matchedWithDocuments),
    matched_with_documents: Boolean(link.matchedWithDocuments),
    regulation,
  };
}

const aiLinksRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  const notificationDelivery = new NotificationDeliveryService(
    app.db,
    app.emitToUser
  );

  // All routes in this plugin require JWT authentication.
  app.addHook("onRequest", app.authenticate);

  /**
   * POST /api/ai-links/:caseId/generate
   *
   * - Generates AI-powered regulation suggestions for a given case.
   * - Delegates similarity calculation to the external AI microservice and
   *   persists the resulting links in `case_regulation_links`.
   */
  fastify.post(
    "/:caseId/generate",
    {
      schema: {
        description: "Generate AI-based regulation links for a case",
        tags: ["ai-links"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { caseId: string } }>,
      reply: FastifyReply
    ) => {
      const { params, user } = request as RequestWithUser<{ caseId: string }>;
      const caseId = Number.parseInt(params.caseId, 10);

      if (Number.isNaN(caseId)) {
        return reply.status(400).send({
          message: "Invalid caseId parameter",
        });
      }

      const caseService = new CaseService(app.db);
      const case_ = await caseService.getCaseById(caseId, user.orgId);
      const extractionService = new DocumentExtractionService(app.db);
      const documentContext = await extractionService.prepareCaseFragments(
        caseId,
        user.orgId
      );
      const caseFragments = [
        {
          fragment_id: "case:primary",
          text: `${case_.title}\n\n${case_.description || ""}`,
          source: "case" as const,
        },
        ...documentContext.fragments,
      ];

      const primaryCaseText = `${case_.title}\n\n${case_.description || ""}`.trim();
      const regulationRows = await app.db.query.regulations.findMany({
        columns: {
          id: true,
          title: true,
          category: true,
          summary: true,
        },
      });

      if (regulationRows.length === 0) {
        return reply.send({
          links: [],
          generationMeta: {
            ...documentContext.meta,
            candidateCount: 0,
            droppedByPrecision: 0,
            regulationsIndexed: 0,
            regulationsUnindexed: 0,
            warnings: ["no_regulations_available"],
          },
        });
      }

      const aiService = new AIClientService();
      const ragService = new RegulationRagService(app.db, aiService);
      const versionRows = await app.db.query.regulationVersions.findMany({
        columns: {
          id: true,
          regulationId: true,
          versionNumber: true,
          content: true,
        },
        orderBy: [desc(regulationVersions.versionNumber)],
      });
      const latestVersionByRegulationId = new Map<
        number,
        {
          id: number;
          regulationId: number;
          versionNumber: number;
          content: string;
        }
      >();
      for (const row of versionRows) {
        if (!latestVersionByRegulationId.has(row.regulationId)) {
          latestVersionByRegulationId.set(row.regulationId, row);
        }
      }

      const chunkRetrieval = await ragService.retrieveTopCandidateChunks({
        queryText: primaryCaseText,
        topK: env.REG_LINK_PREFILTER_TOP_K,
        perRegulationLimit: env.REG_LINK_CANDIDATE_CHUNKS_PER_REG,
      });
      const bestChunkScoreByRegulationId = new Map<number, number>();
      for (const [regulationId, chunks] of chunkRetrieval.byRegulationId.entries()) {
        const best = chunks.reduce((max, item) => Math.max(max, item.score || 0), 0);
        bestChunkScoreByRegulationId.set(regulationId, best);
      }

      const preferredCategory = mapCaseTypeToRegulationCategory(case_.caseType);
      const indexedCandidates: SimilarityRegulationCandidate[] = [];
      const fallbackCandidates: SimilarityRegulationCandidate[] = [];
      let regulationsIndexed = 0;
      let regulationsUnindexed = 0;

      for (const regulation of regulationRows) {
        const latestVersion = latestVersionByRegulationId.get(regulation.id);
        const versionChunks =
          latestVersion && chunkRetrieval.byRegulationVersionId.get(latestVersion.id)
            ? chunkRetrieval.byRegulationVersionId.get(latestVersion.id)
            : [];
        const isIndexed = Boolean(versionChunks && versionChunks.length > 0);

        const candidate: SimilarityRegulationCandidate = {
          id: regulation.id,
          title: regulation.title,
          category: regulation.category,
          regulation_version_id: latestVersion?.id || null,
          content_text:
            latestVersion?.content?.slice(0, env.CASE_LINK_DOC_TOTAL_MAX_CHARS) ||
            regulation.summary ||
            regulation.title,
          candidate_chunks: versionChunks?.map((chunk) => ({
            chunk_id: chunk.chunkId,
            chunk_index: chunk.chunkIndex,
            line_start: chunk.lineStart,
            line_end: chunk.lineEnd,
            article_ref: chunk.articleRef,
            text: chunk.text,
          })),
        };

        if (isIndexed) {
          regulationsIndexed += 1;
          indexedCandidates.push(candidate);
        } else {
          regulationsUnindexed += 1;
          if (preferredCategory && regulation.category === preferredCategory) {
            fallbackCandidates.push(candidate);
          }
        }
      }

      indexedCandidates.sort((a, b) => {
        const aScore = bestChunkScoreByRegulationId.get(a.id) || 0;
        const bScore = bestChunkScoreByRegulationId.get(b.id) || 0;
        return bScore - aScore;
      });

      const selectedCandidates = [
        ...indexedCandidates.slice(0, 50),
        ...fallbackCandidates.slice(0, 10),
      ];

      if (selectedCandidates.length === 0) {
        selectedCandidates.push(
          ...regulationRows.slice(0, 50).map((regulation) => {
            const latestVersion = latestVersionByRegulationId.get(regulation.id);
            return {
              id: regulation.id,
              title: regulation.title,
              category: regulation.category,
              regulation_version_id: latestVersion?.id || null,
              content_text:
                latestVersion?.content?.slice(0, env.CASE_LINK_DOC_TOTAL_MAX_CHARS) ||
                regulation.summary ||
                regulation.title,
            } satisfies SimilarityRegulationCandidate;
          })
        );
      }

      const matches = await aiService.findRelatedRegulations(
        primaryCaseText,
        selectedCandidates,
        {
          topK: env.CASE_LINK_TOP_K_FINAL,
          threshold: env.CASE_LINK_SUPPORT_FLOOR,
          caseFragments,
          caseProfile: {
            case_id: case_.id,
            title: case_.title,
            description: case_.description,
            case_type: case_.caseType,
            status: case_.status,
            court_jurisdiction: case_.courtJurisdiction,
            client_info: case_.clientInfo,
          },
          strictMode: env.CASE_LINK_STRICT_MODE,
          scoringProfile: {
            semantic_weight: env.CASE_LINK_WEIGHT_SEMANTIC,
            support_weight: env.CASE_LINK_WEIGHT_SUPPORT,
            lexical_weight: env.CASE_LINK_WEIGHT_LEXICAL,
            category_weight: env.CASE_LINK_WEIGHT_CATEGORY,
            strict_min_final_score: env.CASE_LINK_MIN_FINAL_SCORE,
            strict_min_pair_score: env.CASE_LINK_MIN_PAIR_SCORE,
            strict_min_supporting_matches: env.CASE_LINK_MIN_SUPPORTING_MATCHES,
            require_case_support: env.CASE_LINK_REQUIRE_CASE_SUPPORT,
          },
        }
      );
      const fallbackUsed = selectedCandidates.some(
        (candidate) =>
          !candidate.candidate_chunks || candidate.candidate_chunks.length === 0
      );
      const generationWarnings = [
        ...new Set([
          ...chunkRetrieval.warnings,
          ...(fallbackUsed ? ["regulation_chunk_index_fallback_used"] : []),
        ]),
      ];

      const linkService = new LinkService(app.db);
      const links = await Promise.all(
        matches.map((match) =>
          linkService.createLink({
            caseId,
            regulationId: match.regulation_id,
            matchedRegulationVersionId:
              match.matched_regulation_version_id || null,
            similarityScore: match.similarity_score.toString(),
            method: "ai",
            evidenceSources: JSON.stringify(match.evidence || []),
            matchExplanation: {
              lineMatches: match.line_matches || [],
              scoreBreakdown: match.score_breakdown || null,
              warnings: match.warnings || [],
            },
            matchedWithDocuments: Boolean(
              (match.evidence || []).some(
                (item) => item?.source === "document"
              )
            ),
          })
        )
      );

      const serializedLinks = links.map((link) => serializeLinkForClient(link));

      // Notify all connected clients in the same organization in real-time
      if (typeof app.broadcastToOrg === "function" && user) {
        app.broadcastToOrg(user.orgId, "ai-links.generated", {
          caseId,
          links: serializedLinks,
          generationMeta: {
            ...documentContext.meta,
            candidateCount: selectedCandidates.length,
            droppedByPrecision: Math.max(0, selectedCandidates.length - matches.length),
            regulationsIndexed,
            regulationsUnindexed,
            warnings: generationWarnings,
          },
        });
      }

      if (serializedLinks.length > 0) {
        await notificationDelivery.notifyOrganization({
          organizationId: user.orgId,
          type: "ai_suggestion",
          category: "aiSuggestions",
          title: `AI suggestions generated for Case ${case_.caseNumber}`,
          message: `${serializedLinks.length} new regulation match${serializedLinks.length === 1 ? "" : "es"} found.`,
          relatedCaseId: caseId,
        });
      }

      return reply.send({
        links: serializedLinks,
        generationMeta: {
          ...documentContext.meta,
          candidateCount: selectedCandidates.length,
          droppedByPrecision: Math.max(0, selectedCandidates.length - matches.length),
          regulationsIndexed,
          regulationsUnindexed,
          warnings: generationWarnings,
        },
      });
    }
  );

  /**
   * GET /api/ai-links/:caseId
   *
   * - Returns all AI (and manually) created links for a given case,
   *   ordered by similarity score descending.
   */
  fastify.get(
    "/:caseId",
    {
      schema: {
        description: "Get AI-generated regulation links for a case",
        tags: ["ai-links"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { caseId: string } }>,
      reply: FastifyReply
    ) => {
      const { params, user } = request as RequestWithUser<{ caseId: string }>;
      const caseId = Number.parseInt(params.caseId, 10);

      if (Number.isNaN(caseId)) {
        return reply.status(400).send({
          message: "Invalid caseId parameter",
        });
      }

      const caseService = new CaseService(app.db);
      await caseService.getCaseById(caseId, user.orgId);

      const linkService = new LinkService(app.db);
      const links = await linkService.getLinksByCaseId(caseId);
      const subscriptionService = new RegulationSubscriptionService(app.db);
      const subscribedRegulationIds =
        await subscriptionService.getSubscribedRegulationIds(
          user.id,
          user.orgId,
          links.map((link) => link.regulationId)
        );

      const serializedLinks = links.map((link) =>
        serializeLinkForClient(
          link,
          subscribedRegulationIds.has(link.regulationId)
        )
      );

      return reply.send({ links: serializedLinks });
    }
  );

  /**
   * POST /api/ai-links/:linkId/verify
   *
   * - Marks a specific link as verified by the authenticated user.
   */
  fastify.post(
    "/:linkId/verify",
    {
      schema: {
        description: "Verify an AI-generated regulation link",
        tags: ["ai-links"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { linkId: string } }>,
      reply: FastifyReply
    ) => {
      const { params, user } = request as RequestWithUser<{ linkId: string }>;
      const linkId = Number.parseInt(params.linkId, 10);

      if (Number.isNaN(linkId)) {
        return reply.status(400).send({
          message: "Invalid linkId parameter",
        });
      }

      const linkService = new LinkService(app.db);
      const link = await linkService.verifyLink(linkId, user.id);
      const serializedLink = serializeLinkForClient(link);

      // Broadcast verification event so clients can update UI in real-time
      if (typeof app.broadcastToOrg === "function" && user) {
        app.broadcastToOrg(user.orgId, "ai-links.verified", {
          linkId,
          verifiedBy: user.id,
        });
      }

      return reply.send({ link: serializedLink });
    }
  );

  /**
   * DELETE /api/ai-links/:linkId
   *
   * - Dismisses (removes) a specific AI-generated regulation link.
   * - Used when a user decides the suggestion is not relevant.
   */
  fastify.delete(
    "/:linkId",
    {
      schema: {
        description: "Dismiss (remove) an AI-generated regulation link",
        tags: ["ai-links"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { linkId: string } }>,
      reply: FastifyReply
    ) => {
      const { params, user } = request as RequestWithUser<{ linkId: string }>;
      const linkId = Number.parseInt(params.linkId, 10);

      if (Number.isNaN(linkId)) {
        return reply.status(400).send({
          message: "Invalid linkId parameter",
        });
      }

      const linkService = new LinkService(app.db);
      await linkService.deleteLink(linkId);

      // Broadcast dismiss event so clients can update UI in real-time
      if (typeof app.broadcastToOrg === "function" && user) {
        app.broadcastToOrg(user.orgId, "ai-links.dismissed", {
          linkId,
          dismissedBy: user.id,
        });
      }

      return reply.code(204).send();
    }
  );
};

export default aiLinksRoutes;
