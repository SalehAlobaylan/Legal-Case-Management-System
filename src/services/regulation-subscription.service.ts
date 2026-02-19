import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  regulationSubscriptions,
  regulations,
  type RegulationSubscription,
} from "../db/schema";
import { NotFoundError } from "../utils/errors";

export type BulkSubscriptionFailureReason =
  | "not_found"
  | "missing_source_url"
  | "source_url_not_whitelisted";

export interface BulkSubscribeResult {
  created: number;
  alreadySubscribed: number;
  failed: Array<{
    regulationId: number;
    reason: BulkSubscriptionFailureReason;
  }>;
}

interface SubscribeInput {
  userId: string;
  organizationId: number;
  regulationId: number;
  sourceUrl?: string;
  checkIntervalHours?: number;
  subscribedVia?: string;
}

export class RegulationSubscriptionService {
  private static readonly TRUSTED_SOURCE_DOMAINS = [
    "laws.boe.gov.sa",
    "laws.moj.gov.sa",
    "boe.gov.sa",
    "moj.gov.sa",
  ];

  constructor(private readonly db: Database) {}

  static isTrustedSourceUrl(sourceUrl: string): boolean {
    try {
      const url = new URL(sourceUrl);
      if (url.protocol !== "https:") {
        return false;
      }

      const host = url.hostname.toLowerCase();
      return RegulationSubscriptionService.TRUSTED_SOURCE_DOMAINS.some(
        (trusted) => host === trusted || host.endsWith(`.${trusted}`)
      );
    } catch {
      return false;
    }
  }

  private async resolveSource(
    regulationId: number,
    sourceUrl?: string
  ): Promise<
    | { sourceUrl: string }
    | { reason: BulkSubscriptionFailureReason }
  > {
    const regulation = await this.db.query.regulations.findFirst({
      where: eq(regulations.id, regulationId),
      columns: {
        id: true,
        sourceUrl: true,
      },
    });

    if (!regulation) {
      return { reason: "not_found" };
    }

    const resolvedSourceUrl = sourceUrl || regulation.sourceUrl || undefined;
    if (!resolvedSourceUrl) {
      return { reason: "missing_source_url" };
    }

    if (!RegulationSubscriptionService.isTrustedSourceUrl(resolvedSourceUrl)) {
      return { reason: "source_url_not_whitelisted" };
    }

    return { sourceUrl: resolvedSourceUrl };
  }

  async createOrUpdateSubscription(
    input: SubscribeInput
  ): Promise<
    | {
        created: true;
        subscription: RegulationSubscription;
      }
    | {
        created: false;
        subscription?: never;
        reason: BulkSubscriptionFailureReason;
      }
  > {
    const source = await this.resolveSource(input.regulationId, input.sourceUrl);
    if ("reason" in source) {
      return {
        created: false,
        reason: source.reason,
      };
    }

    const now = new Date();
    const interval = Math.max(1, input.checkIntervalHours || 24);
    const nextCheckAt = new Date(now.getTime() + interval * 60 * 60 * 1000);

    const [subscription] = await this.db
      .insert(regulationSubscriptions)
      .values({
        userId: input.userId,
        organizationId: input.organizationId,
        regulationId: input.regulationId,
        sourceUrl: source.sourceUrl,
        checkIntervalHours: interval,
        isActive: true,
        subscribedVia: input.subscribedVia || "manual",
        nextCheckAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          regulationSubscriptions.userId,
          regulationSubscriptions.regulationId,
        ],
        set: {
          sourceUrl: source.sourceUrl,
          checkIntervalHours: interval,
          isActive: true,
          subscribedVia: input.subscribedVia || "manual",
          nextCheckAt,
          updatedAt: now,
        },
      })
      .returning();

    return {
      created: true,
      subscription,
    };
  }

  async bulkSubscribe(
    input: Omit<SubscribeInput, "regulationId"> & {
      regulationIds: number[];
    }
  ): Promise<BulkSubscribeResult> {
    const uniqueRegulationIds = [...new Set(input.regulationIds)];
    if (uniqueRegulationIds.length === 0) {
      return {
        created: 0,
        alreadySubscribed: 0,
        failed: [],
      };
    }

    const existing = await this.db.query.regulationSubscriptions.findMany({
      where: and(
        eq(regulationSubscriptions.userId, input.userId),
        eq(regulationSubscriptions.organizationId, input.organizationId),
        inArray(regulationSubscriptions.regulationId, uniqueRegulationIds)
      ),
      columns: {
        regulationId: true,
      },
    });
    const existingRegulationIds = new Set(existing.map((row) => row.regulationId));

    const result: BulkSubscribeResult = {
      created: 0,
      alreadySubscribed: 0,
      failed: [],
    };

    for (const regulationId of uniqueRegulationIds) {
      const subscription = await this.createOrUpdateSubscription({
        ...input,
        regulationId,
      });

      if (!subscription.created) {
        result.failed.push({
          regulationId,
          reason: subscription.reason,
        });
        continue;
      }

      if (existingRegulationIds.has(regulationId)) {
        result.alreadySubscribed += 1;
      } else {
        result.created += 1;
      }
    }

    return result;
  }

  async getSubscriptionsByUser(
    userId: string,
    organizationId: number,
    regulationIds?: number[]
  ) {
    const conditions = [
      eq(regulationSubscriptions.userId, userId),
      eq(regulationSubscriptions.organizationId, organizationId),
    ];

    if (Array.isArray(regulationIds)) {
      if (regulationIds.length === 0) {
        return [];
      }
      conditions.push(inArray(regulationSubscriptions.regulationId, regulationIds));
    }

    return this.db.query.regulationSubscriptions.findMany({
      where: and(...conditions),
      with: {
        regulation: {
          columns: {
            id: true,
            title: true,
            regulationNumber: true,
            sourceUrl: true,
          },
        },
      },
      orderBy: (subs, { desc }) => [desc(subs.createdAt)],
    });
  }

  async getSubscribedRegulationIds(
    userId: string,
    organizationId: number,
    regulationIds: number[]
  ): Promise<Set<number>> {
    if (regulationIds.length === 0) {
      return new Set<number>();
    }

    const rows = await this.db.query.regulationSubscriptions.findMany({
      where: and(
        eq(regulationSubscriptions.userId, userId),
        eq(regulationSubscriptions.organizationId, organizationId),
        inArray(regulationSubscriptions.regulationId, regulationIds)
      ),
      columns: {
        regulationId: true,
      },
    });

    return new Set(rows.map((row) => row.regulationId));
  }

  async requireRegulation(regulationId: number) {
    const regulation = await this.db.query.regulations.findFirst({
      where: eq(regulations.id, regulationId),
      columns: {
        id: true,
      },
    });

    if (!regulation) {
      throw new NotFoundError("Regulation");
    }

    return regulation;
  }
}
