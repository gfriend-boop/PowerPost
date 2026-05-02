-- Watched Topics. Drives the Timely source on Get Inspired and lets users
-- tell PowerPost what conversations are actually worth watching, instead of
-- chasing the firehose.

CREATE TABLE watched_topics (
  watched_topic_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'user_added',  -- onboarding | detected_from_posts | user_added
  priority          TEXT NOT NULL DEFAULT 'normal',      -- normal | high
  status            TEXT NOT NULL DEFAULT 'active',      -- suggested | active | paused | dismissed
  evidence_count    INTEGER NOT NULL DEFAULT 0,
  evidence_post_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason            TEXT,
  confidence        NUMERIC(4,3),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_watched_topics_user_status ON watched_topics(user_id, status, priority DESC);

-- Prevent duplicate active/suggested/paused entries for the same label per
-- user. Dismissed rows are allowed to coexist so the user can re-add them.
CREATE UNIQUE INDEX idx_watched_topics_user_label
  ON watched_topics(user_id, lower(label))
  WHERE status IN ('suggested', 'active', 'paused');

-- Inspiration ideas now carry a watched-topics linkage and a per-idea
-- timeliness rationale (only used when source_type = 'timely').
ALTER TABLE inspiration_ideas
  ADD COLUMN watched_topic_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN timeliness_rationale TEXT;

-- Migrate any old 'trend' source_type rows to the new 'timely' label.
UPDATE inspiration_ideas SET source_type = 'timely' WHERE source_type = 'trend';
