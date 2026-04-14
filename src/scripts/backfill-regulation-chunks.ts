import { desc } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db/connection";
import { regulationVersions } from "../db/schema";
import { RegulationRagService } from "../services/regulation-rag.service";
import { logger } from "../utils/logger";

function isConnectionError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } })?.cause;
  const code = cause?.code ?? (err as NodeJS.ErrnoException)?.code;
  const message = String((err as Error)?.message ?? "");
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    message.includes("ECONNREFUSED") ||
    message.includes("fetch failed")
  );
}

async function run() {
  if (!env.AI_SERVICE_URL) {
    logger.error("AI_SERVICE_URL is not configured. Cannot run backfill.");
    throw new Error("AI_SERVICE_URL is required for regulation chunk backfill");
  }

  const baseUrl = env.AI_SERVICE_URL.replace(/\/+$/, "");
  try {
    const res = await fetch(`${baseUrl}/health/`);
    if (!res.ok) {
      throw new Error(`AI service health check failed: ${res.status}`);
    }
  } catch (err) {
    if (isConnectionError(err)) {
      logger.error(
        { err, url: baseUrl },
        "AI service is unreachable. Start it with: cd Legal-Case-Management-System-AI-Microservice && source venv/bin/activate && cd ai_service && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
      );
      throw new Error("AI service unreachable - aborting backfill");
    }
    throw err;
  }

  const ragService = new RegulationRagService(db);
  const versions = await db.query.regulationVersions.findMany({
    columns: {
      id: true,
      regulationId: true,
      versionNumber: true,
      content: true,
    },
    orderBy: [desc(regulationVersions.versionNumber)],
  });

  const latestByRegulationId = new Map<
    number,
    { id: number; regulationId: number; versionNumber: number; content: string }
  >();
  for (const version of versions) {
    if (!latestByRegulationId.has(version.regulationId)) {
      latestByRegulationId.set(version.regulationId, version);
    }
  }

  let indexed = 0;
  let failed = 0;
  for (const version of latestByRegulationId.values()) {
    try {
      await ragService.reindexRegulationVersionChunks({
        regulationId: version.regulationId,
        regulationVersionId: version.id,
        sourceText: version.content || "",
      });
      indexed += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        {
          err: error,
          regulationId: version.regulationId,
          regulationVersionId: version.id,
        },
        "Failed to backfill regulation chunks"
      );
      if (isConnectionError(error)) {
        logger.error(
          "AI service connection lost. Aborting to avoid iterating through remaining regulations."
        );
        throw error;
      }
    }
  }

  logger.info(
    {
      indexed,
      failed,
      total: latestByRegulationId.size,
    },
    "Regulation chunk backfill completed"
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error({ err: error }, "Regulation chunk backfill failed");
    process.exit(1);
  });
