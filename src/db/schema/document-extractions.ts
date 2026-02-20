import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { documents } from "./documents";
import { cases } from "./cases";
import { organizations } from "./organizations";

export const documentExtractions = pgTable(
  "document_extractions",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .references(() => documents.id, { onDelete: "cascade" })
      .notNull(),
    caseId: integer("case_id")
      .references(() => cases.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    fileHash: varchar("file_hash", { length: 64 }),
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    extractedText: text("extracted_text"),
    normalizedTextHash: varchar("normalized_text_hash", { length: 64 }),
    extractionMethod: varchar("extraction_method", { length: 100 }),
    ocrProviderUsed: varchar("ocr_provider_used", { length: 50 }),
    errorCode: varchar("error_code", { length: 100 }),
    warningsJson: text("warnings_json"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at"),
    nextRetryAt: timestamp("next_retry_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    documentUnique: uniqueIndex("doc_extract_document_unique_idx").on(table.documentId),
    caseStatusIdx: index("doc_extract_case_status_idx").on(
      table.caseId,
      table.status
    ),
    orgRetryIdx: index("doc_extract_org_retry_idx").on(
      table.organizationId,
      table.status,
      table.nextRetryAt
    ),
  })
);

export const documentExtractionsRelations = relations(
  documentExtractions,
  ({ one }) => ({
    document: one(documents, {
      fields: [documentExtractions.documentId],
      references: [documents.id],
    }),
    case: one(cases, {
      fields: [documentExtractions.caseId],
      references: [cases.id],
    }),
    organization: one(organizations, {
      fields: [documentExtractions.organizationId],
      references: [organizations.id],
    }),
  })
);

export type DocumentExtraction = typeof documentExtractions.$inferSelect;
export type NewDocumentExtraction = typeof documentExtractions.$inferInsert;
