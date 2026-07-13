# TFO Web App — Task List

---

## In Progress

- [ ] Rank page — API is ready, frontend page not yet wired up
- [ ] Add upload button to modlist boxes
- [ ] Work on how to display the squad type
- [ ] Define and ship a default set of built-in markers

---

## Bugs

### High priority

- [ ] **Hardcoded auth secret** — move to environment variable, never commit the value
- [ ] **Duplicate route conflict** — two `PUT` handlers exist for the same section endpoint with different permission checks; the second silently overrides the first
- [ ] **User profile not returned after signup** — `profile` is written to storage but not included in the initial auth response, so the client has no profile data on first login

### Medium priority

- [ ] **Admin cannot free an occupied slot** — sign-off checks that the requesting user owns the slot; admins should be able to override
- [ ] **Recurring op duplication risk** — ops generation runs on every read request; concurrent requests could produce duplicate operations
- [ ] **Missionmakers cannot create operations** — `POST /api/ops` is admin-only; missionmakers should be able to create their own ops

### Low priority

- [ ] **Wrong language in one error message** — one 404 response body is not in English, inconsistent with the rest of the API
- [ ] **ID generation** — `Date.now()` is used as entity ID; `crypto.randomUUID()` (already imported) would be safer and collision-free

---

## UI / UX

### Branding

- [ ] **Favicon** — add `tfo-emoji.png` (or a trimmed variant) as favicon in `index.html`; set a meaningful `<title>` tag
- [ ] **Logo on pages** — display the TFO logo in the login screen, top header/nav, and empty states
- [ ] **Align with taskforceomega.eu design language** — reuse the color palette, typography, and visual style already established on the main site; the app should feel like a natural extension of it

### CSS & Spacing

- [ ] **Define a spacing scale** — standardize on a consistent set of spacing values (e.g. 4 / 8 / 12 / 16 / 24 / 32 px) and apply them across all pages; mixed ad-hoc spacing is usually the main reason an interface feels unfinished
- [ ] **Standardize components** — normalize button heights, input field styles, card padding, border radius, and modal layout across Overview, Scheduler, Builder, and Settings
- [ ] **CSS audit pass** — go page by page and clean up one-off margins, padding hacks, and duplicate rules that accumulate over time
- [ ] **Typography hierarchy** — define clear roles for page title, section title, card title, label, helper text, and metadata; apply consistently

### Mobile

- [ ] **Responsive pass on Scheduler and Builder** — Overview already has a cards fallback for narrow viewports; apply the same care to the other main views
- [ ] **Touch-friendly targets** — ensure buttons and interactive slot elements are large enough to tap comfortably on mobile

### Interaction & Feedback

- [ ] **Toast notifications** — add success/error toasts for create, update, and delete actions instead of silent state changes
- [ ] **Confirmation modals** — prompt before destructive actions (delete op, delete template, delete section, delete recurrence, delete user)
- [ ] **Loading states** — add spinners or skeleton placeholders while data is being fetched
- [ ] **Empty states** — add a styled empty state (icon + message + primary action) for: no ops, no templates, no campaigns, no ranks, no users
- [ ] **Hover / focus / disabled states** — audit interactive elements and ensure all states are visually distinct, especially on slot join/signoff buttons and admin controls

### Navigation

- [ ] **Persistent header** — add a top bar with logo, current page name, and logged-in user summary (rank + avatar)
- [ ] **Back navigation** — clarify the path between Overview → Op detail → Scheduler so users always know where they are and how to go back

---

## Features

### Short term

- [ ] **Section reorder** — slot reorder exists but sections themselves cannot be reordered inside a template
- [ ] **Op order persistence** — ops are sorted at render time but the order is not persisted
- [ ] **Campaign → Op link** — ops have no `campaignId` field; filtering ops by campaign from the overview is not possible
- [ ] **Recurrence next-date preview** — `nextDateTime` is stored on each recurrence but never shown in the UI

### Medium term

- [ ] **Data backup rotation** — automatically keep N rolling backups of the data file before each write; a failed write currently risks total data loss
- [ ] **`/api/public-data` pagination or filtering** — entire op history is returned in a single payload; will degrade as data grows

### Long term

- [ ] **Replace file-based storage** — current JSON store is not suited for concurrent writes or growing datasets; evaluate a lightweight embedded database
- [ ] **Centralise API base path** — `/api` prefix is repeated in every fetch call on the client; a small config module would make future changes easier
- [ ] **Localisation groundwork** — user-facing strings are scattered across components; centralising them would make translation straightforward

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
