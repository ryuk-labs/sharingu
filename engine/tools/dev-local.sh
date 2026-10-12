#!/bin/sh
# tools/dev-local.sh — the local app with REAL data: a persistent local worker (org dev-local, its own state under
# .runs/r-local/ and its own port) whose D1 is filled by the importer through the MCP door. Open it in a browser after
# any slice. Local only: no Cloudflare call. It never prints a key.
#   sh tools/dev-local.sh up       start it (seeded on the first run), make sure every project exists, import every source
#   sh tools/dev-local.sh down     stop it; the data stays on disk
#   sh tools/dev-local.sh reset    stop it and drop its state (the next `up` starts from nothing; needed after a new migration)
# The projects, their sources, overlays, renders and names are tools/lib-import-sources.sh's: the ONE list the ship's import
# (tools/import-live.sh) and its plan (tools/ship-plan.sh) read, so the local app and the ship candidate are built from
# exactly what the ship imports. Override the list with DEV_PROJECTS, each source with its DEV_BRAIN_* variable (that file
# names them):
#   demo          <- no source: its overlays alone (tools/import/overlays/demo/, the website's pitch); the importer creates it
#   ryuklabs      <- ~/batcave_vm/ryuklabs/ryuklabs-ops-brain      (kit; the brain still keys it `siru-services`: the key is
#                    data, the import files it as `ryuklabs`. DEV_PROJECTS naming `siru-services` imports it under the old key)
#   siru          <- ~/batcave_vm/siru/siru-knowledge-bank         (bank)
#   sharingu      <- this repo's code (DEV_SOURCE_SHARINGU · code); its wireframes from the old brain (DEV_BRAIN_SHARINGU)
#   bunny         <- ~/batcave_vm/bunny/board                      (board; read only, never run)
#   saruspay      <- ~/batcave_vm/veil/veil-saruspay-brain         (pack)
# The screens' renders (kinds style and render, docs/plan/ARCHITECTURE.md §11) ride the same import: each source's own (the
# kit's wireframe spec, bunny's board.html, siru's atlas shots); saruspay's are the Desktop board file
# (DEV_RENDERS_SARUSPAY, default ~/Desktop/"SarusPay Board.html": its newer build's screens are filed with them).
# Every project's import carries its OVERLAYS (import-brain.mjs --overlay, folded in after the source): sharingu's
# architecture rewritten from the code and the knowledge its real fill filed (DEV_OVERLAY_SHARINGU, comma-separated, replaces
# the list; `none` files the source alone); every other project's tools/import/overlays/<project>/*.items.json and *.ops.json,
# in name order. A machine-local overlay this machine lacks is said, never skipped silently.
# DEV_SLUG names another org (its own state, logs .runs/<slug>.log and .runs/import-<slug>-<project>.log); with
# DEV_PORT_BASE it runs beside the shared dev-local without touching it. DEV_ENGINE runs the worker from another engine
# directory (a FROZEN copy of the code, e.g. `git archive <sha> engine` with node_modules linked) while the importer stays
# this checkout's; DEV_STATE_ROOT moves the org's state, DEV_LOG_DIR the logs, IMPORT_COST_DIR the rows-written measures.
# DEV_OWNER_NAME seeds the org's owner under that display name (default "Local Owner"): the ship candidate is seeded with
# the org's real owner (DEV_OWNER_NAME=Ryuk, initials RY), as live has it. A FRESH seed only (an org already seeded keeps
# its owner; `reset` first) — and only with an engine (DEV_ENGINE) whose tools/lib-r-local.sh reads R_LOCAL_OWNER_NAME:
# the seed is checked after and a mismatch is said. A name only: no email, no credential.
# Every import here is a MEASURE (tools/import/cost.mjs): the worker's own count of the D1 rows each call writes is printed
# per project ("rows written N") and kept in .runs/import-cost-<project>.json, the file tools/import-live.sh estimates a
# live import from. A fresh org measures what an import inserts (the worst case); `reset` first to measure again.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SLUG="${DEV_SLUG:-dev-local}"
ENGINE_RUN="${DEV_ENGINE:-$ROOT}"
[ -f "$ENGINE_RUN/tools/r-local.sh" ] || { echo "✗ DEV_ENGINE=$ENGINE_RUN holds no tools/r-local.sh"; exit 2; }
ENGINE_RUN="$(cd "$ENGINE_RUN" && pwd)"
R_LOCAL_STATE_ROOT="${DEV_STATE_ROOT:-$ROOT/.runs/r-local}"; export R_LOCAL_STATE_ROOT
LOG_DIR="${DEV_LOG_DIR:-$ROOT/.runs}"
R_LOCAL_PORT_BASE="${DEV_PORT_BASE:-8895}"; export R_LOCAL_PORT_BASE   # clear of the smoke (8890) and the suites (8850 up)
WRANGLER_SEND_METRICS=false; export WRANGLER_SEND_METRICS
. "$ENGINE_RUN/tools/lib-r-local.sh"
dir="$(rl_org_dir "$SLUG")"
log="$LOG_DIR/$SLUG.log"
. "$ROOT/tools/lib-import-sources.sh"
ilog() { if [ "$SLUG" = dev-local ]; then echo "$LOG_DIR/import-$1.log"; else echo "$LOG_DIR/import-$SLUG-$1.log"; fi; }
rlocal() { sh "$ENGINE_RUN/tools/r-local.sh" "$@"; }

stop() { rlocal down "$SLUG" >/dev/null 2>&1 || true; }

case "${1:-}" in
  down) stop; echo "· $SLUG stopped (its data stays under $dir)"; exit 0 ;;
  reset) stop; rm -rf "$dir"; echo "· $SLUG stopped and its state dropped"; exit 0 ;;
  up) ;;
  *) echo "usage: sh tools/dev-local.sh {up|down|reset}" >&2; exit 2 ;;
esac

mkdir -p "$ROOT/.runs" "$LOG_DIR"
: > "$log"
if [ -n "${DEV_OWNER_NAME:-}" ]; then R_LOCAL_OWNER_NAME="$DEV_OWNER_NAME"; export R_LOCAL_OWNER_NAME; fi
if [ ! -f "$dir/credentials.env" ]; then
  mkdir -p "$dir"
  echo "· seeding a fresh $SLUG (boot.sql, one owner${DEV_OWNER_NAME:+: $DEV_OWNER_NAME}) under $dir"
  rlocal seed "$SLUG" >> "$log" 2>&1 || { echo "✗ seed failed — see $log"; exit 1; }
  if [ -n "${DEV_OWNER_NAME:-}" ]; then
    seeded_owner="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["owner"]["name"])' "$dir/seed.default.json" 2>/dev/null || echo '?')"
    [ "$seeded_owner" = "$(echo "$DEV_OWNER_NAME" | tr -s ' ' | sed 's/^ //;s/ $//')" ] || echo "! DEV_OWNER_NAME=$DEV_OWNER_NAME but the seed's owner is \"$seeded_owner\": the engine at $ENGINE_RUN predates R_LOCAL_OWNER_NAME (freeze a HEAD that has it)" >&2
  fi
elif [ -n "${DEV_OWNER_NAME:-}" ]; then
  echo "! DEV_OWNER_NAME applies to a fresh seed only: $SLUG is already seeded (its owner is unchanged; \`reset\` first)" >&2
fi
echo "· starting the worker"
rlocal up "$SLUG" >> "$log" 2>&1 || { echo "✗ the worker did not come up — see $log and $dir/dev.log"; exit 1; }
url="http://127.0.0.1:$(cat "$dir/port")"

# the owner key stays in this process's env only: never echoed, never an argument
SHARINGU_IMPORT_KEY="$(sed -n 's/^[A-Z0-9_]*_AGENT_R_OWNER_KEY=//p' "$dir/credentials.env" | head -1)"; export SHARINGU_IMPORT_KEY
[ -n "$SHARINGU_IMPORT_KEY" ] || { echo "✗ no owner key in $dir/credentials.env"; exit 1; }

add_project() {   # <key> <name> — POST /control add-project; an existing project answers its own flash and changes nothing
  curl -sS -o /dev/null -X POST "$url/control" -H "Authorization: Bearer $SHARINGU_IMPORT_KEY" \
    --data-urlencode "action=add-project" --data-urlencode "key=$1" --data-urlencode "name=$2" >> "$log" 2>&1 || true
}
echo "· the projects: $PROJECTS"
# an overlays-only project is NOT added here: the importer creates it through the door, as the ship's import does on live
for p in $PROJECTS; do if [ "$(kind_of "$p")" = source ]; then add_project "$p" "$(name_of "$p")"; fi; done

rc=0
import() {   # <project>: its source (or - for an overlays-only project, created by the importer under its name)
  s="$(source_arg "$1")"; n=""
  if [ "$s" = "-" ]; then n="$(name_of "$1")"
  elif [ -z "$s" ]; then echo "  – $1: no source is known for this project (and no overlays of its own), skipped"; return 0
  elif [ ! -d "$s" ]; then echo "  – $1: no source at $s, skipped"; return 0; fi
  il="$(ilog "$1")"
  echo "· importing $1 from $([ "$s" = "-" ] && echo "its overlays alone" || echo "$s")"
  r="$(renders_of "$1")"; ov="$(overlays_of "$1")"
  node tools/import-brain.mjs "$s" --project "$1" --url "$url" ${r:+--renders "$r"} ${ov:+--overlay "$ov"} ${n:+--name "$n"} > "$il" 2>&1 \
    && { grep -E "^ *(project|total|validation:|renders|rows written|measure)|built +[0-9]+ +stored|merged onto" "$il" || true; } \
    || { rc=1; echo "✗ the $1 import failed — see $il"; tail -15 "$il"; }
}
if [ "${DEV_IMPORT:-}" = "live" ]; then
  # rehearse the ship's own import step (tools/import-live.sh: a small probe first, then batches of 50) against this worker
  SHIP_PREVIEW_URL="$url" IMPORT_PROJECTS="$PROJECTS" sh tools/import-live.sh || rc=1
else
  for p in $PROJECTS; do import "$p"; done
fi

echo
echo "· the local app: $url"
echo "  sign in as owner@$SLUG.local with the key in $dir/credentials.env ($(rl_orgvar "$SLUG")_AGENT_R_OWNER_KEY)"
echo "  stop: $([ "$SLUG" = dev-local ] || echo "DEV_SLUG=$SLUG ")sh tools/dev-local.sh down"
exit "$rc"
