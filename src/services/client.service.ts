/*
 * ClientService
 *
 * - Encapsulates all data access and business logic for clients.
 * - All operations are scoped to the user's organization.
 */

import { eq, and, desc, like, or, sql, inArray, isNotNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  clients,
  type NewClient,
  cases,
  clientActivities,
  clientDocuments,
  type NewClientActivity,
  type NewClientDocument,
} from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";
import { type CaseAccessContext } from "./case.service";
import { PermissionService } from "./permission.service";

export class ClientService {
  constructor(private db: Database) { }

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

  /*
   * orgRestrictsClientSharing
   *
   * - Returns true when `settings.privacy.clients` is ON AND the caller lacks
   *   the `delegated.clients.viewAll` bypass (admin's `*` also bypasses).
   */
  private orgRestrictsClientSharing(access?: CaseAccessContext): boolean {
    if (!access) return false;
    if (
      PermissionService.can(access.effectivePermissions, "delegated.clients.viewAll")
    ) {
      return false;
    }
    return access.orgPrivacy.clients;
  }

  /**
   * getClientById
   *
   * - Retrieves a single client by ID.
   * - Verifies it belongs to the specified organization.
   * - When `restrictClientSharing` is ON and the caller doesn't bypass, the
   *   client must be linked to a case the caller is assigned to.
   */
  async getClientById(id: number, orgId: number, access?: CaseAccessContext) {
    const client = await this.db.query.clients.findFirst({
      where: eq(clients.id, id),
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    if (client.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this client");
    }

    if (this.orgRestrictsClientSharing(access)) {
      const [link] = await this.db
        .select({ id: cases.id })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.clientId, id),
            eq(cases.assignedLawyerId, access!.userId)
          )
        )
        .limit(1);
      if (!link) {
        throw new ForbiddenError("Access denied to this client");
      }
    }

    return client;
  }

  /**
   * getClientsByOrganization
   *
   * - Returns all clients for an organization.
   * - Supports optional filters for type and status.
   * - When `restrictClientSharing` is ON, narrows the result to clients linked
   *   to a case the caller is assigned to.
   */
  async getClientsByOrganization(
    orgId: number,
    filters?: {
      type?: string;
      status?: string;
      leadStatus?: string;
      tag?: string;
    },
    access?: CaseAccessContext
  ) {
    const conditions: SQL<unknown>[] = [eq(clients.organizationId, orgId)];

    if (filters?.type) {
      conditions.push(eq(clients.type, filters.type as any));
    }
    if (filters?.status) {
      conditions.push(eq(clients.status, filters.status as any));
    }
    if (filters?.leadStatus) {
      conditions.push(eq(clients.leadStatus, filters.leadStatus as any));
    }
    if (filters?.tag) {
      // Using JSONB inclusion operator to check if tags array contains the tag
      conditions.push(sql`${clients.tags} @> ${JSON.stringify([filters.tag])}`);
    }

    if (this.orgRestrictsClientSharing(access)) {
      conditions.push(
        inArray(
          clients.id,
          this.db
            .select({ id: cases.clientId })
            .from(cases)
            .where(
              and(
                eq(cases.organizationId, orgId),
                eq(cases.assignedLawyerId, access!.userId),
                isNotNull(cases.clientId)
              )
            )
        )
      );
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
    // Verify ownership and capture previous state
    const previous = await this.getClientById(id, orgId);

    const [updated] = await this.db
      .update(clients)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, id))
      .returning();

    return { updated, previous };
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

  /**
   * getClientCases
   *
   * - Returns all cases associated with a client.
   * - Matches cases by clientInfo field containing the client's name.
   */
  async getClientCases(clientId: number, orgId: number) {
    // First get the client to verify access and get their name
    const client = await this.getClientById(clientId, orgId);

    // Prefer direct foreign key mapping, with fallback to legacy clientInfo text matching
    const clientCases = await this.db.query.cases.findMany({
      where: and(
        eq(cases.organizationId, orgId),
        or(eq(cases.clientId, clientId), like(cases.clientInfo, `%${client.name}%`))!
      ),
      orderBy: [desc(cases.createdAt)],
    });

    return clientCases;
  }

  /**
   * getClientActivities
   *
   * - Returns all timeline activities associated with a client.
   */
  async getClientActivities(clientId: number, orgId: number) {
    // Verify ownership
    await this.getClientById(clientId, orgId);

    return this.db.query.clientActivities.findMany({
      where: eq(clientActivities.clientId, clientId),
      orderBy: [desc(clientActivities.createdAt)],
      with: {
        user: {
          columns: { id: true, fullName: true, avatarUrl: true }
        }
      }
    });
  }

  /**
   * createClientActivity
   *
   * - Creates a new timeline activity.
   */
  async createClientActivity(clientId: number, orgId: number, data: Omit<NewClientActivity, "clientId">) {
    // Verify ownership
    await this.getClientById(clientId, orgId);

    const [activity] = await this.db
      .insert(clientActivities)
      .values({
        ...data,
        clientId,
      })
      .returning();

    return activity;
  }

  /**
   * getClientDocuments
   *
   * - Returns all general KYC/evidence documents for a client.
   */
  async getClientDocuments(clientId: number, orgId: number) {
    // Verify ownership
    await this.getClientById(clientId, orgId);

    return this.db.query.clientDocuments.findMany({
      where: eq(clientDocuments.clientId, clientId),
      orderBy: [desc(clientDocuments.createdAt)],
      with: {
        uploadedBy: {
          columns: { id: true, fullName: true }
        }
      }
    });
  }

  async createClientDocument(
    clientId: number,
    orgId: number,
    data: Omit<NewClientDocument, "clientId">
  ) {
    await this.getClientById(clientId, orgId);

    const [created] = await this.db
      .insert(clientDocuments)
      .values({
        ...data,
        clientId,
      })
      .returning();

    return created;
  }

  async deleteClientDocument(clientId: number, documentId: number, orgId: number) {
    await this.getClientById(clientId, orgId);

    const existing = await this.db.query.clientDocuments.findFirst({
      where: and(eq(clientDocuments.id, documentId), eq(clientDocuments.clientId, clientId)),
    });

    if (!existing) {
      throw new NotFoundError("Client document");
    }

    const [deleted] = await this.db
      .delete(clientDocuments)
      .where(and(eq(clientDocuments.id, documentId), eq(clientDocuments.clientId, clientId)))
      .returning();

    return deleted;
  }
}
