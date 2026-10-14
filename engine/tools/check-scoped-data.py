#!/usr/bin/env python3
"""check-scoped-data.py — gate step (sprint 6, 6.2; docs/plan/PLATFORM.md §2 item 3: one scoped data layer).

One database holds many orgs. Every statement the worker runs goes through ONE layer, src/data.js, which writes the
reader's org (from the sign-in alone: a key, a session, an OAuth grant) into the statements that name it ({org},
{orgbucket}). This check fails any statement written outside the layer, and any door that would let the org come from
somewhere else. Purely local: it reads engine/src (comments dropped, strings kept apart from code) and nothing else.

Rules (each failure names its file, line and rule):
  binding   no `.DB` (the raw D1 binding) and no `{ DB }` destructuring outside the layer's own files (ALLOW_BINDING)
  statement every `.prepare(` / `.batch(` is called on a layer handle: `db(<env>)` or `addressDb(<env>)`, never on a
            binding, a variable or anything else (outside ALLOW_BINDING)
  org-door  the functions that SET the org (signIn, signInEnv, platformEnv, installOrgSlot) and the two handles that
            read it otherwise (addressDb: the org the address serves before a sign-in; orgCache: the isolate caches) are
            called only from the files ORG_DOORS names, each for the reason given there
  subselect no statement derives the org from a people row by id (6.1's `(SELECT org FROM people WHERE id = ?n)`): the
            layer binds the reader's org itself, and no insert pays the extra read
  insert    every INSERT or REPLACE into one of the nine org-wide tables (migrate-067) names the org through the layer
            ({org}), except the two sign-in attempt counters ALLOW_INSERT names
  scope     (the sprint-6 review, finding 4) EVERY statement — SELECT, UPDATE, DELETE, INSERT, REPLACE — whose text names one
            of the nine org-wide tables or `projects` carries {org}/{orgbucket}, or is bounded by the door's project (a
            `project = ?` / `project IN (SELECT value FROM json_each(?))` filter after WHERE/AND/ON, people not its subject:
            src/project.js resolves that key inside the reader's org), or sits on ALLOW_SCOPE with its reason. An ALLOW_SCOPE
            entry no statement matches is itself a miss (a stale entry is a hole)
  people-join a people row joined on a column the DOOR does not stamp (DOOR_SET: the filer, the decider, the picker, the
            author) carries `<alias>.org = {org}` in its ON clause: an id a caller typed (next.who) never names another
            org's person (the review's findings 2 and 3, the id -> name oracle), or sits on ALLOW_JOIN with its reason (the
            browser's session under an org's address, sprint 7, 7.4: no one is signed in yet)
  unseen    a statement whose SQL text the checker cannot reach is a miss: name it with a constant or a local it reads
  account   (sprint 7, 7.1; PLATFORM §2 item 8: one account per email) every statement naming `accounts` lives in ACCOUNT_FILES
            (src/accounts.js): an account is no org's row, so the one module that reads or writes it is the one place its
            authority is argued (an admin never sets an account's passphrase; a seat's credential never reaches another org)
  signup    (sprint 7, 7.2; PLATFORM §2 items 6 and 10: only the operator allows an email) every statement naming
            `signup_codes` lives in SIGNUP_FILES (src/accounts.js: the sign-up reads an email's open code and spends it), and NO
            text anywhere in src inserts into it or deletes from it (strings included, a statement prepared or not): a code is
            minted, re-minted and revoked only with the deployment's credentials, from the operator's machine
            (tools/operator.mjs), so no route of the worker, for any seat of any org, can allow an email
  invite    (sprint 12, 12.3; src/accounts.js THE INVITE LINK) every statement naming `seat_invites` lives in INVITE_FILES
            (src/admin.js: an org's admin mints a link for a seat of their own org; src/accounts.js: POST /signup spends one), and
            NO text anywhere in src inserts into it outside src/admin.js, nor there without {org}: a link is always the minting
            admin's own org's, so no route of any seat makes a link for another org's seat
  orgrow    (sprint 7, 7.3; PLATFORM §2 items 6 and 9: creating an org is a write through the door) NO text anywhere in src writes
            the `org` table (INSERT, REPLACE, UPDATE or DELETE; strings included, a statement prepared or not) outside ORG_FILES
            (src/orgs.js: POST /orgs, the one batch that makes an org, its owner seat and its first project on foundingEnv), so
            the creation is the ONLY path that inserts an org row from a request, and no route of any seat edits another org's row
  storage  (sprint 6, 6.4; PLATFORM §2 item 5: storage carries the org) no `.BRAIN` (the raw R2 binding), no `{ BRAIN }`
            destructuring and no `["BRAIN"]` outside ALLOW_STORAGE; no R2 key spelled outside src/storage.js — a string, template
            or regex literal opening with one of the three roots (inbox/, renders/, backups/) or an org prefix (o<n>/, o${…}/):
            every object lies under its org's prefix, and src/storage.js is the one place that builds a key
How a statement's text is found (and its limits, said plainly). For each `db(…).prepare(<arg>)` the checker takes <arg>'s
source and follows every name it uses as a callee or an operand (not a call's value arguments, unless an UPPER_SNAKE
constant) to that name's definition: a constant or builder anywhere in src (UPPER_SNAKE, or exported), a local in the same
file (the nearest definition before the use, a for-of loop variable included), recursively, each name once. A definition
that RUNS a statement (.prepare/.batch/.all/.first/.run, await) is never followed. A wrapper whose parameter is the
statement (`const del = async (sql, …) => db(env).prepare(sql)…`) is read at each of its calls in the file. Limits: a
statement that picks between several texts (`a ? X_SQL : Y_SQL`, an object of statements) is judged as their union, so one
carrying {org} covers the others; a table named by a computed string (backup's `${quoteId(t.table)}`) is not seen as a
table; a token added at run time to a value argument (/audit's clauses list) is not seen (ALLOW_SCOPE says so); and the
door's-project form trusts that the bound key came from src/project.js — the attack suite (tools/attack-xorg.mjs) is the
proof of that, not this check.
Exit 0 clean; exit 1 with every miss listed. --src <dir> checks another copy of src (the selftest's mutations).
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
if "--src" in sys.argv:
    SRC = os.path.abspath(sys.argv[sys.argv.index("--src") + 1])

# ---- the allowlist: the only places that hold the raw binding, and why ----
ALLOW_BINDING = {
    "data.js": "the layer itself: the one module that prepares a statement on the binding",
    "timing.js": "the worker's entry wraps the RAW binding in its timing proxy (Server-Timing, d1-rows) before any statement",
}
# the only places that hold the raw R2 binding, and why (the storage rule)
ALLOW_STORAGE = {
    "storage.js": "the storage keys themselves: the one module that reads or writes an object, under its org's prefix",
    "timing.js": "the worker's entry wraps the RAW bucket in its timing proxy (Server-Timing r2-get/r2-put) before any read",
}
# generated files: data, never code that runs a statement
SKIP = {
    "doorcontract.js": "GENERATED by tools/make-door-contract.py: the door's contract text (it quotes route docs)",
    "archclientdata.js": "GENERATED by tools/make-arch-client.mjs: the Architecture view's client bundle",
    "fontdata.js": "GENERATED by tools/make-fonts.mjs: the self-hosted faces' bytes",
    "frontassetdata.js": "GENERATED by tools/make-front-assets.mjs: the front door's pictures' bytes",
}
# the functions that set or read the org other than through db(env), and the files that may call each
ORG_DOORS = {
    "signIn": {"core.js": "the sign-in: authenticate, resolveReadOnly and resolveReader's OAuth path hand it the people row the credential found"},
    "signInEnv": {"accounts.js": "POST /login's session (src/accounts.js mintSession): the seat whose secret was just checked, whatever the ambient cookie says"},
    "platformEnv": {"cron.js": "the cron (runCron, from workerHandler.scheduled): the deployment, one org at a time, never a caller's request"},
    "foundingEnv": {"orgs.js": "POST /orgs (createOrg): the org the request is CREATING, in the one batch whose first statement inserts that org's row with {org} as its id (an existing id fails the whole batch)"},
    "storeOfRow": {"index.js": "GET /artifact/:id: a file read by its exact id, under its row's org, after mayReadArtifact admitted the reader (ADR-055 as ruled)",
                   "mcp.js": "read_file: the same file by its exact id, the same rule (mayReadArtifact first)"},
    "installOrgSlot": {"index.js": "the worker's entry: one empty slot per request, next to the request memo"},
    "addressDb": {"tenant.js": "the org row (the brand) and its owner's name on a page before anyone signs in: the org the address serves"},
    "addressServes": {"core.js": "the browser's session (authenticateSession, sprint 7, 7.4): a cookie signs in only as the session's seat in the org the ADDRESS serves (/<org>/…), never at the root"},
    "installAddress": {"index.js": "the router (routeRequest, sprint 7, 7.4): the path's first segment resolved ONCE per request, before any sign-in"},
    "orgCache": {"tenant.js": "the org row's isolate cache, keyed by binding and org", "core.js": "the active-projects isolate cache, keyed by binding and org"},
}
# where an org door is defined (the file its own definition and recursion live in): data.js, but for storeOfRow
DEFINED_IN = {"storeOfRow": "storage.js"}
NINE = ["people", "tokens", "invites", "events", "artifacts", "loops", "approval_audit", "login_attempts", "transmission"]
ALLOW_INSERT = {
    ("accounts.js", "login_attempts"): "a sign-in attempt at the root (POST /login, the OAuth form, POST /signup, POST /orgs' proof) counts in the org the sign-in CHOSE (the account's chosen seat's, else HOME_ORG: sprint 7, 7.4), bound as a value: no one is signed in yet",
}
# the people joins on an id that is not a door-set column and carry no {org}, each for a reason: (file, a regex the statement's
# text must match, the reason). An entry no statement matches is itself a miss (stale).
ALLOW_JOIN = [
    ("accounts.js", r"JOIN people p ON p\.id = COALESCE\(\(SELECT s\.id FROM people s WHERE s\.account_id = t\.account_id AND s\.org = \?3 AND s\.active = 1\), t\.person_id\)",
     "the browser's session (sprint 7, 7.4): the id is the session's own account's seat in the ADDRESS's org, or its own stored seat (tokens.person_id, door-set) — never a typed id — and the statement holds the row to the address's org (p.org = ?3) before signIn refuses any other; no one is signed in yet, so {org} has nothing to say"),
]
# the account rule: the only files whose statements may name the accounts table, and why
ACCOUNT_FILES = {
    "accounts.js": "THE accounts (sprint 7, 7.1): the sign-in by passphrase, the lockout per account, the holder's own passphrase, the admin's span test; 7.2: the sign-up with the operator's code sets the account's passphrase",
}
# the invite rule (sprint 12, 12.3): the only files whose statements may name seat_invites, and why; INVITE_MINT_FILES, the only
# file whose text may insert one (with {org}, always)
INVITE_FILES = {
    "admin.js": "an org's admin mints a link for an active seat of their OWN org ({org}: the seat read and the row written in the admin's org) and revokes that seat's older open links",
    "accounts.js": "POST /signup's invite link (redeemInvite): the link read by its token's hash, with its seat in the link's own org, then spent in the batch that sets the account's passphrase",
}
INVITE_MINT_FILES = {"admin.js"}
# the orgrow rule: the only files whose text may write the org table, and why
ORG_FILES = {
    "orgs.js": "create an org (sprint 7, 7.3): POST /orgs's one batch inserts the new org's row (its id the founding env's {org}) and names its creator seat and home project; the account's one-org limit and the path name held are read beside it",
}
# the signup rule: the only files whose statements may name signup_codes, and why (none of them may insert or delete a code)
SIGNUP_FILES = {
    "accounts.js": "the sign-up (sprint 7, 7.2): an email's ONE open code read by the email, and its conditional spend in the batch that writes the account",
}


def scan(src):
    """-> (code, plain): `plain` is the source with every comment blanked (strings kept); `code` also blanks the inside of
    every string, template and regex literal. Both keep every offset and newline, so a position maps to a line."""
    n = len(src)
    code, plain = list(src), list(src)
    i = 0
    stack = []  # template nesting: each entry is the brace depth of a ${ … } expression
    depth = 0
    prev = ""   # the last significant code character (for the regex-or-divide question)

    def blank(a, b, both=True):
        for k in range(a, b):
            if src[k] != "\n":
                code[k] = " "
                if both:
                    plain[k] = " "

    def template(j):
        """from just after a backtick (or a closing } of ${…}): blank text up to the closing ` or the next ${"""
        while j < n:
            c = src[j]
            if c == "\\":
                blank(j, min(j + 2, n), False); j += 2; continue
            if c == "`":
                return j + 1, False
            if c == "$" and j + 1 < n and src[j + 1] == "{":
                return j + 2, True
            blank(j, j + 1, False); j += 1
        return n, False

    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i); j = n if j < 0 else j
            blank(i, j); i = j; continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2); j = n if j < 0 else j + 2
            blank(i, j); i = j; continue
        if c in "'\"":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            blank(i + 1, min(j, n), False); i = j + 1; prev = "a"; continue
        if c == "`":
            j, opened = template(i + 1)
            if opened:
                stack.append(depth); depth = 0
            i = j; prev = "a"; continue
        if c == "/" and (prev == "" or prev in "(,=:[!&|?{};+-*%<>~^" or re.search(r"\b(return|typeof|case|in|of)\s*$", src[max(0, i - 8):i])):
            j, cls = i + 1, False
            while j < n and src[j] != "\n":
                if src[j] == "\\": j += 2; continue
                if src[j] == "[": cls = True
                elif src[j] == "]": cls = False
                elif src[j] == "/" and not cls: break
                j += 1
            blank(i + 1, min(j, n), False); i = j + 1; prev = "a"; continue
        if c == "{":
            depth += 1
        elif c == "}":
            if stack and depth == 0:
                depth = stack.pop()
                j, opened = template(i + 1)
                if opened:
                    stack.append(depth); depth = 0
                i = j; prev = "a"; continue
            depth -= 1
        if not c.isspace():
            prev = c if not (c.isalnum() or c in "_$") else "a"
        i += 1
    return "".join(code), "".join(plain)


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def receiver(code, dot):
    """the callee of `<x>.prepare(`: the identifier before the balanced (…) that ends just before the dot, or None"""
    j = dot - 1
    while j >= 0 and code[j].isspace():
        j -= 1
    if j < 0 or code[j] != ")":
        return None
    d = 0
    while j >= 0:
        if code[j] == ")": d += 1
        elif code[j] == "(":
            d -= 1
            if d == 0: break
        j -= 1
    m = re.search(r"([A-Za-z_$][\w$]*)\s*$", code[:j])
    return m.group(1) if m else None


def call_arg(code, plain, open_paren):
    """the source text of a call's argument list (strings kept), from its ( to the matching )"""
    d, j = 0, open_paren
    while j < len(code):
        if code[j] == "(": d += 1
        elif code[j] == ")":
            d -= 1
            if d == 0: return plain[open_paren + 1:j]
        j += 1
    return plain[open_paren + 1:]


# ---- the scope rule: the statement text the checker can see ----
TABLES = NINE + ["projects", "org_profile"]   # (sprint 21, 21.4b) org_profile: an org's product step, one row per org
TABLE_RE = re.compile(r"\b(?:FROM|JOIN|UPDATE|INTO)\s+([A-Za-z_]\w*)", re.I)   # FROM/JOIN, UPDATE, INSERT/REPLACE INTO, DELETE FROM
TOKEN_RE = re.compile(r"\{org(?:bucket)?\}")
SQL_RE = re.compile(r"\b(?:SELECT|INSERT|UPDATE|DELETE|REPLACE|WITH)\b")
WRITE_RE = re.compile(r"\b(?:INSERT|REPLACE)\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)", re.I)
# the door's project: a project column (or a project key) compared to a bound value. src/project.js resolves the project once at
# the door, INSIDE the reader's org (a typed slug is read in the reader's org; a stored key re-resolved the same way), and a
# project key carries its org (projects.org is generated from the key, migrate-067), so a statement bounded by it reads one org
PROJECT_RE = re.compile(r"\b(?:WHERE|AND|ON)\s+(?:\w+\.)?(?:project|project_key)\s*(?:=\s*\?\d*|IN\s*\(\s*SELECT\s+value\s+FROM\s+json_each\s*\(\s*\?\d*\s*\)\s*\))", re.I)
# the columns the DOOR stamps with a signed-in person's id (the filer, the decider, the picker, the author): a people join on
# one of them names a person of the row's own org. Any other column holding a person id was typed by a caller.
DOOR_SET = {"submitter", "decided_by", "next_picked_by", "next_done_by", "person_id", "created_by", "filed_by", "id"}
# the statements that name an org-wide table (or projects) and carry neither {org} nor the door's project, each for a reason. An
# entry is (file, a regex the statement's text must match, the reason); an entry no statement matches is itself a miss (stale).
# A wrong entry is a finding, not a convenience: each names why the row it reads or writes can only be the reader's org's.
ALLOW_SCOPE = [
    # -- the sign-in itself: the credential finds the person, and the person's row names the org (src/data.js signIn) --
    ("core.js", r"FROM people WHERE key_hash = \? AND active = 1", "authenticate: the key's hash finds the person; signIn takes the org off that row"),
    ("core.js", r"FROM tokens t JOIN people p ON p\.id = t\.person_id WHERE t\.token_hash = \?", "authenticate: the session token's hash finds the person; signIn takes the org off that row"),
    ("core.js", r"FROM people WHERE active = 1[\"'`]", "resolveReadOnly: a read-only token names a person of any org until it is matched (the cost is PLATFORM §3's S8 row); signIn takes the matched row's org"),
    ("core.js", r"FROM people WHERE id = \? AND active = 1", "resolveReader's OAuth path: the grant (the credential) names the person by id; signIn takes the row's org"),
    ("accounts.js", r"FROM people p JOIN org o ON o\.id = p\.org WHERE p\.account_id = \?1 AND p\.active = 1 AND \" \+ INVITE_MARK_HOLDS\(\"p\"\) \+ \" ORDER BY \(p\.org = \?2\) DESC, \(p\.org = \?3\) DESC, p\.created_at ASC LIMIT 8", "the sign-in at the root (POST /login, the OAuth form, the sign-up, POST /orgs' proof; sprint 7, 7.4): the account the email names, its own active seats in every org (at most eight) in the sign-in's order, each with its org's path name and name (the org a sign-in asks for, the OAuth form's choice: the review's A1) — only their secrets compared and the chosen one signed in; signInEnv takes that seat's org"),
    ("accounts.js", r"[\"'`]SELECT p\.id, p\.org, p\.role, o\.slug, o\.name FROM people p JOIN org o ON o\.id = p\.org WHERE p\.account_id = \?1 AND p\.pending = 1", "the account's seats waiting for its yes (sprint 7's review, A1; migrate-074): bound to the account the sign-in's passphrase just proved, or that an ACCOUNT session carries (tokens.account_id) — never a typed id; each seat's id, org, role and its org's path name and name (the picker's Accept and Decline), no other row"),
    ("accounts.js", r"[\"'`]UPDATE tokens SET revoked = 1 WHERE revoked = 0 AND \(account_id = \?1 OR person_id IN \(SELECT id FROM people WHERE account_id = \?1\)\) AND token_hash IS NOT \?2[\"'`]", "the holder's own act, proven by the ACCOUNT's passphrase on /profile (sprint 7's review, B1 + A2): every session of their own account — its account sessions and each of its seats' own, in every org — ends (one account, its holder proven), but the one the change was proven on"),
    ("accounts.js", r"UPDATE people SET (?:active = 1, )?pending = 0 WHERE id = \?1 AND pending = 1 AND account_id = \(SELECT t\.account_id FROM tokens t WHERE t\.token_hash = \?2 AND t\.revoked = 0 AND t\.expires_at > \?3 AND t\.account_id IS NOT NULL\)", "the holder's answer to a seat waiting for its yes (sprint 7's review, A1; POST /orgs/seat): the seat must be of the account the request's own ACCOUNT session carries (the cookie's token by its hash, live; a seat session carries none) — one row of that holder's own, accepted or declined, nothing else"),
    ("accounts.js", r"FROM accounts a JOIN people p ON p\.account_id = a\.id AND p\.active = 1 WHERE a\.id = \?1 AND \(a\.invited_org IS NULL OR a\.invited_org = p\.org\) ORDER BY \(p\.org = \(SELECT o\.id FROM org o WHERE o\.slug = \?2\)\) DESC, \(p\.org = \?3\) DESC, \(p\.org = \?4\) DESC, p\.created_at ASC LIMIT 1", "an ACCOUNT grant's seat (resolveReader's OAuth path, sprint 7, 7.5a): the account the grant carries (set only when the account's passphrase proved it at the OAuth sign-in, never a typed id) — ONE of its OWN active seats, the one in the org the call names first; signIn takes the org off that row"),
    ("accounts.js", r"FROM tokens t JOIN people p ON p\.id = COALESCE\(\(SELECT s\.id FROM people s WHERE s\.account_id = t\.account_id AND s\.org = \?3 AND s\.active = 1\), t\.person_id\) WHERE t\.token_hash = \?1 .*AND p\.org = \?3", "the browser's session under an org's address (authenticateSession, sprint 7, 7.4): the cookie's token by its hash, then its account's seat in the ADDRESS's org (?3, the router's one resolution) or its own seat — and the row must be of that org (p.org = ?3); signIn takes the org off that row and refuses any other than the address's"),
    ("core.js", r"[\"'`]SELECT 1 AS live FROM tokens t WHERE t\.token_hash = \?1", "a session that signs in nobody under this address: is it live anywhere (a yes or no, no row leaves), so the router answers the plain 404 rather than the sign-in page"),
    ("core.js", r"[\"'`]SELECT t\.account_id, o\.slug, o\.name, p\.role FROM tokens t LEFT JOIN people p ON p\.id = t\.person_id AND p\.active = 1 LEFT JOIN org o ON o\.id = p\.org WHERE t\.token_hash = \?1", "where the browser's session may go, at the root where it signs no one in (sprint 7, 7.4b: an old bookmark, the org picker): the cookie's own token by its hash — its account (NULL for a seat session) and its OWN seat's org name, path name and role; no other seat, no row of the org but its name"),
    ("accounts.js", r"[\"'`]SELECT o\.slug, o\.name, p\.role FROM people p INDEXED BY idx_people_account_seat JOIN org o ON o\.id = p\.org WHERE p\.account_id = \?1 AND p\.active = 1", "the account's own orgs (sprint 7, 7.4b: the picker at the root, the rail's org switcher): bound to the account an ACCOUNT session carries (tokens.account_id, set only by proving the account's passphrase), never a typed id; each seat's org name, path name and role, no other row"),
    ("accounts.js", r"[\"'`]SELECT id FROM people WHERE account_id = \?[\"'`]", "the holder's own seats in every org, read only after they proved their ACCOUNT's passphrase (/profile) or the operator's code for its email (POST /signup's reset): each seat's connected apps end with it"),
    ("accounts.js", r"UPDATE tokens SET revoked = 1 WHERE revoked = 0 AND person_id IN \(SELECT p\.id FROM people p JOIN accounts a ON a\.id = p\.account_id WHERE a\.email = \?1 AND a\.pass_hash IS NOT NULL\) AND EXISTS \(SELECT 1 FROM signup_codes WHERE id = \?2 AND spent_by = \?3\)",
     "the operator-approved reset (POST /signup, case c): the account the operator's code was given for (bound to its email) ends every session of its OWN seats, in every org (one account, its holder proven by the code), only in the batch that spent that code"),
    ("oauth.js", r"[\"'`]SELECT 1 AS x FROM people WHERE key_hash = \?[\"'`]", "a minted key's collision probe: yes or no on a fresh 256-bit hash; no row leaves"),
    ("oauth.js", r"[\"'`]SELECT 1 AS x FROM tokens WHERE token_hash = \?[\"'`]", "a minted token's collision probe: yes or no on a fresh 256-bit hash; no row leaves"),
    # -- the account flow (sprint 21, 21.4a; src/accounts.js THE ACCOUNT FLOW): an account's own seats counted, never read --
    ("accounts.js", r"INSERT INTO account_sessions \(token_hash, account_id, device, created_at, expires_at, revoked, proven_how, proven_at\) SELECT \?1, a\.id, \?2, \?3, \?4, 0, 'passphrase', \?3 FROM accounts a WHERE a\.id = \?5 AND a\.pass_hash IS NOT NULL",
     "an ACCOUNT session's mint (POST /login, a reset): the account whose passphrase the request just proved (?5, ?6), only while it holds no seat of any org (a yes or no on its own seats: no row of any org leaves); the session is no org's (account_sessions: no reader of tokens finds it)"),
    ("accounts.js", r"[\"'`]SELECT \(SELECT COUNT\(\*\) FROM people p WHERE p\.account_id = \?1 AND \(p\.active = 1 OR p\.pending = 1\)\) AS seats",
     "the account session's own standing (GET /account): bound to the account the session carries, never a typed id — a count of its own seats, whether its email's code was used, the path name of the org it founded; no row of any org leaves"),
    ("accounts.js", r"INSERT INTO account_sessions \(token_hash, account_id, device, created_at, expires_at, revoked, proven_how, proven_at\) SELECT \?1, a\.id, \?2, \?5, \?3, 0, 'verify', \?5 FROM accounts a WHERE a\.email = \?4 AND a\.pass_hash = \?7",
     "the verification's account session (POST /account/verify): the account the verified email names, holding the passphrase the link's own request chose, only while it holds no seat of any org (a yes or no); no row of any org leaves"),
    ("accounts.js", r"UPDATE tokens SET revoked = 1 WHERE revoked = 0 AND \(account_id = \?1 OR person_id IN \(SELECT id FROM people WHERE account_id = \?1\)\) AND \$\{RESET_SPENT\}",
     "a reset link's spend (POST /account/reset): every session of the account the link was minted for (its email proven by the link), in every org — its account sessions and each of its own seats' — only when THIS request spent that link"),
    # -- the operator page (sprint 21, 21.4b; src/operatorread.js): the ONE place the worker reads across orgs on purpose --
    ("operatorread.js", r"LEFT JOIN org o ON o\.id = r\.org_id LEFT JOIN org_profile p ON p\.org = r\.org_id ",
     "the operator page's people (org 1's admins only, in a browser: mayOperate): for a request that founded an org, that org's product answers, by the org id the founding batch wrote on the request — what its founder agreed the operator sees (src/orgprofile.js PRODUCT_NOTE)"),
    # -- Google sign-in's first link and join (the sprint-21 review; src/accounts.js THE FIRST LINK IS A RESET): an account's own rows --
    ("accounts.js", r"[\"'`]UPDATE people SET active = 0, pending = 1 WHERE account_id = \?1 AND active = 1 AND EXISTS \(SELECT 1 FROM accounts u WHERE u\.id = \?1 AND u\.google_sub IS NULL AND u\.invited_org IS NOT NULL\)",
     "the first Google link of an account an org's invite link set the passphrase of (Google just proved its email's mailbox): that account's OWN seats, in every org, wait for its holder's yes — bound to the account the verified email names, only while it has no subject linked; no row is read"),
    ("accounts.js", r"UPDATE tokens SET revoked = 1 WHERE revoked = 0 AND \(account_id = \?1 OR person_id IN \(SELECT id FROM people WHERE account_id = \?1\)\) AND \$\{UNLINKED\}",
     "the first Google link (a reset: Google just proved the email's mailbox): every session of that account — its account sessions and each of its own seats', in every org — ends, only while it has no subject linked"),
    ("accounts.js", r"[\"'`]SELECT EXISTS \(SELECT 1 FROM people p WHERE p\.account_id = \?1 AND \(p\.active = 1 OR p\.pending = 1\)\) AS seated",
     "whether the account the verified email names holds any seat (a yes or no: no row of any org leaves): a shell with none is no one's (Google's sign-in treats it as none)"),
    ("accounts.js", r"INSERT INTO accounts \(id, email, pass_hash, pass_salt, google_sub, created_at, updated_at\) SELECT \?1, \?2, \?3, \?4, \?5, \?6, \?6 ",
     "a join through Google (its email the one Google verified): an account made, or an add-person shell taken only while it holds no seat of any org (a yes or no on its own seats: no row of any org leaves)"),
    ("accounts.js", r"[\"'`]SELECT a\.id, a\.email, a\.pass_hash, a\.pass_salt, a\.invited_org, a\.google_sub FROM tokens t JOIN accounts a ON a\.id = t\.account_id WHERE t\.token_hash = \?1",
     "an org session's step-up (POST /orgs, GET /orgs/new): the request's own session cookie by its hash, live, and its ACCOUNT (tokens.account_id, set only when the account's holder proved it) — the account's own row, no seat's"),
    # -- the invite link (sprint 12, 12.3; src/accounts.js THE INVITE LINK): no one is signed in yet; the link names its org --
    ("accounts.js", r"FROM seat_invites i JOIN people p ON p\.id = i\.person_id AND p\.org = i\.org LEFT JOIN accounts a ON a\.id = p\.account_id WHERE i\.token_hash = \?1 AND i\.used_at IS NULL",
     "the invite link's one read (POST /signup): the link found by its token's hash (192 bits, only its holder knows it), its seat joined in the LINK's own org (the org its admin minted it in, {org} at the mint) and that seat's account; whether the account holds another seat is a yes or no, no row of that org leaves"),
    ("accounts.js", r"[\"'`]UPDATE seat_invites SET used_at = \?1, spent_by = \?2 WHERE id = \?3 AND token_hash = \?4 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > \?1 AND EXISTS \(SELECT 1 FROM people p JOIN accounts a ON a\.id = p\.account_id WHERE p\.id = seat_invites\.person_id AND p\.org = seat_invites\.org ",
     "the invite link's spend: the one link read (its id and token hash), only while its seat stands in the link's own org exactly as read and its account has no passphrase and no other seat; a yes or no on that seat's org, nothing else"),
    # -- the lockout: per ACCOUNT (one per email, across orgs: PLATFORM §2.8), or the address typed when no account answers --
    ("accounts.js", r"FROM login_attempts WHERE ok = 0 AND at > \?1 AND \(account_id = \?2 OR \(account_id IS NULL AND email = \?3\)\)", "the lockout's count: an account's failures in every org (one account, one lockout), or the typed address's while no account answers it; a count, no row leaves"),
    # -- the reader's own rows: bound to the signed-in person's id or credential (a person id is one row of one org) --
    ("index.js", r"[\"'`]UPDATE tokens SET revoked = 1 WHERE token_hash = \?", "sign-out: the reader's own session cookie's hash"),
    ("index.js", r"[\"'`]UPDATE tokens SET project = \? WHERE token_hash = \? AND revoked = 0[\"'`]", "the project switch: the reader's own session token (the project resolved in the reader's org)"),
    ("index.js", r"[\"'`]UPDATE people SET hats = \?, avatar = \? WHERE id = \?[\"'`]", "the reader's own profile: bound to reader.id"),
    ("index.js", r"[\"'`]UPDATE people SET trace_consent = \? WHERE id = \?[\"'`]", "the reader's own consent: bound to reader.id"),
    ("secrets.js", r"[\"'`]UPDATE people SET pass_hash=\?, pass_salt=\? WHERE id=\?[\"'`]", "the reader's own passphrase: bound to the signed-in person's id"),
    ("secrets.js", r"[\"'`]UPDATE people SET key_hash=\? WHERE id=\?[\"'`]", "the reader's own key rotation: bound to the signed-in person's id"),
    ("secrets.js", r"[\"'`]UPDATE tokens SET revoked = 1 WHERE person_id = \? AND account_id IS NULL AND revoked = 0[\"'`]", "the reader's own seat's SEAT sessions, revoked after their own seat's key rotation (sprint 7's review, B1: an account session is ended only by the account's passphrase)"),
    ("core.js", r"[\"'`]SELECT MAX\(created_at\) AS t FROM events WHERE person_id = \?[\"'`]", "the brief's \"last here\": the reader's own events (person.id)"),
    ("core.js", r"FROM loops WHERE person_id ?= ?\? AND status ?= ?'open'", "the reader's own open loops, listed or counted (person.id)"),
    ("openitems.js", r"FROM loops WHERE person_id = \? AND status = 'open'", "open_items: the reader's own open items (person.id)"),
    ("openitems.js", r"[\"'`]UPDATE loops SET status='closed', closed_at=\? WHERE id=\? AND person_id=\?[\"'`]", "open_items close: one of the reader's own items (person.id)"),
    ("home.js", r"[\"'`]SELECT \(SELECT 1 FROM tokens WHERE person_id = \? AND revoked = 0", "Home's first five steps for a member: the reader's own tokens, filings and events (reader.id, three binds)"),
    ("thread.js", r"FROM transmission t WHERE t\.submitter=\?", "updates: the reader's own filings and the rulings on them (person.id)"),
    ("thread.js", r"FROM events WHERE person_id=\? AND kind='(?:exit|unknown)'", "updates: the reader's own reports and questions (person.id)"),
    ("core.js", r"FROM transmission WHERE submitter = \?1? AND client_ref (?:= \?|IN)", "a filing's replay: the filer's own clientRefs (person.id; migrate-069's unique index is per person)"),
    ("knowledge/write.js", r"FROM transmission WHERE submitter = \? AND client_ref = \?", "a knowledge write's replay: the writer's own clientRef (person.id)"),
    ("preview.js", r"FROM transmission WHERE submitter = \?1 AND client_ref (?:IN|>= \?2)", "preview's landed check: the filer's own clientRefs and batch parts (the person's id)"),
    # -- by its exact id, then admitted --
    ("index.js", r"FROM artifacts a JOIN people p ON p\.id = a\.person_id WHERE a\.id = \?[\"'`]", "GET /artifact/:id: a file by its exact id, then mayReadArtifact compares its org to the reader's (the ruled public-link exception, ADR-055)"),
    ("mcp.js", r"FROM artifacts a JOIN people p ON p\.id=a\.person_id WHERE a\.id=\?[\"'`]", "read_file: the same file by its exact id, the same rule (mayReadArtifact first)"),
    ("index.js", r"FROM events e JOIN people p ON p\.id = e\.person_id WHERE\W+clauses\.join", "/audit: the clauses list it joins is a local array that opens with \"e.org = {org}\" (src/index.js, the /audit route); the checker does not follow a call's value arguments"),
    # -- one platform-wide key space --
    ("core.js", r"[\"'`]SELECT id FROM transmission WHERE id >= \?1 AND id < \?2", "the next contribution id: ids are ONE platform-wide primary key, the read answers the day's next number and no row (the volume it implies is the ruled ids item, PLATFORM §3)"),
    ("admin.js", r"[\"'`]INSERT INTO projects \(key,name,active,created_at,eval\)", "a new project: its key is projectKeyOf(readerOrg) and projects.org is GENERATED from the key (migrate-067), so the row is the reader's org's"),
    ("knowledge/versions.js", r"FROM projects pr .*WHERE pr\.key = \?", "the versions list: the door's project by its key (projects.org is generated from the key)"),
    # -- revocation reaches every session of a person already proven in the admin's org --
    ("admin.js", r"[\"'`]UPDATE tokens SET revoked = 1 WHERE person_id = \? AND account_id IS NULL AND revoked = 0[\"'`]", "a Control revoke or archive: the person was matched by an org-scoped UPDATE or read first; revocation must also reach a session the old code minted with no org in the 067-to-068 window (an org filter would leave it alive); only the seat's SEAT sessions (sprint 7's review, B1 + A4: an admin never signs a person out of another org)"),
]


def body_at(code, i, func=False):
    """the source span of a definition's value from offset i: up to the first `;` at depth 0 (a value), or through the first
    top-level { … } block (func: a function declaration), or to the close of the block enclosing it"""
    d, n, j, opened = 0, len(code), i, False
    while j < n:
        ch = code[j]
        if ch in "([{":
            d += 1
            if ch == "{" and d == 1: opened = True
        elif ch in ")]}":
            d -= 1
            if d < 0: return j
            if func and opened and d == 0 and ch == "}": return j + 1
        elif ch == ";" and d == 0 and not func:
            return j
        j += 1
    return n


RUNNER_RE = re.compile(r"\.\s*(?:prepare|batch|all|first|run)\s*\(|\bawait\b")


def definitions(texts):
    """-> (local, exported): every const/let/var, for-of and function declaration per file, name -> [(file, pos, code, plain)];
    and the exported ones and every UPPER_SNAKE constant across files (an imported statement constant or builder). Only a
    BUILDER is kept: a definition whose body runs nothing (no .prepare/.batch/.all/.first/.run, no await) — a function that
    runs its own statement is never part of another statement's text"""
    local, exported = {}, {}

    def keep(rel, loc, name, pos, c, pl, exp):
        if RUNNER_RE.search(c):
            return
        entry = (rel, pos, c, pl)
        loc.setdefault(name, []).append(entry)
        if exp:
            exported.setdefault(name, []).append(entry)

    for rel, (src, code, plain) in texts.items():
        if rel in ALLOW_BINDING:
            continue   # the layer's own text spells the tokens it substitutes: never part of a statement
        loc = local.setdefault(rel, {})
        for m in re.finditer(r"\b(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?!=)", code):
            e = body_at(code, m.end())
            keep(rel, loc, m.group(2), m.start(), code[m.end():e], plain[m.end():e], bool(m.group(1) or re.match(r"[A-Z][A-Z0-9_]+$", m.group(2))))
        for m in re.finditer(r"\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+", code):
            e = body_at(code, m.end())
            keep(rel, loc, m.group(1), m.start(), code[m.end():e], plain[m.end():e], False)
        for m in re.finditer(r"\b(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(", code):
            e = body_at(code, m.end() - 1, func=True)
            keep(rel, loc, m.group(2), m.start(), code[m.end() - 1:e], plain[m.end() - 1:e], bool(m.group(1)))
    return local, exported


def expander(local, exported):
    def expand(rel, ctext, ptext, pos, seen):
        """the statement's text: ptext plus the text of every builder (constant, local, imported) it names, each followed once,
        a local looked up in the file it is written in (the nearest definition before the use)"""
        out = [ptext]
        loc = local.get(rel, {})
        names, depth = set(), 0
        for m in re.finditer(r"[()]|(?<![\w$.])([A-Za-z_$][\w$]*)", ctext):
            if m.group(0) == "(": depth += 1
            elif m.group(0) == ")": depth = max(0, depth - 1)
            elif depth == 0 or re.match(r"[A-Z][A-Z0-9_]{2,}$", m.group(1)):
                names.add(m.group(1))   # a callee or an operand; inside a call's parentheses only a CONSTANT (an argument is a value)
        for name in sorted(names):
            if name in seen or name in ("db", "addressDb", "env"):
                continue
            here = loc.get(name, [])
            before = [d for d in here if d[1] < pos]
            pick = [before[-1]] if before else (here[:1] if here else exported.get(name, []))
            if not pick:
                continue
            seen.add(name)
            for r2, p2, c2, t2 in pick:
                out.append(expand(r2, c2, t2, p2 + 1, seen))
        return "\n".join(out)
    return expand


def split_args(s):
    out, d, cur = [], 0, []
    for ch in s:
        if ch in "([{": d += 1
        elif ch in ")]}": d -= 1
        if ch == "," and d == 0:
            out.append("".join(cur)); cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return out


def statements(texts):
    """-> [(file, line, text, how)]: every statement a layer handle prepares, its text followed through constants, locals and
    builders; a statement passed into a local wrapper (`const del = (sql, …) => db(env).prepare(sql)…`) is read at each call of
    the wrapper; `how` is "seen" or "unseen" (no SQL text reachable: the checker cannot judge it)"""
    local, exported = definitions(texts)
    expand = expander(local, exported)
    out = []
    for rel, (src, code, plain) in texts.items():
        if rel in ALLOW_BINDING:
            continue
        for m in re.finditer(r"\b(db|addressDb)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\.\s*prepare\s*\(", code):
            o = m.end() - 1
            parg = call_arg(code, plain, o)
            carg = code[o + 1:o + 1 + len(parg)]
            line = line_of(code, m.start())
            # a wrapper's parameter (the statement handed in by the caller): read the statement at each call of the wrapper.
            # Asked FIRST, by scope: a parameter of the function enclosing this call shadows any same-named local elsewhere
            ident = carg.strip()
            got = enclosed = False
            if re.match(r"^[A-Za-z_$][\w$]*$", ident):
                head = code[:m.start()]
                for w in reversed(list(re.finditer(r"(?:\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?|\bfunction\s+([A-Za-z_$][\w$]*)\s*|(?<![\w$]))\(([^()]*)\)\s*(?:=>|\{)", head))):
                    params = [x.strip().split("=")[0].strip().lstrip(".") for x in w.group(3).split(",")]
                    if ident not in params:
                        continue
                    end = body_at(code, w.end() - 1, func=True) if code[w.end() - 1] == "{" else body_at(code, w.end())
                    if end < m.start():
                        continue   # a function that does not enclose this call
                    enclosed = True
                    k = params.index(ident)
                    name = w.group(1) or w.group(2)
                    if name:
                        for c in re.finditer(r"(?<![\w$.])" + re.escape(name) + r"\s*\(", code):
                            if w.start() <= c.start() < w.end():
                                continue   # the definition itself
                            pa = call_arg(code, plain, c.end() - 1)
                            args, cargs = split_args(pa), split_args(code[c.end():c.end() + len(pa)])
                            if len(args) > k:
                                t = expand(rel, cargs[k], args[k], c.start(), set())
                                out.append((rel, line_of(code, c.start()), t, "seen" if SQL_RE.search(t) else "unseen"))
                                got = True
                    else:
                        # an anonymous arrow over a list (`[A_SQL, B_SQL].map((q) => db(env).prepare(q))`): each name on its line
                        ls = code.rfind("\n", 0, w.start()) + 1
                        for nm in re.findall(r"(?<![\w$.])([A-Z][A-Z0-9_]{2,})\b", code[ls:w.start()]):
                            t = expand(rel, nm, nm, m.start(), set())
                            out.append((rel, line, t, "seen" if SQL_RE.search(t) else "unseen")); got = True
                    break
            if enclosed:
                if not got:
                    out.append((rel, line, ident, "unseen"))
                continue
            text = expand(rel, carg, parg, m.start(), set())
            if SQL_RE.search(text):
                out.append((rel, line, text, "seen")); continue
            if not got:
                out.append((rel, line, text, "unseen"))
    return out


def main():
    files = []
    for dirpath, _, names in os.walk(SRC):
        for f in sorted(names):
            if f.endswith(".js"):
                rel = os.path.relpath(os.path.join(dirpath, f), SRC)
                if rel not in SKIP:
                    files.append(rel)
    files.sort()
    texts = {}
    for rel in files:
        with open(os.path.join(SRC, rel), encoding="utf-8") as fh:
            src = fh.read()
        texts[rel] = (src,) + scan(src)

    misses = []
    for rel, (src, code, plain) in texts.items():
        bound_ok = rel in ALLOW_BINDING
        if not bound_ok:
            for m in re.finditer(r"\.DB\b", code):
                misses.append(f"{rel}:{line_of(code, m.start())}: binding — the raw D1 binding (.DB) outside the layer: use db(env) (src/data.js)")
            for m in re.finditer(r"\{[^{}()]*\bDB\b[^{}()]*\}\s*=(?!=)", code):
                misses.append(f"{rel}:{line_of(code, m.start())}: binding — the raw D1 binding destructured outside the layer")
            for m in re.finditer(r"\.\s*(prepare|batch)\s*\(", code):
                who = receiver(code, m.start())
                if who not in ("db", "addressDb"):
                    misses.append(f"{rel}:{line_of(code, m.start())}: statement — .{m.group(1)}( on {who or 'something'} — a statement runs on db(<env>) only (src/data.js)")
        if rel not in ALLOW_STORAGE:
            for m in re.finditer(r"\.\s*BRAIN\b", code):
                misses.append(f"{rel}:{line_of(code, m.start())}: storage — the raw R2 binding (.BRAIN) outside src/storage.js: use store(env)")
            for m in re.finditer(r"\{[^{}()]*\bBRAIN\b[^{}()]*\}\s*=(?!=)", code):
                misses.append(f"{rel}:{line_of(code, m.start())}: storage — the raw R2 binding destructured outside src/storage.js")
            for m in re.finditer(r"\[\s*[\"'`]BRAIN[\"'`]\s*\]", plain):
                misses.append(f"{rel}:{line_of(plain, m.start())}: storage — the raw R2 binding by name outside src/storage.js")
        if rel != "storage.js":
            for m in re.finditer(r"(?:[\"'`]|/\^?)(?:inbox|renders|backups)\\?/|[\"'`]o(?:\d+|\$\{[^}]*\})\\?/", plain):
                if code[m.start()] != plain[m.start()]:
                    continue   # the quote or slash sits INSIDE another literal (a route's doc text): only a literal's own opening counts
                misses.append(f"{rel}:{line_of(plain, m.start())}: storage — an R2 key spelled outside src/storage.js ({plain[m.start():m.end() + 12].strip()}…): build it there, under the org's prefix")
        for fn, allowed in ORG_DOORS.items():
            if rel == DEFINED_IN.get(fn, "data.js"):
                continue
            for m in re.finditer(r"(?<![\w$.])" + fn + r"\s*\(", code):
                if rel not in allowed:
                    misses.append(f"{rel}:{line_of(code, m.start())}: org-door — {fn}( outside its door ({', '.join(sorted(allowed))}): the org comes from the sign-in alone")
        for m in re.finditer(r"\b(?:INSERT|REPLACE)\s+(?:OR\s+\w+\s+)?INTO\s+signup_codes\b|\bDELETE\s+FROM\s+signup_codes\b", plain, re.I):
            misses.append(f"{rel}:{line_of(plain, m.start())}: signup — the worker writes a sign-up code ({m.group(0)}): only the operator mints or "
                          f"removes one (tools/operator.mjs, the deployment's credentials); no route may allow an email")
        if rel not in INVITE_MINT_FILES:
            for m in re.finditer(r"\b(?:INSERT|REPLACE)\s+(?:OR\s+\w+\s+)?INTO\s+seat_invites\b", plain, re.I):
                misses.append(f"{rel}:{line_of(plain, m.start())}: invite — an invite link written outside {', '.join(sorted(INVITE_MINT_FILES))} ({m.group(0)}): a link is "
                              f"minted only by an org's admin, for a seat of their own org (src/admin.js mintInvite)")
        if rel not in ORG_FILES:
            for m in re.finditer(r"\b(?:(?:INSERT|REPLACE)\s+(?:OR\s+\w+\s+)?INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+org\b", plain, re.I):
                misses.append(f"{rel}:{line_of(plain, m.start())}: orgrow — a write of the org table ({m.group(0)}) outside {', '.join(sorted(ORG_FILES))}: an org row is "
                              f"made only by POST /orgs's one batch (src/orgs.js createOrg); no route edits an org's row")
        for m in re.finditer(r"SELECT\s+org\s+FROM\s+people\s+WHERE\s+id", plain, re.I):
            misses.append(f"{rel}:{line_of(plain, m.start())}: subselect — the org read off a people row by id: write {{org}} (the layer binds the reader's org)")

    # the insert and scope rules, over every statement's text
    used = [0] * len(ALLOW_SCOPE)
    used_join = [0] * len(ALLOW_JOIN)
    tally = {"org": 0, "project": 0, "allow": 0, "other": 0}
    for rel, line, text, how in statements(texts):
        base = os.path.basename(rel)
        flat = re.sub(r"[\"'`]\s*\+\s*[\"'`]", "", " ".join(text.split()))
        if how == "unseen":
            misses.append(f"{rel}:{line}: unseen — a statement whose text the checker cannot follow (a parameter, a computed string): name it with a constant or a local the checker reads")
            continue
        has_tok = bool(TOKEN_RE.search(flat))
        writes = [t.lower() for t in WRITE_RE.findall(flat)]
        for t in writes:
            if t in NINE and not has_tok and (base, t) not in ALLOW_INSERT:
                misses.append(f"{rel}:{line}: insert — INSERT/REPLACE INTO {t} names no {{org}}: a row of the nine org-wide tables carries the writer's org through the layer")
        # a person's name looked up by an id the row's author typed (next.who, a knowledge field) is the cross-org id -> name
        # oracle of the sprint-6 review (findings 2 and 3): such a join names the org in its own ON clause
        for jm in re.finditer(r"\bJOIN\s+people\s+(\w+)\s+ON\s+(.*?)(?=\b(?:LEFT|CROSS|INNER|JOIN|WHERE|GROUP|ORDER|UNION|LIMIT)\b|\)\s*(?:AS|$)|$)", flat, re.I):
            on = jm.group(2)
            col = re.search(r"\b" + re.escape(jm.group(1)) + r"\.id\s*=\s*(?:\w+\.)?(\w+)", on) or re.search(r"(?:\w+\.)?(\w+)\s*=\s*" + re.escape(jm.group(1)) + r"\.id\b", on)
            jhit = [k for k, (f, rx, _) in enumerate(ALLOW_JOIN) if f == rel and re.search(rx, flat)]
            for k in jhit: used_join[k] += 1
            if col and col.group(1).lower() not in DOOR_SET and not TOKEN_RE.search(on) and not jhit:
                misses.append(f"{rel}:{line}: people-join — people joined on {col.group(1)}, an id the row's author wrote: add `AND {jm.group(1)}.org = {{org}}` to the ON clause "
                              f"(only the door-set columns {', '.join(sorted(DOOR_SET))} name a person the door stamped)")
        if "signup_codes" in {t.lower() for t in TABLE_RE.findall(flat)} and base not in SIGNUP_FILES:
            misses.append(f"{rel}:{line}: signup — a statement on signup_codes outside {', '.join(sorted(SIGNUP_FILES))}: the operator's codes are read "
                          f"and spent by the sign-up alone (src/accounts.js)")
        if "seat_invites" in {t.lower() for t in TABLE_RE.findall(flat)}:
            if base not in INVITE_FILES:
                misses.append(f"{rel}:{line}: invite — a statement on seat_invites outside {', '.join(sorted(INVITE_FILES))}: an org's invite links are minted by its "
                              f"admin (src/admin.js) and spent by POST /signup (src/accounts.js) alone")
            elif "seat_invites" in [t.lower() for t in WRITE_RE.findall(flat)] and not has_tok:
                misses.append(f"{rel}:{line}: invite — an insert into seat_invites with no {{org}}: a link is the minting admin's own org's, through the layer")
        if "accounts" in {t.lower() for t in TABLE_RE.findall(flat)} and base not in ACCOUNT_FILES:
            misses.append(f"{rel}:{line}: account — a statement on accounts outside {', '.join(sorted(ACCOUNT_FILES))}: an account is no org's row; "
                          f"read or write it through src/accounts.js, where its authority is argued")
        tabs = sorted({t.lower() for t in TABLE_RE.findall(flat)} & set(TABLES))
        if not tabs:
            tally["other"] += 1; continue
        if has_tok:
            tally["org"] += 1; continue
        if writes and all((base, t) in ALLOW_INSERT for t in writes if t in NINE) and not re.search(r"\b(?:UPDATE|DELETE)\b|\bSELECT\b.*\bFROM\b", flat, re.I):
            tally["allow"] += 1; continue
        hit = [k for k, (f, rx, _) in enumerate(ALLOW_SCOPE) if f == rel and re.search(rx, flat)]
        if hit:
            for k in hit: used[k] += 1
            tally["allow"] += 1; continue
        if PROJECT_RE.search(flat) and not re.search(r"\b(?:FROM|UPDATE|INTO)\s+people\b", flat, re.I):
            tally["project"] += 1; continue
        misses.append(f"{rel}:{line}: scope — a statement on {', '.join(tabs)} carries no {{org}} and no door's project: write {{org}} "
                      f"(src/data.js) or allowlist it in ALLOW_SCOPE with the reason ({flat[:140]}…)")
    for k, n in enumerate(used_join):
        if not n:
            f, rx, _ = ALLOW_JOIN[k]
            misses.append(f"{f}: allowlist — ALLOW_JOIN entry /{rx}/ matches no statement: delete it (a stale entry is a hole)")
    for k, n in enumerate(used):
        if not n:
            f, rx, _ = ALLOW_SCOPE[k]
            misses.append(f"{f}: allowlist — ALLOW_SCOPE entry /{rx}/ matches no statement: delete it (a stale entry is a hole)")
    if misses:
        for x in misses:
            print("  ✗ " + x)
        print(f"✗ scoped data layer: {len(misses)} miss(es) in {len(files)} files")
        return 1
    stmts = sum(len(re.findall(r"\.\s*(?:prepare|batch)\s*\(", code)) for rel, (_, code, _) in texts.items() if rel not in ALLOW_BINDING)
    r2 = sum(len(re.findall(r"\b(?:store|storeOfRow)\s*\(", code)) for rel, (_, code, _) in texts.items() if rel not in ALLOW_STORAGE)
    print(f"✓ scoped data layer: {stmts} statement calls in {len(files)} files, every one on db(env); the org set only by the sign-in "
          f"({len(ALLOW_BINDING)} files hold the binding, {sum(len(v) for v in ORG_DOORS.values())} org doors, {len(ALLOW_INSERT)} address-org inserts); "
          f"the statements on the org-wide tables: {tally['org']} carry {{org}}, {tally['project']} the door's project, {tally['allow']} allowlisted "
          f"({len(ALLOW_SCOPE)} entries); the accounts in {len(ACCOUNT_FILES)} file; the sign-up codes read in {len(SIGNUP_FILES)} file, minted by none; the invite links in {len(INVITE_FILES)} files, minted in {len(INVITE_MINT_FILES)} with {{org}}; the org table written in {len(ORG_FILES)} file; {r2} storage calls, every R2 key under its org's prefix ({len(ALLOW_STORAGE)} files hold the bucket)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
