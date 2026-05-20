/*
 * Shared access-context helpers
 *
 * - `buildAccessContext`: turns the JWT user into a `CaseAccessContext` carrying
 *   the user's effective permissions. Used by every route that needs to make a
 *   visibility decision.
 * - `assertCanSeeDocument`: gates per-document endpoints (download / delete /
 *   summarize / insights) under the `restrictDocumentSharing` privacy toggle.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { organizations } from "../db/schema/organizations";
import {
  CaseService,
  type CaseAccessContext,
} from "../services/case.service";
import { PermissionService } from "../services/permission.service";

export async function buildAccessContext(
  db: Database,
  user: { id: string; role: string; orgId: number }
): Promise<CaseAccessContext> {
  const permService = new PermissionService(db);
  const effectivePermissions = await permService.getEffectivePermissions(
    user.id,
    user.role,
    user.orgId
  );
  return { userId: user.id, effectivePermissions };
}

/**
 * Verify the caller can see a document under the org's privacy policy.
 *
 * Order of checks:
 *  1. Bypass permissions (`*` or `delegated.documents.viewAll`).
 *  2. If `settings.privacy.documents` is OFF → allow (only org-scoping applies, handled by callers).
 *  3. Otherwise — must be able to read the parent case under visibility rules
 *     (delegates to `CaseService.getCaseById`, which throws `ForbiddenError`).
 */
export async function assertCanSeeDocument(input: {
  db: Database;
  user: { id: string; role: string; orgId: number };
  document: { caseId: number };
}): Promise<void> {
  const access = await buildAccessContext(input.db, input.user);

  // Fast path — explicit bypasses.
  if (
    PermissionService.can(access.effectivePermissions, "delegated.documents.viewAll")
  ) {
    return;
  }

  // Check whether the org has the document-sharing restriction enabled.
  const [org] = await input.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, input.user.orgId))
    .limit(1);
  const restrictDocs = Boolean(
    (org?.settings as { privacy?: { documents?: boolean } } | null | undefined)
      ?.privacy?.documents
  );
  if (!restrictDocs) return;

  // Defer to case visibility — throws ForbiddenError if the case is hidden.
  const caseService = new CaseService(input.db);
  await caseService.getCaseById(
    input.document.caseId,
    input.user.orgId,
    null,
    access
  );
}
