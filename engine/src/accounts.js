// src/accounts.js — THE accounts (sprint 7, slice 7.1; docs/plan/PLATFORM.md §2 item 8; migrate-070). One account per email
// (accounts.email, lower-cased and UNIQUE); a people row is the account's SEAT in one org (people.account_id), at most one
// active seat per org. Every statement that names the accounts table lives in this file (tools/check-scoped-data.py's
// `account` rule), and so does the sign-in by passphrase that POST /login and the OAuth sign-in form share.
//
// THE TWO SECRETS, and why there are two:
//   · the ACCOUNT's passphrase (accounts.pass_hash) is the holder's alone: it is set only by proving it (/profile,
//     src/secrets.js), by slice 7.2's sign-up with an operator's one-time code, or (sprint 12, 12.3) by an org's invite link for an
//     account new in all but name — then marked with that org, which alone it reaches (THE INVITE LINK, below). migrate-070 made every account with NONE
//     (the coordinator's ruling, 2026-10-07, "no widening of authority": under S-019 an admin minted many first passphrases,
//     and an account passphrase opens every seat of the account), so until then every person signs in by their seat's
//     secret, exactly as before. It opens any seat of the account.
//   · a SEAT's own secret (people.pass_hash) is what its org's admin minted (add-person's key, S-019) or set (Control's
//     set-password, rotate-key). It opens THAT seat only.
//   An admin never sets an account's passphrase: a new account is made with none (migrate-070's people_account_attach). Were
//   an admin's minted key to become the account's passphrase, org B's admin could create the account for an email first, and
//   when org A seated that email later, sign in to org A with the key org B minted (the squatting attack). And a seat's
//   credential (which its admin holds) never sets the account's passphrase either: proving only a seat's secret changes only
//   that seat's (runSecretAction).
//
// THE ORG OF A SIGN-IN (sprint 7, 7.4; PLATFORM §2 item 9): the sign-in lives at the platform's root (/login, the OAuth form,
// /signup), so the org is CHOSEN — the org the sign-in is going to (its `prefer`: the org of the page it came from, /<org>/…)
// when the account holds a seat there, else the account's org-1 seat, else its first active seat (seatsOf: one statement).
// The chosen seat anchors the session; where the browser LANDS is the person's own pick (7.4b, landingOf): an account session
// whose account holds seats in several orgs lands on the picker (GET /orgs), unless `next` names one of them. Then:
//   · the ACCOUNT's passphrase signs in the chosen seat with an ACCOUNT session (tokens.account_id, migrate-073): under any
//     org's address it reads as the account's seat there (src/core.js authenticateSession) — one session per account;
//   · a SEAT's own secret signs in that seat only (each active seat tried in the chosen order, at most SEAT_TRIES), with a SEAT
//     session (account_id NULL): it opens that seat, in its org, and nothing else (the no-widening law below);
//   · a right account passphrase with no active seat anywhere is told so (no_seat_here), and signs in to nothing.
// The attempt counts in the chosen seat's org (the org of the sign-in); an attempt that names no org (no account answers the
// email, or the account holds no seat) counts in HOME_ORG — the lockout counts per account (or typed email), never per org, so
// that only places the bookkeeping row (login_attempts.org is required by its trigger).
// THE LOCKOUT (sprint 8, 8.3a: the sprint-7 review's A3; migrate-077), keyed by the account AND the client (lockOf): the
// account's failures are those on the account (login_attempts.account_id), or on the address typed when no account answers it
// (and the attempts an account's email collected before it was one), in 15 minutes. Each attempt names its CLIENT (clientOf: a
// digest of the caller's address the router reads, CF-Connecting-IP, IPv6 by its /64; /profile's, of the credential the request
// rode in on), and a SUCCESSFUL attempt names it only when the ACCOUNT's passphrase (or the operator's sign-up code) proved it.
//   · a client the account's passphrase signed in from in the last KNOWN_DAYS (a VOUCHED client) is judged by its OWN failures:
//     8 in 15 minutes from it lock it;
//   · every other vantage — a new client, one only a seat's secret signed in from, an attempt with no client (a local run, a
//     caller the worker saw no address for) — is judged by the account's failures from EVERYWHERE: 8 in 15 minutes lock it,
//     exactly the law before 8.3a, whatever the number of addresses an attacker holds.
// So a stranger who knows only the email locks themselves and every vantage the holder never proved, never the holder on their
// own client. A seat's secret (what an org's admin minted or set) vouches for no client: an admin holding a member's seat key
// could otherwise vouch for any number of addresses and guess the member's other secrets at 8 per address. A valid sign-up code
// (the operator's hand-off: possession of the email) passes the lock outright (signUp).
//
// THE SIGN-UP (sprint 7, 7.2; PLATFORM §2 item 10: no email service; migrate-071): an email the OPERATOR allowed, with the
// one-time code the operator handed over by hand, and a passphrase. The code is bound to its email (the one lookup is the
// email's open code: signup_codes.email), kept only as a hash, compared in constant time, single-use (spent by a conditional
// UPDATE inside the one batch that writes the account: a second spend changes nothing, and the batch's later statements act
// only when THIS request spent it) and expires. The passphrase becomes the ACCOUNT's (the holder's: PLATFORM §2.8's no-widening
// law holds, because the code proves the email's holder by the operator's hand-off, never an admin's act):
//   (a) no account for the email: one is made with it        · (b) an account with none (every migrated org-1 person): it takes it
//   (c) an account that has one: the operator-approved reset — it takes the new one AND every session of every seat of the
//       account, in every org, ends (and their connected apps), since whoever held the old passphrase may hold those
// Who allows an email and mints its code: ONLY the deployment's credentials, from the operator's machine (tools/operator.mjs).
//
// A SEAT WAITS FOR ITS HOLDER'S YES (sprint 7's review, A1; migrate-074; PLATFORM §2 item 8's no-widening law): an org's admin
// seats an email (src/admin.js add-person), but when that email's account already stands elsewhere — it holds a passphrase (its
// holder signed up) or an active or pending seat in another org — the new seat is PENDING (people.pending = 1, active = 0) until
// the account's holder ACCEPTS it on the picker (GET /orgs, their own ACCOUNT session; answerSeat). A pending seat is no active
// seat, so it is invisible to every reader (the sign-in, SESSION_AT_SQL, seatsOf, ACCOUNT_GRANT_SEAT_SQL, the account's orgs) and
// counts nowhere: no org can make itself the place where another account's sign-ins, sessions or AI writes land. A seat for an
// email with no account, or an account with no passphrase and no other seat, is active at once (as before).
// AND THE SIGN-IN NEVER DEFAULTS (A1): an ACCOUNT sign-in whose account holds more than one active seat names no org on its own —
// the browser lands on the picker, POST /login's JSON answer asks for `org` (409 choose_org), the OAuth form asks for the org
// (the grant records the one chosen), and a sign-up's JSON answer signs in nothing; the org the page came from (`prefer`) or the
// org asked for (`pick`) is the person's own choice. A SEAT THAT WAITS ASKS TOO (the owner, 2026-10-09; PLATFORM §3's squat
// row): an account signing in or up by its passphrase on a JSON path while ANY seat of it waits for its yes is never defaulted
// into its one active seat — the JSON sign-in answers 409 choose_org and the JSON sign-up signs in nothing (`waits`), as several
// active seats do, so a squatter's org (the account's only active seat, made first) is never where its holder's JSON sign-in
// lands. A browser already lands on the picker (landingOf); a seat's own secret signs in that seat; the OAuth form is unchanged.
// THE INVITE LINK (sprint 12, 12.3; migrate-079): an org's admin seats a person on Control (src/admin.js add-person with
// deliver=link, or invite-link for a seat that stands) and gets ONE link, shown once: <origin>/signup?via=invite#<token>. The token
// (48 hex: 192 bits) rides the URL's FRAGMENT, which a browser never sends, so it is in no request line and no log line; the page's
// own script moves it into the POST body (src/signup.js renderInvite). seat_invites keeps only its hash (inviteTokenHash), its
// org, its seat, that seat's email, a digest of that seat's secrets as they stood (seatStamp: a Reissue or a set-password ends the
// link), an expiry (INVITE_DAYS) and its end (used, or revoked by a newer link for the seat). POST /signup with it (redeemInvite):
//   · it sets the ACCOUNT's passphrase ONLY for an account that is new in all but name: no passphrase, and no active or pending
//     seat but the invited one (the account add-person's own seat made: migrate-070's people_account_attach). Then the invitee is
//     signed in (an ACCOUNT session) on that seat, in that org, and lands there — no operator step.
//   · any other account (one with a passphrase, or a seat in another org) is "account_stands": the link sets and changes NOTHING
//     (no passphrase, no seat, no spend); the page says to sign in at /login and accept the seat on the org list (A1's path), or,
//     with no passphrase yet, to ask the operator for a sign-up code.
//   · a used, expired or revoked link, a removed, reissued or pending seat, an email that no longer matches: ONE refusal, nothing
//     written (not even an attempt: the token is the proof, 192 bits; POST /signup's flood filter, LOGIN_LIMIT, covers the door).
// No widening (PLATFORM §2.8): the link is the inviting org's admin's to hand over, so whoever holds it may be that admin. Its
// passphrase therefore reaches THAT org alone — the account carries accounts.invited_org = that org — so it creates no org
// (accountProof: "invited"; the beta's orgs stay on the waitlist), and a seat another org adds for the email later (pending:
// the account holds a passphrase, SEAT_CONSENT_SQL) is neither shown to it nor answered by it (PENDING_OF_SQL, ACCEPT_SEAT_SQL,
// DECLINE_SEAT_SQL) until the operator's code confirms the email (SIGNUP_ACCOUNT_SQL clears the mark: the reset ends every
// session). The squat by link (org B's admin redeems its own link for a fresh email, then org A seats that email) gains nothing
// outside org B, which its admin held already. No route lets anyone mint a link for a seat outside their own org (src/admin.js:
// the seat is read and the row written with {org}), nor for an email but that seat's own.
// AN EMAIL IS ASCII (A5): SQLite's lower() (migrate-070's triggers) folds ASCII letters only and JS's toLowerCase every script,
// so a non-ASCII email would name two accounts; add-person and the sign-up refuse one (email_not_ascii), the operator too.
// No statement here inserts a code (tools/check-scoped-data.py's `signup` rule), so no app seat, of any org, can.
// Every refusal (an email not allowed, a wrong, used, expired or revoked code) is ONE answer, and writes only the attempt,
// which counts in the account's lockout (8 in 15 minutes, with the sign-in's own failures). A locked email still compares its
// code (sprint 8, 8.3a: A3): a VALID code passes the lock (the operator's code is possession proof of the email); any other
// answers the lock (its attempt counted).
import { db, signInEnv, HOME_ORG } from "./data.js";
import { uid, now, pbkdf2, sha256, hex } from "./util.js";
import { revokeOAuthGrants } from "./oauthgrants.js";
import { BETA_ORGS_SQL, BETA_CODES_SQL, placesOf } from "./beta.js";   // sprint 21, 21.1: the beta's places, one source with the operator's

export const LOCKOUT_FAILS = 8;
// the words a right secret with no seat at the address gets (POST /login, the OAuth sign-in form): said plainly, never another org
export const NO_SEAT_HERE_WORDS = "Your account has no seat in the org this address serves, so nothing was signed in. Ask that org's admin to add you, or sign in where your seat is.";
export const LOCKOUT_MINUTES = 15;
// a client the account's passphrase signed in from within this many days is judged by its own failures (lockOf)
export const KNOWN_DAYS = 30;
// normEmail(e) -> the account's spelling of an address (migrate-070: lower-cased, trimmed)
export const normEmail = (e) => String(e == null ? "" : e).toLowerCase().trim();
// asciiEmail(e) -> true when the address is printable ASCII only (A5: the one spelling SQLite's lower() and JS agree on)
export const asciiEmail = (e) => /^[\x21-\x7e]*$/.test(String(e == null ? "" : e).trim());
export const EMAIL_NOT_ASCII_WORDS = "That email holds a letter outside plain ASCII (an accented or other-script letter). sharingu takes plain ASCII emails only for now: use the ASCII spelling of the address.";
// the words a sign-in with several orgs gets when it names none (POST /login's JSON answer: 409 choose_org)
// the words an account whose only seats wait for its yes gets where a sign-in cannot show the picker (a JSON sign-in or sign-up,
// the OAuth form)
export const PENDING_ONLY_WORDS = "Your account's seats wait for your yes: sign in at /login in a browser and accept them on your org list (/orgs). Nothing was signed in.";
export const CHOOSE_ORG_WORDS = "Your account holds seats in several orgs, so the sign-in does not pick one for you: send org (one of the slugs listed) with your email and passphrase.";
// (the owner, 2026-10-09) the words a JSON sign-in or sign-up gets when a seat of its account waits for its yes and it names no
// org: the ask (one active seat: CHOOSE_WAITING_WORDS; several: CHOOSE_ORG_WORDS), then where the waiting seat is answered
export const CHOOSE_WAITING_WORDS = "A seat in another org waits for your yes, so the sign-in does not pick your org for you: send org (one of the slugs listed) with your email and passphrase.";
export const SEAT_WAITS_WORDS = "To answer the seat that waits, sign in at /login in a browser and accept or decline it on your org list (/orgs).";
// chooseOrgWords(r) -> the note of a JSON answer that asks for the org (r: passphraseSignIn's or signUp's answer, ask or waits)
export const chooseOrgWords = (r) => (r && r.ask ? CHOOSE_ORG_WORDS : CHOOSE_WAITING_WORDS) + (r && r.waits ? " " + SEAT_WAITS_WORDS : "");
// a hash compared when no account answers the email, so a sign-in takes the same time either way (A6; accountProof does the same)
const NO_SALT = "00000000000000000000000000000000";

// ---- the statements (exported for the selftests that plan them) ----
export const ACCOUNT_BY_EMAIL_SQL = "SELECT id, email, pass_hash, pass_salt, invited_org FROM accounts WHERE email = ?";
// the account's active seats in every org, in the sign-in's order (sprint 7, 7.4): the preferred org's seat first (?2: the org the
// sign-in is going to, 0 for none), then the org-1 seat (?3: HOME_ORG), then the oldest (idx_people_account; at most eight). Bound
// as values: no one is signed in yet, so the layer's {org} has nothing to say; signInEnv takes the chosen seat's org
// (A1) with each seat its org's path name and name: the org a sign-in asks for (`pick`) and the OAuth form's choice
// (sprint 12's review, defense in depth: THE INVITE LINK's mark) an account an org's invite link marked (accounts.invited_org) is
// listed and signed into ONLY in that org — never a seat it gained in another org meanwhile (an admin's add-person whose consent
// read raced the redemption: src/admin.js), nor in an org that took a deleted org's id (tools/org-undo.mjs zeroes the mark too).
// INVITE_MARK_HOLDS(p): that test on the seat row aliased p — the sign-in's seats, the account's orgs, an account grant's seat and
// the session's seat (SESSION_AT_SQL, below) all carry it
export const INVITE_MARK_HOLDS = (p) => `NOT EXISTS (SELECT 1 FROM accounts im WHERE im.id = ${p}.account_id AND im.invited_org IS NOT NULL AND im.invited_org <> ${p}.org)`;
export const SEATS_OF_SQL = "SELECT p.id, p.name, p.email, p.role, p.title, p.key_hash, p.pass_hash, p.pass_salt, p.org, p.account_id, o.slug AS org_slug, o.name AS org_name " +
  "FROM people p JOIN org o ON o.id = p.org WHERE p.account_id = ?1 AND p.active = 1 AND " + INVITE_MARK_HOLDS("p") + " ORDER BY (p.org = ?2) DESC, (p.org = ?3) DESC, p.created_at ASC LIMIT 8";
// PENDING_OF_SQL (A1, migrate-074): the account's seats waiting for its holder's yes, each with its org's path name and name and
// the seat's role, oldest first (at most 20: the picker's list). Bound to an account the sign-in proved (its passphrase) or an
// ACCOUNT session carries (tokens.account_id) — never a typed id. One read on idx_people_account (account_id, org).
// (sprint 12, 12.3: THE INVITE LINK) an account whose passphrase an org's invite link set (accounts.invited_org) sees no seat another
// org added for its email: that passphrase proves only what the inviting org's admin could hand over (INVITED_ELSEWHERE_SQL)
export const PENDING_OF_SQL = "SELECT p.id, p.org, p.role, o.slug, o.name FROM people p JOIN org o ON o.id = p.org " +
  "WHERE p.account_id = ?1 AND p.pending = 1 AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = p.account_id AND a.invited_org IS NOT NULL AND a.invited_org <> p.org) " +
  "ORDER BY p.created_at ASC LIMIT 20";
// the seats whose OWN secret a sign-in compares, in that order (each costs one passphrase hash)
export const SEAT_TRIES = 4;
// the lockout's count (THE LOCKOUT, above; lockOf), ONE statement: n, the account's failures from every client, and the failures
// its email collected while no account answered it; mine, those from this client; known, whether the account's passphrase signed
// in from this client since ?5 (idx_login_known: one index row, whatever the failures the account holds). The window's rows are
// the ones n always read (ok is in no index), so mine costs no row more. Binds: ?1 since, ?2 the account id (NULL: none), ?3 the
// bucket (the email, or a seat's `id:<person>` bucket), ?4 the client (NULL: none — mine 0, known 0), ?5 the vouch's since
export const FAILS_SQL = "SELECT COUNT(*) AS n, COALESCE(SUM(client = ?4), 0) AS mine, " +
  "EXISTS (SELECT 1 FROM login_attempts k WHERE k.account_id = ?2 AND k.client = ?4 AND k.ok = 1 AND k.at > ?5) AS known " +
  "FROM login_attempts WHERE ok = 0 AND at > ?1 AND (account_id = ?2 OR (account_id IS NULL AND email = ?3))";
// an attempt at the root's sign-in (its org bound: the org the sign-in chose, else HOME_ORG — see THE ORG OF A SIGN-IN), with its
// client (NULL: none; a success names it only when the account's passphrase proved it: countSignIn)
export const ATTEMPT_AT_ADDRESS_SQL = "INSERT INTO login_attempts (id, email, ok, at, org, account_id, client) VALUES (?,?,?,?,?,?,?)";
// an attempt by a signed-in seat (a passphrase change re-checks its current secret): the seat's org, and its client (the same rule)
export const ATTEMPT_SQL = "INSERT INTO login_attempts (id, email, ok, at, org, account_id, client) VALUES (?,?,?,?,{org},?,?)";
// U-REISSUE (N1, UI-B12b's adversarial review): POST /login's session INSERT depends on the secrets it VERIFIED. The sign-in
// reads the seat's key_hash and secret and the account's passphrase, awaits pbkdf2, then mints; a rotate (the admin's
// rotate-key, the holder's rotate-my-key or passphrase change) landing inside that window used to leave the minted row live
// after its revoke. This one statement inserts only while the seat still holds exactly the hashes the sign-in read, is still
// active, and its account still holds the passphrase read. D1 runs statements one at a time, so both orders close: the INSERT
// before the rotate dies by the rotate's revoke, and after it the EXISTS fails (zero rows: src/index.js answers the same 401
// as a wrong passphrase). Bind: token_hash, person_id, device, created_at, expires_at, account_id (the account for an ACCOUNT
// session, NULL for a SEAT session: migrate-073), then the seat's id, key_hash, pass_hash (NULL: none) and the account's
// pass_hash (NULL: none).
export const LOGIN_SESSION_SQL = "INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, account_id, revoked, org) SELECT ?,?,?,?,?,?,0,{org} " +
  "WHERE EXISTS (SELECT 1 FROM people WHERE id = ? AND key_hash = ? AND pass_hash IS ? AND active = 1 " +
  "AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = people.account_id AND a.pass_hash IS ?))";
// (A1) an ACCOUNT session for an account whose only seats wait for its yes: anchored at its oldest PENDING seat (tokens.person_id
// is required), it reads as no seat under any address (SESSION_AT_SQL asks for an active seat; a bearer, keyRow, too) and opens
// only the picker, where its holder accepts or declines. Inserted only while that seat is still pending and the account still
// holds the passphrase the sign-in proved. Binds: ?1 token_hash, ?2 the pending seat, ?3 device, ?4 created_at, ?5 expires_at,
// ?6 the account, ?7 the account's pass_hash as read
export const PENDING_SESSION_SQL = "INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, account_id, revoked, org) SELECT ?1, ?2, ?3, ?4, ?5, ?6, 0, {org} " +
  "WHERE EXISTS (SELECT 1 FROM people p JOIN accounts a ON a.id = p.account_id WHERE p.id = ?2 AND p.pending = 1 AND p.active = 0 AND a.id = ?6 AND a.pass_hash IS ?7)";
// a signed-in seat with its account's passphrase (the holder's own change re-checks either)
export const SEAT_WITH_ACCOUNT_SQL = "SELECT p.id, p.email, p.key_hash, p.pass_hash, p.pass_salt, p.account_id, a.pass_hash AS account_hash, a.pass_salt AS account_salt " +
  "FROM people p LEFT JOIN accounts a ON a.id = p.account_id WHERE p.id = ? AND p.active = 1 AND p.org = {org}";
// the holder's new passphrase, only while the account still holds the one proven (a concurrent change wins; this one is refused)
export const SET_ACCOUNT_PASSPHRASE_SQL = "UPDATE accounts SET pass_hash = ?, pass_salt = ?, updated_at = ? WHERE id = ? AND pass_hash IS ? AND pass_salt IS ?";
// the account's seats in every org: only after the holder proved the account's passphrase (their own seats' connected apps end)
export const ACCOUNT_SEATS_SQL = "SELECT id FROM people WHERE account_id = ?";
// a seat of the admin's org, and whether its account holds a seat in ANY other org (a yes or no, no row of that org: the
// ruling's test for an admin's set-password, PLATFORM §2.8)
export const SEAT_SPAN_SQL = "SELECT p.account_id, EXISTS (SELECT 1 FROM people o WHERE o.account_id = p.account_id AND o.org <> p.org) AS elsewhere FROM people p WHERE p.id = ? AND p.org = {org}";
// an active or pending seat of this email's account in the admin's org (add-person never seats one account twice in one org,
// nor invites it twice)
export const SEAT_TAKEN_SQL = "SELECT p.active FROM accounts a JOIN people p ON p.account_id = a.id AND p.org = {org} WHERE a.email = ? AND (p.active = 1 OR p.pending = 1) LIMIT 1";
// (A1, migrate-074) whether a new seat for this email waits for its holder's yes: the email's account holds its holder's own
// passphrase, or an active or pending seat in ANOTHER org. No row of that org leaves (a yes or no). No account: no row (active).
export const SEAT_CONSENT_SQL = "SELECT (a.pass_hash IS NOT NULL OR EXISTS (SELECT 1 FROM people o WHERE o.account_id = a.id AND o.org <> {org} AND (o.active = 1 OR o.pending = 1))) AS ask " +
  "FROM accounts a WHERE a.email = ?";
// (A1) the holder's answer to a pending seat: ONE statement each, bound to the account of the holder's own ACCOUNT session (the
// cookie's token by its hash, live, an account session: a SEAT session carries no account and answers nothing). Accept makes the
// seat active (the unique idx_people_account_seat refuses a second active seat of the account in that org); decline leaves it
// inactive (an archived row). Binds: ?1 the seat, ?2 the session token's hash, ?3 now
// (sprint 12, 12.3) and never a seat of another org than the one whose invite link set the account's passphrase (INVITED_ELSEWHERE)
const INVITED_ELSEWHERE = " AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = people.account_id AND a.invited_org IS NOT NULL AND a.invited_org <> people.org)";
export const ACCEPT_SEAT_SQL = "UPDATE people SET active = 1, pending = 0 WHERE id = ?1 AND pending = 1 AND account_id = " +
  "(SELECT t.account_id FROM tokens t WHERE t.token_hash = ?2 AND t.revoked = 0 AND t.expires_at > ?3 AND t.account_id IS NOT NULL)" + INVITED_ELSEWHERE;
export const DECLINE_SEAT_SQL = "UPDATE people SET pending = 0 WHERE id = ?1 AND pending = 1 AND account_id = " +
  "(SELECT t.account_id FROM tokens t WHERE t.token_hash = ?2 AND t.revoked = 0 AND t.expires_at > ?3 AND t.account_id IS NOT NULL)" + INVITED_ELSEWHERE;

// secretMatches(password, { pass_hash, pass_salt }) -> true when the password is that secret (an empty one never is)
export async function secretMatches(password, row) {
  const pw = String(password == null ? "" : password);
  return !!(pw && row && row.pass_hash && row.pass_salt) && (await pbkdf2(pw, row.pass_salt)) === row.pass_hash;
}
const sameSecret = (a, b) => !!a && !!b && a.pass_hash === b.pass_hash && a.pass_salt === b.pass_salt;
const sinceOf = (at = Date.now()) => new Date(at - LOCKOUT_MINUTES * 60 * 1000).toISOString();
const knownSinceOf = (at = Date.now()) => new Date(at - KNOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

// ---- the client of an attempt (THE LOCKOUT, above; sprint 8, 8.3a) ----
// addressKey(raw) -> the address as the lockout keys it: an IPv4 address whole (an IPv4-mapped IPv6 one as its IPv4), an IPv6
// address by its /64 (its first four groups, "::" expanded: one host holds a whole /64), "" for none
export function addressKey(raw) {
  const a = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!a) return "";
  const v4 = a.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1];
  if (!/^[0-9a-f:.]+$/.test(a) || !a.includes(":")) return "";
  const [head, tail = ""] = a.split("::");
  const h = head ? head.split(":") : [], t = a.includes("::") && tail ? tail.split(":") : [];
  const groups = a.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "") || "0").join(":") + "::/64";
}
// clientOf(request) -> the client a sign-in at the root counts under: a short digest of the caller's address (the edge's
// CF-Connecting-IP; never stored as typed), "" when the worker saw none (a local run: every attempt is then judged account-wide,
// the law before 8.3a). The router passes it to the doors (passphraseSignIn, signUp, src/orgs.js createOrg).
export async function clientOf(request) {
  const k = addressKey(request && request.headers && typeof request.headers.get === "function" ? request.headers.get("cf-connecting-ip") : "");
  return k ? "ip:" + (await sha256(`sharingu-client:v1:${k}`)).slice(0, 16) : "";
}
// credentialClient(credHash) -> /profile's client: the credential the request rode in on (its hash, the session's or the key's)
export const credentialClient = (credHash) => (credHash ? "cred:" + String(credHash).slice(0, 16) : "");
// lockOf(env, accountId, bucket, client, { vouched }) -> true when this attempt is locked out (THE LOCKOUT, above). vouched: the
// caller already knows the client is the account's own (/profile: an ACCOUNT session of this account, made by its passphrase)
export async function lockOf(env, accountId, bucket, client, { vouched = false } = {}) {
  const c = client ? String(client) : null;
  const r = await db(env).prepare(FAILS_SQL).bind(sinceOf(), accountId || null, bucket, c, knownSinceOf()).first();
  const known = !!(c && accountId && (vouched || (r && Number(r.known) === 1)));
  return (known ? Number((r && r.mine) || 0) : Number((r && r.n) || 0)) >= LOCKOUT_FAILS;
}
// the client an attempt names (THE LOCKOUT): a failure always; a success only when the account's passphrase (or the operator's
// code) proved it — a seat's secret vouches for no client
const clientNamed = (client, ok, vouches) => (client && (!ok || vouches) ? String(client) : null);

// seatsOf(env, accountId, prefer) -> the account's active seats in the sign-in's order (SEATS_OF_SQL)
export async function seatsOf(env, accountId, prefer = null) {
  if (!accountId) return [];
  const want = Number.isSafeInteger(prefer) && prefer >= 1 ? prefer : 0;
  return ((await db(env).prepare(SEATS_OF_SQL).bind(accountId, want, HOME_ORG).all()).results) || [];
}

// passphraseSignIn(env, url, { email, password, prefer, pick }) -> { verdict, email, org, account, seat, session, seatCount,
//   pendingCount, ask, orgs, pendingOnly }
//   verdict: "ok" (the password is the account's passphrase — session "account", seat the chosen one — or an active seat's own
//   secret — session "seat", seat that one) · "wrong" · "locked" (the account's lockout; nothing checked) · "no_seat_here" (the
//   account's passphrase, and the account holds no active seat and no pending one in any org: signed in to nothing)
//   prefer: the org the sign-in is going to (an org id, from the page it came from), or null; pick: the org a sign-in ASKED for
//   (its path name: POST /login's `org`, the OAuth form's choice), or "" — either is the person's own choice of org
//   ask (A1): true when the account's passphrase signed in, the account holds more than one active seat and neither prefer nor
//   pick named one of them: the caller never takes the chosen seat as the person's org (the browser lands on the picker, a
//   JSON sign-in answers choose_org, the OAuth form asks); orgs: then the account's orgs ({ slug, name }, the sign-in's order)
//   waits (the owner, 2026-10-09): true when the account's passphrase signed in to an active seat, a seat of the account waits
//   for its yes and neither prefer nor pick named an org: a JSON sign-in answers choose_org too (the OAuth form reads ask alone)
//   pendingOnly (A1): the account's passphrase, no active seat, and seats waiting for its yes — the session (if the caller mints
//   one) is anchored at the oldest pending seat and opens only the picker
//   client (8.3a): the caller's client (clientOf; "" for none), carried on the answer for countSignIn — the lockout's key
// Writes nothing: the caller counts the attempt (countSignIn) once it knows whether a session was minted.
export async function passphraseSignIn(env, url, { email, password, prefer = null, pick = "", client = "" } = {}) {
  const e = normEmail(email);
  const account = e ? await db(env).prepare(ACCOUNT_BY_EMAIL_SQL).bind(e).first() : null;
  const out = { email: e, org: HOME_ORG, account: account || null, seat: null, session: null, client: client ? String(client) : "" };
  if (await lockOf(env, account ? account.id : null, e, out.client)) return { ...out, verdict: "locked" };
  // A6: one passphrase hash when no account answers, as one does when it answers, so the time says nothing of who holds one
  if (!account) { await pbkdf2(String(password == null ? "" : password), NO_SALT); return { ...out, verdict: "wrong" }; }
  const seats = await seatsOf(env, account.id, prefer);
  const want = normOrgArg(pick);
  const picked = want ? seats.find((s) => String(s.org_slug) === want) || null : null;
  const chosen = picked || seats[0] || null;
  if (chosen) out.org = Number(chosen.org);
  out.seatCount = seats.length;   // 7.4b: an ACCOUNT session with seats in several orgs lands on the picker (landingOf)
  if (await secretMatches(password, account)) {
    const pending = await pendingOf(env, account.id);
    const named = !!picked || (Number.isSafeInteger(prefer) && !!chosen && Number(chosen.org) === prefer);
    const acct = { ...out, session: "account", pendingCount: pending.length };
    if (chosen) return { ...acct, seat: chosen, verdict: "ok", ask: seats.length > 1 && !named, waits: pending.length > 0 && !named, pickMissed: !!want && !picked,
      orgs: seats.map((s) => ({ slug: String(s.org_slug), name: String(s.org_name || s.org_slug) })) };
    if (pending.length) return { ...acct, org: Number(pending[0].org), seat: pending[0], pendingOnly: true, verdict: "ok" };
    return { ...out, verdict: "no_seat_here" };
  }
  for (const s of seats.slice(0, SEAT_TRIES)) {
    if (!sameSecret(account, s) && (await secretMatches(password, s))) return { ...out, org: Number(s.org), seat: s, session: "seat", verdict: "ok" };
  }
  return { ...out, verdict: "wrong" };
}
// pendingOf(env, accountId) -> [{ id, org, role, slug, name }]: the account's seats waiting for its holder's yes (PENDING_OF_SQL)
export async function pendingOf(env, accountId) {
  if (!accountId) return [];
  return ((await db(env).prepare(PENDING_OF_SQL).bind(String(accountId)).all()).results) || [];
}
// mintSession(env, r, { tokenHash, device, at, expires }) -> the INSERT's answer (its meta.changes is 1 when a session was
// minted): the session of the seat the sign-in chose, in that seat's org (src/data.js signInEnv: whatever the ambient cookie
// names), conditional on the secrets the sign-in read (LOGIN_SESSION_SQL); an ACCOUNT session when the account's passphrase
// proved it (r.session "account"), else a SEAT session
// (A1) an account whose only seats are pending: the session is anchored at the oldest pending one (PENDING_SESSION_SQL)
export function mintSession(env, r, { tokenHash, device, at, expires }) {
  const seat = r.seat;
  const accountId = r.session === "account" && r.account ? r.account.id : null;
  if (r.pendingOnly) return accountId ? db(signInEnv(env, seat)).prepare(PENDING_SESSION_SQL)
    .bind(tokenHash, seat.id, device, at, expires, accountId, r.account.pass_hash ?? null).run() : Promise.resolve({ meta: { changes: 0 } });
  return db(signInEnv(env, seat)).prepare(LOGIN_SESSION_SQL)
    .bind(tokenHash, seat.id, device, at, expires, accountId, seat.id, seat.key_hash, seat.pass_hash ?? null, (r.account && r.account.pass_hash) ?? null).run();
}
// landingOf(env, r) -> the address a web sign-in lands on with no `next` (sprint 7, 7.4b; PLATFORM §2 item 8: "sign-in lists the
// person's orgs"): an ACCOUNT session whose account holds seats in several orgs, or any seat waiting for its yes (A1), lands on
// the PICKER (GET /orgs: its orgs, one click each, and its pending seats to accept or decline); a SEAT session (its one seat) and
// a one-org account land straight in the chosen seat's org (/<its slug>, read fresh: one row on the org's primary key); no
// seat: the root
export const ORG_SLUG_SQL = "SELECT slug FROM org WHERE id = ?";
export const PICKER_PATH = "/orgs";
export async function landingOf(env, r) {
  if (!r || !r.seat) return "/";
  if (r.session === "account" && (Number(r.seatCount) > 1 || Number(r.pendingCount) > 0)) return PICKER_PATH;
  const row = await db(env).prepare(ORG_SLUG_SQL).bind(Number(r.seat.org)).first();
  return row && row.slug ? "/" + row.slug : "/";
}

// ---- the account's orgs (sprint 7, 7.4b: the picker at the root and the rail's org switcher; PLATFORM §2 items 8 and 9) ----
// ACCOUNT_ORGS_SQL: the account's ACTIVE seats, one per org, each with its org's name and path name and the seat's role, in org
// order (org 1 first): ONE read on idx_people_account_seat (account_id, org; active seats only), then each org row by its
// primary key. Bound to an account id the SESSION carries (tokens.account_id, set only when the account's own passphrase
// proved it: migrate-073) — never a typed id — so it lists only the reader's own account's seats: no widening (a seat
// session carries none and lists nothing). At most 50 (the picker's page).
export const ACCOUNT_ORGS_SQL = "SELECT o.slug, o.name, p.role FROM people p INDEXED BY idx_people_account_seat JOIN org o ON o.id = p.org " +
  "WHERE p.account_id = ?1 AND p.active = 1 AND " + INVITE_MARK_HOLDS("p") + " ORDER BY p.org ASC LIMIT 50";
// orgsOfAccount(env, accountId) -> [{ slug, name, role }] (the account's orgs), [] for none
export async function orgsOfAccount(env, accountId) {
  if (!accountId) return [];
  const rows = ((await db(env).prepare(ACCOUNT_ORGS_SQL).bind(String(accountId)).all()).results) || [];
  return rows.filter((r) => r && r.slug).map((r) => ({ slug: String(r.slug), name: String(r.name || r.slug), role: String(r.role || "") }));
}
// ---- an ACCOUNT grant's seat, each request (sprint 7, 7.5a; src/oauthgrants.js: the two grant kinds) ----
// ACCOUNT_GRANT_SEAT_SQL: the seat an account grant acts as on this request — ONE of the account's OWN active seats (the account
// id the grant carries: set only when the account's passphrase proved it at the OAuth sign-in, never a typed id), in this order:
// the org the call names (?2: its path name, '' for none), the grant's current org (?3), the org-1 seat (?4: HOME_ORG), the
// oldest. So a call naming an org where the account holds no active seat gets the default seat (src/mcp.js then refuses the call:
// the named org is not the request's). With it, the account's passphrase as it stands (the grant's stamp is compared to it:
// src/oauthgrants.js accountCred). One read on idx_people_account (account_id, org): the account's own seats only, at most a
// handful. (8.3a, the sprint-7 review's C2; migrate-077) With the seat's grants epoch, p.reissued_at: the moment its org's admin
// last reissued it — the grant stands in that seat only if it was made after (src/oauthgrants.js accountGrantStands); the
// column rides this row, so the epoch costs no read. {cols}: the profile columns (src/core.js withProfile). Binds: ?1 the
// account, ?2 the named path name, ?3 the grant's org, ?4 HOME_ORG.
// No one is signed in yet: src/core.js signIn takes the org off the row it answers.
export const ACCOUNT_GRANT_SEAT_SQL = "SELECT p.id, p.name, p.email, p.role, p.title, p.capture_mode, p.lane, p.org{cols}, p.reissued_at, a.pass_hash AS account_hash, a.pass_salt AS account_salt " +
  "FROM accounts a JOIN people p ON p.account_id = a.id AND p.active = 1 WHERE a.id = ?1 AND (a.invited_org IS NULL OR a.invited_org = p.org) " +
  "ORDER BY (p.org = (SELECT o.id FROM org o WHERE o.slug = ?2)) DESC, (p.org = ?3) DESC, (p.org = ?4) DESC, p.created_at ASC LIMIT 1";
// ---- the browser's session under an org's address (src/core.js authenticateSession: THE BROWSER'S SESSION there) ----
// SESSION_AT_SQL: the token by its primary key, the account's seat in the address's org by idx_people_account_seat, the person by
// its primary key. Binds: ?1 the token's hash, ?2 now, ?3 the address's org. (sprint 12's review) an ACCOUNT session of an
// account an org's invite link marked reads as a seat of that org alone (INVITE_MARK_HOLDS); a SEAT session (no account) is its
// own seat's, as before. Here, not in core.js, because it names accounts (tools/check-scoped-data.py's account rule).
export const SESSION_AT_SQL = "SELECT p.id, p.name, p.email, p.role, p.title, p.capture_mode, p.lane, p.org{cols}, t.project AS token_project, t.account_id AS session_account " +
  "FROM tokens t JOIN people p ON p.id = COALESCE((SELECT s.id FROM people s WHERE s.account_id = t.account_id AND s.org = ?3 AND s.active = 1), t.person_id) " +
  "WHERE t.token_hash = ?1 AND t.revoked = 0 AND t.expires_at > ?2 AND p.active = 1 AND p.org = ?3 " +
  "AND (t.account_id IS NULL OR " + INVITE_MARK_HOLDS("p") + ")";
// sessionAtRow(env, cols, hash, at, org) -> the session's seat row under the address, or null ({cols}: src/core.js withProfile's)
export const sessionAtRow = (env, cols, hash, at, org) => db(env).prepare(SESSION_AT_SQL.replace("{cols}", cols)).bind(hash, at, org).first();
// normOrgArg(v) -> a call's `orgSlug` as an org's path name is spelled (lower-cased, trimmed, one leading "/" dropped), "" for none
export const normOrgArg = (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/^\//, "") : "");
// accountGrantSeat(env, accountId, { want, org }, cols) -> the seat row (with account_hash, account_salt), or null (no account, or
// no active seat of it anywhere: the grant no longer stands)
export async function accountGrantSeat(env, accountId, { want = "", org = null } = {}, cols = "") {
  if (!accountId) return null;
  const grantOrg = Number.isSafeInteger(Number(org)) && Number(org) >= 1 ? Number(org) : 0;
  return await db(env).prepare(ACCOUNT_GRANT_SEAT_SQL.replace("{cols}", cols)).bind(String(accountId), normOrgArg(want), grantOrg, HOME_ORG).first();
}

// countSignIn(env, r, ok) — the attempt, in the org of the sign-in (r.org: the chosen seat's, else HOME_ORG), on the account
// (or the address typed when none answered), with its client (r.client): a success names it only when the ACCOUNT's passphrase
// proved it (r.session "account") or the operator's code did (r.vouched) — THE LOCKOUT's vouch
export async function countSignIn(env, r, ok) {
  const client = clientNamed(r.client, ok, r.session === "account" || r.vouched === true);
  await db(env).prepare(ATTEMPT_AT_ADDRESS_SQL).bind(uid(), r.email, ok ? 1 : 0, now(), r.org, r.account ? r.account.id : null, client).run();
}

// ---- creating an org (sprint 7, 7.3; src/orgs.js): the ACCOUNT's passphrase alone proves its holder ----
// accountProof(env, url, { email, password, client }) -> { verdict, email, org, account }
//   verdict: "ok" (the password is the ACCOUNT's own passphrase) · "wrong" (no account, an account with no passphrase yet, or
//   any other value — a seat's own secret included: what an org's admin minted or set never creates an org) · "locked" (the
//   account's lockout, keyed by the account and the client: nothing compared, nothing written) · "invited" (sprint 12, 12.3: the
//   account's own passphrase, but an org's invite link set it — accounts.invited_org — so it proves only what that org's admin
//   could hand over: it creates no org; the beta's orgs stay on the waitlist, the operator's code alone makes an account that does)
// No seat is asked for (a person freshly signed up holds none). The attempt counts as a sign-in's does (countSignIn: the
// account's lockout, in the org the address serves), and every refusal costs one passphrase hash, whether or not an account
// answered the email, so the time taken says nothing about which emails hold one.
export async function accountProof(env, url, { email, password, client = "" } = {}) {
  const e = normEmail(email);
  const account = e ? await db(env).prepare(ACCOUNT_BY_EMAIL_SQL).bind(e).first() : null;
  const home = account ? (await seatsOf(env, account.id))[0] : null;
  const out = { email: e, org: home ? Number(home.org) : HOME_ORG, account: account || null, seat: null, client: client ? String(client) : "" };
  if (await lockOf(env, account ? account.id : null, e, out.client)) return { ...out, verdict: "locked" };
  const comparable = !!(account && account.pass_hash && account.pass_salt);
  const ok = comparable ? await secretMatches(password, account) : (await pbkdf2(String(password == null ? "" : password), NO_SALT), false);
  await countSignIn(env, { ...out, vouched: ok }, ok);   // only the account's own passphrase gets here as ok: it vouches
  return { ...out, verdict: !ok ? "wrong" : account.invited_org != null ? "invited" : "ok" };
}

// ---- the signed-in seat's own secrets (src/secrets.js: /profile) ----
// seatWithAccount(env, personId) -> the reader's seat (of the reader's org) with its account's passphrase, or null
export const seatWithAccount = (env, personId) => db(env).prepare(SEAT_WITH_ACCOUNT_SQL).bind(personId).first();
// bucketOf(seat) -> the attempt log's address for a seat: its email (the account's spelling), else its id
export const bucketOf = (seat) => normEmail(seat && seat.email) || `id:${seat && seat.id}`;
// seatLocked(env, seat, { client, vouched }) -> true when the seat's re-check is locked out (THE LOCKOUT, lockOf): client, the
// credential the request rode in on (credentialClient); vouched, that credential is an ACCOUNT session of this seat's account
export const seatLocked = (env, seat, { client = "", vouched = false } = {}) => lockOf(env, (seat && seat.account_id) || null, bucketOf(seat), client, { vouched });
// countSeatAttempt(env, seat, ok, { client, vouches }) — a re-check of a signed-in seat's current secret, counted like a sign-in
// (the seat's org), with its client (a success names it only when the account's passphrase proved it: vouches)
export const countSeatAttempt = (env, seat, ok, { client = "", vouches = false } = {}) =>
  db(env).prepare(ATTEMPT_SQL).bind(uid(), bucketOf(seat), ok ? 1 : 0, now(), (seat && seat.account_id) || null, clientNamed(client, ok, vouches)).run();
// setAccountPassphrase(env, seat, hash, salt) -> true when the account took it (only while it still holds the passphrase the
// holder proved: seat.account_hash / account_salt, read by seatWithAccount)
export async function setAccountPassphrase(env, seat, hash, salt) {
  const r = await db(env).prepare(SET_ACCOUNT_PASSPHRASE_SQL).bind(hash, salt, now(), seat.account_id, seat.account_hash, seat.account_salt).run();
  return ((r && r.meta && r.meta.changes) || 0) >= 1;
}
// THE ONE REVOCATION RULE (sprint 7's review, B1 + A2 + A4): the HOLDER's own action proven by the ACCOUNT's passphrase (a
// passphrase change, a key rotation on /profile) ends EVERY session of the account in every org — its account sessions and every
// seat's own — and every connected app of every seat (src/secrets.js); an org ADMIN's seat action (Reissue, set-password, remove)
// ends only that seat's SEAT sessions (tokens.account_id NULL) and its SEAT grants (src/admin.js): an account session or an
// account grant was never made with that seat's secret, and simply stops reading the seat once it is removed (SESSION_AT_SQL and
// ACCOUNT_GRANT_SEAT_SQL ask for an active seat). So no org's admin can sign a person out of another org, and a stolen account
// session never outlives its holder's own "my passphrase leaked".
// END_ACCOUNT_SESSIONS_SQL: every live session of the account (its own account sessions, and the seat sessions of each of its
// seats in every org), but the one named by ?2 (the request the holder proved it on; NULL: none kept). Binds: ?1 the account,
// ?2 the token hash kept
export const END_ACCOUNT_SESSIONS_SQL = "UPDATE tokens SET revoked = 1 WHERE revoked = 0 AND (account_id = ?1 OR person_id IN (SELECT id FROM people WHERE account_id = ?1)) AND token_hash IS NOT ?2";
// endAccountSessions(env, accountId, keepHash) -> the sessions ended (every one of the account's, but keepHash's)
export async function endAccountSessions(env, accountId, keepHash = null) {
  if (!accountId) return 0;
  const r = await db(env).prepare(END_ACCOUNT_SESSIONS_SQL).bind(String(accountId), keepHash || null).run();
  return (r && r.meta && r.meta.changes) || 0;
}
// accountSeatIds(env, accountId) -> every seat id of the account (its holder's own, in every org)
export async function accountSeatIds(env, accountId) {
  if (!accountId) return [];
  return (((await db(env).prepare(ACCOUNT_SEATS_SQL).bind(accountId).all()).results) || []).map((r) => String(r.id));
}

// ---- the admin's doors (src/admin.js) ----
// seatSpan(env, personId) -> { found, elsewhere }: a seat of the admin's org, and whether its account holds a seat in another
// org (any, active or not: the strict reading of the ruling, so a seat a removed member kept elsewhere still counts)
export async function seatSpan(env, personId) {
  const r = await db(env).prepare(SEAT_SPAN_SQL).bind(personId).first();
  return { found: !!r, elsewhere: !!(r && r.account_id && Number(r.elsewhere) === 1) };
}
// seatTaken(env, email) -> "active" (this email's account already holds an active seat in the admin's org) · "pending" (a seat
// there waits for its holder's yes) · "" (neither)
export async function seatTaken(env, email) {
  const e = normEmail(email);
  const r = e ? await db(env).prepare(SEAT_TAKEN_SQL).bind(e).first() : null;
  return !r ? "" : Number(r.active) === 1 ? "active" : "pending";
}
// seatNeedsConsent(env, email) -> true when a new seat for this email in the admin's org waits for its holder's yes (A1:
// SEAT_CONSENT_SQL — the account holds its own passphrase, or a seat in another org)
export async function seatNeedsConsent(env, email) {
  const e = normEmail(email);
  const r = e ? await db(env).prepare(SEAT_CONSENT_SQL).bind(e).first() : null;
  return !!(r && Number(r.ask) === 1);
}
// the words of an answer (POST /orgs/seat's JSON note, the picker's flash after a form): done, then each refusal
export const SEAT_ANSWER_WORDS = {
  accepted: "Seat accepted: the org is on your list now.",
  declined: "Seat declined: that org cannot sign you in, and nothing of yours reaches it.",
  not_yours: "No seat of yours waits under that id: nothing changed.",
  already_seated: "Your account already holds an active seat in that org: nothing changed.",
};
// answerSeat(env, token, seatId, word) -> { done: "accepted" | "declined" } | { error: "not_yours" | "already_seated" }: the
// holder's answer to one of their pending seats, through their own ACCOUNT session (the cookie's token; ACCEPT_SEAT_SQL,
// DECLINE_SEAT_SQL). Anything else — a seat that is not pending, another account's, a SEAT session, a dead one — changes nothing
// and answers not_yours, the same for every case.
export async function answerSeat(env, token, seatId, word) {
  if (!token || !seatId || (word !== "accept" && word !== "decline")) return { error: "not_yours" };
  const hash = await sha256(String(token));
  let r;
  try { r = await db(env).prepare(word === "accept" ? ACCEPT_SEAT_SQL : DECLINE_SEAT_SQL).bind(String(seatId), hash, now()).run(); }
  catch (e) {
    // idx_people_account_seat: the account already holds an active seat in that org (one account, one seat per org)
    if (/UNIQUE|constraint/i.test(String((e && e.message) || e))) return { error: "already_seated" };
    throw e;
  }
  return ((r && r.meta && r.meta.changes) || 0) === 1 ? { done: word === "accept" ? "accepted" : "declined" } : { error: "not_yours" };
}

// ---- the sign-up (sprint 7, 7.2; migrate-071): the operator's one-time code, bound to its email ----
// THE CODE: 20 characters of Crockford's base32 (no I, L, O or U: 100 bits), shown as four groups of five. A person may type it
// in any case, with or without the dashes and spaces; O reads as 0, I and L as 1 (the alphabet holds none of them).
export const SIGNUP_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SIGNUP_CODE_LENGTH = 20;
export const normCode = (c) => String(c == null ? "" : c).toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
// signupCodeHash(code) -> the hash signup_codes keeps (the code itself is kept nowhere): sha256 over a domain tag and the
// normalised code (the operator's tool computes it with this same function)
export const signupCodeHash = (code) => sha256(`sharingu-signup-code:v1:${normCode(code)}`);
// sameDigest(a, b) -> true when the two hex digests are equal, in time that depends only on their lengths (never early out)
export function sameDigest(a, b) {
  const x = String(a || ""), y = String(b || "");
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) | 0) ^ (y.charCodeAt(i) | 0);
  return d === 0 && x.length > 0;
}
const NO_DIGEST = "0".repeat(64);   // compared when the email has no open code, so every refusal costs the same

// the email's ONE open code (idx_signup_open: at most one): THE binding of a code to its email — a code is looked up by the
// email typed, never by itself, so a code the operator handed for one email opens no other
export const SIGNUP_OPEN_SQL = "SELECT id, code_hash, expires_at FROM signup_codes WHERE email = ?1 AND used_at IS NULL AND revoked_at IS NULL";
// the spend: only while the code is still open, unexpired and the one compared; it records how it was used (the account as it
// stood BEFORE this batch: none, one with no passphrase, one with a passphrase) and THIS request's nonce (spent_by), on which
// every later statement of the batch is conditional. Binds: ?1 now, ?2 the nonce, ?3 the email, ?4 the code's id, ?5 its hash
export const SIGNUP_SPEND_SQL = "UPDATE signup_codes SET used_at = ?1, spent_by = ?2, used_how = (CASE WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE email = ?3) THEN 'created' " +
  "WHEN EXISTS (SELECT 1 FROM accounts WHERE email = ?3 AND pass_hash IS NOT NULL) THEN 'reset' ELSE 'set' END) " +
  "WHERE id = ?4 AND code_hash = ?5 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?1";
// (c) the reset: every live session of every seat of the account, in every org — only when the account HAD a passphrase (read
// before the account statement below, in the same batch) and only when this request spent the code. Binds: ?1 the email,
// ?2 the code's id, ?3 the nonce
export const SIGNUP_END_SESSIONS_SQL = "UPDATE tokens SET revoked = 1 WHERE revoked = 0 AND person_id IN (SELECT p.id FROM people p JOIN accounts a ON a.id = p.account_id " +
  "WHERE a.email = ?1 AND a.pass_hash IS NOT NULL) AND EXISTS (SELECT 1 FROM signup_codes WHERE id = ?2 AND spent_by = ?3)";
// (a) (b) (c) the account takes the passphrase: made when the email has none, else updated — only when this request spent the
// code; the operator's code confirms the email, so an invite link's mark ends with it (invited_org NULL: THE INVITE LINK). Binds: ?1 a new account id, ?2 the email, ?3 the hash, ?4 the salt, ?5 now, ?6 the code's id, ?7 the nonce
export const SIGNUP_ACCOUNT_SQL = "INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?5 " +
  "WHERE EXISTS (SELECT 1 FROM signup_codes WHERE id = ?6 AND spent_by = ?7) " +
  "ON CONFLICT (email) DO UPDATE SET pass_hash = excluded.pass_hash, pass_salt = excluded.pass_salt, updated_at = excluded.updated_at, invited_org = NULL";

// signUp(env, url, { email, code, password, prefer, client }) -> { verdict, email, org, account, seat, how }
//   verdict: "ok" (the code spent, the account holds the passphrase; seat: its active seat in the org the address serves, or
//   null: signed up, no seat here) · "refused" (the ONE answer: an email with no open code, a wrong, used, expired or revoked
//   code, a spend another request won) · "locked" (the account's lockout, keyed by the account and the client, and the code
//   is not a valid open one: its attempt counted)
// A VALID code passes the lock (8.3a, the sprint-7 review's A3): the operator handed it over for this email, possession proof of
// it, so a stranger's failures on the email never keep its holder from signing up (or resetting); and its success vouches for
// the client (THE LOCKOUT).
// The caller has checked the fields (src/signup.js signupProblem). Writes: the attempt (always, once checked), and on "ok" the
// spend, the account and, for a reset, the end of every session of the account (one batch), then its connected apps.
export async function signUp(env, url, { email, code, password, prefer = null, client = "" } = {}) {
  const e = normEmail(email);
  const before = e ? await db(env).prepare(ACCOUNT_BY_EMAIL_SQL).bind(e).first() : null;
  const home = before ? (await seatsOf(env, before.id, prefer))[0] : null;
  const out = { email: e, org: home ? Number(home.org) : HOME_ORG, account: before || null, seat: null, how: null, session: null, client: client ? String(client) : "" };
  const locked = await lockOf(env, before ? before.id : null, e, out.client);
  const hash = await signupCodeHash(code);
  const open = e ? await db(env).prepare(SIGNUP_OPEN_SQL).bind(e).first() : null;
  const at = now();
  const matches = sameDigest(hash, open ? open.code_hash : NO_DIGEST);
  if (!open || !matches || !(String(open.expires_at) > at)) { await countSignIn(env, out, false); return { ...out, verdict: locked ? "locked" : "refused" }; }
  const salt = hex(16), ph = await pbkdf2(String(password), salt), nonce = hex(16);
  const res = await db(env).batch([
    db(env).prepare(SIGNUP_SPEND_SQL).bind(at, nonce, e, open.id, hash),
    db(env).prepare(SIGNUP_END_SESSIONS_SQL).bind(e, open.id, nonce),
    db(env).prepare(SIGNUP_ACCOUNT_SQL).bind(hex(16), e, ph, salt, at, open.id, nonce),
  ]);
  const spent = ((res && res[0] && res[0].meta && res[0].meta.changes) || 0) === 1;
  if (!spent) { await countSignIn(env, out, false); return { ...out, verdict: "refused" }; }
  const account = await db(env).prepare(ACCOUNT_BY_EMAIL_SQL).bind(e).first();
  const how = !before ? "created" : before.pass_hash ? "reset" : "set";
  // (c) the reset: the account's connected apps end with its sessions (G2 M1's rule, as a proven passphrase change on /profile)
  if (how === "reset") for (const id of await accountSeatIds(env, account.id)) await revokeOAuthGrants(env, id);
  // the session the sign-up opens is the ACCOUNT's (its passphrase just proven by the operator's code), on the chosen seat; with
  // no active seat but seats waiting for its yes, anchored at the oldest of those (A1: it opens only the picker); ask: the account
  // holds more than one active seat and nothing named one (a JSON sign-up then signs in nothing: the person names the org);
  // waits (the owner, 2026-10-09): an active seat, a seat waiting for its yes too, nothing named — the JSON sign-up signs in nothing
  const seats = account ? await seatsOf(env, account.id, prefer) : [];
  const pending = account ? await pendingOf(env, account.id) : [];
  const seat = seats[0] || pending[0] || null;
  const named = Number.isSafeInteger(prefer) && !!seats[0] && Number(seats[0].org) === prefer;
  const r = { ...out, org: seat ? Number(seat.org) : out.org, account, seat, how, session: seat ? "account" : null, seatCount: seats.length,
    pendingCount: pending.length, pendingOnly: !seats.length && !!pending.length, ask: seats.length > 1 && !named,
    waits: !!seats.length && !!pending.length && !named, verdict: "ok" };
  await countSignIn(env, { ...r, vouched: true }, true);   // the operator's code proved the email's holder: it vouches
  return r;
}

// ---- the invite link (sprint 12, 12.3; migrate-079): THE INVITE LINK, above ----
// (sprint 12's review) a link is for a seat NEVER USED, whose account holds no passphrase: an admin's "New invite link" on a working
// seat would set its holder's passphrase over the one they sign in with — that seat's secret is reset with Reset passphrase
// (rotate-key) or set-password instead. SEAT_NEVER_USED(p): no session ever minted on the seat (tokens: a web or API sign-in), nothing
// filed (transmission) or logged (events) by it, no sign-in counted for its account in its org since the seat was made
// (login_attempts ok: the OAuth form's too) — each one index probe. INVITE_SEAT_USE_SQL reads it, and the account's passphrase, for
// the admin's refusal (src/admin.js mintInvite); the mint's own INSERT carries SEAT_NEVER_USED too (a sign-in landing in between).
// Binds: ?1 the seat's id (the admin's org: {org})
export const SEAT_NEVER_USED = (p) => `NOT EXISTS (SELECT 1 FROM tokens ut WHERE ut.person_id = ${p}.id) AND NOT EXISTS (SELECT 1 FROM transmission ux WHERE ux.submitter = ${p}.id) ` +
  `AND NOT EXISTS (SELECT 1 FROM events ue WHERE ue.person_id = ${p}.id) AND NOT EXISTS (SELECT 1 FROM login_attempts ul WHERE ul.account_id = ${p}.account_id AND ul.at >= ${p}.created_at AND ul.ok = 1 AND ul.org = ${p}.org)`;
export const INVITE_SEAT_USE_SQL = "SELECT (a.pass_hash IS NOT NULL) AS holds, (CASE WHEN " + SEAT_NEVER_USED("p") + " THEN 0 ELSE 1 END ) AS used " +
  "FROM people p LEFT JOIN accounts a ON a.id = p.account_id WHERE p.id = ?1 AND p.org = {org}";
// inviteSeatUse(env, personId) -> { holds, used } (each 1 or 0), or null (no such seat of the reader's org)
export const inviteSeatUse = (env, personId) => db(env).prepare(INVITE_SEAT_USE_SQL).bind(String(personId)).first();
export const INVITE_DAYS = 7;
export const INVITE_TOKEN_BYTES = 24;   // 48 hex characters: 192 bits
// the link's path: a platform door (POST /signup's twin page, GET /signup?via=invite); the token follows it as the fragment
export const INVITE_PATH = "/signup?via=invite";
export const INVITE_TOKEN_RE = /^[0-9a-f]{48}$/;
// normInvite(v) -> the token as typed or pasted: the whole link is taken too (what follows its last "#"), spaces dropped, lower-cased
export function normInvite(v) {
  let x = String(v == null ? "" : v).trim();
  const h = x.lastIndexOf("#");
  if (h >= 0) x = x.slice(h + 1);
  return x.replace(/\s+/g, "").toLowerCase();
}
// inviteTokenHash(token) -> the hash seat_invites keeps (the token itself is kept nowhere)
export const inviteTokenHash = (token) => sha256(`sharingu-invite:v1:${normInvite(token)}`);
// seatStamp(seat) -> a digest of the seat's own secrets as they stand (its key's hash and its passphrase's): the link is bound to
// them, so a Reissue (rotate-key), a set-password or the holder's own key rotation ends it
export const seatStamp = (seat) => sha256(`sharingu-invite-seat:v1:${(seat && seat.key_hash) || ""}:${(seat && seat.pass_hash) || ""}`);
// whether the seat's account holds another seat, active or waiting (any org): ONE text, read by the link's read and its spend
export const INVITE_OTHER_SEAT = "EXISTS (SELECT 1 FROM people x WHERE x.account_id = p.account_id AND x.id <> p.id AND (x.active = 1 OR x.pending = 1))";
// the link's one read, by its hash: open and unexpired, with its seat (in the link's org) and that seat's account as they stand.
// Bound as values: no one is signed in yet, so the layer's {org} has nothing to say — the org is the link row's own, and the seat
// is joined in THAT org only. Binds: ?1 the token's hash, ?2 now
export const INVITE_OPEN_SQL = "SELECT i.id, i.org, i.person_id, i.email, i.seat_stamp, p.key_hash, p.pass_hash, p.active, p.pending, lower(trim(p.email)) AS seat_email, " +
  "p.account_id, a.email AS account_email, a.pass_hash AS account_hash, " +
  INVITE_OTHER_SEAT + " AS elsewhere " +
  "FROM seat_invites i JOIN people p ON p.id = i.person_id AND p.org = i.org LEFT JOIN accounts a ON a.id = p.account_id " +
  "WHERE i.token_hash = ?1 AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?2";
// THE BATCH. 1 · the spend: only while the link is open and unexpired, and its seat still stands exactly as read — active, in the
// link's org, the link's email, the secrets read (?5 ?6) — and its account still has no passphrase and no other seat; it records
// THIS request's nonce (spent_by), on which the next statement is conditional. Binds: ?1 now, ?2 the nonce, ?3 the link's id,
// ?4 the token's hash, ?5 the seat's key hash as read, ?6 its passphrase hash as read
export const INVITE_SPEND_SQL = "UPDATE seat_invites SET used_at = ?1, spent_by = ?2 WHERE id = ?3 AND token_hash = ?4 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?1 " +
  "AND EXISTS (SELECT 1 FROM people p JOIN accounts a ON a.id = p.account_id WHERE p.id = seat_invites.person_id AND p.org = seat_invites.org AND p.active = 1 AND p.pending = 0 " +
  "AND lower(trim(p.email)) = seat_invites.email AND a.email = seat_invites.email AND p.key_hash IS ?5 AND p.pass_hash IS ?6 AND a.pass_hash IS NULL " +
  "AND NOT " + INVITE_OTHER_SEAT + ")";
// 2 · the account takes the passphrase and the link's org as its mark (invited_org), only when this request spent THAT link and
// it still has none. Binds: ?1 the hash, ?2 the salt, ?3 the link's org, ?4 now, ?5 the account, ?6 the link's id, ?7 the nonce
export const INVITE_ACCOUNT_SQL = "UPDATE accounts SET pass_hash = ?1, pass_salt = ?2, invited_org = ?3, updated_at = ?4 WHERE id = ?5 AND pass_hash IS NULL " +
  "AND EXISTS (SELECT 1 FROM seat_invites WHERE id = ?6 AND spent_by = ?7 AND org = ?3)";

// redeemInvite(env, url, { token, password, client }) -> { verdict, email, org, account, seat, session, how, ... }
//   verdict: "ok" (the link spent, the account holds the passphrase, its one seat the invited one: the caller mints the ACCOUNT
//   session, mintSession) · "account_stands" (the email's account has a passphrase, or a seat in another org: nothing written; the
//   holder signs in and answers the seat on the org list) · "refused" (the ONE answer: no such open link, expired, used, revoked,
//   its seat removed, reissued or pending, a spend another request won; nothing written)
// The caller has checked the fields (src/signup.js inviteProblem). Writes: on "ok" the spend and the passphrase (one batch), then
// the attempt (a success: it vouches for the client, as the operator's code does). A refusal writes nothing.
export async function redeemInvite(env, url, { token, password, client = "" } = {}) {
  const hash = await inviteTokenHash(token), at = now();
  const row = await db(env).prepare(INVITE_OPEN_SQL).bind(hash, at).first();
  const out = { email: row ? String(row.email) : "", org: row ? Number(row.org) : HOME_ORG, account: null, seat: null, how: null, session: null, client: client ? String(client) : "" };
  if (!row || Number(row.active) !== 1 || Number(row.pending) !== 0 || !row.account_id || row.seat_email !== row.email || row.account_email !== row.email
    || !sameDigest(await seatStamp(row), row.seat_stamp)) return { ...out, verdict: "refused" };
  if (row.account_hash != null || Number(row.elsewhere) === 1) return { ...out, verdict: "account_stands" };
  const salt = hex(16), ph = await pbkdf2(String(password), salt), nonce = hex(16);
  const res = await db(env).batch([
    db(env).prepare(INVITE_SPEND_SQL).bind(at, nonce, row.id, hash, row.key_hash ?? null, row.pass_hash ?? null),
    db(env).prepare(INVITE_ACCOUNT_SQL).bind(ph, salt, Number(row.org), at, String(row.account_id), row.id, nonce),
  ]);
  const changed = (i) => ((res && res[i] && res[i].meta && res[i].meta.changes) || 0) === 1;
  if (!changed(0) || !changed(1)) return { ...out, verdict: "refused" };
  const account = await db(env).prepare(ACCOUNT_BY_EMAIL_SQL).bind(String(row.email)).first();
  const seat = (await seatsOf(env, account && account.id, Number(row.org))).find((x) => String(x.id) === String(row.person_id)) || null;
  const r = { ...out, account, seat, how: "invited", session: seat ? "account" : null, seatCount: seat ? 1 : 0, pendingCount: 0, verdict: "ok" };
  await countSignIn(env, { ...r, vouched: true }, true);   // the link the org's admin handed over proved it: it vouches, as a code does
  return r;
}

// ---- THE BETA'S PLACES, read by the worker (sprint 21, 21.1; src/beta.js: the cap and the two counts the operator's allow makes
// before it mints, tools/operator.mjs betaPlaces). Here because its statements name signup_codes and accounts, whose one module this
// is. Two aggregate statements in one batch: each answers one count (SQL aggregates), never the rows themselves.
// betaCount(env, at) -> { cap, orgs, codes, taken, left } at time `at` (the codes unexpired then)
export async function betaCount(env, at = now()) {
  const [o, c] = await db(env).batch([db(env).prepare(BETA_ORGS_SQL), db(env).prepare(BETA_CODES_SQL).bind(at, null)]);
  const n = (r) => Number((((r && r.results) || [])[0] || {}).n || 0);
  return placesOf(n(o), n(c));
}
