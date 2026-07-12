TFO Webapp — Viewers

This project has multiple ORBAT viewer variants and pages. Below is a concise reference describing responsibilities and intended audience for each viewer.

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

If you'd like, I can add a small diagram showing the page flows (overview → op-detail/scheduler) or add a short list of tests to prevent regressions when changing which component is rendered.