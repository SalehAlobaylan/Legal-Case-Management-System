/*
 * Regulations routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/regulations` prefix (when mounted in `app.ts`).
 * - Exposes routes for managing regulations and viewing their version history:
 *   - Create a regulation (`POST /`)
 *   - List regulations with optional filters (`GET /`)
 *   - Get a single regulation by id (`GET /:id`)
 *   - Update a regulation (`PUT /:id`)
 *   - List versions for a regulation (`GET /:id/versions`)
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
  createRegulationHandler,
  getRegulationByIdHandler,
  getRegulationVersionsHandler,
  getRegulationsHandler,
  updateRegulationHandler,
} from "./handlers";

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
};

const regulationsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes require authentication via JWT
  app.addHook("onRequest", app.authenticate);

  // POST /api/regulations
  // - Creates a new regulation record.
  app.post(
    "/",
    {
      schema: {
        description: "Create a new regulation",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    createRegulationHandler as any
  );

  // GET /api/regulations
  // - Returns all regulations with optional filters for category and status.
  app.get(
    "/",
    {
      schema: {
        description: "Get all regulations",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    getRegulationsHandler as any
  );

  // GET /api/regulations/:id
  // - Returns a single regulation by id.
  app.get(
    "/:id",
    {
      schema: {
        description: "Get regulation by ID",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    getRegulationByIdHandler as any
  );

  // PUT /api/regulations/:id
  // - Updates an existing regulation.
  app.put(
    "/:id",
    {
      schema: {
        description: "Update regulation",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    updateRegulationHandler as any
  );

  // GET /api/regulations/:id/versions
  // - Lists all versions for a given regulation, newest first.
  app.get(
    "/:id/versions",
    {
      schema: {
        description: "Get regulation versions",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    getRegulationVersionsHandler as any
  );
};

export default regulationsRoutes;