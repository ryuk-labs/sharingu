-- migrate-028.sql — check_results (brain-pack-standard, 00_DESIGN/brain-pack-standard.md): one row per
-- graded check, keyed by (project, pack version, check id). Additive: one new table, two indexes.
CREATE TABLE IF NOT EXISTS check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,            -- workspace key, same column convention as transmission.project
  pack_version TEXT NOT NULL,       -- pack.json's version at grade time — a grade against an old version is honest history, never rewritten
  check_id TEXT NOT NULL,           -- pack checks.json's own id, e.g. "AC.landing.01"
  status TEXT NOT NULL,             -- proven | refused | incomplete — same three the door already uses for R3 (gateGrade)
  transmission_id INTEGER,          -- FK to the transmission row that filed this grade (submit_grade, §5) — one ledger, not two
  graded_by INTEGER NOT NULL,       -- people.id
  graded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_check_results_lookup ON check_results(project, pack_version, check_id);
CREATE INDEX IF NOT EXISTS idx_check_results_recent ON check_results(project, graded_at);
