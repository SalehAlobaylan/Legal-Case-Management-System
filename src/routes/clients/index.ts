/*
 * Clients routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/clients` prefix.
 * - Provides full CRUD operations for managing legal clients.
 * - All routes require JWT authentication.
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { ClientService } from "../../services/client.service";
import { ExportService } from "../../services/export.service";
import { ClientMessagingService } from "../../services/client-messaging.service";
import type { Database } from "../../db/connection";
import { and, eq } from "drizzle-orm";
import { clientMessages, clients } from "../../db/schema";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { AutomationEngineService } from "../../services/automation-engine.service";
import { getScopedClientIdForUser } from "../../lib/request-context";

type RequestWithUser = FastifyRequest & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  db: Database;
  emitToUser?: (
    userId: string,
    event: string,
    data: Record<string, unknown>
  ) => void;
  broadcastToClientRoom?: (
    orgId: number,
    clientId: number,
    event: string,
    data: Record<string, unknown>
  ) => void;
};

// Zod schemas for validation
const createClientSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["individual", "corporate", "sme", "group"]).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  leadStatus: z.enum(["lead", "contacted", "consultation", "retained"]).optional(),
  tags: z.array(z.string()).optional(),
});

const updateClientSchema = createClientSchema.partial();

const clientsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  const automationEngine = new AutomationEngineService(app.db);
  const CLIENT_UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads/client-documents";
  if (!fs.existsSync(CLIENT_UPLOAD_DIR)) {
    fs.mkdirSync(CLIENT_UPLOAD_DIR, { recursive: true });
  }

  // All routes require authentication
  app.addHook("onRequest", app.authenticate);

  /**
   * POST /api/clients
   *
   * - Creates a new client for the authenticated user's organization.
   */
  fastify.post(
    "/",
    {
      schema: {
        description: "Create a new client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const scopedClientId = await getScopedClientIdForUser(app.db, user);

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot create clients" });
      }

      const data = createClientSchema.parse(body);

      const clientService = new ClientService(app.db);
      const client = await clientService.createClient({
        ...data,
        organizationId: user.orgId,
      });

      return reply.code(201).send({ client });
    }
  );

  /**
   * GET /api/clients
   *
   * - Lists all clients for the authenticated user's organization.
   * - Supports optional filters for type and status.
   */
  fastify.get(
    "/",
    {
      schema: {
        description: "Get all clients for organization",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["individual", "corporate", "sme", "group"],
            },
            search: { type: "string" },
            status: { type: "string", enum: ["active", "inactive"] },
            leadStatus: { type: "string", enum: ["lead", "contacted", "consultation", "retained"] },
            tag: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { type, status, leadStatus, tag, search } = request.query as {
        type?: string;
        status?: string;
        leadStatus?: string;
        tag?: string;
        search?: string;
      };

      const clientService = new ClientService(app.db);
      if (typeof scopedClientId === "number") {
        const client = await clientService.getClientById(scopedClientId, user.orgId);
        return reply.send({ clients: [client], total: 1, page: 1, limit: 1 });
      }

      const clientsList = await clientService.getClientsByOrganization(
        user.orgId,
        { type, status, leadStatus, tag }
      );

      const filtered = search
        ? clientsList.filter((c) => {
            const needle = search.toLowerCase();
            return (
              c.name.toLowerCase().includes(needle) ||
              (c.email || "").toLowerCase().includes(needle) ||
              (c.phone || "").toLowerCase().includes(needle)
            );
          })
        : clientsList;

      return reply.send({
        clients: filtered,
        total: filtered.length,
        page: 1,
        limit: filtered.length,
      });
    }
  );

  fastify.post(
    "/:id/documents",
    {
      schema: {
        description: "Upload a document for a client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
        consumes: ["multipart/form-data"],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot upload documents" });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ message: "No file uploaded" });
      }

      const ext = path.extname(file.filename);
      const storedName = `${randomUUID()}${ext}`;
      const filePath = path.resolve(CLIENT_UPLOAD_DIR, storedName);
      const writeStream = fs.createWriteStream(filePath);

      await new Promise<void>((resolve, reject) => {
        file.file.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        file.file.on("error", reject);
      });

      const stat = fs.statSync(filePath);
      const clientService = new ClientService(app.db);
      const document = await clientService.createClientDocument(clientId, user.orgId, {
        name: file.filename,
        fileUrl: `/uploads/client-documents/${storedName}`,
        fileType: file.mimetype,
        fileSize: stat.size,
        uploadedById: user.id,
      });

      return reply.code(201).send({ document });
    }
  );

  fastify.delete(
    "/:id/documents/:docId",
    {
      schema: {
        description: "Delete a client document",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id, docId } = request.params as { id: string; docId: string };
      const clientId = parseInt(id, 10);
      const documentId = parseInt(docId, 10);

      if (isNaN(clientId) || isNaN(documentId)) {
        return reply.status(400).send({ message: "Invalid IDs" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot delete documents" });
      }

      const clientService = new ClientService(app.db);
      const deleted = await clientService.deleteClientDocument(clientId, documentId, user.orgId);

      if (deleted.fileUrl.startsWith("/uploads/client-documents/")) {
        const absolute = path.resolve(CLIENT_UPLOAD_DIR, path.basename(deleted.fileUrl));
        if (fs.existsSync(absolute)) {
          fs.unlinkSync(absolute);
        }
      }

      return reply.code(204).send();
    }
  );

  fastify.get(
    "/:id/documents/:docId/download",
    {
      schema: {
        description: "Download a client document",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id, docId } = request.params as { id: string; docId: string };
      const clientId = parseInt(id, 10);
      const documentId = parseInt(docId, 10);

      if (isNaN(clientId) || isNaN(documentId)) {
        return reply.status(400).send({ message: "Invalid IDs" });
      }

      if (typeof scopedClientId === "number" && scopedClientId !== clientId) {
        return reply.status(403).send({ message: "Access denied to this client" });
      }

      const clientService = new ClientService(app.db);
      const docs = await clientService.getClientDocuments(clientId, user.orgId);
      const doc = docs.find((d) => d.id === documentId);
      if (!doc) {
        return reply.status(404).send({ message: "Document not found" });
      }

      if (!doc.fileUrl.startsWith("/uploads/client-documents/")) {
        return reply.status(422).send({ message: "Unsupported file location" });
      }

      const absolute = path.resolve(CLIENT_UPLOAD_DIR, path.basename(doc.fileUrl));
      if (!fs.existsSync(absolute)) {
        return reply.status(404).send({ message: "File not found" });
      }

      reply.header("Content-Disposition", `attachment; filename="${doc.name}"`);
      reply.header("Content-Type", doc.fileType || "application/octet-stream");
      const stream = fs.createReadStream(absolute);
      return reply.send(stream);
    }
  );

  /**
   * GET /api/clients/:id
   *
   * - Gets a single client by ID.
   */
  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get client by ID",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number" && scopedClientId !== clientId) {
        return reply.status(403).send({ message: "Access denied to this client" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot update clients" });
      }

      const clientService = new ClientService(app.db);
      const client = await clientService.getClientById(clientId, user.orgId);

      return reply.send({ client });
    }
  );

  /**
   * PUT /api/clients/:id
   *
   * - Updates a client's information.
   */
  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number" && scopedClientId !== clientId) {
        return reply.status(403).send({ message: "Access denied to this client" });
      }

      const data = updateClientSchema.parse(body);

      const clientService = new ClientService(app.db);
      const { updated: client, previous } = await clientService.updateClient(
        clientId,
        user.orgId,
        data
      );

      if (
        data.leadStatus &&
        previous.leadStatus &&
        data.leadStatus !== previous.leadStatus
      ) {
        automationEngine.emitClientStatusChanged({
          organizationId: user.orgId,
          clientId,
          fromStatus: previous.leadStatus,
          toStatus: data.leadStatus,
        });
      }

      return reply.send({ client });
    }
  );

  /**
   * DELETE /api/clients/:id
   *
   * - Deletes a client by ID.
   */
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot delete clients" });
      }

      const clientService = new ClientService(app.db);
      await clientService.deleteClient(clientId, user.orgId);

      return reply.code(204).send();
    }
  );

  /**
   * GET /api/clients/:id/cases
   *
   * - Gets all cases for a specific client.
   */
  fastify.get(
    "/:id/cases",
    {
      schema: {
        description: "Get all cases for a client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number" && scopedClientId !== clientId) {
        return reply.status(403).send({ message: "Access denied to this client" });
      }

      const clientService = new ClientService(app.db);
      const cases = await clientService.getClientCases(clientId, user.orgId);

      return reply.send({ cases });
    }
  );

  /**
   * GET /api/clients/:id/activities
   *
   * - Gets all timeline activities for a specific client.
   */
  fastify.get(
    "/:id/activities",
    {
      schema: {
        description: "Get all activities for a client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number" && scopedClientId !== clientId) {
        return reply.status(403).send({ message: "Access denied to this client" });
      }

      const clientService = new ClientService(app.db);
      const activities = await clientService.getClientActivities(clientId, user.orgId);

      return reply.send({ activities });
    }
  );

  /**
   * POST /api/clients/:id/activities
   *
   * - Creates a new timeline activity for a client
   */
  const createActivitySchema = z.object({
    type: z.enum(["call", "email", "meeting", "system", "note"]),
    description: z.string().min(1),
    metadata: z.record(z.any()).optional(),
  });

  fastify.post(
    "/:id/activities",
    {
      schema: {
        description: "Create an activity for client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["type", "description"],
          properties: {
            type: { type: "string", enum: ["call", "email", "meeting", "system", "note"] },
            description: { type: "string", minLength: 1 },
            metadata: { type: "object" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot create activities" });
      }

      const data = createActivitySchema.parse(body);

      const clientService = new ClientService(app.db);
      const activity = await clientService.createClientActivity(clientId, user.orgId, {
        ...data,
        userId: user.id,
      });

      return reply.code(201).send({ activity });
    }
  );

  /**
   * GET /api/clients/:id/documents
   *
   * - Gets all documents for a specific client.
   */
  fastify.get(
    "/:id/documents",
    {
      schema: {
        description: "Get all documents for a client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number" && scopedClientId !== clientId) {
        return reply.status(403).send({ message: "Access denied to this client" });
      }

      const clientService = new ClientService(app.db);
      const documents = await clientService.getClientDocuments(clientId, user.orgId);

      return reply.send({ documents });
    }
  );

  /**
   * GET /api/clients/export
   *
   * - Exports all clients to CSV format
   * - Returns file for download
   */
  fastify.get(
    "/export",
    {
      schema: {
        description: "Export clients to CSV",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["csv"],
              default: "csv",
            },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const query = request.query as { format?: string };

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot export client data" });
      }

      // Only CSV supported in MVP
      if (query.format && query.format !== "csv") {
        return reply
          .status(400)
          .send({ message: "Only CSV format is currently supported" });
      }

      const exportService = new ExportService(app.db);
      const filePath = await exportService.exportClientsToCSV(user.orgId);

      // Set headers for CSV download
      const filename = path.basename(filePath);
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      reply.header("Content-Type", "text/csv");

      // Stream file
      const fileStream = fs.createReadStream(filePath);

      // Delete file after streaming
      fileStream.on("end", async () => {
        await exportService.deleteExportFile(filePath);
      });

      return reply.send(fileStream);
    }
  );

  /**
   * POST /api/clients/:id/message
   *
   * - Sends a message/notification to a client
   * - Creates in-app notifications for team members
   */
  const sendMessageSchema = z.object({
    message: z.string().min(1).max(2000),
    type: z
      .enum(["case_update", "hearing_reminder", "document_request", "invoice_notice", "general"])
      .optional(),
    channel: z.enum(["in_app", "email", "sms", "whatsapp"]).optional(),
    subject: z.string().max(255).optional(),
  });

  fastify.post(
    "/:id/message",
    {
      schema: {
        description: "Send message to client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string", minLength: 1, maxLength: 2000 },
            type: {
              type: "string",
              enum: ["case_update", "hearing_reminder", "document_request", "invoice_notice", "general"],
            },
            channel: {
              type: "string",
              enum: ["in_app", "email", "sms", "whatsapp"],
            },
            subject: { type: "string", maxLength: 255 },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & {
        body: { message: string; type?: string };
      };
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot send messages" });
      }

      const data = sendMessageSchema.parse(body);

      const messagingService = new ClientMessagingService(app.db, app.emitToUser);
      const result = await messagingService.sendMessageToClient({
        clientId,
        message: data.message,
        type: (data.type as any) || "general",
        channel: (data.channel as any) || "in_app",
        subject: data.subject,
        userId: user.id,
        orgId: user.orgId,
      });

      app.broadcastToClientRoom?.(user.orgId, clientId, "client-messages:new", {
        clientId,
        message: result.messageRecord,
      });

      return reply.send(result);
    }
  );

  fastify.get(
    "/:id/messages",
    {
      schema: {
        description: "Get message history for client",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);

      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      if (typeof scopedClientId === "number" && scopedClientId !== clientId) {
        return reply.status(403).send({ message: "Access denied to this client" });
      }

      const messagingService = new ClientMessagingService(app.db, app.emitToUser);
      const messages = await messagingService.getClientMessageHistory(clientId, user.orgId);
      return reply.send({ messages });
    }
  );

  fastify.post(
    "/:id/messages/:messageId/read",
    {
      schema: {
        description: "Mark message as read",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id, messageId } = request.params as { id: string; messageId: string };
      const clientId = parseInt(id, 10);
      const parsedMessageId = parseInt(messageId, 10);

      if (isNaN(clientId) || isNaN(parsedMessageId)) {
        return reply.status(400).send({ message: "Invalid IDs" });
      }

      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      if (typeof scopedClientId === "number" && scopedClientId !== clientId) {
        return reply.status(403).send({ message: "Access denied to this client" });
      }

      const messagingService = new ClientMessagingService(app.db, app.emitToUser);
      const record = await messagingService.markMessageRead(parsedMessageId, user.orgId);

      app.broadcastToClientRoom?.(user.orgId, clientId, "client-messages:read", {
        clientId,
        messageId: parsedMessageId,
        readAt: record.readAt,
      });

      return reply.send({ message: record });
    }
  );

  fastify.post(
    "/:id/messages/:messageId/retry",
    {
      schema: {
        description: "Retry failed message",
        tags: ["clients"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id, messageId } = request.params as { id: string; messageId: string };
      const clientId = parseInt(id, 10);
      const parsedMessageId = parseInt(messageId, 10);

      if (isNaN(clientId) || isNaN(parsedMessageId)) {
        return reply.status(400).send({ message: "Invalid IDs" });
      }

      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot retry messages" });
      }

      const messagingService = new ClientMessagingService(app.db, app.emitToUser);
      const record = await messagingService.retryMessage(parsedMessageId, user.orgId);

      app.broadcastToClientRoom?.(user.orgId, clientId, "client-messages:updated", {
        clientId,
        message: record,
      });

      return reply.send({ message: record });
    }
  );

  fastify.post(
    "/:id/messages/inbound",
    {
      schema: {
        description: "Receive inbound message from external provider",
        tags: ["clients"],
        body: {
          type: "object",
          required: ["channel", "message"],
          properties: {
            channel: { type: "string", enum: ["email", "sms", "whatsapp", "in_app"] },
            message: { type: "string", minLength: 1, maxLength: 4000 },
            subject: { type: "string", maxLength: 255 },
            metadata: { type: "object" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & {
        body: {
          channel: "email" | "sms" | "whatsapp" | "in_app";
          message: string;
          subject?: string;
          metadata?: Record<string, unknown>;
        };
      };

      const { id } = request.params as { id: string };
      const clientId = parseInt(id, 10);
      if (isNaN(clientId)) {
        return reply.status(400).send({ message: "Invalid client ID" });
      }

      const client = await app.db.query.clients.findFirst({
        where: and(eq(clients.id, clientId), eq(clients.organizationId, user.orgId)),
      });
      if (!client) {
        return reply.status(404).send({ message: "Client not found" });
      }

      const [record] = await app.db
        .insert(clientMessages)
        .values({
          organizationId: user.orgId,
          clientId,
          senderUserId: null,
          type: "general",
          channel: body.channel,
          subject: body.subject,
          body: body.message,
          status: "sent",
          direction: "inbound",
          sentAt: new Date(),
          metadata: body.metadata || {},
        })
        .returning();

      app.broadcastToClientRoom?.(user.orgId, clientId, "client-messages:new", {
        clientId,
        message: record,
      });

      return reply.code(201).send({ message: record });
    }
  );
};

export default clientsRoutes;
