-- migrate-049.sql — the day's next contribution id past 999 (sprint 3, B2: a bug the main session hit). EXPAND-ONLY: one new
-- index on transmission, no column, row or trigger changes. A contribution's id is T-<YYYYMMDD>-<n>, n zero-padded to three
-- digits and growing past them: "T-20261001-1000" sorts BEFORE "T-20261001-999" as text, so the old next-id read (the day's
-- top id in text order) answered 999 for ever once a day held a thousand, and every filing after it collided (UNIQUE, a
-- 500) until midnight. src/core.js nextSeqStart now reads the day's top id by its LENGTH, then its text (the numeric
-- order for ids of one prefix); this index serves exactly that read: an equality on the day's prefix, then length and id
-- in order, so the newest id is ONE index row read (EXPLAIN QUERY PLAN: SEARCH ... USING COVERING INDEX
-- idx_transmission_day_seq). The worker does not depend on it: without it the same statement reads the day's ids on the
-- primary key's range and sorts them (correct, slower). One index row written per filing.

CREATE INDEX IF NOT EXISTS idx_transmission_day_seq ON transmission(substr(id, 1, 11), length(id), id);
