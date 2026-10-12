-- migrate-019 — the project axis (ADR-100 · workspace-prd, mission ④).
-- Additive only: two new tables, one new column on four tables, three indexes,
-- a seed + backfill. No drops, no rewrites of existing values other than the
-- ruled backfill (ADR-100 §2: legacy rows stamp to project #1 'siru' so
-- attribution stays one indexed query, forever — no COALESCE debt).
-- Post-conditions the ratchet evals assert: zero NULL project rows in
-- transmission/events/artifacts; every active person holds >=1 seat.

CREATE TABLE IF NOT EXISTS projects (
  key          TEXT PRIMARY KEY,          -- short slug, e.g. 'siru'
  name         TEXT NOT NULL,             -- display name, e.g. 'SIRU'
  registry_ptr TEXT,                      -- optional per-project screen-registry pointer (manifest projects[])
  atlas_map    TEXT,                      -- optional per-project atlas map pointer
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_seats (
  person_id    TEXT NOT NULL,
  project_key  TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',  -- per-project role, admin-managed on /control (ADR-100)
  created_at   TEXT NOT NULL,
  PRIMARY KEY (person_id, project_key)
);
CREATE INDEX IF NOT EXISTS idx_project_seats_project ON project_seats(project_key);

ALTER TABLE transmission ADD COLUMN project TEXT;
ALTER TABLE events       ADD COLUMN project TEXT;
ALTER TABLE artifacts    ADD COLUMN project TEXT;
-- the session stamp (ADR-100 §1: carrier = session-stamped; tokens IS the session record)
ALTER TABLE tokens       ADD COLUMN project TEXT;

CREATE INDEX IF NOT EXISTS idx_transmission_project ON transmission(project, created_at);
CREATE INDEX IF NOT EXISTS idx_events_project       ON events(project, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_project    ON artifacts(project, created_at);

-- Seed project #1 and seat the current roster (SIRU converts IN PLACE — the
-- single-project org auto-enters, behaviour unchanged by one pixel).
INSERT INTO projects (key, name, registry_ptr, atlas_map, active, created_at)
  SELECT 'siru', 'SIRU', NULL, NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE NOT EXISTS (SELECT 1 FROM projects WHERE key = 'siru');

INSERT OR IGNORE INTO project_seats (person_id, project_key, role, created_at)
  SELECT id, 'siru', role, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM people WHERE active = 1;

-- The ruled backfill (ADR-100 §2): every legacy row is project #1's.
UPDATE transmission SET project = 'siru' WHERE project IS NULL;
UPDATE events       SET project = 'siru' WHERE project IS NULL;
UPDATE artifacts    SET project = 'siru' WHERE project IS NULL;
