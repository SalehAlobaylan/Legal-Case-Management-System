import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/connection";
import { clientActivities, clients, intakeForms, intakeSubmissions } from "../../db/schema";
import { logger } from "../../utils/logger";

type AppFastifyInstance = FastifyInstance & {
  db: Database;
};

const publicSubmissionSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  type: z.enum(["individual", "corporate", "sme", "group"]).optional(),
  notes: z.string().optional(),
  answers: z.record(z.unknown()).optional(),
  honeypot: z.string().optional(),
});

const publicIntakeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AppFastifyInstance;

  fastify.get(
    "/:formId",
    {
      config: {
        rateLimit: { max: 100, timeWindow: "1 minute" },
      },
      schema: {
        description: "Get public intake form by ID",
        tags: ["public-intake"],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { formId } = request.params as { formId: string };
      const id = parseInt(formId, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: "Invalid form ID" });
      }

      const form = await app.db.query.intakeForms.findFirst({
        where: eq(intakeForms.id, id),
      });

      if (!form) {
        return reply.status(404).send({ message: "Intake form not found" });
      }

      return reply.send({ form });
    }
  );

  fastify.post(
    "/:formId",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
      schema: {
        description: "Submit public intake form",
        tags: ["public-intake"],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { formId } = request.params as { formId: string };
      const intakeFormId = parseInt(formId, 10);

      if (isNaN(intakeFormId)) {
        return reply.status(400).send({ message: "Invalid form ID" });
      }

      const data = publicSubmissionSchema.parse(request.body);
      if (data.honeypot && data.honeypot.trim().length > 0) {
        return reply.code(200).send({ success: true });
      }

      const normalizeArabicDigits = (value: string) =>
        value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
          const code = digit.charCodeAt(0);
          if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
          if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
          return digit;
        });

      const normalizedPhone = data.phone
        ? normalizeArabicDigits(data.phone).replace(/[^+\d]/g, "")
        : undefined;

      const form = await app.db.query.intakeForms.findFirst({
        where: eq(intakeForms.id, intakeFormId),
      });

      if (!form) {
        return reply.status(404).send({ message: "Intake form not found" });
      }

      const [client] = await app.db
        .insert(clients)
        .values({
          organizationId: form.organizationId,
          name: data.name,
          email: data.email,
          phone: normalizedPhone,
          type: data.type,
          notes: data.notes,
          leadStatus: "lead",
        })
        .returning();

      await app.db.insert(clientActivities).values({
        clientId: client.id,
        type: "system",
        description: "Lead generated via public intake form",
        metadata: {
          intakeFormId,
          source: "public_form",
        },
      });

      await app.db.insert(intakeSubmissions).values({
        intakeFormId,
        organizationId: form.organizationId,
        payload: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          normalizedPhone,
          notes: data.notes,
          answers: data.answers || {},
        },
      });

      logger.info(
        {
          organizationId: form.organizationId,
          intakeFormId,
          clientId: client.id,
        },
        "Public intake submission converted to CRM lead"
      );

      return reply.code(201).send({
        success: true,
        clientId: client.id,
      });
    }
  );
};

export default publicIntakeRoutes;
