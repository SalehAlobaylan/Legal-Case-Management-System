import { and, eq, lte } from "drizzle-orm";
import type { Database } from "../db/connection";
import { clientMessages } from "../db/schema";
import { CommunicationService } from "./communication.service";
import { logger } from "../utils/logger";

export class MessagingRetryService {
  private timer: NodeJS.Timeout | null = null;
  private readonly communication = new CommunicationService();

  constructor(private readonly db: Database) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processDueRetries().catch((err) => {
        logger.error({ err }, "Messaging retry cycle failed");
      });
    }, 15000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async processDueRetries() {
    const now = new Date();

    const rows = await this.db.query.clientMessages.findMany({
      where: and(
        eq(clientMessages.status, "failed"),
        lte(clientMessages.nextRetryAt, now)
      ),
      limit: 50,
      with: {
        client: true,
      },
    });

    for (const row of rows) {
      if (row.retryCount >= row.maxRetries) continue;
      if (!row.client) continue;

      try {
        if (row.channel === "email") {
          if (!row.client.email) throw new Error("Client email missing");
          await this.communication.sendEmail(
            row.client.email,
            row.subject || "Silah Legal Notification",
            row.body
          );
        } else if (row.channel === "sms") {
          if (!row.client.phone) throw new Error("Client phone missing");
          await this.communication.sendSms(row.client.phone, row.body);
        } else if (row.channel === "whatsapp") {
          if (!row.client.phone) throw new Error("Client phone missing");
          await this.communication.sendWhatsApp(row.client.phone, row.body);
        } else {
          continue;
        }

        await this.db
          .update(clientMessages)
          .set({
            status: "sent",
            sentAt: new Date(),
            deliveredAt: new Date(),
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(clientMessages.id, row.id));
      } catch (err: any) {
        const nextRetryCount = row.retryCount + 1;
        const delayMinutes = Math.min(60, Math.pow(2, nextRetryCount));
        await this.db
          .update(clientMessages)
          .set({
            retryCount: nextRetryCount,
            nextRetryAt: new Date(Date.now() + delayMinutes * 60 * 1000),
            errorMessage: err?.message || "Retry failed",
            updatedAt: new Date(),
          })
          .where(eq(clientMessages.id, row.id));
      }
    }
  }
}
