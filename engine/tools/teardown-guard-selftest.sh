#!/bin/sh
# teardown-guard-selftest.sh — ratchets teardown-org.sh's protected-name guard (R3): siru · ryuklabs ·
# frame must be refused BY NAME, before any credential check or Cloudflare API call, no matter what —
# no credentials in env, no pool file, nothing. Proves the guard is load-bearing with a MUTATION: a
# copy of the script with the guard's case block removed is shown to no longer refuse the same way
# (it falls through to the ordinary credential check instead) — so this test would actually catch a
# regression that silently dropped the guard, not just confirm some exit path exists today.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

for name in siru ryuklabs frame; do
  OUT=$(env -i PATH="$PATH" HOME=/nonexistent sh tools/teardown-org.sh "$name" 2>&1); RC=$?
  if [ "$RC" -ne 0 ] && printf '%s' "$OUT" | grep -qi "protected"; then
    ok "teardown-org.sh $name refuses by name, no credentials needed to reach the refusal"
  else
    bad "teardown-org.sh $name did not refuse cleanly (rc=$RC): $(printf '%s' "$OUT" | head -1)"
  fi
done

T="$(mktemp -d "${TMPDIR:-/tmp}/ar-teardown-mut.XXXXXX")"; trap 'rm -rf "$T"' EXIT
python3 - "$ENGINE/tools/teardown-org.sh" "$T/mutated.sh" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()
mutated = re.sub(r'case "\$SLUG" in\n  siru\|ryuklabs\|frame\)\n.*?\n    ;;\nesac\n', '', s, count=1, flags=re.S)
if mutated == s:
    sys.exit(3)
open(dst, "w").write(mutated)
PY
RC=$?
if [ "$RC" -ne 0 ]; then
  bad "mutation: could not remove the name-guard block from a copy — this selftest is stale against tools/teardown-org.sh's current shape"
else
  chmod +x "$T/mutated.sh"
  OUT=$(env -i PATH="$PATH" HOME=/nonexistent sh "$T/mutated.sh" siru 2>&1)
  if printf '%s' "$OUT" | grep -qi "protected"; then
    bad "mutation: the guard-stripped copy STILL refused 'siru' by name — the guard is not what is protecting it"
  else
    ok "mutation: with the guard removed, 'siru' no longer refuses by name (falls through to the ordinary flow) — the guard is load-bearing"
  fi
fi

echo "teardown-guard-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
