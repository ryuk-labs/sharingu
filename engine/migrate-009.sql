-- 009 (2026-08-30, alignment sweep): the audit trail gets an ENVELOPE lane column.
-- events.lane = code | design | leader | vendor | ba (validated in the worker against
-- TX_LANES; NULL for legacy rows and events with no lane context). Distinct from
-- people.lane, which is the person's heartbeat ROUTING tag, not the envelope lane.
ALTER TABLE events ADD COLUMN lane TEXT;
