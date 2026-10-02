# DockFlow

DockFlow is a display-first logistics operations dashboard for a warehouse dispatch floor. It is a realistic, frontend-only prototype for coordinating dock assignments, vehicle queues, loading progress, and operational exceptions from a large wall display.

## Features

- Dark industrial control-room UI with high-contrast typography for distance viewing.
- Live clock, warehouse connection state, shift context, and prominent “Now Calling” dispatch instructions.
- Waiting vehicle queue with priority, documentation, delay, and direction information.
- Dataset-driven dock grid (1–24 docks) with loading, unloading, cleaning, maintenance, delayed, called, and available states.
- KPI metrics and dock legend totals derived from the selected operations dataset.
- Live simulation mode with an explicit pause/resume control and an 18-second operations cycle.
- “Requires Attention” panel for documentation, maintenance, sanitation, and safety-related exceptions.
- Browser-local dataset library with scenario-driven creation, validation, preview, JSON import/export, selection, duplication, and deletion.
- Dispatch Console with priority-aware recommendations, manual operator actions, explicit conflict handling, and an operations timeline.
- Capacity & Bottleneck Analysis based on the active dataset, including a dock heatmap, evidence-ranked constraints, contributing-factor hypotheses, and temporary what-if projections.
- Keyboard-accessible filters, dock cards, alerts, and a focus-managed dock detail dialog.
- Responsive tablet and compact mobile layouts.
- The dashboard clock and date always use the computer's current time, displayed in the `Europe/Budapest` (Hungarian) timezone.

## Getting started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5175`. The development server binds to `localhost` only and is not exposed to other devices on the network.

## Commands

```bash
npm run dev          # Start the Vite development server
npm run build        # Create the production bundle in dist/
npm run typecheck    # Check the TypeScript data and analysis modules
npm test             # Run dispatch-engine and state-transition tests
npm run preview      # Preview the production bundle locally
```

## Technology

- React 18
- Vite 5
- TypeScript dataset models, simulation configuration, validation, generation, and capacity analysis
- lucide-react icons
- CSS custom properties and responsive media queries
- Bundled demo data and browser-local datasets; no backend is required by the dashboard

## Simulation data tool

DockFlow includes a standalone Node.js simulator under `simulator/`. It is intentionally separate from React presentation code and owns generation, validation, importing, indexing, retention, and cleanup.

```bash
npm run simulate:generate                         # Generate a normal snapshot
npm run simulate:normal -- --seed 20260919        # Reproducible normal dataset
npm run simulate:busy                             # High-volume scenario
npm run simulate:disruption                       # Late arrivals/documentation scenario
npm run simulate:maintenance                      # Maintenance/safety scenario
npm run simulate:import -- path/to/file.json      # Validate and import a dataset
npm run simulate:import -- path/to/file.json --current
npm run simulate:validate -- data/current/latest.json
npm run simulate:serve                            # Local API on port 8787
npm run simulate:cleanup                          # Archive expired data and remove aged archives
npm run simulate:cleanup -- --dry-run             # Preview cleanup without changing files
```

Generated data is retained for seven days, then moved to `data/archive/`. Archived files are permanently removed after the two-day grace period (configurable with `--grace-days=N`). Every operation is recorded in `data/cleanup.log`. Runtime directories and manifests are ignored by Git; only the schema and bundled demo fixture are committed.

Dataset timestamps are stored as UTC ISO timestamps. Warehouse display dates are calculated using the `Europe/Budapest` timezone so the simulator and dashboard stay aligned with the local computer clock.

The simulator dataset contract is documented in `data/schema/operations-dataset.schema.json` (JSON Schema Draft 2020-12). It describes the required metadata, warehouse, vehicle, queue, dock, alert, KPI, and integrity fields, plus optional Cargo & Compliance data. The simulator validator additionally checks cross-record references, duplicate IDs, expiry ordering, record counts, and the checksum.

Use **New simulation** in the dashboard to configure and preview a dataset before saving it. The form supports 1–24 docks and 0–500 vehicles, validates operational capacity, and applies scenario-based defaults that can be overridden. Created and imported datasets are stored in browser local storage; the bundled demo remains available as a starter dataset. Storage is local to the current browser and is not synchronized between devices.

The active dataset drives the dock grid, queue, attention panel, metrics, and **Capacity & Bottlenecks** analysis. The analysis module is in `src/data/capacityAnalysis.ts`; its dashboard presentation is in `src/capacityAnalysis.jsx`.

### Dispatch Engine & Manual Actions

The **Dispatch Console** selects a waiting or assigned vehicle and uses `src/data/dispatchEngine.ts` to recommend a dock. Recommendations account for priority and queue order, documentation blocks, direction when represented, maintenance/cleaning state, occupancy, current workload/progress, and configured processing time. The current dataset does not define vehicle-to-dock restrictions beyond the dock direction field, so no unrepresented compatibility rules are assumed.

Operators can call or assign a vehicle, reassign a called vehicle, start and complete operations, hold/resume or delay queue entries, cancel an unstarted assignment, and release a completed dock. Invalid transitions are rejected and shown as dispatch conflicts in **Requires Attention** and the operations timeline. The 18-second simulation remains pausable: before operator control, automatic dispatch chooses the highest-priority dispatchable vehicle; after a manual action, automatic assignment pauses for the current working session while active operations continue to progress. Manually managed operations require operator completion and dock release.

Dispatch actions update an in-memory working copy only; they do not alter or overwrite the selected localStorage dataset. Switching datasets resets the working copy. Dispatch event timestamps remain UTC ISO values and are rendered in `Europe/Budapest` local time. Queue entries labeled **Documentation check** are treated as blocked because the data model has no separate documentation-status field.

### Capacity & Bottleneck Analysis

The analysis is recalculated from the selected dataset. It presents total, available, and used docks; capacity utilization; average and peak dock utilization; processing and waiting estimates; queue length; throughput; delayed operations; and free-dock surplus versus queued-work deficit. Existing footer KPIs use the shared analysis results for overlapping values.

Detected constraints are ranked by severity and provide evidence, affected area, metric comparisons, affected-operation counts, and the dataset snapshot period. Detection covers unavailable capacity, queue congestion, arrival-rate versus throughput imbalance, long waits relative to processing time, disruptions, and individual dock utilization outliers relative to the dock distribution. “Possible contributing factors” are hypotheses based on available dataset measures, not claims of confirmed causes.

The dock heatmap reports snapshot operation progress as per-dock utilization. It is not a historical time series: the dataset does not contain repeated dock observations or completed-operation durations. Likewise, queued vehicles are not attributed to individual docks, so dock-level wait time is unavailable. When the dataset lacks required metrics or timestamps, the analysis labels those values as unavailable rather than filling them with fabricated values.

The **What if?** controls temporarily project adding or removing docks, reducing processing time by 10%, or increasing arrival volume by 10% or 20%. Projections use available dataset throughput, service-time, utilization-target, and arrival-interval values. They do not edit or save the active dataset; assumptions and unavailable inputs are shown with the projection.

JSON imports are checked for supported schema, references, counts, and integrity before they are saved. Export the selected dataset from **Manage datasets**.

### Cargo & Compliance data model (Phase 1)

Datasets may optionally include a normalized `cargoCompliance` object containing `cargo`, `containerTypes`, `adrRecords`, and `handlingRequirements` collections. Cargo records reference container definitions, ADR records, and handling-requirement definitions by ID; optional vehicle references are checked against the dataset's vehicle records. Shipment and operation IDs are reserved as extensible references because those entity collections are not currently part of the DockFlow dataset model.

Container dimensions use metres, and cargo/container weights use kilograms; cargo volume uses cubic metres. Container types are data-driven rather than a fixed list. ADR status is represented as `applicable`, `not-applicable`, or `unknown`; this model captures operational data and validates basic record shape, but is not a complete legal ADR rules database. Handling requirements are configurable definitions with typed scalar attributes.

The optional section is validated by both the browser dataset validator and simulator validator and is described by the dataset JSON Schema. Existing datasets without `cargoCompliance` remain valid. When a legacy dataset first opens Cargo & Compliance, it receives a starter container catalog stored as ordinary records in that dataset. The container library supports search, category/status/capability filters, editable dimensions and weight limits (metres and kilograms), duplication into an editable new record, activation controls, and deletion only when no cargo record references the type. Payload must be positive and cannot exceed maximum gross weight minus tare weight. These records are not used for dispatch decisions.

### Operational cargo assignment (Phase 5)

Operational cargo is linked to an existing vehicle through `cargoCompliance.cargo[].vehicleId`; container, ADR, and handling data remain normalized ID references on that cargo record. The Dispatch Console displays these details for the selected vehicle and lets an operator assign/unassign catalog cargo or update its references. Newly selected container, ADR, and handling definitions must be active, while existing inactive references remain visible and can be preserved. Assignment changes are stored in the optional `cargoAssignmentHistory` and shown alongside dispatch events in the Europe/Budapest Operations Timeline. Datasets that omit Cargo & Compliance continue to display normally. The dataset currently models vehicles and queue/dock operations but has no shipment or operation entity collections, so this phase does not create a parallel shipment model or invent those relationships. Cargo metadata does not affect automatic dock selection or eligibility.

### Operational validation & conflict detection (Phase 6)

`src/data/operationalConflictEngine.ts` exposes `validateOperation(dataset, operationId)`, `validateVehicle(dataset, vehicleId)`, and `validateAllOperationalCargo(dataset)`. Findings have stable IDs, typed categories, severity (`blocking`, `warning`, or `info`), evidence values, and related-record references. The dashboard derives these findings into the existing **Requires Attention** panel and labels the severity explicitly. A blocking finding is preparation data only; it does not automatically disable or change dispatch actions.

Implemented checks cover dangling vehicle/container/ADR/handling references, missing required fields on an ADR record explicitly marked applicable, cargo weight greater than the configured container payload (or the lower available limit from explicit payload and gross limit minus tare), inactive linked container/ADR/handling definitions, unknown ADR applicability, missing capacity data needed for comparison, multiple dock assignments, queue-and-dock duplication, occupied maintenance/cleaning docks, and missing operation IDs requested for validation. Capacity findings include the cargo weight, computed limit, source, and configured gross/tare values. Unconfigured capacity is informational, not guessed.

The model cannot determine whether cargo with no ADR reference is dangerous, whether an unselected handling requirement is mandatory, whether a container capability is required by a particular cargo/operation, or validate shipment/operation records because those entities and requirements are not represented. It also has no regulatory classification rules, cargo-to-dock compatibility data, or legal ADR dataset. Those checks are intentionally omitted; no legal compliance claim is made. Existing dataset schema validation remains responsible for import rejection of malformed structure, while this engine provides explainable operational findings for validated or partially edited in-memory state.

The dashboard currently starts with the bundled fixture at `data/examples/demo-dataset.json`; it does not fetch the simulator API. The local simulator API is available separately for manual use or other development clients:

- `GET /api/operations/current`
- `GET /api/operations/datasets`
- `GET /api/operations/datasets/:id`
- `POST /api/operations/generate?scenario=normal` (development only)

## GitHub Pages deployment

The application is configured with the Vite base path `/dockflow-mvp/`, matching the expected repository path. The workflow at `.github/workflows/deploy.yml` builds on every push to `main` and deploys the generated `dist/` artifact using the official GitHub Pages actions.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The resulting site will be available at:

`https://<github-owner>.github.io/dockflow-mvp/`

The `dist/` output and `node_modules/` are intentionally ignored by Git and are recreated by the workflow.

Operational recommendations and projections depend on the completeness and accuracy of the selected dataset. Snapshot-only and estimated values are labeled in the dashboard.
