# tools/lib-mint-seat.sh — ring 2 (Q65300E50 / B6g, owner-ruled 2026-09-22): "here we have ryuklabs
# org … this we can access because it's a dev setup and our own org to build sharingu." The dev org
# is ryuklabs, ALWAYS — never selected by AGENT_R_ENV_PREFIX/--org any more (that stopped choosing
# whose KEYS to read). Needs ONLY CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (the three-line
# sharingu env, tools/lib.sh) — no pool file, no person's password, no named person's key anywhere
# in this file.
#
# FIXED SEATS (Q974E7924, 2026-09-22, round r83 — heal of the ORIGINAL per-run design below this
# comment used to describe): five PERMANENT people, `eval-fixed-<role>` for the five roles every live
# suite mints — owner · member · leader · thiyag · tester — created ONCE (idempotent: INSERT OR
# IGNORE) and INACTIVE between runs. `mint_all` activates them and stamps a FRESH key for this run
# only; `mint_cleanup` clears the key (never a delete) and deactivates; `mint_sweep` clears any of the
# five that a crashed run left active+keyed, before this run mints its own.
#
# WHY: the OLD design (`eval-run-<runid>-<label>`, a brand-new person row minted every run) is the
# root cause a whole migration batch (migrate-030a.sql, B3-heal, 2026-09-22) had to repair: mint_sweep
# and mint_cleanup below used to DELETE those rows outright, and DELETE never chased the rows a run
# had ALSO filed under that person's id (tokens, loops, events, artifacts) — 96 orphaned rows measured
# live on ryuklabs the day this was found, 28 distinct missing person ids. A DELETE-based cleanup can
# never be made safe against a schema that (correctly, as of this same PR) enforces those references
# as real FOREIGN KEYs — the only fix that holds is to stop deleting identities at all. Fixed seats
# that are DEACTIVATED, never removed, can never orphan anything they filed: the row that filed it
# stays, forever, satisfying the FK on every table that names it.
#
# Findable by name: `eval-fixed-<role>` (role ∈ owner|member|leader|thiyag|tester). No per-run suffix
# any more — there is exactly one row per role, always, on every org this file has ever minted into.
#
# LOCAL MODE (Q9CF32D8F, 2026-09-25): with MINT_MODE=local (set by tools/lib.sh when the suite targets the local
# R — the default) every function here writes the same SQL into the LOCAL D1 instead, and the URL is the local R's
# own; MINT_MODE unset/live keeps every byte of the live path below.
#
# THE SUITES' OWN ORG (sprint 6, 6.6; docs/plan/PLATFORM.md §3: "the eval seats would be owners of the whole database"): the
# seats live in a DEDICATED org, never in org 1 — the org whose row carries settings {"suites": true} (never org 1), made here
# when the database holds none (its id the next free one), with an EVAL project per MINT_PROJECTS slug only where the database
# holds none yet: its FIRST slug (a fresh local org: tools/lib.sh seeds the suites' org and its fixture projects first, so this is
# a no-op there). Their filings land there, so no real screen of org 1 can show a suite's row, eval mark or not. The seats are
# NEW identities (eval-fixed-suites-<role>): the five eval-fixed-<role> rows an older mint left in org 1 on live stay there,
# inactive, untouched (their filings are org 1's rows; moving the people would leave those rows naming a person across the
# wall). mint_sweep still deactivates those five (by id) should one ever be found active.
#
# Sourced by: tools/lib.sh (evals.sh, sims.sh), tools/tabs-verify.sh, tools/verify-live.sh,
# tools/ship.sh (the ryuklabs smoke leg only); none needed a call-site change (same function names, same exported variable
# names: U K EVALKEY VASUKEY THIYAGKEY TESTKEY RYUKLABS_EVALSEAT_EMAIL MINT_RUN_PIDS; and, sprint 6, the seats' own
# MINT_OWNER_EMAIL MINT_LEADER_EMAIL MINT_MEMBER_ID, which the suites sign in and aim with).

MINT_DB="ryuklabs-agent-r"
MINT_UA="sharingu-agent-r-mint/1.0 (+https://github.com/ryuk-labs/sharingu)"
# NAMED GAP, proven live while testing this file (2026-09-22): `mint_cleanup` below iterates
# `for _pid in $MINT_RUN_PIDS` UNQUOTED — correct under every REAL caller (`sh some-script.sh`, i.e.
# bash 3.2 on this Mac, which word-splits on IFS as always) and the SAME idiom this file's own
# pre-heal design already relied on. Sourcing this file directly from an INTERACTIVE zsh shell
# instead (zsh does not word-split an unquoted expansion by default) silently collapses the loop to
# ONE iteration with the whole string as a single id, producing a single UPDATE whose WHERE clause
# matches no row at all — measured live, caught only by re-checking the dev org read-only afterward.
# Never a live-suite risk (every caller is `sh`), but source this file from `sh`/bash, never zsh.
MINT_RUN_PIDS="eval-fixed-suites-owner eval-fixed-suites-member eval-fixed-suites-leader eval-fixed-suites-thiyag eval-fixed-suites-tester"
MINT_ACTIVATED_AT=""   # set by mint_all; mint_cleanup revokes only tokens created at/after this moment
# MINT_PROJECTS — THE ONE LIST of projects the fixed eval seats are seated on (owner ruling QB54D2BC4, 2026-09-25:
# steer clear of other projects; batch eval-seat-scope, C4d): the SLUGS of the suites' own org's workspaces (sprint 6: inside the
# suites' org — o<id>--<slug> — never org 1's), and nothing else. It lives
# HERE, not in tools/lib.sh, because tools/ship.sh sources this file WITHOUT lib.sh. tools/lib.sh's pick_project and
# evals.sh E238 read this variable — never a second literal. An EMPTY list makes mint_all refuse before any D1 write.
MINT_PROJECTS="sharingu ryuklabs"

# mint_resolve_url — the ryuklabs worker's own workers.dev URL, resolved LIVE from the Cloudflare
# account every time (never stored, never read from any file) — the same subdomain lookup
# tools/new-org.sh already makes to write a freshly-minted org's URL. Prints nothing and returns
# non-zero on any failure (bad token, missing scope, network) — the caller decides how loud to be.
mint_resolve_url() {
  # LOCAL (MINT_MODE=local, set by tools/lib.sh's suite_local_up — Q9CF32D8F): the local R's own loopback URL,
  # read from its port file by the caller; no Cloudflare API call at all.
  if [ "${MINT_MODE:-}" = "local" ]; then [ -n "${MINT_LOCAL_URL:-}" ] || return 1; printf '%s' "$MINT_LOCAL_URL"; return 0; fi
  _sub=$(curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "User-Agent: $MINT_UA" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain" \
    | python3 -c "import sys,json
try: print((json.load(sys.stdin).get('result') or {}).get('subdomain',''))
except Exception: print('')" 2>/dev/null)
  [ -n "$_sub" ] || return 1
  printf 'https://ryuklabs-agent-r.%s.workers.dev' "$_sub"
}

# mint_d1 <sql-file> — one wrangler d1 execute --remote call against the dev org's own D1, quiet on
# success, the raw wrangler output on failure (so a scope/permission error reads as itself, never a
# silent no-op — Q65300E50's own "absence is not evidence" law).
# MINT_MODE=local: the SAME SQL against the local R's own D1 (`--config <local cfg> --local --persist-to <dir>`,
# the rl_seed pattern in tools/lib-r-local.sh) — no credentials, no network. The live line is unchanged.
mint_d1() {
  if [ "${MINT_MODE:-}" = "local" ]; then
    npx --no-install wrangler d1 execute "$MINT_DB" --config "$MINT_LOCAL_CFG" --local --persist-to "$MINT_LOCAL_PERSIST" --file "$1" </dev/null
    return
  fi
  npx --yes wrangler d1 execute "$MINT_DB" --remote --file "$1" </dev/null
}

# mint_sweep — a fixed seat is meant to be INACTIVE between runs; one found ACTIVE here means a prior
# run crashed before its own mint_cleanup trap could fire (the Mini load budget runs suites serially,
# never parallel — memory: "Mini load budget"). Deactivates + clears the key/password on any of the
# five fixed seats currently active (so a stale key from a dead run is never still live when THIS
# run's mint_all is about to hand out a fresh one), and revokes any of their tokens more than 6h old
# — the same "6h" idiom the old per-run sweep used, now aimed at clearing STALE CREDENTIALS on a
# permanent identity rather than deleting the identity itself. Best-effort and silent on a
# Cloudflare-side failure (housekeeping, never the gate) — mint_all below still fails loudly if the
# SAME token can't mint either.
# U-READY-e (2026-09-29): it also DELETEs every project_seats row of eval-fixed-tester — the one fixed seat that is
# seatless by design (mint_all never seats it). A readiness walk may grant it ONE seat mid-run (U-READY-a D10); a
# run that crashed before undoing that grant is backstopped here. Scoped by id to the tester alone, so it is a no-op
# on a clean ledger; mint-scope-selftest check f proves the line and that no other person is named.
mint_sweep() {
  _sql=$(mktemp "${TMPDIR:-/tmp}/mint-sweep-XXXXXX.sql")
  cat > "$_sql" <<SQL
UPDATE people SET active = 0,
  key_hash = 'swept-key:' || id || ':' || lower(hex(randomblob(8))),
  pass_hash = NULL, pass_salt = NULL
WHERE id IN ('eval-fixed-suites-owner','eval-fixed-suites-member','eval-fixed-suites-leader','eval-fixed-suites-thiyag','eval-fixed-suites-tester',
  'eval-fixed-owner','eval-fixed-member','eval-fixed-leader','eval-fixed-thiyag','eval-fixed-tester')
  AND active = 1;
UPDATE tokens SET revoked = 1
WHERE person_id IN ('eval-fixed-suites-owner','eval-fixed-suites-member','eval-fixed-suites-leader','eval-fixed-suites-thiyag','eval-fixed-suites-tester')
  AND revoked = 0 AND created_at < datetime('now','-6 hours');
DELETE FROM project_seats WHERE person_id='eval-fixed-suites-tester';
SQL
  if mint_d1 "$_sql" >/tmp/mint-sweep-out.$$ 2>&1; then
    echo "  (mint: swept any fixed seat a crashed run left active, any of their tokens older than 6h, and any seat the tester was left holding)"
  else
    echo "  ⚠ mint: sweep could not reach the dev org's D1 (see mint_all's own error below for the reason)"
  fi
  rm -f "$_sql" /tmp/mint-sweep-out.$$
}

# mint_all — ensures the five FIXED people exist (once, ever — INSERT OR IGNORE, so a real org's own
# hand-edits to name/lane/title after day-0 are never clobbered by a later run), then activates them
# and stamps a FRESH key + password for THIS run only, and makes sure each seated role carries a seat on
# every ACTIVE project NAMED ON MINT_PROJECTS — ryuklabs' own workspaces only, never another project
# (QB54D2BC4; idempotent — ON CONFLICT DO NOTHING, so a seat already there keeps its role). Because ON
# CONFLICT DO NOTHING never REMOVES a seat, each seated fixed id first gets ONE scoped prune:
# `DELETE FROM project_seats WHERE person_id=<eval-fixed-id> AND project_key NOT IN (<MINT_PROJECTS>)` —
# it clears the seats an older, unscoped mint left on other projects (bunny, saruspay, …) and any seat a
# crashed run's mid-run grant left behind. The prune names ONLY the eval-fixed-* ids, never a real person
# (rl-owner-0001 or anyone else), and it deletes SEATS, never an identity — the FIXED SEATS doctrine above
# (no person row is ever deleted, so nothing they filed is ever orphaned) is unchanged. An empty
# MINT_PROJECTS returns 1 before any D1 write (never an `IN ()`). Sets the SAME variable
# names the suites already read: U K EVALKEY VASUKEY THIYAGKEY TESTKEY RYUKLABS_EVALSEAT_EMAIL.
#
# The non-secret shape per role (name/lane/title/trace_consent/seats) is the SAME hardcoded literal
# set the old per-run design carried — copied ONCE, by hand, from a read-only SELECT of ryuklabs' own
# D1 taken on 2026-09-22 (never key_hash/pass_hash/pass_salt, never a guess): the real owner
# (rl-owner-0001, role owner lane all), "Eval Seat" (role internal-eng lane code — evals.sh's E192b
# checks for this exact display name), "Test Leader" (role leader lane decisions — sims.sh's S4/S6/S7
# name it explicitly), "Rein" (role internal-eng lane code,design, the CTO stand-in). Drift is caught
# by the board's `probes/mint_shape_drift.py`, not by a live read in this file. Returns non-zero and
# prints exactly why on any failure (URL resolution, or the D1 write).
mint_all() {
  [ -n "$(printf '%s' "${MINT_PROJECTS:-}" | tr -d '[:space:]')" ] || { echo "  ✗ mint: MINT_PROJECTS is empty — refusing to seat the eval seats on nothing (or everything)"; return 1; }
  U="$(mint_resolve_url)" || { echo "  ✗ mint: could not resolve the ryuklabs worker URL (Cloudflare workers/subdomain read failed — token scope?)"; return 1; }
  _sql=$(mktemp "${TMPDIR:-/tmp}/mint-all-XXXXXX.sql")
  _out=$(mktemp "${TMPDIR:-/tmp}/mint-all-out-XXXXXX.json")
  if ! MINT_SQL="$_sql" MINT_OUT="$_out" MINT_PROJECTS="$MINT_PROJECTS" python3 <<'PY'
import hashlib, json, os, secrets, datetime, sys
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
sql, out = [], {}

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

# the ONE scope (MINT_PROJECTS, this file's header) — order kept, duplicates dropped; empty is a hard refusal
scope = list(dict.fromkeys(os.environ.get("MINT_PROJECTS", "").split()))
if not scope:
    sys.exit("  ✗ mint: MINT_PROJECTS is empty")
inlist = "(" + ",".join(q(k) for k in scope) + ")"

def qn(s):  # NULL (never the 4-char string 'None') for an absent non-secret column
    return "NULL" if s is None else q(s)

# THE SUITES' OWN ORG (sprint 6, this file's header): the org marked settings.suites, never org 1. Made when the database holds
# none (the next free id), with an EVAL project for MINT_PROJECTS' first slug when the org holds none of the list's; every
# statement below names the org by this one subquery, so nothing is written into org 1 (or any org but the suites').
EORG = "(SELECT id FROM org WHERE id <> 1 AND json_extract(settings, '$.suites') = 1 ORDER BY id LIMIT 1)"
SCOPED = f"(SELECT key FROM projects WHERE org = {EORG} AND slug IN {inlist})"
sql.append(
    "INSERT INTO org (id, name, settings, created_at, updated_at) SELECT n, 'Suites', '{\"suites\":true}', "
    f"{q(now)}, {q(now)} FROM (SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org) WHERE NOT EXISTS (SELECT 1 FROM org WHERE id <> 1 AND json_extract(settings, '$.suites') = 1);"
)
# sprint 8 (8.2f, main's ruling): the suites' org rides the local-only plan WHERE the database holds it (a local seed's row,
# tools/fixtures/local-plan.sql); live holds no 'local' row, so there this changes nothing and the org keeps its plan
sql.append(f"UPDATE org SET plan = 'local' WHERE id = {EORG} AND EXISTS (SELECT 1 FROM plan_limits WHERE plan = 'local');")
sql.append(
    f"INSERT INTO projects (key, name, active, created_at, eval) SELECT 'o' || {EORG} || char(45, 45) || {q(scope[0])}, {q(scope[0].capitalize())}, 1, {q(now)}, 1 "
    f"WHERE NOT EXISTS (SELECT 1 FROM projects WHERE org = {EORG} AND slug IN {inlist});"
)

def mint(pid, person_role, seat_role, label, name, lane, title=None, trace_consent=None, seats=True):
    # bare key — TOKEN_PREFIX is "" (src/tenant.js, owner ruling 2026-09-03), the shape every seed mints
    key = secrets.token_hex(20)
    kh = hashlib.sha256(key.encode()).hexdigest()
    salt = secrets.token_hex(16)
    ph = hashlib.pbkdf2_hmac("sha256", key.encode(), bytes.fromhex(salt), 100000, 32).hex()
    email = f"{pid}@ryuklabs.local"
    assert pid.startswith("eval-fixed-suites-"), pid   # the suites' own seats, never an older mint's org-1 rows
    # 1. ensure the FIXED identity exists in the suites' org — ONCE, ever. A placeholder key_hash guaranteed unique and
    #    never a real key's hash (it is overwritten by step 2 in the SAME transaction-order file
    #    immediately below, every single run, so this branch only ever fires the very first time).
    sql.append(
        "INSERT OR IGNORE INTO people (id,name,email,role,key_hash,active,created_at,lane,title,trace_consent,org) VALUES "
        f"({q(pid)},{q(name)},{q(email)},{q(person_role)},{q('unset-key:'+pid)},0,{q(now)},{qn(lane)},{qn(title)},{qn(trace_consent)},{EORG});"
    )
    # 2. activate + stamp THIS run's own fresh key/password over the (possibly just-inserted,
    #    possibly years-old) row — every run, by id, and only while it is a person of the suites' org.
    sql.append(
        "UPDATE people SET active=1, key_hash=%s, pass_hash=%s, pass_salt=%s WHERE id=%s AND org = %s;" % (q(kh), q(ph), q(salt), q(pid), EORG)
    )
    # seats=False (the real Test Leader's own shape): ZERO project_seats rows — a bare key on a
    # MULTI-seat org must name the project explicitly; the real Test Leader carries none at all.
    # Seated roles: prune every seat OUTSIDE MINT_PROJECTS of the suites' org first (this eval-fixed id only), then seat on
    # the active projects INSIDE it. Never an unscoped `FROM projects WHERE active=1` again.
    if seats:
        sql.append(
            f"DELETE FROM project_seats WHERE person_id={q(pid)} AND project_key NOT IN {SCOPED};"
        )
        sql.append(
            "INSERT INTO project_seats (person_id,project_key,role,created_at) SELECT "
            f"{q(pid)},key,{q(seat_role)},{q(now)} FROM projects WHERE active=1 AND org = {EORG} AND slug IN {inlist} "
            "ON CONFLICT(person_id,project_key) DO NOTHING;"
        )
    out[label] = {"id": pid, "key": key, "email": email}

# name/lane/title/trace_consent/seats below are HARDCODED LITERALS (see this function's own header
# docstring above) — never invented, never re-read at run time.
mint("eval-fixed-suites-owner",  "owner",        "owner",  "owner",  "Eval Run Owner",   "all",          trace_consent="off")
mint("eval-fixed-suites-member", "internal-eng", "member", "member", "Eval Seat",        "code",         trace_consent="off")
mint("eval-fixed-suites-leader", "leader",       "member", "leader", "Eval Run Leader",  "decisions")
mint("eval-fixed-suites-thiyag", "internal-eng", "member", "thiyag", "Eval Run Thiyag",  "code,design")
mint("eval-fixed-suites-tester", "leader",       "member", "tester", "Test Leader",      "decisions", seats=False)

open(os.environ["MINT_SQL"], "w").write("\n".join(sql) + "\n")
json.dump({"minted": out, "activatedAt": now}, open(os.environ["MINT_OUT"], "w"))
PY
  then
    echo "  ✗ mint: could not build the seat SQL (see above)"
    rm -f "$_sql" "$_out"
    return 1
  fi
  if ! mint_d1 "$_sql"; then
    echo "  ✗ mint: the dev org's D1 refused the insert (see the wrangler error above — most likely the sharingu CLOUDFLARE_API_TOKEN lacks D1 scope; re-minting it is the owner's verb, never a pool fallback)"
    rm -f "$_sql" "$_out"
    return 1
  fi
  rm -f "$_sql"
  K=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['owner']['key'])")
  EVALKEY=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['member']['key'])")
  RYUKLABS_EVALSEAT_EMAIL=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['member']['email'])")
  VASUKEY=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['leader']['key'])")
  THIYAGKEY=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['thiyag']['key'])")
  TESTKEY=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['tester']['key'])")
  MINT_ACTIVATED_AT=$(python3 -c "import json;print(json.load(open('$_out'))['activatedAt'])")
  MINT_OWNER_EMAIL=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['owner']['email'])")
  MINT_LEADER_EMAIL=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['leader']['email'])")
  MINT_MEMBER_ID=$(python3 -c "import json;print(json.load(open('$_out'))['minted']['member']['id'])")
  export U K EVALKEY RYUKLABS_EVALSEAT_EMAIL VASUKEY THIYAGKEY TESTKEY MINT_RUN_PIDS MINT_ACTIVATED_AT MINT_OWNER_EMAIL MINT_LEADER_EMAIL MINT_MEMBER_ID
  rm -f "$_out"
  echo "  (mint: 5 fixed seat(s) activated in $MINT_DB for this run, in the suites' own org (settings.suites, never org 1) — owner · member · leader · thiyag · tester; seated on its: $MINT_PROJECTS)"
  return 0
}

# mint_cleanup — clears the KEY only (never a delete, never even for a person this run itself just
# created for the very first time): key_hash is reset to a fresh, unique, unusable placeholder
# (never a real key's sha256 — 'cleared-key:<id>:<random>'), pass_hash/pass_salt are cleared to NULL
# (both columns are nullable — a fixed seat with a cleared password cannot pass /login's own `person
# && person.pass_hash && person.pass_salt` check even if the row's `active` flag were somehow still
# 1), and the row is deactivated. Also revokes exactly the tokens THIS run's own activity could have
# minted (any token issued via /login or /sso/enter to one of the five fixed seats at or after this
# run's own mint_all activation moment) — a fixed identity is shared across runs, so "this run's
# tokens" must be scoped by TIME, never by a per-run id the way the old design could. Idempotent (safe
# to call more than once) and silent on a Cloudflare-side failure (a trap must never itself abort a
# script that is already exiting) — the NEXT run's mint_sweep is the backstop either way.
mint_cleanup() {
  [ -n "$MINT_RUN_PIDS" ] || return 0
  _sql=$(mktemp "${TMPDIR:-/tmp}/mint-cleanup-XXXXXX.sql")
  {
    for _pid in $MINT_RUN_PIDS; do
      printf "UPDATE people SET active=0, key_hash='cleared-key:%s:'||lower(hex(randomblob(8))), pass_hash=NULL, pass_salt=NULL WHERE id=%s;\n" "$_pid" "'$_pid'"
    done
    if [ -n "$MINT_ACTIVATED_AT" ]; then
      printf "UPDATE tokens SET revoked=1 WHERE created_at >= %s AND person_id IN ('eval-fixed-suites-owner','eval-fixed-suites-member','eval-fixed-suites-leader','eval-fixed-suites-thiyag','eval-fixed-suites-tester');\n" "'$MINT_ACTIVATED_AT'"
    fi
  } > "$_sql"
  if mint_d1 "$_sql" >/tmp/mint-cleanup-out.$$ 2>&1; then
    echo "  (mint: this run's key(s) cleared and seat(s) deactivated — no person deleted)"
  else
    echo "  ⚠ mint: could not clear this run's key(s) live — the next mint_sweep will catch them"
  fi
  rm -f "$_sql" /tmp/mint-cleanup-out.$$
}
