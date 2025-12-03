/*
 * Cases routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/cases` prefix (when mounted in `app.ts`).
 * - Exposes CRUD routes for managing legal cases within an organization:
 *   - Create a case (`POST /`)
 *   - List cases with optional filters (`GET /`)
 *   - Get a single case by id (`GET /:id`)
 *   - Update a case (`PUT /:id`)
 *   - Delete a case (`DELETE /:id`)
 * - All routes require JWT authentication via the `fastify.authenticate` hook and
 *   include basic OpenAPI/Swagger metadata (tags, descriptions, security).
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import {
  createCaseHandler,
  deleteCaseHandler,
  getCaseByIdHandler,
  getCasesHandler,
  updateCaseHandler,
} from "./handlers";

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
};

const casesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes require authentication via JWT
  app.addHook("onRequest", app.authenticate);

  // POST /api/cases
  // - Creates a new case in the authenticated user's organization.
  // - Automatically assigns the current user as the `assignedLawyerId`.
  fastify.post(
    "/",
    {
      schema: {
        description: "Create a new case",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    createCaseHandler as any
  );

  // GET /api/cases
  // - Returns all cases for the authenticated user's organization.
  // - Supports optional query filters: `status`, `caseType`, `assignedLawyerId`.
  fastify.get(
    "/",
    {
      schema: {
        description: "Get all cases for organization",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    getCasesHandler as any
  );

  // GET /api/cases/:id
  // - Returns a single case by id, ensuring it belongs to the user's organization.
  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get case by ID",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    getCaseByIdHandler as any
  );

  // PUT /api/cases/:id
  // - Updates an existing case in the user's organization.
  // - Validates and normalizes incoming data (e.g., date fields) in the handler.
  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update case",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    updateCaseHandler as any
  );

  // DELETE /api/cases/:id
  // - Deletes a case from the user's organization.
  // - Returns HTTP 204 on success.
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete case",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    deleteCaseHandler as any
  );
};

export default casesRoutes;
