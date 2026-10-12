-- 008 · the transmission ledger (ADR-063): the router's D1 table.
-- One row per submission; the columns ARE the seam (pr-transmission-spec §2 = ADR-063).
-- R gate-grades a submission at the door and ROUTES it: auto | owner | incomplete (ADR-062).
-- This table holds no conversation text (ADR-016 d) — only the envelope + the grade.
CREATE TABLE IF NOT EXISTS transmission (
  id          TEXT PRIMARY KEY,           -- T-<yyyymmdd>-<seq>
  submitter   TEXT NOT NULL,              -- person id (or name, for a non-seat submitter)
  lane        TEXT NOT NULL,              -- code | design | leader | vendor
  kind        TEXT,                       -- pr | screen | doc | scope | ...
  what        TEXT,                       -- what changed (core envelope field)
  why         TEXT,                       -- why (core envelope field)
  touches     TEXT,                       -- csv of note ids / areas (core envelope field)
  screens     TEXT,                       -- csv of canon screen numbers (01-399 / 41A / 100A)
  proof       TEXT,                       -- code lane: command+exit+output, or a deeplink
  parent      TEXT,                       -- prior transmission id (an update, not a create)
  grade       TEXT,                       -- json: the gate-grade detail {binding, joinKey, proof, ...}
  route       TEXT NOT NULL,              -- auto | owner | incomplete
  status      TEXT NOT NULL,              -- received | graded | routed | closed
  eval        INTEGER NOT NULL DEFAULT 0, -- 1 = eval row (excluded from the queue + self-cleaned)
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transmission_route     ON transmission(route, status);
CREATE INDEX IF NOT EXISTS idx_transmission_submitter ON transmission(submitter, created_at);
