import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { AIClientService } from "../../services/ai-client.service";
import { LinkService } from "../../services/link.service";
import { CaseService } from "../../services/case.service";
import type { Database } from "../../db/connection";

type RequestWithUser<P> = FastifyRequest<{ Params: P }> & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  broadcastToOrg: (orgId: number, event: string, data: any) => void;
  db: Database;
};

const aiLinksRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes in this plugin require JWT authentication.
  app.addHook("onRequest", app.authenticate);

  /**
   * POST /api/ai-links/:caseId/generate
   *
   * - Generates AI-powered regulation suggestions for a given case.
   * - Delegates similarity calculation to the external AI microservice and
   *   persists the resulting links in `case_regulation_links`.
   */
  fastify.post(
    "/:caseId/generate",
    {
      schema: {
        description: "Generate AI-based regulation links for a case",
        tags: ["ai-links"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { caseId: string } }>,
      reply: FastifyReply
    ) => {
      const { params, user } = request as RequestWithUser<{ caseId: string }>;
      const caseId = Number.parseInt(params.caseId, 10);

      if (Number.isNaN(caseId)) {
        return reply.status(400).send({
          message: "Invalid caseId parameter",
        });
      }

      const caseService = new CaseService(app.db);
      const case_ = await caseService.getCaseById(caseId, user.orgId);

      const aiService = new AIClientService();
      const matches = await aiService.findRelatedRegulations(
        `${case_.title}\n\n${case_.description || ""}`,
        10
      );

      const linkService = new LinkService(app.db);
      const links = await Promise.all(
        matches.map((match) =>
          linkService.createLink({
            caseId,
            regulationId: match.regulation_id,
            similarityScore: match.similarity_score.toString(),
            method: "ai",
          })
        )
      );

      // Notify all connected clients in the same organization in real-time
      if (typeof app.broadcastToOrg === "function" && user) {
        app.broadcastToOrg(user.orgId, "ai-links.generated", {
          caseId,
          links,
        });
      }

      return reply.send({ links });
    }
  );

  /**
   * GET /api/ai-links/:caseId
   *
   * - Returns all AI (and manually) created links for a given case,
   *   ordered by similarity score descending.
   */
  fastify.get(
    "/:caseId",
    {
      schema: {
        description: "Get AI-generated regulation links for a case",
        tags: ["ai-links"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { caseId: string } }>,
      reply: FastifyReply
    ) => {
      const { params, user } = request as RequestWithUser<{ caseId: string }>;
      const caseId = Number.parseInt(params.caseId, 10);

      if (Number.isNaN(caseId)) {
        return reply.status(400).send({
          message: "Invalid caseId parameter",
        });
      }

      const caseService = new CaseService(app.db);
      await caseService.getCaseById(caseId, user.orgId);

      const linkService = new LinkService(app.db);
      const links = await linkService.getLinksByCaseId(caseId);

      return reply.send({ links });
    }
  );

  /**
   * POST /api/ai-links/:linkId/verify
   *
   * - Marks a specific link as verified by the authenticated user.
   */
  fastify.post(
    "/:linkId/verify",
    {
      schema: {
        description: "Verify an AI-generated regulation link",
        tags: ["ai-links"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { linkId: string } }>,
      reply: FastifyReply
    ) => {
      const { params, user } = request as RequestWithUser<{ linkId: string }>;
      const linkId = Number.parseInt(params.linkId, 10);

      if (Number.isNaN(linkId)) {
        return reply.status(400).send({
          message: "Invalid linkId parameter",
        });
      }

      const linkService = new LinkService(app.db);
      const link = await linkService.verifyLink(linkId, user.id);

      // Broadcast verification event so clients can update UI in real-time
      if (typeof app.broadcastToOrg === "function" && user) {
        app.broadcastToOrg(user.orgId, "ai-links.verified", {
          linkId,
          verifiedBy: user.id,
        });
      }

      return reply.send({ link });
    }
  );

  /**
   * DELETE /api/ai-links/:linkId
   *
   * - Dismisses (removes) a specific AI-generated regulation link.
   * - Used when a user decides the suggestion is not relevant.
   */
  fastify.delete(
    "/:linkId",
    {
      schema: {
        description: "Dismiss (remove) an AI-generated regulation link",
        tags: ["ai-links"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (
      request: FastifyRequest<{ Params: { linkId: string } }>,
      reply: FastifyReply
    ) => {
      const { params, user } = request as RequestWithUser<{ linkId: string }>;
      const linkId = Number.parseInt(params.linkId, 10);

      if (Number.isNaN(linkId)) {
        return reply.status(400).send({
          message: "Invalid linkId parameter",
        });
      }

      const linkService = new LinkService(app.db);
      await linkService.deleteLink(linkId);

      // Broadcast dismiss event so clients can update UI in real-time
      if (typeof app.broadcastToOrg === "function" && user) {
        app.broadcastToOrg(user.orgId, "ai-links.dismissed", {
          linkId,
          dismissedBy: user.id,
        });
      }

      return reply.code(204).send();
    }
  );
};

export default aiLinksRoutes;
