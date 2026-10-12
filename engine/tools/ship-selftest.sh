#!/bin/sh
# tools/ship-selftest.sh — the OFFLINE proof of the safe-ship ritual (build0925-engine-safe-ship, 2026-09-25;
# brief 02_AGENT_R/next-batch-engine-fast-gate.md item 3). A gate step.
#
# HOW IT STAYS OFFLINE (and never recurses into the gate): the REAL tools/ship.sh and tools/migrate.sh are COPIED,
# byte-identical, into a throwaway engine tree whose own gate.sh is a stub — ship.sh always runs the gate.sh beside
# it, so there is NO bypass hook in ship.sh at all (a real ship can never skip the real gate). A stub bin dir is
# FIRST on PATH: `npx` (→ the stub wrangler), `wrangler`, `curl` and `sleep`. The stub wrangler is STATEFUL — it
# keeps the live deployment in a file, so `versions deploy` / `rollback` really change what `deployments status`
# reads back. HOME and SHARINGU_ENV_PATH point into the throwaway tree (fake credentials; ~/.sharingu is never
# read), so even a leaked real call could not authenticate. Every stub call lands in one ordered log; each case
# asserts on that log and on the final live state.
#
# Cases: happy path (gate → status → upload → preview smoke → 10% → canary smoke → 100% → smoke → triggers) ·
# a red gate makes no Cloudflare call · preview smoke fail (nothing promoted, no rollback — no traffic moved) ·
# canary smoke fail → rollback · production smoke fail → rollback · WHICH VERSION ANSWERED (batch:ship-canary-pin):
# /health's versionId per phase — pin honoured / honoured late / never honoured (skipped, not failed, not passed) ·
# 100% answering the old id for all SHIP_READS_PROD=30 reads → rollback · THE 100% PROPAGATION WINDOW
# (batch:ship-100-wait): 100% answering the old id for 20 reads, then the new → shipped, no rollback, the
# `· waiting for …` progress printed · a page answering 000 once then 200 → passes · 000 twice → ✗ + rollback · a
# 500 page is requested exactly once (only 000 is retried) · the preview answering another id → not promoted · promote 10% fail → rollback · promote 100%
# fail → rollback · a silently-skipped rollback is caught · no preview URL → refused, nothing promoted · a split
# already live → refused before upload · a retired target refused by name · the explicit rollback verb (no gate) ·
# U-READY-e: the upload carries --tag (unknown outside git · the short=9 sha · <sha>-dirty) · U-READY-e2: the tag is
# proven from the VERSION RECORD (`versions view --json` annotations["workers/tag"]) — (a) record == tag and /health
# carries no versionTag (the real shape) → shipped, and with /health agreeing → shipped · (b) record != tag → not
# promoted · (c) record unreadable (wrangler error · no workers/tag key) → not promoted · (d) /health versionTag
# present and != tag → not promoted ·
# migrate.sh: bookmark strictly before apply + the restore command printed · no bookmark → no apply · a bad
# argument → no Cloudflare call · ship.sh never calls migrate.sh · THE BUDGET GUARD (Q9CF32D8F): the real
# tools/cf-budget.sh is copied in too and the stub curl answers its GraphQL read (STUB_BUDGET: below by default ·
# refuse · down) — it runs after the gate and before the first wrangler call; a refusing or unreadable budget makes
# no wrangler call at all; the rollback verb never consults it; migrate.sh refuses before the bookmark ·
# THE CROSS-ORG SUITE ON THE PREVIEW (sprint 6, PLATFORM §5): tools/attack-xorg.mjs is a STUB in the throwaway tree (it logs its
# arguments, exits STUB_XORG_RC; the real walk is never run here) — ship.sh calls it once, on the preview URL with --live and
# --live-write-ok, after the preview smoke and the tag proof and BEFORE the preview hook and the 10% promote; its failure is the
# not-promoted path (no versions deploy, no rollback needed, the hook never runs); a failed preview smoke never reaches it ·
# ship-plan.sh: 067 (BEFORE) -> the code -> 068's preflight -> 068 (right after 100%) -> 069's preflight -> 069 (AFTER, read from
# their ORDER lines), then the per-org restore's rehearsal, the walk last (no R2 step: the sprint-6 ship moved org 1's bare keys
# and the worker's dual-read is gone); each step's undo BY PHASE (the code's rollback until 068 lands, then 068's down script
# first) ·
# THE ROLLBACK AFTER 068 (the sprint-6 review's finding 1): the rollback verb reads live's schema first — migrate-068's triggers
# standing: REFUSED with the down script printed first (no wrangler rollback); --org-required-ok proceeds; an unreadable schema
# refuses too; none: as before ·
# THE SUITE'S SIGNALS AND ITS RECORD (finding 17): a failed suite's orgs.json is read — each throwaway left and the exact
# --cleanup command printed, and that command walked against the stub removes them; a SIGHUP (and a SIGINT) to ship.sh's whole
# process group mid-suite (a terminal's hangup, run by a python runner in its own session) reaches the suite as ONE SIGTERM, the
# suite cleans up, ship.sh waits for it and promotes nothing.
# THE RUN RECORD AND THE RESUME (7.0b), in a throwaway git checkout: a clean run writes every milestone; a rerun reuses gate,
# upload, preview smoke, suite and walk and only promotes; a vanished upload is uploaded afresh and everything after it rerun; a
# the record is keyed by what ships (engine/ + contracts/): a docs/plan-only commit or edit keeps the resume, a change under
# engine/ or contracts/ (committed or not) and --fresh reuse nothing; a run KILLED (SIGKILL to its group) mid-walk resumes at the walk, one
# killed after 100% finishes without re-promoting (and never rolls back by itself), one killed in its canary is refused with the
# record's undo; promotion is never reused; stranded throwaways are cleaned before the suite (a failed cleanup, or a record naming
# org 1, stops it); live is read on every run and again before 10% and before 100%.
# THE SPRINT-7 REVIEW'S FIXES: (D2+B3) after its live read ship.sh reads live's orgs' path names and runs check-org-names.mjs (a
# stub here: STUB_NAMES_RC) over them BEFORE anything is uploaded — red, or the names unreadable: nothing uploaded, nothing promoted;
# (D5) it reads live's schema (its migration level, through ship-plan-migrations.py) and keys the preview smoke, the cross-org
# suite and the walk by it — a rerun on the same version at ANOTHER level reruns all three (said), at the same level reuses them;
# the schema unreadable: not shipping; (D6) the walk is handed --operator-config and --confirm-live (its clean-up removes its two
# people's accounts) and a record's throwaway whose accounts are left counts as left; ship-plan: (D2) the org names read and
# checked in section 1 and printed as a read-only step after the migrations before the code and before it; (D7, sprint 7's; its
# step left the plan with that ship) the live walk the ship's own last step, the owner's one-time steps after it; (D8) --no-import: no import, no hook, the code ONE `sh tools/ship.sh` step, exit 0 when
# nothing else gaps.
#
# SPRINT 10: ship-plan's one-time steps are THIS ship's (sprint 9's site redeploy and "the repo goes public" gone; THE OWNER'S
# distribution-repo sync after the walk, before the M4 step); tools/route-domains.mjs reads the Custom Domains from
# wrangler.jsonc (exactly the two on the real config; none, unreadable, a path pattern: exit 1; JSONC comments and trailing
# commas) and verify-live.sh types none of them (10.4).
#
# SHIP_SELFTEST_SHIP / SHIP_SELFTEST_MIGRATE / SHIP_SELFTEST_PLAN / SHIP_SELFTEST_ROUTES / SHIP_SELFTEST_VERIFY (optional) point this selftest at a MUTANT copy — how the PR proves
# each check can fail. They change which file is copied into the throwaway tree, never ship.sh's own behaviour.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
SHIP_SRC="${SHIP_SELFTEST_SHIP:-$ENGINE/tools/ship.sh}"
MIGRATE_SRC="${SHIP_SELFTEST_MIGRATE:-$ENGINE/tools/migrate.sh}"
T="$(mktemp -d "${TMPDIR:-/tmp}/ar-ship-selftest.XXXXXX")"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

PRE=aaaaaaaa-1111-4111-8111-111111111111
NEW=bbbbbbbb-2222-4222-8222-222222222222
BM=00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683

# ── the throwaway engine tree ──────────────────────────────────────────────────────────────────────────────────
mkdir -p "$T/engine/tools" "$T/bin" "$T/home"
cp "$SHIP_SRC" "$T/engine/tools/ship.sh"
cp "$MIGRATE_SRC" "$T/engine/tools/migrate.sh"
cp "$ENGINE/tools/lib-mint-seat.sh" "$ENGINE/tools/lib_wrangler_json.py" "$ENGINE/tools/cf-budget.sh" "$T/engine/tools/"
# S4: the ship plan (read-only) and what it reads
PLAN_SRC="${SHIP_SELFTEST_PLAN:-$ENGINE/tools/ship-plan.sh}"
cp "$PLAN_SRC" "$T/engine/tools/ship-plan.sh"
cp "$ENGINE/tools/ship-plan-migrations.py" "$ENGINE/tools/lib-import-sources.sh" "$T/engine/tools/"
mkdir -p "$T/engine/tools/import" && cp "$ENGINE/tools/import/cost.mjs" "$T/engine/tools/import/"
cp "$ENGINE/wrangler.jsonc" "$T/engine/"
# the cross-org suite: a STUB that logs its arguments and exits STUB_XORG_RC (never the real walk: no worker, no database here)
# It keeps the real record's shape: <run dir>/orgs.json lists each throwaway org with its state (STUB_XORG_LEFT=1: one is left
# "restored"); STUB_XORG_MODE=hang waits for a SIGTERM (logs "xorg term", deletes both, exits 1) — a SIGHUP kills it (node's
# default); --cleanup <run dir> logs its arguments and marks every org of the record deleted (STUB_XORG_CLEANUP_RC: it fails,
# marking nothing)
cat > "$T/engine/tools/attack-xorg.mjs" <<'EOF'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const a = process.argv.slice(2), arg = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : null);
const save = (dir, states) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "orgs.json"), JSON.stringify({ flags: "--live --config wrangler.jsonc --live-write-ok", orgs: [{ org: 7, name: "xorg-a", state: states[0] }, { org: 8, name: "xorg-b", state: states[1] }] })); };
if (arg("--cleanup")) {
  appendFileSync(process.env.STUB_LOG, `xorg-cleanup ${a.join(" ")}\n`);
  if (process.env.STUB_XORG_CLEANUP_RC) { console.log("✗ attack-xorg (cleanup): an org is left (stub)"); process.exit(Number(process.env.STUB_XORG_CLEANUP_RC)); }
  const f = join(arg("--cleanup"), "orgs.json"), rec = JSON.parse(readFileSync(f, "utf8"));
  for (const o of rec.orgs) { o.state = "deleted"; if (o.accounts) o.accounts = "removed"; }
  writeFileSync(f, JSON.stringify(rec));
  console.log("✓ attack-xorg (cleanup): every throwaway org is gone (stub)");
  process.exit(0);
}
appendFileSync(process.env.STUB_LOG, `xorg ${a.join(" ")}\n`);
const dir = arg("--run-dir");
// 10.5 (the review's L1): whether an earlier run's fivexx.json stood in the run dir at launch; STUB_XORG_FIVEXX=1 keeps one
appendFileSync(process.env.STUB_LOG, `xorg5xx-at-launch ${existsSync(join(dir, "fivexx.json")) ? "yes" : "no"}\n`);
if (process.env.STUB_XORG_FIVEXX) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "fivexx.json"), JSON.stringify([{ who: "stub", what: "x", status: 500, body: "stub" }])); }
if (process.env.STUB_XORG_MODE === "hang") {
  save(dir, ["restored", "restored"]);
  process.on("SIGTERM", () => { appendFileSync(process.env.STUB_LOG, "xorg term\n"); save(dir, ["deleted", "deleted"]); console.log("✗ attack-xorg (preview): stopped by SIGTERM; both throwaway orgs deleted (stub)"); process.exit(1); });
  appendFileSync(process.env.STUB_LOG, "xorg started\n");
  setTimeout(() => { appendFileSync(process.env.STUB_LOG, "xorg timeout\n"); process.exit(3); }, 20000);
} else {
  const rc = Number(process.env.STUB_XORG_RC || 0);
  save(dir, [process.env.STUB_XORG_LEFT ? "restored" : "deleted", "deleted"]);
  console.log(rc ? "✗ attack-xorg (preview): 1 finding(s) (stub)" : "✓ attack-xorg (preview): 0 rows of the other org read, 0 written (stub)");
  process.exit(rc);
}
EOF
# the walk: a STUB that logs its arguments and what it was handed (the creds file: a key line, its mode), exits STUB_WALK_RC;
# STUB_WALK_MODE=hang logs "walk started" and waits (the run is then killed: 7.0b's resume cases)
cat > "$T/engine/tools/live-walk.mjs" <<'EOF'
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
const a = process.argv.slice(2), f = a[a.indexOf("--creds") + 1];
appendFileSync(process.env.STUB_LOG, `walk ${a.join(" ")}\n`);
const keyed = existsSync(f) && /^[A-Z0-9_]+_AGENT_R_OWNER_KEY=\S+$/m.test(readFileSync(f, "utf8"));
appendFileSync(process.env.STUB_LOG, `walk creds ${keyed ? "keyed" : "NOT keyed"} mode ${existsSync(f) ? (statSync(f).mode & 0o777).toString(8) : "none"}\n`);
if (process.env.STUB_WALK_MODE === "hang") { appendFileSync(process.env.STUB_LOG, "walk started\n"); setTimeout(() => process.exit(3), 20000); }
else {
const rc = Number(process.env.STUB_WALK_RC || 0);
console.log(rc ? "✗ live walk: 26 of 27 steps passed on stub (stub)" : "✓ live walk: 27 of 27 steps passed on stub (stub)");
process.exit(rc);
}
EOF
# the org-names check (D2+B3): a STUB that logs its arguments and exits STUB_NAMES_RC (the real check reads src/, absent here)
cat > "$T/engine/tools/check-org-names.mjs" <<'EOF'
import { appendFileSync } from "node:fs";
const a = process.argv.slice(2);
appendFileSync(process.env.STUB_LOG, `names ${a.join(" ")}\n`);
const rc = Number(process.env.STUB_NAMES_RC || 0);
if (rc) { console.log(`  ✗ an org holds "${(a[a.indexOf("--slugs") + 1] || "").split(",").pop()}", a name the door uses: rename that org (stub)`); console.log("✗ org names: 1 miss(es)"); }
else console.log("✓ org names: 113 route paths answered, every first segment reserved (stub)");
process.exit(rc);
EOF
printf 'SELECT 1;\n' > "$T/engine/migrate-999.sql"
cat > "$T/engine/gate.sh" <<'EOF'
#!/bin/sh
echo "gate" >> "$STUB_LOG"
exit "${STUB_GATE_RC:-0}"
EOF
# the docs gate a REUSED gate runs again (the run record's key covers engine/ and contracts/, not docs/)
cat > "$T/engine/tools/check-docs.py" <<'EOF'
import os, sys
open(os.environ["STUB_LOG"], "a").write("check-docs\n")
sys.exit(int(os.environ.get("STUB_DOCS_RC", "0")))
EOF
cat > "$T/env.sh" <<'EOF'
CLOUDFLARE_API_TOKEN=stub-not-a-token
CLOUDFLARE_ACCOUNT_ID=stub-account
EOF

# ── the stubs ──────────────────────────────────────────────────────────────────────────────────────────────────
cat > "$T/bin/npx" <<'EOF'
#!/bin/sh
[ "$1" = "--yes" ] && shift
[ "$1" = "wrangler" ] || { echo "npx-unexpected $*" >> "$STUB_LOG"; exit 97; }
shift; exec "$STUB_BIN/wrangler" "$@"
EOF
cat > "$T/bin/wrangler" <<'EOF'
#!/bin/sh
# stateful wrangler stub — $STUB_STATE holds the live deployment as "<id> <pct>" lines
echo "wrangler $*" >> "$STUB_LOG"
case "$1 $2" in
  "deployments status")
    [ -n "$STUB_STATUS_FAIL" ] && { echo "✘ [ERROR] status unreachable" >&2; exit 1; }
    python3 - "$STUB_STATE" <<'PY'
import json, sys
vs = [{"version_id": l.split()[0], "percentage": float(l.split()[1])} for l in open(sys.argv[1]) if l.strip()]
print(json.dumps({"id": "dep-stub", "source": "api", "strategy": "percentage", "versions": vs}, indent=2))
PY
    ;;
  "versions upload")
    # U-READY-e: the --tag value is logged and kept beside the state; the preview /health answers it as versionTag
    tag=""; prev=""; for a in "$@"; do [ "$prev" = "--tag" ] && tag="$a"; prev="$a"; done
    echo "versions upload tag=$tag" >> "$STUB_LOG"; printf '%s' "$tag" > "$STUB_STATE.tag"
    mkdir -p "$STUB_BIN/../vtags" && printf '%s' "$tag" > "$STUB_BIN/../vtags/$STUB_NEW"   # Cloudflare keeps a version's record across runs
    echo "⛅️ wrangler 4.131.2 (stub)"; echo "Total Upload: 900.00 KiB / gzip: 200.00 KiB"
    echo "Uploaded ryuklabs-agent-r (1.23 sec)"
    echo "Worker Version ID: $STUB_NEW"
    [ -n "$STUB_NO_PREVIEW" ] || echo "Version Preview URL: https://$(printf '%.8s' "$STUB_NEW")-ryuklabs-agent-r.stubsub.workers.dev"
    echo "To deploy this version to production traffic use the command wrangler versions deploy" ;;
  "versions view")
    # U-READY-e2: the version RECORD — annotations["workers/tag"] is the uploaded --tag (STUB_VIEW_TAG overrides it);
    # STUB_VIEW_FAIL: wrangler errors · STUB_VIEW_NOKEY: the record carries no workers/tag
    echo "versions view $3" >> "$STUB_LOG"
    [ -n "$STUB_VIEW_FAIL" ] && { echo "✘ [ERROR] version not found (stub)" >&2; exit 1; }
    [ "$3" = "$STUB_VIEW_GONE" ] && { echo "✘ [ERROR] version $3 not found (stub: STUB_VIEW_GONE)" >&2; exit 1; }
    vt="${STUB_VIEW_TAG:-$(cat "$STUB_BIN/../vtags/$3" 2>/dev/null || cat "$STUB_STATE.tag" 2>/dev/null)}"
    echo "⛅️ wrangler 4.131.2 (stub)"
    if [ -n "$STUB_VIEW_NOKEY" ]; then printf '{"id":"%s","number":173,"annotations":{"workers/message":"ship.sh stub"}}\n' "$3"
    else printf '{"id":"%s","number":173,"annotations":{"workers/tag":"%s","workers/message":"ship.sh stub"}}\n' "$3" "$vt"; fi ;;
  "versions deploy")
    shift 2; specs=""
    for a in "$@"; do case "$a" in *@*) specs="$specs $a";; esac; done
    for s in $specs; do p="${s#*@}"; p="${p%\%}"; [ "$p" = "$STUB_DEPLOY_FAIL" ] && { echo "✘ [ERROR] deploy refused (stub)" >&2; exit 1; }; done
    : > "$STUB_STATE"; for s in $specs; do p="${s#*@}"; echo "${s%@*} ${p%\%}" >> "$STUB_STATE"; done
    # STUB_MOVE_ON_CANARY=<id>: someone else moves live to <id> alone right after the 10% deploy
    case "$specs" in *@10%*) if [ -n "$STUB_MOVE_ON_CANARY" ]; then echo "$STUB_MOVE_ON_CANARY 100" > "$STUB_STATE"; fi;; esac ;;
  "rollback "*)
    id="$2"; case "$id" in -*) id="$STUB_PRE";; esac
    [ -n "$STUB_ROLLBACK_NOOP" ] || echo "$id 100" > "$STUB_STATE"
    echo "Current Version ID: $id" ;;
  "triggers deploy") [ -n "$STUB_TRIGGERS_FAIL" ] && exit 1; echo "triggers ok" ;;
  "d1 time-travel")
    [ -n "$STUB_TT_FAIL" ] && { echo "✘ [ERROR] time travel unavailable (stub)" >&2; exit 1; }
    printf '{\n  "bookmark": "%s"\n}\n' "$STUB_BM" ;;
  "d1 execute")
    case "$*" in *mint-*) exit 0;; esac   # lib-mint-seat.sh's own seat SQL
    # ship.sh rollback's read of migrate-068's triggers: STUB_ORG_TRIGGERS=1 answers the nine; STUB_D1_FAIL=1 errors
    case "$*" in *_org_required*)
      [ -n "$STUB_D1_FAIL" ] && { echo "✘ [ERROR] d1 unreachable (stub)" >&2; exit 1; }
      if [ -n "$STUB_ORG_TRIGGERS" ]; then
        echo '[{"results":[{"name":"approval_audit_org_required"},{"name":"artifacts_org_required"},{"name":"events_org_required"},{"name":"invites_org_required"},{"name":"login_attempts_org_required"},{"name":"loops_org_required"},{"name":"people_org_required"},{"name":"tokens_org_required"},{"name":"transmission_org_required"}],"success":true,"meta":{}}]'
      else echo '[{"results":[],"success":true,"meta":{}}]'; fi
      exit 0;;
    esac
    # the plan's (and ship.sh's, D5) schema read: STUB_SCHEMA is the answer (live's sqlite_master), else an empty schema;
    # STUB_SCHEMA_FAIL=1 errors
    case "$*" in *sqlite_master*)
      [ -n "$STUB_SCHEMA_FAIL" ] && { echo "✘ [ERROR] d1 unreachable (stub)" >&2; exit 1; }
      [ -n "$STUB_SCHEMA" ] && { echo "$STUB_SCHEMA"; exit 0; };; esac
    # the orgs' path names (D2+B3): STUB_SLUGS (comma-separated, default ryuklabs,suites); STUB_SLUGS_FAIL=1 errors (no org.slug)
    case "$*" in *"SELECT slug FROM org"*)
      [ -n "$STUB_SLUGS_FAIL" ] && { echo "✘ [ERROR] no such column: slug (stub)" >&2; exit 1; }
      python3 -c 'import json,sys; print(json.dumps([{"results": [{"slug": x} for x in sys.argv[1].split(",") if x], "success": True, "meta": {}}]))' "${STUB_SLUGS-ryuklabs,suites}"
      exit 0;;
    esac
    echo "🌀 Executing on remote database (stub)"; echo '[{"results":[],"success":true,"meta":{"changes":1}}]' ;;
  *) echo "wrangler-unexpected $*" >> "$STUB_LOG"; exit 98 ;;
esac
EOF
cat > "$T/bin/curl" <<'EOF'
#!/bin/sh
# curl stub — the CF subdomain read answers a stub subdomain; every smoke request answers by phase (preview = the
# version preview host · canary = prod + the version-override header · full = prod):
#   /health   200 + {"ok":true,"versionId":"<id>"} (the body only when the caller keeps it — no `-o`), the id chosen
#             per phase: STUB_PREVIEW_ANSWERS · STUB_CANARY_ANSWERS · STUB_FULL_ANSWERS = new (default) | old (the
#             pre-ship version: a pin not honoured) | late (old for the first STUB_LATE_N reads of that phase,
#             default 2, then new — Cloudflare's propagation); STUB_HEALTH_FAIL=<phase> makes that phase's /health
#             answer 500
#   a page    200, or 500 when STUB_SMOKE_FAIL names its phase; STUB_PAGE_DROP=<phase>:<count> makes the first
#             <count> page requests of that phase answer 000 (no HTTP answer — a drop), then normal
url=""; hdr=""; out=""; prev=""
for a in "$@"; do
  [ "$prev" = "-H" ] && case "$a" in Cloudflare-Workers-Version-Overrides:*) hdr="$a";; esac
  [ "$prev" = "-o" ] && out="$a"
  prev="$a"; case "$a" in http*) url="$a";; esac
done
case "$url" in
  https://api.cloudflare.com/*/workers/subdomain) echo "curl subdomain" >> "$STUB_LOG"; echo '{"success":true,"result":{"subdomain":"stubsub"}}'; exit 0;;
  https://api.cloudflare.com/client/v4/accounts/*/subscriptions)   # tools/cf-budget.sh's plan read (S4): STUB_PLAN=paid
    echo "curl plan ${STUB_PLAN:-refused}" >> "$STUB_LOG"                                                # lists workers_paid
    case "$STUB_PLAN" in
      paid) echo '{"success":true,"result":[{"state":"Paid","current_period_start":"2026-09-07T00:00:00Z","rate_plan":{"id":"workers_paid","public_name":"Workers Paid"}}]}';;
      *) echo '{"success":false,"errors":[{"code":10000,"message":"Authentication error"}],"result":null}';;
    esac; exit 0;;
  https://api.cloudflare.com/client/v4/graphql)   # tools/cf-budget.sh's one analytics read
    echo "curl budget ${STUB_BUDGET:-below}" >> "$STUB_LOG"
    case "$STUB_BUDGET" in
      refuse) echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":100}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":4800000,"rowsWritten":10}}]}]}}}';;
      down) exit 7;;
      *) echo '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":100}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":1000,"rowsWritten":10}}]}]}}}';;
    esac; exit 0;;
  https://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev/*) phase=preview;;
  https://ryuklabs-agent-r.stubsub.workers.dev/*) [ -n "$hdr" ] && phase=canary || phase=full;;
  *) echo "curl-unexpected $url" >> "$STUB_LOG"; printf 000; exit 7;;
esac
path="${url#https://*/}"
if [ "$path" = health ]; then
  # STUB_HANG_AT=<phase>: that phase's first /health read hangs (logged first) — the run is then killed (7.0b's resume cases)
  if [ "$phase" = "$STUB_HANG_AT" ] && [ ! -f "$STUB_STATE.hung-$phase" ]; then
    : > "$STUB_STATE.hung-$phase"; echo "curl $phase hang" >> "$STUB_LOG"; python3 -c 'import time; time.sleep(20)'
  fi
  case "$phase" in preview) ans="$STUB_PREVIEW_ANSWERS";; canary) ans="$STUB_CANARY_ANSWERS";; *) ans="$STUB_FULL_ANSWERS";; esac
  n=$(( $(cat "$STUB_STATE.n-$phase" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STUB_STATE.n-$phase"
  case "${ans:-new}" in old) id="$STUB_PRE"; w=old;; late) if [ "$n" -le "${STUB_LATE_N:-2}" ]; then id="$STUB_PRE"; w=old; else id="$STUB_NEW"; w=new; fi;; *) id="$STUB_NEW"; w=new;; esac
  # U-READY-e2: by default /health carries NO versionTag — the real shape (CF_VERSION_METADATA.tag is not exposed on
  # this account); STUB_HEALTH_TAG=match makes the NEW version answer the uploaded --tag; STUB_TAG_MISMATCH=1 makes it
  # answer a tag that is NOT the uploaded one
  vt=""; [ "$w" = new ] && [ "$STUB_HEALTH_TAG" = match ] && vt=$(cat "$STUB_STATE.tag" 2>/dev/null); [ "$w" = new ] && [ -n "$STUB_TAG_MISMATCH" ] && vt="0000000ff-wrong"
  if [ "$phase" = "$STUB_HEALTH_FAIL" ]; then code=500; body='{"error":"stub"}'; w=500
  elif [ -n "$vt" ]; then code=200; body="{\"ok\":true,\"versionId\":\"$id\",\"versionTag\":\"$vt\"}"
  else code=200; body="{\"ok\":true,\"versionId\":\"$id\"}"; fi
  echo "curl $phase health ${hdr:+[$hdr] }→ $w" >> "$STUB_LOG"
  if [ -n "$out" ]; then printf '%s' "$code"; else printf '%s\n%s' "$body" "$code"; fi
  exit 0
fi
echo "curl $phase $path ${hdr:+[$hdr]}" >> "$STUB_LOG"
if [ "${STUB_PAGE_DROP%%:*}" = "$phase" ]; then
  pn=$(( $(cat "$STUB_STATE.p-$phase" 2>/dev/null || echo 0) + 1 )); echo "$pn" > "$STUB_STATE.p-$phase"
  [ "$pn" -le "${STUB_PAGE_DROP#*:}" ] && { printf 000; exit 28; }
fi
[ "$phase" = "$STUB_SMOKE_FAIL" ] && printf 500 || printf 200
EOF
printf '#!/bin/sh\nexit 0\n' > "$T/bin/sleep"
# sigrun.py <SIG> <cmd…> — a terminal's hangup (or Ctrl-C), offline: <cmd> runs in a session of its own (its own process group, as
# a shell job is), and once the log holds SIG_AT (default: the cross-org suite's "xorg started"; 7.0b: KILL at "walk started" or
# "curl full hang" is a Mini restart) the WHOLE group takes <SIG> (the operator's terminal sends it
# to every process of the foreground group); exits with <cmd>'s code (128 + the signal when it was killed by one)
cat > "$T/sigrun.py" <<'EOF'
import os, signal, subprocess, sys, time
sig = getattr(signal, "SIG" + sys.argv[1])
p = subprocess.Popen(sys.argv[2:], start_new_session=True)
log = os.environ["STUB_LOG"]
for _ in range(400):
    if p.poll() is not None: break
    if os.environ.get("SIG_AT", "xorg started") in open(log).read(): os.killpg(p.pid, sig); break
    time.sleep(0.05)
try: rc = p.wait(timeout=60)
except subprocess.TimeoutExpired: p.kill(); rc = p.wait()
sys.exit(128 - rc if rc < 0 else rc)
EOF
chmod +x "$T/bin/"*

# run <case-name> <script> [args...] — env-scrubbed, stubs first on PATH; the live deployment starts as
# INIT_STATE (default: the pre-ship version alone at 100%); sets OUT, RC, LOG, STATE, STATE_NOW
run() {
  _name="$1"; shift; _script="$1"; shift
  LOG="$T/$_name.log"; STATE="$T/$_name.state"; : > "$LOG"; printf '%s\n' "${INIT_STATE:-$PRE 100}" > "$STATE"
  OUT=$(cd "$T/engine" && env -i HOME="$T/home" PATH="$T/bin:$PATH" TMPDIR="$T" SHARINGU_ENV_PATH="$T/env.sh" \
        STUB_LOG="$LOG" STUB_STATE="$STATE" STUB_BIN="$T/bin" STUB_PRE="$PRE" STUB_NEW="${SELFTEST_NEW:-$NEW}" STUB_BM="$BM" \
        STUB_XORG_CLEANUP_RC="$STUB_XORG_CLEANUP_RC" STUB_WALK_MODE="$STUB_WALK_MODE" STUB_VIEW_GONE="$STUB_VIEW_GONE" \
        STUB_MOVE_ON_CANARY="$STUB_MOVE_ON_CANARY" STUB_HANG_AT="$STUB_HANG_AT" SIG_AT="${SELFTEST_SIG_AT:-xorg started}" \
        STUB_GATE_RC="${STUB_GATE_RC:-0}" STUB_DOCS_RC="${STUB_DOCS_RC:-0}" STUB_SMOKE_FAIL="$STUB_SMOKE_FAIL" STUB_DEPLOY_FAIL="$STUB_DEPLOY_FAIL" \
        STUB_NO_PREVIEW="$STUB_NO_PREVIEW" STUB_ROLLBACK_NOOP="$STUB_ROLLBACK_NOOP" STUB_TT_FAIL="$STUB_TT_FAIL" \
        STUB_STATUS_FAIL="$STUB_STATUS_FAIL" STUB_TRIGGERS_FAIL="$STUB_TRIGGERS_FAIL" STUB_BUDGET="$STUB_BUDGET" STUB_PLAN="$STUB_PLAN" \
        STUB_HEALTH_FAIL="$STUB_HEALTH_FAIL" STUB_PREVIEW_ANSWERS="$STUB_PREVIEW_ANSWERS" \
        STUB_CANARY_ANSWERS="$STUB_CANARY_ANSWERS" STUB_FULL_ANSWERS="$STUB_FULL_ANSWERS" \
        STUB_LATE_N="$STUB_LATE_N" STUB_PAGE_DROP="$STUB_PAGE_DROP" STUB_TAG_MISMATCH="$STUB_TAG_MISMATCH" \
        STUB_VIEW_TAG="$STUB_VIEW_TAG" STUB_VIEW_FAIL="$STUB_VIEW_FAIL" STUB_VIEW_NOKEY="$STUB_VIEW_NOKEY" STUB_HEALTH_TAG="$STUB_HEALTH_TAG" \
        STUB_SCHEMA="$STUB_SCHEMA" STUB_SCHEMA_FAIL="$STUB_SCHEMA_FAIL" STUB_SLUGS_FAIL="$STUB_SLUGS_FAIL" STUB_NAMES_RC="$STUB_NAMES_RC" \
        ${STUB_SLUGS+STUB_SLUGS="$STUB_SLUGS"} STUB_XORG_RC="$STUB_XORG_RC" STUB_WALK_RC="$STUB_WALK_RC" SHIP_PREVIEW_HOOK="$SELFTEST_HOOK" \
        STUB_ORG_TRIGGERS="$STUB_ORG_TRIGGERS" STUB_D1_FAIL="$STUB_D1_FAIL" STUB_XORG_LEFT="$STUB_XORG_LEFT" STUB_XORG_MODE="$STUB_XORG_MODE" \
        STUB_XORG_FIVEXX="$STUB_XORG_FIVEXX" ${SELFTEST_SIG:+python3 "$T/sigrun.py" "$SELFTEST_SIG"} sh "tools/$_script" "$@" 2>&1); RC=$?
  STATE_NOW=$(tr '\n' ' ' < "$STATE" | sed 's/ $//')
  [ -n "$SHIP_SELFTEST_VERBOSE" ] && printf '%s\n' "── case $_name (rc $RC, live now [$STATE_NOW])" "$OUT" | sed 's/^/    | /'
  # `VAR=x run …` may PERSIST past a function call (POSIX leaves it unspecified; bash's posix mode keeps it) —
  # every scenario knob is cleared here so no case leaks into the next one
  unset STUB_GATE_RC STUB_SMOKE_FAIL STUB_DEPLOY_FAIL STUB_NO_PREVIEW STUB_ROLLBACK_NOOP STUB_TT_FAIL STUB_STATUS_FAIL STUB_TRIGGERS_FAIL STUB_BUDGET STUB_PLAN \
        STUB_HEALTH_FAIL STUB_PREVIEW_ANSWERS STUB_CANARY_ANSWERS STUB_FULL_ANSWERS STUB_LATE_N STUB_PAGE_DROP STUB_TAG_MISMATCH \
        STUB_VIEW_TAG STUB_VIEW_FAIL STUB_VIEW_NOKEY STUB_HEALTH_TAG STUB_SCHEMA INIT_STATE STUB_XORG_RC STUB_WALK_RC SELFTEST_HOOK \
        STUB_ORG_TRIGGERS STUB_D1_FAIL STUB_XORG_LEFT STUB_XORG_MODE SELFTEST_SIG \
        STUB_XORG_CLEANUP_RC STUB_WALK_MODE STUB_VIEW_GONE STUB_MOVE_ON_CANARY STUB_HANG_AT SELFTEST_SIG_AT SELFTEST_NEW \
        STUB_SCHEMA_FAIL STUB_SLUGS_FAIL STUB_NAMES_RC STUB_SLUGS STUB_XORG_FIVEXX
}
has()   { grep -q -- "$1" "$LOG"; }
nhas()  { ! grep -q -- "$1" "$LOG"; }
cnt()   { grep -c -- "$1" "$LOG"; }
first() { grep -n -- "$1" "$LOG" | head -1 | cut -d: -f1; }   # line of the first match in the ordered log
before() { _a=$(first "$1"); _b=$(first "$2"); [ -n "$_a" ] && [ -n "$_b" ] && [ "$_a" -lt "$_b" ]; }
clean() { nhas 'unexpected'; }                                 # no call the stubs did not recognise
# a case must always prove no call slipped past the stubs
chk() { if eval "$2"; then ok "$1"; else bad "$1 — rc=$RC live=[$STATE_NOW]"; echo "$OUT" | tail -6 | sed 's/^/        /'; sed 's/^/        log: /' "$LOG" | tail -12; fi; }

# ── ship.sh ────────────────────────────────────────────────────────────────────────────────────────────────────
run happy ship.sh ryuklabs
chk "happy: gate → upload → preview smoke → 10% → canary smoke → 100% → smoke → triggers; rc 0; live = $NEW at 100%" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && before "^gate" "deployments status" && before "deployments status" "versions upload" \
   && before "versions upload" "curl preview" && before "curl preview" "versions deploy $PRE@90% $NEW@10%" \
   && before "versions deploy $PRE@90%" "curl canary" && before "curl canary" "versions deploy $NEW@100%" \
   && before "versions deploy $NEW@100%" "curl full" && before "curl full" "triggers deploy" && nhas "wrangler rollback" \
   && has "curl canary build \[Cloudflare-Workers-Version-Overrides: ryuklabs-agent-r=\"$NEW\"\]" \
   && has "curl preview build" && has "curl preview decisions" && has "curl preview home" && nhas "curl preview thread" && nhas "^wrangler deploy "'
chk "happy: the budget guard reads today's usage AFTER the gate and BEFORE the first wrangler call" \
  'before "^gate" "curl budget" && before "curl budget" "deployments status" && [ "$(grep -c "curl budget" "$LOG")" = 1 ]'
chk "happy (a, U-READY-e2): the upload carries --tag unknown (the throwaway tree is not a git checkout); the VERSION RECORD of $NEW answered it and /health carried no versionTag (the real shape) — shipped" \
  '[ $RC -eq 0 ] && has "^versions upload tag=unknown$" && has "^wrangler versions upload --config wrangler.jsonc --tag unknown --message " \
   && has "^wrangler versions view $NEW --json --config wrangler.jsonc$" && [ "$(cnt "^versions view ")" = 1 ] \
   && before "versions upload tag=" "versions view" && before "curl preview decisions" "versions view" && before "versions view" "versions deploy" \
   && echo "$OUT" | grep -q "✓ version preview: tag unknown (version record)$" && ! echo "$OUT" | grep -q "/health versionTag"'
chk "happy: ship.sh never calls migrate.sh (no Time Travel read, no migration applied)" \
  'nhas "time-travel" && nhas "migrate-"'
PIN="\\[Cloudflare-Workers-Version-Overrides: ryuklabs-agent-r=\"$NEW\"\\]"
chk "happy (pin honoured): each smoke read /health under its own header and $NEW answered (one read each, + the preview's one best-effort versionTag read); the canary pages ran pinned AFTER it; the final line names preview ✓ · cross-org ✓ · walk ✓ · canary pinned ✓ · production ✓" \
  '[ $RC -eq 0 ] && has "curl preview health → new" && has "curl canary health $PIN → new" && has "curl full health → new" \
   && [ "$(cnt "curl preview health")" = 2 ] && [ "$(cnt "curl canary health")" = 1 ] && [ "$(cnt "curl full health")" = 1 ] && [ "$(cnt "health")" = 4 ] && before "curl canary health" "curl canary home" && has "curl canary decisions $PIN" \
   && echo "$OUT" | tail -1 | grep -q "^✓ SHIPPED — proofs: preview ✓ · cross-org ✓ · walk ✓ · canary pinned ✓ · production ✓" && ! echo "$OUT" | grep -q "pin not honoured"'

# ── sprint 6 — the cross-org suite on the PREVIEW before any traffic moves (PLATFORM §5) ─────────────────────────────
XORG="^xorg --url https://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev --live --config wrangler.jsonc --live-write-ok --creds $T/env.sh --run-dir .runs/ship-xorg/$NEW$"
LOG="$T/happy.log"; RC=0; OUT=""
chk "happy: the cross-org suite runs ONCE on the version preview (--live --live-write-ok, the deployment's credentials file, its run dir), after the preview smoke and the tag proof, before the 10% promote; the proofs line names it" \
  'has "$XORG" && [ "$(cnt "^xorg ")" = 1 ] && before "curl preview decisions" "^xorg " && before "versions view $NEW" "^xorg " && before "^xorg " "versions deploy $PRE@90% $NEW@10%"'
SELFTEST_HOOK='echo "hook $SHIP_PREVIEW_URL" >> "$STUB_LOG"' run xorg-hook ship.sh
chk "with a preview hook: the cross-org suite runs BEFORE the hook (the wall proven before the hook writes through the new code), the hook before the 10% promote; shipped" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && has "^hook https://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev$" && before "^xorg " "^hook " && before "^hook " "versions deploy $PRE@90%" \
   && echo "$OUT" | grep -q "✓ attack-xorg (preview): 0 rows of the other org read" && echo "$OUT" | tail -1 | grep -q "^✓ SHIPPED — proofs: preview ✓ · cross-org ✓ · walk ✓ · canary pinned ✓ · production ✓"'
STUB_XORG_RC=1 SELFTEST_HOOK='echo "hook $SHIP_PREVIEW_URL" >> "$STUB_LOG"' run xorgfail ship.sh
chk "the cross-org suite FAILS on the preview: NOT promoted (no versions deploy), no rollback needed (no traffic moved), the hook never runs, no canary, no 100%; live still $PRE at 100%; its output and the run dir shown" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "$XORG" && nhas "versions deploy" && nhas "wrangler rollback" && nhas "^hook" && nhas "curl canary" && nhas "curl full" && nhas "triggers deploy" \
   && echo "$OUT" | grep -q "| ✗ attack-xorg (preview): 1 finding" && echo "$OUT" | grep -q "✗ the cross-org suite failed on the preview — NOT promoted; no traffic moved, prod still on $PRE (nothing to roll back; the run: .runs/ship-xorg/$NEW)" \
   && ! echo "$OUT" | grep -q "SHIPPED"'
LOG="$T/xorgfail.log"
chk "the cross-org suite FAILS with every throwaway deleted: its record (orgs.json) read, none left said, the exact --cleanup command printed anyway (never the log's tail)" \
  'echo "$OUT" | grep -q "· the record lists no throwaway org left (.runs/ship-xorg/$NEW/orgs.json); should a later look find one: node tools/attack-xorg.mjs --cleanup .runs/ship-xorg/$NEW --live --config wrangler.jsonc --live-write-ok --creds $T/env.sh$"'
# 10.5 (the sprint-10 review, L1): the run dir is the version's (a rerun reuses it) — a failed suite that kept 5xx answers is
# named; the NEXT failed run that keeps none must not name the earlier run's file (ship.sh removes it before the launch)
STUB_XORG_RC=1 STUB_XORG_FIVEXX=1 run xorg5xx ship.sh
chk "L1: a failed suite that kept its 5xx answers: ship.sh names .runs/ship-xorg/$NEW/fivexx.json" \
  '[ $RC -ne 0 ] && clean && echo "$OUT" | grep -q "^  · each 5xx.s answer, kept and redacted (attack-xorg, 10.5): .runs/ship-xorg/$NEW/fivexx.json$"'
STUB_XORG_RC=1 run xorg5xx-again ship.sh
chk "L1: a rerun on the same version whose suite fails keeping NO answer: the earlier run's fivexx.json is gone before the launch (the suite saw none) and is not named" \
  '[ $RC -ne 0 ] && clean && has "^xorg5xx-at-launch no$" && [ ! -e "$T/engine/.runs/ship-xorg/$NEW/fivexx.json" ] && ! echo "$OUT" | grep -q "fivexx.json"'
STUB_XORG_RC=1 STUB_XORG_LEFT=1 run xorgleft ship.sh
XCMD="node tools/attack-xorg.mjs --cleanup .runs/ship-xorg/$NEW --live --config wrangler.jsonc --live-write-ok --creds $T/env.sh"
chk "the cross-org suite FAILS and leaves a throwaway: ship.sh names it from the record (org 7 \"xorg-a\" (restored)) and prints the exact --cleanup command; NOT promoted" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && nhas "versions deploy" && echo "$OUT" | grep -q "^  ✗ throwaway left in the live database: org 7 \"xorg-a\" (restored)$" \
   && ! echo "$OUT" | grep -q "org 8" && echo "$OUT" | grep -q "^    remove it (from engine/, the deployment.s credentials sourced): $XCMD$" && echo "$OUT" | grep -q "✗ the cross-org suite failed on the preview — NOT promoted"'
# the printed command, walked as printed against the stub (from engine/, the throwaway tree): it removes what the record lists
_xc=$(echo "$OUT" | sed -n 's/^    remove it (from engine\/, the deployment.s credentials sourced): //p' | head -1)
_xl=$(cd "$T/engine" && env -i PATH="$T/bin:$PATH" STUB_LOG="$LOG" sh -c "$_xc" 2>&1); _xrc=$?
_xafter=$(python3 -c 'import json,sys;print(" ".join(o["state"] for o in json.load(open(sys.argv[1]))["orgs"]))' "$T/engine/.runs/ship-xorg/$NEW/orgs.json" 2>/dev/null)
chk "the printed --cleanup command, run as printed against the stub, reaches the suite as --cleanup <the run dir> with ship.sh's own flags and removes every org the record listed" \
  '[ -n "$_xc" ] && [ "$_xrc" -eq 0 ] && has "^xorg-cleanup --cleanup .runs/ship-xorg/$NEW --live --config wrangler.jsonc --live-write-ok --creds $T/env.sh$" && [ "$_xafter" = "deleted deleted" ]'
STUB_XORG_MODE=hang SELFTEST_SIG=HUP SELFTEST_HOOK='echo "hook $SHIP_PREVIEW_URL" >> "$STUB_LOG"' run xorghup ship.sh
_xafter=$(python3 -c 'import json,sys;print(" ".join(o["state"] for o in json.load(open(sys.argv[1]))["orgs"]))' "$T/engine/.runs/ship-xorg/$NEW/orgs.json" 2>/dev/null)
chk "a SIGHUP to ship.sh's whole process group mid-suite (the operator's terminal hung up): the suite lives (its own session), takes ONE SIGTERM, deletes both throwaways; ship.sh waits for it and promotes NOTHING (no walk, no hook, no versions deploy); the record says none left" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "^xorg started$" && [ "$(cnt "^xorg term$")" = 1 ] && nhas "xorg timeout" && [ "$_xafter" = "deleted deleted" ] \
   && nhas "^walk " && nhas "^hook" && nhas "versions deploy" && nhas "wrangler rollback" && echo "$OUT" | grep -q "✗ ship.sh took SIGHUP during the cross-org suite" \
   && echo "$OUT" | grep -q "the record lists no throwaway org left" && echo "$OUT" | grep -q "✗ the cross-org suite failed on the preview — NOT promoted" && ! echo "$OUT" | grep -q "SHIPPED"'
STUB_XORG_MODE=hang SELFTEST_SIG=INT run xorgint ship.sh
chk "a SIGINT (Ctrl-C) mid-suite: the same — one SIGTERM to the suite, both throwaways deleted, nothing promoted" \
  '[ $RC -ne 0 ] && [ "$STATE_NOW" = "$PRE 100" ] && [ "$(cnt "^xorg term$")" = 1 ] && nhas "versions deploy" && echo "$OUT" | grep -q "✗ ship.sh took SIGINT during the cross-org suite"'
LOG="$T/previewfail-x.log"
STUB_SMOKE_FAIL=preview run previewfail-x ship.sh
chk "a failed preview smoke never reaches the cross-org suite (no throwaway org is written for a version that is not promoted)" '[ $RC -ne 0 ] && nhas "^xorg "'
STUB_VIEW_TAG=0000000ff-other run viewmismatch-x ship.sh
chk "a version record whose tag is wrong never reaches the cross-org suite" '[ $RC -ne 0 ] && nhas "^xorg " && nhas "versions deploy"'

# ── sprint 6 — the WALK on the preview, after the cross-org suite, before the hook and any traffic (PLATFORM §5) ─────────
WALK="^walk --url https://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev --preview --creds .runs/ship-xorg/$NEW/walk-key.env --live --json .runs/ship-xorg/$NEW/walk.json --operator-config wrangler.jsonc --confirm-live ryuklabs-agent-r$"
LOG="$T/happy.log"
chk "happy: the walk runs ONCE on the version preview (--preview: the walk itself refuses any other URL; --live, its transcript beside the suite's), handed the minted seat's key in a mode-600 file in its run dir (never TMPDIR), AFTER the cross-org suite and BEFORE the 10% promote; the file is gone after" \
  'has "$WALK" && [ "$(cnt "^walk --url")" = 1 ] && has "^walk creds keyed mode 600$" && before "^xorg " "^walk --url" && before "^walk --url" "versions deploy $PRE@90% $NEW@10%" \
   && [ ! -e "$T/engine/.runs/ship-xorg/$NEW/walk-key.env" ] && [ -z "$(ls "$T" | grep "^ship-walk\.")" ]'
LOG="$T/xorg-hook.log"
chk "with a preview hook: cross-org suite → walk → hook → 10%" 'before "^xorg " "^walk --url" && before "^walk --url" "^hook " && before "^hook " "versions deploy $PRE@90%"'
STUB_WALK_RC=1 SELFTEST_HOOK='echo "hook $SHIP_PREVIEW_URL" >> "$STUB_LOG"' run walkfail ship.sh
chk "the walk FAILS on the preview: NOT promoted (no versions deploy), no rollback needed, the hook never runs, no canary, no 100%; live still $PRE at 100%; its output shown; the key file removed" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "$WALK" && nhas "versions deploy" && nhas "wrangler rollback" && nhas "^hook" && nhas "curl canary" && nhas "curl full" \
   && echo "$OUT" | grep -q "| ✗ live walk: 26 of 27" && echo "$OUT" | grep -q "✗ the walk failed on the preview — NOT promoted; no traffic moved, prod still on $PRE" \
   && [ ! -e "$T/engine/.runs/ship-xorg/$NEW/walk-key.env" ] && [ -z "$(ls "$T" | grep "^ship-walk\.")" ] && ! echo "$OUT" | grep -q "SHIPPED"'
LOG="$T/xorgfail.log"
chk "a failed cross-org suite never reaches the walk" 'nhas "^walk "'
LOG="$T/previewfail-x.log"
chk "a failed preview smoke never reaches the walk" 'nhas "^walk "'

# ── the sprint-7 review: live's schema level and its orgs' names, read after live and before any upload (D5, D2+B3) ───────────
STUB_SLUGS="ryuklabs,suites,acme" run d2-names ship.sh
chk "D2+B3 · D5: after live is read and BEFORE the upload, live's schema (its migration level) and its orgs' path names are read, check-org-names runs ONCE over exactly those names, both said; shipped" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && before "deployments status" "sqlite_master WHERE sql NOT NULL" && before "sqlite_master WHERE sql NOT NULL" "versions upload" \
   && before "deployments status" "SELECT slug FROM org" && before "SELECT slug FROM org" "^names " && before "^names " "versions upload" && has "^names --slugs ryuklabs,suites,acme$" && [ "$(cnt "^names ")" = 1 ] \
   && has "^wrangler d1 execute ryuklabs-agent-r --remote --json --command SELECT slug FROM org WHERE slug IS NOT NULL ORDER BY id --config wrangler.jsonc$" \
   && echo "$OUT" | grep -q "^  ✓ live is at migrate-000 (read from its schema: tools/ship-plan-migrations.py)$" && echo "$OUT" | grep -q "^  ✓ org names: .* — live.s: ryuklabs,suites,acme$"'
STUB_NAMES_RC=1 STUB_SLUGS="ryuklabs,login" run d2-red ship.sh
chk "D2+B3: an org on live holds a name this code reserves (the check red): NOT shipping — nothing uploaded, no suite, no walk, no versions deploy, no rollback, live untouched; the check's miss shown" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "^names --slugs ryuklabs,login$" && nhas "versions upload" && nhas "^xorg" && nhas "^walk" && nhas "versions deploy" && nhas "wrangler rollback" \
   && echo "$OUT" | grep -q "| *✗ an org holds \"login\"" && echo "$OUT" | grep -q "✗ an org on live holds a name this code reserves (or the check is red) — NOT shipping (nothing uploaded, prod untouched)" && ! echo "$OUT" | grep -q SHIPPED'
STUB_SLUGS_FAIL=1 run d2-unread ship.sh
chk "D2+B3: live's org names unreadable (no org.slug: migrate-072 not applied): NOT shipping, nothing uploaded, the check not run" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && nhas "^names " && nhas "versions upload" && nhas "versions deploy" && echo "$OUT" | grep -q "✗ live.s org names could not be read"'
STUB_SCHEMA_FAIL=1 run d5-unread ship.sh
chk "D5: live's schema unreadable: NOT shipping (no level to key the preview's proofs), nothing uploaded" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && nhas "versions upload" && nhas "^names " && nhas "versions deploy" && echo "$OUT" | grep -q "✗ live.s schema could not be read"'

STUB_GATE_RC=1 run gatered ship.sh
chk "a red gate: refused (rc 1) before ANY Cloudflare call (and no cross-org suite)" \
  '[ $RC -ne 0 ] && [ "$(grep -vc "^gate$" "$LOG")" = 0 ] && echo "$OUT" | grep -q "gate red"'

STUB_BUDGET=refuse run budgetrefuse ship.sh
chk "budget at 95%+: refused (rc 2) after the gate with NO wrangler call and no mint; prod untouched" \
  '[ $RC -eq 2 ] && clean && has "curl budget refuse" && nhas "^wrangler" && nhas "curl subdomain" && [ "$STATE_NOW" = "$PRE 100" ] \
   && echo "$OUT" | grep -q "budget guard refused"'

STUB_PLAN=paid STUB_BUDGET=refuse run budgetpaid ship.sh
chk "budget on Workers Paid (the account lists workers_paid): 4.8M rows read is no refusal (it is 96% of a FREE day) — the ship goes on, plan read before the usage" \
  '[ $RC -eq 0 ] && clean && has "curl plan paid" && before "curl plan paid" "curl budget refuse" && before "curl budget" "deployments status" && [ "$STATE_NOW" = "$NEW 100" ]'

STUB_BUDGET=down run budgetdown ship.sh
chk "budget unreadable: refused (a guard that cannot look must not pass) with NO wrangler call" \
  '[ $RC -ne 0 ] && clean && has "curl budget down" && nhas "^wrangler" && echo "$OUT" | grep -q "budget guard refused"'

STUB_GATE_RC=1 STUB_BUDGET=refuse run gatered-budget ship.sh
chk "a red gate is refused before even the budget read (the gate stays first)" '[ $RC -ne 0 ] && nhas "curl budget"'

STUB_SMOKE_FAIL=preview run previewfail ship.sh
chk "preview smoke fails: NOT promoted, no rollback needed (no traffic moved); live still $PRE at 100%" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "curl preview" && nhas "versions deploy" && nhas "wrangler rollback" && nhas "curl full" && nhas "curl canary"'

STUB_SMOKE_FAIL=canary run canaryfail ship.sh
chk "canary smoke fails with the pin HONOURED (/health answered by $NEW, a page 500s) → wrangler rollback to $PRE, verified; never promoted to 100%" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "curl canary health .* → new" && before "curl canary build" "wrangler rollback $PRE" && nhas "$NEW@100%" \
   && echo "$OUT" | grep -q "rolled back — live is $PRE at 100%"'

STUB_HEALTH_FAIL=canary run canaryhealth ship.sh
chk "canary /health never 200 → a failure, not a skip: wrangler rollback to $PRE, verified; never promoted to 100%" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && [ "$(cnt "curl canary health")" = 10 ] && before "curl canary health" "wrangler rollback $PRE" \
   && nhas "curl canary home" && nhas "$NEW@100%" && ! echo "$OUT" | grep -q "pin not honoured"'

# ── batch:ship-canary-pin — WHICH version answered (the #235 canary was answered by the OLD version, 2026-09-28) ─
STUB_CANARY_ANSWERS=late run pinlate ship.sh
chk "pin honoured LATE (the old version answers the first 2 reads — Cloudflare's propagation): re-read, then the pinned pages run; canary pinned ✓" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && [ "$(cnt "curl canary health")" = 3 ] && has "curl canary health $PIN → old" \
   && before "curl canary health $PIN → new" "curl canary home" && echo "$OUT" | tail -1 | grep -q "canary pinned ✓" && ! echo "$OUT" | grep -q "pin not honoured"'

STUB_CANARY_ANSWERS=old run pinignored ship.sh
chk "pin NEVER honoured: \`! canary pin not honoured\` printed, the pinned pages SKIPPED (no curl canary <page>), 5 bounded reads, no rollback; the ship reaches 100%, smokes the pages there, rc 0; the final line says skipped (pin not honoured), never canary pinned ✓" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && [ "$(cnt "curl canary health")" = 5 ] && nhas "curl canary home" && nhas "curl canary build" && nhas "curl canary decisions" \
   && echo "$OUT" | grep -q "^  ! canary pin not honoured on https://ryuklabs-agent-r.stubsub.workers.dev (answered by $PRE)" \
   && before "curl canary health" "versions deploy $NEW@100%" && before "versions deploy $NEW@100%" "curl full home" && has "curl full build" && has "curl full decisions" \
   && nhas "wrangler rollback" && has "triggers deploy" \
   && echo "$OUT" | tail -1 | grep -q "^✓ SHIPPED — proofs: preview ✓ · cross-org ✓ · walk ✓ · canary pinned skipped (pin not honoured) · production ✓" && ! echo "$OUT" | grep -q "canary pinned ✓"'

STUB_CANARY_ANSWERS=old STUB_SMOKE_FAIL=full run pinignored-fullfail ship.sh
chk "a skipped canary never protects a bad version: pin ignored + a 100% page 500s → wrangler rollback to $PRE, verified" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && echo "$OUT" | grep -q "pin not honoured" && before "curl full build" "wrangler rollback $PRE" && nhas "triggers deploy" \
   && echo "$OUT" | grep -q "rolled back — live is $PRE at 100%" && ! echo "$OUT" | grep -q "SHIPPED"'

STUB_FULL_ANSWERS=old run fullold ship.sh
chk "100% answered by the OLD id (SHIP_READS_PROD=30 bounded reads, progress printed) → ✗, wrangler rollback to $PRE, verified; pages not smoked, no triggers, rc≠0" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && [ "$(cnt "curl full health")" = 30 ] \
   && echo "$OUT" | grep -q "· waiting for $NEW at the edge (read 5/30, answered by $PRE)" \
   && echo "$OUT" | grep -q "production (100%): /health answered by $PRE, not $NEW (after 30 reads)" && before "curl full health" "wrangler rollback $PRE" \
   && nhas "curl full home" && nhas "triggers deploy" && echo "$OUT" | grep -q "production (100%): /health answered by $PRE, not $NEW" \
   && echo "$OUT" | grep -q "rolled back — live is $PRE at 100%" && ! echo "$OUT" | grep -q "SHIPPED"'

STUB_FULL_ANSWERS=late run fulllate ship.sh
chk "100% answered by the new id after propagation (2 old reads, then new): shipped, no rollback" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && [ "$(cnt "curl full health")" = 3 ] && has "curl full health → old" && nhas "wrangler rollback" \
   && before "curl full health → new" "curl full home"'

# ── batch:ship-100-wait — the 100% gate waits for the edge; a page drop is retried once ──────────────────────────
STUB_FULL_ANSWERS=late STUB_LATE_N=20 run fulllate-long ship.sh
chk "100% answered by the OLD id for 20 reads (> the old 5-read window), then the new: shipped, no rollback, 21 reads, the waiting line printed" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && [ "$(cnt "curl full health")" = 21 ] && [ "$(cnt "curl full health → old")" = 20 ] \
   && nhas "wrangler rollback" && before "curl full health → new" "curl full home" && has "triggers deploy" \
   && echo "$OUT" | grep -q "^  · waiting for $NEW at the edge (read 20/30, answered by $PRE)" \
   && echo "$OUT" | tail -1 | grep -q "^✓ SHIPPED — proofs: preview ✓ · cross-org ✓ · walk ✓ · canary pinned ✓ · production ✓"'

STUB_PAGE_DROP=full:1 run page000-once ship.sh
chk "a 100% page answers 000 once (a drop), then 200: retried once, shipped, no rollback" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && [ "$(cnt "curl full home")" = 2 ] && [ "$(cnt "curl full build")" = 1 ] \
   && nhas "wrangler rollback" && ! echo "$OUT" | grep -q "→ 000" && echo "$OUT" | tail -1 | grep -q "^✓ SHIPPED"'

STUB_PAGE_DROP=full:2 run page000-twice ship.sh
chk "a 100% page answers 000 twice: ✗ /home → 000 (exactly 2 requests, never a third), wrangler rollback to $PRE, verified" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && [ "$(cnt "curl full home")" = 2 ] \
   && echo "$OUT" | grep -q "✗ production (100%): /home → 000" && before "curl full home" "wrangler rollback $PRE" \
   && echo "$OUT" | grep -q "rolled back — live is $PRE at 100%" && ! echo "$OUT" | grep -q "SHIPPED"'

STUB_PREVIEW_ANSWERS=old run previewold ship.sh
chk "the preview URL answered by a different id → ✗, NOT promoted, no rollback needed (no traffic moved), no canary" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && [ "$(cnt "curl preview health")" = 5 ] && nhas "curl preview home" && nhas "versions deploy" \
   && nhas "wrangler rollback" && nhas "curl canary" && echo "$OUT" | grep -q "version preview: /health answered by $PRE, not $NEW"'

# ── U-READY-e2 — the preview proves WHICH COMMIT it runs from the VERSION RECORD; /health versionTag is best-effort ──
STUB_HEALTH_TAG=match run healthtag ship.sh
chk "(a') record == tag AND /health versionTag present and equal → shipped, the agreement named" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && echo "$OUT" | grep -q "✓ version preview: tag unknown (version record) · /health versionTag agrees$" \
   && echo "$OUT" | tail -1 | grep -q "^✓ SHIPPED — proofs: preview ✓ · cross-org ✓ · walk ✓ · canary pinned ✓ · production ✓"'

STUB_VIEW_TAG=0000000ff-other run viewmismatch ship.sh
chk "(b) the version record's workers/tag is NOT the uploaded tag → ✗, NOT promoted, no rollback (no traffic moved), no canary; live still $PRE at 100%" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "versions view $NEW" && nhas "versions deploy" && nhas "wrangler rollback" && nhas "curl canary" && nhas "curl full" \
   && echo "$OUT" | grep -q "✗ version preview: version record tag 0000000ff-other, not unknown" && echo "$OUT" | grep -q "NOT promoted" && ! echo "$OUT" | grep -q "SHIPPED"'

STUB_VIEW_FAIL=1 run viewfail ship.sh
chk "(c) the version record cannot be read (wrangler errors) → ✗ unreadable, NOT promoted, no rollback; live still $PRE at 100%" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "versions view $NEW" && nhas "versions deploy" && nhas "wrangler rollback" && nhas "curl canary" \
   && echo "$OUT" | grep -q "✗ version preview: version record tag unreadable, not unknown" && echo "$OUT" | grep -q "NOT promoted" && ! echo "$OUT" | grep -q "SHIPPED"'

STUB_VIEW_NOKEY=1 run viewnokey ship.sh
chk "(c) the version record carries no workers/tag → ✗ unreadable, NOT promoted, no rollback; live still $PRE at 100%" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "versions view $NEW" && nhas "versions deploy" && nhas "wrangler rollback" && nhas "curl canary" \
   && echo "$OUT" | grep -q "✗ version preview: version record tag unreadable, not unknown" && echo "$OUT" | grep -q "NOT promoted" && ! echo "$OUT" | grep -q "SHIPPED"'

STUB_TAG_MISMATCH=1 run tagmismatch ship.sh
chk "(d) the record agrees but the preview's /health versionTag is present and NOT the uploaded tag → ✗, NOT promoted, no rollback needed (no traffic moved), no canary; live still $PRE at 100%" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "versions upload tag=unknown" && has "versions view $NEW" && has "curl preview home" && nhas "versions deploy" \
   && nhas "wrangler rollback" && nhas "curl canary" && nhas "curl full" \
   && echo "$OUT" | grep -q "✗ version preview: /health versionTag 0000000ff-wrong, not unknown" && echo "$OUT" | grep -q "NOT promoted" && ! echo "$OUT" | grep -q "SHIPPED"'

STUB_SMOKE_FAIL=full run fullfail ship.sh
chk "production smoke fails (100% live) → wrangler rollback to $PRE, verified" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && before "curl full" "wrangler rollback $PRE" && nhas "triggers deploy"'
chk "a real non-200 (500) page fails AT ONCE — exactly one request per page, never retried (only 000 is)" \
  '[ "$(cnt "curl full home")" = 1 ] && [ "$(cnt "curl full build")" = 1 ] && [ "$(cnt "curl full decisions")" = 1 ] && echo "$OUT" | grep -q "✗ production (100%): /home → 500"'

STUB_DEPLOY_FAIL=10 run promote10fail ship.sh
chk "promote to 10% fails → wrangler rollback to $PRE, verified; no canary smoke, no 100%" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "wrangler rollback $PRE" && nhas "curl canary" && nhas "$NEW@100%"'

STUB_DEPLOY_FAIL=100 run promote100fail ship.sh
chk "promote to 100% fails → wrangler rollback to $PRE, verified" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && before "curl canary" "wrangler rollback $PRE" && nhas "curl full"'

STUB_SMOKE_FAIL=canary STUB_ROLLBACK_NOOP=1 run rbnoop ship.sh
chk "a rollback wrangler silently skipped is CAUGHT by the read-back (never reported as rolled back)" \
  '[ $RC -ne 0 ] && echo "$OUT" | grep -q "ROLLBACK DID NOT VERIFY" && ! echo "$OUT" | grep -q "rolled back — live"'

STUB_NO_PREVIEW=1 run nopreview ship.sh
chk "no version preview URL: refused loudly, nothing promoted, prod never smoked in its place" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "versions upload" && nhas "versions deploy" && [ "$(grep "^curl " "$LOG" | grep -vc "^curl budget\|^curl plan")" = 0 ] \
   && echo "$OUT" | grep -q "no VERSION PREVIEW URL"'

INIT_STATE="$PRE 90
$NEW 10" run split ship.sh
chk "a split deployment already live: refused before any upload" \
  '[ $RC -ne 0 ] && clean && has "deployments status" && nhas "versions upload" && echo "$OUT" | grep -q "split deployment is live"'

STUB_STATUS_FAIL=1 run nostatus ship.sh
chk "the live deployment cannot be read: refused before any upload (no rollback target)" \
  '[ $RC -ne 0 ] && clean && nhas "versions upload"'

STUB_TRIGGERS_FAIL=1 run trigfail ship.sh
chk "triggers deploy fails: code stays live (no rollback), ship reports INCOMPLETE" \
  '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && nhas "wrangler rollback" && echo "$OUT" | grep -q "triggers deploy failed"'

for retired in siru veil bunny frame; do
  run "retired-$retired" ship.sh "$retired"
  chk "retired target '$retired' refused by name; no upload, no deploy" \
    '[ $RC -ne 0 ] && clean && nhas "versions" && nhas "rollback" && echo "$OUT" | grep -q "$retired is RETIRED"'
done

INIT_STATE="$NEW 100" run rbverb ship.sh rollback ryuklabs "$PRE"   # the verb's real starting point: the new version live
chk "the explicit rollback verb: live's schema read first (no *_org_required trigger), then wrangler rollback $PRE, read back at 100%; no gate, no upload" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "wrangler rollback $PRE -y" && nhas "^gate" && nhas "versions upload" \
   && has "^wrangler d1 execute ryuklabs-agent-r --remote --json --command SELECT name FROM sqlite_master WHERE type = .trigger. AND name LIKE .%_org_required" && before "_org_required" "wrangler rollback"'
# finding 1: after migrate-068 the rollback to code from before sprint 6 is a write outage — the verb refuses while the triggers stand
STUB_ORG_TRIGGERS=1 INIT_STATE="$NEW 100" run rbverb-068 ship.sh rollback ryuklabs "$PRE"
chk "the rollback verb with migrate-068's nine triggers on live: REFUSED (rc 1, no wrangler rollback, live still $NEW), the undo printed in its order — the down script FIRST, then the rollback — and the flag for a sprint-6 target" \
  '[ $RC -eq 1 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && nhas "wrangler rollback" && echo "$OUT" | grep -q "✗ live holds migrate-068.s 9 \*_org_required trigger(s): approval_audit_org_required " \
   && a=$(echo "$OUT" | grep -n "1. sh tools/migrate.sh tools/ship/org-required-down.sql" | cut -d: -f1) && b=$(echo "$OUT" | grep -n "2. sh tools/ship.sh rollback $PRE$" | cut -d: -f1) && [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] \
   && echo "$OUT" | grep -q "sh tools/ship.sh rollback $PRE --org-required-ok" && echo "$OUT" | tail -1 | grep -q "^✗ ROLLBACK REFUSED — nothing rolled back$"'
STUB_ORG_TRIGGERS=1 INIT_STATE="$NEW 100" run rbverb-068-ok ship.sh rollback ryuklabs "$PRE" --org-required-ok
chk "… with --org-required-ok (the target is sprint-6 code or later): warned, then rolled back to $PRE, read back" \
  '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && echo "$OUT" | grep -q "! live holds 9 \*_org_required trigger(s) — proceeding on --org-required-ok" && before "_org_required" "wrangler rollback $PRE -y"'
STUB_D1_FAIL=1 INIT_STATE="$NEW 100" run rbverb-068-unread ship.sh rollback ryuklabs "$PRE"
chk "… live's schema unreadable: refused the same way (the triggers may stand), nothing rolled back" \
  '[ $RC -eq 1 ] && [ "$STATE_NOW" = "$NEW 100" ] && nhas "wrangler rollback" && echo "$OUT" | grep -q "✗ live.s schema could not be read" && echo "$OUT" | grep -q "1. sh tools/migrate.sh tools/ship/org-required-down.sql"'

STUB_BUDGET=refuse INIT_STATE="$NEW 100" run rbverb-budget ship.sh rollback ryuklabs "$PRE"
chk "the rollback verb NEVER consults the budget — it rolls back even at 95%+" \
  '[ $RC -eq 0 ] && nhas "curl budget" && [ "$STATE_NOW" = "$PRE 100" ]'

run rbverb-retired ship.sh rollback siru
chk "the rollback verb refuses a retired target by name" '[ $RC -ne 0 ] && nhas "wrangler rollback"'

# ── U-READY-e — ship_tag inside a real git checkout: <short=9 sha>, then <sha>-dirty once engine/ has a change ─────
# The throwaway tree becomes a git repo for these two cases only (a fixture commit, no remote), then stops being one.
# `.runs/` is ignored there as it is in the real repo (.gitignore) — cf-budget.sh writes its record into it mid-ship.
if (cd "$T/engine" && git init -q . && printf '.runs/\n' > .gitignore && git add -A && git -c user.name=ship-selftest -c user.email=ship-selftest@invalid \
      -c commit.gpgsign=false commit -qm fixture) >/dev/null 2>&1; then
  GSHA=$(git -C "$T/engine" rev-parse --short=9 HEAD)
  run gittag ship.sh
  chk "in a clean git checkout the upload is tagged the short=9 sha ($GSHA) and the version record answered it; shipped" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && has "^versions upload tag=$GSHA$" && echo "$OUT" | grep -q "✓ version preview: tag $GSHA (version record)$"'
  echo "-- dirty" >> "$T/engine/migrate-999.sql"
  run gitdirty ship.sh
  chk "with an uncommitted change under engine/ the tag is $GSHA-dirty; shipped" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && has "^versions upload tag=$GSHA-dirty$" && echo "$OUT" | grep -q "✓ version preview: tag $GSHA-dirty (version record)$"'
  (cd "$T/engine" && git checkout -q -- migrate-999.sql) ; rm -rf "$T/engine/.git" "$T/engine/.gitignore"
else
  bad "could not make the throwaway tree a git checkout — the ship_tag sha/-dirty cases did not run"
fi

# ── 7.0b — THE RUN RECORD AND THE RESUME (engine/CLAUDE.md "Long runs leave a trail") ────────────────────────────────────────
# The throwaway tree becomes a git checkout again (the record is keyed by its commit); each scenario starts from the live state
# it names (INIT_STATE) and from the record the scenario before left, or none (rm). A run KILLED (SIGKILL to its whole group:
# a Mini restart) mid-walk or mid-production-smoke is the real interruption, not a failure stand-in.
RS="$T/engine/.runs/ship/ryuklabs"
NEW2=bbbbbbbb-3333-4333-8333-333333333333   # a second upload: the same 8-hex preview host as $NEW (the stub curl answers by host)
OTHER=cccccccc-4444-4444-8444-444444444444  # a version someone else put live
steps() { python3 -c 'import json,sys; print(" ".join(m["step"] for m in json.load(open(sys.argv[1]))["milestones"]))' "$1" 2>/dev/null; }
nruns() { python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["runs"]))' "$1" 2>/dev/null; }
xstates() { python3 -c 'import json,sys;print(" ".join(o["state"] for o in json.load(open(sys.argv[1]))["orgs"]))' "$T/engine/.runs/ship-xorg/$1/orgs.json" 2>/dev/null; }
plant() { mkdir -p "$T/engine/.runs/ship-xorg/$1" && printf '{"flags":"--live --config wrangler.jsonc --live-write-ok","orgs":[{"org":%s,"name":"xorg-old","state":"restored"}]}\n' "$2" > "$T/engine/.runs/ship-xorg/$1/orgs.json"; }
XFLAGS="--live --config wrangler.jsonc --live-write-ok --creds $T/env.sh"
noreuse() { ! echo "$OUT" | grep -q "(reused: \|upload reused\|reused from the run record"; }   # no step was taken from the record
recof() { echo "$OUT" | sed -n 's/^· run record \(\.runs[^ ]*\.json\) — .*/\1/p' | head -1; }   # the record a run named
gcommit() { (cd "$T" && git -c user.name=ship-selftest -c user.email=ship-selftest@invalid -c commit.gpgsign=false commit -qam "$1") >/dev/null 2>&1; }
# the checkout's top holds engine/ (the tree that ships), contracts/ (the door's contract: ships too) and docs/plan/ (does not)
if (cd "$T" && rm -rf engine/.runs/ship && mkdir -p docs/plan contracts && printf -- '-- migrate-997.sql — a table (the level case)\nCREATE TABLE t997 (a);\n' > engine/migrate-997.sql && printf '# handoff\n' > docs/plan/HANDOFF.md && printf '{"door":1}\n' > contracts/door.json \
      && printf '/*\n!/engine/\n!/docs/\n!/contracts/\n!/.gitignore\n.runs/\n__pycache__/\n' > .gitignore && git init -q . && git add -A && git -c user.name=ship-selftest \
      -c user.email=ship-selftest@invalid -c commit.gpgsign=false commit -qm fixture-resume) >/dev/null 2>&1; then
  C1=$(git -C "$T" rev-parse HEAD); CS1=$(git -C "$T" rev-parse --short=9 HEAD)

  run r-clean ship.sh
  REC1="$T/engine/$(recof)"; K1=$(basename "$REC1" .json)
  chk "7.0b a clean run on a clean commit: shipped; its record .runs/ship/ryuklabs/<key>.json — the key what ships (engine/ + contracts/), not the commit, which it keeps — holds every milestone in order (gate live upload preview_smoke cross_org walk 10% canary 100% production triggers), no temp file left, no secret in it" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && echo "$K1" | grep -Eq "^[0-9a-f]{40}$" && [ "$K1" != "$C1" ] && grep -q "\"key\": \"$K1\"" "$REC1" \
     && echo "$OUT" | grep -q "^· run record .runs/ship/ryuklabs/$K1.json — resumable: engine/ + contracts/ as committed (key $K1), commit $C1$" \
     && [ "$(steps "$REC1")" = "gate live upload preview_smoke cross_org walk 10% canary 100% production triggers" ] && [ -z "$(ls -a "$RS" | grep tmp)" ] \
     && grep -q "\"version\": \"$NEW\"" "$REC1" && grep -q "\"preview\": \"https://bbbbbbbb-ryuklabs-agent-r.stubsub.workers.dev\"" "$REC1" && grep -q "\"commit\": \"$C1\"" "$REC1" \
     && ! grep -qi "owner_key\|token\|bearer\|authorization" "$REC1" && noreuse'

  # a REUSED gate still runs the docs gate (the key covers engine/ and contracts/, never docs/): red docs stop the rerun before promotion
  rm -f "$REC1"
  SELFTEST_HOOK='exit 1' run r-docs-stop ship.sh
  STUB_DOCS_RC=1 run r-docs-red ship.sh
  chk "7.0b a rerun reusing the gate runs the docs gate again; red docs refuse it: not promoted, live untouched" \
    '[ $RC -ne 0 ] && [ "$STATE_NOW" = "$PRE 100" ] && nhas "^gate$" && has "^check-docs$" && nhas "versions deploy" \
     && echo "$OUT" | grep -q "the docs gate is red since the reused gate"'
  STUB_DOCS_RC=0   # (sh keeps a function call's prefix assignment after the call: reset, or every later rerun inherits red docs)

  # a run stopped before promotion (its preview hook failed), then rerun: everything before 10% reused, only the promotion runs
  rm -f "$REC1"
  SELFTEST_HOOK='exit 1' run r-stop ship.sh
  chk "7.0b a run stopped before promotion (its hook failed): not promoted; the record holds gate live upload preview_smoke cross_org walk" \
    '[ $RC -ne 0 ] && [ "$STATE_NOW" = "$PRE 100" ] && nhas "versions deploy" && [ "$(steps "$REC1")" = "gate live upload preview_smoke cross_org walk" ]'
  run r-promote ship.sh
  chk "7.0b the rerun on the same commit reuses gate, upload (its version record still answers), preview smoke, cross-org suite and walk — none rerun — and only promotes; shipped, the reuse named on the proofs line" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && nhas "^gate$" && nhas "versions upload" && has "versions view $NEW" && nhas "curl preview" && nhas "^xorg --url" && nhas "^walk " \
     && has "versions deploy $PRE@90% $NEW@10%" && has "curl canary health" && has "versions deploy $NEW@100%" && has "curl full home" && has "triggers deploy" && before "deployments status" "versions view $NEW" \
     && echo "$OUT" | grep -q "^· gate ✓ (reused: green at [0-9TZ:-]* for $C1)$" && echo "$OUT" | grep -q "^  ✓ upload reused: $NEW (tag $CS1, uploaded at " \
     && echo "$OUT" | grep -q "^· smoke version preview ✓ (reused: green at .* for $NEW" && echo "$OUT" | grep -q "^· cross-org suite ✓ (reused: green at .* on $NEW, live at migrate-000 — the run: .runs/ship-xorg/$NEW)$" \
     && echo "$OUT" | grep -q "^· the walk ✓ (reused: green at .* on $NEW" \
     && echo "$OUT" | tail -1 | grep -q "^✓ SHIPPED — proofs: preview ✓ · cross-org ✓ · walk ✓ · canary pinned ✓ · production ✓ · reused from the run record: gate, upload, preview smoke, cross-org suite, walk —" \
     && [ "$(steps "$REC1")" = "gate live upload preview_smoke cross_org walk live 10% canary 100% production triggers" ] && [ "$(nruns "$REC1")" = 2 ]'

  # the recorded upload vanished from Cloudflare: a fresh upload, and every later milestone (keyed to the old id) runs again
  INIT_STATE="$PRE 100" STUB_VIEW_GONE="$NEW" SELFTEST_NEW="$NEW2" run r-gone ship.sh
  chk "7.0b a rerun after the recorded upload vanished: the gate reused; the upload done afresh ($NEW2) and the preview smoke, cross-org suite and walk all rerun on it; shipped $NEW2" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW2 100" ] && nhas "^gate$" && has "versions view $NEW" && has "versions upload" && has "curl preview health" && has "^xorg --url .* --run-dir .runs/ship-xorg/$NEW2$" \
     && has "^walk --url .*--json .runs/ship-xorg/$NEW2/walk.json --operator-config wrangler.jsonc --confirm-live ryuklabs-agent-r$" && has "versions deploy $PRE@90% $NEW2@10%" && before "versions view $NEW" "versions upload" \
     && echo "$OUT" | grep -q "^  · the recorded upload $NEW (at .*) no longer answers (its version record: unreadable) — uploading afresh" \
     && ! echo "$OUT" | grep -q "preview ✓ (reused\|cross-org suite ✓ (reused\|walk ✓ (reused" && echo "$OUT" | tail -1 | grep -q "reused from the run record: gate —"'

  # --fresh: the record set aside, nothing reused
  INIT_STATE="$PRE 100" run r-fresh ship.sh ryuklabs --fresh
  chk "7.0b --fresh reuses nothing (gate, upload, smoke, suite, walk all run); the commit's record is set aside and a new one holds only this run" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && has "^gate$" && has "versions upload" && has "curl preview health" && has "^xorg --url" && has "^walk --url" \
     && ls "$RS" | grep -q "^$K1\.before-fresh-[0-9TZ]*\.json$" && [ "$(nruns "$REC1")" = 1 ] && echo "$OUT" | grep -q "fresh (--fresh): the key.s record set aside" && noreuse'

  # KILLED between the cross-org suite and the walk (a Mini restart): the rerun resumes AT the walk
  rm -f "$REC1"
  INIT_STATE="$PRE 100" STUB_WALK_MODE=hang SELFTEST_SIG=KILL SELFTEST_SIG_AT="walk started" run r-killwalk ship.sh
  WKF="$T/engine/.runs/ship-xorg/$NEW/walk-key.env"
  chk "7.0b a run KILLED mid-walk: nothing promoted; the record holds gate live upload preview_smoke cross_org (written before the walk acted); the walk's key file is left in its run dir (mode 600), none in TMPDIR" \
    '[ $RC -eq 137 ] && has "^walk started$" && [ "$STATE_NOW" = "$PRE 100" ] && nhas "versions deploy" && [ "$(steps "$REC1")" = "gate live upload preview_smoke cross_org" ] \
     && [ "$(python3 -c "import os,sys;print(oct(os.stat(sys.argv[1]).st_mode & 0o777))" "$WKF")" = 0o600 ] && [ -z "$(ls "$T" | grep "^ship-walk\.")" ]'
  INIT_STATE="$PRE 100" run r-resumewalk ship.sh
  chk "7.0b … the rerun removes the stopped run's walk key file FIRST (before the gate line), then resumes at the walk: gate, upload, preview smoke and cross-org suite reused (no suite run, no throwaway written), the walk runs, then the promotion; shipped" \
    '[ $RC -eq 0 ] && clean && a=$(echo "$OUT" | grep -n "^· a stopped run.s walk key file removed: .runs/ship-xorg/$NEW/walk-key.env$" | cut -d: -f1) && g=$(echo "$OUT" | grep -n "^· gate" | cut -d: -f1) \
     && [ -n "$a" ] && [ -n "$g" ] && [ "$a" -lt "$g" ] && [ ! -e "$WKF" ] && has "^walk creds keyed mode 600$" && [ "$STATE_NOW" = "$NEW 100" ] && nhas "^gate$" && nhas "versions upload" && nhas "curl preview" && nhas "^xorg --url" && has "^walk --url" && before "^walk --url" "versions deploy $PRE@90% $NEW@10%" \
     && echo "$OUT" | grep -q "reused from the run record: gate, upload, preview smoke, cross-org suite —"'

  # KILLED after the 100% deploy, mid-production-smoke: the rerun finishes, never re-promotes
  rm -f "$REC1"
  INIT_STATE="$PRE 100" STUB_HANG_AT=full SELFTEST_SIG=KILL SELFTEST_SIG_AT="curl full hang" run r-kill100 ship.sh
  K100=$(cat "$STATE")
  chk "7.0b a run KILLED after promotion (mid-production-smoke): live is $NEW at 100%; the record holds 10% canary 100%" \
    '[ $RC -eq 137 ] && [ "$STATE_NOW" = "$NEW 100" ] && [ "$(steps "$REC1")" = "gate live upload preview_smoke cross_org walk 10% canary 100%" ]'
  INIT_STATE="$K100" run r-finish ship.sh
  chk "7.0b … the rerun reads live, finds this commit's recorded upload at 100%, says so and does NOT re-promote (no upload, no preview, no suite, no walk, no versions deploy, no rollback): it finishes the production smoke and the triggers; shipped $PRE → $NEW" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && has "deployments status" && nhas "versions upload" && nhas "versions deploy" && nhas "wrangler rollback" && nhas "curl preview" && nhas "curl canary" \
     && nhas "^xorg" && nhas "^walk" && has "curl full health → new" && has "curl full home" && has "triggers deploy" && before "curl full decisions" "triggers deploy" \
     && echo "$OUT" | grep -q "^  ✓ live already serves $NEW at 100% — this commit.s recorded upload (at .*): a run stopped after promotion$" && echo "$OUT" | grep -q "NOT re-promoted" \
     && echo "$OUT" | grep -q "^  ✓ ryuklabs shipped: $PRE → $NEW (undo: sh tools/ship.sh rollback $PRE)$" \
     && echo "$OUT" | tail -1 | grep -q "^✓ SHIPPED — proofs: preview ✓ · cross-org ✓ · walk ✓ · canary pinned ✓ · production ✓ — resumed after promotion" \
     && [ "$(steps "$REC1")" = "gate live upload preview_smoke cross_org walk 10% canary 100% live production triggers" ]'
  STUB_SMOKE_FAIL=full INIT_STATE="$K100" run r-finish-fail ship.sh
  chk "7.0b … a resumed run whose production smoke fails never rolls back by itself (the version has served live since; a migration may have landed): the rollback verb is printed, live untouched" \
    '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && nhas "wrangler rollback" && nhas "versions deploy" \
     && echo "$OUT" | grep -q "NOT rolled back automatically: undo with sh tools/ship.sh rollback $PRE (it reads live.s schema first)"'

  # KILLED in the canary (10% live): the split is refused as before, and the record names the undo
  rm -f "$REC1"
  INIT_STATE="$PRE 100" STUB_HANG_AT=canary SELFTEST_SIG=KILL SELFTEST_SIG_AT="curl canary hang" run r-killcanary ship.sh
  INIT_STATE="$(cat "$STATE")" run r-split ship.sh
  chk "7.0b a run KILLED in its canary: the rerun refuses the split as before (no upload, no deploy) and the record names it and the undo" \
    '[ $RC -ne 0 ] && clean && nhas "versions upload" && nhas "versions deploy" && echo "$OUT" | grep -q "split deployment is live" \
     && echo "$OUT" | grep -q "the run record names it: this commit.s $NEW in its canary over $PRE (a run stopped after 10%) — undo: sh tools/ship.sh rollback $PRE, then rerun"'

  # promotion is NEVER reused: a run whose 100% deploy failed (10% and canary recorded, rolled back), rerun
  rm -f "$REC1"
  INIT_STATE="$PRE 100" STUB_DEPLOY_FAIL=100 run r-100fail ship.sh
  chk "7.0b a run whose 100% deploy failed: rolled back to $PRE; the record holds 10% and canary for $NEW" \
    '[ $RC -ne 0 ] && [ "$STATE_NOW" = "$PRE 100" ] && [ "$(steps "$REC1")" = "gate live upload preview_smoke cross_org walk 10% canary" ]'
  INIT_STATE="$PRE 100" run r-repromote ship.sh
  chk "7.0b … the rerun reuses up to the walk but promotes AGAIN from 10%: the 10% deploy, the canary smoke and the 100% deploy all run (a promotion step is never reused)" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && nhas "^xorg --url" && nhas "^walk " && has "versions deploy $PRE@90% $NEW@10%" && has "curl canary health" && has "curl canary home" && has "versions deploy $NEW@100%" \
     && before "versions deploy $PRE@90%" "curl canary health" && ! echo "$OUT" | grep -q "10% ✓ (reused\|canary ✓ (reused"'

  # D5: the preview's proofs are keyed by live's MIGRATION LEVEL too: a rerun on the same version after live's schema moved reruns
  # them (said), the gate and the upload still reused
  rm -f "$REC1"
  INIT_STATE="$PRE 100" SELFTEST_HOOK='exit 1' run r-lvl-stop ship.sh
  S997='[{"results":[{"type":"table","name":"t997","tbl_name":"t997","sql":"CREATE TABLE t997 (a)"}],"success":true,"meta":{}}]'
  INIT_STATE="$PRE 100" STUB_SCHEMA="$S997" run r-lvl-moved ship.sh
  chk "7.0b D5 a rerun on the same version after live's schema moved (migrate-000 → migrate-997: a migration applied, or a bookmark restored, between the runs): the gate and the upload reused, the preview smoke, the cross-org suite and the walk run AGAIN, each said; shipped; the record keeps each proof's level" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && nhas "^gate$" && nhas "versions upload" && has "curl preview health" && has "^xorg --url" && has "^walk --url" \
     && echo "$OUT" | grep -q "^  ✓ live is at migrate-997 (read from its schema" \
     && echo "$OUT" | grep -q "^  · the preview smoke was green for $NEW on live at migrate-000; live is now at migrate-997 — it runs again$" \
     && echo "$OUT" | grep -q "^  · the cross-org suite was green for $NEW on live at migrate-000; live is now at migrate-997 — it runs again$" \
     && echo "$OUT" | grep -q "^  · the walk was green for $NEW on live at migrate-000; live is now at migrate-997 — it runs again$" \
     && echo "$OUT" | tail -1 | grep -q "reused from the run record: gate, upload —" \
     && python3 -c "import json,sys; ms=json.load(open(sys.argv[1]))[\"milestones\"]; l=[m[\"proof\"].get(\"level\") for m in ms if m[\"step\"] in (\"preview_smoke\",\"cross_org\",\"walk\")]; sys.exit(0 if l == [\"000\"]*3 + [\"997\"]*3 else 1)" "$REC1"'

  # a prior run's STRANDED throwaways are cleaned BEFORE the suite (its own run dir's and any other's)
  rm -f "$REC1"
  INIT_STATE="$PRE 100" STUB_XORG_RC=1 STUB_XORG_LEFT=1 run r-strand ship.sh
  plant "$OTHER" 9
  INIT_STATE="$PRE 100" run r-autoclean ship.sh
  chk "7.0b a stranded throwaway (the failed suite's org 7 in .runs/ship-xorg/$NEW, an older run's org 9) is cleaned with the printed --cleanup command BEFORE the suite runs; then shipped" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && has "^xorg-cleanup --cleanup .runs/ship-xorg/$NEW $XFLAGS$" && has "^xorg-cleanup --cleanup .runs/ship-xorg/$OTHER $XFLAGS$" \
     && before "xorg-cleanup --cleanup .runs/ship-xorg/$NEW" "^xorg --url" && before "xorg-cleanup --cleanup .runs/ship-xorg/$OTHER" "^xorg --url" && [ "$(xstates "$OTHER")" = deleted ] \
     && echo "$OUT" | grep -q "^  · .runs/ship-xorg/$OTHER left: org 9 \"xorg-old\" (restored)$" && echo "$OUT" | grep -q "^  ✓ .runs/ship-xorg/$OTHER: every throwaway org it recorded is deleted$" \
     && echo "$OUT" | grep -q "^    cleaning: node tools/attack-xorg.mjs --cleanup .runs/ship-xorg/$NEW $XFLAGS$"'
  plant "$OTHER" 9
  INIT_STATE="$PRE 100" STUB_XORG_CLEANUP_RC=1 run r-cleanfail ship.sh
  chk "7.0b a cleanup that fails stops the ship BEFORE the suite: NOT promoted (no suite, no walk, no versions deploy, no rollback); the cleanup log shown" \
    '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && has "^xorg-cleanup --cleanup .runs/ship-xorg/$OTHER" && nhas "^xorg --url" && nhas "^walk " && nhas "versions deploy" && nhas "wrangler rollback" \
     && echo "$OUT" | grep -q "✗ the cleanup of .runs/ship-xorg/$OTHER did not finish (its log: .runs/ship-xorg/$OTHER/cleanup.log)" \
     && echo "$OUT" | grep -q "✗ a prior run.s throwaway org may stand in the live database — NOT promoted; no traffic moved, prod still on $PRE" && ! echo "$OUT" | grep -q "SHIPPED"'
  # D6: a record whose org is deleted but whose platform accounts are left is cleaned the same way before the suite
  mkdir -p "$T/engine/.runs/ship-xorg/$OTHER" && printf '{"flags":"--live --config wrangler.jsonc --live-write-ok","orgs":[{"org":9,"name":"xorg-old","state":"deleted","emails":["a@example.com"],"accounts":"left"}]}\n' > "$T/engine/.runs/ship-xorg/$OTHER/orgs.json"
  rm -f "$REC1"
  INIT_STATE="$PRE 100" run r-accleft ship.sh
  chk "7.0b D6 a prior run's throwaway whose org is deleted but whose accounts are left is named and cleaned (--cleanup) BEFORE the suite; then shipped" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && echo "$OUT" | grep -q "^  · .runs/ship-xorg/$OTHER left: org 9 \"xorg-old\" (deleted; its accounts left)$" \
     && has "^xorg-cleanup --cleanup .runs/ship-xorg/$OTHER $XFLAGS$" && before "xorg-cleanup --cleanup .runs/ship-xorg/$OTHER" "^xorg --url"'
  plant "$OTHER" 1
  INIT_STATE="$PRE 100" run r-org1 ship.sh
  chk "7.0b a record naming org 1 is never cleaned by a ship: refused (no --cleanup call), NOT promoted" \
    '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$PRE 100" ] && nhas "xorg-cleanup" && nhas "^xorg --url" && nhas "versions deploy" && echo "$OUT" | grep -q "names org 1 — a ship never cleans org 1"'
  rm -rf "$T/engine/.runs/ship-xorg/$OTHER"

  # live is read again on every run, and again before each traffic move
  INIT_STATE="$OTHER 100" run r-livemoved ship.sh
  chk "7.0b a rerun after live moved (now $OTHER): live read again, never taken from the record — the rollback target is $OTHER, the canary $OTHER@90%" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && echo "$OUT" | grep -q "^  ✓ live: $OTHER at 100% (the rollback target)$" && has "versions deploy $OTHER@90% $NEW@10%" && nhas "$PRE@90%" \
     && echo "$OUT" | grep -q "shipped: $OTHER → $NEW"'
  INIT_STATE="$PRE 100" SELFTEST_HOOK="echo '$OTHER 100' > \"\$STUB_STATE\"" run r-movedbefore10 ship.sh
  chk "7.0b live moved between the read and the 10% promote (by the hook here): re-read before any traffic moves — NOT promoted, nothing rolled back" \
    '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$OTHER 100" ] && nhas "versions deploy" && nhas "wrangler rollback" \
     && echo "$OUT" | grep -q "✗ live moved since it was read: now \[$OTHER 100\], not $PRE alone at 100% — NOT promoted"'
  INIT_STATE="$PRE 100" STUB_MOVE_ON_CANARY="$OTHER" run r-movedcanary ship.sh
  chk "7.0b live moved during the canary (someone else put $OTHER live): re-read before 100% — NOT promoted to 100%, NOT rolled back (look first)" \
    '[ $RC -ne 0 ] && clean && [ "$STATE_NOW" = "$OTHER 100" ] && has "versions deploy $PRE@90% $NEW@10%" && nhas "$NEW@100%" && nhas "wrangler rollback" \
     && echo "$OUT" | grep -q "✗ live is not this run.s canary split ($PRE 90% · $NEW 10%): now \[$OTHER 100\] — NOT promoted to 100%, NOT rolled back"'

  # THE KEY IS WHAT SHIPS: a docs/plan edit (the restart drill's HANDOFF.md, mid-ship), committed or not, keeps the resume
  printf 'stop 1\n' >> "$T/docs/plan/HANDOFF.md"; gcommit "handoff: stop 1"; C1b=$(git -C "$T" rev-parse HEAD)
  INIT_STATE="$PRE 100" run r-docscommit ship.sh
  chk "7.0b (a) a docs/plan-only COMMIT between runs (HEAD moved, engine/ and contracts/ did not): the same record ($K1.json), the resume holds — gate (said green for $C1, HEAD now $C1b), upload (its tag still $CS1), preview smoke, suite and walk reused; only the promotion runs" \
    '[ "$C1b" != "$C1" ] && [ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && [ "$(recof)" = ".runs/ship/ryuklabs/$K1.json" ] && nhas "^gate$" && nhas "versions upload" && nhas "curl preview" && nhas "^xorg --url" && nhas "^walk " \
     && has "versions deploy $PRE@90% $NEW@10%" && echo "$OUT" | grep -q "^· run record .runs/ship/ryuklabs/$K1.json — resumable: engine/ + contracts/ as committed (key $K1), commit $C1b; it holds " \
     && echo "$OUT" | grep -q "^· gate ✓ (reused: green at [0-9TZ:-]* for $C1) — HEAD is now $C1b: engine/ and contracts/ unchanged since$" && echo "$OUT" | grep -q "^  ✓ upload reused: $NEW (tag $CS1, uploaded at " \
     && python3 -c "import json,sys; r=json.load(open(sys.argv[1])); sys.exit(0 if r[\"commit\"] == sys.argv[2] and r[\"runs\"][-1][\"commit\"] == sys.argv[3] else 1)" "$REC1" "$C1" "$C1b"'
  printf 'stop 2 (not committed)\n' >> "$T/docs/plan/HANDOFF.md"
  INIT_STATE="$PRE 100" run r-docsdirty ship.sh
  chk "7.0b (b) an UNCOMMITTED docs/plan edit: engine/ and contracts/ are clean, so the resume holds — the same record, gate, upload, smoke, suite and walk reused; only the promotion runs" \
    '[ $RC -eq 0 ] && clean && [ "$STATE_NOW" = "$NEW 100" ] && [ "$(recof)" = ".runs/ship/ryuklabs/$K1.json" ] && nhas "^gate$" && nhas "versions upload" && nhas "curl preview" && nhas "^xorg --url" && nhas "^walk " \
     && has "versions deploy $PRE@90% $NEW@10%" && echo "$OUT" | tail -1 | grep -q "reused from the run record: gate, upload, preview smoke, cross-org suite, walk —"'
  git -C "$T" checkout -q -- docs/plan/HANDOFF.md
  printf '{"door":2}\n' > "$T/contracts/door.json"; gcommit "contracts: door 2"
  INIT_STATE="$PRE 100" run r-contracts ship.sh
  chk "7.0b (c) a contracts/ change (it ships: the door's contract) is a new key: nothing reused, a record of its own" \
    '[ $RC -eq 0 ] && clean && [ "$(recof)" != ".runs/ship/ryuklabs/$K1.json" ] && has "^gate$" && has "versions upload" && has "curl preview health" && has "^xorg --url" && has "^walk --url" && noreuse'

  # (c) an engine/ change (a NEW commit) reuses nothing; uncommitted changes under engine/ reuse nothing (and leave the key's record alone)
  echo "-- c2" >> "$T/engine/migrate-999.sql"; gcommit c2
  C2=$(git -C "$T" rev-parse HEAD)
  INIT_STATE="$PRE 100" run r-newcommit ship.sh
  R2="$T/engine/$(recof)"; K2=$(basename "$R2" .json)
  chk "7.0b (c) an engine/ change (a new commit) reuses nothing of the last key's record: gate, upload, preview smoke, suite and walk all run; its own record <key>.json" \
    '[ "$C2" != "$C1" ] && [ "$R2" != "$REC1" ] && [ $RC -eq 0 ] && clean && has "^gate$" && has "versions upload" && has "curl preview health" && has "^xorg --url" && has "^walk --url" \
     && [ -f "$R2" ] && [ "$(steps "$R2")" = "gate live upload preview_smoke cross_org walk 10% canary 100% production triggers" ] && noreuse'
  echo "-- dirty" >> "$T/engine/migrate-999.sql"; _n2=$(nruns "$R2")
  INIT_STATE="$PRE 100" run r-dirty ship.sh
  chk "7.0b uncommitted changes under engine/ reuse nothing (the gate and every step run) and open a record of their own (<key>-dirty-<time>-<pid>.json); the key's record is left untouched" \
    '[ $RC -eq 0 ] && clean && has "^gate$" && has "versions upload" && has "curl preview health" && has "^xorg --url" && has "^walk --url" && noreuse \
     && echo "$OUT" | grep -q "^· run record .runs/ship/ryuklabs/$K2-dirty-[0-9TZ]*-[0-9]*\.json — fresh: engine/ or contracts/ has uncommitted changes — nothing is reused$" && [ "$(nruns "$R2")" = "$_n2" ]'
  (cd "$T/engine" && git checkout -q -- migrate-999.sql)
  rm -rf "$T/.git" "$T/.gitignore" "$T/docs" "$T/contracts" "$T/engine/migrate-997.sql"
else
  bad "could not make the throwaway tree a git checkout — the 7.0b run-record cases did not run"
fi

# ── migrate.sh ─────────────────────────────────────────────────────────────────────────────────────────────────
run migrate migrate.sh migrate-999.sql
chk "migrate.sh: the Time Travel bookmark is read BEFORE the file is applied; restore command printed; rc 0" \
  '[ $RC -eq 0 ] && clean && before "d1 time-travel info ryuklabs-agent-r --json" "d1 execute ryuklabs-agent-r --remote --file" \
   && echo "$OUT" | grep -q "npx wrangler d1 time-travel restore ryuklabs-agent-r --bookmark=$BM" \
   && grep -q "\"bookmark\":\"$BM\"" "$T/engine/.runs/migrate.jsonl"'
_ob=$(printf '%s\n' "$OUT" | grep -n "✓ bookmark $BM" | head -1 | cut -d: -f1)
_or=$(printf '%s\n' "$OUT" | grep -n -- "--bookmark=$BM" | head -1 | cut -d: -f1)
_oa=$(printf '%s\n' "$OUT" | grep -n "· apply migrate-999.sql" | head -1 | cut -d: -f1)
{ [ -n "$_ob" ] && [ -n "$_or" ] && [ -n "$_oa" ] && [ "$_ob" -lt "$_oa" ] && [ "$_or" -lt "$_oa" ]; } \
  && ok "migrate.sh: the bookmark and its restore command print before the apply line" \
  || bad "migrate.sh output order: bookmark ($_ob) / restore ($_or) not before apply ($_oa)"

STUB_TT_FAIL=1 run migrate-nobm migrate.sh migrate-999.sql
chk "migrate.sh: no bookmark → the migration is NOT applied (rc 1)" \
  '[ $RC -ne 0 ] && has "d1 time-travel info" && nhas "d1 execute"'

STUB_BUDGET=refuse run migrate-budget migrate.sh migrate-999.sql
chk "migrate.sh: budget at 95%+ → refused (rc 2) before the bookmark; no wrangler call, nothing applied" \
  '[ $RC -eq 2 ] && has "curl budget refuse" && nhas "^wrangler"'
chk "migrate.sh (happy): the budget is read before the bookmark" \
  'LOG="$T/migrate.log"; before "curl budget" "d1 time-travel info"'

run migrate-noarg migrate.sh
chk "migrate.sh: no file argument → usage, no Cloudflare call" '[ $RC -ne 0 ] && [ ! -s "$LOG" ]'
run migrate-missing migrate.sh nope-404.sql
chk "migrate.sh: a missing file → refused, no Cloudflare call" '[ $RC -ne 0 ] && [ ! -s "$LOG" ]'

# the static half of "ship.sh never calls migrate.sh" (the log half is the happy case above): no line that is
# not a comment and not an echo'd message names it
grep -v '^[[:space:]]*#' "$SHIP_SRC" | grep -v 'echo "' | grep -q 'migrate\.sh' \
  && bad "ship.sh has an executable line naming migrate.sh — it must never call it" \
  || ok "ship.sh has no executable line naming migrate.sh"

# ── tools/ship-plan.sh — the plan is READ-ONLY by construction (S4) ──────────────────────────────────────────────────
run plan ship-plan.sh ryuklabs
chk "ship-plan: it prints the five sections and the numbered order, reading live with reads only (deployments status, three SELECTs), the budget's plan and usage, and nothing else" \
  'echo "$OUT" | grep -q "^1 · LIVE" && echo "$OUT" | grep -q "^5 · THE ORDER" && has "wrangler deployments status" \
   && has "wrangler d1 execute ryuklabs-agent-r --remote --json --command SELECT type, name, tbl_name, sql FROM sqlite_master" \
   && has "wrangler d1 execute ryuklabs-agent-r --remote --json --command SELECT key FROM projects" && clean \
   && [ "$(grep "^wrangler" "$LOG" | grep -vc "deployments status\|--remote --json --command SELECT")" = 0 ] \
   && nhas "versions upload" && nhas "versions deploy" && nhas "rollback" && nhas "time-travel" && nhas "triggers" && nhas "\-\-file" \
   && [ "$(grep "^curl" "$LOG" | grep -vc "^curl budget\|^curl plan")" = 0 ] && [ "$STATE_NOW" = "$PRE 100" ]'
chk "ship-plan (D2+B3): section 1 reads live's orgs' path names (SELECT slug FROM org) and runs check-org-names over them; section 5 prints the check with those names as a step" \
  'has "wrangler d1 execute ryuklabs-agent-r --remote --json --command SELECT slug FROM org WHERE slug IS NOT NULL ORDER BY id" && has "^names --slugs ryuklabs,suites$" \
   && echo "$OUT" | grep -q "^  org names: ryuklabs,suites (read: SELECT slug FROM org)$" && echo "$OUT" | grep -q "^    ✓ org names: " \
   && echo "$OUT" | grep -q "run:  npx wrangler d1 execute ryuklabs-agent-r --remote --json --command \"SELECT slug FROM org WHERE slug IS NOT NULL ORDER BY id\", then node tools/check-org-names.mjs --slugs ryuklabs,suites$"'
chk "ship-plan: the rollback it prints is the live version it read; the migrations come from the files (migrate-999 here), each with its rule" \
  'echo "$OUT" | grep -q "sh tools/ship.sh rollback $PRE" && echo "$OUT" | grep -q "run:  sh tools/migrate.sh migrate-999.sql" \
   && echo "$OUT" | grep -q "UNSTATED" && echo "$OUT" | grep -q "a pending migration states no order rule"'
chk "ship-plan: it prints only what this ship does — no step of an earlier ship (the org row, the rename, the strays, the old batch reports)" \
  '! echo "$OUT" | grep -q -E "org-row|tenant.json|rename|siru-services|stray|clean-reports"'
# a migration live already holds is never a step; every one it lacks is, in order, each with its rule, and the dry run starts
# at the first one it lacks. Live's schema holds migrate-997's table and not migrate-998's (migrate-999 creates nothing).
printf -- '-- migrate-997.sql — a table live holds\n-- Order: BEFORE the code that reads it.\nCREATE TABLE t997 (a);\n' > "$T/engine/migrate-997.sql"
printf -- '-- migrate-998.sql — a table live lacks\n-- Order: BEFORE the code that reads it.\nCREATE TABLE t998 (a);\n' > "$T/engine/migrate-998.sql"
STUB_SCHEMA='[{"results":[{"type":"table","name":"t997","tbl_name":"t997","sql":"CREATE TABLE t997 (a)"}],"success":true,"meta":{}}]' run plan-live ship-plan.sh ryuklabs
_plan_live_out="$OUT"
chk "ship-plan: no step for a migration live already holds (997, read from its schema); every one it lacks in order (998 BEFORE the code, then 999), the dry run from 998" \
  'echo "$OUT" | grep -q "live is at migrate-997 (read from the schema)" && [ "$(echo "$OUT" | grep -c "migrate-997")" = 1 ] \
   && a=$(echo "$OUT" | grep -n "^  migrate-998.sql *BEFORE the code" | cut -d: -f1) && b=$(echo "$OUT" | grep -n "^  migrate-999.sql *UNSTATED" | cut -d: -f1) \
   && x=$(echo "$OUT" | grep -n "[0-9]\. migration migrate-998.sql (BEFORE the code)" | cut -d: -f1) && y=$(echo "$OUT" | grep -n "[0-9]\. migration migrate-999.sql (its order UNSTATED" | cut -d: -f1) \
   && d=$(echo "$OUT" | grep -n "run:  sh tools/migrate-dryrun.sh ryuklabs-agent-r --from 998$" | cut -d: -f1) \
   && [ -n "$a" ] && [ -n "$b" ] && [ -n "$x" ] && [ -n "$y" ] && [ -n "$d" ] && [ "$a" -lt "$b" ] && [ "$d" -lt "$x" ] && [ "$x" -lt "$y" ] \
   && [ "$(echo "$OUT" | grep -c "run:  sh tools/migrate.sh migrate-")" = 2 ]'
rm -f "$T/engine/migrate-997.sql" "$T/engine/migrate-998.sql"
STUB_NAMES_RC=1 STUB_SLUGS="ryuklabs,login" run plan-names-red ship-plan.sh ryuklabs
chk "ship-plan (D2+B3): an org on live holding a reserved name is a GAP (the check's miss shown), the plan still printed whole" \
  '[ $RC -ne 0 ] && echo "$OUT" | grep -q "an org on live holds a name this code reserves (tools/check-org-names.mjs --slugs)" && echo "$OUT" | grep -q "an org holds \"login\"" && echo "$OUT" | grep -q "^5 · THE ORDER"'
STUB_SLUGS_FAIL=1 run plan-names-unread ship-plan.sh ryuklabs
chk "ship-plan (D2+B3): live without org.slug yet (before migrate-072): said, not a gap of its own; the step prints the read for after it" \
  'echo "$OUT" | grep -q "^  org names: not read (SELECT slug FROM org failed: live has no org.slug until migrate-072 lands" && nhas "^names " && ! echo "$OUT" | grep -q "holds a name this code reserves" \
   && echo "$OUT" | grep -q "then node tools/check-org-names.mjs --slugs <the path names it answers, comma-separated>$"'
run plan-offline ship-plan.sh ryuklabs --no-live-read --live-at 998
chk "ship-plan --no-live-read: no wrangler call at all; the version is said unknown, the stated migration (--live-at) is said as stated" \
  'nhas "^wrangler" && echo "$OUT" | grep -q "worker: unknown" && echo "$OUT" | grep -q "stated (--live-at), not read" && echo "$OUT" | grep -q "migrate-999.sql"'
# sprint 6: the real 067/068/069 headers read for their ORDER lines — 067 BEFORE the code, then the code, then 068 and 069 AFTER
# it, 069's preflight (read-only) printed as its own step right before it, then the per-org restore's rehearsal, the walk last;
# no R2 step (the plan never names r2-org-keys.mjs)
cp "$ENGINE/migrate-067.sql" "$ENGINE/migrate-068.sql" "$ENGINE/migrate-069.sql" "$T/engine/"
run plan-s6 ship-plan.sh ryuklabs --no-live-read --live-at 066
_ln() { echo "$OUT" | grep -n -- "$1" | head -1 | cut -d: -f1; }
# the ship's tail (sprint 10): the walk on live, then THE OWNER'S distribution-repo sync, then THE OWNER'S M4 step — the last
# three run lines, in that order; M4's reviewer world made at the brand's address, the one the plugin installs (the review's L4)
_tail_ok() { _r=$(echo "$OUT" | grep "^       run:  "); [ "$(echo "$_r" | tail -3 | head -1 | grep -c "run:  node tools/live-walk.mjs")" = 1 ] \
  && [ "$(echo "$_r" | tail -2 | head -1 | grep -c "node tools/make-plugin-skills.mjs --sync <clone>")" = 1 ] \
  && [ "$(echo "$_r" | tail -1 | grep -c "run:  node tools/make-reviewer-org.mjs --url https://agent.sharingu.xyz --live")" = 1 ]; }
chk "ship-plan (sprint 6): section 2 reads each ORDER line — 067 BEFORE, 068 and 069 AFTER the code — prints 069's preflight beside it and the sequence 067 -> (999, unstated) -> the code -> 068 -> 069" \
  'nhas "^wrangler" && echo "$OUT" | grep -q "^  migrate-067.sql *BEFORE the code" && echo "$OUT" | grep -q "^  migrate-068.sql *AFTER the code" && echo "$OUT" | grep -q "^  migrate-069.sql *AFTER the code" \
   && echo "$OUT" | grep -q "preflight (read-only, right before it; must answer NO row): SELECT submitter, client_ref, COUNT(\*) AS n FROM transmission WHERE client_ref IS NOT NULL GROUP BY submitter, client_ref HAVING COUNT(\*) > 1$" \
   && echo "$OUT" | grep -q "^  the sequence: migrate-067 -> migrate-999 -> the code -> migrate-068 (right after the code reaches 100%) -> migrate-069$" \
   && echo "$OUT" | grep -q "^  *when: right after the code reaches 100%$" && echo "$OUT" | grep -q "preflight (read-only, right before it; must answer NO row): SELECT .tokens. AS t, rowid AS r FROM tokens WHERE org IS NULL AND (person_id IN" \
   && echo "$OUT" | grep -q "^  *undo: sh tools/migrate.sh tools/ship/org-required-down.sql (its down script"'
chk "ship-plan (sprint 6): section 5 — 067 → the code (the cross-org suite named on its preview) → 068 → 069's preflight → 069 → the walk, the ship's last step (the owner's distribution-repo sync and M4 step after it), no R2 step and no per-org rehearsal (done on live at sprint 6's ship); the dry run from 067" \
  'a=$(_ln "\. migration migrate-067.sql (BEFORE the code)") && c=$(_ln "\. the code, with the import on its preview (ship.sh first runs the cross-org suite") && c2=$(_ln "\. the code, with the import and the APPLY") \
   && q68=$(_ln "\. the preflight of migrate-068.sql (read-only") && b=$(_ln "\. migration migrate-068.sql (AFTER the code — right after the code reaches 100%)") && q=$(_ln "\. the preflight of migrate-069.sql (read-only") && e=$(_ln "\. migration migrate-069.sql (AFTER the code)") \
   && u=$(_ln "\. the live walk of the member path") && ! echo "$OUT" | grep -q "r2-org-keys\|per-org restore rehearsed" \
   && d=$(_ln "run:  sh tools/migrate-dryrun.sh ryuklabs-agent-r --from 067$") \
   && g=$(_ln "\\. the OAuth grants minted before connections carried their stamp (read-only") && echo "$OUT" | grep -q "run:  node tools/ship/oauth-grants-check.mjs --config " \
   && [ "$d" -lt "$a" ] && [ "$a" -lt "$c" ] && [ "$c" -lt "$g" ] && [ "$g" -lt "$c2" ] && [ "$c2" -lt "$q68" ] && [ "$q68" -lt "$b" ] && [ "$b" -lt "$q" ] && [ "$q" -lt "$e" ] && [ "$e" -lt "$u" ] \
   && echo "$OUT" | grep -q "run:  npx wrangler d1 execute ryuklabs-agent-r --remote --json --command \"SELECT submitter, client_ref, COUNT(\*) AS n FROM transmission WHERE client_ref IS NOT NULL GROUP BY submitter, client_ref HAVING COUNT(\*) > 1\"$" \
   && [ "$(echo "$OUT" | grep -c "^       run:  " )" = "$(echo "$OUT" | sed -n "/^5 · THE ORDER/,\$p" | grep -c "^  [0-9]*\. ")" ] \
   && _tail_ok && [ "$(echo "$OUT" | grep -c "run:  node tools/live-walk.mjs")" = 1 ]'
chk "ship-plan (D2+B3; sprint 10's one-time steps): the org names step after the last migration BEFORE the code; no owner's step before the code (sprint 9's site redeploy and 'the repo goes public' are gone: the site is live, the repo stays private); the walk after the code; THE OWNER'S distribution-repo sync after the walk (--sync into a clone, the diff read, the push, then --sync-check and a clean machine's install), its undo a revert in that repo; THE OWNER'S M4 reviewer world after it, the last step; no earlier ship's one-time step" \
  'm=$(_ln "\. migration migrate-999.sql (its order UNSTATED") && n=$(_ln "\. the org names live holds, against THIS code.s reserved names") && c=$(_ln "\. the code, with the import on its preview") \
   && l=$(_ln "\. the live walk of the member path") && ds=$(_ln "\. THE OWNER.S, after the walk: the plugin.s distribution repo ryuk-labs/sharingu-plugin synced from this tree") && m4=$(_ln "\. THE OWNER.S, at M4") \
   && [ "$m" -lt "$n" ] && [ "$n" -lt "$c" ] && [ "$c" -lt "$l" ] && [ "$l" -lt "$ds" ] && [ "$ds" -lt "$m4" ] && [ "$(_ln "THE OWNER.S")" = "$ds" ] \
   && echo "$OUT" | sed -n "$((ds+1))p" | grep -q "^       run:  git clone https://github.com/ryuk-labs/sharingu-plugin <clone> (or git -C <clone> pull), node tools/make-plugin-skills.mjs --sync <clone>, read git -C <clone> diff, commit and push in the clone; then node tools/make-plugin-skills.mjs --sync-check <clone> (exit 0) and, on a clean machine, claude plugin marketplace add ryuk-labs/sharingu-plugin then claude plugin install sharingu@sharingu answers$" \
   && echo "$OUT" | sed -n "$((ds+2))p" | grep -q "^       undo: git -C <clone> revert <the sync commit>, then push (the distribution repo only" \
   && echo "$OUT" | sed -n "$((m4+1))p" | grep -q "run:  node tools/make-reviewer-org.mjs --url https://agent.sharingu.xyz --live --config wrangler.jsonc --confirm-live ryuklabs-agent-r --sample-only, then the same without --sample-only" \
   && echo "$OUT" | sed -n "$((m4+2))p" | grep -q "undo: after the review: node tools/org-undo.mjs export --org <its id> .*node tools/operator.mjs remove-account --email <each of the seven>" \
   && ! echo "$OUT" | grep -q "site.s redeploy\|sharingu\.ryuklabs\.io\|repo goes public\|once public\|privacy\.html" \
   && ! echo "$OUT" | grep -q "raise --org suites\|the sprint.s done-when on live: a stranger.s first run\|day0-verify\|per-org restore rehearsed" \
   && [ "$(echo "$OUT" | grep -c "THE OWNER.S")" = 2 ] && _tail_ok'
# finding 1: each step's undo BY PHASE — the code's rollback until 068 lands (the code step says so), 068's own undo its down
# script, from 068 on the code's undo is the down script FIRST then the rollback
chk "ship-plan (sprint 6): the undo BY PHASE — the code step's rollback holds until migrate-068 lands; 068's undo is its down script; from 068 on the code's undo is the down script FIRST, then the rollback" \
  'c=$(_ln "\. the code, with the import and the APPLY") && b=$(_ln "\. migration migrate-068.sql (AFTER") \
   && echo "$OUT" | sed -n "$((c+2))p" | grep -q "undo: code: sh tools/ship.sh rollback <the live version id — unknown here: run without --no-live-read> (until migrate-068.sql lands; from then its down script FIRST: sh tools/migrate.sh tools/ship/org-required-down.sql, then the rollback); data:" \
   && echo "$OUT" | sed -n "$((b+2))p" | grep -q "^       undo: sh tools/migrate.sh tools/ship/org-required-down.sql (its down script, a bookmark first); the last resort: npx wrangler d1 time-travel restore" \
   && echo "$OUT" | sed -n "$((b+3))p" | grep -q "^       from here the code.s undo is: sh tools/migrate.sh tools/ship/org-required-down.sql FIRST, then sh tools/ship.sh rollback <the live version id" \
   && [ "$(echo "$OUT" | grep -c "from here the code.s undo is")" = 1 ]'
rm -f "$T/engine/migrate-067.sql" "$T/engine/migrate-068.sql" "$T/engine/migrate-069.sql"

# D8: --no-import — a ship that runs NO preview hook: no import section, no prune plan, the code ONE `sh tools/ship.sh` step after the
# stamp-less grants' read; exit 0 when nothing else gaps (the same flags with the import: its gaps, exit 1)
STUB_PLAN=paid run plan-import ship-plan.sh ryuklabs --no-live-read --live-at 999
_imp_rc=$RC
STUB_PLAN=paid run plan-noimport ship-plan.sh ryuklabs --no-live-read --live-at 999 --no-import
chk "ship-plan --no-import (D8): section 3 imports and estimates nothing, section 4 the budget alone, section 5's code is one 'sh tools/ship.sh ryuklabs' (no SHIP_PREVIEW_HOOK, no prune plan, no reading, no apply) after the grants' read (no owner's step before it), the walk after it, then the owner's distribution-repo sync; with nothing pending its data undo says this ship lands NO migration (D16); exit 0 (with the import the same flags gap: $_imp_rc)" \
  '[ $RC -eq 0 ] && [ "$_imp_rc" -ne 0 ] && nhas "^wrangler" && echo "$OUT" | grep -q "^3 · THE IMPORT — none (--no-import)" && echo "$OUT" | grep -q "^  no import against it (--no-import)$" \
   && ! echo "$OUT" | grep -q "SHIP_PREVIEW_HOOK\|ship-prune\|import-live\|rows     about\|prune    its plan" && echo "$OUT" | tail -1 | grep -q "^✓ the plan is complete$" \
   && g=$(_ln "\. the OAuth grants minted before connections carried their stamp") && c=$(_ln "\. the code, with NO preview hook (--no-import") && [ "$g" -lt "$c" ] \
   && echo "$OUT" | sed -n "$((c+1))p" | grep -q "^       run:  sh tools/ship.sh ryuklabs$" && [ "$(echo "$OUT" | grep -c "run:  sh tools/ship.sh ")" = 1 ] \
   && w=$(_ln "\. the live walk of the member path") && ds=$(_ln "\. THE OWNER.S, after the walk: the plugin.s distribution repo") && [ "$c" -lt "$w" ] && [ "$w" -lt "$ds" ] \
   && ! echo "$OUT" | grep -q "site.s redeploy\|repo goes public" \
   && echo "$OUT" | sed -n "$((c+2))p" | grep -q "; data: none — this ship lands NO migration (live.s schema stays as it is; the code.s undo is the rollback alone)$" && ! echo "$OUT" | grep -q "the bookmark of the first migration above" && _tail_ok \
   && [ "$(echo "$OUT" | grep -c "^       run:  " )" = "$(echo "$OUT" | sed -n "/^5 · THE ORDER/,\$p" | grep -c "^  [0-9]*\. ")" ]'
LOG="$T/plan-import.log"
chk "ship-plan without --no-import, the same flags: the import's gaps (its sources and estimates), exit 1 — what --no-import leaves out" '[ "$_imp_rc" -ne 0 ]'

# the static half: no executable line of ship-plan.sh runs a mutating command (each is only printed)
python3 - "$PLAN_SRC" <<'PY' && ok "ship-plan.sh has no executable line that runs migrate.sh, ship.sh, import-live.sh, a non-dry-run import, a wrangler write, a POST of its own, r2-org-keys.mjs, org-undo.mjs or attack-xorg.mjs" || bad "ship-plan.sh can run a mutating command (see above)"
import re, sys
bad = []
for i, l in enumerate(open(sys.argv[1]), 1):
    s = l.strip()
    if not s or s.startswith("#"): continue
    code = re.sub(r'"(?:[^"\\]|\\.)*"', '""', s)          # strings are printed, never run
    if re.search(r"\bsh\s+tools/(migrate|ship|import-live)\.sh", code): bad.append((i, s))
    if "import-brain.mjs" in code and "--dry-run" not in s: bad.append((i, s))
    if re.search(r"wrangler\s", code) and not re.search(r"wrangler\s+(deployments status|d1 execute \S+ --remote --json --command)", s): bad.append((i, s))
    if re.search(r"curl\b", code): bad.append((i, s))
    if re.search(r"\b(r2-org-keys|org-undo|attack-xorg)\.mjs", code): bad.append((i, s))
for i, s in bad: print(f"    line {i}: {s[:140]}")
sys.exit(1 if bad else 0)
PY

# G2 H3 (the independent review): the prune is a PLAN first — the order prints the dry run (every plan, read-only, the run
# stopping before anything is sent), then the owner's reading, then the apply of the reviewed plans; IMPORT_PRUNE=1 is in no
# step
run plan-prune ship-plan.sh ryuklabs
chk "ship-plan: the prune's dry run (the plans, read-only; the run stops before anything is sent), then the reading, then the apply of the reviewed plans; never IMPORT_PRUNE=1" \
  'd=$(echo "$OUT" | grep -n "SHIP_PREVIEW_HOOK=.IMPORT_COST_DIR=" | head -1 | cut -d: -f1) && r=$(echo "$OUT" | grep -n "cp .runs/ship-prune/<project>.json .runs/ship-prune-reviewed/" | cut -d: -f1) \
   && a=$(echo "$OUT" | grep -n "SHIP_PREVIEW_HOOK=.IMPORT_PRUNE_PLANS=.runs/ship-prune-reviewed" | cut -d: -f1) && [ -n "$d" ] && [ -n "$r" ] && [ -n "$a" ] && [ "$d" -lt "$r" ] && [ "$r" -lt "$a" ] \
   && ! echo "$OUT" | grep -q "IMPORT_PRUNE=1" && echo "$OUT" | grep -q -- "--plan .runs/ship-prune/"'
chk "ship-plan: the walk on live is the ship's last step, after the apply (the owner's distribution-repo sync and M4 step after it)" \
  'a=$(echo "$OUT" | grep -n "SHIP_PREVIEW_HOOK=.IMPORT_PRUNE_PLANS=" | cut -d: -f1) && w=$(echo "$OUT" | grep -n "run:  node tools/live-walk.mjs" | cut -d: -f1) \
   && [ -n "$a" ] && [ -n "$w" ] && [ "$a" -lt "$w" ] && [ "$(echo "$OUT" | grep -c "^       run:  " )" = "$(echo "$OUT" | sed -n "/^5 · THE ORDER/,\$p" | grep -c "^  [0-9]*\. ")" ] \
   && _tail_ok'
# import-live.sh: IMPORT_PRUNE=1 refuses; a missing input (a gitignored overlay, saruspay's renders file) STOPS before anything
# is sent — no node, no curl, no wrangler (G2 H3: the old run dropped the warning and the prune removed what the input filed)
mkdir -p "$T/il/engine/tools/import/overlays/siru" "$T/il/src-siru" "$T/il/src-saruspay"
cp "$ENGINE/tools/import-live.sh" "$ENGINE/tools/lib-import-sources.sh" "$T/il/engine/tools/"
printf 'private.items.json\n' > "$T/il/engine/tools/import/overlays/siru/.gitignore"
printf '#!/bin/sh\necho "node $*" >> "$STUB_LOG"; exit 0\n' > "$T/bin/node"; chmod +x "$T/bin/node"
il() { LOG="$T/il.log"; : > "$LOG"; OUT=$(cd "$T/il/engine" && env -i HOME="$T/home" PATH="$T/bin:$PATH" STUB_LOG="$LOG" SHIP_PREVIEW_URL=http://127.0.0.1:9 SHARINGU_IMPORT_KEY=stub-key \
  DEV_BRAIN_SIRU="$T/il/src-siru" DEV_BRAIN_SARUSPAY="$T/il/src-saruspay" DEV_RENDERS_SARUSPAY="$T/il/no-such-board.html" IMPORT_PLAN=paid "$@" sh tools/import-live.sh 2>&1); RC=$?; }
il IMPORT_PROJECTS=siru IMPORT_PRUNE=1
chk "import-live: IMPORT_PRUNE=1 is refused (exit 2), nothing run" '[ "$RC" = 2 ] && echo "$OUT" | grep -q "IMPORT_PRUNE=1 is gone" && [ ! -s "$LOG" ]'
il IMPORT_PROJECTS="siru saruspay"
chk "import-live: a missing gitignored overlay and a missing renders file STOP the run before anything is sent, each named" \
  '[ "$RC" = 1 ] && echo "$OUT" | grep -q "an input of this import is not on this machine; nothing was sent" && echo "$OUT" | grep -q "siru: siru overlay private.items.json is not on this machine" \
   && echo "$OUT" | grep -q "saruspay: renders $T/il/no-such-board.html" && [ ! -s "$LOG" ]'
touch "$T/il/engine/tools/import/overlays/siru/private.items.json"
il IMPORT_PROJECTS=siru
chk "import-live: with every input in place it goes on past the check (the importer is called)" 'grep -q "^node tools/import-brain.mjs" "$LOG"'

# 10.4 (the sprint-9 ship's find: verify-live typed one Custom Domain, and the other went down unseen) — tools/route-domains.mjs
# READS the Custom Domains from wrangler.jsonc and verify-live's D4 runs for each; offline: the helper on the real config, on
# configs that list none or do not read, on a JSONC with a commented-out route, a "//" inside a string and trailing commas; and
# no executable line of verify-live.sh types a domain the config lists. SHIP_SELFTEST_ROUTES / SHIP_SELFTEST_VERIFY point at a
# MUTANT copy (the red half of the proof).
ROUTES_SRC="${SHIP_SELFTEST_ROUTES:-$ENGINE/tools/route-domains.mjs}"
VERIFY_SRC="${SHIP_SELFTEST_VERIFY:-$ENGINE/tools/verify-live.sh}"
rd() { RD_OUT=$(node "$ROUTES_SRC" "$@" 2>"$T/rd.err"); RD_RC=$?; }
rd --config "$ENGINE/wrangler.jsonc"
chk "route-domains: the real wrangler.jsonc gives exactly agent.ryuklabs.io and agent.sharingu.xyz, in its order, exit 0" \
  '[ "$RD_RC" = 0 ] && [ "$RD_OUT" = "$(printf "agent.ryuklabs.io\nagent.sharingu.xyz")" ]'
_REAL_DOMAINS="$RD_OUT"
printf '{\n  // a worker with no route\n  "name": "w",\n  "workers_dev": true,\n}\n' > "$T/rd-none.jsonc"
rd --config "$T/rd-none.jsonc"
chk "route-domains: a config with no route fails (exit 1, nothing on stdout, the reason named)" \
  '[ "$RD_RC" = 1 ] && [ -z "$RD_OUT" ] && grep -q "no Custom Domain" "$T/rd.err"'
printf '{ "routes": [ "zone.example/*", { "pattern": "z.example/*", "zone_name": "z.example" } ] }\n' > "$T/rd-zone.jsonc"
rd --config "$T/rd-zone.jsonc"
chk "route-domains: zone routes alone (no custom_domain: true) fail the same way" '[ "$RD_RC" = 1 ] && [ -z "$RD_OUT" ]'
rd --config "$T/no-such.jsonc"
chk "route-domains: a missing config fails (exit 1, nothing on stdout)" '[ "$RD_RC" = 1 ] && [ -z "$RD_OUT" ] && grep -q "does not read" "$T/rd.err"'
printf '{ "routes": [ { "pattern": "a.example", "custom_domain": true } \n' > "$T/rd-bad.jsonc"
rd --config "$T/rd-bad.jsonc"
chk "route-domains: a config that does not parse fails (exit 1, nothing on stdout)" '[ "$RD_RC" = 1 ] && [ -z "$RD_OUT" ] && grep -q "does not parse" "$T/rd.err"'
cat > "$T/rd-jsonc.jsonc" <<'EOF'
{
  // "routes": [ { "pattern": "commented.example", "custom_domain": true } ],
  /* a block comment, "routes" in it too: [ { "pattern": "block.example", "custom_domain": true } ] */
  "name": "w", "docs": "https://example.com//not-a-comment", "note": "a \"quoted\" // inside",
  "routes": [ "zone.example/*", { "pattern": "one.example", "custom_domain": true, }, { "pattern": "two.example", "custom_domain": true }, ],
}
EOF
rd --config "$T/rd-jsonc.jsonc"
chk "route-domains: JSONC — commented-out routes ignored, a // inside a string kept, trailing commas dropped, zone routes skipped: exactly one.example, two.example" \
  '[ "$RD_RC" = 0 ] && [ "$RD_OUT" = "$(printf "one.example\ntwo.example")" ]'
# the sprint-10 review, L3: a trailing comma followed by a comment before the close is trailing too (comments go first, then
# the commas, each pass string-aware); a ", ]" inside a string is kept
cat > "$T/rd-comma.jsonc" <<'EOF'
{
  "note": "a value holding , ] and , } stays",
  "routes": [
    { "pattern": "one.example", "custom_domain": true, // the first
    },
    { "pattern": "two.example", "custom_domain": true }, /* the last */
  ], // the routes
}
EOF
rd --config "$T/rd-comma.jsonc"
chk "route-domains: JSONC — a trailing comma followed by a // or a /* */ comment before the close is dropped; a ', ]' inside a string kept: exactly one.example, two.example" \
  '[ "$RD_RC" = 0 ] && [ "$RD_OUT" = "$(printf "one.example\ntwo.example")" ]'
printf '{ "routes": [ { "pattern": "x.example/path", "custom_domain": true } ] }\n' > "$T/rd-path.jsonc"
rd --config "$T/rd-path.jsonc"
chk "route-domains: a Custom Domain pattern that is not a bare host name fails" '[ "$RD_RC" = 1 ] && [ -z "$RD_OUT" ] && grep -q "not a bare host name" "$T/rd.err"'
_typed=$(for d in $_REAL_DOMAINS; do grep -n -F -- "$d" "$VERIFY_SRC" | grep -v "^[0-9]*:[[:space:]]*#"; done)
chk "verify-live: no executable line types a Custom Domain wrangler.jsonc lists (the D4 checks read them: tools/route-domains.mjs, then one pass per domain)" \
  '[ -n "$_REAL_DOMAINS" ] && [ -z "$_typed" ] && grep -q "^DOMAINS=\$(node \"\$(dirname \"\$0\")/route-domains.mjs\" --config \"\$(dirname \"\$0\")/../wrangler.jsonc\"" "$VERIFY_SRC" \
   && grep -q "^  for DOM in \$DOMAINS; do$" "$VERIFY_SRC" || { echo "$_typed" | head -5 | sed "s/^/        typed: /"; false; }'

# sprint 11's review (L6): verify-live's D4e, per Custom Domain — GET /.well-known/openai-apps-challenge answers ONLY the
# ordinary 404 JSON not_found (none stored) or 200 text/plain holding one token (the operator's). Offline: the check sits in the
# per-domain loop, and its own lines, run with a stub curl, pass exactly those two answers and fail every other, never printing
# the token.
_loop=$(awk '/^  for DOM in \$DOMAINS; do$/{f=1} f{print} f&&/^  done$/{exit}' "$VERIFY_SRC")
awk '/^    DOM_CHB=\$\(mktemp\)$/{f=1} f{print} f&&/chk "D4e/{exit}' "$VERIFY_SRC" > "$T/d4e.frag"
cat > "$T/d4e.sh" <<'STUB'
curl() { out=""; while [ $# -gt 0 ]; do [ "$1" = "-o" ] && { out="$2"; shift; }; shift; done; printf '%s' "$FAKE_BODY" > "$out"; printf '%s %s' "$FAKE_CODE" "$FAKE_TYPE"; }
chk() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1"; fi; }
UA=x; O=https://d.example; DOM=d.example
. "$D4E_FRAG"
STUB
d4e() { FAKE_CODE="$1" FAKE_TYPE="$2" FAKE_BODY="$3" D4E_FRAG="$T/d4e.frag" sh "$T/d4e.sh" 2>&1; }
_tok="tok-EN_1.2~$(date +%s)"
_d4e_ok=$( { d4e 404 application/json '{"error":"not_found","path":"/.well-known/openai-apps-challenge"}'; d4e 200 'text/plain; charset=utf-8' "$_tok"; } )
_d4e_bad=$( { d4e 200 text/html '<html>'; d4e 404 application/json '{"error":"nope"}'; d4e 302 '' ''; d4e 404 text/html 'not found'
  d4e 200 'text/plain; charset=utf-8' 'two words'; d4e 503 text/html x; d4e 401 application/json '{"error":"invalid_token"}'; } )
if printf '%s\n' "$_loop" | grep -q 'chk "D4e   \$DOM /.well-known/openai-apps-challenge' && printf '%s\n' "$_loop" | grep -q '"\$O/.well-known/openai-apps-challenge"' \
   && [ "$(printf '%s\n' "$_d4e_ok" | grep -c '^PASS D4e')" = 2 ] && [ "$(printf '%s\n' "$_d4e_bad" | grep -c '^FAIL D4e')" = 7 ] \
   && ! printf '%s\n%s\n' "$_d4e_ok" "$_d4e_bad" | grep -qF -- "$_tok"; then
  ok "verify-live D4e: in the per-domain loop; /.well-known/openai-apps-challenge passes only 404 JSON not_found or 200 text/plain one token (2/2), fails a page, a redirect, a 5xx, a 401, a 404 that is no not_found, a body that is no token (7/7), never prints the token"
else
  bad "verify-live D4e: the per-domain openai-apps-challenge check is missing or accepts the wrong answers"; printf '%s\n%s\n' "$_d4e_ok" "$_d4e_bad" | sed 's/^/        /' | head -12
fi

echo "ship-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
