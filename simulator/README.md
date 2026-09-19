# DockFlow simulator

The simulator is a self-contained Node.js data tool. It does not import React or share presentation logic with the dashboard.

## Lifecycle

1. `generate.js` creates a deterministic or random operational snapshot.
2. `validate.js` checks shape, dates, IDs, dock/vehicle references, queue references, and Now Calling consistency.
3. `import.js` validates external JSON, rejects duplicate IDs, and stores accepted datasets without silent overwrites.
4. `server.js` exposes read-only dataset endpoints plus a development-only generation endpoint.
5. `cleanup.js` archives expired files and deletes them after the configured grace period.

Generated snapshots are written to `data/snapshots/`, imported files to `data/imports/`, the selected dataset to `data/current/latest.json`, and lifecycle metadata to `data/manifest/index.json`.

All generated and imported datasets expire seven days after creation. Cleanup moves expired snapshots to `data/archive/` and permanently deletes archived files after two additional days by default.
