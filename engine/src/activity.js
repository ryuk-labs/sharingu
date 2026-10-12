// src/activity.js — Activity across every project (sprint 12, 12.5; the owner: "track and monitor every single contribution
// across various users, on projects"). THE one read of the contribution ledger over every project a reader may read, newest
// first: who filed what, in which project and lane, and where it stands. GET /audit draws it (src/audit.js renderActivityAll:
// "All projects", ?all=1, and the owner's rollup) and `changes {org: true, list: true}` answers it through the door (the
// weekly review's read), from this one function.
//
// Who reads what (src/core.js projectsHeldBy, the rule /projects and Profile already show): the owner every ACTIVE project of
// the org; anyone else their seats on active projects — a Partner exactly its seated projects, a reader seated nowhere nothing.
// No org-level row (project NULL) and no project the reader cannot read is ever scanned. `projects` narrows inside that set
// and a key outside it is refused project_forbidden, nothing read. A knowledge write is the owner's alone (its `what` may name
// a card or a doc a member may not read: the org roll-up's own rule, src/extract.js orgChangesAnswer H1); suite rows only on
// eval: true.
//
// The row budget (engine/CLAUDE.md: a screen under 1,500 rows). The readable projects (core.js), then ACTIVITY_SCAN_SQL — per
// project the newest SCAN rows of the window on idx_transmission_project (project, created_at) in that index's own order (no
// sort: D1 counts every row a sorter passes as read again), one statement a project in ONE batch, SCAN = ACTIVITY_ROWS_MAX
// shared across the projects (at least one each, so the sum stays inside ACTIVITY_ROWS_MAX for any number of projects), every filter judged on those rows only (a filter never walks a
// project's whole history) — then ACTIVITY_ROWS_SQL, the shown rows by primary key with their filer (people by primary key).
// ACTIVITY_ROWS_MAX leaves the page's shell and the shown rows their share of the 1,500.
// The paging (pageOf): a project whose scan filled up is `capped`, known only down to its oldest scanned moment (its rows of
// that very millisecond perhaps not all read): the page holds the rows newer than the NEWEST such bound, never splits one
// millisecond's rows across two pages unless that millisecond alone outgrows the page, and `next` (a cursor: a moment, and
// whether that moment's rows are still owed) goes on from there; a capped scan that is ONE millisecond's rows (a `file` of up
// to 200 items lands in one) AT the page's bound reads that millisecond whole (ACTIVITY_MOMENT_SQL, at most
// ACTIVITY_MOMENT_MAX rows) — a project capped at an older moment shows nothing this page, so it reads nothing more (25
// projects each with a 200-item batch read 6,225 rows before the review's fix) — so paging always moves on. A millisecond
// that alone outgrows the page (a batch of more than `limit` items) is split by id: the page holds `limit` of it and `next`
// is "<moment>|<the last id shown>" (that moment's lower ids, then older moments), so a page never answers more than
// ACTIVITY_LIMIT_MAX items. Every row is reached once.
//
// Two words say where a row came from: `door`, the door it came through (transmission.via: mcp; http, the REST API; a page's
// form), and (sprint 13, 13.1; migrate-080) `client`, which AI filed it (transmission.client: claude, claude-code, chatgpt, codex,
// web, api, other — the client's own say at the door, src/client.js; a label, not proof). A row filed before migrate-080 has no
// client (null), and nothing is guessed for it. Both ride the shown rows' read: no statement of their own.
import { db, readerOrg } from "./data.js";
import { projectsHeldBy } from "./core.js";
import { keyInOrg, projectSlug } from "./project.js";
import { notMind } from "./hotsql.js";
import { LANE_KEYS } from "./lanes.js";
import { hatsOf, roleWordOf } from "./hats.js";
import { isD1Quota, isEvalMark } from "./util.js";
import { orgPath } from "./orgpath.js";
import { clientOfRow } from "./client.js";

export const ACTIVITY_ROWS_MAX = 1000, ACTIVITY_LIMIT = 50, ACTIVITY_LIMIT_MAX = 100, ACTIVITY_MOMENT_MAX = 250;
// the four states, each derived from the ledger row exactly as src/tempo.js tempoOf words it (a decision first, then the route):
// landed (filed straight through: route auto) · with the owner (route owner, undecided) · decided (approve, reject or
// needs-work) · needs more (route incomplete, undecided)
export const ACTIVITY_STATES = ["landed", "with", "decided", "needs"];
const DECIDED = "('approve','reject','needs-work')";
export const STATE_SQL = (a) => `(CASE WHEN COALESCE(${a}.decision,'') IN ${DECIDED} THEN 'decided' WHEN ${a}.route = 'incomplete' THEN 'needs' WHEN ${a}.route = 'owner' THEN 'with' WHEN ${a}.route = 'auto' THEN 'landed' ELSE '' END )`;
export function stateOf(r) {
  const d = String((r && r.decision) || "").toLowerCase(), route = String((r && r.route) || "").toLowerCase();
  if (["approve", "reject", "needs-work"].includes(d)) return "decided";
  return route === "incomplete" ? "needs" : route === "owner" ? "with" : route === "auto" ? "landed" : null;
}
// the door a row came through (transmission.via): the MCP, the REST API, or one of the web app's own forms; anything else
// (a REST caller's own word, or nothing) says nothing
const WEB_VIAS = new Set(["build", "versions", "broadcast", "map", "page"]);
export const doorOf = (via) => { const v = String(via || "").toLowerCase(); return v === "mcp" ? "mcp" : v === "http" ? "api" : WEB_VIAS.has(v) ? "web" : null; };

// ACTIVITY_SCAN_SQL(le) — ONE project's scan, a statement per project in ONE batch. Binds: ?1 the project key, ?2 the window's
// start (an ISO time; '' = all time), ?3 the cursor's moment (rows older than it; with le, that moment's rows too; '9999' on the
// first page), ?4 the scan, ?5 1 when knowledge writes count (the owner), ?6 one filer's id ('' = anyone), ?7 one lane ('' =
// every lane), ?8 one state ('' = every state), ?9 1 to include the suites' rows. Every scanned row comes back with `m` (1: it
// matches the filters), so the scan's LIMIT is the bound and the filters never walk further.
const SCAN_COLS = "SELECT t.created_at AS at, t.id, CASE WHEN (?9 = 1 OR t.eval = 0) AND " + notMind("t") + " AND (?5 = 1 OR COALESCE(t.kind,'') <> 'knowledge') " +
  "AND (?6 = '' OR t.submitter = ?6) AND (?7 = '' OR lower(t.lane) = ?7) AND (?8 = '' OR " + STATE_SQL("t") + " = ?8) THEN 1 ELSE 0 END AS m FROM transmission t ";
export const ACTIVITY_SCAN_SQL = (le) => SCAN_COLS + "WHERE t.project = ?1 AND +t.org = {org} AND t.created_at >= ?2 AND t.created_at " + (le ? "<=" : "<") + " ?3 " +
  "ORDER BY t.created_at DESC LIMIT ?4";
// ACTIVITY_MOMENT_SQL — one project's rows of ONE millisecond (?3 the moment; ?4 at most ACTIVITY_MOMENT_MAX), the same binds
export const ACTIVITY_MOMENT_SQL = SCAN_COLS + "WHERE t.project = ?1 AND +t.org = {org} AND t.created_at >= ?2 AND t.created_at = ?3 LIMIT ?4";
// ACTIVITY_ROWS_SQL — binds: ?1 the shown ids (a JSON list, at most ACTIVITY_LIMIT_MAX): each row on transmission's primary key,
// its filer on people's
export const ACTIVITY_ROWS_SQL = "SELECT t.id, t.project, t.lane, t.kind, t.what, t.route, t.decision, t.via, t.client, t.created_at, t.submitter, " +
  "p.name AS by_name, p.role AS by_role, p.title AS by_title, p.hats AS by_hats, p.avatar AS by_avatar " +
  "FROM json_each(?1) j JOIN transmission t ON t.id = j.value AND t.org = {org} LEFT JOIN people p ON p.id = t.submitter AND p.org = {org}";

const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T[0-9:.]{5,12}Z)\|(lt|le|T-[A-Za-z0-9_.:-]{1,80})$/;
const PERSON_RE = /^[A-Za-z0-9_.:@-]{1,80}$/;
// newest(a, b): the (created_at, id) order a page shows, newest first (SQLite's BINARY collation on both)
const newest = (a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : a.id > b.id ? -1 : a.id < b.id ? 1 : 0);
const lower = (v) => String(v == null ? "" : v).trim().toLowerCase();
const clamp = (v, d, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : d; };

// activityArgs(a, o) -> the parsed filters, or a refusal { error, note, … } (nothing read). a: { projects?, person?, lane?,
// state?, since?, before?, limit?, eval? }; o.sinceDays: the window when since is left out (null: all time)
export function activityArgs(a = {}, o = {}) {
  const lane = lower(a.lane), state = lower(a.state), person = a.person == null ? "" : String(a.person).trim();
  if (lane && !LANE_KEYS.includes(lane)) return { error: "bad_lane", lane: lane.slice(0, 40), allowed: LANE_KEYS, note: `lane is one of: ${LANE_KEYS.join(", ")}.` };
  if (state && !ACTIVITY_STATES.includes(state)) return { error: "bad_state", state: state.slice(0, 40), allowed: ACTIVITY_STATES, note: `state is one of: ${ACTIVITY_STATES.join(", ")} (landed: filed straight through; with: waiting for the owner; decided; needs: owes one more thing).` };
  if (person && !PERSON_RE.test(person)) return { error: "bad_person", note: "person is a person's id (each item's by.id; whoami answers yours)." };
  let since = "", sinceLabel = "all time";
  const raw = a.since == null ? "" : String(a.since).trim();
  if (raw) {
    const ms = ISO_RE.test(raw) ? Date.parse(raw) : NaN;
    if (!Number.isFinite(ms)) return { error: "bad_since", note: "since is an ISO time (2026-10-01, or 2026-10-01T09:00Z)." };
    since = new Date(ms).toISOString(); sinceLabel = `since ${since}`;
  } else if (o.sinceDays) { since = new Date(Date.now() - o.sinceDays * 864e5).toISOString(); sinceLabel = `the last ${o.sinceDays} days`; }
  let before = null;
  if (a.before != null && String(a.before).trim()) {
    const m = CURSOR_RE.exec(String(a.before).trim());
    if (!m) return { error: "bad_before", note: "before is the previous answer's next, as it came." };
    before = { at: m[1], le: m[2] === "le", id: /^T-/.test(m[2]) ? m[2] : null };   // id: that moment's ids below it are owed
  }
  const list = a.projects == null || a.projects === "" ? [] : Array.isArray(a.projects) ? a.projects : typeof a.projects === "string" ? a.projects.split(",") : null;
  if (!list || list.some((x) => typeof x !== "string")) return { error: "project_forbidden", note: "projects is a list of project keys (strings)." };
  return { lane, state, person, since, sinceLabel, before, projects: [...new Set(list.map((x) => lower(x)).filter(Boolean))].slice(0, 50),
    limit: clamp(a.limit, ACTIVITY_LIMIT, ACTIVITY_LIMIT_MAX), eval: isEvalMark(a.eval) };
}

// boundOf(scans, scan) — the page's bound: the newest of the capped projects' oldest scanned moments (null: none capped)
export function boundOf(scans, scan) {
  let bound = null;
  for (const sc of scans || []) {
    const rows = Array.isArray(sc.rows) ? sc.rows : [];
    if (!(rows.length >= scan || sc.moment) || !rows.length) continue;
    const o = rows.reduce((a, r) => (a == null || String(r.at) < a ? String(r.at) : a), null);
    if (bound == null || o > bound) bound = o;
  }
  return bound;
}

// pageOf(scans, { limit, scan, after }) — pure: the page from each project's scan ([{ project, rows: [{at, id, m}], moment?:
// true }]: moment, the project's capped scan was one millisecond and that millisecond was then read whole; after: an id
// cursor's { at, id }, that moment's rows at or above the id already shown). -> { shown: [{at, id, project}], more, next,
// capped: [project] }.
//   · a capped project (rows = scan) is known for every moment NEWER than its oldest scanned one (that moment's own rows may not
//     all be read), or, with moment, for that moment too; the page's bound is the newest of those moments, and it holds the
//     matching rows newer than the bound (or at it, when every project capped at that moment read it whole);
//   · the page never splits one moment's rows: a page cut by the limit inside a moment ends before that moment (or, when that
//     moment is the whole page, holds `limit` of it, the highest ids first, with next "<moment>|<the last id>"), and next
//     is "<moment>|lt" (strictly older);
//   · a page that ends at the bound goes on with "<bound>|le" when the bound's own rows are still owed, else "<bound>|lt".
export function pageOf(scans, { limit, scan, after = null }) {
  const hits = [], capped = [];
  let bound = null, whole = true;   // whole: every capped project at the bound's moment read that moment whole
  for (const sc of scans || []) {
    const project = String(sc.project), rows = Array.isArray(sc.rows) ? sc.rows : [];
    for (const r of rows) if (Number(r.m) === 1 && !(after && String(r.at) === after.at && String(r.id) >= after.id)) hits.push({ at: String(r.at), id: String(r.id), project });
    if (rows.length >= scan || sc.moment) {
      const o = rows.reduce((a, r) => (a == null || String(r.at) < a ? String(r.at) : a), null);
      if (o == null) continue;
      capped.push(project);
      if (bound == null || o > bound) { bound = o; whole = !!sc.moment; } else if (o === bound) whole = whole && !!sc.moment;
    }
  }
  const known = (h) => bound == null || h.at > bound || (whole && h.at === bound);
  const cands = hits.filter(known).sort(newest);
  let shown = cands.slice(0, limit), next = null;
  if (cands.length > limit) {
    const t = shown[shown.length - 1].at;
    let split = false;
    if (cands[limit].at === t) {   // the limit falls inside one moment: end before it, or, when it is the whole page, split it by id
      const before = shown.filter((h) => h.at > t);
      if (before.length) shown = before; else split = true;
    }
    const last = shown[shown.length - 1];
    next = split ? `${last.at}|${last.id}` : `${last.at}|lt`;
  } else if (bound != null) next = `${bound}|${whole ? "lt" : "le"}`;
  return { shown, more: !!next, next, capped };
}

// activityAcross(env, person, a, o) -> { projects: [{project, slug, name}], items: [...], more, next, capped?, since, filters }
// | a refusal. a: activityArgs's input; o: { sinceDays, rowsMax (at most ACTIVITY_ROWS_MAX: a smaller share for a caller that
// reads more beside it) }. items, newest first: { id, at, project (its key), slug, projectName,
// lane, kind, what, state, decision, by: { id, name, role, title, hats }, door, client (src/client.js CLIENT_FAMILIES, or null), href }.
export async function activityAcross(env, person, a = {}, o = {}) {
  const f = activityArgs(a, o);
  if (f.error) return f;
  const owner = !!person && person.role === "owner";
  const held = await projectsHeldBy(person, env);
  const names = new Map((held || []).map((p) => [String(p.key), p.name || projectSlug(p.key)]));
  let keys = [...names.keys()];
  if (f.projects.length) {
    const org = readerOrg(env);
    const want = [...new Set(f.projects.map((x) => keyInOrg(org, x)))];
    const bad = want.filter((k) => !names.has(k));
    if (bad.length) return { error: "project_forbidden", projects: bad.map(projectSlug), seats: keys.map(projectSlug),
      note: `You may read none of [${bad.map(projectSlug).join(", ")}]. projects is one or more of [${keys.map(projectSlug).join(", ")}].` };
    keys = want;
  }
  const shape = (extra) => ({ projects: keys.map((k) => ({ project: k, slug: projectSlug(k), name: names.get(k) })), since: f.sinceLabel,
    filters: { person: f.person, lane: f.lane, state: f.state, projects: f.projects }, ...extra });
  if (!keys.length) return shape({ items: [], more: false, next: null, note: "You hold no seat on an active project: there is nothing to list." });
  const rowsMax = Math.min(ACTIVITY_ROWS_MAX, Number(o.rowsMax) > 0 ? Math.floor(Number(o.rowsMax)) : ACTIVITY_ROWS_MAX);
  const scan = Math.max(1, Math.floor(rowsMax / keys.length));
  const tail = [owner ? 1 : 0, f.person, f.lane, f.state, f.eval ? 1 : 0];
  let page;
  try {
    const sql = ACTIVITY_SCAN_SQL(!!(f.before && (f.before.le || f.before.id)));
    const res = await db(env).batch(keys.map((k) => db(env).prepare(sql).bind(k, f.since, f.before ? f.before.at : "9999", scan, ...tail)));
    const scans = keys.map((k, i) => ({ project: k, rows: (res[i] && res[i].results) || [] }));
    // a capped scan that is ONE millisecond's rows AT the page's bound: read that millisecond whole, so the paging moves on (a
    // project capped at an older moment shows nothing this page: its millisecond is read when the paging reaches it)
    const bound = boundOf(scans, scan);
    const one = scans.filter((x) => x.rows.length >= scan && x.rows[0].at === x.rows[x.rows.length - 1].at && String(x.rows[0].at) === bound);
    if (one.length) {
      const got = await db(env).batch(one.map((x) => db(env).prepare(ACTIVITY_MOMENT_SQL).bind(x.project, f.since, String(x.rows[0].at), ACTIVITY_MOMENT_MAX, ...tail)));
      one.forEach((x, i) => { x.rows = (got[i] && got[i].results) || x.rows; x.moment = true; });
    }
    page = pageOf(scans, { limit: f.limit, scan, after: f.before && f.before.id ? { at: f.before.at, id: f.before.id } : null });
  } catch (e) { if (isD1Quota(e)) throw e; return { error: "unreadable", note: "The ledger could not be read just now." }; }
  let rows = [];
  if (page.shown.length) {
    try { rows = (await db(env).prepare(ACTIVITY_ROWS_SQL).bind(JSON.stringify(page.shown.map((x) => x.id))).all()).results || []; }
    catch (e) { if (isD1Quota(e)) throw e; return { error: "unreadable", note: "The ledger could not be read just now." }; }
  }
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const items = [];
  for (const s of page.shown) {
    const r = byId.get(s.id);
    if (!r || String(r.project) !== s.project) continue;   // a row the scan named and the read did not answer is not shown
    const slug = projectSlug(r.project);
    items.push({ id: r.id, at: r.created_at, project: r.project, slug, projectName: names.get(String(r.project)) || slug,
      lane: r.lane || null, kind: r.kind || null, what: r.what || null, state: stateOf(r), decision: r.decision || null,
      by: { id: r.submitter, name: r.by_name || null, role: r.by_role ? roleWordOf(r.by_role) : null, title: r.by_title || null, hats: hatsOf(r.by_hats), avatar: r.by_avatar || null },
      door: doorOf(r.via), client: clientOfRow(r.client), href: orgPath(`/contribution/${encodeURIComponent(r.id)}?page=1&project=${encodeURIComponent(slug)}`) });
  }
  return shape({ items, more: page.more, next: page.next, ...(page.capped.length ? { capped: page.capped } : {}) });
}
