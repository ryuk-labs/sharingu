-- migrate-056.sql — search: ONE full-text index over what a project knows (sprint 3, B5 extract; docs/plan/MCP.md §4 "Two
-- directions, one vocabulary": `search`, one search across everything a seat may read). EXPAND-ONLY: one new FTS5 virtual
-- table (k_find, contentless: it stores the index, never a copy of the text), twenty-one triggers that keep it, and its
-- backfill. No existing column, row, index or trigger changes.
--   · WHAT IS INDEXED (titles, names and a capped prefix of the body, never a whole body): goals (title; note, id), questions
--     (question; qid, label, the first 600 characters of why, 400 of the rationale), checks (title; id, 300 of then), cards
--     (name; kind, id, 1,500 of the body), docs (title or path; path, 1,500 of the body), map nodes (name; type, id) and
--     contributions (what; id, lane, kind, the refs it names: touches, screens, components and gapRefs, 600 of why) of a project, not eval-marked, not R's own mind/* rows, and not the
--     ledger's bookkeeping kinds (knowledge, grade, answer, rank, round, publish, equip: each is read by `changes`).
--   · THE ROWID IS THE KEY: kind code x 2^40 + the source row's rowid (1 goal · 2 question · 3 check · 4 card · 5 doc · 6 node
--     · 7 contribution), so a delete is one rowid and a hit is read back by its rowid on its own table, where the project is
--     checked again and role visibility is applied (src/extract.js). The column p holds the project as ONE token
--     ('p' || hex(project)), so a MATCH reads one project's postings only. Any later REBUILD of an indexed table (a
--     rename-and-copy migration, WITHOUT ROWID) renumbers its rowids: such a migration must end by re-running this file's last
--     block (delete-all, then the backfill). Re-running the whole file is safe: it rebuilds the index from the tables.
--   · CONTENTLESS, NO PER-ROW RECORD (content='', columnsize=0): the index keeps postings only, written as pages (k_find_data)
--     when a write's transaction commits, never a row per item. A delete hands FTS5 the values the row was indexed with
--     (the 'delete' command, from OLD.* through the SAME expressions the insert used), so the triggers below must keep each
--     kind's insert and delete expressions identical; tools/extract-selftest.mjs A proves the index equals the tables after
--     random writes. An upsert that changes no indexed column runs no trigger (each UPDATE trigger names its columns).
--     Measured on a fresh local import (the worker's own count of rows written): sharingu and saruspay add nothing measurable
--     (see the B5 report); whether Cloudflare's own meter counts the pages a commit writes is unmeasured until the ship.
-- KNOWN LIMIT (Cloudflare D1): `wrangler d1 export` does not export a database holding a virtual table. tools/migrate-dryrun.sh
-- step 1 exports the live database; once this file is live that step needs another source (see the B5 report).
-- ORDER: the code reads k_find through `search` only (the Library's search, the palette): with the code live and this file
-- not yet applied, `search` answers search_unavailable and nothing else changes. Apply it live (tools/migrate.sh, a bookmark
-- first) before or after the code; its backfill writes the index for every project at once (state the rows before applying).

CREATE VIRTUAL TABLE IF NOT EXISTS k_find USING fts5(p, title, body, content='', columnsize=0, tokenize='unicode61 remove_diacritics 2');

-- goals (1)
CREATE TRIGGER IF NOT EXISTS k_find_goal_ai AFTER INSERT ON k_goals BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.note, ''), 1, 600);
END;
CREATE TRIGGER IF NOT EXISTS k_find_goal_au AFTER UPDATE OF title, note ON k_goals BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id || ' ' || substr(COALESCE(OLD.note, ''), 1, 600);
  INSERT INTO k_find (rowid, p, title, body) SELECT 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.note, ''), 1, 600);
END;
CREATE TRIGGER IF NOT EXISTS k_find_goal_ad AFTER DELETE ON k_goals BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id || ' ' || substr(COALESCE(OLD.note, ''), 1, 600);
END;

-- questions (2)
CREATE TRIGGER IF NOT EXISTS k_find_question_ai AFTER INSERT ON k_questions BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 2 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.question, NEW.qid || ' ' || COALESCE(NEW.label, '') || ' ' || substr(COALESCE(NEW.why, ''), 1, 600) || ' ' || substr(COALESCE(NEW.rationale, ''), 1, 400);
END;
CREATE TRIGGER IF NOT EXISTS k_find_question_au AFTER UPDATE OF question, label, why, rationale ON k_questions BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 2 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.question, OLD.qid || ' ' || COALESCE(OLD.label, '') || ' ' || substr(COALESCE(OLD.why, ''), 1, 600) || ' ' || substr(COALESCE(OLD.rationale, ''), 1, 400);
  INSERT INTO k_find (rowid, p, title, body) SELECT 2 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.question, NEW.qid || ' ' || COALESCE(NEW.label, '') || ' ' || substr(COALESCE(NEW.why, ''), 1, 600) || ' ' || substr(COALESCE(NEW.rationale, ''), 1, 400);
END;
CREATE TRIGGER IF NOT EXISTS k_find_question_ad AFTER DELETE ON k_questions BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 2 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.question, OLD.qid || ' ' || COALESCE(OLD.label, '') || ' ' || substr(COALESCE(OLD.why, ''), 1, 600) || ' ' || substr(COALESCE(OLD.rationale, ''), 1, 400);
END;

-- checks (3)
CREATE TRIGGER IF NOT EXISTS k_find_check_ai AFTER INSERT ON k_checks BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 3 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.then_, ''), 1, 300);
END;
CREATE TRIGGER IF NOT EXISTS k_find_check_au AFTER UPDATE OF title, then_ ON k_checks BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 3 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id || ' ' || substr(COALESCE(OLD.then_, ''), 1, 300);
  INSERT INTO k_find (rowid, p, title, body) SELECT 3 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.then_, ''), 1, 300);
END;
CREATE TRIGGER IF NOT EXISTS k_find_check_ad AFTER DELETE ON k_checks BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 3 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id || ' ' || substr(COALESCE(OLD.then_, ''), 1, 300);
END;

-- cards (4)
CREATE TRIGGER IF NOT EXISTS k_find_card_ai AFTER INSERT ON k_cards BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 4 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.name, NEW.kind || ' ' || NEW.id || ' ' || substr(COALESCE(NEW.body_md, ''), 1, 1500);
END;
CREATE TRIGGER IF NOT EXISTS k_find_card_au AFTER UPDATE OF name, body_md ON k_cards BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 4 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.name, OLD.kind || ' ' || OLD.id || ' ' || substr(COALESCE(OLD.body_md, ''), 1, 1500);
  INSERT INTO k_find (rowid, p, title, body) SELECT 4 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.name, NEW.kind || ' ' || NEW.id || ' ' || substr(COALESCE(NEW.body_md, ''), 1, 1500);
END;
CREATE TRIGGER IF NOT EXISTS k_find_card_ad AFTER DELETE ON k_cards BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 4 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.name, OLD.kind || ' ' || OLD.id || ' ' || substr(COALESCE(OLD.body_md, ''), 1, 1500);
END;

-- docs (5)
CREATE TRIGGER IF NOT EXISTS k_find_doc_ai AFTER INSERT ON k_docs BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 5 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), COALESCE(NEW.title, NEW.path), NEW.path || ' ' || substr(COALESCE(NEW.body_md, ''), 1, 1500);
END;
CREATE TRIGGER IF NOT EXISTS k_find_doc_au AFTER UPDATE OF title, body_md ON k_docs BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 5 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), COALESCE(OLD.title, OLD.path), OLD.path || ' ' || substr(COALESCE(OLD.body_md, ''), 1, 1500);
  INSERT INTO k_find (rowid, p, title, body) SELECT 5 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), COALESCE(NEW.title, NEW.path), NEW.path || ' ' || substr(COALESCE(NEW.body_md, ''), 1, 1500);
END;
CREATE TRIGGER IF NOT EXISTS k_find_doc_ad AFTER DELETE ON k_docs BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 5 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), COALESCE(OLD.title, OLD.path), OLD.path || ' ' || substr(COALESCE(OLD.body_md, ''), 1, 1500);
END;

-- map nodes (6)
CREATE TRIGGER IF NOT EXISTS k_find_node_ai AFTER INSERT ON k_nodes BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 6 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.name, NEW.type || ' ' || NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS k_find_node_au AFTER UPDATE OF name, type ON k_nodes BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 6 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.name, OLD.type || ' ' || OLD.id;
  INSERT INTO k_find (rowid, p, title, body) SELECT 6 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), NEW.name, NEW.type || ' ' || NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS k_find_node_ad AFTER DELETE ON k_nodes BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 6 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), OLD.name, OLD.type || ' ' || OLD.id;
END;

-- contributions (7): a project's own, not eval-marked, not mind/*, not a bookkeeping kind; an update deletes what the OLD row
-- indexed (if it was) and adds what the NEW row indexes (if it does)
CREATE TRIGGER IF NOT EXISTS k_find_tx_ai AFTER INSERT ON transmission BEGIN
  INSERT INTO k_find (rowid, p, title, body) SELECT 7 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), COALESCE(NEW.what, NEW.id), NEW.id || ' ' || NEW.lane || ' ' || COALESCE(NEW.kind, '') || ' ' || replace(COALESCE(NEW.touches, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.screens, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.components, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(NEW.why, ''), 1, 600) WHERE NEW.project IS NOT NULL AND NEW.eval = 0 AND lower(COALESCE(NEW.kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%');
END;
CREATE TRIGGER IF NOT EXISTS k_find_tx_au AFTER UPDATE OF what, why, eval, kind, lane, project, touches, screens, components, gaprefs ON transmission BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 7 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), COALESCE(OLD.what, OLD.id), OLD.id || ' ' || OLD.lane || ' ' || COALESCE(OLD.kind, '') || ' ' || replace(COALESCE(OLD.touches, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.screens, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.components, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(OLD.why, ''), 1, 600) WHERE OLD.project IS NOT NULL AND OLD.eval = 0 AND lower(COALESCE(OLD.kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%');
  INSERT INTO k_find (rowid, p, title, body) SELECT 7 * 1099511627776 + NEW.rowid, 'p' || hex(NEW.project), COALESCE(NEW.what, NEW.id), NEW.id || ' ' || NEW.lane || ' ' || COALESCE(NEW.kind, '') || ' ' || replace(COALESCE(NEW.touches, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.screens, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.components, ''), ',', ' ') || ' ' || replace(COALESCE(NEW.gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(NEW.why, ''), 1, 600) WHERE NEW.project IS NOT NULL AND NEW.eval = 0 AND lower(COALESCE(NEW.kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%');
END;
CREATE TRIGGER IF NOT EXISTS k_find_tx_ad AFTER DELETE ON transmission BEGIN
  INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', 7 * 1099511627776 + OLD.rowid, 'p' || hex(OLD.project), COALESCE(OLD.what, OLD.id), OLD.id || ' ' || OLD.lane || ' ' || COALESCE(OLD.kind, '') || ' ' || replace(COALESCE(OLD.touches, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.screens, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.components, ''), ',', ' ') || ' ' || replace(COALESCE(OLD.gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(OLD.why, ''), 1, 600) WHERE OLD.project IS NOT NULL AND OLD.eval = 0 AND lower(COALESCE(OLD.kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%');
END;

-- the backfill (and the rebuild a table rebuild needs): the index is emptied, then written from the tables
INSERT INTO k_find (k_find) VALUES ('delete-all');
INSERT INTO k_find (rowid, p, title, body) SELECT 1099511627776 + rowid, 'p' || hex(project), title, id || ' ' || substr(COALESCE(note, ''), 1, 600) FROM k_goals;
INSERT INTO k_find (rowid, p, title, body) SELECT 2 * 1099511627776 + rowid, 'p' || hex(project), question, qid || ' ' || COALESCE(label, '') || ' ' || substr(COALESCE(why, ''), 1, 600) || ' ' || substr(COALESCE(rationale, ''), 1, 400) FROM k_questions;
INSERT INTO k_find (rowid, p, title, body) SELECT 3 * 1099511627776 + rowid, 'p' || hex(project), title, id || ' ' || substr(COALESCE(then_, ''), 1, 300) FROM k_checks;
INSERT INTO k_find (rowid, p, title, body) SELECT 4 * 1099511627776 + rowid, 'p' || hex(project), name, kind || ' ' || id || ' ' || substr(COALESCE(body_md, ''), 1, 1500) FROM k_cards;
INSERT INTO k_find (rowid, p, title, body) SELECT 5 * 1099511627776 + rowid, 'p' || hex(project), COALESCE(title, path), path || ' ' || substr(COALESCE(body_md, ''), 1, 1500) FROM k_docs;
INSERT INTO k_find (rowid, p, title, body) SELECT 6 * 1099511627776 + rowid, 'p' || hex(project), name, type || ' ' || id FROM k_nodes;
INSERT INTO k_find (rowid, p, title, body) SELECT 7 * 1099511627776 + rowid, 'p' || hex(project), COALESCE(what, id), id || ' ' || lane || ' ' || COALESCE(kind, '') || ' ' || replace(COALESCE(touches, ''), ',', ' ') || ' ' || replace(COALESCE(screens, ''), ',', ' ') || ' ' || replace(COALESCE(components, ''), ',', ' ') || ' ' || replace(COALESCE(gaprefs, ''), ',', ' ') || ' ' || substr(COALESCE(why, ''), 1, 600) FROM transmission WHERE project IS NOT NULL AND eval = 0 AND lower(COALESCE(kind, '')) NOT IN ('knowledge', 'grade', 'answer', 'rank', 'round', 'publish', 'equip') AND (gaprefs IS NULL OR gaprefs NOT LIKE '%mind/%') AND (components IS NULL OR components NOT LIKE '%mind/%');
