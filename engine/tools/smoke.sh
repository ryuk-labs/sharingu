#!/bin/sh
# tools/smoke.sh — THE per-slice proof: a FRESH local worker (tools/r-local.sh, org smoke-local, its own state under
# .runs/r-local/ and its own port), migrate-039.sql applied over the fresh schema, then tools/smoke.mjs's cases through the
# real door. The worker is stopped at the end unless --keep, which leaves it up and prints its URL and the PATH of the file
# holding the owner key (never the key). Every run starts from nothing, so it repeats. Local only: no Cloudflare call.
#   sh tools/smoke.sh [--keep]            (from engine/)
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SLUG="${SMOKE_SLUG:-smoke-local}"   # a second concurrent run takes its own slug and SMOKE_PORT_BASE
R_LOCAL_STATE_ROOT="$ROOT/.runs/r-local"; export R_LOCAL_STATE_ROOT
R_LOCAL_PORT_BASE="${SMOKE_PORT_BASE:-8890}"; export R_LOCAL_PORT_BASE   # clear of the suites' local R (8850 up)
WRANGLER_SEND_METRICS=false; export WRANGLER_SEND_METRICS
keep=0
for a in "$@"; do
  case "$a" in
    --keep) keep=1 ;;
    *) echo "usage: sh tools/smoke.sh [--keep]" >&2; exit 2 ;;
  esac
done
. "$ROOT/tools/lib-r-local.sh"
dir="$(rl_org_dir "$SLUG")"

stop() { sh tools/r-local.sh down "$SLUG" >/dev/null 2>&1 || true; }
fail() { echo "✗ $1"; [ -f "$2" ] && tail -25 "$2"; stop; exit 1; }

# a fresh org every run: stop a kept one, drop its state
stop
rm -rf "$dir"
mkdir -p "$dir"
log="$ROOT/.runs/$SLUG.log"
: > "$log"

echo "· seeding a fresh $SLUG (boot.sql, one owner, one project) under $dir"
sh tools/r-local.sh seed "$SLUG" --project local >> "$log" 2>&1 || fail "seed failed — see $log" "$log"
cfg="$dir/wrangler.local.jsonc"
db="$(rl_config_field "$cfg" "d['d1_databases'][0]['database_name']")"
echo "· applying migrate-039.sql over it (the fresh schema already carries it: a no-op that must not fail)"
npx --no-install wrangler d1 execute "$db" --config "$cfg" --local --persist-to "$dir/persist" --file "$ROOT/migrate-039.sql" </dev/null >> "$log" 2>&1 \
  || fail "migrate-039.sql did not apply — see $log" "$log"

echo "· starting the worker"
sh tools/r-local.sh up "$SLUG" >> "$log" 2>&1 || fail "the worker did not come up — see $log and $dir/dev.log" "$dir/dev.log"
url="http://127.0.0.1:$(cat "$dir/port")"
echo "· $url is up — running tools/smoke.mjs"
echo

rc=0
# SMOKE_D1_*: the local database, for the one case that must age a row past what the door can (s11: an expired preview)
SMOKE_URL="$url" SMOKE_CREDS="$dir/credentials.env" SMOKE_D1_DB="$db" SMOKE_D1_CFG="$cfg" SMOKE_D1_PERSIST="$dir/persist" node tools/smoke.mjs || rc=$?

echo
if [ "$keep" = "1" ]; then
  echo "· kept up: $url"
  echo "  sign in as owner@$SLUG.local with the key in $dir/credentials.env ($(rl_orgvar "$SLUG")_AGENT_R_OWNER_KEY)"
  echo "  stop: R_LOCAL_STATE_ROOT=$R_LOCAL_STATE_ROOT sh tools/r-local.sh down $SLUG"
else
  stop
  echo "· $SLUG stopped"
fi
exit "$rc"
