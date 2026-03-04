import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  getRegulationByIdHandler,
  getRegulationVersionsHandler,
} from "../handlers";
import { RegulationService } from "../../../services/regulation.service";

function buildReply() {
  return {
    send: jest.fn(),
    code: jest.fn().mockReturnThis(),
  };
}

describe("Regulation handlers metadata responses", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns full metadata payload on GET /api/regulations/:id", async () => {
    const getByIdSpy = jest
      .spyOn(RegulationService.prototype, "getRegulationById")
      .mockResolvedValue({
        id: 10,
        title: "Test regulation",
        status: "active",
        sourceProvider: "moj",
        sourceSerial: "serial-10",
        sourceListingUrl: "https://laws-gateway.moj.gov.sa/apis/legislations/v1/statute/section-search",
        sourceMetadataHash: "meta-hash-10",
        summary: "Summary text",
        sourceMetadata: {
          statuteName: "Test regulation",
          hardCopy: { documentName: "test.pdf" },
        },
      } as any);

    const reply = buildReply();
    await getRegulationByIdHandler(
      {
        params: { id: "10" },
        server: { db: {} },
      } as any,
      reply as any
    );

    expect(getByIdSpy).toHaveBeenCalledWith(10);
    expect(reply.send).toHaveBeenCalledWith({
      regulation: expect.objectContaining({
        sourceProvider: "moj",
        sourceSerial: "serial-10",
        sourceMetadataHash: "meta-hash-10",
        sourceMetadata: expect.objectContaining({
          statuteName: "Test regulation",
        }),
      }),
    });
  });

  it("returns version metadata and extraction payload on GET /api/regulations/:id/versions", async () => {
    const fetchedAt = new Date("2026-03-04T12:00:00Z");
    const getVersionsSpy = jest
      .spyOn(RegulationService.prototype, "getVersionsByRegulationId")
      .mockResolvedValue([
        {
          id: 1,
          regulationId: 99,
          versionNumber: 3,
          content: "version content",
          contentHash: "content-hash",
          sourceMetadata: {
            legalStatusName: "ساري",
          },
          sourceMetadataHash: "metadata-hash-v3",
          extractionMetadata: {
            extractionMethod: "moj:summary_sections_fallback",
          },
          fetchedAt,
        },
      ] as any);

    const reply = buildReply();
    await getRegulationVersionsHandler(
      {
        params: { id: "99" },
        server: { db: {} },
      } as any,
      reply as any
    );

    expect(getVersionsSpy).toHaveBeenCalledWith(99);
    const payload = reply.send.mock.calls[0][0] as any;
    expect(payload.versions[0].contentText).toBe("version content");
    expect(payload.versions[0].sourceMetadataHash).toBe("metadata-hash-v3");
    expect(payload.versions[0].sourceMetadata.legalStatusName).toBe("ساري");
    expect(payload.versions[0].extractionMetadata.extractionMethod).toContain("fallback");
    expect(payload.versions[0].createdAt).toEqual(fetchedAt);
  });
});
