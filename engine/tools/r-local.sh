#!/bin/sh
# tools/r-local.sh — run sharingu FULLY LOCAL on this machine: the same worker code (src/index.js), no Cloudflare account,
# D1, R2 and KV persisted on disk by `wrangler dev --local --persist-to`. The install's local mode (docs/INSTALL.md,
# engine/ORG-SETUP.md §"Run it locally"); the same platform on your own Cloudflare account is tools/new-org.sh. Local is a MODE
# of the one worker, never a fork: nothing in this file or tools/lib-r-local.sh reads CLOUDFLARE_API_TOKEN or calls Cloudflare.
#
# Usage:
#   sh tools/r-local.sh up <name> --empty [--email <you>] [--port <N>] [--lan]
#     THE INSTALL (sprint 7, 7.6): an EMPTY platform (boot.sql only: no org, no person, no key). --email allows that email
#     once the worker answers (tools/operator.mjs allow --local: its one-time code printed once, here); then the person signs
#     up at /signup and creates the first org at /orgs/new (its owner key shown once there) — the platform's one way an org
#     is born, as on the hosted platform.
#   sh tools/r-local.sh up <name> [--port <N>] [--lan] [--seed <seed.json>] [--project <key>[=<name>]]
#     THE TEST HARNESS (tools/smoke.sh, the suites' tools/lib.sh, gate-rehearsal.sh, volume-local.sh, restore-local.mjs,
#     dev-local.sh): the first run seeds org 1 by SQL (boot.sql, one owner key in credentials.env, the org's row named from
#     the slug; through `wrangler d1 execute --local`), so a script holds an owner key before any browser exists. With no
#     --seed it holds NO project; --project names one for the seed instead.
#     Either way it binds 127.0.0.1 unless --lan (then 0.0.0.0).
#   sh tools/r-local.sh down <name>       stops the dev server; the persisted data stays on disk.
#   sh tools/r-local.sh status <name>     up/down, port, seeded?, a /health probe if up.
#   sh tools/r-local.sh seed <name> [--empty | --seed <seed.json> | --project <key>[=<name>]]
#     (Re-)apply the seed explicitly. Refuses while it is up (wrangler dev holds the D1 file): `down` first.
#
# State: ~/.sharingu/r-local/<name>/ by default (R_LOCAL_STATE_ROOT overrides the root): persist/, wrangler.local.jsonc,
# and (the harness's seed) credentials.env (chmod 600, its own keys, never printed by this tool). Connect a Claude to its MCP
# at http://127.0.0.1:<port>/mcp with an owner key (engine/ORG-SETUP.md §"Run it locally").
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENGINE="$ROOT"
cd "$ROOT"
. "$ROOT/tools/lib-r-local.sh"

usage() {
  echo "usage: sh tools/r-local.sh {up|down|status|seed} <org> [...]" >&2
  echo "  up <org> --empty [--email <you>] [--port N] [--lan]" >&2
  echo "  up <org> [--port N] [--lan] [--seed <file>] [--project <key>[=<name>]]" >&2
  echo "  down <org>" >&2
  echo "  status <org>" >&2
  echo "  seed <org> [--empty | --seed <file> | --project <key>[=<name>]]" >&2
}

# rl_allow <org_dir> <email> — the operator allows the email on this local platform (tools/operator.mjs allow --local): the
# one-time code is printed ONCE, here, by the operator's tool itself; this script keeps it nowhere
rl_allow() {
  echo "· allowing $2 (tools/operator.mjs allow --local)"
  node "$ENGINE/tools/operator.mjs" allow --local "$1/persist" --config "$1/wrangler.local.jsonc" --email "$2" \
    || { echo "✗ the allow was refused — run it again: node tools/operator.mjs allow --local $1/persist --config $1/wrangler.local.jsonc --email <you>"; exit 1; }
}

cmd_up() {
  slug="$1"; shift
  port_req=""; lan=0; seed_path=""; proj=""; empty=0; email=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --port) port_req="$2"; shift 2 ;;
      --lan) lan=1; shift ;;
      --seed) seed_path="$2"; shift 2 ;;
      --project) proj="$2"; shift 2 ;;
      --empty) empty=1; shift ;;
      --email) email="$2"; shift 2 ;;
      *) echo "up: unknown argument $1" >&2; exit 2 ;;
    esac
  done
  rl_slug_ok "$slug" || { echo "✗ slug must be lowercase [a-z0-9-]: '$slug'"; exit 2; }
  if [ "$empty" = "1" ] && { [ -n "$seed_path" ] || [ -n "$proj" ]; }; then echo "✗ --empty seeds nothing: drop --seed/--project"; exit 2; fi
  org_dir="$(rl_org_dir "$slug")"
  if [ -n "$email" ] && [ "$empty" = "0" ] && [ ! -f "$org_dir/.empty" ]; then echo "✗ --email allows an email on an empty platform: add --empty"; exit 2; fi
  orgvar="$(rl_orgvar "$slug")"
  mkdir -p "$org_dir" "$org_dir/persist"

  if [ "$empty" = "1" ] && [ -f "$org_dir/.seeded" ] && [ ! -f "$org_dir/.empty" ]; then
    echo "✗ $slug was seeded by the harness (an owner minted by SQL), not --empty: choose another name"; exit 2
  fi
  if rl_is_up "$org_dir"; then
    port="$(cat "$org_dir/port" 2>/dev/null || echo '?')"
    echo "· $slug already up (pid $(cat "$org_dir/wrangler.pid")) — http://127.0.0.1:$port"
    [ -n "$email" ] && rl_allow "$org_dir" "$email"
    exit 0
  fi

  cfg="$(rl_gen_config "$slug" "$org_dir" "$ENGINE")"
  port="$(rl_pick_port "$port_req" "$org_dir")" || { echo "✗ could not find a free port (tried from \${R_LOCAL_PORT_BASE:-8850})"; exit 1; }

  first=0
  if [ ! -f "$org_dir/.seeded" ]; then
    first=1
    echo "· first run for $slug — seeding (offline, local D1/R2 only — no Cloudflare account touched)"
    if [ "$empty" = "1" ]; then
      rl_seed_empty "$slug" "$org_dir" "$ENGINE" "$cfg" "$org_dir/persist"
    else
      [ -n "$seed_path" ] || seed_path="$(rl_default_seed "$slug" "$org_dir" "$proj")"
      rl_seed "$slug" "$org_dir" "$ENGINE" "$seed_path" "$cfg" "$org_dir/persist"
    fi
  fi
  rl_write_url_line "$org_dir" "$orgvar" "$port"

  ip="127.0.0.1"; [ "$lan" = "1" ] && ip="0.0.0.0"
  echo "· starting wrangler dev ($slug) on $ip:$port — persisted at $org_dir/persist"
  (
    cd "$ENGINE"
    # R_LOCAL_TEST_SCHEDULED=1 (tools/smoke.sh only: sprint 21, 21.4b's s68 runs the cron once): wrangler's --test-scheduled, so
    # GET /__scheduled on this local worker runs its cron (src/cron.js); never set for a world another machine reaches
    nohup npx --no-install wrangler dev --config "$cfg" --local --persist-to "$org_dir/persist" \
      --port "$port" --ip "$ip" --local-protocol http ${R_LOCAL_TEST_SCHEDULED:+--test-scheduled} >"$org_dir/dev.log" 2>&1 &
    echo $! > "$org_dir/wrangler.pid"
  )
  sleep 1
  pid="$(cat "$org_dir/wrangler.pid" 2>/dev/null || echo '')"

  echo "· waiting for http://127.0.0.1:$port/health"
  tries=0; code=""; d1=""
  while [ "$tries" -lt 60 ]; do
    resp="$(curl -s "http://127.0.0.1:$port/health" 2>/dev/null || true)"
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/health" 2>/dev/null || true)"
    if [ "$code" = "200" ]; then
      d1="$(printf '%s' "$resp" | python3 -c "import json,sys
try: print(json.load(sys.stdin).get('d1',''))
except Exception: print('')" 2>/dev/null || true)"
      [ "$d1" = "ok" ] && break
    fi
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      echo "✗ wrangler dev exited early — see $org_dir/dev.log"; tail -30 "$org_dir/dev.log" 2>/dev/null || true; exit 1
    fi
    tries=$((tries + 1)); sleep 1
  done

  if [ "$code" = "200" ] && [ "$d1" = "ok" ] && [ -f "$org_dir/.empty" ]; then
    u="http://127.0.0.1:$port"
    echo "✓ $slug up — $u  (d1: ok, pid $pid) — the platform, holding no org until you create one"
    if [ -n "$email" ]; then
      rl_allow "$org_dir" "$email"
    else
      echo "  allow your email (the one-time code is printed once):"
      echo "             node tools/operator.mjs allow --local $org_dir/persist --config $cfg --email <you>"
    fi
    echo "  sign up:   $u/signup — the email, its code, a passphrase (at least 12 characters): your account"
    echo "  your org:  $u/orgs/new — your email and that passphrase, the org's name, its address, its first project;"
    echo "             the owner key is shown there ONCE"
    echo "  accept it: DAY0_URL=$u DAY0_KEY=<the owner key> DAY0_EMAIL=<you> sh tools/day0-verify.sh"
    echo "  connect:   claude mcp add $slug --transport http $u/mcp --header \"Authorization: Bearer <the owner key>\""
    echo "  stop:      sh tools/r-local.sh down $slug"
  elif [ "$code" = "200" ] && [ "$d1" = "ok" ]; then
    echo "✓ $slug up — http://127.0.0.1:$port  (d1: ok, pid $pid)"
    echo "  owner key: $org_dir/credentials.env (${orgvar}_AGENT_R_OWNER_KEY — never printed)"
    echo "  sign in:   http://127.0.0.1:$port/login as $(cat "$org_dir/owner.email" 2>/dev/null || echo "the seed's owner") with that key"
    echo "  connect:   claude mcp add $slug --transport http http://127.0.0.1:$port/mcp --header \"Authorization: Bearer <that key>\""
    if [ "$first" = "1" ]; then
      echo "  next:      ask your Claude to call whoami, then create_project (a key and a name), then missing with that project,"
      echo "             and fill it: each call through preview, then file"
    fi
    echo "  stop:      sh tools/r-local.sh down $slug"
  else
    echo "✗ $slug did not become healthy within ${tries}s (last /health=$code, d1=$d1) — see $org_dir/dev.log"
    exit 1
  fi
}

cmd_down() {
  slug="$1"
  rl_slug_ok "$slug" || { echo "✗ slug must be lowercase [a-z0-9-]: '$slug'"; exit 2; }
  org_dir="$(rl_org_dir "$slug")"
  if ! rl_is_up "$org_dir"; then
    echo "· $slug already down"
    rm -f "$org_dir/wrangler.pid"
    exit 0
  fi
  pid="$(cat "$org_dir/wrangler.pid")"
  kill "$pid" 2>/dev/null || true
  tries=0
  while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 20 ]; do sleep 0.5; tries=$((tries + 1)); done
  if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null || true; fi
  rm -f "$org_dir/wrangler.pid"
  echo "✓ $slug down (persisted data stays at $org_dir/persist)"
}

cmd_status() {
  slug="$1"
  rl_slug_ok "$slug" || { echo "✗ slug must be lowercase [a-z0-9-]: '$slug'"; exit 2; }
  org_dir="$(rl_org_dir "$slug")"
  port="$(cat "$org_dir/port" 2>/dev/null || echo '')"
  if rl_is_up "$org_dir"; then
    pid="$(cat "$org_dir/wrangler.pid")"
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/health" 2>/dev/null || true)"
    echo "$slug: UP (pid $pid) — http://127.0.0.1:$port — /health=$code"
  else
    echo "$slug: DOWN"
  fi
  if [ -f "$org_dir/.seeded" ]; then echo "  seeded: yes ($org_dir/persist)"; else echo "  seeded: no"; fi
  echo "  state:  $org_dir"
}

cmd_seed() {
  slug="$1"; shift
  seed_path=""; proj=""; empty=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --seed) seed_path="$2"; shift 2 ;;
      --project) proj="$2"; shift 2 ;;
      --empty) empty=1; shift ;;
      *) echo "seed: unknown argument $1" >&2; exit 2 ;;
    esac
  done
  if [ "$empty" = "1" ] && { [ -n "$seed_path" ] || [ -n "$proj" ]; }; then echo "✗ --empty seeds nothing: drop --seed/--project"; exit 2; fi
  rl_slug_ok "$slug" || { echo "✗ slug must be lowercase [a-z0-9-]: '$slug'"; exit 2; }
  org_dir="$(rl_org_dir "$slug")"
  mkdir -p "$org_dir" "$org_dir/persist"
  if rl_is_up "$org_dir"; then
    echo "✗ $slug is up — 'sh tools/r-local.sh down $slug' first (wrangler dev holds the local D1 file)"
    exit 1
  fi
  cfg="$(rl_gen_config "$slug" "$org_dir" "$ENGINE")"
  if [ "$empty" = "1" ]; then
    rl_seed_empty "$slug" "$org_dir" "$ENGINE" "$cfg" "$org_dir/persist"
  else
    [ -n "$seed_path" ] || seed_path="$(rl_default_seed "$slug" "$org_dir" "$proj")"
    rl_seed "$slug" "$org_dir" "$ENGINE" "$seed_path" "$cfg" "$org_dir/persist"
  fi
  echo "✓ $slug seeded at $org_dir/persist"
}

cmd="${1:-}"
[ $# -ge 1 ] && shift || true
case "$cmd" in
  up)     [ $# -ge 1 ] || { usage; exit 2; }; cmd_up "$@" ;;
  down)   [ $# -ge 1 ] || { usage; exit 2; }; cmd_down "$@" ;;
  status) [ $# -ge 1 ] || { usage; exit 2; }; cmd_status "$@" ;;
  seed)   [ $# -ge 1 ] || { usage; exit 2; }; cmd_seed "$@" ;;
  *) usage; exit 2 ;;
esac
