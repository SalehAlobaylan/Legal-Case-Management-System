/*
 * AdminAIIntelligenceService
 *
 * - Composes the deterministic command-center signals into persisted per-case
 *   AI risk profiles (`admin_ai_case_profiles`) and a per-org snapshot
 *   (`admin_ai_org_snapshots`), read by the admin "AI Intelligence" tab.
 * - Scoring authority is the AI microservice (`/admin/case-risk-profile`,
 *   `/admin/org-intelligence-summary`). If it is unreachable, a minimal
 *   degraded backend fallback keeps the dashboard working
 *   (`method=backend_fallback`, `warnings=["ai_unavailable"]`).
 * - Refresh is synchronous and bounded (MAX_CASES_PER_REFRESH), matching the
 *   codebase's "AI enrichment runs in the request, not a worker" choice.
 */

import { and, count, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../db/connection";
import { cases, CLOSED_STATUSES } from "../db/schema/cases";
import { users } from "../db/schema/users";
import { caseRegulationLinks } from "../db/schema/case-regulation-links";
import { regulationVersions } from "../db/schema/regulation-versions";
import { documentExtractions } from "../db/schema/document-extractions";
import { adminDashboardSettings } from "../db/schema/admin-dashboard-settings";
import { aiEvaluationRuns } from "../db/schema/ai-evaluation-runs";
import {
  adminAiCaseProfiles,
  type AdminAiCaseEvidence,
  type AdminAiRecommendedAction,
  type NewAdminAiCaseProfileRow,
} from "../db/schema/admin-ai-case-profiles";
import { adminAiOrgSnapshots } from "../db/schema/admin-ai-org-snapshots";
import {
  AIClientService,
  type CaseRiskSignalInput,
} from "./ai-client.service";
import { AuditLogService } from "./audit-log.service";

const MAX_CASES_PER_REFRESH = 300;
const RECENT_REG_UPDATE_DAYS = 7;

interface AssembledCase {
  caseId: number;
  caseNumber: string;
  title: string;
  caseType: string;
  status: string;
  assignedLawyerId: string | null;
  signals: CaseRiskSignalInput;
}

interface AiHealth {
  ready: boolean;
  warmingUp: boolean;
  fallbackActive: boolean;
  message: string | null;
}

export interface AdminAICaseProfile {
  caseId: number;
  caseNumber: string;
  title: string;
  caseType: string;
  status: string;
  score: number;
  urgency: string;
  confidence: string;
  signals: string[];
  evidence: AdminAiCaseEvidence[];
  recommendedActions: AdminAiRecommendedAction[];
  rationale: string | null;
  method: string | null;
  generatedAt: string;
  assignedLawyer: { id: string; fullName: string | null; email: string } | null;
}

export interface AdminAIReviewQueueItem {
  caseId: number;
  caseNumber: string;
  title: string;
  unverifiedLinks: number;
  score: number;
  urgency: string;
}

export interface AdminAICaseRef {
  caseId: number;
  caseNumber: string;
  title: string;
  detail: string | null;
}

export interface AdminAIQualitySummary {
  hasRun: boolean;
  latest: Record<string, unknown> | null;
  previous: Record<string, unknown> | null;
  trend: { recallAt5: number | null; precisionAt5: number | null; ndcgAt5: number | null } | null;
  generatedAt: string | null;
}

export interface AdminAIIntelligenceSummary {
  generatedAt: string | null;
  needsRefresh: boolean;
  aiHealth: AiHealth;
  summary: { headline: string; bullets: string[] };
  aggregateRisk: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
    averageScore: number;
  };
  workload: {
    overloadedLawyers: number;
    unassignedCases: number;
    documentRiskCases: number;
    regulationImpactCases: number;
  };
  riskCases: AdminAICaseProfile[];
  reviewQueue: AdminAIReviewQueueItem[];
  documentIntelligence: AdminAICaseRef[];
  regulationImpact: AdminAICaseRef[];
  quality: AdminAIQualitySummary | null;
  method: string | null;
  confidence: string;
  warnings: string[];
}

export class AdminAIIntelligenceService {
  constructor(
    private database: Database,
    private aiClient: AIClientService = new AIClientService(),
    private logger?: FastifyBaseLogger
  ) {}

  // ── Signal assembly (reuses the command-center query shapes) ────────────────

  private async getSettings(orgId: number) {
    const [row] = await this.database
      .select()
      .from(adminDashboardSettings)
      .where(eq(adminDashboardSettings.organizationId, orgId))
      .limit(1);
    return {
      staleCaseDays: row?.staleCaseDays ?? 30,
      workloadHighOpenCases: row?.workloadHighOpenCases ?? 12,
    };
  }

  private async getHealth(): Promise<AiHealth> {
    try {
      const raw = await this.aiClient.getEmbeddingsHealth();
      return {
        ready: !raw.warming_up,
        warmingUp: Boolean(raw.warming_up),
        fallbackActive: Boolean(raw.fallback_active),
        message: raw.warming_up
          ? "AI assistant is warming up."
          : raw.fallback_active
            ? "AI assistant is using the backup service."
            : null,
      };
    } catch {
      return {
        ready: false,
        warmingUp: false,
        fallbackActive: false,
        message: "AI assistant status unavailable.",
      };
    }
  }

  /**
   * Load per-case signals for an org. When `caseId` is given, scopes to that one
   * case (which may even be closed); otherwise loads all active cases (capped).
   */
  private async loadSignals(
    orgId: number,
    settings: { staleCaseDays: number; workloadHighOpenCases: number },
    caseId?: number
  ): Promise<AssembledCase[]> {
    const now = Date.now();
    const staleMs = settings.staleCaseDays * 86_400_000;
    const recentRegSince = new Date(now - RECENT_REG_UPDATE_DAYS * 86_400_000);

    const caseWhere = caseId
      ? and(eq(cases.organizationId, orgId), eq(cases.id, caseId))
      : and(eq(cases.organizationId, orgId), notInArray(cases.status, CLOSED_STATUSES));

    const caseRows = await this.database
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        title: cases.title,
        caseType: cases.caseType,
        status: cases.status,
        assignedLawyerId: cases.assignedLawyerId,
        nextHearing: cases.nextHearing,
        updatedAt: cases.updatedAt,
      })
      .from(cases)
      .where(caseWhere)
      .orderBy(desc(cases.updatedAt))
      .limit(caseId ? 1 : MAX_CASES_PER_REFRESH);

    if (!caseRows.length) return [];
    const caseIds = caseRows.map((c) => c.id);

    // Per-lawyer open workload → set of overloaded lawyers.
    const workload = await this.database
      .select({
        lawyerId: users.id,
        openCases: sql<number>`COUNT(${cases.id}) FILTER (WHERE ${notInArray(cases.status, CLOSED_STATUSES)})`,
      })
      .from(users)
      .leftJoin(
        cases,
        and(eq(cases.assignedLawyerId, users.id), eq(cases.organizationId, orgId))
      )
      .where(eq(users.organizationId, orgId))
      .groupBy(users.id);
    const overloaded = new Set(
      workload
        .filter((w) => Number(w.openCases ?? 0) >= settings.workloadHighOpenCases)
        .map((w) => w.lawyerId)
    );

    // Unverified AI links per case (org-scoped via join to cases).
    const unverifiedRows = await this.database
      .select({ caseId: caseRegulationLinks.caseId, c: count() })
      .from(caseRegulationLinks)
      .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(caseRegulationLinks.verified, false),
          inArray(caseRegulationLinks.caseId, caseIds)
        )
      )
      .groupBy(caseRegulationLinks.caseId);
    const unverifiedByCase = new Map(unverifiedRows.map((r) => [r.caseId, Number(r.c ?? 0)]));

    // Cases touched by a regulation version fetched in the last 7 days.
    const regUpdateRows = await this.database
      .select({ caseId: caseRegulationLinks.caseId })
      .from(regulationVersions)
      .innerJoin(
        caseRegulationLinks,
        eq(caseRegulationLinks.regulationId, regulationVersions.regulationId)
      )
      .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
      .where(
        and(
          eq(cases.organizationId, orgId),
          gt(regulationVersions.fetchedAt, recentRegSince),
          inArray(caseRegulationLinks.caseId, caseIds)
        )
      )
      .groupBy(caseRegulationLinks.caseId);
    const regUpdateSet = new Set(regUpdateRows.map((r) => r.caseId));

    // Document extraction state per case.
    const docRows = await this.database
      .select({
        caseId: documentExtractions.caseId,
        total: count(),
        failed: sql<number>`COUNT(*) FILTER (WHERE ${documentExtractions.status} = 'failed' OR ${documentExtractions.insightsStatus} = 'failed')`,
      })
      .from(documentExtractions)
      .where(
        and(
          eq(documentExtractions.organizationId, orgId),
          inArray(documentExtractions.caseId, caseIds)
        )
      )
      .groupBy(documentExtractions.caseId);
    const docByCase = new Map(
      docRows.map((r) => [r.caseId, { total: Number(r.total ?? 0), failed: Number(r.failed ?? 0) }])
    );

    return caseRows.map((c) => {
      const hearing = c.nextHearing ? new Date(c.nextHearing as unknown as string) : null;
      const overdue = hearing ? hearing.getTime() < startOfDay(now) : false;
      const hearingThisWeek = hearing ? isWithinThisWeek(hearing.getTime(), now) : false;
      const daysOverdue = overdue && hearing ? Math.max(0, Math.round((startOfDay(now) - hearing.getTime()) / 86_400_000)) : 0;

      const updatedAtMs = new Date(c.updatedAt as unknown as string).getTime();
      const stale = now - updatedAtMs > staleMs;
      const daysStale = Math.max(0, Math.round((now - updatedAtMs) / 86_400_000));

      const doc = docByCase.get(c.id) ?? { total: 0, failed: 0 };

      const signals: CaseRiskSignalInput = {
        overdueHearing: overdue,
        daysOverdue,
        hearingThisWeek: hearingThisWeek && !overdue,
        stale,
        daysStale,
        staleThresholdDays: settings.staleCaseDays,
        unassigned: c.assignedLawyerId === null,
        unverifiedLinks: unverifiedByCase.get(c.id) ?? 0,
        recentRegulationUpdate: regUpdateSet.has(c.id),
        documentRisk: false,
        failedExtraction: doc.failed > 0,
        lawyerOverloaded: c.assignedLawyerId ? overloaded.has(c.assignedLawyerId) : false,
        hasActivity: !stale,
        hasDocuments: doc.total > 0,
      };

      return {
        caseId: c.id,
        caseNumber: c.caseNumber,
        title: c.title,
        caseType: c.caseType,
        status: c.status,
        assignedLawyerId: c.assignedLawyerId,
        signals,
      };
    });
  }

  // ── Scoring (microservice authoritative, backend degraded fallback) ─────────

  private async scoreCase(
    orgId: number,
    item: AssembledCase,
    aiHealthy: boolean
  ): Promise<NewAdminAiCaseProfileRow> {
    try {
      const ms = await this.aiClient.generateCaseRiskProfile({
        caseId: item.caseId,
        caseNumber: item.caseNumber,
        title: item.title,
        caseType: item.caseType,
        signals: item.signals,
        aiHealthy,
        languageCode: "ar",
      });
      return {
        organizationId: orgId,
        caseId: item.caseId,
        score: ms.score,
        urgency: ms.urgency,
        confidence: ms.confidence,
        signals: ms.signals ?? [],
        evidence: (ms.evidence ?? []) as AdminAiCaseEvidence[],
        recommendedActions: (ms.recommended_actions ?? []) as AdminAiRecommendedAction[],
        rationale: ms.rationale ?? null,
        method: ms.method,
        modelMeta: { source: "microservice" },
        warnings: ms.warnings ?? [],
        generatedAt: new Date(),
      };
    } catch (err) {
      this.logger?.warn(
        { err, caseId: item.caseId },
        "case risk profile via microservice failed; using backend fallback"
      );
      return this.computeFallbackProfile(orgId, item);
    }
  }

  /** Minimal degraded scorer used only when the microservice is unreachable. */
  private computeFallbackProfile(orgId: number, item: AssembledCase): NewAdminAiCaseProfileRow {
    const s = item.signals;
    const evidence: AdminAiCaseEvidence[] = [];
    const fired: string[] = [];
    let score = 0;

    if (s.overdueHearing) {
      score += 40;
      fired.push("overdue_hearing");
      evidence.push({ signal: "overdue_hearing", label: "جلسة متأخرة", severity: "critical", contribution: 40, detail: null });
    }
    if (s.unassigned) {
      score += 20;
      fired.push("unassigned");
      evidence.push({ signal: "unassigned", label: "قضية غير مُسندة", severity: "high", contribution: 20, detail: null });
    }
    if (s.stale) {
      score += 15;
      fired.push("stale");
      evidence.push({ signal: "stale", label: "بحاجة إلى تحديث", severity: "medium", contribution: 15, detail: null });
    }
    if ((s.unverifiedLinks ?? 0) > 0) {
      const c = Math.min(15, (s.unverifiedLinks ?? 0) * 3);
      score += c;
      fired.push("unverified_links");
      evidence.push({ signal: "unverified_links", label: "روابط أنظمة غير مُراجَعة", severity: "medium", contribution: c, detail: null });
    }

    score = Math.min(100, score);
    const urgency =
      score >= 70 ? "critical" : score >= 45 ? "high" : s.overdueHearing ? "high" : score >= 20 ? "medium" : "low";

    return {
      organizationId: orgId,
      caseId: item.caseId,
      score,
      urgency,
      confidence: "low",
      signals: fired,
      evidence,
      recommendedActions: [],
      rationale: null,
      method: "backend_fallback",
      modelMeta: { source: "backend_fallback" },
      warnings: ["ai_unavailable"],
      generatedAt: new Date(),
    };
  }

  private async upsertProfile(row: NewAdminAiCaseProfileRow) {
    await this.database
      .insert(adminAiCaseProfiles)
      .values(row)
      .onConflictDoUpdate({
        target: [adminAiCaseProfiles.organizationId, adminAiCaseProfiles.caseId],
        set: {
          score: row.score,
          urgency: row.urgency,
          confidence: row.confidence,
          signals: row.signals,
          evidence: row.evidence,
          recommendedActions: row.recommendedActions,
          rationale: row.rationale,
          method: row.method,
          modelMeta: row.modelMeta,
          warnings: row.warnings,
          generatedAt: row.generatedAt,
          updatedAt: new Date(),
        },
      });
  }

  // ── Public: refresh a single case ───────────────────────────────────────────

  async refreshCaseProfile(orgId: number, caseId: number, actorUserId: string) {
    const settings = await this.getSettings(orgId);
    const [item] = await this.loadSignals(orgId, settings, caseId);
    if (!item) {
      return null;
    }
    const health = await this.getHealth();
    const row = await this.scoreCase(orgId, item, health.ready);
    await this.upsertProfile(row);

    await new AuditLogService(this.database, this.logger).log({
      organizationId: orgId,
      actorUserId,
      action: "admin.ai_profile.refresh",
      targetType: "case",
      targetId: caseId,
      payload: { score: row.score, urgency: row.urgency, method: row.method },
    });

    return row;
  }

  // ── Public: refresh the whole org ────────────────────────────────────────────

  async refreshOrg(orgId: number, actorUserId: string): Promise<AdminAIIntelligenceSummary> {
    const settings = await this.getSettings(orgId);
    const health = await this.getHealth();
    const items = await this.loadSignals(orgId, settings);

    const profiles: NewAdminAiCaseProfileRow[] = [];
    for (const item of items) {
      profiles.push(await this.scoreCase(orgId, item, health.ready));
    }

    // Persist: upsert each active profile, then drop profiles for cases no
    // longer active so the table reflects the current active set.
    for (const row of profiles) {
      await this.upsertProfile(row);
    }
    const activeIds = items.map((i) => i.caseId);
    if (activeIds.length) {
      await this.database
        .delete(adminAiCaseProfiles)
        .where(
          and(
            eq(adminAiCaseProfiles.organizationId, orgId),
            notInArray(adminAiCaseProfiles.caseId, activeIds)
          )
        );
    } else {
      await this.database
        .delete(adminAiCaseProfiles)
        .where(eq(adminAiCaseProfiles.organizationId, orgId));
    }

    // Aggregate counts.
    const urgencyCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    let scoreSum = 0;
    for (const p of profiles) {
      urgencyCounts[(p.urgency as keyof typeof urgencyCounts)] ??= 0;
      urgencyCounts[p.urgency as keyof typeof urgencyCounts] += 1;
      scoreSum += p.score ?? 0;
    }
    const total = profiles.length;
    const averageScore = total ? Number((scoreSum / total).toFixed(1)) : 0;

    const overloadedLawyers = new Set(
      items.filter((i) => i.signals.lawyerOverloaded).map((i) => i.assignedLawyerId)
    ).size;
    const unassignedCases = items.filter((i) => i.signals.unassigned).length;
    const documentRiskCases = items.filter((i) => i.signals.failedExtraction).length;
    const regulationImpactCases = items.filter((i) => i.signals.recentRegulationUpdate).length;

    // Top cases by score for the executive summary input.
    const byScore = [...profiles].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const itemById = new Map(items.map((i) => [i.caseId, i]));
    const topCases = byScore.slice(0, 5).map((p) => {
      const info = itemById.get(p.caseId);
      return {
        caseId: p.caseId,
        caseNumber: info?.caseNumber ?? null,
        title: info?.title ?? null,
        score: p.score ?? 0,
        urgency: p.urgency ?? "low",
        topReason: (p.evidence as AdminAiCaseEvidence[])[0]?.label ?? null,
      };
    });

    // Executive summary (microservice, deterministic fallback on failure).
    let headline: string;
    let bullets: string[];
    let summaryMethod: string;
    let summaryConfidence: string;
    const warnings: string[] = [];
    try {
      const resp = await this.aiClient.generateOrgIntelligenceSummary({
        organizationId: orgId,
        totalActiveCases: total,
        urgencyCounts,
        averageScore,
        topCases,
        overloadedLawyers,
        unassignedCases,
        documentRiskCases,
        regulationImpactCases,
        aiHealthy: health.ready,
        languageCode: "ar",
      });
      headline = resp.headline;
      bullets = resp.bullets;
      summaryMethod = resp.method;
      summaryConfidence = resp.confidence;
      warnings.push(...(resp.warnings ?? []));
    } catch (err) {
      this.logger?.warn({ err, orgId }, "org intelligence summary via microservice failed; using backend fallback");
      const priority = urgencyCounts.critical + urgencyCounts.high;
      headline = priority
        ? `${total} قضية نشطة، ${priority} منها بحاجة إلى متابعة.`
        : `${total} قضية نشطة، والوضع مستقر حاليًا.`;
      bullets = [];
      if (urgencyCounts.critical) bullets.push(`${urgencyCounts.critical} قضية ذات أولوية للمتابعة أولًا.`);
      if (unassignedCases) bullets.push(`${unassignedCases} قضية بحاجة إلى إسناد محامٍ.`);
      if (!bullets.length) bullets.push("وضع المنظمة مستقر حاليًا.");
      summaryMethod = "backend_fallback";
      summaryConfidence = "low";
      warnings.push("ai_unavailable");
    }

    // Review ordering via the microservice (deterministic). Stored as a hint.
    const reviewInput = items
      .filter((i) => (i.signals.unverifiedLinks ?? 0) > 0)
      .map((i) => ({
        caseId: i.caseId,
        caseNumber: i.caseNumber,
        title: i.title,
        unverifiedLinks: i.signals.unverifiedLinks ?? 0,
        recentRegulationUpdate: i.signals.recentRegulationUpdate,
        caseRiskScore: byScore.find((p) => p.caseId === i.caseId)?.score ?? 0,
      }));
    let reviewOrder: number[] = reviewInput.map((r) => r.caseId);
    try {
      if (reviewInput.length) {
        const resp = await this.aiClient.prioritizeReview(reviewInput);
        reviewOrder = resp.items.map((it) => it.case_id);
      }
    } catch (err) {
      this.logger?.warn({ err, orgId }, "review prioritization via microservice failed; using unordered queue");
    }

    const quality = await this.loadQuality(orgId);

    // Persist snapshot (one per org, upserted).
    await this.database
      .insert(adminAiOrgSnapshots)
      .values({
        organizationId: orgId,
        summary: { headline, bullets },
        aggregateRisk: { ...urgencyCounts, total, averageScore, reviewOrder },
        workloadSignals: { overloadedLawyers, unassignedCases, documentRiskCases, regulationImpactCases },
        qualityMetrics: quality as unknown as Record<string, unknown>,
        method: summaryMethod,
        confidence: summaryConfidence,
        warnings,
        generatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: adminAiOrgSnapshots.organizationId,
        set: {
          summary: { headline, bullets },
          aggregateRisk: { ...urgencyCounts, total, averageScore, reviewOrder },
          workloadSignals: { overloadedLawyers, unassignedCases, documentRiskCases, regulationImpactCases },
          qualityMetrics: quality as unknown as Record<string, unknown>,
          method: summaryMethod,
          confidence: summaryConfidence,
          warnings,
          generatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await new AuditLogService(this.database, this.logger).log({
      organizationId: orgId,
      actorUserId,
      action: "admin.ai_org_snapshot.refresh",
      targetType: "organization",
      targetId: orgId,
      payload: { total, critical: urgencyCounts.critical, method: summaryMethod },
    });

    return this.getSummary(orgId);
  }

  // ── Quality (reuse AI evaluation runs) ──────────────────────────────────────

  private async loadQuality(orgId: number): Promise<AdminAIQualitySummary> {
    const runs = await this.database
      .select({ summaryJson: aiEvaluationRuns.summaryJson, finishedAt: aiEvaluationRuns.finishedAt })
      .from(aiEvaluationRuns)
      .where(and(eq(aiEvaluationRuns.organizationId, orgId), eq(aiEvaluationRuns.status, "completed")))
      .orderBy(desc(aiEvaluationRuns.createdAt))
      .limit(2);

    if (!runs.length) {
      return { hasRun: false, latest: null, previous: null, trend: null, generatedAt: null };
    }

    const latest = (runs[0]?.summaryJson as Record<string, unknown>) ?? null;
    const previous = (runs[1]?.summaryJson as Record<string, unknown>) ?? null;
    const diff = (key: string) => {
      const a = Number(latest?.[key]);
      const b = Number(previous?.[key]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return Number((a - b).toFixed(4));
    };
    const trend = previous
      ? { recallAt5: diff("recallAt5"), precisionAt5: diff("precisionAt5"), ndcgAt5: diff("ndcgAt5") }
      : null;

    return {
      hasRun: true,
      latest,
      previous,
      trend,
      generatedAt: runs[0]?.finishedAt ? new Date(runs[0].finishedAt as unknown as string).toISOString() : null,
    };
  }

  // ── Public: read the assembled summary ───────────────────────────────────────

  async getSummary(orgId: number): Promise<AdminAIIntelligenceSummary> {
    const health = await this.getHealth();

    const [snapshot] = await this.database
      .select()
      .from(adminAiOrgSnapshots)
      .where(eq(adminAiOrgSnapshots.organizationId, orgId))
      .limit(1);

    const profileRows = await this.database
      .select({
        caseId: adminAiCaseProfiles.caseId,
        score: adminAiCaseProfiles.score,
        urgency: adminAiCaseProfiles.urgency,
        confidence: adminAiCaseProfiles.confidence,
        signals: adminAiCaseProfiles.signals,
        evidence: adminAiCaseProfiles.evidence,
        recommendedActions: adminAiCaseProfiles.recommendedActions,
        rationale: adminAiCaseProfiles.rationale,
        method: adminAiCaseProfiles.method,
        generatedAt: adminAiCaseProfiles.generatedAt,
        caseNumber: cases.caseNumber,
        title: cases.title,
        caseType: cases.caseType,
        status: cases.status,
        lawyerId: users.id,
        lawyerName: users.fullName,
        lawyerEmail: users.email,
      })
      .from(adminAiCaseProfiles)
      .innerJoin(cases, eq(adminAiCaseProfiles.caseId, cases.id))
      .leftJoin(users, eq(cases.assignedLawyerId, users.id))
      .where(eq(adminAiCaseProfiles.organizationId, orgId))
      .orderBy(desc(adminAiCaseProfiles.score));

    const riskCases: AdminAICaseProfile[] = profileRows.map((r) => ({
      caseId: r.caseId,
      caseNumber: r.caseNumber,
      title: r.title,
      caseType: r.caseType,
      status: r.status,
      score: r.score,
      urgency: r.urgency,
      confidence: r.confidence,
      signals: r.signals ?? [],
      evidence: (r.evidence ?? []) as AdminAiCaseEvidence[],
      recommendedActions: (r.recommendedActions ?? []) as AdminAiRecommendedAction[],
      rationale: r.rationale,
      method: r.method,
      generatedAt: new Date(r.generatedAt as unknown as string).toISOString(),
      assignedLawyer: r.lawyerId
        ? { id: r.lawyerId, fullName: r.lawyerName, email: r.lawyerEmail as string }
        : null,
    }));

    // Review queue: cases with the unverified-links signal, ordered by the
    // stored microservice ranking when available, else by score.
    const reviewOrder = ((snapshot?.aggregateRisk as Record<string, unknown>)?.reviewOrder ??
      []) as number[];
    const reviewCandidates = riskCases.filter((c) => c.signals.includes("unverified_links"));
    const orderIndex = new Map(reviewOrder.map((id, i) => [id, i]));
    reviewCandidates.sort((a, b) => {
      const ia = orderIndex.has(a.caseId) ? orderIndex.get(a.caseId)! : Number.MAX_SAFE_INTEGER;
      const ib = orderIndex.has(b.caseId) ? orderIndex.get(b.caseId)! : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return b.score - a.score;
    });
    const reviewQueue: AdminAIReviewQueueItem[] = reviewCandidates.map((c) => ({
      caseId: c.caseId,
      caseNumber: c.caseNumber,
      title: c.title,
      unverifiedLinks: extractUnverifiedCount(c),
      score: c.score,
      urgency: c.urgency,
    }));

    const documentIntelligence: AdminAICaseRef[] = riskCases
      .filter((c) => c.signals.includes("failed_extraction") || c.signals.includes("document_risk"))
      .map((c) => ({
        caseId: c.caseId,
        caseNumber: c.caseNumber,
        title: c.title,
        detail:
          c.evidence.find((e) => e.signal === "failed_extraction" || e.signal === "document_risk")
            ?.detail ?? null,
      }));

    const regulationImpact: AdminAICaseRef[] = riskCases
      .filter((c) => c.signals.includes("recent_regulation_update"))
      .map((c) => ({
        caseId: c.caseId,
        caseNumber: c.caseNumber,
        title: c.title,
        detail:
          c.evidence.find((e) => e.signal === "recent_regulation_update")?.detail ?? null,
      }));

    const aggregate = (snapshot?.aggregateRisk as Record<string, number>) ?? {};
    const workloadSignals = (snapshot?.workloadSignals as Record<string, number>) ?? {};

    return {
      generatedAt: snapshot?.generatedAt
        ? new Date(snapshot.generatedAt as unknown as string).toISOString()
        : null,
      needsRefresh: !snapshot,
      aiHealth: health,
      summary: snapshot?.summary ?? { headline: "", bullets: [] },
      aggregateRisk: {
        critical: Number(aggregate.critical ?? 0),
        high: Number(aggregate.high ?? 0),
        medium: Number(aggregate.medium ?? 0),
        low: Number(aggregate.low ?? 0),
        total: Number(aggregate.total ?? riskCases.length),
        averageScore: Number(aggregate.averageScore ?? 0),
      },
      workload: {
        overloadedLawyers: Number(workloadSignals.overloadedLawyers ?? 0),
        unassignedCases: Number(workloadSignals.unassignedCases ?? 0),
        documentRiskCases: Number(workloadSignals.documentRiskCases ?? 0),
        regulationImpactCases: Number(workloadSignals.regulationImpactCases ?? 0),
      },
      riskCases,
      reviewQueue,
      documentIntelligence,
      regulationImpact,
      quality: (snapshot?.qualityMetrics as unknown as AdminAIQualitySummary) ?? null,
      method: snapshot?.method ?? null,
      confidence: snapshot?.confidence ?? "medium",
      warnings: (snapshot?.warnings as string[]) ?? [],
    };
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isWithinThisWeek(targetMs: number, nowMs: number): boolean {
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const endOfThisWeek = new Date(today);
  endOfThisWeek.setDate(today.getDate() + (7 - today.getDay()));
  endOfThisWeek.setHours(23, 59, 59, 999);
  return targetMs >= today.getTime() && targetMs <= endOfThisWeek.getTime();
}

/** Pull the unverified-link count out of the evidence detail (best effort). */
function extractUnverifiedCount(c: AdminAICaseProfile): number {
  const ev = c.evidence.find((e) => e.signal === "unverified_links");
  if (!ev?.detail) return 0;
  const m = ev.detail.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}
