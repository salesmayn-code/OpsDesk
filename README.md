# OpsDesk

**IT Service Management & Infrastructure Operations — a full-stack web application for internal IT teams.**

OpsDesk gives small and medium-sized organizations (20–500 employees) a single operational workspace for internal IT. Employees report problems and request services; support agents triage, assign, and resolve them against SLAs; managers oversee workload, SLA performance, incidents, and approvals; administrators configure users, teams, permissions, SLA policies, categories, and assets.

OpsDesk models **business processes, not CRUD** — every primary record (ticket, asset, incident, change, onboarding request) has a lifecycle, an owner, a history, and audit events.

---

## Highlights

### Service desk (MVP)
- **Tickets** — enforced lifecycle state machine (`NEW → TRIAGED → ASSIGNED → IN_PROGRESS ⇄ WAITING_FOR_USER`, escalation, resolve/reopen/close), optimistic locking (`409 CONFLICT_STALE_VERSION`), idempotent creation, team auto-routing by category, watchers, full history.
- **SLA engine** — deterministic policy selection (category + type + priority scoring), DST-safe business-hours calculator, precomputed warning/escalation/due thresholds, pause on waiting-for-user, recalculation on priority change, and a BullMQ evaluator that fires each threshold exactly once with outbox + audit events.
- **Collaboration** — public comments vs staff-only internal notes (filtered at the query layer), first-response SLA capture, requester reply auto-resume, secure attachments (magic-byte sniffing, quotas, authorized streaming downloads).
- **Assets** — per-type tag sequences (`LAP-00421`), lifecycle state machine, transactional assignment with a single-active-assignment guarantee, warranty tracking, asset↔ticket links, "My assets".
- **Notifications, search & dashboards** — transactional outbox → async fan-out, unread bell, ⌘K global search (Postgres FTS + trigram, permission-scoped), role-aware dashboards, append-only audit log with changed-field diffs.
- **Auth & RBAC** — argon2id, 15-minute JWT access cookies + rotating opaque refresh tokens with reuse-detection family revocation, account lockout, per-identity rate limiting, permission + ownership + scope policies (invisible records return 404).

### Operational maturity (Phase 2)
- **Incidents** — severity (SEV1–SEV4), lifecycle, append-only timeline, ticket bundling with bulk requester notifications, postmortems (publish-gated closing for SEV1/SEV2) and action items.
- **Changes** — STANDARD/NORMAL/EMERGENCY with risk matrix, configurable approval rules, append-only decisions with a self-approval guard, 15-minute implementation-window guard, and service schedule-conflict detection.
- **Onboarding / offboarding** — department templates, checklist tasks with owners, offboarding asset-recovery coupling (completing recovery returns hardware to stock), and automatic account disabling on completion.
- **Knowledge base** — article lifecycle (DRAFT → REVIEW → PUBLISHED → ARCHIVED), full-text search, ticket-creation suggestions, ticket article linking, Markdown write/preview.
- **Reporting** — nightly `daily_ticket_stats` rollup, volume/SLA-compliance/breach/category/response-time reports with charts, and CSV export.
- **Administration** — users (invite, roles, status), catalog (categories, asset types), SLA policies + calendars with a preview calculator, workflow templates, services register, notification preferences, profile.

---

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5 (`strict`) everywhere |
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Server state | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Backend | NestJS 11 (Express) |
| Contracts | Zod schemas in `packages/contracts` shared by web and API |
| ORM / DB | Prisma 6 / PostgreSQL 16 (`pg_trgm`, `citext`, `btree_gist`) |
| Jobs | BullMQ on Redis 7 |
| Auth | argon2id + JWT access cookie + rotating opaque refresh tokens |
| Testing | Vitest + Jest/Supertest integration + Playwright E2E + axe |

---

## Repository layout

```text
opsdesk/
├── apps/
│   ├── api/          # NestJS API + BullMQ worker (prisma/, src/, test/)
│   └── web/          # Next.js frontend
├── packages/
│   ├── contracts/    # Zod schemas, DTO types, enums, error codes, permissions
│   └── config/       # shared tsconfig presets
├── e2e/              # Playwright end-to-end + accessibility suites
├── docs/             # PRD, TRD, UI/UX, App Flow, Backend Schema, Implementation Plan
└── docker-compose.yml
```

---

## Getting started

**Prerequisites:** Node.js ≥ 20, pnpm, Docker Desktop.

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (PostgreSQL 16, Redis 7, Mailpit)
pnpm infra:up

# 3. Configure the API environment
cp .env.example apps/api/.env

# 4. Create the schema and seed reference data (roles, users, categories, SLAs, assets, …)
pnpm db:migrate
pnpm db:seed

# 5. Run the API, the worker, and the web app (separate terminals)
pnpm --filter @opsdesk/api dev        # http://localhost:4000  (docs at /api/docs)
pnpm --filter @opsdesk/api worker     # SLA evaluator, auto-close, outbox, reports
pnpm --filter @opsdesk/web dev        # http://localhost:3000
```

### Demo accounts

All seeded accounts use the dev-only password `ChangeMe!12345`:

| Email | Role |
|---|---|
| `admin@opsdesk.local` | Administrator |
| `manager@opsdesk.local` / `manager2@opsdesk.local` | IT Manager |
| `agent@opsdesk.local` / `agent2@opsdesk.local` | Support Agent |
| `employee@opsdesk.local` | Employee |

Mailpit captures outbound email at http://localhost:8025.

---

## Commands

| Command | Purpose |
|---|---|
| `pnpm build` | Build every package |
| `pnpm dev` | Run all dev servers via Turborepo |
| `pnpm verify` | Full gate: typecheck → lint → unit tests → build |
| `pnpm test:unit` | Unit tests (domain state machines, SLA math, contracts) |
| `pnpm test:integration` | API integration tests against a real database |
| `pnpm test:e2e` | Playwright end-to-end + accessibility suites |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / seed reference data |
| `pnpm infra:up` / `pnpm infra:down` | Start / stop local Docker services |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |

---

## Architecture principles

- **Contract-first** — every API boundary is a Zod schema in `packages/contracts`; TypeScript types are derived, never hand-written twice.
- **Pure domain logic** — state machines (ticket, asset, incident, change, workflow task, article) and the SLA business-hours calculator live in `domain/` with no Nest or Prisma imports, and are unit-tested exhaustively.
- **Explicit transitions** — status changes go through action endpoints validated server-side; arbitrary field updates are rejected.
- **Transactional integrity** — history, audit rows, and outbox events are written in the same transaction as the state change.
- **Transactional outbox** — asynchronous side effects (notifications, SLA events) are dispatched from an outbox poller, so nothing is sent for a rolled-back write.
- **Optimistic locking** — mutable aggregates carry a `version`; stale writes return `409` with the current record.
- **DB as the last line** — partial unique indexes, check constraints, and append-only triggers enforce invariants even if application code is bypassed.
- **Least privilege** — permission gates plus ownership/scope policies; list queries are scoped so unauthorized rows are never fetched.

---

## Testing

```bash
pnpm verify                            # typecheck + lint + unit + build
pnpm --filter @opsdesk/api test:integration   # 76 integration tests
pnpm test:e2e                          # 34 Playwright tests (E2E-1…12 + axe WCAG 2.2 AA)
```

The E2E suite boots the API, worker, and web app, then exercises the full product across all four personas — including SLA pause/resume, optimistic-locking conflicts, RBAC boundaries, incident/change/workflow flows, and accessibility checks on every primary page.

---

## Documentation

The canonical specifications live in [`docs/`](docs/):

- [Product Requirements (PRD)](docs/01-PRD.md)
- [Technical Requirements (TRD)](docs/02-TRD.md)
- [UI/UX Design](docs/03-UI-UX-Design.md)
- [Application Flow](docs/04-App-Flow.md)
- [Backend Schema](docs/05-Backend-Schema.md)
- [Implementation Plan](docs/06-Implementation-Plan.md)

---

## License

[MIT](LICENSE)
