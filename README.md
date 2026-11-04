# DockFlow Operations

DockFlow is a manually operated warehouse and logistics management application. Operational records are entered by authenticated users and persisted by the DockFlow Operations API. It does not automatically create demo warehouses, vehicles, shipments, dock assignments, or simulated activity; users may explicitly seed clearly marked DEMO vehicles for evaluation.

## Architecture and data ownership

- **Dock Appointment Scheduling** is authoritative for warehouses, dock definitions, carriers, users, and planned appointments.
- **DockFlow Operations** owns vehicle arrivals, shipments/cargo, queue entries, dock assignments, and loading/unloading execution.
- Real appointment and reference records are synchronized through the existing authenticated integration. The services use their existing databases and never write directly to one another's database.
- In DockFlow Operations, dock definitions are read-only synchronized references. Create and manage warehouses and docks in Appointment Scheduling; update actual dock-operation status in DockFlow Operations.

## Start the applications

Follow [Dock Appointment Scheduling setup](../DockAppointmentScheduling/README.md) to start its API and frontend. Configure both backend databases and the existing integration authentication before enabling synchronization.

Start DockFlow Operations:

```powershell
cd DockFlow\backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
python init_db.py
uvicorn app.main:app --reload --port 8001
```

Set a secure `SECRET_KEY` and the existing database URL in `backend/.env` before running the API. `python init_db.py` creates or migrates the schema only; it creates no users or operational records. Create the first Operations account through the authenticated deployment's approved administrator/bootstrap process.

In another terminal:

```powershell
cd DockFlow
npm install
npm run dev
```

The frontend defaults to the Operations API on the same host at port 8001, so it works both on localhost and when opened from another device on the LAN. Set `VITE_OPERATIONS_API_URL` if the API is hosted elsewhere, and add the frontend's exact origin to backend `CORS_ORIGINS`. `VITE_APPOINTMENT_APP_URL` optionally sets the link used to manage warehouse and dock definitions.

## Manual operations

After signing in, use the dashboard to register and edit vehicles, shipments/cargo, arrival queue entries, dock assignments, actual loading/unloading start and end times, progress, and statuses. Search the record lists, refresh from the API, and confirm delete/deactivation actions. Started operations remain as history; linked shipments are cancelled rather than destructively removed.

Dashboard metrics are derived from persisted records. A metric requiring data that has not been entered is shown as unavailable rather than estimated from a scenario. Existing browser-local dataset files are not loaded into operations or migrated automatically; use **Export legacy datasets** to preserve them explicitly.

### ADR catalog and demo vehicles

The shipment form can select an ADR entry from the authenticated catalog. Catalog imports are performed by an authorized operator through `POST /api/v1/adr-catalog/import`; each entry must include its source and reference version alongside the ADR fields. Imports update matching UN numbers and create missing entries. The [150-row user-provided ADR 2025 draft](./backend/data/adr_catalog_2025_user_draft.tsv) is loaded into the cargo catalog, not as 150 live shipments. It is explicitly marked as unverified; classifications and conditional packing groups must be checked against official ADR Table A before operational use. LQ, tunnel, transport-category, and special-provision fields remain blank where the supplied list did not specify them. Each shipment stores a snapshot of the selected catalog data so later catalog updates do not rewrite shipment history.

The Vehicles section includes **Add 5 DEMO vehicle presets**. This is an explicit, repeatable action: it creates only missing records whose plates are marked `DEMO-` and never adds them to the queue or assigns them to shipments or operations.

## Tests and checks

```powershell
cd DockFlow
npm test
npm run typecheck
npm run build
cd backend
python -m pytest
```
