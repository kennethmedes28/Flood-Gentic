-- Flood signals worked out from the daily weather (rain totals over several days, wet streaks, river flow change),
-- one row per sample point per day. First filled by scripts/load_to_supabase.py from
-- datasets/ncr_flood_features_daily.csv, then kept current by the nightly "Update datasets" workflow
-- (scripts/update_supabase_from_open_meteo.py). Read by /dashboard. Needs 006_ncr_locations.sql.
CREATE TABLE IF NOT EXISTS ncr_flood_features_daily (
    location_id               integer NOT NULL REFERENCES ncr_locations (location_id),
    date                      date    NOT NULL,
    precipitation_sum_mm      double precision,
    wind_speed_10m_max_kmh    double precision,
    wind_gusts_10m_max_kmh    double precision,
    river_discharge_m3s       double precision,
    rain_max_1h_mm            double precision,
    rain_max_3h_mm            double precision,
    rain_max_6h_mm            double precision,
    elevation_m               double precision,
    rain_3d_mm                double precision,
    rain_7d_mm                double precision,
    rain_14d_mm               double precision,
    wet_streak_days           integer,
    discharge_change_1d_pct   double precision,
    discharge_max_3d_m3s      double precision,
    discharge_pctile          double precision,
    PRIMARY KEY (location_id, date)
);

-- Only the backend's direct Postgres connection may read or write (no policies on purpose).
ALTER TABLE ncr_flood_features_daily ENABLE ROW LEVEL SECURITY;
