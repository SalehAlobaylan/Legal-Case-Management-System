/*
 * Admin routes plugin
 *
 * - Mounted at `/api/admin` (see app.ts).
 * - Provides admin-only oversight data: aggregated stats, per-lawyer workload,
 *   and recent team activity for the dashboard at /admin/dashboard.
 * - All routes require JWT auth AND the `admin` role.
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/connection";
import { cases, CLOSED_STATUSES } from "../../db/schema/cases";
import { users } from "../../db/schema/users";
import { userActivities } from "../../db/schema/user-activities";
import { caseRegulationLinks } from "../../db/schema/case-regulation-links";
import { regulationVersions } from "../../db/schema/regulation-versions";
import { regulations } from "../../db/schema/regulations";
import { regulationMonitorRuns } from "../../db/schema/regulation-monitor-runs";
import { adminDashboardSettings } from "../../db/schema/admin-dashboard-settings";
import { CaseService } from "../../services/case.service";
import {
  AuditLogService,
  auditActions,
  type AuditAction,
} from "../../services/audit-log.service";
import { AIClientService } from "../../services/ai-client.service";
import { RegulationMonitorService } from "../../services/regulation-monitor.service";
import { requireAdmin } from "../../lib/require-admin";
import { registerAiIntelligenceRoutes } from "./ai-intelligence";

/*
 * bucketHearing
 *
 * - Buckets a case's `nextHearing` into one of four ranges using the *server's*
 *   day boundaries. The client renders without re-doing date math.
 */
type HearingBucket = "overdue" | "thisWeek" | "nextWeek" | "later";

function bucketHearing(nextHearing: Date, now: Date): HearingBucket {
  // Normalize "today" to start-of-day to avoid off-by-hour issues
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // End of THIS calendar week (Sunday = 0..Saturday = 6). We treat the week as
  // ending on the upcoming Sunday for predictable behavior across locales.
  const daysToEndOfThisWeek = 7 - today.getDay(); // includes today + remaining days
  const endOfThisWeek = new Date(today);
  endOfThisWeek.setDate(today.getDate() + daysToEndOfThisWeek);
  endOfThisWeek.setHours(23, 59, 59, 999);

  const endOfNextWeek = new Date(endOfThisWeek);
  endOfNextWeek.setDate(endOfThisWeek.getDate() + 7);

  if (nextHearing < today) return "overdue";
  if (nextHearing <= endOfThisWeek) return "thisWeek";
  if (nextHearing <= endOfNextWeek) return "nextWeek";
  return "later";
}

function daysUntil(d: Date, now: Date): number {
  const a = new Date(d);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

const dashboardSettingsSchema = z.object({
  staleCaseDays: z.number().int().min(1).max(365),
  hearingSoonDays: z.number().int().min(1).max(90),
  workloadHighOpenCases: z.number().int().min(1).max(500),
  aiReviewHighCount: z.number().int().min(1).max(1000),
  monitorStaleMinutes: z.number().int().min(5).max(43_200),
});

type DashboardSettingsInput = z.infer<typeof dashboardSettingsSchema>;

async function getOrCreateDashboardSettings(organizationId: number) {
  const [existing] = await db
    .select()
    .from(adminDashboardSettings)
    .where(eq(adminDashboardSettings.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(adminDashboardSettings)
    .values({ organizationId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(adminDashboardSettings)
    .where(eq(adminDashboardSettings.organizationId, organizationId))
    .limit(1);
  if (!row) {
    throw new Error("Failed to initialize admin dashboard settings");
  }
  return row;
}

function serializeDashboardSettings(settings: {
  organizationId: number;
  staleCaseDays: number;
  hearingSoonDays: number;
  workloadHighOpenCases: number;
  aiReviewHighCount: number;
  monitorStaleMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    organizationId: settings.organizationId,
    staleCaseDays: settings.staleCaseDays,
    hearingSoonDays: settings.hearingSoonDays,
    workloadHighOpenCases: settings.workloadHighOpenCases,
    aiReviewHighCount: settings.aiReviewHighCount,
    monitorStaleMinutes: settings.monitorStaleMinutes,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

async function getAIHealthSummary() {
  try {
    const raw = await new AIClientService().getEmbeddingsHealth();
    return {
      ready: !raw.warming_up,
      warmingUp: Boolean(raw.warming_up),
      fallbackActive: Boolean(raw.fallback_active),
      message: raw.warming_up
        ? "AI assistant is warming up."
        : raw.fallback_active
          ? "AI assistant is using the backup service."
          : null,
    };
  } catch {
    return {
      ready: false,
      warmingUp: false,
      fallbackActive: false,
      message: "AI assistant status unavailable.",
    };
  }
}

type RequestWithUser = FastifyRequest & {
  user: { id: string; email: string; role: string; orgId: number };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
};

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  app.addHook("onRequest", app.authenticate);

  fastify.get(
    "/dashboard-settings",
    {
      schema: {
        description: "Admin dashboard threshold settings",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;
      const settings = await getOrCreateDashboardSettings(user.orgId);
      return reply.send({ settings: serializeDashboardSettings(settings) });
    }
  );

  fastify.put(
    "/dashboard-settings",
    {
      schema: {
        description: "Update admin dashboard threshold settings",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user, body } = request as RequestWithUser & { body: unknown };
      if (!requireAdmin(request, reply)) return;
      const data = dashboardSettingsSchema.parse(body) satisfies DashboardSettingsInput;

      const auditService = new AuditLogService(db, request.log);
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(adminDashboardSettings)
          .values({
            organizationId: user.orgId,
            ...data,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: adminDashboardSettings.organizationId,
            set: {
              ...data,
              updatedAt: new Date(),
            },
          })
          .returning();
        await auditService.logTx(tx, {
          organizationId: user.orgId,
          actorUserId: user.id,
          action: "admin.dashboard_settings.update",
          targetType: "admin_dashboard_settings",
          targetId: user.orgId,
          payload: data,
        });
        return row;
      });

      return reply.send({ settings: serializeDashboardSettings(updated) });
    }
  );

  fastify.get(
    "/command-center",
    {
      schema: {
        description: "Admin executive command center bundled payload",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;

      const settings = await getOrCreateDashboardSettings(user.orgId);
      const staleSince = new Date(
        Date.now() - settings.staleCaseDays * 86_400_000
      );
      const recentRegSince = new Date(Date.now() - 7 * 86_400_000);

      const regUpdatesWhere = and(
        eq(cases.organizationId, user.orgId),
        notInArray(cases.status, CLOSED_STATUSES),
        gt(regulationVersions.fetchedAt, recentRegSince)
      );

      const [
        [aggregate],
        workload,
        unassignedCases,
        recentActivity,
        hearingRows,
        staleCases,
        [staleCountRow],
        awaitingReview,
        regUpdates,
        [regUpdatesCountRow],
        monitorRuns,
        monitorHealth,
        aiHealth,
      ] = await Promise.all([
        db
          .select({
            total: count(),
            open: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'open')`,
            inProgress: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'in_progress')`,
            pendingHearing: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'pending_hearing')`,
            closed: sql<number>`COUNT(*) FILTER (WHERE ${inArray(cases.status, CLOSED_STATUSES)})`,
            unassigned: sql<number>`COUNT(*) FILTER (WHERE ${cases.assignedLawyerId} IS NULL)`,
          })
          .from(cases)
          .where(eq(cases.organizationId, user.orgId)),
        db
          .select({
            lawyerId: users.id,
            fullName: users.fullName,
            email: users.email,
            role: users.role,
            totalCases: count(cases.id),
            openCases: sql<number>`COUNT(${cases.id}) FILTER (WHERE ${notInArray(cases.status, CLOSED_STATUSES)})`,
          })
          .from(users)
          .leftJoin(
            cases,
            and(
              eq(cases.assignedLawyerId, users.id),
              eq(cases.organizationId, user.orgId)
            )
          )
          .where(eq(users.organizationId, user.orgId))
          .groupBy(users.id, users.fullName, users.email, users.role)
          .orderBy(desc(sql<number>`COUNT(${cases.id})`)),
        db.query.cases.findMany({
          where: and(
            eq(cases.organizationId, user.orgId),
            isNull(cases.assignedLawyerId)
          ),
          orderBy: [desc(cases.createdAt)],
          limit: 25,
        }),
        db
          .select({
            id: userActivities.id,
            userId: userActivities.userId,
            userName: users.fullName,
            type: userActivities.type,
            action: userActivities.action,
            title: userActivities.title,
            referenceId: userActivities.referenceId,
            createdAt: userActivities.createdAt,
          })
          .from(userActivities)
          .innerJoin(users, eq(userActivities.userId, users.id))
          .where(eq(users.organizationId, user.orgId))
          .orderBy(desc(userActivities.createdAt))
          .limit(20),
        db.query.cases.findMany({
          where: and(
            eq(cases.organizationId, user.orgId),
            isNotNull(cases.nextHearing),
            notInArray(cases.status, CLOSED_STATUSES)
          ),
          with: {
            assignedLawyer: { columns: { id: true, fullName: true, email: true } },
          },
          orderBy: [asc(cases.nextHearing)],
          limit: 500,
        }),
        db.query.cases.findMany({
          where: and(
            eq(cases.organizationId, user.orgId),
            notInArray(cases.status, CLOSED_STATUSES),
            lt(cases.updatedAt, staleSince)
          ),
          orderBy: [asc(cases.updatedAt)],
          with: {
            assignedLawyer: { columns: { id: true, fullName: true, email: true } },
          },
          limit: 10,
        }),
        db
          .select({ c: count() })
          .from(cases)
          .where(
            and(
              eq(cases.organizationId, user.orgId),
              notInArray(cases.status, CLOSED_STATUSES),
              lt(cases.updatedAt, staleSince)
            )
          ),
        db
          .select({
            caseId: cases.id,
            caseNumber: cases.caseNumber,
            title: cases.title,
            unreviewed: count(caseRegulationLinks.id),
          })
          .from(caseRegulationLinks)
          .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
          .where(
            and(
              eq(cases.organizationId, user.orgId),
              eq(caseRegulationLinks.verified, false)
            )
          )
          .groupBy(cases.id, cases.caseNumber, cases.title)
          .orderBy(desc(count(caseRegulationLinks.id)))
          .limit(10),
        db
          .select({
            caseId: cases.id,
            caseNumber: cases.caseNumber,
            title: cases.title,
            regulationId: regulations.id,
            regulationTitle: regulations.title,
            fetchedAt: regulationVersions.fetchedAt,
          })
          .from(regulationVersions)
          .innerJoin(
            caseRegulationLinks,
            eq(caseRegulationLinks.regulationId, regulationVersions.regulationId)
          )
          .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
          .innerJoin(regulations, eq(regulations.id, regulationVersions.regulationId))
          .where(regUpdatesWhere)
          .orderBy(desc(regulationVersions.fetchedAt))
          .limit(10),
        db
          .select({ c: count() })
          .from(regulationVersions)
          .innerJoin(
            caseRegulationLinks,
            eq(caseRegulationLinks.regulationId, regulationVersions.regulationId)
          )
          .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
          .where(regUpdatesWhere),
        db
          .select()
          .from(regulationMonitorRuns)
          .orderBy(desc(regulationMonitorRuns.startedAt))
          .limit(8),
        new RegulationMonitorService(db).getHealthSummary(),
        getAIHealthSummary(),
      ]);

      const now = new Date();
      const hearings: Record<HearingBucket, Array<{
        id: number;
        caseNumber: string;
        title: string;
        status: string;
        caseType: string;
        nextHearing: Date | null;
        daysUntil: number;
        assignedLawyerId: string | null;
        assignedLawyer: { id: string; fullName: string | null; email: string } | null;
      }>> = { overdue: [], thisWeek: [], nextWeek: [], later: [] };

      for (const c of hearingRows) {
        if (!c.nextHearing) continue;
        const b = bucketHearing(c.nextHearing as unknown as Date, now);
        hearings[b].push({
          id: c.id,
          caseNumber: c.caseNumber,
          title: c.title,
          status: c.status,
          caseType: c.caseType,
          nextHearing: c.nextHearing as unknown as Date,
          daysUntil: daysUntil(c.nextHearing as unknown as Date, now),
          assignedLawyerId: c.assignedLawyerId,
          assignedLawyer: c.assignedLawyer ?? null,
        });
      }

      const totalAwaiting = awaitingReview.reduce(
        (sum, r) => sum + Number(r.unreviewed ?? 0),
        0
      );

      const topActions = [
        ...hearings.overdue.slice(0, 3).map((h) => ({
          id: `hearing-${h.id}`,
          type: "overdue_hearing",
          severity: "critical",
          title: `${h.caseNumber} — ${h.title}`,
          subtitle: `${Math.abs(h.daysUntil)} days overdue`,
          href: `/cases/${h.id}`,
        })),
        ...unassignedCases.slice(0, 3).map((c) => ({
          id: `unassigned-${c.id}`,
          type: "unassigned_case",
          severity: "warning",
          title: `${c.caseNumber} — ${c.title}`,
          subtitle: "Unassigned case",
          href: `/cases/${c.id}`,
        })),
        ...awaitingReview.slice(0, 3).map((r) => ({
          id: `ai-${r.caseId}`,
          type: "ai_review",
          severity:
            Number(r.unreviewed ?? 0) >= settings.aiReviewHighCount
              ? "warning"
              : "info",
          title: `${r.caseNumber} — ${r.title}`,
          subtitle: `${Number(r.unreviewed ?? 0)} AI links awaiting review`,
          href: `/cases/${r.caseId}/linking`,
        })),
      ].slice(0, 8);

      return reply.send({
        settings: serializeDashboardSettings(settings),
        caseCounts: {
          total: Number(aggregate?.total ?? 0),
          open: Number(aggregate?.open ?? 0),
          inProgress: Number(aggregate?.inProgress ?? 0),
          pendingHearing: Number(aggregate?.pendingHearing ?? 0),
          closed: Number(aggregate?.closed ?? 0),
          unassigned: Number(aggregate?.unassigned ?? 0),
        },
        workload: workload.map((row) => ({
          lawyerId: row.lawyerId,
          fullName: row.fullName,
          email: row.email,
          role: row.role,
          totalCases: Number(row.totalCases ?? 0),
          openCases: Number(row.openCases ?? 0),
          highWorkload:
            Number(row.openCases ?? 0) >= settings.workloadHighOpenCases,
        })),
        unassignedCases,
        recentActivity,
        lawyerCount: workload.length,
        hearings: {
          ...hearings,
          counts: {
            overdue: hearings.overdue.length,
            thisWeek: hearings.thisWeek.length,
            nextWeek: hearings.nextWeek.length,
            later: hearings.later.length,
          },
        },
        risk: {
          stale: {
            count: Number(staleCountRow?.c ?? 0),
            items: staleCases.map((c) => ({
              id: c.id,
              caseNumber: c.caseNumber,
              title: c.title,
              updatedAt: c.updatedAt,
              assignedLawyer: c.assignedLawyer ?? null,
            })),
          },
          awaitingReview: {
            count: totalAwaiting,
            items: awaitingReview.map((r) => ({
              caseId: r.caseId,
              caseNumber: r.caseNumber,
              title: r.title,
              unreviewed: Number(r.unreviewed ?? 0),
            })),
          },
          regulationUpdates: {
            count: Number(regUpdatesCountRow?.c ?? 0),
            items: regUpdates,
          },
          topActions,
        },
        aiHealth,
        monitor: {
          health: monitorHealth,
          runs: monitorRuns,
          failedRuns24h: monitorHealth.failedRuns24h,
          stale:
            monitorHealth.minutesSinceLastRun !== null &&
            monitorHealth.minutesSinceLastRun > settings.monitorStaleMinutes,
        },
      });
    }
  );

  /**
   * GET /api/admin/stats
   *
   * - Returns aggregated case counts, per-lawyer workload, lawyer count, and
   *   recent activity for the admin's organization.
   */
  fastify.get(
    "/stats",
    {
      schema: {
        description: "Admin dashboard aggregated stats",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;

      if (!requireAdmin(request, reply)) return;

      const [
        [aggregate],
        workload,
        unassignedCases,
        recentActivity,
        hearingRows,
      ] = await Promise.all([
        db
          .select({
            total: count(),
            open: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'open')`,
            inProgress: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'in_progress')`,
            pendingHearing: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'pending_hearing')`,
            closed: sql<number>`COUNT(*) FILTER (WHERE ${inArray(cases.status, CLOSED_STATUSES)})`,
            unassigned: sql<number>`COUNT(*) FILTER (WHERE ${cases.assignedLawyerId} IS NULL)`,
          })
          .from(cases)
          .where(eq(cases.organizationId, user.orgId)),
        db
          .select({
            lawyerId: users.id,
            fullName: users.fullName,
            email: users.email,
            role: users.role,
            totalCases: count(cases.id),
            openCases: sql<number>`COUNT(${cases.id}) FILTER (WHERE ${notInArray(cases.status, CLOSED_STATUSES)})`,
          })
          .from(users)
          .leftJoin(
            cases,
            and(
              eq(cases.assignedLawyerId, users.id),
              eq(cases.organizationId, user.orgId)
            )
          )
          .where(eq(users.organizationId, user.orgId))
          .groupBy(users.id, users.fullName, users.email, users.role)
          .orderBy(desc(sql<number>`COUNT(${cases.id})`)),
        db.query.cases.findMany({
          where: and(
            eq(cases.organizationId, user.orgId),
            isNull(cases.assignedLawyerId)
          ),
          orderBy: [desc(cases.createdAt)],
          limit: 25,
        }),
        db
          .select({
            id: userActivities.id,
            userId: userActivities.userId,
            userName: users.fullName,
            type: userActivities.type,
            action: userActivities.action,
            title: userActivities.title,
            referenceId: userActivities.referenceId,
            createdAt: userActivities.createdAt,
          })
          .from(userActivities)
          .innerJoin(users, eq(userActivities.userId, users.id))
          .where(eq(users.organizationId, user.orgId))
          .orderBy(desc(userActivities.createdAt))
          .limit(20),
        db.query.cases.findMany({
          where: and(
            eq(cases.organizationId, user.orgId),
            isNotNull(cases.nextHearing),
            notInArray(cases.status, CLOSED_STATUSES)
          ),
          with: {
            assignedLawyer: { columns: { id: true, fullName: true, email: true } },
          },
          orderBy: [asc(cases.nextHearing)],
          limit: 500,
        }),
      ]);

      // workload includes every user in the org (admins/clerks too); count is
      // intentionally "people with any case assignment capacity", not "lawyers".
      const lawyerCount = workload.length;

      const now = new Date();
      const hearings: Record<HearingBucket, Array<{
        id: number;
        caseNumber: string;
        title: string;
        status: string;
        caseType: string;
        nextHearing: Date | null;
        daysUntil: number;
        assignedLawyerId: string | null;
        assignedLawyer: { id: string; fullName: string | null; email: string } | null;
      }>> = { overdue: [], thisWeek: [], nextWeek: [], later: [] };

      for (const c of hearingRows) {
        if (!c.nextHearing) continue;
        const b = bucketHearing(c.nextHearing as unknown as Date, now);
        hearings[b].push({
          id: c.id,
          caseNumber: c.caseNumber,
          title: c.title,
          status: c.status,
          caseType: c.caseType,
          nextHearing: c.nextHearing as unknown as Date,
          daysUntil: daysUntil(c.nextHearing as unknown as Date, now),
          assignedLawyerId: c.assignedLawyerId,
          assignedLawyer: c.assignedLawyer ?? null,
        });
      }

      return reply.send({
        caseCounts: {
          total: Number(aggregate?.total ?? 0),
          open: Number(aggregate?.open ?? 0),
          inProgress: Number(aggregate?.inProgress ?? 0),
          pendingHearing: Number(aggregate?.pendingHearing ?? 0),
          closed: Number(aggregate?.closed ?? 0),
          unassigned: Number(aggregate?.unassigned ?? 0),
        },
        workload: workload.map((row) => ({
          lawyerId: row.lawyerId,
          fullName: row.fullName,
          email: row.email,
          role: row.role,
          totalCases: Number(row.totalCases ?? 0),
          openCases: Number(row.openCases ?? 0),
        })),
        unassignedCases,
        recentActivity,
        lawyerCount,
        hearings: {
          ...hearings,
          counts: {
            overdue: hearings.overdue.length,
            thisWeek: hearings.thisWeek.length,
            nextWeek: hearings.nextWeek.length,
            later: hearings.later.length,
          },
        },
      });
    }
  );

  /**
   * GET /api/admin/lawyers/:id
   *
   * - Bundled drill-down payload for the admin lawyer detail page.
   * - Returns the lawyer's profile, per-status case counts, the full case list
   *   assigned to them, and their recent activity.
   */
  fastify.get(
    "/lawyers/:id",
    {
      schema: {
        description: "Admin lawyer drill-down detail",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };

      if (!requireAdmin(request, reply)) return;
      if (!z.string().uuid().safeParse(id).success) {
        return reply.status(400).send({ message: "Invalid lawyer id" });
      }

      const caseService = new CaseService(db);
      // Admins bypass restrict-visibility via `*`, so orgPrivacy values are
      // irrelevant — pass an all-false stub.
      const adminAccess = {
        userId: user.id,
        effectivePermissions: new Set<string>(["*"]),
        orgPrivacy: {
          documents: false,
          clients: false,
          teamDirectory: false,
          adminClosureRequired: false,
          restrictCaseVisibility: false,
        },
      };

      const [[lawyer], [counts], lawyerCases, recentActivity] = await Promise.all([
        db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            role: users.role,
            phone: users.phone,
            specialization: users.specialization,
            avatarUrl: users.avatarUrl,
            location: users.location,
            isOnLeave: users.isOnLeave,
            createdAt: users.createdAt,
            lastLogin: users.lastLogin,
          })
          .from(users)
          .where(and(eq(users.id, id), eq(users.organizationId, user.orgId)))
          .limit(1),
        db
          .select({
            total: count(),
            open: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'open')`,
            inProgress: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'in_progress')`,
            pendingHearing: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'pending_hearing')`,
            closed: sql<number>`COUNT(*) FILTER (WHERE ${inArray(cases.status, CLOSED_STATUSES)})`,
            upcomingHearings: sql<number>`COUNT(*) FILTER (WHERE ${cases.nextHearing} IS NOT NULL AND ${cases.nextHearing} >= NOW() AND ${cases.status} NOT IN ('closed','archived'))`,
          })
          .from(cases)
          .where(
            and(eq(cases.organizationId, user.orgId), eq(cases.assignedLawyerId, id))
          ),
        caseService.getCasesByOrganization(
          user.orgId,
          { assignedLawyerId: id },
          null,
          adminAccess
        ),
        db
          .select({
            id: userActivities.id,
            userId: userActivities.userId,
            userName: users.fullName,
            type: userActivities.type,
            action: userActivities.action,
            title: userActivities.title,
            referenceId: userActivities.referenceId,
            createdAt: userActivities.createdAt,
          })
          .from(userActivities)
          .innerJoin(users, eq(userActivities.userId, users.id))
          .where(eq(userActivities.userId, id))
          .orderBy(desc(userActivities.createdAt))
          .limit(25),
      ]);

      if (!lawyer) {
        return reply.status(404).send({ message: "Lawyer not found" });
      }

      return reply.send({
        lawyer,
        caseCounts: {
          total: Number(counts?.total ?? 0),
          open: Number(counts?.open ?? 0),
          inProgress: Number(counts?.inProgress ?? 0),
          pendingHearing: Number(counts?.pendingHearing ?? 0),
          closed: Number(counts?.closed ?? 0),
          upcomingHearings: Number(counts?.upcomingHearings ?? 0),
        },
        cases: lawyerCases,
        recentActivity,
      });
    }
  );

  /**
   * GET /api/admin/pulse
   *
   * - Three at-a-glance risk signals: stale cases, AI suggestions awaiting
   *   review, regulations updated in the last 7 days that touch open cases.
   */
  fastify.get(
    "/pulse",
    {
      schema: {
        description: "Admin org pulse (risk surface)",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

      const regUpdatesWhere = and(
        eq(cases.organizationId, user.orgId),
        notInArray(cases.status, CLOSED_STATUSES),
        gt(regulationVersions.fetchedAt, sevenDaysAgo)
      );

      const [staleCases, [staleCountRow], awaitingReview, regUpdates, [regUpdatesCountRow]] =
        await Promise.all([
          db.query.cases.findMany({
            where: and(
              eq(cases.organizationId, user.orgId),
              notInArray(cases.status, CLOSED_STATUSES),
              lt(cases.updatedAt, thirtyDaysAgo)
            ),
            orderBy: [asc(cases.updatedAt)],
            with: {
              assignedLawyer: { columns: { id: true, fullName: true, email: true } },
            },
            limit: 10,
          }),
          db
            .select({ c: count() })
            .from(cases)
            .where(
              and(
                eq(cases.organizationId, user.orgId),
                notInArray(cases.status, CLOSED_STATUSES),
                lt(cases.updatedAt, thirtyDaysAgo)
              )
            ),
          db
            .select({
              caseId: cases.id,
              caseNumber: cases.caseNumber,
              title: cases.title,
              unreviewed: count(caseRegulationLinks.id),
            })
            .from(caseRegulationLinks)
            .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
            .where(
              and(
                eq(cases.organizationId, user.orgId),
                eq(caseRegulationLinks.verified, false)
              )
            )
            .groupBy(cases.id, cases.caseNumber, cases.title)
            .orderBy(desc(count(caseRegulationLinks.id)))
            .limit(10),
          db
            .select({
              caseId: cases.id,
              caseNumber: cases.caseNumber,
              title: cases.title,
              regulationId: regulations.id,
              regulationTitle: regulations.title,
              fetchedAt: regulationVersions.fetchedAt,
            })
            .from(regulationVersions)
            .innerJoin(
              caseRegulationLinks,
              eq(caseRegulationLinks.regulationId, regulationVersions.regulationId)
            )
            .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
            .innerJoin(regulations, eq(regulations.id, regulationVersions.regulationId))
            .where(regUpdatesWhere)
            .orderBy(desc(regulationVersions.fetchedAt))
            .limit(10),
          db
            .select({ c: count() })
            .from(regulationVersions)
            .innerJoin(
              caseRegulationLinks,
              eq(caseRegulationLinks.regulationId, regulationVersions.regulationId)
            )
            .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
            .where(regUpdatesWhere),
        ]);

      const totalAwaiting = awaitingReview.reduce(
        (sum, r) => sum + Number(r.unreviewed ?? 0),
        0
      );

      return reply.send({
        stale: {
          count: Number(staleCountRow?.c ?? 0),
          items: staleCases.map((c) => ({
            id: c.id,
            caseNumber: c.caseNumber,
            title: c.title,
            updatedAt: c.updatedAt,
            assignedLawyer: c.assignedLawyer ?? null,
          })),
        },
        awaitingReview: {
          count: totalAwaiting,
          items: awaitingReview.map((r) => ({
            caseId: r.caseId,
            caseNumber: r.caseNumber,
            title: r.title,
            unreviewed: Number(r.unreviewed ?? 0),
          })),
        },
        regulationUpdates: {
          count: Number(regUpdatesCountRow?.c ?? 0),
          items: regUpdates,
        },
      });
    }
  );

  /**
   * GET /api/admin/trends
   *
   * - 12 weekly buckets of cases created/closed plus status & case-type
   *   breakdowns. Powers the dashboard Trends card.
   */
  fastify.get(
    "/trends",
    {
      schema: {
        description: "Admin trend charts",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;

      const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 86_400_000);

      const [created, closed, statusBreakdown, caseTypeBreakdown] = await Promise.all([
        db
          .select({
            week: sql<string>`to_char(date_trunc('week', ${cases.createdAt}), 'YYYY-MM-DD')`,
            n: count(),
          })
          .from(cases)
          .where(
            and(
              eq(cases.organizationId, user.orgId),
              gt(cases.createdAt, twelveWeeksAgo)
            )
          )
          .groupBy(sql`date_trunc('week', ${cases.createdAt})`)
          .orderBy(sql`date_trunc('week', ${cases.createdAt})`),
        db
          .select({
            week: sql<string>`to_char(date_trunc('week', ${userActivities.createdAt}), 'YYYY-MM-DD')`,
            n: count(),
          })
          .from(userActivities)
          .innerJoin(users, eq(userActivities.userId, users.id))
          .where(
            and(
              eq(users.organizationId, user.orgId),
              eq(userActivities.type, "case"),
              eq(userActivities.action, "closed"),
              gt(userActivities.createdAt, twelveWeeksAgo)
            )
          )
          .groupBy(sql`date_trunc('week', ${userActivities.createdAt})`)
          .orderBy(sql`date_trunc('week', ${userActivities.createdAt})`),
        db
          .select({ status: cases.status, n: count() })
          .from(cases)
          .where(eq(cases.organizationId, user.orgId))
          .groupBy(cases.status),
        db
          .select({ caseType: cases.caseType, n: count() })
          .from(cases)
          .where(eq(cases.organizationId, user.orgId))
          .groupBy(cases.caseType),
      ]);

      // Merge into a single timeline (one row per week with both metrics)
      const weekMap = new Map<string, { created: number; closed: number }>();
      for (const r of created)
        weekMap.set(r.week, { created: Number(r.n), closed: 0 });
      for (const r of closed) {
        const existing = weekMap.get(r.week) ?? { created: 0, closed: 0 };
        existing.closed = Number(r.n);
        weekMap.set(r.week, existing);
      }
      const casesOverTime = Array.from(weekMap.entries())
        .map(([week, v]) => ({ week, ...v }))
        .sort((a, b) => a.week.localeCompare(b.week));

      return reply.send({
        casesOverTime,
        statusBreakdown: statusBreakdown.map((r) => ({
          status: r.status,
          count: Number(r.n ?? 0),
        })),
        caseTypeBreakdown: caseTypeBreakdown.map((r) => ({
          caseType: r.caseType,
          count: Number(r.n ?? 0),
        })),
      });
    }
  );

  /**
   * GET /api/admin/audit-log
   *
   * - Paginated feed of admin governance events.
   * - Query params: ?limit=50&before=<id>&action=<one of auditActions>
   */
  fastify.get(
    "/audit-log",
    {
      schema: {
        description: "Admin audit log",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      if (!requireAdmin(request, reply)) return;
      const q = request.query as {
        limit?: string;
        before?: string;
        action?: string;
      };
      const before = q.before ? parseInt(q.before, 10) : undefined;
      const limit = q.limit ? parseInt(q.limit, 10) : undefined;
      const parsedAction = z.enum(auditActions).optional().safeParse(q.action);
      const action: AuditAction | undefined = parsedAction.success
        ? parsedAction.data
        : undefined;

      const rows = await new AuditLogService(db).list(user.orgId, {
        action,
        limit,
        before: Number.isFinite(before) ? before : undefined,
      });

      return reply.send({
        entries: rows,
        nextBefore: rows.length === limit ? rows[rows.length - 1].id : null,
        actions: auditActions,
      });
    }
  );

  // AI Intelligence sub-routes (GET /ai-intelligence/summary, POST refresh, etc.)
  await registerAiIntelligenceRoutes(fastify);
};

export default adminRoutes;
