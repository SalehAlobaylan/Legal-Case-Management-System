import { env } from "../config/env";
import { logger } from "../utils/logger";

export interface EmbeddingResponse {
  embeddings: number[][];
  dimension?: number;
  count?: number;
}

export interface SimilarityMatch {
  regulation_id: number;
  matched_regulation_version_id?: number | null;
  similarity_score: number;
  title: string;
  category?: string | null;
  evidence?: SimilarityEvidence[];
  line_matches?: SimilarityLineMatch[];
  score_breakdown?: SimilarityScoreBreakdown;
  warnings?: string[];
}

export interface SimilarityRegulationCandidate {
  id: number;
  title: string;
  category?: string | null;
  regulation_version_id?: number | null;
  content_text?: string | null;
  candidate_chunks?: SimilarityRegulationChunkCandidate[];
}

export interface SimilarityCaseFragment {
  fragment_id: string;
  text: string;
  source: "case" | "document";
  document_id?: number;
  document_name?: string;
}

export interface SimilarityCaseProfile {
  case_id?: number;
  title?: string;
  description?: string | null;
  case_type?: string;
  status?: string;
  court_jurisdiction?: string | null;
  client_info?: string | null;
}

export interface SimilarityRegulationChunkCandidate {
  chunk_id: number;
  chunk_index: number;
  line_start?: number | null;
  line_end?: number | null;
  article_ref?: string | null;
  text: string;
}

export interface SimilarityEvidence {
  fragment_id: string;
  source: string;
  document_id?: number | null;
  document_name?: string | null;
  score: number;
}

export interface SimilarityScoreBreakdown {
  semantic_max: number;
  support_coverage: number;
  lexical_overlap: number;
  category_prior: number;
  final_score: number;
  has_case_support?: boolean;
  strong_support_count?: number;
}

export interface SimilarityScoringProfile {
  semantic_weight?: number;
  support_weight?: number;
  lexical_weight?: number;
  category_weight?: number;
  strict_min_final_score?: number;
  strict_min_pair_score?: number;
  strict_min_supporting_matches?: number;
  require_case_support?: boolean;
}

export interface SimilarityLineMatch {
  case_fragment_id: string;
  case_snippet: string;
  regulation_chunk_id?: number | null;
  regulation_snippet: string;
  line_start?: number | null;
  line_end?: number | null;
  article_ref?: string | null;
  pair_score: number;
  contribution: number;
}

export interface FindRelatedResponse {
  related_regulations: SimilarityMatch[];
  query_length?: number;
  candidates_count?: number;
}

export interface ExtractRegulationInput {
  sourceUrl: string;
  ifNoneMatch?: string | null;
  ifModifiedSince?: string | null;
  maxChars?: number;
}

export interface ExtractRegulationResponse {
  status: "ok" | "not_modified" | "error";
  source_url: string;
  final_url?: string | null;
  etag?: string | null;
  last_modified?: string | null;
  content_type?: string | null;
  extraction_method: string;
  extracted_text?: string | null;
  normalized_text_hash?: string | null;
  raw_html?: string | null;
  ocr_provider_used?: string;
  fallback_stage?: string;
  warnings?: string[];
  error_code?: string | null;
}

export interface ExtractDocumentInput {
  content: Buffer | Uint8Array;
  fileName: string;
  contentType?: string | null;
  maxChars?: number;
}

export interface ExtractDocumentResponse {
  status: "ok" | "error";
  file_name: string;
  content_type?: string | null;
  extraction_method: string;
  extracted_text?: string | null;
  normalized_text_hash?: string | null;
  ocr_provider_used?: string;
  fallback_stage?: string;
  warnings?: string[];
  error_code?: string | null;
}

export interface DocumentCaseInsightsInput {
  caseText: string;
  documentText: string;
  documentName?: string;
  topK?: number;
  maxSourceChars?: number;
}

export interface DocumentCaseInsightHighlight {
  snippet: string;
  score: number;
  sentence_start: number;
  sentence_end: number;
}

export interface DocumentCaseInsightsResponse {
  status: "ok" | "error";
  summary: string;
  highlights: DocumentCaseInsightHighlight[];
  method: string;
  warnings?: string[];
  error_code?: string | null;
}

export interface RegulationInsightBullet {
  title: string;
  description: string;
  severity?: "low" | "medium" | "high";
}

export interface RegulationKeyDate {
  label: string;
  value: string;
  source?: string | null;
}

export interface RegulationCitation {
  snippet: string;
  section_ref?: string | null;
  relevance?: number | null;
}

export interface RegulationSummaryAnalysisInput {
  regulationText: string;
  regulationTitle: string;
  sourceMetadata?: Record<string, unknown>;
  languageCode?: "ar" | "en";
  maxSourceChars?: number;
}

export interface RegulationSummaryAnalysisResponse {
  status: "ok" | "error";
  summary: string;
  obligations: RegulationInsightBullet[];
  risk_flags: RegulationInsightBullet[];
  key_dates: RegulationKeyDate[];
  citations: RegulationCitation[];
  method: string;
  warnings?: string[];
  error_code?: string | null;
}

export interface RegulationAmendmentImpactInput {
  regulationTitle?: string;
  oldText: string;
  newText: string;
  fromVersionLabel: string;
  toVersionLabel: string;
  diffSummary?: Record<string, unknown>;
  languageCode?: "ar" | "en";
  maxSourceChars?: number;
}

export interface RegulationAmendmentImpactResponse {
  status: "ok" | "error";
  what_changed: RegulationInsightBullet[];
  legal_impact: RegulationInsightBullet[];
  affected_parties: RegulationInsightBullet[];
  citations: RegulationCitation[];
  method: string;
  warnings?: string[];
  error_code?: string | null;
}

/**
 * AIClientService
 *
 * - Thin HTTP client for the external AI microservice.
 * - Responsible only for calling the AI API and translating responses into
 *   strongly typed objects for the rest of the backend.
 */
export class AIClientService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    if (!env.AI_SERVICE_URL) {
      throw new Error(
        "AI_SERVICE_URL is not configured. Please set it in your environment."
      );
    }

    // Normalise to avoid double slashes when building URLs.
    this.baseUrl = env.AI_SERVICE_URL.replace(/\/+$/, "");
    this.timeoutMs = env.AI_SERVICE_TIMEOUT_MS;
  }

  /** Create an AbortSignal that times out after the configured duration. */
  private signal(): AbortSignal {
    return AbortSignal.timeout(this.timeoutMs);
  }

  /**
   * generateEmbeddings
   *
   * - Generates embedding vectors for a batch of texts.
   * - Delegates to the AI microservice `/embed/` endpoint.
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/embed/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts,
          normalize: true,
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `AI service error (embed): ${response.status} ${errorText}`
        );
      }

      const data = (await response.json()) as EmbeddingResponse;
      if (!Array.isArray(data.embeddings)) {
        throw new Error("AI service returned invalid embeddings payload");
      }

      if (data.embeddings.length !== texts.length) {
        throw new Error(
          `AI service returned ${data.embeddings.length} embeddings for ${texts.length} texts`
        );
      }

      return data;
    } catch (error) {
      logger.error({ err: error }, "Failed to generate embeddings from AI service");
      throw error;
    }
  }

  /**
   * generateEmbedding
   *
   * - Generates a single embedding vector for the provided text.
   * - Delegates to the AI microservice `/embed/` endpoint.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const data = await this.generateEmbeddings([text]);
    if (!data.embeddings[0]) {
      throw new Error("AI service returned an empty embeddings array");
    }
    return data.embeddings[0];
  }

  /**
   * findRelatedRegulations
   *
   * - Finds the most relevant regulations for the given case text.
   * - Delegates to the AI microservice `/similarity/find-related` endpoint.
   *
   * NOTE: The underlying AI service is expected to handle candidate retrieval
   *       and similarity calculation, as described in the AI microservice plan.
   */
  async findRelatedRegulations(
    caseText: string,
    regulations: SimilarityRegulationCandidate[],
    options?: {
      topK?: number;
      threshold?: number;
      caseFragments?: SimilarityCaseFragment[];
      caseProfile?: SimilarityCaseProfile;
      strictMode?: boolean;
      scoringProfile?: SimilarityScoringProfile;
    }
  ): Promise<SimilarityMatch[]> {
    try {
      const topK = options?.topK ?? 10;
      const threshold = options?.threshold ?? 0.3;
      const response = await fetch(`${this.baseUrl}/similarity/find-related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_text: caseText,
          regulations,
          top_k: topK,
          threshold,
          case_fragments:
            options?.caseFragments?.length ? options.caseFragments : undefined,
          case_profile: options?.caseProfile,
          strict_mode:
            typeof options?.strictMode === "boolean" ? options.strictMode : true,
          scoring_profile: options?.scoringProfile,
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `AI service error (find-related): ${response.status} ${errorText}`
        );
      }

      const data = (await response.json()) as FindRelatedResponse;
      return data.related_regulations ?? [];
    } catch (error) {
      logger.error(
        { err: error },
        "Failed to find related regulations from AI service"
      );
      throw error;
    }
  }

  async extractRegulationContent(
    input: ExtractRegulationInput
  ): Promise<ExtractRegulationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/regulations/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: input.sourceUrl,
          if_none_match: input.ifNoneMatch || undefined,
          if_modified_since: input.ifModifiedSince || undefined,
          max_chars: input.maxChars,
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `AI service error (regulations/extract): ${response.status} ${errorText}`
        );
      }

      return (await response.json()) as ExtractRegulationResponse;
    } catch (error) {
      logger.error(
        { err: error, sourceUrl: input.sourceUrl },
        "Failed to extract regulation content from AI service"
      );
      throw error;
    }
  }

  async extractDocumentContent(
    input: ExtractDocumentInput
  ): Promise<ExtractDocumentResponse> {
    try {
      const formData = new FormData();
      const blob = new Blob([input.content], {
        type: input.contentType || "application/octet-stream",
      });
      formData.append("file", blob, input.fileName || "document");
      if (typeof input.maxChars === "number") {
        formData.append("max_chars", String(input.maxChars));
      }

      const response = await fetch(`${this.baseUrl}/documents/extract`, {
        method: "POST",
        body: formData,
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `AI service error (documents/extract): ${response.status} ${errorText}`
        );
      }

      return (await response.json()) as ExtractDocumentResponse;
    } catch (error) {
      logger.error(
        { err: error, fileName: input.fileName },
        "Failed to extract document content from AI service"
      );
      throw error;
    }
  }

  async generateDocumentCaseInsights(
    input: DocumentCaseInsightsInput
  ): Promise<DocumentCaseInsightsResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/documents/case-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_text: input.caseText,
          document_text: input.documentText,
          document_name: input.documentName || "document",
          top_k: input.topK,
          max_source_chars: input.maxSourceChars,
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `AI service error (documents/case-insights): ${response.status} ${errorText}`
        );
      }

      return (await response.json()) as DocumentCaseInsightsResponse;
    } catch (error) {
      logger.error(
        {
          err: error,
          documentName: input.documentName,
        },
        "Failed to generate document case insights from AI service"
      );
      throw error;
    }
  }

  async generateRegulationSummaryAnalysis(
    input: RegulationSummaryAnalysisInput
  ): Promise<RegulationSummaryAnalysisResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/regulations/summary-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regulation_text: input.regulationText,
          regulation_title: input.regulationTitle,
          source_metadata: input.sourceMetadata || {},
          language_code: input.languageCode || "ar",
          max_source_chars: input.maxSourceChars,
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `AI service error (regulations/summary-analysis): ${response.status} ${errorText}`
        );
      }

      return (await response.json()) as RegulationSummaryAnalysisResponse;
    } catch (error) {
      logger.error(
        { err: error, regulationTitle: input.regulationTitle },
        "Failed to generate regulation summary analysis from AI service"
      );
      throw error;
    }
  }

  async generateRegulationAmendmentImpact(
    input: RegulationAmendmentImpactInput
  ): Promise<RegulationAmendmentImpactResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/regulations/amendment-impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regulation_title: input.regulationTitle || "",
          old_text: input.oldText,
          new_text: input.newText,
          from_version_label: input.fromVersionLabel,
          to_version_label: input.toVersionLabel,
          diff_summary: input.diffSummary || {},
          language_code: input.languageCode || "ar",
          max_source_chars: input.maxSourceChars,
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `AI service error (regulations/amendment-impact): ${response.status} ${errorText}`
        );
      }

      return (await response.json()) as RegulationAmendmentImpactResponse;
    } catch (error) {
      logger.error(
        {
          err: error,
          fromVersionLabel: input.fromVersionLabel,
          toVersionLabel: input.toVersionLabel,
        },
        "Failed to generate regulation amendment impact from AI service"
      );
      throw error;
    }
  }

  /**
   * chat
   *
   * - Sends a message to the AI legal assistant with optional context.
   * - Context can include case details and related regulations.
   * - Returns the AI response with citations.
   */
  async chat(
    message: string,
    context?: { caseText?: string; regulationTexts?: string[] },
    history?: { role: string; content: string }[]
  ): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context: context || {},
          history: history || [],
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`AI service error (chat): ${response.status} ${errorText}`);
      }

      return (await response.json()) as ChatResponse;
    } catch (error) {
      logger.error({ err: error }, "Failed to get chat response from AI service");
      throw error;
    }
  }

  /**
   * analyzeCase
   *
   * - Generates comprehensive AI analysis of a legal case.
   * - Returns strengths, weaknesses, recommended strategy, and success probability.
   */
  async analyzeCase(caseData: {
    title: string;
    description: string | null;
    caseType: string;
    status: string;
    courtJurisdiction: string | null;
  }): Promise<CaseAnalysisResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/analyze-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: caseData.title,
          description: caseData.description || "",
          case_type: caseData.caseType,
          status: caseData.status,
          court_jurisdiction: caseData.courtJurisdiction || "",
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`AI service error (analyze-case): ${response.status} ${errorText}`);
      }

      return (await response.json()) as CaseAnalysisResponse;
    } catch (error) {
      logger.error({ err: error }, "Failed to analyze case from AI service");
      throw error;
    }
  }

  /**
   * summarizeDocument
   *
   * - Generates an AI summary of a legal document.
   * - Returns summary, key entities, effective date, and clause analysis.
   */
  async summarizeDocument(
    documentContent: string,
    fileName: string
  ): Promise<DocumentSummaryResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/summarize-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: documentContent,
          file_name: fileName,
        }),
        signal: this.signal(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`AI service error (summarize-document): ${response.status} ${errorText}`);
      }

      return (await response.json()) as DocumentSummaryResponse;
    } catch (error) {
      logger.error({ err: error }, "Failed to summarize document from AI service");
      throw error;
    }
  }
}

// Response interfaces for new methods
export interface ChatResponse {
  response: string;
  citations: {
    source: string;
    article?: string;
    link?: string;
  }[];
}

export interface CaseAnalysisResponse {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendedStrategy: string;
  successProbability: number;
  predictedTimeline: string;
}

export interface DocumentSummaryResponse {
  summary: string;
  keyEntities: string[];
  effectiveDate?: string;
  clauses: {
    title: string;
    riskLevel: string;
    description: string;
  }[];
}













