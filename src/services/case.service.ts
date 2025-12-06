/*
 * CaseService
 *
 * - Encapsulates all case-related data access and business logic.
 * - Uses the Drizzle `Database` instance and `cases` schema to create, read, update,
 *   and delete legal case records.
 * - Enforces organization-level access control so users can only interact with cases
 *   that belong to their organization.
 * - Throws typed `AppError` subclasses (`NotFoundError`, `ForbiddenError`) so that
 *   the global error handler can convert them into consistent HTTP responses.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { cases, type Case, type NewCase } from "../db/schema";
import { ForbiddenError, NotFoundError } from "../utils/errors";

export class CaseService {
  constructor(private db: Database) {}

  /*
   * createCase
   *
   * - Inserts a new case row into the `cases` table.
   * - Automatically sets `assignedLawyerId` to the currently authenticated user's id.
   * - Returns the newly created case record.
   */
  async createCase(data: NewCase, userId: string) {
    const [newCase] = await this.db
      .insert(cases)
      .values({
        ...data,
        assignedLawyerId: userId,
      })
      .returning();

    return newCase;
  }

  /*
   * getCaseById
   *
   * - Fetches a single case by its primary key `id`.
   * - Loads the related `assignedLawyer` user for convenience.
   * - Throws `NotFoundError` if the case does not exist.
   * - Throws `ForbiddenError` if the case belongs to a different organization
   *   than the one provided via `orgId`.
   */
  async getCaseById(id: number, orgId: number): Promise<Case> {
    const case_ = await this.db.query.cases.findFirst({
      where: eq(cases.id, id),
      with: {
        assignedLawyer: true,
      },
    });

    if (!case_) {
      throw new NotFoundError("Case");
    }

    // Check organization access
    if (case_.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this case");
    }

    return case_;
  }

  async getCasesByOrganization(
    orgId: number,
    filters?: {
      status?: string;
      caseType?: string;
      assignedLawyerId?: string;
    }
  ) {
    const conditions = [eq(cases.organizationId, orgId)];

    // Apply optional filters for status, case type, and assigned lawyer
    if (filters?.status) {
      conditions.push(eq(cases.status, filters.status as any));
    }
    if (filters?.caseType) {
      conditions.push(eq(cases.caseType, filters.caseType as any));
    }
    if (filters?.assignedLawyerId) {
      conditions.push(eq(cases.assignedLawyerId, filters.assignedLawyerId));
    }

    // Always scope by organization and sort newest cases first
    return this.db.query.cases.findMany({
      where: and(...conditions),
      orderBy: [desc(cases.createdAt)],
      with: {
        assignedLawyer: {
          columns: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  /*
   * updateCase
   *
   * - Verifies that the case exists and belongs to the given organization.
   * - Applies the provided partial update and refreshes the `updatedAt` timestamp.
   * - Returns the updated case record.
   */
  async updateCase(id: number, orgId: number, data: Partial<NewCase>) {
    // Verify ownership
    await this.getCaseById(id, orgId);

    const [updated] = await this.db
      .update(cases)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(cases.id, id))
      .returning();

    return updated;
  }

  /*
   * deleteCase
   *
   * - Verifies that the case exists and belongs to the given organization.
   * - Deletes the case row from the database.
   * - Returns a simple `{ success: true }` payload for convenience.
   */
  async deleteCase(id: number, orgId: number) {
    // Verify ownership
    await this.getCaseById(id, orgId);

    await this.db.delete(cases).where(eq(cases.id, id));

    return { success: true };
  }
}
