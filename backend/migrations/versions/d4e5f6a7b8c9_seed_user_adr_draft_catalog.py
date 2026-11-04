"""Seed the user-provided, explicitly unverified ADR cargo draft."""

import csv
from datetime import datetime, timezone
from pathlib import Path
import uuid

from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None

SOURCE_FILE = Path(__file__).resolve().parents[2] / "data" / "adr_catalog_2025_user_draft.tsv"
SOURCE_LABEL = "User-provided ADR 2025 cargo list (UNVERIFIED DRAFT)"
REFERENCE_VERSION = "ADR 2025 (user-provided, unverified)"
REGULATORY_WARNING = (
    "UNVERIFIED USER-PROVIDED DRAFT. Verify against official ADR 2025 Table A before shipment. "
    "Composition-dependent entries require review. LQ, tunnel restriction, transport category, "
    "special provisions, and hazard labels were not supplied; confirm these in Table A."
)


def upgrade():
    catalog = sa.table(
        "adr_catalog",
        sa.column("id", sa.String(length=36)),
        sa.column("un_number", sa.String(length=7)),
        sa.column("product_name", sa.String(length=500)),
        sa.column("proper_shipping_name", sa.String(length=500)),
        sa.column("hazard_class", sa.String(length=20)),
        sa.column("classification_code", sa.String(length=50)),
        sa.column("packing_group", sa.String(length=10)),
        sa.column("label_codes", sa.JSON()),
        sa.column("special_provisions", sa.JSON()),
        sa.column("packing_instructions", sa.JSON()),
        sa.column("transport_category", sa.String(length=20)),
        sa.column("tunnel_restriction_code", sa.String(length=20)),
        sa.column("limited_quantity", sa.String(length=100)),
        sa.column("excepted_quantity", sa.String(length=100)),
        sa.column("regulatory_description", sa.Text()),
        sa.column("source", sa.String(length=300)),
        sa.column("source_url", sa.String(length=1000)),
        sa.column("reference_version", sa.String(length=50)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    bind = op.get_bind()
    existing_numbers = set(bind.execute(sa.select(catalog.c.un_number)).scalars())
    with SOURCE_FILE.open(encoding="utf-8", newline="") as source_file:
        rows = list(csv.DictReader(source_file, delimiter="\t"))

    if len(rows) != 150:
        raise ValueError(f"Expected 150 user-provided ADR draft rows, found {len(rows)}.")

    now = datetime.now(timezone.utc)
    records = [
        {
            "id": str(uuid.uuid4()),
            "un_number": row["un_number"],
            "product_name": row["product_name"],
            "proper_shipping_name": None,
            "hazard_class": row["hazard_class"],
            "classification_code": None,
            "packing_group": row["packing_group"],
            "label_codes": [],
            "special_provisions": [],
            "packing_instructions": [],
            "transport_category": None,
            "tunnel_restriction_code": None,
            "limited_quantity": None,
            "excepted_quantity": None,
            "regulatory_description": REGULATORY_WARNING,
            "source": SOURCE_LABEL,
            "source_url": None,
            "reference_version": REFERENCE_VERSION,
            "created_at": now,
            "updated_at": now,
        }
        for row in rows
        if row["un_number"] not in existing_numbers
    ]
    if records:
        bind.execute(catalog.insert(), records)


def downgrade():
    catalog = sa.table(
        "adr_catalog",
        sa.column("un_number", sa.String(length=7)),
        sa.column("source", sa.String(length=300)),
        sa.column("reference_version", sa.String(length=50)),
    )
    op.get_bind().execute(
        catalog.delete().where(
            catalog.c.source == SOURCE_LABEL,
            catalog.c.reference_version == REFERENCE_VERSION,
        )
    )
