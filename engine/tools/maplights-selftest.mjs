// tools/maplights-selftest.mjs — sprint 2, the Map (migrate-043). Offline: no wrangler, no network.
//
// k_node_lights (a node's light: the four counts of the checks naming it by their LATEST verdict) and k_node_links (a node's
// out edges, one JSON row) are kept by nine triggers, and the Map, GET /map/node and the Goals checks read lights from them.
// This proves both halves on a REAL SQLite built from boot.sql (node:sqlite), over thousands of seeded random writes:
// checks filed, re-referenced and removed (through k_checks, which migrate-040's triggers turn into k_check_refs rows, and
// straight onto k_check_refs too); grades landing in order, backdated, on the same second, removed and rewritten; edges
// filed, re-kinded, relabelled and removed, one by one and a node's all at once.
//   A. EXACT: after every batch each table equals the same thing recomputed from the checks, the grades and the edges
//      (an independent statement written here), and every light equals checks.js lightOf of its counts.
//   B. SAME ANSWER: countsFor over k_node_lights answers exactly what LIGHTS_SQL answers over the checks and their grades
//      (the read it replaced, the fallback on a database before 043), for every ref; mapModelOf's links equal the ones
//      the derived statement reads off k_edges.
//   C. THE INSTRUMENT: each check can fail: with any one of the nine triggers dropped, A goes red.
//   D. THE MIGRATION: migrate-043.sql replays over a database that already holds rows (boot.sql without 043, rows, then
//      the file), its backfill fills both tables exactly, and a second run changes nothing.
//   E. THE POLL: lightsSince answers the rows changed after a moment, oldest first, and the reads use their indexes.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { countsFor, lightOf, LIGHTS_SQL } from "../src/knowledge/checks.js";
import { mapModelOf, lightsSince, MODEL_LINKS_DERIVED_SQL, MODEL_LIT_SQL, LIGHTS_SINCE_SQL } from "../src/knowledge/mapmodel.js";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M043 = readFileSync(join(ENGINE, "migrate-043.sql"), "utf8");
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };

// a D1-shaped binding over node:sqlite (prepare/bind/all/first/run and batch)
function d1(db) {
  const exec = (sql, args) => (/^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql) ? { results: db.prepare(sql).all(...args) } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } });
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => exec(sql, args), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s._exec()) };
}
// the 043 objects, cut out of boot.sql (the database before the migration)
const NAMES_043 = ["k_node_lights", "k_node_links", "idx_k_check_refs_check", "idx_k_node_lights_lit", "idx_k_node_lights_at",
  "k_node_lights_ref_insert", "k_node_lights_ref_delete", "k_node_lights_ref_update", "k_node_lights_grade_insert", "k_node_lights_grade_delete",
  "k_node_lights_grade_update", "k_node_links_insert", "k_node_links_delete", "k_node_links_update"];
const TRIGGERS = NAMES_043.filter((n) => /^k_node_(lights|links)_/.test(n));
function boot043Less() {
  let s = BOOT;
  s = s.replace(/CREATE TABLE IF NOT EXISTS k_node_lights \([\s\S]*?\n\);\n/, "").replace(/CREATE TABLE IF NOT EXISTS k_node_links \([\s\S]*?\n\);\n/, "");
  s = s.replace(/CREATE TRIGGER IF NOT EXISTS k_node_(lights|links)_[a-z_]+\n[\s\S]*?\nEND;\n/g, "");
  // migrate-054's stale triggers read k_node_lights: a database before 043 is before 054 too
  s = s.replace(/CREATE TRIGGER IF NOT EXISTS k_stale_[a-z_]+\n[\s\S]*?\nEND;\n/g, "");
  s = s.replace(/CREATE INDEX IF NOT EXISTS (idx_k_check_refs_check|idx_k_node_lights_lit|idx_k_node_lights_at) [^\n]*\n/g, "");
  return s;
}
function fresh({ drop = null, pre = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(pre ? boot043Less() : BOOT);
  if (drop) db.exec(`DROP TRIGGER ${drop}`);
  db.exec("INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p','P','owner','h',1,'t',1)");
  for (const k of ["alpha", "beta"]) db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('${k}','${k}',1,'t')`);
  return db;
}

// ---- the random writes (deterministic: a seeded generator) ----
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const REFS = Array.from({ length: 14 }, (_, i) => (i < 9 ? `screen:n${i}` : i < 12 ? `goal-${i}` : `Q${i}`));
const NODES = Array.from({ length: 12 }, (_, i) => `screen:n${i}`);
const VERDICTS = ["proven", "refused", "incomplete"];
function writes(db, seed, n) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
  const at = () => `2026-09-${String(10 + Math.floor(r() * 5)).padStart(2, "0")}T0${Math.floor(r() * 3)}:00:00.000Z`;
  const C = (p, id, refs) => db.prepare("INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,'p','t','p','t') ON CONFLICT (project,id) DO UPDATE SET refs = excluded.refs").run(p, id, id, JSON.stringify(refs));
  for (const p of ["alpha", "beta"]) for (const id of NODES) db.prepare("INSERT OR IGNORE INTO k_nodes (project,id,type,name,created_by,created_at,updated_by,updated_at) VALUES (?,?,'screen',?,'p','t','p','t')").run(p, id, id);
  for (let k = 0; k < n; k++) {
    const p = r() < 0.8 ? "alpha" : "beta", op = r();
    // c*: checks filed through k_checks (migrate-040 keeps their refs); x*: refs written straight onto k_check_refs (the
    // two id spaces never meet: a filed check's refs always mirror its k_checks.refs, as the write door keeps them)
    const cid = `c${Math.floor(r() * 30)}`, xid = `x${Math.floor(r() * 6)}`, gid = r() < 0.8 ? cid : xid;
    const refs = [...new Set(Array.from({ length: Math.floor(r() * 4) }, () => pick(REFS)))];
    if (op < 0.18) C(p, cid, refs);                                                                   // a check filed, or its refs replaced
    else if (op < 0.22) db.prepare("DELETE FROM k_checks WHERE project = ? AND id = ?").run(p, cid);   // a check removed
    else if (op < 0.24) { try { db.prepare("UPDATE k_check_refs SET ref = ? WHERE rowid IN (SELECT rowid FROM k_check_refs WHERE project = ? AND check_id LIKE 'x%' ORDER BY random() LIMIT 1)").run(pick(REFS), p); } catch { /* a key taken */ } }
    else if (op < 0.26) db.prepare("INSERT OR IGNORE INTO k_check_refs (project, ref, check_id) VALUES (?, ?, ?)").run(p, pick(REFS), xid);   // straight onto the refs
    else if (op < 0.28) db.prepare("DELETE FROM k_check_refs WHERE rowid IN (SELECT rowid FROM k_check_refs WHERE project = ? AND check_id LIKE 'x%' ORDER BY random() LIMIT 1)").run(p);
    else if (op < 0.52) db.prepare("INSERT INTO check_results (project,pack_version,check_id,status,graded_by,graded_at) VALUES (?, 'live', ?, ?, 'p', ?)").run(p, gid, pick(VERDICTS), at());   // a grade, in order or backdated
    else if (op < 0.56) db.prepare("DELETE FROM check_results WHERE id IN (SELECT id FROM check_results WHERE project = ? ORDER BY random() LIMIT 1)").run(p);
    else if (op < 0.60) db.prepare("UPDATE check_results SET status = ? WHERE id IN (SELECT id FROM check_results WHERE project = ? ORDER BY random() LIMIT 1)").run(pick(VERDICTS), p);
    else if (op < 0.62) db.prepare("UPDATE check_results SET graded_at = ? WHERE id IN (SELECT id FROM check_results WHERE project = ? ORDER BY random() LIMIT 1)").run(at(), p);
    else if (op < 0.63) db.prepare("UPDATE check_results SET check_id = ? WHERE id IN (SELECT id FROM check_results WHERE project = ? ORDER BY random() LIMIT 1)").run(gid, p);
    else if (op < 0.80) db.prepare("INSERT OR IGNORE INTO k_edges (project,from_id,to_id,kind,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,'p','t','p','t')").run(p, pick(NODES), pick(NODES), pick(["nav", "reads", "relation"]));
    else if (op < 0.86) db.prepare("DELETE FROM k_edges WHERE rowid IN (SELECT rowid FROM k_edges WHERE project = ? ORDER BY random() LIMIT 1)").run(p);
    else if (op < 0.89) { const f = pick(NODES); db.prepare("DELETE FROM k_edges WHERE project = ? AND (from_id = ? OR to_id = ?)").run(p, f, f); }   // a node removed takes its edges
    else if (op < 0.93) { try { db.prepare("UPDATE k_edges SET kind = ? WHERE rowid IN (SELECT rowid FROM k_edges WHERE project = ? ORDER BY random() LIMIT 1)").run(pick(["nav", "blocks"]), p); } catch { /* a key taken */ } }
    else if (op < 0.95) { try { db.prepare("UPDATE k_edges SET to_id = ? WHERE rowid IN (SELECT rowid FROM k_edges WHERE project = ? ORDER BY random() LIMIT 1)").run(pick(NODES), p); } catch { /* a key taken */ } }
    else db.prepare("UPDATE k_edges SET label = ? WHERE rowid IN (SELECT rowid FROM k_edges WHERE project = ? ORDER BY random() LIMIT 1)").run(`l${k}`, p);
  }
}

// ---- the references, recomputed here (independently of the triggers and of checks.js) ----
const RECOUNT_LIGHTS = "SELECT r.project, r.ref, COALESCE(SUM(g.status = 'proven'),0) AS green, COALESCE(SUM(g.status = 'refused'),0) AS red, " +
  "COALESCE(SUM(g.id IS NOT NULL AND g.status NOT IN ('proven','refused')),0) AS amber, COALESCE(SUM(g.id IS NULL),0) AS grey " +
  "FROM k_check_refs r LEFT JOIN check_results g ON g.id = (SELECT x.id FROM check_results x WHERE x.project = r.project AND x.check_id = r.check_id ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) " +
  "GROUP BY r.project, r.ref";
function lightsDrift(db) {
  const want = new Map(db.prepare(RECOUNT_LIGHTS).all().map((x) => [`${x.project}|${x.ref}`, `${x.green}/${x.red}/${x.amber}/${x.grey}`]));
  const have = new Map(db.prepare("SELECT project, node_id, green, red, amber, grey, light FROM k_node_lights WHERE green + red + amber + grey <> 0").all()
    .map((x) => [`${x.project}|${x.node_id}`, `${x.green}/${x.red}/${x.amber}/${x.grey}`]));
  const out = [];
  for (const [k, v] of want) if (have.get(k) !== v) out.push(`${k}: ${have.get(k) || "none"} want ${v}`);
  for (const [k, v] of have) if (!want.has(k)) out.push(`${k}: ${v} want none`);
  for (const x of db.prepare("SELECT project, node_id, green, red, amber, grey, light FROM k_node_lights").all()) {
    const c = { total: x.green + x.red + x.amber + x.grey, graded: x.green + x.red + x.amber, passed: x.green, failed: x.red };
    if (x.light !== lightOf(c)) out.push(`${x.project}|${x.node_id}: light ${x.light} want ${lightOf(c)}`);
    if (x.green < 0 || x.red < 0 || x.amber < 0 || x.grey < 0) out.push(`${x.project}|${x.node_id}: a negative count`);
  }
  return out;
}
function linksDrift(db) {
  const want = new Map();
  for (const e of db.prepare("SELECT project, from_id, to_id, kind FROM k_edges").all()) {
    const k = `${e.project}|${e.from_id}`;
    if (!want.has(k)) want.set(k, []);
    want.get(k).push(`${e.to_id}>${e.kind}`);
  }
  const have = new Map(db.prepare("SELECT project, node_id, links FROM k_node_links").all().map((x) => [`${x.project}|${x.node_id}`, JSON.parse(x.links).map((l) => `${l[0]}>${l[1]}`)]));
  const out = [];
  const canon = (a) => [...a].sort().join(",");
  for (const [k, v] of want) if (!have.has(k) || canon(have.get(k)) !== canon(v)) out.push(`${k}: ${have.has(k) ? canon(have.get(k)) : "no row"} want ${canon(v)}`);
  for (const [k] of have) if (!want.has(k)) out.push(`${k}: a row for a node with no edge out`);
  return out;
}

// ---- A. exact under random writes ----
console.log("A · exact under random writes");
{
  const db = fresh();
  let worst = [];
  for (let b = 0; b < 30; b++) { writes(db, 1000 + b, 120); const d = [...lightsDrift(db), ...linksDrift(db)]; if (d.length) { worst = d; break; } }
  const n = db.prepare("SELECT (SELECT COUNT(*) FROM check_results) AS g, (SELECT COUNT(*) FROM k_check_refs) AS r, (SELECT COUNT(*) FROM k_edges) AS e, (SELECT COUNT(*) FROM k_node_lights WHERE light <> 'grey') AS lit").get();
  ok(!worst.length, `30 batches of 120 random writes (${n.g} grades, ${n.r} refs, ${n.e} edges standing, ${n.lit} lit): k_node_lights and k_node_links equal their recomputation after every batch${worst.length ? ` — ${worst.slice(0, 3).join("; ")}` : ""}`);
  ok(n.lit > 3 && n.g > 100 && n.e > 20, "the writes exercised every kind of row (grades, refs, edges, lit nodes)");
}

// ---- B. the same answer as the reads they replace ----
console.log("B · the same answer as the checks and the edges");
{
  const db = fresh();
  writes(db, 77, 1500);
  const env = { DB: d1(db) };
  const got = await countsFor(env, "alpha", REFS);
  const derived = new Map(db.prepare(LIGHTS_SQL()).all("alpha", JSON.stringify(REFS)).map((x) => [x.ref, { total: x.total, graded: x.graded, passed: x.passed, failed: x.failed }]));
  const zero = { total: 0, graded: 0, passed: 0, failed: 0 };
  const diff = REFS.filter((r) => JSON.stringify(got.get(r)) !== JSON.stringify(derived.get(r) || zero));
  ok(!diff.length, `countsFor over k_node_lights == LIGHTS_SQL over the checks and their latest grades, for all ${REFS.length} refs${diff.length ? ` — differs on ${diff.join(", ")}` : ""}`);
  // the Map's own read over the same rows (before the fallback below drops the table)
  const m = await mapModelOf(env, "alpha");
  // a database before 043 (the table gone): countsFor falls back to the checks, the same answer
  db.exec("DROP TABLE k_node_lights");
  const gotPre = await countsFor({ DB: d1(db) }, "alpha", REFS);
  ok(REFS.every((r) => JSON.stringify(gotPre.get(r)) === JSON.stringify(got.get(r))), "on a database without k_node_lights countsFor answers the same, from the checks");
  // the model's links: the packed rows and the derived statement agree
  const packed = new Map(db.prepare("SELECT node_id, links FROM k_node_links WHERE project = 'alpha'").all().map((x) => [x.node_id, JSON.parse(x.links).map(String).sort().join()]));
  const deriv = new Map(db.prepare(MODEL_LINKS_DERIVED_SQL).all("alpha").map((x) => [x.node_id, JSON.parse(x.links).map(String).sort().join()]));
  ok(packed.size === deriv.size && [...packed].every(([k, v]) => deriv.get(k) === v), `k_node_links (${packed.size} rows) == the edges k_edges holds, per node`);
  // the Map's own read: its lights are the lit rows of what it draws, its links the edges between drawn nodes
  const litIds = new Set([...got].filter(([, c]) => c.graded > 0).map(([id]) => id));
  const drawnLit = m.nodes.filter((n) => n.light !== "grey").map((n) => n.id).sort();
  ok(drawnLit.length > 0 && JSON.stringify(drawnLit) === JSON.stringify(m.nodes.map((n) => n.id).filter((id) => litIds.has(id)).sort()), `mapModelOf lights exactly the drawn nodes k_node_lights holds lit (${drawnLit.length} of ${m.nodes.length})`);
  const navs = db.prepare("SELECT COUNT(*) AS n FROM k_edges WHERE project = 'alpha' AND from_id <> to_id").get().n;
  ok(m.links.length === navs, `mapModelOf reads every edge between two drawn nodes (${m.links.length} of ${navs})`);
}

// ---- C. the instrument: every trigger is load-bearing ----
console.log("C · the instrument: a dropped trigger goes red");
for (const t of TRIGGERS) {
  const db = fresh({ drop: t });
  let red = false;
  for (let b = 0; b < 12 && !red; b++) { writes(db, 500 + b, 150); red = (t.startsWith("k_node_links") ? linksDrift(db) : lightsDrift(db)).length > 0; }
  ok(red, `with ${t} dropped, the recomputation goes red`);
}

// ---- D. the migration ----
console.log("D · the migration backfills and replays");
{
  const db = fresh({ pre: true });
  writes(db, 4242, 1800);
  let err = null; try { db.exec(M043); } catch (e) { err = e; }
  const d1st = [...lightsDrift(db), ...linksDrift(db)];
  ok(!err && !d1st.length, `migrate-043 over a database already holding rows: both tables exact at once${err ? ` (${err.message})` : ""}${d1st.length ? ` — ${d1st.slice(0, 2).join("; ")}` : ""}`);
  const snap = () => JSON.stringify([db.prepare("SELECT project,node_id,green,red,amber,grey FROM k_node_lights ORDER BY 1,2").all(), db.prepare("SELECT project,node_id,links FROM k_node_links ORDER BY 1,2").all().map((x) => [x.project, x.node_id, JSON.parse(x.links).map(String).sort()])]);
  const before = snap();
  let err2 = null; try { db.exec(M043); } catch (e) { err2 = e; }
  ok(!err2 && snap() === before, "a second run of migrate-043 changes nothing");
  writes(db, 4343, 600);
  ok(![...lightsDrift(db), ...linksDrift(db)].length, "after the migration, its triggers keep both tables exact");
}

// ---- E. the poll, and the plans ----
console.log("E · the poll and the plans");
{
  const db = fresh();
  const env = { DB: d1(db) };
  writes(db, 9, 400);
  db.exec("UPDATE k_node_lights SET updated_at = '2026-01-01T00:00:00.000Z'");
  const mark = "2026-06-01T00:00:00.000Z";
  const none = await lightsSince(env, "alpha", mark);
  ok(none.lights.length === 0 && none.at === mark, "nothing changed after the mark: the poll answers no light and keeps the mark");
  db.prepare("INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('alpha','poll1','p',?,'p','t','p','t')").run(JSON.stringify(["screen:n1"]));
  db.prepare("INSERT INTO check_results (project,pack_version,check_id,status,graded_by,graded_at) VALUES ('alpha','live','poll1','refused','p','2027-01-01T00:00:00.000Z')").run();
  const one = await lightsSince(env, "alpha", mark);
  const s1 = one.lights.find((x) => x.id === "screen:n1");
  ok(!!s1 && s1.light === "red" && one.lights.every((x) => x.id === "screen:n1") && one.at > mark, `a grade landing lights its node in the next poll (${JSON.stringify(one.lights)})`);
  const again = await lightsSince(env, "alpha", one.at);
  ok(again.lights.length === 0, "and the poll after it answers nothing new");
  const plan = (sql, ...a) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...a).map((r) => r.detail).join(" | ");
  ok(/idx_k_node_lights_at/.test(plan(LIGHTS_SINCE_SQL, "alpha", mark)), `the poll SEARCHes idx_k_node_lights_at (${plan(LIGHTS_SINCE_SQL, "alpha", mark)})`);
  ok(/idx_k_node_lights_lit/.test(plan(MODEL_LIT_SQL(3), "alpha", "a", "b", "c")), `the Map's lit read SEARCHes idx_k_node_lights_lit (${plan(MODEL_LIT_SQL(3), "alpha", "a", "b", "c")})`);
  ok(/idx_k_check_refs_check/.test(plan("SELECT ref FROM k_check_refs WHERE project = ? AND check_id = ?", "alpha", "c1")), "a grade finds its check's refs through idx_k_check_refs_check, never a scan");
}

console.log(`${failed ? "✗" : "✓"} map lights selftest: ${checks - failed}/${checks} passed`);
process.exit(failed ? 1 : 0);
