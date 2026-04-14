import {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env";
import type { Database } from "../../db/connection";
import { clientMessages, clients } from "../../db/schema";

type AppFastify = FastifyRequest & {
  server: {
    db: Database;
    broadcastToClientRoom?: (
      orgId: number,
      clientId: number,
      event: string,
      data: Record<string, unknown>
    ) => void;
  };
};

const payloadSchema = z.object({
  channel: z.enum(["email", "sms", "whatsapp"]),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1),
  orgId: z.number().int().positive().optional(),
  clientId: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const webhooksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/messages/inbound",
    {
      schema: {
        description: "Provider inbound message webhook",
        tags: ["webhooks"],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AppFastify;

      if (env.WEBHOOK_SHARED_SECRET) {
        const header = request.headers["x-webhook-secret"];
        if (header !== env.WEBHOOK_SHARED_SECRET) {
          return reply.status(401).send({ message: "Unauthorized webhook" });
        }
      }

      const data = payloadSchema.parse(request.body);

      let client = null as any;

      if (data.clientId && data.orgId) {
        client = await req.server.db.query.clients.findFirst({
          where: and(eq(clients.id, data.clientId), eq(clients.organizationId, data.orgId)),
        });
      }

      if (!client && data.from) {
        const phone = data.from.replace(/[^+\d]/g, "");
        client = await req.server.db.query.clients.findFirst({
          where: eq(clients.phone, phone),
        });
      }

      if (!client && data.from) {
        client = await req.server.db.query.clients.findFirst({
          where: eq(clients.email, data.from.toLowerCase()),
        });
      }

      if (!client) {
        return reply.status(404).send({ message: "No matching client found" });
      }

      const [record] = await req.server.db
        .insert(clientMessages)
        .values({
          organizationId: client.organizationId,
          clientId: client.id,
          senderUserId: null,
          type: "general",
          channel: data.channel,
          subject: data.subject,
          body: data.message,
          status: "sent",
          direction: "inbound",
          sentAt: new Date(),
          deliveredAt: new Date(),
          isRead: false,
          metadata: {
            ...(data.metadata || {}),
            from: data.from,
            to: data.to,
            source: "webhook",
          },
        })
        .returning();

      req.server.broadcastToClientRoom?.(client.organizationId, client.id, "client-messages:new", {
        clientId: client.id,
        message: record,
      });

      return reply.code(201).send({ success: true, messageId: record.id });
    }
  );
};

export default webhooksRoutes;
