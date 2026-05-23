import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  timestamp,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { clients } from "./clients";

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

export type CaseStatus = (typeof caseStatusEnum)[number];

// "Terminal" statuses — the case has been resolved or shelved and most
// dashboards/queries exclude these from active workload.
// Mutable array (not `as const`) so Drizzle's `inArray` overload accepts it.
export const CLOSED_STATUSES: CaseStatus[] = ["closed", "archived"];

export function isClosedStatus(s: string | null | undefined): boolean {
  return s === "closed" || s === "archived";
}

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
    assignedLawyerId: uuid("assigned_lawyer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    clientId: integer("client_id").references(() => clients.id, {
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
    clientIdx: index("cases_client_idx").on(table.clientId),
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
  client: one(clients, {
    fields: [cases.clientId],
    references: [clients.id],
  }),
}));

export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type CaseType = (typeof caseTypeEnum)[number];

