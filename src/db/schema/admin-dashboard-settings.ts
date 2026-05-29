import {
  pgTable,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export const adminDashboardSettings = pgTable(
  "admin_dashboard_settings",
  {
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .primaryKey(),
    staleCaseDays: integer("stale_case_days").default(30).notNull(),
    hearingSoonDays: integer("hearing_soon_days").default(7).notNull(),
    workloadHighOpenCases: integer("workload_high_open_cases")
      .default(12)
      .notNull(),
    aiReviewHighCount: integer("ai_review_high_count").default(10).notNull(),
    monitorStaleMinutes: integer("monitor_stale_minutes")
      .default(360)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgUniqueIdx: uniqueIndex("admin_dashboard_settings_org_uidx").on(
      table.organizationId
    ),
  })
);

export const adminDashboardSettingsRelations = relations(
  adminDashboardSettings,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [adminDashboardSettings.organizationId],
      references: [organizations.id],
    }),
  })
);

export type AdminDashboardSettings =
  typeof adminDashboardSettings.$inferSelect;
export type NewAdminDashboardSettings =
  typeof adminDashboardSettings.$inferInsert;
