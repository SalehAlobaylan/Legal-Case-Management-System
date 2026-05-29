/*
 * AI linking evaluation runner
 *
 * - Extracted from routes/ai-evaluation so both the AI-evaluation route
 *   (`POST /api/ai-evaluation/run`) and the admin AI Intelligence route
 *   (`POST /api/admin/ai-intelligence/evaluation/run`) share one implementation.
 * - Creates an `ai_evaluation_runs` row, runs the find-related pipeline against
 *   labeled cases, computes recall@k / precision@k / MRR / nDCG@5, persists
 *   per-case rows, and marks the run completed (or failed, then rethrows).
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  aiEvaluationLabels,
  aiEvaluationRunCases,
  aiEvaluationRuns,
  cases,
  regulationVersions,
  type CaseType,
} from "../db/schema";
import { ValidationError } from "../utils/errors";
import { AIClientService } from "./ai-client.service";
import { RegulationRagService } from "./regulation-rag.service";

export interface RunAiLinkingEvaluationOptions {
  organizationId: number;
  createdBy: string;
  topK?: number;
  caseIds?: number[];
}

function mapCaseTypeToRegulationCategory(caseType: CaseType | null | undefined) {
  switch (caseType) {
    case "labor":
      return "labor_law";
    case "commercial":
      return "commercial_law";
    case "civil":
      return "civil_law";
    case "criminal":
      return "criminal_law";
    case "administrative":
      return "procedural_law";
    default:
      return null;
  }
}

function recallAtK(ranked: number[], relevant: Set<number>, k: number): number {
  if (!relevant.size) return 0;
  const top = ranked.slice(0, k);
  let hits = 0;
  for (const regId of top) {
    if (relevant.has(regId)) hits += 1;
  }
  return hits / relevant.size;
}

function precisionAtK(ranked: number[], relevant: Set<number>, k: number): number {
  const top = ranked.slice(0, k);
  if (!top.length) return 0;
  let hits = 0;
  for (const regId of top) {
    if (relevant.has(regId)) hits += 1;
  }
  return hits / top.length;
}

function reciprocalRank(ranked: number[], relevant: Set<number>): number {
  for (let i = 0; i < ranked.length; i += 1) {
    if (relevant.has(ranked[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function ndcgAt5(ranked: number[], relevant: Set<number>): number {
  const k = 5;
  const top = ranked.slice(0, k);
  let dcg = 0;
  for (let i = 0; i < top.length; i += 1) {
    if (relevant.has(top[i]!)) {
      dcg += 1 / Math.log2(i + 2);
    }
  }

  const idealCount = Math.min(k, relevant.size);
  if (!idealCount) return 0;
  let idcg = 0;
  for (let i = 0; i < idealCount; i += 1) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg > 0 ? dcg / idcg : 0;
}

function stddev(values: number[]): number {
  if (!values.length) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Run the AI linking evaluation for an org. Returns the completed run row.
 * On failure, marks the created run row "failed" and rethrows.
 */
export async function runAiLinkingEvaluation(
  database: Database,
  opts: RunAiLinkingEvaluationOptions
) {
  const topK = opts.topK || 10;

  const [run] = await database
    .insert(aiEvaluationRuns)
    .values({
      organizationId: opts.organizationId,
      createdBy: opts.createdBy,
      status: "running",
      startedAt: new Date(),
      configJson: {
        topK,
        caseIds: opts.caseIds || null,
      },
    })
    .returning();

  try {
    const labels = await database
      .select({ caseId: aiEvaluationLabels.caseId, regulationId: aiEvaluationLabels.regulationId })
      .from(aiEvaluationLabels)
      .where(eq(aiEvaluationLabels.organizationId, opts.organizationId));

    if (!labels.length) {
      throw new ValidationError("No evaluation labels configured");
    }

    const labelsByCase = new Map<number, Set<number>>();
    for (const label of labels) {
      if (!labelsByCase.has(label.caseId)) {
        labelsByCase.set(label.caseId, new Set());
      }
      labelsByCase.get(label.caseId)?.add(label.regulationId);
    }

    const allCaseIds = [...labelsByCase.keys()];
    const selectedCaseIds =
      opts.caseIds && opts.caseIds.length
        ? allCaseIds.filter((id) => opts.caseIds?.includes(id))
        : allCaseIds;

    if (!selectedCaseIds.length) {
      throw new ValidationError("No labeled cases selected");
    }

    const caseRows = await database
      .select({
        id: cases.id,
        title: cases.title,
        description: cases.description,
        caseType: cases.caseType,
        status: cases.status,
        courtJurisdiction: cases.courtJurisdiction,
        clientInfo: cases.clientInfo,
      })
      .from(cases)
      .where(and(eq(cases.organizationId, opts.organizationId), inArray(cases.id, selectedCaseIds)));

    const aiService = new AIClientService();
    const ragService = new RegulationRagService(database, aiService);

    const regulationRows = await database.query.regulations.findMany({
      columns: { id: true, title: true, category: true, summary: true },
    });
    const versionRows = await database.query.regulationVersions.findMany({
      columns: {
        id: true,
        regulationId: true,
        versionNumber: true,
        content: true,
      },
      orderBy: [desc(regulationVersions.versionNumber)],
    });

    const latestVersionByRegulationId = new Map<number, (typeof versionRows)[number]>();
    for (const row of versionRows) {
      if (!latestVersionByRegulationId.has(row.regulationId)) {
        latestVersionByRegulationId.set(row.regulationId, row);
      }
    }

    let metricsCount = 0;
    let sumRecall1 = 0;
    let sumRecall3 = 0;
    let sumRecall5 = 0;
    let sumPrecision1 = 0;
    let sumPrecision3 = 0;
    let sumPrecision5 = 0;
    let sumMrr = 0;
    let sumNdcg5 = 0;
    let sumStddev = 0;

    for (const caseRow of caseRows) {
      const caseText = `${caseRow.title}\n\n${caseRow.description || ""}`.trim();
      const chunkRetrieval = await ragService.retrieveTopCandidateChunks({
        queryText: caseText,
        topK: 250,
        perRegulationLimit: 4,
      });

      const preferredCategory = mapCaseTypeToRegulationCategory(caseRow.caseType as CaseType);
      const indexed: any[] = [];
      const fallback: any[] = [];
      for (const regulation of regulationRows) {
        const latest = latestVersionByRegulationId.get(regulation.id);
        const chunks = latest
          ? chunkRetrieval.byRegulationVersionId.get(latest.id) || []
          : [];
        const candidate = {
          id: regulation.id,
          title: regulation.title,
          category: regulation.category,
          regulation_version_id: latest?.id || null,
          content_text:
            latest?.content?.slice(0, 12000) || regulation.summary || regulation.title,
          candidate_chunks: chunks.map((chunk) => ({
            chunk_id: chunk.chunkId,
            chunk_index: chunk.chunkIndex,
            line_start: chunk.lineStart,
            line_end: chunk.lineEnd,
            article_ref: chunk.articleRef,
            text: chunk.text,
          })),
        };
        if (candidate.candidate_chunks.length) {
          indexed.push(candidate);
        } else if (!preferredCategory || regulation.category === preferredCategory) {
          fallback.push(candidate);
        }
      }

      const candidates = [...indexed.slice(0, 50), ...fallback.slice(0, 10)];
      if (!candidates.length) continue;

      const result = await aiService.findRelatedRegulations(caseText, candidates, {
        topK,
        threshold: 0.3,
        caseFragments: [{ fragment_id: "case:primary", text: caseText, source: "case" }],
        caseProfile: {
          case_id: caseRow.id,
          title: caseRow.title,
          description: caseRow.description,
          case_type: caseRow.caseType,
          status: caseRow.status,
          court_jurisdiction: caseRow.courtJurisdiction,
          client_info: caseRow.clientInfo,
        },
        strictMode: true,
      });

      const rankedIds = (result.related_regulations || []).map((item) => item.regulation_id);
      const rankedScores = (result.related_regulations || []).map((item) =>
        Number(item.similarity_score || 0)
      );
      const relevant = labelsByCase.get(caseRow.id) || new Set<number>();

      const metrics = {
        recallAt1: recallAtK(rankedIds, relevant, 1),
        recallAt3: recallAtK(rankedIds, relevant, 3),
        recallAt5: recallAtK(rankedIds, relevant, 5),
        precisionAt1: precisionAtK(rankedIds, relevant, 1),
        precisionAt3: precisionAtK(rankedIds, relevant, 3),
        precisionAt5: precisionAtK(rankedIds, relevant, 5),
        reciprocalRank: reciprocalRank(rankedIds, relevant),
        ndcgAt5: ndcgAt5(rankedIds, relevant),
        top5ScoreStddev: stddev(rankedScores.slice(0, 5)),
      };

      await database.insert(aiEvaluationRunCases).values({
        runId: run.id,
        caseId: caseRow.id,
        totalRelevant: relevant.size,
        recallAt1: metrics.recallAt1,
        recallAt3: metrics.recallAt3,
        recallAt5: metrics.recallAt5,
        precisionAt1: metrics.precisionAt1,
        precisionAt3: metrics.precisionAt3,
        precisionAt5: metrics.precisionAt5,
        reciprocalRank: metrics.reciprocalRank,
        ndcgAt5: metrics.ndcgAt5,
        top5ScoreStddev: metrics.top5ScoreStddev,
        diagnosticsJson: {
          rankedRegulationIds: rankedIds,
          rankedScores,
          relevantRegulationIds: [...relevant],
          pipeline: result.pipeline || null,
          pipelineWarnings: result.pipeline_warnings || [],
        },
      });

      metricsCount += 1;
      sumRecall1 += metrics.recallAt1;
      sumRecall3 += metrics.recallAt3;
      sumRecall5 += metrics.recallAt5;
      sumPrecision1 += metrics.precisionAt1;
      sumPrecision3 += metrics.precisionAt3;
      sumPrecision5 += metrics.precisionAt5;
      sumMrr += metrics.reciprocalRank;
      sumNdcg5 += metrics.ndcgAt5;
      sumStddev += metrics.top5ScoreStddev;
    }

    const denominator = Math.max(1, metricsCount);
    const summary = {
      cases: metricsCount,
      recallAt1: Number((sumRecall1 / denominator).toFixed(4)),
      recallAt3: Number((sumRecall3 / denominator).toFixed(4)),
      recallAt5: Number((sumRecall5 / denominator).toFixed(4)),
      precisionAt1: Number((sumPrecision1 / denominator).toFixed(4)),
      precisionAt3: Number((sumPrecision3 / denominator).toFixed(4)),
      precisionAt5: Number((sumPrecision5 / denominator).toFixed(4)),
      mrr: Number((sumMrr / denominator).toFixed(4)),
      ndcgAt5: Number((sumNdcg5 / denominator).toFixed(4)),
      top5ScoreStddev: Number((sumStddev / denominator).toFixed(4)),
    };

    await database
      .update(aiEvaluationRuns)
      .set({
        status: "completed",
        summaryJson: summary,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiEvaluationRuns.id, run.id));

    const [updatedRun] = await database
      .select()
      .from(aiEvaluationRuns)
      .where(eq(aiEvaluationRuns.id, run.id))
      .limit(1);

    return updatedRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : "evaluation_failed";
    await database
      .update(aiEvaluationRuns)
      .set({
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiEvaluationRuns.id, run.id));
    throw error;
  }
}
