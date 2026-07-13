TFO Webapp — Overview, Design & Dependencies

This project contains the ORBAT viewers, the scheduler and a template builder. The sections below combine the original README overview with the design notes and dependency information.

Overview — Viewers

- Overview viewer (public/read-only)
  - Component: `OrbatOverview` ([src/OrbatOverview.jsx](src/OrbatOverview.jsx))
  - Where: dashboard when `page === 'overview'`.
  - Modes:
    - `orbat` — canvas-style ORBAT (nodes + links).
    - `cards` — compact card/grid fallback for narrow viewports.
  - Purpose: quick, read-only preview of upcoming operations. Players can join slots from here (login required); admins and missionmakers see extra controls.

- Scheduler (admins & missionmakers)
  - List page: `page === 'scheduler'` — create and manage scheduled operations and recurrences.
  - Detail/editor: `page === 'scheduler-detail'` (and the `op-detail` flow for opening from the overview).
  - Component: `OrbatScheduler` ([src/OrbatScheduler.jsx](src/OrbatScheduler.jsx)).
  - Purpose: the most complete ORBAT viewer — it renders the full template for an operation and also shows sign-up/occupancy information (who signed up, join/sign-off controls, marker uploads, parent/child links). Intended for admins and missionmakers to edit and manage a specific scheduled operation.

- Template builder (admins & missionmakers)
  - Component: `OrbatTemplate` ([src/OrbatTemplate.jsx](src/OrbatTemplate.jsx)).
  - Where: template builder pages in the dashboard (`page === 'builder'`).
  - Purpose: create and edit reusable template presets (sections, slots, default markers, flow links). Templates are not the live operation view — they define presets that can be loaded into operations by the scheduler. The template builder is a design/edit surface only (no live sign-up data).

Notes and guidance
- The scheduler's ORBAT (`OrbatScheduler`) is the authoritative, operation-specific viewer: it shows the built template combined with live signup/slot state for that operation. Use it when you need the full operational view (admins/missionmakers).
- The template builder (`OrbatTemplate`) is for making reusable presets. Keep this component free of live signup/occupancy UI — it should not show who joined an operation.
- When navigating from overview → scheduler/op-detail, ensure `selectedOpId` is set before rendering the scheduler to avoid undefined-data errors.
- Keep `schedulerLoadTemplateId` synced for `scheduler-detail` and `op-detail` so the template-loading select remains controlled.

Design & Dependencies

## Dependencies
- Server / runtime:
  - express ^4.21.0
  - cors ^2.8.0
  - multer ^2.2.0
  - jsonwebtoken ^9.0.1
  - bcryptjs ^2.4.3
- Client / UI:
  - react ^18.3.1
  - react-dom ^18.3.1
- Dev / build:
  - vite ^5.4.10
  - @vitejs/plugin-react ^4.3.1
  - concurrently ^9.0.1

(versions taken from `package.json`)

Installation:

```bash
npm install
```

Run (development):

```bash
npm run dev
```

Build (production):

```bash
npm run build
```

## Short design overview

- Entry & bundling: static `index.html` + Vite client. Client entry is `src/main.jsx`.
- Main app: `src/App.jsx` — contains routing/conditional rendering for views, global state (users, templates, ops, recurrences, auth), and most API calls.
  - Important fetch endpoints: `/api/public-data`, `/api/data`, `/api/login`, `/api/signup`, `/api/templates`, `/api/ops`, `/api/recurrences`, `/api/users`.
  - Auth token is stored in `localStorage.token`.
  - `defaultOpSettings` is persisted to `localStorage` and includes `minSignupAge` among other defaults.

-- Pages / views:
  - Overview (dashboard): the main page for visitors and logged-in users.
  - Signup (`page === 'signup'` in `src/App.jsx`): signup form with validation; minimum age is read from `defaultOpSettings.minSignupAge`.
  - Scheduler / Scheduler-detail: operation scheduling and recurring operations (component: `src/OrbatScheduler.jsx`).
  - Builder / Template editor: `src/OrbatTemplate.jsx`.
  - Players / Roles / Settings: admin/manage pages (including `src/Settings.jsx`).

- Signup details:
  - Validation runs in the `signup()` function in `src/App.jsx`.
  - Age check: `minAge = Number(defaultOpSettings.minSignupAge) || 17` and the form requires users to be older than `minAge - 1`.
  - On success the server returns a `token` and the user is logged in (token stored in localStorage).

- State & data flow:
  - The app loads public data when no `token` is present and private data when a `token` is present.
  - Many UI actions (create template, create op, join slot, update slot, etc.) perform fetch calls to the API and update local state on response.

- Server:
  - `server.js` exposes the API routes (auth, signup, templates, ops, upload). The client expects JSON responses with objects like `{ token }`, `{ user }`, `{ op }`.

## Architecture (high level)

- Frontend: React app bundled with Vite. Entry: `src/main.jsx`. Routing and UI state live in `src/App.jsx`.
- Backend: small Express server in `server.js` providing a JSON API and static file hosting for the client (`dist`) and uploaded files (`/uploads`).
- Persistence: lightweight file-based storage at `data/app-data.json` (read/write by the server). Not intended for concurrent heavy writes or production scale.
- Uploads: files are stored under `uploads/` and served at `/uploads/*`. Uploads are validated by extension and limited to 5 MB.

## API endpoints (overview)

The server exposes REST endpoints under the `/api` prefix. Key endpoints the client uses:

- `POST /api/login` — authenticate, returns `{ token, user }`.
- `POST /api/signup` — create account, returns `{ token, user }`.
- `GET /api/public-data` — public read-only payload: `{ users, templates, ops }`.
- `GET /api/data` — authenticated payload: `{ user, users, templates, ops, recurrences }`.
- `GET /api/users/me` — current user object (authenticated).
- `PUT /api/users/me` — update profile for current user (authenticated).
- `PUT /api/users/me/password` — change password (authenticated).

- Template management (admin):
  - `POST /api/templates` — create template
  - `PUT /api/templates/:id` — update template
  - `DELETE /api/templates/:id` — delete template
  - `POST /api/templates/:id/duplicate` — duplicate template
  - Section/slot endpoints under `/api/templates/:templateId/...` for adding/updating/removing sections and slots

- Ops / scheduling:
  - `POST /api/ops` — create operation (or recurring entry)
  - `PUT /api/ops/:id` — update operation
  - `DELETE /api/ops/:id` — delete operation (admin)
  - `POST /api/ops/:id/join` — sign up to a slot (authenticated)
  - `POST /api/ops/:id/signoff` — sign off from a slot
  - `PUT /api/ops/:opId/slots/:slotId` — update slot metadata (admin/missionmaker depending on `allowMissionmakerOverrides`)

- Recurrences (admin): `POST/PUT/DELETE /api/recurrences` and helpers to generate operations from recurrences.

- Uploads:
  - `POST /api/upload` — admin upload
  - `POST /api/upload/custom-marker` — missionmaker/admin upload for marker icons
  - `POST /api/upload/avatar` — authenticated user avatar upload

Authentication: endpoints requiring auth expect a `Authorization: Bearer <token>` header. Tokens are JWTs signed by the server.

## Server & runtime details

- Server: `server.js` (Express). Default port is `3001` (configurable via `PORT` env var).
- Secret: `SECRET` in `server.js` is used to sign JWTs; in this repo it's a hardcoded `tfo-secret` for local development — replace with a secure secret for production or make injectable via env var.
- Data file: `data/app-data.json` is created automatically and seeded with an `admin` user on first run.
- Uploads: saved to `uploads/` with random UUID filenames; original filename preserved in responses.


## Best practices & suggestions
- Test the signup flow and verify `defaultOpSettings.minSignupAge` in `Settings` (UI + `localStorage`).
- Consider adding translations and centralizing user-facing text for easier localization.
- Optionally: externalize API base path (`/api`) into a config module for easier maintenance.

---

Files to review: [src/App.jsx](src/App.jsx), [src/styles.css](src/styles.css), [src/OrbatOverview.jsx](src/OrbatOverview.jsx), [src/OrbatScheduler.jsx](src/OrbatScheduler.jsx), [src/OrbatTemplate.jsx](src/OrbatTemplate.jsx), [src/Settings.jsx](src/Settings.jsx), [server.js](server.js)