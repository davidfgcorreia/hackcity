from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Hackathon: create_all instead of migrations (see docs/adr/0001-stack.md).
    from app import models  # noqa: F401

    Base.metadata.create_all(engine)
    # columns added after the first deploy (create_all does not alter existing tables)
    with engine.begin() as c:
        c.execute(text("ALTER TABLE vehicle_events ADD COLUMN IF NOT EXISTS source varchar NOT NULL DEFAULT 'history'"))
        c.execute(text("ALTER TABLE vehicle_events ADD COLUMN IF NOT EXISTS vehicle_type_id varchar"))
        c.execute(text("ALTER TABLE vehicle_events ADD COLUMN IF NOT EXISTS source_observed_at timestamptz"))
        c.execute(text("ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_observed_at timestamptz"))
        for col, typ in (("route_geojson", "json"), ("route_waypoints", "json"), ("route_legs", "json"), ("duration_s", "double precision"),
                         ("distance_m", "double precision"), ("routing_engine", "varchar")):
            c.execute(text(f"ALTER TABLE missions ADD COLUMN IF NOT EXISTS {col} {typ}"))
        c.execute(text("ALTER TABLE stops ADD COLUMN IF NOT EXISTS eta_s double precision"))
