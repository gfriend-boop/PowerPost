-- Cache "why this worked" analysis on each post. Generated on demand when
-- the user clicks a top post card on the dashboard.

ALTER TABLE posts
  ADD COLUMN analysis_text TEXT,
  ADD COLUMN analysis_generated_at TIMESTAMPTZ;
