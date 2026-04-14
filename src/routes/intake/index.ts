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
import { intakeForms } from "../../db/schema";

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

const createIntakeFormSchema = z.object({
  title: z.string().min(1),
  fieldsJson: z.array(z.record(z.unknown())).default([]),
});

const intakeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  app.addHook("onRequest", app.authenticate);

  fastify.get(
    "/",
    {
      schema: {
        description: "List intake forms for current organization",
        tags: ["intake"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }
      const forms = await app.db.query.intakeForms.findMany({
        where: eq(intakeForms.organizationId, user.orgId),
        orderBy: [desc(intakeForms.createdAt)],
      });
      return reply.send({ forms });
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        description: "Create intake form",
        tags: ["intake"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }
      const data = createIntakeFormSchema.parse(body);
      const [form] = await app.db
        .insert(intakeForms)
        .values({
          organizationId: user.orgId,
          title: data.title,
          fieldsJson: data.fieldsJson,
        })
        .returning();

      return reply.code(201).send({ form });
    }
  );

  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get intake form",
        tags: ["intake"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }
      const { id } = request.params as { id: string };
      const formId = parseInt(id, 10);
      if (isNaN(formId)) {
        return reply.status(400).send({ message: "Invalid form ID" });
      }

      const form = await app.db.query.intakeForms.findFirst({
        where: and(eq(intakeForms.id, formId), eq(intakeForms.organizationId, user.orgId)),
      });
      if (!form) {
        return reply.status(404).send({ message: "Intake form not found" });
      }

      return reply.send({ form });
    }
  );
};

export default intakeRoutes;
