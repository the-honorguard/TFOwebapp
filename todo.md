# TFO Web App — Task List

---

## In Progress

- [x] Rank page — wired into the Settings → Ranks subpage with CRUD, ordering and icon uploads
- [ ] Add upload button to modlist boxes
- [ ] Work on how to display the squad type
- [x] Define and ship a default set of built-in markers — eight SVG markers are shipped in `public/markers` and seeded as squad types

---

## Bugs

### High priority

- [ ] **Hardcoded auth secret** — move to environment variable, never commit the value
- [x] **Duplicate operation-squad route** — consolidated to one repository-backed `PUT /api/ops/:opId/squads/:squadId` handler with strict field validation
- [ ] **Unauthenticated setup endpoints** — `POST /init/create-admin` and `POST /init/import` are accessible without a token or capability check. `/init/import` can replace the complete stored dataset and must be disabled after first-run setup or protected with admin authentication and `manage_backups`.
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
- [ ] **Add setup-route security regression tests** — prove `/init/create-admin` and `/init/import` cannot be called anonymously after the security fix.
- [ ] **Add upload and backup/restore tests with disposable data** — cover allowed and rejected avatar/marker/modlist file types, the 5 MB limit, backup export, selective restore and malformed imports against a dedicated test database.
- [ ] **Expand the Node test suite** — `npm test` currently discovers only `scripts/test-create-admin.mjs`; convert setup scripts into isolated tests and add unit/integration coverage for repositories and recurring-operation generation.

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
