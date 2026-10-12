-- migrate-078.sql — the cost cuts' schema (sprint 8, 8.3b; docs/plan/PLATFORM.md §3): the previews' prune index ("the prune reads
-- the whole previews table") and the questions' refs ("the Map's inspector reads every question to find the ones naming a node").
-- EXPAND ONLY (PLATFORM §5): one index, one table and its three triggers made, nothing renamed, nothing dropped; the old code names
-- none of them (its writes keep the new table true through the triggers).
--   1 · idx_previews_prune: the UNFILED previews by when they expire (previews(expires_at) WHERE filed IS NULL AND filed_at IS
--       NULL), the rows the cron's prune deletes (src/preview.js PRUNE_SQL: unfiled, expired a day ago, the org's own). The prune
--       walked the whole table by its key once per org a run — every org's previews, and the filed ones are kept for ever, so the
--       walk grew with every preview the platform ever filed, times the orgs; on this index it reads only the unfiled rows past
--       the cutoff (the planner picks it for the prune's own terms: no INDEXED BY, so old and new code read the same either way).
--       A partial index no other statement's WHERE implies: every other previews statement reads by the primary key (id), so no
--       plan of today moves (tools/prune-selftest.mjs EXPLAINs every previews statement with it and without it).
--   2 · k_question_refs: below.
-- WRITE COST on live: the index built once (one entry per unfiled preview); then one index row written per preview made and one
-- per preview filed (it leaves the index) — against the walk of every preview, every org, twice a day. The refs: the backfill
-- writes one row per text element of every question's affects array (2,666 on the six projects' local import), then a question
-- written with affects writes one row per ref (a write that leaves affects as it was fires nothing: the door's upsert SETs only
-- changed columns).
-- ORDER: BEFORE the code (the new inspector reads k_question_refs; the old code reads none of it, and its question writes keep
-- the table true through the triggers).
-- Re-runnable: IF NOT EXISTS everywhere; the backfill's conflict keeps what stands.
-- THE UNDO: the code's rollback alone (the old code never reads either); the index, the table and its triggers can stay.

-- 1 · the prune's index
CREATE INDEX IF NOT EXISTS idx_previews_prune ON previews(expires_at) WHERE filed IS NULL AND filed_at IS NULL;

-- 2 · k_question_refs: the refs each question's `affects` names (one row per question and ref), so the questions that name a
--     node are read by the node's id (src/mapnode.js, the Map's inspector: it read the project's every question to find them).
--     Kept by the database as k_check_refs follows k_checks (migrate-040): an insert adds the refs, a change of affects replaces
--     them, a delete removes them. Only the text values of an ARRAY count (the inspector's own rule: Array.isArray(affects)).
--     WITHOUT ROWID: its primary key is the row (one row written a ref).
CREATE TABLE IF NOT EXISTS k_question_refs (
  project TEXT NOT NULL REFERENCES projects(key),
  ref     TEXT NOT NULL,             -- a node, goal or question id the question names (one text element of k_questions.affects)
  qid     TEXT NOT NULL,             -- the k_questions qid
  PRIMARY KEY (project, ref, qid)
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS k_questions_refs_insert
AFTER INSERT ON k_questions
BEGIN
  INSERT INTO k_question_refs (project, ref, qid)
    SELECT NEW.project, value, NEW.qid FROM json_each(iif(json_type(NEW.affects) = 'array', NEW.affects, '[]')) WHERE type = 'text' ON CONFLICT (project, ref, qid) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_questions_refs_update
AFTER UPDATE OF affects ON k_questions
BEGIN
  DELETE FROM k_question_refs WHERE project = OLD.project AND qid = OLD.qid
    AND ref IN (SELECT value FROM json_each(iif(json_type(OLD.affects) = 'array', OLD.affects, '[]')));
  INSERT INTO k_question_refs (project, ref, qid)
    SELECT NEW.project, value, NEW.qid FROM json_each(iif(json_type(NEW.affects) = 'array', NEW.affects, '[]')) WHERE type = 'text' ON CONFLICT (project, ref, qid) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS k_questions_refs_delete
AFTER DELETE ON k_questions
BEGIN
  DELETE FROM k_question_refs WHERE project = OLD.project AND qid = OLD.qid
    AND ref IN (SELECT value FROM json_each(iif(json_type(OLD.affects) = 'array', OLD.affects, '[]')));
END;

-- the backfill: every stored question's refs (the rows the insert trigger would have written)
INSERT INTO k_question_refs (project, ref, qid)
  SELECT q.project, j.value, q.qid FROM k_questions q, json_each(iif(json_type(q.affects) = 'array', q.affects, '[]')) j WHERE j.type = 'text'
  ON CONFLICT (project, ref, qid) DO NOTHING;
