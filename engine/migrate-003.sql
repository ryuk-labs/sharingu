-- 003: the process borderline — three fields, and the stamp that makes a ruling binding
ALTER TABLE events ADD COLUMN touches TEXT;    -- what it affects: money · screen-42 · rx-flow …
ALTER TABLE events ADD COLUMN basis   TEXT;    -- why: a source, an ADR, or the honest word "guess"
ALTER TABLE events ADD COLUMN stamped INTEGER NOT NULL DEFAULT 0;  -- 1 = binding, 0 = recorded but not binding
CREATE INDEX IF NOT EXISTS idx_events_stamped ON events(kind, stamped);
