# PRD — Legal Case Management System (LCMS) Web UX/UI (Next.js 14 + shadcn)

**Product:** Legal Case Management System (LCMS)  
**Doc type:** Product Requirements Document (UX/UI Web Frontend)  
**Version:** 2.0 (Aligned with system architecture)  
**Date:** 2025-12-31  
**Primary market:** Saudi Arabia (Arabic-first) (PRD.md) [file:18]  
**Implementation target:** Next.js 14 (App Router) + shadcn/ui + Radix UI + Tailwind, TanStack Query + Zustand, JWT auth, Socket.IO client (real-time) (web-frontend-implementation-plan.md) [file:14] (Design_Book.txt) [file:16]

---

## 1) Purpose & scope

This PRD defines the **UX/UI design requirements** and the **implementation-ready frontend scope** for the LCMS web app. (PRD.md) [file:18]  
The UI design originally prototyped in a Vite-based build is treated as the **visual/interaction reference**, but the production implementation must follow the system stack and conventions described in the Next.js web plan and backend architecture. (web-frontend-implementation-plan.md) [file:14] (Design_Book.txt) [file:16]

### Goals

- Provide an Arabic-first legal case workspace that supports bilingual UI (AR primary; EN secondary). (PRD.md) [file:18]
- Enable fast case CRUD + document handling + AI regulation suggestions with verification workflow. (PRD.md) [file:18] (backend-fastify-implementation-plan.md) [file:12]
- Provide regulation library + versioning + (optional) discovery + monitoring-driven alerts. (PRD.md) [file:18] (Design_Book.txt) [file:16]
- Ensure real-time updates via Socket.IO are visible and actionable in UX. (Design_Book.txt) [file:16] (web-frontend-implementation-plan.md) [file:14]

### Non-goals (v1)

- Building a full court e-filing workflow.
- Implementing complex DMS/eDiscovery features beyond case attachments.
- Building the mobile Flutter UX (this PRD is web-only). (Design_Book.txt) [file:16]

---

## 2) Implementation constraints (must-follow)

### Required web stack

- **Next.js 14 App Router** structure (route groups for auth vs dashboard). (web-frontend-implementation-plan.md) [file:14]
- **UI:** shadcn/ui + Radix UI primitives; Tailwind styling. (web-frontend-implementation-plan.md) [file:14]
- **Server state:** TanStack Query (caching, retries, invalidation). (web-frontend-implementation-plan.md) [file:14]
- **Client state:** Zustand (auth/session, UI preferences like theme + locale). (web-frontend-implementation-plan.md) [file:14]
- **Auth:** JWT (Fastify-compatible); store token in auth store and attach to API calls. (web-frontend-implementation-plan.md) [file:14] (backend-fastify-implementation-plan.md) [file:12]
- **Real-time:** Socket.IO client subscribing to relevant org/user events; invalidate queries + show toasts/badges. (web-frontend-implementation-plan.md) [file:14] (Design_Book.txt) [file:16]

---

## 3) Language & RTL requirements

### Arabic-first, bilingual UI

- Arabic is the **default** and primary UX language. (PRD.md) [file:18]
- English is supported as a secondary locale (bilingual), because it’s straightforward to implement and helps demos/testing. (web-frontend-implementation-plan.md) [file:14]
- Locale switching must update `document.lang` and `document.dir` (RTL/LTR) and persist via Zustand UI store. (missing-features-implementation-plan.md) [file:15]

### RTL UX rules (P0)

- Direction-aware spacing, icons (chevrons/arrows), alignment, and table reading order.
- All pages must be reviewed in Arabic RTL as the primary acceptance gate.

---

## 4) Core domain model alignment (P0)

This section overrides any status/role labels from the earlier Vite-only UX prototype; the UI must reflect the system enums.

### Case statuses (required)

**Status must be exactly:**

- `open`
- `in_progress`
- `pending_hearing`
- `closed`
- `archived` (backend-fastify-implementation-plan.md) [file:12] (web-frontend-implementation-plan.md) [file:14]

### Case metadata (minimum, aligned with backend plan)

Case create/edit and details must support:

- Case Number (required) (backend-fastify-implementation-plan.md) [file:12]
- Title (required) (backend-fastify-implementation-plan.md) [file:12]
- Description (optional but recommended) (backend-fastify-implementation-plan.md) [file:12]
- Case Type (enum) (backend-fastify-implementation-plan.md) [file:12]
- Status (enum above) (backend-fastify-implementation-plan.md) [file:12]
- Client Info (stored as text/JSON; UI should validate and/or guide structure) (backend-fastify-implementation-plan.md) [file:12]
- Assigned Lawyer (user picker; optional) (backend-fastify-implementation-plan.md) [file:12]
- Court Jurisdiction (optional) (backend-fastify-implementation-plan.md) [file:12]
- Filing Date (optional) (backend-fastify-implementation-plan.md) [file:12]
- Next Hearing datetime (optional) (backend-fastify-implementation-plan.md) [file:12]

### RBAC roles (required)

UI permissions and role labels must match:

- `admin`
- `senior_lawyer`
- `lawyer`
- `paralegal`
- `clerk` (backend-fastify-implementation-plan.md) [file:12]

Minimum RBAC UI rules (P0):

- Admin: manage org settings/users/integrations/billing (if enabled) + full data access. (PRD.md) [file:18]
- Senior Lawyer/Lawyer: create/update/close cases; verify AI links. (PRD.md) [file:18] (backend-fastify-implementation-plan.md) [file:12]
- Paralegal/Clerk: create drafts / update allowed fields; cannot verify AI links unless policy allows (configurable P1). (PRD.md) [file:18]

---

## 5) UX modules & user journeys (web)

### 5.1 Landing / first entry experience (P0)

**Why:** The implementation plan explicitly requires replacing default home with a landing page and this is currently treated as missing work. (missing-features-implementation-plan.md) [file:15]

Requirements:

- Public landing page with clear value proposition + CTAs:
  - “Get Started” → Register
  - “Sign In” → Login (missing-features-implementation-plan.md) [file:15]
- Must be bilingual; default Arabic content first.

Acceptance:

- No auth required.
- Responsive (desktop/tablet/mobile).
- Uses shadcn primitives (Card/Button/Typography). (missing-features-implementation-plan.md) [file:15]

### 5.2 Authentication (P0)

Required pages:

- Login (`/login`)
- Register (`/register`) (web-frontend-implementation-plan.md) [file:14] (missing-features-implementation-plan.md) [file:15]

UX requirements:

- Validations (email format, password rules, confirm password on register). (missing-features-implementation-plan.md) [file:15]
- Error states:
  - invalid credentials
  - organization not found / invalid org id
  - server unavailable
- Session expiry handling:
  - 401 from API triggers logout + redirect to login (preserve return URL P1). (web-frontend-implementation-plan.md) [file:14]

### 5.3 Dashboard (P0)

Requirements:

- Stats cards: total cases, open cases, pending hearings, closed cases. (web-frontend-implementation-plan.md) [file:14]
- Recent cases list.
- Real-time badge/toast on `case_processed` / links refreshed events (wording configurable). (Design_Book.txt) [file:16] (web-frontend-implementation-plan.md) [file:14]

### 5.4 Cases (P0)

Pages:

- Cases list (`/cases`) (web-frontend-implementation-plan.md) [file:14]
- New case (`/cases/new`) (web-frontend-implementation-plan.md) [file:14]
- Case details (`/cases/[id]`) (web-frontend-implementation-plan.md) [file:14]

Case list requirements:

- Filter by status using the official enums. (backend-fastify-implementation-plan.md) [file:12]
- Search by title/caseNumber/description (debounced). (missing-features-implementation-plan.md) [file:15]
- Pagination component support if backend supports pagination. (missing-features-implementation-plan.md) [file:15]

Case create/edit requirements:

- Form fields reflect backend metadata (caseNumber, type, status, filing date, next hearing, jurisdiction, assigned lawyer). (backend-fastify-implementation-plan.md) [file:12] (web-frontend-implementation-plan.md) [file:14]
- Submit creates case then optionally triggers AI link generation (depending on backend workflow). (PRD.md) [file:18] (Design_Book.txt) [file:16]

Case details requirements:

- Tabs:
  - Details (metadata)
  - AI Suggestions (links)
  - Documents (document manager) (web-frontend-implementation-plan.md) [file:14] (missing-features-implementation-plan.md) [file:15]
- AI suggestions:
  - Show similarity score clearly
  - Actions: verify + dismiss/remove suggestion (dismiss is explicitly required as missing feature). (backend-fastify-implementation-plan.md) [file:12] (missing-features-implementation-plan.md) [file:15]

### 5.5 Regulations (P0 / P1)

Required baseline page:

- Regulations list/search page (`/regulations`) to avoid navigation 404s. (missing-features-implementation-plan.md) [file:15]

P0 requirements:

- Search by title/number/category.
- Show status (active/amended/repealed/draft if used by backend). (backend-fastify-implementation-plan.md) [file:12]
- Deep link to regulation detail (P1 if not built yet).

P1 requirements (recommended):

- Regulation detail + version history + compare versions (align with “versioning” requirement). (PRD.md) [file:18] (backend-fastify-implementation-plan.md) [file:12]
- Regulation monitoring/subscription UX (if enabled): show source URL and last checked/last updated. (backend-fastify-implementation-plan.md) [file:12]

### 5.6 Profile & Settings (P0)

Required pages:

- Profile (`/profile`) (missing-features-implementation-plan.md) [file:15]
- Settings (`/settings`) (missing-features-implementation-plan.md) [file:15]

Settings requirements:

- Theme toggle (light/dark/system). (missing-features-implementation-plan.md) [file:15]
- Language selector (ar/en) updates RTL. (missing-features-implementation-plan.md) [file:15]
- Notification preferences (case updates, ai suggestions, regulation updates). (missing-features-implementation-plan.md) [file:15]

---

## 6) Remaining pages & components to implement (explicit backlog)

This section is the required “list everything remaining” requested.

### 6.1 Missing pages/routes (P0)

- `src/app/(auth)/register/page.tsx` (missing-features-implementation-plan.md) [file:15]
- `src/app/(dashboard)/regulations/page.tsx` (missing-features-implementation-plan.md) [file:15]
- `src/app/(dashboard)/profile/page.tsx` (missing-features-implementation-plan.md) [file:15]
- `src/app/(dashboard)/settings/page.tsx` (missing-features-implementation-plan.md) [file:15]
- `src/app/page.tsx` (Landing page replaces default Next.js home) (missing-features-implementation-plan.md) [file:15]
- Documents tab completeness inside `src/app/(dashboard)/cases/[id]/page.tsx` (missing-features-implementation-plan.md) [file:15]

### 6.2 Missing components (P0)

Auth:

- `src/components/features/auth/login-form.tsx` (missing-features-implementation-plan.md) [file:15]
- `src/components/features/auth/register-form.tsx` (missing-features-implementation-plan.md) [file:15]

Case features:

- `src/components/features/cases/document-manager.tsx` (missing-features-implementation-plan.md) [file:15]
- Update AI suggestions panel to include **dismiss/remove** action (via `useDismissLink`). (missing-features-implementation-plan.md) [file:15] (backend-fastify-implementation-plan.md) [file:12]

Layout:

- `src/components/layout/theme-toggle.tsx` (missing-features-implementation-plan.md) [file:15]
- (Optional) `src/components/layout/footer.tsx` (missing-features-implementation-plan.md) [file:15]

Shared feature components:

- `src/components/features/cases/case-list.tsx` (refactor/organization) (missing-features-implementation-plan.md) [file:15]

### 6.3 Missing UI primitives (shadcn) (P0)

- `dialog.tsx`, `table.tsx`, `toast.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `separator.tsx`, `switch.tsx`, `checkbox.tsx` (missing-features-implementation-plan.md) [file:15]

### 6.4 Missing state/types/utilities (P0)

API + endpoints:

- `src/lib/api/endpoints.ts` (missing-features-implementation-plan.md) [file:15]
- `src/lib/api/cases.ts`, `src/lib/api/regulations.ts`, `src/lib/api/ai-links.ts` (missing-features-implementation-plan.md) [file:15]

State:

- `src/lib/store/ui-store.ts` (locale/theme/sidebar/notifications) (missing-features-implementation-plan.md) [file:15]
- `src/lib/store/websocket-store.ts` (socket connection state) (missing-features-implementation-plan.md) [file:15]

Types:

- `src/lib/types/auth.ts` (missing-features-implementation-plan.md) [file:15]
- `src/lib/types/regulation.ts` (missing-features-implementation-plan.md) [file:15]
- `src/lib/types/document.ts` (missing-features-implementation-plan.md) [file:15]

Utilities:

- `src/lib/utils/format.ts` (date/number/currency formatting) (missing-features-implementation-plan.md) [file:15]
- `src/lib/utils/validators.ts` (missing-features-implementation-plan.md) [file:15]

### 6.5 Missing cross-cutting UX quality (P0/P1)

- Search experience wiring (header + cases page) (missing-features-implementation-plan.md) [file:15]
- Pagination component + integration (missing-features-implementation-plan.md) [file:15]
- Skeleton loading states (missing-features-implementation-plan.md) [file:15]
- Error boundary (missing-features-implementation-plan.md) [file:15]
- RTL-first layout utilities + locale switcher UX (missing-features-implementation-plan.md) [file:15]

---

## 7) Recommended PRD updates (explicit)

These are the updates you requested to be included in the new PRD.

### 7.1 Architecture alignment updates

- Update all “tech assumptions” to Next.js 14 App Router + shadcn/ui + TanStack Query + Zustand + Socket.IO. (web-frontend-implementation-plan.md) [file:14] (Design_Book.txt) [file:16]
- Replace any SPA/Vite references with App Router route-groups and layout composition patterns. (web-frontend-implementation-plan.md) [file:14]

### 7.2 Arabic-first product updates

- Define Arabic as default locale and make RTL visual QA mandatory for release. (PRD.md) [file:18] (missing-features-implementation-plan.md) [file:15]
- Enforce translation-key-only UI strings (no hardcoded text) to keep bilingual support consistent.

### 7.3 Domain model corrections

- Replace case statuses everywhere with: `open`, `in_progress`, `pending_hearing`, `closed`, `archived`. (backend-fastify-implementation-plan.md) [file:12]
- Add case metadata fields to all relevant UX flows (create/edit/details filters/search). (backend-fastify-implementation-plan.md) [file:12]
- Replace RBAC roles everywhere with: `admin`, `senior_lawyer`, `lawyer`, `paralegal`, `clerk`. (backend-fastify-implementation-plan.md) [file:12]

### 7.4 Real-time UX definition updates

- Add explicit UX patterns for WebSocket events:
  - toast notifications
  - badge updates
  - query invalidation strategy (regulations list, ai-links per case). (web-frontend-implementation-plan.md) [file:14] (Design_Book.txt) [file:16]

### 7.5 Missing-page closure plan

- Include “Landing + Auth + Regulations/Profile/Settings + Documents + AI dismiss + search/pagination” as the required completion scope for v1 parity with the design intent. (missing-features-implementation-plan.md) [file:15]

---

## 8) Acceptance criteria (v1)

A release is acceptable when:

- Arabic RTL works end-to-end across Landing → Auth → Dashboard → Cases → Case Details (AI + Documents) → Regulations → Settings. (PRD.md) [file:18] (missing-features-implementation-plan.md) [file:15]
- Case statuses shown in UI match backend enums and can be filtered/searched correctly. (backend-fastify-implementation-plan.md) [file:12]
- RBAC role-based visibility is enforced in UI actions (verify/dismiss/edit). (backend-fastify-implementation-plan.md) [file:12]
- Real-time updates visibly refresh relevant screens and do not require manual reload. (Design_Book.txt) [file:16] (web-frontend-implementation-plan.md) [file:14]

---

**End of PRD**
