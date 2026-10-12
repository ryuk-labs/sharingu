-- migrate-068.sql — a row written without its org is refused, loudly (sprint 6, slice 6.1; docs/plan/PLATFORM.md §2 item 2).
-- CONTRACT (PLATFORM §5: expand then contract): migrate-067.sql added `org` to the nine org-wide tables and filled it; the
-- code that ships after it stamps the writer's org on every row it writes (the writer's own people row; a sign-in attempt
-- the org the address serves). This file makes a forgotten stamp FAIL instead of landing anywhere: one trigger per table
-- refuses an INSERT whose org is NULL (RAISE ABORT: the statement, and the batch it rides, writes nothing). It then fills
-- org 1 into any row the OLD code wrote between migrate-067 and the deploy (on live the only org is 1, so that is exact).
-- Re-runnable: a replay of the chain (tools/migrate-dryrun-selftest.py) makes each missing trigger again (IF NOT EXISTS) and
-- fills nothing twice; the triggers refuse INSERTs only, so the fill's UPDATEs after them pass.
-- WRITE COST: the rows the old code wrote in that window (a handful); the triggers write nothing.
-- ORDER: AFTER the code, right after it reaches 100% (the old code names no org: under these triggers its every write would be
-- refused; and until this file runs, a row the old code wrote in the 067 -> code window has org NULL, so the new code reads
-- none of it, and a person the old code added in that window cannot sign in).
-- THE SHIP'S PREFLIGHT, read-only, right before this file (must answer no row): a row the old code wrote with no org whose
-- person (or project) is of ANOTHER org than 1 (the suites' org's minted seat, a canary request the old code answered); the
-- fill below would file it into org 1. A person row with no org names no other person, and a sign-in attempt names only an
-- address: the fill takes both as org 1's, as before.
--   SELECT 'tokens' AS t, rowid AS r FROM tokens WHERE org IS NULL AND (person_id IN (SELECT id FROM people WHERE org <> 1) OR project IN (SELECT key FROM projects WHERE org <> 1))
--     UNION ALL SELECT 'invites', rowid FROM invites WHERE org IS NULL AND (created_by IN (SELECT id FROM people WHERE org <> 1) OR project_key IN (SELECT key FROM projects WHERE org <> 1))
--     UNION ALL SELECT 'events', rowid FROM events WHERE org IS NULL AND (person_id IN (SELECT id FROM people WHERE org <> 1) OR project IN (SELECT key FROM projects WHERE org <> 1))
--     UNION ALL SELECT 'artifacts', rowid FROM artifacts WHERE org IS NULL AND (person_id IN (SELECT id FROM people WHERE org <> 1) OR project IN (SELECT key FROM projects WHERE org <> 1))
--     UNION ALL SELECT 'loops', rowid FROM loops WHERE org IS NULL AND person_id IN (SELECT id FROM people WHERE org <> 1)
--     UNION ALL SELECT 'approval_audit', rowid FROM approval_audit WHERE org IS NULL AND decided_by IN (SELECT id FROM people WHERE org <> 1)
--     UNION ALL SELECT 'transmission', rowid FROM transmission WHERE org IS NULL AND (submitter IN (SELECT id FROM people WHERE org <> 1) OR project IN (SELECT key FROM projects WHERE org <> 1))
-- Should it answer a row, stop: give each row its person's org by hand (UPDATE <t> SET org = (SELECT org FROM people WHERE id =
-- <its person column>) WHERE rowid = <r>, a bookmark first), then run the preflight again.
-- THE UNDO OF THIS FILE: tools/ship/org-required-down.sql (drops the nine triggers; the fill stays: an org-1 row the old code
-- reads as before), applied as a migration is: `sh tools/migrate.sh tools/ship/org-required-down.sql` (a Time Travel bookmark
-- first). From the moment this file lands, the code's undo is that down script FIRST, then `sh tools/ship.sh rollback <id>`:
-- code from before sprint 6 writes every token, sign-in attempt, filing and event with no org, and these triggers refuse each
-- one (a rollback alone is a write outage). `ship.sh rollback` reads live's schema and refuses while the triggers stand, unless
-- --org-required-ok says the target is sprint-6 code or later (it stamps every org).

-- the refusals
CREATE TRIGGER IF NOT EXISTS people_org_required
BEFORE INSERT ON people
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new people row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS tokens_org_required
BEFORE INSERT ON tokens
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new tokens row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS invites_org_required
BEFORE INSERT ON invites
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new invites row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS events_org_required
BEFORE INSERT ON events
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new events row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS artifacts_org_required
BEFORE INSERT ON artifacts
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new artifacts row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS loops_org_required
BEFORE INSERT ON loops
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new loops row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS approval_audit_org_required
BEFORE INSERT ON approval_audit
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new approval_audit row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS login_attempts_org_required
BEFORE INSERT ON login_attempts
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new login_attempts row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS transmission_org_required
BEFORE INSERT ON transmission
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new transmission row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

-- the rows the old code wrote after migrate-067 (none on a fresh org)
UPDATE people SET org = 1 WHERE org IS NULL;
UPDATE tokens SET org = 1 WHERE org IS NULL;
UPDATE invites SET org = 1 WHERE org IS NULL;
UPDATE events SET org = 1 WHERE org IS NULL;
UPDATE artifacts SET org = 1 WHERE org IS NULL;
UPDATE loops SET org = 1 WHERE org IS NULL;
DROP TRIGGER IF EXISTS approval_audit_no_update;
UPDATE approval_audit SET org = 1 WHERE org IS NULL;
CREATE TRIGGER approval_audit_no_update
BEFORE UPDATE ON approval_audit
BEGIN
  SELECT RAISE(ABORT, 'approval_audit is append-only: a changed mind adds a new row, never edits one');
END;
UPDATE login_attempts SET org = 1 WHERE org IS NULL;
UPDATE transmission SET org = 1 WHERE org IS NULL;
