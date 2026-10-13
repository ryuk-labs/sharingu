-- boot.sql — the canonical fresh-tenant schema (GENERATED, do not hand-edit).
-- Regenerate: sh tools/export-boot-schema.sh   (it reads ryuklabs-agent-r, the one org worker today; this file's last full
-- export, 2026-09-17, read siru-agent-r, a worker since retired, and every migration after it was hand-added below)
-- Why this exists: schema.sql is a DOC mirror and the migrations do not replay
-- clean over it (backlog #1). Day-0 applies THIS file to an empty D1, never by hand: tools/new-org.sh step 5 (a self-hosted
-- platform on Cloudflare: this schema alone, an empty platform), tools/r-local.sh seed (a local one; tools/smoke.sh and
-- tools/dev-local.sh use it) or tools/restore-local.mjs restore (a local database rebuilt from a dump).
-- The gate's boot-schema coverage step (tools/check-boot-schema.py) keeps it honest against migrate-*.sql.
--
-- build0921:schema-enforced (QD1A9E7EB · Q5AE248CC · Q0B50A78E · Q23D7E346 · QE2D90B38) hand-updated
-- this file to the end state migrate-031..035.sql produce against a live D1 — a real
-- `sh tools/export-boot-schema.sh` re-export against ryuklabs-agent-r once those migrations are actually
-- applied there is still owed, to catch any formatting drift between this hand-edit and SQLite's own
-- sqlite_master text; tools/check-boot-schema.py's coverage check (every ADD COLUMN / CREATE TABLE /
-- CREATE INDEX named in a migration is present here) passes against this file today regardless.
--
-- build0925:d1-hot-queries hand-added migrate-037.sql's five indexes in the export's own name order (a re-export
-- reads the remote D1, which that dev run was barred from touching; the same re-export as above is owed).
-- UI-B3 Home (2026-09-27) hand-added migrate-038.sql's one index (idx_transmission_parent) in the same name order, for
-- the same reason: the migration is applied live by the session before ship, so a re-export here would not carry it yet.
-- Slice 0, the knowledge core (2026-09-30), hand-added migrate-039.sql's tables (k_* and org) and its three indexes in
-- the same name order, for the same reason: it is applied live before ship, so a re-export would not carry it yet.
-- Sprint 1's review fixes (2026-09-30) hand-added migrate-041.sql's table (k_check_ungraded), its three triggers and its
-- partial index (idx_transmission_knowledge) the same way, for the same reason.
-- Sprint 2's live budget (2026-09-30) hand-added migrate-042.sql's four tally tables, their twelve triggers and its ten indexes
-- the same way, for the same reason.
-- Sprint 2's Control and profiles (2026-10-01) hand-added migrate-044.sql's three people columns (hats, avatar, role_label)
-- the same way, for the same reason.
-- Sprint 2's Map (2026-10-01) appended migrate-043.sql's two tables (k_node_lights, k_node_links), their nine triggers
-- and its three indexes at the END of this file (another builder was editing it at the same time), for the same reason.
-- Sprint 2's access hats (2026-10-01) hand-added migrate-045.sql's one people column (access_hats, the admin-set hats that
-- unlock reading) the same way, for the same reason.
-- Sprint 2's screens and renders (2026-10-01) appended migrate-046.sql's three tables (k_renders, k_styles, k_screen_renders),
-- its four triggers and its two indexes (idx_k_renders_hash, idx_k_nodes_screen_surface) at the END of this file, for the
-- same reason.
-- Sprint 3's preview, then file (2026-10-01) appended migrate-048.sql's one table (previews, WITHOUT ROWID, no index) and
-- migrate-049.sql's one index (idx_transmission_day_seq: the day's next contribution id) at the END of this file, for the
-- same reason.
-- Sprint 3's happenedAt (2026-10-01) hand-added migrate-051.sql's one transmission column (happened_at: when the work really
-- happened, beside the filing's own created_at; no index) the same way, for the same reason.
-- Sprint 3's B4, impact and carry-forward (2026-10-01): migrate-052.sql's card-kind column (review_after_days) and
-- migrate-053.sql's six transmission columns (the pick-up) were hand-added to their tables; 053's two indexes and its trigger,
-- and migrate-054.sql's two tables (k_node_stale, k_check_stale), four indexes and twelve triggers are appended at the END of
-- this file; 054's three transmission_goals triggers replace migrate-042's in place (the month is when the work happened).
-- Sprint 3's one-pass fix (2026-10-01) hand-added migrate-055.sql's eight columns (source on k_questions, k_goals, k_docs and
-- k_aim; as_of and confidence on k_aim and k_gtm) to their tables, the same way, for the same reason.
-- Sprint 3's B5, extract (2026-10-01): migrate-056.sql's FTS5 table k_find (contentless: search's index) and its twenty-one
-- triggers are appended at the END of this file, for the same reason (its backfill is not: a fresh org has nothing to index).
-- Sprint 3's D1b (2026-10-02): migrate-057.sql drops migrate-054's two render triggers (k_stale_render_insert and _update: a new
-- picture of a screen does not make its grades stale, owner MCQ 2026-10-02); they are taken out of this file, nothing added.
-- migrate-058.sql's three columns (k_aim.product_model; k_goals.as_of and confidence) are hand-added to their tables, and
-- migrate-057's partial index idx_k_nodes_screen_multi sits beside idx_k_nodes_screen_surface.
-- Sprint 3's D2 (2026-10-02) hand-added migrate-059.sql's one column (k_cards.source: where a card was recorded) the same way,
-- for the same reason.
-- Sprint 3's S3b (2026-10-02) hand-added migrate-062.sql's one column (projects.eval: a test run's own project) to its table and
-- replaced migrate-054's k_stale_contribution trigger in place (a marked change stales grades inside an eval project only).
-- Sprint 4's F1 (2026-10-05) hand-added migrate-064.sql's two columns (k_goals.budget: a goal's money; k_cards.refs: the cards a
-- card relies on) to their tables, the same way, for the same reason.
-- Sprint 4's M6 (2026-10-05) appended migrate-065.sql's one table (k_screen_takes: a screen's takes, the frame's history), its
-- two indexes and its two triggers on k_renders at the END of this file, for the same reason (its backfill is not: a fresh org
-- has no render to take).
-- Sprint 6's 6.1, the tables (2026-10-06): migrate-067.sql's org table (many rows, rebuilt in place below), projects' two
-- generated columns (org, slug: the key rule) and their unique index, the org column of the nine org-wide tables, the nine
-- running-count triggers (replaced in place: the bucket of a row with no project is per org) and sso_nonce dropped; and
-- migrate-068.sql's nine refusing triggers at the END of this file. tools/check-boot-schema.py now holds this file EQUAL to
-- the migrations replayed in order: the tables, the indexes and the triggers (each trigger's text too).
-- Sprint 7's 7.1, accounts (2026-10-07): migrate-070.sql's accounts table (first below), people.account_id and
-- login_attempts.account_id, its three indexes in the export's name order and its three triggers at the END of this file.
-- Sprint 7's 7.2, sign-up by allowlist (2026-10-07): migrate-071.sql's signup_codes table (the operator's one-time codes, a
-- platform table: no org) in the tables' name order, and its one index (idx_signup_open) in the export's name order.
-- Sprint 7's 7.3, create an org (2026-10-07): migrate-072.sql's two org columns (slug: the org's path name; created_by_account:
-- the account that created it through the door) in the org table below, its two indexes (idx_org_founder, idx_org_slug) in
-- the export's name order and its two triggers (the default slug, derived from the name) at the END of this file.
-- Sprint 7's 7.4, the front door by path (2026-10-07): migrate-073.sql's one tokens column (account_id: the account a session
-- belongs to, NULL for a seat session) in the tokens table below.
-- Sprint 7's review, a seat waits for its holder's yes (2026-10-08): migrate-074.sql's one people column (pending: a seat an
-- org's admin added for an account that stands elsewhere, inactive until its holder accepts it) in the people table below.
-- Sprint 8's 8.1, plans and usage (2026-10-08): migrate-075.sql's plan_limits table (one row per plan, the owner's ruled limits;
-- a platform table: no org) in the tables' name order, WITH its two seed rows (free, team) right after it — the one INSERT in
-- this file: a fresh database needs the ruled limits, and a re-export from sqlite_master would not carry them
-- (tools/plans-selftest.mjs pins them here) — and its one org column (plan, default 'free') in the org table below. Org 1's
-- 'team' is the migration's UPDATE on live; a fresh database holds no org row yet (its seed writes the row). Its three indexes
-- (idx_artifacts_org_bytes, idx_people_org_seated, idx_transmission_org_month: the usage read's) in the export's name order.
-- Sprint 8's 8.2, enforcement (2026-10-08): migrate-076.sql's org_usage table (the plan's running counters: ONE row per org,
-- the day's calls, the minute's burst and the month's items) in the tables' name order, and its one index (idx_people_org_held:
-- the held seats, active or pending) in the export's name order. Its seed (this month's items, from the ledger) is the
-- migration's on live; a fresh database holds no filing yet.
-- Sprint 8's 8.3a, the sprint-7 review's auth rows (2026-10-08): migrate-077.sql's login_attempts column (client: where an
-- attempt came from, the lockout's key) and people column (reissued_at: the seat's grants epoch) in their tables below, and its
-- one index (idx_login_known: the vouch lookup) in the export's name order.
-- Sprint 8's 8.3b, the cost cuts (2026-10-08): migrate-078.sql's one index (idx_previews_prune: the unfiled previews by when
-- they expire, the cron's prune) right after its table (previews is made below the name-ordered indexes), and its table
-- k_question_refs (the refs each question's affects names: the Map's inspector) with its three triggers at the end.
-- Sprint 12's 12.3, invite links (2026-10-10): migrate-079.sql's accounts column (invited_org: the org whose invite link set
-- the account's passphrase) in the accounts table below, its seat_invites table (an org's one-time links, one seat each) in the
-- tables' name order and its one index (idx_seat_invites_person) in the export's name order.
-- Sprint 13's 13.1, which AI filed it (2026-10-11): migrate-080.sql's transmission column (client: the one family word the
-- filing client declares, NULL unknown) in the transmission table below.
-- Sprint 21's 21.1, request access (2026-10-13): migrate-081.sql's access_requests table (a person's request for a beta place,
-- its profile and its private link's hash; a platform table: no org) in the tables' name order (first), and its three indexes
-- (idx_access_requests_email, idx_access_requests_line, idx_access_requests_open) in the export's name order; its re-made slug triggers (org_slug_on_insert,
-- org_slug_on_update: 'request-access' among the reserved names) in place at the END of this file.

-- migrate-081: a person's request for a beta place (one open request per email; only its private link's hash is kept)
CREATE TABLE IF NOT EXISTS access_requests (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL CHECK (email = lower(trim(email)) AND email <> ''),
  name        TEXT NOT NULL,
  company     TEXT NOT NULL,
  role        TEXT NOT NULL,
  team_size   TEXT NOT NULL,
  website     TEXT,
  linkedin    TEXT,
  x           TEXT,
  github      TEXT,
  ai_tools    TEXT,
  use_case    TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'declined')),
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  approved_at TEXT
);

-- migrate-070: one account per email (the holder's own passphrase, none until they set one); a people row is its seat in one org
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND email <> ''),
  pass_hash  TEXT,
  pass_salt  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  invited_org INTEGER
);

CREATE TABLE IF NOT EXISTS approval_audit (
  id              TEXT PRIMARY KEY,
  transmission_id TEXT NOT NULL REFERENCES transmission(id),
  verdict         TEXT NOT NULL,          -- approve | reject | needs-work
  note            TEXT,
  decided_by      TEXT NOT NULL REFERENCES people(id), -- person id (owner)
  created_at      TEXT NOT NULL
, org INTEGER);

CREATE TABLE IF NOT EXISTS artifacts (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id),
  kind       TEXT NOT NULL,        -- html | image | svg | pdf | json | other
  title      TEXT,
  r2_key     TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  group_tag  TEXT NOT NULL CHECK (trim(group_tag) <> '' AND group_tag <> 'ungrouped'), -- QE2D90B38: which system-part this belongs to — never null, never the untagged sentinel ('legacy-ungrouped' marks pre-enforcement history honestly)
  created_at TEXT NOT NULL
, screens TEXT, states TEXT, project TEXT REFERENCES projects(key), org INTEGER);

CREATE TABLE IF NOT EXISTS check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL REFERENCES projects(key), -- workspace key, same column convention as transmission.project
  pack_version TEXT NOT NULL,       -- pack.json's version at grade time — a grade against an old version is honest history, never rewritten
  check_id TEXT NOT NULL,           -- pack checks.json's own id, e.g. "AC.landing.01"
  status TEXT NOT NULL,             -- proven | refused | incomplete — same three the door already uses for R3 (gateGrade)
  transmission_id TEXT REFERENCES transmission(id), -- was INTEGER (Q5AE248CC fixed the type mismatch) — the transmission row that filed this grade (submit_grade, §5) — one ledger, not two
  graded_by TEXT NOT NULL REFERENCES people(id),    -- was INTEGER (Q5AE248CC fixed the type mismatch) — people.id
  graded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  session_id   TEXT,                     -- dead: sessions table dropped (Q0544F477/migrate-030.sql); not resurrected as a FK — nothing left to reference
  person_id    TEXT NOT NULL REFERENCES people(id),
  kind         TEXT NOT NULL,            -- session_open | drift | unknown | ruling | fragment | exit | correction | ... (org-extensible: ENGINE_EVENT_KINDS + tenant eventKindExtensions, validated at every insert door — never a closed schema CHECK)
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)), -- Q0B50A78E: claims and references only, never raw conversation text — structurally, it must be JSON
  created_at   TEXT NOT NULL
, touches TEXT, basis   TEXT, stamped INTEGER NOT NULL DEFAULT 0, lane TEXT, project TEXT REFERENCES projects(key), org INTEGER);

CREATE TABLE IF NOT EXISTS invites (
  id              TEXT PRIMARY KEY,
  code_hash       TEXT NOT NULL UNIQUE,     -- sha256(code); the code itself is never stored
  project_key     TEXT NOT NULL REFERENCES projects(key), -- the project_seats row the redeemer gets (ADR-100)
  role            TEXT NOT NULL,            -- the person's org role (people.role) — same free-text set add-person uses
  label           TEXT,                     -- optional admin note / email hint — informational only, never used for auth
  created_by      TEXT NOT NULL REFERENCES people(id), -- person id of the minting owner
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  redeemed_at     TEXT,
  redeemed_person TEXT REFERENCES people(id),          -- person id created at redemption
  revoked_at      TEXT,
  org             INTEGER
);

CREATE TABLE IF NOT EXISTS k_aim (
  project    TEXT NOT NULL REFERENCES projects(key),
  aim        TEXT NOT NULL,
  measure    TEXT CHECK (measure IS NULL OR json_valid(measure)),   -- {name, value, period, prior, priorPeriod, source}
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  source     TEXT CHECK (source IS NULL OR json_valid(source)),     -- migrate-055: where it was recorded [{kind, ref, label?}]
  as_of      TEXT,                     -- migrate-055: when it was true or last checked (YYYY-MM-DD)
  confidence TEXT,                     -- migrate-055: confirmed | direction | proposal | unknown
  product_model TEXT CHECK (product_model IS NULL OR json_valid(product_model)),   -- migrate-058: {none, why}: no product model by design
  PRIMARY KEY (project)
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
  tab             TEXT,                 -- migrate-047: the tab its cards list on (one of the eight tabs' keys)
  review_after_days INTEGER,            -- migrate-052: days a card of this kind stays fresh after its as_of (NULL: 90)
  PRIMARY KEY (project, key)
);
-- migrate-060: the card kinds that name a tab, read by every tab's main page (src/tablists.js TAB_KINDS_SQL)
CREATE INDEX IF NOT EXISTS idx_k_card_kinds_tab ON k_card_kinds(project, tab);

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
  as_of           TEXT,                 -- migrate-047: when it was true or last checked (YYYY-MM-DD)
  confidence      TEXT,                 -- migrate-047: confirmed | direction | proposal | unknown
  source          TEXT CHECK (source IS NULL OR json_valid(source)),   -- migrate-059: where it was recorded
  refs            TEXT CHECK (refs IS NULL OR json_valid(refs)),       -- migrate-064: the cards it relies on
  PRIMARY KEY (project, kind, id)
);

CREATE TABLE IF NOT EXISTS k_check_refs (
  project  TEXT NOT NULL REFERENCES projects(key),
  ref      TEXT NOT NULL,             -- a node, goal or question id the check names (one element of k_checks.refs)
  check_id TEXT NOT NULL,             -- the k_checks id
  PRIMARY KEY (project, ref, check_id)
);

CREATE TABLE IF NOT EXISTS k_check_ungraded (
  project  TEXT NOT NULL REFERENCES projects(key),
  check_id TEXT NOT NULL,             -- a k_checks id with no check_results row in its project yet
  PRIMARY KEY (project, check_id)
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
  as_of           TEXT,                 -- migrate-047: when it was true or last checked (YYYY-MM-DD)
  confidence      TEXT,                 -- migrate-047: confirmed | direction | proposal | unknown
  source          TEXT CHECK (source IS NULL OR json_valid(source)),   -- migrate-055: where it was recorded
  PRIMARY KEY (project, path)
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
  source         TEXT CHECK (source IS NULL OR json_valid(source)),   -- migrate-055: where it was recorded
  as_of          TEXT,                  -- migrate-058: when it was true or last checked (YYYY-MM-DD)
  confidence     TEXT,                  -- migrate-058: confirmed | direction | proposal | unknown
  budget         TEXT CHECK (budget IS NULL OR json_valid(budget)),   -- migrate-064: {allocated, spent, currency, source}
  PRIMARY KEY (project, id)
);

CREATE TABLE IF NOT EXISTS k_gtm (
  project    TEXT NOT NULL REFERENCES projects(key),
  template   TEXT NOT NULL CHECK (json_valid(template)),
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  as_of      TEXT,                     -- migrate-055: when it was true or last checked (YYYY-MM-DD)
  confidence TEXT,                     -- migrate-055: confirmed | direction | proposal | unknown
  PRIMARY KEY (project)
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
  source        TEXT CHECK (source IS NULL OR json_valid(source)),    -- migrate-055: where the ruling was recorded
  PRIMARY KEY (project, qid)
);

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

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY, email TEXT, ok INTEGER, at TEXT
, org INTEGER, account_id TEXT, client TEXT);

CREATE TABLE IF NOT EXISTS loops (
  id        TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  title     TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'open', -- open | closed
  opened_at TEXT NOT NULL,
  closed_at TEXT
, ref TEXT, org INTEGER);

CREATE TABLE IF NOT EXISTS loops_open (
  person_id TEXT NOT NULL,
  mind      INTEGER NOT NULL,
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (person_id, mind)
);

-- migrate-067: many orgs (an org id is the number a project key carries: src/project.js)
CREATE TABLE IF NOT EXISTS org (
  id         INTEGER PRIMARY KEY CHECK (id >= 1),
  name       TEXT NOT NULL,
  brand      TEXT CHECK (brand IS NULL OR json_valid(brand)),
  home       TEXT REFERENCES projects(key),
  created_by TEXT REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT REFERENCES people(id),
  updated_at TEXT NOT NULL,
  settings   TEXT CHECK (settings IS NULL OR json_valid(settings)),
  slug       TEXT CHECK (slug IS NULL OR (length(slug) BETWEEN 2 AND 40 AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '*[-][-]*' AND slug NOT GLOB '[-]*' AND slug NOT GLOB '*[-]')),
  created_by_account TEXT,
  plan       TEXT NOT NULL DEFAULT 'free' CHECK (length(plan) BETWEEN 1 AND 40 AND plan NOT GLOB '*[^a-z0-9-]*')
);

-- migrate-076: the plan's running counters, ONE row per org (src/plans.js: the day's calls, the minute's burst, the month's items)
CREATE TABLE IF NOT EXISTS org_usage (
  org          INTEGER PRIMARY KEY CHECK (org >= 1),
  day          TEXT NOT NULL DEFAULT '' CHECK (length(day) <= 10),
  calls_day    INTEGER NOT NULL DEFAULT 0 CHECK (calls_day >= 0),
  minute       TEXT NOT NULL DEFAULT '' CHECK (length(minute) <= 16),
  calls_minute INTEGER NOT NULL DEFAULT 0 CHECK (calls_minute >= 0),
  month        TEXT NOT NULL DEFAULT '' CHECK (length(month) <= 7),
  items_month  INTEGER NOT NULL DEFAULT 0 CHECK (items_month >= 0)
);

CREATE TABLE IF NOT EXISTS people (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT,
  role       TEXT NOT NULL,              -- owner (the admin) | member | partner (migrate-044; a typed label before it, kept in role_label)
  key_hash   TEXT NOT NULL UNIQUE,       -- sha256 of the issued key; the key itself is never stored
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
, pass_hash TEXT, pass_salt TEXT, title TEXT, capture_mode TEXT NOT NULL DEFAULT 'yield', lane TEXT, trace_consent TEXT, hats TEXT, avatar TEXT, role_label TEXT, access_hats TEXT, org INTEGER, account_id TEXT REFERENCES accounts(id), pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1) AND (pending = 0 OR active = 0)), reissued_at TEXT);

-- migrate-075: the plans and their limits (the owner's ruled numbers, docs/plan/PLATFORM.md §4 sprint 8)
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

CREATE TABLE IF NOT EXISTS project_seats (
  person_id    TEXT NOT NULL REFERENCES people(id),
  project_key  TEXT NOT NULL REFERENCES projects(key),
  role         TEXT NOT NULL DEFAULT 'member',  -- per-project role, admin-managed on /control (ADR-100)
  created_at   TEXT NOT NULL,
  PRIMARY KEY (person_id, project_key)
);

CREATE TABLE IF NOT EXISTS projects (
  key          TEXT PRIMARY KEY,          -- short slug, e.g. 'siru'
  name         TEXT NOT NULL,             -- display name, e.g. 'SIRU'
  registry_ptr TEXT,                      -- optional per-project screen-registry pointer (manifest projects[])
  atlas_map    TEXT,                      -- optional per-project atlas map pointer
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
, eval INTEGER NOT NULL DEFAULT 0, org INTEGER GENERATED ALWAYS AS (CASE WHEN key GLOB 'o[1-9]*[-][-]?*' AND substr(key, 2, instr(key, char(45, 45)) - 2) NOT GLOB '*[^0-9]*' AND substr(key, 2, instr(key, char(45, 45)) - 2) <> '1' THEN CAST(substr(key, 2, instr(key, char(45, 45)) - 2) AS INTEGER) ELSE 1 END) VIRTUAL, slug TEXT GENERATED ALWAYS AS (CASE WHEN key GLOB 'o[1-9]*[-][-]?*' AND substr(key, 2, instr(key, char(45, 45)) - 2) NOT GLOB '*[^0-9]*' AND substr(key, 2, instr(key, char(45, 45)) - 2) <> '1' THEN substr(key, instr(key, char(45, 45)) + 2) ELSE key END) VIRTUAL);

-- migrate-071: the operator's one-time sign-up codes (one open code per email; only the code's hash is kept)
-- migrate-079: an org's one-time invite links, one seat each (only the link's hash kept; src/accounts.js THE INVITE LINK)
CREATE TABLE IF NOT EXISTS seat_invites (
  id          TEXT PRIMARY KEY,
  org         INTEGER NOT NULL,
  person_id   TEXT NOT NULL REFERENCES people(id),
  email       TEXT NOT NULL CHECK (email = lower(trim(email)) AND email <> ''),
  token_hash  TEXT NOT NULL UNIQUE,
  seat_stamp  TEXT NOT NULL,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  spent_by    TEXT,
  revoked_at  TEXT
);

CREATE TABLE IF NOT EXISTS signup_codes (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL CHECK (email = lower(trim(email)) AND email <> ''),
  code_hash  TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_how   TEXT CHECK (used_how IS NULL OR used_how IN ('created', 'set', 'reset')),
  spent_by   TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id),
  device     TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0
, project TEXT REFERENCES projects(key), org INTEGER, account_id TEXT);

CREATE TABLE IF NOT EXISTS transmission (
  id          TEXT PRIMARY KEY,           -- T-<yyyymmdd>-<seq>
  submitter   TEXT NOT NULL REFERENCES people(id), -- person id. QCE1F9725/QD1A9E7EB: the FK matches every live write path (0 orphans, full scan); the column's old "(or name, for a non-seat submitter)" affordance is retired, not silently dropped (GAP-transmission-submitter-fk-forecloses-documented-affordance)
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
  created_at  TEXT NOT NULL
, components TEXT, decision TEXT, decided_by TEXT REFERENCES people(id), decided_at TEXT, decision_note TEXT, gaprefs TEXT, report TEXT, digest TEXT, trace TEXT, about TEXT, project TEXT REFERENCES projects(key), via TEXT, client_ref TEXT, goal_ref TEXT, expected TEXT, actual TEXT, outcome REAL, shape TEXT CHECK (shape IS NULL OR json_valid(shape)), next_by TEXT, next_who TEXT, happened_at TEXT, next_due TEXT, next_picked_by TEXT, next_picked_at TEXT, next_done_at TEXT, next_done_by TEXT, next_done_note TEXT, org INTEGER, client TEXT);

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

CREATE TABLE IF NOT EXISTS transmission_refs (
  tid TEXT NOT NULL REFERENCES transmission(id),
  ref TEXT NOT NULL
);

-- Q23D7E346: approval_audit is append-only — a record of decisions, never edited; a changed mind
-- adds a new row. No UPDATE path exists in code today (grepped clean); this trigger makes the
-- guarantee infra, not prose, so a future write path cannot silently add one.
CREATE TRIGGER IF NOT EXISTS approval_audit_no_update
BEFORE UPDATE ON approval_audit
BEGIN
  SELECT RAISE(ABORT, 'approval_audit is append-only: a changed mind adds a new row, never edits one');
END;

-- DELETE stays possible for exactly the sanctioned eval-hygiene sweep (src/admin.js clears rows
-- whose transmission is eval=1); any delete touching a real (eval=0, or unresolvable) decision row
-- is refused the same way an edit is.
CREATE TRIGGER IF NOT EXISTS approval_audit_no_delete_real
BEFORE DELETE ON approval_audit
WHEN (SELECT eval FROM transmission WHERE id = OLD.transmission_id) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'approval_audit is append-only: no delete on a real (non-eval) decision row');
END;

-- k_check_refs follows k_checks.refs (migrate-040): an insert adds the refs, a change of refs replaces them, a delete
-- removes them, so the checks that name a node are read by the node's id
CREATE TRIGGER IF NOT EXISTS k_checks_refs_insert
AFTER INSERT ON k_checks
BEGIN
  INSERT INTO k_check_refs (project, ref, check_id)
    SELECT NEW.project, value, NEW.id FROM json_each(COALESCE(NEW.refs, '[]')) WHERE type = 'text' ON CONFLICT (project, ref, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_checks_refs_update
AFTER UPDATE OF refs ON k_checks
BEGIN
  DELETE FROM k_check_refs WHERE project = OLD.project AND check_id = OLD.id
    AND ref IN (SELECT value FROM json_each(COALESCE(OLD.refs, '[]')));
  INSERT INTO k_check_refs (project, ref, check_id)
    SELECT NEW.project, value, NEW.id FROM json_each(COALESCE(NEW.refs, '[]')) WHERE type = 'text' ON CONFLICT (project, ref, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_checks_refs_delete
AFTER DELETE ON k_checks
BEGIN
  DELETE FROM k_check_refs WHERE project = OLD.project AND check_id = OLD.id
    AND ref IN (SELECT value FROM json_each(COALESCE(OLD.refs, '[]')));
END;

-- k_check_ungraded holds the checks with no grade yet (migrate-041): a check filed with no grade adds its row, a check
-- removed takes it away, a grade takes it away (check_results is append-only), so `holes` never walks the checks
CREATE TRIGGER IF NOT EXISTS k_checks_ungraded_insert
AFTER INSERT ON k_checks
WHEN NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = NEW.project AND g.check_id = NEW.id)
BEGIN
  INSERT INTO k_check_ungraded (project, check_id) VALUES (NEW.project, NEW.id) ON CONFLICT (project, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_checks_ungraded_delete
AFTER DELETE ON k_checks
BEGIN
  DELETE FROM k_check_ungraded WHERE project = OLD.project AND check_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS check_results_graded
AFTER INSERT ON check_results
BEGIN
  DELETE FROM k_check_ungraded WHERE project = NEW.project AND check_id = NEW.check_id;
END;

-- migrate-042: the tallies (loops_open, transmission_open, transmission_kinds, transmission_goals), kept exact by these twelve
-- triggers
CREATE TRIGGER IF NOT EXISTS loops_open_insert
AFTER INSERT ON loops
BEGIN
  INSERT INTO loops_open (person_id, mind, n)
    SELECT NEW.person_id, CASE WHEN NEW.ref IS NULL OR NEW.ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END , 1 WHERE NEW.status = 'open'
    ON CONFLICT (person_id, mind) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS loops_open_update
AFTER UPDATE OF status, ref, person_id ON loops
BEGIN
  INSERT INTO loops_open (person_id, mind, n)
    SELECT OLD.person_id, CASE WHEN OLD.ref IS NULL OR OLD.ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END , -1 WHERE OLD.status = 'open'
    ON CONFLICT (person_id, mind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO loops_open (person_id, mind, n)
    SELECT NEW.person_id, CASE WHEN NEW.ref IS NULL OR NEW.ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END , 1 WHERE NEW.status = 'open'
    ON CONFLICT (person_id, mind) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS loops_open_delete
AFTER DELETE ON loops
BEGIN
  INSERT INTO loops_open (person_id, mind, n)
    SELECT OLD.person_id, CASE WHEN OLD.ref IS NULL OR OLD.ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END , -1 WHERE OLD.status = 'open'
    ON CONFLICT (person_id, mind) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_open_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , NEW.route, CASE WHEN NEW.via LIKE 'mcp%' OR NEW.via LIKE 'cli%' THEN 1 ELSE 0 END , 1 WHERE NEW.status != 'closed' AND NOT (COALESCE(NEW.kind, '') IN ('knowledge','grade') AND NEW.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_open_update
AFTER UPDATE OF status, route, eval, project, gaprefs, components, via, kind, org ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , OLD.route, CASE WHEN OLD.via LIKE 'mcp%' OR OLD.via LIKE 'cli%' THEN 1 ELSE 0 END , -1 WHERE OLD.status != 'closed' AND NOT (COALESCE(OLD.kind, '') IN ('knowledge','grade') AND OLD.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , NEW.route, CASE WHEN NEW.via LIKE 'mcp%' OR NEW.via LIKE 'cli%' THEN 1 ELSE 0 END , 1 WHERE NEW.status != 'closed' AND NOT (COALESCE(NEW.kind, '') IN ('knowledge','grade') AND NEW.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_open_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , OLD.route, CASE WHEN OLD.via LIKE 'mcp%' OR OLD.via LIKE 'cli%' THEN 1 ELSE 0 END , -1 WHERE OLD.status != 'closed' AND NOT (COALESCE(OLD.kind, '') IN ('knowledge','grade') AND OLD.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_kinds_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , COALESCE(NEW.kind, ''), 1, 1 * (NEW.status != 'closed'),
            1 * (NEW.route = 'owner' AND NEW.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
END;

CREATE TRIGGER IF NOT EXISTS transmission_kinds_update
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

CREATE TRIGGER IF NOT EXISTS transmission_kinds_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_kinds (project, eval, mind, kind, n, n_open, n_owner_undecided)
    VALUES (COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END , COALESCE(OLD.kind, ''), -1, -1 * (OLD.status != 'closed'),
            -1 * (OLD.route = 'owner' AND OLD.decision IS NULL))
    ON CONFLICT (project, eval, mind, kind) DO UPDATE SET n = n + excluded.n, n_open = n_open + excluded.n_open,
      n_owner_undecided = n_owner_undecided + excluded.n_owner_undecided;
END;

CREATE TRIGGER IF NOT EXISTS transmission_goals_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(NEW.project, CASE WHEN NEW.org IS NOT NULL AND NEW.org <> 1 THEN 'o' || NEW.org || char(45, 45) ELSE '' END ), CASE WHEN NEW.eval = 0 AND (NEW.what IS NULL OR (NEW.what NOT LIKE '%eval probe%' AND NEW.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(NEW.happened_at, NEW.created_at), 1, 7), CASE WHEN NEW.goal_ref IS NULL THEN '' ELSE '=' || NEW.goal_ref END , LOWER(NEW.lane), CASE WHEN COALESCE(NEW.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(NEW.kind, '') ELSE '*' END ,
      1, 1 * COALESCE(NEW.outcome, 0), 1 * (NEW.outcome IS NULL), 1 * (NEW.outcome IS NULL AND (NEW.actual IS NULL OR NEW.actual = ''))
    WHERE (NEW.route = 'auto' OR NEW.decision = 'approve') AND CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

CREATE TRIGGER IF NOT EXISTS transmission_goals_update
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

CREATE TRIGGER IF NOT EXISTS transmission_goals_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_goals (project, clean, month, goal_ref, lane, kind, n, s, no_outcome, awaiting)
    SELECT COALESCE(OLD.project, CASE WHEN OLD.org IS NOT NULL AND OLD.org <> 1 THEN 'o' || OLD.org || char(45, 45) ELSE '' END ), CASE WHEN OLD.eval = 0 AND (OLD.what IS NULL OR (OLD.what NOT LIKE '%eval probe%' AND OLD.what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END , substr(COALESCE(OLD.happened_at, OLD.created_at), 1, 7), CASE WHEN OLD.goal_ref IS NULL THEN '' ELSE '=' || OLD.goal_ref END , LOWER(OLD.lane), CASE WHEN COALESCE(OLD.kind, '') IN ('counter','critique','rank','restore','item','publish','equip','knowledge') THEN COALESCE(OLD.kind, '') ELSE '*' END ,
      -1, -1 * COALESCE(OLD.outcome, 0), -1 * (OLD.outcome IS NULL), -1 * (OLD.outcome IS NULL AND (OLD.actual IS NULL OR OLD.actual = ''))
    WHERE (OLD.route = 'auto' OR OLD.decision = 'approve') AND CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END = 0
    ON CONFLICT (project, clean, goal_ref, lane, month, kind) DO UPDATE SET n = n + excluded.n, s = s + excluded.s,
      no_outcome = no_outcome + excluded.no_outcome, awaiting = awaiting + excluded.awaiting;
END;

-- migrate-081: an email's requests by status (a sign-up's prefill), the open requests in the order they came (the place in
-- line), and one open request per email
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email, status, approved_at);

CREATE INDEX IF NOT EXISTS idx_access_requests_line ON access_requests(created_at) WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_open ON access_requests(email) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_approval_audit_decided_by ON approval_audit(decided_by);

CREATE INDEX IF NOT EXISTS idx_approval_audit_tx ON approval_audit(transmission_id);

CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);

CREATE INDEX IF NOT EXISTS idx_artifacts_org_bytes ON artifacts(org, bytes) WHERE bytes >= 0;

CREATE INDEX IF NOT EXISTS idx_artifacts_person ON artifacts(person_id, created_at);

CREATE INDEX IF NOT EXISTS idx_artifacts_project    ON artifacts(project, created_at);

CREATE INDEX IF NOT EXISTS idx_check_results_latest ON check_results(project, check_id, graded_at);

CREATE INDEX IF NOT EXISTS idx_check_results_lookup ON check_results(project, pack_version, check_id);

CREATE INDEX IF NOT EXISTS idx_check_results_recent ON check_results(project, graded_at);

CREATE INDEX IF NOT EXISTS idx_events_audit ON events(created_at) WHERE kind NOT IN ('session_open','exit','fragment','file') AND COALESCE(json_extract(payload_json,'$.mind'),0) != 1 AND COALESCE(json_extract(payload_json,'$.eval'),0) = 0;

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

CREATE INDEX IF NOT EXISTS idx_events_landed ON events(created_at) WHERE +kind IN ('ruling','drift','unknown','fragment');

CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id, created_at);

CREATE INDEX IF NOT EXISTS idx_events_project       ON events(project, created_at);

CREATE INDEX IF NOT EXISTS idx_events_person_kind ON events(person_id, kind, created_at);

CREATE INDEX IF NOT EXISTS idx_events_stamped ON events(kind, stamped);

CREATE INDEX IF NOT EXISTS idx_invites_open ON invites(expires_at) WHERE redeemed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_k_edges_kind ON k_edges(project, kind);

CREATE INDEX IF NOT EXISTS idx_k_edges_to ON k_edges(project, to_id);

CREATE INDEX IF NOT EXISTS idx_k_goals_parent ON k_goals(project, parent);

CREATE INDEX IF NOT EXISTS idx_k_nodes_type ON k_nodes(project, type);

CREATE INDEX IF NOT EXISTS idx_k_questions_status ON k_questions(project, status);

CREATE INDEX IF NOT EXISTS idx_login_account ON login_attempts(account_id, at);

CREATE INDEX IF NOT EXISTS idx_login_email ON login_attempts(email, at);

CREATE INDEX IF NOT EXISTS idx_login_known ON login_attempts(account_id, client, at) WHERE ok = 1 AND client IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loops_person  ON loops(person_id, status);

CREATE INDEX IF NOT EXISTS idx_loops_ref_open ON loops(status, ref) WHERE ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loops_status ON loops(status, person_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_founder ON org(created_by_account) WHERE created_by_account IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_slug ON org(slug);

CREATE INDEX IF NOT EXISTS idx_people_account ON people(account_id, org);

CREATE UNIQUE INDEX IF NOT EXISTS idx_people_account_seat ON people(account_id, org) WHERE active = 1 AND account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_people_active ON people(active, name, id);

CREATE INDEX IF NOT EXISTS idx_people_org_held ON people(org, active, pending) WHERE active + pending >= 1;

CREATE INDEX IF NOT EXISTS idx_people_org_seated ON people(org) WHERE active = 1 AND pending = 0;

CREATE INDEX IF NOT EXISTS idx_people_owner ON people(role, active, created_at);

CREATE INDEX IF NOT EXISTS idx_project_seats_project ON project_seats(project_key);

-- migrate-067: the slug a person types is unique inside its org (and how a slug finds its key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_slug ON projects(org, slug);

-- migrate-079: a seat's open invite links
CREATE INDEX IF NOT EXISTS idx_seat_invites_person ON seat_invites(person_id) WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_open ON signup_codes(email) WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tokens_person ON tokens(person_id, revoked);

CREATE INDEX IF NOT EXISTS idx_tokens_live ON tokens(revoked, created_at);

CREATE INDEX IF NOT EXISTS idx_tokens_person_live ON tokens(person_id, revoked, expires_at);

-- migrate-069 (sprint 6, 6.6): a clientRef files once per person (the door's replay lookup's own scope)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transmission_clientref_once ON transmission(submitter, client_ref);

CREATE INDEX IF NOT EXISTS idx_transmission_decided ON transmission(project, decided_at) WHERE decided_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transmission_eval_created ON transmission(eval, created_at);

CREATE INDEX IF NOT EXISTS idx_transmission_eval_report ON transmission(report) WHERE eval = 1 AND report IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transmission_goal_month ON transmission(project, created_at) WHERE goal_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transmission_goalref ON transmission(goal_ref);

CREATE INDEX IF NOT EXISTS idx_transmission_kind_eval    ON transmission(kind, eval);

CREATE INDEX IF NOT EXISTS idx_transmission_knowledge ON transmission(project, created_at) WHERE kind = 'knowledge';

-- migrate-061: the project's contributions by filing time, never a grade or a knowledge write (src/hotsql.js WEEK_SQL arm A, src/extract.js What changed)
CREATE INDEX IF NOT EXISTS idx_transmission_contrib ON transmission(project, created_at) WHERE COALESCE(kind,'') NOT IN ('grade','knowledge');

CREATE INDEX IF NOT EXISTS idx_transmission_lane ON transmission(project, lower(lane), created_at);

CREATE INDEX IF NOT EXISTS idx_transmission_org_month ON transmission(substr(created_at, 1, 7), org, kind);

CREATE INDEX IF NOT EXISTS idx_transmission_owner_open ON transmission(project, created_at) WHERE route = 'owner' AND status != 'closed';

CREATE INDEX IF NOT EXISTS idx_transmission_parent ON transmission(parent);

CREATE INDEX IF NOT EXISTS idx_transmission_project ON transmission(project, created_at);

CREATE INDEX IF NOT EXISTS idx_transmission_queue ON transmission(route, eval, created_at);

CREATE INDEX IF NOT EXISTS idx_transmission_refs_ref ON transmission_refs(ref);

CREATE INDEX IF NOT EXISTS idx_transmission_refs_tid ON transmission_refs(tid);

CREATE INDEX IF NOT EXISTS idx_transmission_route     ON transmission(route, status);

CREATE INDEX IF NOT EXISTS idx_transmission_submitter ON transmission(submitter, created_at);

-- migrate-047 (the registry, sprint 3 B1): the follow-ups due of one project in date order; partial, no row for a contribution with no date
CREATE INDEX IF NOT EXISTS idx_transmission_next_by ON transmission(project, next_by) WHERE next_by IS NOT NULL;

-- migrate-043 (the Map): a node's light and a node's links, one row per node, kept exact by these nine triggers
CREATE TABLE IF NOT EXISTS k_node_lights (
  project    TEXT NOT NULL,
  node_id    TEXT NOT NULL,             -- a ref a check names: a node id, a goal id or a question id
  green      INTEGER NOT NULL DEFAULT 0, -- checks naming it whose latest grade is proven
  red        INTEGER NOT NULL DEFAULT 0, -- ... refused
  amber      INTEGER NOT NULL DEFAULT 0, -- ... any other verdict (graded, not passing: incomplete)
  grey       INTEGER NOT NULL DEFAULT 0, -- ... with no grade yet
  light      TEXT GENERATED ALWAYS AS (CASE WHEN green + red + amber = 0 THEN 'grey' WHEN red > 0 THEN 'red' WHEN amber = 0 AND grey = 0 THEN 'green' ELSE 'amber' END ) STORED,
  updated_at TEXT NOT NULL DEFAULT '',   -- when the row last changed (ISO, UTC)
  PRIMARY KEY (project, node_id)
);

CREATE TABLE IF NOT EXISTS k_node_links (
  project TEXT NOT NULL,
  node_id TEXT NOT NULL,                -- a k_nodes id with at least one edge out of it
  links   TEXT NOT NULL,                -- its out edges: a JSON array of [to_id, kind]
  PRIMARY KEY (project, node_id)
);

CREATE INDEX IF NOT EXISTS idx_k_check_refs_check ON k_check_refs(project, check_id, ref);

CREATE INDEX IF NOT EXISTS idx_k_node_lights_lit ON k_node_lights(project, node_id) WHERE light <> 'grey';

CREATE INDEX IF NOT EXISTS idx_k_node_lights_at ON k_node_lights(project, updated_at);

CREATE TRIGGER IF NOT EXISTS k_node_lights_ref_insert
AFTER INSERT ON k_check_refs
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT NEW.project, NEW.ref, p.s IS 'proven', p.s IS 'refused', p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused', p.s IS NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT (SELECT x.status FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p WHERE 1
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_ref_delete
AFTER DELETE ON k_check_refs
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT OLD.project, OLD.ref, -(p.s IS 'proven'), -(p.s IS 'refused'), -(p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused'), -(p.s IS NULL), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT (SELECT x.status FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p WHERE 1
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_ref_update
AFTER UPDATE ON k_check_refs
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT OLD.project, OLD.ref, -(p.s IS 'proven'), -(p.s IS 'refused'), -(p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused'), -(p.s IS NULL), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT (SELECT x.status FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p WHERE 1
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT NEW.project, NEW.ref, p.s IS 'proven', p.s IS 'refused', p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused', p.s IS NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT (SELECT x.status FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p WHERE 1
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_grade_insert
AFTER INSERT ON check_results
WHEN NOT EXISTS (SELECT 1 FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id
  AND (x.graded_at > NEW.graded_at OR (x.graded_at = NEW.graded_at AND x.id > NEW.id)))
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT r.project, r.ref, (NEW.status IS 'proven') - (p.s IS 'proven'), (NEW.status IS 'refused') - (p.s IS 'refused'),
      (NEW.status IS NOT 'proven' AND NEW.status IS NOT 'refused') - (p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused'), -(p.s IS NULL),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM k_check_refs r, (SELECT (SELECT x.status FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id
      ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p
    WHERE r.project = NEW.project AND r.check_id = NEW.check_id
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_grade_delete
AFTER DELETE ON check_results
WHEN NOT EXISTS (SELECT 1 FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id
  AND (x.graded_at > OLD.graded_at OR (x.graded_at = OLD.graded_at AND x.id > OLD.id)))
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT r.project, r.ref, (p.s IS 'proven') - (OLD.status IS 'proven'), (p.s IS 'refused') - (OLD.status IS 'refused'),
      (p.s IS NOT NULL AND p.s IS NOT 'proven' AND p.s IS NOT 'refused') - (OLD.status IS NOT 'proven' AND OLD.status IS NOT 'refused'), p.s IS NULL,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM k_check_refs r, (SELECT (SELECT x.status FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id
      ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) AS s) p
    WHERE r.project = OLD.project AND r.check_id = OLD.check_id
    ON CONFLICT (project, node_id) DO UPDATE SET green = green + excluded.green, red = red + excluded.red, amber = amber + excluded.amber,
      grey = grey + excluded.grey, updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_lights_grade_update
AFTER UPDATE OF project, check_id, status, graded_at ON check_results
BEGIN
  INSERT INTO k_node_lights (project, node_id, green, red, amber, grey, updated_at)
    SELECT r.project, r.ref, COALESCE(SUM(g.status IS 'proven'), 0), COALESCE(SUM(g.status IS 'refused'), 0),
      COALESCE(SUM(g.id IS NOT NULL AND g.status IS NOT 'proven' AND g.status IS NOT 'refused'), 0), COALESCE(SUM(g.id IS NULL), 0),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM k_check_refs r LEFT JOIN check_results g ON g.id = (SELECT x.id FROM check_results x WHERE x.project = r.project AND x.check_id = r.check_id
      ORDER BY x.graded_at DESC, x.id DESC LIMIT 1)
    WHERE (r.project, r.ref) IN (SELECT project, ref FROM k_check_refs WHERE (project = OLD.project AND check_id = OLD.check_id) OR (project = NEW.project AND check_id = NEW.check_id))
    GROUP BY r.project, r.ref
    ON CONFLICT (project, node_id) DO UPDATE SET green = excluded.green, red = excluded.red, amber = excluded.amber, grey = excluded.grey,
      updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS k_node_links_insert
AFTER INSERT ON k_edges
BEGIN
  INSERT INTO k_node_links (project, node_id, links) VALUES (NEW.project, NEW.from_id, json_array(json_array(NEW.to_id, NEW.kind)))
    ON CONFLICT (project, node_id) DO UPDATE SET links = json_insert(links, '$[#]', json_array(NEW.to_id, NEW.kind));
END;

CREATE TRIGGER IF NOT EXISTS k_node_links_delete
AFTER DELETE ON k_edges
BEGIN
  DELETE FROM k_node_links WHERE project = OLD.project AND node_id = OLD.from_id
    AND NOT EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.from_id);
  UPDATE k_node_links SET links = (SELECT json_group_array(json_array(e.to_id, e.kind)) FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.from_id)
    WHERE project = OLD.project AND node_id = OLD.from_id;
END;

CREATE TRIGGER IF NOT EXISTS k_node_links_update
AFTER UPDATE OF project, from_id, to_id, kind ON k_edges
BEGIN
  DELETE FROM k_node_links WHERE project = OLD.project AND node_id = OLD.from_id
    AND NOT EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.from_id);
  UPDATE k_node_links SET links = (SELECT json_group_array(json_array(e.to_id, e.kind)) FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.from_id)
    WHERE project = OLD.project AND node_id = OLD.from_id;
  INSERT INTO k_node_links (project, node_id, links)
    SELECT NEW.project, NEW.from_id, json_group_array(json_array(e.to_id, e.kind)) FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.from_id
    ON CONFLICT (project, node_id) DO UPDATE SET links = excluded.links;
END;

-- migrate-046 (screens and renders, ARCHITECTURE §11): the render and style INDEX (bodies are R2 objects, renders/<project>/<sha256>)
CREATE TABLE IF NOT EXISTS k_renders (
  project    TEXT NOT NULL REFERENCES projects(key),
  screen     TEXT NOT NULL,                 -- a k_nodes id of type screen (checked by the write door; removing the node removes its renders)
  state      TEXT NOT NULL DEFAULT '',      -- one of the screen's data.states, or '' (the screen as a whole)
  variant    TEXT NOT NULL DEFAULT '',      -- a take of the frame (live, proposed, wireframe …), or ''
  format     TEXT NOT NULL CHECK (format IN ('html', 'image', 'wireframe')),
  artifact   TEXT,                          -- an image render's banked artifact id (its bytes are copied to the body's key)
  style      TEXT,                          -- an html render's k_styles id
  width      INTEGER,
  height     INTEGER,
  hash       TEXT NOT NULL CHECK (length(hash) = 64),   -- the body's sha256: its R2 key is renders/<project>/<hash>
  bytes      INTEGER NOT NULL,              -- the body's size as stored
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, screen, state, variant)
);

CREATE TABLE IF NOT EXISTS k_styles (
  project    TEXT NOT NULL REFERENCES projects(key),
  id         TEXT NOT NULL,
  hash       TEXT NOT NULL CHECK (length(hash) = 64),   -- the stylesheet's sha256: renders/<project>/<hash>
  bytes      INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES people(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, id)
);

CREATE INDEX IF NOT EXISTS idx_k_renders_hash ON k_renders(project, hash);

CREATE INDEX IF NOT EXISTS idx_k_nodes_screen_surface ON k_nodes(project, json_extract(data, '$.surface')) WHERE type = 'screen';
-- migrate-057 (D1b item 20): the screens that name a LIST of apps, only they
CREATE INDEX IF NOT EXISTS idx_k_nodes_screen_multi ON k_nodes(project) WHERE json_type(data, '$.surface') = 'array';

-- a screen node removed (write_knowledge remove, a restore that replaces it) removes its renders' index rows
CREATE TRIGGER IF NOT EXISTS k_nodes_screen_renders_delete
AFTER DELETE ON k_nodes
WHEN OLD.type = 'screen'
BEGIN
  DELETE FROM k_renders WHERE project = OLD.project AND screen = OLD.id;
END;

-- one row per screen: its renders' index (derived from k_renders by the triggers below)
CREATE TABLE IF NOT EXISTS k_screen_renders (
  project TEXT NOT NULL,
  screen  TEXT NOT NULL,                    -- a k_renders screen with at least one render
  renders TEXT NOT NULL,                    -- [[state, variant, format, hash, bytes, width, height, style], …] in key order
  PRIMARY KEY (project, screen)
);

CREATE TRIGGER IF NOT EXISTS k_screen_renders_insert
AFTER INSERT ON k_renders
BEGIN
  INSERT INTO k_screen_renders (project, screen, renders)
    SELECT NEW.project, NEW.screen, json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
    FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.screen
    ON CONFLICT (project, screen) DO UPDATE SET renders = excluded.renders;
END;

CREATE TRIGGER IF NOT EXISTS k_screen_renders_update
AFTER UPDATE ON k_renders
BEGIN
  DELETE FROM k_screen_renders WHERE project = OLD.project AND screen = OLD.screen
    AND NOT EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.screen);
  UPDATE k_screen_renders SET renders = (SELECT json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
      FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.screen)
    WHERE project = OLD.project AND screen = OLD.screen AND (OLD.project <> NEW.project OR OLD.screen <> NEW.screen);
  INSERT INTO k_screen_renders (project, screen, renders)
    SELECT NEW.project, NEW.screen, json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
    FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.screen
    ON CONFLICT (project, screen) DO UPDATE SET renders = excluded.renders;
END;

CREATE TRIGGER IF NOT EXISTS k_screen_renders_delete
AFTER DELETE ON k_renders
BEGIN
  DELETE FROM k_screen_renders WHERE project = OLD.project AND screen = OLD.screen
    AND NOT EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.screen);
  UPDATE k_screen_renders SET renders = (SELECT json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))
      FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.screen)
    WHERE project = OLD.project AND screen = OLD.screen;
END;

-- migrate-048 (preview, then file, sprint 3 B2): one row per preview, read and written by its primary key only
CREATE TABLE IF NOT EXISTS previews (
  id         TEXT PRIMARY KEY,                       -- P-<16 hex>, random
  project    TEXT NOT NULL REFERENCES projects(key),
  person     TEXT NOT NULL REFERENCES people(id),    -- its author: only they file it
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,                          -- created_at + 1 hour
  filed_at   TEXT,                                   -- set when every ready item landed
  digest     TEXT NOT NULL,                          -- sha256 of the items, canonical JSON
  summary    TEXT NOT NULL CHECK (json_valid(summary)),
  filed      TEXT CHECK (filed IS NULL OR json_valid(filed))
) WITHOUT ROWID;

-- migrate-078: the unfiled previews by when they expire (the cron's prune reads only those, never the whole table)
CREATE INDEX IF NOT EXISTS idx_previews_prune ON previews(expires_at) WHERE filed IS NULL AND filed_at IS NULL;

-- migrate-049 (the day's next contribution id past 999): the day's ids by length, then text; ONE row read for the newest
CREATE INDEX IF NOT EXISTS idx_transmission_day_seq ON transmission(substr(id, 1, 11), length(id), id);

-- migrate-050 (the checklist and its meter, sprint 3 B3): one row per (project, kind: screen · door · gap · check · goal) with the
-- counts the meter reads, kept exact by the triggers below; transmission_open (above) counts no knowledge or grade record routed auto
CREATE TABLE IF NOT EXISTS k_fill (
  project  TEXT NOT NULL,
  kind     TEXT NOT NULL,                 -- screen · door · gap · check · goal
  n        INTEGER NOT NULL DEFAULT 0,    -- how many screens, doors or checks the project holds
  flow     INTEGER NOT NULL DEFAULT 0,    -- screens with data.lane and data.step, or a nav edge to or from them
  pictured INTEGER NOT NULL DEFAULT 0,    -- screens with data.wireframe, or at least one render
  checked  INTEGER NOT NULL DEFAULT 0,    -- screens or doors that a check's refs name
  linked   INTEGER NOT NULL DEFAULT 0,    -- doors with an edge of kind reads or writes out of them
  ungraded INTEGER NOT NULL DEFAULT 0,    -- checks with no grade (no check_results row)
  open     INTEGER NOT NULL DEFAULT 0,    -- gaps whose status is open
  roots    INTEGER NOT NULL DEFAULT 0,    -- goals with no parent
  leaves   INTEGER NOT NULL DEFAULT 0,    -- goals no goal names as its parent
  laned    INTEGER NOT NULL DEFAULT 0,    -- leaf goals naming at least one lane in their dimensions
  PRIMARY KEY (project, kind)
);

CREATE TRIGGER IF NOT EXISTS k_fill_node_insert
AFTER INSERT ON k_nodes
WHEN NEW.type IN ('screen','door','gap')
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, NEW.type, 1, (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.lane') IS NOT NULL AND json_extract(NEW.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = NEW.project AND e.to_id = NEW.id AND e.kind = 'nav')))),
      (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.id))),
      (NEW.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = NEW.project AND c.ref = NEW.id)),
      (NEW.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind IN ('reads','writes'))), 0, (NEW.type = 'gap' AND NEW.status IS 'open')
    WHERE NEW.type IN ('screen','door','gap')
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_node_delete
AFTER DELETE ON k_nodes
WHEN OLD.type IN ('screen','door','gap')
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT OLD.project, OLD.type, -1, -(OLD.type = 'screen' AND ((json_extract(OLD.data, '$.lane') IS NOT NULL AND json_extract(OLD.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = OLD.project AND e.to_id = OLD.id AND e.kind = 'nav')))),
      -(OLD.type = 'screen' AND ((json_extract(OLD.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.id))),
      -(OLD.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = OLD.project AND c.ref = OLD.id)),
      -(OLD.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind IN ('reads','writes'))), 0, -(OLD.type = 'gap' AND OLD.status IS 'open')
    WHERE OLD.type IN ('screen','door','gap')
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_node_update
AFTER UPDATE OF project, id, type, data, status ON k_nodes
WHEN (OLD.type IN ('screen','door','gap') OR NEW.type IN ('screen','door','gap')) AND (OLD.project IS NOT NEW.project OR OLD.id IS NOT NEW.id OR OLD.type IS NOT NEW.type OR OLD.data IS NOT NEW.data OR OLD.status IS NOT NEW.status)
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, NEW.type, 0, d.f, d.p, d.c, d.l, 0, d.o FROM (SELECT (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.lane') IS NOT NULL AND json_extract(NEW.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = NEW.project AND e.to_id = NEW.id AND e.kind = 'nav')))) - (OLD.type = 'screen' AND ((json_extract(OLD.data, '$.lane') IS NOT NULL AND json_extract(OLD.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = OLD.project AND e.to_id = OLD.id AND e.kind = 'nav')))) AS f,
      (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.id))) - (OLD.type = 'screen' AND ((json_extract(OLD.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.id))) AS p,
      (NEW.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = NEW.project AND c.ref = NEW.id)) - (OLD.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = OLD.project AND c.ref = OLD.id)) AS c,
      (NEW.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind IN ('reads','writes'))) - (OLD.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind IN ('reads','writes'))) AS l,
      (NEW.type = 'gap' AND NEW.status IS 'open') - (OLD.type = 'gap' AND OLD.status IS 'open') AS o) d
    WHERE OLD.project IS NEW.project AND OLD.type IS NEW.type AND NEW.type IN ('screen','door','gap') AND (d.f <> 0 OR d.p <> 0 OR d.c <> 0 OR d.l <> 0 OR d.o <> 0)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT OLD.project, OLD.type, -1, -(OLD.type = 'screen' AND ((json_extract(OLD.data, '$.lane') IS NOT NULL AND json_extract(OLD.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = OLD.project AND e.to_id = OLD.id AND e.kind = 'nav')))),
      -(OLD.type = 'screen' AND ((json_extract(OLD.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.id))),
      -(OLD.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = OLD.project AND c.ref = OLD.id)),
      -(OLD.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind IN ('reads','writes'))), 0, -(OLD.type = 'gap' AND OLD.status IS 'open')
    WHERE OLD.type IN ('screen','door','gap') AND NOT (OLD.project IS NEW.project AND OLD.type IS NEW.type)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, NEW.type, 1, (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.lane') IS NOT NULL AND json_extract(NEW.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = NEW.project AND e.to_id = NEW.id AND e.kind = 'nav')))),
      (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.id))),
      (NEW.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = NEW.project AND c.ref = NEW.id)),
      (NEW.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind IN ('reads','writes'))), 0, (NEW.type = 'gap' AND NEW.status IS 'open')
    WHERE NEW.type IN ('screen','door','gap') AND NOT (OLD.project IS NEW.project AND OLD.type IS NEW.type)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_edge_insert
AFTER INSERT ON k_edges
WHEN NEW.kind IN ('nav','reads','writes')
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav' AND NOT (e.to_id = NEW.to_id AND e.from_id = NEW.from_id AND e.kind = NEW.kind AND e.project = NEW.project)) OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav' AND NOT (e.from_id = NEW.from_id AND e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.project = NEW.project)))))), 0, 0, SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes') AND NOT (e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.from_id = NEW.from_id AND e.project = NEW.project)))), 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = NEW.project AND n.id IN (NEW.from_id, NEW.to_id)))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav' AND NOT (e.to_id = NEW.to_id AND e.from_id = NEW.from_id AND e.kind = NEW.kind AND e.project = NEW.project)) OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav' AND NOT (e.from_id = NEW.from_id AND e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.project = NEW.project)))))) <> 0 OR SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes') AND NOT (e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.from_id = NEW.from_id AND e.project = NEW.project)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_edge_delete
AFTER DELETE ON k_edges
WHEN OLD.kind IN ('nav','reads','writes')
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')) OR (OLD.kind = 'nav' AND OLD.project = n.project AND n.id IN (OLD.from_id, OLD.to_id))))), 0, 0, SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes')) OR (OLD.kind IN ('reads','writes') AND OLD.project = n.project AND OLD.from_id = n.id)))), 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id IN (OLD.from_id, OLD.to_id)))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')) OR (OLD.kind = 'nav' AND OLD.project = n.project AND n.id IN (OLD.from_id, OLD.to_id))))) <> 0 OR SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes')) OR (OLD.kind IN ('reads','writes') AND OLD.project = n.project AND OLD.from_id = n.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_edge_update
AFTER UPDATE OF project, from_id, to_id, kind ON k_edges
WHEN OLD.project IS NOT NEW.project OR OLD.from_id IS NOT NEW.from_id OR OLD.to_id IS NOT NEW.to_id OR OLD.kind IS NOT NEW.kind
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav' AND NOT (e.to_id = NEW.to_id AND e.from_id = NEW.from_id AND e.kind = NEW.kind AND e.project = NEW.project)) OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav' AND NOT (e.from_id = NEW.from_id AND e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.project = NEW.project))) OR (OLD.kind = 'nav' AND OLD.project = n.project AND n.id IN (OLD.from_id, OLD.to_id))))), 0, 0, SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes') AND NOT (e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.from_id = NEW.from_id AND e.project = NEW.project)) OR (OLD.kind IN ('reads','writes') AND OLD.project = n.project AND OLD.from_id = n.id)))), 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id IN (OLD.from_id, OLD.to_id)) OR (n.project = NEW.project AND n.id IN (NEW.from_id, NEW.to_id)))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav' AND NOT (e.to_id = NEW.to_id AND e.from_id = NEW.from_id AND e.kind = NEW.kind AND e.project = NEW.project)) OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav' AND NOT (e.from_id = NEW.from_id AND e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.project = NEW.project))) OR (OLD.kind = 'nav' AND OLD.project = n.project AND n.id IN (OLD.from_id, OLD.to_id))))) <> 0 OR SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes') AND NOT (e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.from_id = NEW.from_id AND e.project = NEW.project)) OR (OLD.kind IN ('reads','writes') AND OLD.project = n.project AND OLD.from_id = n.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_render_insert
AFTER INSERT ON k_renders
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id AND NOT (r.state = NEW.state AND r.variant = NEW.variant AND r.screen = NEW.screen AND r.project = NEW.project))))), 0, 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = NEW.project AND n.id = NEW.screen))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id AND NOT (r.state = NEW.state AND r.variant = NEW.variant AND r.screen = NEW.screen AND r.project = NEW.project))))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_render_delete
AFTER DELETE ON k_renders
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id) OR (OLD.project = n.project AND OLD.screen = n.id)))), 0, 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id = OLD.screen))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id) OR (OLD.project = n.project AND OLD.screen = n.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_render_update
AFTER UPDATE OF project, screen, state, variant ON k_renders
WHEN OLD.project IS NOT NEW.project OR OLD.screen IS NOT NEW.screen OR OLD.state IS NOT NEW.state OR OLD.variant IS NOT NEW.variant
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id AND NOT (r.state = NEW.state AND r.variant = NEW.variant AND r.screen = NEW.screen AND r.project = NEW.project)) OR (OLD.project = n.project AND OLD.screen = n.id)))), 0, 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id = OLD.screen) OR (n.project = NEW.project AND n.id = NEW.screen))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id AND NOT (r.state = NEW.state AND r.variant = NEW.variant AND r.screen = NEW.screen AND r.project = NEW.project)) OR (OLD.project = n.project AND OLD.screen = n.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_ref_insert
AFTER INSERT ON k_check_refs
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, 0, SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id AND NOT (c.check_id = NEW.check_id AND c.ref = NEW.ref AND c.project = NEW.project))), 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = NEW.project AND n.id = NEW.ref))
    GROUP BY n.project, n.type HAVING SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id AND NOT (c.check_id = NEW.check_id AND c.ref = NEW.ref AND c.project = NEW.project))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_ref_delete
AFTER DELETE ON k_check_refs
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, 0, SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - (EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) OR (OLD.project = n.project AND OLD.ref = n.id))), 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id = OLD.ref))
    GROUP BY n.project, n.type HAVING SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - (EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) OR (OLD.project = n.project AND OLD.ref = n.id))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_ref_update
AFTER UPDATE ON k_check_refs
WHEN OLD.project IS NOT NEW.project OR OLD.ref IS NOT NEW.ref OR OLD.check_id IS NOT NEW.check_id
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, 0, SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - (EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id AND NOT (c.check_id = NEW.check_id AND c.ref = NEW.ref AND c.project = NEW.project)) OR (OLD.project = n.project AND OLD.ref = n.id))), 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id = OLD.ref) OR (n.project = NEW.project AND n.id = NEW.ref))
    GROUP BY n.project, n.type HAVING SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - (EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id AND NOT (c.check_id = NEW.check_id AND c.ref = NEW.ref AND c.project = NEW.project)) OR (OLD.project = n.project AND OLD.ref = n.id))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_check_insert
AFTER INSERT ON k_checks
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, 'check', 1, 0, 0, 0, 0, (NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = NEW.project AND g.check_id = NEW.id)), 0 WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_check_delete
AFTER DELETE ON k_checks
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT OLD.project, 'check', -1, 0, 0, 0, 0, -(NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = OLD.project AND g.check_id = OLD.id)), 0 WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_check_update
AFTER UPDATE OF project, id ON k_checks
WHEN OLD.project IS NOT NEW.project OR OLD.id IS NOT NEW.id
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT OLD.project, 'check', -1, 0, 0, 0, 0, -(NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = OLD.project AND g.check_id = OLD.id)), 0 WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, 'check', 1, 0, 0, 0, 0, (NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = NEW.project AND g.check_id = NEW.id)), 0 WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_grade_insert
AFTER INSERT ON check_results
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT c.project, 'check', 0, 0, 0, 0, 0, SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id AND g.id <> NEW.id)))), 0
    FROM k_checks c WHERE (c.project = NEW.project AND c.id = NEW.check_id)
    GROUP BY c.project HAVING SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id AND g.id <> NEW.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_grade_delete
AFTER DELETE ON check_results
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT c.project, 'check', 0, 0, 0, 0, 0, SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id) OR (OLD.project = c.project AND OLD.check_id = c.id)))), 0
    FROM k_checks c WHERE (c.project = OLD.project AND c.id = OLD.check_id)
    GROUP BY c.project HAVING SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id) OR (OLD.project = c.project AND OLD.check_id = c.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_grade_update
AFTER UPDATE OF project, check_id ON check_results
WHEN OLD.project IS NOT NEW.project OR OLD.check_id IS NOT NEW.check_id
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT c.project, 'check', 0, 0, 0, 0, 0, SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id AND g.id <> NEW.id) OR (OLD.project = c.project AND OLD.check_id = c.id)))), 0
    FROM k_checks c WHERE (c.project = OLD.project AND c.id = OLD.check_id) OR (c.project = NEW.project AND c.id = NEW.check_id)
    GROUP BY c.project HAVING SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id AND g.id <> NEW.id) OR (OLD.project = c.project AND OLD.check_id = c.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_goal_insert
AFTER INSERT ON k_goals
BEGIN
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT NEW.project, 'goal', 1, (NEW.parent IS NULL), (NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)), ((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)) AND (json_array_length(NEW.dimensions) > 0)) WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT p.project, 'goal', 0, 0, SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)))))), SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project))))) * (json_array_length(p.dimensions) > 0))
    FROM k_goals p WHERE (p.project = NEW.project AND p.id = NEW.parent) AND p.id <> NEW.id
    GROUP BY p.project HAVING SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)))))) <> 0 OR SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project))))) * (json_array_length(p.dimensions) > 0)) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_goal_delete
AFTER DELETE ON k_goals
BEGIN
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT OLD.project, 'goal', -1, -(OLD.parent IS NULL), -(NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id) OR OLD.parent IS OLD.id)), -((NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id) OR OLD.parent IS OLD.id)) AND (json_array_length(OLD.dimensions) > 0)) WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT p.project, 'goal', 0, 0, SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id) OR (OLD.project IS p.project AND OLD.parent IS p.id))))), SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id) OR (OLD.project IS p.project AND OLD.parent IS p.id)))) * (json_array_length(p.dimensions) > 0))
    FROM k_goals p WHERE (p.project = OLD.project AND p.id = OLD.parent)
    GROUP BY p.project HAVING SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id) OR (OLD.project IS p.project AND OLD.parent IS p.id))))) <> 0 OR SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id) OR (OLD.project IS p.project AND OLD.parent IS p.id)))) * (json_array_length(p.dimensions) > 0)) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_goal_update
AFTER UPDATE OF project, id, parent, dimensions ON k_goals
WHEN OLD.project IS NOT NEW.project OR OLD.id IS NOT NEW.id OR OLD.parent IS NOT NEW.parent OR OLD.dimensions IS NOT NEW.dimensions
BEGIN
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT NEW.project, 'goal', 0, d.r, d.l, d.n FROM (SELECT (NEW.parent IS NULL) - (OLD.parent IS NULL) AS r,
      (NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR OLD.parent IS OLD.id)) AS l,
      ((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)) AND (json_array_length(NEW.dimensions) > 0)) - ((NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR OLD.parent IS OLD.id)) AND (json_array_length(OLD.dimensions) > 0)) AS n) d
    WHERE OLD.project IS NEW.project AND (d.r <> 0 OR d.l <> 0 OR d.n <> 0)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT OLD.project, 'goal', -1, -(OLD.parent IS NULL), -(NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR OLD.parent IS OLD.id)), -((NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR OLD.parent IS OLD.id)) AND (json_array_length(OLD.dimensions) > 0)) WHERE 1 AND NOT (OLD.project IS NEW.project)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT NEW.project, 'goal', 1, (NEW.parent IS NULL), (NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)), ((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)) AND (json_array_length(NEW.dimensions) > 0)) WHERE 1 AND NOT (OLD.project IS NEW.project)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT p.project, 'goal', 0, 0, SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR (OLD.project IS p.project AND OLD.parent IS p.id))))), SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR (OLD.project IS p.project AND OLD.parent IS p.id)))) * (json_array_length(p.dimensions) > 0))
    FROM k_goals p WHERE ((p.project = OLD.project AND p.id = OLD.parent) OR (p.project = NEW.project AND p.id = NEW.parent)) AND p.id <> NEW.id
    GROUP BY p.project HAVING SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR (OLD.project IS p.project AND OLD.parent IS p.id))))) <> 0 OR SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR (OLD.project IS p.project AND OLD.parent IS p.id)))) * (json_array_length(p.dimensions) > 0)) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
END;

-- migrate-053.sql: the pick-up's two indexes and its trigger
CREATE INDEX IF NOT EXISTS idx_transmission_followups ON transmission(project, next_due) WHERE next_due IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transmission_handoffs ON transmission(project, next_picked_at) WHERE next_picked_by IS NOT NULL AND next_picked_by <> submitter;

CREATE TRIGGER IF NOT EXISTS transmission_next_done
AFTER INSERT ON transmission
WHEN NEW.parent IS NOT NULL AND COALESCE(NEW.kind, '') NOT IN ('counter','critique','rank','knowledge','grade')
BEGIN
  UPDATE transmission SET next_done_at = NEW.created_at, next_done_by = NEW.id, next_due = NULL
    WHERE id = NEW.parent AND next_done_at IS NULL AND json_extract(shape, '$.next.what') IS NOT NULL AND (NEW.eval = 0 OR eval = 1);
END;

-- migrate-054.sql: stale proof by change (two tables, four indexes, twelve triggers)
CREATE TABLE IF NOT EXISTS k_node_stale (
  project    TEXT NOT NULL,
  node_id    TEXT NOT NULL,              -- a k_nodes id (a screen, a door, any node a check names) that changed while graded
  changed_at TEXT NOT NULL,              -- the last such change (ISO, UTC)
  changed_by TEXT,                       -- the contribution that changed it (T-…), NULL for a knowledge write
  stale      INTEGER NOT NULL DEFAULT 0, -- checks naming it whose latest grade is older than changed_at
  updated_at TEXT NOT NULL,              -- when this row last moved (the lights poll)
  PRIMARY KEY (project, node_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS k_check_stale (
  project  TEXT NOT NULL,
  check_id TEXT NOT NULL,                -- a k_checks id whose latest grade is older than a change of a node it names
  PRIMARY KEY (project, check_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_k_node_stale_on ON k_node_stale(project, node_id) WHERE stale > 0;

CREATE INDEX IF NOT EXISTS idx_k_node_stale_at ON k_node_stale(project, updated_at);

CREATE INDEX IF NOT EXISTS idx_k_cards_as_of ON k_cards(project, as_of) WHERE as_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_k_docs_as_of ON k_docs(project, as_of) WHERE as_of IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS k_stale_grade_insert
AFTER INSERT ON check_results
WHEN NOT EXISTS (SELECT 1 FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id
  AND (x.graded_at > NEW.graded_at OR (x.graded_at = NEW.graded_at AND x.id > NEW.id)))
  AND EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id)
BEGIN
  UPDATE k_node_stale SET stale = stale + (COALESCE(NEW.graded_at < changed_at, 0) - COALESCE((SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at, 0)), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE project = NEW.project AND node_id IN (SELECT r.ref FROM k_check_refs r WHERE r.project = NEW.project AND r.check_id = NEW.check_id)
      AND COALESCE(NEW.graded_at < changed_at, 0) <> COALESCE((SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id AND x.id <> NEW.id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at, 0);
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_grade_delete
AFTER DELETE ON check_results
WHEN NOT EXISTS (SELECT 1 FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id
  AND (x.graded_at > OLD.graded_at OR (x.graded_at = OLD.graded_at AND x.id > OLD.id)))
  AND EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id)
BEGIN
  UPDATE k_node_stale SET stale = stale + (COALESCE((SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at, 0) - COALESCE(OLD.graded_at < changed_at, 0)), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE project = OLD.project AND node_id IN (SELECT r.ref FROM k_check_refs r WHERE r.project = OLD.project AND r.check_id = OLD.check_id)
      AND COALESCE((SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at, 0) <> COALESCE(OLD.graded_at < changed_at, 0);
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_grade_update
AFTER UPDATE OF project, check_id, graded_at ON check_results
BEGIN
  UPDATE k_node_stale SET stale = (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = k_node_stale.project AND cr.ref = k_node_stale.node_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = cr.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < k_node_stale.changed_at), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE (project, node_id) IN (SELECT r.project, r.ref FROM k_check_refs r WHERE (r.project = OLD.project AND r.check_id = OLD.check_id) OR (r.project = NEW.project AND r.check_id = NEW.check_id))
      AND stale <> (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = k_node_stale.project AND cr.ref = k_node_stale.node_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = cr.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < k_node_stale.changed_at);
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_ref_insert
AFTER INSERT ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = NEW.project AND s.node_id = NEW.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = NEW.project AND node_id = NEW.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_ref_delete
AFTER DELETE ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = OLD.project AND s.node_id = OLD.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale - 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = OLD.project AND node_id = OLD.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_ref_update
AFTER UPDATE ON k_check_refs
WHEN EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = OLD.project AND s.node_id = OLD.ref) OR EXISTS (SELECT 1 FROM k_node_stale s WHERE s.project = NEW.project AND s.node_id = NEW.ref)
BEGIN
  UPDATE k_node_stale SET stale = stale - 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = OLD.project AND node_id = OLD.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  UPDATE k_node_stale SET stale = stale + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE project = NEW.project AND node_id = NEW.ref AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < changed_at;
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = OLD.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = OLD.project AND check_id = OLD.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT OLD.project, OLD.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = OLD.project AND r.check_id = OLD.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = OLD.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT (EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at)) - (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = NEW.check_id)) AS n) d WHERE d.n <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  DELETE FROM k_check_stale WHERE project = NEW.project AND check_id = NEW.check_id AND NOT EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at);
  INSERT INTO k_check_stale (project, check_id) SELECT NEW.project, NEW.check_id WHERE EXISTS (SELECT 1 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE r.project = NEW.project AND r.check_id = NEW.check_id AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = NEW.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at) ON CONFLICT (project, check_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_node_insert
AFTER INSERT ON k_nodes
WHEN EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = NEW.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT NEW.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_node_update
AFTER UPDATE OF type, name, status, data ON k_nodes
WHEN (OLD.type IS NOT NEW.type OR OLD.name IS NOT NEW.name OR OLD.status IS NOT NEW.status OR OLD.data IS NOT NEW.data)
  AND EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = NEW.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT NEW.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT NEW.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_node_delete
AFTER DELETE ON k_nodes
WHEN EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = OLD.project AND l.node_id = OLD.id AND l.green + l.red + l.amber > 0)
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT OLD.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref IN (SELECT OLD.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = OLD.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO k_check_stale (project, check_id)
    SELECT DISTINCT OLD.project, cr.check_id FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref IN (SELECT OLD.id AS value) AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT OLD.project, j.value, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = OLD.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = OLD.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT OLD.id AS value) j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = OLD.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

CREATE TRIGGER IF NOT EXISTS k_stale_contribution
AFTER INSERT ON transmission
WHEN LOWER(NEW.lane) IN ('code','design') AND NEW.project IS NOT NULL
  AND (NEW.eval = 0 OR EXISTS (SELECT 1 FROM projects ep WHERE ep.key = NEW.project AND ep.eval = 1))
  AND (COALESCE(NEW.touches, '') <> '' OR COALESCE(NEW.components, '') <> '' OR COALESCE(NEW.screens, '') <> '')
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at ON CONFLICT (project, check_id) DO NOTHING;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, NEW.created_at, NEW.id, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;

-- migrate-056.sql (sprint 3, B5): search's index, kept by triggers (src/extract.js reads it)
CREATE VIRTUAL TABLE IF NOT EXISTS k_find USING fts5(p, title, body, content='', columnsize=0, tokenize='unicode61 remove_diacritics 2');

-- goals (1)
CREATE TRIGGER IF NOT EXISTS k_find_goal_ai AFTER INSERT ON k_goals BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.note, ''), 1, 600);
END;
CREATE TRIGGER IF NOT EXISTS k_find_goal_au AFTER UPDATE OF title, note ON k_goals BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id || ' ' || substr(COALESCE(OLD.note, ''), 1, 600);
  INSERT INTO k_find (rowid, p, title, body) SELECT 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.note, ''), 1, 600);
END;
CREATE TRIGGER IF NOT EXISTS k_find_goal_ad AFTER DELETE ON k_goals BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id || ' ' || substr(COALESCE(OLD.note, ''), 1, 600);
END;

-- questions (2)
CREATE TRIGGER IF NOT EXISTS k_find_question_ai AFTER INSERT ON k_questions BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 2 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.question, NEW.qid || ' ' || COALESCE(NEW.label, '') || ' ' || substr(COALESCE(NEW.why, ''), 1, 600) || ' ' || substr(COALESCE(NEW.rationale, ''), 1, 400);
END;
CREATE TRIGGER IF NOT EXISTS k_find_question_au AFTER UPDATE OF question, label, why, rationale ON k_questions BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 2 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.question, OLD.qid || ' ' || COALESCE(OLD.label, '') || ' ' || substr(COALESCE(OLD.why, ''), 1, 600) || ' ' || substr(COALESCE(OLD.rationale, ''), 1, 400);
  INSERT INTO k_find (rowid, p, title, body) SELECT 2 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.question, NEW.qid || ' ' || COALESCE(NEW.label, '') || ' ' || substr(COALESCE(NEW.why, ''), 1, 600) || ' ' || substr(COALESCE(NEW.rationale, ''), 1, 400);
END;
CREATE TRIGGER IF NOT EXISTS k_find_question_ad AFTER DELETE ON k_questions BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 2 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.question, OLD.qid || ' ' || COALESCE(OLD.label, '') || ' ' || substr(COALESCE(OLD.why, ''), 1, 600) || ' ' || substr(COALESCE(OLD.rationale, ''), 1, 400);
END;

-- checks (3)
CREATE TRIGGER IF NOT EXISTS k_find_check_ai AFTER INSERT ON k_checks BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 3 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.then_, ''), 1, 300);
END;
CREATE TRIGGER IF NOT EXISTS k_find_check_au AFTER UPDATE OF title, then_ ON k_checks BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 3 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id || ' ' || substr(COALESCE(OLD.then_, ''), 1, 300);
  INSERT INTO k_find (rowid, p, title, body) SELECT 3 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.then_, ''), 1, 300);
END;
CREATE TRIGGER IF NOT EXISTS k_find_check_ad AFTER DELETE ON k_checks BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 3 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id || ' ' || substr(COALESCE(OLD.then_, ''), 1, 300);
END;

-- cards (4)
CREATE TRIGGER IF NOT EXISTS k_find_card_ai AFTER INSERT ON k_cards BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 4 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.name, NEW.kind || ' ' || NEW.id || ' ' || substr(COALESCE(NEW.body_md, ''), 1, 1500);
END;
CREATE TRIGGER IF NOT EXISTS k_find_card_au AFTER UPDATE OF name, body_md ON k_cards BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 4 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.name, OLD.kind || ' ' || OLD.id || ' ' || substr(COALESCE(OLD.body_md, ''), 1, 1500);
  INSERT INTO k_find (rowid, p, title, body) SELECT 4 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.name, NEW.kind || ' ' || NEW.id || ' ' || substr(COALESCE(NEW.body_md, ''), 1, 1500);
END;
CREATE TRIGGER IF NOT EXISTS k_find_card_ad AFTER DELETE ON k_cards BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 4 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.name, OLD.kind || ' ' || OLD.id || ' ' || substr(COALESCE(OLD.body_md, ''), 1, 1500);
END;

-- docs (5)
CREATE TRIGGER IF NOT EXISTS k_find_doc_ai AFTER INSERT ON k_docs BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 5 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), COALESCE(NEW.title, NEW.path), NEW.path || ' ' || substr(COALESCE(NEW.body_md, ''), 1, 1500);
END;
CREATE TRIGGER IF NOT EXISTS k_find_doc_au AFTER UPDATE OF title, body_md ON k_docs BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 5 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), COALESCE(OLD.title, OLD.path), OLD.path || ' ' || substr(COALESCE(OLD.body_md, ''), 1, 1500);
  INSERT INTO k_find (rowid, p, title, body) SELECT 5 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), COALESCE(NEW.title, NEW.path), NEW.path || ' ' || substr(COALESCE(NEW.body_md, ''), 1, 1500);
END;
CREATE TRIGGER IF NOT EXISTS k_find_doc_ad AFTER DELETE ON k_docs BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 5 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), COALESCE(OLD.title, OLD.path), OLD.path || ' ' || substr(COALESCE(OLD.body_md, ''), 1, 1500);
END;

-- map nodes (6)
CREATE TRIGGER IF NOT EXISTS k_find_node_ai AFTER INSERT ON k_nodes BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 6 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.name, NEW.type || ' ' || NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS k_find_node_au AFTER UPDATE OF name, type ON k_nodes BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 6 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.name, OLD.type || ' ' || OLD.id;
  INSERT INTO k_find (rowid, p, title, body) SELECT 6 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.name, NEW.type || ' ' || NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS k_find_node_ad AFTER DELETE ON k_nodes BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 6 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.name, OLD.type || ' ' || OLD.id;
END;

-- contributions (7): a project's own, not eval-marked, not mind/*, not a bookkeeping kind; an update deletes what the OLD row
-- indexed (if it was) and adds what the NEW row indexes (if it does)
CREATE TRIGGER IF NOT EXISTS k_find_tx_ai AFTER INSERT ON transmission BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 7 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), COALESCE(NEW.what, NEW.id), NEW.id || ' ' || NEW.lane || ' ' || COALESCE(NEW.kind, '') || ' ' || replace(COALESCE(NEW.touches, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.screens, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.components, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(NEW.why, ''), 1, 600) WHERE NEW.project IS NOT NULL AND NEW.eval = 0 AND lower(COALESCE(NEW.kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%');
END;
CREATE TRIGGER IF NOT EXISTS k_find_tx_au AFTER UPDATE OF what, why, eval, kind, lane, project, touches, screens, components, gaprefs ON transmission BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 7 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), COALESCE(OLD.what, OLD.id), OLD.id || ' ' || OLD.lane || ' ' || COALESCE(OLD.kind, '') || ' ' || replace(COALESCE(OLD.touches, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.screens, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.components, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(OLD.why, ''), 1, 600) WHERE OLD.project IS NOT NULL AND OLD.eval = 0 AND lower(COALESCE(OLD.kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%');
  INSERT INTO k_find (rowid, p, title, body) SELECT 7 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), COALESCE(NEW.what, NEW.id), NEW.id || ' ' || NEW.lane || ' ' || COALESCE(NEW.kind, '') || ' ' || replace(COALESCE(NEW.touches, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.screens, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.components, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(NEW.why, ''), 1, 600) WHERE NEW.project IS NOT NULL AND NEW.eval = 0 AND lower(COALESCE(NEW.kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%');
END;
CREATE TRIGGER IF NOT EXISTS k_find_tx_ad AFTER DELETE ON transmission BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 7 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), COALESCE(OLD.what, OLD.id), OLD.id || ' ' || OLD.lane || ' ' || COALESCE(OLD.kind, '') || ' ' || replace(COALESCE(OLD.touches, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.screens, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.components, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(OLD.why, ''), 1, 600) WHERE OLD.project IS NOT NULL AND OLD.eval = 0 AND lower(COALESCE(OLD.kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%');
END;

-- migrate-065.sql (sprint 4, M6): a screen's takes, one row per body a frame has held (the newest is its k_renders row), kept by
-- two triggers on k_renders; the inspector's strip and the body route read it
CREATE TABLE IF NOT EXISTS k_screen_takes (
  project  TEXT NOT NULL REFERENCES projects(key),
  screen   TEXT NOT NULL,                  -- the render's screen (a k_nodes id of type screen when it was filed)
  state    TEXT NOT NULL DEFAULT '',
  variant  TEXT NOT NULL DEFAULT '',
  format   TEXT NOT NULL CHECK (format IN ('html', 'image', 'wireframe')),
  take     INTEGER NOT NULL CHECK (take >= 1),   -- 1, 2, 3 … per (project, screen, state, variant, format)
  hash     TEXT NOT NULL CHECK (length(hash) = 64),   -- the body's sha256: its R2 key is renders/<project>/<hash>
  bytes    INTEGER NOT NULL,
  width    INTEGER,
  height   INTEGER,
  style    TEXT,                           -- an html take's k_styles id, as it was filed
  filed_at TEXT NOT NULL,
  filed_by TEXT NOT NULL REFERENCES people(id),
  PRIMARY KEY (project, screen, state, variant, format, take)
);

CREATE INDEX IF NOT EXISTS idx_k_screen_takes_screen ON k_screen_takes(project, screen, filed_at);
CREATE INDEX IF NOT EXISTS idx_k_screen_takes_hash ON k_screen_takes(project, hash);

CREATE TRIGGER IF NOT EXISTS k_screen_takes_insert
AFTER INSERT ON k_renders
BEGIN
  INSERT INTO k_screen_takes (project, screen, state, variant, format, take, hash, bytes, width, height, style, filed_at, filed_by)
    SELECT NEW.project, NEW.screen, NEW.state, NEW.variant, NEW.format,
      COALESCE((SELECT MAX(t.take) FROM k_screen_takes t WHERE t.project = NEW.project AND t.screen = NEW.screen AND t.state = NEW.state AND t.variant = NEW.variant AND t.format = NEW.format), 0) + 1,
      NEW.hash, NEW.bytes, NEW.width, NEW.height, NEW.style, NEW.updated_at, NEW.updated_by
    WHERE NOT EXISTS (SELECT 1 FROM (SELECT t.hash, t.format FROM k_screen_takes t WHERE t.project = NEW.project AND t.screen = NEW.screen AND t.state = NEW.state AND t.variant = NEW.variant
      ORDER BY t.rowid DESC LIMIT 1) z WHERE z.hash = NEW.hash AND z.format = NEW.format);
END;

CREATE TRIGGER IF NOT EXISTS k_screen_takes_update
AFTER UPDATE OF project, screen, state, variant, format, hash ON k_renders
BEGIN
  INSERT INTO k_screen_takes (project, screen, state, variant, format, take, hash, bytes, width, height, style, filed_at, filed_by)
    SELECT NEW.project, NEW.screen, NEW.state, NEW.variant, NEW.format,
      COALESCE((SELECT MAX(t.take) FROM k_screen_takes t WHERE t.project = NEW.project AND t.screen = NEW.screen AND t.state = NEW.state AND t.variant = NEW.variant AND t.format = NEW.format), 0) + 1,
      NEW.hash, NEW.bytes, NEW.width, NEW.height, NEW.style, NEW.updated_at, NEW.updated_by
    WHERE NOT EXISTS (SELECT 1 FROM (SELECT t.hash, t.format FROM k_screen_takes t WHERE t.project = NEW.project AND t.screen = NEW.screen AND t.state = NEW.state AND t.variant = NEW.variant
      ORDER BY t.rowid DESC LIMIT 1) z WHERE z.hash = NEW.hash AND z.format = NEW.format);
END;

-- migrate-068.sql (sprint 6, 6.1): a row of the nine org-wide tables written without its org is refused, loudly
CREATE TRIGGER IF NOT EXISTS people_org_required
BEFORE INSERT ON people
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new people row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS tokens_org_required
BEFORE INSERT ON tokens
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new tokens row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS invites_org_required
BEFORE INSERT ON invites
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new invites row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS events_org_required
BEFORE INSERT ON events
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new events row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS artifacts_org_required
BEFORE INSERT ON artifacts
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new artifacts row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS loops_org_required
BEFORE INSERT ON loops
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new loops row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS approval_audit_org_required
BEFORE INSERT ON approval_audit
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new approval_audit row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS login_attempts_org_required
BEFORE INSERT ON login_attempts
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new login_attempts row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

CREATE TRIGGER IF NOT EXISTS transmission_org_required
BEFORE INSERT ON transmission
WHEN NEW.org IS NULL
BEGIN
  SELECT RAISE(ABORT, 'org_required: a new transmission row carries its org (sprint 6: a write that forgets it is refused, never filed into org 1)');
END;

-- migrate-070.sql (sprint 7, 7.1): a seat joins its email's account (made with no passphrase); a seat's email is set once
CREATE TRIGGER IF NOT EXISTS people_account_attach
AFTER INSERT ON people
WHEN NEW.email IS NOT NULL AND trim(NEW.email) <> ''
BEGIN
  SELECT RAISE(ABORT, 'account_seat_taken: that email already holds an active seat in this org (one account, one seat per org)')
    WHERE NEW.active = 1 AND EXISTS (SELECT 1 FROM accounts a JOIN people o ON o.account_id = a.id
      WHERE a.email = lower(trim(NEW.email)) AND o.org IS NEW.org AND o.active = 1 AND o.id <> NEW.id);
  INSERT INTO accounts (id, email, created_at, updated_at) VALUES (lower(hex(randomblob(16))), lower(trim(NEW.email)), NEW.created_at, NEW.created_at)
    ON CONFLICT (email) DO NOTHING;
  UPDATE people SET account_id = (SELECT a.id FROM accounts a WHERE a.email = lower(trim(NEW.email))) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS people_account_late
AFTER UPDATE OF email ON people
WHEN (OLD.email IS NULL OR trim(OLD.email) = '') AND NEW.email IS NOT NULL AND trim(NEW.email) <> ''
BEGIN
  SELECT RAISE(ABORT, 'account_seat_taken: that email already holds an active seat in this org (one account, one seat per org)')
    WHERE NEW.active = 1 AND EXISTS (SELECT 1 FROM accounts a JOIN people o ON o.account_id = a.id
      WHERE a.email = lower(trim(NEW.email)) AND o.org IS NEW.org AND o.active = 1 AND o.id <> NEW.id);
  INSERT INTO accounts (id, email, created_at, updated_at) VALUES (lower(hex(randomblob(16))), lower(trim(NEW.email)), NEW.created_at, NEW.created_at)
    ON CONFLICT (email) DO NOTHING;
  UPDATE people SET account_id = (SELECT a.id FROM accounts a WHERE a.email = lower(trim(NEW.email))) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS people_email_fixed
BEFORE UPDATE OF email ON people
WHEN OLD.email IS NOT NULL AND trim(OLD.email) <> '' AND NEW.email IS NOT OLD.email
BEGIN
  SELECT RAISE(ABORT, 'account_email: a seat keeps the email of its account (migrate-070): add a seat for the other email');
END;

-- migrate-072: an org's default path name, derived from its name (the operator's tools, the seeds, a restore name none)
CREATE TRIGGER IF NOT EXISTS org_slug_on_insert
AFTER INSERT ON org
WHEN NEW.slug IS NULL
BEGIN
  UPDATE org SET slug = (
    SELECT CASE
      WHEN (NEW.id = 1 OR json_extract(NEW.settings, '$.suites') = 1) AND NOT EXISTS (SELECT 1 FROM org o WHERE o.slug = s.b)
        AND s.b NOT IN ('about', 'account', 'accounts', 'admin', 'api', 'app', 'artifact', 'artifacts', 'ask', 'assets', 'audit',
        'auth', 'authorize', 'backfill', 'backup-dump', 'billing', 'blog', 'brief', 'broadcast', 'build',
        'callback', 'capabilities', 'changes', 'contract', 'contribution', 'control', 'dashboard', 'decisions',
        'doc', 'docs', 'file', 'fonts', 'formats', 'goals', 'grade', 'gtm', 'health', 'help', 'home', 'impact',
        'install', 'legal', 'library', 'log', 'login', 'logout', 'map', 'mcp', 'missing', 'new', 'oauth',
        'open-items', 'operator', 'org', 'orgs', 'platform', 'preview', 'pricing', 'privacy', 'profile',
        'project', 'projects', 'public', 'question', 'questions', 'rank', 'read', 'register', 'regrade',
        'render', 'request-access', 'respond', 'round', 'search', 'security', 'settings', 'sharingu', 'signin', 'signout',
        'signup', 'static', 'status', 'storage', 'support', 'terms', 'token', 'updates', 'versions', 'view',
        'whoami', 'wrap-up', 'www') THEN s.b
      WHEN NOT EXISTS (SELECT 1 FROM org o WHERE o.slug = s.b || '-' || NEW.id) THEN s.b || '-' || NEW.id
      ELSE s.b || '-' || NEW.id || '-' || lower(hex(randomblob(3)))
    END
    FROM (SELECT CASE WHEN length(r.b) >= 2 AND r.b NOT GLOB '*[^a-z0-9-]*' AND r.b NOT GLOB '*[-][-]*' THEN r.b ELSE 'org' END AS b
          FROM (SELECT rtrim(substr(trim(replace(replace(replace(replace(replace(replace(replace(lower(trim(NEW.name)), ' ', '-'), '_', '-'), '.', '-'), '/', '-'),
            char(45, 45), char(45)), char(45, 45), char(45)), char(45, 45), char(45)), '-'), 1, 24), '-') AS b) r) s
  ) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS org_slug_on_update
AFTER UPDATE ON org
WHEN NEW.slug IS NULL
BEGIN
  UPDATE org SET slug = (
    SELECT CASE
      WHEN (NEW.id = 1 OR json_extract(NEW.settings, '$.suites') = 1) AND NOT EXISTS (SELECT 1 FROM org o WHERE o.slug = s.b)
        AND s.b NOT IN ('about', 'account', 'accounts', 'admin', 'api', 'app', 'artifact', 'artifacts', 'ask', 'assets', 'audit',
        'auth', 'authorize', 'backfill', 'backup-dump', 'billing', 'blog', 'brief', 'broadcast', 'build',
        'callback', 'capabilities', 'changes', 'contract', 'contribution', 'control', 'dashboard', 'decisions',
        'doc', 'docs', 'file', 'fonts', 'formats', 'goals', 'grade', 'gtm', 'health', 'help', 'home', 'impact',
        'install', 'legal', 'library', 'log', 'login', 'logout', 'map', 'mcp', 'missing', 'new', 'oauth',
        'open-items', 'operator', 'org', 'orgs', 'platform', 'preview', 'pricing', 'privacy', 'profile',
        'project', 'projects', 'public', 'question', 'questions', 'rank', 'read', 'register', 'regrade',
        'render', 'request-access', 'respond', 'round', 'search', 'security', 'settings', 'sharingu', 'signin', 'signout',
        'signup', 'static', 'status', 'storage', 'support', 'terms', 'token', 'updates', 'versions', 'view',
        'whoami', 'wrap-up', 'www') THEN s.b
      WHEN NOT EXISTS (SELECT 1 FROM org o WHERE o.slug = s.b || '-' || NEW.id) THEN s.b || '-' || NEW.id
      ELSE s.b || '-' || NEW.id || '-' || lower(hex(randomblob(3)))
    END
    FROM (SELECT CASE WHEN length(r.b) >= 2 AND r.b NOT GLOB '*[^a-z0-9-]*' AND r.b NOT GLOB '*[-][-]*' THEN r.b ELSE 'org' END AS b
          FROM (SELECT rtrim(substr(trim(replace(replace(replace(replace(replace(replace(replace(lower(trim(NEW.name)), ' ', '-'), '_', '-'), '.', '-'), '/', '-'),
            char(45, 45), char(45)), char(45, 45), char(45)), char(45, 45), char(45)), '-'), 1, 24), '-') AS b) r) s
  ) WHERE id = NEW.id;
END;

-- migrate-078: the refs each question's affects names (the Map's inspector reads the questions naming a node by its id)
-- 2 · k_question_refs: the refs each question's `affects` names (one row per question and ref), so the questions that name a
--     node are read by the node's id (src/mapnode.js, the Map's inspector: it read the project's every question to find them).
--     Kept by the database as k_check_refs follows k_checks (migrate-040): an insert adds the refs, a change of affects replaces
--     them, a delete removes them. Only the text values of an ARRAY count (the inspector's own rule: Array.isArray(affects)).
--     WITHOUT ROWID: its primary key is the row (one row written a ref).
CREATE TABLE IF NOT EXISTS k_question_refs (
  project TEXT NOT NULL REFERENCES projects(key),
  ref     TEXT NOT NULL,             -- a node, goal or question id the question names (one text element of k_questions.affects)
  qid     TEXT NOT NULL,             -- the k_questions qid
  PRIMARY KEY (project, ref, qid)
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS k_questions_refs_insert
AFTER INSERT ON k_questions
BEGIN
  INSERT INTO k_question_refs (project, ref, qid)
    SELECT NEW.project, value, NEW.qid FROM json_each(iif(json_type(NEW.affects) = 'array', NEW.affects, '[]')) WHERE type = 'text' ON CONFLICT (project, ref, qid) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_questions_refs_update
AFTER UPDATE OF affects ON k_questions
BEGIN
  DELETE FROM k_question_refs WHERE project = OLD.project AND qid = OLD.qid
    AND ref IN (SELECT value FROM json_each(iif(json_type(OLD.affects) = 'array', OLD.affects, '[]')));
  INSERT INTO k_question_refs (project, ref, qid)
    SELECT NEW.project, value, NEW.qid FROM json_each(iif(json_type(NEW.affects) = 'array', NEW.affects, '[]')) WHERE type = 'text' ON CONFLICT (project, ref, qid) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_questions_refs_delete
AFTER DELETE ON k_questions
BEGIN
  DELETE FROM k_question_refs WHERE project = OLD.project AND qid = OLD.qid
    AND ref IN (SELECT value FROM json_each(iif(json_type(OLD.affects) = 'array', OLD.affects, '[]')));
END;
