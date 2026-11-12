-- A profile picture the person chose, kept as a small data URL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text;
