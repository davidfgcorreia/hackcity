"""Single source of configuration. Challenge thresholds live here and nowhere else."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://hackcity:hackcity@db:5432/hackcity"
    data_dir: str = "/data"
    uploads_dir: str = "/uploads"

    # Detection rule (operations_requirements.md §4)
    abandon_minutes: int = 120          # strictly more than this qualifies
    enforce_window: bool = True         # ENFORCE_WINDOW=false: the clock runs 24 h (`make enforce-window-off`)
    enforce_from_hour: int = 8          # the 120-minute clock only runs 08:00–20:00 local time
    enforce_until_hour: int = 20
    enforce_tz: str = "Europe/Lisbon"
    buffer_m: float = 30.0              # buffer around the station *area*, not the centre
    metric_crs: str = "EPSG:3763"       # ETRS89 / PT-TM06, all metre maths
    move_tolerance_m: float = 10.0      # GPS noise below this is not a move
    default_location_error_m: float = 0.0   # TO CONFIRM
    fresh_max_age_min: int = 60              # TO CONFIRM
    require_fresh_observation: bool = True          # live detection: the real rule
    replay_require_fresh_observation: bool = False  # demo: history rarely has a 2nd sighting
    source_tz: str = "UTC"                   # TO VERIFY (T-B1)

    # Routing (§6) — Complexo Multisserviços, Estrada de Manique 1830, Alcabideche (source: CMC)
    depot_lat: float = 38.736686
    depot_lng: float = -9.386868
    van_capacity: int = 6        # TO CONFIRM
    detour_factor: float = 1.3
    routing_engine: str = "osrm"             # "osrm" | "straight-line"
    osrm_url: str = "http://osrm:5000"       # OpenStreetMap road graph, built with `make osrm`

    replay_speed: float = 360.0

    # Live provider feed (GBFS 2.3, Bird Cascais). Index is the provider-supplied gbfs.json.
    live_enabled: bool = True
    gbfs_index_file: str = "/data/gbfs.json"
    gbfs_poll_s: int = 60                      # feed ttl
    gbfs_form_factors: str = "bicycle"         # comma list; "bicycle,scooter" for both
    gbfs_gone_grace_s: int = 180               # missing this long = trip started / picked up
    gbfs_stale_report_min: int = 30            # older last_reported -> position uncertain
    gbfs_station_refresh_min: int = 30


settings = Settings()
