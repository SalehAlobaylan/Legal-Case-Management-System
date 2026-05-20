/*
 * Organization announcements
 *
 * - Short messages an admin pins for the org. Surfaced as a banner on every
 *   team member's dashboard until the user dismisses it locally OR the admin
 *   retires/expires it server-side.
 * - Dismiss state is stored client-side in localStorage (no per-user table).
 */

import {
  pgTable,
  serial,
  integer,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const announcementSeverityEnum = [
  "info",
  "warning",
  "important",
] as const;

export const orgAnnouncements = pgTable(
  "org_announcements",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    severity: varchar("severity", { length: 20 })
      .$type<(typeof announcementSeverityEnum)[number]>()
      .default("info")
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgActiveIdx: index("org_announcements_org_active_idx").on(
      table.organizationId,
      table.isActive,
      table.createdAt
    ),
  })
);

export const orgAnnouncementsRelations = relations(
  orgAnnouncements,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [orgAnnouncements.organizationId],
      references: [organizations.id],
    }),
    createdBy: one(users, {
      fields: [orgAnnouncements.createdByUserId],
      references: [users.id],
    }),
  })
);

export type OrgAnnouncement = typeof orgAnnouncements.$inferSelect;
export type NewOrgAnnouncement = typeof orgAnnouncements.$inferInsert;
export type AnnouncementSeverity =
  (typeof announcementSeverityEnum)[number];
