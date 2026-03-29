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
import { aiSettings } from "../../db/schema/ai-settings";
import { type UserRole } from "../../db/schema/users";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";
import { SecurityService } from "../../services/security.service";
import { TeamService } from "../../services/team.service";
import { createTokenPayload } from "../../utils/jwt";

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
const notificationPrefsSchema = z.object({
    emailAlerts: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    aiSuggestions: z.boolean().optional(),
    regulationUpdates: z.boolean().optional(),
    caseUpdates: z.boolean().optional(),
    systemAlerts: z.boolean().optional(),
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    digestEnabled: z.boolean().optional(),
    digestFrequency: z.enum(["daily", "weekly"]).optional(),
});

const updateOrgSchema = z.object({
    name: z.string().min(1).optional(),
    contactInfo: z.string().optional(),
});

const inviteTeamMemberSchema = z.object({
    email: z.string().email(),
    role: z.enum(["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"]),
});

const acceptInviteSchema = z.object({
    code: z.string().min(8),
});

const updateMemberRoleSchema = z.object({
    role: z.enum(["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"]),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

const aiSettingsSchema = z.object({
    llmVerificationEnabled: z.boolean().optional(),
    crossEncoderEnabled: z.boolean().optional(),
    hydeEnabled: z.boolean().optional(),
    colbertEnabled: z.boolean().optional(),
    agenticRetrievalEnabled: z.boolean().optional(),
    semanticWeight: z.number().min(0).max(1).optional(),
    supportWeight: z.number().min(0).max(1).optional(),
    lexicalWeight: z.number().min(0).max(1).optional(),
    categoryWeight: z.number().min(0).max(1).optional(),
    minFinalScore: z.number().min(0).max(1).optional(),
    minPairScore: z.number().min(0).max(1).optional(),
    geminiModel: z.string().min(1).max(100).optional(),
    crossEncoderTopN: z.number().int().min(1).max(100).optional(),
    colbertTopN: z.number().int().min(1).max(100).optional(),
    geminiTopNCandidates: z.number().int().min(1).max(100).optional(),
    agenticMaxRounds: z.number().int().min(1).max(10).optional(),
});

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify as AuthenticatedFastifyInstance;
    const prefsService = new NotificationPreferencesService(db);
    const teamService = new TeamService(db);

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

            const prefs = await prefsService.getPreferences(user.id);

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

            const updated = await prefsService.updatePreferences(user.id, data);

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

    /**
     * GET /api/settings/team
     *
     * - Returns all team members in the organization.
     */
    fastify.get(
        "/team",
        {
            schema: {
                description: "Get team members",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const members = await teamService.listMembers(user.orgId);
            const [organization] = await db
                .select()
                .from(organizations)
                .where(eq(organizations.id, user.orgId))
                .limit(1);

            return reply.send({
                members,
                total: members.length,
                organization,
            });
        }
    );

    /**
     * POST /api/settings/team/invite
     *
     * - Invites a new member to the organization (admin only).
     */
    fastify.post(
        "/team/invite",
        {
            schema: {
                description: "Invite team member",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    required: ["email", "role"],
                    properties: {
                        email: { type: "string", format: "email" },
                        role: { type: "string", enum: ["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"] },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };

            // Check if user is admin
            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const data = inviteTeamMemberSchema.parse(body);
            const { invitation, invitationCode } = await teamService.inviteMember({
                actorUserId: user.id,
                organizationId: user.orgId,
                email: data.email,
                role: data.role as UserRole,
            });

            return reply.send({
                success: true,
                message: "Invitation created successfully",
                inviteId: invitation.id,
                email: invitation.email,
                role: invitation.role,
                invitationCode,
                expiresAt: invitation.expiresAt,
                emailSent: false,
            });
        }
    );

    /**
     * GET /api/settings/team/invitations
     *
     * - Returns organization invitations (admin only).
     */
    fastify.get(
        "/team/invitations",
        {
            schema: {
                description: "List team invitations",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const invitations = await teamService.listInvitations(user.orgId);
            return reply.send({ invitations, total: invitations.length });
        }
    );

    /**
     * POST /api/settings/team/invitations/accept
     *
     * - Accept invitation code and switch user to that organization.
     */
    fastify.post(
        "/team/invitations/accept",
        {
            schema: {
                description: "Accept invitation code",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };
            const data = acceptInviteSchema.parse(body);
            const result = await teamService.acceptInvitation({
                userId: user.id,
                code: data.code,
            });

            const token = request.server.jwt.sign(
                createTokenPayload({
                    id: result.user.id,
                    email: result.user.email,
                    role: result.user.role,
                    organizationId: result.user.organizationId,
                })
            );

            return reply.send({
                success: true,
                message: "Invitation accepted",
                user: result.user,
                organization: result.organization,
                token,
            });
        }
    );

    /**
     * PUT /api/settings/team/members/:memberId/role
     *
     * - Change member role (admin only).
     */
    fastify.put(
        "/team/members/:memberId/role",
        {
            schema: {
                description: "Change team member role",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };
            const { memberId } = request.params as { memberId: string };

            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const data = updateMemberRoleSchema.parse(body);
            const member = await teamService.changeMemberRole({
                actorUserId: user.id,
                organizationId: user.orgId,
                memberId,
                role: data.role as UserRole,
            });

            return reply.send({
                success: true,
                member,
            });
        }
    );

    /**
     * DELETE /api/settings/team/members/:memberId
     *
     * - Remove member from organization (admin only).
     */
    fastify.delete(
        "/team/members/:memberId",
        {
            schema: {
                description: "Remove team member",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { memberId } = request.params as { memberId: string };

            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const removedMember = await teamService.removeMember({
                actorUserId: user.id,
                organizationId: user.orgId,
                memberId,
            });

            return reply.send({
                success: true,
                message: "Member removed from organization",
                member: removedMember,
            });
        }
    );

    /**
     * POST /api/settings/organization/leave
     *
     * - Leave current organization and move to personal workspace.
     */
    fastify.post(
        "/organization/leave",
        {
            schema: {
                description: "Leave current organization",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;

            const updatedUser = await teamService.leaveOrganization(user.id);
            const token = request.server.jwt.sign(
                createTokenPayload({
                    id: updatedUser.id,
                    email: updatedUser.email,
                    role: updatedUser.role,
                    organizationId: updatedUser.organizationId,
                })
            );

            return reply.send({
                success: true,
                message: "You left the organization successfully",
                user: updatedUser,
                token,
            });
        }
    );

    /**
     * GET /api/settings/billing
     *
     * - Returns billing information and usage statistics.
     */
    fastify.get(
        "/billing",
        {
            schema: {
                description: "Get billing information",
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

            // MVP: Return mock billing data
            return reply.send({
                plan: {
                    name: "Professional",
                    price: 199,
                    interval: "month",
                    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                },
                usage: {
                    storageUsedGB: 2.5,
                    storageLimitGB: 10,
                    activeCases: 24,
                    casesLimit: null,
                },
                invoices: [
                    {
                        id: "INV-2024-001",
                        date: new Date().toISOString().split("T")[0],
                        amount: 199,
                        status: "paid",
                        pdfUrl: "/api/invoices/INV-2024-001.pdf",
                    },
                ],
            });
        }
    );
    const securityService = new SecurityService(db);

    /**
     * PUT /api/settings/security/password
     *
     * - Changes the current user's password.
     */
    fastify.put(
        "/security/password",
        {
            schema: {
                description: "Change user password",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };
            const data = changePasswordSchema.parse(body);

            try {
                await securityService.changePassword(
                    user.id,
                    data.currentPassword,
                    data.newPassword
                );
                return reply.send({ success: true, message: "Password updated successfully" });
            } catch (error: any) {
                return reply.status(400).send({ error: error.message });
            }
        }
    );

    /**
     * GET /api/settings/security/activity
     *
     * - Returns recent login activity for the current user.
     */
    fastify.get(
        "/security/activity",
        {
            schema: {
                description: "Get login activity",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const query = request.query as { limit?: string };
            const limit = Math.min(parseInt(query.limit || "10"), 50);

            const activity = await securityService.getLoginActivity(user.id, limit);

            return reply.send({ activity });
        }
    );

    // ======================================================================
    // AI SETTINGS (admin only)
    // ======================================================================

    /**
     * GET /api/settings/ai
     *
     * - Returns AI pipeline settings for the current user's organization.
     * - Admin only.
     */
    fastify.get(
        "/ai",
        {
            schema: {
                description: "Get AI pipeline settings",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;

            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const [row] = await db
                .select()
                .from(aiSettings)
                .where(eq(aiSettings.organizationId, user.orgId))
                .limit(1);

            if (!row) {
                // Return defaults — no row means org hasn't customized yet
                return reply.send({
                    llmVerificationEnabled: false,
                    crossEncoderEnabled: false,
                    hydeEnabled: false,
                    colbertEnabled: false,
                    agenticRetrievalEnabled: false,
                    semanticWeight: 0.55,
                    supportWeight: 0.20,
                    lexicalWeight: 0.15,
                    categoryWeight: 0.10,
                    minFinalScore: 0.45,
                    minPairScore: 0.40,
                    geminiModel: "gemini-2.0-flash",
                    crossEncoderTopN: 15,
                    colbertTopN: 15,
                    geminiTopNCandidates: 15,
                    agenticMaxRounds: 2,
                });
            }

            return reply.send({
                llmVerificationEnabled: row.llmVerificationEnabled,
                crossEncoderEnabled: row.crossEncoderEnabled,
                hydeEnabled: row.hydeEnabled,
                colbertEnabled: row.colbertEnabled,
                agenticRetrievalEnabled: row.agenticRetrievalEnabled,
                semanticWeight: row.semanticWeight,
                supportWeight: row.supportWeight,
                lexicalWeight: row.lexicalWeight,
                categoryWeight: row.categoryWeight,
                minFinalScore: row.minFinalScore,
                minPairScore: row.minPairScore,
                geminiModel: row.geminiModel,
                crossEncoderTopN: row.crossEncoderTopN,
                colbertTopN: row.colbertTopN,
                geminiTopNCandidates: row.geminiTopNCandidates,
                agenticMaxRounds: row.agenticMaxRounds,
            });
        }
    );

    /**
     * PUT /api/settings/ai
     *
     * - Updates AI pipeline settings for the current user's organization.
     * - Admin only.
     * - Creates the row on first save (upsert pattern).
     */
    fastify.put(
        "/ai",
        {
            schema: {
                description: "Update AI pipeline settings",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;

            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const body = aiSettingsSchema.parse(request.body);

            // Build the update payload (only fields that were provided)
            const updateData: Record<string, unknown> = {
                updatedAt: new Date(),
            };
            if (body.llmVerificationEnabled !== undefined)
                updateData.llmVerificationEnabled = body.llmVerificationEnabled;
            if (body.crossEncoderEnabled !== undefined)
                updateData.crossEncoderEnabled = body.crossEncoderEnabled;
            if (body.hydeEnabled !== undefined)
                updateData.hydeEnabled = body.hydeEnabled;
            if (body.colbertEnabled !== undefined)
                updateData.colbertEnabled = body.colbertEnabled;
            if (body.agenticRetrievalEnabled !== undefined)
                updateData.agenticRetrievalEnabled = body.agenticRetrievalEnabled;
            if (body.semanticWeight !== undefined)
                updateData.semanticWeight = body.semanticWeight;
            if (body.supportWeight !== undefined)
                updateData.supportWeight = body.supportWeight;
            if (body.lexicalWeight !== undefined)
                updateData.lexicalWeight = body.lexicalWeight;
            if (body.categoryWeight !== undefined)
                updateData.categoryWeight = body.categoryWeight;
            if (body.minFinalScore !== undefined)
                updateData.minFinalScore = body.minFinalScore;
            if (body.minPairScore !== undefined)
                updateData.minPairScore = body.minPairScore;
            if (body.geminiModel !== undefined)
                updateData.geminiModel = body.geminiModel;
            if (body.crossEncoderTopN !== undefined)
                updateData.crossEncoderTopN = body.crossEncoderTopN;
            if (body.colbertTopN !== undefined)
                updateData.colbertTopN = body.colbertTopN;
            if (body.geminiTopNCandidates !== undefined)
                updateData.geminiTopNCandidates = body.geminiTopNCandidates;
            if (body.agenticMaxRounds !== undefined)
                updateData.agenticMaxRounds = body.agenticMaxRounds;

            // Upsert: try update first, insert if not exists
            const [existing] = await db
                .select({ id: aiSettings.id })
                .from(aiSettings)
                .where(eq(aiSettings.organizationId, user.orgId))
                .limit(1);

            if (existing) {
                await db
                    .update(aiSettings)
                    .set(updateData)
                    .where(eq(aiSettings.organizationId, user.orgId));
            } else {
                await db.insert(aiSettings).values({
                    organizationId: user.orgId,
                    ...updateData,
                });
            }

            // Return the updated settings
            const [updated] = await db
                .select()
                .from(aiSettings)
                .where(eq(aiSettings.organizationId, user.orgId))
                .limit(1);

            return reply.send({
                llmVerificationEnabled: updated.llmVerificationEnabled,
                crossEncoderEnabled: updated.crossEncoderEnabled,
                hydeEnabled: updated.hydeEnabled,
                colbertEnabled: updated.colbertEnabled,
                agenticRetrievalEnabled: updated.agenticRetrievalEnabled,
                semanticWeight: updated.semanticWeight,
                supportWeight: updated.supportWeight,
                lexicalWeight: updated.lexicalWeight,
                categoryWeight: updated.categoryWeight,
                minFinalScore: updated.minFinalScore,
                minPairScore: updated.minPairScore,
                geminiModel: updated.geminiModel,
                crossEncoderTopN: updated.crossEncoderTopN,
                colbertTopN: updated.colbertTopN,
                geminiTopNCandidates: updated.geminiTopNCandidates,
                agenticMaxRounds: updated.agenticMaxRounds,
            });
        }
    );
};

export default settingsRoutes;
