// src/reach.js — what a change REACHES (sprint 3, B2; docs/plan/ARCHITECTURE.md §12, docs/plan/MCP.md §4): from the refs a
// set of items touches, ONE hop along the project's model in both directions, then the checks that name what was touched
// (the proof a change puts in question), the goals those checks or the items name, and the open questions that name a
// touched ref. Counts and names only: no percentage, no score. The preview (src/preview.js) shows it before anything is
// written; B4's Impact screen reads the same function after.
//
// Bounded by construction: the input is capped at REF_MAX refs, every read is one indexed statement with a LIMIT, and a cap
// that is hit is SAID ("and N more", `capped`), never read past. Two D1 batches, eleven statements at most:
//   batch 1 (from the touched refs T)
//     nodes      k_nodes on its primary key, the touched node ids                       <= REF_MAX rows
//     out        k_node_links on its primary key (one row per node: its out edges as JSON) <= REF_MAX rows
//     in         k_edges INDEXED BY idx_k_edges_to (project, to_id), LIMIT IN_MAX + 1    <= IN_MAX + 1 rows
//     refs       k_check_refs on its primary key (project, ref, check_id), LIMIT CHECK_REF_MAX + 1
//     goals      k_goals on its primary key, the goals named directly                    <= NAME_MAX rows
//     questions  k_questions on its primary key, the questions named directly            <= NAME_MAX rows
//     asks       the OPEN questions whose affects name a touched ref: idx_k_questions_status, every open question of the
//                project is read (the one read here bounded by the project's open questions, not by a LIMIT)
//     callers    (sprint 3 B4, only when a screen is touched) the doors whose data.screens name it: one row per door of the
//                project on idx_k_nodes_type (bounded by the project's doors: saruspay 182, bunny 164), the screens' ids found
//                by instr in the door's data and checked against data.screens in the worker (callersOf), LIMIT IN_MAX + 1
//   batch 2 (from what batch 1 found)
//     reached    k_nodes on its primary key, the reached ids                             <= REACHED_READ rows
//     ungraded   k_check_ungraded on its primary key, the checks found                   <= CHECK_MAX rows
//     checkGoals k_check_refs by idx_k_check_refs_check for the first CHECK_GOALS checks, joined to k_goals
//
// collectRefs and planReach are pure (tools/preview-selftest.mjs runs them on a fixture model, both ways); readReach runs
// the statements.
import { db } from "./data.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
export const REF_MAX = 30;          // touched refs walked; the rest are counted, not walked
export const IN_MAX = 80;          // edges INTO the touched nodes read
export const CHECK_REF_MAX = 100;   // check refs read for the touched refs
export const CHECK_MAX = 60;       // distinct checks whose grade state is read
export const CHECK_GOALS = 15;      // checks whose goals are read
export const REACHED_READ = 40;     // reached nodes whose names are read
export const NAME_MAX = 25;         // names listed per section

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string" && v.trim() !== "";
const listOf = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x ?? "").trim()).filter(Boolean);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/+#@{}-]{0,119}$/;

// refOf(raw) -> { form: "goal" | "question" | "check" | "contribution" | "ref", id } | null: the ref grammar a contribution's
// depends and gapRefs use (src/shapes.js DEPEND_FORMS), and a plain id (a node id, or a goal or question id a check names)
export function refOf(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^goal\//.test(s)) return { form: "goal", id: s.slice(5) };
  if (/^q\//.test(s)) return { form: "question", id: s.slice(2) };
  if (/^check\//.test(s)) return { form: "check", id: s.slice(6) };
  if (/^T-\d{8}-\d{1,6}$/.test(s)) return { form: "contribution", id: s };
  return ID.test(s) ? { form: "ref", id: s } : null;
}

// collectRefs(items) -> { refs, goals, questions, checks } (Sets): what a list of preview items touches. items:
// [{ type: "knowledge", op } | { type: "contribution", body }]. A knowledge op touches its key (a node, a goal, a question, a
// check) and the refs it names (an edge's two ends, a render's screen, a check's refs, a question's affects); a contribution its
// touches, components, depends, goalRef and gapRefs.
export function collectRefs(items) {
  const refs = new Set(), goals = new Set(), questions = new Set(), checks = new Set();
  const filing = new Map();   // the nodes the items themselves file: id -> { type, name } (touched, though not in the model yet)
  // D2b: the refs a render touches (a picture or a wireframe of a screen). A picture changes no behaviour (migrate-057, the
  // owner's ruling): it is touched, it reaches what the screen reaches, but it puts no check in question
  const pictured = new Set(), changed = new Set();
  const addRef = (raw) => {
    const r = refOf(raw);
    if (!r) return;
    if (r.form === "goal") goals.add(r.id);
    else if (r.form === "question") questions.add(r.id);
    else if (r.form === "check") checks.add(r.id);
    else if (r.form === "ref") refs.add(r.id);
  };
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    if (it.type === "knowledge" && it.op && isObj(it.op.data)) {
      const d = it.op.data;
      switch (it.op.kind) {
        case "node": if (str(d.id)) { refs.add(d.id); changed.add(d.id); if (it.op.op === "upsert" && str(d.type)) filing.set(d.id, { type: d.type, name: str(d.name) ? d.name : d.id }); } break;
        case "edge": for (const k of ["from", "to"]) if (str(d[k])) { refs.add(d[k]); changed.add(d[k]); } break;
        case "render": if (str(d.screen)) { refs.add(d.screen); pictured.add(d.screen); } break;
        case "check": if (str(d.id)) checks.add(d.id); listOf(d.refs).forEach(addRef); break;
        case "question": if (str(d.qid)) questions.add(d.qid); listOf(d.affects).forEach(addRef); break;
        case "goal": if (str(d.id)) goals.add(d.id); if (str(d.parent)) goals.add(d.parent); break;
        default: break;
      }
    } else if (it.type === "contribution" && isObj(it.body)) {
      const b = it.body;
      for (const f of ["touches", "components", "depends", "gapRefs"]) listOf(b[f]).forEach((x) => { addRef(x); const r = refOf(x); if (r && r.form === "ref") changed.add(r.id); });
      if (str(b.goalRef)) goals.add(String(b.goalRef).trim());
    }
  }
  return { refs, goals, questions, checks, filing, pictureOnly: new Set([...pictured].filter((id) => !changed.has(id))) };
}

// reachInput(collected) -> the capped lists the statements bind: T (the touched refs walked), the goals and questions named,
// the checks named directly, and what was left unwalked
export function reachInput(c) {
  const all = [...c.refs];
  const T = all.slice(0, REF_MAX);
  // the refs a check may name: the touched refs, and the goals and questions named directly
  // (a ref only pictured is left out: a new picture puts no check in question, D2b)
  const po = c.pictureOnly || new Set();
  const named = [...new Set([...T.filter((id) => !po.has(id)), ...[...c.goals].slice(0, NAME_MAX), ...[...c.questions].slice(0, NAME_MAX)])];
  return { T, named, goals: [...c.goals].slice(0, NAME_MAX), goalsAll: c.goals.size, questions: [...c.questions].slice(0, NAME_MAX), checks: [...c.checks].slice(0, CHECK_MAX),
    unwalked: Math.max(0, all.length - T.length), filing: c.filing || new Map() };
}

const J = (a) => JSON.stringify(a);
const IN = (n) => `(SELECT value FROM json_each(?${n}))`;
// a door names the screens that call it in its data (data.screens: the screens' own ids, without "screen:"), and a screen may
// name its doors (data.apis: "METHOD /path"); the Map draws both as "calls" (src/knowledge/mapmodel.js). The reach reads them
// too (sprint 3 B4: on saruspay and bunny a screen reaches its doors ONLY this way): a touched node's own data on its row, and,
// when a screen is touched, the doors naming it (callers: the project's doors on idx_k_nodes_type, one row each, at most
// IN_MAX + 1 links kept)
export const REACH_SQL = {
  nodes: `SELECT id, type, name, CASE type WHEN 'door' THEN json_extract(data, '$.screens') END AS dscreens, CASE type WHEN 'screen' THEN json_extract(data, '$.apis') END AS apis FROM k_nodes WHERE project = ?1 AND id IN ${IN(2)}`,
  // one door row read per door of the project (idx_k_nodes_type), the screens' own ids looked for in its data as text (instr,
  // never a json_each over every door's list: that read each listed screen as a row, 650 rows on saruspay), the matches then
  // checked against data.screens itself in the worker (callersOf); ?2..?(1+CALLER_MAX) the screens' ids quoted as JSON
  callers: `SELECT d.id AS from_id, json_extract(d.data, '$.screens') AS dscreens FROM k_nodes d WHERE d.project = ?1 AND d.type = 'door' AND (` +
    Array.from({ length: 8 }, (_, i) => `instr(d.data, ?${i + 2}) > 0`).join(" OR ") + `) LIMIT ${IN_MAX + 1}`,
  out: `SELECT node_id, links FROM k_node_links WHERE project = ?1 AND node_id IN ${IN(2)}`,
  // INDEXED BY: left to itself the planner walks the primary key (project, from_id, to_id, kind), which COVERS the columns,
  // and reads every edge of the project (1,459 rows on SarusPay for one touched door); on (project, to_id) it reads the
  // edges into the touched nodes alone
  in: `SELECT from_id, to_id, kind FROM k_edges INDEXED BY idx_k_edges_to WHERE project = ?1 AND to_id IN ${IN(2)} LIMIT ${IN_MAX + 1}`,
  refs: `SELECT ref, check_id FROM k_check_refs WHERE project = ?1 AND ref IN ${IN(2)} LIMIT ${CHECK_REF_MAX + 1}`,
  goals: `SELECT id, title FROM k_goals WHERE project = ?1 AND id IN ${IN(2)}`,
  questions: `SELECT qid, question, status FROM k_questions WHERE project = ?1 AND qid IN ${IN(2)}`,
  asks: `SELECT q.qid, q.question FROM k_questions q WHERE q.project = ?1 AND q.status = 'open' AND q.affects IS NOT NULL ` +
    `AND EXISTS (SELECT 1 FROM json_each(q.affects) a WHERE a.value IN ${IN(2)}) LIMIT ${NAME_MAX + 1}`,
  reached: `SELECT id, type, name FROM k_nodes WHERE project = ?1 AND id IN ${IN(2)}`,
  ungraded: `SELECT check_id FROM k_check_ungraded WHERE project = ?1 AND check_id IN ${IN(2)}`,
  checkGoals: `SELECT DISTINCT g.id, g.title FROM k_check_refs r JOIN k_goals g ON g.project = r.project AND g.id = r.ref ` +
    `WHERE r.project = ?1 AND r.check_id IN ${IN(2)} LIMIT ${NAME_MAX + 1}`,
};

// secondInput(input, rows1) -> { reachedIds, reachedAll, checkIds, checksCapped }: what batch 2 reads, from batch 1's rows
// (pure). Reached: every node one hop out of a touched node (k_node_links) or into one (k_edges), the touched refs themselves
// left out; checks: the distinct checks naming a touched ref, then the checks named directly.
export function secondInput(input, rows1) {
  const T = new Set(input.T);
  const reached = new Map();   // id -> { via: Set of edge kinds, dir }
  const add = (id, kind, dir) => {
    if (!str(id) || T.has(id)) return;
    const r = reached.get(id) || { kinds: new Set(), dirs: new Set() };
    r.kinds.add(kind); r.dirs.add(dir);
    reached.set(id, r);
  };
  for (const row of rows1.out || []) {
    let links = [];
    try { links = JSON.parse(row.links || "[]"); } catch { links = []; }
    for (const l of Array.isArray(links) ? links : []) if (Array.isArray(l)) add(String(l[0] ?? ""), String(l[1] ?? ""), "out");
  }
  const inRows = (rows1.in || []).slice(0, IN_MAX);
  for (const e of inRows) add(String(e.from_id), String(e.kind), "in");
  // the links a node's own data carries (a door's screens, a screen's apis) and the doors naming a touched screen
  for (const n of rows1.nodes || []) for (const id of dataLinks(n)) add(id, "calls", "out");
  for (const e of (rows1.callers || []).slice(0, IN_MAX)) add(String(e.from_id), "calls", "in");
  const refRows = (rows1.refs || []).slice(0, CHECK_REF_MAX);
  const checkIds = [...new Set([...refRows.map((r) => String(r.check_id)), ...input.checks])];
  return { reached, reachedIds: [...reached.keys()].slice(0, REACHED_READ), reachedAll: reached.size,
    inCapped: (rows1.in || []).length > IN_MAX || (rows1.callers || []).length > IN_MAX, refsCapped: (rows1.refs || []).length > CHECK_REF_MAX,
    checkIds: checkIds.slice(0, CHECK_MAX), checksCapped: checkIds.length > CHECK_MAX, checkTotal: checkIds.length };
}

// the touched screens a door's data may name, as the text instr looks for: "<id without screen:>" with its JSON quotes, at most
// CALLER_MAX (a slot left empty binds a string no data holds)
export const CALLER_MAX = 8;
export const callerArgs = (screens) => { const q = screens.slice(0, CALLER_MAX).map((x) => JSON.stringify(String(x).replace(/^screen:/, ""))); while (q.length < CALLER_MAX) q.push("\u0000"); return q; };
// callersOf(rows, screens) -> [{from_id, to_id}]: the doors whose data.screens really names a touched screen (the instr match
// checked), one link per door and screen
export function callersOf(rows, screens) {
  const want = new Set(screens.slice(0, CALLER_MAX));
  const out = [];
  for (const r of rows || []) for (const s of jsonList(r.dscreens)) { const id = /^screen:/.test(String(s)) ? String(s) : "screen:" + s; if (want.has(id)) out.push({ from_id: String(r.from_id), to_id: id }); }
  return out;
}
// dataLinks(row) -> the node ids a touched node's own data names: a door's screens (screen:<id>), a screen's apis (door:<METHOD>:<path>,
// the importer's door id: tools/import/model.mjs)
const jsonList = (v) => { if (v == null || v === "") return []; try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } };
export function dataLinks(n) {
  const out = [];
  for (const s of jsonList(n && n.dscreens)) if (typeof s === "string" && s.trim()) out.push(/^screen:/.test(s) ? s.trim() : "screen:" + s.trim());
  for (const a0 of jsonList(n && n.apis)) {
    const a = typeof a0 === "string" ? a0.trim() : a0 && typeof a0 === "object" && a0.verb && a0.path ? `${a0.verb} ${a0.path}` : "";
    const m = /^([A-Z]+)\s+(\S+)$/.exec(a);
    if (m) out.push(`door:${m[1]}:${m[2]}`);
  }
  return out;
}

const TYPE_WORD = { surface: ["app", "apps"], lane: ["lane", "lanes"], screen: ["screen", "screens"], door: ["door", "doors"], table: ["table", "tables"],
  entity: ["entity", "entities"], flow: ["flow", "flows"], gap: ["gap", "gaps"], dep: ["dependency", "dependencies"], evidence: ["evidence", "evidence"],
  service: ["service", "services"], architecture: ["architecture", "architecture"] };
export const typeWord = (t, n) => (TYPE_WORD[t] || [String(t || "node"), String(t || "node") + "s"])[n === 1 ? 0 : 1];
const byType = (list) => { const m = {}; for (const n of list) m[n.type] = (m[n.type] || 0) + 1; return m; };
const nodeHref = (id) => orgPath(`/map?node=${encodeURIComponent(id)}`);

// planReach(input, rows1, second, rows2) -> the reach (pure):
//   { touched: { total, byType, names: [{ id, type, name, href }], unknown, unwalked },
//     reached: { total, byType, names: [{ id, type, name, href }], more, capped },
//     checks: { total, graded, capped }, goals: [{ id, title, href }], questions: [{ qid, question, href }], asks: [{ qid, question, href }],
//     capped: [plain words, one per cap hit] }
export function planReach(input, rows1, second, rows2) {
  const capped = [];
  const nodes = (rows1.nodes || []).map((r) => ({ id: String(r.id), type: String(r.type), name: String(r.name ?? r.id) }));
  // a node the items themselves file is touched too, marked new (the model does not hold it yet)
  for (const id of input.T) if (input.filing && input.filing.has(id) && !nodes.some((n) => n.id === id)) nodes.push({ id, ...input.filing.get(id), isNew: true });
  const known = new Set(nodes.map((n) => n.id));
  const goalNames = new Map((rows1.goals || []).map((g) => [String(g.id), String(g.title ?? g.id)]));
  const qNames = new Map((rows1.questions || []).map((q) => [String(q.qid), String(q.question ?? q.qid)]));
  // a touched ref that is not a node: a goal or a question a check names, or a ref nothing in the model holds yet
  const unknown = input.T.filter((r) => !known.has(r) && !goalNames.has(r) && !qNames.has(r));
  if (input.unwalked) capped.push(`${input.unwalked} more touched refs were not walked (the first ${REF_MAX} were)`);
  const reachedRows = new Map((rows2.reached || []).map((r) => [String(r.id), { id: String(r.id), type: String(r.type), name: String(r.name ?? r.id) }]));
  const reachedNodes = second.reachedIds.map((id) => reachedRows.get(id)).filter(Boolean);
  const reachedUnread = Math.max(0, second.reachedAll - second.reachedIds.length);
  if (second.inCapped) capped.push(`more than ${IN_MAX} links into the touched nodes; the first ${IN_MAX} were read`);
  if (reachedUnread) capped.push(`${reachedUnread} more reached nodes were counted, not named`);
  if (second.refsCapped) capped.push(`more than ${CHECK_REF_MAX} check links name what is touched; the first ${CHECK_REF_MAX} were read`);
  if (second.checksCapped) capped.push(`more than ${CHECK_MAX} checks; the first ${CHECK_MAX} were read`);
  const ungraded = new Set((rows2.ungraded || []).map((r) => String(r.check_id)));
  const read = second.checkIds.length;
  const graded = second.checkIds.filter((id) => !ungraded.has(id)).length;
  // the goals: named directly by an item, then named by a check that names what is touched
  const goals = new Map();
  for (const id of input.goals) if (goalNames.has(id)) goals.set(id, goalNames.get(id));
  for (const g of rows2.checkGoals || []) if (!goals.has(String(g.id))) goals.set(String(g.id), String(g.title ?? g.id));
  for (const id of input.T) if (goalNames.has(id) && !goals.has(id)) goals.set(id, goalNames.get(id));
  const goalList = [...goals.entries()].slice(0, NAME_MAX).map(([id, title]) => ({ id, title, href: orgPath(`/goals/${encodeURIComponent(id)}`) }));
  const questions = input.questions.filter((q) => qNames.has(q)).map((qid) => ({ qid, question: qNames.get(qid), href: orgPath(`/question/${encodeURIComponent(qid)}`) }));
  const askRows = (rows1.asks || []);
  const asks = askRows.slice(0, NAME_MAX).map((q) => ({ qid: String(q.qid), question: String(q.question ?? q.qid), href: orgPath(`/question/${encodeURIComponent(String(q.qid))}`) }));
  if (askRows.length > NAME_MAX) capped.push(`more than ${NAME_MAX} open questions name what is touched`);
  return {
    touched: { total: nodes.length, byType: byType(nodes), names: nodes.slice(0, NAME_MAX).map((n) => ({ ...n, href: nodeHref(n.id) })), more: Math.max(0, nodes.length - NAME_MAX),
      unknown: unknown.slice(0, NAME_MAX), unwalked: input.unwalked },
    // countCapped (L4, added): the walk itself stopped at a cap (the links into the touched nodes), so the total is a floor ("N+")
    reached: { total: second.reachedAll, byType: byType(reachedNodes), names: reachedNodes.slice(0, NAME_MAX).map((n) => ({ ...n, href: nodeHref(n.id) })),
      more: Math.max(0, second.reachedAll - Math.min(NAME_MAX, reachedNodes.length)), unnamed: reachedUnread, countCapped: !!second.inCapped },
    checks: { total: second.checkTotal, read, graded, capped: second.checksCapped || second.refsCapped },
    // D1b item 14: the goals past the names shown are counted, never dropped ("46 goals", the first 25 named, "and 21 more")
    goals: goalList, goalsMore: Math.max(0, Math.max(goals.size, input.goalsAll || 0) - goalList.length), questions, asks, capped,
  };
}

export const EMPTY_REACH = Object.freeze({ touched: { total: 0, byType: {}, names: [], more: 0, unknown: [], unwalked: 0 }, reached: { total: 0, byType: {}, names: [], more: 0, unnamed: 0 },
  checks: { total: 0, read: 0, graded: 0, capped: false }, goals: [], questions: [], asks: [], capped: [] });

// readReach(env, project, collected) -> the reach (planReach), in two D1 batches. Nothing touched: no statement at all.
export async function readReach(env, project, collected) {
  const input = reachInput(collected);
  if (!project || (!input.T.length && !input.goals.length && !input.questions.length && !input.checks.length)) return { ...EMPTY_REACH, statements: 0 };
  const st = (sql, list) => db(env).prepare(sql).bind(project, J(list));
  const names = ["nodes", "out", "in", "refs", "goals", "questions", "asks", "callers"];
  const screens = input.T.filter((x) => /^screen:/.test(x));
  const lists = [input.T, input.T, input.T, input.named, [...new Set([...input.goals, ...input.T])], input.questions, input.named, screens];
  const want = names.map((n, i) => [n, lists[i]]).filter(([, l]) => l.length);
  const res1 = want.length ? await db(env).batch(want.map(([n, l]) => (n === "callers" ? db(env).prepare(REACH_SQL.callers).bind(project, ...callerArgs(l)) : st(REACH_SQL[n], l)))) : [];
  const rows1 = Object.fromEntries(want.map(([n], i) => [n, (res1[i] && res1[i].results) || []]));
  if (rows1.callers) rows1.callers = callersOf(rows1.callers, screens);
  const second = secondInput(input, rows1);
  const want2 = [["reached", second.reachedIds], ["ungraded", second.checkIds], ["checkGoals", second.checkIds.slice(0, CHECK_GOALS)]].filter(([, l]) => l.length);
  const res2 = want2.length ? await db(env).batch(want2.map(([n, l]) => st(REACH_SQL[n], l))) : [];
  const rows2 = Object.fromEntries(want2.map(([n], i) => [n, (res2[i] && res2[i].results) || []]));
  return { ...planReach(input, rows1, second, rows2), statements: want.length + want2.length };
}

// reachWords(reach) -> one plain line: "1 screen, 1 flow, 2 doors, 1 goal; 5 graded checks in question" (the text render's and
// the page's summary). Counts only.
export function reachWords(r) {
  if (!r) return "nothing in the model yet";
  const parts = [];
  const types = {};
  for (const [t, n] of Object.entries((r.touched && r.touched.byType) || {})) types[t] = (types[t] || 0) + n;
  for (const [t, n] of Object.entries((r.reached && r.reached.byType) || {})) types[t] = (types[t] || 0) + n;
  for (const [t, n] of Object.entries(types)) parts.push(`${n} ${typeWord(t, n)}`);
  const unnamed = (r.reached && r.reached.unnamed) || 0;
  if (unnamed) parts.push(`${unnamed} more node${unnamed === 1 ? "" : "s"}`);
  const g = (r.goals || []).length + (Number(r.goalsMore) || 0);
  if (g) parts.push(`${g} goal${g === 1 ? "" : "s"}`);
  const q = new Set([...(r.questions || []).map((x) => x.qid), ...(r.asks || []).map((x) => x.qid)]).size;
  if (q) parts.push(`${q} question${q === 1 ? "" : "s"}`);
  const c = r.checks || {};
  const head = parts.length ? parts.join(", ") : "nothing in the model yet";
  // a cap that was hit is said: the graded count is of the checks read
  const tail = c.capped && c.total ? `; ${c.total} or more checks, ${c.graded} graded of the first ${c.read}`
    : c.graded ? `; ${c.graded} graded check${c.graded === 1 ? "" : "s"} in question` : c.total ? `; ${c.total} check${c.total === 1 ? "" : "s"}, none graded` : "";
  return head + tail;
}
