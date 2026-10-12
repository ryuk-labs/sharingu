// src/knowledge/canvas.js — the project's model (k_nodes, k_edges) as the Map draws it. canvasOf assembles the canvas shape
// the Map's renderers read — { surfaces, surfaceLabels, lanes, screens, edges, flows, entities, relations, tables, api,
// architecture, gaps, deps } — the inverse of the importer's mappers (tools/import/model.mjs, flows.mjs): a node's data is
// its source row, its id "<type>:<source id>", and a second edge on the same (from, to, kind) rides in the first's
// data.also. A caller names the parts it draws: each node type and edge kind is read once per request (one statement for
// whatever this request has not read yet, memoized under "knowledge:", which the write door forgets), so a plane reads its
// own rows only. nodeAt reads one node and the edges on it, both ways.
// (No import of schema.js here: it imports decisions.js, which reaches this module through the store.)
import { db } from "../data.js";
import { reqMemo, REQ_MEMO } from "../reqmemo.js";
import { ARCH_MARKS_SQL, ARCH_MARK_IDS } from "../hotsql.js";
import { isD1Quota } from "../util.js";

export const GAP_CLASSES = ["missingLinks", "ambiguities", "unknowns"];
// part -> the node types and edge kinds it is built from
export const PARTS = {
  surfaces: { types: ["surface"] },
  lanes: { types: ["lane"] },
  screens: { types: ["screen"] },
  edges: { types: ["screen"], kinds: ["nav"] },
  flows: { types: ["flow"] },
  entities: { types: ["entity"] },
  relations: { types: ["entity"], kinds: ["relation"] },
  tables: { types: ["table"] },
  api: { types: ["door"] },
  architecture: { types: ["architecture", "service"] },
  gaps: { types: ["gap"] },
  deps: { types: ["dep"], kinds: ["depends", "blocks"] },
};
export const ALL_PARTS = Object.keys(PARTS);

// the id rule the importer files with (tools/import/common.mjs safeId): a space becomes ":", any other character a node id
// refuses "_"
export const safeId = (s) => String(s).replace(/ /g, ":").replace(/[^A-Za-z0-9._:/+#@{}-]/g, "_");
// the map names a door "api"; every other node type by its own name
const TYPE_OF_KIND = { api: "door" };
const KIND_OF_TYPE = { door: "api" };
export const typeOfKind = (kind) => TYPE_OF_KIND[kind] || kind;
export const kindOfType = (type) => KIND_OF_TYPE[type] || type;
// nodeIdOf(kind, src) -> the id the importer gives the node the map names kind:src ("api", "GET /x" -> "door:GET:/x")
export const nodeIdOf = (kind, src) => safeId(`${typeOfKind(kind)}:${src}`);
// stripType(id) -> an id without a leading "<type>:" (a node's type is a lowercase word)
export const stripType = (id) => { const m = /^[a-z]+:(.+)$/.exec(String(id)); return m ? m[1] : String(id); };
// a node's full name (a name over the door's cap is cut; its full text stays in data.name)
export const fullName = (n) => (typeof n.data.name === "string" ? n.data.name : n.name);
// srcIdOf(node) -> the id the map shows: the node's id without its "<type>:" prefix; a door's is its name (the route
// "METHOD /path", which the id writes with ":" for the space)
export function srcIdOf(n) {
  if (n.type === "door") return fullName(n);
  const p = n.type + ":";
  return n.id.startsWith(p) ? n.id.slice(p.length) : n.id;
}
export const mapRefOf = (n) => `${kindOfType(n.type)}:${srcIdOf(n)}`;

const obj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const parse = (s) => { if (s == null) return {}; try { const v = JSON.parse(s); return obj(v) ? v : {}; } catch { return {}; } };
const qs = (n) => Array(n).fill("?").join(", ");
// each type's (kind's) rows in filing order: the index's own order (project, type, rowid), so no sort runs
export const NODES_SQL = (n) => `SELECT id, type, name, status, data, created_at, updated_at FROM k_nodes WHERE project = ? AND type IN (${qs(n)}) ORDER BY type, rowid`;
export const EDGES_SQL = (n) => `SELECT from_id, to_id, kind, label, data, updated_at FROM k_edges WHERE project = ? AND kind IN (${qs(n)}) ORDER BY kind, rowid`;
export const NODE_SQL = "SELECT id, type, name, status, data, updated_at FROM k_nodes WHERE project = ? AND id IN (?, ?)";
// a node's edges: the ones from it (the primary key) and the ones to it (idx_k_edges_to), two seeks, each with its other end
export const NODE_EDGES_SQL = "SELECT e.from_id, e.to_id, e.kind, e.label, e.data, e.updated_at, o.type AS o_type, o.name AS o_name, " +
  "json_extract(o.data, '$.name') AS o_full FROM (SELECT rowid AS rid, from_id, to_id, kind, label, data, updated_at FROM k_edges WHERE project = ?1 AND from_id = ?2 " +
  "UNION ALL SELECT rowid AS rid, from_id, to_id, kind, label, data, updated_at FROM k_edges WHERE project = ?1 AND to_id = ?2 AND from_id <> ?2) e " +
  "LEFT JOIN k_nodes o ON o.project = ?1 AND o.id = (CASE WHEN e.from_id = ?2 THEN e.to_id ELSE e.from_id END) ORDER BY e.rid LIMIT 200";
const nodeRow = (r) => ({ id: String(r.id), type: String(r.type), name: String(r.name ?? ""), status: r.status ?? null, data: parse(r.data), at: r.updated_at ?? "", bornAt: r.created_at ?? "" });
const edgeRow = (r) => ({ from: String(r.from_id), to: String(r.to_id), kind: String(r.kind), label: r.label ?? null, data: parse(r.data), at: r.updated_at ?? "" });

// readBy(env, project, "node"|"edge", keys) -> one row list per key (a node type or an edge kind), in filing order
function readBy(env, project, what, keys) {
  const key = (k) => `knowledge:${project}:canvas:${what}:${k}`;
  const memo = env && env[REQ_MEMO];
  const missing = memo instanceof Map ? keys.filter((k) => !memo.has(key(k))) : keys;
  let batch = null;
  const load = () => (batch ||= db(env).prepare((what === "node" ? NODES_SQL : EDGES_SQL)(missing.length)).bind(project, ...missing).all().then((r) => {
    const by = new Map(missing.map((k) => [k, []]));
    for (const row of r.results || []) { const x = what === "node" ? nodeRow(row) : edgeRow(row); const list = by.get(what === "node" ? x.type : x.kind); if (list) list.push(x); }
    return by;
  }));
  return Promise.all(keys.map((k) => reqMemo(env, key(k), () => load().then((by) => by.get(k) || []))));
}

// v: a stamp of the rows an answer was built from (it moves when one of them changes, is added or is removed)
function stampOf(rowLists) {
  let h = 2166136261, n = 0;
  for (const [tag, list] of rowLists) for (const r of list) {
    const s = `${tag}|${r.id ?? `${r.from}|${r.to}|${r.kind}`}|${r.at}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    n++;
  }
  return n ? h.toString(16).padStart(8, "0") : "0";
}

// canvasOf(env, project, parts) -> { v, canvas, refs, empty }: the canvas holds exactly the parts asked (default all);
// refs maps each map ref read ("screen:home", "api:GET /x") to its node id; empty: no node in the parts read
export async function canvasOf(env, project, parts = ALL_PARTS) {
  const want = (Array.isArray(parts) ? parts : ALL_PARTS).filter((p) => PARTS[p]);
  const types = [...new Set(want.flatMap((p) => PARTS[p].types))];
  const kinds = [...new Set(want.flatMap((p) => PARTS[p].kinds || []))];
  const [nl, el] = project ? await Promise.all([types.length ? readBy(env, project, "node", types) : [], kinds.length ? readBy(env, project, "edge", kinds) : []]) : [[], []];
  const byType = new Map(types.map((t, i) => [t, nl[i] || []])), byKind = new Map(kinds.map((k, i) => [k, el[i] || []]));
  const out = assemble(want, byType, byKind);
  // M4: the architecture part carries its marks (the lights, the stale checks, when each part last changed), read once
  // (the stamp moves with them, so an answer cached by its stamp never keeps an old light)
  if (project && out.canvas.architecture) {
    const marks = out.canvas.architecture.marks = await archMarksOf(env, project, out.canvas.architecture, byType.get("service") || []);
    const lit = Object.entries(marks).filter(([, m]) => m.light !== "grey" || m.stale || m.changedBy).map(([id, m]) => ({ id, at: `${m.light}|${m.stale}|${m.changedAt}` }));
    if (lit.length) out.v = stampOf([["v", [{ id: out.v, at: "" }]], ["m", lit]]);
  }
  return out;
}

// ---- M4 (sprint 4): the Arch view's marks ----
// archIdsOf(architecture) -> the ids the diagram's marks are read for: each drawn part's own id (the first ARCH_NODES_MAX, as
// src/archview.js archModel keeps them) and the service node each names ("service:<id>"); a diagram with no part drawn is drawn
// from its services, so then the services' nodes. At most ARCH_MARK_IDS.
export const ARCH_NODES_MAX = 160;
export function archIdsOf(arch) {
  const d = obj(arch && arch.diagram) ? arch.diagram : {};
  const parts = list(d.nodes).filter((n) => obj(n) && typeof n.id === "string" && n.id.trim() !== "").slice(0, ARCH_NODES_MAX);
  const ids = new Set();
  for (const n of parts) { ids.add(String(n.id)); if (typeof n.service === "string" && n.service.trim() !== "") ids.add(nodeIdOf("service", n.service)); }
  if (!parts.length) for (const sv of list(arch && arch.services).slice(0, ARCH_NODES_MAX)) if (obj(sv) && sv.id) ids.add(nodeIdOf("service", sv.id));
  return [...ids].slice(0, ARCH_MARK_IDS);
}
// archMarksOf(env, project, architecture, serviceRows) -> { [id]: { light, failing, stale, staleChecks, changedAt, changedBy } }:
// ONE statement (src/hotsql.js ARCH_MARKS_SQL) for the diagram's ids, memoized per request. When a part last CHANGED is the newest
// of two stamps the model already holds or reads here: its service node's updated_at (the canvas read above holds the row: a
// part is not a row of its own, the service it runs on is) and its stale row's changed_at (migrate-054 keeps the newest
// contribution naming a graded node there, read by this same statement). The ledger by what a contribution touches has no
// index, so the newest contribution naming an ungraded part is not read. A database without migrate-043 or 054 marks nothing;
// a quota error propagates.
export async function archMarksOf(env, project, arch, serviceRows = []) {
  const ids = archIdsOf(arch);
  if (!ids.length) return {};
  const rows = await reqMemo(env, `knowledge:${project}:arch-marks:${ids.join("\u0001")}`, async () => {
    try { return (await db(env).prepare(ARCH_MARKS_SQL).bind(project, JSON.stringify(ids)).all()).results || []; }
    catch (e) { if (isD1Quota(e)) throw e; if (/no such (table|index)/.test(String((e && e.message) || e))) return []; throw e; }
  });
  const pair = (v) => { const [id, ...t] = String(v).split("\u001f"); return { id, title: t.join(" ") }; };
  const marks = {};
  const want = new Set(ids);
  for (const r of serviceRows) if (want.has(r.id)) { const changed = r.at && r.bornAt && String(r.at) > String(r.bornAt); marks[r.id] = { light: "grey", failing: null, stale: 0, staleChecks: [], changedAt: changed ? String(r.at) : null, changedBy: null }; }
  for (const r of rows) {
    const id = String(r.id), m = marks[id] || { light: "grey", failing: null, stale: 0, staleChecks: [], changedAt: null, changedBy: null };
    m.light = r.light ? String(r.light) : "grey";
    m.failing = r.failing ? pair(r.failing) : null;
    m.stale = Number(r.stale) || 0;
    m.staleChecks = r.stale_checks ? String(r.stale_checks).split("\u001e").map(pair) : [];
    if (r.changed_at && (!m.changedAt || String(r.changed_at) > m.changedAt)) { m.changedAt = String(r.changed_at); m.changedBy = r.changed_by ? String(r.changed_by) : null; }
    marks[id] = m;
  }
  return marks;
}

// assemble(want, byType, byKind) -> { v, canvas, refs, empty }: the parts asked, built from rows already read (byType: node
// type -> nodeRow list, byKind: edge kind -> edgeRow list). src/knowledge/mapmodel.js builds its flows, gaps and dependency
// chains here from its own compact read, so the Map and the planes derive them one way.
export function assemble(want, byType, byKind) {
  const nodes = (t) => byType.get(t) || [];
  const edges = (k) => byKind.get(k) || [];
  const src = new Map(), refs = new Map();
  let count = 0;
  for (const list of byType.values()) for (const n of list) { src.set(n.id, srcIdOf(n)); refs.set(mapRefOf(n), n.id); count++; }
  const srcOf = (id) => (src.has(id) ? src.get(id) : stripType(id));
  const canvas = {};
  for (const p of want) BUILD[p](canvas, { nodes, edges, srcOf });
  return { v: stampOf([...[...byType].map(([t, l]) => ["n:" + t, l]), ...[...byKind].map(([k, l]) => ["e:" + k, l])]), canvas, refs, empty: count === 0 };
}

const without = (d, ...keys) => { const o = { ...d }; for (const k of keys) delete o[k]; return o; };
const statusOf = (n) => n.status ?? n.data.status ?? null;
const withStatus = (row, st) => (st == null ? row : { ...row, status: st });
const list = (v) => (Array.isArray(v) ? v : []);
// unfold(edges, make) -> one row per edge, then one per edge the importer folded into its data.also
function unfold(es, make) {
  const out = [];
  for (const e of es) {
    const { also, ...d } = e.data;
    out.push(make(e, d, e.label));
    for (const a of list(also)) { if (!obj(a)) continue; const { label, ...ad } = a; out.push(make(e, ad, label ?? null)); }
  }
  return out;
}

const BUILD = {
  surfaces(c, { nodes }) {
    c.surfaces = nodes("surface").map(srcIdOf);
    c.surfaceLabels = Object.fromEntries(nodes("surface").map((n) => [srcIdOf(n), fullName(n)]));
  },
  lanes(c, { nodes }) { c.lanes = nodes("lane").map((n) => ({ id: srcIdOf(n), label: fullName(n), ...without(n.data, "name") })); },
  screens(c, { nodes }) { c.screens = nodes("screen").map((n) => withStatus({ id: srcIdOf(n), name: fullName(n), ...without(n.data, "name", "status") }, statusOf(n))); },
  edges(c, { edges, srcOf }) { c.edges = unfold(edges("nav"), (e, d, label) => ({ from: srcOf(e.from), to: srcOf(e.to), label, ...d })); },
  flows(c, { nodes }) { c.flows = nodes("flow").map((n) => withStatus({ id: srcIdOf(n), name: fullName(n), ...without(n.data, "name", "status") }, statusOf(n))); },
  entities(c, { nodes }) { c.entities = nodes("entity").map((n) => withStatus({ id: srcIdOf(n), label: fullName(n), ...without(n.data, "name", "status") }, statusOf(n))); },
  relations(c, { nodes, edges, srcOf }) {
    // a relation joins two entities; the Data plane draws it between their tables (the source's fromTable/toTable, else the
    // entity's own table, else the entity)
    const tableOf = new Map(nodes("entity").map((n) => [n.id, typeof n.data.table === "string" && n.data.table ? n.data.table : srcIdOf(n)]));
    const tab = (id) => tableOf.get(id) ?? srcOf(id);
    c.relations = unfold(edges("relation"), (e, d, label) => ({ from: srcOf(e.from), to: srcOf(e.to), ...d, fromTable: d.fromTable ?? tab(e.from), toTable: d.toTable ?? tab(e.to), verb: label }));
  },
  tables(c, { nodes }) { c.tables = nodes("table").map((n) => withStatus({ name: srcIdOf(n), ...without(n.data, "name", "status") }, statusOf(n))); },
  api(c, { nodes }) { c.api = nodes("door").map((n) => withStatus({ id: srcIdOf(n), ...without(n.data, "name", "status") }, statusOf(n))); },
  architecture(c, { nodes }) {
    const a = nodes("architecture")[0];
    c.architecture = { ...(a ? without(a.data, "name", "services") : {}), services: nodes("service").map((n) => ({ id: srcIdOf(n), name: fullName(n), ...without(n.data, "name") })) };
  },
  gaps(c, { nodes }) {
    c.gaps = Object.fromEntries(GAP_CLASSES.map((k) => [k, []]));
    for (const n of nodes("gap")) {
      const d = n.data;
      const cls = GAP_CLASSES.includes(d.class) ? d.class : "unknowns";
      c.gaps[cls].push({ id: srcIdOf(n), ...without(d, "class", "name"), what: typeof d.what === "string" ? d.what : fullName(n),
        retired: n.status === "closed" || (n.status == null && d.retired === true) });
    }
  },
  deps(c, { nodes, edges, srcOf }) {
    const by = (k) => { const m = new Map(); for (const e of edges(k)) { if (!m.has(e.from)) m.set(e.from, []); m.get(e.from).push(srcOf(e.to)); } return m; };
    const dependsOf = by("depends"), blocksOf = by("blocks");
    const union = (a, b) => [...new Set([...list(a).map(String), ...(b || [])])];
    const chains = nodes("dep").map((n) => {
      const d = n.data;
      const blocks = union(d.blocks, blocksOf.get(n.id));
      return { ...without(d, "name"), head: obj(d.head) ? d.head : { qid: srcIdOf(n), kind: null, state: null, title: fullName(n), severity: null, whoOwes: null },
        schema: list(d.schema), doors: list(d.doors), surfaces: list(d.surfaces), dependsOn: union(d.dependsOn, dependsOf.get(n.id)), blocks, blocking: blocks.length > 0 };
    });
    // the owner's cheapest move: the open questions the owner answers that reach a surface or block a ruling, by reach
    const reach = (x) => x.surfaces.length + x.blocks.length;
    const moves = chains.filter((x) => x.head.kind === "question" && x.head.whoOwes === "owner" && reach(x) > 0)
      .sort((a, b) => reach(b) - reach(a) || String(a.head.qid).localeCompare(String(b.head.qid)));
    const ids = (xs) => new Set(xs.flatMap((x) => x.surfaces.map((s) => s && s.id))).size;
    c.deps = { chains,
      cheapest: { qids: moves.map((x) => x.head.qid), surfaces: ids(moves), blocks: new Set(moves.flatMap((x) => x.blocks)).size, door: "POST /respond" },
      counts: { chains: chains.length, blocking: chains.filter((x) => x.blocking).length, questions: chains.filter((x) => x.head.kind === "question").length,
        rulings: chains.filter((x) => x.head.kind === "ruling").length, surfaces: ids(chains) } };
  },
};

// nodeAt(env, project, kind, src) -> { node, edges, v } | null: the node the map names kind:src (its importer id, else src as
// its own id, of the right type) and every edge on it, both ways, each with the node at its other end ({ id, type, ref,
// name }: its name comes in NODE_EDGES_SQL's own join, never a read per edge; null when no node is filed there)
export async function nodeAt(env, project, kind, src) {
  if (!project) return null;
  const type = typeOfKind(kind);
  const cand = nodeIdOf(kind, src);
  const rows = ((await db(env).prepare(NODE_SQL).bind(project, cand, String(src)).all()).results || []).map(nodeRow).filter((n) => n.type === type);
  const node = rows.find((n) => n.id === cand) || rows[0];
  if (!node) return null;
  const es = ((await db(env).prepare(NODE_EDGES_SQL).bind(project, node.id).all()).results || []).map((r) => {
    const e = edgeRow(r);
    const otherId = e.from === node.id ? e.to : e.from;
    const other = r.o_type ? { id: otherId, type: String(r.o_type), name: String(r.o_name ?? ""), data: typeof r.o_full === "string" ? { name: r.o_full } : {} } : null;
    return { ...e, other: { id: otherId, type: other ? other.type : null, ref: other ? mapRefOf(other) : otherId, name: other ? fullName(other) : null } };
  });
  return { node, edges: es, v: stampOf([["n", [node]], ["e", es]]) };
}
