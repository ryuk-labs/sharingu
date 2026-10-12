-- migrate-029.sql — RYUKLABS-ONLY (owner ruling 2026-09-17, "one org, one sharingu workspace"):
-- the ryuklabs D1 carries two launcher cards for the same product — `platform` ("Agent R",
-- M-ADR-029 generated-only, servePrefix serve/ws/platform) and `sharingu-dev` ("Sharingu dev",
-- D1-only, minted via /control add-project 2026-09-14, this Mini's machine seat). They fold into
-- ONE workspace, key `sharingu` (chosen to match Agent L's own registry id — cockpit/registry.json
-- `id: "sharingu"` — so lib/r-pair.mjs resolveRWorkspace's branch 2, "L project id == R workspace
-- key -> sent unchanged", fires with no explicit mapping needed, orchestrator/lib/r-pair.mjs:389).
-- `siru-services` (brain ryuklabs-ops-brain) is OUT OF SCOPE — untouched by every statement below.
--
-- 100% DATA, no schema change (boot.sql / check-boot-schema.py unaffected — no ADD COLUMN, no
-- CREATE TABLE here). Every project/project_key column in boot.sql is folded — enumerated from
-- the live schema, not assumed: project_seats.project_key, invites.project_key,
-- transmission.project, events.project, artifacts.project, check_results.project, tokens.project.
-- (people, loops, sessions, sso_nonce, login_attempts, transmission_refs, transmission_refs_meta,
-- approval_audit carry no project axis — confirmed against boot.sql, nothing to fold there.)
--
-- Order matters: rename the `projects` row FIRST so every later fold target ('sharingu') already
-- exists as an active project when project_seats' PK (person_id, project_key) is touched next.
--
-- IDEMPOTENT — every statement's WHERE clause matches nothing on a second run (proven live by
-- tools/verify-ws-merge.mjs --idempotency). CONFLICT-SAFE — the project_seats fold below is an
-- INSERT ... ON CONFLICT DO NOTHING + DELETE, never a raw UPDATE, so a person who already held a
-- 'sharingu' seat (ex-'platform') when this runs keeps their existing role instead of a PK clash;
-- live data checked 2026-09-17 shows zero person_id overlap between the two seat sets, so no role
-- is actually dropped by this run, but the statement is written to hold even if that changes.
--
-- The 'sharingu-dev' project ROW is ARCHIVED (active=0), never deleted — one release for a named
-- refusal on a stale link (core.js doorProject / projectSeatsFor both join `p.active = 1`, so an
-- old sharingu-dev claim now 422s project_forbidden instead of silently working; admin.js already
-- renders "Project sharingu-dev archived" once active=0 — no code change needed for the refusal).
--
-- The 60 junk incomplete sharingu-dev transmissions named in the merge brief
-- (bug0914:gate-runs-filed-60-junk-transmissions-on-ryuklabs, T-20260914-001..015,017..061) do
-- NOT need folding here — they were already marked eval=1 under an earlier owner ruling
-- (2026-09-14) and have since self-cleaned; live ryuklabs D1 on 2026-09-17 carries exactly ONE
-- sharingu-dev transmission row, T-20260914-016 (the real P1 proof), which the transmission fold
-- below carries into 'sharingu' along with everything else.

-- 1. the workspace itself: platform -> sharingu
UPDATE projects SET key = 'sharingu', name = 'Sharingu' WHERE key = 'platform';

-- 2. seats already on the renamed project (was 'platform', now must say 'sharingu' to match the
--    projects PK above) — a plain rename, no fold, no conflict possible (no 'sharingu' seats existed
--    before step 1 ran for the first time).
UPDATE project_seats SET project_key = 'sharingu' WHERE project_key = 'platform';

-- 3. fold sharingu-dev's own seats into sharingu, conflict-safe (PK is (person_id, project_key)).
INSERT INTO project_seats (person_id, project_key, role, created_at)
  SELECT person_id, 'sharingu', role, created_at FROM project_seats WHERE project_key = 'sharingu-dev'
  ON CONFLICT(person_id, project_key) DO NOTHING;
DELETE FROM project_seats WHERE project_key = 'sharingu-dev';

-- 4. every other project-keyed table, both old keys -> the one new key.
UPDATE invites       SET project_key = 'sharingu' WHERE project_key IN ('platform', 'sharingu-dev');
UPDATE transmission  SET project     = 'sharingu' WHERE project     IN ('platform', 'sharingu-dev');
UPDATE events        SET project     = 'sharingu' WHERE project     IN ('platform', 'sharingu-dev');
UPDATE artifacts     SET project     = 'sharingu' WHERE project     IN ('platform', 'sharingu-dev');
UPDATE check_results SET project     = 'sharingu' WHERE project     IN ('platform', 'sharingu-dev');
UPDATE tokens        SET project     = 'sharingu' WHERE project     IN ('platform', 'sharingu-dev');

-- 5. archive the old sharingu-dev row — keep it (owner decides deletion later), just inactive.
--    `AND active != 0` matters for idempotency: without it, this WHERE always matches the KEPT
--    row (it's archived, never deleted) so SQLite counts a "change" on every rerun even once
--    active is already 0 — the gap tools/verify-ws-merge.mjs --idempotency caught live 2026-09-17.
UPDATE projects SET active = 0 WHERE key = 'sharingu-dev' AND active != 0;
