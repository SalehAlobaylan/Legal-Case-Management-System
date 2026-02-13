/*
 * ClientMessagingService
 *
 * - Handles sending messages/notifications to clients
 * - Creates in-app notifications for team members
 * - MVP: In-app only (email/SMS integration deferred)
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { clients, users, notifications, type NewNotification } from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";

export interface SendMessageInput {
  clientId: number;
  message: string;
  type: "case_update" | "hearing_reminder" | "document_request" | "general";
  userId: string;
  orgId: number;
}

export class ClientMessagingService {
  constructor(private db: Database) {}

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

    // Create notifications for all team members
    const notificationPromises = orgUsers.map((user) =>
      this.db.insert(notifications).values({
        userId: user.id,
        organizationId: orgId,
        type: "case_update", // Using case_update type for client messages
        title: `Message sent to client: ${client.name}`,
        message: message,
        read: false,
      } as NewNotification)
    );

    await Promise.all(notificationPromises);

    return {
      success: true,
      message: `Message sent to ${client.name}`,
      notifiedCount: orgUsers.length,
    };
  }
}
