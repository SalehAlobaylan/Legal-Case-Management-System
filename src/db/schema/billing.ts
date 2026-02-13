/*
 * Billing schema
 *
 * - Defines tables for subscription management, invoicing, and payments
 * - Supports multiple billing tiers with feature limits
 * - Tracks payment history and invoice PDF generation
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

// ============== TYPE DEFINITIONS ==============

export const subscriptionStatusEnum = [
  "active",
  "cancelled",
  "expired",
  "past_due",
] as const;

export const billingCycleEnum = ["monthly", "yearly"] as const;

export const invoiceStatusEnum = ["pending", "paid", "overdue", "cancelled"] as const;

export const paymentStatusEnum = ["pending", "completed", "failed", "refunded"] as const;

export const planTierEnum = ["free", "pro", "enterprise"] as const;

// ============== BILLING PLANS ==============

export const billingPlans = pgTable("billing_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // "Free", "Professional", "Enterprise"
  tier: varchar("tier", { length: 50 })
    .$type<(typeof planTierEnum)[number]>()
    .notNull(),
  priceMonthly: integer("price_monthly").notNull(), // in halalas (1 SAR = 100 halalas)
  priceYearly: integer("price_yearly").notNull(),
  currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
  features: varchar("features", { length: 1000 }).notNull(), // JSON string with feature limits
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============== SUBSCRIPTIONS ==============

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    planId: integer("plan_id")
      .references(() => billingPlans.id)
      .notNull(),
    status: varchar("status", { length: 20 })
      .$type<(typeof subscriptionStatusEnum)[number]>()
      .default("active")
      .notNull(),
    billingCycle: varchar("billing_cycle", { length: 10 })
      .$type<(typeof billingCycleEnum)[number]>()
      .notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"), // null = auto-renew
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("subscriptions_org_idx").on(table.organizationId),
    statusIdx: index("subscriptions_status_idx").on(table.status),
  })
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(billingPlans, {
    fields: [subscriptions.planId],
    references: [billingPlans.id],
  }),
}));

// ============== INVOICES ==============

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 50 }).unique().notNull(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id),
    amount: integer("amount").notNull(), // in halalas
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: varchar("status", { length: 20 })
      .$type<(typeof invoiceStatusEnum)[number]>()
      .default("pending")
      .notNull(),
    issueDate: timestamp("issue_date").notNull(),
    dueDate: timestamp("due_date").notNull(),
    paidDate: timestamp("paid_date"),
    pdfPath: varchar("pdf_path", { length: 500 }), // path to generated PDF
    metadata: varchar("metadata", { length: 1000 }), // JSON string for payment details
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("invoices_org_idx").on(table.organizationId),
    invoiceNumIdx: index("invoices_number_idx").on(table.invoiceNumber),
    statusIdx: index("invoices_status_idx").on(table.status),
    dueDateIdx: index("invoices_due_date_idx").on(table.dueDate),
  })
);

export const invoicesRelations = relations(invoices, ({ one }) => ({
  organization: one(organizations, {
    fields: [invoices.organizationId],
    references: [organizations.id],
  }),
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
}));

// ============== PAYMENTS ==============

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .references(() => invoices.id, { onDelete: "cascade" })
      .notNull(),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    method: varchar("method", { length: 50 }).notNull(), // "card", "bank_transfer", "apple_pay"
    status: varchar("status", { length: 20 })
      .$type<(typeof paymentStatusEnum)[number]>()
      .default("pending")
      .notNull(),
    provider: varchar("provider", { length: 50 }), // "stripe", "paypal", etc.
    providerTransactionId: varchar("provider_transaction_id", { length: 255 }),
    metadata: varchar("metadata", { length: 1000 }), // JSON string
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    invoiceIdx: index("payments_invoice_idx").on(table.invoiceId),
    statusIdx: index("payments_status_idx").on(table.status),
  })
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));

// ============== TYPE EXPORTS ==============

export type BillingPlan = typeof billingPlans.$inferSelect;
export type NewBillingPlan = typeof billingPlans.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type SubscriptionStatus = (typeof subscriptionStatusEnum)[number];
export type BillingCycle = (typeof billingCycleEnum)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum)[number];
export type PaymentStatus = (typeof paymentStatusEnum)[number];
export type PlanTier = (typeof planTierEnum)[number];
