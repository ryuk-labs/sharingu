-- migrate-060.sql — a tab's lists cost nothing on a tab no card kind names (sprint 3, D2b item 10). EXPAND-ONLY: one new
-- index; no table, column, row or trigger changes.
--   · idx_k_card_kinds_tab ON k_card_kinds(project, tab): every tab's main page asks which card kinds name it (src/tablists.js
--     TAB_KINDS_SQL). Without it the read walked the project's whole k_card_kinds range (every kind, on every tab, even one no
--     kind names); on it a tab no kind names reads no row, and a tab some kinds name reads those kinds alone.
-- WRITE COST: one more index row per card kind written (a project holds a handful; the importer files them once).
-- ORDER: either side of the code (the code names the index with INDEXED BY, so it must be live BEFORE the code; the old code
-- on the new schema runs unchanged).

CREATE INDEX IF NOT EXISTS idx_k_card_kinds_tab ON k_card_kinds(project, tab);
