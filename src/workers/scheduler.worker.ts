/*
 * Scheduler worker — bucket B (scheduled cron-style jobs).
 *
 * Owns:
 *  - MOJ regulation source sync (every REG_SOURCE_SYNC_INTERVAL_MINUTES)
 *  - Open Data Saudi sync (every OPEN_DATA_SYNC_INTERVAL_MINUTES)
 *  - Regulation subscription "due now" runs (uses pg_advisory_lock inside
 *    RegulationMonitorService — keep one instance at a time)
 *
 * Does NOT own queue draining for regulation insights, amendment impact, or
 * document insights — those are now sync HTTP handlers (bucket A). Document
 * extraction is in its own worker (bucket C: `document-extraction.worker.ts`).
 */

import { db } from "../db/connection";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { RegulationMonitorService } from "../services/regulation-monitor.service";
import { RegulationSourceService } from "../services/regulation-source.service";
import { OpenDataSourceService } from "../services/open-data-source.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;

async function main() {
  const monitorService = new RegulationMonitorService(db);
  const sourceService = new RegulationSourceService(db);
  const openDataService = new OpenDataSourceService(db);
  let lastSourceSyncAt = 0;
  let lastOpenDataSyncAt = 0;

  logger.info(
    {
      pollSeconds: env.REG_MONITOR_POLL_SECONDS,
      concurrency: env.REG_MONITOR_MAX_CONCURRENCY,
      failureRetryMinutes: env.REG_MONITOR_FAILURE_RETRY_MINUTES,
      sourceSyncEnabled: env.REG_SOURCE_SYNC_ENABLED,
      sourceSyncIntervalMinutes: env.REG_SOURCE_SYNC_INTERVAL_MINUTES,
      sourceMaxPages: env.REG_SOURCE_MOJ_MAX_PAGES,
      openDataSyncEnabled: env.OPEN_DATA_SYNC_ENABLED,
      openDataSyncIntervalMinutes: env.OPEN_DATA_SYNC_INTERVAL_MINUTES,
      openDataPublishers: env.OPEN_DATA_TRUSTED_PUBLISHERS,
    },
    "Scheduler worker started"
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

      if (env.OPEN_DATA_SYNC_ENABLED) {
        const intervalMs = env.OPEN_DATA_SYNC_INTERVAL_MINUTES * 60 * 1000;
        const shouldSync = Date.now() - lastOpenDataSyncAt >= intervalMs;
        if (shouldSync) {
          try {
            const openDataResult = await openDataService.syncTrustedPublishers();
            lastOpenDataSyncAt = Date.now();
            logger.info(openDataResult, "Open Data Saudi sync cycle completed");
          } catch (err) {
            // Don't poison the rest of the cycle on open-data failures
            lastOpenDataSyncAt = Date.now();
            logger.error(
              { err },
              "Open Data Saudi sync cycle failed; will retry next interval"
            );
          }
        }
      }

      await monitorService.runDueSubscriptions({
        triggerSource: "worker",
      });
    } catch (error) {
      logger.error({ err: error }, "Unhandled error during scheduler cycle");
    }

    const elapsed = Date.now() - startedAt;
    const pollMs = Math.max(1, env.REG_MONITOR_POLL_SECONDS) * 1000;
    const waitMs = Math.max(0, pollMs - elapsed);
    await sleep(waitMs);
  }

  logger.info("Scheduler worker stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    running = false;
  });
}

main().catch((error) => {
  logger.error({ err: error }, "Scheduler worker fatal error");
  process.exit(1);
});
