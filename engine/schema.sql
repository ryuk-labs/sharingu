-- Agent R Worker · D1 schema (PRD AGR-13 §5)
-- ⚠ THIS IS A COMMENTED DOC MIRROR, NOT A BOOTABLE SCHEMA (clean-sweep 2026-09-01):
-- it bakes some later-migration columns into its CREATE TABLEs, so replaying it plus
-- migrate-002..0NN fails on duplicate columns by construction. A FRESH tenant boots
-- from the GENERATED `boot.sql` (tools/export-boot-schema.sh; gate step 7 keeps it
-- honest). This file exists for the column-by-column commentary the live DDL cannot
-- carry — read it, never apply it.
-- NOTE: there is deliberately no column anywhere for conversation text (ADR-016 d).

CREATE TABLE IF NOT EXISTS people (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT,
  role       TEXT NOT NULL,              -- economics | product | ai-platform | logistics | internal-eng | external-ai | external-logistics | design | owner
  key_hash   TEXT NOT NULL UNIQUE,       -- sha256 of the issued key; the key itself is never stored
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  title TEXT,            -- migrate-016: display role as users.md understands it; role stays the capsule/gate scope
  trace_consent TEXT     -- migrate-020 (ADR-102): standing consent — NULL/'off' · 'traces' · 'traces+prompts'; self-service on /profile
);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  session_id   TEXT,
  person_id    TEXT NOT NULL,
  kind         TEXT NOT NULL,            -- session_open | drift | unknown | ruling | fragment | exit | correction | gtm | pr (pr = server-side mirror only)
  lane         TEXT,                     -- ENVELOPE lane: code | design | leader | vendor | ba (migrate-009; NULL = legacy/no lane context). NOT people.lane (that's the heartbeat routing tag).
  payload_json TEXT,                     -- claims and references only, never conversation text
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loops (
  id        TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  title     TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'open', -- open | closed
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  ref       TEXT                          -- migrate-014: optional canonical ref (B3), stored verbatim
);

-- migrate-008 (ADR-063): the transmission ledger — one row per router submission.
-- Columns through migrate-015 (ADR-084 §2 · ADR-085 §2) mirrored here for doc parity;
-- this table lived only in migrate-008..015 before, never in this file.
CREATE TABLE IF NOT EXISTS transmission (
  id          TEXT PRIMARY KEY,           -- T-<yyyymmdd>-<seq>
  submitter   TEXT NOT NULL,              -- person id (or name, for a non-seat submitter)
  lane        TEXT NOT NULL,              -- code | design | leader | vendor | ba | gtm (M-ADR-020, migrate-022)
  kind        TEXT,                       -- pr | screen | doc | scope | critique | proposal | insight | ...
  what        TEXT,                       -- what changed (core envelope field)
  why         TEXT,                       -- why (core envelope field)
  touches     TEXT,                       -- csv of note ids / areas (core envelope field)
  screens     TEXT,                       -- csv of canon screen numbers (01-399 / 41A / 100A)
  components  TEXT,                       -- migrate-010: csv of ratified-target component ids touched
  proof       TEXT,                       -- code lane: command+exit+output, or a deeplink
  parent      TEXT,                       -- prior transmission id (an update, not a create)
  grade       TEXT,                       -- json: the gate-grade detail {binding, joinKey, proof, ...}
  route       TEXT NOT NULL,              -- auto | owner | incomplete
  status      TEXT NOT NULL,              -- received | graded | routed | closed
  eval        INTEGER NOT NULL DEFAULT 0, -- 1 = eval row (excluded from the queue + self-cleaned)
  gaprefs     TEXT,                       -- migrate-012 (ADR-074): csv of canonical refs this contribution addresses
  report      TEXT,                       -- migrate-012 (ADR-074): artifact id of the rt-v1.1 report; NULL = backfill target
  digest      TEXT,                       -- migrate-013 (ADR-074): compact structured markdown twin of the report
  decision    TEXT,                       -- migrate-011 (ADR-072): approve | reject | needs-work
  decided_by  TEXT,                       -- migrate-011: owner person id
  decided_at  TEXT,                       -- migrate-011
  decision_note TEXT,                     -- migrate-011; superseded by approval_audit.note (the surfaced copy) — kept for the raw backup archive only, no live reader
  trace       TEXT,                       -- migrate-015 (ADR-084 §2): opt-in banked-artifact id (group:trace), sanitized like `report`, never graded
  about       TEXT,                       -- migrate-015 (ADR-085 §2): free text <=120 chars, the insight kind's claim summary
  via         TEXT,                       -- migrate-021 (M-ADR-006): the submitting surface ("cli/0.x", "mcp", …); NULL = legacy/direct — human vs agent-refined stays queryable
  client_ref  TEXT,                       -- migrate-021 (M-ADR-006): submitter's idempotency key — a retry returns the ORIGINAL filing, never a double-file
  goal_ref    TEXT,                       -- migrate-022 (M-ADR-020): which goal-tree node this moves — validated at the door, stored verbatim (unknown = loud note, absent = unaligned)
  expected    TEXT,                       -- migrate-022 (M-ADR-020): the gtm dimension's declared outcome, free text, capped, never graded
  actual      TEXT,                       -- migrate-022 (M-ADR-020): a later update to `expected`, free text, capped, never graded
  outcome     REAL,                       -- migrate-023 (M-ADR-021): realized units for weight-by-outcome, nullable, never graded
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transmission_clientref ON transmission(submitter, client_ref); -- migrate-021
CREATE INDEX IF NOT EXISTS idx_transmission_goalref   ON transmission(goal_ref); -- migrate-022
CREATE INDEX IF NOT EXISTS idx_transmission_route     ON transmission(route, status);
CREATE INDEX IF NOT EXISTS idx_transmission_submitter ON transmission(submitter, created_at);

CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id, created_at);
CREATE INDEX IF NOT EXISTS idx_loops_person  ON loops(person_id, status);
CREATE INDEX IF NOT EXISTS idx_people_owner ON people(role, active, created_at); -- migrate-037
CREATE INDEX IF NOT EXISTS idx_tokens_live ON tokens(revoked, created_at); -- migrate-037
CREATE INDEX IF NOT EXISTS idx_loops_status ON loops(status, person_id); -- migrate-037
CREATE INDEX IF NOT EXISTS idx_approval_audit_decided_by ON approval_audit(decided_by); -- migrate-037
CREATE INDEX IF NOT EXISTS idx_events_audit ON events(created_at) WHERE kind NOT IN ('session_open','exit','fragment','file') AND COALESCE(json_extract(payload_json,'$.mind'),0) != 1 AND COALESCE(json_extract(payload_json,'$.eval'),0) = 0; -- migrate-037
-- sessions / idx_sessions_person dropped (migrate-030.sql, Q0544F477, build0920:clear-the-ground) —
-- zero reads/writes anywhere in engine/src; the schema's only DB-enforced FK, gone with it.

-- migrate-019 (ADR-100 · workspace-prd): the project axis, mirrored here for doc
-- parity (same convention as the transmission block above). Org = hard wall (own
-- worker, ADR-094); project = soft scoping inside it. transmission/events/artifacts
-- each gained a `project` TEXT column (backfilled to project #1) + a (project,
-- created_at) index; tokens gained `project` (the session's picker/switcher stamp).
CREATE TABLE IF NOT EXISTS projects (
  key          TEXT PRIMARY KEY,          -- short slug, e.g. 'siru'
  name         TEXT NOT NULL,
  registry_ptr TEXT,                      -- optional per-project screen-registry pointer (manifest projects[])
  atlas_map    TEXT,                      -- optional per-project atlas map pointer
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_seats (
  person_id    TEXT NOT NULL,
  project_key  TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',  -- per-project role, admin-managed on /control
  created_at   TEXT NOT NULL,
  PRIMARY KEY (person_id, project_key)
);
CREATE INDEX IF NOT EXISTS idx_project_seats_project ON project_seats(project_key);

-- migrate-024 (M-ADR-023): the cross-org launcher's single-use SSO nonce. /sso/enter INSERTs a
-- redeemed handoff's nonce atomically; a replay (incl. concurrent) hits the PRIMARY KEY and is refused.
CREATE TABLE IF NOT EXISTS sso_nonce (
  n          TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
