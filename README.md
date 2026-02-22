## Legal Case Management System

A simple backend API for managing legal cases and regulations. Built with Fastify (TypeScript), PostgreSQL, and Drizzle ORM. It includes JWT authentication and optional AI-assisted links between cases and regulations.

### Features
- Authentication (JWT)
- Case CRUD
- Regulation management
- AI-powered case–regulation linking
- Regulation subscription APIs (single + bulk subscribe)
- Dedicated regulation monitoring worker runtime
- Hash-based regulation versioning with automatic notification fanout
- Monitor observability endpoints (health + recent run stats)
- Async case-document extraction queue with OCR-backed text extraction
- Case-focused document insights lifecycle (summary + highlights) with worker processing
- Insights stale-mark/recompute on case title/description updates
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
- `REG_MONITOR_ENABLED`: enable/disable monitoring worker loop
- `REG_MONITOR_POLL_SECONDS`: worker polling interval
- `REG_MONITOR_MAX_CONCURRENCY`: concurrent source checks per cycle
- `REG_MONITOR_FAILURE_RETRY_MINUTES`: retry delay for failed checks
- `CASE_DOC_EXTRACTION_*`: document extraction queue controls
- `CASE_DOC_INSIGHTS_*`: document insights queue controls
- `CASE_LINK_DOC_*`: limits for document context used in AI case linking

### API overview (brief)
- `GET /health` — health check
- `POST /api/auth/register` — register
- `POST /api/auth/login` — login
- `GET /api/auth/me` — current user (Bearer token)
- `GET/POST/PUT/DELETE /api/cases` — basic case CRUD (protected)
- `GET/POST/PUT /api/regulations` — regulation management (protected)
- `POST /api/regulations/subscribe` — subscribe to a regulation (protected)
- `POST /api/regulations/subscriptions/bulk` — bulk subscribe from AI suggestions (protected)
- `GET /api/regulations/subscriptions/me` — current user subscriptions (protected)
- `POST /api/regulations/monitor/run` — manual monitor run trigger (admin)
- `GET /api/regulations/monitor/health` — monitor health summary (admin)
- `GET /api/regulations/monitor/stats` — recent monitor run stats (admin)
- `POST /api/ai-links/:caseId/generate` — AI suggestions (protected)
- `GET /api/ai-links/:caseId` — list links (protected)
- `GET /api/documents/:id/insights` — case-focused summary/highlights for a document (protected)
- `POST /api/documents/:id/insights/refresh` — queue insights regeneration (protected)
- `GET /api/documents/insights/health` — org-scoped insights queue health snapshot (protected)

### Organization & Membership Flows (New)
- Personal-first onboarding:
  - `POST /api/auth/register` now supports `registrationType: "personal"` (default when omitted).
  - Personal signup automatically creates a hidden personal workspace organization and assigns the user as `admin`.
- Create organization after account:
  - `POST /api/organizations` now creates an organization and switches the authenticated user into it as `admin`.
  - Response includes `{ organization, user, token }` so clients can refresh session state immediately.
- Invitation-based joining:
  - `POST /api/settings/team/invite` (admin): creates email-targeted invitation with single-use code.
  - `POST /api/settings/team/invitations/accept` (authenticated): accepts code, validates email match + expiry, switches org, returns refreshed token.
- Membership administration:
  - `GET /api/settings/team` lists current org members and org metadata.
  - `PUT /api/settings/team/members/:memberId/role` (admin) changes member role.
  - `DELETE /api/settings/team/members/:memberId` (admin) removes a member and moves them to their personal workspace.
  - `POST /api/settings/organization/leave` lets a user leave current org and move to personal workspace.
- Last-admin edge case:
  - If the last admin leaves/is removed, the system auto-promotes a replacement member by role priority:
    - `senior_lawyer` > `lawyer` > `paralegal` > `clerk`, then oldest member.

### New Database Objects
- `organizations` additions:
  - `is_personal boolean not null default false`
  - `personal_owner_user_id uuid null`
- new `organization_invitations` table:
  - stores invitation email, role, status, expiry, issuer, accepter, and hashed code
  - unique pending invitation per `(organization_id, email)`
  - single-use hashed invitation codes

### Registration Payloads
- Personal (default):
```json
{
  "email": "user@example.com",
  "password": "password123",
  "confirmPassword": "password123",
  "fullName": "User Name",
  "registrationType": "personal"
}
```
- Create organization:
```json
{
  "email": "admin@example.com",
  "password": "password123",
  "confirmPassword": "password123",
  "fullName": "Admin Name",
  "registrationType": "create",
  "organizationName": "My Law Firm"
}
```

