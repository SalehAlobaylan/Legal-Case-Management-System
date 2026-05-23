/**
 * Backward-compatibility shim.
 *
 * The canonical AppError hierarchy lives in `src/errors/AppError.ts`.
 * This file is kept so existing imports (`from "../utils/errors"`) keep working.
 * Sweep imports and delete this shim in Phase 6.
 */

export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  FileError,
  type ErrorEnvelope,
} from "../errors/AppError";

export { ERROR_CODES, type ErrorCode, type ErrorDomain, isErrorCode } from "../errors/codes";
