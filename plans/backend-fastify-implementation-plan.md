# Backend Implementation Plan - Fastify

## Legal Case Management System

> **Target Framework**: Fastify with TypeScript  
> **Database**: PostgreSQL with pgvector extension  
> **ORM**: Drizzle ORM  
> **Authentication**: JWT (@fastify/jwt)  
> **Real-time**: WebSocket (Socket.IO or @fastify/websocket)  
> **Documentation**: OpenAPI/Swagger (@fastify/swagger)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Phase 1: Foundation Setup](#phase-1-foundation-setup)
5. [Phase 2: Database Layer](#phase-2-database-layer)
6. [Phase 3: Authentication & Authorization](#phase-3-authentication--authorization)
7. [Phase 4: Case Management](#phase-4-case-management)
8. [Phase 5: Regulation Management](#phase-5-regulation-management)
9. [Phase 6: AI Integration Layer](#phase-6-ai-integration-layer)
10. [Phase 7: Real-time Updates](#phase-7-real-time-updates)
11. [Phase 8: Search & Discovery](#phase-8-search--discovery)
12. [Phase 9: Testing & Quality](#phase-9-testing--quality)
13. [Phase 10: Deployment](#phase-10-deployment)

---

## Project Overview

### Core Features

- ✅ User authentication and authorization (JWT-based)
- ✅ Case CRUD operations with full metadata
- ✅ Regulation management with versioning
- ✅ AI-powered case-regulation linking via external microservice
- ✅ Real-time notifications for updates
- ✅ Search capabilities (keyword + semantic)
- ✅ Multi-tenant support (organization-based)
- ✅ Document attachment handling

### Key Principles

- **Type Safety**: Full TypeScript coverage
- **Performance**: Fastify for speed, optimized queries
- **Modularity**: Plugin-based architecture
- **Security**: JWT, validation, sanitization
- **Scalability**: Stateless design, Redis caching

---

## Tech Stack

### Core Dependencies

```json
{
  "dependencies": {
    "fastify": "^5.6.1",
    "@fastify/cors": "^11.1.0",
    "@fastify/jwt": "^10.0.0",
    "@fastify/swagger": "^9.5.2",
    "@fastify/swagger-ui": "^5.2.1",
    "@fastify/websocket": "^11.1.0",
    "@fastify/rate-limit": "^10.2.0",
    "@fastify/helmet": "^12.0.1",
    "drizzle-orm": "^0.36.4",
    "postgres": "^3.4.5",
    "drizzle-kit": "^0.28.1",
    "zod": "^3.24.1",
    "bcrypt": "^5.1.1",
    "nanoid": "^5.0.9",
    "ioredis": "^5.4.2",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "@types/node": "^24.9.2",
    "@types/bcrypt": "^5.0.2",
    "typescript": "^5.9.3",
    "tsx": "^4.20.6",
    "@types/ws": "^8.5.13",
    "vitest": "^3.0.0",
    "@vitest/ui": "^3.0.0"
  }
}
```

---

## Project Structure

```
src/
├── app.ts                      # Fastify app factory
├── server.ts                   # Server startup & lifecycle
├── config/
│   ├── env.ts                  # Environment variables validation
│   └── constants.ts            # App-wide constants
├── db/
│   ├── connection.ts           # Database connection pool
│   ├── schema/                 # Drizzle schema definitions
│   │   ├── users.ts
│   │   ├── organizations.ts
│   │   ├── cases.ts
│   │   ├── regulations.ts
│   │   ├── regulation-versions.ts
│   │   ├── case-regulation-links.ts
│   │   └── index.ts
│   ├── migrations/             # Drizzle migrations
│   └── seed.ts                 # Seed data for development
├── plugins/
│   ├── auth.ts                 # JWT authentication plugin
│   ├── database.ts             # Database plugin
│   ├── swagger.ts              # OpenAPI documentation
│   ├── rate-limit.ts           # Rate limiting
│   ├── websocket.ts            # WebSocket plugin
│   └── error-handler.ts        # Global error handling
├── routes/
│   ├── auth/
│   │   ├── index.ts            # Auth routes registry
│   │   ├── handlers.ts         # Route handlers
│   │   ├── schemas.ts          # Zod validation schemas
│   │   └── types.ts            # TypeScript types
│   ├── cases/
│   │   ├── index.ts
│   │   ├── handlers.ts
│   │   ├── schemas.ts
│   │   └── types.ts
│   ├── regulations/
│   │   ├── index.ts
│   │   ├── handlers.ts
│   │   ├── schemas.ts
│   │   └── types.ts
│   ├── ai-links/
│   │   ├── index.ts
│   │   ├── handlers.ts
│   │   └── schemas.ts
│   └── health.ts               # Health check endpoint
├── services/
│   ├── auth.service.ts         # Authentication logic
│   ├── case.service.ts         # Case business logic
│   ├── regulation.service.ts   # Regulation business logic
│   ├── ai-client.service.ts    # AI microservice client
│   └── cache.service.ts        # Redis caching
├── lib/
│   ├── logger.ts               # Pino logger instance
│   ├── redis.ts                # Redis client
│   └── validators.ts           # Custom validators
├── types/
│   ├── index.ts                # Shared types
│   ├── fastify.d.ts            # Fastify type extensions
│   └── models.ts               # Data models
└── utils/
    ├── hash.ts                 # Password hashing
    ├── jwt.ts                  # JWT helpers
    └── errors.ts               # Custom error classes
```

---

## Phase 1: Foundation Setup

### Step 1.1: Initialize Project

**Goal**: Set up the basic project structure and dependencies.

```bash
# Already done, but for reference:
npm init -y
npm install fastify @fastify/cors @fastify/jwt @fastify/swagger
npm install -D typescript @types/node tsx
npx tsc --init
```

**Tasks**:

- ✅ Configure `tsconfig.json` for strict TypeScript
- ✅ Set up `.env` file structure
- ✅ Create `.gitignore` (already exists)
- ✅ Initialize basic folder structure

**Files to Create**:

**`tsconfig.json`** (update):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**`.env.example`**:

```env
# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/legal_cms

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# AI Service
AI_SERVICE_URL=http://localhost:8000

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
```

**`package.json`** scripts (update):

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/db/seed.ts",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "lint": "tsc --noEmit"
  }
}
```

### Step 1.2: Environment Configuration

**File**: `src/config/env.ts`

```typescript
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  AI_SERVICE_URL: z.string().url(),

  CORS_ORIGIN: z.string().default("*"),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
```

### Step 1.3: Logger Setup

**File**: `src/lib/logger.ts`

```typescript
import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});
```

### Step 1.4: Custom Error Classes

**File**: `src/utils/errors.ts`

```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}
```

---

## Phase 2: Database Layer

### Step 2.1: Install Drizzle & PostgreSQL Driver

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

### Step 2.2: Drizzle Configuration

**File**: `drizzle.config.ts` (root)

```typescript
import type { Config } from "drizzle-kit";
import { env } from "./src/config/env";

export default {
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

### Step 2.3: Database Connection

**File**: `src/db/connection.ts`

```typescript
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
```

### Step 2.4: Database Schema Definitions

**File**: `src/db/schema/organizations.ts`

```typescript
import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  licenseNumber: varchar("license_number", { length: 100 }).unique(),
  contactInfo: varchar("contact_info", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
```

**File**: `src/db/schema/users.ts`

```typescript
import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export const userRoleEnum = [
  "admin",
  "senior_lawyer",
  "lawyer",
  "paralegal",
  "clerk",
] as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }),
  role: varchar("role", { length: 50 })
    .$type<(typeof userRoleEnum)[number]>()
    .default("lawyer")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof userRoleEnum)[number];
```

**File**: `src/db/schema/cases.ts`

```typescript
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const caseTypeEnum = [
  "criminal",
  "civil",
  "commercial",
  "labor",
  "family",
  "administrative",
] as const;
export const caseStatusEnum = [
  "open",
  "in_progress",
  "pending_hearing",
  "closed",
  "archived",
] as const;

export const cases = pgTable(
  "cases",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    caseNumber: varchar("case_number", { length: 100 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    caseType: varchar("case_type", { length: 100 })
      .$type<(typeof caseTypeEnum)[number]>()
      .notNull(),
    status: varchar("status", { length: 50 })
      .$type<(typeof caseStatusEnum)[number]>()
      .default("open")
      .notNull(),
    clientInfo: text("client_info"), // JSON string
    assignedLawyerId: integer("assigned_lawyer_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Search and AI fields (we'll add these later with pgvector)
    // searchVector: tsvector('search_vector'),
    // embedding: vector('embedding', { dimensions: 384 }),

    courtJurisdiction: varchar("court_jurisdiction", { length: 255 }),
    filingDate: date("filing_date"),
    nextHearing: timestamp("next_hearing"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgCaseNumberIdx: index("cases_org_case_number_idx").on(
      table.organizationId,
      table.caseNumber
    ),
    assignedLawyerIdx: index("cases_assigned_lawyer_idx").on(
      table.assignedLawyerId
    ),
    statusIdx: index("cases_status_idx").on(table.status),
  })
);

export const casesRelations = relations(cases, ({ one }) => ({
  organization: one(organizations, {
    fields: [cases.organizationId],
    references: [organizations.id],
  }),
  assignedLawyer: one(users, {
    fields: [cases.assignedLawyerId],
    references: [users.id],
  }),
}));

export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type CaseType = (typeof caseTypeEnum)[number];
export type CaseStatus = (typeof caseStatusEnum)[number];
```

**File**: `src/db/schema/regulations.ts`

```typescript
import {
  pgTable,
  serial,
  varchar,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const regulationCategoryEnum = [
  "criminal_law",
  "civil_law",
  "commercial_law",
  "labor_law",
  "procedural_law",
] as const;
export const regulationStatusEnum = [
  "active",
  "amended",
  "repealed",
  "draft",
] as const;

export const regulations = pgTable(
  "regulations",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    regulationNumber: varchar("regulation_number", { length: 100 }),
    sourceUrl: text("source_url"),
    category: varchar("category", { length: 100 }).$type<
      (typeof regulationCategoryEnum)[number]
    >(),
    jurisdiction: varchar("jurisdiction", { length: 255 }),
    status: varchar("status", { length: 50 })
      .$type<(typeof regulationStatusEnum)[number]>()
      .default("active")
      .notNull(),

    // Search and AI fields
    // searchVector: tsvector('search_vector'),
    // embedding: vector('embedding', { dimensions: 384 }),

    effectiveDate: date("effective_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index("regulations_category_idx").on(table.category),
    statusIdx: index("regulations_status_idx").on(table.status),
  })
);

export type Regulation = typeof regulations.$inferSelect;
export type NewRegulation = typeof regulations.$inferInsert;
export type RegulationCategory = (typeof regulationCategoryEnum)[number];
export type RegulationStatus = (typeof regulationStatusEnum)[number];
```

**File**: `src/db/schema/regulation-versions.ts`

```typescript
import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { regulations } from "./regulations";

export const regulationVersions = pgTable(
  "regulation_versions",
  {
    id: serial("id").primaryKey(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    versionNumber: integer("version_number").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(), // SHA-256

    rawHtml: text("raw_html"),
    artifactUri: varchar("artifact_uri", { length: 500 }), // MinIO path

    changesSummary: text("changes_summary"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    createdBy: varchar("created_by", { length: 50 })
      .default("system")
      .notNull(),
  },
  (table) => ({
    regVersionIdx: uniqueIndex("regulation_versions_reg_version_idx").on(
      table.regulationId,
      table.versionNumber
    ),
  })
);

export const regulationVersionsRelations = relations(
  regulationVersions,
  ({ one }) => ({
    regulation: one(regulations, {
      fields: [regulationVersions.regulationId],
      references: [regulations.id],
    }),
  })
);

export type RegulationVersion = typeof regulationVersions.$inferSelect;
export type NewRegulationVersion = typeof regulationVersions.$inferInsert;
```

**File**: `src/db/schema/case-regulation-links.ts`

```typescript
import {
  pgTable,
  serial,
  integer,
  decimal,
  boolean,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cases } from "./cases";
import { regulations } from "./regulations";
import { users } from "./users";

export const linkMethodEnum = ["ai", "manual", "hybrid"] as const;

export const caseRegulationLinks = pgTable(
  "case_regulation_links",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .references(() => cases.id, { onDelete: "cascade" })
      .notNull(),
    regulationId: integer("regulation_id")
      .references(() => regulations.id, { onDelete: "cascade" })
      .notNull(),
    similarityScore: decimal("similarity_score", { precision: 5, scale: 4 }),
    method: varchar("method", { length: 20 })
      .$type<(typeof linkMethodEnum)[number]>()
      .default("ai")
      .notNull(),

    verified: boolean("verified").default(false).notNull(),
    verifiedBy: integer("verified_by").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    casRegUnique: uniqueIndex("case_regulation_unique_idx").on(
      table.caseId,
      table.regulationId
    ),
    scoreIdx: index("case_reg_score_idx").on(
      table.caseId,
      table.similarityScore
    ),
  })
);

export const caseRegulationLinksRelations = relations(
  caseRegulationLinks,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseRegulationLinks.caseId],
      references: [cases.id],
    }),
    regulation: one(regulations, {
      fields: [caseRegulationLinks.regulationId],
      references: [regulations.id],
    }),
    verifier: one(users, {
      fields: [caseRegulationLinks.verifiedBy],
      references: [users.id],
    }),
  })
);

export type CaseRegulationLink = typeof caseRegulationLinks.$inferSelect;
export type NewCaseRegulationLink = typeof caseRegulationLinks.$inferInsert;
export type LinkMethod = (typeof linkMethodEnum)[number];
```

**File**: `src/db/schema/index.ts`

```typescript
export * from "./organizations";
export * from "./users";
export * from "./cases";
export * from "./regulations";
export * from "./regulation-versions";
export * from "./case-regulation-links";
```

### Step 2.5: Generate and Run Migrations

```bash
# Generate migration files
npm run db:generate

# Apply migrations
npm run db:migrate

# Optional: Open Drizzle Studio to view database
npm run db:studio
```

### Step 2.6: Database Plugin for Fastify

**File**: `src/plugins/database.ts`

```typescript
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
    // Cleanup if needed
  });
};

export default fp(databasePlugin, {
  name: "database",
});
```

---

## Phase 3: Authentication & Authorization

### Step 3.1: Password Hashing Utilities

**File**: `src/utils/hash.ts`

```typescript
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### Step 3.2: JWT Utilities

**File**: `src/utils/jwt.ts`

```typescript
export interface JWTPayload {
  sub: number; // user ID
  email: string;
  role: string;
  orgId: number; // organization ID
  iat?: number;
  exp?: number;
}

export function createTokenPayload(user: {
  id: number;
  email: string;
  role: string;
  organizationId: number;
}): Omit<JWTPayload, "iat" | "exp"> {
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.organizationId,
  };
}
```

### Step 3.3: Auth Plugin

**File**: `src/plugins/auth.ts`

```typescript
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { UnauthorizedError } from "../utils/errors";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    user?: {
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
      // The JWT plugin automatically attaches the payload to request.user
    } catch (err) {
      throw new UnauthorizedError("Invalid or expired token");
    }
  });
};

export default fp(authPlugin, {
  name: "auth",
  dependencies: ["jwt"],
});
```

### Step 3.4: Auth Service

**File**: `src/services/auth.service.ts`

```typescript
import { eq } from "drizzle-orm";
import { Database } from "../db/connection";
import { users, NewUser } from "../db/schema";
import { hashPassword, verifyPassword } from "../utils/hash";
import { UnauthorizedError, ConflictError } from "../utils/errors";

export class AuthService {
  constructor(private db: Database) {}

  async register(data: {
    email: string;
    password: string;
    fullName: string;
    organizationId: number;
    role?: string;
  }) {
    // Check if user exists
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    if (existing) {
      throw new ConflictError("User with this email already exists");
    }

    const passwordHash = await hashPassword(data.password);

    const [newUser] = await this.db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        organizationId: data.organizationId,
        role: data.role || "lawyer",
      })
      .returning();

    return this.sanitizeUser(newUser);
  }

  async login(email: string, password: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    // Update last login
    await this.db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, user.id));

    return this.sanitizeUser(user);
  }

  async getUserById(id: number) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      return null;
    }

    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: typeof users.$inferSelect) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
```

### Step 3.5: Auth Routes

**File**: `src/routes/auth/schemas.ts`

```typescript
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  organizationId: z.number().int().positive(),
  role: z
    .enum(["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"])
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

**File**: `src/routes/auth/handlers.ts`

```typescript
import { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "../../services/auth.service";
import {
  RegisterInput,
  LoginInput,
  registerSchema,
  loginSchema,
} from "./schemas";
import { createTokenPayload } from "../../utils/jwt";

export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterInput }>,
  reply: FastifyReply
) {
  const data = registerSchema.parse(request.body);

  const authService = new AuthService(request.server.db);
  const user = await authService.register(data);

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
```

**File**: `src/routes/auth/index.ts`

```typescript
import { FastifyPluginAsync } from "fastify";
import { registerHandler, loginHandler, getMeHandler } from "./handlers";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/register",
    {
      schema: {
        description: "Register a new user",
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password", "fullName", "organizationId"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            fullName: { type: "string", minLength: 2 },
            organizationId: { type: "number" },
            role: {
              type: "string",
              enum: ["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"],
            },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              user: { type: "object" },
              token: { type: "string" },
            },
          },
        },
      },
    },
    registerHandler
  );

  fastify.post(
    "/login",
    {
      schema: {
        description: "Login user",
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string" },
            password: { type: "string" },
          },
        },
      },
    },
    loginHandler
  );

  fastify.get(
    "/me",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Get current user",
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
      },
    },
    getMeHandler
  );
};

export default authRoutes;
```

---

## Phase 4: Case Management

### Step 4.1: Case Service

**File**: `src/services/case.service.ts`

```typescript
import { eq, and, desc } from "drizzle-orm";
import { Database } from "../db/connection";
import { cases, NewCase, Case } from "../db/schema";
import { NotFoundError, ForbiddenError } from "../utils/errors";

export class CaseService {
  constructor(private db: Database) {}

  async createCase(data: NewCase, userId: number) {
    const [newCase] = await this.db
      .insert(cases)
      .values({
        ...data,
        assignedLawyerId: userId,
      })
      .returning();

    return newCase;
  }

  async getCaseById(id: number, orgId: number): Promise<Case> {
    const case_ = await this.db.query.cases.findFirst({
      where: eq(cases.id, id),
      with: {
        assignedLawyer: true,
      },
    });

    if (!case_) {
      throw new NotFoundError("Case");
    }

    // Check organization access
    if (case_.organizationId !== orgId) {
      throw new ForbiddenError("Access denied to this case");
    }

    return case_;
  }

  async getCasesByOrganization(
    orgId: number,
    filters?: {
      status?: string;
      caseType?: string;
      assignedLawyerId?: number;
    }
  ) {
    const conditions = [eq(cases.organizationId, orgId)];

    if (filters?.status) {
      conditions.push(eq(cases.status, filters.status as any));
    }
    if (filters?.caseType) {
      conditions.push(eq(cases.caseType, filters.caseType as any));
    }
    if (filters?.assignedLawyerId) {
      conditions.push(eq(cases.assignedLawyerId, filters.assignedLawyerId));
    }

    return this.db.query.cases.findMany({
      where: and(...conditions),
      orderBy: [desc(cases.createdAt)],
      with: {
        assignedLawyer: {
          columns: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  async updateCase(id: number, orgId: number, data: Partial<NewCase>) {
    // Verify ownership
    await this.getCaseById(id, orgId);

    const [updated] = await this.db
      .update(cases)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(cases.id, id))
      .returning();

    return updated;
  }

  async deleteCase(id: number, orgId: number) {
    // Verify ownership
    await this.getCaseById(id, orgId);

    await this.db.delete(cases).where(eq(cases.id, id));

    return { success: true };
  }
}
```

### Step 4.2: Case Routes

**File**: `src/routes/cases/schemas.ts`

```typescript
import { z } from "zod";

export const createCaseSchema = z.object({
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  caseType: z.enum([
    "criminal",
    "civil",
    "commercial",
    "labor",
    "family",
    "administrative",
  ]),
  status: z
    .enum(["open", "in_progress", "pending_hearing", "closed", "archived"])
    .optional(),
  clientInfo: z.string().optional(),
  courtJurisdiction: z.string().optional(),
  filingDate: z.string().optional(), // ISO date string
  nextHearing: z.string().optional(),
});

export const updateCaseSchema = createCaseSchema.partial();

export const getCasesQuerySchema = z.object({
  status: z.string().optional(),
  caseType: z.string().optional(),
  assignedLawyerId: z.coerce.number().optional(),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type GetCasesQuery = z.infer<typeof getCasesQuerySchema>;
```

**File**: `src/routes/cases/handlers.ts`

```typescript
import { FastifyRequest, FastifyReply } from "fastify";
import { CaseService } from "../../services/case.service";
import {
  CreateCaseInput,
  UpdateCaseInput,
  GetCasesQuery,
  createCaseSchema,
  updateCaseSchema,
  getCasesQuerySchema,
} from "./schemas";

export async function createCaseHandler(
  request: FastifyRequest<{ Body: CreateCaseInput }>,
  reply: FastifyReply
) {
  const data = createCaseSchema.parse(request.body);

  const caseService = new CaseService(request.server.db);
  const newCase = await caseService.createCase(
    {
      ...data,
      organizationId: request.user!.orgId,
      filingDate: data.filingDate ? new Date(data.filingDate) : undefined,
      nextHearing: data.nextHearing ? new Date(data.nextHearing) : undefined,
    },
    request.user!.id
  );

  return reply.code(201).send({ case: newCase });
}

export async function getCasesHandler(
  request: FastifyRequest<{ Querystring: GetCasesQuery }>,
  reply: FastifyReply
) {
  const filters = getCasesQuerySchema.parse(request.query);

  const caseService = new CaseService(request.server.db);
  const cases = await caseService.getCasesByOrganization(
    request.user!.orgId,
    filters
  );

  return reply.send({ cases });
}

export async function getCaseByIdHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const id = parseInt(request.params.id);

  const caseService = new CaseService(request.server.db);
  const case_ = await caseService.getCaseById(id, request.user!.orgId);

  return reply.send({ case: case_ });
}

export async function updateCaseHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateCaseInput }>,
  reply: FastifyReply
) {
  const id = parseInt(request.params.id);
  const data = updateCaseSchema.parse(request.body);

  const caseService = new CaseService(request.server.db);
  const updated = await caseService.updateCase(id, request.user!.orgId, {
    ...data,
    filingDate: data.filingDate ? new Date(data.filingDate) : undefined,
    nextHearing: data.nextHearing ? new Date(data.nextHearing) : undefined,
  });

  return reply.send({ case: updated });
}

export async function deleteCaseHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const id = parseInt(request.params.id);

  const caseService = new CaseService(request.server.db);
  await caseService.deleteCase(id, request.user!.orgId);

  return reply.code(204).send();
}
```

**File**: `src/routes/cases/index.ts`

```typescript
import { FastifyPluginAsync } from "fastify";
import {
  createCaseHandler,
  getCasesHandler,
  getCaseByIdHandler,
  updateCaseHandler,
  deleteCaseHandler,
} from "./handlers";

const casesRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.post(
    "/",
    {
      schema: {
        description: "Create a new case",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      },
    },
    createCaseHandler
  );

  fastify.get(
    "/",
    {
      schema: {
        description: "Get all cases for organization",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      },
    },
    getCasesHandler
  );

  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get case by ID",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      },
    },
    getCaseByIdHandler
  );

  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update case",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      },
    },
    updateCaseHandler
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete case",
        tags: ["cases"],
        security: [{ bearerAuth: [] }],
      },
    },
    deleteCaseHandler
  );
};

export default casesRoutes;
```

---

## Phase 5: Regulation Management

### Step 5.1: Regulation Service

**File**: `src/services/regulation.service.ts`

```typescript
import { eq, and, desc } from "drizzle-orm";
import { Database } from "../db/connection";
import {
  regulations,
  regulationVersions,
  NewRegulation,
  NewRegulationVersion,
} from "../db/schema";
import { NotFoundError } from "../utils/errors";

export class RegulationService {
  constructor(private db: Database) {}

  async createRegulation(data: NewRegulation) {
    const [regulation] = await this.db
      .insert(regulations)
      .values(data)
      .returning();
    return regulation;
  }

  async getRegulationById(id: number) {
    const regulation = await this.db.query.regulations.findFirst({
      where: eq(regulations.id, id),
    });

    if (!regulation) {
      throw new NotFoundError("Regulation");
    }

    return regulation;
  }

  async getAllRegulations(filters?: { category?: string; status?: string }) {
    const conditions = [];

    if (filters?.category) {
      conditions.push(eq(regulations.category, filters.category as any));
    }
    if (filters?.status) {
      conditions.push(eq(regulations.status, filters.status as any));
    }

    return this.db.query.regulations.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(regulations.createdAt)],
    });
  }

  async updateRegulation(id: number, data: Partial<NewRegulation>) {
    await this.getRegulationById(id);

    const [updated] = await this.db
      .update(regulations)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(regulations.id, id))
      .returning();

    return updated;
  }

  async createVersion(data: NewRegulationVersion) {
    const [version] = await this.db
      .insert(regulationVersions)
      .values(data)
      .returning();
    return version;
  }

  async getVersionsByRegulationId(regulationId: number) {
    return this.db.query.regulationVersions.findMany({
      where: eq(regulationVersions.regulationId, regulationId),
      orderBy: [desc(regulationVersions.versionNumber)],
    });
  }
}
```

### Step 5.2: Regulation Routes

_Similar structure to cases - create schemas.ts, handlers.ts, and index.ts following the same pattern_

---

## Phase 6: AI Integration Layer

### Step 6.1: AI Client Service

**File**: `src/services/ai-client.service.ts`

```typescript
import { env } from "../config/env";
import { logger } from "../lib/logger";

export interface EmbeddingResponse {
  embeddings: number[][];
}

export interface SimilarityMatch {
  regulation_id: number;
  similarity_score: number;
  title: string;
}

export interface FindRelatedResponse {
  related_regulations: SimilarityMatch[];
}

export class AIClientService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = env.AI_SERVICE_URL;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: [text] }),
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.statusText}`);
      }

      const data: EmbeddingResponse = await response.json();
      return data.embeddings[0];
    } catch (error) {
      logger.error({ error }, "Failed to generate embedding");
      throw error;
    }
  }

  async findRelatedRegulations(
    caseText: string,
    topK: number = 10
  ): Promise<SimilarityMatch[]> {
    try {
      const response = await fetch(`${this.baseUrl}/find_related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_text: caseText,
          top_k: topK,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.statusText}`);
      }

      const data: FindRelatedResponse = await response.json();
      return data.related_regulations;
    } catch (error) {
      logger.error({ error }, "Failed to find related regulations");
      throw error;
    }
  }
}
```

### Step 6.2: Case-Regulation Links Service

**File**: `src/services/link.service.ts`

```typescript
import { eq, and, desc } from "drizzle-orm";
import { Database } from "../db/connection";
import { caseRegulationLinks, NewCaseRegulationLink } from "../db/schema";

export class LinkService {
  constructor(private db: Database) {}

  async createLink(data: NewCaseRegulationLink) {
    const [link] = await this.db
      .insert(caseRegulationLinks)
      .values(data)
      .onConflictDoUpdate({
        target: [caseRegulationLinks.caseId, caseRegulationLinks.regulationId],
        set: {
          similarityScore: data.similarityScore,
          method: data.method,
        },
      })
      .returning();

    return link;
  }

  async getLinksByCaseId(caseId: number) {
    return this.db.query.caseRegulationLinks.findMany({
      where: eq(caseRegulationLinks.caseId, caseId),
      orderBy: [desc(caseRegulationLinks.similarityScore)],
      with: {
        regulation: true,
      },
    });
  }

  async verifyLink(linkId: number, userId: number) {
    const [updated] = await this.db
      .update(caseRegulationLinks)
      .set({
        verified: true,
        verifiedBy: userId,
        verifiedAt: new Date(),
      })
      .where(eq(caseRegulationLinks.id, linkId))
      .returning();

    return updated;
  }

  async deleteLink(linkId: number) {
    await this.db
      .delete(caseRegulationLinks)
      .where(eq(caseRegulationLinks.id, linkId));
  }
}
```

### Step 6.3: AI Links Routes

**File**: `src/routes/ai-links/index.ts`

```typescript
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { AIClientService } from "../../services/ai-client.service";
import { LinkService } from "../../services/link.service";
import { CaseService } from "../../services/case.service";

const aiLinksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", fastify.authenticate);

  // Generate AI links for a case
  fastify.post(
    "/:caseId/generate",
    async (
      request: FastifyRequest<{ Params: { caseId: string } }>,
      reply: FastifyReply
    ) => {
      const caseId = parseInt(request.params.caseId);

      const caseService = new CaseService(fastify.db);
      const case_ = await caseService.getCaseById(caseId, request.user!.orgId);

      const aiService = new AIClientService();
      const matches = await aiService.findRelatedRegulations(
        `${case_.title}\n\n${case_.description || ""}`,
        10
      );

      const linkService = new LinkService(fastify.db);
      const links = await Promise.all(
        matches.map((match) =>
          linkService.createLink({
            caseId,
            regulationId: match.regulation_id,
            similarityScore: match.similarity_score.toString(),
            method: "ai",
          })
        )
      );

      return reply.send({ links });
    }
  );

  // Get AI links for a case
  fastify.get(
    "/:caseId",
    async (
      request: FastifyRequest<{ Params: { caseId: string } }>,
      reply: FastifyReply
    ) => {
      const caseId = parseInt(request.params.caseId);

      const caseService = new CaseService(fastify.db);
      await caseService.getCaseById(caseId, request.user!.orgId);

      const linkService = new LinkService(fastify.db);
      const links = await linkService.getLinksByCaseId(caseId);

      return reply.send({ links });
    }
  );

  // Verify a link
  fastify.post(
    "/:linkId/verify",
    async (
      request: FastifyRequest<{ Params: { linkId: string } }>,
      reply: FastifyReply
    ) => {
      const linkId = parseInt(request.params.linkId);

      const linkService = new LinkService(fastify.db);
      const link = await linkService.verifyLink(linkId, request.user!.id);

      return reply.send({ link });
    }
  );
};

export default aiLinksRoutes;
```

---

## Phase 7: Real-time Updates

### Step 7.1: Install WebSocket Support

```bash
npm install @fastify/websocket ws
npm install -D @types/ws
```

### Step 7.2: WebSocket Plugin

**File**: `src/plugins/websocket.ts`

```typescript
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import websocket from "@fastify/websocket";

const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(websocket);

  // Store active connections by organization
  const connections = new Map<number, Set<any>>();

  fastify.decorate(
    "broadcastToOrg",
    (orgId: number, event: string, data: any) => {
      const orgConnections = connections.get(orgId);
      if (orgConnections) {
        const message = JSON.stringify({ event, data, timestamp: new Date() });
        orgConnections.forEach((ws) => {
          if (ws.readyState === 1) {
            // OPEN
            ws.send(message);
          }
        });
      }
    }
  );

  fastify.get("/ws", { websocket: true }, (connection, req) => {
    // Extract token from query or headers
    const token = (req.query as any).token;

    if (!token) {
      connection.socket.close(1008, "Token required");
      return;
    }

    try {
      const payload = fastify.jwt.verify(token);
      const orgId = (payload as any).orgId;

      if (!connections.has(orgId)) {
        connections.set(orgId, new Set());
      }
      connections.get(orgId)!.add(connection.socket);

      connection.socket.on("close", () => {
        connections.get(orgId)?.delete(connection.socket);
      });

      connection.socket.send(
        JSON.stringify({
          event: "connected",
          data: { orgId },
        })
      );
    } catch (err) {
      connection.socket.close(1008, "Invalid token");
    }
  });
};

declare module "fastify" {
  interface FastifyInstance {
    broadcastToOrg: (orgId: number, event: string, data: any) => void;
  }
}

export default fp(websocketPlugin, {
  name: "websocket",
});
```

---

## Phase 8: Error Handler & Swagger

### Step 8.1: Global Error Handler Plugin

**File**: `src/plugins/error-handler.ts`

```typescript
import { FastifyPluginAsync, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "../utils/errors";
import { ZodError } from "zod";
import { logger } from "../lib/logger";

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(
    (error: FastifyError | AppError | ZodError, request, reply) => {
      logger.error({
        err: error,
        url: request.url,
        method: request.method,
      });

      // Zod validation errors
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: "Validation Error",
          details: error.errors,
        });
      }

      // Custom app errors
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }

      // Fastify errors
      if (error.statusCode) {
        return reply.code(error.statusCode).send({
          error: error.message,
        });
      }

      // Unknown errors
      return reply.code(500).send({
        error: "Internal Server Error",
      });
    }
  );
};

export default fp(errorHandlerPlugin, {
  name: "error-handler",
});
```

### Step 8.2: Swagger Plugin

**File**: `src/plugins/swagger.ts`

```typescript
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "Legal Case Management API",
        description:
          "AI-powered case management system for Saudi legal practitioners",
        version: "1.0.0",
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Development server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "cases", description: "Case management" },
        { name: "regulations", description: "Regulation management" },
        { name: "ai-links", description: "AI-powered case-regulation linking" },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });
};

export default fp(swaggerPlugin, {
  name: "swagger",
});
```

---

## Phase 9: Main App Assembly

### Step 9.1: Update `src/app.ts`

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env";

// Plugins
import databasePlugin from "./plugins/database";
import authPlugin from "./plugins/auth";
import swaggerPlugin from "./plugins/swagger";
import errorHandlerPlugin from "./plugins/error-handler";
import websocketPlugin from "./plugins/websocket";

// Routes
import authRoutes from "./routes/auth";
import casesRoutes from "./routes/cases";
import regulationsRoutes from "./routes/regulations";
import aiLinksRoutes from "./routes/ai-links";

export function buildApp(opts = {}) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
    ...opts,
  });

  // Security plugins
  app.register(helmet);
  app.register(cors, {
    origin: env.CORS_ORIGIN.split(","),
    credentials: true,
  });
  app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  // JWT
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  // Core plugins
  app.register(databasePlugin);
  app.register(authPlugin);
  app.register(errorHandlerPlugin);
  app.register(swaggerPlugin);
  app.register(websocketPlugin);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date() }));

  // API Routes
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(casesRoutes, { prefix: "/api/cases" });
  app.register(regulationsRoutes, { prefix: "/api/regulations" });
  app.register(aiLinksRoutes, { prefix: "/api/ai-links" });

  return app;
}
```

### Step 9.2: Update `src/server.ts`

```typescript
import { buildApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

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
```

---

## Phase 10: Testing & Quality

### Step 10.1: Install Testing Dependencies

```bash
npm install -D vitest @vitest/ui
```

### Step 10.2: Create Test Setup

**File**: `vitest.config.ts` (root)

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
```

### Step 10.3: Example Test File

**File**: `src/routes/auth/__tests__/auth.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../../app";

describe("Auth Routes", () => {
  const app = buildApp({ logger: false });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should register a new user", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "test@example.com",
        password: "password123",
        fullName: "Test User",
        organizationId: 1,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toHaveProperty("token");
  });
});
```

---

## Implementation Checklist

### Week 1-2: Foundation

- [ ] Set up project structure
- [ ] Configure TypeScript and environment
- [ ] Install all dependencies
- [ ] Set up Drizzle ORM
- [ ] Create database schema
- [ ] Run initial migrations
- [ ] Test database connection

### Week 3: Authentication

- [ ] Implement password hashing
- [ ] Create JWT utilities
- [ ] Build auth service
- [ ] Create auth routes (register, login, me)
- [ ] Add authentication middleware
- [ ] Test auth flow

### Week 4: Core Features

- [ ] Build case service
- [ ] Create case routes (CRUD)
- [ ] Build regulation service
- [ ] Create regulation routes
- [ ] Add regulation versioning
- [ ] Test all CRUD operations

### Week 5: AI Integration

- [ ] Create AI client service
- [ ] Build link service
- [ ] Create AI links routes
- [ ] Test AI integration (mock if service not ready)
- [ ] Add error handling for AI failures

### Week 6: Real-time & Polish

- [ ] Add WebSocket support
- [ ] Implement real-time notifications
- [ ] Add rate limiting
- [ ] Configure Swagger documentation
- [ ] Add comprehensive error handling
- [ ] Security hardening

### Week 7: Testing & Deployment

- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Set up Docker configuration
- [ ] Create production environment config
- [ ] Performance optimization
- [ ] Documentation

---

## Next Steps

After completing the backend:

1. **Flutter Mobile App Plan** - User interface and state management
2. **AI Microservice Plan** - Python FastAPI service for embeddings and similarity
3. **Infrastructure Plan** - Docker, Redis, PostgreSQL setup

---

## Useful Commands

```bash
# Development
npm run dev                # Start dev server with hot reload
npm run lint               # Type check
npm run test               # Run tests
npm run test:ui            # Run tests with UI

# Database
npm run db:generate        # Generate migrations
npm run db:migrate         # Run migrations
npm run db:studio          # Open Drizzle Studio
npm run db:seed            # Seed database

# Production
npm run build              # Build for production
npm run start              # Start production server
```

---

## Notes

- All routes use Zod for validation
- JWT tokens include user ID, email, role, and organization ID
- Multi-tenancy enforced at service level (organization-based)
- WebSocket for real-time updates to clients
- Drizzle ORM provides type-safe database access
- OpenAPI docs auto-generated and available at `/docs`
- Error handling centralized in error-handler plugin
- Rate limiting prevents abuse
- Helmet.js for security headers

---

**End of Backend Implementation Plan**
