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

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  broadcastToOrg?: (orgId: number, event: string, data: Record<string, unknown>) => void;
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
        app.broadcastToOrg
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
