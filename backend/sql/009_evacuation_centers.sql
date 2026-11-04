-- Evacuation centers, from datasets/ncr_evacuation_centers.csv. First filled by scripts/load_to_supabase.py, and new
-- centers are added by scripts/sync_datasets_to_supabase.py (append only). Read by /evacuation-centers,
-- /places/centers and the evacuation and route agents.
-- location_id is the city's id in ncr_locations (the same for every center of a city), so a center is identified by
-- its city, barangay and name instead.
CREATE TABLE IF NOT EXISTS evacuation_centers (
    location_id       integer NOT NULL,
    city              text    NOT NULL,
    barangay          text    NOT NULL,
    name              text    NOT NULL,
    type              text,
    status_in_source  text,
    source            text,
    latitude          double precision NOT NULL,
    longitude         double precision NOT NULL,
    notes             text,
    UNIQUE (city, barangay, name)
);

-- Only the backend's direct Postgres connection may read or write (no policies on purpose).
ALTER TABLE evacuation_centers ENABLE ROW LEVEL SECURITY;
