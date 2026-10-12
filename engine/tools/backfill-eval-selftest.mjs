// tools/backfill-eval-selftest.mjs — build0925:backfill-eval-integrity (2026-09-25).
//
// THE DEFECT this pins: POST /backfill?eval=1 (src/core.js backfillReports, eval mode) selected
// "report IS NULL" with NO eval filter, so a suite run linked eval=0 PRODUCTION transmissions to an
// eval-batch-report-* artifact that self_clean (src/admin.js clean-eval) then deleted — 213 rows on
// ryuklabs-agent-r left pointing at an artifact that no longer existed (repaired by migrate-036.sql).
//
// Runs the ACTUAL exports — backfillReports from src/core.js, runControlAction from src/admin.js,
// and migrate-036.sql's own text — against a REAL SQLite DB (node:sqlite, boot.sql applied verbatim,
// foreign keys ON), the same harness shape as tools/clean-eval-check-results-selftest.mjs. Never a
// hand-typed mirror of the SQL under test.
//
// Cases:
//   A. eval mode never touches an eval=0 row — the row stays report-less; the eval=1 row is covered
//      by an eval-* artifact. FAILS on the pre-fix core.js (the eval=0 row is linked).
//   B. production mode never touches an eval=1 row, and banks a non-eval batch-report-* artifact.
//   C. eval mode with only eval=0 rows report-less backfills 0 and banks NOTHING (no artifact row,
//      no R2 put). FAILS on the pre-fix core.js.
//   D. the whole recurrence path end to end — eval backfill, then clean-eval — leaves zero surviving
//      rows with a dangling report. FAILS on the pre-fix code.
//   E. clean-eval un-links before it deletes: a legacy eval=0 row already pointing at an eval-*
//      artifact is left report-less (NULL), a row on a production artifact is untouched.
//   F. migrate-036.sql: dangling -> NULL, a live link untouched, NULL stays NULL, row count unchanged,
//      a replay changes nothing.
//   G. (G2 H2, the independent review) one report PER PROJECT, owned by the org's owner, stamped with its project; a member's
//      oldest filing never makes the report theirs; a knowledge write is not covered; mayReadArtifact reads a cron report
//      under its project's rule (a seat on it; an org-level one, the owner only) and a person's own file grouped 'report' as
//      theirs. FAILS on the pre-fix core.js (one report for both projects, owned by the member).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { backfillReports, mayReadArtifact } from "../src/core.js";
import { runControlAction } from "../src/admin.js";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const boot = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const MIGRATE_036 = readFileSync(join(ENGINE, "migrate-036.sql"), "utf8");

// A thin D1 shim over node:sqlite (the surface both exports call) + an R2 stub that records puts
// and answers get() with null (getTenantConfig then falls back to its defaults).
function makeEnv(db) {
  const puts = [];
  const DB = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const wrap = (args) => ({
        run: async () => { const info = stmt.run(...args); return { meta: { changes: info.changes } }; },
        first: async () => stmt.get(...args),
        all: async () => ({ results: stmt.all(...args) }),
      });
      return { ...wrap([]), bind: (...args) => wrap(args) };
    },
  };
  const bucket = {
    put: async (key) => { puts.push(key); },
    get: async () => null,
    list: async () => ({ objects: [], truncated: false }),
    delete: async () => {},
  };
  return { env: asOrg({ DB, BRAIN: { ...bucket, raw: bucket } }), puts };   // a request signed in to org 1 (src/data.js)
}

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(boot);
  db.prepare("INSERT INTO people (id,name,role,key_hash,created_at,org) VALUES (?,?,?,?,?,1)")
    .run("p1", "Test Person", "owner", "hash-p1", "2026-09-25T00:00:00.000Z");
  return db;
}
function seedTx(db, id, evalFlag, at, report = null) {
  db.prepare("INSERT INTO transmission (id,submitter,lane,route,status,eval,report,created_at,org) VALUES (?,?,?,?,?,?,?,?,1)")
    .run(id, "p1", "code", "auto", "received", evalFlag, report, at);
}
function seedArtifact(db, id, title, groupTag = "report") {
  db.prepare("INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,1)")
    .run(id, "p1", "html", title, "inbox/artifacts/x/" + id + ".html", "0".repeat(64), 1, groupTag, "2026-09-25T00:00:00.000Z");
}
const reportOf = (db, id) => db.prepare("SELECT report FROM transmission WHERE id = ?").get(id)?.report ?? null;
const titleOf = (db, id) => db.prepare("SELECT title FROM artifacts WHERE id = ?").get(id)?.title ?? null;
const DANGLING = "SELECT COUNT(*) AS n FROM transmission t WHERE t.report IS NOT NULL AND NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.id = t.report)";

let fail = 0, checks = 0;
const eq = (got, want, label) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    fail = 1;
  }
};

// A — eval mode never touches an eval=0 row (the prod row is OLDER, so the pre-fix ORDER BY
// created_at ASC would reach it first)
{
  const db = freshDb();
  seedTx(db, "T-prod", 0, "2026-09-01T00:00:00.000Z");
  seedTx(db, "T-eval", 1, "2026-09-02T00:00:00.000Z");
  const { env } = makeEnv(db);
  const res = await backfillReports(env, "https://example.invalid", true);
  eq(reportOf(db, "T-prod"), null, "A: eval-mode backfill leaves the eval=0 PRODUCTION row report-less");
  eq(res.backfilled, 1, "A: eval-mode backfill covers exactly the one eval=1 row");
  eq(reportOf(db, "T-eval"), res.report ?? "(none)", "A: the eval=1 row carries the batch's report id");
  eq(String(titleOf(db, res.report) || "").startsWith("eval-batch-report-"), true, "A: the eval batch artifact is eval-titled (so self_clean owns it)");
}

// B — production mode never touches an eval=1 row
{
  const db = freshDb();
  seedTx(db, "T-eval", 1, "2026-09-01T00:00:00.000Z");
  seedTx(db, "T-prod", 0, "2026-09-02T00:00:00.000Z");
  const { env } = makeEnv(db);
  const res = await backfillReports(env, "https://example.invalid", false);
  eq(reportOf(db, "T-eval"), null, "B: production backfill leaves the eval=1 row report-less");
  eq(res.backfilled, 1, "B: production backfill covers exactly the one eval=0 row");
  eq(reportOf(db, "T-prod"), res.report ?? "(none)", "B: the eval=0 row carries the batch's report id");
  eq(String(titleOf(db, res.report) || "").startsWith("batch-report-"), true, "B: the production batch artifact is NOT eval-titled");
}

// C — eval mode with only production rows report-less banks nothing at all
{
  const db = freshDb();
  seedTx(db, "T-prod-1", 0, "2026-09-01T00:00:00.000Z");
  seedTx(db, "T-prod-2", 0, "2026-09-02T00:00:00.000Z");
  const { env, puts } = makeEnv(db);
  const res = await backfillReports(env, "https://example.invalid", true);
  eq(res.backfilled, 0, "C: eval-mode backfill with no eval=1 row report-less backfills 0");
  eq(db.prepare("SELECT COUNT(*) AS n FROM artifacts").get().n, 0, "C: no artifact row is banked");
  eq(puts.length, 0, "C: nothing is written to R2");
  eq([reportOf(db, "T-prod-1"), reportOf(db, "T-prod-2")], [null, null], "C: both production rows stay report-less");
}

// D — the recurrence path end to end: eval backfill, then the suites' own clean-eval
{
  const db = freshDb();
  seedTx(db, "T-prod", 0, "2026-09-01T00:00:00.000Z");
  seedTx(db, "T-eval", 1, "2026-09-02T00:00:00.000Z");
  const { env } = makeEnv(db);
  await backfillReports(env, "https://example.invalid", true);
  await runControlAction({ action: "clean-eval", fd: null, personId: null, env, reader: null });
  eq(!!db.prepare("SELECT 1 FROM transmission WHERE id = 'T-prod'").get(), true, "D: the production row survives clean-eval");
  eq(db.prepare(DANGLING).get().n, 0, "D: after eval backfill + clean-eval, zero surviving rows carry a dangling report");
}

// E — clean-eval un-links before it deletes (legacy state the pre-fix code already produced)
{
  const db = freshDb();
  seedArtifact(db, "A-eval", "eval-batch-report-2026-09-17");
  seedArtifact(db, "A-prod", "batch-report-2026-09-17");
  seedTx(db, "T-legacy", 0, "2026-09-01T00:00:00.000Z", "A-eval");
  seedTx(db, "T-good", 0, "2026-09-02T00:00:00.000Z", "A-prod");
  const { env } = makeEnv(db);
  await runControlAction({ action: "clean-eval", fd: null, personId: null, env, reader: null });
  eq(titleOf(db, "A-eval"), null, "E: the eval artifact is still deleted");
  eq(reportOf(db, "T-legacy"), null, "E: the row that pointed at it is un-linked to NULL (a backfill target), not left dangling");
  eq(reportOf(db, "T-good"), "A-prod", "E: a row on a production artifact is untouched");
  eq(db.prepare(DANGLING).get().n, 0, "E: zero dangling reports after the sweep");
}

// F — migrate-036.sql, applied twice
{
  const db = freshDb();
  seedArtifact(db, "A-live", "batch-report-2026-09-20");
  seedTx(db, "T-dangling", 0, "2026-09-01T00:00:00.000Z", "A-deleted-long-ago");
  seedTx(db, "T-live", 0, "2026-09-02T00:00:00.000Z", "A-live");
  seedTx(db, "T-null", 0, "2026-09-03T00:00:00.000Z", null);
  const count = () => db.prepare("SELECT COUNT(*) AS n FROM transmission").get().n;
  eq(db.prepare(DANGLING).get().n, 1, "F: the fixture really carries one dangling report before the migration");
  db.exec(MIGRATE_036);
  eq(db.prepare(DANGLING).get().n, 0, "F: migrate-036 leaves zero dangling reports");
  eq([reportOf(db, "T-dangling"), reportOf(db, "T-live"), reportOf(db, "T-null")], [null, "A-live", null],
    "F: dangling -> NULL, a live link untouched, NULL stays NULL");
  eq(count(), 3, "F: no row added or removed");
  const before = JSON.stringify(db.prepare("SELECT id, report FROM transmission ORDER BY id").all());
  db.exec(MIGRATE_036);
  eq(JSON.stringify(db.prepare("SELECT id, report FROM transmission ORDER BY id").all()), before, "F: a replay changes nothing");
}

// G — one report per project, owned by no filer (G2 H2)
{
  const db = freshDb();
  const at = "2026-09-25T00:00:00.000Z";
  for (const k of ["alpha", "beta"]) db.prepare("INSERT INTO projects (key,name,created_at) VALUES (?,?,?)").run(k, k, at);
  for (const [id, role] of [["m-alpha", "member"], ["m-beta", "member"], ["p-alpha", "partner"]]) db.prepare("INSERT INTO people (id,name,role,key_hash,created_at,org) VALUES (?,?,?,?,?,1)").run(id, id, role, "hash-" + id, at);
  for (const [pid, k] of [["m-alpha", "alpha"], ["m-beta", "beta"], ["p-alpha", "alpha"]]) db.prepare("INSERT INTO project_seats (person_id,project_key,created_at) VALUES (?,?,?)").run(pid, k, at);
  const tx = (id, who, project, when, kind = "note") => db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,1)")
    .run(id, who, "leader", kind, id + " what", "auto", "received", 0, project, when);
  tx("T-a1", "m-alpha", "alpha", "2026-09-01T00:00:00.000Z");   // the OLDEST: the pre-fix code made m-alpha the owner of everything
  tx("T-b1", "m-beta", "beta", "2026-09-02T00:00:00.000Z");
  tx("T-a2", "p-alpha", "alpha", "2026-09-03T00:00:00.000Z");
  tx("T-k1", "p1", "alpha", "2026-09-04T00:00:00.000Z", "knowledge");
  const { env } = makeEnv(db);
  const res = await backfillReports(env, "https://example.invalid", false);
  const ra = reportOf(db, "T-a1"), rb = reportOf(db, "T-b1");
  eq([res.backfilled, ra === reportOf(db, "T-a2"), ra !== rb, reportOf(db, "T-k1")], [3, true, true, null], "G: three rows, one report for alpha's two and another for beta's; the knowledge write is not covered");
  const art = (id) => db.prepare("SELECT person_id, project, group_tag, r2_key, org FROM artifacts WHERE id = ?").get(id) || {};
  eq([art(ra).person_id, art(ra).project, art(rb).person_id, art(rb).project], ["p1", "alpha", "p1", "beta"], "G: each report is the owner's, stamped with its own project (never the oldest filer's)");
  const rows = (pid, role) => ({ id: pid, role });
  const may = async (who, id) => mayReadArtifact(who, { ...art(id), id }, asOrg({ DB: env.DB }));
  eq([await may(rows("m-alpha", "member"), ra), await may(rows("p-alpha", "partner"), ra), await may(rows("m-beta", "member"), ra), await may(rows("m-alpha", "member"), rb), await may(rows("p1", "owner"), rb)],
    [true, true, false, false, true], "G: a seat on alpha reads alpha's report (member and Partner), beta's member does not, nor alpha's member beta's; the owner reads both");
  db.prepare("INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,1)").run("A-own", "m-alpha", "html", "my report", "inbox/artifacts/2026-09/m-alpha/x.html", "0".repeat(64), 1, "report", at, "alpha");
  db.prepare("INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,1)").run("A-org", "m-alpha", "html", "old cron report", "inbox/artifacts/2026-09/agent-r/y.html", "0".repeat(64), 1, "report", at, null);
  eq([await may(rows("m-alpha", "member"), "A-own"), await may(rows("p-alpha", "partner"), "A-own"), await may(rows("m-alpha", "member"), "A-org"), await may(rows("p1", "owner"), "A-org")],
    [true, false, false, true], "G: a person's own file grouped 'report' is theirs alone; an org-level cron report (the old cron's, its person_id a member) is the owner's only");
}

if (fail) {
  console.log(`  → backfill eval-integrity case(s) failed (${checks} checks run)`);
  process.exit(1);
}
console.log(`  ✓ backfill modes are disjoint (eval=1 only / eval=0 only), clean-eval never leaves a dangling report, migrate-036 repairs + replays clean and one report per project read under its project's rule (${checks} checks)`);
