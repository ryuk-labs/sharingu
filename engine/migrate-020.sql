-- migrate-020 — standing trace consent (ADR-102 §2, owner /mcq 2026-09-01 "build now").
-- Additive: one column. NULL/absent = 'off' (default OFF for everything — consent is
-- opt-in, per person, self-service on /profile; admin sees but never sets it).
-- Grades: 'off' (nothing shared) · 'traces' (session traces may be stored) ·
-- 'traces+prompts' (authored prompts too). Enforced at the door: a handoff's
-- authoredPrompts and a transmission's trace pointer are STRIPPED (never blocked)
-- below their required grade, with an honest note back to the submitter.
ALTER TABLE people ADD COLUMN trace_consent TEXT;
