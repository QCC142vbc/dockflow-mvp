from fastapi import APIRouter

from app.api.v1.endpoints import auth, docks, integration, operations, queue, shipments, warehouses

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(docks.router, prefix="/docks", tags=["Docks"])
api_router.include_router(queue.router, prefix="/dispatch", tags=["Dispatch & Queue"])
api_router.include_router(shipments.router, prefix="/shipments", tags=["Shipments"])
api_router.include_router(operations.router, prefix="/operations", tags=["Operations"])
api_router.include_router(warehouses.router, prefix="/warehouses", tags=["Warehouses"])
api_router.include_router(integration.router, prefix="/integration", tags=["Cross-Service Integration"])
