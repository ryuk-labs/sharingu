#!/bin/sh
# tools/r-local-selftest.sh — the GATE step for tools/r-local.sh / tools/lib-r-local.sh (R4, sharingu
# v1.0 install mode 2). Pure and fast on purpose: NO wrangler process, NO network, NO Cloudflare
# account — same "gate is local, fast, deterministic" law every other selftest in gate.sh follows.
# Proves the config generator's own contract (the four holes filled, no cron block, main = an
# absolute, existing path) and the slug/port guards, using a throwaway state root under $TMPDIR so
# nothing here ever touches ~/.sharingu/r-local/ or a real port.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
. "$ROOT/tools/lib-r-local.sh"

pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; fail=$((fail + 1)); }

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/r-local-selftest.XXXXXX")"
trap 'rm -rf "$SCRATCH"' EXIT

echo "== r-local-selftest =="

echo "-- slug validation --"
rl_slug_ok "kit-org-1" && ok "slug: accepts lowercase [a-z0-9-]" || bad "slug: rejected a valid slug"
rl_slug_ok "Kit_Org" && bad "slug: accepted an invalid slug (uppercase/underscore)" || ok "slug: rejects uppercase/underscore"
rl_slug_ok "-kit" && bad "slug: accepted a leading hyphen" || ok "slug: rejects a leading hyphen"

echo "-- orgvar --"
[ "$(rl_orgvar "my-org")" = "MY_ORG" ] && ok "orgvar: my-org -> MY_ORG" || bad "orgvar: wrong mapping"

echo "-- config generation (offline, no wrangler invoked) --"
ORG_DIR="$SCRATCH/myorg"
mkdir -p "$ORG_DIR"
CFG="$(rl_gen_config "myorg" "$ORG_DIR" "$ROOT")"
[ -f "$CFG" ] || bad "config: rl_gen_config did not write $CFG"

CHECK=$(python3 - "$CFG" "$ROOT/src/index.js" <<'PY'
import json, re, sys
cfg, expect_main = sys.argv[1], sys.argv[2]
s = re.sub(r'//[^\n]*', '', open(cfg).read())
d = json.loads(s)
errs = []
if "<ORG>" in s or "<D1_ID>" in s or "<KV_ID>" in s:
    errs.append("a template hole was left unfilled")
if "triggers" in d:
    errs.append("triggers block was not stripped for local dev")
if d.get("main") != expect_main:
    errs.append(f"main is {d.get('main')!r}, want {expect_main!r}")
if d.get("d1_databases", [{}])[0].get("database_name") != "myorg-agent-r":
    errs.append("d1 database_name did not fill from the slug")
if d.get("r2_buckets", [{}])[0].get("bucket_name") != "myorg-brain":
    errs.append("r2 bucket_name did not fill from the slug")
print("OK" if not errs else "FAIL: " + "; ".join(errs))
PY
)
case "$CHECK" in
  OK) ok "config: four holes filled, no triggers block, main is an absolute existing path" ;;
  *) bad "config: $CHECK" ;;
esac

[ -f "$(rl_config_field "$CFG" "d['main']" 2>/dev/null || echo /nonexistent)" ] \
  && ok "config: main points at a file that actually exists" \
  || bad "config: main does not point at an existing file"

echo "-- default seed brand uses tenant.js's OWN schema keys, never SIRU (bug0914:q1-r-local-needs-wrangler-and-seeds-siru-brand) --"
BRAND_DIR="$SCRATCH/my-cool-org"
SEED_JSON="$(rl_default_seed "my-cool-org" "$BRAND_DIR")"
[ -f "$SEED_JSON" ] && ok "default-seed: writes a seed.default.json" || bad "default-seed: rl_default_seed returned no file"
BRAND_CHECK=$(python3 - "$BRAND_DIR/manifest.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
b = d.get("brand") if isinstance(d, dict) else None
errs = []
if not isinstance(b, dict):
    errs.append("no brand object")
else:
    for k in ("org", "productTitle", "loginTitle"):
        v = b.get(k)
        if not v:
            errs.append(f"missing/empty schema key {k!r} (a manifest that omits it deep-merges SIRU's own default)")
        elif "SIRU" in v:
            errs.append(f"{k} still carries SIRU: {v!r}")
    if "My Cool Org" not in (b.get("org") or ""):
        errs.append(f"org does not derive from the slug: {b.get('org')!r}")
print("OK" if not errs else "FAIL: " + "; ".join(errs))
PY
)
case "$BRAND_CHECK" in
  OK) ok "default-seed: brand.org/productTitle/loginTitle are the real schema keys, derived from the slug, never SIRU" ;;
  *) bad "default-seed: $BRAND_CHECK" ;;
esac
# the seed writes that brand as the org's ONE row (tools/org-row.py, src/tenant.js reads it): the name, the titles, the owner
ORG_SQL_OUT="$(python3 "$ROOT/tools/org-row.py" "$BRAND_DIR/manifest.json" --by org-owner-0001 --at 2026-01-01T00:00:00Z --projects "")"
case "$ORG_SQL_OUT" in
  "INSERT INTO org (id, name, brand, home, settings, created_by, created_at, updated_by, updated_at) VALUES (1, 'My Cool Org', '{\"productTitle\":\"My Cool Org · sharingu\",\"loginTitle\":\"Sign in · My Cool Org · sharingu\"}', NULL, NULL, 'org-owner-0001', '2026-01-01T00:00:00Z', 'org-owner-0001', '2026-01-01T00:00:00Z') ON CONFLICT(id)"*)
    ok "default-seed: the org's row carries the slug's name and the two titles, no home, no settings, created by the owner" ;;
  *) bad "default-seed: the org row is wrong: $ORG_SQL_OUT" ;;
esac
HOME_MAN="$SCRATCH/home-man.json"; printf '{"brand":{"org":"H"},"projects":[{"key":"Alpha","home":true}],"evalSeats":["e@x.test"],"domain":"https://h.example"}\n' > "$HOME_MAN"
H1="$(python3 "$ROOT/tools/org-row.py" "$HOME_MAN" --projects alpha)"; H0="$(python3 "$ROOT/tools/org-row.py" "$HOME_MAN" --projects beta)"
{ echo "$H1" | grep -q "'H', NULL, 'alpha', '{\"domain\":\"https://h.example\",\"evalSeats\":\[\"e@x.test\"\]}'" && echo "$H0" | grep -q "'H', NULL, NULL, '"; } \
  && ok "org-row: a home the seed creates is kept (lowercased), one it does not create is dropped; domain and evalSeats ride the settings" \
  || bad "org-row: home/settings wrong: $H1 | $H0"

echo "-- config generation is deterministic (same slug -> same d1/kv id across regen) --"
ID1="$(rl_det_uuid "r-local:myorg:d1")"
ID2="$(rl_det_uuid "r-local:myorg:d1")"
[ "$ID1" = "$ID2" ] && ok "det-uuid: stable across calls" || bad "det-uuid: not stable ($ID1 vs $ID2)"
DIFF_ID="$(rl_det_uuid "r-local:otherorg:d1")"
[ "$ID1" != "$DIFF_ID" ] && ok "det-uuid: differs across org slugs" || bad "det-uuid: collided across slugs"

echo "-- rl_gen_config is idempotent (mutation: a stray hand-edit gets overwritten, never merged) --"
printf '\n// hand-edited stray comment\n' >> "$CFG"
CFG2="$(rl_gen_config "myorg" "$ORG_DIR" "$ROOT")"
grep -q "hand-edited stray comment" "$CFG2" && bad "config: regeneration did not overwrite a stray edit" || ok "config: regeneration overwrites cleanly"

echo "-- port picker --"
PORT_DIR="$SCRATCH/portorg"
P1="$(rl_pick_port "" "$PORT_DIR")"
[ "$P1" != "8792" ] && ok "port: never picks 8792 (the owner's face)" || bad "port: picked 8792"
P2="$(rl_pick_port "" "$PORT_DIR")"
[ "$P1" = "$P2" ] && ok "port: cached across calls for the same org (stable across down/up)" || bad "port: not stable ($P1 vs $P2)"
P3="$(rl_pick_port "9999" "$PORT_DIR")"
[ "$P3" = "9999" ] && ok "port: an explicit --port request wins outright" || bad "port: explicit request ignored"
# mutation: force 8792 into R_LOCAL_PORT_BASE and prove the guard still refuses it, not just "never the default base"
P4="$(R_LOCAL_PORT_BASE=8792 rl_pick_port "" "$SCRATCH/portorg2")"
[ "$P4" != "8792" ] && ok "port: the 8792 guard holds even when it is the requested BASE, not just the default" || bad "port: 8792 guard is load-bearing only by accident of the default"

echo "-- rl_is_up / rl_write_url_line — pure fs checks, no process started --"
UP_DIR="$SCRATCH/uporg"
mkdir -p "$UP_DIR"
rl_is_up "$UP_DIR" && bad "is_up: read UP with no pid file" || ok "is_up: DOWN with no pid file"
echo "999999999" > "$UP_DIR/wrangler.pid"   # a pid that cannot exist
rl_is_up "$UP_DIR" && bad "is_up: read UP for a dead pid" || ok "is_up: DOWN for a pid that isn't alive"
rl_write_url_line "$UP_DIR" "MYORG" "8850"
rl_write_url_line "$UP_DIR" "MYORG" "8851"
LINES=$(grep -c "^MYORG_AGENT_R_URL=" "$UP_DIR/credentials.env" || true)
[ "$LINES" = "1" ] && grep -q "^MYORG_AGENT_R_URL=http://127.0.0.1:8851$" "$UP_DIR/credentials.env" \
  && ok "url-line: exactly one line, current with the latest port" \
  || bad "url-line: stale or duplicate URL line ($LINES lines)"

echo "-- the suites' local dev org (Q9CF32D8F) — its config source --"
# R_LOCAL_CONFIG_SRC: generated from the engine's own wrangler.jsonc, the live ids are SWAPPED for local ones
SRC_DIR="$SCRATCH/srcorg"; mkdir -p "$SRC_DIR"
SCFG="$(R_LOCAL_CONFIG_SRC="$ROOT/wrangler.jsonc" rl_gen_config "ryuklabs-local" "$SRC_DIR" "$ROOT")"
SRC_CHECK=$(python3 - "$SCFG" "$ROOT/wrangler.jsonc" "$(rl_det_uuid "r-local:ryuklabs-local:d1")" "$(rl_det_uuid "r-local:ryuklabs-local:kv")" <<'PY2'
import json, re, sys
g = json.loads(re.sub(r'//[^\n]*', '', open(sys.argv[1]).read())); live = json.loads(re.sub(r'//[^\n]*', '', open(sys.argv[2]).read()))
errs = []
if g["d1_databases"][0]["database_id"] != sys.argv[3]: errs.append("database_id not the local uuid")
if g["d1_databases"][0]["database_id"] == live["d1_databases"][0]["database_id"]: errs.append("the LIVE database_id survived")
if g["kv_namespaces"][0]["id"] != sys.argv[4]: errs.append("KV id not the local uuid")
if "triggers" in g: errs.append("triggers not stripped")
if g.get("ratelimits") != live.get("ratelimits"): errs.append("the live bindings (ratelimits) were not carried")
print("OK" if not errs else "FAIL: " + "; ".join(errs))
PY2
)
[ "$SRC_CHECK" = "OK" ] && ok "config-src: from wrangler.jsonc — live bindings kept, live D1/KV ids swapped for local ones, no crons" || bad "config-src: $SRC_CHECK"

echo ""
echo "r-local-selftest: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
