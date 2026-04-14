import {
  pgTable,
  serial,
  integer,
  timestamp,
  varchar,
  text,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export const automationTriggerTypeEnum = ["client.status.changed"] as const;
export const automationActionTypeEnum = ["send_email", "send_whatsapp", "send_sms"] as const;

export const automationRules = pgTable(
  "automation_rules",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    triggerType: varchar("trigger_type", { length: 64 })
      .$type<(typeof automationTriggerTypeEnum)[number]>()
      .notNull(),
    triggerValue: varchar("trigger_value", { length: 128 }),
    actionType: varchar("action_type", { length: 32 })
      .$type<(typeof automationActionTypeEnum)[number]>()
      .notNull(),
    templateBody: text("template_body").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("automation_rules_org_idx").on(table.organizationId),
    triggerIdx: index("automation_rules_trigger_idx").on(table.triggerType),
  })
);

export const automationRulesRelations = relations(automationRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [automationRules.organizationId],
    references: [organizations.id],
  }),
}));

export type AutomationRule = typeof automationRules.$inferSelect;
export type NewAutomationRule = typeof automationRules.$inferInsert;
