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
