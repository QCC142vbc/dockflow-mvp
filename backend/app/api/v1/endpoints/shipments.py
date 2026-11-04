from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models import Operation, Shipment, User, Vehicle
from app.schemas import ShipmentCreate, ShipmentResponse, ShipmentUpdate

router = APIRouter()
operator = Depends(require_roles("ADMIN", "OPERATOR", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"))


@router.get("/", response_model=list[ShipmentResponse])
def get_shipments(
    search: str | None = Query(default=None, max_length=100),
    shipment_status: str | None = Query(default=None, max_length=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = select(Shipment).order_by(Shipment.created_at.desc())
    if search:
        statement = statement.where(Shipment.reference_number.ilike(f"%{search.strip()}%"))
    if shipment_status:
        statement = statement.where(Shipment.status == shipment_status)
    return db.scalars(statement).all()


@router.post("/", response_model=ShipmentResponse, status_code=status.HTTP_201_CREATED)
def create_shipment(
    shipment_data: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    if db.scalar(select(Shipment.id).where(Shipment.reference_number == shipment_data.reference_number)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A shipment with this reference already exists.")
    if shipment_data.vehicle_id:
        vehicle = db.get(Vehicle, shipment_data.vehicle_id)
        if vehicle is None or not vehicle.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select an active registered vehicle.")
    shipment = Shipment(**shipment_data.model_dump())
    db.add(shipment)
    db.commit()
    db.refresh(shipment)
    return shipment


@router.patch("/{shipment_id}", response_model=ShipmentResponse)
def update_shipment(
    shipment_id: str,
    shipment_data: ShipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    shipment = db.get(Shipment, shipment_id)
    if shipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")
    updates = shipment_data.model_dump(exclude_unset=True)
    if updates.get("reference_number") and db.scalar(
        select(Shipment.id).where(
            Shipment.reference_number == updates["reference_number"],
            Shipment.id != shipment_id,
        )
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A shipment with this reference already exists.")
    if updates.get("vehicle_id"):
        vehicle = db.get(Vehicle, updates["vehicle_id"])
        if vehicle is None or not vehicle.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select an active registered vehicle.")
    for field, value in updates.items():
        setattr(shipment, field, value)
    db.commit()
    db.refresh(shipment)
    return shipment


@router.delete("/{shipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shipment(
    shipment_id: str,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    shipment = db.get(Shipment, shipment_id)
    if shipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found.")
    if db.scalar(select(Operation.id).where(Operation.shipment_id == shipment_id)):
        shipment.status = "CANCELLED"
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(shipment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
