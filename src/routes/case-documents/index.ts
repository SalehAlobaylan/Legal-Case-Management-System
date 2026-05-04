import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import * as path from "path";
import { randomUUID } from "crypto";
import type { Database } from "../../db/connection";
import { DocumentService } from "../../services/document.service";
import { DocumentExtractionService } from "../../services/document-extraction.service";
import { NotificationDeliveryService } from "../../services/notification-delivery.service";
import { getStorageService } from "../../services/storage.service";
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


const caseDocumentsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
  const notificationDelivery = new NotificationDeliveryService(
    app.db,
    app.emitToUser
  );
  app.addHook("onRequest", app.authenticate);

  fastify.get(
    "/:caseId/documents",
    {
      schema: {
        description: "List all documents for a case",
        tags: ["documents"],
        security: [{ bearerAuth: [] }],
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
      const rows = await documentService.getDocumentsByCaseId(
        caseIdNum,
        user.orgId,
        scopedClientId
      );
      const extractionService = new DocumentExtractionService(app.db);
      const extractionMap = await extractionService.getCaseExtractionMap(
        caseIdNum,
        user.orgId
      );

      const documents = rows.map((document) => {
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

      return reply.send({ documents });
    }
  );

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

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ message: "No file uploaded" });
      }

      const ext = path.extname(data.filename);
      const uniqueName = `${randomUUID()}${ext}`;

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      await getStorageService().upload(uniqueName, buffer, data.mimetype);

      const documentService = new DocumentService(app.db);
      const document = await documentService.createDocument({
        caseId: caseIdNum,
        fileName: uniqueName,
        originalName: data.filename,
        filePath: uniqueName,
        fileSize: buffer.length,
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
};

export default caseDocumentsRoutes;
