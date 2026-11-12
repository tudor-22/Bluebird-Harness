-- One short AI-written label per finished day, shown under the date in the
-- right-hand day rail.
CREATE TABLE day_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  day date NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, day)
);

ALTER TABLE day_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY day_summaries_owner ON day_summaries
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
