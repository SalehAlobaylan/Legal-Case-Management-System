/**
 * Canonical error code registry for the Silah-Legal backend.
 *
 * Each code maps to exactly one HTTP status (single-status-per-code rule).
 * Frontend mirrors these keys in src/lib/api/error-codes.ts; AI service
 * has its own subset in ai_service/app/errors/codes.py.
 *
 * The `defaultMessage` is the English fallback returned in the response
 * envelope. Frontend prefers its own i18n translation keyed by the code.
 */

export type ErrorDomain =
  | "AUTH"
  | "AUTHZ"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "DB"
  | "EXTERNAL"
  | "OAUTH"
  | "FILE"
  | "BILLING"
  | "INTERNAL"
  | "AI";

export interface ErrorDef {
  status: number;
  defaultMessage: string;
  domain: ErrorDomain;
}

export const ERROR_CODES = {
  // AUTH (401)
  AUTH_INVALID_CREDENTIALS: {
    status: 401,
    defaultMessage: "Invalid email or password",
    domain: "AUTH",
  },
  AUTH_TOKEN_MISSING: {
    status: 401,
    defaultMessage: "Authentication token is missing",
    domain: "AUTH",
  },
  AUTH_TOKEN_EXPIRED: {
    status: 401,
    defaultMessage: "Authentication token has expired",
    domain: "AUTH",
  },
  AUTH_TOKEN_INVALID: {
    status: 401,
    defaultMessage: "Authentication token is invalid",
    domain: "AUTH",
  },
  AUTH_ACCOUNT_DISABLED: {
    status: 401,
    defaultMessage: "Account has been disabled",
    domain: "AUTH",
  },
  AUTH_EMAIL_NOT_VERIFIED: {
    status: 401,
    defaultMessage: "Email address is not verified",
    domain: "AUTH",
  },

  // AUTHZ (403)
  AUTHZ_FORBIDDEN: {
    status: 403,
    defaultMessage: "You do not have permission to perform this action",
    domain: "AUTHZ",
  },
  AUTHZ_RESOURCE_ACCESS_DENIED: {
    status: 403,
    defaultMessage: "Access denied to this resource",
    domain: "AUTHZ",
  },
  AUTHZ_ROLE_REQUIRED: {
    status: 403,
    defaultMessage: "This action requires a different role",
    domain: "AUTHZ",
  },
  AUTHZ_CLIENT_ACCOUNT_RESTRICTED: {
    status: 403,
    defaultMessage: "Client accounts cannot perform this action",
    domain: "AUTHZ",
  },

  // VALIDATION (400)
  VALIDATION_FAILED: {
    status: 400,
    defaultMessage: "One or more fields are invalid",
    domain: "VALIDATION",
  },
  VALIDATION_INVALID_ID: {
    status: 400,
    defaultMessage: "The provided ID is invalid",
    domain: "VALIDATION",
  },
  VALIDATION_MISSING_BODY: {
    status: 400,
    defaultMessage: "Request body is required",
    domain: "VALIDATION",
  },
  VALIDATION_BAD_FORMAT: {
    status: 400,
    defaultMessage: "The request format is invalid",
    domain: "VALIDATION",
  },

  // NOT_FOUND (404)
  NOT_FOUND_RESOURCE: {
    status: 404,
    defaultMessage: "The requested resource was not found",
    domain: "NOT_FOUND",
  },
  NOT_FOUND_ROUTE: {
    status: 404,
    defaultMessage: "The requested endpoint does not exist",
    domain: "NOT_FOUND",
  },

  // CONFLICT (409)
  CONFLICT_RESOURCE_EXISTS: {
    status: 409,
    defaultMessage: "A resource with these details already exists",
    domain: "CONFLICT",
  },
  CONFLICT_INVALID_STATE: {
    status: 409,
    defaultMessage: "The resource cannot be modified in its current state",
    domain: "CONFLICT",
  },
  CONFLICT_DEPENDENCY: {
    status: 409,
    defaultMessage:
      "This resource is referenced by other records and cannot be removed",
    domain: "CONFLICT",
  },

  // RATE_LIMIT (429)
  RATE_LIMIT_EXCEEDED: {
    status: 429,
    defaultMessage: "Too many requests, please slow down",
    domain: "RATE_LIMIT",
  },
  RATE_LIMIT_QUOTA_EXHAUSTED: {
    status: 429,
    defaultMessage: "Daily quota exhausted",
    domain: "RATE_LIMIT",
  },

  // DB
  DB_UNIQUE_VIOLATION: {
    status: 409,
    defaultMessage: "A record with these unique values already exists",
    domain: "DB",
  },
  DB_FOREIGN_KEY_VIOLATION: {
    status: 409,
    defaultMessage: "This action references a missing related record",
    domain: "DB",
  },
  DB_NOT_NULL_VIOLATION: {
    status: 400,
    defaultMessage: "A required field is missing",
    domain: "DB",
  },
  DB_STRING_TOO_LONG: {
    status: 400,
    defaultMessage: "A field exceeds its maximum length",
    domain: "DB",
  },
  DB_INVALID_TEXT_REPRESENTATION: {
    status: 400,
    defaultMessage: "A field has an invalid value",
    domain: "DB",
  },
  DB_SCHEMA_OUT_OF_DATE: {
    status: 500,
    defaultMessage:
      "Database schema appears out of date. Run backend migrations and restart the server.",
    domain: "DB",
  },
  DB_CONNECTION_FAILED: {
    status: 503,
    defaultMessage: "Database is temporarily unavailable",
    domain: "DB",
  },

  // EXTERNAL
  EXTERNAL_AI_UNAVAILABLE: {
    status: 502,
    defaultMessage: "The AI service is temporarily unavailable",
    domain: "EXTERNAL",
  },
  EXTERNAL_AI_TIMEOUT: {
    status: 504,
    defaultMessage: "The AI service did not respond in time",
    domain: "EXTERNAL",
  },
  EXTERNAL_AI_BAD_RESPONSE: {
    status: 502,
    defaultMessage: "The AI service returned an unexpected response",
    domain: "EXTERNAL",
  },
  EXTERNAL_TAVILY_DISABLED: {
    status: 503,
    defaultMessage: "Web research is disabled",
    domain: "EXTERNAL",
  },
  EXTERNAL_TAVILY_FAILED: {
    status: 502,
    defaultMessage: "Web research failed",
    domain: "EXTERNAL",
  },

  // OAUTH
  OAUTH_CALLBACK_FAILED: {
    status: 400,
    defaultMessage: "OAuth sign-in failed",
    domain: "OAUTH",
  },
  OAUTH_NO_CODE: {
    status: 400,
    defaultMessage: "OAuth provider did not return an authorization code",
    domain: "OAUTH",
  },
  OAUTH_TOKEN_EXCHANGE_FAILED: {
    status: 502,
    defaultMessage: "Failed to exchange OAuth code for token",
    domain: "OAUTH",
  },
  OAUTH_PROFILE_FETCH_FAILED: {
    status: 502,
    defaultMessage: "Failed to fetch profile from OAuth provider",
    domain: "OAUTH",
  },

  // FILE
  FILE_REQUIRED: {
    status: 400,
    defaultMessage: "No file was uploaded",
    domain: "FILE",
  },
  FILE_TOO_LARGE: {
    status: 413,
    defaultMessage: "File exceeds the maximum allowed size",
    domain: "FILE",
  },
  FILE_UNSUPPORTED_TYPE: {
    status: 415,
    defaultMessage: "File type is not supported",
    domain: "FILE",
  },
  FILE_STORAGE_FAILED: {
    status: 500,
    defaultMessage: "Failed to store the uploaded file",
    domain: "FILE",
  },

  // BILLING
  BILLING_PLAN_UNAVAILABLE: {
    status: 409,
    defaultMessage: "The selected billing plan is not available",
    domain: "BILLING",
  },
  BILLING_SUBSCRIPTION_NOT_FOUND: {
    status: 404,
    defaultMessage: "Subscription not found",
    domain: "BILLING",
  },
  BILLING_ALREADY_CANCELLED: {
    status: 409,
    defaultMessage: "Subscription is already scheduled for cancellation",
    domain: "BILLING",
  },

  // INTERNAL
  INTERNAL_ERROR: {
    status: 500,
    defaultMessage: "An unexpected error occurred",
    domain: "INTERNAL",
  },
  INTERNAL_NOT_IMPLEMENTED: {
    status: 501,
    defaultMessage: "This feature is not yet available",
    domain: "INTERNAL",
  },

  // AI (mirrored subset from AI microservice for upstream parsing)
  AI_INPUT_INVALID: {
    status: 400,
    defaultMessage: "AI input is invalid",
    domain: "AI",
  },
  AI_MODEL_LOADING: {
    status: 503,
    defaultMessage: "AI model is still loading, please retry shortly",
    domain: "AI",
  },
  AI_EMBEDDING_FAILED: {
    status: 500,
    defaultMessage: "Failed to compute embeddings",
    domain: "AI",
  },
  AI_LLM_FAILED: {
    status: 502,
    defaultMessage: "Language model verification failed",
    domain: "AI",
  },
  AI_LLM_TIMEOUT: {
    status: 504,
    defaultMessage: "Language model timed out",
    domain: "AI",
  },
  AI_INTERNAL: {
    status: 500,
    defaultMessage: "Internal AI service error",
    domain: "AI",
  },
} as const satisfies Record<string, ErrorDef>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && value in ERROR_CODES;
}
