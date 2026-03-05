import { describe, expect, it, jest } from "@jest/globals";
import { createHash } from "crypto";
import { RegulationInsightsService } from "../regulation-insights.service";
import { RegulationAmendmentImpactService } from "../regulation-amendment-impact.service";

describe("Regulation AI services contract", () => {
  it("returns not_generated insights when latest version has no cached row", async () => {
    const db = {
      query: {
        regulations: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 1,
            title: "Test Regulation",
            sourceMetadata: {},
          })),
        },
        regulationVersions: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 55,
            versionNumber: 2,
            content: "نص النظام",
            contentHash: "abc",
            sourceMetadata: {},
          })),
        },
        regulationInsights: {
          findFirst: jest.fn().mockImplementation(async () => null),
        },
      },
    };

    const service = new RegulationInsightsService(db as any);
    const result = await service.getLatestInsights(1, "ar");

    expect(result.status).toBe("not_generated");
    expect(result.regulationId).toBe(1);
    expect(result.regulationVersionId).toBe(55);
    expect(result.summary).toBeNull();
  });

  it("returns not_generated amendment impact when pair is not cached", async () => {
    const db = {
      query: {
        regulations: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 1,
            title: "Test Regulation",
          })),
        },
        regulationAmendmentImpacts: {
          findFirst: jest.fn().mockImplementation(async () => null),
        },
      },
    };

    const service = new RegulationAmendmentImpactService(db as any);
    const result = await service.getAmendmentImpact({
      regulationId: 1,
      fromVersion: 1,
      toVersion: 2,
      languageCode: "ar",
    });

    expect(result.status).toBe("not_generated");
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(2);
    expect(result.whatChanged).toEqual([]);
  });

  it("does not requeue ready insights when source hash is unchanged and force=false", async () => {
    const update = jest.fn();
    const insert = jest.fn();

    const db = {
      query: {
        regulations: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 1,
            title: "Test Regulation",
            sourceMetadata: {},
          })),
        },
        regulationVersions: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 55,
            versionNumber: 2,
            content: "نص النظام",
            contentHash: "same-hash",
            sourceMetadata: {},
          })),
        },
        regulationInsights: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 10,
            regulationId: 1,
            regulationVersionId: 55,
            languageCode: "ar",
            status: "ready",
            summary: "ملخص",
            obligationsJson: "[]",
            riskFlagsJson: "[]",
            keyDatesJson: "[]",
            citationsJson: "[]",
            sourceTextHash: "same-hash",
            method: "m",
            errorCode: null,
            warningsJson: "[]",
            updatedAt: new Date("2026-03-05T00:00:00.000Z"),
          })),
        },
      },
      update,
      insert,
    };

    const service = new RegulationInsightsService(db as any);
    const result = await service.enqueueLatestInsightsRefresh({
      regulationId: 1,
      triggeredByUserId: "7f7a9697-d722-4db5-b871-4d557de3f5d2",
      force: false,
      languageCode: "ar",
    });

    expect(result.status).toBe("ready");
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not requeue ready amendment impact when fingerprint is unchanged and force=false", async () => {
    const fromHash = "from-hash";
    const toHash = "to-hash";
    const fingerprint = createHash("sha256")
      .update([1, 1, 2, fromHash, toHash].join("::"), "utf-8")
      .digest("hex");

    const update = jest.fn();
    const insert = jest.fn();

    const db = {
      query: {
        regulations: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 1,
            title: "Test Regulation",
          })),
        },
        regulationVersions: {
          findMany: jest.fn().mockImplementation(async () => [
            {
              id: 101,
              versionNumber: 1,
              content: "النص القديم",
              contentHash: fromHash,
            },
            {
              id: 102,
              versionNumber: 2,
              content: "النص الجديد",
              contentHash: toHash,
            },
          ]),
        },
        regulationAmendmentImpacts: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 20,
            regulationId: 1,
            fromVersionNumber: 1,
            toVersionNumber: 2,
            languageCode: "ar",
            fromVersionId: 101,
            toVersionId: 102,
            status: "ready",
            whatChangedJson: "[]",
            legalImpactJson: "[]",
            affectedPartiesJson: "[]",
            citationsJson: "[]",
            diffFingerprintHash: fingerprint,
            method: "m",
            errorCode: null,
            warningsJson: "[]",
            updatedAt: new Date("2026-03-05T00:00:00.000Z"),
          })),
        },
      },
      update,
      insert,
    };

    const service = new RegulationAmendmentImpactService(db as any);
    const result = await service.enqueueAmendmentImpactRefresh({
      regulationId: 1,
      fromVersion: 1,
      toVersion: 2,
      triggeredByUserId: "7f7a9697-d722-4db5-b871-4d557de3f5d2",
      force: false,
      languageCode: "ar",
    });

    expect(result.status).toBe("ready");
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
