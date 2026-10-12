-- migrate-044.sql — roles, simply, and profiles with hats (sprint 2; docs/plan/LOOK.md, the owner's MCQ of 2026-09-30 evening:
-- roles are Admin · Member · Partner, and today's typed role labels become a person's HAT).
-- EXPAND, then a backfill of people only. Applied with tools/migrate.sh (a bookmark first). The worker reads the new columns
-- with a fallback (src/core.js withProfile): before this file runs, every door resolves people exactly as it did.
--
-- THE COLUMNS (people):
--   · hats        a JSON list of the website's six hats (src/hats.js HATS: management, engineering, organization, gtm,
--                 finance, partner), set by the person on /profile; null is no hat.
--   · avatar      "<tone>" or "<tone>:<initials>" (src/hats.js avatarOf): the person's own initials on a presence tone; null
--                 reads as their name's initials. No photo in this file (no uploads).
--   · role_label  the typed role this person held before this file (economics, internal-eng, external-ai, leader, ...),
--                 kept VERBATIM so every roleVisibility list and capsule that named it still admits them: nothing they could
--                 read disappears (src/hats.js readerKeys). Set here and by a script provisioning a typed role, never by a
--                 door a person presses.
--
-- THE BACKFILL, in this order, each guarded so a second run changes nothing:
--   1 · hats from the typed role, by THE mapping (src/hats.js LABEL_HATS; tools/hats-selftest.mjs holds the two together):
--         owner, leader -> Management · economics -> Finance · product, design, internal-eng, ai-platform -> Engineering ·
--         logistics -> Organization · gtm -> Go-to-market · external-ai, external-logistics, vendor -> Partner ·
--         any other label -> no hat (the person picks theirs).
--   2 · role_label = the typed role, verbatim, for every person who is not the admin (owner) and not already member/partner.
--   3 · role = 'partner' for an outside label (external-*, vendor), 'member' for every other non-admin. The admin keeps
--       'owner': every `role === "owner"` authority check in the worker reads exactly what it read before.
--
-- BEFORE applying it live, run this read (a precheck, not part of the file): every key a stored roleVisibility list names.
-- The backfill keeps what every migrated person could read exactly (tools/hats-selftest.mjs) as long as no list names a NEW
-- key: 'member', 'partner' or a hat (management, engineering, organization, gtm, finance). A list naming one of those would
-- open to the people who now carry it; the dev-local and volume data name only internal-eng, leader and owner.
--   WITH lists AS (SELECT role_visibility v FROM k_docs WHERE role_visibility IS NOT NULL
--     UNION ALL SELECT role_visibility FROM k_cards WHERE role_visibility IS NOT NULL
--     UNION ALL SELECT role_visibility FROM k_card_kinds WHERE role_visibility IS NOT NULL)
--   SELECT j.value, COUNT(*) FROM lists, json_each(lists.v) j GROUP BY j.value ORDER BY 2 DESC;
ALTER TABLE people ADD COLUMN hats TEXT;
ALTER TABLE people ADD COLUMN avatar TEXT;
ALTER TABLE people ADD COLUMN role_label TEXT;

UPDATE people SET hats = CASE lower(role)
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
    ELSE NULL END
  WHERE hats IS NULL;

UPDATE people SET role_label = role
  WHERE role_label IS NULL AND role <> 'owner' AND lower(role) NOT IN ('owner', 'member', 'partner');

UPDATE people SET role = CASE WHEN lower(role) LIKE 'external%' OR lower(role) = 'vendor' THEN 'partner' ELSE 'member' END
  WHERE role <> 'owner' AND lower(role) NOT IN ('owner', 'member', 'partner');
