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

import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/connection";
import { cases, type Case, type NewCase } from "../db/schema";
import { ForbiddenError, NotFoundError } from "../utils/errors";
import { PermissionService } from "./permission.service";

export interface OrgPrivacy {
  documents: boolean;
  clients: boolean;
  teamDirectory: boolean;
  adminClosureRequired: boolean;
  restrictCaseVisibility: boolean;
}

export interface CaseAccessContext {
  userId: string;
  effectivePermissions: Set<string>;
  orgPrivacy: OrgPrivacy;
}

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
  /*
   * orgRestrictsVisibility
   *
   * - Sync read from the access context's prefetched orgPrivacy.
   * - Returns true when the org has opted into per-assignee scoping AND the
   *   caller lacks the `cases.viewAll` bypass permission.
   */
  private orgRestrictsVisibility(access?: CaseAccessContext): boolean {
    if (!access) return false;
    if (
      PermissionService.can(access.effectivePermissions, "delegated.cases.viewAll")
    ) {
      return false;
    }
    return access.orgPrivacy.restrictCaseVisibility;
  }

  async getCaseById(
    id: number,
    orgId: number,
    scopedClientId?: number | null,
    access?: CaseAccessContext
  ): Promise<Case> {
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

    if (
      typeof scopedClientId === "number" &&
      case_.clientId !== scopedClientId
    ) {
      throw new ForbiddenError("Access denied to this case");
    }

    // Per-assignee visibility scoping
    if (this.orgRestrictsVisibility(access)) {
      if (case_.assignedLawyerId !== access!.userId) {
        throw new ForbiddenError("Access denied to this case");
      }
    }

    return case_;
  }

  async getCasesByOrganization(
    orgId: number,
    filters?: {
      status?: string;
      caseType?: string;
      assignedLawyerId?: string;
    },
    scopedClientId?: number | null,
    access?: CaseAccessContext
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
    if (typeof scopedClientId === "number") {
      conditions.push(eq(cases.clientId, scopedClientId));
    }

    if (this.orgRestrictsVisibility(access)) {
      conditions.push(eq(cases.assignedLawyerId, access!.userId));
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
  async updateCase(
    id: number,
    orgId: number,
    data: Partial<NewCase>,
    scopedClientId?: number | null,
    access?: CaseAccessContext
  ) {
    // Verify ownership (and visibility scoping if applicable)
    await this.getCaseById(id, orgId, scopedClientId, access);

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
  async deleteCase(
    id: number,
    orgId: number,
    scopedClientId?: number | null,
    access?: CaseAccessContext
  ) {
    // Verify ownership (and visibility scoping if applicable)
    await this.getCaseById(id, orgId, scopedClientId, access);

    await this.db.delete(cases).where(eq(cases.id, id));

    return { success: true };
  }

  /*
   * assignCase
   *
   * - Reassigns the case's `assignedLawyerId` (or clears it when null).
   * - The handler is responsible for the higher-level authorization
   *   (admin/senior or self-unassign); this method only validates the
   *   target lawyer belongs to the same organization.
   */
  async assignCase(
    id: number,
    orgId: number,
    assignedLawyerId: string | null,
    access?: CaseAccessContext
  ) {
    // Reuse getCaseById's visibility/org checks
    await this.getCaseById(id, orgId, null, access);

    const [updated] = await this.db
      .update(cases)
      .set({ assignedLawyerId, updatedAt: new Date() })
      .where(eq(cases.id, id))
      .returning();

    return updated;
  }

  /*
   * bulkAssignCases
   *
   * - Reassigns multiple cases in one go. Validates every id is in the caller's
   *   org and visible under their access context BEFORE doing any writes — if
   *   any id is missing or hidden, throws and nothing is mutated.
   * - Returns the updated rows.
   */
  async bulkAssignCases(
    ids: number[],
    orgId: number,
    assignedLawyerId: string | null,
    access?: CaseAccessContext
  ) {
    if (ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids)).slice(0, 200);

    const rows = await this.db
      .select({
        id: cases.id,
        assignedLawyerId: cases.assignedLawyerId,
      })
      .from(cases)
      .where(and(eq(cases.organizationId, orgId), inArray(cases.id, uniqueIds)));

    if (rows.length !== uniqueIds.length) {
      throw new NotFoundError("Case");
    }

    if (this.orgRestrictsVisibility(access)) {
      if (rows.some((r) => r.assignedLawyerId !== access!.userId)) {
        throw new ForbiddenError("One or more cases are not visible");
      }
    }

    const updated = await this.db
      .update(cases)
      .set({ assignedLawyerId, updatedAt: new Date() })
      .where(and(eq(cases.organizationId, orgId), inArray(cases.id, uniqueIds)))
      .returning();

    return updated;
  }
}
