import {
  pgTable,
  serial,
  varchar,
  text,
  date,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const regulationCategoryEnum = [
  "criminal_law",
  "civil_law",
  "commercial_law",
  "labor_law",
  "procedural_law",
] as const;

export const regulationStatusEnum = [
  "active",
  "amended",
  "repealed",
  "draft",
] as const;

export const regulations = pgTable(
  "regulations",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    regulationNumber: varchar("regulation_number", { length: 100 }),
    sourceUrl: text("source_url"),
    sourceProvider: varchar("source_provider", { length: 50 }).default("manual").notNull(),
    sourceSerial: varchar("source_serial", { length: 255 }),
    sourceListingUrl: text("source_listing_url"),
    sourceMetadata: jsonb("source_metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    sourceMetadataHash: varchar("source_metadata_hash", { length: 64 }),
    summary: text("summary"),
    category: varchar("category", { length: 100 }).$type<
      (typeof regulationCategoryEnum)[number]
    >(),
    jurisdiction: varchar("jurisdiction", { length: 255 }),
    status: varchar("status", { length: 50 })
      .$type<(typeof regulationStatusEnum)[number]>()
      .default("active")
      .notNull(),
    effectiveDate: date("effective_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index("regulations_category_idx").on(table.category),
    statusIdx: index("regulations_status_idx").on(table.status),
    sourceProviderIdx: index("regulations_source_provider_idx").on(table.sourceProvider),
    sourceSerialIdx: index("regulations_source_serial_idx").on(table.sourceSerial),
    sourceProviderSerialUniqueIdx: uniqueIndex("regulations_source_provider_serial_uidx")
      .on(table.sourceProvider, table.sourceSerial)
      .where(sql`${table.sourceSerial} is not null`),
  })
);

export type Regulation = typeof regulations.$inferSelect;
export type NewRegulation = typeof regulations.$inferInsert;
export type RegulationCategory = (typeof regulationCategoryEnum)[number];
export type RegulationStatus = (typeof regulationStatusEnum)[number];
