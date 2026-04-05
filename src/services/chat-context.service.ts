/**
 * Chat Context Service
 *
 * Assembles RAG context (regulation chunks + document chunks + case metadata)
 * for the chat endpoint. Reuses existing RegulationRagService and
 * DocumentRagService for retrieval.
 */

import { eq, and } from "drizzle-orm";
import type { Database } from "../db/connection";
import { cases, documents, regulations } from "../db/schema";
import { AIClientService } from "./ai-client.service";
import {
  RegulationRagService,
  type RegulationCandidateChunk,
} from "./regulation-rag.service";
import {
  DocumentRagService,
} from "./document-rag.service";
import { logger } from "../utils/logger";

/** Regulation chunk formatted for the AI microservice chat endpoint. */
export interface ChatRegulationChunk {
  chunk_id: number;
  regulation_id: number;
  regulation_title: string;
  article_ref: string | null;
  content: string;
  similarity_score: number | null;
}

/** Document chunk formatted for the AI microservice chat endpoint. */
export interface ChatDocumentChunk {
  chunk_id: number;
  document_id: number;
  document_name: string;
  content: string;
}

/** Case context formatted for the AI microservice chat endpoint. */
export interface ChatCaseContext {
  case_id: number;
  title: string;
  case_type: string | null;
  description: string | null;
}

/** Summary of a case belonging to the user's organization. */
export interface OrgCaseSummary {
  case_id: number;
  case_number: string;
  title: string;
  case_type: string;
  status: string;
  client_info: string | null;
  filing_date: string | null;
  next_hearing: string | null;
}

export interface ChatContextResult {
  regulationChunks: ChatRegulationChunk[];
  documentChunks: ChatDocumentChunk[];
  caseContext: ChatCaseContext | null;
  /** Summary list of the organization's cases (for general questions). */
  orgCases: OrgCaseSummary[];
  /** True if regulation retrieval failed — LLM should note limited context */
  regulationRetrievalFailed?: boolean;
  /** True if document retrieval failed */
  documentRetrievalFailed?: boolean;
}

export class ChatContextService {
  private readonly regulationRag: RegulationRagService;
  private readonly documentRag: DocumentRagService;

  constructor(
    private readonly db: Database,
    aiClient?: AIClientService
  ) {
    const ai = aiClient || new AIClientService();
    this.regulationRag = new RegulationRagService(db, ai);
    this.documentRag = new DocumentRagService(db, ai);
  }

  /**
   * Assemble full chat context for a user message.
   *
   * 1. Retrieves top-K regulation chunks by semantic similarity
   * 2. If caseId is provided, retrieves case metadata + document chunks
   * 3. Returns structured context ready for the AI microservice
   */
  async assembleContext(input: {
    message: string;
    organizationId: number;
    caseId?: number | null;
    regulationTopK?: number;
    regulationPerRegLimit?: number;
    documentTopK?: number;
    maxDocuments?: number;
    /** Maximum number of org cases to include as context (default 50). */
    maxOrgCases?: number;
  }): Promise<ChatContextResult> {
    const regulationTopK = input.regulationTopK ?? 10;
    const regulationPerRegLimit = input.regulationPerRegLimit ?? 3;
    const documentTopK = input.documentTopK ?? 5;
    const maxDocuments = input.maxDocuments ?? 3;
    const maxOrgCases = input.maxOrgCases ?? 50;

    // Retrieve regulation chunks
    let regulationChunks: ChatRegulationChunk[] = [];
    let regulationRetrievalFailed = false;
    let documentRetrievalFailed = false;
    try {
      const regResult = await this.regulationRag.retrieveTopCandidateChunks({
        queryText: input.message,
        topK: regulationTopK,
        perRegulationLimit: regulationPerRegLimit,
      });

      // Flatten the map and join with regulation metadata
      const regIds = new Set<number>();
      const flatChunks: (RegulationCandidateChunk & { regulationId: number })[] = [];

      for (const [regId, chunks] of regResult.byRegulationId.entries()) {
        regIds.add(regId);
        for (const chunk of chunks) {
          flatChunks.push({ ...chunk, regulationId: regId });
        }
      }

      // Fetch regulation titles
      if (regIds.size > 0) {
        const regs = await this.db.query.regulations.findMany({
          where: (r, { inArray }) => inArray(r.id, [...regIds]),
          columns: { id: true, title: true },
        });
        const regTitles = new Map(regs.map((r) => [r.id, r.title]));

        regulationChunks = flatChunks.map((chunk) => ({
          chunk_id: chunk.chunkId,
          regulation_id: chunk.regulationId,
          regulation_title: regTitles.get(chunk.regulationId) || "",
          article_ref: chunk.articleRef,
          content: chunk.text,
          similarity_score: chunk.score ?? null,
        }));
      }
    } catch (err) {
      logger.warn({ err }, "Failed to retrieve regulation chunks for chat");
      regulationRetrievalFailed = true;
    }

    // Retrieve case context + document chunks
    let caseContext: ChatCaseContext | null = null;
    let documentChunks: ChatDocumentChunk[] = [];

    if (input.caseId) {
      try {
        // Fetch case metadata
        const caseData = await this.db.query.cases.findFirst({
          where: and(
            eq(cases.id, input.caseId),
            eq(cases.organizationId, input.organizationId)
          ),
        });

        if (caseData) {
          caseContext = {
            case_id: caseData.id,
            title: caseData.title,
            case_type: caseData.caseType ?? null,
            description: caseData.description ?? null,
          };

          // Fetch document IDs for this case
          const docs = await this.db.query.documents.findMany({
            where: eq(documents.caseId, input.caseId),
            columns: { id: true, originalName: true },
          });

          // Retrieve chunks from each document (limited)
          for (const doc of docs.slice(0, maxDocuments)) {
            try {
              const docResult = await this.documentRag.retrieveRelevantChunks({
                organizationId: input.organizationId,
                documentId: doc.id,
                queryText: input.message,
                topK: documentTopK,
              });

              for (const citation of docResult.citations) {
                documentChunks.push({
                  chunk_id: citation.chunkId,
                  document_id: doc.id,
                  document_name: doc.originalName,
                  content: citation.snippet,
                });
              }
            } catch (err) {
              logger.warn(
                { err, documentId: doc.id },
                "Failed to retrieve document chunks for chat"
              );
              documentRetrievalFailed = true;
            }
          }
        }
      } catch (err) {
        logger.warn({ err, caseId: input.caseId }, "Failed to fetch case context for chat");
      }
    }

    // Retrieve organization-level case summaries so the assistant can answer
    // general questions like "how many commercial cases do I have?"
    // This is org-scoped — only cases belonging to this organization are returned.
    let orgCases: OrgCaseSummary[] = [];
    try {
      const orgCaseRows = await this.db.query.cases.findMany({
        where: eq(cases.organizationId, input.organizationId),
        columns: {
          id: true,
          caseNumber: true,
          title: true,
          caseType: true,
          status: true,
          clientInfo: true,
          filingDate: true,
          nextHearing: true,
        },
        limit: maxOrgCases,
        orderBy: (c, { desc }) => [desc(c.updatedAt)],
      });

      orgCases = orgCaseRows.map((c) => ({
        case_id: c.id,
        case_number: c.caseNumber,
        title: c.title,
        case_type: c.caseType,
        status: c.status,
        client_info: c.clientInfo ?? null,
        filing_date: c.filingDate ?? null,
        next_hearing: c.nextHearing ? new Date(c.nextHearing).toISOString() : null,
      }));
    } catch (err) {
      logger.warn({ err }, "Failed to retrieve org cases for chat context");
    }

    return { regulationChunks, documentChunks, caseContext, orgCases, regulationRetrievalFailed, documentRetrievalFailed };
  }
}
