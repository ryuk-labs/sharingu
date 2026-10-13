#!/bin/sh
# gate.sh — the LOCAL pass/fail gate for the worker. Run this BEFORE deploy.
# Fast · deterministic · no deploy, no live calls. Catches the errors a deploy would.
#   syntax (all src) · route orphans · mcp/capability parity · brand gate ·
#   code atlas freshness · boot-schema coverage · scoped data layer (sprint 6, 6.2) · the cross-org attack (sprint 6, 6.6) · fk-enforce selftest (real FK/CHECK/trigger proof) ·
#   migrate-dryrun fixture selftest · wrangler-json selftest (the d1 --json parser migrate.sh pipes through) ·
#   clean-eval/check_results selftest (Q5992857D — never deletes a grade) ·
#   backfill eval-integrity selftest (eval/production backfill populations disjoint; no dangling report; one report per project) ·
#   prune selftest (G2 H3: the ship's prune keeps people's own filings; a reviewed plan, a cap) ·
#   d1 hot-queries selftest (migrate-037 plans proven both ways; identity reads once per request; UI-B3 Home's five statements, migrate-038; UI-B4a the filing page's two statements) ·
#   ruling-link selftest (UI-B3: the owner's option pick is the ruling, through the real handler, mutation-proven) ·
#   map selftest (the layered layout, the kit the page embeds, the flow playback data) · map lights selftest (migrate-043) ·
#   mandate selftest · goals-derive selftest (the Goals Engine, M-ADR-020) ·
#   first-five selftest (M-ADR-026) · day-1 door selftest (B7a) · day-1 reading selftest (B7b) · u5 leftovers selftest · latency selftest (Server-Timing + the request memo) · wrap-up selftest (the wrap_up receipt, one seam) ·
#   login-csrf ROUTE selftest (mutation-proven, POST /login through the real handler, not just the primitive) ·
#   write door selftest (the requireOwnerKey ops POSTs and the Broadcast twins refuse a cross-site session write and a read-only key, mutation-proven) ·
#   control door selftest (UI-B12a: POST /control refuses a seat, a cross-origin cookie, a read-only credential and a ?k=-only key; never zero real admins; never an admin minted; mutation-proven) ·
#   logout-ruling selftest (no launcher: /login and /logout are the org's own) ·
#   ship selftest (tools/ship.sh + tools/migrate.sh against a stubbed wrangler, offline) ·
#   cf-budget selftest (the free-tier budget guard's four branches against a stubbed curl, offline) ·
#   suite-target selftest (tools/lib.sh: local R by default, --live budget-guarded before the mint, offline) ·
#   a wrangler build dry-run. Each run's wall time lands in .runs/gate.json (duration_s · started_at · rc).
# Green here → safe to `sh tools/ship.sh`. Red → fix first. (The loop: edit → gate → ship → evals.)
cd "$(dirname "$0")"
# M-ADR-037: the gate records its steps BY NAME (.runs/gate.json steps: [{name, ok}]) so a canvas node can light
# from a gate result. The run tees its own stdout once (.runs/gate.log); the outer shell derives the step list
# from the lines the run itself printed ("· <name>" then "  ✓ …" / "  ✗ …") — computed, never typed.
if [ -z "$AR_GATE_LOG" ]; then
  mkdir -p .runs 2>/dev/null; AR_GATE_LOG="$(pwd)/.runs/gate.log"; export AR_GATE_LOG
  # the gate's own wall time (build0925-engine-safe-ship, 2026-09-25): taken HERE, around the whole inner run, so a
  # RED run is timed too (the inner writer below is reached only on green) — recorded as duration_s/started_at/rc.
  _t0=$(python3 -c 'import time;print(time.time())' 2>/dev/null || date +%s)
  { sh "$0" "$@"; echo "$?" > "$AR_GATE_LOG.rc"; } 2>&1 | tee "$AR_GATE_LOG"
  _rc=$(cat "$AR_GATE_LOG.rc" 2>/dev/null || echo 1); rm -f "$AR_GATE_LOG.rc"
  python3 - "$AR_GATE_LOG" .runs/gate.json "$_t0" "$_rc" <<'PYSTEPS' 2>/dev/null
import json,sys,re,time,datetime
log,out=sys.argv[1],sys.argv[2]
t0,rc=float(sys.argv[3]),int(sys.argv[4])
steps=[]; cur=None
for line in open(log,encoding='utf-8',errors='replace'):
    m=re.match(r'^· (.+?)\s*$',line)
    if m: cur={'name':m.group(1),'ok':None}; steps.append(cur); continue
    if cur and cur['ok'] is None:
        if re.match(r'^\s+✓',line): cur['ok']=True
        elif re.match(r'^\s+✗',line): cur['ok']=False
green=any('GATE GREEN' in l for l in open(log,encoding='utf-8',errors='replace'))
try: d=json.load(open(out))
except Exception: d={'suite':'gate'}
# a step that prints its title only on success (the last one) carries no verdict line: it is ok iff the run went green
d['steps']=[{'name':s['name'],'ok':(green if s['ok'] is None else bool(s['ok']))} for s in steps]
# THIS run's wall time + exit code, green or red (on red the rest of the record is the last GREEN run's — rc says so)
d['duration_s']=round(time.time()-t0,1)
d['started_at']=datetime.datetime.fromtimestamp(t0,datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
d['rc']=rc
json.dump(d,open(out,'w'))
PYSTEPS
  exit "$_rc"
fi
fail=0

echo "· syntax check (src/*.js)"
for f in src/*.js src/knowledge/*.js; do
  node --check "$f" 2>/dev/null || { echo "  ✗ syntax: $f"; fail=1; }
done
[ "$fail" -eq 0 ] && echo "  ✓ all parse"

echo "· route orphans (every route declared in CAPABILITIES)"
python3 check-orphans.py >/dev/null 2>&1 && echo "  ✓ no orphan routes" || { echo "  ✗ orphan route — run: python3 check-orphans.py"; fail=1; }

echo "· mcp/capability parity"
python3 check-mcp-parity.py >/dev/null 2>&1 && echo "  ✓ tools ↔ capabilities aligned" || { echo "  ✗ parity — run: python3 check-mcp-parity.py"; fail=1; }

echo "· brand gate (ADR-092 §4 — no hand-typed tenant fact in render output)"
python3 check-brand.py >/dev/null 2>&1 && echo "  ✓ no literal tenant strings outside the seam" || { echo "  ✗ hand-typed tenant string — run: python3 check-brand.py"; fail=1; }

echo "· code atlas freshness (ADR-098 §2 — code-atlas.json must never lie)"
python3 tools/code-atlas.py > /tmp/.code-atlas-gate.json 2>/tmp/.code-atlas-gate.err \
  && diff -q code-atlas.json /tmp/.code-atlas-gate.json >/dev/null 2>&1 \
  && echo "  ✓ code-atlas.json matches src/*.js" \
  || { echo "  ✗ code-atlas.json is stale — run: python3 tools/code-atlas.py > code-atlas.json"; fail=1; }

echo "· boot-schema coverage (backlog #1 — a migration must never miss boot.sql)"
python3 tools/check-boot-schema.py 2>/dev/null | tail -1 | grep -q '✓' \
  && echo "  ✓ boot.sql covers every migration" \
  || { echo "  ✗ boot.sql behind the migrations — run: sh tools/export-boot-schema.sh"; fail=1; }

echo "· scoped data layer (sprint 6, 6.2 — every statement runs on the layer, src/data.js db(env), which writes in the READER'S org from the sign-in alone; no raw binding, no statement outside it, no org door outside its file, no org read off a people row, every insert into the nine org-wide tables names {org}; the check proven able to fail, mutation by mutation; the layer's own rules and two orgs in one database through the real worker: tools/data-layer-selftest.mjs; 6.4: every R2 key built by src/storage.js under its org's prefix, org 1's old keys read until the ship's copy, and that copy's refusals on a real local bucket: tools/r2-org-keys-selftest.mjs)"
python3 tools/check-scoped-data-selftest.py >/dev/null 2>&1 && python3 tools/check-scoped-data.py >/dev/null 2>&1 && node tools/data-layer-selftest.mjs >/dev/null 2>&1 && node tools/r2-org-keys-selftest.mjs >/dev/null 2>&1 \
  && echo "  ✓ every statement runs through the scoped data layer and every object lies under its org's prefix, the org from the sign-in alone; two orgs in one database read none of each other's rows or objects" \
  || { echo "  ✗ a statement or an R2 key outside the scoped layers, or a layer drifted — run: python3 tools/check-scoped-data.py; python3 tools/check-scoped-data-selftest.py; node tools/data-layer-selftest.mjs; node tools/r2-org-keys-selftest.mjs"; fail=1; }

echo "· the cross-org attack (sprint 6, 6.6 — PLATFORM §2 items 3 and 7, §5: two orgs seeded through the door in ONE database, the REAL worker in-process; as each org's owner and member against the other, in both directions: every MCP tool (reads and writes), every brain:// resource, every GET route as a page and as JSON, every POST route and POST /control's every action, all aimed at the other org's keys and ids: no answer carries a row of the other org, none is a 5xx, the victim's rows are unchanged table by table; the ONE ruled exception asserted: a public file by its exact id is served across the wall (ADR-055); proven able to fail: each named mutation — one org filter removed from a copy of src/ — turns it red)"
node tools/attack-xorg.mjs --prove >/dev/null 2>&1 \
  && echo "  ✓ neither org reads or writes a row of the other through any tool, resource or route; the public file by its exact id is the one ruled exception; every mutation goes red" \
  || { echo "  ✗ a row crossed the wall, a 5xx, or a mutation stayed green — run: node tools/attack-xorg.mjs --prove"; fail=1; }

echo "· fk-enforce selftest (build0921:schema-enforced — every real FOREIGN KEY/CHECK/trigger boot.sql declares gets a live SQLite positive + negative case; a constraint never watched reject a bad row is not proven)"
python3 tools/fk-enforce-selftest.py >/dev/null 2>&1 \
  && echo "  ✓ every FK/CHECK/trigger case holds against boot.sql" \
  || { echo "  ✗ fk-enforce drift — run: python3 tools/fk-enforce-selftest.py"; fail=1; }

echo "· migrate-dryrun fixture selftest (B3-heal, 2026-09-22 — the INCREMENTAL migrate-030..035 replay against an OLD tenant's own accumulated data, not a fresh boot.sql tenant: a refs row, an orphan token, an orphan event, an untagged artifact; offline, no network, no wrangler)"
python3 tools/migrate-dryrun-selftest.py >/dev/null 2>&1 \
  && echo "  ✓ the migration chain heals every fixture case (refs row survives, orphans resolve inactive, untagged backfills)" \
  || { echo "  ✗ migrate-dryrun fixture drift — run: python3 tools/migrate-dryrun-selftest.py"; fail=1; }

echo "· wrangler-json selftest (QC74D4892-heal, 2026-09-23 — tools/lib_wrangler_json.py, the wrangler d1 --json parser tools/lib-migrate-chain.sh pipes through, born of a live 'wrote everything, reported failure' incident: a stubbed, genuinely-executed \`wrangler\` on PATH proves banner+JSON parses with the right count, a real error payload exits 1 named, and malformed output exits 1 never a silent pass; offline, no network)"
python3 tools/wrangler-json-selftest.py >/dev/null 2>&1 \
  && echo "  ✓ the wrangler --json parser holds every stubbed case — banner+JSON/real-error/malformed" \
  || { echo "  ✗ wrangler-json parser drift — run: python3 tools/wrangler-json-selftest.py"; fail=1; }

echo "· clean-eval/check_results selftest (release-heal, 2026-09-22, Q5992857D — check_results is authored, clean-eval must never delete it; a real SQLite DB against the actual admin.js export, never a hand-mirror)"
node tools/clean-eval-check-results-selftest.mjs >/dev/null 2>&1 \
  && echo "  ✓ clean-eval keeps every check_results row and every eval transmission a grade still references" \
  || { echo "  ✗ clean-eval/check_results drift — run: node tools/clean-eval-check-results-selftest.mjs"; fail=1; }

echo "· backfill eval-integrity selftest (build0925:backfill-eval-integrity, 2026-09-25 — eval-mode backfill covers eval=1 rows only, production eval=0 only; clean-eval never leaves a dangling report; migrate-036 repairs + replays clean; a real SQLite DB against the actual core.js/admin.js exports)"
node tools/backfill-eval-selftest.mjs >/dev/null 2>&1 \
  && echo "  ✓ backfill modes are disjoint and no transmission is left pointing at a deleted report" \
  || { echo "  ✗ backfill eval-integrity drift — run: node tools/backfill-eval-selftest.mjs"; fail=1; }
echo "· prune selftest (G2 H3, the independent review — the ship's prune removes only the import's own stale rows and the owner's rulings; a person's own filing is kept; the apply removes only what a reviewed plan names, as it stands, under a cap)"
node tools/prune-selftest.mjs >/dev/null 2>&1 \
  && echo "  ✓ the prune plan keeps people's own filings and the apply removes only a reviewed plan's rows" \
  || { echo "  ✗ prune rule drift — run: node tools/prune-selftest.mjs"; fail=1; }

# (the canvas regen and eagle regen steps retired with src/canvasapp.js and src/eagle.js: the Map, sprint 2, draws its own
# canvas, src/maplayout.js + src/mapclient.js, proven by the map selftest below)

echo "· d1 hot-queries selftest (build0925:d1-hot-queries, 2026-09-25 — the engine-owned D1 hot readers: EXPLAIN on the exact SQL the worker runs uses migrate-037's indexes and FAILS on the pre-037 schema + pre-change SQL; /audit rows unchanged; resolveOwner/resolveReadOnly one D1 read per request, never across requests; UI-B3 Home's five statements SEARCH (migrate-038 serves S2's counter count) and run at most five per request on both doors; UI-B4a the filing page's counters SEARCH idx_transmission_parent and the page runs at most two statements; UI-B4b + UI-B6b Build's three statements SEARCH (B1 on idx_transmission_project newest first, its counters and rank subqueries on idx_transmission_parent; B3 the finish line's goal aggregate over all time on idx_transmission_project) and GET /build runs exactly those three on the page and the JSON with a declared tree, a fourth read red, and exactly two with none; UI-B5b section J: GET /versions, GET /versions/:v and the ?head=1 poll run ZERO D1 statements of their own, a stray one red; UI-B6a section K: the Goals aggregate SEARCHes idx_transmission_project, the goal/ counters idx_transmission_refs_ref, a goal's rows idx_transmission_goalref, and GET /goals runs exactly two statements and GET /goals/:ref three, a third read on /goals red; UI-B11a section O: GET /broadcast's one statement SEARCHes idx_transmission_kind_eval, a second read red, and GET /map/mcp runs that one statement; U-MCP section P: a project named per call costs +0 for a seated reader, at most +1 for the owner, the GET twin and brain:// the same as the tool, the seats read once per request, a second read red; UI-B12a section V: GET /control/people's three statements SEARCH by key and run exactly three beyond the /versions JSON baseline for the owner, a seat and a one-project org, a fourth read red; a real SQLite DB + the real src/index.js handler)"
node tools/d1-hot-selftest.mjs >/dev/null 2>&1 \
  && echo "  ✓ hot-query plans use migrate-037, rows unchanged, identity reads once per request; the Decisions overlay SEARCHes the refs index, one statement per read (UI-B2); Home SEARCHes (migrate-038), S4 rows exact, at most five statements on /home and /home/summary, a sixth read red (UI-B3); Build's three statements SEARCH, exactly three per /build request with a declared tree and two with none (UI-B4b, UI-B6b); Versions and its head poll run none (UI-B5b)" \
  || { echo "  ✗ d1 hot-queries drift — run: node tools/d1-hot-selftest.mjs"; fail=1; }


echo "· mandate selftest (M-ADR-019 — mandateFloorFor: internal floor · external NEVER mandated)"
node tools/mandate-selftest.mjs >/dev/null 2>&1 && echo "  ✓ mandate-floor branches hold" || { echo "  ✗ mandate drift — run: node tools/mandate-selftest.mjs"; fail=1; }

echo "· goals-derive selftest (M-ADR-020 — verifyGoalRef + deriveGoals: the goal-tree rollup, honest zero; UI-B6a: rollupCells over the real GOALS_AGG_SQL equals deriveGoals on every fixture)"
node tools/goals-derive-selftest.mjs >/dev/null 2>&1 && echo "  ✓ goals-derive branches hold" || { echo "  ✗ goals-derive drift — run: node tools/goals-derive-selftest.mjs"; fail=1; }
echo "· first-five selftest (M-ADR-026 — deriveFirstFive: a new contributor's onboarding steps, server-derived)"
node tools/first5-selftest.mjs >/dev/null 2>&1 && echo "  ✓ first-five branches hold" || { echo "  ✗ first-five drift — run: node tools/first5-selftest.mjs"; fail=1; }

echo "· latency selftest (build0925-home-latency — Server-Timing spans per kind over the RAW bindings, original errors rethrown, header on HTML + /health only with the body untouched; the decision rows read once per request)"
node tools/latency-selftest.mjs >/dev/null 2>&1 && echo "  ✓ timing and request-memo shapes hold" || { echo "  ✗ latency seam drift — run: node tools/latency-selftest.mjs"; fail=1; }

echo "· csrf selftest (scar 2026-09-08 — Origin: null under no-referrer is a browser's OWN form POST; Sec-Fetch-Site decides)"
node tools/csrf-selftest.mjs >/dev/null 2>&1 && echo "  ✓ same-origin write check holds for real browser header shapes" || { echo "  ✗ csrf drift — run: node tools/csrf-selftest.mjs"; fail=1; }

echo "· login-csrf selftest (heal round 1, QC74D4892 verifier — POST /login's own login-CSRF guard, src/util.js's crossSiteLogin(), ported 2026-09-22 from the retired launcher's former sole copy)"
node tools/login-csrf-selftest.mjs >/dev/null 2>&1 && echo "  ✓ login-CSRF guard holds for real browser header shapes" || { echo "  ✗ login-csrf drift — run: node tools/login-csrf-selftest.mjs"; fail=1; }

echo "· login-csrf ROUTE selftest (heal round 2, this batch, 2026-09-23 — #162's verifier proved the check above cannot fail: it never drives POST /login itself. Drives the real src/index.js default export through a real fetch(Request), real SQLite; embeds a mutation proof — the guard's call site replaced with 'if (false && crossSiteLogin(...))', #162's own shape — so a future silent unwiring turns THIS check red, not just the isolated primitive test)"
node tools/login-csrf-route-selftest.mjs >/dev/null 2>&1 && echo "  ✓ POST /login refuses cross-site (403) and reaches the credential check same-origin/scripted (401); mutation-proven load-bearing" || { echo "  ✗ login-csrf route drift — run: node tools/login-csrf-route-selftest.mjs"; fail=1; }

echo "· write door selftest (hotfix-verb-csrf, 2026-09-28 — the owner ops POSTs behind requireOwnerKey (/backfill · /backup-dump) and the Broadcast twins refuse a cross-site session write and a read-only key; Bearer and same-origin go through; the reserved kinds; each guard mutation-proven)"
node tools/write-door-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the owner ops POSTs refuse a cross-site session write and a read-only key; Bearer and same-origin still file; Publish and Equip preview first for a key, a browser's press files, ?k= and OAuth 401, the preview gate load-bearing and kind publish/equip is reserved_kind on every agent door; each guard load-bearing" || { echo "  ✗ write door drift — run: node tools/write-door-selftest.mjs"; fail=1; }

echo "· control door selftest (UI-B12a, 2026-09-30 — POST /control, the ONE admin write door, is an ABOVE route and carries every refusal itself: a seat's POST of every action 403 with D1 unchanged, a cross-origin cookie 403, the read-only credential in ?k= and as a Bearer 403, a full key in ?k= with no header and no cookie 403 (a key in a URL reads; it never writes), set-role never leaves zero REAL admins (the suites' fixed owner never counts), add-person never mints an admin, remove-person never archives the last real admin, the one-time secret rides the body only; the real src/index.js handler over a real SQLite D1; each guard mutation-proven load-bearing)"
node tools/control-door-selftest.mjs >/dev/null 2>&1 && echo "  ✓ POST /control refuses a seat, a cross-origin cookie, a read-only credential and a ?k=-only key; the admin writes keep a real admin and keep the secret in the body; each guard load-bearing" || { echo "  ✗ control door drift — run: node tools/control-door-selftest.mjs"; fail=1; }

echo "· hats selftest (sprint 2, migrate-044 — roles Admin · Member · Partner and hats: the backfill CASE is src/hats.js LABEL_HATS; the migration on a real pre-044 people table; every migrated person admitted after exactly where their typed role was before, over every list of typed labels, in JS and in the card SQL; a hat opens its list to a member wearing it, never to a Partner; the instrument: a migration that forgets the label goes red)"
node tools/hats-selftest.mjs >/dev/null 2>&1 && echo "  ✓ migrate-044 keeps what every migrated person could read, no more and no less; hats gate their lists both ways" || { echo "  ✗ hats drift — run: node tools/hats-selftest.mjs"; fail=1; }

echo "· presets selftest (sprint 2, the starter Broadcast built into the product — src/presets/*.md parse, src/presetdata.js is what they make, the ruled six agents, three workflows and three skills, every slug unique and valid, every call a tool of contracts/door.json with only the fields that tool takes, an agent starts with whoami · heartbeat · holes, a workflow's every step ends in a filed contribution, no em dash and no org fact; src/starter.js's shelf states)"
node tools/presets-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the starter items are current, valid and call only real tools with real fields" || { echo "  ✗ presets drift — run: node tools/make-presets.mjs && node tools/presets-selftest.mjs"; fail=1; }

echo "· logout-ruling selftest (post-consolidation-suite-heal, 2026-09-25; launcher deleted Q6FA72180, 2026-09-27 — E232g's ONE verdict, tools/lib-logout-ruling.sh, driven through the real src/index.js route: it holds with no launcher AND with a stale LAUNCHER_URL var + served manifest launcher, both ignored; every clause fails alone on a launcher-era shape; the org's own /login wears its brand)"
node tools/logout-ruling-selftest.mjs >/dev/null 2>&1 && echo "  ✓ E232g's logout verdict holds and a stale launcher setting is ignored (real route, every clause load-bearing, own brand on /login)" || { echo "  ✗ logout-ruling drift — run: node tools/logout-ruling-selftest.mjs"; fail=1; }

echo "· secrets selftest (self-service secrets 2026-09-08 — current-secret verification + the passphrase floor)"
node tools/secrets-selftest.mjs >/dev/null 2>&1 && echo "  ✓ verifyCurrentSecret + passphrase policy hold" || { echo "  ✗ secrets drift — run: node tools/secrets-selftest.mjs"; fail=1; }
echo "· accounts selftest (sprint 7, 7.1 — one account per email, a seat per org: one sign-in lands in the address's org's seat only, a right secret with no seat there is no_seat_here, an admin's minted key never opens another org's seat (the squatting attack), set-password refused while the account holds a seat elsewhere, the lockout per account, a seat's credential never sets the account's passphrase, keys and OAuth grants as before; six mutants red)"
node tools/accounts-selftest.mjs >/dev/null 2>&1 && echo "  ✓ one account per email, a seat per org, the lockout per account; every mutant red" || { echo "  ✗ accounts drift — run: node tools/accounts-selftest.mjs"; fail=1; }
echo "· sign-up selftest (sprint 7, 7.2 — sign-up by allowlist: the operator's code is bound to its email, kept as a hash, single-use under a race, expires and is revocable; a new account, a migrated one's first passphrase, the reset that ends every session of the account in every org; one refusal for every wrong case, writing only the attempt, in the lockout; the same-origin guard and the flood filter; six mutants red)"
node tools/signup-selftest.mjs >/dev/null 2>&1 && echo "  ✓ an allowed email's code signs it up, once; every refusal one answer; every mutant red" || { echo "  ✗ sign-up drift — run: node tools/signup-selftest.mjs"; fail=1; }
echo "· invite selftest (sprint 12, 12.3 — an org's one-time invite link: minted by the org's admin for a seat of its own org and that seat's email, kept as a hash, the token in the link's fragment; the invitee sets the ACCOUNT's passphrase only for an account new in all but name, then lands signed in in that org; used, expired, replaced, removed or reissued: refused, nothing written; an account that stands: nothing written; the invite-made account reaches that org alone — no org created, no other org's seat seen or answered — until the operator's code; sixteen mutants red)"
node tools/invite-selftest.mjs >/dev/null 2>&1 && echo "  ✓ an invite link seats its invitee once, in its own org alone; every mutant red" || { echo "  ✗ invite drift — run: node tools/invite-selftest.mjs"; fail=1; }
echo "· request-access selftest (sprint 21, 21.1 — POST /request-access, migrate-081: a profile read strictly before anything is written (the required five, the email lower-cased and plain ASCII, the website an http(s) address, LinkedIn, X and GitHub the service's own address); ONE open request per email and the first stands (a repeat changes nothing and is sent to the asked page, naming nothing typed); an account's email answered as a new one (nothing reads accounts); the honeypot a new request's answer, writing nothing; only the private link's hash kept, any other link one 404; the same-origin guard and the flood filter; the beta count one source with the operator's; nine mutants red)"
node tools/request-access-selftest.mjs >/dev/null 2>&1 && echo "  ✓ a request files once per email, the first one stands; every mutant red" || { echo "  ✗ request-access drift — run: node tools/request-access-selftest.mjs"; fail=1; }
echo "· activity selftest (sprint 12, 12.5 — Activity across every project: the owner every active project of its org, anyone else their seats, a Partner its seated projects alone, a project outside them refused; no suite or mind row, knowledge the owner's alone; each project's share of 1,000 rows on idx_transmission_project in its own order (no sorter), the shown rows by primary key; paging by the cursor reaches every row once for every filter, a millisecond never split, a one-millisecond scan read whole; twelve mutants red)"
node tools/activity-selftest.mjs >/dev/null 2>&1 && echo "  ✓ Activity across every project lists what each reader may read, bounded, every row once; every mutant red" || { echo "  ✗ activity drift — run: node tools/activity-selftest.mjs"; fail=1; }
echo "· client selftest (sprint 13, 13.1 — which AI filed it, src/client.js: every known client's name reads as its ONE family word (claude, claude-code, chatgpt, codex, web, api, other), never the raw string; the order of trust — the OAuth client's registered name, then the MCP clientInfo, then the door; the session id and the grant carry the word alone; both ledger inserts stamp transmission.client (migrate-080), a row outside a request NULL; twelve mutants red)"
node tools/client-selftest.mjs >/dev/null 2>&1 && echo "  ✓ each filing names the AI that filed it by its one family word, self-declared, by the order of trust; every mutant red" || { echo "  ✗ client drift — run: node tools/client-selftest.mjs"; fail=1; }
echo "· plans selftest (sprint 8, 8.1 — a plan per org and its limits (migrate-075, the owner's ruled numbers pinned against PLATFORM.md's table); usage by SQL aggregates on the slice's own indexes, never a table read to count, no existing statement's plan moved; every mutant red)"
node tools/plans-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the plans hold the ruled numbers; usage counts from indexes; every mutant red" || { echo "  ✗ plans drift — run: node tools/plans-selftest.mjs"; fail=1; }
echo "· limits selftest (sprint 8, 8.2 — the enforcement: the 80% warning, the one plan_limit refusal, reads never refused, the burst across two orgs, a refused write never counted; every claim red under its mutant)"
node tools/limits-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the limits hold: warn, refuse, reads answer, the burst per org; every mutant red" || { echo "  ✗ limits drift — run: node tools/limits-selftest.mjs"; fail=1; }
echo "· operator selftest (sprint 7, 7.2 — tools/operator.mjs allow · list · revoke: the code printed once, kept as a hash; one open code per email; the refusals before any write; --live only with its database named)"
node tools/operator-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the operator's allowlist holds" || { echo "  ✗ operator drift — run: node tools/operator-selftest.mjs"; fail=1; }
echo "· reviewer-org selftest (sprint 9's review, A1+B2/B3/A4 — tools/make-reviewer-org.mjs: fresh accounts only, an account standing outside the world refused with or without --reissue, nothing written; an org that is no reviewer world refused; --live's import dry run before any write; the inherited source overrides ignored unless --source-env; sprint 12's 12.8: every class of an org seated with its hats, the walkthrough's filings the door's shapes on the overlay's own ids, a complete world reruns writing nothing)"
node tools/make-reviewer-org-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the reviewer world touches no account but its own" || { echo "  ✗ reviewer-org drift — run: node tools/make-reviewer-org-selftest.mjs"; fail=1; }
echo "· create-an-org selftest (sprint 7, 7.3 — POST /orgs: an account holder proven by the ACCOUNT's passphrase makes the org, its owner seat of that account and its first project o<id>--<slug> in one batch; one answer for every failed proof (a seat's secret never creates), in the lockout; reserved and malformed addresses refused before any read; one org per account and one org per address, under a race; an existing id fails the whole batch; the new owner reads its org alone; add-person there joins an existing account; seven mutants red)"
node tools/orgs-selftest.mjs >/dev/null 2>&1 && echo "  ✓ an account creates its one org, nothing else; every mutant red" || { echo "  ✗ create-an-org drift — run: node tools/orgs-selftest.mjs"; fail=1; }
echo "· the door's orgs selftest (sprint 7, 7.5a — PLATFORM §2 items 8 and 9: one /mcp; the OAuth grant records what proved it: the ACCOUNT's passphrase an ACCOUNT grant (its own active seats, one org a call by orgSlug, each with that seat's role), a seat's own secret a SEAT grant (that seat alone, the pre-7.5a shape); whoami lists the orgs; any other org org_unreachable, one answer whether it exists or not, nothing written; a grant minted by the code before 7.5a acts as its seat in org 1; each grant ends with its own secret; five mutants red)"
node tools/mcp-orgs-selftest.mjs > /tmp/.mcp-orgs.out 2>&1 && echo "  ✓ an account grant acts in its own orgs only, a seat grant in its seat's; every mutant red" || { echo "  ✗ the door's orgs drift — run: node tools/mcp-orgs-selftest.mjs"; { grep '✗' /tmp/.mcp-orgs.out || tail -n 15 /tmp/.mcp-orgs.out; } | tail -n 20 | sed 's/^/    | /'; fail=1; }
echo "· org names (sprint 7, 7.3 — PLATFORM §2 item 9: an org's address never takes a name the platform uses: every first path segment a route answers, the registry's and the OAuth provider's, is in the set the worker derives from CAPABILITIES; none a derived slug's shape; proven able to fail, mutation by mutation, and an org holding a route's name fails loudly)"
node tools/check-org-names.mjs --prove >/dev/null 2>&1 && echo "  ✓ every route's name reserved, derived from the registry" || { echo "  ✗ a route an org could shadow, or the proof stayed green — run: node tools/check-org-names.mjs --prove"; fail=1; }
echo "· org paths (sprint 7, 7.4 — PLATFORM §2 item 9: every URL the worker builds for an org goes through src/orgpath.js orgPath/orgUrl, which puts the request's org base in front; no app path in src as a literal outside the helper, in a page's markup, in a page's script or joined to an origin; the app paths READ from the registry less the platform's root doors; proven able to fail, mutation by mutation)"
python3 tools/check-org-paths.py --prove >/dev/null 2>&1 && echo "  ✓ every app path built by the one helper" || { echo "  ✗ an app path built outside orgPath, or the proof stayed green — run: python3 tools/check-org-paths.py --prove"; fail=1; }

echo "· handoff selftest (POST /wrap-up and MCP wrap_up answer one receipt shape through one seam)"
node tools/handoff-selftest.mjs >/dev/null 2>&1 && echo "  ✓ handoff receipt holds on both doors" || { echo "  ✗ handoff drift — run: node tools/handoff-selftest.mjs"; fail=1; }

echo "· day-1 door selftest (B7a, Q60CCC574 — initialize instructions + protocol negotiation, whoami glosses, refusals that say what to do, missing+example, ask, no human-verb tool)"
node tools/day1-door-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the day-1 door holds (W11 · W1 · W6 · W7 · W9)" || { echo "  ✗ day-1 door drift — run: node tools/day1-door-selftest.mjs"; fail=1; }
echo "· day-1 reading selftest (B7b, Q60CCC574 — titled blockers, a short state, start-here first, holes per project through the door, needs more, the suites' rows out of a real seat's reads)"
node tools/day1-reading-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the day-1 reading holds (W2 · W3 · W4 · W5 · W8 · W12)" || { echo "  ✗ day-1 reading drift — run: node tools/day1-reading-selftest.mjs"; fail=1; }
echo "· u5 leftovers selftest (the capsule tool on the project's own docs · plain resource names · HAS_SCREENS on SIRU's register · named screen refs)"
node tools/u5-leftovers-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the U5 leftovers hold (capsule · resource names · HAS_SCREENS key · named screens)" || { echo "  ✗ u5 leftovers drift — run: node tools/u5-leftovers-selftest.mjs"; fail=1; }

echo "· shell render selftest (scar 2026-09-09 — the chrome renders with a served-looking fixture; a runtime error here 1101'd every page)"
node tools/shell-render-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the shell renders for anonymous · contributor · owner" || { echo "  ✗ shell render drift — run: node tools/shell-render-selftest.mjs"; fail=1; }
echo "· wire-selftest (UI-B1a · UI-B2 · UI-B3 · UI-B4a · UI-B4b · UI-B5b — the shell, the Decisions screen, the QuestionCard, Home, the filing page and Build against the pinned wireframe (wf-decisions · wf-question · wf-home · wf-filing · wf-build) + design-law snapshots: regions, doors, Brand v2 tokens and type, the states, sharingu on glass, every defect injected red)"
node tools/wire-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the top bar (7 regions), Decisions (3 regions · 6 buttons), the QuestionCard (5 regions · 7 buttons, one pin: why) and Home (6 regions in order · 8 buttons, both counter calls, one kind chip per row, no view bar) and the filing page (6 regions in order · 6 buttons, the counter call with its id, N standing · M ruled, a seated reader's page with no ruling button, another project's row not_found) and Build (3 regions in order · 5 buttons, one state chip per row, the counter call, Ranked newest press first, the finish line from the declared tree's leaves (6 of 13 · 4 gating · 3 deferred, a stale state.json export never read, no tree EMPTY, the aggregate lost UNREACHABLE, each wrong stage reading red), another project's reader EMPTY, the Build tab one view) and Versions (3 regions in order · 5 buttons, BEHIND viewing an older version, the LANDED current chip, Restore disabled with its reason for a seat, the version chip on every Map view, BEHIND one stone pattern never orange or red, the head poll) match the wireframe: every door in door.json, EMPTY · ERROR · UNREACHABLE drawn, no typed input, no em dash, sharingu on the title (proven both ways)" || { echo "  ✗ wire drift — run: node tools/wire-selftest.mjs"; fail=1; }

echo "· vocabulary selftest (M-ADR-041 WP1 — the reader's words on every face; identifiers never count)"
node tools/check-vocab-selftest.mjs >/dev/null 2>&1 && echo "  ✓ no banned noun in page copy or rendered text" || { echo "  ✗ vocabulary drift — run: node tools/check-vocab-selftest.mjs"; fail=1; }
echo "· tempo selftest (M-ADR-041 WP2 + B7b W8 — tempoOf: in · with <owner> · decided · on the canvas · needs more, derived never typed)"
node tools/tempo-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the five tempo derivations hold" || { echo "  ✗ tempo drift — run: node tools/tempo-selftest.mjs"; fail=1; }
echo "· decide-form selftest (one-mind WP7 — rulings on the page: owner-only form, the seam's three verdicts, the ruling block, the decided chip)"
node tools/decide-form-selftest.mjs >/dev/null 2>&1 && echo "  ✓ decide form holds" || { echo "  ✗ decide form drift — run: node tools/decide-form-selftest.mjs"; fail=1; }
echo "· ruling-link selftest (UI-B3 C14, ADR-079 — the filing->ruling link through the REAL src/index.js handler and a real SQLite D1: the owner's non-provisional option is decided approve in the same /respond request through the one decide seam, a seat's or a provisional answer never is, the overlay reads it back as ruled, Decisions + the card + Home say so, no row decided twice; mutation-proven: the link's call site disabled goes red)"
node tools/ruling-link-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the owner's pick is the ruling at once (closed, audited, ruled on every face), nobody else's; the link is load-bearing" || { echo "  ✗ ruling-link drift — run: node tools/ruling-link-selftest.mjs"; fail=1; }
echo "· transmission selftest (the gate-grade heuristic: auto/owner/incomplete routing + reasons — lights transmission.js on the canvas)"
node tools/transmission-selftest.mjs >/dev/null 2>&1 && echo "  ✓ transmission grade/route hold" || { echo "  ✗ transmission selftest drift — run: node tools/transmission-selftest.mjs"; fail=1; }
echo "· the one-pass fix (sprint 3, owner 2026-10-01): the proof rule's table (every proof the fill's commits stated passes, every narration fails) and the Map refs, goal status, rulings, idPattern, source, holes and whoami (a real SQLite from boot.sql)"
node tools/proof-selftest.mjs >/dev/null 2>&1 && node tools/onepass-selftest.mjs >/dev/null 2>&1 && echo "  ✓ proof as people state it; ids checked against the project's own Map in one statement; the rest of the one-pass fix holds" || { echo "  ✗ one-pass fix drift — run: node tools/proof-selftest.mjs; node tools/onepass-selftest.mjs"; fail=1; }
echo "· preview selftest (sprint 3, B2 — the terminal text in 72 plain columns, the digest's key order never matters, every gate reason reads as a sentence, the reach one hop both ways on a real SQLite from boot.sql, a preview over 64 KB stored grouped)"
node tools/preview-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the preview's text, digest, verdicts, reach and stored summary hold" || { echo "  ✗ preview drift — run: node tools/preview-selftest.mjs"; fail=1; }
echo "· checklist selftest (sprint 3, B3 — k_fill stays exact under random writes, migrate-050 backfills and replays, a dropped trigger goes red, each item both ways through the real door, the meter counts only the areas a project has)"
node tools/checklist-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the checklist and its meter hold" || { echo "  ✗ checklist drift — run: node tools/checklist-selftest.mjs"; fail=1; }
echo "· impact selftest (sprint 3, B4 — stale by change is exact after thousands of random writes, the rule both ways, a dropped trigger goes red, migrate-054 backfills and replays)"
node tools/impact-selftest.mjs >/dev/null 2>&1 && echo "  ✓ impact and stale-by-change hold" || { echo "  ✗ impact drift — run: node tools/impact-selftest.mjs"; fail=1; }
echo "· regrade selftest (sprint 4, R1 — which checks a page proves, the verdict and its proof, the placeholders; through the real door over SQLite: a change stales a flow's checks, the plan writes nothing, the confirm observes the page as the caller and makes it fresh, a Partner refused, the cap of 8 and the rest)"
node tools/regrade-selftest.mjs >/dev/null 2>&1 && echo "  ✓ regrade from a page holds" || { echo "  ✗ regrade drift — run: node tools/regrade-selftest.mjs"; fail=1; }
echo "· docs check (every .md but HANDOFF, the presets and fixtures: every path, route, tool, command, migration, commit and link it names exists; a planned name passes until its step is ticked; its selftest's failing fixture goes red)"
python3 tools/check-docs-selftest.py >/dev/null 2>&1 && python3 tools/check-docs.py >/dev/null 2>&1 && echo "  ✓ every name the docs give exists" || { echo "  ✗ a doc names something that does not exist — run: python3 tools/check-docs.py; python3 tools/check-docs-selftest.py"; fail=1; }
echo "· extract selftest (sprint 3, B5 — search, read, changes and brief through the real handler over a real SQLite: the FTS index stays exact, a hidden doc or card is never named or counted, a Partner reads only their seats, the rowid read-backs stay lookups)"
node tools/extract-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the extract reads hold for the owner, a member, a hat, a Partner and a seatless reader" || { echo "  ✗ extract drift — run: node tools/extract-selftest.mjs"; fail=1; }
node tools/project-words-selftest.mjs >/dev/null 2>&1 && echo "  ✓ no answer, page or flash names a project by its org-prefixed key (13.2)" || { echo "  ✗ a raw project key in a person's words — run: node tools/project-words-selftest.mjs"; fail=1; }
echo "· import budget selftest (sprint 3, S4 — the importer's write guard reads the account's plan: free refuses over 95% of a day, paid prices an overage and refuses one run over 5,000,000 rows or an overage of $5)"
node tools/import-budget-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the import's write guard holds on both plans" || { echo "  ✗ import budget guard drift — run: node tools/import-budget-selftest.mjs"; fail=1; }
echo "· lists and broadcast selftest (sprint 3, B7 — a card kind lists on the tab it names under each reader's visibility; the card page; publish and equip by role class, previewed first; a Partner refused by tool and by REST)"
node tools/lists-broadcast-selftest.mjs >/dev/null 2>&1 && echo "  ✓ lists, the card page, publish and equip hold" || { echo "  ✗ lists/broadcast drift — run: node tools/lists-broadcast-selftest.mjs"; fail=1; }
echo "· live-walk selftest (sprint 3, S3a — the walk's name table resolves every tool from a tools/list fixture and every name and path is in the contract; a missing tool fails by name; redaction never leaks a key; offline)"
node --check tools/live-walk.mjs 2>/dev/null && node tools/walk/selftest.mjs >/dev/null 2>&1 && echo "  ✓ the live walk's names, redaction and input hold" || { echo "  ✗ live-walk drift — run: node tools/walk/selftest.mjs"; fail=1; }
echo "· copy check (the look revision: no hint, explanation or raw call on a screen; no allowlist: any finding fails, D5)"
node tools/copy-check-selftest.mjs >/dev/null 2>&1 && node tools/copy-check.mjs --check >/dev/null 2>&1 && echo "  ✓ no hint, explanation or raw call on a screen" || { echo "  ✗ copy — run: node tools/copy-check.mjs --check"; fail=1; }
echo "· backup selftest (sprint 3 S3b — every boot.sql table is dumped, derived or never, each with its reason; people without a credential; the pages; the restore rebuilds every derived table)"
node tools/backup-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the backup's rule and the restore hold" || { echo "  ✗ backup drift — run: node tools/backup-selftest.mjs"; fail=1; }
echo "· one org's undo (sprint 6, 6.5 — tools/org-undo.mjs: every boot.sql table placed; an org exported, restored beside itself as a new org with every taken id renumbered and every reference following, verified table by table; a collision left in never green, mutation by mutation; delete refused for org 1, unnamed, without a fresh export or across the wall, then 0 rows of the org anywhere and every other org byte for byte as before)"
node tools/org-undo-selftest.mjs >/dev/null 2>&1 && echo "  ✓ one org's export, restore and delete hold" || { echo "  ✗ org undo drift — run: node tools/org-undo-selftest.mjs"; fail=1; }
echo "· measures selftest (sprint 3 S3b — the beta measures equal a recount; eval rows never count)"
node tools/measures-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the beta measures equal their recount" || { echo "  ✗ measures drift — run: node tools/measures-selftest.mjs"; fail=1; }
echo "· checklist roles selftest (sprint 3 S3b — the checklist offers each role only calls the door lets it make)"
node tools/checklist-roles-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the checklist and the door agree for every role" || { echo "  ✗ checklist roles drift — run: node tools/checklist-roles-selftest.mjs"; fail=1; }
echo "· confirm and card selftest (sprint 3 D3 — the confirm's binding to the person, the session and a nonce; the card is one self-contained document with no network and no caller data; expired unfiled previews are pruned)"
node tools/confirm-card-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the confirm's binding, the card's document and the prune hold" || { echo "  ✗ confirm/card drift — run: node tools/confirm-card-selftest.mjs"; fail=1; }
node tools/dual-era-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the door speaks both MCP revisions (discover, the spec's codes, the confirm's retry)" || { echo "  ✗ dual-era drift — run: node tools/dual-era-selftest.mjs"; fail=1; }
echo "· project rule selftest (sprint 3 D6 — ONE rule finds the project a request reads; twelve identities, a read, a write and an extract, named or not, in a one-project and a two-project org: every answer equals the recorded one; the Partner fence holds)"
node tools/project-rule-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the project rule answers as recorded for every identity" || { echo "  ✗ project rule drift — run: node tools/project-rule-selftest.mjs"; fail=1; }
echo "· arch and render selftests (the Architecture view's model and layout; the render sanitiser, sizes and image checks)"
node tools/arch-selftest.mjs >/dev/null 2>&1 && node tools/render-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the Arch view and the render rules hold" || { echo "  ✗ arch or render drift — run: node tools/arch-selftest.mjs; node tools/render-selftest.mjs"; fail=1; }
echo "· counter door selftest (UI-B4a C5 — a named parent must exist in the filer's project: an unknown or another project's parent answers 422 unknown_parent with nothing written and no foreign-key throw, a batch naming one is refused whole; the real ledger write over a real SQLite D1)"
node tools/counter-door-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the parent check holds (filed, unknown, another project, the owner, the batch, no target)" || { echo "  ✗ counter door drift — run: node tools/counter-door-selftest.mjs"; fail=1; }
echo "· rank door selftest (UI-B4b, QEFC716D5 — a rank is ONE filing: kind rank, parent <id>, lane leader, routed auto, filed by any reader seated on the ranked filing's project (the owner on any); Build's Ranked order puts the newest press first for everyone; another project's reader, a missing id and a rank filing answer the same 404 with nothing written; POST /rank as JSON and as a form through the real handler, read-only and unauthenticated refused; the build tool the same seam; rank has no tool, D5)"
node tools/rank-door-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the rank door holds (seated, the newest press first, 404 elsewhere, the form and JSON faces, the build tool)" || { echo "  ✗ rank door drift — run: node tools/rank-door-selftest.mjs"; fail=1; }
echo "· versions selftest (a project's versions are snapshots in D1, src/knowledge/versions.js: every knowledge table snapshotted from the registry, an exact round trip, a restore rewrites only changed rows and keeps what it replaced, atomic with its one ledger row, the chunk bound proven from the registry, the owner alone through every door)"
node tools/versions-selftest.mjs >/dev/null 2>&1 && echo "  ✓ versions hold (a snapshot per publish in D1, an exact round trip, a restore rewrites only changed rows, atomic, the owner alone)" || { echo "  ✗ versions drift — run: node tools/versions-selftest.mjs"; fail=1; }
echo "· report selftest (src/report.js — the batch/backfill report renderer; lights report.js)"
node tools/report-selftest.mjs >/dev/null 2>&1 && echo "  ✓ report renders and escapes" || { echo "  ✗ report selftest drift — run: node tools/report-selftest.mjs"; fail=1; }
echo "· rt selftest (src/rt.js: the eight sections, the route table, the stamp/gap/trail renderers, the escaping rule, the id rule; lights rt.js)"
node tools/rt-selftest.mjs >/dev/null 2>&1 && echo "  ✓ rt report toolkit holds" || { echo "  ✗ rt selftest drift — run: node tools/rt-selftest.mjs"; fail=1; }
echo "· your items selftest (one-mind WP5 — threadFor, the 'yours' of updates: one list, newest first, one tempo word per item; the page count is the door count)"
node tools/thread-selftest.mjs >/dev/null 2>&1 && echo "  ✓ your items hold on both doors" || { echo "  ✗ thread drift — run: node tools/thread-selftest.mjs"; fail=1; }




echo "· door contract (M-ADR-038 — contracts/door.json derived from the registries + the declared shapes; a caller reads this file, never R's source)"
CONTRACTS_DIR="${AGENT_R_CONTRACTS:-$([ -d contracts ] && echo contracts || echo ../contracts)}"   # the one rule (tools/make-door-contract.py · tools/handoff-selftest.mjs)
# UI-B8a (QFAEA20A3): the generator also writes src/doorcontract.js (GET /contract serves it); both are diffed, and the
# module must be tracked (git diff --quiet cannot see an untracked file)
python3 tools/make-door-contract.py > /tmp/.door-contract.out 2>&1 && [ -f "$CONTRACTS_DIR/door.json" ] && git ls-files --error-unmatch src/doorcontract.js >/dev/null 2>&1 && git diff --quiet -- "$CONTRACTS_DIR/door.json" src/doorcontract.js \
  && echo "  ✓ contract current ($CONTRACTS_DIR/door.json + src/doorcontract.js)" || { echo "  ✗ door contract drift — run: python3 tools/make-door-contract.py && git add $CONTRACTS_DIR/door.json src/doorcontract.js"; fail=1; }
# sprint 5 A2: the Arch view ships src/archclientdata.js, src/archclient.js ARCH_CLIENT_SRC minified by
# tools/make-arch-client.mjs (esbuild, whitespace only); it must be tracked and be exactly what the source makes now
echo "· the shipped Arch client is the source's build (A2)"
git ls-files --error-unmatch src/archclientdata.js >/dev/null 2>&1 && node tools/make-arch-client.mjs --check > /tmp/.arch-client.out 2>&1 \
  && echo "  $(cat /tmp/.arch-client.out)" || { echo "  ✗ Arch client drift — run: node tools/make-arch-client.mjs && git add src/archclientdata.js"; fail=1; }
echo "· the plugin's skills are the presets' and its version moves with its content (sprint 9, 9.1 and the review's B1: plugin/skills/ and plugin.json's version GENERATED by tools/make-plugin-skills.mjs)"; node tools/make-plugin-skills.mjs --check > /tmp/.plugin-skills.out 2>&1 && echo "  $(cat /tmp/.plugin-skills.out)" || { echo "  ✗ plugin skills drift — run: node tools/make-plugin-skills.mjs"; fail=1; }
echo "· the dist repo's sync mirrors the plugin exactly and refuses any other clone (sprint 10, 10.2: tools/make-plugin-skills.mjs --sync / --sync-check)"; node tools/plugin-sync-selftest.mjs > /tmp/.plugin-sync.out 2>&1 && echo "  $(tail -1 /tmp/.plugin-sync.out)" || { cat /tmp/.plugin-sync.out; echo "  ✗ plugin sync selftest"; fail=1; }
echo "· the Codex manifest and the OpenAI ZIP (sprint 11, 11.4: tools/make-plugin-skills.mjs generates plugin/.codex-plugin/plugin.json; --openai-zip)"; node tools/plugin-codex-selftest.mjs > /tmp/.plugin-codex.out 2>&1 && echo "  $(tail -1 /tmp/.plugin-codex.out)" || { cat /tmp/.plugin-codex.out; echo "  ✗ plugin codex selftest"; fail=1; }
echo "· the listing's docs page is the contract's (sprint 9, 9.3: listing/docs.html GENERATED by tools/make-listing-docs.mjs)"; node tools/make-listing-docs.mjs --check > /tmp/.listing-docs.out 2>&1 && echo "  $(cat /tmp/.listing-docs.out)" || { echo "  ✗ listing docs drift — run: node tools/make-listing-docs.mjs"; fail=1; }
echo "· annotations selftest (D5 — every tool's title and its four MCP annotations: door.json and tools/list agree, readOnlyHint iff the row neither writes nor stores, a read-only tool called writes no row; titles of at most 4 words, descriptions of at most 3 sentences, no old name; GET /capabilities serves the inventory the generator wrote, diffed above)"
node tools/annotations-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the tools' titles and annotations are true" || { echo "  ✗ annotations drift — run: node tools/annotations-selftest.mjs"; fail=1; }

echo "· knowledge core selftests (the validators and the write door on a real SQLite built from boot.sql; the canvas round trip; the importer's mappers and batches)"
node tools/knowledge-selftest.mjs >/dev/null 2>&1 && node tools/canvas-selftest.mjs >/dev/null 2>&1 && node tools/integrity-selftest.mjs >/dev/null 2>&1 && node tools/import/selftest.mjs >/dev/null 2>&1 \
  && echo "  ✓ the knowledge core, the canvas assembly and the importer hold" || { echo "  ✗ knowledge core red — run: node tools/knowledge-selftest.mjs; node tools/canvas-selftest.mjs; node tools/integrity-selftest.mjs; node tools/import/selftest.mjs"; fail=1; }

echo "· tally selftest (migrate-042 — the four tally tables stay exact under 3,000 random writes, every read moved onto a tally answers what the ledger query answered, a dropped trigger goes red)"
node tools/tally-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the tallies hold" || { echo "  ✗ tally drift — run: node tools/tally-selftest.mjs"; fail=1; }

echo "· map selftests (sprint 2, the Map, the main tab — migrate-043: k_node_lights and k_node_links stay exact under random grades, refs and edges, both equal what the checks and the edges answer, a dropped trigger goes red, the migration backfills and replays; the layered layout is deterministic, groups a big column, and the kit the page embeds draws the same SVG alone; a flow's playback resolves its steps)"
node tools/maplights-selftest.mjs >/dev/null 2>&1 && node tools/map-selftest.mjs >/dev/null 2>&1 && echo "  ✓ the Map's lights, links and layout hold" || { echo "  ✗ map drift — run: node tools/maplights-selftest.mjs; node tools/map-selftest.mjs"; fail=1; }

echo "· relocate selftest (M-ADR-038 — the engine finds contracts/ from sharingu/engine/, the monorepo layout; the rehearsal caught it red)"
sh tools/relocate-selftest.sh >/dev/null 2>&1 && echo "  ✓ engine relocatable (contracts/ resolved beside AND above)" || { echo "  ✗ relocation drift — run: sh tools/relocate-selftest.sh"; fail=1; }


echo "· suite marks (M-ADR-036 — every row a suite files carries the eval mark; the live net is tools/residue-audit.sh)"
python3 tools/check-suite-marks.py >/dev/null 2>&1 && echo "  ✓ every suite filing carries the eval mark" || { echo "  ✗ a suite files an unmarked row — run: python3 tools/check-suite-marks.py"; fail=1; }


echo "· lib.sh CF credential-resolution selftest (Q65300E50 — the three-line env only, AGENT_R_ENV_PREFIX ignored, no pool file ever read even when one sits right there)"
sh tools/lib-cf-fallback-selftest.sh >/dev/null 2>&1 && echo "  ✓ credential resolution holds: three lines only, no prefix, no pool" || { echo "  ✗ lib.sh CF-resolution drift — run: sh tools/lib-cf-fallback-selftest.sh"; fail=1; }

echo "· teardown-org.sh name guard selftest (R3 — siru · ryuklabs · frame refused by name before any credential check; mutation-proven load-bearing)"
sh tools/teardown-guard-selftest.sh >/dev/null 2>&1 && echo "  ✓ the protected-name guard holds and is load-bearing" || { echo "  ✗ teardown name-guard drift — run: sh tools/teardown-guard-selftest.sh"; fail=1; }

echo "· r-local selftest (R4 — the local-R config generator: four holes filled, no triggers block, main is an absolute existing path, the 8792 port guard and the port cache hold; pure — no wrangler process, no network)"
sh tools/r-local-selftest.sh >/dev/null 2>&1 && echo "  ✓ local-R config generation + port/state guards hold" || { echo "  ✗ r-local drift — run: sh tools/r-local-selftest.sh"; fail=1; }

echo "· new-org selftest (bug0914:new-org-crashes-after-create-on-a-seed-without-manifest — new-org.sh's no_fault/no_recover rollback-on-fail logic; pure — no wrangler process, no network, no Cloudflare account)"
sh tools/new-org-selftest.sh >/dev/null 2>&1 && echo "  ✓ fault-hook/recovery logic hold" || { echo "  ✗ new-org selftest drift — run: sh tools/new-org-selftest.sh"; fail=1; }

echo "· new-org flow selftest (sprint 7, 7.6, a second platform's first deploy (engine/ORG-SETUP.md) — tools/new-org.sh end to end against a stubbed wrangler, Cloudflare API and operator tool: the caps, D1/R2/KV in order and R2 read back, the config from the template, boot.sql the ONE write (an empty platform, no key minted), stdin closed on every hidden-output wrangler call, the wait on /health's d1 and GET /signup, the installer's email allowed after the deploy, the /signup, /orgs/new, acceptance and connect lines; a missing R2 stops before the deploy, a bad email before any call, a refused allow rolls nothing back; offline)"
sh tools/new-org-flow-selftest.sh >/dev/null 2>&1 && echo "  ✓ new-org.sh boots an empty platform on its own config, allows the installer, and stops on a missing R2" || { echo "  ✗ new-org flow drift — run: sh tools/new-org-flow-selftest.sh"; fail=1; }

echo "· day0-verify shape-classifier selftest (bug0914:day0-verify-assumes-a-multi-project-org — day0_shape's >=2 threshold, the DAY0_FORCE_SHAPE test-only override, mutation-proven load-bearing; pure — no network, no live tenant)"
sh tools/day0-shape-selftest.sh >/dev/null 2>&1 && echo "  ✓ the shape classifier holds" || { echo "  ✗ day0-shape drift — run: sh tools/day0-shape-selftest.sh"; fail=1; }

echo "· teardown-org.sh backoff selftest (bug0914:day0-verify-assumes-a-multi-project-org — wait_absent's bound/backoff bookkeeping: settles present->present->gone, INCOMPLETE past the bound, 'unknown' never counts as gone; DI'd reads, no network, no real sleep)"
sh tools/teardown-backoff-selftest.sh >/dev/null 2>&1 && echo "  ✓ the bounded-backoff retry logic holds" || { echo "  ✗ teardown-backoff drift — run: sh tools/teardown-backoff-selftest.sh"; fail=1; }

echo "· r-local launchd generator parses (R4 — the optional login bring-up unit; rendered with dummy values, linted)"
sh -n tools/r-local.sh && sh -n tools/r-local-launchd.sh \
  && sed -e "s|__ORG__|x|g;s|__ENGINE__|/tmp|g;s|__PORT__|8850|g;s|__STATE_DIR__|/tmp|g;s|__LAN_FLAG__||g" \
       tools/launchd/com.sharingu.agent-r.local.plist.template > /tmp/.r-local-launchd-gate.xml \
  && plutil -lint /tmp/.r-local-launchd-gate.xml >/dev/null 2>&1 \
  && echo "  ✓ r-local.sh · r-local-launchd.sh · the plist template (rendered with dummy values, linted)" \
  || { echo "  ✗ r-local launchd generator or its plist template does not parse"; fail=1; }


echo "· ship selftest (build0925-engine-safe-ship — tools/ship.sh's upload (--tag <short sha>[-dirty], U-READY-e) → preview smoke (versionId + the version record's workers/tag, U-READY-e2) → 10% → canary smoke → 100% → rollback-on-failure and tools/migrate.sh's bookmark-before-apply, walked OFFLINE against a stubbed npx wrangler + curl on PATH in a throwaway tree whose own gate.sh is a stub: no Cloudflare call, no recursion into this gate)"
sh tools/ship-selftest.sh >/dev/null 2>&1 \
  && echo "  ✓ every ship/rollback/migrate branch holds against the stubbed wrangler" \
  || { echo "  ✗ ship/migrate drift — run: sh tools/ship-selftest.sh"; fail=1; }

echo "· cf-budget selftest (Q9CF32D8F — tools/cf-budget.sh, the Cloudflare free-tier guard ship.sh / migrate.sh / every --live suite run calls first: below · WARN at 80% · REFUSE at 95% of any limit · API unreadable = REFUSE, walked OFFLINE against a stubbed curl with fake credentials: no network)"
sh tools/cf-budget-selftest.sh >/dev/null 2>&1 \
  && echo "  ✓ below / warn / refuse / unreadable all hold against the stubbed analytics" \
  || { echo "  ✗ cf-budget drift — run: sh tools/cf-budget-selftest.sh"; fail=1; }

echo "· suite-target selftest (Q9CF32D8F — tools/lib.sh's target switch: LOCAL R by default with zero Cloudflare calls and no credentials in any child, --live / SUITE_TARGET=live runs tools/cf-budget.sh BEFORE the live mint and stops on its refusal, an already-up local R is reused and left running, AR_SKIP_MINT stays offline; walked against stubbed r-local/cf-budget/npx/curl in a throwaway tree)"
sh tools/suite-target-selftest.sh >/dev/null 2>&1 \
  && echo "  ✓ local by default, live only on --live and only past the budget guard" \
  || { echo "  ✗ suite-target drift — run: sh tools/suite-target-selftest.sh"; fail=1; }

echo "· parked selftest (QB54D2BC4 — owner 2026-09-25: platform + ryuklabs only; tools/lib.sh PARKED_CASES is the ONE list: each listed case prints a counted 'SKIP  <id> parked (…)' on every target, an unlisted id runs, emptying the list un-parks, pick_project never picks a PARKED_PROJECTS filing project, and every listed id is wrapped by a parked call in evals.sh/sims.sh; offline, AR_SKIP_MINT=1)"
sh tools/parked-selftest.sh >/dev/null 2>&1 \
  && echo "  ✓ the parked list and its wraps agree; each parked case is a named, counted skip" \
  || { echo "  ✗ parked drift — run: sh tools/parked-selftest.sh"; fail=1; }

echo "· mint-scope selftest (QB54D2BC4 / eval-seat-scope C4d — tools/lib-mint-seat.sh MINT_PROJECTS is the ONE list: the fixed eval seats live in the suites' own org (sprint 6, 6.6: settings.suites, never org 1 — every people row inserted and activated there) and are seated only on its workspaces on the list (slug IN the list), each seated eval-fixed id's seats outside it are pruned (and no DELETE names anyone else), the tester stays seatless and mint_sweep deletes any seat it was left holding (U-READY-e — naming no one else), and an empty list refuses before any D1 write; offline, mint_d1 stubbed)"
sh tools/mint-scope-selftest.sh >/dev/null 2>&1 \
  && echo "  ✓ the eval seats live in the suites' own org and are scoped to its workspaces, one list" \
  || { echo "  ✗ mint-scope drift — run: sh tools/mint-scope-selftest.sh"; fail=1; }

echo "· build dry-run (wrangler bundles, no deploy — wrangler.jsonc is now ryuklabs-agent-r's own config, QC74D4892)"
# UI-B8a: src/doorcontract.js (door.json, ~130 KB) rides the bundle, so the bundle is measured against the free plan's
# 3 MB worker limit (gzip, as Cloudflare counts it) on every gate run
rm -rf /tmp/ryuklabs-worker-build
npx --yes wrangler deploy --dry-run --outdir /tmp/ryuklabs-worker-build >/dev/null 2>&1 \
  && echo "  ✓ builds clean" || { echo "  ✗ build failed — run: npx wrangler deploy --dry-run"; fail=1; }
BUNDLE_GZ=0; [ -s /tmp/ryuklabs-worker-build/index.js ] && BUNDLE_GZ=$(gzip -9 -c /tmp/ryuklabs-worker-build/index.js | wc -c | tr -d ' ')
if [ "$BUNDLE_GZ" -gt 0 ] && [ "$BUNDLE_GZ" -lt 3145728 ]; then echo "  ✓ bundle $BUNDLE_GZ bytes gzipped, under the 3 MB free-plan limit"
else echo "  ✗ bundle ${BUNDLE_GZ:-unmeasured} bytes gzipped: not under the 3 MB free-plan limit (or the dry-run wrote nothing)"; fail=1; fi

echo ""
if [ "$fail" -eq 0 ]; then
 
# --- the Map's client script (src/mapclient.js is a real module: node --check sees it; the map selftest runs it in
# a small fake page, so a broken client goes red above, never here)
node --check src/mapclient.js 2>/dev/null || { echo "✗ the Map client script has a syntax error"; exit 1; }
echo "· the Map client script parses"
 echo "✓ GATE GREEN — safe to ship (sh tools/ship.sh → then sh evals.sh)"
else
  echo "✗ GATE RED — fix before deploy"; exit 1
fi
# durable record of this gate run (M-ADR-029 — engine signals feed the platform's state).
# commit: this run's HEAD (a gate record from an older commit than the engine's current HEAD is stale, never
# counted as green).
mkdir -p .runs 2>/dev/null; printf '{"suite":"gate","green":%s,"steps":%s,"commit":"%s","at":"%s"}\n' "$([ "$fail" -eq 0 ] && echo true || echo false)" "$(grep -c '^echo "· ' gate.sh)" "$(git rev-parse HEAD 2>/dev/null || echo unknown)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .runs/gate.json 2>/dev/null
