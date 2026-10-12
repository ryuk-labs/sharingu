#!/bin/sh
# tools/gate-rehearsal.sh — the LOCAL rehearsal of the seven gate lines of docs/plan/BETA.md, as one command that prints a
# table: line · what was checked · ✓ / ✗ / live only · the evidence. It never touches live (a non-local <url> is refused)
# and never skips silently: what only live (or a person, or a slice not built yet) can prove is a row of its own.
#
#   sh tools/gate-rehearsal.sh <url> --creds <credentials.env> [--projects a,b,c,d,e] [--engine <dir>] [--state <dir>]
#        [--port <N>] [--restore-port <N>] [--source-dir <org dir>] [--out <dir>] [--keep-org]
#
#   <url> --creds   the five-project org (the ship candidate): READ there, and only read — the project audit, the MCP's
#                   first answers, Connect, the sign-in rule on a sample of doors, tools/page-budget.mjs (read-only: line 4),
#                   the backup's pages (line 5: POST /backup-dump?page= writes nothing). Never the walk.
#   --restore-port  the port of the RESTORED org (line 5: tools/restore-local.mjs; default the first free of 8871–8879 after
#                   --port); --source-dir the <url> org's local state dir (<root>/<slug>): the restore then shares its bucket
#                   (render bodies byte for byte) and compares the derived tables with its D1 file
#   --projects      the five (default sharingu,ryuklabs,siru,saruspay,bunny)
#   --engine        the engine copy whose tools/r-local.sh starts the FRESH org and whose page-budget, project-audit and
#                   day0-verify are run (default: this checkout's engine; pass a frozen copy while builders edit the tree)
#   --state --port  where and on which port the fresh org lives (default <engine>/.runs/gate-rehearsal/state, the first
#                   free port of 8871–8879)
#   --out           the evidence folder (default .runs/gate-rehearsal/<UTC stamp>/ under this engine)
#   --keep-org      leave the fresh org running (it is stopped by default)
#
# The FRESH org (a stranger's install in local mode, docs/INSTALL.md §4) carries everything that writes: gate line 7's
# first run (no project: the door points at create_project), line 1's walk (tools/live-walk.mjs, two people, a throwaway
# project, removed after), line 5's backup dump, then create_project and tools/day0-verify.sh.
set -u
SELF=$(cd "$(dirname "$0")/.." && pwd)
usage() { echo "usage: sh tools/gate-rehearsal.sh <url> --creds <credentials.env> [--projects a,b,…] [--engine <dir>] [--state <dir>] [--port <N>] [--out <dir>] [--keep-org]" >&2; exit 2; }
[ $# -ge 1 ] || usage
URL=$(printf '%s' "$1" | sed 's:/*$::'); shift
CREDS=""; PROJECTS="sharingu,ryuklabs,siru,saruspay,bunny"; ENGINE="$SELF"; STATE=""; PORT=""; OUT=""; KEEP=0; RPORT=""; SRCDIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --creds) CREDS="$2"; shift 2 ;;
    --projects) PROJECTS="$2"; shift 2 ;;
    --engine) ENGINE=$(cd "$2" && pwd); shift 2 ;;
    --state) STATE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --restore-port) RPORT="$2"; shift 2 ;;
    --source-dir) SRCDIR=$(cd "$2" && pwd); shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --keep-org) KEEP=1; shift ;;
    *) usage ;;
  esac
done
[ -n "$CREDS" ] && [ -f "$CREDS" ] || { echo "✗ --creds <credentials.env> is required and must exist" >&2; exit 2; }
CREDS="$(cd "$(dirname "$CREDS")" && pwd)/$(basename "$CREDS")"
case "$URL" in
  http://127.*|http://localhost*|http://0.0.0.0*|http://\[::1\]*) ;;
  *) echo "✗ $URL is not local: the gate rehearsal never touches live (the gate on live is a separate run)" >&2; exit 2 ;;
esac
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
[ -n "$OUT" ] || OUT="$SELF/.runs/gate-rehearsal/$STAMP"
[ -n "$STATE" ] || STATE="$ENGINE/.runs/gate-rehearsal/state"
mkdir -p "$OUT" "$STATE"
OUT=$(cd "$OUT" && pwd); STATE=$(cd "$STATE" && pwd)
TABLE="$OUT/table.tsv"; : > "$TABLE"
KEY=$(sed -n 's/^[A-Z0-9_]*_AGENT_R_OWNER_KEY=\(.*\)$/\1/p' "$CREDS" | head -1)
[ -n "$KEY" ] || { echo "✗ no *_AGENT_R_OWNER_KEY line in $CREDS" >&2; exit 2; }
WRANGLER_SEND_METRICS=false; export WRANGLER_SEND_METRICS

row() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$TABLE"; printf '  %-3s %-11s %s\n' "$1" "$3" "$2"; }
# jget <file> <js expression over d> — one value out of a JSON file (prints "" when it cannot)
jget() { node -e 'const fs=require("fs");let d;try{const t=fs.readFileSync(process.argv[1],"utf8");try{d=JSON.parse(t)}catch{d=JSON.parse((t.split("\n").find(l=>l.startsWith("data: "))||"").slice(6))}}catch{process.stdout.write("");process.exit(0)}try{const v=(new Function("d","return ("+process.argv[2]+")"))(d);process.stdout.write(v===undefined||v===null?"":typeof v==="string"?v:JSON.stringify(v))}catch(e){process.stdout.write("")}' "$1" "$2"; }
mcp() { # mcp <url> <key> <json-rpc body> -> the JSON answer
  curl -s -m 30 -X POST "$1/mcp" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer $2" -d "$3"; }
code() { curl -s -m 30 -o /dev/null -w '%{http_code}' "$@"; }

load=$(uptime | sed 's/.*load averages*: *//' | awk -F'[ ,]+' '{print int($1)}')
echo "sharingu · the local gate rehearsal · $URL (read only) · a fresh org from $ENGINE · evidence $OUT"
[ "$load" -lt 8 ] || echo "  · the Mini's load is $load (over 8): the rehearsal runs one tool at a time and may be slow"

# ---------------- the fresh org (lines 7, 1, 5 write there) ----------------
SLUG="gate-$(date -u +%H%M%S)"
if [ -z "$PORT" ]; then for p in 8871 8872 8873 8874 8875 8876 8877 8878 8879; do lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || { PORT=$p; break; }; done; fi
[ -n "$PORT" ] || { echo "✗ no free port in 8871–8879 for the fresh org" >&2; exit 1; }
FRESH="http://127.0.0.1:$PORT"; FDIR="$STATE/$SLUG"
stop_org() { [ "$KEEP" = "1" ] || (cd "$ENGINE" && R_LOCAL_STATE_ROOT="$STATE" sh tools/r-local.sh down "$SLUG" >/dev/null 2>&1) || true; }
trap stop_org EXIT INT TERM
echo "· starting a fresh org $SLUG on $FRESH (tools/r-local.sh, local mode: no project, one owner)"
(cd "$ENGINE" && R_LOCAL_STATE_ROOT="$STATE" sh tools/r-local.sh up "$SLUG" --port "$PORT") > "$OUT/fresh-org.log" 2>&1
FKEY=$(sed -n 's/^[A-Z0-9_]*_AGENT_R_OWNER_KEY=\(.*\)$/\1/p' "$FDIR/credentials.env" 2>/dev/null | head -1)
FEMAIL=$(cat "$FDIR/owner.email" 2>/dev/null)
[ -n "$FKEY" ] && [ "$(code "$FRESH/health")" = "200" ] || { echo "✗ the fresh org did not come up — $OUT/fresh-org.log"; tail -5 "$OUT/fresh-org.log"; exit 1; }
echo ""
printf '  %-3s %-11s %s\n' "#" "result" "what was checked"

# ---------------- line 7a: a stranger's first run leads to create_project ----------------
mcp "$FRESH" "$FKEY" '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"gate-rehearsal","version":"1"}}}' > "$OUT/fresh-initialize.json"
mcp "$FRESH" "$FKEY" '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"whoami","arguments":{}}}' > "$OUT/fresh-whoami.json"
mcp "$FRESH" "$FKEY" '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"missing","arguments":{}}}' > "$OUT/fresh-missing.json"
I7=$(jget "$OUT/fresh-initialize.json" '/create_project/.test(d.result.instructions)')
W7=$(jget "$OUT/fresh-whoami.json" '((j)=>(j.projects||[]).length===0&&/create_project/.test(j.projectGloss))(JSON.parse(d.result.content[0].text))')
H7=$(jget "$OUT/fresh-missing.json" 'JSON.parse(d.result.content[0].text).fillPath.tool')
if [ "$I7" = "true" ] && [ "$W7" = "true" ] && [ "$H7" = "create_project" ]; then r=✓; else r=✗; fi
row 7 "a fresh org's first run (no project): initialize, whoami and missing each lead to create_project (init $I7, whoami $W7, missing → $H7)" "$r" "$OUT/fresh-initialize.json, fresh-whoami.json, fresh-missing.json"

# ---------------- line 1: the walk, two people, on the fresh org ----------------
node "$SELF/tools/live-walk.mjs" --url "$FRESH" --creds "$FDIR/credentials.env" --json "$OUT/walk.json" > "$OUT/walk.log" 2>&1; WALK_RC=$?
WP=$(jget "$OUT/walk.json" 'd.passed+" of "+d.total')
WF=$(jget "$OUT/walk.json" 'd.steps.filter(s=>!s.ok).map(s=>s.id).join(",")')
if [ "$WALK_RC" = "0" ]; then r=✓; else r=✗; fi
row 1 "the member path: tools/live-walk.mjs (an admin and a new member, a throwaway project, removed after): $WP steps${WF:+; failed: $WF} (exit $WALK_RC)" "$r" "$OUT/walk.log, $OUT/walk.json"
row 1 "the member path once by hand (the owner)" "by hand" "BETA.md Stage C step 5"
row 1 "the walk on live" "live only" "node tools/live-walk.mjs --url <live> --creds <file> --live (cf-budget first)"

# ---------------- line 2: the five projects, their atlas, each meter true ----------------
(cd "$ENGINE" && node tools/audit/project-audit.mjs --url "$URL" --creds "$CREDS" --projects "$PROJECTS" --out "$OUT/audit.json") > "$OUT/audit.log" 2>&1; AUD_RC=$?
[ -s "$OUT/audit.json" ] || row 2 "tools/audit/project-audit.mjs did not run to its end (exit $AUD_RC): $(tail -1 "$OUT/audit.log")" "✗" "$OUT/audit.log"
for p in $(printf '%s' "$PROJECTS" | tr ',' ' '); do
  [ -s "$OUT/audit.json" ] || break
  PRESENT=$(jget "$OUT/audit.json" "(d.org.projects||[]).includes('$p')")
  HIGH=$(jget "$OUT/audit.json" "((d.projects.find(x=>x.project==='$p')||{}).findings||[]).filter(f=>f.sev==='high').map(f=>f.what).join(' | ')")
  MTRUE=$(jget "$OUT/audit.json" "((x)=>x&&x.meterTrue?x.meterTrue.every(m=>m.same):false)(d.projects.find(x=>x.project==='$p'))")
  METER=$(jget "$OUT/audit.json" "((d.projects.find(x=>x.project==='$p')||{}).meter||{}).words")
  ATLAS=$(jget "$OUT/audit.json" "((a)=>a?(a.surfaces.length?a.surfaces.length+' app(s), '+a.renders.ok+' of '+a.renders.checked+' renders ok, '+a.renders.missingBody+' missing':'no screens'):'?')((d.projects.find(x=>x.project==='$p')||{}).atlas)")
  if [ "$AUD_RC" = "0" ] && [ "$PRESENT" = "true" ] && [ -z "$HIGH" ] && [ "$MTRUE" = "true" ]; then r=✓; else r=✗; fi
  row 2 "$p: present ${PRESENT:-?}; meter ${METER:-?}, true to the data: ${MTRUE:-?}; atlas ${ATLAS}; [high]: ${HIGH:-none}" "$r" "$OUT/audit.log"
done
row 2 "the five projects on live, each with its atlas" "live only" "after the ship's import (HANDOFF G5)"

# ---------------- line 3: the three clients ----------------
mcp "$URL" "$KEY" '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"gate-rehearsal","version":"1"}}}' > "$OUT/initialize.json"
mcp "$URL" "$KEY" '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' > "$OUT/tools-list.json"
PV=$(jget "$OUT/initialize.json" 'd.result.protocolVersion'); NT=$(jget "$OUT/tools-list.json" 'd.result.tools.length')
if [ -n "$PV" ] && [ "${NT:-0}" -gt 0 ]; then r=✓; else r=✗; fi
row 3 "the MCP's first answers: initialize (protocol $PV) and tools/list ($NT tools)" "$r" "$OUT/initialize.json, $OUT/tools-list.json"
curl -s -m 30 -H "Authorization: Bearer $KEY" -H 'accept: text/html' "$URL/control" > "$OUT/control.html"
NB=$(grep -o 'data-client-block="[a-z-]*"' "$OUT/control.html" | sort -u | tr '\n' ' ')
CMD=$(sed 's/&quot;/"/g;s/&lt;/</g;s/&gt;/>/g' "$OUT/control.html" | grep -o "claude mcp add [^ ]* --transport http [^ ]*/mcp" | head -1)
case "$CMD" in *" $URL/mcp") okcmd=1 ;; *) okcmd=0 ;; esac
if [ "$okcmd" = "1" ] && [ "$(printf '%s' "$NB" | wc -w | tr -d ' ')" -ge 4 ]; then r=✓; else r=✗; fi
row 3 "Control · Connect shows a setup per client ($NB) and Claude Code's command names this org's /mcp ('$CMD')" "$r" "$OUT/control.html"
TWO=$(jget "$OUT/walk.json" 'd.steps.find(s=>s.id==="e").ok'); TXT=$(jget "$OUT/walk.json" '((s)=>{const c=s.calls.find(c=>c.tool==="preview"&&c.answer&&c.answer.result);if(!c)return "?";const t=JSON.parse(c.answer.result.content[0].text).text||"";const l=t.split("\n");return l.length+" lines, widest "+Math.max(...l.map(x=>x.length))})(d.steps.find(s=>s.id==="e"))')
if [ "$TWO" = "true" ]; then r=✓; else r=✗; fi
row 3 "the two-call fallback (preview, then file) end to end, and the preview's terminal text ($TXT): the walk's step e" "$r" "$OUT/walk.json"
# sprint 3, D3: the confirm (elicitation) and the card (MCP Apps) through a minimal MCP client, on the FRESH org (it writes:
# its own eval project, archived after): the session ids, the stream, accept/decline/cancel/timeout, the attacks, the OAuth
# path, the ui:// document and the card's fragment (tools/mcp-client-selftest.mjs)
node "$SELF/tools/mcp-client-selftest.mjs" --url "$FRESH" --creds "$FDIR/credentials.env" --json "$OUT/client.json" > "$OUT/client.log" 2>&1; CRC=$?
CP=$(jget "$OUT/client.json" 'd.passed'); CF=$(jget "$OUT/client.json" 'd.failed')
if [ "$CRC" = "0" ]; then r=✓; else r=✗; fi
row 3 "the confirm (elicitation) and the card (MCP Apps) through a minimal MCP client: tools/mcp-client-selftest.mjs on the fresh org (${CP:-?} passed, ${CF:-?} failed, exit $CRC)" "$r" "$OUT/client.log, $OUT/client.json"
row 3 "Claude Code: connected with Connect's command; the inline render shown, the confirm prompt (preview fileOnConfirm) answered yes and no, filed from a real session" "by hand" "claude mcp add … (BETA.md Stage C step 3; the D3 report's steps)"
row 3 "Claude desktop or web: the custom connector (OAuth sign-in) and the card drawn in the chat, its File press" "live only" "needs the org on a public https URL; the card itself is proven in Chrome by tools/card-shots.mjs"
row 3 "a tools-only client (Codex or ChatGPT) through the two-call fallback" "live only" "a real client connected to live; locally proven by the walk's step e"

# ---------------- line 4: inside the free tier ----------------
(cd "$ENGINE" && BUDGET_URL="$URL" BUDGET_CREDS="$CREDS" BUDGET_JSON="$OUT/budget.json" node tools/page-budget.mjs $(printf '%s' "$PROJECTS" | tr ',' ' ')) > "$OUT/budget.log" 2>&1; BUD_RC=$?
WORST=$(jget "$OUT/budget.json" '(()=>{let w={read:-1};for(const [p,loads] of Object.entries(d))for(const [l,v] of Object.entries(loads||{}))if(v&&typeof v.read==="number"&&v.read>w.read)w={p,l,read:v.read};return w.p+" "+w.l+" "+w.read})()')
OVER=$(jget "$OUT/budget.json" '(()=>{const o=[];for(const [p,loads] of Object.entries(d))for(const [l,v] of Object.entries(loads||{}))if(v&&v.read>1500)o.push(p+" "+l+" "+v.read);return o.join(" | ")})()')
WR=$(jget "$OUT/budget.json" '(()=>{let n=0;for(const loads of Object.values(d))for(const v of Object.values(loads||{}))n+=(v&&v.written)||0;return n})()')
[ -s "$OUT/budget.json" ] || WORST="(tools/page-budget.mjs did not run to its end: $(tail -1 "$OUT/budget.log"))"
if [ "$BUD_RC" = "0" ] && [ -z "$OVER" ] && [ -s "$OUT/budget.json" ]; then r=✓; else r=✗; fi
row 4 "every screen and MCP read of the five projects under 1,500 rows (tools/page-budget.mjs, read-only, exit $BUD_RC): worst $WORST; over: ${OVER:-none}; rows written by the run: ${WR:-?}" "$r" "$OUT/budget.log, $OUT/budget.json"
WROWS=$(jget "$OUT/walk.json" 'd.totals.read+" read, "+d.totals.written+" written in "+d.totals.requests+" requests ("+(100*d.totals.read/5e6).toFixed(3)+"% and "+(100*d.totals.written/1e5).toFixed(2)+"% of a free day)"')
row 4 "the walk's own cost, from the worker's d1-rows header: $WROWS" "✓" "$OUT/walk.json totals"
row 4 "a full day of the walk plus normal use under half of every daily limit" "live only" "sh tools/cf-budget.sh after a day on live (BETA.md Stage C step 4)"
row 4 "the 10 ms CPU and 50 subrequests a request (not enforced locally)" "live only" "the heavy pages and the import on the preview (BETA.md, known risks)"

# ---------------- line 5: safe ----------------
# the backup's rule, off its first page on the five-project org (a page reads one table's rows and writes nothing)
curl -s -m 60 -X POST -H "Authorization: Bearer $KEY" "$URL/backup-dump?page=&rows=1" > "$OUT/backup-rule.json"
DUMPED=$(jget "$OUT/backup-rule.json" 'Object.keys(d.rule.dumped).sort().join(" ")')
PLACED=$(jget "$OUT/backup-rule.json" '[...Object.keys(d.rule.dumped),...Object.keys(d.rule.derived),...Object.keys(d.rule.never)].sort().join(" ")')
CREDW=$(jget "$OUT/backup-rule.json" 'd.rule.credentials')
BOOT=$(grep -oiE "CREATE TABLE (IF NOT EXISTS )?[a-z_0-9]+" "$ENGINE/boot.sql" | awk '{print $NF}' | sort -u | tr '\n' ' ')
KN=$(grep -oE 'table: "k_[a-z_]+"' "$ENGINE/src/knowledge/schema.js" | sed 's/table: "//;s/"//' | sort -u | tr '\n' ' ')
MISS_K=""; for t in $KN k_options k_versions k_snapshots check_results projects project_seats transmission people org; do case " $DUMPED " in *" $t "*) ;; *) MISS_K="$MISS_K $t" ;; esac; done
UNPLACED=""; for t in $BOOT; do case " $PLACED " in *" $t "*) ;; *) UNPLACED="$UNPLACED $t" ;; esac; done
{ echo "dumped: $DUMPED"; echo "placed (dumped, derived, never): $PLACED"; echo "boot.sql: $BOOT"; echo "unplaced:$UNPLACED"; echo "knowledge and grades missing:$MISS_K"; echo "credentials: $CREDW"; } > "$OUT/backup-tables.txt"
if [ -n "$DUMPED" ] && [ -z "$MISS_K" ] && [ -z "$UNPLACED" ]; then r=✓; else r=✗; fi
row 5 "POST /backup-dump (the owner's; page by page, nothing written): $(printf '%s' "$DUMPED" | wc -w | tr -d ' ') tables dumped, every boot.sql table placed (unplaced:${UNPLACED:- none}); the knowledge, the grades, projects, seats, people, the org: missing${MISS_K:- none}; credentials: ${CREDW:-?}" "$r" "$OUT/backup-rule.json, $OUT/backup-tables.txt"
# the restore, rehearsed: the whole dump through the door, a fresh org from boot.sql, verified table by table and door by door
RSLUG=$(sed -n 's/^\([A-Z0-9_]*\)_AGENT_R_OWNER_KEY=.*$/\1/p' "$CREDS" | head -1 | tr 'A-Z_' 'a-z-')
if [ -z "$RPORT" ]; then for p in 8871 8872 8873 8874 8875 8876 8877 8878 8879; do [ "$p" = "$PORT" ] && continue; lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || { RPORT=$p; break; }; done; fi
RSRC=""; if [ -n "$SRCDIR" ]; then
  SDB=$(ls -S "$SRCDIR"/persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite 2>/dev/null | grep -v metadata | head -1)
  RSRC="--r2-from $SRCDIR${SDB:+ --source-db $SDB}"
fi
(cd "$SELF" && node tools/restore-local.mjs dump --url "$URL" --creds "$CREDS" --out "$OUT/dump.json" --slug "$RSLUG") > "$OUT/restore.log" 2>&1
# shellcheck disable=SC2086
(cd "$SELF" && node tools/restore-local.mjs restore "$OUT/dump.json" --into "$OUT/restore" --slug "$RSLUG" --port "$RPORT" $RSRC --source-url "$URL" --source-creds "$CREDS" --report "$OUT/restore.json") >> "$OUT/restore.log" 2>&1; RST_RC=$?
RSUM=$(jget "$OUT/restore.json" 'd.checks.filter(c=>c.ok).length+" of "+d.checks.length+" checks, "+Object.values(d.tables||{}).reduce((n,t)=>n+t.restored,0)+" rows in "+Object.keys(d.tables||{}).length+" tables, "+(d.ms/1000).toFixed(0)+" s"')
RBAD=$(jget "$OUT/restore.json" 'd.checks.filter(c=>!c.ok).map(c=>c.what+(c.detail?": "+c.detail:"")).join(" | ")')
if [ "$RST_RC" = "0" ]; then r=✓; else r=✗; fi
row 5 "a restore rehearsed on the local app (tools/restore-local.mjs: the dump through the door, a fresh org from boot.sql on :$RPORT, verified table by table and through both doors): ${RSUM:-did not run}${RBAD:+; failed: $RBAD} (exit $RST_RC)" "$r" "$OUT/restore.log, $OUT/restore.json"
RB=$(grep -o 'sh engine/tools/ship.sh rollback [0-9a-f-]*' "$SELF/../docs/plan/HANDOFF.md" 2>/dev/null | head -1)
if [ -n "$RB" ]; then r=✓; else r=✗; fi
row 5 "a rollback command is written down for the ship: '${RB:-none found}'" "$r" "docs/plan/HANDOFF.md"
SIGN=""; SBAD=""
for d in /home /goals /decisions /map /build /library /control /gtm /broadcast "/home/summary" "/preview/P-0000000000000000" "/contribution/T-20200101-001"; do
  s=$(code -H 'accept: application/json' "$URL$d"); n=$(code -H 'accept: text/html' -H 'sec-fetch-mode: navigate' -H 'sec-fetch-dest: document' "$URL$d"); b=$(code -H 'Authorization: Bearer 0000000000000000000000000000000000000000' "$URL$d")
  loc=$(curl -s -m 30 -o /dev/null -w '%{redirect_url}' -H 'accept: text/html' -H 'sec-fetch-mode: navigate' -H 'sec-fetch-dest: document' "$URL$d")
  SIGN="$SIGN $d:$s/$n/$b"
  case "$s/$n/$b/$loc" in 401/302/401/*"/login"*) ;; *) SBAD="$SBAD $d($s/$n/$b)" ;; esac
done
echo "door: script/navigation/bad-key:$SIGN" > "$OUT/signin.txt"
if [ -z "$SBAD" ]; then r=✓; else r=✗; fi
row 5 "the sign-in rule on 12 doors: a script 401, a browser navigation 302 to /login, a bad key 401${SBAD:+; broken:$SBAD}" "$r" "$OUT/signin.txt"
# the adversarial read: the sprint-end review (G2) is recorded done in HANDOFF (its fixes committed, each with an attack
# case), and its report is on this machine (engine/.runs/review/REVIEW.md, machine-local)
G2DONE=$(grep -c '~~G2 · sprint end~~ — done' "$SELF/../docs/plan/HANDOFF.md" 2>/dev/null)
REVIEW="$SELF/.runs/review/REVIEW.md"; RHIGH=""
[ -s "$REVIEW" ] && RHIGH=$(grep -c -E '^#+ *H[0-9]' "$REVIEW" 2>/dev/null)
if [ "${G2DONE:-0}" -ge 1 ] && [ -s "$REVIEW" ]; then r=✓; else r=✗; fi
row 5 "the adversarial read of the auth and the render sandbox, done and fixed: HANDOFF records G2 done ($([ "${G2DONE:-0}" -ge 1 ] && echo yes || echo no)); the review's report $([ -s "$REVIEW" ] && echo "present (${RHIGH:-0} HIGH sections)" || echo "NOT on this machine")" "$r" "docs/plan/HANDOFF.md (G2), $REVIEW"

# ---------------- line 6: honest docs ----------------
(cd "$SELF" && python3 tools/check-docs.py) > "$OUT/check-docs.log" 2>&1; DOC_RC=$?
if [ "$DOC_RC" = "0" ]; then r=✓; else r=✗; fi
row 6 "python3 tools/check-docs.py: every path, route, tool and command the front-door docs name exists (exit $DOC_RC)" "$r" "$OUT/check-docs.log"
OLDNAME=$(jget "$OUT/initialize.json" '((t)=>(t.match(/Agent R\b|\bR keeps\b|agent-r/gi)||[]).join(", "))(d.result.instructions+" "+JSON.stringify(d.result.serverInfo))')
if [ -z "$OLDNAME" ]; then r=✓; else r=✗; fi
row 6 "the MCP's first reply names the product sharingu, not the old name or the worker's (server: $(jget "$OUT/initialize.json" 'd.result.serverInfo.name'); found: ${OLDNAME:-none})" "$r" "$OUT/initialize.json"
(cd "$SELF" && NAMES_URL="$URL" NAMES_KEY="$KEY" node tools/names-check.mjs --json "$OUT/names.json") > "$OUT/names.log" 2>&1; NM_RC=$?
if [ "$NM_RC" = "0" ]; then r=✓; else r=✗; fi
row 6 "INSTALL, Control · Connect and the built-in start-here name only the new tool names, and each the first calls (tools/names-check.mjs, exit $NM_RC)" "$r" "$OUT/names.log, $OUT/names.json"

# ---------------- line 7b: create_project, then day-0 ----------------
mcp "$FRESH" "$FKEY" '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_project","arguments":{"key":"first","name":"First project"}}}' > "$OUT/fresh-create.json"
CREATED=$(jget "$OUT/fresh-create.json" 'JSON.parse(d.result.content[0].text).created')
(cd "$ENGINE" && DAY0_URL="$FRESH" DAY0_KEY="$FKEY" DAY0_EMAIL="$FEMAIL" sh tools/day0-verify.sh) > "$OUT/day0.log" 2>&1; D0_RC=$?
D0=$(grep -o 'day-0: .*' "$OUT/day0.log" | head -1)
if [ "$CREATED" = "true" ] && [ "$D0_RC" = "0" ]; then r=✓; else r=✗; fi
row 7 "then create_project {first} (created: ${CREATED:-?}) and tools/day0-verify.sh on that fresh org: $D0 (exit $D0_RC)" "$r" "$OUT/day0.log"
if [ "$WALK_RC" = "0" ]; then r=✓; else r=✗; fi
row 7 "the member path of line 1 on that same fresh org (it was the walk's org)" "$r" "$OUT/walk.json"
row 7 "a fresh org on a SECOND Cloudflare account from docs/INSTALL.md alone" "live only" "the owner's second account (BETA.md Stage C)"

# ---------------- the table ----------------
echo ""
echo "the table (also $TABLE):"
python3 - "$TABLE" <<'PY'
import sys
rows = [l.rstrip("\n").split("\t") for l in open(sys.argv[1]) if l.strip()]
for line, what, res, ev in rows:
    print(f"  {line:<2} {res:<9} {what}")
    print(f"              evidence: {ev}")
n = {r: sum(1 for x in rows if x[2] == r) for r in ("✓", "✗", "live only", "by hand")}
print(f"\n  {n['✓']} ✓ · {n['✗']} ✗ · {n['live only']} live only · {n['by hand']} by hand  (of {len(rows)} rows)")
PY
FAILS=$(awk -F'\t' '$3=="✗"' "$TABLE" | wc -l | tr -d ' ')
[ "$KEEP" = "1" ] && echo "  the fresh org is kept: $FRESH (stop: cd $ENGINE && R_LOCAL_STATE_ROOT=$STATE sh tools/r-local.sh down $SLUG)"
[ "$FAILS" -eq 0 ]
