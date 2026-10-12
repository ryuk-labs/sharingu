-- migrate-027.sql — the invite door (J1-R, sharingu v1.0 §1 mode 3, M-ADR-046): an org
-- owner mints a single-use, expiring code for one project + role; a stranger redeems it
-- once and gets their key through the SAME identity seam add-person/grant-seat already
-- use (src/invite.js — never a parallel identity path). Only a SHA-256 hash of the code
-- is ever written here — same convention as people.key_hash / tokens.token_hash — the
-- code itself is shown to the minting caller EXACTLY ONCE and is never recoverable after.
-- Additive: one new table, one index. Single-use is enforced ATOMICALLY at redemption
-- (`UPDATE invites SET redeemed_at=…, redeemed_person=… WHERE id=? AND redeemed_at IS
-- NULL AND revoked_at IS NULL AND expires_at > ?`, affected-rows decides) — the SAME
-- lesson M-ADR-023's sso_nonce fix taught (a read-then-write check is not single-use
-- under concurrency; the write's own WHERE clause is the only thing that is).
CREATE TABLE IF NOT EXISTS invites (
  id              TEXT PRIMARY KEY,
  code_hash       TEXT NOT NULL UNIQUE,     -- sha256(code); the code itself is never stored
  project_key     TEXT NOT NULL,            -- the project_seats row the redeemer gets (ADR-100)
  role            TEXT NOT NULL,            -- the person's org role (people.role) — same free-text set add-person uses
  label           TEXT,                     -- optional admin note / email hint — informational only, never used for auth
  created_by      TEXT NOT NULL,            -- person id of the minting owner
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  redeemed_at     TEXT,
  redeemed_person TEXT,                     -- person id created at redemption
  revoked_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_open ON invites(expires_at) WHERE redeemed_at IS NULL AND revoked_at IS NULL;
