-- migrate-037.sql — build0925:d1-hot-queries (2026-09-25). EXPAND-ONLY: five CREATE INDEX IF NOT EXISTS. No table
-- rewrite, no dropped index, no row touched. The worker version before this migration and the one after both run
-- correctly with or without it (engine/BUILD.md §Migrations). Applied live by the SESSION via tools/migrate.sh (a
-- human verb), never by a dev run.
--
-- WHY: the top D1 readers on ryuklabs-agent-r, 2026-09-25 (Cloudflare d1QueriesAdaptiveGroups, rows read /
-- executions). Each index below names the hot query it serves. The query text lives in src/hotsql.js,
-- src/tenant.js and src/core.js, and tools/d1-hot-selftest.mjs (a gate step) EXPLAINs those exact strings against
-- boot.sql plus this file:
--   #5  /control devices (229,528 / 120): tokens WHERE revoked=0 ORDER BY created_at DESC LIMIT 200, previously a
--       whole-table scan plus a sort. Now a backwards walk that stops at the LIMIT.
--   #6  open-loops count (150,609 / 190): COUNT(*) FROM loops WHERE status='open', previously a whole-table scan.
--       Now a covering-index count over the open range only. The leaderboard's closed-claims subquery reads the
--       same index.
--   #7  owner lookup (119,870 / 972): people WHERE role='owner' AND active=1 ORDER BY created_at LIMIT 1. Now a
--       one-row read (it also runs once per request now, src/reqmemo.js).
--   #2  leaderboard decides (part of 701,356 / 194): approval_audit GROUP BY decided_by, now a narrow covering
--       index.
--   #4  /audit events (277,107 / 39): a PARTIAL index whose WHERE is exactly the audit's three fixed exclusions
--       (src/hotsql.js AUDIT_INDEXED_CLAUSES). The created_at walk only visits rows that already pass them and stops
--       at the LIMIT. It used to step through every session_open / fragment / file / mind / eval row on the way.
--       SQLite uses a partial index only when the query's WHERE contains each index term, so this text and
--       hotsql.js must agree. The selftest fails the gate if they drift.
-- Hot #1 and #3 (the orphan counts and the eval-seat audit) are NOT engine queries: they come from the brain repo's
-- board probe (source/board/probes/ryuklabs_d1_integrity.py). That fix belongs to the session, in that repo.
CREATE INDEX IF NOT EXISTS idx_people_owner ON people(role, active, created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_live ON tokens(revoked, created_at);
CREATE INDEX IF NOT EXISTS idx_loops_status ON loops(status, person_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_decided_by ON approval_audit(decided_by);
CREATE INDEX IF NOT EXISTS idx_events_audit ON events(created_at) WHERE kind NOT IN ('session_open','exit','fragment','file') AND COALESCE(json_extract(payload_json,'$.mind'),0) != 1 AND COALESCE(json_extract(payload_json,'$.eval'),0) = 0;
