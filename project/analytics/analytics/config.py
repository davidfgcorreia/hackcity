"""Analytics configuration: database, input paths and the Cascais study-area filter."""
import os
from pathlib import Path

PG_URL = os.environ.get("ANALYTICS_DATABASE_URL", "postgresql://analytics:analytics@analytics-db:5432/analytics")
DATA = Path(os.environ.get("ANALYTICS_DATA_DIR", "/data"))
FINAL = DATA / "finalset" / "extracted"
CACHE = Path(os.environ.get("ANALYTICS_CACHE_DIR", "/cache"))  # downloaded external sources

# Study-area envelope: 157 bike stations + 421 stops.csv stops with municipality "Cascais"
# span lat 38.680–38.765, lon -9.486 – -9.313; a ~1.5 km margin keeps border catchments.
# Used for coordinate filters (vehicle positions, GTFS stops). Validations use the stricter
# municipality_name = 'Cascais' stop list, because this box also covers parts of Oeiras/Sintra.
BBOX = dict(lat_min=38.665, lat_max=38.780, lon_min=-9.500, lon_max=-9.295)
SAMPLE_WEEK = (20260831, 20260906)          # 2026 transit sample (validations, vehicles, bus ops)
BIKE_PERIOD = ("2026-08-18", "2026-09-08")   # bicycle trips/events
LOCAL_TZ = "Europe/Lisbon"

# APEX 2025 carries a linkable card number: store only a salted hash (requirements: restricted use)
CARD_SALT = os.environ.get("ANALYTICS_CARD_SALT", "hackcity-2026")

TML_PLANS_URL = "https://go.tmlmobilidade.pt/hub/api/v1/plans"
OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"
WEATHER_POINT = (38.70, -9.42)  # central Cascais; ERA5 snaps to its nearest grid point


def bbox_sql(lat: str, lon: str) -> str:
    b = BBOX
    return (f"{lat} BETWEEN {b['lat_min']} AND {b['lat_max']} "
            f"AND {lon} BETWEEN {b['lon_min']} AND {b['lon_max']}")
