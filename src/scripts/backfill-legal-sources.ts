/**
 * File: src/scripts/backfill-legal-sources.ts
 * Purpose: Copy existing regulations into the unified legal_sources table
 *          so the new multi-source case linking pipeline has candidates.
 *
 * Safe to run multiple times — uses upsert on (source_provider, source_serial).
 * For regulations without a source_serial, uses the regulation ID as serial.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-legal-sources.ts
 */

import { sql, eq } from "drizzle-orm";
import { db } from "../db/connection";
import { regulations } from "../db/schema/regulations";
import { legalSources } from "../db/schema/legal-sources";
import { logger } from "../utils/logger";

const SOURCE_PROVIDER = "moj_regulations";

async function run() {
  logger.info("Starting regulation → legal_sources backfill...");

  // 1. Fetch all regulations
  const allRegs = await db.select().from(regulations);
  logger.info({ count: allRegs.length }, "Found regulations to backfill");

  if (allRegs.length === 0) {
    logger.info("No regulations found — nothing to backfill.");
    return;
  }

  let created = 0;
  let updated = 0;
  let errored = 0;

  for (const reg of allRegs) {
    const serial = reg.sourceSerial || `reg-${reg.id}`;
    const sourceAuthority =
      reg.sourceProvider === "moj_gateway" ? "MOJ" : "Manual";
    const isMoj =
      reg.sourceProvider === "moj_gateway" ||
      (reg.sourceUrl && reg.sourceUrl.includes("moj.gov.sa"));

    try {
      // Check if already backfilled
      const existing = await db
        .select({ id: legalSources.id })
        .from(legalSources)
        .where(eq(legalSources.regulationId, reg.id))
        .limit(1);

      if (existing.length > 0) {
        // Update existing row
        await db
          .update(legalSources)
          .set({
            title: reg.title,
            summary: reg.summary,
            sourceUrl: reg.sourceUrl,
            canonicalIdentifier: reg.regulationNumber,
            category: reg.category,
            jurisdiction: reg.jurisdiction || "SA",
            effectiveDate: reg.effectiveDate,
            sourceMetadata: reg.sourceMetadata,
            sourceMetadataHash: reg.sourceMetadataHash,
            sourceListingUrl: reg.sourceListingUrl,
            monitoringEnabled: reg.monitoringEnabled,
            checkIntervalHours: reg.checkIntervalHours,
            lastCheckedAt: reg.lastCheckedAt,
            lastContentHash: reg.lastContentHash,
            lastEtag: reg.lastEtag,
            lastModified: reg.lastModified,
            nextCheckAt: reg.nextCheckAt,
            consecutiveFailures: reg.consecutiveFailures,
            updatedAt: new Date(),
          })
          .where(eq(legalSources.regulationId, reg.id));
        updated++;
      } else {
        // Insert new row
        await db.insert(legalSources).values({
          sourceType: "regulation",
          trustTier: isMoj ? "official" : "trusted",
          sourceAuthority,
          isCitableInCourt: true, // All regulations are citable
          title: reg.title,
          summary: reg.summary,
          sourceUrl: reg.sourceUrl,
          canonicalIdentifier: reg.regulationNumber,
          language: "ar", // Saudi regulations are Arabic
          sourceProvider: SOURCE_PROVIDER,
          sourceSerial: serial,
          sourceListingUrl: reg.sourceListingUrl,
          sourceMetadata: reg.sourceMetadata,
          sourceMetadataHash: reg.sourceMetadataHash,
          category: reg.category,
          jurisdiction: reg.jurisdiction || "SA",
          effectiveDate: reg.effectiveDate,
          regulationId: reg.id, // backlink for compatibility
          status: reg.status === "repealed" ? "archived" : "active",
          monitoringEnabled: reg.monitoringEnabled,
          checkIntervalHours: reg.checkIntervalHours,
          lastCheckedAt: reg.lastCheckedAt,
          lastContentHash: reg.lastContentHash,
          lastEtag: reg.lastEtag,
          lastModified: reg.lastModified,
          nextCheckAt: reg.nextCheckAt,
          consecutiveFailures: reg.consecutiveFailures,
        });
        created++;
      }
    } catch (err) {
      logger.error(
        { err, regulationId: reg.id, title: reg.title },
        "Failed to backfill regulation"
      );
      errored++;
    }
  }

  logger.info(
    { created, updated, errored, total: allRegs.length },
    "Regulation → legal_sources backfill complete"
  );
}

run()
  .then(() => {
    logger.info("Backfill script finished successfully");
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, "Backfill script failed");
    process.exit(1);
  });
