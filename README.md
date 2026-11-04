# DockFlow Operations

DockFlow is a manually operated warehouse and logistics management application. Operational records are entered by authenticated users and persisted by the DockFlow Operations API. The application does not create demo warehouses, vehicles, shipments, dock assignments, or simulated activity.

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

Set `VITE_OPERATIONS_API_URL` if the API is not at `http://localhost:8001/api/v1`. `VITE_APPOINTMENT_APP_URL` optionally sets the link used to manage warehouse and dock definitions.

## Manual operations

After signing in, use the dashboard to register and edit vehicles, shipments/cargo, arrival queue entries, dock assignments, actual loading/unloading start and end times, progress, and statuses. Search the record lists, refresh from the API, and confirm delete/deactivation actions. Started operations remain as history; linked shipments are cancelled rather than destructively removed.

Dashboard metrics are derived from persisted records. A metric requiring data that has not been entered is shown as unavailable rather than estimated from a scenario. Existing browser-local dataset files are not loaded into operations or migrated automatically; use **Export legacy datasets** to preserve them explicitly.

## Tests and checks

```powershell
cd DockFlow
npm test
npm run typecheck
npm run build
cd backend
python -m pytest
```
