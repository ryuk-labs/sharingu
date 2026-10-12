-- 011 (2026-08-30, ADR-072 · closed-loop P2): the durable owner gate gets its EXIT.
-- approval_audit is APPEND-ONLY — every owner decision on a transmission, immutable;
-- the transmission row carries the latest decision for the queue view.
CREATE TABLE IF NOT EXISTS approval_audit (
  id              TEXT PRIMARY KEY,
  transmission_id TEXT NOT NULL,
  verdict         TEXT NOT NULL,          -- approve | reject | needs-work
  note            TEXT,
  decided_by      TEXT NOT NULL,          -- person id (owner)
  created_at      TEXT NOT NULL
);
ALTER TABLE transmission ADD COLUMN decision TEXT;
ALTER TABLE transmission ADD COLUMN decided_by TEXT;
ALTER TABLE transmission ADD COLUMN decided_at TEXT;
ALTER TABLE transmission ADD COLUMN decision_note TEXT;
