// tools/integrity-selftest.mjs — the sprint-end review's integrity and free-tier fixes that are cheapest proven offline, on a
// REAL SQLite built from boot.sql (node:sqlite, a D1-shaped binding whose batch is ONE transaction, as D1's is). The
// versions fixes (F3, F6, F13, F2) are proven in tools/versions-selftest.mjs; the door-level ones in tools/smoke/
// s5-integrity.mjs.
//   F8 · k_check_ungraded holds exactly the checks with no grade (triggers on k_checks and check_results, through the real
//        write door, a grade, a removal and a restore), migrate-041.sql backfills it on a database filled before it, and
//        `holes` names the first ungraded check off it: CHECKLIST_FIRSTS_SQL reads k_check_ungraded's primary key and never walks
//        k_checks or probes check_results, so its cost does not grow as checks get graded (sprint 3, B3: the count itself is
//        migrate-050's k_fill, tools/checklist-selftest.mjs).
//   F12 · the Map's client and the shell's fetches carry the page's project.
//   F15 · KNOWLEDGE_AT_SQL is exact on a busy ledger (the old read looked at the newest 200 filings only) and ONE row on
//        idx_transmission_knowledge.
// Exit code decides: 0 when every case holds.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const { writeKnowledge } = await imp("src/knowledge/write.js");
const V = await imp("src/knowledge/versions.js");
const { computeHoles } = await imp("src/holes.js");
const { KNOWLEDGE_AT_SQL, KNOWLEDGE_LAST_SQL, CHECKLIST_FIRSTS_SQL } = await imp("src/hotsql.js");

let passes = 0, fails = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const show = (v) => JSON.stringify(v).slice(0, 400);
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M041 = readFileSync(join(ENGINE, "migrate-041.sql"), "utf8");
const T0 = "2026-09-01T00:00:00.000Z";
function freshDb(schema = BOOT) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schema);
  db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-o','Owen Park','o@x.test','owner','h1',1,?,1)").run(T0);
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}'),('beta','Beta',1,'${T0}')`);
  return db;
}
function d1(db) {
  const exec = (sql, args) => (/^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } });
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const brain = () => ({ get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }) });
const OWNER = { id: "p-o", name: "Owen Park", role: "owner" };
const envOf = (db, ws = "alpha") => (asOrg({ DB: d1(db), [Symbol.for("sharingu.project")]: ws, BRAIN: brain() }));
const planOf = (db, sql, ...a) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...a).map((r) => r.detail).join(" | ");
const check = (id) => ({ kind: "check", op: "upsert", data: { id, title: `check ${id}`, given: "g", when: "w", then: "t", refs: ["screen:home"] } });
const grade = (db, project, id) => db.prepare("INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES (?, 'live', ?, 'proven', 'p-o', ?)").run(project, id, T0);
const ungraded = (db, project = "alpha") => db.prepare("SELECT check_id FROM k_check_ungraded WHERE project = ? ORDER BY check_id").all(project).map((r) => r.check_id).join(",");
const truth = (db, project = "alpha") => db.prepare("SELECT c.id FROM k_checks c WHERE c.project = ? AND NOT EXISTS (SELECT 1 FROM check_results g WHERE g.project = c.project AND g.check_id = c.id) ORDER BY c.id").all(project).map((r) => r.id).join(",");

// ================= F8 · the ungraded checks =================
{
  const db = freshDb();
  const ids = Array.from({ length: 60 }, (_, i) => `AC.${String(i).padStart(3, "0")}`);
  const w = await writeKnowledge(OWNER, { project: "alpha", ops: ids.map(check) }, envOf(db));
  await writeKnowledge(OWNER, { project: "beta", ops: [check("AC.000")] }, envOf(db, "beta"));
  ok(!w.error && ungraded(db) === ids.join(",") && ungraded(db, "beta") === "AC.000", `F8 · 60 checks filed through preview then file: all 60 are in k_check_ungraded (beta's own apart)`, show(w));
  for (const id of ids.slice(0, 55)) grade(db, "alpha", id);
  grade(db, "alpha", "AC.001");   // a second grade of a graded check changes nothing
  ok(ungraded(db) === truth(db) && ungraded(db) === ids.slice(55).join(",") && ungraded(db, "beta") === "AC.000", `F8 · 55 graded (one twice): k_check_ungraded holds the other 5 (${ungraded(db)}), beta's untouched`);
  const h = await computeHoles(envOf(db), OWNER, { brand: { org: "Northwind" } });
  const gh = (h.items || []).find((x) => x.piece === "grades") || {};
  ok(gh.count === 5 && gh.fillPath.args.items[0].grade.checkId === "AC.055" && gh.first && gh.first.id === "AC.055" && /5 of 60 checks have no grade yet, first: check AC\.055\./.test(gh.what), `F8 · holes: grades open, count 5, first AC.055 (${gh.what})`, show(h.items));
  await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "check", op: "remove", data: { id: "AC.055" } }, check("AC.999"), { kind: "check", op: "upsert", data: { id: "AC.056", title: "renamed" } }] }, envOf(db));
  grade(db, "alpha", "AC.998");   // a grade for a check that is not filed
  ok(ungraded(db) === truth(db) && ungraded(db) === "AC.056,AC.057,AC.058,AC.059,AC.999", `F8 · a check removed leaves, a new one joins, a renamed one stays, a grade of an unknown check changes nothing: ${ungraded(db)}`);
  // a restore puts back checks and rows by difference; the triggers keep the table exact through it
  const p = await V.publishVersion(OWNER, { project: "alpha", title: "with 999" }, envOf(db));
  await writeKnowledge(OWNER, { project: "alpha", ops: ["AC.056", "AC.057", "AC.999"].map((id) => ({ kind: "check", op: "remove", data: { id } })) }, envOf(db));
  grade(db, "alpha", "AC.057");
  const r = await V.restoreVersion(OWNER, { project: "alpha", v: p.version.n }, envOf(db));
  ok(!r.error && ungraded(db) === truth(db) && ungraded(db) === "AC.056,AC.058,AC.059,AC.999", `F8 · through a restore (AC.057 graded while it was gone comes back graded): ${ungraded(db)} == the checks with no grade`);
  // the plan: the first ungraded one read on k_check_ungraded's primary key, never a walk (only its flag set)
  const hp = planOf(db, CHECKLIST_FIRSTS_SQL, "alpha", 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0);
  ok(/SEARCH u USING (COVERING )?INDEX sqlite_autoindex_k_check_ungraded_1 \(project=\?\)/.test(hp) && !/SCAN (k_|check_results|t\b|u\b|c\b)/.test(hp)
    && /SEARCH c USING INDEX sqlite_autoindex_k_checks_1 \(project=\? AND id=\?\)/.test(hp), `F8 · the first ungraded check is read on k_check_ungraded's primary key (one row and its check), never a SCAN: ${hp}`);
  // its cost does not grow as checks get graded: the rows it visits are the ungraded ones (at most 51) and one check
  const visits = (d) => Number(d.prepare("SELECT (SELECT COUNT(*) FROM (SELECT 1 FROM k_check_ungraded WHERE project = 'alpha' LIMIT 51)) AS n").get().n);
  const big = freshDb();
  await writeKnowledge(OWNER, { project: "alpha", ops: Array.from({ length: 200 }, (_, i) => check(`B.${String(i).padStart(3, "0")}`)) }, envOf(big));
  const before = visits(big);
  for (let i = 0; i < 190; i++) grade(big, "alpha", `B.${String(i).padStart(3, "0")}`);
  ok(before === 51 && visits(big) === 10, `F8 · 200 checks: the ungraded read visits ${before} rows with none graded and ${visits(big)} with 190 graded (it used to walk up to 500 checks twice, probing check_results each time: ~2,000 rows once most were graded)`);
}
// migrate-041.sql on a database filled before it: the table, the triggers, the index, and the backfill
{
  const pre = BOOT.replace(/CREATE TABLE IF NOT EXISTS k_check_ungraded \([\s\S]*?\);\n/, "").replace(/CREATE TRIGGER IF NOT EXISTS k_checks_ungraded_insert[\s\S]*?END;\n/, "")
    .replace(/CREATE TRIGGER IF NOT EXISTS k_checks_ungraded_delete[\s\S]*?END;\n/, "").replace(/CREATE TRIGGER IF NOT EXISTS check_results_graded[\s\S]*?END;\n/, "")
    .replace(/CREATE INDEX IF NOT EXISTS idx_transmission_knowledge[^\n]*\n/, "");
  const db = freshDb(pre);
  const had = db.prepare("SELECT name FROM sqlite_master WHERE name IN ('k_check_ungraded','idx_transmission_knowledge','check_results_graded')").all().length;
  await writeKnowledge(OWNER, { project: "alpha", ops: ["C.1", "C.2", "C.3"].map(check) }, envOf(db));
  grade(db, "alpha", "C.2");
  db.exec(M041);
  db.exec(M041);   // twice: IF NOT EXISTS and OR IGNORE make it safe to re-run
  const after = db.prepare("SELECT name FROM sqlite_master WHERE name IN ('k_check_ungraded','idx_transmission_knowledge','check_results_graded','k_checks_ungraded_insert','k_checks_ungraded_delete')").all().length;
  grade(db, "alpha", "C.3");
  ok(had === 0 && after === 5 && ungraded(db) === "C.1" && ungraded(db) === truth(db), `F8 · migrate-041.sql on a database filled before it: 5 objects made, the backfill holds C.1 and C.3, a grade after it drops C.3 (${ungraded(db)}); re-running it is safe`);
}

// ================= F15 · the knowledge "as of" =================
{
  const db = freshDb();
  const at = (m) => new Date(Date.parse("2026-09-20T00:00:00.000Z") + m * 60000).toISOString();
  const tx = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,touches,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)");
  tx.run("T-k-1", "p-o", "leader", "knowledge", "1 goal written", "goal:grow", "auto", "received", 0, "alpha", at(0));
  tx.run("T-k-2", "p-o", "leader", "knowledge", "Q-1 ruled A: a claim on the aim", "question:Q-1", "auto", "received", 0, "alpha", at(1));
  tx.run("T-k-3", "p-o", "leader", "knowledge", "1 aim written", "aim", "auto", "received", 0, "alpha", at(2));
  for (let i = 0; i < 250; i++) tx.run(`T-c-${i}`, "p-o", "code", "pr", `busy ${i}`, "screen:home", "auto", "received", 0, "alpha", at(10 + i));
  const OLD = "SELECT (SELECT MAX(w.created_at) FROM (SELECT created_at, kind FROM transmission WHERE project = ? ORDER BY created_at DESC LIMIT 200) w WHERE w.kind = 'knowledge') AS at";
  const oldAt = db.prepare(OLD).get("alpha").at, newAt = db.prepare(KNOWLEDGE_AT_SQL).get("alpha").at;
  const plan = planOf(db, KNOWLEDGE_AT_SQL, "alpha"), lastPlan = planOf(db, KNOWLEDGE_LAST_SQL, "alpha");
  ok(oldAt === null && newAt === at(2) && /SEARCH transmission USING COVERING INDEX idx_transmission_knowledge \(project=\?\)/.test(plan) && /SEARCH transmission USING COVERING INDEX idx_transmission_knowledge \(project=\?\)/.test(lastPlan) && !/SCAN transmission|TEMP B-TREE/.test(plan + lastPlan),
    `F15 · 250 filings after the last knowledge write: the old window read "${oldAt}" (nothing filed), the new read ${newAt}, ONE row on idx_transmission_knowledge (${plan}; the restore's newest-filing read: ${lastPlan})`);
}

// ================= F12 · the client fetches carry the page's project =================
{
  // the Map's client (src/mapclient.js, the page's one script) run in a small fake DOM over a layout: a page opened at
  // ?project=beta pins through GET /map/node and polls GET /map/lights with beta, and with no project named, with none
  const { MAP_CLIENT } = await imp("src/mapclient.js");
  const { layoutOf } = await imp("src/maplayout.js");
  const { runClient, clickNode } = await import(pathToFileURL(join(ENGINE, "tools/fixtures/mapdom.mjs")).href);
  const L = layoutOf({ project: "beta", nodes: [{ id: "screen:home", type: "screen", ref: "screen:home", name: "Home" }], links: [], flows: [] });
  const urls = async (search) => {
    const run = runClient(MAP_CLIENT, { L, on: { screens: 1 }, open: {}, pin: null, flow: -1, since: "2026-10-01T00:00:00.000Z", minW: 980, minH: 600, kinds: {}, lightWord: {} }, { search });
    clickNode(run, 0); (run.window._listeners.focus || []).forEach((f) => f()); await run.flush();
    return [run.fetches.find((f) => f.url.startsWith("/map/node")), run.fetches.find((f) => f.url.startsWith("/map/lights"))].map((f) => (f ? f.url : ""));
  };
  const [nB, lB] = await urls("?project=beta&eval=1"), [n0, l0] = await urls("");
  ok(nB === "/map/node?ref=screen%3Ahome&project=beta" && lB.startsWith("/map/lights?since=") && lB.endsWith("&project=beta") && n0 === "/map/node?ref=screen%3Ahome" && !/project=/.test(l0),
    `F12 · the Map's client on /map?project=beta pins with ${nB} and polls ${lB.replace(/since=[^&]+/, "since=…")} (with no project named: ${n0}, ${l0.replace(/since=[^&]+/, "since=…")})`);
  const { shell } = await imp("src/shell.js");
  // the shell's search and notifications carry ?project= too (the head poll: tools/wire-selftest.mjs pollSim)
  const page = shell({ reader: { id: "p-o", name: "Owen", role: "owner" }, head: { n: 2, at: T0 }, scope: "beta", content: "" });
  const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const withProject = new Function("location", script.slice(script.indexOf("var pageProject="), script.indexOf("function getJson(")) + "return withProject;");
  ok(withProject({ search: "?project=beta" })("/search?q=x") === "/search?q=x&project=beta" && withProject({ search: "?project=beta" })("/updates") === "/updates?project=beta"
    && withProject({ search: "" })("/updates") === "/updates" && /var headUrl=orgPath\('\/versions\?head=1'\)\+\(scope\?'&project='\+encodeURIComponent\(scope\):''\)/.test(script),
    "F12 · the shell's search (/search) and notifications (/updates) carry the page's ?project=, and its head poll the page's scope");
}

console.log(`${fails ? "✗" : "✓"} integrity selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
