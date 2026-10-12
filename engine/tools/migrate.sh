#!/bin/sh
# tools/migrate.sh <file.sql> — apply ONE D1 migration to ryuklabs' own D1, with a Time Travel bookmark FIRST
# (build0925-engine-safe-ship, 2026-09-25 — brief 02_AGENT_R/next-batch-engine-fast-gate.md item 3).
#
#   0. budget    `sh tools/cf-budget.sh` — refuses at 95% of any free daily limit or when unreadable (Q9CF32D8F).
#   1. bookmark  `wrangler d1 time-travel info <db> --json` — the database's CURRENT bookmark, parsed through the
#                ONE wrangler-json parser (tools/lib_wrangler_json.py, the 2026-09-23 incident). No bookmark →
#                the migration is NOT applied (exit 1). The bookmark is also appended to .runs/migrate.jsonl so
#                it outlives the terminal.
#   2. restore   prints the exact `wrangler d1 time-travel restore <db> --bookmark=<b>` that undoes this apply.
#                A restore returns the WHOLE database to that moment — every write after it is lost, not just
#                this migration's. It is the last resort; the first resort is a forward (contract) migration.
#   3. apply     `wrangler d1 execute <db> --remote --file <file> --json`, its verdict parsed the same way.
#
# A HUMAN verb, like a deploy: `sh tools/ship.sh` never calls this, and no agent run applies a migration live.
# Before it: `sh tools/migrate-dryrun.sh ryuklabs-agent-r` replays the chain against a local copy (read-only on
# remote). Migrations are expand/contract — during a gradual deploy two worker versions share ONE schema
# (engine/BUILD.md §Migrations). Proven OFFLINE by tools/ship-selftest.sh (bookmark strictly before apply; no
# bookmark → no apply), a gate step.
f="$1"
case "$f" in
  *.sql) ;;
  *) echo "usage: sh tools/migrate.sh <file.sql>   (one migration file, applied to ryuklabs-agent-r's own D1)"; exit 2;;
esac
[ -f "$f" ] || { echo "  ✗ no such file: $f"; exit 2; }
f="$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"
cd "$(dirname "$0")/.." || exit 1
[ -f "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}" ] && { set -a; . "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}"; set +a; }
{ [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; } || { echo "  ✗ CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID required — source ~/.sharingu/env-sharingu.sh"; exit 1; }
DB=ryuklabs-agent-r   # the only org worker's own D1 (QC74D4892) — wrangler.jsonc's d1_databases[0]
# the budget guard (Q9CF32D8F): after the argument + env checks, before the first remote call — at 95% of any free
# daily limit, or when today's usage cannot be read, the migration is NOT applied (exit 2)
sh tools/cf-budget.sh || { echo "  ✗ budget guard refused — NOT applying $(basename "$f") (no Cloudflare call made)"; exit 2; }

echo "· bookmark ($DB — wrangler d1 time-travel info)"
bm=$(npx wrangler d1 time-travel info "$DB" --json </dev/null 2>/dev/null | python3 -c '
import re, sys
sys.path.insert(0, "tools")
from lib_wrangler_json import parse_wrangler_json
try:
    d = parse_wrangler_json(sys.stdin.read())
    b = d.get("bookmark", "") if isinstance(d, dict) else ""
except Exception:
    b = ""
print(b if re.fullmatch(r"[0-9a-f][0-9a-f-]{7,}", b or "") else "")')
[ -n "$bm" ] || { echo "  ✗ no Time Travel bookmark could be read for $DB — NOT applying $(basename "$f")"; exit 1; }
echo "  ✓ bookmark $bm"
mkdir -p .runs 2>/dev/null
printf '{"db":"%s","file":"%s","bookmark":"%s","at":"%s"}\n' "$DB" "$(basename "$f")" "$bm" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .runs/migrate.jsonl
echo "  restore (undoes EVERYTHING written after this moment, not only this migration):"
echo "    npx wrangler d1 time-travel restore $DB --bookmark=$bm"

echo "· apply $(basename "$f") → $DB (remote)"
verdict=$(npx wrangler d1 execute "$DB" --remote --file "$f" --json </dev/null 2>&1 | python3 tools/lib_wrangler_json.py --mode apply)
case "$verdict" in
  OK*) echo "  ✓ applied (${verdict#OK } statement result(s))"; echo "✓ MIGRATED — bookmark $bm is the undo"; exit 0;;
  *) echo "  ✗ apply failed: $verdict"
     echo "    a partial apply is possible — inspect first; the undo is: npx wrangler d1 time-travel restore $DB --bookmark=$bm"
     exit 1;;
esac
