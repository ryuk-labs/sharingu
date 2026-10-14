-- migrate-081.sql — request access, the account flow and the data (sprint 21, slices 21.1, 21.4a and 21.4b; docs/plan/SPRINTS.md 21.1,
-- 21.4; the owner's MCQs of 2026-10-13 and 2026-10-14: request access is a worker page writing D1, with a profile and a passphrase;
-- ONE verification email; sign in with the passphrase; a reset link; every email under one cap; the data collection "approved as
-- shown"). UNSHIPPED until sprint 21's ship: edited in place.
-- EXPAND ONLY (PLATFORM §5): six tables and their indexes added, and migrate-072's two slug triggers re-created with one more
-- reserved name; nothing renamed, no column or table dropped; the old code names none of it.
--   1 · access_requests: ONE person's request for a place in the beta (a PLATFORM row: no org, as signup_codes). The profile as the
--       person typed it, normalised at the door (src/requestaccess.js readRequest): name, email (lower-cased and trimmed, as
--       accounts.email), company, role and team_size required; website, linkedin, x and github (each an http(s) address the door
--       built), ai_tools and use_case optional. Its status: UNVERIFIED (just filed: it holds no place), open (its email verified: in
--       line, by verified_at), approved (the operator's allow --request: approved_at) or declined. While unverified it holds the
--       passphrase the person chose, as its pbkdf2 hash and salt (pass_hash, pass_salt: the account it PREPARES — no account row
--       exists until the email is verified, so no sign-in, seat consent or org creation ever reads an unverified passphrase), and its
--       verification link's hash (verify_hash: sha256 of a domain tag and the link's token, src/requestaccess.js verifyTokenHash; the
--       token rides only the email) until verify_expires (24 h after the link was sent: a resend sends a new link and moves it). The
--       verification (src/accounts.js verifyJoin, one batch) clears all three, sets verified_at and status open, and makes the
--       account with that passphrase. An unverified request past verify_expires is deleted by the next request filed (the cleanup
--       on write, src/requestaccess.js fileRequest; idx_access_requests_unverified), and is never read as live before that.
--       THE DATA (21.4b): source, which page sent the person (src/requestaccess.js sourceOf: site, showcase or direct — a ?from= tag
--       on the link, never a cookie); the CONSENT the join gave, each box's answer (consent_terms and consent_keep are required, so
--       a filed request holds 1 in both; consent_updates and consent_call optional) with the words' version (consent_version:
--       src/requestaccess.js CONSENT_VERSION, the day the words were set) and its time (consent_at); THE PATH, each written by the door
--       that makes it — account_id and account_at (the account the verification made or joined: src/accounts.js verifyJoin), org_id
--       and org_at (the org the person founded: src/orgs.js createOrg, in the batch that makes it), declined_at (the operator's
--       decline: tools/operator.mjs, the operator page); cleared_at (THE 90-DAY CLEARING, src/cron.js: a declined request 90 days after
--       its decline, an approved one that founded no org 90 days after its approval — the profile emptied, the counts kept:
--       src/requestaccess.js CLEAR_FIELDS says which fields go and which stay).
--   2 · idx_access_requests_verified: at most ONE verified request per email, whatever its status (THE FIRST VERIFIED REQUEST
--       STANDS, the owner's ruling of 2026-10-14; a verified email holds an account, and a later join for it gets the "you already
--       have an account" email instead). Unverified ones are many (each a join, each its own link and passphrase): the per-address
--       email limit holds them to three a day.
--   3 · idx_access_requests_line: the open requests in the order their emails were VERIFIED (the place in line: one range count).
--   3b · idx_access_requests_email: an email's requests by status (an approved request's prefill of the org form; the newest
--       unverified one of a sign-in or a resend; one SEARCH on (email, status)).
--   3c · idx_access_requests_verify: the verification link's one read, by its hash (unique while it is set).
--   3d · idx_access_requests_unverified: the unverified requests by their end (the cleanup's range).
--   3e · idx_access_requests_people: the requests by status in line order (the operator page's one page of people, a keyset range).
--   3f · idx_access_requests_declined, idx_access_requests_abandoned: the requests the 90-day clearing may take, each by the day its
--       90 days count from (the cron's bounded range: a declined one by declined_at, an approved one with no org by approved_at).
--   4 · THE RESERVED NAME: /request-access is a new first segment of the door's routes, so it is a name the platform uses
--       (src/orgnames.js reservedNames; /account, the flow's other pages, is one of the platform's fixed words already).
--       migrate-072's two default-slug triggers (org_slug_on_insert, org_slug_on_update) hold that list written out (SQL cannot
--       derive it); they are dropped and re-created here, word for word but for 'request-access' added in its order (92 names), so
--       a self-hosted org 1 or a suites' org named "Request access" falls to its base-<id>. tools/orgs-selftest.mjs O10 holds the
--       newest migration's list and boot.sql's EQUAL to the derivation. THE SHIP'S PREFLIGHT, read-only, before this file: node
--       tools/check-org-names.mjs --slugs <the slugs SELECT slug FROM org answers>: an org that already holds request-access (POST
--       /orgs did not refuse the name before this code) would be shadowed by the route, and the check fails loudly on it.
--   5 · account_sessions: a browser session of an ACCOUNT that holds no seat yet (a verified person in line, or approved and
--       before their org): the same cookie as an org session (__Host-ar_session), its token's hash only, its own table, so NO
--       reader of tokens (an org's address, /mcp, a bearer, the OAuth form) can ever find it — it reaches only the root's account
--       pages (src/index.js /account, /orgs/new's prefill) and sign-out (src/accounts.js accountSessionOf). Revoked by sign-out
--       and by a reset; idx_account_sessions_account ends every one of an account at once.
--   6 · account_resets: a forgotten passphrase's single-use link (POST /account/forgot): its token's hash, its account, 30 minutes
--       (expires_at), its spend (used_at); idx_account_resets_account ends an account's other open links with the one used.
--   7 · mail_days: THE CAP (the owner, 2026-10-14: stay inside Cloudflare Email Service's 3,000 a month): the worker's and the
--       operator's counted sends per UTC day (n), read as the last 31 days' sum before each counted send and taken only while it is
--       under 2,900 (src/email.js MAIL_DAY_TAKE_SQL: one conditional upsert), and whether the owner was told today that the cap was
--       reached (alerted: once a day).
--   8 · mail_addresses: the per-address limit (three counted emails a day to one address): the day, a digest of the address (never
--       the address: src/email.js addressDigest), its count and the nonce of the send that took it last; yesterday's rows are deleted
--       by the next counted send.
--   9 · org_profile: THE PRODUCT STEP (21.4b), one row per org (its id: an ORG's row, exported and deleted with it, src/backup.js):
--       what the org will build, as the founder answered the org form — product and line (required), stage (one of four), kinds,
--       ais and places (JSON arrays of the form's values), first_want and people (one value each, or none). Written ONLY in the batch
--       that creates the org (src/orgs.js createOrg, {org} the founding id); read by its founder's org nowhere yet and by the
--       operator page (src/operatorread.js: org 1's admins). The values are src/orgprofile.js PRODUCT_CHOICES' keys.
-- WHO WRITES IT: the worker's public doors (POST /request-access, /account/verify, /account/resend, /account/forgot,
-- /account/reset: src/requestaccess.js, src/accounts.js, src/email.js), POST /orgs (the org's profile and its request's link), the
-- operator page's Approve and Decline (org 1's admins: src/operatorread.js), the cron's clearing (src/cron.js) and the operator's
-- allow --request and decline --request (tools/operator.mjs: the approval and its one "You're in" email, through the same cap).
-- WRITE COST on live: nothing (six empty tables and their indexes; the triggers fire only on an org insert or an update to a NULL slug).
-- ORDER: BEFORE the code (the new code writes these tables; the old code names none of them).
-- WRANGLER'S SPLITTER (engine/CLAUDE.md scars): the triggers as migrate-072 wrote them (no quoted two dashes, no "END)").
-- Re-runnable: IF NOT EXISTS, and each trigger dropped IF EXISTS before it is made again — a replay changes nothing.
-- THE UNDO: the code's rollback alone (the old code reads nothing of it); the tables can stay, or be dropped (a Time Travel bookmark
-- first) once no request, session or count is wanted; the triggers' longer list harms no old code (one more name an operator's
-- org 1 or suites' org never takes plain).

CREATE TABLE IF NOT EXISTS access_requests (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL CHECK (email = lower(trim(email)) AND email <> ''),
  name           TEXT NOT NULL,
  company        TEXT NOT NULL,
  role           TEXT NOT NULL,
  team_size      TEXT NOT NULL,
  website        TEXT,
  linkedin       TEXT,
  x              TEXT,
  github         TEXT,
  ai_tools       TEXT,
  use_case       TEXT,
  status         TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'open', 'approved', 'declined')),
  pass_hash      TEXT,
  pass_salt      TEXT,
  verify_hash    TEXT,
  verify_expires TEXT,
  verified_at    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  approved_at    TEXT,
  source          TEXT NOT NULL DEFAULT 'direct',
  consent_version TEXT,
  consent_at      TEXT,
  consent_terms   INTEGER NOT NULL DEFAULT 0,
  consent_keep    INTEGER NOT NULL DEFAULT 0,
  consent_updates INTEGER NOT NULL DEFAULT 0,
  consent_call    INTEGER NOT NULL DEFAULT 0,
  account_id      TEXT,
  account_at      TEXT,
  org_id          INTEGER,
  org_at          TEXT,
  declined_at     TEXT,
  cleared_at      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_verified ON access_requests(email) WHERE status <> 'unverified';

CREATE INDEX IF NOT EXISTS idx_access_requests_line ON access_requests(verified_at) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email, status, approved_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_verify ON access_requests(verify_hash) WHERE verify_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_access_requests_unverified ON access_requests(verify_expires) WHERE status = 'unverified';

CREATE INDEX IF NOT EXISTS idx_access_requests_people ON access_requests(status, verified_at, id);

CREATE INDEX IF NOT EXISTS idx_access_requests_declined ON access_requests(declined_at) WHERE status = 'declined' AND cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_access_requests_abandoned ON access_requests(approved_at) WHERE status = 'approved' AND org_id IS NULL AND cleared_at IS NULL;

-- 5 · an account's browser session before its first seat
CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device     TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions(account_id);

-- 6 · a forgotten passphrase's single-use link
CREATE TABLE IF NOT EXISTS account_resets (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_resets_account ON account_resets(account_id);

-- 7 · the cap: counted sends per UTC day, and the owner's one alert a day
CREATE TABLE IF NOT EXISTS mail_days (
  day     TEXT PRIMARY KEY,
  n       INTEGER NOT NULL DEFAULT 0,
  alerted INTEGER NOT NULL DEFAULT 0
);

-- 8 · the per-address limit: counted sends to one address (its digest) per UTC day
CREATE TABLE IF NOT EXISTS mail_addresses (
  day     TEXT NOT NULL,
  address TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  nonce   TEXT,
  PRIMARY KEY (day, address)
);

-- 9 · the product step: what an org will build, answered on the org form (one row per org, written with the org)
CREATE TABLE IF NOT EXISTS org_profile (
  org        INTEGER PRIMARY KEY,
  product    TEXT NOT NULL,
  line       TEXT NOT NULL,
  stage      TEXT NOT NULL CHECK (stage IN ('idea', 'building', 'launched', 'scaling')),
  kinds      TEXT NOT NULL DEFAULT '[]',
  ais        TEXT NOT NULL DEFAULT '[]',
  places     TEXT NOT NULL DEFAULT '[]',
  first_want TEXT,
  people     TEXT,
  created_at TEXT NOT NULL
);

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
