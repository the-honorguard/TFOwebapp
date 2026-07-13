<div align="center">

<img src="tfo-emoji.png" alt="TFO" width="80" />

<h1>TFO Web App</h1>

<p>Internal web platform for Task Force Omega — operation planning, ORBAT management, and attendance tracking.</p>

<p>
  <img src="https://img.shields.io/badge/React-18-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/JWT-auth-black?style=flat-square&logo=jsonwebtokens&logoColor=white" />
  <img src="https://img.shields.io/badge/status-private-lightgrey?style=flat-square" />
</p>

<p>
  <a href="#deployment"><strong>Deployment</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="#api-reference"><strong>API Reference</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="#getting-started"><strong>Getting Started</strong></a>
</p>

</div>

---

## Features

<table>
<tr>
<td width="50%">

**ORBAT Overview**\
Public canvas-style ORBAT viewer. Supports node/link layout and a compact card grid for narrow viewports. Players can join available slots (login required).

</td>
<td width="50%">

**Operation Scheduler**\
Create, edit, and manage scheduled operations with full recurrence support — daily, weekly, biweekly, and monthly. Admin and missionmaker only.

</td>
</tr>
<tr>
<td width="50%">

**Template Builder**\
Design and manage reusable section/slot presets. Templates define structure and default markers — they load into operations via the scheduler.

</td>
<td width="50%">

**User Management**\
Role-based access (`admin`, `missionmaker`, `member`), per-user permissions, rank, status, and avatar uploads.

</td>
</tr>
<tr>
<td width="50%">

**File Uploads**\
Supports marker icons, avatars, and admin assets. Extension-validated, 5 MB cap, UUID-named storage under `uploads/`.

</td>
<td width="50%">

**Campaigns**\
Link operations to named campaigns with player/server modlists, default templates, and assigned missionmakers.

</td>
</tr>
</table>

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18, Vite 5 | SPA, entry `src/main.jsx` |
| Backend | Node.js 20, Express 4 | Single process, serves API + `dist/` |
| Auth | `jsonwebtoken`, `bcryptjs` | JWT, Bearer token |
| Uploads | `multer` | Disk storage, UUID filenames |
| Persistence | JSON file `data/app-data.json` | Auto-created, seeded on first run |
| Dev tooling | `concurrently`, `@vitejs/plugin-react` | Parallel dev server |

---

## Project Structure

```
.
├── dist/                     # Production build (generated)
├── public/                   # Static assets
├── src/
│   ├── main.jsx              # React entry
│   ├── App.jsx               # Routing, global state, API calls
│   ├── OrbatOverview.jsx     # Public ORBAT / cards viewer
│   ├── OrbatScheduler.jsx    # Operation detail + sign-up editor
│   ├── OrbatTemplate.jsx     # Template builder
│   └── Settings.jsx          # Admin settings
├── server.js                 # Express app — API + static serving
├── vite.config.js
└── package.json
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Development — frontend + backend in parallel
npm run dev

# Build for production
npm run build

# Run API server only
npm run server

# Run Vite client only
npm run client
```

---

## Architecture

### Runtime model

In production, one Node.js process handles everything:

```
client request
      │
      ▼
  server.js (Express)
      ├── /api/*          → REST API handlers
      ├── /uploads/*      → static file serving
      └── *               → dist/index.html (SPA fallback)
```

### State and data flow

- App loads public data when no token is present (`/api/public-data`)
- App loads private data when a valid JWT is in `localStorage.token` (`/api/data`)
- Most write actions call the API and update local React state on response
- `defaultOpSettings` (incl. `minSignupAge`) is persisted to `localStorage`

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/login` | Authenticate — returns `{ token, user }` |
| `POST` | `/api/signup` | Register — returns `{ token, user }` |

Protected routes require `Authorization: Bearer <token>`.

### Data

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/public-data` | — | `{ users, templates, ops, campaigns }` |
| `GET` | `/api/data` | required | `{ user, users, templates, ops, recurrences }` |
| `GET` | `/api/users/me` | required | Current user |
| `PUT` | `/api/users/me` | required | Update profile |
| `PUT` | `/api/users/me/password` | required | Change password |

### Templates (admin)

```
POST    /api/templates
PUT     /api/templates/:id
DELETE  /api/templates/:id
POST    /api/templates/:id/duplicate
POST    /api/templates/:id/sections
PUT     /api/templates/:templateId/sections/:sectionId
DELETE  /api/templates/:templateId/sections/:sectionId
POST    /api/templates/:id/slots
PUT     /api/templates/:templateId/slots/:slotId
DELETE  /api/templates/:templateId/slots/:slotId
PUT     /api/templates/:templateId/sections/:sectionId/slots/reorder
```

### Operations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/ops` | admin | Create op or recurrence |
| `PUT` | `/api/ops/:id` | admin/missionmaker | Update op |
| `DELETE` | `/api/ops/:id` | admin | Delete op |
| `POST` | `/api/ops/:id/join` | required | Sign up to a slot |
| `POST` | `/api/ops/:id/signoff` | required | Sign off from a slot |
| `PUT` | `/api/ops/:opId/slots/:slotId` | admin/missionmaker | Update slot metadata |
| `PUT` | `/api/ops/:opId/sections/:sectionId` | admin/missionmaker | Update section metadata |

### Uploads

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/upload` | admin | General upload |
| `POST` | `/api/upload/custom-marker` | admin/missionmaker | Marker icon |
| `POST` | `/api/upload/avatar` | required | User avatar |

---

## Deployment

This app is designed to run as a **single Node.js process** on a cPanel-compatible shared hosting environment.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port (injected automatically by cPanel) |
| `NODE_ENV` | — | Set to `production` |
| `JWT_SECRET` | — | Secret used to sign tokens — see security note below |

> **Security note:** ensure `JWT_SECRET` is set via environment variable and never hardcoded before exposing this app publicly.

### cPanel Node.js App configuration

| Field | Value |
|---|---|
| Node.js version | `20.x` |
| Application mode | `Production` |
| Startup file | `server.js` |

**First deployment:**

1. Build locally with `npm run build`
2. Upload all project files including `dist/` via FTP to the application root
3. Run NPM Install from the cPanel Node.js App interface
4. Start the application

### Update workflow

```bash
# 1. Rebuild
npm run build

# 2. Upload new dist/ via FTP to the application root

# 3. Restart — cPanel > Node.js App > Restart
```

---

## Notes

- `data/` and `uploads/` are created automatically on first run — no manual setup required
- A default admin account is seeded on first start — update credentials immediately via Settings
- Signup minimum age is driven by `defaultOpSettings.minSignupAge` (set in Settings, persisted to `localStorage`)
- File-based storage is not suited for concurrent heavy writes — consider a database for scale

---

<div align="center">

**Files to review**

[`App.jsx`](src/App.jsx) &middot; [`OrbatOverview.jsx`](src/OrbatOverview.jsx) &middot; [`OrbatScheduler.jsx`](src/OrbatScheduler.jsx) &middot; [`OrbatTemplate.jsx`](src/OrbatTemplate.jsx) &middot; [`Settings.jsx`](src/Settings.jsx) &middot; [`server.js`](server.js)

</div>
