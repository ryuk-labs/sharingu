// tools/limits-selftest.mjs — sprint 8, 8.2 (docs/plan/PLATFORM.md §4 sprint 8: "every write checks the plan: a warning at 80%, a
// clear refusal at 100% with its error code; reads are never refused; the per-minute burst limit per org"; migrate-076;
// src/plans.js). Against real SQLite (node:sqlite) and the REAL worker (src/index.js over it, tools/fixtures/sqlite-worker.mjs).
// Each claim is proven able to fail: a mutant of the thing it guards turns it red, then the real thing is green.
//   1 · the verdict (pure): every limit's 79 / 80 / 100 / 101 boundary at allowed 100 (ok, warn, warn and it lands, refused),
//       a batch that would cross refused whole; the call's verdict (a write not counted is refused, a read never)
//   2 · the refusal's shape: exactly { error: plan_limit, limit, used, allowed, plan, note (+ adding, retryAfter) }, the words
//       name the operator and that reads still answer
//   3 · each check's ONE read over two orgs (people active AND pending, never removed; projects active, a key already active adds
//       nothing; the month's tally, an older month's reading 0; stored bytes): each org's own numbers at the boundaries, an org
//       whose plan names no row reads the free limits
//   4 · the door's calls (countCall): the burst at 79/80/100%, a write past it NOT counted and refused with retryAfter, a read
//       counted and answered; ANOTHER org in the same minute unharmed; a new minute and a new day start over; the day's limit
//   5 · the statements read on keys and indexes (no SCAN of a table); migrate-076's index moves no other statement's plan
//   6 · migrate-076 over a database before it: the table and the index as boot.sql has them
//   7 · through the real worker, three orgs: projects (create_project warns, then plan_limit), items (file's receipt warns, then
//       not_filed plan_limit; the tally equals the ledger), stored files (save_file), people (Control's add-person; a PENDING seat
//       counts), the burst (org 2's writes 429 + Retry-After over MCP and REST while its reads answer and org 3's writes land),
//       the operator's raise (the org's plan row by SQL) unblocking it — each case red under a mutant copy of src/
// Exit 1 on any fail.
import { readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M076 = readFileSync(join(ENGINE, "migrate-076.sql"), "utf8");
const P = await import(pathToFileURL(join(ENGINE, "src", "plans.js")).href);
const { d1, sqliteWorker, sha } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { asOrg, orgSql } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "org.mjs")).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
// redThenGreen(label, claim, mutants) — every mutant must make the claim false, the real thing (claim(null)) true; async
async function redThenGreen(label, claim, mutants) {
  const reds = [];
  for (const [name, m] of mutants) { let r; try { r = await claim(m); } catch (e) { r = false; } reds.push([name, r]); }
  const still = reds.filter(([, r]) => r).map(([n]) => n);
  ok(!still.length, `${label}: red under every mutant (${mutants.map(([n]) => n).join("; ")})${still.length ? ` — still green: ${still.join(", ")}` : ""}`);
  let g; try { g = await claim(null); } catch (e) { g = false; console.log(`    (${String((e && e.stack) || e).slice(0, 400)})`); }
  ok(g, `${label}: green`);
}
const T0 = "2026-01-01T00:00:00.000Z";
const NOW = Date.parse("2026-10-17T12:34:20.000Z");
const fresh = (boot = BOOT) => { const d = new DatabaseSync(":memory:"); d.exec("PRAGMA foreign_keys = OFF"); d.exec(boot); return d; };
const addOrg = (d, id, name, plan) => d.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (?, ?, ?, ?, ?)").run(id, name, T0, T0, plan);
const addPlan = (d, plan, l) => d.prepare("INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) VALUES (?,?,?,?,?,?,?,?)")
  .run(plan, l.people, l.projects, l.items_month, l.calls_day, l.burst_minute, l.storage_bytes, T0);
const ALL = (n) => ({ people: n, projects: n, items_month: n, calls_day: n, burst_minute: n, storage_bytes: n });
const QUOTAS = ["people", "projects", "items_month", "storage_bytes"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 1 · the verdict ----
{
  console.log("1 · the verdict at every boundary (allowed 100)");
  // a verdict function with its two comparisons as arguments: the real one is P.verdictOf; the mutants move one boundary
  const variant = (refuse, warn) => ({ limit, used, add = 1, allowed, plan }) => {
    const after = used + add;
    if (refuse(after, allowed)) return { verdict: "refused" };
    if (warn(after, allowed)) return { verdict: "warn" };
    return { verdict: "ok" };
  };
  const claim = (m) => QUOTAS.every((limit) => {
    const v = (used, add = 1) => (m || P.verdictOf)({ limit, used, add, allowed: 100, plan: "hundred" }, NOW).verdict;
    return v(78) === "ok" && v(79) === "warn" && v(99) === "warn" && v(100) === "refused" && v(79, 22) === "refused" && v(79, 21) === "warn" && v(100, 0) === "ok";
  });
  await redThenGreen("verdictOf: 79 ok, 80 warn, 100 warn (it lands), 101 refused; a batch crossing refused; adding nothing ok", claim, [
    ["refused AT the limit (>=)", variant((a, l) => a >= l, (a, l) => a * 5 >= l * 4)],
    ["warn from 79% (> 3/4 + 3)", variant((a, l) => a > l, (a, l) => a * 100 >= l * 79)],
    ["warn only past 80% (>)", variant((a, l) => a > l, (a, l) => a * 5 > l * 4)],
    ["a batch judged by its first row", ({ used, allowed, add }) => (used + 1 > allowed ? { verdict: "refused" } : (used + 1) * 5 >= allowed * 4 ? { verdict: "warn" } : { verdict: "ok" })],
  ]);
  const row = (cu, bu) => ({ plan: "p", calls_allowed: 100, burst_allowed: 60, calls_used: cu, burst_used: bu });
  const cv = (m) => {
    const f = m || P.callVerdict;
    return f(row(10, 47), { write: true, counted: true }, NOW).verdict === "ok" && f(row(10, 48), { write: true, counted: true }, NOW).verdict === "warn"
      && f(row(10, 60), { write: true, counted: true }, NOW).verdict === "warn" && f(row(10, 60), { write: true, counted: false }, NOW).refusal.limit === "burst_minute"
      && f(row(100, 3), { write: true, counted: false }, NOW).refusal.limit === "calls_day" && f(row(150, 90), { write: false, counted: true }, NOW).verdict === "warn"
      && f(row(80, 1), { write: false, counted: true }, NOW).warning.limit === "calls_day";
  };
  await redThenGreen("callVerdict: a write not counted is refused by the limit it is at; a read is never refused; 80% warns", cv, [
    ["a read refused too", (r, o, n) => (!o.counted ? { verdict: "refused", refusal: { limit: "burst_minute" } } : P.callVerdict(r, o, n))],
    ["the burst named first", (r, o, n) => (o.write && !o.counted ? { verdict: "refused", refusal: { limit: "burst_minute" } } : P.callVerdict(r, o, n))],
    ["no warning on a read", (r, o, n) => (o.write ? P.callVerdict(r, o, n) : { verdict: "ok" })],
  ]);
}

// ---- 2 · the refusal's shape ----
{
  console.log("2 · the refusal's shape and words");
  const KEYS = ["error", "limit", "used", "allowed", "plan", "note"];
  const shapeOk = (r, extra = []) => r && r.error === "plan_limit" && same(Object.keys(r).sort(), [...KEYS, ...extra].sort())
    && /operator raises/.test(r.note) && /reads still answer/.test(r.note) && !/org \d|another org|other org/i.test(r.note);
  const r1 = P.refusalOf("projects", 3, 3, "free"), r2 = P.refusalOf("items_month", 1490, 1500, "free", { adding: 20 });
  const r3 = P.refusalOf("burst_minute", 60, 60, "free", { now: NOW }), r4 = P.refusalOf("calls_day", 1000, 1000, "free", { now: NOW });
  ok(shapeOk(r1) && shapeOk(r2, ["adding"]) && shapeOk(r3, ["retryAfter"]) && shapeOk(r4, ["retryAfter"]),
    `plan_limit carries exactly its fields, names the operator, says reads still answer (e.g. ${JSON.stringify(r3)})`);
  ok(r3.retryAfter === 40 && r4.retryAfter === 11 * 3600 + 25 * 60 + 40 && P.retryAfterOf("burst_minute", Date.parse("2026-10-17T12:34:59.900Z")) === 1,
    `retryAfter: the minute's end (${r3.retryAfter}s at :20), 00:00 UTC (${r4.retryAfter}s), never 0`);
  const w = P.warningOf("people", 8, 10, "free");
  ok(same(Object.keys(w).sort(), ["allowed", "limit", "note", "plan", "used"]) && /8 of its 10/.test(w.note) && /80%/.test(w.note), `planWarning: ${JSON.stringify(w)}`);
}

// ---- 3 · each check's one read, over two orgs ----
// world(limit, used) -> an env signed in to org 2 (plan 'hundred': every limit 100) holding `used` of the limit, beside org 3
// holding 90 of everything (more than org 2 at its low end: an org-blind count shows); org 4's plan names no row (it reads free's)
function world(limit, used) {
  const d = fresh();
  addPlan(d, "hundred", ALL(100));
  addOrg(d, 2, "Two", "hundred"); addOrg(d, 3, "Three", "hundred"); addOrg(d, 4, "Four", "nosuch");
  const fill = (org, k) => {
    if (limit === "people") {
      const ins = d.prepare("INSERT INTO people (id, name, email, role, key_hash, active, pending, created_at, org) VALUES (?, ?, ?, 'member', ?, ?, ?, ?, ?)");
      for (let i = 0; i < k; i++) ins.run(`o${org}-p${i}`, "x", `o${org}p${i}@x.test`, `h${org}-${i}`, i === 0 ? 0 : 1, i === 0 ? 1 : 0, T0, org);   // the first is PENDING
      ins.run(`o${org}-gone`, "x", `o${org}gone@x.test`, `h${org}-gone`, 0, 0, T0, org);   // removed: never counts
    } else if (limit === "projects") {
      const ins = d.prepare("INSERT INTO projects (key, name, active, created_at) VALUES (?, 'x', ?, ?)");
      for (let i = 0; i < k; i++) ins.run(`o${org}--p${i}`, 1, T0);
      ins.run(`o${org}--closed`, 0, T0);   // archived: never counts
    } else if (limit === "items_month") {
      d.prepare("INSERT INTO org_usage (org, month, items_month) VALUES (?, ?, ?)").run(org, P.monthOf(NOW), k);
    } else if (limit === "storage_bytes") {
      const ins = d.prepare("INSERT INTO artifacts (id, person_id, kind, r2_key, sha256, bytes, group_tag, created_at, org) VALUES (?, 'x', 'pdf', ?, 'h', ?, 'g', ?, ?)");
      if (k) ins.run(`a${org}-1`, `k${org}-1`, k - 1, T0, org);
      if (k) ins.run(`a${org}-2`, `k${org}-2`, 1, T0, org);
    }
  };
  fill(2, used); fill(3, 90);
  return { d, env: (org = 2) => asOrg({ DB: d1(d) }, org) };
}
{
  console.log("3 · each check's ONE read, two orgs (allowed 100)");
  for (const limit of QUOTAS) {
    const at = async (used, sqlMutant) => {
      const keep = P.CHECK_SQL[limit];
      if (sqlMutant) P.CHECK_SQL[limit] = sqlMutant;
      try { return (await P.checkPlan(world(limit, used).env(2), limit, { add: 1, now: NOW })).verdict; } finally { P.CHECK_SQL[limit] = keep; }
    };
    const claim = async (m) => (await at(78, m)) === "ok" && (await at(79, m)) === "warn" && (await at(99, m)) === "warn" && (await at(100, m)) === "refused" && (await at(0, m)) === "ok";
    const S = P.CHECK_SQL[limit];
    const mutants = {
      people: [["active seats only (a pending seat parked)", S.replace("INDEXED BY idx_people_org_held WHERE org = {org} AND active + pending >= 1", "WHERE org = {org} AND active = 1")],
        ["every org's seats", S.replace("INDEXED BY idx_people_org_held WHERE org = {org} AND", "WHERE")],
        ["removed seats too", S.replace("INDEXED BY idx_people_org_held WHERE org = {org} AND active + pending >= 1", "WHERE org = {org}")]],
      projects: [["archived ones too", S.replace("WHERE org = {org} AND active = 1) AS used", "WHERE org = {org}) AS used")],
        ["every org's projects", S.replace("INDEXED BY idx_projects_org_slug WHERE org = {org} AND active = 1) AS used", "WHERE active = 1) AS used")]],
      items_month: [["every org's tally", S.replace("WHERE u.org = {org}) AS used", "ORDER BY u.items_month DESC LIMIT 1) AS used")],
        ["the limit read as the free plan's always", S.replace("COALESCE((SELECT x.plan FROM plan_limits x WHERE x.plan = o.plan), 'free')", "'free'")]],
      storage_bytes: [["every org's files", S.replace("INDEXED BY idx_artifacts_org_bytes WHERE org = {org} AND bytes >= 0", "")],
        ["the largest file only", S.replace("COALESCE(SUM(bytes), 0)", "COALESCE(MAX(bytes), 0)")]],
    }[limit];
    await redThenGreen(`${limit}: org 2's own count at 78/79/99/100 (ok, warn, warn, refused), org 3's 90 never in it`, claim, mutants);
  }
  // a key already active adds nothing (re-adding or reactivating an active project at the limit is no new project)
  const pw = world("projects", 100);
  ok((await P.checkPlan(pw.env(2), "projects", { key: "o2--p3", now: NOW })).verdict === "ok" && (await P.checkPlan(pw.env(2), "projects", { key: "o2--closed", now: NOW })).verdict === "refused",
    "projects: at the limit an active key adds nothing (ok); the archived key would add one (refused)");
  // the month's tally: an older month's row reads 0; the tally upsert starts a new month over and adds within one
  const iw = world("items_month", 0);
  iw.d.prepare("UPDATE org_usage SET month = '2026-09', items_month = 100 WHERE org = 2").run();
  const v0 = await P.checkPlan(iw.env(2), "items_month", { now: NOW });
  await iw.env(2).DB.batch([P.itemsTally(iw.env(2), 3, NOW)]);
  const after1 = iw.d.prepare("SELECT month, items_month FROM org_usage WHERE org = 2").get();
  await iw.env(2).DB.batch([P.itemsTally(iw.env(2), 2, NOW), P.itemsTally(iw.env(2), 1, Date.parse("2026-09-30T23:59:59.000Z"))]);
  const after2 = iw.d.prepare("SELECT month, items_month FROM org_usage WHERE org = 2").get();
  ok(v0.verdict === "ok" && after1.month === "2026-10" && after1.items_month === 3 && after2.month === "2026-10" && after2.items_month === 6,
    `items_month: last month's 100 read 0 (${v0.verdict}); the tally starts October at 3, adds 2, and a late September row counts into October (${JSON.stringify(after2)})`);
  // an org whose plan names no row reads the free plan's limits (10 people), never unlimited
  const fw = world("people", 0);
  const ins = fw.d.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES (?, 'x', ?, 'member', ?, 1, ?, 4)");
  for (let i = 0; i < 10; i++) ins.run(`f${i}`, `f${i}@x.test`, `hf${i}`, T0);
  const fr = await P.checkPlan(fw.env(4), "people", { now: NOW });
  ok(fr.verdict === "refused" && fr.refusal.allowed === 10 && fr.refusal.plan === "free", `a plan naming no row reads free's limits: ${JSON.stringify(fr.refusal)}`);
  // a check that cannot read (a database before migrate-076) checks nothing; the D1 quota error is thrown on
  const lost = { DB: { prepare: () => ({ bind() { return this; }, first: async () => { throw new Error("D1_ERROR: no such table: org_usage"); } }) } };
  const quota = { DB: { prepare: () => ({ bind() { return this; }, first: async () => { throw new Error("D1_ERROR: Exceeded maximum daily row read limit (code: 7500)"); } }) } };
  let threw = false; try { await P.checkPlan(asOrg(quota, 2), "people"); } catch { threw = true; }
  ok((await P.checkPlan(asOrg(lost, 2), "items_month")).verdict === "ok" && threw, "a lost read checks nothing; the D1 quota error is thrown on");
}

// ---- 4 · the door's calls ----
{
  console.log("4 · the door's calls: the burst, the day, two orgs");
  // callWith(env, write, at, countSql) — countCall's own steps with its statement as an argument (the mutants'); the green run
  // is P.countCall itself, and a run of callWith with the real statements must agree with it call for call
  const callWith = async (env, write, at, countSql) => {
    const day = P.dayOf(at), minute = P.minuteOf(at);
    const res = await env.DB.batch([env.DB.prepare(orgSql(countSql, env[Symbol.for("sharingu.org")].org)).bind(day, minute, write ? 1 : 0), env.DB.prepare(orgSql(P.CALL_READ_SQL, env[Symbol.for("sharingu.org")].org)).bind(day, minute)]);
    const counted = Number(res[0].meta.changes) > 0;
    return P.callVerdict(res[1].results[0], { write, counted }, at);
  };
  const callsWorld = () => { const d = fresh(); addPlan(d, "small", { ...ALL(100), calls_day: 20, burst_minute: 10 }); addOrg(d, 2, "Two", "small"); addOrg(d, 3, "Three", "small"); return d; };
  const run = async (m) => {
    const d = callsWorld(), e2 = asOrg({ DB: d1(d) }, 2), e3 = asOrg({ DB: d1(d) }, 3);
    const call = (env, write, at) => (m ? callWith(env, write, at, m) : P.countCall(env, { write, now: at }));
    const t1 = NOW, t2 = NOW + 60000, t3 = Date.parse("2026-10-18T00:00:05.000Z");
    const minute1 = [];
    for (let i = 0; i < 11; i++) minute1.push(await call(e2, true, t1));
    const reads = [await call(e2, false, t1), await call(e2, false, t1)];
    const other = await call(e3, true, t1);
    const row = () => d.prepare("SELECT calls_day, calls_minute FROM org_usage WHERE org = 2").get();
    const afterBurst = row();
    const minute2 = [];
    for (let i = 0; i < 9; i++) minute2.push(await call(e2, true, t2));
    const nextDay = await call(e2, true, t3);
    const v = (x) => x.verdict;
    return minute1.slice(0, 7).every((x) => v(x) === "ok") && minute1.slice(7, 10).every((x) => v(x) === "warn") && v(minute1[10]) === "refused"
      && minute1[10].refusal.limit === "burst_minute" && minute1[10].refusal.used === 10 && minute1[10].refusal.allowed === 10 && minute1[10].refusal.retryAfter === 40
      && reads.every((x) => v(x) === "warn") && afterBurst.calls_minute === 12 && afterBurst.calls_day === 12
      && v(other) === "ok"
      && minute2.slice(0, 3).every((x) => v(x) === "ok") && minute2.slice(3, 8).every((x) => v(x) === "warn") && v(minute2[8]) === "refused" && minute2[8].refusal.limit === "calls_day"
      && v(nextDay) === "ok" && row().calls_day === 1 && row().calls_minute === 1;
  };
  const S = P.CALL_COUNT_SQL;
  await redThenGreen("the burst refuses the 11th write in a minute (not counted, retryAfter), counts and answers reads, spares org 3, starts over each minute and day; the day's 21st write refused calls_day", run, [
    ["a refused write counted anyway", S.replace("WHERE ?3 = 0 OR NOT EXISTS", "WHERE 1 OR NOT EXISTS")],
    ["a read refused too", S.replace("WHERE ?3 = 0 OR NOT EXISTS", "WHERE NOT EXISTS")],
    ["one burst for every org", S.replace("JOIN org_usage u ON u.org = o.id WHERE o.id = {org}", "JOIN org_usage u WHERE o.id = {org}")],
    ["the minute never starts over", S.replace("calls_minute = CASE WHEN excluded.minute > minute THEN 1 ELSE calls_minute + 1 END", "calls_minute = calls_minute + 1")],
    ["the day never starts over", S.replace("calls_day = CASE WHEN excluded.day > day THEN 1 ELSE calls_day + 1 END", "calls_day = calls_day + 1")],
  ]);
  ok(await run(S), "callWith with the real statement passes the same claim (the mutants ran the real steps)");
  // a clock a little behind counts into the window the row holds (never back to an older one)
  const d = callsWorld(), e2 = asOrg({ DB: d1(d) }, 2);
  await P.countCall(e2, { write: true, now: NOW + 60000 }); await P.countCall(e2, { write: true, now: NOW });
  const r = d.prepare("SELECT minute, calls_minute FROM org_usage WHERE org = 2").get();
  ok(r.minute === P.minuteOf(NOW + 60000) && r.calls_minute === 2, `a call stamped a minute behind counts into the newer minute (${JSON.stringify(r)})`);
}

// ---- 5 · the statements' plans; no plan of today moves ----
{
  console.log("5 · the statements read on keys and indexes; migrate-076's index moves no plan");
  const d = fresh();
  const plan = (sql) => d.prepare("EXPLAIN QUERY PLAN " + orgSql(sql, 2)).all(...Array(((sql.match(/\?\d/g) || []).map((x) => Number(x.slice(1))).reduce((a, b) => Math.max(a, b), 0))).fill("2026-10")).map((r) => r.detail);
  const TABLES = /^SCAN (people|projects|artifacts|transmission|org_usage|org|plan_limits|o|l|u|x)\b/;
  const claim = (m) => Object.values(m || P.CHECK_SQL).concat([P.CALL_READ_SQL]).every((s) => !plan(s).some((x) => TABLES.test(x)))
    && plan((m || P.CHECK_SQL).people).some((x) => x === "SEARCH people USING COVERING INDEX idx_people_org_held (org=?)");
  await redThenGreen("every check and the call read: no SCAN of a table; the held seats on idx_people_org_held", claim, [
    ["people by an OR, no INDEXED BY", { ...P.CHECK_SQL, people: P.CHECK_SQL.people.replace("INDEXED BY idx_people_org_held WHERE org = {org} AND active + pending >= 1", "WHERE org = {org} AND (active = 1 OR pending = 1)") }],
    ["storage without its partial term", { ...P.CHECK_SQL, storage_bytes: P.CHECK_SQL.storage_bytes.replace("INDEXED BY idx_artifacts_org_bytes WHERE org = {org} AND bytes >= 0", "WHERE +org = {org}") }],
  ]);
  for (const [k, s] of Object.entries(P.CHECK_SQL)) console.log(`    ${k}: ${plan(s).join(" | ")}`);
  // every self-contained statement in src/ on people: its plan with idx_people_org_held and without it
  const lits = [];
  for (const f of readdirSync(join(ENGINE, "src"), { recursive: true }).filter((x) => String(x).endsWith(".js") && !/plans\.js$|data\.js$|doorcontract\.js$/.test(String(x)))) {
    const t = readFileSync(join(ENGINE, "src", String(f)), "utf8");
    for (const m of t.matchAll(/"((?:SELECT|UPDATE|DELETE|INSERT)\b[^"\\]*(?:\\.[^"\\]*)*)"/g)) if (/\b(FROM|JOIN|UPDATE|INTO)\s+people\b/.test(m[1])) lits.push([String(f), m[1]]);
  }
  const plansOn = (db) => lits.map(([f, s]) => { try { return [f, s, db.prepare("EXPLAIN QUERY PLAN " + orgSql(s, 2)).all().map((r) => r.detail).join(" | ")]; } catch { return [f, s, null]; } });
  const without = fresh(); without.exec("DROP INDEX idx_people_org_held");
  const base = plansOn(without).filter(([, , p]) => p != null);
  const moved = (extra) => { const db = fresh(); if (extra) db.exec(extra); const now = new Map(plansOn(db).map(([f, s, p]) => [f + s, p])); return base.filter(([f, s, p]) => now.get(f + s) !== p).map(([f, s]) => `${f}: ${s.slice(0, 80)}`); };
  ok(base.length >= 15, `the statements on people compared: ${base.length} of ${lits.length} literals prepare on the schema`);
  const red = moved("CREATE INDEX idx_mutant_people_held ON people(org) WHERE active = 1 OR pending = 1; CREATE INDEX idx_mutant_people_org ON people(org, active);");
  ok(red.length > 0, `red: an index whose WHERE a statement's implies (or led by a bare org) moves ${red.length} plan(s) (e.g. ${red.slice(0, 1).join("")})`);
  const green = moved(null);
  ok(!green.length, `green: with idx_people_org_held no plan moves${green.length ? ` — moved: ${green.join(" · ")}` : ""}`);
}

// ---- 6 · migrate-076 over a database before it ----
{
  console.log("6 · migrate-076 over a database before it");
  const objs = (db) => db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name IN ('org_usage', 'idx_people_org_held') ORDER BY name").all().map((r) => `${r.type}:${r.name}:${String(r.sql).replace(/\s+/g, " ")}`);
  const boot = objs(fresh());
  const pre = fresh(); pre.exec("DROP INDEX idx_people_org_held; DROP TABLE org_usage;");
  const none = objs(pre).length;
  pre.exec(M076);
  const once = objs(pre);
  pre.exec(M076);
  ok(boot.length === 2 && none === 0 && same(once, boot) && same(objs(pre), boot), `the table and the index land as boot.sql has them, and a re-run keeps them (${boot.length} objects)`);
}

// ---- 7 · through the real worker ----
// a mutant copy of src/ (one replacement in one file), loaded by the fixture as another worker
const mutants = [];
function mutantSrc(file, from, to) {
  const dir = mkdtempSync(join(ENGINE, ".limits-mutant-"));
  mutants.push(dir);
  cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
  const p = join(dir, "src", file), t = readFileSync(p, "utf8");
  if (!t.includes(from)) throw new Error(`mutantSrc: ${file} does not hold ${from.slice(0, 60)}`);
  writeFileSync(p, t.split(from).join(to));
  return join(dir, "src");
}
const contribution = (i) => ({ contribution: { lane: "leader", kind: "note", what: `limits note ${i}`, why: "the plan's items" } });
const TINY = { people: 3, projects: 2, items_month: 5, calls_day: 1000, burst_minute: 300, storage_bytes: 1000 };
// e2e(src) -> a fresh worker: org 1 (Northwind, alpha), org 2 Busy (web; Bea its admin) and org 3 Calm (app; Cal its admin), orgs 2
// and 3 on plan 'tiny' (and 'calm', the same numbers: a change to one never moves the other)
async function e2e(src) {
  const w = await sqliteWorker({ projects: ["alpha"], people: [["p-o", "Owen", "owner", "o1-key", ["alpha"]]], src,
    orgs: [{ id: 2, name: "Busy", projects: ["web"], people: [["b-o", "Bea", "owner", "b-key", ["web"]]] },
      { id: 3, name: "Calm", projects: ["app"], people: [["c-o", "Cal", "owner", "c-key", ["app"]]] }] });
  addPlan(w.db, "tiny", TINY); addPlan(w.db, "calm", TINY);
  w.db.exec("UPDATE org SET plan = 'tiny' WHERE id = 2; UPDATE org SET plan = 'calm' WHERE id = 3;");
  const raw = async (body, key) => {
    const r = await w.fetch(new Request(w.origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) }));
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
    let out = null; try { out = JSON.parse(j.result.content[0].text); } catch { out = j; }
    return { status: r.status, headers: r.headers, out, isError: !!(j && j.result && j.result.isError) };
  };
  let id = 0;
  const call = (name, args, key) => raw({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, key);
  const rest = async (method, path, key, body, form) => {
    const r = await w.fetch(new Request(w.origin + path, { method, headers: { authorization: `Bearer ${key}`, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : body ? { "content-type": "application/json" } : {}) },
      body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined }));
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
    return { status: r.status, headers: r.headers, text: t, json: j };
  };
  const fileC = async (n, from, key = "b-key", project = "web") => {
    const items = Array.from({ length: n }, (_, k) => contribution(from + k));
    const pv = await call("preview", { project, items }, key);
    return call("file", { previewId: pv.out && pv.out.previewId, items }, key);
  };
  return { w, call, rest, fileC, count: (sql) => w.db.prepare(sql).get() };
}
const noOtherOrg = (x) => !/Calm|Northwind|o3--|o1|"org":\s*3/.test(JSON.stringify(x));
const isRefusal = (x, limit) => x && x.error === "plan_limit" && x.limit === limit && x.plan === "tiny" && noOtherOrg(x);
// wait out a minute's last seconds, so a case's calls fall in one minute
const oneMinute = async () => { while (new Date().getUTCSeconds() >= 48) await new Promise((r) => setTimeout(r, 500)); };
const cases = [
  ["projects: create_project warns at 2 of 2, the 3rd is plan_limit (a tool error, HTTP 200), nothing created", async (src) => {
    const { call, count } = await e2e(src);
    const a = await call("create_project", { key: "two", name: "Two" }, "b-key");
    const b = await call("create_project", { key: "three", name: "Three" }, "b-key");
    const again = await call("create_project", { key: "two", name: "Two again" }, "b-key");   // active already: adds nothing
    return !a.isError && a.out.planWarning && a.out.planWarning.limit === "projects" && a.out.planWarning.used === 2 && a.out.planWarning.allowed === 2
      && b.status === 200 && b.isError && isRefusal(b.out, "projects") && b.out.used === 2 && !again.isError
      && count("SELECT COUNT(*) AS n FROM projects WHERE org = 2 AND active = 1").n === 2;
  }, [["the check left out of addProject", ["admin.js", 'const quota = await checkPlan(env, "projects", { key: pkey });', 'const quota = { verdict: "ok" };']]]],
  ["items: file's receipt warns at 4 of 5, then the rows that would cross are not_filed plan_limit; the tally equals the ledger", async (src) => {
    const { fileC, count } = await e2e(src);
    const f1 = await fileC(3, 0), f2 = await fileC(1, 3), f3 = await fileC(2, 4);
    const ledger = count("SELECT COUNT(*) AS n FROM transmission WHERE org = 2").n, tally = count("SELECT items_month AS n FROM org_usage WHERE org = 2").n;
    const nf = (f3.out.items || []).map((it) => it.filed).filter(Boolean);
    return !f1.isError && f1.out.complete && !f1.out.planWarning && f2.out.complete && f2.out.planWarning && f2.out.planWarning.limit === "items_month" && f2.out.planWarning.used === 4
      && !f3.out.complete && nf.length === 2 && nf.every((x) => x.status === "not_filed" && /items filed this month/.test(x.note) && /operator/.test(x.note))
      && ledger === 4 && tally === 4;
  }, [["the batch door's check left out", ["core.js", 'await checkPlan(env, "items_month", { add: wanted.length })', '{ verdict: "ok" }']],
      ["the tally left out of the batch", ["core.js", "if (ids.length) stmts.push(itemsTally(env, ids.length));", ""]]]],
  ["stored files: save_file warns at 800 of 1000 bytes, the 3rd is plan_limit and stores nothing", async (src) => {
    const { w, call } = await e2e(src);
    const save = (n) => call("save_file", { title: `f${n}`, content: "x".repeat(n === 1 ? 500 : 300) + n, group: "docs" }, "b-key");
    const a = await save(1), b = await save(2), c = await save(3);
    return !a.isError && !a.out.planWarning && !b.isError && b.out.planWarning && b.out.planWarning.limit === "storage_bytes"
      && c.isError && isRefusal(c.out, "storage_bytes") && [...w.env.BRAIN._map.keys()].filter((k) => k.startsWith("o2/")).length === 2;
  }, [["save_file's check left out", ["mcp.js", 'const quota = await checkPlan(env, "storage_bytes", { add: bytes.byteLength });', 'const quota = { verdict: "ok" };']]]],
  ["people: Control's add-person — a PENDING seat counts: the 3rd seat warns, the 4th is refused though only 2 are active", async (src) => {
    const { rest, count } = await e2e(src);
    const add = (name, email) => rest("POST", "/control", "b-key", null, { action: "add-person", name, email, role: "member" });
    const a = await add("Ann", "ann@x.test");
    const b = await add("Cal again", "c-o@x.test");   // Cal's account stands in org 3: a PENDING seat here
    const c = await add("Dee", "dee@x.test");
    const pend = count("SELECT COUNT(*) AS n FROM people WHERE org = 2 AND pending = 1").n, held = count("SELECT COUNT(*) AS n FROM people WHERE org = 2 AND (active = 1 OR pending = 1)").n;
    return a.status === 200 && !/plan_limit/.test(a.text) && /used 3 of its 3/.test(b.text) && pend === 1
      && /Nothing done . plan_limit/.test(c.text) && !/Calm/.test(c.text.replace(/Cal again/g, "")) && held === 3 && count("SELECT COUNT(*) AS n FROM people WHERE email = 'dee@x.test'").n === 0;
  }, [["add-person's check left out", ["admin.js", '(quota = await checkPlan(env, "people")).refusal', "false"]]]],
  ["the burst: org 2's 6th write in a minute is 429 + Retry-After (MCP and REST), its reads answer, org 3's writes land; the operator's raise unblocks it", async (src) => {
    const { w, call, rest } = await e2e(src);
    w.db.exec("UPDATE plan_limits SET burst_minute = 5 WHERE plan IN ('tiny', 'calm')");   // the same burst for both orgs
    await oneMinute();
    const pv = (key, project) => call("preview", { project, items: [contribution(9)] }, key);
    const five = []; for (let i = 0; i < 5; i++) five.push(await pv("b-key", "web"));
    const sixth = await pv("b-key", "web");
    const restWrite = await rest("POST", "/preview", "b-key", { project: "web", items: [contribution(10)] });
    const read = await call("whoami", {}, "b-key"), restRead = await rest("GET", "/updates", "b-key");
    const calm = await pv("c-key", "app");
    w.db.exec("UPDATE org SET plan = 'team' WHERE id = 2");   // the operator raises Busy by hand (8.5's tool does this)
    const raised = await pv("b-key", "web");
    return five.every((x) => x.status === 200 && !x.isError) && five[3].out.planWarning && five[3].out.planWarning.limit === "burst_minute"
      && sixth.status === 429 && Number(sixth.headers.get("retry-after")) >= 1 && sixth.isError && isRefusal(sixth.out, "burst_minute") && sixth.out.used === 5
      && restWrite.status === 429 && restWrite.json && isRefusal(restWrite.json, "burst_minute") && Number(restWrite.headers.get("retry-after")) >= 1
      && read.status === 200 && !read.isError && restRead.status === 200
      && calm.status === 200 && !calm.isError && raised.status === 200 && !raised.isError;
  }, [["the MCP door counts every call as a read", ["mcp.js", "write: !!(spec && (spec.write || spec.stores))", "write: false"]],
      ["the REST door counts nothing", ["index.js", 'request.method !== "GET" && request.method !== "HEAD" && !uncountedWrite(path)', "false"]]]],
  ["a warning rides any door's answer: a REST write past 80% carries planWarning and the header", async (src) => {
    const { w, rest } = await e2e(src);
    w.db.exec("UPDATE plan_limits SET burst_minute = 5 WHERE plan = 'tiny'");
    await oneMinute();
    const out = []; for (let i = 0; i < 4; i++) out.push(await rest("POST", "/preview", "b-key", { project: "web", items: [contribution(20 + i)] }));
    const last = out[3];
    return out.every((x) => x.status === 200) && !out[2].json.planWarning && last.json.planWarning && last.json.planWarning.limit === "burst_minute"
      && /^burst_minute 4\/5 \(plan tiny\)$/.test(last.headers.get("x-sharingu-plan-warning") || "");
  }, [["the warning never put on the answer", ["index.js", 'const w = path !== "/mcp" ? planNoteOf(tenv) : null;', "const w = null;"]]]],
  // sprint 8's review (A1): the Partner rule holds on the warnings and refusals as it does in whoami — a Partner reads the plan's
  // limits only, never the org's count (no used, no adding, no count in the note or the header); the admin's carry the numbers
  ["a Partner's warning and refusal carry no count of the org's (MCP and REST); the admin's carry the numbers", async (src) => {
    const { w, call, rest } = await e2e(src);
    // Pat: a Partner of org 2 (Busy), seated on its project, signing in with p-key
    w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) SELECT 'b-p', 'Pat', 'pat@x.test', 'partner', ?, 1, created_at, 2 FROM people WHERE id = 'b-o'").run(sha("p-key"));
    w.db.prepare("INSERT INTO project_seats (person_id, project_key, role, created_at) SELECT 'b-p', project_key, 'member', created_at FROM project_seats WHERE person_id = 'b-o'").run();
    w.db.exec("UPDATE plan_limits SET burst_minute = 5 WHERE plan = 'tiny'");
    await oneMinute();
    for (let i = 0; i < 3; i++) await call("preview", { project: "web", items: [contribution(30 + i)] }, "b-key");   // the admin: 3 of 5
    const who = await call("whoami", {}, "p-key");                                              // the Partner's read: 4 of 5, a warning
    const restW = await rest("POST", "/preview", "p-key", { project: "web", items: [contribution(40)] });   // 5 of 5, a warning
    const refused = await call("preview", { project: "web", items: [contribution(41)] }, "p-key");          // the 6th write: refused
    const admin = await call("preview", { project: "web", items: [contribution(42)] }, "b-key");            // the admin's refusal
    const plain = (x) => x && typeof x === "object" && !("used" in x) && !("adding" in x) && x.plan === "tiny" && typeof x.allowed === "number"
      && /ask its admin/.test(x.note || "") && !/\bused\b|\bsent \d|\d+ of its\b|\d+%/.test(x.note || "");
    const pw = who.out && who.out.planWarning, rw = restW.json && restW.json.planWarning;
    return who.status === 200 && who.out && who.out.role === "partner" && plain(pw) && pw.limit === "burst_minute"
      && plain(rw) && rw.limit === "burst_minute" && /^burst_minute \(plan tiny\)$/.test(restW.headers.get("x-sharingu-plan-warning") || "")
      && refused.status === 429 && refused.out && refused.out.error === "plan_limit" && plain(refused.out)
      && admin.status === 429 && isRefusal(admin.out, "burst_minute") && admin.out.used === 5 && /sent 5 calls/.test(admin.out.note);
  }, [["the Partner's words never made (the counts ride every answer)", ["plans.js", "const out = slot && slot.partner ? forPartner(v) : v;", "const out = v;"]],
      ["the REST door never marks its reader", ["index.js", "    if (who) setPlanReader(env, isPartnerReader(who));\n", ""]]]],
];
{
  console.log("7 · through the real worker: three orgs, each limit at its door");
  try {
    for (const [label, run, ms] of cases) {
      const ready = ms.map(([n, [file, from, to]]) => [n, mutantSrc(file, from, to)]);
      await redThenGreen(label, (m) => run(m || undefined), ready);
    }
  } finally { for (const d of mutants) rmSync(d, { recursive: true, force: true }); }
}

console.log(`${failed ? "✗" : "✓"} limits selftest: ${checks - failed} of ${checks} checks hold`);
process.exit(failed ? 1 : 0);
