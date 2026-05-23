/*
 * Case route handlers
 *
 * - Contain the concrete Fastify handler functions for the `/api/cases` endpoints.
 * - Use Zod schemas to validate incoming request bodies and query parameters before
 *   delegating to `CaseService` for database operations and business rules.
 * - Assume that `request.user` has been populated by the JWT auth plugin
 *   (`fastify.authenticate`) and use the user's organization id to enforce access control.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CaseService, type CaseAccessContext } from "../../services/case.service";
import { PermissionService } from "../../services/permission.service";
import {
  CreateCaseInput,
  GetCasesQuery,
  UpdateCaseInput,
  createCaseSchema,
  getCasesQuerySchema,
  updateCaseSchema,
} from "./schemas";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { users } from "../../db/schema/users";
import { isClosedStatus } from "../../db/schema/cases";
import { ProfileService } from "../../services/profile.service";
import { AuditLogService } from "../../services/audit-log.service";
import type { Database } from "../../db/connection";
import { DocumentExtractionService } from "../../services/document-extraction.service";
import { NotificationDeliveryService } from "../../services/notification-delivery.service";
import { getScopedClientIdForUser } from "../../lib/request-context";
import { buildAccessContext } from "../../lib/access-context";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";

type RequestWithUserAndDb = FastifyRequest & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
  server: FastifyInstance & {
    db: Database;
    emitToUser?: (
      userId: string,
      event: string,
      data: Record<string, unknown>
    ) => void;
  };
};

/*
 * createCaseHandler
 *
 * - Validates the request body with `createCaseSchema`.
 * - Enriches the payload with `organizationId` from `request.user!.orgId` and
 *   converts date strings to `Date` instances where provided.
 * - Calls `CaseService.createCase` and returns a `201` response with `{ case }`.
 */
export async function createCaseHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { body, user, server } = request as RequestWithUserAndDb;
  const scopedClientId = await getScopedClientIdForUser(server.db, user);
  const data = createCaseSchema.parse(body as CreateCaseInput);

  if (typeof scopedClientId === "number") {
    return reply.code(403).send({ message: "Client accounts cannot create cases" });
  }

  const caseService = new CaseService(server.db);
  const newCase = await caseService.createCase(
    {
      ...data,
      organizationId: user.orgId,
      // `filingDate` is stored as a DATE string in the database, so we keep it as-is
      // (or set it to null) instead of converting to a JavaScript Date.
      filingDate: data.filingDate ?? null,
      nextHearing: data.nextHearing ? new Date(data.nextHearing) : undefined,
    },
    user.id
  );

  // Activity row first — a notification-delivery failure must not lose the
  // activity-feed entry the admin dashboard reads from.
  await new ProfileService(server.db).recordActivity(
    user.id,
    "case",
    "created",
    `${newCase.caseNumber} — ${newCase.title}`,
    newCase.id
  );

  const notificationDelivery = new NotificationDeliveryService(
    server.db,
    server.emitToUser
  );
  await notificationDelivery.notifyOrganization({
    organizationId: user.orgId,
    type: "case_update",
    category: "caseUpdates",
    title: `Case created: ${newCase.caseNumber}`,
    message: newCase.title,
    relatedCaseId: newCase.id,
  });

  return reply.code(201).send({ case: newCase });
}

/*
 * getCasesHandler
 *
 * - Validates the query string with `getCasesQuerySchema` (status, caseType,
 *   assignedLawyerId).
 * - Calls `CaseService.getCasesByOrganization` scoped to the current user's
 *   organization and returns `{ cases }`.
 */
export async function getCasesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { query, user, server } = request as RequestWithUserAndDb;
  const scopedClientId = await getScopedClientIdForUser(server.db, user);
  const filters = getCasesQuerySchema.parse(query as GetCasesQuery);

  const caseService = new CaseService(server.db);
  const access = await buildAccessContext(server.db, user);
  const casesList = await caseService.getCasesByOrganization(
    user.orgId,
    filters,
    scopedClientId,
    access
  );

  return reply.send({ cases: casesList });
}

/*
 * getCaseByIdHandler
 *
 * - Parses the `id` route parameter as an integer.
 * - Calls `CaseService.getCaseById`, which enforces that the case belongs to the
 *   current user's organization, and returns `{ case }`.
 */
export async function getCaseByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { params, user, server } = request as RequestWithUserAndDb & {
    params: { id: string };
  };
  const scopedClientId = await getScopedClientIdForUser(server.db, user);
  const id = parseInt(params.id, 10);

  const caseService = new CaseService(server.db);
  const access = await buildAccessContext(server.db, user);
  const case_ = await caseService.getCaseById(
    id,
    user.orgId,
    scopedClientId,
    access
  );

  return reply.send({ case: case_ });
}

/*
 * updateCaseHandler
 *
 * - Parses the `id` route parameter and validates the request body using
 *   `updateCaseSchema`.
 * - Normalizes date fields and delegates to `CaseService.updateCase`, which
 *   verifies organization ownership and applies the update.
 * - Returns the updated case in `{ case }`.
 */
export async function updateCaseHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { params, body, user, server } = request as RequestWithUserAndDb & {
    params: { id: string };
  };
  const scopedClientId = await getScopedClientIdForUser(server.db, user);
  const id = parseInt(params.id, 10);

  if (typeof scopedClientId === "number") {
    return reply.code(403).send({ message: "Client accounts cannot update cases" });
  }
  const data = updateCaseSchema.parse(body as UpdateCaseInput);

  const caseService = new CaseService(server.db);
  const access = await buildAccessContext(server.db, user);
  const existingCase = await caseService.getCaseById(
    id,
    user.orgId,
    scopedClientId,
    access
  );

  // Closure gate — if the org requires admin approval to close and the caller
  // lacks `delegated.cases.close` (admin's `*` always passes), refuse the
  // status transition into closed/archived.
  const transitioningClosed =
    typeof data.status === "string" &&
    isClosedStatus(data.status) &&
    !isClosedStatus(existingCase.status);
  if (transitioningClosed) {
    if (
      access.orgPrivacy.adminClosureRequired &&
      !PermissionService.can(access.effectivePermissions, "delegated.cases.close")
    ) {
      throw new ForbiddenError(
        "Closing this case requires admin approval"
      );
    }
  }

  const updated = await caseService.updateCase(
    id,
    user.orgId,
    {
      ...data,
      // Keep `filingDate` as a DATE string (or null) to match the Drizzle column type
      filingDate: data.filingDate ?? null,
      nextHearing: data.nextHearing ? new Date(data.nextHearing) : undefined,
    },
    scopedClientId,
    access
  );

  const titleChanged =
    typeof data.title === "string" && data.title !== existingCase.title;
  const descriptionChanged =
    typeof data.description !== "undefined" &&
    (data.description || "") !== (existingCase.description || "");
  if (titleChanged || descriptionChanged) {
    const extractionService = new DocumentExtractionService(server.db);
    await extractionService.markCaseInsightsStale(id, user.orgId);
  }

  // Activity row first — same reason as createCaseHandler. Mark `closed` when
  // this update transitioned the case into a terminal status so the admin UI
  // can distinguish it from generic updates.
  const closedNow =
    typeof data.status === "string" &&
    isClosedStatus(data.status) &&
    !isClosedStatus(existingCase.status);
  await new ProfileService(server.db).recordActivity(
    user.id,
    "case",
    closedNow ? "closed" : "updated",
    `${updated.caseNumber} — ${updated.title}`,
    updated.id
  );

  const notificationDelivery = new NotificationDeliveryService(
    server.db,
    server.emitToUser
  );
  await notificationDelivery.notifyOrganization({
    organizationId: user.orgId,
    type: "case_update",
    category: "caseUpdates",
    title: `Case updated: ${updated.caseNumber}`,
    message: updated.title,
    relatedCaseId: updated.id,
  });

  return reply.send({ case: updated });
}

/*
 * deleteCaseHandler
 *
 * - Parses the `id` route parameter and delegates to `CaseService.deleteCase`,
 *   which confirms the case belongs to the current user's organization before
 *   deleting it.
 * - Returns a `204 No Content` response on success.
 */
export async function deleteCaseHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { params, user, server } = request as RequestWithUserAndDb & {
    params: { id: string };
  };
  const scopedClientId = await getScopedClientIdForUser(server.db, user);
  const id = parseInt(params.id, 10);

  if (typeof scopedClientId === "number") {
    return reply.code(403).send({ message: "Client accounts cannot delete cases" });
  }

  const caseService = new CaseService(server.db);
  const access = await buildAccessContext(server.db, user);

  // Read the case before delete so we can log a useful activity title.
  const existing = await caseService.getCaseById(id, user.orgId, scopedClientId, access);
  await caseService.deleteCase(id, user.orgId, scopedClientId, access);

  await new ProfileService(server.db).recordActivity(
    user.id,
    "case",
    "deleted",
    `Deleted ${existing.caseNumber} — ${existing.title}`
  );

  return reply.code(204).send();
}

/*
 * assignCaseHandler
 *
 * - PATCH /api/cases/:id/assign
 * - Body: { assignedLawyerId: string | null }
 * - Allowed for callers with the `cases.assign` permission OR a lawyer
 *   unassigning themselves (assignedLawyerId === null && case.assignedLawyerId === caller.id).
 * - Validates the target lawyer belongs to the same organization.
 */
const assignCaseSchema = z.object({
  assignedLawyerId: z.string().uuid().nullable(),
});

export async function assignCaseHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { params, body, user, server } = request as RequestWithUserAndDb & {
    params: { id: string };
  };
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    throw new ValidationError("Invalid case id");
  }

  const { assignedLawyerId } = assignCaseSchema.parse(body);

  const caseService = new CaseService(server.db);
  const access = await buildAccessContext(server.db, user);

  // Fetch the case (also enforces org + visibility scoping)
  const existing = await caseService.getCaseById(id, user.orgId, null, access);

  const callerCanAssign = PermissionService.can(
    access.effectivePermissions,
    "delegated.cases.assign"
  );
  const isSelfUnassign =
    assignedLawyerId === null && existing.assignedLawyerId === user.id;

  if (!callerCanAssign && !isSelfUnassign) {
    throw new ForbiddenError("You don't have permission to assign cases");
  }

  // If assigning to someone, verify they exist and belong to the same org
  if (assignedLawyerId) {
    const [targetUser] = await server.db
      .select({ id: users.id, fullName: users.fullName, organizationId: users.organizationId })
      .from(users)
      .where(and(eq(users.id, assignedLawyerId), eq(users.organizationId, user.orgId)))
      .limit(1);
    if (!targetUser) {
      throw new NotFoundError("Target lawyer in this organization");
    }
  }

  const updated = await caseService.assignCase(
    id,
    user.orgId,
    assignedLawyerId,
    access
  );

  await new ProfileService(server.db).recordActivity(
    user.id,
    "case",
    "assigned",
    assignedLawyerId
      ? `Assigned case ${updated.caseNumber}`
      : `Unassigned case ${updated.caseNumber}`,
    updated.id
  );

  return reply.send({ case: updated });
}

/*
 * bulkAssignCasesHandler
 *
 * - POST /api/cases/bulk/assign
 * - Body: { caseIds: number[], assignedLawyerId: string | null }
 * - Requires `delegated.cases.assign` (or admin's wildcard).
 * - Validates the target lawyer is in the same org when assignedLawyerId is set.
 * - Writes an audit row.
 */
const bulkAssignSchema = z.object({
  caseIds: z.array(z.number().int().positive()).min(1).max(200),
  assignedLawyerId: z.string().uuid().nullable(),
});

export async function bulkAssignCasesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { body, user, server } = request as RequestWithUserAndDb;
  const data = bulkAssignSchema.parse(body);

  const caseService = new CaseService(server.db);
  const access = await buildAccessContext(server.db, user);

  const callerCanAssign = PermissionService.can(
    access.effectivePermissions,
    "delegated.cases.assign"
  );
  if (!callerCanAssign) {
    throw new ForbiddenError("You don't have permission to assign cases");
  }

  if (data.assignedLawyerId) {
    const [targetUser] = await server.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, data.assignedLawyerId),
          eq(users.organizationId, user.orgId)
        )
      )
      .limit(1);
    if (!targetUser) {
      throw new NotFoundError("Target lawyer in this organization");
    }
  }

  const updated = await caseService.bulkAssignCases(
    data.caseIds,
    user.orgId,
    data.assignedLawyerId,
    access
  );

  // Best-effort audit — the bulk update has already committed via CaseService.
  // targetId is varchar(100) — pack the id list into the jsonb payload instead
  // so a large bulk doesn't get silently truncated.
  await new AuditLogService(server.db, request.log).log({
    organizationId: user.orgId,
    actorUserId: user.id,
    action: "case.bulk_assign",
    targetType: "cases",
    payload: {
      assignedLawyerId: data.assignedLawyerId,
      caseIds: data.caseIds,
      count: updated.length,
    },
  });

  return reply.send({ updated });
}
