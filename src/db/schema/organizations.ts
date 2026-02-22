import {
  pgTable,
  serial,
  varchar,
  timestamp,
  boolean,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const organizations = pgTable(
  "organizations",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    country: varchar("country", { length: 2 }).default("SA").notNull(),
    subscriptionTier: varchar("subscription_tier", { length: 50 }).default("free").notNull(),
    licenseNumber: varchar("license_number", { length: 100 }).unique(),
    contactInfo: varchar("contact_info", { length: 500 }),
    isPersonal: boolean("is_personal").default(false).notNull(),
    personalOwnerUserId: uuid("personal_owner_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    isPersonalIdx: index("organizations_is_personal_idx").on(table.isPersonal),
    personalOwnerIdx: index("organizations_personal_owner_idx").on(
      table.personalOwnerUserId
    ),
  })
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
