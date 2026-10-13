// src/goals.js — the Goals Engine (M-ADR-020, owner /mcq 2026-09-03): R generalizes from
// a fixed 4-axis product tracker into an org-goal operating system. Two orthogonal layers:
//   the GOAL TREE (vertical rollup) — global goal -> segments -> optional individual goals,
//     one per project, filed through the MCP (preview then save_knowledge kind "goal") into D1 k_goals and
//     read by src/knowledge/goals.js goalTree. A project with no goal filed has no tree.
//   DIMENSIONS (horizontal measurement) — a contribution's LANE *is* its dimension (PRD
//     00_DESIGN/goals-engine-prd.md §5): the gate already grades by lane, so this module
//     invents no second axis vocabulary. A goal node just names, in its own `dimensions`
//     array, which lane(s) its own measurement pulls from.
// A contribution is a CELL: (goal node × dimension). Graded at the door, it moves that
// cell -> the node's own % (averaged over its own dims) -> a weighted rollup up the tree
// -> the global %. Honest zero when nothing has landed yet (R1 — no hand-typed progress).
//
// This file is PURE (no DB/env reads) — mirrors src/transmission.js's gateGrade: src/goalsread.js (UI-B6a) and core.js
// computeGoals run the ONE aggregate statement (src/hotsql.js GOALS_AGG_SQL) and hand it to rollupCells here, so the math
// is unit-testable with plain fixtures (tools/goals-derive-selftest.mjs), no live worker needed. The screens are pure too:
// renderGoals (wf-goals) and renderGoalNode (wf-goal-node) draw a read on ui.js's shared parts (the look pass, sprint 2).

import { esc, unreachableState, statusChip as stateWord, sourceRefs } from "./ui.js";
import { card, tile, tileRow, segBar, ring, bar, chip, filterRow, hrefWith, group, line, lines, lineDetail, empty, pageHead, cols, stack, facts, avatar, avatarStack, byDay, ago, happenedOf, id as idCode } from "./parts.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

// verifyGoalRef(raw, tree) — the door's join-key check for a submitted goalRef, the exact
// same discipline verifyScreens applies to a screen number (ADR-041: don't take a
// join key on faith). Three outcomes:
//   absent  — no ref given at all. Records as "unaligned" — a real, honest signal, not an
//             error. No note (R3: absence is not a failure).
//   unknown — a ref was given but it names no node in the project's CURRENT tree (a typo, a
//             stale ref from a since-restructured tree, a fabricated one). Still records —
//             R never blocks — but with a loud note, so the sender can correct it.
//   known   — resolves cleanly against the tree.
// The ref is returned VERBATIM (trimmed, capped) in every non-absent case — same
// discipline as verifyScreens: what was submitted, however wrong, is what gets stored;
// only the grading differs.
export function verifyGoalRef(raw, tree) {
  const ref = raw == null ? "" : String(raw).trim();
  if (!ref) return { ref: null, status: "absent" };
  const capped = ref.slice(0, 80);
  const ids = new Set((Array.isArray(tree) ? tree : []).map((n) => n && n.id).filter(Boolean));
  return { ref: capped, status: ids.has(capped) ? "known" : "unknown" };
}

// A node with no explicit `target` is "moving" the moment ONE graded contribution lands
// against one of its own dimensions — no invented magnitude scale. A manifest may set a
// higher target per node (e.g. "5 outreach posts moves this cell to 100%").
const DEFAULT_TARGET = 1;

// unit(r, node) — M-ADR-021 fine-tune (weight by outcome): a matched contribution's
// realized units toward its node's target.
//   finite r.outcome given  -> that number (an activity can carry a downstream RESULT,
//                               e.g. outcome:2 = "2 calls booked").
//   no outcome, normal node -> 1 (the act IS the outcome — a post, a grant filed. Same
//                               as every contribution counted pre-fine-tune: byte-safe).
//   no outcome, outcomeMetric node -> 0 (an activity row against a node whose target is a
//                               downstream result, e.g. "8 calls" — in flight, not yet real).
function unit(r, node) {
  return Number.isFinite(r.outcome) ? r.outcome : (node.outcomeMetric ? 0 : 1);
}

// The cell math, ONE copy for both faces (UI-B6a): cellsFor reads ledger rows (deriveGoals), cellOfTally reads the
// period-bounded aggregate (rollupCells, over src/hotsql.js GOALS_AGG_SQL). Both take the node's target and turn realized
// units into a clamped, rounded %.
const targetOf = (node) => (node.target && node.target > 0 ? node.target : DEFAULT_TARGET);
const pctOf = (realized, target) => Math.max(0, Math.min(100, Math.round((100 * realized) / target)));
const weightOf = (n) => (typeof n.weight === "number" && n.weight > 0 ? n.weight : 1);

function cellsFor(node, rows) {
  const dims = Array.isArray(node.dimensions) ? node.dimensions : [];
  return dims.map((d) => {
    const matches = rows.filter((r) => r.goalRef === node.id && r.lane === d);
    const target = targetOf(node);
    const realized = matches.reduce((s, r) => s + unit(r, node), 0);
    // awaiting: outcomeMetric rows matched here that carry no finite outcome yet — an
    // honest "in flight, not counted" signal (never a normal node: unit() already gives
    // those rows full credit, so there is nothing to await).
    const awaiting = node.outcomeMetric ? matches.filter((r) => !Number.isFinite(r.outcome) && !r.actual).length : 0;
    const pct = pctOf(realized, target);
    return { dim: d, count: matches.length, target, pct, realized, awaiting };
  });
}

// cellOfTally(node, d, t) — the same cell from one aggregate tally t = { n, s, noOutcome, awaiting } (the rows naming this
// node on lane d): unit() summed is the finite outcomes (s) plus 1 per row with none on a normal node (0 on an
// outcomeMetric node); awaiting counts the rows with neither an outcome nor a reported actual, on an outcomeMetric node only.
const tnum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
function cellOfTally(node, d, t) {
  const target = targetOf(node);
  const realized = tnum(t && t.s) + (node.outcomeMetric ? 0 : tnum(t && t.noOutcome));
  const awaiting = node.outcomeMetric ? tnum(t && t.awaiting) : 0;
  return { dim: d, count: tnum(t && t.n), target, pct: pctOf(realized, target), realized, awaiting };
}

// THE GOAL'S % (the one-pass fix 4, owner 2026-10-01), in the one sentence the `goals` tool says and a % carries in its title
// copy: off-screen (a title="" value and the tools' pctRule)
export const GOAL_PCT_RULE = "A goal's % is 100 when its status is done; otherwise a goal with child goals reads the weighted average of theirs, and a goal without reads the average of its lane cells, each cell the contributions of that lane that name it and landed (filed at once, or approved by the owner) in the period, against its target (1 when none is set); a plan or a note (lane leader) feeds the goal it names and moves a cell only where the goal is measured by the leader lane, and a contribution still waiting for the owner shows as awaiting until it is ruled.";
// a goal whose status is done reads done (100) even with no measured cell
const isDone = (n) => String((n && n.status) || "").toLowerCase() === "done";

// rollTree(nodes, cellsOf) -> pctFor(node): the weighted rollup, shared by deriveGoals and rollupCells. A goal whose status
// is done reads 100; else a node with children reads the weighted average of its children's rollup %; a leaf its own cells'.
function rollTree(nodes, cellsOf) {
  const childrenOf = (id) => nodes.filter((n) => n.parent === id);
  const memo = new Map();
  const visiting = new Set(); // defensive cycle guard — a well-formed tree never hits this
  const pctFor = (node) => {
    if (memo.has(node.id)) return memo.get(node.id);
    if (visiting.has(node.id)) return 0;
    visiting.add(node.id);
    const kids = childrenOf(node.id);
    let pct;
    if (isDone(node)) pct = 100;
    else if (kids.length) {
      const wSum = kids.reduce((s, k) => s + weightOf(k), 0) || 1;
      pct = Math.round(kids.reduce((s, k) => s + pctFor(k) * weightOf(k), 0) / wSum);
    } else {
      const cells = cellsOf(node);
      pct = cells.length ? Math.round(cells.reduce((s, c) => s + c.pct, 0) / cells.length) : 0;
    }
    visiting.delete(node.id);
    memo.set(node.id, pct);
    return pct;
  };
  return pctFor;
}

// deriveGoals(tree, rows) — PURE (M-ADR-020 G3): the rollup, DERIVED from the ledger,
// never hand-typed (R1). Signature:
//   tree — the flat node list: { id, title, parent (null = root), dimensions:[...],
//          weight? (default 1), target? (default 1) }.
//   rows — ALREADY-GRADED contributions [{ id?, lane, goalRef, what? }]. The caller (src/
//          core.js computeGoals) filters to eval=0 AND (route='auto' OR decision='approve')
//          AND excludes R's own mind/* namespace — the SAME landed predicate Home's leaderboard
//          (src/hotsql.js HOME_GOALS_MOVED_SQL) and the brief/orchestrator queries already use, so
//          "graded" means one thing across the whole engine.
// Rollup rule: a node with children reads its needle from the WEIGHTED AVERAGE of its
// children's own rollup % (weight defaults to 1) — the whole subtree, not just its own
// cells. A leaf (no children) reads its own cells' average. A node with children AND its
// own dimensions still rolls up from children only (avoids double-counting) — give a leaf
// dimensions, not an internal node, if it should measure directly (matches DEFAULT_GOALS:
// the root carries no dimensions of its own).
// Returns { nodes: [{ id, title, parent, weight, dims:[{dim,count,target,pct}], pct,
//   contributions, rows:[...] (capped, for the glass drill-down) }], globalId, globalPct,
//   aligned, unaligned }. Honest zero throughout — no data never reads as null/NaN.
export function deriveGoals(tree, rows) {
  const nodes = Array.isArray(tree) ? tree.filter((n) => n && n.id) : [];
  const ids = new Set(nodes.map((n) => n.id));
  const list = (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r && r.id != null ? String(r.id) : null,
    lane: r && r.lane ? String(r.lane).toLowerCase() : null,
    goalRef: r && r.goalRef ? String(r.goalRef) : null,
    what: r && r.what != null ? String(r.what) : null,
    // outcome/expected — M-ADR-021 fine-tune (optional, additive). outcome stays null
    // unless the row carries a genuine finite number (0 is a valid, kept outcome).
    outcome: r && r.outcome != null && Number.isFinite(Number(r.outcome)) ? Number(r.outcome) : null,
    expected: r && r.expected != null ? String(r.expected) : null,
    // actual — M-ADR-021 G2 the outcome-loop's closing half: the real result reported later.
    // A row that carries an `actual` has REPORTED — it is no longer "in flight/awaiting".
    actual: r && r.actual != null ? String(r.actual) : null,
  }));
  const pctFor = rollTree(nodes, (node) => cellsFor(node, list));

  const DRILL_CAP = 25;
  const out = nodes.map((n) => {
    const dims = cellsFor(n, list);
    const ownRows = list.filter((r) => r.goalRef === n.id);
    // node-level awaiting: the sum of its own dim cells' awaiting (0 whenever the node
    // isn't outcomeMetric — byte-safe). expected: up to 3 samples of what's in flight, for
    // the glass's honest "N in flight" line — pure convenience, not part of the rollup math.
    const awaiting = dims.reduce((s, d) => s + d.awaiting, 0);
    const dimIds = Array.isArray(n.dimensions) ? n.dimensions : [];
    const expected = n.outcomeMetric
      ? ownRows
          .filter((r) => dimIds.includes(r.lane) && !Number.isFinite(r.outcome) && r.expected && !r.actual)
          .map((r) => r.expected)
          .slice(0, 3)
      : [];
    return {
      id: n.id, title: n.title || n.id, parent: n.parent || null, weight: weightOf(n),
      dims, pct: pctFor(n), contributions: ownRows.length, awaiting, expected,
      rows: ownRows.slice(0, DRILL_CAP).map((r) => ({ id: r.id, lane: r.lane, what: r.what, expected: r.expected, actual: r.actual })),
    };
  });
  const root = nodes.find((n) => !n.parent) || null;
  const aligned = list.filter((r) => r.goalRef && ids.has(r.goalRef)).length;
  const unaligned = list.length - aligned;
  const totalAwaiting = out.reduce((s, n) => s + n.awaiting, 0);
  return { nodes: out, globalId: root ? root.id : null, globalPct: root ? pctFor(root) : 0, aligned, unaligned, awaiting: totalAwaiting };
}

// rollupCells(tree, agg) — PURE (UI-B6a): the SAME rollup deriveGoals makes, from the period-bounded aggregate instead of
// the rows. agg is src/hotsql.js GOALS_AGG_SQL's answer, one row per (goal_ref, lane): { goal_ref, lane, n, s,
// no_outcome, awaiting } (n rows; s the sum of their finite outcomes; no_outcome the rows with none; awaiting the rows with
// neither an outcome nor a reported actual). Each cell comes from cellOfTally (cellsFor's math, one copy) and the needles
// from rollTree (deriveGoals' rollup, one copy), so rollupCells(tree, agg(rows)) equals deriveGoals(tree, rows) on every
// number: tools/goals-derive-selftest.mjs runs the real GOALS_AGG_SQL over each fixture's rows and compares. The two
// things the aggregate cannot carry are left out: the drill rows (a node's filings are GET /goals/:ref's, and the `goals`
// tool's) and the `expected` text samples (expected: [] here).
export function rollupCells(tree, agg) {
  const nodes = Array.isArray(tree) ? tree.filter((n) => n && n.id) : [];
  const ids = new Set(nodes.map((n) => n.id));
  const by = new Map();   // goal ref -> Map(lane -> tally)
  let total = 0, aligned = 0;
  for (const a of Array.isArray(agg) ? agg : []) {
    if (!a) continue;
    const raw = a.goal_ref ?? a.goalRef;
    const ref = raw ? String(raw) : null;
    const lane = a.lane ? String(a.lane).toLowerCase() : "";
    const n = tnum(a.n);
    total += n;
    if (ref && ids.has(ref)) aligned += n;
    if (!ref) continue;
    if (!by.has(ref)) by.set(ref, new Map());
    const m = by.get(ref);
    const t = m.get(lane) || { n: 0, s: 0, noOutcome: 0, awaiting: 0 };
    t.n += n; t.s += tnum(a.s); t.noOutcome += tnum(a.no_outcome ?? a.noOutcome); t.awaiting += tnum(a.awaiting);
    m.set(lane, t);
  }
  const cellsOf = (node) => (Array.isArray(node.dimensions) ? node.dimensions : []).map((d) => cellOfTally(node, d, (by.get(node.id) || new Map()).get(d) || null));
  const pctFor = rollTree(nodes, cellsOf);
  const out = nodes.map((n) => {
    const dims = cellsOf(n);
    const own = by.get(n.id);
    return {
      id: n.id, title: n.title || n.id, parent: n.parent || null, weight: weightOf(n),
      dims, pct: pctFor(n), contributions: own ? [...own.values()].reduce((s, t) => s + t.n, 0) : 0,
      awaiting: dims.reduce((s, d) => s + d.awaiting, 0), expected: [],
    };
  });
  const root = nodes.find((n) => !n.parent) || null;
  return { nodes: out, globalId: root ? root.id : null, globalPct: root ? pctFor(root) : 0, aligned, unaligned: total - aligned, awaiting: out.reduce((s, n) => s + n.awaiting, 0) };
}

// ---- a goal's money (sprint 4, F1; migrate-064; P3's fault 1) ----
// rollBudgets(tree) — PURE: each goal's own budget (k_goals.budget, {allocated?, spent?, currency, source?}) and its subtree's
// sum (its own plus every goal under it: a goal's budget is its own money, never an envelope over its children's, so nothing
// counts twice). No statement of its own: it runs over the tree the Goals read already holds whole (goalTree, one statement on
// the primary key). One currency per tree is the expectation; a subtree in more than one reads currency "mixed", its sums kept
// per currency (byCurrency, the code order) and no grand total (two currencies never add). A figure not said adds nothing.
// -> Map(id -> { own: the budget | null, sum: { currency, allocated, spent, goals } | { currency: "mixed", byCurrency:
//    [{ currency, allocated, spent }], goals } | null }) — goals: how many goals of the subtree carry a budget; sum null when none.
export const MIXED = "mixed";
const budgetOk = (b) => b && typeof b === "object" && typeof b.currency === "string" && b.currency;
export function rollBudgets(tree) {
  const nodes = Array.isArray(tree) ? tree.filter((n) => n && n.id) : [];
  const kids = new Map();
  for (const n of nodes) if (n.parent != null && n.parent !== n.id) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
  const memo = new Map(), visiting = new Set();
  // per goal: Map(currency -> { allocated, spent }) and how many goals carry one, its own and every goal under it (cycle-safe)
  const tally = (n) => {
    if (memo.has(n.id)) return memo.get(n.id);
    if (visiting.has(n.id)) return { by: new Map(), goals: 0 };
    visiting.add(n.id);
    const by = new Map(); let goals = 0;
    const add = (cur, a, sp) => { const t = by.get(cur) || { allocated: 0, spent: 0 }; t.allocated += a; t.spent += sp; by.set(cur, t); };
    if (budgetOk(n.budget)) { add(n.budget.currency, tnum(n.budget.allocated), tnum(n.budget.spent)); goals++; }
    for (const k of kids.get(n.id) || []) { const t = tally(k); for (const [cur, v] of t.by) add(cur, v.allocated, v.spent); goals += t.goals; }
    visiting.delete(n.id);
    const out = { by, goals };
    memo.set(n.id, out);
    return out;
  };
  const out = new Map();
  for (const n of nodes) {
    const t = tally(n);
    const own = budgetOk(n.budget) ? n.budget : null;
    const cur = [...t.by.keys()].sort();
    const sum = !t.goals ? null : cur.length === 1 ? { currency: cur[0], ...t.by.get(cur[0]), goals: t.goals }
      : { currency: MIXED, byCurrency: cur.map((c) => ({ currency: c, ...t.by.get(c) })), goals: t.goals };
    out.set(n.id, { own, sum });
  }
  return out;
}
// budgetWords(b) -> "3,400 of 12,000 EUR spent" for an own budget or a sum ("12,000 EUR allocated" or "3,400 EUR spent" when only
// one is said; a mixed sum names each currency, "·" between); "" when there is none
const money = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
export function budgetWords(b) {
  if (!b || typeof b !== "object") return "";
  if (b.currency === MIXED) return (Array.isArray(b.byCurrency) ? b.byCurrency : []).map(budgetWords).join(" · ");
  const a = b.allocated != null && (b.spent == null || Number(b.allocated) > 0) ? Number(b.allocated) : null, sp = b.spent != null ? Number(b.spent) : null;
  if (a != null && sp != null) return `${money(sp)} of ${money(a)} ${b.currency} spent`;
  if (a != null) return `${money(a)} ${b.currency} allocated`;
  return sp != null ? `${money(sp)} ${b.currency} spent` : "";
}

// budgetTile(b, { label, key, goals }) -> one tile of money: spent in its currency, a ring of spent against allocated, what was
// allocated; a mixed sum says each currency (two currencies never add up). goals: say how many goals the sum covers.
function budgetTile(b, { label = "Spent", key = "budget", goals = false } = {}) {
  const many = goals && b.goals ? `${b.goals} ${b.goals === 1 ? "goal" : "goals"}` : "";
  if (b.currency === MIXED) return tile({ label, value: "Mixed", key, sub: [budgetWords(b), many].filter(Boolean).join(" · "), title: "More than one currency: each is added up on its own" });
  const alloc = b.allocated != null && Number(b.allocated) > 0 ? num(b.allocated) : null;
  return tile({ label, value: money(num(b.spent)), unit: b.currency, key, title: [budgetWords(b), b.source ? `from ${b.source}` : ""].filter(Boolean).join(", "),
    chart: alloc != null ? ring({ value: Math.min(num(b.spent), alloc), max: alloc, size: 36, center: "", label: "Spent of allocated" }) : "",
    sub: [alloc != null ? `of ${money(alloc)} allocated` : "", many].filter(Boolean).join(" · ") });
}
const ownAndBelow = (n) => !!(n && n.budgetSum && n.budgetSum.goals > (n.budget ? 1 : 0));

// ---- the screens (UI-B6a; the look pass, sprint 2): Goals (wf-goals, Goals.dc.html) and one goal (wf-goal-node, Q1A7AB8C6) ----
// Pure string builders over src/goalsread.js readGoals / readGoalNode, on ui.js's shared parts (docs/plan/LOOK.md): the tree
// IS the page (one row per goal, indented by depth, its title, a quiet bar, the % in Fredoka and one line of context), the
// period switch as quiet pills, What fed the top goal and Blocked as calm secondary sections (hairlines, no boxes). The tree
// itself is the proof the MCP feeds the page: it reads D1 live (sprint 2 dropped sprint 1's "Just filed", which on a real
// project only listed the tree's own goals again). Semantic tokens only (never a --bv-* name, never a colour literal), no em dash in anything drawn. Every region
// carries data-region in the spec's order with its own EMPTY sentence; every button carries data-button and its door
// (data-door, a row of contracts/door.json) or data-client (tools/wire-selftest.mjs audits both). Hooks a check reads:
// data-region; data-id + data-depth + data-pct on a tree row; data-metric + data-value on a count; data-qid / data-id on a
// Blocked row; data-pct on the goal; data-dim on a cell; data-id on a filing; data-check + data-verdict on a check.
export const GOALS_REGIONS = ["goal-tree", "what-fed", "blocked"];
export const GOAL_NODE_REGIONS = ["node", "cells", "filings", "children", "counters"];
// the goal's checks, drawn after the spec's five regions (a check names the goal in its refs)
export const GOAL_CHECKS_REGION = "checks";
export const goalChecksEmpty = () => "No checks";
// the goals read's note when no goal is filed (its JSON, the `goals` tool's answer: it names the call; the page says a phrase)
// copy: off-screen
export const GOALS_EMPTY = 'No goal tree yet. File one through preview then save_knowledge, items of kind "goal".';
export const TREE_DOWN = "The goal tree did not answer, so it is not drawn until it does.";
export const BLOCKED_EMPTY = "Nothing blocked";
export const LEAF_CHILDREN = "No child goals";
// the period a read opens on when none is asked (owner, MCQ 2026-10-01: all time, so work never vanishes from the tab on
// the first day of a quarter); Goals, one goal and GTM share it (src/goalsread.js periodFrom)
export const GOALS_DEFAULT_PERIOD = "all";
export const PERIOD_LABELS = { quarter: "This quarter", month: "This month", all: "All time" };
const PERIOD_PHRASE = { quarter: "this quarter", month: "this month", all: "yet" };
export const whatFedEmpty = (period) => `Nothing fed it ${PERIOD_PHRASE[period] || PERIOD_PHRASE[GOALS_DEFAULT_PERIOD]}`;
export const nodeFilingsEmpty = (period) => `No contribution ${PERIOD_PHRASE[period] || PERIOD_PHRASE[GOALS_DEFAULT_PERIOD]}`;

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const known = (v) => v != null && Number.isFinite(Number(v));
const shown = (v, suffix = "") => (known(v) ? `${Number(v)}${suffix}` : "?");   // UNREACHABLE: never a guessed zero
const clampPct = (v) => Math.max(0, Math.min(100, Number(v)));
// data-pct: the % a row draws, or ? when it is not known
const pctAttr = (v) => (known(v) ? String(clampPct(v)) : "?");



const goalHref = (id) => orgPath("/goals/") + encodeURIComponent(String(id || ""));
function periodHref(read, key, base = orgPath("/goals")) {
  const p = new URLSearchParams();
  if (key && key !== GOALS_DEFAULT_PERIOD) p.set("period", key);
  if (read && read.eval) p.set("eval", "1");
  const s = p.toString();
  return base + (s ? "?" + s : "");
}
// the pct-rule hook stays (a region the checks name); its text is the title, not a sentence on the page
const pctRuleMark = (rule) => `<i class="gl-rule" data-region="pct-rule" title="${esc(rule || GOAL_PCT_RULE)}" hidden></i>`;
// "2 passed · 1 failed · 3 ungraded" for a goal's checks (none: "")
const checksLine = (c) => (c && known(c.total) && Number(c.total) > 0
  ? `checks ${Number(c.passed) || 0} passed · ${Number(c.failed) || 0} failed · ${Number(c.ungraded) || 0} ungraded${Number(c.stale) ? ` · ${Number(c.stale)} stale` : ""}` : "");
// D2b (counts agree with rows): a cell never reads more landed than its target ("code 6 of 1") nor a done goal as "0 of 1":
// a done goal's cell says done; a cell at or past its target says it is met and how many landed
export const cellWords = (d, status) => {
  if (status === "done") return `${d.dim} done`;
  if (known(d.count) && known(d.target) && Number(d.target) > 0 && Number(d.count) >= Number(d.target))
    return `${d.dim} met, ${shown(d.count)} landed`;
  return `${d.dim} ${shown(d.count)} of ${shown(d.target)}`;
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const EXPAND = 'data-button="expand-node" data-door="GET /goals/:ref"';

// ---- Goals (sprint 3, L2: the revision, docs/plan/LOOK.md; the approved mock is tools/parts-gallery.mjs goals()) ----
// The glance (how many goals and their done · in progress · not started, the top goal's %, how many contributions feed a goal,
// how many have no feed), the ONE filter row (status, the lane that fed it, the period; each a link, the choice kept in the
// address), then the tree: one group per branch under the top goal (open while it is under way, folded with a Done chip
// once it is done), each goal one line (its ring, its title, its bar) that opens in place to what measures it, what fed it,
// its checks and counters. Same read (readGoals), the % rule in the %'s title. Hooks a check reads: data-region (goal-tree ·
// what-fed · blocked · pct-rule, and metrics on the strip), data-id + data-depth + data-pct + data-status on a goal's row,
// data-metric + data-value on a tile (goals · top-goal · feeding · no-feed), data-qid on a Blocked row, data-button + its door.
export const GOAL_STATUS_WORD = { done: "Done", progress: "In progress", todo: "Not started", unfed: "No feed" };
// goalState(n) -> done · progress · todo: ONE definition, for the tile's bar, the filter's counts, each row's chip and the goal
// page (L4): the status the owner DECLARED when one is filed (done · in progress · not started), else derived from the
// percentage (100% done, any % in progress, none not started). So the "In progress" filter lists exactly the rows whose chip
// reads In progress: a goal declared in progress that reads 100% is in it, one declared not started at 14% is not.
const DECLARED = { done: "done", "in progress": "progress", "not started": "todo" };
export function goalState(n) {
  if (!n) return "todo";
  const st = String(n.status || "").toLowerCase();
  if (DECLARED[st]) return DECLARED[st];
  if (known(n.pct) && Number(n.pct) >= 100) return "done";
  if (known(n.pct) && Number(n.pct) > 0) return "progress";
  return "todo";
}
const GL_CSS = `<style>
.gl{display:block}
.gl-n{min-width:40px;text-align:right;color:var(--text-muted)}
.gl-go{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:5px;color:var(--text-muted)}
.gl-go:hover{background:var(--hover);color:var(--text)}
.gl .p-group-body .p-li[data-indent="1"]>.p-x>.p-line{padding-left:56px}
.gl .p-group-body .p-li[data-indent="2"]>.p-x>.p-line{padding-left:76px}
.gl .p-group-body .p-li[data-indent="3"]>.p-x>.p-line{padding-left:96px}
@media (max-width:600px){.gl .p-group-body .p-li[data-indent]>.p-x>.p-line{padding-left:16px}}
</style>`;
// the group row's way to the goal's own page: an arrow, never the word "Open" beside a Done chip (it read as a status)
const GO_ICON = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 9 9 3M4.5 3H9v4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LANE_WORD = { build: "Build", plans: "Plans", gtm: "GTM" };
const pctWord = (v) => (known(v) ? `${clampPct(v)}%` : "?");
// renderGoals(read, { brand, params }) -> the Goals content (the route wraps it in shell()). Pure. params: the address's own
// choices (status, lane, period, eval), a filter over the SAME read (no statement of its own).
export function renderGoals(r, opts = {}) {
  const read = r || {};
  const down = read.live === "unreachable";
  const period = (read.period && read.period.key) || GOALS_DEFAULT_PERIOD;
  const nodes = Array.isArray(read.nodes) ? read.nodes : [];
  const declared = read.declared !== false && nodes.length > 0;
  const get = (k) => { const p = opts.params; return p && typeof p.get === "function" ? p.get(k) : p && p[k]; };
  const STATUS = ["progress", "done", "todo", "unfed"], LANES = ["build", "plans", "gtm"];
  const fStatus = STATUS.includes(String(get("status") || "")) ? String(get("status")) : null;
  const fLane = LANES.includes(String(get("lane") || "")) ? String(get("lane")) : null;
  const params = { ...(period !== GOALS_DEFAULT_PERIOD ? { period } : {}), ...(fStatus ? { status: fStatus } : {}), ...(fLane ? { lane: fLane } : {}), ...(read.eval ? { eval: "1" } : {}) };
  const H = (k, v) => hrefWith(orgPath("/goals"), params, k, v);
  const head = pageHead({ title: "Goals" });
  const pctRule = pctRuleMark(read.pctRule);
  if (!declared) {
    const body = down ? empty(TREE_DOWN) : empty("No goals yet", { action: { href: orgPath("/missing"), label: "What is missing" } });
    return GL_CSS + `<section class="gl" data-screen="goals">${head}${stack(card({ label: "Goals", flush: true, region: "goal-tree", body: body + pctRule }),
      card({ label: "What fed the top goal", flush: true, region: "what-fed", body: empty("Nothing fed yet") }),
      card({ label: "Blocked", flush: true, region: "blocked", body: blockedBody(read) }))}</section>`;
  }
  const noFeed = new Set(Array.isArray(read.noFeed) ? read.noFeed : []);
  const stateOf = (n) => goalState(n);
  const counts = { done: 0, progress: 0, todo: 0, unfed: noFeed.size };
  for (const n of nodes) counts[stateOf(n)]++;
  const laneOf = (n, l) => num(n.fed && n.fed.byArea && n.fed.byArea[l]);
  const laneCounts = Object.fromEntries(LANES.map((l) => [l, nodes.filter((n) => laneOf(n, l) > 0).length]));
  const matches = (n) => (!fStatus || (fStatus === "unfed" ? noFeed.has(n.id) : stateOf(n) === fStatus)) && (!fLane || laneOf(n, fLane) > 0);
  const top = nodes.find((n) => n.id === read.globalId) || nodes.find((n) => !n.parent) || null;

  // ---- the glance ----
  const metrics = tileRow([
    tile({ label: "Goals", value: down ? null : nodes.length, count: true, key: "goals",
      chart: segBar({ legend: false, label: "Goals", segments: [{ label: "done", value: counts.done, tone: "done" }, { label: "in progress", value: counts.progress, tone: "progress" }, { label: "not started", value: counts.todo, tone: "todo" }] }),
      sub: [counts.done ? `${counts.done} done` : "", counts.progress ? `${counts.progress} in progress` : "", !counts.done && !counts.progress ? "none started" : ""].filter(Boolean).join(" · ") }),
    tile({ label: "Top goal", value: top && known(top.pct) ? clampPct(top.pct) : null, unit: "%", key: "top-goal", title: GOAL_PCT_RULE, href: top ? (top.href || goalHref(top.id)) : "",
      chart: top && known(top.pct) ? ring({ value: clampPct(top.pct), max: 100, size: 36, center: "", label: "The top goal" }) : "" }),
    tile({ label: "Feeding", value: down ? null : num(read.aligned), count: true, key: "feeding", sub: PERIOD_LABELS[period] ? PERIOD_LABELS[period].toLowerCase() : "", title: "Contributions that name a goal and landed" }),
    tile({ label: "No feed", value: down ? null : noFeed.size, tone: noFeed.size ? "warn" : "", count: true, key: "no-feed", href: noFeed.size ? H("status", "unfed") : "" }),
    // F1: the tree's money, only when a goal carries a budget (spent of allocated; a tree in more than one currency says each)
    read.budget ? budgetTile(read.budget, { goals: true }) : "",
  ], { region: "metrics", label: "How it is going" });

  // ---- the filter row ----
  const PERIOD_WHAT = 'data-button="period" data-client="switches the period of the tree read: this quarter, this month or all time (?period= on GET /goals)"';
  const filters = filterRow({ clear: hrefWith(orgPath("/goals"), read.eval ? { eval: "1" } : {}), label: "Filter the goals", groups: [
    { key: "status", label: "Status", items: [{ label: "All", count: nodes.length, href: H("status", ""), current: !fStatus, all: true },
      ...["progress", "done", "todo", "unfed"].filter((k) => k !== "unfed" || fStatus === "unfed").map((k) => ({ label: GOAL_STATUS_WORD[k], count: counts[k], href: H("status", fStatus === k ? "" : k), current: fStatus === k }))] },
    { key: "lane", label: "Lane", items: LANES.map((l) => ({ label: LANE_WORD[l] || l, count: laneCounts[l], href: H("lane", fLane === l ? "" : l), current: fLane === l, title: `Goals the ${l} lane fed` })) },
    { key: "period", label: "Time", items: Object.keys(PERIOD_LABELS).map((k) => ({ label: k === "all" ? "All time" : k === "quarter" ? "Quarter" : "Month", href: H("period", k === GOALS_DEFAULT_PERIOD ? "" : k), current: k === period, all: k === GOALS_DEFAULT_PERIOD, attrs: PERIOD_WHAT })) },
  ] });

  // ---- the tree: a group per branch under the top goal; a goal's line opens in place ----
  const byParent = new Map();
  for (const n of nodes) { const k = n.parent || ""; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(n); }
  const under = (id) => { const out = []; const walk = (x) => { for (const k of byParent.get(x) || []) { out.push(k); walk(k.id); } }; walk(id); return out; };
  const roots = nodes.filter((n) => !n.parent || !nodes.some((x) => x.id === n.parent));
  // the top of the tree: the top goal and, while it has exactly one child, that child too (one line each); the branches are the
  // first level that splits
  const chain = [];
  let branches = roots;
  if (roots.length === 1) {
    let at = roots[0];
    chain.push(at);
    while ((byParent.get(at.id) || []).length === 1) { at = byParent.get(at.id)[0]; chain.push(at); }
    branches = byParent.get(at.id) || [];
  }
  // a branch that holds most of the tree is opened up: its own line joins the top and its children become branches (so a
  // tree with one big branch still reads as a few groups, the settled ones folded)
  const sizeOf = (b) => 1 + under(b.id).length;
  for (let guard = 0; guard < 6 && branches.length; guard++) {
    const big = branches.find((b) => sizeOf(b) > nodes.length / 2 && (byParent.get(b.id) || []).length > 1);
    if (!big) break;
    chain.push(big);
    branches = branches.flatMap((b) => (b === big ? byParent.get(b.id) || [] : [b]));
  }
  const goalLine = (n, base = null) => {
    const st = stateOf(n), depth = Math.max(0, Math.min(6, Number(n.depth) || 0));
    const indent = base == null ? 0 : Math.max(0, Math.min(3, depth - base));
    const fedAreas = Object.entries((n.fed && n.fed.byArea) || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${v}`).join(" · ");
    const ck = n.checks || {};
    const checks = known(ck.total) && Number(ck.total) > 0 ? [Number(ck.passed) ? chip("Passed", { tone: "ok", count: ck.passed }) : "", Number(ck.failed) ? chip("Failed", { tone: "bad", count: ck.failed }) : "",
      Number(ck.ungraded) ? chip("Not graded", { count: ck.ungraded }) : "", Number(ck.stale) ? chip("Stale", { tone: "warn", count: ck.stale }) : ""].join("") : "";
    const standing = n.counters && Number(n.counters.standing) ? Number(n.counters.standing) : 0;
    const facts = [["Id", idCode(n.id)], ["Status", esc(GOAL_STATUS_WORD[st])],
      Array.isArray(n.dims) && n.dims.length ? ["Measured by", esc(n.dims.map((d) => (st === "todo" && !Number(n.waiting) ? d.dim : cellWords(d, n.status))).join(" · "))] : ["Measured by", "the goals below"],
      // (a goal nothing fed shows no "0": it reads Not started)
      !(n.fed && known(n.fed.total)) ? ["Fed by", "?"] : Number(n.fed.total) ? ["Fed by", esc(`${n.fed.total}${fedAreas ? ` · ${fedAreas}` : ""}`)] : null,
      Number(n.waiting) ? ["Waiting", esc(n.waiting)] : null,
      checks ? ["Checks", checks] : null,
      standing ? ["Counters", `<a class="u-link" href="${esc((n.href || goalHref(n.id)) + "#counters")}" data-button="counters" data-door="GET /goals" data-client="the counters standing on this goal, read on its page">${esc(standing)}</a>`] : null,
      n.confidence ? ["Confidence", esc(n.confidence)] : null,
      n.budgetSum ? [ownAndBelow(n) ? "Budget, with goals below" : "Budget", `<span data-budget="${esc(n.budgetSum.currency)}">${esc(budgetWords(n.budgetSum))}</span>`] : null];
    const meta = st === "done" ? `${chip("Done", { tone: "ok" })}${bar({ value: 1, width: 96, show: "", label: "done" })}<span class="gl-n">100%</span>`
      : st === "todo" ? chip("Not started", { title: noFeed.has(n.id) ? "Nothing fed it in the period" : "" })
      : `${bar({ value: clampPct(n.pct), max: 100, width: 96, show: "", label: n.title })}<span class="gl-n" data-pct="${pctAttr(n.pct)}" title="${esc(GOAL_PCT_RULE)}">${esc(pctWord(n.pct))}</span>`;
    return line({ attrs: `data-id="${esc(n.id)}" data-depth="${depth}" data-pct="${pctAttr(n.pct)}" data-state="${st}"${n.status ? ` data-status="${esc(n.status)}"` : ""}${n.confidence ? ` data-confidence="${esc(n.confidence)}"` : ""}${indent ? ` data-indent="${indent}"` : ""}`,
      lead: ring({ value: st === "done" ? 100 : known(n.pct) ? clampPct(n.pct) : 0, max: 100, size: 20, label: "done", tone: st === "done" ? "ok" : "" }),
      title: noDash(n.title || n.id), href: n.href || goalHref(n.id), linkAttrs: EXPAND, meta,
      detail: lineDetail({ facts, actions: `<a class="u-btn small" href="${esc(n.href || goalHref(n.id))}" ${EXPAND}>Open</a>` }) });
  };
  let shown = 0;
  // a branch is a group: its head is the branch goal itself (its ring, its title, its bar; a Done chip once done, then folded),
  // its body the goals under it; a branch with nothing under it is one line
  const groups = branches.map((b, i) => {
    const below = under(b.id).filter(matches), self = matches(b);
    if (!below.length && !self) return "";
    shown += below.length + (self ? 1 : 0);
    // a branch with nothing under it, or (filtered) nothing under it that matches, is its own one line: never a group of 0
    if (!under(b.id).length || !below.length) return lines([goalLine(b)]);
    const st = stateOf(b);
    // D6a: a stage whose goals are all done folds too (its own % may lag them), unless a filter asked for them
    const allDone = below.every((x) => stateOf(x) === "done");
    return group({ title: noDash(b.title || b.id), count: below.length, open: st !== "done" && (!allDone || !!fStatus || !!fLane) && (i < 6 || !!fStatus || !!fLane),
      attrs: `data-id="${esc(b.id)}" data-depth="${esc(b.depth || 0)}" data-pct="${pctAttr(b.pct)}" data-state="${st}"${self ? "" : ' data-context="1"'}${b.status ? ` data-status="${esc(b.status)}"` : ""}${b.confidence ? ` data-confidence="${esc(b.confidence)}"` : ""}`,
      lead: ring({ value: st === "done" ? 100 : known(b.pct) ? clampPct(b.pct) : 0, max: 100, size: 20, label: "done", tone: st === "done" ? "ok" : "" }),
      summary: `${st === "done" ? chip("Done", { tone: "ok" }) : st === "todo" ? chip("Not started") : ""}${st === "todo" ? "" : bar({ value: st === "done" ? 100 : known(b.pct) ? clampPct(b.pct) : 0, max: 100, label: b.title })}<a class="u-link gl-go" href="${esc(b.href || goalHref(b.id))}" ${EXPAND} title="Open the goal" aria-label="Open the goal ${esc(noDash(b.title || b.id))}">${GO_ICON}</a>`,
      body: below.length ? lines(below.map((x) => goalLine(x, (Number(b.depth) || 0) + 1))) : empty("Nothing under it matches") });
  }).join("");
  // the top of the tree (the top goal and its only child, …), when it matches the filter: one line each, heading the groups
  const topRows = chain.filter(matches);
  const topLine = topRows.length ? lines(topRows.map((x) => goalLine(x))) : "";
  shown += topRows.length;
  const tree = card({ label: "Goals", count: shown, flush: true, region: "goal-tree", attrs: 'data-reveal="2"',
    body: (topLine + groups || empty("Nothing matches", { action: { href: hrefWith(orgPath("/goals"), read.eval ? { eval: "1" } : {}), label: "All goals" } })) + pctRule });

  // ---- the side: what fed the top goal, what is blocked ----
  const wf = read.whatFed || {};
  const wfRows = Array.isArray(wf.rows) ? wf.rows : [];
  const wfMax = Math.max(1, ...wfRows.map((x) => num(x.n)));
  const fed = card({ label: "What fed the top goal", count: wfRows.reduce((a, x) => a + num(x.n), 0) || "", flush: true, region: "what-fed", attrs: 'data-reveal="3"',
    body: down ? empty("The ledger did not answer") : wfRows.length ? lines(wfRows.map((x) => line({ attrs: `data-lane="${esc(x.lane || "")}"`, title: x.lane || "no lane",
      meta: `${bar({ value: num(x.n), max: wfMax, show: "", width: 96, label: `${x.lane}: contributions` })}<span class="gl-n" title="contributions">${esc(num(x.n))}</span><span class="gl-n" title="points the top goal would lose without this lane">${esc(`${Number(x.delta) > 0 ? "+" : ""}${Number(x.delta) || 0}`)}</span>` })), { compact: true })
      : empty("Nothing fed it yet") });
  const blocked = card({ label: "Blocked", count: (read.blocked || []).length || "", flush: true, region: "blocked", attrs: 'data-reveal="3"', body: blockedBody(read) });
  const banner = down ? unreachableState({ what: "Goals could not be read from the ledger, so the numbers show ? until it answers." }) : "";
  return GL_CSS + `<section class="gl" data-screen="goals">${banner}${head}${stack(metrics, filters, cols(tree, stack(fed, blocked)))}</section>`;
}
// Blocked: the open questions on goals, each a line that opens its question; see-gap-on-map (Q0E486A34) when there is one
function blockedBody(read) {
  const bl = Array.isArray(read.blocked) ? read.blocked : [];
  if (!bl.length) return empty("Nothing blocked");
  // D1b item 16: Blocked holds open questions; a goal with no feed is the glance's count, so the Map opens the gap walk
  const firstNoFeed = bl.find((b) => b.kind !== "decision" && b.id);
  const map = `<a class="u-btn small ghost" href="${esc(firstNoFeed ? orgPath("/map?node=") + encodeURIComponent("goal/" + firstNoFeed.id) : orgPath("/map?gap=1"))}" data-button="see-gap-on-map" data-door="GET /map/node"${firstNoFeed ? ` data-ref="goal/${esc(firstNoFeed.id)}"` : ""}>Map</a>`;
  return lines(bl.map((b, i) => line({ attrs: b.kind === "decision" ? `data-qid="${esc(b.qid)}"` : `data-id="${esc(b.id)}"`, lead: stateWord("DECIDE", "Decide"),
    title: noDash(b.question || b.title || b.qid || b.id), href: b.href || (b.qid ? orgPath(`/question/${encodeURIComponent(b.qid)}`) : goalHref(b.id)),
    sub: b.severity ? esc(b.severity) : "", action: i === 0 ? map : "" })), { compact: true });
}

// a check's grade as its chip (the light a check carries): passed ok · failed bad · incomplete warn · none quiet
const VERDICT = { proven: ["Passed", "ok"], refused: ["Failed", "bad"], incomplete: ["Incomplete", "warn"] };
const verdictChip = (g) => { const [w, t] = (g && VERDICT[g.verdict]) || ["Ungraded", "quiet"]; return chip(w, { tone: t }); };
const NODE_CSS = `<style>
.gl .gl-pctv{font:700 15px/1 var(--sans);font-variant-numeric:tabular-nums}
.gl .p-fact dd .p-bar{width:96px}
.gl .gl-ckseg{display:block;width:120px}
</style>`;

// renderGoalNode(read, { brand, questions, nowMs }) -> one goal's page (sprint 3, L3: the revision, docs/plan/LOOK.md): the head
// (where it sits, the goal), the facts (its % and bar, status, owner, due, what fed it, the counters standing, its source), the
// period (one filter row), its lane cells as tiles ("code · Done", "leader · 3 landed"), the contributions that name it folded by
// day; beside them the child goals, the open questions on it, the counters standing and its checks with their light. No sentence
// of the product's own (the counter call box is gone: it only printed a call; What is missing carries the calls). Hooks a check
// reads: the regions node · cells · filings · children · counters · checks (in that order), data-pct and data-status on the
// node, data-dim on a cell, data-id + one data-chip + open-row on a contribution, data-id + data-pct + expand-node on a child,
// data-check + data-verdict on a check, the counters button (#counters), the pct-rule hook. Pure.
export function renderGoalNode(r, opts = {}) {
  const read = r || {};
  const n = read.node || {};
  const down = read.live === "unreachable";
  const period = (read.period && read.period.key) || GOALS_DEFAULT_PERIOD;
  const nowMs = opts.nowMs || Date.now();
  const self = n.href || goalHref(n.id);
  const done = String(n.status || "").toLowerCase() === "done";
  const head = pageHead({ title: noDash(n.title || n.id), crumbs: [{ label: "Goals", href: orgPath("/goals") },
    ...(Array.isArray(read.trail) ? read.trail : []).map((t) => ({ label: noDash(t.title || t.id), href: t.href || goalHref(t.id), attrs: EXPAND })), { label: noDash(n.title || n.id || "") }] });   // L4: the last crumb names the goal, never its raw id
  // ---- the facts (region node): the %, its bar, the status, who owns it, when it is due, what fed it, the counters ----
  const c = read.counters || {};
  const standing = known(c.standing) ? Number(c.standing) : null;
  const fed = n.fed || {};
  const fedAreas = Object.entries(fed.byArea || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${v}`).join(" · ");
  const pctFact = `<b class="gl-pctv" data-pct="${pctAttr(n.pct)}">${esc(pctWord(n.pct))}</b>${known(n.pct) ? bar({ value: clampPct(n.pct), max: 100, show: "", label: "Done" }) : ""}`;
  const src = sourceRefs(n.source);
  const nodeFacts = facts([
    { label: "Done", html: pctFact, title: read.pctRule || GOAL_PCT_RULE },
    { label: "Status", html: `<span data-status="${esc(n.status || "")}">${chip(GOAL_STATUS_WORD[goalState(n)], { tone: goalState(n) === "done" ? "ok" : "quiet" })}</span>` },
    { label: "Owner", html: read.owner ? `${avatar({ name: noDash(read.owner), size: 20 })}${txt(read.owner)}` : "–" },
    { label: "Due", value: read.due ? noDash(read.due) : "–" },
    // L4: this goal and every goal under it (the Contributions card below lists the ones that name THIS goal)
    { label: "Fed", value: known(fed.total) ? `${num(fed.total)}${Number(n.waiting) ? ` · ${num(n.waiting)} waiting` : ""}` : "?", title: `Filings on this goal and every goal under it${fedAreas ? `: ${fedAreas}` : ""}` },
    { label: "Counters", html: `<a class="u-link" href="#counters" data-button="counters" data-door="GET /goals/:ref" data-client="jumps to the counters standing on this goal">${esc(shown(standing))}</a>` },
    src ? { label: "Source", html: `<span data-region="source">${src}</span>` } : null,
  ], { region: "node" }).replace('<dl class="p-card p-facts"', `<dl class="p-card p-facts"${n.status ? ` data-status="${esc(n.status)}"` : ""}`) + pctRuleMark(read.pctRule);
  // ---- the period: the one filter row (a link each; the choice kept in the address) ----
  const periodFilter = filterRow({ label: "Period", groups: [{ key: "period", label: "Period", items: Object.keys(PERIOD_LABELS).map((k) => ({ label: PERIOD_LABELS[k], href: periodHref(read, k, self), current: k === period,
    attrs: 'data-button="period" data-client="switches the period of the goal read (?period= on GET /goals/:ref)"' })) }] });
  // ---- the cells: one tile per lane that measures it ----
  const dims = Array.isArray(read.dims) ? read.dims : [];
  const cellTile = (d) => {
    const met = known(d.count) && known(d.target) && Number(d.target) > 0 && Number(d.count) >= Number(d.target);
    const value = done ? "Done" : met ? shown(d.count) : shown(d.count);
    const unit = done ? "" : met ? "landed" : `of ${shown(d.target)}`;
    const wait = Number(d.waiting) || 0, aw = Math.max(0, (Number(d.awaiting) || 0) - wait);
    return tile({ label: d.dim, value, unit, key: `cell-${d.dim}`, attrs: `data-dim="${esc(d.dim)}"`, tone: done || met ? "ok" : "",
      sub: [wait ? `${wait} waiting` : "", aw ? `${aw} awaiting` : ""].filter(Boolean).join(" · "),
      chart: ring({ value: done ? 1 : known(d.count) ? Math.min(Number(d.count), Number(d.target) || 1) : 0, max: done ? 1 : Number(d.target) || 1, size: 32, center: "", label: d.dim }),
      title: cellWords(d, n.status) });
  };
  const kids = Array.isArray(read.children) ? read.children : [];
  // F1: its money beside its measure: its own budget, and the sum with the goals below it when they carry some too
  const money_ = [n.budget ? budgetTile(n.budget, { label: "Budget spent", key: "budget" }) : "",
    ownAndBelow(n) ? budgetTile(n.budgetSum, { label: n.budget ? "With goals below" : "Budget spent, goals below", key: "budget-sum", goals: true }) : ""];
  const cells = dims.length ? tileRow([...dims.map(cellTile), ...money_], { region: "cells", label: "Lane cells" })
    : tileRow([tile({ label: "Measured by", value: kids.length, unit: kids.length === 1 ? "child goal" : "child goals", key: "children" }), ...money_], { region: "cells", label: "Lane cells" });
  // ---- the contributions that name it, folded by day (the newest day open) ----
  const f = read.filings || {};
  const frows = Array.isArray(f.rows) ? f.rows : [];
  const fLine = (x) => line({ attrs: `data-id="${esc(x.id)}"`, lead: avatar({ name: x.by || "someone", size: 24 }), title: noDash(x.title || x.id), href: orgPath(`/contribution/${encodeURIComponent(x.id)}`),
    linkAttrs: 'data-button="open-row" data-door="GET /contribution/:id"', sub: x.lane ? esc(x.lane) : "",
    meta: `${stateWord(x.chip, x.chip === "LANDED" ? "Landed" : x.tempo === "on the canvas" ? "On the Map" : x.tempo ? x.tempo.charAt(0).toUpperCase() + x.tempo.slice(1) : null)}<span>${esc(ago(happenedOf(x), nowMs))}</span>` });
  // by the day the work HAPPENED (L4, parts.js happenedOf), the newest work first inside a day
  const hMs = (x) => Date.parse(String(happenedOf(x) || "")) || 0;
  const fBody = frows.length ? byDay(frows.slice().sort((a, b) => hMs(b) - hMs(a)), happenedOf, nowMs).map(([d, xs], i) => group({ title: d, count: xs.length, open: i === 0, summary: avatarStack([...new Set(xs.map((x) => x.by).filter(Boolean))].map((name) => ({ name })), { size: 20 }), body: lines(xs.map(fLine)) })).join("")
    : down ? empty("Not read") : empty(nodeFilingsEmpty(period));
  const filings = card({ label: "Contributions", count: frows.length ? `${frows.length}${f.more ? "+" : ""}` : "", flush: true, region: "filings", body: fBody });
  // ---- the side: the child goals, the open questions on it, the counters, the checks ----
  const children = card({ label: "Child goals", count: kids.length || "", flush: true, region: "children", body: kids.length
    ? lines(kids.map((k) => line({ attrs: `data-id="${esc(k.id)}" data-pct="${pctAttr(k.pct)}"`, lead: ring({ value: known(k.pct) ? clampPct(k.pct) : 0, max: 100, size: 20, label: "Done" }),
      title: noDash(k.title || k.id), href: k.href || goalHref(k.id), linkAttrs: EXPAND, meta: `<span>${esc(pctWord(k.pct))}</span>` })), { compact: true })
    : empty(LEAF_CHILDREN) });
  const qs = Array.isArray(opts.questions) ? opts.questions : [];
  const questions = qs.length ? card({ label: "Open questions", count: qs.length, tone: "needs", flush: true, region: "questions", body: lines(qs.map((q) => line({ attrs: `data-qid="${esc(q.qid)}"`,
    lead: stateWord("DECIDE", "Decide"), title: noDash(q.question || q.qid), href: orgPath(`/question/${encodeURIComponent(q.qid)}`) })), { compact: true }) }) : "";
  const standingRows = (Array.isArray(c.rows) ? c.rows : []).filter((x) => x.standing);
  const counters = card({ label: "Counters", count: standingRows.length || "", flush: true, region: "counters", id: "counters", attrs: `data-standing="${esc(shown(c.standing))}" data-ruled="${esc(shown(c.ruled))}"`,
    body: standingRows.length ? lines(standingRows.map((x) => line({ attrs: `data-id="${esc(x.id)}"`, lead: avatar({ name: x.by || "someone", size: 20 }), title: noDash(x.what || x.id), href: orgPath(`/contribution/${encodeURIComponent(x.id)}`),
      meta: `<span>${esc(ago(x.at, nowMs))}</span>` })), { compact: true }) : empty(standing == null ? "Not read" : "No counters") });
  const ck = read.checks || {};
  const ckRows = Array.isArray(ck.rows) ? ck.rows : [];
  const ckLine = (x) => line({ attrs: `data-check="${esc(x.id)}" data-verdict="${esc(x.grade ? x.grade.verdict : "none")}"`, title: noDash(x.title || x.id),
    meta: `${x.stale ? chip("Stale", { tone: "warn", attrs: 'data-stale="1"', title: "Graded before what it names changed" }) : ""}${verdictChip(x.grade)}`,
    detail: lineDetail({ facts: [["Id", idCode(x.id)], x.severity ? ["Severity", esc(x.severity)] : null, x.grade && x.grade.at ? ["Graded", esc(String(x.grade.at).slice(0, 10))] : null] }) });
  const passed = ckRows.filter((x) => x.grade && x.grade.verdict === "proven" && !x.stale), rest = ckRows.filter((x) => !passed.includes(x));
  const ckSeg = num(ck.passed) + num(ck.failed) > 0 ? segBar({ label: "Checks", legend: false, height: 6, segments: [{ label: "passed", value: ck.passed, tone: "ok" }, { label: "failed", value: ck.failed, tone: "bad" }, { label: "ungraded", value: ck.ungraded, tone: "todo" }] }) : "";
  const checks = card({ label: "Checks", count: ckRows.length ? `${ckRows.length}${ck.more ? "+" : ""}` : "", flush: true, region: GOAL_CHECKS_REGION,
    action: ckSeg ? `<span class="gl-ckseg" title="${esc(checksLine(ck))}">${ckSeg}</span>` : "",
    body: ckRows.length ? (rest.length ? lines(rest.map(ckLine), { compact: true }) : "") + (passed.length ? group({ title: "Passed", count: passed.length, open: !rest.length, body: lines(passed.map(ckLine), { compact: true }) }) : "")
      : down && ck.total == null ? empty("Not read") : empty(goalChecksEmpty(n.id)) });
  const banner = down ? unreachableState({ what: "This goal could not be read from the ledger, so its numbers show ? until it answers." }) : "";
  return GL_CSS + NODE_CSS + `<section class="gl" data-screen="goal-node">${banner}${head}${stack(nodeFacts, periodFilter, cols(stack(cells, filings), stack(children, questions, counters, checks)))}</section>`;
}

// proposeGoalRef(tree, ctx) — M-ADR-021 fine-tune (MCP-proposes): the door has a real
// contribution with no goalRef yet — this suggests one instead of leaving the sender to
// guess a node id. PURE (no DB/env), NEVER blocking (R3): a caller may ignore the result
// or show it as a hint; it never changes route/decision.
//   ctx = { what, touches, lane } — what/touches from the submission, lane already
//   resolved by the caller (src/transmission.js's own lane logic — this file invents none).
// Deterministic scoring per candidate node (skips the root and any node with no
// dimensions — an internal node with nothing of its own to measure is never a target):
//   +3  ctx.touches (array or string) contains the node id
//   +2  ctx.lane is one of the node's own dimensions
//   +1  per lowercased word (>3 chars) shared between (what + touches) and the node's title
// Highest score > 0 wins; ties keep the FIRST node in tree order (stable, no randomness).
// Returns null when nothing scores above 0 — an honest "no suggestion", not a guess.
export function proposeGoalRef(tree, ctx) {
  const nodes = Array.isArray(tree)
    ? tree.filter((n) => n && n.id && Array.isArray(n.dimensions) && n.dimensions.length)
    : [];
  if (!nodes.length) return null;

  const what = (ctx && ctx.what) || "";
  const rawTouches = ctx && ctx.touches;
  const touchesArr = Array.isArray(rawTouches) ? rawTouches : (rawTouches != null ? [rawTouches] : []);
  const laneNorm = ctx && ctx.lane ? String(ctx.lane).toLowerCase() : null;

  const wordsOf = (s) => (String(s || "").toLowerCase().match(/[a-z0-9]+/g) || []);
  const srcWords = new Set(
    [what, ...touchesArr].flatMap((s) => wordsOf(s)).filter((w) => w.length > 3)
  );
  const touchesHit = (id) => {
    const idLower = String(id).toLowerCase();
    return touchesArr.some((t) => t != null && String(t).toLowerCase().includes(idLower));
  };

  let best = null; // { node, score, why }
  for (const n of nodes) {
    let score = 0;
    const reasons = [];
    if (touchesHit(n.id)) { score += 3; reasons.push("touches names this node"); }
    if (laneNorm && n.dimensions.some((d) => String(d).toLowerCase() === laneNorm)) {
      score += 2;
      reasons.push(`lane '${laneNorm}' measures this node`);
    }
    const titleWords = new Set(wordsOf(n.title).filter((w) => w.length > 3));
    const sharedCount = [...titleWords].filter((w) => srcWords.has(w)).length;
    if (sharedCount > 0) { score += sharedCount; reasons.push("title words match"); }
    if (score > 0 && (!best || score > best.score)) best = { node: n, score, why: reasons.join("; ") };
  }
  if (!best) return null;
  return { goalRef: best.node.id, title: best.node.title || best.node.id, why: best.why || "matched" };
}
