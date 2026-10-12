// src/maprefs.js — the ids a contribution names, checked against the project's OWN Map (the one-pass fix 2 and 5, owner
// ruling 2026-10-01: "ids are checked against the project's own Map"). A contribution names screens (its `screens`, and a
// screen: ref in `touches`), components (`components`) and what it relies on (`depends`). Each is looked up in the project's
// model in D1 — never in a served register file a D1 project does not have:
//   a screen     a k_nodes row of type screen, by its id with or without "screen:", or by its exact name (case aside)
//   a component  a k_nodes row of any type by its id (a service, a door, a table, the architecture …), a part of the
//                architecture's diagram by its id, or a node by its exact name; the mind namespace (mind/*) stays valid
//   a depends    a node by its id or exact name, goal/<id> in the project's goal tree, q/<qid> a question of the project,
//                check/<id> a check of the project; a contribution's id (T-…) is not read (it may file in the same call)
// A ref that resolves is fine. One that does not is a fix the sender makes: the gate's verdict is needs, and the PREVIEW lists
// up to three near matches by name (resolver.near).
//
// COST: no read per ref. ONE statement (MAP_REFS_SQL) looks up every ref of the call by its key (k_nodes, k_questions and
// k_checks by their primary keys) and probes whether the Map holds any screen (one index row). Only when some ref misses, ONE
// more (MAP_NAMES_SQL) reads the id, type and name of the project's nodes of the types the misses could be (screens for a
// screen; services, doors, tables, deps, flows, entities and the architecture for a component or a node depends) and, when a
// component missed, the parts of the architecture's diagram: the exact-name match and the near matches come from it.
//
// AUTHORITY: every statement binds the ONE project the call files into (the door's own stamp, core.js doorProject), and the
// near matches are computed only when the caller asks (opts.near): src/preview.js asks after projectCallScope has held the
// caller to the project's read scope, so a near match never names a node of a project the caller may not read. k_nodes rows
// carry no role visibility (only docs, cards and card kinds do), so a reader of the project may read every node's name.
import { db } from "./data.js";

export const SCREEN_PREFIX = "screen:";
// the node types a component, or a node-form depends, may be (a screen is a screen's)
export const COMPONENT_TYPES = ["service", "door", "table", "entity", "dep", "flow", "architecture", "surface", "lane", "evidence", "gap"];
export const NEAR_MAX = 3;
export const NAMES_MAX = 2000;   // the miss statement's cap (a project's nodes of those types)

export const MAP_REFS_SQL =
  "SELECT 'n' AS k, id, type, name FROM k_nodes WHERE project = ?1 AND id IN (SELECT value FROM json_each(?2)) " +
  "UNION ALL SELECT 'q', qid, NULL, question FROM k_questions WHERE project = ?1 AND qid IN (SELECT value FROM json_each(?3)) " +
  "UNION ALL SELECT 'c', id, NULL, title FROM k_checks WHERE project = ?1 AND id IN (SELECT value FROM json_each(?4)) " +
  "UNION ALL SELECT 's', (SELECT id FROM k_nodes WHERE project = ?1 AND type = 'screen' LIMIT 1), NULL, NULL";
// the miss statement: the project's nodes of the types a missed ref could be (their exact names and the near matches), and,
// when a component missed its node id, the parts of the architecture's diagram (?3 = 1)
export const MAP_NAMES_SQL = `SELECT 'n' AS k, id, type, name FROM k_nodes WHERE project = ?1 AND type IN (SELECT value FROM json_each(?2)) ` +
  "UNION ALL SELECT 'a', json_extract(j.value, '$.id'), 'part', json_extract(j.value, '$.title') FROM k_nodes a, json_each(a.data, '$.diagram.nodes') j " +
  `WHERE ?3 = 1 AND a.project = ?1 AND a.type = 'architecture' LIMIT ${NAMES_MAX}`;

const listOf = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()) : String(v ?? "").split(",").map((x) => x.trim())).filter(Boolean);
const lower = (s) => String(s || "").toLowerCase();
const isMind = (c) => /^mind\//.test(c);
// refsOfBody(body) -> { screens, components, depends }: the refs ONE contribution names (raw, as sent)
export function refsOfBody(b) {
  const body = b && typeof b === "object" ? b : {};
  const touches = listOf(body.touches);
  return {
    screens: [...listOf(body.screens), ...touches.filter((t) => /^screen:/i.test(t))],
    components: listOf(body.components),
    depends: Array.isArray(body.depends) ? body.depends.map((d) => String(d).trim()).filter(Boolean) : [],
  };
}
// the ids a screen token may be: as sent, with "screen:" put in front, and both lowercased
const screenIds = (t) => { const s = String(t).trim(); const bare = s.replace(/^screen:/i, ""); return [...new Set([s, SCREEN_PREFIX + bare, s.toLowerCase(), SCREEN_PREFIX + bare.toLowerCase()])]; };
const dependForm = (r) => (/^T-\d{8}-\d{1,6}$/.test(r) ? "contribution" : /^goal\//.test(r) ? "goal" : /^q\//.test(r) ? "question" : /^check\//.test(r) ? "check" : "node");

// a small edit distance (two rows), for the near matches
function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// nearOf(token, pool) -> up to NEAR_MAX {id, name, type} from pool ([{id, type, name}]), the closest first: a containment
// either way (by the id without its type prefix, or by the name) ranks first, then the edit distance when it is small
export function nearOf(token, pool) {
  const t = lower(String(token).replace(/^[a-z]+:/i, ""));
  if (!t) return [];
  const scored = [];
  for (const n of pool || []) {
    const id = lower(String(n.id).replace(/^[a-z]+:/i, "")), name = lower(n.name);
    let score = null;
    if (id === t || name === t) score = 0;
    else if (id.includes(t) || t.includes(id) || (name && (name.includes(t) || t.includes(name)))) score = 1 + Math.abs(id.length - t.length) / 100;
    else { const d = Math.min(distance(t, id), name ? distance(t, name) : 99); if (d <= Math.max(2, Math.floor(t.length / 3))) score = 2 + d; }
    if (score != null) scored.push({ n, score });
  }
  scored.sort((a, b) => a.score - b.score || String(a.n.id).localeCompare(String(b.n.id)));
  return scored.slice(0, NEAR_MAX).map(({ n }) => ({ id: n.id, name: n.name, type: n.type }));
}

// resolveMapRefs(env, project, bodies, opts) -> the resolver for ONE project's contributions:
//   { screens(raw) -> {list, valid, reserved, unknown, ok}   (the shape the gate reads)
//     components(list) -> {available, ok, list, unknown}      (the gate's verifyComponents shape)
//     depends(list) -> {ok, unknown}
//     near(ref, what) -> [{id, name, type}]                   ([] unless opts.near)
//     rows: the rows the statements answered, statements: how many ran }
// opts: { near: boolean, goalIds: Set|Array (the project's goal ids, read already) }. A D1 error propagates (the filing
// cannot be graded without it).
export async function resolveMapRefs(env, project, bodies, opts = {}) {
  const want = { screens: new Set(), components: new Set(), depends: new Set() };
  for (const b of bodies || []) { const r = refsOfBody(b); r.screens.forEach((x) => want.screens.add(x)); r.components.forEach((x) => want.components.add(x)); r.depends.forEach((x) => want.depends.add(x)); }
  const goalIds = new Set(opts.goalIds || []);
  const nodeIds = new Set(), qids = new Set(), checkIds = new Set();
  for (const s of want.screens) screenIds(s).forEach((x) => nodeIds.add(x));
  for (const c of want.components) if (!isMind(c)) nodeIds.add(c);
  for (const d of want.depends) {
    const f = dependForm(d);
    if (f === "node") nodeIds.add(d);
    else if (f === "question") qids.add(d.slice(2));
    else if (f === "check") checkIds.add(d.slice(6));
  }
  const comps = [...want.components].filter((c) => !isMind(c));
  const out = { rows: 0, statements: 0 };
  const nodes = new Map(), parts = new Map(), questions = new Set(), checks = new Set();
  let mapHasScreens = false;
  const any = nodeIds.size || qids.size || checkIds.size || comps.length;
  if (project && any) {
    const res = (await db(env).prepare(MAP_REFS_SQL).bind(project, JSON.stringify([...nodeIds]), JSON.stringify([...qids]), JSON.stringify([...checkIds])).all()).results || [];
    out.statements++; out.rows += res.length;
    for (const r of res) {
      if (r.k === "n") nodes.set(r.id, r);
      else if (r.k === "q") questions.add(r.id);
      else if (r.k === "c") checks.add(r.id);
      else if (r.k === "s") mapHasScreens = r.id != null;
    }
  }
  // the hits by key; what is left misses its key and is looked for by name (and, for the preview, its near matches)
  const screenHit = (t) => screenIds(t).map((x) => nodes.get(x)).find((n) => n && n.type === "screen") || null;
  const compHit = (c) => isMind(c) || (nodes.has(c)) || parts.has(c);
  const depHit = (d) => { const f = dependForm(d); return f === "contribution" ? true : f === "goal" ? goalIds.has(d.slice(5)) : f === "question" ? questions.has(d.slice(2)) : f === "check" ? checks.has(d.slice(6)) : nodes.has(d); };
  const missScreens = [...want.screens].filter((s) => !screenHit(s));
  const missComps = comps.filter((c) => !nodes.has(c));
  const missDeps = [...want.depends].filter((d) => !depHit(d) && dependForm(d) === "node");
  const types = new Set();
  if (missScreens.length) types.add("screen");
  if (missComps.length || missDeps.length) { COMPONENT_TYPES.forEach((t) => types.add(t)); if (missDeps.length) types.add("screen"); }
  let pool = [];
  if (project && (types.size || missComps.length)) {
    const rows = (await db(env).prepare(MAP_NAMES_SQL).bind(project, JSON.stringify([...types]), missComps.length ? 1 : 0).all()).results || [];
    out.statements++; out.rows += rows.length;
    for (const r of rows) { if (r.k === "a") { if (r.id != null) parts.set(String(r.id), r); } else pool.push(r); }
  }
  const byName = new Map();
  for (const n of pool) { const k = `${n.type === "screen" ? "s" : "n"}|${lower(n.name)}`; if (n.name && !byName.has(k)) byName.set(k, n); }
  const nameHit = (t, screen) => byName.get(`${screen ? "s" : "n"}|${lower(t)}`) || (!screen ? byName.get(`s|${lower(t)}`) : null) || null;

  out.screens = (raw) => {
    const list = listOf(raw);
    const valid = [], unknown = [];
    for (const t of list) { const h = screenHit(t) || nameHit(t, true); if (h) valid.push(h.id); else unknown.push(t); }
    return { list, valid, reserved: [], unknown, ok: list.length > 0 && unknown.length === 0 };
  };
  out.components = (list) => {
    const l = listOf(list);
    const unknown = l.filter((c) => !compHit(c) && !nameHit(c, false));
    return { available: true, ok: unknown.length === 0, list: l, unknown };
  };
  out.depends = (list) => {
    const l = Array.isArray(list) ? list.map((d) => String(d).trim()).filter(Boolean) : [];
    const unknown = l.filter((d) => !depHit(d) && !(dependForm(d) === "node" && nameHit(d, false)));
    return { ok: unknown.length === 0, unknown };
  };
  out.near = (ref, what) => {
    if (!opts.near) return [];
    if (what === "screens") return nearOf(ref, pool.filter((n) => n.type === "screen"));
    if (what === "depends" && dependForm(ref) !== "node") return [];
    return nearOf(ref, what === "components" ? pool.filter((n) => n.type !== "screen") : pool);
  };
  out.mapHasScreens = mapHasScreens;
  return out;
}
