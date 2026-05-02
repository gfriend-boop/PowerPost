# PowerPost

PowerPost by PowerSpeak Academy. A LinkedIn voice tool for executives, founders, and emerging leaders. The repo holds the full Phase 1 + Phase 2 codebase:

- Email signup + login with JWT (15-min access + 30-day refresh)
- LinkedIn connection via Unipile hosted auth, with a demo-mode fallback that seeds realistic sample posts when Unipile credentials are not configured
- Conversational onboarding questionnaire (12 steps + reveal + customization)
- Six-archetype voice profile assignment with deterministic scoring + an "alternative archetype" surface for ambiguous signals
- "Workshop a Post" — a true back-and-forth chat experience with PowerPost as a thinking partner. The model chooses one of three stances per turn (clarify, draft, refine) and is hard-constrained to PowerSpeak's content rules
- Hard content rules enforced in both prompts AND post-generation validation: no em-dashes, no broetry, no banned generic phrases. Drafts that violate any are auto-remediated and the validation flags surfaced in response metadata

**Phase 2 adds:**
- **Get Inspired** — personalised idea feed sourced from the user's actual top posts + adjacent themes + voice gaps. Each idea has a "why this" rationale and launches Workshop with a seeded prompt
- **Improve My Draft** — paste a draft (or hand off from Workshop with one click), pick what you want it to do (Just sound like me / Voice / Balanced / Performance / any KPI), get voice-aligned and performance-aligned recommendation paths with explicit tradeoff calls. Accept/reject individually or per path, then optimise (voice, performance, balanced) and finalise
- **Voice + Performance Scoring** — every Workshop draft and every Improve session gets dual 1–10 scores with rationales, evidence post references, and confidence
- **Feedback capture + Learned preferences** — explicit (thumbs / notes) and implicit (accepted/rejected suggestions, finalisations, optimisations) feedback flows into a learned-preferences extractor that proposes user-confirmable patterns. Confirmed preferences inject into every future LLM prompt
- **Alignment Widget** on the dashboard — voice and performance trends, drift detection, and a single recommended action grounded in the user's recent scores
- **Workshop post goal** — every new Workshop session asks "What do you want this post to do?" up front (8 options including "Just sound like me"). The goal is stored on the session and shaped into the LLM's system prompt so the draft and rationale honour it
- **LinkedIn insights widget** — the dashboard now shows posts analysed, top posts by impressions/comments/reactions, 30-day and 6-month totals, and a "What PowerPost noticed" coaching line generated from the user's actual post history (cached for 24h, busted automatically on a fresh post sync). Posts are pulled via cursor-based pagination (up to 500 per sync), and a stale check (>6h since last sync) auto-fires a background re-sync on dashboard load
- **Top post analysis** — every top-post card on the LinkedIn widget is clickable. Opens a modal with the full post, "why this worked" (referencing real phrases and structural choices), the voice traits PowerPost detected in it, and 2-3 carry-forward takeaways with explicit voice-alignment notes. "Workshop a post like this" CTA seeds a new Workshop session
- **Calm thinking states** — every LLM-bound action (Workshop turn, Improve analyze, Optimize, Inspire refresh, Score) uses the shared `ThinkingState` component with rotating coach-voice status messages instead of a generic spinner
- **Light logos on dark surfaces** — header, footer, onboarding splash, and the Workshop coach avatar all use the light-on-dark logo variants

Stack: React + Vite (web) · Node.js + Express (api) · Postgres 16 · Anthropic Claude (LLM) · Unipile (LinkedIn).

---

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up -d
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

- Web: <http://localhost:5173>
- API: <http://localhost:4000>
- Postgres: localhost:5433 (user `powerpost`, password `powerpost`, db `powerpost`)

The first signup auto-starts a 14-day Builder trial. LinkedIn connect runs in demo mode (with seeded sample posts) until you fill in `UNIPILE_API_KEY` and `UNIPILE_DSN` in `.env`. LLM generation runs in echo mode (deterministic stub drafts) until you fill in `ANTHROPIC_API_KEY`.

## Quick start (local Node)

Requires Node 20+ and a running Postgres on `localhost:5433` (or set `DATABASE_URL`).

```bash
npm install
npm install --workspaces
cp .env.example .env
# update DATABASE_URL if your Postgres is elsewhere

npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` starts the API and web in parallel. Stop with Ctrl+C.

## Useful commands

```bash
# from repo root
npm run dev              # api + web concurrently
npm run db:migrate       # apply SQL migrations
npm run db:seed          # load archetypes, snippets, topics, onboarding copy
npm run db:reset         # drop + recreate everything (then run migrate + seed)

npm run api:dev          # just the API
npm run web:dev          # just the web
```

## Environment variables

See `.env.example`. Anything not set has a working fallback for local development.

| Var | Purpose | Required for prod |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | yes |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT signing keys | yes (replace dev values) |
| `ANTHROPIC_API_KEY` | LLM for Workshop a Post | yes for real generation; otherwise echo mode |
| `ANTHROPIC_MODEL_GENERATION` | Generation model | defaults to `claude-sonnet-4-6` |
| `ANTHROPIC_MODEL_PREVIEW` | Preview model (reserved for future use) | defaults to `claude-haiku-4-5` |
| `UNIPILE_API_KEY` / `UNIPILE_DSN` | Unipile credentials | yes for real LinkedIn; otherwise demo mode |
| `UNIPILE_DEMO_MODE` | Force demo mode regardless of keys | optional |
| `WEB_ORIGIN` | CORS origin for the web app | yes |
| `VITE_API_URL` | API base URL the web app targets | yes |

## Repository layout

```
PowerPost/
  api/                  Node + Express + TypeScript
    seeds/              Archetypes, snippets, topics, onboarding copy (JSON)
    src/
      config.ts
      db/               pool.ts, migrate.ts, seed.ts, reset.ts, migrations/
      middleware/       auth.ts, error.ts
      routes/           auth, voice-profile, linkedin, content, workshop, webhooks
      services/
        archetype.ts    Six-archetype scoring engine
        unipile.ts      Unipile hosted auth + post fetch (with demo fallback)
        llm/
          client.ts     Provider-agnostic LLMClient interface
          anthropic.ts  Anthropic adapter + EchoClient stub
          prompts.ts    Voice profile + history prompt construction
          validators.ts Em-dash + broetry enforcement and remediation
      utils/http.ts     HttpError + asyncHandler
  web/                  React + Vite + TypeScript
    public/
      fonts/            Grift family + Grahm Rough OTF
      logos/            PSA primary, square, text logo SVGs
      textures/         (placeholder for brand textures)
    src/
      api/client.ts     Fetch wrapper with auth + token refresh
      auth/context.tsx  AuthProvider + useAuth
      components/       Logo, Shell, ChatBubble
      pages/            Landing, Signup, Login, Onboarding, Dashboard, Workshop
      styles/           tokens.css, fonts.css, global.css
docker-compose.yml      Postgres + api + web
.env.example
QUESTIONS.md            Resolved
DECISIONS.md            External-dependency decisions
```

## Onboarding flow (web)

1. **Landing** → Signup (auto-starts 14-day Builder trial)
2. **Connect LinkedIn** (or demo mode) — historical posts cached locally
3. **12-step conversational questionnaire** with progress indicator and per-step autosave to localStorage
4. **Processing** ("Dialing in your PowerPost voice...")
5. **Reveal** — assigned archetype, 1-line description, sample post, optional "you also signal X" callout
6. **Customize** — three sliders (warmth, storytelling, provocation), up to 3 signature phrases, additional off-limit topics
7. **Dashboard** — start a workshop, recent sessions, recent drafts

## Workshop a Post

Each turn the model chooses one stance:
- `clarify`: ONE targeted question (only when the answer would change the draft)
- `draft`: a complete post draft + a single feedback question
- `refine`: a revised draft addressing user feedback, with a one-sentence change note

Hard rules:
- No em-dashes anywhere
- No broetry (every paragraph must contain at least two complete sentences)

Both rules are enforced (a) in the system prompt as non-negotiable instructions and (b) in post-generation validation that auto-remediates the draft and flags what was changed in the response metadata.

## Archetype scoring

Six archetypes:
- `the_owner`, `the_igniter`, `the_narrator`, `the_architect`, `the_challenger`, `the_revealer`

Weighting (from the questionnaire spec):
- Snippet picks: 60% (hook 30, opening 18, cta 12)
- LinkedIn goal: 25%
- "Never be mistaken for" + vocabulary signals: 15%

`the_revealer` requires BOTH high storytelling AND high provocation signals (story hook + bold/challenger signal in another input). Otherwise it is suppressed.

Tie-break: prefer the archetype whose hook (Pick #1) was selected.

When the second-place archetype is within 15% of the leader, it is surfaced on the reveal screen as "You also show strong signals of …".

## Phase 2 walk-throughs

**Get Inspired**
1. Sign in → dashboard → click the "Get inspired" card (or `/inspire`)
2. First visit auto-generates 5–7 personalised ideas
3. Each idea shows a source tag (What worked / Adjacent angle / Underplayed), an angle, and a "why this" rationale
4. Use "Workshop this idea" to seed a Workshop session, "Save for later" to keep it, or "Not for me" to dismiss

**Improve My Draft**
1. Dashboard → "Improve my draft" card (or `/improve`)
2. Paste a draft, pick a KPI, click Analyze
3. See voice + performance scores with rationales and a tradeoff summary
4. Voice-aligned and performance-aligned paths each contain individual recommendations — Accept / Reject / Accept all in this path
5. Optimise the working draft (voice / performance / balanced) → see what changed → Finalise

**Workshop**
- Every Workshop draft now includes a small voice/performance score badge plus optional thumbs / not-quite controls
- "Not quite" lets the user write a free-form note that feeds the learned-preferences extractor

**Learned preferences**
- Visit `/voice/edit`. The new "Learned preferences" section shows suggested patterns (e.g. "User tends to replace direct CTAs with reflective questions") with Confirm / Reject. Confirmed preferences are injected into every future LLM prompt.

**Alignment widget**
- The dashboard right rail shows the widget once two or more drafts have been scored (Workshop generates scores automatically). The widget lights up its border when drift is detected and recommends the next move.

## Phase 2 API surface

```
GET    /analytics/linkedin-summary
GET    /analytics/posts/:post_id/analysis

POST   /content/score
POST   /content/optimize

POST   /content/improve
GET    /content/improve/:id
PATCH  /content/improve/:id/recommendation/:recId
POST   /content/improve/:id/accept-all
POST   /content/improve/:id/finalize

GET    /content/inspiration
POST   /content/inspiration/refresh
POST   /content/inspiration/:idea_id/save
POST   /content/inspiration/:idea_id/dismiss
POST   /content/inspiration/:idea_id/workshop

POST   /feedback/events
GET    /feedback/preferences
PATCH  /feedback/preferences/:id

GET    /analytics/alignment
POST   /analytics/recalibration/start
```

## API surface (Phase 1)

```
POST   /auth/signup
POST   /auth/login
POST   /auth/refresh
GET    /auth/me

POST   /linkedin/connect
GET    /linkedin/status
POST   /linkedin/sync
DELETE /linkedin/disconnect
POST   /webhooks/unipile/account-connected

GET    /voice-profile
POST   /voice-profile               (triggers archetype assignment)
PATCH  /voice-profile               (sliders, signature phrases, extra exclusions)
GET    /voice-profile/archetype-preview
GET    /voice-profile/onboarding-config

POST   /workshop/start              (optional seed)
POST   /workshop/message
GET    /workshop                    (list sessions)
GET    /workshop/:id                (full session + messages)
POST   /workshop/save-draft         (persist current draft to generated_content)

GET    /content/drafts
GET    /content/drafts/:id
PATCH  /content/drafts/:id
DELETE /content/drafts/:id
```

Stripe / billing endpoints are out of M1 scope and not stubbed.

## Known gaps and deferrals

- Email verification, password reset, MFA, social login
- Stripe / billing flow + trial expiration enforcement
- Long-form article generation
- Scheduling + direct publishing via Unipile
- Cron-based daily LinkedIn sync (we have on-connect + manual sync only)
- Trends API for inspiration (Phase 2 currently uses user history + voice profile only)
- WOFF2 font conversion (ships OTFs via `@font-face` — see DECISIONS.md)
- Brand texture / pattern assets (placeholder gradient on onboarding splash)
- Cloud deployment scripts (Render / Fly / Vercel) — Docker Compose only today
- Streaming responses for Workshop a Post (single-shot per turn)
- Accessibility audit beyond keyboard nav and contrast tokens
- PSA coach admin portal
- Background worker for learned-preference extraction (today it runs in-process via `setImmediate` after feedback events that pass the threshold)

## Phase 2 test instructions

Pre-req: a logged-in user with a completed onboarding voice profile and (ideally) some demo posts via `/linkedin/connect` in demo mode.

**1. Workshop scoring + feedback**
- Open `/workshop`, start a session, send a seed message
- Assistant returns a draft. Confirm a small voice/perf score badge appears under the draft along with "This sounds like me" / "Not quite" buttons
- Click "Not quite" → write a short note → "Remember this". Confirm the note is saved (UI shows "Saved.")

**2. Get Inspired**
- Click the dashboard "Get inspired" card
- First load auto-generates 6 ideas. Each shows a source tag, title, angle, "why this" rationale
- Click "Workshop this idea" → confirm the user lands in `/workshop/:id` with a seeded user message
- Try Save / Not for me — confirm the card state updates

**3. Improve My Draft**
- Click the dashboard "Improve my draft" card
- Paste a real draft and pick a KPI → Analyze
- Confirm voice + performance scores render with rationales
- Confirm two paths render (voice / performance) when they meaningfully diverge, or one balanced path when they don't
- Accept one recommendation → confirm the working draft updates
- Run "Optimise for performance" → confirm the rewritten draft + "what changed" panel render
- Click "Finalise this draft" → confirm a `generated_content` row is created (check via dashboard recent drafts)

**4. Learned preferences**
- After producing 3+ "Not quite" / accepted-suggestion / manual-edit feedback events, visit `/voice/edit`
- Scroll to "Learned preferences". Confirm a "Suggested" pattern appears with confidence + evidence count
- Confirm one and reject one. Both should disappear from the suggested list (confirmed moves to Active)

**5. Alignment widget**
- After scoring 2+ drafts (any combination of Workshop drafts and Improve sessions), reload the dashboard
- Confirm the right-rail widget shows voice and performance averages, a sparkline if you have multi-day data, and one recommended action sentence

**6. LinkedIn insights widget**
- After connecting LinkedIn (or via demo mode) and syncing posts, reload the dashboard
- Confirm the right-rail widget shows posts analyzed, totals, 30-day and 6-month windows, top posts by impressions / comments / reactions, and a "What PowerPost noticed" line in PowerSpeak voice
- Sparse history (<3 posts) shows the "Not enough post history yet..." empty state instead of an LLM-generated insight

**7. Workshop goal picker + Improve handoff**
- Visit `/workshop`. Confirm the start screen now asks "What do you want this post to do?" with eight options
- Pick "Just sound like me", optionally add a seed, click Start. Confirm the goal chip appears at the top of the active session
- Wait through the ThinkingState — it should rotate through "Reading your voice profile" / "Checking what worked for you" / etc
- On any draft, click **Improve this draft**. Confirm `/improve` opens with the textarea prefilled and a "FROM Workshop draft" chip visible
- Pick a target from the new combined list (e.g. "Just sound like me" or "Comments") and click Analyze. Confirm the chip's Back link returns you to the originating session

**8. Light logos**
- Confirm the header and footer logos are the light versions on the navy bar
- The onboarding splash background and the coach avatar in Workshop should also use the light variant

**Backend smoke test** (without UI):
```bash
# Score a draft for the logged-in user (token in $TOKEN)
curl -X POST http://localhost:4000/content/score \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"draft_content":"Most teams overcomplicate strategy. Pick the one thing.","selected_kpi":"comments"}' | jq

# List learned preferences
curl http://localhost:4000/feedback/preferences -H "Authorization: Bearer $TOKEN" | jq

# Refresh inspiration
curl -X POST http://localhost:4000/content/inspiration/refresh -H "Authorization: Bearer $TOKEN" | jq

# LinkedIn dashboard summary
curl http://localhost:4000/analytics/linkedin-summary -H "Authorization: Bearer $TOKEN" | jq
```

## Resolved questions

See `QUESTIONS.md` for the full pre-build clarification log. All resolutions came from PM input; defaults that were merely my suggestions are flagged in `DECISIONS.md`.
