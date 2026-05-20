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
import { users, type UserRole } from "../../db/schema/users";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { NotificationPreferencesService } from "../../services/notification-preferences.service";
import { SecurityService } from "../../services/security.service";
import { TeamService } from "../../services/team.service";
import { PermissionService } from "../../services/permission.service";
import { AuditLogService } from "../../services/audit-log.service";
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

const privacySettingsSchema = z
    .object({
        documents: z.boolean().optional(),
        clients: z.boolean().optional(),
        teamDirectory: z.boolean().optional(),
        adminClosureRequired: z.boolean().optional(),
    })
    .partial()
    .strict();

const orgSettingsSchema = z
    .object({
        privacy: privacySettingsSchema.optional(),
    })
    .partial();

const updateOrgSchema = z.object({
    name: z.string().min(1).optional(),
    contactInfo: z.string().optional(),
    restrictCaseVisibility: z.boolean().optional(),
    settings: orgSettingsSchema.optional(),
});

// Permissions an admin can grant to a team member. Keep this allowlist tight so
// arbitrary strings can't sneak into the grants table.
//
// NOTE — these live under `delegated.*` rather than `cases.*` on purpose. A
// lawyer's role default includes `cases.*` (full CRUD on cases), and if these
// were named `cases.assign`/`cases.viewAll` the wildcard would implicitly grant
// them. The `delegated` namespace is only matched by admin's `*` or an explicit
// per-user grant — exactly what we want.
const GRANTABLE_PERMISSIONS = [
  "delegated.cases.assign",
  "delegated.cases.viewAll",
  "delegated.cases.close",
  "delegated.documents.viewAll",
  "delegated.clients.viewAll",
] as const;
const grantPermissionSchema = z.object({
    permission: z.enum(GRANTABLE_PERMISSIONS),
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

            // restrictCaseVisibility is meaningless for personal (single-user) workspaces;
            // ignore it rather than persisting noise.
            if (typeof data.restrictCaseVisibility === "boolean") {
                const [currentOrg] = await db
                    .select({ isPersonal: organizations.isPersonal })
                    .from(organizations)
                    .where(eq(organizations.id, user.orgId))
                    .limit(1);
                if (currentOrg?.isPersonal) {
                    delete (data as { restrictCaseVisibility?: boolean }).restrictCaseVisibility;
                }
            }

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
     * PATCH /api/settings/organization
     *
     * - Alias for the PUT route above, so REST-style PATCH semantics work too.
     */
    fastify.patch(
        "/organization",
        {
            schema: {
                description: "Patch organization settings",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user, body } = request as RequestWithUser & { body: unknown };

            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const data = updateOrgSchema.parse(body);

            // Load current org so we can merge `settings.privacy` and gate
            // restrictCaseVisibility on personal workspaces.
            const [currentOrg] = await db
                .select({
                    isPersonal: organizations.isPersonal,
                    settings: organizations.settings,
                })
                .from(organizations)
                .where(eq(organizations.id, user.orgId))
                .limit(1);

            if (typeof data.restrictCaseVisibility === "boolean" && currentOrg?.isPersonal) {
                delete (data as { restrictCaseVisibility?: boolean }).restrictCaseVisibility;
            }

            // Merge settings deeply so toggling one privacy flag preserves the others.
            let mergedSettings: typeof currentOrg.settings | undefined;
            if (data.settings) {
                const existing = (currentOrg?.settings ?? {}) as Record<string, unknown>;
                const incoming = data.settings;
                mergedSettings = {
                    ...existing,
                    ...incoming,
                    privacy: {
                        ...((existing.privacy as Record<string, unknown> | undefined) ?? {}),
                        ...(incoming.privacy ?? {}),
                    },
                };
                // Drop the un-merged version so the spread below doesn't clobber.
                delete (data as { settings?: unknown }).settings;
            }

            const [updatedOrg] = await db
                .update(organizations)
                .set({
                    ...data,
                    ...(mergedSettings ? { settings: mergedSettings } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(organizations.id, user.orgId))
                .returning();

            await new AuditLogService(db).log({
                organizationId: user.orgId,
                actorUserId: user.id,
                action: "org.settings.update",
                targetType: "organization",
                targetId: user.orgId,
                payload: { ...data, ...(mergedSettings ? { settings: mergedSettings } : {}) },
            });

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

            const [organization] = await db
                .select()
                .from(organizations)
                .where(eq(organizations.id, user.orgId))
                .limit(1);

            // Privacy gate — when the org has hidden the directory, only
            // admins can browse the team list.
            const settings = (organization?.settings ?? {}) as {
                privacy?: { teamDirectory?: boolean };
            };
            if (settings.privacy?.teamDirectory && user.role !== "admin") {
                return reply.status(403).send({
                    message: "Team directory is restricted by your administrator",
                });
            }

            const members = await teamService.listMembers(user.orgId);

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
     * DELETE /api/settings/team/invitations/:id
     *
     * - Revokes a pending invitation (admin only). The code stops working.
     */
    fastify.delete(
        "/team/invitations/:id",
        {
            schema: {
                description: "Revoke a pending invitation",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { id } = request.params as { id: string };

            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const numericId = Number(id);
            if (!Number.isInteger(numericId) || numericId <= 0) {
                return reply.status(400).send({ message: "Invalid invitation id" });
            }

            const updated = await teamService.revokeInvitation({
                actorUserId: user.id,
                organizationId: user.orgId,
                invitationId: numericId,
            });

            return reply.send({ success: true, invitation: updated });
        }
    );

    /**
     * POST /api/settings/team/invitations/:id/resend
     *
     * - Rotates the invitation code and extends the expiry. Returns the new
     *   code so the admin can share it.
     */
    fastify.post(
        "/team/invitations/:id/resend",
        {
            schema: {
                description: "Resend (rotate) an invitation code",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { id } = request.params as { id: string };

            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            const numericId = Number(id);
            if (!Number.isInteger(numericId) || numericId <= 0) {
                return reply.status(400).send({ message: "Invalid invitation id" });
            }

            const { invitation, invitationCode } = await teamService.resendInvitation({
                actorUserId: user.id,
                organizationId: user.orgId,
                invitationId: numericId,
            });

            return reply.send({
                success: true,
                invitation,
                invitationCode,
                expiresAt: invitation.expiresAt,
            });
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
     * PATCH /api/settings/team/members/:memberId/leave
     *
     * - Toggles the member's `isOnLeave` flag (admin only). Pure tag — doesn't
     *   block their login/work; surfaces a redistribute CTA on their profile.
     */
    fastify.patch(
        "/team/members/:memberId/leave",
        {
            schema: {
                description: "Toggle a member's on-leave flag",
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

            const data = z.object({ isOnLeave: z.boolean() }).parse(body);

            const [member] = await db
                .select({
                  id: users.id,
                  organizationId: users.organizationId,
                  isOnLeave: users.isOnLeave,
                  fullName: users.fullName,
                  email: users.email,
                })
                .from(users)
                .where(and(eq(users.id, memberId), eq(users.organizationId, user.orgId)))
                .limit(1);
            if (!member) {
                return reply.status(404).send({ message: "Team member not found" });
            }

            const [updated] = await db
                .update(users)
                .set({ isOnLeave: data.isOnLeave, updatedAt: new Date() })
                .where(eq(users.id, memberId))
                .returning();

            await new AuditLogService(db).log({
                organizationId: user.orgId,
                actorUserId: user.id,
                action: "member.leave_toggle",
                targetType: "user",
                targetId: memberId,
                payload: {
                    from: member.isOnLeave,
                    to: data.isOnLeave,
                    memberEmail: member.email,
                },
            });

            return reply.send({
                success: true,
                member: {
                    id: updated.id,
                    fullName: updated.fullName,
                    email: updated.email,
                    isOnLeave: updated.isOnLeave,
                },
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
     * GET /api/settings/team/members/:memberId/permissions
     *
     * - Returns granted permissions for a single team member (admin only).
     */
    fastify.get(
        "/team/members/:memberId/permissions",
        {
            schema: {
                description: "List granted permissions for a team member",
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

            // Verify the member belongs to the admin's org
            const [member] = await db
                .select({ id: users.id })
                .from(users)
                .where(and(eq(users.id, memberId), eq(users.organizationId, user.orgId)))
                .limit(1);
            if (!member) {
                return reply.status(404).send({ message: "Team member not found" });
            }

            const permService = new PermissionService(db);
            const permissions = await permService.getGrantedPermissions(
                memberId,
                user.orgId
            );

            return reply.send({
                permissions,
                grantable: GRANTABLE_PERMISSIONS,
            });
        }
    );

    /**
     * POST /api/settings/team/members/:memberId/permissions
     *
     * - Grants a permission to a team member (admin only). Body: { permission }.
     */
    fastify.post(
        "/team/members/:memberId/permissions",
        {
            schema: {
                description: "Grant a permission to a team member",
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

            const data = grantPermissionSchema.parse(body);

            const [member] = await db
                .select({ id: users.id })
                .from(users)
                .where(and(eq(users.id, memberId), eq(users.organizationId, user.orgId)))
                .limit(1);
            if (!member) {
                return reply.status(404).send({ message: "Team member not found" });
            }

            const permService = new PermissionService(db);
            await permService.grantPermission({
                userId: memberId,
                organizationId: user.orgId,
                permission: data.permission,
                grantedBy: user.id,
            });

            await new AuditLogService(db).log({
                organizationId: user.orgId,
                actorUserId: user.id,
                action: "permission.grant",
                targetType: "user",
                targetId: memberId,
                payload: { permission: data.permission },
            });

            const permissions = await permService.getGrantedPermissions(
                memberId,
                user.orgId
            );
            return reply.send({ permissions });
        }
    );

    /**
     * DELETE /api/settings/team/members/:memberId/permissions/:permission
     *
     * - Revokes a permission from a team member (admin only).
     */
    fastify.delete(
        "/team/members/:memberId/permissions/:permission",
        {
            schema: {
                description: "Revoke a permission from a team member",
                tags: ["settings"],
                security: [{ bearerAuth: [] }],
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { memberId, permission } = request.params as {
                memberId: string;
                permission: string;
            };

            if (user.role !== "admin") {
                return reply.status(403).send({ message: "Admin access required" });
            }

            if (!GRANTABLE_PERMISSIONS.includes(permission as typeof GRANTABLE_PERMISSIONS[number])) {
                return reply.status(400).send({ message: "Unknown permission" });
            }

            const permService = new PermissionService(db);
            await permService.revokePermission({
                userId: memberId,
                organizationId: user.orgId,
                permission,
            });

            await new AuditLogService(db).log({
                organizationId: user.orgId,
                actorUserId: user.id,
                action: "permission.revoke",
                targetType: "user",
                targetId: memberId,
                payload: { permission },
            });

            const permissions = await permService.getGrantedPermissions(
                memberId,
                user.orgId
            );
            return reply.send({ permissions });
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
            const parsed = parseInt(query.limit || "10", 10);
            const limit = Number.isNaN(parsed) ? 10 : Math.min(parsed, 50);

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
