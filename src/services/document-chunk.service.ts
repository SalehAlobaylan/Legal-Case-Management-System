import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  documentChunks,
  documents,
  DOCUMENT_CHUNK_EMBEDDING_DIMENSION,
  type NewDocumentChunk,
} from "../db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";

export interface DocumentChunkInput {
  chunkIndex: number;
  content: string;
  contentLang?: string | null;
  tokenCount?: number | null;
  embedding?: number[] | null;
  metadata?: Record<string, unknown>;
}

export interface RetrieveDocumentChunksInput {
  organizationId: number;
  embedding: number[];
  topK?: number;
  documentId?: number;
}

export interface RetrievedDocumentChunk {
  id: number;
  organizationId: number;
  documentId: number;
  chunkIndex: number;
  content: string;
  contentLang: string | null;
  tokenCount: number | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

interface RetrievedDocumentChunkRow {
  id: number;
  organization_id: number;
  document_id: number;
  chunk_index: number;
  content: string;
  content_lang: string | null;
  token_count: number | null;
  metadata: unknown;
  similarity: number | string | null;
}

export class DocumentChunkService {
  constructor(private readonly db: Database) {}

  private async assertDocumentOrgAccess(
    documentId: number,
    organizationId: number
  ): Promise<void> {
    const document = await this.db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      columns: {
        id: true,
      },
      with: {
        case: {
          columns: {
            organizationId: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundError("Document");
    }

    if (document.case.organizationId !== organizationId) {
      throw new ForbiddenError("Access denied to this document");
    }
  }

  private ensureChunkPayload(
    chunks: DocumentChunkInput[]
  ): DocumentChunkInput[] {
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
        if (chunk.embedding.length !== DOCUMENT_CHUNK_EMBEDDING_DIMENSION) {
          throw new ValidationError(
            `Chunk embedding must have ${DOCUMENT_CHUNK_EMBEDDING_DIMENSION} dimensions`
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
    if (vectorValues.length !== DOCUMENT_CHUNK_EMBEDDING_DIMENSION) {
      throw new ValidationError(
        `Query embedding must have ${DOCUMENT_CHUNK_EMBEDDING_DIMENSION} dimensions`
      );
    }
    if (vectorValues.some((value) => !Number.isFinite(value))) {
      throw new ValidationError("Query embedding contains invalid values");
    }

    return `[${vectorValues.join(",")}]`;
  }

  private coerceMetadata(value: unknown): Record<string, unknown> {
    if (!value) {
      return {};
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }
    return value as Record<string, unknown>;
  }

  private mapChunkInsertRows(
    organizationId: number,
    documentId: number,
    chunks: DocumentChunkInput[]
  ): NewDocumentChunk[] {
    const now = new Date();
    return chunks.map((chunk) => ({
      organizationId,
      documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      contentLang: chunk.contentLang ?? null,
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

  async insertChunksForDocument(
    organizationId: number,
    documentId: number,
    chunks: DocumentChunkInput[]
  ) {
    await this.assertDocumentOrgAccess(documentId, organizationId);
    const normalizedChunks = this.ensureChunkPayload(chunks);

    if (normalizedChunks.length === 0) {
      return [] as Array<typeof documentChunks.$inferSelect>;
    }

    try {
      return await this.db
        .insert(documentChunks)
        .values(
          this.mapChunkInsertRows(organizationId, documentId, normalizedChunks)
        )
        .returning();
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictError(
          "Chunk index already exists for this document"
        );
      }
      throw error;
    }
  }

  async deleteChunksForDocument(organizationId: number, documentId: number) {
    await this.assertDocumentOrgAccess(documentId, organizationId);

    const deleted = await this.db
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.organizationId, organizationId),
          eq(documentChunks.documentId, documentId)
        )
      )
      .returning({ id: documentChunks.id });

    return deleted.length;
  }

  async reindexChunksForDocument(
    organizationId: number,
    documentId: number,
    chunks: DocumentChunkInput[]
  ) {
    await this.assertDocumentOrgAccess(documentId, organizationId);
    const normalizedChunks = this.ensureChunkPayload(chunks);

    try {
      return await this.db.transaction(async (tx) => {
        await tx
          .delete(documentChunks)
          .where(
            and(
              eq(documentChunks.organizationId, organizationId),
              eq(documentChunks.documentId, documentId)
            )
          );

        if (normalizedChunks.length === 0) {
          return [] as Array<typeof documentChunks.$inferSelect>;
        }

        return tx
          .insert(documentChunks)
          .values(
            this.mapChunkInsertRows(organizationId, documentId, normalizedChunks)
          )
          .returning();
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictError(
          "Chunk index already exists for this document"
        );
      }
      throw error;
    }
  }

  async retrieveTopKChunksBySimilarity(
    input: RetrieveDocumentChunksInput
  ): Promise<RetrievedDocumentChunk[]> {
    const topK = Math.max(1, Math.min(100, Math.floor(input.topK ?? 5)));
    const hasDocumentScope = typeof input.documentId === "number";

    if (hasDocumentScope) {
      await this.assertDocumentOrgAccess(input.documentId, input.organizationId);
    }

    const queryVector = this.toVectorLiteral(input.embedding);
    const rows = hasDocumentScope
      ? ((await this.db.execute(sql`
          select
            "id",
            "organization_id",
            "document_id",
            "chunk_index",
            "content",
            "content_lang",
            "token_count",
            "metadata",
            1 - ("embedding" <=> ${queryVector}::vector) as "similarity"
          from "document_chunks"
          where "organization_id" = ${input.organizationId}
            and "document_id" = ${input.documentId}
            and "embedding" is not null
          order by "embedding" <=> ${queryVector}::vector
          limit ${topK}
        `)) as RetrievedDocumentChunkRow[])
      : ((await this.db.execute(sql`
          select
            "id",
            "organization_id",
            "document_id",
            "chunk_index",
            "content",
            "content_lang",
            "token_count",
            "metadata",
            1 - ("embedding" <=> ${queryVector}::vector) as "similarity"
          from "document_chunks"
          where "organization_id" = ${input.organizationId}
            and "embedding" is not null
          order by "embedding" <=> ${queryVector}::vector
          limit ${topK}
        `)) as RetrievedDocumentChunkRow[]);

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      contentLang: row.content_lang,
      tokenCount: row.token_count,
      metadata: this.coerceMetadata(row.metadata),
      similarity: Number(row.similarity || 0),
    }));
  }
}
