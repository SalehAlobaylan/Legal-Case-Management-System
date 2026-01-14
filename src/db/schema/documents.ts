/*
 * Documents schema
 *
 * - Defines the `documents` table for storing case attachments/files.
 * - Each document belongs to a case and is uploaded by a user.
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cases } from "./cases";
import { users } from "./users";

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .references(() => cases.id, { onDelete: "cascade" })
      .notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    filePath: text("file_path").notNull(),
    fileSize: integer("file_size"),
    mimeType: varchar("mime_type", { length: 100 }),
    uploadedBy: uuid("uploaded_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("documents_case_idx").on(table.caseId),
    uploadedByIdx: index("documents_uploaded_by_idx").on(table.uploadedBy),
  })
);

export const documentsRelations = relations(documents, ({ one }) => ({
  case: one(cases, {
    fields: [documents.caseId],
    references: [cases.id],
  }),
  uploader: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
}));

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
