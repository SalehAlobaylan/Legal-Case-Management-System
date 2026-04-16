// src/app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import path from "path";
import { env } from "./config/env";

// Plugins
import databasePlugin from "./plugins/database";
import authPlugin from "./plugins/auth";
import swaggerPlugin from "./plugins/swagger";
import errorHandlerPlugin from "./plugins/error-handler";
import websocketPlugin from "./plugins/websocket";

import authRoutes from "./routes/auth";
import oauthRoutes from "./routes/oauth";
import organizationsRoutes from "./routes/organizations";
import casesRoutes from "./routes/cases";
import regulationsRoutes from "./routes/regulations";
import aiLinksRoutes from "./routes/ai-links";
import dashboardRoutes from "./routes/dashboard";
import documentsRoutes from "./routes/documents";
import clientsRoutes from "./routes/clients";
import notificationsRoutes from "./routes/notifications";
import profileRoutes from "./routes/profile";
import settingsRoutes from "./routes/settings";
import usersRoutes from "./routes/users";
import billingRoutes from "./routes/billing";
import aiRoutes from "./routes/ai";
import aiEvaluationRoutes from "./routes/ai-evaluation";
import caseDocumentsRoutes from "./routes/case-documents";
import searchRoutes from "./routes/search";
import intakeRoutes from "./routes/intake";
import publicIntakeRoutes from "./routes/public-intake";
import automationsRoutes from "./routes/automations";
import { AutomationEngineService } from "./services/automation-engine.service";
import webhooksRoutes from "./routes/webhooks";
import { MessagingRetryService } from "./services/messaging-retry.service";

export function buildApp(opts = {}) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
    ...opts,
  });

  // Security plugins
  app.register(helmet);
  app.register(cors, {
    origin: env.CORS_ORIGIN.split(","),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  // JWT
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  // Multipart for file uploads
  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
  });

  app.register(staticPlugin, {
    root: path.resolve(process.env.UPLOAD_DIR || "./uploads"),
    prefix: "/uploads/",
  });

  // Core plugins
  app.register(databasePlugin);
  let automationEngine: AutomationEngineService | null = null;
  let messagingRetry: MessagingRetryService | null = null;
  app.addHook("onReady", async () => {
    automationEngine = new AutomationEngineService((app as any).db);
    automationEngine.start();
    messagingRetry = new MessagingRetryService((app as any).db);
    messagingRetry.start();
  });
  app.addHook("onClose", async () => {
    automationEngine?.stop();
    messagingRetry?.stop();
  });
  app.register(authPlugin);
  app.register(errorHandlerPlugin);
  app.register(swaggerPlugin);
  app.register(websocketPlugin);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date() }));

  // API Routes
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(oauthRoutes, { prefix: "/api/auth" });
  app.register(organizationsRoutes, { prefix: "/api/organizations" });
  app.register(casesRoutes, { prefix: "/api/cases" });
  app.register(caseDocumentsRoutes, { prefix: "/api/cases" });
  app.register(regulationsRoutes, { prefix: "/api/regulations" });
  app.register(aiLinksRoutes, { prefix: "/api/ai-links" });
  app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app.register(documentsRoutes, { prefix: "/api/documents" });
  app.register(clientsRoutes, { prefix: "/api/clients" });
  app.register(notificationsRoutes, { prefix: "/api/notifications" });
  app.register(notificationsRoutes, { prefix: "/api/alerts" }); // Alias for frontend compatibility
  app.register(profileRoutes, { prefix: "/api/profile" });
  app.register(settingsRoutes, { prefix: "/api/settings" });
  app.register(usersRoutes, { prefix: "/api/users/me" });
  app.register(billingRoutes, { prefix: "/api/billing" });
  app.register(aiRoutes, { prefix: "/api/ai" });
  app.register(aiEvaluationRoutes, { prefix: "/api/ai-evaluation" });
  app.register(searchRoutes, { prefix: "/api/search" });
  app.register(intakeRoutes, { prefix: "/api/intake-forms" });
  app.register(publicIntakeRoutes, { prefix: "/api/public/intake" });
  app.register(automationsRoutes, { prefix: "/api/automations" });
  app.register(webhooksRoutes, { prefix: "/api/webhooks" });

  return app;
}
