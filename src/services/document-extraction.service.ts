import { createHash } from "crypto";
import * as fs from "fs";
import { promises as fsPromises } from "fs";
import { and, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "../db/connection";
import { env } from "../config/env";
import { AIClientService, type SimilarityCaseFragment } from "./ai-client.service";
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

export class DocumentExtractionService {
  private aiClient?: AIClientService;

  constructor(private readonly db: Database) {}

  private getAIClient(): AIClientService {
    if (!this.aiClient) {
      this.aiClient = new AIClientService();
    }
    return this.aiClient;
  }

  private hashBuffer(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  private getRetryAt(base: Date): Date {
    return new Date(
      base.getTime() + env.CASE_DOC_EXTRACTION_RETRY_MINUTES * 60 * 1000
    );
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

  private async getCaseOrThrow(caseId: number, orgId: number) {
    const case_ = await this.db.query.cases.findFirst({
      where: eq(cases.id, caseId),
      columns: {
        id: true,
        organizationId: true,
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
    if (fs.existsSync(document.filePath)) {
      const fileBuffer = await fsPromises.readFile(document.filePath);
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

    if (existing && existing.fileHash && existing.fileHash === fileHash) {
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

    if (!document || !fs.existsSync(document.filePath)) {
      await this.db
        .update(documentExtractions)
        .set({
          status: "failed",
          errorCode: "file_missing",
          warningsJson: JSON.stringify(["Document file is missing on disk."]),
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
      const content = await fsPromises.readFile(document.filePath);
      const fileHash = this.hashBuffer(content);
      const extraction = await this.getAIClient().extractDocumentContent({
        content,
        fileName: document.originalName || document.fileName,
        contentType: document.mimeType,
        maxChars: env.CASE_LINK_DOC_MAX_CHARS_PER_DOC,
      });

      if (extraction.status === "ok") {
        await this.db
          .update(documentExtractions)
          .set({
            status: "ready",
            fileHash,
            extractedText: extraction.extracted_text || null,
            normalizedTextHash: extraction.normalized_text_hash || null,
            extractionMethod: extraction.extraction_method,
            ocrProviderUsed: extraction.ocr_provider_used || null,
            errorCode: extraction.error_code || null,
            warningsJson: JSON.stringify(extraction.warnings || []),
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
}
