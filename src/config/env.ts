import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("7d"),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  AI_SERVICE_URL: z.string().url().optional(),

  REG_MONITOR_ENABLED: z.coerce.boolean().default(true),
  REG_MONITOR_POLL_SECONDS: z.coerce.number().int().min(5).default(60),
  REG_MONITOR_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  REG_MONITOR_FAILURE_RETRY_MINUTES: z.coerce.number().int().min(1).default(30),
  CASE_DOC_EXTRACTION_ENABLED: z.coerce.boolean().default(true),
  CASE_DOC_EXTRACTION_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  CASE_DOC_EXTRACTION_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  CASE_DOC_EXTRACTION_RETRY_MINUTES: z.coerce.number().int().min(1).default(20),
  CASE_DOC_INSIGHTS_ENABLED: z.coerce.boolean().default(true),
  CASE_DOC_INSIGHTS_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  CASE_DOC_INSIGHTS_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  CASE_DOC_INSIGHTS_RETRY_MINUTES: z.coerce.number().int().min(1).default(20),
  CASE_DOC_INSIGHTS_MAX_SOURCE_CHARS: z.coerce.number().int().min(500).default(15000),
  CASE_DOC_INSIGHTS_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  CASE_LINK_DOC_MAX_INCLUDED: z.coerce.number().int().min(0).max(50).default(5),
  CASE_LINK_DOC_MAX_CHARS_PER_DOC: z.coerce.number().int().min(200).default(4000),
  CASE_LINK_DOC_TOTAL_MAX_CHARS: z.coerce.number().int().min(500).default(12000),

  CORS_ORIGIN: z.string().default("*"),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().default("http://localhost:3000/api/auth/google/callback"),
  FRONTEND_URL: z.string().url().default("http://localhost:3001"),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
