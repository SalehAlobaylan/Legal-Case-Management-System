import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const caseTypeEnum = [
  "criminal",
  "civil",
  "commercial",
  "labor",
  "family",
  "administrative",
] as const;

export const caseStatusEnum = [
  "open",
  "in_progress",
  "pending_hearing",
  "closed",
  "archived",
] as const;

export const cases = pgTable(
  "cases",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    caseNumber: varchar("case_number", { length: 100 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    caseType: varchar("case_type", { length: 100 })
      .$type<(typeof caseTypeEnum)[number]>()
      .notNull(),
    status: varchar("status", { length: 50 })
      .$type<(typeof caseStatusEnum)[number]>()
      .default("open")
      .notNull(),
    clientInfo: text("client_info"),
    assignedLawyerId: integer("assigned_lawyer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    courtJurisdiction: varchar("court_jurisdiction", { length: 255 }),
    filingDate: date("filing_date"),
    nextHearing: timestamp("next_hearing"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgCaseNumberIdx: index("cases_org_case_number_idx").on(
      table.organizationId,
      table.caseNumber
    ),
    assignedLawyerIdx: index("cases_assigned_lawyer_idx").on(
      table.assignedLawyerId
    ),
    statusIdx: index("cases_status_idx").on(table.status),
  })
);

export const casesRelations = relations(cases, ({ one }) => ({
  organization: one(organizations, {
    fields: [cases.organizationId],
    references: [organizations.id],
  }),
  assignedLawyer: one(users, {
    fields: [cases.assignedLawyerId],
    references: [users.id],
  }),
}));

export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type CaseType = (typeof caseTypeEnum)[number];
export type CaseStatus = (typeof caseStatusEnum)[number];


