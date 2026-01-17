/*
 * Users routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/users/me` prefix.
 * - Provides profile management, statistics, activity feed, and avatar upload.
 * - All routes require JWT authentication.
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { ProfileService } from "../../services/profile.service";
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
};

// Validation schemas
const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().optional(),
  specialization: z.string().optional(),
});

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes require authentication
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /api/users/me
   *
   * - Returns the current user's complete profile.
   */
  fastify.get(
    "/",
    {
      schema: {
        description: "Get current user profile",
        tags: ["users"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  fullName: { type: "string" },
                  phone: { type: "string" },
                  location: { type: "string" },
                  bio: { type: "string" },
                  specialization: { type: "string" },
                  avatarUrl: { type: "string" },
                  role: { type: "string" },
                  organizationId: { type: "number" },
                  organizationName: { type: "string" },
                  createdAt: { type: "string" },
                },
              },
            },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      const profileService = new ProfileService(app.db);
      const profile = await profileService.getProfile(user.id);

      if (!profile) {
        return reply.status(404).send({ message: "User not found" });
      }

      return reply.send({ user: profile });
    }
  );

  /**
   * PUT /api/users/me
   *
   * - Updates the current user's profile.
   */
  fastify.put(
    "/",
    {
      schema: {
        description: "Update current user profile",
        tags: ["users"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            fullName: { type: "string", minLength: 2 },
            phone: { type: "string" },
            location: { type: "string" },
            bio: { type: "string" },
            specialization: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const data = updateProfileSchema.parse(body);

      const profileService = new ProfileService(app.db);
      const updatedUser = await profileService.updateProfile(user.id, data);

      if (!updatedUser) {
        return reply.status(404).send({ message: "User not found" });
      }

      return reply.send({ user: updatedUser });
    }
  );

  /**
   * GET /api/users/me/stats
   *
   * - Returns user performance statistics.
   */
  fastify.get(
    "/stats",
    {
      schema: {
        description: "Get user performance statistics",
        tags: ["users"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              stats: {
                type: "object",
                properties: {
                  cases: {
                    type: "object",
                    properties: {
                      total: { type: "number" },
                      active: { type: "number" },
                      pending: { type: "number" },
                      closed: { type: "number" },
                      wonCount: { type: "number" },
                      lostCount: { type: "number" },
                    },
                  },
                  performance: {
                    type: "object",
                    properties: {
                      winRate: { type: "number" },
                      winRateChange: { type: "number" },
                      avgCaseDurationDays: { type: "number" },
                      durationChange: { type: "number" },
                      clientSatisfactionRate: { type: "number" },
                      satisfactionChange: { type: "number" },
                    },
                  },
                  productivity: {
                    type: "object",
                    properties: {
                      totalBillableHours: { type: "number" },
                      thisMonthHours: { type: "number" },
                      hoursChange: { type: "number" },
                      regulationsReviewed: { type: "number" },
                      documentsProcessed: { type: "number" },
                      aiSuggestionsTotal: { type: "number" },
                      aiSuggestionsAccepted: { type: "number" },
                    },
                  },
                  achievements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        title: { type: "string" },
                        description: { type: "string" },
                        awardedAt: { type: "string" },
                        icon: { type: "string" },
                      },
                    },
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

      const profileService = new ProfileService(app.db);
      const stats = await profileService.getStats(user.id, user.orgId);

      return reply.send({ stats });
    }
  );

  /**
   * GET /api/users/me/activity
   *
   * - Returns recent user activity for the activity feed.
   */
  fastify.get(
    "/activity",
    {
      schema: {
        description: "Get user activity feed",
        tags: ["users"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            limit: { type: "number", default: 10 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              activities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "number" },
                    type: { type: "string" },
                    action: { type: "string" },
                    title: { type: "string" },
                    referenceId: { type: "number" },
                    createdAt: { type: "string" },
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
      const { limit } = request.query as { limit?: number };

      const profileService = new ProfileService(app.db);
      const activities = await profileService.getActivity(user.id, limit || 10);

      return reply.send({ activities });
    }
  );

  /**
   * POST /api/users/me/avatar
   *
   * - Uploads a new avatar for the current user.
   */
  fastify.post(
    "/avatar",
    {
      schema: {
        description: "Upload user avatar",
        tags: ["users"],
        security: [{ bearerAuth: [] }],
        consumes: ["multipart/form-data"],
        response: {
          200: {
            type: "object",
            properties: {
              avatarUrl: { type: "string" },
            },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ message: "No file uploaded" });
      }

      // Read file buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Validate file type
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(data.mimetype)) {
        return reply.status(400).send({
          message: "Invalid file type. Allowed: jpeg, png, gif, webp",
        });
      }

      const profileService = new ProfileService(app.db);
      const avatarUrl = await profileService.uploadAvatar(
        user.id,
        buffer,
        data.filename
      );

      return reply.send({ avatarUrl });
    }
  );
};

export default usersRoutes;
