import { createHmac } from "crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/connection";
import { integrationWebhookEndpoints } from "../../db/schema";

export type WebhookEventType =
  | "case.created"
  | "case.updated"
  | "document.uploaded"
  | "client.created"
  | "invoice.created"
  | "test.ping";

export class WebhookDeliveryService {
  constructor(private db: Database) {}

  private signPayload(secret: string, payload: string) {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  async deliver(organizationId: number, event: WebhookEventType, payload: Record<string, unknown>) {
    const endpoints = await this.db.query.integrationWebhookEndpoints.findMany({
      where: and(
        eq(integrationWebhookEndpoints.organizationId, organizationId),
        eq(integrationWebhookEndpoints.active, true)
      ),
    });

    const deliveryPayload = JSON.stringify({
      event,
      data: payload,
      sentAt: new Date().toISOString(),
    });

    await Promise.all(
      endpoints.map(async (endpoint) => {
        if (endpoint.events && endpoint.events.length > 0 && !endpoint.events.includes(event)) {
          return null;
        }
        await this.deliverToEndpoint(endpoint, deliveryPayload);
        return null;
      })
    );
  }

  async deliverTest(organizationId: number, endpointId: number) {
    const endpoint = await this.db.query.integrationWebhookEndpoints.findFirst({
      where: and(
        eq(integrationWebhookEndpoints.organizationId, organizationId),
        eq(integrationWebhookEndpoints.id, endpointId)
      ),
    });
    if (!endpoint) {
      throw new Error("Webhook endpoint not found");
    }
    const payload = JSON.stringify({
      event: "test.ping",
      data: { message: "Silah test webhook" },
      sentAt: new Date().toISOString(),
    });
    await this.deliverToEndpoint(endpoint, payload);
  }

  private async deliverToEndpoint(
    endpoint: typeof integrationWebhookEndpoints.$inferSelect,
    payload: string
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (endpoint.secret) {
      headers["x-silah-signature"] = this.signPayload(endpoint.secret, payload);
    }
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: payload,
      });
      await this.db
        .update(integrationWebhookEndpoints)
        .set({
          lastDeliveredAt: new Date(),
          lastStatusCode: response.status,
          lastError: response.ok ? null : `HTTP ${response.status}`,
          updatedAt: new Date(),
        })
        .where(eq(integrationWebhookEndpoints.id, endpoint.id));
    } catch (error) {
      await this.db
        .update(integrationWebhookEndpoints)
        .set({
          lastDeliveredAt: new Date(),
          lastStatusCode: null,
          lastError: error instanceof Error ? error.message : "Delivery failed",
          updatedAt: new Date(),
        })
        .where(eq(integrationWebhookEndpoints.id, endpoint.id));
    }
  }
}
