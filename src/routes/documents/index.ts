/*
 * Documents routes plugin
 *
 * - Registers the HTTP endpoints for case document management.
 * - Supports upload, list, download, and delete operations.
 * - All routes require JWT authentication.
 */

import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import { DocumentService } from "../../services/document.service";
import { DocumentExtractionService } from "../../services/document-extraction.service";
import { NotificationDeliveryService } from "../../services/notification-delivery.service";
import type { Database } from "../../db/connection";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { getScopedClientIdForUser } from "../../lib/request-context";

type RequestWithUser = FastifyRequest & {
  user: {
    id: string;
    email: string;
    role: string;
    orgId: number;
  };
};

type AuthenticatedFastifyInstance = FastifyInstance & {
  authenticate: (request: FastifyRequest) => Promise<void>;
  db: Database;
  emitToUser?: (
    userId: string,
    event: string,
    data: Record<string, unknown>
  ) => void;
};

// Configure upload directory (can be overridden via env)
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const documentsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  const notificationDelivery = new NotificationDeliveryService(
    app.db,
    app.emitToUser
  );

  // All routes require authentication
  app.addHook("onRequest", app.authenticate);

  /**
   * GET /api/cases/:caseId/documents
   *
   * - Lists all documents for a specific case.
   * - Returns document metadata (not the actual files).
   */
  fastify.get(
    "/:caseId/documents",
    {
      schema: {
        description: "List all documents for a case",
        tags: ["documents"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            caseId: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { caseId } = request.params as { caseId: string };
      const caseIdNum = parseInt(caseId, 10);

      if (isNaN(caseIdNum)) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      const documentService = new DocumentService(app.db);
      const documents = await documentService.getDocumentsByCaseId(
        caseIdNum,
        user.orgId,
        scopedClientId
      );
      const extractionService = new DocumentExtractionService(app.db);
      const extractionMap = await extractionService.getCaseExtractionMap(
        caseIdNum,
        user.orgId
      );

      const withExtractionState = documents.map((document) => {
        const extraction = extractionMap.get(document.id);
        return {
          ...document,
          extractionStatus: extraction?.status || "pending",
          extractionMethod: extraction?.extractionMethod || null,
          extractionErrorCode: extraction?.errorCode || null,
          extractionWarnings: extraction?.warnings || [],
          insightsStatus: extraction?.insightsStatus || "pending",
          insightsUpdatedAt: extraction?.insightsUpdatedAt || null,
          hasInsights: extraction?.insightsStatus === "ready",
        };
      });

      return reply.send({ documents: withExtractionState });
    }
  );

  /**
   * POST /api/cases/:caseId/documents
   *
   * - Uploads a new document for a case.
   * - Stores the file on local disk (configurable via UPLOAD_DIR).
   * - Saves metadata to the database.
   */
  fastify.post(
    "/:caseId/documents",
    {
      schema: {
        description: "Upload a document for a case",
        tags: ["documents"],
        security: [{ bearerAuth: [] }],
        consumes: ["multipart/form-data"],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { caseId } = request.params as { caseId: string };
      const caseIdNum = parseInt(caseId, 10);

      if (isNaN(caseIdNum)) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot upload documents" });
      }

      // Parse multipart data
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ message: "No file uploaded" });
      }

      // Server-side file type validation
      const allowedMimeTypes = new Set([
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/plain",
        "text/csv",
        "text/tab-separated-values",
        "text/markdown",
        "text/html",
        "application/rtf",
        "text/rtf",
        "image/jpeg",
        "image/png",
        "application/octet-stream", // browsers send this for unknown extensions
      ]);
      const allowedExtensions = new Set([
        ".pdf", ".docx",
        ".xlsx", ".xls",
        ".csv", ".tsv", ".dsv",
        ".txt", ".md", ".markdown",
        ".rtf",
        ".html", ".htm",
        ".jpg", ".jpeg", ".png",
      ]);

      const fileExt = path.extname(data.filename).toLowerCase();
      const mimeOk = allowedMimeTypes.has(data.mimetype);
      const extOk = allowedExtensions.has(fileExt);

      if (!mimeOk && !extOk) {
        return reply.status(415).send({
          message: `Unsupported file type "${fileExt}" (${data.mimetype}). Allowed: ${[...allowedExtensions].join(", ")}`,
        });
      }

      // Generate unique filename
      const ext = path.extname(data.filename);
      const uniqueName = `${randomUUID()}${ext}`;
      const filePath = path.resolve(UPLOAD_DIR, uniqueName);

      // Save file to disk
      const writeStream = fs.createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        data.file.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        data.file.on("error", reject);
      });

      // Get file size after write
      const stats = fs.statSync(filePath);

      // Save metadata to database
      const documentService = new DocumentService(app.db);
      const document = await documentService.createDocument({
        caseId: caseIdNum,
        fileName: uniqueName,
        originalName: data.filename,
        filePath: filePath,
        fileSize: stats.size,
        mimeType: data.mimetype,
        uploadedBy: user.id,
      });
      const extractionService = new DocumentExtractionService(app.db);
      await extractionService.enqueueSingleDocument(document.id, user.orgId);

      await notificationDelivery.notifyOrganization({
        organizationId: user.orgId,
        type: "case_update",
        category: "caseUpdates",
        title: "Document uploaded",
        message: `"${data.filename}" was uploaded to case #${caseIdNum}.`,
        relatedCaseId: caseIdNum,
      });

      return reply.code(201).send({ document });
    }
  );

  const downloadDocumentHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { user } = request as RequestWithUser;
    const scopedClientId = await getScopedClientIdForUser(app.db, user);
    const { id } = request.params as { id: string };
    const docId = parseInt(id, 10);

    if (isNaN(docId)) {
      return reply.status(400).send({ message: "Invalid document ID" });
    }

    const documentService = new DocumentService(app.db);
    const document = await documentService.getDocumentById(
      docId,
      user.orgId,
      scopedClientId
    );

    if (!fs.existsSync(document.filePath)) {
      return reply.status(404).send({ message: "File not found on disk" });
    }

    reply.header("Content-Disposition", `attachment; filename="${document.originalName}"`);
    reply.header("Content-Type", document.mimeType || "application/octet-stream");
    const stream = fs.createReadStream(document.filePath);
    return reply.send(stream);
  };

  /**
   * GET /api/documents/:id/download
   *
   * - Downloads a specific document.
   * - Streams the file content with appropriate headers.
   */
  fastify.get(
    "/download/:id",
    {
      schema: {
        description: "Download a document",
        tags: ["documents"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    downloadDocumentHandler
  );

  // Canonical download route used by frontend
  fastify.get(
    "/:id/download",
    {
      schema: {
        description: "Download a document",
        tags: ["documents"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    downloadDocumentHandler
  );

  /**
   * DELETE /api/documents/:id
   *
   * - Deletes a document by ID.
   * - Removes both the database record and the file from disk.
   */
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete a document",
        tags: ["documents"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);

      if (isNaN(docId)) {
        return reply.status(400).send({ message: "Invalid document ID" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot delete documents" });
      }

      const documentService = new DocumentService(app.db);
      const document = await documentService.deleteDocument(docId, user.orgId);

      // Delete file from disk if it exists
      if (fs.existsSync(document.filePath)) {
        fs.unlinkSync(document.filePath);
      }

      await notificationDelivery.notifyOrganization({
        organizationId: user.orgId,
        type: "case_update",
        category: "caseUpdates",
        title: "Document deleted",
        message: `"${document.originalName}" was deleted from case #${document.caseId}.`,
        relatedCaseId: document.caseId,
      });

      return reply.code(204).send();
    }
  );

  /**
   * POST /api/documents/:docId/summarize
   *
   * - Generates an AI summary of a specific legal document.
   * - Reads document content from disk and sends to AI service.
   */
  fastify.post(
    "/:docId/summarize",
    {
      schema: {
        description: "Generate AI summary of a document",
        tags: ["documents", "ai"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            docId: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { docId } = request.params as { docId: string };
      const docIdNum = parseInt(docId, 10);

      if (isNaN(docIdNum)) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid docId parameter",
          },
        });
      }

      const documentService = new DocumentService(app.db);
      await documentService.getDocumentById(docIdNum, user.orgId, scopedClientId);

      const extractionService = new DocumentExtractionService(app.db);
      const existingInsights = await extractionService.getDocumentInsightsByDocumentId(
        docIdNum,
        user.orgId
      );
      if (existingInsights.status === "ready" && existingInsights.summary) {
        return reply.send({
          summary: existingInsights.summary,
          keyEntities: [],
          effectiveDate: null,
          clauses: [],
        });
      }

      const freshInsights = await extractionService.generateDocumentInsightsNow(
        docIdNum,
        user.orgId
      );
      if (freshInsights?.status === "ready" && freshInsights.summary) {
        return reply.send({
          summary: freshInsights.summary,
          keyEntities: [],
          effectiveDate: null,
          clauses: [],
        });
      }

      const extractionStatus = await extractionService.getExtractionStatusByDocumentId(
        docIdNum,
        user.orgId
      );
      if (
        extractionStatus.status === "pending" ||
        extractionStatus.status === "processing"
      ) {
        return reply.status(422).send({
          error: {
            code: "EXTRACTION_PENDING",
            message:
              "Document text extraction is still in progress. Please try again shortly.",
          },
        });
      }

      return reply.status(422).send({
        error: {
          code: "EXTRACTION_FAILED",
          message:
            extractionStatus.errorCode ||
            "Could not extract readable text from this document",
          warnings: extractionStatus.warnings || [],
        },
      });
    }
  );

  fastify.get(
    "/:id/insights",
    {
      schema: {
        description: "Get AI case-focused insights for a document",
        tags: ["documents", "ai"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);

      if (isNaN(docId)) {
        return reply.status(400).send({ message: "Invalid document ID" });
      }

      const documentService = new DocumentService(app.db);
      await documentService.getDocumentById(docId, user.orgId, scopedClientId);

      const extractionService = new DocumentExtractionService(app.db);
      const insights = await extractionService.getDocumentInsightsByDocumentId(
        docId,
        user.orgId
      );
      return reply.send({
        documentId: docId,
        ...insights,
      });
    }
  );

  fastify.post(
    "/:id/insights/refresh",
    {
      schema: {
        description: "Queue document insights recomputation",
        tags: ["documents", "ai"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);

      if (isNaN(docId)) {
        return reply.status(400).send({ message: "Invalid document ID" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot refresh insights" });
      }

      const documentService = new DocumentService(app.db);
      await documentService.getDocumentById(docId, user.orgId, scopedClientId);

      const extractionService = new DocumentExtractionService(app.db);
      await extractionService.enqueueDocumentInsights(docId, user.orgId);
      const insights = await extractionService.getDocumentInsightsByDocumentId(
        docId,
        user.orgId
      );

      return reply.code(202).send({
        documentId: docId,
        ...insights,
      });
    }
  );

  /**
   * POST /api/documents/:id/extraction/refresh
   *
   * - Re-queues the document for full text extraction.
   * - Resets the extraction row to pending so the worker re-calls the AI
   *   microservice, replacing any existing extracted_text and chunks.
   * - Use this after fixing extraction logic (e.g. RTL/Arabic bidi fix) to
   *   re-process documents that were extracted before the fix.
   */
  fastify.post(
    "/:id/extraction/refresh",
    {
      schema: {
        description: "Re-queue document for full text re-extraction",
        tags: ["documents", "ai"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);

      if (isNaN(docId)) {
        return reply.status(400).send({ message: "Invalid document ID" });
      }

      if (typeof scopedClientId === "number") {
        return reply.status(403).send({ message: "Client accounts cannot refresh extraction" });
      }

      const documentService = new DocumentService(app.db);
      await documentService.getDocumentById(docId, user.orgId, scopedClientId);

      const extractionService = new DocumentExtractionService(app.db);
      await extractionService.enqueueSingleDocument(docId, user.orgId, { force: true });
      const status = await extractionService.getExtractionStatusByDocumentId(
        docId,
        user.orgId
      );

      return reply.code(202).send({
        documentId: docId,
        message: "Document queued for re-extraction",
        ...status,
      });
    }
  );

  fastify.get(
    "/insights/health",
    {
      schema: {
        description: "Get document insights queue health",
        tags: ["documents", "ai"],
        security: [{ bearerAuth: [] }],
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const extractionService = new DocumentExtractionService(app.db);
      const health = await extractionService.getInsightsQueueHealth(user.orgId);
      return reply.send(health);
    }
  );

  fastify.get(
    "/:id/extraction-status",
    {
      schema: {
        description: "Get extraction status for a document",
        tags: ["documents", "ai"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      } as FastifySchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const scopedClientId = await getScopedClientIdForUser(app.db, user);
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);

      if (isNaN(docId)) {
        return reply.status(400).send({ message: "Invalid document ID" });
      }

      const documentService = new DocumentService(app.db);
      await documentService.getDocumentById(docId, user.orgId, scopedClientId);

      const extractionService = new DocumentExtractionService(app.db);
      const status = await extractionService.getExtractionStatusByDocumentId(
        docId,
        user.orgId
      );

      return reply.send({
        documentId: docId,
        ...status,
      });
    }
  );
};

export default documentsRoutes;
