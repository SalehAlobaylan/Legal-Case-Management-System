import { createHash } from "crypto";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulationMonitorRuns,
  regulationSubscriptions,
  regulations,
  regulationVersions,
} from "../db/schema";
import { env } from "../config/env";
import { AIClientService } from "./ai-client.service";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { logger } from "../utils/logger";

export interface RegulationMonitorRunOptions {
  regulationId?: number;
  dryRun?: boolean;
  triggerSource?: string;
  triggeredByUserId?: string;
}

export interface RegulationMonitorRunResult {
  scanned: number;
  changed: number;
  versionsCreated: number;
  failed: number;
}

export interface RegulationMonitorHealthSummary {
  hasRun: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  minutesSinceLastRun: number | null;
  failedRuns24h: number;
  successfulRuns24h: number;
}

interface DueRegulation {
  id: number;
  sourceUrl: string;
  checkIntervalHours: number;
  lastEtag: string | null;
  lastModified: Date | null;
  lastContentHash: string | null;
  consecutiveFailures: number;
}

export class RegulationMonitorService {
  private readonly aiClient: AIClientService | null = null;
  private readonly advisoryLockId = 948233;

  constructor(
    private readonly db: Database,
    private readonly broadcastToOrg?: (
      orgId: number,
      event: string,
      data: Record<string, unknown>
    ) => void,
    private readonly emitToUser?: (
      userId: string,
      event: string,
      data: Record<string, unknown>
    ) => void
  ) {
    if (env.AI_SERVICE_URL) {
      this.aiClient = new AIClientService();
    } else {
      logger.warn("AI_SERVICE_URL not configured - regulation content extraction will be disabled");
    }
  }

  private normalizeText(text: string): string {
    return text.split(/\s+/).filter(Boolean).join(" ").trim();
  }

  private hashText(text: string): string {
    return createHash("sha256").update(text, "utf-8").digest("hex");
  }

  private parseHttpDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private getRetryAt(base: Date): Date {
    return new Date(
      base.getTime() + env.REG_MONITOR_FAILURE_RETRY_MINUTES * 60 * 1000
    );
  }

  private getNextCheckAt(base: Date, intervalHours: number): Date {
    const safeInterval = Math.max(1, intervalHours || 24);
    return new Date(base.getTime() + safeInterval * 60 * 60 * 1000);
  }

  private async acquireRunLock(): Promise<boolean> {
    const result = await this.db.execute(
      sql`select pg_try_advisory_lock(${this.advisoryLockId}) as locked`
    );
    const row = (result as any)?.[0];
    return Boolean(row?.locked);
  }

  private async releaseRunLock(): Promise<void> {
    await this.db.execute(
      sql`select pg_advisory_unlock(${this.advisoryLockId})`
    );
  }

  private async persistRun(params: {
    startedAt: Date;
    finishedAt: Date;
    status: "success" | "failed" | "skipped";
    triggerSource: string;
    triggeredByUserId?: string;
    dryRun: boolean;
    result: RegulationMonitorRunResult;
    errorMessage?: string;
  }): Promise<void> {
    await this.db.insert(regulationMonitorRuns).values({
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      status: params.status,
      triggerSource: params.triggerSource,
      triggeredByUserId: params.triggeredByUserId,
      dryRun: params.dryRun,
      scanned: params.result.scanned,
      changed: params.result.changed,
      versionsCreated: params.result.versionsCreated,
      failed: params.result.failed,
      errorMessage: params.errorMessage,
    });
  }

  private async getDueRegulations(
    now: Date,
    regulationId?: number
  ): Promise<DueRegulation[]> {
    const whereConditions = [
      eq(regulations.monitoringEnabled, true),
      isNotNull(regulations.sourceUrl),
      lte(regulations.nextCheckAt, now),
    ];

    if (typeof regulationId === "number") {
      whereConditions.push(eq(regulations.id, regulationId));
    }

    const rows = await this.db.query.regulations.findMany({
      where: and(...whereConditions),
      columns: {
        id: true,
        sourceUrl: true,
        checkIntervalHours: true,
        lastEtag: true,
        lastModified: true,
        lastContentHash: true,
        consecutiveFailures: true,
      },
      orderBy: (table, { asc }) => [asc(table.nextCheckAt), asc(table.id)],
    });

    return rows
      .filter((row): row is DueRegulation & { sourceUrl: string } =>
        Boolean(row.sourceUrl)
      )
      .map((row) => ({
        id: row.id,
        sourceUrl: row.sourceUrl as string,
        checkIntervalHours: row.checkIntervalHours,
        lastEtag: row.lastEtag,
        lastModified: row.lastModified,
        lastContentHash: row.lastContentHash,
        consecutiveFailures: row.consecutiveFailures,
      }));
  }

  private async markRegulationFailed(
    regulation: DueRegulation,
    now: Date
  ): Promise<void> {
    const retryAt = this.getRetryAt(now);
    await this.db
      .update(regulations)
      .set({
        lastCheckedAt: now,
        nextCheckAt: retryAt,
        consecutiveFailures: regulation.consecutiveFailures + 1,
        updatedAt: now,
      })
      .where(eq(regulations.id, regulation.id));
  }

  private async markRegulationChecked(
    regulation: DueRegulation,
    now: Date,
    data: {
      etag?: string | null;
      lastModified?: Date | null;
      contentHash?: string | null;
    }
  ): Promise<void> {
    await this.db
      .update(regulations)
      .set({
        lastCheckedAt: now,
        lastEtag: data.etag ?? regulation.lastEtag,
        lastModified: data.lastModified ?? regulation.lastModified,
        lastContentHash: data.contentHash ?? regulation.lastContentHash,
        nextCheckAt: this.getNextCheckAt(now, regulation.checkIntervalHours),
        consecutiveFailures: 0,
        updatedAt: now,
      })
      .where(eq(regulations.id, regulation.id));
  }

  private async createRegulationVersion(
    regulationId: number,
    content: string,
    contentHash: string,
    rawHtml: string | null,
    now: Date,
    isFirstVersion: boolean
  ): Promise<{ id: number; versionNumber: number }> {
    const latestVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.regulationId, regulationId),
      columns: {
        id: true,
        versionNumber: true,
      },
      orderBy: [desc(regulationVersions.versionNumber)],
    });

    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;
    const [version] = await this.db
      .insert(regulationVersions)
      .values({
        regulationId,
        versionNumber: nextVersionNumber,
        content,
        contentHash,
        rawHtml,
        changesSummary: isFirstVersion
          ? "Initial captured baseline from source."
          : "Detected automatic source content change.",
        createdBy: "monitor_worker",
      })
      .returning({
        id: regulationVersions.id,
        versionNumber: regulationVersions.versionNumber,
      });

    if (!isFirstVersion) {
      await this.db
        .update(regulations)
        .set({
          updatedAt: now,
          status: "amended",
        })
        .where(eq(regulations.id, regulationId));
    }

    return version;
  }

  private async notifySubscribers(
    regulationId: number,
    versionId: number,
    versionNumber: number,
    now: Date
  ): Promise<void> {
    const subscribers = await this.db.query.regulationSubscriptions.findMany({
      where: and(
        eq(regulationSubscriptions.regulationId, regulationId),
        eq(regulationSubscriptions.isActive, true)
      ),
      columns: {
        userId: true,
        organizationId: true,
      },
    });

    if (subscribers.length === 0) {
      return;
    }

    const uniqueSubscribers = new Map<string, { userId: string; organizationId: number }>();
    for (const subscriber of subscribers) {
      uniqueSubscribers.set(
        `${subscriber.userId}:${subscriber.organizationId}`,
        subscriber
      );
    }

    const notificationDelivery = new NotificationDeliveryService(
      this.db,
      this.emitToUser
    );
    const recipients = [...uniqueSubscribers.values()].map((subscriber) => ({
      userId: subscriber.userId,
      organizationId: subscriber.organizationId,
    }));
    await notificationDelivery.notifyUsers({
      recipients,
      type: "regulation_update",
      category: "regulationUpdates",
      title: `Regulation #${regulationId} updated`,
      message: `A new version (v${versionNumber}) was detected for a subscribed regulation.`,
      relatedRegulationId: regulationId,
      createdAt: now,
    });

    if (typeof this.broadcastToOrg === "function") {
      const orgIds = new Set(recipients.map((recipient) => recipient.organizationId));
      for (const orgId of orgIds) {
        this.broadcastToOrg(orgId, "regulation-updated", {
          regulationId,
          versionId,
          versionNumber,
          detectedAt: now.toISOString(),
        });
      }
    }
  }

  private async processRegulation(
    regulation: DueRegulation,
    now: Date,
    dryRun: boolean
  ): Promise<{ changed: boolean; createdVersion: boolean; failed: boolean }> {
    if (!this.aiClient) {
      logger.warn(
        { regulationId: regulation.id, sourceUrl: regulation.sourceUrl },
        "Skipping regulation extraction - AI_SERVICE_URL not configured"
      );
      return { changed: false, createdVersion: false, failed: true };
    }

    let extraction;
    try {
      extraction = await this.aiClient.extractRegulationContent({
        sourceUrl: regulation.sourceUrl,
        ifNoneMatch: regulation.lastEtag,
        ifModifiedSince: regulation.lastModified
          ? regulation.lastModified.toUTCString()
          : null,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          regulationId: regulation.id,
          sourceUrl: regulation.sourceUrl,
        },
        "Regulation monitor extraction call failed"
      );
      if (!dryRun) {
        await this.markRegulationFailed(regulation, now);
      }
      return { changed: false, createdVersion: false, failed: true };
    }

    if (extraction.status === "error") {
      logger.warn(
        {
          regulationId: regulation.id,
          sourceUrl: regulation.sourceUrl,
          errorCode: extraction.error_code,
          warnings: extraction.warnings,
        },
        "Regulation monitor received extraction error status"
      );
      if (!dryRun) {
        await this.markRegulationFailed(regulation, now);
      }
      return { changed: false, createdVersion: false, failed: true };
    }

    const parsedLastModified = this.parseHttpDate(extraction.last_modified);

    if (extraction.status === "not_modified") {
      if (!dryRun) {
        await this.markRegulationChecked(regulation, now, {
          etag: extraction.etag || regulation.lastEtag,
          lastModified: parsedLastModified || regulation.lastModified,
        });
      }
      return { changed: false, createdVersion: false, failed: false };
    }

    const extractedText = this.normalizeText(extraction.extracted_text || "");
    if (!extractedText) {
      if (!dryRun) {
        await this.markRegulationFailed(regulation, now);
      }
      return { changed: false, createdVersion: false, failed: true };
    }

    const extractedHash =
      extraction.normalized_text_hash || this.hashText(extractedText);

    const latestVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.regulationId, regulation.id),
      columns: {
        id: true,
        versionNumber: true,
        contentHash: true,
      },
      orderBy: [desc(regulationVersions.versionNumber)],
    });

    const isFirstVersion = !latestVersion;
    const changed =
      isFirstVersion || latestVersion?.contentHash !== extractedHash;

    if (!dryRun) {
      await this.markRegulationChecked(regulation, now, {
        etag: extraction.etag || regulation.lastEtag,
        lastModified: parsedLastModified || regulation.lastModified,
        contentHash: extractedHash,
      });
    }

    if (!changed) {
      return { changed: false, createdVersion: false, failed: false };
    }

    if (dryRun) {
      return { changed: true, createdVersion: false, failed: false };
    }

    const version = await this.createRegulationVersion(
      regulation.id,
      extractedText,
      extractedHash,
      extraction.raw_html || null,
      now,
      isFirstVersion
    );

    if (!isFirstVersion) {
      await this.notifySubscribers(
        regulation.id,
        version.id,
        version.versionNumber,
        now
      );
    }

    return { changed: true, createdVersion: true, failed: false };
  }

  async runDueSubscriptions(
    options: RegulationMonitorRunOptions = {}
  ): Promise<RegulationMonitorRunResult> {
    const startedAtDate = new Date();
    const triggerSource = options.triggerSource || "worker";
    const dryRun = Boolean(options.dryRun);

    const lockAcquired = await this.acquireRunLock();
    if (!lockAcquired) {
      logger.info("Skipping regulation monitor run; advisory lock is already held");
      const skippedResult = {
        scanned: 0,
        changed: 0,
        versionsCreated: 0,
        failed: 0,
      };
      await this.persistRun({
        startedAt: startedAtDate,
        finishedAt: new Date(),
        status: "skipped",
        triggerSource,
        triggeredByUserId: options.triggeredByUserId,
        dryRun,
        result: skippedResult,
      });
      return skippedResult;
    }

    const startedAt = Date.now();
    try {
      const now = new Date();
      const dueRegulations = await this.getDueRegulations(now, options.regulationId);
      const result: RegulationMonitorRunResult = {
        scanned: dueRegulations.length,
        changed: 0,
        versionsCreated: 0,
        failed: 0,
      };

      if (dueRegulations.length === 0) {
        await this.persistRun({
          startedAt: startedAtDate,
          finishedAt: new Date(),
          status: "success",
          triggerSource,
          triggeredByUserId: options.triggeredByUserId,
          dryRun,
          result,
        });
        return result;
      }

      const concurrency = Math.max(1, env.REG_MONITOR_MAX_CONCURRENCY);
      for (let index = 0; index < dueRegulations.length; index += concurrency) {
        const batch = dueRegulations.slice(index, index + concurrency);
        const batchResults = await Promise.all(
          batch.map((regulation) => this.processRegulation(regulation, now, dryRun))
        );

        for (const item of batchResults) {
          if (item.failed) {
            result.failed += 1;
          }
          if (item.changed) {
            result.changed += 1;
          }
          if (item.createdVersion) {
            result.versionsCreated += 1;
          }
        }
      }

      logger.info(
        {
          ...result,
          dryRun,
          durationMs: Date.now() - startedAt,
        },
        "Regulation monitor run finished"
      );

      await this.persistRun({
        startedAt: startedAtDate,
        finishedAt: new Date(),
        status: "success",
        triggerSource,
        triggeredByUserId: options.triggeredByUserId,
        dryRun,
        result,
      });

      return result;
    } catch (error) {
      const failureResult: RegulationMonitorRunResult = {
        scanned: 0,
        changed: 0,
        versionsCreated: 0,
        failed: 1,
      };
      await this.persistRun({
        startedAt: startedAtDate,
        finishedAt: new Date(),
        status: "failed",
        triggerSource,
        triggeredByUserId: options.triggeredByUserId,
        dryRun,
        result: failureResult,
        errorMessage:
          error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
      });
      throw error;
    } finally {
      await this.releaseRunLock().catch((error) => {
        logger.warn({ err: error }, "Failed to release regulation monitor advisory lock");
      });
    }
  }

  async getRecentRuns(limit: number = 20) {
    const safeLimit = Math.max(1, Math.min(100, limit));
    return this.db.query.regulationMonitorRuns.findMany({
      orderBy: [desc(regulationMonitorRuns.startedAt)],
      limit: safeLimit,
    });
  }

  async getHealthSummary(): Promise<RegulationMonitorHealthSummary> {
    const lastRun = await this.db.query.regulationMonitorRuns.findFirst({
      orderBy: [desc(regulationMonitorRuns.startedAt)],
      columns: {
        startedAt: true,
        status: true,
      },
    });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24hRuns = await this.db.query.regulationMonitorRuns.findMany({
      where: gte(regulationMonitorRuns.startedAt, since24h),
      columns: {
        status: true,
      },
    });
    const failedRuns24h = last24hRuns.filter((run) => run.status === "failed").length;
    const successfulRuns24h = last24hRuns.filter(
      (run) => run.status === "success"
    ).length;

    if (!lastRun) {
      return {
        hasRun: false,
        lastRunAt: null,
        lastStatus: null,
        minutesSinceLastRun: null,
        failedRuns24h,
        successfulRuns24h,
      };
    }

    return {
      hasRun: true,
      lastRunAt: lastRun.startedAt.toISOString(),
      lastStatus: lastRun.status,
      minutesSinceLastRun: Math.floor(
        (Date.now() - lastRun.startedAt.getTime()) / 60000
      ),
      failedRuns24h,
      successfulRuns24h,
    };
  }
}
