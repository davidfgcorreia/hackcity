-- Screening grid, metric station geometry, valid trips and their endpoints.
DROP TABLE IF EXISTS derived.grid_250 CASCADE;
CREATE TABLE derived.grid_250 AS
SELECT g.i || '_' || g.j AS cell_id, g.geom AS geom_m, ST_Transform(g.geom, 4326) AS geom,
       ST_Transform(ST_Centroid(g.geom), 4326) AS centroid
FROM ST_SquareGrid(250, ST_Transform(ST_MakeEnvelope(-9.500, 38.665, -9.295, 38.780, 4326), 3763)) g;
CREATE INDEX ON derived.grid_250 USING gist (geom_m);
CREATE UNIQUE INDEX ON derived.grid_250 (cell_id);

DROP TABLE IF EXISTS derived.stations_m CASCADE;
CREATE TABLE derived.stations_m AS
SELECT station_id, name, ST_Transform(area, 3763) AS area_m, ST_Buffer(ST_Transform(area, 3763), 30) AS parking_zone_m
FROM bike.stations;
CREATE INDEX ON derived.stations_m USING gist (area_m);
CREATE INDEX ON derived.stations_m USING gist (parking_zone_m);

-- Valid customer trip: rider trip, 1 min to 4 h, moved more than 50 m.
DROP TABLE IF EXISTS derived.trip_endpoints CASCADE;
CREATE TABLE derived.trip_endpoints AS
WITH valid AS (
  SELECT * FROM bike.trips
  WHERE trip_type = 'rider' AND duration_s BETWEEN 60 AND 14400
    AND ST_Distance(ST_Transform(start_geom, 3763), ST_Transform(end_geom, 3763)) > 50
), ep AS (
  SELECT trip_id, 'start' AS kind, start_time AS t_utc, ST_Transform(start_geom, 3763) AS pt_m FROM valid
  UNION ALL
  SELECT trip_id, 'end', end_time, ST_Transform(end_geom, 3763) FROM valid
)
SELECT ep.trip_id, ep.kind, ep.t_utc,
       (ep.t_utc AT TIME ZONE 'Europe/Lisbon') AS t_local,
       extract(hour FROM ep.t_utc AT TIME ZONE 'Europe/Lisbon')::int AS hour_local,
       extract(isodow FROM ep.t_utc AT TIME ZONE 'Europe/Lisbon')::int AS dow,
       extract(isodow FROM ep.t_utc AT TIME ZONE 'Europe/Lisbon') >= 6 AS is_weekend,
       (ep.t_utc AT TIME ZONE 'Europe/Lisbon')::date AS date_local,
       ep.pt_m,
       -- trip-to-station assignment uses the station area itself (the 30 m buffer is for parking only)
       (SELECT s.station_id FROM derived.stations_m s WHERE ST_Covers(s.area_m, ep.pt_m) LIMIT 1) AS station_id,
       EXISTS (SELECT 1 FROM derived.stations_m s WHERE ST_DWithin(s.area_m, ep.pt_m, 30)) AS in_parking_zone,
       (SELECT g.cell_id FROM derived.grid_250 g WHERE ST_Intersects(g.geom_m, ep.pt_m) LIMIT 1) AS cell_id
FROM ep;
CREATE INDEX ON derived.trip_endpoints (station_id);
CREATE INDEX ON derived.trip_endpoints (cell_id);

-- F3: station supply/demand from trip flow (not stock: no inventory history exists)
DROP TABLE IF EXISTS derived.station_flows CASCADE;
CREATE TABLE derived.station_flows AS
WITH days AS (
  SELECT is_weekend, count(DISTINCT date_local) AS n_days FROM derived.trip_endpoints GROUP BY 1
)
SELECT e.station_id, e.is_weekend, e.hour_local,
       count(*) FILTER (WHERE kind = 'start') AS departures,
       count(*) FILTER (WHERE kind = 'end') AS arrivals,
       count(*) FILTER (WHERE kind = 'end') - count(*) FILTER (WHERE kind = 'start') AS net_flow,
       d.n_days
FROM derived.trip_endpoints e JOIN days d USING (is_weekend)
WHERE e.station_id IS NOT NULL
GROUP BY 1, 2, 3, d.n_days;
