-- Indexed GTFS segments for scheduled bus/train map positions.
DROP TABLE IF EXISTS derived.scheduled_segments CASCADE;
CREATE TABLE derived.scheduled_segments AS
WITH timed AS (
  SELECT t.plan_id,t.trip_id,t.service_id,t.shape_id,r.route_short_name,r.route_type,
    st.stop_sequence::int seq,
    (split_part(st.arrival_time,':',1)::int*3600 + split_part(st.arrival_time,':',2)::int*60 + split_part(st.arrival_time,':',3)::int) arrival_s,
    (split_part(st.departure_time,':',1)::int*3600 + split_part(st.departure_time,':',2)::int*60 + split_part(st.departure_time,':',3)::int) departure_s,
    st.shape_dist_traveled::float dist,
    lead(st.shape_dist_traveled::float) OVER w next_dist,
    lead((split_part(st.arrival_time,':',1)::int*3600 + split_part(st.arrival_time,':',2)::int*60 + split_part(st.arrival_time,':',3)::int)) OVER w next_arrival_s,
    min(st.shape_dist_traveled::float) OVER (PARTITION BY st.plan_id,st.trip_id) min_dist,
    max(st.shape_dist_traveled::float) OVER (PARTITION BY st.plan_id,st.trip_id) max_dist
  FROM gtfs.stop_times st JOIN gtfs.trips t ON t.plan_id=st.plan_id AND t.trip_id=st.trip_id
  JOIN gtfs.routes r ON r.plan_id=t.plan_id AND r.route_id=t.route_id
  JOIN gtfs.plans p ON p.plan_id=t.plan_id
  WHERE p.plan_year=2026 AND p.agency_id IN ('HF16N','N18KL','LA77N')
    AND t.shape_id IS NOT NULL AND st.shape_dist_traveled IS NOT NULL
  WINDOW w AS (PARTITION BY st.plan_id,st.trip_id ORDER BY st.stop_sequence::int)
)
SELECT * FROM timed WHERE next_arrival_s>=arrival_s OR (next_arrival_s IS NULL AND departure_s>arrival_s);
CREATE INDEX scheduled_segments_time_idx ON derived.scheduled_segments
  USING gist (int4range(arrival_s,coalesce(next_arrival_s,departure_s),'[]'));
CREATE INDEX scheduled_segments_trip_idx ON derived.scheduled_segments (plan_id,trip_id);

DROP TABLE IF EXISTS derived.schedule_shapes CASCADE;
CREATE TABLE derived.schedule_shapes AS
SELECT s.plan_id,s.shape_id,
  ST_MakeLine(ST_SetSRID(ST_MakePoint(s.shape_pt_lon::float,s.shape_pt_lat::float),4326)
              ORDER BY s.shape_pt_sequence::int) geom
FROM gtfs.shapes s JOIN gtfs.plans p ON p.plan_id=s.plan_id
WHERE p.plan_year=2026 AND p.agency_id IN ('HF16N','N18KL','LA77N')
GROUP BY s.plan_id,s.shape_id;
CREATE UNIQUE INDEX schedule_shapes_id_idx ON derived.schedule_shapes (plan_id,shape_id);
