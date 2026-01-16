/*
 * Profile routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/profile` prefix.
 * - Provides profile management for the authenticated user.
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
import { users } from "../../db/schema/users";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
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

// Validation schemas
const updateProfileSchema = z.object({
    fullName: z.string().min(2).optional(),
    phone: z.string().optional(),
    bio: z.string().optional(),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
});

const profileRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify as AuthenticatedFastifyInstance;

    // All routes require authentication
    app.addHook("onRequest", app.authenticate);

    /**
     * GET /api/profile
     *
     * - Returns the current user's profile.
     */
    fastify.get(
        "/",
        {
            schema: {
                description: "Get current user profile",
                tags: ["profile"],
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
                                    role: { type: "string" },
                                    organizationId: { type: "number" },
                                    createdAt: { type: "string" },
                                    updatedAt: { type: "string" },
                                },
                            },
                        },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;

            const [profile] = await db
                .select({
                    id: users.id,
                    email: users.email,
                    fullName: users.fullName,
                    role: users.role,
                    organizationId: users.organizationId,
                    createdAt: users.createdAt,
                    updatedAt: users.updatedAt,
                })
                .from(users)
                .where(eq(users.id, user.id))
                .limit(1);

            if (!profile) {
                return reply.status(404).send({ message: "User not found" });
            }

            return reply.send({ user: profile });
        }
    );

    /**
     * PUT /api/profile
     *
     * - Updates the current user's profile.
     */
    fastify.put(
        "/",
        {
            schema: {
                description: "Update current user profile",
                tags: ["profile"],
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    properties: {
                        fullName: { type: "string", minLength: 2 },
                        phone: { type: "string" },
                        bio: { type: "string" },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };
            const data = updateProfileSchema.parse(body);

            const [updatedUser] = await db
                .update(users)
                .set({
                    ...data,
                    updatedAt: new Date(),
                })
                .where(eq(users.id, user.id))
                .returning({
                    id: users.id,
                    email: users.email,
                    fullName: users.fullName,
                    role: users.role,
                    organizationId: users.organizationId,
                    createdAt: users.createdAt,
                    updatedAt: users.updatedAt,
                });

            return reply.send({ user: updatedUser });
        }
    );

    /**
     * PUT /api/profile/password
     *
     * - Changes the current user's password.
     */
    fastify.put(
        "/password",
        {
            schema: {
                description: "Change password",
                tags: ["profile"],
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    required: ["currentPassword", "newPassword"],
                    properties: {
                        currentPassword: { type: "string" },
                        newPassword: { type: "string", minLength: 8 },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };
            const { currentPassword, newPassword } = changePasswordSchema.parse(body);

            // Get current password hash
            const [currentUser] = await db
                .select({ passwordHash: users.passwordHash })
                .from(users)
                .where(eq(users.id, user.id))
                .limit(1);

            if (!currentUser) {
                return reply.status(404).send({ message: "User not found" });
            }

            // Verify current password
            const isValid = await bcrypt.compare(currentPassword, currentUser.passwordHash);
            if (!isValid) {
                return reply.status(400).send({ message: "Current password is incorrect" });
            }

            // Hash new password
            const newPasswordHash = await bcrypt.hash(newPassword, 10);

            // Update password
            await db
                .update(users)
                .set({
                    passwordHash: newPasswordHash,
                    updatedAt: new Date(),
                })
                .where(eq(users.id, user.id));

            return reply.send({ message: "Password updated successfully" });
        }
    );
};

export default profileRoutes;
