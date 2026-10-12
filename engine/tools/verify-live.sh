#!/bin/sh
# verify-live.sh — prove OUR own tooling and agents reach the org's origin as themselves (the "agent-readable" check), run
# after every ship with --live (D5 Part 5, sprint 3: cut to a keep set). Every request carries an explicit User-Agent, so
# Cloudflare Bot Fight Mode never edge-blocks us (it 1010s the bare `Python-urllib` signature).
# WHAT IT PROVES NOW — authentication at the real door, through the edge:
#   · the door answers (/health; under --live its versionId is the ONE version deployed at 100%);
#   · the sign-in door: GET /login serves, a browser-shaped sign-in (Origin: null, Sec-Fetch-Site same-origin) reaches
#     the passphrase check (E247a), a cross-site sign-in is refused (E247b), and (VERIFY_LIMITER=1, live) the per-IP limiter;
#   · a minted owner seat authenticates (Bearer /whoami) and the MCP door serves it the whole registry (contracts/door.json);
#   · under --live, each Custom Domain wrangler.jsonc lists is the same worker (D4a-e per domain: one versionId, a page, the
#     cookie write guard, OAuth, OpenAI's domain-verification route); the domains are read from the config
#     (tools/route-domains.mjs), never typed;
#   · the residue audit over the target's ledger (tools/residue-audit.sh): a polluted ledger never reads green.
# Page text, brand words and per-screen regions are tools/smoke.sh's (the look cases) — nothing here pins them.
# THE ORG (the local default) starts the way the smoke starts (tools/lib.sh suite_local_up): a fresh local org, its
# fixtures (tools/suites/fixtures/) filed through preview then file. --live: tools/cf-budget.sh first, then the hosted
# ryuklabs worker (no fixture is filed there).
#   sh tools/verify-live.sh            # a local org
#   sh tools/verify-live.sh --live     # the hosted worker (budget-guarded)
# The output contract: PASS/FAIL/SKIP lines, "== N passed, N failed ==", .runs/verify-live.json, exit 1 on any failure.
. "$(dirname "$0")/lib.sh"
UA="agent-r-verify/1.0"
RL="$U"
[ -z "$RL" ] && [ "$SUITE_TARGET" = "live" ] && RL="https://ryuklabs-agent-r.sharingu-meetings-media.workers.dev"
[ -z "$RL" ] && RL="${MINT_LOCAL_URL:-}"
RLOWNERKEY="$K"
CONTRACT="$(cd "$(dirname "$0")/../.." && pwd)/contracts/door.json"
echo "  (verify-live target: $SUITE_TARGET — $RL)"
ok=0; bad=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 -> $3"; ok=$((ok+1)); else echo "  FAIL  $1 -> got $3 want $2"; bad=$((bad+1)); fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' -A "$UA" "$@"; }
codeauth(){ curl -s -o /dev/null -w '%{http_code}' -A "$UA" -H "Authorization: Bearer $1" "$2"; }
# G2 item 10 (the review's agentD: an unreadable contract and a failing /mcp both read "" here, and "" == "" passed): each side
# names its failure, so the check can only pass on two real, equal counts
mcp(){ curl -s -A "$UA" -X POST -H "Authorization: Bearer $1" -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' "$2/mcp" \
  | python3 -c "import sys,json
try:
    t=(json.load(sys.stdin).get('result') or {}).get('tools')
    print(len(t) if isinstance(t,list) and t else '<no tools/list>')
except Exception: print('<unreadable /mcp answer>')" 2>/dev/null; }

echo "== agent-readable self-verify (UA=$UA) =="
chk "RL    /health public"          200 "$(code "$RL/health")"
# batch:ship-canary-pin — WHICH version the live door runs: /health's versionId (src/index.js, off the
# CF_VERSION_METADATA binding) must be the ONE version `wrangler deployments status` reports at 100%. Either side
# unreadable is a FAIL, never a pass. Live only: a local org has no deployment to compare against.
if [ "$SUITE_TARGET" = "live" ]; then
  LIVE_VID=$(curl -s -m 20 -A "$UA" "$RL/health" | python3 -c "import sys,json
try:
    v=json.load(sys.stdin).get('versionId'); print(v if isinstance(v,str) else '')
except Exception: print('')" 2>/dev/null)
  DEP_VID=$(cd "$(dirname "$0")/.." && npx wrangler deployments status --json --config wrangler.jsonc </dev/null 2>/dev/null | python3 -c "import sys
sys.path.insert(0, 'tools')
from lib_wrangler_json import parse_wrangler_json
try:
    vs=[v for v in (parse_wrangler_json(sys.stdin.read()).get('versions') or []) if float(v['percentage'])==100]
    print(vs[0]['version_id'] if len(vs)==1 else '')
except Exception: print('')" 2>/dev/null)
  chk "RL    /health.versionId = deployments status @100%" "${DEP_VID:-<no single version at 100%>}" "${LIVE_VID:-<no versionId>}"
else
  echo "  SKIP  RL    /health.versionId = deployments status @100% (live only — a local org has no deployment)"
fi
chk "RL    /login serves sign-in"   200 "$(code "$RL/login")"
# E247 (scar 2026-09-08): under an org's own same-origin policy a browser sends `Origin: null` on its OWN sign-in form; the
# cross-site check must read Sec-Fetch-Site (the browser's verdict) and ACCEPT it. A nonexistent email keeps the probe off
# any real account's lockout counter; a passphrase mismatch (401) proves the check let the request through.
chk "E247a a browser-shaped sign-in (Origin: null · Sec-Fetch-Site same-origin) reaches the passphrase check" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST "$RL/login" -A 'Mozilla/5.0 (verify-live)' -H 'Origin: null' -H 'Sec-Fetch-Site: same-origin' -H 'Sec-Fetch-Mode: navigate' --data-urlencode 'email=csrf-probe@example.invalid' --data-urlencode 'password=not-a-passphrase')"
chk "E247b a cross-site sign-in form is refused" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST "$RL/login" -A 'Mozilla/5.0 (verify-live)' -H 'Origin: https://evil.example' -H 'Sec-Fetch-Site: cross-site' -H 'Sec-Fetch-Mode: navigate' --data-urlencode 'email=csrf-probe@example.invalid' --data-urlencode 'password=not-a-passphrase')"
# 22 rapid bad sign-ins from this address (an unknown email — costs the org one attempt row each, no real person's
# lockout): wrangler.jsonc's own LOGIN_LIMIT ratelimit binding must answer 429 within the run. Skipped unless
# VERIFY_LIMITER=1 (it spends real D1 writes and puts this address in a short block).
if [ "${VERIFY_LIMITER:-}" = "1" ]; then
  LAST=""; for i in $(seq 1 22); do LAST=$(code -X POST "$RL/login" -d "email=nobody-$i@example.invalid&password=x"); [ "$LAST" = "429" ] && break; done
  chk "RL per-IP cap (zone rule) -> 429 within 22 attempts" 429 "$LAST"
else
  echo "  SKIP  RL per-IP limiter (set VERIFY_LIMITER=1 to spend the attempts)"
fi

if [ -n "$RLOWNERKEY" ]; then
  chk "RL    /whoami owner (Bearer, minted seat)" 200 "$(codeauth "$RLOWNERKEY" "$RL/whoami")"
  NTOOLS=$(python3 -c "import json,sys;n=len(json.load(open(sys.argv[1]))['tools']);print(n if n else '<no tools in the contract>')" "$CONTRACT" 2>/dev/null) || NTOOLS=""
  [ -n "$NTOOLS" ] || NTOOLS="<the contract did not read: $CONTRACT>"
  chk "RL    /mcp tools/list (Bearer, the owner) == the registry (contracts/door.json: $NTOOLS tools)" "$NTOOLS" "$(mcp "$RLOWNERKEY" "$RL")"
else
  echo "  SKIP  authed checks (could not mint a ryuklabs owner seat)"
fi

# D4 (QD99DA798, 2026-09-29; sprint 10, 10.4) — the ONE org worker also answers at EACH Custom Domain wrangler.jsonc lists
# ("routes" entries with custom_domain: true, applied by ship.sh's triggers deploy, which DETACHES a domain absent from the
# list — the sprint-9 ship's find). The domains are READ from the config (tools/route-domains.mjs), never typed here: none,
# or a config that does not read, is a FAIL, never a silent pass. D4a-e run per domain, each line labelled with it. The
# requests are live only: a local org has no domain, and a local run never sends a request to a hosted domain.
DOMAINS=$(node "$(dirname "$0")/route-domains.mjs" --config "$(dirname "$0")/../wrangler.jsonc" 2>&1)
if [ $? -eq 0 ]; then chk "D4    the Custom Domains wrangler.jsonc lists (tools/route-domains.mjs): $(echo $DOMAINS)" read read
else chk "D4    the Custom Domains wrangler.jsonc lists (tools/route-domains.mjs)" read "$(echo $DOMAINS)"; DOMAINS=""; fi
if [ "$SUITE_TARGET" = "live" ]; then
  vid_of(){ python3 -c "import sys,json
try:
    v=json.load(sys.stdin).get('versionId'); print(v if isinstance(v,str) else '')
except Exception: print('')" 2>/dev/null; }
  WD_VID=$(curl -s -m 20 -A "$UA" "https://ryuklabs-agent-r.sharingu-meetings-media.workers.dev/health" | vid_of)
  for DOM in $DOMAINS; do
    O="https://$DOM"
    echo "== the Custom Domain (QD99DA798) — $O =="
    # D4a — the domain's /health answers 200 with the SAME versionId as the workers.dev host: one worker, every host.
    # Either side unreadable is a FAIL, never a pass.
    DOM_H_CODE=$(code -m 20 "$O/health")
    DOM_VID=$(curl -s -m 20 -A "$UA" "$O/health" | vid_of)
    chk "D4a   $DOM /health 200 + versionId == workers.dev /health versionId" "200/${WD_VID:-<no workers.dev versionId>}" "$DOM_H_CODE/${DOM_VID:-<no domain versionId>}"
    # D4b — a signed-in page answers on the custom host (the owner's Bearer: a key in the URL is read-only and never needed)
    if [ -n "$RLOWNERKEY" ]; then
      chk "D4b   $DOM /home (Bearer, the owner) -> 200" 200 "$(curl -s -o /dev/null -m 20 -A "$UA" -w '%{http_code}' -H "Authorization: Bearer $RLOWNERKEY" -H 'accept: text/html' "$O/home")"
    else
      echo "  SKIP  D4b   $DOM /home (no ryuklabs owner seat minted)"
    fi
    # D4c — a cookie session on the domain (its own sign-in, its own jar: the __Host- cookie is the host's alone): a
    # cross-origin write is refused (403 cross_origin_session_write) and a same-origin one passes the guard (POST /open-items
    # {} -> 422 title_required: past the guard, nothing written). The guard reads the request's own origin (core.js
    # csrfRefused), never a typed host — each domain's Origin is its own.
    DOM_EMAIL="${RYUKLABS_EVALSEAT_EMAIL:-}"
    if [ -n "$DOM_EMAIL" ] && [ -n "$EVALKEY" ]; then
      DOM_JAR=$(mktemp); DOM_PF=$(mktemp); chmod 600 "$DOM_PF"; printf '%s' "$EVALKEY" > "$DOM_PF"
      curl -s -o /dev/null -m 20 -A "$UA" -c "$DOM_JAR" -X POST -H "Origin: $O" -H 'Sec-Fetch-Site: same-origin' \
        --data-urlencode "email=$DOM_EMAIL" --data-urlencode "password@$DOM_PF" -d "web=1" "$O/login"
      rm -f "$DOM_PF"
      # the seat's org's address (sprint 7, 7.4: a session cookie signs in only under /<org>/…, never at the root): its path name,
      # read off the seat key's own page at the root (<html data-org-base="/<org>">), never from where the sign-in lands (7.4b)
      DOM_BASE=$(curl -s -m 20 -A "$UA" -H "Authorization: Bearer $EVALKEY" -H 'accept: text/html' "$O/home" | sed -n 's/.*<html[^>]* data-org-base="\(\/[a-z0-9-]*\)".*/\1/p' | head -1)
      chk "D4c   $DOM the eval seat's org address (data-org-base on its own page)" yes "$([ -n "$DOM_BASE" ] && echo yes || echo no)"
      DOM_X=$(curl -s -m 20 -A "$UA" -w '\n%{http_code}' -b "$DOM_JAR" -X POST -H 'content-type: application/json' -H 'Sec-Fetch-Site: cross-site' \
        -H 'Origin: https://evil.example' -d '{}' "$O$DOM_BASE/open-items")
      chk "D4c   $DOM cookie write from a cross-site origin -> 403 cross_origin_session_write" "403/1" \
        "$(printf '%s' "$DOM_X" | tail -n 1)/$(printf '%s' "$DOM_X" | grep -q 'cross_origin_session_write' && echo 1 || echo 0)"
      DOM_S=$(curl -s -m 20 -A "$UA" -w '\n%{http_code}' -b "$DOM_JAR" -X POST -H 'content-type: application/json' -H 'Sec-Fetch-Site: same-origin' \
        -H "Origin: $O" -d '{}' "$O$DOM_BASE/open-items")
      chk "D4c   $DOM the same cookie write from its own origin passes the guard -> 422 title_required" "422/1" \
        "$(printf '%s' "$DOM_S" | tail -n 1)/$(printf '%s' "$DOM_S" | grep -q 'title_required' && echo 1 || echo 0)"
      curl -s -o /dev/null -m 20 -A "$UA" -b "$DOM_JAR" -X POST -H "Origin: $O" -H 'Sec-Fetch-Site: same-origin' "$O$DOM_BASE/signout"
      rm -f "$DOM_JAR"
    else
      echo "  SKIP  D4c   $DOM cookie session write (no eval seat email/key minted)"
    fi
    # D4d — the OAuth protected-resource metadata on the domain names the domain's own /mcp (the library derives it from
    # the request's origin; src/oauth.js declares no fixed resource), so an MCP client pointed at the domain completes OAuth.
    DOM_RES=$(curl -s -m 20 -A "$UA" "$O/.well-known/oauth-protected-resource/mcp" | python3 -c "import sys,json
try:
    v=json.load(sys.stdin).get('resource'); print(v if isinstance(v,str) else '')
except Exception: print('')" 2>/dev/null)
    chk "D4d   $DOM /.well-known/oauth-protected-resource/mcp .resource" "$O/mcp" "${DOM_RES:-<unreadable>}"
    # D4e (sprint 11, 11.3) — OpenAI's domain verification on the domain: GET /.well-known/openai-apps-challenge (no redirect
    # followed) answers ONLY the ordinary 404 JSON not_found (no token stored) or 200 text/plain holding one token (the operator's
    # set-openai-challenge; src/wellknown.js) — never a sign-in page, a redirect, HTML or a 5xx. The token is never printed.
    DOM_CHB=$(mktemp)
    DOM_CH=$(curl -s -m 20 -A "$UA" -o "$DOM_CHB" -w '%{http_code} %{content_type}' "$O/.well-known/openai-apps-challenge")
    DOM_CHV=$(python3 -c 'import sys,json,re
code,ctype,b=sys.argv[1],sys.argv[2],open(sys.argv[3],"rb").read()
if code=="404" and ctype.startswith("application/json"):
    try: ok=json.loads(b).get("error")=="not_found"
    except Exception: ok=False
    print("none stored: 404 not_found" if ok else "404 without not_found")
elif code=="200" and ctype.startswith("text/plain"):
    print("a token stored: 200 text/plain" if re.fullmatch(rb"[A-Za-z0-9._~-]{1,512}",b) else "200 text/plain that is no token")
else: print("%s %s" % (code, ctype or "<no type>"))' "${DOM_CH%% *}" "${DOM_CH#* }" "$DOM_CHB" 2>/dev/null)
    rm -f "$DOM_CHB"
    case "$DOM_CHV" in "none stored: 404 not_found"|"a token stored: 200 text/plain") DOM_CHOK=yes ;; *) DOM_CHOK=no ;; esac
    chk "D4e   $DOM /.well-known/openai-apps-challenge -> 404 not_found or 200 text/plain, nothing else (seen: ${DOM_CHV:-<unreadable>})" yes "$DOM_CHOK"
  done
else
  for DOM in $DOMAINS; do echo "  SKIP  D4a-e the Custom Domain https://$DOM (live only — a local org has no domain)"; done
fi
# G2 item 10 — the five checks the suites' cut (7fafeb61b) left proven only locally, run again on the DEPLOYED worker (old
# verify-live 310, 369, 376, 429, 453; engine/.runs/review/agentD/LOST.md 1K). Live only: locally the smoke proves each
# (tools/smoke/s26-review.mjs, s27-lost.mjs, s17-true-door.mjs); here they prove the deployed code is that code. The tester
# seat (TESTKEY: a member seated nowhere) is the caller; the owner seat (K) only finds a real row to aim at.
if [ "$SUITE_TARGET" = "live" ] && [ -n "$RLOWNERKEY" ] && [ "${TESTKEY:-invalid}" != "invalid" ]; then
  echo "== the cut's live legs (G2 item 10) =="
  LP=$(curl -s -m 20 -A "$UA" -H "Authorization: Bearer $RLOWNERKEY" "$RL/whoami" | python3 -c "import sys,json
try: p=json.load(sys.stdin).get('writeProjects') or []; print(p[0] if p else '')
except Exception: print('')" 2>/dev/null)
  LID=$(curl -s -m 20 -A "$UA" -H "Authorization: Bearer $RLOWNERKEY" -H 'accept: application/json' "$RL/read?project=$LP&kind=contribution&limit=1" | python3 -c "import sys,json
try: i=json.load(sys.stdin).get('items') or []; print(i[0]['id'] if i else '')
except Exception: print('')" 2>/dev/null)
  # the seats live in the suites' own org (sprint 6, 6.6): a fresh one holds no contribution, so the legs file their own,
  # eval-marked, through the door (preview -> file) rather than borrowing any org's real row
  if [ -n "$LP" ] && [ -z "$LID" ]; then
    LID=$(RL="$RL" LP="$LP" UA="$UA" KEY="$RLOWNERKEY" python3 -c "
import json,os,urllib.request
def mcp(name,args):
    req=urllib.request.Request(os.environ['RL']+'/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}}).encode(),
        headers={'authorization':'Bearer '+os.environ['KEY'],'content-type':'application/json','accept':'application/json','user-agent':os.environ['UA']})
    return json.loads(json.loads(urllib.request.urlopen(req,timeout=30).read())['result']['content'][0]['text'])
items=[{'contribution':{'lane':'leader','kind':'note','what':'verify-live: the live legs aim at this note','why':'the suites org holds no contribution of its own yet'}}]
try:
    pv=mcp('preview',{'project':os.environ['LP'],'items':items,'eval':True})
    f=mcp('file',{'project':os.environ['LP'],'previewId':pv['previewId'],'items':items,'eval':True})
    it=(f.get('items') or [{}])[0].get('filed') or {}
    print(it.get('id') or ((f.get('results') or [{}])[0].get('id')) or '')
except Exception: print('')" 2>/dev/null)
  fi
  if [ -n "$LP" ] && [ -n "$LID" ]; then
    chk "L310  a real contribution: the owner 200; a reader seated nowhere 404 not_found, as a made-up id" "200/404/404" \
      "$(codeauth "$RLOWNERKEY" "$RL/contribution/$LID")/$(codeauth "$TESTKEY" "$RL/contribution/$LID")/$(codeauth "$TESTKEY" "$RL/contribution/T-19990101-001")"
    chk "L369  a reader seated nowhere naming a project -> 403 project_forbidden" "403/project_forbidden" \
      "$(curl -s -m 20 -A "$UA" -w '/%{http_code}' -H "Authorization: Bearer $TESTKEY" -H 'accept: application/json' "$RL/home/summary?project=$LP" | python3 -c "import sys,json
t=sys.stdin.read(); b,c=t.rsplit('/',1)
try: e=json.loads(b).get('error','')
except Exception: e='<not json>'
print(c+'/'+e)" 2>/dev/null)"
    chk "L376  a project that is not a string -> project_forbidden, never a 500" "200/project_forbidden" \
      "$(curl -s -m 20 -A "$UA" -w '/%{http_code}' -X POST -H "Authorization: Bearer $TESTKEY" -H 'content-type: application/json' -H 'accept: application/json' \
         -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read","arguments":{"project":123,"kind":"goal"}}}' "$RL/mcp" | python3 -c "import sys,json
t=sys.stdin.read(); b,c=t.rsplit('/',1)
try: e=json.loads(json.loads(b)['result']['content'][0]['text']).get('error','')
except Exception: e='<unreadable>'
print(c+'/'+e)" 2>/dev/null)"
    chk "L429  a member's POST /control set-role -> 403" 403 \
      "$(curl -s -o /dev/null -m 20 -A "$UA" -w '%{http_code}' -X POST -H "Authorization: Bearer $TESTKEY" --data-urlencode 'action=set-role' --data-urlencode "personId=$MINT_MEMBER_ID" --data-urlencode 'role=admin' "$RL/control")"
    chk "L453  a member's GET /control draws every admin control disabled" "1" \
      "$(curl -s -m 20 -A "$UA" -H "Authorization: Bearer $TESTKEY" -H 'accept: text/html' "$RL/control" | python3 -c "import sys,re
t=sys.stdin.read(); b=re.findall(r'<button[^>]*data-door=\"POST /control\"[^>]*>', t)
print('1' if b and all(re.search(r'\sdisabled[\s>]', x) for x in b) else '0 (%d controls, %d enabled)' % (len(b), sum(1 for x in b if not re.search(r'\sdisabled[\s>]', x))))" 2>/dev/null)"
  else
    chk "L310-L453 the live legs found a project and a contribution to aim at" "found" "${LP:-<no project>}/${LID:-<no contribution>}"
  fi
else
  echo "  SKIP  L310 L369 L376 L429 L453 the cut's live legs (live only: the smoke proves each locally)"
fi
# M-ADR-036 — the residue audit belongs to every close: a polluted ledger never reads green here.
echo "== residue audit (M-ADR-036) — ryuklabs ($SUITE_TARGET ledger) =="
if sh "$(dirname "$0")/residue-audit.sh"; then ok=$((ok+1)); else bad=$((bad+1)); fi
echo "== $ok passed, $bad failed =="
# durable record of this run (tools/ready.mjs's freshness check, R1 — a record from an older
# commit than the engine's current HEAD is stale, never counted as green). Invoked with cwd=engine
# (this file's own doc header), so a plain `git rev-parse HEAD` resolves correctly with no dirname walk.
_commit="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
mkdir -p .runs 2>/dev/null
# U-READY-e: the record names its target (local | live) so a reader never takes a local run for a live proof.
printf '{"suite":"verify-live","target":"%s","passed":%s,"failed":%s,"commit":"%s","at":"%s"}\n' \
  "$SUITE_TARGET" "$ok" "$bad" "$_commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .runs/verify-live.json 2>/dev/null
[ "$bad" -eq 0 ] || exit 1
