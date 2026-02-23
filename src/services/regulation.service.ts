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

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulations,
  regulationVersions,
  type NewRegulation,
  type NewRegulationVersion,
} from "../db/schema";
import { NotFoundError, ValidationError } from "../utils/errors";

export interface RegulationDiffBlock {
  type: "equal" | "insert" | "delete";
  leftSegment: string;
  rightSegment: string;
}

export interface RegulationCompareResult {
  regulationId: number;
  fromVersion: number;
  toVersion: number;
  leftText: string;
  rightText: string;
  diffBlocks: RegulationDiffBlock[];
  summary: {
    addedLines: number;
    deletedLines: number;
    changed: boolean;
  };
}

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
        orderBy: [desc(regulations.updatedAt), desc(regulations.createdAt)],
        limit,
        offset,
      }),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(regulations)
        .where(whereClause),
    ]);

    const ids = rows.map((row) => row.id);
    const versionCounts =
      ids.length > 0
        ? await this.db
            .select({
              regulationId: regulationVersions.regulationId,
              versionsCount: sql<number>`count(*)`,
            })
            .from(regulationVersions)
            .where(inArray(regulationVersions.regulationId, ids))
            .groupBy(regulationVersions.regulationId)
        : [];
    const versionsByRegulationId = new Map(
      versionCounts.map((row) => [row.regulationId, Number(row.versionsCount)])
    );
    const rowsWithCounts = rows.map((row) => ({
      ...row,
      versionsCount: versionsByRegulationId.get(row.id) || 0,
    }));

    return {
      regulations: rowsWithCounts,
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

  private buildLineDiffBlocks(leftText: string, rightText: string): RegulationDiffBlock[] {
    const leftLines = leftText.split(/\r?\n/);
    const rightLines = rightText.split(/\r?\n/);

    // Prevent pathological memory usage for very large comparisons.
    const lineProduct = leftLines.length * rightLines.length;
    if (lineProduct > 250_000) {
      return [
        {
          type: "delete",
          leftSegment: leftText,
          rightSegment: "",
        },
        {
          type: "insert",
          leftSegment: "",
          rightSegment: rightText,
        },
      ];
    }

    const lcs: number[][] = Array.from({ length: leftLines.length + 1 }, () =>
      Array<number>(rightLines.length + 1).fill(0)
    );

    for (let i = leftLines.length - 1; i >= 0; i -= 1) {
      for (let j = rightLines.length - 1; j >= 0; j -= 1) {
        if (leftLines[i] === rightLines[j]) {
          lcs[i][j] = lcs[i + 1][j + 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
      }
    }

    const blocks: RegulationDiffBlock[] = [];
    const pushBlock = (block: RegulationDiffBlock) => {
      const previous = blocks[blocks.length - 1];
      if (!previous || previous.type !== block.type) {
        blocks.push(block);
        return;
      }

      previous.leftSegment = previous.leftSegment
        ? `${previous.leftSegment}\n${block.leftSegment}`.trim()
        : block.leftSegment;
      previous.rightSegment = previous.rightSegment
        ? `${previous.rightSegment}\n${block.rightSegment}`.trim()
        : block.rightSegment;
    };

    let i = 0;
    let j = 0;
    while (i < leftLines.length && j < rightLines.length) {
      if (leftLines[i] === rightLines[j]) {
        pushBlock({
          type: "equal",
          leftSegment: leftLines[i],
          rightSegment: rightLines[j],
        });
        i += 1;
        j += 1;
        continue;
      }

      if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        pushBlock({
          type: "delete",
          leftSegment: leftLines[i],
          rightSegment: "",
        });
        i += 1;
      } else {
        pushBlock({
          type: "insert",
          leftSegment: "",
          rightSegment: rightLines[j],
        });
        j += 1;
      }
    }

    while (i < leftLines.length) {
      pushBlock({
        type: "delete",
        leftSegment: leftLines[i],
        rightSegment: "",
      });
      i += 1;
    }

    while (j < rightLines.length) {
      pushBlock({
        type: "insert",
        leftSegment: "",
        rightSegment: rightLines[j],
      });
      j += 1;
    }

    return blocks;
  }

  async compareRegulationVersions(
    regulationId: number,
    fromVersion: number,
    toVersion: number
  ): Promise<RegulationCompareResult> {
    if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion)) {
      throw new ValidationError("Invalid version numbers");
    }
    if (fromVersion <= 0 || toVersion <= 0) {
      throw new ValidationError("Version numbers must be positive integers");
    }
    if (fromVersion === toVersion) {
      throw new ValidationError("Please provide two different versions");
    }

    await this.getRegulationById(regulationId);

    const [leftVersion, rightVersion] = await Promise.all([
      this.db.query.regulationVersions.findFirst({
        where: and(
          eq(regulationVersions.regulationId, regulationId),
          eq(regulationVersions.versionNumber, fromVersion)
        ),
      }),
      this.db.query.regulationVersions.findFirst({
        where: and(
          eq(regulationVersions.regulationId, regulationId),
          eq(regulationVersions.versionNumber, toVersion)
        ),
      }),
    ]);

    if (!leftVersion || !rightVersion) {
      throw new NotFoundError("Regulation version");
    }

    const leftText = leftVersion.content || "";
    const rightText = rightVersion.content || "";
    const diffBlocks = this.buildLineDiffBlocks(leftText, rightText);
    const addedLines = diffBlocks
      .filter((block) => block.type === "insert")
      .reduce((sum, block) => sum + (block.rightSegment ? block.rightSegment.split("\n").length : 0), 0);
    const deletedLines = diffBlocks
      .filter((block) => block.type === "delete")
      .reduce((sum, block) => sum + (block.leftSegment ? block.leftSegment.split("\n").length : 0), 0);

    return {
      regulationId,
      fromVersion,
      toVersion,
      leftText,
      rightText,
      diffBlocks,
      summary: {
        addedLines,
        deletedLines,
        changed: addedLines > 0 || deletedLines > 0,
      },
    };
  }
}
