-- migrate-058.sql — a project declares what it holds, and a goal how sure it is (sprint 3, D1b items 18 and 19; the owner's
-- rulings of 2026-10-02: ryuklabs holds no product model, by design; a measure can be ruled absent for now). EXPAND-ONLY: three
-- new nullable columns; no existing column, row, index or trigger changes, no new index, no new trigger. Kept apart from
-- migrate-057 (which drops triggers and must run again after a chain replay re-runs 054): a file of ALTERs is skipped whole
-- by a replay once its first ALTER is applied, so the two never share a file.
--   · k_aim.product_model: null, or {"none": true, "why": "<the ruling>"} — the project holds no product model by design
--     (operations or go-to-market only). The Map says so with what the project does hold; tools/audit/project-audit.mjs
--     raises no "no top level of the model" for it. Filed through preview then file as the aim's `productModel`.
--     (A measure ruled absent needs no column: the aim's measure takes {"none": true, "why": …} in its own JSON.)
--   · k_goals.as_of, k_goals.confidence: when a goal was true or last checked (YYYY-MM-DD) and how sure it is (confirmed ·
--     direction · proposal · unknown), as the aim, cards and docs carry them; Goals marks a proposal or a direction.
-- WRITE COST: zero for a row that does not carry them (a new nullable column holds NULL in every existing row; the knowledge
-- door writes one only when an op sends it). No trigger reads them.
-- ORDER: live BEFORE the code (the knowledge door names every column of the registry: the new code on the old schema refuses
-- every aim and goal write). The old code on the new schema runs unchanged.

ALTER TABLE k_aim ADD COLUMN product_model TEXT CHECK (product_model IS NULL OR json_valid(product_model));
ALTER TABLE k_goals ADD COLUMN as_of TEXT;
ALTER TABLE k_goals ADD COLUMN confidence TEXT;
