/*
 * Regulation route handlers
 *
 * - Contain the concrete Fastify handler functions for the `/api/regulations` endpoints.
 * - Use Zod schemas to validate incoming request bodies and query parameters before
 *   delegating to `RegulationService` for database operations and business rules.
 * - Assume that `request.user` has been populated by the JWT auth plugin
 *   (`fastify.authenticate`) and that `request.server.db` is available via the
 *   database plugin.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { RegulationService } from "../../services/regulation.service";
import {
  CreateRegulationInput,
  GetRegulationsQuery,
  UpdateRegulationInput,
  createRegulationSchema,
  getRegulationsQuerySchema,
  updateRegulationSchema,
} from "./schemas";
import type { Database } from "../../db/connection";

type RequestWithUserAndDb = FastifyRequest & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
  server: FastifyInstance & {
    db: Database;
  };
};

/*
 * createRegulationHandler
 *
 * - Validates the request body with `createRegulationSchema`.
 * - Normalizes the `effectiveDate` field to `string | null` to match the Drizzle
 *   column type.
 * - Calls `RegulationService.createRegulation` and returns a `201` response
 *   with `{ regulation }`.
 */
export async function createRegulationHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { body, server } = request as RequestWithUserAndDb;
  const data = createRegulationSchema.parse(body as CreateRegulationInput);

  const regulationService = new RegulationService(server.db);
  const regulation = await regulationService.createRegulation({
    ...data,
    effectiveDate: data.effectiveDate ?? null,
  });

  return reply.code(201).send({ regulation });
}

/*
 * getRegulationsHandler
 *
 * - Validates the query string with `getRegulationsQuerySchema` (category, status).
 * - Calls `RegulationService.getAllRegulations` and returns `{ regulations }`.
 */
export async function getRegulationsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { query, server } = request as RequestWithUserAndDb;
  const filters = getRegulationsQuerySchema.parse(query as GetRegulationsQuery);

  const regulationService = new RegulationService(server.db);
  const regulations = await regulationService.getAllRegulations(filters);

  return reply.send({ regulations });
}

/*
 * getRegulationByIdHandler
 *
 * - Parses the `id` route parameter as an integer.
 * - Calls `RegulationService.getRegulationById` and returns `{ regulation }`.
 */
export async function getRegulationByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { params, server } = request as RequestWithUserAndDb & {
    params: { id: string };
  };
  const id = parseInt(params.id, 10);

  const regulationService = new RegulationService(server.db);
  const regulation = await regulationService.getRegulationById(id);

  return reply.send({ regulation });
}

/*
 * updateRegulationHandler
 *
 * - Parses the `id` route parameter and validates the request body using
 *   `updateRegulationSchema`.
 * - Normalizes the `effectiveDate` field and delegates to
 *   `RegulationService.updateRegulation`.
 * - Returns the updated regulation in `{ regulation }`.
 */
export async function updateRegulationHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { params, body, server } = request as RequestWithUserAndDb & {
    params: { id: string };
  };
  const id = parseInt(params.id, 10);
  const data = updateRegulationSchema.parse(body as UpdateRegulationInput);

  const regulationService = new RegulationService(server.db);
  const updated = await regulationService.updateRegulation(id, {
    ...data,
    effectiveDate: data.effectiveDate ?? null,
  });

  return reply.send({ regulation: updated });
}

/*
 * getRegulationVersionsHandler
 *
 * - Parses the `id` route parameter as the regulation id.
 * - Calls `RegulationService.getVersionsByRegulationId` and returns `{ versions }`.
 */
export async function getRegulationVersionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { params, server } = request as RequestWithUserAndDb & {
    params: { id: string };
  };
  const id = parseInt(params.id, 10);

  const regulationService = new RegulationService(server.db);
  const versions = await regulationService.getVersionsByRegulationId(id);

  return reply.send({ versions });
}


