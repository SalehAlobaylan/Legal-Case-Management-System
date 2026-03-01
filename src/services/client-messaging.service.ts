/*
 * ClientMessagingService
 *
 * - Handles sending messages/notifications to clients
 * - Creates in-app notifications for team members
 * - MVP: In-app only (email/SMS integration deferred)
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { clients, users } from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";
import { NotificationDeliveryService } from "./notification-delivery.service";

export interface SendMessageInput {
  clientId: number;
  message: string;
  type: "case_update" | "hearing_reminder" | "document_request" | "general";
  userId: string;
  orgId: number;
}

export class ClientMessagingService {
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
    const { clientId, message, type, userId, orgId } = input;

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

    // Get all users in organization to notify
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
    const titleByType: Record<SendMessageInput["type"], string> = {
      case_update: `Case update sent to client: ${client.name}`,
      hearing_reminder: `Hearing reminder sent to client: ${client.name}`,
      document_request: `Document request sent to client: ${client.name}`,
      general: `Message sent to client: ${client.name}`,
    };
    const deliveryResult = await notificationDelivery.notifyUsers({
      recipients: orgUsers.map((user) => ({
        userId: user.id,
        organizationId: orgId,
      })),
      type: "case_update",
      category: "caseUpdates",
      title: titleByType[type],
      message,
    });

    return {
      success: true,
      message: `Message sent to ${client.name}`,
      notifiedCount: deliveryResult.created,
    };
  }
}
