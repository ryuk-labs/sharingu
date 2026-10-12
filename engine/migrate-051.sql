-- migrate-051.sql — when the work really happened (sprint 3; the owner's MCQ 2026-10-01: "keep the filing time true, add the
-- real date beside it"). EXPAND-ONLY: one new nullable column on transmission; no row, index or trigger changes, no tally
-- changes. Applied live with tools/migrate.sh (a bookmark first), BEFORE the code that reads it ships: Build's rows, Home's
-- goals moved and Broadcast's live picture name t.happened_at in their statements.
--   · transmission.happened_at: a contribution's optional happenedAt (src/shapes.js happenedAtOf): a date YYYY-MM-DD as
--     sent, or a UTC date-time stored as toISOString() (created_at's own form). Never in the future and never before
--     2000-01-01 (checked at the door), so it is never later than the row's created_at, which stays the filing time: the
--     record is never backdated. NULL: not said; the work is taken to have happened when it was filed.
--   · No index. The reads that order or window by when the work happened (COALESCE(happened_at, created_at)) keep their
--     created_at range on the index they already walk and add the COALESCE as a filter on the rows of that range (exact,
--     since happened_at <= created_at), or sort the rows they already read in the worker (Build). An index would write a row
--     per filing for a read that does not need it.

ALTER TABLE transmission ADD COLUMN happened_at TEXT;
