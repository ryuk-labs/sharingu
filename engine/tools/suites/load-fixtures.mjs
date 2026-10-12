// tools/suites/load-fixtures.mjs — the suites' fixtures, filed through the door the way any client files: for each
// fixture file (one per project, tools/suites/fixtures/<project>.json: {project, name, eval?, items}), `preview` the items
// as the org's owner, then `file` them with the preview's id and the SAME items. A fixture is never written to D1 or R2
// directly, never published, never read from a brain. tools/lib.sh suite_local_up runs it once on every fresh suite org.
//   node tools/suites/load-fixtures.mjs --url http://127.0.0.1:<port> --creds <org dir>/credentials.env [--dir <fixtures>]
// The owner key is read from the org's own credentials.env (the *_AGENT_R_OWNER_KEY line, as tools/smoke/lib.mjs reads it)
// and is never printed. Exit 0 when every item of every file filed (or was already on file), 1 otherwise, 2 on usage.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = String(arg("url", "")).replace(/\/+$/, "");
const CREDS = arg("creds", "");
const DIR = arg("dir", join(dirname(fileURLToPath(import.meta.url)), "fixtures"));
if (!BASE || !CREDS) { console.error("usage: node tools/suites/load-fixtures.mjs --url <worker url> --creds <credentials.env> [--dir <fixtures>]"); process.exit(2); }
const KEY = (readFileSync(CREDS, "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1];
if (!KEY) { console.error(`  ✗ fixtures: no *_AGENT_R_OWNER_KEY line in ${CREDS}`); process.exit(2); }
const BATCH = 200;   // preview takes 1 to 200 items a call

let rpc = 0;
async function tool(name, args) {
  const r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } }) });
  const text = await r.text();
  let res = null; try { res = JSON.parse(text).result; } catch { res = null; }
  if (!res) throw new Error(`${name}: HTTP ${r.status} ${text.slice(0, 200)}`);
  const t = res.content && res.content[0] && res.content[0].text;
  let out; try { out = JSON.parse(t); } catch { out = t; }
  return { out, isError: !!res.isError };
}
const brief = (v) => JSON.stringify(v).slice(0, 400);

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : [];
if (!files.length) { console.log(`  (fixtures: none under ${DIR})`); process.exit(0); }
let failed = 0;
for (const f of files) {
  const fx = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  const items = Array.isArray(fx.items) ? fx.items : [];
  if (!fx.project || !items.length) { console.log(`  ✗ fixtures: ${f} names no project or no items`); failed++; continue; }
  let filed = 0, unchanged = 0;
  try {
    for (let i = 0; i < items.length; i += BATCH) {
      const part = items.slice(i, i + BATCH);
      const pv = await tool("preview", { project: fx.project, items: part, ...(fx.eval ? { eval: true } : {}) });
      if (pv.isError || !pv.out || !pv.out.previewId) throw new Error(`preview refused: ${brief(pv.out)}`);
      const stuck = (pv.out.items || []).filter((it) => it.verdict === "needs" || it.verdict === "refused");
      if (stuck.length) throw new Error(`preview: ${stuck.length} item(s) not ready: ${brief(stuck.map((it) => ({ i: it.i, kind: it.kind, key: it.key, verdict: it.verdict, refusal: it.refusal, needs: it.needs, reasons: it.reasons })))}`);
      if (!pv.out.ready) { unchanged += part.length; continue; }   // every item already on file, unchanged: nothing to file
      const fl = await tool("file", { previewId: pv.out.previewId, items: part });
      if (fl.isError || !fl.out || fl.out.error) throw new Error(`file refused: ${brief(fl.out)}`);
      const res = fl.out.results || [];
      const bad = res.filter((x) => x.status !== "filed" && x.status !== "unchanged");
      if (bad.length) throw new Error(`file: ${bad.length} item(s) did not land: ${brief(bad)}`);
      filed += res.filter((x) => x.status === "filed").length;
      unchanged += res.filter((x) => x.status === "unchanged").length;
    }
    console.log(`  (fixtures: ${fx.project} — ${filed} item(s) filed through preview then file${unchanged ? `, ${unchanged} already on file` : ""}, from ${f})`);
  } catch (e) {
    console.log(`  ✗ fixtures: ${fx.project} (${f}): ${e.message}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
