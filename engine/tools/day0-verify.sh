#!/bin/sh
# tools/day0-verify.sh — the fresh-org acceptance walk: run it against any sharingu (your own on your Cloudflare account from
# tools/new-org.sh, a local one from tools/r-local.sh, or the hosted platform) on the org you just created, before anyone is
# invited. Everything it asserts is read through the platform's own routes and its MCP door; nothing here is specific to one
# org.
#
#   DAY0_URL=<the platform's URL> DAY0_KEY=<the owner key /orgs/new showed> DAY0_EMAIL=<your email> [DAY0_PASS=<your account
#     passphrase>] sh tools/day0-verify.sh
#       the org you made in the browser (/signup, then /orgs/new). DAY0_PASS adds the account's checks (A1, A2).
#   DAY0_URL=… DAY0_EMAIL=… DAY0_CODE=<the operator's one-time code> DAY0_PASS=<a new passphrase, 12+ characters>
#     DAY0_ORG=<the org's address> [DAY0_ORG_NAME=<its name>] [DAY0_KEY_OUT=<path>] sh tools/day0-verify.sh
#       THE FIRST RUN, end to end (sprint 7, 7.6): F1-F5 sign up with the code and create the org through the door (POST
#       /signup, POST /orgs), the owner key taken from the answer and held in memory (never printed; DAY0_KEY_OUT writes it
#       to that file, mode 600), then the same walk. The code is single-use: this IS your sign-up.
#
# It needs the org to hold at least one project: /orgs/new makes the first one (or the owner makes one with the MCP's
# create_project). With none, it says so as a FAIL and runs the checks that need no project.
#
# What it asserts: the door is up · the owner authenticates (bearer, and the web sign-in: the seat's key is its own
# passphrase) · a cookie session mints and, under the org's address (/<org>/…, sprint 7, 7.4), stamps a project · the door
# stamps a filing with the project it names and refuses an unknown one loudly · Control renders its projects region and the
# org's row is read · What is missing renders and the `missing` answer is honest, every open item carrying the call that
# fills it (a `preview`, or `rule_question` for the owner's rulings) · the Map renders · the door lists the first-run tools
# (whoami, missing, create_project, preview, file) · with DAY0_PASS: the account passphrase signs in at the root and whoami
# names the org among the account's orgs.
#
# SHAPE-AWARE (tools/lib-day0-shape.sh): D3, D6 and D11 assert a multi-SEAT owner's invariants (>=2 seats · lands on the
# picker · an unclaimed filing 422s). They run only when the owner's own whoami shows >=2 project SEATS; otherwise each
# prints a named SKIP and the closing line shows N/N of the checks that ran plus the skip count. (An owner who made the org
# at /orgs/new holds no project seat and reads every project as the owner.)
set -u
ENGROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ENGROOT"
. "$ENGROOT/tools/lib-day0-shape.sh"
U="${DAY0_URL:?set DAY0_URL}"; EMAIL="${DAY0_EMAIL:?set DAY0_EMAIL}"
CODE="${DAY0_CODE:-}"; PASS="${DAY0_PASS:-}"
if [ -n "$CODE" ]; then
  [ -n "$PASS" ] && [ -n "${DAY0_ORG:-}" ] || { echo "DAY0_CODE (the first run) needs DAY0_PASS (a new account passphrase) and DAY0_ORG (the org's address)" >&2; exit 2; }
  K=""
else
  K="${DAY0_KEY:?set DAY0_KEY (the owner key /orgs/new showed), or DAY0_CODE for the first run}"
fi
pass=0; fail=0; skip=0
chk() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (want $2, got $3)"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -q "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (missing: $2)"; fail=$((fail+1)); fi; }
okv() { case "$2" in ok*) echo "  PASS  $1 ($2)"; pass=$((pass+1)) ;; *) echo "  FAIL  $1: $2"; fail=$((fail+1)) ;; esac; }
sk()  { echo "  SKIP  $1"; skip=$((skip+1)); }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
mcp() { curl -s -X POST "$U/mcp" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer $K" -d "$1"; }

echo "sharingu · day-0 org verification — $U"
# jfield <json> <python expression on d> — one field of a JSON answer, '' when it does not parse (never a secret printed)
jfield() { printf '%s' "$1" | python3 -c "import json,sys
try: d=json.load(sys.stdin); print($2)
except Exception: print('')" 2>/dev/null; }
if [ -n "$CODE" ]; then
  # THE FIRST RUN (sprint 7, 7.6): the platform's one way an org is born — the operator's code, a sign-up, POST /orgs
  chk "F1 the platform's pages answer at the root (/signup, /orgs/new)" "200 200" "$(code -H 'accept: text/html' "$U/signup") $(code -H 'accept: text/html' "$U/orgs/new")"
  F2BODY=$(EMAIL="$EMAIL" CODE="$CODE" PASS="$PASS" python3 -c "import json,os;print(json.dumps({'email':os.environ['EMAIL'],'code':os.environ['CODE'],'password':os.environ['PASS'],'device':'day0'}))")
  F2=$(curl -s -X POST -H 'content-type: application/json' -d "$F2BODY" "$U/signup")
  chk "F2 sign-up with the operator's code makes the account (created, or set on an account that had none)" ok "$(jfield "$F2" "'ok' if d.get('account') in ('created', 'set') else (d.get('error') or '?')")"
  chk "F3 the code is single-use (a second sign-up: 401)" 401 "$(code -X POST -H 'content-type: application/json' -d "$F2BODY" "$U/signup")"
  F4BODY=$(EMAIL="$EMAIL" PASS="$PASS" ORG="$DAY0_ORG" NAME="${DAY0_ORG_NAME:-$DAY0_ORG}" python3 -c "import json,os;print(json.dumps({'email':os.environ['EMAIL'],'password':os.environ['PASS'],'name':os.environ['NAME'],'slug':os.environ['ORG']}))")
  F4=$(curl -s -X POST -H 'content-type: application/json' -d "$F4BODY" "$U/orgs")
  K=$(jfield "$F4" "d.get('key') or ''")
  if [ -n "$K" ] && [ "$(jfield "$F4" "(d.get('org') or {}).get('slug') or ''")" = "$DAY0_ORG" ]; then
    echo "  PASS  F4 POST /orgs creates the org at /$DAY0_ORG, its owner seat and its first project ($(jfield "$F4" "(d.get('project') or {}).get('key') or '?'")); the owner key shown once (held, not printed)"; pass=$((pass+1))
    if [ -n "${DAY0_KEY_OUT:-}" ]; then (umask 077; printf '%s\n' "$K" > "$DAY0_KEY_OUT"); chmod 600 "$DAY0_KEY_OUT"; echo "        the owner key -> $DAY0_KEY_OUT (mode 600)"; fi
  else
    echo "  FAIL  F4 POST /orgs ($(jfield "$F4" "str(d.get('error') or '')+' '+str(d.get('field') or '')"))"; fail=$((fail+1))
  fi
  chk "F5 one org per account (a second: 409)" 409 "$(code -X POST -H 'content-type: application/json' -d "$(printf '%s' "$F4BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);d['slug']=d['slug'][:30]+'-two';print(json.dumps(d))")" "$U/orgs")"
  [ -n "$K" ] || { echo ""; echo "  day-0: $pass passed, $fail failed — no org to walk (F4)"; exit 1; }
fi
chk "D1 /health up"            200 "$(code "$U/health")"
W=$(curl -s -H "Authorization: Bearer $K" "$U/whoami")
# whoami: role, the SEATS (projects) and every project the owner's writes may land in (writeProjects: an owner reads and
# files on every active project, seated or not)
WHO=$(printf '%s' "$W" | python3 -c "import json,sys
try:
  d=json.load(sys.stdin); seats=d.get('projects') or []; wp=d.get('writeProjects') or []
  print(d.get('role') or '-', len(seats), (seats or wp or ['-'])[0])
except Exception: print('- 0 -')" 2>/dev/null || echo "- 0 -")
set -- $WHO; ROLE="$1"; NPROJ="$2"; P1="$3"; [ "$P1" = "-" ] && P1=""
chk "D2 owner whoami (role)"    owner "$ROLE"
SHAPE=$(day0_shape "$NPROJ")
if [ "$SHAPE" = "multi" ]; then
  if [ "$NPROJ" -ge 2 ]; then echo "  PASS  D3 owner holds $NPROJ project seats (>=2)"; pass=$((pass+1)); else echo "  FAIL  D3 owner seats (want >=2, got $NPROJ)"; fail=$((fail+1)); fi
else
  sk "D3 owner seats >=2 (single-seat org, got $NPROJ)"
fi
if [ -n "$P1" ]; then echo "  PASS  D3a the org holds a project ($P1)"; pass=$((pass+1))
else echo "  FAIL  D3a the org holds no project yet: create one through the MCP (create_project, key and name), then run this again"; fail=$((fail+1)); fi
# body hoisted to a var: \" inside "$(...)" is mis-parsed by macOS's bash 3.2 sh (measured 2026-09-01)
D4BODY="{\"email\":\"$EMAIL\",\"password\":\"$K\",\"device\":\"day0\"}"
chk "D4 web login (key IS passphrase)" 200 "$(code -X POST -H 'content-type: application/json' -d "$D4BODY" "$U/login")"
JAR=$(mktemp)
chk "D5 cookie session mints"  302 "$(code -c "$JAR" -X POST -d "email=$EMAIL&password=$K&web=1" "$U/login")"
# the org's address (sprint 7, 7.4: its pages at /<org>/…; a session cookie signs in only there): its path name, read off the
# owner key's own page at the root (<html data-org-base="/<org>">), never from where the sign-in lands (7.4b: an account in
# several orgs lands on the org picker). Every cookie request below goes under it.
SLUG=$(curl -s -H "Authorization: Bearer $K" -H 'accept: text/html' "$U/home" | sed -n 's/.*<html[^>]* data-org-base="\/\([a-z0-9-]*\)".*/\1/p' | head -1)
chk "D5a the org's address (its path name on its own page)" yes "$([ -n "$SLUG" ] && echo yes || echo no)"
A="$U/$SLUG"
LANDING=$(curl -s -b "$JAR" "$A/")
if [ "$SHAPE" = "multi" ]; then
  has "D6 multi-project owner lands on the picker" 'picker-page' "$LANDING"
else
  sk "D6 owner lands on the picker (single-seat org)"
fi
if [ -n "$P1" ]; then
  chk "D7 the picker stamps the session" 302 "$(code -b "$JAR" -X POST -d "key=$P1" "$A/project")"
  HOME_HTML=$(curl -s -b "$JAR" "$A/home")
  has "D8 project switcher on Home (the top bar's region)"  'data-region="project-switcher"' "$HOME_HTML"
  # the one door (D5): POST /preview, then POST /file with its previewId and the same items — into an EVAL project this
  # script makes (an eval mark is accepted only there or from a test seat, G2): the org's own first project stays clean
  PE=$(curl -s -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"create_project","arguments":{"key":"day0-eval","name":"day0 verify (test)","eval":true}}}' "$U/mcp" | python3 -c "import json,sys
try: print(json.loads(json.load(sys.stdin)['result']['content'][0]['text'])['project']['key'])
except Exception: print('')" 2>/dev/null)
  [ -n "$PE" ] || PE="$P1"
  D9I="[{\"contribution\":{\"eval\":true,\"lane\":\"code\",\"kind\":\"pr\",\"what\":\"day0 door stamp\",\"why\":\"day0 verify\",\"touches\":[\"day0\"],\"components\":[\"mind/evals\"],\"proof\":\"sh tools/day0-verify.sh -> exit 0\"}}]"
  PV=$(curl -s -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d "{\"eval\":true,\"project\":\"$PE\",\"items\":$D9I}" "$U/preview")
  PID=$(printf '%s' "$PV" | python3 -c "import json,sys;print(json.load(sys.stdin).get('previewId') or '')" 2>/dev/null)
  T1=$(curl -s -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d "{\"previewId\":\"$PID\",\"items\":$D9I}" "$U/file")
  TID=$(printf '%s' "$T1" | python3 -c "import json,sys;print(((json.load(sys.stdin).get('results') or [{}])[0]).get('id') or '')" 2>/dev/null)
  if [ -n "$TID" ]; then echo "  PASS  D9 the door files with an explicit project ($TID, eval-marked, into the eval project $PE)"; pass=$((pass+1)); else echo "  FAIL  D9 door filing ($(printf '%s' "$T1" | head -c 120))"; fail=$((fail+1)); fi
  P10=$(curl -s -H "Authorization: Bearer $K" "$U/contribution/$TID" | python3 -c "import json,sys
try: print(json.load(sys.stdin).get('project') or '-')
except Exception: print('unparsed')" 2>/dev/null)
  chk "D10 the row carries the stamp" "$PE" "$P10"
else
  echo "  FAIL  D7-D10 not run: they need a project (D3a)"; fail=$((fail+1))
fi
if [ "$SHAPE" = "multi" ]; then
  chk "D11 multi-seat without claim -> 422 loud" 422 "$(code -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d '{"eval":true,"items":[{"contribution":{"lane":"code","kind":"pr","what":"day0 no project","why":"day0","touches":["day0"],"components":["mind/evals"],"proof":"sh x -> 0"}}]}' "$U/preview")"
else
  sk "D11 multi-seat without claim -> 422 loud (single-seat org)"
fi
# D5: the one door refuses a project the caller may not write into before it stores anything: 403 project_forbidden
chk "D12 unknown project -> refused loud (403 project_forbidden)" 403 "$(code -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d '{"eval":true,"project":"nope","items":[{"contribution":{"lane":"code","kind":"pr","what":"day0 bad project","why":"day0","touches":["day0"],"components":["mind/evals"],"proof":"sh x -> 0"}}]}' "$U/preview")"
CTRL=$(curl -s -b "$JAR" "$A/control")
# Control's projects region is data-region="workspaces"; the org's own name (its org row, src/tenant.js) is on the JSON
# read, GET /control/people org.name
has "D13 /control renders its projects region" 'data-region="workspaces"' "$CTRL"
has "D14 the org row is read: GET /control/people org.name is the org's own name" 'name=ok' "name=$(curl -s -b "$JAR" -H 'accept: application/json' "$A/control/people" | python3 -c "import json,sys
try: n=(json.load(sys.stdin).get('org') or {}).get('name') or ''; print('ok' if n.strip() else 'none')
except Exception: print('parse-error')")"
# What is missing (src/holes.js): the page by its semantic hook (data-screen="holes"; its title has changed twice), the
# answer by its shape, never its copy
has "D15 What is missing renders (public)" 'data-screen="holes"' "$(curl -s "$U/missing")"
if [ -n "$P1" ]; then
  # D16: brain://missing?project=<P1> (the twin of the missing tool and GET /missing) answers its summary, the counts match the
  # lists, something is graded, and every open item and every area not started carries the call that fills it: a
  # `preview` with its items (the one-pass fix: fillPath.tool is "preview"), or `rule_question` for the owner's rulings
  HSUM=$(mcp "{\"jsonrpc\":\"2.0\",\"id\":90,\"method\":\"resources/read\",\"params\":{\"uri\":\"brain://missing?project=$P1\"}}" | python3 -c "import json,sys
rpc=lambda t: json.loads(next((l[6:] for l in t.splitlines() if l.startswith('data: ')), t))   # a JSON answer or an SSE one
try:
  d=json.loads(rpc(sys.stdin.read())['result']['contents'][0]['text']); s=d.get('summary') or {}
  o, f = s.get('open'), s.get('filled'); hs=d.get('items') or []
  bad=[(h.get('id') or h.get('piece') or '?')+':'+str((h.get('fillPath') or {}).get('tool')) for h in hs + (d.get('notApplicable') or [])
       if not ((h.get('fillPath') or {}).get('tool') == 'preview' and (h['fillPath'].get('args') or {}).get('items')
               or ((h.get('fillPath') or {}).get('tool') == 'rule_question' and h.get('id') == 'rulings-owed') or h.get('href'))]
  if d.get('error') or d.get('live'): print('not read: '+str(d.get('error') or d.get('live')))
  elif d.get('project') != sys.argv[1]: print('read project %s, asked %s' % (d.get('project'), sys.argv[1]))
  elif not (isinstance(o, int) and isinstance(f, int)): print('no summary {open, filled}')
  elif o != len(hs) or f != len(d.get('filled') or []): print('counts %s/%s vs lists %s/%s' % (o, f, len(hs), len(d.get('filled') or [])))
  elif o + f == 0: print('no piece graded')
  elif bad: print('an item without its preview call: ' + ', '.join(bad[:5]))
  else: print('ok open=%d filled=%d, every open item filled through preview' % (o, f))
except Exception as e: print('unparsed: %s' % type(e).__name__)" "$P1" 2>/dev/null || echo "no answer")
  okv "D16 brain://missing answers honestly, every call a preview" "$HSUM"
  # The Atlas page is retired (the Screens view lives on the Map, GET /map/screens): its old URL answers 404
  chk "D17 the retired Atlas page answers 404" 404 "$(code -H "Authorization: Bearer $K" "$U/atlas/$P1")"
  chk "D17b the Map (GET /map) renders 200 on a fresh org" 200 "$(code -H "Authorization: Bearer $K" -H "Accept: text/html" "$U/map?project=$P1")"
else
  echo "  FAIL  D16-D17b not run: they need a project (D3a)"; fail=$((fail+1))
fi
# D18: the first run's path is on the door: whoami, missing, create_project, then preview and file
TOOLS=$(mcp '{"jsonrpc":"2.0","id":91,"method":"tools/list","params":{}}' | python3 -c "import json,sys
rpc=lambda t: json.loads(next((l[6:] for l in t.splitlines() if l.startswith('data: ')), t))   # a JSON answer or an SSE one
try:
  names={t.get('name') for t in rpc(sys.stdin.read())['result']['tools']}
  miss=[n for n in ('whoami','missing','create_project','preview','file') if n not in names]
  print('missing: '+', '.join(miss) if miss else 'ok %d tools' % len(names))
except Exception as e: print('unparsed: %s' % type(e).__name__)" 2>/dev/null || echo "no answer")
okv "D18 the door lists the first-run tools (whoami, missing, create_project, preview, file)" "$TOOLS"
if [ -n "$PASS" ]; then
  # the ACCOUNT (sprint 7, 7.1 and 7.5a): its own passphrase signs in at the root, and whoami with that session names the org
  A1BODY=$(EMAIL="$EMAIL" PASS="$PASS" python3 -c "import json,os;print(json.dumps({'email':os.environ['EMAIL'],'password':os.environ['PASS'],'device':'day0'}))")
  A1=$(curl -s -X POST -H 'content-type: application/json' -d "$A1BODY" "$U/login")
  AT=$(jfield "$A1" "d.get('token') or ''")
  chk "A1 the account passphrase signs in at the root" yes "$([ -n "$AT" ] && echo yes || echo no)"
  ORGS=$(curl -s -H "Authorization: Bearer $AT" "$U/whoami" | python3 -c "import json,sys
try: print(' '.join(o.get('slug','')+('*' if o.get('current') else '') for o in (json.load(sys.stdin).get('orgs') or [])))
except Exception: print('')" 2>/dev/null)
  # the org is among the account's orgs (marked * when it is the one the root sign-in chose: an account in several orgs
  # signs in to its org-1 seat, else its first)
  case " $ORGS " in *" $SLUG "*|*" $SLUG* "*) a2=yes ;; *) a2="no ($ORGS)" ;; esac
  chk "A2 whoami's orgs name the org (/$SLUG)" yes "$a2"
else
  sk "A1-A2 the account's sign-in and its orgs (set DAY0_PASS, your account passphrase)"
fi
rm -f "$JAR"
echo ""; echo "  day-0: $pass passed, $fail failed, $skip skipped ($((pass+fail))/$((pass+fail+skip)) checks run, shape=$SHAPE)"
[ "$fail" -eq 0 ]
