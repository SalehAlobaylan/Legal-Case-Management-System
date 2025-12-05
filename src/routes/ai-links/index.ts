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

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
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
      const caseId = Number.parseInt(request.params.caseId, 10);

      if (Number.isNaN(caseId)) {
        return reply.status(400).send({
          message: "Invalid caseId parameter",
        });
      }

      const caseService = new CaseService(fastify.db);
      const case_ = await caseService.getCaseById(caseId, request.user!.orgId);

      const aiService = new AIClientService();
      const matches = await aiService.findRelatedRegulations(
        `${case_.title}\n\n${case_.description || ""}`,
        10
      );

      const linkService = new LinkService(fastify.db);
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
      const caseId = Number.parseInt(request.params.caseId, 10);

      if (Number.isNaN(caseId)) {
        return reply.status(400).send({
          message: "Invalid caseId parameter",
        });
      }

      const caseService = new CaseService(fastify.db);
      await caseService.getCaseById(caseId, request.user!.orgId);

      const linkService = new LinkService(fastify.db);
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
      const linkId = Number.parseInt(request.params.linkId, 10);

      if (Number.isNaN(linkId)) {
        return reply.status(400).send({
          message: "Invalid linkId parameter",
        });
      }

      const linkService = new LinkService(fastify.db);
      const link = await linkService.verifyLink(linkId, request.user!.id);

      return reply.send({ link });
    }
  );
};

export default aiLinksRoutes;




