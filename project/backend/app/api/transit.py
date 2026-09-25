from fastapi import APIRouter

from app.services import transit

router = APIRouter(tags=["transit"])


@router.get("/transit/vehicles")
def vehicles():
    return transit.vehicles()


@router.get("/transit/arrivals/{stop_id}")
def arrivals(stop_id: str):
    return transit.arrivals(stop_id)
