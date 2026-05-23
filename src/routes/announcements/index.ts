/*
 * Announcements routes plugin
 *
 * - Mounted at `/api/announcements` (see app.ts).
 * - Coordination, not surveillance: admins post short messages that show as a
 *   banner on every team member's dashboard. Members dismiss locally; admins
 *   retire/delete server-side.
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/connection";
import {
  announcementSeverityEnum,
  orgAnnouncements,
} from "../../db/schema/org-announcements";
import { AuditLogService } from "../../services/audit-log.service";
import { requireAdmin } from "../../lib/require-admin";

type RequestWithUser = FastifyRequest & {
  user: { id: string; email: string; role: string; orgId: number };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
};

const severitySchema = z.enum(announcementSeverityEnum);

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  severity: severitySchema.optional(),
  // ISO string acceptable; null clears.
  expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
});

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  severity: severitySchema.optional(),
  expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

const announcementsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  app.addHook("onRequest", app.authenticate);

  /**
   * GET /api/announcements/active
   *
   * - Any authenticated org member. Returns up to 5 currently-active
   *   announcements, severity-sorted then newest-first.
   */
  fastify.get(
    "/active",
    {
      schema: {
        description: "List active announcements visible to org members",
        tags: ["announcements"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      const rows = await db
        .select()
        .from(orgAnnouncements)
        .where(
          and(
            eq(orgAnnouncements.organizationId, user.orgId),
            eq(orgAnnouncements.isActive, true),
            or(
              isNull(orgAnnouncements.expiresAt),
              gt(orgAnnouncements.expiresAt, new Date())
            )
          )
        )
        // Severity custom ordering: important > warning > info, then newest.
        .orderBy(
          sql`CASE ${orgAnnouncements.severity}
                WHEN 'important' THEN 0
                WHEN 'warning' THEN 1
                ELSE 2
              END ASC`,
          desc(orgAnnouncements.createdAt)
        )
        .limit(5);

      return reply.send({ announcements: rows });
    }
  );

  /**
   * GET /api/announcements
   *
   * - Admin-only. Returns all announcements for the org (active + retired).
   */
  fastify.get(
    "/",
    {
      schema: {
        description: "List all announcements for the org (admin)",
        tags: ["announcements"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;
      const rows = await db
        .select()
        .from(orgAnnouncements)
        .where(eq(orgAnnouncements.organizationId, user.orgId))
        .orderBy(desc(orgAnnouncements.createdAt));
      return reply.send({ announcements: rows });
    }
  );

  /**
   * POST /api/announcements
   *
   * - Admin-only. Creates a new announcement.
   */
  fastify.post(
    "/",
    {
      schema: {
        description: "Create an announcement",
        tags: ["announcements"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      if (!requireAdmin(request, reply)) return;
      const data = createAnnouncementSchema.parse(body);

      const auditService = new AuditLogService(db, request.log);
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(orgAnnouncements)
          .values({
            organizationId: user.orgId,
            createdByUserId: user.id,
            title: data.title,
            body: data.body,
            severity: data.severity ?? "info",
            isActive: true,
            expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          })
          .returning();
        await auditService.logTx(tx, {
          organizationId: user.orgId,
          actorUserId: user.id,
          action: "announcement.create",
          targetType: "announcement",
          targetId: row.id,
          payload: { title: row.title, severity: row.severity },
        });
        return row;
      });

      return reply.code(201).send({ announcement: created });
    }
  );

  /**
   * PATCH /api/announcements/:id
   *
   * - Admin-only. Edit any field; commonly used to flip `isActive=false`
   *   ("retire") without deleting.
   */
  fastify.patch(
    "/:id",
    {
      schema: {
        description: "Update an announcement",
        tags: ["announcements"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const { id } = request.params as { id: string };
      if (!requireAdmin(request, reply)) return;
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return reply.status(400).send({ message: "Invalid id" });
      }
      const data = updateAnnouncementSchema.parse(body);

      const existing = await db
        .select({ id: orgAnnouncements.id, organizationId: orgAnnouncements.organizationId })
        .from(orgAnnouncements)
        .where(eq(orgAnnouncements.id, numericId))
        .limit(1);
      if (!existing[0]) {
        return reply.status(404).send({ message: "Announcement not found" });
      }
      if (existing[0].organizationId !== user.orgId) {
        return reply.status(403).send({ message: "Cross-organization access denied" });
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof data.title === "string") patch.title = data.title;
      if (typeof data.body === "string") patch.body = data.body;
      if (typeof data.severity === "string") patch.severity = data.severity;
      if (typeof data.isActive === "boolean") patch.isActive = data.isActive;
      if (data.expiresAt !== undefined)
        patch.expiresAt = data.expiresAt === null ? null : new Date(data.expiresAt);

      const auditService = new AuditLogService(db, request.log);
      // Distinguish "retire" (isActive flipped to false) from a generic update.
      const action = data.isActive === false ? "announcement.retire" : null;
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(orgAnnouncements)
          .set(patch)
          .where(eq(orgAnnouncements.id, numericId))
          .returning();
        if (action) {
          await auditService.logTx(tx, {
            organizationId: user.orgId,
            actorUserId: user.id,
            action,
            targetType: "announcement",
            targetId: row.id,
            payload: { title: row.title },
          });
        }
        return row;
      });

      return reply.send({ announcement: updated });
    }
  );

  /**
   * DELETE /api/announcements/:id
   *
   * - Admin-only. Hard delete. Use PATCH with isActive=false to retire
   *   without losing the row.
   */
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete an announcement",
        tags: ["announcements"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      if (!requireAdmin(request, reply)) return;
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return reply.status(400).send({ message: "Invalid id" });
      }
      const [existing] = await db
        .select({ id: orgAnnouncements.id, organizationId: orgAnnouncements.organizationId })
        .from(orgAnnouncements)
        .where(eq(orgAnnouncements.id, numericId))
        .limit(1);
      if (!existing) {
        return reply.status(404).send({ message: "Announcement not found" });
      }
      if (existing.organizationId !== user.orgId) {
        return reply.status(403).send({ message: "Cross-organization access denied" });
      }
      const auditService = new AuditLogService(db, request.log);
      await db.transaction(async (tx) => {
        await tx
          .delete(orgAnnouncements)
          .where(eq(orgAnnouncements.id, numericId));
        await auditService.logTx(tx, {
          organizationId: user.orgId,
          actorUserId: user.id,
          action: "announcement.delete",
          targetType: "announcement",
          targetId: numericId,
          payload: {},
        });
      });

      return reply.code(204).send();
    }
  );
};

export default announcementsRoutes;
