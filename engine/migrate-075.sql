-- migrate-075.sql — a plan per org and its limits (sprint 8, 8.1; docs/plan/PLATFORM.md §4 sprint 8: "a plan per org, its
-- limits in a table"; the numbers are the owner's, ruled 2026-10-06 — the free tier tightened from the proposal, items and calls
-- halved; raising an org by hand IS the paid plan during the beta).
-- EXPAND ONLY (PLATFORM §5): one table made, one column added, nothing renamed, nothing dropped; the old code names neither.
--   1 · plan_limits: one row per plan, its limits as columns (a platform table: no org; the deployment's own rows, never a
--       seat's write). people (active seats in the org), projects (active projects in the org), items_month (contributions,
--       knowledge items and grades filed in a calendar month, UTC), calls_day (MCP and API calls in a day, UTC), burst_minute
--       (calls in a minute), storage_bytes (files and screen pictures stored; 1 GB written 2^30 bytes). Seeded with the two
--       ruled plans, free and team; a re-run keeps what stands (ON CONFLICT DO NOTHING: a row the operator raised is never
--       put back by a replay).
--   2 · org.plan: the org's plan, by name (default 'free': every org a person creates is free; a shape CHECK only, so a later
--       plan needs no rebuild; no REFERENCES: SQLite refuses an added REFERENCES column with a non-NULL default while foreign
--       keys are on, as D1 runs them — src/plans.js reads the row by a join and says when a plan has none).
--   3 · org 1 (ryuklabs, the beta's operating org) is set 'team'.
--   4 · three indexes the usage read stands on (src/plans.js USAGE_SQL: each number ONE aggregate over the org's own index
--       range, never a table read to count it; no index here leads with a bare org column an existing statement could take):
--       idx_people_org_seated   people(org) WHERE active = 1 AND pending = 0 — the org's seated people, a covering count (a
--                               partial index no other statement's WHERE implies: pending = 0 is written by none, so no plan of
--                               today moves)
--       idx_transmission_org_month  transmission(substr(created_at, 1, 7), org, kind) — the org's filings in a calendar month
--                               (created_at is when a filing landed, sprint 7's review C3), split by kind, a covering range; led
--                               by the month expression, which no other statement on transmission writes
--       idx_artifacts_org_bytes artifacts(org, bytes) WHERE bytes >= 0 — the org's stored files' bytes, a covering sum (the same
--                               partial rule: no other statement implies bytes >= 0)
-- WHAT IS NOT HERE: "orgs a person creates" (free 1) is the account's limit sprint 7 already holds (src/orgs.js: one org per
-- account); no counting table for calls (8.2's call: src/plans.js usageOf says calls today are not counted yet); no refusal.
-- EVERY LIVE ROW KEEPS WHAT IT HAS: every other org reads 'free' (the column's default), and nothing reads the plan yet (8.2
-- enforces it, 8.4 shows it).
-- WRITE COST on live: two plan_limits rows, org 1's one row (an ADD COLUMN with a constant default rewrites no row; the
-- org_slug_on_update trigger fires only when the slug is NULL, which org 1's is not), and the three indexes built once: one
-- entry per seated person, per ledger row and per artifact (the ledger is the big one: one index write per row it holds;
-- after it, each filing pays one more index entry).
-- ORDER: BEFORE the code (the new code reads the column and the table; the old code names neither).
-- Re-runnable: on a database that already holds this file the ALTER fails (duplicate column name: the file is skipped whole),
-- as migrate-070's and 072..074's replays are; the table and its rows are made first and kept by IF NOT EXISTS / DO NOTHING.
-- THE UNDO: the code's rollback alone (the old code never reads either); the table and the column can stay.

-- 1 · the plans and their limits
CREATE TABLE IF NOT EXISTS plan_limits (
  plan          TEXT PRIMARY KEY CHECK (length(plan) BETWEEN 1 AND 40 AND plan NOT GLOB '*[^a-z0-9-]*'),
  people        INTEGER NOT NULL CHECK (people >= 0),
  projects      INTEGER NOT NULL CHECK (projects >= 0),
  items_month   INTEGER NOT NULL CHECK (items_month >= 0),
  calls_day     INTEGER NOT NULL CHECK (calls_day >= 0),
  burst_minute  INTEGER NOT NULL CHECK (burst_minute >= 0),
  storage_bytes INTEGER NOT NULL CHECK (storage_bytes >= 0),
  updated_at    TEXT NOT NULL
);
INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) VALUES
  ('free', 10, 3, 1500, 1000, 60, 1073741824, '2026-10-06T00:00:00.000Z'),
  ('team', 50, 25, 50000, 25000, 300, 26843545600, '2026-10-06T00:00:00.000Z')
  ON CONFLICT (plan) DO NOTHING;

-- 2 · the org's plan
ALTER TABLE org ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (length(plan) BETWEEN 1 AND 40 AND plan NOT GLOB '*[^a-z0-9-]*');

-- 3 · org 1 is the beta's operating org
UPDATE org SET plan = 'team' WHERE id = 1;

-- 4 · the usage read's indexes
CREATE INDEX IF NOT EXISTS idx_people_org_seated ON people(org) WHERE active = 1 AND pending = 0;
CREATE INDEX IF NOT EXISTS idx_transmission_org_month ON transmission(substr(created_at, 1, 7), org, kind);
CREATE INDEX IF NOT EXISTS idx_artifacts_org_bytes ON artifacts(org, bytes) WHERE bytes >= 0;
