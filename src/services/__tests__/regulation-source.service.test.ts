import { describe, expect, it } from "@jest/globals";
import { RegulationSourceService } from "../regulation-source.service";

function buildService() {
  return new RegulationSourceService({} as any);
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
