#!/usr/bin/env node
// tools/operator.mjs — THE operator's tool (sprint 7, 7.2; docs/plan/PLATFORM.md §2 items 6 and 10). Sign-up is by allowlist:
// only an email the OPERATOR allowed signs up, with a one-time code the operator hands over BY HAND (the code path mails nothing),
// or (sprint 21, 21.4a) a verified request the operator approves, which is sent ONE "You're in" email (src/email.js sendMail: the
// platform's one send, under the same cap as the worker's). The operator is the deployment, never an app seat: this tool reads and writes the shared D1 directly (the
// local worker's persisted state through wrangler's getPlatformProxy, or the Cloudflare API with the deployment's credentials),
// and no route of the worker can do what it does (tools/check-scoped-data.py's `signup` rule: no statement of src/ inserts or
// deletes a code). Sprint 8.5's operator CLI grows from it.
//
//   node tools/operator.mjs <command> (--local <persist dir> --config <wrangler config> | --live --config <wrangler config>
//        --confirm-live <its D1 database name>) …
//
//   allow  --email <e> [--days N] [--reset] [--beyond-cap]
//                       allows the email: a NEW one-time code for it, valid N days (default 7, 1 to 30). The code is printed
//                       ONCE, here, on this terminal: never to a log, a file or a record (the database keeps only its hash,
//                       src/accounts.js signupCodeHash). Any code still open for the email is revoked in the same write (one
//                       open code per email: a lost code is replaced by allowing again). The person signs up at /signup with
//                       the email, the code and a passphrase (src/accounts.js signUp).
//                       --reset: REQUIRED when the email's account already holds a passphrase — its sign-up is then the
//                       operator-approved reset (the account takes the new passphrase and every session of every seat of the
//                       account, in every org, ends). Without it the allow is refused, nothing written.
//                       BEFORE it mints (the sprint-7 review, A7), it says whether the email's account already holds seats: how
//                       many active seats, in how many orgs (never an org's name), and that its sign-up takes them — an account
//                       passphrase opens every seat of the account, so the code is the key to those seats too (an org admin's
//                       seat for the email included).
//                       THE BETA'S 50 (sprint 12, 12.7; src/beta.js BETA_ORG_CAP): BEFORE it mints it counts the beta's places — the
//                       outside orgs that stand plus the allowed emails holding an open code (unused, unrevoked, unexpired) whose
//                       account made no org yet (each could make one) — and says how many are left after this one ("37 of 50
//                       left"). With all 50 taken it is REFUSED (exit 1, nothing written), unless --beyond-cap (the owner's
//                       call, said on the line). An email whose account already made an org takes no new place.
//   allow  --request <id> [--beyond-cap] [--origin <url>]
//                       (sprint 21, 21.2; 21.4a: no code) approves an OPEN request for a place (migrate-081's access_requests: a
//                       request whose email was VERIFIED at the worker's /account/verify): reads it by its id, counts the beta's
//                       places as allow --email does (the same cap, the same --beyond-cap), marks it approved in ONE guarded write
//                       (status, approved_at, updated_at: a request decided between the read and the write changes nothing) and
//                       sends its email ONE "You're in" (src/mails.js inMail: sign in, then create your org — the person's account
//                       holds the passphrase they chose; there is no code to carry), through src/email.js sendMail: COUNTED in the
//                       cap (mail_days, the same D1 counter the worker takes), not held to the per-address limit (no stranger can
//                       trigger it). --live sends through Cloudflare's REST send API with the deployment's credentials
//                       (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID); --local writes the message to the local worker's capture
//                       (its OAUTH_KV, mail-capture:…: tools/mail-capture.mjs reads it), never the network. --origin: where the
//                       email's links start (default on --live: https:// and the config's sharingu.xyz route; required on --local).
//                       Refused, nothing written: an id that is no request, a request that is not open (unverified, approved or
//                       declined already), the cap without --beyond-cap. At the email cap the approval stands and the line says the
//                       email was not sent (tell the person yourself).
//   decline --request <id>
//                       (sprint 21, 21.P) declines an OPEN request: its status declined, declined_at and updated_at now (21.4b: the 90-day
//                       clearing counts from declined_at); its person's status page
//                       (/account) then says the request is closed (no reason, no count) with the walkthrough and the website. One guarded write (WHERE
//                       status = 'open'): a request decided between the read and the write changes nothing. Refused, nothing
//                       written: an id that is no request, or a request that is not open. No code, no account, no email touched.
//   requests            (sprint 21, 21.2) the beta's places at its head (as list), then the OPEN requests in line order (the
//                       order the worker's page counts a place by: when each email was verified): place, id, company, role, team
//                       size, when it was verified, the person's name and email. The operator's own terminal: never a code (none
//                       is kept). An unverified request is no one's place and is not listed.
//   list   [--email <e>] [--json]
//                       the beta's places at its head, then the allowed emails, newest first, each with its newest code's state:
//                       open · used (created · set · reset) · expired · revoked, and its dates. Never a code (none is kept), never
//                       its hash.
//   revoke --email <e>  ends the email's open code (a code handed to the wrong person, or no longer wanted). Nothing open: exit 1.
//   remove-account --email <e>
//                       removes the email's ACCOUNT from the platform (the sprint-7 review, D6: a person who leaves, on their
//                       request; a throwaway a suite or a walk made): the account row, its sessions (tokens.account_id, and its
//                       account sessions and reset links: migrate-081), its sign-in attempts and the email's sign-up codes. ONLY an account that holds no ACTIVE seat in any org and
//                       founded no org that still stands (its org is deleted first: tools/org-undo.mjs delete); otherwise
//                       refused, nothing written. Its inactive seats (a removed person's row in an org) stay as that org's record
//                       (ledger attribution), detached from the account (people.account_id = NULL; their email stays, set once);
//                       a seat still WAITING for its holder's yes (migrate-074's pending, never active) is declined with it.
//                       One batch, every statement guarded by the same "no active seat, no standing org" test, so a seat added
//                       between the check and the write leaves everything as it was. tools/attack-xorg.mjs (the preview's
//                       throwaway owners and members) and tools/live-walk.mjs (its member and partner) call removeAccount below.
//
//
// SPRINT 8, 8.5 — the operator's org commands (docs/plan/PLATFORM.md §4 sprint 8: "list orgs, raise an org's limits, suspend";
// "while there is no payment, raising the limits by hand IS the paid plan"). Each WRITE is run-recorded: a JSON record under
// engine/.runs/operator/ is written BEFORE the write (the command, the database, the org, what it held, what is asked) and
// completed after it (what it holds now, or why nothing was written) — the undo is in it (the org's plan before, its row's numbers
// before). A record never holds a code, a key or a secret: there is none in these commands.
//   list-orgs [--json]  the beta's places at its head (as list), then every org: its id, name, path name, plan, whether it is suspended (and whether it is org 1 or the suites'
//                       org), and its usage by the CHECK's own definitions (src/plans.js SHOWN_SQL — planShownOf's one statement,
//                       run per org as the deployment: the operator's read, never an app seat's): people, projects, items this
//                       month, calls today, calls this minute, storage, each used / allowed.
//   set-plan --org <id> --plan <name>
//                       puts the org on a plan row that exists (free, team, or a raised row): the ruled rows are never edited
//                       here, only pointed at. Refused: no such org, no such plan row.
//   raise --org <id> --plan <name> [--people N] [--projects N] [--items-month N] [--calls-day N] [--burst-minute N]
//        [--storage-bytes N]
//                       the by-hand paid plan: writes the NAMED plan row (a new one starts from team's numbers, the ruled paid
//                       plan, and takes each number given; an existing one keeps each number not given), then points the org at
//                       it — one batch. Refused: `free` or `team` (the owner's ruled rows, 2026-10-06: their numbers are never
//                       edited by this tool), a name plan_limits refuses (1-40 of a-z 0-9 -), a number that is not a whole
//                       number >= 0, no such org. `--plan suite` (the ship's own row) always takes SUITE_PLAN's numbers.
//                       --org suites (any org command): the suites' org — settings.suites, never org 1 (tools/lib-mint-seat.sh).
//   suspend --org <id> [--really] · unsuspend --org <id>
//                       an org suspended: every door answers ITS people one 403 org_suspended — sign-in landings, pages, MCP,
//                       REST alike (src/index.js routeRequest, the one check where the request's org resolves) — and NOTHING of
//                       it is deleted: the one key `suspended` in its org row's settings is written ({at}); unsuspend removes
//                       it and every read answers again. It takes hold within a minute (the org row's per-isolate cache);
//                       lifting it is answered at once (the door reads a suspended row fresh before each 403).
//                       Org 1 and the suites' org (settings.suites) are the beta's operating orgs: suspending either needs
//                       --really. Refused: no such org; suspend of an org already suspended, unsuspend of one that is not.
// SPRINT 11, 11.3 — the platform's OpenAI domain verification (src/wellknown.js): OpenAI's app submission shows a token and fetches
// GET /.well-known/openai-apps-challenge on the MCP host, expecting the token as plain text. ONE per deployment, never an org's: the
// token lies under one key of the deployment's KV namespace OAUTH_KV (src/wellknown.js OPENAI_CHALLENGE_KEY), written here with the
// deployment's credentials (the D1 is not touched; --confirm-live still names the config's D1 database: the same deployment).
//   set-openai-challenge --token <t>
//                       stores the token (1 to 512 of A-Z a-z 0-9 - . _ ~, one line: src/wellknown.js challengeTokenProblem,
//                       refused before anything is opened) and prints it: it is public the moment it is stored (the route answers
//                       it to anyone), so it is no secret. A token stored before is replaced, and printed as the undo.
//   clear-openai-challenge
//                       removes it: the route answers its ordinary 404 again. Nothing stored: refused (exit 1).
//                       Live KV reads may lag a write by up to a minute (Cloudflare's KV), so the portal's check waits that long.
// SPRINT 21, 21.4c — the platform's Google OAuth client (src/google.js): ONE per deployment, never an org's, under one key of the same
// KV namespace (src/google.js GOOGLE_CLIENT_KEY). The worker reads no env secret: this is the only writer.
//   set-google-client --file <path>
//                       reads the file's two lines GOOGLE_CLIENT_ID=… and GOOGLE_CLIENT_SECRET=… (an `export ` and quotes are allowed)
//                       — only from a file no one but its owner may read (mode 600: refused otherwise, nothing read) — checks both
//                       (src/google.js credentialProblem: a Google client id, a secret of printable characters) and stores them WITH the
//                       deployment's origins (the worker names no domain of its own): one https://<pattern> per custom domain of the
//                       config's routes, the addresses registered with Google beside the client; a config with none (a local one)
//                       takes --origin <its worker's address> instead (both: refused). It prints "stored", the client id's last
//                       characters and the origins, NEVER the secret (nor the id whole, nor any value in a refusal). A client stored
//                       before is replaced. Every page then shows Continue with Google on those origins (live KV: within a minute).
//   clear-google-client
//                       removes it: no Google button anywhere, every Google door refused. Nothing stored: refused (exit 1).
// THE SHIP'S OWN PLAN (8.5's must-close, 8.2f's find): `suite` — SUITE_PLAN below, big honest numbers sized to the suites (the
// cross-org suite's throwaway orgs and the walk), its own row: tools/attack-xorg.mjs writes it before it restores its throwaway
// orgs and puts them on it, and removes it with them unless an org still rides it (the suites' org on live, raised ONCE by this
// tool's `raise --plan suite`: tools/ship-plan.sh prints the step). free and team are never touched.
//
// REFUSALS, before any write (exit 1; 2 on a usage error): --live without --confirm-live naming the config's D1 database (the
// live shared database, every org's); --local and --live together, or neither; an email that is not one; an email that is not
// plain ASCII (the sprint-7 review, A5: SQLite's lower() folds ASCII only, so the triggers and this tool would key two accounts
// for one non-ASCII email — the beta's floor, as add-person and sign-up refuse it); --days outside 1-30; allow for an account
// that holds a passphrase without --reset; allow with the beta's 50 places taken without --beyond-cap; allow --request (or decline
// --request) of no open request; revoke with nothing open; remove-account of no account, of an account holding an active seat, or of one that founded an
// org still standing.
// --live is WRITTEN, NOT YET RUN (the org-undo discipline): it needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the
// deployment's credentials file, sourced first (nothing here prints either).
// Exit: 0 done · 1 refused · 2 usage.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normEmail, signupCodeHash, SIGNUP_CODE_ALPHABET, SIGNUP_CODE_LENGTH } from "../src/accounts.js";
import { BETA_ORG_CAP, BETA_ORGS_SQL, BETA_CODES_SQL, BETA_APPROVED_SQL, placesOf } from "../src/beta.js";   // sprint 21, 21.1: the beta's places, one source
import { REQUEST_PLACE_SQL, TEAM_SIZES, clearSet } from "../src/requestaccess.js";   // sprint 21, 21.2: the place the worker's page counts
import { REQUEST_ROW_SQL, APPROVE_REQUEST_SQL, DECLINE_REQUEST_SQL, REQUEST_ID_RE } from "../src/operatorread.js";   // sprint 21, 21.4b: the page's statements, one source
import { readConfig, liveD1 } from "./org-undo.mjs";
import { sendMail, captureMailer } from "../src/email.js";   // sprint 21, 21.4a: THE send, under the worker's own cap
import { inMail } from "../src/mails.js";
import { OPENAI_CHALLENGE_KEY, challengeTokenProblem } from "../src/wellknown.js";
import { GOOGLE_CLIENT_KEY, credentialProblem, originProblem } from "../src/google.js";   // sprint 21, 21.4c: the platform's Google client

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DAYS = 7, MAX_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- the statements (the operator's own: the worker holds none that writes a code) ----
// one open code per email (migrate-071's idx_signup_open): the open one is revoked in the same batch that inserts the new one
export const REVOKE_OPEN_SQL = "UPDATE signup_codes SET revoked_at = ?2 WHERE email = ?1 AND used_at IS NULL AND revoked_at IS NULL";
export const MINT_SQL = "INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)";
export const ACCOUNT_STATE_SQL = "SELECT pass_hash IS NOT NULL AS has_pass FROM accounts WHERE email = ?1";
// A7: the account's ACTIVE seats and the orgs they sit in (counts only: never a name)
export const SEATS_OF_EMAIL_SQL = "SELECT COUNT(CASE WHEN p.active = 1 THEN 1 END) AS seats, COUNT(DISTINCT CASE WHEN p.active = 1 THEN p.org END) AS orgs, " +
  "COUNT(CASE WHEN p.pending = 1 THEN 1 END) AS pending FROM accounts a JOIN people p ON p.account_id = a.id WHERE a.email = ?1";
// D6: what stands in the way of removing an account (an active seat, an org it founded that still stands)
export const ACCOUNT_HOLDS_SQL = "SELECT a.id, (SELECT COUNT(*) FROM people p WHERE p.account_id = a.id AND p.active = 1) AS active, " +
  "(SELECT COUNT(DISTINCT p.org) FROM people p WHERE p.account_id = a.id AND p.active = 1) AS orgs, " +
  "(SELECT COUNT(*) FROM people p WHERE p.account_id = a.id AND p.active = 0) AS inactive, " +
  "(SELECT COUNT(*) FROM org o WHERE o.created_by_account = a.id) AS founded FROM accounts a WHERE a.email = ?1";
// the guard every statement of the removal carries (?1 the account's id): no active seat, no org it founded still standing
const FREE_GUARD = "NOT EXISTS (SELECT 1 FROM people g WHERE g.account_id = ?1 AND g.active = 1) AND NOT EXISTS (SELECT 1 FROM org g WHERE g.created_by_account = ?1)";
export const REMOVE_ACCOUNT_SQL = [
  `UPDATE people SET account_id = NULL, pending = 0 WHERE account_id = ?1 AND active = 0 AND ${FREE_GUARD}`,
  `DELETE FROM tokens WHERE account_id = ?1 AND ${FREE_GUARD}`,
  `DELETE FROM login_attempts WHERE (account_id = ?1 OR email = ?2) AND ${FREE_GUARD}`,
  `DELETE FROM signup_codes WHERE email = ?2 AND ${FREE_GUARD}`,
  // sprint 21, 21.4a: its account sessions and its reset links (migrate-081)
  `DELETE FROM account_sessions WHERE account_id = ?1 AND ${FREE_GUARD}`,
  `DELETE FROM account_resets WHERE account_id = ?1 AND ${FREE_GUARD}`,
  // its requests for a place cleared as the 90-day clearing clears them (src/requestaccess.js clearSet): an approved request holds
  // a beta place while its row stands uncleared (src/beta.js BETA_APPROVED_SQL), and a removed account keeps no profile (A.5, 2026-10-15)
  `UPDATE access_requests SET ${clearSet("?3")} WHERE email = ?2 AND cleared_at IS NULL AND ${FREE_GUARD}`,
  `DELETE FROM accounts WHERE id = ?1 AND email = ?2 AND ${FREE_GUARD}`,
];
// the newest code of each email (its state), newest first; never the hash
export const LIST_SQL = "SELECT s.email, s.created_at, s.expires_at, s.used_at, s.used_how, s.revoked_at, " +
  "(SELECT COUNT(*) FROM signup_codes o WHERE o.email = s.email) AS codes FROM signup_codes s " +
  "WHERE s.rowid = (SELECT o.rowid FROM signup_codes o WHERE o.email = s.email ORDER BY o.created_at DESC, o.rowid DESC LIMIT 1) " +
  "AND (?1 IS NULL OR s.email = ?1) ORDER BY s.created_at DESC LIMIT 500";

// ---- 12.7 · the beta's 50 places (the owner's ruling, 2026-10-10: the beta's 50 orgs, first come first served, stay on the
// WAITLIST and the owner approves each — through `allow`). The cap and its two counting statements live in src/beta.js (sprint 21,
// 21.1: the ONE source the worker's request page reads too); the worker does not enforce it, the operator's allow does, before it
// mints. Re-exported here for the operator's callers and its selftest.
export { BETA_ORG_CAP, BETA_ORGS_SQL, BETA_CODES_SQL, BETA_APPROVED_SQL };
export const FOUNDED_BY_EMAIL_SQL = "SELECT COUNT(*) AS n FROM accounts a JOIN org o ON o.created_by_account = a.id WHERE a.email = ?1";
// betaPlaces(DB, { email, at }) -> { cap, orgs, codes, approved, taken, left, founded }: the places taken now (email's own open code
// and approved request left out); founded: whether email's account already made an org (then it takes no new place)
export async function betaPlaces(DB, { email = null, at = new Date().toISOString() } = {}) {
  const e = email ? normEmail(email) : null;
  const n = async (sql, ...b) => Number(((await DB.prepare(sql).bind(...b).first()) || {}).n || 0);
  const orgs = await n(BETA_ORGS_SQL), codes = await n(BETA_CODES_SQL, at, e), approved = await n(BETA_APPROVED_SQL, at, e);
  const founded = e ? (await n(FOUNDED_BY_EMAIL_SQL, e)) > 0 : false;
  return { ...placesOf(orgs, codes, approved), founded };
}
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---- 21.2 · the requests for a place (migrate-081; the worker files them, src/requestaccess.js; the operator approves) ----
// the open (verified) requests in line order, on the line index (verified_at, then id: the worker's REQUEST_PLACE_SQL counts the
// same order)
export const REQUESTS_SQL = "SELECT id, email, name, company, role, team_size, verified_at FROM access_requests INDEXED BY idx_access_requests_line " +
  "WHERE status = 'open' ORDER BY verified_at, id LIMIT 500";
// one request by its id, the approval and (21.P) the decline (?1 the request, ?2 when: guarded by its status, so only an open request
// is decided; the decline sets declined_at, from which the 90-day clearing counts, sprint 21, 21.4b): src/operatorread.js's, the
// operator page's own (one source for the terminal and the page), re-exported here for the selftest
export { REQUEST_ROW_SQL, APPROVE_REQUEST_SQL, DECLINE_REQUEST_SQL };
// openRequest(DB, id) -> { request: { id, email, name, company, place } } | { refused }: only an OPEN request is approved
export async function openRequest(DB, id) {
  const rid = String(id == null ? "" : id).trim();
  if (!REQUEST_ID_RE.test(rid)) return { refused: `${JSON.stringify(rid.slice(0, 80))} is not a request's id (the requests command lists them)` };
  const r = await DB.prepare(REQUEST_ROW_SQL).bind(rid).first();
  if (!r) return { refused: `no request ${rid} on this database (the requests command lists the open ones)` };
  if (r.status !== "open") return { refused: `request ${rid} is ${r.status}${r.approved_at ? ` (since ${r.approved_at})` : ""}, not open: only an open request is decided` };
  const p = await DB.prepare(REQUEST_PLACE_SQL).bind(String(r.verified_at), String(r.id)).first();
  return { request: { id: String(r.id), email: String(r.email), name: String(r.name), company: String(r.company), place: Number((p && p.place) || 0) } };
}
// declineRequest(DB, id, { at }) -> { request } | { refused }: the open request read first (openRequest), then the one guarded write
export async function declineRequest(DB, id, { at = new Date().toISOString() } = {}) {
  const q = await openRequest(DB, id);
  if (q.refused) return q;
  const res = await DB.prepare(DECLINE_REQUEST_SQL).bind(q.request.id, at).run();
  if (((res && res.meta && res.meta.changes) || 0) !== 1) return { refused: `request ${q.request.id} was not declined (it was decided since it was read): nothing changed` };
  return { request: q.request, at };
}
// listRequests(DB) -> [{ place, id, email, name, company, role, team_size, verified_at }]: the open ones, the first in line first
export async function listRequests(DB) {
  const rows = (await DB.prepare(REQUESTS_SQL).all()).results || [];
  return rows.map((r, i) => ({ place: i + 1, id: String(r.id), email: String(r.email), name: String(r.name), company: String(r.company), role: String(r.role), team_size: String(r.team_size), verified_at: String(r.verified_at) }));
}
// approveRequest(DB, request, { beta, at }) -> { request, places? } | { refused, places? }: the open request (openRequest's answer)
// approved in its one guarded write, after the beta's places are counted (beta: { beyond }, as allowEmail's; the email's own open
// code left out of the count: approved, it is counted by its request)
export async function approveRequest(DB, request, { beta = null, at = new Date().toISOString() } = {}) {
  let places;
  if (beta) {
    const p = await betaPlaces(DB, { email: request.email, at });
    const need = p.founded ? 0 : 1;
    places = { ...p, need, leftAfter: p.left - need, beyond: need === 1 && p.left - need < 0 };
    if (places.beyond && !beta.beyond) return { refused: `the beta's ${p.cap} places are taken: ${placesWords(p)} (the owner's ruling, 2026-10-10: the beta's ${p.cap} orgs, first come first served; pass --beyond-cap to approve past it)`, places };
  }
  const res = await DB.prepare(APPROVE_REQUEST_SQL).bind(request.id, at).run();
  if (Number((res && res.meta && res.meta.changes) || 0) !== 1) return { refused: `request ${request.id} was not approved (it was decided since it was read): nothing changed`, ...(places ? { places } : {}) };
  return { request, at, ...(places ? { places } : {}) };
}
// placesWords(p) -> what holds the places taken: the orgs, the open codes and the approved requests with no org yet
const placesWords = (p) => `${plural(p.orgs, "org")}, ${plural(p.codes, "open code")} and ${plural(p.approved || 0, "approved request")} with no org yet`;
// placesLine(p) -> the head line of list and list-orgs
export const placesLine = (p) => `the beta's places: ${p.taken} of ${p.cap} taken (${placesWords(p)}), ` +
  `${Math.max(0, p.left)} left${p.left < 0 ? ` (${-p.left} beyond the cap)` : ""} — org 1, the suites' org, reviewer worlds and the ship's suite orgs hold none`;

// newCode() -> 20 characters of Crockford's base32 (100 bits from the system's CSPRNG), four groups of five
export function newCode() {
  const b = randomBytes(SIGNUP_CODE_LENGTH);
  let s = "";
  for (let i = 0; i < SIGNUP_CODE_LENGTH; i++) s += SIGNUP_CODE_ALPHABET[b[i] & 31];
  return s.match(/.{5}/g).join("-");
}
export const emailProblem = (email) => {
  const e = normEmail(email);
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) return "not an email address";
  // A5: plain ASCII only (SQLite's lower() and JavaScript's toLowerCase() agree on ASCII alone)
  return /[^\x21-\x7e]/.test(e) ? "not a plain-ASCII email address (the beta's floor: a non-ASCII email would key two accounts)" : "";
};
export const stateOf = (r, at = new Date().toISOString()) =>
  r.revoked_at ? "revoked" : r.used_at ? "used" : String(r.expires_at) <= at ? "expired" : "open";

// allowEmail(DB, email, { days, reset, at, beta }) -> { email, code, expiresAt, replaced, reset, places? } | { refused, places? }
// The code is returned to the caller (the CLI prints it once); the database gets only its hash.
// beta (12.7; the CLI's allow passes it): { beyond } — the beta's places counted BEFORE the mint; with every place taken the allow
// is refused, nothing written, unless beyond (--beyond-cap). places: betaPlaces' answer plus need (0: the email already made an
// org, so its code takes no new place; 1 otherwise) and leftAfter. Without beta nothing is counted (the reviewer tool's own
// accounts, the selftests' fixtures).
export async function allowEmail(DB, email, { days = DEFAULT_DAYS, reset = false, at = new Date().toISOString(), beta = null } = {}) {
  const e = normEmail(email);
  const bad = emailProblem(e);
  if (bad) return { refused: `${JSON.stringify(String(email || ""))}: ${bad}` };
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return { refused: `--days must be a whole number from 1 to ${MAX_DAYS}` };
  const acct = await DB.prepare(ACCOUNT_STATE_SQL).bind(e).first();
  const hasPass = !!(acct && Number(acct.has_pass) === 1);
  if (hasPass && !reset) return { refused: `${e} already has an account with a passphrase: its sign-up would RESET it (every session of every seat of the account, in every org, ends). Allow it with --reset if that is what you mean.` };
  let places;
  if (beta) {
    const p = await betaPlaces(DB, { email: e, at });
    const need = p.founded ? 0 : 1;
    places = { ...p, need, leftAfter: p.left - need, beyond: need === 1 && p.left - need < 0 };
    if (places.beyond && !beta.beyond) return { refused: `the beta's ${p.cap} places are taken: ${placesWords(p)} (the owner's ruling, 2026-10-10: the beta's ${p.cap} orgs, first come first served; pass --beyond-cap to allow past it)`, places };
  }
  const code = newCode();
  const expiresAt = new Date(Date.parse(at) + days * 24 * 60 * 60 * 1000).toISOString();
  const hash = await signupCodeHash(code);
  const res = await DB.batch([
    DB.prepare(REVOKE_OPEN_SQL).bind(e, at),
    DB.prepare(MINT_SQL).bind(randomUUID(), e, hash, at, expiresAt),
  ]);
  const n = (i) => Number((res && res[i] && res[i].meta && res[i].meta.changes) || 0);
  return { email: e, code, expiresAt, days, replaced: n(0), reset: hasPass, ...(places ? { places } : {}) };
}
// seatsOfEmail(DB, email) -> { seats, orgs }: the active seats the email's account holds, and in how many orgs (A7; no names)
export async function seatsOfEmail(DB, email) {
  const r = await DB.prepare(SEATS_OF_EMAIL_SQL).bind(normEmail(email)).first();
  return { seats: Number((r && r.seats) || 0), orgs: Number((r && r.orgs) || 0), pending: Number((r && r.pending) || 0) };
}
// seatsLine({ seats, orgs }) -> what the operator reads BEFORE a code is minted, or "" when the account holds no seat
export const seatsLine = ({ seats, orgs, pending = 0 }) => (seats || pending ? `! this email already holds ${seats} active seat${seats === 1 ? "" : "s"} in ${orgs} org${orgs === 1 ? "" : "s"}` +
  `${pending ? ` and ${pending} seat${pending === 1 ? "" : "s"} waiting for its holder's yes (migrate-074)` : ""}: its sign-up TAKES ${seats + pending === 1 ? "it" : "them"} ` +
  "(the account's passphrase opens every active seat of the account, and lets its holder accept a waiting one) — allow it only for that person" : "");
// removeAccount(DB, email) -> { email, detached, sessions, attempts, codes } | { refused } (D6; the header's remove-account)
export async function removeAccount(DB, email) {
  const e = normEmail(email);
  const bad = emailProblem(e);
  if (bad) return { refused: `${JSON.stringify(String(email || ""))}: ${bad}` };
  const a = await DB.prepare(ACCOUNT_HOLDS_SQL).bind(e).first();
  if (!a) return { refused: `${e} has no account on the platform: nothing to remove` };
  if (Number(a.active)) return { refused: `${e} holds ${a.active} active seat${Number(a.active) === 1 ? "" : "s"} in ${a.orgs} org${Number(a.orgs) === 1 ? "" : "s"}: remove ${Number(a.active) === 1 ? "that seat" : "those seats"} first (each org's admin, or that org's delete)` };
  if (Number(a.founded)) return { refused: `${e} founded an org that still stands: delete that org first (tools/org-undo.mjs export, then delete)` };
  const at = new Date().toISOString();
  const res = await DB.batch(REMOVE_ACCOUNT_SQL.map((s) => (s.includes("?3") ? DB.prepare(s).bind(a.id, e, at) : s.includes("?2") ? DB.prepare(s).bind(a.id, e) : DB.prepare(s).bind(a.id))));
  const n = (i) => Number((res && res[i] && res[i].meta && res[i].meta.changes) || 0);
  if (n(REMOVE_ACCOUNT_SQL.length - 1) !== 1) return { refused: `${e}: the account was not removed (a seat or an org of it appeared since the check): nothing changed` };
  return { email: e, detached: n(0), sessions: n(1) + n(4), attempts: n(2), codes: n(3), requests: n(6) };
}
// listAllowed(DB, { email, at }) -> [{ email, state, how, created, expires, used, revoked, codes }]
export async function listAllowed(DB, { email = null, at = new Date().toISOString() } = {}) {
  const rows = (await DB.prepare(LIST_SQL).bind(email ? normEmail(email) : null).all()).results || [];
  return rows.map((r) => ({ email: r.email, state: stateOf(r, at), ...(r.used_how ? { how: r.used_how } : {}), created: r.created_at, expires: r.expires_at,
    ...(r.used_at ? { used: r.used_at } : {}), ...(r.revoked_at ? { revoked: r.revoked_at } : {}), codes: Number(r.codes) }));
}
// revokeEmail(DB, email, { at }) -> { email, revoked } | { refused }
export async function revokeEmail(DB, email, { at = new Date().toISOString() } = {}) {
  const e = normEmail(email);
  const bad = emailProblem(e);
  if (bad) return { refused: `${JSON.stringify(String(email || ""))}: ${bad}` };
  const r = await DB.prepare(REVOKE_OPEN_SQL).bind(e, at).run();
  const n = Number((r && r.meta && r.meta.changes) || 0);
  return n ? { email: e, revoked: n } : { refused: `${e} has no open code: nothing to revoke` };
}

// ---- 8.5 · the orgs, their plans, the suspension ----
// THE RULED ROWS: the owner's numbers (migrate-075, 2026-10-06), never edited by this tool (raise refuses them; set-plan may only
// point an org at one)
export const RULED_PLANS = Object.freeze(["free", "team"]);
// THE SHIP'S OWN PLAN (see the header): the suites' numbers, finite and stated — each well over what a run of the suites measured
// on one org (the sprint-7 preview attack: 4,868 calls per direction, about 3,000 of them counted on one throwaway org; the
// walk: 108 requests, 63 counted; a local ship-shaped run: .runs/s8-b5/PROGRESS.md), so a ship's suites are never throttled, and
// never unlimited: an org on it still meets a limit
export const SUITE_PLAN = Object.freeze({ plan: "suite", people: 500, projects: 500, items_month: 500000, calls_day: 500000, burst_minute: 50000, storage_bytes: 17179869184 });
export const LIMIT_COLS = ["people", "projects", "items_month", "calls_day", "burst_minute", "storage_bytes"];
// the CLI's flag for each limit column (--items-month: items_month)
export const LIMIT_FLAGS = Object.fromEntries(LIMIT_COLS.map((c) => [`--${c.replace(/_/g, "-")}`, c]));
const PLAN_NAME_RE = /^[a-z0-9-]{1,40}$/;   // migrate-075's CHECK on plan_limits.plan and org.plan
export const ORGS_SQL = "SELECT id, name, slug, plan, settings FROM org ORDER BY id";
// the suites' org: tools/lib-mint-seat.sh's EORG (never org 1)
export const SUITES_ORG_SQL = "SELECT id FROM org WHERE id <> 1 AND json_extract(settings, '$.suites') = 1 ORDER BY id LIMIT 1";
export const ORG_ROW_SQL = "SELECT id, name, slug, plan, settings FROM org WHERE id = ?1";
export const PLAN_ROW_SQL = "SELECT plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at FROM plan_limits WHERE plan = ?1";
// the plan row written whole (?1 the name, ?2..?7 the six numbers, ?8 when), kept unless it is a ruled row (the guard in SQL too)
export const PLAN_UPSERT_SQL = "INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) " +
  "SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE ?1 NOT IN ('free', 'team') ON CONFLICT (plan) DO UPDATE SET people = excluded.people, projects = excluded.projects, " +
  "items_month = excluded.items_month, calls_day = excluded.calls_day, burst_minute = excluded.burst_minute, storage_bytes = excluded.storage_bytes, " +
  "updated_at = excluded.updated_at WHERE plan_limits.plan NOT IN ('free', 'team')";
// the org pointed at a plan row that exists (?1 the org, ?2 the plan)
export const SET_PLAN_SQL = "UPDATE org SET plan = ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM plan_limits WHERE plan = ?2)";
// the suspension: ONE key of the org row's settings (?1 the org, ?2 when); unsuspend removes it. Nothing else of the org moves.
export const SUSPEND_SQL = "UPDATE org SET settings = json_set(CASE WHEN json_valid(settings) THEN settings ELSE '{}' END, '$.suspended', json_object('at', ?2)) " +
  "WHERE id = ?1 AND (settings IS NULL OR NOT json_valid(settings) OR json_extract(settings, '$.suspended') IS NULL)";
export const UNSUSPEND_SQL = "UPDATE org SET settings = json_remove(settings, '$.suspended') WHERE id = ?1 AND json_valid(settings) AND json_extract(settings, '$.suspended') IS NOT NULL";
// the ship's row removed when no org rides it any more
export const SUITE_DROP_SQL = "DELETE FROM plan_limits WHERE plan = 'suite' AND NOT EXISTS (SELECT 1 FROM org WHERE plan = 'suite')";

const settingsOf = (row) => { try { const o = JSON.parse((row && row.settings) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } };
// isOperatingOrg(row) -> "org 1" | "the suites' org" | "": the beta's operating orgs (suspend needs --really)
export const isOperatingOrg = (row) => (Number(row && row.id) === 1 ? "org 1 (ryuklabs, the beta's operating org)" : settingsOf(row).suites ? "the suites' org (settings.suites: the suites and the ship's walk run as it)" : "");
const limitsRow = (r) => Object.fromEntries(LIMIT_COLS.map((c) => [c, Number(r[c])]));
const orgRow = async (DB, org) => (Number.isSafeInteger(org) && org >= 1 ? DB.prepare(ORG_ROW_SQL).bind(org).first() : null);

// listOrgs(DB, { now }) -> [{ id, name, slug, plan, suspended, operating, shown }]: shown is planShownOf's answer for the org
// (src/plans.js SHOWN_SQL with the org written in, read per org on the deployment's credentials)
export async function listOrgs(DB, { now = Date.now() } = {}) {
  const { SHOWN_SQL, shownFrom, monthOf, dayOf, minuteOf, suspensionOf } = await import("../src/plans.js");
  const { orgSql } = await import("../src/data.js");
  const orgs = (await DB.prepare(ORGS_SQL).all()).results || [];
  const out = [];
  for (const o of orgs) {
    const id = Number(o.id);
    let shown = null;
    try { shown = shownFrom(await DB.prepare(orgSql(SHOWN_SQL, id)).bind(monthOf(now), dayOf(now), minuteOf(now)).first(), now); }
    catch (e) { shown = { error: String((e && e.message) || e).slice(0, 160) }; }
    out.push({ id, name: String(o.name || ""), slug: o.slug == null ? null : String(o.slug), plan: String(o.plan || ""), suspended: suspensionOf(o), operating: isOperatingOrg(o) || null, shown });
  }
  return out;
}
// setPlan(DB, org, plan) -> { org, from, to } | { refused }
export async function setPlan(DB, org, plan) {
  const name = String(plan || "");
  if (!PLAN_NAME_RE.test(name)) return { refused: `--plan ${JSON.stringify(name)} is not a plan name (1 to 40 of a-z, 0-9, -)` };
  const o = await orgRow(DB, org);
  if (!o) return { refused: `no org ${org} on this database` };
  if (!(await DB.prepare(PLAN_ROW_SQL).bind(name).first())) return { refused: `no plan row "${name}": write it first (raise --org ${org} --plan ${name} …), or name free or team` };
  if (String(o.plan) === name) return { refused: `org ${org} is on ${name} already: nothing to do` };
  const r = await DB.prepare(SET_PLAN_SQL).bind(org, name).run();
  if (!Number((r && r.meta && r.meta.changes) || 0)) return { refused: `org ${org} was not moved (its row or the plan row changed since the check): nothing changed` };
  return { org, from: String(o.plan), to: name };
}
// raisePlan(DB, org, plan, limits, { at }) -> { org, plan, from, before, after, created } | { refused }: limits holds the numbers
// given (any of LIMIT_COLS)
export async function raisePlan(DB, org, plan, limits = {}, { at = new Date().toISOString() } = {}) {
  const name = String(plan || "");
  if (RULED_PLANS.includes(name)) return { refused: `"${name}" is a ruled plan (the owner's numbers, migrate-075): this tool never edits it — raise an org on a row of its own (e.g. --plan acme-raised)` };
  if (!PLAN_NAME_RE.test(name)) return { refused: `--plan ${JSON.stringify(name)} is not a plan name (1 to 40 of a-z, 0-9, -)` };
  for (const [k, v] of Object.entries(limits)) {
    if (!LIMIT_COLS.includes(k)) return { refused: `no limit ${k}` };
    if (!Number.isSafeInteger(v) || v < 0) return { refused: `--${k.replace(/_/g, "-")} must be a whole number >= 0 (got ${JSON.stringify(v)})` };
  }
  const o = await orgRow(DB, org);
  if (!o) return { refused: `no org ${org} on this database` };
  const cur = await DB.prepare(PLAN_ROW_SQL).bind(name).first();
  // the ship's own row is always SUITE_PLAN's numbers (one source: tools/ship-plan.sh prints the bare command); any other row a
  // new one starts from team's (the ruled paid plan), an existing one from its own
  const base = name === SUITE_PLAN.plan ? SUITE_PLAN : cur || await DB.prepare(PLAN_ROW_SQL).bind("team").first();
  if (!base) return { refused: "no team row to start a new plan from (a database before migrate-075)" };
  const after = { ...limitsRow(base), ...limits };
  const res = await DB.batch([
    DB.prepare(PLAN_UPSERT_SQL).bind(name, ...LIMIT_COLS.map((c) => after[c]), at),
    DB.prepare(SET_PLAN_SQL).bind(org, name),
  ]);
  const n = (i) => Number((res && res[i] && res[i].meta && res[i].meta.changes) || 0);
  if (n(0) !== 1) return { refused: `the plan row "${name}" was not written: nothing changed` };
  return { org, plan: name, from: String(o.plan), before: cur ? limitsRow(cur) : null, after, created: !cur, moved: n(1) === 1 || String(o.plan) === name };
}
// suspendOrg(DB, org, { really, at }) / unsuspendOrg(DB, org) -> { org, name, suspended } | { refused }
export async function suspendOrg(DB, org, { really = false, at = new Date().toISOString() } = {}) {
  const o = await orgRow(DB, org);
  if (!o) return { refused: `no org ${org} on this database` };
  const op = isOperatingOrg(o);
  if (op && !really) return { refused: `org ${org} is ${op}: suspending it stops the beta's own work — add --really if that is what you mean` };
  if (settingsOf(o).suspended) return { refused: `org ${org} is suspended already (since ${settingsOf(o).suspended.at || "an unknown moment"}): nothing to do` };
  const r = await DB.prepare(SUSPEND_SQL).bind(org, at).run();
  if (!Number((r && r.meta && r.meta.changes) || 0)) return { refused: `org ${org} was not suspended (its row changed since the check): nothing changed` };
  return { org, name: String(o.name || ""), suspended: true, at };
}
export async function unsuspendOrg(DB, org) {
  const o = await orgRow(DB, org);
  if (!o) return { refused: `no org ${org} on this database` };
  if (!settingsOf(o).suspended) return { refused: `org ${org} is not suspended: nothing to do` };
  const r = await DB.prepare(UNSUSPEND_SQL).bind(org).run();
  if (!Number((r && r.meta && r.meta.changes) || 0)) return { refused: `org ${org} was not lifted (its row changed since the check): nothing changed` };
  return { org, name: String(o.name || ""), suspended: false };
}
// ensureSuitePlan(DB, { at }) -> the ship's own row written to SUITE_PLAN's numbers (tools/attack-xorg.mjs, before its restores)
export async function ensureSuitePlan(DB, { at = new Date().toISOString() } = {}) {
  const r = await DB.prepare(PLAN_UPSERT_SQL).bind(SUITE_PLAN.plan, ...LIMIT_COLS.map((c) => SUITE_PLAN[c]), at).run();
  return Number((r && r.meta && r.meta.changes) || 0) === 1;
}
// dropSuitePlan(DB) -> { removed: true } | { kept: <how many orgs ride it> }: the ship's row removed with its throwaways, unless an
// org still rides it (the suites' org raised by the operator)
export async function dropSuitePlan(DB) {
  const r = await DB.prepare(SUITE_DROP_SQL).run();
  if (Number((r && r.meta && r.meta.changes) || 0)) return { removed: true };
  const k = await DB.prepare("SELECT COUNT(*) AS n FROM org WHERE plan = 'suite'").first();
  return { kept: Number((k && k.n) || 0) };
}
// suiteFlags() -> the raise flags that write SUITE_PLAN (tools/ship-plan.sh prints them: one source for the numbers)
export const suiteFlags = () => `--plan ${SUITE_PLAN.plan} ` + LIMIT_COLS.map((c) => `--${c.replace(/_/g, "-")} ${SUITE_PLAN[c]}`).join(" ");

// ---- 11.3 · the platform's OpenAI domain verification (KV: the deployment's OAUTH_KV, one key) ----
// setChallenge(KV, token) -> { token, before } | { refused }: before is the token it replaced (null: none)
export async function setChallenge(KV, token) {
  const bad = challengeTokenProblem(token);
  if (bad) return { refused: `--token ${JSON.stringify(String(token ?? "").slice(0, 80))}: ${bad}` };
  const before = await KV.get(OPENAI_CHALLENGE_KEY);
  await KV.put(OPENAI_CHALLENGE_KEY, token);
  return { token, before: before == null ? null : String(before) };
}
// clearChallenge(KV) -> { before } | { refused }
export async function clearChallenge(KV) {
  const before = await KV.get(OPENAI_CHALLENGE_KEY);
  if (before == null) return { refused: "no OpenAI challenge token is stored: nothing to clear" };
  await KV.delete(OPENAI_CHALLENGE_KEY);
  return { before: String(before) };
}

// ---- 21.4c · the platform's Google OAuth client (KV: the deployment's OAUTH_KV, one key) ----
// clientOrigins(cfg, given) -> { origins } | { refused }: the deployment's origins, one https://<pattern> per custom domain of the config's
// routes; a config with none (a local one) takes the --origin given (an origin src/google.js originProblem accepts); both: refused
export function clientOrigins(cfg, given) {
  const routes = ((cfg && cfg.routes) || []).filter((x) => x && x.custom_domain && typeof x.pattern === "string").map((x) => `https://${x.pattern}`);
  if (routes.length && given) return { refused: "--origin is for a config with no custom domain (a local one): this config's routes name its origins" };
  const origins = routes.length ? routes : given ? [String(given)] : [];
  if (!origins.length) return { refused: "the config names no custom domain in its routes: pass --origin <the worker's address>" };
  const bad = origins.map(originProblem).find(Boolean);
  return bad ? { refused: bad } : { origins };
}
// readClientFile(path) -> { client: { client_id, client_secret } } | { refused }: the file's two lines, from a file only its owner may
// read; a refusal names the file and the rule, never a value
export function readClientFile(path) {
  let st; try { st = statSync(path); } catch { return { refused: `${path}: no such file` }; }
  if (!st.isFile()) return { refused: `${path}: not a file` };
  if (st.mode & 0o077) return { refused: `${path} may be read by others (mode ${(st.mode & 0o777).toString(8)}): chmod 600 it first` };
  const vals = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?(GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) vals[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  const client = { client_id: vals.GOOGLE_CLIENT_ID || "", client_secret: vals.GOOGLE_CLIENT_SECRET || "" };
  const bad = credentialProblem(client);   // the two values (the origins are the config's: clientOrigins)
  return bad ? { refused: `${path}: ${bad}` } : { client };
}
// clientTail(id) -> the client id's last characters, as this tool prints it (never the id whole)
export const clientTail = (id) => `…${String(id).replace(/\.apps\.googleusercontent\.com$/, "").slice(-6)}`;
// setGoogleClient(KV, client, origins) -> { replaced }; clearGoogleClient(KV) -> {} | { refused }
export async function setGoogleClient(KV, client, origins) {
  const before = await KV.get(GOOGLE_CLIENT_KEY);
  await KV.put(GOOGLE_CLIENT_KEY, JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret, origins }));
  return { replaced: before != null };
}
export async function clearGoogleClient(KV) {
  if ((await KV.get(GOOGLE_CLIENT_KEY)) == null) return { refused: "no Google client is stored: nothing to clear" };
  await KV.delete(GOOGLE_CLIENT_KEY);
  return {};
}

// ---- the run records (8.5: every org write, BEFORE it acts) ----
// openRecord(dir, cmd, fields) -> { path, done(fields) }: the record written before the write, completed after it
export function openRecord(dir, cmd, fields) {
  const at = new Date().toISOString();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${at.replace(/[-:.]/g, "").slice(0, 15)}-${cmd}-o${fields.org}-${randomUUID().slice(0, 8)}.json`);
  let rec = { format: "operator-run/1", cmd, at, state: "writing", ...fields };
  const save = () => writeFileSync(path, JSON.stringify(rec, null, 1) + "\n");
  save();
  return { path, done: (more) => { rec = { ...rec, ...more, finishedAt: new Date().toISOString() }; save(); return rec; } };
}

// ---- the backends ----
// localD1(persistDir, cfg) -> the local worker's own persisted D1 (wrangler dev --persist-to <dir>: <dir>/v3); nothing reaches
// Cloudflare
export async function localD1(persistDir, cfg) {
  const d1 = cfg.d1_databases[0];
  const p = await localProxy(persistDir, { d1_databases: [{ binding: "DB", database_name: d1.database_name, database_id: d1.database_id }] });
  return { DB: p.env.DB, database: `local:${d1.database_name}`, close: p.close };
}
// localProxy(persistDir, bindings) -> { env, close }: wrangler's getPlatformProxy over the local worker's persisted state (<dir>/v3),
// through a temporary config that names only the bindings asked
async function localProxy(persistDir, bindings) {
  const { getPlatformProxy } = await import(pathToFileURL(join(ENGINE, "node_modules", "wrangler", "wrangler-dist", "cli.js")).href);
  const tmp = mkdtempSync(join(tmpdir(), "operator-"));
  const path = join(tmp, "wrangler.jsonc");
  writeFileSync(path, JSON.stringify({ name: "operator", compatibility_date: "2026-08-01", ...bindings }));
  const proxy = await getPlatformProxy({ configPath: path, persist: { path: join(resolve(persistDir), "v3") }, remoteBindings: false });
  return { env: proxy.env, close: async () => { await proxy.dispose(); rmSync(tmp, { recursive: true, force: true }); } };
}

// localKV(persistDir, ns) -> the local worker's own persisted KV namespace (the same <dir>/v3 wrangler dev --persist-to keeps)
export async function localKV(persistDir, ns) {
  const p = await localProxy(persistDir, { kv_namespaces: [{ binding: "OAUTH_KV", id: ns.id }] });
  return { KV: p.env.OAUTH_KV, database: "local:OAUTH_KV", close: p.close };
}
// liveKV(namespaceId) -> a KV-shaped binding (get · put · delete of one key) over the Cloudflare API (…/storage/kv/namespaces/<id>/
// values/<key>), with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment (nothing here prints either). WRITTEN, NOT
// YET RUN, as liveD1 was.
export function liveKV(namespaceId, env = process.env) {
  const token = env.CLOUDFLARE_API_TOKEN, account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error("--live needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (source the deployment's credentials file)");
  const url = (k) => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(k)}`;
  const call = async (method, k, body) => {
    const r = await fetch(url(k), { method, headers: { authorization: `Bearer ${token}`, "user-agent": "sharingu-operator/1.0", ...(body !== undefined ? { "content-type": "text/plain" } : {}) }, body });
    if (method === "GET" && r.status === 404) return null;
    if (!r.ok) throw new Error(`KV ${method}: HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 300)}`);
    return method === "GET" ? r.text() : (await r.arrayBuffer(), undefined);
  };
  return { get: (k) => call("GET", k), put: (k, v) => call("PUT", k, String(v)), delete: (k) => call("DELETE", k) };
}

// ---- 21.4a · the approval's email: its transport and where its links start ----
// localMailBackend(persistDir, cfg) -> the local worker's own D1 and, as the mailer, its capture in its own OAUTH_KV (the same
// mail-capture:… keys the worker's src/email.js captureMailer writes: tools/mail-capture.mjs reads both); nothing leaves the machine
export async function localMailBackend(persistDir, cfg) {
  const d1 = cfg.d1_databases[0], ns = (cfg.kv_namespaces || []).find((b) => b.binding === "OAUTH_KV");
  if (!ns) throw new Error("the config names no OAUTH_KV namespace (the local capture lies there)");
  const p = await localProxy(persistDir, { d1_databases: [{ binding: "DB", database_name: d1.database_name, database_id: d1.database_id }], kv_namespaces: [{ binding: "OAUTH_KV", id: ns.id }] });
  return { DB: p.env.DB, database: `local:${d1.database_name}`, mailer: captureMailer(p.env.OAUTH_KV), close: p.close };
}
// restBody(m) -> the REST send's body from the message as the worker's binding takes it: the binding's sender is { email, name },
// the REST API's { address, name } (its first live run, 2026-10-15, answered 400 invalid_request_schema to `email` and 200 to
// `address`); to, cc, subject, html and text pass as they are
export function restBody(m) {
  const f = m.from && typeof m.from === "object" ? { address: m.from.address || m.from.email, ...(m.from.name ? { name: m.from.name } : {}) } : m.from;
  return { ...m, from: f };
}
// restMailer(env, fetchFn) -> a mailer over Cloudflare Email Service's REST send (POST …/accounts/<id>/email/sending/send), the
// message as the worker's binding takes it ({ from, to, cc, subject, html, text }, sent as restBody shapes it), with
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment (nothing here prints either)
export function restMailer(env = process.env, fetchFn = fetch) {
  const token = env.CLOUDFLARE_API_TOKEN, account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error("--live needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (source the deployment's credentials file)");
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/email/sending/send`;
  return { kind: "cloudflare", send: async (m) => {
    const r = await fetchFn(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "sharingu-operator/1.0" }, body: JSON.stringify(restBody(m)) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.success === false) throw Object.assign(new Error(`email send: HTTP ${r.status} ${JSON.stringify((j && j.errors) || "").slice(0, 300)}`), { code: String(r.status) });
  } };
}
// linkOrigin(cfg, { live, given }) -> the origin the email's links start with: --origin (an http(s) address), else on --live the
// config's custom domain under sharingu.xyz (the brand's address); null for none
export function linkOrigin(cfg, { live = false, given } = {}) {
  if (given) { try { const u = new URL(String(given)); return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null; } catch { return null; } }
  const route = live ? ((cfg && cfg.routes) || []).find((x) => x && x.custom_domain && /(^|\.)sharingu\.xyz$/.test(String(x.pattern))) : null;
  return route ? `https://${route.pattern}` : null;
}

// orgLine(o) -> one org of list-orgs, on one line
const human = (b) => (b >= 2 ** 30 ? `${+(b / 2 ** 30).toFixed(2)} GB` : b >= 2 ** 20 ? `${+(b / 2 ** 20).toFixed(1)} MB` : b >= 1024 ? `${+(b / 1024).toFixed(1)} KB` : `${b} B`);
export function orgLine(o) {
  const l = o.shown && o.shown.limits;
  const use = (k, words, f = (x) => x) => (l && l[k] ? `${words} ${f(l[k].used)}/${f(l[k].allowed)}${l[k].state === "ok" ? "" : ` (${l[k].state})`}` : "");
  const usage = l ? [use("people", "people"), use("projects", "projects"), use("items_month", "items this month"), use("calls_day", "calls today"),
    use("burst_minute", "calls this minute"), use("storage_bytes", "stored", human)].join(" · ") : o.shown && o.shown.error ? `usage unread: ${o.shown.error}` : "no plan row applies";
  return `  ${o.id}  ${o.name}  /${o.slug || "(no path name)"}  plan ${o.plan}${o.shown && o.shown.plan && o.shown.plan !== o.plan ? ` (reads ${o.shown.plan}: no row "${o.plan}")` : ""}` +
    `${o.suspended ? `  SUSPENDED${o.suspended.at ? ` since ${o.suspended.at}` : ""}` : ""}${o.operating ? `  [${o.operating.split(" (")[0]}]` : ""}\n      ${usage}`;
}

// ---- the CLI ----
export const USAGE = "usage: node tools/operator.mjs <allow|list|revoke|remove-account|requests|decline|list-orgs|set-plan|raise|suspend|unsuspend|set-openai-challenge|clear-openai-challenge|set-google-client|clear-google-client> (--local <persist dir> --config <wrangler config> | --live --config <wrangler config> --confirm-live <D1 database name>) " +
  "allow --email <e> [--days N] [--reset] [--beyond-cap] · allow --request <id> [--beyond-cap] [--origin <url>] · list [--email <e>] [--json] · revoke --email <e> · remove-account --email <e> · requests · decline --request <id> · list-orgs [--json] · " +
  "set-plan --org <id|suites> --plan <name> · raise --org <id|suites> --plan <name> [--people N] [--projects N] [--items-month N] [--calls-day N] [--burst-minute N] [--storage-bytes N] · " +
  "suspend --org <id> [--really] · unsuspend --org <id> · set-openai-challenge --token <t> · clear-openai-challenge · set-google-client --file <path> [--origin <url>: a config with no custom domain] · clear-google-client";
const EMAIL_COMMANDS = ["allow", "list", "revoke", "remove-account"];
const ORG_COMMANDS = ["set-plan", "raise", "suspend", "unsuspend"];
// 11.3: the platform's own writes, on the deployment's KV (never an org's row); 21.4c: its Google client too
const CHALLENGE_COMMANDS = ["set-openai-challenge", "clear-openai-challenge"];
const GOOGLE_COMMANDS = ["set-google-client", "clear-google-client"];
const COMMANDS = [...EMAIL_COMMANDS, "requests", "decline", "list-orgs", ...ORG_COMMANDS, ...CHALLENGE_COMMANDS, ...GOOGLE_COMMANDS];
export const RECORD_DIR = join(ENGINE, ".runs", "operator");
// run(argv, { open, say, err, recordDir }) -> exit code. open(cfg, { local, live, kv }) -> a backend { DB, database, close }, or
// with kv (the challenge commands) { KV, database, close } (the selftest passes its own); say prints to this terminal (the code
// goes there and nowhere else); recordDir: where an org write's run record goes (default engine/.runs/operator)
export async function run(argv, { open, say = (s) => console.log(s), err = (s) => console.error(s), recordDir = RECORD_DIR } = {}) {
  const cmd = argv[0];
  const flag = (n) => { const i = argv.indexOf(n); return i > 0 && i + 1 < argv.length && !String(argv[i + 1]).startsWith("--") ? argv[i + 1] : undefined; };
  const local = flag("--local"), live = argv.includes("--live"), cfgPath = flag("--config");
  if (!COMMANDS.includes(cmd) || !cfgPath || !local === !live) { err(USAGE); return 2; }
  // allow names its email, or (21.2) the open request whose email it is: one of the two, never both
  const byRequest = cmd === "allow" && argv.includes("--request");
  if (byRequest && (argv.includes("--email") || !flag("--request"))) { err(USAGE); return 2; }
  // 21.P: decline names its open request, never an email
  if (cmd === "decline" && (argv.includes("--email") || !flag("--request"))) { err(USAGE); return 2; }
  if (EMAIL_COMMANDS.includes(cmd) && cmd !== "list" && !byRequest && !flag("--email")) { err(USAGE); return 2; }
  // 8.5: the org commands name their org (a whole number) and, but for (un)suspend, a plan; raise's numbers are whole numbers
  // --org suites: the suites' org (settings.suites, never org 1: tools/lib-mint-seat.sh's rule), found on the database opened
  const orgRaw = flag("--org"), suitesOrg = orgRaw === "suites";
  let org = /^\d+$/.test(String(orgRaw ?? "")) ? Number(orgRaw) : NaN;
  if (ORG_COMMANDS.includes(cmd) && !suitesOrg && (!Number.isSafeInteger(org) || org < 1)) { err(USAGE); return 2; }
  if ((cmd === "set-plan" || cmd === "raise") && !flag("--plan")) { err(USAGE); return 2; }
  if (cmd === "set-openai-challenge" && !argv.includes("--token")) { err(USAGE); return 2; }
  if (cmd === "set-google-client" && !flag("--file")) { err(USAGE); return 2; }
  const limits = {};
  if (cmd === "raise") {
    for (const [f, col] of Object.entries(LIMIT_FLAGS)) {
      if (!argv.includes(f)) continue;
      const v = flag(f);
      if (!/^\d+$/.test(String(v ?? ""))) { err(`${f} must be a whole number >= 0`); return 2; }
      limits[col] = Number(v);
    }
  }
  // the ruled rows are refused before anything is opened
  if (cmd === "raise" && RULED_PLANS.includes(flag("--plan"))) { err(`refused (nothing written): "${flag("--plan")}" is a ruled plan (the owner's numbers, migrate-075): this tool never edits it — raise the org on a row of its own (e.g. --plan acme-raised)`); return 1; }
  const daysRaw = flag("--days");
  const days = daysRaw === undefined ? DEFAULT_DAYS : Number(daysRaw);
  if (cmd === "allow" && (!/^\d+$/.test(String(daysRaw ?? DEFAULT_DAYS)) || days < 1 || days > MAX_DAYS)) { err(`--days must be a whole number from 1 to ${MAX_DAYS}`); return 2; }
  let cfg;
  try { cfg = readConfig(cfgPath); } catch (e) { err(`${cfgPath}: ${String((e && e.message) || e)}`); return 2; }
  // 21.4a: where the approval's email links start (--origin; on --live the config's sharingu.xyz route by default)
  const origin = byRequest ? linkOrigin(cfg, { live, given: flag("--origin") }) : null;
  if (byRequest && !origin) { err(`allow --request needs --origin <https://the worker's address> (where the "You're in" email's links start)${live ? ": the config names no sharingu.xyz route" : " on --local"}`); return 2; }
  if (!cfg.d1_databases || !cfg.d1_databases[0]) { err(`${cfgPath}: no D1 database`); return 2; }
  if (live && flag("--confirm-live") !== cfg.d1_databases[0].database_name) {
    err(`--live refused: --confirm-live must name the D1 database of ${cfgPath} (${cfg.d1_databases[0].database_name}) — the live shared database, every org's`);
    return 1;
  }
  if (EMAIL_COMMANDS.includes(cmd) && cmd !== "list" && !byRequest && emailProblem(flag("--email"))) { err(`refused: ${JSON.stringify(flag("--email"))}: ${emailProblem(flag("--email"))}`); return 1; }
  if (GOOGLE_COMMANDS.includes(cmd)) {
    // the file read and the client checked, then the namespace, before anything is opened; the secret is printed nowhere
    const file = cmd === "set-google-client" ? readClientFile(flag("--file")) : null;
    if (file && file.refused) { err(`refused (nothing written): ${file.refused}`); return 1; }
    const where = file ? clientOrigins(cfg, flag("--origin")) : null;
    if (where && where.refused) { err(`refused (nothing written): ${where.refused}`); return 1; }
    if (!(cfg.kv_namespaces || []).some((b) => b.binding === "OAUTH_KV")) { err(`${cfgPath}: no OAUTH_KV namespace (the deployment's KV, where the client lies)`); return 2; }
    const kb = await (open || defaultOpen)(cfg, { local, live, kv: true });
    try {
      if (file) {
        const r = await setGoogleClient(kb.KV, file.client, where.origins);
        say(`✓ stored: the Google client ${clientTail(file.client.client_id)} for ${where.origins.join(", ")} on ${kb.database}${r.replaced ? " (replacing the one before)" : ""}${live ? " (live KV: within a minute)" : ""}`);
        return 0;
      }
      const r = await clearGoogleClient(kb.KV);
      if (r.refused) { err(`refused (nothing written): ${r.refused}`); return 1; }
      say(`✓ the Google client cleared from ${kb.database}: no Continue with Google anywhere`);
      return 0;
    } finally { await kb.close(); }
  }
  if (CHALLENGE_COMMANDS.includes(cmd)) {
    // the token's form, then the namespace, before anything is opened
    const token = flag("--token");
    if (cmd === "set-openai-challenge" && challengeTokenProblem(token)) { err(`refused (nothing written): --token ${JSON.stringify(String(token ?? "").slice(0, 80))}: ${challengeTokenProblem(token)}`); return 1; }
    if (!(cfg.kv_namespaces || []).some((b) => b.binding === "OAUTH_KV")) { err(`${cfgPath}: no OAUTH_KV namespace (the deployment's KV, where the token lies)`); return 2; }
    const kb = await (open || defaultOpen)(cfg, { local, live, kv: true });
    try {
      const r = cmd === "set-openai-challenge" ? await setChallenge(kb.KV, token) : await clearChallenge(kb.KV);
      if (r.refused) { err(`refused (nothing written): ${r.refused}`); return 1; }
      if (cmd === "set-openai-challenge") say(`✓ the OpenAI challenge token stored on ${kb.database}${r.before == null ? "" : r.before === r.token ? " (the same token as before)" : `, replacing ${r.before} (undo: set-openai-challenge --token ${r.before})`}: GET /.well-known/openai-apps-challenge answers ${r.token}${live ? " (live KV: within a minute)" : ""}`);
      else say(`✓ the OpenAI challenge token ${r.before} cleared from ${kb.database}: GET /.well-known/openai-apps-challenge answers 404 (undo: set-openai-challenge --token ${r.before})`);
      return 0;
    } finally { await kb.close(); }
  }
  const be = await (open || defaultOpen)(cfg, { local, live, mail: byRequest });
  try {
    if (cmd === "allow" && byRequest) {
      // 21.2 / 21.4a: the open (verified) request read first; then the places, the one guarded approval and its one email
      const q = await openRequest(be.DB, flag("--request"));
      if (q.refused) { err(`refused (nothing written): ${q.refused}`); return 1; }
      const request = q.request;
      say(`  request ${request.id}: ${request.name}, ${request.company} <${request.email}>, place ${request.place} in line`);
      const r = await approveRequest(be.DB, request, { beta: { beyond: argv.includes("--beyond-cap") } });
      if (r.refused) { err(`refused (nothing written): ${r.refused}`); return 1; }
      say(`✓ request ${request.id} approved on ${be.database}: its status page says its place is open`);
      const p = r.places;
      say(p.beyond ? `  --beyond-cap: approved PAST the beta's ${p.cap} places — ${p.taken + p.need} of ${p.cap} taken with this one (${placesWords(p)} before it)`
        : `  the beta's places: ${p.leftAfter} of ${p.cap} left${p.need ? " after this one" : " (this email already made an org: it takes no new place)"} (${placesWords(p)} before it)`);
      const m = await sendMail({ DB: be.DB }, be.mailer, { to: request.email, perAddress: false, build: () => inMail({ origin, name: request.name, company: request.company }) });
      say(m.sent ? `  "You're in" sent to ${request.email} (${be.mailer.kind === "capture" ? "the local capture" : "Cloudflare Email Service"}, counted in the cap)`
        : `  ! "You're in" was NOT sent (${m.reason}${m.code ? ` ${m.code}` : ""}): the approval stands — tell ${request.email} yourself that their place is open`);
      return 0;
    }
    if (cmd === "allow") {
      const email = flag("--email");
      // A7: what the code will open, said BEFORE it is minted
      const held = seatsLine(await seatsOfEmail(be.DB, email));
      if (held) say(held);
      const r = await allowEmail(be.DB, email, { days, reset: argv.includes("--reset"), beta: { beyond: argv.includes("--beyond-cap") } });
      if (r.refused) { err(`refused (nothing written): ${r.refused}`); return 1; }
      say(`✓ allowed ${r.email} on ${be.database}, until ${r.expiresAt} (${r.days} day${r.days === 1 ? "" : "s"})${r.replaced ? `; its earlier open code is revoked` : ""}${r.reset ? "; its sign-up RESETS the account (every session of its seats ends)" : ""}`);
      const p = r.places;
      say(p.beyond ? `  --beyond-cap: allowed PAST the beta's ${p.cap} places — ${p.taken + p.need} of ${p.cap} taken with this one (${placesWords(p)} before it)`
        : `  the beta's places: ${p.leftAfter} of ${p.cap} left${p.need ? " after this one" : " (this email already made an org: its code takes no new place)"} (${placesWords(p)} before it)`);
      say(`  code: ${r.code}`);
      say("  Hand the email and this code to the person yourself. It is shown this once and kept nowhere (the database holds its hash); it opens one sign-up, at /signup, for this email only.");
      return 0;
    }
    if (cmd === "decline") {
      const r = await declineRequest(be.DB, flag("--request"));
      if (r.refused) { err(`refused (nothing written): ${r.refused}`); return 1; }
      say(`✓ request ${r.request.id} declined on ${be.database}: ${r.request.name}, ${r.request.company} <${r.request.email}> (was place ${r.request.place} in line); its status page says the request is closed`);
      return 0;
    }
    if (cmd === "requests") {
      const rows = await listRequests(be.DB);
      say(placesLine(await betaPlaces(be.DB)));
      say(`${plural(rows.length, "open request")} on ${be.database}${rows.length ? ", in line order (approve one: allow --request <id>):" : ""}`);
      for (const r of rows) say(`  ${r.place}  ${r.id}  ${r.company} · ${r.role} · ${TEAM_SIZES[r.team_size] || r.team_size}  ${r.name} <${r.email}>  verified ${r.verified_at}`);
      return 0;
    }
    if (cmd === "list") {
      const rows = await listAllowed(be.DB, { email: flag("--email") || null });
      const places = await betaPlaces(be.DB);
      if (argv.includes("--json")) { say(JSON.stringify({ database: be.database, places, allowed: rows }, null, 1)); return 0; }
      say(placesLine(places));
      say(`${rows.length} allowed email${rows.length === 1 ? "" : "s"} on ${be.database}${rows.length ? ":" : ""}`);
      for (const r of rows) say(`  ${r.email}  ${r.state}${r.how ? ` (${r.how})` : ""}  allowed ${r.created}  ${r.state === "used" ? `used ${r.used}` : r.state === "revoked" ? `revoked ${r.revoked}` : `expires ${r.expires}`}${r.codes > 1 ? `  · ${r.codes} codes` : ""}`);
      return 0;
    }
    if (cmd === "list-orgs") {
      const rows = await listOrgs(be.DB);
      const places = await betaPlaces(be.DB);
      if (argv.includes("--json")) { say(JSON.stringify({ database: be.database, places, orgs: rows }, null, 1)); return 0; }
      say(placesLine(places));
      say(`${rows.length} org${rows.length === 1 ? "" : "s"} on ${be.database}${rows.length ? ":" : ""}`);
      for (const o of rows) say(orgLine(o));
      return 0;
    }
    if (ORG_COMMANDS.includes(cmd)) {
      if (suitesOrg) {
        const so = await be.DB.prepare(SUITES_ORG_SQL).first();
        if (!so) { err(`refused (nothing written): no suites' org on ${be.database} (an org other than org 1 whose settings say suites)`); return 1; }
        org = Number(so.id);
        say(`  --org suites: org ${org} on ${be.database}`);
      }
      // the record BEFORE the write: what the org holds now, what is asked (the undo is in it)
      const before = await be.DB.prepare(ORG_ROW_SQL).bind(org).first();
      const planBefore = cmd === "raise" ? await be.DB.prepare(PLAN_ROW_SQL).bind(flag("--plan")).first() : null;
      const rec = openRecord(recordDir, cmd, { database: be.database, org, before: before ? { plan: before.plan, settings: before.settings } : null,
        ...(cmd === "set-plan" || cmd === "raise" ? { plan: flag("--plan") } : {}), ...(cmd === "raise" ? { limits, planRowBefore: planBefore ? limitsRow(planBefore) : null } : {}),
        ...(cmd === "suspend" ? { really: argv.includes("--really") } : {}) });
      const r = cmd === "set-plan" ? await setPlan(be.DB, org, flag("--plan"))
        : cmd === "raise" ? await raisePlan(be.DB, org, flag("--plan"), limits)
          : cmd === "suspend" ? await suspendOrg(be.DB, org, { really: argv.includes("--really") }) : await unsuspendOrg(be.DB, org);
      if (r.refused) { rec.done({ state: "refused", why: r.refused }); err(`refused (nothing written): ${r.refused}`); return 1; }
      const after = await be.DB.prepare(ORG_ROW_SQL).bind(org).first();
      rec.done({ state: "done", result: r, after: after ? { plan: after.plan, settings: after.settings } : null });
      if (cmd === "set-plan") say(`✓ org ${org} on ${be.database}: plan ${r.from} -> ${r.to} (undo: set-plan --org ${org} --plan ${r.from}; the record: ${rec.path})`);
      else if (cmd === "raise") say(`✓ org ${org} on ${be.database}: plan ${r.from} -> ${r.plan}, its row ${r.created ? "written (from team's numbers)" : "updated"}: ` +
        LIMIT_COLS.map((c) => `${c} ${r.after[c]}`).join(", ") + ` (undo: set-plan --org ${org} --plan ${r.from}${r.before ? `, and the row's numbers before are in the record` : ""}; the record: ${rec.path})`);
      else if (cmd === "suspend") say(`✓ org ${org} ("${r.name}") on ${be.database} SUSPENDED: its people meet one 403 org_suspended at every door within a minute; nothing of it is deleted (undo: unsuspend --org ${org}; the record: ${rec.path})`);
      else say(`✓ org ${org} ("${r.name}") on ${be.database} lifted: its doors answer again at once (the record: ${rec.path})`);
      return 0;
    }
    if (cmd === "remove-account") {
      const r = await removeAccount(be.DB, flag("--email"));
      if (r.refused) { err(`refused (nothing written): ${r.refused}`); return 1; }
      say(`✓ removed the account of ${r.email} from ${be.database}: ${r.sessions} session(s), ${r.attempts} sign-in attempt(s) and ${r.codes} sign-up code(s) with it` +
        `${r.detached ? `; ${r.detached} inactive seat(s) kept as their org's record, detached from it` : ""}`);
      return 0;
    }
    const r = await revokeEmail(be.DB, flag("--email"));
    if (r.refused) { err(`refused: ${r.refused}`); return 1; }
    say(`✓ revoked the open code of ${r.email} on ${be.database}`);
    return 0;
  } finally { await be.close(); }
}
const defaultOpen = async (cfg, { local, live, kv, mail }) => {
  if (kv) { const ns = cfg.kv_namespaces.find((b) => b.binding === "OAUTH_KV"); return live ? { KV: liveKV(ns.id), database: `live:OAUTH_KV (${cfg.name || "the worker"})`, close: async () => {} } : localKV(local, ns); }
  // 21.4a: allow --request also sends its email — live through Cloudflare's REST send API, local into the worker's own capture
  if (mail) return live ? { DB: liveD1(cfg.d1_databases[0].database_id), database: `live:${cfg.d1_databases[0].database_name}`, mailer: restMailer(), close: async () => {} } : localMailBackend(local, cfg);
  return live ? { DB: liveD1(cfg.d1_databases[0].database_id), database: `live:${cfg.d1_databases[0].database_name}`, close: async () => {} } : localD1(local, cfg);
};

// run directly (REAL paths: macOS keeps var under a private symlink — a string compare would silently never run the CLI)
const runDirectly = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || ""); } catch { return false; } };
if (runDirectly()) {
  run(process.argv.slice(2)).then((rc) => process.exit(rc), (e) => { console.error(`✗ ${String((e && e.message) || e)}`); process.exit(1); });
}
