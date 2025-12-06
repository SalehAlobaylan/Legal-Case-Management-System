// src/app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env";

// Plugins
import databasePlugin from "./plugins/database";
import authPlugin from "./plugins/auth";
import swaggerPlugin from "./plugins/swagger";
import errorHandlerPlugin from "./plugins/error-handler";
import websocketPlugin from "./plugins/websocket";

// Routes
import authRoutes from "./routes/auth";
import casesRoutes from "./routes/cases";
import regulationsRoutes from "./routes/regulations";
import aiLinksRoutes from "./routes/ai-links";

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

  return app;
}
