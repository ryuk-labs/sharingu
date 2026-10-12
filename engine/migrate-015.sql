-- 015 (2026-08-31, ADR-084 §2 the trace-dump seam · ADR-085 §2 the INSIGHT kind's `about`):
-- trace   — an artifact id (banked group:trace), sanitized the same way `report` already
--           is (slice to 60 chars, no format validation beyond that). Strictly opt-in per
--           contribution, never graded — the gate never reads this column.
-- about   — free text <=120 chars: the insight kind's claim summary ("about a person · the
--           business · the vision · an area", ADR-085 §1). Persisted for any kind, read for
--           insight.
ALTER TABLE transmission ADD COLUMN trace TEXT;
ALTER TABLE transmission ADD COLUMN about TEXT;
