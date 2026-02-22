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
import { users, organizations, UserRole } from "../db/schema";
import { hashPassword, verifyPassword } from "../utils/hash";
import { UnauthorizedError, ConflictError, NotFoundError } from "../utils/errors";
import { OrganizationService } from "./organization.service";

export class AuthService {
  constructor(private db: Database) {}

  private getOrganizationService(): OrganizationService {
    return new OrganizationService(this.db);
  }

  /*
   * register
   *
   * - Supports dual registration modes: joining existing orgs or creating new ones.
   * - Checks if a user with the given email already exists and throws `ConflictError` if so.
   * - Mode 1 (join): Adds user to existing organization with default role "lawyer".
   * - Mode 2 (create): Creates new organization and adds user as "admin".
   * - Hashes the provided password and inserts a new user row into the `users` table.
   * - Returns a sanitized user object that excludes the `passwordHash` field.
   */
  async register(data: {
    email: string;
    password: string;
    fullName: string;
    role?: UserRole;
    registrationType: "personal" | "join" | "create";
    organizationId?: number;
    organizationName?: string;
    country?: string;
    subscriptionTier?: string;
  }) {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    if (existing) {
      if (existing.isOAuthUser) {
        throw new ConflictError(
          "This account uses Google Sign-In. Please sign in with Google."
        );
      }
      throw new ConflictError("User with this email already exists");
    }

    const passwordHash = await hashPassword(data.password);
    let organizationId: number;
    let shouldAttachPersonalOwner = false;

    if (data.registrationType === "join") {
      const orgService = this.getOrganizationService();
      const org = await orgService.getById(data.organizationId!);

      if (!org) {
        throw new NotFoundError("Organization");
      }

      if (org.isPersonal) {
        throw new ConflictError("Cannot join a personal workspace");
      }

      organizationId = org.id;
    } else if (data.registrationType === "create") {
      const orgService = this.getOrganizationService();
      const newOrg = await orgService.create({
        name: data.organizationName!,
        country: data.country || "SA",
        subscriptionTier: data.subscriptionTier || "free",
      });

      organizationId = newOrg.id;
    } else {
      const orgService = this.getOrganizationService();
      const personalOrg = await orgService.createPersonalOrganization({
        ownerDisplayName: data.fullName,
        country: data.country || "SA",
        subscriptionTier: data.subscriptionTier || "free",
      });

      organizationId = personalOrg.id;
      shouldAttachPersonalOwner = true;
    }

    // Determine role: admin for create mode, lawyer for join mode (or override if provided)
    const role =
      data.role ??
      (data.registrationType === "join" ? "lawyer" : "admin");

    const [newUser] = await this.db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        organizationId,
        role,
      })
      .returning();

    if (shouldAttachPersonalOwner) {
      const orgService = this.getOrganizationService();
      await orgService.attachPersonalOwner(organizationId, newUser.id);
    }

    return this.sanitizeUser(newUser);
  }

  /*
   * login
   *
   * - Looks up a user by email; if no user is found, throws `UnauthorizedError`.
   * - Checks if user is an OAuth-only user and throws appropriate error if so.
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

    // Check if this is an OAuth-only user
    if (user.isOAuthUser) {
      throw new UnauthorizedError(
        "This account uses Google Sign-In. Please sign in with Google."
      );
    }

    // Verify password (passwordHash should exist for non-OAuth users)
    if (!user.passwordHash) {
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
   * updateProfile
   *
   * - Updates the current user's profile information.
   * - Only allows updating safe fields: fullName.
   * - Note: phone and bio would need schema changes to support.
   * - Returns the updated sanitized user object.
   */
  async updateProfile(
    id: string,
    data: {
      fullName?: string;
    }
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      return null;
    }

    const [updated] = await this.db
      .update(users)
      .set({
        ...(data.fullName && { fullName: data.fullName }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return this.sanitizeUser(updated);
  }

  /*
   * sanitizeUser
   *
   * - Internal helper that strips the sensitive `passwordHash` and OAuth-related fields from a user record.
   * - Returns a "safe" user object that can be sent back to API clients.
   */
  private sanitizeUser(user: typeof users.$inferSelect) {
    const { passwordHash, googleId, isOAuthUser, ...safeUser } = user;
    return safeUser;
  }
}
