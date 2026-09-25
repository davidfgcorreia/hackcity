"""Scripted presentation demo (`/field?sim`): five fixed abandoned bikes and a mission from the depot.

The bikes are real abandonment spots from the Bird sample (derived.bird_abandonments, 19 Aug–8 Sep 2026,
0.4–1.9 km from the Complexo Multisserviços). Their cases use source "demo" and the mission belongs to
operator "demo", so the demo never mixes with live or replay cases, routes or counts (missions._plan
scopes by source; the home, Bird and decision-map counts never include "demo").
"""
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Case, CaseEvent, Mission, Stop
from app.services import clock, missions

DEMO_OPERATOR = "demo"
DEMO_SOURCE = "demo"

# device_id, lat, lng, parked minutes, metres outside the station area + 30 m
DEMO_BIKES = (
    ("demo-01", 38.734963, -9.391322, 318, 412),
    ("demo-02", 38.729773, -9.383755, 353, 34),
    ("demo-03", 38.745277, -9.380466, 355, 94),
    ("demo-04", 38.735950, -9.364842, 460, 83),
    ("demo-05", 38.719914, -9.388165, 218, 475),
)


def reset_demo(db: Session) -> Mission:
    """Delete the previous demo (its missions, stops, cases and case events) and plan a fresh one from the depot."""
    mission_ids = select(Mission.id).where(Mission.operator_id == DEMO_OPERATOR)
    case_ids = select(Case.id).where(Case.source == DEMO_SOURCE)
    db.execute(delete(Stop).where(Stop.mission_id.in_(mission_ids) | Stop.case_id.in_(case_ids)))
    db.execute(delete(Mission).where(Mission.operator_id == DEMO_OPERATOR))
    db.execute(delete(CaseEvent).where(CaseEvent.case_id.in_(case_ids)))
    db.execute(delete(Case).where(Case.source == DEMO_SOURCE))
    now = clock.now()
    for device_id, lat, lng, minutes, outside in DEMO_BIKES:
        db.add(Case(device_id=device_id, status="eligible", source=DEMO_SOURCE, lat=lat, lng=lng,
                    distance_outside_m=outside, rest_since=now - timedelta(minutes=minutes), last_observed_at=now,
                    reason=f"{outside} m outside the station area + 30 m, parked {minutes} min (demo bike)"))
    db.commit()
    return missions.replan(db, DEMO_OPERATOR, settings.depot_lat, settings.depot_lng, "Demo mission: 5 bikes")
