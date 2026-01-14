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
import type { Database } from "../../db/connection";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

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
};

// Configure upload directory (can be overridden via env)
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const documentsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;

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
      const { caseId } = request.params as { caseId: string };
      const caseIdNum = parseInt(caseId, 10);

      if (isNaN(caseIdNum)) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      const documentService = new DocumentService(app.db);
      const documents = await documentService.getDocumentsByCaseId(caseIdNum, user.orgId);

      return reply.send({ documents });
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
      const { caseId } = request.params as { caseId: string };
      const caseIdNum = parseInt(caseId, 10);

      if (isNaN(caseIdNum)) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      // Parse multipart data
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({ message: "No file uploaded" });
      }

      // Generate unique filename
      const ext = path.extname(data.filename);
      const uniqueName = `${randomUUID()}${ext}`;
      const filePath = path.join(UPLOAD_DIR, uniqueName);

      // Save file to disk
      const writeStream = fs.createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        data.file.pipe(writeStream);
        data.file.on("end", resolve);
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

      return reply.code(201).send({ document });
    }
  );

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
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { user } = request as RequestWithUser;
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);

      if (isNaN(docId)) {
        return reply.status(400).send({ message: "Invalid document ID" });
      }

      const documentService = new DocumentService(app.db);
      const document = await documentService.getDocumentById(docId, user.orgId);

      // Check if file exists
      if (!fs.existsSync(document.filePath)) {
        return reply.status(404).send({ message: "File not found on disk" });
      }

      // Set headers for download
      reply.header("Content-Disposition", `attachment; filename="${document.originalName}"`);
      reply.header("Content-Type", document.mimeType || "application/octet-stream");

      // Stream the file
      const stream = fs.createReadStream(document.filePath);
      return reply.send(stream);
    }
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
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);

      if (isNaN(docId)) {
        return reply.status(400).send({ message: "Invalid document ID" });
      }

      const documentService = new DocumentService(app.db);
      const document = await documentService.deleteDocument(docId, user.orgId);

      // Delete file from disk if it exists
      if (fs.existsSync(document.filePath)) {
        fs.unlinkSync(document.filePath);
      }

      return reply.code(204).send();
    }
  );
};

export default documentsRoutes;
