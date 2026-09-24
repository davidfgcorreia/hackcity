-- F1 recovery per area and B5 detector validation, from derived.parking_intervals (Python step).
DROP TABLE IF EXISTS derived.recovery_by_cell CASCADE;
CREATE TABLE derived.recovery_by_cell AS
WITH iv AS (
  SELECT cell_id,
         count(*) AS outside_intervals,
         count(*) FILTER (WHERE minutes > 120) AS supported_120,
         count(*) FILTER (WHERE minutes > 120 AND later_evidence) AS supported_with_evidence,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FILTER (WHERE minutes > 120) / 60 AS median_hours_parked,
         count(*) FILTER (WHERE end_reason = 'provider_recovery') AS provider_recoveries,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FILTER (WHERE end_reason = 'provider_recovery') / 60
           AS median_hours_to_provider_recovery
  FROM derived.parking_intervals WHERE outside GROUP BY 1
), te AS (
  SELECT cell_id, count(*) AS trip_ends FROM derived.trip_endpoints WHERE kind = 'end' GROUP BY 1
)
SELECT g.cell_id, g.geom, COALESCE(te.trip_ends, 0) AS trip_ends,
       COALESCE(iv.outside_intervals, 0) AS outside_intervals, COALESCE(iv.supported_120, 0) AS supported_120,
       COALESCE(iv.supported_with_evidence, 0) AS supported_with_evidence,
       CASE WHEN te.trip_ends > 0 THEN round(100.0 * COALESCE(iv.outside_intervals, 0) / te.trip_ends, 1) END
         AS outside_per_100_trip_ends,
       round(iv.median_hours_parked::numeric, 2) AS median_hours_parked,
       COALESCE(iv.provider_recoveries, 0) AS provider_recoveries,
       round(iv.median_hours_to_provider_recovery::numeric, 2) AS median_hours_to_provider_recovery,
       COALESCE(iv.outside_intervals, 0) < 5 AS insufficient
FROM derived.grid_250 g
LEFT JOIN iv USING (cell_id) LEFT JOIN te USING (cell_id)
WHERE iv.cell_id IS NOT NULL OR te.cell_id IS NOT NULL;

DROP TABLE IF EXISTS derived.b5_detector_validation CASCADE;
CREATE TABLE derived.b5_detector_validation AS
SELECT
  count(*) FILTER (WHERE end_reason = 'provider_recovery') AS provider_recoveries_total,
  count(*) FILTER (WHERE end_reason = 'provider_recovery' AND outside) AS provider_recoveries_outside,
  count(*) FILTER (WHERE end_reason = 'provider_recovery' AND outside AND minutes > 120) AS flagged_before_recovery,
  round(100.0 * count(*) FILTER (WHERE end_reason = 'provider_recovery' AND outside AND minutes > 120)
        / NULLIF(count(*) FILTER (WHERE end_reason = 'provider_recovery' AND outside), 0), 1) AS pct_flagged,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes - 120)
        FILTER (WHERE end_reason = 'provider_recovery' AND outside AND minutes > 120))::numeric, 0) AS median_lead_minutes,
  round((percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes - 120)
        FILTER (WHERE end_reason = 'provider_recovery' AND outside AND minutes > 120))::numeric, 0) AS p90_lead_minutes,
  count(*) FILTER (WHERE outside AND minutes > 120) AS supported_intervals,
  count(*) FILTER (WHERE outside AND minutes > 120 AND end_reason = 'new_trip') AS supported_ended_by_new_trip,
  count(*) FILTER (WHERE outside AND minutes > 120 AND end_reason = 'provider_recovery') AS supported_ended_by_provider,
  count(*) FILTER (WHERE outside AND minutes > 120 AND end_reason = 'censored') AS supported_still_open_at_data_end,
  count(*) FILTER (WHERE outside AND minutes > 120 AND later_evidence) AS supported_with_later_evidence
FROM derived.parking_intervals;
