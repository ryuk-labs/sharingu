-- migrate-022 — the Goals Engine spine (M-ADR-020: R generalizes from a fixed
-- product-tracker to an org-goal engine; PRD 00_DESIGN/goals-engine-prd.md, G1).
-- Additive, three columns + one index:
--   goal_ref — which node in the org's SERVED goal tree this contribution moves
--              (tenant.js goals.tree, or the seam's 4-axis default). Validated at
--              the door like screens/components (src/goals.js verifyGoalRef): an
--              unknown ref still records with a loud note (R3, never blocks); an
--              absent ref records as unaligned, no note. Stored VERBATIM either
--              way — same discipline as the existing `screens` column.
--   expected — the gtm dimension's declared outcome (reach/replies/…) at filing
--              time, free text, capped. Any lane may carry it; never graded.
--   actual   — a later update to the same claim, free text, capped. Never graded.
-- R records + expects; it never performs the work (M-ADR-007a).
ALTER TABLE transmission ADD COLUMN goal_ref TEXT;
ALTER TABLE transmission ADD COLUMN expected TEXT;
ALTER TABLE transmission ADD COLUMN actual TEXT;
CREATE INDEX IF NOT EXISTS idx_transmission_goalref ON transmission(goal_ref);
