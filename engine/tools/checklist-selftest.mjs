// tools/checklist-selftest.mjs — sprint 3, B3: the checklist and its meter (src/checklist.js, migrate-050's k_fill, src/holes.js).
// Offline: a REAL SQLite built from boot.sql (node:sqlite), a D1-shaped binding, the real write door; no wrangler, no network.
//   A. k_fill is EXACT: after every batch of seeded random writes on every table it counts (screen, door, gap and goal nodes
//      and their keys, types, data and status; nav, reads, writes and other edges and their keys; renders and their keys;
//      checks and their refs and ids; grades added, removed and moved; goals added, re-parented, re-laned and removed), each
//      row equals the counts recomputed from the tables by an independent statement.
//   B. THE MIGRATION: migrate-050.sql over a database filled before it (boot.sql without k_fill) backfills k_fill exactly, a
//      second run recomputes it, and its triggers keep it exact after.
//   C. THE INSTRUMENT: with one trigger dropped, A goes red and says which count drifted.
//   D. THE DOOR AND A RESTORE: through writeKnowledge (a node removed takes its edges and renders) and a version restore
//      (every table replaced by difference), k_fill stays exact.
//   E. EACH ITEM BOTH WAYS on a project filled step by step through the door: a brand-new project (0%: the first three calls
//      aim, goal tree, start-here; every other area not started, never counted); then each item empty, partial and done as the
//      exact filing that moves it lands (an aim, then its measure; a root goal, a child, its lane; a surface, screens with and
//      without a flow; a render; a door, a table, a reads edge; a check; a grade; a GTM template, a gtm/ doc, a card kind on
//      the GTM tab and its card; an equip), and the meter's arithmetic (done of the applicable items, the mean of their
//      ratios) at each step; an area appears when declared.
//   F. BOUNDED: the whole checklist with its first missing things is at most four statements; a tab's chip one, over only the
//      parts its items need (Map, GTM, Broadcast, Goals), or the questions' own reads (Decisions); no statement reads a table to
//      count it in JS.
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
const C = await imp("src/checklist.js");
const { computeHoles } = await imp("src/holes.js");
const H = await imp("src/hotsql.js");
const { installReqMemo } = await imp("src/reqmemo.js");

let passes = 0, fails = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "  ✓" : "  ✗"} ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const show = (v) => JSON.stringify(v).slice(0, 500);
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M050 = readFileSync(join(ENGINE, "migrate-050.sql"), "utf8");
const T0 = "2026-09-01T00:00:00.000Z";
function freshDb(schema = BOOT) {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-o','Owen Park','o@x.test','owner','h1',1,?,1)").run(T0);
  db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-m','Mia Member','m@x.test','member','h2',1,?,1)").run(T0);
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}'),('beta','Beta',1,'${T0}')`);
  return db;
}
// a D1-shaped binding that logs every statement it runs (F counts them)
function d1(db, log = []) {
  const exec = (sql, args) => (/^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } });
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => { log.push(sql); return exec(sql, args).results[0] ?? null; }, all: async () => { log.push(sql); return { results: exec(sql, args).results }; }, run: async () => { log.push(sql); return exec(sql, args); }, _exec: () => { log.push(sql); return exec(sql, args); } });
  return { log, prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const brain = () => ({ get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) });
const OWNER = { id: "p-o", name: "Owen Park", role: "owner" };
const MEMBER = { id: "p-m", name: "Mia Member", role: "member" };
const envOf = (db, ws = "alpha", log) => installReqMemo(asOrg({ DB: d1(db, log), [Symbol.for("sharingu.project")]: ws, BRAIN: brain() }));   // signed in to org 1

// ---- the recount: k_fill's definitions, written independently of migrate-050 ----
const RECOUNT = `
SELECT n.project, n.type AS kind, COUNT(*) AS n,
  SUM(n.type = 'screen' AND ((json_extract(n.data,'$.lane') IS NOT NULL AND json_extract(n.data,'$.step') IS NOT NULL)
    OR n.id IN (SELECT from_id FROM k_edges WHERE project = n.project AND kind = 'nav') OR n.id IN (SELECT to_id FROM k_edges WHERE project = n.project AND kind = 'nav'))) AS flow,
  SUM(n.type = 'screen' AND (json_extract(n.data,'$.wireframe') IS NOT NULL OR n.id IN (SELECT screen FROM k_renders WHERE project = n.project))) AS pictured,
  SUM(n.type IN ('screen','door') AND n.id IN (SELECT ref FROM k_check_refs WHERE project = n.project)) AS checked,
  SUM(n.type = 'door' AND n.id IN (SELECT from_id FROM k_edges WHERE project = n.project AND kind IN ('reads','writes'))) AS linked,
  0 AS ungraded, SUM(n.type = 'gap' AND n.status IS 'open') AS open, 0 AS roots, 0 AS leaves, 0 AS laned
FROM k_nodes n WHERE n.type IN ('screen','door','gap') GROUP BY 1, 2
UNION ALL
SELECT c.project, 'check', COUNT(*), 0, 0, 0, 0, SUM(c.id NOT IN (SELECT check_id FROM check_results WHERE project = c.project)), 0, 0, 0, 0 FROM k_checks c GROUP BY 1
UNION ALL
SELECT g.project, 'goal', COUNT(*), 0, 0, 0, 0, 0, 0, SUM(g.parent IS NULL), SUM(g.id NOT IN (SELECT parent FROM k_goals WHERE project = g.project AND parent IS NOT NULL)),
  SUM(g.id NOT IN (SELECT parent FROM k_goals WHERE project = g.project AND parent IS NOT NULL) AND g.dimensions <> '[]') FROM k_goals g GROUP BY 1
UNION ALL
SELECT r.project, 'stale', COUNT(DISTINCT r.check_id), 0, 0, 0, 0, 0, 0, 0, 0, 0 FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref
  WHERE (SELECT x.graded_at FROM check_results x WHERE x.project = r.project AND x.check_id = r.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) < s.changed_at GROUP BY 1`;
// (the last arm, sprint 3 B4: k_fill's 'stale' row counts the checks graded before a node they name changed, migrate-054)
const COLS = ["n", "flow", "pictured", "checked", "linked", "ungraded", "open", "roots", "leaves", "laned"];
const canon = (rows) => rows.map((r) => `${r.project}|${r.kind} ${COLS.map((c) => Number(r[c] || 0)).join(",")}`).filter((x) => !/ 0,0,0,0,0,0,0,0,0,0$/.test(x)).sort();
function drift(db) {
  const have = canon(db.prepare(`SELECT project, kind, ${COLS.join(", ")} FROM k_fill`).all()), want = canon(db.prepare(RECOUNT).all());
  if (JSON.stringify(have) === JSON.stringify(want)) return null;
  const miss = want.filter((x) => !have.includes(x)), extra = have.filter((x) => !want.includes(x));
  return `want [${miss.join("; ")}] have [${extra.join("; ")}]`;
}

// ---- random writes on every counted table (seeded) ----
let seed = 20261001;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const P = ["alpha", "beta"];
const IDS = Array.from({ length: 14 }, (_, i) => `n${i}`);
const GIDS = Array.from({ length: 9 }, (_, i) => `g${i}`);
const CIDS = Array.from({ length: 10 }, (_, i) => `c${i}`);
const DATA = [null, "{}", '{"lane":"buy","step":1}', '{"lane":"buy"}', '{"wireframe":{"v":1}}', '{"surface":"web","lane":"x","step":2,"wireframe":{"v":1}}', '{"step":3}'];
function randomWrite(db) {
  const r = rnd(), p = pick(P), at = T0;
  const meta = "'p-o', '" + at + "', 'p-o', '" + at + "'";
  try {
    if (r < 0.2) db.prepare(`INSERT OR IGNORE INTO k_nodes (project,id,type,name,status,data,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,${meta})`).run(p, pick(IDS), pick(["screen", "door", "gap", "table", "surface", "screen", "door"]), "x", pick([null, "open", "closed", "live"]), pick(DATA));
    else if (r < 0.27) db.prepare("DELETE FROM k_nodes WHERE project = ? AND id = ?").run(p, pick(IDS));
    else if (r < 0.34) db.prepare(`UPDATE k_nodes SET ${pick(["type", "data", "status", "id", "project"])} = ? WHERE project = ? AND id = ?`).run(...(() => { const c = rnd(); return c < 0.25 ? [pick(["screen", "door", "gap", "table"])] : c < 0.5 ? [pick(DATA)] : c < 0.75 ? [pick(["open", "closed", null])] : [pick(IDS)]; })(), p, pick(IDS));
    else if (r < 0.5) db.prepare(`INSERT OR IGNORE INTO k_edges (project,from_id,to_id,kind,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,${meta})`).run(p, pick(IDS), pick(IDS), pick(["nav", "nav", "reads", "writes", "relation", "depends"]));
    else if (r < 0.57) { const e = db.prepare("SELECT from_id, to_id, kind FROM k_edges WHERE project = ? ORDER BY random() LIMIT 1").get(p); if (e) db.prepare("DELETE FROM k_edges WHERE project = ? AND from_id = ? AND to_id = ? AND kind = ?").run(p, e.from_id, e.to_id, e.kind); }
    else if (r < 0.61) { const e = db.prepare("SELECT from_id, to_id, kind FROM k_edges WHERE project = ? ORDER BY random() LIMIT 1").get(p); if (e) db.prepare(`UPDATE OR IGNORE k_edges SET ${pick(["from_id", "to_id", "kind"])} = ? WHERE project = ? AND from_id = ? AND to_id = ? AND kind = ?`).run(rnd() < 0.5 ? pick(IDS) : pick(["nav", "reads", "relation"]), p, e.from_id, e.to_id, e.kind); }
    else if (r < 0.68) db.prepare(`INSERT OR IGNORE INTO k_renders (project,screen,state,variant,format,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,'html',?,10,${meta})`).run(p, pick(IDS), pick(["", "a", "b"]), pick(["", "live"]), "a".repeat(64));
    else if (r < 0.72) db.prepare("DELETE FROM k_renders WHERE project = ? AND screen = ? AND state = ?").run(p, pick(IDS), pick(["", "a", "b"]));
    else if (r < 0.74) db.prepare(`UPDATE OR IGNORE k_renders SET ${pick(["screen", "state"])} = ? WHERE project = ? AND screen = ?`).run(pick([...IDS.slice(0, 4), "a", ""]), p, pick(IDS));
    else if (r < 0.8) db.prepare(`INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,${meta}) ON CONFLICT (project,id) DO UPDATE SET refs = excluded.refs`).run(p, pick(CIDS), "t", JSON.stringify([pick(IDS), pick(IDS), pick(GIDS)]));
    else if (r < 0.83) db.prepare("DELETE FROM k_checks WHERE project = ? AND id = ?").run(p, pick(CIDS));
    else if (r < 0.84) db.prepare("UPDATE OR IGNORE k_checks SET id = ? WHERE project = ? AND id = ?").run(pick(CIDS), p, pick(CIDS));
    else if (r < 0.88) db.prepare("INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES (?, 'live', ?, ?, 'p-o', ?)").run(p, pick(CIDS), pick(["proven", "refused"]), new Date(Date.parse(T0) + rnd() * 1e9).toISOString());
    else if (r < 0.9) { const g = db.prepare("SELECT id FROM check_results WHERE project = ? ORDER BY random() LIMIT 1").get(p); if (g) db.prepare("DELETE FROM check_results WHERE id = ?").run(g.id); }
    else if (r < 0.91) { const g = db.prepare("SELECT id FROM check_results ORDER BY random() LIMIT 1").get(); if (g) db.prepare(`UPDATE check_results SET ${pick(["check_id", "project"])} = ? WHERE id = ?`).run(rnd() < 0.5 ? pick(CIDS) : pick(P), g.id); }
    else if (r < 0.96) db.prepare(`INSERT INTO k_goals (project,id,parent,title,dimensions,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,${meta}) ON CONFLICT (project,id) DO UPDATE SET parent = excluded.parent, dimensions = excluded.dimensions`)
      .run(p, pick(GIDS), pick([null, ...GIDS]), "g", pick(["[]", '["gtm"]', '["code","gtm"]']));
    else if (r < 0.98) db.prepare("DELETE FROM k_goals WHERE project = ? AND id = ?").run(p, pick(GIDS));
    else db.prepare(`UPDATE OR IGNORE k_goals SET ${pick(["id", "parent", "dimensions", "project"])} = ? WHERE project = ? AND id = ?`).run(...(() => { const c = rnd(); return c < 0.33 ? [pick(GIDS)] : c < 0.66 ? [pick(["[]", '["gtm"]'])] : [pick(P)]; })(), p, pick(GIDS));
  } catch (e) { if (!/constraint|UNIQUE/i.test(String(e && e.message))) throw e; }
}

// ================= A · exact under random writes =================
console.log("A · k_fill equals the tables recounted after every batch of random writes");
{
  const db = freshDb();
  let at = null;
  if (process.env.TRACE) { const orig = db.prepare.bind(db); let last = ""; db.prepare = (q) => { const st = orig(q); return { run: (...a) => { last = q.slice(0, 160) + " " + JSON.stringify(a); const r = st.run(...a); return r; }, get: (...a) => st.get(...a), all: (...a) => st.all(...a) }; };
    const snap = () => JSON.stringify(orig("SELECT project, id, parent, dimensions FROM k_goals ORDER BY 1,2").all().map((g) => `${g.project}:${g.id}<${g.parent}${g.dimensions}`));
    for (let i = 0; i < 4500 && !at; i++) { const b4 = snap(); randomWrite(db); const d = drift(db); if (d) at = `write ${i}: ${last} -> ${d}\nBEFORE ${b4}\nAFTER ${snap()}`; } }
  for (let b = 0; b < 15 && !at; b++) { for (let i = 0; i < 300; i++) randomWrite(db); const d = drift(db); if (d) at = `batch ${b}: ${d}`; }
  const sz = db.prepare("SELECT (SELECT COUNT(*) FROM k_nodes) AS n, (SELECT COUNT(*) FROM k_edges) AS e, (SELECT COUNT(*) FROM k_renders) AS r, (SELECT COUNT(*) FROM k_checks) AS c, (SELECT COUNT(*) FROM check_results) AS g, (SELECT COUNT(*) FROM k_goals) AS gl").get();
  ok(!at, `15 batches of 300 writes on nodes, edges, renders, checks, grades and goals (${show(sz)}): k_fill exact throughout`, at);
  ok(sz.n > 10 && sz.e > 20 && sz.c > 5 && sz.g > 20 && sz.gl > 5, "the random world is not trivial", show(sz));
  globalThis.__worldA = db;
}

// ================= B · the migration over rows already filed =================
console.log("B · migrate-050.sql over a database filled before it");
{
  // (migrate-054's stale triggers write k_fill too: a database before 050 is before 054)
  const pre = BOOT.replace(/CREATE TABLE IF NOT EXISTS k_fill \([\s\S]*?\n\);\n/, "").replace(/CREATE TRIGGER IF NOT EXISTS k_(fill|stale)_\w+\n[\s\S]*?\nEND;\n/g, "");
  ok(!/k_fill/.test(pre.replace(/^--.*$/gm, "")), "the pre-050 schema carries no k_fill and no k_fill trigger");
  const db = freshDb(pre);
  for (let i = 0; i < 2500; i++) randomWrite(db);
  db.exec(M050);
  ok(!drift(db), "the backfill fills k_fill exactly from the rows already filed", drift(db));
  db.exec(M050);
  ok(!drift(db), "a second run recomputes, never doubles", drift(db));
  for (let i = 0; i < 1500; i++) randomWrite(db);
  ok(!drift(db), "after it, its triggers keep k_fill exact", drift(db));
}

// ================= C · the instrument =================
console.log("C · each check can fail");
for (const t of ["k_fill_edge_delete", "k_fill_render_insert", "k_fill_goal_update", "k_fill_grade_insert", "k_fill_node_update"]) {
  const db = freshDb();
  db.exec(`DROP TRIGGER ${t}`);
  let d = null;
  for (let i = 0; i < 4000 && !d; i++) { randomWrite(db); if (i % 100 === 99) d = drift(db); }
  ok(!!d, `with ${t} dropped, A goes red and names the count that drifted`, "no drift");
}

// ================= D · through the door and a restore =================
console.log("D · writeKnowledge (a node removed takes its edges and renders) and a version restore");
{
  const db = freshDb(), env = envOf(db);
  const node = (id, type, data) => ({ kind: "node", op: "upsert", data: { id, type, name: id, ...(data ? { data } : {}) } });
  const w1 = await writeKnowledge(OWNER, { project: "alpha", ops: [node("surface:web", "surface"), node("screen:a", "screen", { surface: "web", lane: "buy", step: 1 }), node("screen:b", "screen", { surface: "web" }),
    node("door:x", "door"), node("table:t", "table"), { kind: "edge", op: "upsert", data: { from: "screen:a", to: "screen:b", kind: "nav" } },
    { kind: "edge", op: "upsert", data: { from: "door:x", to: "table:t", kind: "reads" } }, { kind: "check", op: "upsert", data: { id: "AC.1", title: "t", refs: ["screen:b", "door:x"] } },
    { kind: "goal", op: "upsert", data: { id: "root", parent: null, title: "R", dimensions: [] } }, { kind: "goal", op: "upsert", data: { id: "kid", parent: "root", title: "K", dimensions: ["gtm"] } }] }, env);
  ok(!w1.error && !drift(db), "a project filed through the door: k_fill exact", drift(db) || show(w1));
  const v1 = await V.publishVersion(OWNER, { project: "alpha", title: "v1" }, env);
  const w2 = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "node", op: "remove", data: { id: "screen:b" } }, { kind: "goal", op: "remove", data: { id: "kid" } }, { kind: "check", op: "remove", data: { id: "AC.1" } }] }, env);
  const f = db.prepare("SELECT n, flow, checked FROM k_fill WHERE project = 'alpha' AND kind = 'screen'").get();
  ok(!w2.error && !drift(db) && f.n === 1 && f.flow === 1 && f.checked === 0, `a screen removed takes its nav edge (screen:a keeps its lane and step: still in a flow), a check removed takes its refs: ${show(f)}`, drift(db) || show(w2));
  const r = await V.restoreVersion(OWNER, { project: "alpha", v: v1.version.n }, env);
  ok(!r.error && !drift(db) && db.prepare("SELECT n FROM k_fill WHERE project = 'alpha' AND kind = 'screen'").get().n === 2, "a restore brings every table back by difference, and k_fill with it", drift(db) || show(r));
}

// ================= E · each item both ways, through the door =================
console.log("E · each item empty, partial and done, and the meter's arithmetic, on a project filled step by step");
{
  const db = freshDb();
  const read = async (who = OWNER) => { const env = envOf(db); return computeHoles(env, who, { brand: { org: "Northwind" } }); };
  const w = async (ops, who = OWNER) => { const r = await writeKnowledge(who, { project: "alpha", ops }, envOf(db)); if (r.error) throw new Error(show(r)); return r; };
  const state = (h, id) => { const x = (h.checklist || []).find((i) => i.id === id); return x ? `${x.state}${x.want ? ` ${x.have}/${x.want}` : ""}` : "absent"; };
  const meterOk = (h) => { const live = h.checklist.filter((i) => i.state !== "not_applicable"); const pct = Math.round((100 * live.reduce((a, i) => a + i.have / i.want, 0)) / live.length);
    return h.meter.total === live.length && h.meter.done === live.filter((i) => i.state === "done").length && h.meter.pct === pct; };
  let h = await read();
  const first3 = h.items.slice(0, 3).map((x) => x.id);
  ok(h.meter.pct === 0 && h.meter.done === 0 && h.meter.total === 3 && JSON.stringify(first3) === JSON.stringify(["aim", "goal-tree", "start-here"])
    && JSON.stringify(h.notApplicable.map((a) => a.area)) === JSON.stringify(["app", "proof", "gtm", "agents"]) && state(h, "questions-options") === "not_applicable" && state(h, "gaps") === "not_applicable"
    && h.items.every((x) => x.state === "empty" && x.fillPath && x.fill.startsWith("preview {")), `a brand-new project: 0% (${h.meter.words || "nothing"}), the first three calls ${first3.join(", ")}, every other area not started and not counted`, show(h.items));
  await w([{ kind: "aim", op: "upsert", data: { aim: "Ship it", measure: null } }]);
  h = await read();
  ok(state(h, "aim") === "partial 1/2" && meterOk(h) && h.meter.pct === 17, `an aim with no measure: aim partial 1/2; the meter ${h.meter.words}`, show(h.meter));
  await w([{ kind: "aim", op: "upsert", data: { measure: { name: "teams", value: 3, source: "the ledger" } } }]);
  await w([{ kind: "goal", op: "upsert", data: { id: "top", parent: null, title: "Top", dimensions: [] } }]);
  h = await read();
  const gt = h.items.find((x) => x.id === "goal-tree");
  ok(state(h, "aim") === "done 2/2" && state(h, "goal-tree") === "partial 1/3" && gt.fillPath.args.items[0].data.parent === "top" && /one goal alone, Top/.test(gt.what) && meterOk(h),
    `the measure filed: aim done; a root goal alone (a root 1, nothing under it 0, its one leaf with no lane 0): goal tree partial 1/3, its call files a goal under "top" (${gt.what})`, show(gt));
  await w([{ kind: "goal", op: "upsert", data: { id: "kid", parent: "top", title: "Kid", dimensions: [] } }]);
  h = await read();
  const gt2 = h.items.find((x) => x.id === "goal-tree");
  ok(state(h, "goal-tree") === "partial 2/3" && gt2.first && gt2.first.id === "kid" && gt2.fillPath.args.items[0].data.id === "kid", `a child with no lane: still partial, first "kid", its call names kid's lanes`, show(gt2));
  await w([{ kind: "goal", op: "upsert", data: { id: "kid", dimensions: ["gtm"] } }, { kind: "doc", op: "upsert", data: { path: "start-here.md", title: "Start", body: "# Start" } }]);
  h = await read();
  ok(state(h, "goal-tree") === "done 3/3" && state(h, "start-here") === "done 1/1" && h.meter.done === 3 && h.meter.total === 3 && h.meter.pct === 100 && !h.items.length,
    `the leaf laned and start-here filed: the core is complete, ${h.meter.words}, nothing open`, show(h.checklist));
  // the app appears when declared: a surface and screens, one in a flow by lane and step, one by a nav edge, one in none
  await w([{ kind: "node", op: "upsert", data: { id: "surface:web", type: "surface", name: "Web" } }, { kind: "node", op: "upsert", data: { id: "screen:a", type: "screen", name: "A", data: { surface: "web", lane: "buy", step: 1 } } },
    { kind: "node", op: "upsert", data: { id: "screen:b", type: "screen", name: "B", data: { surface: "web" } } }, { kind: "node", op: "upsert", data: { id: "screen:c", type: "screen", name: "Card limits", data: { surface: "web" } } }]);
  h = await read();
  const flow = h.items.find((x) => x.id === "screens-in-flow");
  ok(h.areas.find((a) => a.area === "app").applies && state(h, "apps") === "done 1/1" && state(h, "screens") === "done 1/1" && state(h, "screens-in-flow") === "partial 1/3"
    && /^2 of 3 screens are in no flow, first: B\.$/.test(flow.what) && state(h, "screens-pictured") === "empty 0/3" && state(h, "doors") === "empty 0/1" && state(h, "door-table-links") === "not_applicable" && meterOk(h),
    `a surface and three screens: the app area appears; ${flow.what} pictured 0/3, doors empty, door links not applicable; ${h.meter.words}`, show(h.checklist));
  await w([{ kind: "edge", op: "upsert", data: { from: "screen:a", to: "screen:b", kind: "nav" } }, { kind: "node", op: "upsert", data: { id: "screen:c", data: { surface: "web", wireframe: null } } }]);
  db.prepare("INSERT INTO k_renders (project,screen,state,variant,format,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:a','','','html',?,10,'p-o',?,'p-o',?)").run("b".repeat(64), T0, T0);
  h = await read();
  ok(state(h, "screens-in-flow") === "partial 2/3" && h.items.find((x) => x.id === "screens-in-flow").first.id === "screen:c" && state(h, "screens-pictured") === "partial 1/3", `a nav edge puts screen:b in a flow (2/3, first now screen:c); a render pictures screen:a (1/3)`, show(h.checklist));
  await w([{ kind: "node", op: "upsert", data: { id: "door:get", type: "door", name: "GET /x" } }, { kind: "node", op: "upsert", data: { id: "table:x", type: "table", name: "x" } },
    { kind: "edge", op: "upsert", data: { from: "door:get", to: "table:x", kind: "reads" } }]);
  h = await read();
  ok(state(h, "doors") === "done 1/1" && state(h, "tables") === "done 1/1" && state(h, "door-table-links") === "done 1/1" && !h.areas.find((a) => a.area === "proof").applies, "a door, a table and its reads edge: those three done; proof still not started", show(h.checklist));
  // proof appears with a check; its grade moves grades
  await w([{ kind: "check", op: "upsert", data: { id: "AC.a", title: "A works", refs: ["screen:a"] } }]);
  h = await read();
  const gr = h.items.find((x) => x.piece === "grades");
  ok(h.areas.find((a) => a.area === "proof").applies && state(h, "checks-screens") === "partial 1/3" && state(h, "checks-doors") === "empty 0/1" && state(h, "grades") === "empty 0/1"
    && gr.fillPath.tool === "submit_grade" && gr.fillPath.args.checkId === "AC.a" && gr.fill.startsWith('submit_grade {"project":"alpha","checkId":"AC.a"') && meterOk(h),
    `a check: the proof area appears; checks on screens 1/3, on doors 0/1, grades 0/1 with its submit_grade call (it files at once, sprint 19)`, show(gr));
  db.prepare("INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES ('alpha','live','AC.a','proven','p-o',?)").run(T0);
  h = await read();
  ok(state(h, "grades") === "done 1/1" && h.filled.includes("grades"), "graded: grades done, filed under its sprint-1 name", show(h.filled));
  // sprint 3 B4: the screen it names changes after the grade: the grade is stale, not done, and What is missing asks for the
  // regrade first; a regrade makes it done again
  await w([{ kind: "node", op: "upsert", data: { id: "screen:a", name: "A, now with the annual plan" } }]);
  h = await read();
  const st = h.items.find((x) => x.piece === "grades");
  ok(state(h, "grades") === "empty 0/1" && st && /^1 grade is stale since screen:a changed on \d{4}-\d{2}-\d{2}: regrade it first, first: A works\.$/.test(st.what) && st.first.id === "AC.a" && st.fillPath.tool === "submit_grade" && st.fillPath.args.checkId === "AC.a" && meterOk(h),
    `the screen changed after its grade: grades 0/1 (${st && st.what})`, show(st));
  // migrate-066 (the sprint-4 ship's live fault): the door's upsert carries ON CONFLICT DO UPDATE, and SQLite lets the
  // OUTER clause override a trigger's legacy OR IGNORE — so changing a node whose check is ALREADY stale failed the whole
  // batch (UNIQUE: k_check_stale) until the triggers' inserts became explicit upserts. The same node again, still stale:
  const again = await w([{ kind: "node", op: "upsert", data: { id: "screen:a", name: "A, changed again while stale" } }]);
  ok(!again.error && Number(db.prepare("SELECT COUNT(*) AS n FROM k_check_stale WHERE project='alpha' AND check_id='AC.a'").get().n) === 1
    && state(await read(), "grades") === "empty 0/1",
    "a node changed AGAIN while its check is already stale: the write lands, the stale row stays one", show(again));
  db.prepare("INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES ('alpha','live','AC.a','proven','p-o',?)").run(new Date(Date.now() + 1000).toISOString());
  h = await read();
  ok(state(h, "grades") === "done 1/1", "regraded after the change: grades done again", show(h.checklist));
  // gtm appears with a template; strategy and lists move as filed
  await w([{ kind: "gtm", op: "upsert", data: { template: { identity: { key: "gtm" }, activityKinds: ["outreach"], fields: [], activityTemplate: {}, proofRule: {}, outcomeModel: {} } } }]);
  h = await read();
  ok(h.areas.find((a) => a.area === "gtm").applies && state(h, "gtm-template") === "done 1/1" && state(h, "gtm-strategy") === "empty 0/1" && state(h, "gtm-lists") === "empty 0/1"
    && /No GTM list/.test(h.items.find((x) => x.id === "gtm-lists").what), "a GTM template: the GTM area appears; strategy and lists empty", show(h.checklist));
  await w([{ kind: "doc", op: "upsert", data: { path: "gtm/positioning.md", body: "# P" } }, { kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims", tab: "gtm" } }]);
  h = await read();
  ok(state(h, "gtm-strategy") === "done 1/1" && state(h, "gtm-lists") === "empty 0/1" && h.items.find((x) => x.id === "gtm-lists").first.id === "claim", "a gtm/ doc: strategy done; a GTM card kind with no card: lists empty, first claim", show(h.checklist));
  await w([{ kind: "card", op: "upsert", data: { kind: "claim", id: "c1", name: "A claim" } }]);
  h = await read();
  ok(state(h, "gtm-lists") === "done 1/1" && !h.areas.find((a) => a.area === "agents").applies, "its card: lists done; agents not started", show(h.checklist));
  // sprint 3 B4, stale by age: dated knowledge appears in its area; past its shelf life it is due for review
  ok(state(h, "knowledge-fresh") === "not_applicable" && state(h, "gtm-fresh") === "not_applicable", "no card or doc carries an as-of date: neither freshness item applies");
  const today = new Date().toISOString().slice(0, 10);
  await w([{ kind: "doc", op: "upsert", data: { path: "notes.md", title: "Notes", body: "# N", asOf: "2025-01-02" } }, { kind: "card", op: "upsert", data: { kind: "claim", id: "c2", name: "An old claim", asOf: "2025-03-01" } },
    { kind: "card", op: "upsert", data: { kind: "claim", id: "c3", name: "A new claim", asOf: today } }]);
  h = await read();
  const kf = h.items.find((x) => x.id === "knowledge-fresh"), gf = h.items.find((x) => x.id === "gtm-fresh");
  ok(state(h, "knowledge-fresh") === "empty 0/1" && kf.first.id === "doc:notes.md" && kf.fillPath.args.items[0].data.path === "notes.md" && state(h, "gtm-fresh") === "partial 1/2" && gf.first.id === "card:claim/c2"
    && gf.fillPath.args.items[0].data.kind === "claim" && gf.fillPath.args.items[0].data.id === "c2" && meterOk(h), `an old doc (core) and an old GTM card are due: core 0/1 (${kf.what}), GTM 1/2 (${gf.what})`, show([kf, gf]));
  await w([{ kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims", tab: "gtm", reviewAfterDays: 3650 } }, { kind: "doc", op: "upsert", data: { path: "notes.md", asOf: today } }]);
  h = await read();
  ok(state(h, "knowledge-fresh") === "done 1/1" && state(h, "gtm-fresh") === "done 2/2", "the doc checked again (a newer asOf) and the claims' shelf life set to ten years: both fresh", show(h.checklist));
  db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,route,status,eval,project,created_at,org) VALUES ('T-20991231-999','p-o','leader','equip','equip x','w','auto','routed',0,'alpha',?,1)").run(T0);
  h = await read();
  ok(h.areas.find((a) => a.area === "agents").applies && state(h, "agents-equipped") === "done 1/1" && meterOk(h), `an equip: the agents area appears, done; ${h.meter.words}`, show(h.areas));
  // a gap (core) and an open question (core): each appears and closes
  await w([{ kind: "node", op: "upsert", data: { id: "gap:login", type: "gap", name: "No login", status: "open" } },
    { kind: "question", op: "upsert", data: { qid: "Q1", question: "Seat or project?", whoOwes: "owner", status: "open", options: [{ what: "seat" }, { what: "project" }] } }]);
  h = await read();
  const m = await read(MEMBER);
  ok(state(h, "gaps") === "empty 0/1" && state(h, "rulings-owed") === "empty 0/1" && state(h, "questions-options") === "done 1/1" && h.items.find((x) => x.piece === "questions").fillPath.tool === "rule_question"
    && !m.items.some((x) => x.piece === "questions") && !m.filled.includes("questions") && m.meter.total === h.meter.total,
    "an open gap and an owed question: both open for the owner (rule_question); a member is never handed the ruling, and their meter counts it the same", show(m.items.map((x) => x.piece)));
  await w([{ kind: "node", op: "upsert", data: { id: "gap:login", status: "closed" } }, { kind: "question", op: "upsert", data: { qid: "Q1", status: "decided", choice: 0 } }]);
  h = await read();
  ok(state(h, "gaps") === "done 1/1" && state(h, "rulings-owed") === "not_applicable" && state(h, "questions-options") === "not_applicable", "the gap closed and the question ruled: gaps done; no open question, so both question items are not applicable", show(h.checklist));
  ok(meterOk(h), `the meter's arithmetic holds at every step (now ${h.meter.words})`, show(h.meter));
}

// ================= F · bounded =================
console.log("F · a fixed number of statements, each an aggregate on a key");
{
  const db = globalThis.__worldA;
  const log = [];
  const env = envOf(db, "alpha", log);
  await C.checklistFor(env, OWNER, { firsts: true });
  const own = log.filter((q) => q === H.CHECKLIST_SQL || q === H.CHECKLIST_FIRSTS_SQL || /k_questions|transmission_refs/.test(q));
  ok(own.length <= 4 && log.filter((q) => q === H.CHECKLIST_SQL).length === 1, `the whole checklist with its first missing things: ${own.length} statement(s) (the meter, the firsts, the open questions, the owed set)`, show(log.map((q) => q.slice(0, 50))));
  // L4: no tab reads its checklist any more (the fill lives on What is missing and Home's Filled tile alone): meterForTab is gone
  ok(!("meterForTab" in C), "no tab meter read: the fill is What is missing's");
  const noCount = [H.CHECKLIST_SQL, H.CHECKLIST_FIRSTS_SQL].every((q) => !/COUNT\(\*\) FROM k_(nodes|checks|edges|goals|renders)\b/.test(q));
  ok(noCount, "no checklist statement counts k_nodes, k_checks, k_edges, k_goals or k_renders: those counts are k_fill's");
  // the pure meter
  const mm = C.meterOf([{ state: "done", ratio: 1 }, { state: "partial", ratio: 0.5 }, { state: "empty", ratio: 0 }, { state: "not_applicable", ratio: null }]);
  ok(mm.done === 1 && mm.total === 3 && mm.pct === 50 && mm.open === 2 && C.meterWords(mm) === "1 of 3 complete · 50% by depth" && C.meterOf([]).pct === null, `meterOf: 1 done, 1 half, 1 empty, 1 not applicable -> ${C.meterWords(mm)}`);
}

// D1b item 10: the Complete list draws every done item `filled` names (matched by id; holeOf(id) dropped goal-tree,
// rulings-owed and the rest whose hole name differs), so its rows equal its count
{
  const { completeItemsOf } = await imp("src/holes.js");
  const C2 = await imp("src/checklist.js");
  const ids = ["aim", "goal-tree", "rulings-owed", "gtm-template", "start-here"];
  const h = { filled: ids, checklist: [...ids.map((id) => ({ id, state: "done" })), { id: "grades", state: "partial" }] };
  const got = completeItemsOf(h).map((x) => x.id);
  ok(got.length === ids.length && ids.every((id) => got.includes(id)) && ids.some((id) => C2.holeOf(id) !== id), `holes' Complete list: ${got.length} of ${ids.length} done items drawn (it drew ${ids.filter((id) => ids.includes(C2.holeOf(id))).length} before)`, JSON.stringify(got));
  // D1b item 9: the grades fill line never suggests a verdict
  ok(/^<proven \| refused \| incomplete/.test(C2.VERDICT_PLACEHOLDER), "the grades fill line's verdict is a placeholder (never \"proven\")");
}

// ================= G · a count never includes an item the reader cannot read (sprint 1's review, closed in sprint 6, 6.6) =================
console.log("G · the counts as each reader may read them: the owner all, a member the open items, a reader signed in as no one the open items");
{
  const db = freshDb();
  const env = envOf(db, "alpha");
  const D = (path, extra = {}) => ({ kind: "doc", op: "upsert", data: { path, title: path, body: `# ${path}\n`, asOf: "2020-01-01", ...extra } });
  const w = await writeKnowledge(OWNER, { project: "alpha", ops: [
    D("start-here.md", { roleVisibility: ["finance"] }), D("gtm/open.md"), D("gtm/secret.md", { roleVisibility: ["finance"] }), D("notes.md", { roleVisibility: ["finance"] }),
    { kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims", tab: "gtm" } },
    { kind: "card_kind", op: "upsert", data: { key: "target", label: "Targets", tab: "gtm" } },
    { kind: "card", op: "upsert", data: { kind: "claim", id: "c-open", name: "Open claim", asOf: "2020-01-01" } },
    { kind: "card", op: "upsert", data: { kind: "target", id: "t-secret", name: "Secret target", asOf: "2020-01-01", roleVisibility: ["finance"] } }] }, env);
  ok(!w.error && w.written === 8, "the owner files 4 docs (3 for finance only) and 2 GTM kinds, one with an open card, one with a finance-only card", show(w));
  const row = (keys) => db.prepare(H.CHECKLIST_SQL).get("alpha", keys);
  const own = row(null), mem = row(C.readerKeysJson(MEMBER)), anon = row(C.readerKeysJson(null)), fin = row(JSON.stringify(["member", "finance"]));
  const pick = (r) => ({ start_here: r.start_here, gtm_docs: r.gtm_docs, gtm_kinds: r.gtm_kinds, fresh: r.fresh });
  ok(own.start_here === 1 && own.gtm_docs === 2 && own.gtm_kinds === "[2,2]" && own.fresh === "[2,2,4,4]", "the owner counts every doc and card (start-here, 2 GTM docs, 2 GTM kinds each with a card, 2 core + 4 GTM dated)", show(pick(own)));
  ok(mem.start_here === 0 && mem.gtm_docs === 1 && mem.gtm_kinds === "[2,1]" && mem.fresh === "[0,0,2,2]", "a member counts only what they may read (no start-here, 1 GTM doc, the target kind has no card they may read, 2 GTM dated)", show(pick(mem)));
  ok(C.readerKeysJson(null) === "[]" && JSON.stringify(pick(anon)) === JSON.stringify(pick(mem)), "a reader signed in as no one holds no key ([]): the open items alone, never the owner's count", show(pick(anon)));
  ok(fin.start_here === 1 && fin.gtm_docs === 2 && fin.gtm_kinds === "[2,2]" && fin.fresh === "[2,2,4,4]", "a member with the finance access hat counts what it opens", show(pick(fin)));
  const { HOLDS_SQL } = await imp("src/mapread.js");
  const ho = db.prepare(HOLDS_SQL).get("alpha", null), hm = db.prepare(HOLDS_SQL).get("alpha", C.readerKeysJson(MEMBER));
  ok(ho.gtm_docs === 2 && ho.cards === 2 && hm.gtm_docs === 1 && hm.cards === 1, "the Map's \"what it holds\" counts the docs and cards as the reader may read them", show([ho, hm]));
  const f1 = await C.checklistFor(envOf(db, "alpha"), MEMBER, { firsts: true }), f0 = await C.checklistFor(envOf(db, "alpha"), OWNER, { firsts: true });
  ok(JSON.stringify(f1.meter) !== JSON.stringify(f0.meter) || f1.items.length !== f0.items.length, "the member's checklist is read with the member's keys (its meter or items differ from the owner's)", show([f1.meter, f0.meter]));
}

console.log(`\n${fails ? "✗" : "✓"} checklist selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
