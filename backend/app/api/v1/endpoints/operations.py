from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models import Dock, Operation, Shipment, User, Vehicle
from app.schemas import OperationCreate, OperationResponse, OperationUpdate

router = APIRouter()
operator = Depends(require_roles("ADMIN", "OPERATOR", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"))


@router.get("/", response_model=list[OperationResponse])
def get_operations(
    operation_status: str | None = Query(default=None, max_length=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = select(Operation).order_by(Operation.created_at.desc())
    if operation_status:
        statement = statement.where(Operation.status == operation_status)
    return db.scalars(statement).all()


@router.post("/", response_model=OperationResponse, status_code=status.HTTP_201_CREATED)
def start_operation(
    op_data: OperationCreate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    if op_data.vehicle_id:
        vehicle = db.get(Vehicle, op_data.vehicle_id)
        if vehicle is None or not vehicle.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select an active registered vehicle.")
    if op_data.shipment_id:
        shipment = db.get(Shipment, op_data.shipment_id)
        if shipment is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The selected shipment does not exist.")
        if shipment.vehicle_id and op_data.vehicle_id != shipment.vehicle_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The selected shipment is assigned to a different vehicle.")
    if op_data.dock_id:
        dock = db.get(Dock, op_data.dock_id)
        if dock is None or not dock.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select an active dock.")
        if dock.status != "available":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The selected dock is not available for assignment.")
        if db.scalar(
            select(Operation.id).where(
                Operation.dock_id == op_data.dock_id,
                Operation.status.in_(("PENDING", "IN_PROGRESS")),
            )
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The selected dock already has an active operation.")
    if op_data.vehicle_id and db.scalar(
        select(Operation.id).where(
            Operation.vehicle_id == op_data.vehicle_id,
            Operation.status.in_(("PENDING", "IN_PROGRESS")),
        )
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The selected vehicle already has an active operation.")
    if op_data.status == "IN_PROGRESS" and op_data.actual_start_time is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter the actual start time before marking an operation in progress.")
    if op_data.status == "COMPLETED" and op_data.actual_end_time is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter the actual end time before completing an operation.")
    operation = Operation(**op_data.model_dump())
    db.add(operation)
    db.commit()
    db.refresh(operation)
    return operation


@router.patch("/{operation_id}", response_model=OperationResponse)
def update_operation(
    operation_id: str,
    op_data: OperationUpdate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    operation = db.get(Operation, operation_id)
    if not operation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation not found")

    update_dict = op_data.model_dump(exclude_unset=True)
    status_transitions = {
        "PENDING": {"IN_PROGRESS", "CANCELLED"},
        "IN_PROGRESS": {"COMPLETED", "CANCELLED"},
        "COMPLETED": set(),
        "CANCELLED": set(),
    }
    if op_data.status and op_data.status != operation.status and op_data.status not in status_transitions[operation.status]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This operation status transition is not allowed.")
    vehicle_id = update_dict.get("vehicle_id", operation.vehicle_id)
    shipment_id = update_dict.get("shipment_id", operation.shipment_id)
    dock_id = update_dict.get("dock_id", operation.dock_id)
    next_status = update_dict.get("status", operation.status)
    if vehicle_id:
        vehicle = db.get(Vehicle, vehicle_id)
        if vehicle is None or not vehicle.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select an active registered vehicle.")
        if next_status in {"PENDING", "IN_PROGRESS"} and db.scalar(
            select(Operation.id).where(
                Operation.vehicle_id == vehicle_id,
                Operation.status.in_(("PENDING", "IN_PROGRESS")),
                Operation.id != operation_id,
            )
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The selected vehicle already has an active operation.")
    if shipment_id:
        shipment = db.get(Shipment, shipment_id)
        if shipment is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The selected shipment does not exist.")
        if shipment.vehicle_id and vehicle_id != shipment.vehicle_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The selected shipment is assigned to a different vehicle.")
    if dock_id:
        dock = db.get(Dock, dock_id)
        if dock is None or not dock.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select an active dock.")
        if dock_id != operation.dock_id and dock.status != "available":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The selected dock is not available for assignment.")
        if next_status in {"PENDING", "IN_PROGRESS"} and db.scalar(
            select(Operation.id).where(
                Operation.dock_id == dock_id,
                Operation.status.in_(("PENDING", "IN_PROGRESS")),
                Operation.id != operation_id,
            )
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The selected dock already has an active operation.")
    start_time = update_dict.get("actual_start_time", operation.actual_start_time)
    end_time = update_dict.get("actual_end_time", operation.actual_end_time)
    if end_time and not start_time:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter the actual start time before the end time.")
    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Operation end time must not precede its start time.")
    if op_data.status == "IN_PROGRESS" and not start_time:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter the actual start time before marking an operation in progress.")
    if op_data.status == "COMPLETED" and not end_time:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter the actual end time before completing an operation.")
    for field, value in update_dict.items():
        setattr(operation, field, value)

    if op_data.status == "COMPLETED":
        operation.progress = 100

    db.commit()
    db.refresh(operation)
    return operation


@router.delete("/{operation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operation(
    operation_id: str,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    operation = db.get(Operation, operation_id)
    if operation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation not found.")
    if operation.status != "PENDING" or operation.actual_start_time or operation.actual_end_time:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Started or completed operations are retained as operational history.")
    db.delete(operation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
