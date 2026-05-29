import {
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
  FastifySchema,
} from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  aiEvaluationLabels,
  aiEvaluationRunCases,
  aiEvaluationRuns,
  cases,
} from "../../db/schema";
import { db } from "../../db/connection";
import { runAiLinkingEvaluation } from "../../services/ai-evaluation.service";

type RequestWithUser = FastifyRequest & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
};

const createLabelSchema = z.object({
  caseId: z.number().int().positive(),
  regulationId: z.number().int().positive(),
});

const runEvaluationSchema = z.object({
  caseIds: z.array(z.number().int().positive()).optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

function assertAdmin(request: RequestWithUser, reply: FastifyReply) {
  if (request.user.role !== "admin") {
    reply.status(403).send({ message: "Admin access required" });
    return false;
  }
  return true;
}

const aiEvaluationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.get(
    "/labels",
    {
      schema: {
        description: "List AI evaluation labels (admin-only)",
        tags: ["ai-evaluation"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as RequestWithUser;
      if (!assertAdmin(req, reply)) return;

      const labels = await db
        .select({
          id: aiEvaluationLabels.id,
          caseId: aiEvaluationLabels.caseId,
          regulationId: aiEvaluationLabels.regulationId,
          createdAt: aiEvaluationLabels.createdAt,
        })
        .from(aiEvaluationLabels)
        .where(eq(aiEvaluationLabels.organizationId, req.user.orgId))
        .orderBy(desc(aiEvaluationLabels.createdAt));

      return reply.send({ labels });
    }
  );

  fastify.post(
    "/labels",
    {
      schema: {
        description: "Create AI evaluation label (admin-only)",
        tags: ["ai-evaluation"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as RequestWithUser;
      if (!assertAdmin(req, reply)) return;

      const parsed = createLabelSchema.parse(request.body);

      const [caseRow] = await db
        .select({ id: cases.id })
        .from(cases)
        .where(and(eq(cases.id, parsed.caseId), eq(cases.organizationId, req.user.orgId)))
        .limit(1);
      if (!caseRow) {
        return reply.status(404).send({ message: "Case not found for this organization" });
      }

      await db
        .insert(aiEvaluationLabels)
        .values({
          organizationId: req.user.orgId,
          caseId: parsed.caseId,
          regulationId: parsed.regulationId,
          createdBy: req.user.id,
        })
        .onConflictDoNothing();

      return reply.send({ success: true });
    }
  );

  fastify.delete(
    "/labels/:id",
    {
      schema: {
        description: "Delete AI evaluation label (admin-only)",
        tags: ["ai-evaluation"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const req = request as RequestWithUser;
      if (!assertAdmin(req, reply)) return;

      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id)) {
        return reply.status(400).send({ message: "Invalid label id" });
      }

      await db
        .delete(aiEvaluationLabels)
        .where(and(eq(aiEvaluationLabels.id, id), eq(aiEvaluationLabels.organizationId, req.user.orgId)));

      return reply.send({ success: true });
    }
  );

  fastify.get(
    "/runs",
    {
      schema: {
        description: "List AI evaluation runs (admin-only)",
        tags: ["ai-evaluation"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as RequestWithUser;
      if (!assertAdmin(req, reply)) return;

      const runs = await db
        .select()
        .from(aiEvaluationRuns)
        .where(eq(aiEvaluationRuns.organizationId, req.user.orgId))
        .orderBy(desc(aiEvaluationRuns.createdAt))
        .limit(25);

      return reply.send({ runs });
    }
  );

  fastify.get(
    "/runs/:id",
    {
      schema: {
        description: "Get single AI evaluation run details (admin-only)",
        tags: ["ai-evaluation"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const req = request as RequestWithUser;
      if (!assertAdmin(req, reply)) return;

      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id)) {
        return reply.status(400).send({ message: "Invalid run id" });
      }

      const [run] = await db
        .select()
        .from(aiEvaluationRuns)
        .where(and(eq(aiEvaluationRuns.id, id), eq(aiEvaluationRuns.organizationId, req.user.orgId)))
        .limit(1);
      if (!run) {
        return reply.status(404).send({ message: "Run not found" });
      }

      const caseRows = await db
        .select()
        .from(aiEvaluationRunCases)
        .where(eq(aiEvaluationRunCases.runId, id));

      return reply.send({ run, cases: caseRows });
    }
  );

  fastify.post(
    "/run",
    {
      schema: {
        description: "Run AI linking evaluation now (admin-only)",
        tags: ["ai-evaluation"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as RequestWithUser;
      if (!assertAdmin(req, reply)) return;

      const body = runEvaluationSchema.parse(request.body || {});

      try {
        const updatedRun = await runAiLinkingEvaluation(db, {
          organizationId: req.user.orgId,
          createdBy: req.user.id,
          topK: body.topK,
          caseIds: body.caseIds,
        });
        return reply.send({ run: updatedRun });
      } catch (error) {
        const message = error instanceof Error ? error.message : "evaluation_failed";
        return reply.status(500).send({ message });
      }
    }
  );

  fastify.get(
    "/cases/:caseId/summary",
    {
      schema: {
        description: "Get latest evaluation summary for a case (admin-only)",
        tags: ["ai-evaluation"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { caseId: string } }>,
      reply: FastifyReply
    ) => {
      const req = request as RequestWithUser;
      if (!assertAdmin(req, reply)) return;

      const caseId = Number.parseInt(request.params.caseId, 10);
      if (!Number.isFinite(caseId)) {
        return reply.status(400).send({ message: "Invalid case id" });
      }

      const [latestRun] = await db
        .select({
          id: aiEvaluationRuns.id,
        })
        .from(aiEvaluationRuns)
        .where(
          and(
            eq(aiEvaluationRuns.organizationId, req.user.orgId),
            eq(aiEvaluationRuns.status, "completed")
          )
        )
        .orderBy(desc(aiEvaluationRuns.createdAt))
        .limit(1);

      if (!latestRun) {
        return reply.send({ summary: null });
      }

      const [row] = await db
        .select()
        .from(aiEvaluationRunCases)
        .where(and(eq(aiEvaluationRunCases.runId, latestRun.id), eq(aiEvaluationRunCases.caseId, caseId)))
        .limit(1);

      return reply.send({ summary: row || null, runId: latestRun.id });
    }
  );
};

export default aiEvaluationRoutes;
