/*
 * Notification Preferences schema
 *
 * - Defines the `notification_preferences` table for storing per-user notification settings.
 * - Covers channel toggles, category toggles, quiet hours, and digest options.
 */

import {
  pgTable,
  serial,
  uuid,
  boolean,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const digestFrequencyEnum = ["daily", "weekly"] as const;

export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),

  // Channel toggles
  emailAlerts: boolean("email_alerts").default(true).notNull(),
  pushNotifications: boolean("push_notifications").default(true).notNull(),

  // Category toggles
  aiSuggestions: boolean("ai_suggestions").default(true).notNull(),
  regulationUpdates: boolean("regulation_updates").default(true).notNull(),
  caseUpdates: boolean("case_updates").default(true).notNull(),
  systemAlerts: boolean("system_alerts").default(true).notNull(),

  // Quiet hours
  quietHoursEnabled: boolean("quiet_hours_enabled").default(false).notNull(),
  quietHoursStart: varchar("quiet_hours_start", { length: 5 }).default("22:00"),
  quietHoursEnd: varchar("quiet_hours_end", { length: 5 }).default("07:00"),

  // Digest
  digestEnabled: boolean("digest_enabled").default(false).notNull(),
  digestFrequency: varchar("digest_frequency", { length: 10 })
    .$type<(typeof digestFrequencyEnum)[number]>()
    .default("daily"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.userId],
      references: [users.id],
    }),
  })
);

export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreferences.$inferInsert;
export type DigestFrequency = (typeof digestFrequencyEnum)[number];
