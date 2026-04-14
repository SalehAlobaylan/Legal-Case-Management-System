import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  jsonb,
  uuid,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { clients } from "./clients";
import { organizations } from "./organizations";
import { users } from "./users";

export const clientMessageTypeEnum = [
  "case_update",
  "hearing_reminder",
  "document_request",
  "invoice_notice",
  "general",
] as const;

export const clientMessageChannelEnum = ["in_app", "email", "sms", "whatsapp"] as const;

export const clientMessageStatusEnum = ["queued", "sent", "failed"] as const;
export const clientMessageDirectionEnum = ["outbound", "inbound"] as const;

export const clientMessages = pgTable(
  "client_messages",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    senderUserId: uuid("sender_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    type: varchar("type", { length: 50 })
      .$type<(typeof clientMessageTypeEnum)[number]>()
      .notNull(),
    channel: varchar("channel", { length: 20 })
      .$type<(typeof clientMessageChannelEnum)[number]>()
      .notNull(),
    subject: varchar("subject", { length: 255 }),
    body: text("body").notNull(),
    status: varchar("status", { length: 20 })
      .$type<(typeof clientMessageStatusEnum)[number]>()
      .default("queued")
      .notNull(),
    direction: varchar("direction", { length: 20 })
      .$type<(typeof clientMessageDirectionEnum)[number]>()
      .default("outbound")
      .notNull(),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0).notNull(),
    maxRetries: integer("max_retries").default(3).notNull(),
    nextRetryAt: timestamp("next_retry_at"),
    deliveredAt: timestamp("delivered_at"),
    readAt: timestamp("read_at"),
    isRead: boolean("is_read").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("client_messages_org_idx").on(table.organizationId),
    clientIdx: index("client_messages_client_idx").on(table.clientId),
    statusIdx: index("client_messages_status_idx").on(table.status),
    nextRetryAtIdx: index("client_messages_next_retry_at_idx").on(table.nextRetryAt),
    createdAtIdx: index("client_messages_created_at_idx").on(table.createdAt),
  })
);

export const clientMessagesRelations = relations(clientMessages, ({ one }) => ({
  organization: one(organizations, {
    fields: [clientMessages.organizationId],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [clientMessages.clientId],
    references: [clients.id],
  }),
  sender: one(users, {
    fields: [clientMessages.senderUserId],
    references: [users.id],
  }),
}));

export type ClientMessage = typeof clientMessages.$inferSelect;
export type NewClientMessage = typeof clientMessages.$inferInsert;
