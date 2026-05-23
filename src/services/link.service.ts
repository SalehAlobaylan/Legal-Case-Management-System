import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { caseRegulationLinks, cases, type NewCaseRegulationLink } from "../db/schema";
import { ForbiddenError, NotFoundError } from "../utils/errors";

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
    const updateSet: Partial<typeof caseRegulationLinks.$inferInsert> = {
      similarityScore: data.similarityScore,
      method: data.method,
    };
    if (typeof data.evidenceSources !== "undefined") {
      updateSet.evidenceSources = data.evidenceSources;
    }
    if (typeof data.matchedRegulationVersionId !== "undefined") {
      updateSet.matchedRegulationVersionId = data.matchedRegulationVersionId;
    }
    if (typeof data.matchExplanation !== "undefined") {
      updateSet.matchExplanation = data.matchExplanation;
    }
    if (typeof data.matchedWithDocuments !== "undefined") {
      updateSet.matchedWithDocuments = data.matchedWithDocuments;
    }

    const [link] = await this.db
      .insert(caseRegulationLinks)
      .values(data)
      .onConflictDoUpdate({
        target: [caseRegulationLinks.caseId, caseRegulationLinks.regulationId],
        set: updateSet,
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

  /*
   * assertLinkInOrg
   *
   * - Loads a link joined to its parent case and asserts the case belongs to
   *   `orgId`. Returns `{ linkId, caseId }` so callers can chain visibility
   *   checks via CaseService.
   * - Without this, verify/delete by linkId alone would cross tenant
   *   boundaries — a user in org A could mutate any link in the DB.
   */
  private async assertLinkInOrg(linkId: number, orgId: number) {
    const [row] = await this.db
      .select({
        id: caseRegulationLinks.id,
        caseId: caseRegulationLinks.caseId,
        organizationId: cases.organizationId,
      })
      .from(caseRegulationLinks)
      .innerJoin(cases, eq(cases.id, caseRegulationLinks.caseId))
      .where(eq(caseRegulationLinks.id, linkId))
      .limit(1);
    if (!row) {
      throw new NotFoundError("Link");
    }
    if (row.organizationId !== orgId) {
      throw new ForbiddenError("Cross-organization access denied");
    }
    return { id: row.id, caseId: row.caseId };
  }

  /**
   * verifyLink
   *
   * - Marks a link as verified by a specific user and timestamps the action.
   * - Org-scoped: the link's parent case must belong to `orgId`.
   */
  async verifyLink(linkId: number, userId: string, orgId: number) {
    await this.assertLinkInOrg(linkId, orgId);
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
   * - Org-scoped: the link's parent case must belong to `orgId`.
   */
  async deleteLink(linkId: number, orgId: number) {
    await this.assertLinkInOrg(linkId, orgId);
    await this.db
      .delete(caseRegulationLinks)
      .where(eq(caseRegulationLinks.id, linkId));
  }

  /*
   * findLinkCaseId
   *
   * - Resolves a linkId to its parent caseId within an organization. Used by
   *   route handlers that want to gate verify/delete behind a CaseService
   *   visibility check before committing the mutation.
   */
  async findLinkCaseId(linkId: number, orgId: number): Promise<number> {
    const { caseId } = await this.assertLinkInOrg(linkId, orgId);
    return caseId;
  }
}
