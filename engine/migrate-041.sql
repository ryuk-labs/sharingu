-- migrate-041.sql — the sprint-end review's free-tier fixes (sprint 1, F8 and F15). EXPAND-ONLY: one table, its three
-- triggers and one partial index; no existing table or row changes (the backfill only fills the new table). Applied live
-- with tools/migrate.sh (a bookmark first).
--   · k_check_ungraded: one row per check that has no grade yet, kept by the triggers below (a check filed with no grade
--     adds its row, a check removed takes it away, a grade takes it away), so `holes` counts the ungraded checks and names
--     the first one on this table's primary key, and its cost never grows as checks get graded (it used to walk up to 500
--     checks twice, probing check_results for each: ~2,000 rows read once most were graded). check_results is append-only
--     (every grade is kept, Q5992857D), so a grade never comes back off. One row written per check filed without a grade
--     and one per first grade.
--   · idx_transmission_knowledge: the project's knowledge filings (write_knowledge files one kind knowledge row per call) in
--     time order, so "when did this project's knowledge last change" (Home, `state`, the heartbeat) and the restore's check
--     for work since the newest version are ONE row read, never a walk of the ledger. Partial: only knowledge rows are
--     indexed (one row written per knowledge filing, none for any other kind).

CREATE TABLE IF NOT EXISTS k_check_ungraded (
  project  TEXT NOT NULL REFERENCES projects(key),
  check_id TEXT NOT NULL,             -- a k_checks id with no check_results row in its project yet
  PRIMARY KEY (project, check_id)
);

CREATE TRIGGER IF NOT EXISTS k_checks_ungraded_insert
AFTER INSERT ON k_checks
WHEN NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = NEW.project AND g.check_id = NEW.id)
BEGIN
  INSERT OR IGNORE INTO k_check_ungraded (project, check_id) VALUES (NEW.project, NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS k_checks_ungraded_delete
AFTER DELETE ON k_checks
BEGIN
  DELETE FROM k_check_ungraded WHERE project = OLD.project AND check_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS check_results_graded
AFTER INSERT ON check_results
BEGIN
  DELETE FROM k_check_ungraded WHERE project = NEW.project AND check_id = NEW.check_id;
END;

CREATE INDEX IF NOT EXISTS idx_transmission_knowledge ON transmission(project, created_at) WHERE kind = 'knowledge';

-- the checks already filed (a database the importer filled before this migration)
INSERT OR IGNORE INTO k_check_ungraded (project, check_id)
  SELECT c.project, c.id FROM k_checks c
  WHERE NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id);
