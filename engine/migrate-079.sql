-- migrate-079.sql — invite links (sprint 12, slice 12.3; docs/plan/SPRINTS.md 12.3; src/accounts.js THE INVITE LINK): Control's
-- Invite makes a ONE-TIME LINK for the seat it made; the invitee opens it, chooses their own passphrase and lands signed in, in that
-- org, with no operator step. The rulings it serves: the 50 beta orgs stay on the WAITLIST (the owner approves each org; only the
-- operator's code makes an account that creates an org), and an account's passphrase is its holder's alone (PLATFORM §2.8).
-- EXPAND ONLY (PLATFORM §5): one column, one table and one index added, nothing renamed, nothing dropped; the old code names none.
--   1 · accounts.invited_org: the org whose invite link set this account's passphrase (NULL: none did — the operator's code, or no
--       passphrase yet). While it is set the passphrase proves only what that org's admin could hand over, so it reaches THAT org
--       alone: it creates no org (src/orgs.js: the waitlist), and the seats other orgs add for the email stay out of its sight and
--       out of its yes (src/accounts.js PENDING_OF_SQL, ACCEPT_SEAT_SQL, DECLINE_SEAT_SQL) until the operator's code confirms the
--       email (src/accounts.js SIGNUP_ACCOUNT_SQL clears it). No foreign key: deleting an org (tools/org-undo.mjs) never waits on it.
--   2 · seat_invites: ONE org's one-time link for ONE seat its admin made (person_id) and that seat's email, bound to the seat's
--       secrets as they stood when it was made (seat_stamp: a digest of the seat's key and passphrase hashes, so a Reissue or a
--       set-password ends it). Only the link's HASH is kept (token_hash: sha256 of a domain tag and the token; the token itself is
--       shown once on the admin's Control answer and stored nowhere), an expiry (7 days), and its end: used (used_at, and spent_by,
--       the spending request's own nonce, so the statements of that request's one batch act only when THEY spent it) or revoked
--       (revoked_at: a newer link for the same seat). An org's row (org NOT NULL, the admin's own: src/admin.js writes it with
--       {org}), never the platform's signup_codes (which only the operator mints: an org's admin never mints a platform code).
--   3 · idx_seat_invites_person: a seat's OPEN links (the newer link's revoke of the older ones).
-- WHO WRITES IT: an org's admin through POST /control (add-person with deliver=link, invite-link), into their own org only; the
-- worker's POST /signup spends one (src/accounts.js redeemInvite). tools/check-scoped-data.py's `invite` rule fails a statement
-- naming seat_invites anywhere else, and an insert without {org}.
-- WRITE COST on live: nothing (an empty table and its index; the column NULL on every account).
-- ORDER: BEFORE the code (the new code's account reads name invited_org, and its Control and POST /signup name seat_invites; the
-- old code names neither).
-- Re-runnable: on a database that already holds this file the first ALTER fails (duplicate column name: the file is skipped whole,
-- as migrate-070's replay is); the rest is IF NOT EXISTS.
-- THE UNDO: the code's rollback alone (the old code reads neither); the column and the table can stay (nothing else reads them).

-- 1 · the account's invited org (FIRST: a replay fails here, before anything)
ALTER TABLE accounts ADD COLUMN invited_org INTEGER;

-- 2 · the links
CREATE TABLE IF NOT EXISTS seat_invites (
  id          TEXT PRIMARY KEY,
  org         INTEGER NOT NULL,
  person_id   TEXT NOT NULL REFERENCES people(id),
  email       TEXT NOT NULL CHECK (email = lower(trim(email)) AND email <> ''),
  token_hash  TEXT NOT NULL UNIQUE,
  seat_stamp  TEXT NOT NULL,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  spent_by    TEXT,
  revoked_at  TEXT
);

-- 3 · a seat's open links
CREATE INDEX IF NOT EXISTS idx_seat_invites_person ON seat_invites(person_id) WHERE used_at IS NULL AND revoked_at IS NULL;
