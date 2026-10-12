-- migrate-077.sql — the sprint-7 review's two auth rows (sprint 8, 8.3a; docs/plan/PLATFORM.md §3): the lockout's key (A3) and
-- the per-seat grants epoch (C2).
-- EXPAND ONLY (PLATFORM §5): two columns added, one index made, nothing renamed, nothing dropped, no row written; the old code
-- names none of them.
--   1 · login_attempts.client: where an attempt came from (src/accounts.js clientOf: a short digest of the caller's address,
--       CF-Connecting-IP, IPv6 by its /64; for /profile's re-check, of the credential the request rode in on), NULL when the
--       worker saw none (a local run). A FAILED attempt carries its client; a SUCCESSFUL one carries it ONLY when the ACCOUNT's own
--       passphrase (or the operator's sign-up code) proved it — a seat's secret, which an org's admin minted or set, vouches for no
--       client. THE LOCKOUT (src/accounts.js lockOf): a client the account's passphrase signed in from in the last 30 days is
--       judged by its OWN failures (8 in 15 minutes); every other vantage by the account's failures from everywhere (8 in 15
--       minutes, exactly the law before this file). So a stranger who knows only the email locks every vantage the holder never
--       proved, never the holder on their own client.
--   2 · idx_login_known: the vouch lookup (login_attempts(account_id, client, at) WHERE ok = 1 AND client IS NOT NULL): one index
--       row answers "did this account's passphrase sign in from this client lately", whatever the failures the account holds.
--   3 · people.reissued_at: the seat's grants epoch — the moment its org's admin last reissued it (src/admin.js rotate-key and
--       set-password, in the same UPDATE as the new secret). An ACCOUNT grant (src/oauthgrants.js) stamps the moment it was made;
--       src/core.js resolveReader refuses it in a seat reissued at or after that moment (the column rides the seat row the grant
--       path already reads: no new read). The account's other seats, and every session, are untouched; a fresh sign-in (a new
--       grant) acts in the seat again. NULL: never reissued since this file.
-- EVERY LIVE ROW KEEPS WHAT IT HAS: both columns are NULL on every existing row — no attempt names a client (every live vantage
-- is judged as before this file until the account's passphrase signs in from it), no seat was reissued (every live account grant
-- keeps acting where it acts; one reissued AFTER this file stops acting in that seat).
-- WRITE COST on live: nothing but the index's build (an ADD COLUMN with no default rewrites no row; the partial index holds only
-- successful attempts that name a client: none yet).
-- ORDER: BEFORE the code (the new code reads and writes both columns and the index; the old code names none: an old worker writes
-- attempts with no client — judged account-wide — and never bumps a seat's epoch, as today).
-- Re-runnable: on a database that already holds this file the first ALTER fails (duplicate column name: the file is skipped
-- whole), as migrate-070's, 072's, 073's and 074's replays are.
-- THE UNDO: the code's rollback alone (the old code never reads them); the columns and the index can stay.

-- 1 · where an attempt came from
ALTER TABLE login_attempts ADD COLUMN client TEXT;

-- 2 · the vouch lookup
CREATE INDEX IF NOT EXISTS idx_login_known ON login_attempts(account_id, client, at) WHERE ok = 1 AND client IS NOT NULL;

-- 3 · the seat's grants epoch
ALTER TABLE people ADD COLUMN reissued_at TEXT;
