"""DB fixtures use a separate `hackcity_test` database; pure-core tests don't need them."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401
from app.config import settings
from app.db import Base
from app.services import clock

TEST_URL = settings.database_url.rsplit("/", 1)[0] + "/hackcity_test"
T0 = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="session")
def engine():
    admin = create_engine(settings.database_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        if not c.scalar(text("select 1 from pg_database where datname = 'hackcity_test'")):
            c.execute(text("create database hackcity_test"))
    admin.dispose()
    eng = create_engine(TEST_URL)
    yield eng
    eng.dispose()


@pytest.fixture(autouse=True)
def no_real_osrm(monkeypatch):
    """Tests never call the running OSRM container; routing tests mock it explicitly."""
    from app.services import road

    monkeypatch.setattr(road.settings, "routing_engine", "straight-line")


@pytest.fixture
def session_factory(engine):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    clock.set_sim_time(T0)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    clock.set_sim_time(None)


@pytest.fixture
def db(session_factory):
    with session_factory() as s:
        yield s
