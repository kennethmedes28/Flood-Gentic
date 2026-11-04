# Muse proxy

**The small gateway that keeps Flood-Gentic's Meta-powered features working in production.** It is a FastAPI app of about 100 lines
that passes the backend's **chat-model** and **SAM 3.1** calls on to Meta's API, and nothing else.

Part of [Flood-Gentic](../README.md): an AI flood assistant for Metro Manila, built on the Meta Model API. The live app is at
[flood-gentic.vercel.app](https://flood-gentic.vercel.app/).

## Why it exists

Meta's API refuses the chat-model and SAM requests that the backend sends from its Railway server (every chat model answered
`model_not_found` and every SAM request failed), while the same key works from Render and from a local machine. Routing those two kinds
of calls through this proxy on Render **solved it on 4 November 2026**: chat answers and photo checks work again in the deployed app.
Voice (speech-to-text) works directly from Railway, so it is not proxied. The full story, with what was tested and ruled out, is in the
[deployment guide](../docs/deployment_workflow_guide.md#metas-models-from-railway-solved-with-the-render-proxy).

```
Browser (Vercel) ──> Railway backend ──── voice (speech-to-text) ────> api.meta.ai
                           │
                           └─ chat models + SAM ──> Render: muse-proxy ──> api.meta.ai
                              (Bearer MUSE_PROXY_SECRET)   (adds Bearer MUSE_API)
```

## What it does, and what it refuses

- **Forwards only** `POST /v1/chat/completions` and `POST /v1/responses` (SAM, streamed back as it arrives). Anything else is a 404,
  so the proxy is not an open door to Meta's API.
- **The Meta key stays on Render.** The backend sends a separate shared secret (`MUSE_PROXY_SECRET`) as `Authorization: Bearer ...`;
  the proxy checks it in constant time and replaces it with the real key. A missing or wrong secret is a 401 before Meta is called.
- **Logs** show only the path, Meta's status code and the time taken, never the body or a key.
- `GET /health` needs no secret and only says whether the key and secret are set.

## Settings

| Where | Variable | Value |
|---|---|---|
| Render (this service) | `MUSE_API` | Meta's API key |
| Render (this service) | `MUSE_PROXY_SECRET` | A long random secret |
| Railway (backend) | `MUSE_PROXY_URL` | This service's address, e.g. `https://muse-proxy.onrender.com` |
| Railway (backend) | `MUSE_PROXY_SECRET` | The same secret |

Railway keeps its own `MUSE_API` for voice. With `MUSE_PROXY_URL` unset (local work), the backend calls Meta directly
(`backend/utils/muse_endpoint.py`), so a developer machine needs no proxy.

The service is defined in [`render.yaml`](../render.yaml) at the repository root (Singapore, free plan). So the app uses **two deployment
platforms** for its backend: the API on Railway and this proxy on Render (the website is on Vercel).

## Waking up

The free plan sleeps after about 15 minutes without calls, and waking takes up to about a minute, longer than the chat model's
45-second timeout. So the backend checks `GET /health` before a question that needs the chat model or SAM
(`backend/utils/proxy_wakeup.py`). If the proxy is asleep, the chat shows "Waking up the AI service, this can take up to a
minute…" (in English and Filipino) and waits until `/health` answers, up to about 90 seconds, then answers normally.
After it has answered, it is not checked again for 5 minutes. Questions answered from data (hotlines, flood risk,
evacuation centers) never wait for it. A paid plan keeps it awake and removes the wait.

## Run and test locally

```bash
cd render_proxy
pip install -r requirements.txt pytest
MUSE_API=... MUSE_PROXY_SECRET=... uvicorn app:app --port 8100   # then set MUSE_PROXY_URL=http://localhost:8100 in the backend
python -m pytest tests -q                                          # Meta is faked: no key or network needed
```
