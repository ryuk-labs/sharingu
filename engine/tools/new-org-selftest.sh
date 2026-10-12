#!/bin/sh
# tools/new-org-selftest.sh — the GATE step for new-org.sh's recovery seam (bug0914:new-org-crashes-after-create-on-a-seed-
# without-manifest). Pure and fast on purpose: NO wrangler process, NO network, NO Cloudflare account
# — same "gate is local, fast, deterministic" law every other selftest in gate.sh follows. (Its seed-validator half went with
# tools/day0-seed.sh and tools/validate-seed.py, deleted in the sprint-7 review, 7.6.) Proves:
#
#   1. tools/lib-new-org.sh's `no_fault` fires (exit 91) ONLY when NEW_ORG_FAULT_AFTER matches the
#      exact stage passed in, and is a silent no-op otherwise.
#   2. tools/lib-new-org.sh's `no_recover` — the trap new-org.sh registers — does NOTHING on a clean
#      exit (rc=0) and does NOTHING when no Cloudflare resource was created yet (NO_CREATED != 1),
#      even on a failing rc: nothing to roll back, nothing to recover.
#   3. `no_recover` with NO_CREATED=1 and a failing rc ALWAYS prints the exact recovery command, and
#      by default (NEW_ORG_ROLLBACK_ON_FAIL unset) also RUNS it (NEW_ORG_TEARDOWN_CMD points this run
#      at a stub instead of the real tools/teardown-org.sh, so this is provable with zero Cloudflare
#      calls); NEW_ORG_ROLLBACK_ON_FAIL=0 suppresses the run but keeps the printed recovery line —
#      never a silent orphan either way.
#
# `. tools/lib-new-org.sh` (new-org.sh's seam) is the SAME file the tool actually sources — this test exercises production
# code, not a restatement of it.
# new-org.sh itself takes no seed (an empty platform, sprint 7, 7.6): its walk is tools/new-org-flow-selftest.sh.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
. "$ROOT/tools/lib-new-org.sh"

pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; fail=$((fail + 1)); }

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/new-org-selftest.XXXXXX")"
trap 'rm -rf "$SCRATCH"' EXIT

echo "== new-org-selftest =="

echo "-- no_fault (tools/lib-new-org.sh) — fires ONLY on the matching stage --"
FAULT_RC=0
(NEW_ORG_FAULT_AFTER=d1 no_fault d1) >/dev/null 2>&1 || FAULT_RC=$?
[ "$FAULT_RC" -eq 91 ] && ok "no_fault: NEW_ORG_FAULT_AFTER=d1 + no_fault d1 -> exit 91" || bad "no_fault: matching stage did not exit 91 (rc=$FAULT_RC)"

FAULT_RC=0
(NEW_ORG_FAULT_AFTER=d1 no_fault r2) >/dev/null 2>&1 || FAULT_RC=$?
[ "$FAULT_RC" -eq 0 ] && ok "no_fault: a non-matching stage is a silent no-op" || bad "no_fault: fired for the wrong stage (rc=$FAULT_RC)"

FAULT_RC=0
(no_fault d1) >/dev/null 2>&1 || FAULT_RC=$?
[ "$FAULT_RC" -eq 0 ] && ok "no_fault: unset NEW_ORG_FAULT_AFTER never fires" || bad "no_fault: fired with the hook unset (rc=$FAULT_RC)"

echo "-- no_recover (tools/lib-new-org.sh) — the trap new-org.sh registers --"
# Each case below runs an actual `trap 'no_recover ...' EXIT` under `set -e` in a subshell — the SAME
# mechanism new-org.sh itself uses (never a hand-simulated call), so $? at no_recover's own entry is
# whatever really triggered the subshell's exit, exactly as it is in production.
STUB="$SCRATCH/stub-teardown.sh"
MARKER="$SCRATCH/teardown-called"
cat > "$STUB" <<EOF
#!/bin/sh
echo "\$1" > "$MARKER"
exit 0
EOF
chmod +x "$STUB"

rm -f "$MARKER"
( set -e; NO_CREATED=1; NEW_ORG_TEARDOWN_CMD="sh $STUB"
  trap 'no_recover "kit-x"' EXIT
  true ) >/dev/null 2>&1 || true
[ -f "$MARKER" ] && bad "no_recover: ran recovery on a CLEAN exit (rc=0) — should be a no-op" || ok "no_recover: a clean exit (rc=0) never triggers recovery"

rm -f "$MARKER"
( set -e; NO_CREATED=0; NEW_ORG_TEARDOWN_CMD="sh $STUB"
  trap 'no_recover "kit-x"' EXIT
  false ) >/dev/null 2>&1 || true
[ -f "$MARKER" ] && bad "no_recover: ran recovery with NO_CREATED=0 (nothing was created) — should be a no-op" || ok "no_recover: NO_CREATED=0 never triggers recovery, even on a failing rc"

rm -f "$MARKER"
OUT=$( ( set -e; NO_CREATED=1; NEW_ORG_TEARDOWN_CMD="sh $STUB"
  trap 'no_recover "kit-x"' EXIT
  false ) 2>&1 || true )
if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "kit-x" ]; then
  ok "no_recover: NO_CREATED=1 + a failing rc runs the teardown command (default NEW_ORG_ROLLBACK_ON_FAIL) with the right slug"
else
  bad "no_recover: did not run the teardown stub with slug 'kit-x' on a failing rc with NO_CREATED=1"
fi
printf '%s' "$OUT" | grep -q "RECOVER: sh $STUB kit-x" \
  && ok "no_recover: prints the exact recovery command" \
  || bad "no_recover: did not print the exact recovery command — output: $OUT"

rm -f "$MARKER"
OUT2=$( ( set -e; NO_CREATED=1; NEW_ORG_TEARDOWN_CMD="sh $STUB"; NEW_ORG_ROLLBACK_ON_FAIL=0
  trap 'no_recover "kit-x"' EXIT
  false ) 2>&1 || true )
if [ -f "$MARKER" ]; then
  bad "no_recover: ran the teardown stub even with NEW_ORG_ROLLBACK_ON_FAIL=0"
else
  ok "no_recover: NEW_ORG_ROLLBACK_ON_FAIL=0 suppresses the automatic rollback"
fi
printf '%s' "$OUT2" | grep -q "RECOVER: sh $STUB kit-x" \
  && ok "no_recover: still prints the recovery command with rollback disabled — never a silent orphan" \
  || bad "no_recover: dropped the recovery line when rollback is disabled — output: $OUT2"

echo ""
echo "new-org-selftest: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
