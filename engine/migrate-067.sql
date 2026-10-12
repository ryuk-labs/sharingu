-- migrate-067.sql — one database holds many orgs: the tables (sprint 6, slice 6.1; docs/plan/PLATFORM.md §2 items 1 and 2).
-- EXPAND ONLY (PLATFORM §5: expand then contract): nothing is renamed or dropped but what the plan rules (the org table's
-- rebuild, the dead table sso_nonce); every column added is filled; no read of org 1 changes.
--   1 · the nine org-wide tables gain `org` (people, tokens, invites, events, artifacts, loops, approval_audit,
--       login_attempts, transmission), every existing row filled with org 1. No default: a row the code writes carries
--       its org itself; migrate-068.sql (AFTER the code) adds the triggers that refuse a row without one. No REFERENCES:
--       org.home names a project and org.created_by a person, so an org foreign key from people or projects would make a
--       cycle the restore's load order (src/backup.js BACKUP_DUMPED) and every seed (people before the org row) cannot meet.
--       approval_audit is append-only (migrate-035's trigger): its fill runs with the trigger lifted, then put back as it was.
--   2 · THE KEY RULE (src/project.js projectKeyOf / orgOfKey are its JS twin; tools/project-rule-selftest.mjs proves the two
--       agree): a project's key carries its org, as a repository's name carries its owner. A key is `o<org>--<slug>`
--       (`o2--web`) for every org but org 1; org 1's keys are its bare slugs, so the six live keys (sharingu, ryuklabs,
--       siru, saruspay, bunny, demo) stay exactly as they are and resolve to org 1, and nothing on live is rekeyed. A slug
--       never holds `--`, so the two forms never meet. projects.org and projects.slug are GENERATED from the key (VIRTUAL:
--       no row is written, no writer changes, the key and its org can never disagree); the unique index (org, slug) is
--       "the slug a person types is unique inside the org" and the read slice 6.2's resolver makes.
--       The SQL never writes the separator as a quoted '-' pair: a string holding two dashes reads as a comment to wrangler's
--       statement splitter (SQLITE_TOOBIG on a fresh seed), so it is char(45, 45) and the GLOB class [-][-].
--       And a CASE inside a trigger ends "END )", never "END)": wrangler's splitter opens a block at " CASE " and closes it only
--       at an END followed by a space or ";" (the older triggers' "END ," is the same scar).
--   3 · org holds many rows: rebuilt without migrate-039's CHECK (id = 1); its one live row is copied as it is (id 1,
--       ryuklabs). An org id is a positive integer (CHECK id >= 1): it is the number a project key carries.
--       It runs after 1 and 2 on purpose: a replay of the chain over an org that already has 067 stops at 1's first column
--       (duplicate column name: the file is skipped whole) before the rebuild's rename re-reads the schema.
--   4 · the three running-count tables (transmission_open, transmission_kinds, transmission_goals) keep the bucket of a
--       row with no project PER ORG: org 1's stays '' (every read of it is unchanged), another org's is its key prefix
--       `o<org>--` (no project's key can equal it: a slug has at least two characters). Their nine triggers are replaced
--       with the bucket re-keyed and `org` among the update triggers' columns (a row moved between orgs moves its count).
--       The fill above runs BEFORE they are replaced, so it fires none of them (the old ones do not name org).
--   5 · sso_nonce, dead since its routes were deleted (Q6FA72180, 2026-09-27), is dropped.
-- WRITE COST on live (engine/.runs/s6-baseline/table-counts.txt): about 7,700 rows written by the fill (events 3,398, tokens
-- 1,713, transmission 1,208, loops 800, artifacts 173, people 135, approval_audit 94, login_attempts 56, invites 1), one org
-- row copied, three sso_nonce rows dropped; the generated columns write nothing.
-- ORDER: BEFORE the code. The old code runs on it unchanged (it names no new column; a row it writes gets org NULL, filled
-- by migrate-068). The new code (every writer stamps the org) needs it. Then the code, then migrate-068.sql.

-- 1 · the org-wide rows carry the org, every existing row org 1
ALTER TABLE people ADD COLUMN org INTEGER;
ALTER TABLE tokens ADD COLUMN org INTEGER;
ALTER TABLE invites ADD COLUMN org INTEGER;
ALTER TABLE events ADD COLUMN org INTEGER;
ALTER TABLE artifacts ADD COLUMN org INTEGER;
ALTER TABLE loops ADD COLUMN org INTEGER;
ALTER TABLE approval_audit ADD COLUMN org INTEGER;
ALTER TABLE login_attempts ADD COLUMN org INTEGER;
ALTER TABLE transmission ADD COLUMN org INTEGER;

UPDATE people SET org = 1 WHERE org IS NULL;
UPDATE tokens SET org = 1 WHERE org IS NULL;
UPDATE invites SET org = 1 WHERE org IS NULL;
UPDATE events SET org = 1 WHERE org IS NULL;
UPDATE artifacts SET org = 1 WHERE org IS NULL;
UPDATE loops SET org = 1 WHERE org IS NULL;
DROP TRIGGER approval_audit_no_update;
UPDATE approval_audit SET org = 1 WHERE org IS NULL;
CREATE TRIGGER approval_audit_no_update
BEFORE UPDATE ON approval_audit
BEGIN
  SELECT RAISE(ABORT, 'approval_audit is append-only: a changed mind adds a new row, never edits one');
END;
UPDATE login_attempts SET org = 1 WHERE org IS NULL;
UPDATE transmission SET org = 1 WHERE org IS NULL;

-- 2 · the key rule: a project's org and slug, read off its key
ALTER TABLE projects ADD COLUMN org INTEGER GENERATED ALWAYS AS (CASE WHEN key GLOB 'o[1-9]*[-][-]?*' AND substr(key, 2, instr(key, char(45, 45)) - 2) NOT GLOB '*[^0-9]*' AND substr(key, 2, instr(key, char(45, 45)) - 2) <> '1' THEN CAST(substr(key, 2, instr(key, char(45, 45)) - 2) AS INTEGER) ELSE 1 END) VIRTUAL;
ALTER TABLE projects ADD COLUMN slug TEXT GENERATED ALWAYS AS (CASE WHEN key GLOB 'o[1-9]*[-][-]?*' AND substr(key, 2, instr(key, char(45, 45)) - 2) NOT GLOB '*[^0-9]*' AND substr(key, 2, instr(key, char(45, 45)) - 2) <> '1' THEN substr(key, instr(key, char(45, 45)) + 2) ELSE key END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_slug ON projects(org, slug);

-- 3 · org holds many rows
CREATE TABLE org_next (
  id         INTEGER PRIMARY KEY CHECK (id >= 1),
  name       TEXT NOT NULL,
  brand      TEXT CHECK (brand IS NULL OR json_valid(brand)),
  home       TEXT REFERENCES projects(key),
  created_by TEXT REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT REFERENCES people(id),
  updated_at TEXT NOT NULL,
  settings   TEXT CHECK (settings IS NULL OR json_valid(settings))
);
INSERT INTO org_next (id, name, brand, home, created_by, created_at, updated_by, updated_at, settings)
  SELECT id, name, brand, home, created_by, created_at, updated_by, updated_at, settings FROM org;
DROP TABLE org;
ALTER TABLE org_next RENAME TO org;

-- 4 · the running counts: a row with no project counts in its own org's bucket ('' for org 1, o<org>-- for another)
DROP TRIGGER transmission_open_insert;
CREATE TRIGGER transmission_open_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , NEW.route, CASE WHEN NEW.via LIKE 'mcp%' OR NEW.via LIKE 'cli%' THEN 1 ELSE 0 END , 1 WHERE NEW.status != 'closed' AND NOT (COALESCE(NEW.kind, '') IN ('knowledge','grade') AND NEW.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

DROP TRIGGER transmission_open_update;
CREATE TRIGGER transmission_open_update
AFTER UPDATE OF status, route, eval, project, gaprefs, components, via, kind, org ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , OLD.route, CASE WHEN OLD.via LIKE 'mcp%' OR OLD.via LIKE 'cli%' THEN 1 ELSE 0 END , -1 WHERE OLD.status != 'closed' AND NOT (COALESCE(OLD.kind, '') IN ('knowledge','grade') AND OLD.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , NEW.route, CASE WHEN NEW.via LIKE 'mcp%' OR NEW.via LIKE 'cli%' THEN 1 ELSE 0 END , 1 WHERE NEW.status != 'closed' AND NOT (COALESCE(NEW.kind, '') IN ('knowledge','grade') AND NEW.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

DROP TRIGGER transmission_open_delete;
CREATE TRIGGER transmission_open_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , OLD.route, CASE WHEN OLD.via LIKE 'mcp%' OR OLD.via LIKE 'cli%' THEN 1 ELSE 0 END , -1 WHERE OLD.status != 'closed' AND NOT (COALESCE(OLD.kind, '') IN ('knowledge','grade') AND OLD.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

DROP TRIGGER transmission_kinds_insert;
CREATE TRIGGER transmission_kinds_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , COALESCE(NEW.kind, ''), 1, 1 * (NEW.status != 'closed'),
            1 * (NEW.route = 'owner' AND NEW.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
END;

DROP TRIGGER transmission_kinds_update;
CREATE TRIGGER transmission_kinds_update
AFTER UPDATE OF kind, eval, project, gaprefs, components, status, route, decision, org ON transmission
BEGIN
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , COALESCE(OLD.kind, ''), -1, -1 * (OLD.status != 'closed'),
            -1 * (OLD.route = 'owner' AND OLD.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , COALESCE(NEW.kind, ''), 1, 1 * (NEW.status != 'closed'),
            1 * (NEW.route = 'owner' AND NEW.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
END;

DROP TRIGGER transmission_kinds_delete;
CREATE TRIGGER transmission_kinds_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , COALESCE(OLD.kind, ''), -1, -1 * (OLD.status != 'closed'),
            -1 * (OLD.route = 'owner' AND OLD.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
END;

DROP TRIGGER transmission_goals_insert;
CREATE TRIGGER transmission_goals_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), CASE WHEN NEW.eval = 0 AND (NEW.what IS NULL OR (NEW.what NOT LIKE '%eval probe%' AND NEW.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(NEW.happened_at, NEW.created_at), 1, 7), CASE WHEN NEW.goal_ref IS NULL THEN '' ELSE '=' || NEW.goal_ref END , LOWER(NEW.lane), CASE WHEN COALESCE(NEW.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(NEW.kind, '') ELSE '*' END ,
      1, 1 * COALESCE(NEW.outcome, 0), 1 * (NEW.outcome IS NULL), 1 * (NEW.outcome IS NULL AND (NEW.actual IS NULL OR NEW.actual = ''))
    WHERE (NEW.route = 'auto' OR NEW.decision = 'approve') AND CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

DROP TRIGGER transmission_goals_update;
CREATE TRIGGER transmission_goals_update
AFTER UPDATE OF route, decision, kind, gaprefs, components, eval, what, project, created_at, happened_at, goal_ref, lane, outcome, actual, org ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), CASE WHEN OLD.eval = 0 AND (OLD.what IS NULL OR (OLD.what NOT LIKE '%eval probe%' AND OLD.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(OLD.happened_at, OLD.created_at), 1, 7), CASE WHEN OLD.goal_ref IS NULL THEN '' ELSE '=' || OLD.goal_ref END , LOWER(OLD.lane), CASE WHEN COALESCE(OLD.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(OLD.kind, '') ELSE '*' END ,
      -1, -1 * COALESCE(OLD.outcome, 0), -1 * (OLD.outcome IS NULL), -1 * (OLD.outcome IS NULL AND (OLD.actual IS NULL OR OLD.actual = ''))
    WHERE (OLD.route = 'auto' OR OLD.decision = 'approve') AND CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), CASE WHEN NEW.eval = 0 AND (NEW.what IS NULL OR (NEW.what NOT LIKE '%eval probe%' AND NEW.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(NEW.happened_at, NEW.created_at), 1, 7), CASE WHEN NEW.goal_ref IS NULL THEN '' ELSE '=' || NEW.goal_ref END , LOWER(NEW.lane), CASE WHEN COALESCE(NEW.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(NEW.kind, '') ELSE '*' END ,
      1, 1 * COALESCE(NEW.outcome, 0), 1 * (NEW.outcome IS NULL), 1 * (NEW.outcome IS NULL AND (NEW.actual IS NULL OR NEW.actual = ''))
    WHERE (NEW.route = 'auto' OR NEW.decision = 'approve') AND CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

DROP TRIGGER transmission_goals_delete;
CREATE TRIGGER transmission_goals_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), CASE WHEN OLD.eval = 0 AND (OLD.what IS NULL OR (OLD.what NOT LIKE '%eval probe%' AND OLD.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(OLD.happened_at, OLD.created_at), 1, 7), CASE WHEN OLD.goal_ref IS NULL THEN '' ELSE '=' || OLD.goal_ref END , LOWER(OLD.lane), CASE WHEN COALESCE(OLD.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(OLD.kind, '') ELSE '*' END ,
      -1, -1 * COALESCE(OLD.outcome, 0), -1 * (OLD.outcome IS NULL), -1 * (OLD.outcome IS NULL AND (OLD.actual IS NULL OR OLD.actual = ''))
    WHERE (OLD.route = 'auto' OR OLD.decision = 'approve') AND CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

-- 5 · the dead table
DROP TABLE sso_nonce;
