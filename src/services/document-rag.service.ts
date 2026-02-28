import { env } from "../config/env";
import type { Database } from "../db/connection";
import { DOCUMENT_CHUNK_EMBEDDING_DIMENSION } from "../db/schema";
import { logger } from "../utils/logger";
import {
  type DocumentChunkInput,
  DocumentChunkService,
  type RetrievedDocumentChunk,
} from "./document-chunk.service";
import { AIClientService, type EmbeddingResponse } from "./ai-client.service";

export interface DocumentInsightCitation {
  chunkId: number;
  chunkIndex: number;
  similarity: number;
  snippet: string;
  contentLang: string | null;
  tokenCount: number | null;
  metadata: Record<string, unknown>;
}

export interface DocumentInsightRetrievalMeta {
  strategy: string;
  topKRequested: number;
  topKReturned: number;
  queryChars: number;
  contextChars: number;
  embeddingDimension: number | null;
  warnings: string[];
}

export interface DocumentChunkReindexResult {
  chunksPersisted: number;
  embeddedChunks: number;
  embeddingDimension: number | null;
  warnings: string[];
}

export interface DocumentChunkRetrievalResult {
  contextText: string;
  citations: DocumentInsightCitation[];
  retrievalMeta: DocumentInsightRetrievalMeta;
}

interface ReindexDocumentChunksInput {
  organizationId: number;
  documentId: number;
  sourceText: string;
}

interface RetrieveDocumentChunkContextInput {
  organizationId: number;
  documentId: number;
  queryText: string;
  topK: number;
}

export class DocumentRagService {
  private readonly chunkService: DocumentChunkService;
  private readonly aiClient: AIClientService;

  constructor(
    db: Database,
    aiClient?: AIClientService,
    chunkService?: DocumentChunkService
  ) {
    this.aiClient = aiClient || new AIClientService();
    this.chunkService = chunkService || new DocumentChunkService(db);
  }

  private detectLanguage(text: string): string | null {
    if (/[\u0600-\u06ff]/.test(text)) {
      return "ar";
    }
    if (/[a-z]/i.test(text)) {
      return "en";
    }
    return null;
  }

  private estimateTokenCount(text: string): number {
    const normalized = text.trim();
    if (!normalized) {
      return 0;
    }
    return Math.max(1, Math.ceil(normalized.length / 4));
  }

  private splitTextIntoChunkInputs(sourceText: string): DocumentChunkInput[] {
    const normalized = sourceText.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [];
    }

    const chunkChars = Math.max(200, env.CASE_DOC_RAG_CHUNK_CHARS);
    const overlapChars = Math.max(
      0,
      Math.min(env.CASE_DOC_RAG_CHUNK_OVERLAP_CHARS, Math.floor(chunkChars / 2))
    );
    const maxChunks = Math.max(1, env.CASE_DOC_RAG_MAX_CHUNKS);
    const minBoundary = Math.max(0, Math.floor(chunkChars * 0.6));

    const chunks: DocumentChunkInput[] = [];
    const textLength = normalized.length;
    let chunkIndex = 0;
    let start = 0;

    while (start < textLength && chunkIndex < maxChunks) {
      const targetEnd = Math.min(textLength, start + chunkChars);
      let end = targetEnd;

      if (targetEnd < textLength) {
        const boundary = normalized.lastIndexOf(" ", targetEnd);
        if (boundary > start + minBoundary) {
          end = boundary;
        }
      }

      const content = normalized.slice(start, end).trim();
      if (!content) {
        break;
      }

      chunks.push({
        chunkIndex,
        content,
        contentLang: this.detectLanguage(content),
        tokenCount: this.estimateTokenCount(content),
        metadata: {
          charStart: start,
          charEnd: start + content.length,
        },
      });

      if (end >= textLength) {
        break;
      }

      chunkIndex += 1;
      const nextStart = Math.max(start + 1, end - overlapChars);
      start = nextStart;
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
    if (embedding.length !== DOCUMENT_CHUNK_EMBEDDING_DIMENSION) {
      warnings.push(
        `${label}_dimension_mismatch:${embedding.length}!=${DOCUMENT_CHUNK_EMBEDDING_DIMENSION}`
      );
      return null;
    }
    if (embedding.some((value) => !Number.isFinite(value))) {
      warnings.push(`${label}_invalid_embedding_values`);
      return null;
    }
    return embedding;
  }

  async reindexDocumentChunks(
    input: ReindexDocumentChunksInput
  ): Promise<DocumentChunkReindexResult> {
    const warnings: string[] = [];
    const chunkInputs = this.splitTextIntoChunkInputs(input.sourceText);

    if (chunkInputs.length === 0) {
      await this.chunkService.reindexChunksForDocument(
        input.organizationId,
        input.documentId,
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
          documentId: input.documentId,
          organizationId: input.organizationId,
        },
        "Document chunk embedding generation failed"
      );
      warnings.push("embedding_generation_failed");
    }

    const generatedEmbeddings = embeddingResponse?.embeddings || [];
    const detectedDimension =
      embeddingResponse?.dimension ||
      generatedEmbeddings[0]?.length ||
      null;
    if (
      generatedEmbeddings.length > 0 &&
      generatedEmbeddings.length !== chunkInputs.length
    ) {
      warnings.push(
        `embedding_count_mismatch:${generatedEmbeddings.length}!=${chunkInputs.length}`
      );
    }

    let embeddedChunks = 0;
    const indexedChunks: DocumentChunkInput[] = chunkInputs.map((chunk, index) => {
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

    const persisted = await this.chunkService.reindexChunksForDocument(
      input.organizationId,
      input.documentId,
      indexedChunks
    );

    return {
      chunksPersisted: persisted.length,
      embeddedChunks,
      embeddingDimension: detectedDimension,
      warnings,
    };
  }

  private toCitation(row: RetrievedDocumentChunk): DocumentInsightCitation {
    return {
      chunkId: row.id,
      chunkIndex: row.chunkIndex,
      similarity: row.similarity,
      snippet: row.content,
      contentLang: row.contentLang,
      tokenCount: row.tokenCount,
      metadata: row.metadata || {},
    };
  }

  async retrieveRelevantChunks(
    input: RetrieveDocumentChunkContextInput
  ): Promise<DocumentChunkRetrievalResult> {
    const topK = Math.max(1, Math.min(100, Math.floor(input.topK)));
    const warnings: string[] = [];
    const baseMeta = {
      strategy: "pgvector_cosine_document_scope_v1",
      topKRequested: topK,
      queryChars: input.queryText.length,
    };

    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await this.aiClient.generateEmbedding(input.queryText);
    } catch (error) {
      logger.error(
        {
          err: error,
          documentId: input.documentId,
          organizationId: input.organizationId,
        },
        "RAG query embedding generation failed"
      );
      warnings.push("query_embedding_generation_failed");
      return {
        contextText: "",
        citations: [],
        retrievalMeta: {
          ...baseMeta,
          topKReturned: 0,
          contextChars: 0,
          embeddingDimension: null,
          warnings,
        },
      };
    }

    const validEmbedding = this.sanitizeEmbedding(
      queryEmbedding,
      warnings,
      "query"
    );

    if (!validEmbedding) {
      return {
        contextText: "",
        citations: [],
        retrievalMeta: {
          ...baseMeta,
          topKReturned: 0,
          contextChars: 0,
          embeddingDimension: queryEmbedding.length || null,
          warnings,
        },
      };
    }

    const rows = await this.chunkService.retrieveTopKChunksBySimilarity({
      organizationId: input.organizationId,
      documentId: input.documentId,
      embedding: validEmbedding,
      topK,
    });

    if (rows.length === 0) {
      warnings.push("no_vector_chunks_returned");
    }

    const contextText = [...rows]
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((chunk) => chunk.content)
      .join("\n\n")
      .trim();

    return {
      contextText,
      citations: rows.map((row) => this.toCitation(row)),
      retrievalMeta: {
        ...baseMeta,
        topKReturned: rows.length,
        contextChars: contextText.length,
        embeddingDimension: validEmbedding.length,
        warnings,
      },
    };
  }
}

