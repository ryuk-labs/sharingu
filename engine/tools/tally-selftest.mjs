// tools/tally-selftest.mjs — sprint 2, the live budget (migrate-042). Offline: no wrangler, no network.
//
// The four tallies (transmission_open, transmission_kinds, transmission_goals, loops_open) are kept by triggers, and the
// hot reads that used to sum the ledger now read them. This proves both halves on a REAL SQLite built from boot.sql
// (node:sqlite, the tools/d1-hot-selftest.mjs way), over thousands of seeded random writes: filings of every route, status,
// kind (the excluded kinds, none, an odd one), eval flag, mind ref, via, goal ref, lane case, outcome and actual; decisions
// (approve, reject, needs-work); updates of every column a tally reads and of columns none reads; deletes; loops opened,
// closed, re-referenced and deleted.
//   A. EXACT: after every batch each tally equals the same sums recomputed from the ledger (groups of zeros ignored).
//   B. SAME ANSWER: every read that moved onto a tally answers exactly what the ledger statement it replaced answers (the
//      old SQL is kept here, verbatim from the commit before, as the reference), for every scope, eval view, period and
//      reader: GOALS_AGG_SQL, BUILD_AGG_SQL (summed per kind, as src/build.js does), HOME_TX_AGG_SQL, HOME_SEATS_SQL, the
//      badge's OWNER_OPEN_COUNT_SQL and LOOPS_OPEN_SQL.
//   C. THE INSTRUMENT: each check can fail — a tally with one trigger dropped drifts and A goes red; B's comparison goes red
//      on a read with a filter taken out.
//   D. THE MIGRATION: migrate-042.sql replays over a database that already holds rows (boot.sql before 042, rows, then the
//      file, then migrate-050.sql, which redefines transmission_open), its backfill fills the tallies exactly, and a second run
//      of the files changes nothing.
//   E. THE OPEN COUNT (sprint 3, B3; migrate-050): transmission_open counts no record (a filing of kind knowledge or grade
//      routed auto: a preview then file call's row, a grade with proof); on a database whose tally still counted them (the
//      migrate-042 triggers), migrate-050.sql recomputes it exactly and its triggers keep it so; a grade routed to the owner
//      still counts (it waits on a person), and the badge's pending rulings do not move.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
// sprint 6 (6.2): every statement as org 1's request runs it (src/data.js writes {org} and {orgbucket} in; the fixtures are org 1's)
const { org1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "org.mjs")).href);
const H = Object.fromEntries(Object.entries(await import(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href)).map(([k, v]) => [k, org1(v)]));
const { weekOf, weekFromRows } = await import(pathToFileURL(join(ENGINE, "src", "week.js")).href);
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M042 = readFileSync(join(ENGINE, "migrate-042.sql"), "utf8");
const M050 = readFileSync(join(ENGINE, "migrate-050.sql"), "utf8");
const M054 = readFileSync(join(ENGINE, "migrate-054.sql"), "utf8");   // sprint 3 B4: transmission_goals keyed on when the work happened
// sprint 6 (6.1): migrate-067 owns the nine running-count triggers now (the bucket per org; 050 and 054 no longer drop them, so a
// replay of either never puts its version back over 067's): its section 4, applied after them as the chain does
const M067_COUNTS = (() => { const m = readFileSync(join(ENGINE, "migrate-067.sql"), "utf8"); return m.slice(m.indexOf("-- 4 · the running counts"), m.indexOf("-- 5 · the dead table")); })();
// a record: the row a write files, never open work (sprint 3, B3)
const RECORD = (a) => { const p = a ? a + "." : ""; return `(COALESCE(${p}kind,'') IN ('knowledge','grade') AND ${p}route IS 'auto')`; };
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };

// ---- the ledger reference: the statements the reads replaced (the commit before sprint 2, verbatim in effect) ----
const notMind = H.notMind;
const projWhere = (col, scoped) => (scoped ? `${col} = ?` : `${col} IS NULL`);
const txEval = (col, e) => (e ? "" : ` AND ${col} = 0`);
const SHIPPED_CSV = "," + H.SHIPPED_NOT_KIND.replace(/[()' ]/g, "") + ",";
const OLD = {
  goals: (scoped, e) => "SELECT goal_ref, LOWER(lane) AS lane, COUNT(*) AS n, COALESCE(SUM(outcome),0) AS s, " +
    "COALESCE(SUM(CASE WHEN outcome IS NULL THEN 1 ELSE 0 END),0) AS no_outcome, " +
    "COALESCE(SUM(CASE WHEN outcome IS NULL AND (actual IS NULL OR actual = '') THEN 1 ELSE 0 END),0) AS awaiting " +
    // sprint 3 B4 (migrate-054): the period counts a contribution by the month its work HAPPENED (happened_at, else when it
    // was filed): the month form, so a happenedAt that is a date on the first of a month counts in that month
    "FROM transmission WHERE " + projWhere("project", scoped) + " AND substr(COALESCE(happened_at, created_at), 1, 7) >= substr(?, 1, 7) AND (route = 'auto' OR decision = 'approve') " +
    "AND COALESCE(+kind,'') NOT IN " + H.GOALS_NOT_KIND + " AND " + notMind("") + (e ? "" : " AND +eval = 0 AND " + H.NOT_EVAL_PROBE) +
    " GROUP BY goal_ref, LOWER(lane)",
  build: (scoped, e) => "SELECT COALESCE(kind,'') AS kind, COUNT(*) AS n, " +
    "COALESCE(SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END),0) AS open_n, " +
    // D2b: in motion = not landed (a contribution filed straight through has landed): with a person, or needing more this week
    "COALESCE(SUM(CASE WHEN decision IS NULL AND (route = 'owner' OR (route = 'incomplete' AND created_at >= ?)) THEN 1 ELSE 0 END),0) AS motion_n, " +
    "COALESCE(SUM(CASE WHEN (decision = 'approve' OR (decision IS NULL AND route = 'auto')) AND (COALESCE(components,'') != '' OR COALESCE(screens,'') != '') " +
    "AND COALESCE(decided_at, created_at) >= ? AND COALESCE(decided_at, created_at) < ? THEN 1 ELSE 0 END),0) AS canvas_n " +
    "FROM transmission WHERE " + projWhere("project", scoped) + " AND " + H.BUILD_SCOPE("") + " AND COALESCE(+kind,'') NOT IN (" + H.BUILD_NOT_KIND + ") AND " + notMind("") +
    txEval("+eval", e) + " GROUP BY COALESCE(kind,'')",
  home: (scoped, e) => "SELECT " +
    "COALESCE(SUM(CASE WHEN route = 'owner' AND decision IS NULL AND COALESCE(kind,'') NOT IN " + H.HOME_NOT_APPROVE + " THEN 1 ELSE 0 END),0) AS approve_n, " +
    "COALESCE(SUM(CASE WHEN route = 'owner' AND decision IS NULL AND kind = 'grant' THEN 1 ELSE 0 END),0) AS grant_n, " +
    "COALESCE(SUM(CASE WHEN route = 'owner' AND decision IS NULL THEN 1 ELSE 0 END),0) AS with_n, " +
    // D2b: the contributions (all time, never a record nor the list's own presses), each kind with its count; in motion's
    // "needs more" this week (a contribution filed straight through has landed, so "in" left the count)
    "COALESCE(SUM(CASE WHEN COALESCE(kind,'') NOT IN ('knowledge','grade'," + H.BUILD_NOT_KIND + ") AND " + notMind("") + " THEN 1 ELSE 0 END),0) AS contrib_n, " +
    "(SELECT json_group_array(json_array(k, c)) FROM (SELECT COALESCE(kind,'') AS k, COUNT(*) AS c FROM transmission WHERE " + projWhere("project", scoped) + txEval("eval", e) +
    " AND COALESCE(kind,'') NOT IN ('knowledge','grade'," + H.BUILD_NOT_KIND + ") AND " + notMind("") + " GROUP BY COALESCE(kind,''))) AS contrib_kinds, " +
    "COALESCE(SUM(CASE WHEN route = 'incomplete' AND decision IS NULL AND created_at >= ? THEN 1 ELSE 0 END),0) AS more_n, " +
    "COALESCE(SUM(CASE WHEN (decision = 'approve' OR (decision IS NULL AND route = 'auto')) AND COALESCE(decided_at, created_at) >= ? " +
    "AND instr('" + SHIPPED_CSV + "', ',' || COALESCE(kind,'') || ',') = 0 THEN 1 ELSE 0 END),0) AS shipped_n, " +
    (scoped ? "(SELECT created_at FROM transmission WHERE project = ? AND kind = 'knowledge' ORDER BY created_at DESC LIMIT 1)" : "NULL") + " AS knowledge_at " +
    "FROM transmission WHERE " + projWhere("project", scoped) + txEval("eval", e),
  // sprint 3 L2: the week as Home counts it, over the contributions (never a record, a press or R's own mind/* rows): filed in it,
  // needs more filed in it, and what landed in it (filed in it, or decided in it) of the shipped kinds. Binds: since, [project]?
  // sprint 3 L3 (happenedAt, one definition): the week's filed count is the work filed in it that HAPPENED in it (happened_at,
  // else created_at, later than the week's start); work filed this week that happened before it is not this week's work
  week: (scoped, e) => "SELECT COALESCE(SUM(CASE WHEN created_at >= ?1 AND julianday(COALESCE(happened_at, created_at)) > julianday(?1) THEN 1 ELSE 0 END),0) AS filed, " +
    "COALESCE(SUM(CASE WHEN created_at >= ?1 AND route = 'incomplete' AND decision IS NULL THEN 1 ELSE 0 END),0) AS more_n, " +
    "COALESCE(SUM(CASE WHEN (decision = 'approve' OR (decision IS NULL AND route = 'auto')) AND COALESCE(decided_at, created_at) >= ?1 " +
    "AND instr('" + SHIPPED_CSV + "', ',' || COALESCE(kind,'') || ',') = 0 THEN 1 ELSE 0 END),0) AS shipped_n " +
    "FROM transmission WHERE " + projWhere("project", scoped).replace("?", "?2") + " AND COALESCE(kind,'') NOT IN ('knowledge','grade'," + H.BUILD_NOT_KIND + ") AND " + notMind("") + txEval("eval", e),
  seats: (scoped) => scoped
    ? "SELECT pr.name AS project_name, (SELECT COUNT(*) FROM projects WHERE active = 1) AS projects, p.id, p.name, p.email, p.role, s.role AS seat_role " +
      "FROM projects pr LEFT JOIN project_seats s ON s.project_key = pr.key LEFT JOIN people p ON p.id = s.person_id AND p.active = 1 WHERE pr.key = ? " +
      "UNION ALL SELECT NULL, NULL, p.id, p.name, p.email, p.role, 'admin' FROM people p WHERE p.role = 'owner' AND p.active = 1 AND p.id NOT IN (SELECT person_id FROM project_seats WHERE project_key = ?)"
    : "SELECT NULL AS project_name, (SELECT COUNT(*) FROM projects WHERE active = 1) AS projects, p.id, p.name, p.email, p.role, NULL AS seat_role FROM people p WHERE p.active = 1",
  badge: (pcSql, e) => "SELECT COUNT(*) AS n FROM transmission t WHERE " + (e ? "" : "t.eval=0 AND ") + "t.route='owner' AND t.status != 'closed' AND " + notMind("t") + pcSql,
  loops: (allRefs) => "SELECT COUNT(*) AS n FROM loops WHERE person_id = ? AND status = 'open'" + (allRefs ? "" : " AND (ref IS NULL OR ref NOT LIKE 'mind/%')"),
};
// the tallies recomputed from the ledger (migrate-042's definitions, independently written)
const MIND = "CASE WHEN (gaprefs IS NULL OR gaprefs NOT LIKE '%mind/%') AND (components IS NULL OR components NOT LIKE '%mind/%') THEN 0 ELSE 1 END";
const RECOUNT = {
  transmission_open: "SELECT COALESCE(project,'') AS project, eval, " + MIND + " AS mind, route, CASE WHEN via LIKE 'mcp%' OR via LIKE 'cli%' THEN 1 ELSE 0 END AS agent, COUNT(*) AS n FROM transmission WHERE status != 'closed' AND NOT " + RECORD() + " GROUP BY 1,2,3,4,5",
  transmission_kinds: "SELECT COALESCE(project,'') AS project, eval, " + MIND + " AS mind, COALESCE(kind,'') AS kind, COUNT(*) AS n, SUM(status != 'closed') AS n_open, SUM(route = 'owner' AND decision IS NULL) AS n_owner_undecided FROM transmission GROUP BY 1,2,3,4",
  transmission_goals: "SELECT COALESCE(project,'') AS project, CASE WHEN eval = 0 AND (what IS NULL OR (what NOT LIKE '%eval probe%' AND what NOT LIKE '%[eval%')) THEN 1 ELSE 0 END AS clean, " +
    "CASE WHEN goal_ref IS NULL THEN '' ELSE '=' || goal_ref END AS goal_ref, LOWER(lane) AS lane, substr(COALESCE(happened_at, created_at),1,7) AS month, " +
    "CASE WHEN COALESCE(kind,'') IN " + H.GOALS_NOT_KIND + " THEN COALESCE(kind,'') ELSE '*' END AS kind, COUNT(*) AS n, COALESCE(SUM(outcome),0) AS s, SUM(outcome IS NULL) AS no_outcome, " +
    "SUM(outcome IS NULL AND (actual IS NULL OR actual = '')) AS awaiting FROM transmission WHERE (route = 'auto' OR decision = 'approve') AND " + MIND + " = 0 GROUP BY 1,2,3,4,5,6",
  loops_open: "SELECT person_id, CASE WHEN ref IS NULL OR ref NOT LIKE 'mind/%' THEN 0 ELSE 1 END AS mind, COUNT(*) AS n FROM loops WHERE status = 'open' GROUP BY 1,2",
};
const KEYS = { transmission_open: 5, transmission_kinds: 4, transmission_goals: 6, loops_open: 2 };
const canon = (rows, nKey) => rows.filter((r) => Number(r.n) !== 0).map((r) => {
  const v = Object.values(r); return v.slice(0, nKey).join("|") + " => " + v.slice(nKey).map((x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x)).join(",");
}).sort();
function tallyDrift(db) {
  const bad = [];
  for (const [t, sql] of Object.entries(RECOUNT)) {
    const cols = Object.keys(db.prepare(sql + " LIMIT 1").all()[0] || {}).join(", ") || "*";
    const have = canon(db.prepare(`SELECT ${cols} FROM ${t}`).all(), KEYS[t]), want = canon(db.prepare(sql).all(), KEYS[t]);
    if (JSON.stringify(have) !== JSON.stringify(want)) bad.push(t);
  }
  return bad;
}

// ---- a seeded world and the random writes ----
let seed = 20260930;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const iso = (daysAgo) => new Date(Date.parse("2026-09-30T12:00:00.000Z") - daysAgo * 864e5).toISOString();
const NOW = "2026-09-30T12:00:00.000Z", SINCE7 = iso(7);
const PEOPLE = ["p-o", "p-a", "p-b", "p-c", "p-x", "eval-fixed-owner"];
function world(schema = BOOT) {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)");
  P.run("p-o", "Owen", "o@t", "owner", "h-o", 1, iso(400)); P.run("p-a", "Ada", "a@t", "internal-eng", "h-a", 1, iso(300));
  P.run("p-b", "Bo", "b@t", "design", "h-b", 1, iso(300)); P.run("p-c", "Cy", "c@t", "product", "h-c", 0, iso(300));
  P.run("p-x", "Xi", "x@t", "owner", "h-x", 1, iso(200)); P.run("eval-fixed-owner", "eval owner", "e@t", "owner", "h-e", 1, iso(100));
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${iso(400)}'),('beta','Beta',1,'${iso(400)}'),('gamma','Gamma',0,'${iso(400)}')`);
  const S = db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
  for (const [p, k] of [["p-a", "alpha"], ["p-b", "alpha"], ["p-b", "beta"], ["p-c", "alpha"], ["eval-fixed-owner", "alpha"], ["p-a", "gamma"]]) S.run(p, k, "member", iso(300));
  return db;
}
const KINDS = ["pr", "fix", "screen", "note", "grant", "answer", "round", "counter", "critique", "rank", "restore", "item", "publish", "equip", "knowledge", "grade", "knowledge", "grade", null, "", "odd,kind"];
let txN = 0, loopN = 0;
function randomWrite(db, ids, loops) {
  const r = rnd();
  if (r < 0.5 || !ids.length) {
    const id = `T-20260930-${String(++txN).padStart(4, "0")}`, created = iso(rnd() * 200);
    const route = pick(["auto", "owner", "incomplete"]);
    // happened_at (sprint 3, migrate-051/054): none, a date or a date-time up to 60 days before the filing (never after it)
    const happened = pick([null, null, "d", "t"]), back = Date.parse(created) - rnd() * 60 * 864e5;
    const happenedAt = happened === "d" ? new Date(back).toISOString().slice(0, 10) : happened === "t" ? new Date(back).toISOString() : null;
    db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,screens,components,gaprefs,grade,route,status,eval,created_at,decision,decided_by,decided_at,project,via,goal_ref,actual,outcome,report,happened_at,org) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)").run(
      id, pick(PEOPLE), pick(["code", "gtm", "GTM", "Leader", "design"]), pick(KINDS), pick([null, "a change", "an [EVAL probe] row", "eval probe x", "plain"]), "why",
      pick([null, "", "001", "002,003"]), pick([null, "", "c-a", "mind/worker"]), pick([null, "q/Q1", "goal/g1", "mind/x", "q/Q2,mind/y"]), "{}",
      route, pick(["routed", "graded", "closed", "received"]), pick([0, 0, 0, 1]), created,
      null, null, null, pick(["alpha", "alpha", "beta", "gamma", null]), pick([null, "mcp", "MCP/claude", "cli/0.4", "http"]),
      pick([null, null, "g1", "g2", ""]), pick([null, "", "12 signups"]), pick([null, null, 3, 0.5, 7]), pick([null, "art-1", "art-2"]), happenedAt);
    ids.push({ id, created });
  } else if (r < 0.72) {
    const t = pick(ids), verdict = pick(["approve", "reject", "needs-work"]);
    const at = new Date(Date.parse(t.created) + rnd() * 20 * 864e5).toISOString();
    db.prepare("UPDATE transmission SET decision=?, decided_by='p-o', decided_at=?, status=CASE WHEN ? = 'needs-work' THEN status ELSE 'closed' END WHERE id=?").run(verdict, at, verdict, t.id);
  } else if (r < 0.84) {
    const t = pick(ids);
    const col = pick(["route", "status", "eval", "project", "gaprefs", "components", "via", "kind", "what", "goal_ref", "lane", "outcome", "actual", "report", "why", "happened_at"]);
    const val = { route: pick(["auto", "owner", "incomplete"]), status: pick(["routed", "closed"]), eval: pick([0, 1]), project: pick(["alpha", "beta", null]),
      gaprefs: pick([null, "mind/z", "q/Q1"]), components: pick([null, "mind/w", "c-b"]), via: pick([null, "mcp", "cli"]), kind: pick(KINDS), what: pick(["[eval x", "fine", null]),
      goal_ref: pick([null, "g1", "g3"]), lane: pick(["Code", "gtm"]), outcome: pick([null, 2, 1.25]), actual: pick([null, "", "5"]), report: pick([null, "art-3"]), why: "changed",
      happened_at: pick([null, iso(rnd() * 150).slice(0, 10), iso(rnd() * 150)]) }[col];
    db.prepare(`UPDATE transmission SET ${col} = ? WHERE id = ?`).run(val, t.id);
  } else if (r < 0.9) {
    const i = Math.floor(rnd() * ids.length), t = ids[i];
    db.prepare("DELETE FROM transmission_refs WHERE tid = ?").run(t.id);
    db.prepare("UPDATE transmission SET parent = NULL WHERE parent = ?").run(t.id);
    db.prepare("DELETE FROM transmission WHERE id = ?").run(t.id);
    ids.splice(i, 1);
  } else {
    const q = rnd();
    if (q < 0.5 || !loops.length) {
      const id = `L-${++loopN}`; loops.push(id);
      db.prepare("INSERT INTO loops (id,person_id,title,status,opened_at,ref,org) VALUES (?,?,?,?,?,?,1)").run(id, pick(PEOPLE), "a loop", pick(["open", "open", "closed"]), iso(rnd() * 30), pick([null, "q/Q1", "mind/x", "c/c-a"]));
    } else if (q < 0.8) {
      db.prepare("UPDATE loops SET status = ?, ref = ? WHERE id = ?").run(pick(["open", "closed"]), pick([null, "mind/y", "q/Q2"]), pick(loops));
    } else if (q < 0.9) {
      db.prepare("UPDATE loops SET person_id = ? WHERE id = ?").run(pick(PEOPLE), pick(loops));
    } else {
      const i = Math.floor(rnd() * loops.length); db.prepare("DELETE FROM loops WHERE id = ?").run(loops[i]); loops.splice(i, 1);
    }
  }
}

// ---- B · the reads against their ledger references ----
const sumByKind = (rows) => {
  const m = new Map();
  for (const r of rows) { const k = String(r.kind ?? ""); const c = m.get(k) || { kind: k, n: 0, open_n: 0, motion_n: 0, canvas_n: 0 }; c.n += r.n; c.open_n += r.open_n; c.motion_n += r.motion_n; c.canvas_n += r.canvas_n; m.set(k, c); }
  return [...m.values()].filter((c) => c.n > 0);
};
const sortedJson = (rows) => JSON.stringify(rows.map((r) => JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v])))).sort());
function readsDiffer(db, H2 = H) {
  const bad = [];
  const cmp = (label, a, b) => { if (sortedJson(a) !== sortedJson(b)) bad.push(label); };
  for (const e of [false, true]) {
    for (const scoped of [true, false]) {
      const pb = scoped ? ["alpha"] : [];
      for (const from of ["1970-01-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"]) {
        cmp(`GOALS_AGG_SQL scoped=${scoped} eval=${e} from=${from.slice(0, 7)}`, db.prepare(H2.GOALS_AGG_SQL(scoped, e)).all(...pb, from), db.prepare(OLD.goals(scoped, e)).all(...pb, from));
      }
      // sprint 3 L2 (the week walked once): BUILD_AGG_SQL keeps the all-time counts per kind (n, open_n) off the tally; the totals
      // Build shows (in motion, on the Map this week: the records and the list's presses out) are the tally's part plus THE WEEK
      // (WEEK_SQL), and the default list's own rows of the week (BUILD_ROWS_SQL since the week, src/week.js weekFromRows) give
      // the same week as WEEK_SQL does
      const nonRecord = (k) => !["knowledge", "grade"].includes(String(k ?? ""));
      const sum = (rows, col, pred = () => true) => rows.filter(pred).reduce((a, r) => a + Number(r[col] || 0), 0);
      for (const [own, rid] of [[1, "p-o"], [0, "p-a"], [0, "p-c"], [0, "p-x"]]) {
        const agg = db.prepare(H2.BUILD_AGG_SQL(scoped, e)).all(...pb, own, rid, SINCE7, NOW);
        const old = db.prepare(OLD.build(scoped, e)).all(SINCE7, SINCE7, NOW, ...pb, own, rid);
        cmp(`BUILD_AGG_SQL per kind scoped=${scoped} eval=${e} reader=${rid}`, sumByKind(agg).map(({ kind, n, open_n }) => ({ kind, n, open_n })), old.map(({ kind, n, open_n }) => ({ kind, n, open_n })));
        const wk = db.prepare(H2.WEEK_SQL(scoped, e)).all(...pb, NOW, SINCE7, own, rid, NOW);
        const armA = (r) => r.f != null;
        const got = { motion: sum(agg, "motion_n", (r) => nonRecord(r.kind)) + sum(wk, "more_n"), canvas: sum(agg, "canvas_n", (r) => nonRecord(r.kind)) + sum(wk, "canvas_n", armA) };
        const want = { motion: sum(old, "motion_n", (r) => nonRecord(r.kind)), canvas: sum(old, "canvas_n", (r) => nonRecord(r.kind)) };
        cmp(`BUILD totals (BUILD_AGG_SQL + WEEK_SQL) scoped=${scoped} eval=${e} reader=${rid}`, [got], [want]);
        const rows = db.prepare(H2.BUILD_ROWS_SQL(scoped, e, false, { since: true })).all(...pb, own, rid, SINCE7, 100000);
        const fromRows = weekFromRows(rows, { nowMs: Date.parse(NOW), since: SINCE7, publishedAt: NOW }).totals;
        const fromSql = weekOf({ rows: wk, since: SINCE7 }, { nowMs: Date.parse(NOW) }).totals;
        cmp(`the week from the list's own rows == WEEK_SQL scoped=${scoped} eval=${e} reader=${rid}`, [{ filed: fromRows.filed, landed: fromRows.landed, more: fromRows.more, canvas: fromRows.canvasFiled }],
          [{ filed: fromSql.filed, landed: fromSql.landed, more: fromSql.more, canvas: fromSql.canvasFiled }]);
      }
      // HOME_TX_AGG_SQL keeps the all-time tallies (the week's needs more and landed are WEEK_SQL's, below)
      const TALLY_COLS = ["approve_n", "grant_n", "with_n", "contrib_n", "contrib_kinds", "knowledge_at"];
      const pickCols = (r) => Object.fromEntries(TALLY_COLS.map((k) => [k, r ? r[k] : null]));
      cmp(`HOME_TX_AGG_SQL scoped=${scoped} eval=${e}`, [pickCols(db.prepare(H2.HOME_TX_AGG_SQL(scoped, e)).get(...pb))], [pickCols(db.prepare(OLD.home(scoped, e)).get(...pb, SINCE7, SINCE7, ...pb, ...pb))]);
      // Home's week (the owner reads every row): needs more and landed in seven days, as the ledger counts them
      const wkOwner = weekOf({ rows: db.prepare(H2.WEEK_SQL(scoped, e)).all(...pb, NOW, SINCE7, 1, "p-o", "") }, { nowMs: Date.parse(NOW) }).totals;
      const ref = db.prepare(OLD.week(scoped, e)).get(SINCE7, ...pb);
      cmp(`WEEK_SQL (Home: needs more, landed in seven days) scoped=${scoped} eval=${e}`, [{ more: wkOwner.more, shipped: wkOwner.shipped, filed: wkOwner.filed }], [{ more: ref.more_n, shipped: ref.shipped_n, filed: ref.filed }]);
    }
    for (const [filter, pc, args] of [["eq", " AND t.project = ?", ["alpha"]], ["eq", " AND t.project = ?", ["beta"]], ["null", " AND t.project IS NULL", []], ["none", "", []]]) {
      cmp(`OWNER_OPEN_COUNT_SQL ${filter} ${args[0] || ""} eval=${e}`, [db.prepare(H2.OWNER_OPEN_COUNT_SQL(filter, e)).get(...args)], [db.prepare(OLD.badge(pc, e)).get(...args)]);
    }
  }
  for (const p of PEOPLE) for (const all of [false, true]) cmp(`LOOPS_OPEN_SQL ${p} all=${all}`, [db.prepare(H2.LOOPS_OPEN_SQL(all)).get(p)], [db.prepare(OLD.loops(all)).get(p)]);
  // who is here: the same people (the consumer reads the head row's name and count, and every row's person)
  const people = (rows) => [...new Set(rows.filter((r) => r.id && r.name).map((r) => `${r.id}|${r.name}|${r.email}|${r.role}`))].sort();
  const head = (rows) => { const h = rows.find((r) => r.project_name != null || r.projects != null) || {}; return `${h.project_name}|${h.projects}`; };
  for (const k of ["alpha", "beta", "nope"]) {
    const a = db.prepare(H2.HOME_SEATS_SQL(true)).all(k), b = db.prepare(OLD.seats(true)).all(k, k);
    if (JSON.stringify(people(a)) !== JSON.stringify(people(b)) || head(a) !== head(b)) bad.push(`HOME_SEATS_SQL ${k}`);
  }
  return bad;
}

// ---- A + B over the random writes ----
console.log("A · the tallies stay exact, B · the reads answer what the ledger answered (random writes, seeded)");
const db = world();
const ids = [], loops = [];
let driftAt = null, readAt = null;
for (let batch = 0; batch < 12; batch++) {
  for (let i = 0; i < 250; i++) randomWrite(db, ids, loops);
  const d = tallyDrift(db); if (d.length && !driftAt) driftAt = `batch ${batch}: ${d.join(", ")}`;
  const r = readsDiffer(db); if (r.length && !readAt) readAt = `batch ${batch}: ${r.slice(0, 4).join(" · ")}`;
}
const counts = db.prepare("SELECT (SELECT COUNT(*) FROM transmission) AS tx, (SELECT COUNT(*) FROM transmission WHERE decision IS NOT NULL) AS decided, (SELECT COUNT(*) FROM loops) AS loops").get();
ok(!driftAt, `A: every tally equals the ledger recomputed after each of 12 batches of 250 writes (${counts.tx} filings left, ${counts.decided} decided, ${counts.loops} loops)${driftAt ? " — drift at " + driftAt : ""}`);
ok(!readAt, `B: GOALS_AGG_SQL (3 periods), BUILD_AGG_SQL with WEEK_SQL and the list's own week (4 readers), HOME_TX_AGG_SQL, WEEK_SQL (Home), the badge (4 scopes), LOOPS_OPEN_SQL and HOME_SEATS_SQL equal the ledger statements they replaced, eval and not, scoped and not, after every batch${readAt ? " — differs at " + readAt : ""}`);
ok(counts.tx > 1000 && counts.decided > 200, `the random world is not trivial (${counts.tx} filings, ${counts.decided} decided)`);

// ---- C · the instrument ----
console.log("C · each check can fail");
const broken = world();
broken.exec("DROP TRIGGER transmission_goals_update");
const bids = [], bloops = [];
for (let i = 0; i < 600; i++) randomWrite(broken, bids, bloops);
ok(tallyDrift(broken).includes("transmission_goals"), "a tally with its update trigger dropped drifts, and A says which");
const loopsBroken = world();
loopsBroken.exec("DROP TRIGGER loops_open_update");
const lids = [], lloops = [];
for (let i = 0; i < 1500; i++) randomWrite(loopsBroken, lids, lloops);
ok(tallyDrift(loopsBroken).includes("loops_open"), "loops_open with its update trigger dropped drifts");
const H2 = { ...H,
  GOALS_AGG_SQL: (s, e) => H.GOALS_AGG_SQL(s, e).replace(" AND clean = 1", ""),
  BUILD_AGG_SQL: (s, e) => H.BUILD_AGG_SQL(s, e).replace(" AND mind = 0", ""),
  OWNER_OPEN_COUNT_SQL: (f, e) => H.OWNER_OPEN_COUNT_SQL(f, e).replace(" AND mind = 0", ""),
};
const wrong = readsDiffer(db, H2);
ok(wrong.some((x) => x.startsWith("GOALS_AGG_SQL") && x.includes("eval=false")) && wrong.some((x) => x.startsWith("BUILD_AGG_SQL")) && wrong.some((x) => x.startsWith("OWNER_OPEN_COUNT_SQL")),
  `B goes red on a read with a filter taken out (${wrong.length} reads differ: the goal rollup with suite rows, Build and the badge with R's own)`);

// ---- D · the migration over rows already filed ----
console.log("D · migrate-042.sql over a database that already holds rows");
const pre = BOOT.replace(/CREATE TABLE IF NOT EXISTS (loops_open|transmission_open|transmission_kinds|transmission_goals) \([\s\S]*?\n\);\n/g, "")
  .replace(/CREATE TRIGGER IF NOT EXISTS (loops_open|transmission_open|transmission_kinds|transmission_goals)_(insert|update|delete)\n[\s\S]*?\nEND;\n/g, "");
ok(!/transmission_goals|loops_open/.test(pre.replace(/^--.*$/gm, "")), "the pre-042 schema carries no tally and no tally trigger");
const old = world(pre);
const oids = [], oloops = [];
for (let i = 0; i < 1500; i++) randomWrite(old, oids, oloops);
old.exec(M042); old.exec(M050); old.exec(M054); old.exec(M067_COUNTS);
ok(tallyDrift(old).length === 0, "the backfill fills every tally exactly from the rows already filed (migrate-042, then 050's open count, then 054's month of the work; 067's triggers)");
for (let i = 0; i < 500; i++) randomWrite(old, oids, oloops);
ok(tallyDrift(old).length === 0 && readsDiffer(old).length === 0, "after the migration the triggers keep them exact, and the reads equal the ledger's");
old.exec(M042); old.exec(M050); old.exec(M054); old.exec(M067_COUNTS);
ok(tallyDrift(old).length === 0, "a second run of migrate-042.sql, 050, 054 and 067's counts recomputes, never doubles");

// ---- E · the open count leaves out the records (sprint 3, B3; migrate-050) ----
console.log("E · transmission_open counts no record (a knowledge write, a grade with proof)");
const OLD_OPEN = (s0) => { const m = M042; return s0.replace(/CREATE TRIGGER IF NOT EXISTS transmission_open_(insert|update|delete)\n[\s\S]*?\nEND;\n/g, (all, k) => (new RegExp(`CREATE TRIGGER IF NOT EXISTS transmission_open_${k}\\n[\\s\\S]*?\\nEND;\\n`).exec(m) || [""])[0]); };
const before050 = OLD_OPEN(BOOT);
ok(before050 !== BOOT && !/AND NOT \(COALESCE\(NEW\.kind/.test(before050.split("CREATE TRIGGER IF NOT EXISTS transmission_open_insert")[1].split("END;")[0]), "the schema before 050: transmission_open's triggers are migrate-042's (records counted)");
const e0 = world(before050);
const eids = [], eloops = [];
for (let i = 0; i < 1500; i++) randomWrite(e0, eids, eloops);
const openOf = (d) => d.prepare("SELECT COALESCE(SUM(n),0) AS n FROM transmission_open").get().n;
const recOpen = e0.prepare("SELECT COUNT(*) AS n FROM transmission WHERE status != 'closed' AND " + RECORD() + "").get().n;
const ownerBefore = e0.prepare(H.OWNER_OPEN_COUNT_SQL("none", true)).get().n;
const was = openOf(e0);
ok(recOpen > 5 && tallyDrift(e0).includes("transmission_open"), `before 050 the tally counts the ${recOpen} open records, so it differs from the new definition`);
e0.exec(M050);
ok(tallyDrift(e0).length === 0 && openOf(e0) === was - recOpen && e0.prepare(H.OWNER_OPEN_COUNT_SQL("none", true)).get().n === ownerBefore,
  `migrate-050 recomputes it exactly: ${was} -> ${openOf(e0)} (the ${recOpen} records out), and the owner's pending rulings stay ${ownerBefore}`);
e0.exec(M067_COUNTS);   // the triggers that keep it so are 067's now (050's definition, the bucket per org)
for (let i = 0; i < 1500; i++) randomWrite(e0, eids, eloops);
ok(tallyDrift(e0).length === 0 && readsDiffer(e0).length === 0, "after it the triggers keep it exact through random filings, decisions, kind and route changes and deletes, and the reads equal the ledger's");
const g1 = e0.prepare("SELECT COUNT(*) AS n FROM transmission WHERE kind = 'grade' AND route = 'owner' AND status != 'closed'").get().n;
ok(g1 > 0 && e0.prepare("SELECT COALESCE(SUM(n),0) AS n FROM transmission_open WHERE route = 'owner'").get().n >= g1, `a grade routed to the owner (no proof) still counts as open: ${g1} of them`);

// ---- F · the Goals month is when the work happened (sprint 3, B4; migrate-054) ----
console.log("F · transmission_goals buckets by the month the work happened, exactly, and 042's triggers would not");
{
  const hap = db.prepare("SELECT COUNT(*) AS n FROM transmission WHERE happened_at IS NOT NULL AND substr(happened_at,1,7) <> substr(created_at,1,7) AND (route = 'auto' OR decision = 'approve')").get().n;
  const OLD_GOALS = (s0) => s0.replace(/CREATE TRIGGER IF NOT EXISTS transmission_goals_(insert|update|delete)\n[\s\S]*?\nEND;\n/g, (all, k) => (new RegExp(`CREATE TRIGGER IF NOT EXISTS transmission_goals_${k}\\n[\\s\\S]*?\\nEND;\\n`).exec(M042) || [""])[0]);
  const w42 = world(OLD_GOALS(BOOT)), w42ids = [], w42loops = [];
  for (let i = 0; i < 1500; i++) randomWrite(w42, w42ids, w42loops);
  const red = tallyDrift(w42).includes("transmission_goals");
  w42.exec(M054);
  ok(hap > 20 && red && tallyDrift(w42).length === 0, `${hap} landed contributions happened in another month than they were filed; with 042's triggers the tally is off (keyed on the filing), and migrate-054 recomputes it exactly`);
}

console.log(`\n${failed ? "✗" : "✓"} tally-selftest: ${checks - failed}/${checks} checks`);
process.exit(failed ? 1 : 0);
