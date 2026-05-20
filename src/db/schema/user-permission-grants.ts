/*
 * User permission grants
 *
 * - Per-user permission overrides on top of role defaults.
 * - Admins grant individual users specific capabilities (e.g. "cases.assign",
 *   "cases.viewAll") without changing their role.
 * - Scoped by organization so grants do not leak when a user moves orgs.
 */

import {
  pgTable,
  serial,
  integer,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

export const userPermissionGrants = pgTable(
  "user_permission_grants",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    permission: varchar("permission", { length: 100 }).notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqGrant: uniqueIndex("user_permission_grants_uniq_idx").on(
      table.userId,
      table.organizationId,
      table.permission
    ),
    userOrgIdx: index("user_permission_grants_user_org_idx").on(
      table.userId,
      table.organizationId
    ),
  })
);

export const userPermissionGrantsRelations = relations(
  userPermissionGrants,
  ({ one }) => ({
    user: one(users, {
      fields: [userPermissionGrants.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [userPermissionGrants.organizationId],
      references: [organizations.id],
    }),
    granter: one(users, {
      fields: [userPermissionGrants.grantedBy],
      references: [users.id],
    }),
  })
);

export type UserPermissionGrant = typeof userPermissionGrants.$inferSelect;
export type NewUserPermissionGrant =
  typeof userPermissionGrants.$inferInsert;
