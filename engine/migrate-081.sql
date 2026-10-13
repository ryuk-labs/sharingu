-- migrate-081.sql — request access (sprint 21, slice 21.1; docs/plan/SPRINTS.md 21.1; the owner's MCQs of 2026-10-13: request
-- access is a worker page writing D1, with a profile; the site's waitlist button links to it, its Telegram-only form retires).
-- EXPAND ONLY (PLATFORM §5): one table and two indexes added, and migrate-072's two slug triggers re-created with one more reserved
-- name; nothing renamed, no column or table dropped; the old code names none of it.
--   1 · access_requests: ONE person's request for a place in the beta, before any account or org (a PLATFORM row: no org, as
--       signup_codes). The profile as the person typed it, normalised at the door (src/requestaccess.js readRequest): name, email
--       (lower-cased and trimmed, as accounts.email), company, role and team_size required; website, linkedin, x and github (each
--       an http(s) address the door built), ai_tools and use_case optional. Its status: open (in line), approved (the operator's
--       allow, slice 21.2: approved_at) or declined. Its private page's link: only the HASH is kept (token_hash: sha256 of a
--       domain tag and the token, src/requestaccess.js requestTokenHash; the token itself rides the person's link
--       /request-access/<token> and is stored nowhere), so slice 21.2's "you're in line" page needs no new migration. THE FIRST
--       REQUEST STANDS (the owner's ruling, 2026-10-13): a repeat for an email whose request is open changes nothing.
--   2 · idx_access_requests_open: at most ONE open request per email (the door's one insert does nothing on it: the repeat).
--   3 · idx_access_requests_line: the open requests in the order they came (slice 21.2's place in line: one range count on it).
--   4 · THE RESERVED NAME: /request-access is a new first segment of the door's routes, so it is a name the platform uses
--       (src/orgnames.js reservedNames). migrate-072's two default-slug triggers (org_slug_on_insert, org_slug_on_update) hold
--       that list written out (SQL cannot derive it); they are dropped and re-created here, word for word but for
--       'request-access' added in its order (92 names), so a self-hosted org 1 or a suites' org named "Request access" falls to
--       its base-<id>. tools/orgs-selftest.mjs O10 holds the newest migration's list and boot.sql's EQUAL to the derivation.
--       THE SHIP'S PREFLIGHT, read-only, before this file: node tools/check-org-names.mjs --slugs <the slugs SELECT slug FROM org
--       answers>: an org that already holds request-access (POST /orgs did not refuse the name before this code) would be
--       shadowed by the route, and the check fails loudly on it.
-- WHO WRITES IT: the worker's POST /request-access (src/requestaccess.js fileRequest, public: no session); the operator's
-- `allow --request` (slice 21.2). Nothing reads accounts beside it: an email that holds an account files a request as any other.
-- WRITE COST on live: nothing (an empty table and its indexes; the triggers fire only on an org insert or an update to a NULL slug).
-- ORDER: BEFORE the code (the new code's POST /request-access writes it; the old code names neither the table nor the indexes).
-- WRANGLER'S SPLITTER (engine/CLAUDE.md scars): the triggers as migrate-072 wrote them (no quoted two dashes, no "END)").
-- Re-runnable: IF NOT EXISTS, and each trigger dropped IF EXISTS before it is made again — a replay changes nothing.
-- THE UNDO: the code's rollback alone (the old code reads nothing of it); the table can stay, or be dropped with
-- DROP TABLE access_requests (a Time Travel bookmark first) once no request is wanted; the triggers' longer list harms no old
-- code (one more name an operator's org 1 or suites' org never takes plain).

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_open ON access_requests(email) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_access_requests_line ON access_requests(created_at) WHERE status = 'open';

-- 4 · the default slug's reserved names, one more (migrate-072's two triggers, re-created)
DROP TRIGGER IF EXISTS org_slug_on_insert;
DROP TRIGGER IF EXISTS org_slug_on_update;

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
