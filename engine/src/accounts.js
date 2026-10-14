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
//   · it sets the ACCOUNT's passphrase ONLY for an account that is new in all but name: no passphrase, no Google subject (sprint 21,
//     21.4c: its holder signed in by Google), and no active or pending seat but the invited one (the account add-person's own seat made: migrate-070's people_account_attach). Then the invitee is
//     signed in (an ACCOUNT session) on that seat, in that org, and lands there — no operator step.
//   · any other account (one with a passphrase or a Google subject, or a seat in another org) is "account_stands": the link sets and changes NOTHING
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
import { SESSION_TOKEN_PREFIX } from "./tenant.js";
import { uid, now, pbkdf2, sha256, hex } from "./util.js";
import { revokeOAuthGrants } from "./oauthgrants.js";
import { BETA_ORGS_SQL, BETA_CODES_SQL, BETA_APPROVED_SQL, placesOf } from "./beta.js";   // sprint 21, 21.1: the beta's places, one source with the operator's
import { RESET_MINUTES } from "./mails.js";   // sprint 21, 21.4a: a reset link's life, said in its email too

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
// passphrase (sprint 21, 21.4c: or a Google subject its holder linked by signing in), or an active or pending seat in ANOTHER org. No row of that org leaves (a yes or no). No account: no row (active).
export const SEAT_CONSENT_SQL = "SELECT (a.pass_hash IS NOT NULL OR a.google_sub IS NOT NULL OR EXISTS (SELECT 1 FROM people o WHERE o.account_id = a.id AND o.org <> {org} AND (o.active = 1 OR o.pending = 1))) AS ask " +
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
//   account's passphrase, and the account holds no active seat and no pending one in any org: no org session; a browser's sign-in
//   then opens an ACCOUNT SESSION, THE ACCOUNT FLOW below) · "unverified" (sprint 21, 21.4a: the email's newest unverified join
//   holds this passphrase — no account answers the email, or one does and the passphrase is none of its own: check your inbox)
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
  // A6: one passphrase hash when no account answers, as one does when it answers, so the time says nothing of who holds one —
  // (sprint 21, 21.4a) compared with the email's newest unverified join's passphrase when there is one (THE ACCOUNT FLOW): the
  // person who joined is told to check their inbox, anyone else gets the one "wrong"
  if (!account) {
    const pw = String(password == null ? "" : password);
    const join = e ? await db(env).prepare(UNVERIFIED_PASS_SQL).bind(e, now()).first() : null;
    const ok = join && join.pass_hash && join.pass_salt ? (await pbkdf2(pw, join.pass_salt)) === join.pass_hash : (await pbkdf2(pw, NO_SALT), false);
    return { ...out, verdict: ok && pw ? "unverified" : "wrong" };
  }
  const seats = await seatsOf(env, account.id, prefer);
  const want = normOrgArg(pick);
  const picked = want ? seats.find((s) => String(s.org_slug) === want) || null : null;
  const chosen = picked || seats[0] || null;
  if (chosen) out.org = Number(chosen.org);
  out.seatCount = seats.length;   // 7.4b: an ACCOUNT session with seats in several orgs lands on the picker (landingOf)
  if (await secretMatches(password, account)) return accountSignedIn(env, out, account, seats, { prefer, want });
  for (const s of seats.slice(0, SEAT_TRIES)) {
    if (!sameSecret(account, s) && (await secretMatches(password, s))) return { ...out, org: Number(s.org), seat: s, session: "seat", verdict: "ok" };
  }
  // (21.4a) a join for this account's email holds this passphrase (its link was sent to no one: "you already have an account"): the
  // same "check your inbox" a join for an unknown email answers, so a join then a sign-in never tells which emails hold an account
  const join = await db(env).prepare(UNVERIFIED_PASS_SQL).bind(e, now()).first();
  if (join && (await secretMatches(password, join))) return { ...out, verdict: "unverified" };
  return { ...out, verdict: "wrong" };
}
// accountSignedIn(env, out, account, seats, { prefer, want }) -> the sign-in's answer once the ACCOUNT's holder is proven (its
// passphrase; sprint 21, 21.4c: or Google's verified email, googleSignIn): an ACCOUNT session on the chosen seat (ask, waits,
// pickMissed and orgs as above), else anchored at its oldest pending seat (pendingOnly), else no_seat_here
async function accountSignedIn(env, out, account, seats, { prefer = null, want = "" } = {}) {
  const picked = want ? seats.find((s) => String(s.org_slug) === want) || null : null;
  const chosen = picked || seats[0] || null;
  const pending = await pendingOf(env, account.id);
  const named = !!picked || (Number.isSafeInteger(prefer) && !!chosen && Number(chosen.org) === prefer);
  const acct = { ...out, org: chosen ? Number(chosen.org) : out.org, seatCount: seats.length, session: "account", pendingCount: pending.length };
  if (chosen) return { ...acct, seat: chosen, verdict: "ok", ask: seats.length > 1 && !named, waits: pending.length > 0 && !named, pickMissed: !!want && !picked,
    orgs: seats.map((s) => ({ slug: String(s.org_slug), name: String(s.org_name || s.org_slug) })) };
  if (pending.length) return { ...acct, org: Number(pending[0].org), seat: pending[0], pendingOnly: true, verdict: "ok" };
  return { ...out, seatCount: seats.length, verdict: "no_seat_here" };
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
// openSession(env, r, { device }) -> { token, expires } | null: THE browser session's mint, one path for every door that signs a
// person in (POST /login, POST /signup and its invite link, and since sprint 21, 21.P D17, POST /orgs's form): a FRESH random
// token (never one the request carried: no fixation), only its hash stored, SESSION_DAYS long, by mintSession's conditional
// INSERT on the sign-in's own answer `r`; null when it minted nothing (a rotate or a passphrase change landed meanwhile:
// LOGIN_SESSION_SQL's EXISTS). The caller sets the cookie (src/core.js sessionSetCookie) or answers the token to a script.
export const SESSION_DAYS = 90;
export async function openSession(env, r, { device = "unknown" } = {}) {
  const token = SESSION_TOKEN_PREFIX + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const minted = await mintSession(env, r, { tokenHash: await sha256(token), device: String(device).slice(0, 80), at: now(), expires });
  return ((minted && minted.meta && minted.meta.changes) || 0) >= 1 ? { token, expires } : null;
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
//   · "waiting" (sprint 21, 21.4a: the account's own passphrase, but its email holds neither a used operator's code nor an approved
//   request — a verified person still in line: mayFound, THE ACCOUNT FLOW)
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
  if (ok && account.invited_org == null && !(await mayFound(env, e))) return { ...out, verdict: "waiting" };
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
// (sprint 12's review) a link is for a seat NEVER USED, whose account holds no passphrase (21.4c: and no Google subject): an admin's "New invite link" on a working
// seat would set its holder's passphrase over the one they sign in with — that seat's secret is reset with Reset passphrase
// (rotate-key) or set-password instead. SEAT_NEVER_USED(p): no session ever minted on the seat (tokens: a web or API sign-in), nothing
// filed (transmission) or logged (events) by it, no sign-in counted for its account in its org since the seat was made
// (login_attempts ok: the OAuth form's too) — each one index probe. INVITE_SEAT_USE_SQL reads it, and the account's passphrase, for
// the admin's refusal (src/admin.js mintInvite); the mint's own INSERT carries SEAT_NEVER_USED too (a sign-in landing in between).
// Binds: ?1 the seat's id (the admin's org: {org})
export const SEAT_NEVER_USED = (p) => `NOT EXISTS (SELECT 1 FROM tokens ut WHERE ut.person_id = ${p}.id) AND NOT EXISTS (SELECT 1 FROM transmission ux WHERE ux.submitter = ${p}.id) ` +
  `AND NOT EXISTS (SELECT 1 FROM events ue WHERE ue.person_id = ${p}.id) AND NOT EXISTS (SELECT 1 FROM login_attempts ul WHERE ul.account_id = ${p}.account_id AND ul.at >= ${p}.created_at AND ul.ok = 1 AND ul.org = ${p}.org)`;
export const INVITE_SEAT_USE_SQL = "SELECT (a.pass_hash IS NOT NULL OR a.google_sub IS NOT NULL) AS holds, (CASE WHEN " + SEAT_NEVER_USED("p") + " THEN 0 ELSE 1 END ) AS used " +
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
  "p.account_id, a.email AS account_email, a.pass_hash AS account_hash, a.google_sub AS account_google, " +
  INVITE_OTHER_SEAT + " AS elsewhere " +
  "FROM seat_invites i JOIN people p ON p.id = i.person_id AND p.org = i.org LEFT JOIN accounts a ON a.id = p.account_id " +
  "WHERE i.token_hash = ?1 AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?2";
// THE BATCH. 1 · the spend: only while the link is open and unexpired, and its seat still stands exactly as read — active, in the
// link's org, the link's email, the secrets read (?5 ?6) — and its account still has no passphrase and no other seat; it records
// THIS request's nonce (spent_by), on which the next statement is conditional. Binds: ?1 now, ?2 the nonce, ?3 the link's id,
// ?4 the token's hash, ?5 the seat's key hash as read, ?6 its passphrase hash as read
export const INVITE_SPEND_SQL = "UPDATE seat_invites SET used_at = ?1, spent_by = ?2 WHERE id = ?3 AND token_hash = ?4 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?1 " +
  "AND EXISTS (SELECT 1 FROM people p JOIN accounts a ON a.id = p.account_id WHERE p.id = seat_invites.person_id AND p.org = seat_invites.org AND p.active = 1 AND p.pending = 0 " +
  "AND lower(trim(p.email)) = seat_invites.email AND a.email = seat_invites.email AND p.key_hash IS ?5 AND p.pass_hash IS ?6 AND a.pass_hash IS NULL AND a.google_sub IS NULL " +
  "AND NOT " + INVITE_OTHER_SEAT + ")";
// 2 · the account takes the passphrase and the link's org as its mark (invited_org), only when this request spent THAT link and
// it still has none. Binds: ?1 the hash, ?2 the salt, ?3 the link's org, ?4 now, ?5 the account, ?6 the link's id, ?7 the nonce
export const INVITE_ACCOUNT_SQL = "UPDATE accounts SET pass_hash = ?1, pass_salt = ?2, invited_org = ?3, updated_at = ?4 WHERE id = ?5 AND pass_hash IS NULL AND google_sub IS NULL " +
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
  if (row.account_hash != null || row.account_google != null || Number(row.elsewhere) === 1) return { ...out, verdict: "account_stands" };
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
// is. Three aggregate statements in one batch: each answers one count (SQL aggregates), never the rows themselves.
// betaCount(env, at, email) -> { cap, orgs, codes, approved, taken, left } at time `at` (the codes unexpired then); email: one left out
// of the codes and the approvals (the operator page's Approve, as the operator's allow --request counts: the email being approved,
// whose own open code would otherwise count twice), none by default
export async function betaCount(env, at = now(), email = null) {
  const e = email ? normEmail(email) : null;
  const [o, c, a] = await db(env).batch([db(env).prepare(BETA_ORGS_SQL), db(env).prepare(BETA_CODES_SQL).bind(at, e), db(env).prepare(BETA_APPROVED_SQL).bind(at, e)]);
  const n = (r) => Number((((r && r.results) || [])[0] || {}).n || 0);
  return placesOf(n(o), n(c), n(a));
}

// ---- THE ACCOUNT FLOW (sprint 21, 21.4a; migrate-081; the owner's MCQ of 2026-10-14, the standard) ----
// JOIN: POST /request-access files the profile AND a passphrase as an UNVERIFIED request (src/requestaccess.js fileRequest: the
// passphrase's hash rides the request; no account row exists yet, so no sign-in, seat consent or org creation can ever read an
// unverified passphrase — an attacker's join for someone else's email prepares nothing anyone else's code reads) and sends ONE
// verification email. An email that already holds an account gets "you already have an account" instead (its passphrase never
// changes) and a request whose link goes to no one (it can never be verified), so a join then a sign-in with that passphrase answers
// "check your inbox" whether or not the email holds an account.
// VERIFY (verifyJoin): the link's GET only shows the confirm page (an email scanner that follows links spends nothing); its POST
// takes the link's token AND the passphrase — proof of the mailbox and of the join's own passphrase together, so a stranger's join
// for this address cannot be completed by its owner's click (the pre-account takeover) — and in ONE batch: the request verified
// (status open, verified_at: its place in line), the passphrase's hash cleared from it, the account made with it (an account
// with no passphrase takes it, as the operator's code does; one that has its own keeps it), and, when the account holds no seat,
// an ACCOUNT SESSION; (21.4b) the request then names that account and when (account_id, account_at: the person's path). The first verified request per email stands (migrate-081's idx_access_requests_verified, and the batch's
// guard before it).
// THE ACCOUNT SESSION (account_sessions): a browser session for an account that holds no seat — a person in line, approved, or
// signed up by the operator's code and before their org. It is the same cookie as an org session (__Host-ar_session), its token
// ACCOUNT_SESSION_PREFIX'd and kept in its OWN table by its hash, so nothing that reads tokens — an org's address
// (authenticateSession), /mcp, a bearer (keyRow), the OAuth form, sessionPlace at the root — can ever find it: it signs no one
// in to any org. Only accountSessionOf reads it, and only the root's account pages call that: the status page (GET /account),
// the org form's prefill (GET /orgs/new) and sign-out (GET /logout). It is minted only for an account whose passphrase was just
// proven (POST /login, the verification, a reset), that holds no active or pending seat and no invite mark, from a fresh random
// token (no fixation); a reset or sign-out revokes it.
// SIGN-IN: an email whose newest unverified join holds the passphrase typed (and none of its account's secrets is it) answers
// "unverified" (POST /login: check your inbox, and a resend) — for an unknown email after the one passphrase hash every sign-in for
// it costs; a verified account with no seat signs in to an account session (POST /login, a browser).
// RESET (startReset, finishReset): a link (account_resets: its hash, 30 minutes, single use) for an account the email names;
// spending it sets the new passphrase (the account rules), clears an invite mark (the link proves the email, as the operator's
// code does), ends EVERY session of the account — its org sessions in every org, its account sessions — its other reset links
// and its seats' connected apps, then signs the person in fresh.
// ORG CREATION waits for the approval (mayFound, read by accountProof): only an account whose email holds a USED operator's code
// or an APPROVED request creates an org — a verified person in line holds a passphrase now, and the beta's orgs stay on the
// waitlist.
export const ACCOUNT_SESSION_PREFIX = SESSION_TOKEN_PREFIX + "a_";
export const isAccountSessionToken = (t) => String(t == null ? "" : t).startsWith(ACCOUNT_SESSION_PREFIX);
// the newest unverified join's passphrase for an email with no account (the sign-in's one hash; idx_access_requests_email)
export const UNVERIFIED_PASS_SQL = "SELECT pass_hash, pass_salt FROM access_requests INDEXED BY idx_access_requests_email WHERE email = ?1 AND status = 'unverified' AND verify_expires > ?2 " +
  "ORDER BY created_at DESC LIMIT 1";
// the account session's one read (?1 the token's hash, ?2 now), with how and when its mint proved the account (21.4c: the step-up)
export const ACCOUNT_SESSION_SQL = "SELECT s.account_id, a.email, s.proven_how, s.proven_at FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?1 AND s.revoked = 0 AND s.expires_at > ?2";
// the mint, only while the account holds the passphrase just proven (?6), no seat (active or pending) and no invite mark: ?1 the
// token's hash, ?2 device, ?3 now, ?4 the expiry, ?5 the account
export const ACCOUNT_SESSION_MINT_SQL = "INSERT INTO account_sessions (token_hash, account_id, device, created_at, expires_at, revoked, proven_how, proven_at) SELECT ?1, a.id, ?2, ?3, ?4, 0, 'passphrase', ?3 FROM accounts a " +
  "WHERE a.id = ?5 AND a.pass_hash IS NOT NULL AND a.pass_hash = ?6 AND a.invited_org IS NULL AND NOT EXISTS (SELECT 1 FROM people p WHERE p.account_id = a.id AND (p.active = 1 OR p.pending = 1))";
export const END_ACCOUNT_SESSION_SQL = "UPDATE account_sessions SET revoked = 1 WHERE token_hash = ?1 AND revoked = 0";
// where an account session's person stands, ONE statement (?1 the account, ?2 its email): its seats (active or pending), whether
// the operator's code signed it up (a used code: approved), and the org it founded (its path name)
export const ACCOUNT_STANDING_SQL = "SELECT (SELECT COUNT(*) FROM people p WHERE p.account_id = ?1 AND (p.active = 1 OR p.pending = 1)) AS seats, " +
  "EXISTS (SELECT 1 FROM signup_codes s WHERE s.email = ?2 AND s.used_at IS NOT NULL) AS coded, (SELECT o.slug FROM org o WHERE o.created_by_account = ?1) AS founded";
// whether the account's email may found an org (?1 the email): a used operator's code, or an approved request
export const MAY_FOUND_SQL = "SELECT (EXISTS (SELECT 1 FROM signup_codes WHERE email = ?1 AND used_at IS NOT NULL) " +
  "OR EXISTS (SELECT 1 FROM access_requests INDEXED BY idx_access_requests_email WHERE email = ?1 AND status = 'approved')) AS ok";

// newAccountToken() -> a fresh account session token (never one a request carried)
const newAccountToken = () => ACCOUNT_SESSION_PREFIX + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
const sessionExpiry = () => new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
// accountSessionOf(env, token) -> { accountId, email, google } of a live account session, or null (any other token reads nothing here);
// google: "fresh" (Google proved it less than STEP_UP_MINUTES ago: the org's creation needs no passphrase), "stale" (longer ago), "" (a
// passphrase or the verification proved it)
export async function accountSessionOf(env, token) {
  if (!isAccountSessionToken(token)) return null;
  const row = await db(env).prepare(ACCOUNT_SESSION_SQL).bind(await sha256(String(token)), now()).first();
  return row ? { accountId: String(row.account_id), email: String(row.email), google: googleFreshness(row) } : null;
}
// (sprint 21, 21.4c) the mint for an account Google just proved: only while the account holds the Google subject verified (?6), no
// seat and no invite mark (the binds as above)
export const GOOGLE_SESSION_MINT_SQL = "INSERT INTO account_sessions (token_hash, account_id, device, created_at, expires_at, revoked, proven_how, proven_at) SELECT ?1, a.id, ?2, ?3, ?4, 0, 'google', ?3 FROM accounts a " +
  "WHERE a.id = ?5 AND a.google_sub = ?6 AND a.invited_org IS NULL AND NOT EXISTS (SELECT 1 FROM people p WHERE p.account_id = a.id AND (p.active = 1 OR p.pending = 1))";
// openAccountSession(env, account, { device, google }) -> { token, expires } | null: the account (its id and the pass_hash just
// proven; google: the Google subject just verified, googleSignIn)
export async function openAccountSession(env, account, { device = "web", google = "" } = {}) {
  if (!account || !account.id || !(google || account.pass_hash)) return null;
  const token = newAccountToken(), expires = sessionExpiry();
  const r = await db(env).prepare(google ? GOOGLE_SESSION_MINT_SQL : ACCOUNT_SESSION_MINT_SQL)
    .bind(await sha256(token), String(device).slice(0, 80), now(), expires, String(account.id), String(google || account.pass_hash)).run();
  return ((r && r.meta && r.meta.changes) || 0) >= 1 ? { token, expires } : null;
}
// endAccountSession(env, token) — sign-out of an account session (a token of any other form changes nothing)
export async function endAccountSession(env, token) {
  if (isAccountSessionToken(token)) await db(env).prepare(END_ACCOUNT_SESSION_SQL).bind(await sha256(String(token))).run();
}
// accountStanding(env, accountId, email) -> { seats, coded, founded }
export async function accountStanding(env, accountId, email) {
  const r = await db(env).prepare(ACCOUNT_STANDING_SQL).bind(String(accountId), normEmail(email)).first();
  return { seats: Number((r && r.seats) || 0), coded: !!(r && Number(r.coded) === 1), founded: r && r.founded ? String(r.founded) : "" };
}
export async function mayFound(env, email) {
  const r = await db(env).prepare(MAY_FOUND_SQL).bind(normEmail(email)).first();
  return !!(r && Number(r.ok) === 1);
}
// accountHolds(env, email) -> true when an account answers the email (the join's one question: it files nothing for one that does)
export async function accountHolds(env, email) {
  return !!(await db(env).prepare(ACCOUNT_BY_EMAIL_SQL).bind(normEmail(email)).first());
}

// ---- the verification (POST /account/verify) ----
// the open link (?1 the token's hash, ?2 now): an unverified request whose link is live
export const VERIFY_OPEN_SQL = "SELECT id, email, name, company, role, team_size, source, pass_hash, pass_salt FROM access_requests WHERE verify_hash = ?1 AND status = 'unverified' AND verify_expires > ?2";
// THE BATCH. 1 · the spend: the request verified (in line from now), the link and the passphrase's hash cleared — only while the
// link is live and no verified request of its email stands. ?1 now, ?2 the request, ?3 the token's hash
export const VERIFY_SPEND_SQL = "UPDATE access_requests SET status = 'open', verified_at = ?1, updated_at = ?1, verify_hash = NULL, verify_expires = NULL, pass_hash = NULL, pass_salt = NULL " +
  "WHERE id = ?2 AND verify_hash = ?3 AND status = 'unverified' AND verify_expires > ?1 " +
  "AND NOT EXISTS (SELECT 1 FROM access_requests v WHERE v.email = access_requests.email AND v.status <> 'unverified')";
const SPENT = "EXISTS (SELECT 1 FROM access_requests r WHERE r.id = ?6 AND r.status = 'open' AND r.verified_at = ?5)";
// 2 · the account takes the passphrase (made; an account with none takes it; one with its own keeps it) — only when THIS batch
// spent the link. ?1 a new id, ?2 the email, ?3 the hash, ?4 the salt, ?5 now, ?6 the request
export const VERIFY_ACCOUNT_SQL = `INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE ${SPENT} ` +
  "ON CONFLICT (email) DO UPDATE SET pass_hash = excluded.pass_hash, pass_salt = excluded.pass_salt, updated_at = excluded.updated_at WHERE accounts.pass_hash IS NULL";
// 3 · the account session, only for an account that took THIS passphrase and holds no seat. ?1 the token's hash, ?2 device, ?3 the
// expiry, ?4 the email, ?5 now, ?6 the request, ?7 the hash
export const VERIFY_SESSION_SQL = `INSERT INTO account_sessions (token_hash, account_id, device, created_at, expires_at, revoked, proven_how, proven_at) SELECT ?1, a.id, ?2, ?5, ?3, 0, 'verify', ?5 FROM accounts a WHERE a.email = ?4 AND a.pass_hash = ?7 ` +
  `AND a.invited_org IS NULL AND NOT EXISTS (SELECT 1 FROM people p WHERE p.account_id = a.id AND (p.active = 1 OR p.pending = 1)) AND ${SPENT}`;
// 4 · the email's other unverified joins (a stranger's, an older one of the person's own) go with it. ?1 the email, ?2 the request,
// ?3 now
export const VERIFY_DROP_OTHERS_SQL = "DELETE FROM access_requests WHERE email = ?1 AND status = 'unverified' AND id <> ?2 " +
  "AND EXISTS (SELECT 1 FROM access_requests r WHERE r.id = ?2 AND r.status = 'open' AND r.verified_at = ?3)";
// 5 · (sprint 21, 21.4b: THE PATH) the request names the account the verification made or joined, and when — only when THIS batch
// spent the link. ?1 the email, ?2 now, ?3 the request
export const VERIFY_LINK_SQL = "UPDATE access_requests SET account_id = (SELECT a.id FROM accounts a WHERE a.email = ?1), account_at = ?2 WHERE id = ?3 AND status = 'open' AND verified_at = ?2";
// verifyOpen(env, tokenHash) -> the live link's request ({ id, email, name, … }), or null (expired, used, never sent)
export const verifyOpen = (env, tokenHash) => db(env).prepare(VERIFY_OPEN_SQL).bind(String(tokenHash), now()).first();
// verifyJoin(env, { tokenHash, password, client }) -> { verdict, request, session }
//   verdict: "ok" (verified: the account holds the passphrase; session { token, expires } when it holds no seat, else null) ·
//   "refused" (no live link, or a verified request of the email stands: nothing written) · "wrong" (the passphrase is not the
//   join's: the attempt counted) · "locked" (the email's lockout: nothing compared)
export async function verifyJoin(env, { tokenHash, password, client = "" } = {}) {
  const row = await verifyOpen(env, tokenHash);
  if (!row) return { verdict: "refused" };
  const out = { email: String(row.email), org: HOME_ORG, account: null, seat: null, client: client ? String(client) : "" };
  if (await lockOf(env, null, out.email, out.client)) return { verdict: "locked" };
  if (!(await secretMatches(password, row))) { await countSignIn(env, out, false); return { verdict: "wrong" }; }
  const at = now(), token = newAccountToken(), expires = sessionExpiry();
  const res = await db(env).batch([
    db(env).prepare(VERIFY_SPEND_SQL).bind(at, row.id, String(tokenHash)),
    db(env).prepare(VERIFY_ACCOUNT_SQL).bind(hex(16), out.email, row.pass_hash, row.pass_salt, at, row.id),
    db(env).prepare(VERIFY_SESSION_SQL).bind(await sha256(token), "web", expires, out.email, at, row.id, row.pass_hash),
    db(env).prepare(VERIFY_DROP_OTHERS_SQL).bind(out.email, row.id, at),
    db(env).prepare(VERIFY_LINK_SQL).bind(out.email, at, row.id),
  ]);
  const changed = (i) => ((res && res[i] && res[i].meta && res[i].meta.changes) || 0) >= 1;
  if (!changed(0)) return { verdict: "refused" };
  const account = await db(env).prepare(ACCOUNT_BY_EMAIL_SQL).bind(out.email).first();
  await countSignIn(env, { ...out, account, vouched: true }, true);   // the mailbox and the passphrase proved it: it vouches
  return { verdict: "ok", request: row, session: changed(2) ? { token, expires } : null };
}

// ---- the reset (POST /account/forgot, /account/reset) ----
// RESET_MINUTES (src/mails.js): a link works 30 minutes, once
export const RESET_INSERT_SQL = "INSERT INTO account_resets (token_hash, account_id, created_at, expires_at) SELECT ?1, a.id, ?2, ?3 FROM accounts a WHERE a.email = ?4";
// the live link (?1 the token's hash, ?2 now), with its account
export const RESET_OPEN_SQL = "SELECT r.account_id, a.email FROM account_resets r JOIN accounts a ON a.id = r.account_id WHERE r.token_hash = ?1 AND r.used_at IS NULL AND r.expires_at > ?2";
// THE BATCH. 1 · the spend (?1 now, ?2 the token's hash)
export const RESET_SPEND_SQL = "UPDATE account_resets SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1";
const RESET_SPENT = "EXISTS (SELECT 1 FROM account_resets x WHERE x.token_hash = ?3 AND x.used_at = ?2 AND x.account_id = ?1)";
// 2 · the passphrase (the invite mark ends: the link proves the email). ?1 the account, ?2 now, ?3 the token's hash, ?4 hash, ?5 salt
export const RESET_ACCOUNT_SQL = `UPDATE accounts SET pass_hash = ?4, pass_salt = ?5, invited_org = NULL, updated_at = ?2 WHERE id = ?1 AND ${RESET_SPENT}`;
// 3 · every org session of the account, in every org (its account sessions and each of its seats' own). ?1 ?2 ?3 as above
export const RESET_END_TOKENS_SQL = `UPDATE tokens SET revoked = 1 WHERE revoked = 0 AND (account_id = ?1 OR person_id IN (SELECT id FROM people WHERE account_id = ?1)) AND ${RESET_SPENT}`;
// 4 · its account sessions; 5 · its other open reset links
export const RESET_END_ACCOUNT_SESSIONS_SQL = `UPDATE account_sessions SET revoked = 1 WHERE account_id = ?1 AND revoked = 0 AND ${RESET_SPENT}`;
export const RESET_END_LINKS_SQL = `UPDATE account_resets SET used_at = ?2 WHERE account_id = ?1 AND used_at IS NULL AND ${RESET_SPENT}`;
// startReset(env, email, tokenHash) -> true when a link was written for the email's account (none: no account answers it)
export async function startReset(env, email, tokenHash) {
  const at = now(), exp = new Date(Date.now() + RESET_MINUTES * 60 * 1000).toISOString();
  const r = await db(env).prepare(RESET_INSERT_SQL).bind(String(tokenHash), at, exp, normEmail(email)).run();
  return ((r && r.meta && r.meta.changes) || 0) >= 1;
}
export const resetOpen = (env, tokenHash) => db(env).prepare(RESET_OPEN_SQL).bind(String(tokenHash), now()).first();
// finishReset(env, { tokenHash, password }) -> { verdict: "ok", r } | { verdict: "refused" }: r is a sign-in's answer for the
// fresh session (src/index.js mints it: an org session on the account's chosen seat, or, with none, an account session)
export async function finishReset(env, { tokenHash, password } = {}) {
  const row = await resetOpen(env, tokenHash);
  if (!row) return { verdict: "refused" };
  const id = String(row.account_id), at = now(), salt = hex(16), ph = await pbkdf2(String(password), salt), th = String(tokenHash);
  const res = await db(env).batch([
    db(env).prepare(RESET_SPEND_SQL).bind(at, th),
    db(env).prepare(RESET_ACCOUNT_SQL).bind(id, at, th, ph, salt),
    db(env).prepare(RESET_END_TOKENS_SQL).bind(id, at, th),
    db(env).prepare(RESET_END_ACCOUNT_SESSIONS_SQL).bind(id, at, th),
    db(env).prepare(RESET_END_LINKS_SQL).bind(id, at, th),
  ]);
  if (((res && res[1] && res[1].meta && res[1].meta.changes) || 0) !== 1) return { verdict: "refused" };
  // the connected apps of every seat end with the sessions (G2 M1's rule, as the operator's reset and a proven change on /profile)
  for (const s of await accountSeatIds(env, id)) await revokeOAuthGrants(env, s);
  const account = await db(env).prepare(ACCOUNT_BY_EMAIL_SQL).bind(String(row.email)).first();
  const seats = await seatsOf(env, id), pending = await pendingOf(env, id);
  const seat = seats[0] || pending[0] || null;
  const r = { email: String(row.email), org: seat ? Number(seat.org) : HOME_ORG, account, seat, session: seat ? "account" : null, seatCount: seats.length,
    pendingCount: pending.length, pendingOnly: !seats.length && !!pending.length, client: "", verdict: "ok" };
  await countSignIn(env, { ...r, vouched: true }, true);   // the link proved the email: it vouches
  return { verdict: "ok", r };
}

// ---- GOOGLE SIGN-IN (sprint 21, 21.4c; the owner's MCQs of 2026-10-14: matched by email, still behind the operator's approval;
// src/google.js verifies the id_token: only an email Google says it verified reaches here) ----
// THE MATCH (googleSignIn): the account the email names (the account's spelling). Google's proof is the mailbox's, as a reset
// link's or the operator's code is, so it signs in exactly as the ACCOUNT's passphrase would (accountSignedIn: an ACCOUNT session on
// the chosen seat, the picker for several orgs, the pending anchor, an account session with no seat), passes the lockout (a
// stranger's failures on the email never keep its holder out) and vouches for the client. THE SUBJECT: the first Google sign-in
// links Google's `sub` to the account (accounts.google_sub, migrate-081, unique) — from then on only that Google account signs it in
// (a later one whose sub differs is refused: an email re-issued to someone else, a recycled domain), and that sub signs in no other
// account (a Google account whose email moved is refused, never matched to a second account). A linked subject is the holder
// standing, as a passphrase is: a seat another org adds for the email waits for its yes (SEAT_CONSENT_SQL) and an invite link sets
// nothing on the account (INVITE_SPEND_SQL, INVITE_ACCOUNT_SQL).
// THE JOIN (googleJoin): an email no account holds, joined through Google's form, is filed ALREADY VERIFIED — no verification
// email: ONE batch makes the account (its Google subject, and the passphrase only if the person chose one: an account may live by
// Google alone: its org's creation takes a fresh Google sign-in, THE STEP-UP below), the request open and in line from this moment with the person's path (its
// account), the email's other unverified joins gone (a stranger's included), and an ACCOUNT session; only when no account holds the
// email or the subject and no verified request of the email stands.
// The reviewer accounts (@review.sharingu.xyz: a domain Google cannot verify) keep their passphrase: nothing here names them.
export const GOOGLE_ACCOUNT_SQL = "SELECT id, email, pass_hash, pass_salt, invited_org, google_sub FROM accounts WHERE email = ?1";
export const GOOGLE_HOLDER_SQL = "SELECT id FROM accounts WHERE google_sub = ?1";
// the first use links the subject (?1 the account, ?2 the sub, ?3 now): only while none is linked
export const GOOGLE_LINK_SQL = "UPDATE accounts SET google_sub = ?2, updated_at = ?3 WHERE id = ?1 AND google_sub IS NULL";
// googleSignIn(env, { email, sub, prefer, pick, client }) -> passphraseSignIn's answer shape (verdict "ok" or "no_seat_here", the
// ACCOUNT session's fields), or verdict "none" (no account holds the email) · "other_sub" (the account is linked to another Google
// account) · "linked_elsewhere" (this Google account is linked to another account). google: the sub (an account session's mint)
export async function googleSignIn(env, { email, sub, prefer = null, pick = "", client = "" } = {}) {
  const e = normEmail(email), g = String(sub == null ? "" : sub);
  const [a, h] = await db(env).batch([db(env).prepare(GOOGLE_ACCOUNT_SQL).bind(e), db(env).prepare(GOOGLE_HOLDER_SQL).bind(g)]);
  const account = ((a && a.results) || [])[0] || null, holder = ((h && h.results) || [])[0] || null;
  const out = { email: e, org: HOME_ORG, account, seat: null, session: null, client: client ? String(client) : "", vouched: true, google: g };
  if (!e || !g) return { ...out, verdict: "none" };
  if (holder && (!account || String(holder.id) !== String(account.id))) return { ...out, verdict: "linked_elsewhere" };
  if (!account) return { ...out, verdict: "none" };
  if (account.google_sub == null) {
    await db(env).prepare(GOOGLE_LINK_SQL).bind(String(account.id), g, now()).run();
    const linked = await db(env).prepare(GOOGLE_ACCOUNT_SQL).bind(e).first();   // read again: a concurrent first use may have won
    account.google_sub = linked ? linked.google_sub : null;
  }
  if (account.google_sub !== g) return { ...out, verdict: "other_sub" };
  const seats = await seatsOf(env, account.id, prefer);
  return accountSignedIn(env, { ...out, org: seats[0] ? Number(seats[0].org) : HOME_ORG }, account, seats, { prefer, want: normOrgArg(pick) });
}
// THE JOIN's batch. 1 · the account, only when no account holds the email or the sub and no verified request of the email stands:
// ?1 its id, ?2 the email, ?3 the hash (NULL: none), ?4 the salt, ?5 the sub, ?6 now
export const GOOGLE_JOIN_ACCOUNT_SQL = "INSERT INTO accounts (id, email, pass_hash, pass_salt, google_sub, created_at, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?6 " +
  "WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE email = ?2 OR google_sub = ?5) AND NOT EXISTS (SELECT 1 FROM access_requests WHERE email = ?2 AND status <> 'unverified')";
// the account THIS batch made (?20 its id, ?21 the sub, ?13 now: the binds of the request below)
const GOOGLE_MADE = "EXISTS (SELECT 1 FROM accounts m WHERE m.id = ?20 AND m.google_sub = ?21 AND m.created_at = ?13)";
// 2 · the request, open (verified now: in line from this moment) and naming its account: ?1 id, ?2 email, ?3 name, ?4 company, ?5 role,
// ?6 team size, ?7 website, ?8 linkedin, ?9 x, ?10 github, ?11 ai tools, ?12 use case, ?13 now, ?14 source, ?15 the consent's version,
// ?16 terms, ?17 keep, ?18 updates, ?19 call, ?20 the account, ?21 the sub
export const GOOGLE_JOIN_REQUEST_SQL = "INSERT INTO access_requests (id, email, name, company, role, team_size, website, linkedin, x, github, ai_tools, use_case, status, verified_at, created_at, updated_at, " +
  "source, consent_version, consent_at, consent_terms, consent_keep, consent_updates, consent_call, account_id, account_at) " +
  `SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'open', ?13, ?13, ?13, ?14, ?15, ?13, ?16, ?17, ?18, ?19, ?20, ?13 WHERE ${GOOGLE_MADE}`;
// 3 · the email's unverified joins go (VERIFY_DROP_OTHERS_SQL, bound to this request); 4 · the account session: ?1 the token's hash,
// ?2 now, ?3 the expiry, ?4 the account, ?5 the sub
export const GOOGLE_JOIN_SESSION_SQL = "INSERT INTO account_sessions (token_hash, account_id, device, created_at, expires_at, revoked, proven_how, proven_at) SELECT ?1, a.id, 'web', ?2, ?3, 0, 'google', ?2 FROM accounts a " +
  "WHERE a.id = ?4 AND a.google_sub = ?5 AND a.created_at = ?2";
// googleJoin(env, request, { sub, pass, consent, consentVersion, source }) -> { verdict: "ok", id, session } | { verdict: "exists" } —
// request: src/requestaccess.js readRequest's (its email the one Google verified); pass: { hash, salt } or null (no passphrase);
// consent: readConsent's; source: sourceOf's word
export async function googleJoin(env, r, { sub, pass = null, consent = {}, consentVersion, source = "direct" } = {}) {
  const id = uid(), acct = hex(16), at = now(), token = newAccountToken(), expires = sessionExpiry(), g = String(sub), c = consent || {};
  let res;
  try {
    res = await db(env).batch([
      db(env).prepare(GOOGLE_JOIN_ACCOUNT_SQL).bind(acct, r.email, pass ? pass.hash : null, pass ? pass.salt : null, g, at),
      db(env).prepare(GOOGLE_JOIN_REQUEST_SQL).bind(id, r.email, r.name, r.company, r.role, r.team_size, r.website, r.linkedin, r.x, r.github, r.ai_tools, r.use_case,
        at, String(source), String(consentVersion), c.terms ? 1 : 0, c.keep ? 1 : 0, c.updates ? 1 : 0, c.call ? 1 : 0, acct, g),
      db(env).prepare(VERIFY_DROP_OTHERS_SQL).bind(r.email, id, at),
      db(env).prepare(GOOGLE_JOIN_SESSION_SQL).bind(await sha256(token), at, expires, acct, g),
    ]);
  } catch { return { verdict: "exists" }; }   // a race lost to the unique email, sub or verified request: nothing of this batch stands
  const changed = (i) => ((res && res[i] && res[i].meta && res[i].meta.changes) || 0) >= 1;
  if (!changed(0) || !changed(1)) return { verdict: "exists" };
  return { verdict: "ok", id, session: changed(3) ? { token, expires } : null };
}

// ---- THE STEP-UP (the owner's ruling, 2026-10-14): creating the org takes the ACCOUNT's passphrase OR a FRESH Google sign-in ----
// An account session Google proved (proven_how 'google': a Google sign-in or a join through Google) less than STEP_UP_MINUTES ago is
// the standard re-check the org's creation asks for (POST /orgs, the web form only, after its same-origin guard): it proves the
// account's holder as the passphrase would, so the org is created without one. Older, the form offers Continue with Google again
// (back to the form) beside the passphrase field; a session a passphrase or the verification proved is no step-up (its holder types
// the passphrase, as before). accountStepUp answers accountProof's shape, so src/orgs.js createOrg applies the same rules after it
// (an invite-made account creates no org; one still in line waits for its approval).
export const STEP_UP_MINUTES = 10;
const stepUpSince = (at = Date.now()) => new Date(at - STEP_UP_MINUTES * 60 * 1000).toISOString();
// googleFreshness(row) -> "fresh" | "stale" | "" (row: a session's proven_how and proven_at)
export const googleFreshness = (row) => (!row || row.proven_how !== "google" ? "" : String(row.proven_at || "") > stepUpSince() ? "fresh" : "stale");
// the step-up's one read (?1 the token's hash, ?2 now): the live session Google proved, its account still linked to Google
export const STEP_UP_SQL = "SELECT a.id, a.email, a.pass_hash, a.pass_salt, a.invited_org, a.google_sub, s.proven_how, s.proven_at FROM account_sessions s JOIN accounts a ON a.id = s.account_id " +
  "WHERE s.token_hash = ?1 AND s.revoked = 0 AND s.expires_at > ?2 AND s.proven_how = 'google' AND a.google_sub IS NOT NULL";
// accountStepUp(env, token) -> { verdict, email, org, account }: "ok" · "invited" · "waiting" (as accountProof's) · "stale" (Google
// proved the session STEP_UP_MINUTES ago or more) · "none" (no live session Google proved: the passphrase is asked)
export async function accountStepUp(env, token) {
  const none = { verdict: "none", email: "", org: HOME_ORG, account: null };
  if (!isAccountSessionToken(token)) return none;
  const row = await db(env).prepare(STEP_UP_SQL).bind(await sha256(String(token)), now()).first();
  if (!row) return none;
  const account = { id: String(row.id), email: String(row.email), pass_hash: row.pass_hash ?? null, pass_salt: row.pass_salt ?? null, invited_org: row.invited_org ?? null, google_sub: row.google_sub };
  const out = { email: account.email, org: HOME_ORG, account, seat: null };
  if (googleFreshness(row) !== "fresh") return { ...out, verdict: "stale" };
  if (account.invited_org != null) return { ...out, verdict: "invited" };
  if (!(await mayFound(env, account.email))) return { ...out, verdict: "waiting" };
  return { ...out, verdict: "ok" };
}
