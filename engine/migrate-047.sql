-- migrate-047.sql — the registry (sprint 3, B1; docs/plan/MCP.md §4 and §9). EXPAND-ONLY: eight new nullable columns and
-- one partial index; no existing column, row or index changes, no trigger. The worker before this file never reads the
-- new columns; the worker after it reads and writes them through the registry (src/knowledge/schema.js KINDS, the shapes
-- in src/shapes.js), so it needs this file live BEFORE the code (the knowledge door's upsert names every column of the
-- registry, and a contribution's insert names the three new transmission columns). Applied live with tools/migrate.sh
-- (a bookmark first). Columns, not JSON, where a later slice filters, sorts or aggregates on the value in SQL; JSON where
-- the value is only shown.
--   · k_cards.as_of, k_cards.confidence, k_docs.as_of, k_docs.confidence: when a card or a doc was true or last checked
--     (YYYY-MM-DD) and how sure it is (confirmed · direction · proposal · unknown), checked at the door. Columns: B4 ages
--     knowledge by as_of ("stale by age") and the Library (B5) filters by confidence. NULL: not said.
--   · k_card_kinds.tab: the tab a card kind's cards list on (one of the eight tabs' keys), checked at the door. A column:
--     the GTM lists (B7) and the Library (B5) read a project's kinds by tab. NULL: the kind names no tab.
--   · transmission.shape: a contribution's shape fields new in sprint 3, as ONE JSON object (source, depends, open, next,
--     and the GTM lane's audience, claim, channel, experiment), only what was sent, NULL when none was. JSON: they are
--     shown on the contribution's page and read back by read_transmission, never queried.
--   · transmission.next_by, transmission.next_who: the next action's date and who should take it (next.by, next.who, also
--     inside shape). Columns: follow-ups due (B4, B7: next actions with a date, per project, soonest first) and pick-up (B4)
--     query them.
--   · idx_transmission_next_by (project, next_by) WHERE next_by IS NOT NULL: the follow-ups due of ONE project in date
--     order, one index range. Partial: a contribution with no date writes no index row (most of them).

ALTER TABLE k_cards ADD COLUMN as_of TEXT;
ALTER TABLE k_cards ADD COLUMN confidence TEXT;
ALTER TABLE k_docs ADD COLUMN as_of TEXT;
ALTER TABLE k_docs ADD COLUMN confidence TEXT;
ALTER TABLE k_card_kinds ADD COLUMN tab TEXT;
ALTER TABLE transmission ADD COLUMN shape TEXT CHECK (shape IS NULL OR json_valid(shape));
ALTER TABLE transmission ADD COLUMN next_by TEXT;
ALTER TABLE transmission ADD COLUMN next_who TEXT;

CREATE INDEX IF NOT EXISTS idx_transmission_next_by ON transmission(project, next_by) WHERE next_by IS NOT NULL;
