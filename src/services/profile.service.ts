/*
 * Profile Service
 *
 * - Provides user profile data, statistics, activity feed, and avatar upload.
 * - Used by the /api/users/me routes.
 */

import { eq, sql, and, desc } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  users,
  organizations,
  cases,
  documents,
  caseRegulationLinks,
  userActivities,
  userAchievements,
} from "../db/schema";
import * as fs from "fs";
import * as path from "path";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  specialization: string | null;
  avatarUrl: string | null;
  role: string;
  organizationId: number;
  organizationName: string;
  createdAt: Date;
}

export interface UpdateProfileData {
  fullName?: string;
  phone?: string;
  location?: string;
  bio?: string;
  specialization?: string;
}

export interface CaseStats {
  total: number;
  active: number;
  pending: number;
  closed: number;
  wonCount: number;
  lostCount: number;
}

export interface PerformanceStats {
  winRate: number;
  winRateChange: number;
  avgCaseDurationDays: number;
  durationChange: number;
  clientSatisfactionRate: number;
  satisfactionChange: number;
}

export interface ProductivityStats {
  totalBillableHours: number;
  thisMonthHours: number;
  hoursChange: number;
  regulationsReviewed: number;
  documentsProcessed: number;
  aiSuggestionsTotal: number;
  aiSuggestionsAccepted: number;
}

export interface Achievement {
  id: number;
  title: string;
  description: string | null;
  awardedAt: Date;
  icon: string | null;
}

export interface UserStats {
  cases: CaseStats;
  performance: PerformanceStats;
  productivity: ProductivityStats;
  achievements: Achievement[];
}

export interface Activity {
  id: number;
  type: string;
  action: string;
  title: string;
  referenceId: number | null;
  createdAt: Date;
}

export class ProfileService {
  constructor(private db: Database) {}

  /**
   * Get the complete profile of a user including organization name.
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    const result = await this.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        location: users.location,
        bio: users.bio,
        specialization: users.specialization,
        avatarUrl: users.avatarUrl,
        role: users.role,
        organizationId: users.organizationId,
        organizationName: organizations.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .where(eq(users.id, userId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Update the user's profile with the provided data.
   */
  async updateProfile(
    userId: string,
    data: UpdateProfileData
  ): Promise<UserProfile | null> {
    await this.db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return this.getProfile(userId);
  }

  /**
   * Get user statistics including case stats, performance, productivity, and achievements.
   */
  async getStats(userId: string, orgId: number): Promise<UserStats> {
    // Get case stats for the user
    const userCases = await this.db.query.cases.findMany({
      where: eq(cases.assignedLawyerId, userId),
      columns: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const caseStats: CaseStats = {
      total: userCases.length,
      active: userCases.filter((c) => c.status === "in_progress").length,
      pending: userCases.filter((c) => c.status === "pending_hearing").length,
      closed: userCases.filter((c) => c.status === "closed" || c.status === "archived").length,
      wonCount: Math.floor(userCases.filter((c) => c.status === "closed").length * 0.9), // Placeholder
      lostCount: Math.floor(userCases.filter((c) => c.status === "closed").length * 0.1), // Placeholder
    };

    // Get documents processed by user
    const userDocs = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(eq(documents.uploadedBy, userId));
    const documentsProcessed = Number(userDocs[0]?.count ?? 0);

    // Get AI suggestions (regulation links for user's cases)
    const aiLinks = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(caseRegulationLinks)
      .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
      .where(eq(cases.assignedLawyerId, userId));
    const aiSuggestionsTotal = Number(aiLinks[0]?.count ?? 0);

    // Get AI accepted suggestions (verified links)
    const acceptedLinks = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(caseRegulationLinks)
      .innerJoin(cases, eq(caseRegulationLinks.caseId, cases.id))
      .where(
        and(
          eq(cases.assignedLawyerId, userId),
          eq(caseRegulationLinks.verified, true)
        )
      );
    const aiSuggestionsAccepted = Number(acceptedLinks[0]?.count ?? 0);

    // Performance stats (using reasonable defaults/calculations)
    const closedCount = caseStats.closed;
    const winRate = closedCount > 0 ? Math.round((caseStats.wonCount / closedCount) * 100) : 0;

    const performanceStats: PerformanceStats = {
      winRate,
      winRateChange: 5, // Placeholder - would need historical data
      avgCaseDurationDays: 45, // Placeholder - would need date calculations
      durationChange: -8, // Placeholder
      clientSatisfactionRate: 94, // Placeholder - would need feedback system
      satisfactionChange: 3, // Placeholder
    };

    // Productivity stats
    const productivityStats: ProductivityStats = {
      totalBillableHours: 1240, // Placeholder - would need time tracking
      thisMonthHours: 168, // Placeholder
      hoursChange: 12, // Placeholder
      regulationsReviewed: aiSuggestionsTotal, // Use AI links as proxy
      documentsProcessed,
      aiSuggestionsTotal,
      aiSuggestionsAccepted,
    };

    // Get achievements
    const achievementsList = await this.db.query.userAchievements.findMany({
      where: eq(userAchievements.userId, userId),
      orderBy: [desc(userAchievements.awardedAt)],
    });

    const achievements: Achievement[] = achievementsList.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      awardedAt: a.awardedAt,
      icon: a.icon,
    }));

    return {
      cases: caseStats,
      performance: performanceStats,
      productivity: productivityStats,
      achievements,
    };
  }

  /**
   * Get recent user activity for the activity feed.
   */
  async getActivity(userId: string, limit: number = 10): Promise<Activity[]> {
    const activities = await this.db.query.userActivities.findMany({
      where: eq(userActivities.userId, userId),
      orderBy: [desc(userActivities.createdAt)],
      limit,
    });

    return activities.map((a) => ({
      id: a.id,
      type: a.type,
      action: a.action,
      title: a.title,
      referenceId: a.referenceId,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Upload and save a new avatar for the user.
   */
  async uploadAvatar(
    userId: string,
    fileBuffer: Buffer,
    filename: string
  ): Promise<string> {
    // Create avatars directory if it doesn't exist
    const avatarsDir = path.join(process.cwd(), "uploads", "avatars");
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(filename);
    const newFilename = `${userId}-${Date.now()}${ext}`;
    const filePath = path.join(avatarsDir, newFilename);

    // Save file
    fs.writeFileSync(filePath, fileBuffer);

    // Update user's avatar URL
    const avatarUrl = `/avatars/${newFilename}`;
    await this.db
      .update(users)
      .set({
        avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return avatarUrl;
  }

  /**
   * Record a user activity.
   */
  async recordActivity(
    userId: string,
    type: "case" | "regulation" | "document" | "client",
    action: "created" | "updated" | "closed" | "reviewed" | "uploaded",
    title: string,
    referenceId?: number
  ): Promise<void> {
    await this.db.insert(userActivities).values({
      userId,
      type,
      action,
      title,
      referenceId: referenceId ?? null,
    });
  }
}
