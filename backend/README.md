# Flood-Gentic backend

**The brain of Flood-Gentic.** A FastAPI service that takes a question, works out what it is about, answers it from official data and
fixed rules, and calls Meta's Muse and SAM 3.1 models only where they add something: understanding a question, reading a photo,
hearing a voice.

Part of [Flood-Gentic](../README.md): an AI flood assistant for Metro Manila, built on the Meta Model API and live at
[flood-gentic.vercel.app](https://flood-gentic.vercel.app/).

## What it does

- **Routes every message without a model.** Keyword routing picks the agent (an emergency always wins), and a message with several requests
  is split into one question per topic. See [How an answer is chosen](../docs/how_an_answer_is_chosen.md).
- **Answers the critical questions from rules and data**, so they are fast, the same every time, and never invented: evacuation centers that
  are not flooded, flood risk from rain, river flow and PAGASA, routes that avoid flooded streets, hotlines, community reports.
- **Uses Meta's models where they help:**

  | Model | Used for | Code |
  |---|---|---|
  | Muse Wonder 1.0 | The main chat model (weather, preparedness, photo questions) | `utils/llm.py` |
  | Muse Spark 1.3 and 1.2 | Fallbacks, tried in order if Wonder is unavailable | `utils/llm.py` |
  | SAM 3.1 | Photo flood check and object search, with boxes and confidence | `video/` |
  | Muse Voice Transcribe 1.0 | Live speech-to-text over a WebSocket | `voice/` |

- **Does not guess.** When the data is missing or unreliable it gives a fixed safety answer; an emergency gets the 911 text and hotlines
  with no model call; secrets and prompt-injection attempts are blocked before anything runs.
- **Protects the real API calls.** Google and Facebook sign-in is checked here, with per-account fair-use limits
  ([Sign-in and fair use](../docs/sign_in_and_fair_use.md)).

The full design is in [backend architecture](../docs/backend_architecture.md); the HTTP API is in the [API reference](../docs/api_reference.md);
where things live is in [Repository layout](../docs/repository_layout.md).

## Run and test

```bash
cd backend
uv sync                                    # once; includes torch and faiss-cpu
cp .env.example .env                       # then fill in the keys (see the comments in the file)
uv run uvicorn main:app --reload --port 8000
uv run python -m pytest tests -q           # unit tests; fakes only, no keys, database or network needed
```

From the repository root, `make run` starts the backend and the frontend together. Every setting, and the full hybrid RAG pipeline on your
own device, are in [Getting started](../docs/getting_started.md).

## Deployment: two platforms

The backend runs on **Railway** (Docker image from `Dockerfile`, CPU only). Meta's API refuses the chat-model and SAM calls sent from
Railway, so those calls go through a small **Muse proxy on Render** ([render_proxy/](../render_proxy/README.md)), which holds the Meta
key and forwards them; this solved the problem on 4 November 2026. Voice still calls Meta directly from Railway.

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

Without `MUSE_PROXY_URL` (local work) the backend calls Meta directly, so no proxy is needed on a developer machine. The proxy is on
Render's free plan and sleeps when idle: before a question that needs it, the chat stream checks it and, if it is asleep, shows "Waking up
the AI service, this can take up to a minute…" and waits for it, up to about 90 seconds (`utils/proxy_wakeup.py`). Setup and variables:
"Render: the Muse proxy" in the [deployment guide](../docs/deployment_workflow_guide.md).
