# DockFlow

DockFlow is a display-first logistics operations dashboard for a warehouse dispatch floor. It is a realistic, frontend-only prototype for coordinating dock assignments, vehicle queues, loading progress, and operational exceptions from a large wall display.

## Features

- Dark industrial control-room UI with high-contrast typography for distance viewing.
- Live clock, warehouse connection state, shift context, and prominent “Now Calling” dispatch instructions.
- Waiting vehicle queue with priority, documentation, delay, and direction information.
- Twelve-bay dock grid with loading, unloading, cleaning, maintenance, delayed, called, and available states.
- Derived KPI metrics and dock legend totals from one coherent simulation state.
- Live simulation mode with an explicit pause/resume control and an 18-second operations cycle.
- “Requires Attention” panel for documentation, maintenance, sanitation, and safety-related exceptions.
- Keyboard-accessible filters, dock cards, alerts, and a focus-managed dock detail dialog.
- Responsive tablet and compact mobile layouts.
- The dashboard clock and date always use the computer's current time, displayed in the `Europe/Budapest` (Hungarian) timezone.

## Getting started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Commands

```bash
npm run dev      # Start the Vite development server
npm run build    # Create the production bundle in dist/
npm run preview  # Preview the production bundle locally
```

## Technology

- React 18
- Vite 5
- lucide-react icons
- CSS custom properties and responsive media queries
- Mock data only; no backend or third-party deployment service

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

The browser build consumes `src/data/operationsData.js`. GitHub Pages bundles `data/examples/demo-dataset.json`, while local development can use the simulator API endpoints:

- `GET /api/operations/current`
- `GET /api/operations/datasets`
- `GET /api/operations/datasets/:id`
- `POST /api/operations/generate?scenario=normal` (development only)

## GitHub Pages deployment

The application is configured with the Vite base path `/dockflow-mvp/`, matching the expected repository path. The workflow at `.github/workflows/deploy.yml` builds on every push to `main` and deploys the generated `dist/` artifact using the official GitHub Pages actions.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The resulting site will be available at:

`https://<github-owner>.github.io/dockflow-mvp/`

The `dist/` output and `node_modules/` are intentionally ignored by Git and are recreated by the workflow.

####Attention the output can not be trusted 100%!
