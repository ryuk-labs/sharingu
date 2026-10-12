-- migrate-039.sql — the knowledge store (docs/plan/ARCHITECTURE.md §2). EXPAND-ONLY: new tables and three indexes, no
-- existing table touched, no row written. The worker before and after this migration runs either way: nothing reads these
-- tables until the knowledge door (src/knowledge/) is deployed. Applied live with tools/migrate.sh (a bookmark first).
--
-- Every k_ table is one project's data: `project` first in every primary key, so every read filters on it first. Ids are
-- the caller's own (validated by src/knowledge/schema.js), so a re-run of an import is an upsert by id. JSON columns are
-- TEXT checked with json_valid. Indexes are kept to the primary keys plus the three filters a screen reads by (each index
-- is one more row write per insert on the free tier).

CREATE TABLE IF NOT EXISTS k_aim (
  project    TEXT NOT NULL REFERENCES projects(key),
  aim        TEXT NOT NULL,
  measure    TEXT CHECK (measure IS NULL OR json_valid(measure)),   -- {name, value, period, prior, priorPeriod, source}
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project)
);

CREATE TABLE IF NOT EXISTS k_goals (
  project        TEXT NOT NULL REFERENCES projects(key),
  id             TEXT NOT NULL,
  parent         TEXT,                  -- null for the one root (the tree rules are checked by the write door)
  title          TEXT NOT NULL,
  dimensions     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(dimensions)),   -- lane keys
  weight         REAL,
  target         REAL,
  outcome_metric INTEGER CHECK (outcome_metric IS NULL OR outcome_metric IN (0, 1)),
  owner          TEXT,
  due            TEXT,                  -- YYYY-MM-DD
  note           TEXT,
  status         TEXT,
  sort           INTEGER,
  created_by     TEXT NOT NULL REFERENCES people(id),
  created_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL REFERENCES people(id),
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (project, id)
);

CREATE TABLE IF NOT EXISTS k_questions (
  project       TEXT NOT NULL REFERENCES projects(key),
  qid           TEXT NOT NULL,
  question      TEXT NOT NULL,
  why           TEXT,
  area          TEXT,
  severity      TEXT,
  status        TEXT NOT NULL CHECK (status IN ('open', 'provisional', 'decided', 'superseded', 'moot')),
  choice        TEXT,
  label         TEXT,
  rationale     TEXT,
  decided_by    TEXT,
  decided_at    TEXT,
  affects       TEXT CHECK (affects IS NULL OR json_valid(affects)),
  blocks        TEXT CHECK (blocks IS NULL OR json_valid(blocks)),
  who_owes      TEXT,
  waiting_on    TEXT,
  impl_status   TEXT,
  superseded_by TEXT,
  created_by    TEXT NOT NULL REFERENCES people(id),
  created_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL REFERENCES people(id),
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (project, qid)
);

CREATE TABLE IF NOT EXISTS k_options (
  project    TEXT NOT NULL REFERENCES projects(key),
  qid        TEXT NOT NULL,             -- the question's qid (the write door replaces a question's options together)
  idx        INTEGER NOT NULL,          -- 0 = option A
  what       TEXT NOT NULL,
  tradeoff   TEXT,
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, qid, idx)
);

CREATE TABLE IF NOT EXISTS k_checks (
  project     TEXT NOT NULL REFERENCES projects(key),
  id          TEXT NOT NULL,
  kind        TEXT,
  method      TEXT,
  severity    TEXT,
  title       TEXT NOT NULL,
  given       TEXT,
  when_       TEXT,
  then_       TEXT,
  source_type TEXT,
  source_id   TEXT,
  refs        TEXT CHECK (refs IS NULL OR json_valid(refs)),        -- the node/goal/question ids it grades
  rulings     TEXT CHECK (rulings IS NULL OR json_valid(rulings)),
  status      TEXT,
  created_by  TEXT NOT NULL REFERENCES people(id),
  created_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL REFERENCES people(id),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (project, id)
);

CREATE TABLE IF NOT EXISTS k_cards (
  project         TEXT NOT NULL REFERENCES projects(key),
  kind            TEXT NOT NULL,
  id              TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT,
  body_md         TEXT,
  role_visibility TEXT CHECK (role_visibility IS NULL OR json_valid(role_visibility)),
  created_by      TEXT NOT NULL REFERENCES people(id),
  created_at      TEXT NOT NULL,
  updated_by      TEXT NOT NULL REFERENCES people(id),
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (project, kind, id)
);

CREATE TABLE IF NOT EXISTS k_card_kinds (
  project         TEXT NOT NULL REFERENCES projects(key),
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  id_pattern      TEXT,
  role_visibility TEXT CHECK (role_visibility IS NULL OR json_valid(role_visibility)),
  created_by      TEXT NOT NULL REFERENCES people(id),
  created_at      TEXT NOT NULL,
  updated_by      TEXT NOT NULL REFERENCES people(id),
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (project, key)
);

CREATE TABLE IF NOT EXISTS k_nodes (
  project    TEXT NOT NULL REFERENCES projects(key),
  id         TEXT NOT NULL,
  type       TEXT NOT NULL,             -- surface · lane · screen · door · table · entity · flow · gap · dep · evidence · service
  name       TEXT NOT NULL,
  status     TEXT,                      -- live · planned · retired (a gap: open · closed)
  data       TEXT CHECK (data IS NULL OR json_valid(data)),
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, id)
);

CREATE TABLE IF NOT EXISTS k_edges (
  project    TEXT NOT NULL REFERENCES projects(key),
  from_id    TEXT NOT NULL,             -- a k_nodes id (checked by the write door, and removing a node removes its edges)
  to_id      TEXT NOT NULL,
  kind       TEXT NOT NULL,             -- nav · reads · writes · relation · depends · blocks · flow-step
  label      TEXT,
  data       TEXT CHECK (data IS NULL OR json_valid(data)),
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, from_id, to_id, kind)
);

CREATE TABLE IF NOT EXISTS k_gtm (
  project    TEXT NOT NULL REFERENCES projects(key),
  template   TEXT NOT NULL CHECK (json_valid(template)),
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project)
);

CREATE TABLE IF NOT EXISTS k_docs (
  project         TEXT NOT NULL REFERENCES projects(key),
  path            TEXT NOT NULL,        -- e.g. capsules/owner.md, start-here.md
  title           TEXT,
  body_md         TEXT,
  role_visibility TEXT CHECK (role_visibility IS NULL OR json_valid(role_visibility)),
  created_by      TEXT NOT NULL REFERENCES people(id),
  created_at      TEXT NOT NULL,
  updated_by      TEXT NOT NULL REFERENCES people(id),
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (project, path)
);

CREATE TABLE IF NOT EXISTS k_versions (
  project    TEXT NOT NULL REFERENCES projects(key),
  n          INTEGER NOT NULL,
  title      TEXT,
  cause      TEXT NOT NULL CHECK (cause IN ('published', 'restored')),
  cause_ref  TEXT,
  counts     TEXT CHECK (counts IS NULL OR json_valid(counts)),
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, n)
);

-- a version's content, one knowledge table at a time, CHUNKED: a D1 row holds at most 2 MB and one project alone carries
-- thousands of checks, so a table's rows are split across chunks 0..n
CREATE TABLE IF NOT EXISTS k_snapshots (
  project    TEXT NOT NULL REFERENCES projects(key),
  n          INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  chunk      INTEGER NOT NULL,
  payload    TEXT NOT NULL CHECK (json_valid(payload)),   -- a JSON array of that table's rows
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, n, table_name, chunk)
);

-- the org itself, one row: its name, its brand and its home project
CREATE TABLE IF NOT EXISTS org (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  name       TEXT NOT NULL,
  brand      TEXT CHECK (brand IS NULL OR json_valid(brand)),
  home       TEXT REFERENCES projects(key),
  created_by TEXT REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT REFERENCES people(id),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_k_goals_parent ON k_goals(project, parent);
CREATE INDEX IF NOT EXISTS idx_k_nodes_type ON k_nodes(project, type);
CREATE INDEX IF NOT EXISTS idx_k_questions_status ON k_questions(project, status);
