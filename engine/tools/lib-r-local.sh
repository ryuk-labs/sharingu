# tools/lib-r-local.sh — the harness behind tools/r-local.sh: an org run fully on this machine (docs/INSTALL.md §4,
# engine/ORG-SETUP.md §"Run an org locally"). Local is a MODE of the one worker (`wrangler dev --local --persist-to`, D1,
# R2 and KV simulated on disk), never a fork: the same src/index.js, the same wrangler.tenant.template.jsonc, no
# Cloudflare account.
#
# Sourced by tools/r-local.sh (the CLI), tools/r-local-selftest.sh (the gate step:
# pure config-generation checks, no wrangler process, no network) and the suites' tools/lib.sh. Nothing here reads CLOUDFLARE_API_TOKEN or calls Cloudflare: that is the whole point of "local".
#
# STATE LAYOUT (outside git: a scratch org never touches anything the repo tracks):
#   $(rl_state_root)/<org>/
#     wrangler.local.jsonc   generated from wrangler.tenant.template.jsonc (main = absolute path)
#     persist/               wrangler's --persist-to target (D1 sqlite, R2 blobs, KV, all local)
#     credentials.env        THIS org's own keys (chmod 600): <ORG>_AGENT_R_OWNER_KEY, <ORG>_AGENT_R_URL; never printed
#                            by anything in this file
#     seed.default.json      the seed the first run used when none was given (one owner, no project), manifest.json (the
#                            brand its org row is written from, tools/org-row.py)
#     owner.email            the seeded owner's email (the sign-in name; not a secret)
#     port                   the port this org is bound to (stable across down/up)
#     wrangler.pid           the running `wrangler dev` pid, while up
#     dev.log                its stdout/stderr
#     .seeded                marker: boot.sql + owner (+ the seed's projects) already applied once
#     .empty                 marker: seeded with --empty (boot.sql only: an empty platform, its first org made at /orgs/new)
# The root defaults to ~/.sharingu/r-local; R_LOCAL_STATE_ROOT overrides it. This repo's own tools keep theirs under
# engine/.runs/r-local (tools/smoke.sh, tools/dev-local.sh); the selftest and the proof use a throwaway root.

rl_slug_ok() {
  printf '%s' "$1" | grep -qE '^[a-z0-9][a-z0-9-]*$'
}

rl_orgvar() {
  printf '%s' "$1" | tr 'a-z-' 'A-Z_'
}

rl_state_root() {
  printf '%s' "${R_LOCAL_STATE_ROOT:-$HOME/.sharingu/r-local}"
}

rl_org_dir() {
  printf '%s/%s' "$(rl_state_root)" "$1"
}

# rl_det_uuid <seed-string> — a STABLE uuid5, so the same org always gets the same D1/KV id across
# down/up cycles (and across a config regenerated on every `up`) without a second file to track it.
# Never used for anything security-sensitive — it is a local simulation key, not a credential.
rl_det_uuid() {
  python3 -c "import uuid,sys; print(uuid.uuid5(uuid.NAMESPACE_URL, sys.argv[1]))" "$1"
}

# rl_port_busy <port> — true if ANY process is LISTENing on it, any interface (never trust "not on
# 127.0.0.1" as free — a --lan run from a prior session may still hold 0.0.0.0).
rl_port_busy() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

# rl_pick_port <requested> <org_dir> — a requested port wins outright (the caller's call); otherwise
# the org's OWN cached port (stable across restarts) if one exists; otherwise the first free port at
# or above R_LOCAL_PORT_BASE (default 8850), never 8792 (a port reserved on the owner's machine; the selftest pins the
# guard) and never anything lsof already shows LISTENing. Caches whatever it picks.
rl_pick_port() {
  requested="$1"; org_dir="$2"
  mkdir -p "$org_dir"
  if [ -n "$requested" ]; then
    printf '%s' "$requested" > "$org_dir/port"
    printf '%s' "$requested"
    return 0
  fi
  if [ -f "$org_dir/port" ]; then
    cached="$(cat "$org_dir/port" 2>/dev/null || true)"
    if [ -n "$cached" ]; then printf '%s' "$cached"; return 0; fi
  fi
  base="${R_LOCAL_PORT_BASE:-8850}"
  p="$base"; tries=0
  while [ "$tries" -lt 200 ]; do
    if [ "$p" != "8792" ] && ! rl_port_busy "$p"; then
      printf '%s' "$p" > "$org_dir/port"
      printf '%s' "$p"
      return 0
    fi
    p=$((p + 1)); tries=$((tries + 1))
  done
  return 1
}

# rl_gen_config <slug> <org_dir> <engine_root> — writes org_dir/wrangler.local.jsonc from THIS repo's
# own wrangler.tenant.template.jsonc (never a second, hand-maintained local template — the whole
# point of "a mode, never a fork"): fills <ORG>/<D1_ID>/<KV_ID>, strips the "triggers" block (local
# dev runs no cron scheduler without --test-scheduled, and there is no account-wide cap to respect
# here), strips the "routes" list (QD99DA798: the real config's Custom Domain agent.ryuklabs.io —
# `wrangler dev` may take its dev host from the first route, and the local R must keep its own
# 127.0.0.1 origin for every same-origin check), and points "main" at an ABSOLUTE path to src/index.js — the generated config lives outside
# the repo (the org's state dir), so a relative "main" would resolve against the wrong directory.
# Idempotent and side-effect-free beyond writing that one file; safe to call on every `up`.
#
# R_LOCAL_CONFIG_SRC (optional — the local-first suites, Q9CF32D8F): generate from THAT config instead of the
# tenant template — tools/lib.sh points it at the engine's own wrangler.jsonc, so the suites' local R carries the
# real ryuklabs bindings (LOGIN_LIMIT included) under its own local database_id / KV id (both swapped below, so a
# stray --remote against this config could never reach the live D1).
rl_gen_config() {
  slug="$1"; org_dir="$2"; engine="$3"
  tmpl="${R_LOCAL_CONFIG_SRC:-$engine/wrangler.tenant.template.jsonc}"
  [ -f "$tmpl" ] || { echo "✗ $tmpl missing" >&2; return 1; }
  mkdir -p "$org_dir"
  cfg="$org_dir/wrangler.local.jsonc"
  d1_id="$(rl_det_uuid "r-local:$slug:d1")"
  kv_id="$(rl_det_uuid "r-local:$slug:kv")"
  python3 - "$tmpl" "$slug" "$d1_id" "$kv_id" "$engine/src/index.js" "$cfg" <<'PY'
import sys, re, json
tmpl, slug, d1, kv, main_abs, out = sys.argv[1:7]
t = open(tmpl).read()
t = t.replace("<ORG>", slug).replace("<D1_ID>", d1).replace("<KV_ID>", kv)
t = re.sub(r',?\s*"triggers":\s*\{[^}]*\}', '', t, count=1)
t = re.sub(r'\n[ \t]*"routes":\s*\[[^\]]*\],?', '', t, count=1)
t = re.sub(r'"main":\s*"[^"]*"', '"main": ' + json.dumps(main_abs), t, count=1)
t = re.sub(r'"database_id":\s*"[^"]*"', '"database_id": ' + json.dumps(d1), t, count=1)
t = re.sub(r'("binding":\s*"OAUTH_KV",\s*"id":\s*)"[^"]*"', lambda m: m.group(1) + json.dumps(kv), t, count=1)
open(out, "w").write(t)
PY
  printf '%s' "$cfg"
}

# rl_config_get <cfg-path> <json-pointer-ish python expr on `d`> — one comment-stripped JSON read,
# shared by every caller below that needs a name out of the generated config (never re-derive the
# naming convention in two places).
rl_config_field() {
  python3 -c "import json,re,sys
s=re.sub(r'//[^\n]*','',open(sys.argv[1]).read())
d=json.loads(s)
print(eval(sys.argv[2]))" "$1" "$2"
}

# rl_slug_title <slug> — a readable Title Case name from a lowercase-hyphen slug ("my-org" -> "My
# Org"), the ONE place this local-R harness invents a display name from a slug — never a second,
# drifting naming convention.
rl_slug_title() {
  python3 -c "import sys
print(' '.join(w.capitalize() for w in sys.argv[1].split('-') if w))" "$1"
}

# rl_write_default_manifest <title> <out-path> — the ONE minimal brand shape a seed's org row is written from
# (tools/org-row.py): org/productTitle/loginTitle from a display title — the org's name is brand.org, NEVER `name`
# (bug0914:q1-r-local-needs-wrangler-and-seeds-siru-brand: an org that names itself nowhere renders the product default).
# Used by rl_default_seed (below, r-local): a seed with no manifest takes this default brand
# (bug0914:new-org-crashes-after-create-on-a-seed-without-manifest).
rl_write_default_manifest() {
  title="$1"; out="$2"
  cat > "$out" <<EOF
{ "brand": { "org": "$title", "productTitle": "$title · sharingu", "loginTitle": "Sign in · $title · sharingu" } }
EOF
}

# rl_default_seed <slug> <org_dir> [<key>[=<name>]] — the seed of a first run with no --seed: one owner and the org's
# brand (its row's name), and NO project unless one is named. A fresh org's first step is the owner's
# Claude calling create_project (the MCP), so the seed invents no project of its own (sprint 3: a default "<slug> local"
# project used to sit in every local org as junk). A caller that needs one names it: `r-local.sh seed|up --project
# <key>[=<name>]` (the smoke's cases run on a project keyed "local"); a name left out is the key.
# The owner's display name is "Local Owner" unless R_LOCAL_OWNER_NAME names the org's real owner (sprint 3: the ship
# candidate is seeded as on live, where the owner is the real person — tools/dev-local.sh DEV_OWNER_NAME sets it). A name
# only: 1-80 characters, no "@" (never an email), no control character; anything else is refused. Initials come from the
# name (src/hats.js initialsOf: "Ryuk" -> "RY"). The sign-in email stays owner@<slug>.local.
rl_default_seed() {
  slug="$1"; org_dir="$2"; proj="${3:-}"
  mkdir -p "$org_dir"
  manifest="$org_dir/manifest.json"
  seed="$org_dir/seed.default.json"
  title="$(rl_slug_title "$slug")"
  rl_write_default_manifest "$title" "$manifest"
  python3 - "$slug" "$manifest" "$proj" "$seed" "${R_LOCAL_OWNER_NAME:-}" <<'PY2' || return 1
import json, sys
slug, manifest, proj, out, owner = sys.argv[1:6]
owner = " ".join(owner.split())
if not owner:
    owner = "Local Owner"
elif len(owner) > 80 or "@" in owner or any(ord(c) < 32 for c in owner):
    sys.exit("R_LOCAL_OWNER_NAME must be a name (1-80 characters, no @, no control character)")
projects = []
if proj:
    key, _, name = proj.partition("=")
    projects.append({"key": key, "name": name or key, "registry_ptr": ""})
json.dump({"org": slug, "owner": {"name": owner, "email": "owner@" + slug + ".local"}, "projects": projects,
           "manifest": manifest}, open(out, "w"), indent=2)
PY2
  printf '%s' "$seed"
}

# rl_seed <slug> <org_dir> <engine_root> <seed.json> <cfg> <persist_dir> — a local org's seed
# (boot.sql -> mint -> insert people, projects, seats and the org's row -> the keys to the org's own credentials file), reissued
# entirely against `--local --persist-to` — NO CLOUDFLARE_API_TOKEN, no network call to Cloudflare,
# anywhere in this function. Writes org_dir/credentials.env (chmod 600, append-only, never echoed)
# and touches org_dir/.seeded on success.
rl_seed() {
  slug="$1"; org_dir="$2"; engine="$3"; seed_path="$4"; cfg="$5"; persist="$6"
  db="$(rl_config_field "$cfg" "d['d1_databases'][0]['database_name']")"

  echo "  · boot schema (local D1, no Cloudflare account touched)"
  npx --no-install wrangler d1 execute "$db" --config "$cfg" --local --persist-to "$persist" --file "$engine/boot.sql" </dev/null >/dev/null

  echo "  · minting the owner secret + seeding projects/seats and the org's row (local, offline)"
  sql="$org_dir/seed.sql.$$"
  creds="$org_dir/seed.creds.$$"
  SEED="$seed_path" SQL="$sql" CREDS="$creds" python3 <<'EOF'
import hashlib, json, os, secrets, uuid, datetime
seed = json.load(open(os.environ["SEED"]))
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
org = seed["org"].upper().replace("-", "_")
sql, creds = [], []

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

def mint(person, role, var):
    key = secrets.token_hex(20)  # bare key — TOKEN_PREFIX is "" (src/tenant.js, owner ruling 2026-09-03)
    kh = hashlib.sha256(key.encode()).hexdigest()
    salt = secrets.token_hex(16)
    ph = hashlib.pbkdf2_hmac("sha256", key.encode(), bytes.fromhex(salt), 100000, 32).hex()
    pid = "org-owner-0001" if role == "owner" else str(uuid.uuid4())
    # sprint 6 (migrate-068): a person carries their org; a fresh org's seed is org 1 (src/tenant.js HOME_ORG)
    sql.append(f"INSERT INTO people (id,name,email,role,key_hash,pass_hash,pass_salt,active,created_at,org) VALUES ({q(pid)},{q(person['name'])},{q(person['email'].lower())},{q(role)},{q(kh)},{q(ph)},{q(salt)},1,{q(now)},1);")
    creds.append(f"{var}={key}")
    return pid

owner_id = mint(seed["owner"], "owner", f"{org}_AGENT_R_OWNER_KEY")
if seed.get("evalSeat"):
    ev_id = mint(seed["evalSeat"], "internal-eng", f"{org}_KEY_EVALSEAT")
    creds.append(f"{org}_EVALSEAT_EMAIL={seed['evalSeat']['email'].lower()}")

for p in seed["projects"]:
    # "eval": true marks a test run's own project (migrate-062: the suites' fresh org; G2: the eval mark is accepted only there)
    sql.append(f"INSERT INTO projects (key,name,registry_ptr,active,created_at,eval) VALUES ({q(p['key'])},{q(p['name'])},{q(p.get('registry_ptr') or '')},1,{q(now)},{1 if p.get('eval') else 0});")
    sql.append(f"INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ({q(owner_id)},{q(p['key'])},'owner',{q(now)});")
    if seed.get("evalSeat"):
        sql.append(f"INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ({q(ev_id)},{q(p['key'])},'member',{q(now)});")

open(os.environ["SQL"], "w").write("\n".join(sql) + "\n")
open(os.environ["CREDS"], "w").write("\n".join(creds) + "\n")
EOF
  # the org's own row (its name and brand; src/tenant.js reads it), from the seed's manifest, after the owner it names
  manifest="$(python3 -c "import json; print(json.load(open('$seed_path')).get('manifest') or '')")"
  keys="$(python3 -c "import json; print(','.join(p['key'] for p in (json.load(open('$seed_path')).get('projects') or [])))")"
  [ -n "$manifest" ] && python3 "$engine/tools/org-row.py" "$manifest" --by org-owner-0001 --projects "$keys" >> "$sql"
  # sprint 8, 8.2: the seeded org 1 is raised by hand, as the operator raises an org during the beta (PLATFORM §4): the suites, the
  # smoke and the local app file through the door and every row and call they make counts (an eval mark is no way around a limit),
  # and the smoke's org 1 alone outgrows TEAM (about 73 seats, 40 active projects, over 1,000 calls in its first 22 seconds). So a
  # LOCAL database gets one more plan row, 'local' (data, never on live: only the harness writes it; its one source is
  # tools/fixtures/local-plan.sql), and org 1 is on it, as every org the harness makes is (8.2f, main's ruling). The ruled free and
  # team rows stay exactly as ruled (s46 pins free); an org a run makes at /orgs/new is free, as on live, until the case raises it.
  # (an engine before sprint 8 holds no such file, and no plan to set: its seed is as it was)
  if [ -f "$engine/tools/fixtures/local-plan.sql" ]; then
    cat "$engine/tools/fixtures/local-plan.sql" >> "$sql"
    echo "UPDATE org SET plan = 'local' WHERE id = 1;" >> "$sql"
  fi
  npx --no-install wrangler d1 execute "$db" --config "$cfg" --local --persist-to "$persist" --file "$sql" </dev/null >/dev/null
  rm -f "$sql"

  echo "  · credentials -> $org_dir/credentials.env (chmod 600, never echoed)"
  mkdir -p "$org_dir"
  cat "$creds" >> "$org_dir/credentials.env"
  rm -f "$creds"
  chmod 600 "$org_dir/credentials.env"
  python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['owner']['email'].lower())" "$seed_path" > "$org_dir/owner.email" 2>/dev/null || rm -f "$org_dir/owner.email"
  rm -f "$org_dir/.empty"
  touch "$org_dir/.seeded"
}

# rl_seed_empty <slug> <org_dir> <engine_root> <cfg> <persist_dir> — an EMPTY platform (sprint 7, 7.6): boot.sql and nothing
# else — no org row, no person, no key. Its first org is born the platform's one way, a write through the door: the
# operator allows an email (tools/operator.mjs allow --local), the person signs up at /signup and creates the org at
# /orgs/new. Marks org_dir/.empty beside .seeded (r-local.sh up then prints that way instead of an owner key).
rl_seed_empty() {
  slug="$1"; org_dir="$2"; engine="$3"; cfg="$4"; persist="$5"
  db="$(rl_config_field "$cfg" "d['d1_databases'][0]['database_name']")"
  echo "  · boot schema only (an empty platform: no org, no person, no key; local D1, no Cloudflare account touched)"
  npx --no-install wrangler d1 execute "$db" --config "$cfg" --local --persist-to "$persist" --file "$engine/boot.sql" </dev/null >/dev/null
  touch "$org_dir/.empty" "$org_dir/.seeded"
}

# rl_is_up <org_dir> — true iff a wrangler.pid exists AND that pid is alive. The only source of
# truth for "running" this file uses; never inferred from the port file alone (a stale port file
# must never read as "up").
rl_is_up() {
  org_dir="$1"
  [ -f "$org_dir/wrangler.pid" ] || return 1
  pid="$(cat "$org_dir/wrangler.pid" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# rl_write_url_line <org_dir> <orgvar> <port> — keeps exactly one `<ORG>_AGENT_R_URL=` line in this
# org's own credentials.env, current with whatever port it is actually bound to right now (a
# --port override after the org was already seeded must not leave a stale URL behind).
rl_write_url_line() {
  org_dir="$1"; orgvar="$2"; port="$3"
  mkdir -p "$org_dir"
  if [ -f "$org_dir/credentials.env" ]; then
    grep -v "^${orgvar}_AGENT_R_URL=" "$org_dir/credentials.env" > "$org_dir/credentials.env.tmp" 2>/dev/null || true
    mv "$org_dir/credentials.env.tmp" "$org_dir/credentials.env"
  fi
  printf '%s_AGENT_R_URL=http://127.0.0.1:%s\n' "$orgvar" "$port" >> "$org_dir/credentials.env"
  chmod 600 "$org_dir/credentials.env"
}
