// tools/smoke/s24-d6a-screens.mjs — D6a Part 5, what was left on the screens (docs/plan/SPRINTS.md "Left on the screens"),
// one case per group, through the real door and the served pages of a project of its own (s24):
//   1 · numbers: Home's latest changes carry no day count (Build and What changed count the day); What changed says a mixed
//       day's split; Build's groups say "landed" only when some, not all, landed; Impact lists each ref not on the Map once
//       and a contribution that changes nothing on the Map reads as ONE fact; Activity's last day says it goes on ("3+")
//   2 · raw text: a check's search hit is its title alone; a question page says its ruling once (no near-same option line, no
//       "Options considered" of the one it chose) and its Why carries no hash or path; the filing page has no "Route: Filed"
//   3 · nothing to act on, no control: no Rank on a landed row; no Answer in bulk with nothing open; Clean the suites' residue
//       only on ?eval=1; a disabled Publish says why beside it
//   4 · layout: a stage whose goals are all done is folded; GTM does not open on its empty line; a Strategy doc keeps GTM lit
//       (?from=gtm); Versions says "Not versioned yet" once; Measures fill their rows
// (the Doors view's columns and the atlas's ring, minimap and plate are drawn by the canvas kits: tools/map-selftest.mjs and
// the shots)
import { smoke, expect, brief, http, mcp, html, ownerKey, control, kwrite, fileParts } from "./lib.mjs";

const P = "s24";
const q = {};
const page = async (path, key = ownerKey) => { const r = await html(`${path}${path.includes("?") ? "&" : "?"}project=${P}`, key); expect(r.status === 200, () => `${path}: HTTP ${r.status}`); return r.text; };
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
const fileVia = async (items) => {
  const pv = await mcp(ownerKey, "preview", { project: P, items });
  expect(!pv.isError && pv.out.previewId, () => `preview: ${brief(pv.out)}`);
  const f = await fileParts((n, a) => mcp(ownerKey, n, a), pv.out, items, { only: "ready" });   // sprint 19: each part with its write tool
  expect(!f.isError, () => `file: ${brief(f.out)}`);
  return f.out;
};
const groupHead = (h, title) => (new RegExp(`<span class="p-group-title"[^>]*>${title}</span>(<span class="p-count">[^<]*</span>)?`).exec(h) || [])[0] || "";

smoke("D6a screens · the fixtures: a model with a check, goals with a stage all done, a gtm goal and its strategy doc, a ruled question, a code change and a doc-only one", async () => {
  await control({ action: "add-project", key: P, name: "S24" });
  const K = [
    { kind: "node", op: "upsert", data: { id: "screen:s24-home", type: "screen", name: "S24 Home", data: { surface: "s24-web" } } },
    { kind: "node", op: "upsert", data: { id: "door:s24-items", type: "door", name: "GET /s24/items" } },
    { kind: "check", op: "upsert", data: { id: "AC.s24.home", title: "S24 the home loads", then: "200 HTML holding data-screen=\"s24-home\" and data-region=\"items\"", refs: ["screen:s24-home"] } },
    { kind: "goal", op: "upsert", data: { id: "s24-root", title: "S24 root", parent: null } },
    { kind: "goal", op: "upsert", data: { id: "s24-stage", title: "S24 a stage all done", parent: "s24-root", status: "in progress" } },
    { kind: "goal", op: "upsert", data: { id: "s24-k1", title: "S24 done one", parent: "s24-stage", status: "done" } },
    { kind: "goal", op: "upsert", data: { id: "s24-k2", title: "S24 done two", parent: "s24-stage", status: "done" } },
    { kind: "goal", op: "upsert", data: { id: "s24-gtm", title: "S24 the launch", parent: "s24-root", dimensions: ["gtm"], target: 2 } },
    // a third branch, so the done stage is not most of the tree (a branch holding most of it is opened into its children)
    { kind: "goal", op: "upsert", data: { id: "s24-next", title: "S24 what comes next", parent: "s24-root" } },
    { kind: "goal", op: "upsert", data: { id: "s24-n1", title: "S24 next one", parent: "s24-next" } },
    { kind: "goal", op: "upsert", data: { id: "s24-n2", title: "S24 next two", parent: "s24-next" } },
    { kind: "goal", op: "upsert", data: { id: "s24-n3", title: "S24 next three", parent: "s24-next" } },
    { kind: "doc", op: "upsert", data: { path: "gtm/s24-plan.md", title: "S24 the plan", body: "Who we sell to first." } },
    { kind: "question", op: "upsert", data: { qid: "Q-s24-pub", question: "S24: who publishes to the shelf?", status: "decided", choice: 0,
      label: "Anyone seated publishes their own draft; a Partner may not.", options: [{ what: "Anyone seated publishes their own draft to the shelf; a Partner may not" }],
      decidedBy: "Ryuk", decidedAt: "2026-10-02",
      source: [{ kind: "commit", ref: "7ffdc04420809d718cee139ec3c83b26dbb2d55e", label: "S24 refused to a Partner by role class" }, { kind: "file", ref: "docs/s24/HANDOFF.md" }] } },
  ];
  const w = await kwrite(ownerKey, { project: P, ops: K });
  expect(!w.isError && w.out.written === K.length, () => brief(w.out));
  const C = (o) => ({ contribution: { lane: "code", kind: "pr", why: "s24", proof: "smoke s24 -> 3/3 passing", ...o } });
  const code = await fileVia([C({ what: "S24 the items change", touches: ["door:s24-items", "screen:s24-home", "engine/s24.js", "engine/s24b.js"], goalRef: "s24-root" })]);
  const doc = await fileVia([C({ what: "S24 the plan docs", lane: "leader", kind: "doc", touches: ["docs/s24/plan.md", "docs/s24/notes.md"], goalRef: "s24-root" })]);
  q.code = code.items[0].filed.id; q.doc = doc.items[0].filed.id;
  expect(q.code && q.doc, () => brief([code, doc]));
  return `${q.code} (code, touches the Map and two refs off it) · ${q.doc} (doc-only) · Q-s24-pub ruled · a stage all done`;
});

smoke("D6a screens · 1 numbers: one Today; a mixed day says its split; Build's groups count once; Impact counts each ref once and a doc-only change is one fact; Activity's last day goes on", async () => {
  const f = [];
  const home = await page("/home");
  const wc = region(home, "what-changed");
  if (!/p-group-title[^>]*>Today</.test(wc) || /p-group-title[^>]*>Today<\/span><span class="p-count">/.test(wc)) f.push(`Home's latest changes: the day carries a count (${groupHead(wc, "Today")})`);
  const ch = await page("/changes");
  if (!/data-split>[^<]*knowledge[^<]*contribution|data-split>[^<]*contribution[^<]*knowledge/.test(region(ch, "changes"))) f.push("What changed: a day of knowledge writes and contributions does not say its split");
  const bg = await page("/build?sort=goal");
  if (/<span>\d+ landed<\/span>/.test(bg)) f.push("Build by goal: a group says its count twice (\"N landed\" when all landed)");
  const ip = await page(`/contribution/${q.code}/impact`);
  const imp = (await http("GET", `/contribution/${q.code}/impact?project=${P}`, { key: ownerKey })).json || {};
  const want = new Set([...(imp.unknown || []), ...((imp.touched || {}).unknown || [])]).size;
  const shown = (/Not on the Map<span class="p-chip-n">(\d+)<\/span>/.exec(ip) || [])[1];
  if (!want || String(want) !== shown) f.push(`Impact: the refs not on the Map are ${want}, the page says ${shown || "?"}`);
  const dp = await page(`/contribution/${q.doc}/impact`);
  if (!/data-quiet="1"/.test(dp) || /data-region="glance"/.test(dp) || !/data-fact="nothing-on-the-map"/.test(dp) || (dp.match(/class="p-card[ "]/g) || []).length !== 1) f.push("Impact: a doc-only change is not one fact (one card, no zero tiles)");
  const au = await page("/audit?limit=2");
  const days = [...region(au, "trail").matchAll(/<span class="p-group-title"[^>]*>([^<]*)<\/span><span class="p-count">([^<]*)<\/span>/g)].map((m) => m[2]);
  if (!days.length || !/\+$/.test(days[days.length - 1])) f.push(`Activity: the last day of a page that goes on reads ${days.join(", ") || "nothing"}, not "N+"`);
  expect(!f.length, () => f.join(" · "));
  return `Home: Today with no count · What changed: the split · Build: one count · Impact: ${want} off the Map once, doc-only one fact · Activity: ${days.join(", ")}`;
});

smoke("D6a screens · 2 raw text: a check's hit is its title; a question's ruling is said once with no hash; no Route: Filed", async () => {
  const f = [];
  const lib = await page("/library?q=S24");
  const hit = (/<li class="p-li" data-hit="check\/AC\.s24\.home"[\s\S]*?<\/li>/.exec(lib) || [""])[0];
  if (!hit || /data-screen=|200 HTML/.test(hit) || !/S24 the home loads/.test(hit)) f.push(`search: the check's hit ${hit ? "prints its probe text" : "is not found"}`);
  const qp = await page("/question/Q-s24-pub");
  const opts = region(qp, "options");
  if (/to the shelf; a Partner may not/.test(opts)) f.push("question: the ruling is said twice (its option's near-same words)");
  if (/Options considered/.test(opts)) f.push("question: \"Options considered\" lists only the option it chose");
  const why = region(qp, "why");
  if (/7ffdc0442|docs\/s24|<code>/.test(why) || !/S24 refused to a Partner by role class/.test(why)) f.push("question: the Why carries a hash or a path, or lost its source's words");
  const fp = await page(`/contribution/${q.code}?page=1`);
  if (/<dt>Route<\/dt>/.test(fp) || /Routed · filed/.test(fp)) f.push("filing: Route: Filed is still there");
  expect(!f.length, () => f.join(" · "));
  return "the check by its title · the ruling once, its source by its words · no Route: Filed";
});

smoke("D6a screens · 3 nothing to act on, no control: no Rank on a landed row, no Answer in bulk with nothing open, the suites' clean-up only on ?eval=1, Publish says why", async () => {
  const f = [];
  const b = await page("/build");
  const row = (new RegExp(`<li[^>]*data-id="${q.code}"[\\s\\S]*?</li>`).exec(b) || [""])[0];
  if (!row || /data-button="rank"/.test(row)) f.push(`Build: a landed row ${row ? "offers Rank first" : "is not listed"}`);
  const d = await page("/decisions");
  if (/data-button="answer-bulk"/.test(d)) f.push("Decisions: Answer in bulk with nothing open");
  const c = (await html("/control")).text, ce = (await html("/control?eval=1")).text;
  if (/data-action="clean-eval"/.test(c) || !/data-action="clean-eval"/.test(ce)) f.push(`Control: clean-eval ${/data-action="clean-eval"/.test(c) ? "on the org's page" : "missing from ?eval=1"}`);
  const bc = await page("/broadcast");
  if (!/<span class="bc-why" data-why="publish">[^<]+<\/span><button[^>]*data-button="publish"[^>]*disabled/.test(bc)) f.push("Broadcast: a disabled Publish does not say why beside it");
  expect(!f.length, () => f.join(" · "));
  return "Build: Open only on a landed row · Decisions: no bulk · Control: clean-eval on ?eval=1 only · Publish: why beside it";
});

smoke("D6a screens · 4 layout: a done stage folds; GTM leads with its cards; a Strategy doc keeps GTM lit; Not versioned yet once; Measures fill their rows", async () => {
  const f = [];
  const g = await page("/goals");
  const st = (/<details class="p-group"( open)?[^>]*data-id="s24-stage"/.exec(g) || []);
  if (!st[0] || st[1]) f.push(`Goals: the stage whose goals are all done is ${st[0] ? "open" : "not drawn"}`);
  const gt = await page("/gtm");
  const iMet = gt.indexOf('data-region="metrics"'), iGoals = gt.indexOf('data-region="goals"');
  if (iMet < 0 || iGoals < 0 || iMet < iGoals) f.push("GTM: the empty line opens the page (metrics before the goals)");
  const href = ((/<a[^>]*href="(\/doc\/gtm\/s24-plan\.md[^"]*)"/.exec(region(gt, "strategy")) || [])[1] || "").replace(/&amp;/g, "&");
  if (!/[?&]from=gtm\b/.test(href)) f.push(`GTM: the Strategy doc's link carries no ?from=gtm (${href || "none"})`);
  else { const dpg = await page(href); if (!/data-tab="gtm" aria-current="true"/.test(dpg)) f.push("the doc opened from Strategy lights no tab"); }
  const v = await page("/versions");
  if ((v.match(/Not versioned yet/g) || []).length !== 1) f.push(`Versions: "Not versioned yet" ${(v.match(/Not versioned yet/g) || []).length} times`);
  const ctl = (await html("/control")).text.replace(/<style>[\s\S]*?<\/style>/g, ""), ms = region(ctl, "measures");
  const grids = [...ms.matchAll(/<div class="p-tiles-grid" style="--n:(\d+)"/g)].map((m) => +m[1]);
  const tiles = (ms.match(/class="p-tile"/g) || []).length;
  if (!grids.length || grids.reduce((a, n) => a + n, 0) !== tiles) f.push(`Measures: ${tiles} tiles in rows of [${grids.join(", ")}] (an empty cell)`);
  expect(!f.length, () => f.join(" · "));
  return `Goals: the done stage folded · GTM: cards first · Strategy -> ${href} lights GTM · Versions: once · Measures: rows [${grids.join(", ")}]`;
});
