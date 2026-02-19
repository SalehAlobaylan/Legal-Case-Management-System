/*
 * RegulationService
 *
 * - Encapsulates all data access and business logic for regulations and their versions.
 * - Uses the Drizzle `Database` instance and `regulations` / `regulationVersions` schemas
 *   to create, read, update, and list regulation records.
 * - Provides simple filter support for category and status, and exposes helpers to
 *   manage version history for each regulation.
 * - Throws `NotFoundError` when a requested regulation does not exist so that the
 *   global error handler can map it to a consistent HTTP 404 response.
 */

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulations,
  regulationVersions,
  type NewRegulation,
  type NewRegulationVersion,
} from "../db/schema";
import { NotFoundError } from "../utils/errors";

export class RegulationService {
  constructor(private db: Database) {}

  /*
   * createRegulation
   *
   * - Inserts a new regulation row into the `regulations` table.
   * - Returns the newly created regulation record.
   */
  async createRegulation(data: NewRegulation) {
    const [regulation] = await this.db
      .insert(regulations)
      .values(data)
      .returning();
    return regulation;
  }

  /*
   * getRegulationById
   *
   * - Retrieves a single regulation by its primary key `id`.
   * - Throws `NotFoundError` if the regulation does not exist.
   */
  async getRegulationById(id: number) {
    const regulation = await this.db.query.regulations.findFirst({
      where: eq(regulations.id, id),
    });

    if (!regulation) {
      throw new NotFoundError("Regulation");
    }

    return regulation;
  }

  /*
   * getAllRegulations
   *
   * - Returns all regulations, optionally filtered by `category` and/or `status`.
   * - Always orders results by `createdAt` descending so newest items appear first.
   */
  async getAllRegulations(filters?: {
    category?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const conditions: SQL<unknown>[] = [];

    if (filters?.category) {
      conditions.push(eq(regulations.category, filters.category as any));
    }
    if (filters?.status) {
      conditions.push(eq(regulations.status, filters.status as any));
    }
    if (filters?.search) {
      conditions.push(
        or(
          ilike(regulations.title, `%${filters.search}%`),
          ilike(regulations.regulationNumber, `%${filters.search}%`)
        )!
      );
    }

    const page = Math.max(1, Number(filters?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(filters?.limit || 10)));
    const offset = (page - 1) * limit;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      this.db.query.regulations.findMany({
        where: whereClause,
        orderBy: [desc(regulations.createdAt)],
        limit,
        offset,
      }),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(regulations)
        .where(whereClause),
    ]);

    return {
      regulations: rows,
      total: Number(totalRows[0]?.count ?? 0),
      page,
      limit,
    };
  }

  /*
   * updateRegulation
   *
   * - Verifies that the regulation exists.
   * - Applies the provided partial update and refreshes the `updatedAt` timestamp.
   * - Returns the updated regulation record.
   */
  async updateRegulation(id: number, data: Partial<NewRegulation>) {
    await this.getRegulationById(id);

    const [updated] = await this.db
      .update(regulations)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(regulations.id, id))
      .returning();

    return updated;
  }

  /*
   * createVersion
   *
   * - Inserts a new row into the `regulationVersions` table.
   * - Intended to be called when a regulation's text or metadata changes.
   * - Returns the newly created version record.
   */
  async createVersion(data: NewRegulationVersion) {
    const [version] = await this.db
      .insert(regulationVersions)
      .values(data)
      .returning();
    return version;
  }

  /*
   * getVersionsByRegulationId
   *
   * - Returns all versions belonging to a given regulation.
   * - Orders versions by `versionNumber` descending so the latest version appears first.
   */
  async getVersionsByRegulationId(regulationId: number) {
    return this.db.query.regulationVersions.findMany({
      where: eq(regulationVersions.regulationId, regulationId),
      orderBy: [desc(regulationVersions.versionNumber)],
    });
  }
}
