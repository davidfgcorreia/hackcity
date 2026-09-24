-- Descriptive only: hourly valid trip starts with ERA5 weather (never used in the ranking).
DROP TABLE IF EXISTS derived.weather_bike CASCADE;
CREATE TABLE derived.weather_bike AS
WITH starts AS (
  SELECT date_trunc('hour', t_utc) AS hour_utc, count(*) AS trip_starts
  FROM derived.trip_endpoints WHERE kind = 'start' GROUP BY 1
)
SELECT w.time AS hour_utc, (w.time AT TIME ZONE 'Europe/Lisbon') AS hour_local,
       extract(hour FROM w.time AT TIME ZONE 'Europe/Lisbon')::int AS hour_of_day,
       extract(isodow FROM w.time AT TIME ZONE 'Europe/Lisbon') >= 6 AS is_weekend,
       COALESCE(s.trip_starts, 0) AS trip_starts,
       w.temperature_2m, w.precipitation, w.wind_speed_10m, w.wind_gusts_10m,
       CASE WHEN w.precipitation >= 0.1 THEN 'rain' ELSE 'dry' END AS rain_class,
       CASE WHEN w.temperature_2m >= 28 THEN 'hot (>=28C)' WHEN w.temperature_2m < 18 THEN 'cool (<18C)' ELSE 'mild' END AS temp_class,
       CASE WHEN w.wind_speed_10m >= 25 THEN 'windy (>=25 km/h)' ELSE 'calm' END AS wind_class
FROM weather.hourly w LEFT JOIN starts s ON s.hour_utc = w.time
WHERE w.time >= (SELECT min(t_utc) FROM derived.trip_endpoints) AND w.time <= (SELECT max(t_utc) FROM derived.trip_endpoints);
