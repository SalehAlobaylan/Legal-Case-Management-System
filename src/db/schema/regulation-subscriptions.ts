import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  varchar,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";
import { regulations } from "./regulations";

export const regulationSubscriptions = pgTable(
  "regulation_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    subscribedVia: varchar("subscribed_via", { length: 50 })
      .default("manual")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userRegUnique: uniqueIndex("reg_sub_user_reg_unique_idx").on(
      table.userId,
      table.regulationId
    ),
    orgActiveIdx: index("reg_sub_org_active_idx").on(
      table.organizationId,
      table.isActive
    ),
    regulationIdx: index("reg_sub_regulation_idx").on(table.regulationId),
  })
);

export const regulationSubscriptionsRelations = relations(
  regulationSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [regulationSubscriptions.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [regulationSubscriptions.organizationId],
      references: [organizations.id],
    }),
    regulation: one(regulations, {
      fields: [regulationSubscriptions.regulationId],
      references: [regulations.id],
    }),
  })
);

export type RegulationSubscription =
  typeof regulationSubscriptions.$inferSelect;
export type NewRegulationSubscription =
  typeof regulationSubscriptions.$inferInsert;
