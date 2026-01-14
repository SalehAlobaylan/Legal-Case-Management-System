/*
 * ClientService
 *
 * - Encapsulates all data access and business logic for clients.
 * - All operations are scoped to the user's organization.
 */

import { eq, and, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Database } from "../db/connection";
import { clients, type NewClient } from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";

export class ClientService {
  constructor(private db: Database) {}

  /**
   * createClient
   *
   * - Creates a new client for the specified organization.
   */
  async createClient(data: NewClient) {
    const [client] = await this.db
      .insert(clients)
      .values(data)
      .returning();

    return client;
  }

  /**
   * getClientById
   *
   * - Retrieves a single client by ID.
   * - Verifies it belongs to the specified organization.
   */
  async getClientById(id: number, orgId: number) {
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, id),
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    if (client.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this client");
    }

    return client;
  }

  /**
   * getClientsByOrganization
   *
   * - Returns all clients for an organization.
   * - Supports optional filters for type and status.
   */
  async getClientsByOrganization(
    orgId: number,
    filters?: {
      type?: string;
      status?: string;
    }
  ) {
    const conditions: SQL<unknown>[] = [eq(clients.organizationId, orgId)];

    if (filters?.type) {
      conditions.push(eq(clients.type, filters.type as any));
    }
    if (filters?.status) {
      conditions.push(eq(clients.status, filters.status as any));
    }

    return this.db.query.clients.findMany({
      where: and(...conditions),
      orderBy: [desc(clients.createdAt)],
    });
  }

  /**
   * updateClient
   *
   * - Updates a client's information.
   * - Verifies organization access first.
   */
  async updateClient(id: number, orgId: number, data: Partial<NewClient>) {
    // Verify ownership
    await this.getClientById(id, orgId);

    const [updated] = await this.db
      .update(clients)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, id))
      .returning();

    return updated;
  }

  /**
   * deleteClient
   *
   * - Deletes a client by ID.
   * - Verifies organization access first.
   */
  async deleteClient(id: number, orgId: number) {
    // Verify ownership
    await this.getClientById(id, orgId);

    await this.db.delete(clients).where(eq(clients.id, id));

    return { success: true };
  }
}
