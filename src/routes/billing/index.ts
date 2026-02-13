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
            limit: { type: "number", default: 50 },
            offset: { type: "number", default: 0 },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      // Admin-only access
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const query = request.query as {
        status?: string;
        limit?: string;
        offset?: string;
      };

      const billingService = new BillingService(app.db);
      const invoices = await billingService.getInvoicesByOrganization(user.orgId, {
        status: query.status,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
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

      // Admin-only access
      if (user.role !== "admin") {
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

      // Admin-only access
      if (user.role !== "admin") {
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
      const { id } = request.params as { id: string };
      const invoiceId = parseInt(id, 10);

      if (isNaN(invoiceId)) {
        return reply.status(400).send({ message: "Invalid invoice ID" });
      }

      // Admin-only access
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const billingService = new BillingService(app.db);
      const pdfService = new PDFDocumentService();

      const invoice = await billingService.getInvoiceById(invoiceId, user.orgId);

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
