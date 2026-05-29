/*
 * AuditLogService
 *
 * - Writes governance events (role changes, permission grants, settings,
 *   announcements, bulk assigns, on-leave toggles) into `admin_audit_log`.
 * - `log()` NEVER throws: a logging failure must not break the underlying
 *   action. Errors go through the injected Fastify logger when available.
 * - `logTx(tx, ...)` is the transactional variant — used when the audit row
 *   MUST land or the surrounding mutation must roll back. Throws on failure.
 * - `list()` supports a simple cursor (`before`) + `action` filter for the
 *   admin dashboard feed.
 */

import { and, desc, eq, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../db/connection";
import { adminAuditLog } from "../db/schema/admin-audit-log";
import { users } from "../db/schema/users";

// Drizzle's transaction callback receives a tx with the same insert/update/
// delete surface as the top-level db. Derive the type so call sites stay typed.
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

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
  "case.assign",
  "case.bulk_assign",
  "member.leave_toggle",
  "monitor.run",
  "admin.dashboard_settings.update",
  "admin.ai_profile.refresh",
  "admin.ai_org_snapshot.refresh",
  "admin.ai_evaluation.run",
] as const;
export type AuditAction = (typeof auditActions)[number];

export interface AuditLogInput {
  organizationId: number;
  // null when the event is system-initiated (cron, webhook). The column itself
  // is nullable (`onDelete: "set null"`) so deleted-user history survives.
  actorUserId: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string | number;
  payload?: Record<string, unknown>;
}

function rowFromInput(input: AuditLogInput) {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId:
      input.targetId === undefined || input.targetId === null
        ? null
        : String(input.targetId),
    payload: input.payload ?? {},
  };
}

export class AuditLogService {
  constructor(private db: Database, private logger?: FastifyBaseLogger) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.db.insert(adminAuditLog).values(rowFromInput(input));
    } catch (err) {
      // Logging must never break the action it's recording.
      if (this.logger) {
        this.logger.error({ err, action: input.action }, "audit log failed");
      } else {
        // eslint-disable-next-line no-console
        console.error("[AuditLogService.log] failed", err);
      }
    }
  }

  /*
   * logTx
   *
   * - Transactional variant. Runs inside the caller's db.transaction so the
   *   audit row and the surrounding mutation succeed-or-fail together.
   * - Throws on failure (no swallow) — the surrounding transaction rolls back.
   */
  async logTx(tx: Tx, input: AuditLogInput): Promise<void> {
    await tx.insert(adminAuditLog).values(rowFromInput(input));
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
