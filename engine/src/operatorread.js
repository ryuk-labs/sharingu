// src/operatorread.js — THE OPERATOR PAGE's read and its two writes (sprint 21, slice 21.4b; the owner's approved data collection of
// 2026-10-14; the screen is src/operatorpage.js, the route src/index.js /operator): the beta's people for the platform's operator.
//
// WHO (mayOperate): an ADMIN of org 1 (HOME_ORG, the operating org: the org the sign-in found is 1 — src/data.js readerOrg, from the
// credential alone — and the reader's own row says org 1 and role owner, the one admin marker every door reads). The page lives under
// org 1's address (/<org 1>/operator; `operator` is one of the platform's fixed words, src/orgnames.js, so no org takes it). Anyone
// else — an admin of any other org, a member of org 1, a read-only credential's write, no session — gets the ONE not-here answer the
// router gives an address that serves nothing (src/index.js NOT_HERE), the same for every case: the page's existence is told to no
// one but its readers. This is the one place the worker reads across orgs on purpose: the platform's own requests (access_requests,
// no org's row) and, for an org a request founded, its name, path name and product profile (org_profile) — what its founder agreed
// the operator sees ("Only you and the sharingu operator see it", src/orgprofile.js PRODUCT_NOTE).
//
// readOperator(env, { status, after }) -> { funnel, people, more, next, status, statuses, funnelRows } — every word the page shows
// beside a stored key (a team size, a consent box, a product answer) read here from its one list, so the screen draws text only
//   funnel  ONE aggregate statement (FUNNEL_SQL) over the newest FUNNEL_ROWS requests (rowid order: the table's own b-tree walked
//           backwards, never the whole table): requested (every request held, the unverified ones of the last day included),
//           verified, approved, signed up (an approved person who signed in since the approval — an account session minted after
//           approved_at, idx_account_sessions_account — or founded an org), org created; and the three that wait or end: open (in
//           line), declined, cleared. capped: true when the newest FUNNEL_ROWS were all the statement read.
//   people  ONE page of PAGE_ROWS requests of one status (open: the line; approved; declined), in line order (verified_at, id), a
//           keyset range on idx_access_requests_people (after: the last row's verified_at and id), each with its profile, consent,
//           source and path, and — once its org stands — the org's name, path name and product answers (two primary-key probes a
//           row); an open one its place in line (the page's first row's by REQUEST_PLACE_SQL, the rest in order after it).
//           more/next: whether another page follows, and its `after`.
//   places  the beta's places now (src/accounts.js betaCount): read by the route beside it.
// approveRequest(env, id, { origin }) -> { request, mail } | { refused }: an OPEN request approved (the cap counted first, as the
//   operator's allow --request counts it: the email's own open code left out; at the cap it is refused here — past it only the
//   operator's terminal approves, its own flag named), in ONE guarded write (APPROVE_REQUEST_SQL: only while open), then its ONE "You're in" through
//   src/email.js sendMail (counted in the cap, not the per-address limit: no stranger triggers it; mail: sendMail's answer).
// declineRequest(env, id) -> { request } | { refused }: an OPEN request declined (DECLINE_REQUEST_SQL: status, declined_at), no email.
// The three request statements are tools/operator.mjs's too (it imports them: one source for the terminal and the page).
import { db, readerOrg, HOME_ORG } from "./data.js";
import { now } from "./util.js";
import { betaCount } from "./accounts.js";
import { REQUEST_PLACE_SQL, TEAM_SIZES, CONSENT_BOXES } from "./requestaccess.js";
import { PRODUCT_CHOICES, wordsOf } from "./orgprofile.js";
import { sendMail, mailerOf } from "./email.js";
import { inMail } from "./mails.js";

export const FUNNEL_ROWS = 1000;
export const PAGE_ROWS = 20;
export const PEOPLE_STATUSES = ["open", "approved", "declined"];
export const REQUEST_ID_RE = /^[A-Za-z0-9-]{1,80}$/;   // the worker's ids are UUIDs; a quote or a space is never one

// mayOperate(env, reader) -> true for an admin of org 1 signed in as that seat (the org from the sign-in, never a parameter)
export const mayOperate = (env, reader) => !!reader && readerOrg(env) === HOME_ORG && Number(reader.org) === HOME_ORG && reader.role === "owner";

// ---- the statements ----
// the funnel: ?1 FUNNEL_ROWS
export const FUNNEL_SQL = "SELECT COUNT(*) AS requested, COUNT(r.verified_at) AS verified, COUNT(r.approved_at) AS approved, " +
  "COALESCE(SUM(r.approved_at IS NOT NULL AND (r.org_at IS NOT NULL OR EXISTS (SELECT 1 FROM account_sessions s INDEXED BY idx_account_sessions_account WHERE s.account_id = r.account_id AND s.created_at >= r.approved_at))), 0) AS signed_up, " +
  "COUNT(r.org_at) AS orgs, COALESCE(SUM(r.status = 'open'), 0) AS open, COALESCE(SUM(r.status = 'declined'), 0) AS declined, COALESCE(SUM(r.cleared_at IS NOT NULL), 0) AS cleared " +
  "FROM (SELECT status, verified_at, approved_at, account_id, account_at, org_at, cleared_at FROM access_requests ORDER BY rowid DESC LIMIT ?1) r";
// one page of people: ?1 the status, ?2 and ?3 the last row's verified_at and id ('' and '' for the first page), ?4 the rows (one more
// than shown: whether a next page follows)
export const PEOPLE_SQL = "SELECT r.id, r.email, r.name, r.company, r.role, r.team_size, r.website, r.linkedin, r.x, r.github, r.ai_tools, r.use_case, r.status, r.source, " +
  "r.consent_version, r.consent_at, r.consent_terms, r.consent_keep, r.consent_updates, r.consent_call, r.created_at, r.verified_at, r.approved_at, r.declined_at, " +
  "r.account_at, r.org_at, r.cleared_at, o.name AS org_name, o.slug AS org_slug, p.product, p.line, p.stage, p.kinds, p.ais, p.places, p.first_want, p.people " +
  "FROM access_requests r INDEXED BY idx_access_requests_people LEFT JOIN org o ON o.id = r.org_id LEFT JOIN org_profile p ON p.org = r.org_id " +
  "WHERE r.status = ?1 AND (r.verified_at > ?2 OR (r.verified_at = ?2 AND r.id > ?3)) ORDER BY r.verified_at, r.id LIMIT ?4";
// one request by its id (the terminal's and the page's decision reads it first)
export const REQUEST_ROW_SQL = "SELECT id, email, name, company, status, verified_at, approved_at FROM access_requests WHERE id = ?1";
// the approval (?1 the request, ?2 when) and the decline (the same): guarded by the status, so only an open request is decided
export const APPROVE_REQUEST_SQL = "UPDATE access_requests SET status = 'approved', approved_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'open'";
export const DECLINE_REQUEST_SQL = "UPDATE access_requests SET status = 'declined', declined_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'open'";

const n = (v) => Number(v) || 0;
const arr = (v) => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
// afterOf(v) -> the keyset cursor a page link carries ("<verified_at>~<id>"), or ["", ""] for the first page
export function afterOf(v) {
  const m = /^([0-9T:.Z-]{10,30})~([A-Za-z0-9-]{1,80})$/.exec(String(v == null ? "" : v));
  return m ? [m[1], m[2]] : ["", ""];
}

export async function readOperator(env, { status = "open", after = "" } = {}) {
  const st = PEOPLE_STATUSES.includes(status) ? status : "open";
  const [at, aid] = afterOf(after);
  const [f, p] = await db(env).batch([db(env).prepare(FUNNEL_SQL).bind(FUNNEL_ROWS), db(env).prepare(PEOPLE_SQL).bind(st, at, aid, PAGE_ROWS + 1)]);
  const fr = ((f && f.results) || [])[0] || {};
  const funnel = { requested: n(fr.requested), verified: n(fr.verified), approved: n(fr.approved), signedUp: n(fr.signed_up), orgs: n(fr.orgs),
    open: n(fr.open), declined: n(fr.declined), cleared: n(fr.cleared), capped: n(fr.requested) >= FUNNEL_ROWS };
  const rows = (p && p.results) || [];
  const people = rows.slice(0, PAGE_ROWS).map((r) => ({
    id: String(r.id), email: String(r.email || ""), name: String(r.name || ""), company: String(r.company || ""), role: String(r.role || ""), teamSize: TEAM_SIZES[r.team_size] || String(r.team_size || ""),
    links: { website: r.website || null, linkedin: r.linkedin || null, x: r.x || null, github: r.github || null }, aiTools: r.ai_tools || null, useCase: r.use_case || null,
    status: String(r.status), source: String(r.source || "direct"),
    consent: { version: r.consent_version || null, at: r.consent_at || null, boxes: CONSENT_BOXES.map(([k, , words]) => ({ key: k, words, given: n(r[k]) === 1 })) },
    at: { requested: r.created_at || null, verified: r.verified_at || null, approved: r.approved_at || null, declined: r.declined_at || null, account: r.account_at || null, org: r.org_at || null, cleared: r.cleared_at || null },
    org: r.org_slug ? { name: String(r.org_name || ""), slug: String(r.org_slug) } : null,
    product: r.product ? { product: String(r.product), line: String(r.line || ""),
      answers: Object.entries(PRODUCT_CHOICES).map(([k, c]) => [c.label, (c.multi ? arr(r[k]) : r[k] ? [String(r[k])] : []).map((v) => wordsOf(k, v))]) } : null,
  }));
  // the line's places: the first row's (1 on the first page, else one statement on the line index), the next ones in order after it
  if (st === "open" && people.length) {
    const first = at ? await placeOf(env, people[0].at.verified, people[0].id) : 1;
    people.forEach((x, i) => { x.place = first ? first + i : null; });
  }
  const last = people[people.length - 1];
  const more = rows.length > PAGE_ROWS;
  return { funnel, people, status: st, statuses: PEOPLE_STATUSES, funnelRows: FUNNEL_ROWS, more, next: more && last ? `${last.at.verified}~${last.id}` : "" };
}

// openOne(env, id) -> { request } | { refused }: the request read by its id, only an open one decided
async function openOne(env, id) {
  const rid = String(id == null ? "" : id).trim();
  if (!REQUEST_ID_RE.test(rid)) return { refused: "That is not a request's id." };
  const r = await db(env).prepare(REQUEST_ROW_SQL).bind(rid).first();
  if (!r) return { refused: "No request by that id." };
  if (r.status !== "open") return { refused: `That request is ${r.status}, not in line: only a request in line is decided.` };
  return { request: { id: String(r.id), email: String(r.email), name: String(r.name), company: String(r.company), verified_at: String(r.verified_at) } };
}
export async function approveRequest(env, id, { origin }) {
  const q = await openOne(env, id);
  if (q.refused) return q;
  const at = now();
  const places = await betaCount(env, at, q.request.email);
  if (places.left < 1) return { refused: `The beta's ${places.cap} places are taken (${places.taken}). Approving past them is the operator's terminal alone (node tools/operator.mjs allow --request, its flag past the cap).` };
  const r = await db(env).prepare(APPROVE_REQUEST_SQL).bind(q.request.id, at).run();
  if (((r && r.meta && r.meta.changes) || 0) !== 1) return { refused: "That request was decided meanwhile: nothing changed." };
  const mail = await sendMail(env, mailerOf(env), { to: q.request.email, perAddress: false, build: () => inMail({ origin, name: q.request.name, company: q.request.company }) });
  return { request: q.request, mail };
}
export async function declineRequest(env, id) {
  const q = await openOne(env, id);
  if (q.refused) return q;
  const r = await db(env).prepare(DECLINE_REQUEST_SQL).bind(q.request.id, now()).run();
  if (((r && r.meta && r.meta.changes) || 0) !== 1) return { refused: "That request was decided meanwhile: nothing changed." };
  return { request: q.request };
}
// placeOf(env, verifiedAt, id) -> an open request's place in line (src/requestaccess.js REQUEST_PLACE_SQL, the status page's count)
async function placeOf(env, verifiedAt, id) {
  const row = await db(env).prepare(REQUEST_PLACE_SQL).bind(String(verifiedAt), String(id)).first();
  return Number((row && row.place) || 0) || null;
}
