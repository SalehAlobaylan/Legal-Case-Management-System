import { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { UnauthorizedError } from "../utils/errors";
import "@fastify/jwt";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      id: number;
      email: string;
      role: string;
      orgId: number;
    };
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("authenticate", async function (request: FastifyRequest) {
    try {
      await request.jwtVerify();
      // request.user is set by fastify-jwt when verification succeeds
    } catch (err) {
      throw new UnauthorizedError("Invalid or expired token");
    }
  });
};

export default fp(authPlugin, {
  name: "auth",
  dependencies: ["jwt"],
});
