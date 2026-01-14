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
import type { Database } from "../../db/connection";

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
};

export default dashboardRoutes;
