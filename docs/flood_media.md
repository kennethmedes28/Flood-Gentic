# Flood Media Check

How a photo of a street is checked for flood water. Photos only: video analysis, the webcam socket and the water-depth estimate were removed, because the backend runs on a CPU-only host and uses no local vision models.

## 1. What it does

SAM 3.1 (Meta's Segment Anything model, `sam-3.1`) finds every object that matches a short phrase in a picture and returns a box
and a pixel mask for each. The flood media agent asks for three things and turns the answers into a short summary:

| Phrase | Used for |
|---|---|
| `flood water` | Share of the picture covered by water |
| `person` | How many people are visible, and how many stand in the water |
| `vehicle` | How many vehicles are visible, and how many are in the water |

SAM takes one phrase per request, so this is three requests (sent in parallel). A person or vehicle counts as "in the water" when at least half
of the ground around its base is water; the base is checked, not the body, because SAM leaves the object out of the water mask.

```mermaid
flowchart LR
    M[Photo] --> S["SamClient<br/>video/sam_client.py"]
    S -->|"flood water / person / vehicle"| A["SAM 3.1<br/>api.meta.ai/v1/responses"]
    A -->|boxes + masks| P[meta_sam_parser]
    P --> F["flood_scene.py<br/>coverage, counts, level"]
    F --> G["flood_media_agent.py<br/>fixed bilingual text"]
```

## 2. Code

| File | Role |
|---|---|
| `backend/video/sam_client.py` | `SamClient`: sends a phrase plus an image (URL, file or bytes) to `POST /v1/responses` and parses the streamed answer with `meta_sam_parser` |
| `backend/video/flood_scene.py` | Pairs boxes with masks, draws water on a coarse grid, and builds a `FloodSceneReport`. `analyze_flood_media()` is the blocking entry point |
| `backend/agents/flood_media_agent.py` | `answer_flood_media_question(media, context)` returns an `AgentReply` with English and Filipino text. No chat model is used |
| `backend/tests/test_flood_media.py` | Tests with made-up detections (no SAM calls) |

`FloodSceneReport` fields: `media_kind` (always `image`), `frames_checked` (always 1), `water_coverage` (share under water, 0 to 1), `peak_water_coverage`,
`frames_with_water`, `level` (`none`, `some`, `widespread`), `people`, `people_in_water`, `vehicles`, `vehicles_in_water`, `notes`.
Levels use the typical coverage: under 3% is `none`, 3% to 20% is `some`, 20% and above is `widespread`. These are starting values, to be tuned on real photos.
Matches with a confidence under 0.5 are ignored.

## 3. SAM API facts used (reviewed 2026-10-29)

- `POST https://api.meta.ai/v1/responses`, model `sam-3.1`, same `MUSE_API` key as the chat models, streamed. The answer is special-token text that `meta_sam_parser` (`pip install meta-sam-parser`) turns into typed records.
- Images: public URL or base64 data URL. Each phrase is a separate request. Pricing and rate limits are on Meta's pricing page, not reviewed here.
- A request with no match is valid and returns nothing.

## 4. Tested so far

- A photo of a flooded street in Quezon City (CC licence, Wikimedia Commons, 960x720): water found at 33% coverage, 17 people, 10 of them in the water, no vehicles. This matched the picture by eye.
- Not tested: night or low-light pictures, muddy or very shallow water, vehicles (none in the test photo), accuracy across many photos.

## 5. From the assistant page

The `/assistant` page sends photos to the chat, which hands them to this agent:

- **Photo:** scaled to 640 px wide JPEG in the browser and sent as base64 in the `image` field of `POST /chat/stream` (up to 2 MB, checked on its first bytes).
- **What the checkbox does:** off (the default) looks for water only: 4 SAM requests (see section 9). On (`detailed`) it also counts people and vehicles, 2 more requests.
- **Files:** saved under a random name in `MEDIA_UPLOAD_DIR` with owner-only permissions, deleted when the answer is done. Photo checks have their own `MEDIA_PER_HOUR` limit (default 20).
## 6. In the chat graph

`ask(graph, question, thread_id, media={...})` in `langgraph_orchestrator/graph.py` sends a photo with a message. The `media` dictionary is
`{"kind": "image", "url": "https://..." or "path": "...", "include_people_and_vehicles": True/False}` (the last one is optional and true by default; false looks for water only):

- A message with media goes to the `flood_media` node (an emergency message still wins and gets the fixed emergency reply). An empty question is replaced by a default one.
- Only one of `url` or `path`. A URL must be `https` and public (localhost, private and link-local addresses are refused). A path must be a file inside the upload folder (`MEDIA_UPLOAD_DIR`, default `<temp dir>/flood_gentic_uploads`). Anything else gets a polite "I could not use that file" reply.
- The state keeps only this small reference, and every node clears it, so the file is checked once and is not repeated on the next message.
- Tested end to end through the graph: a photo saved in the upload folder gave the water and people text; a path outside the folder was refused.

## 7. Safety rules

- The result is unverified evidence. It never overrides PAGASA or NDRRMC information, and it never says a road is safe or how deep the water is.
- Every reply says it is an automatic check, that the picture may be old, that depth cannot be told from it, and to call 911 if someone is in danger.
- A place given by the user is repeated as "not confirmed from the picture". The picture does not set the user's location.

## 9. Augmented SAM (no training)

SAM 3.1 is Meta's hosted model, so its weights cannot be fine-tuned from here. Instead the water check asks it more than once and
combines the answers (`video/flood_scene.py`):

- **Several phrases** (`WATER_CONCEPTS`): "flood water" and "muddy water". SAM finds different parts of the water depending on the words.
- **A mirrored photo** (`MIRROR_PHOTOS`): the photo is also checked mirrored left to right, and the masks are mirrored back. Photos with an EXIF
  rotation tag are not mirrored, because the two views might not line up.
- **A vote** (`WATER_VOTES_NEEDED`, 1): a spot is water when at least that many of the requests found it.
- **Cost:** a photo check is 4 water requests instead of 1; they run at the same time, so a photo took about 1 second longer
  (4.2 s against 3.0 s).

**How the settings were chosen.** `scripts/evaluate_flood_media.py` scores every combination of phrases ("flood water", "muddy water", "water",
"flooded road"), mirroring, vote and confidence cut-off against hand-drawn water masks. It used 60 photos of the public "Flood Area Segmentation"
set (290 flood photos with masks), chose on 30 and checked on the other 30, at 640 px wide as the page sends them. Every SAM answer is saved in
`evaluation/flood_media/cache/` (not in git, like the photos), so scoring again costs nothing. Overlap (IoU) with the hand-drawn water, on the check half:

| Setting | SAM requests per photo | IoU | Precision | Recall |
|---|---|---|---|---|
| "flood water" (before) | 1 | 0.723 | 0.972 | 0.737 |
| + "muddy water" | 2 | 0.752 | 0.967 | 0.769 |
| + mirrored photo (now the default) | 4 | 0.764 | 0.964 | 0.783 |
| all four phrases, mirrored | 8 | 0.765 | 0.963 | 0.786 |

SAM is precise (what it marks is water about 97% of the time) but misses about a quarter of the water; each extra request finds some of what
the others missed, so the vote is 1. More than 4 requests stopped paying off. The confidence cut-off gave the same result at 0.3 and 0.5 and a worse
one at 0.7, so it stays at 0.5 (which also keeps the people and vehicle counts as they were).

**Limits of this measurement.** Almost all photos in that set are taken from the air (drones, helicopters); people send street-level photos. The
ranking of the settings should carry over, but the "some" (3%) and "widespread" (20%) cut-offs were not tuned, because the share of a picture covered by
water depends on the viewpoint. Every photo in the set shows a flood, so false alarms on dry streets were not measured; "muddy water" could mark a
muddy river on a normal day. On one real street photo the new setting gave the same 16% as before. A labelled set of Philippine street-level photos
(`docs/evaluation_rubric.md`) would allow tuning the cut-offs and measuring false alarms.

Run it again (from `backend/`): `uv run python ../scripts/evaluate_flood_media.py --dry-run` shows how many SAM requests are needed, and
`--score-only` scores from the saved answers without any request. The photos go in `evaluation/flood_media/source/Data/raw/{images,masks}`.

## 10. Asking anything about a picture

Words sent with a photo are the person's question ("How many cars are stuck?", "Hanggang saan ang baha?"), and they are answered,
not just the share of water. `agents/flood_media_agent.py`:

1. **SAM measures first**, as before (water, and people and vehicles when the checkbox is ticked). These numbers stay the grounded part of the reply.
2. **The chat model answers the question.** The project's chat model (`muse-wonder-1.0`, which can read images) gets the photo at most 1024 px wide, the question and the measurements
   in words, with the rules in `ANSWER_RULES`: answer only what can be seen and say when it cannot; same language as the question; never say a road
   is safe to cross and never encourage entering flood water; no depth in centimetres (a depth relative to people or cars
   is allowed, called a rough look); do not identify people or read plates; say "call 911 now" first if someone looks in danger.
   It is told when people and vehicles were not counted, so "not counted" is not taken as "none there".
3. **The reply** is the model's answer, then "Measured by the automatic check:" with the fixed bilingual report and the safety text.

A picture sent without words gets the fixed report only, with no model call. If the model fails, answers nothing, or the hourly model budget
(`MODEL_CALLS_PER_HOUR`) is used up, the fixed report is given instead. Cost: one model call per question, on top of the SAM requests. The progress line says
"Looking at your photo to answer your question".

**Tried through the real app** with a street photo and the checkbox off, about 16 seconds each:
"How many robots are there, and can a car drive through this street?" was answered with the three robots and one person it could see, a depth only
"around the lower legs, as a rough look", and that a picture cannot show whether a car can pass, so not to cross. "Hanggang saan ang baha? Ligtas bang
lumusong dito?" was answered in Filipino the same way. The model's answers are not deterministic and have not been measured on a labelled set.

