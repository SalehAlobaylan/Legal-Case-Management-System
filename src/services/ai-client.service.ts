import { env } from "../config/env";
import { logger } from "../utils/logger";

export interface EmbeddingResponse {
  embeddings: number[][];
  dimension?: number;
  count?: number;
}

export interface SimilarityMatch {
  regulation_id: number;
  similarity_score: number;
  title: string;
  category?: string | null;
}

export interface FindRelatedResponse {
  related_regulations: SimilarityMatch[];
  query_length?: number;
  candidates_count?: number;
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

  constructor() {
    if (!env.AI_SERVICE_URL) {
      throw new Error(
        "AI_SERVICE_URL is not configured. Please set it in your environment."
      );
    }

    // Normalise to avoid double slashes when building URLs.
    this.baseUrl = env.AI_SERVICE_URL.replace(/\/+$/, "");
  }

  /**
   * generateEmbedding
   *
   * - Generates a single embedding vector for the provided text.
   * - Delegates to the AI microservice `/embed/` endpoint.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/embed/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts: [text],
          normalize: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `AI service error (embed): ${response.status} ${errorText}`
        );
      }

      const data = (await response.json()) as EmbeddingResponse;

      if (!data.embeddings?.length || !data.embeddings[0]) {
        throw new Error("AI service returned an empty embeddings array");
      }

      return data.embeddings[0];
    } catch (error) {
      logger.error({ err: error }, "Failed to generate embedding from AI service");
      throw error;
    }
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
    topK: number = 10,
    threshold: number = 0.3
  ): Promise<SimilarityMatch[]> {
    try {
      const response = await fetch(`${this.baseUrl}/similarity/find-related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_text: caseText,
          top_k: topK,
          threshold,
        }),
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






















