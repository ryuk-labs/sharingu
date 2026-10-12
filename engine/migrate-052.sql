-- migrate-052.sql — a card kind's shelf life (sprint 3, B4: stale by age; docs/plan/MCP.md §9 demand 7). EXPAND-ONLY: one new
-- nullable column; no row, index or trigger changes. Applied live with tools/migrate.sh (a bookmark first), BEFORE the code:
-- the knowledge door's upsert of a card kind names every column of the registry (src/knowledge/schema.js KINDS.card_kind).
--   · k_card_kinds.review_after_days: how many days a card of this kind stays fresh after its as_of before it is "due for
--     review" (card_kind.reviewAfterDays, a whole number from 1 to 3650, checked at the door). NULL: the default (90 days,
--     src/knowledge/fresh.js REVIEW_DAYS_DEFAULT). Docs take the default. Staleness by age is computed on read from as_of; no
--     trigger, no write.
-- B4's other changes are migrate-053.sql (the contribution's pick-up columns) and migrate-054.sql (stale by change, the Goals
-- month). Three files, not one, because of the replay rule (tools/migrate-dryrun.sh, migrate-031/032): a file whose first
-- ALTER is already applied is skipped WHOLE on a replay, so an ALTER on a table migrate-031 never rebuilds (this one) cannot
-- share a file with the triggers that migrate-031/032 drop and a replay must put back (054), nor with the transmission
-- columns migrate-031's rebuild drops and a replay must add again (053).

ALTER TABLE k_card_kinds ADD COLUMN review_after_days INTEGER;
