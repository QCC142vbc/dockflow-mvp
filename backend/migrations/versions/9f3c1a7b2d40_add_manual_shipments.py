"""Add persistent shipment and manually entered execution fields."""

from alembic import op
import sqlalchemy as sa

revision = "9f3c1a7b2d40"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "shipments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("reference_number", sa.String(length=100), nullable=False, unique=True),
        sa.Column("vehicle_id", sa.String(length=36), sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cargo_type", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("origin", sa.String(length=200), nullable=True),
        sa.Column("destination", sa.String(length=200), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="REGISTERED"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_shipments_reference_number", "shipments", ["reference_number"])
    op.create_index("ix_shipments_vehicle_id", "shipments", ["vehicle_id"])
    op.add_column(
        "vehicles",
        sa.Column("status", sa.String(length=50), nullable=False, server_default="REGISTERED"),
    )
    op.add_column(
        "vehicles",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    with op.batch_alter_table("operations") as batch:
        batch.add_column(sa.Column("shipment_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key(
            "fk_operations_shipment_id",
            "shipments",
            ["shipment_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_index("ix_operations_shipment_id", ["shipment_id"])


def downgrade():
    with op.batch_alter_table("operations") as batch:
        batch.drop_index("ix_operations_shipment_id")
        batch.drop_constraint("fk_operations_shipment_id", type_="foreignkey")
        batch.drop_column("shipment_id")
    op.drop_index("ix_shipments_vehicle_id", table_name="shipments")
    op.drop_index("ix_shipments_reference_number", table_name="shipments")
    op.drop_table("shipments")
    op.drop_column("vehicles", "is_active")
    op.drop_column("vehicles", "status")
