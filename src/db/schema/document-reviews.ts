import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  text,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { documents } from "./documents";
import { users } from "./users";

export const documentReviewStatusEnum = [
  "pending",
  "in_review",
  "approved",
  "rejected",
] as const;

export const documentReviews = pgTable(
  "document_reviews",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    documentId: integer("document_id")
      .references(() => documents.id, { onDelete: "cascade" })
      .notNull(),
    status: varchar("status", { length: 20 })
      .$type<(typeof documentReviewStatusEnum)[number]>()
      .default("pending")
      .notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("document_reviews_org_idx").on(table.organizationId),
    documentIdx: index("document_reviews_document_idx").on(table.documentId),
    statusIdx: index("document_reviews_status_idx").on(table.status),
    orgDocumentUnique: uniqueIndex("document_reviews_org_document_unique").on(
      table.organizationId,
      table.documentId
    ),
  })
);

export const documentReviewsRelations = relations(documentReviews, ({ one }) => ({
  organization: one(organizations, {
    fields: [documentReviews.organizationId],
    references: [organizations.id],
  }),
  document: one(documents, {
    fields: [documentReviews.documentId],
    references: [documents.id],
  }),
  reviewer: one(users, {
    fields: [documentReviews.reviewedBy],
    references: [users.id],
  }),
}));

export type DocumentReview = typeof documentReviews.$inferSelect;
export type NewDocumentReview = typeof documentReviews.$inferInsert;
