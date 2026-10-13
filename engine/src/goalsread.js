// src/goalsread.js — Goals and one goal (UI-B6a, the Goals.dc.html artboard, wireframe wf-goals and wf-goal-node). Owner
// rulings: Q36AF8BA1 (Goals is a tab) · QF4CC7033 (goal movement per area) · Q48115AD1 (a goal is countered by gapRefs
// goal/<id>) · Q1A7AB8C6 (the goal-node page is its own screen, GET /goals/:ref) · Q4FF173D7 (credit traced to rulings:
// needs provenance, so person credit is an honest EMPTY here) · M-ADR-020/030 (the weighted-dimension tree) · M-ADR-028 (a
// contribution counts on exactly one workspace's tree) · Q792A0B9F (goal numbers come from filings only) · Q35D52468 (a
// node has an owner and a due-by) · QE9178667 + Q47C9CCD3 (EMPTY / UNREACHABLE).
//
// ONE seam per screen, two faces each (the readBuild pattern): readGoals(env, reader, q) is the whole Goals read; GET /goals
// answers it as JSON to a script and renders it (src/goals.js renderGoals, in-process, from the SAME call) to a browser, and
// the MCP `goals` tool and brain://goals answer the same object. readGoalNode(env, reader, ref, q) is one goal's read: GET
// /goals/:ref, the `goals` tool and brain://goal/{ref}. The feed folds into the tree read (What fed, Blocked and each row's
// counters come from the same period-bounded aggregate), so there is no separate feed door.
//
// Budget (guardrail 5), beyond the memoized auth (src/hotsql.js, EXPLAINed by tools/d1-hot-selftest.mjs section K): the
// goal tree (src/knowledge/goals.js goalTree, D1, memoized per request), then ONE parallel wave: GET /goals G1
// GOALS_AGG_SQL, G2 GOALS_COUNTERS_SQL and C1 the goals' checks counted (src/knowledge/checks.js countsFor: one statement
// over the check refs that name a goal); GET /goals/:ref G1, G3 GOAL_COUNTERS_SQL, G4 GOAL_ROWS_SQL and C2 the goal's checks
// with their latest grades (checksFor). The project's name comes from the reader's seat, else one projects row. Beside the
// wave: the open questions (decisions.js openDecisionRows, memoized per request); a row's tempo reads the request's time
// (live: no read). A project with no goal filed reads declared:false and runs no ledger statement.
//
// The project is the request's (project.js projectOf), bound in every statement, so a goal is only ever fed by its own
// project's filings (M-ADR-028). A ref that is not in THIS project's tree reads null before any ledger statement runs: the
// route answers 404 unknown_goal, the same for a missing ref and for another project's.

import { db } from "./data.js";
import { GOALS_AGG_SQL, GOALS_COUNTERS_SQL, GOAL_COUNTERS_SQL, GOAL_ROWS_SQL, PROJECT_NAME_SQL, GOALS_WAITING_SQL } from "./hotsql.js";
import { rollupCells, rollBudgets, GOALS_EMPTY, GOAL_PCT_RULE, GOALS_DEFAULT_PERIOD } from "./goals.js";
import { AREA_OF_LANE } from "./lanes.js";
import { seatsOnce } from "./core.js";
import { projectOf, projectSlug } from "./project.js";
import { openDecisionRows } from "./decisions.js";
import { tempoOf, chipOfTempo } from "./tempo.js";
import { goalCounterCall, GOAL_REF_PREFIX } from "./transmission.js";
import { goalTree } from "./knowledge/goals.js";
import { countsFor, checksFor, lightOf } from "./knowledge/checks.js";
import { staleByRef, staleChecks } from "./knowledge/stale.js";
import { reqMemo } from "./reqmemo.js";
import { now, isD1Quota, isEvalMark } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const GOALS_PERIODS = ["quarter", "month", "all"];
export const GOAL_ROWS_LIMIT = 25;          // rows shown on a node; the statement reads one more to know there is more
const EPOCH = new Date(0).toISOString();

// periodFrom(key, now) -> { key, from }: the period's first instant in UTC (quarter: the first day of the calendar
// quarter; month: the first of the month; all: the epoch). An unknown key is the default, GOALS_DEFAULT_PERIOD (all time).
export function periodFrom(key, now = Date.now()) {
  const k = GOALS_PERIODS.includes(String(key || "").toLowerCase()) ? String(key).toLowerCase() : GOALS_DEFAULT_PERIOD;
  const d = new Date(now);
  if (k === "all") return { key: k, from: EPOCH };
  const month = k === "month" ? d.getUTCMonth() : Math.floor(d.getUTCMonth() / 3) * 3;
  return { key: k, from: new Date(Date.UTC(d.getUTCFullYear(), month, 1)).toISOString() };
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const hrefOf = (id) => orgPath("/goals/") + encodeURIComponent(String(id));
// q: a URLSearchParams, the MCP arguments, or a plain { period, eval } (exported for src/gtmread.js: the same switch)
export function optsOf(q) {
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : q && q[k]);
  const includeEval = (q && q.includeEval === true) || get("eval") === true || isEvalMark(get("eval"));
  return { includeEval, period: periodFrom(get("period")) };
}
// projectNamed(env, reader) -> { key, name }: the request's project (project.js projectOf) and its name: a member's own seat
// carries it (seatsOnce, the read the scope already made), else (the owner, who may read a project without a seat) its
// projects row, one statement memoized per request. No project: { key: null, name: null }.
export async function projectNamed(env, reader) {
  const key = await projectOf(env);
  if (!key) return { key: null, name: null };
  const seats = reader && reader.id && reader.role !== "owner" ? await seatsOnce(env, reader.id) : [];
  const seat = (Array.isArray(seats) ? seats : []).find((s) => s && s.key === key);
  const name = seat && seat.name ? seat.name : await projectNameOf(env, key);
  return { key, name: name || projectSlug(key) };
}
// projectNameOf(env, key) -> the project's name from its projects row (one statement on its primary key, memoized per request),
// or null; for a reader with no seat row naming it (the owner). A quota error propagates.
export async function projectNameOf(env, key) {
  if (!key) return null;
  return reqMemo(env, "project-name:" + key, async () => {
    try { return ((await db(env).prepare(PROJECT_NAME_SQL).bind(key).first()) || {}).name || null; }
    catch (e) { if (isD1Quota(e)) throw e; return null; }
  });
}
// contextOf(env, reader) -> { declared, tree, project, down? }: the project's goal tree from D1 and the project (exported for
// src/gtmread.js and src/build.js: they read the same tree and project, never a copy of this rule). declared: at least one
// goal is filed. A failed tree read is down (the reads say unreachable); a quota error propagates.
export async function contextOf(env, reader) {
  const key = await projectOf(env);
  const [project, tree] = await Promise.all([
    projectNamed(env, reader),
    goalTree(env, key).then((t) => t.filter((n) => n && n.id), (e) => { if (isD1Quota(e)) throw e; return null; }),
  ]);
  if (!tree) return { declared: false, tree: [], project, down: true };
  return { declared: tree.length > 0, tree, project };
}
// depth of each node (the root is 0), cycle-safe
function depthsOf(tree) {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const out = new Map();
  for (const n of tree) {
    let d = 0, p = n.parent, seen = new Set([n.id]);
    while (p && byId.has(p) && !seen.has(p)) { seen.add(p); d++; p = byId.get(p).parent; }
    out.set(n.id, d);
  }
  return out;
}
// the node and every node under it (cycle-safe)
function subtreeOf(tree, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const n of tree) if (n.parent && out.has(n.parent) && !out.has(n.id)) { out.add(n.id); grew = true; } }
  return out;
}
// tree order: a parent before its children, siblings in the order the tree was filed (the Goals rows, indented by depth)
function treeOrder(tree) {
  const ids = new Set(tree.map((n) => n.id));
  const out = [], seen = new Set();
  const walk = (n) => { if (seen.has(n.id)) return; seen.add(n.id); out.push(n); for (const k of tree) if (k.parent === n.id) walk(k); };
  for (const n of tree) if (!n.parent || !ids.has(n.parent)) walk(n);
  for (const n of tree) walk(n);   // a node caught in a cycle still gets a row
  return out;
}
// fed: the landed filings naming the node or any goal under it, in the period, and how many per area (lanes.js AREA_OF_LANE)
function fedOf(agg, ids) {
  let total = 0; const byArea = {}; const byLane = new Map();
  for (const a of agg) {
    if (!a.goal_ref || !ids.has(String(a.goal_ref))) continue;
    const n = num(a.n), lane = a.lane ? String(a.lane).toLowerCase() : "";
    total += n;
    byLane.set(lane, (byLane.get(lane) || 0) + n);
    const area = AREA_OF_LANE[lane];
    if (area) byArea[area] = (byArea[area] || 0) + n;
  }
  return { total, byArea, byLane };
}
// a goal's checks: the checks whose refs name the goal's id (as brief {for: "goal/<id>"} lists them)
export const GOAL_CHECKS_MAX = 50;
// stale (sprint 3, B4): of those checks, how many were graded before a node they name changed (k_check_stale)
const checkCounts = (c, stale = 0) => (c ? { total: c.total, passed: c.passed, failed: c.failed, ungraded: c.total - c.graded, stale } : { total: null, passed: null, failed: null, ungraded: null, stale: null });
const cellsOut = (dims) => (dims || []).map((d) => ({ dim: d.dim, count: d.count, target: d.target, pct: d.pct, realized: d.realized, awaiting: d.awaiting }));
// the one-pass fix 4b: the contributions waiting for the owner (G5) fold into each cell's `awaiting` (with `waiting` saying how
// many of those wait for the owner) and the node's: waitingOf(rows) -> Map(goal ref -> Map(lane -> n))
function waitingOf(rows) {
  const by = new Map();
  for (const r of rows || []) { const g = String(r.goal_ref), l = r.lane ? String(r.lane).toLowerCase() : ""; if (!by.has(g)) by.set(g, new Map()); by.get(g).set(l, (by.get(g).get(l) || 0) + num(r.n)); }
  return by;
}
const withWaiting = (dims, w) => (dims || []).map((d) => { const n = (w && w.get(String(d.dim).toLowerCase())) || 0; return n ? { ...d, awaiting: (Number(d.awaiting) || 0) + n, waiting: n } : { ...d, waiting: 0 }; });
const waitingIn = (by, ids) => { let n = 0; for (const id of ids) for (const v of (by.get(id) || new Map()).values()) n += v; return n; };
// the goal's own fields a page shows beside its numbers: its status (done · in progress · not started) and where it was recorded
// D1b item 18 (migrate-058): and how sure it is (asOf, confidence), when filed
const goalFields = (t) => ({ status: t.status || null, ...(Array.isArray(t.source) && t.source.length ? { source: t.source } : {}),
  ...(t.confidence ? { confidence: t.confidence } : {}), ...(t.asOf ? { asOf: t.asOf } : {}) });
// F1: a goal's money, its own and with the goals below it (goals.js rollBudgets over the tree already read: no statement);
// neither key when the goal and its subtree carry none
const budgetOut = (b) => ({ ...(b && b.own ? { budget: b.own } : {}), ...(b && b.sum ? { budgetSum: b.sum } : {}) });
const unknownCells = (n) => (Array.isArray(n.dimensions) ? n.dimensions : []).map((d) => ({ dim: d, count: null, target: n.target && n.target > 0 ? n.target : 1, pct: null, realized: null, awaiting: null }));

// THE ONE GOALS ROLLUP PATH, shared by readGoals and src/gtmread.js readGtmPipeline (UI-B10a: GTM's metrics are Goals' own
// gtm cells, so a second rollup cannot exist, Q8E554970). goalsAggQuery is G1, the SAME text GET /goals runs, bound the same
// way; goalCells turns its answer into the rolled nodes in GET /goals node order (tree order), each with its cells (the
// unknown cells when the aggregate was lost). A caller runs goalsAggQuery inside its own wave and hands the rows here.
export function goalsAggQuery(env, project, includeEval, period) {
  const scoped = !!(project && project.key), pb = scoped ? [project.key] : [];
  return db(env).prepare(GOALS_AGG_SQL(scoped, includeEval)).bind(...pb, period.from).all();
}
export function goalCells(tree, agg) {
  const roll = agg ? rollupCells(tree, agg) : null;
  const byId = roll ? new Map(roll.nodes.map((n) => [n.id, n])) : new Map();
  return { roll, nodes: treeOrder(tree).map((t) => { const r = byId.get(t.id) || null; return { t, r, dims: r ? cellsOut(r.dims) : unknownCells(t), href: hrefOf(t.id) }; }) };
}

// the wave: every statement at once; a quota error propagates (the honest outage page), any other failure is UNREACHABLE
export async function wave(list) {
  const settled = await Promise.allSettled(list);
  const quota = settled.find((x) => x.status === "rejected" && isD1Quota(x.reason));
  if (quota) throw quota.reason;
  return { down: settled.some((x) => x.status === "rejected"), val: (i) => (settled[i].status === "fulfilled" ? settled[i].value : null) };
}

// ---- readGoals: the Goals read (the shape in contracts/door.declared.json `goals`) ----
export async function readGoals(env, reader, q = {}) {
  const { includeEval, period } = optsOf(q);
  const { declared, tree, project, down: treeDown } = await contextOf(env, reader);
  const scoped = !!project.key, pb = scoped ? [project.key] : [];
  const decisionsP = openDecisionRows(env).catch(() => null);   // Blocked lists open questions only
  const base = { declared, project, period, tree };
  if (!declared) {
    const dec = await decisionsP;
    return { ...base, declared: false, tree: [], nodes: [], globalId: null, globalPct: 0, aligned: 0, unaligned: 0, awaiting: 0, noFeed: [],
      whatFed: { node: null, rows: [], credit: null }, blocked: blockedDecisions(dec, includeEval), pctRule: GOAL_PCT_RULE,
      ...(treeDown ? { live: "unreachable" } : { note: GOALS_EMPTY }), ...(includeEval ? { eval: true } : {}) };
  }
  // THE WAVE: G1, G2 and C1 (the goals' checks), with the open questions (memoized) beside them
  const [w, dec] = await Promise.all([
    wave([
      goalsAggQuery(env, project, includeEval, period),
      db(env).prepare(GOALS_COUNTERS_SQL(scoped, includeEval)).bind(...pb).all(),
      countsFor(env, project.key, tree.map((n) => n.id)),
      staleByRef(env, project.key, tree.map((n) => n.id)),
      scoped ? db(env).prepare(GOALS_WAITING_SQL(includeEval)).bind(project.key).all() : Promise.resolve({ results: [] }),
    ]),
    decisionsP,
  ]);
  const aggRes = w.val(0), ctrRes = w.val(1), lights = w.val(2), staleN = w.val(3), waitRes = w.val(4);
  const waiting = waitingOf(waitRes ? waitRes.results : []);
  const agg = aggRes ? (aggRes.results || []) : null;
  const counters = new Map();
  for (const c of (ctrRes && ctrRes.results) || []) counters.set(String(c.ref), { standing: num(c.standing), ruled: num(c.ruled) });
  const { roll, nodes: rolled } = goalCells(tree, agg);
  const depth = depthsOf(tree);
  const money = rollBudgets(tree);
  const nodes = rolled.map(({ t, r, dims, href }) => {
    const fed = agg ? fedOf(agg, subtreeOf(tree, t.id)) : null;
    const c = counters.get(GOAL_REF_PREFIX + t.id);
    const waitN = waitRes ? waitingIn(waiting, subtreeOf(tree, t.id)) : null;
    return {
      id: t.id, title: t.title || t.id, parent: t.parent || null, depth: depth.get(t.id) || 0, ...goalFields(t),
      pct: r ? r.pct : null, dims: withWaiting(dims, waiting.get(t.id)), waiting: waitN, ...budgetOut(money.get(t.id)),
      fed: fed ? { total: fed.total, byArea: fed.byArea } : { total: null, byArea: {} },
      counters: ctrRes ? { standing: c ? c.standing : 0, ruled: c ? c.ruled : 0 } : { standing: null, ruled: null },
      checks: checkCounts(lights ? lights.get(t.id) : null, staleN ? staleN.get(t.id) || 0 : 0),
      href,
      weight: typeof t.weight === "number" && t.weight > 0 ? t.weight : 1, contributions: r ? r.contributions : null, awaiting: r ? r.awaiting + (waitN || 0) : null,
    };
  });
  const globalId = roll ? roll.globalId : ((tree.find((n) => !n.parent) || {}).id || null);
  // a goal whose status is done is no gap, fed or not (the one-pass fix 4a: done reads done)
  const noFeed = agg ? nodes.filter((n) => n.fed.total === 0 && n.status !== "done").map((n) => n.id) : [];
  // What fed the top goal: its lanes, and the points the root loses with each lane left out (pure, over the same aggregate)
  let whatFed = { node: globalId, rows: [], credit: null };
  if (agg && globalId) {
    const fed = fedOf(agg, subtreeOf(tree, globalId));
    const rootPct = roll.globalPct;
    const rows = [...fed.byLane].filter(([, n]) => n > 0).map(([lane, n]) => {
      const without = rollupCells(tree, agg.filter((a) => (a.lane ? String(a.lane).toLowerCase() : "") !== lane));
      const wo = (without.nodes.find((x) => x.id === globalId) || { pct: 0 }).pct;
      return { lane: lane || null, area: AREA_OF_LANE[lane] || null, n, delta: rootPct - wo };
    }).sort((a, b) => b.delta - a.delta || b.n - a.n || String(a.lane).localeCompare(String(b.lane)));
    whatFed = { node: globalId, rows, credit: null };
  }
  // D1b item 16: Blocked is a goal an OPEN question blocks, never a goal nothing has fed yet (on a fresh import that was every
  // goal, listed as gaps): "with no feed" is its own count (noFeed, the header's stat), not a block
  const blocked = blockedDecisions(dec, includeEval);
  // F1: the tree's money, the top goal's subtree sum (one currency, or mixed and kept per currency)
  const treeBudget = globalId && money.get(globalId) ? money.get(globalId).sum : null;
  return {
    ...base, nodes, ...(treeBudget ? { budget: treeBudget } : {}),
    globalId, globalPct: roll ? roll.globalPct : null, aligned: roll ? roll.aligned : null, unaligned: roll ? roll.unaligned : null,
    awaiting: roll ? roll.awaiting + waitingIn(waiting, new Set(tree.map((n) => n.id))) : null, waiting: waitRes ? waitingIn(waiting, new Set(tree.map((n) => n.id))) : null,
    noFeed, whatFed, blocked, pctRule: GOAL_PCT_RULE,
    ...(includeEval ? { eval: true } : {}),
    ...(w.down ? { live: "unreachable" } : {}),
  };
}
// the OPEN questions on goals (area "goals"), each a DECIDE row linking its question; suite rows only with ?eval=1
function blockedDecisions(dec, includeEval) {
  const rows = dec && Array.isArray(dec.rows) ? dec.rows : [];
  return rows.filter((d) => String(d.status || "").toLowerCase() === "open" && String(d.area || "").toLowerCase() === "goals" && (includeEval || !d.eval))
    .map((d) => ({ kind: "decision", qid: d.qid, question: d.question, severity: d.severity || null, href: orgPath("/question/") + encodeURIComponent(d.qid), chip: "DECIDE" }));
}

// the goal's checks with their latest grades -> { total, passed, failed, ungraded, light, rows, more, note? } (the counts cover
// the rows read: at most GOAL_CHECKS_MAX; more says there are others), or unknown counts when the read was lost
function checksOut(chk, id, staleSet = new Set()) {
  if (!chk) return { ...checkCounts(null), light: null, rows: [], more: false };
  const rows = chk.checks.map((c) => ({ id: c.id, title: c.title || c.id, severity: c.severity || null, grade: c.grade, ...(staleSet.has(c.id) ? { stale: true } : {}) }));
  const graded = rows.filter((r) => r.grade).length;
  const c = { total: rows.length, graded, passed: rows.filter((r) => r.grade && r.grade.verdict === "proven").length, failed: rows.filter((r) => r.grade && r.grade.verdict === "refused").length };
  return { ...checkCounts(c, rows.filter((r) => r.stale).length), light: lightOf(c), rows, more: !!chk.more,
    // copy: off-screen (the goal tool's note)
    ...(rows.length ? {} : { note: `No check names this goal yet: file one through preview then save_knowledge, an item {kind: "check", op: "upsert", data: {id, title, given, when, then, refs: ["${id}"]}}.` }) };
}

// ---- readGoalNode: one goal (wf-goal-node) ----
// -> { node, trail, parent, children, dims, filings:{rows, more}, counters:{standing, ruled, call, rows}, owner, due, period,
//      project, live? } or null when the ref is not in this project's tree (the route answers 404 unknown_goal).
export async function readGoalNode(env, reader, ref, q = {}) {
  const id = String(ref == null ? "" : ref).trim().slice(0, 80);
  const { includeEval, period } = optsOf(q);
  if (!id) return null;
  const tree = (await goalTree(env, await projectOf(env))).filter((n) => n && n.id);
  const t = tree.find((n) => n.id === id);
  if (!t) return null;   // after the tree read alone: a missing ref and another project's read the same
  const project = await projectNamed(env, reader);
  const scoped = !!project.key, pb = scoped ? [project.key] : [];
  const isOwner = !!(reader && reader.role === "owner");
  const rid = reader && reader.id ? String(reader.id) : "";
  const [w] = await Promise.all([
    wave([
      db(env).prepare(GOALS_AGG_SQL(scoped, includeEval)).bind(...pb, period.from).all(),
      db(env).prepare(GOAL_COUNTERS_SQL(scoped, includeEval)).bind(GOAL_REF_PREFIX + id, ...pb).all(),
      db(env).prepare(GOAL_ROWS_SQL(scoped, includeEval)).bind(id, ...pb, period.from, isOwner ? 1 : 0, rid, GOAL_ROWS_LIMIT + 1).all(),
      checksFor(env, project.key, [id], { limit: GOAL_CHECKS_MAX }),
      scoped ? db(env).prepare(GOALS_WAITING_SQL(includeEval)).bind(project.key).all() : Promise.resolve({ results: [] }),
    ]),
  ]);
  const aggRes = w.val(0), ctrRes = w.val(1), rowsRes = w.val(2), chk = w.val(3), waitRes = w.val(4);
  const waiting = waitingOf(waitRes ? waitRes.results : []);
  // sprint 3 B4: which of the goal's checks are stale (graded before a node they name changed): one probe per check listed
  const staleSet = chk && chk.checks.length ? await staleChecks(env, project.key, chk.checks.map((c) => c.id)).catch((e) => { if (isD1Quota(e)) throw e; return new Set(); }) : new Set();
  const agg = aggRes ? (aggRes.results || []) : null;
  const roll = agg ? rollupCells(tree, agg) : null;
  const byId = roll ? new Map(roll.nodes.map((n) => [n.id, n])) : new Map();
  const depth = depthsOf(tree);
  const pctOf = (x) => (byId.get(x) ? byId.get(x).pct : null);
  const lite = (n) => ({ id: n.id, title: n.title || n.id, pct: pctOf(n.id), href: hrefOf(n.id) });
  const r = byId.get(id);
  const fed = agg ? fedOf(agg, subtreeOf(tree, id)) : null;
  // the parent breadcrumb, root first
  const byTree = new Map(tree.map((n) => [n.id, n]));
  const trail = [];
  for (let p = t.parent, seen = new Set([id]); p && byTree.has(p) && !seen.has(p); p = byTree.get(p).parent) { seen.add(p); trail.unshift(lite(byTree.get(p))); }
  const publishedAt = now();   // live: a landed filing is on the canvas at once
  const raw = (rowsRes && rowsRes.results) || [];
  const rows = raw.slice(0, GOAL_ROWS_LIMIT).map((x) => {
    const tempo = tempoOf(x, { publishedAt });
    return { id: x.id, title: x.what || x.id, chip: chipOfTempo(tempo, x.decision, x.route), tempo, kind: x.kind || null, lane: x.lane || null, by: x.by_name || null,
      at: x.created_at || null, happenedAt: x.happened_at || null, decidedAt: x.decided_at || null, outcome: x.outcome ?? null, expected: x.expected ?? null, actual: x.actual ?? null, ...(x.eval ? { eval: true } : {}) };
  });
  const crow = (ctrRes && ctrRes.results) || [];
  const counters = ctrRes
    ? { standing: crow.filter((x) => x.standing).length, ruled: crow.filter((x) => x.decision != null).length, call: goalCounterCall(id),
        rows: crow.map((x) => ({ id: x.id, kind: x.kind, what: x.what || null, by: x.by_name || null, at: x.created_at || null, standing: !!x.standing, decision: x.decision || null })) }
    : { standing: null, ruled: null, call: goalCounterCall(id), rows: [] };
  const str = (v) => (v == null || v === "" ? null : String(v).slice(0, 120));
  return {
    project, period,
    node: { id, title: t.title || id, parent: t.parent || null, depth: depth.get(id) || 0, ...goalFields(t), pct: r ? r.pct : null, weight: typeof t.weight === "number" && t.weight > 0 ? t.weight : 1,
      ...budgetOut(rollBudgets(tree).get(id)),
      target: t.target ?? null, outcomeMetric: t.outcomeMetric === true,
      fed: fed ? { total: fed.total, byArea: fed.byArea } : { total: null, byArea: {} }, contributions: r ? r.contributions : null,
      awaiting: r ? r.awaiting + (waitRes ? waitingIn(waiting, subtreeOf(tree, id)) : 0) : null, waiting: waitRes ? waitingIn(waiting, subtreeOf(tree, id)) : null, href: hrefOf(id) },
    trail, parent: trail.length ? trail[trail.length - 1] : null,
    children: tree.filter((n) => n.parent === id && n.id !== id).map(lite),
    dims: withWaiting(r ? cellsOut(r.dims) : unknownCells(t), waiting.get(id)), pctRule: GOAL_PCT_RULE,
    filings: { rows, more: raw.length > GOAL_ROWS_LIMIT },
    counters,
    checks: checksOut(chk, id, staleSet),
    owner: str(t.owner), due: str(t.due ?? t.dueBy),
    ...(includeEval ? { eval: true } : {}),
    ...(w.down ? { live: "unreachable" } : {}),
  };
}
