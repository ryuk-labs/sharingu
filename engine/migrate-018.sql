-- 018 (eff/door, schema audit sweep/schema finding 3): a normalized ref index for
-- the work-packet's "prior transmissions" lookup. ADDITIVE ONLY — every statement
-- below is CREATE TABLE/INDEX IF NOT EXISTS: no drops, no rewrites, no updates to
-- any existing row.
--
-- The problem (finding 3): area.js's priorTransmissionsFor() and its twin in GET
-- /transmission?ref= both matched a canonical ref against transmission via
-- `gaprefs LIKE '%x%' OR screens LIKE '%x%' OR components LIKE '%x%'` — a
-- leading-wildcard LIKE, which defeats a B-tree by SQLite's own rule. Confirmed via
-- EXPLAIN QUERY PLAN against the reconstructed schema (same method the schema-audit
-- sweep used for migrate-017): that query is a full `SCAN transmission` before or
-- after any CREATE INDEX — not index-fixable, hit on every GET /area/:ref, MCP
-- area_brief, and GET /transmission?ref= call.
--
-- Why a normalized child table and not FTS5 (the audit named both options): the
-- values being matched — "screen:041A", "c/comp-id", "mind/worker", "q/AR1" — are
-- opaque identifiers, never natural-language text. FTS5's default tokenizer splits
-- on ':' and '/', so "screen:041A" indexes as the separate tokens "screen" and
-- "041a" — a MATCH query would either over-match (any row mentioning "041a" in ANY
-- unrelated context) or need a custom tokenizer just to recover exact-token
-- matching, which is real complexity spent on relevance ranking / stemming this use
-- case never wants. A plain child table with one row per ref token gives an exact,
-- index-backed `ref = ?` lookup directly. Simpler AND correct — FTS5 would have
-- been ceremony here.
--
-- transmission_refs is populated at file-time going forward by
-- fileTransmission()/fileTransmissionsBatch() (src/index.js), and for rows filed
-- before this migration by the one-shot POST /backfill-refs (owner; see
-- backfillRefs() in src/index.js). transmission_refs_meta.backfill_horizon is the
-- one-way flag that tells the read path (area.js matchingTransmissionIds) it can
-- stop falling back to the old LIKE scan for rows the normalized table doesn't
-- (yet) cover — until that backfill has run, the fallback keeps running so a
-- pre-migration ref match is never silently lost.
CREATE TABLE IF NOT EXISTS transmission_refs (
  tid TEXT NOT NULL REFERENCES transmission(id),
  ref TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transmission_refs_ref ON transmission_refs(ref);
CREATE INDEX IF NOT EXISTS idx_transmission_refs_tid ON transmission_refs(tid);

CREATE TABLE IF NOT EXISTS transmission_refs_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
