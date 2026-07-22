# TFO Web App — TODO

Last reviewed: July 22, 2026.
Source: current working tree, `npm test` (18 tests passed, 1 database test skipped), and player feedback supplied July 22, 2026.

This is the only active task list. Items are ranked by urgency and dependency: complete P0 before production, then work from top to bottom through P1, P2, and P3. Every active item uses the same format:

- **Problem:** why the task is necessary.
- **Work:** what must be changed.
- **Done:** the acceptance criteria that must be met before checking off the task.

## P0 — Production security blockers

- [ ] **TFO-SEC-001 — Secure initialization and administration endpoints** *(partially completed)*
  - **Problem:** `POST /init`, `/init/reset`, `/init/demo`, `/init/import`, and `/init/create-admin` can expose setup, destructive, or privilege-escalation behavior after initial installation.
  - **Progress:** `/init.html` now opens behind a database-independent recovery-login, and all five mutating `/init` routes require the same HTTP Basic credentials. The recovery username and password are configurable through `INIT_ADMIN_USERNAME` and `INIT_ADMIN_PASSWORD`; status polling no longer overwrites action results in the recovery UI.
  - **Work:** Permit a verifiable setup only when no administrator exists. After setup, require authentication plus `manage_backups`, or remove destructive routes from production. Remove the `admin/admin` route, prevent privilege escalation of existing users, and use a one-time secret or local CLI flow for the first administrator.
  - **Done:** Anonymous and regular users cannot change setup or administration data, and integration tests cover first-time setup, repeated setup, privilege-escalation attempts, and all five routes.

- [ ] **TFO-SEC-002 — Secure JWTs and enforce current account permissions** *(partially completed)*
  - **Problem:** Production uses `JWT_SECRET`, but development still has a known fallback and tokens rely on role claims that can become stale.
  - **Work:** Require a long, random secret in every environment; reject missing, weak, or known values; rotate the production secret; and load the current user and role from the database for every protected request.
  - **Done:** Old or default tokens are rejected, deleted or inactive accounts lose access immediately, and tests cover secret validation, role changes, deactivation, and deletion during a session.

- [ ] **TFO-SEC-004 — Protect uploads against stored XSS**
  - **Problem:** Uploaded HTML, SVG, or disguised files can execute scripts when served to users.
  - **Player feedback:** Add and clearly communicate upload restrictions.
  - **Work:** Reject HTML/HTM; reject SVG or sanitize it with a maintained library; validate MIME type and magic bytes; add `X-Content-Type-Options: nosniff` and an appropriate CSP; and serve risky files as downloads or from a cookieless origin where practical.
  - **Done:** Valid images still work, allowed file types and size limits are visible before selection, invalid selections receive accessible feedback, and automated tests reject HTML, scripted SVG, incorrect MIME types, oversized files, and disguised files.

- [x] **TFO-SEC-003 — Remove application logging endpoints**
  - **Resolution:** Removed `/api/logs/start`, `/api/logs/stop`, `/api/logs/stream`, and `/api/client-log`, together with the browser forwarding code, initialization UI, collector, file logger, and existing generated log files. Only normal process console output remains for the hosting provider.
  - **Done:** The application no longer exposes routes for reading, controlling, or injecting logs, and no application log files are generated or retained.

- [x] **TFO-AUTH-001 — Enforce a password policy and rate limiting**
  - **Problem:** Default or weak passwords and unrestricted authentication attempts make accounts vulnerable.
  - **Resolution:** Removed implicit account passwords such as `changeme`; signup, password changes, and users created by administrators now enforce an 8–128 character server-side policy and reject common defaults. Login, signup, and recovery/setup attempts are rate-limited per client. The setup page creates only the fixed `admin` account and intentionally allows any explicitly entered non-empty password without policy restrictions. It also provides a button-style link back to the main page that supports opening in a new tab.
  - **Done:** Missing, empty, short, overly long, and default passwords create no regular account, setup never silently supplies a password, repeated attempts return HTTP 429 with retry information, and the password-policy and rate-limiter cases are covered by tests.

## P1 — Data integrity and functional blockers

- [ ] **TFO-BUG-013 — Keep campaign images visible in Overview**
  - **Problem:** A campaign image intermittently disappears from an operation in Overview, especially after page refreshes and operation actions. Previous fixes to campaign hydration, upload failure handling, and operation payload normalization did not fully resolve the reported behavior.
  - **Work:** Reproduce the issue end to end with a persisted campaign and linked operation; trace the campaign image URL and operation `campaignId` through initial loading, authenticated and public data responses, refreshes, and every Overview action; distinguish a missing campaign association from a missing or unreachable upload; then fix the confirmed cause and add regression coverage.
  - **Done:** A saved campaign image remains visible in Overview after repeated full refreshes, login state changes, slot join/sign-off, absence changes, scheduler edits, and other operation actions; the uploaded image URL remains reachable; and automated browser and API tests cover the failure sequence.

- [ ] **TFO-DATA-001 — Make slot registration atomic**
  - **Problem:** Concurrent read-modify-write operations in `repositories/ops.js` can assign the same slot twice or overwrite an unrelated slot change.
  - **Work:** Replace the current flow with transactional locking or optimistic concurrency control.
  - **Done:** Exactly one of two simultaneous claims for the same slot succeeds, changes to different slots are both preserved, and concurrency tests pass.

- [ ] **TFO-DATA-002 — Replace broad delete-and-reinsert writes**
  - **Problem:** Replacing whole tables for ordinary mutations risks data loss and overwrites concurrent changes.
  - **Work:** Use targeted repository and SQL mutations. Reserve full replacement for restore operations and wrap restores in a transaction with foreign-key validation.
  - **Done:** A single change does not replace tables, failed writes roll back completely, and independent concurrent changes are preserved in integration tests.

- [x] **TFO-DATA-003 — Use safe, collision-resistant IDs**
  - **Problem:** IDs based on `Date.now()` or time-plus-random values can collide under concurrency.
  - **Work:** Use database-generated IDs or `crypto.randomUUID()` with an appropriate column type across all entity creation and recurrence flows.
  - **Done:** One documented ID strategy is used consistently and concurrency tests demonstrate that IDs do not collide.
  - **Implementation:** Persistent entities use MySQL `BIGINT AUTO_INCREMENT`; optimistic browser-only IDs use `crypto.randomUUID()`. See `docs/data-model.md` and run `npm run test:db` for the real MySQL concurrency test.

- [x] **TFO-OPS-001 — Make recurrence generation safe across multiple instances**
  - **Problem:** In-process overlap protection works for one Node process, but multiple server instances can generate duplicate operations.
  - **Work:** Add database locking or a unique occurrence key shared by all server instances.
  - **Done:** A concurrency integration test with at least two simultaneous generators creates each occurrence exactly once.

- [x] **TFO-BUG-007 — Allow administrators to change player statuses**
  - **Problem:** Administrators cannot change a player's status from the player list.
  - **Work:** Restore the status control for authorized administrators and persist changes through the correct API flow.
  - **Done:** An administrator can change and save every supported status, unauthorized users cannot do so, and the behavior is covered by tests.
  - **Resolution:** Restored the `Active`, `Inactive`, and `LoA` selector in the player list for users with `edit_players`. Changes use the authorized user-update API, update the UI immediately, and roll back with an error message if persistence fails. Production build and automated test suite pass.

- [x] **TFO-BUG-004 — Allow roles to be added while creating a template**
  - **Problem:** A new template must be saved before roles can be added, interrupting the creation flow and leaving incomplete templates.
  - **Work:** Support role configuration in the initial template form and save the template and its roles consistently.
  - **Done:** A user can create a template with roles in one flow, validation errors preserve entered data, and the saved template contains every configured role.

- [x] **TFO-BUG-006 — Prevent the squad-type dropdown from being clipped**
  - **Problem:** In squad templates, the squad-type menu is clipped when it extends outside the squad container.
  - **Work:** Correct the dropdown positioning, stacking, or overflow behavior without breaking the squad layout.
  - **Done:** The full menu remains visible and selectable at supported desktop and mobile widths, including near container edges.

- [ ] **TFO-BUG-003 — Keep templates expanded in form mode**
  - **Problem:** Templates are collapsed in form mode, hiding the content users need to review or edit.
  - **Work:** Expand the relevant template content by default while the form is active and preserve intentional user-controlled state where appropriate.
  - **Done:** Opening form mode immediately shows the editable template content without requiring an extra expand action.

- [ ] **TFO-BUG-012 — Restore broken form mode**
  - **Problem:** Player feedback reports that form mode is completely unusable, preventing the intended template or operation workflow from being completed.
  - **Work:** Reproduce and document every failure in form mode; restore loading, navigation, display, editing, validation, saving, and cancellation; preserve entered data after recoverable errors; and resolve TFO-BUG-003 as part of the repair where applicable.
  - **Done:** An authorized user can open form mode, view all required content, edit every supported field, receive useful validation feedback, save valid changes, cancel safely, and reopen the saved result without data loss; browser regression tests cover the complete workflow on desktop and mobile widths.

- [x] **TFO-BUG-005 — Display training-session dates in the intended format**
  - **Problem:** The new training-session form exposes the technical `YYYY-MM-DD` representation instead of the intended user-facing date format.
  - **Work:** Format the displayed date consistently with the rest of the application while preserving an unambiguous API and database value.
  - **Done:** Users see the intended localized format, submitted dates remain correct across time zones, and parsing and display tests pass.

- [ ] **TFO-BUG-001 — Fix duplicate React keys in ORBAT**
  - **Problem:** Duplicate slot or entity IDs produce React key warnings and can cause incorrect component reuse.
  - **Work:** Trace the warnings recorded in `logs/app.log` and use stable, unique keys within every rendered collection.
  - **Done:** No duplicate-key warnings occur in supported ORBAT flows and a regression test covers the previously failing data.

- [ ] **TFO-BUG-002 — Fix horizontal overflow at 390 px**
  - **Problem:** The authenticated Overview is 461 px wide in a 390 px viewport, causing document-level horizontal scrolling.
  - **Work:** Let navigation and ORBAT controls wrap or scroll within their own containers without hiding actions.
  - **Done:** The page has no document-level horizontal overflow at 390 px and a browser regression test verifies it.

- [ ] **TFO-BUG-008 — Explain why a player cannot claim a slot**
  - **Problem:** When a player cannot join a slot, the interface does not make the reason visible.
  - **Work:** Keep unavailable slot actions visibly disabled and show the applicable reason, such as missing qualifications, an occupied slot, an existing signup, an inactive squad, or insufficient access.
  - **Done:** Every unavailable slot has an accessible explanation, eligible players can still claim slots normally, and tests cover the principal denial reasons.

- [ ] **TFO-BUG-009 — Correct the Create Account layout and copy**
  - **Problem:** Availability and experience controls render with excessive spacing and poor alignment, while requirement text and labels read awkwardly.
  - **Work:** Repair the responsive form layout, align controls with their labels, and rewrite the affected English copy so requirements and questions are concise and natural.
  - **Done:** The complete form is readable and consistently aligned on supported desktop and mobile widths, all copy has been reviewed, and a browser regression test covers the affected sections.

- [ ] **TFO-BUG-010 — Make notification links open their exact target**
  - **Problem:** Clicking a notification does not consistently navigate to the operation, training request, proposal, session, signup, or other entity described by it.
  - **Work:** Add typed target metadata to notifications and route each supported notification type to the relevant page and entity detail.
  - **Done:** Every notification type opens its exact target when that target still exists, missing targets produce non-blocking feedback, and navigation tests cover all supported types.

- [ ] **TFO-BUG-011 — Allow training suggestions to be rejected**
  - **Problem:** A player can accept a proposed training time but cannot explicitly reject it.
  - **Work:** Add an authorized rejection action, persist the result, notify the trainer, and keep the request available for a new proposal where appropriate.
  - **Done:** The intended player can reject a pending suggestion, unauthorized users cannot reject it, both parties see the updated state, and API and UI tests pass.

- [ ] **TFO-BUG-013 — Limit squad notifications to squad members**
  - **Problem:** Squad-targeted notifications are also sent to players marked absent, causing irrelevant or misleading notifications.
  - **Player feedback:** `[RCT] Ember`, July 22, 2026.
  - **Work:** Resolve the intended squad recipients when creating a squad notification and exclude absent players from delivery.
  - **Done:** A squad notification is delivered only to eligible members of that squad, absent players receive no copy, unrelated squads receive no copy, and recipient-selection tests cover assigned, absent, and unrelated players.

## P2 — Testability, maintainability, and operations

- [ ] **TFO-TEST-001 — Expand the self-contained test pipeline** *(foundation available)*
  - **Problem:** `npm test` runs independently but covers only seven recurrence and create-admin cases, leaving critical flows unprotected.
  - **Work:** Add disposable database fixtures; integration tests for authentication, capabilities, initialization, uploads, backup/restore, atomic registration, and recurrence concurrency; and browser smoke tests for public access, signup/login/logout, member, missionmaker, administrator, modals, and 390 px.
  - **Done:** `npm test` runs every listed suite in a clean environment without a manually started server and reports deterministic results.

- [ ] **TFO-REPO-001 — Remove logs and application data from Git**
  - **Problem:** `logs/app.log`, `logs/combined.log`, and `public.raw` are tracked and may expose application or personal data.
  - **Work:** Stop tracking these files without deleting required local copies, prevent future commits, inspect history for personal data or secrets, and retain only minimal fictional fixtures.
  - **Done:** Runtime logs and real application data are ignored, the history review is documented, and any decision about history rewriting is recorded.

- [ ] **TFO-FEAT-007 — Automate backup retention**
  - **Problem:** MySQL backups have no defined automated retention policy, increasing recovery and storage risks.
  - **Work:** Define and automate retention, including scheduled snapshots and a snapshot immediately before restore operations.
  - **Done:** The documented schedule runs automatically, expired backups are removed safely, pre-restore snapshots are created, and a restore drill succeeds.

- [ ] **TFO-ARCH-002 — Centralize API requests**
  - **Problem:** Direct `fetch('/api...')` calls duplicate API base, authentication, error, and `401` handling across components.
  - **Work:** Migrate remaining API calls to `src/api.js` and standardize headers, authentication, response parsing, and error handling.
  - **Done:** Components contain no independent API base, token, or `401` logic, and existing request behavior remains covered by tests.

- [ ] **TFO-ARCH-001 — Split up large modules**
  - **Problem:** `server.js` and `src/App.jsx` combine too many domains, making changes difficult to isolate and review.
  - **Work:** After regression coverage exists, split `server.js` into routes, services, and repositories by domain, and split `src/App.jsx` into pages and API actions without changing behavior.
  - **Done:** Responsibilities have clear module boundaries, public behavior is unchanged, and the complete test and build pipeline passes.

- [ ] **TFO-CLEANUP-001 — Remove unused files and exports safely**
  - **Problem:** Suspected unused files, imports, and duplicate exports increase confusion and maintenance cost.
  - **Work:** Check repository-wide usage of `README_v2_preview.md`, `HGprofilepic.jpg`, `repositories/index.js`, `public.raw`, unused imports and exports in `server.js` and `lib/logger.js`, and the duplicate named/default `apiFetch` export; remove only confirmed dead code and retain one documented `apiFetch` export.
  - **Done:** Every removal is supported by a usage check, no required asset is lost, and tests plus the production build pass.

- [ ] **TFO-CLEANUP-002 — Inventory and safeguard manual scripts**
  - **Problem:** Manual scripts lack consistent ownership, usage documentation, and production safety boundaries.
  - **Work:** Review `scripts/check_public.js`, `clear-db.js`, `count-users.mjs`, `create-admin.cjs`, `create-admin-check.mjs`, `dump-users.cjs`, `init-db.mjs`, `init-schema.mjs`, `list-tables.mjs`, `set-admin-password.cjs`, `training-e2e-check.mjs`, `training-ui-fixture.mjs`, and `wait-for-db.js`; remove obsolete scripts and document purpose, owner, command, environment, and safety boundaries for retained scripts.
  - **Done:** Every retained script is documented, destructive scripts refuse unsafe production execution by default, and obsolete scripts are removed.

## P3 — Product, usability, and scalability improvements

- [ ] **TFO-FEAT-001 — Store LoA periods**
  - **Problem:** Leave of absence cannot be represented as a validated start-and-end period.
  - **Work:** Store start and end dates, validate them server-side, and display active and future LoA where relevant.
  - **Done:** Valid periods can be created and edited, invalid ranges are rejected, and active and future LoA display correctly with tests.

- [ ] **TFO-FEAT-003 — Derive role metrics from authoritative data**
  - **Problem:** The UI derives Slots and Allowed from templates and Occupied from template data instead of current operation slots and player roles.
  - **Work:** Define Occupied, Slots, and Allowed precisely, then calculate them server-side from authoritative sources.
  - **Done:** Each metric has documented semantics, API values match source data, and tests cover empty, partial, and full occupancy.

- [x] **TFO-FEAT-002 — Make modlist uploads accessible**
  - **Problem:** Player and server modlists support drag-and-drop but provide no visible file-picker control.
  - **Work:** Add an accessible upload button to both fields using the existing upload flow and feedback.
  - **Done:** Keyboard, pointer, and drag-and-drop users can upload both modlist types and receive consistent success or error feedback.
  - **Resolution:** Added visible, keyboard-accessible player and server modlist file pickers to the Scheduler while retaining the existing drag-and-drop flow and shared upload handling. The controls stack at narrow viewport widths.

- [ ] **TFO-FEAT-004 — Allow template sections to be reordered**
  - **Problem:** Slots can be ordered, but sections and squads within templates cannot.
  - **Work:** Add persistent reordering for template sections and squads.
  - **Done:** Users can reorder sections and squads, the order survives reloads, and authorization and persistence tests pass.

- [ ] **TFO-FEAT-005 — Store operation order explicitly**
  - **Problem:** Operations are sorted only during rendering, so a manual order cannot be persisted.
  - **Work:** Confirm that manual ordering is required, then add a persistent sort key and reordering flow.
  - **Done:** If approved, authorized users can reorder operations and the exact order survives reloads; otherwise the decision to retain automatic sorting is documented and this item is closed.

- [ ] **TFO-FEAT-006 — Make public data scalable**
  - **Problem:** `/api/public-data` loads the complete operation history, which will become slow as data grows.
  - **Work:** Add server-side pagination and filtering with stable ordering and sensible limits.
  - **Done:** Clients can request bounded result sets, navigation and filters work correctly, and performance tests cover a representative large dataset.

- [ ] **TFO-UX-003 — Add non-blocking feedback and control states**
  - **Problem:** Browser `alert()` calls interrupt workflows and loading, hover, focus, and disabled states are inconsistent.
  - **Work:** Replace alerts with accessible inline messages or toasts and standardize interactive states.
  - **Done:** Key actions provide accessible success and error feedback without blocking the page, and keyboard and screen-reader behavior is verified.

- [ ] **TFO-UX-001 — Establish a design system and audit pages**
  - **Problem:** Colors, typography, spacing, and component styles are inconsistent and rely on one-off CSS adjustments.
  - **Work:** Align the palette and typography with taskforceomega.eu; define spacing values `4/8/12/16/24/32` and shared styles for buttons, inputs, cards, and modals; then audit pages and remove redundant overrides.
  - **Done:** Shared tokens and components are documented and adopted across all pages without visual regressions.

- [ ] **TFO-UX-002 — Complete a responsive and touch usability pass**
  - **Problem:** Scheduler and Builder controls are not consistently optimized for small screens or touch input.
  - **Work:** Improve responsive layouts and touch targets, incorporating the 390 px correction from TFO-BUG-002.
  - **Done:** Core Scheduler and Builder flows work at supported mobile widths with usable touch targets and no inaccessible controls or document-level overflow.

- [ ] **TFO-UX-005 — Improve performance of large ORBAT editors**
  - **Problem:** Large ORBAT editors can render and update more content than users actively need, especially on small screens.
  - **Work:** Measure render and update times, then render collapsed squads or only the active panel where this materially improves performance.
  - **Done:** A representative large ORBAT meets documented performance targets without breaking editing behavior.

- [ ] **TFO-UX-004 — Complete empty states**
  - **Problem:** Empty pages do not consistently explain what is missing or how to proceed.
  - **Work:** Add a shared icon, explanation, and primary action pattern for empty operations, templates, campaigns, ranks, and users.
  - **Done:** Every listed area uses the shared accessible pattern and directs authorized users to a valid next action.

- [ ] **TFO-UX-006 — Complete the persistent header**
  - **Problem:** The header shows the logo and user summary but omits useful page and identity context.
  - **Work:** Add the current page name, rank, and avatar while preserving responsive behavior.
  - **Done:** The header shows correct page and user information on all authenticated pages and remains usable at supported widths.

- [ ] **TFO-FEAT-008 — Prepare user-facing text for localization**
  - **Problem:** User-facing strings are scattered throughout the codebase and cannot be translated consistently.
  - **Work:** Centralize strings behind a documented localization interface without changing the current language.
  - **Done:** Components no longer introduce standalone user-facing strings, the existing English UI remains unchanged, and adding another locale does not require component rewrites.

- [x] **TFO-FEAT-009 — Add player-list search**
  - **Problem:** Administrators and other authorized users cannot quickly find a player in a long player list.
  - **Work:** Add an accessible search field that filters players by username and relevant displayed profile fields without losing unsaved edits.
  - **Done:** Search is keyboard accessible, matching is case-insensitive, clearing the query restores the full list, empty results are explained, and filtering tests pass.
  - **Resolution:** Added client-side player filtering by username, displayed profile name, rank, status, permission group, and assigned roles. Filtering preserves the underlying user state, includes an accessible empty result, and is covered by unit tests.

- [ ] **TFO-FEAT-010 — Support persistent player-list ordering**
  - **Problem:** The player list cannot be reordered or given a clearly controlled persistent order.
  - **Work:** Define the required manual and automatic ordering behavior, add authorized reordering controls if manual order is approved, and persist the selected order.
  - **Done:** The ordering rules are documented, authorized changes survive reloads, unauthorized users cannot change the order, and persistence tests pass.

- [ ] **TFO-FEAT-011 — Notify administrators about new signups**
  - **Problem:** Administrators do not receive an in-app notification when a new account is created and may miss players awaiting review.
  - **Work:** Create a notification for the appropriate administrator group after successful signup and link it directly to the new player's record.
  - **Done:** One notification is created per successful signup, failed or duplicate signup attempts create none, clicking it opens the correct player, and tests cover delivery and authorization.

- [ ] **TFO-FEAT-012 — Add per-player audit history**
  - **Problem:** Administrators cannot review a consolidated history of important changes and actions for an individual player.
  - **Player feedback:** `[MAJ] Henry Gibbs [TFO]`, July 22, 2026.
  - **Work:** Define auditable player events, record the actor, target player, action, timestamp, and relevant before-and-after values, and expose an authorized audit-history view from the player record.
  - **Done:** Authorized administrators can view a chronological, attributable audit history for each player; unauthorized users cannot access it; sensitive values such as passwords and tokens are never recorded; and API, authorization, and event-recording tests pass.

- [x] **TFO-UX-007 — Make the application logo return to the homepage**
  - **Problem:** The header icon looks like a home affordance but does not navigate back to the application homepage.
  - **Work:** Make the logo an accessible home link while preserving configured branding and editor unsaved-change protection.
  - **Done:** Pointer and keyboard users can activate the logo from every page, it returns to the correct public or authenticated homepage, and unsaved editor changes are handled safely.
  - **Resolution:** Converted the configured header logo into an accessible home link. It routes authenticated users to Overview, users without Overview access to Profile, and public users to the public Overview while reusing the editor's unsaved-change confirmation.

- [ ] **TFO-UX-008 — Make the role-overflow badge interactive** *(interaction to be defined)*
  - **Problem:** The `+N` badge indicates that a player has additional roles, but clicking it currently does nothing and the hidden roles cannot be inspected from that control.
  - **Work:** Decide whether activation should expand the role list inline, open a popover or dialog, or navigate to role management; then implement the selected interaction without unexpectedly enabling role editing.
  - **Done:** Pointer and keyboard users can activate the badge and access every hidden role, the control communicates its purpose and expanded state to assistive technology, authorized editing remains clearly separated, and interaction tests pass.

## Verified as complete

These items were verified in the current code and must not be added to the active list again unless a regression is found:

- [x] Rank management supports CRUD, ordering, and icon upload, and stores the selected icon.
- [x] Eight built-in SVG squad markers and squad-type management are available; type and icon can be selected in Builder and Scheduler.
- [x] Campaign-to-operation relationships are stored during create, update, and recurrence flows and used in Overview.
- [x] The roles table, repository, CRUD API, and administration page exist; metric correctness remains tracked by TFO-FEAT-003.
- [x] ORBAT Overview, Scheduler, Template Builder, recurrence, and next-date preview are implemented.
- [x] Role-based capabilities are implemented; missionmakers can create operations through `edit_operations`.
- [x] Marker, avatar, and administration-file uploads are implemented, including avatar and profile persistence.
- [x] Campaign, rank, and permission-group management are implemented.
- [x] Destructive actions require confirmation.
- [x] Signup stores and returns profile data, and field errors disappear after correction.
- [x] Expired sessions clear authentication state and reload public data.
- [x] The duplicate operation-squad route is merged, and rank icon and error language behavior have been reviewed.
- [x] The favicon, page logo, basic navigation, and recurrence unit tests are implemented.
- [x] MySQL has replaced file-based application storage.

## Deployment checklist

Perform deployment only after the relevant acceptance criteria have been met and all tests pass:

```bash
npm test
npm run build
# Upload changed files via FTP, including dist/
# Restart via cPanel > Node.js App > Restart
```
