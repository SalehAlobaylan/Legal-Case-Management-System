import { describe, expect, it, jest } from "@jest/globals";
import { AdminAIIntelligenceService } from "../admin-ai-intelligence.service";

/*
 * These are contract/unit tests using a lightweight chainable fake db (the same
 * spirit as regulation-ai-insights.contract.test.ts) plus a fake AI client.
 * They verify the microservice-vs-fallback scoring decision, audit logging, and
 * the read-path summary assembly — without a live database.
 */

interface FakeDb {
  db: any;
  inserted: { table: string; values: any }[];
  deletes: number;
}

/**
 * `selectResults` is consumed in await-order: each awaited `db.select()...`
 * chain resolves to the next array in the list (default []).
 */
function makeFakeDb(selectResults: any[][] = []): FakeDb {
  let selectIdx = 0;
  const inserted: { table: string; values: any }[] = [];
  const state = { deletes: 0 };

  const selectChain = () => {
    const resolveOnce = () => selectResults[selectIdx++] ?? [];
    const p: any = {
      from: () => p,
      where: () => p,
      leftJoin: () => p,
      innerJoin: () => p,
      groupBy: () => p,
      orderBy: () => p,
      limit: () => p,
      then: (onF: any, onR: any) => Promise.resolve(resolveOnce()).then(onF, onR),
    };
    return p;
  };

  const db: any = {
    select: () => selectChain(),
    insert: (table: any) => ({
      values: (vals: any) => {
        const tableName = String(table?.[Symbol.for("drizzle:Name")] ?? table?.name ?? "unknown");
        inserted.push({ table: tableName, values: vals });
        const r: any = {
          onConflictDoUpdate: () => Promise.resolve(),
          returning: () => Promise.resolve([{ id: 1, ...vals }]),
          then: (onF: any, onR: any) => Promise.resolve().then(onF, onR),
        };
        return r;
      },
    }),
    delete: () => ({
      where: () => {
        state.deletes += 1;
        return Promise.resolve();
      },
    }),
  };

  return { db, inserted, get deletes() { return state.deletes; } } as FakeDb;
}

const healthyAi = () => ({
  getEmbeddingsHealth: jest.fn(async () => ({ warming_up: false, fallback_active: false })),
  generateCaseRiskProfile: jest.fn(async () => ({
    status: "ok",
    case_id: 1,
    score: 55,
    urgency: "high",
    confidence: "medium",
    signals: ["unassigned", "stale"],
    evidence: [
      { signal: "unassigned", label: "قضية غير مُسندة", severity: "high", contribution: 15, detail: null },
    ],
    recommended_actions: [{ action: "assign_owner", label: "إسناد محامٍ", target: "case" }],
    rationale: null,
    method: "heuristic_risk_v1",
    warnings: [],
  })),
  generateOrgIntelligenceSummary: jest.fn(async () => ({
    status: "ok",
    headline: "ملخص",
    bullets: ["نقطة"],
    aggregate_risk: {},
    workload_signals: {},
    confidence: "medium",
    method: "heuristic_org_summary_v1",
    warnings: [],
  })),
  prioritizeReview: jest.fn(async () => ({ status: "ok", items: [], method: "x", confidence: "high", warnings: [] })),
});

const ONE_ACTIVE_CASE = {
  id: 1,
  caseNumber: "C-1",
  title: "قضية تجريبية",
  caseType: "labor",
  status: "open",
  assignedLawyerId: null,
  nextHearing: null,
  updatedAt: new Date(),
};

describe("AdminAIIntelligenceService", () => {
  it("getSummary reports needsRefresh when no snapshot exists", async () => {
    const { db } = makeFakeDb([[], []]); // snapshot=[], profiles=[]
    const ai = healthyAi();
    const service = new AdminAIIntelligenceService(db, ai as any);

    const summary = await service.getSummary(7);

    expect(summary.needsRefresh).toBe(true);
    expect(summary.riskCases).toEqual([]);
    expect(summary.aiHealth.ready).toBe(true);
  });

  it("refreshCaseProfile persists the microservice result and writes an audit row", async () => {
    // order: settings, cases, workload, unverified, regUpdate, doc
    const { db, inserted } = makeFakeDb([[], [ONE_ACTIVE_CASE], [], [], [], []]);
    const ai = healthyAi();
    const service = new AdminAIIntelligenceService(db, ai as any);

    const row = await service.refreshCaseProfile(7, 1, "actor-1");

    expect(ai.generateCaseRiskProfile).toHaveBeenCalledTimes(1);
    expect(row?.method).toBe("heuristic_risk_v1");
    expect(row?.score).toBe(55);

    const profileInsert = inserted.find((i) => i.values?.method === "heuristic_risk_v1");
    expect(profileInsert).toBeTruthy();
    const audit = inserted.find((i) => i.values?.action === "admin.ai_profile.refresh");
    expect(audit).toBeTruthy();
    expect(audit?.values?.actorUserId).toBe("actor-1");
  });

  it("refreshCaseProfile falls back to a degraded backend score when the microservice fails", async () => {
    const { db, inserted } = makeFakeDb([[], [ONE_ACTIVE_CASE], [], [], [], []]);
    const ai = healthyAi();
    ai.generateCaseRiskProfile = jest.fn(async () => {
      throw new Error("ai down");
    });
    const service = new AdminAIIntelligenceService(db, ai as any);

    const row = await service.refreshCaseProfile(7, 1, "actor-1");

    expect(row?.method).toBe("backend_fallback");
    expect(row?.warnings).toContain("ai_unavailable");
    expect(row?.confidence).toBe("low");
    // unassigned case → fallback fires the unassigned signal.
    expect(row?.signals).toContain("unassigned");
    expect(inserted.find((i) => i.values?.action === "admin.ai_profile.refresh")).toBeTruthy();
  });

  it("refreshCaseProfile returns null when the case is not found", async () => {
    const { db } = makeFakeDb([[], []]); // settings=[], cases=[] → no item
    const ai = healthyAi();
    const service = new AdminAIIntelligenceService(db, ai as any);

    const row = await service.refreshCaseProfile(7, 999, "actor-1");
    expect(row).toBeNull();
  });

  it("refreshOrg writes an org snapshot and audits even with no active cases", async () => {
    // settings, cases(empty→loadSignals returns early), quality, getSummary(snapshot, profiles)
    const { db, inserted } = makeFakeDb([[], [], [], [], []]);
    const ai = healthyAi();
    const service = new AdminAIIntelligenceService(db, ai as any);

    await service.refreshOrg(7, "actor-1");

    const snapshotInsert = inserted.find(
      (i) => i.values && "summary" in i.values && "aggregateRisk" in i.values
    );
    expect(snapshotInsert).toBeTruthy();
    expect(inserted.find((i) => i.values?.action === "admin.ai_org_snapshot.refresh")).toBeTruthy();
  });
});
