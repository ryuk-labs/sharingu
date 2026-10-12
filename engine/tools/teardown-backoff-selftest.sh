#!/bin/sh
# teardown-backoff-selftest.sh — ratchets tools/lib-teardown-backoff.sh's wait_absent()
# (bug0914:day0-verify-assumes-a-multi-project-org, the paired defect: teardown-org.sh's own "prove
# gone" step read Cloudflare's list API exactly once, immediately after DELETE, and reported a
# resource "still listed" that read gone 30s later — Cloudflare's own list-read lag, not a real
# leftover). DI'd throughout: the "reads" here are canned answers, never a real Cloudflare call, and
# _td_sleep is redefined to a no-op so this selftest runs in well under a second — the bound/
# attempt-count bookkeeping is what's under test, never a real wall-clock wait.
cd "$(dirname "$0")/.." || exit 1
. tools/lib-teardown-backoff.sh
_td_sleep() { :; }   # no real waiting — proves the RETRY LOGIC, not the clock

pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

# wait_absent's own read_cmd runs inside the command-substitution SUBSHELL wait_absent is called
# from — a plain shell variable incremented there would vanish when the subshell exits, so every
# canned-answer function below counts its own calls in a counter FILE instead (real state, visible
# after the subshell is gone).
CNT="$(mktemp "${TMPDIR:-/tmp}/ar-teardown-backoff-cnt.XXXXXX")"; trap 'rm -f "$CNT"' EXIT
_bump() { n=$(($(cat "$CNT" 2>/dev/null || echo 0) + 1)); echo "$n" > "$CNT"; echo "$n"; }

echo "-- settles within the bound: present, present, gone --"
: > "$CNT"
_seq_check() {
  n=$(_bump)
  case "$n" in 1|2) echo yes ;; *) echo no ;; esac
}
OUT=$(TEARDOWN_BACKOFF_MAX_S=100 TEARDOWN_BACKOFF_INITIAL_S=2 wait_absent "seq" _seq_check 2>/dev/null); RC=$?
READS=$(cat "$CNT")
if [ "$RC" -eq 0 ] && [ "$OUT" = "no" ] && [ "$READS" -eq 3 ]; then
  ok "settles: 2 present reads then gone -> wait_absent reports absent (rc=0) after exactly 3 reads"
else
  bad "settles: rc=$RC out='$OUT' reads=$READS (want rc=0, out=no, 3 reads)"
fi

echo "-- never settles: still present past the bound -> INCOMPLETE --"
_always_present() { echo yes; }
OUT2=$(TEARDOWN_BACKOFF_MAX_S=5 TEARDOWN_BACKOFF_INITIAL_S=2 wait_absent "stuck" _always_present 2>/dev/null); RC2=$?
if [ "$RC2" -ne 0 ] && [ "$OUT2" = "yes" ]; then
  ok "never settles: a resource that never reports gone within the bound -> INCOMPLETE (rc=$RC2, ans=yes)"
else
  bad "never settles: rc=$RC2 out='$OUT2' (want a non-zero rc and out=yes)"
fi

echo "-- an unreadable API response ('unknown') is retried, never treated as gone --"
: > "$CNT"
_unknown_then_gone() {
  n=$(_bump)
  case "$n" in 1) echo unknown ;; *) echo no ;; esac
}
OUT3=$(TEARDOWN_BACKOFF_MAX_S=100 TEARDOWN_BACKOFF_INITIAL_S=2 wait_absent "unk" _unknown_then_gone 2>/dev/null); RC3=$?
READS3=$(cat "$CNT")
if [ "$RC3" -eq 0 ] && [ "$OUT3" = "no" ] && [ "$READS3" -eq 2 ]; then
  ok "unknown: an unreadable read is retried (not gone) — settles once a real read confirms absence"
else
  bad "unknown: rc=$RC3 out='$OUT3' reads=$READS3 (want rc=0, out=no, 2 reads)"
fi

echo "-- an immediately-gone resource makes exactly one read, no waiting --"
: > "$CNT"
_immediate() { _bump >/dev/null; echo no; }
OUT4=$(TEARDOWN_BACKOFF_MAX_S=60 wait_absent "fast" _immediate 2>/dev/null); RC4=$?
READS4=$(cat "$CNT")
if [ "$RC4" -eq 0 ] && [ "$OUT4" = "no" ] && [ "$READS4" -eq 1 ]; then
  ok "immediate: a resource already gone on the first read never triggers a wait"
else
  bad "immediate: rc=$RC4 out='$OUT4' reads=$READS4 (want rc=0, out=no, 1 read)"
fi

echo "teardown-backoff-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
