<div align="center">

# TFO Web App

**ORBAT viewer · Operation scheduler · Template builder**

![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-18.x-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)

</div>

---

## Overview

TFO Web App is a full-stack internal tool for managing operations, templates, user roles, slot sign-ups, campaigns, and related assets.  
The frontend is a React/Vite SPA; the backend is a single Express process that serves both the API and the built client.

---

## Features

- **ORBAT Overview** — public read-only canvas viewer; players can join slots (login required)
- **Scheduler** — create, edit, and manage scheduled operations and recurrences (admin/missionmaker)
- **Template Builder** — design reusable section/slot presets to load into operations
- **User management** — roles (`admin`, `missionmaker`, `member`), permissions, rank, status, avatar
- **File uploads** — marker icons, avatars and admin assets; validated by extension, capped at 5 MB
- **Recurring operations** — daily / weekly / biweekly / monthly generation with optional end date
- **Local persistence** — lightweight JSON file store, zero external database required

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5 |
| Backend | Node.js 20, Express 4 |
| Auth | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`) |
| Uploads | Multer |
| Persistence | Local JSON (`data/app-data.json`) |
| Dev tooling | Vite, `concurrently`, `@vitejs/plugin-react` |

---

## Project Structure

```
.
├── dist/                   # Production frontend build (generated)
├── public/                 # Static public assets
├── src/
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Routing, global state, API calls
│   ├── OrbatOverview.jsx   # Public ORBAT/cards viewer
│   ├── OrbatScheduler.jsx  # Operation detail + sign-up viewer
│   ├── OrbatTemplate.jsx   # Template editor
│   └── Settings.jsx        # Admin settings page
├── server.js               # Express server (API + static serving)
├── vite.config.js
└── package.json
```

---

## Getting Started

### Install dependencies

```bash
npm install
```

### Development — frontend + backend together

```bash
npm run dev
```

### Run individually

```bash
npm run server   # Express API only (port 3001 by default)
npm run client   # Vite dev server only
```

### Production build

```bash
npm run build    # outputs to dist/
```

---

## Architecture

### Frontend

- Entry: `src/main.jsx`
- Routing and UI state: `src/App.jsx` — conditional page rendering, global state (users, templates, ops, recurrences, auth)
- Auth token stored in `localStorage.token`
- `defaultOpSettings` persisted to `localStorage` (includes `minSignupAge` and other defaults)

### Backend

- Entry: `server.js` — Express application
- Default port: `3001` (override with `PORT` env var)
- Serves API routes under `/api/*`
- Serves the production build from `dist/` via `express.static`
- Serves uploaded files under `/uploads`
- Applies a catch-all `GET *` → `dist/index.html` for SPA routing

### Persistence

- `data/app-data.json` — created and seeded automatically on first start (default `admin` user included)
- `uploads/` — created automatically; files stored with UUID filenames

---

## API Reference

### Authentication

Protected endpoints require an `Authorization: Bearer <token>` header.  
Tokens are JWTs signed by the server (`SECRET` in `server.js`).

### Core endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/login` | — | Authenticate; returns `{ token, user }` |
| POST | `/api/signup` | — | Create account; returns `{ token, user }` |
| GET | `/api/public-data` | — | Public payload: `{ users, templates, ops, campaigns }` |
| GET | `/api/data` | ✓ | Private payload: `{ user, users, templates, ops, recurrences }` |
| GET | `/api/users/me` | ✓ | Current user object |
| PUT | `/api/users/me` | ✓ | Update profile |
| PUT | `/api/users/me/password` | ✓ | Change password |

### Templates (admin)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/templates` | Create template |
| PUT | `/api/templates/:id` | Update template |
| DELETE | `/api/templates/:id` | Delete template |
| POST | `/api/templates/:id/duplicate` | Duplicate template |
| POST/PUT/DELETE | `/api/templates/:id/sections/...` | Section management |
| POST/PUT/DELETE | `/api/templates/:id/slots/...` | Slot management |

### Operations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/ops` | admin | Create operation or recurrence |
| PUT | `/api/ops/:id` | admin/missionmaker | Update operation |
| DELETE | `/api/ops/:id` | admin | Delete operation |
| POST | `/api/ops/:id/join` | ✓ | Sign up to a slot |
| POST | `/api/ops/:id/signoff` | ✓ | Sign off from a slot |
| PUT | `/api/ops/:id/slots/:slotId` | admin/missionmaker | Update slot metadata |

### Uploads

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/upload` | admin | General file upload |
| POST | `/api/upload/custom-marker` | admin/missionmaker | Marker icon upload |
| POST | `/api/upload/avatar` | ✓ | User avatar upload |

---

## Views

| Page key | Component | Role | Description |
|---|---|---|---|
| `overview` | `OrbatOverview` | Public | Canvas ORBAT + cards fallback; slot join |
| `scheduler` | `OrbatScheduler` | admin/missionmaker | Schedule and manage operations |
| `scheduler-detail` / `op-detail` | `OrbatScheduler` | admin/missionmaker | Full operation view with sign-up state |
| `builder` | `OrbatTemplate` | admin/missionmaker | Template editor |
| `signup` | `App.jsx` | Public | Registration form with age validation |
| `players` / `roles` / `settings` | Admin pages | admin | User and configuration management |

---

## Deployment

The app is designed to run as a **single Node.js process** — one command starts both the API and the static file server.

### Production setup

```bash
npm run build       # Generate dist/
node server.js      # Serve API + frontend
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `NODE_ENV` | — | Set to `production` for production mode |

> ⚠️ The JWT secret is currently hardcoded in `server.js` as `tfo-secret`.  
> Replace it with `process.env.JWT_SECRET` and inject a strong secret before exposing this app publicly.

### cPanel / shared hosting (Node.js App)

This app has been validated on a cPanel-based Node.js deployment (o2Switch):

- Upload project files (including `dist/`) to the application root
- Set startup file to `server.js`
- Run in `Production` mode with `NODE_ENV=production`
- Install dependencies via the cPanel NPM installer
- Point a subdomain to the application root
- Enable HTTPS via Let's Encrypt (add a CAA DNS record on the subdomain first if using an `odns.fr`-style shared domain)

### Update workflow

```bash
# Local
npm run build
# Upload new dist/ via FTP
# Restart the Node.js App in cPanel
```

---

## Notes

- `data/` and `uploads/` are created automatically on first run — do not need to exist before deployment
- Signup minimum age is controlled via `defaultOpSettings.minSignupAge` in `Settings` (stored in `localStorage`)
- Auth token is stored in `localStorage.token` — cleared on logout
- For scaling or concurrent write-heavy workloads, consider replacing the JSON file store with a database

---

## Files to review

[`src/App.jsx`](src/App.jsx) · [`src/OrbatOverview.jsx`](src/OrbatOverview.jsx) · [`src/OrbatScheduler.jsx`](src/OrbatScheduler.jsx) · [`src/OrbatTemplate.jsx`](src/OrbatTemplate.jsx) · [`src/Settings.jsx`](src/Settings.jsx) · [`server.js`](server.js)
