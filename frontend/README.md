# Flood-Gentic frontend

The website: a Next.js 16 / React 19 app with the flood dashboard and the AI Agent Flood Assistant, in English and Filipino. It never
calls the AI services itself; every request goes through the backend API, which keeps the keys. Full design:
[docs/frontend_architecture.md](../docs/frontend_architecture.md). Project overview: [main README](../README.md).

## Pages

| Page | Path | What it shows |
|---|---|---|
| Live view (dashboard) | `/` | Today's weather, the forecast, rain chart, map and nearby cities, after the intro screen |
| Flood level | `/flood` | Rain, river flow and the flood level per city |
| Analytics | `/analytics` | The recorded daily weather since 2020, by year, month or day |
| Satellite | `/satellite` | PAGASA satellite images |
| Evacuation centers | `/evacuation` | The centers on a map, by city and barangay |
| AI Agent Flood Assistant | `/assistant` | Chat by text, voice or photo (needs a Google or Facebook sign-in; emergencies are always answered) |
| Contacts | `/contacts` | Emergency hotlines by city |
| Privacy, data deletion | `/privacy`, `/data-deletion` | The legal pages |

The round menu button (draggable, on every page) opens the pages and the settings: language, theme, text size, icon size, hand cursor
and the help guide. First-time visitors see an arrow and a short hint pointing at it.

## Run locally

```bash
cd frontend
npm install
cp .env.local.example .env.local      # then fill in the values (see the comments in the file)
npm run dev                           # http://localhost:3000; the backend must run on NEXT_PUBLIC_API_URL
```

From the repository root, `make run` starts the backend and the frontend together.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm run start` | Production build, then serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run format` | Prettier on the `.ts` and `.tsx` files |

## Settings

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | The backend's address (`http://localhost:8000` locally, the Railway address in production) |
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project address, for Google and Facebook sign-in |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Supabase's **publishable** key |

Every `NEXT_PUBLIC_` variable is built into the website and visible to every visitor, so never put a secret in one (no Meta key, no
Supabase secret key). Leave the Supabase variables unset for local work and start the backend with `REQUIRE_AUTH=false`.

## Deployment

The website is deployed on **Vercel**, built from this folder. It talks only to the backend, which uses **two deployment platforms**:

```
Browser ──> Vercel (this website) ──> Railway (backend API) ──── voice ──────────────────────────> Meta API
                                              └── chat models + photo check ──> Render (Muse proxy) ──> Meta API
```

Meta's API refuses the chat-model and SAM calls sent from Railway, so the backend sends them through a small proxy on Render; this was
solved on 4 November 2026 and needs no change in the website. The proxy is on Render's free plan and sleeps when idle; when a question
needs it while it is asleep, the assistant shows "Waking up the AI service, this can take up to a minute…" under the typing dots and the
answer follows when it is up. Details: [render_proxy/README.md](../render_proxy/README.md) and
[docs/deployment_workflow_guide.md](../docs/deployment_workflow_guide.md).
