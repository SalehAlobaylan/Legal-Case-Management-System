import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/connection";
import { intakeForms, intakeSubmissions } from "../../db/schema";

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

const fieldDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    "text",
    "email",
    "phone",
    "textarea",
    "select",
    "checkbox",
    "radio",
    "date",
  ]),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
});

const formSchemaShape = z
  .object({
    sections: z
      .array(
        z.object({
          id: z.string(),
          titleEn: z.string().optional(),
          titleAr: z.string().optional(),
          layout: z.enum(["single", "double", "triple"]).optional(),
          order: z.number(),
          fieldIds: z.array(z.string()),
        })
      )
      .default([]),
    logicRules: z
      .array(
        z.object({
          id: z.string(),
          conditions: z.array(
            z.object({
              fieldId: z.string(),
              operator: z.string(),
              value: z.string(),
            })
          ),
          action: z.enum(["show", "hide", "require"]),
          targetFieldIds: z.array(z.string()),
        })
      )
      .default([]),
    theme: z
      .object({
        primaryColor: z.string(),
        borderRadius: z.number(),
        layoutDensity: z.enum(["comfortable", "compact", "spacious"]),
      })
      .optional(),
  })
  .optional()
  .nullable();

const createIntakeFormSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  fieldsJson: z.array(fieldDefSchema).default([]),
  schema: formSchemaShape,
  isActive: z.boolean().optional(),
});

const updateIntakeFormSchema = createIntakeFormSchema.partial();

const intakeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  app.addHook("onRequest", app.authenticate);

  const requireAdmin = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const { user } = request as RequestWithUser;
    if (user.role !== "admin") {
      reply.status(403).send({ message: "Admin access required" });
      return false;
    }
    return true;
  };

  // List forms (excluding soft-deleted)
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
      if (!requireAdmin(request, reply)) return;
      const { user } = request as RequestWithUser;
      const forms = await app.db.query.intakeForms.findMany({
        where: and(
          eq(intakeForms.organizationId, user.orgId),
          isNull(intakeForms.deletedAt)
        ),
        orderBy: [desc(intakeForms.createdAt)],
      });
      return reply.send({ forms });
    }
  );

  // Analytics summary (placed before /:id to avoid conflict)
  fastify.get(
    "/analytics",
    {
      schema: {
        description: "Aggregate analytics for intake forms in current org",
        tags: ["intake"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const { user } = request as RequestWithUser;

      const allForms = await app.db.query.intakeForms.findMany({
        where: and(
          eq(intakeForms.organizationId, user.orgId),
          isNull(intakeForms.deletedAt)
        ),
      });
      const totalForms = allForms.length;
      const activeForms = allForms.filter((f) => f.isActive).length;

      const totalSubmissionsRow = await app.db
        .select({ count: sql<number>`count(*)::int` })
        .from(intakeSubmissions)
        .where(eq(intakeSubmissions.organizationId, user.orgId));
      const totalSubmissions = totalSubmissionsRow[0]?.count ?? 0;

      const since = new Date();
      since.setDate(since.getDate() - 30);

      const recentSubmissionsRow = await app.db
        .select({ count: sql<number>`count(*)::int` })
        .from(intakeSubmissions)
        .where(
          and(
            eq(intakeSubmissions.organizationId, user.orgId),
            gte(intakeSubmissions.createdAt, since)
          )
        );
      const submissionsLast30d = recentSubmissionsRow[0]?.count ?? 0;

      const perFormRows = await app.db
        .select({
          intakeFormId: intakeSubmissions.intakeFormId,
          count: sql<number>`count(*)::int`,
        })
        .from(intakeSubmissions)
        .where(eq(intakeSubmissions.organizationId, user.orgId))
        .groupBy(intakeSubmissions.intakeFormId);

      const perFormMap = new Map<number, number>();
      for (const row of perFormRows) {
        if (row.intakeFormId !== null && row.intakeFormId !== undefined) {
          perFormMap.set(row.intakeFormId, row.count);
        }
      }

      const submissionsPerForm = allForms.map((f) => ({
        formId: f.id,
        title: f.title,
        count: perFormMap.get(f.id) ?? 0,
      }));

      const topForms = [...submissionsPerForm]
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const dailyRows = await app.db
        .select({
          day: sql<string>`to_char(${intakeSubmissions.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(intakeSubmissions)
        .where(
          and(
            eq(intakeSubmissions.organizationId, user.orgId),
            gte(intakeSubmissions.createdAt, since)
          )
        )
        .groupBy(sql`to_char(${intakeSubmissions.createdAt}, 'YYYY-MM-DD')`);

      const dailyMap = new Map(dailyRows.map((r) => [r.day, r.count]));
      const dailySeries: { date: string; count: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailySeries.push({ date: key, count: dailyMap.get(key) ?? 0 });
      }

      return reply.send({
        totalForms,
        activeForms,
        totalSubmissions,
        submissionsLast30d,
        submissionsPerForm,
        topForms,
        dailySeries,
      });
    }
  );

  // Get one
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
      if (!requireAdmin(request, reply)) return;
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const formId = parseInt(id, 10);
      if (isNaN(formId)) {
        return reply.status(400).send({ message: "Invalid form ID" });
      }

      const form = await app.db.query.intakeForms.findFirst({
        where: and(
          eq(intakeForms.id, formId),
          eq(intakeForms.organizationId, user.orgId),
          isNull(intakeForms.deletedAt)
        ),
      });
      if (!form) {
        return reply.status(404).send({ message: "Intake form not found" });
      }

      return reply.send({ form });
    }
  );

  // Create
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
      if (!requireAdmin(request, reply)) return;
      const { user, body } = request as RequestWithUser & { body: unknown };
      const data = createIntakeFormSchema.parse(body);
      const [form] = await app.db
        .insert(intakeForms)
        .values({
          organizationId: user.orgId,
          title: data.title,
          description: data.description ?? null,
          fieldsJson: data.fieldsJson,
          schema: data.schema ?? null,
          isActive: data.isActive ?? true,
        })
        .returning();

      return reply.code(201).send({ form });
    }
  );

  // Update
  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update intake form",
        tags: ["intake"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const { user, body } = request as RequestWithUser & { body: unknown };
      const { id } = request.params as { id: string };
      const formId = parseInt(id, 10);
      if (isNaN(formId)) {
        return reply.status(400).send({ message: "Invalid form ID" });
      }
      const data = updateIntakeFormSchema.parse(body);

      const existing = await app.db.query.intakeForms.findFirst({
        where: and(
          eq(intakeForms.id, formId),
          eq(intakeForms.organizationId, user.orgId),
          isNull(intakeForms.deletedAt)
        ),
      });
      if (!existing) {
        return reply.status(404).send({ message: "Intake form not found" });
      }

      const updates: Partial<typeof intakeForms.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined) updates.description = data.description ?? null;
      if (data.fieldsJson !== undefined) updates.fieldsJson = data.fieldsJson;
      if (data.schema !== undefined) updates.schema = data.schema ?? null;
      if (data.isActive !== undefined) updates.isActive = data.isActive;

      const [form] = await app.db
        .update(intakeForms)
        .set(updates)
        .where(eq(intakeForms.id, formId))
        .returning();

      return reply.send({ form });
    }
  );

  // Soft-delete
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Soft-delete intake form",
        tags: ["intake"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const formId = parseInt(id, 10);
      if (isNaN(formId)) {
        return reply.status(400).send({ message: "Invalid form ID" });
      }

      const existing = await app.db.query.intakeForms.findFirst({
        where: and(
          eq(intakeForms.id, formId),
          eq(intakeForms.organizationId, user.orgId),
          isNull(intakeForms.deletedAt)
        ),
      });
      if (!existing) {
        return reply.status(404).send({ message: "Intake form not found" });
      }

      await app.db
        .update(intakeForms)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(eq(intakeForms.id, formId));

      return reply.send({ success: true });
    }
  );

  // Submissions list (per form)
  fastify.get(
    "/:id/submissions",
    {
      schema: {
        description: "List submissions for a form",
        tags: ["intake"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const formId = parseInt(id, 10);
      if (isNaN(formId)) {
        return reply.status(400).send({ message: "Invalid form ID" });
      }
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(parseInt(query.limit ?? "100", 10) || 100, 500);
      const offset = parseInt(query.offset ?? "0", 10) || 0;

      const form = await app.db.query.intakeForms.findFirst({
        where: and(
          eq(intakeForms.id, formId),
          eq(intakeForms.organizationId, user.orgId)
        ),
      });
      if (!form) {
        return reply.status(404).send({ message: "Intake form not found" });
      }

      const submissions = await app.db.query.intakeSubmissions.findMany({
        where: and(
          eq(intakeSubmissions.intakeFormId, formId),
          eq(intakeSubmissions.organizationId, user.orgId)
        ),
        orderBy: [desc(intakeSubmissions.createdAt)],
        limit,
        offset,
      });

      return reply.send({ submissions, form });
    }
  );

  // Submissions list (all forms in org)
  fastify.get(
    "/submissions/all",
    {
      schema: {
        description: "List all submissions in organization",
        tags: ["intake"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const { user } = request as RequestWithUser;
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(parseInt(query.limit ?? "200", 10) || 200, 500);
      const offset = parseInt(query.offset ?? "0", 10) || 0;

      const submissions = await app.db.query.intakeSubmissions.findMany({
        where: eq(intakeSubmissions.organizationId, user.orgId),
        orderBy: [desc(intakeSubmissions.createdAt)],
        limit,
        offset,
        with: {
          intakeForm: true,
        },
      });

      return reply.send({ submissions });
    }
  );
};

export default intakeRoutes;
