#!/bin/sh
# tools/suite-target-selftest.sh — the OFFLINE proof of tools/lib.sh's TARGET switch (owner ruling Q9CF32D8F,
# 2026-09-25: local first; --live is the opt-in and is budget-guarded). A gate step.
#
# The REAL tools/lib.sh, tools/lib-mint-seat.sh and tools/lib-logout-ruling.sh are copied into a throwaway engine
# tree whose tools/r-local.sh and tools/cf-budget.sh are STUBS that log each call; `npx` (every wrangler call) and
# `curl` are stubs first on PATH that log their argv. HOME and SHARINGU_ENV_PATH point into the tree (fake
# credentials, so even a leaked real call could not authenticate). A probe script sources lib.sh the way evals.sh
# does and prints what it bound. Cases:
#   default          target=local · the local org is seeded and started · the budget guard is NEVER
#                    called · every mint wrangler call is --local --persist-to, never --remote · U is the loopback
#                    URL · the three-line credentials are gone from every child's env · exit stops what it started
#   --live           the budget guard runs BEFORE the first wrangler call (the mint) · mint is --remote · no r-local
#   SUITE_TARGET=live  the same, from the environment (how a --only slice carries it)
#   live + refuse    the guard exits 2 → the suite exits 2 with NO wrangler call and no Cloudflare API call
#   already up       a local org this run did not start is reused (no seed/up) and left running at exit
#   SUITE_LOCAL_KEEP=1  a local org this run started is left running at exit (the slice loop)
#   AR_SKIP_MINT=1   neither the local org, nor the guard, nor wrangler, nor curl (the gate's offline invariant)
#   bogus target     SUITE_TARGET=staging → exit 2
#   helpers          live_only prints `SKIP <id> (live-only: …)` and returns 0 on local, returns 1 silently on live;
#                    suite_d1 is --local on local and --remote on live
# SUITE_TARGET_SELFTEST_LIB (optional) points at a MUTANT lib.sh — how the PR proves each check can fail.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
LIB_SRC="${SUITE_TARGET_SELFTEST_LIB:-$ENGINE/tools/lib.sh}"
T="$(mktemp -d "${TMPDIR:-/tmp}/ar-suite-target.XXXXXX")"
BGPID=""
trap '[ -n "$BGPID" ] && { kill "$BGPID"; wait "$BGPID"; } 2>/dev/null; rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

mkdir -p "$T/engine/tools" "$T/bin" "$T/home"
cp "$LIB_SRC" "$T/engine/tools/lib.sh"
cp "$ENGINE/tools/lib-mint-seat.sh" "$ENGINE/tools/lib-logout-ruling.sh" "$ENGINE/tools/lib-r-local.sh" "$T/engine/tools/"
cat > "$T/env.sh" <<'EOF'
CLOUDFLARE_API_TOKEN=stub-secret-token
CLOUDFLARE_ACCOUNT_ID=stub-account
GH_TOKEN=stub-gh
EOF

# the stub r-local: logs the verb + whether a CF credential reached it; `up` writes the files a real up leaves
cat > "$T/engine/tools/r-local.sh" <<'EOF'
#!/bin/sh
echo "r-local $1 $2 cftoken=[${CLOUDFLARE_API_TOKEN:-}]" >> "$STUB_LOG"
d="$R_LOCAL_STATE_ROOT/$2"; mkdir -p "$d/persist"
case "$1" in
  seed) touch "$d/.seeded";;
  up) printf '8899' > "$d/port"
      printf '{ "d1_databases": [ { "binding": "DB", "database_name": "stub-local-db", "database_id": "x" } ] }\n' > "$d/wrangler.local.jsonc"
      sh -c 'sleep 30' >/dev/null 2>&1 & echo $! > "$d/wrangler.pid"; echo $! >> "$STUB_PIDS";;
  down) kill "$(cat "$d/wrangler.pid" 2>/dev/null)" 2>/dev/null; rm -f "$d/wrangler.pid";;
esac
exit 0
EOF
cat > "$T/engine/tools/cf-budget.sh" <<'EOF'
#!/bin/sh
echo "cf-budget rc=${STUB_BUDGET_RC:-0}" >> "$STUB_LOG"
exit "${STUB_BUDGET_RC:-0}"
EOF
cat > "$T/bin/npx" <<'EOF'
#!/bin/sh
echo "npx $* cftoken=[${CLOUDFLARE_API_TOKEN:-}]" >> "$STUB_LOG"
exit 0
EOF
cat > "$T/bin/curl" <<'EOF'
#!/bin/sh
echo "curl $*" >> "$STUB_LOG"
case "$*" in *workers/subdomain*) echo '{"success":true,"result":{"subdomain":"stubsub"}}';; esac
exit 0
EOF
chmod +x "$T/bin/"*
cat > "$T/engine/probe.sh" <<'EOF'
#!/bin/sh
. "$(dirname "$0")/tools/lib.sh"
echo "PROBE target=[$SUITE_TARGET] U=[$U] K=[$([ -n "$K" ] && echo set)] DBNAME=[$DBNAME] cftoken=[${CLOUDFLARE_API_TOKEN:-}] started=[$SUITE_LOCAL_STARTED]"
live_only E999 "a probe case" && echo "PROBE live_only=skipped" || echo "PROBE live_only=runs"
[ -n "$AR_SKIP_MINT" ] || suite_d1 "SELECT 1" >/dev/null
echo "PROBE skip=$skip"
EOF

# run <case> [args] — env-scrubbed; sets OUT RC LOG
run() {
  _c="$1"; shift
  LOG="$T/$_c.log"; : > "$LOG"; : > "$T/pids"
  OUT=$(cd "$T/engine" && env -i HOME="$T/home" PATH="$T/bin:$PATH" TMPDIR="$T" SHARINGU_ENV_PATH="$T/env.sh" \
        R_LOCAL_STATE_ROOT="$T/state-$_c" STUB_LOG="$LOG" STUB_PIDS="$T/pids" STUB_BUDGET_RC="${STUB_BUDGET_RC:-0}" \
        ${SUITE_TARGET:+SUITE_TARGET="$SUITE_TARGET"} ${AR_SKIP_MINT:+AR_SKIP_MINT="$AR_SKIP_MINT"} ${SUITE_LOCAL_KEEP:+SUITE_LOCAL_KEEP="$SUITE_LOCAL_KEEP"} \
        sh probe.sh "$@" 2>&1); RC=$?
  [ -n "$SUITE_TARGET_SELFTEST_VERBOSE" ] && printf '%s\n' "── case $_c (rc $RC)" "$OUT" "── log" "$(cat "$LOG")" | sed 's/^/    | /'
  for _p in $(cat "$T/pids" 2>/dev/null); do kill "$_p" 2>/dev/null; done
  unset STUB_BUDGET_RC SUITE_TARGET AR_SKIP_MINT SUITE_LOCAL_KEEP
}
has()   { grep -q -- "$1" "$LOG"; }
nhas()  { ! grep -q -- "$1" "$LOG"; }
first() { grep -n -- "$1" "$LOG" | head -1 | cut -d: -f1; }
before() { _a=$(first "$1"); _b=$(first "$2"); [ -n "$_a" ] && [ -n "$_b" ] && [ "$_a" -lt "$_b" ]; }
says()  { printf '%s\n' "$OUT" | grep -q -- "$1"; }
chk() { if eval "$2"; then ok "$1"; else bad "$1 — rc=$RC"; printf '%s\n' "$OUT" | tail -5 | sed 's/^/        /'; sed 's/^/        log: /' "$LOG" | tail -8; fi; }

run default
chk "default: target=local, U = the local loopback URL, DBNAME = the local config's database" \
  '[ $RC -eq 0 ] && says "PROBE target=\[local\] U=\[http://127.0.0.1:8899\] K=\[set\] DBNAME=\[stub-local-db\]"'
chk "default: the local org is seeded and started (in that order); the budget guard is NEVER called" \
  'before "r-local seed" "r-local up" && nhas "r-local publish" && nhas "cf-budget"'
chk "default: every wrangler call is --local --persist-to, none --remote; no Cloudflare API call" \
  'has "npx.*d1 execute stub-local-db --config .* --local --persist-to" && nhas "--remote" && nhas "api.cloudflare.com"'
chk "default: the three-line credentials reach no child (r-local, wrangler) and are gone from the suite's env" \
  'nhas "cftoken=\[stub" && says "cftoken=\[\]"'
chk "default: exit stops the local org this run started (and clears the minted seats first)" \
  'before "npx.*mint-cleanup" "r-local down" || { has "r-local down" && has "npx.*d1 execute"; }'
chk "default: live_only prints SKIP <id> (live-only: <reason>), counts a skip, and skips the body" \
  'says "SKIP  E999 (live-only: a probe case)" && says "PROBE live_only=skipped" && says "PROBE skip=1"'

run live --live
chk "--live: the budget guard runs BEFORE the first wrangler call (the mint's first write)" \
  '[ $RC -eq 0 ] && says "PROBE target=\[live\]" && before "cf-budget" "npx" && [ "$(grep -c cf-budget "$LOG")" = 1 ]'
chk "--live: mint and suite_d1 are --remote against the live db; the local org is never touched" \
  'has "npx.*d1 execute ryuklabs-agent-r --remote" && nhas "r-local" && nhas "--local"'
chk "--live: live_only lets the case run (returns 1, prints nothing)" \
  'says "PROBE live_only=runs" && ! says "live-only:" && says "PROBE skip=0"'

SUITE_TARGET=live run envlive
chk "SUITE_TARGET=live (how a --only slice carries it): guard first, then --remote" \
  '[ $RC -eq 0 ] && says "PROBE target=\[live\]" && before "cf-budget" "npx" && nhas "r-local"'

STUB_BUDGET_RC=2 run refuse --live
chk "--live with the guard refusing (exit 2): the suite exits 2 — no wrangler call, no Cloudflare API call, nothing minted" \
  '[ $RC -eq 2 ] && has "cf-budget rc=2" && nhas "npx" && nhas "curl" && ! says "PROBE"'
STUB_BUDGET_RC=3 run unreadable --live
chk "--live with the guard unable to read the usage (exit 3): refused the same way" '[ $RC -ne 0 ] && nhas "npx" && ! says "PROBE"'

# a local org this run did NOT start: reused as-is, left running
mkdir -p "$T/state-upalready/ryuklabs-local/persist"; touch "$T/state-upalready/ryuklabs-local/.seeded"
printf '8898' > "$T/state-upalready/ryuklabs-local/port"
printf '{ "d1_databases": [ { "database_name": "stub-local-db" } ] }\n' > "$T/state-upalready/ryuklabs-local/wrangler.local.jsonc"
sh -c 'sleep 30' >/dev/null 2>&1 & BGPID=$!; echo "$BGPID" > "$T/state-upalready/ryuklabs-local/wrangler.pid"
run upalready
chk "a local org already up: reused (no seed, no up), U = its port, and NOT stopped at exit" \
  '[ $RC -eq 0 ] && says "U=\[http://127.0.0.1:8898\]" && nhas "r-local" && kill -0 "$BGPID" 2>/dev/null'

SUITE_LOCAL_KEEP=1 run keep
chk "SUITE_LOCAL_KEEP=1: the local org this run started is left up for the next run (no down at exit)" \
  '[ $RC -eq 0 ] && has "r-local up" && nhas "r-local down"'

AR_SKIP_MINT=1 run skipmint
chk "AR_SKIP_MINT=1 (the gate's offline selftests): no local org, no budget guard, no wrangler, no curl" \
  '[ $RC -eq 0 ] && [ ! -s "$LOG" ]'

SUITE_TARGET=staging run bogus
chk "SUITE_TARGET=staging: refused (exit 2) before anything runs" '[ $RC -eq 2 ] && [ ! -s "$LOG" ]'

echo "suite-target-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
