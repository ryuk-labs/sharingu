-- migrate-054.sql — stale proof by change, and the Goals period by when the work happened (sprint 3, B4; docs/plan/MCP.md §0
-- "a light goes STALE when what it proves changes after the grade", ARCHITECTURE.md §12). EXPAND-ONLY: two new tables
-- (k_node_stale, k_check_stale), four indexes, ten new triggers, migrate-042's three transmission_goals triggers replaced
-- (dropped and created again, the month re-keyed) and the backfill that makes every derived row exact. No existing column or
-- row of any other table changes (k_fill gains rows of a new kind, 'stale'). Applied live with tools/migrate.sh (a bookmark
-- first), BEFORE the code that reads it ships. Re-running the file recomputes, never doubles, and never replaces a trigger a
-- later migration owns (057, 062: see the triggers below); a replay of the whole chain (migrate-031/032 drop every trigger here
-- that reads check_results) puts every trigger back, the later migrations' versions last.
--
-- THE RULE. A check's grade is STALE at a node it names when the node CHANGED after the grade (the check's latest grade:
-- check_results newest by graded_at then id, migrate-043's own order). What counts as the node changing:
--   · a knowledge write that changes one of its fields (type, name, status, data; an unchanged upsert writes nothing, so it
--     changes nothing), or the node added or removed;
--   · a render of the screen added, or replaced (its hash, format, style or artifact moved);
--   · a FILED contribution in a lane that changes things (code, design), not a suite row, that names it in touches,
--     components or screens (a screen number n is the node screen:n). A note, an answer, a GTM post or a grade does not
--     change what proof proves, so it never makes proof stale.
-- A change is recorded only where a GRADED check names the node (its light is green, amber or red): with no grade there is no
-- proof to put in question, so an import, a fresh fill and every change to an ungraded node write nothing at all. A regrade
-- (submit_grade, a grade through preview/file) is made after the change, so it is fresh again.
--
-- THE ROWS (each kept exact by the triggers below; tools/impact-selftest.mjs proves all three against a recount after
-- thousands of random writes, both ways):
--   · k_node_stale (project, node_id): one row per node that changed while a graded check named it: changed_at (the last such
--     change), changed_by (the contribution that changed it, or NULL for a knowledge write), stale = how many checks naming it
--     have their latest grade before changed_at ("3 of 5 checks graded before the last change"), updated_at (when the row
--     moved: GET /map/lights reads the stale marks that moved since a moment, idx_k_node_stale_at). WITHOUT ROWID: read and
--     written by its key. The Map reads the stale marks of the project in one range of idx_k_node_stale_on (the rows with
--     stale > 0 only), never a check.
--   · k_check_stale (project, check_id): the checks whose latest grade is older than a change of a node they name. The
--     checklist's "grades" item counts a stale grade as not done; What is missing names the first one to regrade.
--   · k_fill (project, 'stale').n: how many checks are stale (the count of k_check_stale's rows), read with the meter's own
--     k_fill row (no statement of its own). A row whose n falls to 0 stays as a zero and reads as none.
-- WRITE COST. A change writes, only where a graded check names the node: the node's k_node_stale row (1), each check newly
-- stale (1 each, k_check_stale) and the count (1, k_fill). A grade writes only when the check it grades was stale somewhere:
-- each k_node_stale row whose count moves, the k_check_stale row removed and the count. Nothing else: a fresh five-project
-- import writes the same rows as before this file (measured: engine/.runs/import-cost-*.json, before and after).
--
-- THE GOALS PERIOD. migrate-042's transmission_goals tally bucketed a landed contribution by the month it was FILED, while
-- Home's goals moved (sprint 3, happenedAt) counts by when the work HAPPENED. Its three triggers are replaced to key the month
-- on COALESCE(happened_at, created_at) (happened_at is never later than created_at, migrate-051), the update trigger also
-- watches happened_at, and the tally is recomputed. GOALS_AGG_SQL reads it unchanged.
--
-- THE AGE INDEXES. idx_k_cards_as_of and idx_k_docs_as_of hold only the cards and docs that carry an as_of date (partial), so
-- the checklist's freshness items read the dated items alone (stale by age is computed on read, src/knowledge/fresh.js).

CREATE TABLE IF NOT EXISTS k_node_stale (
  project    TEXT NOT NULL,
  node_id    TEXT NOT NULL,              -- a k_nodes id (a screen, a door, any node a check names) that changed while graded
  changed_at TEXT NOT NULL,              -- the last such change (ISO, UTC)
  changed_by TEXT,                       -- the contribution that changed it (T-…), NULL for a knowledge write
  stale      INTEGER NOT NULL DEFAULT 0, -- checks naming it whose latest grade is older than changed_at
  updated_at TEXT NOT NULL,              -- when this row last moved (the lights poll)
  PRIMARY KEY (project, node_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS k_check_stale (
  project  TEXT NOT NULL,
  check_id TEXT NOT NULL,                -- a k_checks id whose latest grade is older than a change of a node it names
  PRIMARY KEY (project, check_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_k_node_stale_on ON k_node_stale(project, node_id) WHERE stale > 0;

CREATE INDEX IF NOT EXISTS idx_k_node_stale_at ON k_node_stale(project, updated_at);

CREATE INDEX IF NOT EXISTS idx_k_cards_as_of ON k_cards(project, as_of) WHERE as_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_k_docs_as_of ON k_docs(project, as_of) WHERE as_of IS NOT NULL;

-- ---- the stale-by-change triggers (10) ----
DROP TRIGGER IF EXISTS k_stale_grade_insert;
DROP TRIGGER IF EXISTS k_stale_grade_delete;
DROP TRIGGER IF EXISTS k_stale_grade_update;
DROP TRIGGER IF EXISTS k_stale_ref_insert;
DROP TRIGGER IF EXISTS k_stale_ref_delete;
DROP TRIGGER IF EXISTS k_stale_ref_update;
DROP TRIGGER IF EXISTS k_stale_node_insert;
DROP TRIGGER IF EXISTS k_stale_node_update;
DROP TRIGGER IF EXISTS k_stale_node_delete;
-- G2 item 9 (the independent review): a re-run of this file after migrate-057 and migrate-062 used to put back what they
-- changed (062's eval-project term in k_stale_contribution was lost, and 057's removal of the two render triggers undone). So:
--   · k_stale_contribution is NOT dropped here, only created IF NOT EXISTS below: made where missing (a fresh chain, then 062
--     replaces it; a replay from 031, which drops every trigger that reads check_results), never replacing 062's;
--   · the two render triggers (k_stale_render_insert, k_stale_render_update) are no longer created at all: migrate-057 removed
--     them by the owner's ruling (a new picture of a screen does not make its grades stale); 057 stays, for a database that
--     ran this file before the change. This file is not live (live is at migrate-046), and the change is a no-op on any
--     database that holds 057 and 062.
CREATE TRIGGER IF NOT EXISTS k_stale_grade_insert
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
  INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
END;

CREATE TRIGGER IF NOT EXISTS k_stale_grade_delete
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
  INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
END;

CREATE TRIGGER IF NOT EXISTS k_stale_grade_update
AFTER UPDATE OF project, check_id, graded_at ON check_results
BEGIN
  UPDATE k_node_stale SET stale = (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = k_node_stale.project AND cr.ref = k_node_stale.node_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = cr.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < k_node_stale.changed_at), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE (project, node_id) IN (SELECT r.project, r.ref FROM k_check_refs r WHERE (r.project = OLD.project AND r.check_id = OLD.check_id) OR (r.project = NEW.project AND r.check_id = NEW.check_id))
      AND stale <> (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = k_node_stale.project AND cr.ref = k_node_stale.node_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = cr.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < k_node_stale.changed_at);
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
END;

CREATE TRIGGER IF NOT EXISTS k_stale_ref_insert
AFTER INSERT ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = NEW.project AND s.node_id = NEW.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = NEW.project AND node_id = NEW.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
END;

CREATE TRIGGER IF NOT EXISTS k_stale_ref_delete
AFTER DELETE ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = OLD.project AND s.node_id = OLD.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale - 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = OLD.project AND node_id = OLD.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
END;

CREATE TRIGGER IF NOT EXISTS k_stale_ref_update
AFTER UPDATE ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = OLD.project AND s.node_id = OLD.ref) OR EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = NEW.project AND s.node_id = NEW.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale - 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = OLD.project AND node_id = OLD.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  UPDATE k_node_stale SET stale = stale + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = NEW.project AND node_id = NEW.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
END;

CREATE TRIGGER IF NOT EXISTS k_stale_node_insert
AFTER INSERT ON k_nodes
WHEN EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = NEW.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT OR IGNORE INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT NEW.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_node_update
AFTER UPDATE OF type, name, status, data ON k_nodes
WHEN (OLD.type IS NOT NEW.type OR OLD.name IS NOT NEW.name OR OLD.status IS NOT NEW.status OR OLD.data IS NOT NEW.data)
  AND EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = NEW.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT OR IGNORE INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT NEW.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_node_delete
AFTER DELETE ON k_nodes
WHEN EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = OLD.project AND l.node_id = OLD.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref IN (SELECT OLD.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT OR IGNORE INTO k_check_stale (project, check_id)
    SELECT DISTINCT OLD.project, cr.check_id FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref IN (SELECT OLD.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT OLD.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT OLD.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = OLD.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

-- (k_stale_render_insert and k_stale_render_update are no longer created here: migrate-057 removed them by the owner's ruling,
-- a new picture of a screen does not make its grades stale, and a re-run of this file used to put them back. G2 item 9.)
CREATE TRIGGER IF NOT EXISTS k_stale_contribution
AFTER INSERT ON transmission
WHEN LOWER(NEW.lane) IN ('code','design') AND NEW.eval = 0 AND NEW.project IS NOT NULL
  AND (COALESCE(NEW.touches, '') <> '' OR COALESCE(NEW.components, '') <> '' OR COALESCE(NEW.screens, '') <> '')
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT OR IGNORE INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, NEW.created_at, NEW.id, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

-- ---- the Goals period by when the work happened: migrate-042's three transmission_goals triggers, the month re-keyed ----
-- sprint 6: migrate-067 owns these three triggers now (the bucket per org), so this file no longer drops them (a replay of it
-- would put this version back over 067's); created IF NOT EXISTS below, made where missing, never replacing 067's.
CREATE TRIGGER IF NOT EXISTS transmission_goals_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(NEW.project, ''), CASE WHEN NEW.eval = 0 AND (NEW.what IS NULL OR (NEW.what NOT LIKE '%eval probe%' AND NEW.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(NEW.happened_at, NEW.created_at), 1, 7), CASE WHEN NEW.goal_ref IS NULL THEN '' ELSE '=' || NEW.goal_ref END , LOWER(NEW.lane), CASE WHEN COALESCE(NEW.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(NEW.kind, '') ELSE '*' END ,
      1, 1 * COALESCE(NEW.outcome, 0), 1 * (NEW.outcome IS NULL), 1 * (NEW.outcome IS NULL AND (NEW.actual IS NULL OR NEW.actual = ''))
    WHERE (NEW.route = 'auto' OR NEW.decision = 'approve') AND CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

CREATE TRIGGER IF NOT EXISTS transmission_goals_update
AFTER UPDATE OF route, decision, kind, gaprefs, components, eval, what, project, created_at, happened_at, goal_ref, lane, outcome, actual ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(OLD.project, ''), CASE WHEN OLD.eval = 0 AND (OLD.what IS NULL OR (OLD.what NOT LIKE '%eval probe%' AND OLD.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(OLD.happened_at, OLD.created_at), 1, 7), CASE WHEN OLD.goal_ref IS NULL THEN '' ELSE '=' || OLD.goal_ref END , LOWER(OLD.lane), CASE WHEN COALESCE(OLD.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(OLD.kind, '') ELSE '*' END ,
      -1, -1 * COALESCE(OLD.outcome, 0), -1 * (OLD.outcome IS NULL), -1 * (OLD.outcome IS NULL AND (OLD.actual IS NULL OR OLD.actual = ''))
    WHERE (OLD.route = 'auto' OR OLD.decision = 'approve') AND CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(NEW.project, ''), CASE WHEN NEW.eval = 0 AND (NEW.what IS NULL OR (NEW.what NOT LIKE '%eval probe%' AND NEW.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(NEW.happened_at, NEW.created_at), 1, 7), CASE WHEN NEW.goal_ref IS NULL THEN '' ELSE '=' || NEW.goal_ref END , LOWER(NEW.lane), CASE WHEN COALESCE(NEW.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(NEW.kind, '') ELSE '*' END ,
      1, 1 * COALESCE(NEW.outcome, 0), 1 * (NEW.outcome IS NULL), 1 * (NEW.outcome IS NULL AND (NEW.actual IS NULL OR NEW.actual = ''))
    WHERE (NEW.route = 'auto' OR NEW.decision = 'approve') AND CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

CREATE TRIGGER IF NOT EXISTS transmission_goals_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(OLD.project, ''), CASE WHEN OLD.eval = 0 AND (OLD.what IS NULL OR (OLD.what NOT LIKE '%eval probe%' AND OLD.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(OLD.happened_at, OLD.created_at), 1, 7), CASE WHEN OLD.goal_ref IS NULL THEN '' ELSE '=' || OLD.goal_ref END , LOWER(OLD.lane), CASE WHEN COALESCE(OLD.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(OLD.kind, '') ELSE '*' END ,
      -1, -1 * COALESCE(OLD.outcome, 0), -1 * (OLD.outcome IS NULL), -1 * (OLD.outcome IS NULL AND (OLD.actual IS NULL OR OLD.actual = ''))
    WHERE (OLD.route = 'auto' OR OLD.decision = 'approve') AND CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

-- ---- the backfill: every derived row from the rows as they stand (a re-run recomputes, never doubles) ----
UPDATE k_node_stale SET stale = (SELECT COUNT(*) FROM k_check_refs x WHERE x.project = k_node_stale.project AND x.ref = k_node_stale.node_id
    AND (SELECT g.graded_at FROM check_results g WHERE g.project = x.project AND g.check_id = x.check_id ORDER BY g.graded_at DESC, g.id DESC LIMIT 1) < k_node_stale.changed_at)
  WHERE stale <> (SELECT COUNT(*) FROM k_check_refs x WHERE x.project = k_node_stale.project AND x.ref = k_node_stale.node_id
    AND (SELECT g.graded_at FROM check_results g WHERE g.project = x.project AND g.check_id = x.check_id ORDER BY g.graded_at DESC, g.id DESC LIMIT 1) < k_node_stale.changed_at);
DELETE FROM k_check_stale;
INSERT OR IGNORE INTO k_check_stale (project, check_id)
  SELECT DISTINCT r.project, r.check_id FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref
  WHERE (SELECT g.graded_at FROM check_results g WHERE g.project = r.project AND g.check_id = r.check_id ORDER BY g.graded_at DESC, g.id DESC LIMIT 1) < s.changed_at;
DELETE FROM k_fill WHERE kind = 'stale';
INSERT OR REPLACE INTO k_fill (project, kind, n) SELECT project, 'stale', COUNT(*) FROM k_check_stale GROUP BY project;

DELETE FROM transmission_goals;
INSERT OR REPLACE INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
  SELECT COALESCE(project, ''),
    CASE WHEN eval = 0 AND (what IS NULL OR (what NOT LIKE '%eval probe%' AND what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END ,
    substr(COALESCE(happened_at, created_at), 1, 7), CASE WHEN goal_ref IS NULL THEN '' ELSE '=' || goal_ref END , LOWER(lane),
    CASE WHEN COALESCE(kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(kind, '') ELSE '*' END ,
    COUNT(*), COALESCE(SUM(outcome), 0), SUM(outcome IS NULL), SUM(outcome IS NULL AND (actual IS NULL OR actual = ''))
  FROM transmission WHERE (route = 'auto' OR decision = 'approve') AND CASE WHEN (gaprefs IS NULL OR gaprefs NOT LIKE '%mind/%') AND (components IS NULL OR components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0 GROUP BY 1, 2, 3, 4, 5, 6;
