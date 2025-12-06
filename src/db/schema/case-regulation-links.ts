import {
  pgTable,
  serial,
  integer,
  decimal,
  boolean,
  varchar,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cases } from "./cases";
import { regulations } from "./regulations";
import { users } from "./users";

export const linkMethodEnum = ["ai", "manual", "hybrid"] as const;

export const caseRegulationLinks = pgTable(
  "case_regulation_links",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .references(() => cases.id, { onDelete: "cascade" })
      .notNull(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    similarityScore: decimal("similarity_score", { precision: 5, scale: 4 }),
    method: varchar("method", { length: 20 })
      .$type<(typeof linkMethodEnum)[number]>()
      .default("ai")
      .notNull(),
    verified: boolean("verified").default(false).notNull(),
    verifiedBy: uuid("verified_by").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    casRegUnique: uniqueIndex("case_regulation_unique_idx").on(
      table.caseId,
      table.regulationId
    ),
    scoreIdx: index("case_reg_score_idx").on(
      table.caseId,
      table.similarityScore
    ),
  })
);

export const caseRegulationLinksRelations = relations(
  caseRegulationLinks,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseRegulationLinks.caseId],
      references: [cases.id],
    }),
    regulation: one(regulations, {
      fields: [caseRegulationLinks.regulationId],
      references: [regulations.id],
    }),
    verifier: one(users, {
      fields: [caseRegulationLinks.verifiedBy],
      references: [users.id],
    }),
  })
);

export type CaseRegulationLink = typeof caseRegulationLinks.$inferSelect;
export type NewCaseRegulationLink = typeof caseRegulationLinks.$inferInsert;
export type LinkMethod = (typeof linkMethodEnum)[number];


