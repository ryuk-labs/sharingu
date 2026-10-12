-- 010 (2026-08-30, ADR-071): transmissions persist their declared COMPONENT touches —
-- ids from the architecture standard's ratified target (ADR-070). CSV like touches/screens.
ALTER TABLE transmission ADD COLUMN components TEXT;
