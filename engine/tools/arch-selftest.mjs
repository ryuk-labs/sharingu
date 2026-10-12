// tools/arch-selftest.mjs — sprint 3, the Map's Arch view (src/archview.js, src/archclient.js). Offline: no wrangler, no
// network.
//   A. THE MODEL (archModel): the bands in the order filed (or `order`, or the diagram's own top-to-bottom), a part in no
//      group in a band named by its kind (clients first, the rest last); links from {from, to}, "a->b" and drawn paths
//      joined to the parts at their ends; the journeys (filed, else the longest chain); the rules' parts; the seam; empty.
//   B. THE LAYOUT (archKit().layout): deterministic; bands top to bottom without overlap, each part inside its band, no two
//      parts overlapping on a 30-part fixture at every width the client may pick and at phone width; links from edge to edge.
//   C. THE KIT the page embeds (archKit.toString(), as src/archclient.js ships it) is self-contained: alone in an empty
//      context it lays out and draws exactly what the server does.
//   D. THE PAGE (renderArchView): the four regions stay (lanes, seam, org-worker, crossing-rules) with their hooks; every
//      button on a door or client-side; no em dash drawn; EMPTY with the exact call; UNREACHABLE; no links: no Play.
//   E. REDUCED MOTION: every animation and transition in the sheet sits behind html.u-motion; a still drawing carries no
//      animation hook; no SMIL; the client without u-motion starts no frame loop and makes no dot, and Play steps.
//   F. THE CLIENT (ARCH_CLIENT in a small fake DOM): boots without a throw, pins a part (the panel says what crosses),
//      plays a journey (the caption names the step), Space plays, Escape stops; under 42 KB (40 before M4's marks). M5: a journey's pill filters
//      the diagram (the dots keep to its links, Play walks it, pressed again or Escape clears); a lane the person keeps folded
//      is drawn folded at boot, a press on its label opens it and the browser keeps that (src/parts.js foldKit, embedded).
//   M5 also: A keeps every service a part names before the cap (siru: 156 services); B lays a folded lane out as one bar, the
//   links to its parts ending at it and the links inside it gone, and jset names a journey's parts and links; C the same alone.
//   G. THE DOOR (src/knowledge/schema.js, the architecture rule): the sharingu ops file passes, every older diagram shape
//      passes, each new field is refused when malformed.
//   H. THE SHARINGU OPS FILE: every journey step runs along a drawn link, every part sits in a band and is linked, no id
//      code or em dash in what is drawn.
//   I. M4, WHAT THE DOTS SAY (meaningOf, from the marks src/knowledge/canvas.js reads): a part's light is its own or its
//      service's (the worse), a link to a red part fails, a part changed in the last seven days is marked (eight days ago is
//      not), a journey blocks at its first step touching a red or stale part; nothing marked adds nothing. Drawn: the outline,
//      the failing links, "changed" in the title line, the ring only on the first paint; the page counts them and tags a
//      blocked journey. The client: the dots on a failing link in the danger ink, Play stops at the blocked step (with and
//      without motion), pins the part, the caption and the panel name the check, a stale one with its Regrade press.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { archModel, archKit, walkOf, meaningOf, renderArchView, servicesOf, SERVICES, ARCH_CSS, ARCH_CALL, NO_ARCH, NO_LINKS, ARCH_DOWN, ARCH_REGIONS } from "../src/archview.js";
import { foldKit } from "../src/parts.js";
import { ARCH_CLIENT } from "../src/archclientdata.js";   // what the page ships (A2: the minified build)
import { ARCH_CLIENT_SRC } from "../src/archclient.js";
import { KINDS } from "../src/knowledge/schema.js";
import { lanesOf, PLANE_REGIONS } from "../src/mapplanes.js";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };
const OPS = JSON.parse(readFileSync(join(ENGINE, "tools/walkthrough/sharingu-architecture.ops.json"), "utf8"));
const SH = OPS.ops[0].data.data;
const services = OPS.ops.slice(1).map((o) => ({ id: o.data.id.replace(/^service:/, ""), name: o.data.name, ...o.data.data }));
const SHARINGU = { ...SH, services };
// an older diagram, drawn by coordinates: two groups as rects, an ungrouped client, "a->b" edges and a drawn path
const OLD = { diagram: { width: 680, height: 420,
  groups: [{ id: "cloud", label: "Cloud — one worker", x: 30, y: 30, w: 620, h: 160 }, { id: "machine", label: "Machine", x: 30, y: 220, w: 620, h: 160 }],
  nodes: [{ id: "browser", kind: "client", title: "Browser", x: 50, y: -40, w: 200, h: 50 }, { id: "worker", kind: "worker", title: "Worker", sub: "the edge", x: 280, y: 60, w: 200, h: 50 },
    { id: "d1", kind: "data", title: "D1", x: 60, y: 140, w: 150, h: 40 }, { id: "gh", kind: "external", title: "GitHub", x: 500, y: 260, w: 150, h: 50 }, { id: "ci", kind: "local", title: "CI", x: 300, y: 260, w: 150, h: 50 }],
  edges: [{ d: "browser->worker", label: "HTTPS" }, { d: "worker->d1", label: "reads" }, { d: "M375 285 L500 285", label: "drawn" }, { d: "worker->nowhere" }, { d: "browser->worker", main: true }] },
  crossing: [{ rule: "Only the worker reads D1.", because: ["Q1"] }, { rule: "Nothing else.", nodes: ["ci"] }] };

// ---- A. the model ----
console.log("A · the model");
{
  const M = archModel(SHARINGU);
  ok(M.bands.map((b) => b.id).join(",") === "clients,door,worker,d1,blobs", `sharingu: the bands in their order (${M.bands.map((b) => b.id).join(",")})`);
  ok(M.nodes.length === 21 && M.links.length === 29 && M.paths.length === 4 && M.filedPaths && M.rules.length === 6, `sharingu: 21 parts, 29 links, 4 filed journeys, 6 rules (${M.nodes.length}, ${M.links.length}, ${M.paths.length}, ${M.rules.length})`);
  ok(M.seam && M.bands[M.seam.b].id === "door" && M.seamNode === -1, "sharingu: the seam is the door's band");
  ok(M.bands[2].product && !M.bands[0].product, "the band holding a worker is the product's");
  ok(M.paths[0].steps.every((s) => s.l >= 0) && M.paths[0].steps[0].says === "Claude calls the MCP door with what it found", "a filed journey's steps keep their words and find their links");
  ok(M.rules[0].nodes.map((i) => M.nodes[i].id).join(",") === "mcp,rest,registry", "a rule's own nodes name its parts");
  const O = archModel(OLD);
  ok(O.bands.map((b) => b.id).join(",") === "kind:clients,cloud,machine", `older diagram: by its own top-to-bottom, the client band from its y (${O.bands.map((b) => b.id).join(",")})`);
  ok(O.bands[1].label === "Cloud - one worker", "an em dash in a label is drawn as a plain dash");
  ok(O.links.length === 3 && O.links.some((l) => l.main) && O.nodes[O.links[2].a].id === "ci" && O.nodes[O.links[2].b].id === "gh", `older diagram: "a->b" and a drawn path joined to its ends, an unknown end dropped, a repeat merged (${O.links.length})`);
  ok(!O.filedPaths && O.paths.length === 1 && O.paths[0].auto && O.paths[0].steps.length === 2, "no journey filed: Play walks the longest chain");
  ok(O.rules[0].nodes.map((i) => O.nodes[i].id).sort().join(",") === "d1,worker" && O.rules[1].nodes.length === 1, "a rule with no nodes names the parts whose title it says");
  ok(O.seam === null && O.seamNode === -1, "no seam filed: none drawn");
  const S = archModel({ diagram: { nodes: [{ id: "s", kind: "seam", title: "contract" }, { id: "a", kind: "client", title: "A" }] } });
  ok(S.seamNode >= 0 && S.nodes[S.seamNode].id === "s" && S.bands[0].label === "Clients", "a part of kind seam is the seam; clients first");
  const E = archModel(null);
  ok(E.nodes.length === 0 && E.links.length === 0 && E.paths.length === 0 && E.bands.length === 0, "no architecture: an empty model");
  const V = archModel({ services: [{ id: "d1", name: "D1", uses: ["the truth"] }] });
  ok(V.fromServices && V.nodes.length === 1 && V.bands[0].label === "Services", "only services filed: they are the parts");
  // M2 found it on siru: 156 services, the parts naming ones past the first 60, so no part showed "Runs on"
  const many = Array.from({ length: 156 }, (_, i) => ({ id: `svc${i}`, name: `Service ${i}` }));
  const named = { services: many, diagram: { nodes: [{ id: "a", title: "A", service: "svc150" }, { id: "b", title: "B", service: "svc3" }, { id: "c", title: "C", service: "svc99" }] } };
  const NM = archModel(named), kept = NM.services.map((x) => x.id);
  ok(kept.length === SERVICES && ["svc150", "svc3", "svc99"].every((x) => kept.includes(x)) && kept[0] === "svc0" && kept.indexOf("svc3") < kept.indexOf("svc99") && kept.indexOf("svc99") < kept.indexOf("svc150"),
    `the services a part names are kept before the cap, in the order filed (${kept.length} kept: svc150 ${kept.includes("svc150")}, svc99 ${kept.includes("svc99")})`);
  ok(servicesOf(many, []).length === SERVICES && servicesOf(many.slice(0, 5), [{ service: "svc4" }]).length === 5 && servicesOf(many, Array.from({ length: 70 }, (_, i) => ({ service: `svc${i + 80}` }))).length === 70,
    "no part names one: the first 60; fewer filed: all of them; more named than the cap: every one named");
  // the walk: the longest chain, deterministic
  const chain = { diagram: { nodes: "abcdef".split("").map((x) => ({ id: x, title: x })), edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }, { from: "c", to: "d" }, { from: "e", to: "f" }] } };
  const CM = archModel(chain), w = walkOf(CM);
  ok(w.length === 3 && w.map((li) => CM.nodes[CM.links[li].a].id).join("") === "abc" && JSON.stringify(walkOf(archModel(chain))) === JSON.stringify(w), `the longest chain follows the links, no part twice, the same every time (${w.map((li) => CM.nodes[CM.links[li].a].id).join("")})`);
}

// ---- B. the layout ----
console.log("B · the layout");
function big() {
  const groups = ["a", "b", "c", "d"].map((id, i) => ({ id, label: `Band ${id}`, order: i }));
  const nodes = [], edges = [];
  for (let i = 0; i < 30; i++) nodes.push({ id: `n${i}`, title: `Part ${i}`, sub: "a part of the fixture with a longer line", group: groups[i % 4].id });
  for (let i = 0; i < 30; i++) for (const j of [i + 4, i + 7]) if (j < 30) edges.push({ from: `n${i}`, to: `n${j}`, main: i % 5 === 0 });
  return { diagram: { groups, nodes, edges } };
}
const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
function sound(M, L) {
  let bad = [];
  L.bands.forEach((b, i) => { if (i && Math.abs(L.bands[i - 1].y + L.bands[i - 1].h - b.y) > 0.01) bad.push(`band ${i} not under ${i - 1}`); });
  M.nodes.forEach((n, i) => { const P = L.nodes[i], B = L.bands[n.b]; if (P.y < B.y || P.y + P.h > B.y + B.h || P.x < 0 || P.x + P.w > L.W) bad.push(`${n.id} outside its band`); });
  for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++) if (overlap(L.nodes[i], L.nodes[j])) bad.push(`${M.nodes[i].id} on ${M.nodes[j].id}`);
  M.links.forEach((l, i) => { const c = L.links[i].c, A = L.nodes[l.a], B = L.nodes[l.b];
    const onEdge = (x, y, P) => x >= P.x - 0.1 && x <= P.x + P.w + 0.1 && (Math.abs(y - P.y) < 0.11 || Math.abs(y - P.y - P.h) < 0.11);
    if (!onEdge(c[0], c[1], A) || !onEdge(c[6], c[7], B)) bad.push(`link ${i} not edge to edge`); });
  return bad;
}
{
  const K = archKit(), M = archModel(big());
  const variants = [{}, { per: 4 }, { per: 3 }, { nw: 154 }, { nw: 176, sy: 1.8 }, { narrow: true }];
  for (const o of variants) { const L = K.layout(M, o), bad = sound(M, L); ok(!bad.length, `30 parts ${JSON.stringify(o)}: bands stacked, every part in its band, none overlapping, links edge to edge${bad.length ? " · " + bad.slice(0, 4).join("; ") : ""}`); }
  ok(JSON.stringify(K.layout(M, {})) === JSON.stringify(archKit().layout(archModel(big()), {})), "the same model lays out the same, byte for byte");
  const S = archModel(SHARINGU), L = K.layout(S, {});
  ok(!sound(S, L).length && L.bands.length === 5 && L.bands.every((b, i) => !i || b.y > L.bands[i - 1].y), "sharingu: five bands top to bottom, sound");
  ok(K.layout(S, { sy: 2 }).H > L.H && K.layout(S, { sy: 2 }).W === L.W, "more room between the bands makes it taller, never wider");
  ok(K.crossings(S, K.order(S)) <= K.crossings(S, S.bands.map((b, bi) => S.nodes.map((n, i) => [n, i]).filter(([n]) => n.b === bi).map(([, i]) => i))), "the order kept never crosses more than the order filed");
  const wrap = K.layout(archModel({ diagram: { nodes: Array.from({ length: 7 }, (_, i) => ({ id: "p" + i, title: "P", kind: "client" })) } }), {});
  const rows = [...new Set(wrap.nodes.map((p) => p.y))].map((y) => wrap.nodes.filter((p) => p.y === y).length);
  ok(rows.join("+") === "4+3", `a band of 7 at 6 a row wraps balanced (${rows.join("+")})`);
  // M5: a lane folded is one bar; its parts stand at the bar, the links to them end on its edge, the links inside it are gone
  for (const o of [{}, { narrow: true }, { per: 4, sy: 1.6 }]) {
    const F = K.layout(S, { ...o, shut: { 2: 1 } }), O = K.layout(S, o), bar = F.nodes[S.nodes.findIndex((n) => n.b === 2)];
    const inLane = S.nodes.map((n, i) => (n.b === 2 ? i : -1)).filter((i) => i >= 0), bad = [];
    if (!F.bands[2].s || F.bands[2].h >= O.bands[2].h || F.H >= O.H) bad.push("the lane is not one shorter bar");
    if (!inLane.every((i) => F.nodes[i] === bar && F.nodes[i].s)) bad.push("a part of the lane stands elsewhere");
    F.bands.forEach((b, i) => { if (i && Math.abs(F.bands[i - 1].y + F.bands[i - 1].h - b.y) > 0.01) bad.push(`band ${i} not under ${i - 1}`); });
    S.links.forEach((l, i) => { const a = inLane.includes(l.a), b = inLane.includes(l.b), c = F.links[i].c;
      if (a && b) { if (!F.links[i].h || c) bad.push(`link ${i} inside the lane drawn`); return; }
      if (!c) { bad.push(`link ${i} lost`); return; }
      const end = a ? [c[0], c[1]] : b ? [c[6], c[7]] : null;
      if (end && !(end[0] >= bar.x - 0.1 && end[0] <= bar.x + bar.w + 0.1 && (Math.abs(end[1] - bar.y) < 0.11 || Math.abs(end[1] - bar.y - bar.h) < 0.11))) bad.push(`link ${i} does not end at the bar`); });
    const svg = K.draw(S, F, { still: true });
    if (!/class="ar-band ar-shut"[^>]*data-b="2"/.test(svg) || !/class="ar-shutb"/.test(svg) || inLane.some((i) => svg.includes(`class="ar-n" data-i="${i}"`))) bad.push("the bar is not drawn alone");
    if (!/<g class="ar-fold" data-b="2"[^>]*><title>Open lane<\/title>/.test(svg) || !/<g class="ar-fold" data-b="0"[^>]*><title>Fold lane<\/title>/.test(svg)) bad.push("the labels do not fold");
    ok(!bad.length && F.sk === "2" && O.sk === "", `sharingu, lane 2 folded ${JSON.stringify(o)}: one bar (${F.bands[2].h}px), its ${inLane.length} parts at it, the links to it ending on its edge, the ones inside it gone${bad.length ? " · " + bad.slice(0, 4).join("; ") : ""}`);
  }
  ok(JSON.stringify(K.layout(S, { shut: { 9: 1 } })) === JSON.stringify({ ...L, sk: "9" }), "a fold naming no lane changes nothing drawn");
  const J = K.jset(S, 2), steps = S.paths[2].steps;
  ok(J && steps.every((st) => J.n[st.a] && J.n[st.b] && (st.l < 0 || J.l[st.l])) && Object.keys(J.l).length === new Set(steps.map((st) => st.l).filter((x) => x >= 0)).size && K.jset(S, 99) === null,
    `the filter's set: journey 2's ${Object.keys(J.n).length} parts and ${Object.keys(J.l).length} links, nothing else; no such journey: none`);
}

// ---- C. the kit, self-contained ----
console.log("C · the kit, embedded alone");
{
  const ctx = vm.createContext({ Math, String, Object, Array, JSON, parseInt });
  const kit = vm.runInContext(`(${archKit.toString()})()`, ctx);
  const M = archModel(SHARINGU), L = archKit().layout(M, {});
  const L2 = kit.layout(JSON.parse(JSON.stringify(M)), {});
  ok(JSON.stringify(L2) === JSON.stringify(L), "alone, the kit lays out what the server lays out");
  ok(kit.draw(M, L2, {}) === archKit().draw(M, L, {}) && kit.draw(M, kit.layout(M, { narrow: true }), {}) === archKit().draw(M, archKit().layout(M, { narrow: true }), {}), "alone, it draws the same SVG, wide and narrow");
  ok(kit.draw(M, kit.layout(M, { shut: { 1: 1, 3: 1 } }), {}) === archKit().draw(M, archKit().layout(M, { shut: { 1: 1, 3: 1 } }), {}) && JSON.stringify(kit.jset(M, 1)) === JSON.stringify(archKit().jset(M, 1)), "alone, it folds lanes and names a journey's set the same");
  const p = kit.bez(L2.links[0].c.slice(), 0), q = kit.bez(L2.links[0].c.slice(), 1);
  ok(Math.abs(p[0] - L.links[0].c[0]) < 0.01 && Math.abs(q[1] - L.links[0].c[7]) < 0.01, "a point along a link runs from its start to its end");
}

// ---- D. the page ----
console.log("D · the page");
const plane = { regions: { lanes: lanesOf(SH), seam: { door: "contracts/door.json", counts: { rest: 126, tools: 57 } }, "org-worker": { name: "org-agent-r", data: [], projects: [{ key: "sharingu", name: "sharingu" }], active: 3 }, "crossing-rules": SH.crossing } };
const page = renderArchView({ arch: plane, architecture: SHARINGU, project: "sharingu", client: ARCH_CLIENT });
const markup = page.replace(/<script>[\s\S]*?<\/script>/g, "");
{
  const regs = [...page.matchAll(/data-region="([^"]+)"/g)].map((m) => m[1]);
  ok(ARCH_REGIONS.every((r) => regs.includes(r)) && JSON.stringify(PLANE_REGIONS.arch) === JSON.stringify(ARCH_REGIONS), `the four regions stay: ${ARCH_REGIONS.join(", ")} (${regs.join(", ")})`);
  ok(["clients", "door", "worker", "d1", "blobs"].every((id) => page.includes(`data-lane="${id}"`)) && /<svg class="mx-archsvg/.test(markup) && (markup.match(/data-rule>/g) || []).length === 6 && /data-worker="org-agent-r"/.test(markup) && !/<b>org-agent-r<\/b>/.test(markup), "its hooks: a data-lane per band, the svg, a data-rule per rule, the org worker (L4: its name in the hook and title, never on the screen)");
  const buttons = [...page.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/<(?:button|a)\b[^>]*data-button="[^"]*"[^>]*>/g)].map((m) => m[0]);
  ok(buttons.length > 8 && buttons.every((b) => /data-door="|data-client="/.test(b)), `every button (${buttons.length}) on its door or client-side`);
  const drawn = page.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  ok(!/[—–]/.test(drawn), "no em dash drawn");
  const data = JSON.parse(/<script type="application\/json" id="ar-data">([\s\S]*?)<\/script>/.exec(page)[1]);
  ok(data.M.nodes.length === 21 && data.L.nodes.length === 21 && /id="ar-play"/.test(markup) && (markup.match(/data-button="path-pick"/g) || []).length === 4, "the data it embeds parses; Play and a pill per journey");
  const empty = renderArchView({ arch: { regions: {} }, architecture: null, project: "p", client: ARCH_CLIENT });
  ok(empty.includes(NO_ARCH.replace(/"/g, "&quot;")) && empty.includes("preview") && !/<script>/.test(empty) && ARCH_REGIONS.every((r) => empty.includes(`data-region="${r}"`)), "nothing filed: EMPTY names the exact call, no script, the regions stay");
  ok(ARCH_CALL.includes('"architecture"') && ARCH_CALL.includes("paths"), "the call names the architecture and its journeys");
  const down = renderArchView({ arch: null, project: "p" });
  ok(down.includes('data-state="unreachable"') && down.includes(ARCH_DOWN.replace(/'/g, "&#39;")) && ARCH_REGIONS.every((r) => down.includes(`data-region="${r}"`)), "the read failed: UNREACHABLE, the regions stay");
  const bare = renderArchView({ arch: plane, architecture: { diagram: { groups: [{ id: "g", label: "G" }], nodes: [{ id: "a", group: "g", title: "A" }, { id: "b", group: "g", title: "B" }] } }, client: ARCH_CLIENT });
  ok(!/id="ar-play"/.test(bare) && bare.includes(NO_LINKS.slice(0, 40)) && /data-lane="g"/.test(bare), "no link filed: the bands only, no Play, the sentence says what to add");
}

// ---- E. reduced motion ----
console.log("E · reduced motion");
{
  const css = ARCH_CSS.replace(/<\/?style>/g, "");
  const rules = css.split("}").map((r) => r.trim()).filter(Boolean);
  const moving = rules.filter((r) => /animation|transition/.test(r.split("{").slice(-1)[0]));
  ok(moving.length >= 5 && moving.every((r) => /\.u-motion/.test(r.split("{").slice(-2, -1)[0] || r)), `every animation and transition (${moving.length}) sits behind html.u-motion`);
  const K = archKit(), M = archModel(SHARINGU), L = K.layout(M, {});
  const still = K.draw(M, L, { still: true });
  ok(!/--t:|animation|<animate/.test(still) && /--t:/.test(K.draw(M, L, {})), "a still drawing carries no animation hook; the open's carries its delays");
  ok(!/<animate|<set\b|animation:/.test(page.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "")), "no SMIL and no inline animation in the markup");
  const still2 = runArch(false);
  still2.tick(); still2.tick();
  ok(!still2.errors.length && still2.frames() === 0 && !/<circle/.test(still2.els["ar-dots"].innerHTML), `without u-motion: no frame loop, no dot${still2.errors.length ? " · " + still2.errors[0].message : ""}`);
  still2.click("play-journey");
  ok(!still2.els["ar-cap"].hidden && /1 \/ 7/.test(still2.els["ar-cap"].innerHTML) && /data-button="step-next"/.test(still2.els["ar-cap"].innerHTML) && still2.frames() === 0, "without u-motion, Play shows the first step and its step buttons, nothing runs");
  still2.click("play-journey");
  ok(/2 \/ 7/.test(still2.els["ar-cap"].innerHTML), "and steps on");
}

// ---- F. the client ----
// fold: { lanes } the lanes this person keeps folded (the kit embedded as the head ships it, over a fake localStorage)
function runArch(motion, fold, pg = page) {
  const data = JSON.parse(/<script type="application\/json" id="ar-data">([\s\S]*?)<\/script>/.exec(pg)[1]);
  const mk = (id) => { const l = {}; const s = new Set(); const e = { id, attrs: {}, innerHTML: "", textContent: "", hidden: id === "ar-cap" || id === "ar-tip" || id === "ar-insp", clientWidth: 1200, clientHeight: 800, offsetTop: 46, offsetWidth: 240, offsetHeight: 70, style: {},
    classList: { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }, contains: (c) => s.has(c), _s: s },
    getAttribute: (k) => (k in e.attrs ? e.attrs[k] : null), setAttribute: (k, v) => { e.attrs[k] = String(v); }, removeAttribute: (k) => { delete e.attrs[k]; },
    addEventListener: (t, f) => { (l[t] ||= []).push(f); }, removeEventListener() {}, dispatch: (t, ev) => { for (const f of l[t] || []) f(ev); },
    querySelector: (sel) => (/\.ar-[nl]\[/.test(sel) ? mk("q") : null), querySelectorAll: (sel) => (sel === "circle" ? Array.from({ length: (e.innerHTML.match(/<circle/g) || []).length }, () => mk("c")) : []),
    closest: () => null, getBoundingClientRect: () => ({ left: 0, top: 46, width: 1200, height: 800 }), scrollTo() {}, scrollIntoView() {}, focus() {}, setPointerCapture() {} };
    return e; };
  const ids = ["ar", "ar-data", "ar-stage", "ar-svg", "ar-world", "ar-tip", "ar-cap", "ar-insp", "ar-ov", "ar-zl", "ar-mini", "ar-live", "ar-play", "ar-dots", "ar-pl", "ar-ll", "ar-trail", "ar-pulse"];
  const els = Object.fromEntries(ids.map((id) => [id, mk(id)]));
  els["ar-data"].textContent = JSON.stringify(data);
  els["ar-play"].querySelector = () => mk("x");
  // a clock of its own: each tick is two seconds on it, so a journey's step runs to its end (M4: Play stops at a blocked step)
  let clock = Date.now();
  const timers = [], frames = [], errors = [], docL = {};
  const html = mk("html"); if (motion) html.classList.add("u-motion");
  const document = { documentElement: html, visibilityState: "visible", getElementById: (id) => els[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener: (t, f) => { (docL[t] ||= []).push(f); } };
  const window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
  const store = {};
  if (fold) {
    const fctx = vm.createContext({ JSON, Object, Array, String, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } });
    window.SGFOLD = { kit: vm.runInContext(`(${foldKit.toString()})()`, fctx), key: "sharingu-fold:p1" };
    store["sharingu-fold:p1"] = JSON.stringify({ lanes: { [data.project]: fold.lanes } });
  }
  const ctx = vm.createContext({ window, document, JSON, Math, Date, Number, String, Object, Array, Set, Map, parseInt, parseFloat, isFinite, console, performance: { now: () => clock },
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, cancelAnimationFrame() {}, setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {} });
  try { vm.runInContext(ARCH_CLIENT, ctx, { timeout: 5000 }); } catch (e) { errors.push(e); }
  let nFrames = 0;
  const tick = () => { clock += 2000; for (const f of timers.splice(0)) { try { f(); } catch (e) { errors.push(e); } } for (const f of frames.splice(0)) { nFrames++; try { f(clock); } catch (e) { errors.push(e); } } };
  const btn = (k, attrs = {}) => ({ getAttribute: (a) => (a === "data-button" ? k : attrs[a] ?? null), disabled: false });
  const click = (k, attrs) => { const b = btn(k, attrs); els.ar.dispatch("click", { target: { closest: (sel) => (sel === "[data-button]" ? b : null) } }); };
  const key = (k) => { for (const f of docL.keydown || []) f({ key: k, target: { tagName: "BODY" }, preventDefault() {} }); };
  return { els, errors, tick, click, key, frames: () => nFrames + frames.length, store, data, docL };
}
console.log("F · the client");
{
  const r = runArch(true);
  ok(!r.errors.length && ARCH_CLIENT.length < 42000, `boots without a throw; ${ARCH_CLIENT.length} bytes shipped (view kit ${ARCH_CLIENT.indexOf("var ARCHKIT")}, arch kit and client ${ARCH_CLIENT.length - ARCH_CLIENT.indexOf("var ARCHKIT")})${r.errors.length ? " · " + r.errors[0].message : ""}`);
  // A2 (sprint 5): what ships is the source through esbuild with WHITESPACE minification only — so it must keep every
  // identifier and string of the source, and leave real headroom under the cap (the room the next slices spend)
  // (a \uXXXX escape in a string is normalised by esbuild to its character — the same value — so escapes are not names)
  const idsOf = (t) => new Set((t.replace(/\\u[0-9a-fA-F]{4}/g, "").match(/\b[A-Za-z_$][\w$]{3,}\b/g) || []));
  const srcIds = idsOf(ARCH_CLIENT_SRC), shipIds = idsOf(ARCH_CLIENT);
  const lost = [...srcIds].filter((x) => !shipIds.has(x));
  ok(!lost.length && ARCH_CLIENT.length < ARCH_CLIENT_SRC.length && 42000 - ARCH_CLIENT.length >= 3000,
    `A2 · the shipped client is the source minified, whitespace only: every identifier kept (${srcIds.size}), ${ARCH_CLIENT_SRC.length} → ${ARCH_CLIENT.length} bytes, ${42000 - ARCH_CLIENT.length} of headroom${lost.length ? " · lost: " + lost.slice(0, 5).join(",") : ""}`);
  r.tick();
  ok(r.frames() > 0 && (r.els["ar-dots"].innerHTML.match(/<circle/g) || []).length >= 29, `after the open, the dots run (${(r.els["ar-dots"].innerHTML.match(/<circle/g) || []).length} dots, main links carry three)`);
  const node = { getAttribute: (k) => (k === "data-i" ? "5" : null) };
  r.els["ar-stage"].dispatch("click", { target: { closest: (sel) => (/\.ar-n\b/.test(sel) ? node : null) } });
  ok(!r.els["ar-insp"].hidden && /What crosses to it/.test(r.els["ar-insp"].innerHTML) && /What crosses from it/.test(r.els["ar-insp"].innerHTML) && /data-button="select-part"/.test(r.els["ar-insp"].innerHTML), "a click pins a part: the panel says what crosses to and from it");
  ok(/The rules on it/.test(r.els["ar-insp"].innerHTML) && /Journeys through it/.test(r.els["ar-insp"].innerHTML) && /Runs on/.test(r.els["ar-insp"].innerHTML), "and the rules on it, the journeys through it, the service it runs on");
  r.key(" ");
  ok(!r.els["ar-cap"].hidden && /1 \/ 7/.test(r.els["ar-cap"].innerHTML) && /Claude calls the MCP door/.test(r.els["ar-cap"].innerHTML) && /ar-trail/.test(r.els["ar-pl"].innerHTML), "Space plays: the caption names step 1, the trail is drawn");
  r.key("ArrowRight");
  ok(/2 \/ 7/.test(r.els["ar-cap"].innerHTML) && /ar-done/.test(r.els["ar-pl"].innerHTML), "→ steps on, the step before stays drawn");
  r.key("Escape");
  ok(r.els["ar-cap"].hidden && !r.errors.length, "Escape stops it");
  // M5: a journey's pill filters: the rest dims, the dots keep to its links, Play walks it; pressed again, or Escape, clears
  const dotsAll = (r.els["ar-dots"].innerHTML.match(/<circle/g) || []).length;
  r.click("path-pick", { "data-path": "2" });
  const dotsJ = (r.els["ar-dots"].innerHTML.match(/<circle/g) || []).length;
  ok(r.els["ar-stage"].classList.contains("ar-filter") && r.els["ar-cap"].hidden && dotsJ > 0 && dotsJ < dotsAll && /journey/.test(r.els["ar-live"].textContent), `a pill filters to its journey without playing it (${dotsAll} dots, ${dotsJ} on the journey)`);
  r.key(" ");
  ok(/A check is graded/.test(r.els["ar-cap"].innerHTML) && /1 \/ 6/.test(r.els["ar-cap"].innerHTML), "Play walks the journey filtered, from its first step");
  r.key("Escape");
  ok(r.els["ar-cap"].hidden && r.els["ar-stage"].classList.contains("ar-filter"), "Escape stops the journey first, the filter stays");
  r.key("Escape"); r.key("Escape");
  ok(!r.els["ar-stage"].classList.contains("ar-filter") && (r.els["ar-dots"].innerHTML.match(/<circle/g) || []).length === dotsAll, "Escape again closes the pinned part, then clears the filter, every dot back");
  r.click("path-pick", { "data-path": "1" }); r.click("path-pick", { "data-path": "1" });
  ok(!r.els["ar-stage"].classList.contains("ar-filter") && !r.errors.length, "the same pill pressed twice: no filter");
}
{
  // M5: a lane this person keeps folded is drawn folded at boot; a press on its label opens it, and the browser keeps that
  const r = runArch(true, { lanes: ["worker"] });
  const bi = JSON.parse(/<script type="application\/json" id="ar-data">([\s\S]*?)<\/script>/.exec(page)[1]).M.bands.findIndex((b) => b.id === "worker");
  ok(!r.errors.length && new RegExp(`class="ar-band ar-shut"[^>]*data-b="${bi}"`).test(r.els["ar-world"].innerHTML) && /<title>Open lane<\/title>/.test(r.els["ar-world"].innerHTML), `the lane kept folded (worker, band ${bi}) is one bar at boot${r.errors.length ? " · " + r.errors[0].message : ""}`);
  const lane = { getAttribute: (k) => (k === "data-b" ? String(bi) : null) };
  r.els["ar-stage"].dispatch("click", { target: { closest: (sel) => (/\.ar-fold/.test(sel) ? lane : null) } });
  ok(!/ar-shut/.test(r.els["ar-world"].innerHTML) && JSON.parse(r.store["sharingu-fold:p1"]).lanes && !Object.keys(JSON.parse(r.store["sharingu-fold:p1"]).lanes).length && /opened/.test(r.els["ar-live"].textContent), "a press on its label opens it; the browser keeps it open");
  r.els["ar-stage"].dispatch("click", { target: { closest: (sel) => (/\.ar-fold/.test(sel) ? lane : null) } });
  ok(/ar-shut/.test(r.els["ar-world"].innerHTML) && JSON.stringify(JSON.parse(r.store["sharingu-fold:p1"]).lanes) === JSON.stringify({ sharingu: ["worker"] }), `pressed again: folded, kept under the project (${r.store["sharingu-fold:p1"]})`);
  // A2 (sprint 5): the fold bar is a keyboard control — focusable, named, its state said — and Enter or Space works it
  const html = r.els["ar-world"].innerHTML;
  ok(new RegExp(`<g class="ar-fold" data-b="${bi}" tabindex="0" role="button" aria-expanded="false" aria-label="Open lane [^"]+"`).test(html),
    "A2 · a folded lane's bar is focusable, a button, aria-expanded false, named Open lane …");
  const keyOn = (k) => { for (const f of r.docL.keydown || []) f({ key: k, target: { tagName: "g", closest: (sel) => (/\.ar-fold/.test(sel) ? lane : null) }, preventDefault() {} }); };
  keyOn("Enter");
  ok(!/ar-shut/.test(r.els["ar-world"].innerHTML) && /opened/.test(r.els["ar-live"].textContent), "A2 · Enter on the fold bar opens the lane");
  keyOn(" ");
  ok(/ar-shut/.test(r.els["ar-world"].innerHTML) && /folded/.test(r.els["ar-live"].textContent), "A2 · Space on the fold bar folds it again (and does not start Play)");
}

// ---- G. the door ----
console.log("G · the door's architecture rule");
{
  const rule = (data) => KINDS.node.rule({ type: "architecture", data });
  ok(rule(SH).length === 0, "the sharingu ops file passes");
  ok(rule(OLD).length === 0 && rule({ summary: "s" }).length === 0 && rule({ diagram: { width: 1, nodes: [{ id: "a", x: 1 }], edges: [{ d: "M1 2L3 4" }] } }).length === 0, "every older shape passes (coordinates, a->b, drawn paths, a summary alone)");
  const bad = [
    ["a step to no node", { diagram: { nodes: [{ id: "a" }], paths: [{ name: "p", steps: [{ from: "a", to: "zz" }] }] } }],
    ["a journey with no step", { diagram: { nodes: [{ id: "a" }], paths: [{ name: "p", steps: [] }] } }],
    ["a journey with no name", { diagram: { nodes: [{ id: "a" }, { id: "b" }], paths: [{ steps: [{ from: "a", to: "b" }] }] } }],
    ["13 journeys", { diagram: { nodes: [{ id: "a" }, { id: "b" }], paths: Array(13).fill({ name: "p", steps: [{ from: "a", to: "b" }] }) } }],
    ["main as a string", { diagram: { nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b", main: "yes" }] } }],
    ["an edge to no node", { diagram: { nodes: [{ id: "a" }], edges: [{ from: "a", to: "b" }] } }],
    ["order as a string", { diagram: { groups: [{ id: "g", order: "1" }] } }],
    ["a node in no such group", { diagram: { groups: [{ id: "g" }], nodes: [{ id: "a", group: "h" }] } }],
    ["a seam on no group", { diagram: { groups: [{ id: "g" }], seam: { group: "h" } } }],
    ["a rule naming no node", { diagram: { nodes: [{ id: "a" }] }, crossing: [{ rule: "r", nodes: ["b"] }] }],
    ["a diagram that is a list", { diagram: [] }],
  ];
  for (const [what, d] of bad) { const out = rule(d); ok(out.length === 1 && out[0].field === "data" && /an architecture's data where/.test(out[0].hint), `refused: ${what} (${out[0] ? out[0].hint.slice(0, 90) : "passed"})`); }
  ok(KINDS.node.rules.some((r) => /paths \[\{name, steps/.test(r)), "the kind's rules say the format, for the formats read");
}

// ---- H. the sharingu ops file ----
console.log("H · sharingu's architecture, as filed");
{
  const M = archModel(SHARINGU);
  ok(M.paths.every((p) => p.steps.every((s) => s.l >= 0)), "every journey step runs along a drawn link");
  const linked = new Set(M.links.flatMap((l) => [l.a, l.b]));
  ok(M.nodes.every((n, i) => linked.has(i)) && SH.diagram.nodes.every((n) => n.group), "every part sits in a band and is linked");
  const words = JSON.stringify([SH.summary, SH.diagram, SH.crossing]);
  ok(!/\bQ[0-9A-F]{8}\b|\bADR-\d|[—–]/.test(words), "no question code, no ADR id, no em dash in what is drawn");
  ok(OPS.ops.every((o) => KINDS.node.rule(o.data).length === 0) && OPS.ops.length === 7 && OPS.project === "sharingu", "every op of the file passes the door's node rule (the architecture and six services)");
}

// ---- I. M4: what the dots say ----
console.log("I · what the dots say (M4)");
{
  const NOW = Date.parse("2026-10-05T12:00:00Z"), ago = (d) => new Date(NOW - d * 864e5).toISOString();
  const marks = {
    grade: { light: "red", failing: { id: "AC.grade.lands", title: "A grade lands in the ledger" }, stale: 0, staleChecks: [], changedAt: null },
    "service:cloudflare-r2": { light: "green", failing: null, stale: 2, staleChecks: [{ id: "AC.r2.a", title: "A body is stored by its hash" }, { id: "AC.r2.b", title: "A body is read back" }], changedAt: ago(2), changedBy: "T-1" },
    preview: { light: "green", failing: null, stale: 0, staleChecks: [], changedAt: ago(1) },
    file: { light: "amber", failing: null, stale: 0, staleChecks: [], changedAt: ago(8) },
  };
  const M = archModel({ ...SHARINGU, marks }, { nowMs: NOW }), at = (id) => M.nodes.findIndex((n) => n.id === id);
  const G = M.nodes[at("grade")], R = M.nodes[at("renders")], F = M.nodes[at("files")];
  ok(G.light === "red" && G.check && G.check.title === "A grade lands in the ledger" && !G.check.stale && !G.stale && !G.regrade, `a red part names its failing check (${JSON.stringify(G.check)})`);
  ok(R.stale === 2 && F.stale === 2 && R.light === "green" && R.check.stale && R.check.id === "AC.r2.a" && R.regrade.join() === "AC.r2.a,AC.r2.b" && R.changed === ago(2).slice(0, 10),
    "the parts on a stale service carry its stale checks, the first one named, both to regrade, and the day it changed");
  ok(M.nodes[at("preview")].changed === ago(1).slice(0, 10) && !M.nodes[at("file")].changed && M.nodes[at("file")].light === "amber" && !M.nodes[at("mcp")].light && !M.nodes[at("mcp")].changed,
    "changed a day ago is this week, eight days ago is not; an unmarked part carries nothing");
  const failing = M.links.map((l, i) => (l.fail ? i : -1)).filter((i) => i >= 0), touching = M.links.map((l, i) => (l.a === at("grade") || l.b === at("grade") ? i : -1)).filter((i) => i >= 0);
  ok(failing.length > 0 && failing.join() === touching.join(), `the links failing are exactly the ${touching.length} touching the red part (a stale part's links run as before)`);
  const blocks = M.paths.map((p) => (p.block ? `${p.block.step}:${M.nodes[p.block.part].id}` : "-"));
  ok(blocks.join(" ") === "3:grade 3:renders 1:grade -", `each journey blocks at its first step touching a red or stale part (${blocks.join(" ")})`);
  ok(M.lit.fail === touching.length && M.lit.changed === 3 && M.lit.blocked === 3, `the counts: ${JSON.stringify(M.lit)}`);
  const P = archModel(SHARINGU), Q = archModel({ ...SHARINGU, marks: {} });
  ok(JSON.stringify(P) === JSON.stringify(Q) && P.nodes.every((n) => !("light" in n) && !("changed" in n) && !("stale" in n)) && P.links.every((l) => !l.fail) && P.paths.every((p) => !p.block) && JSON.stringify(P.lit) === '{"fail":0,"changed":0,"blocked":0}',
    "nothing marked: no part, link or journey carries a mark");
  const twice = meaningOf(archModel({ ...SHARINGU, marks }, { nowMs: NOW }), marks, NOW);
  ok(JSON.stringify(twice) === JSON.stringify(M), "the same marks mark the same, run again");
  // the drawing
  const K = archKit(), L = K.layout(M, {}), open = K.draw(M, L, {}), still = K.draw(M, L, { still: true });
  const gEl = (svg, i) => (new RegExp(`<g class="ar-n" data-i="${i}"[^>]*>`).exec(svg) || [""])[0];
  ok(/data-light="red"/.test(gEl(open, at("grade"))) && /data-stale="2"/.test(gEl(open, at("renders"))) && /data-changed="/.test(gEl(open, at("preview"))) && !/data-light|data-stale|data-changed/.test(gEl(open, at("mcp"))),
    "a part's light, stale count and change ride on it as marks");
  ok(touching.every((i) => new RegExp(`class="ar-l[^"]* ar-fail" data-l="${i}"`).test(open)) && (open.match(/ ar-fail"/g) || []).length === touching.length, "the failing links are drawn in the danger ink");
  ok((open.match(/class="ar-ring"/g) || []).length === 3 && !/class="ar-ring"/.test(still) && (still.match(/>changed<\/text>/g) || []).length === 3, "the first paint rings the 3 changed parts; a still redraw keeps their mark and no ring");
  ok(/\.u-motion \.ar-ring\{animation:u-pulse/.test(ARCH_CSS) && /\.ar-ring\{fill:none;[^}]*opacity:0\}/.test(ARCH_CSS) && /\.ar-n\[data-light="red"\] \.ar-nb\{stroke:var\(--err\)/.test(ARCH_CSS) && /\.ar-dot\.ar-df\{fill:var\(--err\)\}/.test(ARCH_CSS),
    "the pulse is behind u-motion and the ring rests unseen; the outline and the dots in the status ink");
  // the page
  const pg = renderArchView({ arch: plane, architecture: { ...SHARINGU, marks }, project: "sharingu", client: ARCH_CLIENT, nowMs: NOW });
  const ov = (/id="ar-ov"[\s\S]*?<\/aside>/.exec(pg) || [""])[0];
  ok(new RegExp(`data-mark="failing"><b>${touching.length}</b>`).test(ov) && /data-mark="changed"><b>3<\/b>/.test(ov) && /data-mark="blocked"><b>3<\/b>/.test(ov) && (ov.match(/data-blocked="\d+"/g) || []).length === 3,
    "the side counts the failing links, the parts changed and the journeys blocked, and tags each blocked journey");
  ok(!/data-mark=/.test((/id="ar-ov"[\s\S]*?<\/aside>/.exec(page) || [""])[0]), "nothing marked: no count and no tag");
  // the client: the dots, Play to the blocked step, the panel
  const r = runArch(true, null, pg);
  r.tick();
  const df = (r.els["ar-dots"].innerHTML.match(/ar-df/g) || []).length;
  const DM = r.data.M, anyMain = DM.links.some((l) => l.main), onPath = new Set(DM.paths.flatMap((p) => p.steps.map((x) => x.l)));
  const want = DM.links.reduce((t, l, i) => t + (l.fail ? ((anyMain ? l.main : onPath.has(i)) ? 3 : 1) : 0), 0);
  ok(!r.errors.length && df === want && df >= touching.length, `the dots on a failing link run in the danger ink (${df})${r.errors.length ? " · " + r.errors[0].message : ""}`);
  r.click("path-play", { "data-path": "2" });
  for (let k = 0; k < 6; k++) r.tick();
  ok(/2 \/ 6/.test(r.els["ar-cap"].innerHTML) && /data-blocked="11"/.test(r.els["ar-cap"].innerHTML) && /A grade lands in the ledger/.test(r.els["ar-cap"].innerHTML) && /ar-tag err">failing/.test(r.els["ar-cap"].innerHTML),
    `Play stops at the blocked step (2 of 6), the caption names the failing check (${r.els["ar-cap"].innerHTML.slice(0, 120)})`);
  ok(!r.els["ar-insp"].hidden && /data-mark="failing"/.test(r.els["ar-insp"].innerHTML) && /A grade lands in the ledger/.test(r.els["ar-insp"].innerHTML) && !/action="\/regrade"/.test(r.els["ar-insp"].innerHTML) && /Blocked at step 2/.test(r.els["ar-live"].textContent),
    "it pins the blocked part: the panel names the check (no Regrade for a failing one) and the live region says so");
  r.key("Escape"); r.key("Escape");
  r.click("path-play", { "data-path": "1" });
  for (let k = 0; k < 8; k++) r.tick();
  const ip = r.els["ar-insp"].innerHTML;
  ok(/4 \/ 7/.test(r.els["ar-cap"].innerHTML) && /ar-tag needs">stale/.test(r.els["ar-cap"].innerHTML) && /data-mark="stale"/.test(ip) && /action="\/regrade"/.test(ip) && /name="checks" value="AC.r2.a,AC.r2.b"/.test(ip) && /name="next" value="\/map\/arch\?project=sharingu"/.test(ip)
    && /data-button="regrade" data-door="POST \/regrade"/.test(ip) && /data-mark="changed"/.test(ip), "a stale step: the caption says stale, the panel names the check with its Regrade press (both checks) and the day it changed");
  const st = runArch(false, null, pg);
  st.click("path-pick", { "data-path": "0" });
  for (let k = 0; k < 4; k++) st.click("play-journey");
  ok(!st.errors.length && /4 \/ 7/.test(st.els["ar-cap"].innerHTML) && /data-blocked="11"/.test(st.els["ar-cap"].innerHTML) && !st.els["ar-insp"].hidden && st.frames() === 0,
    "without motion, Play steps to the blocked step and stays there, the part pinned, nothing runs");
  st.key("ArrowRight");
  ok(/5 \/ 7/.test(st.els["ar-cap"].innerHTML) && !/data-blocked/.test(st.els["ar-cap"].innerHTML), "→ still steps past it by hand");
  st.key("ArrowLeft"); st.click("play-journey");
  ok(/1 \/ 7/.test(st.els["ar-cap"].innerHTML) && !st.errors.length, "Play pressed at the blocked step starts the journey again, as it does with motion");
}

console.log(`\narch-selftest: ${checks - failed}/${checks} passed`);
process.exit(failed ? 1 : 0);
