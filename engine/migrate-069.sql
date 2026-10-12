-- migrate-069.sql — a clientRef files once, by the index itself; the unused refs horizon goes (sprint 6, slice 6.6;
-- docs/plan/PLATFORM.md §3: sprint 1's review, "(submitter, client_ref) not unique", and the transmission_refs_meta row).
--
-- THE INDEX. The door's replay rule (src/core.js CLIENT_REF_SQL, fileTransmissionsBatch's one pre-query, src/preview.js
-- batchLanded) looks a clientRef up by (submitter, client_ref) ALONE: the same person sending the same ref again gets the
-- first filing back, whatever project or eval mark it names. Two filings racing past that lookup could both land, because
-- the index under it (migrate-021's idx_transmission_clientref) was not unique. It is now: UNIQUE (submitter, client_ref).
-- THE SCOPING, stated: per person (submitter is a people id, and a person is a seat in exactly ONE org, so per person is
-- also per org — two orgs never collide); across that person's projects and across eval and real filings alike (the
-- lookup's own scope, never narrower: a narrower index would admit the very duplicate the replay refuses); a row with no
-- clientRef (client_ref NULL) never collides (SQLite: NULLs are distinct in a UNIQUE index), so no partial clause is
-- needed and the index serves every plan migrate-021's did (the same two columns, the same order).
-- LIVE DATA SATISFIES IT: the sprint-6 entry dump of live (engine/.runs/s6-baseline/live-dump.json, 2026-10-06): 1,208
-- contributions, 1,189 with a clientRef, 0 (submitter, client_ref) pairs twice. THE SHIP'S PREFLIGHT, read-only, right
-- before this file (must answer no row):
--   SELECT submitter, client_ref, COUNT(*) AS n FROM transmission WHERE client_ref IS NOT NULL GROUP BY submitter, client_ref HAVING COUNT(*) > 1
-- Should it ever answer a row, the CREATE below fails, and it comes FIRST: nothing after it runs, nothing is dropped.
--
-- THE DROP. transmission_refs_meta (migrate-018: the refs backfill's horizon) has had no reader and no writer since the refs
-- index is kept by its triggers; the only code naming it was the backup's dump list (src/backup.js), which the sprint-6 code
-- no longer names. The old non-unique index goes after the unique one stands (the same columns: nothing loses a plan).
--
-- WRITE COST: the index build reads every contribution once (1,208 on live) and writes its entries; the drops write nothing.
-- ORDER: AFTER the code (the sprint-5 code's nightly backup dumps transmission_refs_meta), after migrate-068.
-- Re-runnable: IF NOT EXISTS / IF EXISTS — a replay of the chain changes nothing.

CREATE UNIQUE INDEX IF NOT EXISTS idx_transmission_clientref_once ON transmission(submitter, client_ref);

DROP INDEX IF EXISTS idx_transmission_clientref;

DROP TABLE IF EXISTS transmission_refs_meta;
