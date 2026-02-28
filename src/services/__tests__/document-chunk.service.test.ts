import { describe, expect, it, jest } from "@jest/globals";
import {
  DOCUMENT_CHUNK_EMBEDDING_DIMENSION,
} from "../../db/schema";
import { DocumentChunkService } from "../document-chunk.service";
import { ConflictError, ForbiddenError } from "../../utils/errors";

function chunkQueryPreview(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
  if (chunks.length === 0) {
    return String(query);
  }

  return chunks
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        return String((chunk as { value: unknown }).value);
      }
      return "";
    })
    .join(" ");
}

function createMockDb(options?: {
  documentOrgId?: number;
  insertError?: unknown;
  executeAssert?: (query: unknown) => void;
  executeResult?: unknown[];
}) {
  const documentOrgId = options?.documentOrgId ?? 1;
  const findFirst = jest.fn().mockResolvedValue({
    id: 10,
    case: {
      organizationId: documentOrgId,
    },
  });

  const insertReturning = options?.insertError
    ? jest.fn().mockRejectedValue(options.insertError)
    : jest.fn().mockResolvedValue([]);
  const insertValues = jest.fn().mockReturnValue({
    returning: insertReturning,
  });
  const insert = jest.fn().mockReturnValue({
    values: insertValues,
  });

  const deleteReturning = jest.fn().mockResolvedValue([]);
  const deleteWhere = jest.fn().mockReturnValue({
    returning: deleteReturning,
  });
  const deleteMethod = jest.fn().mockReturnValue({
    where: deleteWhere,
  });

  const tx = {
    insert,
    delete: deleteMethod,
  };
  const transaction = jest.fn(async (callback: (db: typeof tx) => unknown) =>
    callback(tx)
  );

  const execute = jest.fn().mockImplementation(async (query: unknown) => {
    if (options?.executeAssert) {
      options.executeAssert(query);
    }
    return options?.executeResult ?? [];
  });

  const db = {
    query: {
      documents: {
        findFirst,
      },
    },
    insert,
    delete: deleteMethod,
    transaction,
    execute,
  };

  return {
    db: db as any,
    mocks: {
      findFirst,
      insert,
      execute,
      transaction,
    },
  };
}

describe("DocumentChunkService", () => {
  it("enforces tenant isolation for insert operations", async () => {
    const { db, mocks } = createMockDb({ documentOrgId: 9 });
    const service = new DocumentChunkService(db);

    await expect(
      service.insertChunksForDocument(1, 10, [
        { chunkIndex: 0, content: "chunk" },
      ])
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects duplicate chunk_index values before insert", async () => {
    const { db, mocks } = createMockDb();
    const service = new DocumentChunkService(db);

    await expect(
      service.insertChunksForDocument(1, 10, [
        { chunkIndex: 0, content: "first" },
        { chunkIndex: 0, content: "duplicate" },
      ])
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("maps database unique-constraint violations to conflict errors", async () => {
    const { db } = createMockDb({
      insertError: { code: "23505" },
    });
    const service = new DocumentChunkService(db);

    await expect(
      service.insertChunksForDocument(1, 10, [
        { chunkIndex: 0, content: "existing chunk" },
      ])
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("retrieves top-k chunks using organization-scoped similarity query", async () => {
    const organizationId = 77;
    const topK = 3;
    const { db, mocks } = createMockDb({
      executeAssert: (query) => {
        const preview = chunkQueryPreview(query);
        expect(preview).toContain("organization_id");
      },
      executeResult: [
        {
          id: 1,
          organization_id: organizationId,
          document_id: 10,
          chunk_index: 0,
          content: "alpha",
          content_lang: "ar",
          token_count: 12,
          metadata: { source: "ocr" },
          similarity: "0.95",
        },
      ],
    });
    const service = new DocumentChunkService(db);
    const embedding = Array.from(
      { length: DOCUMENT_CHUNK_EMBEDDING_DIMENSION },
      () => 0
    );

    const rows = await service.retrieveTopKChunksBySimilarity({
      organizationId,
      embedding,
      topK,
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(organizationId);
    expect(rows[0].documentId).toBe(10);
    expect(rows[0].similarity).toBeCloseTo(0.95);
  });
});
