-- migrate-050.sql — the checklist and its meter, and the open count (sprint 3, B3). EXPAND-ONLY: one new table (k_fill), its
-- twenty-one triggers and its backfill; the three transmission_open triggers of migrate-042 replaced (dropped and created again)
-- and that tally recomputed. No existing column or row of any other table changes. Applied live with tools/migrate.sh (a
-- bookmark first); BEFORE the code that reads k_fill ships. Re-running the file recomputes both tables, never doubles.
--
-- K_FILL. The checklist (src/checklist.js) measures "every screen sits in a flow", "every screen is pictured", "every screen
-- and door has a check", "every door is linked to its tables" and "every check is graded" as ratios. Counting those over a
-- large project read one row per screen, door and check on every page that shows the meter (saruspay: 195 screens, 182
-- doors, 3,851 checks). k_fill holds the counts, one row per (project, kind), kept exact by the triggers below; the meter
-- reads five rows. kind is 'screen' (n screens; flow: with data.lane and data.step, or a nav edge to or from it;
-- pictured: with data.wireframe, or a render; checked: named by a check's refs), 'door' (n doors; checked; linked: with an
-- edge of kind reads or writes out of it), 'gap' (n gap nodes; open: their status open), 'check' (n checks; ungraded:
-- with no check_results row) or 'goal' (n goals; roots: with no parent; leaves: no goal names them as parent; laned: leaves
-- naming a lane in their dimensions). A fact is the node's
-- own when the node exists: every trigger computes the facts of the screen or door nodes its row touches as they are now
-- and as they were before this one row changed (the row taken out, or put back), and adds the difference. So the sum is
-- exact whatever order the database fires the triggers of one statement in (a screen node removed takes its renders with
-- it, migrate-046; its edges are removed first by the write door, or after by a restore: both orders sum to the same).
-- Rows written: one per screen, door or gap node filed (and per gap closed or opened), one or two per goal filed, one per check filed, one when a node's facts change (its first nav edge,
-- first render, first check, first reads/writes edge, a lane and step or a wireframe added), one per check's first grade;
-- a change that moves no count writes nothing.
--
-- THE OPEN COUNT. Home's "open filings" (and "by agents") and transmission_queue's counts read transmission_open. A
-- write_knowledge call files ONE ledger row (kind knowledge, routed auto) and a grade with proof one (kind grade, routed
-- auto): the record of a write, not work in motion; after an import Home said "992 open filings, all filed by agents". The
-- tally now counts a filing only when it is NOT such a record: kind knowledge or grade AND route auto. A grade sent without
-- proof (routed to the owner) still counts: it waits on a person, and the badge and the brief (route owner) are unchanged.
-- The update trigger also watches kind now. One row written fewer per knowledge write and per grade with proof.

CREATE TABLE IF NOT EXISTS k_fill (
  project  TEXT NOT NULL,
  kind     TEXT NOT NULL,                 -- screen · door · gap · check · goal
  n        INTEGER NOT NULL DEFAULT 0,    -- how many screens, doors or checks the project holds
  flow     INTEGER NOT NULL DEFAULT 0,    -- screens with data.lane and data.step, or a nav edge to or from them
  pictured INTEGER NOT NULL DEFAULT 0,    -- screens with data.wireframe, or at least one render
  checked  INTEGER NOT NULL DEFAULT 0,    -- screens or doors that a check's refs name
  linked   INTEGER NOT NULL DEFAULT 0,    -- doors with an edge of kind reads or writes out of them
  ungraded INTEGER NOT NULL DEFAULT 0,    -- checks with no grade (no check_results row)
  open     INTEGER NOT NULL DEFAULT 0,    -- gaps whose status is open
  roots    INTEGER NOT NULL DEFAULT 0,    -- goals with no parent
  leaves   INTEGER NOT NULL DEFAULT 0,    -- goals no goal names as its parent
  laned    INTEGER NOT NULL DEFAULT 0,    -- leaf goals naming at least one lane in their dimensions
  PRIMARY KEY (project, kind)
);

-- sprint 6: migrate-067 owns these three triggers now (the bucket per org), so this file no longer drops them: a replay of it
-- (tools/migrate-dryrun.sh --from <before 067>) would put this version back over 067's. Created IF NOT EXISTS below: made where
-- missing (a fresh chain, then 067 replaces them), never replacing 067's. A no-op on every database that ran this file.

CREATE TRIGGER IF NOT EXISTS transmission_open_insert
AFTER INSERT ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(NEW.project, ''), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, NEW.route, CASE WHEN NEW.via LIKE 'mcp%' OR NEW.via LIKE 'cli%' THEN 1 ELSE 0 END, 1 WHERE NEW.status != 'closed' AND NOT (COALESCE(NEW.kind, '') IN ('knowledge','grade') AND NEW.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_open_update
AFTER UPDATE OF status, route, eval, project, gaprefs, components, via, kind ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(OLD.project, ''), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, OLD.route, CASE WHEN OLD.via LIKE 'mcp%' OR OLD.via LIKE 'cli%' THEN 1 ELSE 0 END, -1 WHERE OLD.status != 'closed' AND NOT (COALESCE(OLD.kind, '') IN ('knowledge','grade') AND OLD.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(NEW.project, ''), NEW.eval, CASE WHEN (NEW.gaprefs IS NULL OR NEW.gaprefs NOT LIKE '%mind/%') AND (NEW.components IS NULL OR NEW.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, NEW.route, CASE WHEN NEW.via LIKE 'mcp%' OR NEW.via LIKE 'cli%' THEN 1 ELSE 0 END, 1 WHERE NEW.status != 'closed' AND NOT (COALESCE(NEW.kind, '') IN ('knowledge','grade') AND NEW.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS transmission_open_delete
AFTER DELETE ON transmission
BEGIN
  INSERT INTO transmission_open (project, eval, mind, route, agent, n)
    SELECT COALESCE(OLD.project, ''), OLD.eval, CASE WHEN (OLD.gaprefs IS NULL OR OLD.gaprefs NOT LIKE '%mind/%') AND (OLD.components IS NULL OR OLD.components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, OLD.route, CASE WHEN OLD.via LIKE 'mcp%' OR OLD.via LIKE 'cli%' THEN 1 ELSE 0 END, -1 WHERE OLD.status != 'closed' AND NOT (COALESCE(OLD.kind, '') IN ('knowledge','grade') AND OLD.route IS 'auto')
    ON CONFLICT (project, eval, mind, route, agent) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_node_insert
AFTER INSERT ON k_nodes
WHEN NEW.type IN ('screen','door','gap')
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, NEW.type, 1, (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.lane') IS NOT NULL AND json_extract(NEW.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = NEW.project AND e.to_id = NEW.id AND e.kind = 'nav')))),
      (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.id))),
      (NEW.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = NEW.project AND c.ref = NEW.id)),
      (NEW.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind IN ('reads','writes'))), 0, (NEW.type = 'gap' AND NEW.status IS 'open')
    WHERE NEW.type IN ('screen','door','gap')
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_node_delete
AFTER DELETE ON k_nodes
WHEN OLD.type IN ('screen','door','gap')
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT OLD.project, OLD.type, -1, -(OLD.type = 'screen' AND ((json_extract(OLD.data, '$.lane') IS NOT NULL AND json_extract(OLD.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = OLD.project AND e.to_id = OLD.id AND e.kind = 'nav')))),
      -(OLD.type = 'screen' AND ((json_extract(OLD.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.id))),
      -(OLD.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = OLD.project AND c.ref = OLD.id)),
      -(OLD.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind IN ('reads','writes'))), 0, -(OLD.type = 'gap' AND OLD.status IS 'open')
    WHERE OLD.type IN ('screen','door','gap')
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_node_update
AFTER UPDATE OF project, id, type, data, status ON k_nodes
WHEN (OLD.type IN ('screen','door','gap') OR NEW.type IN ('screen','door','gap')) AND (OLD.project IS NOT NEW.project OR OLD.id IS NOT NEW.id OR OLD.type IS NOT NEW.type OR OLD.data IS NOT NEW.data OR OLD.status IS NOT NEW.status)
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, NEW.type, 0, d.f, d.p, d.c, d.l, 0, d.o FROM (SELECT (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.lane') IS NOT NULL AND json_extract(NEW.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = NEW.project AND e.to_id = NEW.id AND e.kind = 'nav')))) - (OLD.type = 'screen' AND ((json_extract(OLD.data, '$.lane') IS NOT NULL AND json_extract(OLD.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = OLD.project AND e.to_id = OLD.id AND e.kind = 'nav')))) AS f,
      (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.id))) - (OLD.type = 'screen' AND ((json_extract(OLD.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.id))) AS p,
      (NEW.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = NEW.project AND c.ref = NEW.id)) - (OLD.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = OLD.project AND c.ref = OLD.id)) AS c,
      (NEW.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind IN ('reads','writes'))) - (OLD.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind IN ('reads','writes'))) AS l,
      (NEW.type = 'gap' AND NEW.status IS 'open') - (OLD.type = 'gap' AND OLD.status IS 'open') AS o) d
    WHERE OLD.project IS NEW.project AND OLD.type IS NEW.type AND NEW.type IN ('screen','door','gap') AND (d.f <> 0 OR d.p <> 0 OR d.c <> 0 OR d.l <> 0 OR d.o <> 0)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT OLD.project, OLD.type, -1, -(OLD.type = 'screen' AND ((json_extract(OLD.data, '$.lane') IS NOT NULL AND json_extract(OLD.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = OLD.project AND e.to_id = OLD.id AND e.kind = 'nav')))),
      -(OLD.type = 'screen' AND ((json_extract(OLD.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = OLD.project AND r.screen = OLD.id))),
      -(OLD.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = OLD.project AND c.ref = OLD.id)),
      -(OLD.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = OLD.project AND e.from_id = OLD.id AND e.kind IN ('reads','writes'))), 0, -(OLD.type = 'gap' AND OLD.status IS 'open')
    WHERE OLD.type IN ('screen','door','gap') AND NOT (OLD.project IS NEW.project AND OLD.type IS NEW.type)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, NEW.type, 1, (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.lane') IS NOT NULL AND json_extract(NEW.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = NEW.project AND e.to_id = NEW.id AND e.kind = 'nav')))),
      (NEW.type = 'screen' AND ((json_extract(NEW.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = NEW.project AND r.screen = NEW.id))),
      (NEW.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = NEW.project AND c.ref = NEW.id)),
      (NEW.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = NEW.project AND e.from_id = NEW.id AND e.kind IN ('reads','writes'))), 0, (NEW.type = 'gap' AND NEW.status IS 'open')
    WHERE NEW.type IN ('screen','door','gap') AND NOT (OLD.project IS NEW.project AND OLD.type IS NEW.type)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_edge_insert
AFTER INSERT ON k_edges
WHEN NEW.kind IN ('nav','reads','writes')
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav' AND NOT (e.to_id = NEW.to_id AND e.from_id = NEW.from_id AND e.kind = NEW.kind AND e.project = NEW.project)) OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav' AND NOT (e.from_id = NEW.from_id AND e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.project = NEW.project)))))), 0, 0, SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes') AND NOT (e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.from_id = NEW.from_id AND e.project = NEW.project)))), 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = NEW.project AND n.id IN (NEW.from_id, NEW.to_id)))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav' AND NOT (e.to_id = NEW.to_id AND e.from_id = NEW.from_id AND e.kind = NEW.kind AND e.project = NEW.project)) OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav' AND NOT (e.from_id = NEW.from_id AND e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.project = NEW.project)))))) <> 0 OR SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes') AND NOT (e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.from_id = NEW.from_id AND e.project = NEW.project)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_edge_delete
AFTER DELETE ON k_edges
WHEN OLD.kind IN ('nav','reads','writes')
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')) OR (OLD.kind = 'nav' AND OLD.project = n.project AND n.id IN (OLD.from_id, OLD.to_id))))), 0, 0, SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes')) OR (OLD.kind IN ('reads','writes') AND OLD.project = n.project AND OLD.from_id = n.id)))), 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id IN (OLD.from_id, OLD.to_id)))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')) OR (OLD.kind = 'nav' AND OLD.project = n.project AND n.id IN (OLD.from_id, OLD.to_id))))) <> 0 OR SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes')) OR (OLD.kind IN ('reads','writes') AND OLD.project = n.project AND OLD.from_id = n.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_edge_update
AFTER UPDATE OF project, from_id, to_id, kind ON k_edges
WHEN OLD.project IS NOT NEW.project OR OLD.from_id IS NOT NEW.from_id OR OLD.to_id IS NOT NEW.to_id OR OLD.kind IS NOT NEW.kind
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav' AND NOT (e.to_id = NEW.to_id AND e.from_id = NEW.from_id AND e.kind = NEW.kind AND e.project = NEW.project)) OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav' AND NOT (e.from_id = NEW.from_id AND e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.project = NEW.project))) OR (OLD.kind = 'nav' AND OLD.project = n.project AND n.id IN (OLD.from_id, OLD.to_id))))), 0, 0, SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes') AND NOT (e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.from_id = NEW.from_id AND e.project = NEW.project)) OR (OLD.kind IN ('reads','writes') AND OLD.project = n.project AND OLD.from_id = n.id)))), 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id IN (OLD.from_id, OLD.to_id)) OR (n.project = NEW.project AND n.id IN (NEW.from_id, NEW.to_id)))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav')))) - (n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav' AND NOT (e.to_id = NEW.to_id AND e.from_id = NEW.from_id AND e.kind = NEW.kind AND e.project = NEW.project)) OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav' AND NOT (e.from_id = NEW.from_id AND e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.project = NEW.project))) OR (OLD.kind = 'nav' AND OLD.project = n.project AND n.id IN (OLD.from_id, OLD.to_id))))) <> 0 OR SUM((n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))) - (n.type = 'door' AND (EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes') AND NOT (e.to_id = NEW.to_id AND e.kind = NEW.kind AND e.from_id = NEW.from_id AND e.project = NEW.project)) OR (OLD.kind IN ('reads','writes') AND OLD.project = n.project AND OLD.from_id = n.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_render_insert
AFTER INSERT ON k_renders
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id AND NOT (r.state = NEW.state AND r.variant = NEW.variant AND r.screen = NEW.screen AND r.project = NEW.project))))), 0, 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = NEW.project AND n.id = NEW.screen))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id AND NOT (r.state = NEW.state AND r.variant = NEW.variant AND r.screen = NEW.screen AND r.project = NEW.project))))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_render_delete
AFTER DELETE ON k_renders
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id) OR (OLD.project = n.project AND OLD.screen = n.id)))), 0, 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id = OLD.screen))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id) OR (OLD.project = n.project AND OLD.screen = n.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_render_update
AFTER UPDATE OF project, screen, state, variant ON k_renders
WHEN OLD.project IS NOT NEW.project OR OLD.screen IS NOT NEW.screen OR OLD.state IS NOT NEW.state OR OLD.variant IS NOT NEW.variant
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id AND NOT (r.state = NEW.state AND r.variant = NEW.variant AND r.screen = NEW.screen AND r.project = NEW.project)) OR (OLD.project = n.project AND OLD.screen = n.id)))), 0, 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id = OLD.screen) OR (n.project = NEW.project AND n.id = NEW.screen))
    GROUP BY n.project, n.type HAVING SUM((n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))) - (n.type = 'screen' AND ((json_extract(n.data, '$.wireframe') IS NOT NULL) OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id AND NOT (r.state = NEW.state AND r.variant = NEW.variant AND r.screen = NEW.screen AND r.project = NEW.project)) OR (OLD.project = n.project AND OLD.screen = n.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_ref_insert
AFTER INSERT ON k_check_refs
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, 0, SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id AND NOT (c.check_id = NEW.check_id AND c.ref = NEW.ref AND c.project = NEW.project))), 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = NEW.project AND n.id = NEW.ref))
    GROUP BY n.project, n.type HAVING SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id AND NOT (c.check_id = NEW.check_id AND c.ref = NEW.ref AND c.project = NEW.project))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_ref_delete
AFTER DELETE ON k_check_refs
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, 0, SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - (EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) OR (OLD.project = n.project AND OLD.ref = n.id))), 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id = OLD.ref))
    GROUP BY n.project, n.type HAVING SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - (EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) OR (OLD.project = n.project AND OLD.ref = n.id))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_ref_update
AFTER UPDATE ON k_check_refs
WHEN OLD.project IS NOT NEW.project OR OLD.ref IS NOT NEW.ref OR OLD.check_id IS NOT NEW.check_id
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT n.project, n.type, 0, 0, 0, SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - (EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id AND NOT (c.check_id = NEW.check_id AND c.ref = NEW.ref AND c.project = NEW.project)) OR (OLD.project = n.project AND OLD.ref = n.id))), 0, 0, 0
    FROM k_nodes n WHERE n.type IN ('screen','door') AND ((n.project = OLD.project AND n.id = OLD.ref) OR (n.project = NEW.project AND n.id = NEW.ref))
    GROUP BY n.project, n.type HAVING SUM(EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id) - (EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id AND NOT (c.check_id = NEW.check_id AND c.ref = NEW.ref AND c.project = NEW.project)) OR (OLD.project = n.project AND OLD.ref = n.id))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_check_insert
AFTER INSERT ON k_checks
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, 'check', 1, 0, 0, 0, 0, (NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = NEW.project AND g.check_id = NEW.id)), 0 WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_check_delete
AFTER DELETE ON k_checks
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT OLD.project, 'check', -1, 0, 0, 0, 0, -(NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = OLD.project AND g.check_id = OLD.id)), 0 WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_check_update
AFTER UPDATE OF project, id ON k_checks
WHEN OLD.project IS NOT NEW.project OR OLD.id IS NOT NEW.id
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT OLD.project, 'check', -1, 0, 0, 0, 0, -(NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = OLD.project AND g.check_id = OLD.id)), 0 WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT NEW.project, 'check', 1, 0, 0, 0, 0, (NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = NEW.project AND g.check_id = NEW.id)), 0 WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_grade_insert
AFTER INSERT ON check_results
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT c.project, 'check', 0, 0, 0, 0, 0, SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id AND g.id <> NEW.id)))), 0
    FROM k_checks c WHERE (c.project = NEW.project AND c.id = NEW.check_id)
    GROUP BY c.project HAVING SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id AND g.id <> NEW.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_grade_delete
AFTER DELETE ON check_results
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT c.project, 'check', 0, 0, 0, 0, 0, SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id) OR (OLD.project = c.project AND OLD.check_id = c.id)))), 0
    FROM k_checks c WHERE (c.project = OLD.project AND c.id = OLD.check_id)
    GROUP BY c.project HAVING SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id) OR (OLD.project = c.project AND OLD.check_id = c.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_grade_update
AFTER UPDATE OF project, check_id ON check_results
WHEN OLD.project IS NOT NEW.project OR OLD.check_id IS NOT NEW.check_id
BEGIN
  INSERT INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
    SELECT c.project, 'check', 0, 0, 0, 0, 0, SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id AND g.id <> NEW.id) OR (OLD.project = c.project AND OLD.check_id = c.id)))), 0
    FROM k_checks c WHERE (c.project = OLD.project AND c.id = OLD.check_id) OR (c.project = NEW.project AND c.id = NEW.check_id)
    GROUP BY c.project HAVING SUM((NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)) - (NOT (EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id AND g.id <> NEW.id) OR (OLD.project = c.project AND OLD.check_id = c.id)))) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, flow = flow + excluded.flow, pictured = pictured + excluded.pictured, checked = checked + excluded.checked, linked = linked + excluded.linked, ungraded = ungraded + excluded.ungraded, open = open + excluded.open;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_goal_insert
AFTER INSERT ON k_goals
BEGIN
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT NEW.project, 'goal', 1, (NEW.parent IS NULL), (NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)), ((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)) AND (json_array_length(NEW.dimensions) > 0)) WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT p.project, 'goal', 0, 0, SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)))))), SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project))))) * (json_array_length(p.dimensions) > 0))
    FROM k_goals p WHERE (p.project = NEW.project AND p.id = NEW.parent) AND p.id <> NEW.id
    GROUP BY p.project HAVING SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)))))) <> 0 OR SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project))))) * (json_array_length(p.dimensions) > 0)) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_goal_delete
AFTER DELETE ON k_goals
BEGIN
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT OLD.project, 'goal', -1, -(OLD.parent IS NULL), -(NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id) OR OLD.parent IS OLD.id)), -((NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id) OR OLD.parent IS OLD.id)) AND (json_array_length(OLD.dimensions) > 0)) WHERE 1
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT p.project, 'goal', 0, 0, SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id) OR (OLD.project IS p.project AND OLD.parent IS p.id))))), SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id) OR (OLD.project IS p.project AND OLD.parent IS p.id)))) * (json_array_length(p.dimensions) > 0))
    FROM k_goals p WHERE (p.project = OLD.project AND p.id = OLD.parent)
    GROUP BY p.project HAVING SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id) OR (OLD.project IS p.project AND OLD.parent IS p.id))))) <> 0 OR SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id) OR (OLD.project IS p.project AND OLD.parent IS p.id)))) * (json_array_length(p.dimensions) > 0)) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
END;

CREATE TRIGGER IF NOT EXISTS k_fill_goal_update
AFTER UPDATE OF project, id, parent, dimensions ON k_goals
WHEN OLD.project IS NOT NEW.project OR OLD.id IS NOT NEW.id OR OLD.parent IS NOT NEW.parent OR OLD.dimensions IS NOT NEW.dimensions
BEGIN
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT NEW.project, 'goal', 0, d.r, d.l, d.n FROM (SELECT (NEW.parent IS NULL) - (OLD.parent IS NULL) AS r,
      (NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR OLD.parent IS OLD.id)) AS l,
      ((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)) AND (json_array_length(NEW.dimensions) > 0)) - ((NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR OLD.parent IS OLD.id)) AND (json_array_length(OLD.dimensions) > 0)) AS n) d
    WHERE OLD.project IS NEW.project AND (d.r <> 0 OR d.l <> 0 OR d.n <> 0)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT OLD.project, 'goal', -1, -(OLD.parent IS NULL), -(NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR OLD.parent IS OLD.id)), -((NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = OLD.project AND c.parent = OLD.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR OLD.parent IS OLD.id)) AND (json_array_length(OLD.dimensions) > 0)) WHERE 1 AND NOT (OLD.project IS NEW.project)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT NEW.project, 'goal', 1, (NEW.parent IS NULL), (NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)), ((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = NEW.project AND c.parent = NEW.id)) AND (json_array_length(NEW.dimensions) > 0)) WHERE 1 AND NOT (OLD.project IS NEW.project)
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
  INSERT INTO k_fill (project, kind, n, roots, leaves, laned)
    SELECT p.project, 'goal', 0, 0, SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR (OLD.project IS p.project AND OLD.parent IS p.id))))), SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR (OLD.project IS p.project AND OLD.parent IS p.id)))) * (json_array_length(p.dimensions) > 0))
    FROM k_goals p WHERE ((p.project = OLD.project AND p.id = OLD.parent) OR (p.project = NEW.project AND p.id = NEW.parent)) AND p.id <> NEW.id
    GROUP BY p.project HAVING SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR (OLD.project IS p.project AND OLD.parent IS p.id))))) <> 0 OR SUM(((NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id)) - (NOT (EXISTS (SELECT 1 FROM k_goals c WHERE c.project = p.project AND c.parent = p.id AND NOT (c.id = NEW.id AND c.project = NEW.project)) OR (OLD.project IS p.project AND OLD.parent IS p.id)))) * (json_array_length(p.dimensions) > 0)) <> 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n, roots = roots + excluded.roots, leaves = leaves + excluded.leaves, laned = laned + excluded.laned;
END;

-- the backfill: both tables from the rows as they stand (DELETE first, so a re-run recomputes instead of doubling)
DELETE FROM transmission_open;
INSERT OR REPLACE INTO transmission_open (project, eval, mind, route, agent, n)
  SELECT COALESCE(project, ''), eval, CASE WHEN (gaprefs IS NULL OR gaprefs NOT LIKE '%mind/%') AND (components IS NULL OR components NOT LIKE '%mind/%') THEN 0 ELSE 1 END, route, CASE WHEN via LIKE 'mcp%' OR via LIKE 'cli%' THEN 1 ELSE 0 END, COUNT(*)
  FROM transmission WHERE status != 'closed' AND NOT (COALESCE(kind, '') IN ('knowledge','grade') AND route IS 'auto') GROUP BY 1, 2, 3, 4, 5;

DELETE FROM k_fill;
INSERT OR REPLACE INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
  SELECT n.project, n.type, COUNT(*),
    SUM(n.type = 'screen' AND ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL)
      OR EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind = 'nav')
      OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = n.project AND e.to_id = n.id AND e.kind = 'nav'))),
    SUM(n.type = 'screen' AND (json_extract(n.data, '$.wireframe') IS NOT NULL OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = n.project AND r.screen = n.id))),
    SUM(n.type IN ('screen','door') AND EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = n.project AND c.ref = n.id)),
    SUM(n.type = 'door' AND EXISTS (SELECT 1 FROM k_edges e WHERE e.project = n.project AND e.from_id = n.id AND e.kind IN ('reads','writes'))),
    0, SUM(n.type = 'gap' AND n.status IS 'open')
  FROM k_nodes n WHERE n.type IN ('screen','door','gap') GROUP BY n.project, n.type;
INSERT OR REPLACE INTO k_fill (project, kind, n, flow, pictured, checked, linked, ungraded, open)
  SELECT c.project, 'check', COUNT(*), 0, 0, 0, 0, SUM(NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id)), 0
  FROM k_checks c GROUP BY c.project;
INSERT OR REPLACE INTO k_fill (project, kind, n, roots, leaves, laned)
  SELECT g.project, 'goal', COUNT(*), SUM(g.parent IS NULL), SUM(NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = g.project AND c.parent = g.id)),
    SUM(NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = g.project AND c.parent = g.id) AND json_array_length(g.dimensions) > 0)
  FROM k_goals g GROUP BY g.project;
