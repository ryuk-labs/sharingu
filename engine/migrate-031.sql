-- migrate-031.sql — QD1A9E7EB (owner ruling, 2026-09-20): 22 of 24 relations in boot.sql were
-- naming-convention guesses (a column named x_id assumed to point at x.id), never a database
-- constraint — a row violating any of them would be silently accepted. QCE1F9725 already ruled
-- the convention relations become real FOREIGN KEYs; a live 24-way LEFT-JOIN-IS-NULL orphan scan
-- against siru-agent-r's own D1 (2026-09-18) found ZERO orphaned rows across all 24, so this is
-- unblocked, not aspirational.
--
-- SQLite has no ALTER TABLE ADD CONSTRAINT — a FOREIGN KEY can only be declared in a table's own
-- CREATE TABLE — so every table gaining one is a full rebuild: rename the live table out of the
-- way, create the new one with the constraint declared, copy every row across unchanged, drop the
-- renamed original, then re-cut the indexes the DROP TABLE took with it (SQLite indexes belong to
-- the table object, not the name — dropping the renamed-away original drops them too).
--
-- THIS MIGRATION covers the six tables whose FK work needs nothing else alongside it: approval_audit,
-- invites, loops, project_seats, tokens, transmission. check_results carries a real type mismatch
-- and lands separately (migrate-032.sql, Q5AE248CC — ALTER the two mismatched columns to TEXT, THEN
-- add the FK, never the reverse). events and artifacts each need one more schema change beyond a
-- plain FK (Q0B50A78E's payload_json structural check; QE2D90B38's group_tag NOT NULL+CHECK) — folding
-- those into THIS migration would mean rebuilding the SAME table twice in one PR for no reason, so
-- their FK additions ride along with their own ruling's migration instead (migrate-033.sql,
-- migrate-035.sql). One relation named in the 22 — events.session_id -> sessions.id — is NOT
-- resurrected here: Q0544F477 already dropped the sessions table (migrate-030.sql), so there is
-- nothing left to reference; the real post-drop convention count is 21, not 22
-- (GAP-events-sessions-relation-dies-with-sessions). Read together with migrate-032/033/035, this
-- migration's six tables plus check_results/events/artifacts land the full 21.
--
-- ORDER MATTERS: transmission is rebuilt FIRST because approval_audit's own FK
-- (transmission_id -> transmission.id) needs the fully-repopulated table to already exist under its
-- real name before it is referenced. transmission's own `parent` column self-references the same
-- table it is being copied into — PRAGMA defer_foreign_keys defers every FK check in this migration
-- to commit time (a documented, always-on D1/SQLite pragma, not the disabled `foreign_keys` pragma
-- D1 refuses to honor) so a self-referencing copy in arbitrary row order never trips mid-transaction.
--
-- EVERY INSERT BELOW NAMES ITS COLUMNS EXPLICITLY, on both sides (never `SELECT *`). A live org D1
-- gained several of these columns via `ALTER TABLE ... ADD COLUMN` over months, in different orders
-- on different orgs (confirmed: ryuklabs/siru/veil/bunny do not all agree on physical column order
-- for these tables) — `INSERT INTO x SELECT * FROM x_old` depends on the OLD table's physical column
-- order matching the NEW CREATE TABLE's order 1:1, which silently breaks (wrong values in wrong
-- columns, no error) the moment they diverge. Naming every column by NAME on both sides of the
-- INSERT makes the copy immune to physical order — SQLite resolves a named column by name, never by
-- position — which is the actual fix, not merely a style change.
--
-- transmission_refs (migrate-018.sql) is a CHILD of transmission via `tid TEXT NOT NULL REFERENCES
-- transmission(id)` — a plain naming-convention FK, never enforced (pre-030 everywhere, QD1A9E7EB).
-- SQLite's own documented ALTER TABLE RENAME behavior rewrites every OTHER table's FK text that
-- names the renamed table (https://www.sqlite.org/lang_altertable.html §"Renaming a table"): the
-- `ALTER TABLE transmission RENAME TO transmission_old` two lines down silently turns
-- transmission_refs' own schema text into `REFERENCES "transmission_old"(id)` — confirmed live on a
-- local copy loaded from siru-agent-r's export (siru carries 10 transmission_refs rows; ryuklabs has
-- 0, so this defect is invisible there on the day, veil 1, bunny 1). Once `transmission_old` is
-- dropped below, that reference names a table that no longer exists — every SUBSEQUENT insert into
-- transmission_refs then fails (measured: on the local copy, sqlite_master shows `transmission_refs
-- :: ... REFERENCES "transmission_old"(id)` after this migration, unfixed). transmission_refs is
-- rebuilt a second time, AFTER the real `transmission` table exists again under its own name, to
-- re-pin the FK at the table that will actually still exist once this migration is done — see the
-- ---- transmission_refs ---- block below, right after transmission's own rebuild.
PRAGMA defer_foreign_keys = ON;

-- REENTRANCY (heal, 2026-09-23): SQLite's own documented ALTER TABLE RENAME behavior (cited above,
-- §"Renaming a table") does not stop at transmission_refs' FK clause — it rewrites the SQL text of
-- EVERY schema object that names the renamed table, including a TRIGGER'S body, whichever table the
-- trigger itself is ON. migrate-034.sql's `approval_audit_no_delete_real` WHEN clause names
-- `transmission` by identifier; on a FRESH org this trigger does not exist yet when this file first
-- runs (migrate-034.sql always sorts after migrate-031.sql, so it is created once, downstream, this
-- same pass — nothing here to protect). On a REPLAY of an already-migrated org — exactly the
-- ryuklabs-agent-r shape this heal fixes (Q23D7E346's trigger already lives in sqlite_master) — the
-- `ALTER TABLE transmission RENAME TO transmission_old` two lines down silently rewrites that
-- trigger's WHEN clause to name `transmission_old`; this file then drops `transmission_old`, and the
-- trigger (now carried along/torn down with its own OWN table, `approval_audit`, a few statements
-- later in this same file) is left dangling — the measured failure, "no such table:
-- main.transmission_old", surfaces the moment SQLite next has to re-resolve it.
--
-- Fixed here as option (a) from the batch brief, not (b): a WHERE-guarded no-op (the migrate-029/
-- migrate-030a shape) has nothing to guard — `ALTER TABLE ... RENAME` and `CREATE TABLE` are DDL,
-- SQLite has no conditional DDL, so there is no WHERE clause a rebuild statement could carry to make
-- itself a no-op on a second run. The only shape that actually converges is for the file doing the
-- rename to be self-contained: drop, in ITS OWN FILE, before the rename, any trigger its rename
-- could corrupt (a no-op via IF EXISTS on a fresh org, where it does not exist yet), then recreate it
-- once the tables it depends on are real again — see the matching block after approval_audit's own
-- rebuild below. This must stay BYTE-IDENTICAL to migrate-034.sql's own CREATE TRIGGER statements
-- (Q23D7E346, the ruling's canonical home) — a text drift between the two is a bug in this file, not
-- in that one; migrate-034.sql's own `IF NOT EXISTS` recreate is untouched and becomes a no-op from
-- here on, harmless either way (fresh org or replay) since by the time it runs the trigger this file
-- just restored already matches.
DROP TRIGGER IF EXISTS approval_audit_no_delete_real;
DROP TRIGGER IF EXISTS approval_audit_no_update;
-- migrate-041's triggers name check_results too (k_checks_ungraded_insert reads it; check_results_graded sits ON it): on
-- a database that already carries them, the check_results rebuild below would rewrite the first to name the dropped
-- check_results_defuse_old and drop the second with the old table. Drop both here; migrate-041.sql (CREATE TRIGGER IF NOT
-- EXISTS, later in the chain) puts them back.
DROP TRIGGER IF EXISTS k_checks_ungraded_insert;
DROP TRIGGER IF EXISTS check_results_graded;
-- migrate-043's light triggers, the same class (sprint-2 ship, 2026-10-01: a replay failed here with "error in trigger
-- k_node_lights_ref_insert: no such table: main.check_results_defuse_old"): the three on k_check_refs READ check_results, so
-- the rebuild below would rewrite them to name the dropped check_results_defuse_old; the three ON check_results would go
-- with the old table. Drop all six here; migrate-043.sql (CREATE TRIGGER IF NOT EXISTS, later in the chain) puts them back
-- and its backfill recomputes k_node_lights from the rows as they stand.
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

-- REENTRANCY, second victim (heal, 2026-09-23): the SAME rename-cascade above does not stop at
-- triggers — it rewrites any OTHER table's own FOREIGN KEY clause that names the renamed table too.
-- On an ALREADY-migrated org, check_results.transmission_id already carries a REAL FK into
-- `transmission` from a prior migrate-032.sql run (Q5AE248CC) — a table THIS FILE never rebuilds.
-- Measured live (ryuklabs-agent-r): once `ALTER TABLE transmission RENAME TO transmission_old` below
-- runs, check_results' own schema text silently becomes `REFERENCES "transmission_old"(id)`;
-- migrate-032.sql (the file that actually owns this table) does not run until the NEXT wrangler/D1
-- transaction, so nothing corrects this before THIS file's own commit — and the deferred FK check at
-- that commit fails on check_results' now-parentless rows (`PRAGMA foreign_key_check` on the local
-- reproduction named exactly this: `('check_results', 1, 'transmission_old', 1)`), even though this
-- file does not otherwise touch check_results at all. On a FRESH org this is a genuine no-op — a
-- brand-new check_results (migrate-028.sql) declares transmission_id/graded_by as plain INTEGER, no
-- REFERENCES clause at all yet, nothing here for a rename to cascade onto.
--
-- Defused, not rebuilt: this is NOT migrate-032.sql's own rebuild (its type fix + real FK stay
-- there, Q5AE248CC's own ordering — ALTER to TEXT, THEN add the FK, never the reverse) — every
-- constraint below is deliberately relaxed (no REFERENCES, no NOT NULL beyond what this table's own
-- PRIMARY KEY already requires) rather than guessed at, because this file cannot know, statically,
-- whether it is looking at a fresh org's INTEGER columns or an already-migrated org's TEXT+FK
-- columns — SQLite's manifest typing carries either shape's real values through this copy unharmed
-- either way, and migrate-032.sql (the very next file in the chain, same run) re-imposes the real,
-- final types and FKs immediately afterward regardless of which shape this leaves behind.
ALTER TABLE check_results RENAME TO check_results_defuse_old;
CREATE TABLE check_results (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project      TEXT,
  pack_version TEXT,
  check_id     TEXT,
  status       TEXT,
  transmission_id TEXT,   -- REFERENCES transmission(id) deliberately dropped here — migrate-032.sql restores it for real
  graded_by    TEXT,      -- REFERENCES people(id) deliberately dropped here (people is never renamed, but never assume — migrate-032.sql restores it for real too)
  graded_at    TEXT
);
INSERT INTO check_results (id, project, pack_version, check_id, status, transmission_id, graded_by, graded_at)
  SELECT id, project, pack_version, check_id, status, transmission_id, graded_by, graded_at FROM check_results_defuse_old;
DROP TABLE check_results_defuse_old;
CREATE INDEX IF NOT EXISTS idx_check_results_lookup ON check_results(project, pack_version, check_id);
CREATE INDEX IF NOT EXISTS idx_check_results_recent ON check_results(project, graded_at);

-- ---- transmission ---------------------------------------------------------------------------
ALTER TABLE transmission RENAME TO transmission_old;
CREATE TABLE transmission (
  id          TEXT PRIMARY KEY,           -- T-<yyyymmdd>-<seq>
  submitter   TEXT NOT NULL REFERENCES people(id), -- person id. The column comment used to read "(or
                                           -- name, for a non-seat submitter)" — a full write-path
                                           -- scan of every fileTransmission()/insertTx() call site
                                           -- found submitter bound ONLY to the caller's own roster
                                           -- id on every path that exists today (0 orphans, live
                                           -- scan), so the FK below matches reality; the documented
                                           -- non-seat affordance is retired here, not silently
                                           -- dropped (GAP-transmission-submitter-fk-forecloses-documented-affordance).
  lane        TEXT NOT NULL,              -- code | design | leader | vendor
  kind        TEXT,                       -- pr | screen | doc | scope | ...
  what        TEXT,                       -- what changed (core envelope field)
  why         TEXT,                       -- why (core envelope field)
  touches     TEXT,                       -- csv of note ids / areas (core envelope field)
  screens     TEXT,                       -- csv of canon screen numbers (01-399 / 41A / 100A)
  proof       TEXT,                       -- code lane: command+exit+output, or a deeplink
  parent      TEXT REFERENCES transmission(id), -- prior transmission id (an update, not a create)
  grade       TEXT,                       -- json: the gate-grade detail {binding, joinKey, proof, ...}
  route       TEXT NOT NULL,              -- auto | owner | incomplete
  status      TEXT NOT NULL,              -- received | graded | routed | closed
  eval        INTEGER NOT NULL DEFAULT 0, -- 1 = eval row (excluded from the queue + self-cleaned)
  created_at  TEXT NOT NULL,
  components TEXT, decision TEXT, decided_by TEXT REFERENCES people(id), decided_at TEXT,
  decision_note TEXT, gaprefs TEXT, report TEXT, digest TEXT, trace TEXT, about TEXT,
  project TEXT REFERENCES projects(key), via TEXT, client_ref TEXT, goal_ref TEXT, expected TEXT,
  actual TEXT, outcome REAL
);
INSERT INTO transmission (
  id, submitter, lane, kind, what, why, touches, screens, proof, parent, grade, route, status, eval,
  created_at, components, decision, decided_by, decided_at, decision_note, gaprefs, report, digest,
  trace, about, project, via, client_ref, goal_ref, expected, actual, outcome
) SELECT
  id, submitter, lane, kind, what, why, touches, screens, proof, parent, grade, route, status, eval,
  created_at, components, decision, decided_by, decided_at, decision_note, gaprefs, report, digest,
  trace, about, project, via, client_ref, goal_ref, expected, actual, outcome
FROM transmission_old;
DROP TABLE transmission_old;
CREATE INDEX IF NOT EXISTS idx_transmission_clientref ON transmission(submitter, client_ref);
CREATE INDEX IF NOT EXISTS idx_transmission_eval_created ON transmission(eval, created_at);
CREATE INDEX IF NOT EXISTS idx_transmission_goalref ON transmission(goal_ref);
CREATE INDEX IF NOT EXISTS idx_transmission_kind_eval    ON transmission(kind, eval);
CREATE INDEX IF NOT EXISTS idx_transmission_project ON transmission(project, created_at);
CREATE INDEX IF NOT EXISTS idx_transmission_queue ON transmission(route, eval, created_at);
CREATE INDEX IF NOT EXISTS idx_transmission_route     ON transmission(route, status);
CREATE INDEX IF NOT EXISTS idx_transmission_submitter ON transmission(submitter, created_at);

-- ---- transmission_refs (FK re-pin only — see the header note above transmission's own rebuild) ---
-- transmission_refs' own CREATE TABLE text was silently rewritten by the `ALTER TABLE transmission
-- RENAME TO transmission_old` above (SQLite's documented rename behavior); by the time this line
-- runs, `transmission_old` is already dropped, so transmission_refs currently names a table that no
-- longer exists. A plain RENAME does not validate the OLD table's own FK target, so this rebuild
-- succeeds regardless; the new CREATE TABLE below pins the FK back at `transmission`, which by this
-- point in the file is the real, fully-repopulated table.
ALTER TABLE transmission_refs RENAME TO transmission_refs_old;
CREATE TABLE transmission_refs (
  tid TEXT NOT NULL REFERENCES transmission(id),
  ref TEXT NOT NULL
);
INSERT INTO transmission_refs (tid, ref) SELECT tid, ref FROM transmission_refs_old;
DROP TABLE transmission_refs_old;
CREATE INDEX IF NOT EXISTS idx_transmission_refs_ref ON transmission_refs(ref);
CREATE INDEX IF NOT EXISTS idx_transmission_refs_tid ON transmission_refs(tid);

-- ---- approval_audit ---------------------------------------------------------------------------
ALTER TABLE approval_audit RENAME TO approval_audit_old;
CREATE TABLE approval_audit (
  id              TEXT PRIMARY KEY,
  transmission_id TEXT NOT NULL REFERENCES transmission(id),
  verdict         TEXT NOT NULL,          -- approve | reject | needs-work
  note            TEXT,
  decided_by      TEXT NOT NULL REFERENCES people(id), -- person id (owner)
  created_at      TEXT NOT NULL
);
INSERT INTO approval_audit (id, transmission_id, verdict, note, decided_by, created_at)
  SELECT id, transmission_id, verdict, note, decided_by, created_at FROM approval_audit_old;
DROP TABLE approval_audit_old;
-- no dedicated index beyond the PK today.

-- REENTRANCY (heal, 2026-09-23): restore migrate-034.sql's two triggers now that both `transmission`
-- and `approval_audit` are real, final tables again — see the DROP TRIGGER IF EXISTS pair and its
-- comment at the top of this file. On a fresh org (nothing to restore) this simply creates them for
-- the first time, ahead of migrate-034.sql's own IF NOT EXISTS — text below kept byte-identical to
-- migrate-034.sql / boot.sql on purpose.
CREATE TRIGGER IF NOT EXISTS approval_audit_no_update
BEFORE UPDATE ON approval_audit
BEGIN
  SELECT RAISE(ABORT, 'approval_audit is append-only: a changed mind adds a new row, never edits one');
END;

CREATE TRIGGER IF NOT EXISTS approval_audit_no_delete_real
BEFORE DELETE ON approval_audit
WHEN (SELECT eval FROM transmission WHERE id = OLD.transmission_id) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'approval_audit is append-only: no delete on a real (non-eval) decision row');
END;

-- ---- invites ------------------------------------------------------------------------------------
ALTER TABLE invites RENAME TO invites_old;
CREATE TABLE invites (
  id              TEXT PRIMARY KEY,
  code_hash       TEXT NOT NULL UNIQUE,     -- sha256(code); the code itself is never stored
  project_key     TEXT NOT NULL REFERENCES projects(key), -- the project_seats row the redeemer gets (ADR-100)
  role            TEXT NOT NULL,            -- the person's org role (people.role) — same free-text set add-person uses
  label           TEXT,                     -- optional admin note / email hint — informational only, never used for auth
  created_by      TEXT NOT NULL REFERENCES people(id), -- person id of the minting owner
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  redeemed_at     TEXT,
  redeemed_person TEXT REFERENCES people(id), -- person id created at redemption
  revoked_at      TEXT
);
INSERT INTO invites (
  id, code_hash, project_key, role, label, created_by, created_at, expires_at, redeemed_at,
  redeemed_person, revoked_at
) SELECT
  id, code_hash, project_key, role, label, created_by, created_at, expires_at, redeemed_at,
  redeemed_person, revoked_at
FROM invites_old;
DROP TABLE invites_old;
CREATE INDEX IF NOT EXISTS idx_invites_open ON invites(expires_at) WHERE redeemed_at IS NULL AND revoked_at IS NULL;

-- ---- loops --------------------------------------------------------------------------------------
ALTER TABLE loops RENAME TO loops_old;
CREATE TABLE loops (
  id        TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  title     TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'open', -- open | closed
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  ref TEXT
);
INSERT INTO loops (id, person_id, title, status, opened_at, closed_at, ref)
  SELECT id, person_id, title, status, opened_at, closed_at, ref FROM loops_old;
DROP TABLE loops_old;
CREATE INDEX IF NOT EXISTS idx_loops_person  ON loops(person_id, status);
CREATE INDEX IF NOT EXISTS idx_loops_ref_open ON loops(status, ref) WHERE ref IS NOT NULL;

-- ---- project_seats --------------------------------------------------------------------------------
ALTER TABLE project_seats RENAME TO project_seats_old;
CREATE TABLE project_seats (
  person_id    TEXT NOT NULL REFERENCES people(id),
  project_key  TEXT NOT NULL REFERENCES projects(key),
  role         TEXT NOT NULL DEFAULT 'member',  -- per-project role, admin-managed on /control (ADR-100)
  created_at   TEXT NOT NULL,
  PRIMARY KEY (person_id, project_key)
);
INSERT INTO project_seats (person_id, project_key, role, created_at)
  SELECT person_id, project_key, role, created_at FROM project_seats_old;
DROP TABLE project_seats_old;
CREATE INDEX IF NOT EXISTS idx_project_seats_project ON project_seats(project_key);

-- ---- tokens -------------------------------------------------------------------------------------
ALTER TABLE tokens RENAME TO tokens_old;
CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id),
  device     TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  project TEXT REFERENCES projects(key)
);
INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, project)
  SELECT token_hash, person_id, device, created_at, expires_at, revoked, project FROM tokens_old;
DROP TABLE tokens_old;
CREATE INDEX IF NOT EXISTS idx_tokens_person ON tokens(person_id, revoked);
