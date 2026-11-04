-- The 17 weather sample points in Metro Manila, one per city, from datasets/ncr_locations.csv. Filled by
-- scripts/load_to_supabase.py. ncr_weather_daily and ncr_flood_features_daily point at this table, so create it first.
CREATE TABLE IF NOT EXISTS ncr_locations (
    location_id  integer PRIMARY KEY,
    latitude     double precision NOT NULL,
    longitude    double precision NOT NULL,
    elevation_m  double precision,
    coord_group  integer,
    city         text NOT NULL
);

-- Only the backend's direct Postgres connection may read or write (no policies on purpose).
ALTER TABLE ncr_locations ENABLE ROW LEVEL SECURITY;
