import { desc, eq, inArray } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { env } from "../config/env";
import { db } from "../db/connection";
import {
  caseRegulationLinks,
  cases,
  regulations,
  regulationVersions,
  type CaseType,
} from "../db/schema";
import type {
  SimilarityMatch,
  SimilarityRegulationCandidate,
} from "../services/ai-client.service";
import { AIClientService } from "../services/ai-client.service";
import { RegulationRagService } from "../services/regulation-rag.service";
import { logger } from "../utils/logger";

type SampleRow = {
  caseId: number;
  regulationId: number;
  label: 0 | 1;
  semanticMax: number;
  supportCoverage: number;
  lexicalOverlap: number;
  categoryPrior: number;
  hasCaseSupport: boolean;
  strongSupportCount: number;
};

type EvaluationMetrics = {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  caseHitRate: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
};

type ScoringProfile = {
  semanticWeight: number;
  supportWeight: number;
  lexicalWeight: number;
  categoryWeight: number;
  strictMinFinalScore: number;
  strictMinSupportingMatches: number;
  requireCaseSupport: boolean;
};

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

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

function parseArg(name: string, fallback: number): number {
  const prefixed = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefixed));
  if (!arg) {
    return fallback;
  }
  const value = Number.parseInt(arg.slice(prefixed.length), 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseArgFloat(name: string, fallback: number): number {
  const prefixed = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefixed));
  if (!arg) {
    return fallback;
  }
  const value = Number.parseFloat(arg.slice(prefixed.length));
  return Number.isFinite(value) ? value : fallback;
}

function parseArgString(name: string, fallback: string): string {
  const prefixed = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefixed));
  if (!arg) {
    return fallback;
  }
  return arg.slice(prefixed.length) || fallback;
}

function normalizeWeights(profile: Pick<
  ScoringProfile,
  "semanticWeight" | "supportWeight" | "lexicalWeight" | "categoryWeight"
>) {
  const sum =
    profile.semanticWeight +
    profile.supportWeight +
    profile.lexicalWeight +
    profile.categoryWeight;
  if (sum <= 0) {
    return {
      semanticWeight: 0.55,
      supportWeight: 0.2,
      lexicalWeight: 0.15,
      categoryWeight: 0.1,
    };
  }
  return {
    semanticWeight: profile.semanticWeight / sum,
    supportWeight: profile.supportWeight / sum,
    lexicalWeight: profile.lexicalWeight / sum,
    categoryWeight: profile.categoryWeight / sum,
  };
}

function evaluateProfile(
  rows: SampleRow[],
  positivesByCase: Map<number, Set<number>>,
  profile: ScoringProfile
): EvaluationMetrics {
  const weights = normalizeWeights(profile);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  const positiveHitByCase = new Map<number, boolean>();
  for (const caseId of positivesByCase.keys()) {
    positiveHitByCase.set(caseId, false);
  }

  for (const row of rows) {
    const score =
      weights.semanticWeight * row.semanticMax +
      weights.supportWeight * row.supportCoverage +
      weights.lexicalWeight * row.lexicalOverlap +
      weights.categoryWeight * row.categoryPrior;

    const predictedPositive =
      score >= profile.strictMinFinalScore &&
      row.strongSupportCount >= profile.strictMinSupportingMatches &&
      (!profile.requireCaseSupport || row.hasCaseSupport);

    if (predictedPositive && row.label === 1) {
      tp += 1;
      positiveHitByCase.set(row.caseId, true);
    } else if (predictedPositive && row.label === 0) {
      fp += 1;
    } else if (!predictedPositive && row.label === 1) {
      fn += 1;
    } else {
      tn += 1;
    }
  }

  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);
  const accuracy = (tp + tn) / Math.max(1, tp + fp + fn + tn);

  const caseCount = positivesByCase.size;
  let caseHits = 0;
  for (const hit of positiveHitByCase.values()) {
    if (hit) {
      caseHits += 1;
    }
  }
  const caseHitRate = caseHits / Math.max(1, caseCount);

  return {
    precision,
    recall,
    f1,
    accuracy,
    caseHitRate,
    tp,
    fp,
    fn,
    tn,
  };
}

function buildCandidateProfiles(): ScoringProfile[] {
  const semanticWeights = [0.45, 0.5, 0.55, 0.6, 0.65];
  const supportWeights = [0.15, 0.2, 0.25, 0.3];
  const lexicalWeights = [0.05, 0.1, 0.15, 0.2];
  const categoryWeights = [0.0, 0.05, 0.1, 0.15];
  const strictMinFinals = Array.from({ length: 21 }, (_, idx) =>
    Number((0.45 + idx * 0.02).toFixed(2))
  );
  const strictMinSupporting = [1, 2, 3];

  const candidates: ScoringProfile[] = [];
  for (const semanticWeight of semanticWeights) {
    for (const supportWeight of supportWeights) {
      for (const lexicalWeight of lexicalWeights) {
        for (const categoryWeight of categoryWeights) {
          for (const strictMinFinalScore of strictMinFinals) {
            for (const strictMinSupportingMatches of strictMinSupporting) {
              candidates.push({
                semanticWeight,
                supportWeight,
                lexicalWeight,
                categoryWeight,
                strictMinFinalScore,
                strictMinSupportingMatches,
                requireCaseSupport: true,
              });
            }
          }
        }
      }
    }
  }
  return candidates;
}

function scoreBreakdownFromMatch(match: SimilarityMatch | undefined) {
  return {
    semanticMax: match?.score_breakdown?.semantic_max ?? 0,
    supportCoverage: match?.score_breakdown?.support_coverage ?? 0,
    lexicalOverlap: match?.score_breakdown?.lexical_overlap ?? 0,
    categoryPrior: match?.score_breakdown?.category_prior ?? 0,
    hasCaseSupport: Boolean(match?.score_breakdown?.has_case_support ?? false),
    strongSupportCount: Math.max(
      0,
      Number(match?.score_breakdown?.strong_support_count ?? 0)
    ),
  };
}

async function run() {
  const maxCases = parseArg("--max-cases", 40);
  const negativesPerCase = parseArg("--negatives-per-case", 15);
  const minRecallTarget = parseArgFloat("--min-recall", 0.35);
  const seed = parseArg("--seed", 42);
  const outPathArg = parseArgString(
    "--out",
    "./reports/case-link-tuning-report.json"
  );
  const outPath = resolve(outPathArg);

  if (!env.AI_SERVICE_URL) {
    throw new Error("AI_SERVICE_URL is required for scoring calibration");
  }

  const health = await fetch(`${env.AI_SERVICE_URL.replace(/\/+$/, "")}/health/`);
  if (!health.ok) {
    throw new Error(`AI service is not healthy (status=${health.status})`);
  }

  const verifiedRows = await db
    .select({
      caseId: caseRegulationLinks.caseId,
      regulationId: caseRegulationLinks.regulationId,
    })
    .from(caseRegulationLinks)
    .where(eq(caseRegulationLinks.verified, true));

  if (verifiedRows.length === 0) {
    throw new Error(
      "No verified links found. Need verified case-regulation links for calibration."
    );
  }

  const positivesByCase = new Map<number, Set<number>>();
  for (const row of verifiedRows) {
    if (!positivesByCase.has(row.caseId)) {
      positivesByCase.set(row.caseId, new Set());
    }
    positivesByCase.get(row.caseId)?.add(row.regulationId);
  }

  const caseIds = Array.from(positivesByCase.keys());
  const caseRows = await db
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
    .where(inArray(cases.id, caseIds));

  const casesById = new Map(caseRows.map((row) => [row.id, row]));
  const eligibleCaseIds = caseIds.filter((caseId) => casesById.has(caseId));
  if (eligibleCaseIds.length === 0) {
    throw new Error("No eligible cases found for verified links");
  }

  const rng = makeRng(seed);
  shuffleInPlace(eligibleCaseIds, rng);
  const sampledCaseIds = eligibleCaseIds.slice(0, Math.max(1, maxCases));

  const regulationRows = await db.query.regulations.findMany({
    columns: {
      id: true,
      title: true,
      category: true,
      summary: true,
    },
  });
  const regulationsById = new Map(regulationRows.map((row) => [row.id, row]));

  const versionRows = await db.query.regulationVersions.findMany({
    columns: {
      id: true,
      regulationId: true,
      versionNumber: true,
      content: true,
    },
    orderBy: [desc(regulationVersions.versionNumber)],
  });
  const latestVersionByRegulationId = new Map<
    number,
    {
      id: number;
      regulationId: number;
      versionNumber: number;
      content: string;
    }
  >();
  for (const row of versionRows) {
    if (!latestVersionByRegulationId.has(row.regulationId)) {
      latestVersionByRegulationId.set(row.regulationId, row);
    }
  }

  const aiService = new AIClientService();
  const ragService = new RegulationRagService(db, aiService);
  const sampleRows: SampleRow[] = [];

  for (const caseId of sampledCaseIds) {
    const caseRow = casesById.get(caseId);
    if (!caseRow) {
      continue;
    }
    const positives = positivesByCase.get(caseId) ?? new Set<number>();
    if (positives.size === 0) {
      continue;
    }

    const primaryCaseText = `${caseRow.title}\n\n${caseRow.description || ""}`.trim();
    const preferredCategory = mapCaseTypeToRegulationCategory(caseRow.caseType);

    const allNegativeRegs = regulationRows.filter((reg) => !positives.has(reg.id));
    const sameCategory = preferredCategory
      ? allNegativeRegs.filter((reg) => reg.category === preferredCategory)
      : [];
    const otherCategory = allNegativeRegs.filter(
      (reg) => !preferredCategory || reg.category !== preferredCategory
    );
    shuffleInPlace(sameCategory, rng);
    shuffleInPlace(otherCategory, rng);

    const selectedNegativeIds = new Set<number>();
    for (const reg of sameCategory) {
      if (selectedNegativeIds.size >= negativesPerCase) {
        break;
      }
      selectedNegativeIds.add(reg.id);
    }
    for (const reg of otherCategory) {
      if (selectedNegativeIds.size >= negativesPerCase) {
        break;
      }
      selectedNegativeIds.add(reg.id);
    }

    const candidateIds = Array.from(
      new Set([...Array.from(positives.values()), ...Array.from(selectedNegativeIds)])
    );
    if (candidateIds.length === 0) {
      continue;
    }

    const chunkRetrieval = await ragService.retrieveTopCandidateChunks({
      queryText: primaryCaseText,
      topK: Math.max(env.REG_LINK_PREFILTER_TOP_K, candidateIds.length * 3),
      perRegulationLimit: env.REG_LINK_CANDIDATE_CHUNKS_PER_REG,
    });

    const candidates: SimilarityRegulationCandidate[] = [];
    for (const regulationId of candidateIds) {
      const regulation = regulationsById.get(regulationId);
      if (!regulation) {
        continue;
      }
      const latestVersion = latestVersionByRegulationId.get(regulationId);
      const versionChunks =
        latestVersion && chunkRetrieval.byRegulationVersionId.get(latestVersion.id)
          ? chunkRetrieval.byRegulationVersionId.get(latestVersion.id)
          : [];

      candidates.push({
        id: regulation.id,
        title: regulation.title,
        category: regulation.category,
        regulation_version_id: latestVersion?.id || null,
        content_text:
          latestVersion?.content?.slice(0, env.CASE_LINK_DOC_TOTAL_MAX_CHARS) ||
          regulation.summary ||
          regulation.title,
        candidate_chunks: versionChunks?.map((chunk) => ({
          chunk_id: chunk.chunkId,
          chunk_index: chunk.chunkIndex,
          line_start: chunk.lineStart,
          line_end: chunk.lineEnd,
          article_ref: chunk.articleRef,
          text: chunk.text,
        })),
      });
    }

    if (!candidates.length) {
      continue;
    }

    const result = await aiService.findRelatedRegulations(primaryCaseText, candidates, {
      topK: candidates.length,
      threshold: env.CASE_LINK_SUPPORT_FLOOR,
      strictMode: false,
      caseFragments: [
        {
          fragment_id: "case:primary",
          text: primaryCaseText,
          source: "case",
        },
      ],
      caseProfile: {
        case_id: caseRow.id,
        title: caseRow.title,
        description: caseRow.description,
        case_type: caseRow.caseType,
        status: caseRow.status,
        court_jurisdiction: caseRow.courtJurisdiction,
        client_info: caseRow.clientInfo,
      },
      scoringProfile: {
        semantic_weight: env.CASE_LINK_WEIGHT_SEMANTIC,
        support_weight: env.CASE_LINK_WEIGHT_SUPPORT,
        lexical_weight: env.CASE_LINK_WEIGHT_LEXICAL,
        category_weight: env.CASE_LINK_WEIGHT_CATEGORY,
        strict_min_final_score: env.CASE_LINK_MIN_FINAL_SCORE,
        strict_min_pair_score: env.CASE_LINK_MIN_PAIR_SCORE,
        strict_min_supporting_matches: env.CASE_LINK_MIN_SUPPORTING_MATCHES,
        require_case_support: env.CASE_LINK_REQUIRE_CASE_SUPPORT,
      },
    });
    const matches = result.related_regulations || [];
    const matchByRegulationId = new Map(matches.map((match) => [match.regulation_id, match]));

    for (const regulationId of candidateIds) {
      const match = matchByRegulationId.get(regulationId);
      const breakdown = scoreBreakdownFromMatch(match);
      sampleRows.push({
        caseId,
        regulationId,
        label: positives.has(regulationId) ? 1 : 0,
        semanticMax: breakdown.semanticMax,
        supportCoverage: breakdown.supportCoverage,
        lexicalOverlap: breakdown.lexicalOverlap,
        categoryPrior: breakdown.categoryPrior,
        hasCaseSupport: breakdown.hasCaseSupport,
        strongSupportCount: breakdown.strongSupportCount,
      });
    }
  }

  if (!sampleRows.length) {
    throw new Error(
      "No calibration rows produced. Ensure AI service is running and cases have verified links."
    );
  }

  const sampledPositivesByCase = new Map<number, Set<number>>();
  for (const caseId of sampledCaseIds) {
    const positives = positivesByCase.get(caseId);
    if (positives && positives.size > 0) {
      sampledPositivesByCase.set(caseId, positives);
    }
  }

  const baselineProfile: ScoringProfile = {
    semanticWeight: env.CASE_LINK_WEIGHT_SEMANTIC,
    supportWeight: env.CASE_LINK_WEIGHT_SUPPORT,
    lexicalWeight: env.CASE_LINK_WEIGHT_LEXICAL,
    categoryWeight: env.CASE_LINK_WEIGHT_CATEGORY,
    strictMinFinalScore: env.CASE_LINK_MIN_FINAL_SCORE,
    strictMinSupportingMatches: env.CASE_LINK_MIN_SUPPORTING_MATCHES,
    requireCaseSupport: env.CASE_LINK_REQUIRE_CASE_SUPPORT,
  };
  const baselineMetrics = evaluateProfile(
    sampleRows,
    sampledPositivesByCase,
    baselineProfile
  );

  const profiles = buildCandidateProfiles();
  let bestProfile: ScoringProfile | null = null;
  let bestMetrics: EvaluationMetrics | null = null;

  for (const profile of profiles) {
    const metrics = evaluateProfile(sampleRows, sampledPositivesByCase, profile);

    const candidatePassesRecall = metrics.recall >= minRecallTarget;
    const currentPassesRecall =
      (bestMetrics?.recall ?? 0) >= minRecallTarget;

    const shouldReplace =
      !bestMetrics ||
      (candidatePassesRecall && !currentPassesRecall) ||
      (candidatePassesRecall === currentPassesRecall &&
        (metrics.precision > bestMetrics.precision ||
          (metrics.precision === bestMetrics.precision &&
            (metrics.f1 > bestMetrics.f1 ||
              (metrics.f1 === bestMetrics.f1 &&
                metrics.caseHitRate > bestMetrics.caseHitRate)))));

    if (shouldReplace) {
      bestProfile = profile;
      bestMetrics = metrics;
    }
  }

  if (!bestProfile || !bestMetrics) {
    throw new Error("Failed to find a candidate scoring profile");
  }

  const normalizedBestWeights = normalizeWeights(bestProfile);
  const report = {
    generatedAt: new Date().toISOString(),
    sample: {
      rows: sampleRows.length,
      cases: sampledPositivesByCase.size,
      positives: sampleRows.filter((row) => row.label === 1).length,
      negatives: sampleRows.filter((row) => row.label === 0).length,
      maxCases,
      negativesPerCase,
      minRecallTarget,
      seed,
    },
    baseline: {
      profile: baselineProfile,
      metrics: baselineMetrics,
    },
    recommended: {
      profile: {
        ...bestProfile,
        ...normalizedBestWeights,
      },
      metrics: bestMetrics,
      env: {
        CASE_LINK_WEIGHT_SEMANTIC: Number(
          normalizedBestWeights.semanticWeight.toFixed(4)
        ),
        CASE_LINK_WEIGHT_SUPPORT: Number(
          normalizedBestWeights.supportWeight.toFixed(4)
        ),
        CASE_LINK_WEIGHT_LEXICAL: Number(
          normalizedBestWeights.lexicalWeight.toFixed(4)
        ),
        CASE_LINK_WEIGHT_CATEGORY: Number(
          normalizedBestWeights.categoryWeight.toFixed(4)
        ),
        CASE_LINK_MIN_FINAL_SCORE: bestProfile.strictMinFinalScore,
        CASE_LINK_MIN_SUPPORTING_MATCHES: bestProfile.strictMinSupportingMatches,
        CASE_LINK_REQUIRE_CASE_SUPPORT: bestProfile.requireCaseSupport,
      },
    },
    notes: [
      "Run this on production-like verified links for best signal quality.",
      "This calibration optimizes precision while enforcing a minimum recall floor.",
      "CASE_LINK_MIN_PAIR_SCORE remains unchanged; tune it separately if needed.",
    ],
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  logger.info(
    {
      outPath,
      sampleRows: report.sample.rows,
      cases: report.sample.cases,
      baselinePrecision: baselineMetrics.precision,
      tunedPrecision: bestMetrics.precision,
      baselineRecall: baselineMetrics.recall,
      tunedRecall: bestMetrics.recall,
      recommended: report.recommended.env,
    },
    "Case-link scoring calibration completed"
  );

  // Also print directly for easy copy in terminal logs.
  // eslint-disable-next-line no-console
  console.log("\nRecommended env overrides:");
  for (const [key, value] of Object.entries(report.recommended.env)) {
    // eslint-disable-next-line no-console
    console.log(`${key}=${value}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\nDetailed report: ${outPath}`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error({ err: error }, "Case-link scoring calibration failed");
    process.exit(1);
  });
