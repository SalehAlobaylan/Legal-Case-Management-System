import {
  pgTable,
  serial,
  integer,
  real,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { aiEvaluationRuns } from "./ai-evaluation-runs";
import { cases } from "./cases";

export const aiEvaluationRunCases = pgTable(
  "ai_evaluation_run_cases",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .references(() => aiEvaluationRuns.id, { onDelete: "cascade" })
      .notNull(),
    caseId: integer("case_id")
      .references(() => cases.id, { onDelete: "cascade" })
      .notNull(),
    totalRelevant: integer("total_relevant").default(0).notNull(),
    recallAt1: real("recall_at_1").default(0).notNull(),
    recallAt3: real("recall_at_3").default(0).notNull(),
    recallAt5: real("recall_at_5").default(0).notNull(),
    precisionAt1: real("precision_at_1").default(0).notNull(),
    precisionAt3: real("precision_at_3").default(0).notNull(),
    precisionAt5: real("precision_at_5").default(0).notNull(),
    reciprocalRank: real("reciprocal_rank").default(0).notNull(),
    ndcgAt5: real("ndcg_at_5").default(0).notNull(),
    top5ScoreStddev: real("top5_score_stddev").default(0).notNull(),
    diagnosticsJson: jsonb("diagnostics_json")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runCaseUnique: index("ai_eval_run_cases_run_case_idx").on(
      table.runId,
      table.caseId
    ),
    caseIdx: index("ai_eval_run_cases_case_idx").on(table.caseId),
  })
);

export const aiEvaluationRunCasesRelations = relations(
  aiEvaluationRunCases,
  ({ one }) => ({
    run: one(aiEvaluationRuns, {
      fields: [aiEvaluationRunCases.runId],
      references: [aiEvaluationRuns.id],
    }),
    case: one(cases, {
      fields: [aiEvaluationRunCases.caseId],
      references: [cases.id],
    }),
  })
);

export type AIEvaluationRunCase = typeof aiEvaluationRunCases.$inferSelect;
export type NewAIEvaluationRunCase = typeof aiEvaluationRunCases.$inferInsert;
