import { createHash } from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import { legalSources, type NewLegalSource } from "../db/schema";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Tavily web-search ingestion.
 *
 * Unlike MOJ/Open Data, Tavily is a *discovery* source: results are
 * fetched on-demand for a specific case query, persisted with a TTL,
 * and surfaced under the "Web Research" tier in the UI.
 *
 * Trust handling:
 *   - Default tier:       "discovered"
 *   - Auto-promote tier:  "trusted" if hostname matches TAVILY_TRUSTED_DOMAINS
 *                         (e.g. *.gov.sa)
 *   - Court-citable:      false by default; lawyers must verify before citing.
 *
 * Per-organization daily quota guards against runaway costs given Tavily
 * is enabled by default in the case-linking flow.
 */

const PROVIDER_ID = "tavily";
const SOURCE_AUTHORITY = "Tavily Web Search";

interface TavilySearchOptions {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeDomains?: string[];
  excludeDomains?: string[];
  includeRawContent?: boolean;
  organizationId?: number; // for quota tracking
  caseId?: number; // for traceability
}

interface TavilyApiResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string | null;
  published_date?: string | null;
}

interface TavilyApiResponse {
  query: string;
  answer?: string | null;
  results: TavilyApiResult[];
  response_time?: number;
}

export interface IngestedTavilyResult {
  legalSourceId: number;
  title: string;
  url: string;
  snippet: string;
  tavilyScore: number;
  trustTier: "trusted" | "discovered";
  isCitableInCourt: boolean;
  publishedDate: string | null;
}

export interface TavilySearchOutcome {
  query: string;
  cached: boolean;
  results: IngestedTavilyResult[];
  quotaRemaining: number | null;
}

export class TavilyDisabledError extends Error {
  constructor() {
    super("Tavily integration is disabled (TAVILY_ENABLED=false or no API key)");
    this.name = "TavilyDisabledError";
  }
}

export class TavilyQuotaExceededError extends Error {
  constructor(public readonly organizationId: number) {
    super(
      `Tavily daily search quota exceeded for organization ${organizationId}`
    );
    this.name = "TavilyQuotaExceededError";
  }
}

export class TavilySearchService {
  private trustedDomains: string[];

  constructor(private readonly db: Database) {
    this.trustedDomains = env.TAVILY_TRUSTED_DOMAINS.split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }

  isEnabled(): boolean {
    return Boolean(env.TAVILY_ENABLED && env.TAVILY_API_KEY);
  }

  /**
   * Run a Tavily search and persist non-expired results into legal_sources.
   * Returns the list of legal_source rows (cached or freshly ingested).
   */
  async search(options: TavilySearchOptions): Promise<TavilySearchOutcome> {
    if (!this.isEnabled()) {
      throw new TavilyDisabledError();
    }

    const cacheKey = buildCacheKey(options);
    const cached = await this.lookupCache(cacheKey);
    if (cached.length > 0) {
      return {
        query: options.query,
        cached: true,
        results: cached,
        quotaRemaining: await this.getRemainingQuota(options.organizationId),
      };
    }

    // Quota check (only counted on cache miss — fresh API hits)
    if (options.organizationId !== undefined) {
      const remaining = await this.getRemainingQuota(options.organizationId);
      if (remaining !== null && remaining <= 0) {
        throw new TavilyQuotaExceededError(options.organizationId);
      }
    }

    const apiResponse = await this.callTavilyApi(options);
    const ingested = await this.persistResults(cacheKey, apiResponse, options);

    return {
      query: options.query,
      cached: false,
      results: ingested,
      quotaRemaining: await this.getRemainingQuota(options.organizationId),
    };
  }

  private async callTavilyApi(
    options: TavilySearchOptions
  ): Promise<TavilyApiResponse> {
    const url = `${env.TAVILY_BASE_URL}/search`;
    const body = {
      api_key: env.TAVILY_API_KEY,
      query: options.query,
      search_depth: options.searchDepth ?? env.TAVILY_DEFAULT_SEARCH_DEPTH,
      max_results: options.maxResults ?? env.TAVILY_DEFAULT_MAX_RESULTS,
      include_raw_content: options.includeRawContent ?? false,
      include_domains: options.includeDomains,
      exclude_domains: options.excludeDomains,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Tavily API returned HTTP ${response.status}: ${text.slice(0, 200)}`
      );
    }

    return (await response.json()) as TavilyApiResponse;
  }

  private async persistResults(
    cacheKey: string,
    apiResponse: TavilyApiResponse,
    options: TavilySearchOptions
  ): Promise<IngestedTavilyResult[]> {
    const expiresAt = addDays(new Date(), env.TAVILY_CACHE_TTL_DAYS);
    const ingested: IngestedTavilyResult[] = [];

    for (let i = 0; i < apiResponse.results.length; i += 1) {
      const r = apiResponse.results[i];
      try {
        const hostname = safeHostname(r.url);
        const isTrustedDomain = hostname
          ? this.trustedDomains.some(
              (d) => hostname === d || hostname.endsWith(`.${d}`)
            )
          : false;

        const trustTier: "trusted" | "discovered" = isTrustedDomain
          ? "trusted"
          : "discovered";
        const isCitableInCourt = isTrustedDomain;

        const sourceMetadata = {
          tavily_score: r.score,
          tavily_query: apiResponse.query,
          tavily_cache_key: cacheKey,
          tavily_response_time: apiResponse.response_time,
          host: hostname,
          fetched_at: new Date().toISOString(),
          case_id: options.caseId,
          organization_id: options.organizationId,
          tavily_answer: apiResponse.answer ?? null,
          rank_in_response: i,
          raw_content_present: Boolean(r.raw_content),
        };

        const newRow: NewLegalSource = {
          sourceType: "web_source",
          trustTier,
          sourceAuthority: SOURCE_AUTHORITY,
          isCitableInCourt,
          title: (r.title || r.url).slice(0, 1000),
          summary: r.content?.slice(0, 4000) ?? undefined,
          sourceUrl: r.url,
          canonicalIdentifier: hashString(r.url),
          language: detectLanguage(r.title, r.content),
          sourceProvider: PROVIDER_ID,
          // sourceSerial uses cacheKey + url hash so the same URL surfaced by
          // different queries gets independent rows (different relevance ranks).
          sourceSerial: `${cacheKey}:${hashString(r.url).slice(0, 12)}`,
          sourceListingUrl: undefined,
          sourceMetadata,
          sourceMetadataHash: hashString(JSON.stringify(sourceMetadata)),
          jurisdiction: "SA",
          monitoringEnabled: false, // Tavily results aren't re-checked
          expiresAt,
        };

        // Idempotent insert: if (provider, serial) already present, just touch expiresAt
        const existing = await this.db
          .select({ id: legalSources.id })
          .from(legalSources)
          .where(
            and(
              eq(legalSources.sourceProvider, PROVIDER_ID),
              eq(legalSources.sourceSerial, newRow.sourceSerial!)
            )
          )
          .limit(1);

        let id: number;
        if (existing.length > 0) {
          id = existing[0].id;
          await this.db
            .update(legalSources)
            .set({ expiresAt, updatedAt: new Date() })
            .where(eq(legalSources.id, id));
        } else {
          const inserted = await this.db
            .insert(legalSources)
            .values(newRow)
            .returning({ id: legalSources.id });
          id = inserted[0].id;
        }

        ingested.push({
          legalSourceId: id,
          title: newRow.title,
          url: r.url,
          snippet: r.content?.slice(0, 500) ?? "",
          tavilyScore: r.score,
          trustTier,
          isCitableInCourt,
          publishedDate: r.published_date ?? null,
        });
      } catch (err) {
        logger.warn(
          { err, url: r.url, query: options.query },
          "tavily: failed to persist result"
        );
      }
    }

    return ingested;
  }

  /**
   * Look up existing non-expired Tavily rows for a given cache key.
   */
  private async lookupCache(cacheKey: string): Promise<IngestedTavilyResult[]> {
    const rows = await this.db
      .select({
        id: legalSources.id,
        title: legalSources.title,
        url: legalSources.sourceUrl,
        summary: legalSources.summary,
        sourceMetadata: legalSources.sourceMetadata,
        trustTier: legalSources.trustTier,
        isCitableInCourt: legalSources.isCitableInCourt,
      })
      .from(legalSources)
      .where(
        and(
          eq(legalSources.sourceProvider, PROVIDER_ID),
          sql`${legalSources.sourceSerial} like ${`${cacheKey}:%`}`,
          gt(legalSources.expiresAt, new Date())
        )
      )
      .orderBy(legalSources.id);

    return rows
      .filter((r) => r.url !== null)
      .map<IngestedTavilyResult>((r) => {
        const meta = (r.sourceMetadata ?? {}) as Record<string, unknown>;
        return {
          legalSourceId: r.id,
          title: r.title,
          url: r.url as string,
          snippet: (r.summary ?? "").slice(0, 500),
          tavilyScore:
            typeof meta.tavily_score === "number" ? meta.tavily_score : 0,
          trustTier: (r.trustTier as "trusted" | "discovered") ?? "discovered",
          isCitableInCourt: r.isCitableInCourt,
          publishedDate: null,
        };
      });
  }

  /**
   * Returns remaining quota for the org today, or null if quota disabled.
   * Counts rows inserted today by sourceProvider='tavily' attributed to this org.
   */
  private async getRemainingQuota(
    organizationId: number | undefined
  ): Promise<number | null> {
    const limit = env.TAVILY_DAILY_SEARCH_LIMIT_PER_ORG;
    if (!limit || limit <= 0 || organizationId === undefined) return null;

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(legalSources)
      .where(
        and(
          eq(legalSources.sourceProvider, PROVIDER_ID),
          sql`${legalSources.createdAt} > now() - interval '1 day'`,
          sql`${legalSources.sourceMetadata}->>'organization_id' = ${String(organizationId)}`
        )
      );

    const used = result[0]?.count ?? 0;
    return Math.max(0, limit - used);
  }
}

function buildCacheKey(options: TavilySearchOptions): string {
  const normalized = {
    q: options.query.trim().toLowerCase(),
    md: options.maxResults ?? env.TAVILY_DEFAULT_MAX_RESULTS,
    sd: options.searchDepth ?? env.TAVILY_DEFAULT_SEARCH_DEPTH,
    inc: (options.includeDomains ?? []).slice().sort(),
    exc: (options.excludeDomains ?? []).slice().sort(),
  };
  return hashString(JSON.stringify(normalized)).slice(0, 24);
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function detectLanguage(
  title: string | undefined,
  body: string | undefined
): "ar" | "en" | "mixed" {
  const text = `${title ?? ""} ${body ?? ""}`;
  const hasArabic = /[؀-ۿ]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasArabic && hasLatin) return "mixed";
  if (hasArabic) return "ar";
  return "en";
}
