// src/beta.js — THE beta's 50 places (sprint 12, 12.7; moved here in sprint 21, 21.1, so the worker and the operator's tool
// count them from ONE source): the cap, the three aggregate statements that count the places taken, and their sum. Pure: no
// statement runs here, no binding. The operator's allow counts them before it mints a code or approves a request
// (tools/operator.mjs betaPlaces, on the deployment's D1); the worker reads the same count for the status page's "N of 50"
// (src/accounts.js betaCount: the statements name accounts and signup_codes, whose one module it is, tools/check-scoped-data.py).
// The worker does not enforce the cap: an account whose email holds a used code or an approved request may create its org
// (src/orgs.js, src/accounts.js mayFound); only the operator's allow refuses past it.

// the owner's ruling, 2026-10-10: the beta's 50 orgs, first come first served, stay on the WAITLIST and the owner approves each
// (through the operator's allow). ONE number for the whole platform, never per org.
export const BETA_ORG_CAP = 50;
// A place is held by an outside org that stands, by an allowed email whose open code could still make one, or (sprint 21, 21.4a)
// by an approved request whose person has not made their org yet. The platform's own
// orgs hold none, each by its durable marker: org 1 (the operating org), an org whose settings say suites (the suites' org),
// an org on the plan `reviewer` (tools/make-reviewer-org.mjs's worlds) or on `suite` (the ship's throwaway orgs).
export const BETA_ORGS_SQL = "SELECT COUNT(*) AS n FROM org WHERE id <> 1 AND COALESCE(json_extract(settings, '$.suites'), 0) <> 1 AND plan NOT IN ('reviewer', 'suite')";
// the emails with an open code (unused, unrevoked, unexpired at ?1) whose account founded no org that stands (one org per account:
// src/orgs.js FOUNDED_SQL — a holder who made one is counted once, by its org); ?2 an email left out (the operator's allow: the
// email being allowed, whose new code replaces its open one), NULL for none
export const BETA_CODES_SQL = "SELECT COUNT(DISTINCT s.email) AS n FROM signup_codes s WHERE s.used_at IS NULL AND s.revoked_at IS NULL AND s.expires_at > ?1 " +
  "AND (?2 IS NULL OR s.email <> ?2) AND NOT EXISTS (SELECT 1 FROM accounts a JOIN org o ON o.created_by_account = a.id WHERE a.email = s.email)";
// (sprint 21, 21.4a: the approval sends "You're in" and mints no code) the APPROVED requests whose email's account founded no org
// that stands and holds no open code (that email is counted by its code above): ?1 now, ?2 an email left out (the operator's allow),
// NULL for none. One per email (migrate-081: one verified request per email). (21.4b) A request the 90-day clearing emptied
// (cleared_at: approved 90 days ago and no org) holds no place any more.
export const BETA_APPROVED_SQL = "SELECT COUNT(*) AS n FROM access_requests r WHERE r.status = 'approved' AND r.cleared_at IS NULL AND (?2 IS NULL OR r.email <> ?2) " +
  "AND NOT EXISTS (SELECT 1 FROM accounts a JOIN org o ON o.created_by_account = a.id WHERE a.email = r.email) " +
  "AND NOT EXISTS (SELECT 1 FROM signup_codes s WHERE s.email = r.email AND s.used_at IS NULL AND s.revoked_at IS NULL AND s.expires_at > ?1)";
// placesOf(orgs, codes, approved) -> { cap, orgs, codes, approved, taken, left }: the three counts summed against the cap (left goes
// below zero past it)
export function placesOf(orgs, codes, approved = 0) {
  const o = Number(orgs) || 0, c = Number(codes) || 0, a = Number(approved) || 0;
  return { cap: BETA_ORG_CAP, orgs: o, codes: c, approved: a, taken: o + c + a, left: BETA_ORG_CAP - o - c - a };
}
