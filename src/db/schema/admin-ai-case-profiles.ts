/*
 * Admin AI case risk profiles
 *
 * - One persisted AI risk profile per active case per org (org-scoped, upserted
 *   on refresh). Composes the deterministic command-center signals into an
 *   explainable score + evidence + recommended actions, plus an optional LLM
 *   rationale. Read by the admin "AI Intelligence" tab.
 * - Scores/evidence are authoritative (deterministic); `method` records whether
 *   the microservice (`heuristic_risk_v1`/`llm_risk_v1`) or the backend degraded
 *   fallback (`backend_fallback`) produced the profile.
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { desc, relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { cases } from "./cases";

export interface AdminAiCaseEvidence {
  signal: string;
  label: string;
  severity: string;
  contribution: number;
  detail?: string | null;
}

export interface AdminAiRecommendedAction {
  action: string;
  label: string;
  target?: string | null;
}

export const adminAiCaseProfiles = pgTable(
  "admin_ai_case_profiles",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    caseId: integer("case_id")
      .references(() => cases.id, { onDelete: "cascade" })
      .notNull(),
    score: integer("score").default(0).notNull(),
    urgency: varchar("urgency", { length: 20 }).default("low").notNull(),
    confidence: varchar("confidence", { length: 20 }).default("medium").notNull(),
    signals: jsonb("signals").$type<string[]>().default([]).notNull(),
    evidence: jsonb("evidence").$type<AdminAiCaseEvidence[]>().default([]).notNull(),
    recommendedActions: jsonb("recommended_actions")
      .$type<AdminAiRecommendedAction[]>()
      .default([])
      .notNull(),
    rationale: text("rationale"),
    method: varchar("method", { length: 120 }),
    modelMeta: jsonb("model_meta")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // One profile per case per org — refresh upserts on this.
    orgCaseUnique: uniqueIndex("admin_ai_case_profiles_org_case_uidx").on(
      table.organizationId,
      table.caseId
    ),
    // Backs the risk-ranked table: WHERE org=? ORDER BY score DESC.
    orgScoreIdx: index("admin_ai_case_profiles_org_score_idx").on(
      table.organizationId,
      desc(table.score)
    ),
  })
);

export const adminAiCaseProfilesRelations = relations(
  adminAiCaseProfiles,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [adminAiCaseProfiles.organizationId],
      references: [organizations.id],
    }),
    case: one(cases, {
      fields: [adminAiCaseProfiles.caseId],
      references: [cases.id],
    }),
  })
);

export type AdminAiCaseProfileRow = typeof adminAiCaseProfiles.$inferSelect;
export type NewAdminAiCaseProfileRow = typeof adminAiCaseProfiles.$inferInsert;
