#!/bin/sh
# ship.sh — THE deploy ritual as one command (scar 2026-09-09: a deploy on a red gate slipped through a `gate | grep`
# chain; a helper defined after its first use passed node --check and the dry-run, then threw on every page — 1101 for
# minutes). Refuses unless the gate exits 0; exits non-zero on any failure.
#
# SAFE SHIP (build0925-engine-safe-ship, 2026-09-25 — brief 02_AGENT_R/next-batch-engine-fast-gate.md item 3):
# upload → verify → promote, never "switch all traffic at once" any more.
#   1. gate            `sh gate.sh` by EXIT CODE — always first, before any Cloudflare call (the 2026-09-09 scar)
#   2. read live       `wrangler deployments status --json` — must be ONE version at 100% (the pre-ship version,
#                      the rollback target). A split already live is refused: finish or undo it first.
#   2b. live's schema  (the sprint-7 review, D5 and D2+B3) two more reads of live's D1, before anything is uploaded:
#       and org names  (a) its schema (`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql NOT NULL`, read through
#                      tools/ship-plan-migrations.py, as tools/ship-plan.sh reads it): live's MIGRATION LEVEL, which keys the
#                      preview's proofs in the run record (below); (b) its orgs' path names (`SELECT slug FROM org`, migrate-072)
#                      against THIS code's reserved names: `node tools/check-org-names.mjs --slugs <those>` — an org holding a
#                      name a route of this code answers would lose its address the moment the code lands (src/index.js
#                      splitAddress reads a reserved segment as the platform's). Either read failing, or a held name reserved:
#                      NOT shipping (nothing uploaded, prod untouched). Never reused: both run on every run.
#   3. upload          `wrangler versions upload` — a new version + its VERSION PREVIEW URL, taking NO traffic.
#                      No preview URL (previews disabled) → refuse loudly; never fall back to smoking prod.
#   4. preview smoke   /health then /home /build /decisions on a minted dev-org seat, against the preview URL.
#                      /health's versionId (src/index.js, off the CF_VERSION_METADATA binding) must BE the uploaded
#                      version, else ✗. A failure here stops the ship BEFORE any traffic moved: prod is untouched,
#                      nothing to undo. U-READY-e (2026-09-29): the upload carries `--tag <short sha>[-dirty]`
#                      (ship_tag: `git rev-parse --short=9 HEAD`, `-dirty` when `git status --porcelain -- .` in engine/
#                      is non-empty, `unknown` outside git). U-READY-e2 (2026-09-29): the tag is proven from Cloudflare's
#                      VERSION RECORD — `wrangler versions view <id> --json` annotations["workers/tag"] must BE that tag
#                      (unequal or unreadable → ✗ the same way, nothing promoted). The runtime binding does NOT expose
#                      .tag on this account (the first real ship, version 096ee88d: record tag 5a1580ff2, /health none),
#                      so /health `versionTag` is BEST-EFFORT: absent is fine, present-and-wrong is ✗. Only the preview
#                      checks the tag (a pinned canary may still answer the old one).
#   4b. cross-org      (sprint 6, PLATFORM §5: the canary reaches every org) `node tools/attack-xorg.mjs --url <preview> --live
#                      --live-write-ok`: two THROWAWAY orgs restored into the live database through tools/org-undo.mjs (never
#                      org 1), every tool, resource and route walked as each against the other, both deleted after (even on
#                      a failure or a signal). Runs BEFORE the preview hook. A finding, a 5xx or a throwaway left behind: NOT
#                      promoted, no traffic moved (the same path as a failed preview smoke). Its log: .runs/ship-xorg/<version>/
#                      SIGNALS (sprint 6 review, finding 17): the suite runs in its OWN session (a hangup of the operator's
#                      terminal never reaches it: node resets an inherited ignore, so a SIGHUP would kill it mid-walk and strand
#                      its throwaways); ship.sh traps HUP, INT and TERM around it and hands each to the suite as ONE SIGTERM (its
#                      own handler stops the walk and deletes both orgs), waits for it to finish, and is NOT promoted. On any
#                      failure ship.sh reads <run dir>/orgs.json and prints each throwaway org left and the exact
#                      `node tools/attack-xorg.mjs --cleanup <run dir> …` that removes them (never relying on the log's tail).
#   4c. the walk       (PLATFORM §5: "… and the walk before any traffic moves") `node tools/live-walk.mjs --url <preview>
#                      --preview --live --operator-config wrangler.jsonc --confirm-live <its D1>`: the member path on a throwaway
#                      project, as the minted seat (the suites' org, never org 1), the preview URL checked first; its clean-up
#                      removes its two people's platform accounts (D6). A failure: NOT promoted. Then the preview hook, then 10%.
#   5. promote 10%     `wrangler versions deploy <pre>@90% <new>@10%`
#   6. canary smoke    the same smoke on the PRODUCTION route, pinned to the new version with the
#                      `Cloudflare-Workers-Version-Overrides` header (Cloudflare's gradual-deployment override) — and
#                      /health's versionId says whether the pin was HONOURED. Cloudflare applies an override only once
#                      the edge sees the version in the current deployment ("up to a couple of seconds" after a
#                      change); otherwise it silently routes by the percentages (batch:ship-canary-pin, 2026-09-28:
#                      the #235 canary was answered by the OLD version). So the read is retried (SHIP_READS_CANARY=5
#                      reads, 3 s apart);
#                      a pin never honoured prints `! canary pin not honoured …` and SKIPS the pinned pages — they
#                      would test the old version — never a pass and never a failure; the 100% smoke is then the proof.
#   7. promote 100%    `wrangler versions deploy <new>@100% -y`, then the same smoke on the production route: /health's
#                      versionId must be the new version AND the pages 200, else undo. A 100% deployment change can
#                      take longer than ~12 s to reach every edge (batch:ship-100-wait, 2026-09-28: UI-B7b's healthy
#                      ship was rolled back after 5 reads), so production gets its own window: SHIP_READS_PROD=30
#                      reads, 3 s apart (~90 s), with a `· waiting for <new> at the edge (read n/30, answered by
#                      <old>)` line every 5 reads. The preview (step 4) keeps SHIP_READS_PREVIEW=5.
#                      The final line names the proofs: preview ✓ · cross-org ✓ · walk ✓ · canary pinned ✓|skipped (pin not honoured) · production ✓
#   8. triggers        `wrangler triggers deploy` — `versions upload` never applies crons (wrangler says so
#                      itself); the old single-step `wrangler deploy` did. A failure here leaves the code live
#                      and says so — the code is not rolled back for a trigger write.
# Any failure at 5-7 (a promote OR a smoke after traffic moved) → `wrangler rollback <pre-ship version> -y`, then the
# live deployment is READ BACK and must show the pre-ship version at 100% — a rollback wrangler silently skipped
# (a changed-secret prompt answers "no" under -y) is caught, never reported as done.
# NEVER touches D1: a rollback restores CODE only, and a migration is a separate human verb, `sh tools/migrate.sh
# <file>` (Time Travel bookmark first). ship.sh never calls it. During the 10% window two versions share ONE schema
# — the expand/contract doctrine in BUILD.md is what makes that safe.
#
# Usage: sh tools/ship.sh [ryuklabs] [--fresh]                ship (default: ryuklabs); --fresh: reuse nothing (below)
#        sh tools/ship.sh rollback [ryuklabs] [<version-id>] [--org-required-ok]
#                                                             the explicit undo verb — no gate (it IS the undo);
#                                                             no id: wrangler's own previous stable version
# THE ROLLBACK AFTER migrate-068 (sprint 6 review, finding 1): the verb first READS live's schema (one SELECT on sqlite_master,
# `wrangler d1 execute --remote --json --command`) for migrate-068's nine *_org_required triggers. While they stand, code from
# before sprint 6 (it names no org on any row it writes) would have every sign-in, sign-in attempt, filing and event REFUSED —
# a rollback into a write outage — so the verb REFUSES (exit 1, no wrangler rollback) and prints the undo in its order: the
# down script first (`sh tools/migrate.sh tools/ship/org-required-down.sql`), then the rollback. `--org-required-ok` proceeds
# anyway (the target is sprint-6 code or later: it stamps every org). A schema that cannot be read refuses the same way (the
# triggers may stand). The in-ship undo (steps 5-7) rolls back to the version live ran a minute before, never past a
# migration (ship.sh applies none), so it does not read the schema.
#
# QC74D4892 (one-org-worker, 2026-09-22): ryuklabs is the only deployed org worker this account carries now —
# siru/veil/bunny (PROD orgs) and the cross-org launcher (frame) are retired; their own wrangler configs are deleted.
# A "siru"/"frame" target is refused BY NAME with the retirement reason, rather than silently doing nothing.
# A brand-new self-hosted platform's FIRST deploy (tools/new-org.sh, ORG-SETUP.md) stays on plain `wrangler deploy` —
# `versions upload` needs a worker that already exists; that path is deliberately not generalised here.
#
# Q65300E50 (2026-09-22, THE THREE RINGS): DEPLOY uses sharingu's own three-line env only. ryuklabs is the dev org —
# its smoke MINTS a short-lived owner seat (tools/lib-mint-seat.sh, a write to ryuklabs' own D1, as before) and
# removes it after, never a stored key. Nothing printed but codes and version ids.
#
# BUDGET GUARD (Q9CF32D8F, 2026-09-25 — the account is on Cloudflare's FREE tier): after the gate and after the target
# is validated, and BEFORE the first wrangler call, `sh tools/cf-budget.sh` reads today's usage; at 95% of ANY free
# daily limit (or if it cannot read the usage at all) NOTHING ships — no upload, no mint, no smoke. The explicit
# `rollback` verb is deliberately NOT guarded: undoing a broken prod must never wait on a budget (a refused rollback
# would cost more than the overage it saves).
# SMOKE COST, per ship (the smokes stay LIVE — they prove the real deploy — and stay this small):
#   requests  3 smokes × (1 /health + 3 authed pages: /home /build /decisions) = 12 worker requests on a clean ship
#             (the /health read carries the versionId — no extra request); a pin never honoured: the canary costs
#             SHIP_READS_CANARY=5 /health reads and no pages (11 in all). Worst case per smoke = 10 /health polls (the
#             10th answers 200) + (reads − 1) version re-reads + 3 pages × 2 (a `000` page is retried once):
#             preview 10 + (SHIP_READS_PREVIEW 5 − 1) + 6 = 20 · canary 10 + (SHIP_READS_CANARY 5 − 1) + 6 = 20 ·
#             production 10 + (SHIP_READS_PROD 30 − 1) + 6 = 45 → 85 in all (was 51 before batch:ship-100-wait);
#             + the preview's optional /health versionTag read (U-READY-e): 1 on a clean ship, 3 at worst;
#             + 1 Cloudflare API read (`wrangler versions view`, U-READY-e2) — not a worker request, no D1 cost;
#             0 on the rollback verb.
#   D1 writes the seat mint: 5 INSERT OR IGNORE + 5 UPDATE people + 4 project_seats INSERT…SELECT (one row per active
#             project each) — then mint_cleanup: 5 UPDATE people + 1 UPDATE tokens (this run's tokens only).
#   D1 reads  whatever /home /build /decisions read per call on ryuklabs' own data, × 3, plus the auth lookups —
#             not measured here (the whole-table scans behind them are E2's brief, not this file's).
#   the cross-org suite (4b): ~6,000 requests to the PREVIEW (the gate's walk: both directions, each throwaway org's owner and
#             member), each on a two-person org; its operator side a few hundred D1 API calls (the restores, the facts, a
#             count-and-hash snapshot per direction, each org's export and delete) and the throwaways' R2 objects (a few);
#             every row it writes is a throwaway org's and is deleted. ~10-20 minutes on the preview.
#   the walk (4c): one tools/live-walk.mjs run on the preview (its own summary prints its requests and D1 rows: a few hundred
#             requests), in the suites' org, on a throwaway eval-marked project it removes; + its tools/cf-budget.sh read.
#
# THE RUN RECORD AND THE RESUME (sprint 7, 7.0b — the sprint-6 ship lost two whole runs to two Mini restarts; engine/CLAUDE.md
# "Long runs leave a trail"). Before the gate a run opens its record, .runs/ship/<org>/<key>.json (machine-local; every write is
# a temp file renamed into place). THE KEY is WHAT SHIPS, not the whole commit (ship_key): the committed trees of engine/ and
# contracts/ hashed together — a docs/plan edit, committed or not (the restart drill updates HANDOFF.md mid-ship), keeps the
# resume; any change under engine/ or contracts/ voids it. The record keeps each run's commit for the human. After each step
# the run appends {step, at, proof} BEFORE the next step acts:
#   gate {key, commit} · live {version} (the trail only: live is NEVER reused) · upload {version, preview, tag, key, commit} ·
#   preview_smoke {version, tag, level} · cross_org {version, run_dir, level} · walk {version, level} · preview_hook {version} (never reused) ·
#   10% {version, pre} · canary {version, result} · 100% {version, pre} · production {version} · triggers {version}.
# A rerun with the SAME key reuses a milestone only while its key holds, never "step N was done":
#   gate            recorded green for this key → `· gate ✓ (reused: green at <at> for <its sha>)`, the gate not run
#   upload          the latest recorded upload of this key, ONLY while Cloudflare's version record still answers it with the
#                   tag it was uploaded with (`wrangler versions view`, two reads) — else a fresh upload, and every later
#                   milestone, keyed to the old version id, no longer matches
#   preview_smoke · cross_org · walk   ONLY when recorded for the SAME version id AND the SAME live migration level (2b: these
#                   proofs ran against live's D1 — a bookmark restored between two runs, a migration applied or undone, voids
#                   them; a record from before the level was kept never matches: the step runs again)
#   live · 10% · canary · 100% · production · triggers · the preview hook   NEVER: live is read again on every run, re-read
#                   before 10% (it must still be the pre-ship version alone at 100%) and before 100% (it must still be this
#                   run's split) — a live that moved is refused, nothing promoted further. A live already serving this commit's
#                   recorded upload at 100% (a run killed after promotion) is said, never re-promoted: the run finishes the
#                   steps after it (the production smoke, the triggers), its rollback target the record's 10% pre (and
#                   never rolls back by itself: a migration may have landed since — the rollback verb reads the schema).
# Uncommitted changes under engine/ or contracts/ (`git status --porcelain -- engine contracts`) or no commit (not a checkout)
# open a NEW record every run (<key>-dirty-<time>-<pid>.json · unknown-<time>-<pid>.json) and reuse nothing; `--fresh` sets
# the key's record aside (<key>.before-fresh-<time>.json) and reuses nothing. A record that cannot be written refuses the ship
# before the gate. The walk's key file lives in its run dir (<run dir>/walk-key.env, mode 600, removed after the walk); one a
# killed run left is removed at the next run's start.
# STRANDED THROWAWAYS: before the cross-org suite (4b) — reused or not — every .runs/ship-xorg/*/orgs.json is read; each run dir
# listing an org not deleted is removed with the exact command a failed suite prints (`node tools/attack-xorg.mjs --cleanup <run
# dir> --live …`, its output to <run dir>/cleanup.log) and read again; a cleanup that fails, a record that cannot be read or one
# naming org 1 (never cleaned by a ship; attack-xorg refuses it too) stops the ship: NOT promoted.
# Proven OFFLINE by tools/ship-selftest.sh (a gate step): a stubbed `npx wrangler` + `curl` on PATH walk every branch.
cd "$(dirname "$0")/.." || exit 1
[ -f "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}" ] && { set -a; . "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}"; set +a; }
{ [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; } || { echo "  ✗ CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID required — source ~/.sharingu/env-sharingu.sh"; exit 1; }
. tools/lib-mint-seat.sh

CFG=wrangler.jsonc
WORKER=ryuklabs-agent-r
DB=ryuklabs-agent-r    # the worker's own D1 (wrangler.jsonc's d1_databases[0], the one the migrations apply to)
SHIP_READS_PREVIEW=5   # /health version reads on the fresh preview URL (3 s apart)
SHIP_READS_CANARY=5    # … on the pinned canary (#236: its bound and its skip semantics are unchanged)
SHIP_READS_PROD=30     # … at 100% — ~90 s for the deployment change to reach every edge (batch:ship-100-wait)
SMOKE_PAGES="/home /build /decisions"   # UI-B2: /questionnaire is gone (QBDD22130); UI-B4b: the /thread page is retired (Q893B08A5), Build smokes instead

# live_versions — the live deployment as "<version-id> <percentage>" lines (read from wrangler's own --json,
# through the ONE wrangler-json parser, tools/lib_wrangler_json.py). Non-zero when it cannot be read.
live_versions() {
  npx wrangler deployments status --json --config "$CFG" </dev/null 2>/dev/null | python3 -c '
import sys
sys.path.insert(0, "tools")
from lib_wrangler_json import parse_wrangler_json
try:
    d = parse_wrangler_json(sys.stdin.read())
    vs = d.get("versions") if isinstance(d, dict) else None
    if not vs: sys.exit(1)
    for v in vs:
        p = float(v["percentage"])
        print(v["version_id"], int(p) if p == int(p) else p)
except SystemExit: raise
except Exception: sys.exit(1)'
}

# health_version <base-url> <header> — ONE /health read under <header>; prints "<http-code> <versionId>" (the id is
# empty unless the code is 200 and the body carries a well-formed versionId — src/index.js reads it off the
# CF_VERSION_METADATA binding). The body is parsed here and never printed.
health_version() {
  curl -s -m 15 -w '\n%{http_code}' -H "$2" "$1/health" 2>/dev/null | python3 -c '
import json, re, sys
raw = sys.stdin.read().rsplit("\n", 1)
code = raw[-1].strip() if raw and re.fullmatch(r"[0-9]{3}", raw[-1].strip()) else "000"
vid = ""
if code == "200" and len(raw) == 2:
    try:
        v = json.loads(raw[0]).get("versionId")
        if isinstance(v, str) and re.fullmatch(r"[0-9a-f-]{8,64}", v): vid = v
    except Exception: pass
print(code, vid)'
}

# health_tag <base-url> <header> — ONE /health read under <header>; prints "<http-code> <versionTag>" (the tag is
# empty unless the code is 200 and the body carries a well-formed versionTag). A separate helper, so health_version's
# two-field "<code> <versionId>" shape — parsed by every smoke — never changes.
health_tag() {
  curl -s -m 15 -w '\n%{http_code}' -H "$2" "$1/health" 2>/dev/null | python3 -c '
import json, re, sys
raw = sys.stdin.read().rsplit("\n", 1)
code = raw[-1].strip() if raw and re.fullmatch(r"[0-9]{3}", raw[-1].strip()) else "000"
tag = ""
if code == "200" and len(raw) == 2:
    try:
        v = json.loads(raw[0]).get("versionTag")
        if isinstance(v, str) and re.fullmatch(r"[A-Za-z0-9._-]{1,64}", v): tag = v
    except Exception: pass
print(code, tag)'
}

# version_tag <version-id> — the tag Cloudflare RECORDED for <version-id>: `wrangler versions view --json`
# annotations["workers/tag"], through the ONE wrangler-json parser (banner bytes tolerated). Prints it; non-zero when
# the record is unreadable (wrangler error, no JSON, not an object, no annotations/workers/tag, not a non-empty string).
version_tag() {
  npx wrangler versions view "$1" --json --config "$CFG" </dev/null 2>/dev/null | python3 -c '
import sys
sys.path.insert(0, "tools")
from lib_wrangler_json import parse_wrangler_json
try:
    d = parse_wrangler_json(sys.stdin.read())
    a = d.get("annotations") if isinstance(d, dict) else None
    t = a.get("workers/tag") if isinstance(a, dict) else None
    if not isinstance(t, str) or not t: sys.exit(1)
    print(t)
except SystemExit: raise
except Exception: sys.exit(1)'
}

# ship_tag — the tag this upload carries: `git rev-parse --short=9 HEAD`, plus `-dirty` when the engine tree (cwd) has
# uncommitted changes; `unknown` when git cannot name a commit (not a checkout). Always [0-9a-f]{7,40}(-dirty)? or
# the literal `unknown` — a valid wrangler tag.
ship_tag() {
  _st=$(git rev-parse --short=9 HEAD 2>/dev/null)
  printf '%s' "$_st" | grep -Eq '^[0-9a-f]{7,40}$' || { echo unknown; return 0; }
  if [ -n "$(git status --porcelain -- . 2>/dev/null)" ]; then echo "$_st-dirty"; else echo "$_st"; fi
}

# smoke <base-url> <label> <expect-version> [<extra header>] [strict|pinned] [<reads>] — proves WHICH version
# answered, then the pages. /health is polled for a 200 (10 × 3 s) and every read records its versionId; a versionId
# that is not <expect-version> is re-read (<reads> reads in all, default 5, 3 s apart: SHIP_READS_PREVIEW=5 ·
# SHIP_READS_CANARY=5 · SHIP_READS_PROD=30 — Cloudflare: a deployment change "can take up to a couple of seconds to
# be available globally", and at 100% it was measured taking longer than ~12 s; an override naming a version the
# edge does not see yet is silently routed by the percentages). A window longer than 5 reads prints a
# `· waiting for …` progress line every 5 reads. Still not <expect-version> after that:
#   strict  (preview · production 100%)  ✗ + return 1 — the caller's existing handling (not promoted · undo)
#   pinned  (the canary)                  `! canary pin not honoured …` + return 2 — the pinned pages are NOT smoked
#                                          (they would test the OLD version): a SKIP, never a pass, never a failure
# Then the authenticated pages on the minted seat ($K), under the same header. A page that got NO HTTP answer (`000`,
# a timeout/drop) is retried ONCE; any real non-200 fails at once. Returns 1 on any page failure.
smoke() {
  _base="$1"; _label="$2"; _want="$3"; _hdr="${4:-X-Ship-Smoke: $2}"; _mode="${5:-strict}"; _reads="${6:-5}"
  echo "· smoke $_label ($_base)"
  [ -n "$_want" ] || { echo "  ✗ $_label: no expected version to prove"; return 1; }
  _i=0; _ok=""; _c=""; _vid=""
  while [ $_i -lt 10 ]; do
    _hv=$(health_version "$_base" "$_hdr"); _c="${_hv%% *}"; _vid="${_hv#* }"; [ "$_c" = 200 ] && _ok=1 && break
    _i=$((_i+1)); sleep 3
  done
  [ -n "$_ok" ] || { echo "  ✗ $_label: /health not 200 after 10 tries (last $_c)"; return 1; }
  _n=1
  while [ "$_vid" != "$_want" ] && [ $_n -lt "$_reads" ]; do
    sleep 3; _hv=$(health_version "$_base" "$_hdr"); _vid="${_hv#* }"; _n=$((_n+1))
    if [ "$_reads" -gt 5 ] && [ $((_n % 5)) -eq 0 ] && [ "$_vid" != "$_want" ]; then
      echo "  · waiting for $_want at the edge (read $_n/$_reads, answered by ${_vid:-no versionId})"
    fi
  done
  if [ "$_vid" != "$_want" ]; then
    if [ "$_mode" = pinned ]; then
      echo "  ! canary pin not honoured on $_base (answered by ${_vid:-no versionId}) — pinned page smoke SKIPPED (it would test the old version); the 100% smoke still proves $_want"
      return 2
    fi
    echo "  ✗ $_label: /health answered by ${_vid:-no versionId}, not $_want (after $_n reads)"; return 1
  fi
  _bad=0
  for _p in $SMOKE_PAGES; do
    _c=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -H "$_hdr" -H "Authorization: Bearer $K" "$_base$_p")
    [ "$_c" = 000 ] && _c=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -H "$_hdr" -H "Authorization: Bearer $K" "$_base$_p")   # ONE retry, only on no answer
    [ "$_c" = 200 ] || { echo "  ✗ $_label: $_p → $_c"; _bad=1; }
  done
  [ $_bad -eq 0 ] || return 1
  echo "  ✓ $_label: /health answered by $_want · $SMOKE_PAGES 200 (minted dev-org seat)"
}

# org_required_triggers — migrate-068's *_org_required triggers live's schema holds, one name a line (none: empty). Non-zero
# when the schema cannot be read. A read: one SELECT through `wrangler d1 execute --remote --json --command`.
org_required_triggers() {
  npx wrangler d1 execute "$DB" --remote --json --command "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%_org_required' ORDER BY name" \
    --config "$CFG" </dev/null 2>/dev/null | python3 -c '
import re, sys
sys.path.insert(0, "tools")
from lib_wrangler_json import parse_wrangler_json
try:
    d = parse_wrangler_json(sys.stdin.read())
    rows = (d[0] if isinstance(d, list) else d)["results"]
    for r in rows:
        n = r.get("name") if isinstance(r, dict) else None
        if isinstance(n, str) and re.fullmatch(r"[a-z_]+_org_required", n): print(n)
except Exception: sys.exit(1)'
}

# live_level <file> — live's MIGRATION LEVEL (2b, the sprint-7 review D5): one read of its schema into <file> (the read
# tools/ship-plan.sh makes), placed by tools/ship-plan-migrations.py; prints the three digits (e.g. 073). Non-zero when it
# cannot be read.
live_level() {
  npx wrangler d1 execute "$DB" --remote --json --command "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql NOT NULL" \
    --config "$CFG" </dev/null > "$1" 2>/dev/null || return 1
  python3 tools/ship-plan-migrations.py . --schema-json "$1" --json 2>/dev/null | python3 -c '
import json, sys
try: a = json.load(sys.stdin)["at"]
except Exception: sys.exit(1)
if not isinstance(a, int): sys.exit(1)
print("%03d" % a)'
}

# live_slugs — the path names live's orgs hold (migrate-072's org.slug), comma-separated (none: empty). Non-zero when they
# cannot be read (a database before migrate-072 has no slug: this code needs it BEFORE it ships).
live_slugs() {
  npx wrangler d1 execute "$DB" --remote --json --command "SELECT slug FROM org WHERE slug IS NOT NULL ORDER BY id" \
    --config "$CFG" </dev/null 2>/dev/null | python3 -c '
import sys
sys.path.insert(0, "tools")
from lib_wrangler_json import parse_wrangler_json
try:
    d = parse_wrangler_json(sys.stdin.read())
    rows = (d[0] if isinstance(d, list) else d)["results"]
    print(",".join(r["slug"] for r in rows if isinstance(r, dict) and isinstance(r.get("slug"), str)))
except Exception: sys.exit(1)'
}

# xorg_left <run dir> — the cross-org suite's record (<run dir>/orgs.json): each throwaway org it lists that is not deleted, or
# whose platform accounts are left (the sprint-7 review D6: the suite removes its owners' and members' accounts after the org), as
# `org <id> "<name>" (<state>)` lines (never a key: the record holds none). Non-zero when there is no readable record.
xorg_left() {
  python3 - "$1/orgs.json" <<'PY' 2>/dev/null
import json, sys
rec = json.load(open(sys.argv[1]))
for o in rec.get("orgs") or []:
    if o.get("state") != "deleted": print(f'org {o.get("org")} "{o.get("name")}" ({o.get("state")})')
    elif o.get("accounts") == "left": print(f'org {o.get("org")} "{o.get("name")}" (deleted; its accounts left)')
PY
}

# stale_level <step> <label> — says so when <step> was recorded green for this version at ANOTHER live level (or before the level
# was kept): the reason it runs again (D5)
stale_level() {
  if runrec get "$1" "" "version=$ver" >/dev/null 2>&1; then
    _sl=$(runrec get "$1" level "version=$ver" 2>/dev/null | cut -d' ' -f2)
    echo "  · $2 was green for $ver on live at ${_sl:+migrate-}${_sl:-an unrecorded level}; live is now at migrate-$LEVEL — it runs again"
  fi
}

# runrec <verb> … — the run record ($REC, a JSON object; never a key or a secret in it). Every write is a temp file renamed
# into place. Verbs:
#   open <org> <key> <commit> <resumable 0|1> <why>   create it (or add this run, its commit, to it); prints "<n> <step,…>" of
#                                               what it holds; exit 3 when $REC is another key's or org's (the caller sets it aside)
#   add <step> <k=v>…                           append {step, at, proof: {k: v}}
#   get <step> <f,f|""> [<k=v>…]                the LATEST milestone of <step> whose proof holds every k=v: prints
#                                               "<at> <f…>"; exit 1 when none, or when the record is not resumable
runrec() {
  [ -n "$REC" ] || return 1
  python3 - "$REC" "$@" <<'PY'
import json, os, sys, time
path, cmd, args = sys.argv[1], sys.argv[2], sys.argv[3:]
now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
def load():
    try:
        with open(path) as f: r = json.load(f)
    except FileNotFoundError: return None
    if not isinstance(r, dict): raise ValueError("not a record")
    return r
def save(r):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "w") as f: json.dump(r, f, indent=1); f.write("\n")
    os.replace(tmp, path)
kv = lambda xs: dict(x.split("=", 1) for x in xs)
if cmd == "open":
    org, key, commit, resumable, why = args
    try: r = load()
    except Exception: sys.exit(3)
    if r is not None and (r.get("key") != key or r.get("org") != org or not r.get("resumable")): sys.exit(3)
    if r is None: r = {"org": org, "key": key, "commit": commit, "resumable": resumable == "1", "created": now, "runs": [], "milestones": []}
    r.setdefault("runs", []).append({"at": now, "pid": os.getppid(), "commit": commit, "why": why})
    save(r)
    steps = []
    for m in r.get("milestones") or []:
        if m.get("step") not in steps: steps.append(m.get("step"))
    print(len(r.get("milestones") or []), ",".join(steps))
elif cmd == "add":
    r = load()
    if r is None: sys.exit(1)
    r.setdefault("milestones", []).append({"step": args[0], "at": now, "proof": kv(args[1:])})
    save(r)
elif cmd == "get":
    r = load() or {}
    if not r.get("resumable"): sys.exit(1)
    want, fields = kv(args[2:]), [f for f in args[1].split(",") if f]
    for m in reversed(r.get("milestones") or []):
        p = m.get("proof") or {}
        if m.get("step") != args[0] or any(p.get(k) != v for k, v in want.items()): continue
        vals = [str(p.get(f) or "") for f in fields]
        if all(vals) and not any(" " in v for v in vals):
            print(" ".join([str(m.get("at") or "?")] + vals)); sys.exit(0)
    sys.exit(1)
else: sys.exit(2)
PY
}

# ship_key — THE KEY of the run record: what ships, never the whole commit (the restart drill updates docs/plan/HANDOFF.md at
# every stop, mid-ship; that edit, committed or not, must not cost the resume). The committed trees of engine/ (this tree,
# `git rev-parse HEAD:<prefix>`) and of the repo's contracts/ (`none` where the checkout has none), hashed together
# (`git hash-object --stdin`). Prints "<key> <commit>", or "unknown unknown" outside git; non-zero when engine/ or contracts/
# differ from HEAD (`git status --porcelain -- <engine> contracts`, untracked included; engine/.runs/ is gitignored).
ship_key() {
  _kc=$(git rev-parse HEAD 2>/dev/null); printf '%s' "$_kc" | grep -Eq '^[0-9a-f]{40}([0-9a-f]{24})?$' || { echo "unknown unknown"; return 0; }
  _ktop=$(git rev-parse --show-toplevel 2>/dev/null) && _kpfx=$(git rev-parse --show-prefix 2>/dev/null) || { echo "unknown unknown"; return 0; }
  _kpfx="${_kpfx%/}"
  _ke=$(git -C "$_ktop" rev-parse "HEAD:$_kpfx" 2>/dev/null) || { echo "unknown unknown"; return 0; }
  _kk=$(git -C "$_ktop" ls-tree -d HEAD contracts 2>/dev/null | awk '{print $3}'); [ -n "$_kk" ] || _kk=none
  _key=$(printf 'engine %s\ncontracts %s\n' "$_ke" "$_kk" | git hash-object --stdin 2>/dev/null) || { echo "unknown unknown"; return 0; }
  echo "$_key $_kc"
  _kst=$(git -C "$_ktop" status --porcelain -- "${_kpfx:-.}" contracts 2>/dev/null) && [ -z "$_kst" ]
}

# runrec_open <org> — opens this run's record (sets REC, KEY, SHA): keyed by what ships (ship_key) when engine/ and contracts/
# are clean, a new file per run otherwise (dirty · not a checkout), the key's record set aside on --fresh. Prints the record's
# line; non-zero when the record cannot be written.
runrec_open() {
  _rdir=".runs/ship/$1"; _rts=$(date -u +%Y%m%dT%H%M%SZ); _res=1
  _rk=$(ship_key); _rkrc=$?; KEY="${_rk%% *}"; SHA="${_rk#* }"
  if [ "$KEY" = unknown ]; then
    REC="$_rdir/unknown-$_rts-$$.json"; _res=0; _rwhy="fresh: not a git checkout (nothing to key it) — nothing is reused"
  elif [ $_rkrc -ne 0 ]; then
    REC="$_rdir/$KEY-dirty-$_rts-$$.json"; _res=0; _rwhy="fresh: engine/ or contracts/ has uncommitted changes — nothing is reused"
  else
    REC="$_rdir/$KEY.json"; _rwhy="resumable: engine/ + contracts/ as committed (key $KEY), commit $SHA"
    if [ -n "$fresh" ] && [ -f "$REC" ]; then
      mv "$REC" "$_rdir/$KEY.before-fresh-$_rts.json" || return 1; _rwhy="fresh (--fresh): the key's record set aside as $_rdir/$KEY.before-fresh-$_rts.json — nothing is reused"
    fi
  fi
  mkdir -p "$_rdir" || return 1
  _ro=$(runrec open "$1" "$KEY" "$SHA" "$_res" "$_rwhy"); _rorc=$?
  if [ $_rorc -eq 3 ]; then   # not this key's (or unreadable): set aside, never reused
    mv "$REC" "$_rdir/$KEY.unreadable-$_rts.json" || return 1
    _rwhy="$_rwhy (an unreadable record was set aside)"; _ro=$(runrec open "$1" "$KEY" "$SHA" "$_res" "$_rwhy") || return 1
  elif [ $_rorc -ne 0 ]; then return 1; fi
  if [ "${_ro%% *}" != 0 ]; then echo "· run record $REC — $_rwhy; it holds ${_ro%% *} milestone(s) (${_ro#* }): each is reused only while its key holds"
  else echo "· run record $REC — $_rwhy"; fi
}

# mark <step> <k=v>… — a milestone into the run record, right after its step and BEFORE the next acts; a failed write is said
# (a rerun then re-pays that step: a cost, never a skipped proof)
mark() { [ -z "$REC" ] || runrec add "$@" || echo "  ! the run record could not be written ($REC) — a rerun will not reuse '$1'"; }

# is_version <id> — a well-formed version id (a record is a local file: what it holds is checked before use)
is_version() { printf '%s' "$1" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; }

# undo <version-id> <reason> — `wrangler rollback` to <version-id> at 100%, then READ BACK: done only when the live
# deployment is exactly that one version at 100%.
undo() {
  _to="$1"; _why="$2"
  echo "· rollback → $_to ($_why)"
  _msg=$(printf 'ship.sh rollback: %s' "$_why" | cut -c1-120)
  if [ -n "$_to" ]; then _rb=$(npx wrangler rollback "$_to" -y -m "$_msg" --config "$CFG" </dev/null 2>&1)
  else _rb=$(npx wrangler rollback -y -m "$_msg" --config "$CFG" </dev/null 2>&1); fi
  _rbrc=$?
  _now=$(live_versions) || _now="(unreadable)"
  if [ -n "$_to" ]; then
    [ "$_now" = "$_to 100" ] && { echo "  ✓ rolled back — live is $_to at 100% (read back from deployments status)"; return 0; }
  else
    [ $_rbrc -eq 0 ] && [ "$(printf '%s\n' "$_now" | grep -c .)" = 1 ] && [ "${_now##* }" = 100 ] \
      && { echo "  ✓ rolled back — live is ${_now%% *} at 100% (read back from deployments status)"; return 0; }
  fi
  echo "  ✗ ROLLBACK DID NOT VERIFY (wrangler rc $_rbrc) — live is [$(printf '%s' "$_now" | tr '\n' ' ')]: $(printf '%s' "$_rb" | tail -2 | tr '\n' ' ')"
  echo "    act by hand: sh tools/ship.sh rollback ${_to:-<version-id>}"
  return 1
}

# ── the explicit undo verb — NEVER budget-guarded (see the header: a rollback must never wait on a budget) ────
if [ "$1" = rollback ]; then
  shift; to=""; org_ok=""
  for a in "$@"; do
    case "$a" in
      ryuklabs) ;;
      --org-required-ok) org_ok=1 ;;
      siru|veil|bunny|frame) echo "  ✗ $a is RETIRED (QC74D4892, one-org-worker) — there is nothing to roll back"; exit 1;;
      *) if printf '%s' "$a" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then to="$a"
         else echo "  ✗ rollback: '$a' is neither a target nor a version id"; exit 1; fi;;
    esac
  done
  echo "· live before rollback: $(live_versions | tr '\n' ' ')"
  # finding 1: after migrate-068 a rollback to code from before sprint 6 is a write outage — read the schema first
  echo "· live's schema: migrate-068's *_org_required triggers (one read)"
  if _trg=$(org_required_triggers); then _ntrg=$(printf '%s\n' "$_trg" | grep -c .); else _ntrg=unreadable; fi
  if [ "$_ntrg" = 0 ]; then echo "  ✓ none: the target writes as it did"
  elif [ -n "$org_ok" ]; then
    echo "  ! live holds $_ntrg *_org_required trigger(s) — proceeding on --org-required-ok (the target must be sprint-6 code or later: it stamps every org)"
  else
    if [ "$_ntrg" = unreadable ]; then echo "  ✗ live's schema could not be read — migrate-068's *_org_required triggers may stand"
    else echo "  ✗ live holds migrate-068's $_ntrg *_org_required trigger(s): $(printf '%s' "$_trg" | tr '\n' ' ')"; fi
    echo "    code from before sprint 6 names no org on any row it writes: under these triggers its every sign-in, sign-in attempt,"
    echo "    filing and event is REFUSED (org_required) — this rollback would be a write outage. The undo, in its order:"
    echo "      1. sh tools/migrate.sh tools/ship/org-required-down.sql   (drops the nine triggers; a Time Travel bookmark first)"
    echo "      2. sh tools/ship.sh rollback ${to:-<version-id>}"
    echo "    (the target is sprint-6 code or later, which stamps every org: sh tools/ship.sh rollback ${to:-<version-id>} --org-required-ok)"
    echo "✗ ROLLBACK REFUSED — nothing rolled back"; exit 1
  fi
  undo "$to" "explicit rollback verb" && { echo "✓ ROLLED BACK — code only; D1 is untouched (a schema undo is a Time Travel restore, tools/migrate.sh printed it)"; exit 0; }
  echo "✗ ROLLBACK INCOMPLETE — read the ✗ lines"; exit 1
fi

fresh=""; targets=""
for a in "$@"; do case "$a" in --fresh) fresh=1;; *) targets="${targets:+$targets }$a";; esac; done
targets="${targets:-ryuklabs}"
# the run record (7.0b): opened BEFORE the gate — a run that cannot write its trail does not start
REC=""; KEY=unknown; SHA=unknown; reused=""; LEVEL=""
case " $targets " in *" ryuklabs "*)
  runrec_open ryuklabs || { echo "  ✗ could not write the run record ($REC) — not shipping (no gate run, no Cloudflare call)"; exit 1; };;
esac
# a run killed mid-walk leaves the walk's key file in its run dir (mode 600): a stray secret, removed before anything else runs
for _lk in .runs/ship-xorg/*/walk-key.env; do
  if [ -f "$_lk" ]; then rm -f "$_lk" && echo "· a stopped run's walk key file removed: $_lk"; fi
done
if _rg=$(runrec get gate commit "key=$KEY"); then
  _rgc="${_rg#* }"
  echo "· gate ✓ (reused: green at ${_rg%% *} for $_rgc)$([ "$_rgc" = "$SHA" ] || echo " — HEAD is now $SHA: engine/ and contracts/ unchanged since")"; reused="gate"
  # the docs may have moved under a reused gate (the key covers engine/ and contracts/ only): the gate's docs step runs again
  python3 tools/check-docs.py >/dev/null 2>&1 || { echo "  ✗ the docs gate is red since the reused gate (run: python3 tools/check-docs.py) — not shipping"; exit 1; }
  echo "  ✓ the docs gate re-run: green"
else
  echo "· gate"; sh gate.sh >/dev/null 2>&1 || { echo "  ✗ gate red — not shipping (run: sh gate.sh)"; exit 1; }; echo "  ✓ gate green by exit code"
  mark gate "key=$KEY" "commit=$SHA"
fi
rc=0
for t in $targets; do
  case "$t" in
    ryuklabs) ;;
    siru|veil|bunny|frame) echo "  ✗ $t is RETIRED (QC74D4892, one-org-worker) — its wrangler config is deleted; there is nothing left to deploy"; rc=1; continue;;
    *) echo "  ✗ unknown target $t"; rc=1; continue;;
  esac

  echo "· budget (tools/cf-budget.sh — today's free-tier usage; refuses at 95% of any limit or when unreadable)"
  sh tools/cf-budget.sh || { echo "  ✗ budget guard refused — not shipping (no wrangler call made; prod untouched)"; rc=2; continue; }

  echo "· live version ($WORKER)"
  # 7.0b: live is read on EVERY run, never taken from the run record (the rollback target and the after-promotion check stand on it)
  lv=$(live_versions) || { echo "  ✗ could not read the live deployment (wrangler deployments status) — no rollback target, not shipping"; rc=1; continue; }
  # the latest upload recorded for what ships (this key), "<at> <version> <preview> <tag>" (checked before any use: the record
  # is a local file); its tag is the commit it was uploaded from, which a docs-only commit since may have moved past
  tag=$(ship_tag)
  _ru=$(runrec get upload version,preview,tag "key=$KEY") || _ru=""
  _rv=$(printf '%s' "$_ru" | cut -d' ' -f2); is_version "$_rv" || _rv=""
  if [ "$(printf '%s\n' "$lv" | grep -c .)" != 1 ] || [ "${lv##* }" != 100 ]; then
    echo "  ✗ a split deployment is live [$(printf '%s' "$lv" | tr '\n' ' ')] — finish it or undo it first (sh tools/ship.sh rollback <version-id>)"
    if [ -n "$_rv" ] && printf '%s\n' "$lv" | grep -q "^$_rv " && _rp10=$(runrec get 10% pre "version=$_rv"); then
      echo "    the run record names it: this commit's $_rv in its canary over ${_rp10#* } (a run stopped after 10%) — undo: sh tools/ship.sh rollback ${_rp10#* }, then rerun (the steps before 10% are reused; promotion never is)"
    fi
    rc=1; continue
  fi
  pre="${lv%% *}"; done100=""; canary=""; proofs=""
  mark live "version=$pre"
  if [ -n "$_rv" ] && [ "$pre" = "$_rv" ]; then
    # a run stopped AFTER promotion: live already serves this commit's recorded upload at 100% — it is never promoted again
    done100=1; ver="$_rv"; purl=$(printf '%s' "$_ru" | cut -d' ' -f3)
    pre=$(runrec get 10% pre "version=$ver" | cut -d' ' -f2); is_version "$pre" || pre=""
    echo "  ✓ live already serves $ver at 100% — this commit's recorded upload (at ${_ru%% *}): a run stopped after promotion"
    echo "    NOT re-promoted: this run finishes the steps after it (the production smoke, then the triggers); the pre-ship version: ${pre:-not recorded}"
  else
    echo "  ✓ live: $pre at 100% (the rollback target)"
  fi

  if [ -z "$done100" ]; then   # ── from the upload to the 100% deploy: never repeated by a run that finds its version live at 100% ──
  # 2b (the sprint-7 review, D5 and D2+B3): live's migration level (it keys the preview's proofs) and its orgs' path names against
  # this code's reserved names — both read on every run, never reused; either unreadable, or a held name reserved: not shipping
  echo "· live's schema and its orgs' names (two reads: its migration level keys the preview's proofs; each org's path name against this code's reserved names)"
  _lvf=$(mktemp "${TMPDIR:-/tmp}/ship-level.XXXXXX") || _lvf=""
  LEVEL=$( [ -n "$_lvf" ] && live_level "$_lvf"); _lvrc=$?; rm -f "$_lvf"
  if [ $_lvrc -ne 0 ] || [ -z "$LEVEL" ]; then echo "  ✗ live's schema could not be read (d1 execute --remote SELECT … sqlite_master) — no level to key the preview's proofs, not shipping (nothing uploaded, prod untouched)"; rc=1; continue; fi
  echo "  ✓ live is at migrate-$LEVEL (read from its schema: tools/ship-plan-migrations.py)"
  if ! _slugs=$(live_slugs); then echo "  ✗ live's org names could not be read (SELECT slug FROM org: migrate-072 lands BEFORE this code) — not shipping (nothing uploaded, prod untouched)"; rc=1; continue; fi
  if _nout=$(node tools/check-org-names.mjs --slugs "$_slugs" 2>&1); then
    echo "  ✓ $(printf '%s\n' "$_nout" | tail -1 | sed 's/^✓ //') — live's: ${_slugs:-none}"
  else
    printf '%s\n' "$_nout" | sed 's/^/    | /' | tail -8
    echo "  ✗ an org on live holds a name this code reserves (or the check is red) — NOT shipping (nothing uploaded, prod untouched): rename that org first (the operator, with its owner), then ship"
    rc=1; continue
  fi
  echo "· upload a version ($CFG — takes no traffic)"
  ver=""; purl=""
  if [ -n "$_rv" ]; then
    # 7.0b: the recorded upload is reused ONLY while Cloudflare's version record still answers it with the tag it was uploaded
    # with (from then on $tag is that tag: the preview's tag proof checks it)
    _rp=$(printf '%s' "$_ru" | cut -d' ' -f3); _rtg=$(printf '%s' "$_ru" | cut -d' ' -f4)
    _rt=$(version_tag "$_rv") || { sleep 3; _rt=$(version_tag "$_rv"); } || _rt=""
    case "$_rp" in "https://$(printf '%.8s' "$_rv")-$WORKER."*) _rpok=1;; *) _rpok="";; esac
    if [ -n "$_rtg" ] && [ "$_rt" = "$_rtg" ] && [ -n "$_rpok" ]; then
      ver="$_rv"; purl="$_rp"; tag="$_rtg"; reused="${reused:+$reused, }upload"
      echo "  ✓ upload reused: $ver (tag $tag, uploaded at ${_ru%% *}; its version record still answers it) — preview $purl"
    else
      echo "  · the recorded upload $_rv (at ${_ru%% *}) no longer answers (its version record: ${_rt:-unreadable}) — uploading afresh: every later milestone is keyed to the new version"
    fi
  fi
  if [ -z "$ver" ]; then
  out=$(npx wrangler versions upload --config "$CFG" --tag "$tag" --message "ship.sh $(git rev-parse --short HEAD 2>/dev/null || echo unknown)" </dev/null 2>&1)
  ver=$(printf '%s\n' "$out" | tr -d '\r' | sed -n 's/^Worker Version ID: \([0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}\)$/\1/p' | head -1)
  purl=$(printf '%s\n' "$out" | tr -d '\r' | sed -n 's|^Version Preview URL: \(https://[a-z0-9.-]*\)$|\1|p' | head -1)
  [ -n "$ver" ] || { echo "  ✗ upload failed (no Worker Version ID): $(printf '%s' "$out" | tail -2 | tr '\n' ' ')"; rc=1; continue; }
  case "$purl" in
    "https://$(printf '%.8s' "$ver")-$WORKER."*) echo "  ✓ uploaded $ver (tag $tag) — preview $purl";;
    *) echo "  ✗ uploaded $ver but got no VERSION PREVIEW URL (previews disabled for $WORKER?) — refusing to smoke prod instead; nothing promoted"; rc=1; continue;;
  esac
  mark upload "version=$ver" "preview=$purl" "tag=$tag" "key=$KEY" "commit=$SHA"
  fi

  trap mint_cleanup EXIT INT TERM
  if mint_all; then key="$K"; prod="$U"; else echo "  ✗ could not mint a seat for the smoke — nothing promoted, prod still on $pre"; rc=1; continue; fi

  if _rs=$(runrec get preview_smoke "" "version=$ver" "level=$LEVEL"); then
    echo "· smoke version preview ✓ (reused: green at $_rs for $ver on live at migrate-$LEVEL — /health, $SMOKE_PAGES and tag $tag proven then)"; reused="${reused:+$reused, }preview smoke"
  else
  stale_level preview_smoke "the preview smoke"
  if ! smoke "$purl" "version preview" "$ver" "" strict "$SHIP_READS_PREVIEW"; then
    echo "  ✗ the version failed its own preview smoke — NOT promoted; no traffic moved, prod still on $pre (nothing to roll back)"
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  # U-READY-e2: the uploaded tag is proven from Cloudflare's VERSION RECORD (strict — unequal or unreadable is the
  # not-promoted path above: no traffic moved, nothing to undo)
  _rtag=$(version_tag "$ver") || _rtag=""
  if [ "$_rtag" != "$tag" ]; then
    echo "  ✗ version preview: version record tag ${_rtag:-unreadable}, not $tag"
    echo "  ✗ the version failed its own preview smoke — NOT promoted; no traffic moved, prod still on $pre (nothing to roll back)"
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  # … and the preview's /health versionTag, BEST-EFFORT (CF_VERSION_METADATA.tag is not exposed on this account):
  # absent is fine; present and not the tag is ✗, not promoted (up to 3 reads for a 200)
  _ti=0; _pt=""
  while [ $_ti -lt 3 ]; do
    _pt=$(health_tag "$purl" "X-Ship-Smoke: version preview"); [ "${_pt%% *}" = 200 ] && break
    _ti=$((_ti+1)); sleep 3
  done
  _ptag="${_pt#* }"; [ "${_pt%% *}" = 200 ] || _ptag=""
  if [ -n "$_ptag" ] && [ "$_ptag" != "$tag" ]; then
    echo "  ✗ version preview: /health versionTag $_ptag, not $tag"
    echo "  ✗ the version failed its own preview smoke — NOT promoted; no traffic moved, prod still on $pre (nothing to roll back)"
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  echo "  ✓ version preview: tag $tag (version record)${_ptag:+ · /health versionTag agrees}"
  mark preview_smoke "version=$ver" "tag=$tag" "level=$LEVEL"
  fi

  # THE CROSS-ORG SUITE ON THE PREVIEW (sprint 6; PLATFORM §5: the canary reaches every org, so the wall is proven before any
  # traffic moves, and before the preview hook writes anything through the new code). tools/attack-xorg.mjs restores two
  # THROWAWAY orgs into the live database (tools/org-undo.mjs: never org 1, each refused if its id would be 1), walks every
  # tool, resource and route as each against the other, and deletes both — in a finally, and on a signal. A failure (a finding,
  # a 5xx, a throwaway left behind, a refusal): NOT promoted, no traffic moved, prod still on $pre (nothing to roll back); the
  # run's record names any org left and the command that removes it.
  _xdir=".runs/ship-xorg/$ver"
  _xcreds="${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}"; [ -f "$_xcreds" ] || _xcreds=""
  # 7.0b: A PRIOR RUN'S STRANDED THROWAWAYS go first (every run that reaches here, the suite reused or not): each run dir whose
  # orgs.json lists an org not deleted is removed with the command a failed suite prints, then read again. A cleanup that
  # fails, a record that cannot be read, or one naming org 1 (a ship never cleans org 1; attack-xorg refuses it too): NOT
  # promoted. (The suite rewrites its own run dir's record: a stranded one there would be lost if the suite ran first.)
  echo "· stranded throwaways (each .runs/ship-xorg/*/orgs.json: an org not deleted is removed before the suite; never org 1)"
  _cfail=""; _cn=0
  for _cd in .runs/ship-xorg/*; do
    [ -f "$_cd/orgs.json" ] || continue
    if ! _cl=$(xorg_left "$_cd"); then echo "  ✗ $_cd/orgs.json cannot be read — a throwaway org it names may stand; read it by hand"; _cfail=1; continue; fi
    [ -n "$_cl" ] || continue
    _cn=$((_cn+1)); printf '%s\n' "$_cl" | sed "s|^|  · $_cd left: |"
    if printf '%s\n' "$_cl" | grep -q '^org 1 '; then echo "  ✗ $_cd/orgs.json names org 1 — a ship never cleans org 1; read the record by hand"; _cfail=1; continue; fi
    echo "    cleaning: node tools/attack-xorg.mjs --cleanup $_cd --live --config $CFG --live-write-ok${_xcreds:+ --creds $_xcreds}"
    if node tools/attack-xorg.mjs --cleanup "$_cd" --live --config "$CFG" --live-write-ok ${_xcreds:+--creds "$_xcreds"} </dev/null >> "$_cd/cleanup.log" 2>&1 \
       && _cl=$(xorg_left "$_cd") && [ -z "$_cl" ]; then echo "  ✓ $_cd: every throwaway org it recorded is deleted"
    else sed 's/^/    | /' "$_cd/cleanup.log" | tail -8; echo "  ✗ the cleanup of $_cd did not finish (its log: $_cd/cleanup.log)"; _cfail=1; fi
  done
  if [ -n "$_cfail" ]; then
    echo "  ✗ a prior run's throwaway org may stand in the live database — NOT promoted; no traffic moved, prod still on $pre (nothing to roll back)"
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  [ "$_cn" -eq 0 ] && echo "  ✓ none: every recorded throwaway org is deleted"

  if _rx=$(runrec get cross_org run_dir "version=$ver" "level=$LEVEL"); then
    echo "· cross-org suite ✓ (reused: green at ${_rx%% *} on $ver, live at migrate-$LEVEL — the run: ${_rx#* })"; reused="${reused:+$reused, }cross-org suite"
  else
  stale_level cross_org "the cross-org suite"
  mkdir -p "$_xdir"
  # 10.5 (the sprint-10 review, L1): the run dir is the version's, reused by a rerun — an earlier run's kept 5xx answers go first,
  # so the failure lines below name fivexx.json only when THIS run kept one
  rm -f "$_xdir/fivexx.json"
  echo "· cross-org suite on the preview (tools/attack-xorg.mjs: two throwaway orgs, walked both ways, deleted; never org 1)"
  # finding 17: the suite in its OWN session (a terminal's hangup never reaches it), and every signal to ship.sh handed to it as
  # one SIGTERM (its handler stops the walk and deletes both orgs); ship.sh waits for it to finish either way
  _xsig=""
  python3 -c 'import os, sys
try: os.setsid()
except OSError: os.setpgid(0, 0)
os.execvp(sys.argv[1], sys.argv[1:])' node tools/attack-xorg.mjs --url "$purl" --live --config "$CFG" --live-write-ok ${_xcreds:+--creds "$_xcreds"} --run-dir "$_xdir" \
    </dev/null > "$_xdir/attack.log" 2>&1 &
  _xpid=$!
  trap '_xsig=HUP; kill -TERM "$_xpid" 2>/dev/null' HUP
  trap '_xsig=INT; kill -TERM "$_xpid" 2>/dev/null' INT
  trap '_xsig=TERM; kill -TERM "$_xpid" 2>/dev/null' TERM
  while :; do wait "$_xpid"; _xrc=$?; kill -0 "$_xpid" 2>/dev/null || break; done
  trap - HUP; trap mint_cleanup INT TERM
  if [ "$_xrc" -eq 0 ] && [ -z "$_xsig" ]; then
    _xsum=$(grep '^✓ attack-xorg' "$_xdir/attack.log" | tail -1 | sed 's/^✓ //'); echo "  ✓ $_xsum"
    mark cross_org "version=$ver" "run_dir=$_xdir" "level=$LEVEL" "summary=$_xsum"
  else
    sed 's/^/    | /' "$_xdir/attack.log" | tail -12
    [ -f "$_xdir/fivexx.json" ] && echo "  · each 5xx's answer, kept and redacted (attack-xorg, 10.5): $_xdir/fivexx.json"
    [ -n "$_xsig" ] && echo "  ✗ ship.sh took SIG$_xsig during the cross-org suite: the suite was stopped (one SIGTERM) and ran its own cleanup"
    # the record, never the log's tail: each throwaway org left, and the exact command that removes them
    _xcmd="node tools/attack-xorg.mjs --cleanup $_xdir --live --config $CFG --live-write-ok${_xcreds:+ --creds $_xcreds}"
    if _xleft=$(xorg_left "$_xdir"); then
      if [ -n "$_xleft" ]; then
        printf '%s\n' "$_xleft" | sed 's/^/  ✗ throwaway left in the live database: /'
        echo "    remove it (from engine/, the deployment's credentials sourced): $_xcmd"
      else echo "  · the record lists no throwaway org left ($_xdir/orgs.json); should a later look find one: $_xcmd"; fi
    else echo "  · no record at $_xdir/orgs.json (no throwaway org was written); should a later look find one: $_xcmd"; fi
    echo "  ✗ the cross-org suite failed on the preview — NOT promoted; no traffic moved, prod still on $pre (nothing to roll back; the run: $_xdir)"
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  fi

  # THE WALK ON THE PREVIEW (sprint 6; PLATFORM §5: "the preview runs the cross-org suite AND the walk before any traffic
  # moves"). tools/live-walk.mjs walks the member path (an admin and a new member, a throwaway eval-marked project it creates
  # and removes, also on a failure) as the seat minted above — the suites' own org's owner (tools/lib-mint-seat.sh), never
  # org 1 — against the version preview only: `--preview` makes the walk refuse any URL that is not a version preview before
  # anything runs (and $purl was proven THIS version's preview at the upload). The seat's key reaches the walk in a mode-600
  # file removed right after (never printed, never an argument). Its clean-up also removes the platform accounts its two people's
  # emails made (--operator-config, the deployment's credentials: tools/operator.mjs removeAccount — the sprint-7 review D6). A
  # failure: NOT promoted, no traffic moved, prod still on $pre (nothing to roll back).
  if _rw=$(runrec get walk "" "version=$ver" "level=$LEVEL"); then
    echo "· the walk ✓ (reused: green at $_rw on $ver, live at migrate-$LEVEL — its log: $_xdir/walk.log)"; reused="${reused:+$reused, }walk"
  else
  stale_level walk "the walk"
  mkdir -p "$_xdir"
  echo "· the walk on the preview (tools/live-walk.mjs: the member path on a throwaway project of the suites' org, removed after)"
  _wk="$_xdir/walk-key.env"; rm -f "$_wk"; (umask 077 && : > "$_wk") && chmod 600 "$_wk" && printf 'SHIP_AGENT_R_OWNER_KEY=%s\n' "$key" > "$_wk"
  if node tools/live-walk.mjs --url "$purl" --preview --creds "$_wk" --live --json "$_xdir/walk.json" --operator-config "$CFG" --confirm-live "$DB" > "$_xdir/walk.log" 2>&1; then
    rm -f "$_wk"
    echo "  ✓ $(grep 'live walk:' "$_xdir/walk.log" | tail -1 | sed 's/^✓ //')"
    mark walk "version=$ver" "level=$LEVEL"
  else
    rm -f "$_wk"
    sed 's/^/    | /' "$_xdir/walk.log" | tail -12
    echo "  ✗ the walk failed on the preview — NOT promoted; no traffic moved, prod still on $pre (nothing to roll back; its log: $_xdir/walk.log)"
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  fi

  # The preview hook (optional): SHIP_PREVIEW_HOOK is a command run ONCE here, after the preview smoke and BEFORE any
  # traffic moves, with SHIP_PREVIEW_URL set to the version's preview URL. The preview runs the new code over the live
  # D1, so this is where a data step the new code needs happens first (e.g. the import through the new MCP door:
  # tools/import-live.sh). A non-zero exit: NOT promoted, prod still on the old version. Whatever the hook wrote to D1
  # stays written — the hook owns its own undo (a D1 Time Travel bookmark before the ship is the net).
  if [ -n "${SHIP_PREVIEW_HOOK:-}" ]; then
    echo "· preview hook ($SHIP_PREVIEW_HOOK)"
    _rh=$(runrec get preview_hook "" "version=$ver") && echo "  · a hook already passed on $ver at $_rh (recorded) — it runs again: a hook is never reused (leave SHIP_PREVIEW_HOOK unset to leave it out)"
    if SHIP_PREVIEW_URL="$purl" sh -c "$SHIP_PREVIEW_HOOK"; then
      echo "  ✓ the preview hook passed"; mark preview_hook "version=$ver"
    else
      echo "  ✗ the preview hook failed — NOT promoted; no traffic moved, prod still on $pre (what the hook wrote to D1 stays: restore the bookmark if it must not)"
      rc=1; mint_cleanup; trap - EXIT INT TERM; continue
    fi
  fi

  echo "· promote 10% ($pre@90% $ver@10%)"
  # 7.0b: live re-read before any traffic moves — it must still be the pre-ship version alone at 100%
  _lnow=$(live_versions) || _lnow="(unreadable)"
  if [ "$_lnow" != "$pre 100" ]; then
    echo "  ✗ live moved since it was read: now [$(printf '%s' "$_lnow" | tr '\n' ' ' | sed 's/ $//')], not $pre alone at 100% — NOT promoted; this run moved no traffic (a rerun reads live again)"
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  if ! npx wrangler versions deploy "$pre@90%" "$ver@10%" -y --message "ship.sh canary $ver" --config "$CFG" </dev/null >/dev/null 2>&1; then
    echo "  ✗ promote to 10% failed"; undo "$pre" "promote 10% failed"; rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  echo "  ✓ $ver takes 10%"; mark 10% "version=$ver" "pre=$pre"

  smoke "$prod" "canary (production route, pinned to $ver)" "$ver" "Cloudflare-Workers-Version-Overrides: $WORKER=\"$ver\"" pinned "$SHIP_READS_CANARY"; _src=$?
  case $_src in
    0) canary="✓"; mark canary "version=$ver" "result=pinned";;
    2) canary="skipped (pin not honoured)"; mark canary "version=$ver" "result=skipped";;   # a SKIP, never a pass: the 100% smoke below is the proof of $ver
    *) undo "$pre" "canary smoke failed"; rc=1; mint_cleanup; trap - EXIT INT TERM; continue;;
  esac

  echo "· promote 100% ($ver@100%)"
  # 7.0b: live re-read before the rest of the traffic moves — it must still be THIS run's split; anything else was moved by
  # someone else: nothing promoted further and nothing rolled back automatically (look first)
  _lnow=$(live_versions) || _lnow="(unreadable)"
  if [ "$(printf '%s\n' "$_lnow" | sort)" != "$(printf '%s 90\n%s 10\n' "$pre" "$ver" | sort)" ]; then
    echo "  ✗ live is not this run's canary split ($pre 90% · $ver 10%): now [$(printf '%s' "$_lnow" | tr '\n' ' ' | sed 's/ $//')] — NOT promoted to 100%, NOT rolled back (live was moved outside this run: look first; this run's undo: sh tools/ship.sh rollback $pre)"
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  if ! npx wrangler versions deploy "$ver@100%" -y --message "ship.sh full $ver" --config "$CFG" </dev/null >/dev/null 2>&1; then
    echo "  ✗ promote to 100% failed"; undo "$pre" "promote 100% failed"; rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  echo "  ✓ $ver takes 100%"; mark 100% "version=$ver" "pre=$pre"
  fi   # ── the end of the steps a run that finds its version live at 100% never repeats ──

  if [ -n "$done100" ]; then
    trap mint_cleanup EXIT INT TERM
    if mint_all; then key="$K"; prod="$U"; else echo "  ✗ could not mint a seat for the smoke — $ver stays live at 100%, unproven by this run (rerun to finish)"; rc=1; continue; fi
  fi
  if ! smoke "$prod" "production (100%)" "$ver" "" strict "$SHIP_READS_PROD"; then
    if [ -n "$done100" ]; then
      # a resumed run never rolls back by itself: $ver has served live since the stopped run, and a migration may have
      # landed since (the rollback verb reads live's schema first)
      echo "  ✗ the production smoke failed on $ver, live at 100% since a stopped run — NOT rolled back automatically: undo with sh tools/ship.sh rollback ${pre:-<the pre-ship version>} (it reads live's schema first)"
    else undo "$pre" "production smoke failed"; fi
    rc=1; mint_cleanup; trap - EXIT INT TERM; continue
  fi
  mark production "version=$ver"
  mint_cleanup; trap - EXIT INT TERM

  echo "· triggers (crons — versions upload never applies them)"
  if npx wrangler triggers deploy --config "$CFG" </dev/null >/dev/null 2>&1; then echo "  ✓ triggers applied"; mark triggers "version=$ver"
  else echo "  ✗ triggers deploy failed — $ver IS live and smoked; the crons were not re-applied (run: npx wrangler triggers deploy)"; rc=1; fi
  if [ -n "$done100" ]; then
    # the steps before promotion, as the record holds them for $ver (this run did not repeat them)
    case "$(runrec get canary result "version=$ver" | cut -d' ' -f2)" in pinned) canary="✓";; skipped) canary="skipped (pin not honoured)";; *) canary="(not recorded)";; esac
    _pp=$(runrec get preview_smoke "" "version=$ver" >/dev/null && echo "✓" || echo "(not recorded)")
    _px=$(runrec get cross_org "" "version=$ver" >/dev/null && echo "✓" || echo "(not recorded)")
    _pw=$(runrec get walk "" "version=$ver" >/dev/null && echo "✓" || echo "(not recorded)")
    proofs="preview $_pp · cross-org $_px · walk $_pw · canary pinned $canary · production ✓ — resumed after promotion (recorded before it; not re-promoted)"
  else proofs="preview ✓ · cross-org ✓ · walk ✓ · canary pinned $canary · production ✓"; fi
  [ -n "$reused" ] && proofs="$proofs · reused from the run record: $reused"
  [ $rc -eq 0 ] && echo "  ✓ $t shipped: ${pre:-<the pre-ship version>} → $ver (undo: sh tools/ship.sh rollback ${pre:-<the pre-ship version>})"
done
[ $rc -eq 0 ] && echo "✓ SHIPPED — proofs: $proofs — now the slices, then the full suites at the wave's end" || echo "✗ SHIP INCOMPLETE — read the ✗ lines"
exit $rc
