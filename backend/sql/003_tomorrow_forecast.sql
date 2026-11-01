-- Daily weather forecast from Tomorrow.io, one row per city per day (Manila calendar day).
-- Run once on the Supabase database. The API (src/services/tomorrow_forecast.py) writes here at most once per
-- city per day: the primary key plus "ON CONFLICT DO NOTHING" means a row that exists is never replaced.
CREATE TABLE IF NOT EXISTS tomorrow_forecast (
    city        text        NOT NULL,                  -- the key used by the API, e.g. 'quezon city'
    fetched_on  date        NOT NULL,                  -- the Manila day the forecast was fetched
    fetched_at  timestamptz NOT NULL DEFAULT now(),
    hourly      jsonb       NOT NULL,                  -- next 120 hours: [{"time": ..., "values": {...}}, ...]
    daily       jsonb       NOT NULL,                  -- next days:      [{"time": ..., "values": {...}}, ...]
    PRIMARY KEY (city, fetched_on)
);

-- Only the backend's direct Postgres connection may read or write (no policies on purpose).
ALTER TABLE tomorrow_forecast ENABLE ROW LEVEL SECURITY;
