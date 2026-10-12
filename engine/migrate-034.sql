-- migrate-034.sql — Q23D7E346 (owner ruling, 2026-09-20): approval_audit is authored — a record of
-- decisions, never edited; a changed mind adds a new row. A full grep of every write path (src/*.js)
-- found exactly one INSERT against this table (src/core.js decideTransmission()) and ZERO UPDATEs —
-- the code already behaves correctly (a re-decide on a non-terminal 'needs-work' row appends a new
-- audit row rather than editing the old one; a terminal decision refuses to re-decide at all,
-- "already_decided"). There is no UPDATE path to remove because none exists today.
--
-- What does NOT exist today is anything stopping a FUTURE write path from adding one — THE THREE
-- BANDS doctrine again: a rule a reviewer reads in a comment can be missed; a rule the database
-- itself refuses cannot. No rebuild needed — a trigger is an independent schema object, not part of
-- the table's own CREATE TABLE, so approval_audit's column list from migrate-031.sql is untouched.
--
-- REENTRANCY (heal, 2026-09-23): this is still the canonical, ruled home of these two triggers, but
-- migrate-031.sql now ALSO carries a byte-identical DROP+CREATE pair of its own (its rename of
-- `transmission`/`approval_audit` silently corrupts these triggers on a REPLAY of an already-migrated
-- org otherwise — see that file's own header for the mechanism). The two CREATE TRIGGER statements
-- below are IF NOT EXISTS and therefore a harmless no-op every time this file runs from here on
-- (migrate-031.sql, sorting first, already put them back) — kept here unchanged rather than deleted
-- so this ruling still reads as one file, and so a fresh org that somehow ran only this file in
-- isolation still ends up correct.
CREATE TRIGGER IF NOT EXISTS approval_audit_no_update
BEFORE UPDATE ON approval_audit
BEGIN
  SELECT RAISE(ABORT, 'approval_audit is append-only: a changed mind adds a new row, never edits one');
END;

-- DELETE stays possible for exactly one sanctioned, already-live path: src/admin.js's eval-hygiene
-- sweep (`DELETE FROM approval_audit WHERE transmission_id IN (SELECT id FROM transmission WHERE
-- eval=1)`) — clearing suite-run rows is test hygiene, not a changed mind, and is the same
-- self-cleaning contract every eval-marked row in this schema already carries (gate step "suite
-- marks", tools/check-suite-marks.py). Any delete touching a REAL (eval=0, or orphaned/unknown)
-- decision row is refused the same way an edit is — fails closed when the joined transmission row
-- cannot be found at all (IS NOT 1 is true for NULL too).
CREATE TRIGGER IF NOT EXISTS approval_audit_no_delete_real
BEFORE DELETE ON approval_audit
WHEN (SELECT eval FROM transmission WHERE id = OLD.transmission_id) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'approval_audit is append-only: no delete on a real (non-eval) decision row');
END;
