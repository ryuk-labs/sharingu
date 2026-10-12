# tools/lib-teardown-backoff.sh — bounded-backoff re-read for teardown-org.sh's own "prove gone" step
# (bug0914:day0-verify-assumes-a-multi-project-org, the paired defect: measured live 2026-09-14 —
# `sh tools/teardown-org.sh <slug>` run right after use reported "worker <slug>-agent-r still listed
# (yes)" and exited INCOMPLETE; the SAME command 30s later read 4/4 gone. Cloudflare's own list API
# lags a DELETE by a few seconds — reading it exactly once, immediately after the delete calls, was
# measuring that read-after-write lag, not a real leftover resource.
#
# wait_absent <label> <read_cmd> — repeatedly runs <read_cmd> (a shell function name or command
# string — eval'd, so a selftest can DI its own canned answers with zero network) until it prints
# "no" (confirmed absent) or the bound is spent. Exponential backoff between reads:
#   TEARDOWN_BACKOFF_INITIAL_S (default 2), doubling, capped at TEARDOWN_BACKOFF_CAP_S (default 15),
#   total bound TEARDOWN_BACKOFF_MAX_S (default 60).
# Prints <read_cmd>'s own last answer ("no"/"yes"/"unknown") and returns 0 if it settled to "no"
# within the bound, 1 otherwise — a genuine leftover, or an API response teardown-org.sh could never
# parse, is still reported INCOMPLETE after the full bound, never silently passed.
#
# _td_sleep is the ONE seam a selftest redefines (after sourcing this file) to skip real wall-clock
# waiting while the bound/attempt-count bookkeeping — the actual logic under test — still runs for
# real; teardown-org.sh itself never touches it.
_td_sleep() { sleep "$1"; }

wait_absent() {
  _wa_label="$1"; _wa_read="$2"
  _wa_max="${TEARDOWN_BACKOFF_MAX_S:-60}"
  _wa_delay="${TEARDOWN_BACKOFF_INITIAL_S:-2}"
  _wa_cap="${TEARDOWN_BACKOFF_CAP_S:-15}"
  _wa_elapsed=0
  while :; do
    _wa_ans=$(eval "$_wa_read")
    if [ "$_wa_ans" = "no" ]; then printf 'no'; return 0; fi
    if [ "$_wa_elapsed" -ge "$_wa_max" ]; then printf '%s' "$_wa_ans"; return 1; fi
    _wa_step="$_wa_delay"
    if [ $((_wa_elapsed + _wa_step)) -gt "$_wa_max" ]; then _wa_step=$((_wa_max - _wa_elapsed)); fi
    [ "$_wa_step" -le 0 ] && _wa_step=1
    echo "    · $_wa_label still listed ($_wa_ans) — retrying in ${_wa_step}s (${_wa_elapsed}s/${_wa_max}s elapsed)" >&2
    _td_sleep "$_wa_step"
    _wa_elapsed=$((_wa_elapsed + _wa_step))
    _wa_delay=$((_wa_delay * 2))
    [ "$_wa_delay" -gt "$_wa_cap" ] && _wa_delay="$_wa_cap"
  done
}
