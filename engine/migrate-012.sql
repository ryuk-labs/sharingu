-- 012 (2026-08-31, ADR-074): transmissions carry their GAP REFS (the canvas join —
-- csv of canonical refs like screen:047 · c/<component-id> · q/AR1) and their REPORT
-- (artifact id of the rt-v1.1 report; NULL = backfill target for the cron).
ALTER TABLE transmission ADD COLUMN gaprefs TEXT;
ALTER TABLE transmission ADD COLUMN report TEXT;
