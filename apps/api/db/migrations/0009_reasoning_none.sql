-- Adds "none": answer without a thinking phase.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_reasoning_effort_check;
ALTER TABLE users
  ADD CONSTRAINT users_reasoning_effort_check
  CHECK (reasoning_effort IN ('none', 'low', 'medium', 'high'));
