#!/bin/sh
# tools/migrate-dryrun.sh — B3-heal (2026-09-22): the proof, as a tool, that migrate-*.sql actually
# applies to a REAL org's own accumulated data — not a fresh empty D1 (boot.sql/fk-enforce-selftest.py
# already prove THAT shape), and not a hand-run-once-and-hope. Read-only against the org's remote D1
# (one `wrangler d1 export --remote`); every write happens in a throwaway LOCAL D1
# (`wrangler d1 execute --local --persist-to <tmp>`, the same emulation D1 itself runs on) inside a
# fresh 700 temp directory this script deletes on every exit path. NEVER WRITES REMOTE.
#
# Usage:
#   sh tools/migrate-dryrun.sh <org-db> [--from NNN]   # e.g. ryuklabs-agent-r --from 047
#   sh tools/migrate-dryrun.sh --selftest      # offline proofs (no network): tools/migrate-dryrun-selftest.py (the
#                                               # gate step) + tools/migrate-dryrun-fts-selftest.sh (local wrangler)
#
# What it proves, in order, printing counts and codes ONLY (never a row — no person's name, no
# transmission body, nothing a live org filed):
#   1. export <org-db> read-only, load it into a fresh local D1 — a database holding a virtual table (migrate-056's FTS5
#      k_find, which D1's export refuses) is exported BY NAME without it and its shadow tables, and the chain's own
#      migration re-creates and refills it (tools/lib-migrate-chain.sh mdr_export_and_load; step 3b checks it is back)
#   1c. TWO ORGS (sprint 6, 6.6; docs/plan/PLATFORM.md §5: "a migration's dry run uses a copy holding at least two orgs"):
#      a copy holding one org gets a second (tools/fixtures/two-orgs.mjs sql: its org row, owner, member, two projects, a
#      goal, a question, a contribution and its events row, keyed o<id>--<slug>) — BEFORE anything is measured when the
#      copy's schema already holds orgs (migrate-067 on), else right after pass 1 (the chain that makes orgs), so the replay
#      and every check after it run over two orgs; step 3c then holds every org's rows to its own, count by count
#   2. apply every migrate-*.sql file this repo has, IN SORTED ORDER, against that local copy (`--from NNN`: only the
#      files numbered NNN and up — exactly the files a ship applies with tools/migrate.sh, e.g. `--from 047` for the
#      sprint-3 ship over live at 046; the whole chain re-runs migrate-031's transmission rebuild, which cannot replay over
#      an org at migrate-053 or later, see S4's report) —
#      a file already reflected in the org's own live schema fails with a well-known SQLite
#      "already applied" shape (duplicate column name / table or index already exists) and is
#      SKIPPED, not counted as a failure; any OTHER error is real and stops the run (exit 1) — this
#      is exactly how `sh tools/migrate-dryrun.sh ryuklabs-agent-r` FAILS on main's own migrate-031
#      today (a genuine FOREIGN KEY constraint failed) and PASSES once this batch's fix lands.
#   2b. REENTRANCY (batch migrate-031-reentrancy, 2026-09-23): apply the SAME chain a SECOND time,
#      against the SAME local copy — no fresh export, no re-load. An org already carrying the full
#      migrate-035 schema (ryuklabs-agent-r, today) replays the whole chain on TOP of itself every
#      time this tool runs against it; step 2 alone only ever proved the FIRST application, never
#      this one. This is the both-ways proof: RED at origin/main's own migrate-031.sql (SQLite's
#      documented ALTER TABLE RENAME rewrites migrate-034.sql's approval_audit_no_delete_real trigger
#      body into naming `transmission_old`, which this file then drops — "no such table:
#      main.transmission_old" the moment approval_audit's own rename next touches it), GREEN once
#      this batch's migrate-031.sql fix lands.
#   3. derive every FOREIGN KEY the FINAL schema (post BOTH passes) declares straight from
#      sqlite_master (never a hand-typed list) and assert zero orphaned rows across every one of them
#   4. assert no `*_old` table survives in sqlite_master (every rebuild cleaned up after itself) AND
#      that no TRIGGER's own SQL text still names a `*_old` table (a dangling reference the *_old
#      table check alone would miss, since the table itself is already gone by the time it fires)
#   5. assert every table's row COUNT is unchanged from before step 2 (pass 1) to after step 2b
#      (pass 2), with ONE named exception — `people` may have GROWN once, between before and the
#      pass-1 snapshot (migrate-030a.sql's own orphan-return, Q974E7924) — and one kind of new table: a
#      table the chain CREATES may hold the rows its migration backfills from the org's own (a tally:
#      migrate-050 k_fill, migrate-054 the stale marks; S4) — any other table changing
#      row count, at either boundary, is itself a defect this tool did not expect and refuses to wave
#      through; the pass-1-to-pass-2 boundary specifically allows NO exceptions at all (a REPLAY that
#      changes so much as one more row, including `people`, is not the no-op it claims to be)
#   5b. assert the replay left every TRIGGER's SQL exactly as pass 1 left it (G2 item 9: re-running migrate-054 used to put
#      back its own versions of the triggers 057 and 062 replace; a row count does not see that)
#   6. assert no REBUILT table lost a column before/after (a rebuild that silently dropped or renamed a column is
#      caught here, independent of the FK/CHECK checks above; columns the migrations ADD are listed — S4, `--from`)
#   7. delete the temp copy, unconditionally (trap on every exit path)
set -u
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"

if [ "${1:-}" = "--selftest" ]; then
  # the offline fixture proof of the 030-035 replay, then the virtual-table source proof (local wrangler, no network)
  python3 "$ENGINE/tools/migrate-dryrun-selftest.py" || exit 1
  exec sh "$ENGINE/tools/migrate-dryrun-fts-selftest.sh"
fi

ORG_DB="${1:-}"
MDR_FROM=""
if [ "${2:-}" = "--from" ]; then
  MDR_FROM="${3:-}"
  printf '%s' "$MDR_FROM" | grep -Eq '^[0-9]{3}$' || { echo "usage: --from <NNN> (three digits: the first migration the ship applies, e.g. 047)" >&2; exit 2; }
fi
export MDR_FROM
if [ -z "$ORG_DB" ] || { [ -n "${2:-}" ] && [ -z "$MDR_FROM" ]; }; then
  echo "usage: sh tools/migrate-dryrun.sh <org-db> [--from <NNN>]   (e.g. ryuklabs-agent-r --from 047)  |  sh tools/migrate-dryrun.sh --selftest" >&2
  exit 2
fi

[ -f "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}" ] && { set -a; . "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}"; set +a; }
{ [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; } || { echo "  ✗ CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID required — source ~/.sharingu/env-sharingu.sh" >&2; exit 2; }
# QC74D4892 (2026-09-22): steps 1-2 below live in tools/lib-migrate-chain.sh — never a second
# migration path. Behavior is unchanged (proven live).
. "$ENGINE/tools/lib-migrate-chain.sh"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/migrate-dryrun-XXXXXX")"
chmod 700 "$TMP"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

PERSIST="$TMP/persist"
CFG="$TMP/scratch.jsonc"
EXPORT="$TMP/export.sql"
cat > "$CFG" <<CFGEOF
{
  "name": "migrate-dryrun-scratch",
  "compatibility_date": "2026-08-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "$ORG_DB", "database_id": "00000000-0000-0000-0000-000000000000" }
  ]
}
CFGEOF

echo "· migrate-dryrun $ORG_DB — step 1: read-only export (remote) + load into a throwaway local D1"
mdr_export_and_load "$ORG_DB" "$EXPORT" "$PERSIST" "$CFG" || exit 1

# The virtual tables the export left out (tools/lib-migrate-chain.sh): the copy gets them back BEFORE anything is measured, by
# applying the ONE migration that creates each (its CREATE VIRTUAL TABLE, the triggers that keep it and its rebuild from the
# tables), so the copy is live's shape again — the migrations under test then run with the index and its triggers in place.
if [ -n "${MDR_VIRTUAL:-}" ]; then
  echo "· step 1b: put back the virtual table(s) the export left out, from the migration that creates each: $MDR_VIRTUAL"
  mkdir -p "$TMP/restore"
  for v in $MDR_VIRTUAL; do
    mf=$(grep -l "CREATE VIRTUAL TABLE IF NOT EXISTS $v " "$ENGINE"/migrate-*.sql 2>/dev/null | sort | head -1)
    [ -n "$mf" ] || { echo "  ✗ no migrate-*.sql creates $v: the copy cannot hold it"; exit 1; }
    cp "$mf" "$TMP/restore/"
  done
  ( MDR_FROM=""; mdr_apply_chain "$ORG_DB" "$PERSIST" "$CFG" "$TMP/restore" ) || { echo "  ✗ the virtual table(s) could not be put back"; exit 1; }
fi

# step 1c — the copy holds at least two orgs (PLATFORM §5); its schema holds orgs when projects has its (generated, hidden: table_xinfo) org column. seed_second_org: the next free org id, its SQL from the fixture
# (written char(45, 45) wherever a key holds two dashes: wrangler's splitter scar), loaded into the copy
org_shape() { mdr_d1_query "$ORG_DB" "$PERSIST" "$CFG" "SELECT (SELECT COUNT(*) FROM org) AS orgs, (SELECT COUNT(*) FROM pragma_table_xinfo('projects') WHERE name = 'org') AS keyed, (SELECT COALESCE(MAX(id), 1) + 1 FROM org) AS next" \
  | python3 -c "import json,sys;r=json.load(sys.stdin);r=r[0] if r else {};print(r.get('orgs', 0), r.get('keyed', 0), r.get('next', 2))"; }
seed_second_org() {
  _next=$(org_shape | cut -d' ' -f3)
  node "$ENGINE/tools/fixtures/two-orgs.mjs" sql "$_next" dryrunorgb > "$TMP/second-org.sql" 2>/dev/null || { echo "  ✗ could not write the second org's SQL"; return 1; }
  npx --yes wrangler d1 execute "$ORG_DB" --local --persist-to "$PERSIST" --config "$CFG" --file "$TMP/second-org.sql" </dev/null >"$TMP/second-org.log" 2>&1 \
    || { echo "  ✗ the second org did not load into the copy: $(grep -o '"text": *"[^"]*"\|✘.*' "$TMP/second-org.log" | head -1)"; return 1; }
  echo "  ✓ org $_next seeded into the copy beside the org's own: $(grep -c '^INSERT' "$TMP/second-org.sql") rows (its owner, member, two projects, a goal, a question, a contribution, an events row)"
}
# org_rows -> every org's rows of the org-wide tables, by org, as JSON (step 3c compares the start with the end)
org_rows() {
  mdr_d1_query "$ORG_DB" "$PERSIST" "$CFG" "SELECT json_object('people', (SELECT json_group_object(org, n) FROM (SELECT org, COUNT(*) AS n FROM people GROUP BY org)), 'projects', (SELECT json_group_object(org, n) FROM (SELECT org, COUNT(*) AS n FROM projects GROUP BY org)), 'transmission', (SELECT json_group_object(org, n) FROM (SELECT org, COUNT(*) AS n FROM transmission GROUP BY org)), 'events', (SELECT json_group_object(org, n) FROM (SELECT org, COUNT(*) AS n FROM events GROUP BY org)), 'k_goals', (SELECT json_group_object(p.org, n) FROM (SELECT project, COUNT(*) AS n FROM k_goals GROUP BY project) g JOIN projects p ON p.key = g.project)) AS j" \
    | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['j'] if r else '{}')"
}
SECOND=""
set -- $(org_shape)
if [ "${2:-0}" = "1" ]; then
  echo "· step 1c: the copy holds $1 org(s) and its schema holds orgs (migrate-067 on)"
  if [ "${1:-0}" -lt 2 ]; then seed_second_org || exit 1; SECOND=before; else echo "  ✓ $1 orgs already: no second org added"; SECOND=held; fi
  org_rows > "$TMP/orgs-start.json"
else
  echo "· step 1c: the copy's schema holds no orgs yet (before migrate-067): the second org joins right after pass 1, before the replay"
fi

# BEFORE snapshot: row counts (every user table) + column-name sets (rebuilt tables only).
REBUILT_TABLES="transmission transmission_refs approval_audit invites loops project_seats tokens check_results events artifacts"
snapshot() {  # snapshot <out-json>
  python3 - "$1" <<'PY'
import json, subprocess, sys, os
out_path = sys.argv[1]
PERSIST = os.environ["MDR_PERSIST"]; CFG = os.environ["MDR_CFG"]; DB = os.environ["MDR_DB"]
def q(sql):
    r = subprocess.run(["npx","--yes","wrangler","d1","execute",DB,"--local","--persist-to",PERSIST,"--config",CFG,"--command",sql,"--json"],
                        capture_output=True, text=True)
    d = json.loads(r.stdout)
    if isinstance(d, dict) and "error" in d:
        raise SystemExit("query failed: %s :: %s" % (sql, d["error"]["text"]))
    return d[0]["results"]
# a virtual table (migrate-056's FTS5 k_find) and its shadow tables are an INDEX of other tables' rows, not data: the
# export leaves them out and the chain rebuilds them, so they are never counted (their check is step 3b)
virtual = [r["name"] for r in q("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE 'CREATE VIRTUAL TABLE%'")]
derived = set(virtual) | {v + "_" + s for v in virtual for s in ("data", "idx", "content", "docsize", "config")} | {v + "_" + s for v in os.environ.get("MDR_VIRTUAL", "").split() for s in ("data", "idx", "content", "docsize", "config")} | set(os.environ.get("MDR_VIRTUAL", "").split())
tables = [row["name"] for row in q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'") if row["name"] not in derived]
counts = {}
for t in tables:
    counts[t] = q(f"SELECT COUNT(*) AS n FROM {t}")[0]["n"]
rebuilt = os.environ["MDR_REBUILT"].split()
cols = {}
for t in rebuilt:
    if t in tables:
        cols[t] = sorted(r["name"] for r in q(f"PRAGMA table_info({t})"))
# S4: the DERIVED tables — every table a trigger INSERTs into or DELETEs from (the tallies: transmission_open, k_fill, the
# lights, the stale marks, transmission_refs …): a migration that replaces a tally's triggers recomputes its rows
import re as _re
derived_t = set()
for r in q("SELECT sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL"):
    for m in _re.finditer(r"(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s+\"?(\w+)\"?", r["sql"], _re.I):
        derived_t.add(m.group(1))
# G2 item 9 (the review's agentC: re-running migrate-054 silently put back its own versions of triggers 057 and 062 had
# replaced): every trigger's SQL, so the replay below must leave each exactly as pass 1 left it
trig = {r["name"]: r["sql"] for r in q("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")}
json.dump({"counts": counts, "cols": cols, "derived": sorted(derived_t), "triggers": trig}, open(out_path, "w"))
PY
}
export MDR_PERSIST="$PERSIST" MDR_CFG="$CFG" MDR_DB="$ORG_DB" MDR_REBUILT="$REBUILT_TABLES"
snapshot "$TMP/before.json" || { echo "  ✗ could not snapshot the loaded copy before applying anything"; exit 1; }

echo "· step 2: apply every migrate-*.sql${MDR_FROM:+ from migrate-$MDR_FROM on (the files a ship applies: the org holds the earlier ones)} in sorted order (already-applied ones are detected and skipped, never counted as a pass)"
mdr_apply_chain "$ORG_DB" "$PERSIST" "$CFG" "$ENGINE" || exit 1

echo "· step 2 snapshot: row counts + column sets after pass 1 (the 'already migrated' state a replay starts from)"
snapshot "$TMP/mid.json" || { echo "  ✗ could not snapshot the copy after pass 1"; exit 1; }
cp "$TMP/mid.json" "$TMP/pass1.json"
if [ -z "$SECOND" ]; then
  echo "· step 2a: the second org joins the copy now that its schema holds orgs (PLATFORM §5); the replay runs over two orgs"
  set -- $(org_shape)
  [ "${2:-0}" = "1" ] || { echo "  ✗ pass 1 left a schema with no orgs (projects has no org column): the chain lacks migrate-067"; exit 1; }
  seed_second_org || exit 1; SECOND=after-pass-1
  org_rows > "$TMP/orgs-start.json"
  snapshot "$TMP/mid.json" || { echo "  ✗ could not snapshot the copy after the second org joined"; exit 1; }
fi

echo "· step 2b: REPLAY — apply the SAME chain a SECOND time against the SAME local copy (no fresh export) — the re-entrancy proof"
mdr_apply_chain "$ORG_DB" "$PERSIST" "$CFG" "$ENGINE" || exit 1

echo "· step 3: derive every FOREIGN KEY from the FINAL schema, post BOTH passes (sqlite_master, never a hand list) and assert zero orphans"
python3 - <<'PY' || exit 1
import json, os, re, subprocess, sys
PERSIST = os.environ["MDR_PERSIST"]; CFG = os.environ["MDR_CFG"]; DB = os.environ["MDR_DB"]
def q(sql):
    r = subprocess.run(["npx","--yes","wrangler","d1","execute",DB,"--local","--persist-to",PERSIST,"--config",CFG,"--command",sql,"--json"],
                        capture_output=True, text=True)
    d = json.loads(r.stdout)
    if isinstance(d, dict) and "error" in d:
        raise SystemExit("query failed: %s :: %s" % (sql, d["error"]["text"]))
    return d[0]["results"]

rows = q("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL")
def split_columns(body):
    # body is the text BETWEEN the CREATE TABLE's own outer parens — split on commas that are NOT
    # nested inside a further paren pair (a plain regex over the whole body would happily let its
    # lazy match span the "CREATE TABLE x (" preamble itself and misread the table's own name as a
    # column — measured live, first cut of this parser).
    parts, depth, cur = [], 0, []
    for ch in body:
        if ch == "(":
            depth += 1; cur.append(ch)
        elif ch == ")":
            depth -= 1; cur.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(cur)); cur = []
        else:
            cur.append(ch)
    if cur:
        parts.append("".join(cur))
    return parts

fks = []  # (src_table, src_col, tgt_table, tgt_col)
for row in rows:
    src, sql = row["name"], row["sql"]
    m0 = re.search(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?\w+"?\s*\((.*)\)\s*$', sql, re.S)
    if not m0:
        continue
    # an org's accumulated schema keeps the migrations' inline comments; a comma inside one ("command+exit+output, or a
    # deeplink", live's transmission.proof) split the column list mid-comment and the next column read as "or" (found on
    # the sprint-3 dry run, 2026-10-03): comments go before the split
    body = re.sub(r'--[^\n]*', '', m0.group(1))
    for col_def in split_columns(body):
        m = re.match(r'\s*"?(\w+)"?\s+\w.*?REFERENCES\s+"?(\w+)"?\s*\(\s*(\w+)\s*\)', col_def, re.S)
        if m:
            fks.append((src, m.group(1), m.group(2), m.group(3)))

if not fks:
    print("  ✗ zero FOREIGN KEYs derived from sqlite_master — the parser or the schema is wrong"); sys.exit(1)

bad = []
for src, scol, tgt, tcol in fks:
    cols = {r["name"] for r in q(f"PRAGMA table_info({src})")}
    if scol not in cols:
        print(f"  ✗ the parser derived {src}.{scol} -> {tgt}({tcol}) but {src} has no column {scol}: the parser is wrong"); sys.exit(1)
    n = q(f"SELECT COUNT(*) AS n FROM {src} s LEFT JOIN {tgt} t ON t.{tcol} = s.{scol} WHERE s.{scol} IS NOT NULL AND t.{tcol} IS NULL")[0]["n"]
    mark = "✓" if n == 0 else "✗"
    print(f"  {mark} {src}.{scol} -> {tgt}({tcol}): {n} orphan(s)")
    if n: bad.append(f"{src}.{scol}->{tgt}({tcol})")

oldtabs = [r["name"] for r in q("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_old'")]
if oldtabs:
    print("  ✗ leftover *_old table(s):", ", ".join(oldtabs)); bad.append("old-tables")
else:
    print("  ✓ no *_old table survives")

# REENTRANCY (batch migrate-031-reentrancy, 2026-09-23): a TRIGGER — or another table's own FOREIGN
# KEY clause — can go on naming a dropped *_old table long after that table itself is gone; the
# oldtabs check above only sees sqlite_master's own TABLE NAMES, never any OTHER object's SQL TEXT.
# Two measured live casualties, same mechanism: migrate-034.sql's approval_audit_no_delete_real WHEN
# clause got rewritten to name `transmission_old`, and separately check_results.transmission_id — a
# REAL FK from a prior migrate-032.sql run, on a table migrate-031.sql never rebuilds — got the same
# treatment. Scanned generically here (every trigger AND every table's own schema text), not as two
# named special cases, so a future table gaining a real FK into anything this chain renames is caught
# the same way without this tool needing to learn its name first.
stale = []
for kind in ("trigger", "table"):
    for r in q(f"SELECT name, sql FROM sqlite_master WHERE type='{kind}' AND sql IS NOT NULL"):
        if "_old" in r["sql"]:
            stale.append(f"{kind}:{r['name']}")
if stale:
    print("  ✗ schema object(s) still naming a *_old table:", ", ".join(stale)); bad.append("stale-old-refs")
else:
    print("  ✓ no trigger or table schema text names a *_old table")

if bad:
    print(f"  → {len(bad)} check(s) failed: {', '.join(bad)}"); sys.exit(1)
print(f"  ✓ {len(fks)} foreign key(s) derived from the final schema, zero orphans, no *_old table")
PY

if [ -n "${MDR_VIRTUAL:-}" ]; then
  echo "· step 3b: the virtual table(s) the export left out are back, rebuilt by the chain, and pass the FTS5 integrity-check: $MDR_VIRTUAL"
  for v in $MDR_VIRTUAL; do
    n=$(mdr_d1_query "$ORG_DB" "$PERSIST" "$CFG" "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='$v' AND sql LIKE 'CREATE VIRTUAL TABLE%'" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['n'] if r else 0)")
    [ "$n" = 1 ] || { echo "  ✗ $v is not in the migrated copy: no migration re-creates it (the export left it out)"; exit 1; }
    out=$(npx --yes wrangler d1 execute "$ORG_DB" --local --persist-to "$PERSIST" --config "$CFG" --command "INSERT INTO $v ($v, rank) VALUES ('integrity-check', 0)" --json </dev/null 2>&1)
    if ! printf '%s' "$out" | grep -q '"success": *true'; then
      why=$(printf '%s' "$out" | grep -o '"text": *"[^"]*"' | head -1)
      echo "  ✗ $v fails the FTS5 integrity-check: $why"; exit 1
    fi
    echo "  ✓ $v re-created and consistent"
  done
fi

echo "· step 3c: two orgs, each whole: every org's rows (people, projects, contributions, events, goals) counted at the start and after both passes, and no row of one org naming a project of another"
org_rows > "$TMP/orgs-end.json"
python3 - "$TMP/orgs-start.json" "$TMP/orgs-end.json" "$SECOND" <<'PY' || exit 1
import json, sys
a, b, how = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3]
orgs = sorted({o for t in a.values() for o in (json.loads(t) if isinstance(t, str) else t or {})})
if len(orgs) < 2:
    print(f"  ✗ the copy holds {len(orgs)} org(s): a dry run runs over two (PLATFORM §5)"); sys.exit(1)
bad = [t for t in a if a[t] != b.get(t)]
for t in sorted(a):
    print(f"  {'✗' if t in bad else '✓'} {t} by org: {a[t]}" + (f" -> {b.get(t)}" if t in bad else ", unchanged"))
if bad:
    sys.exit(1)
print(f"  ✓ {len(orgs)} orgs ({', '.join(orgs)}; the second {'seeded before anything was measured' if how == 'before' else 'seeded after pass 1' if how == 'after-pass-1' else 'the copy own'}), each whole after both passes")
PY
n=$(mdr_d1_query "$ORG_DB" "$PERSIST" "$CFG" "SELECT (SELECT COUNT(*) FROM transmission t JOIN projects p ON p.key = t.project WHERE t.org IS NOT p.org) + (SELECT COUNT(*) FROM events e JOIN projects p ON p.key = e.project WHERE e.org IS NOT p.org) + (SELECT COUNT(*) FROM project_seats s JOIN people x ON x.id = s.person_id JOIN projects p ON p.key = s.project_key WHERE x.org IS NOT p.org) AS n" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['n'] if r else 'unreadable')")
[ "$n" = 0 ] || { echo "  ✗ $n row(s) of one org name a project of another"; exit 1; }
echo "  ✓ no contribution, event or seat of one org names a project of another"

echo "· step 4: row counts unchanged (only 'people' may have grown — migrate-030a.sql's own orphan-return) + column-name sets of every rebuilt table unchanged"
snapshot "$TMP/after.json" || { echo "  ✗ could not snapshot the migrated copy"; exit 1; }
# a migration that backfills a FILED table's rows from the org's own (migrate-057's touches index: one row per touch token
# of every contribution already filed) declares it in its header — `-- BACKFILL: <table>` — and pass 1 may then GROW that
# table (never shrink it); pass 2, the replay, must still leave it exact (a backfill writes nothing the second time)
MDR_BACKFILL=$(grep -h -o -- '-- BACKFILL: [A-Za-z0-9_ ,]*' "$ENGINE"/migrate-*.sql 2>/dev/null | sed 's/-- BACKFILL: //; s/,/ /g' | tr '\n' ' ')
export MDR_BACKFILL
python3 - "$TMP/before.json" "$TMP/pass1.json" "$TMP/after.json" "$TMP/mid.json" <<'PY' || exit 1
import json, sys, os
# pass 1 is measured on the copy as pass 1 left it; the replay from the copy as it started (with the second org, step 2a)
before = json.load(open(sys.argv[1])); pass1 = json.load(open(sys.argv[2])); after = json.load(open(sys.argv[3])); mid = json.load(open(sys.argv[4]))
bad = []
DROPPED_TABLES = {"sessions", "sso_nonce", "transmission_refs_meta"}  # the tables this chain deliberately removes: migrate-030.sql (Q0544F477), migrate-067.sql and migrate-069.sql (sprint 6)
BACKFILLED = set(os.environ.get("MDR_BACKFILL", "").split())  # declared by the migrations' own headers (-- BACKFILL: t)

print("  -- pass 1: before this org's own data -> after the first full chain application --")
for t in sorted(set(before["counts"]) | set(pass1["counts"])):
    b = before["counts"].get(t); m = pass1["counts"].get(t)
    if b == m:
        print(f"  ✓ {t}: {m} row(s), unchanged")
    elif t == "people" and m is not None and b is not None and m >= b:
        print(f"  ✓ {t}: {b} -> {m} row(s) (+{m-b}, migrate-030a.sql's orphan-return — expected)")
    elif t in DROPPED_TABLES and m is None:
        print(f"  ✓ {t}: {b} row(s) -> table dropped (a migration drops it — expected)")
    elif b is None and m == 0:
        print(f"  ✓ {t}: a table the chain creates, empty (expected: a migration adds tables, never rows of its own)")
    elif b is not None and m is not None and t in set(pass1.get("derived", [])):
        # S4: a tally a migration's new triggers recompute (migrate-050's transmission_open stops counting the ledger's
        # bookkeeping rows): its rows are derived, not filed — pass 2 below must leave them exactly as they are
        print(f"  ✓ {t}: {b} -> {m} row(s), a derived table (kept by triggers) the migrations recomputed (the replay must keep it exact)")
    elif b is not None and m is not None and t in BACKFILLED and m >= b:
        print(f"  ✓ {t}: {b} -> {m} row(s) (+{m-b}), a backfill a migration's header declares (the replay must keep it exact)")
    elif b is None and m is not None:
        # S4: a tally a migration creates AND backfills from the org's rows (migrate-050 k_fill, migrate-054 k_node_stale /
        # k_check_stale): derived rows, not filed ones — pass 2 below must leave them exactly as they are
        print(f"  ✓ {t}: a table the chain creates and backfills from the org's own rows: {m} derived row(s) (the replay must keep them exact)")
    else:
        print(f"  ✗ {t}: {b} -> {m} row(s) — unexpected change"); bad.append(f"pass1:{t}")

# REENTRANCY (batch migrate-031-reentrancy, 2026-09-23): pass 2 is a REPLAY of an org that is already
# fully migrated — every orphan migrate-030a.sql could ever return was already returned on pass 1, so
# unlike the before->pass1 boundary above, THIS boundary allows NO exceptions at all, not even
# `people`. Any row-count movement here means the "second run does nothing" claim is false.
print("  -- pass 2 (the replay): after pass 1 -> after pass 2 — must be EXACT, no exceptions --")
for t in sorted(set(mid["counts"]) | set(after["counts"])):
    m = mid["counts"].get(t); a = after["counts"].get(t)
    if m == a:
        print(f"  ✓ {t}: {a} row(s), unchanged by the replay")
    else:
        print(f"  ✗ {t}: {m} -> {a} row(s) — the replay changed a row count"); bad.append(f"replay:{t}")

# G2 item 9: the replay leaves every trigger as pass 1 left it — a later migration's trigger reverted by an earlier file
# re-run (migrate-054 over 057 and 062, the review's finding) is a ✗, never a quiet green
mt, at_ = mid.get("triggers", {}), after.get("triggers", {})
moved = sorted(n for n in set(mt) | set(at_) if mt.get(n) != at_.get(n))
if moved:
    print(f"  ✗ the replay changed {len(moved)} trigger(s): {', '.join(moved)} (an earlier migration re-run put back an older version)"); bad.append("replay:triggers")
else:
    print(f"  ✓ every trigger ({len(mt)}) is exactly as pass 1 left it after the replay")

for t in sorted(before["cols"]):
    bc, ac = before["cols"].get(t), after["cols"].get(t)
    if bc == ac:
        print(f"  ✓ {t}: column set unchanged ({len(bc)} columns)")
    elif ac is not None and set(bc) <= set(ac):
        # S4: with --from, the migrations under test ADD columns (expand-only); a rebuild must never LOSE one
        print(f"  ✓ {t}: no column lost; {len(set(ac) - set(bc))} added by the migrations ({', '.join(sorted(set(ac) - set(bc)))})")
    else:
        print(f"  ✗ {t}: column set LOST {sorted(set(bc) - set(ac or []))} — before {bc} after {ac}"); bad.append(t + ".columns")
if bad:
    print(f"  → {len(bad)} check(s) failed: {', '.join(bad)}"); sys.exit(1)
print("  ✓ every table's row count is accounted for across both passes; every rebuilt table's column set is unchanged")
PY

echo "✓ MIGRATE-DRYRUN GREEN — $ORG_DB — the migration chain applies clean against this org's own real data (temp copy deleted on exit, remote untouched)"
