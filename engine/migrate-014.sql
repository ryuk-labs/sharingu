-- 014 (2026-08-31, PRD 02_AGENT_R/prd-work-loop.md B3): loops carry an optional
-- canonical REF (screen:NNN · c/<id> · q/<id> · mind/<area>), stored verbatim, so an
-- open loop can be claimed against a specific area-brief coordinate. Lights up
-- src/area.js's openClaimsFor() feature-detect (was catching the "unknown column"
-- throw and degrading to []) and GET /eagle/claims. A claim is a courtesy signal,
-- never a lock (ADR-082 §2) — this column carries no uniqueness constraint.
ALTER TABLE loops ADD COLUMN ref TEXT;
