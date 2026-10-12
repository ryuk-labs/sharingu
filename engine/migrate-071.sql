-- migrate-071.sql — sign-up by allowlist: the operator's one-time codes (sprint 7, slice 7.2; docs/plan/PLATFORM.md §2 items
-- 8 and 10: no email service in the waitlist phase; only an email the OPERATOR allowed signs up, with a one-time code the
-- operator hands over by hand, so knowing an allowed email is not enough to take its account).
-- EXPAND ONLY (PLATFORM §5): one table and one index added, nothing renamed, nothing dropped; the old code names neither.
--   1 · signup_codes: the allowlist and its codes. A row is ONE code for ONE email (lower-cased and trimmed, as
--       accounts.email): only its HASH is kept (code_hash: sha256 of the code as typed after normalising; the code itself is
--       printed once on the operator's terminal by tools/operator.mjs and stored nowhere), an expiry, and its end: used
--       (used_at, used_how: created · set · reset, and spent_by, the spending request's own nonce, so the statements of that
--       request's one batch act only when THEY spent it) or revoked (revoked_at). A PLATFORM row: no org (sign-up comes before
--       any org: slice 7.3 creates one), so it is not the dead `invites` table, whose rows are an org's (6.1's refusing org
--       trigger, a project, a role and the minting person) — `invites` is dropped by a LATER contract migration, never here.
--   2 · idx_signup_open: at most ONE open code per email (open: neither used nor revoked; an expired one is still open until
--       the operator's next `allow` for that email revokes it), and the sign-up's one lookup (the email's open code).
-- WHO WRITES IT: only the deployment's credentials, from the operator's machine (tools/operator.mjs allow · revoke), never an
-- app seat (PLATFORM §2.6). The worker reads an email's open code and spends it (src/accounts.js, POST /signup); no statement
-- of the worker inserts a code (tools/check-scoped-data.py's `signup` rule fails one).
-- WRITE COST on live: nothing (an empty table and its index).
-- ORDER: BEFORE the code (the new code's POST /signup reads it; the old code names neither the table nor the index).
-- Re-runnable: IF NOT EXISTS — a replay changes nothing.
-- THE UNDO: the code's rollback alone (the old code reads neither); the table can stay (nothing reads it), or be dropped with
-- DROP TABLE signup_codes (a Time Travel bookmark first) once no code is wanted.

CREATE TABLE IF NOT EXISTS signup_codes (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL CHECK (email = lower(trim(email)) AND email <> ''),
  code_hash  TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_how   TEXT CHECK (used_how IS NULL OR used_how IN ('created', 'set', 'reset')),
  spent_by   TEXT,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_open ON signup_codes(email) WHERE used_at IS NULL AND revoked_at IS NULL;
