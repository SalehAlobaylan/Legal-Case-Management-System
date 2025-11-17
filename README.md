## Legal Case Management System

A simple backend API for managing legal cases and regulations. Built with Fastify (TypeScript), PostgreSQL, and Drizzle ORM. It includes JWT authentication and optional AI-assisted links between cases and regulations.

### Features
- Authentication (JWT)
- Case CRUD
- Regulation management
- AI-powered case–regulation linking
- Global error handler
- OpenAPI/Swagger docs at `/docs`
- PostgreSQL + Drizzle ORM

### Quick start
```bash
npm install
npm run dev        # start in watch mode
# or
npm run build && npm run start:prod
```

Set required environment variables (e.g., `DATABASE_URL`, `JWT_SECRET`) before starting.

### Project layout
- `src/`: backend source code (plugins, routes, services, db, utils)
- `plans/`: design docs, see `plans/backend-fastify-implementation-plan.md`

### Notes
- API docs available at `/docs` when the server is running.

### Tech stack
- Fastify + TypeScript
- Drizzle ORM + PostgreSQL
- Zod for input validation
- JWT authentication
- Pino logger
- Swagger UI (`/docs`)
- CORS, rate limit, and global error handler

### Environment
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: secret for signing JWTs
- `PORT` / `HOST`: server bind options (defaults 3000 / 0.0.0.0)
- `CORS_ORIGIN`: allowed origins (comma-separated)
- `AI_SERVICE_URL` (optional): external AI microservice

### API overview (brief)
- `GET /health` — health check
- `POST /api/auth/register` — register
- `POST /api/auth/login` — login
- `GET /api/auth/me` — current user (Bearer token)
- `GET/POST/PUT/DELETE /api/cases` — basic case CRUD (protected)
- `GET/POST/PUT /api/regulations` — regulation management (protected)
- `POST /api/ai-links/:caseId/generate` — AI suggestions (protected)
- `GET /api/ai-links/:caseId` — list links (protected)

