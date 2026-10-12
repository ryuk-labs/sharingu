-- migrate-066.sql — the stale, refs and ungraded triggers survive the write door's upsert (sprint-4 ship, 2026-10-05).
-- THE FAULT, proven on live during the sprint-4 import: SQLite lets an outer statement's ON CONFLICT clause override the
-- legacy OR algorithm of every statement inside a trigger it fires, so the door's upsert (write.js: INSERT ... ON CONFLICT
-- DO UPDATE) turned each trigger's INSERT OR IGNORE into a plain INSERT — and a node changed while its check was ALREADY
-- stale failed the whole batch (D1_ERROR: UNIQUE constraint failed: k_check_stale). A fresh org never hits it (no stale
-- row exists at import time); live did. THE FIX: the same 13 triggers, byte-identical, with each INSERT OR IGNORE made an
-- explicit upsert (ON CONFLICT <pk> DO NOTHING), which an outer clause never overrides. The inner ON CONFLICT DO UPDATE
-- upserts (k_fill, k_node_stale) were already explicit and are unchanged. No table, column, index or row changes.
-- ORDER: live BEFORE resuming the sprint-4 import (the import's node batches fire these triggers).

DROP TRIGGER k_checks_refs_insert;
CREATE TRIGGER k_checks_refs_insert
AFTER INSERT ON k_checks
BEGIN
  INSERT INTO k_check_refs (project, ref, check_id)
    SELECT NEW.project, value, NEW.id FROM json_each(COALESCE(NEW.refs, '[]')) WHERE type = 'text' ON CONFLICT (project, ref, check_id) DO NOTHING;
END;

DROP TRIGGER k_checks_refs_update;
CREATE TRIGGER k_checks_refs_update
AFTER UPDATE OF refs ON k_checks
BEGIN
  DELETE FROM k_check_refs WHERE project = OLD.project AND check_id = OLD.id
    AND ref IN (SELECT value FROM json_each(COALESCE(OLD.refs, '[]')));
  INSERT INTO k_check_refs (project, ref, check_id)
    SELECT NEW.project, value, NEW.id FROM json_each(COALESCE(NEW.refs, '[]')) WHERE type = 'text' ON CONFLICT (project, ref, check_id) DO NOTHING;
END;

DROP TRIGGER k_checks_ungraded_insert;
CREATE TRIGGER k_checks_ungraded_insert
AFTER INSERT ON k_checks
WHEN NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = NEW.project AND g.check_id = NEW.id)
BEGIN
  INSERT INTO k_check_ungraded (project, check_id) VALUES (NEW.project, NEW.id) ON CONFLICT (project, check_id) DO NOTHING;
END;

DROP TRIGGER k_stale_grade_insert;
CREATE TRIGGER k_stale_grade_insert
AFTER INSERT ON check_results
WHEN NOT EXISTS (SELECT 1 FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id
  AND (x.graded_at > NEW.graded_at OR (x.graded_at = NEW.graded_at AND x.id > NEW.id)))
  AND EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id)
BEGIN
  UPDATE k_node_stale SET stale = stale + (COALESCE(NEW.graded_at < changed_at, 0) - COALESCE((SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at, 0)), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE project = NEW.project AND node_id IN (SELECT r.ref FROM k_check_refs r WHERE r.project = NEW.project AND r.check_id = NEW.check_id)
      AND COALESCE(NEW.graded_at < changed_at, 0) <> COALESCE((SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at, 0);
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

DROP TRIGGER k_stale_grade_delete;
CREATE TRIGGER k_stale_grade_delete
AFTER DELETE ON check_results
WHEN NOT EXISTS (SELECT 1 FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id
  AND (x.graded_at > OLD.graded_at OR (x.graded_at = OLD.graded_at AND x.id > OLD.id)))
  AND EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id)
BEGIN
  UPDATE k_node_stale SET stale = stale + (COALESCE((SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at, 0) - COALESCE(OLD.graded_at < changed_at, 0)), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE project = OLD.project AND node_id IN (SELECT r.ref FROM k_check_refs r WHERE r.project = OLD.project AND r.check_id = OLD.check_id)
      AND COALESCE((SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at, 0) <> COALESCE(OLD.graded_at < changed_at, 0);
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

DROP TRIGGER k_stale_grade_update;
CREATE TRIGGER k_stale_grade_update
AFTER UPDATE OF project, check_id, graded_at ON check_results
BEGIN
  UPDATE k_node_stale SET stale = (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = k_node_stale.project AND cr.ref = k_node_stale.node_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = cr.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < k_node_stale.changed_at), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE (project, node_id) IN (SELECT r.project, r.ref FROM k_check_refs r WHERE (r.project = OLD.project AND r.check_id = OLD.check_id) OR (r.project = NEW.project AND r.check_id = NEW.check_id))
      AND stale <> (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = k_node_stale.project AND cr.ref = k_node_stale.node_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = cr.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < k_node_stale.changed_at);
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

DROP TRIGGER k_stale_ref_insert;
CREATE TRIGGER k_stale_ref_insert
AFTER INSERT ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = NEW.project AND s.node_id = NEW.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = NEW.project AND node_id = NEW.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

DROP TRIGGER k_stale_ref_delete;
CREATE TRIGGER k_stale_ref_delete
AFTER DELETE ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = OLD.project AND s.node_id = OLD.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale - 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = OLD.project AND node_id = OLD.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

DROP TRIGGER k_stale_ref_update;
CREATE TRIGGER k_stale_ref_update
AFTER UPDATE ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = OLD.project AND s.node_id = OLD.ref) OR EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = NEW.project AND s.node_id = NEW.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale - 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = OLD.project AND node_id = OLD.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  UPDATE k_node_stale SET stale = stale + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = NEW.project AND node_id = NEW.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

DROP TRIGGER k_stale_node_insert;
CREATE TRIGGER k_stale_node_insert
AFTER INSERT ON k_nodes
WHEN EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = NEW.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT NEW.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

DROP TRIGGER k_stale_node_update;
CREATE TRIGGER k_stale_node_update
AFTER UPDATE OF type, name, status, data ON k_nodes
WHEN (OLD.type IS NOT NEW.type OR OLD.name IS NOT NEW.name OR OLD.status IS NOT NEW.status OR OLD.data IS NOT NEW.data)
  AND EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = NEW.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT NEW.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

DROP TRIGGER k_stale_node_delete;
CREATE TRIGGER k_stale_node_delete
AFTER DELETE ON k_nodes
WHEN EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = OLD.project AND l.node_id = OLD.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref IN (SELECT OLD.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO k_check_stale (project, check_id)
    SELECT DISTINCT OLD.project, cr.check_id FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref IN (SELECT OLD.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT OLD.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT OLD.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = OLD.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

DROP TRIGGER k_stale_contribution;
CREATE TRIGGER k_stale_contribution
AFTER INSERT ON transmission
WHEN LOWER(NEW.lane) IN ('code','design') AND NEW.project IS NOT NULL
  AND (NEW.eval = 0 OR EXISTS (SELECT 1 FROM projects ep WHERE ep.key = NEW.project AND ep.eval = 1))
  AND (COALESCE(NEW.touches, '') <> '' OR COALESCE(NEW.components, '') <> '' OR COALESCE(NEW.screens, '') <> '')
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, NEW.created_at, NEW.id, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;
