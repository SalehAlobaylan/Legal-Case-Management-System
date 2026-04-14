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
  REG_SOURCE_SYNC_ENABLED: z.coerce.boolean().default(true),
  REG_SOURCE_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(360),
  REG_SOURCE_MOJ_LISTING_URL: z
    .string()
    .url()
    .default(
      "https://laws.moj.gov.sa/ar/legislations-regulations?pageNumber=1&pageSize=9&sortingBy=7"
    ),
  REG_SOURCE_MOJ_MAX_PAGES: z.coerce.number().int().min(1).max(100).default(100),
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
  REG_INSIGHTS_ENABLED: z.coerce.boolean().default(true),
  REG_INSIGHTS_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  REG_INSIGHTS_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  REG_INSIGHTS_RETRY_MINUTES: z.coerce.number().int().min(1).default(20),
  REG_IMPACT_ENABLED: z.coerce.boolean().default(true),
  REG_IMPACT_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  REG_IMPACT_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  REG_IMPACT_RETRY_MINUTES: z.coerce.number().int().min(1).default(20),
  CASE_DOC_RAG_CHUNK_CHARS: z.coerce.number().int().min(200).default(1200),
  CASE_DOC_RAG_CHUNK_OVERLAP_CHARS: z.coerce.number().int().min(0).default(180),
  CASE_DOC_RAG_MAX_CHUNKS: z.coerce.number().int().min(1).max(2000).default(200),
  CASE_LINK_DOC_MAX_INCLUDED: z.coerce.number().int().min(0).max(50).default(5),
  CASE_LINK_DOC_MAX_CHARS_PER_DOC: z.coerce.number().int().min(200).default(4000),
  CASE_LINK_DOC_TOTAL_MAX_CHARS: z.coerce.number().int().min(500).default(12000),
  CASE_LINK_TOP_K_FINAL: z.coerce.number().int().min(1).max(20).default(5),
  CASE_LINK_SUPPORT_FLOOR: z.coerce.number().min(0).max(1).default(0.3),
  CASE_LINK_STRICT_MODE: z.coerce.boolean().default(true),
  CASE_LINK_WEIGHT_SEMANTIC: z.coerce.number().min(0).max(1).default(0.55),
  CASE_LINK_WEIGHT_SUPPORT: z.coerce.number().min(0).max(1).default(0.2),
  CASE_LINK_WEIGHT_LEXICAL: z.coerce.number().min(0).max(1).default(0.15),
  CASE_LINK_WEIGHT_CATEGORY: z.coerce.number().min(0).max(1).default(0.1),
  CASE_LINK_MIN_FINAL_SCORE: z.coerce.number().min(0).max(1).default(0.45),
  CASE_LINK_MIN_SUPPORTING_MATCHES: z.coerce.number().int().min(1).max(10).default(1),
  CASE_LINK_MIN_PAIR_SCORE: z.coerce.number().min(0).max(1).default(0.40),
  CASE_LINK_REQUIRE_CASE_SUPPORT: z.coerce.boolean().default(true),
  REG_LINK_PREFILTER_TOP_K: z.coerce.number().int().min(10).max(1000).default(250),
  REG_LINK_CANDIDATE_CHUNKS_PER_REG: z.coerce.number().int().min(1).max(10).default(4),
  REG_LINK_CHUNK_CHARS: z.coerce.number().int().min(200).default(1200),
  REG_LINK_MAX_CHUNKS: z.coerce.number().int().min(1).max(5000).default(400),

  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(60000),

  CORS_ORIGIN: z.string().default("*"),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().default("http://localhost:3000/api/auth/google/callback"),
  FRONTEND_URL: z.string().url().default("http://localhost:3001"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),

  WEBHOOK_SHARED_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
