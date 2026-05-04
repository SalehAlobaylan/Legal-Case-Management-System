import {
  pgTable,
  serial,
  integer,
  timestamp,
  varchar,
  jsonb,
  text,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export type IntakeFieldDef = {
  id: string;
  label: string;
  type:
    | "text"
    | "email"
    | "phone"
    | "textarea"
    | "select"
    | "checkbox"
    | "radio"
    | "date";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
};

export type IntakeFormSection = {
  id: string;
  titleEn?: string;
  titleAr?: string;
  layout?: "single" | "double" | "triple";
  order: number;
  fieldIds: string[];
};

export type IntakeFormTheme = {
  primaryColor: string;
  borderRadius: number;
  layoutDensity: "comfortable" | "compact" | "spacious";
};

export type IntakeFormLogicRule = {
  id: string;
  conditions: { fieldId: string; operator: string; value: string }[];
  action: "show" | "hide" | "require";
  targetFieldIds: string[];
};

export type IntakeFormSchema = {
  sections: IntakeFormSection[];
  logicRules: IntakeFormLogicRule[];
  theme?: IntakeFormTheme;
};

export const intakeForms = pgTable(
  "intake_forms",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    fieldsJson: jsonb("fields_json").$type<IntakeFieldDef[]>().default([]).notNull(),
    schema: jsonb("schema").$type<IntakeFormSchema | null>(),
    isActive: boolean("is_active").default(true).notNull(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("intake_forms_org_idx").on(table.organizationId),
  })
);

export const intakeSubmissions = pgTable(
  "intake_submissions",
  {
    id: serial("id").primaryKey(),
    intakeFormId: integer("intake_form_id")
      .references(() => intakeForms.id, { onDelete: "set null" }),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    source: varchar("source", { length: 64 }).default("public_form").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("intake_submissions_org_idx").on(table.organizationId),
    formIdx: index("intake_submissions_form_idx").on(table.intakeFormId),
  })
);

export const intakeFormsRelations = relations(intakeForms, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [intakeForms.organizationId],
    references: [organizations.id],
  }),
  submissions: many(intakeSubmissions),
}));

export const intakeSubmissionsRelations = relations(intakeSubmissions, ({ one }) => ({
  organization: one(organizations, {
    fields: [intakeSubmissions.organizationId],
    references: [organizations.id],
  }),
  intakeForm: one(intakeForms, {
    fields: [intakeSubmissions.intakeFormId],
    references: [intakeForms.id],
  }),
}));

export type IntakeForm = typeof intakeForms.$inferSelect;
export type NewIntakeForm = typeof intakeForms.$inferInsert;
export type IntakeSubmission = typeof intakeSubmissions.$inferSelect;
export type NewIntakeSubmission = typeof intakeSubmissions.$inferInsert;
