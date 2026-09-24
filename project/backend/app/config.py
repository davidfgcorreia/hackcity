"""Single source of configuration. Challenge thresholds live here and nowhere else."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://hackcity:hackcity@db:5432/hackcity"
    data_dir: str = "/data"
    uploads_dir: str = "/uploads"

    # Detection rule (operations_requirements.md §4)
    abandon_minutes: int = 120          # strictly more than this qualifies
    buffer_m: float = 30.0              # buffer around the station *area*, not the centre
    metric_crs: str = "EPSG:3763"       # ETRS89 / PT-TM06, all metre maths
    move_tolerance_m: float = 10.0      # GPS noise below this is not a move
    default_location_error_m: float = 0.0   # TO CONFIRM
    fresh_max_age_min: int = 60              # TO CONFIRM
    require_fresh_observation: bool = True
    source_tz: str = "UTC"                   # TO VERIFY (T-B1)

    # Routing (§6)
    depot_lat: float = 38.7223   # PLACEHOLDER
    depot_lng: float = -9.4205   # PLACEHOLDER
    van_capacity: int = 6        # TO CONFIRM
    detour_factor: float = 1.3

    replay_speed: float = 360.0


settings = Settings()
