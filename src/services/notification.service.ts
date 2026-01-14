/*
 * NotificationService
 *
 * - Encapsulates all data access and business logic for notifications.
 * - All operations are scoped to the user's organization.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import { notifications, type NewNotification } from "../db/schema";

export class NotificationService {
  constructor(private db: Database) {}

  /**
   * createNotification
   *
   * - Creates a new notification for a user.
   */
  async createNotification(data: NewNotification) {
    const [notification] = await this.db
      .insert(notifications)
      .values(data)
      .returning();

    return notification;
  }

  /**
   * getNotificationsByUser
   *
   * - Returns all notifications for a user, newest first.
   * - Supports optional filter for unread only.
   */
  async getNotificationsByUser(
    userId: string,
    filters?: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    const conditions = [eq(notifications.userId, userId)];

    if (filters?.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    const query = this.db.query.notifications.findMany({
      where: and(...conditions),
      orderBy: [desc(notifications.createdAt)],
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
      with: {
        relatedCase: {
          columns: {
            id: true,
            title: true,
            caseNumber: true,
          },
        },
        relatedRegulation: {
          columns: {
            id: true,
            title: true,
          },
        },
      },
    });

    return query;
  }

  /**
   * getUnreadCount
   *
   * - Returns the count of unread notifications for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false))
      );

    return Number(result[0]?.count ?? 0);
  }

  /**
   * markAsRead
   *
   * - Marks a specific notification as read.
   */
  async markAsRead(id: number, userId: string) {
    const [updated] = await this.db
      .update(notifications)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();

    return updated;
  }

  /**
   * markAllAsRead
   *
   * - Marks all notifications as read for a user.
   */
  async markAllAsRead(userId: string) {
    await this.db
      .update(notifications)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false))
      );

    return { success: true };
  }

  /**
   * deleteNotification
   *
   * - Deletes a notification by ID.
   */
  async deleteNotification(id: number, userId: string) {
    await this.db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));

    return { success: true };
  }
}
