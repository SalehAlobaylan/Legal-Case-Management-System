import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
} from "fastify";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import type { Database } from "../../db/connection";
import { DocumentService } from "../../services/document.service";
import { DocumentExtractionService } from "../../services/document-extraction.service";

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

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const caseDocumentsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify as AuthenticatedFastifyInstance;
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
      const { caseId } = request.params as { caseId: string };
      const caseIdNum = parseInt(caseId, 10);
      if (isNaN(caseIdNum)) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      const documentService = new DocumentService(app.db);
      const rows = await documentService.getDocumentsByCaseId(caseIdNum, user.orgId);
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
      const { caseId } = request.params as { caseId: string };
      const caseIdNum = parseInt(caseId, 10);
      if (isNaN(caseIdNum)) {
        return reply.status(400).send({ message: "Invalid caseId parameter" });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ message: "No file uploaded" });
      }

      const ext = path.extname(data.filename);
      const uniqueName = `${randomUUID()}${ext}`;
      const filePath = path.join(UPLOAD_DIR, uniqueName);
      const writeStream = fs.createWriteStream(filePath);

      await new Promise<void>((resolve, reject) => {
        data.file.pipe(writeStream);
        data.file.on("end", resolve);
        data.file.on("error", reject);
      });

      const stats = fs.statSync(filePath);
      const documentService = new DocumentService(app.db);
      const document = await documentService.createDocument({
        caseId: caseIdNum,
        fileName: uniqueName,
        originalName: data.filename,
        filePath,
        fileSize: stats.size,
        mimeType: data.mimetype,
        uploadedBy: user.id,
      });

      const extractionService = new DocumentExtractionService(app.db);
      await extractionService.enqueueSingleDocument(document.id, user.orgId);

      return reply.code(201).send({ document });
    }
  );
};

export default caseDocumentsRoutes;
