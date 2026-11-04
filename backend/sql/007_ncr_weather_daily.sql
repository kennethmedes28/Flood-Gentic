-- Recorded daily weather and river flow, one row per sample point per day (2020 onward). First filled by
-- scripts/load_to_supabase.py from datasets/ncr_weather_daily_2020-2026.csv, then kept current by the nightly
-- "Update datasets" workflow (scripts/update_supabase_from_open_meteo.py). Read by /dashboard, /analytics and the
-- flood risk agent. Needs 006_ncr_locations.sql.
CREATE TABLE IF NOT EXISTS ncr_weather_daily (
    location_id                        integer NOT NULL REFERENCES ncr_locations (location_id),
    date                               date    NOT NULL,
    precipitation_sum_mm               double precision,
    temperature_2m_max_c               double precision,
    temperature_2m_min_c               double precision,
    shortwave_radiation_sum_mjm2       double precision,
    wind_speed_10m_max_kmh             double precision,
    wind_gusts_10m_max_kmh             double precision,
    temperature_2m_max_from_hourly_c   double precision,
    temperature_2m_min_from_hourly_c   double precision,
    river_discharge_m3s                double precision,
    PRIMARY KEY (location_id, date)
);

-- Only the backend's direct Postgres connection may read or write (no policies on purpose).
ALTER TABLE ncr_weather_daily ENABLE ROW LEVEL SECURITY;
