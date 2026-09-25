from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Station, StationTarget
from app.schemas import StationOut

router = APIRouter(tags=["stations"])

# A peak observed over fewer local days is dominated by whatever the station held when polling
# started, so it would report almost every station as full. Below this, no benchmark is given.
MIN_BENCHMARK_DAYS = 7


@router.get("/stations", response_model=list[StationOut])
def list_stations(db: Session = Depends(get_db)):
    return db.scalars(select(Station)).all()


class TargetIn(BaseModel):
    bikes: int = Field(ge=1, le=1000)


@router.get("/stations/balance")
def station_balance(db: Session = Depends(get_db)):
    return [dict(row) for row in db.execute(text("""
        WITH latest AS (
          SELECT DISTINCT ON (station_id) station_id,bikes_available,reported_at,collected_at
          FROM station_status_snapshots ORDER BY station_id,collected_at DESC,id DESC
        ), peaks AS (
          SELECT station_id,max(bikes_available) observed_peak,
                 count(DISTINCT collected_at::date) observed_days
          FROM station_status_snapshots WHERE collected_at >= now()-interval '30 days'
            AND reported_at BETWEEN collected_at-interval '10 minutes' AND collected_at+interval '2 minutes'
          GROUP BY station_id
        ), benchmarks AS (
          SELECT s.id station_id,t.bikes operator_target,t.updated_at target_updated_at,
            coalesce(t.bikes,CASE WHEN p.observed_days>=:min_days THEN p.observed_peak END) benchmark,
            CASE WHEN t.bikes IS NOT NULL THEN 'operator_target'
                 WHEN p.observed_days>=:min_days THEN 'observed_peak'
                 ELSE 'insufficient_history' END benchmark_status
          FROM stations s LEFT JOIN peaks p ON p.station_id=s.id LEFT JOIN station_targets t ON t.station_id=s.id
        )
        SELECT s.id station_id,s.name,l.bikes_available,l.reported_at,l.collected_at,
          p.observed_peak,p.observed_days,b.operator_target,b.target_updated_at,
          b.benchmark,b.benchmark_status,:min_days min_benchmark_days,
          CASE WHEN b.benchmark>0 AND l.collected_at>=now()-interval '10 minutes'
            AND l.reported_at BETWEEN now()-interval '10 minutes' AND now()+interval '2 minutes'
            THEN round(l.bikes_available::numeric/b.benchmark,3) END occupancy_ratio
        FROM stations s LEFT JOIN latest l ON l.station_id=s.id
        LEFT JOIN peaks p ON p.station_id=s.id JOIN benchmarks b ON b.station_id=s.id
    """), {"min_days": MIN_BENCHMARK_DAYS}).mappings()]


@router.get("/stations/{station_id}/balance-history")
def station_balance_history(station_id: str, db: Session = Depends(get_db)):
    if db.get(Station, station_id) is None:
        raise HTTPException(404, "station not found")
    return {"days": [dict(row) for row in db.execute(text("""
        SELECT (collected_at AT TIME ZONE 'Europe/Lisbon')::date day_local,
          count(*) samples, round(avg(bikes_available)::numeric,1) average_bikes,
          max(bikes_available) peak_bikes
        FROM station_status_snapshots WHERE station_id=:station_id
          AND collected_at>=now()-interval '30 days'
          AND reported_at BETWEEN collected_at-interval '10 minutes' AND collected_at+interval '2 minutes'
        GROUP BY 1 ORDER BY 1
    """), {"station_id": station_id}).mappings()],
      "source": "prospective GBFS station_status snapshots"}


@router.put("/stations/{station_id}/target")
def set_station_target(station_id: str, body: TargetIn, db: Session = Depends(get_db)):
    if db.get(Station, station_id) is None:
        raise HTTPException(404, "station not found")
    target = db.get(StationTarget, station_id)
    if target is None:
        target = StationTarget(station_id=station_id, bikes=body.bikes, updated_at=datetime.now(timezone.utc))
        db.add(target)
    else:
        target.bikes = body.bikes
        target.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"station_id": station_id, "bikes": target.bikes, "updated_at": target.updated_at}
