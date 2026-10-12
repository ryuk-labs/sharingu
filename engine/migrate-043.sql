-- migrate-043.sql — the Map, the main tab (sprint 2): a node's LIGHT and a node's LINKS, each one row per node, kept exact
-- by triggers, so the Map reads one row per node instead of every check that names it and every edge it has. EXPAND-ONLY:
-- two new tables, their nine triggers, three indexes and the backfill that fills the new tables. No existing table,
-- column or row changes. Applied live with tools/migrate.sh (a bookmark first); the backfill at the end runs in the same
-- file, so both tables are exact the moment the file has run (re-running the file recomputes them).
--
-- THE LIGHTS. k_node_lights holds, per ref a check names (a node id, a goal id or a question id: one element of
-- k_checks.refs, one k_check_refs row per check), how many of the checks naming it have their LATEST grade (check_results,
-- newest by graded_at then id) proven (green), refused (red), any other verdict (amber: graded, not passing) or no grade at
-- all (grey). light is derived from the four exactly as src/knowledge/checks.js lightOf: grey when none is graded, red when
-- one fails, green when every one passes, amber otherwise. updated_at moves whenever the row changes: GET /map/lights?since=
-- reads the rows that changed since a moment (idx_k_node_lights_at), one indexed statement. Nothing in the worker writes the
-- table; its triggers do:
--   · k_check_refs insert / delete / update (a check starts or stops naming a ref; migrate-040's triggers keep k_check_refs
--     from k_checks.refs): the ref counts, or stops counting, that check's latest verdict (one index probe);
--   · check_results insert: when the new grade IS its check's latest, every ref of the check moves one count from the
--     previous latest verdict (or grey) to the new one (idx_k_check_refs_check finds the refs, never a scan); a backdated
--     grade that is not the latest changes nothing;
--   · check_results delete: when the removed grade WAS its check's latest, every ref moves back to the new latest (or grey);
--   · check_results update (no path in the worker updates a grade; kept exact anyway): every ref of the old and the new
--     check is recomputed from its checks.
-- A row whose counts fall to zero (no check names the ref any more) stays as zeros; its light is grey and every read of
-- lights skips grey (idx_k_node_lights_lit holds the lit rows only).
--
-- THE LINKS. k_node_links holds, per node with at least one edge out of it, those edges as ONE JSON array of [to_id, kind]
-- (the order carries no meaning). Kept by three triggers on k_edges: an insert appends, a delete or a change of a key column
-- rebuilds that node's array from its own edges (the primary key's prefix, never the project's edges); a node left with no
-- edge out loses its row. The Map reads the project's links in one row per node (saruspay: 1,131 edges in 379 rows).

CREATE TABLE IF NOT EXISTS k_node_lights (
  project    TEXT NOT NULL,
  node_id    TEXT NOT NULL,             -- a ref a check names: a node id, a goal id or a question id
  green      INTEGER NOT NULL DEFAULT 0, -- checks naming it whose latest grade is proven
  red        INTEGER NOT NULL DEFAULT 0, -- ... refused
  amber      INTEGER NOT NULL DEFAULT 0, -- ... any other verdict (graded, not passing: incomplete)
  grey       INTEGER NOT NULL DEFAULT 0, -- ... with no grade yet
  light      TEXT GENERATED ALWAYS AS (CASE WHEN green + red + amber = 0 THEN 'grey' WHEN red > 0 THEN 'red' WHEN amber = 0 AND grey = 0 THEN 'green' ELSE 'amber' END) STORED,
  updated_at TEXT NOT NULL DEFAULT '',   -- when the row last changed (ISO, UTC)
  PRIMARY KEY (project, node_id)
);

CREATE TABLE IF NOT EXISTS k_node_links (
  project TEXT NOT NULL,
  node_id TEXT NOT NULL,                -- a k_nodes id with at least one edge out of it
  links   TEXT NOT NULL,                -- its out edges: a JSON array of [to_id, kind]
  PRIMARY KEY (project, node_id)
);

CREATE INDEX IF NOT EXISTS idx_k_check_refs_check ON k_check_refs(project, check_id, ref);

CREATE INDEX IF NOT EXISTS idx_k_node_lights_lit ON k_node_lights(project, node_id) WHERE light <> 'grey';

CREATE INDEX IF NOT EXISTS idx_k_node_lights_at ON k_node_lights(project, updated_at);

CREATE TRIGGER IF NOT EXISTS k_node_lights_ref_insert
AFTER INSERT ON k_check_refs
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT NEW.project, NEW.ref, p.s IS 'proven', p.s IS 'refused', p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused', p.s IS NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT (SELECT x.status FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p WHERE 1
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_ref_delete
AFTER DELETE ON k_check_refs
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT OLD.project, OLD.ref, -(p.s IS 'proven'), -(p.s IS 'refused'), -(p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused'), -(p.s IS NULL), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT (SELECT x.status FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p WHERE 1
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_ref_update
AFTER UPDATE ON k_check_refs
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT OLD.project, OLD.ref, -(p.s IS 'proven'), -(p.s IS 'refused'), -(p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused'), -(p.s IS NULL), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT (SELECT x.status FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p WHERE 1
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT NEW.project, NEW.ref, p.s IS 'proven', p.s IS 'refused', p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused', p.s IS NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT (SELECT x.status FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p WHERE 1
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_grade_insert
AFTER INSERT ON check_results
WHEN NOT EXISTS (SELECT 1 FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id
  AND (x.graded_at > NEW.graded_at OR (x.graded_at = NEW.graded_at AND x.id > NEW.id)))
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT r.project, r.ref, (NEW.status IS 'proven') - (p.s IS 'proven'), (NEW.status IS 'refused') - (p.s IS 'refused'),
      (NEW.status IS NOT 'proven' AND NEW.status IS NOT 'refused') - (p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused'), -(p.s IS NULL),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM k_check_refs r, (SELECT (SELECT x.status FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id
      ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p
    WHERE r.project = NEW.project AND r.check_id = NEW.check_id
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_grade_delete
AFTER DELETE ON check_results
WHEN NOT EXISTS (SELECT 1 FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id
  AND (x.graded_at > OLD.graded_at OR (x.graded_at = OLD.graded_at AND x.id > OLD.id)))
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT r.project, r.ref, (p.s IS 'proven') - (OLD.status IS 'proven'), (p.s IS 'refused') - (OLD.status IS 'refused'),
      (p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused') - (OLD.status IS NOT 'proven' AND OLD.status IS NOT 'refused'), p.s IS NULL,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM k_check_refs r, (SELECT (SELECT x.status FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id
      ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p
    WHERE r.project = OLD.project AND r.check_id = OLD.check_id
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_grade_update
AFTER UPDATE OF project, check_id, status, graded_at ON check_results
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT r.project, r.ref, COALESCE(SUM(g.status IS 'proven'), 0), COALESCE(SUM(g.status IS 'refused'), 0),
      COALESCE(SUM(g.id IS NOT NULL AND g.status IS NOT 'proven' AND g.status IS NOT 'refused'), 0), COALESCE(SUM(g.id IS NULL), 0),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM k_check_refs r LEFT JOIN check_results g ON g.id = (SELECT x.id FROM check_results x WHERE x.project = r.project AND x.check_id = r.check_id
      ORDER BY x.graded_at DESC, x.id DESC LIMIT 1)
    WHERE (r.project, r.ref) IN (SELECT project, ref FROM k_check_refs WHERE (project = OLD.project AND check_id = OLD.check_id) OR (project = NEW.project AND check_id = NEW.check_id))
    GROUP BY r.project, r.ref
    ON CONFLICT (project, node_id) DO UPDATE SET green = excluded.green, red = excluded.red, amber = excluded.amber, grey = excluded.grey,
      updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_links_insert
AFTER INSERT ON k_edges
BEGIN
  INSERT INTO k_node_links (project, node_id, links) VALUES (NEW.project, NEW.from_id, json_array(json_array(NEW.to_id, NEW.kind)))
    ON CONFLICT (project, node_id) DO UPDATE SET links = json_insert(links, '$[#]', json_array(NEW.to_id, NEW.kind));
END;

CREATE TRIGGER IF NOT EXISTS k_node_links_delete
AFTER DELETE ON k_edges
BEGIN
  DELETE FROM k_node_links WHERE project = OLD.project AND node_id = OLD.from_id
    AND NOT EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.from_id);
  UPDATE k_node_links SET links = (SELECT json_group_array(json_array(e.to_id, e.kind)) FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.from_id)
    WHERE project = OLD.project AND node_id = OLD.from_id;
END;

CREATE TRIGGER IF NOT EXISTS k_node_links_update
AFTER UPDATE OF project, from_id, to_id, kind ON k_edges
BEGIN
  DELETE FROM k_node_links WHERE project = OLD.project AND node_id = OLD.from_id
    AND NOT EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.from_id);
  UPDATE k_node_links SET links = (SELECT json_group_array(json_array(e.to_id, e.kind)) FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.from_id)
    WHERE project = OLD.project AND node_id = OLD.from_id;
  INSERT INTO k_node_links (project, node_id, links)
    SELECT NEW.project, NEW.from_id, json_group_array(json_array(e.to_id, e.kind)) FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.from_id
    ON CONFLICT (project, node_id) DO UPDATE SET links = excluded.links;
END;

-- the backfill: both tables from the rows as they stand (DELETE first, so a re-run recomputes instead of doubling; OR
-- REPLACE, so a row written between a DELETE and its INSERT is counted once, by the recomputation)
DELETE FROM k_node_lights;
INSERT OR REPLACE INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
  SELECT r.project, r.ref, COALESCE(SUM(g.status IS 'proven'), 0), COALESCE(SUM(g.status IS 'refused'), 0),
    COALESCE(SUM(g.id IS NOT NULL AND g.status IS NOT 'proven' AND g.status IS NOT 'refused'), 0), COALESCE(SUM(g.id IS NULL), 0),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM k_check_refs r LEFT JOIN check_results g ON g.id = (SELECT x.id FROM check_results x WHERE x.project = r.project AND x.check_id = r.check_id
    ORDER BY x.graded_at DESC, x.id DESC LIMIT 1)
  GROUP BY r.project, r.ref;

DELETE FROM k_node_links;
INSERT OR REPLACE INTO k_node_links (project, node_id, links)
  SELECT project, from_id, json_group_array(json_array(to_id, kind)) FROM k_edges GROUP BY project, from_id;
