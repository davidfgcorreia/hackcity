-- F2 station candidate screening on the 250 m grid (analytics requirements, "Bicycle station screening").
-- Candidate = cell whose centre is > 150 m from every station area. Provisional weights:
--   observed demand 35 %, outside-station parking 25 %, complete-journey improvement 20 % (UNAVAILABLE:
--   no walk/cycle network yet), transport-coverage gap 10 %, population/equity 5 % (UNAVAILABLE: census
--   not ingested), bus delay 5 % (neutral 0.5, labelled missing: no validated stop-level delay).
-- Unavailable components are excluded, never zero; the score is renormalised over available weight
-- (0.75) and that share is published. Components are percentile ranks within the candidate set.
-- Score suppressed when fewer than 5 outside-station intervals contribute.
DROP TABLE IF EXISTS derived.station_candidates CASCADE;
CREATE TABLE derived.station_candidates AS
WITH cells AS (
  SELECT g.cell_id, g.geom, g.centroid, ST_Centroid(g.geom_m) AS c_m
  FROM derived.grid_250 g
  WHERE NOT EXISTS (SELECT 1 FROM derived.stations_m s WHERE ST_DWithin(s.area_m, ST_Centroid(g.geom_m), 150))
), raw AS (
  SELECT c.cell_id, c.geom, c.centroid,
         (SELECT count(*) FROM derived.trip_endpoints e WHERE e.cell_id = c.cell_id) AS trip_endpoints,
         (SELECT count(*) FROM derived.trip_endpoints e WHERE e.cell_id = c.cell_id AND e.kind = 'start') AS trip_starts,
         (SELECT count(*) FROM derived.trip_endpoints e WHERE e.cell_id = c.cell_id AND e.kind = 'end') AS trip_ends,
         (SELECT count(*) FROM derived.parking_intervals p WHERE p.cell_id = c.cell_id AND p.outside) AS outside_intervals,
         (SELECT count(*) FROM derived.parking_intervals p WHERE p.cell_id = c.cell_id AND p.outside AND p.enforced_minutes > 120) AS supported_120,
         (SELECT COALESCE(sum(s.weekday_daytime_departures_per_hour), 0) FROM derived.stop_service s
           WHERE ST_DWithin(s.geom_m, c.c_m, 333)) AS departures_per_hour_333m,
         (SELECT min(ST_Distance(s.area_m, c.c_m)) FROM derived.stations_m s) AS nearest_station_m,
         (SELECT string_agg(DISTINCT s.agency_id, ',') FROM derived.stop_service s WHERE ST_DWithin(s.geom_m, c.c_m, 333)) AS operators_333m
  FROM cells c
), scored AS (
  SELECT r.*,
         percent_rank() OVER (ORDER BY trip_endpoints) AS demand_n,
         percent_rank() OVER (ORDER BY supported_120) AS parking_n,
         1 - LEAST(1, departures_per_hour_333m / 6.0) AS transport_gap_n,
         0.5 AS bus_delay_n
  FROM raw r WHERE trip_endpoints > 0 OR outside_intervals > 0
)
SELECT s.*,
       0.75 AS weight_available,
       CASE WHEN outside_intervals >= 5 THEN
         round(((0.35 * demand_n + 0.25 * parking_n + 0.10 * transport_gap_n + 0.05 * bus_delay_n) / 0.75)::numeric, 3)
       END AS score,
       CASE WHEN outside_intervals >= 5 THEN
         round(((0.25 * parking_n + 0.10 * transport_gap_n + 0.05 * bus_delay_n) / 0.40)::numeric, 3) END AS score_without_demand,
       CASE WHEN outside_intervals >= 5 THEN
         round(((0.35 * demand_n + 0.10 * transport_gap_n + 0.05 * bus_delay_n) / 0.50)::numeric, 3) END AS score_without_parking,
       CASE WHEN outside_intervals >= 5 THEN
         round(((0.35 * demand_n + 0.25 * parking_n + 0.05 * bus_delay_n) / 0.65)::numeric, 3) END AS score_without_transport_gap,
       CASE WHEN outside_intervals >= 5 THEN
         round(((0.35 * demand_n + 0.25 * parking_n + 0.10 * transport_gap_n) / 0.70)::numeric, 3) END AS score_without_bus_delay,
       outside_intervals < 5 AS insufficient
FROM scored s;
ALTER TABLE derived.station_candidates ADD COLUMN rank int;
UPDATE derived.station_candidates c SET rank = r.rk
FROM (SELECT cell_id, rank() OVER (ORDER BY score DESC) rk FROM derived.station_candidates WHERE score IS NOT NULL) r
WHERE r.cell_id = c.cell_id;
