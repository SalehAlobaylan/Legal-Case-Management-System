/*
 * Document extraction worker — bucket C (genuinely long-running async work).
 *
 * Owns:
 *  - Document text extraction queue (PDF parsing, OCR fallback). Kicked by
 *    uploads, not by user clicks, so async is correct here.
 *
 * Concurrency safety: `runPendingExtractions` uses SELECT ... FOR UPDATE SKIP
 * LOCKED inside its row-claim transaction (see document-extraction.service.ts),
 * so this worker is horizontally scalable — multiple instances will grab
 * disjoint row sets.
 *
 * Document INSIGHTS (the AI summary of an extracted document) is NOT processed
 * here — that's now a sync HTTP handler (bucket A:
 * `runDocumentInsightsRefreshSync`).
 */

import { db } from "../db/connection";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { DocumentExtractionService } from "../services/document-extraction.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;

async function main() {
  const documentExtractionService = new DocumentExtractionService(db);

  logger.info(
    {
      pollSeconds: env.REG_MONITOR_POLL_SECONDS,
      docExtractionEnabled: env.CASE_DOC_EXTRACTION_ENABLED,
      docExtractionBatchSize: env.CASE_DOC_EXTRACTION_BATCH_SIZE,
      docExtractionConcurrency: env.CASE_DOC_EXTRACTION_MAX_CONCURRENCY,
    },
    "Document extraction worker started"
  );

  while (running) {
    const startedAt = Date.now();
    try {
      const result = await documentExtractionService.runPendingExtractions();
      if (result.processed > 0) {
        logger.info(result, "Case document extraction cycle completed");
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Unhandled error during document extraction cycle"
      );
    }

    const elapsed = Date.now() - startedAt;
    const pollMs = Math.max(1, env.REG_MONITOR_POLL_SECONDS) * 1000;
    const waitMs = Math.max(0, pollMs - elapsed);
    await sleep(waitMs);
  }

  logger.info("Document extraction worker stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    running = false;
  });
}

main().catch((error) => {
  logger.error({ err: error }, "Document extraction worker fatal error");
  process.exit(1);
});
