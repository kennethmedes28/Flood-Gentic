# Muse proxy (Render)

A small FastAPI app that forwards the backend's **chat-model** and **SAM** calls to Meta's API. It exists because Meta's API
refuses those calls from Railway (every chat model answers `model_not_found`, every SAM request fails), while the same key
works from Render. Voice works from Railway, so it is not proxied.

```
Browser (Vercel) ──> Railway backend ──── voice (speech-to-text) ────> api.meta.ai
                           │
                           └─ chat models + SAM ──> Render: muse-proxy ──> api.meta.ai
                              (Bearer MUSE_PROXY_SECRET)   (adds Bearer MUSE_API)
```

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
(`backend/utils/muse_endpoint.py`).

The service is defined in `render.yaml` at the repository root (Singapore, free plan). The free plan sleeps after about
15 minutes without calls; the first call after that waits while it wakes up, which can be longer than the chat model's
45-second timeout, so that one question may fail once.

## Run and test locally

```bash
cd render_proxy
pip install -r requirements.txt pytest
MUSE_API=... MUSE_PROXY_SECRET=... uvicorn app:app --port 8100   # then set MUSE_PROXY_URL=http://localhost:8100 in the backend
python -m pytest tests -q                                          # Meta is faked: no key or network needed
```
