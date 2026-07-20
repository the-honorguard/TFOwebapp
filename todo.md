# TFO Web App — Task List

---

## In Progress

- [x] Rank page — wired into the Settings → Ranks subpage with CRUD, ordering and icon uploads
- [ ] Add upload button to modlist boxes
- [ ] Work on how to display the squad type
- [x] Define and ship a default set of built-in markers — eight SVG markers are shipped in `public/markers` and seeded as squad types

---

## Security and data integrity backlog (review 20 July 2026)

Source: review of `the-honorguard/TFOwebapp` at `f175f3f27c74537bf89da9f90bbdfaa9acace8e0`, rechecked against the current code when these tasks were added. All tasks are **Open** until code inspection and matching tests prove otherwise. Execute P0, then P1, then P2.

### P0 — Critical

#### TFO-SEC-001 — Protect database initialization and management routes

- **Status:** Open
- **Locations:** `server.js:230`, `server.js:330`, `server.js:358`, `server.js:396` (`POST /init`, `/init/reset`, `/init/demo`, `/init/import`)
- **Work:** Allow setup only while no administrator demonstrably exists. Afterwards require `authMiddleware` plus `requireCapability('manage_backups')`, or remove destructive/import routes from production. Enforce this server-side and audit actions without passwords, tokens, or full imports.
- **Acceptance criteria:** All four routes return `401`/`403` and make no changes for anonymous callers after setup; ordinary users are refused; anonymous setup cannot be reactivated; integration tests cover all routes and roles.

#### TFO-SEC-002 — Make administrator creation a one-time first-run action

- **Status:** Open
- **Locations:** `server.js:369-393`, `public/init.html`
- **Work:** Restrict `POST /init/create-admin` to provable first run, permanently disable it once an administrator exists, use a one-time secret or local CLI flow, remove the `admin/admin` workflow, and never promote an existing user through this endpoint.
- **Acceptance criteria:** Existing users cannot be promoted; the route always refuses after setup; no `admin` default password is created; tests cover first run, repeated setup, and attempted promotion.

#### TFO-SEC-003 — Replace the public JWT secret and bind authorization to current users

- **Status:** Open
- **Locations:** `server.js:79`, `server.js:445-459`, `server.js:787-824`
- **Work:** Read a long random secret only from `process.env.JWT_SECRET`, provide no fallback, fail production startup for missing/weak/known defaults, rotate the deployed secret, and load current user status and role from the database on protected requests.
- **Acceptance criteria:** No secret/fallback is committed; production startup without a valid secret fails clearly; tokens signed with `tfo-secret` are rejected; deleted, inactive, and downgraded users lose access immediately; tests cover these cases.

#### TFO-SEC-004 — Restrict and bound log ingestion and log management

- **Status:** Open
- **Locations:** `server.js:114-124`, `server.js:243-327` (`/api/client-log`, `/api/logs/start`, `/api/logs/stop`, `/api/logs/stream`)
- **Work:** Require a management capability for collector control/streaming; disable or restrict client logging in production; add allowed levels, field-size limits, rate limiting, rotation, retention, and sensitive-value redaction.
- **Acceptance criteria:** Anonymous/ordinary users cannot read logs or control collection; oversized/frequent messages are bounded; files rotate with enforced retention; tests cover authorization, validation, throttling, and redaction.

#### TFO-SEC-005 — Prevent stored XSS through uploads

- **Status:** Open
- **Locations:** `server.js:80-111`, `server.js:2095-2160`, static `/uploads` serving
- **Work:** Remove HTML/HTM, reject SVG or sanitize it with a maintained library, validate MIME and magic bytes, prefer a separate cookieless origin or forced download, and add `X-Content-Type-Options: nosniff` plus an appropriate CSP.
- **Acceptance criteria:** HTML, script-bearing SVG, and disguised files are rejected; accepted images cannot execute script in the app origin; tests include valid and malicious samples.

### P1 — High

#### TFO-SEC-006 — Re-evaluate account role and status on every protected request

- **Status:** Open
- **Locations:** `server.js:445-472`, `server.js:787-824`
- **Work:** Resolve the current database user in authentication middleware, reject missing/inactive users, and derive capabilities from the current database role rather than JWT role claims.
- **Acceptance criteria:** Role changes apply on the next request; deleted/inactive users immediately receive `401`/`403`; tests cover role change, deactivation, and deletion during a session.

#### TFO-SEC-007 — Remove `changeme` and enforce server-side password policy

- **Status:** Open
- **Locations:** `server.js:803-833`, `server.js:1154-1164`
- **Work:** Require and validate passwords server-side for signup and admin-created users, remove every default, and rate-limit login, signup, and setup.
- **Acceptance criteria:** Missing, empty, short, and excessively long passwords return `400` and create nothing; no known default remains; rate limiting and validation have tests.

#### TFO-DATA-001 — Make operation-slot enrollment atomic

- **Status:** Open
- **Locations:** `repositories/ops.js:56-97`, `server.js:1422-1489`
- **Work:** Replace read-modify-write enrollment with transaction locking or optimistic concurrency/versioning.
- **Acceptance criteria:** Exactly one of two concurrent claims on one slot succeeds; changes to different slots do not overwrite each other; a real concurrency integration test proves both.

#### TFO-DATA-002 — Replace broad delete-and-reinsert writes with targeted mutations

- **Status:** Open
- **Location:** `lib/dataStore.js:475` onward
- **Work:** Use focused repository/SQL mutations normally; reserve full replacement for explicit restore, with transactions and foreign-key validation.
- **Acceptance criteria:** Single-entity changes do not replace tables; mid-transaction failure fully rolls back; concurrent independent changes survive integration tests.

### P2 — Quality and maintainability

#### TFO-TEST-001 — Make `npm test` self-contained

- **Status:** Open
- **Locations:** `package.json`, `scripts/test-create-admin.mjs`, future test directories
- **Work:** Separate scripts, fixtures, unit tests, and integration tests; start/mock dependencies; cover auth, capabilities, init, uploads, restore, and concurrent enrollment.
- **Acceptance criteria:** `npm test` reproducibly passes in a clean environment without a manually started server; isolated disposable data is used; named security/concurrency cases run by default.

#### TFO-ARCH-001 — Split oversized server and frontend modules

- **Status:** Open
- **Locations:** `server.js` (~2,344 lines at review), `src/App.jsx` (~4,009 lines at review)
- **Work:** Split routes by domain, move business logic to services/repositories, and split frontend pages/API actions without simultaneous behavior changes.
- **Acceptance criteria:** Domain boundaries and independently testable logic are clear; API behavior is centralized; regression tests protect behavior before refactoring.

#### TFO-REPO-001 — Remove logs and application data from Git tracking

- **Status:** Open
- **Locations:** `logs/app.log`, `logs/combined.log`, `public.raw`, `.gitignore`
- **Work:** Stop tracking without deleting required local logs; inspect contents/history for personal data or secrets and decide whether history rewriting is needed; retain only minimal fictional demo data if necessary.
- **Acceptance criteria:** Files are untracked and cannot be recommitted accidentally; history review/remediation is documented; retained fixtures are fictional and minimal.

#### TFO-CLEANUP-001 — Remove confirmed unused files and exports only after tests exist

- **Status:** Open; candidates only, not yet approved for deletion
- **Locations:** `README_v2_preview.md`, `HGprofilepic.jpg`, `repositories/index.js`, `public.raw`; `server.js` (`ensureDataFile`, `seedEssential` import); exports `listFiles`, `listOps`, `createSession`, `addParticipant`, `acceptProposal`; `lib/logger.js` (`info`, `warn`, `error`); duplicate named/default `apiFetch` export.
- **Work:** Reconfirm every candidate with repository-wide search and tests, then remove in small changes. Preserve `apiFetch` itself.
- **Acceptance criteria:** Every removal has a usage check and passing build/tests; no operational workflow breaks; `apiFetch` remains through one documented export style.

#### TFO-CLEANUP-002 — Inventory manual scripts before retaining or deleting them

- **Status:** Open; manual review required
- **Locations:** `scripts/check_public.js`, `clear-db.js`, `count-users.mjs`, `create-admin.cjs`, `dump-users.cjs`, `init-db.mjs`, `init-schema.mjs`, `list-tables.mjs`, `set-admin-password.cjs`, `training-e2e-check.mjs`, `training-ui-fixture.mjs`, `wait-for-db.js`
- **Work:** Record owner, purpose, command, environment, and safety constraints per script before documenting, migrating, or removing it.
- **Acceptance criteria:** Retained scripts have documented use/prerequisites; deletion follows confirmation that no workflow uses them; destructive scripts have explicit production safeguards.

---

## Bugs

### High priority

- [x] **Duplicate operation-squad route** — consolidated to one repository-backed `PUT /api/ops/:opId/squads/:squadId` handler with strict field validation
- [x] **Prevent admin credentials autofill in Create user form** — login fields now declare `username`/`current-password`; account-creation passwords use `new-password`, and the admin create-user form has distinct field names with autofill disabled
- [x] **Return and persist user profile after signup** — signup now stores survey data in profile settings and returns rank, status and profile in the initial auth response
- [x] **Ranks `icon` persistence** — schema, inserts, reads and rank CRUD now include `icon VARCHAR(1024)` / icon values

### Medium priority

- [ ] **Recurring op duplication risk** — ops generation runs on every read request; concurrent requests could produce duplicate operations
- [x] **Missionmakers can create operations** — `POST /api/ops` uses the `edit_operations` capability and the missionmaker permission group grants it
- [x] **Expired-session recovery** — `401` responses clear auth state and reload public data without a blocking alert or console error
- [ ] **Duplicate React keys in ORBAT overview** — repeated `Encountered two children with the same key` warnings are recorded in `logs/app.log`. Identify the duplicated slot/entity IDs and use stable keys that are unique within each rendered collection.
- [x] **Clear signup validation errors after correction** — each validated field now removes its own stale error as soon as the value changes

### Low priority

- [x] **Error response language audit** — current server and repository error responses are consistently English
- [ ] **ID generation** — `Date.now()` is used as entity ID; `crypto.randomUUID()` (already imported) would be safer and collision-free

---

## Missing Features

- [ ] **Complete roles backend metrics** — the `roles` table, repository and CRUD API now exist, but Occupied/Slots/Allowed still need to be derived reliably from current templates, operation slots and player role assignments instead of relying on stored JSON or client-side derivation.
- [x] **Backup/Restore roles section label** — `SECTION_LABELS` includes `roles: 'Custom Roles'`

---

## UI / UX

### Branding

- [x] **Favicon** — add `tfo-emoji.png` (or a trimmed variant) as favicon in `index.html`; set a meaningful `<title>` tag
- [x] **Logo on pages** — display the TFO logo in the login screen, top header/nav, and empty states
- [x] **Rank icons** — rank icon URLs populated in DB from task-force-omega/mkdocs raw GitHub assets; seed source updated
- [ ] **Align with taskforceomega.eu design language** — reuse the color palette, typography, and visual style already established on the main site; the app should feel like a natural extension of it

### CSS & Spacing

- [ ] **Define a spacing scale** — standardize on a consistent set of spacing values (e.g. 4 / 8 / 12 / 16 / 24 / 32 px) and apply them across all pages; mixed ad-hoc spacing is usually the main reason an interface feels unfinished
- [ ] **Standardize components** — normalize button heights, input field styles, card padding, border radius, and modal layout across Overview, Scheduler, Builder, and Settings
- [ ] **CSS audit pass** — go page by page and clean up one-off margins, padding hacks, and duplicate rules that accumulate over time
- [ ] **Typography hierarchy** — define clear roles for page title, section title, card title, label, helper text, and metadata; apply consistently

### Mobile

- [ ] **Responsive pass on Scheduler and Builder** — Overview already has a cards fallback for narrow viewports; apply the same care to the other main views
- [ ] **Touch-friendly targets** — ensure buttons and interactive slot elements are large enough to tap comfortably on mobile
- [ ] **Horizontal overflow at 390 px** — browser testing measured a 461 px document width in a 390 px viewport on the authenticated Overview. Find the fixed/min-width element, ensure navigation and ORBAT controls wrap or scroll within their own container, and add a regression check for 390 px width.

### Interaction & Feedback

- [ ] **Toast notifications** — add success/error toasts for create, update, and delete actions instead of silent state changes
- [x] **Destructive-action confirmations** — delete operation, template, squad/slot, recurrence, user, role, rank, campaign and permission-group flows prompt for confirmation
- [ ] **Loading states** — add spinners or skeleton placeholders while data is being fetched
- [ ] **Empty states** — add a styled empty state (icon + message + primary action) for: no ops, no templates, no campaigns, no ranks, no users
- [ ] **Hover / focus / disabled states** — audit interactive elements and ensure all states are visually distinct, especially on slot join/signoff buttons and admin controls
- [ ] **Replace blocking JavaScript alerts** — login expiry, signup and password flows still rely on browser alerts. Use inline errors or toasts so feedback is accessible, testable and does not interrupt navigation.

### Performance & Rendering

- [ ] **Virtualize or collapse large ORBAT editors** — Operation Scheduler and Template Builder render hundreds of inputs, selects and buttons simultaneously for a full template. Measure render/update time and render collapsed squads or only the active editing panel on smaller screens.

### Navigation

- [ ] **Complete persistent header** — the top area already shows the logo and logged-in username/role; add the current page name plus rank and avatar to finish the intended summary.
- [x] **Back navigation** — Overview links to Operation Scheduler and the scheduler editor provides “Back to operations”; management pages provide dashboard/back actions

---

## Features

### Short term

- [ ] **Section reorder** — slot reorder exists but sections themselves cannot be reordered inside a template
- [ ] **Op order persistence** — ops are sorted at render time but the order is not persisted
- [ ] **Persist Campaign → Op link** — the scheduler UI already sends `campaignId`, but `POST /api/ops` and `PUT /api/ops/:id` do not copy it into the stored operation payload. Persist it, then add overview filtering by campaign.
- [x] **Recurrence next-date preview** — the recurrence editor displays the next occurrence date/time or “None scheduled”

### Medium term

- [ ] **Database backup retention** — define and automate retention for MySQL backups (for example daily snapshots plus pre-restore snapshots); the old file-write rotation requirement is obsolete after the MySQL migration.
- [ ] **`/api/public-data` pagination or filtering** — entire op history is returned in a single payload; will degrade as data grows

### Long term

- [x] **Replace file-based storage** — application data is persisted in MySQL through the DB-backed data store and repositories
- [ ] **Finish centralising API requests** — `src/api.js` now provides `apiFetch`, but several components still call `/api` directly. Migrate remaining requests to the shared helper and centralise authenticated headers/error handling.
- [ ] **Localisation groundwork** — user-facing strings are scattered across components; centralising them would make translation straightforward

---

## Test Coverage

- [ ] **Add automated browser smoke tests** — cover public view, signup/login/logout, member, missionmaker and admin navigation, modal open/cancel flows, and a 390 px responsive check.
- [ ] **Add API authorization tests** — assert `401` for missing/invalid tokens, `403` for member access to operation/template/role/permission mutations, missionmaker capability boundaries, and admin access.
- [ ] **Add upload and backup/restore tests with disposable data** — cover allowed and rejected avatar/marker/modlist file types, the 5 MB limit, backup export, selective restore and malformed imports against a dedicated test database.
- [ ] **Add repository and recurrence tests** — extend TFO-TEST-001 with isolated repository coverage and concurrent recurring-operation generation tests.

---

## Done

- [x] ORBAT overview viewer (canvas + cards fallback)
- [x] Operation scheduler with recurrence support
- [x] Template builder
- [x] Role-based access control
- [x] File uploads (markers, avatars, admin assets)
- [x] Campaign management
- [x] Rank API (backend)
- [x] Avatar upload + profile persistence
- [x] Deployed to production on cPanel Node.js hosting
- [x] HTTPS enabled
- [x] Favicon — `tfo-emoji.png` added to `index.html`
- [x] Page logo — TFO icon added to header/nav
- [x] Rank icons — populated from task-force-omega/mkdocs raw assets
