#!/bin/sh
# day0-shape-selftest.sh — ratchets tools/lib-day0-shape.sh's day0_shape() classifier
# (bug0914:day0-verify-assumes-a-multi-project-org). Pure and fast on purpose: no network, no live
# tenant — the classifier is a pure function of an already-fetched seat count (plus a test-only
# override), so this proves it directly, the same "gate is local, fast, deterministic" law every
# other selftest in gate.sh follows. Proves the >=2 threshold is load-bearing with a MUTATION: a copy
# of the lib with the threshold raised no longer classifies a real 2-seat owner as "multi" — so this
# test would actually catch a regression that silently widened or dropped the threshold.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
. tools/lib-day0-shape.sh

pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

echo "-- classification from a real seat count --"
for pair in "0:single" "1:single" "2:multi" "5:multi"; do
  n="${pair%%:*}"; want="${pair##*:}"
  got=$(day0_shape "$n")
  [ "$got" = "$want" ] && ok "day0_shape($n) = $want" || bad "day0_shape($n) = $got (want $want)"
done

echo "-- defensive fallback: unreadable seat count never over-claims multi --"
for n in "" "abc" "-1x"; do
  got=$(day0_shape "$n")
  [ "$got" = "single" ] && ok "day0_shape('$n') = single (conservative default)" || bad "day0_shape('$n') = $got (want single)"
done

echo "-- DAY0_FORCE_SHAPE test-only override wins over real data --"
got=$(DAY0_FORCE_SHAPE=multi day0_shape 1)
[ "$got" = "multi" ] && ok "DAY0_FORCE_SHAPE=multi overrides a real single-project seat count (1)" || bad "override to multi did not win (got $got)"
got=$(DAY0_FORCE_SHAPE=single day0_shape 5)
[ "$got" = "single" ] && ok "DAY0_FORCE_SHAPE=single overrides a real multi-project seat count (5)" || bad "override to single did not win (got $got)"
got=$(DAY0_FORCE_SHAPE=bogus day0_shape 5)
[ "$got" = "multi" ] && ok "an unrecognized DAY0_FORCE_SHAPE value is ignored, falls back to real data" || bad "bogus override was not ignored (got $got)"

echo "-- mutation: the >=2 threshold is load-bearing --"
T="$(mktemp -d "${TMPDIR:-/tmp}/ar-day0-shape-mut.XXXXXX")"; trap 'rm -rf "$T"' EXIT
python3 - "$ENGINE/tools/lib-day0-shape.sh" "$T/mutated.sh" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()
mutated = re.sub(r'\[ "\$1" -ge 2 \]', '[ "$1" -ge 200 ]', s, count=1)
if mutated == s:
    sys.exit(3)
open(dst, "w").write(mutated)
PY
RC=$?
if [ "$RC" -ne 0 ]; then
  bad "mutation: could not raise the threshold in a copy — this selftest is stale against lib-day0-shape.sh's current shape"
else
  (
    unset DAY0_FORCE_SHAPE
    . "$T/mutated.sh"
    [ "$(day0_shape 2)" = "single" ]
  )
  if [ $? -eq 0 ]; then
    ok "mutation: raising the threshold makes a real 2-seat owner misclassify as single — the >=2 check is what decides the shape, not a vacuous default"
  else
    bad "mutation: raising the threshold did NOT change day0_shape(2) — the threshold isn't what's deciding the shape"
  fi
fi

echo "day0-shape-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
