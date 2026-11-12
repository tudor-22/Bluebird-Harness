-- A persistent default for the user-facing reasoning control. Existing users
-- receive medium without touching conversations or message content.
ALTER TABLE users
  ADD COLUMN reasoning_effort text NOT NULL DEFAULT 'medium'
  CHECK (reasoning_effort IN ('low', 'medium', 'high'));
