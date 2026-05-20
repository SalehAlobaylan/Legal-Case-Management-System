/*
 * PermissionService
 *
 * - Merges static role-based permissions with per-user grants from the
 *   `user_permission_grants` table.
 * - `canPermission` mirrors the frontend wildcard logic (admin's "*" wins,
 *   "resource.*" matches "resource.action", exact match otherwise).
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { userPermissionGrants } from "../db/schema/user-permission-grants";

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: ["*"],
  senior_lawyer: [
    "cases.*",
    "regulations.read",
    "ai-links.verify",
    "clients.*",
    "documents.*",
  ],
  lawyer: [
    "cases.*",
    "regulations.read",
    "ai-links.verify",
    "clients.*",
    "documents.*",
  ],
  paralegal: [
    "cases.create",
    "cases.read",
    "cases.update",
    "regulations.read",
    "clients.read",
    "documents.*",
  ],
  clerk: [
    "cases.create",
    "cases.read",
    "regulations.read",
    "clients.read",
    "documents.read",
  ],
  client: ["cases.read", "documents.read", "billing.read"],
};

export class PermissionService {
  constructor(private db: Database) {}

  /*
   * getGrantedPermissions
   *
   * - Loads the per-user permission strings granted within the given org.
   */
  async getGrantedPermissions(
    userId: string,
    organizationId: number
  ): Promise<string[]> {
    const rows = await this.db
      .select({ permission: userPermissionGrants.permission })
      .from(userPermissionGrants)
      .where(
        and(
          eq(userPermissionGrants.userId, userId),
          eq(userPermissionGrants.organizationId, organizationId)
        )
      );
    return rows.map((r) => r.permission);
  }

  /*
   * getEffectivePermissions
   *
   * - Combines the user's role permissions with their granted overrides.
   * - Returns a Set for cheap membership lookups.
   */
  async getEffectivePermissions(
    userId: string,
    role: string,
    organizationId: number
  ): Promise<Set<string>> {
    const rolePerms = ROLE_PERMISSIONS[role] ?? [];
    const grants = await this.getGrantedPermissions(userId, organizationId);
    return new Set<string>([...rolePerms, ...grants]);
  }

  /*
   * can
   *
   * - Synchronous wildcard match against a precomputed permission set.
   * - "*" beats everything, "resource.*" matches "resource.action".
   */
  static can(effective: Set<string>, permission: string): boolean {
    if (effective.has("*")) return true;
    if (effective.has(permission)) return true;
    const [resource] = permission.split(".");
    if (resource && effective.has(`${resource}.*`)) return true;
    return false;
  }

  /*
   * grantPermission
   *
   * - Inserts a grant row. Idempotent via the unique index, so repeat calls
   *   no-op gracefully.
   */
  async grantPermission(input: {
    userId: string;
    organizationId: number;
    permission: string;
    grantedBy: string;
  }) {
    await this.db
      .insert(userPermissionGrants)
      .values({
        userId: input.userId,
        organizationId: input.organizationId,
        permission: input.permission,
        grantedBy: input.grantedBy,
      })
      .onConflictDoNothing();
  }

  /*
   * revokePermission
   *
   * - Deletes a single permission grant for the user in this org.
   */
  async revokePermission(input: {
    userId: string;
    organizationId: number;
    permission: string;
  }) {
    await this.db
      .delete(userPermissionGrants)
      .where(
        and(
          eq(userPermissionGrants.userId, input.userId),
          eq(userPermissionGrants.organizationId, input.organizationId),
          eq(userPermissionGrants.permission, input.permission)
        )
      );
  }
}
