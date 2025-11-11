import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { db } from "../db/connection";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    // Cleanup hook if needed in the future
  });
};

export default fp(databasePlugin, {
  name: "database",
});
