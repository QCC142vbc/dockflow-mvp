import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_service_auth
from app.models import Carrier, Dock, EventOutbox, Vehicle, Warehouse
from app.schemas import (
    SyncAppointmentPayload,
    SyncCarrierPayload,
    SyncDockPayload,
    SyncWarehousePayload,
)

router = APIRouter(dependencies=[Depends(require_service_auth)])


@router.post("/sync/warehouse", status_code=status.HTTP_201_CREATED)
def sync_warehouse(payload: SyncWarehousePayload, db: Session = Depends(get_db)):
    wh = db.scalar(
        select(Warehouse).where(
            Warehouse.external_warehouse_id == payload.external_warehouse_id
        )
    )
    if not wh:
        wh = Warehouse(
            external_warehouse_id=payload.external_warehouse_id,
            name=payload.name,
            code=payload.code,
            timezone=payload.timezone,
            is_active=payload.is_active,
        )
        db.add(wh)
    else:
        wh.name = payload.name
        wh.code = payload.code
        wh.timezone = payload.timezone
        wh.is_active = payload.is_active

    db.commit()
    db.refresh(wh)
    return {
        "data": {
            "warehouse_id": wh.id,
            "external_warehouse_id": wh.external_warehouse_id,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "sync_version": payload.sync_version,
        }
    }


@router.post("/sync/dock", status_code=status.HTTP_201_CREATED)
def sync_dock(payload: SyncDockPayload, db: Session = Depends(get_db)):
    dock = db.scalar(
        select(Dock).where(Dock.external_dock_id == payload.external_dock_id)
    )
    wh = None
    if payload.external_warehouse_id:
        wh = db.scalar(
            select(Warehouse).where(
                Warehouse.external_warehouse_id == payload.external_warehouse_id
            )
        )

    if not dock:
        dock = Dock(
            external_dock_id=payload.external_dock_id,
            warehouse_id=wh.id if wh else None,
            dock_code=payload.dock_code,
            name=payload.name,
            capability_codes=payload.capability_codes,
            is_active=payload.is_active,
        )
        db.add(dock)
    else:
        dock.dock_code = payload.dock_code
        dock.name = payload.name
        dock.capability_codes = payload.capability_codes
        dock.is_active = payload.is_active
        if wh:
            dock.warehouse_id = wh.id

    db.commit()
    db.refresh(dock)
    return {
        "data": {
            "dock_id": dock.id,
            "external_dock_id": dock.external_dock_id,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "sync_version": payload.sync_version,
        }
    }


@router.post("/sync/carrier", status_code=status.HTTP_201_CREATED)
def sync_carrier(payload: SyncCarrierPayload, db: Session = Depends(get_db)):
    carrier = db.scalar(
        select(Carrier).where(
            Carrier.external_carrier_id == payload.external_carrier_id
        )
    )
    if not carrier:
        carrier = Carrier(
            external_carrier_id=payload.external_carrier_id,
            company_name=payload.company_name,
            registration_number=payload.registration_number,
            contact_email=payload.contact_email,
            is_active=payload.is_active,
        )
        db.add(carrier)
    else:
        carrier.company_name = payload.company_name
        carrier.registration_number = payload.registration_number
        carrier.contact_email = payload.contact_email
        carrier.is_active = payload.is_active

    db.commit()
    db.refresh(carrier)
    return {
        "data": {
            "carrier_id": carrier.id,
            "external_carrier_id": carrier.external_carrier_id,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "sync_version": payload.sync_version,
        }
    }


@router.post("/sync/appointment", status_code=status.HTTP_201_CREATED)
def sync_appointment(payload: SyncAppointmentPayload, db: Session = Depends(get_db)):
    vehicle = db.scalar(
        select(Vehicle).where(Vehicle.appointment_id == payload.appointment_id)
    )
    carrier = None
    if payload.external_carrier_id:
        carrier = db.scalar(
            select(Carrier).where(
                Carrier.external_carrier_id == payload.external_carrier_id
            )
        )

    carrier_name = carrier.company_name if carrier else payload.carrier_name
    if not carrier_name:
        raise HTTPException(
            status_code=422,
            detail="Appointment sync requires the user-entered carrier name or a synchronized carrier reference.",
        )

    if not vehicle:
        vehicle = Vehicle(
            plate=payload.vehicle_registration,
            carrier_id=carrier.id if carrier else None,
            carrier_name=carrier_name,
            direction="Inbound",
            load_type=payload.cargo_type,
            appointment_time=payload.scheduled_start,
            appointment_id=payload.appointment_id,
        )
        db.add(vehicle)
    else:
        vehicle.plate = payload.vehicle_registration
        vehicle.load_type = payload.cargo_type
        vehicle.appointment_time = payload.scheduled_start
        if carrier:
            vehicle.carrier_id = carrier.id
            vehicle.carrier_name = carrier.company_name

    db.commit()
    db.refresh(vehicle)
    return {
        "data": {
            "appointment_id": payload.appointment_id,
            "vehicle_id": vehicle.id,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "sync_version": payload.sync_version,
        }
    }
