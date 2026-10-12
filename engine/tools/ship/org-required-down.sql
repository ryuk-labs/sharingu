-- tools/ship/org-required-down.sql — THE UNDO OF migrate-068.sql (sprint 6 review, finding 1): the nine *_org_required triggers
-- dropped, so code from before sprint 6 (it names no org on any row it writes) can take traffic again.
-- WHEN: before `sh tools/ship.sh rollback <a version from before sprint 6>`, never after it (until this runs, every sign-in,
-- sign-in attempt, filing and event that code writes is refused: org_required). ship.sh rollback reads live's schema and
-- refuses while the triggers stand.
-- HOW: `sh tools/migrate.sh tools/ship/org-required-down.sql` (the budget, a Time Travel bookmark first, then the apply).
-- WHAT STAYS: migrate-068's fill (every row it gave org 1 is org 1's: the old code reads them as before), and migrate-067's
-- columns (the old code names none of them). A row the old code writes after this has org NULL: before the code ships again,
-- migrate-068.sql runs again (re-runnable: it makes each trigger again and fills those rows; its preflight first).
-- Re-runnable: IF EXISTS — a second run changes nothing.

DROP TRIGGER IF EXISTS people_org_required;
DROP TRIGGER IF EXISTS tokens_org_required;
DROP TRIGGER IF EXISTS invites_org_required;
DROP TRIGGER IF EXISTS events_org_required;
DROP TRIGGER IF EXISTS artifacts_org_required;
DROP TRIGGER IF EXISTS loops_org_required;
DROP TRIGGER IF EXISTS approval_audit_org_required;
DROP TRIGGER IF EXISTS login_attempts_org_required;
DROP TRIGGER IF EXISTS transmission_org_required;
