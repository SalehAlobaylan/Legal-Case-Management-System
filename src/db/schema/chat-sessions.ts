import {
  pgTable,
  serial,
  uuid,
  integer,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";
import { cases } from "./cases";

// ---------------------------------------------------------------------------
// chat_sessions — one per conversation thread
// ---------------------------------------------------------------------------

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    organizationId: integer("organization_id")
      .references(() => organizations.id)
      .notNull(),
    caseId: integer("case_id").references(() => cases.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }),
    language: varchar("language", { length: 8 }).default("ar"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("chat_sessions_user_idx").on(table.userId),
    orgIdx: index("chat_sessions_org_idx").on(table.organizationId),
  })
);

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [chatSessions.organizationId],
    references: [organizations.id],
  }),
  case: one(cases, {
    fields: [chatSessions.caseId],
    references: [cases.id],
  }),
  messages: many(chatMessages),
}));

// ---------------------------------------------------------------------------
// chat_messages — individual messages within a session
// ---------------------------------------------------------------------------

export interface ChatCitationRow {
  regulation_id: number;
  regulation_title: string;
  article_ref?: string | null;
  chunk_id?: number | null;
}

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .references(() => chatSessions.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 16 }).notNull(), // "user" | "assistant"
    content: text("content").notNull(),
    citations: jsonb("citations")
      .$type<ChatCitationRow[]>()
      .default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("chat_messages_session_idx").on(table.sessionId),
  })
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));
