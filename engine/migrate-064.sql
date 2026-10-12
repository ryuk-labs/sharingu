-- migrate-064.sql — money on goals and refs on cards (sprint 4, F1; owner MCQ 2026-10-05: both in one migration, so the
-- schema moves once). EXPAND-ONLY: two new nullable columns; no existing column, row, index or trigger changes, no new
-- index, no new trigger.
--   · k_goals.budget: what a goal holds of money, {allocated, spent, currency, source} (numbers 0 or more, currency an
--     ISO-4217 code, source where the figures come from; checked at the door, src/knowledge/schema.js KINDS.goal). JSON: the
--     Goals read rolls it up the tree in JavaScript over the tree it already reads whole (src/knowledge/goals.js goalTree,
--     one statement on the primary key), so it is never filtered or aggregated in SQL. NULL: no budget said.
--   · k_cards.refs: the cards a card relies on, ["card/<kind>/<id>", …] (at most 12, each a card of the same project;
--     checked at the door against the project's own cards). JSON: read only with its own card (the card's page and `read`
--     look the named cards up by their primary key); no tab's list reads it. NULL: it names none.
-- NO INDEX, and why: the roll-up reads the whole tree by (project, id), the primary key, as it did before; a card's refs are
-- read with the card itself and resolved by the named cards' primary key (project, kind, id). Nothing reads either column
-- by its value.
-- WRITE COST: zero for a row that does not carry them (a new nullable column holds NULL in every existing row; the knowledge
-- door writes one only when an op sends it, and an unchanged row writes nothing). No trigger reads them: a write of either
-- moves no tally (k_fill, the stale marks, the search index k_find, the versions' counts).
-- ORDER: applied live with tools/migrate.sh (a bookmark first) BEFORE the code that reads them ships: the knowledge door's
-- upsert names every column of the registry, so the new code on the old schema refuses every goal and card write (no such
-- column). The old code on the new schema runs unchanged (it never names them; its reads are SELECT t.*).
-- REPLAY (tools/migrate-dryrun.sh): migrate-031/032 rebuild no k_* table, so a replay skips this file whole once its two
-- ALTERs are applied, and nothing is lost.

ALTER TABLE k_goals ADD COLUMN budget TEXT CHECK (budget IS NULL OR json_valid(budget));
ALTER TABLE k_cards ADD COLUMN refs TEXT CHECK (refs IS NULL OR json_valid(refs));
