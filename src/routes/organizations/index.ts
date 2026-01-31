/*
 * Organizations route plugin
 *
 * - Registers HTTP endpoints under the `/api/organizations` prefix.
 * - Provides CRUD operations for organizations:
 *   - GET /api/organizations - List all organizations
 *   - POST /api/organizations - Create a new organization
 *   - GET /api/organizations/:id - Get a single organization
 *   - PATCH /api/organizations/:id - Update an organization
 *   - DELETE /api/organizations/:id - Delete an organization
 * - All endpoints except GET /api/organizations require authentication.
 * - Includes OpenAPI/Swagger documentation.
 */

import { FastifyPluginAsync } from "fastify";
import { OrganizationService } from "../../services/organization.service";

const organizationsRoutes: FastifyPluginAsync = async (fastify) => {
  const organizationResponseSchema = {
    type: "object",
    properties: {
      id: { type: "number" },
      name: { type: "string" },
      country: { type: "string" },
      subscriptionTier: { type: "string" },
      licenseNumber: { type: "string" },
      contactInfo: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  } as const;

  // GET /api/organizations
  // - Lists all organizations (public endpoint for registration dropdown)
  fastify.get(
    "/",
    {
      schema: {
        description: "List all organizations",
        tags: ["organizations"],
        response: {
          200: {
            type: "object",
            properties: {
              organizations: {
                type: "array",
                items: organizationResponseSchema,
              },
              total: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const organizationService = new OrganizationService(request.server.db);
      const organizations = await organizationService.getAll();
      return reply.send({
        organizations,
        total: organizations.length,
      });
    }
  );

  // GET /api/organizations/:id
  // - Get a single organization by ID (requires authentication)
  fastify.get(
    "/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Get organization by ID",
        tags: ["organizations"],
        params: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              organization: organizationResponseSchema,
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const organizationService = new OrganizationService(request.server.db);
      const { id } = request.params as { id: number };
      const organization = await organizationService.getById(id);

      if (!organization) {
        return reply.code(404).send({ error: "Organization not found" });
      }

      return reply.send({ organization });
    }
  );

  // POST /api/organizations
  // - Create a new organization (requires authentication)
  fastify.post(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Create a new organization",
        tags: ["organizations"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 2 },
            country: { type: "string", minLength: 2, maxLength: 2 },
            subscriptionTier: { type: "string" },
            licenseNumber: { type: "string" },
            contactInfo: { type: "string" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              organization: organizationResponseSchema,
            },
          },
          409: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const organizationService = new OrganizationService(request.server.db);
      const data = request.body as {
        name: string;
        country?: string;
        subscriptionTier?: string;
        licenseNumber?: string;
        contactInfo?: string;
      };

      try {
        const organization = await organizationService.create(data);
        return reply.code(201).send({ organization });
      } catch (error) {
        if (error instanceof Error && error.message === "Organization already exists") {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    }
  );

  // PATCH /api/organizations/:id
  // - Update an organization (requires authentication)
  fastify.patch(
    "/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Update an organization",
        tags: ["organizations"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 2 },
            country: { type: "string", minLength: 2, maxLength: 2 },
            subscriptionTier: { type: "string" },
            licenseNumber: { type: "string" },
            contactInfo: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              organization: organizationResponseSchema,
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const organizationService = new OrganizationService(request.server.db);
      const { id } = request.params as { id: number };
      const data = request.body as {
        name?: string;
        country?: string;
        subscriptionTier?: string;
        licenseNumber?: string;
        contactInfo?: string;
      };

      const organization = await organizationService.update(id, data);

      if (!organization) {
        return reply.code(404).send({ error: "Organization not found" });
      }

      return reply.send({ organization });
    }
  );

  // DELETE /api/organizations/:id
  // - Delete an organization (requires authentication)
  fastify.delete(
    "/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Delete an organization",
        tags: ["organizations"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const organizationService = new OrganizationService(request.server.db);
      const { id } = request.params as { id: number };

      const organization = await organizationService.delete(id);

      if (!organization) {
        return reply.code(404).send({ error: "Organization not found" });
      }

      return reply.send({ message: "Organization deleted successfully" });
    }
  );
};

export default organizationsRoutes;
