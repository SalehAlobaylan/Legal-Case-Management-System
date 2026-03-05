/*
 * Regulations routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/regulations` prefix (when mounted in `app.ts`).
 * - Exposes routes for managing regulations and viewing their version history:
 *   - Create a regulation (`POST /`)
 *   - List regulations with optional filters (`GET /`)
 *   - Get a single regulation by id (`GET /:id`)
 *   - Update a regulation (`PUT /:id`)
 *   - List versions for a regulation (`GET /:id/versions`)
 * - All routes require JWT authentication via the `fastify.authenticate` hook and
 *   include basic OpenAPI/Swagger metadata (tags, descriptions, security).
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
  FastifySchema,
} from "fastify";
import { eq } from "drizzle-orm";
import {
  compareRegulationVersionsHandler,
  createRegulationHandler,
  getRegulationByIdHandler,
  getRegulationVersionsHandler,
  getRegulationsHandler,
  updateRegulationHandler,
} from "./handlers";
import { caseRegulationLinks } from "../../db/schema";
import type { Database } from "../../db/connection";
import { CaseService } from "../../services/case.service";
import { RegulationSubscriptionService } from "../../services/regulation-subscription.service";
import { RegulationMonitorService } from "../../services/regulation-monitor.service";
import { RegulationSourceService } from "../../services/regulation-source.service";
import { RegulationInsightsService } from "../../services/regulation-insights.service";
import { RegulationAmendmentImpactService } from "../../services/regulation-amendment-impact.service";
import { logger } from "../../utils/logger";

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  broadcastToOrg?: (orgId: number, event: string, data: Record<string, unknown>) => void;
  emitToUser?: (
    userId: string,
    event: string,
    data: Record<string, unknown>
  ) => void;
  db: Database;
};

type RequestWithUser = FastifyRequest & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
};

const regulationsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes require authentication via JWT
  app.addHook("onRequest", app.authenticate);

  // POST /api/regulations
  // - Creates a new regulation record.
  app.post(
    "/",
    {
      schema: {
        description: "Create a new regulation",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    createRegulationHandler as any
  );

  // GET /api/regulations
  // - Returns all regulations with optional filters for category and status.
  app.get(
    "/",
    {
      schema: {
        description: "Get all regulations",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    getRegulationsHandler as any
  );

  // POST /api/regulations/search
  // - Full-text and semantic search for regulations.
  app.post(
    "/search",
    {
      schema: {
        description: "Search regulations",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            topK: { type: "number" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { query, topK = 10 } = request.body as { query: string; topK?: number };

      // Simple search implementation - search by title or regulation number
      const results = await (app as any).db.query.regulations.findMany({
        where: (regulations: any, { or, ilike }: any) =>
          or(
            ilike(regulations.title, `%${query}%`),
            ilike(regulations.regulationNumber, `%${query}%`)
          ),
        limit: topK,
      });

      return reply.send({ regulations: results });
    }
  );

  // GET /api/regulations/subscriptions/me
  // - List the current user's subscriptions.
  app.get(
    "/subscriptions/me",
    {
      schema: {
        description: "Get current user regulation subscriptions",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, query } = request as RequestWithUser & {
        query: { caseId?: string };
      };
      const caseId = query.caseId ? Number.parseInt(query.caseId, 10) : undefined;

      let caseRegulationIds: number[] | undefined;
      if (typeof caseId === "number" && !Number.isNaN(caseId)) {
        const caseService = new CaseService(app.db);
        await caseService.getCaseById(caseId, user.orgId);

        const links = await app.db.query.caseRegulationLinks.findMany({
          where: eq(caseRegulationLinks.caseId, caseId),
          columns: {
            regulationId: true,
          },
        });
        caseRegulationIds = [...new Set(links.map((link) => link.regulationId))];
      }

      const subscriptionService = new RegulationSubscriptionService(app.db);
      const subscriptions = await subscriptionService.getSubscriptionsByUser(
        user.id,
        user.orgId,
        caseRegulationIds
      );

      return reply.send({ subscriptions });
    }
  );

  // POST /api/regulations/subscriptions/bulk
  // - Bulk subscribe the current user to selected regulations for a case.
  app.post(
    "/subscriptions/bulk",
    {
      schema: {
        description: "Bulk subscribe to regulation updates",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["caseId", "regulationIds"],
          properties: {
            caseId: { type: "number" },
            regulationIds: {
              type: "array",
              items: { type: "number" },
            },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & {
        body: {
          caseId: number;
          regulationIds: number[];
        };
      };
      const caseId = Number(body.caseId);
      const requestedRegulationIds = Array.isArray(body.regulationIds)
        ? body.regulationIds
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
        : [];

      if (!Number.isInteger(caseId) || caseId <= 0) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      const caseService = new CaseService(app.db);
      await caseService.getCaseById(caseId, user.orgId);

      const caseLinks = await app.db.query.caseRegulationLinks.findMany({
        where: eq(caseRegulationLinks.caseId, caseId),
        columns: {
          regulationId: true,
        },
      });
      const caseRegulationIdSet = new Set(
        caseLinks.map((link) => link.regulationId)
      );

      const uniqueRequestedIds = [...new Set(requestedRegulationIds)];
      const validRegulationIds = uniqueRequestedIds.filter((id) =>
        caseRegulationIdSet.has(id)
      );
      const notLinkedRegulationIds = uniqueRequestedIds.filter(
        (id) => !caseRegulationIdSet.has(id)
      );

      const subscriptionService = new RegulationSubscriptionService(app.db);
      const result = await subscriptionService.bulkSubscribe({
        userId: user.id,
        organizationId: user.orgId,
        regulationIds: validRegulationIds,
        checkIntervalHours: 24,
        subscribedVia: "ai_dialog",
      });

      for (const regulationId of notLinkedRegulationIds) {
        result.failed.push({
          regulationId,
          reason: "not_found",
        });
      }

      return reply.send(result);
    }
  );

  // POST /api/regulations/subscribe
  // - Subscribe current user to regulation updates.
  app.post(
    "/subscribe",
    {
      schema: {
        description: "Subscribe to regulation updates",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["regulationId"],
          properties: {
            regulationId: { type: "number" },
            sourceUrl: { type: "string" },
            checkIntervalHours: { type: "number" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & {
        body: {
          regulationId: number;
          sourceUrl?: string;
          checkIntervalHours?: number;
        };
      };
      const { regulationId, sourceUrl, checkIntervalHours } = body;

      const subscriptionService = new RegulationSubscriptionService(app.db);
      const result = await subscriptionService.createOrUpdateSubscription({
        userId: user.id,
        organizationId: user.orgId,
        regulationId,
        sourceUrl,
        checkIntervalHours,
        subscribedVia: "manual",
      });

      if (!result.created) {
        const statusCode = result.reason === "not_found" ? 404 : 400;
        return reply.status(statusCode).send({
          message: result.reason,
        });
      }

      return reply.code(201).send({ subscription: result.subscription });
    }
  );

  // POST /api/regulations/monitor/run
  // - Manually trigger monitor run for due subscriptions.
  app.post(
    "/monitor/run",
    {
      schema: {
        description: "Run regulation monitor checks",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            regulationId: { type: "number" },
            dryRun: { type: "boolean" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & {
        body: {
          regulationId?: number;
          dryRun?: boolean;
        };
      };

      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const monitorService = new RegulationMonitorService(
        app.db,
        app.broadcastToOrg,
        app.emitToUser
      );
      const result = await monitorService.runDueSubscriptions({
        regulationId:
          typeof body?.regulationId === "number" ? body.regulationId : undefined,
        dryRun: Boolean(body?.dryRun),
        triggerSource: "manual_api",
        triggeredByUserId: user.id,
      });

      return reply.send(result);
    }
  );

  // GET /api/regulations/monitor/health
  // - Lightweight monitor health summary.
  app.get(
    "/monitor/health",
    {
      schema: {
        description: "Get regulation monitor health summary",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const monitorService = new RegulationMonitorService(app.db);
      const health = await monitorService.getHealthSummary();
      return reply.send({ health });
    }
  );

  // GET /api/regulations/monitor/stats
  // - Recent monitor run metrics for basic operational visibility.
  app.get(
    "/monitor/stats",
    {
      schema: {
        description: "Get regulation monitor recent run stats",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            limit: { type: "number" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, query } = request as RequestWithUser & {
        query: { limit?: string };
      };
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const limit = query?.limit ? Number.parseInt(query.limit, 10) : 20;
      const monitorService = new RegulationMonitorService(app.db);
      const runs = await monitorService.getRecentRuns(limit);
      return reply.send({ runs });
    }
  );

  // POST /api/regulations/source/moj/sync
  // - Trigger MOJ source synchronization and optional extraction/versioning.
  app.post(
    "/source/moj/sync",
    {
      schema: {
        description: "Run MOJ regulation source sync",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            maxPages: { type: "number" },
            extractContent: { type: "boolean" },
            runInBackground: { type: "boolean" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & {
        body: {
          maxPages?: number;
          extractContent?: boolean;
          runInBackground?: boolean;
        };
      };
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const sourceService = new RegulationSourceService(app.db);
      const syncOptions = {
        maxPages:
          typeof body?.maxPages === "number" ? Math.max(1, body.maxPages) : undefined,
        extractContent:
          typeof body?.extractContent === "boolean" ? body.extractContent : true,
        triggeredByUserId: user.id,
        triggerSource: "moj_source_sync",
      } as const;
      const runInBackground = body?.runInBackground === true;

      if (runInBackground) {
        logger.info(
          {
            triggerSource: syncOptions.triggerSource,
            triggeredByUserId: user.id,
            orgId: user.orgId,
            maxPages: syncOptions.maxPages,
            extractContent: syncOptions.extractContent,
          },
          "Queued MOJ source synchronization in background"
        );

        void sourceService
          .syncMojSource(syncOptions)
          .then((result) => {
            logger.info(
              {
                triggerSource: syncOptions.triggerSource,
                triggeredByUserId: user.id,
                orgId: user.orgId,
                result,
              },
              "Completed queued MOJ source synchronization"
            );
            app.broadcastToOrg?.(user.orgId, "regulation_updated", {
              type: "source_sync_completed",
              result,
              triggeredByUserId: user.id,
              timestamp: new Date().toISOString(),
            });
          })
          .catch((error) => {
            logger.error(
              {
                err: error,
                triggerSource: syncOptions.triggerSource,
                triggeredByUserId: user.id,
                orgId: user.orgId,
              },
              "Queued MOJ source synchronization failed"
            );
            app.broadcastToOrg?.(user.orgId, "regulation_updated", {
              type: "source_sync_failed",
              reason: error instanceof Error ? error.message : "unknown_sync_error",
              triggeredByUserId: user.id,
              timestamp: new Date().toISOString(),
            });
          });

        return reply.code(202).send({
          queued: true,
          message: "MOJ source sync started in background",
        });
      }

      const result = await sourceService.syncMojSource(syncOptions);
      return reply.send({ result });
    }
  );

  // GET /api/regulations/source/moj/health
  // - Operational health and coverage summary for MOJ sync.
  app.get(
    "/source/moj/health",
    {
      schema: {
        description: "Get MOJ source sync health summary",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const sourceService = new RegulationSourceService(app.db);
      const health = await sourceService.getMojHealthSummary();
      return reply.send({ health });
    }
  );

  // GET /api/regulations/ai/health
  // - Operational health for regulation insights + amendment impact queues.
  app.get(
    "/ai/health",
    {
      schema: {
        description: "Get regulation AI queues health summary",
        tags: ["regulations", "ai"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const insightsService = new RegulationInsightsService(app.db);
      const amendmentImpactService = new RegulationAmendmentImpactService(app.db);
      const [insights, amendmentImpact] = await Promise.all([
        insightsService.getQueueHealth(),
        amendmentImpactService.getQueueHealth(),
      ]);

      return reply.send({
        insights,
        amendmentImpact,
      });
    }
  );

  // GET /api/regulations/:id/insights
  // - Returns AI insights for the latest regulation version.
  app.get(
    "/:id/insights",
    {
      schema: {
        description: "Get regulation AI insights for latest version",
        tags: ["regulations", "ai"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { params } = request as { params: { id: string } };
      const regulationId = Number.parseInt(params.id, 10);

      if (!Number.isInteger(regulationId) || regulationId <= 0) {
        return reply.status(400).send({ message: "Invalid regulation id parameter" });
      }

      const insightsService = new RegulationInsightsService(app.db);
      const state = await insightsService.getLatestInsights(regulationId, "ar");

      return reply.send(state);
    }
  );

  // POST /api/regulations/:id/insights/refresh
  // - Queue/regenerate latest regulation insights.
  app.post(
    "/:id/insights/refresh",
    {
      schema: {
        description: "Queue regulation AI insights refresh for latest version",
        tags: ["regulations", "ai"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            force: { type: "boolean" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, params, body } = request as RequestWithUser & {
        params: { id: string };
        body: { force?: boolean };
      };

      const regulationId = Number.parseInt(params.id, 10);
      if (!Number.isInteger(regulationId) || regulationId <= 0) {
        return reply.status(400).send({ message: "Invalid regulation id parameter" });
      }

      const insightsService = new RegulationInsightsService(app.db);
      const state = await insightsService.enqueueLatestInsightsRefresh({
        regulationId,
        triggeredByUserId: user.id,
        force: Boolean(body?.force),
        languageCode: "ar",
      });

      return reply.code(202).send(state);
    }
  );

  // GET /api/regulations/:id/amendment-impact?fromVersion=1&toVersion=2
  // - Returns amendment impact analysis state for selected pair.
  app.get(
    "/:id/amendment-impact",
    {
      schema: {
        description: "Get amendment impact analysis for selected regulation versions",
        tags: ["regulations", "ai"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["fromVersion", "toVersion"],
          properties: {
            fromVersion: { type: "string" },
            toVersion: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { params, query } = request as {
        params: { id: string };
        query: { fromVersion?: string; toVersion?: string };
      };

      const regulationId = Number.parseInt(params.id, 10);
      const fromVersion = Number.parseInt(query.fromVersion || "", 10);
      const toVersion = Number.parseInt(query.toVersion || "", 10);

      if (!Number.isInteger(regulationId) || regulationId <= 0) {
        return reply.status(400).send({ message: "Invalid regulation id parameter" });
      }
      if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion)) {
        return reply
          .status(400)
          .send({ message: "fromVersion and toVersion query params are required" });
      }

      const amendmentImpactService = new RegulationAmendmentImpactService(app.db);
      const state = await amendmentImpactService.getAmendmentImpact({
        regulationId,
        fromVersion,
        toVersion,
        languageCode: "ar",
      });

      return reply.send(state);
    }
  );

  // POST /api/regulations/:id/amendment-impact/refresh
  // - Queue/regenerate amendment impact analysis for selected versions.
  app.post(
    "/:id/amendment-impact/refresh",
    {
      schema: {
        description: "Queue amendment impact analysis refresh for selected versions",
        tags: ["regulations", "ai"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["fromVersion", "toVersion"],
          properties: {
            fromVersion: { type: "number" },
            toVersion: { type: "number" },
            force: { type: "boolean" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, params, body } = request as RequestWithUser & {
        params: { id: string };
        body: { fromVersion: number; toVersion: number; force?: boolean };
      };

      const regulationId = Number.parseInt(params.id, 10);
      if (!Number.isInteger(regulationId) || regulationId <= 0) {
        return reply.status(400).send({ message: "Invalid regulation id parameter" });
      }

      if (
        !Number.isInteger(body.fromVersion) ||
        !Number.isInteger(body.toVersion)
      ) {
        return reply.status(400).send({
          message: "fromVersion and toVersion body fields are required",
        });
      }

      const amendmentImpactService = new RegulationAmendmentImpactService(app.db);
      const state = await amendmentImpactService.enqueueAmendmentImpactRefresh({
        regulationId,
        fromVersion: body.fromVersion,
        toVersion: body.toVersion,
        triggeredByUserId: user.id,
        force: Boolean(body.force),
        languageCode: "ar",
      });

      return reply.code(202).send(state);
    }
  );

  // GET /api/regulations/:id/compare
  // - Compare two regulation versions and return diff blocks.
  app.get(
    "/:id/compare",
    {
      schema: {
        description: "Compare regulation versions",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["fromVersion", "toVersion"],
          properties: {
            fromVersion: { type: "string" },
            toVersion: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    compareRegulationVersionsHandler as any
  );

  // GET /api/regulations/:id
  // - Returns a single regulation by id.
  app.get(
    "/:id",
    {
      schema: {
        description: "Get regulation by ID",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    getRegulationByIdHandler as any
  );

  // PUT /api/regulations/:id
  // - Updates an existing regulation.
  app.put(
    "/:id",
    {
      schema: {
        description: "Update regulation",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    updateRegulationHandler as any
  );

  // GET /api/regulations/:id/versions
  // - Lists all versions for a given regulation, newest first.
  app.get(
    "/:id/versions",
    {
      schema: {
        description: "Get regulation versions",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    getRegulationVersionsHandler as any
  );
};

export default regulationsRoutes;
