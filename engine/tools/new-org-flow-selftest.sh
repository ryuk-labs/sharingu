#!/bin/sh
# tools/new-org-flow-selftest.sh — tools/new-org.sh walked END TO END, OFFLINE: a stub `npx` (wrangler), a stub `curl`
# (the Cloudflare API and the new worker) and a stub `node` (tools/operator.mjs) on PATH, fake credentials. It proves the
# wiring a second platform's first deploy runs (engine/ORG-SETUP.md; hosted-only: no stranger self-hosts) without an account: the caps are read, D1/R2/KV are created
# in order and R2 is read back, the config is written from the template, the ONE D1 write is boot.sql on that config (an
# empty platform: no org, no person, no key minted), every hidden-output wrangler call closes stdin, the deploy names that
# config, the wait reads /health's d1 and GET /signup (never page prose), the installer's email is allowed by the operator's
# tool on that config's own database, after the deploy, and the closing lines name /signup, /orgs/new, the day0-verify and
# connect lines. Then: an R2 read-back that fails stops with the R2 hint and names the teardown; a bad email refuses before
# any call; a refused allow after a good deploy rolls nothing back and prints the operator line again. No network, no
# Cloudflare.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SCR="$(mktemp -d "${TMPDIR:-/tmp}/new-org-flow.XXXXXX")"
SLUG="s1-flowtest"
trap 'rm -rf "$SCR"; rm -f "$ROOT/wrangler.$SLUG.jsonc"' EXIT
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; fail=$((fail + 1)); }
mkdir -p "$SCR/bin"
CALLS="$SCR/calls.log"; export CALLS
cat > "$SCR/bin/npx" <<'STUB'
#!/bin/sh
# stub: log every wrangler call, answer like wrangler
[ "$1" = "--yes" ] && shift; [ "$1" = "wrangler" ] && shift
echo "wrangler $* " >> "$CALLS"
case "$1 $2" in
  "d1 info") echo '{"uuid":"11111111-2222-3333-4444-555555555555"}' ;;
  "r2 bucket") [ "$3" = "info" ] && [ -n "${FLOW_NO_R2:-}" ] && exit 1 ;;
esac
exit 0
STUB
cat > "$SCR/bin/curl" <<'STUB'
#!/bin/sh
# stub: the Cloudflare API and the new worker. Honours -o <file> and -w '%{http_code}' as curl does.
out=""; w=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift 2 ;; -w) w="$2"; shift 2 ;; -H|-d|-X|--data|-A) shift 2 ;; -s|-S|-sS) shift ;; http*) url="$1"; shift ;; *) shift ;; esac
done
echo "curl $url" >> "$CALLS"
case "$url" in
  */d1/database*) body='{"success":true,"result":[]}' ;;
  */workers/scripts) body='{"success":true,"result":[]}' ;;
  */storage/kv/namespaces) body='{"success":true,"result":{"id":"kv-0001"}}' ;;
  */workers/subdomain) body='{"success":true,"result":{"subdomain":"acme"}}' ;;
  */health) body='{"ok":true,"d1":"ok"}' ;;
  */signup) body='<html>sign up</html>' ;;
  *) body='{}' ;;
esac
if [ -n "$out" ]; then printf '%s' "$body" > "$out"; else printf '%s' "$body"; fi
[ -n "$w" ] && printf '200'
exit 0
STUB
cat > "$SCR/bin/node" <<'STUB'
#!/bin/sh
# stub: the operator's tool. Prints a code as it does (a fixed fake), or refuses when the test says so.
echo "node $* " >> "$CALLS"
[ -n "${FLOW_NO_ALLOW:-}" ] && { echo "refused (nothing written): a test refusal" >&2; exit 1; }
echo "✓ allowed (stub)"; echo "  code: FAKE0-FAKE0-FAKE0-FAKE0"
exit 0
STUB
chmod +x "$SCR/bin/npx" "$SCR/bin/curl" "$SCR/bin/node"

echo "== new-org-flow-selftest =="
OUT="$SCR/run1.out"
PATH="$SCR/bin:$PATH" CLOUDFLARE_API_TOKEN=fake-token CLOUDFLARE_ACCOUNT_ID=fake-account NEW_ORG_ROLLBACK_ON_FAIL=0 \
  sh tools/new-org.sh "$SLUG" --email Flow@Example.com > "$OUT" 2>&1 </dev/null
RC=$?
[ "$RC" -eq 0 ] && ok "a full run exits 0" || { bad "a full run exited $RC"; sed 's/^/      /' "$OUT" | tail -20; }
grep -q "wrangler d1 create $SLUG-agent-r " "$CALLS" && ok "D1 created by its name" || bad "d1 create not called as expected"
grep -q "wrangler r2 bucket create $SLUG-brain " "$CALLS" && grep -q "wrangler r2 bucket info $SLUG-brain" "$CALLS" && ok "R2 created and read back" || bad "r2 create/read-back missing"
# stdin: this test runs without a terminal, so the stub cannot tell; the source must close it on every wrangler call whose
# output is hidden (a prompt there is one a stranger cannot see) — the deploy alone keeps the terminal
OPEN=$(grep -n 'npx --yes wrangler' tools/new-org.sh | grep -v 'wrangler deploy' | grep -v '</dev/null')
[ -z "$OPEN" ] && ok "every hidden-output wrangler call in new-org.sh closes stdin" || bad "a wrangler call leaves stdin open: $OPEN"
grep -q "curl https://api.cloudflare.com/client/v4/accounts/fake-account/storage/kv/namespaces" "$CALLS" && ok "KV created through the raw API on the installer's own account" || bad "kv create missing"
[ -f "$ROOT/wrangler.$SLUG.jsonc" ] && grep -q '"database_id": "11111111-2222-3333-4444-555555555555"' "$ROOT/wrangler.$SLUG.jsonc" && grep -q '"id": "kv-0001"' "$ROOT/wrangler.$SLUG.jsonc" && ! grep -q '<ORG>\|<D1_ID>\|<KV_ID>' "$ROOT/wrangler.$SLUG.jsonc" \
  && ok "the config is the template with its holes filled" || bad "the config is not filled"
N_EXEC=$(grep -c "wrangler d1 execute $SLUG-agent-r -c wrangler.$SLUG.jsonc --remote --file boot.sql" "$CALLS")
N_ALL=$(grep -c "wrangler d1 execute\|wrangler r2 object put" "$CALLS")
[ "$N_EXEC" -eq 1 ] && [ "$N_ALL" -eq 1 ] \
  && ok "the ONE D1 write is boot.sql on the deployment's own config (an empty platform: no person, no org row, nothing put in R2)" \
  || bad "the D1/R2 writes are not boot.sql alone (boot.sql execs $N_EXEC, all writes $N_ALL)"
grep -q "wrangler deploy -c wrangler.$SLUG.jsonc" "$CALLS" && ok "the deploy names the deployment's own config" || bad "deploy not on the deployment's config"
grep -q "curl https://$SLUG-agent-r.acme.workers.dev/health" "$CALLS" && grep -q "curl https://$SLUG-agent-r.acme.workers.dev/signup" "$CALLS" && ! grep -q "workers.dev/missing\|workers.dev/whoami" "$CALLS" \
  && ok "the wait reads /health and GET /signup on the new worker, never a page's prose" || bad "the wait probes the wrong routes"
grep -q "(d1 ok) and the sign-up page answer" "$OUT" && ok "the wait says the worker and its D1 answered" || bad "the wait did not report warm"
grep -q "node tools/operator.mjs allow --live --config wrangler.$SLUG.jsonc --confirm-live $SLUG-agent-r --email flow@example.com " "$CALLS" \
  && ok "the installer's email (lower-cased) is allowed by the operator's tool on the deployment's own database" || bad "the allow is not the operator's, on this config: $(grep '^node' "$CALLS")"
DEP=$(grep -n 'wrangler deploy' "$CALLS" | head -1 | cut -d: -f1); ALW=$(grep -n '^node ' "$CALLS" | head -1 | cut -d: -f1)
[ -n "$DEP" ] && [ -n "$ALW" ] && [ "$DEP" -lt "$ALW" ] && ok "the allow runs after the deploy" || bad "the allow did not run after the deploy (deploy line ${DEP:-none}, allow line ${ALW:-none})"
grep -q "https://$SLUG-agent-r.acme.workers.dev/signup — flow@example.com" "$OUT" && grep -q "https://$SLUG-agent-r.acme.workers.dev/orgs/new" "$OUT" \
  && ok "the way in names /signup and /orgs/new on the new platform" || bad "no /signup and /orgs/new lines"
grep -q "DAY0_URL=https://$SLUG-agent-r.acme.workers.dev DAY0_KEY=<the owner key> DAY0_EMAIL=flow@example.com" "$OUT" \
  && ok "the acceptance line names the URL and the installer's email" || bad "the acceptance line is wrong"
! grep -q "_AGENT_R_OWNER_KEY" "$OUT" && ok "no key is minted (the owner key is /orgs/new's, shown once there)" || bad "a key was minted or named"
grep -q "claude mcp add $SLUG --transport http https://$SLUG-agent-r.acme.workers.dev/mcp" "$OUT" && ok "the connect line names the platform's /mcp" || bad "no connect line"

# the R2 read-back fails: stop with the hint, and (NEW_ORG_ROLLBACK_ON_FAIL=0) name the teardown line instead of running it
rm -f "$ROOT/wrangler.$SLUG.jsonc"; : > "$CALLS"
OUT2="$SCR/run2.out"
PATH="$SCR/bin:$PATH" FLOW_NO_R2=1 CLOUDFLARE_API_TOKEN=fake-token CLOUDFLARE_ACCOUNT_ID=fake-account NEW_ORG_ROLLBACK_ON_FAIL=0 \
  sh tools/new-org.sh "$SLUG" --email flow@example.com > "$OUT2" 2>&1 </dev/null
RC2=$?
[ "$RC2" -ne 0 ] && grep -q "is R2 enabled on this Cloudflare account" "$OUT2" && ! grep -q "wrangler deploy" "$CALLS" \
  && ok "no R2 bucket after the create: stops with the R2 hint before any deploy (exit $RC2)" || { bad "the R2 refusal is not caught (exit $RC2)"; tail -5 "$OUT2"; }
grep -q "teardown-org.sh $SLUG" "$OUT2" && ok "and names the teardown line" || bad "no teardown line after a failure"

# a bad email: refused by name before any Cloudflare call
rm -f "$ROOT/wrangler.$SLUG.jsonc"; : > "$CALLS"
OUT3="$SCR/run3.out"
PATH="$SCR/bin:$PATH" CLOUDFLARE_API_TOKEN=fake-token CLOUDFLARE_ACCOUNT_ID=fake-account NEW_ORG_ROLLBACK_ON_FAIL=0 \
  sh tools/new-org.sh "$SLUG" --email not-an-email > "$OUT3" 2>&1 </dev/null
RC3=$?
[ "$RC3" -eq 2 ] && [ ! -s "$CALLS" ] && grep -q -- "--email <you> is required" "$OUT3" \
  && ok "a bad email refuses (exit 2) before any call" || bad "a bad email was not refused first (exit $RC3, $(wc -l < "$CALLS" | tr -d ' ') calls)"

# the allow refused after a good deploy: nothing rolled back, the operator line printed to run again, exit 1
rm -f "$ROOT/wrangler.$SLUG.jsonc"; : > "$CALLS"
OUT4="$SCR/run4.out"
PATH="$SCR/bin:$PATH" FLOW_NO_ALLOW=1 CLOUDFLARE_API_TOKEN=fake-token CLOUDFLARE_ACCOUNT_ID=fake-account NEW_ORG_TEARDOWN_CMD="echo TEARDOWN-RAN" \
  sh tools/new-org.sh "$SLUG" --email flow@example.com > "$OUT4" 2>&1 </dev/null
RC4=$?
[ "$RC4" -eq 1 ] && ! grep -q "TEARDOWN-RAN\|RECOVER:" "$OUT4" && grep -q "Run it again:" "$OUT4" \
  && grep -q "node tools/operator.mjs allow --live --config wrangler.$SLUG.jsonc --confirm-live $SLUG-agent-r --email flow@example.com" "$OUT4" \
  && ok "a refused allow after the deploy rolls nothing back and prints the operator line again (exit 1)" || { bad "the refused allow (exit $RC4)"; tail -8 "$OUT4"; }

echo ""; echo "new-org-flow-selftest: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
