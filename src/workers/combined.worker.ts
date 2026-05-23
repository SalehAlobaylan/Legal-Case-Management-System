/*
 * Combined worker — single-pod deployment mode.
 *
 * Runs BOTH the scheduler (bucket B) and document-extraction (bucket C)
 * loops in one Node process.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  DEPLOYMENT DECISION — READ THIS
 * ─────────────────────────────────────────────────────────────────────────
 *  Document extraction (bucket C) could live on its OWN worker pod, separate
 *  from the scheduler (bucket B). The plumbing for that split is already in
 *  place:
 *
 *    - `scheduler.worker.ts`            ← cron-style scheduled jobs only
 *    - `document-extraction.worker.ts`  ← extraction queue only
 *    - `Dockerfile.extraction-worker`   ← image for the extraction pod
 *    - `npm run worker:scheduler` / `npm run worker:extraction`
 *
 *  We chose to run them as ONE worker (this file) instead, for now, because:
 *    1. Current load is small — extraction throughput doesn't yet justify a
 *       dedicated pod.
 *    2. One pod is cheaper on DigitalOcean (~$5-7/mo saved).
 *    3. Both loops are I/O-bound (AI service + Postgres), not CPU-bound, so
 *       they coexist in one process without contention.
 *    4. They share a single DB connection pool, which is fine.
 *
 *  WHEN TO SPLIT INTO TWO WORKERS:
 *    - Document uploads per day grow such that the extraction queue starts
 *      backing up (rows sitting `pending` for minutes).
 *    - You want to scale extraction horizontally (run 2+ pods); the code
 *      already supports this — `runPendingExtractions` uses
 *      `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent extraction pods
 *      grab disjoint row sets without racing.
 *    - You want extraction failures to NOT take the scheduler down (or vice
 *      versa).
 *
 *  HOW TO SPLIT (when that day comes):
 *    1. In `Dockerfile.worker`, change CMD to
 *       `["node", "dist/workers/scheduler.worker.js"]`
 *    2. Add a second worker component to your DigitalOcean app spec
 *       using `Dockerfile.extraction-worker` (CMD already correct).
 *    3. Scale the extraction component to N instances when needed; the
 *       scheduler stays at 1 (it holds a `pg_advisory_lock`).
 *    4. No code changes required — both entry points already exist and have
 *       been tested.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Implementation: side-effect imports of the two entry-point files. Each of
 * those files has its own top-level `main().catch(...)` call, so importing
 * them here is enough to start both loops. Their individual SIGINT/SIGTERM
 * handlers compose correctly (Node fires every registered handler).
 */

import { logger } from "../utils/logger";

logger.info("Combined worker starting — scheduler + document-extraction loops");

// Order doesn't matter — both start independently and run forever.
// eslint-disable-next-line import/first
import "./scheduler.worker";
// eslint-disable-next-line import/first
import "./document-extraction.worker";
