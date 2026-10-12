#!/usr/bin/env node
// engine/tools/ship/after-import.mjs — the replayable AFTER-IMPORT fill (sprint 3, lane P): what a project's people filed
// through the door ON the ship candidate that no source holds — its contributions (the history from the commits, with their
// proof as the record states it) and the pictures of its screens (image renders) — kept as item files so the SAME fill can
// be replayed on live after the ship's import. Grades are NOT here: a grade's proof must be observed on the org it is filed
// on, so a grading run is repeated on live, never replayed.
//
//   node tools/ship/after-import.mjs <url> --creds <credentials.env> [--projects sharingu,…] [--dry-run] [--log <file.jsonl>]
//
// The items: tools/ship/after-import/<project>/*.items.json, in name order; each file is ONE batch
// {project, clientRef, note?, items: [ … ]} (at most the door's 200 items and 256 KB of bodies a call). Each batch goes
// through the door as any client's: `preview {project, clientRef, items}`, then `file {previewId, items}` with the SAME
// items, `only: "ready"` so what the door says needs more is reported and left, never reworded. The batch clientRef and
// every contribution's own clientRef are stable, so a second run is a replay: the receipts say duplicate / replayed /
// unchanged and nothing new is written.
// The key: AFTER_IMPORT_KEY in the env, else the *_AGENT_R_OWNER_KEY line of --creds (never printed, never an argument).
// --dry-run previews only. Exit 0 when every batch filed (or replayed) every item it previewed as ready; 1 on a refused
// call; 2 on a usage error.
import { readFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const URL0 = (argv[0] && !argv[0].startsWith("--") ? argv[0] : "").replace(/\/+$/, "");
if (!URL0) { console.error("usage: node tools/ship/after-import.mjs <url> --creds <credentials.env> [--projects a,b] [--dry-run] [--log <file>]"); process.exit(2); }
const KEY = process.env.AFTER_IMPORT_KEY || (() => {
  const c = flag("--creds");
  if (!c || !existsSync(c)) return null;
  return ((readFileSync(c, "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1] || "").replace(/^['"]|['"]$/g, "") || null;
})();
if (!KEY) { console.error("after-import: no key (AFTER_IMPORT_KEY, or an *_AGENT_R_OWNER_KEY line in --creds)"); process.exit(2); }
const DRY = argv.includes("--dry-run");
const LOG = flag("--log");
const ROOT = join(HERE, "after-import");
const projects = (flag("--projects") || (existsSync(ROOT) ? readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d)) && !d.startsWith(".")).join(",") : "")).split(",").filter(Boolean);

let rid = 0;
async function tool(name, args) {
  const r = await fetch(URL0 + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method: "tools/call", params: { name, arguments: args } }) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { ok: false, status: r.status, data: t.slice(0, 300) }; }
  if (j.error) return { ok: false, status: r.status, data: j.error };
  const c = j.result && j.result.content && j.result.content[0] && j.result.content[0].text;
  let d; try { d = JSON.parse(c); } catch { d = c; }
  return { ok: !j.result.isError, status: r.status, data: d };
}
const note = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n"); };
const tally = (rows, f) => (rows || []).reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

let rc = 0;
const total = { batches: 0, items: 0 };
for (const p of projects) {
  const dir = join(ROOT, p);
  if (!existsSync(dir)) { console.log(`– ${p}: no after-import folder`); continue; }
  const files = readdirSync(dir).filter((f) => f.endsWith(".items.json")).sort();
  console.log(`· ${p}: ${files.length} batch file(s)`);
  for (const f of files) {
    const b = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const project = b.project || p, clientRef = b.clientRef, items = b.items || [];
    if (!clientRef || !items.length) { console.log(`  ✗ ${f}: no clientRef or no items`); rc = 1; continue; }
    total.batches++; total.items += items.length;
    const pv = await tool("preview", { project, clientRef, items });
    if (!pv.ok || !pv.data || !pv.data.previewId) {
      console.log(`  ✗ ${f}: preview refused (${pv.status}) ${JSON.stringify(pv.data).slice(0, 300)}`); note({ file: f, step: "preview", status: pv.status, answer: pv.data }); rc = 1; continue;
    }
    const verdicts = tally(pv.data.items, (x) => x.verdict);
    note({ file: f, step: "preview", previewId: pv.data.previewId, counts: verdicts, ready: pv.data.ready });
    if (DRY) { console.log(`  ${basename(f)}: preview ${pv.data.previewId} ${JSON.stringify(verdicts)} (dry run: not filed)`); continue; }
    const fl = await tool("file", { previewId: pv.data.previewId, items, only: "ready" });
    if (!fl.ok || !fl.data) { console.log(`  ✗ ${f}: file refused (${fl.status}) ${JSON.stringify(fl.data).slice(0, 300)}`); note({ file: f, step: "file", status: fl.status, answer: fl.data }); rc = 1; continue; }
    // the receipt: results[] {i, status: filed | duplicate | replayed | unchanged | …, id}; counts {filed, unchanged, left, notFiled}
    const got = Array.isArray(fl.data.results) ? tally(fl.data.results, (x) => x.status || "?") : tally(fl.data.items, (x) => (x.filed && x.filed.status) || x.verdict || "?");
    note({ file: f, step: "file", previewId: pv.data.previewId, counts: got, complete: fl.data.complete, receipt: fl.data });
    console.log(`  ${basename(f)}: preview ${JSON.stringify(verdicts)} → file ${JSON.stringify(got)}${fl.data.complete === false ? " (some left: see the receipt)" : ""}`);
  }
}
console.log(`after-import: ${total.batches} batch(es), ${total.items} item(s)${DRY ? " previewed" : ""}`);
process.exit(rc);
