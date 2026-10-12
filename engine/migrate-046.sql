-- migrate-046.sql — screens and renders, the standard (docs/plan/ARCHITECTURE.md §11, sprint 2). EXPAND-ONLY: three new
-- tables, four triggers and two indexes; no existing table, column or row changes (the backfill only fills the new derived
-- table). The worker before this file never reads them; the worker after it reads them only through the knowledge door (write_knowledge kinds render and style,
-- read_knowledge, GET /map/screens, GET /render/:hash), so a database without this file answers those with an error and
-- every other screen as before. Applied live with tools/migrate.sh (a bookmark first).
--
-- A render's or a style's BODY is not here: it is an R2 object at renders/<project>/<sha256> (content-addressed,
-- immutable, never deleted yet). D1 keeps the INDEX: one row per render, one per style, each naming its body by hash.
--   · k_renders: one row per (project, screen, state, variant). state and variant are '' when the render is the screen as
--     a whole (NOT NULL: a NULL in a primary key column would let two rows share a key). The primary key's prefix
--     (project, screen) IS "a project's renders by screen" (the write door reads a screen's renders on it; the Screens view
--     reads k_screen_renders below), so no second index on screen is kept (each index costs a row written per insert).
--   · idx_k_renders_hash (project, hash): GET /render/:hash finds the render (its format and its style) by the body's hash,
--     and the write door skips the put of a body the project already holds, one probe each.
--   · k_styles: one row per (project, id): a stylesheet many html renders share.
--   · k_nodes_screen_renders_delete: a screen node deleted takes its renders' index rows with it (their bodies stay in R2),
--     as removing a node takes its edges — done by the database, so the worker's node removal reads and writes exactly
--     what it did before this file on a database that has not run it.
--   · idx_k_nodes_screen_surface: the screen nodes of ONE surface (app), by data.surface, so the Screens view reads one
--     surface's screens and never the project's whole model. Partial: only screen nodes are indexed (one row written per
--     screen node filed, none for any other node). The read's WHERE repeats the expression byte for byte.
--   · k_screen_renders: per screen with at least one render, its renders' index as ONE JSON array of [state, variant, format,
--     hash, bytes, width, height, style] in key order, kept exact by three triggers on k_renders (an insert, an update or a
--     delete rebuilds that screen's array from its own rows: the primary key's prefix, never the project's renders; a screen
--     left with none loses its row). Nothing in the worker writes it. The Screens view reads one row per screen instead of
--     one per render (saruspay's web surface: 75 rows instead of 587). One row written per render written. Derived, like
--     k_node_links: a restore of k_renders rebuilds it through the same triggers. The backfill at the end fills it for the
--     renders already filed (re-running the file recomputes it).

CREATE TABLE IF NOT EXISTS k_renders (
  project    TEXT NOT NULL REFERENCES projects(key),
  screen     TEXT NOT NULL,                 -- a k_nodes id of type screen (checked by the write door; removing the node removes its renders)
  state      TEXT NOT NULL DEFAULT '',      -- one of the screen's data.states, or '' (the screen as a whole)
  variant    TEXT NOT NULL DEFAULT '',      -- a take of the frame (live, proposed, wireframe …), or ''
  format     TEXT NOT NULL CHECK (format IN ('html', 'image', 'wireframe')),
  artifact   TEXT,                          -- an image render's banked artifact id (its bytes are copied to the body's key)
  style      TEXT,                          -- an html render's k_styles id
  width      INTEGER,
  height     INTEGER,
  hash       TEXT NOT NULL CHECK (length(hash) = 64),   -- the body's sha256: its R2 key is renders/<project>/<hash>
  bytes      INTEGER NOT NULL,              -- the body's size as stored
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, screen, state, variant)
);

CREATE TABLE IF NOT EXISTS k_styles (
  project    TEXT NOT NULL REFERENCES projects(key),
  id         TEXT NOT NULL,
  hash       TEXT NOT NULL CHECK (length(hash) = 64),   -- the stylesheet's sha256: renders/<project>/<hash>
  bytes      INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, id)
);

CREATE INDEX IF NOT EXISTS idx_k_renders_hash ON k_renders(project, hash);

CREATE INDEX IF NOT EXISTS idx_k_nodes_screen_surface ON k_nodes(project, json_extract(data, '$.surface')) WHERE type = 'screen';

-- a screen node removed (write_knowledge remove, a restore that replaces it) removes its renders' index rows
CREATE TRIGGER IF NOT EXISTS k_nodes_screen_renders_delete
AFTER DELETE ON k_nodes
WHEN OLD.type = 'screen'
BEGIN
  DELETE FROM k_renders WHERE project = OLD.project AND screen = OLD.id;
END;

-- one row per screen: its renders' index (derived from k_renders by the triggers below)
CREATE TABLE IF NOT EXISTS k_screen_renders (
  project TEXT NOT NULL,
  screen  TEXT NOT NULL,                    -- a k_renders screen with at least one render
  renders TEXT NOT NULL,                    -- [[state, variant, format, hash, bytes, width, height, style], …] in key order
  PRIMARY KEY (project, screen)
);

CREATE TRIGGER IF NOT EXISTS k_screen_renders_insert
AFTER INSERT ON k_renders
BEGIN
  INSERT INTO k_screen_renders (project, screen, renders)
    SELECT NEW.project, NEW.screen, json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
    FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.screen
    ON CONFLICT (project, screen) DO UPDATE SET renders = excluded.renders;
END;

CREATE TRIGGER IF NOT EXISTS k_screen_renders_update
AFTER UPDATE ON k_renders
BEGIN
  DELETE FROM k_screen_renders WHERE project = OLD.project AND screen = OLD.screen
    AND NOT EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.screen);
  UPDATE k_screen_renders SET renders = (SELECT json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
      FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.screen)
    WHERE project = OLD.project AND screen = OLD.screen AND (OLD.project <> NEW.project OR OLD.screen <> NEW.screen);
  INSERT INTO k_screen_renders (project, screen, renders)
    SELECT NEW.project, NEW.screen, json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
    FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.screen
    ON CONFLICT (project, screen) DO UPDATE SET renders = excluded.renders;
END;

CREATE TRIGGER IF NOT EXISTS k_screen_renders_delete
AFTER DELETE ON k_renders
BEGIN
  DELETE FROM k_screen_renders WHERE project = OLD.project AND screen = OLD.screen
    AND NOT EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.screen);
  UPDATE k_screen_renders SET renders = (SELECT json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
      FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.screen)
    WHERE project = OLD.project AND screen = OLD.screen;
END;

-- the renders already filed (a database the importer filled before this file's triggers existed)
INSERT OR REPLACE INTO k_screen_renders (project, screen, renders)
  SELECT r.project, r.screen, json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
  FROM (SELECT * FROM k_renders ORDER BY project, screen, state, variant) r GROUP BY r.project, r.screen;
