-- migrate-045.sql — the admin's hats unlock, a person's own hats only shape Home (sprint 2; the owner's MCQ of 2026-10-01:
-- "the admin sets the hats that unlock briefings and cards; a person's self-chosen hats only shape what Home shows them
-- first"). Before this file, people.hats (set by the person on /profile) ALSO admitted them to every roleVisibility list and
-- capsule that named the hat, so any member could read any hat's briefing by switching hats.
-- EXPAND, then a backfill of people only. Applied with tools/migrate.sh (a bookmark first), after migrate-044. The worker reads
-- the new column with a fallback (src/core.js withProfile): before this file runs, every door resolves people with the
-- migrate-044 columns and NO access hat, so a hat admits no one until the backfill below has run (never more, only less).
--
-- THE COLUMN (people):
--   · access_hats  a JSON list of the website's six hats (src/hats.js HATS), set by the ADMIN on Control (POST /control
--                  set-access-hats, Invite). It is what a roleVisibility list or a capsule name admits a person by, beside
--                  their role and their typed label (src/hats.js readerKeys). '[]' is "no access hat" (the doors write it so a
--                  second run of the backfill never re-grants what the admin took away); NULL is a row the backfill has not
--                  reached yet, and reads as no access hat.
--   people.hats keeps its meaning for the person alone: what Home leads with and the rail's label. It never admits anyone.
--
-- THE BACKFILL, guarded so a second run changes nothing (WHERE access_hats IS NULL, and every row it reaches gets a list):
--   access_hats = the hats migrate-044 gave the typed role, by THE mapping (src/hats.js LABEL_HATS; tools/hats-selftest.mjs
--   holds the two together), read off the typed label migrate-044 kept (role_label), else the role itself:
--     owner, leader -> Management · economics -> Finance · product, design, internal-eng, ai-platform -> Engineering ·
--     logistics -> Organization · gtm -> Go-to-market · external-ai, external-logistics, vendor, partner -> Partner ·
--     member and any other label -> none ('[]').
--   Right after migrate-044 every person's own hats ARE this mapping, so every migrated person reads exactly what they read
--   before this file (tools/hats-selftest.mjs proves it over every list of typed labels, hats, member and partner). A Partner
--   gets ["partner"], which their role already admits them by: nothing widens. What a person picked for THEMSELVES on /profile
--   after migrate-044 stops admitting them (that is the ruling); the admin grants it on Control if it should.
ALTER TABLE people ADD COLUMN access_hats TEXT;

UPDATE people SET access_hats = CASE lower(COALESCE(role_label, role))
    WHEN 'owner' THEN '["management"]'
    WHEN 'leader' THEN '["management"]'
    WHEN 'economics' THEN '["finance"]'
    WHEN 'product' THEN '["engineering"]'
    WHEN 'design' THEN '["engineering"]'
    WHEN 'internal-eng' THEN '["engineering"]'
    WHEN 'ai-platform' THEN '["engineering"]'
    WHEN 'logistics' THEN '["organization"]'
    WHEN 'gtm' THEN '["gtm"]'
    WHEN 'external-ai' THEN '["partner"]'
    WHEN 'external-logistics' THEN '["partner"]'
    WHEN 'vendor' THEN '["partner"]'
    WHEN 'partner' THEN '["partner"]'
    ELSE '[]' END
  WHERE access_hats IS NULL;
