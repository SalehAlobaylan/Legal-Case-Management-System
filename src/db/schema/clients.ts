/*
 * Clients schema
 *
 * - Defines the `clients` table for managing legal clients.
 * - Each client belongs to an organization.
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export const clientTypeEnum = [
  "individual",
  "corporate",
  "sme",
  "group",
] as const;

export const clientStatusEnum = ["active", "inactive"] as const;

export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).$type<
      (typeof clientTypeEnum)[number]
    >(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    address: text("address"),
    notes: text("notes"),
    status: varchar("status", { length: 50 })
      .$type<(typeof clientStatusEnum)[number]>()
      .default("active")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("clients_org_idx").on(table.organizationId),
    statusIdx: index("clients_status_idx").on(table.status),
  })
);

export const clientsRelations = relations(clients, ({ one }) => ({
  organization: one(organizations, {
    fields: [clients.organizationId],
    references: [organizations.id],
  }),
}));

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientType = (typeof clientTypeEnum)[number];
export type ClientStatus = (typeof clientStatusEnum)[number];
