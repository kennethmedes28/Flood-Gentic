# Data

Where the weather and river data come from and how it is kept current. Part of the [Flood-Gentic README](../README.md).

# Data

**Weather and river history.** The weather and flood-feature tables in Supabase are updated four times a day (00:30, 06:00, 12:00 and 18:00 Philippine time) by
[`update-datasets.yml`](../.github/workflows/update-datasets.yml), straight from Open-Meteo, with no CSV files involved. The 00:30 run stores the day that just
ended; the other three store today so far. Every run fetches the last 7 days again and replaces them with Open-Meteo's revised values, so the latest day on the dashboard is today and
becomes final after midnight. It never deletes anything. The workflow needs the repository secrets `SUPABASE_PROJECT_REF`, `SUPABASE_PASSWORD` and
`SUPABASE_POOLER_HOST`. Details: [docs/dataset_updates.md](dataset_updates.md).

**Weather forecast.** [`fetch-tomorrow-forecast.yml`](../.github/workflows/fetch-tomorrow-forecast.yml) fetches the Tomorrow.io forecast for the
17 cities once a day, just after midnight Philippine time, and stores it in Supabase. A city that already has today's forecast is skipped and a
stored forecast is never replaced, so the API and the workflow never fetch the same day twice (17 of the 500 free requests a day). It needs the
repository secret `TOMMORROW_IO_API` as well as the three Supabase ones. Run it yourself with `python3 scripts/fetch_tomorrow_forecast.py [--dry-run]`.

**What the pages show.** The dashboard and flood level pages read rain, river flow and the risk level from the Supabase tables (the latest recorded day,
labelled "Today so far" while the day is in progress; the API answers 503 if the database cannot be read) and the weather now and the forecast from the stored
Tomorrow.io rows. The flood risk level is a rule-based estimate from the recorded day and does not use the forecast.

To run the dataset update yourself: `uv run python ../scripts/update_supabase_from_open_meteo.py` from `backend/`
(add `--dry-run` to only see the plan, or `--refresh-days 7` to re-fetch the last 7 days).
