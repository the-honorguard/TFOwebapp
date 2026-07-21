# Data model and ID policy

## ID policy

MySQL owns every persistent entity ID. Persistent tables use `BIGINT AUTO_INCREMENT` primary keys and application code must omit `id` from `INSERT` statements. The returned `insertId` is the canonical ID.

Browser-only optimistic records use `crypto.randomUUID()` with a `tmp-` prefix. These IDs are never persisted as entity IDs and are replaced by the server response.

Timestamps, `Date.now()`, `Math.random()` and combinations of time and randomness must not be used as persistent IDs.

Recurring occurrences are additionally protected by the unique database key `(recurrence_id, occurrence_at)`. This makes materialization idempotent across concurrent application instances.

## Relational entities

The ORBAT layout is stored in these tables:

- `template_squads` and `template_slots` for reusable templates;
- `operation_squads` and `operation_slots` for the independent operation snapshot;
- `operation_absences` and `recurrence_absences` for user relationships.

Squad and slot order is represented by `sort_order`. Assignments and template origins are foreign keys. The API hydrates these rows back into the nested `squads[].slots[]` response expected by the frontend.

## Remaining JSON

JSON is limited to flexible values that do not need their own identity or relationship:

- permission and profile setting maps;
- slot `allowed_roles` arrays;
- recurrence rule parameters;
- notification, file, role and audit metadata;
- backup snapshots.

`templates.data` and `ops.payload` may contain non-relational settings, but squads, slots, assignments and absences are not authoritative there.

## Verification

Run the regular suite with `npm test`. Run the real MySQL concurrency test with `npm run test:db`. The database test creates 100 operations concurrently, verifies operation, squad and slot ID uniqueness, and removes its test records afterward.
