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
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const clientTypeEnum = [
  "individual",
  "corporate",
  "sme",
  "group",
] as const;

export const clientLeadStatusEnum = [
  "lead",
  "contacted",
  "consultation",
  "retained",
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
    leadStatus: varchar("lead_status", { length: 50 })
      .$type<(typeof clientLeadStatusEnum)[number]>()
      .default("lead")
      .notNull(),
    tags: jsonb("tags").$type<string[]>().default([]),
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

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [clients.organizationId],
    references: [organizations.id],
  }),
  activities: many(clientActivities),
  documents: many(clientDocuments),
}));

export const activityTypeEnum = ["call", "email", "meeting", "system", "note"] as const;

export const clientActivities = pgTable("client_activities", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .references(() => clients.id, { onDelete: "cascade" })
    .notNull(),
  type: varchar("type", { length: 50 }).$type<(typeof activityTypeEnum)[number]>().notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clientActivitiesRelations = relations(clientActivities, ({ one }) => ({
  client: one(clients, {
    fields: [clientActivities.clientId],
    references: [clients.id],
  }),
  user: one(users, {
    fields: [clientActivities.userId],
    references: [users.id],
  }),
}));

export const clientDocuments = pgTable("client_documents", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .references(() => clients.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: varchar("file_type", { length: 100 }),
  fileSize: integer("file_size"),
  uploadedById: uuid("uploaded_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clientDocumentsRelations = relations(clientDocuments, ({ one }) => ({
  client: one(clients, {
    fields: [clientDocuments.clientId],
    references: [clients.id],
  }),
  uploadedBy: one(users, {
    fields: [clientDocuments.uploadedById],
    references: [users.id],
  }),
}));

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientType = (typeof clientTypeEnum)[number];
export type ClientLeadStatus = (typeof clientLeadStatusEnum)[number];
export type ClientStatus = (typeof clientStatusEnum)[number];

export type ClientActivity = typeof clientActivities.$inferSelect;
export type NewClientActivity = typeof clientActivities.$inferInsert;

export type ClientDocument = typeof clientDocuments.$inferSelect;
export type NewClientDocument = typeof clientDocuments.$inferInsert;
