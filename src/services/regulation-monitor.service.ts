import { createHash } from "crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  notifications,
  regulationMonitorRuns,
  regulationSubscriptions,
  regulations,
  regulationVersions,
} from "../db/schema";
import { env } from "../config/env";
import { AIClientService } from "./ai-client.service";
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

interface SubscriptionGroup {
  regulationId: number;
  sourceUrl: string;
  subscriptions: Array<{
    id: number;
    userId: string;
    organizationId: number;
    checkIntervalHours: number;
    lastEtag: string | null;
    lastModified: Date | null;
    lastContentHash: string | null;
  }>;
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

  private async getDueSubscriptionGroups(
    now: Date,
    regulationId?: number
  ): Promise<SubscriptionGroup[]> {
    const whereConditions = [
      eq(regulationSubscriptions.isActive, true),
      lte(regulationSubscriptions.nextCheckAt, now),
    ];

    if (typeof regulationId === "number") {
      whereConditions.push(eq(regulationSubscriptions.regulationId, regulationId));
    }

    const rows = await this.db.query.regulationSubscriptions.findMany({
      where: and(...whereConditions),
      columns: {
        id: true,
        userId: true,
        organizationId: true,
        regulationId: true,
        sourceUrl: true,
        checkIntervalHours: true,
        lastEtag: true,
        lastModified: true,
        lastContentHash: true,
      },
      orderBy: (table, { asc }) => [
        asc(table.nextCheckAt),
        asc(table.regulationId),
      ],
    });

    const grouped = new Map<string, SubscriptionGroup>();
    for (const row of rows) {
      const key = `${row.regulationId}::${row.sourceUrl}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.subscriptions.push(row);
        continue;
      }

      grouped.set(key, {
        regulationId: row.regulationId,
        sourceUrl: row.sourceUrl,
        subscriptions: [row],
      });
    }

    return [...grouped.values()];
  }

  private async markSubscriptionsFailed(
    group: SubscriptionGroup,
    now: Date
  ): Promise<void> {
    const retryAt = this.getRetryAt(now);
    await Promise.all(
      group.subscriptions.map((subscription) =>
        this.db
          .update(regulationSubscriptions)
          .set({
            lastCheckedAt: now,
            nextCheckAt: retryAt,
            updatedAt: now,
          })
          .where(eq(regulationSubscriptions.id, subscription.id))
      )
    );
  }

  private async markSubscriptionsChecked(
    group: SubscriptionGroup,
    now: Date,
    data: {
      etag?: string | null;
      lastModified?: Date | null;
      contentHash?: string | null;
    }
  ): Promise<void> {
    await Promise.all(
      group.subscriptions.map((subscription) =>
        this.db
          .update(regulationSubscriptions)
          .set({
            lastCheckedAt: now,
            lastEtag: data.etag ?? subscription.lastEtag,
            lastModified: data.lastModified ?? subscription.lastModified,
            lastContentHash: data.contentHash ?? subscription.lastContentHash,
            nextCheckAt: this.getNextCheckAt(now, subscription.checkIntervalHours),
            updatedAt: now,
          })
          .where(eq(regulationSubscriptions.id, subscription.id))
      )
    );
  }

  private async createRegulationVersion(
    group: SubscriptionGroup,
    content: string,
    contentHash: string,
    rawHtml: string | null,
    now: Date
  ): Promise<{ id: number; versionNumber: number }> {
    const latestVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.regulationId, group.regulationId),
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
        regulationId: group.regulationId,
        versionNumber: nextVersionNumber,
        content,
        contentHash,
        rawHtml,
        changesSummary: "Detected automatic source content change.",
        createdBy: "monitor_worker",
      })
      .returning({
        id: regulationVersions.id,
        versionNumber: regulationVersions.versionNumber,
      });

    await this.db
      .update(regulations)
      .set({
        updatedAt: now,
        status: "amended",
      })
      .where(eq(regulations.id, group.regulationId));

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

    const notificationRows = [...uniqueSubscribers.values()].map((subscriber) => ({
      userId: subscriber.userId,
      organizationId: subscriber.organizationId,
      type: "regulation_update" as const,
      title: `Regulation #${regulationId} updated`,
      message: `A new version (v${versionNumber}) was detected for a subscribed regulation.`,
      relatedRegulationId: regulationId,
      createdAt: now,
    }));

    await this.db.insert(notifications).values(notificationRows);

    if (typeof this.broadcastToOrg === "function") {
      const orgIds = new Set(notificationRows.map((row) => row.organizationId));
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

  private async processGroup(
    group: SubscriptionGroup,
    now: Date,
    dryRun: boolean
  ): Promise<{ changed: boolean; createdVersion: boolean; failed: boolean }> {
    if (!this.aiClient) {
      logger.warn(
        { regulationId: group.regulationId, sourceUrl: group.sourceUrl },
        "Skipping regulation extraction - AI_SERVICE_URL not configured"
      );
      return { changed: false, createdVersion: false, failed: true };
    }

    const representative = group.subscriptions[0];

    let extraction;
    try {
      extraction = await this.aiClient.extractRegulationContent({
        sourceUrl: group.sourceUrl,
        ifNoneMatch: representative.lastEtag,
        ifModifiedSince: representative.lastModified
          ? representative.lastModified.toUTCString()
          : null,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          regulationId: group.regulationId,
          sourceUrl: group.sourceUrl,
        },
        "Regulation monitor extraction call failed"
      );
      if (!dryRun) {
        await this.markSubscriptionsFailed(group, now);
      }
      return { changed: false, createdVersion: false, failed: true };
    }

    if (extraction.status === "error") {
      logger.warn(
        {
          regulationId: group.regulationId,
          sourceUrl: group.sourceUrl,
          errorCode: extraction.error_code,
          warnings: extraction.warnings,
        },
        "Regulation monitor received extraction error status"
      );
      if (!dryRun) {
        await this.markSubscriptionsFailed(group, now);
      }
      return { changed: false, createdVersion: false, failed: true };
    }

    const parsedLastModified = this.parseHttpDate(extraction.last_modified);

    if (extraction.status === "not_modified") {
      if (!dryRun) {
        await this.markSubscriptionsChecked(group, now, {
          etag: extraction.etag || representative.lastEtag,
          lastModified: parsedLastModified || representative.lastModified,
        });
      }
      return { changed: false, createdVersion: false, failed: false };
    }

    const extractedText = this.normalizeText(extraction.extracted_text || "");
    if (!extractedText) {
      if (!dryRun) {
        await this.markSubscriptionsFailed(group, now);
      }
      return { changed: false, createdVersion: false, failed: true };
    }

    const extractedHash =
      extraction.normalized_text_hash || this.hashText(extractedText);
    const latestVersion = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.regulationId, group.regulationId),
      columns: {
        id: true,
        versionNumber: true,
        contentHash: true,
      },
      orderBy: [desc(regulationVersions.versionNumber)],
    });

    const changed = latestVersion?.contentHash !== extractedHash;

    if (!dryRun) {
      await this.markSubscriptionsChecked(group, now, {
        etag: extraction.etag || representative.lastEtag,
        lastModified: parsedLastModified || representative.lastModified,
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
      group,
      extractedText,
      extractedHash,
      extraction.raw_html || null,
      now
    );
    await this.notifySubscribers(
      group.regulationId,
      version.id,
      version.versionNumber,
      now
    );

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
      const groups = await this.getDueSubscriptionGroups(now, options.regulationId);
      const result: RegulationMonitorRunResult = {
        scanned: groups.length,
        changed: 0,
        versionsCreated: 0,
        failed: 0,
      };

      if (groups.length === 0) {
        return result;
      }

      const concurrency = Math.max(1, env.REG_MONITOR_MAX_CONCURRENCY);
      for (let index = 0; index < groups.length; index += concurrency) {
        const batch = groups.slice(index, index + concurrency);
        const batchResults = await Promise.all(
          batch.map((group) => this.processGroup(group, now, Boolean(options.dryRun)))
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
