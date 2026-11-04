# DockFlow Operations Backend

FastAPI backend providing persistent state, operational execution tracking, and cross-service integration endpoints for the DockFlow Operations dashboard.

Database initialization and migrations create or update the schema only. They never create demo warehouses, vehicles, shipments, dock assignments, or operational events. Operational records are created through authenticated API endpoints; warehouses and dock definitions are synchronized from Dock Appointment Scheduling.

## Key Features
- **UUID Primary Keys** for all resources (`docks`, `vehicles`, `queue_entries`, `operations`, etc.)
- **Cross-Service Data Sync** endpoints supporting the integration specs with `DockAppointmentScheduling`
- **Transactional Outbox & Event Tracking** tables for reliable event-driven updates
- **JWT Authentication** compatible with `dockflow-ecosystem`
- **Europe/Budapest** timezone-aware datetime normalization via custom `UTCDateTime`

## Quick Start

### 1. Environment & Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
```

Generate `SECRET_KEY` with `python -c "import secrets; print(secrets.token_urlsafe(32))"` and put the result in `.env` before starting the service. When enabling appointment synchronization, set `SERVICE_AUTH_SECRET` to a separate random value shared by both services; do not reuse `SECRET_KEY`.

### 2. Initialize Database
```bash
python init_db.py
```

### 3. Run Development Server
```bash
uvicorn app.main:app --reload --port 8001
```

- Swagger UI: `http://localhost:8001/docs`
- ReDoc: `http://localhost:8001/redoc`
- Health check: `http://localhost:8001/health`

Integration sync endpoints require a short-lived bearer token issued by the Appointment Scheduling outbox worker. Configure matching `SERVICE_AUTH_SECRET`, `SERVICE_AUTH_ISSUER`, and `SERVICE_AUTH_AUDIENCE` values in both backends. `CORS_ORIGINS` must contain explicit origins; wildcard origins are rejected.

Run backend tests with:

```powershell
python -m pytest
```
