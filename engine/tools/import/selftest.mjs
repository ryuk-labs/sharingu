#!/usr/bin/env node
// engine/tools/import/selftest.mjs — proves the importer on its own fixture (engine/tools/import/fixtures/p1,
// copied to a temp dir with its markers filled) and against the REAL door (the worker over SQLite). Run: node tools/import/selftest.mjs (exit 0 = green).
//   1. the fixture builds the expected ops, every batch passes the door's rules, and the brain is byte-identical after;
//   2. the validator REFUSES: two goal roots · an edge to a missing node · an open question with one option · a card of
//      an unfiled kind · 201 ops · an id with a space · a refused batch does not count as filed for the next one;
//   3. clientRef is stable (key order does not matter, content does); safeId/nodeId; the refs quirk expands;
//   4. the CLI with --url against the REAL door (src/index.js over SQLite, tools/fixtures/sqlite-worker.mjs, behind a proxy
//      that only counts and injects two faults): previews then files every batch with the key in the Authorization header
//      only, counts match on read-back (`read`), a re-run previews every batch as unchanged and files none, a refusal stops the run (exit 1)
//      with the door's error printed, no key → exit 2 — and the key never appears in any output;
//   5. one small fixture per new layout (bank · pack · board, written into the temp dir): detected, mapped as each reader
//      documents, every batch valid, the report prints, and the source is byte-identical after;
//   7. rows written (import/cost.mjs): the worker answers each call's D1 rows in Server-Timing; the CLI prints them per kind
//      and in total (the sum of the calls), keeps the measure of a local run, a re-run writes only its previews and keeps
//      it; the budget seam refuses (exit 3, nothing filed) with days and --only kinds; a measure that does not hold
//      (the source changed, no batch measured) refuses; --dry-run --estimate-from prints the estimate; the estimate adds the
//      ledger's rows for smaller batches; tools/cf-budget.sh's --json answer (a stub curl, no network) is read as the budget;
//   8. a project filed from its overlays alone (sprint 4, IMP): tools/lib-import-sources.sh lists a project's *.items.json and
//      *.ops.json together in name order, and an .ops.json overlay reads; the CLI with the source `-` files a project the
//      door does not hold yet: created with create_project under --name, every overlay filed, read back and measured; a
//      second run creates nothing and replays every batch; without --name an unknown project refuses and files nothing;
//   6. the screens' renders (import/renders.mjs, import/read-renders.mjs): a screen row standardized (state names, the
//      source's rows kept, a wireframe built), a board html read and its frames mapped to render ops (screen, state,
//      variant, style, size; a frame naming no screen skipped), a wireframe spec and atlas shots mapped; every op passes the
//      door's rules.
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planKnowledge, keyString } from "../../src/knowledge/schema.js";
import { readBrain, readSource, detectLayout } from "./read.mjs";
import { buildImport } from "./build.mjs";
import { toBatches, clientRefOf } from "./batch.mjs";
import { validateAll } from "./validate.mjs";
import { safeId, nodeId, ID_RE, sha256, op } from "./common.mjs";
import { refsOf } from "./checks.mjs";
import { pageOf, rowsOf, fileParts, partsOf, WRITE_TOOLS } from "./door.mjs";
import { estimate, budgetLeft, verdict, mergeCost, LEDGER_ROWS } from "./cost.mjs";
import { screenData, mapRenders, stateNamesOf, reprItems } from "./renders.mjs";
import { readBoardHtml, imageSize } from "./read-renders.mjs";
import { gzipSync } from "node:zlib";
import { applyOverlays, readOverlay } from "./overlay.mjs";
import { plainLine, ruledOn } from "./read-bank.mjs";
import { tidyOps, noMachinePath, plainText, noEmail, qidsOut } from "./tidy.mjs";
import { textHits, scanOps } from "../audit/text-rules.mjs";
import { headline, HEAD_MAX } from "./read-board.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, "..", "..");
const CLI = join(ENGINE, "tools", "import-brain.mjs");
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log("  FAIL " + m); } };

// ---- the fixture world -----------------------------------------------------------------------------------------------
function place(from, to, subs) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from)) {
    const s = join(from, e), d = join(to, e);
    if (statSync(s).isDirectory()) { place(s, d, subs); continue; }
    let t = readFileSync(s, "utf8");
    for (const [k, v] of Object.entries(subs)) t = t.split(k).join(v);
    writeFileSync(d, t);
  }
}
function snap(dir, pre = "") {
  const out = {};
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) Object.assign(out, snap(p, pre + e + "/"));
    else out[pre + e] = sha256(readFileSync(p));
  }
  return out;
}
const td = mkdtempSync(join(tmpdir(), "import-selftest-"));
const P1 = join(td, "p1");
place(join(ENGINE, "tools", "import", "fixtures", "p1"), P1, { "@MKU@": "ALPHA", "@MK@": "alpha", "@KEY@": "alpha" });

try {
  // ---- 1. the fixture ------------------------------------------------------------------------------------------------
  const before = snap(P1);
  const src = readBrain(P1);
  const b = buildImport(src);
  const count = (k) => b.ops.filter((o) => o.kind === k).length;
  const want = { aim: 1, gtm: 1, goal: 4, question: 2, node: 2, card_kind: 3, card: 5, doc: 1, check: 0, edge: 0 };
  for (const [k, n] of Object.entries(want)) ok(count(k) === n, `fixture: ${k} ops ${count(k)}, expected ${n}`);
  const gapNode = b.ops.find((o) => o.kind === "node" && o.data.type === "gap");
  ok(gapNode && gapNode.data.id === "gap:GAP-ALPHA" && gapNode.data.status === "open", "fixture: the gap files as node gap:GAP-ALPHA (open)");
  const dq = b.ops.find((o) => o.kind === "question" && o.data.qid === "QALPHAD");
  ok(dq && dq.data.choice === 1 && dq.data.decidedAt === "2026-01-05" && dq.data.options.length === 2, "fixture: the decided question keeps choice 1, its options, decidedAt from `updated`");
  const batches = toBatches(b.ops, "alpha");
  const errs = validateAll(batches);
  ok(errs.length === 0, `fixture: validation errors ${JSON.stringify(errs.slice(0, 3))}`);
  ok(batches.map((x) => x.kind).join(",") === "aim,gtm,goal,card_kind,question,node,card,doc", `fixture: batch order ${batches.map((x) => x.kind)}`);
  ok(JSON.stringify(snap(P1)) === JSON.stringify(before), "fixture: the brain changed while being read");

  // ---- 2. the validator refuses ----------------------------------------------------------------------------------------
  const B = (...ops) => ({ kind: ops[0].kind, ops });
  const refused = (batches, re, what) => { const e = validateAll(batches); ok(e.some((x) => re.test(x.error)), `${what}: expected ${re}, got ${JSON.stringify(e.slice(0, 2))}`); };
  const goal = (id, parent) => op("goal", { id, parent, title: id, dimensions: [] });
  const node = (id, type = "screen") => op("node", { id, type, name: id });
  refused([B(goal("a", null), goal("b", null))], /goal_roots/, "two roots");
  refused([B(goal("a", null), goal("b", "zz"))], /missing_parent/, "a parent that is no goal");
  refused([B(node("screen:x")), B(op("edge", { from: "screen:x", to: "screen:y", kind: "nav" }))], /missing_node/, "an edge to a missing node");
  refused([B(op("question", { qid: "Q1", question: "q?", status: "open", options: [{ what: "only" }] }))], /too_few_options/, "an open question with one option");
  refused([B(op("question", { qid: "Q2", question: "q?", status: "open", choice: "a", options: [{ what: "x" }, { what: "y" }] }))], /open_has_choice/, "an open question with a choice");
  refused([B(op("card", { kind: "note", id: "n1", name: "n", body: "b" }))], /not a card_kind/, "a card of an unfiled kind");
  refused([B(op("card_kind", { key: "note", label: "N", idPattern: "^n\\d$" })), B(op("card", { kind: "note", id: "x1", name: "n", body: "b" }))], /idPattern/, "a card id outside its kind's pattern");
  refused([{ kind: "node", ops: Array.from({ length: 201 }, (_, i) => node(`screen:s${i}`)) }], /too_many_ops/, "201 ops in one batch");
  refused([B(op("check", { id: "API.GET /x", title: "t" }))], /bad_id/, "a check id with a space");
  refused([B(node("screen:a", "nonsense")), B(op("edge", { from: "screen:a", to: "screen:a", kind: "nav" }))], /missing_node/, "a refused batch is not filed for the next");
  ok(validateAll([B(node("screen:a"), node("screen:b")), B(op("edge", { from: "screen:a", to: "screen:b", kind: "nav" }))]).length === 0, "nodes in an earlier batch satisfy a later edge");

  // ---- 3. the small rules --------------------------------------------------------------------------------------------
  const ops1 = [op("goal", { id: "a", parent: null, title: "A", dimensions: [] })];
  const ops2 = [op("goal", { title: "A", dimensions: [], parent: null, id: "a" })];
  ok(clientRefOf("p", ops1) === clientRefOf("p", ops2), "clientRef ignores key order");
  ok(clientRefOf("p", ops1) !== clientRefOf("q", ops1) && clientRefOf("p", ops1) !== clientRefOf("p", [op("goal", { ...ops1[0].data, title: "B" })]), "clientRef changes with the project or the content");
  ok(clientRefOf("p", ops1).length <= 60, "clientRef fits the door's 60 characters");
  ok(nodeId("door", "GET /x/:id") === "door:GET:/x/:id" && ID_RE.test(nodeId("door", "GET /x/:id")), "nodeId: a space becomes ':' and the id passes the door's rule");
  ok(safeId("relation:a.b->c") === "relation:a.b-_c", "safeId: any other refused character becomes '_'");
  ok(JSON.stringify(refsOf([{ type: "table", id: { read: ["t1", "t2"], write: ["t1"] } }, { type: "api", id: "GET /x" }, { type: "question", id: "Q1" }]))
    === JSON.stringify(["table:t1", "table:t2", "door:GET:/x", "Q1"]), "refsOf: the {read, write} quirk expands, api → door, a question stays its qid");
  ok(pageOf({ items: [1, 2], next: "c" }).n === 2 && pageOf({ items: [1, 2], next: "c" }).next === "c" && pageOf({ project: "p", kind: "aim", items: [], next: null }).n === 0, "pageOf reads {items, next}");

  // fileParts (the split door, sprint 19): each part with its tool and ITS items, in order; a refusal stops the rest; a part
  // already filed counts with its first receipt; skipUnready calls no part that would file nothing; the receipts merge by index
  {
    const its = [{ kind: "goal", op: "upsert", data: { id: "a" } }, { contribution: { lane: "leader", what: "w", why: "y" } }, { kind: "goal", op: "remove", data: { id: "b" } }, { kind: "goal", op: "upsert", data: { id: "c" } }];
    const pv = { previewId: "P-00000000000000aa", parts: [{ tool: "file_contribution", items: [2], ready: 1 }, { tool: "save_knowledge", items: [1, 4], ready: 2 }, { tool: "remove_knowledge", items: [3], ready: 0 }] };
    const rec = (tool, idx, status = "filed") => ({ previewId: pv.previewId, tool, complete: true, items: idx.map((i) => ({ i, filed: { status, id: `T-${i}` } })), results: idx.map((i) => ({ i, n: i + 1, status, id: `T-${i}` })) });
    const sent = [];
    const fake = (answers) => async (tool, args) => { sent.push([tool, args]); const a = answers[tool]; return { ok: !(a && a.error), out: a, rows: { read: 1, written: 2, stmts: 1, unknown: 0, calls: 1, uncounted: 0 } }; };
    const all = { file_contribution: rec("file_contribution", [1]), save_knowledge: rec("save_knowledge", [0, 3]), remove_knowledge: rec("remove_knowledge", [2], "unchanged") };
    let f = await fileParts(fake(all), pv, its);
    ok(f.ok && sent.map((x) => x[0]).join() === "file_contribution,save_knowledge,remove_knowledge" && JSON.stringify(sent[1][1]) === JSON.stringify({ previewId: pv.previewId, items: [its[0], its[3]] })
      && f.out.results.map((x) => x.i).join() === "0,1,2,3" && f.out.complete && f.out.counts.filed === 3 && f.out.counts.unchanged === 1 && f.out.id === "T-0" && f.rows.written === 6 && f.out.tools.length === 3,
      `fileParts: every part with its own items, in order, merged by index: ${JSON.stringify({ sent: sent.map((x) => x[0]), out: f.out.counts, rows: f.rows })}`);
    sent.length = 0;
    f = await fileParts(fake(all), pv, its, { skipUnready: true, only: "ready" });
    ok(f.ok && sent.map((x) => x[0]).join() === "file_contribution,save_knowledge" && sent.every((x) => x[1].only === "ready"), `fileParts: skipUnready calls no part with nothing ready; only is passed on (${sent.map((x) => x[0])})`);
    sent.length = 0;
    f = await fileParts(fake({ ...all, file_contribution: { error: "preview_filed", receipt: rec("file_contribution", [1]) }, save_knowledge: { error: "preview_changed", note: "x" } }), pv, its);
    ok(!f.ok && f.step === "save_knowledge" && f.out.error === "preview_changed" && sent.length === 2 && f.parts.length === 1 && f.parts[0].out.repeat === true,
      `fileParts: a part filed before counts with its receipt; a refusal stops the rest, named by its tool (${f.step}, ${sent.length} calls)`);
    ok(JSON.stringify(partsOf(pv, its).map((p) => p.items.length)) === "[1,2,1]" && partsOf({}, its).length === 0, "partsOf: each part's items picked by their numbers; no parts, nothing to file");
  }

  // ---- 4. the CLI against the REAL door (src/index.js over SQLite: tools/fixtures/sqlite-worker.mjs) -------------------------
  // A small proxy stands between the CLI and the worker: it records each call (the tool, the rows the worker counted in its
  // own Server-Timing) and injects the two faults a selftest needs (a refusal at the Nth preview, a read-back that fails).
  // Everything else is the worker's own answer: preview's verdicts and parts, each write tool's receipt (file_contribution,
  // save_knowledge, remove_knowledge: door.mjs fileParts), read's pages, its refusals. A batch counts as written once (its
  // previewId), however many of its parts filed.
  const KEY = "sentinel-" + sha256(String(Math.random())).slice(0, 24);
  const { sqliteWorker } = await import("../fixtures/sqlite-worker.mjs");
  const door = { w: null, writes: 0, wrote: new Set(), calls: [], refuseAt: 0, auth: [], readFails: false, rows: [], byKind: {} };
  const freshDoor = async () => { door.w = await sqliteWorker({ projects: ["alpha"], people: [["p-o", "Owen Owner", "owner", KEY, []]] }); door.writes = 0; door.wrote = new Set(); door.calls = []; door.rows = []; door.byKind = {}; };
  const isWrite = (n) => WRITE_TOOLS.includes(n);
  await freshDoor();
  const costDir = join(td, "cost");
  process.env.IMPORT_COST_DIR = costDir;   // the runs below keep their measure here, never in engine/.runs
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const rq = JSON.parse(body);
    door.auth.push(req.headers.authorization === `Bearer ${KEY}`);
    const name = rq.method === "tools/call" ? rq.params.name : null, a = (rq.params && rq.params.arguments) || {};
    if (name) door.calls.push(name);
    const inject = (out) => { res.setHeader("content-type", "application/json"); res.setHeader("server-timing", 'd1-rows;dur=0;desc="read=0 written=0 stmts=0 unknown=0"');
      res.end(JSON.stringify({ jsonrpc: "2.0", id: rq.id, result: { content: [{ type: "text", text: JSON.stringify(out) }], isError: true } })); };
    if (name === "preview" && door.refuseAt && door.calls.filter((n) => n === "preview").length === door.refuseAt) return inject({ error: "bad_field", note: "a refusal the selftest injected" });
    if (name === "read" && door.readFails) return inject({ error: "unreadable", note: "a read-back failure the selftest injected" });
    const r = await door.w.fetch(new Request(door.w.origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json",
      authorization: req.headers.authorization || "", ...(req.headers["x-count-rows"] ? { "x-count-rows": req.headers["x-count-rows"] } : {}) }, body }));
    const text = await r.text(), st = r.headers.get("server-timing");
    const got = rowsOf(st);
    if (name === "preview" || isWrite(name)) {
      const kind = (Array.isArray(a.items) && a.items[0] && a.items[0].kind) || (door.lastKind || "?");
      if (name === "preview") door.lastKind = kind;
      door.rows.push(got ? got.written : NaN);
      (door.byKind[kind] ||= []).push(got ? got.written : NaN);
      if (isWrite(name)) { try { const o = JSON.parse(JSON.parse(text).result.content[0].text); if ((o.results || []).some((x) => x.status === "filed") && !door.wrote.has(a.previewId)) { door.wrote.add(a.previewId); door.writes++; } } catch { /* the CLI reads it */ } }
    }
    res.statusCode = r.status;
    res.setHeader("content-type", r.headers.get("content-type") || "application/json");
    if (st) res.setHeader("server-timing", st);
    res.end(text);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = (args, env) => new Promise((r) => {
    const p = spawn(process.execPath, [CLI, P1, "--project", "alpha", ...args], { env: { ...process.env, ...env } });
    let out = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => r({ code, out }));
  });

  let r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY });
  ok(r.code === 0, `cli: a full import exited ${r.code}: ${r.out.slice(-400)}`);
  ok(door.writes === batches.length, `cli: ${door.writes} batches written, expected ${batches.length}`);
  ok(door.auth.every(Boolean), "cli: every request carried the key in Authorization");
  ok(/source vs stored/.test(r.out) && !/MISSING|\?\s*$/m.test(r.out) && (r.out.match(/ = ?$/gm) || []).length === Object.values(want).filter(Boolean).length, `cli: every kind reads back equal: ${r.out.split("source vs stored")[1]}`);
  ok(!r.out.includes(KEY), "cli: the key appears in the output");

  const w0 = door.writes;
  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY });
  ok(r.code === 0 && door.writes === w0 && (r.out.match(/"replay":true/g) || []).length === batches.length, `cli: a re-run is all replays (exit ${r.code}, writes ${door.writes - w0})`);

  await freshDoor(); door.refuseAt = 3;
  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY });
  ok(r.code === 1 && /REFUSED/.test(r.out) && /a refusal the selftest injected/.test(r.out) && /re-run the same command to resume/.test(r.out), `cli: a refusal stops the run with the door's error and says a re-run resumes (exit ${r.code})`);
  ok(door.calls.filter((n) => n === "preview").length === 3 && door.calls.lastIndexOf("preview") === door.calls.length - 1, `cli: nothing is sent after the refusal (${door.calls})`);
  ok(!r.out.includes(KEY), "cli: the key appears in the refusal output");

  // F10 · --max-batches files only the first batches (a probe) and reads nothing back; the full run then replays them
  await freshDoor(); door.refuseAt = 0;
  r = await run(["--url", url, "--max-batches", "1"], { SHARINGU_IMPORT_KEY: KEY });
  ok(r.code === 0 && door.writes === 1 && isWrite(door.calls[door.calls.length - 1]) && /--max-batches 1: filed 1 of/.test(r.out), `cli: --max-batches 1 files one batch and reads nothing back (exit ${r.code}, writes ${door.writes})`);
  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY });
  ok(r.code === 0 && door.writes === batches.length && (r.out.match(/"replay":true/g) || []).length === 1, `cli: …and the full run replays that batch and files the rest (writes ${door.writes})`);
  // F9 · a kind that does not read back fails the run: "?" is never a pass (the ship hook's import-live.sh reads the exit code)
  door.readFails = true;
  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY });
  ok(r.code === 1 && /stored +\? +\? DID NOT READ BACK/.test(r.out), `cli: a read-back that fails exits 1 with "? DID NOT READ BACK" (exit ${r.code})`);
  door.readFails = false;

  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: "" });
  ok(r.code === 2 && /SHARINGU_IMPORT_KEY/.test(r.out), `cli: no key → exit 2 naming the env var (exit ${r.code})`);
  r = await run(["--key", KEY], {});
  ok(r.code === 2 && /never an argument/.test(r.out), "cli: a key passed as an argument is refused");

  // ---- 7. rows written ---------------------------------------------------------------------------------------------------
  ok(JSON.stringify(rowsOf('d1;dur=1, d1-rows;dur=0;desc="read=7 written=29 stmts=9 unknown=0", total;dur=3')) === JSON.stringify({ read: 7, written: 29, stmts: 9, unknown: 0 }) && rowsOf("total;dur=1") === null,
    "rows: the d1-rows entry of Server-Timing is read; a header without one is no count");
  rmSync(costDir, { recursive: true, force: true });
  await freshDoor();
  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY });
  // the worker's own count, summed by the proxy over every preview and write-tool call (a fresh import: every batch writes)
  const want7 = door.rows.reduce((a, c) => a + c, 0);
  const tot7 = (r.out.match(/rows written ([\d,]+) ·/) || [])[1];
  ok(r.code === 0 && want7 > 0 && door.rows.every(Number.isFinite) && tot7 && Number(tot7.replace(/,/g, "")) === want7,
    `rows: the printed total (${tot7}) is the sum of the door's counts (${want7}): ${r.out.split("rows (the worker")[1]?.slice(0, 600)}`);
  const costFile = join(costDir, "import-cost-alpha.json");
  let kept = null;
  try { kept = JSON.parse(readFileSync(costFile, "utf8")); } catch { kept = null; }
  const goalRows = (door.byKind.goal || []).reduce((a, c) => a + c, 0);
  ok(kept && kept.kinds.goal && goalRows > 0 && kept.kinds.goal.written === goalRows && kept.kinds.goal.complete === true && kept.kinds.goal.refs.length === 1,
    `rows: a local run keeps its measure per kind (an empty project's kind is a complete measure): ${JSON.stringify(kept && kept.kinds.goal)}`);
  let keptText = null;
  try { keptText = readFileSync(costFile, "utf8"); } catch { keptText = null; }
  const before8 = door.rows.length;
  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY });
  // a re-run previews every batch (each preview is one stored row) and files none: what it writes is the previews alone
  const rerun = door.rows.slice(before8), rerunRows = rerun.reduce((a, c) => a + c, 0);
  ok(r.code === 0 && rerun.length === batches.length && !isWrite(door.calls.slice(-1)[0]) && new RegExp(`rows written ${rerunRows.toLocaleString("en-US")} ·`).test(r.out) && rerunRows <= 2 * batches.length && readFileSync(costFile, "utf8") === keptText,
    `rows: a re-run previews each batch, files none, writes only the previews (${rerunRows} rows for ${batches.length} batches) and leaves the measure as it was (exit ${r.code})`);
  // the budget: the seam refuses before anything is sent, naming the days and the kinds that fit today
  await freshDoor();
  const est7 = estimate(kept, batches).total;
  ok(Math.abs(est7 - want7) <= Object.keys(kept.kinds).length, `rows: the estimate from the measure (${est7}) is the measured run (${want7})`);
  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY, IMPORT_BUDGET_LEFT: String(Math.ceil(est7 * 0.6)) });   // over a day's budget, under two
  ok(r.code === 3 && door.writes === 0 && !door.calls.includes("preview") && !door.calls.some(isWrite) && new RegExp(`this run will write about ${est7.toLocaleString("en-US")} rows`).test(r.out)
    && /REFUSED: this run would write about/.test(r.out) && /split it over at least 2 days/.test(r.out) && /fits today: --only aim\b/.test(r.out),
    `rows: over the budget the run refuses (exit 3), files nothing, names the days and what fits today (exit ${r.code}): ${r.out.split("this run will write")[1]?.slice(0, 500)}`);
  r = await run(["--url", url], { SHARINGU_IMPORT_KEY: KEY, IMPORT_BUDGET_LEFT: String(est7) });
  ok(r.code === 0 && /fits: about/.test(r.out) && door.writes === batches.length, `rows: within the budget the run files (exit ${r.code}, writes ${door.writes})`);
  // a measure that does not hold refuses; one that does prints the estimate in a dry run
  const stale = { ...kept, measuredAt: "2000-01-01T00:00:00.000Z", kinds: Object.fromEntries(Object.entries(kept.kinds).map(([k, v]) => [k, { ...v, refs: [] }])) };
  writeFileSync(join(td, "stale.json"), JSON.stringify(stale));
  r = await run(["--dry-run", "--estimate-from", join(td, "stale.json")], {});
  ok(r.code === 3 && /the source changed after the measure/.test(r.out), `rows: a measure older than the source, of batches never measured, refuses (exit ${r.code})`);
  r = await run(["--dry-run", "--estimate-from", costFile], {});
  ok(r.code === 0 && new RegExp(`this run will write about ${est7.toLocaleString("en-US")} rows`).test(r.out), `rows: --dry-run --estimate-from prints the estimate (exit ${r.code})`);
  r = await run(["--dry-run", "--estimate-from", join(td, "no-such.json")], {});
  ok(r.code === 3 && /no measure at/.test(r.out), `rows: no measure refuses (exit ${r.code})`);
  // the arithmetic: rows per op × ops, plus the ledger's rows for every call more than the measure made per op
  const e1 = estimate({ kinds: { node: { ops: 400, calls: 2, written: 1248 } } }, [{ kind: "node", ops: Array(100) }, { kind: "node", ops: Array(100) }, { kind: "node", ops: Array(100) }, { kind: "node", ops: Array(100) }]);
  ok(e1.total === Math.ceil(1248 + 2 * LEDGER_ROWS) && e1.missing.length === 0, `rows: smaller batches add the ledger's rows per extra call (${e1.total})`);
  const e2 = estimate({ kinds: {} }, [{ kind: "edge", ops: [1] }]);
  ok(e2.missing[0] === "edge", "rows: a kind with no measure is named missing");
  const m1 = mergeCost({ kinds: { check: { ops: 10, calls: 1, written: 200, refs: ["a"] } } }, { check: { ops: 10, calls: 1, written: 50, read: 0, all: false, refs: ["b"] } }, { project: "p", at: "x" });
  const m2 = mergeCost({ kinds: { check: { ops: 10, calls: 1, written: 200, refs: ["a"] } } }, { check: { ops: 10, calls: 1, written: 50, read: 0, all: true, refs: ["b"] } }, { project: "p", at: "x" });
  ok(m1.kinds.check.written === 200 && m1.kinds.check.refs.join() === "a,b" && m2.kinds.check.written === 50 && m2.kinds.check.refs.join() === "b",
    "rows: a partial measure never lowers a kind's rate (refs join); a complete one replaces it");
  // tools/cf-budget.sh --json read as the budget (a stub curl first on PATH, fake credentials; no network)
  const stub = join(td, "stub");
  mkdirSync(join(stub, "bin"), { recursive: true });
  writeFileSync(join(stub, "env.sh"), "CLOUDFLARE_API_TOKEN=stub-token\nCLOUDFLARE_ACCOUNT_ID=stub-account\n");
  writeFileSync(join(stub, "bin", "curl"), "#!/bin/sh\nout=''; prev=''; for a in \"$@\"; do [ \"$prev\" = '>' ] && out=\"$a\"; prev=\"$a\"; done\n" +
    "printf '{\"data\":{\"viewer\":{\"accounts\":[{\"workersInvocationsAdaptive\":[{\"sum\":{\"requests\":100}}],\"d1AnalyticsAdaptiveGroups\":[{\"sum\":{\"rowsRead\":1000,\"rowsWritten\":%s}}]}]}}}' \"$STUB_WRITTEN\"\n", { mode: 0o755 });
  const withStub = (written, fn) => {
    const keep = { PATH: process.env.PATH, SHARINGU_ENV_PATH: process.env.SHARINGU_ENV_PATH, STUB_WRITTEN: process.env.STUB_WRITTEN, IMPORT_BUDGET_LEFT: process.env.IMPORT_BUDGET_LEFT, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID };
    Object.assign(process.env, { PATH: join(stub, "bin") + ":" + process.env.PATH, SHARINGU_ENV_PATH: join(stub, "env.sh"), STUB_WRITTEN: String(written) });
    delete process.env.IMPORT_BUDGET_LEFT;
    try { return fn(); } finally { for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  };
  const b1 = withStub(40000, () => budgetLeft());
  ok(b1.left === 55000 && b1.used === 40000 && b1.limit === 100000, `rows: cf-budget's answer is the budget: 95,000 under the guard less 40,000 written today (${JSON.stringify(b1)})`);
  const b2 = withStub(96000, () => budgetLeft());
  ok(!!b2.error && /refuses/.test(b2.error) && !verdict({ total: 1, rows: [] }, b2).ok, `rows: a guard that refuses (96% written) refuses the import too (${JSON.stringify(b2)})`);
  const b3 = withStub("garbage", () => budgetLeft());
  ok(!!b3.error && !verdict({ total: 1, rows: [] }, b3).ok, `rows: an unreadable budget refuses (${JSON.stringify(b3)})`);

  // ---- 8. a project filed from its overlays alone, and an architecture's .ops.json among a project's overlays ----------------
  {
    // the list: tools/lib-import-sources.sh over a throwaway engine tree, a project with items files and an ops file
    const eng = join(td, "eng"), ovd = join(eng, "tools", "import", "overlays", "demo8");
    mkdirSync(ovd, { recursive: true });
    const items = { note: "the selftest's own", clientRef: "st-demo8-1", items: [
      { kind: "aim", op: "upsert", data: { aim: "a demo filed from its overlays", measure: null } },
      { kind: "goal", op: "upsert", data: { id: "launch", parent: null, title: "Launch", dimensions: [] } },
      { kind: "goal", op: "upsert", data: { id: "beta", parent: "launch", title: "Beta", dimensions: ["code"] } }] };
    const arch = { project: "demo8", clientRef: "st-demo8-arch", ops: [
      { kind: "node", op: "upsert", data: { id: "architecture:main", type: "architecture", name: "Architecture", data: { summary: "filed after the items" } } }] };
    writeFileSync(join(ovd, "1-aim-goals.items.json"), JSON.stringify(items));
    writeFileSync(join(ovd, "b1-more.items.json"), JSON.stringify({ items: [{ kind: "goal", op: "upsert", data: { id: "beta", status: "done" } }] }));
    writeFileSync(join(ovd, "m2-architecture.ops.json"), JSON.stringify(arch));
    writeFileSync(join(ovd, "notes.json"), "{}");
    const lib = (cmd) => spawnSync("sh", ["-c", `. "${join(ENGINE, "tools", "lib-import-sources.sh")}"; ${cmd}`], { env: { ...process.env, ROOT: eng }, encoding: "utf8" });
    const listed = lib("overlays_of demo8").stdout.trim().split(",").map((f) => f.slice(ovd.length + 1));
    ok(listed.join() === "1-aim-goals.items.json,b1-more.items.json,m2-architecture.ops.json",
      `sources: a project's items files and its .ops.json are listed together in name order, any other .json left out: ${listed.join()}`);
    const k = lib("kind_of demo8; source_arg demo8; kind_of nothing8; missing_inputs demo8; missing_inputs nothing8").stdout.trim().split("\n");
    ok(k[0] === "overlays-only" && k[1] === "-" && k[2] === "source" && k.length === 4 && /^source <none known>/.test(k[3]),
      `sources: no source and overlays of its own is overlays-only (source -, nothing missing); no source and no overlays is a missing source: ${JSON.stringify(k)}`);
    const ovs = listed.map((f) => join(ovd, f));
    ok(readOverlay(ovs[2]).length === 1 && readOverlay(ovs[2])[0].data.id === "architecture:main", "sources: an .ops.json overlay ({project, clientRef, ops}) reads");

    // the CLI: the source "-" against the real door, the project unknown to it
    await freshDoor(); door.refuseAt = 0;
    const run8 = (args, env = { SHARINGU_IMPORT_KEY: KEY }) => new Promise((r) => {
      const p = spawn(process.execPath, [CLI, "-", "--project", "demo8", "--overlay", ovs.join(","), ...args], { env: { ...process.env, ...env } });
      let out = "";
      p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
      p.on("close", (code) => r({ code, out }));
    });
    r = await run8(["--url", url]);
    ok(r.code === 1 && /not an active project of this org: name it with --name/.test(r.out) && !door.calls.includes("create_project") && !door.calls.includes("preview"),
      `overlays-only: an unknown project without --name refuses and files nothing (exit ${r.code}): ${r.out.slice(-200)}`);
    r = await run8(["--url", url, "--name", "Demo Eight"]);
    ok(r.code === 0 && door.calls.filter((n) => n === "create_project").length === 1 && /project demo8 created \(create_project, named "Demo Eight"\)/.test(r.out)
      && /no source: the overlays alone/.test(r.out) && /m2-architecture\.ops\.json: 0 merged onto the source's, 1 added/.test(r.out),
      `overlays-only: the project is created, then its overlays folded (exit ${r.code}): ${r.out.slice(0, 300)}`);
    ok(/aim +built +1 +stored +1 +=/.test(r.out) && /goal +built +2 +stored +2 +=/.test(r.out) && /node +built +1 +stored +1 +=/.test(r.out) && door.writes === 3,
      `overlays-only: every kind filed and read back as built (writes ${door.writes}): ${r.out.split("source vs stored")[1]}`);
    let m8 = null;
    try { m8 = JSON.parse(readFileSync(join(costDir, "import-cost-demo8.json"), "utf8")); } catch { m8 = null; }
    ok(m8 && m8.source === null && ["aim", "goal", "node"].every((x) => m8.kinds[x] && m8.kinds[x].complete === true && m8.kinds[x].written > 0) && /rows written [\d,]+ ·/.test(r.out),
      `overlays-only: the run is measured like any project (import-cost-demo8.json, a complete measure per kind): ${JSON.stringify(m8 && Object.keys(m8.kinds))}`);
    const w8 = door.writes, c8 = door.calls.filter((n) => n === "create_project").length;
    r = await run8(["--url", url, "--name", "Demo Eight"]);
    ok(r.code === 0 && door.writes === w8 && door.calls.filter((n) => n === "create_project").length === c8 && (r.out.match(/"replay":true/g) || []).length === 3,
      `overlays-only: a second run creates nothing and replays every batch (exit ${r.code}, writes ${door.writes - w8})`);
    r = await run8(["--dry-run", "--estimate-from", join(costDir, "import-cost-demo8.json")], {});
    ok(r.code === 0 && /this run will write about [\d,]+ rows/.test(r.out), `overlays-only: the estimate reads its measure (exit ${r.code})`);
    r = await new Promise((res) => { const p = spawn(process.execPath, [CLI, "-", "--project", "demo8"]); let o = ""; p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (o += d)); p.on("close", (code) => res({ code, out: o })); });
    ok(r.code === 2 && /name at least one/.test(r.out), `overlays-only: the source "-" with no --overlay is a usage error (exit ${r.code})`);
    r = await run8(["--renders", join(td, "x.html")], {});
    ok(r.code === 1 && /takes no --layout, --board or --renders/.test(r.out), `overlays-only: --renders with no source is refused (exit ${r.code})`);
    ok(!r.out.includes(KEY), "overlays-only: the key appears in the output");
  }
  server.close();
  ok(JSON.stringify(snap(P1)) === JSON.stringify(before), "cli: the brain changed during the runs");

  // ---- 5. the three new layouts ---------------------------------------------------------------------------------------
  ok(detectLayout(P1) === "kit", `layout: the kit fixture detects as kit (${detectLayout(P1)})`);
  const writeTree = (root, files) => { for (const [p, v] of Object.entries(files)) { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); if (v !== null) writeFileSync(f, typeof v === "string" ? v : JSON.stringify(v)); } };
  const opsOf = (b, kind, pred = () => true) => b.ops.filter((o) => o.kind === kind && pred(o.data)).map((o) => o.data);
  const cliDry = (dir, args = []) => new Promise((r) => {
    const p = spawn(process.execPath, [CLI, dir, "--project", "fx", "--dry-run", ...args]);
    let out = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => r({ code, out }));
  });
  const layoutCase = async (name, dir, expectLayout, check) => {
    const b0 = snap(dir);
    ok(detectLayout(dir) === expectLayout, `${name}: detects as ${expectLayout} (got ${detectLayout(dir)})`);
    const s = readSource(dir);
    const bi = buildImport(s);
    const errs = validateAll(toBatches(bi.ops, "fx"));
    ok(errs.length === 0, `${name}: validation errors ${JSON.stringify(errs.slice(0, 3))}`);
    check(bi, s);
    const r = await cliDry(dir);
    ok(r.code === 0 && new RegExp(`layout ${expectLayout} \\(detected\\)`).test(r.out) && /every op and every batch passed/.test(r.out), `${name}: the CLI dry run exits 0 with the report (exit ${r.code}): ${r.out.slice(-300)}`);
    ok(JSON.stringify(snap(dir)) === JSON.stringify(b0), `${name}: the source changed while being read`);
  };

  // bank (siru): the register, the canon screens, the atlas, the Eagle bands/edges/comps, the card sources, the notes
  const BK = join(td, "bank");
  writeTree(BK, {
    "02_AGENT_R/tenant-manifest.json": { projects: [{ key: "bankx" }] },
    "00_CANON/screens.json": { screens: [
      { screen: "001", n: 1, sub: false, band: "core", bandName: "Core", name: "Welcome", intent: "first open" },
      { screen: "002", n: 2, sub: false, band: "core", bandName: "Core", name: "Intro", intent: "why" },
      { screen: "197", n: 197, sub: false, band: "reserved-x", bandName: "Reserved", name: "RESERVED" }] },
    "00_CANON/glossary.md": "# Glossary\n",
    "00_CANON/agent-constitution.md": "# Constitution\n",
    "60_DECISIONS/decision-log.md": "# Log\n\n### ADR-001 · First (2026-08-01 · accepted)\n**Context** — c\n\n### ADR-002 · Second (2026-08-02 · superseded)\nbody\n",
    "60_DECISIONS/open-questions.md": "# Register\n\n## Area A\n- ✅ **Q-one** — **RULED (ADR-001): yes.**\n- \u{1F534} **Q-two** — an open thing\n  - a detail line\n- **Q-two** — mentioned again\n- **Q-three** ✅ RULED same day → [[decision-log#ADR-002]]: no.\n",
    "05_BLUEPRINTS/_index.md": "# index\n",
    "05_BLUEPRINTS/bp-one.md": "---\nstatus: draft\n---\n# Blueprint One\n",
    "55_FLOWS/flow-one.md": "---\nstatus: live\n---\n# Flow One\n",
    "70_SOURCES/source-registry.md": "# Sources\n\n### S-01 · Source one\ntext\n",
    "20_PRODUCT/app-registry.json": { apps: [{ id: "app-one", name: "App One", context: "c", repos: [{ repo: "r1", dev_state: "shipped" }] }] },
    "serve/lib/atlas/atlas.json": { apps: { "x-app": { name: "X App", bands: [{ band: "core", screens: [{ id: "001", name: "Welcome", shot: "a.png" }] }] },
      "y-app": { name: "Y App", bands: [{ band: "core", screens: [{ id: "001", name: "Welcome", shot: "b.png" }] }] } } },
    "serve/lib/eagle/eagle.json": { bandOrder: ["core"], bands: { core: { name: "Core band", rows: 2 } }, edges: [["001", "002"], ["002", "197"]], comps: [{ id: "svc", name: "Svc", kind: "api-group", grade: "absent" }] },
    "85_ALIGNMENTS/capsules/eng.md": "# Eng capsule\n",
    "evals/worker/acceptance.md": "| # | Case | Expected | Result |\n|---|---|---|---|\n| **E1** | a | b | ✅ PASS |\n",
  });
  await layoutCase("bank", BK, "bank", (bi, s) => {
    const q3 = opsOf(bi, "question").find((x) => x.qid === "Q-three");
    ok(q3 && q3.status === "decided" && q3.label === "ADR-002" && q3.question === "RULED same day → decision-log#ADR-002: no." && !opsOf(bi, "node", (d) => d.id === "gap:Q-three").length,
      `bank: a bullet whose ✅ follows its bold id is ruled too (a decided question, never an open gap): ${JSON.stringify(q3)}`);
    const q = opsOf(bi, "question").filter((x) => x.qid !== "Q-three");
    ok(q.length === 1 && q[0].qid === "Q-one" && q[0].status === "decided" && q[0].label === "ADR-001" && q[0].decidedAt === "2026-08-01" && q[0].options.length === 0 && q[0].area === "Area A",
      `bank: the ruled bullet is a decided question (label ADR-001, decidedAt the ADR's date): ${JSON.stringify(q)}`);
    const gap = opsOf(bi, "node", (d) => d.type === "gap");
    ok(gap.length === 1 && gap[0].id === "gap:Q-two" && gap[0].status === "open" && gap[0].data.severity === "blocker" && gap[0].data.detail === "  - a detail line", `bank: the open bullet is gap node gap:Q-two (severity blocker, its detail): ${JSON.stringify(gap)}`);
    ok(s.notImported.some((x) => /Q-two \(a second bullet\)/.test(x.what)), "bank: the duplicate bullet is named in the report");
    // P2 (2026-10-01): the register's markdown is formatting, not words — the ✅, the severity mark, the bold id and the
    // emphasis are not part of the question a person reads on Decisions or the Map; the bullet stays verbatim in data.line
    ok(q[0].question === "RULED (ADR-001): yes." && gap[0].name === "an open thing" && gap[0].data.line === "\u{1F534} **Q-two** — an open thing",
      `bank: a register bullet reads as words (no ✅, severity mark, **id** or emphasis), the gap keeps the line verbatim: ${JSON.stringify([q[0].question, gap[0].name, gap[0].data.line])}`);
    ok(plainLine("**Q-x** \u{1F7E0} *(opened 2026-09-10; **routed** to [[who-is-who]])* — **no** web", "Q-x") === "(opened 2026-09-10; routed to who-is-who) — no web",
      `bank: plainLine unwraps nested emphasis and wiki links, keeps every word: ${plainLine("**Q-x** \u{1F7E0} *(opened 2026-09-10; **routed** to [[who-is-who]])* — **no** web", "Q-x")}`);
    const scr = opsOf(bi, "node", (d) => d.type === "screen");
    ok(scr.length === 2 && scr[0].id === "screen:001" && JSON.stringify(scr[0].data.surface) === '["x-app","y-app"]' && scr[0].data.lane === "core" && scr[1].data.surface === scr[1].data.lane, `bank: two screens (the reserved slot is none), 001 on the atlas in TWO apps (data.surface the list of both, D1b item 20), 002 not (its band its surface): ${JSON.stringify(scr.map((x) => [x.id, x.data.surface]))}`);
    ok(opsOf(bi, "node", (d) => d.type === "surface").map((d) => d.id).join() === "surface:x-app,surface:y-app,surface:core", `bank: each app of a shared screen is a surface, the band after them: ${opsOf(bi, "node", (d) => d.type === "surface").map((d) => d.id)}`);
    ok(opsOf(bi, "edge").length === 1 && bi.skips.some((x) => x.kind === "edge" && /screen:197/.test(x.id)), "bank: the edge to the reserved slot is skipped, the other filed");
    ok(opsOf(bi, "node", (d) => d.type === "service" && d.data.kind === "api-group").length === 1 && opsOf(bi, "node", (d) => d.type === "door").length === 0, "bank: an Eagle component is a service node (its kind in data), never a door");
    ok(opsOf(bi, "node", (d) => d.type === "lane" && d.name === "Core band").length === 1 && opsOf(bi, "node", (d) => d.type === "surface" && d.name === "X App").length === 1, "bank: the band is a lane, the atlas app a surface");
    const cards = opsOf(bi, "card");
    const want = { decision: 2, blueprint: 1, journey: 1, source: 1, app: 1 };
    for (const [k, n] of Object.entries(want)) ok(cards.filter((c) => c.kind === k).length === n, `bank: ${n} ${k} card(s)`);
    ok(cards.find((c) => c.id === "bp-one").name === "Blueprint One" && cards.find((c) => c.id === "bp-one").status === "draft" && cards.find((c) => c.id === "ADR-002").status === "superseded", "bank: a blueprint's name is its heading, its status its frontmatter; an ADR keeps its status");
    ok(/\| r1 \|  \|  \| shipped \|/.test(cards.find((c) => c.kind === "app").body) && cards.find((c) => c.kind === "app").status === "shipped", "bank: the app card is the exporter's rendering");
    ok(JSON.stringify(opsOf(bi, "doc").map((d) => d.path).sort()) === JSON.stringify(["00_CANON/glossary.md", "capsules/eng.md"]), `bank: docs are the capsule and the note (the constitution is machinery): ${opsOf(bi, "doc").map((d) => d.path)}`);
    ok(opsOf(bi, "check").length === 0 && /1 eval cases/.test(s.why.check), `bank: no checks, and the report says why (${s.why.check})`);
    ok(opsOf(bi, "aim").length === 0 && opsOf(bi, "goal").length === 0, "bank: no aim, no goals");
  });

  // pack (saruspay): the served pack over a board model
  const PK = join(td, "pack");
  const pdir = "serve/ws/px/pack";
  const kind = (key, label, idPattern, dir) => ({ key, label, idPattern, path: `cards/${dir}/{slug}.md`, indexPath: `index/${dir}.json`, roleVisibility: ["qa"] });
  writeTree(PK, {
    "02_AGENT_R/publish-map.json": { servePrefix: "serve/ws/px" },
    "serve/goal.json": { northStar: "PX live in production", milestones: [{ id: "alpha", title: "Alpha checklist", refs: ["alpha-one"] }] },
    "serve/capsules/qa.md": "# QA brief\n",
    "serve/lib/START-HERE.md": "# Start here\n",
    "serve/lib/understanding.json": "{\"dimensions\":[]}",
    // the brain's served canvas names the apps and splits the model's "ops" (saruspay: the tenant admin, by lane)
    "serve/lib/canvas/canvas.json": { surfaces: ["web", "tenant"], surfaceLabels: { web: "Web app", tenant: "Tenant admin" },
      screens: [{ id: "home", surface: "web", lane: "money" }, { id: "tadash", surface: "tenant", lane: "ta" }] },
    [`${pdir}/pack.json`]: { kinds: [kind("screen", "Screens", "^[a-z]+$", "screens"), kind("decision", "Decisions", "^Q[0-9A-F]{8}$", "decisions"),
      kind("role", "Start by role", "^[a-z]+$", "roles"), kind("feature", "Features", "^[a-z][a-z0-9-]*$", "features")], roles: [{ key: "qa", mapsTo: "reader" }], files: [] },
    [`${pdir}/index/screens.json`]: [{ id: "home", name: "Home", status: "web · proposed" }],
    [`${pdir}/cards/screens/home.md`]: "# Home\n",
    [`${pdir}/index/decisions.json`]: [{ id: "Q0000000A", name: "B it is", status: "ruled" }, { id: "Q0000000B", name: "Open q?", status: "open" }, { id: "Q0000000C", name: "Settled", status: "settled from evidence" }],
    [`${pdir}/cards/decisions/Q0000000A.md`]: "# A\n", [`${pdir}/cards/decisions/Q0000000B.md`]: "# B\n", [`${pdir}/cards/decisions/Q0000000C.md`]: "# C settled\n",
    [`${pdir}/index/roles.json`]: [{ id: "qa", name: "QA", status: "" }],
    [`${pdir}/cards/roles/qa.md`]: "# QA brief\n",
    [`${pdir}/index/features.json`]: [{ id: "f-one", name: "F one", status: "new" }],
    [`${pdir}/cards/features/f-one.md`]: "# F one\n",
    [`${pdir}/decisions.json`]: [
      { qid: "Q0000000A", question: "", choice: "B", label: "B it is", rationale: "r", status: "decided", updated: "2026-09-01T00:00:00.000Z" },
      { qid: "Q0000000B", question: "Open q?", status: "open", waitingOn: "Interlace", area: "Money" }],
    [`${pdir}/checks.json`]: [{ id: "AC.home.01", kind: "screen-acceptance", method: "e2e", severity: "major", title: "t", given: "g", when: "w", then: "th",
      source: { type: "screen", id: "home" }, refs: [{ type: "endpoint", id: "GET /x" }], rulings: [], status: "unproven" }],
    [`${pdir}/goals.json`]: [{ id: "alpha-one", label: "Do one", party: "alpha", status: "todo", dependsOn: [], why: "because", cost: "$1" }],
    [`${pdir}/files/model.json`]: {
      lanes: [{ id: "money", label: "Money" }],
      screens: [{ id: "home", name: "Home", surface: "web", lane: "money", status: "proposed" }, { id: "pay", name: "Pay", surface: "web", lane: "money", status: "retired" },
        { id: "tadash", name: "TA dash", surface: "ops", lane: "ta", status: "proposed" }, { id: "tausers", name: "TA users", surface: "ops", lane: "ta", status: "proposed" }],
      edges: [{ from: "home", to: "pay", label: "go" }],
      flows: [{ id: "f1", name: "Flow 1", steps: ["home", "pay"] }, { id: "f2", name: "Flow 2", steps: [{ screen: "home", actor: "user", does: "opens" }] }],
      entities: [{ id: "user", label: "User", table: "users" }], relations: [{ from: "", to: "", fromTable: "users", toTable: "cards", card: "1—*", verb: "has" }],
      tables: [{ name: "users" }, { name: "cards" }], api: [{ id: "GET /x", tables: { read: ["users"], write: [] } }],
      architecture: { summary: "s", services: [{ id: "vercel", name: "Vercel" }] },
      questions: [
        { id: "Q0000000A", question: "Pick?", why: "w", severity: "blocker", options: [{ key: "A", label: "a" }, { key: "B", label: "b", consequence: "c" }], screens: ["home"], api: ["GET /x"] },
        { id: "Q0000000B", question: "Open q?", options: [{ key: "A", label: "x" }, { key: "B", label: "y" }] },
        { id: "Q0000000C", question: "Settled", options: [{ key: "A", label: "x" }, { key: "B", label: "y" }], verdict: "resolved" }],
      rulings: [{ id: "Q0000000A" }], golive: { parties: [] }, evals: { evals: [] }, meta: {}, legacyEdges: [] },
  });
  await layoutCase("pack", PK, "pack", (bi, s) => {
    ok(s.brainKey === "px" && opsOf(bi, "aim")[0].aim === "PX live in production" && opsOf(bi, "aim")[0].measure === null, "pack: the aim is goal.json's northStar");
    const g = opsOf(bi, "goal");
    ok(g.map((x) => `${x.id}<${x.parent}`).join(",") === "px-live-in-production<null,alpha<px-live-in-production,alpha-one<alpha" && g[2].status === "todo" && g[2].owner === "alpha" && g[2].note === "because" && g[2].title === "Do one",
      `pack: root → milestone → item, the item's status, owner, note: ${JSON.stringify(g)}`);
    const qa = opsOf(bi, "question", (d) => d.qid === "Q0000000A")[0], qb = opsOf(bi, "question", (d) => d.qid === "Q0000000B")[0];
    ok(qa && qa.question === "Pick?" && qa.choice === "B" && qa.options.length === 2 && qa.options[1].tradeoff === "c" && qa.decidedAt === "2026-09-01T00:00:00.000Z" && qa.severity === "blocker"
      && JSON.stringify(qa.affects) === JSON.stringify(["screen:home", "api:GET /x"]), `pack: a ruling joins its model question (text, options, severity, affects): ${JSON.stringify(qa)}`);
    ok(qb && qb.status === "open" && qb.options.length === 2 && qb.waitingOn === "Interlace" && qb.area === "Money", `pack: the open question keeps its options and who it waits on: ${JSON.stringify(qb)}`);
    const cards = opsOf(bi, "card");
    ok(JSON.stringify(cards.map((c) => `${c.kind}/${c.id}`).sort()) === JSON.stringify(["decision/Q0000000C", "feature/f-one"]), `pack: filed cards are the unfiled decision and the feature: ${cards.map((c) => `${c.kind}/${c.id}`)}`);
    ok(cards.every((c) => JSON.stringify(c.roleVisibility) === '["qa"]'), "pack: roleVisibility verbatim from pack.json");
    ok(bi.skips.some((x) => x.id === "screen/home" && /screen` node/.test(x.reason)) && bi.skips.some((x) => x.id === "role/qa = doc capsules/qa.md") && bi.skips.filter((x) => /question row filed/.test(x.reason)).length === 2,
      "pack: the screen card (a node rendering), the role card (a doc's bytes) and the two question renderings are skipped with their reasons");
    const flows = opsOf(bi, "node", (d) => d.type === "flow");
    ok(flows.find((f) => f.id === "flow:f1").data.screenSteps.join() === "home,pay" && flows.find((f) => f.id === "flow:f1").data.steps === undefined && flows.find((f) => f.id === "flow:f2").data.steps.length === 1,
      "pack: bare screen-id steps ride in data.screenSteps; {actor, does} steps stay steps");
    const e = opsOf(bi, "edge");
    ok(e.some((x) => x.kind === "relation" && x.from === "table:users" && x.to === "table:cards") && e.some((x) => x.kind === "flow-step" && x.from === "flow:f1" && x.to === "screen:pay")
      && e.some((x) => x.kind === "reads" && x.to === "table:users") && e.some((x) => x.kind === "nav"), `pack: nav, reads, a table-to-table relation, flow-steps from bare ids: ${e.map((x) => x.kind)}`);
    ok(opsOf(bi, "node", (d) => d.type === "surface" && d.id === "surface:web").length === 1 && opsOf(bi, "node", (d) => d.id === "screen:pay")[0].status === "retired", "pack: a surface per distinct screen surface; a door-status passes");
    // P2 (2026-10-02): the apps are named as the brain's served canvas names them, and its split of a model key is followed
    // (by screen id, else by the (model app, lane) pair its screens agree on); the model's key is kept in data.appKey
    const sfs = opsOf(bi, "node", (d) => d.type === "surface"), sc = (id) => opsOf(bi, "node", (d) => d.id === `screen:${id}`)[0];
    ok(JSON.stringify(sfs.map((d) => [d.id, d.name])) === '[["surface:web","Web app"],["surface:tenant","Tenant admin"]]' && sc("tadash").data.surface === "tenant" && sc("tausers").data.surface === "tenant"
      && sc("tausers").data.appKey === "ops" && sc("home").data.surface === "web" && sc("home").data.appKey === undefined && s.notes.some((n) => /served canvas/.test(n.note)),
      `pack: the apps named by the served canvas, "ops" split to its app by id and by lane: ${JSON.stringify(sfs.map((d) => [d.id, d.name]))} ${JSON.stringify(["tadash", "tausers", "home"].map((i) => [i, sc(i).data.surface, sc(i).data.appKey]))}`);
    ok(JSON.stringify(opsOf(bi, "check")[0].refs) === '["door:GET:/x"]', "pack: an endpoint ref is the door node");
    ok(JSON.stringify(opsOf(bi, "doc").map((d) => d.path).sort()) === JSON.stringify(["capsules/qa.md", "lib/START-HERE.md"]), `pack: docs ${opsOf(bi, "doc").map((d) => d.path)}`);
    // sprint 3: serve/lib/understanding.json is the old engine's /understanding page data (deleted in D6): named, not filed
    ok(s.notImported.some((x) => x.what === "serve/lib/understanding.json" && /old engine's \/understanding page/.test(x.why)), "pack: the old engine's understanding.json is named in the report, not filed as a doc");
    ok(s.notImported.some((x) => /model\.json \/legacyEdges/.test(x.what)), "pack: an unfiled model part is named in the report");
  });

  // board (bunny): a board directory
  const BD = join(td, "board");
  writeTree(BD, {
    "spec/.keep": "",
    "model.json": {
      lanes: [{ id: "app-a", label: "App — A" }], screens: [{ id: "app-a:home", name: "Home", surface: "app-a", status: "built" }], edges: [],
      flows: [{ id: "fl", name: "Fl", steps: [{ screen: "app-a:home", to: "app-a:x", does: "tap" }], rulings: [] }],
      tables: [{ name: "t1" }], relations: [], entities: [], api: [],
      questions: [{ id: "Q1111AAAA", section: "screens", severity: "gap", question: "Q?", why: "w", options: [], screens: ["app-a:home"] }],
      rulings: [{ id: "Q1111AAAA" }],
      golive: { note: "n", parties: [{ id: "owner", name: "Owner", sections: [{ title: "S", items: [{ id: "own-one", text: "x".repeat(450), why: "because", status: "done" }] }] }] },
      evals: { evals: [
        { id: "PRD.x#1", kind: "acceptance", method: "manual", severity: "gap", title: "t", then: "t", source: { doc: "a.md", line: 3 }, refs: [{ type: "widget", ref: "test/a_test.dart#4", gate_status: "floor" }], rulings: [] },
        { id: "WF." + "y".repeat(130), kind: "wireframe-conformance", title: "t", then: "t", source: { type: "frame", id: "f" }, refs: [], rulings: [] }] },
      sdlc: {}, version: {} },
    "decisions/decisions/Q1111AAAA.json": { qid: "Q1111AAAA", question: "", choice: "ruled", label: "L", rationale: "r".repeat(8100), status: "decided", updated: "2026-09-20T00:00:00.000Z", implemented: { at: "x", evidence: "y" } },
    "cards/manifest.json": { cards: [
      { id: "app-a:home", kind: "screen", name: "Home", status: "", path: "cards/screens/app-a-home.md" },
      { id: "Q1111AAAA", kind: "decision", name: "L", status: "ruled", path: "cards/decisions/Q1111AAAA.md" },
      { id: "app-a:home", kind: "wireframe", name: "Home", status: "app-a", path: "cards/wireframes/app-a-home.md" }] },
    "cards/screens/app-a-home.md": "# Home\n", "cards/decisions/Q1111AAAA.md": "# L\n", "cards/wireframes/app-a-home.md": "# Home wireframe\n",
    "cards/wireframes/INDEX.md": "# Wireframes (text) — 1\n",
    "GOLIVE.md": "# Go-live\n\n> n\n", "START-HERE.md": "# Start here\n", "API.md": "# API\n",
  });
  await layoutCase("board", BD, "board", (bi, s) => {
    ok(opsOf(bi, "aim").length === 0 && /no aim/.test(s.why.aim), "board: no aim, and why");
    const g = opsOf(bi, "goal");
    ok(g.length === 3 && g[0].id === "go-live" && g[0].title === "Go-live" && g[2].title.length === HEAD_MAX && g[2].title.endsWith("\u2026") && g[2].note.startsWith("x".repeat(450)) && g[2].status === "done",
      `board: root go-live (GOLIVE.md's heading) → party → item; a long text is titled by its headline (cut at ${HEAD_MAX}), the full text leads the note: ${JSON.stringify(g.map((x) => [x.id, x.title.length]))}`);
    const q = opsOf(bi, "question")[0];
    ok(q.question === "Q?" && q.implStatus === "implemented" && q.rationale.length === 8000 && q.choice === "ruled" && JSON.stringify(q.affects) === '["screen:app-a:home"]', `board: the ruling file joins its model question; implemented; the rationale cut to the door's cap: ${JSON.stringify({ ...q, rationale: q.rationale.length })}`);
    ok(opsOf(bi, "node", (d) => d.type === "flow")[0].data.screenSteps.length === 1, "board: {screen, to, does} steps ride in data.screenSteps");
    const cards = opsOf(bi, "card");
    ok(cards.length === 1 && cards[0].kind === "wireframe" && cards[0].roleVisibility === null && opsOf(bi, "card_kind")[0].label === "Wireframes (text)" && opsOf(bi, "card_kind")[0].roleVisibility === null,
      `board: the wireframe card files open, its kind labelled by its INDEX.md heading: ${JSON.stringify(opsOf(bi, "card_kind"))}`);
    const c = opsOf(bi, "check");
    ok(c.length === 1 && c[0].sourceType === "doc" && c[0].sourceId === "a.md:3" && JSON.stringify(c[0].refs) === '["widget:test/a_test.dart#4"]' && bi.skips.some((x) => x.kind === "check" && /id rule/.test(x.reason)),
      `board: a {doc, line} source, a {type, ref} ref; an over-long id skipped: ${JSON.stringify(c)}`);
    ok(JSON.stringify(opsOf(bi, "doc").map((d) => d.path).sort()) === JSON.stringify(["board/GOLIVE.md", "board/START-HERE.md"]), `board: docs ${opsOf(bi, "doc").map((d) => d.path)} (API.md is a register)`);
  });
  // ---- 6. the screens' renders ----
  {
    const d = screenData({ id: "home", name: "Home" }, { surface: "mobile", lane: "money", step: "3",
      states: [{ name: "default", trigger: "opens" }, { name: "Error | retry", trigger: "fails" }], wireframes: [{ name: "loading", pid: "wf:home#2" }],
      copy: ["Your balance", "Add money to start"], controls: "[{'label': 'Add money', 'type': 'button', 'to': 'add'}, {'label': 'Email', 'type': 'input'}, {'label': 'Home', 'type': 'tab'}, {'label': 'Cards', 'type': 'tab'}, {'label': 'On sign-in: KYC', 'type': 'auto'}]" }, {});
    ok(JSON.stringify(d.states) === '["default","Error / retry","loading"]' && d.stateDetails.length === 2 && d.step === 3 && d.surface === "mobile"
      && JSON.stringify(d.wireframe) === '[{"kind":"header","label":"Home"},{"kind":"title","label":"Your balance"},{"kind":"text","label":"Add money to start","lines":1},{"kind":"button","label":"Add money","emphasis":true},{"kind":"input","label":"Email"},{"kind":"tabbar","items":2}]',
      `renders: a screen row standardized (state names, "|" written "/", the rows kept in stateDetails, step a number, the wireframe from copy and controls, an auto control not drawn): ${JSON.stringify(d)}`);
    ok(JSON.stringify(stateNamesOf({ states: "[{'name': 'loading', 'trigger': ''}, {\"name\": \"error\"}]" })) === '["loading","error"]' && reprItems("[{'label': \"Don't\", 'to': None}]")[0].label === "Don't",
      "renders: state names out of a Python repr string; a repr's quoted value with the other quote inside");
    const odd = screenData({ id: "x", name: "X" }, { surface: 7, step: "soon", wireframe: "see the PDF" }, {});
    ok(odd.surfaceSource === 7 && odd.surface === undefined && odd.stepSource === "soon" && odd.step === undefined && odd.wireframeSource === "see the PDF" && odd.wireframe === undefined,
      "renders: a source field the standard reads otherwise is kept under <field>Source, never sent in the wrong shape");
    // a board html: two gzip+base64 blobs and the board app's constants
    const MODEL = { version: { builtAt: "2026-09-30T00:00:00Z" }, lanes: [{ id: "money", label: "Money" }],
      screens: [{ id: "home", name: "Home", surface: "mobile", lane: "money", step: 1, pid: "home", wireframes: [{ name: "default", pid: "wf:home#0" }, { name: "loading", pid: "wf:home#1" }, { name: "default", pid: "wf:home#2" }] }],
      edges: [] };
    const PAYLOAD = { css: { proto: ".s{color:red}", wf: ".w{color:var(--wfink)}", empty: "" },
      html: { home: "<div class='s'>Home</div>", "wf:home#0": "<div class='w'>wf</div>", "wf:home#1": "<div>loading</div>", "wf:home#2": "<div>again</div>",
        "prop:home": "<div>proposed</div>", "webp:home": "<div>web</div>", "art:M1": "<div>art</div>", ghost: "<div>?</div>" },
      meta: { home: { css: "proto", w: 390, h: 844, live: true }, "wf:home#0": { css: "wf", w: 390, h: 844, wireframe: true }, "wf:home#1": { css: "wf", w: 390, h: 844, wireframe: true },
        "wf:home#2": { css: "wf", w: 390, h: 844, wireframe: true }, "prop:home": { css: "proto", w: 390, h: 844, proposed: true }, "webp:home": { css: "empty", w: 1440, h: 900, proposed: true },
        "art:M1": { css: "proto", w: 390, h: 844, ref: "home" }, ghost: { css: "proto", w: 1, h: 1 } } };
    const b64 = (o) => gzipSync(Buffer.from(JSON.stringify(o))).toString("base64");
    const htmlFile = join(td, "board-test.html");
    writeFileSync(htmlFile, `<html><script type="application/gzip-base64" id="model">${b64(MODEL)}</script><script id="payload">${b64(PAYLOAD)}</script>` +
      `<script>var WFVARS = ":host{--wfink:#111}";var STATIC = "*{animation:none}"\n  + "a{b:c}";</script></html>`);
    const h = readBoardHtml(htmlFile);
    ok(h.built === "2026-09-30T00:00:00Z" && h.consts.wfvars === ":root{--wfink:#111}" && h.consts.static === "*{animation:none}a{b:c}" && Object.keys(h.payload.html).length === 8,
      `renders: a board html read: its build, its two blobs, the app's constants (:host read as :root): ${JSON.stringify(h.consts)}`);
    const src = { board: { model: { screens: MODEL.screens } }, renders: { kind: "board-html", ...h } };
    const m = mapRenders(src, { known: new Set(["screen:home"]) });
    const rs = m.ops.filter((o) => o.kind === "render").map((o) => o.data), st = m.ops.filter((o) => o.kind === "style").map((o) => o.data);
    const key = (x) => `${x.state}|${x.variant}|${x.style || ""}|${x.width}x${x.height}`;
    ok(JSON.stringify(rs.map(key).sort()) === JSON.stringify(["|design|proto|390x844", "|live|proto|390x844", "|proposed-web||1440x900", "|proposed|proto|390x844", "default|wireframe 2|wf|390x844", "default|wireframe|wf|390x844", "loading|wireframe|wf|390x844"].sort())
      && rs.every((x) => x.screen === "screen:home" && x.format === "html") && m.skips.some((x) => x.id === "ghost") && m.byFormat.html === 7,
      `renders: a board's frames: the wireframe pid's state, the screen pid as a whole, art by its ref, prop and webp (no web twin: proposed-web), a repeated state's " 2"; a frame naming no screen skipped: ${JSON.stringify(rs.map(key))}`);
    ok(st.length === 2 && st.find((x) => x.id === "wf").css === ":root{--wfink:#111}\n.w{color:var(--wfink)}\n*{animation:none}a{b:c}" && !st.some((x) => x.id === "empty"),
      `renders: one style per CSS family used (the app's variables, the family, the animation freeze); an empty family is none: ${JSON.stringify(st)}`);
    const stored = { node: new Map([["screen:home", { id: "screen:home", type: "screen", name: "Home", status: null, data: {} }]]) };
    const pk = planKnowledge([...m.ops.filter((o) => o.kind === "style"), ...m.ops.filter((o) => o.kind === "render")], stored, { isOwner: true });
    ok(pk.errors.length === 0, `renders: every style and render op passes the door's rules: ${JSON.stringify(pk.errors.slice(0, 3))}`);
    const wfm = mapRenders({ board: { model: { screens: [] } }, renders: { kind: "wireframes", from: "x", spec: { screens: [{ id: "wf-home", name: "Home", regions: ["identity", "needs-you"], buttons: ["approve"] }, { id: "wf-bare" }] } } },
      { known: new Set(["screen:wf-home", "screen:wf-bare"]) });
    const w0 = (wfm.ops[0] || {}).data || {};
    ok(wfm.ops.length === 1 && w0.format === "wireframe" && w0.variant === "wireframe" && JSON.stringify(w0.body) === '[{"kind":"header","label":"Home"},{"kind":"card","label":"identity","lines":2},{"kind":"card","label":"needs you","lines":2},{"kind":"button","label":"approve","emphasis":true}]'
      && wfm.skips.some((x) => x.id === "wf-bare"), `renders: a wireframe spec's screen is one wireframe render (its regions, its buttons); one with neither is skipped: ${JSON.stringify(w0)}`);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAGX8C/V8+/0LAAAAAElFTkSuQmCC", "base64");
    const shots = mapRenders({ board: { model: { screens: [] } }, renders: { kind: "atlas-shots", from: "x", missing: [], shots: [{ screen: "001", app: "a", shot: "s.png", alt: "Welcome <b>", mime: "image/png", b64: png.toString("base64"), ...imageSize(png, "image/png") }] } },
      { known: new Set(["screen:001"]) });
    const sh = (shots.ops[0] || {}).data || {};
    ok(sh.format === "html" && sh.variant === "screenshot" && sh.width === 2 && sh.height === 3 && /^<img src="data:image\/png;base64,/.test(sh.body) && /alt="Welcome  b"/.test(sh.body),
      `renders: an atlas shot is an html render of its own data:image, at its own size, its alt text made inert: ${JSON.stringify({ ...sh, body: sh.body && sh.body.slice(0, 60) })}`);
  }

  // ---- 5b. a go-live item's title is its headline (P2, 2026-10-01) ------------------------------------------------------
  {
    const long = "Review every screen changed since build 909 on the build-ready review page https://claude.ai/artifact/x (280 entries, before / now on gate-38; Approve or Needs a fix per screen)";
    const h1 = headline(long), h2 = headline("Approve the public web page copy: privacy, support, marketing, deletion — 2026-09-28: public pages changed (footer Terms/Privacy/Support) and much more text after it");
    const h3 = headline("a".repeat(30) + " " + "word ".repeat(40)), short = "Vercel Pro team with engine, web app and console projects";
    ok(h1 === "Review every screen changed since build 909 on the build-ready review page" && h2 === "Approve the public web page copy" && headline(short) === short,
      `goals: a long item is titled by its first clause (a link, a colon), a short one is itself: ${JSON.stringify([h1, h2])}`);
    ok(h3.length <= HEAD_MAX && h3.endsWith("\u2026") && !/ \u2026$/.test(h3), `goals: with no clause boundary, the title is cut at a word with an ellipsis: ${JSON.stringify(h3)}`);
  }

  // ---- 6. overlays (P2, 2026-10-01): knowledge ops filed after a source, folded by the door's own semantics ------------
  {
    const src = [
      { kind: "aim", op: "upsert", data: { aim: "old aim", measure: null } },
      { kind: "goal", op: "upsert", data: { id: "global", parent: null, title: "Old root", dimensions: [] } },
      { kind: "goal", op: "upsert", data: { id: "engine", parent: "global", title: "Old child", dimensions: ["code"] } },
      { kind: "node", op: "upsert", data: { id: "architecture:main", type: "architecture", name: "Architecture", status: null, data: { summary: "the deleted machinery" } } },
      { kind: "node", op: "upsert", data: { id: "screen:a", type: "screen", name: "A", status: null, data: {} } },
      { kind: "node", op: "upsert", data: { id: "screen:b", type: "screen", name: "B", status: null, data: {} } },
      { kind: "edge", op: "upsert", data: { from: "screen:a", to: "screen:b", kind: "nav", label: null, data: {} } },
    ];
    const ov1 = [{ kind: "node", op: "upsert", data: { id: "architecture:main", type: "architecture", name: "Architecture", data: { summary: "from the code" } } },
      { kind: "node", op: "remove", data: { id: "screen:b" } }, { kind: "node", op: "remove", data: { id: "screen:zz" } }];
    const ov2 = [{ kind: "aim", op: "upsert", data: { aim: "the real aim", measure: null } },
      { kind: "goal", op: "upsert", data: { id: "launch", parent: null, title: "Launch", dimensions: [] } },
      { kind: "goal", op: "upsert", data: { id: "beta", parent: "launch", title: "Beta", dimensions: ["code"] } },
      { kind: "goal", op: "upsert", data: { id: "beta", status: "done" } }];
    const o = applyOverlays(src, [{ path: "ov1", ops: ov1 }, { path: "ov2", ops: ov2 }]);
    const of = (k) => o.ops.filter((x) => x.kind === k).map((x) => x.data);
    const arch = of("node").find((n) => n.id === "architecture:main");
    ok(arch && arch.data.summary === "from the code" && arch.status === null && of("node").length === 2,
      `overlay: an upsert on a filed key merges onto it (its fields win, the rest stay): ${JSON.stringify(arch)}`);
    ok(!of("node").some((n) => n.id === "screen:b") && of("edge").length === 0 && o.report[0].removed === 1 && o.report[0].ignored === 1,
      `overlay: a remove drops the op and a node's edges with it; a remove of a key never filed is counted, not an error: ${JSON.stringify(o.report[0])}`);
    ok(of("aim").length === 1 && of("aim")[0].aim === "the real aim", "overlay: the one-row aim is replaced");
    ok(JSON.stringify(of("goal").map((g) => [g.id, g.parent, g.status ?? null])) === JSON.stringify([["launch", null, null], ["beta", "launch", "done"]]) && o.report[1].goalsDropped === 2,
      `overlay: an overlay that files its own goal root replaces the source's tree (one root), a later partial upsert merges: ${JSON.stringify(of("goal"))}`);
    ok(validateAll(toBatches(o.ops, "fx")).length === 0, `overlay: the folded ops pass the door's rules: ${JSON.stringify(validateAll(toBatches(o.ops, "fx")).slice(0, 2))}`);
    ok(o.source.goal === 3 && o.source.node === 3, `overlay: its ops count at the source: ${JSON.stringify(o.source)}`);
    // the files: a bare list, {ops} (the walkthrough file) and {items}; anything else refused by name
    const f1 = join(td, "ov-list.json"), f2 = join(td, "ov-ops.json"), f3 = join(td, "ov-bad.json");
    writeFileSync(f1, JSON.stringify(ov2)); writeFileSync(f2, JSON.stringify({ project: "fx", clientRef: "x", ops: ov1 })); writeFileSync(f3, JSON.stringify({ items: [{ kind: "nope", op: "upsert", data: {} }] }));
    ok(readOverlay(f1).length === 4 && readOverlay(f2).length === 3, "overlay: a bare list and {ops: [...]} read");
    let refused = null; try { readOverlay(f3); } catch (e) { refused = e.message; }
    ok(/item 0 is not a knowledge op/.test(refused || ""), `overlay: an item that is not a knowledge op is refused by its index: ${refused}`);
    // the CLI: --overlay on the kit fixture, the goal tree replaced, validation passing, the report naming the fold
    const ovGoals = join(td, "ov-goals.json");
    writeFileSync(ovGoals, JSON.stringify([{ kind: "goal", op: "upsert", data: { id: "launch", parent: null, title: "Launch", dimensions: [] } },
      { kind: "goal", op: "upsert", data: { id: "beta", parent: "launch", title: "Beta", dimensions: ["code"] } },
      { kind: "aim", op: "upsert", data: { aim: "the real aim" } }]));
    const rc = await cliDry(P1, ["--overlay", ovGoals]);
    ok(rc.code === 0 && /ov-goals\.json: 1 merged onto the source's, 2 added, 0 removed · it files its own goal root: \d+ source goal\(s\) dropped/.test(rc.out) && /\n  goal +\d+ +2 /.test(rc.out) && /every op and every batch passed/.test(rc.out),
      `overlay: the CLI folds --overlay, reports it and validates the result (exit ${rc.code}): ${rc.out.split("\n").filter((l) => /overlay|merged|^  goal|validation/.test(l)).join(" | ")}`);
    const rbad = await cliDry(P1, ["--overlay", f3]);
    ok(rbad.code === 1 && /not a knowledge op/.test(rbad.out), `overlay: a bad overlay file exits 1, nothing built (exit ${rbad.code})`);
  }

  // a ruled register bullet that names no dated ADR but states its own date: that date is when it was ruled (sprint 3 item 6)
  ok(ruledOn("✅ **Q-x** — **RESOLVED 2026-08-28.** All four accounts") === "2026-08-28" && ruledOn("RULED (ADR-027): the Worker serves") === null && ruledOn("RESOLVED 2026-08-30 (owner): x") === "2026-08-30",
    `bank: a ruled line's own date is its ruling date: ${ruledOn("✅ **Q-x** — **RESOLVED 2026-08-28.** All four accounts")}`);
  // ---- 9. the text rules (sprint 3, the projects' data before the video) ---------------------------------------------------
  // import/tidy.mjs: the readers' one pass (no machine path; titles without markdown, email addresses or bare question ids)
  // and audit/text-rules.mjs: no machine path and no credential-shaped text in any stored string (the importer fails on a hit)
  {
    const H = "~" + "/", U = "/Us" + "ers/";   // built from pieces: this file names no machine path itself
    ok(noMachinePath(`see ${H}batcave_vm/bunny/backend/docs/plan.md §0`) === "see bunny/backend/docs/plan.md §0"
      && noMachinePath(`(\`${H}.sharingu/credentials.env\`)`) === "(`.sharingu/credentials.env`)"
      && noMachinePath(`> \`${U}someone/batcave_vm/veil/engine/x.ts\` —`) === "> `veil/engine/x.ts` —"
      && noMachinePath(`Source: ${H}Desktop/team-context.md v6`) === "Source: team-context.md v6"
      && noMachinePath("log dir /tmp/publish-gate, and /private/tmp/x") === "log dir tmp/publish-gate, and tmp/x"
      && noMachinePath("http://host/Users/x stays") === "http://host/Users/x stays",
      `tidy: a machine path loses its machine prefix (home, workspace root, Desktop, /tmp), a URL path is not one: ${noMachinePath(`(\`${H}.sharingu/credentials.env\`)`)}`);
    ok(plainText("**Bold**, *it*, `code`, [[wiki|alias]], [text](https://x.y/z) and *.dart") === "Bold, it, code, wiki, text and *.dart" && plainText("# Heading") === "Heading",
      `tidy: markdown unwrapped, formatting only (a glob stays): ${plainText("**Bold**, *it*, `code`, [[wiki|alias]], [text](https://x.y/z) and *.dart")}`);
    ok(noEmail("Pick someone@example.test's avatar") === "Pick someone's avatar" && noEmail("no address here") === "no address here", "tidy: an email address in a title becomes its mailbox name");
    const q = qidsOut("Resend account on the EU region (Q21F87C63); sender verified"), q2 = qidsOut("Money gate: bank data encrypted at rest (Q-plaintext-bank, Q-internal-key)");
    ok(q.title === "Resend account on the EU region; sender verified" && q.qids.join() === "Q21F87C63" && q2.qids.join() === "Q-plaintext-bank,Q-internal-key" && qidsOut("Ask about (QA) later").qids.length === 0,
      `tidy: a bare question id in parentheses leaves a title: ${JSON.stringify([q, q2])}`);
    const t = tidyOps([
      { kind: "goal", op: "upsert", data: { id: "g1", parent: null, title: "**Ship** the gate (Q-gate-1) for someone@example.test", dimensions: [], note: `notes in ${H}batcave_vm/x/y.md` } },
      { kind: "question", op: "upsert", data: { qid: "Q-a", question: "Is `x` ready (Q-b)?", status: "open", options: [{ what: "yes" }, { what: "no" }] } },
      { kind: "doc", op: "upsert", data: { path: "a.md", title: "A", body: `# A\n\nrun ${U}someone/x.sh` } },
    ]);
    const g = t.ops[0].data, qq = t.ops[1].data, d = t.ops[2].data;
    ok(g.title === "Ship the gate for someone" && g.note === "notes in x/y.md" && JSON.stringify(g.source) === '[{"kind":"thread","ref":"Q-gate-1","label":"the question it follows"}]'
      && qq.question === "Is x ready (Q-b)?" && d.body === "# A\n\nrun x.sh" && d.path === "a.md" && t.notes.length >= 4,
      `tidy: a goal title loses markdown, address and question id (kept in source); a question keeps its cross-reference; a body loses machine paths; keys untouched: ${JSON.stringify([g.title, g.source, qq.question, d.body])}`);
    ok(validateAll(toBatches(t.ops, "fx")).length === 0, "tidy: the tidied ops pass the door's rules");
    // the text rules: every rule fires on a made-up value built here, none on what only looks like one
    const v = "9" + "Zq" + "1";   // a made-up value
    const fire = {
      "home-tilde": `Stored in \`${H}.x/creds.env\``, users: `at ${U}someone/x`, tmp: "log /tmp/x.log", private: "the /private/var/x file",
      "quoted-password": `Passwords stay \`${v}\` for now`, "password-before": `a \`${v}\`-password line`, "password-colon": `password: ${v}x`,
      "rotated-off": `accounts rotated off \`${v}\``, "key-value": `secret \`${"ab12".repeat(8)}\``, "key-prefix": `key ${"sk_" + "live_" + "a1B2".repeat(5)}`,
      "private-key": "-----BEGIN " + "RSA PRIVATE KEY-----", "url-userinfo": `postgres://user:${v}pw@db.example.test/x`,
    };
    const missed = Object.entries(fire).filter(([rule, text]) => !textHits(text).some((h) => h.rule === rule)).map(([r]) => r);
    ok(!missed.length, `text rules: each rule fires on its shape (missed: ${missed.join(", ") || "none"})`);
    const quiet = ["Password field (hint 'Required')", "Password input + 'Show'", '<div class="lab">Password</div><div class="field">Password</div>', "password rotation · `02_AGENT_R/ship-handoff.md`",
      "Set a new password: Strong", "the key IS the password.** `src/index.js`", "token budget 1500", "see https://example.test/Users/guide", "a user's ~ tilde"];
    const loud = quiet.filter((x) => textHits(x).length);
    ok(!loud.length, `text rules: a UI label, an HTML attribute, a file path after the word, a URL path stay quiet: ${loud.join(" | ")}`);
    const sh = scanOps([{ kind: "card", op: "upsert", data: { kind: "decision", id: "ADR-9", name: "x", body: `rotated off \`${v}\`` } }]);
    ok(sh.length === 1 && sh[0].ref === "card decision/ADR-9" && sh[0].field === "body" && !JSON.stringify(sh).includes(v), `text rules: a hit names the item and field, never the value: ${JSON.stringify(sh)}`);
    // the overlay's edit: git-safe (the regex names the shape, not the value), reported when it no longer matches
    const eo = applyOverlays([{ kind: "card", op: "upsert", data: { kind: "decision", id: "ADR-9", name: "x", body: `All accounts rotated off \`${v}\` today.` } }],
      [{ path: "ed", ops: [{ kind: "card", op: "edit", data: { kind: "decision", id: "ADR-9" }, edits: [{ field: "body", find: "rotated off `[0-9A-Za-z]{4}`", replace: "rotated off the old password", count: 1 }] },
        { kind: "card", op: "edit", data: { kind: "decision", id: "ADR-9" }, edits: [{ field: "body", find: "never there", replace: "x" }] },
        { kind: "doc", op: "edit", data: { path: "nope.md" }, edits: [{ field: "body", find: "x", replace: "y" }] }] }]);
    ok(eo.ops[0].data.body === "All accounts rotated off the old password today." && eo.report[0].edited === 2 && eo.report[0].editFaults.length === 2 && !scanOps(eo.ops).length && eo.ops.length === 1,
      `overlay edit: rewrites in place without holding the value; a no-match and a missing key are reported: ${JSON.stringify(eo.report[0])}`);
    const fe = join(td, "ov-edit-bad.json");
    writeFileSync(fe, JSON.stringify([{ kind: "card", op: "edit", data: { kind: "decision", id: "x" }, edits: [{ field: "body", find: "(", replace: "" }] }]));
    let er = null; try { readOverlay(fe); } catch (e) { er = e.message; }
    ok(/not a regular expression/.test(er || ""), `overlay edit: a find that is not a regular expression is refused: ${er}`);
    // the CLI: an overlay carrying a machine path or credential-shaped text fails the run, named by item and field only
    const fb = join(td, "ov-text-bad.json");
    writeFileSync(fb, JSON.stringify([{ kind: "aim", op: "upsert", data: { aim: "the aim", source: [{ kind: "file", ref: `${H}Desktop/notes.md §1` }] } },
      { kind: "doc", op: "upsert", data: { path: "ops.md", title: "Ops", body: `# Ops\n\nPasswords stay \`${v}\` for now.` } }]));
    const rt = await cliDry(P1, ["--overlay", fb]);
    ok(rt.code === 1 && /text rule machine-path · home-tilde/.test(rt.out) && /text rule credential · quoted-password/.test(rt.out) && /ops\.md \(body\)/.test(rt.out) && !rt.out.includes(v) && !rt.out.includes("notes.md §1"),
      `text rules: the CLI fails on a machine path or credential-shaped text in an overlay, naming item and field, never the value (exit ${rt.code}): ${rt.out.split("\n").filter((l) => /text rule|FAILED/.test(l)).join(" | ")}`);
  }

  const rk = await cliDry(BK, ["--layout", "kit"]);
  ok(rk.code === 1 && /could not read the source|refused/.test(rk.out), `layout: --layout kit on a bank is refused (exit ${rk.code})`);
  const rx = await cliDry(BK, ["--layout", "nonsense"]);
  ok(rx.code === 2 && /not a layout/.test(rx.out), `layout: an unknown --layout exits 2 (exit ${rx.code})`);
  // ---- 8. the code layout (import/read-code.mjs, P2b): sharingu's model and checks from a checkout's code. A small fake
  // checkout (a router with its gate, two route tables, an MCP runTool, the rail, a page renderer, boot.sql, the generated
  // contract) proves the reader's rules table by table; the real checkout proves the vocabulary and the ids' stability.
  {
    const RC = await import("./read-code.mjs");
    const CK = join(td, "code-checkout");
    const put = (rel, text) => { mkdirSync(dirname(join(CK, rel)), { recursive: true }); writeFileSync(join(CK, rel), text); };
    put("contracts/door.json", JSON.stringify({ counts: {}, rest: [
      { method: "GET", path: "/home", auth: "reader", does: "Home: the page to a browser, JSON otherwise {project, aim, rows} — twin of the home tool" },
      { method: "GET", path: "/old", auth: "none", does: "legacy alias — 302 to /home" },
      { method: "GET", path: "/login", auth: "none", does: "the sign-in page" },
      { method: "GET", path: "/guide", auth: "none", does: "a public page that lights no tab" },
      { method: "POST", path: "/things", auth: "bearer", does: "file a thing {name}; 422 name_required when it has none; 403 project_forbidden" },
      { method: "GET", path: "/things/:id", auth: "reader", does: "one thing as JSON {id, name}" },
      { method: "GET", path: "/ghost", auth: "reader", does: "declared and served by nothing" },
      { method: "POST", path: "/mcp", auth: "bearer", does: "MCP endpoint" },
    ], tools: [
      { name: "home", description: "Home in one read. The same read GET /home answers.", owner: false, write: false },
      { name: "file_thing", description: "File a thing; one with no name is refused (name_required).", owner: false, write: true },
      { name: "wipe", description: "Owner only. Wipe the things.", owner: true, write: true },
    ], home: { regions: ["aim", "never-drawn"] } }));
    put("engine/boot.sql", "CREATE TABLE IF NOT EXISTS things (\n  id TEXT PRIMARY KEY,\n  project TEXT NOT NULL REFERENCES projects(key),\n  name TEXT NOT NULL\n);\n" +
      "CREATE TABLE IF NOT EXISTS projects (\n  key TEXT PRIMARY KEY,\n  name TEXT\n);\nCREATE TABLE IF NOT EXISTS people (\n  id TEXT PRIMARY KEY\n);\nCREATE TABLE IF NOT EXISTS dusty (\n  id TEXT PRIMARY KEY\n);\nCREATE TABLE IF NOT EXISTS orgrow (\n  id INTEGER PRIMARY KEY\n);\n" +
      "CREATE INDEX IF NOT EXISTS idx_things_project ON things(project, name);\n");
    put("engine/src/util.js", "export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });\n" +
      "export function signInOr401(request, url) {\n  if ((request.headers.get(\"accept\") || \"\").startsWith(\"text/html\")) return redirectToLogin(url);\n  return json({ error: \"auth_required\" }, 401);\n}\nfunction redirectToLogin(url) { return new Response(null, { status: 302, headers: { location: \"/login\" } }); }\n");
    put("engine/src/core.js", "export async function resolveReader(request, env) { return env.DB.prepare(\"SELECT id FROM people WHERE id = ?\").bind(1).first(); }\n");
    put("engine/src/home.js", "// the home read and its page\nexport async function readHome(env) {\n  return env.DB.prepare(\"SELECT id, name FROM things WHERE project = ?\").bind(\"p\").all();\n}\n" +
      "export function renderHome(h) {\n  return `<section data-screen=\"home\"><div data-region=\"aim\">${h}</div><a href=\"/things/1\">a thing</a></section>`;\n}\n" +
      "export async function fileThing(env, a) {\n  return env.DB.prepare(\"INSERT INTO things (id, project, name) VALUES (?, ?, ?)\").bind(a.id, \"p\", a.name).run();\n}\n");
    put("engine/src/login.js", "export function renderLogin() {\n  return `<!doctype html><form method=\"POST\" action=\"/login\"></form>`;\n}\n");
    put("engine/src/guide.js", "export function renderGuide() {\n  return `<section data-screen=\"guide\"><div data-region=\"list\"></div></section>`;\n}\n");
    put("engine/src/shell.js", "const PAGES = [\n  { key: \"home\", label: \"Home\", href: \"/home\", group: \"Overview\" },\n];\nconst PUBLIC_KEYS = new Set([]);\n" +
      "const TABS = [\n  { key: \"home\", label: \"Home\", icon: \"home\",\n    views: [{ key: \"home\", label: \"Overview\", href: \"/home\" }] },\n];\nconst OFFNAV_TAB = { thing: \"home\" };\nexport function shell(o) { return o.content; }\n");
    put("engine/src/mcp.js", "import { readHome, fileThing } from \"./home.js\";\nimport { json } from \"./util.js\";\n" +
      "export async function callTool(name, a, person, env) {\n  return runTool(name, a, person, env);\n}\n" +
      "async function runTool(name, a, person, env) {\n  switch (name) {\n    case \"home\": return await readHome(env);\n    case \"file_thing\": return await fileThing(env, a);\n    case \"wipe\": return await env.DB.prepare(\"DELETE FROM things WHERE project = ?\").bind(\"p\").run();\n    default: return { error: \"unknown tool\" };\n  }\n}\n" +
      "export async function handleMcp(request, env) { return json(await callTool(\"home\", {}, null, env)); }\n");
    put("engine/src/index.js", "import { json, signInOr401 } from \"./util.js\";\nimport { resolveReader } from \"./core.js\";\nimport { readHome, renderHome, fileThing } from \"./home.js\";\nimport { renderLogin } from \"./login.js\";\nimport { renderGuide } from \"./guide.js\";\nimport { shell } from \"./shell.js\";\nimport { handleMcp } from \"./mcp.js\";\n" +
      "const ORGROW_SQL = \"SELECT * FROM orgrow WHERE id = 1\";\nasync function orgOf(env) {\n  return env.DB.prepare(ORGROW_SQL).first();\n}\n" +
      "async function servePage(env, o) {\n  await orgOf(env);\n  return new Response(shell(o), { headers: { \"content-type\": \"text/html\" } });\n}\n" +
      "const ABOVE_ROUTES = [\n  {\n    test: (path, method) => path === \"/old\",\n    run: async (c) => new Response(null, { status: 302, headers: { location: \"/home\" } }),\n  },\n" +
      "  {\n    test: (path, method) => path === \"/login\" && method === \"GET\",\n    run: async (c) => new Response(renderLogin(), { headers: { \"content-type\": \"text/html; charset=utf-8\" } }),\n  },\n" +
      "  {\n    test: (path, method) => path === \"/guide\" && method === \"GET\",\n    run: async (c) => servePage(c.env, { active: \"guide\", content: renderGuide() }),\n  },\n" +
      "  {\n    test: (path, method) => path === \"/home\" && method === \"GET\",\n    run: async (c) => {\n      const { env } = c;\n      const h = await readHome(env);\n      return servePage(env, { active: \"home\", content: renderHome(h) });\n    },\n  },\n" +
      "  {\n    test: (path, method) => path === \"/mcp\" && method === \"POST\",\n    run: async (c) => handleMcp(c.request, c.env),\n  },\n];\n" +
      "const BELOW_ROUTES_1 = [\n  {\n    test: (path, method) => path === \"/things\" && method === \"POST\",\n    run: async (c) => {\n      const a = await c.request.json();\n      if (!a.name) return json({ error: \"name_required\" }, 422);\n      return json(await fileThing(c.env, a));\n    },\n  },\n" +
      "  {\n    test: (path, method) => path.startsWith(\"/things/\") && method === \"GET\",\n    run: async (c) => json(await c.env.DB.prepare(\"SELECT id, name FROM things WHERE id = ?\").bind(1).first()),\n  },\n];\n" +
      "const routeRequest = async (request, env, ctx) => {\n  const url = new URL(request.url);\n  const path = url.pathname;\n  const c = { request, env, url, path };\n" +
      "  const GATED_SURFACE = [\"/home\"];\n  if (path === \"/\" || GATED_SURFACE.includes(path) || ((path.startsWith(\"/question/\")) && request.method === \"GET\")) {\n    const gateReader = await resolveReader(request, env);\n    if (!gateReader) {\n      return signInOr401(request, url);\n    }\n  }\n" +
      "  for (const r of ABOVE_ROUTES) {\n    if (r.test(path, request.method)) return r.run(c);\n  }\n  const person = await resolveReader(request, env);\n  if (!person) return json({ error: \"unauthorized\", hint: \"Authorization: Bearer <your key>\" }, 401);\n" +
      "  for (const r of BELOW_ROUTES_1) {\n    if (r.test(path, request.method)) return r.run(c);\n  }\n  return json({ error: \"not_found\" }, 404);\n};\nconst workerHandler = { fetch: (request, env, ctx) => routeRequest(request, env, ctx) };\nexport default workerHandler;\n");
    const model = join(td, "code-model.json");
    writeFileSync(model, JSON.stringify({ app: { key: "fx", name: "fx" }, lanes: { anonymous: { key: "signin", label: "Sign in" }, signedIn: { key: "you", label: "You" }, pages: { _why: "fixture", guide: "you" } },
      mcpAnonymous: { status: 401, words: "401 from the OAuth provider" }, names: { login: { name: "Sign in" } },
      flows: { list: [{ id: "f1", name: "Home, then a thing", steps: [{ actor: "Person", does: "opens Home", screen: "/home" }, { actor: "Claude", does: "reads Home", door: "GET /home", mcp: true }, { actor: "Claude", does: "files", door: "POST /gone", mcp: true }] }] } }));
    ok(RC.isCodeDir(CK) && detectLayout(CK) === "code", "code: a checkout (engine/src/index.js, engine/boot.sql, contracts/door.json) is detected as the code layout");
    const src = RC.readCode(CK, { model });
    const ops = src.built.ops;
    const node = (id) => (ops.find((o) => o.kind === "node" && o.data.id === id) || {}).data;
    const edgeOf = (from, to, kind) => ops.find((o) => o.kind === "edge" && o.data.from === from && o.data.to === to && o.data.kind === kind);
    const checkOf = (id) => (ops.find((o) => o.kind === "check" && o.data.id === id) || {}).data;
    // the rules, table by table: [what, holds]
    const rules = [
      ["a page whose handler goes through servePage is a screen, in its tab's lane, with its route and data-screen", (() => { const s = node("screen:home"); return s && s.data.lane === "home" && s.data.route === "/home" && s.data.dataScreen === "home" && s.data.step === 1 && s.name === "Home"; })()],
      ["a whole-document page (a render that opens with a doctype) is a screen too, in the sign-in lane", (() => { const s = node("screen:login"); return s && s.data.lane === "signin"; })()],
      ["a page that lights no tab and answers with no credential goes to the lane the model pins for it (What is missing since L4), not the sign-in lane", (() => { const s = node("screen:guide"); return s && s.data.lane === "you"; })()],
      ["a route that only redirects is NOT a screen: its door carries the redirect", !node("screen:old") && (node("door:GET:/old") || {}).data?.redirect === "/home"],
      ["a JSON route is a door and no screen", !!node("door:GET:/things/:id") && !ops.some((o) => o.kind === "node" && o.data.type === "screen" && o.data.data.route === "/things/:id")],
      ["a tool and its REST twin (one read function, named by the registry) link both ways", !!edgeOf("door:MCP:home", "door:GET:/home", "depends") && node("door:MCP:home").data.twin === "GET /home" && node("door:GET:/home").data.twin === "MCP home"],
      ["a tool that shares no read function with a row has no twin", !node("door:MCP:wipe").data.twin],
      ["a door reads the tables its handler's SQL reads", !!edgeOf("door:GET:/home", "table:things", "reads") && !!edgeOf("door:MCP:home", "table:things", "reads")],
      ["a door writes the tables its handler's SQL writes (INSERT, DELETE)", !!edgeOf("door:POST:/things", "table:things", "writes") && !!edgeOf("door:MCP:wipe", "table:things", "writes")],
      ["a screen depends on the door that serves it", !!edgeOf("screen:home", "door:GET:/home", "depends")],
      ["a table carries its columns, keys and indexes from boot.sql", (() => { const t = node("table:things"); return t && t.data.cols.length === 3 && t.data.pk.includes("id") && t.data.indexes[0].name === "idx_things_project" && t.data.scope === "project"; })()],
      ["a table no code reads or writes is a gap the code shows", node("gap:unused-table:dusty")?.status === "open" && !!edgeOf("gap:unused-table:dusty", "table:dusty", "blocks")],
      ["a table the page shell reads through a SQL constant (tenant.js ORG_SQL) is read on every request, not an unused-table gap", !node("gap:unused-table:orgrow") && !!node("table:orgrow") && [...ops].some((o) => o.kind === "edge" && o.data.to === "table:orgrow" && o.data.kind === "reads")],
      ["a registry row nothing serves is a gap", !!node("gap:unserved:GET:/ghost")],
      ["a region the contract declares and no renderer draws is a gap", !!node("gap:region:never-drawn") && !node("gap:region:aim")],
      ["a flow step resolves a REST row's MCP twin; a step naming a door the code lacks keeps its words, unlinked", (() => { const f = node("flow:f1"); return f && f.data.steps[1].door === "MCP home" && !f.data.steps[2].door && f.data.steps[0].screen === "home"; })()],
    ];
    for (const [what, holds] of rules) ok(holds, `code: ${what}`);
    // the auth class -> the check's words: [check id, the words its then must hold]
    const words = [
      ["door:GET:/home.access", /a script .* gets 401 \{"error":"auth_required"\}; a browser navigation .* gets 302 to \/login\?next=…; the same call with the owner's key is let through/],
      ["door:POST:/things.access", /^it answers 401 \{"error":"unauthorized"\}; the same call with the owner's key is let through/],
      ["door:GET:/old.access", /^it answers 302 to \/home with no credential$/],
      ["door:GET:/login.access", /^it answers with no credential: no 401, no 403, no redirect to sign-in$/],
      ["door:POST:/mcp.access", /^401 from the OAuth provider/],
      ["door:MCP:wipe.access", /owner_only/],
      ["door:MCP:file_thing.access", /the owner's key is let through/],
    ];
    for (const [id, re] of words) { const c = checkOf(id); ok(c && re.test(c.then), `code: the auth class maps to the check's words (${id}): ${c ? c.then : "no such check"}`); }
    ok(/name_required/.test((checkOf("door:POST:/things.refuses") || {}).then || "") && /name_required/.test((checkOf("door:MCP:file_thing.refuses") || {}).then || ""), "code: a write door's refusal check names the error its registry declares");
    ok(/project, aim, rows/.test((checkOf("door:GET:/home.shape") || {}).then || "") && (checkOf("door:GET:/home.shape") || {}).refs?.includes("door:MCP:home"), "code: a read door's shape check names the fields its registry declares, and its twin");
    ok(/data-screen="home"/.test((checkOf("screen:home.loads") || {}).then || "") && /data-region="aim"/.test((checkOf("screen:home.loads") || {}).then || ""), "code: a screen's check names its data-screen and its regions");
    // every check's refs name a node the build files; every edge joins two; the build passes the door's own rules
    const ids = new Set(ops.filter((o) => o.kind === "node").map((o) => o.data.id));
    ok(ops.filter((o) => o.kind === "check").every((o) => o.data.refs.length && o.data.refs.every((x) => ids.has(x))), "code: every check's refs name a node the build files");
    ok(ops.filter((o) => o.kind === "edge").every((o) => ids.has(o.data.from) && ids.has(o.data.to)), "code: every edge joins two nodes the build files");
    ok(validateAll(toBatches(ops, "fx")).length === 0, `code: the fixture's build passes the door's own rules: ${JSON.stringify(validateAll(toBatches(ops, "fx")).slice(0, 2))}`);
    // the look revision (2026-10-02): one route serving two pages — an error page drawn in the shell with a status of its own,
    // and an item's page whose tab is computed (the card's page on GET /read) — keys the screen by its renderer, never by the
    // error page's tab; parts.js pageHead names a page by its literal title or the literal a computed one falls back to
    {
      const branch = `if (path === "/read" && wantsHtml(request) && p.get("ref")) {
        const one = await readAnswer(env, person, { ref: p.get("ref") });
        if (one.error) return servePage(env, { active: "library", content: renderDenied({ what: one.error === "x" ? "Pick (one)." : "None." }), owner: true, status: EXTRACT_STATUS[one.error] || 422 });
        if (one.kind === "card") return servePage(env, { active: cardTabOf(one.item), content: renderCardPage(one), owner: person.role === "owner", reader: person });
      }`;
      const calls = RC.servePageCalls(branch);
      ok(calls.length === 2 && calls[0].active === "library" && calls[0].error && !calls[1].error && calls[1].computed && calls[1].renders === "card",
        `code: servePage calls read off the code: an error page's tab and status, a computed tab's renderer (${JSON.stringify(calls)})`);
      ok(RC.servePageCalls(`return servePage(env, { active: "goals", content: renderGoalPage(g), status: 200 });`).every((c) => !c.error && c.active === "goals"),
        "code: a page answering status 200 is not an error page");
      const m1 = RC.marksOfSource(`export function a() { ${branch} }`);
      const m2 = RC.marksOfSource(`export const h = () => pageHead({ region: "impact-head", title: noDash(i.what || "Impact"), crumbs: [] });\nexport const k = () => pageHead({ title: "Activity" });`);
      ok([...m1.active].join() === "card", `code: the route's page key is the card (its renderer), not the error page's library (${[...m1.active]})`);
      ok([...m2.titles].sort().join() === "Activity,Impact", `code: pageHead titles, literal and fallback (${[...m2.titles]})`);
      // a region in a ternary whose other branch draws nothing is drawn only when it has something; one after a closed ternary is not
      const m3 = RC.marksOfSource(`export function r(d) {
  const glance = cur ? tileRow([tile({ label: "Current" })], { region: "glance", label: "Versions" }) : "";
  const list = (needs.length ? card({ label: "Open", region: "open", body: lines(needs) }) : "") + card({ label: "Ruled", region: "ruled" });
  const head = (a ? b(x) : "") + card({ region: "head" });
  const facts = [src ? { label: "Source", html: \`<span data-region="source">\${src}</span>\` } : null];
  return glance + list + facts + head;
}`);
      ok(["glance", "open", "source"].every((x) => m3.maybe.has(x)) && ["ruled", "head"].every((x) => m3.always.has(x)),
        `code: a region in a ternary with an empty other branch is a maybe (maybe ${[...m3.maybe]}; always ${[...m3.always]})`);
    }
    // the real checkout: the ids are stable across two runs, and the reader's own words name no banned or stale word
    const REPO = resolve(ENGINE, "..");
    if (RC.isCodeDir(REPO)) {
      const a1 = RC.readCode(REPO).built.ops, a2 = RC.readCode(REPO).built.ops;
      ok(sha256(JSON.stringify(a1)) === sha256(JSON.stringify(a2)) && a1.length > 100, `code: two runs on this checkout build the same ops (${a1.length}), ids and all`);
      ok(validateAll(toBatches(a1, "sharingu")).length === 0, `code: this checkout's build passes the door's own rules: ${JSON.stringify(validateAll(toBatches(a1, "sharingu")).slice(0, 2))}`);
      // D2b item 8: the checks name the goal of sharingu's tree they prove (code-model/model.json goals), every goal named is
      // in the tree the overlays file; the old-path pages get no load check (none is a bare "200 HTML"); a door no screen
      // calls is grouped in a person's words
      {
        const tree = new Set();
        for (const f of readdirSync(resolve(ENGINE, "tools/import/overlays/sharingu")).filter((x) => x.endsWith(".items.json"))) {
          const j = JSON.parse(readFileSync(resolve(ENGINE, "tools/import/overlays/sharingu", f), "utf8"));
          for (const it of Array.isArray(j) ? j : j.items || []) if (it && it.kind === "goal" && it.data && it.data.id) tree.add(it.data.id);
        }
        const cks = a1.filter((o) => o.kind === "check").map((o) => o.data);
        const named = cks.flatMap((c) => c.refs.filter((x) => !/:/.test(x)));
        ok(cks.filter((c) => c.refs.some((x) => !/:/.test(x))).length >= 100 && named.length && named.every((g) => tree.has(g)),
          `code: the checks name the goals they prove, each one in sharingu's tree (${new Set(named).size} goals over ${cks.filter((c) => c.refs.some((x) => !/:/.test(x))).length} checks)`);
        const walk = (id) => (cks.find((c) => c.id === `flow:${id}.walk`) || { refs: [] }).refs;
        ok(walk("proof-checks").includes("b4-impact") && walk("proof-missing").includes("b3-checklist") && walk("member-path").includes("c2-live-walk"), "code: each flow's walk names its goal (proof 3 shows on Goals)");
        ok(!cks.some((c) => c.kind === "screen" && /^200 HTML(;|$)/.test(c.then)) && !cks.some((c) => ["screen:view.loads", "screen:page.loads", "screen:understanding.loads", "screen:agentic.loads"].includes(c.id))
          && ["screen:login.loads", "screen:docs.loads", "screen:audit.loads", "screen:projects.loads"].every((id) => (cks.find((c) => c.id === id) || {}).then?.includes("data-region=")),
          "code: no screen check is a bare 200 HTML: the old-path pages get none, sign-in, docs, activity and projects name a region");
        // the look revision (2026-10-02): the card's page lives on GET /read behind ?ref=card/…: a screen of its own (not the
        // Library's), and its load check names the query it needs
        const scr = (id) => (a1.find((o) => o.kind === "node" && o.data.id === id) || {}).data;
        const cardCk = cks.find((x) => x.id === "screen:card.loads");
        ok((scr("screen:library") || { data: {} }).data.route === "/library" && (!scr("screen:card") || (scr("screen:card").data.route === "/read" && cardCk && /^GET \/read\?ref=card\/<kind>\/<id> /.test(cardCk.when))),
          `code: the card's page on GET /read is its own screen and its check names ?ref= (library ${(scr("screen:library") || { data: {} }).data.route}, card ${cardCk ? cardCk.when : "none"})`);
        const groups = new Set(a1.filter((o) => o.kind === "node" && o.data.type === "door").map((o) => o.data.data.group));
        ok(![...groups].some((g) => /^(Not on a page|MCP only|Redirects)/.test(g)) && groups.has("Scripts and agents") && groups.has("Agent tools · any member"),
          `code: a door no screen calls is grouped in a person's words (${[...groups].filter((g) => !/^[A-Z][a-z]+$/.test(g)).join(", ")})`);
      }
      // the banned words (tools/check-vocab-selftest.mjs BANNED) and the audit's stale names (tools/audit/project-audit.mjs STALE),
      // read from those files, over the reader's OWN words: names, check titles and sentences, flow steps. The code's own
      // identifiers (a route, a tool's name, an error code, a region) and the registry's verbatim text are not the reader's words.
      const vsrc = readFileSync(join(ENGINE, "tools", "check-vocab-selftest.mjs"), "utf8"), asrc = readFileSync(join(ENGINE, "tools", "audit", "project-audit.mjs"), "utf8");
      const banned = new RegExp(/const BANNED = \/(.+)\/gi;/.exec(vsrc)[1], "gi");
      const stale = [...asrc.slice(asrc.indexOf("const STALE = ["), asrc.indexOf("];", asrc.indexOf("const STALE = ["))).matchAll(/\["([^"]+)", \/((?:\\.|[^/])+)\/([a-z]*)/g)].map((m) => [m[1], new RegExp(m[2], m[3])]);
      const strip = (t) => String(t).replace(/`[^`]*`/g, " ").replace(/"[A-Za-z_][\w-]*"/g, " ").replace(/\b(GET|POST|MCP) \S+/g, " ").replace(/\/[\w:/<>.?=&-]*/g, " ").replace(/\b\w+_\w+\b/g, " ").replace(/data-[a-z]+="[^"]*"/g, " ");
      const own = [];
      for (const o of a1) {
        const d = o.data;
        if (o.kind === "node" && d.type !== "door" && d.type !== "table") own.push([d.id, d.name], ...(d.type === "flow" ? d.data.steps.map((s) => [d.id, `${s.actor} ${s.does}`]) : []), ...(d.type === "gap" ? [[d.id, d.data.what]] : []));
        if (o.kind === "check") own.push([d.id, d.title], [d.id, d.given], [d.id, d.when], [d.id, d.then]);
      }
      const hits = [];
      for (const [id, t] of own) { const s = strip(t); banned.lastIndex = 0; const b = s.match(banned); if (b) hits.push(`${id}: ${b[0]}`); for (const [term, re] of stale) if (re.test(s)) hits.push(`${id}: ${term}`); }
      ok(stale.length >= 5 && hits.length === 0, `code: the reader's own words name no banned or stale word (${own.length} texts, ${stale.length} stale terms): ${hits.slice(0, 5).join("; ")}`);
    }
  }
} finally {
  rmSync(td, { recursive: true, force: true });
}
console.log(`import selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
