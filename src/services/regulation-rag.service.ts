import { env } from "../config/env";
import { logger } from "../utils/logger";
import { REGULATION_CHUNK_EMBEDDING_DIMENSION } from "../db/schema";
import { AIClientService, type EmbeddingResponse } from "./ai-client.service";
import {
  RegulationChunkService,
  type RegulationChunkInput,
  type RetrievedRegulationChunk,
} from "./regulation-chunk.service";
import type { Database } from "../db/connection";

export interface RegulationCandidateChunk {
  chunkId: number;
  chunkIndex: number;
  text: string;
  lineStart: number | null;
  lineEnd: number | null;
  articleRef: string | null;
  score?: number;
}

export interface RegulationChunkReindexResult {
  chunksPersisted: number;
  embeddedChunks: number;
  embeddingDimension: number | null;
  warnings: string[];
}

export interface RegulationChunkRetrievalResult {
  byRegulationVersionId: Map<number, RegulationCandidateChunk[]>;
  byRegulationId: Map<number, RegulationCandidateChunk[]>;
  warnings: string[];
  topKRequested: number;
  topKReturned: number;
}

interface ReindexRegulationChunksInput {
  regulationId: number;
  regulationVersionId: number;
  sourceText: string;
}

interface RetrieveRegulationChunkContextInput {
  queryText: string;
  topK: number;
  perRegulationLimit: number;
}

export class RegulationRagService {
  private readonly chunkService: RegulationChunkService;
  private readonly aiClient: AIClientService;

  constructor(
    db: Database,
    aiClient?: AIClientService,
    chunkService?: RegulationChunkService
  ) {
    this.aiClient = aiClient || new AIClientService();
    this.chunkService = chunkService || new RegulationChunkService(db);
  }

  private estimateTokenCount(text: string): number {
    const normalized = text.trim();
    if (!normalized) {
      return 0;
    }
    return Math.max(1, Math.ceil(normalized.length / 4));
  }

  private inferArticleRef(text: string): string | null {
    const arMatch = text.match(/(المادة\s+[^\s:،.]{1,25})/i);
    if (arMatch?.[1]) {
      return arMatch[1].trim();
    }
    const enMatch = text.match(/(article\s+\d+[a-z0-9\-]*)/i);
    if (enMatch?.[1]) {
      return enMatch[1].trim();
    }
    return null;
  }

  private splitTextIntoChunkInputs(sourceText: string): RegulationChunkInput[] {
    const text = sourceText.replace(/\r\n/g, "\n").trim();
    if (!text) {
      return [];
    }

    const chunkChars = Math.max(200, env.REG_LINK_CHUNK_CHARS);
    const maxChunks = Math.max(1, env.REG_LINK_MAX_CHUNKS);
    const lines = text.split("\n");

    const chunks: RegulationChunkInput[] = [];
    let buffer: string[] = [];
    let chunkIndex = 0;
    let currentChars = 0;
    let chunkLineStart = 1;
    let currentLine = 1;

    const flush = () => {
      if (buffer.length === 0 || chunkIndex >= maxChunks) {
        return;
      }
      const content = buffer.join("\n").trim();
      if (!content) {
        return;
      }
      chunks.push({
        chunkIndex,
        content,
        lineStart: chunkLineStart,
        lineEnd: currentLine - 1,
        articleRef: this.inferArticleRef(content),
        tokenCount: this.estimateTokenCount(content),
        metadata: {
          source: "regulation_version_content",
        },
      });
      chunkIndex += 1;
      buffer = [];
      currentChars = 0;
      chunkLineStart = currentLine;
    };

    for (const line of lines) {
      const normalizedLine = line.trimEnd();
      const nextLength = currentChars + normalizedLine.length + 1;
      if (nextLength > chunkChars && buffer.length > 0) {
        flush();
      }

      if (chunkIndex >= maxChunks) {
        break;
      }
      buffer.push(normalizedLine);
      currentChars += normalizedLine.length + 1;
      currentLine += 1;
    }

    if (chunkIndex < maxChunks) {
      flush();
    }

    return chunks;
  }

  private sanitizeEmbedding(
    embedding: number[] | undefined,
    warnings: string[],
    label: string
  ): number[] | null {
    if (!embedding) {
      warnings.push(`${label}_missing_embedding`);
      return null;
    }
    if (embedding.length !== REGULATION_CHUNK_EMBEDDING_DIMENSION) {
      warnings.push(
        `${label}_dimension_mismatch:${embedding.length}!=${REGULATION_CHUNK_EMBEDDING_DIMENSION}`
      );
      return null;
    }
    if (embedding.some((value) => !Number.isFinite(value))) {
      warnings.push(`${label}_invalid_embedding_values`);
      return null;
    }
    return embedding;
  }

  private mapRetrievedChunk(
    row: RetrievedRegulationChunk,
    score?: number
  ): RegulationCandidateChunk {
    return {
      chunkId: row.id,
      chunkIndex: row.chunkIndex,
      text: row.content,
      lineStart: row.lineStart,
      lineEnd: row.lineEnd,
      articleRef: row.articleRef,
      score,
    };
  }

  async reindexRegulationVersionChunks(
    input: ReindexRegulationChunksInput
  ): Promise<RegulationChunkReindexResult> {
    const warnings: string[] = [];
    const chunkInputs = this.splitTextIntoChunkInputs(input.sourceText);

    if (chunkInputs.length === 0) {
      await this.chunkService.reindexChunksForVersion(
        input.regulationId,
        input.regulationVersionId,
        []
      );
      return {
        chunksPersisted: 0,
        embeddedChunks: 0,
        embeddingDimension: null,
        warnings: ["source_text_empty_or_not_chunkable"],
      };
    }

    let embeddingResponse: EmbeddingResponse | null = null;
    try {
      embeddingResponse = await this.aiClient.generateEmbeddings(
        chunkInputs.map((chunk) => chunk.content)
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          regulationId: input.regulationId,
          regulationVersionId: input.regulationVersionId,
        },
        "Regulation chunk embedding generation failed"
      );
      warnings.push("embedding_generation_failed");
      throw error;
    }

    const generatedEmbeddings = embeddingResponse?.embeddings || [];
    const detectedDimension =
      embeddingResponse?.dimension || generatedEmbeddings[0]?.length || null;
    if (
      generatedEmbeddings.length > 0 &&
      generatedEmbeddings.length !== chunkInputs.length
    ) {
      warnings.push(
        `embedding_count_mismatch:${generatedEmbeddings.length}!=${chunkInputs.length}`
      );
    }

    let embeddedChunks = 0;
    const indexedChunks: RegulationChunkInput[] = chunkInputs.map((chunk, index) => {
      const embedding = this.sanitizeEmbedding(
        generatedEmbeddings[index],
        warnings,
        `chunk_${index}`
      );
      if (embedding) {
        embeddedChunks += 1;
      }
      return {
        ...chunk,
        embedding,
      };
    });

    const persisted = await this.chunkService.reindexChunksForVersion(
      input.regulationId,
      input.regulationVersionId,
      indexedChunks
    );

    return {
      chunksPersisted: persisted.length,
      embeddedChunks,
      embeddingDimension: detectedDimension,
      warnings,
    };
  }

  async getCandidateChunksByVersionIds(
    versionIds: number[],
    perVersionLimit: number
  ): Promise<Map<number, RegulationCandidateChunk[]>> {
    const rowsByVersion = await this.chunkService.getChunksByVersionIds(
      versionIds,
      perVersionLimit
    );
    const mapped = new Map<number, RegulationCandidateChunk[]>();
    for (const [versionId, rows] of rowsByVersion.entries()) {
      mapped.set(
        versionId,
        rows.map((row) =>
          this.mapRetrievedChunk(
            {
              id: row.id,
              regulationId: row.regulationId,
              regulationVersionId: row.regulationVersionId,
              chunkIndex: row.chunkIndex,
              content: row.content,
              lineStart: row.lineStart,
              lineEnd: row.lineEnd,
              articleRef: row.articleRef,
              tokenCount: row.tokenCount,
              metadata: row.metadata,
              similarity: 0,
            },
            undefined
          )
        )
      );
    }
    return mapped;
  }

  async retrieveTopCandidateChunks(
    input: RetrieveRegulationChunkContextInput
  ): Promise<RegulationChunkRetrievalResult> {
    const topK = Math.max(1, Math.min(400, Math.floor(input.topK)));
    const perRegulationLimit = Math.max(1, Math.min(10, input.perRegulationLimit));
    const warnings: string[] = [];

    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await this.aiClient.generateEmbedding(input.queryText);
    } catch (error) {
      logger.error({ err: error }, "Regulation retrieval query embedding failed");
      return {
        byRegulationVersionId: new Map(),
        byRegulationId: new Map(),
        warnings: ["query_embedding_generation_failed"],
        topKRequested: topK,
        topKReturned: 0,
      };
    }

    const validEmbedding = this.sanitizeEmbedding(
      queryEmbedding,
      warnings,
      "query"
    );
    if (!validEmbedding) {
      return {
        byRegulationVersionId: new Map(),
        byRegulationId: new Map(),
        warnings,
        topKRequested: topK,
        topKReturned: 0,
      };
    }

    const rows = await this.chunkService.retrieveTopKChunksBySimilarity({
      embedding: validEmbedding,
      topK,
    });

    const byRegulationVersionId = new Map<number, RegulationCandidateChunk[]>();
    const byRegulationId = new Map<number, RegulationCandidateChunk[]>();
    for (const row of rows) {
      const versionItems = byRegulationVersionId.get(row.regulationVersionId) || [];
      if (versionItems.length < perRegulationLimit) {
        versionItems.push(this.mapRetrievedChunk(row, row.similarity));
      }
      byRegulationVersionId.set(row.regulationVersionId, versionItems);

      const regulationItems = byRegulationId.get(row.regulationId) || [];
      if (regulationItems.length < perRegulationLimit) {
        regulationItems.push(this.mapRetrievedChunk(row, row.similarity));
      }
      byRegulationId.set(row.regulationId, regulationItems);
    }

    return {
      byRegulationVersionId,
      byRegulationId,
      warnings,
      topKRequested: topK,
      topKReturned: rows.length,
    };
  }
}
