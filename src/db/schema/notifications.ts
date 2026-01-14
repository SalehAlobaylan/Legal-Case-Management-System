/*
 * Notifications schema
 *
 * - Defines the `notifications` table for storing user notifications/alerts.
 * - Used for AI suggestions, regulation updates, case updates, etc.
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { regulations } from "./regulations";

export const notificationTypeEnum = [
  "ai_suggestion",
  "regulation_update",
  "case_update",
  "system",
] as const;

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 50 })
      .$type<(typeof notificationTypeEnum)[number]>()
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message"),
    relatedCaseId: integer("related_case_id").references(() => cases.id, {
      onDelete: "set null",
    }),
    relatedRegulationId: integer("related_regulation_id").references(
      () => regulations.id,
      { onDelete: "set null" }
    ),
    read: boolean("read").default(false).notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("notifications_user_idx").on(table.userId),
    orgIdx: index("notifications_org_idx").on(table.organizationId),
    readIdx: index("notifications_read_idx").on(table.userId, table.read),
    createdIdx: index("notifications_created_idx").on(table.createdAt),
  })
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [notifications.organizationId],
    references: [organizations.id],
  }),
  relatedCase: one(cases, {
    fields: [notifications.relatedCaseId],
    references: [cases.id],
  }),
  relatedRegulation: one(regulations, {
    fields: [notifications.relatedRegulationId],
    references: [regulations.id],
  }),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationType = (typeof notificationTypeEnum)[number];
