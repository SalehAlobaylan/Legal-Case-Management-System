import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import { legalSources, type NewLegalSource } from "../db/schema";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Open Data Saudi (open.data.gov.sa) ingestion via CKAN API.
 *
 * The portal exposes a standard CKAN v3 API. We pull datasets from a
 * configurable set of trusted publishers (e.g. MOJ on Open Data) and
 * persist each as a row in `legal_sources` with:
 *   - sourceType        = "gov_data"
 *   - trustTier         = "trusted"
 *   - sourceAuthority   = "Open Data Saudi"
 *   - sourceProvider    = "data_gov_sa"
 *   - sourceSerial      = CKAN package id
 *
 * Embedding/chunking of the dataset content is a separate concern handled
 * downstream (mirrors the regulation pattern). This service is responsible
 * only for discovery + metadata persistence + change detection.
 */

const PROVIDER_ID = "data_gov_sa";
const SOURCE_AUTHORITY = "Open Data Saudi";

interface CkanPackage {
  id: string;
  name?: string;
  title?: string;
  title_ar?: string;
  notes?: string;
  notes_ar?: string;
  metadata_created?: string;
  metadata_modified?: string;
  organization?: { id?: string; title?: string; title_ar?: string; name?: string };
  resources?: Array<{
    id?: string;
    name?: string;
    name_ar?: string;
    url?: string;
    format?: string;
    mimetype?: string;
    description?: string;
    last_modified?: string;
  }>;
  tags?: Array<{ name?: string; display_name?: string }>;
  groups?: Array<{ id?: string; title?: string; name?: string }>;
}

interface CkanPackageSearchResponse {
  success: boolean;
  result?: {
    count: number;
    results: CkanPackage[];
  };
  error?: { message?: string };
}

export interface OpenDataSyncOptions {
  publisherIds?: string[];
  maxDatasetsPerPublisher?: number;
}

export interface OpenDataSyncResult {
  publishersScanned: number;
  datasetsDiscovered: number;
  legalSourcesCreated: number;
  legalSourcesUpdated: number;
  unchanged: number;
  failed: number;
  errors: Array<{ publisherId?: string; datasetId?: string; reason: string }>;
}

export class OpenDataSourceService {
  constructor(private readonly db: Database) {}

  async syncTrustedPublishers(
    options: OpenDataSyncOptions = {}
  ): Promise<OpenDataSyncResult> {
    const publisherIds =
      options.publisherIds ??
      env.OPEN_DATA_TRUSTED_PUBLISHERS.split(",")
        .map((id) => id.trim())
        .filter(Boolean);

    const maxPerPublisher =
      options.maxDatasetsPerPublisher ?? env.OPEN_DATA_MAX_DATASETS_PER_PUBLISHER;

    const result: OpenDataSyncResult = {
      publishersScanned: 0,
      datasetsDiscovered: 0,
      legalSourcesCreated: 0,
      legalSourcesUpdated: 0,
      unchanged: 0,
      failed: 0,
      errors: [],
    };

    for (const publisherId of publisherIds) {
      result.publishersScanned += 1;
      try {
        const packages = await this.fetchPublisherPackages(
          publisherId,
          maxPerPublisher
        );
        result.datasetsDiscovered += packages.length;

        for (const pkg of packages) {
          try {
            const outcome = await this.upsertPackage(pkg);
            if (outcome === "created") result.legalSourcesCreated += 1;
            else if (outcome === "updated") result.legalSourcesUpdated += 1;
            else result.unchanged += 1;
          } catch (err) {
            result.failed += 1;
            result.errors.push({
              publisherId,
              datasetId: pkg.id,
              reason: err instanceof Error ? err.message : String(err),
            });
            logger.warn(
              { publisherId, datasetId: pkg.id, err },
              "open-data: failed to upsert package"
            );
          }
        }
      } catch (err) {
        result.failed += 1;
        result.errors.push({
          publisherId,
          reason: err instanceof Error ? err.message : String(err),
        });
        logger.error(
          { publisherId, err },
          "open-data: failed to fetch publisher packages"
        );
      }
    }

    return result;
  }

  /**
   * Fetch up to `maxResults` packages for a CKAN organization, paging
   * through `package_search` with `fq=organization:<name>` or
   * `owner_org:<id>`.
   *
   * The Saudi Open Data portal accepts both forms; we use `owner_org`
   * since the user-supplied identifier is a UUID (the org id).
   */
  private async fetchPublisherPackages(
    publisherId: string,
    maxResults: number
  ): Promise<CkanPackage[]> {
    const pageSize = 100;
    const collected: CkanPackage[] = [];
    let start = 0;

    while (collected.length < maxResults) {
      const url = new URL(`${env.OPEN_DATA_BASE_URL}/3/action/package_search`);
      url.searchParams.set("fq", `owner_org:${publisherId}`);
      url.searchParams.set("rows", String(Math.min(pageSize, maxResults - collected.length)));
      url.searchParams.set("start", String(start));

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        // CKAN endpoints are sometimes slow — give them headroom
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(
          `CKAN package_search failed with HTTP ${response.status} for publisher ${publisherId}`
        );
      }

      const body = (await response.json()) as CkanPackageSearchResponse;
      if (!body.success || !body.result) {
        throw new Error(
          `CKAN package_search returned success=false: ${body.error?.message ?? "unknown"}`
        );
      }

      const batch = body.result.results;
      collected.push(...batch);

      if (batch.length < pageSize || collected.length >= body.result.count) {
        break;
      }
      start += batch.length;
    }

    return collected.slice(0, maxResults);
  }

  /**
   * Idempotent insert / update of a single CKAN package into legal_sources.
   * Uses (sourceProvider, sourceSerial) unique index for dedup.
   * Returns whether the row was created, updated, or unchanged.
   */
  private async upsertPackage(
    pkg: CkanPackage
  ): Promise<"created" | "updated" | "unchanged"> {
    const title =
      pkg.title_ar?.trim() ||
      pkg.title?.trim() ||
      pkg.name?.trim() ||
      `Open Data dataset ${pkg.id}`;
    const summary = pkg.notes_ar?.trim() || pkg.notes?.trim() || null;
    const sourceUrl = `https://open.data.gov.sa/ar/datasets/view/${pkg.id}`;
    const sourceMetadata: Record<string, unknown> = {
      ckan_id: pkg.id,
      ckan_name: pkg.name,
      organization: pkg.organization,
      tags: pkg.tags?.map((t) => t.display_name || t.name).filter(Boolean) ?? [],
      groups: pkg.groups?.map((g) => g.title || g.name).filter(Boolean) ?? [],
      resources:
        pkg.resources?.map((r) => ({
          id: r.id,
          name: r.name_ar || r.name,
          url: r.url,
          format: r.format,
          mimetype: r.mimetype,
          last_modified: r.last_modified,
        })) ?? [],
      ckan_metadata_created: pkg.metadata_created,
      ckan_metadata_modified: pkg.metadata_modified,
    };

    const sourceMetadataHash = hashJson(sourceMetadata);

    const newRow: NewLegalSource = {
      sourceType: "gov_data",
      trustTier: "trusted",
      sourceAuthority: SOURCE_AUTHORITY,
      isCitableInCourt: true,
      title,
      summary: summary ?? undefined,
      sourceUrl,
      canonicalIdentifier: pkg.name ?? pkg.id,
      language: detectLanguage(title, summary),
      sourceProvider: PROVIDER_ID,
      sourceSerial: pkg.id,
      sourceListingUrl: `https://open.data.gov.sa/ar/organizations/${pkg.organization?.id ?? ""}`,
      sourceMetadata,
      sourceMetadataHash,
      jurisdiction: "SA",
      // Open data datasets aren't directly citable in court (informational),
      // but they are from a trusted source — surface them to lawyers as research.
      // Override: gov_data doesn't establish legal authority, so flip back.
    };

    // Re-evaluate citability: gov data is trusted but not court-citable on its own.
    newRow.isCitableInCourt = false;

    const existing = await this.db
      .select({
        id: legalSources.id,
        hash: legalSources.sourceMetadataHash,
      })
      .from(legalSources)
      .where(
        and(
          eq(legalSources.sourceProvider, PROVIDER_ID),
          eq(legalSources.sourceSerial, pkg.id)
        )
      )
      .limit(1);

    const now = new Date();

    if (existing.length === 0) {
      await this.db.insert(legalSources).values(newRow);
      return "created";
    }

    if (existing[0].hash === sourceMetadataHash) {
      // Touch lastCheckedAt so the monitoring scheduler advances.
      await this.db
        .update(legalSources)
        .set({
          lastCheckedAt: now,
          nextCheckAt: addMinutes(now, env.OPEN_DATA_SYNC_INTERVAL_MINUTES),
          consecutiveFailures: 0,
        })
        .where(eq(legalSources.id, existing[0].id));
      return "unchanged";
    }

    await this.db
      .update(legalSources)
      .set({
        title: newRow.title,
        summary: newRow.summary,
        sourceUrl: newRow.sourceUrl,
        sourceMetadata: newRow.sourceMetadata,
        sourceMetadataHash,
        lastCheckedAt: now,
        lastModified: now,
        nextCheckAt: addMinutes(now, env.OPEN_DATA_SYNC_INTERVAL_MINUTES),
        consecutiveFailures: 0,
        updatedAt: now,
      })
      .where(eq(legalSources.id, existing[0].id));

    return "updated";
  }

  /**
   * Counts of currently-tracked Open Data sources, for health endpoints.
   */
  async getHealth(): Promise<{
    totalDatasets: number;
    lastSyncAt: string | null;
  }> {
    const totalRow = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(legalSources)
      .where(eq(legalSources.sourceProvider, PROVIDER_ID));

    const lastRow = await this.db
      .select({ lastCheckedAt: legalSources.lastCheckedAt })
      .from(legalSources)
      .where(eq(legalSources.sourceProvider, PROVIDER_ID))
      .orderBy(sql`${legalSources.lastCheckedAt} desc nulls last`)
      .limit(1);

    return {
      totalDatasets: totalRow[0]?.count ?? 0,
      lastSyncAt: lastRow[0]?.lastCheckedAt
        ? new Date(lastRow[0].lastCheckedAt).toISOString()
        : null,
    };
  }
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Heuristic language detection for CKAN packages.
 * Saudi Open Data is bilingual, so most packages have Arabic + English.
 */
function detectLanguage(
  title: string,
  summary: string | null
): "ar" | "en" | "mixed" {
  const text = `${title} ${summary ?? ""}`;
  const hasArabic = /[؀-ۿ]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasArabic && hasLatin) return "mixed";
  if (hasArabic) return "ar";
  return "en";
}
