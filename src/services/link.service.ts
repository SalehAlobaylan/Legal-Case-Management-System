import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { caseRegulationLinks, type NewCaseRegulationLink } from "../db/schema";

/**
 * LinkService
 *
 * - Encapsulates all data access and business logic for links between
 *   cases and regulations.
 * - Uses `caseRegulationLinks` table to create, read, update, and delete
 *   AI- or manually-generated links.
 */
export class LinkService {
  constructor(private readonly db: Database) {}

  /**
   * createLink
   *
   * - Inserts or updates a link between a case and a regulation.
   * - If a link for the same `(caseId, regulationId)` already exists,
   *   its `similarityScore` and `method` are updated instead.
   */
  async createLink(data: NewCaseRegulationLink) {
    const [link] = await this.db
      .insert(caseRegulationLinks)
      .values(data)
      .onConflictDoUpdate({
        target: [caseRegulationLinks.caseId, caseRegulationLinks.regulationId],
        set: {
          similarityScore: data.similarityScore,
          method: data.method,
        },
      })
      .returning();

    return link;
  }

  /**
   * getLinksByCaseId
   *
   * - Returns all links for a given case, ordered by highest similarity first.
   * - Includes the linked `regulation` record for convenient consumption by
   *   the API layer and frontend.
   */
  async getLinksByCaseId(caseId: number) {
    return this.db.query.caseRegulationLinks.findMany({
      where: eq(caseRegulationLinks.caseId, caseId),
      orderBy: [desc(caseRegulationLinks.similarityScore)],
      with: {
        regulation: true,
      },
    });
  }

  /**
   * verifyLink
   *
   * - Marks a link as verified by a specific user and timestamps the action.
   */
  async verifyLink(linkId: number, userId: number) {
    const [updated] = await this.db
      .update(caseRegulationLinks)
      .set({
        verified: true,
        verifiedBy: userId,
        verifiedAt: new Date(),
      })
      .where(eq(caseRegulationLinks.id, linkId))
      .returning();

    return updated;
  }

  /**
   * deleteLink
   *
   * - Permanently removes a link by its primary key.
   */
  async deleteLink(linkId: number) {
    await this.db
      .delete(caseRegulationLinks)
      .where(eq(caseRegulationLinks.id, linkId));
  }
}




