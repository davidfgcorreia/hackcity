-- Bus/rail <-> bike transfer PROXY (analytics requirements, "possible transfer proxy"):
--   transit->bike: a valid bike trip START within 300 m (straight line, labelled estimate) of a stop
--                  and within 15 min AFTER a scheduled arrival there on that date's active services;
--   bike->transit: a bike trip END within 300 m and within 15 min BEFORE a scheduled departure.
-- A trip is counted once, against the closest stop (then closest time); candidate count kept.
-- Never a verified transfer: bike trips have no rider key.
DROP TABLE IF EXISTS derived.active_services CASCADE;
CREATE TABLE derived.active_services AS
WITH dates AS (
  SELECT d::date AS day, to_char(d, 'YYYYMMDD') AS ymd, extract(isodow FROM d)::int AS dow
  FROM generate_series(date '2026-08-18', date '2026-09-08', interval '1 day') d
), plans AS (SELECT plan_id FROM gtfs.plans WHERE plan_year = 2026 AND scope = 'full')
SELECT DISTINCT x.plan_id, x.service_id, x.day FROM (
  SELECT c.plan_id, c.service_id, dt.day FROM gtfs.calendar c JOIN plans USING (plan_id) CROSS JOIN dates dt
  WHERE dt.ymd BETWEEN c.start_date AND c.end_date
    AND (ARRAY[c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday])[dt.dow] = '1'
  UNION
  SELECT cd.plan_id, cd.service_id, dt.day FROM gtfs.calendar_dates cd JOIN plans USING (plan_id)
  JOIN dates dt ON dt.ymd = cd.date WHERE cd.exception_type = '1'
) x
WHERE NOT EXISTS (SELECT 1 FROM gtfs.calendar_dates e JOIN dates dt ON dt.ymd = e.date
                  WHERE e.plan_id = x.plan_id AND e.service_id = x.service_id AND dt.day = x.day AND e.exception_type = '2');

-- stops within 300 m of any bike trip endpoint
DROP TABLE IF EXISTS derived.bike_stop_pairs CASCADE;
CREATE TABLE derived.bike_stop_pairs AS
SELECT e.trip_id, e.kind, e.t_utc, e.date_local, s.agency_id, s.stop_id, ST_Distance(e.pt_m, s.geom_m) AS dist_m
FROM derived.trip_endpoints e
JOIN derived.stop_locations s ON ST_DWithin(e.pt_m, s.geom_m, 300)
JOIN gtfs.plans p ON p.agency_id = s.agency_id AND p.plan_year = 2026 AND p.scope = 'full';

DROP TABLE IF EXISTS derived.scheduled_calls CASCADE;
CREATE TABLE derived.scheduled_calls AS
SELECT st.plan_id, p.agency_id, st.stop_id, t.service_id, t.route_id,
       split_part(st.arrival_time, ':', 1)::int * 3600 + split_part(st.arrival_time, ':', 2)::int * 60 AS arr_s,
       split_part(st.departure_time, ':', 1)::int * 3600 + split_part(st.departure_time, ':', 2)::int * 60 AS dep_s
FROM gtfs.stop_times st
JOIN gtfs.trips t ON t.plan_id = st.plan_id AND t.trip_id = st.trip_id
JOIN gtfs.plans p ON p.plan_id = st.plan_id
WHERE p.plan_year = 2026 AND p.scope = 'full' AND st.arrival_time ~ '^[0-9]+:[0-9]+'
  AND (p.agency_id, st.stop_id) IN (SELECT DISTINCT agency_id, stop_id FROM derived.bike_stop_pairs);
CREATE INDEX ON derived.scheduled_calls (agency_id, stop_id, service_id);

DROP TABLE IF EXISTS derived.transfer_proxy CASCADE;
CREATE TABLE derived.transfer_proxy AS
WITH m AS (
  SELECT bp.trip_id, bp.kind, bp.agency_id, bp.stop_id, bp.dist_m,
         -- seconds after local midnight of the service day
         extract(epoch FROM (bp.t_utc AT TIME ZONE 'Europe/Lisbon') - bp.date_local::timestamp) AS t_s,
         sc.arr_s, sc.dep_s, sc.route_id
  FROM derived.bike_stop_pairs bp
  JOIN derived.active_services a ON a.day = bp.date_local
  JOIN derived.scheduled_calls sc ON sc.agency_id = bp.agency_id AND sc.stop_id = bp.stop_id
                                 AND sc.plan_id = a.plan_id AND sc.service_id = a.service_id
), hit AS (
  SELECT * FROM m
  WHERE (kind = 'start' AND t_s - arr_s BETWEEN 0 AND 900)
     OR (kind = 'end' AND dep_s - t_s BETWEEN 0 AND 900)
)
SELECT DISTINCT ON (trip_id, kind) trip_id, kind, agency_id, stop_id, route_id, round(dist_m) dist_m,
       CASE WHEN kind = 'start' THEN t_s - arr_s ELSE dep_s - t_s END AS gap_s,
       count(*) OVER (PARTITION BY trip_id, kind) AS candidate_calls
FROM hit
ORDER BY trip_id, kind, dist_m, CASE WHEN kind = 'start' THEN t_s - arr_s ELSE dep_s - t_s END;

DROP TABLE IF EXISTS derived.transfer_proxy_by_stop CASCADE;
CREATE TABLE derived.transfer_proxy_by_stop AS
SELECT p.agency_id, p.stop_id, l.stop_name, l.geom,
       count(*) FILTER (WHERE kind = 'start') AS transit_to_bike,
       count(*) FILTER (WHERE kind = 'end') AS bike_to_transit
FROM derived.transfer_proxy p JOIN derived.stop_locations l USING (agency_id, stop_id)
GROUP BY 1, 2, 3, 4;

DROP TABLE IF EXISTS derived.transfer_proxy_summary CASCADE;
CREATE TABLE derived.transfer_proxy_summary AS
SELECT e.kind,
       count(*) AS bike_endpoints,
       count(p.trip_id) AS with_transit_proxy,
       round(100.0 * count(p.trip_id) / count(*), 1) AS pct,
       count(p.trip_id) FILTER (WHERE p.agency_id = 'HF16N') AS mobicascais,
       count(p.trip_id) FILTER (WHERE p.agency_id = 'N18KL') AS cp_rail,
       count(p.trip_id) FILTER (WHERE p.agency_id = 'LA77N') AS carris_metropolitana_41
FROM derived.trip_endpoints e
LEFT JOIN derived.transfer_proxy p ON p.trip_id = e.trip_id AND p.kind = e.kind
GROUP BY 1;

-- Placebo: same rule with bike start times shifted +30 min. If the rate is similar, the proxy
-- reflects service density near stops rather than transfer behaviour.
DROP TABLE IF EXISTS derived.transfer_proxy_placebo CASCADE;
CREATE TABLE derived.transfer_proxy_placebo AS
SELECT count(DISTINCT bp.trip_id) AS starts_matching_when_shifted_30min,
       (SELECT count(*) FROM derived.trip_endpoints WHERE kind = 'start') AS bike_starts,
       round(100.0 * count(DISTINCT bp.trip_id) / (SELECT count(*) FROM derived.trip_endpoints WHERE kind = 'start'), 1) AS pct
FROM derived.bike_stop_pairs bp
JOIN derived.active_services a ON a.day = bp.date_local
JOIN derived.scheduled_calls sc ON sc.agency_id = bp.agency_id AND sc.stop_id = bp.stop_id
                               AND sc.plan_id = a.plan_id AND sc.service_id = a.service_id
WHERE bp.kind = 'start'
  AND extract(epoch FROM (bp.t_utc AT TIME ZONE 'Europe/Lisbon') - bp.date_local::timestamp) + 1800 - sc.arr_s BETWEEN 0 AND 900;
