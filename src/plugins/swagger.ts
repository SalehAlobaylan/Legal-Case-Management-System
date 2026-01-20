import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { env } from "../config/env";

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "Legal Case Management API",
        description:
          "AI-powered case management system for Saudi legal practitioners",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://${env.HOST}:${env.PORT}`,
          description: "Development server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "cases", description: "Case management" },
        { name: "regulations", description: "Regulation management" },
        { name: "ai-links", description: "AI-powered case-regulation linking" },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });
};

export default fp(swaggerPlugin, {
  name: "swagger",
});

