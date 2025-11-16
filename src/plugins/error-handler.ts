import { FastifyPluginAsync, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "../utils/errors";
import { ZodError } from "zod";
import { logger } from "../utils/logger";

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(
    (error: FastifyError | AppError | ZodError, request, reply) => {
      logger.error({
        err: error,
        url: request.url,
        method: request.method,
      });

      // Zod validation errors
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: "Validation Error",
          details: error.errors,
        });
      }

      // Custom app errors
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }

      // Fastify errors
      if ((error as any).statusCode) {
        return reply.code((error as any).statusCode).send({
          error: (error as any).message,
        });
      }

      // Unknown errors
      return reply.code(500).send({
        error: "Internal Server Error",
      });
    }
  );
};

export default fp(errorHandlerPlugin, {
  name: "error-handler",
});

