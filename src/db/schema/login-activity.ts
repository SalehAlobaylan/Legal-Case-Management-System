/*
 * Login Activity schema
 *
 * Tracks user login sessions with device, browser, IP, and location info.
 */

import {
  pgTable,
  serial,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const loginActivity = pgTable("login_activity", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  device: varchar("device", { length: 255 }).notNull(),
  browser: varchar("browser", { length: 100 }),
  ip: varchar("ip", { length: 45 }).notNull(),
  location: varchar("location", { length: 255 }),
  loginAt: timestamp("login_at").defaultNow().notNull(),
});

export const loginActivityRelations = relations(loginActivity, ({ one }) => ({
  user: one(users, {
    fields: [loginActivity.userId],
    references: [users.id],
  }),
}));

export type LoginActivity = typeof loginActivity.$inferSelect;
export type NewLoginActivity = typeof loginActivity.$inferInsert;
