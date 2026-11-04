from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings


WAREHOUSE_PAYLOAD = {
    "external_warehouse_id": "warehouse-external-1",
    "name": "Test Warehouse",
    "code": "TEST-WH-1",
}


def service_token(secret):
    now = datetime.now(timezone.utc)
    return jwt.encode(
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


def test_sync_endpoint_rejects_missing_service_credentials(client, monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_AUTH_SECRET", "s" * 40)

    response = client.post(
        "/api/v1/integration/sync/warehouse",
        json=WAREHOUSE_PAYLOAD,
    )

    assert response.status_code == 401


def test_sync_endpoint_rejects_when_service_auth_is_unconfigured(client, monkeypatch):
    monkeypatch.setattr(settings, "SERVICE_AUTH_SECRET", None)

    response = client.post(
        "/api/v1/integration/sync/warehouse",
        json=WAREHOUSE_PAYLOAD,
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 503


def test_sync_endpoint_accepts_valid_service_token(client, monkeypatch):
    secret = "s" * 40
    monkeypatch.setattr(settings, "SERVICE_AUTH_SECRET", secret)

    response = client.post(
        "/api/v1/integration/sync/warehouse",
        json=WAREHOUSE_PAYLOAD,
        headers={"Authorization": f"Bearer {service_token(secret)}"},
    )

    assert response.status_code == 201
    assert response.json()["data"]["external_warehouse_id"] == "warehouse-external-1"
