#!/bin/sh
# evals.sh — the door's acceptance suite (D5 Part 5, sprint 3: cut to a keep set, on the door's new names).
# WHAT IT PROVES NOW — a case stays only when it proves one of these, and nothing in tools/smoke.sh or an offline selftest of
# gate.sh already does:
#   (a) authentication and authorization at a real door: the auth net over EVERY REST row of contracts/door.json (AC), the
#       MCP door's 401 and its OAuth challenge and metadata, the OAuth flow (oauth-flow.py) and a read-only grant
#       (oauth-scope-flow.py), one resolver (check-one-resolver.py), the read-only credential on /mcp, a member's tools/list
#       and /capabilities, a reader seated nowhere on a contribution, a decision only the owner makes;
#   (b) a door write lands, and a refusal writes nothing: open items, a wrap-up and its card answer, saved files (REST and
#       MCP, the size cap, the storage guard), a decision (final), the privacy door, clean-eval;
#   (c) the three loops end to end: missing -> file what it names -> it closes and shows on Home; a question -> a member's
#       answer -> the owner rules -> decided at once; a check -> a grade with proof -> the node lights;
#   (d) rules nothing else proves: the doc door refuses a traversal; a saved HTML file serves sandboxed.
# THE ORG starts the way the smoke starts (tools/lib.sh suite_local_up): a FRESH local org every run, its fixtures
# (tools/suites/fixtures/) filed through preview then file; the cases read them (project sharingu, questions QSUITE1/QSUITE2).
# Every row a case files is eval-marked (tools/check-suite-marks.py, a gate step). The footer's self-clean and write_last_run
# close the run. --live runs against the real worker after tools/cf-budget.sh; no fixture is filed there, so a case that
# needs one skips by name.
#   sh evals.sh [--live]    ·    sh evals.sh --only <regex> [--live]   (a slice: the header, the sections whose marker matches)
# >>> ADR-098 §4 slice dispatch — tools/evals-slice.py strips this block when it
# composes a slice's temp script, so a slice's own re-exec of that temp script (no
# args) never recurses back in here. See tools/evals-slice.py for the mechanism —
# this is deliberately the ONLY change to this file's normal (no --only) path: the
# guard below is a no-op unless $1 is literally --only, so a plain `sh evals.sh`
# runs byte-identically to before this existed. Do not add eval logic up here.
# --live (Q9CF32D8F) rides through a slice as SUITE_TARGET=live (the slice's temp script runs with no args):
# `sh evals.sh --live --only <re>` and `sh evals.sh --only <re> --live` both work; no --live = the local R.
if [ "$1" = "--live" ] && [ "$2" = "--only" ]; then SUITE_TARGET=live; export SUITE_TARGET; shift; fi
if [ "$1" = "--only" ]; then
  [ "${3:-}" = "--live" ] && { SUITE_TARGET=live; export SUITE_TARGET; }
  exec python3 "$(dirname "$0")/tools/evals-slice.py" "$(dirname "$0")/evals.sh" "$2"
fi
# <<< end slice dispatch >>>
# The harness (the target, a fresh local org and its fixtures, the minted seats, chk/code/sk, self_clean) is ONE file:
# tools/lib.sh. Nothing harness-shaped lives in this file.
. "$(dirname "$0")/tools/lib.sh"
# ENGINE_DIR: the real engine directory (a composed slice runs from /tmp; tools/evals-slice.py rewrites this line's
# $(dirname "$0") to the absolute engine path, so every section reaches the engine's files through it)
ENGINE_DIR="$(dirname "$0")"
DOORPY="$ENGINE_DIR/tools/suites/door.py"
CONTRACT="$ENGINE_DIR/../contracts/door.json"
SP="${SUITE_PROJECT:-sharingu}"   # the fixtures' project (tools/suites/fixtures/sharingu.json)
export U TESTKEY
# tc <key> <tool> <arguments json> -> the tool's answer, one JSON line ("_isError" beside its fields), through the MCP door
tc() { DOOR_KEY="$1" U="$U" python3 "$DOORPY" tool "$2" "$3"; }
# pf <key> <preview arguments json> -> preview then file with the same items: {step, isError, preview, receipt, id, route, status}
pf() { DOOR_KEY="$1" U="$U" python3 "$DOORPY" file "$2"; }
# jf <dotted.path> -> one field of the JSON on stdin ('' when absent; true/false lowercase; a dict or list as JSON)
jf() { python3 -c "import json,sys
try: v=json.load(sys.stdin)
except Exception: print(''); raise SystemExit
for k in sys.argv[1].split('.'):
    v=v[int(k)] if isinstance(v,list) and k.isdigit() and int(k)<len(v) else (v.get(k) if isinstance(v,dict) else None)
print('' if v is None else (str(v).lower() if isinstance(v,bool) else (json.dumps(v) if isinstance(v,(dict,list)) else v)))" "$1"; }
# ro <key> -> a person's read-only credential (src/core.js resolveReadOnly): sha256(sha256(key) + the read-only suffix)
ro() { python3 -c "import hashlib,sys;k=sys.argv[1];print(hashlib.sha256((hashlib.sha256(k.encode()).hexdigest()+':agent-r-read-only:v1').encode()).hexdigest())" "$1"; }
# has_fixture <qid> -> 0 when the fixtures' question is on the project (a fresh local org; --live files no fixture)
has_fixture() { curl -s -H "Authorization: Bearer $K" -H 'accept: application/json' "$U/question/$1?project=$SP" | python3 -c "import json,sys
try: sys.exit(0 if (json.load(sys.stdin).get('decision') or {}).get('status') else 1)
except Exception: sys.exit(1)"; }

echo "sharingu · the door's acceptance suite (evals)"
chk "E1 /health answers, D1 ok" "200 ok" "$(curl -s -w ' %{http_code}' "$U/health" | python3 -c "import json,sys
raw=sys.stdin.read(); b,c=raw.rsplit(' ',1)
try: print(c+' '+str(json.loads(b).get('d1')))
except Exception: print(c+' unreadable')")"
chk "E2 no key -> 401"            401 "$(code "$U/whoami")"
chk "E2b bad key -> 401"          401 "$(code -H 'Authorization: Bearer wrong' "$U/whoami")"
chk "E3 the owner's key -> 200"   200 "$(code -H "Authorization: Bearer $K" "$U/whoami")"

# --- M4 M12-M14 M3 M16 E59 E77 E79: the MCP door and its credentials — 401 with the OAuth challenge, the OAuth metadata,
# one resolver, a member shown no owner tool and no owner capability, a read-only credential never reaches /mcp ---
chk "M4 /mcp with no credential -> 401" 401 "$(code -X POST "$U/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')"
chk "M4b the 401 carries the OAuth challenge (WWW-Authenticate with resource_metadata)" yes "$(curl -s -i -X POST "$U/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | python3 -c "
import sys; t=sys.stdin.read().lower(); print('yes' if 'www-authenticate' in t and 'resource_metadata' in t else 'no')")"
chk "M12 authorization-server metadata"  200 "$(code "$U/.well-known/oauth-authorization-server")"
chk "M13 protected-resource metadata"    200 "$(code "$U/.well-known/oauth-protected-resource")"
chk "M14 PKCE S256 is the method offered" True "$(curl -s "$U/.well-known/oauth-authorization-server" | python3 -c "import json,sys
try: print('S256' in (json.load(sys.stdin).get('code_challenge_methods_supported') or []))
except Exception: print('unreadable')")"
chk "M16 resolveReader is the only path from OAuth props to a person (static)" ok "$(cd "$ENGINE_DIR" && python3 check-one-resolver.py)"
M3O=$(curl -s -X POST "$U/mcp" -H 'content-type: application/json' -H "Authorization: Bearer $K" -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}')
M3M=$(curl -s -X POST "$U/mcp" -H 'content-type: application/json' -H "Authorization: Bearer $EVALKEY" -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}')
chk "M3 every owner-only tool (door.json owner: true) is on the owner's tools/list and on no member's" "ok" "$(O="$M3O" M="$M3M" C="$CONTRACT" python3 -c "import json,os
own={t['name'] for t in json.load(open(os.environ['C']))['tools'] if t.get('owner')}
try:
  o,m=[{x['name'] for x in json.loads(os.environ[k])['result']['tools']} for k in ('O','M')]
  print('ok' if own and own<=o and not (own & m) else 'bad: owner lacks %s, member sees %s' % (sorted(own-o), sorted(own & m)))
except Exception as e: print('unreadable: '+str(e)[:80])")"
CAPO=$(curl -s -H "Authorization: Bearer $K" "$U/capabilities"); CAPM=$(curl -s -H "Authorization: Bearer $EVALKEY" "$U/capabilities")
# (the python sits in an assignment: bash 3.2 brace-expands a {a,b} set literal inside a "$(...)" argument)
E59=$(O="$CAPO" M="$CAPM" C="$CONTRACT" python3 -c "import json,os
own=set((r['method'],r['path']) for r in json.load(open(os.environ['C']))['rest'] if r.get('auth')=='owner')
try:
  call=lambda k: set((r['method'],r['path']) for r in json.loads(os.environ[k])['routes'] if r.get('callable'))
  o,m=call('O'),call('M')
  print('ok' if own and own<=o and not (own & m) else 'bad: owner cannot %s, member can %s' % (sorted(own-o)[:3], sorted(own & m)[:3]))
except Exception as e: print('unreadable: '+str(e)[:80])")
chk "E59 /capabilities: every owner route is callable for the owner and for no member" "ok" "$E59"
ROM=$(ro "$EVALKEY")
chk "E77 a member's read-only credential reads (GET /whoami)" 200 "$(code -H "Authorization: Bearer $ROM" "$U/whoami")"
chk "E79 a read-only credential never reaches /mcp (401)"      401 "$(code -X POST -H "Authorization: Bearer $ROM" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' "$U/mcp")"

# --- AC: auth coverage — every REST row of contracts/door.json at the real door, by the auth it declares: signed out a
# script 401 (public rows never), a non-owner seated nowhere 403 on an owner row and past auth on the rest, a browser sent
# to the sign-in, a bad bearer 401 (tools/suites/auth-coverage.py) ---
ACOUT=$(U="$U" TESTKEY="$TESTKEY" python3 "$ENGINE_DIR/tools/suites/auth-coverage.py")
printf '%s\n' "$ACOUT" | grep '^  \.AC FAIL' | head -40
ACL=$(printf '%s\n' "$ACOUT" | tail -1)
case "$ACL" in
  "AC "*" 0 "*) echo "  PASS  AC auth-coverage: ${ACL#AC } (assertions held · failed · rows)"; pass=$((pass+1)) ;;
  *) echo "  FAIL  AC auth-coverage: ${ACL#AC } (assertions held · failed · rows)"; fail=$((fail+1)) ;;
esac

# --- M17 M18: OAuth at the real door — a full grant files a wrap-up as its person with no owner tool shown; a read-only
# grant (mcp:read) is refused every write tool, still reads, and lists no write tool ---
FLOW=$(cd "$ENGINE_DIR" && python3 oauth-flow.py 2>&1 | tail -1)
case "$FLOW" in OK*) echo "  PASS  M17 a wrap-up filed through an OAuth token ($FLOW)"; pass=$((pass+1));; *) echo "  FAIL  M17 $FLOW"; fail=$((fail+1));; esac
SCOPEFLOW=$(cd "$ENGINE_DIR" && python3 oauth-scope-flow.py 2>&1 | tail -1)
case "$SCOPEFLOW" in OK*) echo "  PASS  M18 a read-only OAuth grant: writes refused, reads allowed, no write tool listed ($SCOPEFLOW)"; pass=$((pass+1));; *) echo "  FAIL  M18 $SCOPEFLOW"; fail=$((fail+1));; esac

# --- E97b E131 E132 E132b: file -> it waits on the owner (on Build) -> the owner decides, once; a reader seated nowhere
# reads it as a missing id; nobody else decides it ---
D131=$(pf "$EVALKEY" "{\"project\":\"$SP\",\"eval\":true,\"items\":[{\"contribution\":{\"lane\":\"vendor\",\"kind\":\"scope\",\"what\":\"eval E131 a vendor scope to decide\",\"why\":\"eval probe\",\"touches\":[\"ai-scope\"]}}]}")
T131=$(printf '%s' "$D131" | jf id)
if [ -n "$T131" ] && [ "$(printf '%s' "$D131" | jf route)" = "owner" ]; then
  chk "E97b a reader seated nowhere gets 404 not_found on it, the same answer as a missing id; the owner reads it" "404 not_found/404 not_found/200" \
    "$(for id in "$T131" T-19700101-999; do curl -s -w ' %{http_code}' -H "Authorization: Bearer $TESTKEY" "$U/contribution/$id" | python3 -c "import json,sys
raw=sys.stdin.read(); b,c=raw.rsplit(' ',1)
try: print(c+' '+str(json.loads(b).get('error')))
except Exception: print(c+' unreadable')"; done | paste -sd/ -)/$(code -H "Authorization: Bearer $K" "$U/contribution/$T131")"
  chk "E132b only the owner decides: a member and a reader seated nowhere -> 403, the row still open" "403/403/null" \
    "$(code -X POST -H "Authorization: Bearer $EVALKEY" -H 'content-type: application/json' -d '{"verdict":"approve"}' "$U/contribution/$T131/decide")/$(code -X POST -H "Authorization: Bearer $TESTKEY" -H 'content-type: application/json' -d '{"verdict":"approve"}' "$U/contribution/$T131/decide")/$(curl -s -H "Authorization: Bearer $K" "$U/contribution/$T131" | python3 -c "import json,sys
try: print(json.dumps(json.load(sys.stdin).get('decision')))
except Exception: print('unreadable')")"
  ONB=$(curl -s -H "Authorization: Bearer $K" -H 'accept: application/json' "$U/build?project=$SP&eval=1" | T="$T131" python3 -c "import json,os,sys
try: print('yes' if os.environ['T'] in json.dumps(json.load(sys.stdin).get('rows')) else 'no')
except Exception: print('unreadable')")
  D131R=$(curl -s -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d '{"verdict":"approve","note":"eval approval"}' "$U/contribution/$T131/decide")
  chk "E131 it waits on Build (?eval=1); the owner approves: decision approve, closed, and the row reads it" "yes/approve/closed/approve" "$ONB/$(printf '%s' "$D131R" | jf decision)/$(printf '%s' "$D131R" | jf status)/$(curl -s -H "Authorization: Bearer $K" "$U/contribution/$T131" | jf decision)"
  chk "E132 a decision is final: a second -> 409 already_decided" "409" "$(code -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d '{"verdict":"reject"}' "$U/contribution/$T131/decide")"
else
  bad "E97b E131 E132 E132b: the vendor scope did not file routed owner ($(printf '%s' "$D131" | head -c 300))"
fi

# --- E9: an open item lands: POST /open-items opens it, updates lists it under waitingOnYou.openItems, closing it removes it ---
T9="eval-open-item-$(date +%s)"
L9=$(curl -s -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d "{\"title\":\"$T9\"}" "$U/open-items")
LID9=$(printf '%s' "$L9" | jf opened)
IN9=$(curl -s -H "Authorization: Bearer $K" "$U/updates" | T="$T9" python3 -c "import json,os,sys
try: print('listed' if any(x.get('title')==os.environ['T'] for x in (json.load(sys.stdin).get('waitingOnYou') or {}).get('openItems') or []) else 'absent')
except Exception: print('unreadable')")
[ -n "$LID9" ] && curl -s -o /dev/null -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d "{\"close\":\"$LID9\"}" "$U/open-items"
OUT9=$(curl -s -H "Authorization: Bearer $K" "$U/updates" | T="$T9" python3 -c "import json,os,sys
try: print('listed' if any(x.get('title')==os.environ['T'] for x in (json.load(sys.stdin).get('waitingOnYou') or {}).get('openItems') or []) else 'absent')
except Exception: print('unreadable')")
chk "E9 an open item opens (POST /open-items), updates lists it, and once closed it is gone" "opened/listed/absent" "$([ -n "$LID9" ] && echo opened || echo "not-opened:$(printf '%s' "$L9" | head -c 80)")/$IN9/$OUT9"

# --- E7 E253a: a wrap-up lands through POST /wrap-up and shows on updates' yours; its card answer lands on the question
# (the fixture QSUITE1) as an answer row; the receipt's arithmetic is tools/handoff-selftest.mjs's ---
if has_fixture QSUITE1; then
  NA7=$(curl -s -H "Authorization: Bearer $K" "$U/question/QSUITE1?project=$SP&eval=1" | python3 -c "import json,sys
try: print(len((json.load(sys.stdin).get('live') or {}).get('answers') or []))
except Exception: print('unreadable')")
  HR=$(curl -s -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d "{\"eval\":true,\"project\":\"$SP\",\"summary\":\"eval E7 wrap-up\",\"decisions\":[{\"what\":\"eval decision\"}],\"answers\":[{\"card\":\"QSUITE1\",\"answer\":\"wrap_up, as an answer row\",\"basis\":\"evals.sh E253a\"}],\"open\":[\"eval still open\"]}" "$U/wrap-up")
  HID=$(printf '%s' "$HR" | jf id)
  YOURS7=$(tc "$K" updates "{\"project\":\"$SP\",\"eval\":true}" | H="$HID" python3 -c "import json,os,sys
try: print('yes' if os.environ['H'] and any(i.get('id')==os.environ['H'] and i.get('kind')=='report' for i in (json.load(sys.stdin).get('yours') or {}).get('items') or []) else 'no')
except Exception: print('unreadable')")
  chk "E7 POST /wrap-up files (filed, an id) and updates (eval) lists it among yours as a report" "true/yes/yes" "$(printf '%s' "$HR" | jf filed)/$([ -n "$HID" ] && echo yes || echo no)/$YOURS7"
  chk "E253a its card answer lands on QSUITE1 (filedAnswers 1; the question's answers +1)" "1/$((NA7+1))" "$(printf '%s' "$HR" | jf receipt.filedAnswers)/$(curl -s -H "Authorization: Bearer $K" "$U/question/QSUITE1?project=$SP&eval=1" | python3 -c "import json,sys
try: print(len((json.load(sys.stdin).get('live') or {}).get('answers') or []))
except Exception: print('unreadable')")"
elif [ "$SUITE_TARGET" = "local" ]; then
  # G2 (the review: has_fixture swallowed every error, so a broken GET /question skipped E7 and E253a): locally the fixtures are
  # filed on every fresh org, so a missing or unreadable QSUITE1 is a failure, never a skip
  echo "  FAIL  E7 E253a the fixture question QSUITE1 does not read on the local org (GET /question/QSUITE1)"; fail=$((fail+1))
else
  sk "E7 E253a a wrap-up and its card answer (no fixture question QSUITE1 on $SP: the fixtures are filed on the local org only)"
fi

# --- E12 M6 E20 E22 E81 E194d: the privacy door — a transcript is refused on every door; authoredPrompts passes ONLY at a
# wrap-up's top level, and below consent traces+prompts it is dropped with a note (the fixed seats' consent is off) ---
# st_err: an answer ending in " <http code>" (curl -w) -> "<code> <its JSON error>"; every JSON body below sits in a variable
# first (bash 3.2, the sh here, splits a double-quoted {"a":1,"b":2} inside a "$(...)" argument on its commas)
st_err() { python3 -c "import json,sys
raw=sys.stdin.read(); b,c=raw.rsplit(' ',1)
try: print(c+' '+str(json.loads(b).get('error')))
except Exception: print(c+' unreadable')"; }
wpost() { curl -s -w ' %{http_code}' -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d "$1" "$U/wrap-up" | st_err; }
B12="{\"eval\":true,\"project\":\"$SP\",\"summary\":\"eval E12\",\"transcript\":\"x\"}"
chk "E12 a wrap-up carrying a transcript -> 422 transcript_rejected" "422 transcript_rejected" "$(wpost "$B12")"
BM6="{\"project\":\"$SP\",\"eval\":true,\"transcript\":\"secret\",\"items\":[{\"contribution\":{\"lane\":\"leader\",\"kind\":\"note\",\"what\":\"eval M6\",\"why\":\"eval\"}}]}"
RM6=$(tc "$EVALKEY" preview "$BM6")
chk "M6 a preview carrying a transcript is refused at the MCP door (transcript_rejected, nothing previewed)" "true/transcript_rejected/" "$(printf '%s' "$RM6" | jf _isError)/$(printf '%s' "$RM6" | jf error)/$(printf '%s' "$RM6" | jf previewId)"
B20="{\"eval\":true,\"project\":\"$SP\",\"summary\":\"eval E20\",\"authoredPrompts\":[\"mine\"]}"
R20=$(curl -s -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d "$B20" "$U/wrap-up")
chk "E20 authoredPrompts at a wrap-up's top level files" "true" "$(printf '%s' "$R20" | jf filed)"
N194=$(printf '%s' "$R20" | jf note)
case "$N194" in *"authoredPrompts dropped"*) D194=dropped ;; *) D194=kept ;; esac   # never a case inside "$(...)": bash 3.2
chk "E194d below consent traces+prompts the prompts are dropped, and the receipt says so" "dropped" "$D194"
B22="{\"eval\":true,\"project\":\"$SP\",\"summary\":\"eval E22\",\"decisions\":[{\"authoredPrompts\":[\"x\"]}]}"
chk "E22 authoredPrompts nested anywhere else -> 422 transcript_rejected" "422 transcript_rejected" "$(wpost "$B22")"
B81="{\"eval\":true,\"project\":\"$SP\",\"summary\":\"eval E81\",\"selfReflection\":[{\"failure\":\"x\",\"transcript\":\"y\"}]}"
chk "E81 a selfReflection carrying a transcript -> 422 transcript_rejected" "422 transcript_rejected" "$(wpost "$B81")"

# --- E27 E28 M5 M10 E35 M24 E232m: a saved file lands — REST and MCP, read back by its author, counted by the storage guard;
# over the cap nothing is saved; a public one reads for anyone; an HTML file serves in a CSP sandbox ---
B35=$(curl -s -H "Authorization: Bearer $K" "$U/storage" | jf usedBytes)
AR=$(printf '<html><body>eval E27 saved file</body></html>' | curl -s -X POST "$U/artifact?title=eval-e27&group=eval" -H "Authorization: Bearer $K" -H 'content-type: text/html' --data-binary @-)
AID=$(printf '%s' "$AR" | jf id)
chk "E27 POST /artifact saves (an id and a deeplink)" "yes/yes" "$([ -n "$AID" ] && echo yes || echo no)/$([ -n "$(printf '%s' "$AR" | jf deeplink)" ] && echo yes || echo no)"
chk "E28 its author reads it back" 200 "$(code -H "Authorization: Bearer $K" "$U/artifact/$AID")"
chk "E35 the storage guard counts it (usedBytes rose)" "rose" "$(A="$(curl -s -H "Authorization: Bearer $K" "$U/storage" | jf usedBytes)" B="$B35" python3 -c "import os
try: print('rose' if int(os.environ['A'])>int(os.environ['B']) else 'flat %s -> %s' % (os.environ['B'],os.environ['A']))
except Exception: print('unreadable')")"
# G2 (the review: `*sandbox*` passed "sandbox allow-same-origin allow-scripts", no sandbox at all): every directive that makes a
# saved file inert is asserted — a sandbox with no allow-scripts or allow-same-origin, nothing loaded (default-src 'none'), no
# form, no base, and nosniff
H232=$(curl -s -D - -o /dev/null -H "Authorization: Bearer $K" "$U/artifact/$AID" | tr -d '\r')
S232=$(printf '%s' "$H232" | python3 -c "import sys,re
h=sys.stdin.read(); m=re.search(r'(?im)^content-security-policy:\s*(.*)$', h); n=re.search(r'(?im)^x-content-type-options:\s*nosniff\s*$', h)
c=m.group(1) if m else ''; d={x.split()[0]:' '.join(x.split()[1:]) for x in c.split(';') if x.strip()}
bad=[w for w,ok in [('sandbox', 'sandbox' in d and not re.search(r'allow-(scripts|same-origin|forms|top-navigation)', d.get('sandbox',''))), ('default-src none', d.get('default-src')==\"'none'\"), ('form-action none', d.get('form-action')==\"'none'\"), ('base-uri none', d.get('base-uri')==\"'none'\"), ('no outside source', not re.search(r'https?:|\*', c)), ('nosniff', bool(n))] if not ok]
print('inert' if not bad else 'not: '+', '.join(bad)+' ['+c+']')")
chk "E232m a saved HTML file is an inert document: sandboxed with no script, nothing loaded from anywhere, no form, nosniff" "inert" "$S232"
M5=$(tc "$EVALKEY" save_file "{\"eval\":true,\"title\":\"eval-m5\",\"group\":\"eval\",\"content\":\"<html>eval M5</html>\"}")
chk "M5 save_file (MCP) lands and reads back over REST for its author" 200 "$(code -H "Authorization: Bearer $EVALKEY" "$U/artifact/$(printf '%s' "$M5" | jf id)")"
N10A=$(curl -s -H "Authorization: Bearer $K" "$U/storage" | jf usedBytes)
F10=$(mktemp "${TMPDIR:-/tmp}/eval-m10-XXXXXX")
python3 -c "import json;print(json.dumps({'eval':True,'title':'eval-m10-big','group':'eval','content':'x'*5000001}))" > "$F10"
M10=$(tc "$EVALKEY" save_file "@$F10")   # the arguments (eval-marked) are in the file: too big for argv
rm -f "$F10"
N10B=$(curl -s -H "Authorization: Bearer $K" "$U/storage" | jf usedBytes)
chk "M10 a file over the 5 MB cap is refused and nothing is saved (the storage guard's usedBytes unchanged)" "true/same" "$(printf '%s' "$M10" | jf _isError)/$([ -n "$N10A" ] && [ "$N10A" = "$N10B" ] && echo same || echo "moved $N10A -> $N10B")"
M24=$(tc "$EVALKEY" save_file "{\"eval\":true,\"title\":\"eval-m24-public\",\"group\":\"eval\",\"content\":\"<html>eval public</html>\",\"public\":true}" | jf id)
B24="{\"id\":\"$M24\",\"meta\":true}"
R24=$(tc "$TESTKEY" read_file "$B24")
chk "M24 a public file reads for anyone: a non-author (read_file) and no credential at all" "false/200" "$(printf '%s' "$R24" | jf _isError)/$(code "$U/artifact/$M24")"

# --- E40: the doc door refuses a path traversal (never 200 with content) ---
T40=$(code --path-as-is -H "Authorization: Bearer $K" "$U/doc/../../wrangler.jsonc")
T40B=$(code --path-as-is -H "Authorization: Bearer $K" "$U/doc/..%2F..%2Fwrangler.jsonc")
T40C=$(code -H "Authorization: Bearer $K" "$U/read?ref=doc/../../wrangler.jsonc&project=$SP")
# G2 (the review: any non-200 passed, a 500 or a sign-in redirect too): each answer must be a refusal the door means (400 bad
# path or 404 not found), and nothing else
r40=pass; for c40 in $T40 $T40B $T40C; do case "$c40" in 400|404) ;; *) r40=fail ;; esac; done
if [ "$r40" = pass ]; then echo "  PASS  E40 a doc path traversal is refused, each a 400 or a 404 ($T40/$T40B/$T40C)"; pass=$((pass+1))
else echo "  FAIL  E40 a doc path traversal answered something other than a 400 or a 404 ($T40/$T40B/$T40C)"; fail=$((fail+1)); fi

# --- E-LOOP1 E-LOOP2 E-LOOP3: THE THREE LOOPS (docs/plan/README.md), end to end through the door. Loop 1 on its own fresh
# project (create_project, eval-marked: it has no aim yet); loops 2 and 3 on the fixtures' project with ids of their own.
# LOCAL R only: knowledge carries no eval mark, so the loops never write a real project's knowledge on --live ---
if [ "$SUITE_TARGET" = "local" ]; then
  TSL=$(date +%s); PL="evl-$TSL"; QL="QEVL$TSL"; NL="screen:evl-$TSL"; CL="AC.evl.$TSL"
  # E-LOOP1: missing names the aim with its fill (a preview); filing exactly that (its placeholder filled) closes it, Home shows it
  CP1=$(tc "$K" create_project "{\"key\":\"$PL\",\"name\":\"Eval loops $TSL\",\"eval\":true}")
  HL1=$(tc "$K" missing "{\"project\":\"$PL\"}")
  FA1=$(printf '%s' "$HL1" | python3 -c "import json,sys
try:
  f=[h for h in json.load(sys.stdin).get('items') or [] if h.get('piece')=='aim'][0]['fillPath']; a=f['args']
  a['items'][0]['data']['aim']='Eval loops: the three loops close on the suite org'; a['eval']=True
  print(json.dumps(a) if f['tool']=='preview' else '')
except Exception: print('')")
  WL1=$([ -n "$FA1" ] && pf "$K" "$FA1")
  HL1B=$(tc "$K" missing "{\"project\":\"$PL\"}")
  chk "E-LOOP1 missing -> file what it names -> it closes: the aim's own fill (a preview) filed as handed out, the aim filled and on Home" "ok" "$(C="$CP1" A="$HL1" B="$HL1B" W="$WL1" F="$FA1" H="$(curl -s -H "Authorization: Bearer $K" "$U/home/summary?project=$PL")" python3 -c "import json,os
try:
  a=json.loads(os.environ['A']); b=json.loads(os.environ['B']); w=json.loads(os.environ['W'] or '{}'); h=json.loads(os.environ['H'] or '{}')
  names=lambda d: [x.get('piece') for x in d.get('items') or []]
  good=os.environ['F'] and 'aim' in names(a) and w.get('status')=='filed' and 'aim' not in names(b) and 'aim' in (b.get('filled') or []) and ((h.get('aim') or {}).get('text') or '').startswith('Eval loops')
  print('ok' if good else 'bad:'+json.dumps([json.loads(os.environ['C']).get('error'),names(a),w.get('status'),names(b),(h.get('aim') or {}).get('text')])[:240])
except Exception as e: print('parse-error:'+str(e)[:80])")"
  # E-LOOP2: a question filed open; a member's answer (eval) is answered and leaves it open; the owner rules it: decided at once
  pf "$K" "{\"project\":\"$SP\",\"eval\":true,\"items\":[{\"kind\":\"question\",\"op\":\"upsert\",\"data\":{\"qid\":\"$QL\",\"question\":\"Eval loops: which door rules a question?\",\"options\":[{\"what\":\"rule_question\"},{\"what\":\"a publish\"}],\"whoOwes\":\"owner\"}}]}" >/dev/null
  dl() { curl -s -H "Authorization: Bearer $K" -H 'accept: application/json' "$U/decisions?project=$SP&eval=1" | QL="$QL" python3 -c "import json,os,sys
try: r=[x for x in json.load(sys.stdin).get('rows') or [] if x.get('qid')==os.environ['QL']]; print('%s:%s' % (r[0].get('status'),r[0].get('choice')) if r else 'none')
except Exception: print('unreadable')"; }
  DL2A=$(dl)
  RE2=$(tc "$EVALKEY" respond "{\"project\":\"$SP\",\"qid\":\"$QL\",\"option\":1,\"eval\":true}" | python3 -c "import json,sys
try: t=(json.load(sys.stdin).get('transmissions') or [{}])[0]; print('filed' if str(t.get('tx') or '').startswith('T-') else 'none')
except Exception: print('unreadable')")
  DL2B=$(dl)
  RQ2=$(tc "$K" rule_question "{\"project\":\"$SP\",\"qid\":\"$QL\",\"choice\":0,\"eval\":true}" | jf _isError)
  chk "E-LOOP2 a question -> a member answers (filed, still open) -> the owner rules -> decided A on the next read" "open:None/filed/open:None/false/decided:0" "$DL2A/$RE2/$DL2B/$RQ2/$(dl)"
  # E-LOOP3: a node and a check naming it; grey with the check ungraded; a member's grade with proof counts; the node is green
  pf "$K" "{\"project\":\"$SP\",\"eval\":true,\"items\":[{\"kind\":\"node\",\"op\":\"upsert\",\"data\":{\"id\":\"$NL\",\"type\":\"screen\",\"name\":\"Eval loops screen\",\"data\":{}}},{\"kind\":\"check\",\"op\":\"upsert\",\"data\":{\"id\":\"$CL\",\"title\":\"The eval loops screen serves\",\"given\":\"a reader\",\"when\":\"they open it\",\"then\":\"it renders\",\"refs\":[\"$NL\"]}}]}" >/dev/null
  nl() { curl -s -H "Authorization: Bearer $K" "$U/map/node?project=$SP&ref=$NL" | python3 -c "import json,sys
try: d=json.load(sys.stdin); c=d.get('checks') or {}; print('%s:%s/%s' % (d.get('state'),c.get('graded'),c.get('total')))
except Exception: print('unreadable')"; }
  NL3A=$(nl)
  GL3=$(tc "$EVALKEY" submit_grade "{\"project\":\"$SP\",\"checkId\":\"$CL\",\"verdict\":\"proven\",\"proof\":\"evals.sh E-LOOP3: GET /map/node answered 200\",\"eval\":true}" | jf counted)
  chk "E-LOOP3 a check -> a grade with proof -> the node lights (grey, 0 of 1 graded; counted; green, 1 of 1)" "grey:0/1|true|green:1/1" "$NL3A|$GL3|$(nl)"
else
  sk "E-LOOP1 missing -> file -> it closes (the LOCAL R only: a throwaway project's knowledge)"
  sk "E-LOOP2 a question -> answered -> ruled (the LOCAL R only: knowledge carries no eval mark)"
  sk "E-LOOP3 a check -> a grade -> the node lights (the LOCAL R only: its grade is an append-only row)"
fi

# --- E243c: the engine's clean-eval removes the suite's own marked rows (the flash counts them; >=1 report: E7's, E20's) ---
CLEAN243=$(curl -s -X POST -H "Authorization: Bearer $K" -d "action=clean-eval" "$U/control" | grep -o 'Eval residue cleaned[^.]*' | head -1)
chk "E243c clean-eval removes the suite's marked rows (its flash counts the reports)" "yes" "$(printf '%s' "$CLEAN243" | python3 -c "import re,sys;m=re.search(r'handoffs (\\d+)',sys.stdin.read());print('yes' if m and int(m.group(1))>=1 else 'no')")"
echo ""; echo "  $pass passed, $fail failed, $skip skipped"
write_last_run "evals"

# --- self-clean: the suite banks test artifacts + fires eval events every run.
# Remove them so the D1 never accumulates test junk (owner ruling S-016). ---
self_clean

[ "$fail" -eq 0 ]
