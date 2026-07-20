# TFO Web App — TODO

Last reviewed: July 20, 2026.
Source: current working tree and `npm test` (7 tests passed).

This is the only active task list. Work from top to bottom: P0 first, followed by P1, P2, and P3. Only check off a task once its acceptance criteria have been met and the relevant tests pass.

## P0 — Security before production

- [ ] **TFO-SEC-001 — Secure initialization and administration endpoints**
  - Scope: `POST /init`, `/init/reset`, `/init/demo`, `/init/import`, and `/init/create-admin`.
  - Only allow a verifiable first-time setup when no administrator exists. After that, require authentication and `manage_backups`, or remove destructive routes from production.
  - Remove the `admin/admin` route, prevent privilege escalation of existing users, and use a one-time secret or local CLI flow for the first administrator.
  - Done when anonymous and regular users cannot change anything after setup, and integration tests cover first-time setup, repeated setup, privilege-escalation attempts, and all five routes.

- [ ] **TFO-SEC-002 — Secure JWTs and current account permissions** *(partially completed)*
  - The hardcoded `tfo-secret` has already been replaced locally with `JWT_SECRET` in production, but development still has a known fallback and tokens still rely on stale claims.
  - Require a long, random secret everywhere; reject missing, weak, or known values; and rotate the production secret.
  - For every protected request, load the current user and role from the database; immediately reject deleted or inactive accounts.
  - Done when old/default tokens are rejected and tests cover secret validation, role changes, deactivation, and deletion during a session.

- [ ] **TFO-SEC-003 — Restrict and authorize logging**
  - Protect `/api/logs/start`, `/api/logs/stop`, and `/api/logs/stream` with an administrative capability.
  - Restrict or disable `/api/client-log` in production; validate levels and field lengths, and add rate limiting, redaction, rotation, and retention periods.
  - Done when unauthorized users cannot read or control logs and tests prove authorization, throttling, validation, and redaction.

- [ ] **TFO-SEC-004 — Protect uploads against stored XSS**
  - Do not allow HTML/HTM; reject SVG or sanitize it with a maintained library; validate both MIME type and magic bytes.
  - Add `X-Content-Type-Options: nosniff` and an appropriate CSP, and preferably serve risky files from a cookieless origin or as downloads.
  - Done when valid images work and tests reject HTML, scripted SVG, and disguised files.

## P1 — Data integrity and accounts

- [ ] **TFO-DATA-001 — Make slot registration atomic**
  - Replace read-modify-write in `repositories/ops.js` with transactional locking or optimistic concurrency.
  - Done when exactly one of two simultaneous claims for the same slot succeeds and changes to different slots do not overwrite each other.

- [ ] **TFO-DATA-002 — Replace broad delete-and-reinsert writes**
  - Use targeted repository/SQL mutations; reserve full replacement for restore operations and wrap it in a transaction with foreign-key validation.
  - Done when a single change does not replace tables, errors roll back completely, and independent concurrent changes are preserved.

- [ ] **TFO-AUTH-001 — Introduce a password policy and rate limiting**
  - Remove `changeme` and other defaults. Enforce server-side minimum and maximum password lengths for signup and users created by administrators.
  - Rate-limit login, signup, and setup.
  - Done when missing, empty, short, and overly long passwords create nothing and all cases are tested.

- [ ] **TFO-DATA-003 — Use safe, collision-resistant IDs**
  - Replace `Date.now()` and time-plus-random combinations for entity IDs with database IDs or `crypto.randomUUID()` using an appropriate column type.
  - Done when all creation routes and recurrence generation use the same documented strategy and concurrency tests show no collisions.

- [ ] **TFO-OPS-001 — Make recurrence generation safe across multiple instances** *(partially completed)*
  - Within a single Node process, `recurrenceGeneration` now prevents overlap and a timer periodically generates operations.
  - Add database locking or a unique occurrence key so multiple server processes cannot create duplicate operations.
  - Done with a concurrency integration test covering at least two simultaneous generators.

## P2 — Tests and maintainability

- [ ] **TFO-TEST-001 — Expand the self-contained test pipeline** *(foundation available)*
  - `npm test` starts independently and the 7 recurrence/create-admin tests pass.
  - Add disposable database fixtures and tests for auth/capabilities, initialization, uploads, backup/restore, atomic registration, and recurrence concurrency.
  - Add browser smoke tests for public access, signup/login/logout, member/missionmaker/admin, modals, and 390 px.
  - Done when `npm test` runs all listed suites in a clean environment without a manually started server.

- [ ] **TFO-ARCH-001 — Split up large modules**
  - Split `server.js` by domain into routes/services/repositories and split `src/App.jsx` into pages and API actions.
  - Establish regression tests first and do not change behavior while splitting up the modules.

- [ ] **TFO-ARCH-002 — Centralize API requests**
  - Migrate the remaining direct `fetch('/api...')` calls to `src/api.js` and centralize authentication headers and error handling.
  - Done when components no longer contain their own API base, token handling, or 401 logic.

- [ ] **TFO-REPO-001 — Remove logs and application data from Git**
  - Currently tracked: `logs/app.log`, `logs/combined.log`, and `public.raw`.
  - Stop tracking them without deleting required local files, prevent them from being committed again, and inspect history for personal data/secrets.
  - Document whether history rewriting is necessary; retain only minimal fictional fixtures.

- [ ] **TFO-CLEANUP-001 — Carefully remove unused files and exports**
  - Candidates: `README_v2_preview.md`, `HGprofilepic.jpg`, `repositories/index.js`, `public.raw`, unused imports/exports in `server.js`, `lib/logger.js`, and the duplicate named/default export of `apiFetch`.
  - Remove only after a repository-wide usage check and successful tests/build; retain one documented `apiFetch` export.

- [ ] **TFO-CLEANUP-002 — Inventory manual scripts**
  - Review `scripts/check_public.js`, `clear-db.js`, `count-users.mjs`, `create-admin.cjs`, `create-admin-check.mjs`, `dump-users.cjs`, `init-db.mjs`, `init-schema.mjs`, `list-tables.mjs`, `set-admin-password.cjs`, `training-e2e-check.mjs`, `training-ui-fixture.mjs`, and `wait-for-db.js`.
  - For each retained script, document its purpose, owner, command, environment, and safety boundaries; add a production safeguard to destructive scripts.

## P3 — Product and UX

### Operations, ORBAT, and administration

- [ ] **TFO-FEAT-001 — Store LoA periods**
  - Allow players to enter a start and end date, validate the period server-side, and show active/future LoA where relevant.

- [ ] **TFO-FEAT-002 — Make modlist uploads accessible**
  - Drag-and-drop already exists for player/server modlists; add a visible upload/file-picker button to both fields using the same upload flow and feedback.

- [ ] **TFO-FEAT-003 — Derive role metrics reliably**
  - The roles table, repository, CRUD API, and UI exist. The UI currently counts Slots/Allowed from templates and Occupied from templates rather than current operation slots and player roles.
  - Define the meaning of Occupied/Slots/Allowed and calculate these server-side from the authoritative sources.

- [ ] **TFO-FEAT-004 — Allow sections to be reordered**
  - Slot ordering exists; add persistent reordering of sections/squads within templates.

- [ ] **TFO-FEAT-005 — Store operation order**
  - Operations are sorted only during rendering. Add an explicit, persistent sort key and reordering flow if manual ordering is desired.

- [ ] **TFO-FEAT-006 — Make public data scalable**
  - Add pagination/filtering to `/api/public-data` so the full operation history is not loaded.

- [ ] **TFO-FEAT-007 — Automate backup retention**
  - Define and automate MySQL retention, for example daily snapshots and a pre-restore snapshot.

- [ ] **TFO-FEAT-008 — Prepare for localization**
  - Centralize scattered user-facing strings so they can be translated.

### Bugs

- [ ] **TFO-BUG-001 — Fix duplicate React keys in ORBAT**
  - Trace the warnings in `logs/app.log` to duplicate slot/entity IDs and use keys that are stable and unique within each collection.

- [ ] **TFO-BUG-002 — Fix horizontal overflow at 390 px**
  - The authenticated Overview has a document width of 461 px at a viewport width of 390 px. Allow navigation and ORBAT controls to wrap or scroll locally, and add a regression test.

### Visual consistency and feedback

- [ ] **TFO-UX-001 — Establish a design system and audit pages**
  - Align the color palette and typography with taskforceomega.eu.
  - Define spacing (4/8/12/16/24/32), typographic roles, and shared styles for buttons, inputs, cards, and modals.
  - Then remove one-off margins, padding hacks, and duplicate CSS page by page.

- [ ] **TFO-UX-002 — Perform a responsive and touch pass**
  - Optimize Scheduler and Builder for mobile, make interactive slots and buttons touch-friendly, and include the 390 px fix from TFO-BUG-002.

- [ ] **TFO-UX-003 — Add non-blocking feedback**
  - Replace browser `alert()` calls with accessible inline errors or success/error toasts.
  - Add consistent loading, hover, focus, and disabled states.

- [ ] **TFO-UX-004 — Complete empty states**
  - Use a consistent icon + explanation + primary action for no operations, templates, campaigns, ranks, and users.

- [ ] **TFO-UX-005 — Improve performance of large ORBAT editors**
  - Measure render/update time and render collapsed squads or only the active panel, especially on small screens.

- [ ] **TFO-UX-006 — Complete the persistent header**
  - Add the current page name, rank, and avatar to the existing logo/user summary.

## Verified as complete

These items were found in the current code during the review and do not need to be added to the active list again:

- [x] Rank management with CRUD, ordering, and icon upload; rank icon is stored.
- [x] Eight built-in SVG squad markers and squad-type management; type and icon can be selected in Builder/Scheduler.
- [x] Campaign → Operation is stored during create/update/recurrence and used in Overview.
- [x] Roles table, repository, CRUD API, and administration page (metrics remain under TFO-FEAT-003).
- [x] ORBAT Overview, Scheduler, Template Builder, recurrence, and next-date preview.
- [x] Role-based capabilities; missionmakers can create operations through `edit_operations`.
- [x] Uploads for markers, avatars, and administration files; avatar/profile persistence.
- [x] Campaign, rank, and permission-group management.
- [x] Destructive actions require confirmation.
- [x] Signup stores and returns profile data; field errors disappear after correction.
- [x] Expired sessions clear authentication state and reload public data.
- [x] Duplicate operation-squad route merged; rank icon and error language reviewed.
- [x] Favicon, page logo, basic navigation, and recurrence unit tests.
- [x] MySQL has replaced file-based application storage.

## Deployment checklist

Only perform these steps after the relevant task criteria have been met and the tests pass:

```bash
npm test
npm run build
# Upload changed files via FTP, including dist/
# Restart via cPanel > Node.js App > Restart
```
