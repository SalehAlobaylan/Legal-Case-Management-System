// src/app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { env } from "./config/env";

// Plugins
import databasePlugin from "./plugins/database";
import authPlugin from "./plugins/auth";
import swaggerPlugin from "./plugins/swagger";
import errorHandlerPlugin from "./plugins/error-handler";
import websocketPlugin from "./plugins/websocket";

import authRoutes from "./routes/auth";
import casesRoutes from "./routes/cases";
import regulationsRoutes from "./routes/regulations";
import aiLinksRoutes from "./routes/ai-links";
import dashboardRoutes from "./routes/dashboard";
import documentsRoutes from "./routes/documents";
import clientsRoutes from "./routes/clients";
import notificationsRoutes from "./routes/notifications";
import profileRoutes from "./routes/profile";
import settingsRoutes from "./routes/settings";

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

  // Core plugins
  app.register(databasePlugin);
  app.register(authPlugin);
  app.register(errorHandlerPlugin);
  app.register(swaggerPlugin);
  app.register(websocketPlugin);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date() }));

  // API Routes
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(casesRoutes, { prefix: "/api/cases" });
  app.register(regulationsRoutes, { prefix: "/api/regulations" });
  app.register(aiLinksRoutes, { prefix: "/api/ai-links" });
  app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app.register(documentsRoutes, { prefix: "/api/documents" });
  app.register(clientsRoutes, { prefix: "/api/clients" });
  app.register(notificationsRoutes, { prefix: "/api/notifications" });
  app.register(notificationsRoutes, { prefix: "/api/alerts" }); // Alias for frontend compatibility
  app.register(profileRoutes, { prefix: "/api/profile" });
  app.register(settingsRoutes, { prefix: "/api/settings" });

  return app;
}


