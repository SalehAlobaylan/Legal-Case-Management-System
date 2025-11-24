import {
  pgTable,
  serial,
  varchar,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

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
  })
);

export type Regulation = typeof regulations.$inferSelect;
export type NewRegulation = typeof regulations.$inferInsert;
export type RegulationCategory = (typeof regulationCategoryEnum)[number];
export type RegulationStatus = (typeof regulationStatusEnum)[number];


