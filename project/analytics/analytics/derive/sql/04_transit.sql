-- Transit context for 2026: stop locations from the dated plans, scheduled frequency,
-- observed MobiCascais boardings and route departure delay.
DROP TABLE IF EXISTS derived.stop_locations CASCADE;
CREATE TABLE derived.stop_locations AS
SELECT DISTINCT ON (s.agency_id_plan, s.stop_id) s.agency_id_plan AS agency_id, s.stop_id, s.stop_name, s.plan_id,
       s.lat, s.lon, s.geom, ST_Transform(s.geom, 3763) AS geom_m
FROM gtfs.stops s JOIN gtfs.plans p USING (plan_id)
WHERE p.plan_year = 2026 AND s.lat IS NOT NULL
ORDER BY s.agency_id_plan, s.stop_id, s.plan_id;
CREATE INDEX ON derived.stop_locations (agency_id, stop_id);
CREATE INDEX ON derived.stop_locations USING gist (geom_m);

-- Scheduled departures per stop and local hour on a representative weekday and Saturday.
DROP TABLE IF EXISTS derived.stop_frequency CASCADE;
CREATE TABLE derived.stop_frequency AS
WITH days(day_label, d, dow) AS (VALUES ('weekday', '20260902', 3), ('saturday', '20260905', 6)),
cal AS (  -- services active on each day: calendar rules + calendar_dates exceptions
  SELECT c.plan_id, c.service_id, days.day_label FROM gtfs.calendar c CROSS JOIN days
  WHERE days.d BETWEEN c.start_date AND c.end_date
    AND (CASE days.dow WHEN 3 THEN c.wednesday WHEN 6 THEN c.saturday END) = '1'
  UNION
  SELECT cd.plan_id, cd.service_id, days.day_label FROM gtfs.calendar_dates cd JOIN days ON cd.date = days.d
  WHERE cd.exception_type = '1'
  EXCEPT
  SELECT cd.plan_id, cd.service_id, days.day_label FROM gtfs.calendar_dates cd JOIN days ON cd.date = days.d
  WHERE cd.exception_type = '2'
)
SELECT st.plan_id, p.agency_id, st.stop_id, cal.day_label,
       (split_part(st.departure_time, ':', 1)::int % 24) AS hour_local,
       count(*) AS departures,
       count(DISTINCT t.route_id) AS routes
FROM gtfs.stop_times st
JOIN gtfs.trips t ON t.plan_id = st.plan_id AND t.trip_id = st.trip_id
JOIN cal ON cal.plan_id = t.plan_id AND cal.service_id = t.service_id
JOIN gtfs.plans p ON p.plan_id = st.plan_id
WHERE p.plan_year = 2026 AND st.departure_time ~ '^[0-9]+:'
GROUP BY 1, 2, 3, 4, 5;

DROP TABLE IF EXISTS derived.stop_service CASCADE;
CREATE TABLE derived.stop_service AS
SELECT f.agency_id, f.stop_id, l.stop_name, l.geom, l.geom_m,
       sum(departures) FILTER (WHERE day_label = 'weekday') AS weekday_departures,
       sum(departures) FILTER (WHERE day_label = 'weekday' AND hour_local BETWEEN 7 AND 19) / 13.0
         AS weekday_daytime_departures_per_hour,
       max(routes) FILTER (WHERE day_label = 'weekday') AS max_routes_in_an_hour,
       sum(departures) FILTER (WHERE day_label = 'saturday') AS saturday_departures
FROM derived.stop_frequency f JOIN derived.stop_locations l USING (agency_id, stop_id)
GROUP BY 1, 2, 3, 4, 5;
CREATE INDEX ON derived.stop_service USING gist (geom_m);

-- Observed MobiCascais boardings (entry validations) by stop and local hour; coverage recorded.
DROP TABLE IF EXISTS derived.stop_boardings CASCADE;
CREATE TABLE derived.stop_boardings AS
SELECT v.agency_id, v.stop_id, l.stop_name, l.geom,
       extract(isodow FROM v.event_time AT TIME ZONE 'Europe/Lisbon') >= 6 AS is_weekend,
       extract(hour FROM v.event_time AT TIME ZONE 'Europe/Lisbon')::int AS hour_local,
       count(*) AS validations, count(DISTINCT v.card_hash) AS distinct_cards,
       count(DISTINCT v.operational_date) AS n_days
FROM transit26.validations v
JOIN derived.stop_locations l ON l.agency_id = v.agency_id AND l.stop_id = v.stop_id
WHERE v.in_cascais
GROUP BY 1, 2, 3, 4, 5, 6;

DROP TABLE IF EXISTS derived.coverage CASCADE;
CREATE TABLE derived.coverage AS
SELECT v.agency_id, a.agency_name, count(*) AS validations,
       count(*) FILTER (WHERE l.stop_id IS NOT NULL) AS geolocated,
       round(100.0 * count(*) FILTER (WHERE l.stop_id IS NOT NULL) / count(*), 1) AS pct_geolocated,
       count(*) FILTER (WHERE v.in_cascais) AS in_cascais
FROM transit26.validations v
LEFT JOIN derived.stop_locations l ON l.agency_id = v.agency_id AND l.stop_id = v.stop_id
LEFT JOIN ref.agencies a ON a.agency_id = v.agency_id
GROUP BY 1, 2;

-- Route departure delay M01–M36 (continuous minutes; earliness separate), from the spreadsheet times.
DROP TABLE IF EXISTS derived.bus_departures CASCADE;
CREATE TABLE derived.bus_departures AS
SELECT linha AS route, variante, direcao, planned_departure, actual_departure,
       GREATEST(0, extract(epoch FROM actual_departure - planned_departure) / 60) AS delay_min,
       GREATEST(0, extract(epoch FROM planned_departure - actual_departure) / 60) AS early_min,
       extract(isodow FROM planned_departure AT TIME ZONE 'Europe/Lisbon') >= 6 AS is_weekend,
       extract(hour FROM planned_departure AT TIME ZONE 'Europe/Lisbon')::int AS hour_local
FROM bus26.services_m01_m36
WHERE planned_departure IS NOT NULL;

DROP TABLE IF EXISTS derived.bus_delay_routes CASCADE;
CREATE TABLE derived.bus_delay_routes AS
SELECT route,
       CASE WHEN window_ IS NULL THEN 'all' ELSE window_ END AS time_window,
       count(*) AS services, count(actual_departure) AS observed,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY delay_min))::numeric, 1) AS median_delay_min,
       round((percentile_cont(0.9) WITHIN GROUP (ORDER BY delay_min))::numeric, 1) AS p90_delay_min,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY early_min))::numeric, 1) AS median_early_min,
       count(DISTINCT planned_departure::date) AS n_days
FROM (
  SELECT *, CASE WHEN is_weekend THEN 'weekend'
                 WHEN hour_local BETWEEN 7 AND 9 THEN 'weekday 07-10'
                 WHEN hour_local BETWEEN 16 AND 18 THEN 'weekday 16-19'
                 ELSE 'weekday other' END AS window_
  FROM derived.bus_departures
) b
GROUP BY GROUPING SETS ((route), (route, window_));
