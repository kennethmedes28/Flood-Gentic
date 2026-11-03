-- Usage counters for the per-user spending caps (src/services/usage.py). One row per user, metric and period, so a
-- counter is increased with one atomic statement and never needs a read-then-write. The backend also runs this at start-up.
--   scope   a Supabase user id, or 'all' for the counters of the whole app
--   metric  requests, uploads, voice_sessions, sam_requests (daily) or tokens (monthly)
--   period  the Manila day ('2026-11-03') for daily counters, the Manila month ('2026-11') for monthly ones
CREATE TABLE IF NOT EXISTS usage_counters (
    scope       text        NOT NULL,
    metric      text        NOT NULL,
    period      text        NOT NULL,
    used        bigint      NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, metric, period)
);

-- Only the backend's direct Postgres connection may read or write (no policies on purpose).
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
