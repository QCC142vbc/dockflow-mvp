from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models import ADRCatalogEntry, User
from app.schemas.adr_catalog import (
    ADRCatalogEntryResponse,
    ADRCatalogImportRequest,
    ADRCatalogImportResponse,
)

router = APIRouter()
catalog_manager = Depends(require_roles("ADMIN", "OPERATOR", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"))


@router.get("/", response_model=list[ADRCatalogEntryResponse])
def get_adr_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.scalars(select(ADRCatalogEntry).order_by(ADRCatalogEntry.un_number)).all()


@router.post("/import", response_model=ADRCatalogImportResponse)
def import_adr_catalog(
    catalog: ADRCatalogImportRequest,
    db: Session = Depends(get_db),
    current_user: User = catalog_manager,
):
    created = 0
    updated = 0

    for entry in catalog.entries:
        record = db.scalar(
            select(ADRCatalogEntry).where(ADRCatalogEntry.un_number == entry.un_number)
        )
        values = entry.model_dump()
        if record is None:
            db.add(ADRCatalogEntry(**values))
            created += 1
            continue

        for field, value in values.items():
            setattr(record, field, value)
        updated += 1

    db.commit()
    return ADRCatalogImportResponse(
        created=created,
        updated=updated,
        total=len(catalog.entries),
    )
