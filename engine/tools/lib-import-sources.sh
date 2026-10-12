# tools/lib-import-sources.sh — sourced, never run (S4, 2026-10-02): the ONE list of what a ship imports, shared by
# tools/import-live.sh (the import itself), tools/ship-plan.sh (the plan, read-only) and tools/dev-local.sh (the local app and
# the ship candidate's build), so the three can never disagree: the ship imports exactly what the ship candidate was built
# from. Needs ROOT (the engine directory). Defines PROJECTS and these functions:
#   source_of <project>     its source directory ("" for a project with none)
#   kind_of <project>       "source" (a source, its overlays folded in after it) or "overlays-only" (no source: the project
#                           is filed from its overlays alone, and the importer creates it when the door does not know it)
#   source_arg <project>    the importer's first argument: the source directory, or "-" for an overlays-only project
#   name_of <project>       the name the project is created with (the local app's add-project; an overlays-only project's
#                           create_project at its first import)
#   overlays_of <project>   its overlays, comma-separated ("" for none); a machine-local overlay its folder's .gitignore
#                           names and this machine lacks is SAID on stderr ("! <project> overlay <file> is not on this
#                           machine"), never skipped silently
#   renders_of <project>    its renders file when it is not the source's own ("" for none)
#   missing_inputs <project> one line per input the ship's build of the project needs and this machine lacks ("" when whole):
#                           its source (an overlays-only project needs none, but at least one overlay), a gitignored overlay,
#                           sharingu's fill files, a renders file (saruspay's board, sharingu's wireframes).
#                           tools/import-live.sh STOPS on any (G2 H3: a missing input shrank the build silently, and the old
#                           prune then removed the difference from live)
# The projects, in the order a ship imports them (IMPORT_PROJECTS, else DEV_PROJECTS, overrides the list):
#   demo · ryuklabs · siru · sharingu · bunny · saruspay — the SMALLEST first (rows written, the local measures: demo ~340
#   (2026-10-05), then the ship candidate's of 2026-10-03: ryuklabs ~600, siru ~8,900, sharingu ~15,100, bunny ~52,300,
#   saruspay ~93,100). Live D1 serves readers while the import
#   runs (the old code until traffic moves, and a project's import lands kind by kind), so a project is half-filed only for
#   its own run; smallest first makes the most projects whole soonest, and the largest (saruspay, ~30 minutes of calls)
#   goes last, when the others are already complete. The order changes no row.
# Sources (each overridable): DEV_BRAIN_RYUKLABS · DEV_SOURCE_SHARINGU (this checkout: the code layout) with
# DEV_BRAIN_SHARINGU's wireframes · DEV_BRAIN_SIRU · DEV_BRAIN_SARUSPAY · DEV_BRAIN_BUNNY; saruspay's renders
# DEV_RENDERS_SARUSPAY; sharingu's overlays DEV_OVERLAY_SHARINGU (comma-separated; `none` files the source alone), else the
# walkthrough architecture + DEV_REAL_FILL's items files; every other project's overlays are
# tools/import/overlays/<project>/*.items.json and *.ops.json together, in name order (a fill's items files, then an
# architecture filed later: m2-architecture.ops.json sorts after 1-… and b1-…). demo has no source: the website's
# pitch filed through preview → file as its five items files (sprint 4, P3), so it is an overlays-only project.
BRAIN_RYUKLABS="${DEV_BRAIN_RYUKLABS:-$HOME/batcave_vm/ryuklabs/ryuklabs-ops-brain}"
BRAIN_SHARINGU="${DEV_BRAIN_SHARINGU:-$HOME/batcave_vm/batcave/agent-rl-sharingu-brain}"
# sharingu's MODEL and checks come from this repo's own code (import-brain's `code` layout, tools/import/read-code.mjs, as
# dev-local.sh since e76a4b3e7); the old brain is only the source of its 18 wireframes. DEV_SOURCE_SHARINGU overrides it.
SOURCE_SHARINGU="${DEV_SOURCE_SHARINGU:-$(cd "$ROOT/.." && pwd)}"
BRAIN_SIRU="${DEV_BRAIN_SIRU:-$HOME/batcave_vm/siru/siru-knowledge-bank}"
BRAIN_SARUSPAY="${DEV_BRAIN_SARUSPAY:-$HOME/batcave_vm/veil/veil-saruspay-brain}"
BRAIN_BUNNY="${DEV_BRAIN_BUNNY:-$HOME/batcave_vm/bunny/board}"
PROJECTS="${IMPORT_PROJECTS:-${DEV_PROJECTS:-demo ryuklabs siru sharingu bunny saruspay}}"
REAL_FILL="${DEV_REAL_FILL:-$ROOT/tools/import/overlays/sharingu}"
RENDERS_SARUSPAY="${DEV_RENDERS_SARUSPAY:-$HOME/Desktop/SarusPay Board.html}"

# sharingu's overlays: the architecture from the code, then the real fill's knowledge items in the order they were filed
sharingu_overlays() {
  if [ -n "${DEV_OVERLAY_SHARINGU:-}" ]; then [ "$DEV_OVERLAY_SHARINGU" = none ] && echo "" || echo "$DEV_OVERLAY_SHARINGU"; return; fi
  _o="$ROOT/tools/walkthrough/sharingu-architecture.ops.json"
  for _f in k1-aim-goals k2-decisions k4-docs-gtm p1a-knowledge; do
    if [ -f "$REAL_FILL/$_f.items.json" ]; then _o="$_o,$REAL_FILL/$_f.items.json"
    else echo "! sharingu overlay $_f.items.json is not in $REAL_FILL: sharingu is imported WITHOUT it" >&2; fi
  done
  # then any LATER items or ops file in the same folder (name order), as folder_overlays lists a project's own
  for _f in "$REAL_FILL"/*.json; do
    case "$(basename "$_f")" in k1-aim-goals.items.json|k2-decisions.items.json|k4-docs-gtm.items.json|p1a-knowledge.items.json) ;; *.items.json|*.ops.json) [ -f "$_f" ] && _o="$_o,$_f" ;; esac
  done
  echo "$_o"
}
# a project's own overlays (tools/import/overlays/<project>/*.items.json and *.ops.json, together in name order)
folder_overlays() {
  _d="$ROOT/tools/import/overlays/$1"; _out=""
  [ -d "$_d" ] || { echo ""; return; }
  for _f in "$_d"/*.json; do
    case "$_f" in *.items.json|*.ops.json) if [ -f "$_f" ]; then _out="${_out:+$_out,}$_f"; fi ;; esac
  done
  if [ -f "$_d/.gitignore" ]; then
    grep -v '^#' "$_d/.gitignore" | while read -r _n; do
      if [ -n "$_n" ] && [ ! -f "$_d/$_n" ]; then echo "! $1 overlay $_n is not on this machine: $1 is imported WITHOUT it" >&2; fi
    done || true
  fi
  echo "$_out"
}
overlays_of() { case "$1" in sharingu) sharingu_overlays ;; *) folder_overlays "$1" ;; esac; }
renders_of() {
  case "$1" in
    saruspay) if [ -e "$RENDERS_SARUSPAY" ]; then echo "$RENDERS_SARUSPAY"; else echo ""; fi ;;
    sharingu) _w="$BRAIN_SHARINGU/source/board/sources/wireframe.json"; if [ -f "$_w" ]; then echo "$_w"; else echo ""; fi ;;
    *) echo "" ;;
  esac
}
source_of() {
  case "$1" in
    ryuklabs|siru-services) echo "$BRAIN_RYUKLABS" ;; sharingu) echo "$SOURCE_SHARINGU" ;; siru) echo "$BRAIN_SIRU" ;;
    saruspay) echo "$BRAIN_SARUSPAY" ;; bunny) echo "$BRAIN_BUNNY" ;; *) echo "" ;;
  esac
}
# a project with no source and overlays of its own is filed from the overlays alone
kind_of() {
  if [ -z "$(source_of "$1")" ] && [ -n "$(overlays_of "$1" 2>/dev/null)" ]; then echo overlays-only; else echo source; fi
}
source_arg() { if [ "$(kind_of "$1")" = overlays-only ]; then echo "-"; else source_of "$1"; fi; }
name_of() {
  case "$1" in
    ryuklabs|siru-services) echo "Ryuklabs" ;; sharingu) echo "sharingu" ;; siru) echo "SIRU" ;; saruspay) echo "SarusPay" ;;
    bunny) echo "BunnyEvents" ;; demo) echo "sharingu demo" ;; *) echo "$1" ;;
  esac
}
missing_inputs() {
  _s="$(source_of "$1")"
  if [ "$(kind_of "$1")" = source ] && { [ -z "$_s" ] || [ ! -d "$_s" ]; }; then echo "source ${_s:-<none known> (and no overlays of its own)}"; fi
  overlays_of "$1" 2>&1 >/dev/null | sed -n 's/^! //p'
  case "$1" in
    saruspay) [ -e "$RENDERS_SARUSPAY" ] || echo "renders $RENDERS_SARUSPAY (saruspay's screens, nav edges and lanes)" ;;
    sharingu) [ -f "$BRAIN_SHARINGU/source/board/sources/wireframe.json" ] || echo "renders $BRAIN_SHARINGU/source/board/sources/wireframe.json (sharingu's wireframes)" ;;
  esac
}
