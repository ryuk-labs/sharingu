-- 017 (schema audit sweep/schema): additive indexes only — every one below is
-- CREATE INDEX IF NOT EXISTS, no table rewrites, no dropped indexes, no data
-- changes. Each is justified against one or more measured hot queries in
-- src/index.js / src/area.js (see scratchpad schema-audit.md for the full
-- reasoning, the query census, and the recommendations that did NOT make it
-- into this file because they need something bigger than an index).

-- events(created_at) — plain ascending index. SQLite can walk it backwards to
-- satisfy "ORDER BY created_at DESC" directly, and — because both queries
-- below pair the order with a LIMIT — it lets the engine stop as soon as
-- enough rows have passed the residual filter instead of scanning the whole
-- table and sorting afterward. Serves:
--   * GET /audit (src/index.js ~L1130) — the Activity/org-pure trail:
--     ORDER BY e.created_at DESC LIMIT ?, with eval=0/mind!=1/kind exclusions
--     applied as row filters that no leftmost-prefix index can pre-narrow.
--   * heartbeatFor() / MCP `heartbeat` (src/index.js ~L750) — "what landed
--     since you were last here": WHERE e.created_at > ? ... ORDER BY
--     e.created_at DESC LIMIT 40. Runs on effectively every agent heartbeat.
--   * GET /log (src/index.js ~L2235) — same created_at range + DESC + LIMIT
--     shape as /audit, owner-only master log.
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- transmission(route, eval, created_at) — the owner-check queue's exact shape.
-- route and eval are both plain equalities in the default (and by-far hottest)
-- call: route='owner' AND eval=0. With both as a leftmost prefix, the engine
-- narrows straight to that one (route, eval) group, and within it rows are
-- already in created_at order — so "ORDER BY created_at DESC LIMIT 200" is
-- satisfied by the index directly; "status != 'closed'" is then just a cheap
-- per-row residual filter, no separate sort step. Serves:
--   * GET /transmission (src/index.js ~L2361 default view, and the
--     ?page=1 owner-queue-cards branch ~L2376) — the transmission list/queue
--     page itself, hit on every load of the owner console.
--   * the same shape with an explicit ?route= still uses this index (route
--     is still a single bound equality); only the ?all=1 view (no route
--     filter at all) falls back to a scan — a deliberate manual override,
--     not the hot default path, so not indexed separately here.
CREATE INDEX IF NOT EXISTS idx_transmission_queue ON transmission(route, eval, created_at);

-- artifacts(created_at) — same reasoning as idx_events_created_at, for the
-- Files page. No existing index sorts artifacts by created_at alone
-- (idx_artifacts_person leads with person_id, which this query does not
-- constrain to one value). Serves:
--   * GET /artifacts (src/index.js ~L1174) — both the signed-in ("owner"
--     query, NOT IN/NOT LIKE noise filter) and the public (group_tag='public'
--     AND the same noise filter) branches: ORDER BY a.created_at DESC LIMIT
--     200. This is the Files page, gated per-page-load.
--   * GET /artifacts JSON, ?all=1 branch (src/index.js ~L2558): ORDER BY
--     a.created_at DESC LIMIT 50, no WHERE at all.
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);

-- loops(status, ref) WHERE ref IS NOT NULL — partial index: most loops never
-- carry a ref (migrate-014 added the column; it is optional), so a partial
-- index over just the ref'd rows stays small and precise. status='open' is
-- the leftmost equality both callers use; ref is then either constrained by
-- IS NOT NULL/!= '' (satisfied by the partial predicate itself) or bound by
-- an exact ref=? (SQLite can use a partial index "WHERE ref IS NOT NULL" to
-- serve "ref = ?" — any binding that matches is provably non-null). Serves:
--   * GET /eagle/claims (src/index.js ~L1558) — WHERE status='open' AND ref
--     IS NOT NULL AND ref != '' ORDER BY opened_at — the Eagle canvas's
--     whole-board claims list, cache-control 60s so polled repeatedly.
--   * openClaimsFor() in src/area.js (~L125), the work-packet's claims
--     lookup for one ref — WHERE status='open' AND ref = ? — called on every
--     GET /area/:ref and MCP area_brief.
CREATE INDEX IF NOT EXISTS idx_loops_ref_open ON loops(status, ref) WHERE ref IS NOT NULL;
