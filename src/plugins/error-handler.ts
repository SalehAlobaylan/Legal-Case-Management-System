/**
 * Centralized Fastify error handler.
 *
 * Produces the canonical envelope:
 *   { error: { code, message, details?, traceId, timestamp } }
 *
 * Cascade order:
 *   1. ZodError              -> VALIDATION_FAILED (with flattened issues)
 *   2. AppError              -> passthrough via toResponse(traceId)
 *   3. Known Fastify codes   -> mapped to canonical codes
 *   4. PG SQLSTATE           -> mapDbError()
 *   5. Catch-all             -> INTERNAL_ERROR (500)
 */

import { FastifyPluginAsync, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";
import { ERROR_CODES, type ErrorCode } from "../errors/codes";
import { mapDbError } from "../utils/db-errors";
import { logger } from "../utils/logger";
import { env } from "../config/env";

const FASTIFY_CODE_MAP: Record<string, ErrorCode> = {
  FST_ERR_VALIDATION: "VALIDATION_FAILED",
  FST_ERR_RATE_LIMIT: "RATE_LIMIT_EXCEEDED",
  FST_ERR_CTP_BODY_TOO_LARGE: "FILE_TOO_LARGE",
  FST_REQ_FILE_TOO_LARGE: "FILE_TOO_LARGE",
  FAST_JWT_EXPIRED: "AUTH_TOKEN_EXPIRED",
  FST_JWT_AUTHORIZATION_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  FST_JWT_NO_AUTHORIZATION_IN_HEADER: "AUTH_TOKEN_MISSING",
  FST_JWT_AUTHORIZATION_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
};

function flattenZod(error: ZodError) {
  return {
    issues: error.errors.map((e) => ({
      path: Array.isArray(e.path) ? e.path.join(".") : String(e.path),
      code: e.code,
      message: e.message,
    })),
  };
}

function buildEnvelope(
  code: ErrorCode,
  traceId: string,
  opts: { message?: string; details?: unknown } = {}
) {
  const def = ERROR_CODES[code];
  return {
    error: {
      code,
      message: opts.message ?? def.defaultMessage,
      ...(opts.details !== undefined ? { details: opts.details } : {}),
      traceId,
      timestamp: new Date().toISOString(),
    },
  };
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    const traceId = String(request.id);
    const isDev = env.NODE_ENV !== "production";

    logger.error({
      err: error,
      url: request.url,
      method: request.method,
      traceId,
    });

    // 1. Zod validation errors
    if (error instanceof ZodError) {
      const envelope = buildEnvelope("VALIDATION_FAILED", traceId, {
        details: flattenZod(error),
      });
      return reply.code(ERROR_CODES.VALIDATION_FAILED.status).send(envelope);
    }

    // 2. Our AppError hierarchy
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toResponse(traceId));
    }

    // 3. Known Fastify error codes
    const fastifyErr = error as FastifyError;
    if (fastifyErr.code && FASTIFY_CODE_MAP[fastifyErr.code]) {
      const code = FASTIFY_CODE_MAP[fastifyErr.code];
      const envelope = buildEnvelope(code, traceId, {
        message: fastifyErr.message || undefined,
      });
      return reply.code(ERROR_CODES[code].status).send(envelope);
    }

    // 4. PG SQLSTATE mapping (Drizzle / pg driver)
    const dbMapped = mapDbError(error);
    if (dbMapped) {
      return reply.code(dbMapped.statusCode).send(dbMapped.toResponse(traceId));
    }

    // 4b. Fastify-supplied statusCode for unmapped HTTP errors
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const HTTP_STATUS_MAP: Partial<Record<number, ErrorCode>> = {
        400: "VALIDATION_BAD_FORMAT",
        401: "AUTH_TOKEN_INVALID",
        403: "AUTHZ_FORBIDDEN",
        404: "NOT_FOUND_ROUTE",
        408: "EXTERNAL_AI_TIMEOUT",
        409: "CONFLICT_RESOURCE_EXISTS",
        413: "FILE_TOO_LARGE",
        415: "FILE_UNSUPPORTED_TYPE",
        429: "RATE_LIMIT_EXCEEDED",
      };
      const code = HTTP_STATUS_MAP[status] ?? "VALIDATION_BAD_FORMAT";
      const envelope = buildEnvelope(code, traceId, {
        message: fastifyErr.message || undefined,
      });
      return reply.code(ERROR_CODES[code].status).send(envelope);
    }

    // 5. Catch-all
    const envelope = buildEnvelope("INTERNAL_ERROR", traceId, {
      details: isDev
        ? {
            originalMessage: (error as Error)?.message,
            stack: (error as Error)?.stack,
          }
        : undefined,
    });
    return reply.code(ERROR_CODES.INTERNAL_ERROR.status).send(envelope);
  });
};

export default fp(errorHandlerPlugin, {
  name: "error-handler",
});
