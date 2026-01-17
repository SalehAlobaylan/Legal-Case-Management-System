/*
 * User Achievements schema
 *
 * - Stores achievements/awards for users.
 * - Displayed on the profile page.
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }),
    awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("user_achievements_user_idx").on(table.userId),
  })
);

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, {
    fields: [userAchievements.userId],
    references: [users.id],
  }),
}));

export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
