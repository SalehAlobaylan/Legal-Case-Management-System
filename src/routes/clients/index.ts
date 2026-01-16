/*
 * Clients routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/clients` prefix.
 * - Provides full CRUD operations for managing legal clients.
 * - All routes require JWT authentication.
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { ClientService } from "../../services/client.service";
import type { Database } from "../../db/connection";
import { z } from "zod";

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

// Zod schemas for validation
const createClientSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["individual", "corporate", "sme", "group"]).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const updateClientSchema = createClientSchema.partial();

const clientsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes require authentication
  app.addHook("onRequest", app.authenticate);

  /**
   * POST /api/clients
   *
   * - Creates a new client for the authenticated user's organization.
   */
  fastify.post(
    "/",
    {
      schema: {
        description: "Create a new client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const data = createClientSchema.parse(body);

      const clientService = new ClientService(app.db);
      const client = await clientService.createClient({
        ...data,
        organizationId: user.orgId,
      });

      return reply.code(201).send({ client });
    }
  );

  /**
   * GET /api/clients
   *
   * - Lists all clients for the authenticated user's organization.
   * - Supports optional filters for type and status.
   */
  fastify.get(
    "/",
    {
      schema: {
        description: "Get all clients for organization",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["individual", "corporate", "sme", "group"],
            },
            status: { type: "string", enum: ["active", "inactive"] },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { type, status } = request.query as {
        type?: string;
        status?: string;
      };

      const clientService = new ClientService(app.db);
      const clientsList = await clientService.getClientsByOrganization(
        user.orgId,
        { type, status }
      );

      return reply.send({ clients: clientsList });
    }
  );

  /**
   * GET /api/clients/:id
   *
   * - Gets a single client by ID.
   */
  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get client by ID",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      const clientService = new ClientService(app.db);
      const client = await clientService.getClientById(clientId, user.orgId);

      return reply.send({ client });
    }
  );

  /**
   * PUT /api/clients/:id
   *
   * - Updates a client's information.
   */
  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      const data = updateClientSchema.parse(body);

      const clientService = new ClientService(app.db);
      const client = await clientService.updateClient(clientId, user.orgId, data);

      return reply.send({ client });
    }
  );

  /**
   * DELETE /api/clients/:id
   *
   * - Deletes a client by ID.
   */
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      const clientService = new ClientService(app.db);
      await clientService.deleteClient(clientId, user.orgId);

      return reply.code(204).send();
    }
  );

  /**
   * GET /api/clients/:id/cases
   *
   * - Gets all cases for a specific client.
   */
  fastify.get(
    "/:id/cases",
    {
      schema: {
        description: "Get all cases for a client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      const clientService = new ClientService(app.db);
      const cases = await clientService.getClientCases(clientId, user.orgId);

      return reply.send({ cases });
    }
  );
};

export default clientsRoutes;
