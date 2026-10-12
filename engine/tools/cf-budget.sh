#!/bin/sh
# tools/cf-budget.sh [--json] — THE Cloudflare budget guard (owner ruling Q9CF32D8F, 2026-09-25: "operate in the daily
# limits of my Cloudflare free version"; MCQ "refuse at 95%"; 2026-10-02: the ryuklabs account is on Workers Paid, so the
# guard reads the PLAN first). Every tool that touches the LIVE worker or its remote D1 calls this FIRST: tools/ship.sh
# (after its gate, before any wrangler call — its smokes included), tools/migrate.sh (before the bookmark), every `--live`
# suite run (tools/lib.sh, before the seat mint) and the importer's write guard (tools/import/cost.mjs, `--json`). A local
# run (the default — tools/r-local.sh) never calls it: it costs Cloudflare nothing.
#
# 1 · THE PLAN, in this order (the first that answers wins; printed with where it came from):
#   a. the account, read-only: GET https://api.cloudflare.com/client/v4/accounts/<account>/subscriptions (Cloudflare's
#      "List Subscriptions"; needs the token's Billing:Read). A subscription whose rate plan names Workers Paid (or its older
#      names: Workers Bundled / Unbound / Standard) → paid, its current_period_start is the billing period's start; an answer
#      that lists none → free. A refusal (the token lacks Billing:Read), a failed call or garbage → not known from the account.
#      The token is NEVER widened for this: without the permission the guard falls through to b.
#   b. CF_PLAN=paid|free, a machine-local setting (the shell's env, or the env file this script sources). Anything else
#      refuses (exit 3): a typo must not pick a plan.
#   c. free — the default, so any other org and any unreadable setup stays on the strict limits.
# 2 · THE USAGE, ONE read, account-wide (Cloudflare's GraphQL analytics; not a Workers request, reads no D1 row):
#      workersInvocationsAdaptive sum.requests · d1AnalyticsAdaptiveGroups sum.rowsRead, sum.rowsWritten
#   free  today (UTC) against 100,000 requests · 5,000,000 rows read · 100,000 rows written a DAY (the free plan's limits;
#         past them every authenticated page fails until 00:00 UTC)
#   paid  the billing period so far (from the subscription's current_period_start; when the account cannot say, the last
#         31 days — a window that holds any period so far, so it over-counts, never under-counts) against what the plan
#         INCLUDES a month: 10,000,000 requests · 25,000,000,000 rows read · 50,000,000 rows written. Past them Cloudflare
#         bills (2026-10-02, developers.cloudflare.com pricing pages): $0.30 a million requests, $0.001 a million rows read,
#         $1.00 a million rows written. No daily limit.
# 3 · THE VERDICT
#   free  exit 0 under 80% of every limit · exit 0 + WARN naming each metric at or over 80% · exit 2 REFUSE at or over 95% of
#         ANY one (named, with the 00:00 UTC reset)
#   paid  exit 0 under 80% of the included amounts · exit 0 + WARN at or over 80% of one, and at or over 100% the overage so
#         far in dollars · exit 2 REFUSE when the period's overage so far reaches $5 (CF_PAID_MAX_OVERAGE_USD below: the
#         plan's own monthly fee — a period already billing more than the plan itself is not normal use; look first)
#   both  exit 3 REFUSE when the usage (or CF_PLAN) cannot be read: a guard that cannot look must not pass. There is no
#         bypass flag — wait for the reset, or the owner changes the plan (a plan change is the owner's verb, never an agent's).
# THE BEHIND POLL (UI-B5b), counted: every signed-in page drawn from a pack asks GET /versions?head=1 when its tab gains
# focus or turns visible, and every 120 s while it stays visible (src/shell.js). Worst case one open, visible tab all day:
# 30 Worker requests an hour, 720 a day = 0.72% of the free 100,000 requests limit per tab, each reading the sign-in's own D1
# rows and nothing more (0 statements of its own, tools/d1-hot-selftest.mjs section J) and one R2 object. Those requests
# are in workersInvocationsAdaptive's `requests` below like any other, so this guard already counts them.
#
# Credentials: sharingu's three-line env (ring 1, Q65300E50) — CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID — read the way
# tools/lib.sh reads it. The token travels in a chmod-600 header FILE (`curl -H @file`), never on argv, never printed.
# Limits are overridable ONLY for the selftests (CF_LIMIT_REQUESTS · CF_LIMIT_ROWS_READ · CF_LIMIT_ROWS_WRITTEN, applied to
# whichever plan is read); the defaults are Cloudflare's numbers. Records the reading to .runs/cf-budget.json.
# --json prints ONE object on stdout: {plan, planFrom, window:{from,to}, requests, rowsRead, rowsWritten, limits:{…},
# overageUsd, verdict, at} (the verdict lines go to stderr).
ENGINE="$(cd "$(dirname "$0")/.." && pwd)"
JSON=""; [ "${1:-}" = "--json" ] && JSON=1
[ -f "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}" ] && { set -a; . "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}"; set +a; }
UA="${AGENT_R_UA:-sharingu-agent-r-tools/1.0 (+https://github.com/ryuk-labs/sharingu)}"
API="https://api.cloudflare.com/client/v4"
CF_PAID_MAX_OVERAGE_USD=5   # the paid refusal line: the period's overage so far, in dollars (the plan's own fee)

# the free plan's reset — the next 00:00 UTC, and how far away it is
RESET="$(python3 -c 'import datetime as d
n=d.datetime.now(d.timezone.utc); r=(n+d.timedelta(days=1)).replace(hour=0,minute=0,second=0,microsecond=0)
s=int((r-n).total_seconds()); print("resets 00:00 UTC (in %dh %02dm)" % (s//3600, (s%3600)//60))')"

refuse_unreadable() {
  [ -n "$JSON" ] && exec 1>&2
  echo "  ✗ REFUSE — cf-budget: $1 — the Cloudflare usage cannot be read, and a guard that cannot look must not pass"
  exit 3
}

{ [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; } \
  || refuse_unreadable "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing (source ~/.sharingu/env-sharingu.sh)"
case "${CF_PLAN:-}" in ""|paid|free) ;; *) refuse_unreadable "CF_PLAN=${CF_PLAN} is neither paid nor free";; esac

_t="$(mktemp -d "${TMPDIR:-/tmp}/cf-budget.XXXXXX")" || refuse_unreadable "no temp dir"
trap 'rm -rf "$_t"' EXIT
( umask 077; printf 'Authorization: Bearer %s\n' "$CLOUDFLARE_API_TOKEN" > "$_t/auth" )

# ── 1 · the plan ─────────────────────────────────────────────────────────────────────────────────────────────────────
# a GET: read-only by construction (curl's default method, no body)
curl -s -m 20 "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/subscriptions" -H @"$_t/auth" -H "User-Agent: $UA" > "$_t/subs" 2>/dev/null || : > "$_t/subs"
# prints "paid <period-start YYYY-MM-DD | ->", "free", or "unknown <why>"
PLAN_API="$(python3 - "$_t/subs" <<'PY' 2>/dev/null
import json, re, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("unknown no answer"); sys.exit()
if not isinstance(d, dict) or "result" not in d and "success" not in d:
    print("unknown not a subscriptions answer"); sys.exit()
if not d.get("success") or not isinstance(d.get("result"), list):
    errs = d.get("errors") or []
    code = errs[0].get("code") if errs and isinstance(errs[0], dict) else "?"
    print("unknown the account refused (code %s: the token cannot read billing)" % code); sys.exit()
paid = None
for s in d["result"]:
    rp = s.get("rate_plan") or {}
    names = " ".join(str(x) for x in (rp.get("id"), rp.get("public_name"), (s.get("product") or {}).get("name") if isinstance(s.get("product"), dict) else s.get("product")) if x)
    state = str(s.get("state") or "").lower()
    if re.search(r"workers", names, re.I) and re.search(r"paid|bundled|unbound|standard", names, re.I) and state not in ("cancelled", "expired", "failed"):
        start = str(s.get("current_period_start") or "")[:10]
        paid = start if re.fullmatch(r"\d{4}-\d{2}-\d{2}", start) else "-"
print("paid %s" % paid if paid is not None else "free")
PY
)"
[ -n "$PLAN_API" ] || PLAN_API="unknown no answer"
PERIOD_START=""
case "$PLAN_API" in
  paid*) PLAN=paid; PLAN_FROM=account; PERIOD_START="${PLAN_API#paid }"; [ "$PERIOD_START" = "-" ] && PERIOD_START="";;
  free)  PLAN=free; PLAN_FROM=account;;
  *)     if [ -n "${CF_PLAN:-}" ]; then PLAN="$CF_PLAN"; PLAN_FROM=CF_PLAN; else PLAN=free; PLAN_FROM=default; fi;;
esac
PLAN_NOTE="from the account (GET /accounts/…/subscriptions)"
[ "$PLAN_FROM" = CF_PLAN ] && PLAN_NOTE="from CF_PLAN, machine-local (the account did not say: ${PLAN_API#unknown })"
[ "$PLAN_FROM" = default ] && PLAN_NOTE="the default (the account did not say: ${PLAN_API#unknown }; no CF_PLAN set)"

TODAY="$(date -u +%Y-%m-%d)"
if [ "$PLAN" = paid ]; then
  LIM_REQ="${CF_LIMIT_REQUESTS:-10000000}"; LIM_RR="${CF_LIMIT_ROWS_READ:-25000000000}"; LIM_RW="${CF_LIMIT_ROWS_WRITTEN:-50000000}"
  if [ -n "$PERIOD_START" ]; then FROM="$PERIOD_START"; WINDOW="the billing period since $FROM"
  else FROM="$(python3 -c 'import datetime as d; print((d.datetime.now(d.timezone.utc).date()-d.timedelta(days=30)).isoformat())')"
       WINDOW="the last 31 days since $FROM (the renewal day is unknown: this window holds any period so far)"; fi
else
  LIM_REQ="${CF_LIMIT_REQUESTS:-100000}"; LIM_RR="${CF_LIMIT_ROWS_READ:-5000000}"; LIM_RW="${CF_LIMIT_ROWS_WRITTEN:-100000}"
  FROM="$TODAY"; WINDOW="today (UTC)"
fi

# ── 2 · the usage ────────────────────────────────────────────────────────────────────────────────────────────────────
python3 - "$CLOUDFLARE_ACCOUNT_ID" "$FROM" "$TODAY" > "$_t/q.json" <<'PY'
import json, sys
q = ("query($a:String!,$d:Date!,$e:Date!){viewer{accounts(filter:{accountTag:$a}){"
     "workersInvocationsAdaptive(limit:10000,filter:{date_geq:$d,date_leq:$e}){sum{requests}} "
     "d1AnalyticsAdaptiveGroups(limit:10000,filter:{date_geq:$d,date_leq:$e}){sum{rowsRead rowsWritten}}}}}")
print(json.dumps({"query": q, "variables": {"a": sys.argv[1], "d": sys.argv[2], "e": sys.argv[3]}}))
PY

curl -s -m 20 -X POST "$API/graphql" -H @"$_t/auth" \
  -H "Content-Type: application/json" -H "User-Agent: $UA" --data-binary @"$_t/q.json" > "$_t/resp" 2>/dev/null \
  || refuse_unreadable "the GraphQL analytics call failed (curl rc $?)"

# parse — exactly three integers, or nothing (an errors[] answer, a missing account, garbage → unreadable)
NUMS="$(python3 - "$_t/resp" <<'PY' 2>/dev/null
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    if d.get("errors"): sys.exit(1)
    a = d["data"]["viewer"]["accounts"][0]
    req = sum(int(g["sum"]["requests"]) for g in a["workersInvocationsAdaptive"])
    rr = sum(int(g["sum"]["rowsRead"]) for g in a["d1AnalyticsAdaptiveGroups"])
    rw = sum(int(g["sum"]["rowsWritten"]) for g in a["d1AnalyticsAdaptiveGroups"])
    print(req, rr, rw)
except Exception:
    sys.exit(1)
PY
)" || NUMS=""
[ -n "$NUMS" ] || refuse_unreadable "the GraphQL analytics answer did not parse (errors, no account, or not JSON)"
set -- $NUMS; REQ="$1"; RR="$2"; RW="$3"

# ── 3 · the verdict — per metric: pct, warn at >=80; free refuses at >=95; paid prices what is over and refuses at the cap
VERDICT="$(python3 - "$PLAN" "$CF_PAID_MAX_OVERAGE_USD" "$REQ" "$LIM_REQ" "$RR" "$LIM_RR" "$RW" "$LIM_RW" <<'PY'
import sys
plan, cap = sys.argv[1], float(sys.argv[2])
v = [int(x) for x in sys.argv[3:]]
price = {"requests": 0.30, "d1 rows read": 0.001, "d1 rows written": 1.00}   # dollars a million over the included amount
rows = [("requests", v[0], v[1]), ("d1 rows read", v[2], v[3]), ("d1 rows written", v[4], v[5])]
warn = []; refuse = []; over = 0.0
for name, n, lim in rows:
    bp = n * 10000 // lim if lim > 0 else 10000
    extra = ""
    if plan == "paid" and n > lim:
        usd = (n - lim) / 1e6 * price[name]; over += usd
        extra = " — over the included amount: about $%.2f" % usd
    print("LINE %s %d/%d (%d.%d%%)%s" % (name, n, lim, bp // 100, (bp % 100) // 10, extra))
    if plan == "free" and bp >= 9500: refuse.append(name)
    elif bp >= 8000: warn.append(name)
if plan == "paid" and over >= cap: refuse.append("overage $%.2f" % over)
print("OVER %.2f" % over)
print("WARN " + ",".join(warn))
print("REFUSE " + ",".join(refuse))
PY
)"
AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
W="$(printf '%s\n' "$VERDICT" | sed -n 's/^WARN //p')"
R="$(printf '%s\n' "$VERDICT" | sed -n 's/^REFUSE //p')"
OVER="$(printf '%s\n' "$VERDICT" | sed -n 's/^OVER //p')"
V=ok; [ -n "$W" ] && V=warn; [ -n "$R" ] && V=refuse
OBJ="$(printf '{"plan":"%s","planFrom":"%s","window":{"from":"%s","to":"%s"},"requests":%s,"rowsRead":%s,"rowsWritten":%s,"limits":{"requests":%s,"rowsRead":%s,"rowsWritten":%s},"overageUsd":%s,"verdict":"%s","at":"%s"}' \
  "$PLAN" "$PLAN_FROM" "$FROM" "$TODAY" "$REQ" "$RR" "$RW" "$LIM_REQ" "$LIM_RR" "$LIM_RW" "$OVER" "$V" "$AT")"
mkdir -p "$ENGINE/.runs" 2>/dev/null
printf '%s\n' "$OBJ" > "$ENGINE/.runs/cf-budget.json" 2>/dev/null

if [ -n "$JSON" ]; then
  printf '%s\n' "$OBJ"
  exec 1>&2   # under --json the verdict lines go to stderr, so stdout stays exactly one JSON object
else
  echo "· Cloudflare plan: $PLAN — $PLAN_NOTE"
  if [ "$PLAN" = paid ]; then echo "· usage against the plan's INCLUDED amounts, $WINDOW, account-wide"
  else echo "· Cloudflare free-tier budget — today (UTC), account-wide"; fi
  printf '%s\n' "$VERDICT" | sed -n 's/^LINE /  /p'
  if [ "$PLAN" = paid ]; then echo "  overage so far: about \$$OVER (the refusal line: \$$CF_PAID_MAX_OVERAGE_USD)"; else echo "  $RESET"; fi
fi
if [ "$PLAN" = paid ]; then
  [ -n "$W" ] && echo "  ⚠ WARN — at or over 80% of the paid plan's included amount: $(printf '%s' "$W" | sed 's/,/, /g') (past it Cloudflare bills; overage so far about \$$OVER)"
  if [ -n "$R" ]; then
    echo "  ✗ REFUSE — this billing period's overage is about \$$OVER, at or over the \$$CF_PAID_MAX_OVERAGE_USD line — nothing live runs until the owner looks"
    exit 2
  fi
  exit 0
fi
[ -n "$W" ] && echo "  ⚠ WARN — at or over 80% of the free daily limit: $(printf '%s' "$W" | sed 's/,/, /g') ($RESET)"
if [ -n "$R" ]; then
  echo "  ✗ REFUSE — at or over 95% of the free daily limit: $(printf '%s' "$R" | sed 's/,/, /g') — nothing live runs until the $RESET"
  exit 2
fi
exit 0
