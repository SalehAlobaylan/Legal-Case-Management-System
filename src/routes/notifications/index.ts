/*
 * Notifications routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/notifications` prefix.
 * - Provides operations for listing, reading, and managing notifications.
 * - All routes require JWT authentication.
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { NotificationService } from "../../services/notification.service";
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

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes require authentication
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /api/notifications
   *
   * - Lists all notifications for the authenticated user.
   * - Supports optional filter for unread only.
   */
  fastify.get(
    "/",
    {
      schema: {
        description: "Get all notifications for current user",
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            unreadOnly: { type: "boolean" },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            offset: { type: "integer", minimum: 0 },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { unreadOnly, limit, offset } = request.query as {
        unreadOnly?: boolean;
        limit?: number;
        offset?: number;
      };

      const notificationService = new NotificationService(app.db);
      const notifications = await notificationService.getNotificationsByUser(
        user.id,
        { unreadOnly, limit, offset }
      );

      return reply.send({ notifications });
    }
  );

  /**
   * GET /api/notifications/unread-count
   *
   * - Returns the count of unread notifications for the authenticated user.
   */
  fastify.get(
    "/unread-count",
    {
      schema: {
        description: "Get unread notification count",
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              count: { type: "number" },
            },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      const notificationService = new NotificationService(app.db);
      const count = await notificationService.getUnreadCount(user.id);

      return reply.send({ count });
    }
  );

  /**
   * PATCH /api/notifications/:id/read
   *
   * - Marks a specific notification as read.
   */
  fastify.patch(
    "/:id/read",
    {
      schema: {
        description: "Mark notification as read",
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const notifId = parseInt(id, 10);

      if (isNaN(notifId)) {
        return reply.status(400).send({ message: "Invalid notification ID" });
      }

      const notificationService = new NotificationService(app.db);
      const notification = await notificationService.markAsRead(
        notifId,
        user.id
      );

      if (!notification) {
        return reply.status(404).send({ message: "Notification not found" });
      }

      return reply.send({ notification });
    }
  );

  /**
   * PATCH /api/notifications/read-all
   *
   * - Marks all notifications as read for the authenticated user.
   */
  fastify.patch(
    "/read-all",
    {
      schema: {
        description: "Mark all notifications as read",
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      const notificationService = new NotificationService(app.db);
      await notificationService.markAllAsRead(user.id);

      return reply.send({ success: true });
    }
  );

  /**
   * DELETE /api/notifications/:id
   *
   * - Deletes a notification by ID.
   */
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete notification",
        tags: ["notifications"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const notifId = parseInt(id, 10);

      if (isNaN(notifId)) {
        return reply.status(400).send({ message: "Invalid notification ID" });
      }

      const notificationService = new NotificationService(app.db);
      await notificationService.deleteNotification(notifId, user.id);

      return reply.code(204).send();
    }
  );
};

export default notificationsRoutes;
