from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "OPERATOR"


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class DockBase(BaseModel):
    dock_code: str
    name: str
    status: Literal["available", "called", "loading", "unloading", "cleaning", "maintenance", "delayed"] = "available"
    state: Literal["Available", "Called", "Loading", "Unloading", "Cleaning", "Maintenance", "Delayed"] = "Available"
    direction: Literal["All", "Inbound", "Outbound"] = "All"
    progress: int = Field(default=0, ge=0, le=100)
    elapsed_seconds: int = 0
    notes: str | None = None
    capability_codes: list[str] | None = None
    is_active: bool = True


class DockCreate(DockBase):
    external_dock_id: str | None = None
    warehouse_id: str | None = None


class DockUpdate(BaseModel):
    status: Literal["available", "called", "loading", "unloading", "cleaning", "maintenance", "delayed"] | None = None
    state: Literal["Available", "Called", "Loading", "Unloading", "Cleaning", "Maintenance", "Delayed"] | None = None
    direction: Literal["All", "Inbound", "Outbound"] | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    elapsed_seconds: int | None = None
    notes: str | None = None
    capability_codes: list[str] | None = None
    is_active: bool | None = None


class DockResponse(DockBase):
    id: str
    external_dock_id: str | None = None
    warehouse_id: str | None = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VehicleBase(BaseModel):
    plate: str = Field(min_length=2, max_length=50)
    carrier_name: str = Field(min_length=1, max_length=200)
    direction: Literal["Inbound", "Outbound"]
    load_type: str = Field(min_length=1, max_length=100)
    pallet_count: int = Field(default=0, ge=0)
    appointment_time: str | None = None
    appointment_id: str | None = None
    status: Literal["REGISTERED", "ARRIVED", "WAITING", "ASSIGNED", "LOADING", "UNLOADING", "COMPLETED", "CANCELLED"] = "REGISTERED"

    @field_validator("appointment_time")
    @classmethod
    def validate_appointment_time(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("Appointment time must be a valid ISO date and time.") from error
        return value


class VehicleCreate(VehicleBase):
    carrier_id: str | None = None


class VehicleUpdate(BaseModel):
    plate: str | None = Field(default=None, min_length=2, max_length=50)
    carrier_name: str | None = Field(default=None, min_length=1, max_length=200)
    carrier_id: str | None = None
    direction: Literal["Inbound", "Outbound"] | None = None
    load_type: str | None = Field(default=None, min_length=1, max_length=100)
    pallet_count: int | None = Field(default=None, ge=0)
    appointment_time: str | None = None
    status: Literal["REGISTERED", "ARRIVED", "WAITING", "ASSIGNED", "LOADING", "UNLOADING", "COMPLETED", "CANCELLED"] | None = None
    is_active: bool | None = None

    @field_validator("appointment_time")
    @classmethod
    def validate_appointment_time(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("Appointment time must be a valid ISO date and time.") from error
        return value


class VehicleResponse(VehicleBase):
    id: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DemoVehiclePresetResponse(BaseModel):
    created: int
    existing: int
    vehicles: list[VehicleResponse]


class ShipmentBase(BaseModel):
    reference_number: str = Field(min_length=1, max_length=100)
    vehicle_id: str | None = None
    cargo_type: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    adr_catalog_id: str | None = None
    adr_un_number: str | None = None
    adr_proper_shipping_name: str | None = None
    adr_hazard_class: str | None = None
    adr_packing_group: str | None = None
    adr_regulatory_details: dict | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    quantity: int | None = Field(default=None, gt=0)
    origin: str | None = Field(default=None, max_length=200)
    destination: str | None = Field(default=None, max_length=200)
    status: Literal["REGISTERED", "READY", "IN_TRANSIT", "LOADING", "UNLOADING", "COMPLETED", "DELAYED", "CANCELLED"] = "REGISTERED"


class ShipmentCreate(ShipmentBase):
    pass


class ShipmentUpdate(BaseModel):
    reference_number: str | None = Field(default=None, min_length=1, max_length=100)
    vehicle_id: str | None = None
    cargo_type: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    adr_catalog_id: str | None = None
    adr_un_number: str | None = None
    adr_proper_shipping_name: str | None = None
    adr_hazard_class: str | None = None
    adr_packing_group: str | None = None
    adr_regulatory_details: dict | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    quantity: int | None = Field(default=None, gt=0)
    origin: str | None = Field(default=None, max_length=200)
    destination: str | None = Field(default=None, max_length=200)
    status: Literal["REGISTERED", "READY", "IN_TRANSIT", "LOADING", "UNLOADING", "COMPLETED", "DELAYED", "CANCELLED"] | None = None


class ShipmentResponse(ShipmentBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QueueEntryBase(BaseModel):
    vehicle_id: str
    position: int = Field(ge=1)
    priority: Literal["Priority", "Delayed", "Documentation check", "Standard"] = "Standard"
    arrival_time: str = Field(min_length=1, max_length=50)
    estimated_call_time: str | None = None
    status: Literal["WAITING", "CALLED", "ASSIGNED", "COMPLETED", "CANCELLED", "ON_HOLD"] = "WAITING"

    @field_validator("arrival_time", "estimated_call_time")
    @classmethod
    def validate_queue_time(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("Queue time must be a valid ISO date and time.") from error
        return value


class QueueEntryCreate(QueueEntryBase):
    pass


class QueueEntryUpdate(BaseModel):
    vehicle_id: str | None = None
    position: int | None = Field(default=None, ge=1)
    priority: Literal["Priority", "Delayed", "Documentation check", "Standard"] | None = None
    arrival_time: str | None = Field(default=None, min_length=1, max_length=50)
    estimated_call_time: str | None = None
    status: Literal["WAITING", "CALLED", "ASSIGNED", "COMPLETED", "CANCELLED", "ON_HOLD"] | None = None

    @field_validator("arrival_time", "estimated_call_time")
    @classmethod
    def validate_queue_time(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("Queue time must be a valid ISO date and time.") from error
        return value


class QueueEntryResponse(QueueEntryBase):
    id: str
    vehicle: VehicleResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class OperationBase(BaseModel):
    appointment_id: str | None = None
    vehicle_id: str | None = None
    shipment_id: str | None = None
    dock_id: str | None = None
    operation_type: Literal["LOADING", "UNLOADING"]
    status: Literal["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] = "PENDING"
    progress: int = Field(default=0, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=2000)


class OperationCreate(OperationBase):
    actual_start_time: datetime | None = None
    actual_end_time: datetime | None = None

    @model_validator(mode="after")
    def validate_times(self):
        if self.actual_end_time and not self.actual_start_time:
            raise ValueError("An end time requires a start time.")
        if self.actual_start_time and self.actual_end_time and self.actual_end_time < self.actual_start_time:
            raise ValueError("Operation end time must not precede its start time.")
        return self


class OperationUpdate(BaseModel):
    vehicle_id: str | None = None
    shipment_id: str | None = None
    dock_id: str | None = None
    operation_type: Literal["LOADING", "UNLOADING"] | None = None
    status: Literal["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=2000)
    actual_start_time: datetime | None = None
    actual_end_time: datetime | None = None

    @model_validator(mode="after")
    def validate_times(self):
        if self.actual_start_time and self.actual_end_time and self.actual_end_time < self.actual_start_time:
            raise ValueError("Operation end time must not precede its start time.")
        return self


class OperationResponse(OperationBase):
    id: str
    actual_start_time: datetime | None = None
    actual_end_time: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SyncWarehousePayload(BaseModel):
    external_warehouse_id: str
    name: str
    code: str
    timezone: str = "Europe/Budapest"
    is_active: bool = True
    sync_version: int = 1


class SyncDockPayload(BaseModel):
    external_dock_id: str
    external_warehouse_id: str | None = None
    dock_code: str
    name: str
    capability_codes: list[str] = []
    is_active: bool = True
    sync_version: int = 1


class SyncCarrierPayload(BaseModel):
    external_carrier_id: str
    company_name: str
    registration_number: str
    contact_email: str | None = None
    is_active: bool = True
    sync_version: int = 1


class SyncAppointmentPayload(BaseModel):
    appointment_id: str
    reference_number: str
    external_carrier_id: str | None = None
    external_warehouse_id: str | None = None
    external_dock_id: str | None = None
    carrier_name: str | None = Field(default=None, min_length=1, max_length=200)
    scheduled_start: str
    scheduled_end: str
    status: str
    vehicle_registration: str
    vehicle_type: str = Field(min_length=2, max_length=50)
    cargo_type: str = Field(min_length=2, max_length=100)
    cargo_weight_kg: float | None = None
    sync_version: int = 1
