from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models import Carrier, Operation, QueueEntry, User, Vehicle
from app.schemas import DemoVehiclePresetResponse, QueueEntryCreate, QueueEntryResponse, QueueEntryUpdate, VehicleCreate, VehicleResponse, VehicleUpdate

router = APIRouter()
operator = Depends(require_roles("ADMIN", "OPERATOR", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"))


@router.get("/vehicles", response_model=list[VehicleResponse])
def get_vehicles(
    search: str | None = Query(default=None, max_length=100),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = select(Vehicle).order_by(Vehicle.created_at.desc())
    if not include_inactive:
        statement = statement.where(Vehicle.is_active.is_(True))
    if search:
        statement = statement.where(Vehicle.plate.ilike(f"%{search.strip()}%"))
    return db.scalars(statement).all()


@router.post("/vehicles", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    vehicle_data: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    if db.scalar(select(Vehicle.id).where(Vehicle.plate == vehicle_data.plate)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A vehicle with this plate is already registered.")
    if vehicle_data.carrier_id and db.get(Carrier, vehicle_data.carrier_id) is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The selected carrier does not exist.")
    vehicle = Vehicle(**vehicle_data.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.post("/vehicles/demo-presets", response_model=DemoVehiclePresetResponse)
def add_demo_vehicle_presets(
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    presets = [
        ("DEMO-TRUCK-01", "DEMO Carrier A", "Inbound", "Curtainsider trailer", 33),
        ("DEMO-TRUCK-02", "DEMO Carrier B", "Outbound", "Refrigerated trailer", 26),
        ("DEMO-TRUCK-03", "DEMO Carrier C", "Inbound", "Box truck", 18),
        ("DEMO-TRUCK-04", "DEMO Carrier D", "Outbound", "Flatbed trailer", 20),
        ("DEMO-TRUCK-05", "DEMO Carrier E", "Inbound", "Tanker trailer", 0),
    ]
    created = 0
    for plate, carrier_name, direction, load_type, pallet_count in presets:
        if db.scalar(select(Vehicle.id).where(Vehicle.plate == plate)):
            continue
        db.add(
            Vehicle(
                plate=plate,
                carrier_name=carrier_name,
                direction=direction,
                load_type=load_type,
                pallet_count=pallet_count,
                status="REGISTERED",
            )
        )
        created += 1
    db.commit()
    vehicles = db.scalars(
        select(Vehicle).where(Vehicle.plate.in_([preset[0] for preset in presets])).order_by(Vehicle.plate)
    ).all()
    return {"created": created, "existing": len(presets) - created, "vehicles": vehicles}


@router.patch("/vehicles/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: str,
    vehicle_data: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    updates = vehicle_data.model_dump(exclude_unset=True)
    if updates.get("plate") and db.scalar(
        select(Vehicle.id).where(Vehicle.plate == updates["plate"], Vehicle.id != vehicle_id)
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A vehicle with this plate is already registered.")
    if updates.get("carrier_id"):
        if db.get(Carrier, updates["carrier_id"]) is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The selected carrier does not exist.")
    for field, value in updates.items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.delete("/vehicles/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: str,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    vehicle.is_active = False
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/queue", response_model=list[QueueEntryResponse])
def get_queue(
    search: str | None = Query(default=None, max_length=100),
    entry_status: str | None = Query(default=None, max_length=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = select(QueueEntry).join(Vehicle).order_by(QueueEntry.position)
    if search:
        statement = statement.where(Vehicle.plate.ilike(f"%{search.strip()}%"))
    if entry_status:
        statement = statement.where(QueueEntry.status == entry_status)
    return db.scalars(statement).all()


@router.post("/queue", response_model=QueueEntryResponse, status_code=status.HTTP_201_CREATED)
def add_to_queue(
    entry_data: QueueEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    vehicle = db.get(Vehicle, entry_data.vehicle_id)
    if not vehicle or not vehicle.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active vehicle not found.")
    existing_entry = db.scalar(
        select(QueueEntry.id).where(
            QueueEntry.vehicle_id == vehicle.id,
            QueueEntry.status.in_(("WAITING", "CALLED", "ASSIGNED", "ON_HOLD")),
        )
    )
    if existing_entry:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This vehicle already has an active queue entry.")

    entry = QueueEntry(**entry_data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/queue/{entry_id}/status", response_model=QueueEntryResponse)
def update_queue_status(
    entry_id: str,
    status_value: Literal["WAITING", "CALLED", "ASSIGNED", "COMPLETED", "CANCELLED", "ON_HOLD"],
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    entry = db.get(QueueEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue entry not found")

    entry.status = status_value
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/queue/{entry_id}", response_model=QueueEntryResponse)
def update_queue_entry(
    entry_id: str,
    entry_data: QueueEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    entry = db.get(QueueEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue entry not found.")
    updates = entry_data.model_dump(exclude_unset=True)
    if updates.get("vehicle_id"):
        vehicle = db.get(Vehicle, updates["vehicle_id"])
        if vehicle is None or not vehicle.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select an active registered vehicle.")
        if updates.get("status", entry.status) in {"WAITING", "CALLED", "ASSIGNED", "ON_HOLD"} and db.scalar(
            select(QueueEntry.id).where(
                QueueEntry.vehicle_id == updates["vehicle_id"],
                QueueEntry.status.in_(("WAITING", "CALLED", "ASSIGNED", "ON_HOLD")),
                QueueEntry.id != entry_id,
            )
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This vehicle already has an active queue entry.")
    for field, value in updates.items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/queue/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_queue_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    entry = db.get(QueueEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue entry not found.")
    if entry.status == "ASSIGNED" and db.scalar(
        select(Operation.id).where(
            Operation.vehicle_id == entry.vehicle_id,
            Operation.status.in_(("PENDING", "IN_PROGRESS")),
        )
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A vehicle with an active dock operation cannot be removed from its queue.")
    db.delete(entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
