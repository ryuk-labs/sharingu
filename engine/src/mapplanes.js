// src/mapplanes.js — the Map's planes served on GET /map/:plane: the DOOR planes (wireframes wf-map-api and wf-map-mcp;
// artboards MapApi.dc.html and MapMcp.dc.html), the MODEL planes (wf-map-arch and wf-map-data; MapArch.dc.html and
// MapData.dc.html) and the FLOW planes (wf-map-flows and wf-map-deps; MapFlows.dc.html and MapDeps.dc.html). A plane that
// describes the door you are calling reads the worker's OWN registries in-process (API from CAPABILITIES, MCP from
// MCP_TOOLS, the contract from the gate-diffed src/doorcontract.js); a plane that describes THE MODEL reads the project's
// model in D1 (src/knowledge/canvas.js, its own parts only): Arch its architecture node and services, Data its tables and
// relations, Flows its flows, Deps its dependency chains (the cheapest move and the counts derived from them); API adds each
// route's screens and tables from the project's doors. The seven planes, in order: Arch · System · Data · API · MCP · Flows ·
// Deps; one org worker; this repo's build scripts are not a product lane; Brand v2 decides tokens, the artboard regions;
// EMPTY names the op that fills it; BEHIND comes from the shell's own head poll.
//
// ONE seam, three faces: GET /map/:plane (JSON to a script; a browser gets the Map page opened on that plane's layers or
// view, src/mappage.js, which reads the arch and mcp planes here for its Arch and MCP views), the MCP `map {plane}` tool and
// the resource template brain://map/{plane} all answer readMapPlane(env, reader, plane, registries, opts).
// Nothing on the page is typed: every row and every count is read off the registries or the project's model at request
// time.
//
// Reads beyond the request baseline: a model plane one or two statements (its node types, and its edge kinds when it has
// any); mcp exactly ONE, its workspace-shelf (src/broadcastread.js equippedHere, GET /broadcast's own statement); arch also
// the shell's own two (the reader's seats and the org's active project count, reg.seats and reg.activeCount), which the
// page hands to the shell so they are never read twice. The org worker's name is the org's own (its row: src/tenant.js, the
// request's memo the shell reads too; sprint 6, 6.3: the worker's name is the platform's, never the org's). R2: the versions spine's head brings `version`; on data, whether
// the pack declares the `schema` download.
import { readCanvas, versionOf } from "./mapnode.js";
import { projectOf } from "./project.js";
import { isD1Quota } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { toolCallable } from "./mcp.js";
import { shelvesHere } from "./broadcastread.js";
import { getTenantConfig } from "./tenant.js";

// the planes this worker serves, in Q60A19A32 order (System is /map itself, UI-B7b; arch and data UI-B8b; api and mcp UI-B8a;
// flows and deps UI-B9): all seven. A plane not listed here answers 404 unknown_plane.
export const PLANES = [
  { key: "arch", label: "Arch", href: "/map/arch" },
  { key: "system", label: "System", href: "/map" },
  { key: "data", label: "Data", href: "/map/data" },
  { key: "api", label: "API", href: "/map/api" },
  { key: "mcp", label: "MCP", href: "/map/mcp" },
  { key: "flows", label: "Flows", href: "/map/flows" },
  { key: "deps", label: "Deps", href: "/map/deps" },
];
export const SERVED_PLANES = PLANES.filter((p) => p.href.startsWith("/map/")).map((p) => p.key);
export const PLANE_REGIONS = { arch: ["lanes", "seam", "org-worker", "crossing-rules"], data: ["table-list", "er-diagram", "inspector"],
  api: ["routes", "contract-note"], mcp: ["mcp-tools", "workspace-shelf", "global-presets"],
  flows: ["swimlanes", "lane-legend"], deps: ["chains", "cheapest-move"] };
// the model planes read the project's model (src/knowledge/canvas.js): an empty region draws a short phrase; a failed read
// is 503 unreadable
export const MODEL_PLANES = ["arch", "data", "flows", "deps"];
// the parts of the model each plane reads (api: its doors, for each route's screens and tables; mcp none)
export const PLANE_PARTS = { arch: ["architecture"], data: ["tables", "relations"], api: ["api"], mcp: [], flows: ["flows"], deps: ["deps"] };
export const SEAM_DOOR = "contracts/door.json";
export const CONTRACT_NOTE = "The contract is generated, never typed: tools/make-door-contract.py reads this worker's own registries (the routes above and the MCP tools) plus contracts/door.declared.json, writes contracts/door.json and src/doorcontract.js, and the gate regenerates and diffs both. GET /contract serves the same file.";

// argsOf(schema) -> ["ref", "gap?"]: the tool's inputSchema properties, the optional ones marked "?"
export function argsOf(schema) {
  const props = Object.keys((schema && schema.properties) || {});
  const req = new Set(Array.isArray(schema && schema.required) ? schema.required : []);
  return props.map((a) => (req.has(a) ? a : a + "?"));
}
// a 302 alias is retired: its `does` says 302 (the registry's own words), every other row is landed
export const routeChip = (does) => (String(does || "").includes("302") ? "retired" : "landed");

// ---- the model planes' reads off the project's canvas (pure) ----
const inRect = (n, g) => Number(n.x) >= Number(g.x) && Number(n.y) >= Number(g.y) && Number(n.x) < Number(g.x) + Number(g.w) && Number(n.y) < Number(g.y) + Number(g.h);
const nodeOf = (n) => ({ id: String(n.id || ""), kind: String(n.kind || ""), title: String(n.title || ""), sub: String(n.sub || "") });
// lanesOf(architecture) -> [{id, label, product, nodes}]: one lane per diagram group, its nodes the ones that name it
// (data.diagram.nodes[].group) or, for a node that names none, the ones drawn inside it; the product lane is the group
// that holds the worker (kind "worker"), every other group is product:false. Read off the diagram, never typed. (The Arch
// view, src/archview.js archModel, places the same way and gives a node in no group a band named by its kind.)
export function lanesOf(arch) {
  const d = (arch && arch.diagram) || {};
  const groups = Array.isArray(d.groups) ? d.groups : [], nodes = Array.isArray(d.nodes) ? d.nodes : [];
  const ids = new Set(groups.filter((g) => g && g.id).map((g) => String(g.id)));
  return groups.filter((g) => g && g.id).map((g) => {
    const ns = nodes.filter((n) => n && (typeof n.group === "string" && ids.has(n.group) ? n.group === String(g.id) : inRect(n, g)));
    return { id: String(g.id), label: String(g.label || g.id), product: ns.some((n) => n.kind === "worker"), nodes: ns.map(nodeOf) };
  });
}
// dataNodesOf(architecture) -> the diagram's data nodes (D1, R2, KV): what the one org worker holds
export const dataNodesOf = (arch) => (Array.isArray(arch && arch.diagram && arch.diagram.nodes) ? arch.diagram.nodes : []).filter((n) => n && n.kind === "data").map(nodeOf);
// tableRow(t) -> the table-list row: the canvas's own columns (pk, fk -> ref, null), indexes, doors and the rulings on it
export function tableRow(t) {
  return { name: String(t.name), cols: Array.isArray(t.cols) ? t.cols : [], indexes: Array.isArray(t.indexes) ? t.indexes : null,
    readBy: Array.isArray(t.readBy) ? t.readBy : [], writtenBy: Array.isArray(t.writtenBy) ? t.writtenBy : [],
    rulingImpl: (Array.isArray(t.rulingImpl) ? t.rulingImpl : []).filter((r) => r && r.qid).map((r) => ({ qid: String(r.qid), implStatus: r.implStatus ?? null })) };
}
// relationRow(r) -> {from, to, kind, verb, card}: kind is the relation's `derived` field (fk: an FK boot.sql declares; any
// other derivation is a convention, drawn dashed)
export const relationRow = (r) => ({ from: String(r.fromTable || r.from || ""), to: String(r.toTable || r.to || ""), kind: r.derived === "fk" ? "fk" : "convention",
  verb: r.verb ?? null, card: r.card ?? null });

// ---- the flow planes' reads off the project's canvas (pure) ----
// legendOf(flows) -> the distinct step actors in first-seen order: one lane per actor (D4)
export function legendOf(flows) {
  const out = [];
  for (const f of Array.isArray(flows) ? flows : []) for (const st of (f && Array.isArray(f.steps) ? f.steps : [])) if (st && st.actor && !out.includes(st.actor)) out.push(st.actor);
  return out;
}
// unbuiltOf(flows) -> the flows not retired and not built end to end (endToEnd.built false)
export const unbuiltOf = (flows) => (Array.isArray(flows) ? flows : []).filter((f) => f && f.status !== "retired" && !(f.endToEnd && f.endToEnd.built)).length;

// ---- readMapPlane(env, reader, plane, { capabilities, tools, seats?, activeCount? }, { table? }) -> { status, body } ----
// Errors: 401 auth_required · 404 unknown_plane (any plane not served) · 503 unreadable (arch, data, flows or deps: the D1
// read of the model failed, UNREACHABLE on glass) · 404 unknown_table (data, a ?table= the project's model does not hold).
// An empty model is 200 with empty regions. A door plane never fails on the model: it only adds each route's screens and
// tables when the read answers.
// reg.seats(reader) -> the reader's own seats and reg.activeCount() -> the org's active project count are the shell's own
// two reads (arch only); absent, the org worker reads no seat and no project.
export async function readMapPlane(env, reader, plane, reg = {}, opts = {}) {
  if (!reader) return { status: 401, body: { error: "auth_required" } };
  const key = String(plane || "");
  if (!SERVED_PLANES.includes(key)) return { status: 404, body: { error: "unknown_plane", plane: key.slice(0, 40), planes: SERVED_PLANES } };
  const model = MODEL_PLANES.includes(key);
  const parts = PLANE_PARTS[key] || [];
  const quota = (e) => { if (isD1Quota(e)) throw e; };
  const [cvr, version, project] = await Promise.all([
    parts.length ? readCanvas(env, parts).then((cv) => ({ cv }), (e) => { quota(e); return { cv: null, down: true }; }) : Promise.resolve({ cv: null }),
    versionOf(env),
    projectOf(env).catch(() => null),
  ]);
  const cv = cvr.cv;
  if (model && cvr.down) return { status: 503, body: { error: "unreadable", plane: key } };
  const head = { plane: key, project, planes: PLANES.map((p) => ({ ...p, href: orgPath(p.href) })), model: cv ? { v: cv.v } : null, version };
  if (key === "arch") {
    const arch = (cv.canvas && cv.canvas.architecture) || {};
    const [seats, active, tenant] = await Promise.all([
      typeof reg.seats === "function" ? reg.seats(reader).then((x) => (Array.isArray(x) ? x : []), () => []) : Promise.resolve([]),
      typeof reg.activeCount === "function" ? reg.activeCount().then((n) => Number(n) || 0, () => 0) : Promise.resolve(0),
      getTenantConfig(env),
    ]);
    const crossing = Array.isArray(arch.crossing) ? arch.crossing : [];
    return { status: 200, body: { ...head, stamp: { counts: { workers: 1, projects: active } },
      regions: {
        lanes: lanesOf(arch),
        seam: { door: SEAM_DOOR, counts: { rest: (reg.capabilities || []).length, tools: (reg.tools || []).length } },
        "org-worker": { name: String((tenant.brand && tenant.brand.org) || ""), data: dataNodesOf(arch), projects: seats.map((x) => ({ key: x.key, name: x.name || x.key })), active },   // U-MCP D11 (Q93B3F368): projects, not workspaces
        "crossing-rules": crossing,
      } } };
  }
  if (key === "data") {
    const tables = (Array.isArray(cv.canvas && cv.canvas.tables) ? cv.canvas.tables : []).filter((t) => t && t.name).map(tableRow);
    const want = opts.table != null && opts.table !== "" ? String(opts.table) : null;
    const pick = want != null ? tables.find((t) => t.name === want) : tables[0];
    if (want != null && !pick) return { status: 404, body: { error: "unknown_table", table: want.slice(0, 80), tables: tables.map((t) => t.name) } };
    const relations = (Array.isArray(cv.canvas && cv.canvas.relations) ? cv.canvas.relations : []).filter((r) => r && (r.fromTable || r.from)).map(relationRow);
    return { status: 200, body: { ...head, stamp: { counts: { tables: tables.length } },
      regions: { "table-list": tables, "er-diagram": relations, inspector: pick || null } } };
  }
  if (key === "flows") {
    // swimlanes IS the project's flows (every row, every field, in filing order): the plane reshapes nothing
    const flows = Array.isArray(cv.canvas && cv.canvas.flows) ? cv.canvas.flows : [];
    return { status: 200, body: { ...head, stamp: { counts: { flows: flows.length, unbuilt: unbuiltOf(flows) } },
      regions: { swimlanes: flows, "lane-legend": legendOf(flows) } } };
  }
  if (key === "deps") {
    // chains IS the project's dependency chains; the cheapest move and the counts are derived from them (src/knowledge/canvas.js)
    const d = cv.canvas && cv.canvas.deps && typeof cv.canvas.deps === "object" ? cv.canvas.deps : {};
    return { status: 200, body: { ...head, stamp: { counts: d.counts && typeof d.counts === "object" ? d.counts : {} },
      regions: { chains: Array.isArray(d.chains) ? d.chains : [], "cheapest-move": d.cheapest ?? null } } };
  }
  if (key === "api") {
    const capi = new Map();
    for (const a of Array.isArray(cv && cv.canvas && cv.canvas.api) ? cv.canvas.api : []) if (a && a.id) capi.set(String(a.id), a);
    const routes = (reg.capabilities || []).map((c) => {
      const a = capi.get(`${c.m} ${c.p}`);
      return { method: c.m, path: c.p, auth: c.auth, does: c.does, chip: routeChip(c.does), screens: a ? (a.screens ?? null) : null, tables: a ? (a.tables ?? null) : null };
    });
    return { status: 200, body: { ...head, stamp: { counts: { routes: routes.length } },
      regions: { routes, "contract-note": { text: CONTRACT_NOTE, door: "GET /contract" } } } };
  }
  const tools = (reg.tools || []).map((t) => ({ name: t.name, args: argsOf(t.schema), desc: t.desc, owner: !!t.owner, write: !!t.write, callable: toolCallable(t, reader) }));
  const sh = await shelvesHere(env, reader);
  return { status: 200, body: { ...head, stamp: { counts: { tools: tools.length } },
    regions: { "mcp-tools": tools, "workspace-shelf": sh.here, "global-presets": sh.starter } } };
}
