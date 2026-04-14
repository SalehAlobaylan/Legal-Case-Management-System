/*
 * Dashboard routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/dashboard` prefix.
 * - Provides aggregated statistics for the dashboard view.
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { DashboardService } from "../../services/dashboard.service";
import { DailyOperationsService } from "../../services/daily-operations.service";
import type { Database } from "../../db/connection";
import { z } from "zod";

type RequestWithUser = FastifyRequest & {
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
  broadcastToOrg?: (orgId: number, event: string, data: Record<string, unknown>) => void;
};

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes require authentication
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /api/dashboard/stats
   *
   * - Returns aggregated statistics for the user's organization.
   * - Used to populate dashboard stat cards.
   */
  fastify.get(
    "/stats",
    {
      schema: {
        description: "Get dashboard statistics",
        tags: ["dashboard"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              totalCases: { type: "number" },
              openCases: { type: "number" },
              inProgressCases: { type: "number" },
              pendingHearingCases: { type: "number" },
              closedCases: { type: "number" },
              archivedCases: { type: "number" },
              recentAiSuggestions: { type: "number" },
              upcomingHearings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "number" },
                    caseNumber: { type: "string" },
                    title: { type: "string" },
                    nextHearing: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      const dashboardService = new DashboardService(app.db);
      const stats = await dashboardService.getStats(user.orgId);

      return reply.send(stats);
    }
  );

  /**
   * GET /api/dashboard/recent-activity
   *
   * - Returns recent activity and regulation updates for the dashboard.
   * - Includes regulation amendments, AI suggestions, and system notifications.
   */
  fastify.get(
    "/recent-activity",
    {
      schema: {
        description: "Get recent activity for dashboard",
        tags: ["dashboard"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      const dashboardService = new DashboardService(app.db);
      const recentUpdates = await dashboardService.getRecentActivity(user.orgId);

      return reply.send({ recentUpdates });
    }
  );

  fastify.get(
    "/daily-operations",
    {
      schema: {
        description: "Get daily operations panels data",
        tags: ["dashboard"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const service = new DailyOperationsService(app.db);
      const data = await service.getDailyOperations(user.orgId, user.id);
      return reply.send(data);
    }
  );

  const createTaskSchema = z.object({ text: z.string().min(1).max(400) });

  fastify.post(
    "/tasks",
    {
      schema: {
        description: "Create daily task",
        tags: ["dashboard"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const { text } = createTaskSchema.parse(body);
      const service = new DailyOperationsService(app.db);
      const task = await service.createTask(user.orgId, user.id, text);
      app.broadcastToOrg?.(user.orgId, "daily-ops:tasks-updated", { userId: user.id });
      return reply.code(201).send({ task });
    }
  );

  const updateTaskSchema = z.object({
    text: z.string().min(1).max(400).optional(),
    completed: z.boolean().optional(),
    position: z.number().int().optional(),
  });

  fastify.patch(
    "/tasks/:id",
    {
      schema: {
        description: "Update daily task",
        tags: ["dashboard"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const { id } = request.params as { id: string };
      const taskId = parseInt(id, 10);
      if (isNaN(taskId)) return reply.status(400).send({ message: "Invalid task ID" });
      const patch = updateTaskSchema.parse(body);
      const service = new DailyOperationsService(app.db);
      const task = await service.updateTask(user.orgId, user.id, taskId, patch);
      app.broadcastToOrg?.(user.orgId, "daily-ops:tasks-updated", { userId: user.id });
      return reply.send({ task });
    }
  );

  fastify.delete(
    "/tasks/:id",
    {
      schema: {
        description: "Delete daily task",
        tags: ["dashboard"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const taskId = parseInt(id, 10);
      if (isNaN(taskId)) return reply.status(400).send({ message: "Invalid task ID" });
      const service = new DailyOperationsService(app.db);
      await service.deleteTask(user.orgId, user.id, taskId);
      app.broadcastToOrg?.(user.orgId, "daily-ops:tasks-updated", { userId: user.id });
      return reply.code(204).send();
    }
  );

  const updateReviewSchema = z.object({
    status: z.enum(["pending", "in_review", "approved", "rejected"]),
    notes: z.string().max(1000).optional(),
  });

  fastify.patch(
    "/documents/:id/review",
    {
      schema: {
        description: "Update case document review status",
        tags: ["dashboard"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const { id } = request.params as { id: string };
      const documentId = parseInt(id, 10);
      if (isNaN(documentId)) return reply.status(400).send({ message: "Invalid document ID" });
      const { status, notes } = updateReviewSchema.parse(body);

      const service = new DailyOperationsService(app.db);
      const review = await service.updateDocumentReview(user.orgId, user.id, documentId, status, notes);
      app.broadcastToOrg?.(user.orgId, "daily-ops:review-queue-updated", { documentId, status });
      return reply.send({ review });
    }
  );
};

export default dashboardRoutes;
