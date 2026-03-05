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

export const regulationAmendmentImpactStatusEnum = [
  "pending",
  "processing",
  "ready",
  "failed",
] as const;

export const regulationAmendmentImpacts = pgTable(
  "regulation_amendment_impacts",
  {
    id: serial("id").primaryKey(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    fromVersionNumber: integer("from_version_number").notNull(),
    toVersionNumber: integer("to_version_number").notNull(),
    languageCode: varchar("language_code", { length: 8 })
      .default("ar")
      .notNull(),
    fromVersionId: integer("from_version_id")
      .references(() => regulationVersions.id, { onDelete: "cascade" })
      .notNull(),
    toVersionId: integer("to_version_id")
      .references(() => regulationVersions.id, { onDelete: "cascade" })
      .notNull(),
    status: varchar("status", { length: 50 })
      .$type<(typeof regulationAmendmentImpactStatusEnum)[number]>()
      .default("pending")
      .notNull(),
    whatChangedJson: text("what_changed_json").default("[]").notNull(),
    legalImpactJson: text("legal_impact_json").default("[]").notNull(),
    affectedPartiesJson: text("affected_parties_json").default("[]").notNull(),
    citationsJson: text("citations_json").default("[]").notNull(),
    diffFingerprintHash: varchar("diff_fingerprint_hash", { length: 64 }),
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
    pairLanguageUnique: uniqueIndex(
      "reg_amendment_impacts_pair_lang_uidx"
    ).on(
      table.regulationId,
      table.fromVersionNumber,
      table.toVersionNumber,
      table.languageCode
    ),
    statusRetryIdx: index("reg_amendment_impacts_status_retry_idx").on(
      table.status,
      table.nextRetryAt
    ),
    regulationUpdatedIdx: index("reg_amendment_impacts_reg_updated_idx").on(
      table.regulationId,
      table.updatedAt
    ),
  })
);

export const regulationAmendmentImpactsRelations = relations(
  regulationAmendmentImpacts,
  ({ one }) => ({
    regulation: one(regulations, {
      fields: [regulationAmendmentImpacts.regulationId],
      references: [regulations.id],
    }),
    fromVersion: one(regulationVersions, {
      fields: [regulationAmendmentImpacts.fromVersionId],
      references: [regulationVersions.id],
      relationName: "amendment_impact_from_version",
    }),
    toVersion: one(regulationVersions, {
      fields: [regulationAmendmentImpacts.toVersionId],
      references: [regulationVersions.id],
      relationName: "amendment_impact_to_version",
    }),
    triggeredByUser: one(users, {
      fields: [regulationAmendmentImpacts.triggeredByUserId],
      references: [users.id],
    }),
  })
);

export type RegulationAmendmentImpact =
  typeof regulationAmendmentImpacts.$inferSelect;
export type NewRegulationAmendmentImpact =
  typeof regulationAmendmentImpacts.$inferInsert;
export type RegulationAmendmentImpactStatus =
  (typeof regulationAmendmentImpactStatusEnum)[number];
