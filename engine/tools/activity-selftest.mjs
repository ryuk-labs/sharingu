// tools/activity-selftest.mjs — sprint 12 (12.5): Activity across every project (src/activity.js activityAcross, drawn by
// src/audit.js renderActivityAll at GET /audit?all=1 and answered by changes {org: true, list: true}). Offline: a REAL SQLite
// database from boot.sql (node:sqlite) wrapped as a D1 binding, two orgs, the real readers. It proves:
//   A. the plan: each project's scan is a range of idx_transmission_project (no table scan, no full sort), the shown rows
//      and their filers by primary key; the scan per project shares 1,000 rows (at least one each);
//   B. who reads what: the owner every ACTIVE project of its org (never an archived one, never another org's), a member and
//      a Partner their seats only, a seatless member or Partner nothing; `projects` narrows inside that set and refuses a
//      project outside it (another org's key, an archived one, an unseated one) with nothing read;
//   C. what is never shown: a suite row (unless eval), the mind namespace, a knowledge write to anyone but the owner;
//   D. paging is exact: walking `next` from the first page reaches every matching row once, in (created_at, id) order, with
//      ties in one millisecond and a capped project, for every filter (person, lane, state, since, projects) — compared with
//      the same rows read by brute force;
//   E. the four states as tempo words them, the door words, the refusals;
//   F. the page: "All projects" chosen, every row's project named and linked with its project, the filters, Older with the
//      cursor, no raw o<N>-- key; the one-project trail offers All projects;
// and runs the checks again against MUTANTS of src (a copy, one change each), each of which must turn something red.
//   node tools/activity-selftest.mjs        exit 0 when every check holds and every mutant is red
import { DatabaseSync } from "node:sqlite";
import { readFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { d1Of } from "./fixtures/home-d1.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");

// ---- the seeded database ----
const T0 = Date.UTC(2026, 8, 1);
const iso = (ms) => new Date(ms).toISOString();
const LANES = ["code", "design", "leader", "vendor", "ba", "gtm"];
const ROUTES = [["auto", null], ["owner", null], ["incomplete", null], ["owner", "approve"], ["owner", "reject"], ["owner", "needs-work"], ["auto", null]];
const KINDS = ["pr", "note", "screen", "knowledge", "grade", "doc", "answer"];
function seeded() {
  const db = new DatabaseSync(":memory:");
  db.exec(BOOT);
  db.prepare("INSERT INTO org (id, name, slug, created_at, updated_at) VALUES (1, 'Northwind', 'northwind', ?, ?), (2, 'Other', 'other', ?, ?)").run(iso(T0), iso(T0), iso(T0), iso(T0));
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org,title,hats) VALUES (?,?,?,?,?,1,?,?,?,?)");
  P.run("p-o", "Owen Park", "o@n.test", "owner", "h-o", iso(T0), 1, "CEO", JSON.stringify(["management"]));
  P.run("p-a", "Ada Member", "a@n.test", "member", "h-a", iso(T0), 1, null, JSON.stringify(["engineering"]));
  P.run("p-ab", "Bo Both", "ab@n.test", "member", "h-ab", iso(T0), 1, "QA lead", JSON.stringify(["engineering", "quality"]));
  P.run("p-pa", "Pia Partner", "pa@n.test", "partner", "h-pa", iso(T0), 1, null, JSON.stringify(["partner"]));
  P.run("p-p0", "Pat Nowhere", "p0@n.test", "partner", "h-p0", iso(T0), 1, null, null);
  P.run("p-m0", "Max Nowhere", "m0@n.test", "member", "h-m0", iso(T0), 1, null, null);
  P.run("p-x", "Xena Other", "x@o.test", "owner", "h-x", iso(T0), 2, null, null);
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${iso(T0)}'),('beta','Beta',1,'${iso(T0)}'),('gamma','Gamma',0,'${iso(T0)}'),('o2--x','Other X',1,'${iso(T0)}')`);
  const S = db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,'member',?)");
  for (const [p, k] of [["p-a", "alpha"], ["p-ab", "alpha"], ["p-ab", "beta"], ["p-pa", "alpha"], ["p-pa", "gamma"], ["p-x", "o2--x"]]) S.run(p, k, iso(T0));
  const X = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,decision,status,eval,gaprefs,via,project,created_at,org) VALUES (?,?,?,?,?,?,?,'routed',?,?,?,?,?,?)");
  const who = ["p-o", "p-a", "p-ab", "p-pa"], vias = ["mcp", "http", "build", null, "cli/0.3"];
  let seq = 0;
  const file = (project, n, org = 1, people = who) => {
    for (let i = 0; i < n; i++) {
      seq++;
      const [route, decision] = ROUTES[seq % ROUTES.length];
      // three rows a millisecond (a batch's filings share one), so ties in created_at are everywhere
      X.run(`T-20260901-${seq}`, people[seq % people.length], LANES[seq % LANES.length], KINDS[seq % KINDS.length], `${project.replace(/^o\d+--/, "")} work ${seq}`, route, decision,
        seq % 11 === 0 ? 1 : 0, seq % 13 === 0 ? "mind/x" : null, vias[seq % vias.length], project, iso(T0 + Math.floor(seq / 3) * 1000), org);
    }
  };
  file("beta", 30); file("alpha", 1000); file("beta", 30);
  // a `file` of 150 items lands in ONE millisecond: a capped scan smaller than it must still move on
  for (let i = 0; i < 150; i++) { seq++; X.run(`T-20260901-${seq}`, who[i % who.length], "code", "pr", `alpha batch ${i}`, "auto", null, 0, null, "mcp", "alpha", iso(T0 + 100 * 1000 + 1), 1); } file("gamma", 20); file("o2--x", 50, 2, ["p-x"]);
  // org-level rows (no project): never in the list
  for (let i = 0; i < 5; i++) { seq++; X.run(`T-20260901-${seq}`, "p-o", "leader", "note", "org level", "auto", null, 0, null, "mcp", null, iso(T0 + seq * 1000), 1); }
  // sprint 13 (13.1): which AI filed it (migrate-080's client), every word the door writes, NULL (unknown: a row from before) and
  // a raw string the door never writes (shown as nothing)
  db.exec("UPDATE transmission SET client = CASE CAST(substr(id, 12) AS INTEGER) % 9 WHEN 0 THEN 'claude' WHEN 1 THEN 'claude-code' WHEN 2 THEN NULL WHEN 3 THEN 'chatgpt' " +
    "WHEN 4 THEN 'codex' WHEN 5 THEN 'web' WHEN 6 THEN 'api' WHEN 7 THEN 'other' ELSE 'Claude Desktop 1.2' END");
  return db;
}

// ---- the checks, against one copy of src ----
async function suite(srcDir, { quiet = false } = {}) {
  let checks = 0, failed = 0;
  const ok = (cond, label) => { checks++; if (!cond) failed++; if (!quiet) console.log(`  ${cond ? "✓" : "✗"} ${label}`); };
  const im = (f) => import(pathToFileURL(join(srcDir, f)).href);
  const A = await im("activity.js"), AU = await im("audit.js"), D = await im("data.js"), H = await im("hotsql.js");
  const sq = seeded();
  const raw = d1Of(sq);
  let calls = 0;   // the D1 calls: one per statement outside a batch, one per batch
  const DB = { ...raw, prepare: (q) => { const st = raw.prepare(q); const w = (b) => ({ ...b, bind: (...a) => w(b.bind(...a)), all: () => { calls++; return b.all(); }, first: () => { calls++; return b.first(); }, _b: b });
      return w(st); }, batch: async (list) => { calls++; return Promise.all(list.map((st) => st._b.all())); }, statements: raw.statements };
  const envOf = (org = 1) => ({ DB, [D.ORG_SLOT]: { org } });
  const P = { owner: { id: "p-o", role: "owner", name: "Owen Park" }, a: { id: "p-a", role: "member" }, ab: { id: "p-ab", role: "member" }, pa: { id: "p-pa", role: "partner" },
    p0: { id: "p-p0", role: "partner" }, m0: { id: "p-m0", role: "member" }, x: { id: "p-x", role: "owner" } };
  const run = (p, a = {}, org = 1, o = {}) => A.activityAcross(envOf(org), p, a, o);
  const NO_SORT = (pl) => !/TEMP B-TREE/.test(pl) && !/SCAN t\b(?! USING)/.test(pl);

  // A. the plan
  const plan = (sql, args) => sq.prepare("EXPLAIN QUERY PLAN " + D.orgSql(sql, 1)).all(...args).map((r) => r.detail).join(" | ");
  const scanArgs = ["alpha", "", "9999", 500, 1, "", "", "", 0];
  const lt = plan(A.ACTIVITY_SCAN_SQL(false), scanArgs), le = plan(A.ACTIVITY_SCAN_SQL(true), scanArgs), mo = plan(A.ACTIVITY_MOMENT_SQL, scanArgs);
  ok(/SEARCH t USING INDEX idx_transmission_project \(project=\? AND created_at>\? AND created_at<\?\)/.test(lt) && /idx_transmission_project \(project=\? AND created_at>\? AND created_at<\?\)/.test(le) && NO_SORT(lt) && NO_SORT(le),
    `each project's scan is a range of idx_transmission_project in the index's own order: no table scan, NO sorter (D1 counts a sorted row twice) -> ${lt}`);
  ok(/SEARCH t USING INDEX idx_transmission_project \(project=\? AND created_at=\?\)/.test(mo) && NO_SORT(mo), `one moment's rows: one index range -> ${mo}`);
  const rowsPlan = plan(A.ACTIVITY_ROWS_SQL, ['["T-20260901-1"]']);
  ok(/SEARCH t USING INDEX sqlite_autoindex_transmission_1 \(id=\?\)/.test(rowsPlan) && /SEARCH p USING INDEX sqlite_autoindex_people_1 \(id=\?\)/.test(rowsPlan),
    `the shown rows and their filers by primary key -> ${rowsPlan}`);
  ok(A.ACTIVITY_ROWS_MAX === 1000 && A.ACTIVITY_LIMIT_MAX === 100 && A.ACTIVITY_MOMENT_MAX === 250, "the bound: 1,000 rows scanned, shared by the projects (at least one each), at most 100 shown");
  const before = DB.statements.length, c0 = calls;
  const first = await run(P.owner);
  ok(DB.statements.length - before === 4 && calls - c0 === 3, `three D1 calls: the readable projects, ONE batch of a scan per project (2), the shown rows (${DB.statements.length - before} statements, ${calls - c0} calls)`);

  // B. who reads what
  const projs = (r) => (r.projects || []).map((x) => x.project).join(",");
  const seen = (r) => [...new Set((r.items || []).map((x) => x.project))].sort().join(",");
  const all = async (p, a = {}, org = 1, o = {}) => { const out = []; let next = null, pages = 0, r;
    do { r = await run(p, { ...a, ...(next ? { before: next } : {}) }, org, o); if (r.error) return r; out.push(...r.items); next = r.next; pages++; } while (next && pages < 400);
    return { items: out, pages, projects: r.projects }; };
  const ownerAll = await all(P.owner, { limit: 100 });
  ok(projs(first) === "alpha,beta" && seen(ownerAll) === "alpha,beta", `the owner: every ACTIVE project of its org (not gamma, archived; not o2--x, another org's) -> ${projs(first)} / rows of ${seen(ownerAll)}`);
  const aAll = await all(P.a, { limit: 100 }), abAll = await all(P.ab, { limit: 100 }), paAll = await all(P.pa, { limit: 100 });
  ok(projs(aAll) === "alpha" && seen(aAll) === "alpha", `a member seated on alpha reads alpha alone -> ${seen(aAll)}`);
  ok(projs(abAll) === "alpha,beta" && seen(abAll) === "alpha,beta", `a member seated on both reads both -> ${seen(abAll)}`);
  ok(projs(paAll) === "alpha" && seen(paAll) === "alpha", `a Partner reads its seated ACTIVE projects only (its gamma seat is archived) -> ${seen(paAll)}`);
  const p0 = await run(P.p0), m0 = await run(P.m0);
  ok(p0.items.length === 0 && !p0.projects.length && m0.items.length === 0 && !m0.projects.length, "a Partner and a member seated nowhere read nothing (never the org-level rows)");
  const x = await all(P.x, { limit: 100 }, 2);
  ok(seen(x) === "o2--x" && x.items.length > 0 && x.items.every((i) => i.slug === "x"), `the other org's owner reads its own project alone, named by its slug -> ${seen(x)} (${x.items.length})`);
  const narrow = await all(P.ab, { projects: ["beta"], limit: 100 });
  ok(seen(narrow) === "beta" && projs(narrow) === "beta", "projects narrows inside the readable set");
  const forb = [await run(P.a, { projects: ["beta"] }), await run(P.owner, { projects: ["gamma"] }), await run(P.owner, { projects: ["o2--x"] }), await run(P.pa, { projects: "gamma" })];
  ok(forb.every((r) => r.error === "project_forbidden" && !r.items), `a project outside the set (unseated, archived, another org's) is refused project_forbidden, nothing listed -> ${forb.map((r) => r.error).join(",")}`);

  // C. what is never shown
  const ids = (r) => new Set(r.items.map((i) => i.id));
  const row = (id) => sq.prepare("SELECT * FROM transmission WHERE id = ?").get(id);
  const ownerRows = ownerAll.items.map((i) => row(i.id));
  ok(ownerRows.every((r) => r.eval === 0 && !(r.gaprefs || "").includes("mind/")), "no suite row and no mind row, even for the owner");
  ok(ownerRows.some((r) => r.kind === "knowledge") && [...aAll.items, ...abAll.items, ...paAll.items].every((i) => i.kind !== "knowledge"), "knowledge writes: the owner's alone");
  const evalAll = await all(P.owner, { eval: true, limit: 100 });
  ok(evalAll.items.some((i) => row(i.id).eval === 1), "eval: true includes the suites' rows");

  // D. paging is exact, against brute force
  const brute = (person, f = {}) => {
    const owner = person.role === "owner";
    const keys = owner ? ["alpha", "beta"] : sq.prepare("SELECT s.project_key AS k FROM project_seats s JOIN projects p ON p.key = s.project_key AND p.active = 1 AND p.org = 1 WHERE s.person_id = ?").all(person.id).map((r) => r.k);
    const want = f.projects ? keys.filter((k) => f.projects.includes(k)) : keys;
    return sq.prepare(`SELECT id, created_at, decision, route FROM transmission WHERE project IN (SELECT value FROM json_each(?)) AND eval = 0 AND ${H.notMind("")}
      AND (? = 1 OR COALESCE(kind,'') <> 'knowledge') AND (? = '' OR submitter = ?) AND (? = '' OR lower(lane) = ?) AND created_at >= ? ORDER BY created_at DESC, id DESC`)
      .all(JSON.stringify(want), owner ? 1 : 0, f.person || "", f.person || "", f.lane || "", f.lane || "", f.since || "")
      .filter((r) => !f.state || A.stateOf(r) === f.state).map((r) => r.id);
  };
  const cases = [[P.owner, {}, 7], [P.owner, {}, 50], [P.owner, {}, 100], [P.ab, {}, 13], [P.pa, {}, 9], [P.owner, { person: "p-pa" }, 10], [P.owner, { lane: "gtm" }, 25],
    [P.owner, { state: "with" }, 30], [P.owner, { state: "decided", lane: "code" }, 5], [P.ab, { projects: ["beta"] }, 4], [P.owner, { since: iso(T0 + 200 * 1000) }, 33], [P.owner, { person: "p-a", state: "needs" }, 3]];
  // the same with a scan smaller than the 150-row millisecond (rowsMax 40: 20 a project), so the one-moment read is walked
  cases.push([P.owner, {}, 10, { rowsMax: 40 }], [P.owner, { lane: "code" }, 30, { rowsMax: 40 }], [P.ab, { projects: ["alpha"] }, 7, { rowsMax: 40 }]);
  for (const [p, f, limit, o] of cases) {
    const got = await all(p, { ...f, limit }, 1, o || {});
    const want = brute(p, f);
    const g = got.items.map((i) => i.id);
    ok(g.length === want.length && g.every((id, i) => id === want[i]) && new Set(g).size === g.length,
      `${p.id} ${JSON.stringify(f)} limit ${limit}${o ? ` ${JSON.stringify(o)}` : ""}: every row once, newest first, in ${got.pages} pages (${g.length} of ${want.length})`);
  }
  const capped = await run(P.owner, { limit: 100 });
  ok(Array.isArray(capped.capped) && capped.capped.includes("alpha") && capped.more && /\|(lt|le)$/.test(capped.next), `a capped project is said (alpha: 1,150 rows, a share of 500) and the page goes on -> ${JSON.stringify(capped.capped)} ${capped.next}`);
  const at = (n) => iso(T0 + n * 1000);
  const R = (n, id, m = 1) => ({ at: at(n), id, m });
  const pc = A.pageOf([{ project: "a", rows: [R(9, "T-1"), R(5, "T-2"), R(3, "T-3")] }, { project: "b", rows: [R(4, "T-8"), R(2, "T-9")] }], { limit: 10, scan: 3 });
  ok(pc.shown.map((x) => x.id).join() === "T-1,T-2,T-8" && pc.next === `${at(3)}|le` && pc.capped.join() === "a",
    `pageOf (pure): a capped project's oldest moment bounds the page (its moment's rows may be owed: le); the other project's older row waits -> ${pc.shown.map((x) => x.id).join()} next ${pc.next}`);
  const pm = A.pageOf([{ project: "a", rows: [R(7, "T-1"), R(7, "T-2"), R(7, "T-3"), R(6, "T-4")] }], { limit: 2, scan: 9 });
  ok(pm.shown.map((x) => x.id).join() === "T-3,T-2" && pm.next === `${at(7)}|T-2`, `pageOf (pure): a moment that alone outgrows the page is split by id, never past the limit -> ${pm.shown.map((x) => x.id).join()} next ${pm.next}`);
  const pa = A.pageOf([{ project: "a", rows: [R(7, "T-1"), R(7, "T-2"), R(7, "T-3"), R(6, "T-4")] }], { limit: 2, scan: 9, after: { at: at(7), id: "T-2" } });
  ok(pa.shown.map((x) => x.id).join() === "T-1,T-4" && !pa.next, `pageOf (pure): the id cursor goes on with that moment's lower ids, then older moments -> ${pa.shown.map((x) => x.id).join()} next ${pa.next}`);
  const pms = A.pageOf([{ project: "a", rows: [R(7, "T-1"), R(7, "T-2"), R(9, "T-3"), R(6, "T-4")] }], { limit: 2, scan: 9 });
  ok(pms.shown.map((x) => x.id).join() === "T-3" && pms.next === `${at(9)}|lt`, `pageOf (pure): a moment is never split when the page holds a newer one -> ${pms.shown.map((x) => x.id).join()} next ${pms.next}`);
  const pw = A.pageOf([{ project: "a", rows: [R(7, "T-1"), R(7, "T-2")], moment: true }, { project: "b", rows: [R(8, "T-8")] }], { limit: 10, scan: 2 });
  ok(pw.shown.map((x) => x.id).join() === "T-8,T-2,T-1" && pw.next === `${at(7)}|lt`, `pageOf (pure): a moment read whole is known whole (lt) -> ${pw.shown.map((x) => x.id).join()} next ${pw.next}`);

  // E. states, doors, refusals
  const tempoWords = { landed: [["auto", null]], with: [["owner", null]], needs: [["incomplete", null]], decided: [["owner", "approve"], ["auto", "reject"], ["incomplete", "needs-work"]] };
  ok(Object.entries(tempoWords).every(([s, list]) => list.every(([route, decision]) => A.stateOf({ route, decision }) === s)), "the four states, a decision first, then the route (tempo's order)");
  const stSql = (route, decision) => sq.prepare(`SELECT ${A.STATE_SQL("s")} AS st FROM (SELECT ? AS route, ? AS decision) s`).get(route, decision).st;
  ok(ROUTES.every(([r, d]) => stSql(r, d) === A.stateOf({ route: r, decision: d })), "STATE_SQL and stateOf agree on every route and decision");
  ok(A.doorOf("mcp") === "mcp" && A.doorOf("http") === "api" && A.doorOf("build") === "web" && A.doorOf("cli/0.3") === null && A.doorOf(null) === null, "the door: mcp, api, web, else nothing (never a guessed client)");
  const it = ownerAll.items.find((i) => i.by && i.by.id === "p-ab");
  ok(it && it.by.name === "Bo Both" && it.by.role === "Member" && it.by.hats.join() === "engineering,quality" && it.by.title === "QA lead" && /\/contribution\/T-[^?]+\?page=1&project=(alpha|beta)$/.test(it.href),
    `who: the person, their role and hats; the link names its project -> ${it && JSON.stringify(it.by)} ${it && it.href}`);
  const bad = [await run(P.owner, { lane: "nope" }), await run(P.owner, { state: "open" }), await run(P.owner, { before: "yesterday" }), await run(P.owner, { since: "last week" }), await run(P.owner, { person: "a b" }), await run(P.owner, { projects: [{}] })];
  ok(bad.map((r) => r.error).join() === "bad_lane,bad_state,bad_before,bad_since,bad_person,project_forbidden", `the refusals -> ${bad.map((r) => r.error).join()}`);

  // G. the row budget with many projects (the sprint-12 review: 25 projects, each with ONE 200-item batch at its newest
  // millisecond, read 6,225 rows and answered 200 items a page): only the bound's millisecond is read whole, a page answers at
  // most ACTIVITY_LIMIT_MAX items, every page stays under 1,500 rows, and walking next still reaches every row once
  {
    const bq = new DatabaseSync(":memory:"); bq.exec(BOOT);
    bq.prepare("INSERT INTO org (id,name,slug,created_at,updated_at) VALUES (1,'N','north',?,?)").run(iso(T0), iso(T0));
    bq.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-o','O','o@x','owner','h',1,?,1),('p-m','M','m@x','member','h2',1,?,1)").run(iso(T0), iso(T0));
    const BX = bq.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,via,project,created_at,org) VALUES (?,?,'code','pr','w','auto','routed',0,'mcp',?,?,1)");
    let n = 0;
    for (let p = 0; p < 25; p++) {
      bq.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)").run("p" + p, "P" + p, iso(T0));
      bq.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-m',?,'member',?)").run("p" + p, iso(T0));
      for (let i = 0; i < 30; i++) BX.run(`T-20261001-${++n}`, "p-m", "p" + p, iso(T0 + i * 1000));
      for (let i = 0; i < 200; i++) BX.run(`T-20261001-${++n}`, "p-m", "p" + p, iso(T0 + 10_000_000 + p * 7));
    }
    let rows = 0;
    const wrap = (sql, args = []) => ({ bind: (...a) => wrap(sql, a), all: async () => { const r = bq.prepare(sql).all(...args); rows += r.length; return { results: r }; },
      first: async () => { const r = bq.prepare(sql).get(...args) ?? null; rows += r ? 1 : 0; return r; } });
    const benv = { DB: { prepare: (q) => wrap(q), batch: async (l) => Promise.all(l.map((st) => st.all())) }, [D.ORG_SLOT]: { org: 1 } };
    const want = bq.prepare("SELECT id FROM transmission ORDER BY created_at DESC, id DESC").all().map((r) => r.id);
    for (const [who, limit] of [[P.owner, 100], [{ id: "p-m", role: "member" }, 100], [P.owner, 50]]) {
      const got = [], perPage = [];
      let next = null, maxItems = 0, guard = 0;
      do {
        rows = 0;
        const r = await A.activityAcross(benv, who, { limit, ...(next ? { before: next } : {}) }, { sinceDays: null });
        if (r.error) { got.length = 0; break; }
        perPage.push(rows); maxItems = Math.max(maxItems, r.items.length); got.push(...r.items.map((i) => i.id)); next = r.next;
      } while (next && ++guard < 2000);
      const worst = Math.max(...perPage);
      ok(got.length === want.length && got.every((id, i) => id === want[i]) && maxItems <= limit && worst < 1500,
        `${who.role} limit ${limit}, 25 projects x a 200-item batch: ${perPage.length} pages, at most ${maxItems} items a page, worst page ${worst} rows (first ${perPage[0]}), every row once (${got.length} of ${want.length})`);
    }
  }

  // H. which AI filed it (sprint 13, 13.1): each item carries the row's client word, read with the shown rows (no statement of its
  // own); NULL is unknown (null, shown as nothing), a string the door never writes reads as unknown too, never shown raw
  const CW = ["claude", "claude-code", "chatgpt", "codex", "web", "api", "other"];
  const cl = ownerAll.items.map((i) => [i, row(i.id).client]);
  ok(cl.length > 0 && cl.every(([i, c]) => "client" in i && i.client === (CW.includes(c) ? c : null)), "each item's client is its row's word, NULL and an unknown string read as null");
  ok(CW.every((w) => cl.some(([i]) => i.client === w)) && cl.some(([i, c]) => c === null && i.client === null) && cl.some(([i, c]) => c === "Claude Desktop 1.2" && i.client === null),
    `every word the door writes reaches the item; NULL and a raw string are null (${[...new Set(cl.map(([i]) => i.client))].join(",")})`);
  const sample = (client, n) => ({ id: `T-20260901-c${n}`, at: iso(T0 + 1000 * n), project: "alpha", slug: "alpha", projectName: "Alpha", lane: "code", kind: "pr", what: `filed ${n}`, state: "landed",
    by: { id: "p-a", name: "Ada Member" }, door: "mcp", client, href: "/contribution/x" });
  const ch = AU.renderActivityAll({ projects: [{ project: "alpha", slug: "alpha", name: "Alpha" }], items: [sample("claude-code", 1), sample(null, 2), sample("chatgpt", 3), sample("Claude Desktop 1.2", 4)] },
    { filters: {}, states: A.ACTIVITY_STATES, nowMs: T0 + 2000 * 1000 });
  const fromWords = ch.match(/from [A-Z][A-Za-z ]+/g) || [];
  ok(/Alpha · Code · from Claude Code/.test(ch) && /from ChatGPT/.test(ch) && fromWords.length === 2 && !/Claude Desktop/.test(ch),
    `the page: a row's line says which AI filed it ("from Claude Code"); unknown says nothing, a raw string is never shown (${fromWords.join(" | ")})`);
  ok((ch.match(/as the tool names itself/g) || []).length === 2, "the detail names it too, as the tool's own say (a label, not proof), only where it is known");

  // F. the page
  const html = AU.renderActivityAll(first, { filters: { in: "", who: "", lane: "", state: "", since: "" }, ownerName: "Owen Park", states: A.ACTIVITY_STATES, nowMs: T0 + 2000 * 1000 });
  ok(/data-screen="audit" data-scope="all"/.test(html) && /data-region="trail"/.test(html), "the page: the Activity screen, scope all, its trail region");
  ok(/aria-current="true"[^>]*>(?:<[^>]+>)*<span class="p-fchip-w">All projects</.test(html) || /<a class="p-fchip" href="[^"]*" aria-current="true"><span class="p-fchip-w">All projects<\/span>/.test(html), "All projects is the chosen project");
  ok(/data-project="alpha"/.test(html) && /data-project="beta"/.test(html) && /Alpha · /.test(html) && /Beta · /.test(html), "each row names its project (by name) and carries it");
  ok(/href="\/contribution\/T-[^"]+\?page=1&amp;project=alpha"/.test(html), "each row links to its contribution in its project");
  ok(/data-state="with"/.test(html) && /With Owen Park/.test(html) && /Needs more/.test(html) && /Landed/.test(html), "the states in tempo's words");
  ok(/href="[^"]*before=2026-[^"]*%7C(lt|le)" data-button="older"/.test(html), "Older carries the cursor");
  const xhtml = AU.renderActivityAll(x.items.length ? { ...(await run(P.x, {}, 2)) } : first, { filters: {}, states: A.ACTIVITY_STATES });
  ok(!/o2--x/.test(xhtml) && /Other X/.test(xhtml), "another org's project reads by its name, never its o<N>-- key");
  const one = AU.renderAudit([], { allProjects: { name: "Alpha" }, filters: {}, options: { kinds: [], lanes: [], routes: [] } });
  const none = AU.renderAudit([], { filters: {}, options: { kinds: [], lanes: [], routes: [] } });
  ok(/data-button="all-projects"/.test(one) && /href="\/audit\?all=1"/.test(one) && !/all-projects/.test(none), "the one-project trail offers All projects only to a reader of several");
  return { checks, failed };
}

console.log("activity-selftest — Activity across every project (src/activity.js, src/audit.js)");
const main = await suite(join(ENGINE, "src"));

// ---- the mutants: a copy of src, one change each; each must turn a check red ----
const MUTANTS = [
  ["a member reads knowledge writes", "activity.js", "(?5 = 1 OR COALESCE(t.kind,'') <> 'knowledge')", "(1 = 1 OR COALESCE(t.kind,'') <> 'knowledge')"],
  ["the suites' rows always shown", "activity.js", "(?9 = 1 OR t.eval = 0)", "(?9 = 1 OR 1 = 1)"],
  ["the cursor repeats its moment", "activity.js", '(le ? "<=" : "<")', '(le ? "<=" : "<=")'],
  ["the capped bound ignored", "activity.js", "const known = (h) => bound == null ||", "const known = (h) => true ||"],
  ["a moment split across pages", "activity.js", "if (cands[limit].at === t) {", "if (false) {"],
  ["a moment held whole past the limit", "activity.js", "if (before.length) shown = before; else split = true;", "if (before.length) shown = before; else shown = cands.filter((h) => h.at === t);"],
  ["every one-moment scan read whole, not only the bound's", "activity.js", " && String(x.rows[0].at) === bound);", ");"],
  ["the id cursor repeats its moment's shown ids", "activity.js", " && String(r.id) >= after.id)", " && false)"],
  ["a one-moment scan not read whole", "activity.js", "if (one.length) {", "if (false) {"],
  ["the scan sorted (each row read twice)", "activity.js", '"ORDER BY t.created_at DESC LIMIT ?4"', '"ORDER BY t.created_at DESC, t.id DESC LIMIT ?4"'],
  ["every reader reads the owner's projects", "activity.js", "const held = await projectsHeldBy(person, env);", "const held = await projectsHeldBy({ ...person, role: \"owner\" }, env);"],
  ["projects not checked against the set", "activity.js", "if (bad.length) return", "if (false) return"],
  ["a state worded wrong", "activity.js", "WHEN ${a}.route = 'owner' THEN 'with'", "WHEN ${a}.route = 'owner' THEN 'needs'"],
  ["the scan not in time order", "activity.js", '"ORDER BY t.created_at DESC LIMIT ?4"', '"ORDER BY t.lane DESC LIMIT ?4"'],
  ["the client not read", "activity.js", "t.via, t.client, t.created_at", "t.via, NULL AS client, t.created_at"],
  ["a raw client string passed through", "activity.js", "client: clientOfRow(r.client)", "client: r.client || null"],
  ["the page shows no client", "audit.js", "x.client && clientWordOf(x.client) ? `from ${esc(clientWordOf(x.client))}` : \"\"", "\"\""],
  ["the page names a project by its key", "audit.js", "sub: [esc(x.projectName || x.slug || \"\")", "sub: [esc(x.project || \"\")"],
];
let red = 0;
for (const [label, file, from, to] of MUTANTS) {
  const dir = mkdtempSync(join(ENGINE, ".runs", "activity-mutant-"));   // under engine/: the copy resolves engine/node_modules
  try {
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const p = join(dir, "src", file), text = readFileSync(p, "utf8");
    if (!text.includes(from)) { console.log(`  ✗ mutant "${label}": its text is no longer in src/${file}`); main.failed++; main.checks++; continue; }
    writeFileSync(p, text.replace(from, to));
    const r = await suite(join(dir, "src"), { quiet: true });
    const isRed = r.failed > 0;
    if (isRed) red++;
    main.checks++; if (!isRed) main.failed++;
    console.log(`  ${isRed ? "✓" : "✗"} mutant red: ${label} (${r.failed} of ${r.checks} checks fail)`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`\n${main.checks - main.failed}/${main.checks} checks hold · ${red}/${MUTANTS.length} mutants red`);
process.exit(main.failed ? 1 : 0);
