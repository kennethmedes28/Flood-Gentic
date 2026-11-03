-- Emergency hotlines shown on the Contacts page, copied from corpus/ph_emergency_contacts.csv by
-- scripts/sync_datasets_to_supabase.py. Numbers are stored exactly as written in the list.
CREATE TABLE IF NOT EXISTS emergency_contacts (
    position      integer NOT NULL,            -- the row's place in the list, so the page keeps the list's order
    agency        text    NOT NULL,
    category      text    NOT NULL,
    contact_type  text    NOT NULL,            -- Hotline, Landline, Mobile, Text, ...
    number        text    NOT NULL,
    notes         text    NOT NULL DEFAULT '',
    cities        text[]  NOT NULL DEFAULT '{}', -- the cities a local hotline serves; empty for national hotlines and hospitals
    UNIQUE (agency, contact_type, number)
);

-- Only the backend's direct Postgres connection may read or write (no policies on purpose).
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
