-- 005: sign-in issues a token. No more pasting keys around.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL,
  device     TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tokens_person ON tokens(person_id, revoked);
