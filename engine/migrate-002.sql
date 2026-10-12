-- 002: email+password login, and artifacts attributed to a person
ALTER TABLE people ADD COLUMN pass_hash TEXT;
ALTER TABLE people ADD COLUMN pass_salt TEXT;
ALTER TABLE people ADD COLUMN title TEXT;
CREATE TABLE IF NOT EXISTS artifacts (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL,
  kind       TEXT NOT NULL,        -- html | image | svg | pdf | json | other
  title      TEXT,
  r2_key     TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  group_tag  TEXT,                 -- stitch group: which system-part this belongs to
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY, email TEXT, ok INTEGER, at TEXT
);
CREATE INDEX IF NOT EXISTS idx_artifacts_person ON artifacts(person_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_email ON login_attempts(email, at);
