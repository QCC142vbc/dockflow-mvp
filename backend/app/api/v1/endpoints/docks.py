from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models import Dock, Operation, User
from app.schemas import DockResponse, DockUpdate

router = APIRouter()
operator = Depends(require_roles("ADMIN", "OPERATOR", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"))


@router.get("/", response_model=list[DockResponse])
def get_docks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.scalars(select(Dock).order_by(Dock.dock_code)).all()


@router.get("/{dock_id}", response_model=DockResponse)
def get_dock(
    dock_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dock = db.get(Dock, dock_id)
    if not dock:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dock not found")
    return dock


@router.patch("/{dock_id}", response_model=DockResponse)
def update_dock(
    dock_id: str,
    dock_data: DockUpdate,
    db: Session = Depends(get_db),
    current_user: User = operator,
):
    dock = db.get(Dock, dock_id)
    if not dock:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dock not found")

    update_dict = dock_data.model_dump(exclude_unset=True)
    if update_dict.get("status") == "available" and db.scalar(
        select(Operation.id).where(
            Operation.dock_id == dock_id,
            Operation.status.in_(("PENDING", "IN_PROGRESS")),
        )
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A dock with an active operation cannot be marked available.")
    for field, value in update_dict.items():
        setattr(dock, field, value)

    db.commit()
    db.refresh(dock)
    return dock
