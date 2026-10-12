#!/usr/bin/env node
// tools/import-budget-selftest.mjs — the OFFLINE proof of the importer's write guard on BOTH plans (S4, 2026-10-02:
// the ryuklabs account is on Workers Paid; tools/import/cost.mjs budgetLeft + verdict, the functions tools/import-brain.mjs
// and tools/import-live.sh refuse with). No network: the REAL tools/cf-budget.sh is run under a stub `curl` first on PATH
// (fake credentials) that answers the plan (the subscriptions GET) and the usage (the GraphQL POST); the CLI's --check is
// run under the IMPORT_BUDGET_LEFT / IMPORT_BUDGET_PLAN seam.
//   free  the 95% line of a free day: fits · over (refused, the days named) · cf-budget refusing refuses
//   paid  inside the included rows (no overage) · past them (the overage priced in dollars, still files) · the period's
//         overage past $5 (refused) · one run over 5,000,000 rows (refused as absurd) · the plan read from the account,
//         and from CF_PLAN when the account cannot say · the ship candidate's five projects (164,641 rows) pass in one go
//   the measure's age: a source's .runs/ and .wrangler/ never count (newestIn) · for the code layout the source is what
//         tools/import/read-code.mjs reads (cost.mjs sourcePaths): a docs/ or plan change, a run log or a generated data
//         module does not stale a code measure, a change under engine/src/ does; a brain's docs still do · cost.mjs's
//         copy of the reader's paths agrees with read-code.mjs (its checkout test, its model file, its skipped modules)
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { budgetLeft, verdict, newestIn, staleOf, isCodeDir, CODE_MODEL, CODE_SKIP, PAID_ABSURD_ROWS, PAID_ROWS_WRITTEN } from "./import/cost.mjs";
import * as readCode from "./import/read-code.mjs";
import { utimesSync } from "node:fs";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`); } else { fail++; console.log(`  FAIL  ${m}`); } };

const td = mkdtempSync(join(tmpdir(), "import-budget-selftest-"));
mkdirSync(join(td, "bin"), { recursive: true });
writeFileSync(join(td, "env.sh"), "CLOUDFLARE_API_TOKEN=stub-token\nCLOUDFLARE_ACCOUNT_ID=stub-account\n");
writeFileSync(join(td, "bin", "curl"), `#!/bin/sh
case "$*" in
  */subscriptions*)
    case "$STUB_PLAN" in
      paid) echo '{"success":true,"result":[{"state":"Paid","current_period_start":"2026-09-07T00:00:00Z","rate_plan":{"id":"workers_paid","public_name":"Workers Paid"}}]}';;
      *) echo '{"success":false,"errors":[{"code":10000,"message":"Authentication error"}],"result":null}';;
    esac; exit 0;;
esac
printf '{"data":{"viewer":{"accounts":[{"workersInvocationsAdaptive":[{"sum":{"requests":100}}],"d1AnalyticsAdaptiveGroups":[{"sum":{"rowsRead":1000,"rowsWritten":%s}}]}]}}}' "$STUB_WRITTEN"
`, { mode: 0o755 });
const KEYS = ["PATH", "SHARINGU_ENV_PATH", "STUB_WRITTEN", "STUB_PLAN", "CF_PLAN", "IMPORT_BUDGET_LEFT", "IMPORT_BUDGET_PLAN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
const withStub = (vars, fn) => {
  const keep = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS.slice(2)) delete process.env[k];
  Object.assign(process.env, { PATH: join(td, "bin") + ":" + keep.PATH, SHARINGU_ENV_PATH: join(td, "env.sh") }, vars);
  try { return fn(); } finally { for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};
const est = (total) => ({ total, rows: [{ kind: "goal", rows: total }], missing: [] });
const text = (v) => v.lines.join("\n");

// ---- free (the account cannot say, no CF_PLAN: the default) ----------------------------------------------------------
const f1 = withStub({ STUB_WRITTEN: "40000" }, () => budgetLeft());
ok(f1.plan === "free" && f1.left === 55000 && f1.limit === 100000, `free: 95,000 under the guard less 40,000 written today (${JSON.stringify(f1)})`);
ok(verdict(est(50000), f1).ok, "free: 50,000 rows fit the 55,000 left");
const fv = verdict(est(164641), f1);
ok(!fv.ok && /split it over at least 3 days/.test(text(fv)), `free: the ship candidate's 164,641 rows refuse and name the days (${text(fv).slice(0, 200)})`);
const f2 = withStub({ STUB_WRITTEN: "96000" }, () => budgetLeft());
ok(!!f2.error && !verdict(est(1), f2).ok, `free: a guard refusing (96% of a day written) refuses the import (${f2.error})`);

// ---- paid, read from the account ----------------------------------------------------------------------------------
const p1 = withStub({ STUB_WRITTEN: "378216", STUB_PLAN: "paid" }, () => budgetLeft());
ok(p1.plan === "paid" && p1.limit === PAID_ROWS_WRITTEN && p1.left === PAID_ROWS_WRITTEN - 378216 && p1.from === "2026-09-07" && p1.planFrom === "account",
  `paid (the account): the period's included rows less what it wrote (${JSON.stringify(p1)})`);
const pv1 = verdict(est(164641), p1);
ok(pv1.ok && /fits: about 164,641 of the 49,621,784 included rows left, no overage/.test(text(pv1)), `paid: the ship candidate's five projects pass in one go (${text(pv1)})`);
const p2 = withStub({ STUB_WRITTEN: "96000", CF_PLAN: "paid" }, () => budgetLeft());
ok(p2.plan === "paid" && p2.planFrom === "CF_PLAN" && verdict(est(90000), p2).ok, `paid (CF_PLAN, the account cannot say): 96,000 written today is no refusal (${JSON.stringify(p2)})`);
const p3 = withStub({ STUB_WRITTEN: "56000000", STUB_PLAN: "paid" }, () => budgetLeft());
ok(!!p3.error && /overage is about \$6\.00/.test(p3.error) && !verdict(est(1), p3).ok, `paid: cf-budget refusing at the $5 overage line refuses the import (${p3.error})`);

// ---- paid, the arithmetic (the seam) ------------------------------------------------------------------------------
const seam = (left) => withStub({ IMPORT_BUDGET_LEFT: String(left), IMPORT_BUDGET_PLAN: "paid" }, () => budgetLeft());
const s1 = verdict(est(200000), seam(100000));
ok(s1.ok && /writes about 100,000 rows past them, an estimated overage of \$0\.10/.test(text(s1)), `paid: 100,000 rows past the included ones files and prints $0.10 (${text(s1)})`);
const s2 = verdict(est(165000), seam(-4900000));
ok(!s2.ok && /overage to about \$5\.07/.test(text(s2)) && /Nothing was filed/.test(text(s2)), `paid: a period already 4.9M over plus this run passes $5: refused (${text(s2)})`);
const s3 = verdict(est(PAID_ABSURD_ROWS + 1), seam(PAID_ROWS_WRITTEN));
ok(!s3.ok && /a run that size is a bug/.test(text(s3)), `paid: one run over ${PAID_ABSURD_ROWS.toLocaleString("en-US")} rows is refused as absurd even with the month empty`);
ok(verdict(est(PAID_ABSURD_ROWS), seam(PAID_ROWS_WRITTEN)).ok, "paid: exactly the absurd line still files");

// ---- the CLI (tools/import-live.sh's whole-plan check) ----------------------------------------------------------------
const cli = (n, vars) => spawnSync(process.execPath, [join(ENGINE, "tools", "import", "cost.mjs"), "--check", String(n), "--url", "https://example.invalid"],
  { encoding: "utf8", env: { ...process.env, CF_PLAN: "", ...vars } });
let r = cli(164641, { IMPORT_BUDGET_LEFT: "49000000", IMPORT_BUDGET_PLAN: "paid" });
ok(r.status === 0 && /plan: paid/.test(r.stdout) && /fits/.test(r.stdout), `cli: --check 164641 on paid passes (exit ${r.status}): ${r.stdout.trim()}`);
r = cli(164641, { IMPORT_BUDGET_LEFT: "95000" });
ok(r.status === 1 && /plan: free/.test(r.stdout) && /REFUSED/.test(r.stdout), `cli: --check 164641 on a free day refuses (exit ${r.status})`);
r = cli(6000000, { IMPORT_BUDGET_LEFT: "49000000", IMPORT_BUDGET_PLAN: "paid" });
ok(r.status === 1 && /a bug, not data/.test(r.stdout), `cli: --check 6,000,000 on paid refuses as absurd (exit ${r.status})`);

// ---- a source's run logs and local state never make the measure stale ------------------------------------------------
mkdirSync(join(td, "src", ".runs"), { recursive: true }); mkdirSync(join(td, "src", ".wrangler"), { recursive: true });
writeFileSync(join(td, "src", "a.js"), "x"); writeFileSync(join(td, "src", ".runs", "log.txt"), "y"); writeFileSync(join(td, "src", ".wrangler", "s"), "z");
utimesSync(join(td, "src", "a.js"), new Date(1000_000), new Date(1000_000));
const nw = newestIn([join(td, "src")]);
ok(String(nw.file).endsWith("/src/a.js"), `newestIn: a newer file under .runs/ or .wrangler/ is not the source's newest (${nw.file})`);

// ---- the code layout's freshness: what the reader reads, never docs/, .runs/ or the plan ---------------------------------
// a checkout with the reader's three files, the measure taken at T0 (ahead of the clock, so the engine's own model.json, which
// the reader reads, is older than it), every file of the checkout made before T0
const T0 = Date.now() + 10 * 86400e3, at = (dt) => new Date(T0 + dt * 1000);
const co = join(td, "checkout"), put = (rel, dt) => { mkdirSync(dirname(join(co, rel)), { recursive: true }); writeFileSync(join(co, rel), "x"); utimesSync(join(co, rel), at(dt), at(dt)); };
for (const f of ["engine/src/index.js", "engine/src/mcp.js", "contracts/door.json", "engine/boot.sql", "docs/plan/HANDOFF.md", "engine/src/doorcontract.js"]) put(f, -1000);
const cost = { measuredAt: new Date(T0).toISOString(), kinds: { node: { refs: ["measured"] } } };
const fresh = [{ clientRef: "not-measured" }];
ok(isCodeDir(co) && readCode.isCodeDir(co) && !isCodeDir(join(td, "src")) && !readCode.isCodeDir(join(td, "src")) && isCodeDir(resolve(ENGINE, "..")),
  "the code layout: cost.mjs tells a checkout as read-code.mjs isCodeDir does (this repo is one, a plain directory is not)");
ok(CODE_MODEL === readCode.CODE_MODEL && /\(doorcontract\|fontdata\|presetdata\|archclientdata\)\\\.js\$/.test(readFileSync(join(ENGINE, "tools", "import", "read-code.mjs"), "utf8"))
  && CODE_SKIP.test("/x/src/doorcontract.js") && CODE_SKIP.test("/x/src/presetdata.js") && CODE_SKIP.test("/x/src/fontdata.js") && CODE_SKIP.test("/x/src/archclientdata.js") && !CODE_SKIP.test("/x/src/index.js"),
  "the code layout: cost.mjs's model file and skipped modules are read-code.mjs's own");
ok(staleOf(cost, fresh, [co]) === null, "the code layout: a measure taken after every file the reader reads holds");
put("docs/plan/HANDOFF.md", 100); put("engine/.runs/gate.log", 100); put("engine/src/doorcontract.js", 100); put("README.md", 100);
ok(staleOf(cost, fresh, [co]) === null, "the code layout: a handoff commit, a run log, a regenerated data module and a README after the measure do NOT stale it");
put("engine/src/mcp.js", 200);
const why = staleOf(cost, fresh, [co]);
ok(/the source changed after the measure/.test(why || "") && /engine\/src\/mcp\.js/.test(why || ""), `the code layout: a change under engine/src/ stales it, the file named (${why})`);
put("engine/src/mcp.js", -1000); put("contracts/door.json", 300);
ok(/contracts\/door\.json/.test(staleOf(cost, fresh, [co]) || ""), "the code layout: a regenerated contract (the registries) stales it");
ok(staleOf(cost, [{ clientRef: "measured" }], [co]) === null, "the code layout: every batch measured by its ref holds whatever changed (unchanged rule)");
const brain = join(td, "brain"); mkdirSync(join(brain, "docs"), { recursive: true });
writeFileSync(join(brain, "docs", "a.md"), "x"); utimesSync(join(brain, "docs", "a.md"), at(100), at(100));
ok(/brain\/docs\/a\.md/.test(staleOf(cost, fresh, [brain]) || ""), "any other layout: unchanged — a newer file anywhere in a brain (its docs too) stales the measure");

rmSync(td, { recursive: true, force: true });
console.log(`import-budget-selftest: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
