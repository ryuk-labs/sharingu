#!/bin/sh
# tools/volume-local.sh — the local app at the VOLUME of a busy org, for tools/page-budget.mjs: what a screen or an MCP read
# costs in D1 rows when the tables are as big as live's (and bigger), which the small dev-local app hides. Its OWN org
# (volume-local, state under .runs/r-local/volume-local/, its own port from 8905), never dev-local. Local only: no
# Cloudflare call, no key printed.
#   sh tools/volume-local.sh up      start it; the first run seeds it (boot.sql, one owner), adds the projects, imports both
#                                    brains through the MCP door (as dev-local does), then writes the synthetic volume
#                                    (tools/volume-local.py) into its local D1 with `wrangler d1 execute --local` ONCE
#   sh tools/volume-local.sh down    stop it; the data stays on disk
#   sh tools/volume-local.sh reset   stop it and drop its state (the next `up` rebuilds it; needed after a new migration)
# The volume (deterministic: VOLUME_SEED, default 20260930; timestamps are relative to the moment it was written, kept in
# .volume, so "this week" is always populated): 300 people (a quarter active) + the suites' five eval-fixed seats, 1,500
# tokens (a fifth live), 1,000 filings over 90 days across every lane, kind and project (goal refs, decisions, owner
# routes, counters, ranks, a fifth eval), their refs, audit rows and "pr" mirrors, 5,000 events, 500 loops (300 open), 400
# login attempts, 200 artifacts, grades for most checks, and 4 more projects (one archived). About 4 minutes the first time
# (the import is most of it); a later `up` just starts the worker.
#   then: BUDGET_URL=<its url> BUDGET_CREDS=.runs/r-local/volume-local/credentials.env node tools/page-budget.mjs
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SLUG=volume-local
R_LOCAL_STATE_ROOT="$ROOT/.runs/r-local"; export R_LOCAL_STATE_ROOT
R_LOCAL_PORT_BASE="${VOLUME_PORT_BASE:-8905}"; export R_LOCAL_PORT_BASE   # clear of dev-local (8895), the smoke (8890), the suites (8850 up)
WRANGLER_SEND_METRICS=false; export WRANGLER_SEND_METRICS
SEED="${VOLUME_SEED:-20260930}"
. "$ROOT/tools/lib-r-local.sh"
dir="$(rl_org_dir "$SLUG")"
log="$ROOT/.runs/$SLUG.log"
BRAIN_RYUKLABS="${DEV_BRAIN_RYUKLABS:-$HOME/batcave_vm/ryuklabs/ryuklabs-ops-brain}"
BRAIN_SHARINGU="${DEV_BRAIN_SHARINGU:-$HOME/batcave_vm/batcave/agent-rl-sharingu-brain}"

stop() { sh tools/r-local.sh down "$SLUG" >/dev/null 2>&1 || true; }
start() { sh tools/r-local.sh up "$SLUG" >> "$log" 2>&1 || { echo "✗ the worker did not come up — see $log and $dir/dev.log"; exit 1; }; }

case "${1:-}" in
  down) stop; echo "· $SLUG stopped (its data stays under $dir)"; exit 0 ;;
  reset) stop; rm -rf "$dir"; echo "· $SLUG stopped and its state dropped"; exit 0 ;;
  up) ;;
  *) echo "usage: sh tools/volume-local.sh {up|down|reset}" >&2; exit 2 ;;
esac

mkdir -p "$ROOT/.runs"
: > "$log"
t0=$(date +%s)
if [ ! -f "$dir/credentials.env" ]; then
  mkdir -p "$dir"
  echo "· seeding a fresh $SLUG (boot.sql, one owner) under $dir"
  sh tools/r-local.sh seed "$SLUG" >> "$log" 2>&1 || { echo "✗ seed failed — see $log"; exit 1; }
fi
echo "· starting the worker"
start
url="http://127.0.0.1:$(cat "$dir/port")"

if [ ! -f "$dir/.volume" ]; then
  SHARINGU_IMPORT_KEY="$(sed -n 's/^[A-Z0-9_]*_AGENT_R_OWNER_KEY=//p' "$dir/credentials.env" | head -1)"; export SHARINGU_IMPORT_KEY
  [ -n "$SHARINGU_IMPORT_KEY" ] || { echo "✗ no owner key in $dir/credentials.env"; exit 1; }
  for p in "siru-services Ryuklabs" "sharingu sharingu"; do
    set -- $p
    curl -sS -o /dev/null -X POST "$url/control" -H "Authorization: Bearer $SHARINGU_IMPORT_KEY" \
      --data-urlencode "action=add-project" --data-urlencode "key=$1" --data-urlencode "name=$2" >> "$log" 2>&1 || true
  done
  for p in "$BRAIN_RYUKLABS siru-services" "$BRAIN_SHARINGU sharingu"; do
    set -- $p
    if [ ! -d "$1" ]; then echo "  – $2: no brain at $1, skipped"; continue; fi
    echo "· importing $2 from $1"
    node tools/import-brain.mjs "$1" --project "$2" --url "$url" > "$ROOT/.runs/$SLUG-import-$2.log" 2>&1 \
      || { echo "✗ the $2 import failed — see .runs/$SLUG-import-$2.log"; tail -15 "$ROOT/.runs/$SLUG-import-$2.log"; exit 1; }
  done
  SHARINGU_IMPORT_KEY=""
  echo "· writing the synthetic volume (seed $SEED) into the local D1"
  stop
  cfg="$dir/wrangler.local.jsonc"
  db="$(rl_config_field "$cfg" "d['d1_databases'][0]['database_name']")"
  d1() { npx --no-install wrangler d1 execute "$db" --config "$cfg" --local --persist-to "$dir/persist" "$@" </dev/null; }
  d1 --json --command "SELECT (SELECT id FROM people WHERE role='owner' AND active=1 ORDER BY created_at LIMIT 1) AS owner;
    SELECT project, id FROM k_goals ORDER BY project, id;
    SELECT project, qid FROM k_questions ORDER BY project, qid;
    SELECT project, id FROM k_checks ORDER BY project, id;" > "$dir/volume.ids.raw" 2>> "$log" \
    || { echo "✗ could not read the org's ids — see $log"; exit 1; }
  python3 - "$dir/volume.ids.raw" "$dir/volume.ids.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
res = [x.get("results") or [] for x in r]
json.dump({"owner": res[0][0]["owner"], "goals": [[x["project"], x["id"]] for x in res[1]],
           "questions": [[x["project"], x["qid"]] for x in res[2]], "checks": [[x["project"], x["id"]] for x in res[3]]}, open(sys.argv[2], "w"))
PY
  anchor="$(date -u +%Y-%m-%dT%H:%M:00Z)"
  python3 tools/volume-local.py --ids "$dir/volume.ids.json" --anchor "$anchor" --seed "$SEED" --out "$dir/volume.sql" > "$dir/volume.counts.json"
  d1 --file "$dir/volume.sql" >> "$log" 2>&1 || { echo "✗ the volume did not apply — see $log"; exit 1; }
  printf '{"seed": %s, "anchor": "%s", "counts": %s}\n' "$SEED" "$anchor" "$(cat "$dir/volume.counts.json")" > "$dir/.volume"
  echo "  $(cat "$dir/volume.counts.json")"
  echo "· starting the worker again"
  start
fi

echo
echo "· the volume app: $url  (up in $(( $(date +%s) - t0 ))s; volume $(python3 -c "import json;v=json.load(open('$dir/.volume'));print('seed',v['seed'],'written at',v['anchor'])"))"
echo "  measure: BUDGET_URL=$url BUDGET_CREDS=$dir/credentials.env node tools/page-budget.mjs"
echo "  sign in as owner@$SLUG.local with the key in $dir/credentials.env ($(rl_orgvar "$SLUG")_AGENT_R_OWNER_KEY)"
echo "  stop: sh tools/volume-local.sh down"
