// tools/map-selftest.mjs — sprint 2, the Map (the main tab). Offline: no wrangler, no network.
//   A. THE LAYOUT (src/maplayout.js layoutOf) is deterministic (the same model draws the same map, byte for byte), puts
//      every node in its column, and groups a big column by what its rows carry (lanes for screens, a path for doors, a
//      stem for tables), never a group over forty when a finer key exists, a column over FOLD_OVER folded, a small one open.
//   B. THE KIT the page embeds (mapKit.toString(), as src/mapclient.js ships it) is self-contained: evaluated alone in an
//      empty context it draws exactly the SVG the server draws, folded and open, every layer set.
//   C. THE FLOW PLAYBACK DATA: a flow's steps resolve to the nodes they name (a screen, a door), in order, with their actor
//      and text; a step naming nothing on the canvas keeps its text and no node; screenSteps (a bare id list) play too.
//   D. THE CLIENT (MAP_CLIENT in a small fake DOM, tools/fixtures/mapdom.mjs) boots over a real layout without a throw,
//      pins a node through GET /map/node and polls GET /map/lights, both carrying the page's ?project=, and applies a
//      moved light; it stays under 60 KB.
//   E. THE PAGE (src/mappage.js renderMapPage over the importer's own fixture, read through mapModelOf on a real SQLite):
//      its four regions in order, every data-button on a door or client-side, no em dash, the data it embeds parses, a
//      pinned node's inspector drawn with its hooks; and the model read is the nodes, the links and the lit probes.
//   F. THE SCREENS VIEW'S LAYOUT (src/atlaslayout.js atlasLayout over the GET /map/screens shape): deterministic; lanes as
//      the board orders them; a lane's columns the dense rank of its steps, two screens on one step stacked; a long lane
//      wrapped so the board keeps a screen's shape; with no lane and no step, the nav edges' layering; the device from the
//      renders (else the surface's key, else a phone); the states and the default ("ready", else each screen's first);
//      every string cut of its em dashes; a render's style hash carried for its URL.
//   G. THE ATLAS KIT (atlasKit, embedded alone as the page ships it): the same answers alone; what a frame shows and the
//      order it falls back in, both modes, both ways; the level of detail's thresholds; the plan (what loads for a view:
//      nothing at fit, the nearest LIVE renders close in, the far frames released); the curves; the lane's reading order;
//      the pinned screen's block. THE ONE WIREFRAME DRAWER (src/wireframe.js wireframeSvg, embedded alone as the page
//      ships it): the server's drawWireframe byte for byte, every block of the grammar drawn, inset in a device frame.
//   H. THE ATLAS CLIENT (ATLAS_CLIENT in the fake DOM): boots, pins through GET /map/node, polls the lights, both with the
//      page's ?project=; html renders only ever in <iframe sandbox=""> (no allow-scripts, no allow-same-origin) or <img>,
//      a render's body never fetched as text; under 60 KB.
//   I. THE SCREENS PAGE (src/atlaspage.js renderAtlasPage): its regions in order, every button on its door or client-side,
//      no em dash, every frame a link in a lane's list, no render body and no iframe in the page itself, EMPTY with the
//      exact call, UNREACHABLE; an app pill only for a surface with a screen (none with a screen: EMPTY).
//   K. THE FOLDS (M1, M5): the fold store (src/parts.js foldKit) parses what a browser holds (anything foreign reads as
//      nothing), flips the rail and the panel, folds both for the canvas alone and opens both again, keeps a lane or a column
//      per project, alone as the head ships it; the head's boot (src/shell.js FOLD_BOOT) folds before the first paint, on the
//      Map's full pages for a signed-in reader only; the toolbar carries both toggles, their title the key; a column folded
//      in mapKit is ONE cluster at its top with its count and its links, the other columns where they were, alone the same;
//      the client draws a kept column folded at boot, a press on its head opens it and keeps that, a pin into a folded column
//      opens it for the visit only, and a fold of the rail or the panel fits the drawing once.
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { layoutOf, mapKit, FOLD_OVER, COLUMNS } from "../src/maplayout.js";
import { MAP_CLIENT } from "../src/mapclient.js";
import { renderMapPage, MAP_REGIONS } from "../src/mappage.js";
import { mapModelOf, modelFromRows, LIT_CHUNK, depOpen } from "../src/knowledge/mapmodel.js";
import { renderInspector } from "../src/mapnode.js";
import { seedModel } from "./fixtures/model-d1.mjs";
import { runClient, clickNode, runAtlas, clickFrame } from "./fixtures/mapdom.mjs";
import { atlasLayout, atlasKit, deviceOf, PHONE, WIDE } from "../src/atlaslayout.js";
import { ATLAS_CLIENT } from "../src/atlasclient.js";
import { renderAtlasPage, ATLAS_REGIONS, SCREEN_CALL } from "../src/atlaspage.js";
import { strip } from "../src/mapclient.js";
import { foldKit, foldToggle, FOLD_KEY } from "../src/parts.js";
import { shell, FOLD_BOOT, FOLD_PREFIX } from "../src/shell.js";
import { createHash } from "node:crypto";
import { WIREFRAME_BLOCKS, wireframeSvg, drawWireframe } from "../src/wireframe.js";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };

// ---- a big model, synthetic (the shapes the imported projects carry): 150 screens in 3 surfaces and 9 lanes, 180 doors
// under /api/v1/<area>/..., 60 tables with name stems, 8 entities, links of every kind, a flow of steps and one of ids
function bigModel() {
  const nodes = [], links = [];
  const surfaces = ["mobile", "web", "ops"], lanes = ["open", "money", "cards", "acct", "wrong", "invite", "console", "tenant", "states"];
  for (const s of surfaces) nodes.push({ id: `surface:${s}`, type: "surface", ref: `surface:${s}`, name: s });
  for (let i = 0; i < 150; i++) { const lane = lanes[i % 9], sf = surfaces[Math.floor((i % 9) / 3)]; nodes.push({ id: `screen:s${i}`, type: "screen", ref: `screen:s${i}`, name: `Screen ${i}`, surface: sf, lane }); links.push([`surface:${sf}`, `screen:s${i}`, "on"]); }
  const areas = ["auth", "cards", "users", "kyc", "support", "public", "ledger", "tenants", "operators", "disputes", "config", "sweeps"];
  for (let i = 0; i < 180; i++) { const a = areas[i % 12]; const path = `/api/v1/${a}/${i}`; nodes.push({ id: `door:GET:${path}`, type: "door", ref: `api:GET ${path}`, name: `GET ${path}`, path: `GET ${path}` }); links.push([`screen:s${i % 150}`, `door:GET:${path}`, "calls"]); }
  const stems = ["user", "card", "ledger", "tenant", "wallet", "kyc", "ticket", "operator", "notification", "fee"];
  for (let i = 0; i < 60; i++) { const t = `${stems[i % 10]}_${i}`; nodes.push({ id: `table:${t}`, type: "table", ref: `table:${t}`, name: t }); links.push([`door:GET:/api/v1/${areas[i % 12]}/${i}`, `table:${t}`, i % 3 ? "reads" : "writes"]); }
  for (let i = 0; i < 8; i++) { nodes.push({ id: `entity:e${i}`, type: "entity", ref: `entity:e${i}`, name: `Entity ${i}`, table: `${stems[i]}_${i}` }); links.push([`entity:e${i}`, `table:${stems[i]}_${i}`, "stored"]); }
  for (let i = 0; i < 149; i++) links.push([`screen:s${i}`, `screen:s${i + 1}`, "nav"]);
  const flows = [
    { id: "signup", nodeId: "flow:signup", ref: "flow:signup", name: "Sign up", status: "live", audience: "people", desc: "A person opens an account.", steps: [
      { node: "screen:s0", door: null, actor: "person", text: "lands", does: null }, { node: "screen:s9", door: "door:GET:/api/v1/auth/0", actor: "person", text: "asks for a code", does: "types an email" },
      { node: null, door: null, actor: "machine", text: "sends the email", does: null }, { node: "screen:s18", door: null, actor: "person", text: "is in", does: null }] },
  ];
  return { project: "big", v: "abc12345", nodes, links, flows, deps: { chains: [], cheapest: null, counts: {} }, gaps: [], lanes: Object.fromEntries(lanes.map((l) => [l, `Lane ${l}`])), surfaceLabels: {} };
}

// ---- A. the layout ----
console.log("A · the layout");
{
  const m = bigModel();
  const L1 = JSON.stringify(layoutOf(m)), L2 = JSON.stringify(layoutOf(bigModel()));
  ok(L1 === L2, `the same model lays out the same map, byte for byte (${L1.length} bytes of layout)`);
  const L = layoutOf(m);
  ok(L.cols.map((c) => c.k).join(" ") === "surface screen door data" && L.nodes.length === m.nodes.length, `every node in its column, the columns in order (${L.cols.map((c) => `${c.label} ${c.n}`).join(" · ")})`);
  const col = (k) => L.cols.find((c) => c.k === k), groups = (k) => col(k).g.map((g) => L.groups[g]);
  const scr = groups("screen"), doors = groups("door"), data = groups("data");
  ok(scr.length >= 3 && scr.every((g) => g.m.length <= 40) && scr.every((g) => g.fold), `150 screens fold into ${scr.length} groups by lane (${scr.slice(0, 3).map((g) => `${g.label} ${g.m.length}`).join(", ")}, ...), none over 40`);
  ok(doors.length >= 8 && doors.length <= 16 && doors.every((g) => g.m.length <= 40) && doors.some((g) => /^\/api\/v1\/auth/.test(g.label)), `180 doors group by their path below the shared /api/v1 head (${doors.slice(0, 3).map((g) => `${g.label} ${g.m.length}`).join(", ")}, ...)`);
  ok(data[0].label === "Entities" && data.some((g) => g.label === "user") && data.every((g) => g.m.length <= 40), `the data column: the entities first, then the tables by their name stem (${data.slice(0, 4).map((g) => `${g.label} ${g.m.length}`).join(", ")})`);
  ok(L.groups.filter((g) => g.c === L.cols.indexOf(col("surface"))).every((g) => !g.fold), `a column of ${FOLD_OVER} nodes or fewer stays open (the surfaces)`);
  ok(L.rest.length === 4 && L.kinds.includes("nav") && L.links.length === m.links.length * 3, `every link kept, the four rest kinds bundled at rest (${L.rest.map((k) => L.kinds[k]).join(", ")}), nav on hover`);
  // the barycenter: a door group sits beside the screens that call it (the first door group follows the first screens)
  const firstDoorGroup = doors[0], firstScreens = new Set(scr[0].m.map((i) => L.nodes[i].r));
  ok(firstDoorGroup.m.some((i) => m.links.some(([a, b]) => b === (L.nodes[i].id || L.nodes[i].r) && firstScreens.has(a))), "the doors column opens with a group the first screens call (the barycenter orders the groups)");
}

// ---- B. the kit, alone ----
console.log("B · the kit the page embeds draws the same SVG alone");
{
  const L = layoutOf(bigModel());
  const K = mapKit();
  const alone = vm.runInNewContext(`var __name=function(t){return t;};(${mapKit.toString()})()`, {});
  const cases = [
    ["folded, default layers", { open: {}, on: { screens: 1, doors: 1, data: 1 }, pin: -1 }],
    ["two groups open, a pin", { open: { [L.groups[4].id]: 1, [L.groups[12].id]: 1 }, on: { screens: 1, doors: 1, data: 1 }, pin: L.groups[4].m[0] }],
    ["doors and data only", { open: {}, on: { doors: 1, data: 1 }, pin: -1 }],
  ];
  for (const [label, S] of cases) {
    const a = JSON.parse(JSON.stringify(L)), b = JSON.parse(JSON.stringify(L));
    K.stack(a, S); alone.stack(b, S);
    const same = K.units(a, S) === alone.units(b, S) && K.links(a, S) === alone.links(b, S) && a.W === b.W && a.H === b.H;
    ok(same && K.units(a, S).length > 1000, `${label}: the embedded kit's units and links == the server's (${K.units(a, S).length + K.links(a, S).length} bytes, ${a.W} x ${a.H})`);
  }
  const src = mapKit.toString();
  ok(!/\bimport\b|\brequire\(|\bnodeIdOf\b|\bCOLUMNS\b/.test(src), "the kit names nothing outside its own body");
  // a split group's label too long for its row keeps its part whole and cuts the group it was split from
  {
    const c = JSON.parse(JSON.stringify(L)), S = { open: {}, on: { screens: 1, doors: 1, data: 1 }, pin: -1 };
    const gi = c.cols.find((x) => x.k === "data").g[1];
    c.groups[gi].label = "row-owner scope · connection";
    K.stack(c, S);
    const label = (new RegExp(`data-g="${gi}"[\\s\\S]*?<text class="mx-ct"[^>]*>([^<]*)<`).exec(K.units(c, S)) || [])[1] || "";
    ok(/… · connection$/.test(label) && label.startsWith("row-"), `a split group's label keeps its part ("${label}")`);
  }
}

// ---- C. the flow playback data ----
console.log("C · the flow playback data");
{
  const m = bigModel();
  const L = layoutOf(m);
  const f = L.flows[0], idx = (id) => L.nodes.findIndex((n) => (n.id || n.r) === id);
  ok(f.st.length === 4 && f.st[0][0] === idx("screen:s0") && f.st[1][0] === idx("screen:s9") && f.st[1][1] === idx("door:GET:/api/v1/auth/0") && f.st[3][0] === idx("screen:s18"),
    "each step resolves to the screen and the door it names, in order");
  ok(f.st[2][0] === -1 && f.st[2][1] === -1 && f.st[2][2] === "machine" && f.st[2][3] === "sends the email", "a step naming nothing on the canvas keeps its actor and text and no node");
  ok(f.st[1][2] === "person" && f.st[1][3] === "asks for a code" && f.st[1][4] === "types an email", "a step's actor, its state as the text and what it does beside it");
  // the importer's shapes, read back from rows: data.steps {actor, does, screen, door} and data.screenSteps (bare ids)
  const rows = [
    { id: "screen:a", type: "screen", name: "A", updated_at: "t" }, { id: "screen:b", type: "screen", name: "B", updated_at: "t" }, { id: "door:POST:/x", type: "door", name: "POST /x", updated_at: "t" },
    { id: "flow:f1", type: "flow", name: "F1", updated_at: "t", body: JSON.stringify({ steps: [{ actor: "person", does: "opens A", screen: "a" }, { actor: "person", does: "sends", door: "POST /x" }, { actor: "machine", does: "stores it" }] }) },
    { id: "flow:f2", type: "flow", name: "F2", updated_at: "t", body: JSON.stringify({ screenSteps: ["b", "a", "zz"] }) },
  ];
  const mm = modelFromRows("p", rows, []);
  const f1 = mm.flows.find((x) => x.id === "f1"), f2 = mm.flows.find((x) => x.id === "f2");
  ok(f1.steps.map((s) => `${s.node || "-"}|${s.door || "-"}|${s.actor}|${s.text}`).join(" ; ") === "screen:a|-|person|opens A ; -|door:POST:/x|person|sends ; -|-|machine|stores it", `data.steps resolve (${f1.steps.map((s) => s.node || s.door || "none").join(", ")})`);
  ok(f2.steps.map((s) => s.node || "-").join(",") === "screen:b,screen:a,-" && f2.steps[2].text === "zz", "data.screenSteps play as bare screen ids; an id that is no node keeps its name as text");
}

// ---- D. the client ----
console.log("D · the client");
{
  const L = layoutOf(bigModel());
  const data = { L, on: { screens: 1, doors: 1, data: 1 }, open: {}, pin: null, flow: -1, since: "2026-10-01T00:00:00.000Z", minW: 980, minH: 600, kinds: { screen: "Screen" }, lightWord: { grey: "not graded" } };
  ok(MAP_CLIENT.length < 60000, `the client script is ${MAP_CLIENT.length} bytes (under 60 KB, the kit included)`);
  const lit = L.nodes.findIndex((n) => n.t === "screen");
  const run = runClient(MAP_CLIENT, data, { search: "?project=beta", respond: (u) => (u.startsWith("/map/lights") ? { at: "2026-10-01T00:05:00.000Z", lights: [{ id: L.nodes[lit].id || L.nodes[lit].r, light: "red", counts: { total: 1, graded: 1, passed: 0, failed: 1 } }] } : null) });
  ok(!run.errors.length && run.els.mx.classList.contains("mx-ready"), `the client boots over a ${L.nodes.length}-node layout without a throw${run.errors.length ? ` (${run.errors[0].message})` : ""}`);
  clickNode(run, lit);
  await run.flush();
  const pinned = run.fetches.find((f) => f.url.startsWith("/map/node?"));
  ok(!!pinned && pinned.url === `/map/node?ref=${encodeURIComponent(L.nodes[lit].r)}&project=beta` && pinned.init.headers.accept === "text/html", `a click pins the node: GET ${pinned && pinned.url} (the inspector's HTML, the page's project)`);
  ok(/node=screen%3As\d+/.test(run.ctx.location.search) && /project=beta/.test(run.ctx.location.search), `the URL carries the pin (${run.ctx.location.search})`);
  (run.window._listeners.focus || []).forEach((f) => f());
  await run.flush();
  const poll = run.fetches.find((f) => f.url.startsWith("/map/lights"));
  ok(!!poll && poll.url === `/map/lights?since=${encodeURIComponent(data.since)}&project=beta`, `the lights poll: GET ${poll && poll.url}`);
  ok(L.nodes[lit].l === "grey", "the layout handed in is not mutated (the client works on its own parse of the page's data)");
  const drawn = run.els["mx-units"].innerHTML;
  ok(new RegExp(`data-i="${lit}" data-t="screen" data-light="red"`).test(drawn) || /data-light="red"/.test(drawn), "a moved light redraws its node red");
  ok(/1 light changed/.test(run.els["mx-live"].textContent), `and says so to a screen reader ("${run.els["mx-live"].textContent.slice(0, 60)}")`);
  // the zoom keys zoom on the drawing, never on empty stage: zoomed in past 130% from fit, the nearest folded group opens
  const z = runClient(MAP_CLIENT, data, { search: "?project=beta" });
  let presses = 0;
  while (presses < 12 && !/opened/.test(z.els["mx-live"].textContent)) { z.els["mx-stage"].dispatch("keydown", { key: "=", preventDefault() {} }); presses++; }
  ok(/opened, \d+ nodes/.test(z.els["mx-live"].textContent) && parseInt(z.els["mx-zl"].textContent, 10) >= 130, `zooming in by keys opens the nearest folded group at ${z.els["mx-zl"].textContent} ("${z.els["mx-live"].textContent.slice(0, 60)}", ${presses} presses)`);
}

// ---- E. the page, over the importer's own fixture on a real SQLite ----
console.log("E · the page");
{
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON"); db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  db.exec("INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p-owner','Olive','owner','h1',1,'t',1); INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'t')");
  const cv = JSON.parse(readFileSync(join(ENGINE, "tools/fixtures/map-canvas.json"), "utf8"));
  const flows = JSON.parse(readFileSync(join(ENGINE, "tools/fixtures/flows-canvas.json"), "utf8"));
  seedModel(db, "alpha", { ...cv, flows: flows.flows, deps: flows.deps }, { by: "p-owner" });
  let stmts = 0, batches = 0;
  const exec = (sql, args) => ({ results: db.prepare(sql).all(...args) });
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), all: async () => { stmts++; return exec(sql, args); }, first: async () => { stmts++; return exec(sql, args).results[0] ?? null; }, _exec: () => exec(sql, args) });
  const env = { DB: { prepare: (sql) => stmt(sql), batch: async (list) => { batches++; stmts += list.length; return list.map((s) => s._exec()); } } };
  const m = await mapModelOf(env, "alpha");
  // D1b item 15: one more statement when the model holds dependency chains (their heads' live status, k_questions by key)
  const deps = m.nodes.filter((n) => n.type === "dep" && n.qid).length ? 1 : 0;
  ok(stmts === 3 + deps + Math.ceil((m.nodes.length + m.flows.length) / 90) && batches === 0, `the model read: the nodes, the links, the chains' live heads (${deps}), the lit probes (${LIT_CHUNK} ids a statement) and the stale marks (sprint 3 B4: one statement) (${stmts} statements, ${m.nodes.length} nodes, ${m.links.length} links, ${m.flows.length} flows)`);
  // D1b item 15: a chain heads an OPEN decision only while its question is open now (live status first, else the filed state)
  {
    // depOpen: imported above
    const live = new Map([["Q1", "open"], ["Q2", "decided"]]);
    ok(depOpen({ headKind: "question", qid: "Q1", headState: "decided" }, live) && !depOpen({ headKind: "question", qid: "Q2", headState: "open" }, live)
      && depOpen({ headKind: "question", qid: "Q9", headState: "open" }, live) && !depOpen({ headKind: "ruling", qid: "Q1", headState: "open" }, live),
      "depOpen: the question's live status decides (an open head ruled since is not open; a ruling's chain never is; an unknown qid keeps its filed state)");
  }
  const L = layoutOf(m);
  const pinIdx = L.nodes.findIndex((n) => n.t === "screen");
  const node = { ref: L.nodes[pinIdx].r, nodeId: L.nodes[pinIdx].id || L.nodes[pinIdx].r, kind: "screen", layer: "surfaces", state: "grey", title: L.nodes[pinIdx].n, what: "A screen — with a dash", checks: { total: 1, graded: 0, passed: 0, failed: 0 }, facts: {}, edges: { in: [], out: [{ ref: "api:GET /x", label: "calls" }] }, card: null, walk: null, model: { v: m.v } };
  const page = renderMapPage({ view: "canvas", project: "alpha", head: null, L, model: m, on: { screens: 1, doors: 1, data: 1 }, open: {}, pin: pinIdx, inspector: renderInspector(node, { open: 0 }), since: "t", v: m.v });
  const at = MAP_REGIONS.map((r) => page.indexOf(`data-region="${r}"`));
  ok(at.every((x) => x > 0) && at.every((x, i) => !i || x > at[i - 1]), `the four regions in order (${MAP_REGIONS.join(" · ")})`);
  const bad = [...page.matchAll(/<[^>]*\sdata-button="([^"]+)"[^>]*>/g)].filter((x) => !/\sdata-door="[^"]+"/.test(x[0]) && !/\sdata-client="[^"]+"/.test(x[0])).map((x) => x[1]);
  ok(!bad.length, `every data-button carries its door or data-client${bad.length ? ` (not: ${[...new Set(bad)].join(", ")})` : ""}`);
  ok(!/[—]|&mdash;/.test(page), "no em dash anywhere on the page (a model's own dashes drawn as hyphens)");
  const data = JSON.parse(page.slice(page.indexOf('id="mx-data">') + 13, page.indexOf("</script>", page.indexOf('id="mx-data">'))).replace(/\\u003c/g, "<"));
  ok(data.L.nodes.length === L.nodes.length && data.pin === pinIdx, "the data the page embeds parses, the pin with it");
  ok(/<aside class="mx-insp is-node"[^>]*data-region="inspector"/.test(page) && /data-node="screen:[^"]+" data-kind="screen" data-light="grey"/.test(page) && /data-checks="1"/.test(page) && /1 check names it: 0 graded/.test(page), "the pinned node's inspector is drawn with its hooks (data-node, data-kind, data-light, data-checks)");
  // the side panel's edges by NAME: the other end's name (cut, never wrapped), its ref the link's target and its title
  const named = renderInspector({ ...node, edges: { in: [{ ref: "screen:landing", name: "Landing page", label: "Open your account" }], out: [{ ref: "api:GET /x", label: "calls" }] } }, { open: 0 });
  ok(/<a href="\/map\?node=screen%3Alanding" data-button="select-node" data-door="GET \/map\/node" data-ref="screen:landing" title="screen:landing">Landing page<\/a><small title="Open your account">Open your account<\/small>/.test(named)
    && /data-ref="api:GET \/x" title="api:GET \/x">GET \/x<\/a>/.test(named) && !/>screen:landing</.test(named),
    "the inspector lists an edge by its other end's name (the ref stays its link and its title); with no name read, by the ref's own id");
  ok(/<svg class="mx-svg"[^>]*viewBox="[-\d. ]+" preserveAspectRatio="xMidYMin meet"/.test(page) && /class="mx-u mx-n mx-pin"/.test(page), "the first paint is the SVG in a viewBox the browser fits, the pinned node marked");
  const empty = renderMapPage({ view: "canvas", project: "none", L: layoutOf({ nodes: [], links: [], flows: [] }), model: {}, on: { screens: 1 } });
  ok(/data-state="empty"/.test(empty) && /\bpreview\b/.test(empty), "a model with no node draws EMPTY, naming preview (D1b item 11)");
  const down = renderMapPage({ view: "canvas", state: "unreachable", on: {} });
  ok(/data-state="unreachable"/.test(down), "a model that cannot be read draws UNREACHABLE");
}


// ---- the Screens view (the atlas) ----
const sha = (v) => createHash("sha256").update(String(v)).digest("hex");
// bigBoard(o) -> a GET /map/screens answer of 80 screens in four lanes (one with sparse steps), html renders (a live one and
// a wireframe one), a grammar on half of them, a nav chain, em dashes in names, labels and a grammar
function bigBoard({ lanes = true, steps = true, w = 390, h = 844, surface = "mobile", n = 80 } = {}) {
  const L = ["open", "money", "cards", "acct"], screens = [], edges = [];
  for (let i = 0; i < n; i++) {
    const lane = L[i % 4], step = Math.floor(i / 4) * (lane === "acct" ? 5 : 1);
    screens.push({ id: `screen:s${i}`, name: `Screen ${i}${i === 3 ? " \u2014 with a dash" : ""}`, lane: lanes ? lane : null, step: steps ? step : null, status: i === 5 ? "retired" : "planned",
      states: i % 3 ? ["default", "error"] : ["ready", "loading"], light: ["grey", "green", "amber", "red"][i % 4], checks: { total: 1, graded: 1, passed: 1, failed: 0 },
      renders: i % 5 === 0 ? [] : [{ state: i % 3 ? "default" : "ready", variant: "live", format: "html", hash: sha("r" + i), bytes: 4000, width: w, height: h, style: "app" },
        { state: i % 3 ? "error" : "loading", variant: "wireframe", format: "html", hash: sha("w" + i), bytes: 900, width: w, height: h, style: "app" }],
      wireframe: i % 2 ? [{ kind: "header", label: "Head \u2014 dashed" }, { kind: "title", label: "Title" }, { kind: "list", items: 3 }, { kind: "button", label: "Go", emphasis: true }] : null });
    if (i) edges.push({ from: `screen:s${i - 1}`, to: `screen:s${i}`, label: i === 7 ? "Next \u2014 step" : "next" });
    if (i >= 4) edges.push({ from: `screen:s${i - 4}`, to: `screen:s${i}`, label: "on" });
  }
  return { project: "big", surfaces: [{ key: surface, name: "Mobile", screens: n }], surface, lanes: L.map((k) => ({ key: k, name: k === "open" ? "Open \u2014 an account" : `Lane ${k}` })),
    screens, edges, styles: { app: sha("css") } };
}
console.log("F · the Screens view's layout");
{
  const b = bigBoard();
  const A = atlasLayout(b), A2 = atlasLayout(bigBoard());
  ok(JSON.stringify(A) === JSON.stringify(A2) && A.f.length === 80, `the same board lays out the same atlas, byte for byte (${JSON.stringify(A).length} bytes, ${A.f.length} frames)`);
  ok(A.lanes.map((l) => l.k).join(" ") === "open money cards acct" && A.lanes[0].n === "Open - an account", `lanes in the board's order (${A.lanes.map((l) => `${l.n} ${l.m.length}`).join(", ")})`);
  const acct = A.lanes[3].m.map((i) => A.f[i]);
  ok(acct.map((f) => f.c).join(",") === acct.map((_, i) => i).join(","), `a lane's sparse steps (0, 5, 10 ...) draw as dense columns (${acct.slice(0, 5).map((f) => f.c).join(", ")} ...)`);
  const stk = atlasLayout({ ...b, screens: [...b.screens.slice(0, 4), { ...b.screens[4], id: "screen:twin", lane: "open", step: 0 }] });
  const twins = stk.lanes[0].m.map((i) => stk.f[i]).filter((f) => f.c === 0);
  ok(twins.length === 2 && twins[0].x === twins[1].x && twins[1].y - twins[0].y === 22 + stk.dev.fh + 40 && twins.map((f) => f.k).join(",") === "0,1", "two screens on one step stack in their column");
  // the wrap: one lane of 40 steps is cut in rows so the board keeps a screen's shape; a short lane is one row
  const one = atlasLayout({ project: "w", surface: "app", lanes: [{ key: "l", name: "L" }], screens: Array.from({ length: 40 }, (_, i) => ({ id: `screen:x${i}`, name: `X${i}`, lane: "l", step: i, renders: [] })), edges: [] });
  const rows = new Set(one.f.map((f) => f.y)).size, cols = new Set(one.f.map((f) => f.x)).size;
  ok(rows > 1 && cols < 40 && Math.abs(Math.log(one.W / one.H / 1.5)) < Math.abs(Math.log((40 * (PHONE.fw + 88)) / (40 + 22 + one.dev.fh + 80) / 1.5)), `a lane of 40 wraps into ${rows} rows of ${cols} (${one.W} x ${one.H}), a lane of 3 stays one row`);
  ok(new Set(atlasLayout({ ...one, screens: one.f.slice(0, 3).map((f, i) => ({ id: f.r, name: f.n, lane: "l", step: i })) }).f.map((f) => f.y)).size === 1, "a short lane is never wrapped");
  // no lane, no step: the nav edges' layering (a -> b, a -> c, b -> d, c -> d; e alone; f <-> g a cycle with no way in)
  const g = atlasLayout({ project: "g", surface: "web", screens: ["a", "b", "c", "d", "e", "f", "g"].map((x) => ({ id: "screen:" + x, name: x.toUpperCase(), renders: [] })),
    edges: [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["f", "g"], ["g", "f"]].map(([x, y]) => ({ from: "screen:" + x, to: "screen:" + y, label: "go" })) });
  const col = (x) => g.f.find((f) => f.id === x).c;
  ok(g.lanes.length === 1 && g.lanes[0].n === "Every screen" && [col("a"), col("b"), col("c"), col("d"), col("e"), col("f"), col("g")].join("") === "0112001",
    `with no lane and no step, the nav edges lay it out (a ${col("a")}, b ${col("b")}, c ${col("c")}, d ${col("d")}, e ${col("e")}, the cycle f ${col("f")} g ${col("g")})`);
  const flat = atlasLayout({ project: "g", surface: "web", screens: Array.from({ length: 10 }, (_, i) => ({ id: "screen:n" + i, name: "N" + i })), edges: [] });
  ok(flat.f.map((f) => f.c).join("") === "0000111122" && Math.max(...flat.f.map((f) => f.k)) === 3, `with no edge either, the screens of one layer spread over columns of at most four (${flat.f.map((f) => f.c).join("")}), never a tower`);
  // the device
  const dev = (key, rs) => deviceOf(key, rs ? [{ renders: rs }] : []);
  const wide = dev("app", [{ width: 1440, height: 900, format: "html" }, { width: 1440, height: 900, format: "html" }, { width: 390, height: 844, format: "html" }]);
  ok(wide.kind === "wide" && wide.fw === WIDE.fw && wide.fh === Math.round(WIDE.fw * 900 / 1440) && dev("mobile", [{ width: 390, height: 844 }]).kind === "phone"
    && dev("admin").kind === "wide" && dev("web").kind === "wide" && dev("mobile").kind === "phone" && dev("zzz").kind === "phone" && dev("zzz").from === "default",
    `the device: the renders' most common size (1440 x 900 wide, 390 x 844 a phone), else the surface's key (admin, web wide; mobile a phone), else a phone`);
  ok(!/[\u2014\u2013]/.test(JSON.stringify(A)), "every string drawn or embedded is cut of its em dashes (names, lanes, labels, a grammar's labels)");
  const st = (A0, name) => A0.st.indexOf(name);
  ok(A.si === st(A, "ready") && A.s0 === A.si && atlasLayout(b, { state: "error" }).si === st(A, "error") && atlasLayout(b, { state: "*" }).si === -1 && atlasLayout(b, { state: "nope" }).si === A.s0
    && atlasLayout({ ...b, screens: b.screens.map((x) => ({ ...x, states: ["default"], renders: [] })) }).si === -1,
    `the states: the union (${A.st.join(", ")}); "ready" by default when the app has it, else each screen's own first (-1); ?state= picks one, * each screen's first`);
  const f1 = A.f.find((f) => f.id === "s1");
  ok(A.sty[f1.rs[0][7]] === b.styles.app && A.sty.length === 1 && f1.rs[0][3] === b.screens[1].renders[0].hash, "a render carries its style (each style's hash once in the data): its body's URL names it, so the browser keeps it");
}

console.log("G · the atlas kit, embedded alone");
{
  const A = atlasLayout(bigBoard()), K = atlasKit();
  const alone = vm.runInNewContext(`var __name=function(t){return t;};(${strip(atlasKit.toString())})()`, {});
  const v1 = { s: 0.2, tx: 0, ty: 0 }, v2 = { s: 1, tx: -A.f[10].x + 300, ty: -A.f[10].y + 200 }, z = { w: 900, h: 700 };
  const same = A.f.every((f, i) => [-1, 0, 1, 2].every((si) => ["render", "wire"].every((m) => JSON.stringify(K.show(A, f, si, m)) === JSON.stringify(alone.show(A, f, si, m)))))
    && K.edges(A) === alone.edges(A) && JSON.stringify(K.plan(A, v2, z, 6, -1, "render")) === JSON.stringify(alone.plan(A, v2, z, 6, -1, "render")) && K.block(A, 3, A.si) === alone.block(A, 3, A.si);
  ok(same && !/\bimport\b|\brequire\(/.test(atlasKit.toString()) && !("wire" in K), "the kit alone answers what the server's does (show, edges, plan, block) and names nothing outside its body; it draws no wireframe of its own");
  // what a frame shows, and the order it falls back in (state indices: 0 a, 1 b, 2 c)
  const At = { st: ["a", "b", "c"], s0: -1, f: [] };
  const R = (s, v, fmt = "html") => [s, v, fmt, sha(`${s}${v}${fmt}`), 390, 844, 100, ""];
  const fr = (st, rs, w = null) => ({ st, rs, w });
  const G = [{ kind: "title", label: "T" }];
  const cases = [
    ["this state's real render, no tag", fr([0, 1], [R(1, "wireframe"), R(1, "live")]), 1, "render", "html:live:"],
    ["the screen-as-a-whole render (no state) fits every state", fr([0, 1], [R(-1, "live")]), 1, "render", "html:live:"],
    ["another state's real render, its state in the corner", fr([0, 1], [R(0, "live")]), 1, "render", "html:live:a"],
    ["no real render: this state's wireframe, 'wireframe' in the corner", fr([0, 1], [R(1, "wireframe")], G), 1, "render", "html:wireframe:wireframe"],
    ["then the screen's own first state's wireframe", fr([0, 1], [R(2, "wireframe"), R(0, "wireframe")]), 1, "render", "html:wireframe:wireframe"],
    ["then the grammar", fr([0, 1], [R(2, "wireframe")], G), 1, "render", "wire::wireframe"],
    ["then another state's wireframe", fr([0, 1], [R(2, "wireframe")]), 1, "render", "html:wireframe:wireframe"],
    ["nothing: an outline, 'no render'", fr([0, 1], []), 1, "render", "none::no render"],
    ["Wireframe forces the wireframe over a real render", fr([0, 1], [R(1, "live"), R(1, "wireframe")]), 1, "wire", "html:wireframe:"],
    ["Wireframe with a real render only: 'no wireframe'", fr([0, 1], [R(1, "live")]), 1, "wire", "none::no wireframe"],
    ["Wireframe falls to the grammar", fr([0, 1], [R(1, "live")], G), 1, "wire", "wire::"],
    ["each screen's own first state (-1)", fr([2, 0], [R(2, "live"), R(0, "live")]), -1, "render", "html:live:"],
    ["a wireframe-format render is a wireframe", fr([0], [R(0, "", "wireframe")]), 0, "render", "wire::wireframe"],
  ];
  const got = (f, si, m) => { const x = K.show(At, f, si, m); return `${x.k}:${x.r ? x.r[1] : ""}:${x.tag}`; };
  const bad = cases.filter(([, f, si, m, want]) => got(f, si, m) !== want).map(([w, f, si, m, want]) => `${w}: ${got(f, si, m)} want ${want}`);
  ok(!bad.length, `what a frame shows falls back render -> another state's -> the wireframe -> nothing, and Wireframe forces one (${cases.length} cases)${bad.length ? `\n      ${bad.join("\n      ")}` : ""}`);
  ok(K.lod(19) === 0 && K.lod(20) === 1 && K.lod(109) === 1 && K.lod(110) === 2 && K.lod(9999) === 2, "the level of detail by a frame's width on screen (sprint 3 B4: was 56 and 150): under 20 px an outline, under 110 the wireframe or a picture, then an html render too");
  // a picture comes before an html render (sprint 3 B4): at level 1 an IMAGE render may load (at most 2 x live), an html one never
  const Ai = { ...A, f: A.f.map((f) => ({ ...f, rs: f.rs.map((r) => [r[0], r[1], "image", ...r.slice(3)]) })) };
  const vLv1 = { s: 60 / A.dev.fw, tx: v2.tx * (60 / A.dev.fw) / v2.s, ty: v2.ty * (60 / A.dev.fw) / v2.s };
  const p1 = K.plan(Ai, vLv1, z, 6, Ai.si, "render"), p1h = K.plan(A, vLv1, z, 6, A.si, "render");
  const imgs = p1.near.filter((o) => o.may).length;
  ok(p1.lv === 1 && imgs > 0 && imgs <= 12 && p1h.near.every((o) => !o.may), `at a 60 px frame (level 1) ${imgs} image renders may load (at most 12, 2 x live), html renders none`);
  // the plan: at fit nothing loads; close in, the nearest LIVE (and no more) may load, far frames are released
  const fit = K.plan(A, { s: 0.12, tx: 0, ty: 0 }, z, 6, A.si, "render");
  const near = K.plan(A, v2, z, 6, A.si, "render"), mays = near.near.filter((o) => o.may).map((o) => o.k);
  const dist = (k) => Math.hypot(A.f[k].x + A.dev.fw / 2 - (-v2.tx + z.w / 2), A.f[k].y + A.dev.fh / 2 - (-v2.ty + z.h / 2));
  ok(fit.lv === 1 && fit.near.every((o) => !o.may) && near.lv === 2 && mays.length === 6 && near.out.length > 0 && near.near.length + near.out.length === A.f.length
    && Math.max(...mays.map(dist)) <= Math.min(...near.near.filter((o) => !o.may && K.show(A, A.f[o.k], A.si, "render").k === "html").map((o) => dist(o.k)).concat([Infinity])),
    `the plan: at fit (24 px frames: lv ${fit.lv}, wireframes, sprint 3 B4) no html render loads; close in (lv ${near.lv}) the ${mays.length} nearest html frames may, ${near.near.length - mays.length} more near are drawn without, ${near.out.length} far are released`);
  ok(K.plan(A, v2, z, 0, A.si, "render").near.every((o) => !o.may) && K.plan(A, v2, z, 6, A.si, "wire").near.filter((o) => o.may).length <= 6, "a budget of none loads none; Wireframe mode loads only wireframe renders");
  const a = { x: 0, y: 0, w: 200, h: 400 }, fwd = K.path(a, { x: 300, y: 0, w: 200, h: 400 }), back = K.path({ x: 300, y: 0, w: 200, h: 400 }, a), m = K.mid(a, { x: 300, y: 0, w: 200, h: 400 });
  ok(/^M202 200C/.test(fwd) && / 298 200$/.test(fwd) && /^M400 402C400 4\d\d/.test(back) && m.x > 200 && m.x < 300, `the curves: forward from a's right to b's left (${fwd}); back under both (${back.slice(0, 18)}...); a label at the middle (${m.x}, ${m.y})`);
  const fl = K.flow(A, A.lanes[1].m[2]);
  ok(fl.join() === A.lanes[1].m.join() && fl.indexOf(A.lanes[1].m[2]) === 2, "the viewer's previous and next: the frame's lane in reading order");
  const blk = K.block(A, 3, A.si);
  ok(/data-region="screen-renders"/.test(blk) && (blk.match(/data-button="open-full" data-client="[^"]+"/g) || []).length === A.f[3].st.length + 1 && /aria-current="true"/.test(blk) && !/[\u2014]/.test(blk) && /Open full size/.test(blk),
    "the pinned screen's block: a chip per state (each opens the viewer, client-side), the current one marked, its renders, Open full size");
  // THE ONE WIREFRAME DRAWER, embedded alone exactly as the page ships it: evaluated in an empty context (a name from outside
  // its body would throw), it draws what the server's drawWireframe draws, byte for byte, for every frame's grammar
  const WF = vm.runInNewContext(`var __name=function(t){return t;};(${strip(wireframeSvg.toString())})`, {});
  const grams = A.f.map((f) => f.w).filter(Boolean);
  const wfSame = grams.length > 0 && grams.every((g) => [[390, 844, false], [1440, 900, true]].every(([w, h, inset]) => WF(g, { width: w, height: h, inset }) === drawWireframe(g, { width: w, height: h, inset })));
  ok(wfSame && !/\bimport\b|\brequire\(/.test(wireframeSvg.toString()) && ATLAS_CLIENT.includes("var WIREFRAME=" + strip(wireframeSvg.toString()) + ";") && !/K\.wire\b/.test(ATLAS_CLIENT),
    `ONE wireframe drawer: the page embeds src/wireframe.js wireframeSvg, and alone it draws the server's SVG byte for byte (${grams.length} grammars, phone and wide, inset and not)`);
  // every block of the grammar is drawn (a spacer is room only), inside the frame's own viewBox; inset in a device frame: no
  // outline of its own and hidden from assistive tech; stray data (an unknown kind, a count out of range) never throws
  const inner = (svg) => svg.slice(svg.indexOf('overflow="hidden">'));
  const blocksDrawn = WIREFRAME_BLOCKS.filter((kind) => kind === "spacer" || /<(rect|circle|text|line|path) /.test(inner(WF([{ kind, label: "L", lines: 2, items: 3 }], { width: 390, height: 844 }))));
  const wide = WF([{ kind: "header" }], { width: 1440, height: 900, inset: true });
  ok(blocksDrawn.length === WIREFRAME_BLOCKS.length && /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="wf" viewBox="0 0 1440 900"/.test(wide) && /aria-hidden="true"/.test(wide) && !/stroke-dasharray|rx="14"/.test(wide)
    && /<text[^>]*>L<\/text>/.test(WF([{ kind: "button", label: "L", emphasis: true }], { width: 390, height: 844 })) && typeof WF([{ kind: "carousel", items: 99 }, null, 7], { width: 390 }) === "string",
    `the one drawer draws every block of the grammar (${blocksDrawn.length} of ${WIREFRAME_BLOCKS.length}) in the frame's own viewBox, with its labels; inset it draws no outline and is hidden from assistive tech`);
  const edgesSvg = K.edges(A);
  ok((edgesSvg.match(/<path class="ax-e/g) || []).length === A.e.length / 3 && /class="ax-e ax-en"/.test(edgesSvg), `every transition drawn once (${A.e.length / 3}), a step to the next frame plain, a longer reach faint`);
}

console.log("H · the atlas client");
{
  const A = atlasLayout(bigBoard());
  const data = { A, pin: -1, full: false, since: "2026-10-01T00:00:00.000Z", lightWord: { grey: "not graded" } };
  ok(ATLAS_CLIENT.length < 60000, `the Screens view's script is ${ATLAS_CLIENT.length} bytes (under 60 KB, the view kit and the atlas kit included)`);
  const run = runAtlas(ATLAS_CLIENT, data, { search: "?project=beta" });
  ok(!run.errors.length && run.els.mx.classList.contains("mx-ready"), `the client boots over ${A.f.length} frames without a throw${run.errors.length ? ` (${run.errors[0].message})` : ""}`);
  // A2 (sprint 5): a fold of the rail or the panel resizes the stage — a board still at its fit RE-FITS to the new size
  // (it used to only re-centre, sized for the old stage); a board the person zoomed keeps its zoom, re-centred
  {
    const rz = runAtlas(ATLAS_CLIENT, data, { search: "?project=beta", resize: true });
    rz.tick();
    const zl = () => rz.els["ax-zl"].textContent, st = rz.els["ax-stage"];
    const z0 = zl();
    st.clientWidth = 560; rz.resize(); rz.tick();
    const z1 = zl();
    st.dispatch("keydown", { key: "+", target: st, preventDefault() {} });   // the person zooms in (the stage's own keys)
    rz.tick(); rz.tick();
    const z2 = zl();
    st.clientWidth = 900; rz.resize(); rz.tick();
    const z3 = zl();
    ok(!rz.errors.length && z0 && z1 && parseInt(z1) < parseInt(z0) && z2 !== z1 && z3 === z2,
      `A2 · a fold re-fits a board still at its fit (${z0} → ${z1} on a narrower stage); once zoomed (${z2}) a fold keeps the zoom (${z3})${rz.errors.length ? " · " + rz.errors[0].message : ""}`);
  }
  run.tick(); run.tick();
  clickFrame(run, 3);
  await run.flush();
  const pinned = run.fetches.find((f) => f.url.startsWith("/map/node?"));
  ok(!!pinned && pinned.url === `/map/node?ref=${encodeURIComponent(A.f[3].r)}&project=beta` && pinned.init.headers.accept === "text/html" && run.ctx.location.search.includes("screen=" + A.f[3].id),
    `a click pins the frame: GET ${pinned && pinned.url} (the Map's inspector), the URL carries ?screen= (${run.ctx.location.search})`);
  (run.window._listeners.focus || []).forEach((f) => f());
  await run.flush();
  const poll = run.fetches.find((f) => f.url.startsWith("/map/lights"));
  ok(!!poll && poll.url === `/map/lights?since=${encodeURIComponent(data.since)}&project=beta`, `the live lights: GET ${poll && poll.url}`);
  ok(!run.errors.length, `no throw after the timers, a pin and a poll${run.errors.length ? ` (${run.errors[0].message})` : ""}`);
  // the sandbox: an html render is only ever an <iframe sandbox=""> (no token), an image an <img>; a body is never read as text
  const src = ATLAS_CLIENT;
  const frames = (src.match(/createElement\('iframe'\)/g) || []).length, sandboxed = (src.match(/setAttribute\('sandbox',''\)/g) || []).length;
  ok(frames === 1 && sandboxed === 1 && /<iframe sandbox=""/.test(src) && !/allow-scripts|allow-same-origin|srcdoc|allow-top|allow-popups/.test(src)
    && (src.match(/fetch\(renderUrl\(/g) || []).length === 1 && /fetch\(renderUrl\(h,-1\)[^;]*r\.json\(\)/.test(src),
    "html renders only in <iframe sandbox=\"\"> (no allow-scripts, no allow-same-origin, no srcdoc), a body fetched only as a wireframe's JSON, never put in the page");
  // D6a (Part 5): Escape off a pin leaves the keyboard ring on the frame that was pointed (never the one nearest the middle); the
  // minimap gives way while a frame's caption sits under it; a plate's line wraps inside its frame (source checks: the fake DOM
  // draws no frame boxes; the shots of ?screen= show it)
  ok(/if\(S\.pin>=0\)\{var was=S\.pin;unpin\(\);focusF\(was\);stage\.focus\(\);return;\}/.test(src) && /V\.miniView\(mini,box\(\)\);miniUnder\(\);/.test(src)
    && /mini\.classList\.toggle\('ax-mini-under',u\)/.test(src),
    "the atlas client: Escape keeps the ring on the pointed frame; the minimap gives way over a caption");
  const ph = runAtlas(ATLAS_CLIENT, data, { search: "?project=beta", phone: true });
  ok(!ph.errors.length, `at phone width the client boots as the list of rows${ph.errors.length ? ` (${ph.errors[0].message})` : ""}`);
}

// ---- the wheel, the same on both views (sprint 3 B4, found while recording the walkthrough: measured in Chrome, a ctrl+wheel
// mouse notch zoomed 2.2x and a plain wheel panned the fitted Screens board out of view) ----
console.log("H2 · the wheel: the Map and the Screens view behave the same");
{
  const viewOf = (t) => { const m = /translate\(([-\d.]+)(?:px)?[, ]+([-\d.]+)(?:px)?\) scale\(([-\d.]+)\)/.exec(String(t || "")); return m ? { tx: +m[1], ty: +m[2], s: +m[3] } : null; };
  const wheel = (run, stageId, o) => run.els[stageId].dispatch("wheel", { deltaX: 0, deltaY: 0, deltaMode: 0, clientX: 450, clientY: 310, ctrlKey: false, metaKey: false, target: { closest: () => null }, preventDefault() {}, ...o });
  const L = layoutOf(bigModel());
  const mapData = { L, on: { screens: 1, doors: 1, data: 1 }, open: {}, pin: null, flow: -1, since: "", minW: 980, minH: 600, kinds: {}, lightWord: {} };
  const A = atlasLayout(bigBoard());
  // the drawing's height in world units (its bottom edge is where a pan stops: 160 px, the kit's KEEP, from the stage's top)
  const views = [["the Map", runClient(MAP_CLIENT, mapData, { search: "?project=beta" }), "mx-stage", (r) => viewOf(r.els["mx-world"].getAttribute("transform")), NaN],
    ["the Screens view", runAtlas(ATLAS_CLIENT, { A, pin: -1, full: false, since: "", lightWord: {} }, { search: "?project=beta" }), "ax-stage", (r) => viewOf(r.els["ax-world"].style.transform), A.H]];
  const said = [];
  for (const [name, run, stageId, read, H] of views) {
    const v0 = read(run);
    wheel(run, stageId, { deltaY: -100, ctrlKey: true });
    const v1 = read(run);
    for (let i = 0; i < 40; i++) wheel(run, stageId, { deltaY: 400 });
    const v2 = read(run);
    for (let i = 0; i < 10; i++) wheel(run, stageId, { deltaY: 400 });
    const v3 = read(run);
    const step = v1 && v0 ? v1.s / v0.s : 0;
    // after 16,000 px of plain wheel the drawing is still in view: its bottom edge at least a third of the stage (or 160 px) down
    ok(!run.errors.length && v0 && Math.abs(step - Math.pow(0.992, -28)) < 0.01 && v2 && v2.s === v1.s && v2.ty < v1.ty && v3 && v3.ty === v2.ty && 160 - v2.ty > 0 && (!Number.isFinite(H) || 160 - v2.ty <= H * v2.s * 1.5 + 1),
      `${name}: a ctrl+wheel notch (deltaY -100) zooms ${step.toFixed(3)}x about the pointer (one capped step, not 2.2x); 40 plain notches pan, never zoom, and stop at the drawing's edge (ty ${v1 && v1.ty.toFixed(0)} -> ${v2 && v2.ty.toFixed(0)}, then ${v3 && v3.ty.toFixed(0)})${run.errors.length ? ` (${run.errors[0].message})` : ""}`);
    said.push([step.toFixed(3), v2 && v2.ty.toFixed(0)]);
  }
  ok(said[0][0] === said[1][0], `the same zoom step on both views (${said.map((x) => x[0]).join(" and ")})`);
}

console.log("I · the Screens page");
{
  const b = bigBoard(), A = atlasLayout(b);
  const page = renderAtlasPage({ project: "big", board: b, A, surfaceName: "Mobile", since: "t" });
  const at = ATLAS_REGIONS.map((r) => page.indexOf(`data-region="${r}"`));
  ok(at.every((x) => x > 0) && at.every((x, i) => !i || x > at[i - 1]), `its regions in order (${ATLAS_REGIONS.join(" · ")})`);
  const bad = [...page.matchAll(/<[^>]*\sdata-button="([^"]+)"[^>]*>/g)].filter((x) => !/\sdata-door="[^"]+"/.test(x[0]) && !/\sdata-client="[^"]+"/.test(x[0])).map((x) => x[1]);
  ok(!bad.length, `every data-button carries its door or data-client${bad.length ? ` (not: ${[...new Set(bad)].join(", ")})` : ""}`);
  ok(!/[\u2014]|&mdash;/.test(page), "no em dash anywhere on the page");
  const links = (page.match(/<li class="ax-f[^"]*" data-i="\d+"[^>]*><a class="ax-cap" href="\/map\/screens\?surface=mobile&amp;screen=[^"&]+&amp;project=big"/g) || []).length;
  ok(links === A.f.length && (page.match(/<section class="ax-lane"/g) || []).length === A.lanes.length && (page.match(/<ol class="ax-row">/g) || []).length === A.lanes.length,
    `every frame is a link in its lane's list (${links} links, ${A.lanes.length} lanes): what assistive tech reads, what works without script`);
  ok(!/<iframe|<img\b/.test(page.replace(/<script>[\s\S]*?<\/script>/g, "")) && !page.includes(b.screens[1].renders[0].hash + '"') === false,
    "the page itself holds no iframe and no image: renders are loaded by the client, by zoom");
  const data = JSON.parse(page.slice(page.indexOf('id="ax-data">') + 13, page.indexOf("</script>", page.indexOf('id="ax-data">'))));
  ok(data.A.f.length === A.f.length && data.pin === -1, "the data the page embeds parses");
  ok(/<option value="" selected title="Each screen in its own first state">first state<\/option>/.test(renderAtlasPage({ project: "big", board: b, A: atlasLayout({ ...b, screens: b.screens.map((x) => ({ ...x, states: ["default"], renders: [] })) }), surfaceName: "Mobile" }))
    && /<option value="ready" selected>ready/.test(page), "the state switch: \"ready\" when the app has it, else each screen's first");
  const pinned = renderAtlasPage({ project: "big", board: b, A, surfaceName: "Mobile", pin: 3, inspector: '<div class="mx-node" data-node="screen:s3"></div>' });
  ok(/<aside class="mx-insp is-node"[^>]*data-region="inspector"/.test(pinned) && /data-node="screen:s3"/.test(pinned) && /data-region="screen-renders"/.test(pinned) && /class="ax-f ax-pin" data-i="3"/.test(pinned),
    "a pinned screen: the Map's inspector, then its states and renders, the frame marked");
  const empty = renderAtlasPage({ project: "big", board: { project: "big", surfaces: [], surface: null, lanes: [], screens: [], edges: [], styles: {} }, A: null });
  ok(/data-state="empty"/.test(empty) && empty.includes("kind: &quot;node&quot;") && empty.includes("kind: &quot;render&quot;") && empty.includes("preview") && SCREEN_CALL("big").includes('project: "big"'),
    "a project with no screen draws EMPTY with the exact preview call (a screen node and its render)");
  ok(/data-state="unreachable"/.test(renderAtlasPage({ project: "big", state: "unreachable" })), "screens that cannot be read draw UNREACHABLE");
  // the apps bar: a pill only for an app (surface) with at least one screen; surfaces with none draw no pill, and when no
  // surface has a screen the project's own EMPTY (the call that files a first screen) shows
  const pills = (html) => [...html.matchAll(/data-button="surface-switch"[^>]*data-surface="([^"]*)"/g)].map((x) => x[1]);
  const mixed = { ...b, surfaces: [{ key: "mobile", name: "Mobile", screens: b.screens.length }, { key: "r-doors", name: "Doors", screens: 0 }, { key: "data-plane", name: "Data plane", screens: 0 }] };
  const bare0 = { project: "big", surfaces: [{ key: "r-doors", name: "Doors", screens: 0 }, { key: "data-plane", name: "Data plane", screens: 0 }], surface: "r-doors", lanes: [], screens: [], edges: [], styles: {} };
  const noApp = renderAtlasPage({ project: "big", board: bare0, A: null, surfaceName: "Doors" });
  ok(pills(renderAtlasPage({ project: "big", board: mixed, A, surfaceName: "Mobile" })).join() === "mobile" && !pills(noApp).length && /data-state="empty"/.test(noApp)
    && noApp.includes("No screen is filed for this project yet") && noApp.includes("kind: &quot;render&quot;") && !noApp.includes("Doors has no screen"),
    `the apps bar draws a pill only for an app with a screen (mobile; not r-doors, not data-plane); surfaces with no screen at all draw the project's EMPTY with the call`);
  // an app whose screens hold wireframes and no real render opens on Wireframe (Render would draw the same wireframes), with
  // no line of instructions over the frames; the address's mode still wins, and an app with a real render opens on Render
  const wireOnly = { ...b, screens: b.screens.map((x, i) => ({ ...x, renders: [], wireframe: x.wireframe || [{ kind: "title", label: `S${i}` }] })) };
  const pressed = (html) => (/data-mode="(\w+)" aria-pressed="true"/.exec(html) || [])[1];
  const wA = atlasLayout(wireOnly), wR = atlasLayout(wireOnly, { mode: "render" });
  const bare = renderAtlasPage({ project: "big", board: wireOnly, A: wA, surfaceName: "Mobile" });
  ok(wA.mode === "wire" && wA.dm === "wire" && pressed(bare) === "wire" && wR.mode === "render" && wR.dm === "wire" && A.mode === "render" && A.dm === "render" && pressed(page) === "render"
    && !/ax-quiet|has a render yet|through <code>preview/.test(bare),
    `an app with wireframes and no render opens on Wireframe (${wA.mode}; asked render: ${wR.mode}; an app with renders: ${A.mode}), no instruction over the frames`);
}

// ---- J. the Arch view under the Map's toolbar (sprint 3; its own cases: tools/arch-selftest.mjs) ----
console.log("J · the Arch view in the Map page");
{
  const arch = { diagram: { groups: [{ id: "g", label: "The product", order: 1 }], nodes: [{ id: "w", group: "g", kind: "worker", title: "The worker" }, { id: "d", group: "g", kind: "data", title: "D1" }],
    edges: [{ from: "w", to: "d", label: "one batch", main: true }] }, crossing: [{ rule: "Only the worker writes D1.", nodes: ["w", "d"] }] };
  const body = { regions: { lanes: [], seam: { door: "contracts/door.json", counts: { rest: 3, tools: 2 } }, "org-worker": { name: "w", data: [], projects: [], active: 1 }, "crossing-rules": arch.crossing } };
  const html = renderMapPage({ view: "arch", project: "p", arch: body, architecture: arch, anonymous: true });
  const regs = [...html.matchAll(/data-region="([^"]+)"/g)].map((m) => m[1]);
  ok(["layers", "lanes", "crossing-rules", "seam", "org-worker"].every((r) => regs.includes(r)) && /data-view="arch"/.test(html) && /<script>[\s\S]*ARCHKIT/.test(html) && /data-lane="g"/.test(html) && /id="ar-play"/.test(html),
    `Map · Arch: the toolbar, the four regions, the diagram's band, Play and its script (${regs.join(", ")})`);
  const old = renderMapPage({ view: "arch", project: "p", arch: body, diagram: arch.diagram, anonymous: true });
  ok(/data-lane="g"/.test(old) && /id="ar-play"/.test(old), "a caller handing only the diagram still draws it");
}

// ---- D6a (Part 5, the Doors view): a column drawn ALONE wraps its groups into side-by-side columns of even height; with
// another layer on, or at phone width (S.narrow), it stays one column, so the links between columns never move ----
{
  const K = mapKit();
  const L = layoutOf(bigModel());
  const doorCol = L.cols.find((c) => c.k === "door");
  const dxs = (S) => { K.stack(L, S); return doorCol.g.map((gi) => L.groups[gi].dx || 0); };
  const open = {}; for (const gi of doorCol.g) open[L.groups[gi].id] = true;   // open groups: the tallest stack
  const alone = dxs({ on: { doors: 1 }, open }), wAlone = L.W;
  const cols = [...new Set(alone)].sort((a, b) => a - b);
  const tallest = Math.max(...doorCol.g.map((gi) => L.groups[gi].y + L.groups[gi].h));
  const withScreens = dxs({ on: { screens: 1, doors: 1 }, open }), narrow = dxs({ on: { doors: 1 }, open, narrow: true });
  ok(cols.length > 1 && cols.length <= 4 && cols.every((x, i) => x === i * (doorCol.w + 40)) && wAlone >= doorCol.x + doorCol.w + cols[cols.length - 1]
    && withScreens.every((x) => x === 0) && narrow.every((x) => x === 0),
    `the Doors view alone: ${doorCol.g.length} groups in ${cols.length} columns (offsets ${cols.join(", ")}, the drawn width ${wAlone}, the tallest ${tallest}); with Screens on, or at phone width, one column`);
  K.stack(L, { on: { doors: 1 }, open });
  const svg = K.units(L, { on: { doors: 1 }, open, pin: -1 });
  const xs = new Set([...svg.matchAll(/data-g="\d+" transform="translate\(([\d.]+) /g)].map((m) => +m[1]));
  const b = K.box(L, L.groups[doorCol.g[doorCol.g.length - 1]].m[0]);
  ok(xs.size === cols.length && b.x === doorCol.x + L.groups[doorCol.g[doorCol.g.length - 1]].dx, `the drawing and the hit boxes follow the wrap: group heads at ${[...xs].join(", ")}, a node of the last group at x ${b.x}`);
  // the embedded client draws the same (MAP_CLIENT carries mapKit by toString): S.narrow follows the phone query on every stack
  ok((MAP_CLIENT.match(/S\.narrow=phone\.matches;K\.stack\(L,S\)/g) || []).length === 2, "the browser restacks with S.narrow from the phone query, both times it stacks");
}

// ---- K. the folds (M1, M5) ----
console.log("K · the folds: the rail, the panel, a column");
{
  const F = foldKit();
  const e = F.parse(null), junk = [F.parse("{"), F.parse("[1]"), F.parse('"x"'), F.parse({ rail: "yes", panel: 1, lanes: [], cols: { p: "door" } })];
  ok(JSON.stringify(e) === '{"rail":false,"panel":false,"lanes":{},"cols":{}}' && junk.every((x) => JSON.stringify(x) === JSON.stringify(e)), "the store: nothing kept, or anything foreign, reads as both open and nothing folded");
  const long = F.parse({ cols: { p: Array.from({ length: 90 }, (_, i) => "c" + i).concat(["c1", "x".repeat(200)]) }, lanes: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ["p" + i, ["a"]])) });
  ok(long.cols.p.length === 40 && Object.keys(long.lanes).length === 24, "a store grown past its caps is cut (40 ids a project, 24 projects, no repeat, no id over 120)");
  const r1 = F.flip(e, "rail"), both = F.alone(r1), none = F.alone(both);
  ok(r1.rail && !r1.panel && F.attr(r1) === "rail" && both.rail && both.panel && F.attr(both) === "rail panel" && !none.rail && !none.panel && F.attr(none) === "" && JSON.stringify(F.flip(e, "nope")) === JSON.stringify(e),
    "flip folds one side; the key folds both (the canvas alone) and, both folded, opens both");
  let c = F.shut(e, "cols", "p", "door", true); c = F.shut(c, "cols", "p", "data", true); c = F.shut(c, "lanes", "q", "worker", true); c = F.shut(c, "cols", "p", "door", false);
  ok(JSON.stringify(F.shutOf(c, "cols", "p")) === '{"data":1}' && JSON.stringify(F.shutOf(c, "lanes", "q")) === '{"worker":1}' && JSON.stringify(F.shutOf(c, "cols", "q")) === "{}" && JSON.stringify(F.shut(c, "other", "p", "x", true)) === JSON.stringify(c)
    && JSON.stringify(F.parse(F.shut(F.shut(e, "lanes", "q", "a", true), "lanes", "q", "a", false)).lanes) === "{}", "a lane or a column is kept per project, folded and opened again; an emptied project leaves nothing behind");
  const store = {}, ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const alone = vm.runInNewContext(`var __name=function(t){return t;};(${foldKit.toString()})()`, { JSON, Object, Array, String, localStorage: ls });
  alone.write("k", both);
  ok(JSON.stringify(alone.read("k")) === JSON.stringify(both) && JSON.stringify(vm.runInNewContext(`(${foldKit.toString()})().read("k")`, {})) === JSON.stringify(e), "alone, the kit keeps the folds in the browser; with no storage it reads nothing and throws nothing");
  // the head: folded before the first paint, on the Map's full pages for a signed-in reader only
  const me = { id: "p-7", name: "Ana", role: "owner", viaCookie: true };
  const mapPage = shell({ active: "map", full: true, reader: me, content: "" }), archPage = shell({ active: "arch", full: true, reader: me, content: "" });
  ok(mapPage.includes(`<html lang="en" data-folds="${FOLD_PREFIX}p-7">`) && mapPage.includes(FOLD_BOOT) && archPage.includes("data-folds=") && mapPage.indexOf(FOLD_BOOT) < mapPage.indexOf("<body>")
    && !shell({ active: "home", reader: me, content: "" }).includes("data-folds") && !shell({ active: "versions", reader: me, content: "" }).includes("data-folds") && !shell({ active: "map", full: true, reader: null, content: "" }).includes("data-folds"),
    "the folds' key and boot ride the head of the Map's full pages (Map, Arch) for a signed-in reader, never another page or an anonymous one");
  const html = { attrs: { "data-folds": "sharingu-fold:p-7" }, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); } };
  store["sharingu-fold:p-7"] = JSON.stringify({ rail: true, panel: true });
  const win = {};
  vm.runInNewContext(/<script>([\s\S]*)<\/script>/.exec(FOLD_BOOT)[1], { window: win, document: { documentElement: html }, localStorage: ls, JSON, Object, Array, String });
  ok(html.attrs["data-fold"] === "rail panel" && win.SGFOLD && win.SGFOLD.key === "sharingu-fold:p-7" && typeof win.SGFOLD.kit.shut === "function", `the boot folds the rail and the panel before the first paint (data-fold="${html.attrs["data-fold"]}") and leaves the kit for the page`);
  const bar = renderMapPage({ view: "mcp", project: "p", mcp: { regions: {} } }), anon = renderMapPage({ view: "mcp", project: "p", anonymous: true, mcp: { regions: {} } });
  ok(bar.includes(foldToggle("rail")) && bar.includes(foldToggle("panel")) && bar.indexOf(foldToggle("rail")) < bar.indexOf('class="mx-layers"') && /title="Fold rail · \\ folds both"/.test(bar) && /title="Fold panel · \\ folds both"/.test(bar)
    && FOLD_KEY === "\\" && !anon.includes("data-fold-toggle"), "the toolbar: the rail's toggle first, the panel's last, each titled with its label and the key; none for an anonymous reader");
  // a column folded (mapKit): one cluster at its top, its count and its links; the other columns where they were
  const K = mapKit(), L = layoutOf(bigModel()), S0 = { open: {}, on: { screens: 1, doors: 1, data: 1 }, pin: -1 };
  const a = JSON.parse(JSON.stringify(L)), b = JSON.parse(JSON.stringify(L)), Sd = { ...S0, shut: { door: 1 } };
  K.stack(a, S0); K.stack(b, Sd);
  const ci = b.cols.findIndex((x) => x.k === "door"), col = b.cols[ci], units = K.units(b, Sd), links = K.links(b, Sd), g0 = col.g[0];
  const others = b.cols.filter((x) => x.k !== "door").every((x) => x.g.every((gi) => a.groups[gi].y === b.groups[gi].y && a.groups[gi].dx === b.groups[gi].dx) && x.x === a.cols[b.cols.indexOf(x)].x);
  const clusters = (units.match(/class="mx-u mx-c mx-cs"/g) || []).length, doorUnit = String(-1 - g0);
  ok(clusters === 1 && new RegExp(`data-g="${g0}" data-col="${ci}"[^>]*><title>Doors: ${col.n} nodes\\. Open the column\\.</title>`).test(units) && !col.g.some((gi) => units.includes(`class="mx-u mx-c" data-g="${gi}"`)) && !units.includes('data-t="door"')
    && others && b.nodes.filter((n) => n.t === "door").every((n, k, arr) => K.unitOf(b, b.nodes.indexOf(n)) === -1 - g0),
    `the Doors column folded: one cluster (${col.n} nodes) where its first group stood, no door drawn alone, every other column where it was`);
  ok(new RegExp(`data-(a|b)="${doorUnit}"`).test(links) && !b.cols[ci].g.slice(1).some((gi) => new RegExp(`data-(a|b)="${-1 - gi}"`).test(links)) && b.H <= a.H,
    "the links to its doors end at the cluster, bundled");
  const hit = { n: {}, g: { [col.g[1]]: 2, [col.g[3]]: 1 }, first: -1, c: 3 };
  ok(/>3 of \d+<\/text>/.test(K.units(b, { ...Sd, hits: hit })), "a find counts its hits in the folded column");
  const kitAlone = vm.runInNewContext(`var __name=function(t){return t;};(${mapKit.toString()})()`, {}), c2 = JSON.parse(JSON.stringify(L));
  kitAlone.stack(c2, Sd);
  ok(kitAlone.units(c2, Sd) === units && kitAlone.links(c2, Sd) === links, "alone, the kit folds the column the same");
  // the client: a column kept folded is drawn folded at boot; a press on its head opens it and keeps that; a pin opens it for the visit
  const data = { L, on: { screens: 1, doors: 1, data: 1 }, open: {}, pin: null, flow: -1, since: "", minW: 980, minH: 600, kinds: { door: "Door" }, lightWord: { grey: "not graded" } };
  const seed = (cols) => `var localStorage=(function(){var m={"sharingu-fold:p-7":${JSON.stringify(JSON.stringify({ cols: { big: cols } }))}};return{getItem:function(k){return k in m?m[k]:null;},setItem:function(k,v){m[k]=String(v);}};})();window.SGFOLD={kit:(${foldKit.toString()})(),key:"sharingu-fold:p-7"};\n`;
  const run = runClient(seed(["door", "nope"]) + MAP_CLIENT, data, { search: "?project=big" });
  ok(!run.errors.length && /class="mx-u mx-c mx-cs" data-g="\d+" data-col="2"/.test(run.els["mx-units"].innerHTML) && (run.els["mx-units"].innerHTML.match(/mx-cs/g) || []).length === 1, `the column kept folded is drawn folded at boot (a kept id this map has no column for draws nothing)${run.errors.length ? " · " + run.errors[0].message : ""}`);
  const head = { getAttribute: (k) => (k === "data-col" ? "2" : null) };
  run.els["mx-stage"].dispatch("click", { target: { closest: (sel) => (sel === ".mx-colh" ? head : null) }, preventDefault() {} });
  const kept = () => JSON.parse(run.ctx.localStorage.getItem("sharingu-fold:p-7")).cols;
  ok(!/mx-cs/.test(run.els["mx-units"].innerHTML) && JSON.stringify(kept()) === '{"big":["nope"]}' && /Doors opened/.test(run.els["mx-live"].textContent), "a press on its head opens it, and the browser keeps it open");
  run.els["mx-stage"].dispatch("click", { target: { closest: (sel) => (sel === ".mx-colh" ? head : null) }, preventDefault() {} });
  ok(/mx-cs/.test(run.els["mx-units"].innerHTML) && JSON.stringify(kept()) === '{"big":["nope","door"]}' && /Doors folded/.test(run.els["mx-live"].textContent), "pressed again: folded, kept under the project");
  clickNode(run, L.nodes.findIndex((n) => n.t === "door"));
  ok(!/mx-cs/.test(run.els["mx-units"].innerHTML) && JSON.stringify(kept()) === '{"big":["nope","door"]}', "a pin into the folded column opens it for this visit; the person's fold is kept");
  (run.window._listeners["sharingu:fold"] || []).forEach((f) => f());
  ok((run.window._listeners["sharingu:fold"] || []).length === 1 && !run.errors.length && /^\d+%$/.test(run.els["mx-zl"].textContent), `a fold of the rail or the panel fits the drawing once (${run.els["mx-zl"].textContent})`);
}

console.log(`${failed ? "✗" : "✓"} map selftest: ${checks - failed}/${checks} passed`);
process.exit(failed ? 1 : 0);
