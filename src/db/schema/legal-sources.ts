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
  boolean,
  integer,
  uuid,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { regulations } from "./regulations";
import { users } from "./users";

/**
 * Unified parent table for ALL legal artifacts that can link to cases:
 *  - regulations (existing data backfilled here)
 *  - judicial decisions (MOJ precedents)
 *  - government data (open.data.gov.sa)
 *  - web sources (Tavily-discovered)
 *  - manually curated documents
 *
 * Each row carries both a relevance-independent trust signal (trustTier)
 * and the institutional authority that owns the source (sourceAuthority).
 * Use this table for every new source-type integration; do not create
 * parallel tables.
 */

export const legalSourceTypeEnum = [
  "regulation",
  "judicial_decision",
  "gov_data",
  "web_source",
] as const;

/**
 * Trust tier — orthogonal to relevance score.
 *  - official:   issued by Saudi government / judiciary, citable in court
 *  - trusted:    pre-vetted source (e.g., curated open data publishers)
 *  - discovered: surfaced by web search, not yet verified
 *  - unverified: user-uploaded or low-confidence ingestion
 */
export const legalSourceTrustTierEnum = [
  "official",
  "trusted",
  "discovered",
  "unverified",
] as const;

export const legalSourceStatusEnum = [
  "active",
  "archived",
  "broken",
  "superseded",
] as const;

export const legalSourceLanguageEnum = ["ar", "en", "mixed"] as const;

export const legalSources = pgTable(
  "legal_sources",
  {
    id: serial("id").primaryKey(),

    // --- Discriminator + trust ---
    sourceType: varchar("source_type", { length: 32 })
      .$type<(typeof legalSourceTypeEnum)[number]>()
      .notNull(),
    trustTier: varchar("trust_tier", { length: 32 })
      .$type<(typeof legalSourceTrustTierEnum)[number]>()
      .notNull(),
    sourceAuthority: varchar("source_authority", { length: 100 }).notNull(), // "MOJ", "Open Data Saudi", "Tavily", "Manual"
    isCitableInCourt: boolean("is_citable_in_court").default(false).notNull(),

    // --- Identification ---
    title: varchar("title", { length: 1000 }).notNull(),
    summary: text("summary"),
    sourceUrl: text("source_url"),
    canonicalIdentifier: varchar("canonical_identifier", { length: 255 }), // e.g. royal decree number, decision number, dataset id
    language: varchar("language", { length: 16 })
      .$type<(typeof legalSourceLanguageEnum)[number]>()
      .default("ar")
      .notNull(),

    // --- Source provider tracking (mirrors existing regulations.* fields) ---
    sourceProvider: varchar("source_provider", { length: 100 }).notNull(), // "moj_regulations" | "moj_decisions" | "data_gov_sa" | "tavily" | "manual"
    sourceSerial: varchar("source_serial", { length: 255 }),
    sourceListingUrl: text("source_listing_url"),
    sourceMetadata: jsonb("source_metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    sourceMetadataHash: varchar("source_metadata_hash", { length: 64 }),

    // --- Classification ---
    category: varchar("category", { length: 100 }), // "labor_law", "civil_law", etc.
    jurisdiction: varchar("jurisdiction", { length: 255 }).default("SA").notNull(),
    publishedDate: date("published_date"),
    effectiveDate: date("effective_date"),

    // --- Backlink to existing regulations during transition.
    // For sourceType='regulation' rows backfilled from the regulations table,
    // this points back to regulations.id so existing code keeps working. ---
    regulationId: integer("regulation_id").references(() => regulations.id, {
      onDelete: "cascade",
    }),

    // --- Curator workflow (Phase 4) ---
    curatorVerified: boolean("curator_verified").default(false).notNull(),
    curatorVerifiedBy: uuid("curator_verified_by").references(() => users.id, {
      onDelete: "set null",
    }),
    curatorVerifiedAt: timestamp("curator_verified_at"),
    curatorNotes: text("curator_notes"),

    // --- Lifecycle ---
    status: varchar("status", { length: 32 })
      .$type<(typeof legalSourceStatusEnum)[number]>()
      .default("active")
      .notNull(),
    lastVerifiedAt: timestamp("last_verified_at"),

    // --- Monitoring (mirrors regulations table) ---
    monitoringEnabled: boolean("monitoring_enabled").default(true).notNull(),
    checkIntervalHours: integer("check_interval_hours").default(168).notNull(), // weekly default for non-regulations
    lastCheckedAt: timestamp("last_checked_at"),
    lastContentHash: varchar("last_content_hash", { length: 64 }),
    lastEtag: text("last_etag"),
    lastModified: timestamp("last_modified"),
    nextCheckAt: timestamp("next_check_at").defaultNow().notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),

    // --- Tavily-specific TTL (null for non-tavily sources) ---
    expiresAt: timestamp("expires_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceTypeIdx: index("legal_sources_source_type_idx").on(table.sourceType),
    trustTierIdx: index("legal_sources_trust_tier_idx").on(table.trustTier),
    statusIdx: index("legal_sources_status_idx").on(table.status),
    categoryIdx: index("legal_sources_category_idx").on(table.category),
    sourceProviderIdx: index("legal_sources_source_provider_idx").on(
      table.sourceProvider
    ),
    sourceProviderSerialUniqueIdx: uniqueIndex(
      "legal_sources_provider_serial_uidx"
    )
      .on(table.sourceProvider, table.sourceSerial)
      .where(sql`${table.sourceSerial} is not null`),
    regulationIdIdx: index("legal_sources_regulation_id_idx").on(
      table.regulationId
    ),
    monitoringDueIdx: index("legal_sources_monitoring_due_idx").on(
      table.monitoringEnabled,
      table.nextCheckAt
    ),
    expiresAtIdx: index("legal_sources_expires_at_idx").on(table.expiresAt),
    curatorVerifiedIdx: index("legal_sources_curator_verified_idx").on(
      table.curatorVerified,
      table.trustTier
    ),
  })
);

export const legalSourcesRelations = relations(legalSources, ({ one }) => ({
  regulation: one(regulations, {
    fields: [legalSources.regulationId],
    references: [regulations.id],
  }),
  curatorVerifier: one(users, {
    fields: [legalSources.curatorVerifiedBy],
    references: [users.id],
  }),
}));

export type LegalSource = typeof legalSources.$inferSelect;
export type NewLegalSource = typeof legalSources.$inferInsert;
export type LegalSourceType = (typeof legalSourceTypeEnum)[number];
export type LegalSourceTrustTier = (typeof legalSourceTrustTierEnum)[number];
export type LegalSourceStatus = (typeof legalSourceStatusEnum)[number];
export type LegalSourceLanguage = (typeof legalSourceLanguageEnum)[number];

/**
 * Trust multipliers used by the AI service when computing
 * trust-weighted relevance scores. Mirrored in the AI service.
 */
export const TRUST_TIER_MULTIPLIER: Record<LegalSourceTrustTier, number> = {
  official: 1.0,
  trusted: 0.9,
  discovered: 0.6,
  unverified: 0.4,
};

/**
 * Whether sources at a given tier should be presented to lawyers
 * as citable in Saudi courts.
 */
export const TIER_IS_CITABLE: Record<LegalSourceTrustTier, boolean> = {
  official: true,
  trusted: true,
  discovered: false,
  unverified: false,
};
