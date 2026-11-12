-- Durable memory extraction jobs and indexes used by semantic retrieval.
CREATE UNIQUE INDEX jobs_memory_extract_message_idx
  ON jobs ((payload->>'assistantMessageId'))
  WHERE type = 'memory_extract';

CREATE INDEX memories_user_retrieval_idx
  ON memories (user_id, status, updated_at DESC);

CREATE INDEX memories_user_validity_idx
  ON memories (user_id, valid_from, valid_until);

CREATE INDEX memory_sources_message_idx
  ON memory_sources (message_id);
