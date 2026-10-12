// src/mapread.js — the Map page's reads (the main tab, sprint 2): what a URL opens, then the ONE read that view needs.
//   GET /map, GET /eagle, GET /map/<plane> (a browser) all draw src/mappage.js, opened on a view and a set of layers
//   (OPENS: /eagle the default layers, /map/data doors and data, /map/api screens and doors, /map/flows and /map/deps the
//   default layers with flows or deps on, /map/arch and /map/mcp their views); ?layer=a,b overrides the layers.
//   · the canvas: the compact model (src/knowledge/mapmodel.js: three statements, at most one row per node each) laid out
//     by src/maplayout.js; with ?node=<ref> (or ?table=<name> on /map/data, or ?gap=<n>) the pinned node too, through
//     src/mapnode.js readMapNode (the inspector's own read, the same GET /map/node answers);
//   · Arch: the arch plane (src/mapplanes.js readMapPlane) and the architecture node's diagram (the same rows, memoized);
//   · MCP: the mcp plane (the worker's own registry and this project's shelf);
//   · Screens (GET /map/screens, a browser): the atlas (src/atlaspage.js) over the GET /map/screens answer for one app
//     (src/knowledge/screens.js screensAnswer, the JSON route's own read: ?surface=, else the first app with screens) laid
//     out by src/atlaslayout.js; ?screen=<id> pins one (the inspector's own read, readMapNode, as ?node= on the canvas),
//     ?state=, ?mode=wire, ?find= and ?full=1 open it as they say. An app the project does not have reads the first one.
// The version head is read here once and handed to the shell (servePage never reads it twice). A failed model read is
// UNREACHABLE on glass, never a 500.
import { db } from "./data.js";
import { projectOf } from "./project.js";
import { ADMITS } from "./hotsql.js";
import { readerKeysJson } from "./checklist.js";
import { aimOf } from "./knowledge/goals.js";
// what a project that holds no product model does hold (D1b item 19): its flows, goals, GTM template, GTM docs and cards on
// the GTM tab — ONE statement, five counts, each on its project range (the flows on k_nodes' (project, type) as the canvas reads).
// The docs and cards as the reader may read them (sprint 1's review, closed in 6.6; ?2 the reader's keys, src/checklist.js
// readerKeysJson: NULL for the owner, whose counts are the statement they always were; a card passes its own list and its kind's)
export const HOLDS_SQL = "SELECT (SELECT COUNT(*) FROM k_nodes WHERE project = ?1 AND type = 'flow') AS flows, " +
  "(SELECT COUNT(*) FROM k_goals WHERE project = ?1) AS goals, (SELECT COUNT(*) FROM k_gtm WHERE project = ?1) AS gtm, " +
  "(CASE WHEN ?2 IS NULL THEN (SELECT COUNT(*) FROM k_docs WHERE project = ?1 AND path >= 'gtm/' AND path < 'gtm0') " +
  `ELSE (SELECT COUNT(*) FROM k_docs WHERE project = ?1 AND path >= 'gtm/' AND path < 'gtm0' AND ${ADMITS("role_visibility", "?2")}) END) AS gtm_docs, ` +
  "(CASE WHEN ?2 IS NULL THEN (SELECT COUNT(*) FROM k_cards WHERE project = ?1) " +
  `ELSE (SELECT COUNT(*) FROM k_cards c LEFT JOIN k_card_kinds k ON k.project = c.project AND k.key = c.kind WHERE c.project = ?1 AND ${ADMITS("c.role_visibility", "?2")} AND ${ADMITS("k.role_visibility", "?2")}) END) AS cards`;
const get0 = (q, k) => (q && typeof q.get === "function" ? q.get(k) : null);
import { isD1Quota } from "./util.js";
import { versionHead } from "./knowledge/versions.js";
import { mapModelOf } from "./knowledge/mapmodel.js";
import { layoutOf, DEFAULT_LAYERS, LAYERS } from "./maplayout.js";
import { readMapNode, renderInspector, readCanvas, archOwnersOf } from "./mapnode.js";
import { readMapPlane } from "./mapplanes.js";
import { renderMapPage } from "./mappage.js";
import { screensAnswer } from "./knowledge/screens.js";
import { atlasLayout } from "./atlaslayout.js";
import { renderAtlasPage } from "./atlaspage.js";
import { readImpactRow, refsOfRow } from "./impact.js";
import { mapImpactPanel } from "./impactpage.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const OPENS = {
  map: { view: "canvas", layers: DEFAULT_LAYERS },
  data: { view: "canvas", layers: ["doors", "data"] },
  api: { view: "canvas", layers: ["screens", "doors"] },
  flows: { view: "canvas", layers: [...DEFAULT_LAYERS, "flows"] },
  deps: { view: "canvas", layers: [...DEFAULT_LAYERS, "deps"] },
  arch: { view: "arch" },
  mcp: { view: "mcp" },
  screens: { view: "screens" },
};
const LAYER_KEYS = LAYERS.map(([k]) => k);

// layersOf(opened, q) -> { layer: 1 }: ?layer=a,b when it names a layer, else the opening's own
export function layersOf(opened, q) {
  const raw = q && typeof q.get === "function" ? (q.get("layer") || q.get("layers") || "") : "";
  const asked = String(raw).split(",").map((s) => s.trim()).filter((k) => LAYER_KEYS.includes(k));
  let list = asked.length ? asked : (opened.layers || DEFAULT_LAYERS);
  // D2b: a flow is played over the screens and doors it walks: the Flows layer alone drew an empty canvas
  if (list.length === 1 && list[0] === "flows") list = ["screens", "doors", "flows"];
  return Object.fromEntries(list.map((k) => [k, 1]));
}

// readMapPage(env, reader, key, q, reg) -> { status, content, head, seatsRead? }: key names the opening (OPENS), q the
// request's search params, reg the registries the planes read (src/mcp.js mapReg)
export async function readMapPage(env, reader, key, q, reg) {
  const opened = OPENS[key] || OPENS.map;
  const quota = (e) => { if (isD1Quota(e)) throw e; };
  const project = await projectOf(env).catch((e) => { quota(e); return null; });
  const headP = versionHead(env, project).catch((e) => { quota(e); return null; });
  const base = { project, anonymous: !reader };
  if (opened.view === "arch") {
    const [arch, cv, head] = await Promise.all([
      readMapPlane(env, reader, "arch", reg),
      readCanvas(env, ["architecture"]).catch((e) => { quota(e); return null; }),
      headP,
    ]);
    const ow = arch.status === 200 ? arch.body.regions["org-worker"] : null;
    // M3: the projects its parts name in ownedBy, by name, and whether this reader may read each (no statement when none does)
    const architecture = cv && cv.canvas.architecture ? await archOwnersOf(env, reader, cv.canvas.architecture) : null;
    return { status: 200, head, seatsRead: ow ? { seats: ow.projects, orgCount: ow.active } : undefined,
      content: renderMapPage({ ...base, view: "arch", head, version: head, arch: arch.status === 200 ? arch.body : null, architecture }) };
  }
  if (opened.view === "mcp") {
    const [mcp, head] = await Promise.all([readMapPlane(env, reader, "mcp", reg), headP]);
    return { status: 200, head, content: renderMapPage({ ...base, view: "mcp", head, version: head, mcp: mcp.status === 200 ? mcp.body : null }) };
  }
  if (opened.view === "screens") return readAtlas(env, reader, q, base, headP, quota);
  const on = layersOf(opened, q);
  const since = new Date(Date.now() - 2000).toISOString();
  let model = null;
  try { model = await mapModelOf(env, project); } catch (e) { quota(e); }
  const head = await headP;
  if (!model) return { status: 200, head, content: renderMapPage({ ...base, view: "canvas", state: "unreachable", head, on }) };
  const L = layoutOf(model);
  // D1b item 19: a project that DECLARES it holds no product model (the aim's productModel {none, why}, filed through preview
  // then file) reads as that, with what it does hold, never as an empty canvas. The aim is one row (memoized: Home and the
  // checklist read the same); the counts of what it holds are ONE statement, run only for such a project.
  const aimRow = project ? await aimOf(env, project).catch((e) => { quota(e); return null; }) : null;
  if (aimRow && aimRow.productModel && !(get0(q, "node") || get0(q, "flow"))) {
    const holds = await db(env).prepare(HOLDS_SQL).bind(project, readerKeysJson(reader)).first().catch((e) => { quota(e); return null; });
    return { status: 200, head, content: renderMapPage({ ...base, view: "canvas", head, version: head, L, model, on, noModel: aimRow.productModel, holds: holds || null }) };
  }
  // the pinned node: ?node=<ref> (?table=<name> on the Data layer), else ?gap=<n>
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : null);
  const ref = get("node") || (get("table") ? `table:${get("table")}` : null);
  const gap = !ref && get("gap") ? get("gap") : null;
  let inspector = null, pin = -1;
  const open = {};
  if (ref || gap) {
    const ans = await readMapNode(env, reader, ref ? { ref } : { gap }, { draw: true });
    if (ans.status === 200) {
      inspector = renderInspector(ans.body, { open: ans.open, project: ans.project });
      const want = String(ans.body.ref || "").replace(/^door:/, "api:");
      pin = L.nodes.findIndex((n) => n.r === want);
      if (pin >= 0) {
        const g = L.groups[L.nodes[pin].g];
        if (g.fold) open[g.id] = 1;
        on[L.cols[g.c].layer] = 1;
      }
    }
  }
  const flowId = get("flow");
  const flow = flowId ? L.flows.findIndex((f) => f.id === flowId) : -1;
  if (flow >= 0) on.flows = 1;
  // ?impact=<id> (sprint 3, B4): the contribution's touched nodes solid, the ones one hop out (the layout's own links) light
  const im = !ref && !gap ? await impactMarks(env, reader, get("impact"), project, (n) => n.id || n.r, L.nodes, (fn) => { for (let k = 0; k + 1 < L.links.length; k += 3) fn(L.links[k], L.links[k + 1]); }).catch((e) => { quota(e); return null; }) : null;
  if (im) for (const i of Object.keys(im.t)) { const g = L.groups[L.nodes[i].g]; if (g.fold) open[g.id] = 1; on[L.cols[g.c].layer] = 1; }
  return { status: 200, head, content: renderMapPage({ ...base, view: "canvas", head, version: head, L, model, on, open, pin, inspector, flow, since, v: model.v,
    ...(im ? { imp: { id: im.id, t: im.t, r: im.r }, impactPanel: mapImpactPanel(im.panel, { base: orgPath("/map") }) } : {}) }) };
}

// impactMarks(env, reader, id, project, keyOf, items, eachLink) -> { id, t: {index: 1}, r: {index: 1}, panel } | null: which drawn
// items a contribution touched (its refs, src/impact.js refsOfRow) and which are one hop out of them along the drawing's own
// links. The ONE read is the contribution (scoped to the reader and their scope on its project: readImpactRow); a contribution
// of another project, or one the reader may not read, marks nothing.
export async function impactMarks(env, reader, id, project, keyOf, items, eachLink) {
  if (!id || !reader || !project) return null;
  const got = await readImpactRow(env, reader, id);
  if (got.error || got.project !== project) return null;
  const refs = refsOfRow(got.row).refs;
  const t = {}, r = {};
  items.forEach((n, i) => { if (refs.has(keyOf(n))) t[i] = 1; });
  eachLink((a, b) => { if (t[a] && !t[b]) r[b] = 1; if (t[b] && !t[a]) r[a] = 1; });
  const nt = Object.keys(t).length, nr = Object.keys(r).length;
  const line = nt ? `${nt} touched on this view · ${nr} one hop out` : "None of what it touched is drawn on this view.";
  return { id: got.row.id, t, r, panel: { id: got.row.id, what: got.row.what, project, touched: nt, reached: nr, line } };
}

// readAtlas -> the Screens view: one app's screens (the JSON route's own read), laid out, its pinned screen's inspector
async function readAtlas(env, reader, q, base, headP, quota) {
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : null);
  let ans;
  try {
    // ?impact=<id> with no app asked opens the app of the first screen the contribution touched (one probe)
    let want = get("surface");
    if (want == null && get("impact") && reader && base.project) {
      const got = await readImpactRow(env, reader, get("impact"));
      const ids = got.error || got.project !== base.project ? [] : [...refsOfRow(got.row).refs].filter((x) => /^screen:/.test(x)).slice(0, 30);
      if (ids.length) {
        const r = await db(env).prepare("SELECT json_extract(data, '$.surface') AS surface FROM k_nodes WHERE project = ?1 AND id IN (SELECT value FROM json_each(?2)) AND type = 'screen' LIMIT 1").bind(base.project, JSON.stringify(ids)).first();
        if (r && r.surface != null) want = String(r.surface);
      }
    }
    ans = await screensAnswer(env, want);
    if (ans.status === 404) ans = await screensAnswer(env, null);
  } catch (e) { quota(e); ans = { status: 503 }; }
  const head = await headP;
  if (ans.status !== 200) return { status: 200, head, content: renderAtlasPage({ ...base, head, state: "unreachable" }) };
  const board = ans.body;
  const A = Array.isArray(board.screens) && board.screens.length ? atlasLayout(board, { state: get("state"), mode: get("mode") }) : null;
  const surfaceName = ((board.surfaces || []).find((s) => s.key === board.surface) || {}).name || board.surface || "";
  const sid = get("screen");
  let pin = -1, inspector = null;
  if (A && sid) {
    pin = A.f.findIndex((f) => f.id === sid || f.r === sid);
    if (pin >= 0) {
      const node = await readMapNode(env, reader, { ref: A.f[pin].r }, { draw: true });
      if (node.status === 200) inspector = renderInspector(node.body, { open: node.open, project: node.project });
    }
  }
  // ?impact=<id> (sprint 3, B4): the frames the contribution touched, and the ones one transition away
  const im = A && pin < 0 ? await impactMarks(env, reader, get("impact"), base.project, (f) => f.r, A.f, (fn) => { for (let k = 0; k + 1 < A.e.length; k += 3) fn(A.e[k], A.e[k + 1]); }).catch((e) => { quota(e); return null; }) : null;
  return { status: 200, head, content: renderAtlasPage({ ...base, head, version: head, board, A, surfaceName, pin, inspector,
    full: get("full") === "1", find: get("find") || "", since: new Date(Date.now() - 2000).toISOString(),
    ...(im ? { imp: { t: im.t, r: im.r }, impactPanel: mapImpactPanel(im.panel, { base: orgPath("/map/screens") }) } : {}) }) };
}
