/*
 * Auth routes plugin
 *
 * - Registers the HTTP endpoints under the `/api/auth` prefix (when mounted in `app.ts`).
 * - Exposes four main routes: user registration (`POST /register`), login (`POST /login`),
 *   fetching the currently authenticated user (`GET /me`), and updating the user profile (`PATCH /me`).
 * - Supports dual-mode registration: joining existing organizations or creating new ones.
 * - Attaches OpenAPI/Swagger metadata for request/response schemas and security so that
 *   the API is documented in the Swagger UI.
 */

import { FastifyPluginAsync } from "fastify";
import { registerHandler, loginHandler, getMeHandler, updateMeHandler, logoutHandler } from "./handlers";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const userResponseSchema = {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
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
  // - Creates a new user account with multiple modes:
  //   - "personal": Creates a personal workspace automatically (default)
  //   - "join": Add to existing organization (default role: lawyer)
  //   - "create": Create new organization (default role: admin)
  // - Returns a JWT plus the sanitized user object.
  fastify.post(
    "/register",
    {
      schema: {
        description: "Register a new user (dual-mode: join or create organization)",
        tags: ["auth"],
        body: {
          oneOf: [
            {
              type: "object",
              required: ["email", "password", "confirmPassword", "fullName"],
              properties: {
                registrationType: { const: "personal" },
                email: { type: "string", format: "email" },
                password: { type: "string", minLength: 4 },
                confirmPassword: { type: "string" },
                fullName: { type: "string", minLength: 2 },
                role: {
                  type: "string",
                  enum: ["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"],
                },
              },
            },
            {
              type: "object",
              required: ["registrationType", "email", "password", "confirmPassword", "fullName", "organizationId"],
              properties: {
                registrationType: { const: "join" },
                email: { type: "string", format: "email" },
                password: { type: "string", minLength: 4 },
                confirmPassword: { type: "string" },
                fullName: { type: "string", minLength: 2 },
                organizationId: { type: "number" },
                role: {
                  type: "string",
                  enum: ["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"],
                },
              },
            },
            {
              type: "object",
              required: ["registrationType", "email", "password", "confirmPassword", "fullName", "organizationName"],
              properties: {
                registrationType: { const: "create" },
                email: { type: "string", format: "email" },
                password: { type: "string", minLength: 4 },
                confirmPassword: { type: "string" },
                fullName: { type: "string", minLength: 2 },
                organizationName: { type: "string", minLength: 2 },
                country: { type: "string", minLength: 2, maxLength: 2 },
                subscriptionTier: { type: "string" },
                role: {
                  type: "string",
                  enum: ["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"],
                },
              },
            },
          ],
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

  // PATCH /api/auth/me
  // - Updates the currently authenticated user's profile information.
  fastify.patch(
    "/me",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Update current user profile",
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            fullName: { type: "string", minLength: 2 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user: userResponseSchema,
            },
          },
        },
      },
    },
    updateMeHandler
  );

  // POST /api/auth/logout
  // - Logout endpoint (JWT is stateless, so this just confirms logout)
  fastify.post(
    "/logout",
    {
      schema: {
        description: "Logout user",
        tags: ["auth"],
      },
    },
    logoutHandler
  );
};

export default authRoutes;
