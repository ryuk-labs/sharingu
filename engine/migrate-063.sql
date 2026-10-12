-- migrate-063.sql — the org's settings ride its own row (sprint 3, D6: the old path deleted). The org's name, brand and home
-- project already have columns (migrate-039); the four org facts the R2 manifest serve/tenant.json used to carry beside them
-- move into ONE small JSON column. EXPAND-ONLY: one new nullable column on org; no row changes.
--   · org.settings: {domain?, evalSeats?, handoffRepo?, traceMandate?} — the worker's public origin (the cron's report links),
--     the org's declared test seats, the repo a handoff files an Issue against, the mandated trace floor. Absent keys read as
--     the product's defaults (src/tenant.js): no domain, no test seats, no repo, no mandate.
-- WRITE COST: none (a column, no row written). A fresh org's seed writes the one org row (tools/lib-r-local.sh,
-- tools/day0-seed.sh); an existing org's row is written once at its ship (name, brand, home and settings read from its old
-- manifest: docs/plan/HANDOFF.md, the ship).
-- ORDER: before or after the code (either side). The code reads the row with SELECT * and a missing column reads as no settings, so the new
-- code runs on the old schema; the old code names no new column.

ALTER TABLE org ADD COLUMN settings TEXT CHECK (settings IS NULL OR json_valid(settings));
