import { and, eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  integrations,
  integrationWebhookEndpoints,
  Integration,
  NewIntegration,
  NewIntegrationWebhookEndpoint,
} from "../db/schema";
import { encryptJson, decryptJson } from "../utils/encryption";

export type IntegrationProvider =
  | "webhooks"
  | "microsoft_365"
  | "odoo"
  | "najiz"
  | "absher"
  | "qiwa"
  | "muqeem"
  | "hubspot"
  | "salesforce"
  | "zoho_crm"
  | "dynamics_crm"
  | "google_workspace"
  | "google_drive"
  | "onedrive"
  | "dropbox"
  | "docusign"
  | "adobe_sign"
  | "zapier"
  | "make"
  | "n8n";

export type IntegrationStatus =
  | "not_connected"
  | "in_setup"
  | "connected"
  | "error"
  | "coming_soon";

export interface IntegrationCredentials {
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  tenantId?: string;
  scope?: string;
  baseUrl?: string;
  database?: string;
  username?: string;
  apiKey?: string;
}

export class IntegrationService {
  constructor(private db: Database) {}

  async listForOrganization(organizationId: number) {
    return this.db.query.integrations.findMany({
      where: eq(integrations.organizationId, organizationId),
      orderBy: [integrations.provider],
    });
  }

  async getIntegration(organizationId: number, provider: IntegrationProvider) {
    return this.db.query.integrations.findFirst({
      where: and(
        eq(integrations.organizationId, organizationId),
        eq(integrations.provider, provider)
      ),
    });
  }

  async upsertIntegration(input: NewIntegration & { id?: number }) {
    if (input.id) {
      const [updated] = await this.db
        .update(integrations)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, input.id))
        .returning();
      return updated;
    }

    const existing = await this.getIntegration(
      input.organizationId,
      input.provider as IntegrationProvider
    );

    if (existing) {
      const [updated] = await this.db
        .update(integrations)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db.insert(integrations).values(input).returning();
    return created;
  }

  async getIntegrationBySetupState(setupState: string) {
    return this.db.query.integrations.findFirst({
      where: eq(integrations.setupState, setupState),
    });
  }


  async setCredentials(
    integrationId: number,
    credentials: IntegrationCredentials
  ) {
    const encrypted = encryptJson(credentials);
    const [updated] = await this.db
      .update(integrations)
      .set({
        credentialsEncrypted: encrypted,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integrationId))
      .returning();
    return updated;
  }

  getCredentials<T extends IntegrationCredentials>(record: Integration | null) {
    if (!record?.credentialsEncrypted) return null;
    return decryptJson<T>(record.credentialsEncrypted);
  }

  async updateStatus(
    integrationId: number,
    status: IntegrationStatus,
    errorMessage?: string
  ) {
    const [updated] = await this.db
      .update(integrations)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integrationId))
      .returning();
    return updated;
  }

  async updateSyncTime(integrationId: number) {
    const [updated] = await this.db
      .update(integrations)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(integrations.id, integrationId))
      .returning();
    return updated;
  }

  async disconnectIntegration(integrationId: number) {
    const [updated] = await this.db
      .update(integrations)
      .set({
        status: "not_connected",
        credentialsEncrypted: null,
        errorMessage: null,
        connectedAt: null,
        connectedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integrationId))
      .returning();
    return updated;
  }

  async listWebhooks(organizationId: number) {
    return this.db.query.integrationWebhookEndpoints.findMany({
      where: eq(integrationWebhookEndpoints.organizationId, organizationId),
      orderBy: [integrationWebhookEndpoints.createdAt],
    });
  }

  async createWebhook(input: NewIntegrationWebhookEndpoint) {
    const [created] = await this.db
      .insert(integrationWebhookEndpoints)
      .values(input)
      .returning();
    return created;
  }

  async updateWebhook(
    organizationId: number,
    id: number,
    updates: Partial<NewIntegrationWebhookEndpoint>
  ) {
    const [updated] = await this.db
      .update(integrationWebhookEndpoints)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationWebhookEndpoints.id, id),
          eq(integrationWebhookEndpoints.organizationId, organizationId)
        )
      )
      .returning();
    return updated;
  }

  async deleteWebhook(organizationId: number, id: number) {
    const [deleted] = await this.db
      .delete(integrationWebhookEndpoints)
      .where(
        and(
          eq(integrationWebhookEndpoints.id, id),
          eq(integrationWebhookEndpoints.organizationId, organizationId)
        )
      )
      .returning();
    return deleted;
  }
}
