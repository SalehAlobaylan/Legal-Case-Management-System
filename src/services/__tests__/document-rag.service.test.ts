import { describe, expect, it, jest } from "@jest/globals";
import { DOCUMENT_CHUNK_EMBEDDING_DIMENSION } from "../../db/schema";
import { DocumentRagService } from "../document-rag.service";

function vector(value: number): number[] {
  return Array.from(
    { length: DOCUMENT_CHUNK_EMBEDDING_DIMENSION },
    () => value
  );
}

describe("DocumentRagService", () => {
  it("keeps ingestion idempotent for same source text", async () => {
    const reindexChunksForDocument = jest.fn().mockResolvedValue([]);
    const chunkService = {
      reindexChunksForDocument,
    };
    const aiClient = {
      generateEmbeddings: jest.fn().mockImplementation(async (texts: string[]) => ({
        embeddings: texts.map((_, index) => vector(index + 1)),
        dimension: DOCUMENT_CHUNK_EMBEDDING_DIMENSION,
        count: texts.length,
      })),
      generateEmbedding: jest.fn(),
    };

    const service = new DocumentRagService(
      {} as any,
      aiClient as any,
      chunkService as any
    );

    const input = {
      organizationId: 7,
      documentId: 44,
      sourceText:
        "This is a legal document body. ".repeat(300),
    };

    await service.reindexDocumentChunks(input);
    await service.reindexDocumentChunks(input);

    expect(reindexChunksForDocument).toHaveBeenCalledTimes(2);
    const firstPayload = reindexChunksForDocument.mock.calls[0][2];
    const secondPayload = reindexChunksForDocument.mock.calls[1][2];
    expect(firstPayload).toEqual(secondPayload);
    expect(firstPayload.length).toBeGreaterThan(0);
  });

  it("retrieves and formats citations with document scope", async () => {
    const retrieveTopKChunksBySimilarity = jest.fn().mockResolvedValue([
      {
        id: 300,
        organizationId: 7,
        documentId: 44,
        chunkIndex: 5,
        content: "Later chunk",
        contentLang: "en",
        tokenCount: 10,
        metadata: { charStart: 400 },
        similarity: 0.9,
      },
      {
        id: 200,
        organizationId: 7,
        documentId: 44,
        chunkIndex: 2,
        content: "Earlier chunk",
        contentLang: "en",
        tokenCount: 8,
        metadata: { charStart: 200 },
        similarity: 0.85,
      },
    ]);
    const chunkService = {
      retrieveTopKChunksBySimilarity,
      reindexChunksForDocument: jest.fn(),
    };
    const aiClient = {
      generateEmbeddings: jest.fn(),
      generateEmbedding: jest.fn().mockResolvedValue(vector(0.1)),
    };

    const service = new DocumentRagService(
      {} as any,
      aiClient as any,
      chunkService as any
    );

    const result = await service.retrieveRelevantChunks({
      organizationId: 7,
      documentId: 44,
      queryText: "query",
      topK: 2,
    });

    expect(retrieveTopKChunksBySimilarity).toHaveBeenCalledWith({
      organizationId: 7,
      documentId: 44,
      embedding: vector(0.1),
      topK: 2,
    });
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].chunkId).toBe(300);
    expect(result.retrievalMeta.topKReturned).toBe(2);
    // Context is re-ordered for readability by chunk_index.
    expect(result.contextText.startsWith("Earlier chunk")).toBe(true);
  });
});

