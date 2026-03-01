import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  notificationPreferences,
  notifications,
  type NotificationType,
  users,
} from "../db/schema";

type PreferenceCategory =
  | "aiSuggestions"
  | "regulationUpdates"
  | "caseUpdates"
  | "systemAlerts";

type Recipient = {
  userId: string;
  organizationId: number;
};

type NotificationBaseInput = {
  type: NotificationType;
  category: PreferenceCategory;
  title: string;
  message?: string | null;
  relatedCaseId?: number;
  relatedRegulationId?: number;
  createdAt?: Date;
};

type NotifyOrganizationInput = NotificationBaseInput & {
  organizationId: number;
  excludeUserIds?: string[];
};

type NotifyUsersInput = NotificationBaseInput & {
  recipients: Recipient[];
};

type NotificationRow = {
  id: number;
  userId: string;
  type: NotificationType;
  title: string;
  message: string | null;
  relatedCaseId: number | null;
  relatedRegulationId: number | null;
  createdAt: Date;
};

type PreferenceRow = {
  userId: string;
  pushNotifications: boolean;
  aiSuggestions: boolean;
  regulationUpdates: boolean;
  caseUpdates: boolean;
  systemAlerts: boolean;
};

export class NotificationDeliveryService {
  constructor(
    private readonly db: Database,
    private readonly emitToUser?: (
      userId: string,
      event: string,
      data: Record<string, unknown>
    ) => void
  ) {}

  async notifyOrganization(input: NotifyOrganizationInput) {
    const orgUsers = await this.db.query.users.findMany({
      where: eq(users.organizationId, input.organizationId),
      columns: {
        id: true,
        organizationId: true,
      },
    });

    const excludedIds = new Set(input.excludeUserIds || []);
    const recipients = orgUsers
      .filter((user) => !excludedIds.has(user.id))
      .map((user) => ({
        userId: user.id,
        organizationId: user.organizationId,
      }));

    return this.notifyRecipients({
      ...input,
      recipients,
    });
  }

  async notifyUsers(input: NotifyUsersInput) {
    return this.notifyRecipients(input);
  }

  private async notifyRecipients(input: NotifyUsersInput) {
    const dedupedRecipients = this.dedupeRecipients(input.recipients);

    if (dedupedRecipients.length === 0) {
      return { created: 0, deliveredRealtime: 0, notifications: [] as NotificationRow[] };
    }

    const preferencesByUserId = await this.getPreferencesByUserId(
      dedupedRecipients.map((recipient) => recipient.userId)
    );

    const eligibleRecipients = dedupedRecipients.filter((recipient) =>
      this.isCategoryEnabled(preferencesByUserId.get(recipient.userId), input.category)
    );

    if (eligibleRecipients.length === 0) {
      return { created: 0, deliveredRealtime: 0, notifications: [] as NotificationRow[] };
    }

    const createdAt = input.createdAt ?? new Date();
    const createdNotifications = (await this.db
      .insert(notifications)
      .values(
        eligibleRecipients.map((recipient) => ({
          userId: recipient.userId,
          organizationId: recipient.organizationId,
          type: input.type,
          title: input.title,
          message: input.message ?? null,
          relatedCaseId: input.relatedCaseId,
          relatedRegulationId: input.relatedRegulationId,
          read: false,
          createdAt,
        }))
      )
      .returning({
        id: notifications.id,
        userId: notifications.userId,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        relatedCaseId: notifications.relatedCaseId,
        relatedRegulationId: notifications.relatedRegulationId,
        createdAt: notifications.createdAt,
      })) as NotificationRow[];

    let deliveredRealtime = 0;
    if (this.emitToUser) {
      for (const notification of createdNotifications) {
        const preferences = preferencesByUserId.get(notification.userId);
        const pushEnabled = preferences?.pushNotifications ?? true;
        if (!pushEnabled) {
          continue;
        }

        this.emitToUser(notification.userId, "notification", {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message || "",
          metadata: {
            caseId: notification.relatedCaseId || undefined,
            regulationId: notification.relatedRegulationId || undefined,
          },
          createdAt: notification.createdAt,
        });
        deliveredRealtime += 1;
      }
    }

    return {
      created: createdNotifications.length,
      deliveredRealtime,
      notifications: createdNotifications,
    };
  }

  private async getPreferencesByUserId(userIds: string[]) {
    if (userIds.length === 0) {
      return new Map<string, PreferenceRow>();
    }

    const uniqueUserIds = [...new Set(userIds)];
    const rows = await this.db.query.notificationPreferences.findMany({
      where: inArray(notificationPreferences.userId, uniqueUserIds),
      columns: {
        userId: true,
        pushNotifications: true,
        aiSuggestions: true,
        regulationUpdates: true,
        caseUpdates: true,
        systemAlerts: true,
      },
    });

    return new Map<string, PreferenceRow>(
      rows.map((row) => [row.userId, row as PreferenceRow])
    );
  }

  private isCategoryEnabled(
    preferences: PreferenceRow | undefined,
    category: PreferenceCategory
  ) {
    if (!preferences) {
      return true;
    }
    return preferences[category];
  }

  private dedupeRecipients(recipients: Recipient[]) {
    const unique = new Map<string, Recipient>();
    for (const recipient of recipients) {
      unique.set(`${recipient.userId}:${recipient.organizationId}`, recipient);
    }
    return [...unique.values()];
  }
}
