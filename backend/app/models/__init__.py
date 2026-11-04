import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, Float, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="OPERATOR")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    external_warehouse_id: Mapped[str | None] = mapped_column(
        String(36), unique=True, nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    timezone: Mapped[str] = mapped_column(String(100), default="Europe/Budapest", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )


class Dock(Base):
    __tablename__ = "docks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    external_dock_id: Mapped[str | None] = mapped_column(
        String(36), unique=True, nullable=True, index=True
    )
    warehouse_id: Mapped[str | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    dock_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="available", nullable=False
    )  # available, loading, unloading, cleaning, maintenance, delayed, called
    state: Mapped[str] = mapped_column(
        String(50), default="Available", nullable=False
    )
    direction: Mapped[str] = mapped_column(String(20), default="All", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    elapsed_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    capability_codes: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Carrier(Base):
    __tablename__ = "carriers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    external_carrier_id: Mapped[str | None] = mapped_column(
        String(36), unique=True, nullable=True, index=True
    )
    company_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    registration_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    plate: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    carrier_id: Mapped[str | None] = mapped_column(
        ForeignKey("carriers.id", ondelete="SET NULL"), nullable=True
    )
    carrier_name: Mapped[str] = mapped_column(String(200), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), default="Inbound", nullable=False)
    load_type: Mapped[str] = mapped_column(String(100), default="Standard Pallets", nullable=False)
    pallet_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    appointment_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    appointment_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(50), default="REGISTERED", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )


class ADRCatalogEntry(Base):
    __tablename__ = "adr_catalog"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    un_number: Mapped[str] = mapped_column(String(7), unique=True, nullable=False, index=True)
    product_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    proper_shipping_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hazard_class: Mapped[str] = mapped_column(String(20), nullable=False)
    classification_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    packing_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    label_codes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    special_provisions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    packing_instructions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    transport_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tunnel_restriction_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    limited_quantity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    excepted_quantity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    regulatory_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(300), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    reference_version: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    reference_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    vehicle_id: Mapped[str | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cargo_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    adr_catalog_id: Mapped[str | None] = mapped_column(
        ForeignKey("adr_catalog.id", ondelete="SET NULL"), nullable=True, index=True
    )
    adr_un_number: Mapped[str | None] = mapped_column(String(7), nullable=True)
    adr_proper_shipping_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adr_hazard_class: Mapped[str | None] = mapped_column(String(20), nullable=True)
    adr_packing_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    adr_regulatory_details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    origin: Mapped[str | None] = mapped_column(String(200), nullable=True)
    destination: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="REGISTERED", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class QueueEntry(Base):
    __tablename__ = "queue_entries"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    vehicle_id: Mapped[str] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    priority: Mapped[str] = mapped_column(
        String(50), default="Standard", nullable=False
    )  # Priority, Delayed, Documentation check, Standard
    arrival_time: Mapped[str] = mapped_column(String(50), nullable=False)
    estimated_call_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="WAITING", nullable=False
    )  # WAITING, CALLED, ASSIGNED, COMPLETED, CANCELLED


class Operation(Base):
    __tablename__ = "operations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    appointment_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    vehicle_id: Mapped[str | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    shipment_id: Mapped[str | None] = mapped_column(
        ForeignKey(
            "shipments.id",
            name="fk_operations_shipment_id",
            ondelete="RESTRICT",
        ),
        nullable=True,
        index=True,
    )
    dock_id: Mapped[str | None] = mapped_column(
        ForeignKey("docks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    operation_type: Mapped[str] = mapped_column(
        String(50), default="LOADING", nullable=False
    )  # LOADING, UNLOADING
    status: Mapped[str] = mapped_column(
        String(50), default="PENDING", nullable=False
    )  # PENDING, IN_PROGRESS, COMPLETED, CANCELLED
    actual_start_time: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    actual_end_time: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )


class EventOutbox(Base):
    __tablename__ = "event_outbox"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    event_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    event_version: Mapped[str] = mapped_column(String(20), default="1.0", nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="PENDING", nullable=False, index=True
    )  # PENDING, PUBLISHED, FAILED
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class EventTracking(Base):
    __tablename__ = "event_tracking"

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    processed_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    processing_result: Mapped[str] = mapped_column(String(20), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
