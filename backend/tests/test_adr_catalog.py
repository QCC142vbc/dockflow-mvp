import csv
from pathlib import Path

import pytest

from app.schemas.adr_catalog import ADRCatalogEntryInput, ADRCatalogImportRequest
from pydantic import ValidationError


def register_admin(client):
    registration = client.post(
        "/api/v1/auth/register",
        json={
            "email": "adr-admin@example.com",
            "full_name": "ADR Catalog Admin",
            "role": "ADMIN",
            "password": "adr-catalog-test-password",
        },
    )
    assert registration.status_code == 201
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "adr-admin@example.com",
            "password": "adr-catalog-test-password",
        },
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def catalog_entry(**overrides):
    return {
        "un_number": "un 9999",
        "proper_shipping_name": "TEST SUBSTANCE (DEMO ONLY)",
        "hazard_class": "3",
        "packing_group": "PG II",
        "label_codes": ["3"],
        "special_provisions": ["TEST-SP"],
        "packing_instructions": ["TEST-P"],
        "regulatory_description": "Test fixture only; not an ADR classification.",
        "source": "Automated test fixture",
        "reference_version": "TEST",
        **overrides,
    }


def test_adr_catalog_import_is_authenticated_and_upserts_by_un_number(client):
    headers = register_admin(client)
    assert client.get("/api/v1/adr-catalog/").status_code == 401
    assert client.get("/api/v1/adr-catalog/", headers=headers).json() == []

    payload = {"entries": [catalog_entry()]}
    first = client.post("/api/v1/adr-catalog/import", headers=headers, json=payload)
    assert first.status_code == 200
    assert first.json() == {"created": 1, "updated": 0, "total": 1}

    second = client.post(
        "/api/v1/adr-catalog/import",
        headers=headers,
        json={"entries": [catalog_entry(proper_shipping_name="UPDATED TEST NAME")]},
    )
    assert second.status_code == 200
    assert second.json() == {"created": 0, "updated": 1, "total": 1}

    records = client.get("/api/v1/adr-catalog/", headers=headers).json()
    assert len(records) == 1
    assert records[0]["un_number"] == "UN 9999"
    assert records[0]["proper_shipping_name"] == "UPDATED TEST NAME"


def test_adr_catalog_import_validates_classes_and_duplicate_numbers():
    assert ADRCatalogImportRequest(
        entries=[catalog_entry(hazard_class="2.1")]
    ).entries[0].hazard_class == "2.1"
    assert ADRCatalogImportRequest(
        entries=[
            catalog_entry(
                product_name="Aeroszolok",
                proper_shipping_name=None,
                hazard_class="2.1 / 2.2",
                packing_group="N/A",
            )
        ]
    ).entries[0].hazard_class == "2.1 / 2.2"
    with pytest.raises(ValidationError):
        ADRCatalogImportRequest(entries=[catalog_entry(hazard_class="10")])
    with pytest.raises(ValidationError, match="duplicate UN numbers"):
        ADRCatalogImportRequest(entries=[catalog_entry(), catalog_entry(un_number="UN9999")])


def test_supplied_draft_file_has_150_valid_unique_catalog_entries():
    source_file = Path(__file__).parents[1] / "data" / "adr_catalog_2025_user_draft.tsv"
    with source_file.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))

    entries = ADRCatalogImportRequest(
        entries=[
            ADRCatalogEntryInput(
                **row,
                source="User-provided ADR 2025 cargo list (unverified)",
                reference_version="ADR 2025 (unverified user draft)",
                regulatory_description=(
                    "UNVERIFIED USER-PROVIDED DRAFT. Verify against official ADR 2025 Table A "
                    "before shipment. Conditional values marked with * require composition-specific review."
                ),
            )
            for row in rows
        ]
    )

    assert len(entries.entries) == 150
    assert len({entry.un_number for entry in entries.entries}) == 150


def test_shipment_keeps_catalog_snapshot_and_demo_vehicle_import_is_idempotent(client):
    headers = register_admin(client)
    imported = client.post(
        "/api/v1/adr-catalog/import",
        headers=headers,
        json={"entries": [catalog_entry()]},
    )
    assert imported.status_code == 200
    adr_id = client.get("/api/v1/adr-catalog/", headers=headers).json()[0]["id"]

    shipment_response = client.post(
        "/api/v1/shipments/",
        headers=headers,
        json={
            "reference_number": "SHIP-ADR-TEST-1",
            "cargo_type": "Test cargo",
            "adr_catalog_id": adr_id,
        },
    )
    assert shipment_response.status_code == 201
    shipment = shipment_response.json()
    assert shipment["adr_un_number"] == "UN 9999"
    assert shipment["adr_hazard_class"] == "3"
    assert shipment["adr_regulatory_details"]["reference_version"] == "TEST"

    forged_snapshot = client.patch(
        f"/api/v1/shipments/{shipment['id']}",
        headers=headers,
        json={"adr_hazard_class": "9"},
    )
    assert forged_snapshot.status_code == 200
    assert forged_snapshot.json()["adr_hazard_class"] == "3"

    client.post(
        "/api/v1/adr-catalog/import",
        headers=headers,
        json={"entries": [catalog_entry(proper_shipping_name="CHANGED TEST NAME")]},
    )
    refreshed_shipment = client.get(
        "/api/v1/shipments/", headers=headers
    ).json()[0]
    assert refreshed_shipment["adr_proper_shipping_name"] == "TEST SUBSTANCE (DEMO ONLY)"

    first_presets = client.post("/api/v1/dispatch/vehicles/demo-presets", headers=headers)
    second_presets = client.post("/api/v1/dispatch/vehicles/demo-presets", headers=headers)
    assert first_presets.status_code == 200
    assert first_presets.json()["created"] == 5
    assert len(first_presets.json()["vehicles"]) == 5
    assert second_presets.status_code == 200
    assert second_presets.json()["created"] == 0
    assert second_presets.json()["existing"] == 5
    assert all(vehicle["plate"].startswith("DEMO-") for vehicle in second_presets.json()["vehicles"])
