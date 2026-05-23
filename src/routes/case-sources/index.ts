import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  TavilySearchService,
  TavilyDisabledError,
  TavilyQuotaExceededError,
} from "../../services/tavily-search.service";
import { CaseService } from "../../services/case.service";
import { buildAccessContext } from "../../lib/access-context";
import {
  AIClientService,
  type MultiSourceCandidate,
} from "../../services/ai-client.service";
import { legalSourceChunks } from "../../db/schema";
import {
  caseSourceLinks,
  legalSources,
  TRUST_TIER_MULTIPLIER,
  TIER_IS_CITABLE,
  type LegalSourceTrustTier,
} from "../../db/schema";
import type { Database } from "../../db/connection";

type RequestWithUser<P = unknown, B = unknown, Q = unknown> = FastifyRequest<{
  Params: P;
  Body: B;
  Querystring: Q;
}> & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  db: Database;
};

const caseSourcesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  const tavilyService = new TavilySearchService(app.db);

  // All routes in this plugin require JWT authentication.
  app.addHook("onRequest", app.authenticate);

  /**
   * POST /api/case-sources/:caseId/find-related
   *
   * The flagship multi-source endpoint: orchestrates everything.
   *  1. Fetches the case description.
   *  2. Optionally runs a fresh Tavily search (default: yes).
   *  3. Pulls all eligible legal_sources (regulations, judicial decisions,
   *     gov data, Tavily-discovered) with their chunks + embeddings.
   *  4. Ships them to the AI service's multi-source endpoint.
   *  5. Persists results into case_source_links and returns them grouped.
   *
   * Body:
   *   includeWebResearch?: boolean   (default true)
   *   topKPerGroup?:       number    (default 5)
   *   minRelevance?:       number    (default 0)
   */
  fastify.post(
    "/:caseId/find-related",
    {
      schema: {
        description:
          "Multi-source case linking: regulations + judicial decisions + gov data + web search.",
        tags: ["case-sources"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{
        Params: { caseId: string };
        Body: {
          includeWebResearch?: boolean;
          topKPerGroup?: number;
          minRelevance?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { params, body, user } = request as RequestWithUser<
        { caseId: string },
        {
          includeWebResearch?: boolean;
          topKPerGroup?: number;
          minRelevance?: number;
        }
      >;
      const caseId = Number.parseInt(params.caseId, 10);
      if (Number.isNaN(caseId)) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      const access = await buildAccessContext(app.db, user);
      const caseService = new CaseService(app.db);
      const case_ = await caseService.getCaseById(caseId, user.orgId, null, access);
      if (!case_) {
        return reply.status(404).send({ message: "Case not found" });
      }

      const caseText = [case_.title, case_.description]
        .filter(Boolean)
        .join("\n\n")
        .trim();
      if (!caseText) {
        return reply.status(400).send({
          message: "Case has no title or description to search against.",
        });
      }

      const includeWeb = body?.includeWebResearch !== false;
      const tavilyMeta: { ran: boolean; cached?: boolean; quotaRemaining?: number | null } = {
        ran: false,
      };

      // Step 1: optionally trigger Tavily — best-effort, don't fail the whole
      // request if it errors.
      if (includeWeb && tavilyService.isEnabled()) {
        try {
          const tavilyOutcome = await tavilyService.search({
            query: buildCaseQuery(case_),
            organizationId: user.orgId,
            caseId,
          });
          tavilyMeta.ran = true;
          tavilyMeta.cached = tavilyOutcome.cached;
          tavilyMeta.quotaRemaining = tavilyOutcome.quotaRemaining;
        } catch (err) {
          if (
            !(
              err instanceof TavilyDisabledError ||
              err instanceof TavilyQuotaExceededError
            )
          ) {
            request.log.warn(
              { err },
              "case-sources: tavily search failed; continuing without web results"
            );
          }
        }
      }

      // Step 2: fetch all candidate legal sources + their chunks.
      // Filters: active, non-expired, monitoring-eligible OR Tavily for this case.
      const candidates = await app.db
        .select({
          id: legalSources.id,
          sourceType: legalSources.sourceType,
          trustTier: legalSources.trustTier,
          sourceAuthority: legalSources.sourceAuthority,
          title: legalSources.title,
          sourceUrl: legalSources.sourceUrl,
          isCitableInCourt: legalSources.isCitableInCourt,
          summary: legalSources.summary,
        })
        .from(legalSources)
        .where(
          and(
            eq(legalSources.status, "active"),
            sql`(${legalSources.expiresAt} is null or ${legalSources.expiresAt} > now())`
          )
        )
        .limit(500);

      if (candidates.length === 0) {
        return reply.send({
          caseId,
          tavily: tavilyMeta,
          totalSourcesEvaluated: 0,
          groups: [],
          warning: "No legal sources are currently indexed for matching.",
        });
      }

      // Step 3: pull chunks for each candidate — use inArray instead of ANY.
      const candidateIds = candidates.map((c) => c.id);
      const chunkRows = candidateIds.length > 0
        ? await app.db
            .select({
              legalSourceId: legalSourceChunks.legalSourceId,
              chunkIndex: legalSourceChunks.chunkIndex,
              content: legalSourceChunks.content,
              sectionRef: legalSourceChunks.sectionRef,
              embedding: legalSourceChunks.embedding,
            })
            .from(legalSourceChunks)
            .where(inArray(legalSourceChunks.legalSourceId, candidateIds))
        : [];

      const chunksByid = new Map<number, typeof chunkRows>();
      for (const row of chunkRows) {
        const existing = chunksByid.get(row.legalSourceId);
        if (existing) existing.push(row);
        else chunksByid.set(row.legalSourceId, [row]);
      }

      const aiCandidates: MultiSourceCandidate[] = candidates.map((c) => {
        const chunks = chunksByid.get(c.id) ?? [];
        // For sources without chunks (e.g. Tavily before chunking pipeline runs),
        // synthesize a single chunk from title+summary so they still rank.
        const synthesized =
          chunks.length === 0 && (c.summary || c.title)
            ? [
                {
                  chunk_index: 0,
                  text: [c.title, c.summary].filter(Boolean).join(" — ").slice(0, 4000),
                  section_ref: null,
                  embedding: undefined,
                },
              ]
            : null;

        return {
          legal_source_id: c.id,
          source_type: c.sourceType as MultiSourceCandidate["source_type"],
          trust_tier: c.trustTier as MultiSourceCandidate["trust_tier"],
          source_authority: c.sourceAuthority,
          title: c.title,
          source_url: c.sourceUrl,
          is_citable_in_court: c.isCitableInCourt,
          chunks:
            synthesized ??
            chunks.map((chunk) => ({
              chunk_index: chunk.chunkIndex,
              text: chunk.content,
              section_ref: chunk.sectionRef ?? null,
              embedding: chunk.embedding ?? undefined,
            })),
        };
      });

      // Step 4: invoke AI service.
      const aiClient = new AIClientService();
      const aiResult = await aiClient.findRelatedMultiSource(caseText, aiCandidates, {
        caseType: (case_ as { caseType?: string }).caseType,
        topKPerGroup: body?.topKPerGroup,
        minRelevance: body?.minRelevance,
      });

      // Step 5: persist links — upsert into case_source_links.
      for (const group of aiResult.groups) {
        for (const match of group.matches) {
          await app.db
            .insert(caseSourceLinks)
            .values({
              caseId,
              legalSourceId: match.legal_source_id,
              relevanceScore: match.relevance_score.toFixed(4),
              trustWeightedScore: match.trust_weighted_score.toFixed(4),
              method: "ai",
              pipelineStage: match.pipeline_stage,
              evidenceSources: JSON.stringify(
                match.best_chunk ? [match.best_chunk.excerpt] : []
              ),
              matchExplanation: {
                source: "multi_source_ai",
                trust_tier: match.trust_tier,
                trust_weighted_score: match.trust_weighted_score,
                best_chunk: match.best_chunk,
              },
            })
            .onConflictDoUpdate({
              target: [caseSourceLinks.caseId, caseSourceLinks.legalSourceId],
              set: {
                relevanceScore: match.relevance_score.toFixed(4),
                trustWeightedScore: match.trust_weighted_score.toFixed(4),
                pipelineStage: match.pipeline_stage,
                matchExplanation: {
                  source: "multi_source_ai",
                  trust_tier: match.trust_tier,
                  trust_weighted_score: match.trust_weighted_score,
                  best_chunk: match.best_chunk,
                },
                updatedAt: new Date(),
              },
            });
        }
      }

      return reply.send({
        caseId,
        tavily: tavilyMeta,
        totalSourcesEvaluated: aiResult.total_sources_evaluated,
        groups: aiResult.groups,
      });
    }
  );

  /**
   * POST /api/case-sources/:caseId/web-research
   *
   * Run a Tavily web search for the given case. Persists results into
   * legal_sources (sourceType='web_source'), creates case_source_links rows
   * referencing them, and returns the grouped result set.
   *
   * Body (all optional):
   *   query?:        string     // override; defaults to case title + description excerpt
   *   maxResults?:   number     // 1-20, defaults to env TAVILY_DEFAULT_MAX_RESULTS
   *   searchDepth?:  "basic"|"advanced"
   */
  fastify.post(
    "/:caseId/web-research",
    {
      schema: {
        description:
          "Run an on-demand Tavily web search for a case and persist results as discovered legal sources.",
        tags: ["case-sources"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{
        Params: { caseId: string };
        Body: {
          query?: string;
          maxResults?: number;
          searchDepth?: "basic" | "advanced";
        };
      }>,
      reply: FastifyReply
    ) => {
      const { params, body, user } = request as RequestWithUser<
        { caseId: string },
        {
          query?: string;
          maxResults?: number;
          searchDepth?: "basic" | "advanced";
        }
      >;

      const caseId = Number.parseInt(params.caseId, 10);
      if (Number.isNaN(caseId)) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      const access = await buildAccessContext(app.db, user);
      const caseService = new CaseService(app.db);
      const case_ = await caseService.getCaseById(caseId, user.orgId, null, access);
      if (!case_) {
        return reply.status(404).send({ message: "Case not found" });
      }

      const fallbackQuery = buildCaseQuery(case_);
      const query = (body?.query?.trim() || fallbackQuery).slice(0, 400);
      if (!query) {
        return reply.status(400).send({
          message: "Case has no description; provide an explicit `query`.",
        });
      }

      try {
        const outcome = await tavilyService.search({
          query,
          maxResults: body?.maxResults,
          searchDepth: body?.searchDepth,
          organizationId: user.orgId,
          caseId,
        });

        // Link each ingested result to the case in case_source_links.
        // Trust-weighted score = tavily score × trust multiplier.
        for (const r of outcome.results) {
          const trustMultiplier = TRUST_TIER_MULTIPLIER[r.trustTier];
          const trustWeighted = r.tavilyScore * trustMultiplier;

          await app.db
            .insert(caseSourceLinks)
            .values({
              caseId,
              legalSourceId: r.legalSourceId,
              relevanceScore: r.tavilyScore.toFixed(4),
              trustWeightedScore: trustWeighted.toFixed(4),
              method: "tavily_search",
              pipelineStage: "tavily_raw",
              evidenceSources: JSON.stringify([r.url]),
              matchExplanation: {
                source: "tavily",
                query,
                tavily_score: r.tavilyScore,
                trust_tier: r.trustTier,
                trust_multiplier: trustMultiplier,
                cached: outcome.cached,
              },
            })
            .onConflictDoNothing({
              target: [caseSourceLinks.caseId, caseSourceLinks.legalSourceId],
            });
        }

        return reply.send({
          query,
          cached: outcome.cached,
          quotaRemaining: outcome.quotaRemaining,
          results: outcome.results.map((r) => ({
            legalSourceId: r.legalSourceId,
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            tavilyScore: r.tavilyScore,
            trustTier: r.trustTier,
            isCitableInCourt: r.isCitableInCourt,
            publishedDate: r.publishedDate,
          })),
        });
      } catch (err) {
        if (err instanceof TavilyDisabledError) {
          return reply.status(503).send({
            message: "Web research is currently disabled.",
            code: "tavily_disabled",
          });
        }
        if (err instanceof TavilyQuotaExceededError) {
          return reply.status(429).send({
            message: "Daily web-research quota exceeded for this organization.",
            code: "tavily_quota_exceeded",
          });
        }
        throw err;
      }
    }
  );

  /**
   * GET /api/case-sources/:caseId
   *
   * List ALL linked legal sources for a case, grouped by sourceType.
   * Returns trust badges + citability flags so the frontend can render
   * the four-tier display without extra lookups.
   */
  fastify.get(
    "/:caseId",
    {
      schema: {
        description: "List all linked legal sources for a case, grouped by source type.",
        tags: ["case-sources"],
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
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      const access = await buildAccessContext(app.db, user);
      const caseService = new CaseService(app.db);
      const case_ = await caseService.getCaseById(caseId, user.orgId, null, access);
      if (!case_) {
        return reply.status(404).send({ message: "Case not found" });
      }

      const rows = await app.db
        .select({
          linkId: caseSourceLinks.id,
          relevanceScore: caseSourceLinks.relevanceScore,
          trustWeightedScore: caseSourceLinks.trustWeightedScore,
          method: caseSourceLinks.method,
          verified: caseSourceLinks.verified,
          dismissed: caseSourceLinks.dismissed,
          legalSourceId: legalSources.id,
          sourceType: legalSources.sourceType,
          trustTier: legalSources.trustTier,
          sourceAuthority: legalSources.sourceAuthority,
          isCitableInCourt: legalSources.isCitableInCourt,
          title: legalSources.title,
          summary: legalSources.summary,
          sourceUrl: legalSources.sourceUrl,
          curatorVerified: legalSources.curatorVerified,
          publishedDate: legalSources.publishedDate,
        })
        .from(caseSourceLinks)
        .innerJoin(
          legalSources,
          eq(caseSourceLinks.legalSourceId, legalSources.id)
        )
        .where(
          and(
            eq(caseSourceLinks.caseId, caseId),
            eq(caseSourceLinks.dismissed, false)
          )
        )
        .orderBy(desc(caseSourceLinks.trustWeightedScore));

      // Group by sourceType for the four-tier UI.
      const groups: Record<string, typeof rows> = {
        regulation: [],
        judicial_decision: [],
        gov_data: [],
        web_source: [],
      };
      for (const row of rows) {
        if (!groups[row.sourceType]) groups[row.sourceType] = [];
        groups[row.sourceType].push(row);
      }

      return reply.send({
        caseId,
        groups: Object.entries(groups).map(([sourceType, items]) => ({
          sourceType,
          count: items.length,
          // Whether ANY item in this group is court-citable.
          anyCitable: items.some((r) => r.isCitableInCourt),
          items,
        })),
      });
    }
  );

  /**
   * POST /api/case-sources/links/:linkId/verify
   *
   * Mark a case_source_link as verified by the current user.
   * In Phase 4 this will also trigger curator-tier promotion of the
   * underlying legal_source.
   */
  fastify.post(
    "/links/:linkId/verify",
    {
      schema: {
        description: "Mark a case-source link as verified by the current user.",
        tags: ["case-sources"],
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
        return reply.status(400).send({ message: "Invalid linkId" });
      }

      const updated = await app.db
        .update(caseSourceLinks)
        .set({
          verified: true,
          verifiedBy: user.id,
          verifiedAt: new Date(),
          dismissed: false,
          dismissedAt: null,
          dismissedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(caseSourceLinks.id, linkId))
        .returning({ id: caseSourceLinks.id });

      if (updated.length === 0) {
        return reply.status(404).send({ message: "Link not found" });
      }
      return reply.send({ ok: true, linkId });
    }
  );

  /**
   * POST /api/case-sources/links/:linkId/dismiss
   */
  fastify.post(
    "/links/:linkId/dismiss",
    {
      schema: {
        description: "Dismiss a case-source link (lawyer rejected the suggestion).",
        tags: ["case-sources"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{
        Params: { linkId: string };
        Body: { reason?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { params, body, user } = request as RequestWithUser<
        { linkId: string },
        { reason?: string }
      >;
      const linkId = Number.parseInt(params.linkId, 10);
      if (Number.isNaN(linkId)) {
        return reply.status(400).send({ message: "Invalid linkId" });
      }

      const updated = await app.db
        .update(caseSourceLinks)
        .set({
          dismissed: true,
          dismissedBy: user.id,
          dismissedAt: new Date(),
          dismissReason: body?.reason ?? null,
          verified: false,
          verifiedAt: null,
          verifiedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(caseSourceLinks.id, linkId))
        .returning({ id: caseSourceLinks.id });

      if (updated.length === 0) {
        return reply.status(404).send({ message: "Link not found" });
      }
      return reply.send({ ok: true, linkId });
    }
  );
};

function buildCaseQuery(case_: { title?: string | null; description?: string | null }): string {
  const parts: string[] = [];
  if (case_.title) parts.push(case_.title.trim());
  if (case_.description) {
    parts.push(case_.description.trim().split(/\s+/).slice(0, 40).join(" "));
  }
  return parts.join(" — ");
}

export default caseSourcesRoutes;
