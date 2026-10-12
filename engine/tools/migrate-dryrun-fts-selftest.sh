#!/bin/sh
# tools/migrate-dryrun-fts-selftest.sh — the LOCAL proof that tools/migrate-dryrun.sh's source step survives a virtual table
# (S4, 2026-10-02). D1's export refuses a database that holds one ("D1 Export error: cannot export databases with Virtual
# Tables (fts5)"), and migrate-056 puts an FTS5 table (k_find) in the org's database; the export Wrangler runs locally is the
# same dump with the same refusal (miniflare's d1 dumpSql), so the proof runs on it. No network, no Cloudflare account:
#   · a throwaway engine tree holds the script under test, tools/lib-migrate-chain.sh, the wrangler-json parser, every
#     migrate-*.sql of this repo AND a dummy LATER migration (migrate-999-s4-dummy.sql: a new column and an index);
#   · a stub `npx` FIRST on PATH runs this repo's own wrangler, turning every `--remote` into `--local --config <fixture>`
#     (so "the live database" is a local D1 built here) and dropping the Cloudflare credentials from its env;
#   · fixture A, "live after this ship": this repo's boot.sql (every migration, k_find included) and a few real rows (an
#     owner, a project, goals, a question, a contribution — the k_find triggers index them);
#   · fixture B, "live today": the boot.sql of the live tag (a20e27898, migrate-046: no virtual table) and the same rows.
# Cases: the script at git HEAD (the old source step) FAILS on fixture A at the export; the script in the tree passes on A
# with `--from 999` (THE NEXT SHIP: exported by name without k_find, its shadow tables and the triggers that write it;
# migrate-056 puts them back and refills the index; the dummy migration applies and replays; GREEN) and on B with
# `--from 047` (THIS SHIP: live's own migrate-046 schema; 047 → 056 + the dummy, GREEN).
# MDR_FTS_SELFTEST_SRC / MDR_FTS_SELFTEST_LIB point the "new" run at another copy (a mutant). Takes a few minutes (local
# wrangler calls); it runs under `sh tools/migrate-dryrun.sh --selftest`.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
W="$ENGINE/node_modules/.bin/wrangler"
[ -x "$W" ] || { echo "migrate-dryrun-fts-selftest: no local wrangler at $W (npm ci in engine/)"; exit 2; }
T="$(mktemp -d "${TMPDIR:-/tmp}/mdr-fts-selftest.XXXXXX")"; trap 'rm -rf "$T"' EXIT
export WRANGLER_SEND_METRICS=false
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

# ── the trees: new (this checkout's script) and old (git HEAD's), the same migrations + the dummy later one ─────────────
mk_tree() {   # <dir> <migrate-dryrun.sh> <lib-migrate-chain.sh>
  mkdir -p "$1/tools"
  cp "$2" "$1/tools/migrate-dryrun.sh"; cp "$3" "$1/tools/lib-migrate-chain.sh"
  cp "$ENGINE/tools/lib_wrangler_json.py" "$1/tools/"
  mkdir -p "$1/tools/fixtures"; cp "$ENGINE/tools/fixtures/two-orgs.mjs" "$1/tools/fixtures/"   # the dry run's second org (sprint 6, 6.6)
  cp "$ENGINE"/migrate-*.sql "$1/"
  cat > "$1/migrate-999-s4-dummy.sql" <<'SQL'
-- a dummy LATER migration (S4's proof): a new nullable column and an index, applied after every real one
ALTER TABLE k_goals ADD COLUMN s4_dummy TEXT;
CREATE INDEX IF NOT EXISTS idx_k_goals_s4_dummy ON k_goals(project, s4_dummy) WHERE s4_dummy IS NOT NULL;
SQL
}
mk_tree "$T/new" "${MDR_FTS_SELFTEST_SRC:-$ENGINE/tools/migrate-dryrun.sh}" "${MDR_FTS_SELFTEST_LIB:-$ENGINE/tools/lib-migrate-chain.sh}"
if git -C "$ENGINE" show HEAD:engine/tools/migrate-dryrun.sh > "$T/old-dryrun.sh" 2>/dev/null \
   && git -C "$ENGINE" show HEAD:engine/tools/lib-migrate-chain.sh > "$T/old-lib.sh" 2>/dev/null \
   && ! grep -q "BY NAME (S4" "$T/old-lib.sh"; then
  mk_tree "$T/old" "$T/old-dryrun.sh" "$T/old-lib.sh"
else echo "  · git HEAD already carries the by-name source step (or no git): the red case is skipped"; fi

# ── the fixtures: a local D1 standing in for live ─────────────────────────────────────────────────────────────────────
mk_fixture() {   # <dir> <boot.sql>
  mkdir -p "$1"
  printf '{ "name": "mdr-fts-fixture", "compatibility_date": "2026-08-01", "d1_databases": [ { "binding": "DB", "database_name": "fx-agent-r", "database_id": "00000000-0000-0000-0000-000000000000" } ] }\n' > "$1/wrangler.jsonc"
  (cd "$1" && "$W" d1 execute fx-agent-r --local --config wrangler.jsonc --file "$2" --json </dev/null >"$1/boot.log" 2>&1) || { echo "  ✗ $2 did not load into $1"; tail -5 "$1/boot.log"; return 1; }
  cat > "$1/seed.sql" <<'SQL'
INSERT OR IGNORE INTO people (id, name, email, role, key_hash, active, created_at) VALUES ('P-S4OWNER', 'S4 Owner', 'owner@s4.local', 'owner', 'kh-s4-owner', 1, '2026-10-02T00:00:00Z');
INSERT OR IGNORE INTO projects (key, name, active, created_at) VALUES ('alpha', 'Alpha', 1, '2026-10-02T00:00:00Z');
INSERT OR IGNORE INTO project_seats (person_id, project_key, role, created_at) VALUES ('P-S4OWNER', 'alpha', 'owner', '2026-10-02T00:00:00Z');
INSERT INTO k_goals (project, id, parent, title, note, created_by, created_at, updated_by, updated_at) VALUES ('alpha', 'g-root', NULL, 'Ship the searchable atlas', 'root goal', 'P-S4OWNER', '2026-10-02T00:00:00Z', 'P-S4OWNER', '2026-10-02T00:00:00Z');
INSERT INTO k_goals (project, id, parent, title, note, created_by, created_at, updated_by, updated_at) VALUES ('alpha', 'g-leaf', 'g-root', 'Index every question', 'a leaf', 'P-S4OWNER', '2026-10-02T00:00:00Z', 'P-S4OWNER', '2026-10-02T00:00:00Z');
INSERT INTO k_questions (project, qid, question, why, status, created_by, created_at, updated_by, updated_at) VALUES ('alpha', 'Q-S4-1', 'Should search cover contributions?', 'the palette finds them', 'open', 'P-S4OWNER', '2026-10-02T00:00:00Z', 'P-S4OWNER', '2026-10-02T00:00:00Z');
INSERT INTO transmission (id, submitter, lane, kind, what, why, route, status, eval, created_at, project) VALUES ('T-20261002-001', 'P-S4OWNER', 'code', 'change', 'Full-text search over knowledge', 'findable', 'auto', 'filed', 0, '2026-10-02T00:00:00Z', 'alpha');
SQL
  # sprint 6 (migrate-068): on a schema that refuses a row without its org, the seed's person and filing carry org 1
  if grep -q "_org_required" "$2"; then
    python3 - "$1/seed.sql" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"(INSERT (?:OR IGNORE )?INTO (?:people|transmission) \(.*?)\) VALUES \((.*)\);", r"\1, org) VALUES (\2, 1);", s)
open(p, "w").write(s)
PY
  fi
  (cd "$1" && "$W" d1 execute fx-agent-r --local --config wrangler.jsonc --file seed.sql --json </dev/null >"$1/seed.log" 2>&1) \
    && grep -q '"success": *true' "$1/seed.log" && ! grep -q '"error"' "$1/seed.log" || { echo "  ✗ the seed rows did not load into $1"; tail -8 "$1/seed.log"; return 1; }
}
git -C "$ENGINE" show "${MDR_FTS_SELFTEST_LIVE_TAG:-a20e27898}:engine/boot.sql" > "$T/boot-046.sql" 2>/dev/null && [ -s "$T/boot-046.sql" ] \
  || { echo "  ✗ the live tag's boot.sql (the migrate-046 schema) is not in git"; exit 1; }
mk_fixture "$T/fxA" "$ENGINE/boot.sql" || exit 1
mk_fixture "$T/fxB" "$T/boot-046.sql" || exit 1
q() { (cd "$1" && "$W" d1 execute fx-agent-r --local --config wrangler.jsonc --command "$2" --json </dev/null 2>/dev/null) | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['results'][0]['n'])" 2>/dev/null; }
nA=$(q "$T/fxA" "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='k_find' AND sql LIKE 'CREATE VIRTUAL TABLE%'")
hitsA=$(q "$T/fxA" "SELECT COUNT(*) AS n FROM k_find WHERE k_find MATCH 'atlas OR question OR search'")
nB=$(q "$T/fxB" "SELECT COUNT(*) AS n FROM sqlite_master WHERE sql LIKE 'CREATE VIRTUAL TABLE%' OR name LIKE 'k_find%'")
[ "$nA" = 1 ] && [ "${hitsA:-0}" -ge 2 ] && [ "$nB" = 0 ] \
  && ok "fixtures: A (this repo's boot.sql) holds migrate-056's k_find with the seed rows indexed ($hitsA hits); B (the live tag's boot.sql, migrate-046) holds no virtual table" \
  || bad "fixtures: A k_find=$nA hits=$hitsA · B virtual/k_find objects=$nB"
(cd "$T/fxA" && "$W" d1 export fx-agent-r --local --config wrangler.jsonc --output "$T/plain.sql" -y </dev/null >"$T/plain.log" 2>&1)
{ [ ! -s "$T/plain.sql" ] && grep -q "Virtual Tables" "$T/plain.log"; } \
  && ok "the plain export of A is refused (\"cannot export databases with Virtual Tables (fts5)\") — the failure this tool must survive" \
  || bad "the plain export of A was not refused: the fixture does not reproduce the limit"

# ── the stub npx: --remote becomes the fixture's local D1; never a credential, never the network ──────────────────────
mkdir -p "$T/bin"
cat > "$T/bin/npx" <<'EOF'
#!/bin/sh
[ "$1" = "--yes" ] && shift
[ "$1" = "wrangler" ] || { echo "npx-unexpected $*" >> "$STUB_LOG"; exit 97; }
shift
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
case " $* " in
  *" --remote "*)
    echo "remote $*" >> "$STUB_LOG"
    for a in "$@"; do shift; [ "$a" = "--remote" ] && continue; set -- "$@" "$a"; done   # drop --remote, keep the rest
    cd "$STUB_FIXTURE" && exec "$STUB_WRANGLER" "$@" --local --config wrangler.jsonc ;;
esac
exec "$STUB_WRANGLER" "$@"
EOF
chmod +x "$T/bin/npx"
printf 'CLOUDFLARE_API_TOKEN=stub-not-a-token\nCLOUDFLARE_ACCOUNT_ID=stub-account\n' > "$T/env.sh"

run() {   # <tree> <fixture> <name> [args…] — sets OUT, RC, LOG
  _tree="$1"; _fx="$2"; _name="$3"; shift 3
  LOG="$T/$_name.log"; : > "$LOG"
  OUT=$(cd "$_tree" && env HOME="$T" PATH="$T/bin:$PATH" TMPDIR="$T" SHARINGU_ENV_PATH="$T/env.sh" STUB_LOG="$LOG" STUB_FIXTURE="$_fx" \
        STUB_WRANGLER="$W" WRANGLER_SEND_METRICS=false sh tools/migrate-dryrun.sh fx-agent-r "$@" 2>&1); RC=$?
  printf '%s\n' "$OUT" > "$T/$_name.out"
  [ -n "$MDR_FTS_SELFTEST_VERBOSE" ] && printf '%s\n' "── $_name (rc $RC)" "$OUT" | sed 's/^/    | /'
}
says() { printf '%s\n' "$OUT" | grep -q -- "$1"; }

if [ -d "$T/old" ]; then
  run "$T/old" "$T/fxA" old-A
  { [ $RC -ne 0 ] && says "export of fx-agent-r produced no file" && ! says "GREEN"; } \
    && ok "the OLD source step (git HEAD) FAILS on a database holding k_find: the export produced no file (rc $RC)" \
    || { bad "the old script did not fail at the export on fixture A (rc $RC)"; printf '%s\n' "$OUT" | tail -5 | sed 's/^/        /'; }
fi

run "$T/new" "$T/fxA" new-A --from 999
{ [ $RC -eq 0 ] && says "holds virtual table(s): k_find" && says "WITHOUT them, their shadow tables (k_find_config k_find_data k_find_idx) and the 21 trigger(s) that write them" \
  && says "exported by name in [0-9]* part(s)" && says "step 1b: put back the virtual table(s)" && says "migrate-056.sql applied" \
  && says "migrate-999-s4-dummy.sql applied" && ! says "migrate-055.sql" && says "k_find re-created and consistent" && says "MIGRATE-DRYRUN GREEN" \
  && says "seeded into the copy beside the org" && says "the second seeded before anything was measured), each whole after both passes" \
  && grep -q "^remote d1 execute fx-agent-r --remote --command SELECT type, name, sql FROM sqlite_master" "$LOG" \
  && grep -q "^remote d1 export fx-agent-r --remote .*--table k_goals" "$LOG" && ! grep -q -- "--table k_find " "$LOG" && ! grep -q -- "--table k_find_goal_ai" "$LOG" \
  && [ "$(grep "^remote" "$LOG" | grep -vc "d1 export\|sqlite_master")" = 0 ]; } \
  && ok "THE NEXT SHIP (live holds k_find, a later migration to try): the schema's names read, exported by name without k_find, its shadow tables and its 21 triggers; 056 puts them back and refills the index; the dummy migration applies and replays; k_find passes the integrity-check; a SECOND org seeded before anything was measured, each org whole after both passes (PLATFORM §5) — GREEN" \
  || { bad "the new script on fixture A --from 999 (rc $RC)"; printf '%s\n' "$OUT" | grep -E "✗|·|GREEN" | tail -12 | sed 's/^/        /'; }
chunks=$(grep -c "^remote d1 export" "$LOG")
{ [ "$chunks" -ge 3 ] && grep "^remote d1 export" "$LOG" | head -1 | grep -q -- "--no-data" && grep "^remote d1 export" "$LOG" | grep -q -- "--no-schema"; } \
  && ok "fixture A's export ran as $chunks named parts: every table's schema first (--no-data), then the rows (--no-schema), then the indexes and triggers" \
  || bad "fixture A exported in $chunks part(s)"

run "$T/new" "$T/fxB" new-B --from 047
{ [ $RC -eq 0 ] && ! says "virtual table(s)" && says "MIGRATE-DRYRUN GREEN" && says "migrate-047.sql applied" && says "migrate-056.sql applied" \
  && says "migrate-999-s4-dummy.sql applied" && ! says "migrate-046.sql" && grep -q "^remote d1 export .*--table people" "$LOG" \
  && says "the second org joins right after pass 1" && says "the second seeded after pass 1), each whole after both passes"; } \
  && ok "THIS SHIP (live at migrate-046, no virtual table: the live tag's own boot.sql): the same by-name export leaves nothing out; 047 → 069 and the dummy apply in order; the copy holds no orgs until 067, so a SECOND org joins after pass 1 and the replay runs over two orgs, each whole (PLATFORM §5) — GREEN" \
  || { bad "the new script on fixture B --from 047 (rc $RC)"; printf '%s\n' "$OUT" | grep -E "✗|GREEN" | tail -8 | sed 's/^/        /'; }

echo "migrate-dryrun-fts-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
