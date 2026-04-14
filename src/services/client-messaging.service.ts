/*
 * ClientMessagingService
 *
 * - Handles sending messages/notifications to clients
 * - Creates in-app notifications for team members
 * - MVP: In-app only (email/SMS integration deferred)
 */

import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { clients, users, clientMessages } from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { CommunicationService } from "./communication.service";
import { logger } from "../utils/logger";

export interface SendMessageInput {
  clientId: number;
  message: string;
  type: "case_update" | "hearing_reminder" | "document_request" | "invoice_notice" | "general";
  channel: "in_app" | "email" | "sms" | "whatsapp";
  subject?: string;
  metadata?: Record<string, unknown>;
  userId: string;
  orgId: number;
}

export class ClientMessagingService {
  private readonly communication = new CommunicationService();

  constructor(
    private db: Database,
    private readonly emitToUser?: (
      userId: string,
      event: string,
      data: Record<string, unknown>
    ) => void
  ) {}

  /**
   * sendMessageToClient
   *
   * - Creates an in-app notification for client communication
   * - MVP: In-app notification only
   * - Future: Email/SMS integration
   */
  async sendMessageToClient(input: SendMessageInput) {
    const { clientId, message, type, userId, orgId, channel, subject, metadata } = input;

    // Validate message length
    if (message.length < 1 || message.length > 2000) {
      throw new Error("Message must be between 1 and 2000 characters");
    }

    // Verify client exists and belongs to org
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, clientId),
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    if (client.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this client");
    }

    const [messageRecord] = await this.db
      .insert(clientMessages)
      .values({
        organizationId: orgId,
        clientId,
        senderUserId: userId,
        type,
        channel,
        subject,
        body: message,
        status: "queued",
        direction: "outbound",
        retryCount: 0,
        maxRetries: 3,
        nextRetryAt: null,
        isRead: false,
        metadata: metadata || {},
      })
      .returning();

    try {
      if (channel === "email") {
        if (!client.email) {
          throw new Error("Client email is missing");
        }
        await this.communication.sendEmail(
          client.email,
          subject || this.getDefaultSubject(type, client.name),
          message
        );
      } else if (channel === "sms") {
        if (!client.phone) {
          throw new Error("Client phone is missing");
        }
        await this.communication.sendSms(client.phone, message);
      } else if (channel === "whatsapp") {
        if (!client.phone) {
          throw new Error("Client phone is missing");
        }
        await this.communication.sendWhatsApp(client.phone, message);
      } else {
        const orgUsers = await this.db.query.users.findMany({
          where: eq(users.organizationId, orgId),
          columns: {
            id: true,
          },
        });

        const notificationDelivery = new NotificationDeliveryService(
          this.db,
          this.emitToUser
        );

        await notificationDelivery.notifyUsers({
          recipients: orgUsers.map((user) => ({
            userId: user.id,
            organizationId: orgId,
          })),
          type: "case_update",
          category: "caseUpdates",
          title: this.getDefaultSubject(type, client.name),
          message,
        });
      }

      const [updated] = await this.db
        .update(clientMessages)
        .set({
          status: "sent",
          sentAt: new Date(),
          deliveredAt: new Date(),
          updatedAt: new Date(),
          errorMessage: null,
          nextRetryAt: null,
        })
        .where(eq(clientMessages.id, messageRecord.id))
        .returning();

      return {
        success: true,
        message: `Message sent to ${client.name}`,
        messageRecord: updated,
      };
    } catch (error: any) {
      const [failed] = await this.db
        .update(clientMessages)
        .set({
          status: "failed",
          errorMessage: error?.message || "Unknown delivery error",
          nextRetryAt: new Date(Date.now() + 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(clientMessages.id, messageRecord.id))
        .returning();

      logger.error(
        {
          err: error,
          clientId,
          orgId,
          channel,
          messageId: messageRecord.id,
        },
        "Failed to send message to client"
      );

      return {
        success: false,
        message: `Failed to send message to ${client.name}`,
        messageRecord: failed,
      };
    }
  }

  async getClientMessageHistory(clientId: number, orgId: number) {
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, clientId),
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    if (client.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this client");
    }

    return this.db.query.clientMessages.findMany({
      where: and(eq(clientMessages.organizationId, orgId), eq(clientMessages.clientId, clientId)),
      orderBy: [desc(clientMessages.createdAt)],
      with: {
        sender: {
          columns: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  async markMessageRead(messageId: number, orgId: number) {
    const existing = await this.db.query.clientMessages.findFirst({
      where: eq(clientMessages.id, messageId),
    });

    if (!existing) {
      throw new NotFoundError("Client message");
    }

    if (existing.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this message");
    }

    const [updated] = await this.db
      .update(clientMessages)
      .set({ isRead: true, readAt: new Date(), updatedAt: new Date() })
      .where(eq(clientMessages.id, messageId))
      .returning();

    return updated;
  }

  async retryMessage(messageId: number, orgId: number) {
    const existing = await this.db.query.clientMessages.findFirst({
      where: eq(clientMessages.id, messageId),
    });

    if (!existing) {
      throw new NotFoundError("Client message");
    }

    if (existing.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this message");
    }

    if (existing.status !== "failed") {
      throw new Error("Only failed messages can be retried");
    }

    const [updated] = await this.db
      .update(clientMessages)
      .set({ status: "queued", nextRetryAt: new Date(), updatedAt: new Date() })
      .where(eq(clientMessages.id, messageId))
      .returning();

    return updated;
  }

  private getDefaultSubject(type: SendMessageInput["type"], clientName: string) {
    const titleByType: Record<SendMessageInput["type"], string> = {
      case_update: `Case update for ${clientName}`,
      hearing_reminder: `Hearing reminder for ${clientName}`,
      document_request: `Document request for ${clientName}`,
      invoice_notice: `Invoice notice for ${clientName}`,
      general: `Message for ${clientName}`,
    };
    return titleByType[type];
  }
}
