# tools/lib-migrate-chain.sh — QC74D4892 (one-org-worker, 2026-09-22): the ONE "bring an org's own
# accumulated data schema-current" routine, extracted out of tools/migrate-dryrun.sh (2026-09-22, so the
# one-shot org merge — tools/org-merge.sh, deleted 2026-09-27 — reused the EXACT SAME steps; never a
# second migration path). Sourced, never
# executed directly. Needs only wrangler + python3 on PATH; a caller owns its own temp-dir lifecycle
# (this file writes only the two paths it is explicitly handed).
#
# Behavior is byte-identical to migrate-dryrun.sh's own former inline steps 1-2 (proven by running
# `sh tools/migrate-dryrun.sh <org-db>` live, post-refactor, against every org this batch touches —
# see the PR body for the run). NEVER writes remote — the only remote calls either function below
# makes are a read-only `wrangler d1 export` and one read-only SELECT of sqlite_master's names (S4).
#
# QC74D4892-heal (2026-09-23): every wrangler --json parse below goes through
# tools/lib_wrangler_json.py's parse_wrangler_json (scans for the JSON payload rather than assuming
# the whole stdout stream IS it) — see that module's own docstring for the live incident this closes.

# mdr_export_and_load <db> <export-file> <persist-dir> <config-file>
#   read-only remote export of <db>, loaded into a throwaway LOCAL D1 at <persist-dir> (wrangler
#   --persist-to), using <config-file> (a scratch wrangler config naming <db> as the "DB" binding).
#   Prints its own verdict; returns non-zero (and prints why) on failure.
#   BY NAME (S4, 2026-10-02): D1's export refuses a database that holds a virtual table ("D1 Export error:
#   cannot export databases with Virtual Tables (fts5)" — migrate-056's k_find), but it checks only the tables
#   its `--table` filter keeps. So it first reads the schema's NAMES (one read-only `d1 execute --remote
#   --command "SELECT … FROM sqlite_master"`, about 250 rows read) and exports BY NAME everything except the
#   virtual tables and their FTS5 shadow tables (<v>_data, _idx, _content, _docsize, _config), in three
#   phases: every table's schema (--no-data), then every table's rows (--no-schema), then the indexes,
#   triggers and views (the filter keeps one only when it is named) — so every table exists before any row
#   lands (a boot.sql-born org lists its tables alphabetically, and a row whose foreign key names a table
#   not yet created fails the load with "no such table"; a whole-database export interleaves them). Names go
#   in chunks of 50 (the local emulation binds every name as a parameter; D1 caps a statement at 100). The
#   same path runs before migrate-056 is live (nothing is left out then). The virtual tables come back when
#   the chain re-applies the migration that creates them (migrate-056 rebuilds k_find from the tables);
#   MDR_VIRTUAL names them for the caller. The parts are separate exports: a write landing between two of
#   them can show as an orphan in step 3 (run the dry run while the org is quiet, as at a ship).
mdr_export_and_load() {
  _db="$1"; _export="$2"; _persist="$3"; _cfg="$4"
  MDR_VIRTUAL=""
  _names=$(npx --yes wrangler d1 execute "$_db" --remote --command "SELECT type, name, sql FROM sqlite_master WHERE sql NOT NULL" --json </dev/null 2>/dev/null \
    | python3 -c "
import os, re, sys
sys.path.insert(0, os.path.join(os.getcwd(), 'tools'))
from lib_wrangler_json import parse_wrangler_json
try:
    d = parse_wrangler_json(sys.stdin.read())
    rows = d[0]['results']
except Exception:
    print('UNREADABLE'); sys.exit()
virtual = [r['name'] for r in rows if r['type'] == 'table' and re.match(r'\s*CREATE\s+VIRTUAL\s+TABLE', r['sql'] or '', re.I)]
shadow = {v + '_' + s for v in virtual for s in ('data', 'idx', 'content', 'docsize', 'config')}
# a trigger that writes a virtual table cannot stand without it (an ALTER TABLE … RENAME re-reads every trigger and fails on
# 'no such table'): it is left out too, and the migration that creates the table puts it back
names_v = [re.compile(r'\\b' + re.escape(v) + r'\\b') for v in virtual]
dependent = {r['name'] for r in rows if r['type'] == 'trigger' and any(p.search(r['sql'] or '') for p in names_v)}
skip = set(virtual) | shadow | dependent
keep = lambda t: [r['name'] for r in rows if r['type'] in t and r['name'] not in skip and not r['name'].startswith(('sqlite_', '_cf_'))]
print('VIRTUAL ' + ' '.join(virtual))
print('SHADOW ' + ' '.join(sorted(n for n in shadow if any(r['name'] == n for r in rows))))
print('DEPENDENT %d' % len(dependent))
tables, rest = keep(('table',)), keep(('index', 'trigger', 'view'))
for tag, names in (('SCHEMA', tables), ('DATA', tables), ('REST', rest)):
    for i in range(0, len(names), 50): print(tag + ' ' + ' '.join(names[i:i + 50]))
")
  case "$_names" in
    VIRTUAL*) ;;
    *) echo "  ✗ the schema of $_db could not be read (d1 execute --remote … sqlite_master) — no export"; return 1 ;;
  esac
  MDR_VIRTUAL=$(printf '%s\n' "$_names" | sed -n 's/^VIRTUAL //p'); export MDR_VIRTUAL
  if [ -n "$MDR_VIRTUAL" ]; then
    echo "  · $_db holds virtual table(s): $MDR_VIRTUAL — exported by name WITHOUT them, their shadow tables ($(printf '%s\n' "$_names" | sed -n 's/^SHADOW //p')) and the $(printf '%s\n' "$_names" | sed -n 's/^DEPENDENT //p') trigger(s) that write them; the migration that creates them puts them back"
  fi
  : > "$_export"; : > /tmp/.mdr-export.$$; _n=0
  printf '%s\n' "$_names" | grep -E '^(SCHEMA|DATA|REST) ' > /tmp/.mdr-chunks.$$
  while read -r _tag _chunk; do
    _n=$((_n+1)); _args=""
    case "$_tag" in SCHEMA) _args="--no-data";; DATA) _args="--no-schema";; esac
    for _t in $_chunk; do _args="$_args --table $_t"; done
    # shellcheck disable=SC2086
    npx --yes wrangler d1 export "$_db" --remote --output "$_export.$_n" -y $_args </dev/null >>/tmp/.mdr-export.$$ 2>&1
    [ -s "$_export.$_n" ] || { echo "  ✗ export part $_n ($_tag) of $_db produced no file — $(tail -3 /tmp/.mdr-export.$$ | tr '\n' ' ')"; rm -f /tmp/.mdr-export.$$ /tmp/.mdr-chunks.$$ "$_export".*; : > "$_export"; return 1; }
    cat "$_export.$_n" >> "$_export"; printf '\n' >> "$_export"; rm -f "$_export.$_n"
  done < /tmp/.mdr-chunks.$$
  rm -f /tmp/.mdr-chunks.$$
  echo "  ✓ exported by name in $_n part(s): every table's schema, then its rows, then the indexes, triggers and views"
  if [ ! -s "$_export" ]; then
    echo "  ✗ export of $_db produced no file — $(tail -3 /tmp/.mdr-export.$$ | tr '\n' ' ')"; rm -f /tmp/.mdr-export.$$; return 1
  fi
  rm -f /tmp/.mdr-export.$$
  # THE LOAD (S4): the export is SQLite's own SQL, written into the throwaway copy's sqlite file directly (python's
  # sqlite3), not through `d1 execute --file`: D1 refuses a statement over 100 KB (SQLITE_TOOBIG) and a real org's rows
  # can be longer (live's k_docs hold docs of 160 KB: one INSERT each), so the old load could never take them. The file is
  # made first by one local D1 call, so it is exactly the file the chain's `--local --persist-to` calls then open.
  npx --yes wrangler d1 execute "$_db" --local --persist-to "$_persist" --config "$_cfg" --command "SELECT 1" --json </dev/null >/dev/null 2>&1
  _verdict=$(python3 - "$_persist" "$_export" <<'PY'
import glob, os, sqlite3, sys
files = [f for f in glob.glob(os.path.join(sys.argv[1], "v3", "d1", "*", "*.sqlite")) if not f.endswith("metadata.sqlite")]
if len(files) != 1: print("FAIL:the local copy's sqlite file is not one file (%d found)" % len(files)); sys.exit()
try:
    db = sqlite3.connect(files[0])
    sql = open(sys.argv[2], encoding="utf-8").read()
    db.executescript(sql)
    db.commit()
    n = sum(1 for _ in filter(None, (l for l in sql.splitlines() if l.startswith("INSERT INTO"))))
    db.close()
    print("OK:%d" % n)
except Exception as e:
    print("FAIL:" + str(e)[:300])
PY
)
  case "$_verdict" in
    OK:*) echo "  ✓ loaded $_db (${_verdict#OK:} rows, into the throwaway copy's sqlite file)" ;;
    FAIL:*) echo "  ✗ load FAILED: ${_verdict#FAIL:}"; return 1 ;;
    *) echo "  ✗ load: unrecognized result — $_verdict"; return 1 ;;
  esac
}

# mdr_apply_chain <db> <persist-dir> <config-file> <migrations-dir>
#   (MDR_FROM=<NNN>, S4: only the files numbered NNN and up — the migrations a ship applies to an org that
#   already holds the earlier ones)
#   applies every migrate-*.sql (sorted) in <migrations-dir> against the local D1 at
#   <persist-dir>. A file already reflected in that copy's own schema fails with SQLite's
#   well-known "already applied" shape (duplicate column name / already exists) and is SKIPPED,
#   never counted as a failure; any OTHER error is real and stops the run (return 1). Sets
#   MDR_APPLIED / MDR_SKIPPED on success.
mdr_apply_chain() {
  _db="$1"; _persist="$2"; _cfg="$3"; _dir="$4"
  MDR_APPLIED=0; MDR_SKIPPED=0
  for f in $(cd "$_dir" && MDR_FROM="${MDR_FROM:-}" python3 -c "
import glob, os, re
lo = os.environ['MDR_FROM']
num = lambda f: re.match(r'migrate-(\d+)', f).group(1)
print('\n'.join(f for f in sorted(glob.glob('migrate-*.sql')) if not lo or int(num(f)) >= int(lo)))"); do
    _out=$(npx --yes wrangler d1 execute "$_db" --local --persist-to "$_persist" --config "$_cfg" --file "$_dir/$f" --json </dev/null 2>&1)
    _verdict=$(printf '%s' "$_out" | python3 -c "
import os,sys
sys.path.insert(0, os.path.join(os.getcwd(), 'tools'))
from lib_wrangler_json import parse_wrangler_json, WranglerJSONError
raw=sys.stdin.read()
try:
    d=parse_wrangler_json(raw)
except WranglerJSONError as e:
    print('PARSEFAIL:'+str(e.args[0])[:200].replace(chr(10),' ')); sys.exit(0)
if isinstance(d, dict) and 'error' in d:
    t=d['error']['text']
    low=t.lower()
    if 'duplicate column name' in low or 'already exists' in low:
        print('SKIP:'+t)
    else:
        print('FAIL:'+t)
else:
    print('OK')
")
    case "$_verdict" in
      OK) MDR_APPLIED=$((MDR_APPLIED+1)); echo "  ✓ $f applied ($_db)" ;;
      SKIP:*) MDR_SKIPPED=$((MDR_SKIPPED+1)); echo "  · $f already applied ($_db) (${_verdict#SKIP:})" ;;
      *) echo "  ✗ $f FAILED ($_db) — ${_verdict#FAIL:}"; return 1 ;;
    esac
  done
  echo "  ✓ migration chain complete ($_db) — $MDR_APPLIED applied, $MDR_SKIPPED already-applied (skipped)"
}

# mdr_d1_query <db> <persist-dir> <config-file> <sql> — one local query, JSON results only ([] rows).
mdr_d1_query() {
  npx --yes wrangler d1 execute "$1" --local --persist-to "$2" --config "$3" --command "$4" --json </dev/null 2>/dev/null \
    | python3 -c "
import os,sys
sys.path.insert(0, os.path.join(os.getcwd(), 'tools'))
from lib_wrangler_json import parse_wrangler_json, WranglerJSONError
import json
try:
    d=parse_wrangler_json(sys.stdin.read())
except WranglerJSONError:
    print('[]'); sys.exit()
if isinstance(d, dict) and 'error' in d:
    print('[]'); sys.exit()
print(json.dumps(d[0]['results'] if d else []))
"
}
