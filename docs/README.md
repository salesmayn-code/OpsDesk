# OpsDesk Documentation

Welcome to the **OpsDesk** documentation directory. OpsDesk is a full-stack IT Service Management (ITSM) and Infrastructure Operations web application engineered around real organizational workflows.

---

## Documentation Index

| # | Document | Purpose & Scope |
|---|---|---|
| **01** | [Product Requirements Document (PRD)](./01-PRD.md) | Business context, target personas, functional requirements catalogue (AUTH, USR, TKT, SLA, AST, INC, CHG, WF, NTF, AUD), non-functional requirements, scope phasing (MVP vs Phase 2 vs Phase 3). |
| **02** | [Technical Requirements Document (TRD)](./02-TRD.md) | Engineering architecture, technology stack (Next.js 15, NestJS 11, Prisma 6, PostgreSQL 16, BullMQ), state machines, authorization model, SLA calculator, background processing, API contracts, security posture, and test strategy. |
| **03** | [UI/UX Design Specification](./03-UI-UX-Design.md) | Design principles, color and typography tokens, app shell layout, component specifications (StatusBadge, SlaTimer, DataTable, Timeline), screen wireframes, interaction behaviors, and WCAG 2.2 AA accessibility rules. |
| **04** | [Application Flow](./04-App-Flow.md) | Complete user journeys and system sequence diagrams: login & session refresh, ticket creation, triage & assignment, comment & SLA pause/resume, hardware repair lifecycle, incident management, change approvals, and Playwright E2E scenarios. |
| **05** | [Backend Schema](./05-Backend-Schema.md) | Complete Prisma schema with 35+ models, PostgreSQL extensions (`pg_trgm`, `citext`, `btree_gist`), raw SQL triggers and constraints (partial unique indexes for assets and SLA timers), database roles, and seed specification. |
| **06** | [Implementation Plan](./06-Implementation-Plan.md) | Phased engineering roadmap (Phase 0 Foundation, Phase 1 MVP Sprints 1.1–1.7, Phase 2 Sprints 2.1–2.5, Phase 3 Extensions), testing pyramid, risk mitigations, quality gates, and Definition of Done. |

---

## Agent Skills & Guidelines

This repository has been configured with two core agent harnesses in `.agents/`:

1. **Ponytail (`.agents/skills/ponytail*`, `.agents/rules/ponytail.md`)**:
   - Channels the "lazy senior developer" mindset.
   - Enforces the 7-rung decision ladder before writing code: YAGNI → Reuse existing code → Standard library → Native platform → Existing dependency → Single line → Minimal code.
   - Prohibits speculative abstractions, premature generalizations, and symptom-only patching.

2. **Everything Claude Code / ECC (`.agents/skills/*`, `.agents/rules/*`)**:
   - Comprehensive engineering skills covering NestJS, Prisma, PostgreSQL, React performance, Next.js Turbopack, WCAG accessibility, TDD workflows, and contract-first API design.
   - Quality gate verification loops for all PRs and deliverables.
