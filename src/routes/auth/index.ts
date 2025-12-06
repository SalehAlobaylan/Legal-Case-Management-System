/*
 * Auth routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/auth` prefix (when mounted in `app.ts`).
 * - Exposes three main routes: user registration (`POST /register`), login (`POST /login`),
 *   and fetching the currently authenticated user (`GET /me`).
 * - Attaches OpenAPI/Swagger metadata for request/response schemas and security so that
 *   the API is documented in the Swagger UI.
 */

import { FastifyPluginAsync } from "fastify";
import { registerHandler, loginHandler, getMeHandler } from "./handlers";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const userResponseSchema = {
    type: "object",
    properties: {
      id: { type: "number" },
      email: { type: "string", format: "email" },
      fullName: { type: "string" },
      organizationId: { type: "number" },
      role: {
        type: "string",
        enum: ["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"],
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  } as const;

  // POST /api/auth/register
  // - Creates a new user account and returns a JWT plus the sanitized user object.
  fastify.post(
    "/register",
    {
      schema: {
        description: "Register a new user",
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password", "fullName", "organizationId"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            fullName: { type: "string", minLength: 2 },
            organizationId: { type: "number" },
            role: {
              type: "string",
              enum: ["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"],
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              user: userResponseSchema,
              token: { type: "string" },
            },
          },
        },
      },
    },
    registerHandler
  );

  // POST /api/auth/login
  // - Authenticates an existing user and returns a fresh JWT plus the sanitized user object.
  fastify.post(
    "/login",
    {
      schema: {
        description: "Login user",
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user: userResponseSchema,
              token: { type: "string" },
            },
          },
        },
      },
    },
    loginHandler
  );

  // GET /api/auth/me
  // - Requires a valid Bearer token; returns the currently authenticated user's data.
  fastify.get(
    "/me",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Get current user",
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
      },
    },
    getMeHandler
  );
};

export default authRoutes;
