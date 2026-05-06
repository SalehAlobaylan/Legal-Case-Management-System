import {
  pgTable,
  serial,
  integer,
  decimal,
  boolean,
  text,
  varchar,
  timestamp,
  uniqueIndex,
  index,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { cases } from "./cases";
import { legalSources } from "./legal-sources";
import { users } from "./users";

/**
 * Generalized case ↔ legal-source link table.
 * Supersedes case_regulation_links for new ingestion paths.
 *
 * The legacy case_regulation_links table is preserved for now so existing
 * code continues to function during the transition. New AI suggestions
 * (regulations, judicial decisions, gov data, web sources) should write
 * here instead.
 */

export const caseSourceLinkMethodEnum = [
  "ai",
  "manual",
  "hybrid",
  "tavily_search",
  "curator",
] as const;

export const caseSourceLinks = pgTable(
  "case_source_links",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .references(() => cases.id, { onDelete: "cascade" })
      .notNull(),
    legalSourceId: integer("legal_source_id")
      .references(() => legalSources.id, { onDelete: "cascade" })
      .notNull(),

    // --- Scoring ---
    // raw model output (semantic similarity)
    relevanceScore: decimal("relevance_score", { precision: 5, scale: 4 }),
    // relevanceScore × trust_tier_multiplier — used for ranking
    trustWeightedScore: decimal("trust_weighted_score", {
      precision: 5,
      scale: 4,
    }),

    method: varchar("method", { length: 32 })
      .$type<(typeof caseSourceLinkMethodEnum)[number]>()
      .default("ai")
      .notNull(),

    pipelineStage: varchar("pipeline_stage", { length: 64 }), // e.g. "composite", "rerank", "llm_verified"

    // --- Verification by lawyer/curator ---
    verified: boolean("verified").default(false).notNull(),
    verifiedBy: uuid("verified_by").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at"),

    dismissed: boolean("dismissed").default(false).notNull(),
    dismissedBy: uuid("dismissed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    dismissedAt: timestamp("dismissed_at"),
    dismissReason: text("dismiss_reason"),

    // --- Explanation / evidence (mirrors case_regulation_links pattern) ---
    evidenceSources: text("evidence_sources").default("[]").notNull(),
    matchExplanation: jsonb("match_explanation")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    matchedWithDocuments: boolean("matched_with_documents")
      .default(false)
      .notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseSourceUniqueIdx: uniqueIndex("case_source_unique_idx").on(
      table.caseId,
      table.legalSourceId
    ),
    caseScoreIdx: index("case_source_score_idx").on(
      table.caseId,
      table.trustWeightedScore
    ),
    sourceIdx: index("case_source_source_idx").on(table.legalSourceId),
    pendingVerificationIdx: index("case_source_pending_verify_idx").on(
      table.verified,
      table.dismissed,
      table.method
    ),
  })
);

export const caseSourceLinksRelations = relations(
  caseSourceLinks,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseSourceLinks.caseId],
      references: [cases.id],
    }),
    legalSource: one(legalSources, {
      fields: [caseSourceLinks.legalSourceId],
      references: [legalSources.id],
    }),
    verifier: one(users, {
      fields: [caseSourceLinks.verifiedBy],
      references: [users.id],
    }),
    dismisser: one(users, {
      fields: [caseSourceLinks.dismissedBy],
      references: [users.id],
    }),
  })
);

export type CaseSourceLink = typeof caseSourceLinks.$inferSelect;
export type NewCaseSourceLink = typeof caseSourceLinks.$inferInsert;
export type CaseSourceLinkMethod = (typeof caseSourceLinkMethodEnum)[number];
