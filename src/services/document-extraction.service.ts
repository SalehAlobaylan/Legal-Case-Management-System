import { createHash } from "crypto";
import * as fs from "fs";
import { promises as fsPromises } from "fs";
import * as path from "path";
import { and, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "../db/connection";
import { env } from "../config/env";
import { AIClientService, type SimilarityCaseFragment } from "./ai-client.service";
import {
  DocumentRagService,
  type DocumentInsightCitation,
  type DocumentInsightRetrievalMeta,
} from "./document-rag.service";
import {
  cases,
  documentExtractions,
  documents,
  type DocumentExtraction,
} from "../db/schema";
import { logger } from "../utils/logger";
import { ForbiddenError, NotFoundError } from "../utils/errors";

export type DocumentExtractionStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "unsupported";

export type DocumentInsightsStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "unsupported";

export interface DocumentInsightHighlight {
  snippet: string;
  score: number;
  sentenceStart: number;
  sentenceEnd: number;
}

export interface DocumentInsightState {
  status: DocumentInsightsStatus;
  summary: string | null;
  highlights: DocumentInsightHighlight[];
  citations?: DocumentInsightCitation[];
  retrievalMeta?: DocumentInsightRetrievalMeta | null;
  method: string | null;
  errorCode: string | null;
  warnings: string[];
  updatedAt: Date | null;
}

export interface CaseDocumentGenerationMeta {
  docsConsidered: number;
  docsQueued: number;
  docsReady: number;
  docsPending: number;
  docsFailed: number;
  docsUnsupported: number;
}

export interface CaseDocumentPreparation {
  fragments: SimilarityCaseFragment[];
  meta: CaseDocumentGenerationMeta;
}

interface CaseDocumentRecord {
  id: number;
  fileName: string;
  originalName: string;
  filePath: string;
  mimeType: string | null;
  caseId: number;
}

interface CaseContextRecord {
  id: number;
  organizationId: number;
  title: string;
  description: string | null;
}

export class DocumentExtractionService {
  private aiClient?: AIClientService;
  private ragService?: DocumentRagService;

  constructor(private readonly db: Database) {}

  private getAIClient(): AIClientService {
    if (!this.aiClient) {
      this.aiClient = new AIClientService();
    }
    return this.aiClient;
  }

  private getRAGService(): DocumentRagService {
    if (!this.ragService) {
      this.ragService = new DocumentRagService(
        this.db,
        this.getAIClient()
      );
    }
    return this.ragService;
  }

  private hashBuffer(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  private resolveDocumentPath(filePath: string): string | null {
    if (!filePath) {
      return null;
    }

    if (path.isAbsolute(filePath)) {
      return fs.existsSync(filePath) ? filePath : null;
    }

    const candidates = [
      path.resolve(process.cwd(), filePath),
      path.resolve(__dirname, "..", "..", filePath),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private getRetryAt(base: Date): Date {
    return new Date(
      base.getTime() + env.CASE_DOC_EXTRACTION_RETRY_MINUTES * 60 * 1000
    );
  }

  private getInsightsRetryAt(base: Date): Date {
    return new Date(
      base.getTime() + env.CASE_DOC_INSIGHTS_RETRY_MINUTES * 60 * 1000
    );
  }

  private hashText(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private parseWarnings(warningsJson?: string | null): string[] {
    if (!warningsJson) {
      return [];
    }
    try {
      const value = JSON.parse(warningsJson);
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  private parseHighlights(
    highlightsJson?: string | null
  ): DocumentInsightHighlight[] {
    if (!highlightsJson) {
      return [];
    }
    try {
      const parsed = JSON.parse(highlightsJson);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const snippet =
            typeof (item as Record<string, unknown>).snippet === "string"
              ? ((item as Record<string, unknown>).snippet as string)
              : "";
          if (!snippet) {
            return null;
          }
          const score = Number(
            (item as Record<string, unknown>).score ?? 0
          );
          const sentenceStart = Number(
            (item as Record<string, unknown>).sentenceStart ??
              (item as Record<string, unknown>).sentence_start ??
              0
          );
          const sentenceEnd = Number(
            (item as Record<string, unknown>).sentenceEnd ??
              (item as Record<string, unknown>).sentence_end ??
              0
          );
          return {
            snippet,
            score: Number.isFinite(score) ? score : 0,
            sentenceStart: Number.isFinite(sentenceStart) ? sentenceStart : 0,
            sentenceEnd: Number.isFinite(sentenceEnd) ? sentenceEnd : 0,
          } satisfies DocumentInsightHighlight;
        })
        .filter((item): item is DocumentInsightHighlight => Boolean(item));
    } catch {
      return [];
    }
  }

  private parseCitations(
    citationsJson?: string | null
  ): DocumentInsightCitation[] {
    if (!citationsJson) {
      return [];
    }
    try {
      const parsed = JSON.parse(citationsJson);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const source = item as Record<string, unknown>;
          const chunkId = Number(
            source.chunkId ?? source.chunk_id ?? source.id ?? 0
          );
          const chunkIndex = Number(
            source.chunkIndex ?? source.chunk_index ?? -1
          );
          const similarity = Number(source.similarity ?? source.score ?? 0);
          const snippet =
            typeof source.snippet === "string"
              ? source.snippet
              : typeof source.content === "string"
                ? source.content
                : "";

          if (!snippet || !Number.isFinite(chunkIndex) || chunkIndex < 0) {
            return null;
          }

          const metadata =
            source.metadata && typeof source.metadata === "object"
              ? (source.metadata as Record<string, unknown>)
              : {};

          return {
            chunkId: Number.isFinite(chunkId) ? chunkId : 0,
            chunkIndex,
            similarity: Number.isFinite(similarity) ? similarity : 0,
            snippet,
            contentLang:
              typeof source.contentLang === "string"
                ? source.contentLang
                : typeof source.content_lang === "string"
                  ? source.content_lang
                  : null,
            tokenCount: Number.isFinite(Number(source.tokenCount))
              ? Number(source.tokenCount)
              : Number.isFinite(Number(source.token_count))
                ? Number(source.token_count)
                : null,
            metadata,
          } satisfies DocumentInsightCitation;
        })
        .filter((item): item is DocumentInsightCitation => Boolean(item));
    } catch {
      return [];
    }
  }

  private parseRetrievalMeta(
    retrievalMetaJson?: string | null
  ): DocumentInsightRetrievalMeta | null {
    if (!retrievalMetaJson) {
      return null;
    }
    try {
      const parsed = JSON.parse(retrievalMetaJson);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      const source = parsed as Record<string, unknown>;
      return {
        strategy:
          typeof source.strategy === "string"
            ? source.strategy
            : "pgvector_cosine_document_scope_v1",
        topKRequested: Number.isFinite(Number(source.topKRequested))
          ? Number(source.topKRequested)
          : 0,
        topKReturned: Number.isFinite(Number(source.topKReturned))
          ? Number(source.topKReturned)
          : 0,
        queryChars: Number.isFinite(Number(source.queryChars))
          ? Number(source.queryChars)
          : 0,
        contextChars: Number.isFinite(Number(source.contextChars))
          ? Number(source.contextChars)
          : 0,
        embeddingDimension: Number.isFinite(Number(source.embeddingDimension))
          ? Number(source.embeddingDimension)
          : null,
        warnings: Array.isArray(source.warnings)
          ? source.warnings.filter(
              (warning): warning is string => typeof warning === "string"
            )
          : [],
      };
    } catch {
      return null;
    }
  }

  private buildCaseContextText(caseRecord: CaseContextRecord): string {
    return `${caseRecord.title}\n\n${caseRecord.description || ""}`.trim();
  }

  private async getCaseOrThrow(caseId: number, orgId: number) {
    const case_ = await this.db.query.cases.findFirst({
      where: eq(cases.id, caseId),
      columns: {
        id: true,
        organizationId: true,
        title: true,
        description: true,
      },
    });

    if (!case_) {
      throw new NotFoundError("Case");
    }
    if (case_.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this case");
    }

    return case_;
  }

  private async getCaseDocuments(
    caseId: number,
    orgId: number
  ): Promise<CaseDocumentRecord[]> {
    await this.getCaseOrThrow(caseId, orgId);
    return this.db.query.documents.findMany({
      where: eq(documents.caseId, caseId),
      columns: {
        id: true,
        fileName: true,
        originalName: true,
        filePath: true,
        mimeType: true,
        caseId: true,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });
  }

  private async upsertQueuedExtraction(
    document: CaseDocumentRecord,
    orgId: number
  ): Promise<{ queued: boolean }> {
    let fileHash: string | null = null;
    const resolvedFilePath = this.resolveDocumentPath(document.filePath);
    if (resolvedFilePath) {
      const fileBuffer = await fsPromises.readFile(resolvedFilePath);
      fileHash = this.hashBuffer(fileBuffer);
    }

    const existing = await this.db.query.documentExtractions.findFirst({
      where: eq(documentExtractions.documentId, document.id),
      columns: {
        id: true,
        fileHash: true,
        status: true,
      },
    });

    if (
      existing &&
      existing.fileHash &&
      existing.fileHash === fileHash &&
      existing.status === "ready"
    ) {
      return { queued: false };
    }

    await this.db
      .insert(documentExtractions)
      .values({
        documentId: document.id,
        caseId: document.caseId,
        organizationId: orgId,
        fileHash,
        status: "pending",
        attemptCount: 0,
        extractedText: null,
        normalizedTextHash: null,
        extractionMethod: null,
        ocrProviderUsed: null,
        errorCode: null,
        warningsJson: null,
        lastAttemptAt: null,
        nextRetryAt: new Date(),
        insightsStatus: "pending",
        insightsSummary: null,
        insightsHighlightsJson: JSON.stringify([]),
        insightsCitationsJson: JSON.stringify([]),
        insightsRetrievalMetaJson: null,
        insightsCaseContextHash: null,
        insightsSourceTextHash: null,
        insightsMethod: null,
        insightsErrorCode: null,
        insightsWarningsJson: null,
        insightsAttemptCount: 0,
        insightsLastAttemptAt: null,
        insightsNextRetryAt: new Date(),
        insightsUpdatedAt: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [documentExtractions.documentId],
        set: {
          caseId: document.caseId,
          organizationId: orgId,
          fileHash,
          status: "pending",
          extractedText: null,
          normalizedTextHash: null,
          extractionMethod: null,
          ocrProviderUsed: null,
          errorCode: null,
          warningsJson: null,
          lastAttemptAt: null,
          nextRetryAt: new Date(),
          insightsStatus: "pending",
          insightsSummary: null,
          insightsHighlightsJson: JSON.stringify([]),
          insightsCitationsJson: JSON.stringify([]),
          insightsRetrievalMetaJson: null,
          insightsCaseContextHash: null,
          insightsSourceTextHash: null,
          insightsMethod: null,
          insightsErrorCode: null,
          insightsWarningsJson: null,
          insightsAttemptCount: 0,
          insightsLastAttemptAt: null,
          insightsNextRetryAt: new Date(),
          insightsUpdatedAt: null,
          updatedAt: new Date(),
        },
      });

    return { queued: true };
  }

  async enqueueCaseDocuments(caseId: number, orgId: number): Promise<{
    documents: number;
    queued: number;
  }> {
    const caseDocs = await this.getCaseDocuments(caseId, orgId);
    let queued = 0;
    for (const document of caseDocs) {
      const result = await this.upsertQueuedExtraction(document, orgId);
      if (result.queued) {
        queued += 1;
      }
    }
    return {
      documents: caseDocs.length,
      queued,
    };
  }

  async enqueueSingleDocument(documentId: number, orgId: number): Promise<void> {
    const document = await this.db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      columns: {
        id: true,
        fileName: true,
        originalName: true,
        filePath: true,
        mimeType: true,
        caseId: true,
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
    if (document.case.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this document");
    }

    await this.upsertQueuedExtraction(
      {
        id: document.id,
        fileName: document.fileName,
        originalName: document.originalName,
        filePath: document.filePath,
        mimeType: document.mimeType,
        caseId: document.caseId,
      },
      orgId
    );
  }

  async getCaseExtractionMap(caseId: number, orgId: number) {
    const rows = await this.db.query.documentExtractions.findMany({
      where: and(
        eq(documentExtractions.caseId, caseId),
        eq(documentExtractions.organizationId, orgId)
      ),
      columns: {
        id: true,
        documentId: true,
        status: true,
        extractionMethod: true,
        errorCode: true,
        warningsJson: true,
        insightsStatus: true,
        insightsUpdatedAt: true,
        updatedAt: true,
      },
    });

    return new Map(
      rows.map((row) => [
        row.documentId,
        {
          id: row.id,
          status: row.status as DocumentExtractionStatus,
          extractionMethod: row.extractionMethod,
          errorCode: row.errorCode,
          warnings: this.parseWarnings(row.warningsJson),
          insightsStatus: row.insightsStatus as DocumentInsightsStatus,
          insightsUpdatedAt: row.insightsUpdatedAt,
          updatedAt: row.updatedAt,
        },
      ])
    );
  }

  async getExtractionStatusByDocumentId(documentId: number, orgId: number) {
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
    if (document.case.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this document");
    }

    const row = await this.db.query.documentExtractions.findFirst({
      where: eq(documentExtractions.documentId, documentId),
      columns: {
        id: true,
        status: true,
        extractionMethod: true,
        errorCode: true,
        warningsJson: true,
        updatedAt: true,
      },
    });

    if (!row) {
      return {
        status: "pending" as DocumentExtractionStatus,
        extractionMethod: null,
        errorCode: null,
        warnings: [],
        updatedAt: null,
      };
    }

    return {
      status: row.status as DocumentExtractionStatus,
      extractionMethod: row.extractionMethod,
      errorCode: row.errorCode,
      warnings: this.parseWarnings(row.warningsJson),
      updatedAt: row.updatedAt,
    };
  }

  async getDocumentInsightsByDocumentId(
    documentId: number,
    orgId: number
  ): Promise<DocumentInsightState> {
    await this.getExtractionStatusByDocumentId(documentId, orgId);

    const row = await this.db.query.documentExtractions.findFirst({
      where: eq(documentExtractions.documentId, documentId),
      columns: {
        insightsStatus: true,
        insightsSummary: true,
        insightsHighlightsJson: true,
        insightsCitationsJson: true,
        insightsRetrievalMetaJson: true,
        insightsMethod: true,
        insightsErrorCode: true,
        insightsWarningsJson: true,
        insightsUpdatedAt: true,
      },
    });

    if (!row) {
      return {
        status: "pending",
        summary: null,
        highlights: [],
        citations: [],
        retrievalMeta: null,
        method: null,
        errorCode: null,
        warnings: [],
        updatedAt: null,
      };
    }

    return {
      status: row.insightsStatus as DocumentInsightsStatus,
      summary: row.insightsSummary,
      highlights: this.parseHighlights(row.insightsHighlightsJson),
      citations: this.parseCitations(row.insightsCitationsJson),
      retrievalMeta: this.parseRetrievalMeta(row.insightsRetrievalMetaJson),
      method: row.insightsMethod,
      errorCode: row.insightsErrorCode,
      warnings: this.parseWarnings(row.insightsWarningsJson),
      updatedAt: row.insightsUpdatedAt,
    };
  }

  async enqueueDocumentInsights(documentId: number, orgId: number): Promise<void> {
    const document = await this.db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      columns: {
        id: true,
        fileName: true,
        originalName: true,
        filePath: true,
        mimeType: true,
        caseId: true,
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
    if (document.case.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this document");
    }

    await this.upsertQueuedExtraction(
      {
        id: document.id,
        fileName: document.fileName,
        originalName: document.originalName,
        filePath: document.filePath,
        mimeType: document.mimeType,
        caseId: document.caseId,
      },
      orgId
    );

    const extractionState = await this.getExtractionStatusByDocumentId(
      documentId,
      orgId
    );
    if (extractionState.status !== "ready") {
      return;
    }

    await this.db
      .update(documentExtractions)
      .set({
        insightsStatus: "pending",
        insightsSummary: null,
        insightsHighlightsJson: JSON.stringify([]),
        insightsCitationsJson: JSON.stringify([]),
        insightsRetrievalMetaJson: null,
        insightsMethod: null,
        insightsErrorCode: null,
        insightsWarningsJson: null,
        insightsCaseContextHash: null,
        insightsSourceTextHash: null,
        insightsAttemptCount: 0,
        insightsLastAttemptAt: null,
        insightsNextRetryAt: new Date(),
        insightsUpdatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(documentExtractions.documentId, documentId));
  }

  async markCaseInsightsStale(caseId: number, orgId: number): Promise<void> {
    await this.getCaseOrThrow(caseId, orgId);
    await this.db
      .update(documentExtractions)
      .set({
        insightsStatus: "pending",
        insightsErrorCode: null,
        insightsWarningsJson: null,
        insightsNextRetryAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentExtractions.caseId, caseId),
          eq(documentExtractions.organizationId, orgId),
          eq(documentExtractions.status, "ready")
        )
      );
  }

  async getInsightsQueueHealth(orgId: number) {
    const rows = await this.db.query.documentExtractions.findMany({
      where: eq(documentExtractions.organizationId, orgId),
      columns: {
        insightsStatus: true,
      },
    });

    const totals: Record<DocumentInsightsStatus, number> = {
      pending: 0,
      processing: 0,
      ready: 0,
      failed: 0,
      unsupported: 0,
    };
    for (const row of rows) {
      const status = row.insightsStatus as DocumentInsightsStatus;
      if (status in totals) {
        totals[status] += 1;
      }
    }

    return {
      total: rows.length,
      ...totals,
    };
  }

  async prepareCaseFragments(
    caseId: number,
    orgId: number
  ): Promise<CaseDocumentPreparation> {
    const queueResult = await this.enqueueCaseDocuments(caseId, orgId);
    const caseDocs = await this.getCaseDocuments(caseId, orgId);

    let ready = 0;
    let pending = 0;
    let failed = 0;
    let unsupported = 0;

    const readyRows: Array<{
      document: CaseDocumentRecord;
      extraction: DocumentExtraction;
    }> = [];

    const documentIds = caseDocs.map((doc) => doc.id);
    const extractionRows =
      documentIds.length > 0
        ? await this.db.query.documentExtractions.findMany({
            where: inArray(documentExtractions.documentId, documentIds),
          })
        : [];
    const extractionByDocId = new Map(
      extractionRows.map((row) => [row.documentId, row])
    );

    for (const doc of caseDocs) {
      const extraction = extractionByDocId.get(doc.id);
      if (!extraction) {
        pending += 1;
        continue;
      }
      switch (extraction.status) {
        case "ready":
          ready += 1;
          readyRows.push({
            document: doc,
            extraction,
          });
          break;
        case "unsupported":
          unsupported += 1;
          break;
        case "failed":
          failed += 1;
          break;
        default:
          pending += 1;
      }
    }

    const maxIncluded = Math.max(0, env.CASE_LINK_DOC_MAX_INCLUDED);
    const maxCharsPerDoc = Math.max(200, env.CASE_LINK_DOC_MAX_CHARS_PER_DOC);
    const maxCharsTotal = Math.max(maxCharsPerDoc, env.CASE_LINK_DOC_TOTAL_MAX_CHARS);
    let consumedChars = 0;
    const fragments: SimilarityCaseFragment[] = [];

    for (const row of readyRows) {
      if (fragments.length >= maxIncluded || consumedChars >= maxCharsTotal) {
        break;
      }

      const text = (row.extraction.extractedText || "").trim();
      if (!text) {
        continue;
      }

      const perDocSlice = text.slice(0, maxCharsPerDoc);
      const remaining = maxCharsTotal - consumedChars;
      if (remaining <= 0) {
        break;
      }
      const finalText = perDocSlice.slice(0, remaining).trim();
      if (!finalText) {
        continue;
      }

      fragments.push({
        fragment_id: `doc:${row.document.id}`,
        text: finalText,
        source: "document",
        document_id: row.document.id,
        document_name: row.document.originalName || row.document.fileName,
      });
      consumedChars += finalText.length;
    }

    return {
      fragments,
      meta: {
        docsConsidered: queueResult.documents,
        docsQueued: queueResult.queued,
        docsReady: ready,
        docsPending: pending,
        docsFailed: failed,
        docsUnsupported: unsupported,
      },
    };
  }

  private async processSingleExtraction(row: DocumentExtraction, now: Date) {
    const document = await this.db.query.documents.findFirst({
      where: eq(documents.id, row.documentId),
      columns: {
        id: true,
        fileName: true,
        originalName: true,
        filePath: true,
        mimeType: true,
      },
    });

    const resolvedFilePath = document
      ? this.resolveDocumentPath(document.filePath)
      : null;

    if (!document || !resolvedFilePath) {
      await this.db
        .update(documentExtractions)
        .set({
          status: "failed",
          errorCode: "file_missing",
          warningsJson: JSON.stringify(["Document file is missing on disk."]),
          insightsStatus: "failed",
          insightsErrorCode: "file_missing",
          insightsWarningsJson: JSON.stringify(["Document file is missing on disk."]),
          insightsCitationsJson: JSON.stringify([]),
          insightsRetrievalMetaJson: null,
          insightsNextRetryAt: this.getInsightsRetryAt(now),
          insightsUpdatedAt: now,
          lastAttemptAt: now,
          attemptCount: (row.attemptCount || 0) + 1,
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(documentExtractions.id, row.id));
      return "failed" as const;
    }

    await this.db
      .update(documentExtractions)
      .set({
        status: "processing",
        lastAttemptAt: now,
        attemptCount: (row.attemptCount || 0) + 1,
        updatedAt: now,
      })
      .where(eq(documentExtractions.id, row.id));

    try {
      const content = await fsPromises.readFile(resolvedFilePath);
      const fileHash = this.hashBuffer(content);
      const extraction = await this.getAIClient().extractDocumentContent({
        content,
        fileName: document.originalName || document.fileName,
        contentType: document.mimeType,
        maxChars: env.CASE_LINK_DOC_MAX_CHARS_PER_DOC,
      });

      if (extraction.status === "ok") {
        const extractionWarnings = extraction.warnings || [];
        const extractedText = (extraction.extracted_text || "").trim();
        const ragWarnings: string[] = [];

        try {
          const chunkReindex = await this.getRAGService().reindexDocumentChunks({
            organizationId: row.organizationId,
            documentId: row.documentId,
            sourceText: extractedText,
          });
          ragWarnings.push(...chunkReindex.warnings);
        } catch (error) {
          logger.error(
            {
              err: error,
              extractionId: row.id,
              documentId: row.documentId,
            },
            "Document chunk indexing failed during extraction"
          );
          ragWarnings.push("document_chunk_indexing_failed");
        }

        await this.db
          .update(documentExtractions)
          .set({
            status: "ready",
            fileHash,
            extractedText: extractedText || null,
            normalizedTextHash: extraction.normalized_text_hash || null,
            extractionMethod: extraction.extraction_method,
            ocrProviderUsed: extraction.ocr_provider_used || null,
            errorCode: extraction.error_code || null,
            warningsJson: JSON.stringify([...extractionWarnings, ...ragWarnings]),
            insightsStatus: "pending",
            insightsSummary: null,
            insightsHighlightsJson: JSON.stringify([]),
            insightsCitationsJson: JSON.stringify([]),
            insightsRetrievalMetaJson: null,
            insightsCaseContextHash: null,
            insightsSourceTextHash: null,
            insightsMethod: null,
            insightsErrorCode: null,
            insightsWarningsJson: null,
            insightsAttemptCount: 0,
            insightsLastAttemptAt: null,
            insightsNextRetryAt: now,
            insightsUpdatedAt: now,
            nextRetryAt: now,
            updatedAt: now,
          })
          .where(eq(documentExtractions.id, row.id));
        return "ready" as const;
      }

      const unsupported = extraction.error_code === "unsupported_file_type";
      await this.db
        .update(documentExtractions)
        .set({
          status: unsupported ? "unsupported" : "failed",
          fileHash,
          extractedText: null,
          normalizedTextHash: null,
          extractionMethod: extraction.extraction_method,
          ocrProviderUsed: extraction.ocr_provider_used || null,
          errorCode: extraction.error_code || "extraction_error",
          warningsJson: JSON.stringify(extraction.warnings || []),
          insightsStatus: unsupported ? "unsupported" : "failed",
          insightsSummary: null,
          insightsHighlightsJson: JSON.stringify([]),
          insightsCitationsJson: JSON.stringify([]),
          insightsRetrievalMetaJson: null,
          insightsCaseContextHash: null,
          insightsSourceTextHash: null,
          insightsMethod: extraction.extraction_method || null,
          insightsErrorCode: extraction.error_code || "extraction_error",
          insightsWarningsJson: JSON.stringify(extraction.warnings || []),
          insightsNextRetryAt: unsupported
            ? now
            : this.getInsightsRetryAt(now),
          insightsUpdatedAt: now,
          nextRetryAt: unsupported ? now : this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(documentExtractions.id, row.id));
      return unsupported ? ("unsupported" as const) : ("failed" as const);
    } catch (error) {
      logger.error(
        {
          err: error,
          extractionId: row.id,
          documentId: row.documentId,
        },
        "Document extraction processing failed"
      );
      await this.db
        .update(documentExtractions)
        .set({
          status: "failed",
          errorCode: "service_error",
          warningsJson: JSON.stringify([
            error instanceof Error ? error.message : "Unknown extraction error",
          ]),
          insightsStatus: "failed",
          insightsErrorCode: "service_error",
          insightsWarningsJson: JSON.stringify([
            error instanceof Error ? error.message : "Unknown extraction error",
          ]),
          insightsCitationsJson: JSON.stringify([]),
          insightsRetrievalMetaJson: null,
          insightsNextRetryAt: this.getInsightsRetryAt(now),
          insightsUpdatedAt: now,
          nextRetryAt: this.getRetryAt(now),
          updatedAt: now,
        })
        .where(eq(documentExtractions.id, row.id));
      return "failed" as const;
    }
  }

  async runPendingExtractions() {
    if (!env.CASE_DOC_EXTRACTION_ENABLED) {
      return {
        processed: 0,
        ready: 0,
        failed: 0,
        unsupported: 0,
      };
    }

    const now = new Date();
    const rows = await this.db.query.documentExtractions.findMany({
      where: and(
        inArray(documentExtractions.status, ["pending", "failed", "processing"]),
        lte(documentExtractions.nextRetryAt, now)
      ),
      orderBy: (table, { asc }) => [asc(table.nextRetryAt)],
      limit: env.CASE_DOC_EXTRACTION_BATCH_SIZE,
    });

    if (rows.length === 0) {
      return {
        processed: 0,
        ready: 0,
        failed: 0,
        unsupported: 0,
      };
    }

    let ready = 0;
    let failed = 0;
    let unsupported = 0;

    const concurrency = Math.max(1, env.CASE_DOC_EXTRACTION_MAX_CONCURRENCY);
    for (let i = 0; i < rows.length; i += concurrency) {
      const batch = rows.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((row) => this.processSingleExtraction(row, now))
      );
      for (const result of results) {
        if (result === "ready") {
          ready += 1;
        } else if (result === "unsupported") {
          unsupported += 1;
        } else {
          failed += 1;
        }
      }
    }

    return {
      processed: rows.length,
      ready,
      failed,
      unsupported,
    };
  }

  private async processSingleInsights(row: DocumentExtraction, now: Date) {
    const caseRecord = await this.db.query.cases.findFirst({
      where: eq(cases.id, row.caseId),
      columns: {
        id: true,
        organizationId: true,
        title: true,
        description: true,
      },
    });

    if (!caseRecord) {
      await this.db
        .update(documentExtractions)
        .set({
          insightsStatus: "failed",
          insightsErrorCode: "case_missing",
          insightsWarningsJson: JSON.stringify(["Case record is missing."]),
          insightsCitationsJson: JSON.stringify([]),
          insightsRetrievalMetaJson: null,
          insightsNextRetryAt: this.getInsightsRetryAt(now),
          insightsUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(documentExtractions.id, row.id));
      return "failed" as const;
    }

    const sourceText = (row.extractedText || "").trim();
    if (!sourceText) {
      await this.db
        .update(documentExtractions)
        .set({
          insightsStatus: "failed",
          insightsErrorCode: "extracted_text_missing",
          insightsWarningsJson: JSON.stringify([
            "Document extraction text is missing.",
          ]),
          insightsCitationsJson: JSON.stringify([]),
          insightsRetrievalMetaJson: null,
          insightsNextRetryAt: this.getInsightsRetryAt(now),
          insightsUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(documentExtractions.id, row.id));
      return "failed" as const;
    }

    const caseText = this.buildCaseContextText(caseRecord);
    const caseContextHash = this.hashText(caseText);
    const sourceTextHash =
      row.normalizedTextHash || this.hashText(sourceText.toLowerCase());
    const fallbackSourceText = sourceText.slice(
      0,
      env.CASE_DOC_INSIGHTS_MAX_SOURCE_CHARS
    );
    let ragSourceText = fallbackSourceText;
    let citations: DocumentInsightCitation[] = [];
    let retrievalMeta: DocumentInsightRetrievalMeta | null = null;

    await this.db
      .update(documentExtractions)
      .set({
        insightsStatus: "processing",
        insightsLastAttemptAt: now,
        insightsAttemptCount: (row.insightsAttemptCount || 0) + 1,
        insightsCitationsJson: JSON.stringify([]),
        insightsRetrievalMetaJson: null,
        insightsUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(documentExtractions.id, row.id));

    try {
      try {
        const retrieval = await this.getRAGService().retrieveRelevantChunks({
          organizationId: row.organizationId,
          documentId: row.documentId,
          queryText: caseText,
          topK: env.CASE_DOC_INSIGHTS_TOP_K,
        });
        citations = retrieval.citations;
        retrievalMeta = retrieval.retrievalMeta;
        if (retrieval.contextText.trim()) {
          ragSourceText = retrieval.contextText.slice(
            0,
            env.CASE_DOC_INSIGHTS_MAX_SOURCE_CHARS
          );
        }
      } catch (retrievalError) {
        logger.error(
          {
            err: retrievalError,
            extractionId: row.id,
            documentId: row.documentId,
          },
          "Document chunk retrieval failed for insights"
        );
        retrievalMeta = {
          strategy: "pgvector_cosine_document_scope_v1",
          topKRequested: env.CASE_DOC_INSIGHTS_TOP_K,
          topKReturned: 0,
          queryChars: caseText.length,
          contextChars: 0,
          embeddingDimension: null,
          warnings: [
            retrievalError instanceof Error
              ? retrievalError.message
              : "chunk_retrieval_failed",
          ],
        };
      }

      const insights = await this.getAIClient().generateDocumentCaseInsights({
        caseText,
        documentText: ragSourceText,
        topK: env.CASE_DOC_INSIGHTS_TOP_K,
      });

      const combinedWarnings = [
        ...(insights.warnings || []),
        ...((retrievalMeta?.warnings || []).filter(
          (warning) => warning !== "no_vector_chunks_returned"
        ) || []),
      ];

      if (insights.status === "ok") {
        await this.db
          .update(documentExtractions)
          .set({
            insightsStatus: "ready",
            insightsSummary: insights.summary || null,
            insightsHighlightsJson: JSON.stringify(insights.highlights || []),
            insightsCitationsJson: JSON.stringify(citations),
            insightsRetrievalMetaJson: retrievalMeta
              ? JSON.stringify(retrievalMeta)
              : null,
            insightsCaseContextHash: caseContextHash,
            insightsSourceTextHash: sourceTextHash,
            insightsMethod:
              citations.length > 0
                ? "embedding_extractive_rag_pgvector_v1"
                : insights.method || "embedding_extractive_v1",
            insightsErrorCode: null,
            insightsWarningsJson: JSON.stringify(combinedWarnings),
            insightsNextRetryAt: now,
            insightsUpdatedAt: now,
            updatedAt: now,
          })
          .where(eq(documentExtractions.id, row.id));
        return "ready" as const;
      }

      await this.db
        .update(documentExtractions)
        .set({
          insightsStatus: "failed",
          insightsSummary: null,
          insightsHighlightsJson: JSON.stringify([]),
          insightsCitationsJson: JSON.stringify(citations),
          insightsRetrievalMetaJson: retrievalMeta
            ? JSON.stringify(retrievalMeta)
            : null,
          insightsCaseContextHash: caseContextHash,
          insightsSourceTextHash: sourceTextHash,
          insightsMethod:
            citations.length > 0
              ? "embedding_extractive_rag_pgvector_v1"
              : insights.method || "embedding_extractive_v1",
          insightsErrorCode: insights.error_code || "insights_error",
          insightsWarningsJson: JSON.stringify(combinedWarnings),
          insightsNextRetryAt: this.getInsightsRetryAt(now),
          insightsUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(documentExtractions.id, row.id));
      return "failed" as const;
    } catch (error) {
      logger.error(
        {
          err: error,
          extractionId: row.id,
          documentId: row.documentId,
        },
        "Document insights processing failed"
      );
      await this.db
        .update(documentExtractions)
        .set({
          insightsStatus: "failed",
          insightsErrorCode: "insights_service_error",
          insightsWarningsJson: JSON.stringify([
            error instanceof Error ? error.message : "Unknown insights error",
            ...((retrievalMeta?.warnings || []) as string[]),
          ]),
          insightsCitationsJson: JSON.stringify(citations),
          insightsRetrievalMetaJson: retrievalMeta
            ? JSON.stringify(retrievalMeta)
            : null,
          insightsNextRetryAt: this.getInsightsRetryAt(now),
          insightsUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(documentExtractions.id, row.id));
      return "failed" as const;
    }
  }

  async generateDocumentInsightsNow(documentId: number, orgId: number) {
    await this.enqueueDocumentInsights(documentId, orgId);
    const row = await this.db.query.documentExtractions.findFirst({
      where: eq(documentExtractions.documentId, documentId),
    });
    if (!row) {
      return null;
    }
    if (row.status !== "ready") {
      return null;
    }

    await this.processSingleInsights(row, new Date());
    return this.getDocumentInsightsByDocumentId(documentId, orgId);
  }

  async runPendingInsights() {
    if (!env.CASE_DOC_INSIGHTS_ENABLED) {
      return {
        processed: 0,
        ready: 0,
        failed: 0,
        unsupported: 0,
      };
    }

    const now = new Date();
    const rows = await this.db.query.documentExtractions.findMany({
      where: and(
        eq(documentExtractions.status, "ready"),
        inArray(documentExtractions.insightsStatus, [
          "pending",
          "failed",
          "processing",
        ]),
        lte(documentExtractions.insightsNextRetryAt, now)
      ),
      orderBy: (table, { asc }) => [asc(table.insightsNextRetryAt)],
      limit: env.CASE_DOC_INSIGHTS_BATCH_SIZE,
    });

    if (rows.length === 0) {
      return {
        processed: 0,
        ready: 0,
        failed: 0,
        unsupported: 0,
      };
    }

    let ready = 0;
    let failed = 0;

    const concurrency = Math.max(1, env.CASE_DOC_INSIGHTS_MAX_CONCURRENCY);
    for (let i = 0; i < rows.length; i += concurrency) {
      const batch = rows.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((row) => this.processSingleInsights(row, now))
      );
      for (const result of results) {
        if (result === "ready") {
          ready += 1;
        } else {
          failed += 1;
        }
      }
    }

    return {
      processed: rows.length,
      ready,
      failed,
      unsupported: 0,
    };
  }
}
