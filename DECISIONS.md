# DECISIONS.md — External Dependencies & Defaults Picked at Build Time

This file lists the third-party libraries, model choices, and self-made design decisions made while building Milestone 1. Each entry includes (a) the choice, (b) why, (c) what to revisit before public launch.

---

## LLM Provider

**Choice:** Anthropic Claude via the official `@anthropic-ai/sdk` (Node).
- Generation: `claude-sonnet-4-6` (env: `ANTHROPIC_MODEL_GENERATION`)
- Preview / lighter calls: `claude-haiku-4-5` (env: `ANTHROPIC_MODEL_PREVIEW`)

**Why:** Confirmed by PM in the updated PRD. SDK is provider-agnostic-friendly and supports the `system` parameter cleanly.

**Wrapped behind:** `services/llm/client.ts` defines an `LLMClient` interface; `services/llm/anthropic.ts` is the only place that imports the SDK. Swapping providers is a one-file change.

**Fallback:** When `ANTHROPIC_API_KEY` is not set, an `EchoClient` returns a deterministic stub draft so the rest of the UX works during local development. The stub deliberately respects content rules (no em-dashes, no broetry) so validators do not flag it.

**Revisit:** Token-budget tuning, streaming responses (M1 is single-shot per turn), and prompt-caching configuration once usage volume justifies.

---

## Web Framework

**Choice:** Vite + React 18 + React Router v6.

**Why:** Fastest dev-loop with no SSR requirement for M1. React Router v6 covers all routing needs (public, protected, onboarding-gated).

**Wrapped behind:** `web/src/api/client.ts` for transport, `web/src/auth/context.tsx` for auth state.

**Revisit:** If marketing wants pre-rendered landing pages or sitemap-friendly SEO, swap to Next.js or add a static landing build.

---

## API Framework

**Choice:** Express 4 + TypeScript (ESM).

**Why:** Smallest reasonable foundation. Familiar to most fullstack engineers.

**Validation:** Zod for request body validation (`zod`). Errors caught in middleware and serialised to `{ error, details }`.

**Revisit:** Move to Fastify or Hono if request volume justifies the speed bump. Add OpenAPI generation when external integrators show up.

---

## Database

**Choice:** Postgres 16 (alpine), accessed via `pg` (node-postgres).

**Schema management:** Hand-rolled SQL migrations in `api/src/db/migrations/`. A simple migration runner records applied files in `schema_migrations`.

**Why:** No ORM keeps the surface small and SQL grep-able. The schema is small enough that an ORM does not pay for itself yet.

**Revisit:** If the schema grows past ~15 tables, evaluate Drizzle or Prisma. Add a connection-pool sidecar (PgBouncer) if hosted in production.

---

## Auth

**Choice:** Email + password, bcryptjs (12 rounds), JWT access tokens (15 min) signed with `JWT_ACCESS_SECRET`, opaque refresh tokens (30 days) stored hashed in Postgres.

**Why:** Confirmed by PM. Email verification, password reset, MFA, and social login are explicitly out of M1.

**Revisit:** Before public launch, add (in order): email verification, password reset, throttling on `/auth/login` and `/auth/signup`, audit log, optional Google OAuth.

---

## LinkedIn / Unipile

**Choice:** Direct REST against `https://${UNIPILE_DSN}/api/v1/...` (no SDK package used because Unipile's Node SDK has historically lagged the REST API). Hosted Auth flow at `/api/v1/hosted/accounts/link`. Webhook landing pad at `POST /webhooks/unipile/account-connected`.

**Why:** Confirmed by PM. The Hosted Auth flow keeps LinkedIn credentials entirely off our servers.

**Demo-mode fallback:** When `UNIPILE_API_KEY` and `UNIPILE_DSN` are missing or `UNIPILE_DEMO_MODE=true`, the connect endpoint returns an immediately-bound demo account and seeds 8 hand-written sample posts (`api/src/services/unipile.ts`). This lets the rest of the experience be exercised without Unipile credentials.

**Revisit:** When Unipile credentials arrive: remove `UNIPILE_DEMO_MODE` from the default `.env.example`; add cron-based daily sync (Phase 2); add error handling for revoked accounts; binding webhook payloads to `user_id` requires the hosted-auth-start step to pass `user_id` in the redirect query string (TODO before going live).

---

## Brand: Fonts

**Choice:** Grift (entire family) and Grahm Rough delivered via `@font-face` from the original OTF files in `web/public/fonts/`.

**Fallback stack:**
- Grift → Inter, system-ui, sans-serif
- Grahm Rough → Source Serif Pro, Georgia, serif

**Why:** PM confirmed OTFs are acceptable for M1.

**REVISIT BEFORE PUBLIC LAUNCH:**
- Confirm the Grift and Grahm web licenses permit `@font-face` use on a public-facing app.
- Convert OTFs to WOFF2 for ~70% smaller font files and faster first paint. Without this, every visitor downloads ~12 MB of fonts on first visit.
- Add `font-display: swap` (already in place) and consider preloading the most-used weights (400 + 700).

---

## Brand: Textures & Patterns

**Choice:** A CSS gradient (`linear-gradient(180deg, #1D2846, #2B3A67)`) is used on onboarding/splash backgrounds. The `web/public/textures/` directory exists as a placeholder.

**Why:** No texture assets were provided.

**Revisit:** Drop concrete/paper textures and the brand pattern into `web/public/textures/` and update the `--gradient-onboarding` token (or add `--background-onboarding` as a layered image).

---

## Archetype Display Names & Sample Posts

**Source:** Taken verbatim from the questionnaire spec's "Six PowerPost Archetypes" section, except for **The Owner's 1-line description**, which was truncated mid-word in the source doc (`"You lead with what you kn"`). I extended it to:

> "You lead with what you know, and you say it plainly. Clarity is your superpower, and your posts make people smarter without making them feel small."

Reasoning: I tried to match The Owner's tone profile (warmth 4, storytelling 3, provocation 5) and the framing of the sample post about clarity. Edit `api/seeds/archetypes.json` if you'd like a different wording. Re-running `npm run db:seed` is idempotent and will update the row in place.

---

## Onboarding Coach Copy

**Source:** Authored by me to match PowerSpeak Academy's "tone down nothing" voice — warm but never saccharine, direct but never cold, no em-dashes, no broetry. Stored in `api/seeds/onboarding-copy.json` and exposed via `GET /voice-profile/onboarding-config` so the web app fetches copy from the API. Marketing or PM can edit the JSON file and re-seed; no code change required.

**Revisit:** Have the PowerSpeak Academy voice/coach team review every step's copy before public launch.

---

## Topics of Authority

**Choice:** 16 seed topics from the suggested list, confirmed by PM.

> Leadership · Product · Strategy · Change Management · DEI · Hiring & Talent · Sales · Marketing · Fundraising · Operations · Customer Experience · AI & Technology · Career Growth · Industry Trends · Founder Journey · Coaching & Development

Stored in `api/seeds/topics.json`. The "add your own" input is supported in the questionnaire UI.

---

## Archetype Assignment Algorithm

**Source:** Implemented per the spec in `api/src/services/archetype.ts`. Snippet picks 60%, LinkedIn goal 25%, vocabulary + "never be mistaken for" 15%. The Revealer requires both high-storytelling AND high-provocation signals or its score is forced to ≤0.

**My additions (flag for PM review):**
1. **Vocabulary heuristic.** I added small ±5-point nudges based on simple keyword matching (hedging language → favors the_challenger / the_owner; corporate buzzwords → favors the_narrator / the_revealer). These exist because the spec says "vocabulary signals carry 15%" but does not specify the rules. The function is small (`applyKeywordSignals` and the inline avoid regex in `assignArchetype`) and editable in one place.
2. **"Alternative archetype" surfacing rule.** When the second-place archetype is within 85% of the leader's score, it is surfaced as "You're also showing strong signals of X". The spec describes this behavior but does not define the threshold.

**Revisit:** Add archetype-distribution telemetry as soon as real users land. If one archetype dominates, retune weights.

---

## Validation Remediation

**Choice:** When a generated draft contains em-dashes or broetry paragraphs, the validator (`api/src/services/llm/validators.ts`) strips em-dashes and merges adjacent single-sentence paragraphs into multi-sentence ones. Both the cleaned text AND the validation flags are returned, so the UI can choose to surface "we cleaned this up" hints in the future.

**Why:** Defense in depth. The model is told the rules, and the server enforces them anyway.

**Revisit:** If remediation regularly produces awkward sentence joins, escalate to a second LLM pass instead of mechanical merging.

---

## Trial / Billing

**Choice:** On signup, every user is set to `plan_tier='builder'`, `trial_active=TRUE`, `trial_ends_at=now()+14 days`. **No Stripe integration** in M1 (per PM). Trial expiration is not enforced anywhere — users can keep using the app after `trial_ends_at`.

**Revisit:** Wire Stripe Checkout and the four billing endpoints (`/billing/subscribe`, `/billing/status`, `/billing/cancel`, `/billing/portal`) before public launch. Add a middleware that blocks generation for trial-expired users.

---

## Deployment

**Choice:** Docker Compose only (Postgres + api + web). No cloud deployment scripts, no CI/CD pipeline.

**Why:** Confirmed by PM as M1 scope.

**Revisit:** When you pick a target (Render / Fly / Railway / AWS), add a production Dockerfile (multi-stage build for the web; copy `dist` into the api container), a Github Actions workflow, and managed Postgres with daily backups.

---

# Phase 2 Decisions

## Phase 2 Prompt Architecture

**Choice:** A single `services/llm/phase2-prompts.ts` module owns the shared system prompt and all task-specific user prompts (score / improve / inspire / optimize / extract-prefs). Every Phase 2 LLM call goes through `loadPromptContext(userId)` which assembles voice profile + active learned preferences + suggested learned preferences + KPI-relevant top posts + most recent posts.

**Why:** The Prompt System Spec required centralised guardrails. Keeping all prompts in one file makes it cheap to add a banned phrase, change tone, or include another contextual signal across every Phase 2 feature.

**Output schemas:** Each task asks for strict JSON. We tolerate code fences and prose-wrapped JSON via `parseLooseJson()` in `validators.ts` so a slightly-off response doesn't blow up the request.

## Trends API

**Choice:** Phase 2 ships **without** an external trends source. Inspiration uses (1) the user's own top-performing posts, (2) topic authorities from onboarding, (3) explicit "voice gap" prompting (topics the user said matter but their post history under-represents), and (4) "adjacent theme" prompting (variations on what already worked).

**Why:** PRD non-goals exclude growth hacking and the spec doesn't name a specific trends source. Adding one is straightforward later — extend the Inspire prompt with a TRENDS section before the existing context blocks.

**Revisit:** If product wants weekly market signals, integrate a curated topic feed (Brave Trends, Latent Sync, or a manual editorial seed table) and pass it into `buildInspirePrompt`.

## Scoring Cache

**Choice:** `post_scores` is keyed by `(user_id, draft_text_hash, selected_kpi)` with `draft_text_hash = sha256(normalised_text)`. Re-scoring the same draft with the same KPI returns the cached row.

**Why:** The Prompt System Spec calls out caching to keep score generation under 5s. Hashing the normalised text means whitespace-only edits don't bust the cache.

**Revisit:** Cache invalidation today is implicit — once learned preferences change, scores don't auto-refresh. Add a per-user version stamp on the voice_profiles row that the cache key includes when this becomes a problem.

## Learned Preference Extraction

**Choice:** Synchronous via `setImmediate` after a feedback event. Triggered when:
- the event has a user note, OR
- ≥ 3 actionable events (manual_edit / suggestion_rejected / suggestion_accepted / draft_finalized / optimization_requested / thumbs_down) have accumulated since the last extraction.

The extractor runs the LLM with the spec's "Extract Learned Preferences" prompt, takes only outputs with confidence ≥ 0.4, and writes them as `suggested` (or `active` if confidence ≥ 0.85 AND the LLM nominated active). Existing rows are upserted via the `(user_id, preference_type)` partial unique index.

**Why:** The Data Contract said extraction should run async and not block the user flow. We don't have a worker process, so `setImmediate` was the simplest correct path. The threshold + confidence gate keep us from over-suggesting.

**Revisit:** Move to a real worker (BullMQ + Redis) when the user count exceeds a few thousand. Add a periodic batch job that re-evaluates preferences after a user has been quiet for a week.

## Workshop draft scoring

**Choice:** Every Workshop assistant turn that produces a draft is scored automatically. The score lives in the `workshop_messages.metadata.score` field and is shown inline in the chat UI.

**Why:** Phase 2 PRD requires scores for "generated drafts, pasted drafts, Workshop outputs, and improved drafts." Inline scoring also feeds the alignment widget without requiring the user to take an extra action.

**Cost note:** This adds one extra LLM call per Workshop draft turn. Mitigated by the cached `post_scores` lookup — re-rendering the conversation does not re-score.

## Recalibration Workflow

**Choice:** `POST /analytics/recalibration/start` returns `{ ok: true, redirect: "/onboarding?retake=1" }`. The dashboard alignment widget shows a "Recalibrate voice" button that links straight to `/voice/edit`. The "Retake questionnaire" button on `/voice/edit` is the actual recalibration path.

**Why:** PRD describes recalibration as "based on data, not user guesstimate". Today the recalibration is effectively the same as the existing retake flow with the alignment widget's recommendation as guidance. A more sophisticated recalibration (auto-suggest new tone modifier values from observed scores) is a Phase 2B candidate.

## Onboarding answers as feedback signal

**Choice:** When a user confirms or rejects a learned preference in `/voice/edit`, we **also** write a corresponding `learned_preference_confirmed` / `learned_preference_rejected` feedback event. This prevents the extractor from re-suggesting the same preference next cycle.

**Why:** The Data Contract event_type list explicitly includes those two events. Writing them via the same API path keeps the audit trail consistent.

## Banned phrase enforcement

**Choice:** The validator runs `detectBannedPhrases()` over generated text. If any of the spec's banned phrases ("boost engagement", "level up", etc.) appear, a `banned_phrase` validation flag surfaces in response metadata. We do **not** auto-strip or auto-rewrite banned phrases — the model is instructed not to use them, and if it does we surface the flag rather than masking the failure.

**Why:** Auto-rewrite for banned phrases is fragile (replacing "boost engagement" with what?). Better to surface the failure and rely on the prompt-level instruction to prevent it.

**Revisit:** When/if banned-phrase rate is non-trivial in production, add a one-shot LLM repair pass.

## Items NOT built

These are explicit Phase 2 scope decisions to defer (per Build Prompt deferrals or because they sit outside the M1+M2 brief):

- Long-form article workshop mode
- PSA coach admin portal / coach drift dashboard
- Multi-platform publishing
- Auto-DM / outreach
- Global model fine-tuning
- Billing plan enforcement for Phase 2 features
- Background workers for async preference extraction (we use `setImmediate` instead)
