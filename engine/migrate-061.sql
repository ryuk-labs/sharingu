-- migrate-061.sql — the week of work reads the work alone (sprint 3, L3 item 3). EXPAND-ONLY: one new partial index; no table,
-- column, row or trigger changes.
--   · idx_transmission_contrib ON transmission(project, created_at) WHERE COALESCE(kind,'') NOT IN ('grade','knowledge'): the
--     project's contributions by when they were filed, never a grade or a knowledge write (the two RECORD kinds, marked by
--     transmission.kind). Home's and Build's week (src/hotsql.js WEEK_SQL arm A) walked the 7-day range of
--     idx_transmission_project, where a grading run or an import of knowledge writes outnumbers the work (sharingu: 478 rows
--     read for its week, most of them grades); on this index the walk reads the week's contributions alone. What changed
--     (src/extract.js, the page's read) reads the same range, beside idx_transmission_knowledge's, to list the work and the
--     knowledge writes without the grades.
-- WRITE COST: one more index row per contribution row filed (a grade or a knowledge write adds none).
-- ORDER: BEFORE the code. The code names the index with INDEXED BY, so a database without it refuses the statement (no such
-- index); the old code on the new schema runs unchanged.

CREATE INDEX IF NOT EXISTS idx_transmission_contrib ON transmission(project, created_at) WHERE COALESCE(kind,'') NOT IN ('grade','knowledge');
