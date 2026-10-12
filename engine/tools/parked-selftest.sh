#!/bin/sh
# tools/parked-selftest.sh — the OFFLINE proof of tools/lib.sh's PARKED BY NAME list (owner ruling QB54D2BC4,
# 2026-09-25: platform + ryuklabs only until all green; batch park-other-projects-evals). A gate step.
#
# Sources the REAL tools/lib.sh (AR_SKIP_MINT=1: no local R, no budget guard, no wrangler, no curl — the same offline
# invariant tools/suite-target-selftest.sh proves) inside a throwaway engine tree and asserts:
#   1  with E196d on the list, `parked E196d` prints `  SKIP  E196d parked (owner 2026-09-25: platform + ryuklabs
#      only)`, returns 0, skip=1
#   1b every id on the REAL PARKED_CASES parks: one named line each, skip = the list's size
#   2  `parked E9` (not listed) returns 1, prints nothing, skip stays 0
#   3  with PARKED_CASES emptied, `parked E196d` returns 1 — the one-list un-park
#   4  pick_project with bunny parked on {projects:[bunny,sharingu,ryuklabs]} -> sharingu; a single-project
#      seat -> ''; PARKED_PROJECTS emptied -> bunny (the un-park restores projects[0])
#      (MINT_PROJECTS emptied for 4, so it pins the denylist fallback alone)
#   4b the REAL PARKED_PROJECTS is honored: {projects:[<every parked name>…, sharingu, ryuklabs]} -> sharingu
#   4c the allowlist: with the REAL MINT_PROJECTS (tools/lib-mint-seat.sh) and PARKED_PROJECTS emptied,
#      {projects:[bunny,ev197,ryuklabs,sharingu]} -> ryuklabs (the first entry ON the list, never bunny/ev197)
#   5  every id on PARKED_CASES is wrapped by a `parked <id>` call in evals.sh or sims.sh — a listed id that parks
#      nothing is drift. A wrap whose id is NOT listed is inert (parked returns 1, the case runs) and is exactly the
#      state a one-list un-park leaves behind, so it is reported, never failed — the un-park needs no other edit.
# Checks 1-4 force their own list, so the gate stays green after an un-park; 1b/4b/4c/5 read the real ones.
# PARKED_SELFTEST_LIB (optional) points at a MUTANT lib.sh; PARKED_SELFTEST_SUITES (optional) at a space-separated
# list of mutant suite files — how the PR proves each check can fail.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
LIB_SRC="${PARKED_SELFTEST_LIB:-$ENGINE/tools/lib.sh}"
SUITES="${PARKED_SELFTEST_SUITES:-$ENGINE/evals.sh $ENGINE/sims.sh}"
T="$(mktemp -d "${TMPDIR:-/tmp}/ar-parked.XXXXXX")"
trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

mkdir -p "$T/engine/tools" "$T/home"
cp "$LIB_SRC" "$T/engine/tools/lib.sh"
cp "$ENGINE/tools/lib-mint-seat.sh" "$ENGINE/tools/lib-logout-ruling.sh" "$ENGINE/tools/lib-r-local.sh" "$T/engine/tools/"
: > "$T/env.sh"

# probe <shell snippet> — runs the snippet after sourcing lib.sh the way evals.sh does, env-scrubbed and offline
probe() {
  printf '%s\n' '#!/bin/sh' '. "$(dirname "$0")/tools/lib.sh"' "$1" > "$T/engine/probe.sh"
  (cd "$T/engine" && env -i HOME="$T/home" PATH="$PATH" TMPDIR="$T" SHARINGU_ENV_PATH="$T/env.sh" AR_SKIP_MINT=1 \
     AR_RUN_LOG=/dev/null sh probe.sh 2>&1)
}

OUT=$(probe 'PARKED_CASES="E901 E196d"; parked E196d; echo "RC=$? skip=$skip"')
{ printf '%s\n' "$OUT" | grep -qx '  SKIP  E196d parked (owner 2026-09-25: platform + ryuklabs only)' \
  && printf '%s\n' "$OUT" | grep -qx 'RC=0 skip=1'; } \
  && ok "1 parked E196d prints the named SKIP, returns 0 and counts skip=1" \
  || { bad "1 parked E196d"; printf '%s\n' "$OUT" | tail -3 | sed 's/^/        /'; }

OUT=$(probe 'N=0; for i in $PARKED_CASES; do parked "$i" || echo "NOTPARKED $i"; N=$((N+1)); done; echo "N=$N skip=$skip"')
N1B=$(printf '%s\n' "$OUT" | grep -c ' parked (owner 2026-09-25: platform + ryuklabs only)$')
{ ! printf '%s\n' "$OUT" | grep -q NOTPARKED && printf '%s\n' "$OUT" | grep -qx "N=$N1B skip=$N1B"; } \
  && ok "1b every id on the real PARKED_CASES ($N1B) prints its named SKIP and counts" \
  || { bad "1b the real list"; printf '%s\n' "$OUT" | tail -3 | sed 's/^/        /'; }

OUT=$(probe 'PARKED_CASES="E901 E196d"; parked E9; echo "RC=$? skip=$skip"')
[ "$OUT" = "RC=1 skip=0" ] \
  && ok "2 parked E9 (unlisted) returns 1, prints nothing, skip stays 0" \
  || { bad "2 parked E9"; printf '%s\n' "$OUT" | tail -3 | sed 's/^/        /'; }

OUT=$(probe 'PARKED_CASES=""; parked E196d; echo "RC=$? skip=$skip"')
[ "$OUT" = "RC=1 skip=0" ] \
  && ok "3 PARKED_CASES emptied: parked E196d returns 1 — the one-list un-park" \
  || { bad "3 un-park"; printf '%s\n' "$OUT" | tail -3 | sed 's/^/        /'; }

printf '%s\n' '{"projects":["bunny","sharingu","ryuklabs"]}' > "$T/engine/w3.json"
printf '%s\n' '{"projects":["bunny"]}' > "$T/engine/w1.json"
printf '%s\n' '{"projects":["bunny","sharingu"]}' > "$T/engine/w2.json"
OUT=$(probe 'MINT_PROJECTS=""; PARKED_PROJECTS="siru bunny"; echo "A=[$(pick_project < w3.json)]"; echo "B=[$(pick_project < w1.json)]"
PARKED_PROJECTS=""; echo "C=[$(pick_project < w2.json)]"')
{ printf '%s\n' "$OUT" | grep -qx 'A=\[sharingu\]' && printf '%s\n' "$OUT" | grep -qx 'B=\[\]' \
  && printf '%s\n' "$OUT" | grep -qx 'C=\[bunny\]'; } \
  && ok "4 pick_project skips a parked project (bunny,sharingu,… -> sharingu); single seat -> ''; un-parked -> projects[0]" \
  || { bad "4 pick_project"; printf '%s\n' "$OUT" | tail -3 | sed 's/^/        /'; }

OUT=$(probe 'J=$(python3 -c "import json,sys;print(json.dumps({\"projects\":sys.argv[1:]+[\"sharingu\",\"ryuklabs\"]}))" $PARKED_PROJECTS)
echo "D=[$(echo "$J" | pick_project)]"')
printf '%s\n' "$OUT" | grep -qx 'D=\[sharingu\]' \
  && ok "4b the real PARKED_PROJECTS are all skipped by pick_project (-> sharingu)" \
  || { bad "4b the real PARKED_PROJECTS"; printf '%s\n' "$OUT" | tail -3 | sed 's/^/        /'; }

printf '%s\n' '{"projects":["bunny","ev197","ryuklabs","sharingu"]}' > "$T/engine/w4.json"
OUT=$(probe 'PARKED_PROJECTS=""; echo "M=[$MINT_PROJECTS]"; echo "E=[$(pick_project < w4.json)]"')
{ printf '%s\n' "$OUT" | grep -qx 'M=\[sharingu ryuklabs\]' && printf '%s\n' "$OUT" | grep -qx 'E=\[ryuklabs\]'; } \
  && ok "4c pick_project prefers the real MINT_PROJECTS (bunny,ev197,ryuklabs,sharingu -> ryuklabs)" \
  || { bad "4c the MINT_PROJECTS allowlist"; printf '%s\n' "$OUT" | tail -3 | sed 's/^/        /'; }

# 5 — the list and the wraps agree. The list is read from the lib under test; the wraps from the suites, comment lines
# stripped first so a `parked E1` in a comment never counts.
LISTED=$(probe 'echo "$PARKED_CASES"' | tr ' ' '\n' | grep . | sort -u)
WRAPPED=$(for f in $SUITES; do grep -v '^[[:space:]]*#' "$f"; done | grep -oE '(^|[^_[:alnum:]])parked E[0-9]+[a-z]*' \
          | grep -oE 'E[0-9]+[a-z]*' | sort -u)
ORPHAN=$(printf '%s\n' "$LISTED" | grep -vxF "$(printf '%s\n' "$WRAPPED")" | grep . | tr '\n' ' ')
UNLISTED=$(printf '%s\n' "$WRAPPED" | grep -vxF "$(printf '%s\n' "$LISTED")" | grep . | tr '\n' ' ')
[ -z "$ORPHAN" ] \
  && ok "5 every PARKED_CASES id ($(printf '%s\n' "$LISTED" | grep -c .)) is wrapped by a parked call in the suites" \
  || bad "5 list/wrap drift — listed but no parked call wraps it: [${ORPHAN}]"
[ -n "$UNLISTED" ] && echo "  INFO  wrapped but not listed (un-parked, the case runs): ${UNLISTED}"

echo "parked-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
