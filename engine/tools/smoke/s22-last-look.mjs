// tools/smoke/s22-last-look.mjs — sprint 3, L4 · the last look pass before the video (docs/plan/SPRINTS.md "L4"): one case per
// numbered group, each red on the code before it (80714a2ac), through the real door and the served pages.
//   1 · the small figures read in Manrope's tabular figures (JetBrains Mono's dotted zero read as an 8 at 11-12px)
//   2 · numbers that agree: the Goals filter follows the chip's status; every "when" of a contribution is when it HAPPENED;
//       Impact's counts are one count; Decisions' groups count every page; the search tiles add up; Activity's trail is a
//       page ("N+"); Home's What changed is the latest few; Control's projects say the admin holds them; People this week
//       lists no one with 0
//   3 · the right tab is lit (a page that belongs to no tab lights none, or the one its address names; the rail's own tools)
//   4 · plain words: the kind's word, a grade in Activity, the contribution's screens by name, the MCP view as lines, no
//       fill chip on a tab, Impact grouped by how, Control's Admin without the worker and the manifest
//   5 · the atlas and the canvas: every frame has its named plate, pictures load beyond the html cap, no lazy loading; GTM's
//       empty phrase is a quiet line when the tab holds goals; Profile's two forms are named; no card in a card on Admin
//   6 · at 390: a group's summary keeps its words whole; the Map's strip opens on whole columns
//   7 · rows: What changed reads what each row changed (no walk one hop out); a batch of writes is one row
//   8 · the proof rule: a named check with the number it reported is a result (the preview files it)
import { smoke, expect, brief, http, mcp, html, ownerKey, control, kwrite } from "./lib.mjs";
import { goalState } from "../../src/goals.js";
import { happenedOf, kindWord } from "../../src/parts.js";
import { renderLibraryPage } from "../../src/extractpage.js";
import { atlasKit } from "../../src/atlaslayout.js";
import { ATLAS_CLIENT } from "../../src/atlasclient.js";
import { MAP_CLIENT } from "../../src/mapclient.js";

const TAG = String(process.env.S22_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "s22" + TAG, PE = "s22e" + TAG;
const q = {};
const DAY = 864e5;
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return key;
};
const fileVia = async (key, items, project = P) => {
  const pv = await mcp(key, "preview", { project, items });
  expect(!pv.isError && pv.out.previewId, () => `preview: ${brief(pv.out)}`);
  const f = await mcp(key, "file", { previewId: pv.out.previewId, items, only: "ready" });
  expect(!f.isError, () => `file: ${brief(f.out)}`);
  return f.out;
};
const page = async (path, key = ownerKey) => { const r = await html(`${path}${path.includes("?") ? "&" : "?"}project=${P}`, key); expect(r.status === 200, () => `${path}: HTTP ${r.status}`); return r.text; };
const twin = async (path, key = ownerKey) => { const r = await http("GET", `${path}${path.includes("?") ? "&" : "?"}project=${P}`, { key }); expect(r.status === 200 && r.json, () => `${path} JSON: HTTP ${r.status}`); return r.json; };
const unesc = (x) => String(x || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
function region(text, r) {
  const i = text.indexOf(`data-region="${r}"`);
  if (i < 0) return "";
  const open = text.lastIndexOf("<", i), tag = (/^<([a-z0-9]+)/i.exec(text.slice(open)) || [])[1];
  if (!tag) return "";
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = open;
  let depth = 0, m;
  while ((m = re.exec(text))) { depth += m[1] ? -1 : 1; if (!depth) return text.slice(open, m.index + m[0].length); }
  return text.slice(open);
}
const cardCount = (h) => ((/<header class="p-card-head">[\s\S]*?<span class="p-count">([^<]*)<\/span>/.exec(h) || [])[1] || "");
const tileValue = (h, k) => unesc((new RegExp(`data-metric="${k}" data-value="([^"]*)"`).exec(h) || [])[1] || "");
// the rail: which destination (data-tab) is lit, and which of its own tools
const litTab = (h) => ((/<a class="rail-item[^"]*" href="[^"]*" data-tab="([a-z]+)" aria-current="true"/.exec(h) || [])[1] || "");
const litSearch = (h) => /id="tbSearch"[^>]*aria-current="true"/.test(h);
const litChanges = (h) => /<summary class="rail-item" aria-label="What changed"[^>]*aria-current="true"/.test(h);

smoke("last look · the fixtures: a model, goals declared against their %, contributions that happened days ago, 55 rulings in one area", async () => {
  await control({ action: "add-project", key: P, name: "S22" });
  await control({ action: "add-project", key: PE, name: "S22 Empty" });
  q.member = await invite("S22 Noa", `noa${TAG}@s22.local`, "member", [P]);
  const MODEL = [
    { kind: "node", op: "upsert", data: { id: "screen:s22-home", type: "screen", name: "S22 Home", data: { surface: "s22-web", lane: "main", step: 1 } } },
    { kind: "node", op: "upsert", data: { id: "screen:s22-cart", type: "screen", name: "S22 Cart", data: { surface: "s22-web", lane: "main", step: 2 } } },
    { kind: "node", op: "upsert", data: { id: "door:s22-items", type: "door", name: "GET /s22/items" } },
    { kind: "node", op: "upsert", data: { id: "service:s22-pay", type: "service", name: "S22 Payments" } },
    { kind: "edge", op: "upsert", data: { from: "screen:s22-home", to: "door:s22-items", kind: "depends", label: "calls" } },
    { kind: "check", op: "upsert", data: { id: "AC.s22.home", title: "S22 the home screen loads", refs: ["screen:s22-home"] } },
  ];
  const m = await kwrite(ownerKey, { project: P, ops: MODEL });
  expect(!m.isError && m.out.written === MODEL.length, () => brief(m.out));
  await fileVia(ownerKey, [
    { kind: "goal", op: "upsert", data: { id: "s22-root", title: "S22 the last look", parent: null } },
    // declared in progress, measured full: the chip and the filter say In progress
    { kind: "goal", op: "upsert", data: { id: "s22-prog", title: "S22 declared in progress at 100", parent: "s22-root", dimensions: ["code"], target: 1, status: "in progress" } },
    // declared not started, a child under way: the chip and the filter say Not started
    { kind: "goal", op: "upsert", data: { id: "s22-todo", title: "S22 declared not started", parent: "s22-root", status: "not started" } },
    { kind: "goal", op: "upsert", data: { id: "s22-todo-kid", title: "S22 the child under way", parent: "s22-todo", dimensions: ["code"], target: 4 } },
    // a stage in progress whose children are all done: filtered to In progress it is one line, never a group of nothing
    { kind: "goal", op: "upsert", data: { id: "s22-stage", title: "S22 a stage", parent: "s22-root", status: "in progress" } },
    { kind: "goal", op: "upsert", data: { id: "s22-k1", title: "S22 done one", parent: "s22-stage", status: "done" } },
    { kind: "goal", op: "upsert", data: { id: "s22-k2", title: "S22 done two", parent: "s22-stage", status: "done" } },
    { kind: "goal", op: "upsert", data: { id: "s22-gtm", title: "S22 the launch", parent: "s22-root", dimensions: ["gtm"], target: 2 } },
  ]);
  const C = (o) => ({ contribution: { lane: "code", kind: "pr", why: "s22", touches: ["engine/s22.js"], proof: "smoke s22 -> 3/3 passing", ...o } });
  q.d3 = new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10);
  await fileVia(ownerKey, [C({ what: "S22 fills the in-progress goal", goalRef: "s22-prog" }), C({ what: "S22 moves the child", goalRef: "s22-todo-kid" })]);
  // the work happened three days ago; filed now (the order matters: it is filed AFTER the plain one, so filing order puts it first)
  const plain = await fileVia(ownerKey, [C({ what: "S22 work done today", goalRef: "s22-prog" })]);
  const back = await fileVia(ownerKey, [C({ what: "S22 work done three days ago", goalRef: "s22-prog", happenedAt: q.d3 })]);
  q.plain = plain.items[0].filed.id; q.back = back.items[0].filed.id;
  // a contribution naming a screen and a component in their own fields, and one ref in touches
  const imp = await fileVia(ownerKey, [C({ what: "S22 the cart change", touches: ["door:s22-items"], screens: "screen:s22-home,screen:s22-cart", components: ["service:s22-pay"] })]);
  q.imp = imp.items[0].filed.id;
  const g = await mcp(ownerKey, "submit_grade", { project: P, checkId: "AC.s22.home", verdict: "proven", proof: "node tools/s22.mjs -> exit 0, 1 passing" });
  expect(!g.isError, () => `grade: ${brief(g.out)}`);
  // 55 rulings in one area: two pages of settled decisions
  const qs = Array.from({ length: 55 }, (_, i) => ({ kind: "question", op: "upsert", data: { qid: `Q-s22-${i}`, question: `S22 ruling ${i}?`, area: "s22 many", status: "decided", options: [{ what: "Yes" }, { what: "No" }], choice: 0 } }));
  const w = await kwrite(ownerKey, { project: P, ops: qs });
  expect(!w.isError && w.out.written === qs.length, () => `rulings: ${brief(w.out)}`);
  // three writes of one doc each, seconds apart: one batch on What changed
  for (const i of [1, 2, 3]) { const d = await kwrite(ownerKey, { project: P, ops: [{ kind: "doc", op: "upsert", data: { path: `notes/s22-${i}.md`, title: `S22 note ${i}`, body: `# S22 ${i}`, asOf: "2026-10-02", confidence: "confirmed" } }] }); expect(!d.isError, () => brief(d.out)); }
  return `${P}: 4 nodes, 8 goals, contributions ${q.plain} (today) and ${q.back} (happened ${q.d3}), ${q.imp} (a screen pair and a component), 55 rulings, 3 doc writes`;
});

smoke("last look · 1 the small figures are Manrope's tabular figures, never the mono face's dotted zero", async () => {
  const h = await page("/home");
  const rule = (sel) => (new RegExp(`(?:\\n\\s*|})${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}]*\\}`).exec(h) || [""])[0];
  const bad = [".p-count", ".p-line-meta", ".p-chip-n", ".p-bar-v", ".p-tile-sub", ".u-count", ".rail-badge"].filter((s) => !/var\(--sans\)/.test(rule(s)) || !/tabular-nums/.test(rule(s)));
  expect(!bad.length, () => `still mono: ${bad.map((s) => rule(s).slice(0, 90)).join(" | ")}`);
  const map = await page("/map");
  const lights = (/\.mx-light\{[^}]*\}/.exec(map) || [""])[0], legend = (/\.mx-legend b\{[^}]*\}/.exec(map) || [""])[0];
  expect(/var\(--sans\)/.test(lights) && /var\(--sans\)/.test(legend), () => `the Map's lights: ${lights.slice(0, 120)} | ${legend.slice(0, 120)}`);
  expect(/\.p-id\{[^}]*var\(--mono\)/.test(h), "ids stay mono");
  return "counts, times and the Map's lights in Manrope with tabular figures; ids in mono";
});

smoke("last look · 2 numbers that agree: the Goals filter, the time a contribution happened, Impact's one count, Decisions' totals, the search tiles, the trail, Home, Control", async () => {
  const f = [];
  // the Goals filter follows the chip's status (declared, else derived)
  if (goalState({ status: "in progress", pct: 100 }) !== "progress" || goalState({ status: "not started", pct: 14 }) !== "todo" || goalState({ pct: 30 }) !== "progress" || goalState({ pct: 100 }) !== "done")
    f.push("goalState does not put the declared status first");
  const gp = await page("/goals?status=progress");
  const tree = region(gp, "goal-tree");
  if (!/data-id="s22-prog"/.test(tree)) f.push("In progress hides the goal declared in progress that reads 100%");
  // (a parent drawn only as the context of a matching child carries data-context="1": it is not one of the filter's rows)
  if (/data-id="s22-todo"(?![^>]*data-context="1")/.test(tree)) f.push("In progress lists the goal declared not started");
  if (/Nothing under it matches/.test(tree)) f.push("a stage filtered to nothing is drawn as a group of 0");
  // the time: the one helper, Build's Moved card, a goal's day groups, Home's week
  if (happenedOf({ happenedAt: "2026-09-30", at: "2026-10-02T10:00:00Z" }) !== "2026-09-30" || happenedOf({ created_at: "x" }) !== "x") f.push("happenedOf");
  const b = await page("/build");
  const tempo = region(b, "tempo");
  const ids = [...tempo.matchAll(/data-moved="([^"]+)"/g)].map((m) => m[1]);
  if (ids.indexOf(q.plain) < 0 || (ids.includes(q.back) && ids.indexOf(q.back) < ids.indexOf(q.plain))) f.push(`Moved this week by filing time: ${ids.join(",")}`);
  const backRow = (new RegExp(`data-moved="${q.back}"[\\s\\S]*?</li>`).exec(tempo) || [""])[0];
  if (backRow && !/>3d</.test(backRow)) f.push(`the backdated row's time on Moved: ${(/<span>([^<]*)<\/span><\/span>/.exec(backRow) || [])[1]}`);
  const bGoal = region(await page("/build?sort=goal"), "tempo");
  if ([...bGoal.matchAll(/data-moved="([^"]+)"/g)].map((m) => m[1]).join(",") !== ids.join(",")) f.push("Moved this week follows the list's sort");
  const node = await page("/goals/s22-prog?period=all");
  const days = [...region(node, "filings").matchAll(/<span class="p-group-title"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
  if (days.length < 2) f.push(`a goal's contributions by the day they happened: ${days.join(", ")}`);
  const hs = await twin("/home/summary");
  const at = 6 - 3;
  if (!hs.week || !(hs.week.landed[at] >= 1)) f.push(`Home's Landed bars by the day it happened: ${brief(hs.week && hs.week.landed)}`);
  // Impact: the tile, the card and the contribution page read ONE count
  const ip = await page(`/contribution/${q.imp}/impact`), cp = await page(`/contribution/${q.imp}?page=1`);
  const changedTile = tileValue(ip, "changed"), changedCard = cardCount(region(ip, "changed"));
  const touches = (/<dt>Touches<\/dt><dd><span data-field="touches"[^>]*><a [^>]*>(\d+) nodes?<\/a>/.exec(cp) || [])[1];
  if (!(changedTile && changedTile === changedCard && changedTile === touches)) f.push(`Impact: tile ${changedTile}, card ${changedCard}, the contribution page ${touches}`);
  const reachTile = tileValue(ip, "reaches"), reachCard = cardCount(region(ip, "reaches"));
  if (reachTile !== (reachCard || "0")) f.push(`Reaches: tile ${reachTile}, card ${reachCard}`);
  // Decisions: an area's group counts every page, and says it continues
  const dp = await page("/decisions");
  const grp = (/<details class="p-group"[^>]*data-area="s22 many"[^>]*>[\s\S]*?<span class="p-count">([^<]*)<\/span>/.exec(region(dp, "ruled")) || [])[1];
  if (grp !== "55" || !/data-more="5"/.test(region(dp, "ruled"))) f.push(`the area's group reads ${grp} (55 ruled, 50 on page one) and says ${(/data-more="(\d+)"/.exec(dp) || [])[1] || "nothing"} more`);
  // search: the tiles add up to Matches
  const groups = ["goal", "question", "check", "card", "doc", "node"].map((k, i) => ({ kind: k, label: k, count: i + 2, hits: [] }));
  const sp = renderLibraryPage({}, { total: groups.reduce((a, g) => a + g.count, 0), groups, words: ["x"] }, { q: "x" });
  const tiles = [...sp.matchAll(/<span class="p-tile-label">[^<]*<\/span><span class="p-tile-row"><span class="p-tile-v"><b[^>]*>([^<]*)<\/b>/g)].map((m) => Number(m[1]));
  if (tiles.length < 2 || tiles.slice(1).reduce((a, n) => a + n, 0) !== tiles[0]) f.push(`search tiles ${tiles.join(" + ")} do not add up`);
  // Activity: a page of the trail is said as one ("N+")
  const au = await page("/audit?limit=2");
  if (!/>2\+<\/span>/.test(region(au, "trail").slice(0, 600))) f.push(`the trail's count: ${cardCount(region(au, "trail"))}`);
  // Home: the latest changes are labelled so; nobody with 0 in People this week
  const home = await page("/home");
  const wc = region(home, "what-changed");
  if (!/Latest changes/.test(wc) || /<span class="p-count">/.test((/<header class="p-card-head">[\s\S]*?<\/header>/.exec(wc) || [""])[0])) f.push("Home's What changed is not labelled as the latest few");
  if (/data-person="S22 Noa"/.test(region(home, "who-is-here"))) f.push("People this week lists someone with 0");
  // Control: a project with no seat is the admin's, never a bare "0 seats"
  const ct = await http("GET", "/control", { key: ownerKey }).then(() => html("/control"));
  const pe = (new RegExp(`<li class="p-li" data-project="${PE}"[\\s\\S]*?</li>`).exec(ct.text) || [""])[0];
  if (!/Admin only/.test(pe) || /0 seats/.test(pe)) f.push(`Control's empty project: ${(/<span[^>]*data-seats[^>]*>([^<]*)</.exec(pe) || [])[1] || pe.slice(0, 120)}`);
  expect(!f.length, () => f.join(" · "));
  return `goals by declared status; Moved [${ids.join(", ")}], the backdated row 3d; Impact ${changedTile}/${changedCard}/${touches}; the area 55 with 5 more; the trail 2+`;
});

smoke("last look · 3 the right tab is lit: none for a page of no tab (or the one its address names), the rail's tools for theirs", async () => {
  const f = [];
  const lib = await page("/library"), ch = await page("/changes"), holes = await page("/missing"), proj = await html("/projects");
  if (litTab(lib) || !litSearch(lib)) f.push(`the Library lights ${litTab(lib) || "no tab"} and Search ${litSearch(lib)}`);
  if (litTab(ch) || !litChanges(ch)) f.push(`What changed lights ${litTab(ch) || "no tab"} and its rail entry ${litChanges(ch)}`);
  if (litTab(holes)) f.push(`What is missing lights ${litTab(holes)}`);
  if (litTab(proj.text)) f.push(`Projects lights ${litTab(proj.text)}`);
  const doc = await page("/doc/notes/s22-1.md");
  if (litTab(doc)) f.push(`a doc lights ${litTab(doc)}`);
  const fromGtm = await page("/doc/notes/s22-1.md?from=gtm");
  if (litTab(fromGtm) !== "gtm") f.push(`a doc reached from GTM lights ${litTab(fromGtm) || "nothing"}`);
  const bogus = await page("/library?from=nope");
  if (litTab(bogus)) f.push("an unknown ?from lights a tab");
  const tx = await page(`/contribution/${q.imp}?page=1`);
  if (litTab(tx) !== "build") f.push(`a contribution lights ${litTab(tx)}`);
  expect(!f.length, () => f.join(" · "));
  return "Library and search: Search · What changed: its entry · What is missing, Projects, a doc: none · ?from=gtm: GTM · a contribution: Build";
});

smoke("last look · 4 plain words: kinds, a grade in Activity, names for ids, the MCP view as lines, no fill chip on a tab, Impact by how, Admin", async () => {
  const f = [];
  if (kindWord("pr") !== "code change") f.push(`kindWord(pr) = ${kindWord("pr")}`);
  const b = await page("/build");
  const kinds = (/data-filter="kind">([\s\S]*?)<\/div>/.exec(b) || [""])[0];
  if (/<span class="p-fchip-w">pr<\/span>/.test(kinds) || !/code change/.test(kinds)) f.push("Build's kind chips say pr");
  const au = await page("/audit");
  if (/grade AC\.s22\.home: proven/.test(au) || !/Graded [^<]+ · proven/.test(au)) f.push("Activity prints the grade's raw line");
  const cp = await page(`/contribution/${q.imp}?page=1`);
  if (!/>S22 Home<\/a>/.test(cp) || !/>S22 Payments<\/a>/.test(cp) || /<code>service:s22-pay<\/code>/.test(cp)) f.push("the contribution page names screens and components by their ids");
  const mcpv = await page("/map/mcp");
  if (/<tr data-tool=/.test(mcpv) || !/<li class="p-li" data-tool="/.test(mcpv)) f.push("the MCP view is a table");
  if (/`/.test(region(mcpv, "mcp-tools").replace(/<code hidden>[\s\S]*?<\/code>/g, "").replace(/<div class="p-ld-body">[\s\S]*?<\/div>/g, "").replace(/\stitle="[^"]*"/g, ""))) f.push("literal backticks on the MCP view's lines");
  for (const t of ["/goals", "/decisions", "/map", "/gtm", "/broadcast"]) { const h = await page(t); if (/data-meter="/.test(h) || / filled: \d+ of \d+/.test(h)) f.push(`${t} carries a fill chip`); }
  const ip = await page(`/contribution/${q.imp}/impact`);
  const ch = region(ip, "changed");
  if ((ch.match(/>named in what it touches</g) || []).length > 0 || !/p-group-title[^>]*>What it touches</.test(ch)) f.push("Impact repeats how on every row");
  const ad = region((await html("/control")).text, "this-org");
  if (/Manifest|>Worker</.test(ad) || !/MCP address/.test(ad)) f.push("Admin shows the worker or the manifest, or no MCP address");
  expect(!f.length, () => f.join(" · "));
  return "code change · Graded … · proven · S22 Home by name · MCP tools as lines · no fill chip · Impact by how · Admin: org and MCP address";
});

smoke("last look · 5 the atlas and the canvas: a named plate on every frame, pictures past the html cap, no lazy loading; GTM's quiet line; Profile's forms; Admin's one card", async () => {
  const f = [];
  const K = atlasKit();
  const A = { dev: { fw: 300, fh: 200 }, f: Array.from({ length: 30 }, (_, i) => ({ x: (i % 10) * 320, y: Math.floor(i / 10) * 220, rs: [[-1, "", "image", "h" + i, 1440, 900, "", -1]], st: [], w: null })), sty: [] };
  const plan = K.plan(A, { s: 1, tx: 0, ty: 0 }, { w: 3200, h: 700 }, 4, -1, "render");
  const may = plan.near.filter((o) => o.may).length;
  if (plan.lv !== 2 || may <= 4) f.push(`pictures at level ${plan.lv}: ${may} may load (the html cap is 4)`);
  if (/'loading','lazy'/.test(ATLAS_CLIENT)) f.push("the atlas loads its pictures lazily");
  if (!/STEP_S=0\.75/.test(MAP_CLIENT) || /function fitUnits/.test(MAP_CLIENT)) f.push("a playing flow is not framed readable");
  const sc = await page("/map/screens");
  const frames = (sc.match(/<li class="ax-f/g) || []).length, plates = (sc.match(/<div class="ax-plate"/g) || []).length;
  if (!frames || plates !== frames) f.push(`atlas: ${plates} plates for ${frames} frames`);
  if (!/\.ax-stage:focus-visible\{box-shadow:none\}/.test(sc)) f.push("the board draws its focus ring round the whole stage");
  const gt = await page("/gtm");
  const mt = (/<section class="([^"]*)"[^>]*data-region="metrics"/.exec(gt) || [])[1] || "";
  if (!/p-card-quiet/.test(mt)) f.push(`GTM's empty contributions are a card (${mt})`);
  const pr = (await html("/profile")).text;
  if (!/aria-labelledby="pr-h-pass"/.test(pr) || !/aria-labelledby="pr-h-key"/.test(pr)) f.push("Profile's two secret forms are not named");
  const ad = region((await html("/control")).text, "this-org");
  if ((ad.match(/class="p-card[ "]/g) || []).length > 1) f.push("a card inside the Admin card");
  expect(!f.length, () => f.join(" · "));
  return `${may} of 30 pictures may load at level 2; ${plates}/${frames} plates; GTM quiet; Profile named; Admin one card`;
});

smoke("last look · 6 at 390: a group's summary keeps its words whole; the Map's strip opens on whole columns", async () => {
  const h = await page("/goals");
  const phone = (/@media \(max-width:600px\)\{[\s\S]*?\.p-group-sum\{([^}]*)\}/.exec(h) || [])[1] || "";
  expect(/flex:none/.test(phone) && /\.p-group-sum>\.p-chip,\.p-group-sum>a/.test(h), () => `the phone's group summary: ${phone}`);
  expect(/function stripScale/.test(MAP_CLIENT), "the Map's strip has no fitted scale");
  return "summary words whole; the strip fitted to two columns";
});

smoke("last look · 7 rows: What changed reads what each row changed (its reach is the Impact view's), and a batch of writes is one row", async () => {
  const ch = await page("/changes");
  const list = region(ch, "changes");
  expect(!/data-reach="/.test(list) && /data-touched="/.test(list), () => `the chips: ${(list.match(/data-(reach|touched)="[^"]*"/g) || []).slice(0, 4).join(" ")}`);
  const batch = (/<li class="p-li" data-change="[^"]+" data-kind="knowledge" data-batch="(\d+)"[\s\S]*?class="p-line-title"[^>]*>([^<]*)</.exec(list) || []);
  expect(batch[1] === "3" && /^3 docs$/.test(batch[2] || ""), () => `the three doc writes: ${batch[1] || "no batch"} "${batch[2] || ""}"`);
  const j = await twin("/changes");
  expect((j.changes || []).filter((c) => /^1 doc written$/.test(c.what)).length >= 3 && (j.changes || []).some((c) => c.reaches && c.reaches.total != null), () => "the JSON twin keeps every row and the reach");
  return "chips say what changed; 3 doc writes are one row (the JSON keeps all three)";
});

smoke("last look · 8 the proof rule: a named check with the number it reported files", async () => {
  const item = { contribution: { lane: "code", kind: "pr", what: "S22 the copy check", why: "s22", touches: ["engine/tools/copy-check.mjs"], proof: "The commit states: the copy check lists 393 strings on the revision's pages; no page adopts the parts yet." } };
  const pv = (await mcp(ownerKey, "preview", { project: P, items: [item] })).out;
  const it = (pv.items || [])[0] || {};
  expect(it.verdict === "files", () => `verdict ${it.verdict}: ${brief(it.reasons)}`);
  const bare = (await mcp(ownerKey, "preview", { project: P, items: [{ contribution: { ...item.contribution, proof: "the copy check lists the strings on the revision's pages" } }] })).out;
  expect(((bare.items || [])[0] || {}).verdict !== "files", "a number-free claim files");
  return "the bare count files; the number-free claim does not";
});
