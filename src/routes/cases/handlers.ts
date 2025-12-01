/*
 * Case route handlers
 *
 * - Contain the concrete Fastify handler functions for the `/api/cases` endpoints.
 * - Use Zod schemas to validate incoming request bodies and query parameters before
 *   delegating to `CaseService` for database operations and business rules.
 * - Assume that `request.user` has been populated by the JWT auth plugin
 *   (`fastify.authenticate`) and use the user's organization id to enforce access control.
 */

import { FastifyReply, FastifyRequest } from "fastify";
import { CaseService } from "../../services/case.service";
import {
  CreateCaseInput,
  GetCasesQuery,
  UpdateCaseInput,
  createCaseSchema,
  getCasesQuerySchema,
  updateCaseSchema,
} from "./schemas";

/*
 * createCaseHandler
 *
 * - Validates the request body with `createCaseSchema`.
 * - Enriches the payload with `organizationId` from `request.user!.orgId` and
 *   converts date strings to `Date` instances where provided.
 * - Calls `CaseService.createCase` and returns a `201` response with `{ case }`.
 */
export async function createCaseHandler(
  request: FastifyRequest<{ Body: CreateCaseInput }>,
  reply: FastifyReply
) {
  const data = createCaseSchema.parse(request.body);

  const caseService = new CaseService(request.server.db);
  const newCase = await caseService.createCase(
    {
      ...data,
      organizationId: request.user!.orgId,
      // `filingDate` is stored as a DATE string in the database, so we keep it as-is
      // (or set it to null) instead of converting to a JavaScript Date.
      filingDate: data.filingDate ?? null,
      nextHearing: data.nextHearing ? new Date(data.nextHearing) : undefined,
    },
    request.user!.id
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
  request: FastifyRequest<{ Querystring: GetCasesQuery }>,
  reply: FastifyReply
) {
  const filters = getCasesQuerySchema.parse(request.query);

  const caseService = new CaseService(request.server.db);
  const cases = await caseService.getCasesByOrganization(
    request.user!.orgId,
    filters
  );

  return reply.send({ cases });
}

/*
 * getCaseByIdHandler
 *
 * - Parses the `id` route parameter as an integer.
 * - Calls `CaseService.getCaseById`, which enforces that the case belongs to the
 *   current user's organization, and returns `{ case }`.
 */
export async function getCaseByIdHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const id = parseInt(request.params.id, 10);

  const caseService = new CaseService(request.server.db);
  const case_ = await caseService.getCaseById(id, request.user!.orgId);

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
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateCaseInput }>,
  reply: FastifyReply
) {
  const id = parseInt(request.params.id, 10);
  const data = updateCaseSchema.parse(request.body);

  const caseService = new CaseService(request.server.db);
  const updated = await caseService.updateCase(id, request.user!.orgId, {
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
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const id = parseInt(request.params.id, 10);

  const caseService = new CaseService(request.server.db);
  await caseService.deleteCase(id, request.user!.orgId);

  return reply.code(204).send();
}
