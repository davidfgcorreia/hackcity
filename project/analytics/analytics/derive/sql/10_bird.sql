-- Bird (the operator) performance, reconstructed from its own event log (bike.events) and the
-- parking intervals of the Python step. Europe/Lisbon local time throughout.
--
--   derived.bird_legs            maintenance_pick_up -> next provider_drop_off of the same bike:
--                                in-place service (< 50 m) or relocation (>= 50 m), with station
--                                stock at both ends (bikes parked there, excluding the bike itself)
--   derived.station_stock_hourly bikes parked inside each station's parking zone at the top of every
--                                local hour from 25 Aug. Earlier days are a warm-up: bikes resting
--                                since before the extract only appear once they emit an event, and
--                                the parked fleet climbs from ~480 (20 Aug) to a stable ~810-860.
--   derived.station_empty_spells consecutive empty hours per station and who ended them
--   derived.bird_abandonments    outside intervals with > 120 counted minutes (the fineable status;
--                                the clock runs only 08:00-20:00 Lisbon) and their outcome
--
-- Stock counts every bike at rest in the zone, rentable or low-battery: intervals carry no state.
-- It is a reconstruction, not the provider's station_status history.

DROP TABLE IF EXISTS derived.parking_at_station CASCADE;
CREATE TABLE derived.parking_at_station AS
SELECT p.interval_id, p.device_id, p.start_time, p.end_time, p.start_event, p.end_reason, p.minutes, s.station_id
FROM derived.parking_intervals p
CROSS JOIN LATERAL (
  SELECT s.station_id FROM derived.stations_m s
  WHERE ST_DWithin(s.area_m, p.pt_m, 30) ORDER BY ST_Distance(s.area_m, p.pt_m) LIMIT 1) s
WHERE NOT p.outside;
CREATE INDEX ON derived.parking_at_station (station_id, start_time, end_time);

DROP TABLE IF EXISTS derived.bird_legs CASCADE;
CREATE TABLE derived.bird_legs AS
WITH ev AS (
  SELECT device_id, event_time, event_type, battery,
         ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 3763) pt
  FROM bike.events WHERE event_type IN ('maintenance_pick_up', 'provider_drop_off') AND lat IS NOT NULL
), seq AS (
  SELECT *, lead(event_type) OVER w next_type, lead(event_time) OVER w next_time, lead(pt) OVER w next_pt,
         lead(battery) OVER w next_battery
  FROM ev WINDOW w AS (PARTITION BY device_id ORDER BY event_time)
), legs AS (
  SELECT device_id, event_time pickup_time, next_time dropoff_time, pt pickup_pt, next_pt dropoff_pt,
         battery pickup_battery, next_battery dropoff_battery, ST_Distance(pt, next_pt) distance_m
  FROM seq WHERE event_type = 'maintenance_pick_up' AND next_type = 'provider_drop_off'
)
SELECT l.device_id, l.pickup_time, l.dropoff_time,
       (l.pickup_time AT TIME ZONE 'Europe/Lisbon') pickup_local, (l.dropoff_time AT TIME ZONE 'Europe/Lisbon') dropoff_local,
       round(l.distance_m::numeric) distance_m,
       round((extract(epoch FROM l.dropoff_time - l.pickup_time) / 60)::numeric, 1) minutes,
       CASE WHEN l.distance_m < 50 THEN 'in_place' WHEN l.distance_m <= 2000 THEN 'relocation_local' ELSE 'relocation_long' END kind,
       l.pickup_battery, l.dropoff_battery,
       o.station_id from_station, d.station_id to_station,
       o.station_id IS NULL from_outside, d.station_id IS NULL to_outside,
       (SELECT count(*) FROM derived.parking_at_station a WHERE a.station_id = o.station_id AND a.device_id <> l.device_id
          AND a.start_time <= l.pickup_time AND a.end_time > l.pickup_time) from_stock,
       (SELECT count(*) FROM derived.parking_at_station a WHERE a.station_id = d.station_id AND a.device_id <> l.device_id
          AND a.start_time <= l.dropoff_time AND a.end_time > l.dropoff_time) to_stock,
       ST_Transform(l.pickup_pt, 4326) pickup_geom, ST_Transform(l.dropoff_pt, 4326) dropoff_geom
FROM legs l
LEFT JOIN LATERAL (SELECT s.station_id FROM derived.stations_m s WHERE ST_DWithin(s.area_m, l.pickup_pt, 30)
                   ORDER BY ST_Distance(s.area_m, l.pickup_pt) LIMIT 1) o ON true
LEFT JOIN LATERAL (SELECT s.station_id FROM derived.stations_m s WHERE ST_DWithin(s.area_m, l.dropoff_pt, 30)
                   ORDER BY ST_Distance(s.area_m, l.dropoff_pt) LIMIT 1) d ON true;

DROP TABLE IF EXISTS derived.station_stock_hourly CASCADE;
CREATE TABLE derived.station_stock_hourly AS
WITH hours AS (
  SELECT h AS hour_local, h AT TIME ZONE 'Europe/Lisbon' AS hour_utc
  FROM generate_series(timestamp '2026-08-25 00:00', timestamp '2026-09-08 23:00', interval '1 hour') h
)
SELECT s.station_id, h.hour_local, extract(hour FROM h.hour_local)::int hour_of_day,
       extract(isodow FROM h.hour_local) >= 6 is_weekend,
       (SELECT count(*) FROM derived.parking_at_station a WHERE a.station_id = s.station_id
          AND a.start_time <= h.hour_utc AND a.end_time > h.hour_utc) bikes
FROM derived.stations_m s CROSS JOIN hours h;
CREATE INDEX ON derived.station_stock_hourly (station_id, hour_local);

-- An empty spell is a run of consecutive empty hours; it ends at the first parking that starts
-- after the last empty hour, which a rider (trip_end) or Bird (provider_drop_off) supplies.
DROP TABLE IF EXISTS derived.station_empty_spells CASCADE;
CREATE TABLE derived.station_empty_spells AS
WITH marked AS (
  SELECT *, hour_local - (row_number() OVER (PARTITION BY station_id ORDER BY hour_local) * interval '1 hour') grp
  FROM derived.station_stock_hourly WHERE bikes = 0
), spells AS (
  SELECT station_id, min(hour_local) start_local, max(hour_local) last_empty_local, count(*) empty_hours,
         count(*) FILTER (WHERE hour_of_day BETWEEN 7 AND 21) empty_service_hours
  FROM marked GROUP BY station_id, grp
)
SELECT sp.*, r.start_event refill_event,
       CASE WHEN r.start_event IS NULL THEN 'none' WHEN r.start_event = 'provider_drop_off' THEN 'bird' WHEN r.start_event = 'trip_end' THEN 'rider' ELSE 'other' END refilled_by,
       (sp.last_empty_local >= timestamp '2026-09-08 23:00') open_at_end
FROM spells sp
LEFT JOIN LATERAL (
  SELECT a.start_event FROM derived.parking_at_station a
  WHERE a.station_id = sp.station_id AND a.start_time > (sp.last_empty_local AT TIME ZONE 'Europe/Lisbon')
  ORDER BY a.start_time LIMIT 1) r ON true;

DROP TABLE IF EXISTS derived.bird_abandonments CASCADE;
CREATE TABLE derived.bird_abandonments AS
SELECT interval_id, device_id, start_time, abandoned_at, (abandoned_at AT TIME ZONE 'Europe/Lisbon') abandoned_local,
       end_time, end_reason, start_event, minutes, enforced_minutes,
       round((extract(epoch FROM end_time - abandoned_at) / 60)::numeric) minutes_after_threshold,
       distance_outside_m, lat, lon, later_evidence
FROM derived.parking_intervals WHERE outside AND enforced_minutes > 120;
