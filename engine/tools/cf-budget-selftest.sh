#!/bin/sh
# tools/cf-budget-selftest.sh — the OFFLINE proof of tools/cf-budget.sh, the Cloudflare budget guard (owner ruling
# Q9CF32D8F, 2026-09-25; the plan is read first since 2026-10-02). A gate step.
#
# The REAL tools/cf-budget.sh is copied into a throwaway engine tree; a stub `curl` FIRST on PATH answers by URL: the
# subscriptions GET (the plan) by STUB_PLAN, the GraphQL POST (the usage) by STUB_CASE; HOME and SHARINGU_ENV_PATH point
# into the throwaway tree (fake credentials — ~/.sharingu is never read, so even a leaked real call could not
# authenticate). No network. Branches (each asserts the exit code AND the printed verdict):
#   FREE (STUB_PLAN refused — the token cannot read billing — and no CF_PLAN: the default)
#   below      10% of every limit              → exit 0, the three lines + the 00:00 UTC reset, no WARN
#   warn       85% of rows read                → exit 0 + a WARN naming d1 rows read
#   refuse     96% of rows WRITTEN alone       → exit 2, REFUSE naming d1 rows written + the 00:00 UTC reset
#   unreadable the stub prints garbage         → exit 3 REFUSE (a guard that cannot look must not pass)
#   unreadable the stub exits 7 (no network)   → exit 3 REFUSE
#   unreadable an errors[] answer              → exit 3 REFUSE
#   unreadable no credentials                  → exit 3 REFUSE, and curl is never called
#   PAID (the account lists workers_paid with its billing period; or the account cannot say and CF_PLAN=paid)
#   paid below   under 80% of the included amounts → exit 0; the subscription's period start is the query's window
#   paid warn    41M of 50M rows written       → exit 0 + WARN naming d1 rows written
#   paid over    52M rows written              → exit 0, WARN + the overage priced ($2.00 at $1 a million)
#   paid refuse  56M rows written ($6)         → exit 2 REFUSE (the $5 line)
#   CF_PLAN=paid when the account cannot say   → paid from CF_PLAN over the last 31 days (96% of a free day passes)
#   the account says free, CF_PLAN says paid   → free (the account wins)
#   CF_PLAN=bogus                              → exit 3 REFUSE, nothing read
# plus: the token never reaches curl's argv (it travels in a header file), the query asks for all three metrics for the
# right window, and --json keeps stdout one parseable object carrying the plan.
# CF_BUDGET_SELFTEST_SRC (optional) points at a MUTANT copy — how the PR proves each check can fail.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
SRC="${CF_BUDGET_SELFTEST_SRC:-$ENGINE/tools/cf-budget.sh}"
T="$(mktemp -d "${TMPDIR:-/tmp}/ar-cfb-selftest.XXXXXX")"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

mkdir -p "$T/engine/tools" "$T/bin" "$T/home"
cp "$SRC" "$T/engine/tools/cf-budget.sh"
cat > "$T/env.sh" <<'EOF'
CLOUDFLARE_API_TOKEN=stub-secret-token-do-not-leak
CLOUDFLARE_ACCOUNT_ID=stub-account
EOF
: > "$T/empty-env.sh"

cat > "$T/bin/curl" <<'EOF'
#!/bin/sh
# curl stub — logs its argv (to prove the token never rides on it) and the POSTed body; answers the subscriptions GET
# by STUB_PLAN and the GraphQL POST by STUB_CASE
echo "curl $*" >> "$STUB_LOG"
for a in "$@"; do case "$a" in @*) f="${a#@}"; [ -f "$f" ] && { echo "file $(basename "$f"):"; cat "$f"; echo; } >> "$STUB_BODY";; esac; done
case "$*" in
  */subscriptions*)
    case "${STUB_PLAN:-refused}" in
      paid)    echo '{"success":true,"errors":[],"result":[{"state":"Paid","current_period_start":"2026-09-07T00:00:00Z","current_period_end":"2026-10-07T00:00:00Z","rate_plan":{"id":"r2_paid","public_name":"R2 Paid"}},{"state":"Paid","current_period_start":"2026-09-07T00:00:00Z","current_period_end":"2026-10-07T00:00:00Z","rate_plan":{"id":"workers_paid","public_name":"Workers Paid"}}]}';;
      free)    echo '{"success":true,"errors":[],"result":[{"state":"Paid","current_period_start":null,"rate_plan":{"id":"free","public_name":"Cloudflare Free Plan","scope":"zone"}}]}';;
      refused) echo '{"success":false,"errors":[{"code":10000,"message":"Authentication error"}],"result":null}';;
    esac; exit 0;;
esac
case "$STUB_CASE" in
  pbelow)  echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":90000}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":16000000,"rowsWritten":380000}}]}]}},"errors":null}';;
  pwarn)   echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":90000}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":16000000,"rowsWritten":41000000}}]}]}},"errors":null}';;
  pover)   echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":90000}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":16000000,"rowsWritten":52000000}}]}]}},"errors":null}';;
  prefuse) echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":90000}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":16000000,"rowsWritten":56000000}}]}]}},"errors":null}';;
  below)   echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":10000}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":300000,"rowsWritten":6000}},{"sum":{"rowsRead":200000,"rowsWritten":4000}}]}]}},"errors":null}';;
  warn)    echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":5000}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":4250000,"rowsWritten":20000}}]}]}},"errors":null}';;
  refuse)  echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":5000}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":1000000,"rowsWritten":96000}}]}]}},"errors":null}';;
  garbage) echo '<html>502 Bad Gateway</html>';;
  errors)  echo '{"data":null,"errors":[{"message":"not authorized for that account"}]}';;
  down)    exit 7;;
esac
EOF
chmod +x "$T/bin/curl"

# run <case> [env-file] [args...] — env-scrubbed, the stub first on PATH; sets OUT, RC, LOG, BODY
run() {
  _c="$1"; _env="${2:-$T/env.sh}"; shift; [ $# -gt 0 ] && shift
  LOG="$T/$_c.log"; BODY="$T/$_c.body"; : > "$LOG"; : > "$BODY"
  OUT=$(cd "$T/engine" && env -i HOME="$T/home" PATH="$T/bin:$PATH" TMPDIR="$T" SHARINGU_ENV_PATH="$_env" \
        STUB_CASE="$_c" STUB_PLAN="${STUB_PLAN:-refused}" ${CF_PLAN_SET:+CF_PLAN="$CF_PLAN_SET"} STUB_LOG="$LOG" STUB_BODY="$BODY" \
        sh tools/cf-budget.sh "$@" 2>&1); RC=$?
  unset STUB_PLAN CF_PLAN_SET   # `VAR=x run …` may persist past the call (POSIX leaves it unspecified): never leak a case
  [ -n "$CF_BUDGET_SELFTEST_VERBOSE" ] && printf '%s\n' "── case $_c (rc $RC)" "$OUT" | sed 's/^/    | /'
}
chk() { if eval "$2"; then ok "$1"; else bad "$1 — rc=$RC"; echo "$OUT" | tail -6 | sed 's/^/        /'; fi; }
says() { printf '%s\n' "$OUT" | grep -q -- "$1"; }

run below
chk "below (10%): exit 0, the three metrics against the free limits + the 00:00 UTC reset, no WARN, no REFUSE" \
  '[ $RC -eq 0 ] && says "requests 10000/100000 (10.0%)" && says "d1 rows read 500000/5000000 (10.0%)" \
   && says "d1 rows written 10000/100000 (10.0%)" && says "resets 00:00 UTC (in " && ! says "WARN" && ! says "REFUSE"'
chk "below: the reading is recorded to .runs/cf-budget.json" \
  'grep -q "\"rowsRead\":500000" "$T/engine/.runs/cf-budget.json" && grep -q "\"verdict\":\"ok\"" "$T/engine/.runs/cf-budget.json"'
chk "the query asks for requests, rowsRead and rowsWritten for today (UTC), for the account" \
  'grep -q "workersInvocationsAdaptive" "$BODY" && grep -q "rowsRead rowsWritten" "$BODY" && grep -q "$(date -u +%Y-%m-%d)" "$BODY" \
   && grep -q "stub-account" "$BODY" && grep -q "https://api.cloudflare.com/client/v4/graphql" "$LOG"'
chk "the API token never rides on curl's argv (it travels in a header file)" \
  '! grep -q "stub-secret-token-do-not-leak" "$LOG" && grep -q "Authorization: Bearer stub-secret-token-do-not-leak" "$BODY"'

run warn
chk "warn (85% rows read): exit 0 + a WARN naming d1 rows read, no REFUSE" \
  '[ $RC -eq 0 ] && says "d1 rows read 4250000/5000000 (85.0%)" && says "WARN.*d1 rows read" && ! says "REFUSE"'

run refuse
chk "refuse (96% rows WRITTEN alone — requests and reads are low): exit 2, REFUSE naming d1 rows written + the 00:00 UTC reset" \
  '[ $RC -eq 2 ] && says "REFUSE.*d1 rows written" && says "REFUSE.*00:00 UTC" && ! says "REFUSE.*d1 rows read"'

run garbage
chk "unreadable (the API answers garbage): exit 3 REFUSE, never a pass" '[ $RC -eq 3 ] && says "REFUSE" && says "did not parse"'
run down
chk "unreadable (curl fails — no network, rc 7): exit 3 REFUSE" '[ $RC -eq 3 ] && says "REFUSE" && says "call failed"'
run errors
chk "unreadable (an errors[] answer, e.g. a token without analytics scope): exit 3 REFUSE" '[ $RC -eq 3 ] && says "REFUSE"'
run nocreds "$T/empty-env.sh"
chk "unreadable (no credentials): exit 3 REFUSE, and curl is never called" '[ $RC -eq 3 ] && says "REFUSE" && [ ! -s "$LOG" ]'

run below "$T/env.sh" --json
chk "--json: stdout is one parseable object carrying the three numbers and the verdict" \
  '[ $RC -eq 0 ] && printf "%s" "$OUT" | python3 -c "import json,sys;d=json.load(sys.stdin);assert d[\"rowsRead\"]==500000 and d[\"verdict\"]==\"ok\""'
run refuse "$T/env.sh" --json
chk "--json refuse: exit 2 still (the verdict line goes to stderr)" '[ $RC -eq 2 ] && says "REFUSE"'

run below
chk "free by default: the plan line says the account did not say and no CF_PLAN is set" 'says "plan: free — the default"'

# ── PAID ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
STUB_PLAN=paid run pbelow
chk "paid (the account lists workers_paid): exit 0, the period since its current_period_start against the INCLUDED amounts" \
  '[ $RC -eq 0 ] && says "plan: paid — from the account" && says "since 2026-09-07" && says "d1 rows written 380000/50000000 (0.7%)" \
   && says "d1 rows read 16000000/25000000000" && says "requests 90000/10000000" && ! says "WARN" && ! says "REFUSE" && grep -q "2026-09-07" "$BODY"'
chk "paid: the subscriptions read is a GET (no -X, no body) with the token in the header file, never on argv" \
  'grep -q "accounts/stub-account/subscriptions" "$LOG" && ! grep "subscriptions" "$LOG" | grep -q -- "-X\|--data" && ! grep -q "stub-secret-token-do-not-leak" "$LOG"'
STUB_PLAN=paid run pwarn
chk "paid warn (41M of 50M rows written): exit 0 + WARN naming d1 rows written, nothing priced yet" \
  '[ $RC -eq 0 ] && says "WARN.*d1 rows written" && ! says "REFUSE" && says "overage so far: about \$0.00"'
STUB_PLAN=paid run pover
chk "paid over (52M written): exit 0, the 2M over priced at \$1 a million (\$2.00), WARN, no REFUSE" \
  '[ $RC -eq 0 ] && says "over the included amount: about \$2.00" && says "overage so far: about \$2.00" && ! says "REFUSE"'
STUB_PLAN=paid run prefuse
chk "paid refuse (56M written, \$6.00 of overage): exit 2 REFUSE at the \$5 line" '[ $RC -eq 2 ] && says "REFUSE.*\$6.00"'
CF_PLAN_SET=paid run refuse
chk "the account cannot say + CF_PLAN=paid: paid from CF_PLAN over the last 31 days; 96,000 rows written passes (it refuses on free)" \
  '[ $RC -eq 0 ] && says "plan: paid — from CF_PLAN" && says "last 31 days" && says "d1 rows written 96000/50000000" && ! says "REFUSE" \
   && grep -q "$(python3 -c "import datetime as d;print((d.datetime.now(d.timezone.utc).date()-d.timedelta(days=30)).isoformat())")" "$BODY"'
STUB_PLAN=free CF_PLAN_SET=paid run refuse
chk "the account says free and CF_PLAN says paid: free (the account wins) — 96% written refuses" \
  '[ $RC -eq 2 ] && says "plan: free — from the account" && says "REFUSE.*d1 rows written"'
CF_PLAN_SET=bogus run below
chk "CF_PLAN=bogus: exit 3 REFUSE, curl never called" '[ $RC -eq 3 ] && says "neither paid nor free" && [ ! -s "$LOG" ]'
STUB_PLAN=paid run pover "$T/env.sh" --json
chk "--json paid: one object carrying plan, planFrom, the window, the paid limits and the overage" \
  '[ $RC -eq 0 ] && printf "%s" "$OUT" | head -1 | python3 -c "import json,sys;d=json.load(sys.stdin);assert d[\"plan\"]==\"paid\" and d[\"planFrom\"]==\"account\" and d[\"window\"][\"from\"]==\"2026-09-07\" and d[\"limits\"][\"rowsWritten\"]==50000000 and d[\"overageUsd\"]==2.0"'

echo "cf-budget-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
