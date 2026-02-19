/*
 * NotificationPreferencesService
 *
 * - Encapsulates all data access for user notification preferences.
 * - Provides get (with auto-create default) and update (upsert) operations.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  notificationPreferences,
  type NewNotificationPreference,
} from "../db/schema";

const defaultPrefs: Omit<NewNotificationPreference, "userId"> = {
  emailAlerts: true,
  pushNotifications: true,
  aiSuggestions: true,
  regulationUpdates: true,
  caseUpdates: true,
  systemAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  digestEnabled: false,
  digestFrequency: "daily",
};

export class NotificationPreferencesService {
  constructor(private db: Database) {}

  /**
   * getPreferences
   *
   * - Returns existing preferences for a user.
   * - If no row exists, creates one with defaults and returns it.
   */
  async getPreferences(userId: string) {
    const [existing] = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (existing) return existing;

    // Auto-create default preferences
    const [created] = await this.db
      .insert(notificationPreferences)
      .values({ userId, ...defaultPrefs })
      .returning();

    return created;
  }

  /**
   * updatePreferences
   *
   * - Updates notification preferences for a user.
   * - If no row exists, creates one first then updates.
   */
  async updatePreferences(
    userId: string,
    data: Partial<Omit<NewNotificationPreference, "userId" | "id">>
  ) {
    // Ensure a row exists
    await this.getPreferences(userId);

    const [updated] = await this.db
      .update(notificationPreferences)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.userId, userId))
      .returning();

    return updated;
  }
}
