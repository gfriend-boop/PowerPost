CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  user_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  plan_tier        TEXT NOT NULL DEFAULT 'builder',
  trial_active     BOOLEAN NOT NULL DEFAULT TRUE,
  trial_ends_at    TIMESTAMPTZ,
  subscription_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  token_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE linkedin_accounts (
  account_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  unipile_account_id    TEXT,
  connected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at        TIMESTAMPTZ,
  sync_status           TEXT NOT NULL DEFAULT 'pending',
  is_demo               BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id)
);

CREATE TABLE posts (
  post_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  linkedin_post_id TEXT,
  content          TEXT NOT NULL,
  posted_at        TIMESTAMPTZ NOT NULL,
  impressions      INTEGER NOT NULL DEFAULT 0,
  likes            INTEGER NOT NULL DEFAULT 0,
  comments         INTEGER NOT NULL DEFAULT 0,
  shares           INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  post_type        TEXT NOT NULL DEFAULT 'short_post',
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_user_engagement ON posts(user_id, (likes + comments + shares) DESC);
CREATE INDEX idx_posts_user_posted_at ON posts(user_id, posted_at DESC);

CREATE TABLE voice_profiles (
  profile_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  archetype                 TEXT,
  archetype_alternative     TEXT,
  tone_warmth               INTEGER NOT NULL DEFAULT 5,
  tone_storytelling         INTEGER NOT NULL DEFAULT 5,
  tone_provocation          INTEGER NOT NULL DEFAULT 5,
  topic_authorities         JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_exclusions          JSONB NOT NULL DEFAULT '[]'::jsonb,
  vocabulary_favors         JSONB NOT NULL DEFAULT '[]'::jsonb,
  vocabulary_avoids         JSONB NOT NULL DEFAULT '[]'::jsonb,
  linkedin_goal             TEXT,
  target_audience           TEXT,
  posting_cadence           TEXT,
  signature_phrases         JSONB NOT NULL DEFAULT '[]'::jsonb,
  snippet_pick_hook         TEXT,
  snippet_pick_opening      TEXT,
  snippet_pick_cta          TEXT,
  role_identity             TEXT,
  never_be_mistaken_for     TEXT,
  profile_completeness_score INTEGER NOT NULL DEFAULT 0,
  questionnaire_completed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE generated_content (
  content_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  workshop_id      UUID,
  content_type     TEXT NOT NULL DEFAULT 'short_post',
  topic_seed       TEXT,
  draft_content    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  feedback         TEXT,
  validation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_for    TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_generated_content_user_created ON generated_content(user_id, created_at DESC);

CREATE TABLE workshop_sessions (
  workshop_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT 'Untitled workshop',
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workshop_user ON workshop_sessions(user_id, last_message_at DESC);

CREATE TABLE workshop_messages (
  message_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id      UUID NOT NULL REFERENCES workshop_sessions(workshop_id) ON DELETE CASCADE,
  role             TEXT NOT NULL,
  content          TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workshop_messages_session ON workshop_messages(workshop_id, created_at);

-- Reference / seed tables
CREATE TABLE archetypes (
  archetype_key        TEXT PRIMARY KEY,
  display_name         TEXT NOT NULL,
  description          TEXT NOT NULL,
  who_this_is          TEXT NOT NULL,
  sample_post          TEXT NOT NULL,
  default_warmth       INTEGER NOT NULL,
  default_storytelling INTEGER NOT NULL,
  default_provocation  INTEGER NOT NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE snippets (
  snippet_key      TEXT PRIMARY KEY,
  pick_group       TEXT NOT NULL,
  option_label     TEXT NOT NULL,
  style_tag        TEXT NOT NULL,
  body             TEXT NOT NULL,
  signals          JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE topics (
  topic_key        TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE onboarding_copy (
  copy_key         TEXT PRIMARY KEY,
  step_index       INTEGER,
  title            TEXT,
  body             TEXT,
  hint             TEXT,
  cta              TEXT
);
