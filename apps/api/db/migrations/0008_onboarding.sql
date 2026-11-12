-- The name Bluebird uses for the person, and when they finished the welcome steps.
-- Existing accounts start with no name and see the welcome flow once.
ALTER TABLE users
  ADD COLUMN display_name text CHECK (char_length(display_name) <= 60),
  ADD COLUMN onboarded_at timestamptz;
