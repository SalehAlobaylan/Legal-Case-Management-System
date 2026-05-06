import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  legalSources,
  caseSourceLinks,
  type LegalSourceTrustTier,
  TIER_IS_CITABLE,
} from "../../db/schema";
import type { Database } from "../../db/connection";

/**
 * Curator endpoints (Phase 4).
 *
 * Curator role is implemented at the permission layer (admin + senior_lawyer)
 * rather than as a new userRoleEnum value, to avoid a user data migration.
 *
 * A curator can:
 *   - List discovered/unverified legal sources awaiting review
 *   - Promote a discovered source to "trusted" (and mark court-citable)
 *   - Reject a discovered source (mark trustTier="unverified", curatorVerified=false)
 *   - Approve/reject case-source links in bulk
 */

const CURATOR_ROLES = new Set(["admin", "senior_lawyer"]);

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

const curatorRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  app.addHook("onRequest", app.authenticate);

  // Centralized role-gate: every endpoint here is curator-only.
  app.addHook("preHandler", async (request, reply) => {
    const user = (request as RequestWithUser).user;
    if (!user || !CURATOR_ROLES.has(user.role)) {
      return reply.status(403).send({
        message: "Curator role required (admin or senior_lawyer).",
        code: "curator_role_required",
      });
    }
  });

  /**
   * GET /api/case-sources/curator/queue
   *
   * Returns legal sources awaiting curator review:
   *   - Tier "discovered" (Tavily) that haven't been curator-verified yet
   *   - Tier "unverified" (manually-flagged or low-confidence)
   *
   * Querystring:
   *   limit?:  number (default 50, max 200)
   *   tier?:   "discovered" | "unverified"
   */
  fastify.get(
    "/queue",
    {
      schema: {
        description:
          "List legal sources awaiting curator review (discovered or unverified).",
        tags: ["case-sources", "curator"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{
        Querystring: { limit?: string; tier?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { query } = request as RequestWithUser<
        unknown,
        unknown,
        { limit?: string; tier?: string }
      >;
      const limit = Math.min(
        Math.max(Number.parseInt(query?.limit ?? "50", 10) || 50, 1),
        200
      );
      const tierFilter: LegalSourceTrustTier[] =
        query?.tier === "unverified"
          ? ["unverified"]
          : query?.tier === "discovered"
            ? ["discovered"]
            : ["discovered", "unverified"];

      const rows = await app.db
        .select({
          id: legalSources.id,
          sourceType: legalSources.sourceType,
          trustTier: legalSources.trustTier,
          sourceAuthority: legalSources.sourceAuthority,
          title: legalSources.title,
          summary: legalSources.summary,
          sourceUrl: legalSources.sourceUrl,
          sourceProvider: legalSources.sourceProvider,
          createdAt: legalSources.createdAt,
          curatorVerified: legalSources.curatorVerified,
          // Count how many cases reference this source — high-link-count
          // sources should bubble to the top of the queue.
          linkedCaseCount: sql<number>`(
            select count(*)::int from ${caseSourceLinks}
            where ${caseSourceLinks.legalSourceId} = ${legalSources.id}
              and ${caseSourceLinks.dismissed} = false
          )`,
        })
        .from(legalSources)
        .where(
          and(
            inArray(legalSources.trustTier, tierFilter),
            eq(legalSources.curatorVerified, false)
          )
        )
        .orderBy(desc(legalSources.createdAt))
        .limit(limit);

      return reply.send({
        count: rows.length,
        items: rows,
      });
    }
  );

  /**
   * POST /api/case-sources/curator/sources/:id/promote
   *
   * Promote a discovered source to "trusted" — marks it citable and
   * records the curator action. Used when a lawyer reviews a Tavily
   * result and confirms it's authoritative.
   */
  fastify.post(
    "/sources/:id/promote",
    {
      schema: {
        description:
          "Promote a discovered legal source to trusted tier (curator action).",
        tags: ["case-sources", "curator"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { notes?: string; markCitable?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const { params, body, user } = request as RequestWithUser<
        { id: string },
        { notes?: string; markCitable?: boolean }
      >;
      const id = Number.parseInt(params.id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ message: "Invalid id" });
      }

      const newTier: LegalSourceTrustTier = "trusted";
      const updated = await app.db
        .update(legalSources)
        .set({
          trustTier: newTier,
          isCitableInCourt: body?.markCitable ?? TIER_IS_CITABLE[newTier],
          curatorVerified: true,
          curatorVerifiedBy: user.id,
          curatorVerifiedAt: new Date(),
          curatorNotes: body?.notes ?? null,
          // Persist past Tavily TTL once promoted — curator-vetted sources
          // shouldn't expire.
          expiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(legalSources.id, id))
        .returning({
          id: legalSources.id,
          trustTier: legalSources.trustTier,
          isCitableInCourt: legalSources.isCitableInCourt,
        });

      if (updated.length === 0) {
        return reply.status(404).send({ message: "Source not found" });
      }
      return reply.send({ ok: true, source: updated[0] });
    }
  );

  /**
   * POST /api/case-sources/curator/sources/:id/reject
   *
   * Reject a source — keeps it in DB but marks tier "unverified" and
   * dismisses all case-source links pointing to it. Used to remove
   * misleading or low-quality web results from the system.
   */
  fastify.post(
    "/sources/:id/reject",
    {
      schema: {
        description:
          "Reject a legal source (curator action) and dismiss its case links.",
        tags: ["case-sources", "curator"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { params, body, user } = request as RequestWithUser<
        { id: string },
        { reason?: string }
      >;
      const id = Number.parseInt(params.id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ message: "Invalid id" });
      }

      const now = new Date();

      // 1. Mark the source itself
      const updated = await app.db
        .update(legalSources)
        .set({
          trustTier: "unverified",
          isCitableInCourt: false,
          curatorVerified: true, // marked as reviewed (just rejected)
          curatorVerifiedBy: user.id,
          curatorVerifiedAt: now,
          curatorNotes: body?.reason ?? "Rejected by curator",
          status: "archived",
          updatedAt: now,
        })
        .where(eq(legalSources.id, id))
        .returning({ id: legalSources.id });

      if (updated.length === 0) {
        return reply.status(404).send({ message: "Source not found" });
      }

      // 2. Dismiss all open links pointing to this source
      const dismissed = await app.db
        .update(caseSourceLinks)
        .set({
          dismissed: true,
          dismissedBy: user.id,
          dismissedAt: now,
          dismissReason: `curator_rejected_source: ${body?.reason ?? ""}`.slice(0, 500),
          updatedAt: now,
        })
        .where(
          and(
            eq(caseSourceLinks.legalSourceId, id),
            eq(caseSourceLinks.dismissed, false)
          )
        )
        .returning({ id: caseSourceLinks.id });

      return reply.send({
        ok: true,
        sourceId: id,
        dismissedLinkCount: dismissed.length,
      });
    }
  );

  /**
   * GET /api/case-sources/curator/stats
   *
   * Quick counts for the curator dashboard.
   */
  fastify.get(
    "/stats",
    {
      schema: {
        description: "Counts of sources awaiting curator review, by tier.",
        tags: ["case-sources", "curator"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (_request, reply) => {
      const rows = await app.db
        .select({
          trustTier: legalSources.trustTier,
          count: sql<number>`count(*)::int`,
        })
        .from(legalSources)
        .where(eq(legalSources.curatorVerified, false))
        .groupBy(legalSources.trustTier);

      const byTier: Record<string, number> = {
        discovered: 0,
        unverified: 0,
        trusted: 0,
        official: 0,
      };
      for (const row of rows) {
        byTier[row.trustTier] = row.count;
      }
      return reply.send({ pendingByTier: byTier });
    }
  );
};

export default curatorRoutes;
