import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulationChunks,
  regulationVersions,
  REGULATION_CHUNK_EMBEDDING_DIMENSION,
  type NewRegulationChunk,
} from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";

export interface RegulationChunkInput {
  chunkIndex: number;
  content: string;
  lineStart?: number | null;
  lineEnd?: number | null;
  articleRef?: string | null;
  tokenCount?: number | null;
  embedding?: number[] | null;
  metadata?: Record<string, unknown>;
}

export interface RetrieveRegulationChunksInput {
  embedding: number[];
  topK?: number;
}

export interface RetrievedRegulationChunk {
  id: number;
  regulationId: number;
  regulationVersionId: number;
  chunkIndex: number;
  content: string;
  lineStart: number | null;
  lineEnd: number | null;
  articleRef: string | null;
  tokenCount: number | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

interface RetrievedRegulationChunkRow {
  id: number;
  regulation_id: number;
  regulation_version_id: number;
  chunk_index: number;
  content: string;
  line_start: number | null;
  line_end: number | null;
  article_ref: string | null;
  token_count: number | null;
  metadata: unknown;
  similarity: number | string | null;
}

export class RegulationChunkService {
  constructor(private readonly db: Database) {}

  private async assertRegulationVersionAccess(
    regulationId: number,
    regulationVersionId: number
  ): Promise<void> {
    const version = await this.db.query.regulationVersions.findFirst({
      where: eq(regulationVersions.id, regulationVersionId),
      columns: {
        id: true,
        regulationId: true,
      },
    });

    if (!version) {
      throw new NotFoundError("RegulationVersion");
    }

    if (version.regulationId !== regulationId) {
      throw new ValidationError("Regulation version does not belong to regulation");
    }
  }

  private ensureChunkPayload(
    chunks: RegulationChunkInput[]
  ): RegulationChunkInput[] {
    const seenChunkIndexes = new Set<number>();
    for (const chunk of chunks) {
      if (!Number.isInteger(chunk.chunkIndex) || chunk.chunkIndex < 0) {
        throw new ValidationError("chunkIndex must be a non-negative integer");
      }
      if (!chunk.content || !chunk.content.trim()) {
        throw new ValidationError("Chunk content cannot be empty");
      }
      if (seenChunkIndexes.has(chunk.chunkIndex)) {
        throw new ConflictError(
          "Duplicate chunk_index values in request payload"
        );
      }
      seenChunkIndexes.add(chunk.chunkIndex);

      if (chunk.embedding) {
        if (chunk.embedding.length !== REGULATION_CHUNK_EMBEDDING_DIMENSION) {
          throw new ValidationError(
            `Chunk embedding must have ${REGULATION_CHUNK_EMBEDDING_DIMENSION} dimensions`
          );
        }
        for (const value of chunk.embedding) {
          if (!Number.isFinite(value)) {
            throw new ValidationError("Chunk embedding contains invalid values");
          }
        }
      }
    }

    return chunks;
  }

  private toVectorLiteral(vectorValues: number[]): string {
    if (vectorValues.length !== REGULATION_CHUNK_EMBEDDING_DIMENSION) {
      throw new ValidationError(
        `Query embedding must have ${REGULATION_CHUNK_EMBEDDING_DIMENSION} dimensions`
      );
    }
    if (vectorValues.some((value) => !Number.isFinite(value))) {
      throw new ValidationError("Query embedding contains invalid values");
    }
    return `[${vectorValues.join(",")}]`;
  }

  private toInsertRows(
    regulationId: number,
    regulationVersionId: number,
    chunks: RegulationChunkInput[]
  ): NewRegulationChunk[] {
    const now = new Date();
    return chunks.map((chunk) => ({
      regulationId,
      regulationVersionId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      lineStart: chunk.lineStart ?? null,
      lineEnd: chunk.lineEnd ?? null,
      articleRef: chunk.articleRef ?? null,
      tokenCount: chunk.tokenCount ?? null,
      embedding: chunk.embedding ?? null,
      metadata: chunk.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    }));
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    return (error as { code?: string }).code === "23505";
  }

  async reindexChunksForVersion(
    regulationId: number,
    regulationVersionId: number,
    chunks: RegulationChunkInput[]
  ) {
    await this.assertRegulationVersionAccess(regulationId, regulationVersionId);
    const normalizedChunks = this.ensureChunkPayload(chunks);

    try {
      return await this.db.transaction(async (tx) => {
        await tx
          .delete(regulationChunks)
          .where(
            and(
              eq(regulationChunks.regulationId, regulationId),
              eq(regulationChunks.regulationVersionId, regulationVersionId)
            )
          );

        if (normalizedChunks.length === 0) {
          return [] as Array<typeof regulationChunks.$inferSelect>;
        }

        return tx
          .insert(regulationChunks)
          .values(this.toInsertRows(regulationId, regulationVersionId, normalizedChunks))
          .returning();
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictError(
          "Chunk index already exists for this regulation version"
        );
      }
      throw error;
    }
  }

  async getChunksByVersionIds(
    regulationVersionIds: number[],
    perVersionLimit: number = 4
  ) {
    if (regulationVersionIds.length === 0) {
      return new Map<number, Array<typeof regulationChunks.$inferSelect>>();
    }

    const rows = await this.db.query.regulationChunks.findMany({
      where: inArray(regulationChunks.regulationVersionId, regulationVersionIds),
      orderBy: [regulationChunks.regulationVersionId, regulationChunks.chunkIndex],
    });

    const byVersionId = new Map<number, Array<typeof regulationChunks.$inferSelect>>();
    for (const row of rows) {
      const versionRows = byVersionId.get(row.regulationVersionId) || [];
      if (versionRows.length < perVersionLimit) {
        versionRows.push(row);
      }
      byVersionId.set(row.regulationVersionId, versionRows);
    }
    return byVersionId;
  }

  async retrieveTopKChunksBySimilarity(
    input: RetrieveRegulationChunksInput
  ): Promise<RetrievedRegulationChunk[]> {
    const topK = Math.max(1, Math.min(400, Math.floor(input.topK ?? 200)));
    const queryVector = this.toVectorLiteral(input.embedding);
    const rows = (await this.db.execute(sql`
      select
        "id",
        "regulation_id",
        "regulation_version_id",
        "chunk_index",
        "content",
        "line_start",
        "line_end",
        "article_ref",
        "token_count",
        "metadata",
        1 - ("embedding" <=> ${queryVector}::vector) as "similarity"
      from "regulation_chunks"
      where "embedding" is not null
      order by "embedding" <=> ${queryVector}::vector
      limit ${topK}
    `)) as unknown as RetrievedRegulationChunkRow[];

    return rows.map((row) => ({
      id: row.id,
      regulationId: row.regulation_id,
      regulationVersionId: row.regulation_version_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      articleRef: row.article_ref,
      tokenCount: row.token_count,
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {},
      similarity: Number(row.similarity || 0),
    }));
  }
}
