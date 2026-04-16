import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  jsonb,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const aiEvaluationRunStatusEnum = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export const aiEvaluationRuns = pgTable(
  "ai_evaluation_runs",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 20 })
      .$type<(typeof aiEvaluationRunStatusEnum)[number]>()
      .default("queued")
      .notNull(),
    configJson: jsonb("config_json")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    summaryJson: jsonb("summary_json")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    errorMessage: varchar("error_message", { length: 1000 }),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgCreatedIdx: index("ai_eval_runs_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
  })
);

export const aiEvaluationRunsRelations = relations(aiEvaluationRuns, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiEvaluationRuns.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [aiEvaluationRuns.createdBy],
    references: [users.id],
  }),
}));

export type AIEvaluationRun = typeof aiEvaluationRuns.$inferSelect;
export type NewAIEvaluationRun = typeof aiEvaluationRuns.$inferInsert;
