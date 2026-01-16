/*
 * Settings routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/settings` prefix.
 * - Provides notification preferences and organization settings.
 * - All routes require JWT authentication.
 */

import {
    FastifyInstance,
    FastifyPluginAsync,
    FastifyReply,
    FastifyRequest,
    FastifySchema,
} from "fastify";
import { db } from "../../db/connection";
import { organizations } from "../../db/schema/organizations";
import { eq } from "drizzle-orm";
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
};

// In-memory notification preferences (in production, store in DB)
// For MVP, we'll use a simple Map keyed by user ID
const notificationPreferences = new Map<string, {
    emailAlerts: boolean;
    pushNotifications: boolean;
    regulationUpdates: boolean;
    caseUpdates: boolean;
    aiSuggestions: boolean;
}>();

const defaultNotificationPrefs = {
    emailAlerts: true,
    pushNotifications: true,
    regulationUpdates: true,
    caseUpdates: true,
    aiSuggestions: true,
};

// Validation schemas
const notificationPrefsSchema = z.object({
    emailAlerts: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    regulationUpdates: z.boolean().optional(),
    caseUpdates: z.boolean().optional(),
    aiSuggestions: z.boolean().optional(),
});

const updateOrgSchema = z.object({
    name: z.string().min(1).optional(),
    contactInfo: z.string().optional(),
});

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify as AuthenticatedFastifyInstance;

    // All routes require authentication
    app.addHook("onRequest", app.authenticate);

    /**
     * GET /api/settings/notifications
     *
     * - Returns notification preferences for current user.
     */
    fastify.get(
        "/notifications",
        {
            schema: {
                description: "Get notification preferences",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;

            const prefs = notificationPreferences.get(user.id) || defaultNotificationPrefs;

            return reply.send(prefs);
        }
    );

    /**
     * PUT /api/settings/notifications
     *
     * - Updates notification preferences for current user.
     */
    fastify.put(
        "/notifications",
        {
            schema: {
                description: "Update notification preferences",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };
            const data = notificationPrefsSchema.parse(body);

            const current = notificationPreferences.get(user.id) || { ...defaultNotificationPrefs };
            const updated = { ...current, ...data };
            notificationPreferences.set(user.id, updated);

            return reply.send(updated);
        }
    );

    /**
     * GET /api/settings/organization
     *
     * - Returns organization settings (admin only).
     */
    fastify.get(
        "/organization",
        {
            schema: {
                description: "Get organization settings",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;

            // Check if user is admin
            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const [org] = await db
                .select()
                .from(organizations)
                .where(eq(organizations.id, user.orgId))
                .limit(1);

            if (!org) {
                return reply.status(404).send({ message: "Organization not found" });
            }

            return reply.send({ organization: org });
        }
    );

    /**
     * PUT /api/settings/organization
     *
     * - Updates organization settings (admin only).
     */
    fastify.put(
        "/organization",
        {
            schema: {
                description: "Update organization settings",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };

            // Check if user is admin
            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const data = updateOrgSchema.parse(body);

            const [updatedOrg] = await db
                .update(organizations)
                .set({
                    ...data,
                    updatedAt: new Date(),
                })
                .where(eq(organizations.id, user.orgId))
                .returning();

            return reply.send({ organization: updatedOrg });
        }
    );
};

export default settingsRoutes;
