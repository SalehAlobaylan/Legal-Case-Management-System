import { db } from "../db/connection";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { RegulationMonitorService } from "../services/regulation-monitor.service";
import { DocumentExtractionService } from "../services/document-extraction.service";
import { RegulationSourceService } from "../services/regulation-source.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;

async function main() {
  if (!env.REG_MONITOR_ENABLED) {
    logger.info("Regulation monitor worker is disabled via REG_MONITOR_ENABLED=false");
    return;
  }

  const monitorService = new RegulationMonitorService(db);
  const sourceService = new RegulationSourceService(db);
  const documentExtractionService = new DocumentExtractionService(db);
  let lastSourceSyncAt = 0;
  logger.info(
    {
      pollSeconds: env.REG_MONITOR_POLL_SECONDS,
      concurrency: env.REG_MONITOR_MAX_CONCURRENCY,
      failureRetryMinutes: env.REG_MONITOR_FAILURE_RETRY_MINUTES,
      sourceSyncEnabled: env.REG_SOURCE_SYNC_ENABLED,
      sourceSyncIntervalMinutes: env.REG_SOURCE_SYNC_INTERVAL_MINUTES,
      sourceMaxPages: env.REG_SOURCE_MOJ_MAX_PAGES,
      docExtractionEnabled: env.CASE_DOC_EXTRACTION_ENABLED,
      docExtractionBatchSize: env.CASE_DOC_EXTRACTION_BATCH_SIZE,
      docExtractionConcurrency: env.CASE_DOC_EXTRACTION_MAX_CONCURRENCY,
      docInsightsEnabled: env.CASE_DOC_INSIGHTS_ENABLED,
      docInsightsBatchSize: env.CASE_DOC_INSIGHTS_BATCH_SIZE,
      docInsightsConcurrency: env.CASE_DOC_INSIGHTS_MAX_CONCURRENCY,
    },
    "Regulation monitor worker started"
  );

  while (running) {
    const startedAt = Date.now();
    try {
      if (env.REG_SOURCE_SYNC_ENABLED) {
        const intervalMs = env.REG_SOURCE_SYNC_INTERVAL_MINUTES * 60 * 1000;
        const shouldSync = Date.now() - lastSourceSyncAt >= intervalMs;
        if (shouldSync) {
          const syncResult = await sourceService.syncMojSource({
            maxPages: env.REG_SOURCE_MOJ_MAX_PAGES,
            extractContent: true,
            triggerSource: "moj_source_sync",
          });
          lastSourceSyncAt = Date.now();
          logger.info(syncResult, "MOJ regulation source sync cycle completed");
        }
      }

      await monitorService.runDueSubscriptions({
        triggerSource: "worker",
      });
      const extractionResult =
        await documentExtractionService.runPendingExtractions();
      if (extractionResult.processed > 0) {
        logger.info(
          extractionResult,
          "Case document extraction cycle completed"
        );
      }
      const insightsResult = await documentExtractionService.runPendingInsights();
      if (insightsResult.processed > 0) {
        logger.info(insightsResult, "Case document insights cycle completed");
      }
    } catch (error) {
      logger.error({ err: error }, "Unhandled error during regulation monitor cycle");
    }

    const elapsed = Date.now() - startedAt;
    const pollMs = Math.max(1, env.REG_MONITOR_POLL_SECONDS) * 1000;
    const waitMs = Math.max(0, pollMs - elapsed);
    await sleep(waitMs);
  }

  logger.info("Regulation monitor worker stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    running = false;
  });
}

main().catch((error) => {
  logger.error({ err: error }, "Regulation monitor worker fatal error");
  process.exit(1);
});
