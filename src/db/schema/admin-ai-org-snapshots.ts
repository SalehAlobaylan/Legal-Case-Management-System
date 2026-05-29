/*
 * Admin AI org intelligence snapshots
 *
 * - One "latest" AI intelligence snapshot per org (org-scoped, upserted on
 *   refresh). Holds the executive summary, aggregate risk counts, workload
 *   signals, and a pointer to the latest AI evaluation quality metrics.
 * - Read by the admin "AI Intelligence" tab so the view loads without
 *   recomputing. `generatedAt` drives the "last refreshed" indicator.
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export interface AdminAiOrgSummary {
  headline: string;
  bullets: string[];
}

export const adminAiOrgSnapshots = pgTable(
  "admin_ai_org_snapshots",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    summary: jsonb("summary")
      .$type<AdminAiOrgSummary>()
      .default({ headline: "", bullets: [] })
      .notNull(),
    aggregateRisk: jsonb("aggregate_risk")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    workloadSignals: jsonb("workload_signals")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    qualityMetrics: jsonb("quality_metrics")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    method: varchar("method", { length: 120 }),
    confidence: varchar("confidence", { length: 20 }).default("medium").notNull(),
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // One snapshot per org — refresh upserts on this.
    orgUnique: uniqueIndex("admin_ai_org_snapshots_org_uidx").on(
      table.organizationId
    ),
  })
);

export const adminAiOrgSnapshotsRelations = relations(
  adminAiOrgSnapshots,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [adminAiOrgSnapshots.organizationId],
      references: [organizations.id],
    }),
  })
);

export type AdminAiOrgSnapshotRow = typeof adminAiOrgSnapshots.$inferSelect;
export type NewAdminAiOrgSnapshotRow = typeof adminAiOrgSnapshots.$inferInsert;
