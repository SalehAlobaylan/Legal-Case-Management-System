/*
 * BillingService
 *
 * - Core billing operations for subscriptions and invoices
 * - MVP: Mock implementation (no payment processor integration)
 * - Organization-scoped with admin access control
 */

import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  billingPlans,
  subscriptions,
  invoices,
  organizations,
} from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";

export class BillingService {
  constructor(private db: Database) {}

  /**
   * getInvoicesByOrganization
   *
   * - Returns all invoices for an organization
   * - Ordered by issue date (newest first)
   */
  async getInvoicesByOrganization(orgId: number, filters?: {
    status?: string;
    limit?: number;
    offset?: number;
    clientId?: number;
  }) {
    const conditions = [eq(invoices.organizationId, orgId)];

    if (filters?.status) {
      conditions.push(eq(invoices.status, filters.status as any));
    }

    if (typeof filters?.clientId === "number") {
      conditions.push(eq(invoices.clientId, filters.clientId));
    }

    const invoicesList = await this.db.query.invoices.findMany({
      where: and(...conditions),
      orderBy: [desc(invoices.issueDate)],
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
      with: {
        subscription: {
          with: {
            plan: true,
          },
        },
      },
    });

    return invoicesList;
  }

  async createInvoice(input: {
    organizationId: number;
    clientId?: number;
    amount: number;
    currency?: string;
    dueDate: Date;
    description?: string;
  }) {
    const now = new Date();
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate()
    ).padStart(2, "0")}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const [invoice] = await this.db
      .insert(invoices)
      .values({
        invoiceNumber,
        organizationId: input.organizationId,
        clientId: input.clientId,
        amount: input.amount,
        currency: input.currency || "SAR",
        status: "pending",
        issueDate: now,
        dueDate: input.dueDate,
        metadata: input.description
          ? JSON.stringify({ description: input.description })
          : null,
      })
      .returning();

    return invoice;
  }

  /**
   * getInvoiceById
   *
   * - Gets a single invoice by ID
   * - Verifies organization access
   */
  async getInvoiceById(invoiceId: number, orgId: number, scopedClientId?: number | null) {
    const invoice = await this.db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        subscription: {
          with: {
            plan: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError("Invoice");
    }

    if (invoice.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this invoice");
    }

    if (typeof scopedClientId === "number" && invoice.clientId !== scopedClientId) {
      throw new ForbiddenError("Access denied to this invoice");
    }

    return invoice;
  }

  /**
   * subscribeToPlan
   *
   * - Creates or updates a subscription for an organization
   * - MVP: Mock implementation (no payment processor)
   * - Returns subscription details
   */
  async subscribeToPlan(
    orgId: number,
    planId: number,
    billingCycle: "monthly" | "yearly"
  ) {
    // Verify plan exists and is active
    const plan = await this.db.query.billingPlans.findFirst({
      where: eq(billingPlans.id, planId),
    });

    if (!plan) {
      throw new NotFoundError("Billing plan");
    }

    if (!plan.isActive) {
      throw new Error("Billing plan is not available");
    }

    // Check for existing active subscription
    const existing = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, orgId),
    });

    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);

    // Calculate end date based on billing cycle
    if (billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    if (existing) {
      // Update existing subscription
      const [updated] = await this.db
        .update(subscriptions)
        .set({
          planId,
          billingCycle,
          status: "active",
          startDate,
          endDate,
          cancelAtPeriodEnd: false,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existing.id))
        .returning();

      return updated;
    } else {
      // Create new subscription
      const [created] = await this.db
        .insert(subscriptions)
        .values({
          organizationId: orgId,
          planId,
          billingCycle,
          status: "active",
          startDate,
          endDate,
          cancelAtPeriodEnd: false,
        })
        .returning();

      return created;
    }
  }

  /**
   * cancelSubscription
   *
   * - Cancels organization's subscription
   * - Sets cancelAtPeriodEnd = true
   * - Access continues until period end
   */
  async cancelSubscription(orgId: number) {
    const subscription = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, orgId),
      with: {
        plan: true,
      },
    });

    if (!subscription) {
      throw new NotFoundError("Subscription");
    }

    if (subscription.cancelAtPeriodEnd) {
      throw new Error("Subscription already scheduled for cancellation");
    }

    const [updated] = await this.db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id))
      .returning();

    return updated;
  }
}
