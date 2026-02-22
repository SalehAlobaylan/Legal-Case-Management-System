import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { organizations } from "./organizations";
import { users, userRoleEnum } from "./users";

export const invitationStatusEnum = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 })
      .$type<(typeof userRoleEnum)[number]>()
      .notNull(),
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 })
      .$type<(typeof invitationStatusEnum)[number]>()
      .default("pending")
      .notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    codeHashUnique: uniqueIndex("org_invites_code_hash_unique").on(table.codeHash),
    orgStatusIdx: index("org_invites_org_status_idx").on(
      table.organizationId,
      table.status
    ),
    emailStatusIdx: index("org_invites_email_status_idx").on(
      table.email,
      table.status
    ),
    pendingPerEmailIdx: uniqueIndex("org_invites_pending_unique_idx")
      .on(table.organizationId, table.email)
      .where(eq(table.status, "pending")),
  })
);

export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation = typeof organizationInvitations.$inferInsert;
export type InvitationStatus = (typeof invitationStatusEnum)[number];
