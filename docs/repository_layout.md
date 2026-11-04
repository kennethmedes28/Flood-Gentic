# Repository layout

Where things are in the repository. Part of the [Flood-Gentic README](../README.md).

# Repository layout

```
backend/                 Python app (uv project); Dockerfile builds the Railway image (see backend/README.md)
  agents/                one module per agent: evacuation, flood risk, route, report, weather, location, flood media ...
                         (reference_data.py: the built-in hotlines and barangay names, generated from the CSVs)
  langgraph_orchestrator/ chat graph, keyword routing, progress events for the stream
  src/api/               the HTTP API: app, routers (chat, dashboard, weather, places, account, reports ...), request models, rate limits
  src/services/          dashboard data, the Tomorrow.io forecast, usage limits and metering, photo uploads
  src/auth.py            checks the Google / Facebook sign-in tokens; src/cache.py is the optional Redis cache
  src/rag/               document ingestion and retrieval (vector + keyword search, reranking)
  voice/  video/         speech-to-text WebSocket; flood photo check with SAM
  sql/                   table scripts for Supabase
  tests/                 unit tests (no network, browser or model needed)
frontend/                Next.js app (React 19, Tailwind 4): dashboard, flood level, evacuation, contacts, satellite, analytics, assistant, privacy
                         (see frontend/README.md)
  src/app/               one folder per page
  src/components/        ui, shell (frame, menu, cursor), and one folder per page
  src/context  hooks  lib  data/    state (including sign-in), reusable logic, plain functions and API clients, static data
render_proxy/            the Muse proxy on Render: forwards the chat-model and SAM calls to Meta (see render_proxy/README.md)
render.yaml              the Render service for the proxy (Singapore, free plan)
corpus/                  source documents and CSVs (evacuation centers, hotlines, locations)
datasets/                daily NCR weather CSVs, kept for reference (the backend does not read them; Supabase is the live copy)
scripts/                 data loading and updates, the Tomorrow.io fetch, the Railway variables helper, run_dev.py
hooks/                   run_all.sh and run_all.bat: start the backend and the frontend together
Makefile                 shortcuts: make run, make test, make check
docs/                    architecture, evaluation, dataset and deployment notes
.github/workflows/       ci.yml (tests and builds), update-datasets.yml (weather, 4 runs a day), fetch-tomorrow-forecast.yml (daily)
```
