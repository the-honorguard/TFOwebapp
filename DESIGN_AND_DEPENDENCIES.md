# Dependencies & Design Overview

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

- Pages / views:
  - Overview (dashboard): the main page for visitors and logged-in users.
  - Signup (`page === 'signup'` in `src/App.jsx`): signup form with validation; minimum age is read from `defaultOpSettings.minSignupAge`.
  - Scheduler / Scheduler-detail: operation scheduling and recurring operations (component: `src/OrbatScheduler.jsx`).
  - Builder / Template editor: `src/OrbatTemplate.jsx`.
  - Players / Roles / Settings: admin/manage pages (including `src/Settings.jsx`).

- Key components:
  - `src/OrbatOverview.jsx` — compact ORBAT view for operations.
  - `src/OrbatScheduler.jsx` — operation scheduling UI.
  - `src/OrbatTemplate.jsx` — template builder / visualizer.
  - `src/Settings.jsx` — default settings editor (e.g., `minSignupAge`, default template, default time).
  - `src/styles.css` — global styling; contains classes for signup (`.signup-card`, `.signup-field`, `.signup-fields-grid`).

- Signup details:
  - Validation runs in the `signup()` function in `src/App.jsx`.
  - Age check: `minAge = Number(defaultOpSettings.minSignupAge) || 17` and the form requires users to be older than `minAge - 1`.
  - On success the server returns a `token` and the user is logged in (token stored in localStorage).

- State & data flow:
  - The app loads public data when no `token` is present and private data when a `token` is present.
  - Many UI actions (create template, create op, join slot, update slot, etc.) perform fetch calls to the API and update local state on response.

- Server:
  - `server.js` exposes the API routes (auth, signup, templates, ops, upload). The client expects JSON responses with objects like `{ token }`, `{ user }`, `{ op }`.

## Best practices & suggestions
- Test the signup flow and verify `defaultOpSettings.minSignupAge` in `Settings` (UI + `localStorage`).
- Consider adding translations and centralizing user-facing text for easier localization.
- Optionally: externalize API base path (`/api`) into a config module for easier maintenance.

---

Files to review: [src/App.jsx](src/App.jsx), [src/styles.css](src/styles.css), [src/OrbatOverview.jsx](src/OrbatOverview.jsx), [src/OrbatScheduler.jsx](src/OrbatScheduler.jsx), [src/OrbatTemplate.jsx](src/OrbatTemplate.jsx), [src/Settings.jsx](src/Settings.jsx), [server.js](server.js)
