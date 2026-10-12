// src/knowledge/mapmodel.js — the Map's ONE read of the project's model (the main tab, sprint 2): every node the canvas
// draws, every link between them and the lights of the lit ones, in three statements of at most one row per node each:
//   1. MODEL_NODES_SQL  k_nodes of the drawn types (idx_k_nodes_type), the fields the layout needs projected in SQL, never
//      a node's whole data except a flow's, a dependency chain's and a gap's (the Map derives its playback, its chains and
//      its walk from them, through canvas.js assemble, the planes' own derivation);
//   2. MODEL_LINKS_SQL  k_node_links (migrate-043): each node's edges out, one row per node that has any;
//   3. MODEL_LIT_SQL    k_node_lights (migrate-043): the drawn nodes whose light is not grey, one probe each into the
//      partial index of lit rows (a grey node costs nothing), the ids bound LIT_CHUNK at a time (in parallel).
// Beside the filed edges, the links the model's own rows carry (D1 too, read in statement 1): a door's screens and a
// screen's apis (calls), an entity's table (stored), a dependency chain's surfaces, doors and tables (reaches), a screen's
// surface (on). On a database migrate-043 has not reached, the links come from k_edges and the lights from the checks
// (the same answers, more rows). A failed read throws (the caller's UNREACHABLE).
import { db } from "../data.js";
import { assemble, safeId, nodeIdOf, srcIdOf, mapRefOf } from "./canvas.js";
import { countsFor, lightOf, countsOfRow } from "./checks.js";
import { staleMarks, staleSince, staleCountOf } from "./stale.js";
import { isD1Quota } from "../util.js";

// the node types the canvas draws (a lane names a group of screens; a flow is played over the screens and doors)
export const MODEL_TYPES = ["surface", "lane", "screen", "door", "table", "entity", "flow", "dep", "gap"];
const TYPES_SQL = MODEL_TYPES.map((t) => `'${t}'`).join(", ");
export const MODEL_NODES_SQL = "SELECT id, type, name, status, updated_at, json_extract(data, '$.name') AS full, json_extract(data, '$.status') AS dstatus, " +
  "json_extract(data, '$.surface') AS surface, json_extract(data, '$.lane') AS lane, json_extract(data, '$.group') AS grp, " +
  "json_extract(data, '$.band') AS band, json_extract(data, '$.bandName') AS band_name, json_extract(data, '$.scope') AS scope, " +
  "json_extract(data, '$.table') AS tbl, CASE type WHEN 'door' THEN json_extract(data, '$.access') END AS access, " +
  "CASE type WHEN 'door' THEN json_extract(data, '$.screens') END AS screens, " +
  "CASE type WHEN 'screen' THEN json_extract(data, '$.apis') END AS apis, " +
  "CASE type WHEN 'screen' THEN json_extract(data, '$.api') END AS api, " +
  "CASE WHEN type IN ('flow', 'dep', 'gap') THEN data END AS body " +
  `FROM k_nodes WHERE project = ?1 AND type IN (${TYPES_SQL}) ORDER BY type, rowid`;
export const MODEL_LINKS_SQL = "SELECT node_id, links FROM k_node_links WHERE project = ?1";
// the live status of the questions heading the dependency chains (D1b item 15), by k_questions' primary key
export const DEP_HEADS_SQL = "SELECT qid, status FROM k_questions WHERE project = ?1 AND qid IN (SELECT value FROM json_each(?2))";
// depOpen(node, live) -> is this chain an open decision now: its head is a question that is open (live status first; a qid not
// filed in the project keeps the state the chain was filed with). A ruling's chain (a ruling not built) is never open.
export function depOpen(n, live) {
  if (n.headKind && n.headKind !== "question") return false;
  const s = n.qid && live && live.has(n.qid) ? live.get(n.qid) : String(n.headState || "");
  return /^(open|provisional)$/i.test(s);
}
// the same rows off k_edges, on a database before migrate-043
export const MODEL_LINKS_DERIVED_SQL = "SELECT from_id AS node_id, json_group_array(json_array(to_id, kind)) AS links FROM k_edges WHERE project = ?1 GROUP BY from_id";
// the lit rows of the ids asked, bound as parameters (a json_each list would count every id as a row read): one statement per
// LIT_CHUNK ids (D1 binds at most 100 parameters), each id one probe into the partial index of lit rows
// A model of more than LIT_PROBES_MAX drawn ids reads the project's lit rows in one scan of that index instead (its rows:
// the project's lit refs), so a big model never runs more than five statements for its lights.
export const LIT_CHUNK = 90, LIT_PROBES_MAX = 450;
// (INDEXED BY: the primary key would answer the same probes but read the grey rows too, one per drawn node that has checks)
export const MODEL_LIT_SQL = (n) => `SELECT node_id, green, red, amber, grey FROM k_node_lights INDEXED BY idx_k_node_lights_lit WHERE project = ?1 AND light <> 'grey' AND node_id IN (${Array.from({ length: n }, (_, i) => "?" + (i + 2)).join(", ")})`;
// D2b item 10: INDEXED BY the partial index of lit rows: left to itself the planner took idx_k_node_lights_at (project) and
// read every light row of the project, the grey ones too (389 rows on saruspay's Map for 0 lit)
export const MODEL_LIT_ALL_SQL = "SELECT node_id, green, red, amber, grey FROM k_node_lights INDEXED BY idx_k_node_lights_lit WHERE project = ?1 AND light <> 'grey'";
// GET /map/lights?since=: the rows that changed after a moment (idx_k_node_lights_at), at most LIGHTS_POLL_MAX
export const LIGHTS_POLL_MAX = 200;
export const LIGHTS_SINCE_SQL = `SELECT node_id, green, red, amber, grey, updated_at FROM k_node_lights WHERE project = ?1 AND updated_at > ?2 ORDER BY updated_at LIMIT ${LIGHTS_POLL_MAX + 1}`;

const noTable = (name) => (e) => new RegExp(`no such table: ${name}`).test(String((e && e.message) || e));
const parse = (s) => { if (s == null || s === "") return null; try { return JSON.parse(s); } catch { return null; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? null : String(v));
// surfacesOf(v) -> the apps a screen belongs to: data.surface a key, or (D1b item 20) a list of keys (read as its JSON text)
export function surfacesOf(v) {
  if (v == null || v === "") return [];
  const s = String(v);
  if (s.startsWith("[")) { const a = parse(s); return Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))] : []; }
  return [s];
}

// flowRefsOf(nodeId, steps) -> the refs a flow's checks name (R1): the flow node, then each step's screen and door, by the
// importer's own id rule (the one mapModelOf resolves the steps by); src/regrade.js regrades this set, the Map counts its stale
export function flowRefsOf(nodeId, steps) {
  const out = new Set(nodeId ? [String(nodeId)] : []);
  for (const s0 of arr(steps)) {
    const s = typeof s0 === "string" ? { screen: s0 } : s0 && typeof s0 === "object" ? s0 : {};
    if (s.screen) out.add(safeId(`screen:${s.screen}`));
    if (s.door) out.add(nodeIdOf("api", s.door));
  }
  return [...out];
}

// mapModelOf(env, project) -> { project, v, nodes, links, flows, deps, gaps, lanes, surfaceLabels, lit }
//   nodes: [{ id, type, ref, name, status, surface, lane, group, band, bandName, scope, table, path, light, counts? }] in
//          filing order per type
//   links: [[fromId, toId, kind]], deduplicated, both ends drawn nodes
//   flows: [{ id, ref, name, status, audience, desc, steps: [{ node, door, actor, text }] }] (node / door: a node id or null)
//   deps:  canvas.js's chains, cheapest move and counts · gaps: the open gaps [{ id, what, gapKind }]
export async function mapModelOf(env, project) {
  if (!project) return emptyModel(null);
  const rows = (await db(env).prepare(MODEL_NODES_SQL).bind(project).all()).results || [];
  let linkRows;
  try { linkRows = (await db(env).prepare(MODEL_LINKS_SQL).bind(project).all()).results || []; }
  catch (e) { if (!noTable("k_node_links")(e)) throw e; linkRows = (await db(env).prepare(MODEL_LINKS_DERIVED_SQL).bind(project).all()).results || []; }
  const m = modelFromRows(project, rows, linkRows);
  // D1b item 15: a dependency chain is an OPEN decision only while the question heading it is open NOW (the chain's head state
  // is a snapshot from when it was filed: sharingu's Map showed 45 "open decisions", 4 open). One statement on k_questions'
  // primary key, the dep heads' qids only; a qid not in the project keeps the filed state.
  const depQ = [...new Set(m.nodes.filter((n) => n.type === "dep" && n.qid).map((n) => n.qid))].slice(0, 400);
  if (depQ.length) {
    const live = new Map((((await db(env).prepare(DEP_HEADS_SQL).bind(project, JSON.stringify(depQ)).all()) || {}).results || []).map((r) => [String(r.qid), String(r.status || "")]));
    for (const n of m.nodes) if (n.type === "dep") n.open = depOpen(n, live);
  }
  // the lights of the drawn nodes (and the flows'): the lit ones only
  const ids = m.nodes.map((n) => n.id).concat(m.flows.map((f) => f.nodeId));
  const lit = new Map();
  if (ids.length) {
    try {
      let res;
      if (ids.length > LIT_PROBES_MAX) res = [await db(env).prepare(MODEL_LIT_ALL_SQL).bind(project).all()];
      else {
        const chunks = [];
        for (let k = 0; k < ids.length; k += LIT_CHUNK) chunks.push(ids.slice(k, k + LIT_CHUNK));
        res = await Promise.all(chunks.map((c) => db(env).prepare(MODEL_LIT_SQL(c.length)).bind(project, ...c).all()));
      }
      const drawnIds = new Set(ids);
      for (const r of res) for (const x of (r && r.results) || []) if (drawnIds.has(String(x.node_id))) lit.set(String(x.node_id), countsOfRow(x));
    } catch (e) {
      if (isD1Quota(e) || !(noTable("k_node_lights")(e) || /no such index: idx_k_node_lights_lit/.test(String((e && e.message) || e)))) throw e;
      const c = await countsFor(env, project, ids);
      for (const [id, v] of c) if (v && v.graded) lit.set(id, v);
    }
  }
  // the stale marks (sprint 3, B4; migrate-054): the nodes changed after some of their checks were graded, one statement over
  // the project's stale rows only (idx_k_node_stale_on), 0 rows read while nothing is stale
  const marks = ids.length ? await staleMarks(env, project) : new Map();
  for (const n of m.nodes) { const c = lit.get(n.id); n.light = c ? lightOf(c) : "grey"; if (c) n.counts = c; const z = marks.get(n.id); if (z && z.stale) n.stale = z.stale; }
  for (const f of m.flows) { const c = lit.get(f.nodeId); f.light = c ? lightOf(c) : "grey"; }
  // R1: each flow's stale checks (the ones naming the flow or a screen or door of its steps: flowRefsOf above, the
  // set its Regrade press regrades), one more statement only while some node of the project is stale
  if (m.flows.length && marks.size) {
    const z = await staleCountOf(env, project, m.flows.map((f) => flowRefsOf(f.nodeId, f.steps.map((s) => ({ screen: s.screen, door: s.doorName })))));
    m.flows.forEach((f, i) => { if (z[i]) f.stale = z[i]; });
  }
  m.lit = lit.size;
  return m;
}

export function emptyModel(project) {
  return { project, v: "0", nodes: [], links: [], flows: [], deps: { chains: [], cheapest: null, counts: {} }, gaps: [], lanes: {}, surfaceLabels: {}, lit: 0 };
}

// modelFromRows(project, rows, linkRows) -> the model (pure: the node rows of MODEL_NODES_SQL and the link rows of
// MODEL_LINKS_SQL, in their read order). Exported for the selftest.
export function modelFromRows(project, rows, linkRows) {
  const byType = new Map(MODEL_TYPES.map((t) => [t, []]));
  const full = [];
  for (const r of rows) {
    const t = String(r.type);
    const node = { id: String(r.id), type: t, name: String(r.name ?? ""), status: r.status ?? null, data: {}, at: r.updated_at ?? "" };
    if (typeof r.full === "string") node.data.name = r.full;
    const body = r.body != null ? parse(r.body) : null;
    if (body && typeof body === "object" && !Array.isArray(body)) node.data = body;
    full.push({ r, node });
    if (byType.has(t)) byType.get(t).push(node);
  }
  const lanes = {}, surfaceLabels = {};
  for (const n of byType.get("lane")) lanes[srcIdOf(n)] = n.data.name || n.name;
  for (const n of byType.get("surface")) surfaceLabels[srcIdOf(n)] = n.data.name || n.name;
  // the drawn nodes: every type but lane and flow (a lane is a group's label, a flow is played over the others); a retired
  // gap is not open work, so it is not drawn
  const nodes = [];
  const drawn = new Set();
  const openGapIds = new Set();
  const derived = assemble(["flows", "gaps"], byType, new Map());
  for (const k of Object.keys(derived.canvas.gaps || {})) for (const g of derived.canvas.gaps[k]) if (!g.retired) openGapIds.add(nodeIdOf("gap", g.id));
  for (const { r, node } of full) {
    const t = node.type;
    if (t === "lane" || t === "flow") continue;
    if (t === "gap" && !openGapIds.has(node.id)) continue;
    const n = { id: node.id, type: t, ref: mapRefOf(node), name: t === "door" ? srcIdOf(node) : String(node.data.name || node.name), status: str(node.status ?? r.dstatus) };
    if (t === "screen") Object.assign(n, { surface: surfacesOf(r.surface)[0] || null, ...(surfacesOf(r.surface).length > 1 ? { surfaces: surfacesOf(r.surface) } : {}), lane: str(r.lane), group: str(r.grp), band: str(r.band), bandName: str(r.band_name) });
    else if (t === "door") Object.assign(n, { group: str(r.grp), path: srcIdOf(node), access: typeof r.access === "string" ? r.access.slice(0, 80) : null });
    else if (t === "table") Object.assign(n, { scope: str(r.scope), group: str(r.grp) });
    else if (t === "entity") n.table = str(r.tbl);
    else if (t === "dep") { const h = node.data.head || {}; Object.assign(n, { name: `${h.qid || srcIdOf(node)}: ${h.title || node.name}`, headKind: str(h.kind), headState: str(h.state), severity: str(h.severity), qid: str(h.qid) }); }
    else if (t === "gap") Object.assign(n, { name: srcIdOf(node), gapClass: str(node.data.class) });
    nodes.push(n);
    drawn.add(n.id);
  }
  // the links: the filed edges (k_node_links), then the ones the rows carry
  const seen = new Set(), links = [];
  const add = (a, b, kind) => { if (!a || !b || a === b || !drawn.has(a) || !drawn.has(b)) return; const k = `${a}|${b}|${kind}`; if (seen.has(k)) return; seen.add(k); links.push([a, b, kind]); };
  const depEdges = { depends: [], blocks: [] };
  for (const lr of linkRows || []) {
    const from = String(lr.node_id);
    for (const e of arr(parse(lr.links))) {
      if (!Array.isArray(e) || e.length < 2) continue;
      const [to, kind] = [String(e[0]), String(e[1])];
      if (kind === "depends" || kind === "blocks") depEdges[kind].push({ from, to, kind, label: null, data: {}, at: "" });
      if (kind !== "flow-step") add(from, to, kind);
    }
  }
  for (const { r, node } of full) {
    if (node.type === "door") for (const s of arr(parse(r.screens))) add(nodeIdOf("screen", s), node.id, "calls");
    if (node.type === "screen") {
      for (const a0 of [...arr(parse(r.apis)), ...arr(parse(r.api))]) {
        const a = typeof a0 === "string" ? a0 : a0 && typeof a0 === "object" && a0.verb && a0.path ? `${a0.verb} ${a0.path}` : "";
        if (a.trim()) add(node.id, nodeIdOf("api", a.trim()), "calls");
      }
      for (const sf of surfacesOf(r.surface)) add(nodeIdOf("surface", sf), node.id, "on");   // D1b item 20: every app it belongs to
    }
    if (node.type === "entity" && r.tbl) add(node.id, nodeIdOf("table", r.tbl), "stored");
    if (node.type === "dep") {
      const d = node.data;
      for (const s of arr(d.surfaces)) if (s && s.id) add(node.id, nodeIdOf("screen", s.id), "reaches");
      for (const x of arr(d.doors)) if (x && x.id) add(node.id, nodeIdOf("api", x.id), "reaches");
      for (const x of arr(d.schema)) if (x && x.table) add(node.id, nodeIdOf("table", x.table), "reaches");
    }
  }
  // the chains with their filed depends/blocks edges (the planes' own derivation)
  const deps = assemble(["deps"], new Map([["dep", byType.get("dep")]]), new Map([["depends", depEdges.depends], ["blocks", depEdges.blocks]])).canvas.deps;
  // the flows, each step resolved to the node it names (the importer's own id rule: tools/import/flows.mjs)
  const flows = (derived.canvas.flows || []).map((f) => {
    const raw = Array.isArray(f.steps) && f.steps.length ? f.steps : arr(f.screenSteps);
    const steps = raw.map((s0) => {
      const s = typeof s0 === "string" ? { screen: s0 } : s0 && typeof s0 === "object" ? s0 : {};
      const scr = s.screen ? safeId(`screen:${s.screen}`) : null, door = s.door ? safeId(`door:${s.door}`) : null;
      return { node: scr && drawn.has(scr) ? scr : null, door: door && drawn.has(door) ? door : null, actor: str(s.actor), mode: str(s.mode),
        text: String(s.state || s.does || s.what || s.label || s.screen || s.door || "").slice(0, 400), does: s.state && s.does ? String(s.does).slice(0, 400) : null,
        screen: str(s.screen), doorName: str(s.door) };
    }).filter((s) => s.node || s.door || s.text);
    return { id: String(f.id), nodeId: nodeIdOf("flow", f.id), ref: "flow:" + f.id, name: String(f.name || f.id), status: str(f.status), audience: str(f.audience), desc: f.desc ? String(f.desc).slice(0, 600) : null, steps };
  });
  const gaps = [];
  for (const k of ["missingLinks", "ambiguities", "unknowns"]) for (const g of arr((derived.canvas.gaps || {})[k])) if (!g.retired) gaps.push({ id: String(g.id), what: String(g.what || ""), gapKind: { missingLinks: "missing-link", ambiguities: "ambiguity", unknowns: "unknown" }[k] });
  return { project, v: stampOf(rows, linkRows), nodes, links, flows, deps, gaps, lanes, surfaceLabels, lit: 0 };
}

// v: a stamp of the rows the model was built from (it moves when one changes, is added or is removed)
function stampOf(rows, linkRows) {
  let h = 2166136261, n = 0;
  const feed = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } n++; };
  for (const r of rows) feed(`${r.id}|${r.updated_at}`);
  for (const l of linkRows || []) feed(`${l.node_id}|${String(l.links || "").length}`);
  return n ? h.toString(16).padStart(8, "0") : "0";
}

// lightsSince(env, project, since) -> { at, lights: [{ id, light, counts }], more }: the rows of k_node_lights that changed
// after `since` (an ISO time), oldest first; at is the newest changed row's time (the next poll's since), else since.
export async function lightsSince(env, project, since) {
  const s = typeof since === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(since) ? since : "";
  if (!project) return { at: s, lights: [], stale: [], more: false };
  // the lights that moved, and (sprint 3, B4) the stale marks that moved: two indexed statements in one batch
  const [lr, sr] = await Promise.all([db(env).prepare(LIGHTS_SINCE_SQL).bind(project, s).all(), staleSince(env, project, s)]);
  const rows = (lr && lr.results) || [];
  const list = rows.slice(0, LIGHTS_POLL_MAX).map((r) => { const c = countsOfRow(r); return { id: String(r.node_id), light: lightOf(c), counts: c, at: String(r.updated_at) }; });
  // the next cursor: the later of the two lists' last moves, or, when either was cut at its cap, the earlier (so nothing between
  // them is skipped; the next poll reads the rest)
  const ends = [list.length ? list[list.length - 1].at : "", sr.stale.length ? sr.stale[sr.stale.length - 1].moved : ""].filter(Boolean);
  const cut = rows.length > LIGHTS_POLL_MAX || sr.more;
  const at = ends.length ? ends.reduce((a, b) => (cut ? (b < a ? b : a) : (b > a ? b : a))) : s;
  return { at, lights: list.map(({ at: _, ...x }) => x), stale: sr.stale.map(({ moved, ...x }) => x), more: rows.length > LIGHTS_POLL_MAX || sr.more };
}
