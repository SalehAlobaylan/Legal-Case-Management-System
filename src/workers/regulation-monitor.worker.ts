/*
 * DEPRECATED — this entry point has been split into three:
 *   - `combined.worker.ts`             (single-pod mode: scheduler + extraction)
 *   - `scheduler.worker.ts`            (cron-style scheduled jobs only)
 *   - `document-extraction.worker.ts`  (document extraction queue only)
 *
 * For backwards-compat with deploy configs that still invoke
 * `npm run worker:reg-monitor`, this file delegates to the combined worker
 * so existing single-pod deployments keep doing everything they used to.
 * New deployments should use `npm run worker` (combined) or, when scaling
 * out, `worker:scheduler` + `worker:extraction` on separate pods.
 */

import { logger } from "../utils/logger";

logger.warn(
  "worker:reg-monitor is deprecated — use `npm run worker` (combined) or split with worker:scheduler + worker:extraction."
);

// Side-effect import; combined.worker.ts side-effect-imports both loop files.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import "./combined.worker";
