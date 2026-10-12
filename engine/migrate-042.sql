-- migrate-042.sql — the live budget (sprint 2): what a screen and an MCP read cost in D1 rows stops growing with the ledger.
-- EXPAND-ONLY: four new tables (tallies), their twelve triggers, ten indexes, and the backfill that fills the new tables. No
-- existing table, column or row changes. Applied live with tools/migrate.sh (a bookmark first); the backfill at the end runs
-- in the same file, so the tallies are exact the moment the file has run (re-running the file recomputes them).
--
-- THE TALLIES. Three screens summed the project's WHOLE ledger on every load (Home's metrics, Build's counts, the goal
-- rollup of Goals, GTM and Build's finish line), and every signed-in page counted the owner's open queue for its badge. A
-- tally holds those sums, one row per group, kept exact by triggers on transmission: an insert adds its row's contribution,
-- a delete takes it away, an update takes away the old row's and adds the new one's (only when a column the tally reads is
-- in the UPDATE). Nothing in the worker writes them, so no write path can forget one. A group whose count falls to 0 stays
-- as a row of zeros; every read skips it (HAVING SUM(n) > 0), so an emptied group reads exactly like no group.
--   · transmission_open (project, eval, mind, route, agent): how many filings are not closed. The badge's pending rulings
--     (route owner, eval 0, mind 0), transmission_queue's counts, Home's Open filings and By agents (agent: via mcp… or
--     cli…). mind is notMind negated (src/hotsql.js notMind: gaprefs or components naming mind/*).
--   · transmission_kinds (project, eval, mind, kind): per kind, how many filings (n), how many not closed (n_open) and how
--     many routed to the owner and undecided (n_owner_undecided). Build's per-kind counts; Home's approve, grant and with a
--     person. kind is COALESCE(kind, '') (Build and Home both read it so).
--   · transmission_goals (project, clean, month, goal_ref, lane, kind): the LANDED filings (route auto, or decided approve)
--     that are not R's own (mind 0), per month of filing, goal ref and lowered lane: n, s (the sum of outcome), no_outcome and
--     awaiting (outcome null and no actual). The goal rollup's G1 (src/hotsql.js GOALS_AGG_SQL). clean is "eval 0 and no
--     eval-probe text" (the read without ?eval=1 keeps clean rows only). goal_ref is '' for none, else '=' + the ref (so a ref
--     can never collide with none). kind keeps the kinds that never move a goal apart (their own name) and folds every other
--     kind into '*', so the read itself applies GOALS_NOT_KIND. A period (all, this quarter, this month) always starts on the
--     first of a month, so summing whole months is exact. The key orders goal_ref and lane before month, so the read's GROUP
--     BY goal_ref, lane walks the key in order (no sort of its own); a month outside the period is skipped as it is read.
--   · loops_open (person_id, mind): how many open loops a person holds (mind: its ref names mind/*). The badge on every
--     signed-in page counts the reader's open loops that are not R's own; whoami counts them all. Kept by three triggers on
--     loops the same way (one row written per loop opened or closed).
--   project is '' for a filing no project stamps (a key is at least two characters, never '').
-- Write cost per filing: one row written per tally it lands in (open: when not closed; kinds: always; goals: when landed and
-- not R's own), so 2 or 3 rows on a filing, and at most twice that on a decision (the old contribution out, the new in).
--
-- THE INDEXES (each named where it is read, and EXPLAINed by tools/d1-hot-selftest.mjs):
--   · idx_events_landed: the heartbeat's "what landed while you were away" walks only the four kinds it lists, newest first,
--     never every session_open (it walked every ruling/drift/unknown/fragment ever filed on idx_events_stamped). Its WHERE is
--     `+kind IN (…)`, the heartbeat's own term byte for byte: the unary + keeps idx_events_stamped (kind, stamped) off the
--     term, so the planner takes this index, and before this file runs it falls back to idx_events_created_at, never an error.
--   · idx_events_person_kind: the thread's exits and questions asked are one person's rows of one kind, newest first, never
--     all of the person's events.
--   · idx_transmission_eval_report: the heartbeat's "a fragment banked for a suite filing" probe is one lookup per fragment.
--   · idx_transmission_lane: GTM's rows and kinds read the gtm lane's filings of the period only (lower(lane), the same
--     expression GTM_ROWS_SQL and GTM_KINDS_SQL filter on), never the project's whole period.
--   · idx_transmission_owner_open: the owner's open queue (route owner, not closed) in time order, per project: the brief's
--     pending rulings and transmission_queue's default view read the queue, never the ledger.
--   · idx_transmission_decided: the filings decided in a window (Home's shipped this week, Build's on the canvas this week),
--     beside idx_transmission_project for the filings filed in it. Partial: undecided rows are not indexed.
--   · idx_transmission_goal_month: Home's leaderboard reads the month's filings that name a goal, never the whole month.
--   · idx_approval_audit_tx: the rulings on a person's filings (the thread) by filing, never a scan of every ruling.
--   · idx_people_active: the ACTIVE people in name order (Home's who is here, Control's people, the devices of active people),
--     never a scan of every person ever provisioned.
--   · idx_tokens_person_live: one person's live keys (not revoked, not expired) without reading the expired ones.

CREATE TABLE IF NOT EXISTS loops_open (
  person_id TEXT NOT NULL,
  mind      INTEGER NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (person_id, mind)
);

CREATE TABLE IF NOT EXISTS transmission_goals (
  project    TEXT NOT NULL,
  clean      INTEGER NOT NULL,
  month      TEXT NOT NULL,
  goal_ref   TEXT NOT NULL,
  lane       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  n          INTEGER NOT NULL DEFAULT 0,
  s          REAL NOT NULL DEFAULT 0,
  no_outcome INTEGER NOT NULL DEFAULT 0,
  awaiting   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project, clean, goal_ref, lane, month, kind)
);

CREATE TABLE IF NOT EXISTS transmission_kinds (
  project           TEXT NOT NULL,
  eval              INTEGER NOT NULL,
  mind              INTEGER NOT NULL,
  kind              TEXT NOT NULL,
  n                 INTEGER NOT NULL DEFAULT 0,
  n_open            INTEGER NOT NULL DEFAULT 0,
  n_owner_undecided INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project, eval, mind, kind)
);

CREATE TABLE IF NOT EXISTS transmission_open (
  project TEXT NOT NULL,
  eval    INTEGER NOT NULL,
  mind    INTEGER NOT NULL,
  route   TEXT NOT NULL,
  agent   INTEGER NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project, eval, mind, route, agent)
);

CREATE TRIGGER IF NOT EXISTS loops_open_insert
AFTER INSERT ON loops
BEGIN
  INSERT INTO loops_open (person_id, mind, n)
    SELECT NEW.person_id, CASE WHEN NEW.ref IS NULL OR NEW.ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END, 1 WHERE NEW.status = 'open'
    ON CONFLICT (person_id, mind) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS loops_open_update
AFTER UPDATE OF status, ref, person_id ON loops
BEGIN
  INSERT INTO loops_open (person_id, mind, n)
    SELECT OLD.person_id, CASE WHEN OLD.ref IS NULL OR OLD.ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END, -1 WHERE OLD.status = 'open'
    ON CONFLICT (person_id, mind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO loops_open (person_id, mind, n)
    SELECT NEW.person_id, CASE WHEN NEW.ref IS NULL OR NEW.ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END, 1 WHERE NEW.status = 'open'
    ON CONFLICT (person_id, mind) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS loops_open_delete
AFTER DELETE ON loops
BEGIN
  INSERT INTO loops_open (person_id, mind, n)
    SELECT OLD.person_id, CASE WHEN OLD.ref IS NULL OR OLD.ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END, -1 WHERE OLD.status = 'open'
    ON CONFLICT (person_id, mind) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_open_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(NEW.project, ''), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, NEW.route, CASE WHEN NEW.via LIKE 'mcp%' OR NEW.via LIKE 'cli%' THEN 1 ELSE 0 END, 1 WHERE NEW.status != 'closed'
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_open_update
AFTER UPDATE OF status, route, eval, project, gaprefs, components, via ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(OLD.project, ''), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, OLD.route, CASE WHEN OLD.via LIKE 'mcp%' OR OLD.via LIKE 'cli%' THEN 1 ELSE 0 END, -1 WHERE OLD.status != 'closed'
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(NEW.project, ''), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, NEW.route, CASE WHEN NEW.via LIKE 'mcp%' OR NEW.via LIKE 'cli%' THEN 1 ELSE 0 END, 1 WHERE NEW.status != 'closed'
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_open_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(OLD.project, ''), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, OLD.route, CASE WHEN OLD.via LIKE 'mcp%' OR OLD.via LIKE 'cli%' THEN 1 ELSE 0 END, -1 WHERE OLD.status != 'closed'
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_kinds_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(NEW.project, ''), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, COALESCE(NEW.kind, ''), 1, 1 * (NEW.status != 'closed'),
            1 * (NEW.route = 'owner' AND NEW.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
END;

CREATE TRIGGER IF NOT EXISTS transmission_kinds_update
AFTER UPDATE OF kind, eval, project, gaprefs, components, status, route, decision ON transmission
BEGIN
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(OLD.project, ''), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, COALESCE(OLD.kind, ''), -1, -1 * (OLD.status != 'closed'),
            -1 * (OLD.route = 'owner' AND OLD.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(NEW.project, ''), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, COALESCE(NEW.kind, ''), 1, 1 * (NEW.status != 'closed'),
            1 * (NEW.route = 'owner' AND NEW.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
END;

CREATE TRIGGER IF NOT EXISTS transmission_kinds_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(OLD.project, ''), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, COALESCE(OLD.kind, ''), -1, -1 * (OLD.status != 'closed'),
            -1 * (OLD.route = 'owner' AND OLD.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
END;

CREATE TRIGGER IF NOT EXISTS transmission_goals_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(NEW.project, ''), CASE WHEN NEW.eval = 0 AND (NEW.what IS NULL OR (NEW.what NOT LIKE '%eval probe%' AND NEW.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END, substr(NEW.created_at, 1, 7), CASE WHEN NEW.goal_ref IS NULL THEN '' ELSE '=' || NEW.goal_ref END, LOWER(NEW.lane), CASE WHEN COALESCE(NEW.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(NEW.kind, '') ELSE '*' END,
      1, 1 * COALESCE(NEW.outcome, 0), 1 * (NEW.outcome IS NULL), 1 * (NEW.outcome IS NULL AND (NEW.actual IS NULL OR NEW.actual = ''))
    WHERE (NEW.route = 'auto' OR NEW.decision = 'approve') AND CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

CREATE TRIGGER IF NOT EXISTS transmission_goals_update
AFTER UPDATE OF route, decision, kind, gaprefs, components, eval, what, project, created_at, goal_ref, lane, outcome, actual ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(OLD.project, ''), CASE WHEN OLD.eval = 0 AND (OLD.what IS NULL OR (OLD.what NOT LIKE '%eval probe%' AND OLD.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END, substr(OLD.created_at, 1, 7), CASE WHEN OLD.goal_ref IS NULL THEN '' ELSE '=' || OLD.goal_ref END, LOWER(OLD.lane), CASE WHEN COALESCE(OLD.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(OLD.kind, '') ELSE '*' END,
      -1, -1 * COALESCE(OLD.outcome, 0), -1 * (OLD.outcome IS NULL), -1 * (OLD.outcome IS NULL AND (OLD.actual IS NULL OR OLD.actual = ''))
    WHERE (OLD.route = 'auto' OR OLD.decision = 'approve') AND CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(NEW.project, ''), CASE WHEN NEW.eval = 0 AND (NEW.what IS NULL OR (NEW.what NOT LIKE '%eval probe%' AND NEW.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END, substr(NEW.created_at, 1, 7), CASE WHEN NEW.goal_ref IS NULL THEN '' ELSE '=' || NEW.goal_ref END, LOWER(NEW.lane), CASE WHEN COALESCE(NEW.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(NEW.kind, '') ELSE '*' END,
      1, 1 * COALESCE(NEW.outcome, 0), 1 * (NEW.outcome IS NULL), 1 * (NEW.outcome IS NULL AND (NEW.actual IS NULL OR NEW.actual = ''))
    WHERE (NEW.route = 'auto' OR NEW.decision = 'approve') AND CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

CREATE TRIGGER IF NOT EXISTS transmission_goals_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(OLD.project, ''), CASE WHEN OLD.eval = 0 AND (OLD.what IS NULL OR (OLD.what NOT LIKE '%eval probe%' AND OLD.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END, substr(OLD.created_at, 1, 7), CASE WHEN OLD.goal_ref IS NULL THEN '' ELSE '=' || OLD.goal_ref END, LOWER(OLD.lane), CASE WHEN COALESCE(OLD.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(OLD.kind, '') ELSE '*' END,
      -1, -1 * COALESCE(OLD.outcome, 0), -1 * (OLD.outcome IS NULL), -1 * (OLD.outcome IS NULL AND (OLD.actual IS NULL OR OLD.actual = ''))
    WHERE (OLD.route = 'auto' OR OLD.decision = 'approve') AND CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

CREATE INDEX IF NOT EXISTS idx_approval_audit_tx ON approval_audit(transmission_id);

CREATE INDEX IF NOT EXISTS idx_events_landed ON events(created_at) WHERE +kind IN ('ruling','drift','unknown','fragment');

CREATE INDEX IF NOT EXISTS idx_events_person_kind ON events(person_id, kind, created_at);

CREATE INDEX IF NOT EXISTS idx_people_active ON people(active, name, id);

CREATE INDEX IF NOT EXISTS idx_tokens_person_live ON tokens(person_id, revoked, expires_at);

CREATE INDEX IF NOT EXISTS idx_transmission_decided ON transmission(project, decided_at) WHERE decided_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transmission_eval_report ON transmission(report) WHERE eval = 1 AND report IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transmission_goal_month ON transmission(project, created_at) WHERE goal_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transmission_lane ON transmission(project, lower(lane), created_at);

CREATE INDEX IF NOT EXISTS idx_transmission_owner_open ON transmission(project, created_at) WHERE route = 'owner' AND status != 'closed';

-- the backfill: the tallies from the ledger as it stands (DELETE first, so a re-run recomputes instead of doubling; OR REPLACE,
-- so a filing landing between a DELETE and its INSERT is counted once, by the recomputation)
DELETE FROM transmission_open;
INSERT OR REPLACE INTO transmission_open (project, eval, mind, route, agent, n)
  SELECT COALESCE(project, ''), eval, CASE WHEN (gaprefs IS NULL OR gaprefs NOT LIKE '%mind/%') AND (components IS NULL OR components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, route, CASE WHEN via LIKE 'mcp%' OR via LIKE 'cli%' THEN 1 ELSE 0 END, COUNT(*)
  FROM transmission WHERE status != 'closed' GROUP BY 1, 2, 3, 4, 5;

DELETE FROM transmission_kinds;
INSERT OR REPLACE INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
  SELECT COALESCE(project, ''), eval, CASE WHEN (gaprefs IS NULL OR gaprefs NOT LIKE '%mind/%') AND (components IS NULL OR components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, COALESCE(kind, ''), COUNT(*), SUM(status != 'closed'), SUM(route = 'owner' AND decision IS NULL)
  FROM transmission GROUP BY 1, 2, 3, 4;

DELETE FROM transmission_goals;
INSERT OR REPLACE INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
  SELECT COALESCE(project, ''),
    CASE WHEN eval = 0 AND (what IS NULL OR (what NOT LIKE '%eval probe%' AND what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END,
    substr(created_at, 1, 7), CASE WHEN goal_ref IS NULL THEN '' ELSE '=' || goal_ref END, LOWER(lane),
    CASE WHEN COALESCE(kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(kind, '') ELSE '*' END,
    COUNT(*), COALESCE(SUM(outcome), 0), SUM(outcome IS NULL), SUM(outcome IS NULL AND (actual IS NULL OR actual = ''))
  FROM transmission WHERE (route = 'auto' OR decision = 'approve') AND CASE WHEN (gaprefs IS NULL OR gaprefs NOT LIKE '%mind/%') AND (components IS NULL OR components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0 GROUP BY 1, 2, 3, 4, 5, 6;

DELETE FROM loops_open;
INSERT OR REPLACE INTO loops_open (person_id, mind, n)
  SELECT person_id, CASE WHEN ref IS NULL OR ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END, COUNT(*) FROM loops WHERE status = 'open' GROUP BY 1, 2;
