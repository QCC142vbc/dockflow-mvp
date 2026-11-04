from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models import User, Warehouse

router = APIRouter()


@router.get("/")
def get_warehouses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.scalars(select(Warehouse).where(Warehouse.is_active.is_(True)).order_by(Warehouse.name)).all()
