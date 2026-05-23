/**
 * Unified AppError hierarchy for the Silah-Legal backend.
 *
 * The base AppError takes a canonical ErrorCode and reads its HTTP status
 * from the registry. Subclasses preserve the legacy single-string constructor
 * signatures (e.g. `new ValidationError("Invalid id")`) so existing call sites
 * keep working without sweeping changes.
 *
 * Use `toResponse(traceId)` to produce the canonical envelope:
 *   { error: { code, message, details?, traceId, timestamp } }
 */

import { ERROR_CODES, type ErrorCode } from "./codes";

export interface ErrorEnvelope {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
    traceId: string;
    timestamp: string;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    details?: unknown,
    messageOverride?: string
  ) {
    const def = ERROR_CODES[code];
    super(messageOverride ?? def.defaultMessage);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = def.status;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toResponse(traceId: string): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
        traceId,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Legacy single-string `(message)` signature preserved.
 * Pass structured details via the second arg when needed.
 */
export class ValidationError extends AppError {
  constructor(message?: string, details?: unknown) {
    super("VALIDATION_FAILED", details, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message?: string, code: ErrorCode = "AUTH_TOKEN_INVALID") {
    super(code, undefined, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message?: string, code: ErrorCode = "AUTHZ_FORBIDDEN") {
    super(code, undefined, message);
  }
}

/**
 * Legacy: `new NotFoundError("Client")` -> "Client not found".
 * Pass a code-based override via the second arg if needed.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, code: ErrorCode = "NOT_FOUND_RESOURCE") {
    super(code, { resource }, `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = "CONFLICT_RESOURCE_EXISTS") {
    super(code, undefined, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message?: string, code: ErrorCode = "RATE_LIMIT_EXCEEDED") {
    super(code, undefined, message);
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    service: "ai" | "tavily" | "oauth",
    code: ErrorCode = "EXTERNAL_AI_UNAVAILABLE",
    details?: unknown
  ) {
    const extra =
      details && typeof details === "object"
        ? details
        : details !== undefined
          ? { info: details }
          : {};
    super(code, { service, ...extra });
  }
}

export class FileError extends AppError {
  constructor(
    code: "FILE_REQUIRED" | "FILE_TOO_LARGE" | "FILE_UNSUPPORTED_TYPE" | "FILE_STORAGE_FAILED",
    details?: unknown,
    message?: string
  ) {
    super(code, details, message);
  }
}
