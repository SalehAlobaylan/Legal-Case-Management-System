/**
 * Map PostgreSQL / Drizzle errors to AppError subclasses by SQLSTATE.
 *
 * Invoked once from the centralized error handler — services do NOT need
 * to wrap their queries. Returns `null` if the error isn't a recognized
 * PG error, letting the handler fall through to its catch-all branch.
 *
 * Security: never includes PG's `detail` field in the response — PG often
 * echoes column values there (e.g. "Key (email)=(a@b.c) already exists").
 */

import { AppError, ConflictError } from "../errors/AppError";

interface PgError {
  code?: string;
  constraint?: string;
  column?: string;
  table?: string;
  schema?: string;
}

function isPgError(error: unknown): error is PgError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

/**
 * Safe subset of the PG error to surface in `details`. Excludes `detail`
 * because it may contain row values.
 */
function safeDetails(err: PgError): Record<string, string> {
  const out: Record<string, string> = {};
  if (err.constraint) out.constraint = err.constraint;
  if (err.column) out.column = err.column;
  if (err.table) out.table = err.table;
  return out;
}

export function mapDbError(error: unknown): AppError | null {
  if (!isPgError(error)) return null;
  const code = error.code ?? "";

  // Integrity constraint violations
  switch (code) {
    case "23505": // unique_violation
      return new ConflictError(
        "A record with these unique values already exists",
        "DB_UNIQUE_VIOLATION"
      );
    case "23503": // foreign_key_violation
      return new ConflictError(
        "This action references a missing related record",
        "DB_FOREIGN_KEY_VIOLATION"
      );
    case "23502": // not_null_violation
      return new AppError("DB_NOT_NULL_VIOLATION", safeDetails(error));
    case "22001": // string_data_right_truncation
      return new AppError("DB_STRING_TOO_LONG", safeDetails(error));
    case "22P02": // invalid_text_representation
      return new AppError("DB_INVALID_TEXT_REPRESENTATION", safeDetails(error));
  }

  // Schema mismatches (existing handler already mapped these)
  if (code === "42703" || code === "42P01" || code === "42704") {
    return new AppError("DB_SCHEMA_OUT_OF_DATE");
  }

  // Connection family: 08000-08P01
  if (code.startsWith("08")) {
    return new AppError("DB_CONNECTION_FAILED");
  }

  return null;
}
