import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/connection";
import { automationRules } from "../../db/schema";

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

const createRuleSchema = z.object({
  name: z.string().min(1),
  triggerType: z.enum(["client.status.changed"]),
  triggerValue: z.string().optional(),
  actionType: z.enum(["send_email", "send_whatsapp", "send_sms"]),
  templateBody: z.string().min(1),
  active: z.boolean().optional(),
});

const updateRuleSchema = createRuleSchema.partial();

const automationRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  app.addHook("onRequest", app.authenticate);

  fastify.get(
    "/",
    {
      schema: {
        description: "List automation rules",
        tags: ["automations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }
      const rules = await app.db.query.automationRules.findMany({
        where: eq(automationRules.organizationId, user.orgId),
        orderBy: [desc(automationRules.createdAt)],
      });
      return reply.send({ rules });
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        description: "Create automation rule",
        tags: ["automations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }
      const data = createRuleSchema.parse(body);
      const [rule] = await app.db
        .insert(automationRules)
        .values({
          organizationId: user.orgId,
          name: data.name,
          triggerType: data.triggerType,
          triggerValue: data.triggerValue,
          actionType: data.actionType,
          templateBody: data.templateBody,
          active: data.active ?? true,
        })
        .returning();

      return reply.code(201).send({ rule });
    }
  );

  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update automation rule",
        tags: ["automations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }
      const { id } = request.params as { id: string };
      const ruleId = parseInt(id, 10);
      if (isNaN(ruleId)) {
        return reply.status(400).send({ message: "Invalid rule ID" });
      }

      const data = updateRuleSchema.parse(body);
      const [rule] = await app.db
        .update(automationRules)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(automationRules.id, ruleId),
            eq(automationRules.organizationId, user.orgId)
          )
        )
        .returning();

      if (!rule) {
        return reply.status(404).send({ message: "Automation rule not found" });
      }

      return reply.send({ rule });
    }
  );
};

export default automationRoutes;
