-- migrate-040.sql — the Map reads D1 and a check's grade lights its node (sprint 1 slice 3). EXPAND-ONLY: one table, its
-- three triggers and three indexes; no existing table or row changes. Applied live with tools/migrate.sh (a bookmark first).
--   · check_results by (project, check_id, graded_at): a check's latest grade is one index probe, never a scan;
--   · k_check_refs: one row per (check, ref it names), kept by the triggers below from k_checks.refs, so the checks that name
--     a node are read by the node's id, never by scanning the whole register (a project holds thousands of checks);
--   · k_edges by (project, to_id): a node's edges both ways; by (project, kind): one kind of edge (a plane's own rows).

CREATE INDEX IF NOT EXISTS idx_check_results_latest ON check_results(project, check_id, graded_at);
CREATE INDEX IF NOT EXISTS idx_k_edges_to ON k_edges(project, to_id);
CREATE INDEX IF NOT EXISTS idx_k_edges_kind ON k_edges(project, kind);

CREATE TABLE IF NOT EXISTS k_check_refs (
  project  TEXT NOT NULL REFERENCES projects(key),
  ref      TEXT NOT NULL,             -- a node, goal or question id the check names (one element of k_checks.refs)
  check_id TEXT NOT NULL,             -- the k_checks id
  PRIMARY KEY (project, ref, check_id)
);

-- the refs follow k_checks.refs: an insert adds them, a change of refs replaces them, a delete removes them
CREATE TRIGGER IF NOT EXISTS k_checks_refs_insert
AFTER INSERT ON k_checks
BEGIN
  INSERT OR IGNORE INTO k_check_refs (project, ref, check_id)
    SELECT NEW.project, value, NEW.id FROM json_each(COALESCE(NEW.refs, '[]')) WHERE type = 'text';
END;

CREATE TRIGGER IF NOT EXISTS k_checks_refs_update
AFTER UPDATE OF refs ON k_checks
BEGIN
  DELETE FROM k_check_refs WHERE project = OLD.project AND check_id = OLD.id
    AND ref IN (SELECT value FROM json_each(COALESCE(OLD.refs, '[]')));
  INSERT OR IGNORE INTO k_check_refs (project, ref, check_id)
    SELECT NEW.project, value, NEW.id FROM json_each(COALESCE(NEW.refs, '[]')) WHERE type = 'text';
END;

CREATE TRIGGER IF NOT EXISTS k_checks_refs_delete
AFTER DELETE ON k_checks
BEGIN
  DELETE FROM k_check_refs WHERE project = OLD.project AND check_id = OLD.id
    AND ref IN (SELECT value FROM json_each(COALESCE(OLD.refs, '[]')));
END;

-- the checks already filed (a database the importer filled before this migration)
INSERT OR IGNORE INTO k_check_refs (project, ref, check_id)
  SELECT c.project, j.value, c.id FROM k_checks c, json_each(COALESCE(c.refs, '[]')) j WHERE j.type = 'text';
