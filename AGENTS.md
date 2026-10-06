# OpsDesk Agent Operating System & Guidelines

This repository contains the architecture, specification, and implementation for **OpsDesk** (IT Service Management & Infrastructure Operations Web Application).

---

## 1. Documentation Index

Before designing or modifying any feature, consult the canonical documentation in `docs/`:
- [PRD (`docs/01-PRD.md`)](file:///d:/Projects/Personal/Workaro/docs/01-PRD.md): Product scope, user roles, functional requirements catalogue, and MVP vs Phase 2 boundary.
- [TRD (`docs/02-TRD.md`)](file:///d:/Projects/Personal/Workaro/docs/02-TRD.md): Tech stack, NestJS/Next.js/Prisma architecture, state machines, SLA engine, security, and testing strategy.
- [UI/UX Design (`docs/03-UI-UX-Design.md`)](file:///d:/Projects/Personal/Workaro/docs/03-UI-UX-Design.md): Design tokens, component library, screen wireframes, and WCAG 2.2 AA accessibility requirements.
- [App Flow (`docs/04-App-Flow.md`)](file:///d:/Projects/Personal/Workaro/docs/04-App-Flow.md): User journeys, sequence diagrams, state diagrams, and E2E scenarios.
- [Backend Schema (`docs/05-Backend-Schema.md`)](file:///d:/Projects/Personal/Workaro/docs/05-Backend-Schema.md): Prisma schema, PostgreSQL extensions, raw SQL triggers/constraints, and seed specification.
- [Implementation Plan (`docs/06-Implementation-Plan.md`)](file:///d:/Projects/Personal/Workaro/docs/06-Implementation-Plan.md): Sprints, task breakdown, testing pyramid, risk management, and Definition of Done.

---

## 2. The Ponytail Mindset (Lazy Senior Dev Mode)

You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.

Before writing any code, stop at the first rung that holds:
1. **Necessity (YAGNI):** Does this need to be built at all?
2. **Reuse:** Does it already exist in this codebase? Reuse existing utilities and patterns.
3. **Standard Library:** Does the standard library already do this? Use it.
4. **Native Platform:** Does a native platform feature cover it? Use it.
5. **Existing Dependencies:** Does an already-installed dependency solve it? Use it.
6. **Minimalism:** Can this be one line? Make it one line.
7. **Minimal Code:** Only then write the minimum code that works.

### Key Rules:
- No abstractions that were not explicitly requested.
- No new dependencies if existing ones or the standard library suffice.
- Deletion over addition. Boring over clever. Fewest files possible.
- **Root Cause, Not Symptom:** When fixing a bug, find and fix the root cause once rather than patching callers individually.
- Mark deliberate simplifications with `// ponytail: [rationale and ceiling]`.

---

## 3. Everything Claude Code (ECC) Engineering Rules

Adhere to the ECC quality standards across all code:
- **Contract-First:** Define schemas in `packages/contracts` first using Zod. Derive TypeScript types from schemas.
- **Modular Backend:** Controllers remain thin. Business logic resides in domain services. Authorization policies live in dedicated policy files.
- **Domain State Machines:** Validate transitions server-side with explicit action endpoints (`POST /tickets/:id/transitions`), never arbitrary field updates.
- **Concurrency Protection:** Guard mutable entities (`Ticket`, `Asset`, `Incident`, `ChangeRequest`) with optimistic locking (`version`).
- **Audit & Outbox in Same Transaction:** State changes must write history, audit log, and outbox event rows in the same DB transaction.
- **Accessibility:** Ensure all frontend components meet WCAG 2.2 Level AA.

---

## 4. Agent Skills Available

Specialized skills are installed in `.agents/skills/`:
- **Architecture & Backend:** `nestjs-patterns`, `prisma-patterns`, `postgres-patterns`, `database-migrations`, `redis-patterns`, `api-design`, `backend-patterns`, `contract-first`, `error-handling`.
- **Frontend & UI:** `nextjs-turbopack`, `react-patterns`, `react-performance`, `react-testing`, `frontend-patterns`, `frontend-design-direction`, `frontend-a11y`, `accessibility`, `design-system`, `make-interfaces-feel-better`, `dashboard-builder`.
- **Quality & Verification:** `tdd-workflow`, `e2e-testing`, `browser-qa`, `verification-loop`, `security-review`, `security-scan`, `coding-standards`.
- **Documentation & Workflow:** `architecture-decision-records`, `living-docs-governance`, `git-workflow`, `search-first`, `documentation-lookup`.
- **Ponytail:** `ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `ponytail-review`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
