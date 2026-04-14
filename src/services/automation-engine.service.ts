import { EventEmitter } from "events";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { automationRules, clients } from "../db/schema";
import { CommunicationService } from "./communication.service";
import { logger } from "../utils/logger";

type ClientStatusChangedEvent = {
  organizationId: number;
  clientId: number;
  fromStatus: string;
  toStatus: string;
};

const bus = new EventEmitter();

export class AutomationEngineService {
  private readonly communication = new CommunicationService();

  constructor(private db: Database) {}

  start() {
    bus.on("client.status.changed", this.onClientStatusChanged);
  }

  stop() {
    bus.off("client.status.changed", this.onClientStatusChanged);
  }

  emitClientStatusChanged(payload: ClientStatusChangedEvent) {
    bus.emit("client.status.changed", payload);
  }

  private onClientStatusChanged = async (payload: ClientStatusChangedEvent) => {
    try {
      const rules = await this.db.query.automationRules.findMany({
        where: and(
          eq(automationRules.organizationId, payload.organizationId),
          eq(automationRules.triggerType, "client.status.changed"),
          eq(automationRules.active, true)
        ),
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      });

      if (!rules.length) return;

      const client = await this.db.query.clients.findFirst({
        where: and(
          eq(clients.id, payload.clientId),
          eq(clients.organizationId, payload.organizationId)
        ),
      });

      if (!client) return;

      for (const rule of rules) {
        if (rule.triggerValue && rule.triggerValue !== payload.toStatus) {
          continue;
        }

        try {
          const rendered = this.renderTemplate(rule.templateBody, {
            client_name: client.name,
            client_email: client.email || "",
            old_status: payload.fromStatus,
            new_status: payload.toStatus,
          });

          if (rule.actionType === "send_email") {
            if (!client.email) {
              throw new Error(`Client ${client.id} does not have an email address`);
            }
            await this.communication.sendEmail(
              client.email,
              "Silah Legal Notification",
              rendered
            );
          } else if (rule.actionType === "send_whatsapp" || rule.actionType === "send_sms") {
            if (!client.phone) {
              throw new Error(`Client ${client.id} does not have a phone number`);
            }

            if (rule.actionType === "send_whatsapp") {
              await this.communication.sendWhatsApp(client.phone, rendered);
            } else {
              await this.communication.sendSms(client.phone, rendered);
            }
          }

          logger.info(
            {
              organizationId: payload.organizationId,
              clientId: payload.clientId,
              ruleId: rule.id,
              actionType: rule.actionType,
              triggerType: rule.triggerType,
            },
            "Automation rule executed successfully"
          );
        } catch (error) {
          logger.error(
            {
              err: error,
              organizationId: payload.organizationId,
              clientId: payload.clientId,
              ruleId: rule.id,
              actionType: rule.actionType,
            },
            "Automation rule execution failed"
          );
        }
      }
    } catch (error) {
      logger.error({ err: error, payload }, "Automation event processing failed");
    }
  };

  private renderTemplate(template: string, vars: Record<string, string>) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
      return vars[key] ?? "";
    });
  }
}
