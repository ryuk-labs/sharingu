#!/bin/sh
# tools/ship-plan.sh [ryuklabs] [--no-live-read] [--live-at NNN] [--cost-dir DIR] [--no-import] — THIS SHIP's plan, printed,
# READ-ONLY (S4, 2026-10-02). It changes nothing anywhere: by construction it runs only reads — `wrangler deployments status`,
# three SELECTs on the org's D1 through `wrangler d1 execute --remote --command` (sqlite_master's names, the projects' keys, the
# orgs' path names), tools/cf-budget.sh (the plan and the usage), tools/check-org-names.mjs over those path names (local: the
# source's reserved names), and the importer with --dry-run (local: it reads the sources and the local measures). It never
# runs tools/migrate.sh, tools/ship.sh, an import without --dry-run, a `d1 execute --file`, an upload, a deploy or a rollback:
# it PRINTS them. tools/ship-selftest.sh proves it with stubs and a static scan.
# It prints only what THIS ship does: a data step that ran on live with an earlier ship leaves the plan with it (git keeps it,
# HANDOFF.md records it).
#   1 · live         the worker version at 100% (the rollback target), the migrations it holds (read from its schema:
#                    tools/ship-plan-migrations.py), the projects it holds (an overlays-only project it lacks is created
#                    by its own import) and its orgs' path names (migrate-072's org.slug; none before it lands), checked here
#                    against THIS code's reserved names (tools/check-org-names.mjs --slugs: a held name a route of this code
#                    answers is a gap — the sprint-7 review, D2+B3)
#   2 · migrations   every migrate-0NN.sql above live's, in order, each with the order rule its header states (never a
#                    hard-coded range: a migration the door lane adds shows up here); one live already holds is not listed;
#                    a file AFTER the code (its ORDER line) is applied after the code (WHEN its ORDER line says: migrate-068
#                    right after the code reaches 100%), its PREFLIGHT query beside it, its UNDO (a down script) when its header
#                    names one; the sequence printed whole (sprint 6: migrate-067 -> the code -> migrate-068 -> migrate-069)
#   3 · the import   the projects (tools/lib-import-sources.sh: the list import-live.sh files), each with its source, overlays,
#                    renders and the rows it writes (the importer's --dry-run estimate from the ship candidate's measures,
#                    .runs/ship-candidate/cost4, at the plan's batch size), and a line for every machine-local overlay this
#                    machine lacks
#   4 · the budget   tools/cf-budget.sh and the whole import against it (tools/import/cost.mjs --check)
#   5 · the order    the ship as numbered steps, each with its command and its undo BY PHASE (sprint 6 review, finding 1: the
#                    code's undo is `ship.sh rollback` until an AFTER file with a down script lands — from migrate-068 on it is
#                    that down script FIRST, then the rollback): the budget; the dry run of the migrations from the first one
#                    live lacks; each migration BEFORE the code with its rule; the org names live holds against this code's
#                    reserved names (BEFORE the code, after the migrations it needs: migrate-072 makes org.slug; ship.sh runs the
#                    same check after its live read and refuses on red); the code (--no-import: ONE ship.sh step; else with the
#                    import's three runs on its preview: the prune's dry run, the owner's reading of the plans, the apply;
#                    ship.sh runs the cross-org suite and the walk on every preview first); each migration AFTER the code, its
#                    preflight first; the walk on live, the ship's own last step (the owner's one-time steps follow it). With no migration pending the plan SAYS this ship
#                    lands none, and the code's data undo is nothing (the review of sprint 9, D16).
#                    THIS SHIP'S ONE-TIME STEPS (sprint 10): the earlier ships' are done or dead and recorded (sprint 6's per-org
#                    restore rehearsed on live, sprint 7's done-when on live, sprint 8's raise of the suites' org onto `suite`,
#                    sprint 9's site redeploy — the site is live — and its "repo goes public", dead by the proprietary ruling:
#                    SPRINTS.md, HANDOFF.md), so they leave the plan. Sprint 10's is THE OWNER'S, printed in order and never run
#                    here: the plugin's distribution repo (ryukdev/sharingu-plugin) synced from this tree and pushed, after the
#                    walk (live's Control · Connect, which this code ships, names that repo); then the reviewer world on live at
#                    M4 (carried from sprint 9), the last step
# --no-live-read skips the wrangler reads (the version, the schema, the projects say "unknown" and why; HANDOFF.md's record is
# quoted as a record, never as a reading). --live-at NNN states the migration live is at when the schema is not read.
# --no-import (the sprint-7 review, D8): a ship that runs NO preview hook — the projects' data is not on the road (as sprint 6):
# section 3 says so and estimates nothing, section 4 reads the budget alone, and section 5's code is ONE step, `sh tools/ship.sh`
# with no SHIP_PREVIEW_HOOK (no prune plans, no reading, no apply).
# Exit 0 when the plan is complete; 1 when something it needs is missing (a source, a measure, the budget refused) — the
# plan still prints in full, each gap named.
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
TARGET=ryuklabs; LIVE_READ=1; LIVE_AT=""; COST_DIR=""; NO_IMPORT=""
while [ $# -gt 0 ]; do
  case "$1" in
    ryuklabs) ;;
    --no-live-read) LIVE_READ="" ;;
    --live-at) LIVE_AT="${2:-}"; shift ;;
    --cost-dir) COST_DIR="${2:-}"; shift ;;
    --no-import) NO_IMPORT=1 ;;
    *) echo "usage: sh tools/ship-plan.sh [ryuklabs] [--no-live-read] [--live-at NNN] [--cost-dir DIR] [--no-import]" >&2; exit 2 ;;
  esac
  shift
done
[ -z "$LIVE_AT" ] || printf '%s' "$LIVE_AT" | grep -Eq '^[0-9]{3}$' || { echo "--live-at takes three digits (e.g. 046)" >&2; exit 2; }
DB=ryuklabs-agent-r; CFG=wrangler.jsonc; LIVE_URL="https://agent.ryuklabs.io"
# the brand's address (MARKETPLACE.md: the same worker; plugin/.mcp.json's one address, the listing's): the M4 reviewer world is
# made through it, so the org and MCP addresses make-reviewer-org.mjs prints for the stores' reviewers are the ones they install
# (the sprint-10 review, L4)
BRAND_URL="https://agent.sharingu.xyz"
[ -n "$COST_DIR" ] || { [ -d "$ROOT/.runs/ship-candidate/cost4" ] && COST_DIR="$ROOT/.runs/ship-candidate/cost4" || COST_DIR="${IMPORT_COST_DIR:-$ROOT/.runs}"; }
[ -f "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}" ] && { set -a; . "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}"; set +a; }
T="$(mktemp -d "${TMPDIR:-/tmp}/ship-plan.XXXXXX")"; trap 'rm -rf "$T"' EXIT
gaps=0
gap() { echo "  ✗ $1"; gaps=$((gaps+1)); }

echo "SHIP PLAN — $TARGET ($DB), $(date -u +%Y-%m-%dT%H:%MZ), from $(git rev-parse --short=9 HEAD 2>/dev/null || echo '?')$( [ -n "$(git status --porcelain -- . 2>/dev/null)" ] && echo ' (+ uncommitted changes)')"
echo "READ-ONLY: nothing below was run against live except the reads named; every command in section 5 is printed, not run."
echo

# ── 1 · live ─────────────────────────────────────────────────────────────────────────────────────────────────────────
echo "1 · LIVE"
PRE=""; SCHEMA_OK=""; PROJECTS_LIVE=""; PROJECTS_READ=""; SLUGS=""; SLUGS_READ=""
if [ -n "$LIVE_READ" ]; then
  if npx wrangler deployments status --json --config "$CFG" </dev/null > "$T/dep.json" 2>/dev/null; then
    lv=$(python3 -c '
import sys
sys.path.insert(0, "tools")
from lib_wrangler_json import parse_wrangler_json
d = parse_wrangler_json(open(sys.argv[1]).read())
for v in d.get("versions") or []: print(v["version_id"], v["percentage"])' "$T/dep.json" 2>/dev/null)
    if [ "$(printf '%s\n' "$lv" | grep -c .)" = 1 ]; then PRE="${lv%% *}"; echo "  worker: $PRE at 100% (read: wrangler deployments status) — the rollback target"
    elif [ -n "$lv" ]; then gap "a SPLIT deployment is live: [$(printf '%s' "$lv" | tr '\n' ' ')] — finish or undo it before a ship"
    else gap "the live deployment did not parse"; fi
  else gap "the live deployment could not be read (wrangler deployments status)"; fi
  if npx wrangler d1 execute "$DB" --remote --json --command "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql NOT NULL" </dev/null > "$T/schema.json" 2>/dev/null \
     && python3 tools/ship-plan-migrations.py "$ROOT" --schema-json "$T/schema.json" --json > "$T/mig.json" 2>/dev/null; then SCHEMA_OK=1
  else gap "live's schema could not be read (d1 execute --remote SELECT … sqlite_master)"; fi
  if npx wrangler d1 execute "$DB" --remote --json --command "SELECT key FROM projects ORDER BY key" </dev/null > "$T/projects.json" 2>/dev/null; then
    PROJECTS_LIVE=$(python3 -c '
import sys
sys.path.insert(0, "tools")
from lib_wrangler_json import parse_wrangler_json
d = parse_wrangler_json(open(sys.argv[1]).read())
print(" ".join(r["key"] for r in d[0]["results"]))' "$T/projects.json" 2>/dev/null)
    PROJECTS_READ=1; echo "  projects: ${PROJECTS_LIVE:-none} (read: SELECT key FROM projects)"
  else gap "live's projects could not be read"; fi
  # D2+B3: the orgs' path names (migrate-072's org.slug: a database before it has none — then the check is a step after it)
  if npx wrangler d1 execute "$DB" --remote --json --command "SELECT slug FROM org WHERE slug IS NOT NULL ORDER BY id" </dev/null > "$T/slugs.json" 2>/dev/null \
     && SLUGS=$(python3 -c '
import sys
sys.path.insert(0, "tools")
from lib_wrangler_json import parse_wrangler_json
d = parse_wrangler_json(open(sys.argv[1]).read())
print(",".join(r["slug"] for r in (d[0] if isinstance(d, list) else d)["results"] if isinstance(r.get("slug"), str)))' "$T/slugs.json" 2>/dev/null); then
    SLUGS_READ=1; echo "  org names: ${SLUGS:-none} (read: SELECT slug FROM org)"
    if node tools/check-org-names.mjs --slugs "$SLUGS" > "$T/names.txt" 2>&1; then echo "    $(tail -1 "$T/names.txt")"
    else sed 's/^/    /' "$T/names.txt"; gap "an org on live holds a name this code reserves (tools/check-org-names.mjs --slugs): the operator gives it another path name, with its owner, before the code ships"; fi
  else echo "  org names: not read (SELECT slug FROM org failed: live has no org.slug until migrate-072 lands — the names are checked as a step right after it, before the code)"; fi
else
  echo "  worker: unknown (--no-live-read: wrangler deployments status was not run)"
  echo "    HANDOFF.md records (a record, not a reading): $(grep -m1 -o 'worker `[0-9a-f]*`[^;]*' "$ROOT/../docs/plan/HANDOFF.md" 2>/dev/null || echo '?'); undo recorded: $(grep -m1 -o 'ship.sh rollback [0-9a-f-]*' "$ROOT/../docs/plan/HANDOFF.md" 2>/dev/null || echo '?')"
  echo "  projects: unknown (--no-live-read: SELECT key FROM projects was not run)"
fi
if [ -z "$SCHEMA_OK" ]; then
  if [ -n "$LIVE_AT" ]; then python3 tools/ship-plan-migrations.py "$ROOT" --live-at "$LIVE_AT" --json > "$T/mig.json"
  else echo "  migrations: unknown (live's schema was not read and no --live-at NNN was stated)"; fi
fi
echo

# ── 2 · migrations ───────────────────────────────────────────────────────────────────────────────────────────────────
echo "2 · MIGRATIONS TO APPLY, IN ORDER (tools/migrate.sh, one file at a time, a Time Travel bookmark before each)"
FIRST=""; PENDING=""
if [ -s "$T/mig.json" ]; then
  python3 - "$T/mig.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
print(f"  live is at migrate-{m['at']:03d} ({m['source']})")
if not m["pending"]: print("  none: live holds every migration in this repo")
for p in m["pending"]:
    tag = {"before": "BEFORE the code", "after": "AFTER the code", "either": "either side of the code"}.get(p["order"], "UNSTATED — read its header")
    print(f"  {p['file']:<17} {tag:<24} {p['title'][:90]}")
    print(f"  {'':<17} {'':<24} rule: {p['rule'][:130]}")
    if p.get("when"): print(f"  {'':<17} {'':<24} when: {p['when']}")
    if p.get("preflight"): print(f"  {'':<17} {'':<24} preflight (read-only, right before it; must answer NO row): {p['preflight']}")
    if p.get("undo"): print(f"  {'':<17} {'':<24} undo: sh tools/migrate.sh {p['undo']} (its down script: from the moment it lands, the code's undo runs this FIRST)")
if m["pending"]: print("  the sequence: " + " -> ".join(x.replace(".sql", "") for x in m.get("sequence") or []))
PY
  # each pending file with its order, as file:order (the steps in section 5 name the rule beside the file)
  PENDING=$(python3 -c "import json,sys;print(' '.join(p['file'] + ':' + p['order'] for p in json.load(open(sys.argv[1]))['pending']))" "$T/mig.json")
  # each file's preflight (one per line, file<TAB>query): printed as its own read-only step right before the file
  python3 -c "import json,sys;[print(p['file'] + '\t' + p['preflight']) for p in json.load(open(sys.argv[1]))['pending'] if p.get('preflight')]" "$T/mig.json" > "$T/preflight.tsv"
  # each file's WHEN and its UNDO (a down script), file<TAB>text: the step names them, and the code's undo changes from there on
  python3 -c "import json,sys;[print(p['file'] + '\t' + p['when']) for p in json.load(open(sys.argv[1]))['pending'] if p.get('when')]" "$T/mig.json" > "$T/when.tsv"
  python3 -c "import json,sys;[print(p['file'] + '\t' + p['undo']) for p in json.load(open(sys.argv[1]))['pending'] if p.get('undo')]" "$T/mig.json" > "$T/undo.tsv"
  FIRST=$(python3 -c "import json,sys;p=json.load(open(sys.argv[1]))['pending'];print('%03d' % p[0]['n'] if p else '')" "$T/mig.json")
  python3 -c "import json,sys;sys.exit(0 if all(p['order']!='unstated' for p in json.load(open(sys.argv[1]))['pending']) else 1)" "$T/mig.json" \
    || gap "a pending migration states no order rule: read its header before the ship"
else
  gap "the migrations to apply are unknown"
fi
echo

# ── 3 · the import ───────────────────────────────────────────────────────────────────────────────────────────────────
PLAN=$(sh tools/cf-budget.sh --json 2>"$T/budget.err" | python3 -c "import json,sys;print(json.load(sys.stdin).get('plan',''))" 2>/dev/null)
case "$PLAN" in paid) MAX=200 ;; free) MAX=50 ;; *) MAX=50; PLAN="unknown" ;; esac
. "$ROOT/tools/lib-import-sources.sh"
total=0
if [ -n "$NO_IMPORT" ]; then
  echo "3 · THE IMPORT — none (--no-import): this ship runs NO preview hook; the projects' data is not on the road (as sprint 6), so"
  echo "  nothing is estimated, no prune plan is made and nothing is imported"
  PROJECTS_PLANNED=""
else
  echo "3 · THE IMPORT — tools/import-live.sh on the version preview (plan $PLAN: $MAX ops a call), the smallest project first"
  echo "  measures: $COST_DIR (the importer's --dry-run estimate at $MAX ops a call; the import's own IMPORT_COST_DIR must point here)"
  PROJECTS_PLANNED="$PROJECTS"
fi
for p in $PROJECTS_PLANNED; do
  src="$(source_of "$p")"; rnd="$(renders_of "$p")"; ov="$(overlays_of "$p" 2>"$T/ov-$p.err")"; arg="$(source_arg "$p")"
  echo "  $p"
  if [ "$arg" = "-" ]; then
    if [ -z "$PROJECTS_READ" ]; then held="created with create_project as \"$(name_of "$p")\" when live does not hold it"
    else case " $PROJECTS_LIVE " in *" $p "*) held="live holds it" ;; *) held="live does not hold it: created with create_project as \"$(name_of "$p")\"" ;; esac; fi
    echo "    source   none: filed from its overlays alone ($held)"
  else echo "    source   ${src:-none}$( [ -n "$src" ] && [ ! -d "$src" ] && echo '  ✗ NOT ON THIS MACHINE')"; fi
  if [ -n "$ov" ]; then printf '%s\n' "$ov" | tr ',' '\n' | while read -r o; do echo "    overlay  ${o#$ROOT/}"; done; else echo "    overlays none"; fi
  while read -r l; do [ -n "$l" ] && { echo "    ✗ ${l#! }"; }; done < "$T/ov-$p.err"
  [ -s "$T/ov-$p.err" ] && gaps=$((gaps + $(grep -c . "$T/ov-$p.err")))
  [ -n "$rnd" ] && echo "    renders  $rnd"
  echo "    prune    its plan, read-only (what live holds that this build does not: what the rule removes, what it keeps, why;"
  echo "             import-live.sh writes it for every project before anything is sent; the import key in the env):"
  echo "             node tools/ship/prune.mjs '$arg' --project $p --url <the preview URL> --plan .runs/ship-prune/$p.json${rnd:+ --renders '$rnd'}${ov:+ --overlay '$ov'}"
  [ "$arg" = "-" ] || { [ -n "$src" ] && [ -d "$src" ]; } || { gap "$p: no source on this machine"; continue; }
  if node tools/import-brain.mjs "$arg" --project "$p" --dry-run --max-ops "$MAX" ${rnd:+--renders "$rnd"} ${ov:+--overlay "$ov"} \
       --estimate-from "$COST_DIR/import-cost-$p.json" > "$T/est-$p.log" 2>&1; then
    n=$(sed -n 's/^  this run will write about \([0-9,]*\) rows.*/\1/p' "$T/est-$p.log")
    echo "    rows     about $n written"; total=$((total + $(printf '%s' "$n" | tr -d ,)))
  else
    gap "$p: no estimate — $(grep -m1 -E 'REFUSED|VALIDATION|could not' "$T/est-$p.log" | sed 's/^ *//' | cut -c1-200)"
  fi
done
[ -n "$NO_IMPORT" ] || echo "  all: about $(python3 -c "print(f'{$total:,}')") rows written (the worst case: a batch already filed replays and writes nothing)"
echo

# ── 4 · the budget ───────────────────────────────────────────────────────────────────────────────────────────────────
echo "4 · THE BUDGET"
sh tools/cf-budget.sh 2>&1 | sed 's/^/  /'
if [ -n "$NO_IMPORT" ]; then echo "  no import against it (--no-import)"
else
  echo "  the import (about $total rows) against it:"
  if node tools/import/cost.mjs --check "$total" --url "$LIVE_URL" > "$T/check.txt" 2>&1; then sed 's/^/  /' "$T/check.txt"
  else sed 's/^/  /' "$T/check.txt"; gap "the import does not pass the budget guard"; fi
fi
echo

# ── 5 · the order ────────────────────────────────────────────────────────────────────────────────────────────────────
echo "5 · THE ORDER (each step runs only when the one before it is green; from engine/, with the owner's OK)"
n=0
step() { n=$((n+1)); echo "  $n. $1"; echo "       run:  $2"; echo "       undo: $3"; }
# phase <text> — the code's undo from this step on (sprint 6 review, finding 1), printed under the step that changes it
phase() { echo "       from here the code's undo is: $1"; }
ROLLBACK="sh tools/ship.sh rollback ${PRE:-<the live version id — unknown here: run without --no-live-read>}"
# D16 (sprint 9's review): the data undo of the code — the first migration's bookmark, or none when this ship lands no migration
if [ -s "$T/mig.json" ] && [ -z "$PENDING" ]; then DATA_UNDO="none — this ship lands NO migration (live's schema stays as it is; the code's undo is the rollback alone)"
else DATA_UNDO="the bookmark of the first migration above"; fi
# the first AFTER file that names a down script: until it lands the code's undo is the rollback alone
FIRST_DOWN=$(for t in $PENDING; do f="${t%%:*}"; [ "${t#*:}" = after ] && sed -n "s/^$f	\(.*\)/$f \1/p" "$T/undo.tsv" 2>/dev/null; done | head -1)
step "the budget" "sh tools/cf-budget.sh" "nothing to undo (a read)"
# the dry run starts at the first migration live lacks; with none to apply (and live's state known) there is nothing to rehearse
[ -s "$T/mig.json" ] && [ -z "$PENDING" ] || \
  step "the dry run of the migrations on a copy of live" "sh tools/migrate-dryrun.sh $DB${FIRST:+ --from $FIRST}" "nothing to undo (a read-only export; every write is in a local copy)"
# migration_steps <before|after> — the pending files on that side of the code, in order (before: every file not AFTER it), each
# with its preflight first when its header names one
migration_steps() {
  for t in $PENDING; do
    f="${t%%:*}"; o="${t#*:}"
    if [ "$1" = after ]; then [ "$o" = after ] || continue; else [ "$o" = after ] && continue; fi
    case "$o" in before) rule="BEFORE the code" ;; after) rule="AFTER the code" ;; either) rule="either side of the code" ;; *) rule="its order UNSTATED: read its header first" ;; esac
    q=$(sed -n "s/^$f	//p" "$T/preflight.tsv" 2>/dev/null); w=$(sed -n "s/^$f	//p" "$T/when.tsv" 2>/dev/null); u=$(sed -n "s/^$f	//p" "$T/undo.tsv" 2>/dev/null)
    [ -n "$q" ] && step "the preflight of $f (read-only, right before it: it must answer NO row, else stop — the file would fail and nothing after it runs)" \
      "npx wrangler d1 execute $DB --remote --json --command \"$q\"" "nothing to undo (a read)"
    if [ -n "$u" ]; then
      step "migration $f ($rule${w:+ — $w})" "sh tools/migrate.sh $f" "sh tools/migrate.sh $u (its down script, a bookmark first); the last resort: npx wrangler d1 time-travel restore $DB --bookmark=<the bookmark migrate.sh printed for $f> (the WHOLE database to that moment)"
      [ "$1" = after ] && phase "sh tools/migrate.sh $u FIRST, then $ROLLBACK (ship.sh rollback reads live's schema and refuses while $f's triggers stand; with the down script applied, $f runs again, its preflight first, before the code ships again)"
    else
      step "migration $f ($rule${w:+ — $w})" "sh tools/migrate.sh $f" "npx wrangler d1 time-travel restore $DB --bookmark=<the bookmark migrate.sh printed for $f> (the WHOLE database to that moment)"
    fi
  done
}
migration_steps before
# D2+B3: the org names live holds, against this code's reserved names — after the migrations before the code (migrate-072 makes
# org.slug), before the code itself
if [ -n "$SLUGS_READ" ]; then SLUGS_ARG="$SLUGS"; else SLUGS_ARG="<the path names it answers, comma-separated>"; fi
step "the org names live holds, against THIS code's reserved names (read-only, BEFORE the code: an org holding a name a route of this code answers would lose its address when the code lands; ship.sh runs the same check after its live read and refuses on red)" \
  "npx wrangler d1 execute $DB --remote --json --command \"SELECT slug FROM org WHERE slug IS NOT NULL ORDER BY id\", then node tools/check-org-names.mjs --slugs $SLUGS_ARG" \
  "nothing to undo (two reads; an org holding a reserved name is given another path name by the operator, with its owner, before the code ships)"
if [ -n "$NO_IMPORT" ]; then
  # D8: no preview hook — the code alone (ship.sh's own proofs on the preview), the stamp-less grants read before it
  step "the OAuth grants minted before connections carried their stamp (read-only: the code refuses each one; every holder listed connects again — tell them, or accept the re-connect)" \
    "node tools/ship/oauth-grants-check.mjs --config $CFG" \
    "nothing to undo (a read)"
  step "the code, with NO preview hook (--no-import: the projects' data is not on the road). ship.sh: the gate, live's migration level and its orgs' names (read again, refused on red), the upload, the preview smoke, the cross-org suite on the preview (two throwaway orgs restored, walked both ways — a bearer and a browser session under each other's address —, deleted with their accounts; never org 1), the walk on the preview (as the suites' org; its two people's accounts removed after); nothing is promoted when any fails; then 10%, the pinned canary, 100%" \
    "sh tools/ship.sh $TARGET" \
    "code: $ROLLBACK${FIRST_DOWN:+ (until ${FIRST_DOWN%% *} lands; from then its down script FIRST: sh tools/migrate.sh ${FIRST_DOWN#* }, then the rollback)}; data: $DATA_UNDO"
else
step "the code, with the import on its preview (ship.sh first runs the cross-org suite on the preview — two throwaway orgs restored, walked both ways and deleted, never org 1 — then the walk on the preview, as the suites' org; nothing is promoted when either fails): the DRY RUN of the prune — every project's plan, read-only, in .runs/ship-prune/ (what the rule removes: the import's own stale rows and the owner's rulings in tools/ship/prune-rulings.json; what it keeps: a person's own filing, with why); the run STOPS before anything is sent when a plan removes rows, so the version is NOT promoted and no traffic moves" \
  "SHARINGU_IMPORT_KEY=<the one-hour import token, env only> SHIP_PREVIEW_HOOK='IMPORT_COST_DIR=$COST_DIR sh tools/import-live.sh' sh tools/ship.sh $TARGET" \
  "nothing to undo (the plans are reads; the hook stops before the import, the version is never promoted)"
step "the owner reads each plan (what it removes and what it keeps, by kind and ref, each with why; a person's own filing stays) and copies the reviewed ones aside" \
  "mkdir -p .runs/ship-prune-reviewed && cp .runs/ship-prune/<project>.json .runs/ship-prune-reviewed/   (one per plan that removes rows, after reading it)" \
  "nothing to undo (a copy)"
step "the OAuth grants minted before connections carried their stamp (read-only: the code refuses each one; every holder listed connects again — tell them, or accept the re-connect)" \
  "node tools/ship/oauth-grants-check.mjs --config $CFG" \
  "nothing to undo (a read)"
step "the code, with the import and the APPLY of the reviewed plans on its preview before any traffic moves (each removes only what it names, only while each row stands as read, at most 3000 rows; then stored == built, or the rows a person made, kept)" \
  "SHARINGU_IMPORT_KEY=<the one-hour import token, env only> SHIP_PREVIEW_HOOK='IMPORT_PRUNE_PLANS=.runs/ship-prune-reviewed IMPORT_COST_DIR=$COST_DIR sh tools/import-live.sh' sh tools/ship.sh $TARGET" \
  "code: $ROLLBACK${FIRST_DOWN:+ (until ${FIRST_DOWN%% *} lands; from then its down script FIRST: sh tools/migrate.sh ${FIRST_DOWN#* }, then the rollback)}; data: $DATA_UNDO$( [ -n "$PENDING" ] && echo ' (a restore undoes the import too)')"
fi
migration_steps after
step "the live walk of the member path" "node tools/live-walk.mjs --url $LIVE_URL --creds <file> --live --operator-config $CFG --confirm-live $DB (a credential the owner provides for the occasion; the deployment's credentials sourced: its two people's accounts are removed after)" "nothing to undo (it files on a throwaway project and removes it, its two people archived and their accounts removed)"
# sprint 10: THIS ship's one-time step, THE OWNER'S — printed, never run here. The plugin installs from its own public
# distribution repo (the proprietary ruling): live's Control · Connect, which this code ships, names it, so the repo is synced
# from THIS tree after the code and the walk; tools/make-plugin-skills.mjs --sync mirrors the plugin into a clone, --sync-check
# reds a clone that differs
DIST_REPO=ryukdev/sharingu-plugin
step "THE OWNER'S, after the walk: the plugin's distribution repo $DIST_REPO synced from this tree (live's Control · Connect, shipped by this code, names it) — read the diff, then commit and push in the clone" \
  "git clone https://github.com/$DIST_REPO <clone> (or git -C <clone> pull), node tools/make-plugin-skills.mjs --sync <clone>, read git -C <clone> diff, commit and push in the clone; then node tools/make-plugin-skills.mjs --sync-check <clone> (exit 0) and, on a clean machine, claude plugin marketplace add $DIST_REPO then claude plugin install sharingu@sharingu answers" \
  "git -C <clone> revert <the sync commit>, then push (the distribution repo only; the engine and live are untouched)"
# sprint 9: the reviewer world on live (MARKETPLACE.md M4), the owner's, after the ship: small batch first, a fresh measure (the
# tool's own dry run refuses a stale one before any write), its accounts fresh (it refuses any account that stands elsewhere)
step "THE OWNER'S, at M4 (after the ship, when the listing is submitted): the stores' reviewer world on live — a fresh import measure first (sh tools/dev-local.sh up), the sample alone first, then the sharingu import (about 17,018 rows written, 18,130 with the sample: the importer's measure on a fresh dev-local, 2026-10-10; the fresh measure first is the one to trust); the Control shot retaken on it; then each case of listing/test-cases.md walked as its account (the sprint's done-when)" \
  "node tools/make-reviewer-org.mjs --url $BRAND_URL --live --config $CFG --confirm-live $DB --sample-only, then the same without --sample-only (the deployment's credentials sourced; the seven codes printed once, on this terminal). A world that stands (its accounts hold codes) runs again only with --reissue: EVERY account gets a new code and its sessions end — never after the codes are handed to a store's reviewers (a changed source then waits: the world stays as it stands)" \
  "after the review: node tools/org-undo.mjs export --org <its id> --out .runs/reviewer-org/export, then delete --org <its id> --yes-delete <its name> --export .runs/reviewer-org/export, then node tools/operator.mjs remove-account --email <each of the seven> (each with --live --config $CFG --confirm-live $DB); the plan row \"reviewer\" can stay (no other org rides it)"
echo
if [ "$gaps" -eq 0 ]; then echo "✓ the plan is complete"; exit 0; fi
echo "✗ the plan has $gaps gap(s): each is a ✗ line above"; exit 1
