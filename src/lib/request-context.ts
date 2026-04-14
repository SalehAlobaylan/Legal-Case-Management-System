import { and, eq } from "drizzle-orm";
import { clientPortalAccounts } from "../db/schema";
import type { Database } from "../db/connection";
import { ForbiddenError } from "../utils/errors";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  orgId: number;
};

export async function getScopedClientIdForUser(
  db: Database,
  user: AuthenticatedUser
): Promise<number | null> {
  if (user.role !== "client") return null;

  const mapping = await db.query.clientPortalAccounts.findFirst({
    where: and(
      eq(clientPortalAccounts.userId, user.id),
      eq(clientPortalAccounts.organizationId, user.orgId),
      eq(clientPortalAccounts.status, "active")
    ),
  });

  if (!mapping) {
    throw new ForbiddenError("Client account is not linked to an active portal profile");
  }

  return mapping.clientId;
}
