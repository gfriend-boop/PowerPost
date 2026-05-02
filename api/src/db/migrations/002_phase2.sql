-- Phase 2: feedback events, learned preferences, scoring cache, inspiration ideas,
-- improvement suggestions.

CREATE TABLE feedback_events (
  feedback_event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  source_surface           TEXT NOT NULL,                 -- workshop | improve_draft | inspiration | post_score | voice_settings
  source_id                UUID,                          -- workshop_id, suggestion_id, idea_id, etc.
  content_id               UUID,                          -- generated_content.content_id when applicable
  event_type               TEXT NOT NULL,                 -- thumbs_up | thumbs_down | manual_edit | ...
  raw_content_before       TEXT,
  raw_content_after        TEXT,
  selected_kpi             TEXT,
  voice_score_before       NUMERIC(4,2),
  voice_score_after        NUMERIC(4,2),
  performance_score_before NUMERIC(4,2),
  performance_score_after  NUMERIC(4,2),
  user_note                TEXT,
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_events_user_created ON feedback_events(user_id, created_at DESC);
CREATE INDEX idx_feedback_events_user_event ON feedback_events(user_id, event_type);

CREATE TABLE learned_preferences (
  learned_preference_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  preference_type          TEXT NOT NULL,                 -- cta_style | opening_style | vulnerability_level | ...
  preference_summary       TEXT NOT NULL,
  prompt_instruction       TEXT NOT NULL,
  confidence               NUMERIC(4,3) NOT NULL DEFAULT 0,
  evidence_count           INTEGER NOT NULL DEFAULT 0,
  evidence_event_ids       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                   TEXT NOT NULL DEFAULT 'suggested',  -- suggested | active | rejected | archived
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_learned_preferences_user_status ON learned_preferences(user_id, status);
CREATE UNIQUE INDEX idx_learned_preferences_user_type ON learned_preferences(user_id, preference_type)
  WHERE status IN ('suggested', 'active');

CREATE TABLE post_scores (
  post_score_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  content_id               UUID,                          -- generated_content.content_id when applicable
  draft_text_hash          TEXT NOT NULL,                 -- sha256 of normalised draft text
  selected_kpi             TEXT,
  voice_score              NUMERIC(4,2) NOT NULL,
  performance_score        NUMERIC(4,2) NOT NULL,
  voice_rationale          TEXT NOT NULL,
  performance_rationale    TEXT NOT NULL,
  tradeoff_summary         TEXT,
  evidence_post_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence               TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_post_scores_cache ON post_scores(user_id, draft_text_hash, COALESCE(selected_kpi, ''));
CREATE INDEX idx_post_scores_user_created ON post_scores(user_id, created_at DESC);

CREATE TABLE inspiration_ideas (
  idea_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title                    TEXT NOT NULL,
  suggested_angle          TEXT NOT NULL,
  why_this                 TEXT NOT NULL,
  source_type              TEXT NOT NULL,                 -- performance_pattern | adjacent_theme | voice_gap | trend | manual_seed
  evidence_post_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  workshop_seed_prompt     TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'active', -- active | saved | dismissed | used
  expires_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspiration_ideas_user_status ON inspiration_ideas(user_id, status, created_at DESC);

CREATE TABLE improvement_suggestions (
  suggestion_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  content_id               UUID,                          -- generated_content.content_id when applicable
  original_draft           TEXT NOT NULL,
  selected_kpi             TEXT,
  voice_score_before       NUMERIC(4,2),
  performance_score_before NUMERIC(4,2),
  recommendations          JSONB NOT NULL DEFAULT '[]'::jsonb,
  working_draft            TEXT,
  final_draft              TEXT,
  tradeoff_summary         TEXT,
  status                   TEXT NOT NULL DEFAULT 'open',  -- open | finalized | discarded
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_improvement_suggestions_user_created ON improvement_suggestions(user_id, created_at DESC);
