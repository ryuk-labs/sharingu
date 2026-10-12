-- migrate-030a.sql — the DATA PRELUDE that must run before migrate-031.sql (Q974E7924 / Q1A82FA6F,
-- owner rulings 2026-09-22, round r83). Named "030a" — not "036" appended at the end, not "031b" —
-- so it sorts BETWEEN migrate-030.sql and migrate-031.sql under plain lexicographic string sort
-- (verified: `python3 -c "print(sorted(['migrate-030.sql','migrate-030a.sql','migrate-031.sql']))"`
-- → 030, 030a, 031, in that order) — the ONLY ordering rule any tool in this repo actually applies:
-- tools/check-boot-schema.py globs `migrate-*.sql` and sorts; tools/export-boot-schema.sh reads live
-- D1 DDL, never a filename; no file in this repo parses a migration filename for a numeric sequence
-- (grepped clean: no `migrate-\d`, no `migrate-[0-9]{3}` pattern anywhere in engine/). A three-digit
-- rename of 031..035 was rejected on purpose — it would touch every cross-reference to those numbers
-- in comments, evals.sh, and this repo's own history for zero behavioral gain.
--
-- WHY THIS RUNS FIRST: migrate-031.sql through migrate-035.sql each add a real FOREIGN KEY (or, for
-- artifacts, a CHECK) that a live, multi-month-old org D1 can already violate — not hypothetically:
-- measured live on ryuklabs-agent-r 2026-09-22 (read-only scan, this migration's own commit) —
-- 47 tokens, 22 loops, 27 events and 6 artifacts row whose person_id/submitter names a person no
-- longer in `people` (a deleted eval seat, under the OLD per-run eval-seat design this same PR
-- retires — see tools/lib-mint-seat.sh), plus 3 hand-minted tokens with project='*' (no such
-- project). siru/veil/bunny measured CLEAN (zero orphans across every FK this migration set adds —
-- same read-only scan, all three tables) — this file is written generic, not ryuklabs-only, so it is
-- a safe no-op there and stays correct if any of them ever drifts the same way.
--
-- IDEMPOTENT: every INSERT below is a LEFT JOIN ... WHERE ... IS NULL anti-join (a row that already
-- exists is never re-inserted; running this file twice changes nothing the second time). Every
-- UPDATE's WHERE clause matches nothing once already applied (same idempotency shape migrate-029.sql
-- already established for this schema).
--
-- Q974E7924 — every person id named by tokens.person_id, loops.person_id, events.person_id,
-- artifacts.person_id, transmission.submitter/decided_by, approval_audit.decided_by,
-- check_results.graded_by, invites.created_by/redeemed_person or project_seats.person_id, but
-- missing from `people`, comes back ONCE as an INACTIVE row — derived from EVERY column that becomes
-- a `REFERENCES people(id)` FK across migrate-031.sql/032.sql/033.sql/035.sql (not just the four
-- columns the live orphan scan happened to find rows on), so an org this session never measured is
-- covered on the same terms. No key, no password, no seat: active=0, key_hash a placeholder value no
-- real key can ever hash to (`'orphan-key:' || id` — never a 64-hex sha256 digest, so it can never
-- collide with or be confused for a real issued key), a non-deliverable address (`<id>@eval.invalid`,
-- satisfying every NOT NULL/UNIQUE `people` declares even though email itself is nullable). Nothing
-- they filed is deleted, edited, or reattributed — the row comes back so the filing still resolves.
--
-- ELEVEN SEPARATE INSERTs, one per source column, NEVER one big UNION — measured live (2026-09-22):
-- D1 refuses ANY compound SELECT past a handful of terms ("too many terms in compound SELECT:
-- SQLITE_ERROR", reproduced at 8 UNION branches against a real remote D1 and again against the local
-- --persist-to emulation this migration set is proven against), a lower ceiling than stock SQLite's
-- own default (500) — D1-specific, undocumented, discovered here. Running one INSERT per source
-- column instead is not just a workaround for that ceiling: it is CORRECT on its own terms. Every
-- statement below still anti-joins against `people` as it stands at THAT statement — and D1 wraps
-- this whole file in one transaction, so a row this file inserted two statements ago already reads
-- back through this same connection — so a person id named by BOTH tokens and loops (say) is
-- inserted once, on whichever statement reaches it first, and every later statement's LEFT JOIN
-- finds it already there and skips it. No duplicate, no UNIQUE violation, no UNION required.
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.person_id, '(retired seat) ' || t.person_id, t.person_id || '@eval.invalid', 'retired', 'orphan-key:' || t.person_id, 0, datetime('now')
  FROM tokens t LEFT JOIN people p ON p.id = t.person_id WHERE t.person_id IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.person_id, '(retired seat) ' || t.person_id, t.person_id || '@eval.invalid', 'retired', 'orphan-key:' || t.person_id, 0, datetime('now')
  FROM loops t LEFT JOIN people p ON p.id = t.person_id WHERE t.person_id IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.person_id, '(retired seat) ' || t.person_id, t.person_id || '@eval.invalid', 'retired', 'orphan-key:' || t.person_id, 0, datetime('now')
  FROM events t LEFT JOIN people p ON p.id = t.person_id WHERE t.person_id IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.person_id, '(retired seat) ' || t.person_id, t.person_id || '@eval.invalid', 'retired', 'orphan-key:' || t.person_id, 0, datetime('now')
  FROM artifacts t LEFT JOIN people p ON p.id = t.person_id WHERE t.person_id IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.person_id, '(retired seat) ' || t.person_id, t.person_id || '@eval.invalid', 'retired', 'orphan-key:' || t.person_id, 0, datetime('now')
  FROM project_seats t LEFT JOIN people p ON p.id = t.person_id WHERE t.person_id IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.submitter, '(retired seat) ' || t.submitter, t.submitter || '@eval.invalid', 'retired', 'orphan-key:' || t.submitter, 0, datetime('now')
  FROM transmission t LEFT JOIN people p ON p.id = t.submitter WHERE t.submitter IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.decided_by, '(retired seat) ' || t.decided_by, t.decided_by || '@eval.invalid', 'retired', 'orphan-key:' || t.decided_by, 0, datetime('now')
  FROM transmission t LEFT JOIN people p ON p.id = t.decided_by WHERE t.decided_by IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.decided_by, '(retired seat) ' || t.decided_by, t.decided_by || '@eval.invalid', 'retired', 'orphan-key:' || t.decided_by, 0, datetime('now')
  FROM approval_audit t LEFT JOIN people p ON p.id = t.decided_by WHERE t.decided_by IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.graded_by, '(retired seat) ' || t.graded_by, t.graded_by || '@eval.invalid', 'retired', 'orphan-key:' || t.graded_by, 0, datetime('now')
  FROM check_results t LEFT JOIN people p ON p.id = t.graded_by WHERE t.graded_by IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.created_by, '(retired seat) ' || t.created_by, t.created_by || '@eval.invalid', 'retired', 'orphan-key:' || t.created_by, 0, datetime('now')
  FROM invites t LEFT JOIN people p ON p.id = t.created_by WHERE t.created_by IS NOT NULL AND p.id IS NULL;
INSERT INTO people (id, name, email, role, key_hash, active, created_at)
  SELECT DISTINCT t.redeemed_person, '(retired seat) ' || t.redeemed_person, t.redeemed_person || '@eval.invalid', 'retired', 'orphan-key:' || t.redeemed_person, 0, datetime('now')
  FROM invites t LEFT JOIN people p ON p.id = t.redeemed_person WHERE t.redeemed_person IS NOT NULL AND p.id IS NULL;

-- Their tokens are revoked (the identity behind them is gone; the row itself is kept, per
-- Q974E7924 above, so the FK resolves) — matched by the placeholder key_hash this same file just
-- minted, never a guess: only a row THIS statement (or a prior run of it) created carries that
-- exact prefix, so a real person's own key_hash (a 64-hex sha256 digest) can never match it.
UPDATE tokens SET revoked = 1
WHERE person_id IN (SELECT id FROM people WHERE key_hash LIKE 'orphan-key:%');

-- A token whose project names no project (measured: 3 hand-minted tokens, project='*', on
-- ryuklabs) is revoked AND its project cleared — never widened to org-wide by silently dropping a
-- bad scope through some other path, and never left live pointing at nothing.
UPDATE tokens SET revoked = 1, project = NULL
WHERE project IS NOT NULL
  AND project NOT IN (SELECT key FROM projects);

-- Q1A82FA6F — group_tag NULL, blank or the literal 'ungrouped' becomes 'legacy-ungrouped' before
-- migrate-035.sql's own CHECK can ever see a row it would refuse. migrate-035.sql already carries
-- the SAME statement (it must — this prelude cannot know 035 will still exist unchanged in some
-- future edit), so this is deliberate defense-in-depth, not a copy/paste slip: idempotent, and a
-- no-op the second time either statement runs, in either order.
UPDATE artifacts SET group_tag = 'legacy-ungrouped'
WHERE group_tag IS NULL OR trim(group_tag) = '' OR group_tag = 'ungrouped';
