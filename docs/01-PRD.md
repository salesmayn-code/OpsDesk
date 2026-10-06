# OpsDesk — Product Requirements Document (PRD)

| Field | Value |
|---|---|
| Product | OpsDesk — IT Service Management & Infrastructure Operations |
| Document | Product Requirements Document |
| Version | 1.0 |
| Status | Draft for build |
| Owner | Product / Lead Engineer |
| Last updated | 2026-10-05 |
| Related docs | [TRD](./02-TRD.md) · [UI/UX](./03-UI-UX-Design.md) · [App Flow](./04-App-Flow.md) · [Backend Schema](./05-Backend-Schema.md) · [Implementation Plan](./06-Implementation-Plan.md) |

---

## 1. Summary

OpsDesk is a full-stack web application that gives small and medium-sized organizations (20–500 employees) a single operational workspace for internal IT. Employees report problems and request services; IT agents triage, assign, and resolve them against SLAs; managers oversee workload, SLA performance, incidents, and approvals; administrators configure users, teams, permissions, SLA policies, categories, and assets.

OpsDesk models **business processes, not CRUD**. Every primary record (ticket, asset, incident, change, onboarding request) has a lifecycle, an owner, a history, and audit events.

---

## 2. Problem

SMBs run IT through email, chat, spreadsheets, and informal approvals. This produces:

| # | Problem | Consequence |
|---|---|---|
| P1 | Poor request visibility | Employees don't know if an issue was received or is being worked |
| P2 | Poor accountability | No clear owner per request |
| P3 | Missed deadlines | No reliable SLA tracking |
| P4 | Weak asset records | Unknown device ownership / warranty status |
| P5 | Lost operational history | Troubleshooting knowledge buried in chat |
| P6 | Uncontrolled changes | Infra changes approved informally or not at all |
| P7 | Fragmented major incidents | Same outage reported N times, no central record |
| P8 | Limited management visibility | No view of workload, SLA compliance, repeat issues |

---

## 3. Goals & Non-Goals

### 3.1 Business goals
1. Centralize all internal IT requests in one system.
2. Make ownership explicit for every open record.
3. Standardize support workflows via enforced state machines.
4. Automate SLA tracking, warnings, escalation, and breach recording.
5. Provide an accurate, historical asset register.
6. Provide structured incident management (Phase 2).
7. Provide controlled change-request workflows (Phase 2).
8. Support IT onboarding/offboarding (Phase 2).
9. Preserve an immutable operational/audit history.
10. Provide operational (not decorative) reports.

### 3.2 Engineering goals
Demonstrate production-grade TypeScript full-stack engineering: modular NestJS API, PostgreSQL relational model via Prisma, RBAC + permission + ownership + scope authorization, explicit state machines, transactions and concurrency control, background jobs, consistent errors, secure uploads, and behavior-focused tests.

### 3.3 Non-goals (current scope)
- Infrastructure automation, CI/CD, container orchestration, cloud architecture, production monitoring.
- AI features (domain model must remain AI-ready; see §13).
- SSO, MFA, email-to-ticket, webhooks, custom fields, custom workflows (Phase 3).
- Native mobile apps (responsive web only: desktop, laptop, tablet).
- Multi-tenancy (single organization per deployment).

---

## 4. Target Users & Personas

| Persona | Role | Primary jobs-to-be-done | Success looks like |
|---|---|---|---|
| **Ahmed** — Finance analyst | `EMPLOYEE` | Report a problem, request equipment/access, track status, see assets | "I always know what's happening with my request." |
| **Sara** — Desktop support | `AGENT` | Work a prioritized queue, triage, communicate, resolve within SLA | "I see what's urgent and have the full context on one page." |
| **Omar** — IT manager | `MANAGER` | Balance workload, watch SLA risk, run incidents, approve changes | "I can spot problems before they become breaches." |
| **Lina** — Sysadmin | `ADMIN` | Configure users, roles, teams, categories, SLA policies, review audit | "The system's rules are configurable and every change is traceable." |

---

## 5. Scope by Phase

| Phase | Modules |
|---|---|
| **MVP (Phase 1)** | Auth & identity · Users · Roles & permissions · Departments & teams · Tickets (lifecycle, assignment, comments, internal notes, attachments, priority, categories) · SLA (policies, timers, warnings, breaches) · Assets (register, assignment, history, ticket link) · In-app notifications · Audit logs · Employee/Agent/Manager dashboards · Search, filtering, pagination |
| **Phase 2** | Incidents (timeline, ticket linking, RCA, postmortem) · Changes (risk, approvals, rollback) · Onboarding · Offboarding · Knowledge base · Advanced reporting · Admin dashboard · Notification preferences |
| **Phase 3** | Custom workflows · Custom fields · Advanced permissions · SSO · MFA · Email-to-ticket · Webhooks · Monitoring integrations · AI features |

The MVP must be fully usable without Phase 2 modules.

---

## 6. Functional Requirements

Requirement IDs are referenced by the [Implementation Plan](./06-Implementation-Plan.md) and tests. Priority: **M** = Must (MVP), **S** = Should (Phase 2), **C** = Could (Phase 3).

### 6.1 Authentication & Identity (AUTH)

| ID | Requirement | Pri |
|---|---|---|
| AUTH-1 | Users sign in with email + password. | M |
| AUTH-2 | Users can log out; the session/refresh token is revoked server-side. | M |
| AUTH-3 | Forgot-password flow: request → emailed single-use token (expires 30 min) → set new password. Response is identical whether or not the email exists. | M |
| AUTH-4 | Account statuses: `INVITED`, `ACTIVE`, `SUSPENDED`, `DISABLED`. Only `ACTIVE` users can authenticate. Status change to non-active revokes all sessions. | M |
| AUTH-5 | Invited users verify email and set a password via invitation link before becoming `ACTIVE`. | M |
| AUTH-6 | Login is rate-limited and failed attempts are audited. | M |

### 6.2 Users, Departments, Teams (USR / ORG)

| ID | Requirement | Pri |
|---|---|---|
| USR-1 | Admins list, search, filter, and paginate users. | M |
| USR-2 | Admins invite users (name, email, phone, department, team, role). | M |
| USR-3 | Admins edit organizational assignment and roles; activate/suspend/disable accounts. | M |
| USR-4 | Users view and edit their own profile (name, phone); email/role/status are admin-only. | M |
| USR-5 | Track `lastLoginAt`. | M |
| ORG-1 | Admins CRUD departments (e.g., Finance, HR, IT). Departments with members cannot be hard-deleted (archive instead). | M |
| ORG-2 | Admins CRUD support teams (e.g., Help Desk, Network). Teams have members and an optional team lead. | M |
| ORG-3 | A user belongs to at most one department and zero or more support teams. | M |

### 6.3 Roles & Permissions (RBAC)

| ID | Requirement | Pri |
|---|---|---|
| RBAC-1 | System roles: `EMPLOYEE`, `AGENT`, `MANAGER`, `ADMIN`. | M |
| RBAC-2 | Fine-grained permissions (`resource:action`, e.g. `ticket:assign`) are mapped to roles. | M |
| RBAC-3 | Authorization evaluates **permission + ownership + organizational scope** on the backend for every sensitive operation. | M |
| RBAC-4 | Admins view role→permission mappings. | M |
| RBAC-5 | Admins create custom roles and edit mappings. | C |
| RBAC-6 | Navigation and actions in the UI are hidden when the user lacks permission (UX only; never the sole control). | M |

### 6.4 Tickets (TKT)

| ID | Requirement | Pri |
|---|---|---|
| TKT-1 | Any authenticated user can create a ticket: title, description, type, category/subcategory, requester-suggested priority, optional asset (own assets only for employees), optional attachments. | M |
| TKT-2 | Ticket types: `INCIDENT`, `SERVICE_REQUEST`, `ACCESS_REQUEST`, `HARDWARE_REQUEST`, `SOFTWARE_REQUEST`. | M |
| TKT-3 | Human-readable key (e.g., `TKT-004821`) generated from a DB sequence. | M |
| TKT-4 | Status lifecycle enforced by a server-side state machine (see §7.1). Arbitrary status values are rejected with `TICKET_INVALID_TRANSITION`. | M |
| TKT-5 | Priorities `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Changing priority recalculates SLA targets and is audited. | M |
| TKT-6 | Categories and subcategories are configurable data with a default team for auto-routing. | M |
| TKT-7 | Assignment to a team and/or an individual agent (agent must be a member of the team). All assignment changes are recorded. | M |
| TKT-8 | Concurrent modifications are detected via optimistic locking (`version`); stale writes return `409 CONFLICT_STALE_VERSION`. | M |
| TKT-9 | Public comments (visible to requester) and internal notes (staff only). Visibility enforced in the API query layer. | M |
| TKT-10 | Attachments: max 10 MB each, max 10 per ticket, allow-listed MIME types (png, jpg, gif, webp, pdf, txt, log, csv, json, zip), content sniffing, sanitized names, stored outside web root, downloaded only via authorized endpoint. | M |
| TKT-11 | Every significant change creates a ticket history event (created, status, priority, assignment, comment, attachment, SLA, asset link, resolve, reopen, close). | M |
| TKT-12 | Resolving requires a resolution summary and resolution code. | M |
| TKT-13 | Requester can confirm resolution (→ `CLOSED`) or reopen within the reopen window (default 7 days). Resolved tickets auto-close after the window via background job. | M |
| TKT-14 | Closed tickets are read-only except for admin-level actions which are audited. | M |
| TKT-15 | Agents can link a ticket to an asset; the asset page lists related tickets (permission-filtered). | M |
| TKT-16 | Agents can link a ticket to an incident. | S |
| TKT-17 | Agents can attach knowledge articles to a ticket. | S |
| TKT-18 | Requester first public response by staff sets `firstResponseAt`. | M |

### 6.5 SLA (SLA)

| ID | Requirement | Pri |
|---|---|---|
| SLA-1 | Admins manage SLA policies: name, match criteria (priority, optional type/category), first-response target, resolution target, calendar (24×7 or business hours), warning thresholds (default 75% / 90%), active flag. | M |
| SLA-2 | On ticket creation and on priority/type/category change, the most specific matching active policy is selected deterministically. | M |
| SLA-3 | Each ticket tracks two SLA timers: first response and resolution, each with state `ON_TRACK`, `AT_RISK`, `BREACHED`, `PAUSED`, `COMPLETED`. | M |
| SLA-4 | Business-hours calendars (working days, start/end time, timezone, holidays) are honored when computing due times. | M |
| SLA-5 | Configurable pause rules: by default the resolution timer pauses in `WAITING_FOR_USER` and resumes on exit. Paused time is excluded from elapsed time. | M |
| SLA-6 | A background job evaluates timers every minute; crossing 75% → warning to assignee; 90% → escalation to team lead/manager; 100% → breach recorded + notifications. Each threshold fires once per timer. | M |
| SLA-7 | All SLA transitions are recorded as `SlaEvent`s (started, paused, resumed, warning, escalated, breached, completed, recalculated). | M |
| SLA-8 | UI shows remaining or overdue time with clear visual state. | M |

### 6.6 Assets (AST)

| ID | Requirement | Pri |
|---|---|---|
| AST-1 | Admins/agents with permission create and edit assets: tag (e.g. `LAP-00421`), type, name, manufacturer, model, serial number (unique), purchase date, cost, vendor, warranty expiry, location, department, notes. | M |
| AST-2 | Statuses: `PROCURED`, `IN_STOCK`, `ASSIGNED`, `IN_REPAIR`, `LOST`, `RETIRED`, `DISPOSED`, governed by a state machine (see §7.2). | M |
| AST-3 | Assigning an asset creates an `AssetAssignment`, closes any previous active assignment, sets status `ASSIGNED`, writes history + audit — atomically. | M |
| AST-4 | At most one active assignment per asset, enforced by a partial unique index. | M |
| AST-5 | `RETIRED`, `DISPOSED`, `LOST` assets cannot have an active assignment. | M |
| AST-6 | Full asset history: purchased, received, assigned, reassigned, unassigned, sent to repair, returned from repair, lost, retired, disposed. | M |
| AST-7 | Employees see "My Assets" (read-only). | M |
| AST-8 | Asset types are configurable data. | M |
| AST-9 | Warranty status (active / expiring within 30 days / expired) is derived and filterable. | M |

### 6.7 Notifications (NTF)

| ID | Requirement | Pri |
|---|---|---|
| NTF-1 | In-app notifications for: ticket assigned, ticket updated (status), public comment added, SLA warning, SLA breach; Phase 2: change awaiting approval/decided, incident declared/updated, onboarding task assigned. | M |
| NTF-2 | Notification bell with unread count; list with mark-as-read and mark-all-as-read. | M |
| NTF-3 | Notifications are created asynchronously by a worker from domain events (never block the request). | M |
| NTF-4 | Email delivery of selected notifications via queue (dev uses a mail catcher). | S |
| NTF-5 | Per-user preferences for non-critical notification types; SLA breach and incident SEV-1/2 remain mandatory. | S |

### 6.8 Audit (AUD)

| ID | Requirement | Pri |
|---|---|---|
| AUD-1 | Append-only audit log for security- and business-relevant actions (see TRD §9 for catalogue). | M |
| AUD-2 | Each entry: actor, action, entity type, entity id, timestamp, before/after (diff of changed fields only, secrets redacted), request id, IP, user agent. | M |
| AUD-3 | Audit records cannot be updated or deleted through the application; DB role lacks UPDATE/DELETE on the table. | M |
| AUD-4 | Users with `audit:view` can search and filter by actor, action, entity, and date range. | M |

### 6.9 Dashboards (DSH)

| ID | Requirement | Pri |
|---|---|---|
| DSH-1 | Employee: My open tickets · Awaiting my response · Recently resolved · My assets · Recent notifications. | M |
| DSH-2 | Agent: My tickets · Unassigned in my teams · Critical/High · SLA at risk · SLA breached · Waiting for user · Open incidents (P2). | M |
| DSH-3 | Manager: Open tickets · By priority · By status · Avg resolution time · SLA compliance % · Breaches · By team · Active incidents (P2) · Pending approvals (P2). | M |
| DSH-4 | Admin: Users total/active · Tickets · Incidents · Assets · Pending requests · SLA performance · Recent system activity. | S |
| DSH-5 | Each widget links to a pre-filtered list view. | M |

### 6.10 Search, Filter, Pagination (SRCH)

| ID | Requirement | Pri |
|---|---|---|
| SRCH-1 | Global search (⌘K / Ctrl+K) across tickets, assets, users (and incidents in P2), permission-filtered. | M |
| SRCH-2 | Ticket filters: status, priority, type, category, team, assignee, requester, department, asset, SLA state, created/updated date range. | M |
| SRCH-3 | Asset filters: type, status, department, assigned user, warranty state, location. | M |
| SRCH-4 | All lists use server-side pagination, sorting, and filtering; page size ≤ 100. | M |
| SRCH-5 | Filter state is reflected in the URL (shareable, back-button friendly). | M |
| SRCH-6 | Users can save personal ticket views. | S |

### 6.11 Incidents (INC) — Phase 2

| ID | Requirement | Pri |
|---|---|---|
| INC-1 | Users with `incident:create` declare incidents: title, description, severity (`SEV1`–`SEV4`), affected service, impact, started/detected time, owner, commander. | S |
| INC-2 | Lifecycle `IDENTIFIED → INVESTIGATING → MITIGATING → MONITORING → RESOLVED → CLOSED`, plus `ESCALATED`. | S |
| INC-3 | Append-only timeline; manual entries plus automatic entries for status/severity/owner changes and ticket links. | S |
| INC-4 | Link many tickets to one incident; linked tickets get a public status update option ("bulk notify requesters"). | S |
| INC-5 | Resolving requires root cause, impact, mitigation; closing SEV1/SEV2 requires a postmortem in `PUBLISHED` state. | S |
| INC-6 | Postmortem: summary, impact, timeline, root cause, contributing factors, went well, went wrong, corrective & preventive actions (each with owner and due date). | S |

### 6.12 Changes (CHG) — Phase 2

| ID | Requirement | Pri |
|---|---|---|
| CHG-1 | Change request: title, description, type (`STANDARD`, `NORMAL`, `EMERGENCY`), risk (`LOW`–`CRITICAL`), requester, owner, scheduled start/end, implementation/validation/rollback plans, affected services, optional linked incident. | S |
| CHG-2 | Lifecycle `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → SCHEDULED → IMPLEMENTING → VALIDATING → COMPLETED`; failure path `IMPLEMENTING/VALIDATING → FAILED → ROLLED_BACK → CLOSED`; `REJECTED`, `CANCELLED`. | S |
| CHG-3 | Approval rules configurable by type × risk (number of required approvals, approver role). Standard changes are pre-approved. Emergency changes may be implemented with one approval and retro-review. | S |
| CHG-4 | Approval decisions (`APPROVED`, `REJECTED`, `REQUEST_CHANGES`) are append-only records with approver, comment, timestamp. Requester cannot approve own change. | S |
| CHG-5 | Change cannot enter `IMPLEMENTING` unless approved (or standard) and current time ≥ scheduled start − tolerance. | S |
| CHG-6 | Schedule conflict warning when changes overlap on the same service. | S |

### 6.13 Onboarding / Offboarding (WF) — Phase 2

| ID | Requirement | Pri |
|---|---|---|
| WF-1 | Admin/HR-designated users create onboarding requests (new hire, start date, department, manager, required equipment/access). | S |
| WF-2 | Requests generate tasks from configurable templates (per department). | S |
| WF-3 | Task: title, owner (user or team), status (`PENDING`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `SKIPPED`), due date, completed at, notes, required flag. | S |
| WF-4 | Request completes only when all required tasks are `COMPLETED`/`SKIPPED` (skip requires reason). | S |
| WF-5 | Offboarding generates disable/revoke/recover tasks and pre-populates the employee's assigned assets as recovery tasks; completing recovery unassigns the asset. | S |
| WF-6 | Offboarding completion optionally sets the user to `DISABLED`. | S |

### 6.14 Knowledge Base (KB) — Phase 2

| ID | Requirement | Pri |
|---|---|---|
| KB-1 | Articles: title, summary, category, Markdown content, author, status, timestamps. | S |
| KB-2 | Lifecycle `DRAFT → REVIEW → PUBLISHED → ARCHIVED`. Employees see only `PUBLISHED`. | S |
| KB-3 | Full-text search on title/summary/content. | S |
| KB-4 | Suggested articles on ticket creation by category + keyword match. | S |

### 6.15 Reporting (RPT) — Phase 2 (basic in MVP dashboards)

| ID | Requirement | Pri |
|---|---|---|
| RPT-1 | Reports: volume, by category/priority/department/team/agent, avg first response, avg resolution, SLA compliance, breaches, incident frequency & severity distribution, asset distribution & status. | S |
| RPT-2 | Date filters: last 7/30/90 days, custom range. | S |
| RPT-3 | CSV export of any report. | S |

---

## 7. Lifecycle Rules (authoritative summary)

Full transition tables with permissions live in the [TRD §6](./02-TRD.md#6-domain-state-machines).

### 7.1 Ticket
```
NEW → TRIAGED → ASSIGNED → IN_PROGRESS ⇄ WAITING_FOR_USER
IN_PROGRESS → ESCALATED → IN_PROGRESS
IN_PROGRESS → RESOLVED → CLOSED
RESOLVED → REOPENED → IN_PROGRESS
NEW | TRIAGED | ASSIGNED → CANCELLED
```

### 7.2 Asset
```
PROCURED → IN_STOCK ⇄ ASSIGNED
IN_STOCK | ASSIGNED → IN_REPAIR → IN_STOCK | ASSIGNED
IN_STOCK | ASSIGNED | IN_REPAIR → LOST → IN_STOCK (found)
IN_STOCK | IN_REPAIR | LOST → RETIRED → DISPOSED
```

### 7.3 Incident / Change / Workflow
See PRD §6.11–6.13 and TRD §6.

---

## 8. Business Rules (cross-cutting)

| ID | Rule |
|---|---|
| BR-1 | A closed or cancelled ticket cannot be modified except by audited admin override. |
| BR-2 | The SLA policy is selected by backend rules from ticket attributes, never by the client. |
| BR-3 | Employees cannot read administrative records or other employees' tickets. |
| BR-4 | An asset has at most one active assignment. |
| BR-5 | Only users with `incident:manage` may change severity; only `incident:close` may close. |
| BR-6 | Normal/emergency changes require approval before `IMPLEMENTING`. |
| BR-7 | Every state change writes a domain history row and (if in the audit catalogue) an audit row in the same transaction. |
| BR-8 | Internal notes are never returned to users lacking `ticket:view_internal`. |
| BR-9 | An agent can only be assigned a ticket for a team they belong to. |
| BR-10 | A user cannot approve their own change request. |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | p95 API latency < 300 ms for list/detail endpoints at 100k tickets; dashboard < 1 s. |
| Scalability | Designed for 500 users, 200k tickets, 20k assets without architectural change. |
| Availability | Background job failures retry with backoff; no user request depends on job completion. |
| Security | OWASP ASVS L2-aligned: argon2id hashing, HttpOnly secure cookies, CSRF protection, rate limiting, input validation, output encoding, upload hardening, least-privilege DB roles, secrets via env. |
| Accessibility | WCAG 2.2 AA: keyboard navigation, focus management, labels, 4.5:1 contrast, non-color status cues. |
| Responsiveness | Desktop-first; usable at ≥ 768 px (tablet). |
| Auditability | 100% of catalogued actions produce audit entries (verified by tests). |
| Reliability | Data integrity enforced by DB constraints, not only application code. |
| Maintainability | Strict TypeScript, modular boundaries, lint + format, ≥ 80% coverage on domain services. |
| Observability (app-level) | Structured JSON logs with request id; health endpoint. (Production monitoring out of scope.) |
| Localization | English UI; all timestamps stored UTC, displayed in user timezone. |

---

## 10. Success Metrics

| Metric | Target |
|---|---|
| Tickets with an owner within 30 min of creation (business hours) | ≥ 95% |
| SLA compliance (resolution) | ≥ 90% |
| Mean time to first response (High) | < 30 min |
| Reopen rate | < 8% |
| Assets with a known current owner/location | 100% |
| Duplicate incident tickets linked to a parent incident (P2) | ≥ 90% |
| Catalogued actions audited | 100% |

---

## 11. Assumptions & Constraints

- Single organization per deployment; single primary timezone with per-user display timezone.
- Email sending is available via SMTP (dev: Mailpit).
- File storage is local disk in dev, S3-compatible in later environments through the same storage interface.
- Users are invited by admins (no public sign-up).

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| SLA business-hours math is error-prone | Pure, exhaustively unit-tested calculator; property-based tests on boundaries. |
| Permission sprawl | Central policy layer with table-driven tests per role × action. |
| Scope creep into Phase 2 before MVP is stable | Phase gates in the Implementation Plan; Definition of Done enforced. |
| Concurrency bugs on assignment | Optimistic locking + DB constraints + integration tests simulating races. |

---

## 13. Future AI Readiness

Not implemented now. Kept possible by: structured categories, resolution codes, clean text fields for description/resolution, append-only histories, KB articles as first-class data, and a domain-event outbox that future classifiers/summarizers can subscribe to.

---

## 14. Definition of Done (per feature)

A feature is done only when: DB model + migration · API · authorization · validation (FE + BE) · business rules · frontend · error handling · tests (unit + integration; e2e for primary flows) · audit behavior · docs updated.
