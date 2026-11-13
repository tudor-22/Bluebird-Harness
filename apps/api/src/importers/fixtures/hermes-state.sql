-- A small Hermes state.db: the columns of sessions and messages the importer reads, from
-- hermes_state_common.py (SCHEMA_SQL, schema version 33), plus a few it must ignore.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT,
  started_at REAL NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT,
  tool_call_id TEXT,
  tool_name TEXT,
  timestamp REAL NOT NULL,
  _compressed_summary INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  compacted INTEGER NOT NULL DEFAULT 0
);
CREATE VIRTUAL TABLE messages_fts USING fts5(content);
INSERT INTO sessions VALUES ('20261101_090000_ab12', 'cli', 'Plugin bug', 1761987600, 0);
INSERT INTO sessions VALUES ('20261102_100000_cd34', 'telegram', 'Trip', 1762077600, 0);
INSERT INTO sessions VALUES ('20261103_110000_ef56', 'cli', 'Hidden', 1762167600, 1);
INSERT INTO messages (session_id, role, content, timestamp) VALUES ('20261101_090000_ab12', 'system', 'You are Hermes.', 1761987600);
INSERT INTO messages (session_id, role, content, timestamp) VALUES ('20261101_090000_ab12', 'user', 'The reverb tail clicks at 48 kHz.', 1761987601);
INSERT INTO messages (session_id, role, content, tool_name, timestamp) VALUES ('20261101_090000_ab12', 'tool', '{"exit": 0}', 'terminal', 1761987602);
INSERT INTO messages (session_id, role, content, timestamp) VALUES ('20261101_090000_ab12', 'assistant', 'The buffer is not cleared on sample-rate change.', 1761987603);
INSERT INTO messages (session_id, role, content, timestamp, active) VALUES ('20261101_090000_ab12', 'assistant', 'An answer the user rewound.', 1761987604, 0);
INSERT INTO messages (session_id, role, content, timestamp, _compressed_summary) VALUES ('20261101_090000_ab12', 'user', '[Summary of earlier turns]', 1761987605, 1);
INSERT INTO messages (session_id, role, content, timestamp, active, compacted) VALUES ('20261102_100000_cd34', 'user', 'Book me a train to Porto.', 1762077601, 0, 1);
INSERT INTO messages (session_id, role, content, timestamp) VALUES ('20261102_100000_cd34', 'assistant', '', 1762077602);
INSERT INTO messages (session_id, role, content, timestamp) VALUES ('20261102_100000_cd34', 'assistant', 'The 09:09 Alfa Pendular has seats.', 1762077603);
INSERT INTO messages (session_id, role, content, timestamp) VALUES ('20261103_110000_ef56', 'user', 'Something in a hidden session.', 1762167601);
