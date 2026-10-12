// engine/tools/import/model.mjs — the board's model (source/board/model.json) → `node` + `edge` ops. A node is
// { type, id: "<type>:<source id>" (safeId), name, status, data: the rest of the source row verbatim }. The door allows a
// status of live·planned·retired (a gap: open·closed); any other source status stays in data.status, the top-level status
// null. The door keys an edge by (from, to, kind): a second source edge on the same key folds into the first's data.also.
// The flows are filed by flows.mjs (the kit's flows source is this model's /flows). Every model section not mapped here
// is listed in notImported with its size — never dropped silently.
import { result, nodeId, capName, NODE_STATUSES, GAP_STATUSES, isObj } from "./common.mjs";
import { screenData } from "./renders.mjs";

// node type ← model.json section (op fields: type, id, name, status, data)
export const MODEL_NODES = {
  surface: "surfaces[] (strings) + surfaceLabels{} → name = the label",
  lane: "lanes[] {id, label→name, surface}",
  screen: "screens[] {id, name, status, …rest → data, standardized (renders.mjs screenData: surface, lane, step, states as names — the rows kept in stateDetails — and wireframe, the grammar from the source's layout fields)}",
  door: "api[] {id (= name, e.g. \"GET /home\"; id door:GET:/home), …rest → data}",
  table: "tables[] {name (= id and name), …rest → data}",
  entity: "entities[] {id, label→name, status (confirmed… → data.status), …rest}",
  gap: "gaps.{missingLinks,ambiguities,unknowns}[] {id (= name), what, retired, retiredBy} → status closed if retired else open, data.class = the list",
  dep: "deps.chains[] → id dep:<head.qid>, name = head.title, data = the chain verbatim",
  evidence: "evidence[] {key → id (and data.key), what → name, ref, lane, outcome, proof → data}",
  service: "architecture.services[] {id, name, owner, cost, uses}",
  architecture: "architecture minus its services → ONE node architecture:main, data {summary, diagram, crossing} verbatim",
};
// edge kind ← source (op fields: from, to, kind, label, data)
export const MODEL_EDGES = {
  nav: "edges[] {from, to} screen → screen, label, data {inferred, derived}",
  relation: "relations[] {from, to} entity → entity, label = verb, data {fromTable, toTable, card, derived}",
  reads: "api[].tables.read[] door → table",
  writes: "api[].tables.write[] door → table",
  depends: "deps.chains[].dependsOn[] dep → dep",
  blocks: "deps.chains[].blocks[] dep → dep",
};
const CONSUMED = new Set(["surfaces", "surfaceLabels", "lanes", "screens", "edges", "flows", "entities", "relations", "tables", "api", "gaps", "deps", "evidence", "architecture", "rulings", "vision"]);

export function mapModel(src) {
  const r = result();
  r.notImported = [];
  const m = src.board && src.board.model;
  if (!m) { r.skip("node", (src.why && src.why.model) || (src.board ? "the board has no model.json" : "no build board — the brain files no model beyond its flows"), "-"); return r; }
  const ids = new Set();
  const node = (type, srcId, name, status, rest) => {
    r.count("node");
    if (srcId == null || srcId === "") { r.skip("node", `${type}: a row with no id`, "?"); return; }
    const id = nodeId(type, srcId);
    if (ids.has(id)) { r.skip("node", `${type}: a duplicate id (the first row wins)`, id); return; }
    ids.add(id);
    const data = { ...rest };
    let st = null;
    const allowed = type === "gap" ? GAP_STATUSES : NODE_STATUSES;
    if (status != null && status !== "") {
      if (allowed.includes(status)) st = status;
      else { data.status = status; r.note("node", `${type}: status "${status}" is not a status the door takes for a ${type} — kept in data.status`); }
    }
    r.add("node", { type, id, name: capName(name == null || name === "" ? String(srcId) : name, data, r), status: st, data });
  };
  const arr = (v) => (Array.isArray(v) ? v : []);

  for (const s of arr(m.surfaces)) node("surface", s, (m.surfaceLabels || {})[s], null, {});
  for (const { id, label, ...rest } of arr(m.lanes)) node("lane", id, label, null, rest);
  // a screen's data in the standard (docs/plan/ARCHITECTURE.md §11): its states' names, its wireframe (renders.mjs)
  for (const { id, name, status, ...rest } of arr(m.screens)) node("screen", id, name, status, screenData({ id, name }, rest, src));
  for (const { id, ...rest } of arr(m.api)) node("door", id, id, null, rest);
  for (const { name, ...rest } of arr(m.tables)) node("table", name, name, null, rest);
  for (const { id, label, status, ...rest } of arr(m.entities)) node("entity", id, label, status, rest);
  for (const cls of ["missingLinks", "ambiguities", "unknowns"]) {
    for (const { id, ...rest } of arr(m.gaps && m.gaps[cls])) node("gap", id, id, rest.retired ? "closed" : "open", { ...rest, class: cls });
  }
  for (const c of arr(m.deps && m.deps.chains)) node("dep", c.head && c.head.qid, c.head && c.head.title, null, c);
  for (const { key, what, ...rest } of arr(m.evidence)) node("evidence", key, what, null, { key, ...rest });
  for (const { id, name, ...rest } of arr(m.architecture && m.architecture.services)) node("service", id, name, null, rest);
  const { services: _services, ...arch } = isObj(m.architecture) ? m.architecture : {};
  if (Object.keys(arch).length) node("architecture", "main", "Architecture", null, arch);

  const edges = new Map();   // "from|to|kind" -> the op's data
  const edge = (kind, from, to, label, data) => {
    r.count("edge");
    if (!ids.has(from) || !ids.has(to)) { r.skip("edge", `${kind}: an endpoint is not a node (${!ids.has(from) ? from.split(":")[0] : to.split(":")[0]})`, `${from} > ${to}`); return; }
    const k = `${from}|${to}|${kind}`;
    const prev = edges.get(k);
    if (prev) { (prev.data.also ||= []).push({ label: label ?? null, ...data }); r.note("edge", `${kind}: a second edge on the same (from, to, kind) folds into the first's data.also`); return; }
    const e = { from, to, kind, label: label ?? null, data: data ?? {} };
    edges.set(k, e);
    r.add("edge", e);
  };
  for (const { from, to, label, ...rest } of arr(m.edges)) edge("nav", nodeId("screen", from), nodeId("screen", to), label, rest);
  // a relation joins two entities; a row that names no entity (bunny: from/to "") joins the two tables it names instead
  for (const { from, to, verb, ...rest } of arr(m.relations)) {
    const byTable = !from && !to && rest.fromTable && rest.toTable;
    if (byTable) r.note("edge", "relation: a row that names no entity (from/to empty) joins its two tables (fromTable → toTable)");
    edge("relation", byTable ? nodeId("table", rest.fromTable) : nodeId("entity", from), byTable ? nodeId("table", rest.toTable) : nodeId("entity", to), verb, rest);
  }
  for (const a of arr(m.api)) {
    for (const t of arr(a.tables && a.tables.read)) edge("reads", nodeId("door", a.id), nodeId("table", t), null, {});
    for (const t of arr(a.tables && a.tables.write)) edge("writes", nodeId("door", a.id), nodeId("table", t), null, {});
  }
  for (const c of arr(m.deps && m.deps.chains)) {
    const from = nodeId("dep", c.head && c.head.qid);
    for (const q of arr(c.dependsOn)) edge("depends", from, nodeId("dep", q), null, {});
    for (const q of arr(c.blocks)) edge("blocks", from, nodeId("dep", q), null, {});
  }

  // what the model holds and this importer does not map (the report lists each, with its size)
  const size = (v) => (Array.isArray(v) ? `${v.length} rows` : isObj(v) ? `${Object.keys(v).length} keys` : typeof v === "string" ? `${v.length} chars` : String(v));
  for (const [k, v] of Object.entries(m)) if (!CONSUMED.has(k)) r.notImported.push({ what: `model.json /${k} (${size(v)})`, why: "no knowledge kind holds it (not a node, edge, question, check or card)" });
  for (const k of ["source", "cheapest", "counts"]) if (m.deps && k in m.deps) r.notImported.push({ what: `model.json /deps/${k}`, why: "derived from the chains (filed as dep nodes + depends/blocks edges); the Map derives cheapest and counts on read" });
  for (const k of Object.keys(m.vision || {})) if (k !== "mission") r.notImported.push({ what: `model.json /vision/${k} (${size(m.vision[k])})`, why: "only /vision/mission is the aim (the kit's kit.aim pointer)" });
  return r;
}
