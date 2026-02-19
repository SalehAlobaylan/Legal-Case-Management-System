import {
  pgTable,
  serial,
  integer,
  timestamp,
  varchar,
  boolean,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const regulationMonitorRuns = pgTable(
  "regulation_monitor_runs",
  {
    id: serial("id").primaryKey(),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at"),
    status: varchar("status", { length: 30 }).notNull(),
    triggerSource: varchar("trigger_source", { length: 50 })
      .default("worker")
      .notNull(),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dryRun: boolean("dry_run").default(false).notNull(),
    scanned: integer("scanned").default(0).notNull(),
    changed: integer("changed").default(0).notNull(),
    versionsCreated: integer("versions_created").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),
    errorMessage: varchar("error_message", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    startedAtIdx: index("reg_monitor_runs_started_at_idx").on(table.startedAt),
    statusIdx: index("reg_monitor_runs_status_idx").on(table.status),
    triggerSourceIdx: index("reg_monitor_runs_trigger_source_idx").on(
      table.triggerSource
    ),
  })
);

export type RegulationMonitorRun = typeof regulationMonitorRuns.$inferSelect;
export type NewRegulationMonitorRun = typeof regulationMonitorRuns.$inferInsert;
