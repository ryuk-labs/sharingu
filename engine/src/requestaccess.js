// src/requestaccess.js — request access (sprint 21, slice 21.1; migrate-081's access_requests; the owner's MCQs of 2026-10-13): a
// person asks for a place in the beta with a profile, before any account or org. The public door POST /request-access (src/index.js:
// no session; the same-origin guard and the address's flood filter POST /login spends) and the request's own private page GET
// /request-access/<token> read and write through here; the pages are src/requestpage.js.
//
// readRequest(input) -> { request } (the profile, normalised) | { field } (the first field that is wrong), checked BEFORE anything
// is read or written. Strict and simple: every text trimmed, its runs of spaces and control characters folded to one space, held
// to its length; the email lower-cased (the account's spelling, src/accounts.js normEmail) and plain ASCII; the team size one of
// TEAM_SIZES; the website an http(s) address (a bare domain gains https://); LinkedIn, X and GitHub each a handle or that
// service's own address, stored as the service's address built here (never the text as typed).
// fileRequest(env, request) -> the new request's private link token, or null for a REPEAT (the owner's ruling, 2026-10-13: THE
// FIRST REQUEST STANDS): ONE insert that does nothing on idx_access_requests_open, so a request for an email whose request is open
// changes nothing (no profile, no link: the first link keeps working), and two at once make one row, the second the repeat. The
// door answers a repeat with the asked page (REQUEST_ASKED_PATH): it says the email asked, which the owner accepted. Nothing reads
// accounts: an account's email with no open request files a request as any other.
// requestByToken(env, token) -> the request's row for its private page, or null (no such link: the one not-found).
// placeInLine(env, request) -> an OPEN request's place in line (sprint 21, 21.2: 1 + the open requests that came before it), from
// ONE statement on idx_access_requests_line: the earlier ones by a covering range count, the same instant's by id, so two at
// once never share a place. Its rows read are the requests ahead of it, never the table.
// approvedProfile(env, email) -> { name, company } of the email's newest APPROVED request, or null (sprint 21, 21.2: the org form a
// web sign-up answers is filled in from it). The caller passes ONLY an email a sign-up's code just proved (src/index.js POST
// /signup, after signUp's ok): the profile is the person's own, never read for an email someone merely typed. One SEARCH on
// idx_access_requests_email (migrate-081), its order the index's.
import { db } from "./data.js";
import { uid, now, sha256, hex } from "./util.js";
import { normEmail, asciiEmail } from "./accounts.js";
import { EMAIL_RE } from "./signup.js";

// the private link: 24 random bytes as 48 hex characters (192 bits), after the page's path; only its hash is kept
export const REQUEST_PATH = "/request-access";
export const REQUEST_TOKEN_BYTES = 24;
export const REQUEST_TOKEN_RE = /^[0-9a-f]{48}$/;
// the repeat's page: a fixed path no token can be (a token is 48 hex characters), naming nothing the request typed
export const REQUEST_ASKED_PATH = "/request-access/asked";
// the check page (sprint 21, 21.P: "Check my request" in the front door's top bar): a fixed path no token can be, reading nothing
export const REQUEST_CHECK_PATH = "/request-access/check";
// requestTokenHash(token) -> the hash access_requests keeps (the token itself is kept nowhere)
export const requestTokenHash = (token) => sha256(`sharingu-request:v1:${String(token == null ? "" : token)}`);
export const newRequestToken = () => hex(REQUEST_TOKEN_BYTES);

// the team sizes the form offers, value -> the words it shows
export const TEAM_SIZES = { "1": "Just me", "2-10": "2 to 10", "11-50": "11 to 50", "51-200": "51 to 200", "201+": "More than 200" };
// each text field's longest form, after folding
export const REQUEST_MAX = { name: 100, company: 100, role: 80, email: 254, website: 200, linkedin: 200, x: 200, github: 200, ai_tools: 200, use_case: 280 };
// the honeypot: a field no person sees (src/requestpage.js hides it); a request that fills it is answered as any other and dropped
export const REQUEST_TRAP = "trap";
// the fields a form or a JSON body sends (web: the form's marker)
export const REQUEST_FIELDS = ["name", "email", "company", "role", "team_size", "website", "linkedin", "x", "github", "ai_tools", "use_case", REQUEST_TRAP, "web"];

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

// the one write: a new open request, or nothing when the email's request is open (the first stands; its row reports no change)
export const REQUEST_INSERT_SQL = "INSERT INTO access_requests (id, email, name, company, role, team_size, website, linkedin, x, github, ai_tools, use_case, status, token_hash, created_at, updated_at) " +
  "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'open', ?13, ?14, ?14) ON CONFLICT (email) WHERE status = 'open' DO NOTHING";
export async function fileRequest(env, r) {
  const token = newRequestToken();
  const res = await db(env).prepare(REQUEST_INSERT_SQL).bind(uid(), r.email, r.name, r.company, r.role, r.team_size, r.website, r.linkedin, r.x, r.github, r.ai_tools, r.use_case,
    await requestTokenHash(token), now()).run();
  // fail-closed: an answer that does not report the one row it wrote hands out no link (the repeat's page instead)
  return ((res && res.meta && res.meta.changes) || 0) >= 1 ? token : null;
}
// the private page's one read, by the link's hash (a malformed token reads nothing)
export const REQUEST_BY_TOKEN_SQL = "SELECT id, name, company, status, created_at FROM access_requests WHERE token_hash = ?1";
export async function requestByToken(env, token) {
  if (!REQUEST_TOKEN_RE.test(String(token == null ? "" : token))) return null;
  return (await db(env).prepare(REQUEST_BY_TOKEN_SQL).bind(await requestTokenHash(token)).first()) || null;
}
// the place: ?1 the request's created_at, ?2 its id (the two subqueries each held to the line index: INDEXED BY fails loudly if
// it could not be used, never a quiet scan)
export const REQUEST_PLACE_SQL = "SELECT 1 + (SELECT COUNT(*) FROM access_requests INDEXED BY idx_access_requests_line WHERE status = 'open' AND created_at < ?1) " +
  "+ (SELECT COUNT(*) FROM access_requests INDEXED BY idx_access_requests_line WHERE status = 'open' AND created_at = ?1 AND id < ?2) AS place";
export async function placeInLine(env, r) {
  const row = await db(env).prepare(REQUEST_PLACE_SQL).bind(String(r.created_at), String(r.id)).first();
  const n = Number(row && row.place);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
export const APPROVED_PROFILE_SQL = "SELECT name, company FROM access_requests INDEXED BY idx_access_requests_email WHERE email = ?1 AND status = 'approved' ORDER BY approved_at DESC LIMIT 1";
export async function approvedProfile(env, email) {
  const row = await db(env).prepare(APPROVED_PROFILE_SQL).bind(normEmail(email)).first();
  return row ? { name: String(row.name || ""), company: String(row.company || "") } : null;
}
