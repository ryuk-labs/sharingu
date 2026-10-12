#!/bin/sh
# export-boot-schema.sh — regenerate boot.sql, the canonical FRESH-TENANT schema
# (extraction backlog #1: schema.sql + replaying migrate-002..0NN does NOT apply
# clean — duplicate columns — so day-0 boots from a live-DDL export instead, the
# exact move the ryuklabs boot did by hand on 2026-09-01).
#
# Exports every user table + index DDL from a LIVE org D1 (default: ryuklabs-agent-r,
# the one org worker, QC74D4892) and writes boot.sql at the repo root. Run after ANY migration
# lands; tools/check-boot-schema.py (gate step 7) fails the gate when a migration's
# DDL is missing from boot.sql, so forgetting this is loud, not silent.
# Usage: sh tools/export-boot-schema.sh [d1-database-name]
set -e
DB="${1:-ryuklabs-agent-r}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Sharingu's own three-line env (Q515FB1DB / Q65300E50): the release credential reaches any org's D1
# in this one Cloudflare account — schema-export is a read, no org's own login involved. No pool
# file, no AGENT_R_ENV_PREFIX-driven selection any more.
[ -f "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}" ] && { set -a; . "${SHARINGU_ENV_PATH:-$HOME/.sharingu/env-sharingu.sh}"; set +a; }
{ [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; } || { echo "  ✗ CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID required — source ~/.sharingu/env-sharingu.sh"; exit 1; }

npx --yes wrangler d1 execute "$DB" --remote --json </dev/null \
  --command "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name" \
  > /tmp/boot-schema-export.json

DB="$DB" ROOT="$ROOT" python3 <<'EOF'
import json, os, datetime
rows = json.load(open("/tmp/boot-schema-export.json"))[0]["results"]
out = [
"-- boot.sql — the canonical fresh-tenant schema (GENERATED, do not hand-edit).",
"-- Regenerate: sh tools/export-boot-schema.sh   (source D1: %s, exported %s)" % (
    os.environ["DB"], datetime.date.today().isoformat()),
"-- Why this exists: schema.sql is a DOC mirror and the migrations do not replay",
"-- clean over it (backlog #1). Day-0 applies THIS file to an empty D1:",
"--   npx wrangler d1 execute <db> --remote --file boot.sql",
"-- Gate step 7 (tools/check-boot-schema.py) keeps it honest against migrate-*.sql.",
"",
]
for r in rows:
    sql = r["sql"].strip()
    # IF NOT EXISTS makes re-application harmless (matches schema.sql's own style)
    if sql.upper().startswith("CREATE TABLE ") and "IF NOT EXISTS" not in sql.upper():
        sql = "CREATE TABLE IF NOT EXISTS " + sql[len("CREATE TABLE "):]
    if sql.upper().startswith("CREATE INDEX ") and "IF NOT EXISTS" not in sql.upper():
        sql = "CREATE INDEX IF NOT EXISTS " + sql[len("CREATE INDEX "):]
    if sql.upper().startswith("CREATE UNIQUE INDEX ") and "IF NOT EXISTS" not in sql.upper():
        sql = "CREATE UNIQUE INDEX IF NOT EXISTS " + sql[len("CREATE UNIQUE INDEX "):]
    out.append(sql + ";")
    out.append("")
open(os.path.join(os.environ["ROOT"], "boot.sql"), "w").write("\n".join(out))
print("boot.sql written: %d objects" % len(rows))
EOF
rm -f /tmp/boot-schema-export.json
