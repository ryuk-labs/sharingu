-- migrate-059.sql — a card says where it was recorded (sprint 3, D2 · B7: a card's own page shows its fields, its source, its
-- confidence, its as-of date and who may read it). EXPAND-ONLY: one new nullable column; no existing column, row, index or
-- trigger changes, no new index, no new trigger.
--   · k_cards.source: where the card was recorded, the SAME small shape migrate-055 gave questions, goals, docs and the aim (a
--     JSON list of at most 10 {kind, ref, label?}, kind one of url, file, artifact, thread, commit; checked at the door,
--     src/knowledge/schema.js KINDS.card, the json column's fix). JSON: it is only shown (the card's page), never filtered or
--     aggregated. NULL: not said.
-- WRITE COST: zero for a row that does not carry it (a new nullable column holds NULL in every existing row; the knowledge
-- door writes it only when an op sends it, and an unchanged row writes nothing). No trigger reads it: a write of it moves no
-- tally (k_fill, the stale marks, the search index k_find, the versions).
-- ORDER: applied live with tools/migrate.sh (a bookmark first) BEFORE the code that reads it ships: the knowledge door's
-- upsert and its reads name every column of the registry, so the new code on the old schema refuses every card write (no
-- such column). The old code on the new schema runs unchanged (it never names it).
-- REPLAY (tools/migrate-dryrun.sh): migrate-031/032 rebuild no k_* table, so a replay skips this file whole once its one
-- ALTER is applied, and nothing is lost.

ALTER TABLE k_cards ADD COLUMN source TEXT CHECK (source IS NULL OR json_valid(source));
