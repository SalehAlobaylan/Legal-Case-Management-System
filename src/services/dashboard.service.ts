/*
 * Dashboard Service
 *
 * - Provides aggregated statistics for the dashboard view.
 * - All queries are scoped to the user's organization.
 */

import { eq, sql, and, gte } from "drizzle-orm";
import type { Database } from "../db/connection";
import { cases, caseRegulationLinks } from "../db/schema";

export interface DashboardStats {
  totalCases: number;
  openCases: number;
  inProgressCases: number;
  pendingHearingCases: number;
  closedCases: number;
  archivedCases: number;
  recentAiSuggestions: number;
  upcomingHearings: Array<{
    id: number;
    caseNumber: string;
    title: string;
    nextHearing: Date;
  }>;
}

export class DashboardService {
  constructor(private db: Database) {}

  /**
   * getStats
   *
   * - Returns aggregated case statistics for the given organization.
   * - Includes counts by status, recent AI suggestions, and upcoming hearings.
   */
  async getStats(orgId: number): Promise<DashboardStats> {
    // Get all cases for the organization
    const allCases = await this.db.query.cases.findMany({
      where: eq(cases.organizationId, orgId),
      columns: {
        id: true,
        status: true,
        caseNumber: true,
        title: true,
        nextHearing: true,
      },
    });

    // Count by status
    const statusCounts = {
      totalCases: allCases.length,
      openCases: 0,
      inProgressCases: 0,
      pendingHearingCases: 0,
      closedCases: 0,
      archivedCases: 0,
    };

    for (const c of allCases) {
      switch (c.status) {
        case "open":
          statusCounts.openCases++;
          break;
        case "in_progress":
          statusCounts.inProgressCases++;
          break;
        case "pending_hearing":
          statusCounts.pendingHearingCases++;
          break;
        case "closed":
          statusCounts.closedCases++;
          break;
        case "archived":
          statusCounts.archivedCases++;
          break;
      }
    }

    // Get recent AI suggestions (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentLinks = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(caseRegulationLinks)
      .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
      .where(
        and(
          eq(cases.organizationId, orgId),
          gte(caseRegulationLinks.createdAt, sevenDaysAgo)
        )
      );

    const recentAiSuggestions = Number(recentLinks[0]?.count ?? 0);

    // Get upcoming hearings (next 30 days)
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const upcomingHearings = allCases
      .filter((c) => c.nextHearing && c.nextHearing > now && c.nextHearing <= thirtyDaysFromNow)
      .sort((a, b) => (a.nextHearing!.getTime() - b.nextHearing!.getTime()))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        title: c.title,
        nextHearing: c.nextHearing!,
      }));

    return {
      ...statusCounts,
      recentAiSuggestions,
      upcomingHearings,
    };
  }
}
