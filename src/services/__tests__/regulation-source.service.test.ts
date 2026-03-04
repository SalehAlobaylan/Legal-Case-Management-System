import { createHash } from "crypto";
import { describe, expect, it, jest } from "@jest/globals";
import { regulationVersions } from "../../db/schema";
import { RegulationSourceService } from "../regulation-source.service";

function buildService(db: any = {}) {
  return new RegulationSourceService(db as any);
}

describe("RegulationSourceService listing extraction", () => {
  it("extracts regulation candidates from anchor links", () => {
    const service = buildService() as any;
    const html = `
      <div>
        <a href="/ar/legislations-regulations/labor-law-123">نظام العمل</a>
        <a href="/ar/legislations-regulations">Listing only</a>
      </div>
    `;

    const candidates = service.extractCandidatesFromListing(
      html,
      "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1&pageSize=9&sortingBy=7"
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceUrl).toBe(
      "https://laws.moj.gov.sa/ar/legislations-regulations/labor-law-123"
    );
    expect(candidates[0].title).toBe("نظام العمل");
    expect(candidates[0].sourceProvider).toBe("moj");
  });

  it("extracts regulation candidates from data-url attributes", () => {
    const service = buildService() as any;
    const html = `
      <article data-url="/ar/legislations-regulations/commercial-law-999">
        <h3>Commercial Regulation</h3>
      </article>
    `;

    const candidates = service.extractCandidatesFromListing(
      html,
      "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=2&pageSize=9&sortingBy=7"
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceUrl).toBe(
      "https://laws.moj.gov.sa/ar/legislations-regulations/commercial-law-999"
    );
  });

  it("extracts regulation candidates from embedded JSON url/title pairs", () => {
    const service = buildService() as any;
    const html = `
      <script type="application/json">
        {"title":"Labor Law Regulation","url":"\\/ar\\/legislations-regulations\\/labor-law-json-321"}
      </script>
    `;

    const candidates = service.extractCandidatesFromListing(
      html,
      "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=3&pageSize=9&sortingBy=7"
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceUrl).toBe(
      "https://laws.moj.gov.sa/ar/legislations-regulations/labor-law-json-321"
    );
    expect(candidates[0].title).toBe("Labor Law Regulation");
  });
});

describe("RegulationSourceService MOJ metadata handling", () => {
  it("maps gateway row into full source metadata including hardCopy", () => {
    const service = buildService() as any;
    const row = {
      serial: "abc-123",
      statuteName: "Test Regulation",
      legalType: "system",
      legalStatueName: "ساري",
      summary: "Test summary",
      hardCopy: {
        id: "1",
        downloadUrl:
          "https://laws-gateway.moj.gov.sa/apis/legislations/v1/document/download?Document=x",
      },
      sections: [{ title: "Article 1", text: "Some section text" }],
    };

    const candidate = service.mapGatewayRowToCandidate(row, "https://example.test/listing");
    expect(candidate).toBeTruthy();
    expect(candidate.sourceProvider).toBe("moj");
    expect(candidate.sourceSerial).toBe("abc-123");
    expect(candidate.summary).toBe("Test summary");
    expect(candidate.sourceMetadata.serial).toBe("abc-123");
    expect((candidate.sourceMetadata.hardCopy as any).downloadUrl).toContain(
      "/document/download"
    );
    expect(typeof candidate.sourceMetadataHash).toBe("string");
  });

  it("produces stable metadata hash regardless of key order", () => {
    const service = buildService() as any;
    const a = {
      statuteName: "X",
      hardCopy: { id: "1", downloadUrl: "https://example.test/a.pdf" },
      sections: [{ text: "t1" }, { text: "t2" }],
    };
    const b = {
      sections: [{ text: "t1" }, { text: "t2" }],
      hardCopy: { downloadUrl: "https://example.test/a.pdf", id: "1" },
      statuteName: "X",
    };

    expect(service.hashSourceMetadata(a)).toBe(service.hashSourceMetadata(b));
  });
});

describe("RegulationSourceService versioning decisions", () => {
  function buildDbForVersioning(latestVersion: any, recentVersions?: any[]) {
    const insertedVersionRows: any[] = [];
    const updateWhere = jest.fn(async () => []);
    const updateSet = jest.fn(() => ({ where: updateWhere }));
    const updateMock = jest.fn(() => ({ set: updateSet }));
    const insertValues = jest.fn(async (value: any) => {
      insertedVersionRows.push(value);
      return [];
    });
    const insertMock = jest.fn((table: unknown) => {
      if (table === regulationVersions) {
        return { values: insertValues };
      }
      return { values: jest.fn(async () => []) };
    });

    const db = {
      query: {
        regulationVersions: {
          findFirst: jest.fn(async () => latestVersion),
          findMany: jest.fn(async () =>
            Array.isArray(recentVersions)
              ? recentVersions
              : latestVersion
                ? [latestVersion]
                : []
          ),
        },
      },
      insert: insertMock,
      update: updateMock,
    };

    return {
      db,
      insertedVersionRows,
      spies: {
        insertValues,
        updateWhere,
      },
    };
  }

  it("falls back to summary text when extraction fails for sourceUrl and hardCopy", async () => {
    const { db, insertedVersionRows } = buildDbForVersioning(null);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "error",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-1",
          extraction_method: "none",
          warnings: ["failed"],
          error_code: "http_403",
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => []);

    const candidate = {
      title: "Regulation X",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-1",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-1",
      regulationNumber: "serial-1",
      status: "active",
      summary: "Fallback summary text from API.",
      sourceMetadata: {
        hardCopy: {
          downloadUrl:
            "https://laws-gateway.moj.gov.sa/apis/legislations/v1/document/download?Document=test",
        },
      },
      sourceMetadataHash: "meta-hash-1",
    };

    const result = await service.syncRegulationVersion(101, candidate);
    expect(result).toBe("created");
    expect(insertedVersionRows).toHaveLength(1);
    expect(insertedVersionRows[0].content).toContain("Fallback summary text from API.");
    expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toBe(
      "moj:summary_sections_fallback"
    );
  });

  it("extracts from hardcopy document bytes when URL extraction fails", async () => {
    const { db, insertedVersionRows } = buildDbForVersioning(null);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "error",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-hardcopy",
          extraction_method: "none",
          warnings: ["source_not_allowed"],
          error_code: "source_not_allowed",
        })),
        extractDocumentContent: jest.fn(async () => ({
          status: "ok",
          file_name: "hardcopy.pdf",
          extraction_method: "pdf_parser",
          extracted_text: "Extracted from hardcopy PDF",
          normalized_text_hash: "pdf-content-hash",
          warnings: [],
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => [
      "https://laws-gateway.moj.gov.sa/apis/legislations/v1/document/download?Document=test",
    ]);
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      const headers = new Headers({
        "content-type": "application/pdf",
        "content-length": "24",
      });
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers,
      });
    }) as any;

    const candidate = {
      title: "Regulation Hardcopy",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-hardcopy",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-hardcopy",
      regulationNumber: "serial-hardcopy",
      status: "active",
      sourceMetadata: {
        hardCopy: {
          documentName: "hardcopy.pdf",
          downloadUrl:
            "https://laws-gateway.moj.gov.sa/apis/legislations/v1/document/download?Document=test",
        },
      },
      sourceMetadataHash: "meta-hardcopy",
    };

    try {
      const result = await service.syncRegulationVersion(303, candidate);
      expect(result).toBe("created");
      expect(insertedVersionRows).toHaveLength(1);
      expect(insertedVersionRows[0].content).toContain("Extracted from hardcopy PDF");
      expect(insertedVersionRows[0].contentHash).toBe("pdf-content-hash");
      expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toContain(
        "ai-document:"
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("ignores portal shell content and falls back to hardcopy extraction", async () => {
    const { db, insertedVersionRows } = buildDbForVersioning(null);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "ok",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-shell",
          extraction_method: "parser_html",
          extracted_text: ". البوابة القانونية Loading...",
          raw_html: "<div id=\"nuxt-loading\"><div>Loading...</div></div>",
          warnings: [],
        })),
        extractDocumentContent: jest.fn(async () => ({
          status: "ok",
          file_name: "hardcopy.pdf",
          extraction_method: "pdf_parser",
          extracted_text: "Real regulation text from hardcopy.",
          normalized_text_hash: "real-hardcopy-hash",
          warnings: [],
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => [
      "https://laws-gateway.moj.gov.sa/apis/legislations/v1/document/download?Document=test",
    ]);
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      const headers = new Headers({
        "content-type": "application/pdf",
        "content-length": "24",
      });
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers,
      });
    }) as any;

    const candidate = {
      title: "Shell test regulation",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-shell",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-shell",
      regulationNumber: "serial-shell",
      status: "active",
      sourceMetadata: {
        hardCopy: {
          documentName: "hardcopy.pdf",
          downloadUrl:
            "apis/legislations/v1/document/download?Document=TGF3c1JlZ3VsYXRpb25zX2FiYy5wZGY=",
        },
      },
      sourceMetadataHash: "meta-shell",
    };

    try {
      const result = await service.syncRegulationVersion(404, candidate);
      expect(result).toBe("created");
      expect(insertedVersionRows).toHaveLength(1);
      expect(insertedVersionRows[0].content).toContain("Real regulation text from hardcopy.");
      expect(insertedVersionRows[0].contentHash).toBe("real-hardcopy-hash");
      expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toContain(
        "ai-document:"
      );
      const attempts = insertedVersionRows[0].extractionMetadata.attempts;
      expect(
        attempts.some((attempt: any) => attempt.mode === "hardcopy_document_extract")
      ).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("uses MOJ gateway detail text when hardcopy fails and page is shell", async () => {
    const { db, insertedVersionRows } = buildDbForVersioning(null);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "ok",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-gateway-detail",
          extraction_method: "parser_html",
          extracted_text: ". البوابة القانونية Loading...",
          raw_html: "<div id=\"nuxt-loading\"><div>Loading...</div></div>",
          warnings: [],
        })),
        extractDocumentContent: jest.fn(async () => ({
          status: "error",
          file_name: "hardcopy.pdf",
          extraction_method: "none",
          warnings: ["download failed"],
          error_code: "http_400",
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => [
      "https://laws-gateway.moj.gov.sa/apis/legislations/v1/document/download?Document=test",
    ]);

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/document/download")) {
        return new Response("bad request", { status: 400 });
      }
      if (/get-Statute-gateway-Detail/i.test(url)) {
        return new Response(
          JSON.stringify({
            success: true,
            model: {
              statuteId: "VirwqImRkJVcEd5jz5h69g",
              sections: [
                {
                  title: "المادة الأولى",
                  text: "هذه المادة تحتوي على نص تشريعي كامل ومفصل للاختبار، وتشمل أحكاماً متعددة وممتدة لضمان تجاوز الحد الأدنى لطول النص عند الاستخراج من واجهة تفاصيل الأنظمة.",
                },
                {
                  title: "المادة الثانية",
                  text: "ويستمر النص هنا لتجاوز حد الطول الأدنى المطلوب للاعتماد، مع إضافة عبارات تنظيمية إضافية تتعلق بالإجراءات والاختصاص والتبليغ والتنفيذ وأثر الأحكام.",
                },
                {
                  text: "هذا سطر إضافي للتأكد من أن الاستخراج ليس مجرد ملخص قصير، بل نص تفصيلي غني يمكن عرضه على صفحة النظام والمقارنة بين الإصدارات.",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return new Response("not found", { status: 404 });
    }) as any;

    const candidate = {
      title: "Regulation Gateway Detail",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-gateway-detail",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-gateway-detail",
      regulationNumber: "serial-gateway-detail",
      status: "active",
      summary: "Short summary fallback text only.",
      sourceMetadata: {
        statuteId: "VirwqImRkJVcEd5jz5h69g",
        hardCopy: {
          documentName: "hardcopy.pdf",
          downloadUrl:
            "apis/legislations/v1/document/download?Document=TGF3c1JlZ3VsYXRpb25zX2FiYy5wZGY=",
        },
      },
      sourceMetadataHash: "meta-gateway-detail",
    };

    try {
      const result = await service.syncRegulationVersion(606, candidate);
      expect(result).toBe("created");
      expect(insertedVersionRows).toHaveLength(1);
      expect(insertedVersionRows[0].content).toContain("المادة الأولى");
      expect(insertedVersionRows[0].content).not.toBe(candidate.summary);
      expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toBe(
        "moj-gateway:statute_detail"
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("ignores WAF/access-denied hardcopy text and falls back safely", async () => {
    const { db, insertedVersionRows } = buildDbForVersioning(null);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "ok",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-waf",
          extraction_method: "parser_html",
          extracted_text: ". البوابة القانونية Loading...",
          raw_html: "<div id=\"nuxt-loading\"><div>Loading...</div></div>",
          warnings: [],
        })),
        extractDocumentContent: jest.fn(async () => ({
          status: "ok",
          file_name: "hardcopy.pdf",
          extraction_method: "parser_html_fallback",
          extracted_text:
            "Request Rejected The requested URL was rejected. Please consult with your administrator. Your support ID is: 15491353289644572391 [Go Back]",
          normalized_text_hash: "blocked-content-hash",
          warnings: [],
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => [
      "https://laws-gateway.moj.gov.sa/apis/legislations/v1/document/download?Document=test",
    ]);

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      const headers = new Headers({
        "content-type": "text/html; charset=utf-8",
        "content-length": "247",
      });
      return new Response(
        "<html><body>Request Rejected. Your support ID is: 15491353289644572391</body></html>",
        {
          status: 200,
          headers,
        }
      );
    }) as any;

    const candidate = {
      title: "WAF blocked regulation",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-waf",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-waf",
      regulationNumber: "serial-waf",
      status: "active",
      summary: "Fallback summary for blocked response.",
      sourceMetadata: {
        hardCopy: {
          documentName: "hardcopy.pdf",
          downloadUrl:
            "apis/legislations/v1/document/download?Document=TGF3c1JlZ3VsYXRpb25zX2FiYy5wZGY=",
        },
      },
      sourceMetadataHash: "meta-waf",
    };

    try {
      const result = await service.syncRegulationVersion(707, candidate);
      expect(result).toBe("created");
      expect(insertedVersionRows).toHaveLength(1);
      expect(insertedVersionRows[0].content).toContain("Fallback summary for blocked response.");
      expect(insertedVersionRows[0].content).not.toContain("Request Rejected");
      expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toBe(
        "moj:summary_sections_fallback"
      );
      expect(
        insertedVersionRows[0].extractionMetadata.attempts.some(
          (attempt: any) => attempt.status === "ignored_blocked_content"
        )
      ).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("creates a new version when only metadata hash changed", async () => {
    const existingContent = "Existing regulation content";
    const contentHash = createHash("sha256").update(existingContent, "utf-8").digest("hex");
    const latestVersion = {
      versionNumber: 4,
      content: existingContent,
      contentHash,
      sourceMetadataHash: "meta-old",
      rawHtml: null,
    };
    const { db, insertedVersionRows } = buildDbForVersioning(latestVersion);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "not_modified",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-2",
          extraction_method: "not_modified",
          warnings: [],
        })),
      },
      configurable: true,
    });

    const candidate = {
      title: "Regulation Y",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-2",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-2",
      regulationNumber: "serial-2",
      status: "active",
      sourceMetadata: {
        legalStatusName: "ساري",
      },
      sourceMetadataHash: "meta-new",
    };

    const result = await service.syncRegulationVersion(202, candidate);
    expect(result).toBe("created");
    expect(insertedVersionRows).toHaveLength(1);
    expect(insertedVersionRows[0].content).toBe(existingContent);
    expect(insertedVersionRows[0].contentHash).toBe(contentHash);
    expect(insertedVersionRows[0].sourceMetadataHash).toBe("meta-new");
    expect(insertedVersionRows[0].changesSummary).toContain("metadata change");
  });

  it("does not keep shell content when source returns not_modified", async () => {
    const shellContent = ". البوابة القانونية Loading...";
    const latestVersion = {
      versionNumber: 5,
      content: shellContent,
      contentHash: "shell-hash",
      sourceMetadataHash: "meta-old",
      rawHtml: "<div id=\"nuxt-loading\"><div>Loading...</div></div>",
    };
    const { db, insertedVersionRows } = buildDbForVersioning(latestVersion);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "not_modified",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-not-mod",
          extraction_method: "not_modified",
          warnings: [],
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => []);

    const candidate = {
      title: "Regulation Not Modified",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-not-mod",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-not-mod",
      regulationNumber: "serial-not-mod",
      status: "active",
      summary: "Fallback summary when previous content is shell.",
      sourceMetadata: {},
      sourceMetadataHash: "meta-old",
    };

    const result = await service.syncRegulationVersion(505, candidate);
    expect(result).toBe("created");
    expect(insertedVersionRows).toHaveLength(1);
    expect(insertedVersionRows[0].content).toContain("Fallback summary");
    expect(insertedVersionRows[0].content).not.toBe(shellContent);
    expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toBe(
      "moj:summary_sections_fallback"
    );
  });

  it("uses previous valid version when latest version is blocked and source is not_modified", async () => {
    const blockedLatest = {
      versionNumber: 6,
      content:
        "Request Rejected The requested URL was rejected. Please consult with your administrator. Your support ID is: 15491353289644572391 [Go Back]",
      contentHash: "blocked-hash-v6",
      sourceMetadataHash: "meta-old",
      rawHtml: "<html><body>Request Rejected</body></html>",
    };
    const previousValid = {
      versionNumber: 5,
      content: "نص نظام صحيح من إصدار سابق وقابل للاستخدام عند فشل المصدر الحالي.",
      contentHash: createHash("sha256")
        .update("نص نظام صحيح من إصدار سابق وقابل للاستخدام عند فشل المصدر الحالي.", "utf-8")
        .digest("hex"),
      sourceMetadataHash: "meta-old",
      rawHtml: null,
    };
    const { db, insertedVersionRows } = buildDbForVersioning(blockedLatest, [
      blockedLatest,
      previousValid,
    ]);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "not_modified",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-prev-valid",
          extraction_method: "not_modified",
          warnings: [],
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => []);

    const candidate = {
      title: "Regulation Previous Valid",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-prev-valid",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-prev-valid",
      regulationNumber: "serial-prev-valid",
      status: "active",
      sourceMetadata: {},
      sourceMetadataHash: "meta-new",
    };

    const result = await service.syncRegulationVersion(808, candidate);
    expect(result).toBe("created");
    expect(insertedVersionRows).toHaveLength(1);
    expect(insertedVersionRows[0].content).toBe(previousValid.content);
    expect(insertedVersionRows[0].contentHash).toBe(previousValid.contentHash);
    expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toBe(
      "ai:not_modified_previous_valid_version"
    );
  });

  it("extracts full content via GET statute gateway endpoint with statuteStructure", async () => {
    const { db, insertedVersionRows } = buildDbForVersioning(null);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "error",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-get-test",
          extraction_method: "none",
          warnings: ["failed"],
          error_code: "http_403",
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => []);

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("get-Statute-gateway-Detail") && url.includes("Serial=serial-get-test")) {
        return new Response(
          JSON.stringify({
            success: true,
            model: {
              statuteName: "نظام العمل",
              statuteStructure: [
                {
                  name: "الباب الأول",
                  sequence: "1",
                  text: "",
                  items: [
                    {
                      name: "الفصل الأول: التعريفات",
                      sequence: "المادة الأولى",
                      text: "<p>يُقصد بالألفاظ والعبارات الآتية – أينما وردت في هذا النظام – المعاني المبينة أمام كل منها ما لم يقتضِ السياق خلاف ذلك.</p>",
                      items: [],
                    },
                    {
                      name: "الفصل الثاني: أحكام عامة",
                      sequence: "المادة الثانية",
                      text: "<p>العمل حق للمواطن، لا يجوز لغيره ممارسته إلا بعد توافر الشروط المنصوص عليها في هذا النظام.</p>",
                      items: [],
                    },
                  ],
                },
                {
                  name: "الباب الثاني",
                  sequence: "2",
                  text: "",
                  items: [
                    {
                      name: "أحكام التوظيف",
                      sequence: "المادة الثالثة",
                      text: "<p>يلتزم صاحب العمل بتوفير بيئة عمل آمنة ومناسبة للعمال وفقاً لأحكام هذا النظام واللوائح المنظمة.</p>",
                      items: [],
                    },
                  ],
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return new Response("not found", { status: 404 });
    }) as any;

    const candidate = {
      title: "نظام العمل",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-get-test",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-get-test",
      regulationNumber: "serial-get-test",
      status: "active",
      summary: "Short summary.",
      sourceMetadata: {},
      sourceMetadataHash: "meta-get-test",
    };

    try {
      const result = await service.syncRegulationVersion(901, candidate);
      expect(result).toBe("created");
      expect(insertedVersionRows).toHaveLength(1);
      const content = insertedVersionRows[0].content;
      expect(content).toContain("الباب الأول");
      expect(content).toContain("المادة الأولى");
      expect(content).toContain("المادة الثانية");
      expect(content).toContain("المادة الثالثة");
      expect(content).toContain("يُقصد بالألفاظ والعبارات");
      expect(content).toContain("العمل حق للمواطن");
      // Should NOT contain raw HTML tags
      expect(content).not.toContain("<p>");
      expect(content).not.toContain("</p>");
      expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toBe(
        "moj-gateway:statute_get"
      );
      expect(
        insertedVersionRows[0].extractionMetadata.attempts.some(
          (a: any) => a.mode === "moj_gateway_statute_get" && a.status === "ok"
        )
      ).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("falls through GET statute endpoint when statuteStructure is missing", async () => {
    const { db, insertedVersionRows } = buildDbForVersioning(null);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "error",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-no-structure",
          extraction_method: "none",
          warnings: ["failed"],
          error_code: "http_403",
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => []);

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("get-Statute-gateway-Detail")) {
        return new Response(
          JSON.stringify({
            success: true,
            model: {
              statuteName: "نظام بلا هيكل",
              summary: "ملخص النظام",
              // No statuteStructure field
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return new Response("not found", { status: 404 });
    }) as any;

    const candidate = {
      title: "نظام بلا هيكل",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-no-structure",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-no-structure",
      regulationNumber: "serial-no-structure",
      status: "active",
      summary: "ملخص النظام كنص احتياطي طويل بما فيه الكفاية لتجاوز الحد الأدنى للطول المطلوب للاعتماد.",
      sourceMetadata: {},
      sourceMetadataHash: "meta-no-struct",
    };

    try {
      const result = await service.syncRegulationVersion(902, candidate);
      expect(result).toBe("created");
      expect(insertedVersionRows).toHaveLength(1);
      // Should fall through to summary fallback
      expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toBe(
        "moj:summary_sections_fallback"
      );
      expect(
        insertedVersionRows[0].extractionMetadata.attempts.some(
          (a: any) => a.mode === "moj_gateway_statute_get" && a.status === "no_statute_structure"
        )
      ).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("prefers GET statute extraction over hardcopy and POST tiers", async () => {
    const { db, insertedVersionRows } = buildDbForVersioning(null);
    const service = buildService(db) as any;
    Object.defineProperty(service, "aiClient", {
      value: {
        extractRegulationContent: jest.fn(async () => ({
          status: "error",
          source_url: "https://laws.moj.gov.sa/ar/legislation/serial-priority",
          extraction_method: "none",
          warnings: ["failed"],
          error_code: "http_403",
        })),
        extractDocumentContent: jest.fn(async () => ({
          status: "ok",
          file_name: "hardcopy.pdf",
          extraction_method: "pdf_parser",
          extracted_text: "Hardcopy text should NOT be used when GET succeeds.",
          normalized_text_hash: "hardcopy-hash",
          warnings: [],
        })),
      },
      configurable: true,
    });
    service.getHardCopyDownloadUrls = jest.fn(() => [
      "https://laws-gateway.moj.gov.sa/apis/legislations/v1/document/download?Document=test",
    ]);

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("get-Statute-gateway-Detail") && url.includes("Serial=serial-priority")) {
        return new Response(
          JSON.stringify({
            success: true,
            model: {
              statuteName: "نظام الأولوية",
              statuteStructure: [
                {
                  name: "الباب الوحيد",
                  sequence: "1",
                  text: "",
                  items: [
                    {
                      name: "المواد",
                      sequence: "المادة الأولى",
                      text: "<p>نص المادة الأولى من نظام الأولوية. يجب أن يظهر هذا النص بدلاً من نص الـ hardcopy لأن طريقة GET أعلى أولوية في خط الاستخراج.</p>",
                      items: [],
                    },
                  ],
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      }
      if (url.includes("/document/download")) {
        const headers = new Headers({
          "content-type": "application/pdf",
          "content-length": "24",
        });
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers });
      }
      return new Response("not found", { status: 404 });
    }) as any;

    const candidate = {
      title: "نظام الأولوية",
      sourceUrl: "https://laws.moj.gov.sa/ar/legislation/serial-priority",
      sourceListingUrl: "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1",
      sourceProvider: "moj",
      sourceSerial: "serial-priority",
      regulationNumber: "serial-priority",
      status: "active",
      summary: "Short summary.",
      sourceMetadata: {
        hardCopy: {
          documentName: "hardcopy.pdf",
          downloadUrl:
            "apis/legislations/v1/document/download?Document=test",
        },
      },
      sourceMetadataHash: "meta-priority",
    };

    try {
      const result = await service.syncRegulationVersion(903, candidate);
      expect(result).toBe("created");
      expect(insertedVersionRows).toHaveLength(1);
      // GET statute method should win over hardcopy
      expect(insertedVersionRows[0].content).toContain("نص المادة الأولى من نظام الأولوية");
      expect(insertedVersionRows[0].content).not.toContain("Hardcopy text should NOT be used");
      expect(insertedVersionRows[0].extractionMetadata.extractionMethod).toBe(
        "moj-gateway:statute_get"
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
