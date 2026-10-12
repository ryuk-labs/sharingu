#!/usr/bin/env node
// engine/tools/import-brain.mjs — the one-time importer (ARCHITECTURE §8/§9, sprint 1 slice 5): reads a git brain and
// files its knowledge into a project through the MCP door as any client does: each batch of <= 200 items is previewed
// (`preview`) and then filed (`file`) with the same items.
//
//   node tools/import-brain.mjs <brain-dir | -> --project <key> [--layout kit|bank|pack|board|code] [--board <dir>] [--renders <file|dir>]
//        [--url <worker-url>] [--dry-run] [--out <ops.json>] [--only <kind,kind>] [--max-ops <n>] [--max-bytes <n>] [--max-batches <n>]
//        [--estimate-from <cost.json>] [--i-counted <n>] [--overlay <ops.json> …] [--name <name>]
//
// The source's layout (import/read.mjs readSource) is detected unless --layout names it: kit (a brain whose publish map has
// a kit section: sharingu, ryuklabs) · bank (a markdown knowledge bank: siru) · pack (a served brain pack over a board
// model: saruspay) · board (a board directory: bunny) · code (this repo's checkout: sharingu's model and checks from its
// code, import/read-code.mjs; --renders names the kit's wireframe spec).
// The screens' renders (kinds style and render, docs/plan/ARCHITECTURE.md §11) come from the layout's own source
// (import/read-renders.mjs): the kit's source/board/sources/wireframe.json, a board's board.html, the bank's atlas shots, or
// --renders <file|dir> (a board html for a pack, e.g. saruspay's Desktop "SarusPay Board.html"; the directory of the seed
// builds for a bank).
//
// Without --url (or with --dry-run) it builds every op, validates every batch with the door's own rules (src/knowledge/
// schema.js planKnowledge, as the owner, each batch on the state the batches before it leave), and prints per kind: the source count, the ops built, what was skipped (and why) and the batches; exit 1 if any op fails
// validation. --out writes the batches as JSON. With --url it then files each batch (clientRef = a stable hash of the
// batch, so a re-run is a no-op), stops on the first refusal and prints the door's errors, then reads each kind back
// with `read` and prints source-vs-stored (a kind that does not read back, or reads back fewer, exits 1). The key
// comes ONLY from the env var SHARINGU_IMPORT_KEY. A re-run is safe and resumes: a batch already filed previews as unchanged
// and is not filed again (a replay: only its preview is written). --max-batches <n> files only the first n batches selected (a probe; no read-back).
// --only limits what is written/filed; the whole import is still built and validated. The brain is only ever read.
// ROWS WRITTEN ARE COUNTED (import/cost.mjs): every call asks the worker for its own D1 row count, and the summary prints
// rows written and read per kind and in total. Against a LOCAL worker that count is the measure: it is kept in
// .runs/import-cost-<project>.json (rows per op of each kind). Against any other URL the run first ESTIMATES from that file
// (or --estimate-from <file>; --i-counted <n> states a count instead), refuses when the file does not hold for this source,
// reads the plan and the budget (tools/cf-budget.sh) and applies the plan's rule (import/cost.mjs verdict): on the free plan it
// REFUSES (exit 3, nothing filed) when the estimate is over what is left today, naming the days and the --only kinds that fit
// today; on Workers Paid it prints the estimated overage in dollars when the run goes past the period's included rows and
// refuses only the absurd (one run over 5,000,000 rows, or the period's overage past $5). --dry-run --estimate-from <file>
// prints the estimate alone.
// --overlay <ops.json> (repeatable, or a comma-separated list): knowledge ops filed AFTER the source, folded into the import by
// the door's own semantics (import/overlay.mjs: an upsert merges onto the op with its key or is added, a remove drops it, an
// overlay that files a goal root replaces the source's goal tree; an edit rewrites a text field in place, git-safe) — e.g.
// sharingu's architecture rewritten from the code.
// A source of `-` (import/read.mjs NO_SOURCE) is a project with no source: its --overlay files are the whole import (sprint 4,
// IMP: the demo project, the website's pitch). Such a project may be new to the org: when the door answers a read of it with
// project_forbidden, the importer creates it first with create_project {key, name: --name} (the admin's own tool, the call
// /control's add-project makes), then files, measures and reads back as for any project. A known project is never renamed.
// Text rules: the source's ops pass import/tidy.mjs first (no machine path; titles without markdown, email addresses or bare
// question ids); then EVERY op, overlays included, passes audit/text-rules.mjs — a machine path or credential-shaped text
// fails the run as a validation error does (named by item and field, never by the value).
import { writeFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { DataFault } from "./import/lib.mjs";
import { KINDS } from "./import/common.mjs";
import { readSource, LAYOUTS, NO_SOURCE } from "./import/read.mjs";
import { buildImport } from "./import/build.mjs";
import { toBatches, KIND_ORDER } from "./import/batch.mjs";
import { validateAll, MAX_OPS } from "./import/validate.mjs";
import { mcpClient, countStored, brief, pageOf, readPage, fileOps } from "./import/door.mjs";
import { readOverlay, applyOverlays } from "./import/overlay.mjs";
import { tidyOps } from "./import/tidy.mjs";
import { scanOps } from "./audit/text-rules.mjs";
import { isLocalUrl, costPath, readCost, writeCost, mergeCost, measured, estimate, staleOf, budgetLeft, verdict } from "./import/cost.mjs";

const USAGE = "usage: node tools/import-brain.mjs <brain-dir | -> --project <key> [--layout kit|bank|pack|board|code] [--board <dir>] [--renders <file|dir>] [--url <worker-url>] [--dry-run] [--out <ops.json>] [--only <kind,kind>] [--max-ops <n>] [--max-bytes <n>] [--max-batches <n>] [--estimate-from <cost.json>] [--i-counted <n>] [--overlay <ops.json>] [--name <name>]";

function parseArgs(argv) {
  const a = { flags: {}, overlays: [] };
  const takes = new Set(["--project", "--layout", "--board", "--renders", "--url", "--out", "--only", "--max-ops", "--max-bytes", "--max-batches", "--estimate-from", "--i-counted", "--name"]);
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--dry-run") a.flags.dry = true;
    else if (t === "-h" || t === "--help") a.help = true;
    else if (t === "--overlay") { if (i + 1 >= argv.length) die("--overlay needs a value"); a.overlays.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean)); }
    else if (takes.has(t)) { if (i + 1 >= argv.length) die(`${t} needs a value`); a.flags[t.slice(2)] = argv[++i]; }
    else if (t.startsWith("--")) die(`unknown flag ${t} (the key is read from SHARINGU_IMPORT_KEY, never an argument)`);
    else if (!a.dir) a.dir = t;
    else die(`unexpected argument ${t}`);
  }
  return a;
}
function die(msg, code = 2) { console.error(`import-brain: ${msg}\n${USAGE}`); process.exit(code); }

const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log(USAGE); process.exit(0); }
if (!args.dir) die("name a brain directory (or - for a project filed from its overlays alone)");
const project = args.flags.project;
if (!project) die("--project <key> is required");
const noSource = args.dir === NO_SOURCE;
if (noSource && !args.overlays.length) die("a project with no source (-) is filed from its --overlay files: name at least one");
if (args.flags.name != null && !noSource) die("--name creates a project with no source (-); a project with a source is created on Control");
const layout = args.flags.layout || null;
if (layout && !LAYOUTS.includes(layout)) die(`--layout ${layout}: not a layout (${LAYOUTS.join(", ")})`);
const url = args.flags.url ? args.flags.url.replace(/\/+$/, "") : null;
const dry = !!args.flags.dry || !url;
const only = args.flags.only ? args.flags.only.split(",").map((s) => s.trim()).filter(Boolean) : null;
if (only) for (const k of only) if (!KINDS.includes(k)) die(`--only: ${k} is not a kind (${KINDS.join(", ")})`);
// ops JSON per call: a guess at a safe request for a Worker (not a door rule) — tune with --max-bytes
const maxBytes = args.flags["max-bytes"] ? Number(args.flags["max-bytes"]) : 256_000;
if (!(maxBytes > 0)) die("--max-bytes must be a positive number");
const maxOps = args.flags["max-ops"] ? Number(args.flags["max-ops"]) : MAX_OPS;
if (!(Number.isInteger(maxOps) && maxOps >= 1 && maxOps <= MAX_OPS)) die(`--max-ops must be 1..${MAX_OPS} (the door's cap)`);
const maxBatches = args.flags["max-batches"] ? Number(args.flags["max-batches"]) : null;
if (maxBatches != null && !(Number.isInteger(maxBatches) && maxBatches >= 1)) die("--max-batches must be a whole number >= 1");
const iCounted = args.flags["i-counted"] != null ? Number(args.flags["i-counted"]) : null;
if (iCounted != null && !(Number.isInteger(iCounted) && iCounted >= 0)) die("--i-counted must be a whole number of rows written");
const local = url ? isLocalUrl(url) : false;
// the budget check: every non-local run, and any run when IMPORT_BUDGET_LEFT (the test seam) stands in for the budget
const budgeted = !!url && (!local || (process.env.IMPORT_BUDGET_LEFT != null && process.env.IMPORT_BUDGET_LEFT !== ""));

// ---- read (read-only) ------------------------------------------------------------------------------------------------
let src;
try { src = readSource(args.dir, { layout, board: args.flags.board, renders: args.flags.renders }); }
catch (e) { console.error(`import-brain: ${e instanceof DataFault ? "the brain kit refused the brain's data" : "could not read the source"}: ${e.message}`); process.exit(1); }

// ---- map (import/build.mjs: every mapper, merged) ----------------------------------------------------------------------
const built = src.built || buildImport(src);   // the code layout (import/read-code.mjs) builds its own ops
const { skips, notes, notImported, sourceOf, renders } = built;
// ---- the readers' shared text rules (import/tidy.mjs): no machine path, titles a person can read — on the source's ops ----
{ const t = tidyOps(built.ops); built.ops = t.ops; notes.push(...t.notes); }
// ---- the overlays (import/overlay.mjs): folded in after the source, in the order given ---------------------------------
let ops = built.ops, overlayReport = [];
if (args.overlays.length) {
  let ovs;
  try { ovs = args.overlays.map((p) => ({ path: resolve(p), ops: readOverlay(p) })); }
  catch (e) { console.error(`import-brain: ${e.message}`); process.exit(1); }
  const o = applyOverlays(ops, ovs);
  ops = o.ops; overlayReport = o.report;
  for (const [k, n] of Object.entries(o.source)) sourceOf[k] = (sourceOf[k] || 0) + n;
}

// ---- batch + validate (always the whole import) ----------------------------------------------------------------------
const all = toBatches(ops, project, { max: maxOps, maxBytes });
const errors = validateAll(all);
// the text rules (audit/text-rules.mjs): no machine path and no credential-shaped text in ANY stored string — a hit fails the
// run like a validation error, named by item and field, never by the value
for (const h of scanOps(ops)) errors.push({ kind: h.ref.split(" ")[0], key: `${h.ref.slice(h.ref.indexOf(" ") + 1)} (${h.field})`, error: `text rule ${h.group} · ${h.rule}: ${h.label}` });
const selected = only ? all.filter((b) => only.includes(b.kind)) : all;
const batches = maxBatches != null ? selected.slice(0, maxBatches) : selected;

// ---- the report --------------------------------------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(`import-brain · ${noSource ? "no source: the overlays alone" : src.dir}`);
console.log(`  project ${project}${src.brainKey && src.brainKey !== project ? `  (the source's own key: ${src.brainKey})` : ""} · layout ${src.layout}${layout || noSource ? "" : " (detected)"} · board ${src.board ? src.board.dir : "none"}${src.board && src.board.missing.length ? ` (missing: ${src.board.missing.join(", ")})` : ""}`);
console.log(`  mode ${dry ? "DRY RUN (nothing filed)" : `FILE → ${url}/mcp`}${only ? ` · only ${only.join(",")}` : ""} · batches of <= ${maxOps} ops, <= ${maxBytes} bytes of ops JSON`);
console.log("  validation: the door's own rules (src/knowledge/schema.js planKnowledge, as the owner, batch after batch) + the importer's card-kind rule");
console.log("");
console.log(`  ${pad("kind", 10)} ${lpad("source", 7)} ${lpad("ops", 6)} ${lpad("skipped", 8)} ${lpad("batches", 8)} ${lpad("bytes", 10)}`);
let tot = { s: 0, o: 0, k: 0, b: 0, y: 0 };
for (const kind of KIND_ORDER) {
  const s = sourceOf[kind] || 0, o = ops.filter((x) => x.kind === kind).length, k = skips.filter((x) => x.kind === kind && x.id !== "-").length;
  const bs = all.filter((b) => b.kind === kind), y = bs.reduce((n, b) => n + b.bytes, 0);
  const none = skips.find((x) => x.kind === kind && x.id === "-");
  if (!s && !o && !k && !none) continue;
  tot = { s: tot.s + s, o: tot.o + o, k: tot.k + k, b: tot.b + bs.length, y: tot.y + y };
  console.log(`  ${pad(kind, 10)} ${lpad(s, 7)} ${lpad(o, 6)} ${lpad(k, 8)} ${lpad(bs.length, 8)} ${lpad(y, 10)}${none ? `   (${none.reason})` : ""}${only && !only.includes(kind) ? "   [not selected by --only]" : ""}`);
}
console.log(`  ${pad("total", 10)} ${lpad(tot.s, 7)} ${lpad(tot.o, 6)} ${lpad(tot.k, 8)} ${lpad(tot.b, 8)} ${lpad(tot.y, 10)}`);
const biggest = ops.reduce((m, o) => Math.max(m, Buffer.byteLength(JSON.stringify(o))), 0);
// the screens' renders: from where, how many of each format, the bodies' bytes (as sent: the door sanitises and stores them)
const nStyles = ops.filter((o) => o.kind === "style").length;
if (renders && renders.from) console.log(`  renders from ${renders.from}: html ${renders.byFormat.html} · wireframe ${renders.byFormat.wireframe} · image ${renders.byFormat.image} · ${renders.bytes.toLocaleString("en-US")} bytes of bodies · ${nStyles} style(s)`);
else console.log(`  renders: none (${noSource ? "no source" : "this source holds no board html, wireframe spec or atlas shots"})`);
console.log(`  largest op ${biggest} bytes · largest batch ${Math.max(0, ...all.map((b) => b.bytes))} bytes`);

const grouped = new Map();
for (const s of skips.filter((x) => x.id !== "-")) {
  const k = `${s.kind}\u0000${s.reason}`;
  if (!grouped.has(k)) grouped.set(k, []);
  grouped.get(k).push(s.id);
}
if (grouped.size) {
  console.log("\n  skipped (kind · count · reason · e.g.)");
  for (const [k, ids] of grouped) { const [kind, reason] = k.split("\u0000"); console.log(`    ${pad(kind, 9)} ${lpad(ids.length, 4)}  ${reason}  — e.g. ${ids.slice(0, 3).join(", ")}`); }
}
if (overlayReport.length) {
  console.log("\n  overlays (filed after the source, the door's semantics: an upsert merges onto its key or is added)");
  for (const r of overlayReport) {
    console.log(`    ${r.path}: ${r.merged} merged onto the source's, ${r.added} added, ${r.removed} removed${r.edited ? `, ${r.edited} edited in place` : ""}${r.ignored ? `, ${r.ignored} remove(s) of a key the import does not file` : ""}${r.goalsDropped ? ` · it files its own goal root: ${r.goalsDropped} source goal(s) dropped (one root)` : ""}`);
    for (const f of r.editFaults || []) console.log(`    ! edit ${f}`);
  }
}
if (notes.length) {
  console.log("\n  notes (mapped, with a caveat)");
  for (const n of notes) console.log(`    ${pad(n.kind, 9)} ${lpad(n.n, 4)}  ${n.note}`);
}
if (notImported.length) {
  console.log("\n  sources not imported");
  for (const x of notImported) console.log(`    - ${x.what}: ${x.why}`);
}
// the longest text per field (the door caps nothing the importer knows of; this is what a cap would have to hold)
const longest = {};
for (const o of ops) for (const [f, v] of Object.entries(o.data)) {
  const n = typeof v === "string" ? v.length : v && typeof v === "object" ? JSON.stringify(v).length : 0;
  const k = `${o.kind}.${f}`;
  if (n > (longest[k] || 0)) longest[k] = n;
}
const byKind = {};
for (const [k, n] of Object.entries(longest)) { const [kind, f] = k.split("."); (byKind[kind] ||= []).push([f, n]); }
console.log("\n  longest value per field (chars; objects as JSON), top 4 per kind");
for (const kind of KIND_ORDER) if (byKind[kind]) console.log(`    ${pad(kind, 9)} ${byKind[kind].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, n]) => `${f} ${n}`).join(" · ")}`);

console.log("");
if (errors.length) {
  console.log(`  VALIDATION FAILED: ${errors.length} error(s)`);
  const g = new Map();
  for (const e of errors) { const k = `${e.kind}: ${e.error}`; if (!g.has(k)) g.set(k, []); g.get(k).push(e.key); }
  for (const [k, keys] of g) console.log(`    ${lpad(keys.length, 4)} × ${k}  — e.g. ${keys.slice(0, 3).join(", ")}`);
} else console.log(`  validation: every op and every batch passed (${ops.length} ops, ${all.length} batches)`);

if (args.flags.out) {
  const out = resolve(args.flags.out);
  const brainReal = src.dir ? realpathSync(src.dir) : null;
  if (brainReal && (out === brainReal || out.startsWith(brainReal + "/"))) die("--out must not be inside the brain (the brain is read-only)");
  writeFileSync(out, JSON.stringify({ project, brain: src.dir, brainKey: src.brainKey, only, batches }, null, 2) + "\n");
  console.log(`  wrote ${batches.length} batch(es) to ${out}`);
}
if (errors.length) process.exit(1);

// ---- what this run will WRITE (import/cost.mjs): from the local measure, before anything is sent -------------------------
const fmt = (n) => Number(n).toLocaleString("en-US");
let est = null;
if (budgeted || args.flags["estimate-from"] || iCounted != null) {
  const from = args.flags["estimate-from"] ? resolve(args.flags["estimate-from"]) : costPath(project);
  console.log("");
  if (iCounted != null) {
    est = { total: iCounted, rows: [], missing: [] };
    console.log(`  rows written: --i-counted ${fmt(iCounted)} (a stated count; no measure is read)`);
  } else {
    const cost = readCost(from);
    const why = cost ? staleOf(cost, batches, [src.dir, src.board && src.board.dir, args.flags.renders, ...args.overlays]) : `no measure at ${from}`;
    if (why) {
      console.log(`  REFUSED: no rows-written measure holds for this run: ${why}.`);
      console.log(`  Measure it on the local worker first (sh tools/dev-local.sh up, or this command with --url <a local worker>), or state a count with --i-counted <n>. Nothing was filed.`);
      process.exit(3);
    }
    est = estimate(cost, batches);
    if (est.missing.length) {
      console.log(`  REFUSED: the measure at ${from} holds no rows for kind(s) ${est.missing.join(", ")}: measure them on the local worker first. Nothing was filed.`);
      process.exit(3);
    }
    console.log(`  rows written, estimated from ${from} (measured ${cost.measuredAt} on ${cost.url}):`);
    for (const r of est.rows.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))) console.log(`    ${pad(r.kind, 9)} ${lpad(r.ops, 5)} ops × ${lpad(r.perOp, 6)} a op, ${lpad(r.calls, 4)} call(s)  ≈ ${lpad(fmt(r.rows), 8)}`);
  }
  console.log(`  this run will write about ${fmt(est.total)} rows (the worst case: a batch already filed replays and writes nothing)`);
}
if (dry) process.exit(0);
if (budgeted) {
  const v = verdict(est, budgetLeft(), KIND_ORDER);
  for (const l of v.lines) console.log("  " + l);
  if (!v.ok) process.exit(3);
}

// ---- file through the door ---------------------------------------------------------------------------------------------
const key = process.env.SHARINGU_IMPORT_KEY;
if (!key) die("--url needs the key in the env var SHARINGU_IMPORT_KEY (never an argument)");
const client = mcpClient(url, key);
const list = await client.rpc("tools/list", {});
if (list.error) { console.error(`  the door refused tools/list: ${list.error}`); process.exit(1); }
const names = new Set(((list.result && list.result.tools) || []).map((t) => t.name));
for (const t of ["preview", "file", "read"]) if (!names.has(t)) { console.error(`  the door offers no ${t} to this key (${names.size} tools listed)`); process.exit(1); }
// a project with no source may be new to the org: the door answers the owner's read of a project it does not hold (or holds
// archived) with project_forbidden, and then the project is created with --name, as the admin's agent creates one
if (noSource) {
  const probe = await readPage(client, project, "aim", null, 1);
  if (!probe.ok && probe.out && probe.out.error === "project_forbidden") {
    if (!args.flags.name) { console.error(`  project ${project} is not an active project of this org: name it with --name to create it. Nothing was filed.`); process.exit(1); }
    if (!names.has("create_project")) { console.error(`  project ${project} is not an active project of this org, and the door offers no create_project to this key. Nothing was filed.`); process.exit(1); }
    const c = await client.tool("create_project", { key: project, name: args.flags.name });
    if (!c.ok || !c.out || c.out.error) { console.error(`  the door refused create_project ${project}: ${brief(c.out)}. Nothing was filed.`); process.exit(1); }
    console.log(`\n  project ${project} created (create_project, named "${args.flags.name}"): ${c.out.note}`);
  } else if (!probe.ok) { console.error(`  the door refused a read of project ${project}: ${brief(probe.out)}. Nothing was filed.`); process.exit(1); }
}

// a local run measures: which kinds the project held before (a kind filed into an empty project measures what an import
// INSERTS, the worst case, and replaces the kept measure; one filed over stored rows measures updates and may only raise it)
const heldBefore = new Set();
if (local) {
  for (const kind of new Set(batches.map((b) => b.kind))) {
    const r = await readPage(client, project, kind, null, 1);
    const p = r.ok ? pageOf(r.out) : { n: 1 };
    if (!(p.n === 0)) heldBefore.add(kind);
  }
}
console.log(`\n  filing ${batches.length} batch(es)`);
// per kind: what was sent and what the worker counted (fresh = the batches that really wrote: not a replay, not unchanged)
const cost = {};
const zero = () => ({ ops: 0, calls: 0, written: 0, read: 0 });
const costOf = (kind) => (cost[kind] ||= { ...zero(), replays: 0, fresh: { ...zero(), refs: [] } });
// summary(): rows written and read per kind and in total, the worker's own count; a local run keeps its measure
function summary(done) {
  const kinds = KIND_ORDER.filter((k) => cost[k]);
  if (!kinds.length) return;
  console.log(`\n  rows (the worker's own D1 count, Server-Timing d1-rows)${done ? "" : " — the batches filed before the stop"}`);
  console.log(`    ${pad("kind", 9)} ${lpad("calls", 6)} ${lpad("ops", 6)} ${lpad("replays", 8)} ${lpad("written", 9)} ${lpad("read", 9)} ${lpad("written/op", 11)}`);
  const t = { ...zero(), replays: 0 };
  for (const k of kinds) {
    const c = cost[k];
    for (const f of ["ops", "calls", "written", "read", "replays"]) t[f] += c[f];
    console.log(`    ${pad(k, 9)} ${lpad(c.calls, 6)} ${lpad(c.ops, 6)} ${lpad(c.replays, 8)} ${lpad(fmt(c.written), 9)} ${lpad(fmt(c.read), 9)} ${lpad(c.fresh.ops ? (c.fresh.written / c.fresh.ops).toFixed(2) : "-", 11)}`);
  }
  console.log(`    ${pad("total", 9)} ${lpad(t.calls, 6)} ${lpad(t.ops, 6)} ${lpad(t.replays, 8)} ${lpad(fmt(t.written), 9)} ${lpad(fmt(t.read), 9)}`);
  const req = client.rows;
  console.log(`  rows written ${fmt(t.written)} · rows read ${fmt(t.read)} (filing)  ·  this run in all: written ${fmt(req.written)} · read ${fmt(req.read)} over ${req.calls} request(s)` +
    `${req.uncounted ? ` · ${req.uncounted} request(s) carried no count (an old worker?)` : ""}${req.unknown ? ` · ${req.unknown} statement(s) of unknown rows` : ""}`);
  if (local && !req.uncounted) {
    const m = measured(cost, (kind) => all.filter((b) => b.kind === kind).length, (kind) => !heldBefore.has(kind));
    if (Object.keys(m).length) {
      const path = costPath(project);
      writeCost(path, mergeCost(readCost(path), m, { project, source: src.dir, renders: args.flags.renders || null, url, maxOps, maxBytes, at: new Date().toISOString() }));
      console.log(`  measure kept: ${path} (${Object.keys(m).join(", ")})`);
    } else console.log("  measure: nothing new was written (every batch replayed or changed nothing), the kept measure stands");
  }
}
for (const [i, b] of batches.entries()) {
  const r = await fileOps(client, { project, ops: b.ops, clientRef: b.clientRef });
  const c = costOf(b.kind);
  c.calls += 1; c.ops += b.ops.length; c.written += r.rows.written; c.read += r.rows.read;
  if (!r.ok) {
    console.error(`  [${i + 1}/${batches.length}] ${b.kind} × ${b.ops.length} REFUSED (${b.clientRef}) — stopping; batches before it are filed`);
    console.error("  re-run the same command to resume: every batch already filed answers as a replay (its clientRef) and writes nothing again");
    console.error(typeof r.out === "string" ? r.out : JSON.stringify(r.out, null, 2));
    summary(false);
    process.exit(1);
  }
  const replay = !!r.replay, wrote = !!r.wrote;
  if (replay) c.replays += 1;
  if (wrote) { c.fresh.ops += b.ops.length; c.fresh.calls += 1; c.fresh.written += r.rows.written; c.fresh.read += r.rows.read; c.fresh.refs.push(b.clientRef); }
  console.log(`  [${i + 1}/${batches.length}] ${pad(b.kind, 9)} × ${lpad(b.ops.length, 3)}  ok  ${lpad(fmt(r.rows.written), 6)} written  ${brief(r.out)}`);
}
summary(true);

if (maxBatches != null && batches.length < selected.length) {
  console.log(`\n  --max-batches ${maxBatches}: filed ${batches.length} of ${selected.length} batch(es); no read-back (a kind is only partly filed). Re-run without it for the rest: these replay.`);
  process.exit(0);
}
// the read-back pages `read` for ids and small fields only (a list page leaves bodies and node data out): cheap
console.log("\n  source vs stored (read)");
let mismatch = 0;
for (const kind of KIND_ORDER) {
  if (only && !only.includes(kind)) continue;
  const built = ops.filter((o) => o.kind === kind).length;
  if (!built) continue;
  const s = await countStored(client, project, kind);
  const flag = s.n == null ? "? DID NOT READ BACK" : s.n === built ? "=" : s.n > built ? "> (rows filed before this import?)" : "< MISSING";
  if (s.n == null || s.n < built) mismatch++;
  console.log(`    ${pad(kind, 9)} built ${lpad(built, 5)}  stored ${lpad(s.n ?? "?", 5)}  ${flag}${s.note ? `  (${s.note})` : ""}`);
}
process.exit(mismatch ? 1 : 0);
