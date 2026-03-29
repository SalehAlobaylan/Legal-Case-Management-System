/*
 * AI Settings schema
 *
 * - Defines the `ai_settings` table for storing per-organization AI pipeline configuration.
 * - Provides UI-driven control over AI features instead of environment variables.
 * - All fields default to false/null so existing behavior is preserved.
 */

import {
  pgTable,
  serial,
  integer,
  boolean,
  varchar,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export const aiSettings = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull()
    .unique(),

  // --- LLM Verification (Gemini) ---
  llmVerificationEnabled: boolean("llm_verification_enabled")
    .default(false)
    .notNull(),

  // --- Cross-encoder reranking ---
  crossEncoderEnabled: boolean("cross_encoder_enabled")
    .default(false)
    .notNull(),

  // --- HyDE (Hypothetical Document Embeddings) ---
  hydeEnabled: boolean("hyde_enabled").default(false).notNull(),

  // --- ColBERT / late-interaction ---
  colbertEnabled: boolean("colbert_enabled").default(false).notNull(),

  // --- Agentic retrieval ---
  agenticRetrievalEnabled: boolean("agentic_retrieval_enabled")
    .default(false)
    .notNull(),

  // --- Scoring weights ---
  semanticWeight: real("semantic_weight").default(0.55),
  supportWeight: real("support_weight").default(0.20),
  lexicalWeight: real("lexical_weight").default(0.15),
  categoryWeight: real("category_weight").default(0.10),

  // --- Thresholds ---
  minFinalScore: real("min_final_score").default(0.45),
  minPairScore: real("min_pair_score").default(0.40),

  // --- Model selection ---
  geminiModel: varchar("gemini_model", { length: 100 }).default(
    "gemini-2.0-flash"
  ),

  // --- Top-N candidates for pipeline stages ---
  crossEncoderTopN: integer("cross_encoder_top_n").default(15),
  colbertTopN: integer("colbert_top_n").default(15),
  geminiTopNCandidates: integer("gemini_top_n_candidates").default(15),

  // --- Agentic retrieval tuning ---
  agenticMaxRounds: integer("agentic_max_rounds").default(2),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiSettingsRelations = relations(aiSettings, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiSettings.organizationId],
    references: [organizations.id],
  }),
}));

export type AISettingsRow = typeof aiSettings.$inferSelect;
export type NewAISettingsRow = typeof aiSettings.$inferInsert;
