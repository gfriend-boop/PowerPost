-- Phase 2 refinements:
-- 1. Workshop sessions remember the user's goal for the post.
-- 2. LinkedIn accounts cache the "What PowerPost noticed" insight so we don't
--    regenerate it on every dashboard load.

ALTER TABLE workshop_sessions
  ADD COLUMN post_goal TEXT;

ALTER TABLE linkedin_accounts
  ADD COLUMN insight_text TEXT,
  ADD COLUMN insight_generated_at TIMESTAMPTZ;

ALTER TABLE improvement_suggestions
  ADD COLUMN source_workshop_id UUID,
  ADD COLUMN optimization_target TEXT;
