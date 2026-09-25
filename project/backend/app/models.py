"""Persistence model. Positions are WGS84 lat/lng floats; metre maths happens in app.core.geo.

Every case keeps an append-only timeline (CaseEvent) so corrections never erase evidence.
"""
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Station(Base):
    __tablename__ = "stations"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str]
    lat: Mapped[float]
    lng: Mapped[float]
    area: Mapped[dict] = mapped_column(JSON)  # GeoJSON MultiPolygon, [lon, lat]


class StationStatus(Base):
    __tablename__ = "station_status_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    station_id: Mapped[str] = mapped_column(String, index=True)
    bikes_available: Mapped[int]
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class StationTarget(Base):
    __tablename__ = "station_targets"
    station_id: Mapped[str] = mapped_column(String, primary_key=True)
    bikes: Mapped[int]
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class VehicleEvent(Base):
    """Provider event: supplied history (viagens.xlsx) or a live GBFS transition."""
    __tablename__ = "vehicle_events"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    source: Mapped[str] = mapped_column(String, default="history", server_default="history", index=True)  # history | gbfs
    vehicle_type_id: Mapped[str | None]
    device_id: Mapped[str] = mapped_column(String, index=True)
    state: Mapped[str]
    event_types: Mapped[list] = mapped_column(JSON)
    lat: Mapped[float | None]
    lng: Mapped[float | None]
    trip_id: Mapped[str | None]
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    battery: Mapped[float | None]  # fraction 0–1
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String, index=True)
    # candidate | uncertain | supported | eligible | assigned | picked_up | resolved
    status: Mapped[str] = mapped_column(String, index=True)
    source: Mapped[str] = mapped_column(String, default="live")  # live | replay | field | demo
    lat: Mapped[float]
    lng: Mapped[float]
    rest_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    distance_outside_m: Mapped[float | None]
    reason: Mapped[str] = mapped_column(Text, default="")
    field_confirmed: Mapped[bool] = mapped_column(default=False)
    needs_approval: Mapped[bool] = mapped_column(default=False)
    blocked_reason: Mapped[str | None]  # unsafe / inaccessible — excluded from routes
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    timeline: Mapped[list["CaseEvent"]] = relationship(order_by="CaseEvent.id", back_populates="case")


class CaseEvent(Base):
    """Append-only audit entry: status change, observation, correction, field outcome, export."""
    __tablename__ = "case_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), index=True)
    kind: Mapped[str]
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    actor: Mapped[str] = mapped_column(String, default="system")
    event_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # when it happened
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    case: Mapped[Case] = relationship(back_populates="timeline")


class Mission(Base):
    __tablename__ = "missions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, default="active")  # active | done
    capacity: Mapped[int]
    start_lat: Mapped[float]
    start_lng: Mapped[float]
    version: Mapped[int] = mapped_column(default=1)  # bumped on every replan; clients poll it
    last_change: Mapped[str | None] = mapped_column(Text)  # "what changed, why, new target"
    total_km: Mapped[float | None]
    # road route from the van's position through the planned stops to the depot (services/road.py)
    route_geojson: Mapped[dict | None] = mapped_column(JSON)
    route_waypoints: Mapped[list | None] = mapped_column(JSON)  # OSRM road points, start then each stop
    route_legs: Mapped[list | None] = mapped_column(JSON)   # per leg: distance, duration, turn-by-turn steps
    duration_s: Mapped[float | None]
    distance_m: Mapped[float | None]
    routing_engine: Mapped[str | None]  # osrm | straight-line
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    stops: Mapped[list["Stop"]] = relationship(order_by="Stop.seq", back_populates="mission")


class Stop(Base):
    __tablename__ = "stops"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id"), index=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"))  # None = depot
    seq: Mapped[int]
    kind: Mapped[str] = mapped_column(String, default="pickup")  # pickup | verify | depot
    status: Mapped[str] = mapped_column(String, default="planned")  # planned | done | removed
    lat: Mapped[float]
    lng: Mapped[float]
    eta_s: Mapped[float | None]  # driving seconds from the van's position when the route was planned
    outcome: Mapped[str | None]
    notes: Mapped[str | None] = mapped_column(Text)
    photo_path: Mapped[str | None]
    actual_lat: Mapped[float | None]
    actual_lng: Mapped[float | None]
    confirmed_device_id: Mapped[str | None]
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_uuid: Mapped[str | None] = mapped_column(String, unique=True)  # idempotent offline sync
    mission: Mapped[Mission] = relationship(back_populates="stops")
    case: Mapped[Case | None] = relationship()
