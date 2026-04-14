import {
  pgTable,
  serial,
  integer,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { clients } from "./clients";

export const clientPortalAccountStatusEnum = ["invited", "active", "suspended"] as const;

export const clientPortalAccounts = pgTable(
  "client_portal_accounts",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    status: varchar("status", { length: 32 })
      .$type<(typeof clientPortalAccountStatusEnum)[number]>()
      .default("invited")
      .notNull(),
    invitedAt: timestamp("invited_at").defaultNow().notNull(),
    activatedAt: timestamp("activated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgUserUnique: uniqueIndex("client_portal_accounts_org_user_unique").on(
      table.organizationId,
      table.userId
    ),
    orgClientUnique: uniqueIndex("client_portal_accounts_org_client_unique").on(
      table.organizationId,
      table.clientId
    ),
    userIdx: index("client_portal_accounts_user_idx").on(table.userId),
    clientIdx: index("client_portal_accounts_client_idx").on(table.clientId),
  })
);

export const clientPortalAccountsRelations = relations(
  clientPortalAccounts,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [clientPortalAccounts.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [clientPortalAccounts.userId],
      references: [users.id],
    }),
    client: one(clients, {
      fields: [clientPortalAccounts.clientId],
      references: [clients.id],
    }),
  })
);

export type ClientPortalAccount = typeof clientPortalAccounts.$inferSelect;
export type NewClientPortalAccount = typeof clientPortalAccounts.$inferInsert;
