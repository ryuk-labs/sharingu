-- migrate-048.sql — preview, then file (sprint 3, B2; docs/plan/MCP.md §4). EXPAND-ONLY: one new table, no index, no trigger;
-- no existing table, column, row or index changes. The worker before this file never reads it; the worker after it writes
-- ONE row per preview (src/preview.js previewItems) and updates that row once per file (fileItems), so it needs this file
-- live BEFORE the code. Applied live with tools/migrate.sh (a bookmark first).
--   · previews: one row per preview, read and written by its primary key only (the page GET /preview/:id, file), so the
--     table is WITHOUT ROWID (the key IS the row: one row written per insert, no second b-tree) and carries no secondary
--     index. summary is the preview's answer WITHOUT any body (the lines, places, verdicts, reasons, reach, what was left
--     out, the counts, and one verdict per item), at most 64 KB (a larger one is stored grouped by kind). digest is the
--     sha256 of the items as sent (canonical JSON): file must send the same items. filed is the receipt (each item's status
--     and the id it became), filed_at set once every ready item landed. A preview expires an hour after created_at
--     (expires_at); nothing prunes the table yet (an expired row is a few KB and is read only by its own id).

CREATE TABLE IF NOT EXISTS previews (
  id         TEXT PRIMARY KEY,                       -- P-<16 hex>, random
  project    TEXT NOT NULL REFERENCES projects(key),
  person     TEXT NOT NULL REFERENCES people(id),    -- its author: only they file it
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,                          -- created_at + 1 hour
  filed_at   TEXT,                                   -- set when every ready item landed
  digest     TEXT NOT NULL,                          -- sha256 of the items, canonical JSON
  summary    TEXT NOT NULL CHECK (json_valid(summary)),
  filed      TEXT CHECK (filed IS NULL OR json_valid(filed))
) WITHOUT ROWID;
