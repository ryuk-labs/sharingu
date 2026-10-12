#!/usr/bin/env python3
"""check-scoped-data-selftest.py — the scoped data layer's gate step (tools/check-scoped-data.py) can fail.

A check that cannot fail is not a check. This copies engine/src to a scratch directory, proves the checker GREEN on the
copy as it stands, then breaks one call site at a time (each on a fresh copy) and proves each break RED, naming its rule:
  1 statement  one db(env).prepare( in a reader rewritten as a raw env.DB.prepare(          -> binding + statement
  2 statement  a .batch( on a variable that is not a layer handle                            -> statement
  3 binding    the binding destructured, `const { DB } = env`                                -> binding
  4 org-door   signIn( called from a reader (an org taken from somewhere other than the sign-in) -> org-door
  5 org-door   platformEnv( called from a route file other than the cron's                   -> org-door
  6 subselect  6.1's `(SELECT org FROM people WHERE id = ?3)` put back in an events insert   -> subselect
  7 insert     the {org} taken out of an events insert (a row that would land with no org)   -> insert
  8 insert     the {org} taken out of a NAMED statement constant (src/accounts.js LOGIN_SESSION_SQL) -> insert, named
               where the statement runs (src/accounts.js mintSession, POST /login's session)
  (sprint 6, 6.4 — storage carries the org)
  9 storage    a render body read on the raw bucket, env.BRAIN.get(…)                        -> storage
 10 storage    the bucket destructured, `const { BRAIN } = env`                               -> storage
 11 storage    a handoff's key spelled in its writer (`inbox/handoffs/…`), not by src/storage.js -> storage
 12 storage    an org prefix spelled outside src/storage.js (`o${1}/` + key)                  -> storage
 13 storage    a regex literal over an R2 key (/^renders…/) outside src/storage.js         -> storage
 14 org-door   storeOfRow( (an object read under a row's org) called from a reader other than the two by-id doors -> org-door
  (the sprint-6 review, finding 4 — the four statements the tests helper proved invisible, and the patterns beside them)
 15 scope      an UPDATE on people with its org taken out (Control's set-title)                -> scope
 16 scope      a DELETE on artifacts with its org taken out, run through a local wrapper (Control's eval sweep, `del(sql)`) -> scope
 17 insert     REPLACE INTO people with no org (a person row written by REPLACE, not INSERT)   -> insert + scope
 18 scope      an id-only SELECT on people (finding 2 put back: pickup's names lookup)          -> scope
 19 scope      the same oracle on the question page (finding 3 put back: decisions' decider name) -> scope
 20 people-join a people row joined on next_who with no org (the follow-ups' sibling put back)  -> people-join
 21 scope      an UPDATE held in a lowercase local (`const q = "UPDATE loops …"; db(env).prepare(q)`) -> scope
 22 unseen     a statement passed in from nowhere the checker can follow (a function's parameter) -> unseen
 23 allowlist  an ALLOW_SCOPE entry whose statement no longer exists in that form (stale)        -> allowlist
  (sprint 7, 7.1 — one account per email, a seat per org)
 24 account    a statement on accounts outside src/accounts.js (Control reading an account by email) -> account
 25 org-door   addressServes( (the org the address serves) called from a route other than the sign-in's module -> org-door
 26 scope      the browser session's seat with the address's org taken out (sprint 7, 7.4: any org's seat) -> scope + allowlist
 27 account    an account's passphrase set from Control (an admin writing the account, the squatting door) -> account
  (sprint 7, 7.2 — sign-up by allowlist: only the operator allows an email)
 28 signup     Control mints a sign-up code (an admin allowing an email: INSERT INTO signup_codes from admin.js) -> signup
               (the statement outside src/accounts.js, and the insert itself: each a miss)
 29 signup     a sign-up code minted inside src/accounts.js itself, as an unused constant (the text alone is the miss)  -> signup
 30 signup     an open code read by its hash from a route other than the sign-up (a code-lookup oracle in index.js) -> signup
 31 scope      the reset's session end without its account bound (every account's sessions)    -> scope + allowlist
  (sprint 7, 7.3 — create an org: the one path that writes an org row)
 32 orgrow     Control renames the org (an UPDATE of the org table from admin.js)              -> orgrow
 33 orgrow     a second door that inserts an org row (index.js), a statement constant never run   -> orgrow
 34 org-door   foundingEnv( (the env of an org being created) called from Control                -> org-door
  (sprint 12, 12.3 — the invite link: an org's admin mints for their own org's seats, POST /signup spends)
 35 invite     a second door that mints an invite link (index.js), a statement constant never run -> invite
 36 invite     the mint with its org taken out (src/admin.js INVITE_MINT_SQL: any org's seat)    -> invite + scope
 37 invite     a link read by its token's hash from a route other than the sign-up (index.js)   -> invite
and that a comment or a string naming `.DB`, `signIn(`, `.BRAIN` or an R2 key mid-text is never read as code (no false red).
Exit 0 when all hold.
"""
import os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = os.path.join(ROOT, "tools", "check-scoped-data.py")
fails = 0


def run(src):
    r = subprocess.run([sys.executable, CHECK, "--src", src], capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def ok(cond, what):
    global fails
    print(("  ✓ " if cond else "  ✗ ") + what)
    if not cond:
        fails += 1


def mutate(tmp, rel, old, new, count=1):
    p = os.path.join(tmp, rel)
    s = open(p, encoding="utf-8").read()
    assert s.count(old) >= 1, f"{rel}: the needle is gone ({old[:60]}…): update this selftest with the code"
    open(p, "w", encoding="utf-8").write(s.replace(old, new, count))


CASES = [
    ("raw binding in a reader", "knowledge/goals.js", "db(env).prepare(GOAL_TREE_SQL)", "env.DB.prepare(GOAL_TREE_SQL)", ["binding", "statement"]),
    ("a batch on a non-handle", "knowledge/screens.js", "await db(env).batch(", "await env.batchy.batch(", ["statement"]),
    ("the binding destructured", "week.js", "export async function readWeek(", "const { DB } = globalThis.env || {};\nexport async function readWeek(", ["binding"]),
    ("signIn from a reader", "build.js", "export async function readBuild(", "export function x(env, p) { return signIn(env, p); }\nexport async function readBuild(", ["org-door"]),
    ("platformEnv from a route", "mcp.js", "export async function callTool(", "const pe = (env) => platformEnv(env, 2);\nexport async function callTool(", ["org-door"]),
    ("6.1's subselect put back", "ask.js", "VALUES (?,?,?,?,?,?,?,?,?,?,?,{org})", "VALUES (?,?,?,?,?,?,?,?,?,?,?,(SELECT org FROM people WHERE id = ?3))", ["subselect", "insert"]),
    ("an events insert with no org", "openitems.js", "VALUES (?,?,?,'open',?,?,{org})", "VALUES (?,?,?,'open',?,?,NULL)", ["insert"]),
    # the constant and the call that runs it both live in accounts.js (mintSession, POST /login's session)
    ("a named insert constant with no org", "accounts.js", "SELECT ?,?,?,?,?,?,0,{org} \"", "SELECT ?,?,?,?,?,?,0,1 \"", ["insert"]),
    ("a render body read on the raw bucket", "knowledge/screens.js", "await store(env).get(renderKey(project, hash))", "await env.BRAIN.get(renderKey(project, hash))", ["storage"]),
    ("the bucket destructured", "week.js", "export async function readWeek(", "const { BRAIN } = globalThis.env || {};\nexport async function readWeek(", ["storage"]),
    ("a handoff key spelled in its writer", "handoff.js", "handoffKeyOf(isEval, now().slice(0, 7), id)", "`inbox/handoffs/${now().slice(0, 7)}/${id}.json`", ["storage"]),
    ("an org prefix spelled outside storage.js", "backup.js", "key: bucket.keyOf(key), counts, pages", "key: `o${1}/` + key, counts, pages", ["storage"]),
    ("a regex over an R2 key outside storage.js", "core.js", "export const isCronReport", "const OLD_REPORT_RE = /^renders\\/x\\//;\nexport const isCronReport", ["storage"]),
    ("storeOfRow from a reader", "extract.js", "export async function", "const anyOrg = (env, row) => storeOfRow(env, row);\nexport async function", ["org-door"]),
    ("an unscoped UPDATE on people", "admin.js", "UPDATE people SET title=? WHERE id=? AND org = {org}", "UPDATE people SET title=? WHERE id=?", ["scope"]),
    ("an unscoped DELETE through a wrapper", "admin.js", "DELETE FROM artifacts WHERE (group_tag='eval' OR title LIKE 'eval-%') AND org = {org}\")", "DELETE FROM artifacts WHERE (group_tag='eval' OR title LIKE 'eval-%')\")", ["scope"]),
    ("REPLACE INTO people with no org", "admin.js", "INSERT INTO people (id,name,email,role,lane,key_hash,pass_hash,pass_salt,active,pending,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,{org})",
     "REPLACE INTO people (id,name,email,role,lane,key_hash,pass_hash,pass_salt,active,pending,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ["insert", "scope"]),
    ("an id-only SELECT on people (finding 2)", "pickup.js", "FROM people WHERE id IN (SELECT value FROM json_each(?1)) AND org = {org}", "FROM people WHERE id IN (SELECT value FROM json_each(?1))", ["scope"]),
    ("the decider's name by id alone (finding 3)", "decisions.js", "SELECT name FROM people WHERE id = ? AND org = {org}", "SELECT name FROM people WHERE id = ?", ["scope"]),
    ("a people join on next_who with no org", "pickup.js", "LEFT JOIN people w ON w.id = t.next_who AND w.org = {org} WHERE", "LEFT JOIN people w ON w.id = t.next_who WHERE", ["people-join"]),
    ("an UPDATE in a lowercase local", "week.js", "export async function readWeek(",
     "export async function closeAll(env, id) { const q = \"UPDATE loops SET status='closed' WHERE id = ?\"; return db(env).prepare(q).bind(id).run(); }\nexport async function readWeek(", ["scope"]),
    ("a statement the checker cannot follow", "week.js", "export async function readWeek(",
     "export function runAny(env, s) { return db(env).prepare(s).all(); }\nexport async function readWeek(", ["unseen"]),
    ("a stale ALLOW_SCOPE entry", "oauth.js", "SELECT 1 AS x FROM tokens WHERE token_hash = ?", "SELECT 1 AS x FROM tokens WHERE token_hash = ? AND org = {org}", ["allowlist"]),
    ("a statement on accounts outside accounts.js", "admin.js", "export async function addProject(",
     "export async function accountOf(env, e) { return db(env).prepare(\"SELECT id, pass_hash FROM accounts WHERE email = ?\").bind(e).first(); }\nexport async function addProject(", ["account"]),
    ("addressServes from a route", "index.js", "function wantsHtml(request) {", "const servedHere = (url) => addressServes(url);\nfunction wantsHtml(request) {", ["org-door"]),
    ("the session's seat without the address's org", "accounts.js", "AND p.active = 1 AND p.org = ?3 \" +", "AND p.active = 1 \" +", ["scope", "allowlist"]),
    ("an account's passphrase set from Control", "admin.js", "flash = ACCOUNT_ELSEWHERE;",
     "flash = ACCOUNT_ELSEWHERE; await db(env).prepare(\"UPDATE accounts SET pass_hash = ? WHERE id = (SELECT account_id FROM people WHERE id = ? AND org = {org})\").bind(password, personId).run();", ["account"]),
    ("Control minting a sign-up code", "admin.js", "export async function addProject(",
     "export async function allowEmail(env, e, h) { return db(env).prepare(\"INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)\").bind(e, e, h, e, e).run(); }\nexport async function addProject(", ["signup"]),
    ("a sign-up code minted in accounts.js", "accounts.js", "export const SIGNUP_CODE_LENGTH = 20;",
     "export const SIGNUP_CODE_LENGTH = 20;\nexport const MINT_SQL = \"INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)\";", ["signup"]),
    ("an open code read by its hash from index.js", "index.js", "function wantsHtml(request) {",
     "const codeOwner = (env, h) => db(env).prepare(\"SELECT email FROM signup_codes WHERE code_hash = ?\").bind(h).first();\nfunction wantsHtml(request) {", ["signup"]),
    ("the reset's session end without its account", "accounts.js", "WHERE a.email = ?1 AND a.pass_hash IS NOT NULL) AND EXISTS", "WHERE a.pass_hash IS NOT NULL) AND EXISTS", ["scope", "allowlist"]),
    ("Control renaming the org", "admin.js", "export async function addProject(",
     "export async function renameOrg(env, n) { return db(env).prepare(\"UPDATE org SET name = ? WHERE id = {org}\").bind(n).run(); }\nexport async function addProject(", ["orgrow"]),
    ("a second door inserting an org row", "index.js", "function wantsHtml(request) {",
     "const MAKE_ORG_SQL = \"INSERT INTO org (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)\";\nfunction wantsHtml(request) {", ["orgrow"]),
    ("foundingEnv from Control", "admin.js", "export async function addProject(",
     "export const intoNew = (env, n) => foundingEnv(env, n);\nexport async function addProject(", ["org-door"]),
    ("a second door minting an invite link", "index.js", "function wantsHtml(request) {",
     "const MINT_LINK_SQL = \"INSERT INTO seat_invites (id, org, person_id, email, token_hash, seat_stamp, created_at, expires_at) VALUES (?1, {org}, ?2, ?3, ?4, ?5, ?6, ?7)\";\nfunction wantsHtml(request) {", ["invite"]),
    ("the invite mint with its org taken out", "admin.js", "\"SELECT ?1, {org}, p.id, lower(trim(p.email)), ?2, ?3, ?4, ?5, ?6 FROM people p WHERE p.id = ?7 AND p.org = {org} AND",
     "\"SELECT ?1, 1, p.id, lower(trim(p.email)), ?2, ?3, ?4, ?5, ?6 FROM people p WHERE p.id = ?7 AND", ["invite", "scope"]),
    ("an invite link read by its hash from index.js", "index.js", "function wantsHtml(request) {",
     "const linkOwner = (env, h) => db(env).prepare(\"SELECT email FROM seat_invites WHERE token_hash = ? AND org = {org}\").bind(h).first();\nfunction wantsHtml(request) {", ["invite"]),
]


def main():
    base = tempfile.mkdtemp(prefix="scoped-data-")
    try:
        clean = os.path.join(base, "clean")
        shutil.copytree(os.path.join(ROOT, "src"), clean)
        rc, out = run(clean)
        ok(rc == 0 and "✓ scoped data layer" in out, f"green on the tree as it stands (rc {rc})")
        # no false red: comments and strings naming the binding or a door are not code
        quiet = os.path.join(base, "quiet")
        shutil.copytree(clean, quiet)
        mutate(quiet, "week.js", "export async function readWeek(",
               "// env.DB.prepare(x) and signIn(env, p) in a comment; env.BRAIN.get(\"inbox/x\")\nconst NOTE = \"env.DB.prepare(sql) · signIn(env, row) · platformEnv(env, 1) · env.BRAIN · o1/renders/x\";\n"
               "const NOTE2 = `a body lies at o<org>/renders/<project>/<hash>, never at /renders/`;\n/* const { DB } = env; db.batch([]); const { BRAIN } = env; '/backups/' */\nexport async function readWeek(")
        rc, out = run(quiet)
        ok(rc == 0, f"a comment or a string naming .DB, signIn(, platformEnv(, .BRAIN or an R2 key mid-text stays green (rc {rc}){'' if rc == 0 else ': ' + out.strip()[:300]}")
        for name, rel, old, new, rules, *where in CASES:
            at = where[0] if where else rel
            t = os.path.join(base, re.sub(r"\W+", "-", name))
            shutil.copytree(clean, t)
            mutate(t, rel, old, new)
            rc, out = run(t)
            named = [r for r in rules if re.search(rf"{re.escape(at)}:(?:\d+:)? {r} ", out)]
            ok(rc == 1 and len(named) == len(rules), f"RED on {name} ({rel}): rc {rc}, rule(s) {', '.join(rules)} named: {len(named)}/{len(rules)}")
    finally:
        shutil.rmtree(base, ignore_errors=True)
    print(f"{'✓' if not fails else '✗'} check-scoped-data selftest: {len(CASES) + 2 - fails} of {len(CASES) + 2} hold")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
