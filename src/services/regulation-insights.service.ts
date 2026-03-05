import { createHash } from "crypto";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulationInsights,
  regulationVersions,
  regulations,
  type RegulationInsight,
} from "../db/schema";
import { env } from "../config/env";
import {
  AIClientService,
  type RegulationCitation,
  type RegulationInsightBullet,
  type RegulationKeyDate,
} from "./ai-client.service";
import { NotFoundError, ValidationError } from "../utils/errors";
import { logger } from "../utils/logger";

export type RegulationInsightsStateStatus =
  | "not_generated"
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export interface RegulationInsightsState {
  regulationId: number;
  regulationVersionId: number | null;
  languageCode: string;
  status: RegulationInsightsStateStatus;
  summary: string | null;
  obligations: RegulationInsightBullet[];
  riskFlags: RegulationInsightBullet[];
  keyDates: RegulationKeyDate[];
  citations: RegulationCitation[];
  method: string | null;
  errorCode: string | null;
  warnings: string[];
  updatedAt: Date | null;
}

export interface RegulationInsightsQueueResult {
  processed: number;
  ready: number;
  failed: number;
}

export interface RegulationInsightsQueueHealth {
  total: number;
  pending: number;
  processing: number;
  ready: number;
  failed: number;
}

export class RegulationInsightsService {
  private aiClient?: AIClientService;

  constructor(private readonly db: Database) {}

  private getAIClient(): AIClientService {
    if (!this.aiClient) {
      this.aiClient = new AIClientService();
    }
    return this.aiClient;
  }

  private hashText(value: string): string {
    return createHash("sha256").update(value, "utf-8").digest("hex");
  }

  private getRetryAt(base: Date): Date {
    return new Date(base.getTime() + env.REG_INSIGHTS_RETRY_MINUTES * 60 * 1000);
  }

  private parseJsonArray<T>(raw: string | null | undefined): T[] {
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private normalizeWarnings(raw: string | null | undefined): string[] {
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item): item is string => typeof item === "string");
    } catch {
      return [];
    }
  }

  private mapRowToState(
    row: Pick<
      RegulationInsight,
      | "regulationId"
      | "regulationVersionId"
      | "languageCode"
      | "status"
      | "summary"
      | "obligationsJson"
      | "riskFlagsJson"
      | "keyDatesJson"
      | "citationsJson"
      | "method"
      | "errorCode"
      | "warningsJson"
      | "updatedAt"
    >
  ): RegulationInsightsState {
    return {
      regulationId: row.regulationId,
      regulationVersionId: row.regulationVersionId,
      languageCode: row.languageCode,
      status: row.status,
      summary: row.summary,
      obligations: this.parseJsonArray<RegulationInsightBullet>(row.obligationsJson),
      riskFlags: this.parseJsonArray<RegulationInsightBullet>(row.riskFlagsJson),
      keyDates: this.parseJsonArray<RegulationKeyDate>(row.keyDatesJson),
      citations: this.parseJsonArray<RegulationCitation>(row.citationsJson),
      method: row.method,
      errorCode: row.errorCode,
      warnings: this.normalizeWarnings(row.warningsJson),
      updatedAt: row.updatedAt,
    };
  }

  private async getRegulationWithLatestVersion(regulationId: number) {
    const regulation = await this.db.query.regulations.findFirst({
      where: eq(regulations.id, regulationId),
      columns: {
        id: true,
        title: true,
        sourceMetadata: true,
      },
    });

    if (!regulation) {
      throw new NotFoundError("Regulation");
    }

    const latestVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.regulationId, regulationId),
      columns: {
        id: true,
        versionNumber: true,
        content: true,
        contentHash: true,
        sourceMetadata: true,
      },
      orderBy: [desc(regulationVersions.versionNumber)],
    });

    return {
      regulation,
      latestVersion,
    };
  }

  async getLatestInsights(
    regulationId: number,
    languageCode: string = "ar"
  ): Promise<RegulationInsightsState> {
    const normalizedLanguage = (languageCode || "ar").toLowerCase();
    const { latestVersion } = await this.getRegulationWithLatestVersion(regulationId);

    if (!latestVersion) {
      return {
        regulationId,
        regulationVersionId: null,
        languageCode: normalizedLanguage,
        status: "not_generated",
        summary: null,
        obligations: [],
        riskFlags: [],
        keyDates: [],
        citations: [],
        method: null,
        errorCode: null,
        warnings: [],
        updatedAt: null,
      };
    }

    const row = await this.db.query.regulationInsights.findFirst({
      where: and(
        eq(regulationInsights.regulationVersionId, latestVersion.id),
        eq(regulationInsights.languageCode, normalizedLanguage)
      ),
    });

    if (!row) {
      return {
        regulationId,
        regulationVersionId: latestVersion.id,
        languageCode: normalizedLanguage,
        status: "not_generated",
        summary: null,
        obligations: [],
        riskFlags: [],
        keyDates: [],
        citations: [],
        method: null,
        errorCode: null,
        warnings: [],
        updatedAt: null,
      };
    }

    return this.mapRowToState(row);
  }

  async enqueueLatestInsightsRefresh(input: {
    regulationId: number;
    triggeredByUserId: string;
    force?: boolean;
    languageCode?: string;
  }): Promise<RegulationInsightsState> {
    const now = new Date();
    const normalizedLanguage = (input.languageCode || "ar").toLowerCase();
    const { regulation, latestVersion } = await this.getRegulationWithLatestVersion(
      input.regulationId
    );

    if (!latestVersion || !latestVersion.content?.trim()) {
      throw new ValidationError(
        `Regulation #${regulation.id} has no extracted version content yet`
      );
    }

    const sourceTextHash =
      latestVersion.contentHash || this.hashText(latestVersion.content);

    const existing = await this.db.query.regulationInsights.findFirst({
      where: and(
        eq(regulationInsights.regulationVersionId, latestVersion.id),
        eq(regulationInsights.languageCode, normalizedLanguage)
      ),
    });

    if (
      existing &&
      !input.force &&
      (existing.status === "pending" || existing.status === "processing")
    ) {
      return this.mapRowToState(existing);
    }

    if (
      existing &&
      !input.force &&
      existing.status === "ready" &&
      existing.sourceTextHash === sourceTextHash
    ) {
      return this.mapRowToState(existing);
    }

    if (existing) {
      const [updated] = await this.db
        .update(regulationInsights)
        .set({
          regulationId: regulation.id,
          regulationVersionId: latestVersion.id,
          languageCode: normalizedLanguage,
          status: "pending",
          summary: null,
          obligationsJson: JSON.stringify([]),
          riskFlagsJson: JSON.stringify([]),
          keyDatesJson: JSON.stringify([]),
          citationsJson: JSON.stringify([]),
          sourceTextHash,
          method: null,
          errorCode: null,
          warningsJson: null,
          nextRetryAt: now,
          triggeredByUserId: input.triggeredByUserId,
          updatedAt: now,
        })
        .where(eq(regulationInsights.id, existing.id))
        .returning();

      return this.mapRowToState(updated);
    }

    const [created] = await this.db
      .insert(regulationInsights)
      .values({
        regulationId: regulation.id,
        regulationVersionId: latestVersion.id,
        languageCode: normalizedLanguage,
        status: "pending",
        summary: null,
        obligationsJson: JSON.stringify([]),
        riskFlagsJson: JSON.stringify([]),
        keyDatesJson: JSON.stringify([]),
        citationsJson: JSON.stringify([]),
        sourceTextHash,
        method: null,
        errorCode: null,
        warningsJson: null,
        attemptCount: 0,
        lastAttemptAt: null,
        nextRetryAt: now,
        triggeredByUserId: input.triggeredByUserId,
      })
      .returning();

    return this.mapRowToState(created);
  }

  private async processSingleRow(
    row: RegulationInsight,
    now: Date
  ): Promise<"ready" | "failed"> {
    await this.db
      .update(regulationInsights)
      .set({
        status: "processing",
        attemptCount: (row.attemptCount || 0) + 1,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(regulationInsights.id, row.id));

    const regulation = await this.db.query.regulations.findFirst({
      where: eq(regulations.id, row.regulationId),
      columns: {
        id: true,
        title: true,
        sourceMetadata: true,
      },
    });

    const version = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.id, row.regulationVersionId),
      columns: {
        id: true,
        content: true,
        contentHash: true,
        sourceMetadata: true,
      },
    });

    if (!regulation || !version || !version.content?.trim()) {
      await this.db
        .update(regulationInsights)
        .set({
          status: "failed",
          errorCode: "regulation_version_content_missing",
          warningsJson: JSON.stringify([
            "Regulation version content is missing or unavailable.",
          ]),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationInsights.id, row.id));
      return "failed";
    }

    if (!env.AI_SERVICE_URL) {
      await this.db
        .update(regulationInsights)
        .set({
          status: "failed",
          errorCode: "ai_service_unavailable",
          warningsJson: JSON.stringify([
            "AI_SERVICE_URL is not configured on backend service.",
          ]),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationInsights.id, row.id));
      return "failed";
    }

    try {
      const aiResponse = await this.getAIClient().generateRegulationSummaryAnalysis({
        regulationText: version.content,
        regulationTitle: regulation.title,
        sourceMetadata:
          (version.sourceMetadata as Record<string, unknown>) ||
          (regulation.sourceMetadata as Record<string, unknown>) ||
          {},
        languageCode: "ar",
      });

      if (aiResponse.status === "ok") {
        await this.db
          .update(regulationInsights)
          .set({
            status: "ready",
            summary: aiResponse.summary || null,
            obligationsJson: JSON.stringify(aiResponse.obligations || []),
            riskFlagsJson: JSON.stringify(aiResponse.risk_flags || []),
            keyDatesJson: JSON.stringify(aiResponse.key_dates || []),
            citationsJson: JSON.stringify(aiResponse.citations || []),
            sourceTextHash:
              version.contentHash || row.sourceTextHash || this.hashText(version.content),
            method: aiResponse.method || "regulation_summary_analysis_v1",
            errorCode: null,
            warningsJson: JSON.stringify(aiResponse.warnings || []),
            nextRetryAt: now,
            updatedAt: now,
          })
          .where(eq(regulationInsights.id, row.id));

        return "ready";
      }

      await this.db
        .update(regulationInsights)
        .set({
          status: "failed",
          summary: null,
          obligationsJson: JSON.stringify([]),
          riskFlagsJson: JSON.stringify([]),
          keyDatesJson: JSON.stringify([]),
          citationsJson: JSON.stringify([]),
          method: aiResponse.method || "regulation_summary_analysis_v1",
          errorCode: aiResponse.error_code || "analysis_error",
          warningsJson: JSON.stringify(aiResponse.warnings || []),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationInsights.id, row.id));

      return "failed";
    } catch (error) {
      logger.error(
        { err: error, regulationInsightId: row.id },
        "Regulation insights processing failed"
      );

      await this.db
        .update(regulationInsights)
        .set({
          status: "failed",
          summary: null,
          obligationsJson: JSON.stringify([]),
          riskFlagsJson: JSON.stringify([]),
          keyDatesJson: JSON.stringify([]),
          citationsJson: JSON.stringify([]),
          method: "regulation_summary_analysis_v1",
          errorCode: "analysis_service_error",
          warningsJson: JSON.stringify([
            error instanceof Error ? error.message : "Unknown AI service error",
          ]),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationInsights.id, row.id));

      return "failed";
    }
  }

  async runPendingRegulationInsights(): Promise<RegulationInsightsQueueResult> {
    if (!env.REG_INSIGHTS_ENABLED) {
      return {
        processed: 0,
        ready: 0,
        failed: 0,
      };
    }

    const now = new Date();
    const rows = await this.db.query.regulationInsights.findMany({
      where: and(
        inArray(regulationInsights.status, ["pending", "failed", "processing"]),
        lte(regulationInsights.nextRetryAt, now)
      ),
      orderBy: [asc(regulationInsights.nextRetryAt)],
      limit: env.REG_INSIGHTS_BATCH_SIZE,
    });

    if (!rows.length) {
      return {
        processed: 0,
        ready: 0,
        failed: 0,
      };
    }

    let ready = 0;
    let failed = 0;
    const concurrency = Math.max(1, env.REG_INSIGHTS_MAX_CONCURRENCY);

    for (let i = 0; i < rows.length; i += concurrency) {
      const batch = rows.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((row) => this.processSingleRow(row, now))
      );

      for (const result of results) {
        if (result === "ready") {
          ready += 1;
        } else {
          failed += 1;
        }
      }
    }

    return {
      processed: rows.length,
      ready,
      failed,
    };
  }

  async getQueueHealth(): Promise<RegulationInsightsQueueHealth> {
    const rows = await this.db.query.regulationInsights.findMany({
      columns: {
        status: true,
      },
    });

    const totals: RegulationInsightsQueueHealth = {
      total: rows.length,
      pending: 0,
      processing: 0,
      ready: 0,
      failed: 0,
    };

    for (const row of rows) {
      const status = row.status;
      if (status in totals) {
        totals[status as keyof RegulationInsightsQueueHealth] += 1;
      }
    }

    return totals;
  }
}
