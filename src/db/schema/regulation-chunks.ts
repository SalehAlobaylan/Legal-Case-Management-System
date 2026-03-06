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
import { regulations } from "./regulations";
import { regulationVersions } from "./regulation-versions";

export const REGULATION_CHUNK_EMBEDDING_DIMENSION = 1024;

const vector = customType<{
  data: number[];
  driverData: string | number[];
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? REGULATION_CHUNK_EMBEDDING_DIMENSION})`;
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

export const regulationChunks = pgTable(
  "regulation_chunks",
  {
    id: serial("id").primaryKey(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    regulationVersionId: integer("regulation_version_id")
      .references(() => regulationVersions.id, { onDelete: "cascade" })
      .notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    articleRef: varchar("article_ref", { length: 255 }),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", {
      dimensions: REGULATION_CHUNK_EMBEDDING_DIMENSION,
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    regVersionChunkUniqueIdx: uniqueIndex(
      "regulation_chunks_reg_version_chunk_unique_idx"
    ).on(table.regulationVersionId, table.chunkIndex),
    regVersionIdx: index("regulation_chunks_reg_version_idx").on(
      table.regulationId,
      table.regulationVersionId
    ),
  })
);

export const regulationChunksRelations = relations(regulationChunks, ({ one }) => ({
  regulation: one(regulations, {
    fields: [regulationChunks.regulationId],
    references: [regulations.id],
  }),
  regulationVersion: one(regulationVersions, {
    fields: [regulationChunks.regulationVersionId],
    references: [regulationVersions.id],
  }),
}));

export type RegulationChunk = typeof regulationChunks.$inferSelect;
export type NewRegulationChunk = typeof regulationChunks.$inferInsert;
