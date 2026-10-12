#!/bin/sh
# sims.sh — the persona walks (D5 Part 5, sprint 3: cut to a keep set, on the door's new names). Companion to evals.sh (the
# door's rules): each walk here is a person's whole loop end to end — file -> see it on a screen -> decide — asserted at
# three layers: the door's answer, the row read back (GET /contribution/:id, GET /decisions, GET /question/:qid), and the
# rendered screen that reads the same tables.
# WHAT IT PROVES NOW — a walk stays only when it proves one of the three loops (or a door write landing on the way) that no
# smoke case or offline selftest walks as a person on the screens:
#   S5   a leader files a ruling claimed on a question -> it routes to the owner -> the owner decides it, once (the row);
#   S9   Decisions: an owed question is open on the page -> a member answers (filed, still open) -> the owner rules it
#        through POST /questions/:qid/rule -> decided at once, on the JSON and on the page;
#   S10  Home: a contribution that waits on the owner is an approve row on Home -> the owner presses Approve (the form) ->
#        302 back to Home, the row gone, the contribution decided.
# THE ORG starts the way the smoke starts (tools/lib.sh suite_local_up): a FRESH local org every run, its fixtures
# (tools/suites/fixtures/) filed through preview then file — the walks read them (project sharingu; QSUITE3 the owner's
# question, QSUITE4 a question to claim a ruling on). Every row a walk files is eval-marked (tools/check-suite-marks.py).
# The footer keeps the output contract: the "N passed, N failed, N skipped" line, write_last_run, the self-clean.
#   sh sims.sh [--live] [--only <regex on the walk ids, e.g. 'S9|S10'>]   (--only: a slice — no last-run record is written)
SIMS_ONLY=""; _sp=""; for _sa in "$@"; do [ "$_sp" = "--only" ] && SIMS_ONLY="$_sa"; _sp="$_sa"; done
# The harness (the target, a fresh local org and its fixtures, the minted seats, chk/code/sk, self_clean) is ONE file:
# tools/lib.sh. Nothing harness-shaped lives in this file.
. "$(dirname "$0")/tools/lib.sh"
ENGINE_DIR="$(cd "$(dirname "$0")" && pwd)"
DOORPY="$ENGINE_DIR/tools/suites/door.py"
SP="${SUITE_PROJECT:-sharingu}"   # the fixtures' project (tools/suites/fixtures/sharingu.json)
REIN="$EVALKEY"     # the member seat ("Eval Seat") — a person's own Claude
VASU="$VASUKEY"     # the leader seat
[ -n "$VASU" ] || { VASU="$EVALKEY"; echo "  INFO  no leader seat this run — the leader's steps run as the member seat"; }
want() { [ -z "$SIMS_ONLY" ] || printf '%s' "$1" | grep -Eq -- "$SIMS_ONLY"; }
# tc <key> <tool> <arguments json> / pf <key> <preview arguments json> — the MCP door (tools/suites/door.py), as in evals.sh
tc() { DOOR_KEY="$1" U="$U" python3 "$DOORPY" tool "$2" "$3"; }
pf() { DOOR_KEY="$1" U="$U" python3 "$DOORPY" file "$2"; }
# jf <dotted.path> -> one field of the JSON on stdin ('' when absent; true/false lowercase; a dict or list as JSON)
jf() { python3 -c "import json,sys
try: v=json.load(sys.stdin)
except Exception: print(''); raise SystemExit
for k in sys.argv[1].split('.'):
    v=v[int(k)] if isinstance(v,list) and k.isdigit() and int(k)<len(v) else (v.get(k) if isinstance(v,dict) else None)
print('' if v is None else (str(v).lower() if isinstance(v,bool) else (json.dumps(v) if isinstance(v,(dict,list)) else v)))" "$1"; }
# qstatus <qid> -> "<status>:<choice>" of the fixtures' question on GET /decisions ('none' when the project holds no such qid)
qstatus() { curl -s -H "Authorization: Bearer $K" -H 'accept: application/json' "$U/decisions?project=$SP&eval=1" | Q="$1" python3 -c "import json,os,sys
try: r=[x for x in json.load(sys.stdin).get('rows') or [] if x.get('qid')==os.environ['Q']]; print('%s:%s' % (r[0].get('status'),r[0].get('choice')) if r else 'none')
except Exception: print('unreadable')"; }
H() { curl -s -H "Authorization: Bearer ${2:-$K}" -H 'accept: text/html' "$U$1"; }

echo "sharingu · the persona walks (sims)${SIMS_ONLY:+ — SLICE RUN on /$SIMS_ONLY/, not the close gate}"
echo ""

# =====================================================================================
# S5 — the leader (VASU): a ruling claimed on an open question (gapRefs q/QSUITE4) routes to the owner; the owner decides it
# approve; the row is closed and reads the decision; a second decision is refused 409. An eval-marked claim never rules the
# question itself (knowledge/decisions.js), so QSUITE4 stays open for the next run of a reused org.
# =====================================================================================
if want S5; then
echo "-- S5 the leader · a ruling claimed on a question -> the owner decides --"
if [ "$(qstatus QSUITE4)" = "none" ]; then
  for t in "S5a2 a ruling claimed on a question routes owner" "S5c owner decides approve" "S5d decided row closes" "S5e the row shows the decision" "S5f re-decide is refused (409)"; do skp "$t (no fixture question QSUITE4 on $SP: the fixtures are filed on the local org only)"; done
else
  B5="{\"project\":\"$SP\",\"eval\":true,\"items\":[{\"contribution\":{\"lane\":\"leader\",\"kind\":\"ruling\",\"what\":\"eval S5: the leader claims a ruling on QSUITE4\",\"why\":\"eval sim probe\",\"touches\":[\"decisions\"],\"gapRefs\":[\"q/QSUITE4\"]}}]}"
  S5T=$(pf "$VASU" "$B5")
  S5ID=$(printf '%s' "$S5T" | jf id)
  chk "S5a2 a ruling claimed on a question (gapRefs q/QSUITE4) files and routes owner" "file/owner" "$(printf '%s' "$S5T" | jf step)/$(printf '%s' "$S5T" | jf route)"
  S5D=$(curl -s -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d '{"verdict":"approve","note":"eval sim approval"}' "$U/contribution/$S5ID/decide")
  chk "S5c owner decides approve"     "approve" "$(printf '%s' "$S5D" | jf decision)"
  chk "S5d decided row closes"        "closed"  "$(printf '%s' "$S5D" | jf status)"
  chk "S5e the row shows the decision" "approve" "$(curl -s -H "Authorization: Bearer $K" "$U/contribution/$S5ID" | jf decision)"
  chk "S5f re-decide is refused (409)" 409 "$(code -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d '{"verdict":"reject"}' "$U/contribution/$S5ID/decide")"
fi
fi

# =====================================================================================
# S9 — Decisions (loop 2): the owner's question QSUITE3 is open on the Decisions page; the member answers it with an option
# (eval-marked: filed, never a ruling); the owner rules it through the REST twin of rule_question; decided at once on the
# JSON and on the page. A reused org (SUITE_LOCAL_KEEP=1) finds it already ruled and says so.
# =====================================================================================
if want S9; then
echo ""
echo "-- S9 Decisions · an owed question open on the page -> a member answers -> the owner rules -> decided at once --"
S9S=$(qstatus QSUITE3)
case "$S9S" in
  open:*)
    D9=$(H "/decisions?project=$SP&eval=1")
    chk "S9a the Decisions page and its JSON show QSUITE3 open" "open/yes" "$(printf '%s' "$S9S" | cut -d: -f1)/$(printf '%s' "$D9" | grep -q 'data-qid="QSUITE3" data-status="open"' && echo yes || echo no)"
    B9E="{\"qid\":\"QSUITE3\",\"option\":1,\"project\":\"$SP\",\"eval\":true}"
    R9E=$(curl -s -X POST -H "Authorization: Bearer $REIN" -H 'content-type: application/json' -d "$B9E" "$U/respond")
    N9E=$(curl -s -H "Authorization: Bearer $K" "$U/question/QSUITE3?project=$SP&eval=1" | python3 -c "import json,sys
try: print(len((json.load(sys.stdin).get('live') or {}).get('answers') or []))
except Exception: print('unreadable')")
    chk "S9e the member's answer (POST /respond, option B) files and leaves the question open, the answer on its card" "1/open/1" "$(printf '%s' "$R9E" | jf sent)/$(qstatus QSUITE3 | cut -d: -f1)/$N9E"
    B9F="{\"project\":\"$SP\",\"choice\":0,\"rationale\":\"eval S9: the walk rules option A\",\"eval\":true}"
    R9F=$(curl -s -w ' %{http_code}' -X POST -H "Authorization: Bearer $K" -H 'content-type: application/json' -d "$B9F" "$U/questions/QSUITE3/rule")
    P9F=$(H "/decisions?project=$SP&eval=1")
    chk "S9f the owner rules it (POST /questions/QSUITE3/rule -> 200): decided A on the next read, JSON and page" "200/decided:0/yes" "${R9F##* }/$(qstatus QSUITE3)/$(printf '%s' "$P9F" | grep -q 'data-qid="QSUITE3" data-status="decided"' && echo yes || echo no)"
    ;;
  # G2 (the review: an unreadable GET /decisions skipped S9 and sims exited 0): a skip is said only for what a run can meet —
  # --live has no fixture; a REUSED local org (SUITE_LOCAL_KEEP) may hold QSUITE3 decided; anything else is a failure
  none) if [ "$SUITE_TARGET" = "local" ]; then echo "  FAIL  S9 the fixture question QSUITE3 is not on the local org"; fail=$((fail+1))
        else for t in "S9a the Decisions page shows QSUITE3 open" "S9e the member's answer" "S9f the owner rules it"; do skp "$t (no fixture question QSUITE3 on $SP: the fixtures are filed on the local org only)"; done; fi ;;
  decided:*) for t in "S9a the Decisions page shows QSUITE3 open" "S9e the member's answer" "S9f the owner rules it"; do skp "$t (QSUITE3 reads $S9S: ruled by an earlier run on this reused org)"; done ;;
  *) echo "  FAIL  S9 QSUITE3 does not read (GET /decisions answered $S9S)"; fail=$((fail+1)) ;;
esac
fi

# =====================================================================================
# S10 — Home (the decide loop on glass): the member files a vendor scope (it always routes to the owner); the owner's Home
# draws it as an approve row with its Approve button; pressing Approve (the form: verdict, next) answers 302 back to Home,
# the row leaves Home, and the contribution reads decided approve.
# =====================================================================================
if want S10; then
echo ""
echo "-- S10 Home · a contribution waits on the owner -> an approve row on Home -> Approve pressed -> decided --"
B10="{\"project\":\"$SP\",\"eval\":true,\"items\":[{\"contribution\":{\"lane\":\"vendor\",\"kind\":\"scope\",\"what\":\"eval S10 Home approve probe\",\"why\":\"eval sim probe\",\"touches\":[\"ai-scope\"]}}]}"
V10R=$(pf "$REIN" "$B10")
V10=$(printf '%s' "$V10R" | jf id)
if [ -n "$V10" ] && [ "$(printf '%s' "$V10R" | jf route)" = "owner" ]; then
  HM10=$(H "/home?project=$SP&eval=1")
  chk "S10d Home draws $V10 as an approve row with its Approve button" "yes" "$(printf '%s' "$HM10" | V="$V10" python3 -c "import os,re,sys
h=sys.stdin.read(); m=re.search(r'<li [^>]*data-kind=\"approve\" data-id=\"'+re.escape(os.environ['V'])+r'\"[^>]*>(.*?)</li>',h,flags=re.S)
print('yes' if m and 'data-button=\"approve\"' in m.group(1) else 'no')")"
  A10=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -X POST -H "Authorization: Bearer $K" --data-urlencode "verdict=approve" --data-urlencode "next=/home?project=$SP&eval=1" "$U/contribution/$V10/decide")
  case "$A10" in *"/home?project=$SP"*) W10=home ;; *) W10="elsewhere" ;; esac   # never a case inside "$(...)": bash 3.2
  chk "S10e Approve -> 302 back to Home, the row leaves Home, and $V10 reads decided approve" "302/home/gone/approve" "$(printf '%s' "$A10" | cut -d' ' -f1)/$W10/$(H "/home?project=$SP&eval=1" | grep -q "data-id=\"$V10\"" && echo still || echo gone)/$(curl -s -H "Authorization: Bearer $K" "$U/contribution/$V10" | jf decision)"
else
  bad "S10d/e Home: the vendor scope did not file routed owner ($(printf '%s' "$V10R" | head -c 200))"
fi
fi

echo ""; echo "  $pass passed, $fail failed, $skip skipped"
if [ -z "$SIMS_ONLY" ]; then write_last_run "sims"; else echo "SLICE RUN — not the close gate (no last-run record written)"; fi

# --- self-clean: every row a walk filed is eval-marked; clean-eval and the SQL belt remove them (owner ruling S-016) ---
self_clean

[ "$fail" -eq 0 ]
