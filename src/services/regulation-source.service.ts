import { createHash } from "crypto";
import { desc, eq, ilike, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulationMonitorRuns,
  regulations,
  regulationVersions,
} from "../db/schema";
import { env } from "../config/env";
import { AIClientService } from "./ai-client.service";
import { logger } from "../utils/logger";

type RegulationCategory =
  | "criminal_law"
  | "civil_law"
  | "commercial_law"
  | "labor_law"
  | "procedural_law";

type RegulationStatus = "active" | "amended" | "repealed" | "draft";

export interface MojSyncRunOptions {
  maxPages?: number;
  extractContent?: boolean;
  triggeredByUserId?: string;
  triggerSource?: string;
}

export interface MojSyncRunResult {
  pagesScanned: number;
  discovered: number;
  created: number;
  updated: number;
  versionsCreated: number;
  unchanged: number;
  failed: number;
  skippedExtraction: number;
  errors: Array<{
    url?: string;
    reason: string;
  }>;
}

export interface MojSyncHealthSummary {
  hasRun: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  minutesSinceLastRun: number | null;
  scannedLastRun: number;
  versionsCreatedLastRun: number;
  failedLastRun: number;
  trackedRegulations: number;
  trackedWithVersions: number;
}

interface MojRegulationCandidate {
  title: string;
  sourceUrl: string;
  sourceListingUrl: string;
  regulationNumber?: string;
  category?: RegulationCategory;
  status?: RegulationStatus;
  effectiveDate?: string;
}

const MOJ_HOST = "laws.moj.gov.sa";
const DEFAULT_LISTING_URL =
  "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1&pageSize=9&sortingBy=7";

export class RegulationSourceService {
  private readonly aiClient: AIClientService | null;

  constructor(private readonly db: Database) {
    this.aiClient = env.AI_SERVICE_URL ? new AIClientService() : null;
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  private hashNormalizedText(text: string): string {
    return createHash("sha256")
      .update(this.normalizeWhitespace(text), "utf-8")
      .digest("hex");
  }

  private stripHtml(html: string): string {
    return html.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  private canonicalizeMojUrl(href: string, baseUrl: string): string | null {
    try {
      const url = new URL(href, baseUrl);

      if (url.hostname.toLowerCase() !== MOJ_HOST) {
        return null;
      }
      if (!url.pathname.includes("/legislations-regulations")) {
        return null;
      }

      const normalizedPath = url.pathname.replace(/\/+$/, "");
      if (normalizedPath === "/ar/legislations-regulations") {
        return null;
      }
      if (url.searchParams.has("pageNumber")) {
        return null;
      }

      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }

  private inferRegulationNumber(title: string): string | undefined {
    const normalized = this.normalizeWhitespace(title);
    const match = normalized.match(
      /(رقم|No\.?|#)\s*[:\-]?\s*([A-Za-z0-9\/\-]{2,40})/i
    );
    return match?.[2];
  }

  private inferCategory(title: string): RegulationCategory | undefined {
    const t = title.toLowerCase();

    if (/(عمل|labor|employment)/i.test(t)) return "labor_law";
    if (/(تجاري|commercial)/i.test(t)) return "commercial_law";
    if (/(مدني|civil)/i.test(t)) return "civil_law";
    if (/(جنائي|criminal)/i.test(t)) return "criminal_law";
    if (/(إجراءات|procedural|procedure)/i.test(t)) return "procedural_law";

    return undefined;
  }

  private inferStatus(title: string): RegulationStatus | undefined {
    const t = title.toLowerCase();

    if (/(ملغى|repealed|إلغاء)/i.test(t)) return "repealed";
    if (/(مسودة|draft)/i.test(t)) return "draft";
    if (/(معدل|amended|تعديل)/i.test(t)) return "amended";
    return "active";
  }

  private extractCandidatesFromListing(
    html: string,
    listingUrl: string
  ): MojRegulationCandidate[] {
    const candidates: MojRegulationCandidate[] = [];
    const seen = new Set<string>();
    const anchorRegex =
      /<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(html)) !== null) {
      const attrs = `${match[1] || ""} ${match[3] || ""}`;
      const href = match[2] || "";
      const innerHtml = match[4] || "";

      const sourceUrl = this.canonicalizeMojUrl(href, listingUrl);
      if (!sourceUrl || seen.has(sourceUrl)) {
        continue;
      }

      const titleAttrMatch = attrs.match(/title\s*=\s*["']([^"']+)["']/i);
      const titleFromInner = this.decodeHtmlEntities(this.stripHtml(innerHtml));
      const titleFromAttr = this.decodeHtmlEntities(titleAttrMatch?.[1] || "");
      const title = this.normalizeWhitespace(titleFromInner || titleFromAttr);

      if (!title || title.length < 4) {
        continue;
      }

      seen.add(sourceUrl);
      candidates.push({
        title,
        sourceUrl,
        sourceListingUrl: listingUrl,
        regulationNumber: this.inferRegulationNumber(title),
        category: this.inferCategory(title),
        status: this.inferStatus(title),
      });
    }

    return candidates;
  }

  private buildMojListingUrl(pageNumber: number): string {
    const base = env.REG_SOURCE_MOJ_LISTING_URL || DEFAULT_LISTING_URL;
    const url = new URL(base);
    url.searchParams.set("pageNumber", String(pageNumber));
    if (!url.searchParams.has("pageSize")) {
      url.searchParams.set("pageSize", "9");
    }
    if (!url.searchParams.has("sortingBy")) {
      url.searchParams.set("sortingBy", "7");
    }
    return url.toString();
  }

  private async fetchMojListingPage(pageNumber: number) {
    const listingUrl = this.buildMojListingUrl(pageNumber);
    const response = await fetch(listingUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for page ${pageNumber}`);
    }

    const html = await response.text();
    const candidates = this.extractCandidatesFromListing(html, listingUrl);
    return { listingUrl, candidates };
  }

  private async upsertRegulation(
    candidate: MojRegulationCandidate
  ): Promise<{ regulationId: number; created: boolean; updated: boolean }> {
    const now = new Date();
    const existing = await this.db.query.regulations.findFirst({
      where: eq(regulations.sourceUrl, candidate.sourceUrl),
      columns: {
        id: true,
        title: true,
        regulationNumber: true,
        category: true,
        status: true,
      },
    });

    if (!existing) {
      const [created] = await this.db
        .insert(regulations)
        .values({
          title: candidate.title,
          regulationNumber: candidate.regulationNumber,
          sourceUrl: candidate.sourceUrl,
          category: candidate.category,
          jurisdiction: "Kingdom of Saudi Arabia",
          status: candidate.status || "active",
          effectiveDate: candidate.effectiveDate || null,
          updatedAt: now,
        })
        .returning({ id: regulations.id });

      return { regulationId: created.id, created: true, updated: false };
    }

    const shouldUpdate =
      existing.title !== candidate.title ||
      existing.regulationNumber !== candidate.regulationNumber ||
      existing.category !== candidate.category ||
      existing.status !== (candidate.status || existing.status);

    if (!shouldUpdate) {
      return { regulationId: existing.id, created: false, updated: false };
    }

    await this.db
      .update(regulations)
      .set({
        title: candidate.title,
        regulationNumber: candidate.regulationNumber,
        category: candidate.category,
        status: candidate.status || existing.status,
        updatedAt: now,
      })
      .where(eq(regulations.id, existing.id));

    return { regulationId: existing.id, created: false, updated: true };
  }

  private async syncRegulationVersion(
    regulationId: number,
    sourceUrl: string
  ): Promise<"created" | "unchanged" | "failed" | "skipped"> {
    if (!this.aiClient) {
      return "skipped";
    }

    let extraction;
    try {
      extraction = await this.aiClient.extractRegulationContent({
        sourceUrl,
      });
    } catch (error) {
      logger.error(
        { err: error, sourceUrl, regulationId },
        "MOJ sync extraction request failed"
      );
      return "failed";
    }

    if (extraction.status === "error") {
      logger.warn(
        {
          sourceUrl,
          regulationId,
          errorCode: extraction.error_code,
          warnings: extraction.warnings,
        },
        "MOJ sync extraction returned error"
      );
      return "failed";
    }

    if (extraction.status === "not_modified") {
      return "unchanged";
    }

    const extractedText = this.normalizeWhitespace(extraction.extracted_text || "");
    if (!extractedText) {
      return "failed";
    }

    const contentHash =
      extraction.normalized_text_hash || this.hashNormalizedText(extractedText);
    const latestVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.regulationId, regulationId),
      columns: {
        versionNumber: true,
        contentHash: true,
      },
      orderBy: [desc(regulationVersions.versionNumber)],
    });

    if (latestVersion?.contentHash === contentHash) {
      return "unchanged";
    }

    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;
    const now = new Date();
    await this.db.insert(regulationVersions).values({
      regulationId,
      versionNumber: nextVersionNumber,
      content: extractedText,
      contentHash,
      rawHtml: extraction.raw_html || null,
      changesSummary: latestVersion
        ? "Detected source content change from MOJ listing sync."
        : "Initial version extracted from MOJ source.",
      createdBy: "moj_source_sync",
    });

    await this.db
      .update(regulations)
      .set({
        updatedAt: now,
        status: latestVersion ? "amended" : "active",
      })
      .where(eq(regulations.id, regulationId));

    return "created";
  }

  private async persistRun(params: {
    startedAt: Date;
    finishedAt: Date;
    status: "success" | "failed";
    result: MojSyncRunResult;
    triggerSource: string;
    triggeredByUserId?: string;
    errorMessage?: string;
  }) {
    await this.db.insert(regulationMonitorRuns).values({
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      status: params.status,
      triggerSource: params.triggerSource,
      triggeredByUserId: params.triggeredByUserId,
      dryRun: false,
      scanned: params.result.discovered,
      changed: params.result.versionsCreated,
      versionsCreated: params.result.versionsCreated,
      failed: params.result.failed,
      errorMessage: params.errorMessage?.slice(0, 500),
    });
  }

  async syncMojSource(options: MojSyncRunOptions = {}): Promise<MojSyncRunResult> {
    const startedAt = new Date();
    const triggerSource = options.triggerSource || "moj_source_sync";
    const maxPages = Math.max(1, options.maxPages || env.REG_SOURCE_MOJ_MAX_PAGES);
    const extractContent = options.extractContent !== false;

    const result: MojSyncRunResult = {
      pagesScanned: 0,
      discovered: 0,
      created: 0,
      updated: 0,
      versionsCreated: 0,
      unchanged: 0,
      failed: 0,
      skippedExtraction: 0,
      errors: [],
    };

    try {
      const byUrl = new Map<string, MojRegulationCandidate>();

      for (let page = 1; page <= maxPages; page += 1) {
        let listing;
        try {
          listing = await this.fetchMojListingPage(page);
          result.pagesScanned += 1;
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            reason:
              error instanceof Error
                ? `page_${page}: ${error.message}`
                : `page_${page}: unknown_error`,
          });
          continue;
        }

        if (listing.candidates.length === 0) {
          if (page > 1) {
            break;
          }
          continue;
        }

        for (const candidate of listing.candidates) {
          byUrl.set(candidate.sourceUrl, candidate);
        }
      }

      result.discovered = byUrl.size;
      for (const candidate of byUrl.values()) {
        let upserted;
        try {
          upserted = await this.upsertRegulation(candidate);
          if (upserted.created) {
            result.created += 1;
          } else if (upserted.updated) {
            result.updated += 1;
          }
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            url: candidate.sourceUrl,
            reason:
              error instanceof Error ? error.message : "failed_to_upsert_regulation",
          });
          continue;
        }

        if (!extractContent) {
          result.skippedExtraction += 1;
          continue;
        }

        const syncState = await this.syncRegulationVersion(
          upserted.regulationId,
          candidate.sourceUrl
        );

        if (syncState === "created") {
          result.versionsCreated += 1;
        } else if (syncState === "unchanged") {
          result.unchanged += 1;
        } else if (syncState === "skipped") {
          result.skippedExtraction += 1;
        } else {
          result.failed += 1;
          result.errors.push({
            url: candidate.sourceUrl,
            reason: "failed_to_sync_regulation_version",
          });
        }
      }

      await this.persistRun({
        startedAt,
        finishedAt: new Date(),
        status: "success",
        result,
        triggerSource,
        triggeredByUserId: options.triggeredByUserId,
      });

      return result;
    } catch (error) {
      await this.persistRun({
        startedAt,
        finishedAt: new Date(),
        status: "failed",
        result,
        triggerSource,
        triggeredByUserId: options.triggeredByUserId,
        errorMessage: error instanceof Error ? error.message : "unknown_sync_error",
      });
      throw error;
    }
  }

  async getMojHealthSummary(): Promise<MojSyncHealthSummary> {
    const mojRun = await this.db.query.regulationMonitorRuns.findFirst({
      where: eq(regulationMonitorRuns.triggerSource, "moj_source_sync"),
      orderBy: [desc(regulationMonitorRuns.startedAt)],
      columns: {
        startedAt: true,
        status: true,
        scanned: true,
        versionsCreated: true,
        failed: true,
      },
    });

    const trackedRows = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(regulations)
      .where(ilike(regulations.sourceUrl, `%${MOJ_HOST}%`));
    const trackedRegulations = Number(trackedRows[0]?.count || 0);

    const versionedRows = (await this.db.execute(sql`
      select count(distinct r.id)::int as count
      from regulations r
      inner join regulation_versions rv on rv.regulation_id = r.id
      where r.source_url ilike ${`%${MOJ_HOST}%`}
    `)) as Array<{ count?: number }>;
    const trackedWithVersions = Number(versionedRows[0]?.count || 0);

    if (!mojRun) {
      return {
        hasRun: false,
        lastRunAt: null,
        lastStatus: null,
        minutesSinceLastRun: null,
        scannedLastRun: 0,
        versionsCreatedLastRun: 0,
        failedLastRun: 0,
        trackedRegulations,
        trackedWithVersions,
      };
    }

    return {
      hasRun: true,
      lastRunAt: mojRun.startedAt.toISOString(),
      lastStatus: mojRun.status,
      minutesSinceLastRun: Math.floor(
        (Date.now() - mojRun.startedAt.getTime()) / 60000
      ),
      scannedLastRun: mojRun.scanned,
      versionsCreatedLastRun: mojRun.versionsCreated,
      failedLastRun: mojRun.failed,
      trackedRegulations,
      trackedWithVersions,
    };
  }
}
