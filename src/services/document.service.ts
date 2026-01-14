/*
 * DocumentService
 *
 * - Encapsulates all data access and business logic for case documents.
 * - Handles file metadata storage (actual file storage is handled by the route layer).
 */

import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../db/connection";
import { documents, cases, type NewDocument } from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";

export class DocumentService {
  constructor(private db: Database) {}

  /**
   * createDocument
   *
   * - Creates a new document record in the database.
   * - Returns the created document.
   */
  async createDocument(data: NewDocument) {
    const [document] = await this.db
      .insert(documents)
      .values(data)
      .returning();

    return document;
  }

  /**
   * getDocumentById
   *
   * - Retrieves a single document by its ID.
   * - Verifies it belongs to the specified organization.
   * - Throws NotFoundError if document doesn't exist.
   * - Throws ForbiddenError if document belongs to another org.
   */
  async getDocumentById(id: number, orgId: number) {
    const document = await this.db.query.documents.findFirst({
      where: eq(documents.id, id),
      with: {
        case: true,
        uploader: {
          columns: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundError("Document");
    }

    // Verify organization access through the case
    if (document.case.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this document");
    }

    return document;
  }

  /**
   * getDocumentsByCaseId
   *
   * - Returns all documents for a given case.
   * - Verifies the case belongs to the specified organization.
   * - Orders by creation date descending (newest first).
   */
  async getDocumentsByCaseId(caseId: number, orgId: number) {
    // First verify the case exists and belongs to org
    const case_ = await this.db.query.cases.findFirst({
      where: eq(cases.id, caseId),
    });

    if (!case_) {
      throw new NotFoundError("Case");
    }

    if (case_.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this case");
    }

    return this.db.query.documents.findMany({
      where: eq(documents.caseId, caseId),
      orderBy: [desc(documents.createdAt)],
      with: {
        uploader: {
          columns: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * deleteDocument
   *
   * - Deletes a document by its ID.
   * - Verifies it belongs to the specified organization first.
   * - Returns the deleted document for cleanup of the actual file.
   */
  async deleteDocument(id: number, orgId: number) {
    // Verify access first
    const document = await this.getDocumentById(id, orgId);

    await this.db.delete(documents).where(eq(documents.id, id));

    return document;
  }
}
