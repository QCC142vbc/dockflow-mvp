from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings


def register_and_login(client, role="OPERATOR"):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{role.lower()}@example.com",
            "full_name": "Manual Operations User",
            "role": role,
            "password": "manual-operations-password",
        },
    )
    assert response.status_code == 201
    response = client.post(
        "/api/v1/auth/login",
        data={"username": f"{role.lower()}@example.com", "password": "manual-operations-password"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def integration_headers(monkeypatch):
    secret = "s" * 40
    monkeypatch.setattr(settings, "SERVICE_AUTH_SECRET", secret)
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": settings.SERVICE_AUTH_ISSUER,
            "scope": "integration:write",
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "iss": settings.SERVICE_AUTH_ISSUER,
            "aud": settings.SERVICE_AUTH_AUDIENCE,
        },
        secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def test_empty_database_and_manual_records_persist_through_api(client, monkeypatch):
    headers = register_and_login(client)
    for path in ("/api/v1/dispatch/vehicles", "/api/v1/shipments/", "/api/v1/dispatch/queue", "/api/v1/operations/", "/api/v1/docks/"):
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        assert response.json() == []

    vehicle = client.post(
        "/api/v1/dispatch/vehicles",
        headers=headers,
        json={
            "plate": "MANUAL-101",
            "carrier_name": "Entered Carrier",
            "direction": "Inbound",
            "load_type": "Pallets",
            "pallet_count": 12,
            "status": "REGISTERED",
        },
    )
    assert vehicle.status_code == 201
    vehicle_id = vehicle.json()["id"]
    assert vehicle.json()["status"] == "REGISTERED"
    updated_vehicle = client.patch(
        f"/api/v1/dispatch/vehicles/{vehicle_id}",
        headers=headers,
        json={"status": "ARRIVED", "pallet_count": 14},
    )
    assert updated_vehicle.status_code == 200
    assert updated_vehicle.json()["status"] == "ARRIVED"
    invalid_vehicle = client.post(
        "/api/v1/dispatch/vehicles",
        headers=headers,
        json={
            "plate": "INVALID-TIME",
            "carrier_name": "Entered Carrier",
            "direction": "Inbound",
            "load_type": "Pallets",
            "appointment_time": "not-a-time",
        },
    )
    assert invalid_vehicle.status_code == 422

    shipment = client.post(
        "/api/v1/shipments/",
        headers=headers,
        json={
            "reference_number": "SHIP-MANUAL-101",
            "vehicle_id": vehicle_id,
            "cargo_type": "Pallets",
            "description": "User-entered shipment",
            "weight_kg": 1250,
            "quantity": 12,
            "status": "READY",
        },
    )
    assert shipment.status_code == 201
    shipment_id = shipment.json()["id"]
    updated_shipment = client.patch(
        f"/api/v1/shipments/{shipment_id}",
        headers=headers,
        json={"origin": "Manually edited origin", "status": "IN_TRANSIT"},
    )
    assert updated_shipment.status_code == 200
    assert updated_shipment.json()["origin"] == "Manually edited origin"

    queue_entry = client.post(
        "/api/v1/dispatch/queue",
        headers=headers,
        json={
            "vehicle_id": vehicle_id,
            "position": 1,
            "priority": "Standard",
            "arrival_time": "2026-10-02T09:00:00Z",
            "status": "WAITING",
        },
    )
    assert queue_entry.status_code == 201
    updated_queue_entry = client.patch(
        f"/api/v1/dispatch/queue/{queue_entry.json()['id']}",
        headers=headers,
        json={"position": 2, "priority": "Priority", "status": "ASSIGNED"},
    )
    assert updated_queue_entry.status_code == 200
    assert updated_queue_entry.json()["position"] == 2

    sync_headers = integration_headers(monkeypatch)
    warehouse = client.post(
        "/api/v1/integration/sync/warehouse",
        headers=sync_headers,
        json={"external_warehouse_id": "manual-wh", "name": "Manual Warehouse", "code": "MW"},
    )
    assert warehouse.status_code == 201
    dock = client.post(
        "/api/v1/integration/sync/dock",
        headers=sync_headers,
        json={
            "external_dock_id": "manual-dock-1",
            "external_warehouse_id": "manual-wh",
            "dock_code": "D-01",
            "name": "Dock 1",
        },
    )
    assert dock.status_code == 201
    dock_id = client.get("/api/v1/docks/", headers=headers).json()[0]["id"]

    operation = client.post(
        "/api/v1/operations/",
        headers=headers,
        json={
            "vehicle_id": vehicle_id,
            "shipment_id": shipment_id,
            "dock_id": dock_id,
            "operation_type": "LOADING",
            "status": "PENDING",
        },
    )
    assert operation.status_code == 201
    operation_id = operation.json()["id"]
    assert client.patch(
        f"/api/v1/docks/{dock_id}",
        headers=headers,
        json={"status": "available"},
    ).status_code == 409

    conflicting_assignment = client.post(
        "/api/v1/operations/",
        headers=headers,
        json={
            "vehicle_id": vehicle_id,
            "dock_id": dock_id,
            "operation_type": "UNLOADING",
            "status": "PENDING",
        },
    )
    assert conflicting_assignment.status_code == 409

    assert client.patch(
        f"/api/v1/operations/{operation_id}",
        headers=headers,
        json={"status": "IN_PROGRESS"},
    ).status_code == 422
    started = client.patch(
        f"/api/v1/operations/{operation_id}",
        headers=headers,
        json={"status": "IN_PROGRESS", "actual_start_time": "2026-10-02T09:15:00Z"},
    )
    assert started.status_code == 200
    completed = client.patch(
        f"/api/v1/operations/{operation_id}",
        headers=headers,
        json={"status": "COMPLETED", "actual_end_time": "2026-10-02T09:45:00Z"},
    )
    assert completed.status_code == 200
    assert completed.json()["progress"] == 100

    assert client.get("/api/v1/shipments/", headers=headers).json()[0]["reference_number"] == "SHIP-MANUAL-101"
    assert client.delete(f"/api/v1/shipments/{shipment_id}", headers=headers).status_code == 204
    retained = client.get("/api/v1/operations/", headers=headers).json()[0]
    assert retained["shipment_id"] == shipment_id
    assert client.get("/api/v1/shipments/", headers=headers).json()[0]["status"] == "CANCELLED"
    assert client.delete(f"/api/v1/dispatch/vehicles/{vehicle_id}", headers=headers).status_code == 204
    assert client.get("/api/v1/dispatch/vehicles?include_inactive=true", headers=headers).json()[0]["is_active"] is False


def test_manual_writes_require_an_operational_role(client):
    headers = register_and_login(client, role="VIEWER")
    assert client.get("/api/v1/dispatch/vehicles", headers=headers).status_code == 200
    response = client.post(
        "/api/v1/dispatch/vehicles",
        headers=headers,
        json={
            "plate": "READONLY-1",
            "carrier_name": "Carrier",
            "direction": "Inbound",
            "load_type": "Pallets",
        },
    )
    assert response.status_code == 403


def test_appointment_sync_requires_user_entered_carrier_and_cargo(client, monkeypatch):
    headers = integration_headers(monkeypatch)
    payload = {
        "appointment_id": "appointment-manual-1",
        "reference_number": "APT-MANUAL-1",
        "scheduled_start": "2026-10-02T09:00:00Z",
        "scheduled_end": "2026-10-02T10:00:00Z",
        "status": "CONFIRMED",
        "vehicle_registration": "MANUAL-APPT-1",
        "vehicle_type": "Truck",
        "cargo_type": "Pallets",
    }

    missing_carrier = client.post(
        "/api/v1/integration/sync/appointment",
        headers=headers,
        json=payload,
    )
    assert missing_carrier.status_code == 422

    synced = client.post(
        "/api/v1/integration/sync/appointment",
        headers=headers,
        json={**payload, "carrier_name": "User-entered carrier"},
    )
    assert synced.status_code == 201
    auth = register_and_login(client)
    vehicle = client.get("/api/v1/dispatch/vehicles", headers=auth).json()[0]
    assert vehicle["carrier_name"] == "User-entered carrier"
    assert vehicle["load_type"] == "Pallets"
    assert client.get("/api/v1/shipments/", headers=auth).json() == []
