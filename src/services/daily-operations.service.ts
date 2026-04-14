import { and, asc, desc, eq, gt, or } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  caseRegulationLinks,
  cases,
  documents,
  documentReviews,
  regulationVersions,
  userDailyTasks,
} from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";

export class DailyOperationsService {
  constructor(private readonly db: Database) {}

  private async caseHasRegulationChange(
    caseId: number,
    fallbackTime: Date
  ): Promise<boolean> {
    const links = await this.db.query.caseRegulationLinks.findMany({
      where: eq(caseRegulationLinks.caseId, caseId),
      columns: {
        regulationId: true,
        matchedRegulationVersionId: true,
      },
      limit: 30,
    });

    for (const link of links) {
      const latestVersion = await this.db.query.regulationVersions.findFirst({
        where: eq(regulationVersions.regulationId, link.regulationId),
        orderBy: [desc(regulationVersions.versionNumber)],
        columns: {
          id: true,
          versionNumber: true,
          fetchedAt: true,
        },
      });

      if (!latestVersion) continue;

      if (link.matchedRegulationVersionId) {
        const matchedVersion = await this.db.query.regulationVersions.findFirst({
          where: eq(regulationVersions.id, link.matchedRegulationVersionId),
          columns: {
            versionNumber: true,
          },
        });

        if (matchedVersion && latestVersion.versionNumber > matchedVersion.versionNumber) {
          return true;
        }

        continue;
      }

      if (latestVersion.fetchedAt > fallbackTime) {
        return true;
      }
    }

    return false;
  }

  async getDailyOperations(orgId: number, userId: string) {
    const now = new Date();

    const hearings = await this.db.query.cases.findMany({
      where: and(eq(cases.organizationId, orgId), gt(cases.nextHearing, now)),
      orderBy: [asc(cases.nextHearing)],
      limit: 6,
      columns: {
        id: true,
        title: true,
        nextHearing: true,
        courtJurisdiction: true,
      },
    });

    const reviewDocs = await this.db.query.documents.findMany({
      with: {
        case: {
          columns: {
            id: true,
            title: true,
            organizationId: true,
            nextHearing: true,
            status: true,
          },
        },
        uploader: {
          columns: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: [desc(documents.createdAt)],
      limit: 30,
    });

    const filteredReviewDocs = [] as Array<{
      id: number;
      caseId: number;
      caseTitle: string;
      documentName: string;
      uploadedBy: string;
      createdAt: Date;
      reviewStatus: "pending" | "in_review";
      priorityLevel: "critical" | "high" | "normal";
      importanceScore: number;
      reasons: string[];
      hasRegulationChange: boolean;
      hearingSoon: boolean;
    }>;

    for (const doc of reviewDocs) {
      if (!doc.case || doc.case.organizationId !== orgId) continue;

      const review = await this.db.query.documentReviews.findFirst({
        where: and(
          eq(documentReviews.organizationId, orgId),
          eq(documentReviews.documentId, doc.id)
        ),
      });

      if (!review || review.status === "pending" || review.status === "in_review") {
        const hasRegulationChange = await this.caseHasRegulationChange(doc.case.id, doc.createdAt);
        const hearingSoon =
          !!doc.case.nextHearing &&
          doc.case.nextHearing.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000;
        const pendingAgeHours = Math.floor(
          (now.getTime() - doc.createdAt.getTime()) / (1000 * 60 * 60)
        );

        let importanceScore = 0;
        const reasons: string[] = [];

        if (hasRegulationChange) {
          importanceScore += 100;
          reasons.push("regulation_changed");
        }

        if (hearingSoon) {
          importanceScore += 30;
          reasons.push("hearing_soon");
        }

        if (pendingAgeHours >= 48) {
          importanceScore += 20;
          reasons.push("pending_over_48h");
        }

        if (doc.case.status === "pending_hearing" || doc.case.status === "in_progress") {
          importanceScore += 10;
          reasons.push("active_case_status");
        }

        let priorityLevel: "critical" | "high" | "normal" = "normal";
        if (hasRegulationChange) {
          priorityLevel = "critical";
        } else if (hearingSoon || pendingAgeHours >= 48) {
          priorityLevel = "high";
        }

        filteredReviewDocs.push({
          id: doc.id,
          caseId: doc.case.id,
          caseTitle: doc.case.title,
          documentName: doc.originalName,
          uploadedBy: doc.uploader?.fullName || "System",
          createdAt: doc.createdAt,
          reviewStatus:
            review?.status === "in_review"
              ? "in_review"
              : "pending",
          priorityLevel,
          importanceScore,
          reasons,
          hasRegulationChange,
          hearingSoon,
        });
      }
    }

    filteredReviewDocs.sort((a, b) => {
      if (b.importanceScore !== a.importanceScore) {
        return b.importanceScore - a.importanceScore;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const tasks = await this.db.query.userDailyTasks.findMany({
      where: and(eq(userDailyTasks.organizationId, orgId), eq(userDailyTasks.userId, userId)),
      orderBy: [asc(userDailyTasks.position), desc(userDailyTasks.createdAt)],
    });

    const legalPortals = [
      { id: "najiz", nameAr: "ناجز (Najiz)", nameEn: "Najiz Portal", url: "https://najiz.sa", tone: "emerald" },
      { id: "muin", nameAr: "معين (Muin)", nameEn: "Muin System", url: "https://muin.bog.gov.sa", tone: "blue" },
      { id: "moj", nameAr: "وزارة العدل (MOJ)", nameEn: "Ministry of Justice", url: "https://moj.gov.sa", tone: "amber" },
    ];

    return {
      upcomingHearings: hearings,
      documentsForReview: filteredReviewDocs,
      legalPortals,
      dailyTasks: tasks,
    };
  }

  async createTask(orgId: number, userId: string, text: string) {
    const last = await this.db.query.userDailyTasks.findFirst({
      where: and(eq(userDailyTasks.organizationId, orgId), eq(userDailyTasks.userId, userId)),
      orderBy: [desc(userDailyTasks.position)],
    });

    const [task] = await this.db
      .insert(userDailyTasks)
      .values({
        organizationId: orgId,
        userId,
        text,
        completed: false,
        position: (last?.position ?? -1) + 1,
      })
      .returning();

    return task;
  }

  async updateTask(
    orgId: number,
    userId: string,
    taskId: number,
    patch: Partial<{ text: string; completed: boolean; position: number }>
  ) {
    const existing = await this.db.query.userDailyTasks.findFirst({
      where: eq(userDailyTasks.id, taskId),
    });

    if (!existing) throw new NotFoundError("Daily task");
    if (existing.organizationId !== orgId || existing.userId !== userId) {
      throw new ForbiddenError("Access denied to this task");
    }

    const [updated] = await this.db
      .update(userDailyTasks)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(userDailyTasks.id, taskId))
      .returning();

    return updated;
  }

  async deleteTask(orgId: number, userId: string, taskId: number) {
    const existing = await this.db.query.userDailyTasks.findFirst({
      where: eq(userDailyTasks.id, taskId),
    });

    if (!existing) throw new NotFoundError("Daily task");
    if (existing.organizationId !== orgId || existing.userId !== userId) {
      throw new ForbiddenError("Access denied to this task");
    }

    await this.db.delete(userDailyTasks).where(eq(userDailyTasks.id, taskId));
    return { success: true };
  }

  async updateDocumentReview(
    orgId: number,
    userId: string,
    documentId: number,
    status: "pending" | "in_review" | "approved" | "rejected",
    notes?: string
  ) {
    const doc = await this.db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      with: {
        case: {
          columns: {
            organizationId: true,
          },
        },
      },
    });

    if (!doc || !doc.case) throw new NotFoundError("Document");
    if (doc.case.organizationId !== orgId) throw new ForbiddenError("Access denied");

    const existing = await this.db.query.documentReviews.findFirst({
      where: and(
        eq(documentReviews.organizationId, orgId),
        eq(documentReviews.documentId, documentId)
      ),
    });

    if (existing) {
      const [updated] = await this.db
        .update(documentReviews)
        .set({
          status,
          reviewedBy: userId,
          reviewedAt: new Date(),
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(documentReviews.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(documentReviews)
      .values({
        organizationId: orgId,
        documentId,
        status,
        reviewedBy: userId,
        reviewedAt: new Date(),
        notes: notes || null,
      })
      .returning();

    return created;
  }
}
