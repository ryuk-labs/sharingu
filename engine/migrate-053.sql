-- migrate-053.sql — pick-up: another person takes a contribution's next action (sprint 3, B4; docs/plan/MCP.md §9 demand 3,
-- the product's activation event). EXPAND-ONLY: six new nullable columns on transmission, two partial indexes and one
-- trigger; no existing row changes. Applied live with tools/migrate.sh (a bookmark first), BEFORE the code: src/pickup.js
-- writes the columns, Build, Home and GTM read them.
--   · next_due: the next action's date (next.by) while the action is OPEN: written with the contribution's own row when it is
--     filed with a dated next action, cleared when it is picked up or done, put back when a pick-up is released. A column of
--     its own (not migrate-047's next_by) so the follow-ups index below never names a 047 column: a replay of the chain
--     (tools/migrate-dryrun.sh) rebuilds transmission in migrate-031 and then SKIPS 047 whole (its first ALTER, on k_cards,
--     is already applied), so an index or a statement here naming next_by would fail the replay. No backfill for the same
--     reason (next_by is new this sprint and not live yet: a local org's earlier dated contributions do not list as due).
--   · next_picked_by, next_picked_at: who took the contribution's next action (shape.next, migrate-047) and when. One row
--     updated per pick-up, never a new row. The first pick-up holds (the write is conditional on next_picked_by IS NULL); the
--     contributor, the owner or the picker releases it (both back to NULL).
--   · next_done_at, next_done_by, next_done_note: the next action is done. Set by the picker (pick_up {done: true, note?};
--     next_done_by is their person id) or by the trigger below when a later contribution names this one as its parent
--     (next_done_by is that contribution's id; a counter, a critique, a rank, a knowledge row or a grade never closes it).
--   · idx_transmission_followups (project, next_due) WHERE next_due IS NOT NULL: the follow-ups due of ONE project in date
--     order, one index range of exactly the open ones (Home, GTM). An index row is written when a dated contribution is filed
--     and removed when it is picked up or done.
--   · idx_transmission_handoffs (project, next_picked_at) WHERE next_picked_by IS NOT NULL AND next_picked_by <> submitter:
--     the HANDOFFS (a pick-up by someone other than the contributor). Slice C's adoption measures count them in ONE indexed
--     statement: SELECT MIN(next_picked_at) AS first_handoff, COUNT(*) AS handoffs FROM transmission INDEXED BY
--     idx_transmission_handoffs WHERE project = ? AND next_picked_by IS NOT NULL AND next_picked_by <> submitter AND +eval = 0
--     (repeat handoffs: handoffs - 1). A released pick-up is not a handoff.
--   · transmission_next_done: a contribution filed with a parent whose next action is open closes it (one row updated, only
--     when the parent has a next action and it is not done yet; a suite row never closes a real one; a counter, a critique,
--     a rank, a knowledge row or a grade never closes it).
-- Its own file (see migrate-052.sql): migrate-031's replay rebuilds transmission without these columns, and this file then
-- adds them again; a file that also altered a table 031 never rebuilds would be skipped whole on that replay.

ALTER TABLE transmission ADD COLUMN next_due TEXT;
ALTER TABLE transmission ADD COLUMN next_picked_by TEXT;
ALTER TABLE transmission ADD COLUMN next_picked_at TEXT;
ALTER TABLE transmission ADD COLUMN next_done_at TEXT;
ALTER TABLE transmission ADD COLUMN next_done_by TEXT;
ALTER TABLE transmission ADD COLUMN next_done_note TEXT;

CREATE INDEX IF NOT EXISTS idx_transmission_followups ON transmission(project, next_due) WHERE next_due IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transmission_handoffs ON transmission(project, next_picked_at) WHERE next_picked_by IS NOT NULL AND next_picked_by <> submitter;

DROP TRIGGER IF EXISTS transmission_next_done;
CREATE TRIGGER IF NOT EXISTS transmission_next_done
AFTER INSERT ON transmission
WHEN NEW.parent IS NOT NULL AND COALESCE(NEW.kind, '') NOT IN ('counter','critique','rank','knowledge','grade')
BEGIN
  UPDATE transmission SET next_done_at = NEW.created_at, next_done_by = NEW.id, next_due = NULL
    WHERE id = NEW.parent AND next_done_at IS NULL AND json_extract(shape, '$.next.what') IS NOT NULL AND (NEW.eval = 0 OR eval = 1);
END;
