/*
 * AuthService encapsulates user authentication and user account–related operations.
 *
 * It uses the Drizzle `Database` and `users` schema to persist and retrieve user records.
 *
 * It provides methods to register new users, securely hash and verify passwords,
 * update the user's `lastLogin` timestamp on successful authentication, and
 * fetch a user by id.
 *
 * It throws typed `AppError` subclasses (`ConflictError`, `UnauthorizedError`)
 * so the global error handler can return consistent HTTP responses, and it always
 * returns "sanitized" user objects that never expose the `passwordHash` field.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { users, UserRole } from "../db/schema";
import { hashPassword, verifyPassword } from "../utils/hash";
import { UnauthorizedError, ConflictError } from "../utils/errors";

export class AuthService {
  constructor(private db: Database) {}

  /*
   * register
   *
   * - Checks if a user with the given email already exists and throws `ConflictError` if so.
   * - Hashes the provided password and inserts a new user row into the `users` table
   *   with the given email, full name, organization id, and optional role (defaulting to "lawyer").
   * - Returns a sanitized user object that excludes the `passwordHash` field.
   */
  async register(data: {
    email: string;
    password: string;
    fullName: string;
    organizationId: number;
    role?: UserRole;
  }) {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    if (existing) {
      throw new ConflictError("User with this email already exists");
    }

    const passwordHash = await hashPassword(data.password);

    const [newUser] = await this.db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        organizationId: data.organizationId,
        role: data.role ?? "lawyer",
      })
      .returning();

    return this.sanitizeUser(newUser);
  }

  /*
   * login
   *
   * - Looks up a user by email; if no user is found, throws `UnauthorizedError`.
   * - Verifies the provided password against the stored `passwordHash`; on mismatch,
   *   throws `UnauthorizedError`.
   * - On successful authentication, updates the user's `lastLogin` timestamp and
   *   returns a sanitized user object without the `passwordHash`.
   */
  async login(email: string, password: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    // Update last login
    await this.db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, user.id));

    return this.sanitizeUser(user);
  }

  /*
   * getUserById
   *
   * - Retrieves a user from the `users` table by its primary key `id` (UUID).
   * - If no user is found, returns `null` instead of throwing an error.
   * - When a user exists, returns a sanitized user object without the `passwordHash`.
   */
  async getUserById(id: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      return null;
    }

    return this.sanitizeUser(user);
  }

  /*
   * sanitizeUser
   *
   * - Internal helper that strips the sensitive `passwordHash` field from a user record.
   * - Returns a "safe" user object that can be sent back to API clients.
   */
  private sanitizeUser(user: typeof users.$inferSelect) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
