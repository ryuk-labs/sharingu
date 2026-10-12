#!/bin/sh
# tools/import-live.sh — THIS SHIP's import, against a worker URL (a version PREVIEW during a ship, so live D1 is full before any
# traffic moves): every project through the MCP door, a small probe first, then each project whole, the smallest first.
#   SHIP_PREVIEW_URL=<url> SHARINGU_IMPORT_KEY=<the owner's key, in the env only> sh tools/import-live.sh
# As a ship hook:  SHIP_PREVIEW_HOOK='sh tools/import-live.sh' sh tools/ship.sh ryuklabs
# WHAT: the projects, their sources, overlays and renders come from tools/lib-import-sources.sh — the same list
# tools/dev-local.sh builds the ship candidate from and tools/ship-plan.sh prints: demo · ryuklabs · siru · sharingu · bunny ·
# saruspay (IMPORT_PROJECTS, else DEV_PROJECTS, overrides it). An OVERLAYS-ONLY project (no source: demo, the website's pitch)
# is filed from its overlays alone (the importer's source `-`), and created with create_project at its first import, named as
# the list names it. EVERY INPUT MUST BE ON THIS MACHINE (G2 H3): a source, a
# gitignored overlay, sharingu's fill files, a renders file (saruspay's board, sharingu's wireframes) — one missing STOPS the
# run before anything is sent (lib-import-sources.sh missing_inputs), never a warning: a smaller build reads as stale data.
# ORDER, smallest first (lib-import-sources.sh says why): live D1 serves readers while the import runs, and a project lands
# kind by kind, so a project is half-filed only for its own run; smallest first makes the most projects whole soonest.
# THE PLAN decides the batch size (2026-10-02, the ryuklabs account is on Workers Paid): the plan is read the way the budget
# guard reads it (tools/cf-budget.sh --json; for a local URL IMPORT_PLAN=paid|free states it, default free). On paid a call
# carries IMPORT_MAX_OPS=200 ops (the door's cap, and the size the local measure was taken at, so the estimate is the
# measure); on free 50 (the free plan's 10 ms of CPU and 50 D1 queries a request). IMPORT_MAX_OPS overrides either.
# THE PROBE (kept on both plans; the render ladder of 1-5-10-20 a call is gone, it only existed for free CPU): before
# anything large, two calls that the full run then REPLAYS (the same batches, the same clientRefs, so they write nothing
# twice): 1. ryuklabs' aim (one op: the door, the key, the new code's knowledge write and a live D1 write, in one cheap
# call) · 2. sharingu's first question batch at the real size (a question is three statements: its row, its options'
# delete and insert — the heaviest batch the import sends; on paid it proves the 30 s CPU default and the per-request D1
# query limit still hold at 200 ops). Only when both land does the rest go.
# ROWS WRITTEN FIRST (tools/import/cost.mjs): before anything is sent, every project's run is estimated from its local measure
# (.runs/import-cost-<project>.json, IMPORT_COST_DIR moves it; written by a local import: sh tools/dev-local.sh up) at this
# run's batch size, the whole plan is summed and checked against the plan's budget (free: today's, under the guard's 95%
# line; paid: the period's included rows, the overage priced, the absurd refused); refused, nothing is sent. Each project's
# own run checks again. IMPORT_BUDGET_LEFT=<n> (+ IMPORT_BUDGET_PLAN=paid) stands in for the budget read (a test seam).
# IT STOPS AT THE FIRST REFUSAL: a probe, a project or a read-back that fails prints the importer's own refusal line, the
# door's answer and how to resume, and exits 1 — no later project is touched. A re-run is safe and RESUMES: every batch
# already filed answers as a replay (its clientRef, a hash of the batch) and writes nothing.
# It passes only when every kind of every project reads back as built: stored == built, or stored > built where every
# extra row is one the prune's plan KEEPS on purpose (a person's own filing). THE PRUNE (G2 H3, the independent review: the old
# IMPORT_PRUNE=1 removed every stored-not-built row, people's own filings with them): before a project's import, its plan is
# made, read-only (tools/ship/prune.mjs --plan, the rule in tools/ship/prune-plan.mjs: a stale row goes only when the import's
# own identity made and last changed it and no write that was not an import touched it, or when an owner's ruling in
# tools/ship/prune-rulings.json names it), written to IMPORT_PRUNE_OUT (default .runs/ship-prune/<project>.json) — every
# project's plan BEFORE anything is sent. A plan that removes nothing lets its project go. A plan that removes something STOPS
# the run before anything is sent, unless IMPORT_PRUNE_PLANS=<dir> holds that project's REVIEWED plan (<dir>/<project>.json,
# a copy of the one written; the ship runs once without it — the dry run — and again with it): then the
# reviewed plan's goals go first (the old tree leaves in the call that files the new one), the import runs, the rest of the
# reviewed plan goes, and the read-back runs again. A reviewed plan removes only what it names and only while each item
# stands as it was read (tools/ship/prune.mjs --apply); the cap is its --max (3000). IMPORT_PRUNE=1 is gone: it refuses.
# It never prints the key.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
[ -z "${IMPORT_PRUNE:-}" ] || { echo "✗ IMPORT_PRUNE=1 is gone (G2 H3): a prune removes only what a REVIEWED plan names — run without it, read the plans it writes under .runs/ship-prune/, then re-run with IMPORT_PRUNE_PLANS=<the directory holding them>" >&2; exit 2; }
URL="${SHIP_PREVIEW_URL:-${1:-}}"
[ -n "$URL" ] || { echo "usage: SHIP_PREVIEW_URL=<worker url> SHARINGU_IMPORT_KEY=<owner key> sh tools/import-live.sh" >&2; exit 2; }
[ -n "${SHARINGU_IMPORT_KEY:-}" ] || { echo "✗ SHARINGU_IMPORT_KEY is not set (the owner's key, in the env only)" >&2; exit 2; }
. "$ROOT/tools/lib-import-sources.sh"
mkdir -p "$ROOT/.runs"
is_local=0
case "$URL" in http://127.*|http://localhost|http://localhost[:/]*|http://0.0.0.0*|http://\[::1\]*) is_local=1 ;; esac

# the plan → the batch size
if [ "$is_local" = 1 ]; then PLAN="${IMPORT_PLAN:-free}"; PLAN_FROM="IMPORT_PLAN (a local worker)"
elif [ -n "${IMPORT_BUDGET_LEFT:-}" ]; then PLAN="${IMPORT_BUDGET_PLAN:-free}"; PLAN_FROM="IMPORT_BUDGET_PLAN (the test seam)"
else
  PLAN=$(sh tools/cf-budget.sh --json 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin).get('plan','free'))" 2>/dev/null) || PLAN=""
  [ -n "$PLAN" ] || { echo "  ✗ the plan could not be read (tools/cf-budget.sh --json): nothing was sent"; exit 1; }
  PLAN_FROM="tools/cf-budget.sh"
fi
case "$PLAN" in paid) MAX="${IMPORT_MAX_OPS:-200}" ;; *) MAX="${IMPORT_MAX_OPS:-50}" ;; esac
echo "· plan: $PLAN ($PLAN_FROM) — batches of $MAX ops a call; projects, smallest first: $PROJECTS"

run() {   # <project> <max-ops> <log> <extra args…>
  _p="$1"; _m="$2"; _l="$3"; shift 3
  _r="$(renders_of "$_p")"; _o="$(overlays_of "$_p")"; _n=""; [ "$(kind_of "$_p")" = source ] || _n="$(name_of "$_p")"
  node tools/import-brain.mjs "$(source_arg "$_p")" --project "$_p" --url "$URL" --max-ops "$_m" ${_r:+--renders "$_r"} ${_o:+--overlay "$_o"} ${_n:+--name "$_n"} "$@" > "$_l" 2>&1
}
# failed <what> <log>: which batch failed (the importer's own line), the door's answer, and how to resume — then STOP
failed() {
  echo "  ✗ STOPPED: $1 — see $2"
  grep -E "REFUSED|gave up|refused|did not" "$2" | head -3 | sed 's/^/    /' || true
  tail -12 "$2" | sed 's/^/    | /'
  echo "  nothing after this point was sent. Re-run 'sh tools/import-live.sh' to resume: every batch already filed replays by"
  echo "  its clientRef and writes nothing; if a batch is over a per-request limit, lower IMPORT_MAX_OPS (now $MAX) first."
  exit 1
}
for project in $PROJECTS; do
  [ "$(kind_of "$project")" = source ] || continue   # an overlays-only project: missing_inputs below checks its overlays
  b="$(source_of "$project")"
  [ -n "$b" ] || { echo "  ✗ STOPPED: no source is known for project $project (and it has no overlays of its own)"; exit 1; }
  [ -d "$b" ] || { echo "  ✗ STOPPED: no source at $b (project $project)"; exit 1; }
done
# every input of every project, before anything is sent (G2 H3: a missing overlay or renders file is a STOP, never a warning)
miss=""
for project in $PROJECTS; do
  m="$(missing_inputs "$project")"
  [ -z "$m" ] || miss="$miss$(printf '%s\n' "$m" | sed "s/^/    $project: /")
"
done
if [ -n "$miss" ]; then
  echo "  ✗ STOPPED: an input of this import is not on this machine; nothing was sent:"
  printf '%s' "$miss"
  echo "  put it in place (or name the projects to import with IMPORT_PROJECTS), then re-run."
  exit 1
fi

# 0 · the rows the whole import will write, from the local measure, against the plan's budget — before anything is sent
#     (a local worker, DEV_IMPORT=live in dev-local.sh: a project with no measure yet is measured by this run instead)
echo "· the rows this import will write (estimated from the local measure, batches of $MAX)"
total=0
for project in $PROJECTS; do
  log="$ROOT/.runs/import-live-estimate-$project.log"
  r="$(renders_of "$project")"; ov="$(overlays_of "$project")"
  if ! node tools/import-brain.mjs "$(source_arg "$project")" --project "$project" --dry-run --max-ops "$MAX" ${r:+--renders "$r"} ${ov:+--overlay "$ov"} \
    --estimate-from "${IMPORT_COST_DIR:-$ROOT/.runs}/import-cost-$project.json" > "$log" 2>&1; then
    if [ "$is_local" = 1 ]; then echo "  – $project: no measure holds yet (a local worker: this run measures it)"; continue; fi
    failed "$project: no rows-written measure holds for this run (measure it on the local worker first: sh tools/dev-local.sh up)" "$log"
  fi
  n=$(sed -n 's/^  this run will write about \([0-9,]*\) rows.*/\1/p' "$log" | tr -d ,)
  [ -n "$n" ] || failed "$project: the estimate printed no total" "$log"
  echo "  $project: about $n rows written"
  total=$((total + n))
done
echo "  all: about $total rows written (the worst case: a batch already filed replays and writes nothing)"
node tools/import/cost.mjs --check "$total" --url "$URL" || { echo "  ✗ STOPPED: the import does not fit the plan's budget: nothing was sent. Split it (IMPORT_PROJECTS, or one project's --only kinds) or wait for the reset."; exit 1; }

# 0b · the prune's plans, read-only, for EVERY project before anything is sent: what each database holds that this build no
#      longer files, and what the rule removes and keeps. One that removes something needs its reviewed copy in
#      IMPORT_PRUNE_PLANS, else the run STOPS here, every plan written for one reading.
PLANS_OUT="${IMPORT_PRUNE_OUT:-$ROOT/.runs/ship-prune}"; mkdir -p "$PLANS_OUT"
prune_plan() {   # <project> <plan.json> <log> -> prune.mjs's exit (0 nothing to remove, 3 removals listed)
  _r="$(renders_of "$1")"; _o="$(overlays_of "$1" 2>/dev/null)"
  node tools/ship/prune.mjs "$(source_arg "$1")" --project "$1" --url "$URL" ${_r:+--renders "$_r"} ${_o:+--overlay "$_o"} --plan "$2" > "$3" 2>&1
}
echo "· the prune's plans (read-only): $PLANS_OUT"
unreviewed=""; reviewed=" "
for project in $PROJECTS; do
  plog="$ROOT/.runs/import-live-prune-plan-$project.log"
  prc=0; prune_plan "$project" "$PLANS_OUT/$project.json" "$plog" || prc=$?
  case "$prc" in
    0) echo "  $project: nothing to remove" ;;
    3) sed 's/^/  /' "$plog"
       if [ -n "${IMPORT_PRUNE_PLANS:-}" ] && [ -f "$IMPORT_PRUNE_PLANS/$project.json" ]; then
         reviewed="$reviewed $project "
         echo "    reviewed: $IMPORT_PRUNE_PLANS/$project.json (the apply removes only what it names, as it stands)"
       else unreviewed="$unreviewed $project"; fi ;;
    *) failed "$project: the prune's plan could not be made (an input missing, or a read failed)" "$plog" ;;
  esac
done
if [ -n "$unreviewed" ]; then
  echo "  ✗ STOPPED before anything was sent: the plan of${unreviewed} removes rows. Read each plan in $PLANS_OUT (every row by"
  echo "    kind and ref, with why; and what it keeps, and why). To go on, copy the reviewed plans into a directory and re-run"
  echo "    with IMPORT_PRUNE_PLANS=<that directory>: each removes only what it names, and only while each row stands as read."
  exit 1
fi

# 1 · the probe: two calls the full run replays
listed() { case " $PROJECTS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
probe1=""; listed ryuklabs && probe1=ryuklabs; [ -z "$probe1" ] && listed siru-services && probe1=siru-services
if [ -n "$probe1" ]; then
  echo "· probe 1: $probe1's aim, one call (the same batch the full run files: it replays)"
  log="$ROOT/.runs/import-live-probe1.log"
  run "$probe1" "$MAX" "$log" --only aim --max-batches 1 || failed "probe 1 ($probe1's aim)" "$log"
  echo "  ✓ probe 1 landed"
fi
if listed sharingu; then
  echo "· probe 2: sharingu's first question batch, $MAX ops in one call"
  log="$ROOT/.runs/import-live-probe2.log"
  run sharingu "$MAX" "$log" --only question --max-batches 1 || failed "probe 2 (one question batch of $MAX)" "$log"
  grep -E "^[[:space:]]+\[1/1\]" "$log" | sed 's/^/ /' || true
  echo "  ✓ probe 2 landed"
fi

# 2 · each project whole, smallest first; the first refusal stops the run (a reviewed plan's goals before, the rest after)
for project in $PROJECTS; do
  log="$ROOT/.runs/import-live-$project.log"
  rev=""; case "$reviewed" in *" $project "*) rev="$IMPORT_PRUNE_PLANS/$project.json" ;; esac
  if [ -n "$rev" ]; then
    echo "· $project: the reviewed plan $rev removes what it names: the old goals first, in the call that files the build's own"
    glog="$ROOT/.runs/import-live-prune-goals-$project.log"
    node tools/ship/prune.mjs --apply "$rev" --url "$URL" --only goal > "$glog" 2>&1 || failed "$project: the reviewed plan's goals were refused" "$glog"
    grep -q "removed" "$glog" && sed 's/^/    /' "$glog"
  fi
  echo "· importing $project, $MAX ops a call"
  run "$project" "$MAX" "$log" || failed "the $project import" "$log"
  if [ -n "$rev" ]; then
    alog="$ROOT/.runs/import-live-prune-$project.log"
    node tools/ship/prune.mjs --apply "$rev" --url "$URL" --except goal > "$alog" 2>&1 || failed "$project: the reviewed plan was refused" "$alog"
    sed 's/^/    /' "$alog"
    run "$project" "$MAX" "$log" || failed "the $project import (the read-back after the prune)" "$log"
  fi
  lines=$(grep -E "^ +[a-z_]+ +built +[0-9]+ +stored " "$log" || true)
  [ -n "$lines" ] || failed "$project: no read-back (source vs stored) in the log" "$log"
  printf '%s\n' "$lines" | sed 's/^/  /'
  more=$(printf '%s\n' "$lines" | awk '$5 ~ /^[0-9]+$/ && $5 > $3 { printf "%s%s (%d more)", (n++ ? ", " : ""), $1, $5 - $3 }')
  kept_ok=""
  if [ -n "$more" ]; then
    # stored > built: every extra row must be one a fresh plan KEEPS on purpose (a person's own); one it would remove is a STOP
    plan2="$PLANS_OUT/$project.after.json"; plog2="$ROOT/.runs/import-live-prune-after-$project.log"
    prc=0; prune_plan "$project" "$plan2" "$plog2" || prc=$?
    [ "$prc" = 0 ] || failed "$project: the database holds rows this build no longer files — $more — and a plan made now would remove some of them (see $plan2): the run did not go as reviewed" "$plog2"
    kept_ok=1
    echo "  · $project keeps $(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['counts']['kept'])" "$plan2") row(s) the build no longer files that a person made or changed (each listed in $plan2): stored > built on purpose"
  fi
  # every kind: "built N  stored N  =" — or stored > built when the plan keeps the extra rows; anything else (a ?, fewer) fails
  bad=$(printf '%s\n' "$lines" | awk -v k="$kept_ok" '{ if (!(($3 == $5 && $6 == "=" && NF == 6) || (k == "1" && $5 ~ /^[0-9]+$/ && $5 > $3))) print }')
  [ -z "$bad" ] || failed "$project: a kind did not read back as built" "$log"
  echo "  ✓ $project: stored == built for every kind${kept_ok:+ (and the rows a person made, kept)}"
done
echo "✓ the import is whole: $(echo $PROJECTS | wc -w | tr -d ' ') project(s), stored == built for every kind"
