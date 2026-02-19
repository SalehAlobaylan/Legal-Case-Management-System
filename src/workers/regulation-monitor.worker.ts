import { db } from "../db/connection";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { RegulationMonitorService } from "../services/regulation-monitor.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;

async function main() {
  if (!env.REG_MONITOR_ENABLED) {
    logger.info("Regulation monitor worker is disabled via REG_MONITOR_ENABLED=false");
    return;
  }

  const monitorService = new RegulationMonitorService(db);
  logger.info(
    {
      pollSeconds: env.REG_MONITOR_POLL_SECONDS,
      concurrency: env.REG_MONITOR_MAX_CONCURRENCY,
      failureRetryMinutes: env.REG_MONITOR_FAILURE_RETRY_MINUTES,
    },
    "Regulation monitor worker started"
  );

  while (running) {
    const startedAt = Date.now();
    try {
      await monitorService.runDueSubscriptions({
        triggerSource: "worker",
      });
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
