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

// 5 (sprint 17, 17.1): the open world is exactly the tools that reach outside the org: wrap_up's GitHub issue, save_file's
// public link (anyone on the web)
const openWorld = listed.filter((t) => t.annotations.openWorldHint).map((t) => t.name).sort();
ok(JSON.stringify(openWorld) === JSON.stringify(["save_file", "wrap_up"]), `the open-world tools are save_file and wrap_up, not ${openWorld.join(", ")}`);

// 6 (17.1): preview's and file's item is the schema src/formats.js generates from the door's registries, and it is TRUE: a valid
// item of each of the four forms passes the schema and the door (previewed ready, then filed); a shape outside the four is
// refused by both. Validated with ajv in strict mode (the MCP SDK's own validator): an unknown keyword is a failure too.
const { ITEM_SCHEMA } = await import("../src/formats.js");
const { KNOWLEDGE_KINDS, KNOWLEDGE_OPS } = await import("../src/knowledge/schema.js");
const { SHAPE_KEYS } = await import("../src/shapes.js");
const { GRADE_VERDICTS } = await import("../src/knowledge/checks.js");
const { TX_LANES } = await import("../src/util.js");
const { default: Ajv } = await import("ajv");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const n of ["preview", "file"]) {
  const s = byName.get(n).inputSchema.properties.items;
  ok(s.type === "array" && same(s.items, ITEM_SCHEMA), `${n}: items.items is ITEM_SCHEMA (${JSON.stringify(s.items).slice(0, 80)})`);
}
const [kS, cS, gS, aS] = ITEM_SCHEMA.anyOf || [];
ok(!ITEM_SCHEMA.oneOf && (ITEM_SCHEMA.anyOf || []).length === 4 && same(ITEM_SCHEMA.anyOf.map((b) => b.required[0]), ["kind", "contribution", "grade", "answer"]) && JSON.stringify(ITEM_SCHEMA).indexOf("additionalProperties") < 0,
  "the item is anyOf four forms, each requiring its own key, none closed (never stricter than the door)");
ok(same(kS.properties.kind.enum, KNOWLEDGE_KINDS) && same(kS.properties.op.enum, KNOWLEDGE_OPS), "the knowledge form's kind and op are the registry's (KINDS, KNOWLEDGE_OPS)");
ok(same(cS.properties.contribution.properties.lane.enum, SHAPE_KEYS) && same(SHAPE_KEYS, TX_LANES) && same(cS.properties.contribution.required, ["lane", "what", "why"]), "the contribution's lane is the shapes' (SHAPES = TX_LANES), lane, what and why required");
ok(same(gS.properties.grade.properties.verdict.enum, GRADE_VERDICTS) && same(gS.properties.grade.required, ["checkId", "verdict"]) && same(aS.properties.answer.required, ["qid", "option"]), "the grade's verdict is GRADE_VERDICTS; grade and answer require what the door does");
let valid = () => false;
try { valid = new Ajv({ strict: true, allErrors: true }).compile(ITEM_SCHEMA); ok(true, "ajv compiles ITEM_SCHEMA in strict mode"); }
catch (e) { ok(false, `ajv refuses ITEM_SCHEMA in strict mode: ${e.message}`); }
const verdictOf = async (it) => { const r = await w.mcp("preview", { project: "alpha", items: [it] }, "owner-key"); return r.out && r.out.items ? r.out.items[0].verdict : `error ${JSON.stringify(r.out).slice(0, 120)}`; };
const READY = ["files", "waits_for_owner"];
const GOOD = [{ kind: "goal", op: "upsert", data: { id: "g2", parent: "g1", title: "G two" } },
  { contribution: { lane: "leader", kind: "note", what: "We price per project", why: "A project is what teams buy." } },
  { grade: { checkId: "AC.a.01", verdict: "proven", proof: "npm test -> exit 0, 12 passing" } },
  { answer: { qid: "Q-a1", option: 0 } }];
GOOD.push({ contribution: { lane: "leader", kind: "note", what: "An extra key rides beside", why: "The door takes it." }, note: "an extra key" });
for (const it of GOOD) {
  const v = await verdictOf(it);
  ok(valid(it) && READY.includes(v), `a valid ${Object.keys(it)[0]} item: the schema ${valid(it) ? "takes it" : `refuses it ${JSON.stringify(valid.errors)}`}, the door previews it ${v}`);
}
const pg = await w.mcp("preview", { project: "alpha", items: GOOD }, "owner-key");
const fg = pg.out && pg.out.previewId ? await w.mcp("file", { previewId: pg.out.previewId, items: GOOD }, "owner-key") : { out: pg.out };
ok(fg.out && fg.out.complete, `the four forms together file through the door: ${JSON.stringify(fg.out).slice(0, 200)}`);
// two forms in one item: under anyOf the schema takes it (two branches match), the DOOR refuses it (formOf: exactly one form)
for (const [what, it] of Object.entries({ "two forms in one item": { contribution: GOOD[1].contribution, grade: GOOD[2].grade }, "a knowledge item with a contribution": { ...GOOD[0], contribution: GOOD[1].contribution } })) {
  const v = await verdictOf(it);
  ok(valid(it) && v === "needs", `${what}: the schema ${valid(it) ? "takes it (anyOf)" : "refuses it"}, the door previews it ${v} (its form)`);
}
const BAD = { "no form": { note: "x" }, "an empty item": {}, "an unknown kind": { kind: "widget", op: "upsert", data: { id: "w1" } }, "an unknown op": { kind: "goal", op: "delete", data: { id: "g2" } },
  "a knowledge item without data": { kind: "goal", op: "upsert" }, "an unknown lane": { contribution: { lane: "poetry", what: "x", why: "y" } },
  "a contribution without why": { contribution: { lane: "leader", what: "x" } }, "an unknown verdict": { grade: { checkId: "AC.a.01", verdict: "maybe" } },
  "a grade without checkId": { grade: { verdict: "proven", proof: "x" } }, "an answer without option": { answer: { qid: "Q-a1" } } };
for (const [what, it] of Object.entries(BAD)) {
  const v = await verdictOf(it);
  ok(!valid(it) && !READY.includes(v), `${what}: the schema ${valid(it) ? "TAKES it" : "refuses it"}, the door previews it ${v}`);
}

console.log(`${fail ? "✗" : "✓"} annotations: ${pass} pass, ${fail} fail (${listed.length} tools, ${readOnly} read-only called, each wrote 0 rows)`);
process.exit(fail ? 1 : 0);
