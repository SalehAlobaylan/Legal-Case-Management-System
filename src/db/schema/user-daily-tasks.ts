import {
  pgTable,
  serial,
  integer,
  uuid,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const userDailyTasks = pgTable(
  "user_daily_tasks",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    text: text("text").notNull(),
    completed: boolean("completed").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("user_daily_tasks_org_idx").on(table.organizationId),
    userIdx: index("user_daily_tasks_user_idx").on(table.userId),
    positionIdx: index("user_daily_tasks_position_idx").on(table.position),
  })
);

export const userDailyTasksRelations = relations(userDailyTasks, ({ one }) => ({
  organization: one(organizations, {
    fields: [userDailyTasks.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [userDailyTasks.userId],
    references: [users.id],
  }),
}));

export type UserDailyTask = typeof userDailyTasks.$inferSelect;
export type NewUserDailyTask = typeof userDailyTasks.$inferInsert;
