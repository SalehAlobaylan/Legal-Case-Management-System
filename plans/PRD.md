# Product Requirements Document (PRD)
**Project Name:** Legal Case Management System (LCMS)
**Version:** 1.1
**Status:** Draft
**Date:** December 7, 2025

---

## 1. Executive Summary
The Legal Case Management System is a specialized platform designed for legal practitioners in Saudi Arabia. It streamlines the management of legal cases by leveraging Artificial Intelligence to automatically link case details with relevant Saudi regulations and precedents. By utilizing Arabic-optimized semantic search (embeddings), the system solves the inefficiency of manual legal research and keyword-based search limitations.

## 2. Problem Statement
Legal practitioners face significant challenges in rapidly interpreting case materials and identifying pertinent regulations.
*   **Inefficiency:** Manual review of regulations is time-consuming.
*   **Keyword Limitations:** Traditional search fails to capture semantic meaning in Arabic legal texts (e.g., different phrasings for the same legal concept).
*   **Dispersed Information:** Managing case files, client info, and legal research in separate silos leads to errors.

## 3. Goals & Objectives
*   **Primary Goal:** Automate the discovery of relevant regulations for any given legal case using AI.
*   **Case Management:** Provide a robust CRUD interface for managing cases, clients, and documents.
*   **Traceability:** Maintain a versioned, curated database of regulations to ensure AI suggestions are auditable.
*   **Localization:** Deliver a fully Arabic-first experience (RTL support, specialized NLP models).

## 4. Target Audience
*   **Lawyers:** Managing daily case loads and performing legal research.
*   **Paralegals/Clerks:** assisting with data entry and case organization.
*   **Law Firm Admins:** Managing users and organization settings.

---

## 5. Functional Requirements

### 5.1 Authentication & Authorization
*   **FR-01 User Registration/Login:** Users can register and log in via Email/Password.
*   **FR-02 Multi-tenancy:** Users belong to an **Organization** (Law Firm). Data is isolated per organization.
*   **FR-03 Role-Based Access Control (RBAC):**
    *   `Admin`: Manage users, full access to org cases.
    *   `Lawyer`: Manage assigned cases, view org cases.
    *   `Paralegal/Clerk`: View/Edit cases as permitted.
*   **FR-04 Session Management:** Secure session handling using JWT (JSON Web Tokens).

### 5.2 Case Management
*   **FR-05 Case CRUD:** Users can Create, Read, Update, and Delete cases.
*   **FR-06 Case Metadata:** Capture Case Number, Title, Description, Type (Criminal, Civil, Labor, etc.), Status (Open, Closed, etc.), Filing Date, and Court Jurisdiction.
*   **FR-07 Assignment:** Assign specific lawyers to cases.
*   **FR-08 Attachments:** Upload and manage documents related to a case (PDF/Images).

### 5.3 AI & Intelligent Linking
*   **FR-09 AI Suggestion Generation:** On case creation or update, the system generates a list of relevant regulations.
*   **FR-10 Similarity Scoring:** Display a match score (0-100%) indicating confidence in the link.
*   **FR-11 Verification Workflow:** Users can manually "Verify" or "Reject" an AI suggestion.
*   **FR-12 Manual Linking:** Users can manually search for and link regulations to a case.
*   **FR-13 Hybrid Approach:** The system allows both AI-driven and manual discovery of legal texts.

### 5.4 Regulation Management (Knowledge Base)
*   **FR-14 Regulation Repository:** A curated, internal database of Saudi regulations.
*   **FR-15 Versioning:** Regulations track version history. If a regulation changes, old cases linked to the old version remain accurate (audit trail).
*   **FR-16 Search:** Users can search regulations via Keywords (Full-text) and Meaning (Semantic/Vector).

### 5.5 Real-time Features
*   **FR-17 Live Notifications:** Users receive alerts via WebSocket when:
    *   A case they are assigned to is updated.
    *   AI processing for a case is complete.
    *   A relevant regulation is updated (if monitoring is active).

### 5.6 Dashboard & Analytics
*   **FR-18 Dashboard:** Overview of active cases, upcoming hearings, and recent activities.
*   **FR-19 Stats:** Visual breakdown of cases by status and type.

---

## 6. Non-Functional Requirements

### 6.1 Performance
*   **Response Time:** API responses should be < 200ms for standard CRUD.
*   **AI Latency:** Embedding generation and retrieval should take < 2 seconds per request.
*   **Scalability:** Backend should be stateless (excluding WebSocket state) to allow horizontal scaling.

### 6.2 Security
*   **Data Isolation:** Strict enforcement of `organization_id` checks on all data access.
*   **Encryption:** Passwords hashed using `bcrypt`. API communication over HTTPS.
*   **Input Validation:** Strict schema validation (Zod) for all incoming data.

### 6.3 Localization
*   **Language:** Arabic is the primary interface language.
*   **Layout:** UI must support Right-to-Left (RTL) natively.
*   **AI Model:** Embedding models must be specifically trained or fine-tuned for Arabic Legal Text (e.g., AraLegal-BERT, BGE-M3).

---

## 7. Technical Architecture

### 7.1 Backend (API Service)
*   **Framework:** Fastify (Node.js)
*   **Language:** TypeScript
*   **Validation:** Zod
*   **Documentation:** Swagger/OpenAPI
*   **Responsibility:** Auth, Case CRUD, Orchestration, Real-time Gateway.

### 7.2 AI Microservice
*   **Framework:** FastAPI (Python)
*   **Models:** Sentence Transformers (e.g., `all-MiniLM-L6-v2` or `BGE-M3` for Arabic).
*   **Responsibility:**
    *   `/embed`: Convert text to vector.
    *   `/find_related`: Return top-k similar regulation IDs for a given case text.

### 7.3 Database Layer
*   **Primary DB:** PostgreSQL.
*   **ORM:** Drizzle ORM.
*   **Extensions:**
    *   `pgvector`: For storing and querying embeddings.
    *   `tsvector`: For Arabic full-text keyword search.
*   **Schema Entities:** `Users`, `Organizations`, `Cases`, `Regulations`, `RegulationVersions`, `CaseRegulationLinks`.

### 7.4 Frontend Clients
*   **Web:** Next.js 14+ (App Router), Tailwind CSS, shadcn/ui, TanStack Query.
*   **Mobile:** Flutter, BLoC Pattern, Dio.

---

## 8. User Flows (Core)

### Flow 1: Create Case & Get Suggestions
1.  Lawyer logs in to Web/Mobile app.
2.  Navigates to "New Case".
3.  Enters Case Title ("Labor dispute regarding unpaid end of service benefits...") and Description.
4.  Submits form.
5.  **System Action:**
    *   Saves Case to DB.
    *   Async job sends Case text to AI Service.
    *   AI Service generates embedding -> Queries `regulations` table via Vector Similarity.
    *   System saves top 10 matches to `case_regulation_links` with `method='ai'`.
    *   System sends WebSocket event `case-processed`.
6.  User sees "New Suggestions Available" notification.
7.  User opens Case Details -> "AI Suggestions" tab.
8.  User clicks "Verify" on relevant Labor Law articles.

---

## 9. Data Model (Simplified ERD)

| Entity | Key Fields | Relationships |
| :--- | :--- | :--- |
| **Organization** | `id`, `name`, `license` | Has many Users, Cases. |
| **User** | `id`, `email`, `role`, `password_hash` | Belongs to Org. |
| **Case** | `id`, `title`, `description`, `embedding` (vector) | Belongs to Org, Assigned to User. |
| **Regulation** | `id`, `title`, `text`, `embedding` (vector) | Has many Versions. |
| **Link** | `case_id`, `regulation_id`, `score`, `verified` | Junction between Case & Regulation. |

