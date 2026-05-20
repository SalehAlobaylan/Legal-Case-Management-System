import {
  pgTable,
  serial,
  varchar,
  timestamp,
  boolean,
  uuid,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

/*
 * OrgSettings — the shape stored in `organizations.settings` (jsonb).
 *
 * `privacy.*` flags gate cross-lawyer data sharing. The matching grantable
 * permissions (in src/routes/settings/index.ts:GRANTABLE_PERMISSIONS) let
 * admins exempt specific users.
 */
export interface OrgPrivacySettings {
  /** Restrict per-document fetch endpoints to the case's assignee. */
  documents?: boolean;
  /** Restrict client list to clients linked to the caller's cases. */
  clients?: boolean;
  /** Hide GET /api/settings/team from non-admins. */
  teamDirectory?: boolean;
  /** Require admin (or `delegated.cases.close`) to close a case. */
  adminClosureRequired?: boolean;
}

export interface OrgSettings {
  privacy?: OrgPrivacySettings;
  // Forward-compat: anything else admins eventually store here.
  [k: string]: unknown;
}

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
    restrictCaseVisibility: boolean("restrict_case_visibility")
      .default(false)
      .notNull(),
    settings: jsonb("settings").$type<OrgSettings>().default({}).notNull(),
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
