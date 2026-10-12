-- migrate-055.sql — a filed ruling says where it was recorded, and the aim and the GTM template say when and how sure (sprint
-- 3, the one-pass fix of the first real fill's findings, fix 6 and fix 9; owner ruling 2026-10-01). EXPAND-ONLY: eight new
-- nullable columns; no existing column, row, index or trigger changes, no new index, no new trigger.
--   · k_questions.source, k_goals.source, k_docs.source, k_aim.source: where the item was recorded, the SAME small shape as a
--     contribution's source (src/shapes.js): a JSON list of at most 10 {kind, ref, label?}, kind one of url, file, artifact,
--     thread, commit; checked at the door (src/knowledge/schema.js KINDS, the json column's fix). JSON: it is only shown (the
--     question's page, the goal's page), never filtered or aggregated. NULL: not said.
--   · k_aim.as_of, k_aim.confidence, k_gtm.as_of, k_gtm.confidence: when the aim (or the GTM template) was true or last checked
--     (YYYY-MM-DD) and how sure it is (confirmed · direction · proposal · unknown), as cards and docs carry them (migrate-047).
-- WRITE COST: zero for a row that does not carry them. A new nullable column holds NULL in every existing row (SQLite writes
-- no row to add it); the knowledge door writes it only when an op sends it (an upsert merges: an absent field keeps its stored
-- value, and an unchanged row writes nothing, src/knowledge/write.js). No trigger reads these columns, so a write of them
-- moves no tally (k_fill, the stale marks, the versions). An import that sends none of them writes exactly the rows it wrote
-- before this file.
-- ORDER: applied live with tools/migrate.sh (a bookmark first) BEFORE the code that reads it ships: the knowledge door's
-- upsert and its reads name every column of the registry, so the new code on the old schema refuses every question, goal,
-- doc, aim and GTM write (no such column). The old code on the new schema runs unchanged (it never names them).
-- REPLAY (tools/migrate-dryrun.sh): migrate-031/032 rebuild none of these five tables (they are migrate-039's), so a replay
-- skips this file whole once its first ALTER is applied, and nothing is lost.

ALTER TABLE k_questions ADD COLUMN source TEXT CHECK (source IS NULL OR json_valid(source));
ALTER TABLE k_goals ADD COLUMN source TEXT CHECK (source IS NULL OR json_valid(source));
ALTER TABLE k_docs ADD COLUMN source TEXT CHECK (source IS NULL OR json_valid(source));
ALTER TABLE k_aim ADD COLUMN source TEXT CHECK (source IS NULL OR json_valid(source));
ALTER TABLE k_aim ADD COLUMN as_of TEXT;
ALTER TABLE k_aim ADD COLUMN confidence TEXT;
ALTER TABLE k_gtm ADD COLUMN as_of TEXT;
ALTER TABLE k_gtm ADD COLUMN confidence TEXT;
