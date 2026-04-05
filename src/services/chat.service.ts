import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  chatSessions,
  chatMessages,
  type ChatCitationRow,
} from "../db/schema/chat-sessions";

export class ChatService {
  constructor(private db: Database) {}

  /** Create a new chat session. */
  async createSession(input: {
    userId: string;
    organizationId: number;
    caseId?: number | null;
    title?: string;
    language?: string;
  }) {
    const [session] = await this.db
      .insert(chatSessions)
      .values({
        userId: input.userId,
        organizationId: input.organizationId,
        caseId: input.caseId ?? null,
        title: input.title || null,
        language: input.language || "ar",
      })
      .returning();
    return session;
  }

  /** Get a session by ID, scoped to an organization. */
  async getSession(sessionId: number, organizationId: number) {
    const session = await this.db.query.chatSessions.findFirst({
      where: and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.organizationId, organizationId)
      ),
      with: {
        messages: {
          orderBy: [chatMessages.createdAt],
        },
      },
    });
    return session ?? null;
  }

  /** List sessions for a user, newest first. */
  async listSessions(
    userId: string,
    organizationId: number,
    limit = 20,
    offset = 0
  ) {
    const sessions = await this.db.query.chatSessions.findMany({
      where: and(
        eq(chatSessions.userId, userId),
        eq(chatSessions.organizationId, organizationId)
      ),
      orderBy: [desc(chatSessions.updatedAt)],
      limit,
      offset,
    });
    return sessions;
  }

  /** Append a message to a session. */
  async addMessage(input: {
    sessionId: number;
    role: "user" | "assistant";
    content: string;
    citations?: ChatCitationRow[];
  }) {
    const [message] = await this.db
      .insert(chatMessages)
      .values({
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        citations: input.citations || [],
      })
      .returning();

    // Touch session updatedAt
    await this.db
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, input.sessionId));

    return message;
  }

  /** Update session title (auto-generated from first message). */
  async updateSessionTitle(sessionId: number, title: string) {
    await this.db
      .update(chatSessions)
      .set({ title: title.slice(0, 255) })
      .where(eq(chatSessions.id, sessionId));
  }

  /** Delete a session and its messages (cascade). */
  async deleteSession(sessionId: number, organizationId: number) {
    const [deleted] = await this.db
      .delete(chatSessions)
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.organizationId, organizationId)
        )
      )
      .returning();
    return deleted ?? null;
  }
}
