import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { AIClientService } from "../../services/ai-client.service";
import { LinkService } from "../../services/link.service";
import { CaseService } from "../../services/case.service";
import { RegulationSubscriptionService } from "../../services/regulation-subscription.service";
import { DocumentExtractionService } from "../../services/document-extraction.service";
import type { Database } from "../../db/connection";

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
  db: Database;
};

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
    matchedWithDocuments: Boolean(link.matchedWithDocuments),
    matched_with_documents: Boolean(link.matchedWithDocuments),
    regulation,
  };
}

const aiLinksRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

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

      const regulationCandidates = await app.db.query.regulations.findMany({
        columns: {
          id: true,
          title: true,
          category: true,
        },
      });

      if (regulationCandidates.length === 0) {
        return reply.send({
          links: [],
          generationMeta: {
            ...documentContext.meta,
          },
        });
      }

      const aiService = new AIClientService();
      const matches = await aiService.findRelatedRegulations(
        `${case_.title}\n\n${case_.description || ""}`,
        regulationCandidates.map((regulation) => ({
          id: regulation.id,
          title: regulation.title,
          category: regulation.category,
        })),
        10,
        0.3,
        caseFragments
      );

      const linkService = new LinkService(app.db);
      const links = await Promise.all(
        matches.map((match) =>
          linkService.createLink({
            caseId,
            regulationId: match.regulation_id,
            similarityScore: match.similarity_score.toString(),
            method: "ai",
            evidenceSources: JSON.stringify(match.evidence || []),
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
          },
        });
      }

      return reply.send({
        links: serializedLinks,
        generationMeta: {
          ...documentContext.meta,
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
