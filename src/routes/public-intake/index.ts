import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/connection";
import {
  clientActivities,
  clients,
  intakeForms,
  intakeSubmissions,
  type IntakeFieldDef,
} from "../../db/schema";
import { logger } from "../../utils/logger";

type AppFastifyInstance = FastifyInstance & {
  db: Database;
};

const publicSubmissionSchema = z.object({
  answers: z.record(z.unknown()).default({}),
  honeypot: z.string().optional(),
});

const WELL_KNOWN = new Set(["name", "email", "phone", "type", "notes"]);

const normalizeArabicDigits = (value: string) =>
  value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return digit;
  });

const normalizePhone = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") return undefined;
  const cleaned = normalizeArabicDigits(raw).replace(/[^+\d]/g, "");
  return cleaned.length > 0 ? cleaned : undefined;
};

const validateAnswers = (
  fields: IntakeFieldDef[],
  answers: Record<string, unknown>
): { ok: true } | { ok: false; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = answers[field.id];
    const isEmpty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && isEmpty) {
      errors[field.id] = "Required";
      continue;
    }
    if (isEmpty) continue;

    if (field.type === "email" && typeof value === "string") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors[field.id] = "Invalid email";
      }
    }
    if (
      (field.type === "select" || field.type === "radio") &&
      Array.isArray(field.options) &&
      field.options.length > 0
    ) {
      const allowed = field.options.map((o) => o.value);
      if (typeof value === "string" && !allowed.includes(value)) {
        errors[field.id] = "Invalid option";
      }
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true };
};

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
        where: and(
          eq(intakeForms.id, id),
          eq(intakeForms.isActive, true),
          isNull(intakeForms.deletedAt)
        ),
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

      const form = await app.db.query.intakeForms.findFirst({
        where: and(
          eq(intakeForms.id, intakeFormId),
          eq(intakeForms.isActive, true),
          isNull(intakeForms.deletedAt)
        ),
      });

      if (!form) {
        return reply.status(404).send({ message: "Intake form not found" });
      }

      const fields = (form.fieldsJson as IntakeFieldDef[]) || [];
      const answers = data.answers || {};

      const validation = validateAnswers(fields, answers);
      if (!validation.ok) {
        return reply.status(422).send({
          message: "Validation failed",
          errors: validation.errors,
        });
      }

      // Map well-known fields to clients table; rest stays in payload.answers
      const nameVal = answers["name"];
      const emailVal = answers["email"];
      const phoneVal = answers["phone"];
      const typeVal = answers["type"];
      const notesVal = answers["notes"];

      const name =
        typeof nameVal === "string" && nameVal.trim().length > 0
          ? nameVal.trim()
          : "Anonymous";
      const email = typeof emailVal === "string" ? emailVal : undefined;
      const normalizedPhone = normalizePhone(phoneVal);
      const allowedTypes = ["individual", "corporate", "sme", "group"] as const;
      const type =
        typeof typeVal === "string" && (allowedTypes as readonly string[]).includes(typeVal)
          ? (typeVal as (typeof allowedTypes)[number])
          : undefined;
      const notes = typeof notesVal === "string" ? notesVal : undefined;

      const customAnswers: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(answers)) {
        if (!WELL_KNOWN.has(key)) customAnswers[key] = value;
      }

      const [client] = await app.db
        .insert(clients)
        .values({
          organizationId: form.organizationId,
          name,
          email,
          phone: normalizedPhone,
          type,
          notes,
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
          name,
          email,
          phone: typeof phoneVal === "string" ? phoneVal : undefined,
          normalizedPhone,
          type,
          notes,
          answers: customAnswers,
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
