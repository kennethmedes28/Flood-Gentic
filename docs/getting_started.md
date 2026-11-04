# Getting started

Install, configure and run Flood-Gentic on your own machine, including the full hybrid RAG pipeline. Part of the [Flood-Gentic README](../README.md).

# Getting started

Requires Python 3.11+, [uv](https://docs.astral.sh/uv/) and Node.js (for the frontend).

```bash
make install             # backend: uv sync (heavy: includes torch and faiss-cpu); frontend: npm install
```

Create `backend/.env` (it is gitignored; never commit it) with these variables:

| Variable | Used for |
|---|---|
| `MUSE_API` | The chat model, speech-to-text and the flood photo check |
| `SUPABASE_PROJECT_REF`, `SUPABASE_PASSWORD`, `SUPABASE_POOLER_HOST` | Database connection (and the address used to check sign-in tokens) |
| `TOMMORROW_IO_API` | The Tomorrow.io weather forecast, fetched once a day and stored in Supabase (the spelling is the one the code reads) |
| `REQUIRE_AUTH` | `true` (default) needs a Google or Facebook sign-in for the chat, photo check and voice. Use `false` for local work without sign-in |
| `REDIS_URL`, `CORS_ORIGINS` | Optional: the Redis cache and shared limits; the website address(es) allowed to call the API |
| `LANGSMITH_KEY`, `LANGSMITH_TRACE`, `LANGSMITH_PROJECT` | Optional tracing (off in production, so messages are not sent to a third party) |
| `HF_TOKEN` | Embedding model download in `scripts/ingest_corpus.py` |

For the website, copy `frontend/.env.local.example` to `frontend/.env.local` and set `NEXT_PUBLIC_API_URL` (the API address) and the two `NEXT_PUBLIC_SUPABASE_*`
values (the project address and the **publishable** key; never the secret key). Without them the website runs signed-out, so start the backend with `REQUIRE_AUTH=false`.
The Supabase secret and access keys are not used by the app and should not be put on any server.

## Run the app

```bash
make run                 # backend on :8000 and frontend on :3000 together; Ctrl+C stops both
make run-memory          # the same, with conversations kept in memory instead of Postgres
make backend             # only the API (then open http://127.0.0.1:8000/docs)
make frontend            # only the Next.js app
```

Then open http://localhost:3000. On Windows use `hooks\run_all.bat` (same options; see [docs/frontend_architecture.md](frontend_architecture.md)).
The script checks the tools and ports, prints the backend's `/health` so a missing database or key is obvious, and stops both programs together.
Messages sent from the assistant are real API calls to the providers: the chat model and the photo checks call the Muse API.

## Run the tests

```bash
make test                # backend unit tests
make check               # backend tests, then the frontend type check and lint
```

## Try the full hybrid RAG pipeline on your own device

The deployed app keeps the document search **off** (`ENABLE_RAG=false`, and `RERANKER_MODEL=none`), because Railway runs on the CPU
only and the search models would slow every answer down there. Open questions are then answered by the chat model alone and marked
"General guidance (not from the official documents)". To see the **full hybrid RAG pipeline**, where answers come from the stored flood
manuals and cite them like `[1]`, run the backend on your own computer:

- **What you need:** a computer whose CPU can run PyTorch and Hugging Face Transformers (any recent laptop or desktop; no GPU needed),
  with a few GB of free memory (the embedding model alone uses about 1.7 GiB, the reranker adds more), and the backend's `.env` with the
  Supabase settings (the document chunks are read from the `chunks` table) and `MUSE_API`.
- **What runs:** the question is searched two ways at once, by meaning (`intfloat/multilingual-e5-large` embeddings, vector search) and by
  keywords (BM25). The two result lists are merged (Reciprocal Rank Fusion), the best candidates are reordered by a reranker
  (`BAAI/bge-reranker-v2-m3`), and the top passages go to the chat model, which answers from them and cites its sources.

```bash
cd backend
uv sync                                   # installs PyTorch (CPU build), sentence-transformers and the search libraries
echo "ENABLE_RAG=true" >> .env            # turn the document search on (leave RERANKER_MODEL unset to use the reranker)
uv run uvicorn main:app --port 8000       # the first start downloads both models, which can take a few minutes
```

Then ask a preparedness question, for example `"Ano ang dapat gawin kapag may baha?"`, in the assistant (with the frontend running) or
with the `curl` command above. The answer should cite the stored documents and list its sources. To make it lighter on a slow computer,
set `RERANKER_MODEL=none` to skip the reranker (vector search and BM25 still run). Your local backend calls Meta directly, so it needs
no Render proxy.

## Create the tables

The production database already has `reports` and `requests`. On a new database, run these once, in order, in the Supabase SQL editor: `backend/sql/000_reports.sql`, `001_reports_geo.sql`, `002_requests.sql`, `003_tomorrow_forecast.sql`,
`004_emergency_contacts.sql`, `006_ncr_locations.sql`, `007_ncr_weather_daily.sql`, `008_ncr_flood_features_daily.sql` and
`009_evacuation_centers.sql`. The `usage_counters` table (`005`) is created by the API itself at start-up, and the forecast, contacts and
dataset scripts also create their own tables if they are missing (`scripts/load_to_supabase.py` runs `006` to `009`). Fill the evacuation
centers and contacts with `scripts/sync_datasets_to_supabase.py`.
