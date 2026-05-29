/*
 * Admin AI Intelligence routes
 *
 * - Registered inside the admin plugin (so they live under `/api/admin` and
 *   inherit its `authenticate` onRequest hook). All routes are admin-only and
 *   org-scoped.
 * - Read path (`GET /summary`) is cheap; refreshes recompute + persist.
 * - `evaluation/run` delegates to the shared AI-evaluation runner and audits.
 */

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { z } from "zod";
import { db } from "../../db/connection";
import { requireAdmin } from "../../lib/require-admin";
import { AdminAIIntelligenceService } from "../../services/admin-ai-intelligence.service";
import { AuditLogService } from "../../services/audit-log.service";
import { runAiLinkingEvaluation } from "../../services/ai-evaluation.service";

type RequestWithUser = FastifyRequest & {
  user: { id: string; email: string; role: string; orgId: number };
};

const runEvaluationSchema = z.object({
  caseIds: z.array(z.number().int().positive()).optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

const adminSchema = (description: string): FastifySchema =>
  ({
    description,
    tags: ["admin", "ai-intelligence"],
    security: [{ bearerAuth: [] }],
  }) as FastifySchema;

export async function registerAiIntelligenceRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/ai-intelligence/summary",
    { schema: adminSchema("Admin AI intelligence summary (persisted profiles + org snapshot)") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;

      const service = new AdminAIIntelligenceService(db, undefined, request.log);
      const summary = await service.getSummary(user.orgId);
      return reply.send(summary);
    }
  );

  fastify.post(
    "/ai-intelligence/refresh",
    { schema: adminSchema("Recompute AI risk profiles + org snapshot for the organization") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;

      const service = new AdminAIIntelligenceService(db, undefined, request.log);
      const summary = await service.refreshOrg(user.orgId, user.id);
      return reply.send(summary);
    }
  );

  fastify.post(
    "/ai-intelligence/cases/:id/refresh",
    { schema: adminSchema("Recompute the AI risk profile for a single case") },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;

      const caseId = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(caseId)) {
        return reply.status(400).send({ message: "Invalid case id" });
      }

      const service = new AdminAIIntelligenceService(db, undefined, request.log);
      const profile = await service.refreshCaseProfile(user.orgId, caseId, user.id);
      if (!profile) {
        return reply.status(404).send({ message: "Case not found for this organization" });
      }
      return reply.send({ profile });
    }
  );

  fastify.post(
    "/ai-intelligence/evaluation/run",
    { schema: adminSchema("Run AI linking evaluation now (delegates to the shared runner)") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;

      const body = runEvaluationSchema.parse(request.body || {});
      try {
        const run = await runAiLinkingEvaluation(db, {
          organizationId: user.orgId,
          createdBy: user.id,
          topK: body.topK,
          caseIds: body.caseIds,
        });

        await new AuditLogService(db, request.log).log({
          organizationId: user.orgId,
          actorUserId: user.id,
          action: "admin.ai_evaluation.run",
          targetType: "ai_evaluation_run",
          targetId: run?.id,
          payload: { topK: body.topK ?? 10, caseIds: body.caseIds ?? null },
        });

        return reply.send({ run });
      } catch (error) {
        const message = error instanceof Error ? error.message : "evaluation_failed";
        return reply.status(500).send({ message });
      }
    }
  );
}
