-- The platform keeps one continuous thread per user: existing per-user
-- conversations are cleared and the constraint enforces a single thread.
DELETE FROM conversations;

CREATE UNIQUE INDEX conversations_one_per_user_idx ON conversations (user_id);

-- Retrieval layer: every message can be embedded for RAG over the thread.
CREATE TABLE message_embeddings (
  message_id uuid PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  model text NOT NULL,
  embedding real[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE message_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_embeddings FORCE ROW LEVEL SECURITY;
CREATE POLICY message_embeddings_owner ON message_embeddings
  USING (EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));
