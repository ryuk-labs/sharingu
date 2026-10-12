-- migrate-065.sql — a screen's takes: the frame's history, so replacing a picture is visible and reversible (sprint 4, M6; the
-- owner's ruling in docs/plan/SPRINTS.md M6: "a previous takes strip on a screen — the replaced bodies are still in storage by
-- hash, the index keeps only the newest"). EXPAND-ONLY: one new table, two indexes, two triggers and the backfill of the new
-- table; no existing table, column, row, index or trigger changes.
--
-- WHAT A TAKE IS. A render (k_renders, migrate-046) is ONE frame of a screen, keyed (project, screen, state, variant): an upsert
-- with a new body replaces its hash, and the old body stays in R2 at renders/<project>/<hash> (bodies are never deleted), named
-- by nothing. k_screen_takes names every body a frame has held: one row per take, keyed (project, screen, state, variant,
-- format, take), `take` counting up 1, 2, 3 … per frame and format, with what the body was filed with (hash, bytes, width,
-- height, style) and when and by whom (filed_at, filed_by: the render row's updated_at and updated_by). The NEWEST take of a
-- frame is its index entry (k_renders); the takes before it are what a person may restore.
--   · k_screen_takes_insert / k_screen_takes_update: the database appends the take, as it keeps k_screen_renders: on a render
--     inserted, or updated in its key, format or hash, ONE row — unless the frame's newest take already holds the same hash in
--     the same format (a re-filed identical body, a restore of the version snapshot that writes the row back unchanged, a
--     backup restore that loads the takes first: nothing appended). The guard reads the frame's LAST APPENDED take, by rowid —
--     never by filed_at: a version restore re-files a render with its snapshotted updated_at, so a take appended by it is
--     dated in the past, and a filed_at guard would compare a later restore against the wrong take (sprint-4 review, L1).
--     `take` is the PK's prefix MAX + 1.
--     A field-only change (width, height, style: the same hash) appends nothing: a take is a body.
--   · idx_k_screen_takes_screen (project, screen, filed_at): the strip's ONE read, "the last 6 takes of a screen", newest first
--     (src/knowledge/screens.js SCREEN_TAKES_SQL: a SEARCH on (project, screen), in index order, ties by rowid: the order filed).
--   · idx_k_screen_takes_hash (project, hash): the body route serves a previous take by its hash (GET /render/:hash: a hash the
--     project's takes hold, not only its current renders), and the write door finds the take a restore names, one probe each.
-- REMOVING. A removed render keeps its takes (so the frame can be restored); a removed screen node removes its renders
-- (migrate-046) and keeps its takes, as a version restore that deletes and re-inserts a node keeps them. Nothing deletes a take.
-- RESTORE (src/knowledge/write.js prepareTakes): a render upsert naming a take's hash and no body re-files that body as the
-- frame's newest take (a new row here, through the trigger); the door refuses a hash the project's takes do not hold.
-- WRITE COST: one row (and its three index entries) per render whose body changes, at most one per op; nothing for an
-- unchanged render or a field-only change. READ COST: the inspector of a screen and the Screens view's pinned screen read at
-- most 6 rows through idx_k_screen_takes_screen (+1 statement each).
-- BACKFILL: k_screen_takes — one take (take 1) per render already filed, its filed_at the render's updated_at, never for a frame
-- that already has a take (a re-run writes nothing). State the count before applying live: SELECT COUNT(*) FROM k_renders.
-- ORDER: applied live with tools/migrate.sh (a bookmark first) BEFORE the code: the new code reads k_screen_takes on every
-- screen inspector and on GET /render/:hash. The old code on the new schema runs unchanged (it never reads the table; a render
-- write appends its take through the trigger).
-- BACKUP (src/backup.js): dumped, before k_renders (history nothing else rebuilds; loaded first, so the triggers append
-- nothing as the renders load after it).

CREATE TABLE IF NOT EXISTS k_screen_takes (
  project  TEXT NOT NULL REFERENCES projects(key),
  screen   TEXT NOT NULL,                  -- the render's screen (a k_nodes id of type screen when it was filed)
  state    TEXT NOT NULL DEFAULT '',
  variant  TEXT NOT NULL DEFAULT '',
  format   TEXT NOT NULL CHECK (format IN ('html', 'image', 'wireframe')),
  take     INTEGER NOT NULL CHECK (take >= 1),   -- 1, 2, 3 … per (project, screen, state, variant, format)
  hash     TEXT NOT NULL CHECK (length(hash) = 64),   -- the body's sha256: its R2 key is renders/<project>/<hash>
  bytes    INTEGER NOT NULL,
  width    INTEGER,
  height   INTEGER,
  style    TEXT,                           -- an html take's k_styles id, as it was filed
  filed_at TEXT NOT NULL,
  filed_by TEXT NOT NULL REFERENCES people(id),
  PRIMARY KEY (project, screen, state, variant, format, take)
);

CREATE INDEX IF NOT EXISTS idx_k_screen_takes_screen ON k_screen_takes(project, screen, filed_at);
CREATE INDEX IF NOT EXISTS idx_k_screen_takes_hash ON k_screen_takes(project, hash);

CREATE TRIGGER IF NOT EXISTS k_screen_takes_insert
AFTER INSERT ON k_renders
BEGIN
  INSERT INTO k_screen_takes (project, screen, state, variant, format, take, hash, bytes, width, height, style, filed_at, filed_by)
    SELECT NEW.project, NEW.screen, NEW.state, NEW.variant, NEW.format,
      COALESCE((SELECT MAX(t.take) FROM k_screen_takes t WHERE t.project = NEW.project AND t.screen = NEW.screen AND t.state = NEW.state AND t.variant = NEW.variant AND t.format = NEW.format), 0) + 1,
      NEW.hash, NEW.bytes, NEW.width, NEW.height, NEW.style, NEW.updated_at, NEW.updated_by
    WHERE NOT EXISTS (SELECT 1 FROM (SELECT t.hash, t.format FROM k_screen_takes t WHERE t.project = NEW.project AND t.screen = NEW.screen AND t.state = NEW.state AND t.variant = NEW.variant
      ORDER BY t.rowid DESC LIMIT 1) z WHERE z.hash = NEW.hash AND z.format = NEW.format);
END;

CREATE TRIGGER IF NOT EXISTS k_screen_takes_update
AFTER UPDATE OF project, screen, state, variant, format, hash ON k_renders
BEGIN
  INSERT INTO k_screen_takes (project, screen, state, variant, format, take, hash, bytes, width, height, style, filed_at, filed_by)
    SELECT NEW.project, NEW.screen, NEW.state, NEW.variant, NEW.format,
      COALESCE((SELECT MAX(t.take) FROM k_screen_takes t WHERE t.project = NEW.project AND t.screen = NEW.screen AND t.state = NEW.state AND t.variant = NEW.variant AND t.format = NEW.format), 0) + 1,
      NEW.hash, NEW.bytes, NEW.width, NEW.height, NEW.style, NEW.updated_at, NEW.updated_by
    WHERE NOT EXISTS (SELECT 1 FROM (SELECT t.hash, t.format FROM k_screen_takes t WHERE t.project = NEW.project AND t.screen = NEW.screen AND t.state = NEW.state AND t.variant = NEW.variant
      ORDER BY t.rowid DESC LIMIT 1) z WHERE z.hash = NEW.hash AND z.format = NEW.format);
END;

-- the backfill: one take per render already filed (take 1), oldest first, never for a frame that has one
INSERT INTO k_screen_takes (project, screen, state, variant, format, take, hash, bytes, width, height, style, filed_at, filed_by)
  SELECT r.project, r.screen, r.state, r.variant, r.format, 1, r.hash, r.bytes, r.width, r.height, r.style, r.updated_at, r.updated_by
  FROM k_renders r
  WHERE NOT EXISTS (SELECT 1 FROM k_screen_takes t WHERE t.project = r.project AND t.screen = r.screen AND t.state = r.state AND t.variant = r.variant)
  ORDER BY r.updated_at, r.rowid;
