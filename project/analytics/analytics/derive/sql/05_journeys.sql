-- Journeys into, out of and across Cascais from card validations (2026 sample week).
-- A journey is in scope when its origin or destination zone is in Cascais.
-- A card is not a verified person; outputs are aggregated and groups under 5 cards suppressed.
--   boarding  = entry validation (event_type 1 or 13); Metro exits (4, 14) are observed alightings
--   journey   = boardings of one card chained while the gap to the previous boarding is <= 60 min
--   origin    = first boarding of a journey (observed)
--   destination = Metro exit when observed; otherwise the next journey's origin that day, or the
--                 first origin of the day for the last journey (trip-chaining proxy, labelled)
-- Zones: 1 km EPSG:3763 cells, labelled with the municipality of the nearest metropolitan stop.
DROP TABLE IF EXISTS derived.card_taps CASCADE;
CREATE TABLE derived.card_taps AS
SELECT v.card_hash, v.event_time, v.operational_date, v.agency_id, v.line_id, v.stop_id, v.vehicle_id,
       v.event_type IN (4, 14) AS is_exit, v.in_cascais, l.geom_m,
       floor(ST_X(l.geom_m) / 1000)::int || '_' || floor(ST_Y(l.geom_m) / 1000)::int AS zone_id
FROM transit26.validations v
JOIN derived.stop_locations l ON l.agency_id = v.agency_id AND l.stop_id = v.stop_id
WHERE v.event_type IN (1, 13, 4, 14);
CREATE INDEX ON derived.card_taps (card_hash, event_time);

DROP TABLE IF EXISTS derived.zones CASCADE;
CREATE TABLE derived.zones AS
WITH z AS (SELECT DISTINCT zone_id FROM derived.card_taps),
zg AS (
  SELECT zone_id,
         ST_MakeEnvelope(split_part(zone_id, '_', 1)::int * 1000, split_part(zone_id, '_', 2)::int * 1000,
                         split_part(zone_id, '_', 1)::int * 1000 + 1000, split_part(zone_id, '_', 2)::int * 1000 + 1000, 3763) AS geom_m
  FROM z
)
SELECT zg.zone_id, zg.geom_m, ST_Transform(ST_Centroid(zg.geom_m), 4326) AS centroid,
       COALESCE((SELECT c.municipality_name FROM ref.cm_stops c
                 WHERE ST_DWithin(ST_Transform(c.geom, 3763), ST_Centroid(zg.geom_m), 3000)
                 ORDER BY ST_Transform(c.geom, 3763) <-> ST_Centroid(zg.geom_m) LIMIT 1), 'Lisboa') AS municipality
FROM zg;

DROP TABLE IF EXISTS derived.journeys CASCADE;
CREATE TABLE derived.journeys AS
WITH b AS (
  SELECT *, CASE WHEN lag(event_time) OVER w IS NULL
                   OR event_time - lag(event_time) OVER w > interval '60 minutes'
                   OR operational_date <> lag(operational_date) OVER w THEN 1 ELSE 0 END AS new_journey
  FROM derived.card_taps WHERE NOT is_exit
  WINDOW w AS (PARTITION BY card_hash ORDER BY event_time)
), j AS (
  SELECT *, sum(new_journey) OVER (PARTITION BY card_hash ORDER BY event_time) AS journey_no FROM b
), agg AS (
  SELECT card_hash, journey_no, min(operational_date) AS operational_date,
         min(event_time) AS start_time, max(event_time) AS last_boarding,
         (array_agg(zone_id ORDER BY event_time))[1] AS origin_zone,
         (array_agg(agency_id ORDER BY event_time))[1] AS first_agency,
         array_agg(agency_id || ':' || COALESCE(line_id, '?') ORDER BY event_time) AS legs,
         count(*) AS boardings, bool_or(in_cascais) AS touches_cascais
  FROM j GROUP BY 1, 2
)
SELECT a.*,
       -- observed alighting: a Metro exit after the last boarding and before the next journey
       (SELECT e.zone_id FROM derived.card_taps e
         WHERE e.card_hash = a.card_hash AND e.is_exit AND e.event_time > a.last_boarding
           AND e.event_time < a.last_boarding + interval '90 minutes'
         ORDER BY e.event_time LIMIT 1) AS observed_dest_zone,
       COALESCE(lead(origin_zone) OVER d, first_value(origin_zone) OVER d) AS chained_dest_zone,
       lead(start_time) OVER d IS NULL AS last_of_day
FROM agg a
WINDOW d AS (PARTITION BY card_hash, operational_date ORDER BY journey_no
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING);
-- a single journey that day has no chained destination
UPDATE derived.journeys j SET chained_dest_zone = NULL
WHERE chained_dest_zone = origin_zone AND observed_dest_zone IS NULL;

DROP TABLE IF EXISTS derived.od_flows CASCADE;
CREATE TABLE derived.od_flows AS
SELECT o.zone_id AS origin_zone, dz.zone_id AS dest_zone, o.municipality AS origin_municipality,
       dz.municipality AS dest_municipality, o.centroid AS origin_pt, dz.centroid AS dest_pt,
       count(*) AS journeys, count(DISTINCT j.card_hash) AS cards,
       count(*) FILTER (WHERE j.observed_dest_zone IS NOT NULL) AS observed_destinations,
       count(*) FILTER (WHERE extract(hour FROM j.start_time AT TIME ZONE 'Europe/Lisbon') BETWEEN 7 AND 9) AS am_peak,
       count(*) FILTER (WHERE extract(hour FROM j.start_time AT TIME ZONE 'Europe/Lisbon') BETWEEN 16 AND 18) AS pm_peak,
       count(*) FILTER (WHERE j.boardings > 1) AS with_transfer
FROM derived.journeys j
JOIN derived.zones o ON o.zone_id = j.origin_zone
JOIN derived.zones dz ON dz.zone_id = COALESCE(j.observed_dest_zone, j.chained_dest_zone)
WHERE (o.municipality = 'Cascais' OR dz.municipality = 'Cascais') AND o.zone_id <> dz.zone_id
GROUP BY 1, 2, 3, 4, 5, 6
HAVING count(DISTINCT j.card_hash) >= 5;

DROP TABLE IF EXISTS derived.municipality_flows CASCADE;
CREATE TABLE derived.municipality_flows AS
SELECT o.municipality AS origin_municipality, dz.municipality AS dest_municipality,
       count(*) AS journeys, count(DISTINCT j.card_hash) AS cards
FROM derived.journeys j
JOIN derived.zones o ON o.zone_id = j.origin_zone
JOIN derived.zones dz ON dz.zone_id = COALESCE(j.observed_dest_zone, j.chained_dest_zone)
WHERE o.municipality = 'Cascais' OR dz.municipality = 'Cascais'
GROUP BY 1, 2 HAVING count(DISTINCT j.card_hash) >= 5;

DROP TABLE IF EXISTS derived.transfer_pairs CASCADE;
CREATE TABLE derived.transfer_pairs AS
WITH legs AS (
  SELECT card_hash, event_time, agency_id, line_id, zone_id, in_cascais,
         lead(agency_id) OVER w AS next_agency, lead(line_id) OVER w AS next_line,
         lead(event_time) OVER w - event_time AS wait
  FROM derived.card_taps WHERE NOT is_exit
  WINDOW w AS (PARTITION BY card_hash ORDER BY event_time)
)
SELECT l.agency_id AS from_agency, fa.agency_name AS from_operator, l.line_id AS from_line,
       l.next_agency AS to_agency, ta.agency_name AS to_operator, l.next_line AS to_line,
       count(*) AS transfers, count(DISTINCT card_hash) AS cards,
       round(extract(epoch FROM percentile_cont(0.5) WITHIN GROUP (ORDER BY wait)) / 60) AS median_gap_min,
       bool_or(in_cascais) AS touches_cascais
FROM legs l
LEFT JOIN ref.agencies fa ON fa.agency_id = l.agency_id
LEFT JOIN ref.agencies ta ON ta.agency_id = l.next_agency
WHERE wait BETWEEN interval '2 minutes' AND interval '60 minutes'
  AND (l.agency_id, l.line_id) IS DISTINCT FROM (l.next_agency, l.next_line)
GROUP BY 1, 2, 3, 4, 5, 6
HAVING count(DISTINCT card_hash) >= 5;

DROP TABLE IF EXISTS derived.journey_summary CASCADE;
CREATE TABLE derived.journey_summary AS
SELECT count(DISTINCT card_hash) AS cards, count(*) AS journeys,
       round(avg(boardings), 2) AS avg_boardings_per_journey,
       round(100.0 * count(*) FILTER (WHERE boardings > 1) / count(*), 1) AS pct_with_transfer,
       round(100.0 * count(*) FILTER (WHERE observed_dest_zone IS NOT NULL) / count(*), 1) AS pct_observed_destination,
       round(100.0 * count(*) FILTER (WHERE observed_dest_zone IS NULL AND chained_dest_zone IS NOT NULL) / count(*), 1)
         AS pct_chained_destination,
       round(100.0 * count(*) FILTER (WHERE array_to_string(legs, ',') ~ 'HF16N' AND array_to_string(legs, ',') ~ '(LA77N|IA2N9|IA9T6|BNA17)')
             / count(*), 1) AS pct_mobicascais_with_other_operator
FROM derived.journeys j JOIN derived.zones o ON o.zone_id = j.origin_zone
LEFT JOIN derived.zones dz ON dz.zone_id = COALESCE(j.observed_dest_zone, j.chained_dest_zone)
WHERE o.municipality = 'Cascais' OR dz.municipality = 'Cascais';
