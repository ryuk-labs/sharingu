-- migrate-023 — weight-by-outcome (M-ADR-021 fine-tune): a contribution can carry
-- a numeric `outcome` (realized units — e.g. "8 calls booked") alongside its
-- activity row. Additive, one column:
--   outcome — realized units for this contribution, nullable. Absent (NULL) means
--             the row carries no outcome number; deriveGoals (src/goals.js) then
--             falls back to its byte-safety default (1 for a normal node, 0 for an
--             outcomeMetric node — never blocks, never re-grades). Never validated
--             or graded — same free-form discipline as `expected`/`actual`
--             (migrate-022). R records the number; it never computes it.
ALTER TABLE transmission ADD COLUMN outcome REAL;
