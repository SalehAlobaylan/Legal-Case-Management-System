import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/connection";
import { env } from "../config/env";
import {
  cases,
  regulationVersions,
  type CaseType,
} from "../db/schema";
import {
  AIClientService,
  type SimilarityMatch,
  type SimilarityRegulationCandidate,
} from "../services/ai-client.service";
import { RegulationRagService } from "../services/regulation-rag.service";

type LabelRow = {
  caseId: number;
  relevantRegulationIds: number[];
};

type RankedCandidate = {
  regulationId: number;
  score: number;
  rank: number;
};

type CaseEvaluation = {
  caseId: number;
  totalRelevant: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  precisionAt1: number;
  precisionAt3: number;
  precisionAt5: number;
  reciprocalRank: number;
  ndcgAt5: number;
  scoreStddevTop5: number;
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

function parseArg(name: string, fallback: string): string {
  const prefix = `${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function recallAtK(ranked: RankedCandidate[], relevant: Set<number>, k: number) {
  if (!relevant.size) return 0;
  const top = ranked.slice(0, k);
  let hits = 0;
  for (const item of top) {
    if (relevant.has(item.regulationId)) hits += 1;
  }
  return hits / relevant.size;
}

function precisionAtK(ranked: RankedCandidate[], relevant: Set<number>, k: number) {
  const top = ranked.slice(0, k);
  if (!top.length) return 0;
  let hits = 0;
  for (const item of top) {
    if (relevant.has(item.regulationId)) hits += 1;
  }
  return hits / top.length;
}

function reciprocalRank(ranked: RankedCandidate[], relevant: Set<number>) {
  for (const item of ranked) {
    if (relevant.has(item.regulationId)) {
      return 1 / item.rank;
    }
  }
  return 0;
}

function dcgAtK(ranked: RankedCandidate[], relevant: Set<number>, k: number) {
  const top = ranked.slice(0, k);
  let dcg = 0;
  for (let i = 0; i < top.length; i += 1) {
    const rel = relevant.has(top[i]!.regulationId) ? 1 : 0;
    if (rel === 0) continue;
    dcg += rel / Math.log2(i + 2);
  }
  return dcg;
}

function ndcgAtK(ranked: RankedCandidate[], relevant: Set<number>, k: number) {
  const idealCount = Math.min(k, relevant.size);
  if (idealCount === 0) return 0;
  let idcg = 0;
  for (let i = 0; i < idealCount; i += 1) {
    idcg += 1 / Math.log2(i + 2);
  }
  const dcg = dcgAtK(ranked, relevant, k);
  return idcg > 0 ? dcg / idcg : 0;
}

function stddev(values: number[]) {
  if (!values.length) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

async function buildCandidates(
  aiService: AIClientService,
  ragService: RegulationRagService,
  caseText: string,
  caseType: CaseType | null
): Promise<SimilarityRegulationCandidate[]> {
  const regulationRows = await db.query.regulations.findMany({
    columns: {
      id: true,
      title: true,
      category: true,
      summary: true,
    },
  });

  const versionRows = await db.query.regulationVersions.findMany({
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

  const chunkRetrieval = await ragService.retrieveTopCandidateChunks({
    queryText: caseText,
    topK: env.REG_LINK_PREFILTER_TOP_K,
    perRegulationLimit: env.REG_LINK_CANDIDATE_CHUNKS_PER_REG,
  });

  const preferredCategory = mapCaseTypeToRegulationCategory(caseType);
  const indexed: SimilarityRegulationCandidate[] = [];
  const fallback: SimilarityRegulationCandidate[] = [];

  for (const regulation of regulationRows) {
    const latest = latestVersionByRegulationId.get(regulation.id);
    const chunks = latest
      ? chunkRetrieval.byRegulationVersionId.get(latest.id) || []
      : [];

    const candidate: SimilarityRegulationCandidate = {
      id: regulation.id,
      title: regulation.title,
      category: regulation.category,
      regulation_version_id: latest?.id || null,
      content_text:
        latest?.content?.slice(0, env.CASE_LINK_DOC_TOTAL_MAX_CHARS) ||
        regulation.summary ||
        regulation.title,
      candidate_chunks: chunks.map((chunk) => ({
        chunk_id: chunk.chunkId,
        chunk_index: chunk.chunkIndex,
        line_start: chunk.lineStart,
        line_end: chunk.lineEnd,
        article_ref: chunk.articleRef,
        text: chunk.text,
      })),
    };

    if (candidate.candidate_chunks && candidate.candidate_chunks.length) {
      indexed.push(candidate);
    } else if (!preferredCategory || regulation.category === preferredCategory) {
      fallback.push(candidate);
    }
  }

  return [...indexed.slice(0, 50), ...fallback.slice(0, 10)];
}

async function run() {
  const labelsPath = resolve(parseArg("--labels", env.AI_EVAL_LABELS_FILE));
  const outputDir = resolve(parseArg("--out-dir", env.AI_EVAL_OUTPUT_DIR));
  const labels = JSON.parse(readFileSync(labelsPath, "utf-8")) as LabelRow[];

  if (!labels.length) {
    throw new Error("No labels found. Add at least one case with relevant regulations.");
  }

  const aiService = new AIClientService();
  const ragService = new RegulationRagService(db, aiService);
  const perCase: CaseEvaluation[] = [];

  for (const label of labels) {
    const caseRow = await db.query.cases.findFirst({
      where: eq(cases.id, label.caseId),
      columns: {
        id: true,
        title: true,
        description: true,
        caseType: true,
        status: true,
        courtJurisdiction: true,
        clientInfo: true,
      },
    });
    if (!caseRow) {
      continue;
    }

    const caseText = `${caseRow.title}\n\n${caseRow.description || ""}`.trim();
    const candidates = await buildCandidates(aiService, ragService, caseText, caseRow.caseType);
    if (!candidates.length) {
      continue;
    }

    const response = await aiService.findRelatedRegulations(caseText, candidates, {
      topK: Math.max(10, label.relevantRegulationIds.length * 3),
      threshold: env.CASE_LINK_SUPPORT_FLOOR,
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
      strictMode: env.CASE_LINK_STRICT_MODE,
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

    const ranked: RankedCandidate[] = (response.related_regulations || []).map(
      (match: SimilarityMatch, index: number) => ({
        regulationId: match.regulation_id,
        score: Number(match.similarity_score || 0),
        rank: index + 1,
      })
    );

    const relevant = new Set(label.relevantRegulationIds);
    const top5Scores = ranked.slice(0, 5).map((item) => item.score);

    perCase.push({
      caseId: label.caseId,
      totalRelevant: relevant.size,
      recallAt1: recallAtK(ranked, relevant, 1),
      recallAt3: recallAtK(ranked, relevant, 3),
      recallAt5: recallAtK(ranked, relevant, 5),
      precisionAt1: precisionAtK(ranked, relevant, 1),
      precisionAt3: precisionAtK(ranked, relevant, 3),
      precisionAt5: precisionAtK(ranked, relevant, 5),
      reciprocalRank: reciprocalRank(ranked, relevant),
      ndcgAt5: ndcgAtK(ranked, relevant, 5),
      scoreStddevTop5: stddev(top5Scores),
    });
  }

  if (!perCase.length) {
    throw new Error("No evaluable cases. Check labels and case records.");
  }

  const avg = <T extends keyof CaseEvaluation>(key: T) =>
    perCase.reduce((sum, row) => sum + Number(row[key]), 0) / perCase.length;

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      labelsPath,
      model: "case-linking-current",
      strictMode: env.CASE_LINK_STRICT_MODE,
      weights: {
        semantic: env.CASE_LINK_WEIGHT_SEMANTIC,
        support: env.CASE_LINK_WEIGHT_SUPPORT,
        lexical: env.CASE_LINK_WEIGHT_LEXICAL,
        category: env.CASE_LINK_WEIGHT_CATEGORY,
      },
    },
    summary: {
      cases: perCase.length,
      recallAt1: Number(avg("recallAt1").toFixed(4)),
      recallAt3: Number(avg("recallAt3").toFixed(4)),
      recallAt5: Number(avg("recallAt5").toFixed(4)),
      precisionAt1: Number(avg("precisionAt1").toFixed(4)),
      precisionAt3: Number(avg("precisionAt3").toFixed(4)),
      precisionAt5: Number(avg("precisionAt5").toFixed(4)),
      mrr: Number(avg("reciprocalRank").toFixed(4)),
      ndcgAt5: Number(avg("ndcgAt5").toFixed(4)),
      top5ScoreStddev: Number(avg("scoreStddevTop5").toFixed(4)),
    },
    perCase,
  };

  mkdirSync(outputDir, { recursive: true });
  const reportPath = resolve(outputDir, "case-link-evaluation-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  const csvPath = resolve(outputDir, "case-link-evaluation-per-case.csv");
  const header =
    "caseId,totalRelevant,recallAt1,recallAt3,recallAt5,precisionAt1,precisionAt3,precisionAt5,reciprocalRank,ndcgAt5,scoreStddevTop5\n";
  const rows = perCase
    .map((row) =>
      [
        row.caseId,
        row.totalRelevant,
        row.recallAt1.toFixed(4),
        row.recallAt3.toFixed(4),
        row.recallAt5.toFixed(4),
        row.precisionAt1.toFixed(4),
        row.precisionAt3.toFixed(4),
        row.precisionAt5.toFixed(4),
        row.reciprocalRank.toFixed(4),
        row.ndcgAt5.toFixed(4),
        row.scoreStddevTop5.toFixed(4),
      ].join(",")
    )
    .join("\n");
  writeFileSync(csvPath, `${header}${rows}\n`, "utf-8");

  console.log(`Saved report: ${reportPath}`);
  console.log(`Saved per-case CSV: ${csvPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
