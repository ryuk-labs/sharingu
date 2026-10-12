#!/bin/sh
# teardown-org.sh — the reverse of new-org.sh: remove every Cloudflare resource a self-hosted sharingu
# owns (its worker, D1, R2 and KV — every org it holds, with all their data and nightly backups), and its
# local config, leaving the account exactly as it was before new-org.sh ran.
#
# Usage:  sh tools/teardown-org.sh <name> [--dry-run]
#   <name>       the name new-org.sh was given (worker/D1 = <name>-agent-r, R2 = <name>-brain,
#                KV = <name>-agent-r-oauth)
#   --dry-run    print what would be deleted; delete NOTHING, touch NOTHING
#
# Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in env, same as new-org.sh — your own
# Cloudflare account, exported directly by the caller. No pool file is ever read here.
#
# THE NAME GUARD (never negotiable): this tool refuses by name — before touching the API, before
# reading the config file — to tear down the engine's own live deployment (ryuklabs) or a retired name. A slug NOT on
# that list still isn't necessarily safe to remove; the guard exists to make the known-catastrophic
# case impossible to reach by accident or by a careless argument, not to certify every other slug.
#
# BOUNDED BACKOFF ON THE "prove gone" READS (bug0914:day0-verify-assumes-a-multi-project-org, the
# paired defect): Cloudflare's own list APIs lag a DELETE by a few seconds — a single read right
# after the deletes above can report a resource "still listed" that reads gone moments later
# (measured live 2026-09-14: teardown right after use failed, the same command 30s later read
# 4/4 gone). tools/lib-teardown-backoff.sh's wait_absent() re-reads with exponential backoff, up to
# TEARDOWN_BACKOFF_MAX_S (default 60s) per resource, before calling it a genuine leftover.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
. "$ROOT/tools/lib-teardown-backoff.sh"
UA="sharingu-agent-r-cloudkit/1.0 (+https://github.com/ryukdev/sharingu)"

SLUG=""; DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    -*) echo "unknown flag: $a" >&2; exit 2 ;;
    *) [ -z "$SLUG" ] && SLUG="$a" ;;
  esac
done
[ -n "$SLUG" ] || { echo "  ✗ usage: sh tools/teardown-org.sh <name> [--dry-run]"; exit 2; }

# THE NAME GUARD — checked FIRST, before any other validation or API call. Never lifted by a flag,
# an env var, or a --force; the only way past it is to change this list, which is a code review.
case "$SLUG" in
  siru|ryuklabs|frame)
    echo "  ✗ refusing to tear down '$SLUG' — a protected name (ryuklabs is the live platform; siru and frame are retired names, never reused)."
    echo "    This tool only removes a deployment tools/new-org.sh made. Nothing was touched."
    exit 1
    ;;
esac

echo "$SLUG" | grep -qE '^[a-z0-9][a-z0-9-]*$' || { echo "  ✗ the name must be lowercase [a-z0-9-]: '$SLUG'"; exit 2; }
{ [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; } || { echo "  ✗ CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID required — export both directly for your own Cloudflare account; no pool file is ever read here"; exit 1; }

WORKER="${SLUG}-agent-r"
DB="${SLUG}-agent-r"
BUCKET="${SLUG}-brain"
KVTITLE="${SLUG}-agent-r-oauth"
CFG="wrangler.${SLUG}.jsonc"
ORGVAR=$(printf '%s' "$SLUG" | tr 'a-z-' 'A-Z_')

cf() { # cf <method> <path> [curl-args...] — one Cloudflare API call, always UA'd, always authed
  _method="$1"; _path="$2"; shift 2
  curl -s -X "$_method" -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "User-Agent: $UA" "$@" \
    "https://api.cloudflare.com/client/v4${_path}"
}

if [ "$DRY" = "1" ]; then
  echo "· DRY RUN — the plan (nothing deleted, nothing touched):"
  echo "  1. delete Worker script $WORKER"
  echo "  2. empty + delete R2 bucket $BUCKET"
  echo "  3. delete D1 database $DB"
  echo "  4. delete KV namespace $KVTITLE"
  echo "  5. remove local $CFG"
  echo "  6. re-read the Cloudflare API to prove worker · D1 · R2 · KV are gone for '$SLUG' (bounded backoff, up to ${TEARDOWN_BACKOFF_MAX_S:-60}s each, for Cloudflare's own list-read lag after a delete)"
  echo "  (nothing to strip from any sharingu file — new-org.sh mints no key and writes none there)"
  echo "  ✓ dry-run OK — name guard passed, nothing touched"
  exit 0
fi

echo "· 1/6 deleting Worker script $WORKER"
cf DELETE "/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER}" >/dev/null 2>&1 || true
echo "  ✓ delete requested (a missing script is not an error)"

echo "· 2/6 emptying + deleting R2 bucket $BUCKET"
# R2 refuses to delete a non-empty bucket — list + delete every object first (paginated by cursor).
_cursor=""
while :; do
  _q="/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?per_page=1000"
  [ -n "$_cursor" ] && _q="${_q}&cursor=${_cursor}"
  _resp=$(cf GET "$_q" 2>/dev/null)
  _keys=$(printf '%s' "$_resp" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    for o in (d.get('result') or []): print(o.get('key',''))
except Exception: pass" 2>/dev/null)
  [ -z "$_keys" ] && break
  printf '%s\n' "$_keys" | while IFS= read -r _k; do
    [ -n "$_k" ] && npx --yes wrangler r2 object delete "${BUCKET}/${_k}" --remote </dev/null >/dev/null 2>&1
  done
  _cursor=$(printf '%s' "$_resp" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print(((d.get('result_info') or {}).get('cursor')) or '')
except Exception: print('')" 2>/dev/null)
  [ -z "$_cursor" ] && break
done
npx --yes wrangler r2 bucket delete "$BUCKET" </dev/null >/dev/null 2>&1 || true
echo "  ✓ objects removed, bucket delete requested"

echo "· 3/6 deleting D1 database $DB"
npx --yes wrangler d1 delete "$DB" -y </dev/null >/dev/null 2>&1 || true
echo "  ✓ delete requested"

echo "· 4/6 deleting KV namespace $KVTITLE"
KV_ID=$(cf GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces?per_page=100" 2>/dev/null \
  | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    print(next((n['id'] for n in (d.get('result') or []) if n.get('title')=='$KVTITLE'), ''))
except Exception: print('')" 2>/dev/null)
if [ -n "$KV_ID" ]; then
  cf DELETE "/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_ID}" >/dev/null 2>&1 || true
  echo "  ✓ delete requested (id=$KV_ID)"
else
  echo "  ✓ no KV namespace named $KVTITLE found (already gone)"
fi

echo "· 5/6 removing local $CFG"
rm -f "$CFG"
echo "  ✓ $CFG removed (if it existed)"

echo "· 6/6 sharingu's own env — nothing to strip"
echo "  ✓ new-org.sh mints no key (an owner key is /orgs/new's, shown once in the browser) and writes none to any"
echo "    sharingu file — so there is nothing of ${ORGVAR}'s here to remove"

echo ""
echo "· proving gone (Cloudflare API reads, account-wide; bounded backoff up to ${TEARDOWN_BACKOFF_MAX_S:-60}s each for read-after-delete lag)"
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

_check_worker() {
  cf GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts" 2>/dev/null | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print('yes' if any(s.get('id')=='$WORKER' for s in (d.get('result') or [])) else 'no')
except Exception: print('unknown')" 2>/dev/null
}
W=$(wait_absent "worker $WORKER" _check_worker)
[ "$W" = "no" ] && ok "worker $WORKER absent" || bad "worker $WORKER still listed ($W) after the full backoff bound"

_check_d1() {
  cf GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database?per_page=100" 2>/dev/null | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print('yes' if any(x.get('name')=='$DB' for x in (d.get('result') or [])) else 'no')
except Exception: print('unknown')" 2>/dev/null
}
D=$(wait_absent "D1 $DB" _check_d1)
[ "$D" = "no" ] && ok "D1 $DB absent" || bad "D1 $DB still listed ($D) after the full backoff bound"

_check_r2() {
  cf GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets" 2>/dev/null | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print('yes' if any(b.get('name')=='$BUCKET' for b in ((d.get('result') or {}).get('buckets') or [])) else 'no')
except Exception: print('unknown')" 2>/dev/null
}
R=$(wait_absent "R2 bucket $BUCKET" _check_r2)
[ "$R" = "no" ] && ok "R2 bucket $BUCKET absent" || bad "R2 bucket $BUCKET still listed ($R) after the full backoff bound"

_check_kv() {
  cf GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces?per_page=100" 2>/dev/null | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print('yes' if any(n.get('title')=='$KVTITLE' for n in (d.get('result') or [])) else 'no')
except Exception: print('unknown')" 2>/dev/null
}
K=$(wait_absent "KV $KVTITLE" _check_kv)
[ "$K" = "no" ] && ok "KV $KVTITLE absent" || bad "KV $KVTITLE still listed ($K) after the full backoff bound"

echo ""
if [ "$fail" -eq 0 ]; then
  echo "✓ TEARDOWN COMPLETE — $SLUG: $pass/$pass Cloudflare reads confirm gone; local config removed (nothing to strip from any sharingu file)."
else
  echo "✗ TEARDOWN INCOMPLETE — $fail resource(s) still listed for $SLUG (see FAIL lines above); re-run or remove by hand."
  exit 1
fi
