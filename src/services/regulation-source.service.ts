import { createHash } from "crypto";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulationMonitorRuns,
  regulations,
  regulationVersions,
} from "../db/schema";
import { env } from "../config/env";
import { AIClientService } from "./ai-client.service";
import { RegulationRagService } from "./regulation-rag.service";
import { logger } from "../utils/logger";

type RegulationCategory =
  | "criminal_law"
  | "civil_law"
  | "commercial_law"
  | "labor_law"
  | "procedural_law";

type RegulationStatus = "active" | "amended" | "repealed" | "draft";
type SourceProvider = "moj";
type JsonObject = Record<string, unknown>;

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
  sourceProvider: SourceProvider;
  sourceSerial?: string;
  regulationNumber?: string;
  category?: RegulationCategory;
  status?: RegulationStatus;
  effectiveDate?: string;
  summary?: string;
  sourceMetadata: JsonObject;
  sourceMetadataHash: string | null;
}

interface MojGatewayHardCopy {
  id?: string | number | null;
  documentId?: string | null;
  documentName?: string | null;
  extention?: string | null;
  documentType?: string | number | null;
  uploadTime?: string | null;
  downloadUrl?: string | null;
  [key: string]: unknown;
}

interface MojGatewayStatuteRow {
  serial?: string;
  statuteName?: string;
  legalType?: string | null;
  legalStatueName?: string | null;
  legalStatue?: number | null;
  gregorianValidFromDate?: string | null;
  activationDateG?: string | null;
  issuanceDateG?: string | null;
  issueDateG?: string | null;
  publishDateG?: string | null;
  summary?: string | null;
  sections?: unknown;
  hardCopy?: MojGatewayHardCopy | null;
  [key: string]: unknown;
}

interface MojGatewaySearchResponse {
  success?: boolean;
  message?: string;
  model?: {
    collection?: MojGatewayStatuteRow[];
    pageNumber?: number;
    pageSize?: number;
    totalCount?: number;
    totalPages?: number;
  };
}

interface MojGatewayDetailResponse {
  success?: boolean;
  message?: string;
  model?: unknown;
  data?: unknown;
  result?: unknown;
  [key: string]: unknown;
}

interface MojStatuteStructureItem {
  name?: string;
  sequence?: string;
  text?: string;
  legalStatusName?: string;
  decree?: string;
  items?: MojStatuteStructureItem[];
  [key: string]: unknown;
}

interface MojStatuteGetResponse {
  success?: boolean;
  message?: string;
  model?: {
    statuteName?: string;
    summary?: string;
    statuteStructure?: MojStatuteStructureItem[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface MojListingPageResult {
  listingUrl: string;
  candidates: MojRegulationCandidate[];
  totalPages?: number;
}

const MOJ_HOST = "laws.moj.gov.sa";
const MOJ_GATEWAY_HOST = "laws-gateway.moj.gov.sa";
const MOJ_SOURCE_PROVIDER: SourceProvider = "moj";
const MOJ_GATEWAY_BASE_URL = "https://laws-gateway.moj.gov.sa/apis/legislations/v1";
const MOJ_GATEWAY_SEARCH_URL = `${MOJ_GATEWAY_BASE_URL}/statute/section-search`;
const MOJ_GATEWAY_STATUTE_GET_URL = `${MOJ_GATEWAY_BASE_URL}/statute/get-Statute-gateway-Detail`;
const DEFAULT_LISTING_URL =
  "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1&pageSize=9&sortingBy=7";

export class RegulationSourceService {
  private readonly aiClient: AIClientService | null;
  private readonly regulationRagService: RegulationRagService | null;

  constructor(private readonly db: Database) {
    this.aiClient = env.AI_SERVICE_URL ? new AIClientService() : null;
    this.regulationRagService = env.AI_SERVICE_URL
      ? new RegulationRagService(this.db, this.aiClient || undefined)
      : null;
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  private hashNormalizedText(text: string): string {
    return createHash("sha256")
      .update(this.normalizeWhitespace(text), "utf-8")
      .digest("hex");
  }

  private toPlainJsonObject(value: unknown): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return JSON.parse(JSON.stringify(value)) as JsonObject;
  }

  private sortJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortJsonValue(item));
    }
    if (value && typeof value === "object") {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        const nested = (value as Record<string, unknown>)[key];
        if (typeof nested === "undefined") {
          continue;
        }
        sorted[key] = this.sortJsonValue(nested);
      }
      return sorted;
    }
    return value;
  }

  private stableJsonString(value: unknown): string {
    return JSON.stringify(this.sortJsonValue(value));
  }

  private hashSourceMetadata(sourceMetadata: JsonObject): string | null {
    if (!sourceMetadata || Object.keys(sourceMetadata).length === 0) {
      return null;
    }
    return createHash("sha256")
      .update(this.stableJsonString(sourceMetadata), "utf-8")
      .digest("hex");
  }

  private normalizeContentText(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
      const normalizedHref = href.replace(/\\\//g, "/").trim();
      const url = new URL(normalizedHref, baseUrl);

      if (url.hostname.toLowerCase() !== MOJ_HOST) {
        return null;
      }
      if (!url.pathname || url.pathname === "/") {
        return null;
      }

      const normalizedPath = url.pathname.replace(/\/+$/, "");
      const lowerPath = normalizedPath.toLowerCase();
      if (
        lowerPath === "/ar/legislations-regulations" ||
        lowerPath === "/legislations-regulations" ||
        lowerPath === "/ar" ||
        lowerPath === "/en"
      ) {
        return null;
      }
      if (/\.(css|js|map|png|jpe?g|svg|gif|ico|woff2?|ttf|eot)$/i.test(lowerPath)) {
        return null;
      }

      if (url.searchParams.has("pageNumber")) {
        url.searchParams.delete("pageNumber");
      }
      if (url.searchParams.has("pageSize")) {
        url.searchParams.delete("pageSize");
      }
      if (url.searchParams.has("sortingBy")) {
        url.searchParams.delete("sortingBy");
      }

      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }

  private getUrlPath(sourceUrl: string): string {
    try {
      return new URL(sourceUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  }

  private isLikelyRegulationTitle(title: string): boolean {
    const normalized = this.normalizeWhitespace(title).toLowerCase();
    if (!normalized || normalized.length < 4) {
      return false;
    }

    return /(لائحة|نظام|تشريع|قانون|قرار|law|regulation|legislation|statute|bylaw|decree)/i.test(
      normalized
    );
  }

  private isLikelyRegulationUrl(sourceUrl: string): boolean {
    const path = this.getUrlPath(sourceUrl);
    if (!path) {
      return false;
    }

    return /(legislation|regulation|laws|نظام|لائحة|law)/i.test(path);
  }

  private inferTitleFromUrl(sourceUrl: string): string {
    try {
      const url = new URL(sourceUrl);
      const rawSegment = decodeURIComponent(
        url.pathname.split("/").filter(Boolean).pop() || ""
      );
      const cleaned = this.normalizeWhitespace(
        rawSegment.replace(/[-_]+/g, " ").replace(/\.[a-z0-9]+$/i, "")
      );
      if (cleaned && cleaned.length >= 4) {
        return cleaned;
      }

      const idMatch = url.pathname.match(/(\d{2,})/);
      if (idMatch?.[1]) {
        return `MOJ Regulation ${idMatch[1]}`;
      }
    } catch {
      // ignore and use fallback
    }

    return "MOJ Regulation";
  }

  private normalizeEmbeddedUrl(raw: string): string {
    return raw
      .replace(/\\u002F/gi, "/")
      .replace(/\\\//g, "/")
      .trim();
  }

  private toDateOnly(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const directDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directDate?.[1]) {
      return directDate[1];
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString().slice(0, 10);
  }

  private buildMojPublicRegulationUrl(serial: string): string {
    return `https://${MOJ_HOST}/ar/legislation/${encodeURIComponent(serial)}`;
  }

  private inferStatusFromGateway(row: MojGatewayStatuteRow): RegulationStatus {
    const name = (row.legalStatueName || "").toLowerCase();
    if (/(ملغى|repealed|إلغاء)/i.test(name)) {
      return "repealed";
    }
    if (/(مسودة|draft)/i.test(name)) {
      return "draft";
    }
    if (/(معدل|amended|تعديل)/i.test(name)) {
      return "amended";
    }
    return "active";
  }

  private mapGatewayRowToCandidate(
    row: MojGatewayStatuteRow,
    sourceListingUrl: string
  ): MojRegulationCandidate | null {
    const serial = this.normalizeWhitespace(row.serial || "");
    const title = this.normalizeWhitespace(row.statuteName || "");
    if (!serial || !title) {
      return null;
    }

    const effectiveDate =
      this.toDateOnly(row.gregorianValidFromDate) ||
      this.toDateOnly(row.activationDateG) ||
      this.toDateOnly(row.issuanceDateG) ||
      this.toDateOnly(row.issueDateG) ||
      this.toDateOnly(row.publishDateG);

    const sourceMetadata = this.toPlainJsonObject(row);

    return {
      title,
      sourceUrl: this.buildMojPublicRegulationUrl(serial),
      sourceListingUrl,
      sourceProvider: MOJ_SOURCE_PROVIDER,
      sourceSerial: serial,
      regulationNumber: serial,
      category: this.inferCategory(`${title} ${row.legalType || ""}`),
      status: this.inferStatusFromGateway(row),
      effectiveDate,
      summary:
        typeof row.summary === "string" ? this.normalizeWhitespace(row.summary) : undefined,
      sourceMetadata,
      sourceMetadataHash: this.hashSourceMetadata(sourceMetadata),
    };
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
    const byUrl = new Map<string, MojRegulationCandidate>();
    const pushCandidate = (sourceUrl: string, titleSeed?: string) => {
      const hasRegulationUrl = this.isLikelyRegulationUrl(sourceUrl);
      const normalizedTitle = this.normalizeWhitespace(
        this.decodeHtmlEntities(titleSeed || "")
      );
      const hasExplicitTitle = normalizedTitle.length >= 4;
      const title = hasExplicitTitle
        ? normalizedTitle
        : this.inferTitleFromUrl(sourceUrl);

      if (!hasRegulationUrl && !this.isLikelyRegulationTitle(title)) {
        return;
      }

      const existing = byUrl.get(sourceUrl);
      if (existing && !hasExplicitTitle) {
        return;
      }

      const selectedTitle = hasExplicitTitle ? title : existing?.title || title;

      byUrl.set(sourceUrl, {
        title: selectedTitle,
        sourceUrl,
        sourceListingUrl: listingUrl,
        sourceProvider: MOJ_SOURCE_PROVIDER,
        regulationNumber: this.inferRegulationNumber(selectedTitle),
        category: this.inferCategory(selectedTitle),
        status: this.inferStatus(selectedTitle),
        sourceMetadata: {},
        sourceMetadataHash: null,
      });
    };

    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let anchorMatch: RegExpExecArray | null;
    while ((anchorMatch = anchorRegex.exec(html)) !== null) {
      const attrs = anchorMatch[1] || "";
      const innerHtml = anchorMatch[2] || "";
      const hrefMatch = attrs.match(
        /\b(?:href|data-href|data-url)\s*=\s*["']([^"']+)["']/i
      );
      if (!hrefMatch?.[1]) {
        continue;
      }

      const sourceUrl = this.canonicalizeMojUrl(
        this.normalizeEmbeddedUrl(hrefMatch[1]),
        listingUrl
      );
      if (!sourceUrl) {
        continue;
      }

      const titleAttrMatch = attrs.match(/title\s*=\s*["']([^"']+)["']/i);
      const titleFromInner = this.decodeHtmlEntities(this.stripHtml(innerHtml));
      const titleFromAttr = this.decodeHtmlEntities(titleAttrMatch?.[1] || "");
      pushCandidate(sourceUrl, titleFromInner || titleFromAttr);
    }

    const attrUrlRegex = /\b(?:href|data-href|data-url)\s*=\s*["']([^"']+)["']/gi;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrUrlRegex.exec(html)) !== null) {
      const sourceUrl = this.canonicalizeMojUrl(
        this.normalizeEmbeddedUrl(attrMatch[1]),
        listingUrl
      );
      if (!sourceUrl) {
        continue;
      }
      pushCandidate(sourceUrl);
    }

    const jsonPairRegex =
      /"(?:title|name)"\s*:\s*"([^"]{4,500})"[\s\S]{0,240}?"(?:url|href|link)"\s*:\s*"([^"]+)"/gi;
    let jsonPairMatch: RegExpExecArray | null;
    while ((jsonPairMatch = jsonPairRegex.exec(html)) !== null) {
      const sourceUrl = this.canonicalizeMojUrl(
        this.normalizeEmbeddedUrl(jsonPairMatch[2]),
        listingUrl
      );
      if (!sourceUrl) {
        continue;
      }
      pushCandidate(sourceUrl, this.normalizeEmbeddedUrl(jsonPairMatch[1]));
    }

    const jsonUrlRegex = /"(?:url|href|link)"\s*:\s*"([^"]+)"/gi;
    let jsonUrlMatch: RegExpExecArray | null;
    while ((jsonUrlMatch = jsonUrlRegex.exec(html)) !== null) {
      const sourceUrl = this.canonicalizeMojUrl(
        this.normalizeEmbeddedUrl(jsonUrlMatch[1]),
        listingUrl
      );
      if (!sourceUrl) {
        continue;
      }
      pushCandidate(sourceUrl);
    }

    return [...byUrl.values()];
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

  private async fetchMojGatewayPage(pageNumber: number): Promise<MojListingPageResult> {
    const listingUrl = `${MOJ_GATEWAY_SEARCH_URL}?pageNumber=${pageNumber}`;
    const response = await fetch(MOJ_GATEWAY_SEARCH_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        languageCode: "ar",
      },
      body: JSON.stringify({
        pageNumber,
        pageSize: 9,
        keyword: "",
        detailsKeyword: "",
        LegalStatue: null,
        classificationId: null,
        sortingBy: 7,
        statuteIssueDateFrom: null,
        statuteIssueDateTo: null,
        statuteName: "",
        statutePublishDateFrom: null,
        statutePublishDateTo: null,
        statuteType: null,
        isSearch: false,
        identityNumber: "",
      }),
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Gateway HTTP ${response.status} for page ${pageNumber}`);
    }

    const payload = (await response.json()) as MojGatewaySearchResponse;
    if (!payload?.success) {
      throw new Error(payload?.message || "Gateway search returned unsuccessful status");
    }

    const rows = Array.isArray(payload?.model?.collection)
      ? payload.model.collection
      : [];
    const candidates = rows
      .map((row) => this.mapGatewayRowToCandidate(row, listingUrl))
      .filter((row): row is MojRegulationCandidate => Boolean(row));
    const totalPages =
      typeof payload?.model?.totalPages === "number" && payload.model.totalPages > 0
        ? payload.model.totalPages
        : undefined;

    return {
      listingUrl,
      candidates,
      totalPages,
    };
  }

  private async fetchMojListingPage(pageNumber: number): Promise<MojListingPageResult> {
    try {
      return await this.fetchMojGatewayPage(pageNumber);
    } catch (gatewayError) {
      logger.warn(
        {
          pageNumber,
          err:
            gatewayError instanceof Error
              ? gatewayError.message
              : "unknown_gateway_error",
        },
        "MOJ gateway search failed; falling back to HTML listing parse"
      );
    }

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
    return { listingUrl, candidates, totalPages: undefined };
  }

  private normalizeMojDocumentUrl(urlValue: string): string | null {
    try {
      const cleaned = urlValue.trim();
      if (/^(\/)?(apis|selfservices)\/legislations\/v1\//i.test(cleaned)) {
        const path = cleaned.replace(/^\/+/, "");
        return `https://${MOJ_GATEWAY_HOST}/${path}`;
      }

      const url = new URL(cleaned, `https://${MOJ_HOST}`);
      return url.toString();
    } catch {
      return null;
    }
  }

  private extractDocumentToken(urlValue?: string | null): string | null {
    if (!urlValue || typeof urlValue !== "string") {
      return null;
    }

    try {
      const url = new URL(urlValue.trim(), `https://${MOJ_GATEWAY_HOST}`);
      const token = url.searchParams.get("Document") || url.searchParams.get("document");
      if (typeof token === "string" && token.trim()) {
        return token.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  private isLikelyPortalShellContent(text: string, rawHtml?: string | null): boolean {
    const normalized = this.normalizeWhitespace(text).toLowerCase();
    if (!normalized) {
      return true;
    }

    if (/^\.*\s*البوابة القانونية\s*loading\.{0,3}$/i.test(normalized)) {
      return true;
    }
    if (/^\.*\s*loading\.{0,3}$/i.test(normalized)) {
      return true;
    }

    const hasPortalMarkers =
      /البوابة القانونية|legal portal|loading|nuxt-loading|__nuxt__/i.test(
        normalized
      ) || /id="nuxt-loading"|window\.__NUXT__|<div id="__nuxt">/i.test(rawHtml || "");
    if (hasPortalMarkers && normalized.length < 350) {
      return true;
    }

    return false;
  }

  private isLikelyBlockedContent(text: string, rawHtml?: string | null): boolean {
    const normalized = this.normalizeWhitespace(text).toLowerCase();
    const htmlProbe = (rawHtml || "").toLowerCase();
    if (!normalized && !htmlProbe) {
      return false;
    }

    const blockedPatterns = [
      /request rejected/i,
      /requested url was rejected/i,
      /support id\s*:\s*\d{8,}/i,
      /please consult with your administrator/i,
      /\[go back\]/i,
      /access denied/i,
      /forbidden/i,
      /تم رفض الطلب/i,
      /تم حظر/i,
    ];

    return blockedPatterns.some((pattern) =>
      pattern.test(normalized) || pattern.test(htmlProbe)
    );
  }

  private isInvalidExtractedContent(text: string, rawHtml?: string | null): boolean {
    return (
      this.isLikelyPortalShellContent(text, rawHtml) ||
      this.isLikelyBlockedContent(text, rawHtml)
    );
  }

  private getHardCopyDownloadUrl(candidate: MojRegulationCandidate): string | null {
    return this.getHardCopyDownloadUrls(candidate)[0] || null;
  }

  private getHardCopyDownloadUrls(candidate: MojRegulationCandidate): string[] {
    const urls: string[] = [];
    const pushUnique = (urlValue?: string | null) => {
      if (!urlValue || typeof urlValue !== "string") {
        return;
      }
      const normalized = this.normalizeMojDocumentUrl(urlValue);
      if (normalized && !urls.includes(normalized)) {
        urls.push(normalized);
      }
    };

    const hardCopy = candidate.sourceMetadata?.hardCopy;
    if (!hardCopy || typeof hardCopy !== "object") {
      return urls;
    }
    const downloadUrl = (hardCopy as MojGatewayHardCopy).downloadUrl;
    if (!downloadUrl || typeof downloadUrl !== "string") {
      return urls;
    }
    pushUnique(downloadUrl);

    const documentToken = this.extractDocumentToken(downloadUrl);
    if (documentToken) {
      const encodedToken = encodeURIComponent(documentToken);
      const generatedUrls = [
        `https://${MOJ_GATEWAY_HOST}/apis/legislations/v1/document/download?Document=${encodedToken}`,
        `https://${MOJ_GATEWAY_HOST}/selfservices/apis/legislations/v1/document/download?Document=${encodedToken}`,
        `https://${MOJ_HOST}/apis/legislations/v1/document/download?Document=${encodedToken}`,
        `https://${MOJ_HOST}/selfservices/apis/legislations/v1/document/download?Document=${encodedToken}`,
      ];
      for (const generatedUrl of generatedUrls) {
        pushUnique(generatedUrl);
      }
    }

    return urls;
  }

  private getHardCopyDocumentName(candidate: MojRegulationCandidate): string {
    const hardCopy = candidate.sourceMetadata?.hardCopy;
    if (hardCopy && typeof hardCopy === "object") {
      const name = (hardCopy as MojGatewayHardCopy).documentName;
      if (typeof name === "string" && name.trim()) {
        return name.trim();
      }
    }

    if (candidate.sourceSerial) {
      return `${candidate.sourceSerial}.pdf`;
    }
    return `regulation-${Date.now()}.pdf`;
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = this.normalizeWhitespace(value);
    return normalized || null;
  }

  private extractGatewayDetailModel(payload: MojGatewayDetailResponse): unknown {
    if (payload?.model) {
      return payload.model;
    }
    if (payload?.data) {
      return payload.data;
    }
    if (payload?.result) {
      return payload.result;
    }
    return payload;
  }

  private buildMojGatewayDetailEndpoints(): string[] {
    const roots = [
      `https://${MOJ_GATEWAY_HOST}/apis/legislations/v1`,
      `https://${MOJ_GATEWAY_HOST}/selfservices/apis/legislations/v1`,
    ];
    const paths = [
      "/statute/get-Statute-gateway-Detail",
      "/statute/get-statute-gateway-detail",
      "/statute/detail",
      "/statute/get-detail",
    ];

    const endpoints: string[] = [];
    for (const root of roots) {
      for (const path of paths) {
        endpoints.push(`${root}${path}`);
      }
    }
    return endpoints;
  }

  private buildMojGatewayDetailPayloads(candidate: MojRegulationCandidate): JsonObject[] {
    const metadata = candidate.sourceMetadata || {};
    const statuteId =
      this.toNonEmptyString(metadata.statuteId) ||
      this.toNonEmptyString((metadata as Record<string, unknown>).statuteID) ||
      this.toNonEmptyString((metadata as Record<string, unknown>).id);
    const serial =
      candidate.sourceSerial ||
      this.toNonEmptyString(metadata.serial) ||
      this.toNonEmptyString((metadata as Record<string, unknown>).regulationNumber);

    const payloads: JsonObject[] = [];
    const addPayload = (payload: JsonObject) => {
      const nonEmptyEntries = Object.entries(payload).filter(([, value]) =>
        typeof value === "string" ? value.trim().length > 0 : value != null
      );
      if (nonEmptyEntries.length === 0) {
        return;
      }
      const normalized = Object.fromEntries(nonEmptyEntries);
      const key = this.stableJsonString(normalized);
      if (!payloads.some((existing) => this.stableJsonString(existing) === key)) {
        payloads.push(normalized);
      }
    };

    addPayload({ statuteId, serial });
    addPayload({ statuteId });
    addPayload({ statuteID: statuteId });
    addPayload({ id: statuteId });
    addPayload({ serial });
    addPayload({ statuteSerial: serial });
    addPayload({ serialNumber: serial });

    return payloads;
  }

  private formatStatuteStructure(items: MojStatuteStructureItem[], depth: number = 0): string {
    const lines: string[] = [];

    for (const item of items) {
      const name = this.normalizeWhitespace(item.name || "");
      const sequence = this.normalizeWhitespace(item.sequence || "");

      const heading = [sequence, name].filter(Boolean).join(" - ");
      if (heading) {
        const prefix = depth === 0 ? "=" : depth === 1 ? "-" : " ";
        const separator = prefix.repeat(Math.max(heading.length, 40));
        lines.push(separator);
        lines.push(heading);
        lines.push(separator);
      }

      if (item.text) {
        const plainText = this.normalizeWhitespace(
          this.decodeHtmlEntities(this.stripHtml(item.text))
        );
        if (plainText.length >= 4) {
          lines.push(plainText);
        }
      }

      if (Array.isArray(item.items) && item.items.length > 0) {
        const childrenText = this.formatStatuteStructure(item.items, depth + 1);
        if (childrenText) {
          lines.push(childrenText);
        }
      }

      lines.push("");
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  private async extractFromMojGatewayStatuteGet(
    params: {
      candidate: MojRegulationCandidate;
      fallbackText: string | null;
      extractionAttempts: Array<Record<string, unknown>>;
    }
  ): Promise<{
    text: string;
    hash: string;
    sourceUrl: string;
    method: string;
    status: string;
  } | null> {
    const { candidate, fallbackText, extractionAttempts } = params;

    const serial =
      candidate.sourceSerial ||
      this.toNonEmptyString(candidate.sourceMetadata?.serial) ||
      this.toNonEmptyString(
        (candidate.sourceMetadata as Record<string, unknown>)?.regulationNumber
      );

    if (!serial) {
      extractionAttempts.push({
        sourceUrl: MOJ_GATEWAY_STATUTE_GET_URL,
        mode: "moj_gateway_statute_get",
        status: "skipped_no_serial",
      });
      return null;
    }

    const requestUrl = `${MOJ_GATEWAY_STATUTE_GET_URL}?Serial=${encodeURIComponent(serial)}&identityNumber=`;

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: "GET",
        headers: {
          accept: "application/json",
          languageCode: "ar",
        },
        redirect: "follow",
      });
    } catch (error) {
      extractionAttempts.push({
        sourceUrl: requestUrl,
        mode: "moj_gateway_statute_get",
        status: "request_failed",
        error: error instanceof Error ? error.message : "unknown_error",
      });
      return null;
    }

    if (!response.ok) {
      extractionAttempts.push({
        sourceUrl: requestUrl,
        mode: "moj_gateway_statute_get",
        status: "http_error",
        httpStatus: response.status,
      });
      return null;
    }

    let payload: MojStatuteGetResponse;
    try {
      payload = (await response.json()) as MojStatuteGetResponse;
    } catch (error) {
      extractionAttempts.push({
        sourceUrl: requestUrl,
        mode: "moj_gateway_statute_get",
        status: "invalid_json",
        error: error instanceof Error ? error.message : "unknown_error",
      });
      return null;
    }

    if (!payload?.success || !payload?.model) {
      extractionAttempts.push({
        sourceUrl: requestUrl,
        mode: "moj_gateway_statute_get",
        status: "unsuccessful_response",
        success: payload?.success,
        message: payload?.message,
      });
      return null;
    }

    const statuteStructure = payload.model.statuteStructure;
    if (!Array.isArray(statuteStructure) || statuteStructure.length === 0) {
      extractionAttempts.push({
        sourceUrl: requestUrl,
        mode: "moj_gateway_statute_get",
        status: "no_statute_structure",
      });
      return null;
    }

    const formattedText = this.formatStatuteStructure(statuteStructure);
    const candidateText = this.normalizeContentText(formattedText);

    extractionAttempts.push({
      sourceUrl: requestUrl,
      mode: "moj_gateway_statute_get",
      status: "ok",
      extractedChars: candidateText.length,
      sectionsCount: statuteStructure.length,
    });

    if (!candidateText || candidateText.length < 200) {
      return null;
    }

    const normalizedFallback = fallbackText ? this.normalizeWhitespace(fallbackText) : "";
    if (
      normalizedFallback &&
      this.normalizeWhitespace(candidateText) === normalizedFallback
    ) {
      return null;
    }

    if (this.isInvalidExtractedContent(candidateText, null)) {
      return null;
    }

    return {
      text: candidateText,
      hash: this.hashNormalizedText(candidateText),
      sourceUrl: requestUrl,
      method: "moj-gateway:statute_get",
      status: "ok",
    };
  }

  private async extractFromMojGatewayDetail(
    params: {
      candidate: MojRegulationCandidate;
      fallbackText: string | null;
      extractionAttempts: Array<Record<string, unknown>>;
    }
  ): Promise<{
    text: string;
    hash: string;
    sourceUrl: string;
    method: string;
    status: string;
  } | null> {
    const { candidate, fallbackText, extractionAttempts } = params;
    const endpoints = this.buildMojGatewayDetailEndpoints();
    const payloads = this.buildMojGatewayDetailPayloads(candidate);
    if (payloads.length === 0) {
      return null;
    }

    const normalizedFallback = fallbackText ? this.normalizeWhitespace(fallbackText) : "";

    const validateCandidate = (candidateText: string, sourceUrl: string): {
      text: string;
      hash: string;
      sourceUrl: string;
      method: string;
      status: string;
    } | null => {
      if (!candidateText || candidateText.length < 200) {
        return null;
      }
      if (
        normalizedFallback &&
        this.normalizeWhitespace(candidateText) === normalizedFallback
      ) {
        return null;
      }
      if (this.isInvalidExtractedContent(candidateText, null)) {
        return null;
      }
      return {
        text: candidateText,
        hash: this.hashNormalizedText(candidateText),
        sourceUrl,
        method: "moj-gateway:statute_detail",
        status: "ok",
      };
    };

    // Try GET requests with Serial query param on each endpoint first
    const serial =
      candidate.sourceSerial ||
      this.toNonEmptyString(candidate.sourceMetadata?.serial) ||
      this.toNonEmptyString(
        (candidate.sourceMetadata as Record<string, unknown>)?.regulationNumber
      );

    if (serial) {
      for (const endpoint of endpoints) {
        const getUrl = `${endpoint}?Serial=${encodeURIComponent(serial)}&identityNumber=`;
        let response: Response;
        try {
          response = await fetch(getUrl, {
            method: "GET",
            headers: {
              accept: "application/json",
              languageCode: "ar",
            },
            redirect: "follow",
          });
        } catch (error) {
          extractionAttempts.push({
            sourceUrl: getUrl,
            mode: "moj_gateway_detail_get",
            status: "request_failed",
            error: error instanceof Error ? error.message : "unknown_error",
          });
          continue;
        }

        if (!response.ok) {
          extractionAttempts.push({
            sourceUrl: getUrl,
            mode: "moj_gateway_detail_get",
            status: "http_error",
            httpStatus: response.status,
          });
          continue;
        }

        let payloadJson: MojStatuteGetResponse;
        try {
          payloadJson = (await response.json()) as MojStatuteGetResponse;
        } catch (error) {
          extractionAttempts.push({
            sourceUrl: getUrl,
            mode: "moj_gateway_detail_get",
            status: "invalid_json",
            error: error instanceof Error ? error.message : "unknown_error",
          });
          continue;
        }

        const statuteStructure = payloadJson?.model?.statuteStructure;
        if (Array.isArray(statuteStructure) && statuteStructure.length > 0) {
          const formattedText = this.formatStatuteStructure(statuteStructure);
          const candidateText = this.normalizeContentText(formattedText);

          extractionAttempts.push({
            sourceUrl: getUrl,
            mode: "moj_gateway_detail_get",
            status: "ok",
            extractedChars: candidateText.length,
            sectionsCount: statuteStructure.length,
          });

          const result = validateCandidate(candidateText, getUrl);
          if (result) {
            return result;
          }
        } else {
          // Fall back to generic text collection from the response model
          const model = this.extractGatewayDetailModel(payloadJson as MojGatewayDetailResponse);
          const snippets: string[] = [];
          this.collectTextValues(model, snippets);
          const candidateText = this.normalizeContentText(
            [...new Set(snippets.map((item) => this.normalizeWhitespace(item)))]
              .filter((item) => item.length > 0)
              .join("\n\n")
          );

          extractionAttempts.push({
            sourceUrl: getUrl,
            mode: "moj_gateway_detail_get",
            status: "ok_collect_fallback",
            extractedChars: candidateText.length,
          });

          const result = validateCandidate(candidateText, getUrl);
          if (result) {
            return result;
          }
        }
      }
    }

    // Fall back to POST requests with various payloads
    for (const endpoint of endpoints) {
      for (const payload of payloads) {
        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              languageCode: "ar",
            },
            body: JSON.stringify(payload),
            redirect: "follow",
          });
        } catch (error) {
          extractionAttempts.push({
            sourceUrl: endpoint,
            mode: "moj_gateway_detail_fetch",
            status: "request_failed",
            payloadKeys: Object.keys(payload),
            error: error instanceof Error ? error.message : "unknown_error",
          });
          continue;
        }

        if (!response.ok) {
          extractionAttempts.push({
            sourceUrl: endpoint,
            mode: "moj_gateway_detail_fetch",
            status: "http_error",
            payloadKeys: Object.keys(payload),
            httpStatus: response.status,
          });
          continue;
        }

        let payloadJson: MojGatewayDetailResponse;
        try {
          payloadJson = (await response.json()) as MojGatewayDetailResponse;
        } catch (error) {
          extractionAttempts.push({
            sourceUrl: endpoint,
            mode: "moj_gateway_detail_fetch",
            status: "invalid_json",
            payloadKeys: Object.keys(payload),
            error: error instanceof Error ? error.message : "unknown_error",
          });
          continue;
        }

        const model = this.extractGatewayDetailModel(payloadJson);
        const snippets: string[] = [];
        this.collectTextValues(model, snippets);
        const candidateText = this.normalizeContentText(
          [...new Set(snippets.map((item) => this.normalizeWhitespace(item)))]
            .filter((item) => item.length > 0)
            .join("\n\n")
        );

        extractionAttempts.push({
          sourceUrl: endpoint,
          mode: "moj_gateway_detail_fetch",
          status: "ok",
          payloadKeys: Object.keys(payload),
          extractedChars: candidateText.length,
        });

        const result = validateCandidate(candidateText, endpoint);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  private async extractFromHardCopyDocument(
    params: {
      regulationId: number;
      candidate: MojRegulationCandidate;
      hardCopyUrl: string;
      extractionAttempts: Array<Record<string, unknown>>;
    }
  ): Promise<{
    text: string;
    hash: string;
    sourceUrl: string;
    method: string;
    status: string;
  } | null> {
    if (!this.aiClient) {
      return null;
    }

    const { regulationId, candidate, hardCopyUrl, extractionAttempts } = params;
    let response: Response;
    try {
      response = await fetch(hardCopyUrl, {
        method: "GET",
        headers: {
          accept: "application/pdf,application/octet-stream,*/*",
          languageCode: "ar",
          referer: `https://${MOJ_HOST}/`,
        },
        redirect: "follow",
      });
    } catch (error) {
      extractionAttempts.push({
        sourceUrl: hardCopyUrl,
        mode: "hardcopy_document_fetch",
        status: "request_failed",
        error: error instanceof Error ? error.message : "unknown_error",
      });
      logger.warn(
        {
          err: error,
          hardCopyUrl,
          regulationId,
        },
        "Failed to fetch MOJ hardcopy document URL"
      );
      return null;
    }

    if (!response.ok) {
      extractionAttempts.push({
        sourceUrl: hardCopyUrl,
        mode: "hardcopy_document_fetch",
        status: "http_error",
        httpStatus: response.status,
      });
      return null;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 25_000_000) {
      extractionAttempts.push({
        sourceUrl: hardCopyUrl,
        mode: "hardcopy_document_fetch",
        status: "too_large",
        contentLength,
      });
      return null;
    }

    let documentBytes: Buffer;
    try {
      const arrayBuffer = await response.arrayBuffer();
      documentBytes = Buffer.from(arrayBuffer);
    } catch (error) {
      extractionAttempts.push({
        sourceUrl: hardCopyUrl,
        mode: "hardcopy_document_fetch",
        status: "read_failed",
        error: error instanceof Error ? error.message : "unknown_error",
      });
      return null;
    }

    let extraction;
    try {
      extraction = await this.aiClient.extractDocumentContent({
        content: documentBytes,
        fileName: this.getHardCopyDocumentName(candidate),
        contentType,
      });
    } catch (error) {
      extractionAttempts.push({
        sourceUrl: hardCopyUrl,
        mode: "hardcopy_document_extract",
        status: "request_failed",
        error: error instanceof Error ? error.message : "unknown_error",
      });
      logger.warn(
        {
          err: error,
          hardCopyUrl,
          regulationId,
        },
        "Failed to extract text from MOJ hardcopy document"
      );
      return null;
    }

    extractionAttempts.push({
      sourceUrl: hardCopyUrl,
      mode: "hardcopy_document_extract",
      status: extraction.status,
      extractionMethod: extraction.extraction_method,
      errorCode: extraction.error_code || null,
      warnings: extraction.warnings || [],
      contentType,
      bytes: documentBytes.byteLength,
    });

    if (extraction.status !== "ok") {
      return null;
    }

    const extractedText = this.normalizeContentText(extraction.extracted_text || "");
    if (!extractedText) {
      return null;
    }

    const rawHtmlProbe =
      /text\/html/i.test(contentType) || /application\/xhtml\+xml/i.test(contentType)
        ? documentBytes.toString("utf8", 0, Math.min(documentBytes.length, 25_000))
        : null;
    if (this.isLikelyPortalShellContent(extractedText, rawHtmlProbe)) {
      extractionAttempts.push({
        sourceUrl: hardCopyUrl,
        mode: "hardcopy_document_extract",
        status: "ignored_portal_shell_content",
        reason: "hardcopy_response_looks_like_loading_shell",
      });
      return null;
    }
    if (this.isLikelyBlockedContent(extractedText, rawHtmlProbe)) {
      extractionAttempts.push({
        sourceUrl: hardCopyUrl,
        mode: "hardcopy_document_extract",
        status: "ignored_blocked_content",
        reason: "hardcopy_response_looks_like_waf_or_access_denied",
      });
      return null;
    }

    return {
      text: extractedText,
      hash: extraction.normalized_text_hash || this.hashNormalizedText(extractedText),
      sourceUrl: hardCopyUrl,
      method: `ai-document:${extraction.extraction_method || "unknown"}`,
      status: "ok",
    };
  }

  private collectTextValues(value: unknown, bucket: string[], depth: number = 0) {
    if (depth > 10 || !value) {
      return;
    }

    if (typeof value === "string") {
      const normalized = this.normalizeWhitespace(value);
      if (normalized.length >= 4) {
        bucket.push(normalized);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectTextValues(item, bucket, depth + 1);
      }
      return;
    }

    if (typeof value === "object") {
      const objectValue = value as Record<string, unknown>;
      const keysToPrioritize = [
        "summary",
        "text",
        "content",
        "details",
        "description",
        "sectionText",
        "sectionTitle",
        "name",
        "title",
        "sequence",
      ];
      for (const key of keysToPrioritize) {
        this.collectTextValues(objectValue[key], bucket, depth + 1);
      }

      const nestedKeys = [
        "sections",
        "subSections",
        "children",
        "items",
        "details",
        "statuteStructure",
      ];
      for (const key of nestedKeys) {
        this.collectTextValues(objectValue[key], bucket, depth + 1);
      }
    }
  }

  private buildFallbackContent(candidate: MojRegulationCandidate): string | null {
    const snippets: string[] = [];
    if (candidate.summary) {
      snippets.push(candidate.summary);
    }
    this.collectTextValues(candidate.sourceMetadata?.sections, snippets);

    const uniqueSnippets = [...new Set(snippets.map((item) => this.normalizeWhitespace(item)))];
    const fallback = uniqueSnippets.filter((item) => item.length > 0).join("\n\n");
    const normalized = this.normalizeContentText(fallback);
    return normalized || null;
  }

  private async upsertRegulation(
    candidate: MojRegulationCandidate
  ): Promise<{ regulationId: number; created: boolean; updated: boolean }> {
    const now = new Date();
    const metadataHash = candidate.sourceMetadataHash;

    let existing = candidate.sourceSerial
      ? await this.db.query.regulations.findFirst({
          where: and(
            eq(regulations.sourceProvider, candidate.sourceProvider),
            eq(regulations.sourceSerial, candidate.sourceSerial)
          ),
          columns: {
            id: true,
            title: true,
            regulationNumber: true,
            sourceUrl: true,
            sourceProvider: true,
            sourceSerial: true,
            sourceListingUrl: true,
            summary: true,
            category: true,
            status: true,
            effectiveDate: true,
            sourceMetadataHash: true,
          },
        })
      : null;

    if (!existing) {
      existing = await this.db.query.regulations.findFirst({
        where: eq(regulations.sourceUrl, candidate.sourceUrl),
        columns: {
          id: true,
          title: true,
          regulationNumber: true,
          sourceUrl: true,
          sourceProvider: true,
          sourceSerial: true,
          sourceListingUrl: true,
          summary: true,
          category: true,
          status: true,
          effectiveDate: true,
          sourceMetadataHash: true,
        },
      });
    }

    if (!existing) {
      const [created] = await this.db
        .insert(regulations)
        .values({
          title: candidate.title,
          regulationNumber: candidate.regulationNumber,
          sourceUrl: candidate.sourceUrl,
          sourceProvider: candidate.sourceProvider,
          sourceSerial: candidate.sourceSerial || null,
          sourceListingUrl: candidate.sourceListingUrl,
          sourceMetadata: candidate.sourceMetadata,
          sourceMetadataHash: metadataHash,
          summary: candidate.summary || null,
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
      existing.sourceUrl !== candidate.sourceUrl ||
      existing.sourceProvider !== candidate.sourceProvider ||
      existing.sourceSerial !== (candidate.sourceSerial || null) ||
      existing.sourceListingUrl !== candidate.sourceListingUrl ||
      existing.summary !== (candidate.summary || null) ||
      existing.category !== candidate.category ||
      existing.status !== (candidate.status || existing.status) ||
      existing.effectiveDate !== (candidate.effectiveDate || null) ||
      (existing.sourceMetadataHash || null) !== metadataHash;

    if (!shouldUpdate) {
      return { regulationId: existing.id, created: false, updated: false };
    }

    await this.db
      .update(regulations)
      .set({
        title: candidate.title,
        regulationNumber: candidate.regulationNumber,
        sourceUrl: candidate.sourceUrl,
        sourceProvider: candidate.sourceProvider,
        sourceSerial: candidate.sourceSerial || null,
        sourceListingUrl: candidate.sourceListingUrl,
        sourceMetadata: candidate.sourceMetadata,
        sourceMetadataHash: metadataHash,
        summary: candidate.summary || null,
        category: candidate.category,
        status: candidate.status || existing.status,
        effectiveDate: candidate.effectiveDate || null,
        updatedAt: now,
      })
      .where(eq(regulations.id, existing.id));

    return { regulationId: existing.id, created: false, updated: true };
  }

  private async syncRegulationVersion(
    regulationId: number,
    candidate: MojRegulationCandidate
  ): Promise<"created" | "unchanged" | "failed" | "skipped"> {
    const latestVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.regulationId, regulationId),
      columns: {
        versionNumber: true,
        content: true,
        contentHash: true,
        sourceMetadataHash: true,
        rawHtml: true,
      },
      orderBy: [desc(regulationVersions.versionNumber)],
    });
    const sourceMetadataHash = candidate.sourceMetadataHash;
    const fallbackText = this.buildFallbackContent(candidate);
    const extractionAttempts: Array<Record<string, unknown>> = [];

    const hardCopyUrls = this.getHardCopyDownloadUrls(candidate);
    const sourceUrls = [candidate.sourceUrl].filter((url): url is string => Boolean(url));
    const uniqueSourceUrls = [...new Set(sourceUrls)];

    let selectedSourceUrl: string | null = null;
    let selectedText: string | null = null;
    let selectedHash: string | null = null;
    let selectedRawHtml: string | null = null;
    let extractionMethod = "moj:fallback";
    let extractionStatus = "fallback";
    let fallbackUsed = false;
    let latestUsableVersionCache:
      | {
          versionNumber: number;
          content: string;
          contentHash: string;
          rawHtml: string | null;
        }
      | null
      | undefined;

    const getLatestUsableVersion = async () => {
      if (latestUsableVersionCache !== undefined) {
        return latestUsableVersionCache;
      }

      const recentVersions = await this.db.query.regulationVersions.findMany({
        where: eq(regulationVersions.regulationId, regulationId),
        columns: {
          versionNumber: true,
          content: true,
          contentHash: true,
          rawHtml: true,
        },
        orderBy: [desc(regulationVersions.versionNumber)],
        limit: 12,
      });

      latestUsableVersionCache =
        recentVersions.find((version) => {
          const content = this.normalizeContentText(version.content || "");
          if (!content) {
            return false;
          }
          return !this.isInvalidExtractedContent(content, version.rawHtml || null);
        }) || null;

      return latestUsableVersionCache;
    };

    if (this.aiClient && !selectedText) {
      for (const sourceUrl of uniqueSourceUrls) {
        let extraction;
        try {
          extraction = await this.aiClient.extractRegulationContent({
            sourceUrl,
          });
        } catch (error) {
          extractionAttempts.push({
            sourceUrl,
            status: "request_failed",
            error: error instanceof Error ? error.message : "unknown_error",
          });
          logger.error(
            { err: error, sourceUrl, regulationId },
            "MOJ sync extraction request failed"
          );
          continue;
        }

        extractionAttempts.push({
          sourceUrl,
          status: extraction.status,
          extractionMethod: extraction.extraction_method,
          errorCode: extraction.error_code || null,
          warnings: extraction.warnings || [],
          contentType: extraction.content_type || null,
          finalUrl: extraction.final_url || null,
        });

        if (extraction.status === "ok") {
          const extractedText = this.normalizeContentText(extraction.extracted_text || "");
          if (!extractedText) {
            continue;
          }
          if (this.isLikelyPortalShellContent(extractedText, extraction.raw_html || null)) {
            extractionAttempts.push({
              sourceUrl,
              status: "ignored_portal_shell_content",
              extractionMethod: extraction.extraction_method,
              reason: "content_looks_like_loading_shell",
            });
            continue;
          }
          if (this.isLikelyBlockedContent(extractedText, extraction.raw_html || null)) {
            extractionAttempts.push({
              sourceUrl,
              status: "ignored_blocked_content",
              extractionMethod: extraction.extraction_method,
              reason: "content_looks_like_waf_or_access_denied",
            });
            continue;
          }
          selectedSourceUrl = sourceUrl;
          selectedText = extractedText;
          selectedHash =
            extraction.normalized_text_hash || this.hashNormalizedText(extractedText);
          selectedRawHtml = extraction.raw_html || null;
          extractionMethod = `ai:${extraction.extraction_method || "unknown"}`;
          extractionStatus = "ok";
          break;
        }

        if (extraction.status === "not_modified" && latestVersion?.content) {
          if (this.isInvalidExtractedContent(latestVersion.content, latestVersion.rawHtml || null)) {
            const latestUsableVersion = await getLatestUsableVersion();
            if (!latestUsableVersion) {
              extractionAttempts.push({
                sourceUrl,
                status: "ignored_not_modified_due_to_invalid_latest_content",
                reason: "latest_version_content_looks_like_shell_or_blocked_page",
              });
              continue;
            }

            extractionAttempts.push({
              sourceUrl,
              status: "using_previous_valid_version_for_not_modified",
              reason: "latest_version_invalid_shell_or_blocked",
              selectedVersionNumber: latestUsableVersion.versionNumber,
            });
            selectedSourceUrl = sourceUrl;
            selectedText = latestUsableVersion.content;
            selectedHash = latestUsableVersion.contentHash;
            selectedRawHtml = latestUsableVersion.rawHtml || null;
            extractionMethod = "ai:not_modified_previous_valid_version";
            extractionStatus = "not_modified";
            break;
          }
          selectedSourceUrl = sourceUrl;
          selectedText = latestVersion.content;
          selectedHash = latestVersion.contentHash;
          selectedRawHtml = latestVersion.rawHtml || null;
          extractionMethod = "ai:not_modified";
          extractionStatus = "not_modified";
          break;
        }
      }
    }

    // Tier 2: GET-based gateway statute detail (most reliable for full content)
    if (!selectedText) {
      const statuteGetExtraction = await this.extractFromMojGatewayStatuteGet({
        candidate,
        fallbackText,
        extractionAttempts,
      });
      if (statuteGetExtraction) {
        selectedSourceUrl = statuteGetExtraction.sourceUrl;
        selectedText = statuteGetExtraction.text;
        selectedHash = statuteGetExtraction.hash;
        extractionMethod = statuteGetExtraction.method;
        extractionStatus = statuteGetExtraction.status;
      }
    }

    if (!selectedText && hardCopyUrls.length > 0 && this.aiClient) {
      for (const hardCopyUrl of hardCopyUrls) {
        const hardCopyExtraction = await this.extractFromHardCopyDocument({
          regulationId,
          candidate,
          hardCopyUrl,
          extractionAttempts,
        });
        if (!hardCopyExtraction) {
          continue;
        }

        selectedSourceUrl = hardCopyExtraction.sourceUrl;
        selectedText = hardCopyExtraction.text;
        selectedHash = hardCopyExtraction.hash;
        extractionMethod = hardCopyExtraction.method;
        extractionStatus = hardCopyExtraction.status;
        break;
      }
    }

    if (!selectedText) {
      const gatewayDetailExtraction = await this.extractFromMojGatewayDetail({
        candidate,
        fallbackText,
        extractionAttempts,
      });
      if (gatewayDetailExtraction) {
        selectedSourceUrl = gatewayDetailExtraction.sourceUrl;
        selectedText = gatewayDetailExtraction.text;
        selectedHash = gatewayDetailExtraction.hash;
        extractionMethod = gatewayDetailExtraction.method;
        extractionStatus = gatewayDetailExtraction.status;
      }
    }

    if (!selectedText && fallbackText) {
      selectedText = fallbackText;
      selectedHash = this.hashNormalizedText(fallbackText);
      extractionMethod = "moj:summary_sections_fallback";
      extractionStatus = this.aiClient ? "fallback_after_extraction" : "fallback_no_ai";
      fallbackUsed = true;
    }

    if (!selectedText) {
      const latestUsableVersion = await getLatestUsableVersion();
      if (latestUsableVersion) {
        selectedText = latestUsableVersion.content;
        selectedHash = latestUsableVersion.contentHash;
        selectedRawHtml = latestUsableVersion.rawHtml || null;
        extractionMethod = "moj:previous_valid_version_content";
        extractionStatus = "fallback_previous_version";
        fallbackUsed = true;
      }
    }

    if (!selectedText || !selectedHash) {
      return this.aiClient ? "failed" : "skipped";
    }

    const contentChanged = (latestVersion?.contentHash || null) !== selectedHash;
    const metadataChanged =
      (latestVersion?.sourceMetadataHash || null) !== sourceMetadataHash;

    if (latestVersion && !contentChanged && !metadataChanged) {
      return "unchanged";
    }

    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;
    const now = new Date();

    let changesSummary = "Initial version extracted from MOJ source.";
    if (latestVersion && contentChanged && metadataChanged) {
      changesSummary =
        "Detected MOJ source content and metadata update during synchronization.";
    } else if (latestVersion && contentChanged) {
      changesSummary = "Detected source content change from MOJ listing sync.";
    } else if (latestVersion && metadataChanged) {
      changesSummary = "Detected source metadata change from MOJ listing sync.";
    }

    const [createdVersion] = await this.db
      .insert(regulationVersions)
      .values({
        regulationId,
        versionNumber: nextVersionNumber,
        content: selectedText,
        contentHash: selectedHash,
        rawHtml: selectedRawHtml || null,
        sourceMetadata: candidate.sourceMetadata,
        sourceMetadataHash,
        extractionMetadata: {
          sourceProvider: candidate.sourceProvider,
          sourceSerial: candidate.sourceSerial || null,
          selectedSourceUrl,
          extractionMethod,
          extractionStatus,
          fallbackUsed,
          attempts: extractionAttempts,
          fallbackSummaryChars: candidate.summary?.length || 0,
          generatedAt: now.toISOString(),
        },
        changesSummary,
        createdBy: "moj_source_sync",
      })
      .returning({
        id: regulationVersions.id,
      });

    if (this.regulationRagService) {
      try {
        await this.regulationRagService.reindexRegulationVersionChunks({
          regulationId,
          regulationVersionId: createdVersion.id,
          sourceText: selectedText,
        });
      } catch (error) {
        logger.error(
          {
            err: error,
            regulationId,
            regulationVersionId: createdVersion.id,
          },
          "Failed to reindex regulation chunks after version sync"
        );
      }
    }

    const nextStatus = candidate.status || (latestVersion ? "amended" : "active");
    await this.db
      .update(regulations)
      .set({
        updatedAt: now,
        status: nextStatus,
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
      let totalPagesHint: number | undefined;

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

        if (
          typeof listing.totalPages === "number" &&
          listing.totalPages > 0
        ) {
          totalPagesHint = listing.totalPages;
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

        if (typeof totalPagesHint === "number" && page >= totalPagesHint) {
          break;
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
          candidate
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
