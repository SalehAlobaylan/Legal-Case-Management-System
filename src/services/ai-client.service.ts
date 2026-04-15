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
  private static readonly RETRYABLE_STATUS_CODES = new Set([
    408,
    429,
    500,
    502,
    503,
    504,
  ]);

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
  private signal(timeoutMs?: number): AbortSignal {
    return AbortSignal.timeout(Math.max(1000, timeoutMs ?? this.timeoutMs));
  }

  private isRetryableError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const candidate = error as { name?: string; message?: string; cause?: unknown };
    if (candidate.name === "AbortError" || candidate.name === "TimeoutError") {
      return true;
    }

    const message = (candidate.message || "").toLowerCase();
    if (
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("socket") ||
      message.includes("econn") ||
      message.includes("enotfound")
    ) {
      return true;
    }

    if (candidate.cause && typeof candidate.cause === "object") {
      const causeCode = (
        candidate.cause as { code?: string; errno?: string }
      ).code || (candidate.cause as { code?: string; errno?: string }).errno;
      if (typeof causeCode === "string") {
        return [
          "ECONNRESET",
          "ECONNREFUSED",
          "ECONNABORTED",
          "ENOTFOUND",
          "ETIMEDOUT",
          "EAI_AGAIN",
        ].includes(causeCode.toUpperCase());
      }
    }

    return false;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    context: string,
    options?: { timeoutMs?: number; maxRetries?: number }
  ): Promise<Response> {
    const maxRetries = Math.max(0, options?.maxRetries ?? 2);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const attemptTimeoutMs = Math.min(
          300000,
          Math.max(
            1000,
            (options?.timeoutMs ?? this.timeoutMs) + attempt * 15000
          )
        );

        const response = await fetch(url, {
          ...init,
          signal: this.signal(attemptTimeoutMs),
        });

        if (response.ok) {
          return response;
        }

        if (
          AIClientService.RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt < maxRetries
        ) {
          logger.warn(
            {
              status: response.status,
              context,
              attempt: attempt + 1,
              maxRetries,
            },
            "AI service transient HTTP error, retrying"
          );
          await this.delay(250 * (attempt + 1));
          continue;
        }

        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`AI service error (${context}): ${response.status} ${errorText}`);
      } catch (error) {
        if (attempt < maxRetries && this.isRetryableError(error)) {
          logger.warn(
            {
              err: error,
              context,
              attempt: attempt + 1,
              maxRetries,
            },
            "AI service request failed transiently, retrying"
          );
          await this.delay(250 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }

    throw new Error(`AI service error (${context}): request failed after retries`);
  }

  /**
   * generateEmbeddings
   *
   * - Generates embedding vectors for a batch of texts.
   * - Delegates to the AI microservice `/embed/` endpoint.
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/embed/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts,
          normalize: true,
        }),
      }, "embed");

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
      pipelineToggles?: {
        enable_llm_verification?: boolean;
        enable_cross_encoder?: boolean;
        enable_hyde?: boolean;
        enable_colbert?: boolean;
        enable_agentic?: boolean;
      };
    }
  ): Promise<SimilarityMatch[]> {
    try {
      const topK = options?.topK ?? 10;
      const threshold = options?.threshold ?? 0.3;
      const response = await this.fetchWithRetry(`${this.baseUrl}/similarity/find-related`, {
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
          ...(options?.pipelineToggles || {}),
        }),
      }, "find-related", { timeoutMs: Math.max(this.timeoutMs, 120000) });

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
      const response = await this.fetchWithRetry(`${this.baseUrl}/regulations/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: input.sourceUrl,
          if_none_match: input.ifNoneMatch || undefined,
          if_modified_since: input.ifModifiedSince || undefined,
          max_chars: input.maxChars,
        }),
      }, "regulations/extract", { timeoutMs: Math.max(this.timeoutMs, 180000) });

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

      const response = await this.fetchWithRetry(`${this.baseUrl}/documents/extract`, {
        method: "POST",
        body: formData,
      }, "documents/extract", { timeoutMs: Math.max(this.timeoutMs, 180000) });

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
      const response = await this.fetchWithRetry(`${this.baseUrl}/documents/case-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_text: input.caseText,
          document_text: input.documentText,
          document_name: input.documentName || "document",
          top_k: input.topK,
          max_source_chars: input.maxSourceChars,
        }),
      }, "documents/case-insights", { timeoutMs: Math.max(this.timeoutMs, 120000) });

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
      const response = await this.fetchWithRetry(`${this.baseUrl}/regulations/summary-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regulation_text: input.regulationText,
          regulation_title: input.regulationTitle,
          source_metadata: input.sourceMetadata || {},
          language_code: input.languageCode || "ar",
          max_source_chars: input.maxSourceChars,
        }),
      }, "regulations/summary-analysis", { timeoutMs: Math.max(this.timeoutMs, 120000) });

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
      const response = await this.fetchWithRetry(`${this.baseUrl}/regulations/amendment-impact`, {
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
      }, "regulations/amendment-impact", {
        timeoutMs: Math.max(this.timeoutMs, 120000),
      });

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
      const response = await this.fetchWithRetry(`${this.baseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context: context || {},
          history: history || [],
        }),
      }, "chat", { timeoutMs: Math.max(this.timeoutMs, 120000) });

      return (await response.json()) as ChatResponse;
    } catch (error) {
      logger.error({ err: error }, "Failed to get chat response from AI service");
      throw error;
    }
  }

  /**
   * chatStream
   *
   * - Sends a chat request to the AI microservice streaming endpoint.
   * - Returns the raw Response so the caller can pipe the SSE stream.
   */
  async chatStream(payload: ChatStreamPayload): Promise<Response> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, "chat/stream", { timeoutMs: Math.max(this.timeoutMs, 120000) });

    return response;
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
      const response = await this.fetchWithRetry(`${this.baseUrl}/analyze-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: caseData.title,
          description: caseData.description || "",
          case_type: caseData.caseType,
          status: caseData.status,
          court_jurisdiction: caseData.courtJurisdiction || "",
        }),
      }, "analyze-case", { timeoutMs: Math.max(this.timeoutMs, 120000) });

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
      const response = await this.fetchWithRetry(`${this.baseUrl}/summarize-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: documentContent,
          file_name: fileName,
        }),
      }, "summarize-document", { timeoutMs: Math.max(this.timeoutMs, 120000) });

      return (await response.json()) as DocumentSummaryResponse;
    } catch (error) {
      logger.error({ err: error }, "Failed to summarize document from AI service");
      throw error;
    }
  }
}

// Chat stream payload for the SSE endpoint
export interface ChatStreamPayload {
  message: string;
  history?: { role: string; content: string }[];
  regulation_chunks?: {
    chunk_id: number;
    regulation_id: number;
    regulation_title: string;
    article_ref?: string | null;
    content: string;
    similarity_score?: number | null;
  }[];
  document_chunks?: {
    chunk_id: number;
    document_id: number;
    document_name: string;
    content: string;
  }[];
  case_context?: {
    case_id: number;
    title: string;
    case_type?: string | null;
    description?: string | null;
  } | null;
  /** Summary of the organization's cases — lets the assistant answer
   *  general questions like "how many commercial cases do I have?" */
  org_cases?: {
    case_id: number;
    case_number: string;
    title: string;
    case_type: string;
    status: string;
    client_info?: string | null;
    filing_date?: string | null;
    next_hearing?: string | null;
  }[];
  language?: string | null;
  session_id?: string | null;
  stream: boolean;
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










