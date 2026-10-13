// tools/smoke/s3-map.mjs — slice 3: the Map reads D1 and a check's grade lights its node. Builds on s0: project smoke, the
// member seated on it. Two nodes, an edge and a check filed through preview then file show on the Map's reads at once (the
// node read, the Data plane's JSON, the Map page (GET /map) and on /map/data?table=, the compact layout GET /map
// answers and the canvas JSON); the node is grey before any grade, green after a proven grade with proof, red after a
// refused one, and the Map's light filter counts and its lights poll (GET /map/lights) follow; a grade of an unknown check is
// refused; a grade without proof routes to the owner and says so; the architecture node fills Map · Arch; a project with no
// model draws EMPTY naming preview then file; the MCP reads equal their GET twins.
import { smoke, expect, brief, s, http, html, mcp, control, ownerKey, kwrite, kread } from "./lib.mjs";

const P = "smoke";
const SCREEN = "screen:s3-home", TABLE = "table:s3_notes", CHECK = "AC.s3.home.route";
const node = (id, type, name, data = {}, status = null) => ({ kind: "node", op: "upsert", data: { id, type, name, ...(status ? { status } : {}), data } });
const nodeRead = async (ref) => {
  const r = await http("GET", `/map/node?project=${P}&ref=${encodeURIComponent(ref)}`, { key: ownerKey });
  if (r.status !== 200) throw new Error(`GET /map/node?ref=${ref}: ${r.status} ${brief(r.json)}`);
  return r.json;
};
const lightOn = async (ref) => { const n = await nodeRead(ref); return `${n.state} (${n.checks.graded}/${n.checks.total} graded, ${n.checks.passed} passed, ${n.checks.failed} failed)`; };
const region = (page, r) => (new RegExp(`data-region="${r}"[\\s\\S]*?</(?:section|aside)>`).exec(page) || [""])[0];
// the Map's light filter: the count of the drawn nodes of one light (every node the canvas draws, the screen and the table)
const stateCount = (page, light) => Number((new RegExp(`data-show="${light}"[^>]*><i></i><b>(\\d+)</b>`).exec(page) || [])[1] ?? -1);

smoke("two nodes, an edge and a check filed through preview then file show on the Map at once", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [
    node(SCREEN, "screen", "S3 Home", { route: "/s3", purpose: "the smoke's own screen", surface: "r-console", lane: "home", apis: ["GET /s3"] }, "live"),
    node(TABLE, "table", "s3_notes", { scope: "project", cols: [{ name: "id", type: "TEXT", pk: true, null: false }, { name: "body", type: "TEXT", null: true }] }),
    { kind: "edge", op: "upsert", data: { from: SCREEN, to: TABLE, kind: "reads" } },
    { kind: "check", op: "upsert", data: { id: CHECK, title: "S3 Home serves at /s3", given: "a reader", when: "they open /s3", then: "S3 Home renders", refs: [SCREEN] } },
  ] });
  expect(!w.isError && w.out.written === 4 && w.out.byKind.node === 2 && w.out.byKind.edge === 1 && w.out.byKind.check === 1, () => brief(w.out));
  // the node read: the screen with its edge out, the table with the same edge in
  const sc = await nodeRead(SCREEN), tb = await nodeRead(TABLE);
  expect(sc.kind === "screen" && sc.title === "S3 Home" && sc.nodeId === SCREEN && sc.edges.out.some((e) => e.ref === TABLE && e.name === "s3_notes" && e.label === "reads")
    && tb.kind === "table" && tb.edges.in.some((e) => e.ref === SCREEN && e.name === "S3 Home" && e.label === "reads"), () => `screen ${brief(sc)} · table ${brief(tb)}`);
  // the Data plane's JSON, and the Map opened on the Data layer with the table pinned
  const data = await http("GET", `/map/data?project=${P}`, { key: ownerKey });
  const dp = await html(`/map/data?project=${P}&table=s3_notes`);
  expect(data.status === 200 && data.json.regions["table-list"].some((t) => t.name === "s3_notes" && t.cols.length === 2) && dp.status === 200
    && /data-layer="data" aria-pressed="true"/.test(dp.text) && /data-node="table:s3_notes" data-kind="table"/.test(dp.text), () => `GET /map/data ${data.status} ${brief(data.json && data.json.regions)} / page ${dp.status}`);
  // the canvas JSON, the compact layout GET /map answers and the Map page (one screen, one table, the edge between them)
  const cv = await http("GET", `/canvas.json?project=${P}`, { key: ownerKey });
  const lay = await http("GET", `/map?project=${P}`, { key: ownerKey });
  const page = await html(`/map?project=${P}`);
  const pill = (k) => Number((new RegExp(`data-layer="${k}"[^>]*>[A-Za-z]+<b>(\\d+)</b>`).exec(page.text) || [])[1] ?? -1);
  expect(cv.status === 200 && cv.json.screens.some((x) => x.id === "s3-home" && x.name === "S3 Home" && x.route === "/s3") && cv.json.tables.some((t) => t.name === "s3_notes")
    && lay.status === 200 && lay.json.nodes.some((n) => n.r === SCREEN && n.n === "S3 Home") && lay.json.nodes.some((n) => n.r === TABLE) && lay.json.links.length === 3
    && page.status === 200 && page.text.includes(`"v":"${lay.json.v}"`) && pill("screens") === 1 && pill("data") === 1 && />S3 Home<\/a><\/li>/.test(page.text),
  () => `canvas.json ${cv.status} ${brief(cv.json)} / GET /map ${lay.status} ${brief(lay.json)} / the Map page ${page.status} screens ${pill("screens")} data ${pill("data")}`);
  return `map {ref}/GET /map/node: ${SCREEN} -> ${TABLE} (reads) both ways; GET /map/data lists s3_notes and its page pins it; GET /map lays out 2 nodes and their link (v${lay.json.v}); the Map page draws 1 screen and 1 table`;
});

smoke("the node is grey before any grade", async () => {
  const n = await nodeRead(SCREEN);
  const page = await html(`/map?project=${P}&node=${encodeURIComponent(SCREEN)}`);
  const insp = region(page.text, "inspector");
  expect(n.state === "grey" && n.checks.total === 1 && n.checks.graded === 0 && stateCount(page.text, "grey") === 2 && stateCount(page.text, "green") === 0
    && /data-light="grey"/.test(insp) && /1 check names it: 0 graded/.test(insp), () => `${brief(n)} / grey ${stateCount(page.text, "grey")} / inspector ${insp.slice(0, 300)}`);
  // the inspector's edges by name: the table's, its ref the link and the title
  expect(new RegExp(`data-ref="${TABLE}" title="${TABLE}">s3_notes</a>`).test(insp), () => `inspector edges: ${insp.slice(insp.indexOf("mx-edges"), insp.indexOf("mx-edges") + 300)}`);
  return `${SCREEN}: ${await lightOn(SCREEN)}; the Map counts both nodes Not graded and its inspector says 1 check, 0 graded and lists its edge by name (s3_notes)`;
});

smoke("submit_grade with proof lights the node green, and brief shows the grade", async () => {
  const g = await mcp(ownerKey, "submit_grade", { project: P, checkId: CHECK, verdict: "proven", proof: "curl -s localhost/s3 -> 200, S3 Home rendered" });
  expect(!g.isError && g.out.counted === true && g.out.route === "auto" && g.out.packVersion === "live" && /^Counted/.test(g.out.note), () => brief(g.out));
  const n = await nodeRead(SCREEN);
  expect(n.state === "green" && n.checks.graded === 1 && n.checks.passed === 1, () => brief(n));
  // D5: the checks that name one item are brief {for: <ref>}'s , the same by GET /brief?for=
  const pc = await mcp(ownerKey, "brief", { project: P, for: SCREEN });
  const c = (pc.out.checks || [])[0] || {};
  const rest = await http("GET", `/brief?project=${P}&for=${encodeURIComponent(SCREEN)}`, { key: ownerKey });
  expect(!pc.isError && (pc.out.checks || []).length === 1 && c.id === CHECK && c.verdict === "proven"
    && rest.status === 200 && JSON.stringify(rest.json.checks) === JSON.stringify(pc.out.checks), () => `brief ${brief(pc.out)} / REST ${rest.status}`);
  const page = await html(`/map?project=${P}`);
  // the Map's lights poll answers the change: the screen's row of k_node_lights moved to green
  const poll = await http("GET", `/map/lights?project=${P}&since=${encodeURIComponent("2020-01-01T00:00:00.000Z")}`, { key: ownerKey });
  const polled = ((poll.json && poll.json.lights) || []).find((x) => x.id === SCREEN);
  expect(stateCount(page.text, "green") === 1 && stateCount(page.text, "grey") === 1 && poll.status === 200 && polled && polled.light === "green",
    () => `the Map green ${stateCount(page.text, "green")} grey ${stateCount(page.text, "grey")} / GET /map/lights ${poll.status} ${brief(poll.json)}`);
  return `counted (route auto, pack_version "live"); ${SCREEN}: ${await lightOn(SCREEN)}; brief and GET /brief?for= show proven; the Map counts it Passing and GET /map/lights answers it green`;
});

smoke("a failing grade turns the node red", async () => {
  const g = await mcp(ownerKey, "submit_grade", { project: P, checkId: CHECK, verdict: "refused", proof: "curl -s localhost/s3 -> 500" });
  expect(!g.isError && g.out.counted === true, () => brief(g.out));
  const n = await nodeRead(SCREEN);
  const pc = await mcp(ownerKey, "brief", { project: P, for: SCREEN });
  expect(n.state === "red" && n.checks.failed === 1 && (pc.out.checks || [])[0] && pc.out.checks[0].verdict === "refused", () => `${brief(n)} / ${brief(pc.out)}`);
  const one = await kread(ownerKey, { project: P, ref: `check/${CHECK}` });
  const gs = (one.out.item && one.out.item.grades) || [];
  expect(!one.isError && gs.length === 2 && (gs[0].verdict || gs[0].status) === "refused" && (gs[1].verdict || gs[1].status) === "proven", () => brief(one.out));
  return `${SCREEN}: ${await lightOn(SCREEN)}; read {ref: check/…} lists both grades, the latest first`;
});

smoke("a grade of an unknown check is refused unknown_check, nothing filed", async () => {
  const count = async () => ((await kread(ownerKey, { project: P, kind: "contribution", limit: 100 })).out.items || []).length;
  const before = await count();
  const g = await mcp(ownerKey, "submit_grade", { project: P, checkId: "AC.s3.no-such", verdict: "proven", proof: "ran it" });
  const r = await http("POST", "/grade", { key: ownerKey, body: { project: P, checkId: "AC.s3.no-such", verdict: "proven", proof: "ran it" } });
  const after = await count();
  expect(g.isError && g.out.error === "unknown_check" && /`read`/.test(g.out.note || "") && r.status === 404 && r.json.error === "unknown_check" && after === before,
    () => `tool ${brief(g.out)} / REST ${r.status} ${brief(r.json)} / contributions ${before} -> ${after}`);
  return `submit_grade and POST /grade (404) both unknown_check, the note naming read; the project's contributions unchanged (${after})`;
});

smoke("a grade without proof is not counted, routes to the owner, and its note says so", async () => {
  const g = await mcp(s.member.key, "submit_grade", { checkId: CHECK, verdict: "proven" });
  expect(!g.isError && g.out.counted === false && g.out.route === "owner" && /Not counted/.test(g.out.note) && /owner's queue \(route owner\)/.test(g.out.note), () => brief(g.out));
  const t = { out: (await kread(ownerKey, { project: P, ref: g.out.transmission })).out.item || {} };
  const n = await nodeRead(SCREEN);
  expect(t.out.route === "owner" && t.out.kind === "grade" && n.state === "red" && n.checks.graded === 1, () => `${brief(t.out)} / ${brief(n)}`);
  return `the member's grade: counted false, route owner (${t.out.id}), "${g.out.note.slice(0, 70)}…"; the node stays ${n.state}`;
});

smoke("the architecture node fills Map · Arch", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [node("architecture:main", "architecture", "Architecture", {
    summary: "One worker per org.",
    diagram: { width: 400, height: 200, groups: [{ id: "product", label: "The product", x: 0, y: 0, w: 200, h: 200 }], nodes: [{ id: "worker", kind: "worker", title: "The worker", sub: "one per org", x: 10, y: 10 }, { id: "d1", kind: "data", title: "D1", sub: "the truth", x: 20, y: 60 }], edges: [] },
    crossing: [{ rule: "Nothing crosses an org's wall.", because: [] }] })] });
  expect(!w.isError && w.out.written === 1, () => brief(w.out));
  const a = await mcp(ownerKey, "map", { project: P, plane: "arch" });
  const page = await html(`/map/arch?project=${P}`);
  expect(!a.isError && a.out.regions.lanes.length === 1 && a.out.regions.lanes[0].product === true && a.out.regions["crossing-rules"].length === 1
    && a.out.regions["org-worker"].data.some((d) => d.title === "D1") && /data-lane="product"/.test(page.text) && /Nothing crosses an org&#39;s wall\.|Nothing crosses an org's wall\./.test(page.text), () => brief(a.out.regions));
  // no link yet: the bands only, no Play
  expect(["lanes", "seam", "org-worker", "crossing-rules"].every((r) => page.text.includes(`data-region="${r}"`)) && !/id="ar-play"/.test(page.text) && /No link is filed yet/.test(page.text), "Map · Arch with no link: the four regions, no Play");
  return "map arch and GET /map/arch: 1 product lane, the D1 data node, 1 crossing rule; no link, no Play";
});

smoke("Map · Arch plays the journeys filed with the architecture, and the door refuses a malformed one", async () => {
  const arch = (paths, edges) => node("architecture:main", "architecture", "Architecture", { summary: "One worker per org.",
    diagram: { groups: [{ id: "in", label: "Clients", order: 1 }, { id: "product", label: "The product", order: 2 }], seam: { group: "product", label: "The seam" },
      nodes: [{ id: "ai", group: "in", kind: "client", title: "An AI client" }, { id: "worker", group: "product", kind: "worker", title: "The worker" }, { id: "d1", group: "product", kind: "data", title: "D1" }],
      edges, paths },
    crossing: [{ rule: "Nothing crosses an org's wall.", nodes: ["worker"] }] });
  const bad = await kwrite(ownerKey, { project: P, ops: [arch([{ name: "A filing", steps: [{ from: "ai", to: "nowhere" }] }], [{ from: "ai", to: "worker" }])] });
  expect(bad.isError && /the journey .{0,2}A filing/.test(JSON.stringify(bad.out)), () => `a step to no node: ${brief(bad.out)}`);
  const w = await kwrite(ownerKey, { project: P, ops: [arch([{ name: "A filing", steps: [{ from: "ai", to: "worker", says: "The AI calls the door" }, { from: "worker", to: "d1", says: "One write to D1" }] }],
    [{ from: "ai", to: "worker", label: "MCP", main: true }, { from: "worker", to: "d1", label: "one batch" }])] });
  expect(!w.isError && w.out.written === 1, () => brief(w.out));
  const page = await html(`/map/arch?project=${P}`);
  const data = JSON.parse((/<script type="application\/json" id="ar-data">([\s\S]*?)<\/script>/.exec(page.text) || [, "null"])[1]);
  expect(page.status === 200 && ["lanes", "seam", "org-worker", "crossing-rules"].every((r) => page.text.includes(`data-region="${r}"`)) && /id="ar-play" data-button="play-journey"/.test(page.text)
    && /data-button="path-pick"[^>]*>A filing</.test(page.text) && /class="ar-seaml"/.test(page.text) && data && data.M.paths[0].steps.length === 2 && data.M.paths[0].steps[0].says === "The AI calls the door" && data.M.links.length === 2,
    () => `page ${page.status}: ${(data && JSON.stringify(data.M.paths)) || "no data"}`);
  return `a step to no node refused at the door; Map · Arch: the four regions, the seam, Play with "A filing" (2 steps along 2 links)`;
});

smoke("the MCP reads equal their GET twins", async () => {
  const [nt, nr] = [await mcp(ownerKey, "map", { project: P, ref: TABLE }), await http("GET", `/map/node?project=${P}&ref=${encodeURIComponent(TABLE)}`, { key: ownerKey })];
  const [pt, pr] = [await mcp(ownerKey, "map", { project: P, plane: "data" }), await http("GET", `/map/data?project=${P}`, { key: ownerKey })];
  // D5: the Screens view is map {plane: "screens"}; its twin GET /map/screens 
  const [ct, cr] = [await mcp(ownerKey, "map", { project: P, plane: "screens" }), await http("GET", `/map/screens?project=${P}`, { key: ownerKey })];
  expect(JSON.stringify(nt.out) === JSON.stringify(nr.json) && JSON.stringify(pt.out.regions) === JSON.stringify(pr.json.regions) && pt.out.model.v === pr.json.model.v
    && cr.status === 200 && JSON.stringify(ct.out) === JSON.stringify(cr.json), () => `map {ref} ${JSON.stringify(nt.out) === JSON.stringify(nr.json)} · map {plane} ${JSON.stringify(pt.out.regions) === JSON.stringify(pr.json.regions)} · map {plane: screens} ${brief(ct.out)} vs ${cr.status}`);
  return "map {ref} == GET /map/node, map {plane: data} == GET /map/data (regions and v), map {plane: screens} == GET /map/screens";
});

smoke("a project with no model draws EMPTY, naming preview then save_knowledge", async () => {
  await control({ action: "add-project", key: "empty-map", name: "Empty map" });
  const sys = await html("/map?project=empty-map");
  const canvas = region(sys.text, "canvas");
  const data = await http("GET", "/map/data?project=empty-map", { key: ownerKey });
  const dataPage = await html("/map/data?project=empty-map");   // the Map opened on the Data layer: the same EMPTY
  const flows = await mcp(ownerKey, "map", { project: "empty-map", plane: "flows" });
  const node = await http("GET", "/map/node?project=empty-map&gap=1", { key: ownerKey });
  const cv = await http("GET", "/canvas.json?project=empty-map", { key: ownerKey });
  expect(sys.status === 200 && /data-state="empty"/.test(canvas) && /preview then save_knowledge/.test(canvas) && !/id="mx-data"/.test(sys.text)
    && data.status === 200 && data.json.regions["table-list"].length === 0 && /No screen or entity is filed for this project yet[\s\S]*?preview then save_knowledge/.test(dataPage.text)
    && !flows.isError && flows.out.regions.swimlanes.length === 0 && node.status === 404 && node.json.error === "unknown_node" && cv.status === 200 && cv.json.screens.length === 0,
  () => `map ${sys.status} ${canvas.slice(0, 200)} / data ${data.status} / flows ${brief(flows.out)} / node ${node.status} ${brief(node.json)}`);
  return "the Map's canvas region EMPTY naming preview then save_knowledge (on /map and on /map/data); /map/data 200 with no table; flows []; ?gap=1 404 unknown_node";
});
