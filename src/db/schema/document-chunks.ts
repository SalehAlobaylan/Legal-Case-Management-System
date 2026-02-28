import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { documents } from "./documents";
import { organizations } from "./organizations";

export const DOCUMENT_CHUNK_EMBEDDING_DIMENSION = 1024;

const vector = customType<{
  data: number[];
  driverData: string | number[];
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config.dimensions})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (Array.isArray(value)) {
      return value.map((item) => Number(item));
    }

    const normalized = value.trim().replace(/^\[/, "").replace(/\]$/, "");
    if (!normalized) {
      return [];
    }

    return normalized
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => !Number.isNaN(item));
  },
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    documentId: integer("document_id")
      .references(() => documents.id, { onDelete: "cascade" })
      .notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentLang: varchar("content_lang", { length: 16 }),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", {
      dimensions: DOCUMENT_CHUNK_EMBEDDING_DIMENSION,
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    docChunkUniqueIdx: uniqueIndex("document_chunks_doc_chunk_unique_idx").on(
      table.documentId,
      table.chunkIndex
    ),
    orgDocIdx: index("document_chunks_org_doc_idx").on(
      table.organizationId,
      table.documentId
    ),
  })
);

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  organization: one(organizations, {
    fields: [documentChunks.organizationId],
    references: [organizations.id],
  }),
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
