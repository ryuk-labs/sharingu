-- migrate-032.sql — Q5AE248CC (owner ruling, 2026-09-20): check_results.transmission_id and
-- check_results.graded_by are declared INTEGER, but they point at transmission.id and people.id —
-- both TEXT PRIMARY KEYs. Confirmed live at the write path (src/packdoor.js packGrade()): only TEXT
-- id strings are ever bound into either column, so SQLite's per-value dynamic typing has made this
-- work by accident, not by declaration — and a FOREIGN KEY cannot even be added over the mismatch
-- (SQLite requires matching affinity to create one at all). The ruling: ALTER both columns to TEXT,
-- THEN add the FK — never add the FK over the mismatched type and lean on coercion.
--
-- Deferred out of migrate-031.sql on purpose (QD1A9E7EB's own working assumption) — this table
-- carries a real type smell the other 20 convention relations do not, so its migration stays
-- separate even though both land in the same PR.
PRAGMA defer_foreign_keys = ON;

-- REENTRANCY (2026-10-01): every trigger that reads check_results (migrate-041's k_checks_ungraded_insert, migrate-043's
-- three k_node_lights_ref_* on k_check_refs) would be rewritten by the rename below to name the dropped check_results_old,
-- and every trigger ON it (migrate-041's check_results_graded, migrate-043's three k_node_lights_grade_*) would go with the
-- old table. migrate-031.sql drops them first on a replay of the whole chain; this file drops them too, so it is safe on its
-- own. migrate-041.sql and migrate-043.sql (CREATE TRIGGER IF NOT EXISTS, later in the chain) put them back.
DROP TRIGGER IF EXISTS k_checks_ungraded_insert;
DROP TRIGGER IF EXISTS check_results_graded;
DROP TRIGGER IF EXISTS k_node_lights_ref_insert;
DROP TRIGGER IF EXISTS k_node_lights_ref_delete;
DROP TRIGGER IF EXISTS k_node_lights_ref_update;
DROP TRIGGER IF EXISTS k_node_lights_grade_insert;
DROP TRIGGER IF EXISTS k_node_lights_grade_delete;
DROP TRIGGER IF EXISTS k_node_lights_grade_update;
-- migrate-050's k_fill triggers, the same class (sprint 3, B3): the three on k_checks READ check_results (a check's
-- ungraded count), the three ON check_results go with the old table. migrate-050.sql (CREATE TRIGGER IF NOT EXISTS, later
-- in the chain) puts them back and its backfill recomputes k_fill from the rows as they stand.
DROP TRIGGER IF EXISTS k_fill_check_insert;
DROP TRIGGER IF EXISTS k_fill_check_delete;
DROP TRIGGER IF EXISTS k_fill_check_update;
DROP TRIGGER IF EXISTS k_fill_grade_insert;
DROP TRIGGER IF EXISTS k_fill_grade_delete;
DROP TRIGGER IF EXISTS k_fill_grade_update;
-- migrate-054's stale-by-change triggers, the same class (sprint 3, B4): every one READS check_results (a check's latest
-- grade), three are ON it. migrate-054.sql (CREATE TRIGGER IF NOT EXISTS, later in the chain) puts them back and its
-- backfill recomputes k_node_stale, k_check_stale and k_fill's stale count from the rows as they stand.
DROP TRIGGER IF EXISTS k_stale_grade_insert;
DROP TRIGGER IF EXISTS k_stale_grade_delete;
DROP TRIGGER IF EXISTS k_stale_grade_update;
DROP TRIGGER IF EXISTS k_stale_ref_insert;
DROP TRIGGER IF EXISTS k_stale_ref_delete;
DROP TRIGGER IF EXISTS k_stale_ref_update;
DROP TRIGGER IF EXISTS k_stale_node_insert;
DROP TRIGGER IF EXISTS k_stale_node_update;
DROP TRIGGER IF EXISTS k_stale_node_delete;
DROP TRIGGER IF EXISTS k_stale_render_insert;
DROP TRIGGER IF EXISTS k_stale_render_update;
DROP TRIGGER IF EXISTS k_stale_contribution;

ALTER TABLE check_results RENAME TO check_results_old;
CREATE TABLE check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL REFERENCES projects(key), -- workspace key, same column convention as transmission.project
  pack_version TEXT NOT NULL,       -- pack.json's version at grade time — a grade against an old version is honest history, never rewritten
  check_id TEXT NOT NULL,           -- pack checks.json's own id, e.g. "AC.landing.01"
  status TEXT NOT NULL,             -- proven | refused | incomplete — same three the door already uses for R3 (gateGrade)
  transmission_id TEXT REFERENCES transmission(id), -- was INTEGER (Q5AE248CC) — the transmission row that filed this grade (submit_grade, §5)
  graded_by TEXT NOT NULL REFERENCES people(id),    -- was INTEGER (Q5AE248CC) — people.id
  graded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO check_results (id, project, pack_version, check_id, status, transmission_id, graded_by, graded_at)
  SELECT id, project, pack_version, check_id, status, transmission_id, graded_by, graded_at FROM check_results_old;
DROP TABLE check_results_old;
CREATE INDEX IF NOT EXISTS idx_check_results_lookup ON check_results(project, pack_version, check_id);
CREATE INDEX IF NOT EXISTS idx_check_results_recent ON check_results(project, graded_at);
