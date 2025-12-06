// src/server.ts
//
// This file is the **runtime entrypoint** of the backend.
// - It imports `buildApp` from `src/app.ts`, which is the **app factory** that
//   wires all plugins, security middleware, and routes together, but does NOT
//   start listening on any port.
// - Here we create a single Fastify instance via `buildApp()` and call
//   `app.listen(...)` using host/port from the environment.
// - We also handle process-level concerns: logging startup URLs, logging
//   fatal errors, and exiting the process if the server fails to boot.
//
// Keeping `app.ts` (app construction) and `server.ts` (process bootstrap)
// separate makes the app easy to reuse in tests (e.g. `buildApp()` + `app.inject`)
// and in other entrypoints (CLI tools, workers, serverless, etc.).
import { buildApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const start = async () => {
  try {
    const app = buildApp();

    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.info(`Server running on http://${env.HOST}:${env.PORT}`);
    logger.info(
      `Swagger docs available at http://${env.HOST}:${env.PORT}/docs`
    );
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

start();
