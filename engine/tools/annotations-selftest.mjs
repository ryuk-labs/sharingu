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
  { kind: "check", op: "upsert", data: { id: "AC.a.01", title: "Home loads", refs: ["screen:home"] } },
  { kind: "goal", op: "upsert", data: { id: "g9", parent: "g1", title: "G nine, to be removed" } }];
const pv = await w.mcp("preview", { project: "alpha", items }, "owner-key");
const fl = await w.mcp("save_knowledge", { previewId: pv.out.previewId, items }, "owner-key");
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

// 6 (17.1; split in sprint 19, the owner's ruling "by what the write does"): preview's item is the anyOf of the three forms and
// each write tool's item is EXACTLY its form, both generated by src/formats.js from the door's registries, and they are TRUE: a
// valid item of each form passes its schemas and the door; a shape outside them is refused by both. Validated with ajv in strict
// mode (the MCP SDK's own validator): an unknown keyword is a failure too.
const F = await import("../src/formats.js");
const { PREVIEW_ITEM_SCHEMA, ITEM_SCHEMA_OF, WRITE_TOOLS } = F;
const { KNOWLEDGE_KINDS, KNOWLEDGE_OPS } = await import("../src/knowledge/schema.js");
const { SHAPE_KEYS } = await import("../src/shapes.js");
const { TX_LANES } = await import("../src/util.js");
const { default: Ajv } = await import("ajv");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TOOLS3 = ["file_contribution", "save_knowledge", "remove_knowledge"];
ok(same(Object.values(WRITE_TOOLS), TOOLS3) && same(Object.keys(WRITE_TOOLS), ["contribution", ...KNOWLEDGE_OPS]), `the write tools are one per operation: ${JSON.stringify(WRITE_TOOLS)}`);
ok(!byName.has("file"), "`file` is gone from tools/list");
const ps = byName.get("preview").inputSchema;
ok(same(ps.properties.items.items, PREVIEW_ITEM_SCHEMA) && !("fileOnConfirm" in ps.properties), "preview: its items are PREVIEW_ITEM_SCHEMA, and it takes no fileOnConfirm (it never files)");
for (const n of TOOLS3) {
  const sc = byName.get(n) && byName.get(n).inputSchema;
  ok(sc && same(sc.required, ["previewId", "items"]) && sc.properties.items.type === "array" && same(sc.properties.items.items, ITEM_SCHEMA_OF[n]) && sc.properties.fileOnConfirm && sc.properties.fileOnConfirm.type === "boolean" && same(sc.properties.only.enum, ["ready"]),
    `${n}: {previewId, items, only?, fileOnConfirm?}, its items exactly its form (${JSON.stringify(sc && sc.properties.items.items).slice(0, 80)})`);
}
// the annotations the owner ruled: preview stores (never read-only) and destroys nothing; file_contribution only adds; the two
// knowledge tools can change or remove what is held; each write tool's retry files nothing twice
const ann = (n) => (byName.get(n) || {}).annotations || {};
ok(ann("preview").readOnlyHint === false && ann("preview").destructiveHint === false && ann("preview").idempotentHint === false && ann("preview").openWorldHint === false, `preview: readOnly false, destructive false, idempotent false, openWorld false (${JSON.stringify(ann("preview"))})`);
ok(ann("file_contribution").readOnlyHint === false && ann("file_contribution").destructiveHint === false && ann("file_contribution").idempotentHint === true && ann("file_contribution").openWorldHint === false, `file_contribution: destructive false, idempotent true (${JSON.stringify(ann("file_contribution"))})`);
for (const n of ["save_knowledge", "remove_knowledge"]) ok(ann(n).readOnlyHint === false && ann(n).destructiveHint === true && ann(n).idempotentHint === true && ann(n).openWorldHint === false, `${n}: destructive true, idempotent true (${JSON.stringify(ann(n))})`);
const [cS, uS, rS] = PREVIEW_ITEM_SCHEMA.anyOf || [];
ok(!PREVIEW_ITEM_SCHEMA.oneOf && (PREVIEW_ITEM_SCHEMA.anyOf || []).length === 3 && same(cS.required, ["contribution"]) && same(uS.required, ["kind", "op", "data"]) && same(rS.required, ["kind", "op", "data"]) && JSON.stringify(PREVIEW_ITEM_SCHEMA).indexOf("additionalProperties") < 0,
  "the preview's item is anyOf three forms, each requiring its own keys, none closed (never stricter than the door)");
ok(same(uS.properties.kind.enum, KNOWLEDGE_KINDS) && uS.properties.op.const === "upsert" && same(rS.properties.kind.enum, KNOWLEDGE_KINDS) && rS.properties.op.const === "remove", "the knowledge forms' kinds are the registry's (KINDS); op is const upsert, const remove");
ok(same(cS.properties.contribution.properties.lane.enum, SHAPE_KEYS) && same(SHAPE_KEYS, TX_LANES) && same(cS.properties.contribution.required, ["lane", "what", "why"]), "the contribution's lane is the shapes' (SHAPES = TX_LANES), lane, what and why required");
const ajv = new Ajv({ strict: true, allErrors: true });
const V = {};
for (const [n, sc] of [["preview", PREVIEW_ITEM_SCHEMA], ...TOOLS3.map((t) => [t, ITEM_SCHEMA_OF[t]])]) {
  try { V[n] = ajv.compile(sc); ok(true, `ajv compiles ${n}'s item in strict mode`); } catch (e) { V[n] = () => false; ok(false, `ajv refuses ${n}'s item in strict mode: ${e.message}`); }
}
const verdictOf = async (it) => { const r = await w.mcp("preview", { project: "alpha", items: [it] }, "owner-key"); return r.out && r.out.items ? r.out.items[0].verdict : `error ${JSON.stringify(r.out).slice(0, 120)}`; };
const READY = ["files", "waits_for_owner"];
const UP = { kind: "goal", op: "upsert", data: { id: "g2", parent: "g1", title: "G two" } };
const CO = { contribution: { lane: "leader", kind: "note", what: "We price per project", why: "A project is what teams buy." } };
const RM = { kind: "goal", op: "remove", data: { id: "g9" } };
const GOOD = [[UP, "save_knowledge"], [CO, "file_contribution"], [RM, "remove_knowledge"],
  [{ contribution: { lane: "leader", kind: "note", what: "An extra key rides beside", why: "The door takes it." }, note: "an extra key" }, "file_contribution"]];
for (const [it, tool] of GOOD) {
  const v = await verdictOf(it);
  const others = TOOLS3.filter((t) => t !== tool).filter((t) => V[t](it));
  ok(V.preview(it) && V[tool](it) && !others.length && READY.includes(v), `a valid ${tool} item: preview's schema ${V.preview(it) ? "takes it" : "refuses it"}, ${tool}'s ${V[tool](it) ? "takes it" : `refuses it ${JSON.stringify(V[tool].errors)}`}, no other tool's (${others.join(", ") || "none"}), the door previews it ${v}`);
}
// two forms in one item: under anyOf the schema takes it (two branches match), the DOOR refuses it (formOf: exactly one form)
for (const [what, it] of Object.entries({ "a knowledge item with a contribution": { ...UP, contribution: CO.contribution } })) {
  const v = await verdictOf(it);
  ok(V.preview(it) && v === "needs", `${what}: the schema ${V.preview(it) ? "takes it (anyOf)" : "refuses it"}, the door previews it ${v} (its form)`);
}
const BAD = { "no form": { note: "x" }, "an empty item": {}, "an unknown kind": { kind: "widget", op: "upsert", data: { id: "w1" } }, "an unknown op": { kind: "goal", op: "delete", data: { id: "g2" } },
  "a knowledge item without data": { kind: "goal", op: "upsert" }, "an unknown lane": { contribution: { lane: "poetry", what: "x", why: "y" } },
  "a contribution without why": { contribution: { lane: "leader", what: "x" } } };
for (const [what, it] of Object.entries(BAD)) {
  const v = await verdictOf(it);
  ok(!V.preview(it) && !READY.includes(v), `${what}: the schema ${V.preview(it) ? "TAKES it" : "refuses it"}, the door previews it ${v}`);
}
// a grade or an answer in a preview: refused per item, pointing at its own tool (both file at once)
const GA = await w.mcp("preview", { project: "alpha", items: [{ grade: { checkId: "AC.a.01", verdict: "proven", proof: "npm test -> exit 0, 12 passing" } }, { answer: { qid: "Q-a1", option: 0 } }, CO] }, "owner-key");
const [g0, a1, c2] = (GA.out && GA.out.items) || [];
ok(!V.preview({ grade: { checkId: "x", verdict: "proven" } }) && g0 && g0.verdict === "refused" && g0.refusal.error === "wrong_tool" && g0.refusal.tool === "submit_grade" && /submit_grade/.test(g0.reasons[0]) && !g0.filesWith
  && a1 && a1.verdict === "refused" && a1.refusal.tool === "respond" && /respond/.test(a1.reasons[0]) && c2 && READY.includes(c2.verdict) && c2.filesWith === "file_contribution",
  `a grade and an answer in a preview: refused wrong_tool, pointing at submit_grade and respond; the contribution beside them files (${JSON.stringify([g0, a1].map((x) => x && x.refusal)).slice(0, 160)})`);
const ga = GA.out && GA.out.previewId ? await w.mcp("file_contribution", { previewId: GA.out.previewId, items: [CO] }, "owner-key") : { out: {} };
ok(!ga.isError && ga.out.complete === true && ga.out.counts.filed === 1, `its contribution files with file_contribution, the refused grade and answer belonging to no part (${JSON.stringify(ga.out).slice(0, 160)})`);

// 7 (sprint 19): a mixed preview is filed by the three tools, each its own part, once
const MIX = [UP, CO, RM];
const pm = await w.mcp("preview", { project: "alpha", items: MIX }, "owner-key");
const pid = pm.out && pm.out.previewId;
ok(pid && same((pm.out.items || []).map((x) => x.filesWith), ["save_knowledge", "file_contribution", "remove_knowledge"]) && same((pm.out.parts || []).map((x) => [x.tool, x.items]), [["file_contribution", [2]], ["save_knowledge", [1]], ["remove_knowledge", [3]]]),
  `the preview names each item's write tool and the parts (${JSON.stringify(pm.out && pm.out.parts)})`);
ok(TOOLS3.every((t) => (pm.out.text || "").includes(t)) && /file_contribution \{previewId, items\} files item 2; save_knowledge \{previewId, items\} files item 1; remove_knowledge \{previewId, items\} files item 3/.test(pm.out.next || ""), `its text and next name each tool with its items (${pm.out.next})`);
const wrong = await w.mcp("file_contribution", { previewId: pid, items: [UP] }, "owner-key");
ok(wrong.isError && wrong.out.error === "wrong_tool" && wrong.out.items[0].filesWith === "save_knowledge" && /save_knowledge/.test(wrong.out.note), `a knowledge upsert sent to file_contribution: wrong_tool, naming save_knowledge (${wrong.out.note})`);
const mixed = await w.mcp("save_knowledge", { previewId: pid, items: [UP, RM] }, "owner-key");
ok(mixed.isError && mixed.out.error === "wrong_tool" && mixed.out.items.length === 1 && mixed.out.items[0].n === 2 && mixed.out.items[0].filesWith === "remove_knowledge", `a remove among save_knowledge's items: wrong_tool naming remove_knowledge, item 2 (${JSON.stringify(mixed.out.items)})`);
const changed = await w.mcp("file_contribution", { previewId: pid, items: [{ contribution: { ...CO.contribution, what: "We price per seat" } }] }, "owner-key");
ok(changed.isError && changed.out.error === "preview_changed" && same(changed.out.items, [2]), `a changed contribution: preview_changed, naming the preview's item 2 (${changed.out.note})`);
const before3 = w.changes();
const fc = await w.mcp("file_contribution", { previewId: pid, items: [CO] }, "owner-key");
ok(!fc.isError && fc.out.tool === "file_contribution" && fc.out.complete && fc.out.items.length === 1 && /^T-\d{8}-\d+$/.test(fc.out.items[0].filed.id) && same(fc.out.rest, [{ tool: "save_knowledge", items: [1] }, { tool: "remove_knowledge", items: [3] }]),
  `file_contribution files its part alone, its receipt names the rest (${JSON.stringify(fc.out.rest)})`);
const again = await w.mcp("file_contribution", { previewId: pid, items: [CO] }, "owner-key");
ok(again.isError && again.out.error === "preview_filed" && again.out.receipt && again.out.receipt.items[0].filed.id === fc.out.items[0].filed.id, `a repeat of the filed part answers its first receipt (${again.out.error}, ${again.out.receipt && again.out.receipt.items[0].filed.id})`);
const sk = await w.mcp("save_knowledge", { previewId: pid, items: [UP] }, "owner-key");
const rk = await w.mcp("remove_knowledge", { previewId: pid, items: [RM] }, "owner-key");
const goalsNow = await w.mcp("read", { project: "alpha", kind: "goal" }, "owner-key");
const ids = ((goalsNow.out && goalsNow.out.items) || []).map((x) => x.id).sort();
ok(!sk.isError && sk.out.complete && !rk.isError && rk.out.complete && ids.includes("g2") && !ids.includes("g9") && same(rk.out.rest, []), `save_knowledge and remove_knowledge each file theirs: g2 is held, g9 is gone (${ids.join(", ")})`);
const view = await w.fetch(new Request(`${w.origin}/preview/${pid}`, { headers: { authorization: "Bearer owner-key", accept: "application/json" } }));
const vj = await view.json().catch(() => ({}));
ok(vj.state === "filed" && (vj.parts || []).every((x) => x.filed) && (vj.parts || []).length === 3, `once every part is filed the preview is filed (${vj.state}, ${JSON.stringify(vj.parts)})`);
const none = await w.mcp("remove_knowledge", { previewId: GA.out.previewId, items: [RM] }, "owner-key");
ok(none.isError && none.out.error === "nothing_to_file" && same(none.out.parts, [{ tool: "file_contribution", items: [3] }]), `a preview with no removes: nothing_to_file, naming its parts (${none.out.note})`);
ok(w.changes() > before3, "the three parts wrote rows");

// 8 (sprint 19): fileOnConfirm moved to the write tools. A client that declared no elicitation: the person was not asked, and
// nothing was filed; the plain call files
const pc = await w.mcp("preview", { project: "alpha", items: [{ contribution: { lane: "leader", kind: "note", what: "Asked first", why: "The person confirms." } }] }, "owner-key");
const pcItems = [{ contribution: { lane: "leader", kind: "note", what: "Asked first", why: "The person confirms." } }];
const before4 = w.changes();
const na = await w.mcp("file_contribution", { previewId: pc.out.previewId, items: pcItems, fileOnConfirm: true }, "owner-key");
ok(!na.isError && na.out.filed === false && na.out.confirm && na.out.confirm.asked === false && /not asked/.test(na.out.confirm.note) && /nothing was filed/.test(na.out.confirm.note) && w.changes() === before4 && /Preview, nothing filed yet/.test(na.out.text || ""),
  `no elicitation: not asked, nothing filed, the part's text answered (${na.out.confirm && na.out.confirm.note})`);
// the handshake revision: a client that declared elicitation gets the elicitation on a stream; its yes files, its no files nothing
const init = await w.fetch(new Request(w.origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer owner-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { elicitation: {} }, clientInfo: { name: "selftest", version: "1" } } }) }));
const sid = init.headers.get("mcp-session-id");
ok(/^sg1e\./.test(sid || ""), `an elicitation client's session: ${sid}`);
const streamCall = async (name, args) => {
  const r = await w.fetch(new Request(w.origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer owner-key", "mcp-session-id": sid },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } }) }));
  return { r, reader: r.body && r.body.getReader() };
};
const dec = new TextDecoder();
const nextMessage = async (reader, buf) => { for (;;) { const at = buf.s.indexOf("\n\n"); if (at >= 0) { const ev = buf.s.slice(0, at); buf.s = buf.s.slice(at + 2); const d = /^data: (.*)$/m.exec(ev); if (d) return JSON.parse(d[1]); continue; } const { value, done } = await reader.read(); if (done) return null; buf.s += dec.decode(value); } };
const answer = (id, result) => w.fetch(new Request(w.origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer owner-key", "mcp-session-id": sid }, body: JSON.stringify({ jsonrpc: "2.0", id, result }) }));
for (const [word, result, files] of [["yes", { action: "accept", content: { file: true } }, true], ["no", { action: "decline" }, false]]) {
  const its = [{ contribution: { lane: "leader", kind: "note", what: `Confirmed ${word}`, why: "The person answers." } }];
  const p1 = await w.mcp("preview", { project: "alpha", items: its }, "owner-key");
  const { r, reader } = await streamCall("file_contribution", { previewId: p1.out.previewId, items: its, fileOnConfirm: true });
  const buf = { s: "" };
  const el = /event-stream/.test(r.headers.get("content-type") || "") ? await nextMessage(reader, buf) : null;
  ok(el && el.method === "elicitation/create" && /File 1 contribution into alpha/.test(el.params.requestedSchema.properties.file.description) && el.params.requestedSchema.properties.file.title === "File",
    `${word}: the stream asks first: elicitation/create, titled File, "${el && el.params.requestedSchema.properties.file.description}"`);
  const rec = el ? await answer(el.id, result) : { status: 0 };
  const res = el ? await nextMessage(reader, buf) : null;
  const out = res && res.result && JSON.parse(res.result.content[0].text);
  ok(rec.status === 202 && out && out.confirm && out.confirm.asked === true && (files ? out.complete === true && out.confirm.filed === true && /^T-/.test(out.items[0].filed.id) : out.filed === false && out.confirm.filed === false),
    `${word}: the answer is recorded (202) and the stream ${files ? "files on yes" : "files nothing on no"} (${JSON.stringify(out && out.confirm)})`);
}
// the stateless revision (MRTR): input_required, then the retry with the person's answer
const VER = "2026-07-28", FORMCAPS = { elicitation: { form: {} } };
const modern = async (name, args, extra = {}) => {
  const r = await w.fetch(new Request(w.origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer owner-key", "mcp-protocol-version": VER, "mcp-method": "tools/call", "mcp-name": name },
    body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args, ...extra, _meta: { "io.modelcontextprotocol/protocolVersion": VER, "io.modelcontextprotocol/clientCapabilities": FORMCAPS } } }) }));
  return { status: r.status, j: await r.json() };
};
for (const [word, ans, files] of [["yes", { action: "accept", content: { file: true } }, true], ["no", { action: "decline" }, false]]) {
  const its = [{ kind: "goal", op: "upsert", data: { id: `g-mrtr-${word}`, parent: "g1", title: `MRTR ${word}` } }];
  const p1 = await w.mcp("preview", { project: "alpha", items: its }, "owner-key");
  const a1 = await modern("save_knowledge", { previewId: p1.out.previewId, items: its, fileOnConfirm: true });
  const ir = a1.j.result || {};
  ok(ir.resultType === "input_required" && /^sg2\./.test(ir.requestState || "") && /Save 1 knowledge item in alpha/.test(JSON.stringify(ir.inputRequests || {})), `MRTR ${word}: save_knowledge {fileOnConfirm} answers input_required, "Save 1 knowledge item in alpha"`);
  const other = await modern("remove_knowledge", { previewId: p1.out.previewId, items: [{ kind: "goal", op: "remove", data: { id: "g2" } }], fileOnConfirm: true }, { requestState: ir.requestState, inputResponses: { file: ans } });
  ok(other.j.error && /confirm_not_open/.test(other.j.error.message), `MRTR ${word}: the state retried on another write tool records nothing (${other.j.error && other.j.error.message.slice(0, 60)})`);
  const a2 = await modern("save_knowledge", { previewId: p1.out.previewId, items: its, fileOnConfirm: true }, { requestState: ir.requestState, inputResponses: { file: ans } });
  const out = a2.j.result && JSON.parse(a2.j.result.content[0].text);
  const held = ((await w.mcp("read", { project: "alpha", ref: `goal/g-mrtr-${word}` }, "owner-key")).out || {}).item;
  ok(out && out.confirm && out.confirm.asked === true && (files ? out.complete === true && !!held : out.filed === false && !held), `MRTR ${word}: the retry ${files ? "saves on yes" : "saves nothing on no"} (${JSON.stringify(out && out.confirm)})`);
}

console.log(`${fail ? "✗" : "✓"} annotations: ${pass} pass, ${fail} fail (${listed.length} tools, ${readOnly} read-only called, each wrote 0 rows)`);
process.exit(fail ? 1 : 0);
