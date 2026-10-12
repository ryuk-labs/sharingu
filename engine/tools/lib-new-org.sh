# tools/lib-new-org.sh — the recovery + test-fault seam of tools/new-org.sh
# (bug0914:new-org-crashes-after-create-on-a-seed-without-manifest). Pure shell,
# no network of its own; sourced, never copied. Two jobs:
#
#   no_fault <stage>   a TEST-ONLY fault hook: NEW_ORG_FAULT_AFTER=<stage> makes the CALLER exit 91
#                       at that exact point, simulating a real failure (a network blip, a bad
#                       wrangler call) without needing one to actually happen. Dormant unless a test
#                       sets the var. Stage names are the real points the callers pass through, in
#                       order: new-org.sh d1 · r2 · kv · config · boot · deploy · allow (past the deploy
#                       the trap is cleared: a refused allow rolls nothing back).
#
#   no_recover <slug>  called from new-org.sh's own `trap 'no_recover "$SLUG"' EXIT`. Fires ONLY when
#                       the triggering exit code is non-zero AND at least one Cloudflare resource was
#                       already created (NO_CREATED=1 — new-org.sh sets it right after the D1 create,
#                       the first create). ALWAYS prints the exact teardown command — never an orphan
#                       with no recovery line (the measured defect: a crash after D1/R2/KV existed
#                       left them orphaned with nothing telling the caller how to remove them). By
#                       default (NEW_ORG_ROLLBACK_ON_FAIL=1, the default) it also RUNS that teardown:
#                       a half-made deployment is disposable by construction (ORG-SETUP.md) and can't
#                       serve traffic anyway, so leaving it live only spends D1/cron-cap headroom for
#                       no benefit. NEW_ORG_ROLLBACK_ON_FAIL=0 opts out, for someone who wants to
#                       inspect the partial state before it's gone.
#
# NEW_ORG_TEARDOWN_CMD lets a selftest point "the teardown command" at a stub instead of the real
# tools/teardown-org.sh, so this recovery/rollback LOGIC is provable with zero Cloudflare calls
# (tools/new-org-selftest.sh, the gate step). Deliberately unquoted below — it is a short trusted
# command string ("sh tools/teardown-org.sh" or a test's own stub path), never untrusted input.

no_teardown_cmd() {
  printf '%s' "${NEW_ORG_TEARDOWN_CMD:-sh tools/teardown-org.sh}"
}

no_fault() {
  stage="$1"
  if [ "${NEW_ORG_FAULT_AFTER:-}" = "$stage" ]; then
    echo "  ✗ NEW_ORG_FAULT_AFTER=$stage — simulated failure (test-only fault hook, tools/lib-new-org.sh)" >&2
    exit 91
  fi
}

no_recover() {
  rc=$?
  slug="$1"
  [ "$rc" -eq 0 ] && return 0
  [ "${NO_CREATED:-0}" = "1" ] || return 0
  echo ""
  echo "✗ new-org $slug failed (exit $rc) after at least one Cloudflare resource was created."
  echo "  RECOVER: $(no_teardown_cmd) $slug"
  if [ "${NEW_ORG_ROLLBACK_ON_FAIL:-1}" = "1" ]; then
    echo "  · rolling back automatically (default — disable with NEW_ORG_ROLLBACK_ON_FAIL=0) ..."
    if $(no_teardown_cmd) "$slug"; then
      echo "  ✓ rollback complete — $slug resources removed, nothing orphaned"
    else
      echo "  ⚠ automatic rollback itself failed — recover by hand: $(no_teardown_cmd) $slug"
    fi
  else
    echo "  · NEW_ORG_ROLLBACK_ON_FAIL=0 — not rolling back automatically; run the command above when ready"
  fi
  return 0
}
