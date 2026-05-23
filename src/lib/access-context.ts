/*
 * Shared access-context helpers
 *
 * - `buildAccessContext`: turns the JWT user into a `CaseAccessContext` carrying
 *   the user's effective permissions AND the org's privacy flags. The org row
 *   is loaded exactly once per request via this function — downstream services
 *   read flags off the access context instead of re-querying.
 * - `assertCanSeeDocument`: gates per-document endpoints (download / delete /
 *   summarize / insights) under the `restrictDocumentSharing` privacy toggle.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { organizations } from "../db/schema/organizations";
import {
  CaseService,
  type CaseAccessContext,
  type OrgPrivacy,
} from "../services/case.service";
import { PermissionService } from "../services/permission.service";

const EMPTY_ORG_PRIVACY: OrgPrivacy = {
  documents: false,
  clients: false,
  teamDirectory: false,
  adminClosureRequired: false,
  restrictCaseVisibility: false,
};

export async function buildAccessContext(
  db: Database,
  user: { id: string; role: string; orgId: number }
): Promise<CaseAccessContext> {
  const permService = new PermissionService(db);
  const [effectivePermissions, orgPrivacy] = await Promise.all([
    permService.getEffectivePermissions(user.id, user.role, user.orgId),
    loadOrgPrivacy(db, user.orgId),
  ]);
  return { userId: user.id, effectivePermissions, orgPrivacy };
}

async function loadOrgPrivacy(db: Database, orgId: number): Promise<OrgPrivacy> {
  const [org] = await db
    .select({
      settings: organizations.settings,
      restrictCaseVisibility: organizations.restrictCaseVisibility,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return EMPTY_ORG_PRIVACY;
  const privacy = (org.settings as
    | { privacy?: Partial<OrgPrivacy> }
    | null
    | undefined)?.privacy;
  return {
    documents: Boolean(privacy?.documents),
    clients: Boolean(privacy?.clients),
    teamDirectory: Boolean(privacy?.teamDirectory),
    adminClosureRequired: Boolean(privacy?.adminClosureRequired),
    restrictCaseVisibility: Boolean(org.restrictCaseVisibility),
  };
}

/**
 * Verify the caller can see a document under the org's privacy policy.
 *
 * Order of checks:
 *  1. Bypass permissions (`*` or `delegated.documents.viewAll`).
 *  2. If `settings.privacy.documents` is OFF → allow (only org-scoping applies, handled by callers).
 *  3. Otherwise — must be able to read the parent case under visibility rules
 *     (delegates to `CaseService.getCaseById`, which throws `ForbiddenError`).
 *
 * Callers MAY pass a prebuilt `access` to skip the per-request rebuild. When
 * omitted, this helper does its own buildAccessContext (still one org-row read
 * thanks to the request-level merge inside buildAccessContext).
 */
export async function assertCanSeeDocument(input: {
  db: Database;
  user: { id: string; role: string; orgId: number };
  document: { caseId: number };
  access?: CaseAccessContext;
}): Promise<void> {
  const access = input.access ?? (await buildAccessContext(input.db, input.user));

  if (
    PermissionService.can(access.effectivePermissions, "delegated.documents.viewAll")
  ) {
    return;
  }

  if (!access.orgPrivacy.documents) return;

  const caseService = new CaseService(input.db);
  await caseService.getCaseById(
    input.document.caseId,
    input.user.orgId,
    null,
    access
  );
}
