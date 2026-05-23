import { and, asc, eq, ne } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import type { Database } from "../db/connection";
import {
  organizationInvitations,
  organizations,
  users,
  type User,
  type UserRole,
} from "../db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors";
import { OrganizationService } from "./organization.service";
import { AuditLogService } from "./audit-log.service";

const ROLE_PRIORITY: Record<UserRole, number> = {
  admin: 0,
  senior_lawyer: 1,
  lawyer: 2,
  paralegal: 3,
  clerk: 4,
  client: 5,
};

export class TeamService {
  constructor(private db: Database) {}

  private getOrganizationService() {
    return new OrganizationService(this.db);
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private generateInviteCode() {
    return randomBytes(18).toString("base64url");
  }

  private hashInviteCode(code: string) {
    return createHash("sha256").update(code).digest("hex");
  }

  private sanitizeUser(user: User) {
    const { passwordHash, googleId, isOAuthUser, ...safeUser } = user;
    return safeUser;
  }

  private async getUserOrThrow(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    return user;
  }

  private async ensureAdminInOrg(userId: string, orgId: number) {
    const user = await this.getUserOrThrow(userId);
    if (user.organizationId !== orgId || user.role !== "admin") {
      throw new ForbiddenError("Admin access required");
    }
    return user;
  }

  private async maybePromoteReplacementAdmin(orgId: number, excludingUserId: string) {
    const candidates = await this.db.query.users.findMany({
      where: and(eq(users.organizationId, orgId), ne(users.id, excludingUserId)),
      orderBy: [asc(users.createdAt)],
    });

    if (candidates.length === 0) {
      return null;
    }

    const nextAdmin = candidates.sort((a, b) => {
      const aPriority = ROLE_PRIORITY[a.role];
      const bPriority = ROLE_PRIORITY[b.role];
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0];

    if (nextAdmin.role === "admin") {
      return nextAdmin;
    }

    const [updated] = await this.db
      .update(users)
      .set({
        role: "admin",
        updatedAt: new Date(),
      })
      .where(eq(users.id, nextAdmin.id))
      .returning();

    return updated;
  }

  async ensurePersonalOrganization(userId: string) {
    const orgService = this.getOrganizationService();
    const existingPersonalOrg = await orgService.getPersonalOrganizationByOwner(userId);
    if (existingPersonalOrg) {
      return existingPersonalOrg;
    }

    const user = await this.getUserOrThrow(userId);
    const ownerDisplayName = user.fullName?.trim() || user.email.split("@")[0];

    return await orgService.createPersonalOrganization({
      ownerDisplayName,
      ownerUserId: userId,
    });
  }

  async listMembers(orgId: number) {
    const members = await this.db.query.users.findMany({
      where: eq(users.organizationId, orgId),
      orderBy: [asc(users.createdAt)],
      columns: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    return members.map((member) => ({
      id: member.id,
      fullName: member.fullName ?? member.email,
      email: member.email,
      role: member.role,
      status: "active" as const,
      joinedAt: member.createdAt,
      lastActiveAt: member.lastLogin,
    }));
  }

  async inviteMember(input: {
    actorUserId: string;
    organizationId: number;
    email: string;
    role: UserRole;
    expiresInDays?: number;
  }) {
    await this.ensureAdminInOrg(input.actorUserId, input.organizationId);

    const org = await this.db.query.organizations.findFirst({
      where: eq(organizations.id, input.organizationId),
    });

    if (!org) {
      throw new NotFoundError("Organization");
    }

    if (org.isPersonal) {
      throw new ConflictError("Personal workspaces cannot invite members");
    }

    const normalizedEmail = this.normalizeEmail(input.email);

    const existingMember = await this.db.query.users.findFirst({
      where: and(
        eq(users.organizationId, input.organizationId),
        eq(users.email, normalizedEmail)
      ),
    });

    if (existingMember) {
      throw new ConflictError("User is already a member of this organization");
    }

    const existingPendingInvite = await this.db.query.organizationInvitations.findFirst({
      where: and(
        eq(organizationInvitations.organizationId, input.organizationId),
        eq(organizationInvitations.email, normalizedEmail),
        eq(organizationInvitations.status, "pending")
      ),
    });

    if (existingPendingInvite) {
      throw new ConflictError("A pending invitation already exists for this email");
    }

    const invitationCode = this.generateInviteCode();
    const codeHash = this.hashInviteCode(invitationCode);
    const expiresInDays = input.expiresInDays ?? 14;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const [invitation] = await this.db
      .insert(organizationInvitations)
      .values({
        organizationId: input.organizationId,
        email: normalizedEmail,
        role: input.role,
        codeHash,
        status: "pending",
        expiresAt,
        invitedByUserId: input.actorUserId,
      })
      .returning();

    return {
      invitation,
      invitationCode,
    };
  }

  async listInvitations(orgId: number) {
    return await this.db.query.organizationInvitations.findMany({
      where: eq(organizationInvitations.organizationId, orgId),
      orderBy: [asc(organizationInvitations.createdAt)],
    });
  }

  async acceptInvitation(input: { userId: string; code: string }) {
    const user = await this.getUserOrThrow(input.userId);
    const code = input.code.trim();

    if (!code) {
      throw new UnauthorizedError("Invitation code is required");
    }

    const codeHash = this.hashInviteCode(code);
    const invitation = await this.db.query.organizationInvitations.findFirst({
      where: and(
        eq(organizationInvitations.codeHash, codeHash),
        eq(organizationInvitations.status, "pending")
      ),
    });

    if (!invitation) {
      throw new UnauthorizedError("Invalid invitation code");
    }

    if (invitation.email !== this.normalizeEmail(user.email)) {
      throw new ForbiddenError("This invitation is for a different email address");
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.db
        .update(organizationInvitations)
        .set({
          status: "expired",
          updatedAt: new Date(),
        })
        .where(eq(organizationInvitations.id, invitation.id));

      throw new UnauthorizedError("Invitation code has expired");
    }

    const targetOrg = await this.db.query.organizations.findFirst({
      where: eq(organizations.id, invitation.organizationId),
    });

    if (!targetOrg) {
      throw new NotFoundError("Organization");
    }

    const [updatedUser] = await this.db
      .update(users)
      .set({
        organizationId: invitation.organizationId,
        role: invitation.role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    await this.db
      .update(organizationInvitations)
      .set({
        status: "accepted",
        acceptedByUserId: user.id,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationInvitations.id, invitation.id));

    return {
      user: this.sanitizeUser(updatedUser),
      organization: targetOrg,
      invitationId: invitation.id,
    };
  }

  /*
   * revokeInvitation
   *
   * - Admin marks a pending invitation as revoked. The invitation code stops
   *   working immediately. Already-accepted or already-revoked invites can't
   *   be revoked again.
   */
  async revokeInvitation(input: {
    actorUserId: string;
    organizationId: number;
    invitationId: number;
  }) {
    await this.ensureAdminInOrg(input.actorUserId, input.organizationId);

    const invitation = await this.db.query.organizationInvitations.findFirst({
      where: eq(organizationInvitations.id, input.invitationId),
    });
    if (!invitation) {
      throw new NotFoundError("Invitation");
    }
    if (invitation.organizationId !== input.organizationId) {
      throw new ForbiddenError("Invitation does not belong to this organization");
    }
    if (invitation.status === "accepted") {
      throw new ConflictError("Cannot revoke an accepted invitation");
    }
    if (invitation.status === "revoked") {
      throw new ConflictError("Invitation is already revoked");
    }

    const [updated] = await this.db
      .update(organizationInvitations)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(organizationInvitations.id, input.invitationId))
      .returning();

    return updated;
  }

  /*
   * resendInvitation
   *
   * - Rotates the invitation code (new hash + extended expiry) and flips a
   *   revoked/expired/pending row back to pending. The old code stops working.
   * - Accepted invitations cannot be resent.
   */
  async resendInvitation(input: {
    actorUserId: string;
    organizationId: number;
    invitationId: number;
    expiresInDays?: number;
  }) {
    await this.ensureAdminInOrg(input.actorUserId, input.organizationId);

    const invitation = await this.db.query.organizationInvitations.findFirst({
      where: eq(organizationInvitations.id, input.invitationId),
    });
    if (!invitation) {
      throw new NotFoundError("Invitation");
    }
    if (invitation.organizationId !== input.organizationId) {
      throw new ForbiddenError("Invitation does not belong to this organization");
    }
    if (invitation.status === "accepted") {
      throw new ConflictError("Cannot resend an accepted invitation");
    }

    const invitationCode = this.generateInviteCode();
    const codeHash = this.hashInviteCode(invitationCode);
    const expiresInDays = input.expiresInDays ?? 14;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000
    );

    const [updated] = await this.db
      .update(organizationInvitations)
      .set({
        codeHash,
        status: "pending",
        expiresAt,
        invitedByUserId: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(organizationInvitations.id, input.invitationId))
      .returning();

    return { invitation: updated, invitationCode };
  }

  async changeMemberRole(input: {
    actorUserId: string;
    organizationId: number;
    memberId: string;
    role: UserRole;
  }) {
    await this.ensureAdminInOrg(input.actorUserId, input.organizationId);

    if (input.memberId === input.actorUserId) {
      throw new ConflictError("You cannot change your own role");
    }

    const member = await this.getUserOrThrow(input.memberId);
    if (member.organizationId !== input.organizationId) {
      throw new NotFoundError("Member");
    }

    if (member.role === "admin" && input.role !== "admin") {
      const admins = await this.db.query.users.findMany({
        where: and(eq(users.organizationId, input.organizationId), eq(users.role, "admin")),
      });
      if (admins.length <= 1) {
        throw new ConflictError("Cannot demote the last admin");
      }
    }

    const previousRole = member.role;
    const auditService = new AuditLogService(this.db);
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({
          role: input.role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.memberId))
        .returning();
      await auditService.logTx(tx, {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "role.change",
        targetType: "user",
        targetId: input.memberId,
        payload: { from: previousRole, to: input.role, memberEmail: member.email },
      });
      return row;
    });

    return this.sanitizeUser(updated);
  }

  async removeMember(input: {
    actorUserId: string;
    organizationId: number;
    memberId: string;
  }) {
    await this.ensureAdminInOrg(input.actorUserId, input.organizationId);

    if (input.memberId === input.actorUserId) {
      throw new ConflictError("Use the leave organization action for your own account");
    }

    const member = await this.getUserOrThrow(input.memberId);
    if (member.organizationId !== input.organizationId) {
      throw new NotFoundError("Member");
    }

    if (member.role === "admin") {
      const admins = await this.db.query.users.findMany({
        where: and(eq(users.organizationId, input.organizationId), eq(users.role, "admin")),
      });

      if (admins.length <= 1) {
        await this.maybePromoteReplacementAdmin(input.organizationId, member.id);
      }
    }

    const personalOrg = await this.ensurePersonalOrganization(member.id);

    const [updatedMember] = await this.db
      .update(users)
      .set({
        organizationId: personalOrg.id,
        role: "admin",
        updatedAt: new Date(),
      })
      .where(eq(users.id, member.id))
      .returning();

    return this.sanitizeUser(updatedMember);
  }

  async leaveOrganization(userId: string) {
    const member = await this.getUserOrThrow(userId);
    const currentOrg = await this.db.query.organizations.findFirst({
      where: eq(organizations.id, member.organizationId),
    });

    if (!currentOrg) {
      throw new NotFoundError("Organization");
    }

    if (currentOrg.isPersonal) {
      throw new ConflictError("You are already in your personal workspace");
    }

    if (member.role === "admin") {
      const admins = await this.db.query.users.findMany({
        where: and(eq(users.organizationId, member.organizationId), eq(users.role, "admin")),
      });

      if (admins.length <= 1) {
        await this.maybePromoteReplacementAdmin(member.organizationId, member.id);
      }
    }

    const personalOrg = await this.ensurePersonalOrganization(member.id);
    const [updatedMember] = await this.db
      .update(users)
      .set({
        organizationId: personalOrg.id,
        role: "admin",
        updatedAt: new Date(),
      })
      .where(eq(users.id, member.id))
      .returning();

    return this.sanitizeUser(updatedMember);
  }
}
