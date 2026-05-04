/*
 * Integrations schema
 *
 * - Defines integration connections per organization
 * - Stores encrypted credentials and non-secret config
 * - Supports outbound webhook endpoints
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const integrationStatusEnum = [
  "not_connected",
  "in_setup",
  "connected",
  "error",
  "coming_soon",
] as const;

export const integrations = pgTable(
  "integrations",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    provider: varchar("provider", { length: 60 }).notNull(),
    status: varchar("status", { length: 30 })
      .$type<(typeof integrationStatusEnum)[number]>()
      .default("not_connected")
      .notNull(),
    setupState: varchar("setup_state", { length: 120 }),
    displayName: varchar("display_name", { length: 120 }),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    credentialsEncrypted: text("credentials_encrypted"),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    connectedAt: timestamp("connected_at"),
    lastSyncAt: timestamp("last_sync_at"),
    errorMessage: varchar("error_message", { length: 1000 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgProviderUnique: uniqueIndex("integrations_org_provider_unique").on(
      table.organizationId,
      table.provider
    ),
    orgIdx: index("integrations_org_idx").on(table.organizationId),
    statusIdx: index("integrations_status_idx").on(table.status),
  })
);

export const integrationWebhookEndpoints = pgTable(
  "integration_webhook_endpoints",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    url: text("url").notNull(),
    secret: varchar("secret", { length: 200 }),
    events: jsonb("events").$type<string[]>().default([]),
    active: boolean("active").default(true).notNull(),
    lastDeliveredAt: timestamp("last_delivered_at"),
    lastStatusCode: integer("last_status_code"),
    lastError: varchar("last_error", { length: 1000 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("integration_webhooks_org_idx").on(table.organizationId),
    activeIdx: index("integration_webhooks_active_idx").on(table.active),
  })
);

export const integrationsRelations = relations(integrations, ({ one }) => ({
  organization: one(organizations, {
    fields: [integrations.organizationId],
    references: [organizations.id],
  }),
  connectedByUser: one(users, {
    fields: [integrations.connectedBy],
    references: [users.id],
  }),
}));

export const integrationWebhookEndpointsRelations = relations(
  integrationWebhookEndpoints,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [integrationWebhookEndpoints.organizationId],
      references: [organizations.id],
    }),
  })
);

export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type IntegrationWebhookEndpoint =
  typeof integrationWebhookEndpoints.$inferSelect;
export type NewIntegrationWebhookEndpoint =
  typeof integrationWebhookEndpoints.$inferInsert;
