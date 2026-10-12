#!/bin/sh
# tools/tabs-verify.sh [--live] [--only <regex on the walk names: anonymous|owner|contributor|leader>] — the console's tabs as
# REAL browser sessions (D5 Part 5, sprint 3: cut to a keep set).
# WHAT IT PROVES NOW — authentication and authorization at the real doors, as a browser meets them:
#   · anonymous: the public set only (What is missing, Docs) and the rail's Sign in; a gated page sends the browser to sign-in;
#   · the owner, a contributor (the member seat) and a leader each sign in at the platform's POST /login (302, a session
#     cookie; next = the org's address) and walk EVERY destination of the rail on that cookie under the org's address
#     (/<org>/…, sprint 7, 7.4: the cookie signs in only there): each answers 200 and lights itself; the rail is the eight for
#     every seated reader (Control included); /audit lights Control;
#   · the contributor's session cannot press an admin control: POST /control set-role is refused 403 by the door itself.
# What a page draws (its regions, its copy, its view bar) is tools/smoke.sh's (the look cases) and the selftests'; the
# project scoping across two projects is the smoke's (R5, the authority cases). Nothing here pins page text.
# THE ORG starts the way the smoke starts (tools/lib.sh suite_local_up): a fresh local org, its fixtures
# (tools/suites/fixtures/) filed through preview then file. The seats are minted by tools/lib-mint-seat.sh into the suites'
# own org (sprint 6: its MINT_OWNER_EMAIL, RYUKLABS_EVALSEAT_EMAIL and MINT_LEADER_EMAIL are who signs in; a fixed seat's
# passphrase IS its key for the run); nothing is read from disk; a passphrase never rides argv. --live: the hosted worker,
# after tools/cf-budget.sh. The output contract: PASS/FAIL/SKIP lines, "tabs-verify: N passed, N failed, N skipped", and
# .runs/tabs-verify.json (written only by a full walk, never by an --only slice).
TV_ONLY=""; _tp=""; for _ta in "$@"; do [ "$_tp" = "--only" ] && TV_ONLY="$_ta"; _tp="$_ta"; done
. "$(dirname "$0")/lib.sh"
set -u
UA="agent-r-verify/1.0"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; suite_exit' EXIT INT TERM
R="$U"
[ -n "$R" ] || { echo "  ✗ no target: the mint did not resolve the R's URL (see above)"; exit 1; }
echo "  (tabs-verify target: $SUITE_TARGET — $R)${TV_ONLY:+ — SLICE RUN on /$TV_ONLY/, not the close gate}"
# THE ORG'S ADDRESS (sprint 7, 7.4: each org's pages at /<org>/…; a session cookie signs in only there, never at the root): the
# suites' org's path name, read off a page its own key reads at the root (<html data-org-base="/<org>">, the shell's), never from
# where a sign-in lands (an account in several orgs lands on the org picker, 7.4b). Every seated request below goes under it;
# the sign-in, the sign-out and the anonymous walk stay at the platform's root.
SLUG=$(curl -s -A "$UA" -H "Authorization: Bearer $K" -H "Accept: text/html" "$R/home" | sed -n 's/.*<html[^>]* data-org-base="\/\([a-z0-9-]*\)".*/\1/p' | head -1)
[ -n "$SLUG" ] || { echo "  ✗ the suites' org's address: no data-org-base on its own /home (the key's page at the root)"; exit 1; }
A="/$SLUG"
echo "  (the org's address: $A — every seated page under it)"
BF="$TMP/body.html"
pass=0; fail=0; skip=0
pass_() { echo "  PASS  $1"; pass=$((pass+1)); }
fail_() { echo "  FAIL  $1"; fail=$((fail+1)); }
sk_()   { echo "  SKIP  $1"; skip=$((skip+1)); }
chk_code() { if [ "$2" = "$3" ]; then pass_ "$1"; else fail_ "$1 (want $2 got $3)"; fi; }
want() { [ -z "$TV_ONLY" ] || printf '%s' "$1" | grep -Eq -- "$TV_ONLY"; }
EIGHT="Home Build GTM Goals Decisions Map Broadcast Control"

# ---- HTTP: one cookie jar per persona, the UA always set ----
fetch() { curl -s -A "$UA" -H "Accept: text/html" -H "Sec-Fetch-Dest: document" -b "$1" -c "$1" -o "$3" -w '%{http_code}' "$R$2"; }
page() { curl -s -A "$UA" -H "Accept: text/html" -H "Sec-Fetch-Dest: document" -b "$1" -c "$1" "$R$2"; }
status_of() { curl -s -A "$UA" -b "$1" -o /dev/null -w '%{http_code}' "$R$2"; }
location_of() { curl -s -A "$UA" -H "Accept: text/html" -H "Sec-Fetch-Dest: document" -b "$1" -D - -o /dev/null "$R$2" | grep -i '^location:' | head -1 | sed -E 's/^[Ll]ocation:[[:space:]]*//' | tr -d '\r'; }
login() { # login <jar> <email> <passphrase> -> the POST's http code (302 on a good sign-in; the cookie lands in <jar>)
  pf=$(mktemp "$TMP/pw.XXXXXX"); chmod 600 "$pf"; printf '%s' "$3" > "$pf"
  curl -s -o /dev/null -w '%{http_code}' -A "$UA" -c "$1" --data-urlencode "email=$2" \
    --data-urlencode "password@$pf" --data-urlencode "web=1" --data-urlencode "next=$A/home" "$R/login"
  rm -f "$pf"
}

# ---- the rail, read by its semantic hooks (data-region="tabs", each <a data-tab>, the current one aria-current="true") ----
# rail <html> -> one line per destination: "<label>\t<href>" (the data-badge count is not part of a label)
rail() { python3 -c '
import sys, re
h = sys.stdin.read()
m = re.search(r"<nav\b[^>]*data-region=\"tabs\"[^>]*>(.*?)</nav>", h, re.S)
lbl = lambda x: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"<span\b[^>]*data-badge[^>]*>.*?</span>", "", x, flags=re.S))).strip()
for attrs, inner in (re.findall(r"<a\b([^>]*\sdata-tab=\"[^\"]+\"[^>]*)>(.*?)</a>", m.group(1), re.S) if m else []):
    href = (re.search(r"\shref=\"([^\"]*)\"", attrs) or [None, ""])[1]
    print(lbl(inner) + "\t" + href.replace("&amp;", "&"))'; }
toptabs() { rail | cut -f1 | tr '\n' ' ' | sed 's/ $//'; }
toptab_active() { python3 -c '
import sys, re
m = re.search(r"<a\b[^>]*\sdata-tab=\"[^\"]+\"[^>]*aria-current=\"true\"[^>]*>(.*?)</a>", sys.stdin.read(), re.S)
lbl = lambda x: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"<span\b[^>]*data-badge[^>]*>.*?</span>", "", x, flags=re.S))).strip()
print(lbl(m.group(1)) if m else "")'; }

signin() { # signin <who> <jar> <email> <key>: 0 when the session is up
  : > "$2"
  # G2 (the review: a seat minted with no key skipped the whole walk and the suite exited 0): locally every seat is minted on
  # the fresh org, so a missing key is a failure; only a live run may lack one
  if [ -z "$4" ]; then if [ "$SUITE_TARGET" = "local" ]; then fail_ "$1 walk: no seat was minted on the local org (see the mint line above)"; else sk_ "$1 walk (no seat minted — see the mint line above)"; fi; return 1; fi
  lc=$(login "$2" "$3" "$4")
  if [ "$lc" != "302" ]; then fail_ "$1 signs in at the org's own /login -> 302 (got $lc)"; return 1; fi
  pass_ "$1 signs in at the org's own /login -> 302 (a session cookie)"
  sc=$(status_of "$2" "$A/home"); chk_code "$1 $A/home on the session -> 200" 200 "$sc"
  [ "$sc" = "200" ]
}
# walk_rail <who> <jar>: the rail is the eight; every destination answers 200 on the session and lights itself
walk_rail() {
  who="$1"; jar="$2"
  page "$jar" "$A/home" | rail > "$TMP/rail.tsv"
  tt=$(cut -f1 "$TMP/rail.tsv" | tr '\n' ' ' | sed 's/ $//')
  if [ "$tt" = "$EIGHT" ]; then pass_ "$who rail == [$EIGHT] (every seated reader, Control included)"; else fail_ "$who rail got [$tt] want [$EIGHT]"; fi
  while IFS="$(printf '\t')" read -r lbl href; do
    [ -z "$href" ] && { fail_ "$who $lbl: no href on the rail"; continue; }
    sc=$(fetch "$jar" "$href" "$BF"); act=$(toptab_active < "$BF")
    if [ "$sc" = "200" ] && [ "$act" = "$lbl" ]; then pass_ "$who $lbl $href -> 200, lit"; else fail_ "$who $lbl $href -> $sc, current tab [$act] (want 200 and [$lbl])"; fi
  done < "$TMP/rail.tsv"
}

# ================= ANONYMOUS: the public read set =================
AJ="$TMP/anon.jar"; : > "$AJ"
if want anonymous; then
  echo "== anonymous =="
  sc=$(fetch "$AJ" /docs "$BF"); body=$(cat "$BF")
  chk_code "anonymous /docs -> 200" 200 "$sc"
  tt=$(printf '%s' "$body" | toptabs)
  if [ "$tt" = "What is missing Docs" ]; then pass_ "anonymous rail == [What is missing Docs] (the public set only)"; else fail_ "anonymous rail got [$tt] want [What is missing Docs]"; fi
  if printf '%s' "$body" | grep -qF 'data-region="avatar" href="/login"'; then pass_ "anonymous rail offers Sign in (to /login)"; else fail_ "anonymous rail offers no Sign in"; fi
  chk_code "anonymous /missing -> 200" 200 "$(fetch "$AJ" /missing "$BF")"
  loc=$(location_of "$AJ" /home)
  case "$loc" in */login*) pass_ "anonymous /home -> the sign-in ($loc)" ;; *) fail_ "anonymous /home did not send to the sign-in (got [$loc])" ;; esac
fi

# ================= OWNER =================
OJ="$TMP/owner.jar"; : > "$OJ"
if want owner; then
  echo "== owner (the fixed eval owner seat, this run's key) =="
  if signin owner "$OJ" "$MINT_OWNER_EMAIL" "$K"; then
    walk_rail owner "$OJ"
    sc=$(fetch "$OJ" "$A/audit" "$BF"); act=$(toptab_active < "$BF")
    if [ "$sc" = "200" ] && [ "$act" = "Control" ]; then pass_ "owner /audit -> 200, lights Control (Control's audit trail)"; else fail_ "owner /audit -> $sc, current tab [$act] (want 200 / Control)"; fi
  fi
fi

# ================= CONTRIBUTOR =================
CJ="$TMP/contrib.jar"; : > "$CJ"
if want contributor; then
  echo "== contributor (the fixed eval member seat) =="
  if signin contributor "$CJ" "$RYUKLABS_EVALSEAT_EMAIL" "$EVALKEY"; then
    walk_rail contributor "$CJ"
    chk_code "contributor POST /control set-role on its session -> 403 (the door refuses an admin control)" 403 "$(curl -s -A "$UA" -o /dev/null -w '%{http_code}' -b "$CJ" -H 'Sec-Fetch-Site: same-origin' -H "Origin: $R" -X POST --data-urlencode "action=set-role" --data-urlencode "personId=none" --data-urlencode "role=admin" "$R$A/control")"
  fi
fi

# ================= LEADER =================
LJ="$TMP/leader.jar"; : > "$LJ"
if want leader; then
  echo "== leader (the fixed eval leader seat) =="
  if signin leader "$LJ" "$MINT_LEADER_EMAIL" "$VASUKEY"; then
    walk_rail leader "$LJ"
  fi
fi

for j in "$OJ" "$CJ" "$LJ"; do [ -s "$j" ] && curl -s -o /dev/null -A "$UA" -b "$j" "$R/logout"; done

echo ""
echo "tabs-verify: $pass passed, $fail failed, $skip skipped"
# durable record of a FULL walk (tools/ready.mjs's freshness check: a record from an older engine commit than HEAD is stale)
if [ -z "$TV_ONLY" ]; then
  _commit="$(cd "$(dirname "$0")/.." && git rev-parse HEAD 2>/dev/null || echo unknown)"
  mkdir -p "$(dirname "$0")/../.runs" 2>/dev/null
  printf '{"suite":"tabs-verify","target":"%s","passed":%s,"failed":%s,"skipped":%s,"commit":"%s","at":"%s"}\n' \
    "$SUITE_TARGET" "$pass" "$fail" "$skip" "$_commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$(dirname "$0")/../.runs/tabs-verify.json" 2>/dev/null
fi
[ "$fail" -eq 0 ]
