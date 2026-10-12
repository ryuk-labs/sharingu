#!/bin/sh
# new-org.sh — one command to stand up sharingu on YOUR OWN Cloudflare account (docs/INSTALL.md, engine/ORG-SETUP.md): the
# same platform as the hosted one, its worker, D1, R2 and KV on your account, holding no org until you create one. It wraps
# wrangler.tenant.template.jsonc and tools/operator.mjs:
# validate -> create resources (D1/R2/KV) -> fill the three holes (<ORG>, <D1_ID>, <KV_ID>) -> boot.sql (an EMPTY platform: no org, no person, no key)
# -> deploy -> wait until the worker answers (/health with its D1, GET /signup) -> allow YOUR email (tools/operator.mjs allow
# --live: its one-time code printed once, on this terminal) -> print the platform's own way to your first org: /signup, then
# /orgs/new (the owner key shown once there), then tools/day0-verify.sh. Every step loud; exit on first failure. One engine,
# never a fork; an org is born only as a write through the door (sprint 7, 7.6: no org row and no key is minted here).
#
# Usage:  sh tools/new-org.sh <name> --email <you> [--dry-run] [--no-cron]
#   <name>       lowercase [a-z0-9-]; names this deployment's resources: worker/D1 = <name>-agent-r, R2 = <name>-brain,
#                KV = <name>-agent-r-oauth, config wrangler.<name>.jsonc (your orgs' addresses are chosen at /orgs/new)
#   --email <you>  the email you sign up with: the platform's first allowed email (required for a real run)
#   --dry-run    validate inputs + print the plan; create NOTHING, deploy NOTHING (the eval path)
#   --no-cron    deploy with zero scheduled crons (same as SKIP_CRON=1) — an account-wide Workers Free plan caps TOTAL
#                cron triggers at 5 across every worker on the account (measured live 2026-09-14: wrangler error 10072);
#                a busy account can skip crons rather than hit that cap.
#
# Real run needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env — your own Cloudflare account. No pool file is ever
# read here.
#
# VALIDATE-FIRST: the name and the email are checked BEFORE any Cloudflare resource is created — a bad one refuses by name,
# exit 2, nothing touched.
#
# NO ORPHAN ON FAILURE: once the first Cloudflare resource (D1) exists, any later failure up to the deploy prints the exact
# `sh tools/teardown-org.sh <name>` recovery line and — by default — RUNS it (NEW_ORG_ROLLBACK_ON_FAIL=0 to keep the partial
# state instead); see tools/lib-new-org.sh. A refused ALLOW after a good deploy rolls nothing back: the platform is up, and the
# operator line to run again is printed (exit 1). NEW_ORG_FAULT_AFTER=<stage> is a test-only fault hook (documented in that
# file) used by tools/new-org-selftest.sh; it does nothing unless a test sets it.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
. "$ROOT/tools/lib-new-org.sh"
UA="sharingu-agent-r-cloudkit/1.0 (+https://github.com/ryukdev/sharingu)"  # every HTTP call this tool makes to Cloudflare names itself
NO_CREATED=0
trap 'no_recover "$SLUG"' EXIT

SLUG=""; EMAIL=""; DRY=0; NOCRON="${SKIP_CRON:-0}"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --no-cron) NOCRON=1; shift ;;
    --email) EMAIL="$2"; shift 2 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) if [ -z "$SLUG" ]; then SLUG="$1"; else echo "  ✗ one name only: '$1'" >&2; exit 2; fi; shift ;;
  esac
done

echo "· validating"
[ -n "$SLUG" ] || { echo "  ✗ usage: sh tools/new-org.sh <name> --email <you> [--dry-run] [--no-cron]"; exit 2; }
echo "$SLUG" | grep -qE '^[a-z0-9][a-z0-9-]*$' || { echo "  ✗ the name must be lowercase [a-z0-9-]: '$SLUG'"; exit 2; }
[ -f wrangler.tenant.template.jsonc ] || { echo "  ✗ wrangler.tenant.template.jsonc missing"; exit 1; }
[ -f boot.sql ] || { echo "  ✗ boot.sql missing (run tools/export-boot-schema.sh)"; exit 1; }
CFG="wrangler.${SLUG}.jsonc"
[ -e "$CFG" ] && { echo "  ✗ $CFG already exists — pick a fresh name or remove it"; exit 1; }
EMAIL=$(printf '%s' "$EMAIL" | tr 'A-Z' 'a-z' | tr -d ' ')
if [ -n "$EMAIL" ] || [ "$DRY" = "0" ]; then
  # the email the operator's tool will allow (its own check is the same shape): refused here, before any Cloudflare call
  printf '%s' "$EMAIL" | grep -qE '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' \
    || { echo "  ✗ --email <you> is required: the email you sign up with (got '$EMAIL')"; exit 2; }
fi
if [ "$DRY" = "0" ]; then
  { [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; } || { echo "  ✗ CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID required — export both directly for your own Cloudflare account; no pool file is ever read here"; exit 1; }
fi
echo "  ✓ name=$SLUG · worker=${SLUG}-agent-r · D1=${SLUG}-agent-r · R2=${SLUG}-brain · KV=${SLUG}-agent-r-oauth · config=$CFG${EMAIL:+ · first allowed email=$EMAIL}"
ALLOW_LINE="node tools/operator.mjs allow --live --config $CFG --confirm-live ${SLUG}-agent-r --email"

if [ "$DRY" = "1" ]; then
  echo "· DRY RUN — the plan (nothing created, nothing deployed, no Cloudflare API call made):"
  echo "  0.  validate the name and the email — refuse by name, exit 2, before anything below"
  echo "  0a. check the account's D1 database cap (GET .../d1/database) — refuse by name if at the cap"
  echo "  0b. check the account's cron-trigger cap (GET .../workers/scripts + .../schedules) — refuse by name if at the cap, unless --no-cron"
  echo "  1. npx wrangler d1 create ${SLUG}-agent-r              → capture database_id (the FIRST create — any failure past here prints/runs the teardown recovery line)"
  echo "  2. npx wrangler r2 bucket create ${SLUG}-brain"
  echo "  3. POST CF API storage/kv/namespaces {title:${SLUG}-agent-r-oauth}  → capture id (raw API: wrangler prefixes the wrong name)"
  echo "  4. fill wrangler.tenant.template.jsonc → $CFG   (<ORG>=$SLUG · <D1_ID> · <KV_ID>)"
  echo "  5. npx wrangler d1 execute ${SLUG}-agent-r -c $CFG --remote --file boot.sql   (the schema only: an EMPTY platform — no org, no person, no key)"
  echo "  6. npx wrangler deploy -c $CFG"
  echo "  7. resolve the workers.dev URL (printed, never written to any sharingu file)"
  echo "  7a. wait until /health answers d1 ok and GET /signup answers (a new worker and its D1 lag a few seconds)"
  echo "  8. $ALLOW_LINE ${EMAIL:-<you>}   (the one-time code printed ONCE, on this terminal)"
  echo "  9. print your way in: <url>/signup (the email, the code, a passphrase) -> <url>/orgs/new (your org, its address, its first project; the owner key shown once) -> DAY0_URL=… DAY0_KEY=… DAY0_EMAIL=… sh tools/day0-verify.sh (must go ALL-GREEN — it prints its own N/N)"
  echo "  on any failure after step 1 and up to the deploy: print \`sh tools/teardown-org.sh $SLUG\` and, by default, run it (NEW_ORG_ROLLBACK_ON_FAIL=0 to keep the partial state instead)"
  echo "  ✓ dry-run OK — name valid$([ -n "$EMAIL" ] && echo ", email valid" || echo " (no --email given: not validated)"), config slot free, no resource touched"
  exit 0
fi

echo "· checking the account's D1 database cap before minting"
D1_CAP="${D1_DB_CAP:-10}"   # ASSUMED: Cloudflare's current D1 Free-plan cap is 10 databases/account
                            # (developers.cloudflare.com/d1/platform/limits, checked 2026-09-14);
                            # override with D1_DB_CAP if this account is on a different plan.
D1_COUNT=$(curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "User-Agent: $UA" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database?per_page=100" \
  | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    print(len(d.get('result') or []) if d.get('success') else '')
except Exception: print('')" 2>/dev/null)
case "$D1_COUNT" in
  ''|*[!0-9]*) echo "  ⚠ could not read the account's D1 database count (API/network) — proceeding without the cap check" ;;
  *)
    echo "  · D1 databases in this account: $D1_COUNT of $D1_CAP"
    if [ "$D1_COUNT" -ge "$D1_CAP" ]; then
      echo "  ✗ D1 database cap reached (${D1_COUNT}/${D1_CAP} on this Cloudflare account) — remove an unused D1 database or raise D1_DB_CAP if the plan differs. Refusing to mint ${SLUG}-agent-r; nothing created."
      exit 1
    fi
    ;;
esac

echo "· checking the account's cron-trigger cap before minting"
CRON_CAP="${CRON_TRIGGER_CAP:-5}"   # ASSUMED: Cloudflare Workers Free's account-wide cron-trigger cap
                                    # is 5, TOTAL across every worker on the account, not per-worker
                                    # (measured live 2026-09-14: wrangler error 10072 minting a 2nd
                                    # cron org past 4 already in use); Workers Paid raises it to 1,000.
                                    # Override with CRON_TRIGGER_CAP if the plan differs.
NEW_CRONS=$(python3 -c "import json,re
s=re.sub(r'//[^\n]*','',open('wrangler.tenant.template.jsonc').read())
print(len((json.loads(s).get('triggers') or {}).get('crons') or []))" 2>/dev/null || echo 0)
[ "$NOCRON" = "1" ] && NEW_CRONS=0
if [ "$NEW_CRONS" -gt 0 ]; then
  SCRIPT_IDS=$(curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "User-Agent: $UA" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts" \
    | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    print('\n'.join(s.get('id','') for s in (d.get('result') or []) if d.get('success')))
except Exception: pass" 2>/dev/null)
  EXISTING_CRONS=0
  for _s in $SCRIPT_IDS; do
    _n=$(curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "User-Agent: $UA" \
      "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${_s}/schedules" \
      | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print(len((d.get('result') or {}).get('schedules') or []) if d.get('success') else 0)
except Exception: print(0)" 2>/dev/null)
    case "$_n" in ''|*[!0-9]*) _n=0 ;; esac
    EXISTING_CRONS=$((EXISTING_CRONS + _n))
  done
  echo "  · cron triggers in this account: $EXISTING_CRONS existing + $NEW_CRONS for ${SLUG} = $((EXISTING_CRONS + NEW_CRONS)) of $CRON_CAP"
  if [ $((EXISTING_CRONS + NEW_CRONS)) -gt "$CRON_CAP" ]; then
    echo "  ✗ cron-trigger cap would be exceeded (${EXISTING_CRONS} existing + ${NEW_CRONS} new > ${CRON_CAP} on this Cloudflare account) — free up a cron slot, raise CRON_TRIGGER_CAP if the plan differs, or re-run with --no-cron to mint ${SLUG} with zero scheduled crons. Refusing to mint ${SLUG}-agent-r; nothing created."
    exit 1
  fi
else
  echo "  · this org will deploy with 0 crons — cap check skipped"
fi

echo "· 1/6 creating D1 ${SLUG}-agent-r"
# stdin from /dev/null: wrangler asks questions (add the binding to a config? a location?) on a terminal, and with the
# output hidden a stranger would wait on a prompt they cannot see; non-interactive, it takes the defaults
npx --yes wrangler d1 create "${SLUG}-agent-r" </dev/null >/dev/null 2>&1 || true
NO_CREATED=1   # the FIRST create — from here on, any failure gets the teardown recovery line
D1_ID=$(npx --yes wrangler d1 info "${SLUG}-agent-r" --json </dev/null 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('uuid',''))" 2>/dev/null)
[ -n "$D1_ID" ] || { echo "  ✗ could not resolve D1 id for ${SLUG}-agent-r"; exit 1; }
echo "  ✓ D1 id=$D1_ID"
no_fault d1

echo "· 2/6 creating R2 ${SLUG}-brain"
npx --yes wrangler r2 bucket create "${SLUG}-brain" </dev/null >/dev/null 2>&1 || true
# read it back: a Cloudflare account must have R2 turned on (dashboard → R2) before its first bucket, and the create above
# swallows that refusal
npx --yes wrangler r2 bucket info "${SLUG}-brain" </dev/null >/dev/null 2>&1 \
  || { echo "  ✗ R2 bucket ${SLUG}-brain is not there after the create — is R2 enabled on this Cloudflare account (dashboard → R2)?"; exit 1; }
echo "  ✓ R2 ${SLUG}-brain"
no_fault r2

echo "· 3/6 creating KV ${SLUG}-agent-r-oauth (raw CF API)"
KV_ID=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "User-Agent: $UA" -H 'content-type: application/json' \
  -d "{\"title\":\"${SLUG}-agent-r-oauth\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('result') or {}).get('id',''))" 2>/dev/null)
[ -n "$KV_ID" ] || { echo "  ✗ KV create failed (check token/account)"; exit 1; }
echo "  ✓ KV id=$KV_ID"
no_fault kv

echo "· 4/6 writing $CFG"
python3 - "$SLUG" "$D1_ID" "$KV_ID" "$CFG" "$NOCRON" <<'PY'
import sys, re, json
slug, d1, kv, cfg, nocron = sys.argv[1:6]
t = open("wrangler.tenant.template.jsonc").read()
t = t.replace("<ORG>", slug).replace("<D1_ID>", d1).replace("<KV_ID>", kv)
if nocron == "1":
    # strip the whole "triggers": {...} block (a JSONC file — comments make json.load unsafe here,
    # so a targeted regex on the known template shape, not a parse-modify-reserialize round trip).
    t = re.sub(r',?\s*"triggers":\s*\{[^}]*\}', '', t, count=1)
open(cfg, "w").write(t)
PY
echo "  ✓ $CFG (three holes filled$([ "$NOCRON" = "1" ] && echo ", 0 crons"))"
no_fault config

echo "· 5/6 boot schema (an empty platform: no org, no person, no key — your first org is made at /orgs/new)"
npx --yes wrangler d1 execute "${SLUG}-agent-r" -c "$CFG" --remote --file boot.sql </dev/null >/dev/null
echo "  ✓ boot.sql applied"
no_fault boot

echo "· 6/6 deploy"
npx --yes wrangler deploy -c "$CFG"
no_fault deploy

echo "· resolving the account's workers.dev URL"
SUBDOMAIN=$(curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "User-Agent: $UA" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain" \
  | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print((d.get('result') or {}).get('subdomain',''))
except Exception: print('')" 2>/dev/null)
if [ -n "$SUBDOMAIN" ]; then
  WORKER_URL="https://${SLUG}-agent-r.${SUBDOMAIN}.workers.dev"
  echo "  ✓ $WORKER_URL (not a secret — printed, never written to any sharingu file)"

  echo "· waiting for the deployed worker AND its D1 to answer (a brand-new worker and a brand-new D1 database can each lag a few seconds behind a successful deploy — measured live 2026-09-14)"
  _tries=0; _code=""; _d1=""; _su=""
  while [ "$_tries" -lt 30 ]; do
    _code=$(curl -s -o /dev/null -w '%{http_code}' -H "User-Agent: $UA" "$WORKER_URL/health" 2>/dev/null)
    if [ "$_code" = "200" ]; then
      # the health route's own D1 probe (a field, never page prose: the What is missing page's title drifted twice)
      _d1=$(curl -s -H "User-Agent: $UA" "$WORKER_URL/health" 2>/dev/null | python3 -c "import json,sys
try: print(json.load(sys.stdin).get('d1',''))
except Exception: print('')" 2>/dev/null)
      _su=$(curl -s -o /dev/null -w '%{http_code}' -H "User-Agent: $UA" -H 'accept: text/html' "$WORKER_URL/signup" 2>/dev/null)
      [ "$_d1" = "ok" ] && [ "$_su" = "200" ] && break
    fi
    _tries=$((_tries + 1)); sleep 1
  done
  if [ "$_code" = "200" ] && [ "$_d1" = "ok" ] && [ "$_su" = "200" ]; then
    echo "  ✓ /health (d1 ok) and the sign-up page answer after ${_tries}s"
  else
    echo "  ⚠ not fully warm within 30s (last /health=$_code, d1=${_d1:-?}, /signup=${_su:-?}) — the sign-up may need a moment or a retry"
  fi
else
  WORKER_URL="https://${SLUG}-agent-r.<your-subdomain>.workers.dev"
  echo "  ⚠ could not resolve the workers.dev subdomain — find it by hand (dash → Workers → your subdomain)"
fi

# the platform is deployed and answers: from here a failure rolls nothing back (the trap is cleared)
trap - EXIT
echo "· 7/7 allowing $EMAIL — the platform's first allowed email (tools/operator.mjs, on your own credentials)"
ALLOWED=1
$ALLOW_LINE "$EMAIL" </dev/null || ALLOWED=0
no_fault allow

echo ""
if [ "$ALLOWED" = "1" ]; then
  echo "✓ new-org ${SLUG}: the platform is up at $WORKER_URL — empty until you create your org — and $EMAIL may sign up."
else
  echo "✗ new-org ${SLUG}: the platform is up at $WORKER_URL, but the allow was refused (above). Run it again:"
  echo "    $ALLOW_LINE $EMAIL"
fi
echo "  YOUR FIRST ORG (the platform's own way, as on the hosted platform):"
echo "    1. $WORKER_URL/signup — $EMAIL, the code above, a passphrase (at least 12 characters): your account"
echo "    2. $WORKER_URL/orgs/new — your email and that passphrase, the org's name, its address, its first project;"
echo "       its OWNER KEY is shown there once (your seat's own sign-in and API key: keep it)"
echo "  ACCEPT IT (must go ALL-GREEN — it prints its own N/N):"
echo "    DAY0_URL=$WORKER_URL DAY0_KEY=<the owner key> DAY0_EMAIL=$EMAIL DAY0_PASS=<your passphrase> sh tools/day0-verify.sh"
echo "  CONNECT YOUR AI: claude mcp add ${SLUG} --transport http $WORKER_URL/mcp --header \"Authorization: Bearer <the owner key>\""
echo "    then ask it for whoami and missing with your first project, and fill it: each call through preview, then file"
echo "  ANOTHER PERSON: add them on Control (Members · Invite: their key shown once); an account passphrase of their own:"
echo "    $ALLOW_LINE <their email>"
echo "  TEAR IT DOWN when done: sh tools/teardown-org.sh ${SLUG}"
[ "$ALLOWED" = "1" ]
