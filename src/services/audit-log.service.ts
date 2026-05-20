/*
 * AuditLogService
 *
 * - Writes governance events (role changes, permission grants, settings,
 *   announcements, bulk assigns, on-leave toggles) into `admin_audit_log`.
 * - `log()` NEVER throws: a logging failure must not break the underlying
 *   action. Errors go to console only.
 * - `list()` supports a simple cursor (`before`) + `action` filter for the
 *   admin dashboard feed.
 */

import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../db/connection";
import { adminAuditLog } from "../db/schema/admin-audit-log";
import { users } from "../db/schema/users";

/**
 * Canonical list of audit actions. Keeping this as a TS union (not a DB enum)
 * means adding new event types doesn't require a migration.
 */
export const auditActions = [
  "role.change",
  "permission.grant",
  "permission.revoke",
  "org.settings.update",
  "announcement.create",
  "announcement.retire",
  "announcement.delete",
  "case.bulk_assign",
  "member.leave_toggle",
] as const;
export type AuditAction = (typeof auditActions)[number];

export interface AuditLogInput {
  organizationId: number;
  actorUserId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string | number;
  payload?: Record<string, unknown>;
}

export class AuditLogService {
  constructor(private db: Database) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.db.insert(adminAuditLog).values({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId:
          input.targetId === undefined || input.targetId === null
            ? null
            : String(input.targetId),
        payload: input.payload ?? {},
      });
    } catch (err) {
      // Logging must never break the action it's recording.
      // eslint-disable-next-line no-console
      console.error("[AuditLogService.log] failed", err);
    }
  }

  async list(
    organizationId: number,
    opts: { action?: AuditAction; limit?: number; before?: number } = {}
  ) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const conditions = [eq(adminAuditLog.organizationId, organizationId)];
    if (opts.action) conditions.push(eq(adminAuditLog.action, opts.action));
    if (typeof opts.before === "number")
      conditions.push(lt(adminAuditLog.id, opts.before));

    return this.db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        payload: adminAuditLog.payload,
        createdAt: adminAuditLog.createdAt,
        actorId: adminAuditLog.actorUserId,
        actorName: users.fullName,
        actorEmail: users.email,
      })
      .from(adminAuditLog)
      .leftJoin(users, eq(adminAuditLog.actorUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(adminAuditLog.id))
      .limit(limit);
  }
}
