# Deployment and Workflow Guide

How Flood-Gentic is configured, run and kept up to date. The target architecture (Railway, Vercel, Supabase) is in
`docs/backend_architecture.md` section 9 and `docs/frontend_architecture.md` section 8; this guide covers what exists today.

## 1. What is automated today

| What | How | Where |
|---|---|---|
| Daily weather datasets (Supabase tables) | GitHub Actions, every day at 20:00 Philippine time | `.github/workflows/update-datasets.yml`, details in `docs/dataset_updates.md` |
| Daily weather forecast (Tomorrow.io, table `tomorrow_forecast`) | GitHub Actions, every day at 00:10 Philippine time, with a retry at 06:10 | `.github/workflows/fetch-tomorrow-forecast.yml`, runs `scripts/fetch_tomorrow_forecast.py` |
| Running the app locally | `make run`, or `hooks/run_all.sh` (Linux and macOS), `hooks\run_all.bat` (Windows) | `scripts/run_dev.py` starts the API and the frontend and stops both together |
| Everything else (corpus ingestion, FAISS runs, location chunks) | Run by hand from `scripts/` | section 4 below |

The API (`backend/main.py`) and the Next.js frontend run locally with `make run`. The Railway API service, the ingestion worker and the Vercel frontend are planned but not set up.

## 2. Configuration

Secrets live in `backend/.env` (gitignored; never commit it). Variable names only:

| Variable | Used for |
|---|---|
| `SUPABASE_PROJECT_REF`, `SUPABASE_PASSWORD`, `SUPABASE_POOLER_HOST` | Postgres connection through the Supabase transaction pooler (port 6543). `SUPABASE_DB_URL` can be set instead as one connection string |
| `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN` | Supabase REST and management access; not used by the current code. The secret key bypasses row-level security, so keep it out of the browser |
| `MUSE_API` | Muse Spark chat models, the Muse speech-to-text and the SAM photo check (`api.meta.ai`) |
| `TOMMORROW_IO_API` | The Tomorrow.io forecast key (also a repository secret for the forecast workflow). The spelling is the one the code reads |
| `MEDIA_PER_HOUR`, `WEATHER_PER_MINUTE`, `MEDIA_UPLOAD_DIR`, `DATASETS_DIR` | Optional: photo check limit, forecast limit, and where uploads are kept briefly |
| `ORS_API_KEY` | OpenRouteService routing for the route agent |
| `HF_TOKEN`, `EMBEDDING_MODEL` | Downloading and choosing the embedding model |
| `LANGSMITH_KEY`, `LANGSMITH_TRACE`, `LANGSMITH_PROJECT` | LangSmith tracing, see section 6 |
| `GROQ_API_KEY`, `LLAMAINDEX_API_KEY` | Other model providers |

`backend/.env.example` lists the Supabase names, but the `.env.*` rule in `.gitignore` also ignores it, so it is not in the repository.
Remove that rule's effect for the example file (for example with `!.env.example`) if you want it shared.

## 3. Daily workflows

**Datasets.** `update-datasets.yml` runs `cron: "0 12 * * *"` (12:00 UTC = 20:00 Philippine time, no daylight saving) and can be started by hand with **Run workflow**.
GitHub may start it a few minutes late. It runs `scripts/update_supabase_from_open_meteo.py`, which reads the last day of every location from Supabase, fetches only the missing finished days
from Open-Meteo and writes them in one transaction. It commits nothing to the repository. Details, retries and failure handling: `docs/dataset_updates.md` section 6.

**Forecast.** `fetch-tomorrow-forecast.yml` runs at 16:10 UTC (00:10 Philippine time, just after the new Manila day starts) and again at 22:10 UTC as a retry. It runs
`scripts/fetch_tomorrow_forecast.py`, which fetches only the cities that have no forecast stored for today, so the second run normally makes no request. The run is marked failed if a city
could not be fetched.

Set up once, in the repository's Settings, Secrets and variables, Actions: `SUPABASE_PROJECT_REF`, `SUPABASE_PASSWORD`, `SUPABASE_POOLER_HOST` and, for the forecast, `TOMMORROW_IO_API`.
Check a run under the repository's Actions tab; the log shows how many rows were added or which cities were fetched.

## 4. Manual jobs (run from `backend/`)

| When | Command | Notes |
|---|---|---|
| First setup, or a full reload of the datasets | `uv run python ../scripts/load_to_supabase.py` | Empties and reloads the three dataset tables, upserts the FAISS run's chunks. `--dry-run` checks the files only |
| A PDF or the emergency contacts changed | `uv run python ../scripts/ingest_corpus.py --supabase` | Re-embeds the whole corpus (slow, loads the embedding model) and saves a new FAISS run |
| `corpus/ncr_locations.csv` changed | `uv run python ../scripts/refresh_location_chunks.py` | Re-embeds only the 17 location chunks, updates Supabase and saves a new FAISS run |
| `datasets/ncr_locations.csv` changed | `uv run python ../scripts/update_open_meteo_datasets.py --rebuild`, then `load_to_supabase.py` | `location_id` is the key in both daily files and Supabase, so the history must be rebuilt (about 600 API calls, 20 to 30 minutes; rerun the same command to resume after an error) |
| Catch up the datasets by hand | `uv run python ../scripts/update_supabase_from_open_meteo.py --refresh-days 7` | Same as the workflow |

Both `locations` files (`corpus/` and `datasets/`) currently hold the same 17 city points. Change them together.

## 5. Checks before and after a change

- Tests: `uv run --with pytest python -m pytest tests -q` from `backend/` (39 pass at the time of writing).
- Dataset files: both daily CSVs should have the same rows, be sorted by `location_id` then `date`, and have no duplicate `(location_id, date)`.
- Supabase: row counts of `ncr_weather_daily` and `ncr_flood_features_daily` match the CSVs; `chunks` matches the newest FAISS run (359 chunks).
- The weather agent's recent history: `fetch_recent_history("makati")` returns 7 rows.

## 6. LangSmith tracing

Tracing records every chat message as a run in LangSmith so slow or failing agents can be found. It is on when `backend/.env` has
`LANGSMITH_KEY` and `LANGSMITH_TRACE=true`; `LANGSMITH_PROJECT` names the project (default `flood-gentic`). The LangSmith library itself reads
`LANGSMITH_API_KEY` and `LANGSMITH_TRACING`, so `utils/tracing.py` copies the values over when the first agent is imported. Setting
`LANGSMITH_TRACE=false` (or removing the key) turns it off; nothing else changes.

- **What a trace looks like:** `flood-gentic-chat` (tag `flood-gentic`, metadata `thread_id` and `has_gps`) contains `route_message`, the chosen node and,
  inside it, the agent run (`contacts_agent`, `weather_agent` with its `open_meteo_fetch` and `pagasa_fetch` tool runs, and so on). The weather and
  document agents also show their model calls with tokens and timings.
- **Privacy:** one shared client cleans every run before it is sent (`sanitize` in `utils/tracing.py`): phone-number-like digits become `[number]`,
  inputs named like a secret (key, token, password) become `[hidden]`, coordinates are rounded to 2 decimals (about 1 km) and long texts are cut.
  Message text is still sent, so do not trace real users without telling them.
- **Free plan:** one seat, 5,000 base traces a month, 14-day retention (reviewed 2026-10-29). One chat message is one trace. The voice
  socket is not traced, so they do not use the allowance.
- **Tests:** `backend/tests/conftest.py` switches tracing off so test runs never reach LangSmith.
- **Check it:** run a question through the graph and look for the `flood-gentic-chat` run in the LangSmith project, or list recent runs with the `langsmith` client.

## 7. Railway (backend, CPU only)

Railway has no GPU, so the backend runs on CPU. The only models that run inside the backend are the document-search embedder; chat, speech and SAM are Muse API calls. The reranker is turned off in production (`RERANKER_MODEL=none`).

Project `serene-alignment`, environment `production`:

| Resource | What it is for |
|---|---|
| Service `Flood-Gentic` | The backend API, built from the GitHub repo (Docker build: see the Docker step) |
| Volume `flood-gentic-volume` on `Flood-Gentic`, mounted at `/data` (5 GB) | Keeps the Hugging Face model cache, so the embedding model downloads once and not on every deploy |
| Service `Redis` (with its own volume) | The cache and the shared rate limits (`src/cache.py`) |

Variables set on `Flood-Gentic` so far: `HF_HOME=/data/huggingface` (model cache on the volume) and
`REDIS_URL=${{Redis.REDIS_URL}}` (a reference to the Redis service, over Railway's private network). The keys and database
settings from section 2 are still to be added before the first deploy.

Adding or changing a volume makes Railway start a deployment of the service. Until the Dockerfile is in place and the
service's root directory and variables are set, that build fails; that is expected.

## 8. Planned

- Vercel frontend with `NEXT_PUBLIC_API_URL`, and the backend CORS list allowing its domains. The voice socket must be served over `wss`.
- A scheduled job that runs the full ingestion instead of by hand.
