// src/impact.js — IMPACT, after the change (sprint 3, B4; docs/plan/ARCHITECTURE.md §12, MCP.md §4): what one contribution
// (or a knowledge write's ledger row, or a set of refs an agent is about to change) touched and what that reaches, the proof
// it puts in question, the decisions that apply and the goals it moved. ONE read, three faces: the Impact view
// (/contribution/:id/impact, src/impactpage.js), the `impact` tool and its REST twin (GET /impact), all answering
// impactFor; the contribution's page, Home's "What changed" and the Map's ?impact= read the lighter impactLines.
//
// Computed on READ, never stored (no table for reach): the touched refs come from the row itself (touches, components,
// screens as screen:<n>, depends, gapRefs, goalRef; a knowledge row's touches name node:<id>, render:<screen>, check:<id>,
// goal:<id> and question:<id>), then src/reach.js readReach walks ONE hop (its two batches, its stated caps), then ONE more
// statement reads the checks that name what was touched with their latest grade (PROOF_SQL, at most PROOF_MAX), and one
// probe per check for whether it is stale now (k_check_stale). A contribution that names nothing in the model reads only
// the row. Rows read: saruspay, one screen touched: the reach's own (~400 at most) plus the proof's (<= PROOF_MAX + its
// probes); measured by tools/page-budget.mjs.
//
// Visibility (authority-relevant): the row is read through core.js transmissionOneFor (READER_SCOPE: the owner, its
// contributor, a reader seated on its project, an org with no project axis) AND the reader must hold a read scope on the
// row's project (project.js resolveProject: a seat; the owner any active project; a Partner only a seated one). Anything else is
// the same not_found as a missing id. Every node, check, goal and question listed is the project's own knowledge, which
// that scope already reads (no role-limited kind is listed: cards, card kinds and docs are never in the walk).
import { db } from "./data.js";
import { refOf, readReach, reachWords, typeWord, EMPTY_REACH, REF_MAX, REACH_SQL, dataLinks, callerArgs, callersOf } from "./reach.js";
import { transmissionOneFor, seatsOnce } from "./core.js";
import { resolveProject } from "./project.js";
import { decodeShape } from "./shapes.js";
import { staleChecks } from "./knowledge/stale.js";
import { callText } from "./checklist.js";
import { canonicalRef } from "./refs.js";
import { IMPACT_HISTORY_SQL } from "./hotsql.js";
import { isEvalMark } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const PROOF_MAX = 60;
export const LINES_MAX = 3;          // Home's "What changed": the newest contributions walked
const IN_LITE = 60, CHECKS_LITE = 120, LITE_CHUNKS = 3;
const J = (a) => JSON.stringify(a);
const IN = (n) => `(SELECT value FROM json_each(?${n}))`;
const LATEST_AT = (p, c) => `(SELECT g.graded_at FROM check_results g WHERE g.project = ${p} AND g.check_id = ${c} ORDER BY g.graded_at DESC, g.id DESC LIMIT 1)`;
const LATEST_ST = (p, c) => `(SELECT g.status FROM check_results g WHERE g.project = ${p} AND g.check_id = ${c} ORDER BY g.graded_at DESC, g.id DESC LIMIT 1)`;
// the checks naming the touched refs, each with its title and its latest grade (one row per check, id order)
export const PROOF_SQL = `SELECT c.id, c.title, ${LATEST_ST("c.project", "c.id")} AS status, ${LATEST_AT("c.project", "c.id")} AS graded_at FROM k_checks c ` +
  `WHERE c.project = ?1 AND c.id IN (SELECT r.check_id FROM k_check_refs r WHERE r.project = ?1 AND r.ref IN ${IN(2)}) ORDER BY c.id LIMIT ${PROOF_MAX + 1}`;
// the lighter walk (the page's section, Home, the Map): the touched nodes' names, their out links (one row per node), the
// links into them (capped) and the checks naming them with when each was last graded
// Sprint 3 L2 (the row budget): the touched refs are bound as REF_MAX parameters (?2 … ?31, the unused ones NULL), never read
// out of a JSON list with json_each, which D1 bills as one row read per ref in each of the four statements
const REFS = Array.from({ length: REF_MAX }, (_, i) => `?${i + 2}`).join(", ");
export const liteBinds = (project, refs) => [project, ...Array.from({ length: REF_MAX }, (_, i) => (i < refs.length ? refs[i] : null))];
export const LITE_SQL = {
  // the touched nodes with the links their own data carries (a door's screens, a screen's apis: src/reach.js dataLinks)
  nodes: `SELECT id, type, name, CASE type WHEN 'door' THEN json_extract(data, '$.screens') END AS dscreens, CASE type WHEN 'screen' THEN json_extract(data, '$.apis') END AS apis FROM k_nodes WHERE project = ?1 AND id IN (${REFS})`,
  // the doors naming a touched screen in their data (reach.js callers; only when a screen is touched)
  callers: REACH_SQL.callers,
  out: `SELECT node_id, links FROM k_node_links WHERE project = ?1 AND node_id IN (${REFS})`,
  in: `SELECT from_id, to_id FROM k_edges INDEXED BY idx_k_edges_to WHERE project = ?1 AND to_id IN (${REFS}) LIMIT ${IN_LITE + 1}`,
  checks: `SELECT r.ref, r.check_id, ${LATEST_AT("r.project", "r.check_id")} AS graded_at FROM k_check_refs r WHERE r.project = ?1 AND r.ref IN (${REFS}) LIMIT ${CHECKS_LITE + 1}`,
};

const csv = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x ?? "").trim()).filter(Boolean);
const NODE_PREFIX = /^(screen|door|api|table|entity|flow|dep|gap|lane|surface|service|architecture|evidence):/;

// refsOfRow(row) -> { refs, goals, questions, checks, filing, how } — what a ledger row touched (reach.js collectRefs'
// shape) and, per touched ref, how the record names it (the "what changed" words)
export function refsOfRow(row) {
  const r = row || {};
  const refs = new Set(), goals = new Set(), questions = new Set(), checks = new Set(), how = new Map();
  const mark = (id, w) => { if (!how.has(id)) how.set(id, w); };
  // D2b: a ref only a render touched (a picture or a wireframe): touched and reaching, but no check is put in question by it
  // (migrate-057: a new picture never stales a grade, so its reach never says "to redo")
  const pictured = new Set(), changed = new Set();
  const add = (raw, w) => {
    const x = refOf(raw);
    if (!x) return;
    if (x.form === "goal") goals.add(x.id);
    else if (x.form === "question") questions.add(x.id);
    else if (x.form === "check") checks.add(x.id);
    else if (x.form === "ref") { refs.add(x.id); mark(x.id, w); }
  };
  if (String(r.kind || "") === "knowledge") {
    for (const t of csv(r.touches)) {
      const m = /^([a-z_]+):(.+)$/.exec(t);
      if (!m) continue;
      const [, k, id] = m;
      if (k === "node") { refs.add(id); changed.add(id); mark(id, "written"); }
      else if (k === "render") { refs.add(id); pictured.add(id); mark(id, "a render added or replaced"); }
      else if (k === "check") checks.add(id);
      else if (k === "goal") goals.add(id);
      else if (k === "question") questions.add(id);
    }
  } else {
    const sh = r.shape !== undefined ? decodeShape(r.shape) : { depends: r.depends };
    for (const t of csv(r.touches)) { if (/^check:/.test(t)) checks.add(t.slice(6)); else add(t, "named in what it touches"); }
    for (const s of csv(r.screens)) add(NODE_PREFIX.test(s) ? s : `screen:${s}`, "a screen it names");
    for (const c of csv(r.components)) add(c, "a component it names");
    for (const d of Array.isArray(sh.depends) ? sh.depends : []) add(d, "what it depends on");
    for (const g of csv(r.gaprefs ?? r.gapRefs)) add(g, "a ref it addresses");
    if (r.goal_ref) goals.add(String(r.goal_ref));
    for (const id of refs) changed.add(id);
  }
  return { refs, goals, questions, checks, filing: new Map(), how, pictureOnly: new Set([...pictured].filter((id) => !changed.has(id))) };
}
// changesProof(lane, kind) -> true when the record changes what proof proves (migrate-054's rule: a code or design
// contribution, or a knowledge write); a note, an answer, a GTM post or a grade does not
export const changesProof = (row) => String((row && row.kind) || "") === "knowledge" || ["code", "design"].includes(String((row && row.lane) || "").toLowerCase());

// proofOf(rows, sinceIso, staleSet) -> { total, toRedo: [{id, title, verdict, gradedAt, stale}], regraded, ungraded, capped }:
// the checks naming what was touched, split by their latest grade against the moment of the change (sinceIso: the
// contribution's filing time; null for "before now", impact {refs})
export function proofOf(rows, sinceIso, staleSet = new Set()) {
  const list = (rows || []).slice(0, PROOF_MAX);
  const toRedo = [], regraded = [], ungraded = [];
  for (const r of list) {
    const c = { id: String(r.id), title: String(r.title || r.id), verdict: r.status ? String(r.status) : null, gradedAt: r.graded_at ? String(r.graded_at) : null, stale: staleSet.has(String(r.id)) };
    if (!c.gradedAt) ungraded.push(c);
    else if (!sinceIso || c.gradedAt < sinceIso) toRedo.push(c);
    else regraded.push(c);
  }
  return { total: list.length, toRedo, regraded, ungraded: ungraded.length, capped: (rows || []).length > PROOF_MAX };
}
// regradeCall(project, checkId) -> the exact call that regrades a check: submit_grade, which files a grade at once (sprint 19)
// (D1b item 9: the verdict is a placeholder, never "proven": a regrade says what the check does NOW)
export const regradeCall = (project, checkId) => callText({ tool: "submit_grade", args: { project: project || "<your project>", checkId, verdict: "<proven | refused | incomplete: what you observe when you run the check now>", proof: "<the command you ran and what it printed, a link, or an artifact id>" } });

// impactFor(env, project, collected, { row, nowIso }) -> the whole impact (the Impact view, the tool, GET /impact)
export async function impactFor(env, project, collected, o = {}) {
  const row = o.row || null;
  const reach = project ? await readReach(env, project, collected) : { ...EMPTY_REACH, statements: 0 };
  const T = [...collected.refs].slice(0, REF_MAX);
  let proofRows = [];
  if (project && (T.length || collected.checks.size)) {
    const po = collected.pictureOnly || new Set();
    const named = [...new Set([...T.filter((id) => !po.has(id)), ...[...collected.goals], ...[...collected.questions]])];
    proofRows = named.length ? (await db(env).prepare(PROOF_SQL).bind(project, J(named)).all()).results || [] : [];
    if (collected.checks.size) {
      const extra = (await db(env).prepare(`SELECT c.id, c.title, ${LATEST_ST("c.project", "c.id")} AS status, ${LATEST_AT("c.project", "c.id")} AS graded_at FROM k_checks c WHERE c.project = ?1 AND c.id IN ${IN(2)}`)
        .bind(project, J([...collected.checks].slice(0, PROOF_MAX))).all()).results || [];
      const have = new Set(proofRows.map((x) => String(x.id)));
      proofRows = [...proofRows, ...extra.filter((x) => !have.has(String(x.id)))];
    }
  }
  const stale = await staleChecks(env, project, proofRows.slice(0, PROOF_MAX).map((r) => String(r.id)));
  const since = row ? (changesProof(row) ? String(row.created_at || "") : null) : null;
  const proof = proofOf(proofRows, row ? (since || "\u0000") : null, stale);
  // a record that does not change what proof proves (a note) puts no grade in question
  if (row && !since) { proof.regraded = [...proof.toRedo, ...proof.regraded]; proof.toRedo = []; }
  const how = collected.how || new Map();
  const touched = { ...reach.touched, names: reach.touched.names.map((n) => ({ ...n, how: how.get(n.id) || null })) };
  const sh = row ? (row.shape !== undefined ? decodeShape(row.shape) : row) : {};
  return {
    project, id: row ? row.id : null, what: row ? row.what || null : null, lane: row ? row.lane || null : null, kind: row ? row.kind || null : null,
    at: row ? row.created_at || null : null, happenedAt: row ? row.happened_at || null : null, by: row ? row.by_name || null : null,
    changesProof: row ? !!since : true,
    touched, reached: reach.reached, unknown: reach.touched.unknown,
    proof: { ...proof, calls: proof.toRedo.map((c) => ({ checkId: c.id, call: regradeCall(project, c.id) })) },
    decisions: { asks: reach.asks, named: reach.questions },
    goals: { moved: row && row.goal_ref ? [String(row.goal_ref)] : [], named: reach.goals },
    next: sh.next && sh.next.what ? sh.next : null,
    line: lineOf({ touched: reach.touched, reached: reach.reached, toRedo: proof.toRedo.length, what: row && row.what }),
    reachLine: reachWords(reach), capped: [...(reach.capped || []), ...(proof.capped ? [`more than ${PROOF_MAX} checks name what was touched; the first ${PROOF_MAX} were read`] : [])],
    statements: (reach.statements || 0) + (proofRows.length || T.length ? 1 : 0) + (stale.size ? 1 : 0),
  };
}

// lineOf({ touched, reached, toRedo }) -> the one line: "Pricing screen changed · reaches 1 flow, 2 doors · 5 checks to redo"
export function lineOf(o) {
  const t = o.touched || {}, r = o.reached || {};
  const first = (t.names || [])[0];
  const head = first ? `${first.name} ${typeWord(first.type, 1)}${(t.total || 0) > 1 ? ` and ${t.total - 1} more` : ""} changed` : "Nothing in the model changed";
  const types = Object.entries(r.byType || {}).map(([k, n]) => `${n} ${typeWord(k, n)}`);
  const more = (r.unnamed || 0) ? [`${r.unnamed} more`] : [];
  // a reach that was not read (r.total null: Home's latest changes) is said nowhere, never "nothing more"
  const reach = r.total === null ? "" : types.length || more.length ? `reaches ${[...types, ...more].join(", ")}` : first ? "reaches nothing more" : "";
  const redo = o.toRedo ? `${o.toRedo} ${o.toRedo === 1 ? "check" : "checks"} to redo` : "";
  return [head, reach, redo].filter(Boolean).join(" · ");
}

// readImpactRow(env, person, id) -> { row, env, project } | { error } — the contribution, scoped to the reader, and the read
// scope on its project (both, or the same not_found a missing id answers)
export async function readImpactRow(env, person, id) {
  const clean = String(id || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  if (!clean) return { error: "id_required" };
  const one = await transmissionOneFor(clean, env, person);
  if (one.error) return { error: "not_found", id: clean };
  const { grade, ...row } = one;
  if (!row.project) return { row, env, project: null };
  const sc = await resolveProject(person, row.project, await seatsOnce(env, person.id), env);
  if (sc.error) return { error: "not_found", id: clean };
  return { row, env: sc.env, project: row.project };
}

// impactAnswer(env, person, a) -> the `impact` tool's and GET /impact's answer: {contribution: id} | {refs: [...]} (refs read
// on the request's project scope, which callTool / the seam already checked)
export async function impactAnswer(env, person, a = {}, scopedProject = null) {
  if (a.contribution) {
    const got = await readImpactRow(env, person, a.contribution);
    if (got.error) return { error: got.error, id: got.id, note: got.error === "id_required" ? "Send contribution: its id (T-YYYYMMDD-NNN), or refs: the ids you are about to change." : `No contribution "${got.id}" you may read.` };
    const out = await impactFor(got.env, got.project, refsOfRow(got.row), { row: got.row });
    return { ...out, url: orgPath(`/contribution/${encodeURIComponent(got.row.id)}/impact`) };
  }
  const raw = Array.isArray(a.refs) ? a.refs : typeof a.refs === "string" ? a.refs.split(",") : [];
  const list = raw.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, REF_MAX * 2);
  if (!list.length) return { error: "refs_required", note: "Send refs: the node ids you are about to change (screen:pricing, door:POST:/api/v1/x, goal/<id>, q/<qid>, check/<id>), or contribution: an id." };
  if (!scopedProject) return { error: "project_required", note: "Send project: one of your projects (`whoami` lists them)." };
  const c = { refs: new Set(), goals: new Set(), questions: new Set(), checks: new Set(), filing: new Map(), how: new Map() };
  for (const x of list) {
    const f = refOf(x);
    if (!f) continue;
    if (f.form === "goal") c.goals.add(f.id); else if (f.form === "question") c.questions.add(f.id); else if (f.form === "check") c.checks.add(f.id);
    else if (f.form === "ref") { c.refs.add(f.id); c.how.set(f.id, "you are about to change it"); }
  }
  const [out, history] = await Promise.all([impactFor(env, scopedProject, c, {}), refsHistory(env, person, scopedProject, list, isEvalMark(a.eval))]);
  return { ...out, refs: list, history, note: "Before you change these: the checks listed under proof would be in question (each was graded before now), the questions under decisions apply, what is reached is one hop out, and history lists the contributions that named them." };
}

// refsHistory(env, person, project, refs, includeEval) -> { refs, count, items, more } — the project's contributions that named
// any of the refs, newest first (D5; D1b item 13: ONE canonical ref, src/refs.js canonicalRef, so
// "screen:home" and "home" read the same, touches and goal refs indexed). A non-owner reads only what they may open
// (READER_SCOPE). One statement, at most HISTORY_MAX rows.
export const HISTORY_MAX = 50;
async function refsHistory(env, person, project, refs, includeEval) {
  const cs = refs.map(canonicalRef).filter((c) => c.ref);
  const forms = [...new Set(cs.flatMap((c) => c.forms))], goals = [...new Set(cs.map((c) => c.goal).filter(Boolean))];
  if (!forms.length) return { refs: [], count: 0, items: [], more: false };
  const scoped = !(person && person.role === "owner");
  const rows = (await db(env).prepare(IMPACT_HISTORY_SQL(scoped, includeEval))
    .bind(JSON.stringify(forms), JSON.stringify(goals), project, scoped ? String((person && person.id) || "") : null, HISTORY_MAX + 1).all()).results || [];
  const items = rows.slice(0, HISTORY_MAX).map((t) => ({ id: t.id, at: t.created_at, kind: t.kind, lane: t.lane, by: t.by_name, what: t.what, route: t.route, status: t.status,
    decision: t.decision || null, decidedAt: t.decided_at || null, decidedBy: t.decided_by_name || null, href: orgPath(`/contribution/${encodeURIComponent(t.id)}`) }));
  return { refs: cs.map((c) => c.ref), count: items.length, items, more: rows.length > HISTORY_MAX };
}

// ---- the lighter walk: several contributions at once (Home's "What changed", the page's Impact section, the Map) ----
const typeOfId = (id) => { const m = /^([a-z]+):/.exec(String(id)); return m ? (m[1] === "api" ? "door" : m[1]) : "node"; };
// impactLines(env, project, rows) -> Map(row id -> { touched: {total, names, byType}, reached: {total, byType, ids}, toRedo,
// line, notOnMap: [ids] }). ONE batch of four statements (five when a screen is touched: the doors naming it) for every row together (their touched refs unioned, capped at REF_MAX), whatever
// the number of rows (Home passes LINES_MAX).
// o.reach === false (L4, Home's "Latest changes": the row budget): what changed and the checks to redo only, no walk one hop out
// (the links out and in and the doors naming a screen, about 335 rows on sharingu): reached reads { total: null } (not read)
export async function impactLines(env, project, rows, o = {}) {
  const out = new Map();
  const walk = o.reach !== false;
  let per = (rows || []).map((r) => ({ r, c: refsOfRow(r) }));
  let all = [...new Set(per.flatMap((x) => [...x.c.refs]))].slice(0, REF_MAX);
  // L4 (one count): without the walk (the pages' lists), every row's refs are read WHOLE: the refs of all the rows in chunks of
  // REF_MAX (two primary-key statements a chunk, one batch, at most LITE_CHUNKS chunks); a row whose refs the chunks do not all
  // hold gets no line here (its Impact view reads it), never a count cut short by the cap
  let res = [], got = [];
  if (!walk) {
    // the rows, newest first, whose refs all fit the budget (a row that touches more than it is left for its Impact view)
    const u = new Set(), kept = [], budget = REF_MAX * LITE_CHUNKS;
    for (const x of per) { const add = [...x.c.refs].filter((id) => !u.has(id)); if (u.size + add.length > budget) continue; add.forEach((id) => u.add(id)); kept.push(x); }
    per = kept;
    const U = [...u], chunks = [];
    for (let i = 0; i < U.length; i += REF_MAX) chunks.push(U.slice(i, i + REF_MAX));
    all = U;
    if (project && chunks.length) res = await db(env).batch(chunks.flatMap((ch) => ["nodes", "checks"].map((k) => db(env).prepare(LITE_SQL[k]).bind(...liteBinds(project, ch)))));
    got = [res.filter((_, i) => i % 2 === 0).flatMap((x) => (x && x.results) || []), res.filter((_, i) => i % 2 === 1).flatMap((x) => (x && x.results) || [])];
  } else {
    const screens = all.filter((x) => /^screen:/.test(x));
    if (project && all.length) res = await db(env).batch([...["nodes", "out", "in", "checks"].map((k) => db(env).prepare(LITE_SQL[k]).bind(...liteBinds(project, all))),
      ...(screens.length ? [db(env).prepare(LITE_SQL.callers).bind(project, ...callerArgs(screens))] : [])]);
    got = res.map((x) => (x && x.results) || []);
  }
  const screens = walk ? all.filter((x) => /^screen:/.test(x)) : [];
  const [nodes, outs, ins, chk, callerRows] = walk ? got : [got[0], [], [], got[1], []];
  const callers = callersOf(callerRows, screens);
  const nodeOf = new Map((nodes || []).map((n) => [String(n.id), n]));
  const outOf = new Map((outs || []).map((o) => { let l = []; try { l = JSON.parse(o.links || "[]"); } catch { l = []; } return [String(o.node_id), Array.isArray(l) ? l : []]; }));
  const inOf = new Map();
  for (const e of [...(ins || []).slice(0, IN_LITE), ...(callers || []).slice(0, IN_LITE)]) { const k = String(e.to_id); if (!inOf.has(k)) inOf.set(k, []); inOf.get(k).push(String(e.from_id)); }
  for (const n of nodes || []) { const l = dataLinks(n); if (l.length) outOf.set(String(n.id), [...(outOf.get(String(n.id)) || []), ...l.map((id) => [id, "calls"])]); }
  const checksOf = new Map();
  for (const c of (chk || []).slice(0, CHECKS_LITE)) { const k = String(c.ref); if (!checksOf.has(k)) checksOf.set(k, new Map()); checksOf.get(k).set(String(c.check_id), c.graded_at ? String(c.graded_at) : null); }
  for (const { r, c } of per) {
    const T = [...c.refs].filter((id) => all.includes(id));
    const names = T.filter((id) => nodeOf.has(id)).map((id) => ({ id, type: String(nodeOf.get(id).type), name: String(nodeOf.get(id).name || id), how: c.how.get(id) || null }));
    const reached = new Set();
    for (const id of T) {
      for (const l of outOf.get(id) || []) if (Array.isArray(l) && l[0] && !c.refs.has(String(l[0]))) reached.add(String(l[0]));
      for (const f of inOf.get(id) || []) if (!c.refs.has(f)) reached.add(f);
    }
    const byType = {};
    for (const id of reached) { const t = typeOfId(id); byType[t] = (byType[t] || 0) + 1; }
    const since = changesProof(r) ? String(r.created_at || "") : "";
    const redo = new Set();
    if (since) for (const id of T) if (!c.pictureOnly.has(id)) for (const [cid, at] of checksOf.get(id) || []) if (at && at < since) redo.add(cid);
    const tByType = {};
    for (const n of names) tByType[n.type] = (tByType[n.type] || 0) + 1;
    const touched = { total: names.length, names, byType: tByType };
    const rch = walk ? { total: reached.size, byType, ids: [...reached], unnamed: 0 } : { total: null, byType: {}, ids: [], unnamed: 0 };
    // notOnMap: what the row names that was looked up and is not a node of the Map (a file path, a plain area, a deleted
    // screen); the contribution page's Touches fact and its Impact card both read it with touched (impactpage.js touchesFact)
    out.set(String(r.id), { touched, reached: rch, toRedo: redo.size, line: lineOf({ touched, reached: rch, toRedo: redo.size }), notOnMap: T.filter((id) => !nodeOf.has(id)) });
  }
  return out;
}

// ---- Home's "What changed": the newest contributions that change what proof proves (code, design), each with its line ----
// WHAT_CHANGED_SQL(includeEval) — ONE lane's newest contributions of the project: idx_transmission_lane (project,
// lower(lane), created_at) walked backwards, LIMIT LINES_MAX, R's own mind/* rows left out. Run twice in one batch (code,
// design) and merged by filing time: at most 2 x LINES_MAX rows read, never the ledger. Binds: project, lane, limit.
export const WHAT_CHANGED_SQL = (includeEval) =>
  "SELECT t.id, t.kind, t.lane, t.what, t.touches, t.screens, t.components, t.gaprefs, t.goal_ref, t.shape, t.created_at, t.happened_at, p.name AS by_name " +
  "FROM transmission t INDEXED BY idx_transmission_lane LEFT JOIN people p ON p.id = t.submitter WHERE t.project = ?1 AND lower(t.lane) = ?2 AND " +
  "(t.gaprefs IS NULL OR t.gaprefs NOT LIKE '%mind/%') AND (t.components IS NULL OR t.components NOT LIKE '%mind/%')" + (includeEval ? "" : " AND +t.eval = 0") +
  " ORDER BY t.created_at DESC LIMIT ?3";
// whatChangedFor(env, { project, includeEval }) -> { rows: [{ id, what, lane, at, happenedAt, by, line, touched, reached,
// toRedo, href }] }: two statements, then impactLines' one batch of four over the rows together
export async function whatChangedFor(env, o = {}) {
  if (!o.project) return { rows: [] };
  const [code, design] = await db(env).batch(["code", "design"].map((l) => db(env).prepare(WHAT_CHANGED_SQL(!!o.includeEval)).bind(o.project, l, LINES_MAX)));
  const list = [...((code && code.results) || []), ...((design && design.results) || [])]
    .sort((a, b) => (String(b.created_at) < String(a.created_at) ? -1 : String(b.created_at) > String(a.created_at) ? 1 : 0)).slice(0, LINES_MAX);
  const lines = list.length ? await impactLines(env, o.project, list, { reach: false }) : new Map();
  return { rows: list.map((r) => { const l = lines.get(String(r.id)) || {}; return { id: r.id, what: r.what || r.id, lane: r.lane, at: r.created_at, happenedAt: r.happened_at || null, by: r.by_name || null,
    line: l.line || "", touched: l.touched || { total: 0, names: [] }, reached: l.reached || { total: 0, byType: {} }, toRedo: l.toRedo || 0, href: orgPath(`/contribution/${encodeURIComponent(r.id)}/impact`) }; }) };
}
