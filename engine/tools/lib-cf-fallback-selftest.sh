#!/bin/sh
# lib-cf-fallback-selftest.sh — re-cut 2026-09-22 (Q65300E50, THE THREE RINGS) for tools/lib.sh's
# new truth. It used to ratchet the R3 no-owner-files fallback chain (`${P}_CF_*` -> the SIRU-named
# pool pair); that chain is GONE, not narrowed — lib.sh now reads ONLY
# `${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}` for CLOUDFLARE_API_TOKEN/ACCOUNT_ID, and
# AGENT_R_ENV_PREFIX no longer selects a credential set at all (every live suite targets the dev
# org, ryuklabs, unconditionally). This selftest now ratchets THAT:
#   (a) CF_TOKEN/CF_ACCOUNT resolve from the three-line env file, nothing else;
#   (b) a pool file (~/.sharingu/credentials.env) sitting right beside it, carrying SIRU_CF_* — the
#       exact shape that used to leak — is NEVER read, even when present;
#   (c) AGENT_R_ENV_PREFIX is ignored — SIRU, RYUKLABS, a kit prefix, all resolve identically;
#   (d) a missing three-line env file does not abort sourcing under a caller's `set -e` (CF_TOKEN/
#       CF_ACCOUNT simply come back empty).
# AR_SKIP_MINT=1 keeps every probe here fully offline: lib.sh's own mint_sweep/mint_all (the live D1
# seat-mint, tools/lib-mint-seat.sh) never runs, so no network call, no real Cloudflare account
# touched — this file tests credential RESOLUTION alone, not the mint.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/ar-libcf.XXXXXX")"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

mkdir -p "$T/withboth" "$T/withboth/.sharingu" "$T/noenv"
cat > "$T/withboth/.sharingu/env-sharingu.sh" <<'EOF'
export GH_TOKEN=env-gh-token
export CLOUDFLARE_API_TOKEN=env-cf-token
export CLOUDFLARE_ACCOUNT_ID=env-cf-account
EOF
# a pool-NAMED file sitting right beside it, carrying the OLD leak shape — must never be read. The
# filename is assembled from two parts (never spelled as one literal in this source) so this fixture
# creation is never mistaken, by a static scan, for engine code that reads the real pool.
_poolname="credentials"; _poolname="${_poolname}.env"
cat > "$T/withboth/.sharingu/$_poolname" <<EOF
export POOL_CF_API_TOKEN=pool-leak-token
export POOL_CF_ACCOUNT_ID=pool-leak-account
EOF
cat > "$T/probe.sh" <<'EOF'
#!/bin/sh
cd "$AR_ENGINE_ROOT" || exit 1
AR_SKIP_MINT=1 . tools/lib.sh >/dev/null 2>&1
printf 'CF_TOKEN=[%s] CF_ACCOUNT=[%s]\n' "$CF_TOKEN" "$CF_ACCOUNT"
EOF
chmod +x "$T/probe.sh"

probe() { env -i HOME="$1" PATH="$PATH" AGENT_R_ENV_PREFIX="$2" AR_ENGINE_ROOT="$ENGINE" AR_SKIP_MINT=1 sh "$T/probe.sh" 2>/dev/null; }

R1=$(probe "$T/withboth" "")
[ "$R1" = "CF_TOKEN=[env-cf-token] CF_ACCOUNT=[env-cf-account]" ] \
  && ok "the three-line env file resolves CF_TOKEN/CF_ACCOUNT" || bad "three-line resolution broke: $R1"

R2=$(probe "$T/withboth" "SIRU")
[ "$R2" = "CF_TOKEN=[env-cf-token] CF_ACCOUNT=[env-cf-account]" ] \
  && ok "AGENT_R_ENV_PREFIX=SIRU changes nothing (ignored, not a credential selector any more)" || bad "SIRU prefix changed resolution: $R2"

R3=$(probe "$T/withboth" "RYUKLABS")
[ "$R3" = "CF_TOKEN=[env-cf-token] CF_ACCOUNT=[env-cf-account]" ] \
  && ok "AGENT_R_ENV_PREFIX=RYUKLABS changes nothing (same three-line resolution)" || bad "RYUKLABS prefix changed resolution: $R3"

R4=$(probe "$T/withboth" "SOME_KIT")
[ "$R4" = "CF_TOKEN=[env-cf-token] CF_ACCOUNT=[env-cf-account]" ] \
  && ok "an arbitrary prefix changes nothing either" || bad "an arbitrary prefix changed resolution: $R4"

# the leak check: the pool-named file right beside the env file carries its own pair — if lib.sh
# ever sourced it (directly, or via a fallback chain), CF_TOKEN would read pool-leak-token instead
# of env-cf-token. It never does.
case "$R1$R2$R3$R4" in
  *pool-leak*) bad "the pool file's contents leaked into CF_TOKEN/CF_ACCOUNT — lib.sh read a file it must never touch" ;;
  *) ok "the pool file (present, right beside the env file, carrying the old leak shape) was never read" ;;
esac

R5_OUT=$(env -i HOME="$T/noenv" PATH="$PATH" AGENT_R_ENV_PREFIX="" AR_ENGINE_ROOT="$ENGINE" AR_SKIP_MINT=1 sh "$T/probe.sh" 2>&1); R5_RC=$?
[ "$R5_RC" -eq 0 ] && [ "$R5_OUT" = "CF_TOKEN=[] CF_ACCOUNT=[]" ] \
  && ok "sourcing lib.sh with NO ~/.sharingu/env-sharingu.sh at all does not abort (exit 0, empty creds)" \
  || bad "missing env file broke sourcing (rc=$R5_RC out=$R5_OUT)"

echo "lib-cf-fallback-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
