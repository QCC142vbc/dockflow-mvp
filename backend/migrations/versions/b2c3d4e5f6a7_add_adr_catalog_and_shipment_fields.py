"""Add an importable ADR reference catalog and shipment snapshots."""

from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "adr_catalog",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("un_number", sa.String(length=7), nullable=False),
        sa.Column("proper_shipping_name", sa.String(length=500), nullable=False),
        sa.Column("hazard_class", sa.String(length=20), nullable=False),
        sa.Column("classification_code", sa.String(length=50), nullable=True),
        sa.Column("packing_group", sa.String(length=3), nullable=True),
        sa.Column("label_codes", sa.JSON(), nullable=False),
        sa.Column("special_provisions", sa.JSON(), nullable=False),
        sa.Column("packing_instructions", sa.JSON(), nullable=False),
        sa.Column("transport_category", sa.String(length=20), nullable=True),
        sa.Column("tunnel_restriction_code", sa.String(length=20), nullable=True),
        sa.Column("limited_quantity", sa.String(length=100), nullable=True),
        sa.Column("excepted_quantity", sa.String(length=100), nullable=True),
        sa.Column("regulatory_description", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=300), nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("reference_version", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_adr_catalog_un_number", "adr_catalog", ["un_number"], unique=True)

    with op.batch_alter_table("shipments") as batch:
        batch.add_column(sa.Column("adr_catalog_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("adr_un_number", sa.String(length=7), nullable=True))
        batch.add_column(sa.Column("adr_proper_shipping_name", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("adr_hazard_class", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("adr_packing_group", sa.String(length=3), nullable=True))
        batch.add_column(sa.Column("adr_regulatory_details", sa.JSON(), nullable=True))
        batch.create_foreign_key(
            "fk_shipments_adr_catalog_id",
            "adr_catalog",
            ["adr_catalog_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_shipments_adr_catalog_id", ["adr_catalog_id"])


def downgrade():
    with op.batch_alter_table("shipments") as batch:
        batch.drop_index("ix_shipments_adr_catalog_id")
        batch.drop_constraint("fk_shipments_adr_catalog_id", type_="foreignkey")
        batch.drop_column("adr_regulatory_details")
        batch.drop_column("adr_packing_group")
        batch.drop_column("adr_hazard_class")
        batch.drop_column("adr_proper_shipping_name")
        batch.drop_column("adr_un_number")
        batch.drop_column("adr_catalog_id")

    op.drop_index("ix_adr_catalog_un_number", table_name="adr_catalog")
    op.drop_table("adr_catalog")
