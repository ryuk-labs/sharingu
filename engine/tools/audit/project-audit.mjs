#!/usr/bin/env node
// engine/tools/audit/project-audit.mjs — the per-project audit of an org's data (sprint 3, P2 "every project sharp and clean
// before the ship"). It reads ONLY through the door (MCP tools/call and the REST JSON a reader may read), so the same command
// runs against a local org and, later, against live. It never writes.
//
//   node tools/audit/project-audit.mjs --url <worker> --creds <credentials.env> [--projects a,b,…] [--out <audit.json>]
//        [--import-logs <dir>] [--after-import <dir>] [--cost-dir <dir>] [--arch <ops.json>] [--renders all|<n>] [--bodies|--no-bodies]
//
// The key: AUDIT_KEY in the env, else the *_AGENT_R_OWNER_KEY line of --creds (never printed). --projects defaults to every
// project the key may write. For each project it states:
//   1. stored: every kind counted by paging read (and == built, from the importer's own read-back lines in
//      --import-logs/import-*-<project>.log when given), with the counts by kind (goals, questions open/decided, checks,
//      nodes by type, edges by kind, cards by kind, docs, renders by format, styles);
//   2. the meter (holes) per area and per item, and the SAME items recounted here from the kinds' own reads: an item whose
//      have/want differs is a finding (the meter is not true to the data);
//   3. the basics: an aim (with a measure, or an open question about its measure), one goal root with goals under it, a
//      start-here doc, the model's top level (a surface or a lane or the architecture);
//   4. junk and dirt: a junk project (the old seed's "<slug> local"), eval-marked rows, duplicate nodes (same type and name),
//      nodes with no edge and no check (by type), edges to a missing node, check refs naming nothing, open questions with
//      fewer than 2 options, goal roots past the first, placeholder titles, empty doc and card bodies, cards of a kind not
//      filed, renders of a screen not filed, the architecture node against --arch (sharingu), stale names (STALE below);
//   5. the atlas: GET /map/screens for every surface, every render's body (or a sample: --renders <n>; default all on a
//      local URL, 10 otherwise) answers 200 with the content type of its format; a 410 is a missing body;
//   6. every tab loads (200) with its rows read (Server-Timing d1-rows), the worst named;
//   7. rows written: the importer's own measure (--cost-dir/import-cost-<project>.json), against the 100,000 a day;
//   8. the text rules (tools/audit/text-rules.mjs, sprint 3): no machine path (~/, /Users/, /private/, /tmp/ …) and no
//      credential-shaped text in any stored text — every field of every listed item, and (BODIES) every doc's and card's
//      body and every node's data, the aim — each a [high] finding, named by item and field, never by the value. Render
//      bodies (R2) are not read. Stale names a project keeps as its own history (tools/audit/historic-names.json) are
//      counted apart as "historic, the source's own" and raise no finding.
// It prints one table per project and a summary, and writes everything to --out (default audit.json in the cwd).
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { textHits } from "./text-rules.mjs";

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const BASE = String(flag("--url", process.env.AUDIT_URL || "")).replace(/\/+$/, "");
if (!BASE) { console.error("usage: node tools/audit/project-audit.mjs --url <worker> --creds <credentials.env> [--projects a,b] [--out audit.json] [--import-logs <dir>] [--cost-dir <dir>] [--arch <ops.json>] [--renders all|<n>]"); process.exit(2); }
const KEY = process.env.AUDIT_KEY || (() => {
  const c = flag("--creds");
  if (!c) return null;
  return (readFileSync(c, "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1] || null;
})();
if (!KEY) { console.error("project-audit: no key (AUDIT_KEY, or an *_AGENT_R_OWNER_KEY line in --creds)"); process.exit(2); }
const LOCAL = /^https?:\/\/(127\.|localhost|0\.0\.0\.0|\[::1\])/.test(BASE);
const RENDERS = flag("--renders", LOCAL ? "all" : "10");
const BODIES = has("--no-bodies") ? false : has("--bodies") ? true : LOCAL;
const OUT = resolve(flag("--out", "audit.json"));
const LOGS = flag("--import-logs");
// --after-import <dir>: the replayable after-import fill (tools/ship/after-import/<project>/*.items.json) is part of what a
// project is BUILT from once it has run: its knowledge items (the screens' pictures) are added to the importer's built
// counts, each distinct key once (a render by screen and variant), so a filled org audits stored == built too
const AFTER = flag("--after-import");
const COSTS = flag("--cost-dir");
const ARCH = flag("--arch");
const WARN_ROWS = 1500, DAY_WRITES = 100_000;

// deleted machinery and old names (docs/plan/ARCHITECTURE.md §10, the 2026-09-30 ruling) — a visible text naming one says
// what the product no longer is. Matched case-insensitively on names, titles and questions, and on doc and card bodies.
// A term with a project list is sharingu's own deleted machinery and counts only there (another project's "orchestrator" or
// "umbrella" is its own word); the rest are the old engine's names, stale wherever they appear.
const OURS = ["sharingu", "ryuklabs", "siru-services"];
const STALE = [
  ["Agent R", /\bagent[ -]r\b/i], ["siru-services", /\bsiru-services\b/i], ["the brain kit", /\bbrain[ -]kit\b/i],
  ["publish-pack", /publish-pack/i], ["close-mechanical", /close-mechanical/i], ["fold-ledger", /fold-ledger/i],
  ["the old pack tools (pack_*)", /\bpack_(kinds|find|card|checks|decisions|live)\b/],
  ["orchestrator", /\borchestrator\b/i, OURS], ["the land door", /\bland door\b/i, OURS], ["the lane workflow", /\blane workflow\b/i, OURS],
  ["the umbrella", /\bumbrella\b/i, OURS], ["the native SDLC", /\bnative sdlc\b/i, OURS], ["the intaker", /\bintaker\b/i, OURS],
  ["the brain (as the product)", /\b(unified|platform|org|ops|sharingu) brain\b/i, OURS],
];
// a project's old names that are its own history (historic-names.json): counted apart, no finding
const HISTORIC = (() => { try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "historic-names.json"), "utf8")); } catch { return {}; } })();
const PLACEHOLDER = /^\s*(todo|tbd|untitled|test|placeholder|xxx|lorem|foo|n\/a|-|\?)\s*$/i;
const TABS = [["Home", "/home"], ["Build", "/build"], ["GTM", "/gtm"], ["Goals", "/goals"], ["Decisions", "/decisions"],
  ["Map", "/map"], ["Broadcast", "/broadcast"], ["What is missing", "/missing"]];

// ---- the door ----------------------------------------------------------------------------------------------------------
const H = { authorization: "Bearer " + KEY, "x-count-rows": "1", "user-agent": "sharingu-project-audit/1.0" };
const rowsOf = (res) => {
  const m = /d1-rows;dur=[\d.]+;desc="read=(\d+) written=(\d+) stmts=(\d+) unknown=(\d+)"/.exec(res.headers.get("server-timing") || "");
  return m ? { read: +m[1], written: +m[2], stmts: +m[3] } : null;
};
let rpcId = 0, calls = 0, readTotal = 0;
async function tool(name, args) {
  calls++;
  const r = await fetch(BASE + "/mcp", { method: "POST", headers: { ...H, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }) });
  const rows = rowsOf(r); if (rows) readTotal += rows.read;
  const j = await r.json().catch(() => null);
  if (!j || j.error) return { ok: false, out: j ? j.error : `HTTP ${r.status}` };
  const t = j.result && j.result.content && j.result.content[0] && j.result.content[0].text;
  let out; try { out = JSON.parse(t); } catch { out = t; }
  return { ok: !j.result.isError, out };
}
async function get(path, accept = "application/json") {
  calls++;
  const r = await fetch(BASE + path, { headers: { ...H, accept }, redirect: "manual" });
  const rows = rowsOf(r); if (rows) readTotal += rows.read;
  const ct = r.headers.get("content-type") || "";
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  if (/json/.test(ct)) { try { json = JSON.parse(buf.toString("utf8")); } catch { json = null; } }
  return { status: r.status, ct, bytes: buf.length, json, rows };
}
// readAll(project, kind) -> every item of the kind (`read`, paged 100 a call); a one-row kind (aim, gtm) answers its row or nothing
async function readAll(project, kind) {
  const items = [];
  let cursor = null;
  for (let p = 0; p < 1000; p++) {
    const r = await tool("read", { project, kind, limit: 100, ...(cursor ? { after: cursor } : {}) });
    if (!r.ok) throw new Error(`read ${project}/${kind}: ${JSON.stringify(r.out).slice(0, 200)}`);
    const o = r.out;
    if (Array.isArray(o.items)) items.push(...o.items);
    else if (o.item) items.push(o.item);
    if (!o.next || o.next === cursor) break;
    cursor = o.next;
  }
  return items;
}
async function getOne(project, kind, id, extra = {}) {
  const r = await tool("read", { project, kind, ref: id, ...extra });
  return r.ok ? r.out.item : null;
}
async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}
const count = (list, f) => list.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const sample = (list, n = 5) => list.slice(0, n);
const canon = (v) => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v ?? null);

// the importer's own read-back: "    <kind> built N  stored M  =" lines of its log
function builtFromLog(project) {
  if (!LOGS) return null;
  const files = readdirSync(LOGS).filter((f) => new RegExp(`^import-(.+-)?${project.replace(/[-]/g, "\\-")}\\.log$`).test(f));
  if (!files.length) return null;
  const text = readFileSync(join(LOGS, files.sort().pop()), "utf8");
  const out = {};
  for (const m of text.matchAll(/^\s+([a-z_]+)\s+built\s+(\d+)\s+stored\s+(\S+)\s+(.*)$/gm)) out[m[1]] = { built: +m[2], stored: m[3] === "?" ? null : +m[3], flag: m[4].trim() };
  if (AFTER) for (const [kind, n] of Object.entries(afterImportCounts(project))) out[kind] = { built: (out[kind] ? out[kind].built : 0) + n, stored: out[kind] ? out[kind].stored : null, flag: `${out[kind] ? out[kind].flag + " " : ""}+${n} after-import` };
  return out;
}
// the after-import fill's knowledge items for a project, distinct keys per kind (contributions and grades are not kinds)
function afterImportCounts(project) {
  const dir = join(AFTER, project);
  if (!existsSync(dir)) return {};
  const keys = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".items.json")).sort()) {
    const b = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const it of b.items || []) {
      if (!it || !it.kind || it.op === "delete") continue;
      const d = it.data || {};
      const k = it.kind === "render" ? `${d.screen}|${d.variant || ""}` : String(d.id ?? d.qid ?? d.path ?? d.key ?? JSON.stringify(d));
      (keys[it.kind] ||= new Set()).add(k);
    }
  }
  return Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.size]));
}
function costOf(project) {
  if (!COSTS) return null;
  const p = join(COSTS, `import-cost-${project}.json`);
  if (!existsSync(p)) return null;
  const c = JSON.parse(readFileSync(p, "utf8"));
  const kinds = c.kinds || {};
  const written = Object.values(kinds).reduce((n, k) => n + (k.written || 0), 0);
  return { written, measuredAt: c.measuredAt || null, perKind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.written])) };
}

// ---- one project -------------------------------------------------------------------------------------------------------
async function auditProject(project, archOps) {
  const A = { project, findings: [] };
  const terms = STALE.filter(([, , only]) => !only || only.includes(project));
  const find = (sev, area, what, data) => A.findings.push({ sev, area, what, ...(data ? { data } : {}) });
  const K = {};
  for (const kind of ["aim", "gtm", "goal", "card_kind", "question", "node", "edge", "check", "card", "doc", "style", "render"]) K[kind] = await readAll(project, kind);

  // 1 · stored, by kind (and == built)
  const stored = Object.fromEntries(Object.entries(K).map(([k, v]) => [k, v.length]));
  const built = builtFromLog(project);
  const vsBuilt = built ? Object.fromEntries(Object.keys({ ...built, ...Object.fromEntries(Object.entries(stored).filter(([, n]) => n)) }).map((k) => [k, { built: built[k] ? built[k].built : 0, stored: stored[k] || 0, importerSaid: built[k] ? built[k].flag : null }])) : null;
  if (vsBuilt) for (const [k, v] of Object.entries(vsBuilt)) if (v.built !== v.stored) find("high", "stored", `${k}: built ${v.built}, stored ${v.stored}`);
  const nodes = K.node, nodeIds = new Set(nodes.map((n) => n.id));
  const byType = count(nodes, (n) => n.type);
  const goals = K.goal, goalIds = new Set(goals.map((g) => g.id));
  const qs = K.question, qids = new Set(qs.map((q) => q.qid));
  A.counts = {
    aim: K.aim.length, measure: K.aim[0] ? !!K.aim[0].measure : false, gtmTemplate: K.gtm.length,
    goals: goals.length, goalRoots: goals.filter((g) => !g.parent).length,
    questions: qs.length, questionsByStatus: count(qs, (q) => q.status),
    checks: K.check.length, nodes: nodes.length, nodesByType: byType, edges: K.edge.length, edgesByKind: count(K.edge, (e) => e.kind),
    cardKinds: K.card_kind.length, cards: K.card.length, cardsByKind: count(K.card, (c) => c.kind), docs: K.doc.length,
    renders: K.render.length, rendersByFormat: count(K.render, (r) => r.format), styles: K.style.length,
  };
  // grades: holes' grades item (the checks with a fresh grade) is the door's count; read carries no grade
  A.stored = stored; A.vsBuilt = vsBuilt;

  // the screens, through the Screens view's own read (every surface): lane, step, wireframe, renders
  const scr = await get(`/map/screens?project=${encodeURIComponent(project)}`);
  const surfaces = scr.json && Array.isArray(scr.json.surfaces) ? scr.json.surfaces : [];
  const screens = [];
  const atlas = { status: scr.status, rows: scr.rows && scr.rows.read, surfaces: [] };
  for (const s of surfaces) {
    const r = s.key === (scr.json && scr.json.surface) ? scr : await get(`/map/screens?project=${encodeURIComponent(project)}&surface=${encodeURIComponent(s.key)}`);
    atlas.surfaces.push({ key: s.key, name: s.name, screens: s.screens, status: r.status, rows: r.rows && r.rows.read, bytes: r.bytes });
    if (r.status !== 200) find("high", "atlas", `/map/screens surface ${s.key} answered ${r.status}`);
    for (const x of (r.json && r.json.screens) || []) screens.push({ ...x, surface: s.key, styles: r.json.styles || {} });
  }
  const screenNodes = nodes.filter((n) => n.type === "screen");
  // a screen several apps share (data.surface a list, D1b item 20) is drawn on each of its apps' views: every count below
  // is over the distinct screens (the first app's row), never the view rows
  const seenScreen = new Set();
  const screensAll = screens.splice(0, screens.length);
  for (const x of screensAll) if (!seenScreen.has(x.id)) { seenScreen.add(x.id); screens.push(x); }
  atlas.sharedScreens = screensAll.length - screens.length;
  if (screenNodes.length && screens.length !== screenNodes.length) find("medium", "atlas", `${screenNodes.length} screen nodes, ${screens.length} on the Screens view's surfaces (a screen whose data.surface names no surface node is not drawn)`, { missing: sample(screenNodes.filter((n) => !screens.some((s) => s.id === n.id)).map((n) => n.id), 8) });

  // 5 · the atlas: every render's body (or a sample)
  const renderList = screens.flatMap((s) => (s.renders || []).map((r) => ({ ...r, screen: s.id, styleHash: r.style ? s.styles[r.style] : null })));
  const want = RENDERS === "all" ? renderList : renderList.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / Number(RENDERS))) === 0).slice(0, Number(RENDERS));
  const typeOk = { html: /text\/html/, image: /^image\//, wireframe: /json/ };
  const rres = await pool(want, 8, async (r) => {
    const g = await get(`/render/${r.hash}?project=${encodeURIComponent(project)}${r.styleHash ? `&style=${r.styleHash}` : ""}`, "*/*");
    return { screen: r.screen, format: r.format, status: g.status, ct: g.ct, okType: g.status === 200 && (typeOk[r.format] || /./).test(g.ct), bytes: g.bytes };
  });
  atlas.renders = { indexed: renderList.length, checked: rres.length, ok: rres.filter((x) => x.okType).length, missingBody: rres.filter((x) => x.status === 410).length,
    other: sample(rres.filter((x) => !x.okType && x.status !== 410), 5) };
  if (atlas.renders.missingBody) find("high", "atlas", `${atlas.renders.missingBody} render bodies missing (410)`);
  if (atlas.renders.ok + atlas.renders.missingBody < atlas.renders.checked) find("high", "atlas", `${atlas.renders.checked - atlas.renders.ok - atlas.renders.missingBody} renders answer a wrong status or type`, atlas.renders.other);
  const indexedOnScreens = renderList.length;
  if (K.render.length !== indexedOnScreens) find("medium", "atlas", `${K.render.length} renders stored, ${indexedOnScreens} reachable from the Screens view (a render of a screen on no surface is never shown)`);
  A.atlas = atlas;

  // 2 · the meter, and its recount
  const h = await tool("missing", { project });
  const holes = h.ok ? h.out : null;
  A.meter = holes ? { words: holes.meter.words, done: holes.meter.done, total: holes.meter.total, pct: holes.meter.pct,
    areas: holes.areas.map((a) => ({ area: a.area, applies: a.applies, done: a.done, total: a.total, pct: a.pct })),
    items: Object.fromEntries(holes.checklist.map((it) => [it.id, { state: it.state, have: it.have, want: it.want }])) } : { error: h.out };
  const edgesFrom = new Map(), edgesTo = new Map();
  for (const e of K.edge) { (edgesFrom.get(e.from) || edgesFrom.set(e.from, []).get(e.from)).push(e); (edgesTo.get(e.to) || edgesTo.set(e.to, []).get(e.to)).push(e); }
  const checkRefs = new Set(K.check.flatMap((c) => c.refs || []));
  const openQs = qs.filter((q) => q.status === "open");
  const gaps = nodes.filter((n) => n.type === "gap");
  const surfaceNodes = nodes.filter((n) => n.type === "surface");
  const doors = nodes.filter((n) => n.type === "door"), tables = nodes.filter((n) => n.type === "table");
  const leaves = goals.filter((g) => !goals.some((c) => c.parent === g.id));
  const roots = goals.filter((g) => !g.parent);
  const gtmKinds = K.card_kind.filter((k) => k.tab === "gtm");
  const navTouch = new Set(K.edge.filter((e) => e.kind === "nav").flatMap((e) => [e.from, e.to]));
  const recount = {
    aim: { have: (K.aim[0] ? 1 : 0) + (K.aim[0] && K.aim[0].measure ? 1 : 0), want: 2 },
    "goal-tree": goals.length ? { have: (roots.length >= 1 ? 1 : 0) + (goals.length > 1 ? 1 : 0) + leaves.filter((g) => (g.dimensions || []).length).length, want: 2 + leaves.length } : { have: 0, want: 1 },
    "questions-options": { have: openQs.filter((q) => (q.options || []).length >= 2).length, want: openQs.length },
    gaps: { have: gaps.filter((g) => g.status === "closed").length, want: gaps.length },
    "start-here": { have: K.doc.some((d) => d.path === "start-here.md") ? 1 : 0, want: 1 },
    apps: { have: surfaceNodes.length ? 1 : 0, want: 1 },
    screens: { have: surfaceNodes.filter((s) => screensAll.some((x) => x.surface === s.id.replace(/^surface:/, ""))).length, want: surfaceNodes.length },
    "screens-in-flow": { have: screens.filter((s) => (s.lane && s.step != null) || navTouch.has(s.id)).length, want: screenNodes.length },
    doors: { have: doors.length ? 1 : 0, want: 1 }, tables: { have: tables.length ? 1 : 0, want: 1 },
    "door-table-links": { have: doors.filter((d) => (edgesFrom.get(d.id) || []).some((e) => e.kind === "reads" || e.kind === "writes")).length, want: doors.length },
    "screens-pictured": { have: screens.filter((s) => s.wireframe || (s.renders || []).length).length, want: screenNodes.length },
    "checks-screens": { have: screenNodes.filter((s) => checkRefs.has(s.id)).length, want: screenNodes.length },
    "checks-doors": { have: doors.filter((d) => checkRefs.has(d.id)).length, want: doors.length },
    "gtm-lists": { have: gtmKinds.filter((k) => K.card.some((c) => c.kind === k.key)).length, want: Math.max(1, gtmKinds.length) },
    "gtm-template": { have: K.gtm.length ? 1 : 0, want: 1 },
    "gtm-strategy": { have: K.doc.some((d) => d.path.startsWith("gtm/")) ? 1 : 0, want: 1 },
  };
  A.recount = recount;
  A.meterTrue = [];
  if (holes) for (const it of holes.checklist) {
    const rc = recount[it.id];
    if (!rc || it.state === "not_applicable") continue;
    // the door counts "the surfaces a screen names" and "goal-tree" by its own k_fill rows: compare have/want
    const same = rc.have === it.have && rc.want === it.want;
    A.meterTrue.push({ id: it.id, door: `${it.have}/${it.want}`, recount: `${rc.have}/${rc.want}`, same });
    if (!same) find("medium", "meter", `${it.id}: the meter says ${it.have}/${it.want}, the data recounts ${rc.have}/${rc.want}`);
  }
  // an area marked complete on thin data: a done item whose want is 1 while the data holds a whole population
  if (holes && holes.checklist.find((x) => x.id === "goal-tree" && x.state === "done") && goals.length < 3) find("medium", "meter", `goal-tree reads done with ${goals.length} goal(s)`);

  // 3 · the basics
  const startHere = K.doc.find((d) => d.path === "start-here.md");
  const aimQ = qs.find((q) => q.status === "open" && (/measure|aim's number/i.test(q.question || "") || q.area === "aim"));
  const aimRuled = qs.find((q) => q.status === "decided" && /aim's number|aim.{0,20}measure|measure.{0,40}aim/i.test(q.question || ""));
  // D1b items 18 and 19: what the project DECLARES on its aim — a measure ruled absent ({none, why}) and no product model by
  // design (productModel {none, why}) — are facts, not holes: the audit reads them and raises no finding for either
  const measureNone = !!(K.aim[0] && K.aim[0].measure && K.aim[0].measure.none);
  const modelNone = !!(K.aim[0] && K.aim[0].productModel && K.aim[0].productModel.none);
  A.basics = {
    aim: K.aim[0] ? (measureNone ? `aim, measure ruled absent (${String(K.aim[0].measure.why || "").slice(0, 60)})` : K.aim[0].measure ? "aim + measure" : aimQ ? `aim, measure open (${aimQ.qid})` : aimRuled ? `aim, measure ruled (${aimRuled.qid}: ${String(aimRuled.label || aimRuled.choice || "").slice(0, 50)})` : "aim, NO measure and no question about it") : "MISSING",
    goalTree: roots.length === 1 ? `one root (${roots[0].id}), ${goals.length - 1} under it` : roots.length ? `${roots.length} roots` : "MISSING",
    startHere: startHere ? "yes" : "MISSING",
    model: modelNone ? `none, by design (${String(K.aim[0].productModel.why || "").slice(0, 60)})`
      : [surfaceNodes.length && `${surfaceNodes.length} app(s)`, byType.lane && `${byType.lane} lane(s)`, byType.architecture && "the architecture", byType.service && `${byType.service} service(s)`].filter(Boolean).join(", ") || "MISSING",
  };
  if (!K.aim[0]) find("high", "basics", "no aim");
  else if (!K.aim[0].measure && !aimQ && !aimRuled) find("medium", "basics", "the aim has no measure and no question asks for one");
  if (roots.length !== 1) find("high", "basics", roots.length ? `${roots.length} goal roots` : "no goal tree");
  if (!startHere) find("high", "basics", "no start-here.md doc");
  if (!modelNone && !surfaceNodes.length && !byType.lane && !byType.architecture) find("high", "basics", "no top level of the model (no app, lane or architecture)");
  // the exact call the checklist gives for each basic still open (the owner's to file when the source does not say it)
  A.basicCalls = holes ? Object.fromEntries(holes.items.filter((x) => ["aim", "goal-tree", "start-here", "apps"].includes(x.id)).map((x) => [x.id, { what: x.what, fill: x.fill }])) : {};

  // 4 · junk and dirt
  const J = {};
  // duplicate nodes: same type and name, different ids
  const byName = new Map();
  const surfaceOf = new Map(screens.map((x) => [x.id, x.surface]));
  for (const n of nodes) { const k = `${n.type}\u0000${String(n.name || "").trim().toLowerCase()}${n.type === "screen" ? "\u0000" + (surfaceOf.get(n.id) || "") : ""}`; (byName.get(k) || byName.set(k, []).get(k)).push(n.id); }
  J.duplicateNodes = [...byName.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => ({ type: k.split("\u0000")[0], name: k.split("\u0000")[1].slice(0, 80), ...(k.split("\u0000")[2] ? { surface: k.split("\u0000")[2] } : {}), ids }));
  // orphans: no edge in or out, no check naming them, and (screens) no render
  const orphan = nodes.filter((n) => !edgesFrom.has(n.id) && !edgesTo.has(n.id) && !checkRefs.has(n.id));
  J.orphansByType = count(orphan, (n) => n.type);
  J.orphanSample = Object.fromEntries(Object.keys(J.orphansByType).map((t) => [t, sample(orphan.filter((n) => n.type === t).map((n) => `${n.id} · ${String(n.name).slice(0, 60)}`), 3)]));
  J.edgesToMissing = K.edge.filter((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to)).map((e) => `${e.from} > ${e.to} (${e.kind})`);
  const refable = new Set([...nodeIds, ...goalIds, ...qids]);
  // a ref no node, goal or question answers is one of three things: a ref to a CARD (the kinds a board renders as cards:
  // machine, job, notification …), a PROOF POINTER (a test file the check is proven by: widget, maestro, rls …), or dead: a
  // ref shaped like a node id of a type the model files (screen:, door:, table: …) whose node is not there
  const NODE_TYPES = new Set(["surface", "lane", "screen", "door", "table", "entity", "flow", "gap", "dep", "evidence", "service", "architecture", "api"]);
  const cardIds = new Set(K.card.map((c) => `${c.kind}:${c.id}`));
  const unresolved = K.check.flatMap((c) => (c.refs || []).filter((r) => !refable.has(r)).map((r) => ({ check: c.id, ref: r, type: String(r).split(":")[0] })));
  const deadRefs = unresolved.filter((x) => NODE_TYPES.has(x.type));
  const cardRefs = unresolved.filter((x) => !NODE_TYPES.has(x.type) && cardIds.has(x.ref));
  const pointers = unresolved.filter((x) => !NODE_TYPES.has(x.type) && !cardIds.has(x.ref));
  J.checkRefsNamingNothing = { refs: deadRefs.length, checks: new Set(deadRefs.map((x) => x.check)).size, byRefType: count(deadRefs, (x) => x.type), sample: sample(deadRefs.map((x) => `${x.check} → ${x.ref}`), 6),
    toCards: cardRefs.length, toCardsByType: count(cardRefs, (x) => x.type), proofPointers: pointers.length, proofPointersByType: count(pointers, (x) => x.type), proofSample: sample(pointers.map((x) => `${x.check} → ${x.ref}`), 3) };
  J.checksWithNoRef = K.check.filter((c) => !(c.refs || []).length).length;
  J.openQuestionsUnder2Options = openQs.filter((q) => (q.options || []).length < 2).map((q) => q.qid);
  J.extraGoalRoots = roots.slice(1).map((g) => g.id);
  J.goalsParentMissing = goals.filter((g) => g.parent && !goalIds.has(g.parent)).map((g) => g.id);
  const titled = [
    ...goals.map((g) => ["goal", g.id, g.title]), ...qs.map((q) => ["question", q.qid, q.question]), ...nodes.map((n) => ["node", n.id, n.name]),
    ...K.check.map((c) => ["check", c.id, c.title]), ...K.card.map((c) => ["card", `${c.kind}/${c.id}`, c.name]), ...K.doc.map((d) => ["doc", d.path, d.title]),
  ];
  J.placeholderTitles = titled.filter(([, , t]) => t == null || String(t).trim() === "" || PLACEHOLDER.test(String(t))).map(([k, id, t]) => `${k} ${id}: ${JSON.stringify(t)}`);
  J.markupInTitles = { n: titled.filter(([, , t]) => /\*\*|^\s*[-#>]|[\u{1F534}\u{1F7E0}\u{1F7E1}✅❌]/u.test(String(t || ""))).length,
    byKind: count(titled.filter(([, , t]) => /\*\*|^\s*[-#>]|[\u{1F534}\u{1F7E0}\u{1F7E1}✅❌]/u.test(String(t || ""))), ([k]) => k),
    sample: sample(titled.filter(([, , t]) => /\*\*|^\s*[-#>]|[\u{1F534}\u{1F7E0}\u{1F7E1}✅❌]/u.test(String(t || ""))).map(([k, id, t]) => `${k} ${id}: ${String(t).slice(0, 90)}`), 4) };
  J.emptyDocs = K.doc.filter((d) => !d.bodyBytes).map((d) => d.path);
  J.emptyCards = K.card.filter((c) => !c.bodyBytes).map((c) => `${c.kind}/${c.id}`);
  const kindKeys = new Set(K.card_kind.map((k) => k.key));
  J.cardsOfUnknownKind = K.card.filter((c) => !kindKeys.has(c.kind)).map((c) => `${c.kind}/${c.id}`);
  J.cardKindsEmpty = K.card_kind.filter((k) => !K.card.some((c) => c.kind === k.key)).map((k) => k.key);
  J.rendersOfMissingScreen = K.render.filter((r) => !nodeIds.has(r.screen)).map((r) => `${r.screen}|${r.state}|${r.variant}`);
  // eval-marked or test-looking rows
  // a suite's or a test's own row (the old seeds and suites file under these prefixes and words), never a product's own
  // check or question ABOUT tests
  J.testLooking = titled.filter(([, id, t]) => /^(eval|test|smoke|selftest|fixture|demo)[-_:.]/i.test(String(id)) || /^(eval|test|smoke|page-budget|selftest)\b[: ]/i.test(String(t || "")) || /\blocal\b.*\bowner\b|lorem ipsum/i.test(String(t || ""))).map(([k, id, t]) => `${k} ${id}: ${String(t).slice(0, 80)}`);
  // stale names: titles first, then (BODIES) the doc and card bodies and the architecture's data
  const staleHits = [];
  for (const [k, id, t] of titled) for (const [term, re] of terms) if (re.test(String(t || ""))) staleHits.push({ where: "title", kind: k, id, term });
  let fullDocs = [], fullCards = [], fullNodes = [];
  if (BODIES) {
    const docs = fullDocs = await pool(K.doc, 6, (d) => getOne(project, "doc", d.path));
    for (const d of docs) if (d) for (const [term, re] of terms) if (re.test(d.body || "")) staleHits.push({ where: "body", kind: "doc", id: d.path, term });
    const cards = fullCards = await pool(K.card, 6, (c) => getOne(project, "card", c.id, { cardKind: c.kind }));
    for (const c of cards) if (c) for (const [term, re] of terms) if (re.test(c.body || "")) staleHits.push({ where: "body", kind: "card", id: `${c.kind}/${c.id}`, term });
    if (K.aim[0]) for (const [term, re] of terms) if (re.test(K.aim[0].aim || "")) staleHits.push({ where: "aim", kind: "aim", id: "aim", term });
    fullNodes = await pool(nodes.filter((n) => n.dataBytes), 8, (n) => getOne(project, "node", n.id));   // the text rules read node data
  }
  // 8 · the text rules: every string of every listed item, and (BODIES) the bodies and node data read above
  const refOf = (kind, x) => kind === "question" ? x.qid : kind === "card" ? `${x.kind}/${x.id}` : kind === "doc" ? x.path : kind === "edge" ? `${x.from}>${x.to}` : kind === "render" ? `${x.screen}|${x.state || ""}|${x.variant || ""}` : kind === "card_kind" ? x.key : x.id || kind;
  const walkStr = (v, path, out) => { if (typeof v === "string") out.push([path, v]); else if (Array.isArray(v)) v.forEach((y, i) => walkStr(y, `${path}[${i}]`, out)); else if (v && typeof v === "object") for (const [k2, y] of Object.entries(v)) walkStr(y, path ? `${path}.${k2}` : k2, out); return out; };
  const textFindings = [];
  const scanItem = (kind, x, only) => { for (const [f, str] of walkStr(only ? { [only]: x[only] } : x, "", [])) for (const h of textHits(str)) textFindings.push({ kind, ref: refOf(kind, x), field: f, group: h.group, rule: h.rule }); };
  for (const [kind, list] of Object.entries(K)) if (kind !== "render") for (const x of list) scanItem(kind, x);
  for (const d of fullDocs) if (d) scanItem("doc", d, "body");
  for (const c of fullCards) if (c) scanItem("card", c, "body");
  for (const n of fullNodes) if (n) scanItem("node", n, "data");
  J.textRules = { checked: BODIES ? "every listed field, doc and card bodies, node data, the aim (render bodies not read)" : "every listed field and the aim (no bodies, no node data: --bodies to read them)",
    machinePath: { items: new Set(textFindings.filter((x) => x.group === "machine-path").map((x) => `${x.kind} ${x.ref}`)).size, byRule: count(textFindings.filter((x) => x.group === "machine-path"), (x) => x.rule),
      refs: sample([...new Set(textFindings.filter((x) => x.group === "machine-path").map((x) => `${x.kind} ${x.ref} (${x.field})`))], 20) },
    credential: { items: new Set(textFindings.filter((x) => x.group === "credential").map((x) => `${x.kind} ${x.ref}`)).size, byRule: count(textFindings.filter((x) => x.group === "credential"), (x) => x.rule),
      refs: sample([...new Set(textFindings.filter((x) => x.group === "credential").map((x) => `${x.kind} ${x.ref} (${x.field})`))], 20) } };
  // a term this project keeps as its own history (historic-names.json) is counted apart: no finding
  const hist = HISTORIC[project] && Array.isArray(HISTORIC[project].terms) ? HISTORIC[project] : null;
  const isHist = (x) => !!hist && hist.terms.includes(x.term);
  const histHits = staleHits.filter(isHist);
  staleHits.splice(0, staleHits.length, ...staleHits.filter((x) => !isHist(x)));
  J.staleNames = { hits: staleHits.length, items: new Set(staleHits.map((x) => `${x.kind}/${x.id}`)).size, byTerm: count(staleHits, (x) => x.term),
    byKind: count([...new Map(staleHits.map((x) => [`${x.kind}/${x.id}`, x])).values()], (x) => `${x.kind} ${x.where}`),
    sample: sample([...new Map(staleHits.map((x) => [`${x.kind}/${x.id}`, x])).values()].map((x) => `${x.kind} ${x.id} (${x.where}: ${x.term})`), 8),
    historic: { items: new Set(histHits.map((x) => `${x.kind}/${x.id}`)).size, byTerm: count(histHits, (x) => x.term), why: hist ? hist.why : null } };
  // the architecture node
  const arch = nodes.find((n) => n.type === "architecture");
  if (archOps && project === archOps.project) {
    const want = archOps.ops.find((o) => o.kind === "node" && o.data.type === "architecture");
    const got = arch ? await getOne(project, "node", arch.id) : null;
    J.architecture = !got ? "MISSING" : want && canon(got.data) === canon(want.data.data) ? `current (${ARCH})` : "STALE: differs from " + ARCH;
    if (J.architecture !== `current (${ARCH})`) find("high", "junk", `the architecture node is ${J.architecture}`);
  } else J.architecture = arch ? "present (no reference to compare)" : "none";
  A.junk = J;
  const jn = (k, n, sev = "medium") => { if (n) find(sev, "junk", `${k}: ${n}`); };
  jn("duplicate nodes (same type and name)", J.duplicateNodes.length);
  jn("edges to a missing node", J.edgesToMissing.length, "high");
  jn("check refs naming no node, goal or question", J.checkRefsNamingNothing.refs);
  jn("open questions with fewer than 2 options", J.openQuestionsUnder2Options.length, "high");
  jn("goal roots past the first", J.extraGoalRoots.length, "high");
  jn("placeholder or empty titles", J.placeholderTitles.length);
  jn("titles carrying raw markdown or emoji", J.markupInTitles.n, "low");
  jn("empty docs", J.emptyDocs.length);
  jn("empty cards", J.emptyCards.length, "low");
  jn("cards of a kind not filed", J.cardsOfUnknownKind.length, "high");
  jn("renders of a missing screen", J.rendersOfMissingScreen.length, "high");
  jn("items naming deleted machinery or old names", J.staleNames.items);
  jn("text rule: items holding a machine path (a home-folder or absolute path of a machine)", J.textRules.machinePath.items, "high");
  jn("text rule: items holding credential-shaped text", J.textRules.credential.items, "high");

  // 6 · every tab
  A.tabs = [];
  for (const [label, path] of TABS) {
    const g = await get(`${path}?project=${encodeURIComponent(project)}`, "text/html");
    A.tabs.push({ tab: label, path, status: g.status, read: g.rows ? g.rows.read : null, kb: Math.round(g.bytes / 1024) });
    if (g.status !== 200) find("high", "tabs", `${label} answered ${g.status}`);
    else if (g.rows && g.rows.read > WARN_ROWS) find("high", "tabs", `${label} read ${g.rows.read} rows (> ${WARN_ROWS})`);
  }
  // 7 · rows written
  A.rowsWritten = costOf(project);
  return A;
}

// ---- the run -------------------------------------------------------------------------------------------------------------
const who = await tool("whoami", {});
if (!who.ok) { console.error(`whoami refused: ${JSON.stringify(who.out)}`); process.exit(1); }
const all = who.out.writeProjects || [];
const projects = flag("--projects") ? flag("--projects").split(",").map((s) => s.trim()).filter(Boolean) : all;
const org = { name: who.out.org, projects: all, junkProjects: all.filter((p) => p === "local" || /-local$/.test(p) || / local$/i.test(p)) };
const archOps = ARCH ? JSON.parse(readFileSync(ARCH, "utf8")) : null;
const started = Date.now();
const results = [];
for (const p of projects) {
  process.stderr.write(`· auditing ${p}\n`);
  results.push(await auditProject(p, archOps));
}

// ---- print ---------------------------------------------------------------------------------------------------------------
const fmt = (n) => (n == null ? "-" : Number(n).toLocaleString("en-US"));
const kv = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ") || "none";
console.log(`project-audit · ${BASE} · org ${org.name} · projects ${org.projects.join(", ")}${org.junkProjects.length ? ` · JUNK PROJECTS: ${org.junkProjects.join(", ")}` : " · no junk project"}`);
for (const A of results) {
  const c = A.counts;
  console.log(`\n== ${A.project} ${"=".repeat(Math.max(0, 100 - A.project.length))}`);
  console.log(`  stored     aim ${c.aim}${c.aim ? (c.measure ? " (measure)" : " (no measure)") : ""} · gtm ${c.gtmTemplate} · goals ${c.goals} (roots ${c.goalRoots}) · questions ${c.questions} (${kv(c.questionsByStatus)}) · checks ${fmt(c.checks)}`);
  console.log(`             nodes ${fmt(c.nodes)} (${kv(c.nodesByType)})`);
  console.log(`             edges ${fmt(c.edges)} (${kv(c.edgesByKind)}) · cards ${c.cards} (${kv(c.cardsByKind)}) · docs ${c.docs} · renders ${fmt(c.renders)} (${kv(c.rendersByFormat)}) · styles ${c.styles}`);
  if (A.vsBuilt) { const bad = Object.entries(A.vsBuilt).filter(([, v]) => v.built !== v.stored); console.log(`  built      ${bad.length ? "MISMATCH " + bad.map(([k, v]) => `${k} ${v.built}≠${v.stored}`).join(", ") : `stored == built for every kind (${Object.keys(A.vsBuilt).length} kinds)`}`); }
  if (A.meter.error) console.log(`  meter      ERROR ${JSON.stringify(A.meter.error).slice(0, 120)}`);
  else {
    console.log(`  meter      ${A.meter.words} · ${A.meter.areas.filter((a) => a.applies).map((a) => `${a.area} ${a.done}/${a.total}`).join(" · ")}`);
    const off = A.meterTrue.filter((x) => !x.same);
    console.log(`  meter true ${off.length ? "NO: " + off.map((x) => `${x.id} door ${x.door} vs data ${x.recount}`).join("; ") : `yes (${A.meterTrue.length} items recounted)`}`);
    console.log(`  open items ${Object.entries(A.meter.items).filter(([, v]) => v.state !== "done" && v.state !== "not_applicable").map(([k, v]) => `${k} ${v.have}/${v.want}`).join(" · ") || "none"}`);
  }
  console.log(`  basics     aim: ${A.basics.aim} · goals: ${A.basics.goalTree} · start-here: ${A.basics.startHere} · model: ${A.basics.model}`);
  const J = A.junk;
  console.log(`  junk       dup nodes ${J.duplicateNodes.length} · orphans ${kv(J.orphansByType)} · edges→missing ${J.edgesToMissing.length} · dead check refs ${J.checkRefsNamingNothing.refs} on ${J.checkRefsNamingNothing.checks} checks (${kv(J.checkRefsNamingNothing.byRefType)}) · refs to cards ${J.checkRefsNamingNothing.toCards} · proof pointers ${fmt(J.checkRefsNamingNothing.proofPointers)} (${kv(J.checkRefsNamingNothing.proofPointersByType)})`);
  console.log(`             open Q <2 options ${J.openQuestionsUnder2Options.length} · extra roots ${J.extraGoalRoots.length} · placeholders ${J.placeholderTitles.length} · markup in titles ${J.markupInTitles.n} (${kv(J.markupInTitles.byKind)}) · empty docs ${J.emptyDocs.length} · empty cards ${J.emptyCards.length} · unknown card kind ${J.cardsOfUnknownKind.length} · renders→missing screen ${J.rendersOfMissingScreen.length} · test-looking ${J.testLooking.length}`);
  console.log(`             stale names: ${J.staleNames.items} items (${kv(J.staleNames.byTerm)})${J.staleNames.historic.items ? ` · historic, the source's own: ${J.staleNames.historic.items} items (${kv(J.staleNames.historic.byTerm)})` : ""} · architecture: ${J.architecture}`);
  console.log(`  text rules machine path ${J.textRules.machinePath.items} items${J.textRules.machinePath.items ? ` (${kv(J.textRules.machinePath.byRule)}): ${J.textRules.machinePath.refs.slice(0, 6).join("; ")}` : ""} · credential-shaped ${J.textRules.credential.items} items${J.textRules.credential.items ? ` (${kv(J.textRules.credential.byRule)}): ${J.textRules.credential.refs.slice(0, 6).join("; ")}` : ""} · read: ${J.textRules.checked}`);
  if (J.duplicateNodes.length) console.log(`             e.g. duplicates ${J.duplicateNodes.slice(0, 3).map((d) => `${d.type} "${d.name}"${d.surface ? ` (${d.surface})` : ""} ${d.ids.join("/")}`).join("; ")}`);
  if (J.staleNames.sample.length) console.log(`             e.g. stale ${J.staleNames.sample.slice(0, 4).join("; ")}`);
  const at = A.atlas;
  console.log(`  atlas      /map/screens ${at.status} · ${at.surfaces.length} app(s) (${at.surfaces.map((s) => `${s.key} ${s.screens}`).join(", ") || "none"}) · renders ${fmt(at.renders.indexed)} indexed, ${fmt(at.renders.checked)} fetched, ${fmt(at.renders.ok)} ok, ${at.renders.missingBody} missing body · worst surface read ${fmt(Math.max(0, ...at.surfaces.map((s) => s.rows || 0)))} rows`);
  const worst = A.tabs.reduce((m, t) => (t.read || 0) > (m.read || 0) ? t : m, { read: 0 });
  console.log(`  tabs       ${A.tabs.map((t) => `${t.tab} ${t.status}/${fmt(t.read)}r`).join(" · ")} · worst ${worst.tab} ${fmt(worst.read)} rows`);
  console.log(`  written    ${A.rowsWritten ? `${fmt(A.rowsWritten.written)} rows (the importer's measure, ${A.rowsWritten.measuredAt})` : "no measure given"}`);
  console.log(`  findings   ${A.findings.length ? A.findings.map((f) => `[${f.sev}] ${f.what}`).join("\n             ") : "none"}`);
}
const total = results.reduce((n, A) => n + (A.rowsWritten ? A.rowsWritten.written : 0), 0);
console.log(`\nsummary · ${results.length} project(s) · rows written by the import ${fmt(total)} = ${(total / DAY_WRITES).toFixed(2)} free days (100,000 a day; ${Math.ceil(total / (DAY_WRITES * 0.95))} day(s) under the 95% guard) · this audit: ${calls} requests, ${fmt(readTotal)} rows read, ${Math.round((Date.now() - started) / 1000)} s`);
writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), url: BASE, org, rowsWrittenTotal: total, projects: results }, null, 2) + "\n");
console.log(`wrote ${OUT}`);
