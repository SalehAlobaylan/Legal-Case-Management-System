/*
 * User Activities schema
 *
 * - Tracks user activity for the profile activity feed.
 * - Types: case, regulation, document, client
 * - Actions: created, updated, closed, reviewed, uploaded
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const activityTypeEnum = [
  "case",
  "regulation",
  "document",
  "client",
] as const;

export const activityActionEnum = [
  "created",
  "updated",
  "closed",
  "reviewed",
  "uploaded",
] as const;

export const userActivities = pgTable(
  "user_activities",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 50 })
      .$type<(typeof activityTypeEnum)[number]>()
      .notNull(),
    action: varchar("action", { length: 50 })
      .$type<(typeof activityActionEnum)[number]>()
      .notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    referenceId: integer("reference_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("user_activities_user_idx").on(table.userId),
    createdAtIdx: index("user_activities_created_at_idx").on(table.createdAt),
  })
);

export const userActivitiesRelations = relations(userActivities, ({ one }) => ({
  user: one(users, {
    fields: [userActivities.userId],
    references: [users.id],
  }),
}));

export type UserActivity = typeof userActivities.$inferSelect;
export type NewUserActivity = typeof userActivities.$inferInsert;
export type ActivityType = (typeof activityTypeEnum)[number];
export type ActivityAction = (typeof activityActionEnum)[number];
