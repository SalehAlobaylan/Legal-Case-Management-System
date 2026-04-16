import {
  pgTable,
  serial,
  integer,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { regulations } from "./regulations";
import { users } from "./users";

export const aiEvaluationLabels = pgTable(
  "ai_evaluation_labels",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    caseId: integer("case_id")
      .references(() => cases.id, { onDelete: "cascade" })
      .notNull(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgCaseRegUnique: uniqueIndex("ai_eval_labels_org_case_reg_unique").on(
      table.organizationId,
      table.caseId,
      table.regulationId
    ),
    orgCaseIdx: index("ai_eval_labels_org_case_idx").on(
      table.organizationId,
      table.caseId
    ),
  })
);

export const aiEvaluationLabelsRelations = relations(
  aiEvaluationLabels,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [aiEvaluationLabels.organizationId],
      references: [organizations.id],
    }),
    case: one(cases, {
      fields: [aiEvaluationLabels.caseId],
      references: [cases.id],
    }),
    regulation: one(regulations, {
      fields: [aiEvaluationLabels.regulationId],
      references: [regulations.id],
    }),
    creator: one(users, {
      fields: [aiEvaluationLabels.createdBy],
      references: [users.id],
    }),
  })
);

export type AIEvaluationLabel = typeof aiEvaluationLabels.$inferSelect;
export type NewAIEvaluationLabel = typeof aiEvaluationLabels.$inferInsert;
