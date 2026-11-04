import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_secret_key_is_required():
    with pytest.raises(ValidationError, match="SECRET_KEY must be configured"):
        Settings(
            _env_file=None,
            SECRET_KEY=" ",
            CORS_ORIGINS="http://localhost:5173",
        )


def test_secret_key_must_be_at_least_32_characters():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(
            _env_file=None,
            SECRET_KEY="s" * 31,
            CORS_ORIGINS="http://localhost:5173",
        )


@pytest.mark.parametrize("origins", ["", "http://localhost:5173,*"])
def test_cors_requires_explicit_origins(origins):
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings(
            _env_file=None,
            SECRET_KEY="s" * 32,
            CORS_ORIGINS=origins,
        )


def test_service_auth_secret_must_be_long_enough():
    with pytest.raises(ValidationError, match="SERVICE_AUTH_SECRET"):
        Settings(
            _env_file=None,
            SECRET_KEY="s" * 32,
            CORS_ORIGINS="http://localhost:5173",
            SERVICE_AUTH_SECRET="short",
        )


def test_health_endpoint_is_available(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
