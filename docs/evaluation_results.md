# Evaluation

Measured results from the project's own tests and experiments. Part of the [Flood-Gentic README](../README.md).

# Evaluation

These are measured results from the project's own tests and experiments. The sets are small, so read them as indications, not guarantees.
How answers are judged before release (safety criteria are gates) is in [docs/evaluation_rubric.md](evaluation_rubric.md).

**Document search: choosing the embedding model.** 214 chunks from the preparedness manual, the MMFMP report and a Marikina sheet, 9 scored questions in English and Filipino:

| Model | Dimensions | recall@5 | MRR | MRR English | MRR Filipino |
|---|---|---|---|---|---|
| bge-m3 | 1024 | 0.78 | 0.66 | 0.75 | 0.55 |
| **multilingual-e5-large (used)** | 1024 | **1.00** | **0.79** | 0.85 | 0.71 |
| multilingual-e5-base | 768 | 0.89 | 0.75 | 0.84 | 0.64 |

**Flood photos: how much SAM finds.** Overlap (IoU) with hand-drawn water on 30 held-out photos from a public flood-segmentation set. Adding phrases and a mirrored copy of the photo,
with no training, raises it; more than 4 requests stopped paying off:

| Setting | SAM requests per photo | IoU | Precision | Recall |
|---|---|---|---|---|
| "flood water" only | 1 | 0.723 | 0.972 | 0.737 |
| + "muddy water" | 2 | 0.752 | 0.967 | 0.769 |
| **+ mirrored photo (used)** | 4 | **0.764** | 0.964 | 0.783 |
| four phrases, mirrored | 8 | 0.765 | 0.963 | 0.786 |

SAM is precise (about 97% of what it marks is water) but misses about a quarter of the water. Most photos in that set are aerial, not street-level, so the ranking
should carry over but the absolute numbers may not.

**Speed.** Median cold time per agent over 5 runs (benchmarked with Muse Spark 1.3 on a laptop on 2026-10-28; the app uses `muse-wonder-1.0` first and falls back to the Muse Spark models when it is unavailable; see `MUSE_CHAT_MODEL` and `MUSE_FALLBACK_MODELS` in
[docs/backend_architecture.md](backend_architecture.md)). Agents that do not call the model answer in milliseconds to a few seconds,
and the model agents take about 7 seconds at the default reasoning setting:

| Agent | Time | Uses the chat model? |
|---|---|---|
| emergency, contacts, location | 1 to 2 ms | no |
| report | 91 ms | no |
| evacuation | 2.18 s | no |
| route (fallback path) | 2.32 s | no |
| flood risk | 3.95 s | no |
| weather | 7.13 s | yes |
| documents | 7.99 s | yes |

Setting the model's reasoning effort to `minimal` cut output tokens about 4 to 5 times and the answer time to about 2 to 4 seconds in a small comparison. The cross-encoder reranker
added about 18 seconds per question on that laptop, so it is **off in production** (`RERANKER_MODEL=none`). Quality was not compared across models or settings. Full method and limits:
[docs/agent_benchmarks.md](agent_benchmarks.md).

**Tests.** 355 backend tests (agents, the chat graph with a fake model, the API, sign-in, fair-use limits, the cache) run with no network, database or model, and
GitHub Actions runs them on every push together with the frontend type check and build and a Docker image build.
