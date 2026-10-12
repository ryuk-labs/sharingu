-- migrate-035.sql — QE2D90B38 (owner ruling, 2026-09-20): QEA9771A2 already ruled artifacts is
-- authored WITH A STRONGER RULE than drafted — a filing must carry extracted meaning and its
-- relation to the product, never a raw dump. Nothing in boot.sql enforced that: group_tag was
-- nullable, no CHECK, no controlled vocabulary — and the nightly cron's own orphanArtifacts metric
-- (`WHERE group_tag IS NULL OR group_tag='ungrouped'`) was live, standing proof that untagged rows
-- are filed in practice, not a hypothetical. This migration adds NOT NULL + a CHECK on group_tag and
-- (see the three src/*.js changes in the same commit) validates it at every insert site named on the
-- card: src/core.js (bankArtifact), src/mcp.js (bank_artifact), src/index.js (/fragment) — the three
-- places that used to silently default a missing group to the literal string 'ungrouped'.
--
-- BACKFILL, NAMED: existing NULL/empty/'ungrouped' rows cannot simply be left behind — the CHECK
-- below would refuse to even copy them into the rebuilt table. They are relabeled 'legacy-ungrouped'
-- (not 'ungrouped') — an honest marker for pre-enforcement history that does NOT reopen the banned
-- value going forward (the CHECK still refuses 'ungrouped' on every future insert). The three
-- existing read-side queries that filtered/counted on the literal 'ungrouped' value (src/index.js
-- NOISE + the two orphans counts, src/reports.js ORPHAN_WHERE + its own orphans count) are updated in
-- the same commit to also recognize 'legacy-ungrouped', so the orphan metric and the noise filter
-- keep the same meaning across the rename instead of silently reading zero.
--
-- artifacts also gains its FK pair (person_id -> people.id, project -> projects.key) — the two of
-- the 22 QCE1F9725/QD1A9E7EB convention relations not folded into migrate-031.sql, for the same
-- reason as events in migrate-033.sql: one rebuild per table, not two, in the same PR.
UPDATE artifacts SET group_tag = 'legacy-ungrouped'
  WHERE group_tag IS NULL OR trim(group_tag) = '' OR group_tag = 'ungrouped';

ALTER TABLE artifacts RENAME TO artifacts_old;
CREATE TABLE artifacts (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id),
  kind       TEXT NOT NULL,        -- html | image | svg | pdf | json | other
  title      TEXT,
  r2_key     TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  group_tag  TEXT NOT NULL CHECK (trim(group_tag) <> '' AND group_tag <> 'ungrouped'), -- QE2D90B38: which system-part this belongs to — never null, never the untagged sentinel
  created_at TEXT NOT NULL,
  screens TEXT, states TEXT, project TEXT REFERENCES projects(key)
);
-- explicit column list on both sides (never SELECT *) — same physical-column-order drift as
-- events/transmission/etc. (migrate-033.sql/migrate-031.sql carry the identical note); naming every
-- column resolves by NAME regardless of the old table's own ALTER-grown column order.
INSERT INTO artifacts (id, person_id, kind, title, r2_key, sha256, bytes, group_tag, created_at, screens, states, project)
  SELECT id, person_id, kind, title, r2_key, sha256, bytes, group_tag, created_at, screens, states, project FROM artifacts_old;
DROP TABLE artifacts_old;
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_person ON artifacts(person_id, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_project    ON artifacts(project, created_at);
