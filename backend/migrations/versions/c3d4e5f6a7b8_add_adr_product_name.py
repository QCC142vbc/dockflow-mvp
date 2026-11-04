"""Support user-provided cargo names and conditional packing groups."""

from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("adr_catalog") as batch:
        batch.add_column(sa.Column("product_name", sa.String(length=500), nullable=True))
        batch.alter_column(
            "proper_shipping_name",
            existing_type=sa.String(length=500),
            nullable=True,
        )
        batch.alter_column(
            "packing_group",
            existing_type=sa.String(length=3),
            type_=sa.String(length=10),
            nullable=True,
        )

    with op.batch_alter_table("shipments") as batch:
        batch.alter_column(
            "adr_packing_group",
            existing_type=sa.String(length=3),
            type_=sa.String(length=10),
            nullable=True,
        )


def downgrade():
    with op.batch_alter_table("shipments") as batch:
        batch.alter_column(
            "adr_packing_group",
            existing_type=sa.String(length=10),
            type_=sa.String(length=3),
            nullable=True,
        )

    with op.batch_alter_table("adr_catalog") as batch:
        batch.alter_column(
            "packing_group",
            existing_type=sa.String(length=10),
            type_=sa.String(length=3),
            nullable=True,
        )
        batch.alter_column(
            "proper_shipping_name",
            existing_type=sa.String(length=500),
            nullable=False,
        )
        batch.drop_column("product_name")
