# PowerPost — Milestone 1 (Early Access MVP)

PowerPost by PowerSpeak Academy. A LinkedIn voice tool for executives, founders, and emerging leaders. M1 ships:

- Email signup + login with JWT (15-min access + 30-day refresh)
- LinkedIn connection via Unipile hosted auth, with a demo-mode fallback that seeds realistic sample posts when Unipile credentials are not configured
- Conversational onboarding questionnaire (12 steps + reveal + customization)
- Six-archetype voice profile assignment with deterministic scoring + an "alternative archetype" surface for ambiguous signals
- "Workshop a Post" — a true back-and-forth chat experience with PowerPost as a thinking partner. The model chooses one of three stances per turn (clarify, draft, refine) and is hard-constrained to PowerSpeak's content rules
- Hard content rules enforced in both prompts AND post-generation validation: no em-dashes, no broetry. Drafts that violate either are auto-remediated and the validation flags surfaced in response metadata

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

## API surface (M1)

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

## Known gaps for Phase 2 / launch

- Email verification, password reset, MFA, social login
- Stripe / billing flow + trial expiration enforcement
- Performance Intelligence dashboard (analytics endpoints)
- Article generation (long-form)
- Scheduling + direct publishing via Unipile
- "Get Inspired" idea feed (Phase 2 critical per PRD)
- "Improve My Draft" KPI optimizer (Phase 2 critical per PRD)
- Voice refinement feedback loop (thumbs up/down → profile updates)
- Cron-based daily LinkedIn sync (M1 has on-connect + manual sync only)
- WOFF2 font conversion (M1 ships OTFs via `@font-face` — see DECISIONS.md)
- Brand texture / pattern assets (placeholder gradient on onboarding splash)
- Cloud deployment scripts (Render / Fly / Vercel) — M1 is Docker Compose only
- Streaming responses for Workshop a Post (currently single-shot per turn)
- Accessibility audit beyond keyboard nav and contrast tokens

## Resolved questions

See `QUESTIONS.md` for the full pre-build clarification log. All resolutions came from PM input; defaults that were merely my suggestions are flagged in `DECISIONS.md`.
