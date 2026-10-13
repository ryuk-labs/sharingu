// tools/page-budget.mjs — what each screen and each MCP read costs against the Cloudflare FREE tier, measured on a local
// worker (no Cloudflare call): D1 statements and ROWS READ per load, from the worker's own `d1-rows` Server-Timing entry
// (src/timing.js; this tool sends `x-count-rows: 1` so a bare first() is counted too). The free tier's daily limits are
// account-wide: 5,000,000 rows read · 100,000 rows written · 100,000 requests. A load over WARN rows is flagged; one over
// FAIL rows makes the exit code 1.
//   BUDGET_URL=http://127.0.0.1:8895 BUDGET_CREDS=.runs/r-local/dev-local/credentials.env node tools/page-budget.mjs [project …]
// At the volume of a busy org (tools/volume-local.sh: 300 people, 1,500 tokens, 5,000 events, 1,000 filings …):
//   BUDGET_URL=http://127.0.0.1:8905 BUDGET_CREDS=.runs/r-local/volume-local/credentials.env node tools/page-budget.mjs
// BUDGET_JSON=<file> also writes every row as JSON ({project: {load: {status, read, stmts, …}}}), for a before/after table.
// READ-ONLY by default (sprint 3 S3b: it used to file one eval-marked note per project on the org it measured): every load is a
// GET or a read tool. --write-probe (or BUDGET_WRITE_PROBE=1) adds the one write measure: preview, its page and file on ONE
// eval-marked note per project (each about 28 rows written; Control's clean-eval removes them).
// The loads with an id in their path (a goal, a question, a filing) take the first one the project's own reads answer
// (read {kind: goal, question, contribution}), so the same data gives the same loads.
// --at-address (sprint 7, 7.4: each org at /<org>/…): the pages and the JSON GETs are loaded under the org's address, as a
// browser loads them (the base read off the first page's <html data-org-base>); without it, at the root as a script does (a
// bearer answers there from its own org). The MCP reads are at the one /mcp either way.
import { readFileSync, writeFileSync } from "node:fs";
import { partsOf } from "./import/door.mjs";

const BASE = String(process.env.BUDGET_URL || "http://127.0.0.1:8895").replace(/\/+$/, "");
const CREDS = process.env.BUDGET_CREDS || ".runs/r-local/dev-local/credentials.env";
const key = (readFileSync(CREDS, "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1];
if (!key) { console.error(`no *_AGENT_R_OWNER_KEY line in ${CREDS}`); process.exit(2); }
const ARGS = process.argv.slice(2);
const WRITE_PROBE = ARGS.includes("--write-probe") || process.env.BUDGET_WRITE_PROBE === "1";
const AT_ADDRESS = ARGS.includes("--at-address");
let ADDRESS = "";   // the org's address (--at-address), read once
const named = ARGS.filter((a) => !a.startsWith("--"));
// sprint 12 (12.5): the ORG loads — Activity across every project (GET /audit?all=1, each filter, its second page) and its door
// twin (changes {org: true, list: true}, REST and MCP) — measured once, with no ?project= (they read every project the owner
// may read); --org-only measures them alone
const ORG_ONLY = ARGS.includes("--org-only");
const projects = named.length ? named : ["sharingu", "siru-services"];
const ROWS_READ_DAY = 5_000_000, WARN = Number(process.env.BUDGET_WARN || 1500), FAIL = Number(process.env.BUDGET_FAIL || 6000);

// {id} in a path is filled per project from DISCOVER (a load whose id the project lacks is skipped, and says so)
// the Map (sprint 2): GET /map is the main tab; the old plane URLs open the same page (their JSON twins below)
// sprint 3 B4: {change} is the project's newest code or design contribution (what changes proof): its page with its Impact
// region, its Impact view, and the Map and the Screens view showing it (?impact=)
const PAGES = ["/home", "/build", "/gtm", "/goals", "/goals/{goal}", "/decisions", "/question/{qid}", "/contribution/{tx}",
  "/contribution/{change}", "/contribution/{change}/impact", "/map?impact={change}", "/map/screens?impact={change}", "/map",
  "/map/arch", "/map/data", "/map/api", "/map/mcp", "/map/flows", "/map/deps", "/versions", "/broadcast", "/control", "/missing", "/audit",
  // sprint 3 B5: the Library (docs and cards by kind), What changed (all and one tab); every tab above carries the chip
  "/library", "/changes", "/changes?tab=map",
  // sprint 3 D2: a card's own page on the new path (the project's first card the owner reads)
  "/read?ref={card}"];
// sprint 3 B5: search, measured on real words (BUDGET_SEARCH: a comma-separated list; each also as the Library's search page)
const SEARCHES = String(process.env.BUDGET_SEARCH || "screen,pay,user login,check,the").split(",").map((x) => x.trim()).filter(Boolean);
const JSON_GETS_MAP = ["/map", "/map/lights?since=2099-01-01T00:00:00.000Z"];
// sprint 6, 6.3 (an owner owns one org): the admin's two reports, /log and /storage, and /health (the platform check: one row)
const JSON_GETS = ["/whoami", "/updates", "/broadcast/live", "/formats", "/formats?kind=node", "/control/measures", "/log", "/storage", "/health"];   // sprint 3 S3b: the beta measures (the admin's)   // sprint 3 B1: the standard reads no row   // Broadcast's live picture (sprint 2): its first paint's read, as JSON
// the Screens view's one read (ARCHITECTURE §11): GET /map/screens once per surface the project's screens name (the first
// answer lists them), so the biggest surface is measured too, and map {plane: "screens"} on the default one (D5: the tools'
// one vocabulary — updates holds what heartbeat, state and thread answered; read {kind: "doc"} the library)
const TOOLS = [["updates", {}], ["whoami", {}], ["home", {}], ["build", {}], ["gtm", {}], ["goals", {}],
  ["decisions", {}], ["missing", {}], ["versions", {}], ["read", { kind: "doc" }], ["map", { plane: "screens" }], ["brief", {}],
  ["read", { kind: "goal" }], ["read", { kind: "question" }], ["read", { kind: "contribution" }], ["formats", {}], ["formats", { kind: "node" }], ["formats", { shape: "gtm" }]];

const rowsOf = (res) => {
  const m = /d1-rows;dur=0;desc="read=(\d+) written=(\d+) stmts=(\d+) unknown=(\d+)"/.exec(res.headers.get("server-timing") || "");
  return m ? { read: +m[1], written: +m[2], stmts: +m[3], unknown: +m[4] } : null;
};
const head = { authorization: "Bearer " + key, "x-count-rows": "1" };
async function get(path, project, accept) {
  if (AT_ADDRESS && !ADDRESS) {
    const p = await fetch(`${BASE}/home`, { headers: { authorization: head.authorization, accept: "text/html" } }).then((r) => r.text());
    ADDRESS = (/<html\b[^>]*\sdata-org-base="(\/[a-z0-9-]+)"/.exec(p) || [])[1] || "";
    if (!ADDRESS) { console.error("--at-address: the page names no org address (<html data-org-base>)"); process.exit(2); }
  }
  const at = AT_ADDRESS && path !== "/health" ? ADDRESS : "";   // /health is the platform's, at the root only
  const r = await fetch(`${BASE}${at}${path}${path.includes("?") ? "&" : "?"}project=${encodeURIComponent(project)}`, { headers: { ...head, accept }, redirect: "manual" });
  await r.arrayBuffer();
  return { status: r.status, rows: rowsOf(r) };
}
let id = 0;
async function call(name, args, project) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...head, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: { ...args, project } } }) });
  const body = await r.json().catch(() => null);
  return { status: r.status, rows: rowsOf(r), body };
}
const toolJson = (body) => { try { return JSON.parse(body.result.content[0].text); } catch { return null; } };
async function discover(project) {
  const pickId = (j, keys) => {
    const lists = [j, j && j.items, j && j.rows, j && j.results].filter(Array.isArray);
    for (const l of lists) for (const x of l) for (const k of keys) if (x && x[k]) return String(x[k]);
    return null;
  };
  const g = toolJson((await call("read", { kind: "goal" }, project)).body);
  const qn = toolJson((await call("read", { kind: "question" }, project)).body);
  const tq = toolJson((await call("read", { kind: "contribution", limit: 100 }, project)).body);
  const list = [tq, tq && tq.items, tq && tq.rows].find(Array.isArray) || [];
  const ch = list.find((x) => x && ["code", "design"].includes(String(x.lane || "").toLowerCase()) && x.eval !== 1);
  const cd = ((toolJson((await call("read", { kind: "card", limit: 1 }, project)).body) || {}).items || [])[0];
  return { goal: pickId(g, ["id"]), qid: pickId(qn, ["qid", "id"]), tx: pickId(tq, ["id"]), change: ch ? String(ch.id) : null, card: cd && cd.ref ? cd.ref : null };
}

let worst = 0, failed = 0;
const out = {};
const pad = (s, n) => String(s).padEnd(n), num = (n, w) => String(n).padStart(w);
for (const project of ORG_ONLY ? [] : projects) {
  const ids = await discover(project);
  console.log(`\n${project}  (goal ${ids.goal || "—"} · question ${ids.qid || "—"} · filing ${ids.tx || "—"} · change ${ids.change || "—"})`);
  console.log(`  ${pad("load", 34)} ${pad("http", 5)} ${pad("stmts", 6)} ${pad("rows read", 10)} loads/day on the whole free budget`);
  const rows = [];
  for (const p of PAGES) {
    const m = /\{(\w+)\}/.exec(p);
    if (m && !ids[m[1]]) { rows.push([p, null]); continue; }
    rows.push([m ? p.replace(m[0], "{" + m[1] + "}") : p, await get(m ? p.replace(m[0], encodeURIComponent(ids[m[1]])) : p, project, "text/html")]);
  }
  for (const p of JSON_GETS) rows.push([p + " (json)", await get(p, project, "application/json")]);
  for (const p of JSON_GETS_MAP) rows.push([p.split("?")[0] + " (json)", await get(p, project, "application/json")]);
  const first = await fetch(`${BASE}/map/screens?project=${encodeURIComponent(project)}`, { headers: { authorization: "Bearer " + key, accept: "application/json" } }).then((r) => r.json()).catch(() => null);
  for (const sf of ((first && first.surfaces) || []).filter((x) => x.screens > 0)) {
    rows.push([`/map/screens ${sf.key || "(none)"} (${sf.screens})`, await get(`/map/screens?surface=${encodeURIComponent(sf.key)}`, project, "application/json")]);
    // the Screens view's page for that surface (the same read, the version head and the shell's own)
    rows.push([`/map/screens ${sf.key || "(none)"} page`, await get(`/map/screens?surface=${encodeURIComponent(sf.key)}`, project, "text/html")]);
  }
  for (const [n, a] of TOOLS) rows.push([`mcp ${n}${a.kind ? " " + a.kind : ""}${a.plane ? " " + a.plane : ""}`, await call(n, a, project)]);
  // sprint 3 B5: extract. search per word (the tool, then the Library's page of it), read (a goal, a node, a page of checks),
  // changes (all, the Map's kinds), brief (two hats and a node)
  for (const w of SEARCHES) {
    rows.push([`mcp search "${w}"`, await call("search", { q: w }, project)]);
    rows.push([`/library?q=${w}`, await get(`/library?q=${encodeURIComponent(w)}`, project, "text/html")]);
  }
  const node = ((toolJson((await call("read", { kind: "node", limit: 1 }, project)).body) || {}).items || [])[0];
  rows.push(["mcp read goal/{goal}", ids.goal ? await call("read", { ref: `goal/${ids.goal}` }, project) : null]);
  rows.push(["mcp read {node}", node ? await call("read", { ref: node.id }, project) : null]);
  rows.push(["mcp read kind check (100)", await call("read", { kind: "check", limit: 100 }, project)]);
  rows.push(["mcp changes", await call("changes", {}, project)]);
  rows.push(["mcp changes tab map", await call("changes", { tab: "map" }, project)]);
  rows.push(["mcp brief engineering", await call("brief", { for: "engineering" }, project)]);
  rows.push(["mcp brief management", await call("brief", { for: "management" }, project)]);
  rows.push(["mcp brief {node}", node ? await call("brief", { for: node.id }, project) : null]);
  // sprint 3 B4: the impact tool on that contribution, and the follow-ups due (Home reads them, measured with Home)
  rows.push(["mcp impact {contribution}", ids.change ? await call("impact", { contribution: ids.change }, project) : null]);
  // D5: impact {refs} with its history , on the project's first node
  rows.push(["mcp impact refs {node}", node ? await call("impact", { refs: [node.id] }, project) : null]);
  // sprint 3 B2: preview, its page and the write, on ONE eval-marked plain note (screens never show it): the preview reads the
  // write doors' own rows and its reach, and writes its one row; the page reads that row; each part's write tool (sprint 19:
  // the note's is file_contribution, measured as its own row) writes the note
  // only with --write-probe (the tool is read-only by default)
  if (WRITE_PROBE) {
    const note = [{ contribution: { lane: "leader", kind: "note", what: "page-budget: a measured note", why: "the row budget of preview and its write tool", eval: true } }];
    const pv = await call("preview", { items: note, eval: true }, project);
    rows.push(["mcp preview (1 note)", pv]);
    const pva = toolJson(pv.body) || {}, pid = pva.previewId;
    if (pid) {
      rows.push(["/preview/{id}", await get(`/preview/${pid}`, project, "text/html")]);
      for (const p of partsOf(pva, note)) rows.push([`mcp ${p.tool} (1 note)`, await call(p.tool, { previewId: pid, items: p.items }, project)]);
    } else rows.push(["/preview/{id}", null], ["mcp file_contribution (1 note)", null]);
  }
  out[project] = { ids };
  for (const [label, r] of rows) {
    if (!r) { console.log(`  ${pad(label, 34)} (no id in this project, skipped)`); continue; }
    if (!r.rows) { console.log(`  ${pad(label, 34)} ${pad(r.status, 5)} (no d1-rows entry)`); continue; }
    out[project][label] = { status: r.status, ...r.rows };
    const flag = r.rows.read >= FAIL ? "  ✗ over " + FAIL : r.rows.read >= WARN ? "  ! over " + WARN : "";
    if (r.rows.read >= FAIL) failed++;
    worst = Math.max(worst, r.rows.read);
    const perDay = r.rows.read ? Math.floor(ROWS_READ_DAY / r.rows.read).toLocaleString("en-US") : "—";
    console.log(`  ${pad(label, 34)} ${pad(r.status, 5)} ${num(r.rows.stmts, 5)}  ${num(r.rows.read, 9)}  ${perDay}${r.rows.unknown ? `  (${r.rows.unknown} uncounted)` : ""}${flag}`);
  }
}
{
  // the org loads: no ?project= (the read is every project the owner may read); an id and a cursor from the first answer
  const at = AT_ADDRESS ? ADDRESS : "";
  const orgGet = async (path, accept) => { const r = await fetch(`${BASE}${at}${path}`, { headers: { ...head, accept }, redirect: "manual" }); const t = await r.text(); return { status: r.status, rows: rowsOf(r), text: t }; };
  const first = await orgGet("/changes?org=1&list=1", "application/json");
  let j = null; try { j = JSON.parse(first.text); } catch { j = null; }
  const who = j && j.items && j.items[0] && j.items[0].by ? j.items[0].by.id : null, next = j && j.next, inP = j && j.projects && j.projects[0] ? j.projects[0].slug : null;
  const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const loads = [["/audit?all=1", "text/html"], ["/audit?all=1&lane=code", "text/html"], ["/audit?all=1&state=with", "text/html"], ["/audit?all=1&state=landed", "text/html"],
    [`/audit?all=1&since=${d30}`, "text/html"], ...(inP ? [[`/audit?all=1&in=${inP}`, "text/html"]] : []), ...(who ? [[`/audit?all=1&who=${encodeURIComponent(who)}`, "text/html"]] : []),
    ...(next ? [[`/audit?all=1&before=${encodeURIComponent(next)}`, "text/html"]] : []), ["/audit?all=1&lane=gtm&state=decided", "text/html"]];
  const rows = [["/changes?org=1&list=1 (json)", first]];
  for (const [p, acc] of loads) rows.push([p, await orgGet(p, acc)]);
  rows.push(["/changes?org=1&list=1&limit=100 (json)", await orgGet("/changes?org=1&list=1&limit=100", "application/json")]);
  const mc = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...head, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: "changes", arguments: { org: true, list: true } } }) });
  const mb = await mc.json().catch(() => null), mt = toolJson(mb);
  rows.push([`mcp changes org list${mt && mt.list ? "" : " (answered the counts: list not passed)"}`, { status: mc.status, rows: rowsOf(mc) }]);
  console.log(`\norg (every project the owner may read: ${(j && j.projects || []).map((x) => x.slug).join(", ") || "none"}; first page ${j && j.items ? j.items.length : 0} rows, more ${!!(j && j.more)}${j && j.capped ? `, capped ${j.capped.join(", ")}` : ""})`);
  out.org = {};
  for (const [label, r] of rows) {
    if (!r || !r.rows) { console.log(`  ${pad(label, 34)} ${pad(r ? r.status : "-", 5)} (no d1-rows entry)`); continue; }
    out.org[label] = { status: r.status, ...r.rows };
    const flag = r.rows.read >= FAIL ? "  ✗ over " + FAIL : r.rows.read >= WARN ? "  ! over " + WARN : "";
    if (r.rows.read >= FAIL) failed++;
    worst = Math.max(worst, r.rows.read);
    const perDay = r.rows.read ? Math.floor(ROWS_READ_DAY / r.rows.read).toLocaleString("en-US") : "—";
    console.log(`  ${pad(label, 34)} ${pad(r.status, 5)} ${num(r.rows.stmts, 5)}  ${num(r.rows.read, 9)}  ${perDay}${flag}`);
  }
}
if (process.env.BUDGET_JSON) writeFileSync(process.env.BUDGET_JSON, JSON.stringify(out, null, 1));
const written = Object.values(out).reduce((n, loads) => n + Object.values(loads).reduce((m, v) => m + ((v && v.written) || 0), 0), 0);
console.log(`\nworst load: ${worst} rows read · rows written by the run: ${written}${WRITE_PROBE ? " (--write-probe: one eval-marked note per project)" : " (read-only)"} · limits: ${ROWS_READ_DAY.toLocaleString("en-US")} rows read a day, account-wide · warn ${WARN}, fail ${FAIL}`);
process.exit(failed ? 1 : 0);
