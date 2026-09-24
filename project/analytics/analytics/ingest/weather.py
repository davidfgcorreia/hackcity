"""Hourly ERA5 reanalysis (via Open-Meteo archive) for the bicycle period. Grid estimates, not sensors."""
from datetime import datetime, timezone

import httpx
import pandas as pd

from analytics.config import BIKE_PERIOD, OPEN_METEO_URL, WEATHER_POINT
from analytics.db import logged, replace_table


def run(d) -> None:
    params = {"latitude": WEATHER_POINT[0], "longitude": WEATHER_POINT[1], "start_date": BIKE_PERIOD[0],
              "end_date": BIKE_PERIOD[1], "timezone": "GMT", "models": "era5",
              "hourly": "temperature_2m,precipitation,rain,wind_speed_10m,wind_gusts_10m,cloud_cover"}
    with logged("weather", "weather.hourly", "ERA5 hourly, UTC", []) as log:
        r = httpx.get(OPEN_METEO_URL, params=params, timeout=60)
        r.raise_for_status()
        j = r.json()
        df = pd.DataFrame(j["hourly"])
        df["time"] = pd.to_datetime(df["time"]).dt.tz_localize("UTC")
        df["grid_lat"], df["grid_lon"] = j["latitude"], j["longitude"]
        d.register("w_df", df)
        log["rows_read"] = len(df)
        log["rows_kept"] = replace_table(d, "weather.hourly", "SELECT * FROM w_df")
        log["sources"] = [{"url": str(r.url), "retrieved_at": datetime.now(timezone.utc).isoformat(),
                           "grid_point": [j["latitude"], j["longitude"]], "model": "era5",
                           "license": "Open-Meteo free API: non-commercial use; ERA5 CC-BY"}]
