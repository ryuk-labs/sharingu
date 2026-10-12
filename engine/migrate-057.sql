-- migrate-057.sql — a new picture of a screen does not make its grades stale (owner, MCQ 2026-10-02; sprint 3, D1b item 12).
-- EXPAND-ONLY in effect: it DROPS two triggers migrate-054 created (k_stale_render_insert, k_stale_render_update) and creates
-- nothing in their place; no table, column, row or index changes. The worker's code reads no trigger, so the order against
-- the code does not matter for correctness; apply it live (tools/migrate.sh, a bookmark first) with the D1b code, AFTER
-- migrate-054 (a replay of the chain re-runs 054, which creates the two triggers again: this file must then run after it).
--
-- THE RULE NOW (ARCHITECTURE.md §12 as amended by the owner): a check's grade goes stale at a node when the NODE ITSELF changes
-- (a knowledge write that changes its type, name, status or data, or the node added or removed: k_stale_node_*), or when a
-- filed code or design contribution names it (k_stale_contribution). A render — a picture or a wireframe of a screen, added or
-- replaced — is how the screen LOOKS on file, not a change of what it does: it puts no proof in question. The real grading run
-- (engine/.runs/real-org/fill2) filed 22 pictures and had to regrade 55 checks for them; with this file that cost is gone.
-- WHAT IT DOES NOT DO: the stale marks a render already made (on a local org that ran 054's render triggers) stay until a
-- regrade clears them — k_node_stale does not record what caused a change (changed_by is NULL for any knowledge write), so a
-- render's mark cannot be told from a node edit's and is never guessed away. Live holds none (054 is not live yet).
-- WRITE COST: none (two fewer triggers; a render write now writes nothing beyond its own row and index).

DROP TRIGGER IF EXISTS k_stale_render_insert;
DROP TRIGGER IF EXISTS k_stale_render_update;

-- ---- the history index (D1b item 13): one ref's history finds every filing that names it ----
-- transmission_refs held gapRefs, screens (bare) and components; a contribution's TOUCHES were never indexed, so
-- eagle_history {ref: "screen:home"} found nothing while the bare "home" (from `screens`) found 9. From this file the door
-- indexes touches as it files (src/area.js refTokensFor; never a knowledge write's: they name the items written), and the read
-- searches every form a ref is filed under (src/area.js canonicalRef). This backfill indexes the touches of every row filed
-- before it, verbatim, one row per token (the json_quote trick of migrate-054: a comma-separated list read as a JSON array),
-- never a token already there for that row, so a re-run writes nothing. WRITE COST: one row per touch token of every
-- contribution already filed (state the count before applying live: SELECT COUNT(*) of the SELECT below).
-- BACKFILL: transmission_refs
INSERT INTO transmission_refs (tid, ref)
  SELECT DISTINCT t.id, trim(j.value)
  FROM transmission t, json_each('[' || replace(json_quote(t.touches), ',', '","') || ']') j
  WHERE t.touches IS NOT NULL AND t.touches <> '' AND COALESCE(t.kind, '') <> 'knowledge'
    AND trim(j.value) <> '' AND length(trim(j.value)) <= 200
    AND NOT EXISTS (SELECT 1 FROM transmission_refs r WHERE r.tid = t.id AND r.ref = trim(j.value));

-- ---- a screen of more than one app (D1b item 20) ----
-- A screen node's data.surface may be a LIST of app keys (siru's Assistant shares two screens with the App). The one-app screens
-- are read as before (idx_k_nodes_screen_surface); the nodes whose data.surface is a list (screens), only they, sit in this partial
-- index, so the Screens view and the checklist read them with one small probe instead of every screen of the project (the
-- readers write +type so the planner takes this index, not idx_k_nodes_type). No row changes.
CREATE INDEX IF NOT EXISTS idx_k_nodes_screen_multi ON k_nodes(project) WHERE json_type(data, '$.surface') = 'array';
