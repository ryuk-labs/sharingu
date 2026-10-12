-- 013 (2026-08-31, ADR-074 clarification): the DIGEST twin — compact structured
-- markdown composed by the sender's R alongside the rt-v1.1 report; the brain
-- updates its data and frontend from it. Capped at write time.
ALTER TABLE transmission ADD COLUMN digest TEXT;
