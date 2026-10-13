// src/mapnode.js — ONE node of the map (Map · System, wireframe wf-map-system). ONE seam, three faces: GET /map/node (JSON to
// a script, the inspector fragment to a browser), the MCP `map {ref}` tool and the resource template brain://map/node/{ref}
// all answer readMapNode(env, reader, q). The inspector has ONE renderer (renderInspector): the Map (src/mappage.js) draws
// it on first paint for ?node= and the HTML answer is the same string, which the page swaps in when a node is pinned.
// There is no client copy of it.
//
// Reads, for the request's project (project.js projectOf), all through src/knowledge/: the project's gaps (the walk), the
// node and every edge on it both ways (canvas.js nodeAt), its light (checks.js countsFor: the checks that name it and their
// latest grades), the goal tree on a goal ref and the relations on a table ref; beside them the questions whose
// `affects` name the node (knowledge/decisions.js questionsNaming, on migrate-078's k_question_refs) and the versions head. A screen also reads its last takes
// (M6, migrate-065: knowledge/screens.js screenTakes, ONE statement), the strip of previous pictures with its Restore press. A node's state is its light: green when
// every check that names it passes, red when one fails, amber when some are graded, grey when none is.
import { db } from "./data.js";
import { esc, stateChip } from "./ui.js";
import { questionsNaming } from "./knowledge/decisions.js";
import { versionHead } from "./knowledge/versions.js";
import { projectOf } from "./project.js";
import { isD1Quota } from "./util.js";
import { canvasOf, nodeAt, nodeIdOf, srcIdOf, fullName, GAP_CLASSES } from "./knowledge/canvas.js";
import { countsFor, sumCounts, lightOf } from "./knowledge/checks.js";
import { goalTree } from "./knowledge/goals.js";
import { staleFor, staleWords } from "./knowledge/stale.js";
import { screenTakes } from "./knowledge/screens.js";
import { drawWireframe } from "./wireframe.js";
import { renderUrl } from "./render.js";
import { store, hasStore, renderKey } from "./storage.js";   // sprint 6, 6.4: the org's objects
import { avatar } from "./parts.js";
import { seatsOnce } from "./core.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const GAP_ORDER = GAP_CLASSES;
const GAP_KIND = { missingLinks: "missing-link", ambiguities: "ambiguity", unknowns: "unknown" };
// the kinds a ref names: the map's five, then every other node type (a door is the map's "api")
export const NODE_KINDS = ["screen", "api", "table", "entity", "gap", "flow", "dep", "lane", "surface", "service", "architecture", "evidence"];
export const LAYER_OF = { screen: "surfaces", api: "doors", table: "data", entity: "data", gap: "gaps", goal: "goals" };
export const EDGE_CAP = 20;
export const LIGHTS = ["green", "amber", "red", "grey"];
export const MAP_EMPTY = 'No screen or entity is filed for this project yet, so the canvas has nothing to draw: file them through preview then save_knowledge (items of kind "node", type "screen" or "entity") and join them with items of kind "edge".';
export const MAP_DOWN = "The project's model could not be read, so nothing is drawn until it answers.";
export const NO_CARD = "No question tracks this node yet.";

// readCanvas(env, parts) -> { project, v, canvas, refs, empty }: the request's project's model (src/knowledge/canvas.js),
// the parts asked (default all). A failed read throws (the caller's UNREACHABLE).
export async function readCanvas(env, parts) {
  const project = await projectOf(env);
  return { project, ...(await canvasOf(env, project, parts)) };
}

// ---- M3 · links between systems: the project that owns a part ----
// ownersOf(env, reader, keys) -> Map(key -> { key, name, may }): the projects a node or the Arch view's parts name in ownedBy,
// by key, from the org's projects table (ONE statement, run only when a key is named; at most OWNERS_MAX keys), and whether
// the reader may read each: the rule the project switcher and doorProject keep (the owner: an active project; anyone else, a
// Partner too: one of their seats, which are active projects only; seatsOnce is the request's own read). Nothing of the other
// project is read. A key the table does not hold is its own name, never a link.
export const OWNERS_MAX = 24;
export const OWNERS_SQL = "SELECT key, name, active FROM projects WHERE key IN (SELECT value FROM json_each(?1)) AND org = {org}";
export async function ownersOf(env, reader, keys) {
  const want = [...new Set((Array.isArray(keys) ? keys : []).filter((k) => typeof k === "string" && k))].slice(0, OWNERS_MAX);
  const out = new Map();
  if (!want.length || !reader) return out;
  const [rows, seats] = await Promise.all([
    db(env).prepare(OWNERS_SQL).bind(JSON.stringify(want)).all().then((r) => r.results || []),
    reader.role === "owner" ? [] : seatsOnce(env, reader.id),
  ]);
  const seated = new Set((seats || []).map((x) => String(x.key)));
  const byKey = new Map(rows.map((r) => [String(r.key), r]));
  for (const key of want) {
    const r = byKey.get(key);
    out.set(key, { key, name: String((r && r.name) || key), may: !!r && Number(r.active) === 1 && (reader.role === "owner" || seated.has(key)) });
  }
  return out;
}
// ownerHref(key, id) -> the owning project's Map, finding the part by its id
// ownerLink(owner, id) -> { project, name, href }: the owner as a node's answer carries it; href only when the reader may read
// that project, else null
export const ownerHref = (key, id) => orgPath(`/map?project=${encodeURIComponent(key)}&find=${encodeURIComponent(id)}`);
export const ownerLink = (o, id) => ({ project: o.key, name: o.name, href: o.may ? ownerHref(o.key, id) : null });

// archOwnersOf(env, reader, architecture) -> the architecture part with `owners` {key: {name, may}} when a drawn part or a
// service names a project in ownedBy (the Arch view, src/archview.js archModel, names it on the part and links it when `may`);
// the part as it was when none does (no statement). A failed read draws the parts without their owners.
export async function archOwnersOf(env, reader, arch) {
  if (!arch || typeof arch !== "object") return arch;
  const list = (v) => (Array.isArray(v) ? v : []);
  const keys = [...list(arch.diagram && arch.diagram.nodes), ...list(arch.services)].map((x) => x && x.ownedBy).filter((k) => typeof k === "string" && k);
  if (!keys.length) return arch;
  const m = await ownersOf(env, reader, keys).catch((e) => { if (isD1Quota(e)) throw e; return null; });
  return m ? { ...arch, owners: Object.fromEntries([...m].map(([k, o]) => [k, { name: o.name, may: o.may }])) } : arch;
}

// ---- openGaps(canvas) -> [{ id, what, gapKind }]: the OPEN gaps, missingLinks -> ambiguities -> unknowns, never a retired one
export function openGaps(canvas) {
  const g = (canvas && canvas.gaps) || {};
  const out = [];
  for (const k of GAP_ORDER) for (const x of Array.isArray(g[k]) ? g[k] : []) if (x && x.id && !x.retired) out.push({ id: String(x.id), what: String(x.what || ""), gapKind: GAP_KIND[k] });
  return out;
}
function anyGap(canvas, id) {
  const g = (canvas && canvas.gaps) || {};
  for (const k of GAP_ORDER) for (const x of Array.isArray(g[k]) ? g[k] : []) if (x && String(x.id) === id) return { gap: x, gapKind: GAP_KIND[k] };
  return null;
}

// ---- the node, by ref ----
const refOf = (kind, id) => (kind === "goal" ? "goal/" : kind + ":") + id;
export function parseRef(ref) {
  const s = String(ref || "").trim();
  if (!s || s.length > 300) return null;
  const g = /^goal\/(.+)$/.exec(s);
  if (g) return { kind: "goal", id: g[1] };
  const m = /^([a-z]+):(.+)$/.exec(s);
  const kind = m && (m[1] === "door" ? "api" : m[1]);
  if (!m || !NODE_KINDS.includes(kind)) return null;
  return { kind, id: m[2] };
}
const edgesOut = (list) => { const seen = new Set(), out = []; for (const e of list) { if (!e || !e.ref || seen.has(e.ref)) continue; seen.add(e.ref); out.push(e); if (out.length >= EDGE_CAP) break; } return out; };
// refName(ref) -> what an edge's other end is called when no name was read for it: the ref's own id (a door's route, a
// table's name, a goal's or a question's id)
export const refName = (ref) => { const s = String(ref || ""); const m = /^(?:[a-z]+:|goal\/|q\/)(.+)$/.exec(s); return m ? m[1] : s; };
const uniq = (a) => [...new Set(a)];
const arr = (v) => (Array.isArray(v) ? v : []);

// buildNode(ctx) -> the node's answer body (without walk, model and version). Each edge is { ref, name, label }: name is the
// other end's NAME, from what this read already holds (the node at the other end, which NODE_EDGES_SQL joins in the same
// statement; a goal's title from the tree), else refName; never a read per edge.
function buildNode({ want, at, tree, rows, relations, counts, gaps }) {
  const ref = refOf(want.kind, want.id);
  const names = new Map();
  for (const e of at ? at.edges : []) if (e.other && e.other.name) names.set(e.other.ref, e.other.name);
  for (const x of tree) names.set("goal/" + x.id, x.title);
  const named = (list) => edgesOut(list).map((e) => ({ ref: e.ref, name: names.get(e.ref) || refName(e.ref), label: e.label }));
  const nodeId = at ? at.node.id : want.id;
  const tracked = rows.filter((r) => Array.isArray(r.affects) && (r.affects.includes(ref) || r.affects.includes(nodeId)));
  const trackedBy = tracked.map((r) => r.qid);
  const ruled = tracked.find((r) => r.status && r.status !== "open");
  const facts = { gapKind: null, trackedBy, ruledBy: ruled ? ruled.qid : null, blocks: uniq(tracked.flatMap((r) => Array.isArray(r.blocks) ? r.blocks : [])),
    implStatus: (tracked.find((r) => r.implStatus) || {}).implStatus || null, foundBy: null };
  const card = trackedBy.length ? { kind: "question", id: trackedBy[0] } : null;
  const light = lightOf(counts);
  const base = { ref, nodeId, kind: want.kind, layer: LAYER_OF[want.kind] || want.kind, state: light, checks: counts };
  if (want.kind === "goal") {
    const n = tree.find((x) => x.id === want.id);
    if (!n) return null;
    return { ...base, status: null, title: n.title, parent: n.parent ? "goal/" + n.parent : null, what: `A goal of the project's tree${n.parent ? `, under ${(tree.find((x) => x.id === n.parent) || { title: n.parent }).title}` : ", its root"}. Its percent is on Goals.`,
      facts, edges: { in: named(tree.filter((x) => x.parent === want.id).map((x) => ({ ref: "goal/" + x.id, label: "child goal" }))), out: named(n.parent ? [{ ref: "goal/" + n.parent, label: "parent goal" }] : []) }, card };
  }
  const node = at.node, d = node.data, src = srcIdOf(node);
  // the edges filed on the node (D1), then the ones its own row names
  const inE = [], outE = [];
  for (const e of at.edges) {
    const item = { ref: e.other.ref, label: String(e.label || e.kind) };
    if (e.to === node.id) inE.push(item);
    if (e.from === node.id) outE.push(item);
  }
  const status = node.status ?? d.status ?? null;
  // parent: a goal's parent goal; every other node has none, answered null as the goal root's is (the registry declares it)
  const body = (title, what, extra = {}) => ({ ...base, status, title: String(title ?? src), parent: null, what: String(what ?? ""), facts: { ...facts, ...extra.facts },
    edges: { in: named([...(extra.in || []), ...inE]), out: named([...(extra.out || []), ...outE]) }, card: extra.card !== undefined ? extra.card : card });
  if (want.kind === "gap") {
    const hit = anyGap(gaps, src);
    const g = hit ? hit.gap : { what: d.what ?? fullName(node), retiredBy: d.retiredBy, foundBy: d.foundBy };
    return { ...body(src, g.what, { facts: { gapKind: hit ? hit.gapKind : null, ruledBy: g.retiredBy ? String(g.retiredBy) : facts.ruledBy, foundBy: g.foundBy ? String(g.foundBy) : "the model" },
      in: trackedBy.map((q) => ({ ref: "q/" + q, label: "tracks" })) }), retired: hit ? !!hit.gap.retired : status === "closed" };
  }
  if (want.kind === "screen") {
    const because = d.plannedChange && Array.isArray(d.plannedChange.because) ? d.plannedChange.because : [];
    return body(fullName(node), d.purpose || d.route || "", { facts: { ruledBy: facts.ruledBy || (because[0] ? String(because[0]) : null), implStatus: facts.implStatus || (status ? String(status) : null) },
      out: arr(d.apis).map((a) => ({ ref: "api:" + a, label: "calls" })), card: card || (because[0] ? { kind: "question", id: String(because[0]) } : null) });
  }
  if (want.kind === "api") {
    const t = d.tables && typeof d.tables === "object" ? d.tables : {};
    return body(src, d.does || "", { facts: { implStatus: facts.implStatus || (d.access ? String(d.access) : null) },
      in: arr(d.screens).map((s) => ({ ref: "screen:" + s, label: "calls" })),
      out: [...arr(t.read).map((n) => ({ ref: "table:" + n, label: "reads" })), ...arr(t.write).map((n) => ({ ref: "table:" + n, label: "writes" }))] });
  }
  if (want.kind === "table") {
    const cols = arr(d.cols).length;
    return body(src, `${cols} ${cols === 1 ? "column" : "columns"}, scope ${d.scope || "org"}`,
      { out: relations.filter((r) => r && r.fromTable === src && r.toTable).map((r) => ({ ref: "table:" + r.toTable, label: String(r.verb || "relates") })) });
  }
  if (want.kind === "entity") return body(fullName(node), d.note || "", { out: d.table ? [{ ref: "table:" + d.table, label: "stored in" }] : [] });
  return body(fullName(node), d.desc || d.what || d.does || d.purpose || d.note || (d.head && d.head.title) || d.summary || "", { facts: { implStatus: facts.implStatus || (status ? String(status) : null) } });
}

// ---- readMapNode(env, reader, q, { draw }) -> { status, body } — draw: an HTML render (the takes strip's drawings) ----
// q = { ref?, gap? } (a URLSearchParams, the MCP arguments, or a plain object). Errors: 401 auth_required · 400 bad_ref ·
// 404 unknown_node (a ref the project's model does not hold, a goal not in its tree, a ?gap past the last open gap) ·
// 503 unreadable (the D1 read failed). The answer also carries `open` (the open-gap count) and `project` (the project read)
// BESIDE the body, for the inspector's walk bar and its Regrade press (R1); neither is in the shape.
export async function readMapNode(env, reader, q = {}, o = {}) {
  if (!reader) return { status: 401, body: { error: "auth_required" } };
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : q && q[k]);
  const rawRef = get("ref"), rawGap = get("gap");
  let want = null, gapN = null;
  if (rawGap != null && rawGap !== "") {
    gapN = Number(rawGap);
    if (!Number.isInteger(gapN) || gapN < 1) return { status: 400, body: { error: "bad_ref", note: "gap is a 1-based index into the open gaps" } };
  } else {
    want = parseRef(rawRef);
    if (!want) return { status: 400, body: { error: "bad_ref", note: `ref is <kind>:<id> (kind one of ${NODE_KINDS.join(", ")}) or goal/<id>; or pass gap=<n>` } };
  }
  try {
    const project = await projectOf(env);
    const gaps = (await canvasOf(env, project, ["gaps"])).canvas;
    const open = openGaps(gaps);
    if (gapN != null) {
      if (gapN > open.length) return { status: 404, body: { error: "unknown_node", note: `there are ${open.length} open gaps` } };
      want = { kind: "gap", id: open[gapN - 1].id };
    }
    const [tree, at, relations] = await Promise.all([
      want.kind === "goal" ? goalTree(env, project) : [],
      want.kind === "goal" ? null : nodeAt(env, project, want.kind, want.id),
      want.kind === "table" ? canvasOf(env, project, ["relations"]).then((c) => c.canvas.relations) : [],
    ]);
    if (want.kind !== "goal" && !at) return { status: 404, body: { error: "unknown_node", ref: refOf(want.kind, want.id) } };
    if (want.kind === "goal" && !tree.some((n) => n.id === want.id)) return { status: 404, body: { error: "unknown_node", ref: refOf(want.kind, want.id) } };
    // an entity lights from the checks that name it and the table it is stored in
    const ids = want.kind === "goal" ? [want.id] : [at.node.id, ...(want.kind === "entity" && at.node.data.table ? [nodeIdOf("table", at.node.data.table)] : [])];
    // M6: a screen's takes beside them (one statement); a read that fails leaves the strip out, never the node
    const takesOf = want.kind === "screen" ? screenTakes(env, project, at.node.id).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : null;
    // M3: the project that owns the node (data.ownedBy), by name (one statement, only when it names one); a failed read leaves it out
    const ownedKey = at && typeof at.node.data.ownedBy === "string" ? at.node.data.ownedBy : null;
    const ownerOf = ownedKey ? ownersOf(env, reader, [ownedKey]).then((m) => m.get(ownedKey) || null, (e) => { if (isD1Quota(e)) throw e; return null; }) : null;
    // the questions whose affects name the node (its ref, or its id: buildNode's own match), by migrate-078's k_question_refs —
    // sprint 8, 8.3b: never the project's every question (saruspay 375 rows a node, bunny 590)
    const naming = questionsNaming(env, project, [refOf(want.kind, want.id), at ? at.node.id : want.id]).catch(() => []);
    const [dec, version, counts, stale, takes, owner] = await Promise.all([naming, versionOf(env), countsFor(env, project, ids), staleFor(env, project, ids), takesOf, ownerOf]);
    const node = buildNode({ want, at, tree: tree.map((n) => ({ id: n.id, title: String(n.title || n.id), parent: n.parent || null })),
      rows: Array.isArray(dec) ? dec : [], relations, counts: sumCounts(ids.map((id) => counts.get(id))), gaps });
    if (!node) return { status: 404, body: { error: "unknown_node", ref: refOf(want.kind, want.id) } };
    const i = node.kind === "gap" ? open.findIndex((g) => g.id === want.id) : -1;
    const walk = i >= 0 ? { i: i + 1, n: open.length, prev: i > 0 ? i : null, next: i + 1 < open.length ? i + 2 : null } : null;
    const { retired, ...rest } = node;
    // sprint 3 B4: stale proof by change (k_node_stale): how many checks naming it were graded before it last changed
    const z = ids.map((x) => stale.get(x)).filter((x) => x && x.stale).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    const st = z.length ? { count: z.reduce((a, x) => a + x.stale, 0), at: z[0].at, by: z[0].by } : null;
    // takes (a screen only): [{ state, variant, format, take, hash, bytes, width, height, style, at, by: { id, name }, current,
    // restorable, url }], newest first, at most TAKES_MAX; restorable: a previous body (not the frame's current one), which
    // render {screen, state, variant, hash} through preview then save_knowledge (or POST /render/restore) makes the newest take again
    const tk = Array.isArray(takes) ? { takes: takes.map(({ held, styleHash, ...t }) => ({ ...t, restorable: !held, url: renderUrl(project, t.hash, t.format === "html" ? styleHash : null) })) } : {};
    // A2 (sprint 5): a WIREFRAME take is drawn, not a plain plate. Its body is the grammar as JSON (GET /render/:hash serves
    // it so, never as SVG — the route stays as the sprint-2 review hardened it), so it is drawn here, server-side, from
    // the validated grammar (drawWireframe validates first) into this page: at most TAKES_MAX small reads, and only for
    // the wireframe takes. ONLY for an HTML render (o.draw — the review's M3): the JSON and MCP reads of a screen never
    // carry the drawings (an agent's answer stays small). A body that cannot be read or parsed keeps the plate.
    if (o.draw && tk.takes && hasStore(env)) await Promise.all(tk.takes.filter((t) => t.format === "wireframe").map(async (t) => {
      try { const obj = await store(env).get(renderKey(project, t.hash)); if (obj) t.svg = drawWireframe(JSON.parse(await obj.text()), { width: 390 }); }
      catch (e) { if (isD1Quota(e)) throw e; }
    }));
    return { status: 200, body: { ...rest, stale: st, ...tk, ...(owner ? { ownedBy: ownerLink(owner, srcIdOf(at.node)) } : {}), walk, model: { v: at ? at.v : null }, version }, open: open.length, project };
  } catch (e) {
    if (isD1Quota(e)) throw e;
    return { status: 503, body: { error: "unreadable", note: "The project's model could not be read." } };
  }
}
// versionOf(env) -> {n} | null: the project's newest version (src/knowledge/versions.js, one row), shared with src/mapplanes.js
export async function versionOf(env) {
  try { const h = await versionHead(env, await projectOf(env)); return h ? { n: h.n } : null; } catch (e) { if (isD1Quota(e)) throw e; return null; }
}

// ---- renderInspector(node, opts) -> the inspector fragment (the ONE renderer: the Map's first paint with ?node= and the
// HTML answer of GET /map/node, which the Map's client swaps in when a node is pinned) ----
// opts: { open } the open-gap count (the walk bar's "Walk the n open gaps" when the node is not a gap)
//       { project } the project read (R1: a stale node's Regrade press names it: POST /regrade {project, node}, its first press
//       answers the plan, src/regradepage.js)
const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const plural = (n, w) => `${n} ${n === 1 ? w : w + "s"}`;
export const CHIP_OF = { green: ["LANDED", "passing"], amber: ["pending", "partly graded"], red: ["ERROR", "failing"], grey: ["REVIEW", "not graded"] };
const KIND_WORD = { screen: "Screen", api: "Door", table: "Table", entity: "Entity", gap: "Gap", goal: "Goal", flow: "Flow", dep: "Decision",
  lane: "Lane", surface: "Surface", service: "Service", architecture: "Architecture", evidence: "Evidence" };
// the layer a node's `layer` field names, as the Map's toolbar names it (the field keeps its values: map {ref}'s shape)
const LAYER_WORD = { surfaces: "screens layer", doors: "doors layer", data: "data layer", gaps: "deps layer", goals: "goals" };
export const nodeHref = (ref) => orgPath("/map?node=") + encodeURIComponent(ref);
// checksLine(node) -> what the checks that name the node say, or how to file the first one
export function checksLine(n) {
  const c = n.checks || {};
  if (!c.total) return `No check names it yet: file one through preview then save_knowledge (an item of kind "check", refs ["${n.nodeId || ""}"]).`;
  return `${plural(c.total, "check")} name${c.total === 1 ? "s" : ""} it: ${c.graded} graded, ${c.passed} passed${c.failed ? `, ${c.failed} failed` : ""}.`;
}
// staleLine(node) -> the stale proof on the node (sprint 3, B4): "3 of 5 checks graded before the last change", when it changed,
// and the contribution that changed it (its Impact view); nothing when no grade is stale
export function staleLine(n) {
  const z = n && n.stale;
  if (!z || !z.count) return "";
  const by = z.by && /^T-\d{8}-\d+$/.test(z.by) ? ` by <a href="${orgPath(`/contribution/${encodeURIComponent(z.by)}/impact`)}" data-button="open-impact" data-door="GET /contribution/:id/impact">${esc(z.by)}</a>` : "";
  return `<p class="mx-stale" data-stale="${esc(z.count)}"><span class="u-tag needs">stale</span> ${txt(staleWords(z.count, (n.checks || {}).graded))}: changed ${esc(String(z.at || "").slice(0, 10))}${by}</p>`;
}
// walkBar(walk, open) -> the walk over the open gaps: Prev · Gap i of n · Next on a gap, else "Walk the n open gaps"
export function walkBar(walk, open) {
  if (walk) {
    const step = (n, label) => n == null
      ? `<button type="button" class="mx-step" data-button="walk-gaps" data-door="GET /map/node" disabled aria-disabled="true">${label}</button>`
      : `<a class="mx-step" href="${orgPath(`/map?gap=${n}`)}" data-button="walk-gaps" data-door="GET /map/node" data-gap="${n}">${label}</a>`;
    return `<div class="mx-walk" data-walk="${walk.i}/${walk.n}">${step(walk.prev, "Prev")}<span class="mx-walk-n">Gap ${walk.i} of ${walk.n}</span>${step(walk.next, "Next")}</div>`;
  }
  const n = Number(open) || 0;
  return n > 0
    ? `<div class="mx-walk"><a class="mx-step" href="${orgPath(`/map?gap=1`)}" data-button="walk-gaps" data-door="GET /map/node" data-gap="1">Walk the ${n} open ${n === 1 ? "gap" : "gaps"}</a><span class="mx-walk-n">${n}</span></div>`
    : `<div class="mx-walk"><button type="button" class="mx-step" data-button="walk-gaps" data-door="GET /map/node" disabled aria-disabled="true" title="No gap is open.">No gap is open</button></div>`;
}
// takesStrip(node, project) -> M6: a screen's last takes as a strip of thumbnails, newest first (a grid of three): each its
// picture (an image as <img>; an html body in an <iframe sandbox> at its own width, scaled down; a wireframe drawn from its
// grammar, server-side, else a plate), the
// face of who filed it and when; the current take marked, a previous one with its Restore press (POST /render/restore, as the
// person: a render upsert naming the take's hash, through the write door). The body is never in this page: the frame loads GET
// /render/<hash>, sandboxed. Hooks: data-region="screen-takes", data-take, data-current, restore-take on its door.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortAt = (iso) => { const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
export const TAKE_W = 80, TAKE_H = 96;
function takePic(t) {
  if (t.format === "image") return `<img src="${esc(t.url)}" alt="" loading="lazy" decoding="async">`;
  if (t.format === "html") {
    const w = Math.max(1, Number(t.width) || 390), k = TAKE_W / w;
    return `<iframe src="${esc(t.url)}" sandbox="" loading="lazy" tabindex="-1" aria-hidden="true" referrerpolicy="no-referrer" style="width:${w}px;height:${Math.ceil(TAKE_H / k)}px;transform:scale(${Math.round(k * 10000) / 10000})"></iframe>`;
  }
  // a wireframe take carries its drawing when the read path could draw it (svg, server-made from the validated grammar)
  if (t.svg) return `<span class="mx-tk-wfd" aria-hidden="true">${t.svg}</span>`;
  return `<span class="mx-tk-wf">Wireframe</span>`;
}
export function takesStrip(n, project) {
  const list = Array.isArray(n && n.takes) ? n.takes : [];
  if (n.kind !== "screen" || !list.length) return "";
  const frame = (t) => [t.state, t.variant].filter(Boolean).join(" · ");
  const card = (t) => {
    const at = shortAt(t.at), who = (t.by && (t.by.name || t.by.id)) || "";
    const label = `Take ${t.take}${frame(t) ? ` · ${frame(t)}` : ""} · ${t.format}`;
    const act = t.current ? `<span class="mx-tk-cur">Current</span>`
      : !t.restorable || !project ? `<button type="button" class="mx-b mx-tk-go" data-button="restore-take" data-door="POST /render/restore" disabled aria-disabled="true" title="The frame shows this picture now">Restore</button>`
      : `<form method="POST" action="${orgPath(`/render/restore`)}">${[["project", project], ["screen", n.nodeId], ["state", t.state], ["variant", t.variant], ["hash", t.hash]].map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("")}<button type="submit" class="mx-b mx-tk-go" data-button="restore-take" data-door="POST /render/restore" title="Make take ${esc(t.take)} the frame's picture again">Restore</button></form>`;
    return `<li class="mx-tk" data-take="${esc(t.take)}" data-format="${esc(t.format)}"${t.current ? " data-current" : ""}><div class="mx-tk-pic" title="${esc(label)}">${takePic(t)}${who ? avatar({ id: t.by.id, name: who, size: 20 }) : ""}</div>` +
      `<time class="mx-tk-at" datetime="${esc(t.at || "")}" title="${esc(`${label}, filed ${String(t.at || "").slice(0, 16).replace("T", " ")} UTC${who ? ` by ${who}` : ""}`)}">${esc(at)}</time>${act}</li>`;
  };
  return `<section class="mx-sec mx-takes" data-region="screen-takes"><style>${TAKES_CSS}</style><h4 class="mx-k" title="The pictures this screen has held, newest first">Takes <span>${list.length}</span></h4><ol class="mx-tks">${list.map(card).join("")}</ol></section>`;
}
const TAKES_CSS = `.mx-takes{margin-bottom:12px}
.mx-tks{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,${TAKE_W}px);gap:10px 8px}
.mx-tk{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0}
.mx-tk-pic{position:relative;width:${TAKE_W}px;height:${TAKE_H}px;overflow:hidden;border-radius:6px;background:var(--surface);box-shadow:0 0 0 1px var(--line)}
.mx-tk[data-current] .mx-tk-pic{box-shadow:0 0 0 2px var(--text)}
.mx-tk-pic img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.mx-tk-pic iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none;background:var(--surface)}
.mx-tk-pic .p-av{position:absolute;left:4px;bottom:4px;box-shadow:0 0 0 2px var(--surface)}
.mx-tk-wf{display:flex;align-items:center;justify-content:center;height:100%;font:500 10px/1 var(--mono);color:var(--text-faint);background:repeating-linear-gradient(135deg,transparent 0 4px,color-mix(in srgb,var(--line) 45%,transparent) 4px 8px)}
.mx-tk-wfd{display:block;width:100%;height:100%;background:var(--surface)}
.mx-tk-wfd svg{display:block;width:100%;height:100%}
.mx-tk-at{font:400 10.5px/1.3 var(--mono);color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.mx-tk form{margin:0}
.mx-tk .mx-tk-go{width:100%;height:24px;padding:0 6px;font-size:11.5px}
.mx-tk .mx-tk-go[disabled]{opacity:.45;cursor:default}
.mx-tk-cur{display:flex;align-items:center;justify-content:center;height:24px;font:500 11px/1 var(--mono);color:var(--text)}`;

// ownedFact(ownedBy) -> M3: the project that owns the node, as a fact: its name, a link to its Map when the reader may read it
export function ownedFact(o) {
  if (!o || !o.name) return "";
  const name = esc(noDash(o.name));
  return `<dt>Owned by</dt><dd data-owner="${esc(o.project)}" title="${esc(noDash(o.name))}">${o.href ? `<a href="${esc(o.href)}" data-button="open-owner" data-door="GET /map">${name}</a>` : name}</dd>`;
}

// the inspector, compact (the Map's side panel: 13px body, 11px mono labels, 12px rows, never wider than the panel): a long
// id or name is cut with its whole text in a tooltip, never wrapped wider. Hooks: data-node, data-kind, data-light on the
// root; data-checks on the checks line; select-node, open-card and walk-gaps each on its door.
export function renderInspector(node, opts = {}) {
  const n = node || {};
  const f = n.facts || {};
  const [chip, word] = CHIP_OF[n.state] || CHIP_OF.grey;
  // an edge by its other end's NAME, cut never wrapped; its ref stays the link's target and its title
  const edge = (e) => `<li><a href="${esc(nodeHref(e.ref))}" data-button="select-node" data-door="GET /map/node" data-ref="${esc(e.ref)}" title="${esc(noDash(e.ref))}">${txt(e.name || refName(e.ref))}</a>${e.label ? `<small title="${esc(noDash(e.label))}">${txt(e.label)}</small>` : ""}</li>`;
  const edgeList = (label, list) => list && list.length ? `<h4 class="mx-k">${label} <span>${list.length}</span></h4><ul class="mx-edges">${list.map(edge).join("")}</ul>` : "";
  const fact = (k, v) => v == null || v === "" || (Array.isArray(v) && !v.length) ? "" : `<dt>${k}</dt><dd title="${esc(noDash(Array.isArray(v) ? v.join(", ") : v))}">${Array.isArray(v) ? v.map(txt).join(", ") : txt(v)}</dd>`;
  const card = n.card
    ? `<a class="mx-b" href="${orgPath(`/read?ref=card/${encodeURIComponent(n.card.kind)}/${encodeURIComponent(n.card.id)}`)}" data-button="open-card" data-door="GET /read" title="Open ${esc(n.card.id)}">Open ${txt(n.card.id)}</a>`
    : `<button type="button" class="mx-b" data-button="open-card" data-door="GET /read" disabled aria-disabled="true" title="${esc(NO_CARD)}">Open the card</button>`;
  const parent = n.kind === "goal" ? (n.parent ? `<p class="mx-note">Under <a href="${esc(nodeHref(n.parent))}" data-button="select-node" data-door="GET /map/node" data-ref="${esc(n.parent)}">${txt(n.parent)}</a></p>` : `<p class="mx-note">The root of the goal tree</p>`) : "";
  const title = noDash(n.title || n.ref || "");
  // R1: a node with stale checks regrades from here, as the person (a form: the first press answers the plan, its confirm files)
  const regrade = n.stale && n.stale.count && opts.project && n.nodeId ? `<form method="POST" action="${orgPath(`/regrade`)}">${[["project", opts.project], ["node", n.nodeId],
    ["next", `${nodeHref(n.ref)}&project=${encodeURIComponent(opts.project)}`]].map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("")}<button type="submit" class="mx-b mx-b-go" data-button="regrade" data-door="POST /regrade">Regrade</button></form>` : "";
  return `<div class="mx-node" data-node="${esc(n.ref || "")}" data-kind="${esc(n.kind || "")}" data-light="${esc(n.state || "grey")}"${n.stale ? ` data-stale="${esc(n.stale.count)}"` : ""}>${n.walk ? walkBar(n.walk, opts.open) : ""}
  <p class="mx-k">${esc(KIND_WORD[n.kind] || "Node")} · ${esc(LAYER_WORD[n.layer] || n.layer || "")}</p>
  <h3 class="mx-title" title="${esc(title)}">${esc(title)}</h3>
  <div class="mx-chips">${n.stale ? stateChip("pending", "stale") : stateChip(chip, word)}${n.status ? `<span>${txt(n.status)}</span>` : ""}</div>${parent}
  ${n.what ? `<p class="mx-what" title="${esc(noDash(n.what).slice(0, 600))}">${txt(n.what)}</p>` : ""}
  <p class="mx-checks" data-checks="${esc(String((n.checks || {}).total || 0))}">${txt(checksLine(n))}</p>${staleLine(n)}
  <dl class="mx-facts">${ownedFact(n.ownedBy)}${fact("Kind of gap", f.gapKind)}${fact("Tracked by", f.trackedBy)}${fact("Ruled by", f.ruledBy)}${fact("Blocks", f.blocks)}${fact("Built", f.implStatus)}${fact("Found by", f.foundBy)}</dl>
  ${takesStrip(n, opts.project)}${edgeList("In", (n.edges || {}).in)}${edgeList("Out", (n.edges || {}).out)}
  <div class="mx-acts">${regrade}${card}</div>
  ${n.version ? `<p class="mx-model">Published v${esc(n.version.n)}</p>` : ""}</div>`;
}
