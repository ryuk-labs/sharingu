// tools/annotations-selftest.mjs — D5: every MCP tool carries a title and the four MCP annotations (2025-06-18 ToolAnnotations:
// readOnlyHint, destructiveHint, idempotentHint, openWorldHint), and they are TRUE. Offline: the real worker (src/index.js)
// over node:sqlite (tools/fixtures/sqlite-worker.mjs).
//   1. two derivations agree: contracts/door.json (tools/make-door-contract.py, from the registry rows it parses) and the
//      worker's own tools/list (src/mcp.js annotationsOf on the live rows) carry the same title and annotations per tool;
//   2. the rule holds on every tool: readOnlyHint <=> the row neither writes nor stores (door.json `write` false and the tool
//      not in the stores list the contract derives); a read-only tool is idempotent and never destructive;
//   3. a read-only tool writes NO row: each is called as the owner on a seeded project and the database's change count must
//      not move (the claim a client trusts when it calls without asking);
//   4. the words: a title of at most 4 words, a description of at most 3 sentences, no old name of tools/names.json.
// Exit 1 on any failure. Run: node tools/annotations-selftest.mjs
import { readFileSync } from "node:fs";
import { sqliteWorker } from "./fixtures/sqlite-worker.mjs";

const door = JSON.parse(readFileSync(new URL("../../contracts/door.json", import.meta.url), "utf8"));
const NAMES = JSON.parse(readFileSync(new URL("./names.json", import.meta.url), "utf8"));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("FAIL  " + msg); } };

const w = await sqliteWorker({ projects: ["alpha"], people: [["p-o", "Owen", "owner", "owner-key", ["alpha"]]] });
const rpc = async (method, params = {}) => {
  const r = await w.fetch(new Request(w.origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer owner-key" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
  return JSON.parse(await r.text());
};
const listed = (await rpc("tools/list")).result.tools;
const byName = new Map(listed.map((t) => [t.name, t]));
const KEYS = ["title", "readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];

// 1 + 2: the two derivations, and the rule
ok(door.tools.length === listed.length, `door.json names ${door.tools.length} tools, the owner's tools/list ${listed.length}`);
const inv = new Map(((door.inventory || {}).tools || []).map((t) => [t.name, t]));
for (const d of door.tools) {
  const t = byName.get(d.name);
  ok(!!t, `${d.name}: in door.json, not in tools/list`);
  if (!t) continue;
  const a = t.annotations || {}, b = d.annotations || {};
  ok(typeof t.title === "string" && t.title.trim() && t.title === d.title && a.title === t.title, `${d.name}: title "${t.title}" (door.json "${d.title}", annotations "${a.title}")`);
  for (const k of KEYS.slice(1)) ok(typeof a[k] === "boolean" && a[k] === b[k], `${d.name}: ${k} tools/list ${a[k]} vs door.json ${b[k]}`);
  if (d.write) ok(a.readOnlyHint === false, `${d.name}: writes, yet readOnlyHint is true`);
  if (a.readOnlyHint) ok(!d.write && a.destructiveHint === false && a.idempotentHint === true, `${d.name}: read-only but write ${d.write}, destructive ${a.destructiveHint}, idempotent ${a.idempotentHint}`);
  const i = inv.get(d.name);
  ok(i && i.kind === (a.readOnlyHint ? "read" : "write"), `${d.name}: the inventory says ${i && i.kind}, the annotations ${a.readOnlyHint ? "read" : "write"}`);
  // 4: the words
  ok(t.title.split(/\s+/).length <= 4, `${d.name}: title "${t.title}" is over 4 words`);
  const sentences = String(t.description || "").replace(/`[^`]*`/g, "x").replace(/\b(e\.g|i\.e|etc)\./g, "x").split(/[.!?](?:\s+|$)/).filter((x) => x.trim()).length;
  ok(sentences <= 3, `${d.name}: description has ${sentences} sentences`);
}
const OLD = new Set(NAMES.tools.filter((t) => t.old !== t.new).map((t) => t.old));
ok(!listed.some((t) => OLD.has(t.name)), `an old name is still listed: ${listed.filter((t) => OLD.has(t.name)).map((t) => t.name).join(", ")}`);
const words = new RegExp(`\\b(${[...OLD].filter((n) => n.includes("_")).join("|")})\\b`);
for (const t of listed) ok(!words.test(t.description || "") && !words.test(JSON.stringify(t.inputSchema || {})), `${t.name}: its description or schema names an old tool (${(words.exec((t.description || "") + JSON.stringify(t.inputSchema || {})) || [])[0]})`);

// 3: a read-only tool writes no row. The project holds a goal, a question, a screen and a check, filed through the door.
const items = [{ kind: "goal", op: "upsert", data: { id: "g1", title: "G one" } },
  { kind: "question", op: "upsert", data: { qid: "Q-a1", question: "Which?", options: [{ what: "A" }, { what: "B" }], whoOwes: "owner" } },
  { kind: "node", op: "upsert", data: { id: "screen:home", type: "screen", name: "Home", status: "live", data: { surface: "app" } } },
  { kind: "check", op: "upsert", data: { id: "AC.a.01", title: "Home loads", refs: ["screen:home"] } }];
const pv = await w.mcp("preview", { project: "alpha", items }, "owner-key");
const fl = await w.mcp("file", { previewId: pv.out.previewId, items }, "owner-key");
ok(!fl.isError && fl.out.complete, `seed: ${JSON.stringify(fl.out).slice(0, 200)}`);
const ARGS = { read: { ref: "goal/g1" }, search: { q: "home" }, map: { ref: "screen:home" }, brief: { for: "screen:home" }, impact: { refs: ["screen:home"] },
  formats: { kind: "goal" }, read_file: {}, versions: {}, changes: {}, decisions: {}, goals: { ref: "g1" } };
// the rows the call changed OUTSIDE org_usage (8.2f, main's ruling: every call counts in its org's counter row; the pin never widens)
const changes = w.changes;
let readOnly = 0;
for (const t of listed.filter((x) => x.annotations.readOnlyHint)) {
  readOnly++;
  const before = changes();
  const r = await w.mcp(t.name, { project: "alpha", ...(ARGS[t.name] || {}) }, "owner-key");
  const moved = changes() - before;
  ok(moved === 0, `${t.name}: annotated read-only, yet the call changed ${moved} row(s) (${JSON.stringify(r.out).slice(0, 120)})`);
}
ok(readOnly >= 15, `only ${readOnly} read-only tools were called`);

console.log(`${fail ? "✗" : "✓"} annotations: ${pass} pass, ${fail} fail (${listed.length} tools, ${readOnly} read-only called, each wrote 0 rows)`);
process.exit(fail ? 1 : 0);
