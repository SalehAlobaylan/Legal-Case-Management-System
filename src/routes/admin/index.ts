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
import { and, asc, count, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "../../db/connection";
import { cases } from "../../db/schema/cases";
import { users } from "../../db/schema/users";
import { userActivities } from "../../db/schema/user-activities";
import { caseRegulationLinks } from "../../db/schema/case-regulation-links";
import { regulationVersions } from "../../db/schema/regulation-versions";
import { regulations } from "../../db/schema/regulations";
import { CaseService } from "../../services/case.service";
import {
  AuditLogService,
  auditActions,
  type AuditAction,
} from "../../services/audit-log.service";

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

type RequestWithUser = FastifyRequest & {
  user: { id: string; email: string; role: string; orgId: number };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
};

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

  app.addHook("onRequest", app.authenticate);

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

      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      // Aggregate case counts in a single grouped query
      const [aggregate] = await db
        .select({
          total: count(),
          open: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'open')`,
          inProgress: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'in_progress')`,
          pendingHearing: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'pending_hearing')`,
          closed: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} IN ('closed','archived'))`,
          unassigned: sql<number>`COUNT(*) FILTER (WHERE ${cases.assignedLawyerId} IS NULL)`,
        })
        .from(cases)
        .where(eq(cases.organizationId, user.orgId));

      // Workload per lawyer (active = not closed/archived)
      const workload = await db
        .select({
          lawyerId: users.id,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
          totalCases: count(cases.id),
          openCases: sql<number>`COUNT(${cases.id}) FILTER (WHERE ${cases.status} NOT IN ('closed','archived'))`,
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
        .orderBy(desc(sql<number>`COUNT(${cases.id})`));

      // Unassigned cases — surfaced separately so admins can act on them
      const unassignedCases = await db.query.cases.findMany({
        where: and(
          eq(cases.organizationId, user.orgId),
          isNull(cases.assignedLawyerId)
        ),
        orderBy: [desc(cases.createdAt)],
        limit: 25,
      });

      // Recent activity — last 20 across the org's users
      const recentActivity = await db
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
        .limit(20);

      const lawyerCount = workload.length;

      // Hearings pipeline — bucket org cases with a `nextHearing` set.
      // Skip closed/archived cases so resolved matters don't clutter the view.
      const hearingRows = await db.query.cases.findMany({
        where: and(
          eq(cases.organizationId, user.orgId),
          isNotNull(cases.nextHearing),
          sql`${cases.status} NOT IN ('closed','archived')`
        ),
        with: {
          assignedLawyer: { columns: { id: true, fullName: true, email: true } },
        },
        orderBy: [asc(cases.nextHearing)],
      });

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

      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }
      // Basic UUID shape check — keeps Postgres from erroring on bad input.
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
        return reply.status(400).send({ message: "Invalid lawyer id" });
      }

      // 1) Lawyer row, scoped to the admin's org.
      const [lawyer] = await db
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
        .limit(1);
      if (!lawyer) {
        return reply.status(404).send({ message: "Lawyer not found" });
      }

      // 2) Case counts for this lawyer.
      const [counts] = await db
        .select({
          total: count(),
          open: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'open')`,
          inProgress: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'in_progress')`,
          pendingHearing: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} = 'pending_hearing')`,
          closed: sql<number>`COUNT(*) FILTER (WHERE ${cases.status} IN ('closed','archived'))`,
          upcomingHearings: sql<number>`COUNT(*) FILTER (WHERE ${cases.nextHearing} IS NOT NULL AND ${cases.nextHearing} >= NOW() AND ${cases.status} NOT IN ('closed','archived'))`,
        })
        .from(cases)
        .where(
          and(eq(cases.organizationId, user.orgId), eq(cases.assignedLawyerId, id))
        );

      // 3) Full case list — reuse CaseService so visibility/access logic stays
      //    centralized. Admins bypass restrict-visibility via their `*` perm.
      const caseService = new CaseService(db);
      const adminAccess = {
        userId: user.id,
        effectivePermissions: new Set<string>(["*"]),
      };
      const lawyerCases = await caseService.getCasesByOrganization(
        user.orgId,
        { assignedLawyerId: id },
        null,
        adminAccess
      );

      // 4) Recent activity for this user.
      const recentActivity = await db
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
        .limit(25);

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
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

      // Stale cases — open status & not touched in 30+ days
      const staleCases = await db.query.cases.findMany({
        where: and(
          eq(cases.organizationId, user.orgId),
          sql`${cases.status} NOT IN ('closed','archived')`,
          lt(cases.updatedAt, thirtyDaysAgo)
        ),
        orderBy: [asc(cases.updatedAt)],
        with: {
          assignedLawyer: { columns: { id: true, fullName: true, email: true } },
        },
        limit: 10,
      });
      const [staleCountRow] = await db
        .select({ c: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, user.orgId),
            sql`${cases.status} NOT IN ('closed','archived')`,
            lt(cases.updatedAt, thirtyDaysAgo)
          )
        );

      // AI suggestions awaiting review — verified=false on org cases
      const awaitingReview = await db
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
        .limit(10);
      const totalAwaiting = awaitingReview.reduce(
        (sum, r) => sum + Number(r.unreviewed ?? 0),
        0
      );

      // Regulation updates affecting open cases — versions fetched in last 7d
      const regUpdates = await db
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
        .where(
          and(
            eq(cases.organizationId, user.orgId),
            sql`${cases.status} NOT IN ('closed','archived')`,
            gt(regulationVersions.fetchedAt, sevenDaysAgo)
          )
        )
        .orderBy(desc(regulationVersions.fetchedAt))
        .limit(10);

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
          count: regUpdates.length,
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
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }

      const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 86_400_000);

      // Weekly buckets of cases created
      const created = await db
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
        .orderBy(sql`date_trunc('week', ${cases.createdAt})`);

      // Weekly buckets of case-closures from user_activities (action='closed')
      const closed = await db
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
        .orderBy(sql`date_trunc('week', ${userActivities.createdAt})`);

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

      // Status breakdown — all cases regardless of date
      const statusBreakdown = await db
        .select({ status: cases.status, n: count() })
        .from(cases)
        .where(eq(cases.organizationId, user.orgId))
        .groupBy(cases.status);

      // Case type breakdown
      const caseTypeBreakdown = await db
        .select({ caseType: cases.caseType, n: count() })
        .from(cases)
        .where(eq(cases.organizationId, user.orgId))
        .groupBy(cases.caseType);

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
      if (user.role !== "admin") {
        return reply.status(403).send({ message: "Admin access required" });
      }
      const q = request.query as {
        limit?: string;
        before?: string;
        action?: string;
      };
      const limit = Math.min(Math.max(parseInt(q.limit ?? "50", 10) || 50, 1), 200);
      const before = q.before ? parseInt(q.before, 10) : undefined;
      const action: AuditAction | undefined = auditActions.includes(
        q.action as AuditAction
      )
        ? (q.action as AuditAction)
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
};

export default adminRoutes;
