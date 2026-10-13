// src/checklist.js — the checklist and its meter (sprint 3, B3; docs/plan/MCP.md §0 "filled is a full checklist per page,
// with a fill meter", §9 demand 8 "the meter counts only the areas a project has"). ONE standard, the same for every
// project: the items are the registry's declarations (src/knowledge/schema.js KINDS[kind].checklist, in area order, then
// the registry's order), and their measures are this file's, over a fixed number of D1 statements. Nothing here names a
// project, and nothing reads a table to count it in JS.
//
// What each item counts (have of want; an item whose population is empty is not_applicable, never "done"):
//   core   aim               the aim (1) and its measure (1): 2 of 2 when both are filed
//          goal-tree         one root (1) + at least one goal under it (1) + every leaf goal naming a lane (one per leaf),
//                            off k_fill 'goal' (migrate-050: n, roots, leaves, laned)
//          questions-options the open questions carrying two options or more, of the open questions
//          rulings-owed      the open questions that do NOT wait on the owner's ruling (core.js ownerOwedOnce: the badge's
//                            own read), of the open questions; the call (rule_question) is the owner's alone
//          gaps              the gap nodes closed, of the gap nodes (k_fill 'gap')
//          start-here        the project's own start-here.md (1)
//   app    apps              a surface node (1)
//          screens           the surfaces that a screen names in data.surface, of the surfaces
//          screens-in-flow   the screens with data.lane and data.step, or a nav edge to or from them, of the screens (k_fill)
//          doors · tables    a door node (1) · a table node (1)
//          door-table-links  the doors with an edge of kind reads or writes out of them, of the doors (k_fill)
//          screens-pictured  the screens with data.wireframe or a render, of the screens (k_fill)
//   proof  checks-screens    the screens a check's refs name, of the screens (k_fill)
//          checks-doors      the doors a check's refs name, of the doors (k_fill)
//          grades            the checks with a FRESH grade, of the checks (k_fill): a check with no check_results row, or one whose
//                            latest grade is older than a change of a node it names (stale, sprint 3 B4: k_fill's 'stale'
//                            row, migrate-054), is not done; What is missing names the first stale one first, and since what
//   gtm    gtm-lists         the card kinds on the GTM tab that hold a card, of those kinds (at least one kind is wanted)
//          gtm-template      the GTM template (1)
//          gtm-strategy      a doc under gtm/ (1)
//   core   knowledge-fresh   the dated cards (not on the GTM tab) and docs (not under gtm/) within their shelf life, of the
//                            dated ones (sprint 3 B4, stale by age: src/knowledge/fresh.js; none dated: not applicable)
//   gtm    gtm-fresh         the same for the GTM area's dated cards and docs
//   agents agents-equipped   an equip on the ledger (migrate-042's transmission_kinds tally: each Equip press, the
//                            starter pack's and a published item's alike). The area applies only once something is
//                            equipped, so when it applies it is done: depth is not measured here.
// An area applies (demand 8) when the project declared it: core always; app once it holds a surface or a screen; proof once
// it holds a check; gtm once it holds a GTM template, a doc under gtm/ or a card kind on the GTM tab; agents once anything is
// equipped. An area that does not apply is listed with the one call that would start it and is never counted.
// The meter: done items of the applicable ones, per area and overall, and the depth: the mean of every applicable item's
// have/want (a partial item counts by its ratio). "7 of 12 complete · 68% by depth".
//
// Cost (the free tier): the whole checklist is at most FOUR statements, each bounded: CHECKLIST_SQL (src/hotsql.js:
// migrate-050's k_fill and a few probes; saruspay: 22 rows), the open questions and the owner's owed set (both memoized: the
// badge on every owner page already reads them), and, for What is missing only, CHECKLIST_FIRSTS_SQL (the first missing
// thing of each open item). A chip asks only for its items: the Decisions chip reads the questions (already read on that
// page), the Goals, Map, GTM and Broadcast chips ONE statement (CHECKLIST_SQL).
import { db } from "./data.js";
import { KINDS, KNOWLEDGE_KINDS, CHECK_AREAS } from "./knowledge/schema.js";
import { LANE_KEYS } from "./lanes.js";
import { openQuestionRows } from "./knowledge/decisions.js";
import { START_HERE_PATH } from "./knowledge/docs.js";
import { readerKeys } from "./hats.js";
import { ownerOwedOnce, clip } from "./core.js";
import { projectOf, projectSlug } from "./project.js";
import { reqMemo, reqMemoPeek } from "./reqmemo.js";
import { checklistSql, CHECKLIST_COLS, CHECKLIST_FIRSTS_SQL } from "./hotsql.js";
import { isD1Quota } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

// ---- the items, from the registry ----
// the order a project needs its areas in: the core, then the app, its proof, the go-to-market, the agents (CHECK_AREAS names
// the same five)
export const AREA_ORDER = ["core", "app", "proof", "gtm", "agents"].filter((a) => CHECK_AREAS.includes(a));
export const CHECKLIST = AREA_ORDER.flatMap((area) => KNOWLEDGE_KINDS.flatMap((kind) =>
  (KINDS[kind].checklist || []).filter((it) => it.area === area).map((it) => Object.freeze({ ...it, kind }))));
const BY_ID = new Map(CHECKLIST.map((it) => [it.id, it]));
export const AREA_LABEL = { core: "Core", app: "App", proof: "Proof", gtm: "GTM", agents: "Agents" };
// the piece names `missing` answered before the checklist (sprint 1): each maps 1:1 onto an item, or onto the call that starts
// an area (old "model": the first app item; old "checks": the proof area). Callers read `piece` (D5: was `hole`).
// VERDICT_PLACEHOLDER (D1b item 9): a fill line never names a verdict; the client fills it from what it observes
export const VERDICT_PLACEHOLDER = "<proven | refused | incomplete: what you observe when you run the check now>";
export const HOLE_OF = { aim: "aim", "goal-tree": "goals", "rulings-owed": "questions", grades: "grades", gaps: "gaps", "start-here": "start-here", "gtm-template": "gtm" };
const AREA_HOLE = { app: "model", proof: "checks", gtm: "gtm", agents: "agents" };
export const holeOf = (id) => HOLE_OF[id] || id;
// an item's short name on glass
export const ITEM_LABEL = { aim: "The aim", "goal-tree": "The goal tree", "questions-options": "Options on open questions", "rulings-owed": "Rulings owed",
  gaps: "Gaps closed", "start-here": "A start-here doc", apps: "The apps", screens: "Screens for every app", "screens-in-flow": "Screens in a flow",
  doors: "The doors", tables: "The tables", "door-table-links": "Doors linked to tables", "screens-pictured": "Screens pictured",
  "checks-screens": "Checks on screens", "checks-doors": "Checks on doors", grades: "Grades", "gtm-lists": "GTM lists",
  "gtm-template": "The GTM template", "gtm-strategy": "The GTM strategy", "agents-equipped": "Agents equipped", "knowledge-fresh": "Fresh cards and docs", "gtm-fresh": "Fresh GTM cards and docs" };
// copy: off-screen (holes' JSON `what`, and the row's title on What is missing)
const AREA_WHAT = {
  app: "No app is filed: the project holds no surface and no screen.",
  proof: "No check is filed: nothing says what done looks like.",
  gtm: "No go-to-market is filed: no GTM template, no doc under gtm/ and no card kind on the GTM tab.",
  agents: "Nothing is equipped from Broadcast.",
};

// ---- the facts, read ----
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pj = (v, d) => { try { const x = JSON.parse(v); return x == null ? d : x; } catch { return d; } };
const splitFirst = (v) => { if (v == null || v === "") return null; const [id, name] = String(v).split("\u001f"); return id ? { id, name: clip(name || "", 120) } : null; };
const EMPTY_FILL = { n: 0, flow: 0, pictured: 0, checked: 0, linked: 0, ungraded: 0, open: 0, roots: 0, leaves: 0, laned: 0 };
// parseMeterRow(row) -> the counts CHECKLIST_SQL answers, as numbers (an absent row reads as nothing filed)
export function parseMeterRow(r) {
  const row = r || {};
  const fill = {};
  for (const a of pj(row.fill, [])) if (Array.isArray(a)) fill[a[0]] = { n: num(a[1]), flow: num(a[2]), pictured: num(a[3]), checked: num(a[4]), linked: num(a[5]), ungraded: num(a[6]), open: num(a[7]), roots: num(a[8]), leaves: num(a[9]), laned: num(a[10]) };
  const sf = pj(row.surfaces, [0, 0]), gk = pj(row.gtm_kinds, [0, 0]), fr = pj(row.fresh, [0, 0, 0, 0]);
  return {
    // stale (sprint 3 B4, migrate-054): k_fill's 'stale' row, n = how many checks are stale (graded before a change)
    fill: { screen: fill.screen || EMPTY_FILL, door: fill.door || EMPTY_FILL, gap: fill.gap || EMPTY_FILL, check: fill.check || EMPTY_FILL, goal: fill.goal || EMPTY_FILL, stale: fill.stale || EMPTY_FILL },
    fresh: { core: { n: num(fr[0]), due: num(fr[1]) }, gtm: { n: num(fr[2]), due: num(fr[3]) } },
    aim: num(row.aim), gtm: !!num(row.gtm), startHere: !!num(row.start_here), gtmDocs: num(row.gtm_docs),
    surfaces: { n: num(sf[0]), withScreens: num(sf[1]) }, tables: !!num(row.tables), gtmKinds: { n: num(gk[0]), withCards: num(gk[1]) }, equips: num(row.equips),
  };
}
// which reads an item set needs, and which parts of CHECKLIST_SQL (src/hotsql.js checklistSql): an item's own, and its
// area's applicability (app: the surfaces and the screens; proof: the checks; gtm: the template, its docs, its card kinds;
// agents: the equips)
const NEEDS = (id) => (id === "questions-options" ? ["questions"] : id === "rulings-owed" ? ["questions", "owed"] : ["meter"]);
const needsOf = (ids) => { const s = new Set(); for (const id of ids) for (const n of NEEDS(id)) s.add(n); return s; };
const AREA_COLS = { core: [], app: ["fill", "surfaces"], proof: ["fill"], gtm: ["gtm", "gtm_docs", "gtm_kinds"], agents: ["equips"] };
const ITEM_COLS = { aim: ["aim"], "goal-tree": ["fill"], gaps: ["fill"], "start-here": ["start_here"], apps: ["surfaces"], screens: ["surfaces"], tables: ["tables"],
  "gtm-lists": ["gtm_kinds"], "gtm-template": ["gtm"], "gtm-strategy": ["gtm_docs"], "agents-equipped": ["equips"], "knowledge-fresh": ["fresh"], "gtm-fresh": ["fresh"] };
export function colsOf(ids) {
  const s = new Set();
  for (const id of ids) { const it = BY_ID.get(id); if (!it || NEEDS(id)[0] !== "meter") continue; for (const c of [...(ITEM_COLS[id] || ["fill"]), ...AREA_COLS[it.area]]) s.add(c); }
  return CHECKLIST_COLS.filter((c) => s.has(c));
}
// D2b item 10: the GTM card kinds are counted as the reader may read them (?2: the reader's keys as a JSON list, NULL for the
// owner, who reads every kind), the Library's role rule in SQL; sprint 1's review, closed in 6.6: so are the docs and the dated
// cards and docs (no count includes an item the reader cannot read), and a reader signed in as no one holds no key ("[]": the
// items every reader may read, never the owner's NULL). A statement with no part naming ?2 binds the project alone.
export const readerKeysJson = (reader) => (reader && reader.role === "owner" ? null : JSON.stringify([...readerKeys(reader)]));
const meterRow = (env, project, cols, keys = null) => reqMemo(env, `knowledge:${project}:checklist:${cols.join(",")}:${keys || "*"}`, async () =>
  parseMeterRow(await (checklistSql(cols).includes("?2") ? db(env).prepare(checklistSql(cols)).bind(project, keys) : db(env).prepare(checklistSql(cols)).bind(project)).first()));
// the open questions: the Decisions page's own read when this request already made it (its open rows carry their options),
// else the open rows alone (the badge's read on an owner's page)
async function openRows(env, project) {
  const all = reqMemoPeek(env, `knowledge:${project}:decision-rows`);
  if (all) { try { return (await all).filter((r) => r.status === "open"); } catch (e) { if (isD1Quota(e)) throw e; } }
  return openQuestionRows(env, project);   // full rows: the questions-options item counts each open question's menu
}
// readFacts(env, project, ids) -> { meter?, questions?, owed? }: only the reads the items need, each memoized
export async function readFacts(env, project, ids = CHECKLIST.map((it) => it.id), reader = null) {
  const need = needsOf(ids);
  const [meter, questions, owed] = await Promise.all([
    need.has("meter") ? meterRow(env, project, colsOf(ids), readerKeysJson(reader)) : null,
    need.has("questions") ? openRows(env, project) : null,
    need.has("owed") ? ownerOwedOnce(env) : null,
  ]);
  return { meter, questions, owed };
}

// ---- the measures (pure) ----
const fmt = (n) => Number(n).toLocaleString("en-US");
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;
// a sentence ends in one stop (a filed name may already end in one); the first missing thing is named by its name (its id
// rides beside it in the answer's `first`)
const sentence = (t) => { const x = String(t).replace(/\s+/g, " ").trim(); return /[.?!\u2026]$/.test(x) ? x : x + "."; };
const firstWords = (f) => (f ? `, first: ${String(f.name || f.id).replace(/\s*[\u2014\u2013]\s*/g, " - ")}` : "");
// sinceOf(v) -> { by, node, at } off CHECKLIST_FIRSTS_SQL's stale_since ("<contribution or ''>\u001f<node>\u001f<when>"), or null
export function sinceOf(v) {
  if (v == null || v === "") return null;
  const [by, node, at] = String(v).split("\u001f");
  return node ? { by: by || null, node, at: at || null } : null;
}
// goalFacts(fill, firsts) -> { n, roots, children, leaves, laned, root, firstUnlaned }: the goal tree's counts (k_fill 'goal')
// and, on What is missing, its root and its first leaf with no lane (CHECKLIST_FIRSTS_SQL)
export function goalFacts(g, firsts = {}) {
  const x = g || EMPTY_FILL;
  return { n: x.n, roots: x.roots, children: Math.max(0, x.n - x.roots), leaves: x.leaves, laned: x.laned,
    root: splitFirst(firsts.goal_root), firstUnlaned: splitFirst(firsts.goal_leaf) };
}
// measure(facts, { owner, firsts }) -> { items: [{ id, area, kind, hole, state, have, want, ratio, count, first, owner? }], areas }
// state: done | partial | empty | not_applicable. Pure: the checklist-selftest runs it on fixtures.
export function measure(f, o = {}) {
  const m = f.meter, firsts = o.firsts || {};
  const applies = {
    core: true,
    app: !!m && (m.surfaces.n > 0 || m.fill.screen.n > 0),
    proof: !!m && m.fill.check.n > 0,
    gtm: !!m && (m.gtm || m.gtmDocs > 0 || m.gtmKinds.n > 0),
    agents: !!m && m.equips > 0,
  };
  const g = m ? goalFacts(m.fill.goal, firsts) : null;
  const qs = Array.isArray(f.questions) ? f.questions : null;
  const owed = Array.isArray(f.owed) ? f.owed : null;
  const x = (have, want, first = null, extra = {}) => ({ have, want, first, ...extra });
  const NA = { na: true };
  const of = {
    aim: () => (m ? x(m.aim >= 1 ? (m.aim >= 2 ? 2 : 1) : 0, 2) : null),
    "goal-tree": () => (g ? (g.n ? x((g.roots === 1 ? 1 : 0) + (g.children > 0 ? 1 : 0) + g.laned, 2 + g.leaves, g.children > 0 ? g.firstUnlaned : g.root, { goals: g }) : x(0, 1, null, { goals: g })) : null),
    "questions-options": () => { if (!qs) return null; if (!qs.length) return NA; const lacking = qs.filter((q) => !(Array.isArray(q.options) && q.options.length >= 2));
      return x(qs.length - lacking.length, qs.length, lacking[0] ? { id: String(lacking[0].qid), name: String(lacking[0].question || lacking[0].qid) } : null); },
    "rulings-owed": () => { if (!qs || !owed) return null; if (!qs.length) return NA; const n = Math.min(owed.length, qs.length);
      return x(qs.length - n, qs.length, owed[0] ? { id: String(owed[0].id), name: String(owed[0].title || owed[0].id) } : null, { owner: true }); },
    gaps: () => (m ? (m.fill.gap.n ? x(m.fill.gap.n - m.fill.gap.open, m.fill.gap.n, splitFirst(firsts.gap)) : NA) : null),
    "start-here": () => (m ? x(m.startHere ? 1 : 0, 1) : null),
    apps: () => x(m.surfaces.n > 0 ? 1 : 0, 1),
    screens: () => (m.surfaces.n ? x(m.surfaces.withScreens, m.surfaces.n, splitFirst(firsts.surface)) : NA),
    "screens-in-flow": () => (m.fill.screen.n ? x(m.fill.screen.flow, m.fill.screen.n, splitFirst(firsts.flow)) : NA),
    doors: () => x(m.fill.door.n > 0 ? 1 : 0, 1),
    tables: () => x(m.tables ? 1 : 0, 1),
    "door-table-links": () => (m.fill.door.n ? x(m.fill.door.linked, m.fill.door.n, splitFirst(firsts.link)) : NA),
    "screens-pictured": () => (m.fill.screen.n ? x(m.fill.screen.pictured, m.fill.screen.n, splitFirst(firsts.pictured)) : NA),
    "checks-screens": () => (m.fill.screen.n ? x(m.fill.screen.checked, m.fill.screen.n, splitFirst(firsts.screen_check)) : NA),
    "checks-doors": () => (m.fill.door.n ? x(m.fill.door.checked, m.fill.door.n, splitFirst(firsts.door_check)) : NA),
    // a STALE grade (sprint 3 B4: graded before a node it names changed) is not done: it is regraded first
    grades: () => { const st = Math.min(m.fill.stale.n, m.fill.check.n - m.fill.check.ungraded);
      return x(m.fill.check.n - m.fill.check.ungraded - st, m.fill.check.n, (st ? splitFirst(firsts.stale) : null) || splitFirst(firsts.ungraded), { stale: st, ungraded: m.fill.check.ungraded, since: st ? sinceOf(firsts.stale_since) : null }); },
    "knowledge-fresh": () => (m.fresh.core.n ? x(m.fresh.core.n - m.fresh.core.due, m.fresh.core.n, splitFirst(firsts.due_doc) || splitFirst(firsts.due_card)) : NA),
    "gtm-fresh": () => (m.fresh.gtm.n ? x(m.fresh.gtm.n - m.fresh.gtm.due, m.fresh.gtm.n, splitFirst(firsts.due_gtm_card) || splitFirst(firsts.due_gtm_doc)) : NA),
    "gtm-lists": () => x(m.gtmKinds.withCards, Math.max(1, m.gtmKinds.n), splitFirst(firsts.gtm_kind), { kinds: m.gtmKinds.n }),
    "gtm-template": () => x(m.gtm ? 1 : 0, 1),
    "gtm-strategy": () => x(m.gtmDocs > 0 ? 1 : 0, 1, null, { docs: m.gtmDocs }),
    "agents-equipped": () => x(m.equips > 0 ? 1 : 0, 1, null, { equips: m.equips }),
  };
  const items = [];
  for (const it of CHECKLIST) {
    if (o.ids && !o.ids.includes(it.id)) continue;
    const base = { id: it.id, area: it.area, kind: it.kind, piece: holeOf(it.id) };
    if (!applies[it.area]) { items.push({ ...base, state: "not_applicable", why: "area", have: 0, want: 0, ratio: null, count: 0, first: null }); continue; }
    const r = of[it.id] ? of[it.id]() : null;
    if (r == null) continue;   // its read was not asked for
    if (r.na) { items.push({ ...base, state: "not_applicable", why: "none", have: 0, want: 0, ratio: null, count: 0, first: null }); continue; }
    const have = Math.max(0, Math.min(r.have, r.want)), want = r.want;
    const state = have >= want ? "done" : have === 0 ? "empty" : "partial";
    const { have: _h, want: _w, first, ...rest } = r;
    items.push({ ...base, state, have, want, ratio: want ? have / want : 1, count: want - have, first: state === "done" ? null : first || null, ...rest });
  }
  return { items, applies };
}
// meterOf(items) -> { done, total, pct, open }: the applicable items (pct null when none applies)
export function meterOf(items) {
  const live = (items || []).filter((x) => x.state !== "not_applicable");
  const done = live.filter((x) => x.state === "done").length;
  const pct = live.length ? Math.round((100 * live.reduce((a, x) => a + x.ratio, 0)) / live.length) : null;
  return { done, total: live.length, pct, open: live.length - done };
}
// areasOf(items, applies) -> [{ area, label, applies, done, total, pct, open }] in AREA_ORDER
export function areasOf(items, applies) {
  return AREA_ORDER.map((area) => ({ area, label: AREA_LABEL[area], applies: !!applies[area], ...meterOf(items.filter((x) => x.area === area)) }));
}
// meterWords(m) -> "7 of 12 complete · 68% by depth" (the honest pair: how many items are complete, and the depth, the mean of
// every item's share filled, a partial item counting by its share; the one-pass fix 8: "68% filled" beside "7 of 12" read as
// a contradiction), or "" when nothing applies
export const meterWords = (m) => (m && m.total ? `${m.done} of ${m.total} complete · ${m.pct}% by depth` : "");
// scopeWords(areas) -> which areas the meter counts and which it does not yet (the one-pass fix 8: the meter's total changes as
// areas start, so the answer says what it counts): "it counts Core, App and Proof; GTM and Agents count once started"
export function scopeWords(areas) {
  const on = (areas || []).filter((a) => a.applies).map((a) => a.label), off = (areas || []).filter((a) => !a.applies).map((a) => a.label);
  const and = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] || "");
  return on.length ? `it counts ${and(on)}${off.length ? `; ${and(off)} ${off.length === 1 ? "counts" : "count"} once started` : ""}` : "";
}
// meterChangeWords(before, after) -> what a write did to the meter, said when an area starts to count: "GTM now counts: +3
// items (the meter: 4 of 14 complete -> 5 of 17)"; "" when no area started (the one-pass fix 8)
export function meterChangeWords(before, after) {
  if (!before || !after || !Array.isArray(before.areas) || !Array.isArray(after.areas)) return "";
  const was = new Map(before.areas.map((a) => [a.area, a]));
  const started = after.areas.filter((a) => a.applies && !(was.get(a.area) || {}).applies);
  if (!started.length) return "";
  const m0 = before.meter || {}, m1 = after.meter || {};
  return `${started.map((a) => `${a.label} now counts: +${a.total} item${a.total === 1 ? "" : "s"}`).join("; ")} (the meter: ${m0.done || 0} of ${m0.total || 0} complete -> ${m1.done || 0} of ${m1.total || 0})`;
}

// ---- the words and the calls ----
const P = "<your project>";
// every knowledge fill is previewed first (the owner's rule; the one-pass fix 8: fillPath points at preview, as the fill line
// always said): a knowledge op is sent as preview's item, and `then` says the second call (sprint 19: save_knowledge, the write
// tool of an upsert); a grade files at once through submit_grade
// copy: off-screen (the fill's JSON `then`)
export const FILL_THEN = "then save_knowledge {previewId, items} with the same items";
const wk = (project, kind, data) => ({ tool: "preview", args: { project: project || P, items: [{ kind, op: "upsert", data }] }, then: FILL_THEN });
const LANES = `<one or more of ${LANE_KEYS.join(", ")}>`;
const exampleOf = (kind) => structuredClone(KINDS[kind].example.op.data);
// whatOf(item, { owner }) -> the plain sentence of what is missing
// copy: off-screen (holes' JSON `what`, and the row's title on What is missing)
export function whatOf(it, o = {}) {
  const f = firstWords(it.first), n = it.count, w = it.want;
  const s = (() => { switch (it.id) {
    case "aim": return it.have ? "The aim has no measure yet: no number says the project is working" : "No aim yet: nobody reading this project can say what it is for";
    case "goal-tree": {
      const g = it.goals || {};
      if (!g.n) return "No goal tree yet: no contribution can say which goal it moves";
      if (g.roots !== 1) return `The goal tree has ${plural(g.roots, "top goal")}: exactly one goal sits at the top`;
      if (!g.children) return `The goal tree is one goal alone, ${g.root ? g.root.name : "the root"}: nothing sits under it yet`;
      return `${fmt(g.leaves - g.laned)} of ${plural(g.leaves, "leaf goal")} ${g.leaves - g.laned === 1 ? "names" : "name"} no lane that measures it${f}`;
    }
    case "questions-options": return `${fmt(n)} of ${plural(w, "open question")} ${n === 1 ? "carries" : "carry"} fewer than two options${f}`;
    case "rulings-owed": return `${plural(n, "open question")} ${n === 1 ? "waits" : "wait"} on ${o.owner ? "your" : "the owner's"} ruling${f}`;
    case "gaps": return `${plural(n, "open gap")} on the map${f}`;
    case "start-here": return "No start-here doc of the project's own: a newcomer reads the built-in guide";
    case "apps": return "No app is filed: the screens name no surface node";
    case "screens": return `${fmt(n)} of ${plural(w, "app")} ${n === 1 ? "has" : "have"} no screen${f}`;
    case "screens-in-flow": return `${fmt(n)} of ${plural(w, "screen")} ${n === 1 ? "is" : "are"} in no flow${f}`;
    case "doors": return "No door is filed: the project's API routes are not on the map";
    case "tables": return "No table is filed: the Data layer is empty";
    case "door-table-links": return `${fmt(n)} of ${plural(w, "door")} ${n === 1 ? "names" : "name"} no table it reads or writes${f}`;
    case "screens-pictured": return `${fmt(n)} of ${plural(w, "screen")} ${n === 1 ? "has" : "have"} no wireframe or render${f}`;
    case "checks-screens": return `${fmt(n)} of ${plural(w, "screen")} ${n === 1 ? "has" : "have"} no check that says what done looks like${f}`;
    case "checks-doors": return `${fmt(n)} of ${plural(w, "door")} ${n === 1 ? "has" : "have"} no check${f}`;
    case "grades": {
      if (!it.stale) return `${fmt(n)} of ${plural(w, "check")} ${n === 1 ? "has" : "have"} no grade yet${f}`;
      const sc = it.since ? (it.since.by ? ` since ${it.since.by}` : ` since ${it.since.node} changed${it.since.at ? ` on ${String(it.since.at).slice(0, 10)}` : ""}`) : "";
      return `${plural(it.stale, "grade")} ${it.stale === 1 ? "is" : "are"} stale${sc}: regrade ${it.stale === 1 ? "it" : "them"} first${f}${it.ungraded ? `; ${fmt(it.ungraded)} more ${it.ungraded === 1 ? "check has" : "checks have"} no grade yet` : ""}`;
    }
    case "knowledge-fresh":
    case "gtm-fresh": return `${fmt(n)} of ${plural(w, it.id === "gtm-fresh" ? "dated GTM card and doc" : "dated card and doc", it.id === "gtm-fresh" ? "dated GTM cards and docs" : "dated cards and docs")} ${n === 1 ? "is" : "are"} due for review: older than ${n === 1 ? "its" : "their"} shelf life${f}`;
    case "gtm-lists": return it.kinds ? `${fmt(n)} of ${plural(w, "GTM list")} ${n === 1 ? "holds" : "hold"} no card${f}` : "No GTM list: no card kind names the GTM tab";
    case "gtm-template": return "No go-to-market template: GTM contributions have no kinds to sort into";
    case "gtm-strategy": return "No GTM strategy is written down: no doc under gtm/";
    case "agents-equipped": return "Nothing is equipped from Broadcast";
    default: return "";
  } })();
  return s ? sentence(s) : "";
}
// fillOf(item, project) -> { fillPath: {tool, args} | null, href? }: the exact call that fills it, the registry's example
// with this project's ids (the first missing thing) put in and the free text left as <placeholders> to fill from the source.
// fillPath's args keep the project's KEY (data a client sends as given: a key from another org is refused there, where a
// slug would resolve in the caller's own org — the sprint-13 review's should-fix 1); callText shows the slug to a person
export function fillOf(it, project) {
  const p = project || P, f = it.first;
  switch (it.id) {
    // an aim and its measure in ONE op (the item is complete with both); an aim already filed takes its measure alone. With no
    // number yet, send measure null: the item stays partial, and honest
    case "aim": { const measure = { name: "<the number that says it is working>", value: null, period: "<this week>", prior: null, priorPeriod: "<last week>", source: "<where it is counted>" };
      return { fillPath: it.have ? wk(p, "aim", { measure }) : wk(p, "aim", { aim: "<the project's aim, in a sentence or two>", measure }) }; }
    case "goal-tree": {
      const g = it.goals || {};
      if (!g.n) return { fillPath: wk(p, "goal", { id: "top-goal", title: "<the top goal, in a few words>", parent: null, dimensions: [] }) };
      if (!g.children && g.root) return { fillPath: wk(p, "goal", { id: "<a-goal-id>", parent: g.root.id, title: "<a goal under it>", dimensions: [LANES] }) };
      return { fillPath: wk(p, "goal", { id: f ? f.id : "<the leaf goal's id>", dimensions: [LANES] }) };
    }
    case "questions-options": return { fillPath: wk(p, "question", { qid: f ? f.id : "<the qid>", options: [{ what: "<option A>", tradeoff: "<what it costs>" }, { what: "<option B>", tradeoff: "<what it costs>" }] }) };
    case "rulings-owed": return { fillPath: { tool: "rule_question", args: { project: p, qid: f ? f.id : "<the qid>", choice: 0, rationale: "<why this option>" } } };
    case "gaps": return { fillPath: wk(p, "node", { id: f ? f.id : "<the gap's id>", status: "closed" }) };
    case "start-here": return { fillPath: wk(p, "doc", { path: START_HERE_PATH, title: "Start here", body: "<what a newcomer to this project reads first, in markdown>" }) };
    case "apps": return { fillPath: wk(p, "node", { id: "surface:<app>", type: "surface", name: "<the app's name>" }) };
    case "screens": { const key = f ? (f.id.startsWith("surface:") ? f.id.slice(8) : f.id) : "<the app's key>";
      return { fillPath: wk(p, "node", { id: "screen:<id>", type: "screen", name: "<the screen's name>", status: "live", data: { surface: key, lane: "<its lane>", step: 1, states: ["default"] } }) }; }
    case "screens-in-flow": return { fillPath: wk(p, "edge", { from: f ? f.id : "<a screen's id>", to: "<the next screen's id>", kind: "nav", label: "<how one leads to the other>" }) };
    case "doors": return { fillPath: wk(p, "node", { id: "door:<method>:<path>", type: "door", name: "<METHOD /path>" }) };
    case "tables": return { fillPath: wk(p, "node", { id: "table:<name>", type: "table", name: "<the table's name>" }) };
    case "door-table-links": return { fillPath: wk(p, "edge", { from: f ? f.id : "<a door's id>", to: "<a table's id>", kind: "reads", label: "<what it reads>" }) };
    case "screens-pictured": return { fillPath: wk(p, "render", { screen: f ? f.id : "<a screen's id>", format: "html", body: "<the screen's html, as it looks>" }) };
    case "checks-screens":
    case "checks-doors": { const d = exampleOf("check"); const slug = f ? f.id.replace(/^[a-z]+:/, "").replace(/[^A-Za-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 60) || "item" : "<item>";
      return { fillPath: wk(p, "check", { ...d, id: `AC.${slug}.01`, title: "<what the check proves, in a line>", given: "<who, and where>", when: "<what they do>", then: "<what they see>", refs: [f ? f.id : "<a screen or door id>"] }) }; }
    // D1b item 9: the verdict is never suggested (a stale REFUSED grade's line said "proven": copying it turned a red light
    // green) — it is a placeholder the client fills from what it observes when it runs the check now
    case "grades": return { fillPath: { tool: "submit_grade", args: { project: p, checkId: f ? f.id : "<a check id>", verdict: VERDICT_PLACEHOLDER, proof: "<the command you ran and what it printed, a result with its numbers, a link, or an artifact id>" } } };
    case "gtm-lists": return it.kinds ? { fillPath: wk(p, "card", { kind: f ? f.id : "<a GTM card kind>", id: "<an id>", name: "<the card's name>", body: "<what it says>" }) }
      : { fillPath: wk(p, "card_kind", exampleOf("card_kind")) };
    case "gtm-template": return { fillPath: wk(p, "gtm", { template: { ...exampleOf("gtm").template, activityTemplate: { kinds: [{ kind: "outreach", holds: [{ field: "expected" }, { field: "proof" }], proofConcrete: "<the link or reply that proves it>" }] },
      proofRule: { rule: "<what counts as proof>" }, outcomeModel: { expected: "<the outcome declared when filed>", actual: "<the result, reported later>" } } }) };
    case "gtm-strategy": return { fillPath: wk(p, "doc", { path: "gtm/positioning.md", title: "Positioning", body: "<who you serve first, and why they switch>" }) };
    case "agents-equipped": return { fillPath: null, href: orgPath("/broadcast") };
    // a card or doc due for review: checked again, its asOf moves to the day it was checked (and its confidence, if that moved)
    case "knowledge-fresh":
    case "gtm-fresh": {
      const id = f ? f.id : "";
      if (id.startsWith("card:")) { const [kind, ...rest] = id.slice(5).split("/"); return { fillPath: wk(p, "card", { kind, id: rest.join("/"), asOf: "<the day you checked it again, YYYY-MM-DD>" }) }; }
      return { fillPath: wk(p, "doc", { path: id.startsWith("doc:") ? id.slice(4) : "<the doc's path>", asOf: "<the day you checked it again, YYYY-MM-DD>" }) };
    }
    default: return { fillPath: null };
  }
}
// startOf(area, project) -> the one call that would start an area that does not apply yet
export function startOf(area, project) {
  const p = project || P;
  if (area === "app") return { piece: AREA_HOLE.app, what: AREA_WHAT.app, ...fillOf({ id: "apps" }, p) };
  if (area === "proof") return { piece: AREA_HOLE.proof, what: AREA_WHAT.proof,
    fillPath: wk(p, "check", { id: "AC.home.01", title: "<what the check proves, in a line>", given: "<who, and where>", when: "<what they do>", then: "<what they see>", refs: ["<a node, goal or question id it grades>"] }) };
  if (area === "gtm") return { piece: AREA_HOLE.gtm, what: AREA_WHAT.gtm, ...fillOf({ id: "gtm-template" }, p) };
  if (area === "agents") return { piece: AREA_HOLE.agents, what: AREA_WHAT.agents, fillPath: null, href: orgPath("/broadcast") };
  return null;
}
// callText(fillPath) -> the call as one line: a knowledge write reads as its preview (every filing is previewed first: the
// owner's ruling), a grade as its submit_grade (sprint 19: it files at once), the others as themselves
export const callText = (f) => {
  if (!f || !f.tool) return "";
  // the line a person reads names the project by its slug (13.2); fillPath itself keeps the key
  const shown = (a) => (a && typeof a.project === "string" ? { ...a, project: projectSlug(a.project) } : a || {});
  return `${f.tool} ${JSON.stringify(shown(f.args))}`;
};

// ---- the reads ----
// checklistFor(env, reader, { ids, firsts, project }) -> { project, items, applies, meter, areas } | { project: null }: the items
// asked (default every one) measured for the request's project; firsts: true reads the first missing thing of each open
// item (What is missing). A D1 quota error propagates; any other failure answers { live: "unreachable" }.
export async function checklistFor(env, reader, o = {}) {
  const scope = await projectOf(env);
  const project = o.project !== undefined ? o.project : scope;
  if (!project) return { project: null, items: [], applies: {}, meter: meterOf([]), areas: [] };
  // the owner's owed set is the request's project's (core.js ownerOwedOnce): another project's checklist (create_project's
  // answer, on the project it just made) leaves rulings-owed out rather than read the wrong project's
  const ids = (o.ids || CHECKLIST.map((it) => it.id)).filter((id) => id !== "rulings-owed" || project === scope);
  try {
    const facts = await readFacts(env, project, ids, reader);
    let firsts = {};
    if (o.firsts && facts.meter) {
      const pre = measure(facts, { ids });
      const open = (id) => { const x = pre.items.find((i) => i.id === id); return x && (x.state === "partial" || x.state === "empty") ? 1 : 0; };
      const g = facts.meter.fill.goal, gt = open("goal-tree");
      const flags = [open("gaps"), open("screens"), open("screens-in-flow"), open("screens-pictured"), open("checks-screens"), open("checks-doors"), open("door-table-links"), open("grades"),
        open("gtm-lists") && facts.meter.gtmKinds.n ? 1 : 0, gt && g.n && g.n === g.roots ? 1 : 0, gt && g.n > g.roots && g.laned < g.leaves ? 1 : 0,
        open("grades") && facts.meter.fill.stale.n ? 1 : 0, open("knowledge-fresh"), open("gtm-fresh")];
      if (flags.some(Boolean)) firsts = (await db(env).prepare(CHECKLIST_FIRSTS_SQL).bind(project, ...flags, readerKeysJson(reader)).first()) || {};
    }
    const { items, applies } = measure(facts, { ids, firsts, owner: !!(reader && reader.role === "owner") });
    return { project, items, applies, meter: meterOf(items), areas: areasOf(items, applies) };
  } catch (e) {
    if (isD1Quota(e)) throw e;
    return { project, items: [], applies: {}, meter: meterOf([]), areas: [], live: "unreachable" };
  }
}
