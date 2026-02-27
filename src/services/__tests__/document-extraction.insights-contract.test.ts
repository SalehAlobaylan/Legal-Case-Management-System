import { describe, expect, it, jest } from "@jest/globals";
import { DocumentExtractionService } from "../document-extraction.service";

describe("DocumentExtractionService insights contract", () => {
  it("keeps summary/highlights and adds optional rag metadata", async () => {
    const findDocument = jest.fn().mockResolvedValue({
      id: 10,
      case: {
        organizationId: 1,
      },
    });
    const findExtraction = jest
      .fn()
      .mockResolvedValueOnce({
        id: 100,
        status: "ready",
        extractionMethod: "ocr_primary",
        errorCode: null,
        warningsJson: "[]",
        updatedAt: new Date("2026-02-24T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        insightsStatus: "ready",
        insightsSummary: "Summary text",
        insightsHighlightsJson: JSON.stringify([
          {
            snippet: "Important snippet",
            score: 0.91,
            sentence_start: 0,
            sentence_end: 20,
          },
        ]),
        insightsCitationsJson: JSON.stringify([
          {
            chunkId: 5,
            chunkIndex: 0,
            similarity: 0.91,
            snippet: "Important snippet",
            contentLang: "en",
            tokenCount: 4,
            metadata: { source: "ocr" },
          },
        ]),
        insightsRetrievalMetaJson: JSON.stringify({
          strategy: "pgvector_cosine_document_scope_v1",
          topKRequested: 5,
          topKReturned: 1,
          queryChars: 120,
          contextChars: 50,
          embeddingDimension: 1024,
          warnings: [],
        }),
        insightsMethod: "embedding_extractive_rag_pgvector_v1",
        insightsErrorCode: null,
        insightsWarningsJson: "[]",
        insightsUpdatedAt: new Date("2026-02-24T00:01:00.000Z"),
      });

    const db = {
      query: {
        documents: {
          findFirst: findDocument,
        },
        documentExtractions: {
          findFirst: findExtraction,
        },
      },
    };

    const service = new DocumentExtractionService(db as any);
    const result = await service.getDocumentInsightsByDocumentId(10, 1);

    // Backward-compatible fields expected by frontend
    expect(result.status).toBe("ready");
    expect(result.summary).toBe("Summary text");
    expect(result.highlights).toHaveLength(1);
    expect(result.highlights[0].snippet).toBe("Important snippet");

    // Optional fields can exist without breaking old consumers.
    expect(result.citations).toHaveLength(1);
    expect(result.citations?.[0].chunkId).toBe(5);
    expect(result.retrievalMeta?.topKReturned).toBe(1);
  });
});

