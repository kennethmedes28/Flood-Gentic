# API reference

The HTTP API, its optional settings and the staff endpoints. Part of the [Flood-Gentic README](../README.md).

## The API

| Method | Path | Purpose |
|---|---|---|
| POST | `/chat` | One message in, one reply out (needs a sign-in, except an emergency message). Send back the returned `thread_id` to continue the conversation. `blocked` is true when the message was stopped by the input guard |
| POST | `/chat/stream` | The same, as one JSON line per step: what the assistant is doing, then the reply. Also takes a photo as base64 (`image`) |
| GET | `/dashboard` | Weather, rain, river flow and a flood risk level for each of the 17 cities, from the latest recorded day (today so far; refreshed four times a day) |
| GET | `/analytics/weather` | Long-run rain, temperature, river flow and wind since 2020 for Metro Manila or one city, grouped by year, month or day (`city`, `year`, `month`, `day` filters) |
| GET | `/weather/forecast`, `/weather/stream` | The Tomorrow.io forecast, stored once a day; the stream sends it live as server-sent events |
| POST, GET | `/reports` | Submit or list community flood reports (unverified) |
| POST | `/requests` | Submit a supply or assistance request (write only) |
| GET, PATCH | `/staff/...` | Staff only: summary counts, the full lists, and verifying, rejecting or assigning items. Needs `STAFF_API_KEY` |
| GET | `/evacuation-centers` | Search the centers by city and barangay |
| GET | `/places/evacuation-centers`, `/places/contacts` | The full lists behind the Evacuation and Contacts pages, from Supabase (the pages keep a built-in copy as a fallback) |
| GET | `/advisories/latest` | Current PAGASA bulletins |
| GET | `/me/usage` | The signed-in user's usage against the fair-use limits |
| GET | `/health`, `/health/ready` | What works right now |
| WS | `/ws/voice` | Live speech-to-text |

```bash
curl -s localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message": "Nasa Divisoria, Manila ako. Baha hanggang tuhod. Saan ang pinakamalapit na evacuation center?"}'
```

Optional settings (environment variables): `CORS_ORIGINS`, `CHECKPOINTER` (`postgres` or `memory`), `ENABLE_RAG` (off by default),
`TRUST_PROXY_HEADERS`, `USER_REQUESTS_PER_DAY` and the other fair-use limits, `UNLIMITED_EMAILS` (tester accounts that skip the per-user limits; see [Sign-in and fair use](sign_in_and_fair_use.md)), `CHAT_PER_MINUTE`, `REPORTS_PER_HOUR`, `REQUESTS_PER_HOUR`, `MEDIA_PER_HOUR` (photo checks, each of which makes real SAM API calls),
`WEATHER_PER_MINUTE`, `ORS_API_KEY`, `STAFF_API_KEY`, `STAFF_PER_MINUTE`, `MEDIA_UPLOAD_DIR`.

## Monitor reports and requests (staff)

Set a long random `STAFF_API_KEY` in `backend/.env` to switch on the `/staff` endpoints. Without it they do not exist.
Generate one with `python -c "import secrets; print(secrets.token_urlsafe(32))"`, keep it private, and send it as a bearer token:

```bash
curl -s localhost:8000/staff/summary -H "Authorization: Bearer $STAFF_API_KEY"                  # what is waiting
curl -s 'localhost:8000/staff/requests?status=unverified' -H "Authorization: Bearer $STAFF_API_KEY"
curl -s -X PATCH localhost:8000/staff/requests/<id> -H "Authorization: Bearer $STAFF_API_KEY" \
  -H 'Content-Type: application/json' -d '{"status": "assigned"}'
```

`/staff/summary` shows totals by status and city and how long the oldest unreviewed item has waited, so a growing backlog is easy to spot.
See [docs/backend_architecture.md](backend_architecture.md) section 4.
