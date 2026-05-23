/*
 * Admin audit log
 *
 * - Governance-event trail (role changes, permission grants, settings updates,
 *   announcements, bulk assigns, on-leave toggles). Distinct from
 *   `user_activities` which captures member-facing case/document activity.
 * - `action` is a free-form varchar so adding new audit actions does not need
 *   a schema migration. The canonical list of allowed values lives in TS
 *   (`AuditAction` in services/audit-log.service.ts).
 */

import {
  pgTable,
  serial,
  integer,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { desc, relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }),
    targetId: varchar("target_id", { length: 100 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgCreatedIdx: index("admin_audit_log_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    orgActionIdx: index("admin_audit_log_org_action_idx").on(
      table.organizationId,
      table.action,
      table.createdAt
    ),
    // Backs `AuditLogService.list`: WHERE org=? AND id < ? ORDER BY id DESC.
    orgIdDescIdx: index("admin_audit_log_org_id_desc_idx").on(
      table.organizationId,
      desc(table.id)
    ),
  })
);

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [adminAuditLog.organizationId],
    references: [organizations.id],
  }),
  actor: one(users, {
    fields: [adminAuditLog.actorUserId],
    references: [users.id],
  }),
}));

export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLogRow = typeof adminAuditLog.$inferInsert;
