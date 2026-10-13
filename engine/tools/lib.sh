# tools/lib.sh — the ONE harness for the suites (product pass 2026-09-05, M-ADR-024 Wave 5; re-cut 2026-09-22, B6g /
# Q65300E50 — THE THREE RINGS; D5 Part 5, sprint 3: a fresh local org per run, its fixtures filed through preview then
# file — suite_local_up below). Sourced by evals.sh, sims.sh, tools/tabs-verify.sh, tools/verify-live.sh and
# tools/residue-audit.sh (`. "$(dirname "$0")/tools/lib.sh"`): credentials, the target, the org and its fixtures, the
# minted seats, the chk/code/sk counters and the self-clean — one file, not five near-identical copies.
#
# RING 1 — sharingu's own env is THREE LINES (GH_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID),
# sourced from ${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}. Nothing else is sharingu's — no
# pool file (`~/.sharingu/credentials.env`) is read here, ever, by any code path.
# RING 2 — the dev org is ryuklabs, ALWAYS. AGENT_R_ENV_PREFIX / --org no longer select whose KEYS to
# read (owner ruling: "sharingu env file don't hold the access of the users and projects … here we
# have ryuklabs org … this we can access because it's a dev setup and our own org to build
# sharingu"). Every run MINTS the short-lived seats it needs straight into ryuklabs' own D1 (the
# tools/lib-mint-seat.sh) and removes them on exit, failure paths included.
# RING 3 — no other org's credential is read here: not SIRU_*/VEIL_*/BUNNY_*, not a person's
# password, not a named person's key. Every other org is PROD and belongs to that org.
[ -f "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}" ] && { set -a; . "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}"; set +a; }
# THE TARGET (owner ruling Q9CF32D8F, 2026-09-25: "test it locally before we put it into the worker"; MCQ
# "wrangler dev --local"): every suite runs against a LOCAL org BY DEFAULT — the same src/index.js under
# `wrangler dev --local` (tools/r-local.sh, org `ryuklabs-local`, D1/R2/KV on disk), which costs the Cloudflare
# free tier nothing. `--live` (or SUITE_TARGET=live) is the explicit opt-in for the real ryuklabs worker, and
# every live run calls tools/cf-budget.sh FIRST — before the seat mint writes a single live row.
SUITE_TARGET="${SUITE_TARGET:-local}"
for _a in "$@"; do [ "$_a" = "--live" ] && SUITE_TARGET=live; done
case "$SUITE_TARGET" in local|live) ;; *) echo "  ✗ SUITE_TARGET=$SUITE_TARGET — must be local or live"; exit 2;; esac
export SUITE_TARGET
P="RYUKLABS"   # fixed — naming only (.runs/<suite>-ryuklabs.json, DBNAME) — never a credential selector any more
[ -n "${AGENT_R_ENV_PREFIX:-}" ] && [ "$AGENT_R_ENV_PREFIX" != "RYUKLABS" ] && echo "  (AGENT_R_ENV_PREFIX=$AGENT_R_ENV_PREFIX is ignored — every live suite targets the dev org, ryuklabs, only; Q65300E50)"
# run_teed — capture a suite's own stdout to .runs/<suite>-<tenant>.log so write_last_run can derive per-test
# results (M-ADR-037). The suite re-executes itself ONCE under tee; the inner run's exit code is preserved.
if [ -z "$AR_RUN_LOG" ] && [ -n "$0" ] && case "$(basename "$0" .sh)" in evals|sims) true;; *) false;; esac; then   # the two suites only — never a slice's temp script
  _suite="$(basename "$0" .sh)"; _dir="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$_dir/.runs" 2>/dev/null
  AR_RUN_LOG="$_dir/.runs/$_suite-$(printf %s "$P" | tr 'A-Z_' 'a-z-').log"; export AR_RUN_LOG
  { AR_RUN_LOG="$AR_RUN_LOG" sh "$0" "$@"; echo "$?" > "$AR_RUN_LOG.rc"; } 2>&1 | tee "$AR_RUN_LOG"
  _rc=$(cat "$AR_RUN_LOG.rc" 2>/dev/null || echo 1); rm -f "$AR_RUN_LOG.rc"; exit "$_rc"
fi
DBNAME="$(printf %s "$P" | tr 'A-Z_' 'a-z-')-agent-r"
WORKERNAME="$DBNAME"
CF_TOKEN="$CLOUDFLARE_API_TOKEN"; CF_ACCOUNT="$CLOUDFLARE_ACCOUNT_ID"
# Resolve THIS file's own directory via $BASH_SOURCE (not $0 — a composed --only slice runs from
# /tmp with $0 rewritten only in ITS OWN header text, never inside a separately-sourced file like
# this one; $0's dirname would silently resolve to /tmp there). Falls back to $0 for a non-bash sh.
_libself="${BASH_SOURCE:-$0}"
. "$(cd "$(dirname "$_libself")" && pwd)/lib-mint-seat.sh"
. "$(cd "$(dirname "$_libself")" && pwd)/lib-logout-ruling.sh"   # E232g's one verdict (evals.sh), shared with its gate selftest
# suite_local_up — the suites start the way the smoke starts (tools/smoke.sh): a FRESH local org every run, its data filed
# through the door. TWO ORGS in its one database (sprint 6, 6.6; docs/plan/PLATFORM.md §3): org A, org 1, the "real" org a
# suite never writes in, and org B, THE SUITES' OWN ORG (settings {"suites": true}: tools/lib-mint-seat.sh mints the eval seats
# there), so every suite runs beside a second org and no real screen of org 1 can show a suite's row. Step by step, when no
# local org for SUITE_LOCAL_SLUG is up:
#   1 drop the org's state dir (R_LOCAL_STATE_ROOT/<slug>: its D1, R2, KV, keys and port) — nothing carries over;
#   2 seed org A (tools/r-local.sh seed --seed <file>: boot.sql, one owner, the org row) with ONE project per file under
#     tools/suites/orga/ (the file's `project` and `name`), and only those;
#   3 start it (tools/r-local.sh up: wrangler dev --local on R_LOCAL_PORT_BASE and up, D1/R2/KV on disk);
#   3b seed org B, the suites' org, into the same D1 (org 2: its row marked suites, its own owner — a fresh key in the org dir's
#     suites.env, mode 600, never printed — and ONE eval project per fixture file under tools/suites/fixtures/, keyed
#     o2--<project>);
#   4 file the fixtures through the door: tools/suites/load-fixtures.mjs previews then files each file's items — org A's as
#     org 1's owner (credentials.env), the suites' as org B's owner (suites.env); a fixture names its project by its slug,
#     which the door resolves inside the filer's org. No publish, no R2 write, no brain read.
# A local org already up (the slice loop: SUITE_LOCAL_KEEP=1 kept it) is reused as it is: no reseed, no second load. Then the
# harness is bound to it: U=http://127.0.0.1:<port>, MINT_MODE=local (tools/lib-mint-seat.sh execs `--local --persist-to`),
# DBNAME = the local config's own database_name. State lives per checkout under .runs/r-local/ (never ~/.sharingu). The
# local config is generated from THIS repo's wrangler.jsonc (R_LOCAL_CONFIG_SRC — the real ryuklabs bindings, LOGIN_LIMIT
# included; ids swapped for local ones, crons stripped). Sets SUITE_LOCAL_STARTED when THIS run started it, so the exit
# trap stops only what this run started.
_eng="$(cd "$(dirname "$_libself")/.." && pwd)"
SUITE_LOCAL_SLUG="${SUITE_LOCAL_SLUG:-ryuklabs-local}"
SUITE_FIXTURES="${SUITE_FIXTURES:-$_eng/tools/suites/fixtures}"
SUITE_ORGA_FIXTURES="${SUITE_ORGA_FIXTURES:-$_eng/tools/suites/orga}"
SUITE_LOCAL_STARTED=""
suite_local_up() {
  R_LOCAL_STATE_ROOT="${R_LOCAL_STATE_ROOT:-$_eng/.runs/r-local}"; R_LOCAL_CONFIG_SRC="$_eng/wrangler.jsonc"
  export R_LOCAL_STATE_ROOT R_LOCAL_CONFIG_SRC
  printf '%s' "$SUITE_LOCAL_SLUG" | grep -qE '^[a-z0-9][a-z0-9-]*$' || { echo "  ✗ SUITE_LOCAL_SLUG must be lowercase [a-z0-9-]: '$SUITE_LOCAL_SLUG'"; return 1; }
  _ldir="$R_LOCAL_STATE_ROOT/$SUITE_LOCAL_SLUG"; mkdir -p "$_ldir"
  _lpid="$(cat "$_ldir/wrangler.pid" 2>/dev/null)"
  if [ -n "$_lpid" ] && kill -0 "$_lpid" 2>/dev/null; then
    echo "  (local org: reusing $SUITE_LOCAL_SLUG, already up — pid $_lpid; its fixtures were filed when it started)"
  else
    # 1 — a fresh org: the slug's whole state dir goes (the slug is checked above, so this never leaves R_LOCAL_STATE_ROOT)
    rm -rf "$_ldir"; mkdir -p "$_ldir"
    # 2 — seed org A with one project per file of its own (key and name read off the file), and only those
    . "$_eng/tools/lib-r-local.sh"
    rl_write_default_manifest "$(rl_slug_title "$SUITE_LOCAL_SLUG")" "$_ldir/manifest.json"
    python3 - "$SUITE_LOCAL_SLUG" "$_ldir/manifest.json" "$SUITE_ORGA_FIXTURES" "$_ldir/seed.suites.json" <<'PYSEED' || { echo "  ✗ could not write the suite seed (a fixture file is not JSON?)"; return 1; }
import glob, json, os, sys
slug, manifest, fxdir, out = sys.argv[1:5]
projects = []
for f in sorted(glob.glob(os.path.join(fxdir, "*.json"))):
    fx = json.load(open(f))
    if fx.get("project") and fx["project"] not in [p["key"] for p in projects]:
        # org A's own project: a real one (no eval mark) — the suites never write here (their seats are org B's)
        projects.append({"key": fx["project"], "name": fx.get("name") or fx["project"], "registry_ptr": ""})
json.dump({"org": slug, "owner": {"name": "Local Owner", "email": "owner@" + slug + ".local"}, "projects": projects,
           "manifest": manifest}, open(out, "w"), indent=2)
PYSEED
    echo "  (local org: a fresh $SUITE_LOCAL_SLUG — seeding boot.sql, org A's owner and its project(s): $(python3 -c "import json,sys;print(', '.join(p['key'] for p in json.load(open(sys.argv[1]))['projects']) or 'none')" "$_ldir/seed.suites.json"))"
    env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID WRANGLER_SEND_METRICS=false \
      sh "$_eng/tools/r-local.sh" seed "$SUITE_LOCAL_SLUG" --seed "$_ldir/seed.suites.json" > "$_ldir/seed.log" 2>&1 \
      || { echo "  ✗ the local seed failed — see $_ldir/seed.log"; return 1; }
    # 3 — start it
    echo "  (local org: starting $SUITE_LOCAL_SLUG — wrangler dev --local, D1/R2/KV on disk at $_ldir/persist)"
    if ! env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID WRANGLER_SEND_METRICS=false \
         sh "$_eng/tools/r-local.sh" up "$SUITE_LOCAL_SLUG" > "$_ldir/up.log" 2>&1; then
      echo "  ✗ the local org did not come up — see $_ldir/up.log and $_ldir/dev.log"; tail -5 "$_ldir/up.log" 2>/dev/null | sed 's/^/    /'
      return 1
    fi
    SUITE_LOCAL_STARTED=1
    # 3b — org B, the suites' own org, in the same D1: its row (id 2: a fresh database holds org 1 alone), its owner (the key in
    # suites.env, mode 600, never printed) and one EVAL project per fixture file. Its eval seats are minted after (mint_all).
    _sdb="$(python3 -c "import json,re,sys;print(json.loads(re.sub(r'//[^\n]*','',open(sys.argv[1]).read()))['d1_databases'][0]['database_name'])" "$_ldir/wrangler.local.jsonc")"
    python3 - "$SUITE_FIXTURES" "$_ldir/suites-org.sql" "$_ldir/suites.env" <<'PYORGB' || { echo "  ✗ could not write the suites' org (a fixture file is not JSON?)"; return 1; }
import datetime, glob, hashlib, json, os, secrets, sys
fxdir, out, creds = sys.argv[1:4]
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
q = lambda v: "'" + str(v).replace("'", "''") + "'"
key = secrets.token_hex(20)
# sprint 8 (8.2f, main's ruling): the suites' org rides the local-only plan the seed wrote (tools/fixtures/local-plan.sql)
sql = [f"INSERT INTO org (id, name, settings, created_at, updated_at, plan) VALUES (2, 'Suites', '{{\"suites\":true}}', {q(now)}, {q(now)}, 'local');",
       f"INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('suites-owner-0001', 'Suites Owner', 'owner@suites.local', 'owner', {q(hashlib.sha256(key.encode()).hexdigest())}, 1, {q(now)}, 2);"]
seen = set()
for f in sorted(glob.glob(os.path.join(fxdir, "*.json"))):
    fx = json.load(open(f))
    if fx.get("project") and fx["project"] not in seen:
        seen.add(fx["project"])
        # a suite's project is a test run's own (eval: true): every row a suite files is eval-marked, and the eval mark is
        # accepted only on an eval project or from a test seat (G2, src/core.js evalMarkRefused); knowledge on an eval one only
        sql.append(f"INSERT INTO projects (key, name, active, created_at, eval) VALUES ('o2' || char(45, 45) || {q(fx['project'])}, {q(fx.get('name') or fx['project'])}, 1, {q(now)}, 1);")
open(out, "w").write("\n".join(sql) + "\n")
fd = os.open(creds, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, f"SUITES_AGENT_R_OWNER_KEY={key}\n".encode()); os.close(fd)
PYORGB
    if ! npx --no-install wrangler d1 execute "$_sdb" --config "$_ldir/wrangler.local.jsonc" --local --persist-to "$_ldir/persist" --file "$_ldir/suites-org.sql" </dev/null > "$_ldir/suites-org.log" 2>&1; then
      echo "  ✗ the suites' org did not seed — see $_ldir/suites-org.log"
      sh "$_eng/tools/r-local.sh" down "$SUITE_LOCAL_SLUG" >/dev/null 2>&1; SUITE_LOCAL_STARTED=""
      return 1
    fi
    echo "  (local org: org B, the suites' own org (2, settings.suites), its owner and its eval project(s): $(sed -n 's/^INSERT INTO projects .* VALUES (.o2. || char(45, 45) || .\([a-z0-9-]*\).,.*/o2--\1/p' "$_ldir/suites-org.sql" | paste -sd, - | sed 's/,/, /g'))"
    # 4 — the fixtures, through preview then each part's write tool: org A's as its owner, the suites' as theirs (the loader is part of this repo;
    # a tree without it — a selftest's throwaway copy of this file — starts the orgs with their seeds alone, and says so)
    if [ -f "$_eng/tools/suites/load-fixtures.mjs" ]; then
      if ! node "$_eng/tools/suites/load-fixtures.mjs" --url "http://127.0.0.1:$(cat "$_ldir/port")" --creds "$_ldir/credentials.env" --dir "$SUITE_ORGA_FIXTURES" \
        || ! node "$_eng/tools/suites/load-fixtures.mjs" --url "http://127.0.0.1:$(cat "$_ldir/port")" --creds "$_ldir/suites.env" --dir "$SUITE_FIXTURES"; then
        echo "  ✗ the fixtures did not file — the run stops (the local org is stopped)"
        sh "$_eng/tools/r-local.sh" down "$SUITE_LOCAL_SLUG" >/dev/null 2>&1; SUITE_LOCAL_STARTED=""
        return 1
      fi
    else
      echo "  (local org: no fixture loader in this tree — the orgs hold their seeds only)"
    fi
  fi
  MINT_MODE=local
  MINT_LOCAL_CFG="$_ldir/wrangler.local.jsonc"; MINT_LOCAL_PERSIST="$_ldir/persist"
  MINT_LOCAL_URL="http://127.0.0.1:$(cat "$_ldir/port")"
  MINT_DB="$(python3 -c "import json,re,sys;print(json.loads(re.sub(r'//[^\n]*','',open(sys.argv[1]).read()))['d1_databases'][0]['database_name'])" "$MINT_LOCAL_CFG")"
  DBNAME="$MINT_DB"
  export MINT_MODE MINT_LOCAL_CFG MINT_LOCAL_PERSIST MINT_LOCAL_URL MINT_DB
}
# suite_exit — the run's exit trap: clear the minted seats, then stop the local org if THIS run started it (unless
# SUITE_LOCAL_KEEP=1 — keep it up so the next run or slice reuses it; stop it with
# `R_LOCAL_STATE_ROOT=$PWD/.runs/r-local sh tools/r-local.sh down ryuklabs-local`).
suite_exit() {
  mint_cleanup
  if [ -n "$SUITE_LOCAL_STARTED" ] && [ "${SUITE_LOCAL_KEEP:-}" != "1" ]; then
    sh "$_eng/tools/r-local.sh" down "$SUITE_LOCAL_SLUG" >/dev/null 2>&1
  fi
  SUITE_LOCAL_STARTED=""
}

# AR_SKIP_MINT=1 — a gate selftest sourcing this file to test the THREE-LINE credential resolution
# alone (offline, no network) sets this; never set by a real suite run. It never starts the local org and
# never calls the budget guard either.
if [ "${AR_SKIP_MINT:-}" = "1" ]; then
  U=""; K=""; EVALKEY=""; VASUKEY=""; THIYAGKEY=""; RYUKLABS_EVALSEAT_EMAIL=""; TESTKEY="invalid"
else
  if [ "$SUITE_TARGET" = "local" ]; then
    # LOCAL: nothing below may reach Cloudflare — the three-line credentials leave this process's env
    # entirely, so no child tool (wrangler, curl to the API) can authenticate a live call.
    unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; CF_TOKEN=""; CF_ACCOUNT=""
    WRANGLER_SEND_METRICS=false; export WRANGLER_SEND_METRICS
    suite_local_up || exit 1
    echo "  (target: a LOCAL org $MINT_LOCAL_URL — zero Cloudflare usage; --live runs against the real worker, budget-guarded)"
  else
    # LIVE: the budget guard FIRST — before mint_sweep/mint_all write a single live row (Q9CF32D8F)
    echo "  (target: LIVE ryuklabs worker — the budget guard reads today's usage first)"
    sh "$_eng/tools/cf-budget.sh" || { echo "  ✗ budget guard refused — no live run (nothing minted, no live call made)"; exit 2; }
  fi
  mint_sweep
  if mint_all; then
    trap suite_exit EXIT INT TERM
  else
    echo "  ✗ this run cannot mint into the dev org — nothing to fall back to (never the pool). Every $U/$K-shaped check below will read empty and skip or fail honestly." >&2
    [ -n "$SUITE_LOCAL_STARTED" ] && trap suite_exit EXIT INT TERM
    U=""; K=""; EVALKEY=""; VASUKEY=""; THIYAGKEY=""; RYUKLABS_EVALSEAT_EMAIL=""; TESTKEY="invalid"
  fi
fi

pass=0; fail=0; skip=0
chk() { # chk <name> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (want $2, got $3)"; fail=$((fail+1)); fi
}
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }
sk()   { echo "  SKIP  $1"; skip=$((skip+1)); }  # tenant honestly lacks this capability — not a failure
skp()  { sk "$1"; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
# live_only <case-id> <reason> — a case that can ONLY run against the real Cloudflare worker (a cron trigger,
# a worker secret, a remote-only read …) is marked BY NAME: under the local target it prints
#   SKIP  <id> (live-only: <reason>)
# and returns 0 (so `live_only E7c "…" || { the case }` skips the body); under --live it returns 1 and the
# case runs. Never a FAIL, never a silent drop. The full list is enumerated in engine/CLAUDE.md.
live_only() {
  [ "$SUITE_TARGET" = "local" ] || return 1
  sk "$1 (live-only: $2)"; return 0
}
# PARKED BY NAME (owner ruling QB54D2BC4, 2026-09-25: "focus on our brain and ryuklabs brain … till then park end to
# end all the things for other projects"; batch park-other-projects-evals). Until the platform + ryuklabs suites are
# all green, every case that exercises ANOTHER project's content or brain (siru, bunny, saruspay, veil, monfi) is a
# NAMED SKIP on every target, local AND --live — never deleted, never a silent pass (G-I32):
#   SKIP  <id> parked (owner 2026-09-25: platform + ryuklabs only)
# UN-PARK = delete the ids from PARKED_CASES (and the names from PARKED_PROJECTS) — no other edit; the case bodies
# stay in evals.sh / sims.sh untouched. tools/parked-selftest.sh (a gate step) proves the list and the wraps agree.
PARKED_CASES=""
# the other projects a suite must never pick as its FILING project on a multi-workspace seat (pick_project below)
PARKED_PROJECTS="siru bunny saruspay veil monfi"
# ...and the ALLOWLIST beside it: MINT_PROJECTS (defined ONCE in tools/lib-mint-seat.sh, sourced above — the slugs of the
# suites' own org's workspaces, sharingu + ryuklabs; batch eval-seat-scope C4d; sprint 6: inside the suites' org, keyed
# o<id>--<slug>). The fixed eval seats are seated ONLY there, and pick_project prefers it. Never re-typed here.
PARK_REASON='parked (owner 2026-09-25: platform + ryuklabs only)'
# parked <id> — 0 (and a counted, named SKIP) when <id> is on PARKED_CASES; 1 silently otherwise.
# Usage: `parked E196d || { the case }`. Runs BEFORE live_only so a parked case is parked under --live too.
parked() {
  case " $PARKED_CASES " in *" $1 "*) sk "$1 $PARK_REASON"; return 0;; esac
  return 1
}
# pick_project — /whoami JSON on stdin -> when the seat holds 2+ projects (a multi-workspace seat must name one), the
# first projects[] entry whose SLUG is on MINT_PROJECTS (tools/lib-mint-seat.sh — the suites' org's workspaces; a key
# o<id>--<slug> is read by its slug, sprint 6) and NOT on PARKED_PROJECTS; with MINT_PROJECTS unset/empty, the first entry
# not on PARKED_PROJECTS. '' otherwise (single-seat: the door auto-stamps). Every suite filing-project pick goes through
# here, so a multi-seat run never files under another project.
pick_project() {
  PARKED_PROJECTS="$PARKED_PROJECTS" MINT_PROJECTS="${MINT_PROJECTS:-}" python3 -c "import json,os,sys
try:
  p=(json.load(sys.stdin).get('projects') or [])
except Exception:
  p=[]
park=set(os.environ.get('PARKED_PROJECTS','').split())
allow=set(os.environ.get('MINT_PROJECTS','').split())
slug=lambda k: str(k).split(chr(45)*2, 1)[1] if str(k)[:1] == 'o' and chr(45)*2 in str(k) and str(k)[1:].split(chr(45)*2, 1)[0].isdigit() else str(k)
ok=[x for x in p if slug(x) not in park and (not allow or slug(x) in allow)]
print(ok[0] if len(p)>1 and ok else '')" 2>/dev/null
}
# suite_d1 <sql> / suite_d1_json <sql> — the ONE `wrangler d1 execute` for the current target: the local D1
# (`--config <local cfg> --local --persist-to <dir>`, no credentials) or the live one (`--remote`, the three-line
# env). Every direct D1 read/write a suite makes goes through here — never a hardcoded --remote.
suite_d1() {
  if [ "$SUITE_TARGET" = "local" ]; then
    npx --no-install wrangler d1 execute "$DBNAME" --config "$MINT_LOCAL_CFG" --local --persist-to "$MINT_LOCAL_PERSIST" --command "$1" </dev/null
  else
    CLOUDFLARE_API_TOKEN="$CF_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT" npx --yes wrangler d1 execute "$DBNAME" --remote --command "$1" </dev/null
  fi
}
suite_d1_json() {
  if [ "$SUITE_TARGET" = "local" ]; then
    npx --no-install wrangler d1 execute "$DBNAME" --config "$MINT_LOCAL_CFG" --local --persist-to "$MINT_LOCAL_PERSIST" --json --command "$1" </dev/null
  else
    CLOUDFLARE_API_TOKEN="$CF_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT" npx --yes wrangler d1 execute "$DBNAME" --remote --json --command "$1" </dev/null
  fi
}
# suite_can_d1 — true when this run can reach its D1 at all (local: always, once bound; live: the three-line env)
suite_can_d1() {
  if [ "$SUITE_TARGET" = "local" ]; then [ -n "${MINT_LOCAL_CFG:-}" ]; else [ -n "$CF_TOKEN" ] && [ -n "$CF_ACCOUNT" ]; fi
}
UA="${AGENT_R_UA:-sharingu-agent-r-tools/1.0 (+https://github.com/ryuk-labs/sharingu)}"  # every HTTP call this harness makes to Cloudflare or the worker names itself

# self_clean — the suites bank test artifacts + fire eval events every run. Remove them so prod D1
# never accumulates test junk (owner ruling S-016). Same statement for both suites; tenant-aware.
self_clean() {
  # the engine's own clean-eval (owner action on /control) — reaches the eval handoff prefix in R2 and every
  # eval-marked D1 row; the SQL below stays as the belt for a worker that predates it (2026-09-06 residue audit).
  if [ -n "$U" ] && [ -n "$K" ]; then
    curl -s -X POST -H "Authorization: Bearer $K" -H "User-Agent: $UA" -d "action=clean-eval" "$U/control" | grep -o 'Eval residue cleaned[^.]*\.' | head -1 | sed 's/^/  (/; s/$/)/'
  fi
  if suite_can_d1; then
    # release-heal (2026-09-22, Q5992857D): B3-heal added a `DELETE FROM check_results` belt line here
    # to clear the same FK gap src/admin.js's clean-eval carried (check_results.transmission_id is a
    # real FK onto transmission(id) as of migrate-032.sql) — but check_results is authored (owner
    # ruling Q5992857D, 2026-09-18: "every grade kept as history, never overwritten"), and unlike
    # approval_audit (carved out BY RULING, Q23D7E346) it has no eval carve-out. This belt now mirrors
    # admin.js's own fix instead of the regression: it never deletes check_results, and instead KEEPS
    # (skips deleting) any eval transmission — and that transmission's approval_audit/transmission_refs
    # rows — that a check_results row still references, exactly as src/admin.js's clean-eval does.
    # build0925:backfill-eval-integrity (2026-09-25): the leading UPDATE mirrors admin.js's
    # un-link-before-delete — no surviving transmission keeps a report id this sweep deletes.
    suite_d1 "UPDATE transmission SET report = NULL WHERE report IN (SELECT id FROM artifacts WHERE group_tag='eval' OR title LIKE 'eval-%'); DELETE FROM artifacts WHERE group_tag='eval' OR title LIKE 'eval-%'; DELETE FROM events WHERE COALESCE(json_extract(payload_json,'\$.eval'),0)=1; DELETE FROM approval_audit WHERE transmission_id IN (SELECT id FROM transmission WHERE eval=1) AND transmission_id NOT IN (SELECT DISTINCT transmission_id FROM check_results WHERE transmission_id IS NOT NULL); DELETE FROM transmission_refs WHERE tid IN (SELECT id FROM transmission WHERE eval=1) AND tid NOT IN (SELECT DISTINCT transmission_id FROM check_results WHERE transmission_id IS NOT NULL); DELETE FROM transmission WHERE (eval=1 OR id LIKE 'T-evalorphan-%') AND id NOT IN (SELECT DISTINCT transmission_id FROM check_results WHERE transmission_id IS NOT NULL);" \
      >/dev/null 2>&1 && echo "  (self-clean: eval artifacts + events removed)"
  fi
}

# write_last_run <suite> — the ONE durable record of a suite's last run (M-ADR-029: the platform's state is
# derived from ENGINE SIGNALS, never from contributions). Written to .runs/<suite>-<tenant>.json in the
# engine repo (gitignored) at the end of every run; make-state.py in the platform brain reads it. Never
# a typed count anywhere — this IS the run's own summary, in JSON.
write_last_run() {
  # M-ADR-037: the per-test results ride beside the totals — derived from the run's OWN printed lines
  # (the suite is re-run under a tee by run_teed below; $AR_RUN_LOG is where its stdout lands).
  if [ -n "$AR_RUN_LOG" ] && [ -s "$AR_RUN_LOG" ]; then
    python3 "$(dirname "$0")/tools/run-results.py" "$AR_RUN_LOG" "$(dirname "$0")/.runs/$1-$(printf %s "$P" | tr 'A-Z_' 'a-z-')-tests.json" >/dev/null 2>&1
  fi
  mkdir -p "$(dirname "$0")/.runs" 2>/dev/null
  # commit: the engine HEAD this run actually exercised (a record from an older commit than the engine's
  # current HEAD is stale, never counted as green).
  # `git rev-parse HEAD` with no path argument walks up from the process's REAL cwd (never $0's
  # possibly-misleading dirname — see evals.sh's own ENGINE_DIR note), which stays the engine
  # directory in both a full run and a composed --only slice (only $0 the script NAME differs there).
  _commit="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  printf '{"suite":"%s","tenant":"%s","target":"%s","passed":%s,"failed":%s,"skipped":%s,"commit":"%s","at":"%s"}\n' \
    "$1" "$P" "$SUITE_TARGET" "${pass:-0}" "${fail:-0}" "${skip:-0}" "$_commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$(dirname "$0")/.runs/$1-$(printf %s "$P" | tr 'A-Z_' 'a-z-').json" 2>/dev/null
}

# The D1 READ BUDGET (M-ADR-032) is guarded by tools/cf-budget.sh now (Q9CF32D8F): all three free-tier limits,
# REFUSE at 95%, unreadable = REFUSE, called above BEFORE the live mint — and never on the local target. The old
# d1_budget_guard (rowsRead only, refused at 80%, ran blind when unreadable, ran AFTER the live mint) is gone.
