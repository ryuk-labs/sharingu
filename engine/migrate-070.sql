-- migrate-070.sql — one account per email, a seat per org (sprint 7, slice 7.1; docs/plan/PLATFORM.md §2 item 8).
-- EXPAND ONLY (PLATFORM §5): a table and two columns added, nothing renamed, nothing dropped, no people row's credential
-- written; the old code runs on it unchanged (it names none of it).
--   1 · accounts: ONE row per email (lower-cased and trimmed, UNIQUE), and the account's own passphrase (pass_hash,
--       pass_salt), the HOLDER's: set only by proving it on /profile, or by slice 7.2's sign-up with an operator's one-time
--       code — never by an admin, never by this file. A people row is the account's SEAT in one org (people.account_id); a
--       seat keeps its own secret (people.pass_hash: the key its admin minted, S-019, or one set since), which opens that
--       seat alone (src/accounts.js).
--   2 · login_attempts.account_id: the lockout counts per account (src/accounts.js).
--   3 · THE BACKFILL: one account per distinct lower(trim(email)) among people with an email (active or not), made with NO
--       passphrase; every seat with an email linked. No passphrase is carried (the coordinator's ruling, 2026-10-07, by "no
--       widening of authority"): under S-019 an admin minted many first passphrases, and an account passphrase will open
--       every seat of the account once slice 7.4 signs in by org, so a carried one would let that admin into the person's
--       seats elsewhere. Every pass_hash/pass_salt stays where it is, as the SEAT's secret: org 1 signs in exactly as today.
--   4 · idx_people_account_seat: an account holds at most ONE active seat per org (UNIQUE, partial); idx_people_account: an
--       account's seats; idx_login_account: the lockout's count per account.
--   5 · the triggers that keep it true for every writer (the door, the operator's tools, the old code):
--       people_account_attach  a new seat with an email joins that email's account, made with NO passphrase when it is new
--                              (an admin's minted key never becomes an account's passphrase: what one org's admin knows never
--                              opens another org's seat); a second active seat of one account in one org is refused
--       people_account_late    a seat with no email that is given one joins that email's account the same way (the operator's
--                              restore binds the restored owner to the fresh org's address so: tools/restore-local.mjs)
--       people_email_fixed     a seat's email, once set, never changes (it names its account); add a seat instead
-- THE GUARD (the first statement; it writes nothing): an email held in two orgs, or by two active people, is the OWNER's
-- merge to decide, never this file's. The guard then fails the file before anything is made (SQLite's json() refuses the
-- text as malformed JSON: "migrate-070 refused"), and nothing after it runs.
-- THE SHIP'S PREFLIGHT, read-only, right before this file (must answer no row; any row is the owner's merge decision):
--   SELECT lower(trim(email)) AS e, COUNT(DISTINCT org) AS orgs, SUM(active = 1) AS active, COUNT(*) AS seats FROM people
--       WHERE email IS NOT NULL AND trim(email) <> '' GROUP BY lower(trim(email)) HAVING COUNT(DISTINCT org) > 1 OR SUM(active = 1) > 1
-- WRITE COST on live: one account per distinct email of people (135 people rows at the sprint-6 baseline, 6 active), and
-- one people.account_id per row with an email; the indexes over people (135) and login_attempts (a week's rows).
-- ORDER: BEFORE the code. The old code runs on it unchanged: a seat it adds joins its account (a second active seat of one
-- email in one org, the old code's duplicate, is refused); the passphrases it reads and writes are the seats' own, as they
-- remain under the new code (no account holds one after this file), so nothing it does in the window can diverge. The new
-- code (src/accounts.js) needs it.
-- Re-runnable: the guard writes nothing; on a database that already holds this file the first ALTER fails (duplicate
-- column name: the file is skipped whole), as migrate-067's replay is.
-- THE UNDO: the code's rollback alone (the old code reads people as before; the seats keep their own secrets). The three
-- triggers can be lifted with DROP TRIGGER people_account_attach, people_account_late, people_email_fixed (a Time Travel
-- bookmark first); the table, the columns and the indexes stay (the old code reads none).

-- the guard: nothing below runs while an email names two orgs or two active people (on a database that already holds this
-- file, where one account's seats in two orgs are the point, it asks nothing: the replay skips at the first ALTER)
SELECT json(CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'accounts')
  AND EXISTS (SELECT 1 FROM people WHERE email IS NOT NULL AND trim(email) <> '' GROUP BY lower(trim(email))
  HAVING COUNT(DISTINCT org) > 1 OR SUM(active = 1) > 1) THEN 'migrate-070 refused: an email names two orgs or two active people' ELSE '0' END );

-- 1 · the accounts
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND email <> ''),
  pass_hash  TEXT,
  pass_salt  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2 · the seat's account; the attempt's account
ALTER TABLE people ADD COLUMN account_id TEXT REFERENCES accounts(id);
ALTER TABLE login_attempts ADD COLUMN account_id TEXT;

-- 3 · the backfill: one account per email, with NO passphrase (every seat keeps its own); every seat with an email linked
INSERT INTO accounts (id, email, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), lower(trim(email)), MIN(created_at), MIN(created_at)
    FROM people WHERE email IS NOT NULL AND trim(email) <> '' GROUP BY lower(trim(email))
  ON CONFLICT (email) DO NOTHING;

UPDATE people SET account_id = (SELECT a.id FROM accounts a WHERE a.email = lower(trim(people.email)))
  WHERE email IS NOT NULL AND trim(email) <> '' AND account_id IS NULL;

-- 4 · the indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_account_seat ON people(account_id, org) WHERE active = 1 AND account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_account ON people(account_id, org);
CREATE INDEX IF NOT EXISTS idx_login_account ON login_attempts(account_id, at);

-- 5 · the triggers
CREATE TRIGGER IF NOT EXISTS people_account_attach
AFTER INSERT ON people
WHEN NEW.email IS NOT NULL AND trim(NEW.email) <> ''
BEGIN
  SELECT RAISE(ABORT, 'account_seat_taken: that email already holds an active seat in this org (one account, one seat per org)')
    WHERE NEW.active = 1 AND EXISTS (SELECT 1 FROM accounts a JOIN people o ON o.account_id = a.id
      WHERE a.email = lower(trim(NEW.email)) AND o.org IS NEW.org AND o.active = 1 AND o.id <> NEW.id);
  INSERT INTO accounts (id, email, created_at, updated_at) VALUES (lower(hex(randomblob(16))), lower(trim(NEW.email)), NEW.created_at, NEW.created_at)
    ON CONFLICT (email) DO NOTHING;
  UPDATE people SET account_id = (SELECT a.id FROM accounts a WHERE a.email = lower(trim(NEW.email))) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS people_account_late
AFTER UPDATE OF email ON people
WHEN (OLD.email IS NULL OR trim(OLD.email) = '') AND NEW.email IS NOT NULL AND trim(NEW.email) <> ''
BEGIN
  SELECT RAISE(ABORT, 'account_seat_taken: that email already holds an active seat in this org (one account, one seat per org)')
    WHERE NEW.active = 1 AND EXISTS (SELECT 1 FROM accounts a JOIN people o ON o.account_id = a.id
      WHERE a.email = lower(trim(NEW.email)) AND o.org IS NEW.org AND o.active = 1 AND o.id <> NEW.id);
  INSERT INTO accounts (id, email, created_at, updated_at) VALUES (lower(hex(randomblob(16))), lower(trim(NEW.email)), NEW.created_at, NEW.created_at)
    ON CONFLICT (email) DO NOTHING;
  UPDATE people SET account_id = (SELECT a.id FROM accounts a WHERE a.email = lower(trim(NEW.email))) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS people_email_fixed
BEFORE UPDATE OF email ON people
WHEN OLD.email IS NOT NULL AND trim(OLD.email) <> '' AND NEW.email IS NOT OLD.email
BEGIN
  SELECT RAISE(ABORT, 'account_email: a seat keeps the email of its account (migrate-070): add a seat for the other email');
END;
