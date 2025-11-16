## Legal Case Management System

A simple backend API for managing legal cases and regulations. Built with Fastify (TypeScript), PostgreSQL, and Drizzle ORM. It includes JWT authentication and optional AI-assisted links between cases and regulations.


### Tech stack

<p align="left">
  <img src="https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/Drizzle-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Drizzle" />

<img src="https://skillicons.dev/icons?i=redis" 
  alt="Redis" height="50" />
<img src="https://skillicons.dev/icons?i=postgres" 
  alt="PostgreSQL" height="50" />
<img src="https://skillicons.dev/icons?i=docker" 
  alt="Docker" height="50" />

</p>

- Fastify + TypeScript
- Drizzle ORM + PostgreSQL
- Zod for input validation
- JWT authentication
- Pino logger
- Swagger UI (`/docs`)
- CORS, rate limit, and global error handler



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
npm run dev        
# or
npm run build && npm run start:prod
```

</p>

Set required environment variables (e.g., `DATABASE_URL`, `JWT_SECRET`) before starting.

### Project layout
- `src/`: backend source code (plugins, routes, services, db, utils)
- `plans/`: design docs, see `plans/backend-fastify-implementation-plan.md`

### Notes
- API docs available at `/docs` when the server is running.


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

### Scripts
- `npm run dev`: start dev server (watch)
- `npm run build`: compile TypeScript
- `npm run start:prod`: run compiled server
- `npm run lint`: type-check
