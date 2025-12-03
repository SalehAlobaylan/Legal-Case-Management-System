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
import { CaseService } from "../../services/case.service";
import {
  CreateCaseInput,
  GetCasesQuery,
  UpdateCaseInput,
  createCaseSchema,
  getCasesQuerySchema,
  updateCaseSchema,
} from "./schemas";
import type { Database } from "../../db/connection";

type RequestWithUserAndDb = FastifyRequest & {
  user: {
    id: number;
    email: string;
    role: string;
    orgId: number;
  };
  server: FastifyInstance & {
    db: Database;
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
  const data = createCaseSchema.parse(body as CreateCaseInput);

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
  const filters = getCasesQuerySchema.parse(query as GetCasesQuery);

  const caseService = new CaseService(server.db);
  const casesList = await caseService.getCasesByOrganization(
    user.orgId,
    filters
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
  const id = parseInt(params.id, 10);

  const caseService = new CaseService(server.db);
  const case_ = await caseService.getCaseById(id, user.orgId);

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
  const id = parseInt(params.id, 10);
  const data = updateCaseSchema.parse(body as UpdateCaseInput);

  const caseService = new CaseService(server.db);
  const updated = await caseService.updateCase(id, user.orgId, {
    ...data,
    // Keep `filingDate` as a DATE string (or null) to match the Drizzle column type
    filingDate: data.filingDate ?? null,
    nextHearing: data.nextHearing ? new Date(data.nextHearing) : undefined,
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
  const id = parseInt(params.id, 10);

  const caseService = new CaseService(server.db);
  await caseService.deleteCase(id, user.orgId);

  return reply.code(204).send();
}
