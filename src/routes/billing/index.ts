/*
 * Billing routes plugin
 *
 * - Registers HTTP endpoints under `/api/billing` prefix
 * - Provides invoice management and subscription operations
 * - All routes require JWT authentication + admin role
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { BillingService } from "../../services/billing.service";
import { PDFDocumentService } from "../../services/pdf-document.service";
import * as fs from "fs";
import * as path from "path";
import type { Database } from "../../db/connection";
import { organizations, invoices } from "../../db/schema";
import { eq } from "drizzle-orm";
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
};

const billingRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  // All routes require authentication
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /api/billing/invoices
   *
   * - Returns invoice history for organization
   * - Supports optional status filter
   */
  fastify.get(
    "/invoices",
    {
      schema: {
        description: "Get invoice history",
        tags: ["billing"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "paid", "overdue", "cancelled"],
            },
            clientId: { type: "number", minimum: 1 },
            limit: { type: "number", default: 50 },
            offset: { type: "number", default: 0 },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);

      // Staff/admin-only unless client-scoped portal view
      if (user.role !== "admin" && typeof scopedClientId !== "number") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const query = request.query as {
        status?: string;
        clientId?: string;
        limit?: string;
        offset?: string;
      };

      const requestedClientId = query.clientId ? parseInt(query.clientId, 10) : undefined;

      const billingService = new BillingService(app.db);
      const invoices = await billingService.getInvoicesByOrganization(user.orgId, {
        status: query.status,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
        clientId: scopedClientId ?? requestedClientId,
      });

      return reply.send({ invoices });
    }
  );

  /**
   * POST /api/billing/subscribe
   *
   * - Subscribes organization to a billing plan
   * - Creates or updates subscription
   */
  fastify.post(
    "/invoices",
    {
      schema: {
        description: "Create invoice",
        tags: ["billing"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["amount", "dueDate"],
          properties: {
            clientId: { type: "number", minimum: 1 },
            amount: { type: "number", minimum: 1 },
            currency: { type: "string", minLength: 3, maxLength: 3 },
            dueDate: { type: "string", format: "date-time" },
            description: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & {
        body: {
          clientId?: number;
          amount: number;
          currency?: string;
          dueDate: string;
          description?: string;
        };
      };
      const scopedClientId = await getScopedClientIdForUser(app.db, user);

      if (user.role !== "admin" || typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const billingService = new BillingService(app.db);
      const invoice = await billingService.createInvoice({
        organizationId: user.orgId,
        clientId: body.clientId,
        amount: body.amount,
        currency: body.currency,
        dueDate: new Date(body.dueDate),
        description: body.description,
      });

      return reply.code(201).send({ invoice });
    }
  );

  fastify.post(
    "/subscribe",
    {
      schema: {
        description: "Subscribe to a plan",
        tags: ["billing"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["planId", "billingCycle"],
          properties: {
            planId: { type: "number", minimum: 1 },
            billingCycle: { type: "string", enum: ["monthly", "yearly"] },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & {
        body: { planId: number; billingCycle: "monthly" | "yearly" };
      };
      const scopedClientId = await getScopedClientIdForUser(app.db, user);

      // Admin-only access
      if (user.role !== "admin" || typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const { planId, billingCycle } = body;

      const billingService = new BillingService(app.db);
      const subscription = await billingService.subscribeToPlan(
        user.orgId,
        planId,
        billingCycle
      );

      return reply.send({ subscription });
    }
  );

  /**
   * DELETE /api/billing/subscription
   *
   * - Cancels organization's subscription
   * - Sets cancelAtPeriodEnd = true
   */
  fastify.delete(
    "/subscription",
    {
      schema: {
        description: "Cancel subscription",
        tags: ["billing"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);

      // Admin-only access
      if (user.role !== "admin" || typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const billingService = new BillingService(app.db);
      const subscription = await billingService.cancelSubscription(user.orgId);

      return reply.send({
        subscription,
        message:
          "Subscription will be cancelled at the end of the billing period",
      });
    }
  );

  /**
   * GET /api/billing/invoices/:id/pdf
   *
   * - Downloads invoice PDF
   * - Generates PDF on-demand if not exists
   */
  fastify.get(
    "/invoices/:id/pdf",
    {
      schema: {
        description: "Download invoice PDF",
        tags: ["billing"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        return reply.status(400).send({ message: "Invalid invoice ID" });
      }

      // Admin-only access unless scoped client portal
      if (user.role !== "admin" && typeof scopedClientId !== "number") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const billingService = new BillingService(app.db);
      const pdfService = new PDFDocumentService();

      const invoice = await billingService.getInvoiceById(
        invoiceId,
        user.orgId,
        scopedClientId
      );

      let pdfPath = invoice.pdfPath;

      // Generate PDF if not exists
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        const org = await app.db.query.organizations.findFirst({
          where: eq(organizations.id, user.orgId),
        });

        if (!org) {
          return reply.status(404).send({ message: "Organization not found" });
        }

        pdfPath = await pdfService.generateInvoicePDF(invoice, org.name);

        // Update invoice with PDF path
        await app.db
          .update(invoices)
          .set({ pdfPath })
          .where(eq(invoices.id, invoiceId));
      }

      // Set headers for download
      reply.header(
        "Content-Disposition",
        `attachment; filename="${path.basename(pdfPath)}"`
      );
      reply.header("Content-Type", "application/pdf");

      // Stream file
      const stream = fs.createReadStream(pdfPath);
      return reply.send(stream);
    }
  );
};

export default billingRoutes;
