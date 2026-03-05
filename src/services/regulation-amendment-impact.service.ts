import { createHash } from "crypto";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulationAmendmentImpacts,
  regulationVersions,
  regulations,
  type RegulationAmendmentImpact,
} from "../db/schema";
import { env } from "../config/env";
import {
  AIClientService,
  type RegulationCitation,
  type RegulationInsightBullet,
} from "./ai-client.service";
import { NotFoundError, ValidationError } from "../utils/errors";
import { logger } from "../utils/logger";
import { RegulationService } from "./regulation.service";

export type RegulationAmendmentImpactStateStatus =
  | "not_generated"
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export interface RegulationAmendmentImpactState {
  regulationId: number;
  fromVersion: number;
  toVersion: number;
  languageCode: string;
  status: RegulationAmendmentImpactStateStatus;
  whatChanged: RegulationInsightBullet[];
  legalImpact: RegulationInsightBullet[];
  affectedParties: RegulationInsightBullet[];
  citations: RegulationCitation[];
  method: string | null;
  errorCode: string | null;
  warnings: string[];
  updatedAt: Date | null;
}

export interface RegulationAmendmentImpactQueueResult {
  processed: number;
  ready: number;
  failed: number;
}

export interface RegulationAmendmentImpactQueueHealth {
  total: number;
  pending: number;
  processing: number;
  ready: number;
  failed: number;
}

interface VersionPair {
  from: {
    id: number;
    versionNumber: number;
    content: string;
    contentHash: string;
  };
  to: {
    id: number;
    versionNumber: number;
    content: string;
    contentHash: string;
  };
}

export class RegulationAmendmentImpactService {
  private aiClient?: AIClientService;
  private readonly regulationService: RegulationService;

  constructor(private readonly db: Database) {
    this.regulationService = new RegulationService(db);
  }

  private getAIClient(): AIClientService {
    if (!this.aiClient) {
      this.aiClient = new AIClientService();
    }
    return this.aiClient;
  }

  private getRetryAt(base: Date): Date {
    return new Date(base.getTime() + env.REG_IMPACT_RETRY_MINUTES * 60 * 1000);
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

  private toFingerprint(input: {
    regulationId: number;
    fromVersionNumber: number;
    toVersionNumber: number;
    fromVersionHash: string;
    toVersionHash: string;
  }): string {
    return createHash("sha256")
      .update(
        [
          input.regulationId,
          input.fromVersionNumber,
          input.toVersionNumber,
          input.fromVersionHash,
          input.toVersionHash,
        ].join("::"),
        "utf-8"
      )
      .digest("hex");
  }

  private async getRegulationOrThrow(regulationId: number) {
    const regulation = await this.db.query.regulations.findFirst({
      where: eq(regulations.id, regulationId),
      columns: {
        id: true,
        title: true,
      },
    });

    if (!regulation) {
      throw new NotFoundError("Regulation");
    }

    return regulation;
  }

  private async getVersionPairOrThrow(
    regulationId: number,
    fromVersionNumber: number,
    toVersionNumber: number
  ): Promise<VersionPair> {
    const rows = await this.db.query.regulationVersions.findMany({
      where: and(
        eq(regulationVersions.regulationId, regulationId),
        inArray(regulationVersions.versionNumber, [fromVersionNumber, toVersionNumber])
      ),
      columns: {
        id: true,
        versionNumber: true,
        content: true,
        contentHash: true,
      },
    });

    const from = rows.find((row) => row.versionNumber === fromVersionNumber);
    const to = rows.find((row) => row.versionNumber === toVersionNumber);

    if (!from || !to) {
      throw new ValidationError("Selected version pair does not exist for this regulation");
    }
    if (!from.content?.trim() || !to.content?.trim()) {
      throw new ValidationError("Selected regulation versions are missing extracted content");
    }

    return {
      from,
      to,
    };
  }

  private mapRowToState(
    row: Pick<
      RegulationAmendmentImpact,
      | "regulationId"
      | "fromVersionNumber"
      | "toVersionNumber"
      | "languageCode"
      | "status"
      | "whatChangedJson"
      | "legalImpactJson"
      | "affectedPartiesJson"
      | "citationsJson"
      | "method"
      | "errorCode"
      | "warningsJson"
      | "updatedAt"
    >
  ): RegulationAmendmentImpactState {
    return {
      regulationId: row.regulationId,
      fromVersion: row.fromVersionNumber,
      toVersion: row.toVersionNumber,
      languageCode: row.languageCode,
      status: row.status,
      whatChanged: this.parseJsonArray<RegulationInsightBullet>(row.whatChangedJson),
      legalImpact: this.parseJsonArray<RegulationInsightBullet>(row.legalImpactJson),
      affectedParties: this.parseJsonArray<RegulationInsightBullet>(
        row.affectedPartiesJson
      ),
      citations: this.parseJsonArray<RegulationCitation>(row.citationsJson),
      method: row.method,
      errorCode: row.errorCode,
      warnings: this.normalizeWarnings(row.warningsJson),
      updatedAt: row.updatedAt,
    };
  }

  async getAmendmentImpact(input: {
    regulationId: number;
    fromVersion: number;
    toVersion: number;
    languageCode?: string;
  }): Promise<RegulationAmendmentImpactState> {
    const normalizedLanguage = (input.languageCode || "ar").toLowerCase();
    if (!Number.isInteger(input.fromVersion) || !Number.isInteger(input.toVersion)) {
      throw new ValidationError("fromVersion and toVersion must be integers");
    }

    await this.getRegulationOrThrow(input.regulationId);

    const row = await this.db.query.regulationAmendmentImpacts.findFirst({
      where: and(
        eq(regulationAmendmentImpacts.regulationId, input.regulationId),
        eq(regulationAmendmentImpacts.fromVersionNumber, input.fromVersion),
        eq(regulationAmendmentImpacts.toVersionNumber, input.toVersion),
        eq(regulationAmendmentImpacts.languageCode, normalizedLanguage)
      ),
    });

    if (!row) {
      return {
        regulationId: input.regulationId,
        fromVersion: input.fromVersion,
        toVersion: input.toVersion,
        languageCode: normalizedLanguage,
        status: "not_generated",
        whatChanged: [],
        legalImpact: [],
        affectedParties: [],
        citations: [],
        method: null,
        errorCode: null,
        warnings: [],
        updatedAt: null,
      };
    }

    return this.mapRowToState(row);
  }

  async enqueueAmendmentImpactRefresh(input: {
    regulationId: number;
    fromVersion: number;
    toVersion: number;
    triggeredByUserId: string;
    force?: boolean;
    languageCode?: string;
  }): Promise<RegulationAmendmentImpactState> {
    if (!Number.isInteger(input.fromVersion) || !Number.isInteger(input.toVersion)) {
      throw new ValidationError("fromVersion and toVersion must be integers");
    }
    if (input.fromVersion === input.toVersion) {
      throw new ValidationError("fromVersion and toVersion must be different");
    }

    const now = new Date();
    const normalizedLanguage = (input.languageCode || "ar").toLowerCase();
    await this.getRegulationOrThrow(input.regulationId);
    const pair = await this.getVersionPairOrThrow(
      input.regulationId,
      input.fromVersion,
      input.toVersion
    );

    const diffFingerprintHash = this.toFingerprint({
      regulationId: input.regulationId,
      fromVersionNumber: pair.from.versionNumber,
      toVersionNumber: pair.to.versionNumber,
      fromVersionHash: pair.from.contentHash,
      toVersionHash: pair.to.contentHash,
    });

    const existing = await this.db.query.regulationAmendmentImpacts.findFirst({
      where: and(
        eq(regulationAmendmentImpacts.regulationId, input.regulationId),
        eq(regulationAmendmentImpacts.fromVersionNumber, input.fromVersion),
        eq(regulationAmendmentImpacts.toVersionNumber, input.toVersion),
        eq(regulationAmendmentImpacts.languageCode, normalizedLanguage)
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
      existing.diffFingerprintHash === diffFingerprintHash
    ) {
      return this.mapRowToState(existing);
    }

    if (existing) {
      const [updated] = await this.db
        .update(regulationAmendmentImpacts)
        .set({
          regulationId: input.regulationId,
          fromVersionNumber: pair.from.versionNumber,
          toVersionNumber: pair.to.versionNumber,
          languageCode: normalizedLanguage,
          fromVersionId: pair.from.id,
          toVersionId: pair.to.id,
          status: "pending",
          whatChangedJson: JSON.stringify([]),
          legalImpactJson: JSON.stringify([]),
          affectedPartiesJson: JSON.stringify([]),
          citationsJson: JSON.stringify([]),
          diffFingerprintHash,
          method: null,
          errorCode: null,
          warningsJson: null,
          nextRetryAt: now,
          triggeredByUserId: input.triggeredByUserId,
          updatedAt: now,
        })
        .where(eq(regulationAmendmentImpacts.id, existing.id))
        .returning();

      return this.mapRowToState(updated);
    }

    const [created] = await this.db
      .insert(regulationAmendmentImpacts)
      .values({
        regulationId: input.regulationId,
        fromVersionNumber: pair.from.versionNumber,
        toVersionNumber: pair.to.versionNumber,
        languageCode: normalizedLanguage,
        fromVersionId: pair.from.id,
        toVersionId: pair.to.id,
        status: "pending",
        whatChangedJson: JSON.stringify([]),
        legalImpactJson: JSON.stringify([]),
        affectedPartiesJson: JSON.stringify([]),
        citationsJson: JSON.stringify([]),
        diffFingerprintHash,
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
    row: RegulationAmendmentImpact,
    now: Date
  ): Promise<"ready" | "failed"> {
    await this.db
      .update(regulationAmendmentImpacts)
      .set({
        status: "processing",
        attemptCount: (row.attemptCount || 0) + 1,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(regulationAmendmentImpacts.id, row.id));

    const regulation = await this.db.query.regulations.findFirst({
      where: eq(regulations.id, row.regulationId),
      columns: {
        id: true,
        title: true,
      },
    });

    const fromVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.id, row.fromVersionId),
      columns: {
        id: true,
        versionNumber: true,
        content: true,
        contentHash: true,
      },
    });
    const toVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.id, row.toVersionId),
      columns: {
        id: true,
        versionNumber: true,
        content: true,
        contentHash: true,
      },
    });

    if (!regulation || !fromVersion || !toVersion) {
      await this.db
        .update(regulationAmendmentImpacts)
        .set({
          status: "failed",
          errorCode: "version_pair_missing",
          warningsJson: JSON.stringify(["Selected version pair is missing."]),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationAmendmentImpacts.id, row.id));
      return "failed";
    }

    if (!fromVersion.content?.trim() || !toVersion.content?.trim()) {
      await this.db
        .update(regulationAmendmentImpacts)
        .set({
          status: "failed",
          errorCode: "version_content_missing",
          warningsJson: JSON.stringify([
            "One or both selected versions are missing content.",
          ]),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationAmendmentImpacts.id, row.id));
      return "failed";
    }

    if (!env.AI_SERVICE_URL) {
      await this.db
        .update(regulationAmendmentImpacts)
        .set({
          status: "failed",
          errorCode: "ai_service_unavailable",
          warningsJson: JSON.stringify([
            "AI_SERVICE_URL is not configured on backend service.",
          ]),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationAmendmentImpacts.id, row.id));
      return "failed";
    }

    try {
      const comparison = await this.regulationService.compareRegulationVersions(
        row.regulationId,
        row.fromVersionNumber,
        row.toVersionNumber
      );
      const diffSummary = {
        fromVersion: row.fromVersionNumber,
        toVersion: row.toVersionNumber,
        summary: comparison.summary,
        sampleDiffBlocks: (comparison.diffBlocks || []).slice(0, 16).map((block) => ({
          type: block.type,
          leftSegment: (block.leftSegment || "").slice(0, 500),
          rightSegment: (block.rightSegment || "").slice(0, 500),
        })),
      };

      const aiResponse = await this.getAIClient().generateRegulationAmendmentImpact({
        regulationTitle: regulation.title,
        oldText: fromVersion.content,
        newText: toVersion.content,
        fromVersionLabel: `v${row.fromVersionNumber}`,
        toVersionLabel: `v${row.toVersionNumber}`,
        diffSummary,
        languageCode: "ar",
      });

      if (aiResponse.status === "ok") {
        await this.db
          .update(regulationAmendmentImpacts)
          .set({
            status: "ready",
            whatChangedJson: JSON.stringify(aiResponse.what_changed || []),
            legalImpactJson: JSON.stringify(aiResponse.legal_impact || []),
            affectedPartiesJson: JSON.stringify(aiResponse.affected_parties || []),
            citationsJson: JSON.stringify(aiResponse.citations || []),
            diffFingerprintHash: this.toFingerprint({
              regulationId: row.regulationId,
              fromVersionNumber: row.fromVersionNumber,
              toVersionNumber: row.toVersionNumber,
              fromVersionHash: fromVersion.contentHash,
              toVersionHash: toVersion.contentHash,
            }),
            method: aiResponse.method || "regulation_amendment_impact_v1",
            errorCode: null,
            warningsJson: JSON.stringify(aiResponse.warnings || []),
            nextRetryAt: now,
            updatedAt: now,
          })
          .where(eq(regulationAmendmentImpacts.id, row.id));
        return "ready";
      }

      await this.db
        .update(regulationAmendmentImpacts)
        .set({
          status: "failed",
          whatChangedJson: JSON.stringify([]),
          legalImpactJson: JSON.stringify([]),
          affectedPartiesJson: JSON.stringify([]),
          citationsJson: JSON.stringify([]),
          method: aiResponse.method || "regulation_amendment_impact_v1",
          errorCode: aiResponse.error_code || "amendment_impact_error",
          warningsJson: JSON.stringify(aiResponse.warnings || []),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationAmendmentImpacts.id, row.id));
      return "failed";
    } catch (error) {
      logger.error(
        { err: error, regulationAmendmentImpactId: row.id },
        "Regulation amendment impact processing failed"
      );

      await this.db
        .update(regulationAmendmentImpacts)
        .set({
          status: "failed",
          whatChangedJson: JSON.stringify([]),
          legalImpactJson: JSON.stringify([]),
          affectedPartiesJson: JSON.stringify([]),
          citationsJson: JSON.stringify([]),
          method: "regulation_amendment_impact_v1",
          errorCode: "amendment_impact_service_error",
          warningsJson: JSON.stringify([
            error instanceof Error ? error.message : "Unknown AI service error",
          ]),
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(regulationAmendmentImpacts.id, row.id));

      return "failed";
    }
  }

  async runPendingRegulationAmendmentImpacts(): Promise<RegulationAmendmentImpactQueueResult> {
    if (!env.REG_IMPACT_ENABLED) {
      return {
        processed: 0,
        ready: 0,
        failed: 0,
      };
    }

    const now = new Date();
    const rows = await this.db.query.regulationAmendmentImpacts.findMany({
      where: and(
        inArray(regulationAmendmentImpacts.status, ["pending", "failed", "processing"]),
        lte(regulationAmendmentImpacts.nextRetryAt, now)
      ),
      orderBy: [asc(regulationAmendmentImpacts.nextRetryAt)],
      limit: env.REG_IMPACT_BATCH_SIZE,
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
    const concurrency = Math.max(1, env.REG_IMPACT_MAX_CONCURRENCY);

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

  async getQueueHealth(): Promise<RegulationAmendmentImpactQueueHealth> {
    const rows = await this.db.query.regulationAmendmentImpacts.findMany({
      columns: {
        status: true,
      },
    });

    const totals: RegulationAmendmentImpactQueueHealth = {
      total: rows.length,
      pending: 0,
      processing: 0,
      ready: 0,
      failed: 0,
    };

    for (const row of rows) {
      const status = row.status;
      if (status in totals) {
        totals[status as keyof RegulationAmendmentImpactQueueHealth] += 1;
      }
    }

    return totals;
  }
}
