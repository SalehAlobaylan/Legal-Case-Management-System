/*
 * OrganizationService encapsulates organization-related business logic.
 *
 * It provides CRUD operations for organizations and is used by the
 * organizations routes and the auth service during registration.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/connection";
import { organizations, type NewOrganization } from "../db/schema";
import { ConflictError, NotFoundError } from "../utils/errors";

export class OrganizationService {
  constructor(private db: Database) {}

  /*
   * getAll
   *
   * - Returns all organizations sorted alphabetically by name.
   * - Used to populate the organization dropdown in registration form.
   */
  async getAll() {
    return await this.db.query.organizations.findMany({
      orderBy: (organizations, { asc }) => [asc(organizations.name)],
    });
  }

  /*
   * getById
   *
   * - Returns a single organization by ID.
   * - Returns null if not found (throws NotFoundError when needed).
   */
  async getById(id: number) {
    return await this.db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
  }

  /*
   * create
   *
   * - Creates a new organization with the given data.
   * - Validates that an organization with the same name doesn't already exist.
   * - Returns the newly created organization.
   */
  async create(data: {
    name: string;
    country?: string;
    subscriptionTier?: string;
    licenseNumber?: string;
    contactInfo?: string;
  }) {
    const existing = await this.db.query.organizations.findFirst({
      where: eq(organizations.name, data.name),
    });

    if (existing) {
      throw new ConflictError("Organization already exists");
    }

    const newOrg: NewOrganization = {
      name: data.name,
      country: data.country || "SA",
      subscriptionTier: data.subscriptionTier || "free",
      licenseNumber: data.licenseNumber,
      contactInfo: data.contactInfo,
    };

    const [created] = await this.db
      .insert(organizations)
      .values(newOrg)
      .returning();

    return created;
  }

  /*
   * update
   *
   * - Updates an existing organization by ID.
   * - Only updates the fields that are provided.
   * - Returns the updated organization or null if not found.
   */
  async update(
    id: number,
    data: {
      name?: string;
      country?: string;
      subscriptionTier?: string;
      licenseNumber?: string;
      contactInfo?: string;
    }
  ) {
    const [updated] = await this.db
      .update(organizations)
      .set({
        ...(data.name && { name: data.name }),
        ...(data.country && { country: data.country }),
        ...(data.subscriptionTier && { subscriptionTier: data.subscriptionTier }),
        ...(data.licenseNumber !== undefined && { licenseNumber: data.licenseNumber }),
        ...(data.contactInfo !== undefined && { contactInfo: data.contactInfo }),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))
      .returning();

    return updated;
  }

  /*
   * delete
   *
   * - Deletes an organization by ID.
   * - Cascades to delete all users in the organization (due to FK constraint).
   * - Returns the deleted organization or null if not found.
   */
  async delete(id: number) {
    const [deleted] = await this.db
      .delete(organizations)
      .where(eq(organizations.id, id))
      .returning();

    return deleted;
  }
}
