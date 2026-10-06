# OpsDesk — UI/UX Design Specification

| Field | Value |
|---|---|
| Document | UI/UX Design |
| Version | 1.0 |
| Related | [PRD](./01-PRD.md) · [App Flow](./04-App-Flow.md) · [TRD §11](./02-TRD.md#11-frontend-architecture) |

---

## 1. Design Principles

| Principle | What it means in OpsDesk |
|---|---|
| **Operational clarity first** | Status, priority, SLA, owner are visible above the fold on every record. |
| **Density with hierarchy** | Agents live in tables; use compact rows, but strong typographic hierarchy and whitespace between groups. |
| **State is never color-only** | Every badge = color + icon + text. |
| **One primary action per view** | The next logical step (Assign, Start, Resolve, Approve) is the prominent button; others go in a menu. |
| **The UI reflects the domain** | Only allowed transitions are offered (from `allowed-transitions`); disabled actions explain why via tooltip. |
| **Fast for experts, clear for novices** | Keyboard shortcuts and ⌘K for agents; guided forms and plain language for employees. |
| **Calm, professional** | Neutral surfaces, restrained accent color, no decorative gradients or illustrations in work areas. |

Tone: a serious internal business tool — closer to Linear / Jira Service Management / Zendesk than a marketing dashboard.

---

## 2. Design Tokens

### 2.1 Color (light theme; dark theme mirrors with adjusted luminance)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F7F8FA` | App background |
| `--surface` | `#FFFFFF` | Cards, tables, panels |
| `--surface-muted` | `#F1F3F6` | Table header, sidebar hover |
| `--border` | `#E2E6EB` | Dividers, inputs |
| `--text` | `#111827` | Primary text |
| `--text-muted` | `#5B6472` | Secondary text (≥ 4.5:1 on surface) |
| `--primary` | `#2F5BEA` | Primary buttons, links, focus |
| `--primary-hover` | `#2449C4` | |
| `--focus-ring` | `#2F5BEA` @ 40% | 2 px outline + 2 px offset |

**Semantic status palette** (bg / fg pairs, each ≥ 4.5:1):

| Semantic | Background | Foreground | Used for |
|---|---|---|---|
| Neutral | `#EEF0F3` | `#374151` | NEW, DRAFT, PROCURED, LOW |
| Info | `#E6EEFF` | `#1E40AF` | TRIAGED, ASSIGNED, IN_STOCK, SEV4 |
| Progress | `#E8F1FB` | `#0B5CAD` | IN_PROGRESS, IMPLEMENTING, INVESTIGATING |
| Waiting | `#FFF4E0` | `#8A4B00` | WAITING_FOR_USER, PAUSED, UNDER_REVIEW, MEDIUM |
| Warning | `#FFF1E6` | `#9A3412` | AT_RISK, ESCALATED, HIGH, SEV3, IN_REPAIR |
| Danger | `#FDECEC` | `#B42318` | BREACHED, CRITICAL, SEV1/SEV2, FAILED, LOST, REJECTED |
| Success | `#E7F6EC` | `#166534` | RESOLVED, COMPLETED, APPROVED, ON_TRACK |
| Muted | `#F3F4F6` | `#6B7280` | CLOSED, CANCELLED, RETIRED, DISPOSED, ARCHIVED |

### 2.2 Typography

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 24/32 | 600 | Page titles |
| `title` | 18/28 | 600 | Section headers, record titles |
| `body` | 14/20 | 400 | Default |
| `body-strong` | 14/20 | 500 | Labels, table emphasis |
| `small` | 12/16 | 400/500 | Meta, badges, table secondary |
| `mono` | 13/20 | 500 | Keys (`TKT-004821`), serials, timers |

Font: **Inter** (UI), **JetBrains Mono** (keys/timers). Tabular numerals for all numbers in tables and timers.

### 2.3 Spacing, radius, elevation

- 4 px base grid: `4, 8, 12, 16, 24, 32, 48`.
- Radius: `6px` controls, `8px` cards, `9999px` badges.
- Elevation: borders over shadows; `shadow-sm` only for popovers/dialogs.
- Table row height: 40 px (compact), 48 px (comfortable — user toggle).

### 2.4 Iconography

Lucide icons, 16 px in tables/badges, 20 px in nav. Status icons: `Circle` (new), `CircleDot` (in progress), `Clock` (waiting), `AlertTriangle` (at risk/escalated), `XOctagon` (breached), `CheckCircle2` (resolved), `Lock` (closed).

---

## 3. Layout & Navigation

### 3.1 App shell

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ▣ OpsDesk   [ ⌘K  Search tickets, assets, people…        ]   (+) New ▾  🔔3  (AK)▾ │  ← Top bar 56px
├───────────────┬──────────────────────────────────────────────────────────┤
│ Dashboard     │  Breadcrumbs: Service Desk / Tickets / TKT-004821         │
│               │                                                          │
│ SERVICE DESK  │  ┌──────────────── Page content ───────────────────────┐ │
│  Tickets      │  │                                                     │ │
│  My Queue  12 │  │                                                     │ │
│               │  │                                                     │ │
│ OPERATIONS    │  │                                                     │ │
│  Incidents  1 │  │                                                     │ │
│  Changes      │  │                                                     │ │
│               │  │                                                     │ │
│ ASSETS        │  └─────────────────────────────────────────────────────┘ │
│  All Assets   │                                                          │
│  My Assets    │                                                          │
│ PEOPLE …      │                                                          │
│ WORKFLOWS …   │                                                          │
│ KNOWLEDGE     │                                                          │
│ REPORTS       │                                                          │
│ ADMIN …       │                                                          │
│               │                                                          │
│ « Collapse    │                                                          │
└───────────────┴──────────────────────────────────────────────────────────┘
  Sidebar 240px (64px collapsed)
```

- Sidebar groups are rendered from a single nav config filtered by `can()`. Employees see: Dashboard, My Tickets, My Assets, Knowledge, Notifications.
- Counters (My Queue, Incidents) are live counts (polled with notifications).
- `(+) New ▾` offers only creatable types for the user (Ticket; plus Incident, Change, Asset for staff).
- Tablet (< 1024 px): sidebar collapses to icons; < 768 px: off-canvas drawer.

### 3.2 Navigation map by role

| Section | Employee | Agent | Manager | Admin |
|---|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| My Tickets / New Ticket | ✅ | ✅ | ✅ | ✅ |
| Tickets (team/all), My Queue | – | ✅ | ✅ | ✅ |
| Incidents, Changes (P2) | – | ✅ | ✅ | ✅ |
| All Assets | – | ✅ | ✅ | ✅ |
| My Assets | ✅ | ✅ | ✅ | ✅ |
| Users / Teams / Departments | – | directory | ✅ | ✅ |
| Onboarding / Offboarding (P2) | – | tasks | ✅ | ✅ |
| Knowledge Base | read | ✅ | ✅ | ✅ |
| Reports | – | – | ✅ | ✅ |
| Administration | – | – | Audit (scoped) | ✅ |

---

## 4. Component Library

Built on shadcn/ui; OpsDesk composites live in `components/`.

| Component | Spec |
|---|---|
| `StatusBadge` | Pill, icon + label, semantic palette by `(entity, status)` map from contracts. `aria-label="Status: In progress"`. |
| `PriorityBadge` | Chevron icon count (LOW 1 … CRITICAL 4 / flame), color from palette. |
| `SeverityBadge` | `SEV1` solid danger fill white text; SEV2 danger tint; SEV3 warning; SEV4 info. |
| `SlaTimer` | Shows kind, state, remaining/overdue (`01h 42m remaining`, `Breached 23m ago`, `Paused`), progress bar of % consumed with 75/90 tick marks. Updates every 30 s client-side from `dueAt` + server time offset. `role="timer"`, `aria-live="off"`; state changes announced via polite live region. |
| `UserChip` | Avatar initials + name; hover card with dept/team/email. |
| `KeyLink` | Monospace entity key, copy-on-click, opens record. |
| `DataTable` | TanStack Table; server-side sort/paginate; sticky header; row selection (bulk actions for agents: assign, change priority); column visibility menu; density toggle; empty, loading (skeleton rows), error states. Row is a link (Enter opens). |
| `FilterBar` | Search input + filter chips (`Status: New, Triaged ✕`) + "Add filter" popover + "Clear all" + saved views (P2). Synced to URL. |
| `Timeline` | Vertical list of events with icon, actor, relative time (absolute on hover), diff text (`Priority: Medium → High`). Internal events marked with lock icon and amber left border. |
| `CommentComposer` | Tabs **Reply (public)** / **Internal note**. Internal note tab has amber background and label "Only IT staff can see this". Markdown with preview, attach files, `⌘Enter` to send. Option on reply: "Send and set Waiting for user". |
| `TransitionMenu` | Primary button for the recommended next status, dropdown for other allowed transitions. Opens `TransitionDialog` when reason/resolution required. |
| `ConfirmDialog` | For destructive/irreversible actions; states consequence; typed confirmation for dispose/disable user. |
| `ConflictBanner` | On `409`: "This record was changed by {name} {time}. Reload to see changes." with Reload button; preserves unsent form input. |
| `EmptyState` | Icon, one-line explanation, primary action. No illustrations. |
| `StatCard` | Label, value, delta vs previous period, links to filtered list. |
| `FileDropzone` | Drag/drop + button; shows allowed types and size; per-file progress; inline errors (`Too large (14 MB / 10 MB max)`). |
| `PermissionGate` | Renders children only if `can(permission)`; never used as the only protection. |

---

## 5. Screen Specifications

### 5.1 Auth screens

**Login (`/login`)** — centered 400 px card: logo, "Sign in to OpsDesk", Email, Password (show/hide), "Forgot password?", primary "Sign in". Errors: generic "Email or password is incorrect" (no user enumeration); lock message "Too many attempts. Try again in 15 minutes." Suspended: "Your account is not active. Contact IT."

**Forgot / Reset / Accept invite** — single-purpose forms; password rules shown live (≥ 12 chars); success screen with next step.

### 5.2 Dashboards (`/dashboard`)

Role determines layout; all widgets link to filtered lists.

**Employee**
```text
┌ Welcome back, Ahmed ───────────────────────────── [ + Report a problem ] ┐
├──────────────────────────┬──────────────────────────┬────────────────────┤
│ My open tickets      3   │ Awaiting my response  1  │ Resolved (30d)  4  │
├──────────────────────────┴──────────────────────────┴────────────────────┤
│ ⚠ Action needed: TKT-004821 "Laptop keeps freezing" — Sara asked a question │
├───────────────────────────────────────────┬──────────────────────────────┤
│ My tickets (table: key, title, status,    │ My assets                    │
│ updated)                                  │  LAP-00421 Dell Latitude 5550│
│                                           │  MON-00112 Dell P2422H       │
├───────────────────────────────────────────┼──────────────────────────────┤
│ Suggested articles (P2)                   │ Recent notifications         │
└───────────────────────────────────────────┴──────────────────────────────┘
```

**Agent**
```text
┌ Stat row: My open 12 · Unassigned (my teams) 5 · SLA at risk 3 · Breached 1 · Waiting for user 4 ┐
├───────────────────────────────────────────────────────────────────────────┤
│ Needs attention (sorted: breached → at risk → critical → oldest)          │
│ KEY        TITLE                    PRI   STATUS       SLA          REQ   │
│ TKT-4810   VPN drops every hour     HIGH  IN_PROGRESS  ⛔ 23m over  Lina │
│ TKT-4821   Laptop keeps freezing    MED   IN_PROGRESS  ⚠ 01h 42m   Ahmed│
├───────────────────────────────────┬───────────────────────────────────────┤
│ Unassigned in my teams (claim ▶)  │ Open incidents (P2)                   │
└───────────────────────────────────┴───────────────────────────────────────┘
```

**Manager** — stat row (Open, SLA compliance 30d %, Avg resolution, Breaches 7d, Active incidents, Pending approvals); charts: tickets by priority (stacked bar by status), created vs resolved (line, 30d), by team workload (bar with per-agent drilldown), SLA compliance trend; tables: breached tickets, pending approvals.

**Admin (P2)** — users total/active/invited, tickets, assets by status, incidents, pending workflow requests, SLA performance, recent audit activity feed.

### 5.3 Ticket list (`/tickets`)

```text
Tickets                                                    [ + New ticket ]
[ Mine ][ My teams ][ Unassigned ][ All ]                     ← view tabs (permission-based)
┌ 🔍 Search…  [Status: Open ▾] [Priority ▾] [Team ▾] [Assignee ▾] [SLA ▾] [+ Filter] Clear ┐
│ ☐ KEY ↕     TITLE                       TYPE      PRI    STATUS        SLA          ASSIGNEE  UPDATED ↓ │
│ ☐ TKT-4821  Laptop keeps freezing       Incident  MED    In progress   ⚠ 01h 42m    Sara K.   5m ago    │
│ ☐ TKT-4819  Request Adobe Acrobat       Software  LOW    Waiting       ⏸ Paused     Omar R.   1h ago    │
│ …                                                                                                   │
└ Showing 1–25 of 312        [25 ▾]                                    ‹ 1 2 3 … 13 › ┘
Bulk bar (on selection): Assign to… · Set priority… · Add watcher
```

- Default sort: SLA urgency for agents, updated desc for employees.
- "Open" is a virtual status group = all non-terminal statuses.
- Row hover reveals quick actions: Assign to me, Open in new tab.

### 5.4 New ticket (`/tickets/new`)

Two-step guided form for employees; single form for agents (with "On behalf of" requester picker).

1. **What do you need?** — type cards: *Something is broken* (INCIDENT), *Request equipment* (HARDWARE), *Request software* (SOFTWARE), *Request access* (ACCESS), *Other service* (SERVICE_REQUEST).
2. **Details** — Title*, Category* → Subcategory, Description* (Markdown, template prompt per type e.g. "What happened? When did it start? Error messages?"), Impact/urgency ("Just me / My team / Whole company" + "Blocking my work?") → suggested priority (employee-facing; agents set actual priority), Affected asset (dropdown of *my assets*), Attachments.
3. Side panel: **Suggested articles** (P2) as user types.
4. Submit → success page with ticket key and "What happens next" (team, SLA first-response target in plain language: "IT will respond within 4 business hours").

### 5.5 Ticket detail (`/tickets/[key]`) — core screen

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Service Desk / Tickets / TKT-004821                                    ☆ Watch  ⋯ More   │
│ Laptop keeps freezing                                                                   │
│ [● In progress] [▲▲ High] [Incident]      SLA Resolution ⚠ 01h 42m remaining ▓▓▓▓▓▓░░ 78% │
│                                           SLA Response   ✓ Met (12m)                     │
│                                  [ Resolve ▸ ]  [ Waiting for user ] [ ▾ more transitions ] │
├───────────────────────────────────────────────────────────────┬──────────────────────────┤
│ Description                                                   │ DETAILS                  │
│  Laptop freezes several times during the day…                 │ Requester  Ahmed (Finance)│
│  📎 screenshot.png  📎 eventlog.txt                            │ Assignee   Sara K.  [✎]  │
│                                                               │ Team       Desktop Supp.│
├───────────────────────────────────────────────────────────────┤ Category   Hardware ›   │
│ [ Activity ] [ Comments only ] [ History only ]               │            Laptop        │
│                                                               │ Priority   High    [✎]   │
│  ● Ahmed created the ticket · 10:02                           │ Asset      LAP-00421 ↗   │
│  ● System applied SLA "High" · 10:02                          │ Incident   — Link (P2)   │
│  ● Sara assigned to herself · 10:05                           │ Created    Oct 5, 10:02  │
│  🔒 Sara (internal): Checked diagnostics, HW errors · 10:20   │ Updated    5m ago        │
│  ● Priority Medium → High · 10:21                             │ Watchers   2  +          │
│  💬 Sara: We're investigating… · 10:22                        ├──────────────────────────┤
│                                                               │ ASSET LAP-00421          │
│ ┌ [ Reply ] [ 🔒 Internal note ] ───────────────────────────┐ │ Dell Latitude 5550       │
│ │ Write a reply…                                            │ │ Assigned · Warranty ✓    │
│ │ 📎  Markdown supported      ☐ Set Waiting for user  [Send]│ │ 3 previous tickets ↗     │
│ └───────────────────────────────────────────────────────────┘ ├──────────────────────────┤
│                                                               │ RELATED ARTICLES (P2)    │
└───────────────────────────────────────────────────────────────┴──────────────────────────┘
```

Rules:
- Header is sticky on scroll (key, title, status, SLA, primary action).
- **Employee view**: no internal notes, no internal history events, no edit pencils; actions limited to Reply, Cancel (NEW only), Confirm resolution / Reopen (RESOLVED within window). A banner when `WAITING_FOR_USER`: "IT is waiting for your reply."
- **RESOLVED view for requester**: card "Was this resolved?" [Yes, close ticket] [No, reopen] with reopen-deadline text.
- Resolve dialog: Resolution code* (select), Summary* (public), optional internal note, checkbox "Notify requester" (default on).
- Assign popover: Team select → Agent select (filtered to team members, shows each agent's open count), "Assign to me" shortcut.
- Closed/cancelled: read-only, grey header band "Closed on Oct 6 · Read-only".

Keyboard: `A` assign, `M` assign to me, `R` reply, `N` internal note, `S` change status, `P` priority, `/` focus search, `?` shortcut help.

### 5.6 Asset list & detail

**List (`/assets`)** — columns: Tag, Name, Type, Status, Assigned to, Department, Location, Warranty (✓ Active / ⚠ Expires in 21d / ✕ Expired), Updated. Filters per PRD SRCH-3.

**Detail (`/assets/[tag]`)**
```text
LAP-00421  Dell Latitude 5550                [● Assigned]        [ Reassign ] [ ▾ Send to repair · Return · Mark lost · Retire ]
┌ Identity ─────────────┬ Assignment ──────────────┬ Lifecycle ───────────────┐
│ Type   Laptop         │ Ahmed (Finance)          │ Purchased  2025-06-01    │
│ Serial 7XK2-…         │ Since 2025-06-12         │ Warranty   ✓ to 2028-06  │
│ Mfr    Dell           │ Location HQ Floor 3      │ Vendor     Dell PK       │
└───────────────────────┴──────────────────────────┴──────────────────────────┘
[ History ] [ Assignments ] [ Related tickets (3) ] [ Audit ]
```
Assign dialog: user search (active users only), note, effective date; warns if user already holds an asset of same type.

### 5.7 Notifications

Bell popover (latest 10, unread dot, "Mark all read", "View all") and `/notifications` page with filters (Unread, Tickets, SLA, Assets). Each item: icon by type, title, message, relative time, entity link. Critical (SLA breach, SEV1) items show danger accent.

### 5.8 Administration

- **Users**: table + invite drawer; user detail with tabs Profile · Roles · Teams · Sessions · Audit. Status changes via `ConfirmDialog` with reason.
- **Teams/Departments**: list + side drawer edit; member multi-select; lead select.
- **Categories**: tree editor (drag to reorder), default team per category, active toggle.
- **SLA policies**: table (name, match criteria, targets, calendar, active); editor form with **Preview** panel ("A High Incident in Network created Fri 17:30 would be due: response Fri 18:00, resolution Mon 12:30").
- **Business calendars**: weekly hours grid + holiday list.
- **Roles & permissions**: matrix view (roles × permissions), read-only for system roles in MVP.
- **Audit logs**: dense table (time, actor, action, entity, request id), filters, row expands to before/after diff (JSON diff view).
- **Settings**: grouped form (General, Tickets, Uploads, Security).

### 5.9 Phase 2 screens

**Incident detail** — prominent severity band across the top (SEV1 = solid red bar with "MAJOR INCIDENT"), status stepper (`Identified → Investigating → Mitigating → Monitoring → Resolved → Closed`), duration counter since start, owner/commander chips, affected service, impact. Main column: Timeline (append-only, "Add update" composer with type select: Note / Mitigation / Communication) · Linked tickets table with "Link tickets" search and "Notify all requesters". Right panel: Root cause & resolution fields (editable when allowed), Postmortem card (status + open).

**Postmortem editor** — sectioned document form (Summary … Preventive actions), action items table (description, owner, due, status), Publish button (requires all required sections).

**Change detail** — header with type, risk, status stepper; **Approval panel** (required N, received approvals list with decision icons and comments, "Approve / Request changes / Reject" buttons for eligible approvers — disabled with tooltip "You requested this change" for self). Tabs: Plan (implementation/validation/rollback), Schedule (calendar mini-view with conflicts), History.

**Change calendar** — week/month view of scheduled changes, color by risk.

**Onboarding/Offboarding detail** — header (subject user, effective date, progress `6/9 tasks`), checklist grouped by owner team with status pills, inline status change, blocked tasks highlighted; Complete button disabled until required tasks done (tooltip lists missing).

**Knowledge base** — list with search and category facets; article reader (TOC, last updated, "Was this helpful?"); editor with Markdown + preview, status workflow buttons.

**Reports** — report picker sidebar; date range control (7/30/90/custom); chart + data table below; Export CSV.

---

## 6. Interaction Patterns

| Pattern | Rule |
|---|---|
| Loading | Skeletons matching final layout; never block whole page with spinner after first load. |
| Saving | Buttons show spinner + disabled; success → toast ("Ticket assigned to Sara"); failure → inline error + toast with request id for 5xx. |
| Validation | Inline under field on blur and submit; error summary at top of long forms linking to fields; server `VALIDATION_FAILED.details` mapped to fields. |
| Destructive | `ConfirmDialog` explaining consequence; typed confirmation for irreversible (dispose asset, disable user). |
| Undo | For low-risk actions (mark read, unwatch) — toast with Undo 5 s. Not for state transitions (they're audited). |
| Optimistic UI | Only for notifications read & watchers. |
| Conflicts | `ConflictBanner` (see §4). |
| Time | Relative (“5m ago”) with absolute tooltip in user TZ; SLA uses exact durations. |
| Empty states | Explain + primary action ("No tickets match these filters. Clear filters"). |
| Errors | 403 page: "You don't have access to this page." 404: "Ticket not found or you don't have access." 500: friendly + request id + retry. |

---

## 7. Accessibility (WCAG 2.2 AA)

- Semantic landmarks: `header`, `nav[aria-label="Main"]`, `main`, `aside`.
- Skip link "Skip to content" as first focusable element.
- All interactive elements keyboard reachable; visible focus ring (never removed).
- Radix primitives for dialogs/menus (focus trap, `Esc` to close, focus return to trigger).
- Tables: `<table>` semantics, `scope="col"`, sortable headers are buttons with `aria-sort`.
- Forms: `<label for>`, required marked with `*` + `aria-required`, errors via `aria-describedby` and `aria-invalid`; error summary focused on submit failure.
- Live regions: toasts (`role="status"`), SLA state change announcements (polite), form errors (assertive on submit).
- Color contrast ≥ 4.5:1 text, ≥ 3:1 UI components; status never conveyed by color alone.
- Target size ≥ 24×24 px; reduced-motion respected.
- Automated: axe in Playwright for every primary route; manual keyboard pass per feature.

---

## 8. Responsive Behavior

| Breakpoint | Layout |
|---|---|
| ≥ 1280 px | Full sidebar, detail pages two-column (content + 320 px side panel) |
| 1024–1279 | Full sidebar; side panel narrows to 280 px |
| 768–1023 (tablet) | Icon sidebar; detail side panel moves below header as collapsible "Details" section; tables hide low-priority columns (Type, Department) |
| < 768 | Drawer nav; tables become stacked cards for employee views; agent tables horizontally scroll with sticky key column |

---

## 9. Content & Microcopy

- Plain, specific language: "Waiting for your reply" not "Pending customer".
- Status labels are title case of enum (`WAITING_FOR_USER` → "Waiting for user").
- SLA copy: "01h 42m remaining", "Due in 3 business days", "Breached 23 minutes ago", "Paused while waiting for you".
- Confirmations state the outcome: "Ticket TKT-004821 resolved. Ahmed has been notified."
- Error messages say what happened and what to do: "This ticket was updated by Sara a moment ago. Reload to see the latest version."

---

## 10. Design Deliverables

| Deliverable | Status |
|---|---|
| Token file (`packages/ui-tokens` → Tailwind theme) | To build in Phase 0 |
| Component inventory in Storybook (optional) / `/dev/components` route | Phase 1 |
| High-fidelity mockups for Ticket detail, Ticket list, Agent dashboard, Asset detail | Generate with Stitch MCP during Phase 1 UI work |
| Accessibility checklist per screen | With each feature PR |
