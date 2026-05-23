import type { FastifyReply, FastifyRequest } from "fastify";

type RequestWithUser = FastifyRequest & {
  user: { id: string; email: string; role: string; orgId: number };
};

/*
 * requireAdmin
 *
 * - Gate helper for admin-only routes. Mirrors the pre-existing pattern in
 *   `src/routes/intake/index.ts`. Returns `false` and sends a 403 when the
 *   caller is not an admin; returns `true` otherwise.
 * - Callers use: `if (!requireAdmin(request, reply)) return;`
 */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const { user } = request as RequestWithUser;
  if (user.role !== "admin") {
    reply.status(403).send({ message: "Admin access required" });
    return false;
  }
  return true;
}
