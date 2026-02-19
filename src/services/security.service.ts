/*
 * SecurityService
 *
 * Handles password changes and login activity tracking.
 */

import { eq, desc } from "drizzle-orm";
import bcrypt from "bcrypt";
import type { Database } from "../db/connection";
import { users } from "../db/schema/users";
import { loginActivity, type NewLoginActivity } from "../db/schema/login-activity";

export class SecurityService {
  constructor(private db: Database) {}

  /**
   * changePassword
   *
   * - Verifies the current password, then hashes and stores the new one.
   * - Throws descriptive errors for invalid current password or OAuth-only accounts.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    if (user.isOAuthUser && !user.passwordHash) {
      throw new Error("OAuth accounts cannot change password");
    }

    if (!user.passwordHash) {
      throw new Error("No password set for this account");
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error("Current password is incorrect");
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await this.db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { success: true };
  }

  /**
   * getLoginActivity
   *
   * - Returns the most recent login activity records for a user.
   */
  async getLoginActivity(userId: string, limit = 10) {
    return this.db
      .select()
      .from(loginActivity)
      .where(eq(loginActivity.userId, userId))
      .orderBy(desc(loginActivity.loginAt))
      .limit(limit);
  }

  /**
   * recordLogin
   *
   * - Inserts a new login activity record.
   */
  async recordLogin(data: NewLoginActivity) {
    const [record] = await this.db
      .insert(loginActivity)
      .values(data)
      .returning();
    return record;
  }
}
