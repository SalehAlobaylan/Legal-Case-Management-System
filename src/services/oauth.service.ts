/*
 * OAuthService handles Google OAuth 2.0 authentication flow.
 *
 * This service manages user authentication via Google OAuth, including:
 * - Creating new users from Google profiles
 * - Linking Google accounts to existing password-based users
 * - Updating existing OAuth user profiles on sign-in
 * - Handling account conflicts between OAuth and password users
 *
 * It throws typed `AppError` subclasses (`ConflictError`, `UnauthorizedError`)
 * for consistent error handling across the application.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { users } from "../db/schema";
import { ConflictError } from "../utils/errors";
import { OrganizationService } from "./organization.service";

export interface GoogleProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  picture: string;
}

export class OAuthService {
  constructor(private db: Database) {}

  private getOrganizationService(): OrganizationService {
    return new OrganizationService(this.db);
  }

  /*
   * handleGoogleCallback
   *
   * Processes the Google OAuth callback and manages user authentication:
   *
   * 1. If user with googleId exists: Update profile (name, avatar) and lastLogin
   * 2. If user with same email exists (password user): Link Google account to existing user
   * 3. If user with same email exists (OAuth user): Throw conflict error
   * 4. If new user: Create account with personal organization (admin role)
   *
   * Returns a sanitized user object without sensitive fields.
   */
  async handleGoogleCallback(profile: GoogleProfile) {
    const { id: googleId, email, name, picture } = profile;

    // Case 1: User already exists with this Google ID
    const existingByGoogleId = await this.db.query.users.findFirst({
      where: eq(users.googleId, googleId),
    });

    if (existingByGoogleId) {
      // Update profile and last login
      await this.db
        .update(users)
        .set({
          fullName: name,
          avatarUrl: picture,
          lastLogin: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByGoogleId.id));

      return this.sanitizeUser(existingByGoogleId);
    }

    // Case 2: User exists with same email (account linking)
    const existingByEmail = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingByEmail) {
      // Case 3: Email belongs to another OAuth user
      if (existingByEmail.isOAuthUser) {
        throw new ConflictError(
          "An account with this Google account already exists"
        );
      }

      // Case 2: Link Google to existing password user
      const [updated] = await this.db
        .update(users)
        .set({
          googleId,
          avatarUrl: picture || existingByEmail.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail.id))
        .returning();

      return this.sanitizeUser(updated);
    }

    // Case 4: New user - create account with default organization
    const orgService = this.getOrganizationService();
    const newOrg = await orgService.create({
      name: `${name}'s Organization`,
      country: "SA",
      subscriptionTier: "free",
    });

    const [newUser] = await this.db
      .insert(users)
      .values({
        email,
        fullName: name,
        avatarUrl: picture,
        organizationId: newOrg.id,
        role: "admin",
        googleId,
        isOAuthUser: true,
        passwordHash: "",
      })
      .returning();

    return this.sanitizeUser(newUser);
  }

  /*
   * sanitizeUser
   *
   * Internal helper that strips sensitive OAuth-related fields from a user record.
   * Returns a "safe" user object that can be sent back to API clients.
   */
  private sanitizeUser(user: typeof users.$inferSelect) {
    const { passwordHash, googleId, isOAuthUser, ...safeUser } = user;
    return safeUser;
  }
}
