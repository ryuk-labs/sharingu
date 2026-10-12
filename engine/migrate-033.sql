-- migrate-033.sql — Q0B50A78E (owner ruling, 2026-09-20): events is authored — it records THAT
-- something happened, never what was said, and every filing is attributed to the user who filed it.
-- person_id was already NOT NULL (attribution was already true); what schema did NOT hold was any
-- structural guarantee on payload_json, the one column that could carry free text — nothing stopped
-- it from holding a raw pasted string instead of the "claims and references only" shape the comment
-- above it has always promised (G-X5).
--
-- WRITE-PATH ENFORCEMENT ALREADY EXISTS AND IS NOT DUPLICATED HERE: carriesTranscript() (src/core.js)
-- runs on every REST body that can reach an events insert (src/index.js: /event, /transmission,
-- /transmission/batch, /respond, /handoff, plus mcp.js callTool()'s single top-of-dispatch guard for
-- every MCP tool including record_event/bank_artifact) and refuses with transcript_rejected before
-- any insert happens; kind is validated per-route against ENGINE_EVENT_KINDS + the tenant's own
-- eventKindExtensions (src/util.js) — deliberately NOT a closed schema CHECK, because an org may
-- extend the vocabulary in its own manifest and a global boot.sql CHECK cannot know that set. What
-- THIS migration adds is the one guarantee schema itself can hold: payload_json, when present, must
-- be valid JSON — structurally a claim/reference object, never a bare pasted transcript string.
--
-- events also gains its FK pair (person_id -> people.id, project -> projects.key) — the two of the
-- 22 QCE1F9725/QD1A9E7EB convention relations that were not folded into migrate-031.sql on purpose,
-- so this table is rebuilt exactly once for both rulings rather than twice in the same PR. The third
-- convention relation on this table, session_id -> sessions.id, is NOT added: Q0544F477 already
-- dropped the sessions table (migrate-030.sql) and nothing is left to reference
-- (GAP-events-sessions-relation-dies-with-sessions) — the column stays, dead and unreferenced, which
-- is outside this ruling's own scope to drop.
ALTER TABLE events RENAME TO events_old;
CREATE TABLE events (
  id           TEXT PRIMARY KEY,
  session_id   TEXT,                     -- dead: sessions table dropped (Q0544F477/migrate-030.sql); not resurrected as a FK — do not add one
  person_id    TEXT NOT NULL REFERENCES people(id),
  kind         TEXT NOT NULL,            -- session_open | drift | unknown | ruling | fragment | exit | correction | ... (org-extensible; validated at every insert door, never a closed schema CHECK — see header)
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)), -- Q0B50A78E: claims and references only, never raw conversation text — structurally, it must be JSON
  created_at   TEXT NOT NULL,
  touches TEXT, basis TEXT, stamped INTEGER NOT NULL DEFAULT 0, lane TEXT, project TEXT REFERENCES projects(key)
);
-- explicit column list on both sides (never SELECT *) — a live org D1 gained several of these
-- columns via ALTER TABLE ADD COLUMN at different times, in different physical orders per org
-- (confirmed: ryuklabs/siru/veil/bunny disagree); naming every column resolves by NAME, immune to
-- that drift, where `SELECT *` would silently copy the wrong value into the wrong column instead.
INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, touches, basis, stamped, lane, project)
  SELECT id, session_id, person_id, kind, payload_json, created_at, touches, basis, stamped, lane, project FROM events_old;
DROP TABLE events_old;
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_project       ON events(project, created_at);
CREATE INDEX IF NOT EXISTS idx_events_stamped ON events(kind, stamped);
