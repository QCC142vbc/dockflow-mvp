"""Repair operations tables missing from databases stamped at the current head."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "a1b2c3d4e5f6"
down_revision = "9f3c1a7b2d40"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "shipments" not in tables:
        op.create_table(
            "shipments",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("reference_number", sa.String(length=100), nullable=False, unique=True),
            sa.Column("vehicle_id", sa.String(length=36), nullable=True),
            sa.Column("cargo_type", sa.String(length=100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("weight_kg", sa.Float(), nullable=True),
            sa.Column("quantity", sa.Integer(), nullable=True),
            sa.Column("origin", sa.String(length=200), nullable=True),
            sa.Column("destination", sa.String(length=200), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="REGISTERED"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_shipments_reference_number", "shipments", ["reference_number"])
        op.create_index("ix_shipments_vehicle_id", "shipments", ["vehicle_id"])

    inspector = inspect(bind)
    vehicle_columns = {column["name"] for column in inspector.get_columns("vehicles")}
    if "status" not in vehicle_columns:
        op.add_column(
            "vehicles",
            sa.Column("status", sa.String(length=50), nullable=False, server_default="REGISTERED"),
        )
    if "is_active" not in vehicle_columns:
        op.add_column(
            "vehicles",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    inspector = inspect(bind)
    operation_columns = {column["name"] for column in inspector.get_columns("operations")}
    operation_indexes = {index["name"] for index in inspector.get_indexes("operations")}
    foreign_keys = {
        foreign_key.get("name")
        for foreign_key in inspector.get_foreign_keys("operations")
    }

    if (
        "shipment_id" not in operation_columns
        or "ix_operations_shipment_id" not in operation_indexes
        or "fk_operations_shipment_id" not in foreign_keys
    ):
        with op.batch_alter_table("operations") as batch:
            if "shipment_id" not in operation_columns:
                batch.add_column(sa.Column("shipment_id", sa.String(length=36), nullable=True))
            if "fk_operations_shipment_id" not in foreign_keys:
                batch.create_foreign_key(
                    "fk_operations_shipment_id",
                    "shipments",
                    ["shipment_id"],
                    ["id"],
                    ondelete="RESTRICT",
                )
            if "ix_operations_shipment_id" not in operation_indexes:
                batch.create_index("ix_operations_shipment_id", ["shipment_id"])


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "operations" in inspector.get_table_names():
        operation_columns = {column["name"] for column in inspector.get_columns("operations")}
        if "shipment_id" in operation_columns:
            operation_indexes = {index["name"] for index in inspector.get_indexes("operations")}
            foreign_keys = {
                foreign_key.get("name")
                for foreign_key in inspector.get_foreign_keys("operations")
            }
            with op.batch_alter_table("operations") as batch:
                if "ix_operations_shipment_id" in operation_indexes:
                    batch.drop_index("ix_operations_shipment_id")
                if "fk_operations_shipment_id" in foreign_keys:
                    batch.drop_constraint("fk_operations_shipment_id", type_="foreignkey")
                batch.drop_column("shipment_id")

    inspector = inspect(bind)
    if "shipments" in inspector.get_table_names():
        shipment_indexes = {index["name"] for index in inspector.get_indexes("shipments")}
        if "ix_shipments_vehicle_id" in shipment_indexes:
            op.drop_index("ix_shipments_vehicle_id", table_name="shipments")
        if "ix_shipments_reference_number" in shipment_indexes:
            op.drop_index("ix_shipments_reference_number", table_name="shipments")
        op.drop_table("shipments")

    inspector = inspect(bind)
    vehicle_columns = {column["name"] for column in inspector.get_columns("vehicles")}
    if "is_active" in vehicle_columns:
        op.drop_column("vehicles", "is_active")
    if "status" in vehicle_columns:
        op.drop_column("vehicles", "status")
