-- migrate-030.sql — drop the `sessions` table (owner ruling, Q0544F477, 2026-09-18,
-- build0920:clear-the-ground): a signed-in surface session tied to one person — the ONE table in
-- this schema with a real, database-enforced FOREIGN KEY (sessions.person_id -> people.id). A full
-- scan found ZERO reads/writes anywhere in engine/src before this ruling: session tracking is not a
-- hard requirement, the table cost database load, and every filing already arrives with its own
-- standard markdown carrying who filed it and from where — if more detail is ever needed it can be
-- read off the filings instead. Dropping it also removes the schema's ONLY database-enforced FK,
-- worth knowing when future FK work runs.
--
-- boot.sql / schema.sql are updated in the SAME commit (the table and its index,
-- idx_sessions_person, are removed from both) — this migration is what carries an EXISTING org's
-- live D1 to that same end state; a fresh day-0 tenant never sees the table at all.
DROP INDEX IF EXISTS idx_sessions_person;
DROP TABLE IF EXISTS sessions;
