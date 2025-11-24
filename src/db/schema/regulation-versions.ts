import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { regulations } from "./regulations";

export const regulationVersions = pgTable(
  "regulation_versions",
  {
    id: serial("id").primaryKey(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    versionNumber: integer("version_number").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    rawHtml: text("raw_html"),
    artifactUri: varchar("artifact_uri", { length: 500 }),
    changesSummary: text("changes_summary"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    createdBy: varchar("created_by", { length: 50 })
      .default("system")
      .notNull(),
  },
  (table) => ({
    regVersionIdx: uniqueIndex("regulation_versions_reg_version_idx").on(
      table.regulationId,
      table.versionNumber
    ),
  })
);

export const regulationVersionsRelations = relations(
  regulationVersions,
  ({ one }) => ({
    regulation: one(regulations, {
      fields: [regulationVersions.regulationId],
      references: [regulations.id],
    }),
  })
);

export type RegulationVersion = typeof regulationVersions.$inferSelect;
export type NewRegulationVersion = typeof regulationVersions.$inferInsert;


