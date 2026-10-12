// engine/tools/import/cost.mjs — what an import WRITES, counted, never guessed (docs/plan/BETA.md "Rows written are counted").
// The sprint-2 ship's import was estimated at 34,000 D1 rows written and wrote 149,380 (the free plan allows 100,000 a day):
// every trigger-kept tally, light, link and screen index, and every index entry, is a row written. So:
//   · a run against a LOCAL worker measures: the worker reports each request's own D1 rows in Server-Timing (import/door.mjs
//     sends `x-count-rows: 1`), the importer sums them per kind, and this file keeps the result as
//     .runs/import-cost-<project>.json (IMPORT_COST_DIR moves it): per kind the ops, calls and rows written of the batches
//     that really wrote (a replay writes nothing and measures nothing);
//   · a run against any other URL ESTIMATES first, from that file (or --estimate-from <file>, or --i-counted <n>): rows per
//     op of each kind × the ops it will send, plus the ledger row's cost for every call more than the measure made. The
//     file must be no older than the source (its newest file; for the code layout, only what the code reader reads:
//     sourcePaths below), else the source changed after the measure and the run refuses until it is measured again. A
//     batch already filed replays and writes nothing: the estimate is the worst case.
//   · it then reads the budget (tools/cf-budget.sh --json: the ONE reader of Cloudflare's plan and analytics) and applies the
//     PLAN's rule (2026-10-02: the ryuklabs account is on Workers Paid; any other account stays free by default):
//       free  REFUSES a run that would write more than is left today under the guard's 95% line, naming the days it needs
//             and the --only kinds that fit today;
//       paid  no daily limit: the run is checked against the rows the plan INCLUDES this billing period (50,000,000
//             written); a run that would go past them prints the estimated overage in dollars ($1.00 a million rows
//             written) and still files. It REFUSES only what is absurd: a single run estimated over PAID_ABSURD_ROWS
//             (5,000,000 rows, a tenth of a month's included writes and about thirty times the whole five-project import of
//             2026-10-02), or a run that would take the period's overage past PAID_MAX_OVERAGE_USD ($5, the plan's own fee;
//             tools/cf-budget.sh refuses at the same line).
// IMPORT_BUDGET_LEFT=<n> (a test seam) stands in for the budget read AND applies the check to any URL, a local one too;
// with IMPORT_BUDGET_PLAN=paid, <n> is the rows written the paid period still INCLUDES (negative: already over by that many).
//
//   node tools/import/cost.mjs --check <rows> [--url <u>]   the budget check alone (tools/import-live.sh: the whole plan,
//   before anything is sent). A local --url needs no budget (exit 0) unless IMPORT_BUDGET_LEFT stands in for it.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync, renameSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LIMIT_ROWS_WRITTEN = 100_000;   // the free plan, per UTC day, account-wide (tools/cf-budget.sh LIM_RW)
export const GUARD = 0.95;                   // tools/cf-budget.sh refuses at 95%: a run must leave the day under it
export const PAID_ROWS_WRITTEN = 50_000_000; // Workers Paid: rows written INCLUDED a billing period (tools/cf-budget.sh)
export const PAID_USD_PER_MILLION_WRITTEN = 1.0;
export const PAID_ABSURD_ROWS = 5_000_000;   // one run over this is a bug, not data (see the header)
export const PAID_MAX_OVERAGE_USD = 5;       // the period's overage a run may reach (the plan's own monthly fee)
// The rows one batch adds beyond its items: the ledger row with its indexes and tally triggers (24, measured on the local
// worker on 2026-10-01: a doc batch of 1, 2, 10 and 50 docs wrote 2 rows a doc plus 24) and, since D5 (2026-10-02), the
// batch's preview row (2: sharingu's 23 batches wrote 46 rows more, saruspay's 75 batches 150 more, than through the
// folded direct write). Added for every call a run makes beyond what the measure's calls cover (smaller batches).
export const LEDGER_ROWS = 26;

export const costDir = () => process.env.IMPORT_COST_DIR || join(ENGINE, ".runs");
export const costPath = (project) => join(costDir(), `import-cost-${project}.json`);

export function isLocalUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "0.0.0.0" || /^127\./.test(h);
  } catch { return false; }
}

// measured(perKind, allBatchesOf, wasEmpty) -> the cost of this run's batches that really wrote: { kind: { ops, calls,
// written, read, all, refs } }. perKind: { kind: { …, fresh: { ops, calls, written, read, refs } } } as the importer sums it.
// `all` is true when the kind was EMPTY before the run and every batch of it that the whole import holds wrote in this run:
// a complete measure of what the kind's import inserts.
export function measured(perKind, allBatchesOf, wasEmpty = () => false) {
  const out = {};
  for (const [kind, k] of Object.entries(perKind)) {
    if (!k.fresh.calls) continue;
    out[kind] = { ops: k.fresh.ops, calls: k.fresh.calls, written: k.fresh.written, read: k.fresh.read, all: k.fresh.calls === allBatchesOf(kind) && wasEmpty(kind), refs: k.fresh.refs };
  }
  return out;
}

// mergeCost(old, now, meta) -> the file's next content. A complete measure of a kind replaces the old one; a partial one (a
// re-run where only some batches were new) keeps whichever rate is HIGHER, so the file never understates a kind.
export function mergeCost(old, now, meta) {
  const kinds = { ...((old && old.kinds) || {}) };
  for (const [kind, m] of Object.entries(now)) {
    const rate = m.written / m.ops, prev = kinds[kind];
    const entry = { ops: m.ops, calls: m.calls, written: m.written, read: m.read, perOp: round2(rate), complete: m.all, measuredAt: meta.at,
      refs: m.all || !prev ? [...m.refs] : [...new Set([...(prev.refs || []), ...m.refs])] };
    if (!prev || m.all || !(prev.ops > 0) || rate >= prev.written / prev.ops) kinds[kind] = entry;
    else kinds[kind] = { ...prev, refs: entry.refs };
  }
  return { project: meta.project, source: meta.source, renders: meta.renders || null, url: meta.url, maxOps: meta.maxOps, maxBytes: meta.maxBytes,
    measuredAt: meta.at, ledgerRows: LEDGER_ROWS, kinds };
}
const round2 = (x) => Math.round(x * 100) / 100;

export function readCost(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
export function writeCost(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, path);
}

// THE CODE LAYOUT'S SOURCE (sharingu: tools/import/read-code.mjs builds its model and checks from this repo's checkout). Its
// source is what that reader reads, never the whole checkout: a commit to docs/, a run log or the plan changes no op it builds.
// The reader reads, under the checkout <dir>:
//   engine/src/**/*.js           the code, scanned — but for the four generated modules it skips (doorcontract.js,
//                                fontdata.js, presetdata.js, archclientdata.js: CODE_SKIP, read-code.mjs scanCode's own test)
//   contracts/door.json          the registries (generated from engine/src/index.js)
//   engine/boot.sql              the tables, their indexes and triggers
//   tools/import/code-model/model.json   the little the code cannot say (the engine's own, CODE_MODEL in read-code.mjs)
//   engine/<model.services.file> the architecture its services are linked to (tools/walkthrough/sharingu-architecture.ops.json)
// The importer's own code is not the source, as for every other layout. A checkout is told by read-code.mjs isCodeDir's own
// three files. The paths are kept here, not imported: this file runs alone (tools/ship-selftest.sh copies it into a throwaway
// tree), and tools/import-budget-selftest.mjs holds the two in step.
export const CODE_MODEL = join(ENGINE, "tools", "import", "code-model", "model.json");
export const isCodeDir = (dir) => ["engine/src/index.js", "contracts/door.json", "engine/boot.sql"].every((f) => {
  try { return statSync(join(dir, f)).isFile(); } catch { return false; }
});
export const CODE_SKIP = /\/(doorcontract|fontdata|presetdata|archclientdata)\.js$/;
const jsUnder = (d) => readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
  .flatMap((e) => (e.isDirectory() ? jsUnder(join(d, e.name)) : e.name.endsWith(".js") ? [join(d, e.name)] : []));
export function codeSources(dir) {
  let arch = null;
  try { const f = JSON.parse(readFileSync(CODE_MODEL, "utf8")).services?.file; if (f) arch = join(dir, "engine", f); } catch { arch = null; }
  return [...jsUnder(join(dir, "engine", "src")).filter((p) => !CODE_SKIP.test(p)), join(dir, "contracts", "door.json"),
    join(dir, "engine", "boot.sql"), CODE_MODEL, arch].filter((p) => p && existsSync(p));
}
// sourcePaths(paths) -> the paths whose newest file dates the source: a checkout of this repo becomes what its reader reads;
// every other path (a brain, a board, a renders file, an overlay) stays as given
export const sourcePaths = (paths) => paths.filter(Boolean).flatMap((p) => (isCodeDir(p) ? codeSources(p) : [p]));

// newestIn(paths) -> { at: ms, file } — the newest file under the source (directories walked; .git, node_modules and the
// local run and state folders skipped: a brain is a checkout too)
const SKIP_DIRS = new Set([".git", "node_modules", ".runs", ".wrangler"]);
export function newestIn(paths) {
  let best = { at: 0, file: null };
  const seen = new Set();
  const walk = (p) => {
    let real;
    try { real = realpathSync(p); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    let st;
    try { st = statSync(real); } catch { return; }
    if (st.isDirectory()) {
      for (const n of readdirSync(real)) if (!SKIP_DIRS.has(n)) walk(join(real, n));
    } else if (st.mtimeMs > best.at) best = { at: st.mtimeMs, file: p };
  };
  for (const p of paths.filter(Boolean)) walk(p);
  return best;
}

// staleOf(cost, batches, sources) -> null when the measure holds for what this run sends, else why not. It holds when the
// file is newer than every file of the source (sourcePaths: for the code layout, what its reader reads), or when every
// batch this run sends was itself measured (its clientRef, a hash of the batch's content, is in the file: the very same ops).
export function staleOf(cost, batches, sources) {
  if (!cost || !cost.kinds) return "no measure";
  const measuredRefs = new Set(Object.values(cost.kinds).flatMap((k) => k.refs || []));
  if (batches.every((b) => measuredRefs.has(b.clientRef))) return null;
  const newest = newestIn(sourcePaths(sources));
  const at = Date.parse(cost.measuredAt || "");
  if (Number.isFinite(at) && newest.at <= at) return null;
  return `the source changed after the measure (${newest.file} at ${new Date(newest.at).toISOString()}; measured ${cost.measuredAt || "?"}) and ${batches.filter((b) => !measuredRefs.has(b.clientRef)).length} of the ${batches.length} batch(es) were never measured`;
}

// estimate(cost, batches) -> { total, rows: [{ kind, ops, calls, rows, perOp }], missing: [kind] }
// rows per op of each kind × the ops this run sends, plus LEDGER_ROWS for each call beyond the measure's calls per op.
export function estimate(cost, batches) {
  const by = new Map();
  for (const b of batches) {
    const e = by.get(b.kind) || { kind: b.kind, ops: 0, calls: 0 };
    e.ops += b.ops.length; e.calls += 1;
    by.set(b.kind, e);
  }
  const rows = [], missing = [];
  let total = 0;
  for (const e of by.values()) {
    const m = cost && cost.kinds && cost.kinds[e.kind];
    if (!m || !(m.ops > 0)) { missing.push(e.kind); continue; }
    const perOp = m.written / m.ops;
    const extraCalls = Math.max(0, e.calls - (m.calls / m.ops) * e.ops);
    const n = Math.ceil(perOp * e.ops + extraCalls * ((cost && cost.ledgerRows) || LEDGER_ROWS));
    rows.push({ kind: e.kind, ops: e.ops, calls: e.calls, rows: n, perOp: round2(perOp) });
    total += n;
  }
  return { total, rows, missing };
}

// budgetLeft() -> { plan, left, used, limit, cap, … } | { error }. IMPORT_BUDGET_LEFT stands in for the read (a test seam;
// IMPORT_BUDGET_PLAN=paid makes it a paid period). Otherwise tools/cf-budget.sh --json, the guard itself (it reads the plan
// and Cloudflare's analytics; nothing here repeats those calls). free: left = the guard's 95% line minus what the account
// wrote today. paid: left = the rows written the billing period still includes (never below 0; overUsed = how far past
// them the period already is). Its exit 2 (free: a metric over the line; paid: the overage line) and 3 (unreadable) both
// refuse.
export function budgetLeft() {
  const fake = process.env.IMPORT_BUDGET_LEFT;
  if (fake != null && fake !== "") {
    const n = Number(fake), paid = process.env.IMPORT_BUDGET_PLAN === "paid";
    if (!Number.isFinite(n) || (!paid && n < 0)) return { error: `IMPORT_BUDGET_LEFT=${fake} is not a number of rows` };
    if (paid) return { plan: "paid", left: Math.max(0, Math.floor(n)), overUsed: Math.max(0, -Math.floor(n)), used: null, limit: PAID_ROWS_WRITTEN, fake: true };
    return { plan: "free", left: Math.floor(n), used: null, limit: LIMIT_ROWS_WRITTEN, cap: Math.floor(LIMIT_ROWS_WRITTEN * GUARD), fake: true };
  }
  const r = spawnSync("sh", [join(ENGINE, "tools", "cf-budget.sh"), "--json"], { encoding: "utf8", timeout: 60_000 });
  let d = null;
  try { d = JSON.parse(String(r.stdout || "").trim().split("\n").pop()); } catch { d = null; }
  if (r.status === 3 || !d) return { error: `tools/cf-budget.sh could not read the usage (exit ${r.status}): ${String(r.stderr || "").trim().split("\n").pop() || "no answer"}` };
  const plan = d.plan === "paid" ? "paid" : "free";
  const used = Number(d.rowsWritten) || 0;
  if (plan === "paid") {
    const limit = Number(d.limits && d.limits.rowsWritten) || PAID_ROWS_WRITTEN;
    if (r.status === 2) return { error: `tools/cf-budget.sh refuses live runs: this billing period's overage is about $${Number(d.overageUsd || 0).toFixed(2)} (${String(r.stderr || "").trim().split("\n").pop()})`, plan, used, limit };
    return { plan, left: Math.max(0, limit - used), overUsed: Math.max(0, used - limit), used, limit, from: d.window && d.window.from, planFrom: d.planFrom };
  }
  const limit = Number(d.limits && d.limits.rowsWritten) || LIMIT_ROWS_WRITTEN;
  const cap = Math.floor(limit * GUARD);
  if (r.status === 2) return { error: `tools/cf-budget.sh refuses live runs today (${String(r.stderr || "").trim().split("\n").pop()})`, plan, used, limit, cap };
  return { plan, left: Math.max(0, cap - used), used, limit, cap, planFrom: d.planFrom };
}

// paidVerdict(est, budget) -> { ok, lines } — the paid plan's rule (see the header): the included rows, the overage priced,
// the absurd refused.
function paidVerdict(est, budget) {
  const f = (n) => Number(n).toLocaleString("en-US");
  const usd = (rows) => (rows / 1e6) * PAID_USD_PER_MILLION_WRITTEN;
  const lines = [`paid plan: ${f(budget.left)} rows written still included this billing period` +
    (budget.fake ? " (IMPORT_BUDGET_LEFT, a test seam)" : ` (${f(budget.used)} of ${f(budget.limit)} written since ${budget.from || "the period's start"}, account-wide)`)];
  if (est.total > PAID_ABSURD_ROWS) {
    lines.push(`REFUSED: this run would write about ${f(est.total)} rows, over the ${f(PAID_ABSURD_ROWS)} one run may write on the paid plan (a tenth of a month's included writes: a run that size is a bug, not data). Nothing was filed.`);
    return { ok: false, lines };
  }
  const overNow = budget.overUsed || 0;
  const overAfter = overNow + Math.max(0, est.total - budget.left);
  if (overAfter === 0) { lines.push(`fits: about ${f(est.total)} of the ${f(budget.left)} included rows left, no overage`); return { ok: true, lines }; }
  const cost = usd(overAfter), mine = usd(overAfter - overNow);
  if (cost > PAID_MAX_OVERAGE_USD) {
    lines.push(`REFUSED: this run would take the period's overage to about $${cost.toFixed(2)} (${f(overAfter)} rows written past the included ${f(budget.limit)}), over the $${PAID_MAX_OVERAGE_USD} line. Nothing was filed.`);
    return { ok: false, lines };
  }
  lines.push(`over the included rows: this run writes about ${f(overAfter - overNow)} rows past them, an estimated overage of $${mine.toFixed(2)} ($${PAID_USD_PER_MILLION_WRITTEN.toFixed(2)} a million rows written; the period's overage after it about $${cost.toFixed(2)}) — it files`);
  return { ok: true, lines };
}

// verdict(est, budget, order) -> { ok, lines } — the words the importer prints. order: the kinds in filing order.
export function verdict(est, budget, order = []) {
  const f = (n) => Number(n).toLocaleString("en-US");
  const lines = [];
  if (budget.error) return { ok: false, lines: [`REFUSED: ${budget.error}. Nothing was filed.`] };
  if (budget.plan === "paid") return paidVerdict(est, budget);
  lines.push(`today's budget: ${f(budget.left)} rows written left under the guard's ${Math.round(GUARD * 100)}% line` +
    (budget.fake ? " (IMPORT_BUDGET_LEFT, a test seam)" : ` (${f(budget.used)} of ${f(budget.limit)} written today, account-wide)`));
  if (est.total <= budget.left) { lines.push(`fits: about ${f(est.total)} of the ${f(budget.left)} left`); return { ok: true, lines }; }
  const perDay = budget.cap;
  const days = 1 + Math.ceil(Math.max(0, est.total - budget.left) / perDay);
  lines.push(`REFUSED: this run would write about ${f(est.total)} rows and only ${f(budget.left)} are left today. Nothing was filed.`);
  lines.push(`  split it over at least ${days} days (today's ${f(budget.left)}, then ${f(perDay)} rows a day under the guard), with --only, in this kind order:`);
  // the kinds in filing order (a later kind may name an earlier one), packed into days greedily
  const rows = [...est.rows].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  let room = budget.left, day = 1, cur = [];
  const plan = [];
  for (const r of rows) {
    if (r.rows > room && cur.length) { plan.push({ day, kinds: cur }); day++; cur = []; room = perDay; }
    cur.push(r); room -= r.rows;
  }
  if (cur.length) plan.push({ day, kinds: cur });
  for (const p of plan) {
    const n = p.kinds.reduce((s, r) => s + r.rows, 0);
    lines.push(`    ${p.day === 1 ? "today " : `day ${p.day} `} --only ${p.kinds.map((r) => r.kind).join(",")}   about ${f(n)} rows${n > (p.day === 1 ? budget.left : perDay) ? "  (one kind alone is over a day: lower it with --max-batches and resume tomorrow, the filed batches replay)" : ""}`);
  }
  const fitToday = plan[0] && plan[0].kinds.reduce((s, r) => s + r.rows, 0) <= budget.left ? plan[0].kinds.map((r) => r.kind) : [];
  lines.push(fitToday.length ? `  fits today: --only ${fitToday.join(",")}` : "  fits today: nothing whole (wait for the reset at 00:00 UTC)");
  return { ok: false, lines };
}

// ---- the CLI: the budget check alone ------------------------------------------------------------------------------------
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const arg = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
  const n = Number(arg("--check")), url = arg("--url");
  if (!(Number.isFinite(n) && n >= 0)) { console.error("usage: node tools/import/cost.mjs --check <rows> [--url <worker-url>]"); process.exit(2); }
  if (url && isLocalUrl(url) && !(process.env.IMPORT_BUDGET_LEFT != null && process.env.IMPORT_BUDGET_LEFT !== "")) {
    console.log(`  ${url} is a local worker: it costs Cloudflare nothing, no budget is read`);
    process.exit(0);
  }
  const b = budgetLeft();
  const v = verdict({ total: n, rows: [] }, b);
  if (b.plan) console.log(`  plan: ${b.plan}${b.planFrom ? ` (${b.planFrom === "account" ? "read from the account" : b.planFrom === "CF_PLAN" ? "from CF_PLAN" : "the default"})` : ""}`);
  for (const l of v.lines.filter((l) => !/^\s+(split|today|day|fits today)/.test(l))) console.log("  " + l);
  process.exit(v.ok ? 0 : 1);
}
