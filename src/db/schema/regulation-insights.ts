import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { regulations } from "./regulations";
import { regulationVersions } from "./regulation-versions";
import { users } from "./users";

export const regulationInsightStatusEnum = [
  "pending",
  "processing",
  "ready",
  "failed",
] as const;

export const regulationInsights = pgTable(
  "regulation_insights",
  {
    id: serial("id").primaryKey(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    regulationVersionId: integer("regulation_version_id")
      .references(() => regulationVersions.id, { onDelete: "cascade" })
      .notNull(),
    languageCode: varchar("language_code", { length: 8 })
      .default("ar")
      .notNull(),
    status: varchar("status", { length: 50 })
      .$type<(typeof regulationInsightStatusEnum)[number]>()
      .default("pending")
      .notNull(),
    summary: text("summary"),
    obligationsJson: text("obligations_json").default("[]").notNull(),
    riskFlagsJson: text("risk_flags_json").default("[]").notNull(),
    keyDatesJson: text("key_dates_json").default("[]").notNull(),
    citationsJson: text("citations_json").default("[]").notNull(),
    sourceTextHash: varchar("source_text_hash", { length: 64 }),
    method: varchar("method", { length: 120 }),
    errorCode: varchar("error_code", { length: 120 }),
    warningsJson: text("warnings_json"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at"),
    nextRetryAt: timestamp("next_retry_at").defaultNow().notNull(),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    regVersionLanguageUnique: uniqueIndex(
      "regulation_insights_reg_version_lang_uidx"
    ).on(table.regulationVersionId, table.languageCode),
    statusRetryIdx: index("regulation_insights_status_retry_idx").on(
      table.status,
      table.nextRetryAt
    ),
    regulationLanguageUpdatedIdx: index(
      "regulation_insights_reg_lang_updated_idx"
    ).on(table.regulationId, table.languageCode, table.updatedAt),
  })
);

export const regulationInsightsRelations = relations(
  regulationInsights,
  ({ one }) => ({
    regulation: one(regulations, {
      fields: [regulationInsights.regulationId],
      references: [regulations.id],
    }),
    regulationVersion: one(regulationVersions, {
      fields: [regulationInsights.regulationVersionId],
      references: [regulationVersions.id],
    }),
    triggeredByUser: one(users, {
      fields: [regulationInsights.triggeredByUserId],
      references: [users.id],
    }),
  })
);

export type RegulationInsight = typeof regulationInsights.$inferSelect;
export type NewRegulationInsight = typeof regulationInsights.$inferInsert;
export type RegulationInsightStatus =
  (typeof regulationInsightStatusEnum)[number];
