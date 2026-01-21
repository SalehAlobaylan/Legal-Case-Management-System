/*
 * AI routes plugin
 *
 * - Registers HTTP endpoints for AI-powered features under `/api/ai` prefix.
 * - Provides legal assistant chat and case analysis capabilities.
 * - All routes require JWT authentication.
 */

import {
    FastifyInstance,
    FastifyPluginAsync,
    FastifyReply,
    FastifyRequest,
    FastifySchema,
} from "fastify";
import { AIClientService } from "../../services/ai-client.service";
import { CaseService } from "../../services/case.service";
import type { Database } from "../../db/connection";
import { regulations } from "../../db/schema";
import { inArray } from "drizzle-orm";

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
    context?: {
        caseId?: number;
        regulationIds?: number[];
    };
    history?: { role: string; content: string }[];
}

const aiRoutes: FastifyPluginAsync = async (fastify) => {
    const app = fastify as AuthenticatedFastifyInstance;

    // All routes require authentication
    app.addHook("onRequest", app.authenticate);

    /**
     * POST /api/ai/chat
     *
     * Legal assistant chat interface.
     * Supports context from cases or regulations.
     */
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
                // Handle AI service unavailable
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

    /**
     * POST /api/ai/cases/:caseId/analyze
     *
     * Generate comprehensive AI analysis of a case.
     */
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
                // Handle AI service unavailable
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
