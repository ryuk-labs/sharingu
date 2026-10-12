-- migrate-072.sql — an org's path name and its founder (sprint 7, slice 7.3; docs/plan/PLATFORM.md §2 items 6, 8 and 9: each
-- org at agent.ryuklabs.io/<org>, an org's name never a name the platform uses; §4 sprint 8's free tier: an account creates
-- ONE org).
-- EXPAND ONLY (PLATFORM §5): two columns, two indexes and two triggers added, nothing renamed, nothing dropped; the old code
-- names none of them and runs on it unchanged.
--   1 · org.slug: the org's PATH NAME (its address, agent.ryuklabs.io/<slug>, slice 7.4): a-z, 0-9 and single dashes, 2 to 40
--       characters, never opening or closing on a dash (the CHECK below), unique (idx_org_slug). A name the platform uses is
--       never one: that list is DERIVED from the door's own routes in code (src/orgnames.js reservedNames over src/index.js
--       CAPABILITIES, plus the platform's fixed words), never kept here; tools/check-org-names.mjs (a gate step) proves every
--       route's first segment is reserved, and its --slugs mode checks the slugs a database holds (THE SHIP'S PREFLIGHT, below).
--   2 · org.created_by_account: the ACCOUNT that created the org through the door (POST /orgs, src/orgs.js), NULL for an org the
--       operator made (every org before this file, the suites' org, a restore); idx_org_founder holds it to ONE org per account
--       (the owner's ruled free tier, PLATFORM §4 sprint 8: "Orgs a person creates: 1"), so two concurrent creations by one
--       account cannot both land. No foreign key: the column records who founded the org, read only by the creation's limit.
--   3 · THE DEFAULT SLUG, for every writer that names none (the operator's tools, the seeds, a restore, the old code): the
--       triggers org_slug_on_insert / org_slug_on_update derive it from the org's name, the same rule for both:
--         base   lower-cased, spaces, underscores, dots and slashes made dashes, runs of dashes made one, trimmed of dashes,
--                at most 24 characters; a name that leaves anything else (or under 2 characters) is 'org'
--         plain  the base itself, ONLY for org 1 and the suites' org (settings.suites), only while no org holds it, and only
--                when it is NOT a name the platform uses (sprint 7's review, D3: a self-hosted org 1 named "Support", "Home" or
--                "Docs" would otherwise take an address the router never serves as an org's) — else it falls to base-<id>.
--                The list in the WHEN below is the reserved names of the path-name form (src/orgnames.js reservedNames over
--                CAPABILITIES, 91 of its 96: the rest hold a dot, which no base can), written out because SQL cannot derive it;
--                tools/orgs-selftest.mjs proves it EQUAL to the derivation (red when a route is added), so a migration that
--                adds a route's first segment re-creates these two triggers with the new list
--         else   base-<id> (unique by its id, and never a route's name: no reserved name ends in a dash and digits, the
--                reserved-names check asserts it), else base-<id>-<6 hex> when even that is held
--       On live this gives org 1 ('Ryuklabs') ryuklabs and the suites' org ('Suites') suites; any other org <name>-<id>.
--       The update trigger also re-derives a slug a writer clears to NULL (a slug is never lost).
--   4 · THE BACKFILL: a no-op UPDATE of every org without a slug fires the update trigger, one org at a time in id order.
-- THE SHIP'S PREFLIGHT, read-only, right before this file: SELECT id, name, settings FROM org — then, after it, node
-- tools/check-org-names.mjs --slugs <the slugs SELECT slug FROM org answers> (each valid, none reserved).
-- WRITE COST on live: one org row updated per org (two at the sprint-6 ship), and the two indexes over them.
-- ORDER: BEFORE the code (the new code's POST /orgs writes and reads both columns; the old code names neither, and an org row
-- it or the operator's tools insert takes its slug from the trigger).
-- WRANGLER'S SPLITTER (engine/CLAUDE.md scars): no quoted two dashes (char(45, 45) instead, the GLOB class [-][-]), and every
-- CASE closes "END )", never "END)".
-- Re-runnable: on a database that already holds this file the first ALTER fails (duplicate column name: the file is skipped
-- whole), as migrate-070's replay is.
-- THE UNDO: the code's rollback alone (the old code reads neither column). The triggers can be lifted with DROP TRIGGER
-- org_slug_on_insert, org_slug_on_update (a Time Travel bookmark first); the columns and the indexes stay (nothing old reads them).

-- 1 · 2 · the columns
ALTER TABLE org ADD COLUMN slug TEXT CHECK (slug IS NULL OR (length(slug) BETWEEN 2 AND 40 AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '*[-][-]*' AND slug NOT GLOB '[-]*' AND slug NOT GLOB '*[-]'));
ALTER TABLE org ADD COLUMN created_by_account TEXT;

-- 3 · the default slug (the one derivation, written twice: SQLite has no shared expression)
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
        'render', 'respond', 'round', 'search', 'security', 'settings', 'sharingu', 'signin', 'signout',
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
        'render', 'respond', 'round', 'search', 'security', 'settings', 'sharingu', 'signin', 'signout',
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

-- 4 · the backfill: every org without a slug, through the update trigger, in id order (org 1 first)
UPDATE org SET updated_at = updated_at WHERE slug IS NULL;

-- 1 · 2 · the indexes (after the backfill: every slug is unique by the trigger's own rule)
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_slug ON org(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_founder ON org(created_by_account) WHERE created_by_account IS NOT NULL;
