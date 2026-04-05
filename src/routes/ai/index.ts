/*
 * AI routes plugin
 *
 * - Registers HTTP endpoints for AI-powered features under `/api/ai` prefix.
 * - Provides legal assistant chat (streaming + non-streaming), case analysis,
 *   and chat session management.
 * - All routes require JWT authentication.
 */

import {
    FastifyInstance,
    FastifyPluginAsync,
    FastifyReply,
    FastifyRequest,
    FastifySchema,
} from "fastify";
import { AIClientService, type ChatStreamPayload } from "../../services/ai-client.service";
import { CaseService } from "../../services/case.service";
import { ChatService } from "../../services/chat.service";
import { ChatContextService } from "../../services/chat-context.service";
import type { ChatCitationRow } from "../../db/schema/chat-sessions";
import type { Database } from "../../db/connection";
import { regulations } from "../../db/schema";
import { inArray } from "drizzle-orm";
import { logger } from "../../utils/logger";

const MAX_MESSAGE_LENGTH = 10_000;

/** Shape of a citation event from the AI microservice SSE stream. */
interface StreamCitation {
    regulation_id: number;
    regulation_title: string;
    article_ref?: string | null;
    chunk_id?: number | null;
}

type RequestWithUser = FastifyRequest & {
    user: {
        id: string;
        email: string;
        role: string;
        orgId: number;
    };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
    authenticate: (request: FastifyRequest) => Promise<void>;
    db: Database;
};

interface ChatRequestBody {
    message: string;
    sessionId?: number;
    caseId?: number;
    context?: {
        caseId?: number;
        regulationIds?: number[];
    };
    history?: { role: string; content: string }[];
    language?: string;
}

const aiRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify as AuthenticatedFastifyInstance;

    // All routes require authentication
    app.addHook("onRequest", app.authenticate);

    // -----------------------------------------------------------------------
    // POST /api/ai/chat — non-streaming (backward compat)
    // -----------------------------------------------------------------------
    fastify.post(
        "/chat",
        {
            schema: {
                description: "Legal assistant chat interface",
                tags: ["ai"],
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    required: ["message"],
                    properties: {
                        message: { type: "string", minLength: 1 },
                        context: {
                            type: "object",
                            properties: {
                                caseId: { type: "number" },
                                regulationIds: { type: "array", items: { type: "number" } },
                            },
                        },
                        history: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    role: { type: "string" },
                                    content: { type: "string" },
                                },
                            },
                        },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { message, context, history } = request.body as ChatRequestBody;

            try {
                const aiClient = new AIClientService();

                // Build context from case and regulations if provided
                let caseText: string | undefined;
                let regulationTexts: string[] | undefined;

                if (context?.caseId) {
                    const caseService = new CaseService(app.db);
                    const caseData = await caseService.getCaseById(context.caseId, user.orgId);
                    caseText = `Case: ${caseData.title}\nType: ${caseData.caseType}\nDescription: ${caseData.description || "N/A"}\nStatus: ${caseData.status}`;
                }

                if (context?.regulationIds && context.regulationIds.length > 0) {
                    const regs = await app.db.query.regulations.findMany({
                        where: inArray(regulations.id, context.regulationIds),
                    });
                    regulationTexts = regs.map(
                        (r) => `${r.title} (${r.regulationNumber}): ${r.category}`
                    );
                }

                const result = await aiClient.chat(
                    message,
                    { caseText, regulationTexts },
                    history
                );

                return reply.send(result);
            } catch (error: any) {
                if (error.message?.includes("AI_SERVICE_URL is not configured") ||
                    error.message?.includes("fetch failed")) {
                    return reply.status(503).send({
                        error: {
                            code: "SERVICE_UNAVAILABLE",
                            message: "AI service is currently unavailable",
                        },
                    });
                }
                throw error;
            }
        }
    );

    // -----------------------------------------------------------------------
    // POST /api/ai/chat/stream — SSE streaming chat with RAG context
    // -----------------------------------------------------------------------
    fastify.post(
        "/chat/stream",
        {
            schema: {
                description: "Streaming legal assistant chat with RAG context",
                tags: ["ai"],
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    required: ["message"],
                    properties: {
                        message: { type: "string", minLength: 1 },
                        sessionId: { type: "number" },
                        caseId: { type: "number" },
                        language: { type: "string" },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const body = request.body as ChatRequestBody;
            const { message, language } = body;
            const caseId = body.caseId || body.context?.caseId;

            if (message.length > MAX_MESSAGE_LENGTH) {
                return reply.status(400).send({
                    error: {
                        code: "VALIDATION_ERROR",
                        message: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
                    },
                });
            }

            const chatService = new ChatService(app.db);
            const contextService = new ChatContextService(app.db);
            const aiClient = new AIClientService();

            try {
                // 1. Create or resume session
                let sessionId = body.sessionId;
                let history: { role: string; content: string }[] = [];

                if (sessionId) {
                    const existing = await chatService.getSession(sessionId, user.orgId);
                    if (existing) {
                        history = (existing.messages || []).map((m) => ({
                            role: m.role,
                            content: m.content,
                        }));
                    } else {
                        sessionId = undefined;
                    }
                }

                if (!sessionId) {
                    const session = await chatService.createSession({
                        userId: user.id,
                        organizationId: user.orgId,
                        caseId: caseId,
                        title: message.slice(0, 100),
                        language: language || "ar",
                    });
                    sessionId = session.id;
                }

                // 2. Save user message
                await chatService.addMessage({
                    sessionId,
                    role: "user",
                    content: message,
                });

                // 3. Assemble RAG context
                const ctx = await contextService.assembleContext({
                    message,
                    organizationId: user.orgId,
                    caseId,
                });

                logger.info({
                    orgId: user.orgId,
                    orgCasesCount: ctx.orgCases?.length ?? 0,
                    regulationChunksCount: ctx.regulationChunks?.length ?? 0,
                    hasCaseContext: !!ctx.caseContext,
                }, "chat:context_assembled");

                // 4. Build payload for AI microservice
                const streamPayload: ChatStreamPayload = {
                    message,
                    history,
                    regulation_chunks: ctx.regulationChunks,
                    document_chunks: ctx.documentChunks,
                    case_context: ctx.caseContext,
                    org_cases: ctx.orgCases.length > 0 ? ctx.orgCases : undefined,
                    language,
                    session_id: String(sessionId),
                    stream: true,
                };

                // 5. Call AI microservice streaming endpoint
                const aiResponse = await aiClient.chatStream(streamPayload);

                if (!aiResponse.body) {
                    throw new Error("AI service returned no stream body");
                }

                // 6. Set SSE headers and pipe the stream
                // Must include CORS headers manually since reply.raw bypasses Fastify middleware.
                // NOTE: when credentials are used, origin must be explicit (not "*").
                const origin = request.headers.origin;
                const corsHeaders: Record<string, string> = {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                    "X-Chat-Session-Id": String(sessionId),
                    "Access-Control-Expose-Headers": "X-Chat-Session-Id",
                };
                if (origin) {
                    corsHeaders["Access-Control-Allow-Origin"] = origin;
                    corsHeaders["Access-Control-Allow-Credentials"] = "true";
                } else {
                    corsHeaders["Access-Control-Allow-Origin"] = "*";
                }
                reply.raw.writeHead(200, corsHeaders);

                // Accumulate full response for persistence
                let fullResponse = "";
                let citations: ChatCitationRow[] = [];

                const reader = aiResponse.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const text = decoder.decode(value, { stream: true });
                        buffer += text;

                        // Parse SSE lines from buffer
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || ""; // keep incomplete line

                        for (const line of lines) {
                            if (!line.startsWith("data: ")) continue;
                            const data = line.slice(6).trim();

                            if (data === "[DONE]") {
                                reply.raw.write("data: [DONE]\n\n");
                                continue;
                            }

                            // Forward the SSE event to the client
                            reply.raw.write(`data: ${data}\n\n`);

                            // Parse to accumulate response
                            try {
                                const event = JSON.parse(data);
                                if (event.type === "token" && event.content) {
                                    fullResponse += event.content;
                                } else if (event.type === "citations" && Array.isArray(event.citations)) {
                                    citations = event.citations
                                        .filter((c: StreamCitation) => c.regulation_id && c.regulation_title)
                                        .map((c: StreamCitation) => ({
                                            regulation_id: c.regulation_id,
                                            regulation_title: c.regulation_title,
                                            article_ref: c.article_ref || null,
                                            chunk_id: c.chunk_id || null,
                                        }));
                                }
                            } catch {
                                // Non-JSON data, skip
                            }
                        }
                    }
                    // Log if stream ended with incomplete SSE data in the buffer
                    if (buffer.trim()) {
                        logger.warn({ buffer: buffer.slice(0, 200) }, "SSE stream ended with incomplete event in buffer");
                    }
                } finally {
                    reader.releaseLock();
                }

                // 7. Persist assistant response
                if (fullResponse) {
                    await chatService.addMessage({
                        sessionId,
                        role: "assistant",
                        content: fullResponse,
                        citations,
                    });
                }

                reply.raw.end();
            } catch (error: any) {
                if (!reply.raw.headersSent) {
                    if (error.message?.includes("AI_SERVICE_URL is not configured") ||
                        error.message?.includes("fetch failed")) {
                        return reply.status(503).send({
                            error: {
                                code: "SERVICE_UNAVAILABLE",
                                message: "AI service is currently unavailable",
                            },
                        });
                    }
                    throw error;
                }
                // Headers already sent — write error as SSE event
                reply.raw.write(`data: ${JSON.stringify({ type: "error", message: "Stream interrupted" })}\n\n`);
                reply.raw.write("data: [DONE]\n\n");
                reply.raw.end();
            }
        }
    );

    // -----------------------------------------------------------------------
    // GET /api/ai/chat/sessions — list user's chat sessions
    // -----------------------------------------------------------------------
    fastify.get(
        "/chat/sessions",
        {
            schema: {
                description: "List user's chat sessions",
                tags: ["ai"],
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        limit: { type: "number", default: 20 },
                        offset: { type: "number", default: 0 },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { limit = 20, offset = 0 } = request.query as {
                limit?: number;
                offset?: number;
            };

            const chatService = new ChatService(app.db);
            const sessions = await chatService.listSessions(
                user.id,
                user.orgId,
                limit,
                offset
            );

            return reply.send({ sessions });
        }
    );

    // -----------------------------------------------------------------------
    // GET /api/ai/chat/sessions/:sessionId — get session with messages
    // -----------------------------------------------------------------------
    fastify.get(
        "/chat/sessions/:sessionId",
        {
            schema: {
                description: "Get a chat session with its messages",
                tags: ["ai"],
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    properties: {
                        sessionId: { type: "string" },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { sessionId } = request.params as { sessionId: string };
            const id = parseInt(sessionId, 10);

            if (isNaN(id)) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "Invalid sessionId" },
                });
            }

            const chatService = new ChatService(app.db);
            const session = await chatService.getSession(id, user.orgId);

            if (!session) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "Session not found" },
                });
            }

            return reply.send(session);
        }
    );

    // -----------------------------------------------------------------------
    // DELETE /api/ai/chat/sessions/:sessionId — delete a session
    // -----------------------------------------------------------------------
    fastify.delete(
        "/chat/sessions/:sessionId",
        {
            schema: {
                description: "Delete a chat session",
                tags: ["ai"],
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    properties: {
                        sessionId: { type: "string" },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { sessionId } = request.params as { sessionId: string };
            const id = parseInt(sessionId, 10);

            if (isNaN(id)) {
                return reply.status(400).send({
                    error: { code: "VALIDATION_ERROR", message: "Invalid sessionId" },
                });
            }

            const chatService = new ChatService(app.db);
            const deleted = await chatService.deleteSession(id, user.orgId);

            if (!deleted) {
                return reply.status(404).send({
                    error: { code: "NOT_FOUND", message: "Session not found" },
                });
            }

            return reply.send({ success: true });
        }
    );

    // -----------------------------------------------------------------------
    // POST /api/ai/cases/:caseId/analyze — case analysis (existing)
    // -----------------------------------------------------------------------
    fastify.post(
        "/cases/:caseId/analyze",
        {
            schema: {
                description: "Generate AI analysis of a case",
                tags: ["ai"],
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    properties: {
                        caseId: { type: "string" },
                    },
                },
            } as FastifySchema,
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { user } = request as RequestWithUser;
            const { caseId } = request.params as { caseId: string };
            const caseIdNum = parseInt(caseId, 10);

            if (isNaN(caseIdNum)) {
                return reply.status(400).send({
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "Invalid caseId parameter",
                    },
                });
            }

            try {
                const caseService = new CaseService(app.db);
                const caseData = await caseService.getCaseById(caseIdNum, user.orgId);

                const aiClient = new AIClientService();
                const analysis = await aiClient.analyzeCase({
                    title: caseData.title,
                    description: caseData.description,
                    caseType: caseData.caseType,
                    status: caseData.status,
                    courtJurisdiction: caseData.courtJurisdiction,
                });

                return reply.send(analysis);
            } catch (error: any) {
                if (error.message?.includes("AI_SERVICE_URL is not configured") ||
                    error.message?.includes("fetch failed")) {
                    return reply.status(503).send({
                        error: {
                            code: "SERVICE_UNAVAILABLE",
                            message: "AI service is currently unavailable",
                        },
                    });
                }
                throw error;
            }
        }
    );
};

export default aiRoutes;
