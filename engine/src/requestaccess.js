// src/requestaccess.js — request access (sprint 21, slices 21.1 and 21.4a; migrate-081's access_requests; the owner's MCQs of
// 2026-10-13 and 2026-10-14): a person asks for a place in the beta with a profile AND a passphrase, before any account or org. The
// public door POST /request-access (src/index.js: no session; the same-origin guard and the address's flood filter POST /login
// spends) and the account flow's pages (src/index.js /account/…, src/accountpage.js) read and write through here; the form is
// src/requestpage.js; the verification itself, which makes the account, is src/accounts.js verifyJoin.
//
// readRequest(input) -> { request } (the profile, normalised) | { field } (the first field that is wrong), checked BEFORE anything
// is read or written. Strict and simple: every text trimmed, its runs of spaces and control characters folded to one space, held
// to its length; the email lower-cased (the account's spelling, src/accounts.js normEmail) and plain ASCII; the team size one of
// TEAM_SIZES; the website an http(s) address (a bare domain gains https://); LinkedIn, X and GitHub each a handle or that
// service's own address, stored as the service's address built here (never the text as typed). joinProblem({ password, confirm })
// -> "" or the passphrase field that is wrong (the account's rule: src/secrets.js passphraseProblem; the two the same).
// fileRequest(env, request, { pass, tokenHash }) -> the new UNVERIFIED request's id: ONE batch, the cleanup on write first (every
// unverified request past its end deleted: idx_access_requests_unverified), then the row with the passphrase's hash (pass:
// joinPass's answer) and the verification link's hash, live VERIFY_HOURS. Unverified requests are many per email (each a join);
// it holds no place until its email is verified, and the FIRST verified one stands (src/accounts.js verifyJoin).
// pendingJoinOf(env, email) -> the email's newest live unverified request ({ id, name }), or null (a resend's one question).
// rotateVerify(env, id, tokenHash) -> true when that request's link was replaced by a new one, live VERIFY_HOURS from now (a resend:
// the old link stops working; only the new one's hash is kept).
// verifiedRequestOf(env, email) -> the email's ONE verified request ({ id, name, company, status, verified_at, … }), or null (the
// status page's read: the email an account session carries, never one typed).
// placeInLine(env, request) -> an OPEN request's place in line (1 + the open requests VERIFIED before it), from ONE statement on
// idx_access_requests_line: the earlier ones by a covering range count, the same instant's by id, so two at once never share a
// place. Its rows read are the requests ahead of it, never the table.
// approvedProfile(env, email) -> { name, company } of the email's APPROVED request (one per email), or null (the org form is filled in from
// it). The caller passes ONLY an email a session or a sign-up's code proved: the profile is the person's own.
import { db } from "./data.js";
import { uid, now, sha256, hex, pbkdf2 } from "./util.js";
import { normEmail, asciiEmail } from "./accounts.js";
import { EMAIL_RE } from "./signup.js";
import { passphraseProblem } from "./secrets.js";
import { VERIFY_HOURS } from "./mails.js";

// the account flow's pages (sprint 21, 21.4a), at the platform's root (src/orgpath.js PLATFORM_PATHS: "account" is one of the
// platform's fixed words, src/orgnames.js)
export const REQUEST_PATH = "/request-access";
export const ACCOUNT_PATH = "/account";
export const SENT_PATH = "/account/sent";
export const VERIFY_PATH = "/account/verify";
export const RESEND_PATH = "/account/resend";
export const FORGOT_PATH = "/account/forgot";
export const RESET_PATH = "/account/reset";
// a link's token (the verification's, a reset's): 24 random bytes as 48 hex characters (192 bits), after its page's path; only its
// hash is kept, each kind under its own domain tag
export const LINK_TOKEN_BYTES = 24;
export const LINK_TOKEN_RE = /^[0-9a-f]{48}$/;
export const newLinkToken = () => hex(LINK_TOKEN_BYTES);
export const verifyTokenHash = (token) => sha256(`sharingu-verify:v1:${String(token == null ? "" : token)}`);
export const resetTokenHash = (token) => sha256(`sharingu-reset:v1:${String(token == null ? "" : token)}`);

// the team sizes the form offers, value -> the words it shows
export const TEAM_SIZES = { "1": "Just me", "2-10": "2 to 10", "11-50": "11 to 50", "51-200": "51 to 200", "201+": "More than 200" };
// each text field's longest form, after folding
export const REQUEST_MAX = { name: 100, company: 100, role: 80, email: 254, website: 200, linkedin: 200, x: 200, github: 200, ai_tools: 200, use_case: 280 };
// the honeypot: a field no person sees (src/requestpage.js hides it); a request that fills it is answered as any other and dropped
export const REQUEST_TRAP = "trap";
// the fields a form or a JSON body sends (web: the form's marker)
export const REQUEST_FIELDS = ["name", "email", "company", "role", "team_size", "website", "linkedin", "x", "github", "ai_tools", "use_case", "password", "confirm", REQUEST_TRAP, "web"];

// fold(v) -> the text with every run of spaces and control characters one space, trimmed
const fold = (v) => String(v == null ? "" : v).replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
// webAddress(v) -> an http(s) address on a named host (a bare domain gains https://; no user or password), or null
function webAddress(v) {
  const s = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v;
  let u; try { u = new URL(s); } catch { return null; }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) return null;
  return u.href;
}
// the three profiles: the hosts their addresses live on, a handle's form, and the address built from a handle
const PROFILES = {
  linkedin: { hosts: ["linkedin.com"], path: /^\/(in|company)\/([A-Za-z0-9%_-]{2,100})\/?$/, handle: /^[A-Za-z0-9%_-]{2,100}$/,
    url: (h, kind = "in") => `https://www.linkedin.com/${kind}/${h}` },
  x: { hosts: ["x.com", "twitter.com"], path: /^\/([A-Za-z0-9_]{1,15})\/?$/, handle: /^[A-Za-z0-9_]{1,15}$/, url: (h) => `https://x.com/${h}` },
  github: { hosts: ["github.com"], path: /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/?$/, handle: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, url: (h) => `https://github.com/${h}` },
};
// profileAddress(kind, v) -> the service's own address for a handle (@name or name) or for one of its addresses, or null
function profileAddress(kind, v) {
  const p = PROFILES[kind];
  const bare = v.replace(/^@/, "");
  if (p.handle.test(bare) && !/[./]/.test(v)) return p.url(bare);
  let u; try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|mobile)\./, "");
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || !p.hosts.includes(host)) return null;
  const m = p.path.exec(u.pathname);
  if (!m) return null;
  return kind === "linkedin" ? p.url(m[2], m[1]) : p.url(m[1]);
}

// readRequest(input) -> { request } | { field }: the fields in the form's order, the first wrong one named
export function readRequest(input) {
  const i = input && typeof input === "object" ? input : {};
  const r = {};
  for (const f of ["name", "email", "company", "role"]) {
    const v = fold(i[f]);
    if (!v || v.length > REQUEST_MAX[f]) return { field: f };
    r[f] = v;
  }
  r.email = normEmail(r.email);
  if (!EMAIL_RE.test(r.email) || !asciiEmail(r.email)) return { field: "email" };
  const size = fold(i.team_size);
  if (!Object.prototype.hasOwnProperty.call(TEAM_SIZES, size)) return { field: "team_size" };
  r.team_size = size;
  for (const f of ["website", "linkedin", "x", "github"]) {
    const v = fold(i[f]);
    if (!v) { r[f] = null; continue; }
    const a = v.length > REQUEST_MAX[f] ? null : f === "website" ? webAddress(v) : profileAddress(f, v);
    if (!a || a.length > REQUEST_MAX[f]) return { field: f };
    r[f] = a;
  }
  for (const f of ["ai_tools", "use_case"]) {
    const v = fold(i[f]);
    if (v.length > REQUEST_MAX[f]) return { field: f };
    r[f] = v || null;
  }
  return { request: r };
}
// trapped(input) -> true when the honeypot holds anything
export const trapped = (input) => fold(input && input[REQUEST_TRAP]) !== "";
// joinProblem({ password, confirm }) -> "" | "password" | "confirm" (confirm: checked when sent, as the sign-up's)
export function joinProblem({ password, confirm } = {}) {
  if (passphraseProblem(password, { account: true }) || String(password).length > 1024) return "password";
  if (confirm != null && String(confirm) !== String(password)) return "confirm";
  return "";
}
// joinPass(password) -> { hash, salt }: the joined passphrase as the account will keep it (src/accounts.js: pbkdf2, a 16-byte salt)
export async function joinPass(password) {
  const salt = hex(16);
  return { hash: await pbkdf2(String(password == null ? "" : password), salt), salt };
}

// the cleanup on write (?1 now), then the one insert: an UNVERIFIED request, its passphrase's hash and its link's hash
export const REQUEST_CLEANUP_SQL = "DELETE FROM access_requests WHERE status = 'unverified' AND verify_expires <= ?1";
export const REQUEST_INSERT_SQL = "INSERT INTO access_requests (id, email, name, company, role, team_size, website, linkedin, x, github, ai_tools, use_case, status, pass_hash, pass_salt, verify_hash, verify_expires, created_at, updated_at) " +
  "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'unverified', ?13, ?14, ?15, ?16, ?17, ?17)";
const verifyEnd = (at = Date.now()) => new Date(at + VERIFY_HOURS * 60 * 60 * 1000).toISOString();
export async function fileRequest(env, r, { pass, tokenHash }) {
  const id = uid(), at = now();
  await db(env).batch([
    db(env).prepare(REQUEST_CLEANUP_SQL).bind(at),
    db(env).prepare(REQUEST_INSERT_SQL).bind(id, r.email, r.name, r.company, r.role, r.team_size, r.website, r.linkedin, r.x, r.github, r.ai_tools, r.use_case,
      pass.hash, pass.salt, String(tokenHash), verifyEnd(), at),
  ]);
  return id;
}
// the email's newest live unverified request (?1 the email, ?2 now)
export const PENDING_JOIN_SQL = "SELECT id, name FROM access_requests INDEXED BY idx_access_requests_email WHERE email = ?1 AND status = 'unverified' AND verify_expires > ?2 ORDER BY created_at DESC LIMIT 1";
export async function pendingJoinOf(env, email) {
  const row = await db(env).prepare(PENDING_JOIN_SQL).bind(normEmail(email), now()).first();
  return row ? { id: String(row.id), name: String(row.name || "") } : null;
}
// a resend's new link (?1 the request, ?2 the new hash, ?3 its end, ?4 now): only while the request is unverified and live
export const ROTATE_VERIFY_SQL = "UPDATE access_requests SET verify_hash = ?2, verify_expires = ?3, updated_at = ?4 WHERE id = ?1 AND status = 'unverified' AND verify_expires > ?4";
export async function rotateVerify(env, id, tokenHash) {
  const r = await db(env).prepare(ROTATE_VERIFY_SQL).bind(String(id), String(tokenHash), verifyEnd(), now()).run();
  return ((r && r.meta && r.meta.changes) || 0) >= 1;
}
// the email's one verified request (migrate-081's idx_access_requests_verified: at most one)
export const VERIFIED_REQUEST_SQL = "SELECT id, name, company, role, team_size, status, verified_at, approved_at FROM access_requests INDEXED BY idx_access_requests_email " +
  "WHERE email = ?1 AND status IN ('open', 'approved', 'declined') LIMIT 1";
export async function verifiedRequestOf(env, email) {
  return (await db(env).prepare(VERIFIED_REQUEST_SQL).bind(normEmail(email)).first()) || null;
}
// the place: ?1 the request's verified_at, ?2 its id (the two subqueries each held to the line index: INDEXED BY fails loudly if
// it could not be used, never a quiet scan)
export const REQUEST_PLACE_SQL = "SELECT 1 + (SELECT COUNT(*) FROM access_requests INDEXED BY idx_access_requests_line WHERE status = 'open' AND verified_at < ?1) " +
  "+ (SELECT COUNT(*) FROM access_requests INDEXED BY idx_access_requests_line WHERE status = 'open' AND verified_at = ?1 AND id < ?2) AS place";
export async function placeInLine(env, r) {
  const row = await db(env).prepare(REQUEST_PLACE_SQL).bind(String(r.verified_at), String(r.id)).first();
  const n = Number(row && row.place);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
export const APPROVED_PROFILE_SQL = "SELECT name, company FROM access_requests INDEXED BY idx_access_requests_email WHERE email = ?1 AND status = 'approved'";
export async function approvedProfile(env, email) {
  const row = await db(env).prepare(APPROVED_PROFILE_SQL).bind(normEmail(email)).first();
  return row ? { name: String(row.name || ""), company: String(row.company || "") } : null;
}
