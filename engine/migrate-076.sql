-- migrate-076.sql — the plan's running counters (sprint 8, 8.2; docs/plan/PLATFORM.md §4 sprint 8: "every write checks the plan: a
-- warning at 80%, a clear refusal at 100% with its error code; reads are never refused; the per-minute burst limit per org").
-- EXPAND ONLY (PLATFORM §5): one table made, one index added, nothing renamed, nothing dropped; the old code names neither.
--   1 · org_usage: ONE row per org, holding the three windows its counted events fall in (src/plans.js reads and writes it, each
--       window a UTC string as plans.js cuts it):
--         day / calls_day         the door's calls on that UTC day ('YYYY-MM-DD'): every MCP tools/call and every signed-in
--                                 REST write (src/mcp.js, src/index.js); a page GET is a read and never counted
--         minute / calls_minute   the same calls in that UTC minute ('YYYY-MM-DDTHH:MM'): the burst
--         month / items_month     the ledger rows filed in that UTC month ('YYYY-MM'): contributions, knowledge writes, grades
--                                 (src/core.js fileTransmission / fileTransmissionsBatch, in the filing's own D1 batch)
--       Each counted event is ONE upsert of the org's ONE row (one row written: D1 bills rows written), and a newer window
--       starts its count over in the same statement, so the table holds one row per org forever and nothing prunes it. The
--       org's row of `org` names the org (no REFERENCES: tools/org-undo.mjs places the table by its org column).
--   2 · idx_people_org_held: the org's HELD seats, a covering count (people(org, active, pending) WHERE active + pending >= 1: an
--       active seat or one waiting for its holder's yes; the two columns ride the index so the count never reads a row — a pending seat counts toward the people limit, so consent is no way to park seats). A
--       partial index no other statement's WHERE implies: no statement writes `active + pending`, so no plan of today moves
--       (tools/limits-selftest.mjs EXPLAINs every statement with it and without it).
--   3 · the month's items tally seeded from the ledger's own index (idx_transmission_org_month, migrate-075): each org's
--       filings THIS month (the moment this file runs, UTC), ONE covering range read once. A re-run keeps the larger count of
--       the same month (a filing landed between this file and the code's deploy, by the old code, is counted by the re-run), and
--       a row of a later month is never put back. No CASE here (wrangler's statement splitter, engine/CLAUDE.md): iif.
-- WRITE COST on live: one org_usage row per org that filed this month, the index built once (one entry per held seat).
-- ORDER: BEFORE the code (the new code reads and writes org_usage and the index; the old code names neither). Filings the old
-- code makes between this file and the deploy are not in the tally: run this file again after the deploy to re-true it.
-- Re-runnable: every statement keeps what stands (IF NOT EXISTS; the seed's conflict keeps the larger count of the same month).
-- THE UNDO: the code's rollback alone (the old code never reads either); the table and the index can stay.

-- 1 · the counters, one row per org
CREATE TABLE IF NOT EXISTS org_usage (
  org          INTEGER PRIMARY KEY CHECK (org >= 1),
  day          TEXT NOT NULL DEFAULT '' CHECK (length(day) <= 10),
  calls_day    INTEGER NOT NULL DEFAULT 0 CHECK (calls_day >= 0),
  minute       TEXT NOT NULL DEFAULT '' CHECK (length(minute) <= 16),
  calls_minute INTEGER NOT NULL DEFAULT 0 CHECK (calls_minute >= 0),
  month        TEXT NOT NULL DEFAULT '' CHECK (length(month) <= 7),
  items_month  INTEGER NOT NULL DEFAULT 0 CHECK (items_month >= 0)
);

-- 2 · the held seats' index
CREATE INDEX IF NOT EXISTS idx_people_org_held ON people(org, active, pending) WHERE active + pending >= 1;

-- 3 · this month's items, from the ledger's own index
INSERT INTO org_usage (org, month, items_month)
  SELECT org, substr(created_at, 1, 7), COUNT(*) FROM transmission INDEXED BY idx_transmission_org_month
  WHERE substr(created_at, 1, 7) = strftime('%Y-%m', 'now') AND org >= 1 GROUP BY org
  ON CONFLICT (org) DO UPDATE SET items_month = iif(month = excluded.month, max(items_month, excluded.items_month), excluded.items_month),
    month = excluded.month WHERE excluded.month >= month;
