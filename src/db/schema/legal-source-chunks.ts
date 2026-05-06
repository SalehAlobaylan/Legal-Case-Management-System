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
import { legalSources } from "./legal-sources";

/**
 * Embedding dimension for the BGE-M3 model used in the AI microservice.
 * Must stay in sync with REGULATION_CHUNK_EMBEDDING_DIMENSION.
 */
export const LEGAL_SOURCE_CHUNK_EMBEDDING_DIMENSION = 1024;

const vector = customType<{
  data: number[];
  driverData: string | number[];
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? LEGAL_SOURCE_CHUNK_EMBEDDING_DIMENSION})`;
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

/**
 * Unified chunk + embedding storage for any legal source type.
 * Mirrors the regulation_chunks pattern but is keyed by legal_source_id.
 *
 * Chunking strategy varies by sourceType:
 *  - regulation:        article-level (existing pattern)
 *  - judicial_decision: section-level (facts / arguments / ruling / reasoning)
 *  - gov_data:          page or paragraph-level depending on format
 *  - web_source:        whole-document (Tavily snippets are short)
 *
 * The `sectionRef` column stores a human-readable anchor
 * (e.g. "Article 7", "Ruling", "Section 3.2").
 */

export const legalSourceChunks = pgTable(
  "legal_source_chunks",
  {
    id: serial("id").primaryKey(),
    legalSourceId: integer("legal_source_id")
      .references(() => legalSources.id, { onDelete: "cascade" })
      .notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    sectionRef: varchar("section_ref", { length: 255 }), // e.g. "Article 7", "Ruling", "Dataset row 12"
    sectionType: varchar("section_type", { length: 64 }), // e.g. "article", "ruling", "facts", "reasoning", "snippet"
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", {
      dimensions: LEGAL_SOURCE_CHUNK_EMBEDDING_DIMENSION,
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceChunkUniqueIdx: uniqueIndex(
      "legal_source_chunks_source_chunk_unique_idx"
    ).on(table.legalSourceId, table.chunkIndex),
    sourceIdIdx: index("legal_source_chunks_source_id_idx").on(
      table.legalSourceId
    ),
  })
);

export const legalSourceChunksRelations = relations(
  legalSourceChunks,
  ({ one }) => ({
    legalSource: one(legalSources, {
      fields: [legalSourceChunks.legalSourceId],
      references: [legalSources.id],
    }),
  })
);

export type LegalSourceChunk = typeof legalSourceChunks.$inferSelect;
export type NewLegalSourceChunk = typeof legalSourceChunks.$inferInsert;
