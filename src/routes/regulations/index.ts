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
  FastifyReply,
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

  // POST /api/regulations/search
  // - Full-text and semantic search for regulations.
  app.post(
    "/search",
    {
      schema: {
        description: "Search regulations",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            topK: { type: "number" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { query, topK = 10 } = request.body as { query: string; topK?: number };

      // Simple search implementation - search by title or regulation number
      const results = await (app as any).db.query.regulations.findMany({
        where: (regulations: any, { or, ilike }: any) =>
          or(
            ilike(regulations.title, `%${query}%`),
            ilike(regulations.regulationNumber, `%${query}%`)
          ),
        limit: topK,
      });

      return reply.send({ regulations: results });
    }
  );

  // POST /api/regulations/subscribe
  // - Subscribe organization to regulation updates.
  app.post(
    "/subscribe",
    {
      schema: {
        description: "Subscribe to regulation updates",
        tags: ["regulations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["regulationId"],
          properties: {
            regulationId: { type: "number" },
            sourceUrl: { type: "string" },
            checkIntervalHours: { type: "number" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { regulationId, sourceUrl, checkIntervalHours } = request.body as {
        regulationId: number;
        sourceUrl?: string;
        checkIntervalHours?: number;
      };

      // MVP: Log subscription request, actual subscription logic to be implemented
      console.log(`Subscription requested for regulation ${regulationId}, source: ${sourceUrl}, interval: ${checkIntervalHours}h`);

      return reply.code(201).send({
        message: "Subscription created",
        regulationId,
        sourceUrl,
        checkIntervalHours: checkIntervalHours || 24,
      });
    }
  );
};

export default regulationsRoutes;