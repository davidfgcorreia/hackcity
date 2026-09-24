"""Outside-station parking intervals from the provider event log (same rules as the ops detector).

An interval starts when a bike comes to rest (trip end, drop-off, entering the area, or a real
move > 10 m) and ends at the next non-rest event or real move. End reasons:
  new_trip            trip_start / reservation (a customer took it)
  provider_recovery   maintenance_pick_up / removed (the provider collected it)
  left_area / other   trip_leave_jurisdiction, decommissioned, ...
  moved               relocated > 10 m while at rest
  censored            still open when the data ends
`later_evidence`: a same-position observation more than 120 min after the start (the ops rule's
fresh evidence). `left_censored`: the first event seen for the bike was mid-rest.
"""
import math

import pandas as pd

from analytics.db import pg, release, replace_table, sql

REST = {"available", "non_operational"}
UNCERTAIN = {"non_contactable", "missing"}
REST_START = {"trip_end", "provider_drop_off", "trip_enter_jurisdiction", "reservation_cancel"}
END_REASON = {"trip_start": "new_trip", "reservation_start": "new_trip", "maintenance_pick_up": "provider_recovery",
              "trip_leave_jurisdiction": "left_area", "decommissioned": "provider_recovery"}
STATE_REASON = {"on_trip": "new_trip", "reserved": "new_trip", "removed": "provider_recovery", "elsewhere": "left_area"}


def _dist(a_lat, a_lon, b_lat, b_lon) -> float:
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 12_742_000 * math.asin(math.sqrt(h))


def intervals(ev: pd.DataFrame, data_end) -> list[dict]:
    out = []
    for device, g in ev.groupby("device_id", sort=False):
        cur, first = None, True

        def close(end_time, reason):
            minutes = (end_time - cur["start"]).total_seconds() / 60
            out.append({**cur, "end": end_time, "end_reason": reason, "minutes": minutes,
                        "later_evidence": cur["last_obs"] is not None
                        and (cur["last_obs"] - cur["start"]).total_seconds() / 60 > 120})

        for r in g.itertuples(index=False):
            if r.vehicle_state not in REST | UNCERTAIN:
                if cur:
                    close(r.event_time, END_REASON.get(r.event_type) or STATE_REASON.get(r.vehicle_state, "other"))
                cur, first = None, False
                continue
            if pd.isna(r.lat):
                continue
            moved = cur is not None and _dist(cur["lat"], cur["lon"], r.lat, r.lon) > 10
            if cur is None or r.event_type in REST_START or moved:
                if cur:
                    close(r.event_time, "moved" if moved else "restarted")
                cur = {"device_id": device, "start": r.event_time, "lat": r.lat, "lon": r.lon,
                       "start_event": r.event_type, "left_censored": first and r.event_type not in REST_START,
                       "uncertain": r.vehicle_state in UNCERTAIN, "observations": 0, "last_obs": None}
            else:
                cur["observations"] += 1
                cur["last_obs"] = r.event_time
                cur["uncertain"] = cur["uncertain"] or r.vehicle_state in UNCERTAIN
            first = False
        if cur:
            close(data_end, "censored")
    return out


def run(d) -> None:
    with pg() as c:
        ev = pd.read_sql("SELECT device_id, event_time, vehicle_state, event_type, lat, lon FROM bike.events "
                         "ORDER BY device_id, event_time, event_id", c)
    data_end = ev["event_time"].max()
    df = pd.DataFrame(intervals(ev, data_end))
    d.register("iv_df", df)
    n = replace_table(d, "derived.parking_intervals", """
        SELECT row_number() OVER () AS interval_id, device_id, start AS start_time, "end" AS end_time, lat, lon,
               start_event, end_reason, minutes, observations, last_obs, later_evidence, left_censored, uncertain
        FROM iv_df""")
    release(d)
    sql("""ALTER TABLE derived.parking_intervals
             ADD COLUMN pt_m geometry(Point, 3763), ADD COLUMN outside boolean, ADD COLUMN distance_outside_m double precision,
             ADD COLUMN cell_id text;
           UPDATE derived.parking_intervals SET pt_m = ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 3763);
           CREATE INDEX ON derived.parking_intervals USING gist (pt_m);
           UPDATE derived.parking_intervals p SET
             outside = NOT EXISTS (SELECT 1 FROM derived.stations_m s WHERE ST_DWithin(s.area_m, p.pt_m, 30)),
             distance_outside_m = (SELECT min(ST_Distance(s.parking_zone_m, p.pt_m)) FROM derived.stations_m s),
             cell_id = (SELECT g.cell_id FROM derived.grid_250 g WHERE ST_Intersects(g.geom_m, p.pt_m) LIMIT 1);""")
    print(f"  derived.parking_intervals        {n} intervals")
