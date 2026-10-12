-- migrate-021 — the door's machine-grade affordances (M-ADR-006, owner /mcq
-- 2026-09-01 "build now"; contribution-audit L2 in agent-r-brain).
-- Additive, two columns + one index:
--   via        — the submitting surface, client-declared and capped ("agent-l/0.x",
--                "mcp", "web", …). NULL = legacy/direct. Makes human-authored vs
--                agent-refined queryable (review policy will want it).
--   client_ref — the submitter's own idempotency key: a retrying agent re-sending
--                the same clientRef gets the ORIGINAL row back (duplicate:true),
--                never a double-file. Scoped per submitter by the index.
ALTER TABLE transmission ADD COLUMN via TEXT;
ALTER TABLE transmission ADD COLUMN client_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_transmission_clientref ON transmission(submitter, client_ref);
