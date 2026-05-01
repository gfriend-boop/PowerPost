# PowerPost Milestone 1 — Open Questions

These items are blocking or ambiguous in the PRD and questionnaire spec. I've grouped them by area and provided a suggested default for each. **I will not implement anything that depends on these answers until you confirm.** Where the question is non-blocking (e.g. cosmetic copy I can ship a placeholder for), I've still flagged it so you have a single review surface.

---

## 1. LLM Provider & Generation

### 1.1 Which LLM provider should the MVP use?
- **Area:** LLM Layer
- **Question:** PRD lists "OpenAI (GPT-4 class) or Anthropic (Claude)" as options but does not select one. The choice affects SDK, prompt format, streaming API, and cost model.
- **Impact:** Cannot finalise the generation service, prompt templates, or `/content/generate` endpoint without a choice.
- **Suggested default:** **Anthropic Claude (`claude-sonnet-4-6` for generation, `claude-haiku-4-5` for the archetype-preview snippet to keep latency low).** Rationale: Anthropic has stronger long-form writing fidelity for executive voice; PowerSpeak's "voice-first" positioning aligns with Claude's tone control. I'd build it provider-agnostic behind an `LLMClient` interface so swapping is a one-file change.

### 1.2 Should the archetype reveal sample post be pre-canned or LLM-generated?
- **Area:** Voice Profile / Archetype Reveal
- **Question:** The PRD has a `GET /voice-profile/archetype-preview` endpoint suggesting dynamic generation, but the questionnaire spec describes a "sample post snippet" alongside a 1-line archetype description that reads as static.
- **Impact:** Determines whether reveal latency is ~50ms (cached) or ~3–6s (LLM call). Affects the loading-state copy ("Dialing in your PowerPost voice...").
- **Suggested default:** **One curated sample per archetype, hand-written and stored in seed data.** LLM generation for the reveal adds cost and latency for marginal value, and a curated sample is more controllable for the brand-defining moment. The first *real* generation (post onboarding) is the LLM moment.

### 1.3 How many historical posts should feed the LLM prompt?
- **Area:** LLM Layer / Prompt Construction
- **Question:** PRD says generation uses "voice profile + performance data + goal + topic seed" but doesn't specify how many cached posts to inject.
- **Impact:** Affects token budget, cost per generation, and voice fidelity.
- **Suggested default:** **Top 5 posts by engagement (likes + comments + shares, weighted equally) plus the 3 most recent posts, deduped.** Truncate each post to 500 chars in the prompt. Total injection ~4–5K tokens.

### 1.4 What does the prompt look like when the user has zero post history (Starter tier or pre-sync)?
- **Area:** LLM Layer
- **Question:** Starter tier explicitly says "Questionnaire only" and Builder users may generate before sync completes.
- **Impact:** Need a fallback prompt path.
- **Suggested default:** **Voice profile only, with an explicit instruction to lean on snippet picks as stylistic anchors.** Flag in the response metadata that no historical context was used.

---

## 2. Archetype Assignment Logic

### 2.1 What is the actual scoring algorithm for archetype assignment?
- **Area:** Voice Profile / Archetype Engine
- **Question:** Questionnaire spec says archetypes are assigned via "weighted answers" but does not specify weights, which inputs feed which archetype, or tie-breaking rules.
- **Impact:** Cannot ship the assignment engine without this. This is a defining product moment ("you are The Strategic Operator") and getting it subjectively wrong is a launch-blocker.
- **Suggested default:** A deterministic scoring function over five archetypes — `pragmatic_expert`, `inspiring_leader`, `challenger`, `thoughtful_storyteller`, `strategic_operator` — using these weights:

  | Input | Weight | Mapping |
  |---|---|---|
  | Hook snippet pick | 3 | direct→pragmatic_expert, story→thoughtful_storyteller, challenger→challenger |
  | Opening snippet pick | 2 | data→pragmatic_expert, personal→thoughtful_storyteller |
  | CTA snippet pick | 2 | direct→strategic_operator, reflective→inspiring_leader |
  | LinkedIn goal | 2 | inbound_leads→strategic_operator, thought_leadership→inspiring_leader, career_advancement→pragmatic_expert, speaking→inspiring_leader, board_role→strategic_operator, network_growth→thoughtful_storyteller |
  | "Never be mistaken for" keywords | 1 (negative) | If user says "salesperson"→penalise strategic_operator; "preachy"→penalise inspiring_leader; "boring"→penalise pragmatic_expert |

  Tie-break: prefer the archetype whose hook snippet was picked. Confirm or hand me your preferred matrix.

### 2.2 What are the five archetype definitions (name, 1-line description, default tone_modifiers, sample post)?
- **Area:** Voice Profile / Archetype Definitions
- **Question:** PRD/questionnaire reference five archetypes by enum name only. There is no copy for the names users see, the 1-line descriptions, or the sample posts. The narrative example uses "The Strategic Operator" — only one of five.
- **Impact:** Cannot build the reveal screen without copy. Cannot seed default tone_modifier values.
- **Suggested default:** I'll draft on-brand copy for all five (display name, tagline, description, sample 60-word post, default warmth/storytelling/provocation 1–10 values) once you confirm you want me to author this. **Do not want me to invent your brand voice without sign-off.**

### 2.3 How do the three reveal sliders map to `tone_modifiers`?
- **Area:** Voice Profile / Customization
- **Question:** Questionnaire describes sliders as "Warmth vs Authority", "Storytelling vs Insight", "Safe vs Provocative" but the data model has `warmth`, `storytelling`, `provocation` (1–10 each). Two of the three are bipolar labels; only `provocation` matches cleanly.
- **Impact:** Direction of slider movement and labelling depend on this.
- **Suggested default:**
  - `warmth` 1–10: 1 = pure authority, 10 = pure warmth
  - `storytelling` 1–10: 1 = pure insight/data, 10 = pure storytelling
  - `provocation` 1–10: 1 = safe, 10 = provocative
  Slider labels show the bipolar pairs; numeric value stored is the "right side" intensity.

---

## 3. Onboarding Content (Snippets, Topics, Copy)

### 3.1 What is the actual snippet text for the three Snippet Picks?
- **Area:** Onboarding / Snippet Library
- **Question:** Spec describes snippet *categories* (pragmatic / story-led / challenger for hooks; data-led vs personal for openings; direct CTA vs reflective for CTAs) but doesn't provide the example text users see and pick between.
- **Impact:** Cannot ship the questionnaire UI without the actual snippet copy. These need to be high-quality and on-brand because this is where the user judges whether PowerPost "gets" them.
- **Suggested default:** I'll draft 3 hooks, 2 openings, and 2 CTAs in PowerSpeak's voice (warm, executive-grade, no broetry). Stored as seed data so you/marketing can edit without a code change. **Need your green light to author or your own copy.**

### 3.2 What is the canonical "Topics of Authority" list?
- **Area:** Onboarding / Step 4
- **Question:** Spec gives examples ("Leadership, Product, DEI, Change Management") but no canonical list.
- **Impact:** Cannot ship the multi-select UI.
- **Suggested default:** Seed with 16 topics covering executive/founder concerns: Leadership, Product, Strategy, Change Management, DEI, Hiring & Talent, Sales, Marketing, Fundraising, Operations, Customer Experience, AI & Technology, Career Growth, Industry Trends, Founder Journey, Coaching & Development. Add-your-own remains supported.

### 3.3 Welcome screen and per-step coach copy — author or provide?
- **Area:** Onboarding / Copy
- **Question:** Each step has a description in the spec but no final user-facing coach voice (e.g., "Let's power up your voice — takes under 10 minutes" is described as the *idea*, not necessarily the *exact* copy).
- **Impact:** Not a blocker — I can ship sensible defaults — but if you have brand-approved copy you want word-for-word, I should use it.
- **Suggested default:** I'll write coach-style copy in line with the narrative section, store it as a single `onboarding_copy` seed table so it's editable without redeploys.

---

## 4. Data Model Reconciliations

### 4.1 `posting_cadence` enum mismatch
- **Area:** Data Model
- **Question:** Questionnaire spec says values are `1_2_per_week | 3_4_per_week | daily`. PRD data-model section says `light | regular | daily`. These conflict.
- **Impact:** Schema decision; affects DB migration and API contract.
- **Suggested default:** **Use `light | regular | daily`** (PRD authoritative). Map UI labels to: light = "1–2x/week", regular = "3–4x/week", daily = "Daily".

### 4.2 `linkedin_goal` enum mismatch
- **Area:** Data Model
- **Question:** Questionnaire uses `career_advancement`. PRD data-model uses `career_visibility`. Same idea, different name.
- **Impact:** Schema decision.
- **Suggested default:** **Use `career_visibility`** (PRD authoritative). UI label: "Career advancement / visibility".

### 4.3 `signature_phrases` and `topic_exclusions` caps
- **Area:** Data Model
- **Question:** Spec says "up to 3 signature phrases" and "flag up to 3 off-limit topics" but the JSON schema doesn't enforce caps and the customisation step adds *additional* off-limit topics on top of the guardrails free-text.
- **Impact:** Validation rules.
- **Suggested default:** Cap signature_phrases at 3. Treat `topic_exclusions` as the union of guardrails free-text (parsed/normalised) and the customisation step entries, capped at 10 total to avoid prompt bloat.

---

## 5. Auth, Sessions & Account Lifecycle

### 5.1 Email verification, password reset, MFA?
- **Area:** Auth
- **Question:** Spec says "email/signup, login" only.
- **Impact:** Production-ready typically implies at least email verification and reset.
- **Suggested default:** **MVP includes:** signup with email + password (bcrypt, 12 rounds), login, JWT access tokens (15min) + refresh tokens (30d). **Not in M1:** email verification, password reset, MFA, social login. Documented as known gaps in README.

### 5.2 Trial activation on signup?
- **Area:** Account Lifecycle
- **Question:** PRD says all new users get a 14-day Builder trial. Should signup auto-set `trial_active=true, trial_ends_at=now+14d, plan_tier=builder`?
- **Impact:** Default seed values for new users.
- **Suggested default:** **Yes**, auto-start trial on signup. No Stripe integration in M1 (out of scope per "Phase 1" framing).

### 5.3 Is Stripe billing in scope for M1?
- **Area:** Billing
- **Question:** PRD lists Stripe endpoints but the brief specifies M1 = "Early Access MVP" focused on auth, LinkedIn connect, onboarding, voice profile, first generation.
- **Impact:** Significant scope difference.
- **Suggested default:** **Out of scope for M1.** Trial flag set on signup; no enforcement of trial expiry; billing endpoints stubbed.

---

## 6. Unipile Integration Specifics

### 6.1 Which Unipile auth flow and which SDK?
- **Area:** LinkedIn Connection
- **Question:** PRD says "hosted auth flow" but Unipile offers multiple integration paths (Hosted Auth, Custom Auth Wizard, direct API). It also has an official Node SDK.
- **Impact:** Implementation details for `/linkedin/connect`.
- **Suggested default:** **Hosted Auth (Unipile's `/api/v1/hosted/accounts/link` flow).** Use the official `unipile-node-sdk` if available; otherwise direct REST. Webhook callback at `/webhooks/unipile/account-connected` to capture `account_id` once user completes hosted flow.

### 6.2 Sync cadence and trigger?
- **Area:** Post History Sync
- **Question:** PRD says "daily" sync but doesn't specify trigger (cron, webhook, on-demand only).
- **Impact:** Infrastructure dependency.
- **Suggested default:** **On-connection initial sync (full history) + manual `POST /linkedin/sync` button** for M1. Cron job documented as Phase 2. Webhook from Unipile updates new posts as they're detected.

### 6.3 What credentials do you have for Unipile, and is there a sandbox?
- **Area:** Unipile Configuration
- **Question:** I need a `UNIPILE_API_KEY` and `UNIPILE_DSN` (their per-account hostname format) to actually run the integration.
- **Impact:** Cannot test against real Unipile without credentials. Code will be written against the documented API contract; integration testing will require your env vars.
- **Suggested default:** Code expects `UNIPILE_API_KEY` and `UNIPILE_DSN` in `.env`. Without them, the LinkedIn connect flow falls back to a "demo mode" that mocks a connected account with seeded sample posts so the rest of the experience can be exercised.

---

## 7. Deployment & Infrastructure

### 7.1 What does "production-ready" mean for M1?
- **Area:** Deployment
- **Question:** Could mean (a) runs locally with one command, (b) deployed to a cloud target, (c) full CI/CD, IaC, monitoring.
- **Impact:** Significant scope difference.
- **Suggested default:** **Tier (a) + Dockerised:** `docker compose up` runs Postgres + API + web. README covers env vars, migrations, seeding, dev workflow. Deployment scripts for Render/Fly/Vercel are out of scope for M1.

### 7.2 Hosted database or local Postgres?
- **Area:** Database
- **Question:** Local Postgres (Docker) vs hosted (Neon/Supabase/RDS).
- **Suggested default:** **Local Postgres in Docker** for dev. Connection string is env-var driven so any hosted Postgres works.

---

## 8. Branding Application

### 8.1 Font licensing — can the Grift and Grahm OTF files be embedded in the web build?
- **Area:** Brand / Web Performance
- **Question:** The fonts are provided as desktop OTF files; using them on the web requires the licence permits webfont conversion (and ideally WOFF2 versions for performance).
- **Impact:** Affects whether I include the OTFs as `@font-face` directly or need to convert to WOFF2 and confirm licence.
- **Suggested default:** Include OTFs via `@font-face` as a starting point; **call out in DECISIONS.md that you should confirm web licence and provide WOFF2 versions before public launch.** Fallback stack: Inter (Grift fallback) and Source Serif (Grahm fallback).

### 8.2 Texture/pattern assets
- **Area:** Brand
- **Question:** PRD references "Concrete & Paper textures" and a "Brand Pattern" for onboarding splash but no asset files were provided.
- **Impact:** Onboarding splash treatment.
- **Suggested default:** Use a subtle CSS gradient (deep navy → royal blue) for splash; document that texture assets should be dropped into `web/public/textures/` later.

---

## How I'd like to proceed

**If you confirm all suggested defaults**, I'll proceed end-to-end and ship M1 with:
- The defaults baked into seed data and config so individual decisions can be edited later without code changes
- A `DECISIONS.md` enumerating every external dependency I picked
- A README covering setup, env vars, migrations, and dependencies
- A clear "known gaps" section in the README listing items deferred to Phase 2 (Stripe, scheduling, analytics dashboard, article generation, feedback loop, voice refinement)

**If you want to weigh in selectively**, please respond with answers to the numbered items above and I'll adjust before I start. I'll wait on this file before writing implementation code for §2.1, §2.2, §3.1 specifically — those three are subjective product decisions where suggested defaults are placeholders, not real answers.
