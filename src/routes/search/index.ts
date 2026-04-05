import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { ilike, or, eq, and, desc } from "drizzle-orm";
import { cases, clients, regulations } from "../../db/schema";
import type { Database } from "../../db/connection";

type RequestWithUser = FastifyRequest & {
  user: { id: string; email: string; role: string; orgId: number };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  db: Database;
};

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  app.addHook("onRequest", app.authenticate);

  fastify.get(
    "/",
    {
      schema: {
        description:
          "Unified search across cases, clients, and regulations",
        tags: ["search"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", minLength: 2 },
            limit: { type: "number", default: 5 },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { q, limit = 5 } = request.query as {
        q: string;
        limit?: number;
      };
      const searchTerm = `%${q}%`;

      const [matchedCases, matchedClients, matchedRegulations] =
        await Promise.all([
          app.db.query.cases.findMany({
            where: and(
              eq(cases.organizationId, user.orgId),
              or(
                ilike(cases.title, searchTerm),
                ilike(cases.caseNumber, searchTerm)
              )
            ),
            orderBy: [desc(cases.updatedAt)],
            limit,
            columns: {
              id: true,
              caseNumber: true,
              title: true,
              caseType: true,
              status: true,
            },
          }),
          app.db.query.clients.findMany({
            where: and(
              eq(clients.organizationId, user.orgId),
              ilike(clients.name, searchTerm)
            ),
            orderBy: [desc(clients.createdAt)],
            limit,
            columns: {
              id: true,
              name: true,
              type: true,
              status: true,
            },
          }),
          app.db.query.regulations.findMany({
            where: or(
              ilike(regulations.title, searchTerm),
              ilike(regulations.regulationNumber, searchTerm)
            ),
            orderBy: [desc(regulations.updatedAt)],
            limit,
            columns: {
              id: true,
              title: true,
              regulationNumber: true,
              category: true,
              status: true,
            },
          }),
        ]);

      return reply.send({
        cases: matchedCases,
        clients: matchedClients,
        regulations: matchedRegulations,
      });
    }
  );
};

export default searchRoutes;
