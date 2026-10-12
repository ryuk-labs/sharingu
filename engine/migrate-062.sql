-- migrate-062.sql — a project can be marked as a test run's own (sprint 3, S3b: the walk files MARKED and leaves nothing on real
-- screens). EXPAND-ONLY: one new column on projects (DEFAULT 0: every existing project stays a real one) and migrate-054's
-- k_stale_contribution trigger replaced (dropped and created again) with one more term in its WHEN. No row changes.
--   · projects.eval: 1 = a project created by a test run (create_project {eval: true}, the admin's own call; only a NEW key is
--     ever marked, so a real project can never be hidden). Control lists it only on the admin's ?eval=1; the admin's
--     clean-eval sweeps an ARCHIVED eval project of what it held (src/admin.js).
--   · k_stale_contribution: a filed change in lane code or design stales the grades it reaches when it is NOT eval-marked (as
--     before), or when it is filed on an eval project (new): inside a test run's own project every grade is the run's own, so a
--     marked change may put it in question; a marked change on a real project still never stales a real grade.
-- WRITE COST: none on an import (no eval project, no eval change); a marked change on an eval project writes what an unmarked
-- one writes on a real project.
-- ORDER: BEFORE the code (the code reads projects.eval: Control's projects statement, create_project, clean-eval); the old
-- code on the new schema runs unchanged (it names no new column; the trigger's extra term only adds stale marks inside eval
-- projects, which only the new code creates).

ALTER TABLE projects ADD COLUMN eval INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS k_stale_contribution;
CREATE TRIGGER IF NOT EXISTS k_stale_contribution
AFTER INSERT ON transmission
WHEN LOWER(NEW.lane) IN ('code','design') AND NEW.project IS NOT NULL
  AND (NEW.eval = 0 OR EXISTS (SELECT 1 FROM projects ep WHERE ep.key = NEW.project AND ep.eval = 1))
  AND (COALESCE(NEW.touches, '') <> '' OR COALESCE(NEW.components, '') <> '' OR COALESCE(NEW.screens, '') <> '')
BEGIN
  INSERT INTO k_fill (project, kind, n)
    SELECT NEW.project, 'stale', d.n FROM (SELECT COUNT(DISTINCT cr.check_id) AS n FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at
      AND NOT EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = NEW.project AND z.check_id = cr.check_id)) d WHERE d.n > 0
    ON CONFLICT (project, kind) DO UPDATE SET n = n + excluded.n;
  INSERT OR IGNORE INTO k_check_stale (project, check_id)
    SELECT DISTINCT NEW.project, cr.check_id FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref IN (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at;
  INSERT INTO k_node_stale (project, node_id, changed_at, changed_by, stale, updated_at)
    SELECT NEW.project, j.value, NEW.created_at, NEW.id, (SELECT COUNT(*) FROM k_check_refs cr WHERE cr.project = NEW.project AND cr.ref = j.value AND (SELECT x.graded_at FROM check_results x WHERE x.project = NEW.project AND x.check_id = cr.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < NEW.created_at), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (SELECT DISTINCT v AS value FROM (SELECT trim(value) AS v FROM json_each('[' || replace(json_quote(COALESCE(NEW.touches, '')), ',', '","') || ']') UNION SELECT trim(value) FROM json_each('[' || replace(json_quote(COALESCE(NEW.components, '')), ',', '","') || ']') UNION SELECT CASE WHEN trim(value) LIKE 'screen:%' THEN trim(value) ELSE 'screen:' || trim(value) END FROM json_each('[' || replace(json_quote(COALESCE(NEW.screens, '')), ',', '","') || ']') WHERE trim(value) <> '') WHERE v <> '') j WHERE EXISTS (SELECT 1 FROM k_node_lights l WHERE l.project = NEW.project AND l.node_id = j.value AND l.green + l.red + l.amber > 0)
    ON CONFLICT (project, node_id) DO UPDATE SET changed_at = excluded.changed_at, changed_by = excluded.changed_by, stale = excluded.stale, updated_at = excluded.updated_at
      WHERE excluded.changed_at > k_node_stale.changed_at;
END;
