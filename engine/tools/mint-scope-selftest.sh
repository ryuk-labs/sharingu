#!/bin/sh
# tools/mint-scope-selftest.sh — the OFFLINE proof that the fixed eval seats are seated ONLY on ryuklabs' own
# workspaces (owner ruling QB54D2BC4, 2026-09-25: steer clear of other projects; batch eval-seat-scope, C4d).
# A gate step. Sources tools/lib-mint-seat.sh with mint_d1 STUBBED to capture the SQL (no wrangler, no D1, no network;
# MINT_MODE=local + a fake MINT_LOCAL_URL so mint_resolve_url never calls Cloudflare) and asserts:
#   a  every `INSERT INTO project_seats` carries `org = <the suites' org> AND slug IN (<MINT_PROJECTS>)` — the suites' own
#      org's projects alone (sprint 6, 6.6), never the unscoped `WHERE active=1` and never a key of org 1
#   b  a scoped prune `DELETE FROM project_seats WHERE person_id='eval-fixed-suites-<r>' AND project_key NOT IN (<the suites'
#      org's projects on the list>)` exists for owner, member, leader and thiyag, and no DELETE names any id outside eval-fixed-*
#   c  eval-fixed-suites-tester gets no project_seats INSERT (it stays seatless)
#   d  MINT_PROJECTS='' makes mint_all return non-zero with NO mint_d1 call
#   f  mint_sweep (its own probe) carries `DELETE FROM project_seats WHERE person_id='eval-fixed-suites-tester';` — the
#      backstop for a mid-run single-seat grant (U-READY-e) — and every DELETE it issues names that person alone
#   g  the seats live in the suites' own org (sprint 6, 6.6): every people INSERT carries that org (never org 1), every people
#      UPDATE is held to it, the org is the one marked settings.suites (never id 1), and its first project is an eval one
# MINT_SCOPE_SELFTEST_LIB (optional) points at a MUTANT lib-mint-seat.sh — how the PR proves each check can fail. (Check e,
# the drift against the suite's brains json, went with that json in D6a.)
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"
LIB="${MINT_SCOPE_SELFTEST_LIB:-$ENGINE/tools/lib-mint-seat.sh}"
T="$(mktemp -d "${TMPDIR:-/tmp}/ar-mint-scope.XXXXXX")"
trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

# run_mint [MINT_PROJECTS override…] — sources the lib in a clean sh, stubs mint_d1, runs mint_all; the captured SQL
# lands in $T/captured.sql (absent = mint_d1 was never called) and the rc in $T/rc
run_mint() {
  rm -f "$T/captured.sql" "$T/rc"
  cat > "$T/probe.sh" <<'SH'
. "$MS_LIB"
[ "${MS_OVERRIDE+x}" = x ] && MINT_PROJECTS="$MS_OVERRIDE"
mint_d1() { cp "$1" "$MS_T/captured.sql"; }
mint_all >/dev/null 2>&1; echo "$?" > "$MS_T/rc"
echo "LIST=[$MINT_PROJECTS]"
SH
  if [ $# -gt 0 ]; then
    env -i HOME="$T" PATH="$PATH" TMPDIR="$T" MS_LIB="$LIB" MS_T="$T" MS_OVERRIDE="$1" MINT_MODE=local MINT_LOCAL_URL=http://x sh "$T/probe.sh"
  else
    env -i HOME="$T" PATH="$PATH" TMPDIR="$T" MS_LIB="$LIB" MS_T="$T" MINT_MODE=local MINT_LOCAL_URL=http://x sh "$T/probe.sh"
  fi
}

LISTLINE=$(run_mint)
LIST=$(printf '%s\n' "$LISTLINE" | sed -n 's/^LIST=\[\(.*\)\]$/\1/p')
RC=$(cat "$T/rc" 2>/dev/null)
SQL="$T/captured.sql"
if [ "$RC" != 0 ] || [ ! -s "$SQL" ]; then
  bad "mint_all did not run cleanly against the stub (rc=$RC) — every check below is void"
  echo "mint-scope-selftest: $pass pass · $fail fail"; exit 1
fi
# the IN-list the SQL must carry, built the way the lib's own q() quotes it
IN=$(printf '%s\n' "$LIST" | tr ' ' '\n' | grep . | sed "s/'/''/g; s/.*/'&'/" | paste -sd, -)
IN="($IN)"
EORG="(SELECT id FROM org WHERE id <> 1 AND json_extract(settings, '\$.suites') = 1 ORDER BY id LIMIT 1)"

# a
NINS=$(grep -c '^INSERT INTO project_seats' "$SQL")
NSCOPED=$(grep '^INSERT INTO project_seats' "$SQL" | grep -cF "WHERE active=1 AND org = $EORG AND slug IN $IN ")
{ [ "$NINS" -gt 0 ] && [ "$NINS" = "$NSCOPED" ]; } \
  && ok "a every project_seats INSERT ($NINS) is scoped: the suites' org, slug IN $IN" \
  || { bad "a unscoped seat INSERT ($NSCOPED of $NINS scoped to $IN)"; grep '^INSERT INTO project_seats' "$SQL" | sed 's/^/        /'; }

# b
MISS=""
for r in owner member leader thiyag; do
  grep -qxF "DELETE FROM project_seats WHERE person_id='eval-fixed-suites-$r' AND project_key NOT IN (SELECT key FROM projects WHERE org = $EORG AND slug IN $IN);" "$SQL" || MISS="$MISS $r"
done
FOREIGN=$(grep -i '^DELETE' "$SQL" | grep -v "person_id='eval-fixed-suites-[a-z]*' AND project_key NOT IN " )
{ [ -z "$MISS" ] && [ -z "$FOREIGN" ]; } \
  && ok "b a scoped prune per seated fixed id (owner member leader thiyag), no DELETE outside eval-fixed-*" \
  || { bad "b prune missing for [${MISS# }] or a foreign DELETE:"; printf '%s\n' "$FOREIGN" | sed 's/^/        /'; }

# c
grep -q "^INSERT INTO project_seats.*'eval-fixed-suites-tester'" "$SQL" \
  && bad "c eval-fixed-suites-tester got a project_seats INSERT (it must stay seatless)" \
  || ok "c eval-fixed-suites-tester gets no project_seats INSERT"

# d
run_mint "" >/dev/null
RC=$(cat "$T/rc" 2>/dev/null)
{ [ -n "$RC" ] && [ "$RC" != 0 ] && [ ! -e "$T/captured.sql" ]; } \
  && ok "d MINT_PROJECTS='' -> mint_all returns $RC before any D1 write" \
  || bad "d MINT_PROJECTS='' -> rc=$RC, mint_d1 called: $([ -e "$T/captured.sql" ] && echo yes || echo no)"

# f — mint_sweep, not mint_all: b's FOREIGN filter would (rightly) flag an unscoped DELETE placed in mint_all
rm -f "$T/sweep.sql"
cat > "$T/probe-sweep.sh" <<'SH'
. "$MS_LIB"
mint_d1() { cp "$1" "$MS_T/sweep.sql"; }
mint_sweep >/dev/null 2>&1
SH
env -i HOME="$T" PATH="$PATH" TMPDIR="$T" MS_LIB="$LIB" MS_T="$T" MINT_MODE=local MINT_LOCAL_URL=http://x sh "$T/probe-sweep.sh"
TLINE="DELETE FROM project_seats WHERE person_id='eval-fixed-suites-tester';"
if [ ! -s "$T/sweep.sql" ]; then
  bad "f mint_sweep issued no SQL through mint_d1"
else
  SFOREIGN=$(grep -i '^[[:space:]]*DELETE' "$T/sweep.sql" | grep -vxF "$TLINE")
  { grep -qxF "$TLINE" "$T/sweep.sql" && [ -z "$SFOREIGN" ]; } \
    && ok "f mint_sweep deletes eval-fixed-suites-tester's project_seats, and its DELETEs name no other person" \
    || { bad "f mint_sweep: tester DELETE $(grep -qxF "$TLINE" "$T/sweep.sql" && echo present || echo MISSING); foreign DELETE:"; printf '%s\n' "$SFOREIGN" | sed 's/^/        /'; }
fi

# g — the suites' own org (sprint 6, 6.6): the people rows land there, never in org 1
run_mint >/dev/null
NPI=$(grep -c '^INSERT OR IGNORE INTO people' "$SQL"); NPIO=$(grep '^INSERT OR IGNORE INTO people' "$SQL" | grep -cF ",$EORG);")
NPU=$(grep -c '^UPDATE people' "$SQL"); NPUO=$(grep '^UPDATE people' "$SQL" | grep -cF "AND org = $EORG;")
NORG=$(grep -c "^INSERT INTO org (id, name, settings, created_at, updated_at) SELECT n, 'Suites', '{\"suites\":true}'.*WHERE NOT EXISTS (SELECT 1 FROM org WHERE id <> 1 AND json_extract(settings, '\$.suites') = 1);" "$SQL")
NPROJ=$(grep "^INSERT INTO projects" "$SQL" | grep -cF ", 1 WHERE NOT EXISTS (SELECT 1 FROM projects WHERE org = $EORG AND slug IN $IN);")
{ [ "$NPI" = 5 ] && [ "$NPIO" = 5 ] && [ "$NPU" = 5 ] && [ "$NPUO" = 5 ] && [ "$NORG" = 1 ] && [ "$NPROJ" = 1 ] && ! grep -qE "^INSERT OR IGNORE INTO people.*,1\);$" "$SQL"; } \
  && ok "g the 5 seats are inserted ($NPIO) and activated ($NPUO) in the suites' org alone (settings.suites, never id 1), made with its eval project when missing" \
  || { bad "g the suites' org: people inserts $NPIO/$NPI, updates $NPUO/$NPU held to it, org made $NORG, eval project $NPROJ"; grep -E '^(INSERT OR IGNORE INTO people|UPDATE people|INSERT INTO org|INSERT INTO projects)' "$SQL" | head -4 | cut -c1-48 | sed 's/^/        /'; }

echo "mint-scope-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
