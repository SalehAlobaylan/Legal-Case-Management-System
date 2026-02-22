/*
 * Auth route handlers
 *
 * - Contain the concrete Fastify handler functions for the `/api/auth` endpoints.
 * - Use Zod schemas to validate incoming request bodies before passing them to `AuthService`.
 * - Delegate business logic (registration, login, fetching the current user) to `AuthService`
 *   and handle shaping the HTTP responses (status codes and JSON payloads).
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "../../services/auth.service";
import {
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  registerSchema,
  loginSchema,
  updateProfileSchema,
} from "./schemas";
import { createTokenPayload } from "../../utils/jwt";

/*
 * registerHandler
 *
 * - Validates the request body with `registerSchema` (supports dual mode: join/create).
 * - Mode 1 (join): Adds user to existing organization with role "lawyer".
 * - Mode 2 (create): Creates new organization and adds user as "admin".
 * - Calls `AuthService.register` to create a new user and receives a sanitized user object.
 * - Signs a JWT using `createTokenPayload` and returns a `201` response with `{ user, token }`.
 */
export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterInput }>,
  reply: FastifyReply
) {
  const data = registerSchema.parse(request.body);
  const registrationType = data.registrationType ?? "personal";

  const authService = new AuthService(request.server.db);
  const user = await authService.register({
    email: data.email,
    password: data.password,
    fullName: data.fullName,
    role: data.role,
    registrationType,
    organizationId: registrationType === "join" ? data.organizationId : undefined,
    organizationName: registrationType === "create" ? data.organizationName : undefined,
    country: registrationType === "create" ? data.country : undefined,
    subscriptionTier:
      registrationType === "create" || registrationType === "personal"
        ? data.subscriptionTier
        : undefined,
  });

  const token = request.server.jwt.sign(
    createTokenPayload({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    })
  );

  return reply.code(201).send({
    user,
    token,
  });
}

/*
 * loginHandler
 *
 * - Validates the request body with `loginSchema` (email and password).
 * - Calls `AuthService.login` to authenticate the user and update `lastLogin`.
 * - Signs a JWT with the user's identity and role and returns `{ user, token }`.
 */
export async function loginHandler(
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply
) {
  const { email, password } = loginSchema.parse(request.body);

  const authService = new AuthService(request.server.db);
  const user = await authService.login(email, password);

  const token = request.server.jwt.sign(
    createTokenPayload({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    })
  );

  return reply.send({
    user,
    token,
  });
}

/*
 * getMeHandler
 *
 * - Assumes `request.user` has been populated by the JWT auth plugin (via `fastify.authenticate`).
 * - Uses `AuthService.getUserById` to load the current user from the database by `request.user!.id`.
 * - Returns `404` if the user no longer exists, otherwise responds with `{ user }`.
 */
export async function getMeHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authService = new AuthService(request.server.db);
  const user = await authService.getUserById(request.user!.id);

  if (!user) {
    return reply.code(404).send({ error: "User not found" });
  }

  return reply.send({ user });
}

/*
 * updateMeHandler
 *
 * - Validates the request body with `updateProfileSchema`.
 * - Updates the current user's profile information via `AuthService.updateProfile`.
 * - Returns the updated user object.
 */
export async function updateMeHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const data = updateProfileSchema.parse(request.body as UpdateProfileInput);

  const authService = new AuthService(request.server.db);
  const user = await authService.updateProfile(request.user!.id, data);

  if (!user) {
    return reply.code(404).send({ error: "User not found" });
  }

  return reply.send({ user });
}

/*
 * logoutHandler
 *
 * - Handles user logout.
 * - Since JWT is stateless, this just returns success.
 * - The frontend should clear the token from storage.
 */
export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // JWT is stateless, so we just return success
  // The frontend is responsible for clearing the token
  return reply.send({ message: "Logged out successfully" });
}
