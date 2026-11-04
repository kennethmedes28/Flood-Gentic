# Flood-Gentic backend

The FastAPI API behind the website: the LangGraph chat graph and its agents (weather, flood risk, evacuation, routes, hotlines,
photos), the dashboard and analytics data, reports and help requests, voice, sign-in checks and the per-user API call limits.
The full design is in [docs/backend_architecture.md](../docs/backend_architecture.md); the project overview is in the
[main README](../README.md).

## Run and test

```bash
cd backend
uv sync                                    # once; includes torch and faiss-cpu
cp .env.example .env                       # then fill in the keys (see the comments in the file)
uv run uvicorn main:app --reload --port 8000
uv run python -m pytest tests -q           # unit tests; fakes only, no keys, database or network needed
```

From the repository root, `make run` starts the backend and the frontend together.

## Deployment: two platforms

The backend runs on **Railway** (Docker image from `Dockerfile`, CPU only: Railway does not support GPUs, so it is slower than a local
machine with a GPU). Meta's API refuses the chat-model and SAM calls sent from Railway, so those calls go through the **Muse proxy on
Render** ([render_proxy/](../render_proxy/README.md)), which holds the Meta key and forwards them. Voice (speech-to-text) still calls Meta
directly from Railway.

```
Railway backend ──── voice (speech-to-text) ──────────────────> api.meta.ai
       └── chat models + SAM ──> Render: muse-proxy ──> api.meta.ai
           (Bearer MUSE_PROXY_SECRET)   (adds Bearer MUSE_API)
```

| Variable on Railway | What it does |
|---|---|
| `MUSE_API` | Meta's key, used for voice (and for everything when there is no proxy) |
| `MUSE_PROXY_URL` | The proxy's address. When set, chat-model and SAM calls go there (`utils/muse_endpoint.py`) |
| `MUSE_PROXY_SECRET` | The secret shared with the proxy; the Meta key is never sent from here |

Without `MUSE_PROXY_URL` (local work) the backend calls Meta directly, so no proxy is needed on a developer machine.

The proxy is on Render's free plan and sleeps when idle. Before a question that needs the chat model or SAM, the chat stream checks it
and, if it is asleep, shows "Waking up the AI service, this can take up to a minute…" and waits for it, up to about 90 seconds
(`utils/proxy_wakeup.py`). Setup and variables: "Render: the Muse proxy" in
[docs/deployment_workflow_guide.md](../docs/deployment_workflow_guide.md).
