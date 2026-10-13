// tools/impact-selftest.mjs — sprint 3, B4: impact and carry-forward. Offline: a REAL SQLite built from boot.sql (node:sqlite),
// the worker's own modules over a D1-shaped binding; no wrangler, no network.
//   A. STALE BY CHANGE, EXACT: after thousands of random writes (nodes changed, added and removed, renders added and replaced,
//      checks filed, re-pointed and removed, grades in order, backdated and removed, refs moved by hand, code, design, note and
//      suite contributions naming nodes), migrate-054's three derived rows equal a recount from what they rest on:
//      k_node_stale.stale = the checks naming the node whose latest grade is older than its changed_at; k_check_stale = the
//      checks with such a ref; k_fill 'stale' = how many those are, per project.
//   B. THE RULE, BOTH WAYS (one case each): a field change after a grade makes it stale and a regrade makes it fresh; an
//      unchanged write, a change to an ungraded node, a note, an answer-like leader filing and a suite contribution change
//      nothing; a render added or replaced does NOT (owner, MCQ 2026-10-02: migrate-057 drops 054's render triggers; a picture
//      is not a change of behaviour); a code or design contribution naming the node (in
//      touches, components or screens as screen:<n>) does, carrying its id; a check naming two nodes is stale only at the one
//      that changed; a backdated grade changes nothing; removing the fresh grade brings the stale one back.
//   C. THE INSTRUMENT: with one trigger dropped, A goes red.
//   D. THE MIGRATION: migrate-054.sql over a database already holding rows (its backfill recomputes; a second run changes
//      nothing; after it the triggers keep it exact) and its Goals month: transmission_goals keyed on when the work happened;
//      migrate-057.sql after it (as in a replay of the chain): the render triggers 054 makes are gone again, a render stales nothing.
//   E. IMPACT: what a contribution touched, what that reaches one hop out, the proof to redo (graded before it), the same for
//      refs (impact {refs}), a knowledge row's own refs, a note puts no grade in question, a contribution naming nothing says so;
//      the reader's scope: a Partner seated nowhere and a stranger read nothing.
//   F. STALE BY AGE: dueOf and its SQL twin agree over many dates and shelf lives; the checklist's counts.
//   G. PICK-UP: who may, the first holds, the second is told, release, done, a child contribution closes it (a counter does
//      not), the follow-ups due read only open ones (yours first), the handover measure counts in one indexed statement.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const I = await imp("src/impact.js");
const PU = await imp("src/pickup.js");
const FR = await imp("src/knowledge/fresh.js");
const { installReqMemo } = await imp("src/reqmemo.js");
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M054 = readFileSync(join(ENGINE, "migrate-054.sql"), "utf8");
const M057 = readFileSync(join(ENGINE, "migrate-057.sql"), "utf8");
let passes = 0, fails = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "  ✓" : "  ✗"} ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const show = (v) => String(JSON.stringify(v)).slice(0, 600);
const T0 = "2026-09-01T00:00:00.000Z";
const iso = (ms) => new Date(ms).toISOString();

function freshDb(schema = BOOT) {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const P = (id, name, email, role) => db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)").run(id, name, email, role, "h" + id, T0);
  P("p-o", "Owen Park", "o@x.test", "owner"); P("p-a", "Ada Lin", "ada@x.test", "member"); P("p-b", "Bo Kim", "bo@x.test", "member");
  P("p-x", "Xan Other", "x@x.test", "member"); P("p-pa", "Pat Partner", "pat@x.test", "partner");
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}'),('beta','Beta',1,'${T0}')`);
  db.exec(`INSERT INTO project_seats (person_id, project_key, created_at) VALUES ('p-a','alpha','${T0}'),('p-b','alpha','${T0}'),('p-x','beta','${T0}')`);
  return db;
}
function d1(db, log = []) {
  const exec = (sql, args) => (/^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } });
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => { log.push(sql); return exec(sql, args).results[0] ?? null; }, all: async () => { log.push(sql); return { results: exec(sql, args).results }; }, run: async () => { log.push(sql); return exec(sql, args); }, _exec: () => { log.push(sql); return exec(sql, args); } });
  return { log, prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s._exec()) };
}
const brain = () => ({ get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) });
const envOf = (db, ws = null, log) => installReqMemo(asOrg({ DB: d1(db, log), [Symbol.for("sharingu.project")]: ws, BRAIN: brain() }));   // signed in to org 1

// ---- the recount: what migrate-054's rows rest on, written independently of its triggers ----
const LG = "(SELECT g.graded_at FROM check_results g WHERE g.project = r.project AND g.check_id = r.check_id ORDER BY g.graded_at DESC, g.id DESC LIMIT 1)";
function drift(db) {
  const out = [];
  for (const s of db.prepare("SELECT project, node_id, stale, changed_at FROM k_node_stale").all()) {
    const want = db.prepare(`SELECT COUNT(*) AS n FROM k_check_refs r WHERE r.project = ? AND r.ref = ? AND ${LG} < ?`).get(s.project, s.node_id, s.changed_at).n;
    if (want !== s.stale) out.push(`node ${s.project}/${s.node_id} stale ${s.stale} want ${want}`);
  }
  const want = db.prepare(`SELECT DISTINCT r.project || '/' || r.check_id AS k FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref WHERE ${LG} < s.changed_at ORDER BY 1`).all().map((x) => x.k);
  const have = db.prepare("SELECT project || '/' || check_id AS k FROM k_check_stale ORDER BY 1").all().map((x) => x.k);
  if (JSON.stringify(want) !== JSON.stringify(have)) out.push(`k_check_stale have [${have.join(",")}] want [${want.join(",")}]`);
  const fill = new Map(db.prepare("SELECT project, n FROM k_fill WHERE kind = 'stale' AND n <> 0").all().map((x) => [x.project, x.n]));
  const cnt = new Map(db.prepare("SELECT project, COUNT(*) AS n FROM k_check_stale GROUP BY project").all().map((x) => [x.project, x.n]));
  if (JSON.stringify([...fill].sort()) !== JSON.stringify([...cnt].sort())) out.push(`k_fill stale ${show([...fill])} want ${show([...cnt])}`);
  return out;
}

// ---- random writes (seeded) ----
let seed = 20261001;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const PR = ["alpha", "beta"];
const NODES = Array.from({ length: 10 }, (_, i) => `screen:s${i}`).concat(["door:d1", "door:d2", "table:t1"]);
const CIDS = Array.from({ length: 12 }, (_, i) => `c${i}`);
let txn = 0;
const W = (db, sql, ...a) => db.prepare(sql).run(...a);
function randomWrite(db) {
  const r = rnd(), p = pick(PR), now = Date.now();
  const meta = "'p-o', ?, 'p-o', ?";
  try {
    if (r < 0.12) W(db, `INSERT OR IGNORE INTO k_nodes (project,id,type,name,data,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,${meta})`, p, pick(NODES), "screen", "n", pick([null, '{"lane":"x"}']), iso(now), iso(now));
    else if (r < 0.24) W(db, `UPDATE k_nodes SET ${pick(["name", "data", "status"])} = ?, updated_at = ? WHERE project = ? AND id = ?`, pick(["a", "b", '{"v":1}', '{"v":2}', "live", null]), iso(now), p, pick(NODES));
    else if (r < 0.27) W(db, "DELETE FROM k_nodes WHERE project = ? AND id = ?", p, pick(NODES));
    else if (r < 0.33) W(db, `INSERT INTO k_renders (project,screen,state,variant,format,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,'','html',?,10,${meta}) ON CONFLICT (project,screen,state,variant) DO UPDATE SET hash = excluded.hash`, p, pick(NODES), pick(["", "a"]), pick(["a", "b", "c"]).repeat(64), iso(now), iso(now));
    else if (r < 0.43) W(db, `INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,${meta}) ON CONFLICT (project,id) DO UPDATE SET refs = excluded.refs`, p, pick(CIDS), "t", JSON.stringify([...new Set([pick(NODES), pick(NODES)])]), iso(now), iso(now));
    else if (r < 0.46) W(db, "DELETE FROM k_checks WHERE project = ? AND id = ?", p, pick(CIDS));
    else if (r < 0.66) W(db, "INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES (?, 'live', ?, ?, 'p-o', ?)", p, pick(CIDS), pick(["proven", "refused", "incomplete"]), iso(now + (rnd() < 0.3 ? -86400000 * rnd() * 3 : rnd() < 0.5 ? 1500 : -1)));
    else if (r < 0.69) { const g = db.prepare("SELECT id FROM check_results WHERE project = ? ORDER BY random() LIMIT 1").get(p); if (g) W(db, "DELETE FROM check_results WHERE id = ?", g.id); }
    else if (r < 0.70) { const g = db.prepare("SELECT id FROM check_results ORDER BY random() LIMIT 1").get(); if (g) W(db, "UPDATE check_results SET graded_at = ? WHERE id = ?", iso(now - 86400000 * rnd()), g.id); }
    else if (r < 0.72) W(db, "UPDATE OR IGNORE k_check_refs SET ref = ? WHERE rowid IN (SELECT rowid FROM k_check_refs WHERE project = ? ORDER BY random() LIMIT 1)", pick(NODES), p);
    else if (r < 0.92) {
      const lane = pick(["code", "design", "leader", "gtm", "code"]), ev = rnd() < 0.15 ? 1 : 0;
      const touches = rnd() < 0.7 ? [pick(NODES), ...(rnd() < 0.3 ? [pick(NODES)] : [])].join(",") : null;
      const screens = rnd() < 0.25 ? pick(["s1", "s2", "screen:s3"]) : null, comps = rnd() < 0.2 ? pick(NODES) : null;
      W(db, "INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,screens,components,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,'auto','routed',?,?,?,1)",
        `T-20991231-${++txn}`, "p-a", lane, lane === "leader" ? "note" : "pr", "w", "y", touches, screens, comps, ev, p, iso(now));
    } else W(db, "UPDATE k_nodes SET name = name WHERE project = ? AND id = ?", p, pick(NODES));   // an unchanged write
  } catch (e) { if (!/constraint|UNIQUE/i.test(String(e && e.message))) throw e; }
}

// ================= A =================
console.log("A · stale by change: the three derived rows equal a recount after every batch of random writes");
{
  const db = freshDb();
  let at = null, most = 0, fresher = 0;
  for (let b = 0; b < 16 && !at; b++) {
    for (let i = 0; i < 300; i++) {
      const was = db.prepare("SELECT COUNT(*) AS n FROM k_check_stale").get().n;
      randomWrite(db);
      const n = db.prepare("SELECT COUNT(*) AS n FROM k_check_stale").get().n;
      most = Math.max(most, n); if (n < was) fresher++;
    }
    const d = drift(db); if (d.length) at = `batch ${b}: ${d.slice(0, 3).join("; ")}`;
  }
  const sz = db.prepare("SELECT (SELECT COUNT(*) FROM k_node_stale) AS rows, (SELECT COUNT(*) FROM check_results) AS grades, (SELECT COUNT(*) FROM transmission) AS tx").get();
  ok(!at, `16 batches of 300 writes: k_node_stale, k_check_stale and k_fill's stale count exact throughout (${show(sz)})`, at);
  ok(sz.rows > 5 && most >= 3 && fresher >= 3 && sz.grades > 100, `the random world is not trivial: at most ${most} checks stale at once, ${fresher} writes made some fresh again`, show(sz));
  globalThis.__world = db;
}

// ================= B =================
console.log("B · the rule, both ways");
{
  const db = freshDb(), now = () => iso(Date.now());
  const node = (id) => W(db, "INSERT INTO k_nodes (project,id,type,name,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,'screen',?,'p-o',?,'p-o',?)", id, id, now(), now());
  const check = (id, refs) => W(db, "INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,'p-o',?,'p-o',?) ON CONFLICT (project,id) DO UPDATE SET refs = excluded.refs", id, id, JSON.stringify(refs), now(), now());
  const grade = (id, at = iso(Date.now() - 60000)) => W(db, "INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES ('alpha','live',?,'proven','p-o',?)", id, at);
  // a regrade made now, then the clock moves on (a change in the same millisecond as a grade is not after it)
  const regrade = (id) => { grade(id, iso(Date.now())); const t = Date.now() + 3; while (Date.now() < t) { /* wait */ } };
  const st = (id) => db.prepare("SELECT stale, changed_by FROM k_node_stale WHERE project = 'alpha' AND node_id = ?").get(id) || null;
  const checkStale = (id) => !!db.prepare("SELECT 1 FROM k_check_stale WHERE project = 'alpha' AND check_id = ?").get(id);
  const n = () => (db.prepare("SELECT n FROM k_fill WHERE project = 'alpha' AND kind = 'stale'").get() || { n: 0 }).n;
  const tx = (lane, extra = {}) => { const id = `T-20991231-${++txn}`; W(db, "INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,screens,components,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,'auto','routed',?,'alpha',?,1)",
    id, "p-a", lane, extra.kind || "pr", "w", "y", extra.touches || null, extra.screens || null, extra.components || null, extra.eval || 0, now()); return id; };
  for (const id of ["screen:a", "screen:b", "screen:c", "screen:u", "screen:n1"]) node(id);
  check("AC.a", ["screen:a"]); check("AC.ab", ["screen:a", "screen:b"]); check("AC.u", ["screen:u"]); check("AC.c", ["screen:c"]);
  grade("AC.a"); grade("AC.ab"); grade("AC.c");
  // an ungraded node changes: nothing is written (the import rule)
  W(db, "UPDATE k_nodes SET name = 'U2', updated_at = ? WHERE project = 'alpha' AND id = 'screen:u'", now());
  ok(st("screen:u") === null && !checkStale("AC.u") && n() === 0, "a change to a node no graded check names writes nothing (no k_node_stale row)");
  // an unchanged write: nothing
  W(db, "UPDATE k_nodes SET name = name WHERE project = 'alpha' AND id = 'screen:a'");
  ok(st("screen:a") === null && n() === 0, "an unchanged write to a graded node writes nothing");
  // a field change after the grade: stale at that node only
  W(db, "UPDATE k_nodes SET name = 'A2', updated_at = ? WHERE project = 'alpha' AND id = 'screen:a'", now());
  ok(st("screen:a") && st("screen:a").stale === 2 && st("screen:a").changed_by === null && !st("screen:b") && checkStale("AC.a") && checkStale("AC.ab") && n() === 2,
    `a field change after the grade: screen:a holds 2 stale checks (AC.a, AC.ab), screen:b none (AC.ab is stale at a only); 2 stale checks`, show([st("screen:a"), st("screen:b"), n()]));
  regrade("AC.a");
  ok(st("screen:a").stale === 1 && !checkStale("AC.a") && checkStale("AC.ab") && n() === 1, "a regrade of AC.a: fresh again; AC.ab still stale", show([st("screen:a"), n()]));
  grade("AC.ab", iso(Date.now() - 86400000 * 5));
  ok(st("screen:a").stale === 1 && checkStale("AC.ab"), "a backdated grade (older than the latest) changes nothing");
  const fresh = db.prepare("SELECT id FROM check_results WHERE project = 'alpha' AND check_id = 'AC.a' ORDER BY graded_at DESC LIMIT 1").get().id;
  W(db, "DELETE FROM check_results WHERE id = ?", fresh);
  ok(st("screen:a").stale === 2 && checkStale("AC.a") && n() === 2, "the fresh grade removed: the older one is latest again, so stale again", show([st("screen:a"), n()]));
  regrade("AC.a"); regrade("AC.ab");
  ok(st("screen:a").stale === 0 && n() === 0, "both regraded: nothing stale (the row stays, at 0)");
  // renders (owner, MCQ 2026-10-02; D1b item 12, migrate-057): a picture added, the same body again, a picture replaced, and an
  // image put where the html was: none of them puts a grade in question; a change to the screen node itself still does
  W(db, "INSERT INTO k_renders (project,screen,state,variant,format,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:c','','','html',?,10,'p-o',?,'p-o',?)", "a".repeat(64), now(), now());
  ok(!st("screen:c") && !checkStale("AC.c") && n() === 0, "a render added to a graded screen: NOT stale (a picture is not a change of behaviour)", show(st("screen:c")));
  W(db, "UPDATE k_renders SET hash = hash, bytes = 10 WHERE project = 'alpha' AND screen = 'screen:c'");
  W(db, "UPDATE k_renders SET hash = ? WHERE project = 'alpha' AND screen = 'screen:c'", "b".repeat(64));
  W(db, "UPDATE k_renders SET format = 'image', hash = ?, artifact = NULL WHERE project = 'alpha' AND screen = 'screen:c'", "c".repeat(64));
  ok(!st("screen:c") && !checkStale("AC.c") && n() === 0, "the same body again, a new body, a picture in place of the html: none stales the grade");
  W(db, "UPDATE k_nodes SET name = 'C2', updated_at = ? WHERE project = 'alpha' AND id = 'screen:c'", now());
  ok(st("screen:c") && st("screen:c").stale === 1 && checkStale("AC.c"), "but the screen node itself changed: stale (the rule for a change to the node holds)", show(st("screen:c")));
  regrade("AC.c");
  // contributions: a note, an eval code filing, a GTM one change nothing; a code one names it in touches; screens as screen:<n>
  check("AC.n1", ["screen:n1"]); grade("AC.n1");
  tx("leader", { kind: "note", touches: "screen:n1" }); tx("gtm", { kind: "outreach", touches: "screen:n1" }); tx("code", { touches: "screen:n1", eval: 1 });
  ok(!st("screen:n1"), "a note, a GTM filing and a suite code filing naming the screen: nothing stale");
  const c1 = tx("code", { touches: "door:zz,screen:n1" });
  ok(st("screen:n1") && st("screen:n1").stale === 1 && st("screen:n1").changed_by === c1 && checkStale("AC.n1"), `a code contribution naming it in touches: stale, changed by ${c1}`, show(st("screen:n1")));
  regrade("AC.n1");
  const c2 = tx("design", { screens: "n1" });
  ok(st("screen:n1").stale === 1 && st("screen:n1").changed_by === c2, "a design contribution naming its screen number (n1 -> screen:n1): stale again, by it");
  regrade("AC.n1");
  const c3 = tx("code", { components: "screen:n1" });
  ok(st("screen:n1").stale === 1 && st("screen:n1").changed_by === c3, "a code contribution naming it in components: stale");
  // a removed node is a change; a check that stops naming a node stops being stale there
  W(db, "UPDATE k_checks SET refs = '[\"screen:b\"]' WHERE project = 'alpha' AND id = 'AC.n1'");
  ok(st("screen:n1").stale === 0 && !checkStale("AC.n1"), "a check re-pointed away from the changed node is not stale any more");
  ok(!drift(db).length, "and the recount agrees after every one of these", drift(db).join("; "));
}

// ================= C =================
console.log("C · each check can fail");
for (const t of ["k_stale_grade_insert", "k_stale_ref_delete", "k_stale_node_update", "k_stale_contribution", "k_stale_grade_delete"]) {
  // the random world leans on the clock and on SQLite's own random(), so one world can miss a dropped trigger (seen about
  // once in six runs for k_stale_grade_delete): up to four worlds, the first drift is the proof
  let d = [];
  for (let world = 0; world < 4 && !d.length; world++) {
    const db = freshDb();
    db.exec(`DROP TRIGGER ${t}`);
    for (let i = 0; i < 6000 && !d.length; i++) { randomWrite(db); if (i % 150 === 149) d = drift(db); }
  }
  // a dropped change trigger leaves no wrong count, only a missing change: the recount of the rows then agrees, so it is
  // caught by B's own case; the count-keeping triggers are caught here
  const changeOnly = t === "k_stale_node_update" || t === "k_stale_contribution";
  ok(changeOnly ? true : d.length > 0, changeOnly ? `${t} records a change (a missing one is B's case, not a wrong count)` : `with ${t} dropped, A goes red (${(d[0] || "no drift").slice(0, 90)})`);
}
{
  // the change triggers' own instrument: B's case goes red with each dropped
  for (const [t, act] of [["k_stale_node_update", (db) => W(db, "UPDATE k_nodes SET name = 'X2', updated_at = ? WHERE project = 'alpha' AND id = 'screen:x'", iso(Date.now()))],
    ["k_stale_contribution", (db) => W(db, "INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,project,created_at,org) VALUES ('T-20991231-9001','p-a','code','pr','w','y','screen:x','auto','routed',0,'alpha',?,1)", iso(Date.now()))]]) {
    const db = freshDb();
    db.exec(`DROP TRIGGER ${t}`);
    W(db, "INSERT INTO k_nodes (project,id,type,name,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:x','screen','X','p-o',?,'p-o',?)", T0, T0);
    W(db, "INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('alpha','AC.x','x','[\"screen:x\"]','p-o',?,'p-o',?)", T0, T0);
    W(db, "INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES ('alpha','live','AC.x','proven','p-o',?)", iso(Date.now() - 60000));
    act(db);
    ok(!db.prepare("SELECT 1 FROM k_check_stale WHERE check_id = 'AC.x'").get(), `with ${t} dropped, the change it records is missed (B's case would go red)`);
  }
}

// ================= D =================
console.log("D · migrate-054.sql over rows already filed, and the Goals month");
{
  const db = globalThis.__world;
  const before = JSON.stringify([db.prepare("SELECT * FROM k_node_stale ORDER BY 1, 2").all().map(({ updated_at, ...x }) => x), db.prepare("SELECT * FROM k_check_stale ORDER BY 1, 2").all(),
    db.prepare("SELECT project, n FROM k_fill WHERE kind = 'stale' AND n <> 0 ORDER BY 1").all()]);
  db.exec(M054);
  const after = JSON.stringify([db.prepare("SELECT * FROM k_node_stale ORDER BY 1, 2").all().map(({ updated_at, ...x }) => x), db.prepare("SELECT * FROM k_check_stale ORDER BY 1, 2").all(),
    db.prepare("SELECT project, n FROM k_fill WHERE kind = 'stale' AND n <> 0 ORDER BY 1").all()]);
  ok(before === after && !drift(db).length, "the file over a database holding stale rows: its backfill recomputes exactly what the triggers kept (a re-run never doubles)", drift(db).join("; "));
  db.exec(M054);
  for (let i = 0; i < 1500; i++) randomWrite(db);
  ok(!drift(db).length, "after a second run, its triggers keep the rows exact", drift(db).join("; "));
  // migrate-057 after it: no render trigger (G2 item 9: 054 no longer makes them, so a re-run of 054 cannot undo 057), a render
  // stales nothing, the rows stay exact; a second run of 057 changes nothing
  const trig = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'k_stale_render%' ORDER BY 1").all().map((x) => x.name).join(",");
  const had = trig();
  db.exec(M057); db.exec(M057);
  const g0 = db.prepare("SELECT COUNT(*) AS n FROM k_check_stale").get().n;
  W(db, "INSERT INTO k_nodes (project,id,type,name,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:m57','screen','M',?,?,?,?) ON CONFLICT DO NOTHING", "p-o", T0, "p-o", T0);
  W(db, "INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('alpha','AC.m57','m','[\"screen:m57\"]','p-o',?,'p-o',?) ON CONFLICT DO NOTHING", T0, T0);
  W(db, "INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES ('alpha','live','AC.m57','proven','p-o',?)", iso(Date.now() - 60000));
  W(db, "INSERT INTO k_renders (project,screen,state,variant,format,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:m57','','','html',?,10,'p-o',?,'p-o',?) ON CONFLICT (project,screen,state,variant) DO UPDATE SET hash = excluded.hash", "d".repeat(64), iso(Date.now()), iso(Date.now()));
  ok(had === "" && trig() === "" && !db.prepare("SELECT 1 FROM k_check_stale WHERE check_id = 'AC.m57'").get() && !drift(db).length,
    `migrate-054 (run twice) makes no render trigger [${had}], 057 after it none either; a render on a graded screen stales nothing, the rows exact (${g0} stale before)`, drift(db).join("; "));
  // the history index (D1b item 13): 057 indexes the touches of every row filed before it, once (a re-run writes nothing),
  // never a knowledge write's
  W(db, "INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,project,created_at,org) VALUES ('T-20991231-9101','p-a','code','pr','w','y','screen:h1, table:t9','auto','routed',0,'alpha',?, 1)", iso(Date.now()));
  W(db, "INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,project,created_at,org) VALUES ('T-20991231-9102','p-o','leader','knowledge','1 doc written','k','doc:secret.md','auto','routed',0,'alpha',?,1)", iso(Date.now()));
  db.exec(M057);
  const refs57 = () => db.prepare("SELECT tid || '=' || ref AS x FROM transmission_refs WHERE tid IN ('T-20991231-9101','T-20991231-9102') ORDER BY 1").all().map((x) => x.x).join(",");
  const r1 = refs57(); db.exec(M057);
  ok(r1 === "T-20991231-9101=screen:h1,T-20991231-9101=table:t9" && refs57() === r1, `migrate-057 indexes a filed row's touches (trimmed), never a knowledge write's, once: ${r1}`);
  const fresh57 = freshDb();
  ok(!fresh57.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'k_stale_render%'").get() && !!fresh57.prepare("SELECT 1 FROM sqlite_master WHERE name = 'k_stale_node_update'").get(),
    "boot.sql (a fresh org): no render trigger, the node trigger kept");
  // the Goals month: a contribution that happened in August, filed in October, counts in August
  const g = freshDb();
  g.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,route,status,eval,project,goal_ref,created_at,happened_at,org) VALUES ('T-20261001-001','p-a','code','pr','w','y','auto','routed',0,'alpha','g1','2026-10-01T09:00:00.000Z','2026-08-20',1)").run();
  g.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,route,status,eval,project,goal_ref,created_at,org) VALUES ('T-20261001-002','p-a','code','pr','w','y','auto','routed',0,'alpha','g1','2026-10-01T09:00:00.000Z',1)").run();
  const months = () => g.prepare("SELECT month, SUM(n) AS n FROM transmission_goals WHERE project = 'alpha' GROUP BY month ORDER BY month").all().map((x) => `${x.month}:${x.n}`).join(",");
  ok(months() === "2026-08:1,2026-10:1", `the tally keys a contribution on the month it happened (${months()})`);
  g.prepare("UPDATE transmission SET happened_at = '2026-09-03' WHERE id = 'T-20261001-001'").run();
  ok(months() === "2026-08:0,2026-09:1,2026-10:1", `a happenedAt corrected moves it (${months()})`);
}

// ================= E =================
console.log("E · impact: a contribution, refs, a knowledge row, a note, nothing; the reader's scope");
{
  const db = freshDb(), now = iso(Date.now());
  const meta = [now, now];
  const node = (id, type) => W(db, "INSERT INTO k_nodes (project,id,type,name,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,'p-o',?,'p-o',?)", id, type, id.split(":")[1], ...meta);
  node("screen:pricing", "screen"); node("door:prices", "door"); node("table:prices", "table"); node("flow:buy", "flow");
  const edge = (a, b, k) => W(db, "INSERT INTO k_edges (project,from_id,to_id,kind,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,'p-o',?,'p-o',?)", a, b, k, ...meta);
  edge("screen:pricing", "door:prices", "depends"); edge("door:prices", "table:prices", "reads"); edge("flow:buy", "screen:pricing", "flow-step");
  const check = (id, refs) => W(db, "INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,'p-o',?,'p-o',?)", id, `the ${id} check`, JSON.stringify(refs), ...meta);
  check("AC.screen", ["screen:pricing"]); check("AC.door", ["door:prices"]); check("AC.new", ["screen:pricing"]);
  W(db, "INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES ('alpha','live','AC.screen','proven','p-o',?)", iso(Date.now() - 60000));
  W(db, "INSERT INTO check_results (project, pack_version, check_id, status, graded_by, graded_at) VALUES ('alpha','live','AC.door','proven','p-o',?)", iso(Date.now() - 60000));
  W(db, "INSERT INTO k_questions (project,qid,question,status,affects,created_by,created_at,updated_by,updated_at) VALUES ('alpha','Q-1','Annual or monthly?','open','[\"screen:pricing\"]','p-o',?,'p-o',?)", ...meta);
  const txAt = iso(Date.now());
  W(db, "INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,project,created_at,shape,org) VALUES ('T-20261001-100','p-a','code','pr','The annual toggle','y','screen:pricing','auto','routed',0,'alpha',?,?,1)",
    txAt, JSON.stringify({ next: { what: "review the copy", who: "bo@x.test", by: "2026-10-02" } }));
  const env = envOf(db, "alpha");
  const ADA = { id: "p-a", name: "Ada Lin", role: "member", email: "ada@x.test" };
  const got = await I.readImpactRow(env, ADA, "T-20261001-100");
  ok(!got.error && got.project === "alpha", "the contributor reads its row and holds a seat on its project", show(got.error));
  const im = await I.impactFor(got.env, got.project, I.refsOfRow(got.row), { row: got.row });
  ok(im.touched.names.some((x) => x.id === "screen:pricing" && x.how === "named in what it touches") && im.reached.names.some((x) => x.id === "door:prices") && im.reached.names.some((x) => x.id === "flow:buy")
    && !im.reached.names.some((x) => x.id === "table:prices"), `one hop out: the door it depends on and the flow that steps through it, never the door's table (${im.reached.names.map((x) => x.id).join(", ")})`);
  ok(im.proof.toRedo.length === 1 && im.proof.toRedo[0].id === "AC.screen" && im.proof.toRedo[0].stale === true && im.proof.ungraded === 1 && /^submit_grade /.test(im.proof.calls[0].call) && im.proof.calls[0].call.includes("AC.screen"),
    `proof to redo: AC.screen only (graded before it, stale), AC.new not graded, AC.door names the reached door, not the touched screen; its regrade call: ${im.proof.calls[0] && im.proof.calls[0].call.slice(0, 80)}`);
  ok(im.decisions.asks.some((q) => q.qid === "Q-1") && im.next && im.next.who === "bo@x.test" && /Pricing screen changed · reaches 1 door, 1 flow · 1 check to redo|pricing screen changed/.test(im.line), `the open question naming it, the next action, the line: ${im.line}`);
  const ref = await I.impactAnswer(envOf(db, "alpha"), ADA, { refs: ["screen:pricing", "goal/nope"] }, "alpha");
  ok(!ref.error && ref.proof.toRedo.some((c) => c.id === "AC.screen") && ref.reached.names.some((x) => x.id === "door:prices"), "impact {refs}: the same reach, and every graded check naming it would be in question");
  W(db, "INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,project,created_at,org) VALUES ('T-20261001-101','p-a','leader','note','A thought','y','screen:pricing','auto','routed',0,'alpha',?,1)", iso(Date.now()));
  const note = await I.impactFor(env, "alpha", I.refsOfRow({ id: "T-20261001-101", kind: "note", lane: "leader", touches: "screen:pricing", created_at: iso(Date.now()) }), { row: { id: "T-20261001-101", kind: "note", lane: "leader", touches: "screen:pricing", created_at: iso(Date.now()) } });
  ok(!note.changesProof && note.proof.toRedo.length === 0 && note.touched.total === 1, "a note touching the screen reaches the same, and puts no grade in question");
  const k = I.refsOfRow({ kind: "knowledge", touches: "node:screen:pricing,render:screen:pricing,check:AC.door,goal:g1,question:Q-1,edge:x" });
  ok(k.refs.has("screen:pricing") && k.checks.has("AC.door") && k.goals.has("g1") && k.questions.has("Q-1") && k.how.get("screen:pricing") === "written", "a knowledge row's own touches: the nodes and renders it wrote, the checks, goals and questions");
  const none = await I.impactFor(env, "alpha", I.refsOfRow({ kind: "pr", lane: "code", touches: "nothing:here" }), { row: { id: "T-x", kind: "pr", lane: "code", touches: "nothing:here", created_at: now } });
  ok(none.touched.total === 0 && none.unknown.includes("nothing:here") && /Nothing in the model changed/.test(none.line), `a contribution naming nothing in the model says so (${none.line})`);
  const PAT = { id: "p-pa", name: "Pat", role: "partner", email: "pat@x.test" }, XAN = { id: "p-x", name: "Xan", role: "member", email: "x@x.test" };
  const p1 = await I.readImpactRow(envOf(db, null), PAT, "T-20261001-100"), x1 = await I.readImpactRow(envOf(db, null), XAN, "T-20261001-100");
  ok(p1.error === "not_found" && x1.error === "not_found", "a Partner seated nowhere and a member of another project read nothing (not_found, as a missing id)");
  const lines = await I.impactLines(env, "alpha", [{ ...got.row }]);
  const l = lines.get("T-20261001-100");
  ok(l && l.touched.total === 1 && l.reached.total === 2 && l.toRedo === 1, `the lighter walk (the page, Home) agrees: ${l && l.line}`);
  const log = [];
  await I.whatChangedFor(envOf(db, "alpha", log), { project: "alpha" });
  // L4 (the row budget): Home's latest changes read what changed and the checks to redo, never the walk one hop out
  ok(log.length === 4 && !log.some((q) => /k_edges|k_node_links|d\.type = 'door'/.test(q)), `Home's What changed: ${log.length} statements (two lane ranges, then the walk's nodes and checks: no reach)`, show(log.map((q) => q.slice(0, 40))));
  const hc = (await I.whatChangedFor(envOf(db, "alpha", []), { project: "alpha" })).rows.find((r) => r.id === "T-20261001-100");
  ok(!hc || (hc.reached.total === null && !/reaches/.test(hc.line)), `Home's line says what changed, never a reach it did not read: ${hc && hc.line}`);
  // a screen reaches the doors whose data names it (saruspay, bunny), and a door the screens its own data names
  W(db, "INSERT INTO k_nodes (project,id,type,name,data,created_by,created_at,updated_by,updated_at) VALUES ('alpha','door:GET:/plans','door','GET /plans','{\"screens\":[\"pricing\"]}','p-o',?,'p-o',?)", now, now);
  const via = await I.impactFor(env, "alpha", I.refsOfRow({ kind: "pr", lane: "code", touches: "screen:pricing" }), { row: { id: "T-y", kind: "pr", lane: "code", touches: "screen:pricing", created_at: iso(Date.now()) } });
  const back = await I.impactFor(env, "alpha", I.refsOfRow({ kind: "pr", lane: "code", touches: "door:GET:/plans" }), { row: { id: "T-z", kind: "pr", lane: "code", touches: "door:GET:/plans", created_at: iso(Date.now()) } });
  ok(via.reached.names.some((x) => x.id === "door:GET:/plans") && back.reached.names.some((x) => x.id === "screen:pricing"), "a screen reaches the door whose data.screens names it, and that door reaches the screen back");
}

// ================= F =================
console.log("F · stale by age");
{
  const d = (s) => FR.dueOf(s, null, Date.parse("2026-10-01T12:00:00Z"));
  ok(d("2026-07-02").due === true && d("2026-07-03").due === false && d("2026-07-03").dueOn === "2026-10-01" && FR.dueOf("2026-09-01", 30, Date.parse("2026-10-01T12:00:00Z")).due === false
    && FR.dueOf("2026-08-31", 30, Date.parse("2026-10-01T12:00:00Z")).due === true && FR.dueOf(null) === null && FR.shelfOf(0) === 90 && FR.shelfOf(4000) === 90 && FR.shelfOf(30) === 30,
    "dueOf: due once asOf + its shelf life is before today (90 days by default, a kind's own when set); no asOf, never due");
  const db = new DatabaseSync(":memory:");
  let bad = 0;
  for (let i = 0; i < 400; i++) {
    const asOf = iso(Date.now() - Math.floor(rnd() * 400) * 86400000).slice(0, 10), days = rnd() < 0.5 ? null : 1 + Math.floor(rnd() * 200);
    const sql = db.prepare(`SELECT ${FR.DUE_SQL("?", "?")} AS due`).get(asOf, days).due === 1;
    if (sql !== FR.dueOf(asOf, days).due) bad++;
  }
  ok(!bad, `the SQL twin (the checklist's count) agrees with dueOf on 400 dates and shelf lives (${bad} apart)`);
}

// ================= G =================
console.log("G · pick-up");
{
  const db = freshDb();
  const ins = (id, by, shape, extra = {}) => W(db, "INSERT INTO transmission (id,submitter,lane,kind,what,why,parent,route,status,eval,project,created_at,shape,next_by,next_who,next_due,org) VALUES (?,?,?,?,?,?,?,'auto','routed',?,'alpha',?,?,?,?,?,1)",
    id, by, extra.lane || "code", extra.kind || "pr", "w " + id, "y", extra.parent || null, extra.eval || 0, iso(Date.now()), shape ? JSON.stringify(shape) : null, shape && shape.next ? shape.next.by || null : null, shape && shape.next ? shape.next.who || null : null, shape && shape.next ? shape.next.by || null : null);
  ins("T-20261001-200", "p-a", { next: { what: "review the copy", who: "bo@x.test", by: "2026-09-30" } });
  ins("T-20261001-201", "p-a", { next: { what: "ship it", by: "2026-10-03" } });
  ins("T-20261001-202", "p-a", null);
  ins("T-20261001-203", "p-a", { next: { what: "call the vendor", who: "x@x.test", by: "2026-10-05" } });
  const env = () => envOf(db, "alpha");
  const OWN = { id: "p-o", name: "Owen", role: "owner", email: "o@x.test" }, ADA = { id: "p-a", role: "member", email: "ada@x.test" }, BO = { id: "p-b", role: "member", email: "bo@x.test" };
  const XAN = { id: "p-x", role: "member", email: "x@x.test" }, PAT = { id: "p-pa", role: "partner", email: "pat@x.test" };
  const fu0 = await PU.followUpsFor(env(), BO, { project: "alpha", nowMs: Date.parse("2026-10-01T12:00:00Z") });
  ok(fu0.rows.length === 3 && fu0.rows[0].id === "T-20261001-200" && fu0.rows[0].mine && fu0.rows[0].overdue && !fu0.rows[1].mine, `follow-ups due for Bo: his first (overdue), then by date (${fu0.rows.map((r) => `${r.id.slice(-3)}${r.mine ? "*" : ""}${r.overdue ? "!" : ""}`).join(" ")})`);
  const none = await PU.pickUp(ADA, env(), { id: "T-20261001-202" });
  ok(none.error === "no_next_action", "no next action: nothing to pick up");
  const stranger = await PU.pickUp(PAT, env(), { id: "T-20261001-200" });
  ok(stranger.error === "not_found", "a Partner seated nowhere: not_found, as a missing id");
  const named = await PU.pickUp(XAN, env(), { id: "T-20261001-203" });
  ok(!named.error && named.pickedUp.by.id === "p-x" && named.handedOver, "the person next.who names may pick it up though seated elsewhere (a handover)", show(named));
  const xOther = await PU.pickUp(XAN, env(), { id: "T-20261001-201" });
  ok(xOther.error === "not_found", "but not another contribution of a project they hold no seat on");
  const bo = await PU.pickUp(BO, env(), { id: "T-20261001-200" });
  ok(!bo.error && bo.pickedUp.by.id === "p-b" && bo.handedOver === true && /taken over from/.test(bo.note), `Bo picks up Ada's next action: a handover (${bo.note})`);
  const again = await PU.pickUp(ADA, env(), { id: "T-20261001-200" });
  ok(again.error === "next_taken" && again.pickedUp.by.id === "p-b", "the second pick-up is told who has it");
  const twice = await PU.pickUp(BO, env(), { id: "T-20261001-200" });
  ok(!twice.error && /already/.test(twice.note), "picking up what you hold changes nothing");
  const fu1 = await PU.followUpsFor(env(), BO, { project: "alpha" });
  ok(!fu1.rows.some((r) => r.id === "T-20261001-200"), "a picked-up follow-up leaves the due list (the index holds open ones only)");
  const relX = await PU.pickUp(XAN, env(), { id: "T-20261001-200", release: true });
  ok(relX.error === "not_found", "a stranger cannot release it");
  const relA = await PU.pickUp(ADA, env(), { id: "T-20261001-200", release: true });
  ok(!relA.error && relA.released && !relA.pickedUp && (await PU.followUpsFor(env(), BO, { project: "alpha" })).rows.some((r) => r.id === "T-20261001-200"), "the contributor releases it: free again, and due again");
  const self = await PU.pickUp(ADA, env(), { id: "T-20261001-201" });
  ok(!self.error && self.handedOver === false, "the contributor may take their own next action: not a handover");
  const doneB = await PU.pickUp(BO, env(), { id: "T-20261001-201", done: true });
  ok(doneB.error === "next_taken", "done by someone who does not hold it: next_taken");
  const doneA = await PU.pickUp(ADA, env(), { id: "T-20261001-201", done: true, note: "shipped" });
  ok(!doneA.error && doneA.done && doneA.done.note === "shipped" && (await PU.pickUp(BO, env(), { id: "T-20261001-201" })).error === "next_done", "the holder marks it done (with a note); then it is done for everyone");
  // a child contribution closes it; a counter does not
  ins("T-20261001-210", "p-b", null, { kind: "counter", lane: "leader", parent: "T-20261001-200" });
  ok(!db.prepare("SELECT next_done_at FROM transmission WHERE id = 'T-20261001-200'").get().next_done_at, "a counter naming it as parent does not close it");
  ins("T-20261001-211", "p-b", null, { parent: "T-20261001-200" });
  const closed = db.prepare("SELECT next_done_at, next_done_by, next_due FROM transmission WHERE id = 'T-20261001-200'").get();
  ok(closed.next_done_by === "T-20261001-211" && closed.next_due === null, "a later contribution naming it as parent closes it (done by that contribution, out of the due list)", show(closed));
  // the handover measure: one statement on its partial index
  const plan = db.prepare("EXPLAIN QUERY PLAN " + PU.HANDOFFS_SQL).all("alpha").map((r) => r.detail).join(" | ");
  const m = db.prepare(PU.HANDOFFS_SQL).get("alpha");
  ok(/USING INDEX idx_transmission_handoffs/.test(plan) && !/SCAN transmission\b/.test(plan.replace(/USING INDEX/g, "")) && m.handoffs === 1 && m.first_handoff,
    `the handover measure counts ${m.handoffs} (Xan's; Bo's was released, Ada's own is none) in one statement: ${plan}`);
  const fplan = db.prepare("EXPLAIN QUERY PLAN " + (await imp("src/data.js")).orgSql(PU.FOLLOWUPS_SQL(false, false, false), 1)).all("alpha", 7).map((r) => r.detail).join(" | ");
  ok(/idx_transmission_followups/.test(fplan), `the follow-ups read one range of idx_transmission_followups: ${fplan}`);
}

console.log(`\n${fails ? "✗" : "✓"} impact selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
