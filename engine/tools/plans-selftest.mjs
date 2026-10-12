// tools/plans-selftest.mjs — sprint 8, 8.1 (docs/plan/PLATFORM.md §4 sprint 8; migrate-075; src/plans.js): the plans and their
// limits, and the org's usage, against real SQLite databases (node:sqlite, as a D1 binding: tools/fixtures/home-d1.mjs d1Of).
// Each claim is proven able to fail: a mutant of the thing it guards turns it red, then the real thing is green.
//   1 · the limits: boot.sql's plan_limits rows (a fresh database) and migrate-075's (applied over a database before it) equal
//       the owner's ruled table, PINNED here, and equal PLATFORM.md's table as written (1 GB read 2^30 bytes)
//   2 · the migration over two orgs: org 1 is team, org 2 free, an org made after it free; a re-run stops at its ALTER and a
//       limit raised by hand stays raised (ON CONFLICT DO NOTHING)
//   3 · the plan the checks apply (planShownOf, PLAN_JOIN): the reader's org's plan and its limits (org 1 team, org 2 free), a
//       plan naming no row reads free's, a database with no org row answers null
//   4 · the shown usage against a RECOUNT by plain loops over two orgs' raw rows (seated, removed and pending people; active,
//       closed and eval projects; artifacts): each org's numbers are its own — the HELD seats, the active projects, its files —
//       and they move when a person, a project, a filing (the month's tally) and a file land
//   5 · the plans: the shown read (SHOWN_SQL) and GET /storage's (STORAGE_SHOWN_SQL), each aggregate on its own covering or
//       org-led index, no SCAN of any table (a co-routine's own rows aside)
//   6 · no plan of today moves: every self-contained statement in src/ on people, transmission or artifacts EXPLAINs the same
//       with migrate-075's three indexes and without them
//   7 · 8.4, THE storage definition: files and screen pictures, each body once (the takes' distinct (project, hash), the
//       stylesheets no take holds; archived projects in; another org's never), against a recount by plain loops over three orgs'
//       raw rows — read the SAME by GET /storage (storageShownOf), the shown plan (planShownOf) and the check; a render's
//       history through migrate-065's real triggers counts; ONE place: each of the three statements splices the one constant and
//       names no storage table of its own
//   8 · 8.4, the shown plan (planShownOf, Control's and whoami's one read): each limit's usage equals the CHECK's own read of it
//       (and the call read's), the states at 80% and at the limit, free's limits for a plan naming no row, null for no org row,
//       each org its own; whoami's plan (whoamiPlan): the admin and a member read the usage, a Partner the limits only; ONE
//       statement, no SCAN of a table
// Exit 1 on any fail.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M075 = readFileSync(join(ENGINE, "migrate-075.sql"), "utf8");
const PLATFORM = readFileSync(join(ENGINE, "..", "docs", "plan", "PLATFORM.md"), "utf8");
const { d1Of } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "home-d1.mjs")).href);
const { asOrg, orgSql } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "org.mjs")).href);
const P = await import(pathToFileURL(join(ENGINE, "src", "plans.js")).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
// redThenGreen(label, claim, mutants) — every mutant must make the claim false, the real inputs true
function redThenGreen(label, claim, mutants) {
  const reds = mutants.map(([name, m]) => { let r; try { r = claim(m); } catch { r = false; } return [name, r]; });
  const stillGreen = reds.filter(([, r]) => r).map(([name]) => name);
  ok(!stillGreen.length, `${label}: red under every mutant (${mutants.map(([n]) => n).join("; ")})${stillGreen.length ? ` — still green: ${stillGreen.join(", ")}` : ""}`);
  let g; try { g = claim(null); } catch (e) { g = false; console.log(`    (${String(e && e.message || e).slice(0, 200)})`); }
  ok(g, `${label}: green`);
}
const fresh = (boot = BOOT) => { const d = new DatabaseSync(":memory:"); d.exec(boot); return d; };
const INDEXES = ["idx_people_org_seated", "idx_transmission_org_month", "idx_artifacts_org_bytes"];
// a database as it stood before migrate-075: boot.sql with the file's table, column and indexes taken out
function before075(boot = BOOT) {
  const d = fresh(boot);
  d.exec(`${INDEXES.map((i) => `DROP INDEX ${i};`).join(" ")} DROP TABLE plan_limits; ALTER TABLE org DROP COLUMN plan;`);
  return d;
}
const T0 = "2026-01-01T00:00:00.000Z";
const addOrg = (d, id, name) => d.prepare("INSERT INTO org (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, name, T0, T0);

// ---- 1 · the limits ----
// THE RULED TABLE (owner, 2026-10-06), pinned: people, projects, items a month, calls a day, burst a minute, storage bytes
const GB = 2 ** 30;
const RULED = {
  free: { people: 10, projects: 3, items_month: 1500, calls_day: 1000, burst_minute: 60, storage_bytes: 1 * GB },
  team: { people: 50, projects: 25, items_month: 50000, calls_day: 25000, burst_minute: 300, storage_bytes: 25 * GB },
};
const COLS = ["people", "projects", "items_month", "calls_day", "burst_minute", "storage_bytes"];
const rowsOf = (d) => Object.fromEntries(d.prepare("SELECT * FROM plan_limits ORDER BY plan").all().map((r) => [r.plan, Object.fromEntries(COLS.map((c) => [c, Number(r[c])]))]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// PLATFORM.md's table as written: the row whose label starts so, its Free and Team cells' first number (commas aside; GB -> bytes)
function platformTable(text = PLATFORM) {
  const cell = (label) => {
    const line = text.split("\n").find((l) => l.startsWith(`| ${label}`));
    if (!line) return null;
    const [, , free, team] = line.split("|").map((x) => x.trim());
    const num = (c) => { const m = /([\d,]+)\s*(GB)?/.exec(c || ""); return m ? Number(m[1].replace(/,/g, "")) * (m[2] ? GB : 1) : NaN; };
    return [num(free), num(team)];
  };
  const rows = { people: cell("People in an org"), projects: cell("Projects in an org"), items_month: cell("Items filed a month"),
    calls_day: cell("MCP and API calls a day"), burst_minute: cell("Burst"), storage_bytes: cell("Files and screen pictures stored") };
  if (Object.values(rows).some((r) => !r)) return null;
  return { free: Object.fromEntries(COLS.map((c) => [c, rows[c][0]])), team: Object.fromEntries(COLS.map((c) => [c, rows[c][1]])) };
}
{
  console.log("1 · the limits are the owner's ruled table");
  ok(same(platformTable(), RULED), `PLATFORM.md's table reads as the pinned numbers (free ${JSON.stringify(RULED.free)}; team ${JSON.stringify(RULED.team)})`);
  redThenGreen("PLATFORM.md's table equals the pin", (m) => same(platformTable(m || PLATFORM), RULED),
    [["the doc's free items 1,500 -> 3,000", PLATFORM.replace("| 1,500 | 50,000 |", "| 3,000 | 50,000 |")], ["the doc's team storage 25 GB -> 10 GB", PLATFORM.replace("| 1 GB | 25 GB |", "| 1 GB | 10 GB |")]]);
  redThenGreen("boot.sql's plan_limits rows (a fresh database) equal the ruled table", (m) => same(rowsOf(fresh(m || BOOT)), RULED),
    [["boot's free calls 1000 -> 2000", BOOT.replace("('free', 10, 3, 1500, 1000,", "('free', 10, 3, 1500, 2000,")],
     ["boot's team row gone", BOOT.replace(",\n  ('team', 50, 25, 50000, 25000, 300, 26843545600, '2026-10-06T00:00:00.000Z')", "")],
     ["boot's free storage 1e9 (decimal GB)", BOOT.replace("1500, 1000, 60, 1073741824,", "1500, 1000, 60, 1000000000,")]]);
  redThenGreen("migrate-075's rows (over a database before it) equal the ruled table", (m) => { const d = before075(); d.exec(m || M075); return same(rowsOf(d), RULED); },
    [["the file's team people 50 -> 40", M075.replace("('team', 50, 25,", "('team', 40, 25,")], ["the file's free burst 60 -> 600", M075.replace("1000, 60, 1073741824", "1000, 600, 1073741824")]]);
}

// ---- 2 · the migration over two orgs ----
{
  console.log("2 · migrate-075 over two orgs");
  const claim = (m) => {
    const d = before075(); addOrg(d, 1, "Ryuklabs"); addOrg(d, 2, "Second");
    d.exec(m || M075);
    addOrg(d, 3, "Made after");
    const plans = d.prepare("SELECT id, plan FROM org ORDER BY id").all().map((r) => `${r.id}:${r.plan}`).join(",");
    // a limit raised by hand, then the file again: it stops at its ALTER, and the raise stands (as the dry run's replay)
    d.exec("UPDATE plan_limits SET people = 99 WHERE plan = 'free'");
    let replay = "";
    try { d.exec("BEGIN"); d.exec(m || M075); d.exec("COMMIT"); replay = "applied twice"; } catch (e) { replay = String(e.message); try { d.exec("ROLLBACK"); } catch { /* none open */ } }
    const raised = d.prepare("SELECT people FROM plan_limits WHERE plan = 'free'").get().people;
    // and a replay that WOULD reach its rows (the ALTER aside) keeps the raise too: ON CONFLICT DO NOTHING
    d.exec((m || M075).replace(/ALTER TABLE org ADD COLUMN[^;]*;/, "").replace(/UPDATE org SET plan = 'team' WHERE id = 1;/, ""));
    const kept = d.prepare("SELECT people FROM plan_limits WHERE plan = 'free'").get().people;
    return plans === "1:team,2:free,3:free" && /duplicate column name/i.test(replay) && raised === 99 && kept === 99;
  };
  redThenGreen("org 1 team, org 2 and an org made after free; a re-run stops at its ALTER; a raised limit stays raised", claim,
    [["no UPDATE of org 1", M075.replace("UPDATE org SET plan = 'team' WHERE id = 1;", "")], ["the default 'team'", M075.replace("DEFAULT 'free'", "DEFAULT 'team'")],
     ["the seed as an upsert that puts the numbers back", M075.replace("ON CONFLICT (plan) DO NOTHING", "ON CONFLICT (plan) DO UPDATE SET people = excluded.people")]]);
}

// ---- 3 · the plan the checks apply ----
{
  console.log("3 · the plan the checks apply (planShownOf): the reader's org's plan");
  const world = () => { const d = fresh(); addOrg(d, 1, "Ryuklabs"); addOrg(d, 2, "Second"); addOrg(d, 4, "Odd"); d.exec("UPDATE org SET plan = 'team' WHERE id = 1; UPDATE org SET plan = 'gone' WHERE id = 4"); return d; };
  const NOW3 = Date.parse("2026-10-17T09:30:00.000Z");
  // run(sql) — the real planShownOf as each org (sql: a mutant statement, run as the layer would run it, shaped by the same shownFrom)
  const run = async (sql) => {
    const d = world(), DB = d1Of(d);
    const appliedOf = async (org) => {
      const s = sql ? P.shownFrom(await DB.prepare(orgSql(sql, org)).bind(P.monthOf(NOW3), P.dayOf(NOW3), P.minuteOf(NOW3)).first(), NOW3) : await P.planShownOf(asOrg({ DB }, org), { now: NOW3 });
      return s ? { plan: s.plan, limits: s.limits && Object.fromEntries(P.LIMIT_ORDER.map((k) => [k, s.limits[k].allowed])) } : null;
    };
    const r1 = await appliedOf(1), r2 = await appliedOf(2), r4 = await appliedOf(4), r9 = await appliedOf(9);
    return same(r1, { plan: "team", limits: RULED.team }) && same(r2, { plan: "free", limits: RULED.free }) && same(r4, { plan: "free", limits: RULED.free }) && r9 === null;
  };
  const S = P.SHOWN_SQL;
  const real = await run(null);
  const reds = await Promise.all([
    ["the org hard-coded (o.id = 1)", S.replace("WHERE o.id = {org}", "WHERE o.id = 1")],
    ["the org's plan row only (a plan naming no row reads no limits)", S.replace("COALESCE((SELECT x.plan FROM plan_limits x WHERE x.plan = o.plan), 'free')", "o.plan")],
    ["free's limits whatever the org's plan", S.replace("COALESCE((SELECT x.plan FROM plan_limits x WHERE x.plan = o.plan), 'free')", "'free'")],
  ].map(async ([n, m]) => { let r; try { r = await run(m); } catch { r = false; } return [n, r]; }));
  ok(reds.every(([, r]) => !r), `the plan applied: red under every mutant (${reds.map(([n]) => n).join("; ")})${reds.some(([, r]) => r) ? ` — still green: ${reds.filter(([, r]) => r).map(([n]) => n).join(", ")}` : ""}`);
  ok(real, "the plan applied: org 1 reads team and its ruled limits, org 2 free and its, a plan with no row free's, an org with no row null");
}

// ---- 4 · the shown usage against a recount ----
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NOW = Date.parse("2026-10-17T09:30:00.000Z");
const MONTH_FIRST = "2026-10-01T00:00:00.000Z", MONTH_LAST = "2026-10-31T23:59:59.999Z", BEFORE = "2026-09-30T23:59:59.999Z", AFTER = "2026-11-01T00:00:00.000Z";
function usageWorld() {
  const d = fresh();
  for (const [id, name] of [[1, "Ryuklabs"], [2, "Second"]]) addOrg(d, id, name);
  const proj = d.prepare("INSERT INTO projects (key, name, active, eval, created_at) VALUES (?, ?, ?, ?, ?)");
  const keys = { 1: [], 2: [] };
  for (const [org, pre] of [[1, ""], [2, "o2--"]]) {
    for (let i = 0; i < 6; i++) { const k = `${pre}p${i}`; proj.run(k, k, rnd() < 0.7 ? 1 : 0, rnd() < 0.2 ? 1 : 0, T0); keys[org].push(k); }
  }
  const ppl = d.prepare("INSERT INTO people (id, name, email, role, key_hash, active, pending, created_at, org) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const who = { 1: [], 2: [] };
  for (const org of [1, 2]) for (let i = 0; i < 14; i++) {
    const id = `u${org}-${i}`, r = rnd(), active = r < 0.6 ? 1 : 0, pending = !active && r < 0.8 ? 1 : 0;
    ppl.run(id, id, null, i === 0 ? "owner" : "member", `h-${id}`, i === 0 ? 1 : active, i === 0 ? 0 : pending, T0, org); who[org].push(id);
  }
  const tx = d.prepare("INSERT INTO transmission (id, submitter, lane, kind, what, route, status, eval, project, created_at, org) VALUES (?, ?, 'code', ?, 'x', 'auto', 'closed', ?, ?, ?, ?)");
  let n = 0;
  const times = [MONTH_FIRST, MONTH_LAST, BEFORE, AFTER, "2026-10-09T12:00:00.000Z", "2026-10-17 09:00:00", "2026-08-20T00:00:00.000Z", "2025-10-15T00:00:00.000Z"];
  for (let i = 0; i < 500; i++) {
    const org = rnd() < 0.6 ? 1 : 2;
    tx.run(`T-${String(++n).padStart(6, "0")}`, pick(who[org]), pick(["pr", "note", "knowledge", "grade", null, "counter", "knowledge", "grade"]), rnd() < 0.15 ? 1 : 0,
      rnd() < 0.1 ? null : pick(keys[org]), rnd() < 0.5 ? pick(times) : `2026-${pick(["09", "10", "10", "11"])}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}T0${Math.floor(rnd() * 9)}:00:00.000Z`, org);
  }
  const art = d.prepare("INSERT INTO artifacts (id, person_id, kind, title, r2_key, sha256, bytes, group_tag, created_at, project, org) VALUES (?, ?, 'image', 't', ?, 'h', ?, 'g', ?, ?, ?)");
  for (let i = 0; i < 60; i++) { const org = rnd() < 0.5 ? 1 : 2; art.run(`a${i}`, pick(who[org]), `o${org}/inbox/a${i}`, Math.floor(rnd() * 5e6), T0, rnd() < 0.2 ? null : pick(keys[org]), org); }
  return d;
}
// the RECOUNT: plain loops over the raw rows, no SQL of the read's own — the HELD seats (active, or pending: the check's people),
// the active projects, the org's files
function recount(d, org) {
  const people = d.prepare("SELECT * FROM people").all().filter((p) => p.org === org && (p.active === 1 || p.pending === 1)).length;
  const projects = d.prepare("SELECT key, active FROM projects").all().filter((p) => (org === 1 ? !/^o\d+--/.test(p.key) : p.key.startsWith(`o${org}--`)) && p.active === 1).length;
  const files = d.prepare("SELECT * FROM artifacts").all().filter((a) => a.org === org).reduce((s, a) => s + a.bytes, 0);
  return { people, projects, files };
}
const usageVia = async (d, org, sql) => {
  const DB = d1Of(d);
  const s = sql ? P.shownFrom(await DB.prepare(orgSql(sql, org)).bind(P.monthOf(NOW), P.dayOf(NOW), P.minuteOf(NOW)).first(), NOW) : await P.planShownOf(asOrg({ DB }, org), { now: NOW });
  return { people: s.limits.people.used, projects: s.limits.projects.used, files: s.storage.files, items: s.limits.items_month.used, bytes: s.limits.storage_bytes.used };
};
{
  console.log("4 · the shown usage against a recount, two orgs");
  const d = usageWorld();
  const r1 = recount(d, 1), r2 = recount(d, 2);
  ok(r1.people > 1 && r2.people > 1 && r1.projects && r2.projects && r1.files && r2.files && d.prepare("SELECT COUNT(*) AS n FROM people WHERE pending = 1").get().n > 0
    && d.prepare("SELECT COUNT(*) AS n FROM people WHERE active = 0 AND pending = 0").get().n > 0 && d.prepare("SELECT COUNT(*) AS n FROM projects WHERE active = 0").get().n > 0,
    `the world is not empty (org 1 ${JSON.stringify(r1)}; org 2 ${JSON.stringify(r2)}), and holds pending and removed seats and closed projects`);
  const claim = async (sql) => {
    const u1 = await usageVia(d, 1, sql), u2 = await usageVia(d, 2, sql);
    return same({ people: u1.people, projects: u1.projects, files: u1.files }, r1) && same({ people: u2.people, projects: u2.projects, files: u2.files }, r2);
  };
  const S = P.SHOWN_SQL;
  const reds = await Promise.all([
    ["people counting a removed seat", S.replace(P.PEOPLE_HELD_SQL, "(SELECT COUNT(*) FROM people WHERE org = {org})")],
    ["people as the seated only (a pending seat is held)", S.replace(P.PEOPLE_HELD_SQL, "(SELECT COUNT(*) FROM people WHERE org = {org} AND active = 1)")],
    ["people of every org", S.replace(P.PEOPLE_HELD_SQL, "(SELECT COUNT(*) FROM people WHERE active + pending >= 1)")],
    ["projects counting closed ones", S.replace(P.PROJECTS_ACTIVE_SQL, "(SELECT COUNT(*) FROM projects INDEXED BY idx_projects_org_slug WHERE org = {org})")],
    ["files of every org", S.replace(P.STORAGE_FILES_SQL, "(SELECT COALESCE(SUM(bytes), 0) FROM artifacts WHERE bytes >= 0)")],
  ].map(async ([n, m]) => { let r; try { r = await claim(m); } catch { r = false; } return [n, r]; }));
  ok(reds.every(([, r]) => !r), `the shown usage: red under every mutant (${reds.map(([n]) => n).join("; ")})${reds.some(([, r]) => r) ? ` — still green: ${reds.filter(([, r]) => r).map(([n]) => n).join(", ")}` : ""}`);
  const g1 = await usageVia(d, 1);
  ok(await claim(null), `the shown usage: each org's numbers equal its recount (org 1: ${r1.people} held seats, ${r1.projects} projects, ${r1.files} bytes of files; org 2: ${r2.people}, ${r2.projects}, ${r2.files}); org 1 shows ${g1.people}, ${g1.projects}, ${g1.files}`);
  // it moves: a person, a project, a filing (the month's tally, the one upsert every filing's batch carries) and a file
  const z = fresh(); addOrg(z, 2, "Zero");
  const zenv = asOrg({ DB: d1Of(z) }, 2);
  const u0 = await usageVia(z, 2);
  z.exec("INSERT INTO people (id, name, role, key_hash, active, created_at, org) VALUES ('z', 'z', 'owner', 'hz', 1, '2026-01-01', 2)");
  z.exec("INSERT INTO projects (key, name, active, created_at) VALUES ('o2--web', 'Web', 1, '2026-01-01')");
  await P.itemsTally(zenv, 1, NOW).run();
  z.exec("INSERT INTO artifacts (id, person_id, kind, r2_key, sha256, bytes, group_tag, created_at, org) VALUES ('az', 'z', 'pdf', 'o2/inbox/az', 'h', 1234, 'g', '2026-10-17', 2)");
  const u1 = await usageVia(z, 2);
  ok(u0.people === 0 && u0.projects === 0 && u0.items === 0 && u0.bytes === 0 && u1.people === 1 && u1.projects === 1 && u1.items === 1 && u1.bytes === 1234,
    `a fresh org's usage is zeros (${JSON.stringify(u0)}), then moves by one person, one project, one filing and 1234 bytes (${JSON.stringify(u1)})`);
}

// ---- 5 · the plans ----
{
  console.log("5 · the shown reads stand on their indexes");
  const d = fresh();
  const plan = (sql, ...b) => d.prepare("EXPLAIN QUERY PLAN " + orgSql(sql, 2)).all(...b).map((r) => r.detail);
  // a SCAN of a co-routine's own rows (the takes grouped by body) is no table read
  const onIndexes = (p) => !p.filter((x) => /^SCAN (?!\(subquery-\d+\)$)/.test(x)).length
    && p.some((x) => x === "SEARCH k_screen_takes USING INDEX idx_k_screen_takes_hash (project=?)")
    && p.some((x) => /^SEARCH projects USING (COVERING )?INDEX idx_projects_org_slug \(org=\?\)/.test(x))
    && p.some((x) => /^SEARCH artifacts USING COVERING INDEX idx_artifacts_org_bytes \(org=\?/.test(x));
  const shownClaim = (m) => { const p = plan(m || P.SHOWN_SQL, "2026-10", "2026-10-17", "2026-10-17T09:30"); return onIndexes(p) && p.some((x) => /^SEARCH people USING (COVERING )?INDEX idx_people_org_held \(org=\?\)/.test(x)); };
  redThenGreen("SHOWN_SQL: every aggregate on its own index, no SCAN of a table", shownClaim,
    [["people by +org, no INDEXED BY", P.SHOWN_SQL.replace("INDEXED BY idx_people_org_held WHERE org = {org}", "WHERE +org = {org}")],
     ["artifacts without the partial term", P.SHOWN_SQL.replace("INDEXED BY idx_artifacts_org_bytes WHERE org = {org} AND bytes >= 0", "WHERE org = {org}")],
     ["the takes by +project, no INDEXED BY", P.SHOWN_SQL.replace("FROM k_screen_takes INDEXED BY idx_k_screen_takes_hash WHERE project IN", "FROM k_screen_takes WHERE +project IN")]]);
  redThenGreen("STORAGE_SHOWN_SQL (GET /storage): its aggregates on their indexes, no SCAN of a table", (m) => onIndexes(plan(m || P.STORAGE_SHOWN_SQL)),
    [["artifacts without the partial term", P.STORAGE_SHOWN_SQL.replace("INDEXED BY idx_artifacts_org_bytes WHERE org = {org} AND bytes >= 0", "WHERE org = {org}")],
     ["the takes by +project, no INDEXED BY", P.STORAGE_SHOWN_SQL.replace("FROM k_screen_takes INDEXED BY idx_k_screen_takes_hash WHERE project IN", "FROM k_screen_takes WHERE +project IN")]]);
  console.log(`    SHOWN_SQL: ${plan(P.SHOWN_SQL, "2026-10", "2026-10-17", "2026-10-17T09:30").join(" | ")}`);
}

// ---- 6 · no plan of today moves ----
{
  console.log("6 · migrate-075's indexes move no other statement's plan");
  // every self-contained string literal in src/ that is a statement on people, transmission or artifacts (no ${…}; the ones that
  // prepare on boot.sql's schema): its plan with the three indexes and without them
  const lits = [];
  for (const f of readdirSync(join(ENGINE, "src"), { recursive: true }).filter((x) => String(x).endsWith(".js") && !/plans\.js$|data\.js$/.test(String(x)))) {
    const t = readFileSync(join(ENGINE, "src", String(f)), "utf8");
    for (const m of t.matchAll(/"((?:SELECT|UPDATE|DELETE|INSERT)\b[^"\\]*(?:\\.[^"\\]*)*)"/g)) if (/\b(FROM|JOIN|UPDATE|INTO)\s+(people|transmission|artifacts)\b/.test(m[1])) lits.push([String(f), m[1]]);
  }
  const plansOn = (d) => lits.map(([f, s]) => { try { return [f, s, d.prepare("EXPLAIN QUERY PLAN " + orgSql(s, 2)).all().map((r) => r.detail).join(" | ")]; } catch { return [f, s, null]; } });
  const without = before075();
  const base = plansOn(without).filter(([, , p]) => p != null);
  const moved = (extra) => { const d = fresh(); if (extra) d.exec(extra); const now = new Map(plansOn(d).map(([f, s, p]) => [f + s, p])); return base.filter(([f, s, p]) => now.get(f + s) !== p).map(([f, s]) => `${f}: ${s.slice(0, 80)}`); };
  ok(base.length >= 20, `the statements compared: ${base.length} of the ${lits.length} literals found prepare on the schema`);
  const red = moved("CREATE INDEX idx_mutant_people_org ON people(org, active); CREATE INDEX idx_mutant_tx_org ON transmission(org, created_at); CREATE INDEX idx_mutant_art_org ON artifacts(org);");
  ok(red.length > 0, `red: an index led by a bare org column moves ${red.length} plan(s) (e.g. ${red.slice(0, 2).join(" · ")})`);
  const green = moved(null);
  ok(!green.length, `green: with migrate-075's three indexes no plan moves${green.length ? ` — moved: ${green.join(" · ")}` : ""}`);
}

// ---- 7 · 8.4: THE storage definition, files and screen pictures ----
const H = (c) => c.repeat(64);   // a sha256-shaped hash
const keyOrg = (k) => { const m = /^o(\d+)--/.exec(k); return m ? Number(m[1]) : 1; };   // the project key's org (src/project.js orgOfKey's rule)
function picturesWorld() {
  const d = fresh();
  for (const [id, name] of [[1, "Ryuklabs"], [2, "Second"], [3, "Third"]]) addOrg(d, id, name);
  const proj = d.prepare("INSERT INTO projects (key, name, active, created_at) VALUES (?, ?, ?, ?)");
  for (const [k, a] of [["alpha", 1], ["beta", 0], ["o2--web", 1], ["o2--old", 0], ["o3--big", 1]]) proj.run(k, k, a, T0);
  const ppl = d.prepare("INSERT INTO people (id, name, role, key_hash, active, created_at, org) VALUES (?, ?, 'owner', ?, 1, ?, ?)");
  for (const org of [1, 2, 3]) ppl.run(`w${org}`, `w${org}`, `hw${org}`, T0, org);
  const take = d.prepare("INSERT INTO k_screen_takes (project, screen, state, variant, format, take, hash, bytes, filed_at, filed_by) VALUES (?, ?, '', '', 'html', ?, ?, ?, ?, ?)");
  for (const [p, sc, t, h, b] of [
    // org 2: a frame's three takes, the third a restored body (stored once); another screen holding the same body (the same key: once)
    ["o2--web", "s1", 1, H("a"), 100], ["o2--web", "s1", 2, H("b"), 200], ["o2--web", "s1", 3, H("a"), 100], ["o2--web", "s2", 1, H("b"), 200],
    // its ARCHIVED project: the same body under its own key (another object: it counts), and one of its own
    ["o2--old", "s1", 1, H("a"), 100], ["o2--old", "s9", 1, H("c"), 7],
    // org 1 (an archived project too) and org 3 (big: an org-blind sum shows)
    ["alpha", "s1", 1, H("d"), 11], ["beta", "s1", 1, H("e"), 13], ["o3--big", "s1", 1, H("f"), 5_000_000],
  ]) take.run(p, sc, t, h, b, T0, `w${keyOrg(p)}`);
  const style = d.prepare("INSERT INTO k_styles (project, id, hash, bytes, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  // org 2: two stylesheets holding one body (once), one whose body a take already holds (not again); the archived project's own
  for (const [p, id, h, b] of [["o2--web", "main", H("1"), 50], ["o2--web", "alt", H("1"), 50], ["o2--web", "dup", H("b"), 200], ["o2--old", "old", H("2"), 9],
    ["o3--big", "x", H("3"), 900_000], ["alpha", "a", H("4"), 3]]) style.run(p, id, h, b, `w${keyOrg(p)}`, T0, `w${keyOrg(p)}`, T0);
  const art = d.prepare("INSERT INTO artifacts (id, person_id, kind, r2_key, sha256, bytes, group_tag, created_at, org) VALUES (?, ?, 'pdf', ?, 'h', ?, 'g', ?, ?)");
  for (const [id, org, b] of [["f1", 2, 1000], ["f2", 2, 24], ["f3", 1, 5], ["f4", 3, 77_000]]) art.run(id, `w${org}`, `o${org}/inbox/${id}`, b, T0, org);
  return d;
}
// the RECOUNT: plain loops over the raw rows, no SQL of the read's own — the org's files, then each body (project, hash) ONCE
function storageRecount(d, org) {
  const files = d.prepare("SELECT * FROM artifacts").all().filter((a) => a.org === org).reduce((s, a) => s + a.bytes, 0);
  const bodies = new Map();
  for (const t of d.prepare("SELECT * FROM k_screen_takes").all()) if (keyOrg(t.project) === org) bodies.set(`${t.project} ${t.hash}`, t.bytes);
  for (const st of d.prepare("SELECT * FROM k_styles").all()) if (keyOrg(st.project) === org && !bodies.has(`${st.project} ${st.hash}`)) bodies.set(`${st.project} ${st.hash}`, st.bytes);
  const pictures = [...bodies.values()].reduce((s, b) => s + b, 0);
  return { files, pictures, used: files + pictures };
}
// storageThreeWays(d, org, { pictures, check }) -> the storage GET /storage reads (storageShownOf), the shown plan reads (planShownOf)
// and the check reads
// (CHECK_SQL.storage_bytes, the row checkPlan judges): the real functions, or the same statements with a mutant spliced in
// place of THE pictures constant (pictures) or a mutant check statement (check)
async function storageThreeWays(d, org, m = {}) {
  const DB = d1Of(d), env = asOrg({ DB }, org);
  const sub = (sql) => (m.pictures ? sql.split(P.STORAGE_PICTURES_SQL).join(m.pictures) : sql);
  const real = !m.pictures;
  const u = real ? (await P.storageShownOf(env)).usedBytes : (({ files_bytes: f, pictures_bytes: p }) => Number(f) + Number(p))(await DB.prepare(orgSql(sub(P.STORAGE_SHOWN_SQL), org)).first());
  const c = await DB.prepare(orgSql(m.check || sub(P.CHECK_SQL.storage_bytes), org)).first();
  const s = real ? await P.planShownOf(env, { now: NOW }) : P.shownFrom(await DB.prepare(orgSql(sub(P.SHOWN_SQL), org)).bind(P.monthOf(NOW), P.dayOf(NOW), P.minuteOf(NOW)).first(), NOW);
  return { usage: u, check: Number(c.used), shown: s.limits.storage_bytes.used, files: s.storage.files, pictures: s.storage.pictures };
}
const agreesWithRecount = async (d, m) => {
  for (const org of [1, 2, 3]) {
    const r = storageRecount(d, org), g = await storageThreeWays(d, org, m);
    if (!(g.usage === r.used && g.check === r.used && g.shown === r.used && g.files === r.files && g.pictures === r.pictures)) return false;
  }
  return true;
};
{
  console.log("7 · 8.4: THE storage definition (files and screen pictures, each body once), the same for the display and the check");
  const d = picturesWorld();
  const r2 = storageRecount(d, 2), r1 = storageRecount(d, 1), r3 = storageRecount(d, 3);
  ok(r2.files === 1024 && r2.pictures === 466 && r1.used === 32 && r3.used === 5_977_000,
    `the world: org 2 files ${r2.files} + pictures ${r2.pictures} (o2--web's bodies a 100 + b 200, o2--old's a 100 + c 7, the stylesheets 50 + 9: a restored take, a second screen, a second stylesheet and a stylesheet a take holds each counted ONCE), org 1 ${r1.used}, org 3 ${r3.used}`);
  const PIC = P.STORAGE_PICTURES_SQL, KEYS = P.ORG_PROJECT_KEYS_SQL;
  const reds = [];
  for (const [name, pictures] of [
    ["every take counted (a body as often as its takes)", PIC.replace("SELECT MAX(bytes) AS b FROM k_screen_takes INDEXED BY idx_k_screen_takes_hash WHERE project IN (" + KEYS + ") GROUP BY project, hash", "SELECT bytes AS b FROM k_screen_takes WHERE project IN (" + KEYS + ")")],
    ["a body once across the org's projects (by hash alone: another project's key is another object)", PIC.replace("GROUP BY project, hash)", "GROUP BY hash)")],
    ["every org's takes", PIC.replace("INDEXED BY idx_k_screen_takes_hash WHERE project IN (" + KEYS + ")", "WHERE 1")],
    ["the active projects only (an archived project's bodies are still stored)", PIC.split(KEYS).join(KEYS + " AND active = 1")],
    ["the stylesheets left out", PIC.replace("SELECT MAX(s.bytes) AS b", "SELECT 0 AS b")],
    ["a stylesheet counted though a take holds its body", PIC.replace("AND NOT EXISTS (SELECT 1 FROM k_screen_takes t INDEXED BY idx_k_screen_takes_hash WHERE t.project = s.project AND t.hash = s.hash) ", "")],
    ["the live renders only (k_renders: every earlier take's body dropped)", PIC.replace("FROM k_screen_takes INDEXED BY idx_k_screen_takes_hash WHERE project IN", "FROM k_renders WHERE project IN")],
  ]) { let r; try { r = await agreesWithRecount(d, { pictures }); } catch { r = false; } reds.push([name, r]); }
  ok(reds.every(([, r]) => !r), `the pictures: red under every mutant (${reds.map(([n]) => n).join("; ")})${reds.some(([, r]) => r) ? ` — still green: ${reds.filter(([, r]) => r).map(([n]) => n).join(", ")}` : ""}`);
  const g = await storageThreeWays(d, 2);
  ok(await agreesWithRecount(d), `the pictures: green — GET /storage, planShownOf and the check's own row each read every org's recount (org 2: usage ${g.usage}, check ${g.check}, shown ${g.shown} = files ${g.files} + pictures ${g.pictures})`);
  // the check reads what the display reads: 8.2's own files-only statement (the text before 8.4) disagrees with the display
  const files82 = P.CHECK_SQL.storage_bytes.replace(P.STORAGE_USED_SQL, P.STORAGE_FILES_SQL);
  ok(!(await agreesWithRecount(d, { check: files82 })), "the check: red with 8.2's files-only statement (it misses the screen pictures the display counts)");
  // a render's history through migrate-065's REAL triggers: filed, changed, changed back -> three takes, two bodies, +100 bytes
  const before = storageRecount(d, 2).pictures;
  d.prepare("INSERT INTO k_renders (project, screen, state, variant, format, hash, bytes, created_by, created_at, updated_by, updated_at) VALUES ('o2--web', 's5', '', '', 'html', ?, 70, 'w2', ?, 'w2', ?)").run(H("7"), T0, T0);
  d.prepare("UPDATE k_renders SET hash = ?, bytes = 30 WHERE project = 'o2--web' AND screen = 's5'").run(H("8"));
  d.prepare("UPDATE k_renders SET hash = ?, bytes = 70 WHERE project = 'o2--web' AND screen = 's5'").run(H("7"));
  const takes5 = d.prepare("SELECT COUNT(*) AS n FROM k_screen_takes WHERE project = 'o2--web' AND screen = 's5'").get().n;
  const g5 = await storageThreeWays(d, 2);
  ok(takes5 === 3 && storageRecount(d, 2).pictures === before + 100 && g5.pictures === before + 100 && await agreesWithRecount(d),
    `a render filed, changed and changed back (the real triggers): ${takes5} takes, its two bodies once each: pictures ${before} -> ${g5.pictures}, every read still the recount`);
  // ONE place: each statement splices the one files constant and the one pictures constant, and names no storage table of its own
  const stmts = [P.STORAGE_SHOWN_SQL, P.CHECK_SQL.storage_bytes, P.SHOWN_SQL];
  const onePlace = (list) => list.every((sql) => sql.split(P.STORAGE_FILES_SQL).length === 2 && sql.split(P.STORAGE_PICTURES_SQL).length === 2
    && !/\b(artifacts|k_screen_takes|k_styles|k_renders)\b/.test(sql.split(P.STORAGE_FILES_SQL).join("").split(P.STORAGE_PICTURES_SQL).join("")));
  redThenGreen("ONE place: GET /storage's, the check's and the shown read's statements each splice THE storage constants, no copy of their own", (m) => onePlace(m || stmts),
    [["the check keeps 8.2's own files-only text", [P.STORAGE_SHOWN_SQL, files82, P.SHOWN_SQL]],
     ["the shown read writes its own copy of the pictures sum", [P.STORAGE_SHOWN_SQL, P.CHECK_SQL.storage_bytes, P.SHOWN_SQL.replace(PIC, PIC.replace("SELECT MAX(bytes) AS b", "SELECT MAX(bytes)  AS b"))]],
     ["GET /storage adds a second storage term", [P.STORAGE_SHOWN_SQL.replace(" AS pictures_bytes ", " + (SELECT COUNT(*) FROM k_renders) AS pictures_bytes "), P.CHECK_SQL.storage_bytes, P.SHOWN_SQL]]]);
  ok(P.STORAGE_USED_SQL === `(${P.STORAGE_FILES_SQL} + ${P.STORAGE_PICTURES_SQL})` && P.CHECK_SQL.storage_bytes.includes(P.STORAGE_USED_SQL),
    "the one number: STORAGE_USED_SQL is files + pictures, and the check reads it whole");
}

// ---- 8 · 8.4: the shown plan (Control's and whoami's one read) ----
const DAY = P.dayOf(NOW), MINUTE = P.minuteOf(NOW), MONTH = P.monthOf(NOW);
const YESTERDAY = P.dayOf(NOW - 86_400_000), LAST_MINUTE = P.minuteOf(NOW - 60_000), LAST_MONTH = "2026-09";
function shownWorld() {
  const d = fresh();
  for (const [id, name] of [[2, "Two"], [3, "Three"], [4, "Odd"], [5, "Stale"]]) addOrg(d, id, name);
  d.exec("UPDATE org SET plan = 'gone' WHERE id = 4");
  const ppl = d.prepare("INSERT INTO people (id, name, role, key_hash, active, pending, created_at, org) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  // org 2: the owner, two members, one PENDING (held: it counts), one removed (never) -> 4 held
  for (const [id, role, a, p] of [["t-o", "owner", 1, 0], ["t-1", "member", 1, 0], ["t-2", "partner", 1, 0], ["t-3", "member", 0, 1], ["t-4", "member", 0, 0]]) ppl.run(id, id, role, `h-${id}`, a, p, T0, 2);
  for (let i = 0; i < 9; i++) ppl.run(`u3-${i}`, "x", "member", `h3-${i}`, 1, 0, T0, 3);
  ppl.run("s-o", "s", "owner", "h-s", 1, 0, T0, 5);
  const proj = d.prepare("INSERT INTO projects (key, name, active, created_at) VALUES (?, ?, ?, ?)");
  for (const [k, a] of [["o2--a", 1], ["o2--b", 1], ["o2--c", 0], ["o3--a", 1], ["o3--b", 1], ["o3--c", 1]]) proj.run(k, k, a, T0);
  const use = d.prepare("INSERT INTO org_usage (org, day, calls_day, minute, calls_minute, month, items_month) VALUES (?, ?, ?, ?, ?, ?, ?)");
  use.run(2, DAY, 801, MINUTE, 7, MONTH, 1200);
  use.run(3, DAY, 999, MINUTE, 59, MONTH, 1499);
  use.run(5, YESTERDAY, 801, LAST_MINUTE, 7, LAST_MONTH, 1200);   // every window older: today reads 0 of each
  d.prepare("INSERT INTO artifacts (id, person_id, kind, r2_key, sha256, bytes, group_tag, created_at, org) VALUES ('a2', 't-o', 'pdf', 'o2/inbox/a2', 'h', 1000, 'g', ?, 2)").run(T0);
  d.prepare("INSERT INTO k_screen_takes (project, screen, state, variant, format, take, hash, bytes, filed_at, filed_by) VALUES ('o2--a', 's', '', '', 'html', 1, ?, 24, ?, 't-o')").run(H("9"), T0);
  return d;
}
// the check's own reads of every limit (the rows checkPlan and countCall judge by)
async function checksOf(d, org) {
  const DB = d1Of(d), q = (sql, ...b) => DB.prepare(orgSql(sql, org)).bind(...b).first();
  const calls = await q(P.CALL_READ_SQL, DAY, MINUTE);
  return { people: Number((await q(P.CHECK_SQL.people)).used), projects: Number((await q(P.CHECK_SQL.projects, "")).used), items_month: Number((await q(P.CHECK_SQL.items_month, MONTH)).used ?? 0),
    calls_day: Number(calls.calls_used), burst_minute: Number(calls.burst_used), storage_bytes: Number((await q(P.CHECK_SQL.storage_bytes)).used) };
}
const shownVia = async (d, org, sql) => {
  const DB = d1Of(d);
  if (!sql) return P.planShownOf(asOrg({ DB }, org), { now: NOW });
  return P.shownFrom(await DB.prepare(orgSql(sql, org)).bind(MONTH, DAY, MINUTE).first(), NOW);
};
const usedOf = (s) => (s && s.limits ? Object.fromEntries(P.LIMIT_ORDER.map((k) => [k, s.limits[k].used])) : null);
const FREE_LIMITS = { people: 10, projects: 3, items_month: 1500, calls_day: 1000, burst_minute: 60, storage_bytes: GB };
{
  console.log("8 · 8.4: planShownOf — the plan the checks apply, each limit's usage by the check's own read");
  const d = shownWorld();
  const want2 = { people: 4, projects: 2, items_month: 1200, calls_day: 801, burst_minute: 7, storage_bytes: 1024 };
  const claim = async (sql) => {
    const s2 = await shownVia(d, 2, sql), s3 = await shownVia(d, 3, sql), s4 = await shownVia(d, 4, sql), s5 = await shownVia(d, 5, sql);
    const allowed = (s) => Object.fromEntries(P.LIMIT_ORDER.map((k) => [k, s.limits[k].allowed]));
    return same(usedOf(s2), want2) && same(usedOf(s2), await checksOf(d, 2)) && same(usedOf(s3), await checksOf(d, 3)) && s2.plan === "free" && same(allowed(s2), FREE_LIMITS)
      && s4.plan === "free" && same(allowed(s4), FREE_LIMITS) && same(usedOf(s5), { people: 1, projects: 0, items_month: 0, calls_day: 0, burst_minute: 0, storage_bytes: 0 })
      && same(s2.storage, { files: 1000, pictures: 24 }) && s2.note === P.RAISE && same(s2.windows, { month: MONTH, day: DAY, minute: MINUTE });
  };
  const S = P.SHOWN_SQL;
  const reds = [];
  for (const [name, m] of [
    ["people as the seated only (a pending seat is held: the check counts it)", S.replace(P.PEOPLE_HELD_SQL, "(SELECT COUNT(*) FROM people INDEXED BY idx_people_org_seated WHERE org = {org} AND active = 1 AND pending = 0)")],
    ["projects counting archived ones", S.replace(P.PROJECTS_ACTIVE_SQL, "(SELECT COUNT(*) FROM projects WHERE org = {org})")],
    ["items recounted from the ledger (the check reads the tally)", S.replace("COALESCE(" + P.ITEMS_USED_EXPR + ", 0)", "(SELECT COUNT(*) FROM transmission WHERE org = {org})")],
    ["the day's calls whatever its day", S.replace("COALESCE(iif(u.day >= ?2, u.calls_day, 0), 0)", "COALESCE(u.calls_day, 0)")],
    ["the minute's burst whatever its minute", S.replace("COALESCE(iif(u.minute >= ?3, u.calls_minute, 0), 0)", "COALESCE(u.calls_minute, 0)")],
    ["the org's plan row only (no free fallback)", S.replace("COALESCE((SELECT x.plan FROM plan_limits x WHERE x.plan = o.plan), 'free')", "o.plan")],
    ["every org's usage row", S.replace("LEFT JOIN org_usage u ON u.org = o.id", "LEFT JOIN org_usage u ON u.org = 3")],
  ]) { let r; try { r = await claim(m); } catch { r = false; } reds.push([name, r]); }
  ok(reds.every(([, r]) => !r), `planShownOf: red under every mutant (${reds.map(([n]) => n).join("; ")})${reds.some(([, r]) => r) ? ` — still green: ${reds.filter(([, r]) => r).map(([n]) => n).join(", ")}` : ""}`);
  ok(await claim(null), `planShownOf: green — org 2 ${JSON.stringify(usedOf(await shownVia(d, 2)))} equals the checks' own reads; org 3 its own; org 4 (a plan naming no row) free's limits; org 5's older windows read 0`);
  // the states: "warn" exactly where the write that brought the count there warned, "limit" exactly where the next write is refused
  const stateClaim = (fn) => [3, 10, 60, 1000, 1500].every((a) => {
    for (let u = 0; u <= a + 2; u++) {
      const st = fn(u, a), refusedNext = P.verdictOf({ limit: "people", used: u, add: 1, allowed: a, plan: "free" }).verdict === "refused";
      const warnedHere = u >= 1 && P.verdictOf({ limit: "people", used: u - 1, add: 1, allowed: a, plan: "free" }).verdict === "warn";
      if ((st === "limit") !== refusedNext || (st === "warn") !== (warnedHere && !refusedNext) || !["ok", "warn", "limit"].includes(st)) return false;
    }
    return true;
  });
  redThenGreen("stateOf: warn from 80% (the warning's own rule), limit at the limit (the next write refused), else ok", (m) => stateClaim(m || P.stateOf),
    [["warn past 80% only", (u, a) => (u >= a ? "limit" : u * 5 > a * 4 ? "warn" : "ok")], ["limit only past the limit", (u, a) => (u > a ? "limit" : u * 5 >= a * 4 ? "warn" : "ok")],
     ["warn from 75%", (u, a) => (u >= a ? "limit" : u * 4 >= a * 3 ? "warn" : "ok")]]);
  // no org row: null; no plan row applies (a database with no free row): limits null, the plan unnamed
  const none = fresh(); none.exec("DELETE FROM plan_limits"); addOrg(none, 2, "Bare");
  const sNone = await shownVia(none, 2), sGone = await shownVia(d, 9);
  ok(sGone === null && sNone && sNone.limits === null && sNone.plan === null, `an org with no row reads null (${sGone}); with no plan row to apply, limits null (${JSON.stringify(sNone && { plan: sNone.plan, limits: sNone.limits })})`);
  // ONE statement, and no SCAN of a table (a co-routine's own rows aside)
  const DB = d1Of(d); await P.planShownOf(asOrg({ DB }, 2), { now: NOW });
  const ep = d.prepare("EXPLAIN QUERY PLAN " + orgSql(S, 2)).all(MONTH, DAY, MINUTE).map((r) => r.detail);
  const scanClaim = (p) => !p.some((x) => /^SCAN (?!\(subquery-\d+\)$)/.test(x)) && p.some((x) => /^SEARCH o USING INTEGER PRIMARY KEY/.test(x)) && p.some((x) => /^SEARCH u USING INTEGER PRIMARY KEY/.test(x));
  const epBad = d.prepare("EXPLAIN QUERY PLAN " + orgSql(S.replace(P.PEOPLE_HELD_SQL, "(SELECT COUNT(*) FROM people WHERE +org = {org} AND active + pending >= 1)"), 2)).all(MONTH, DAY, MINUTE).map((r) => r.detail);
  ok(!scanClaim(epBad), "SHOWN_SQL's plan: red when a count reads its table (people by +org)");
  ok(DB.statements.length === 1 && scanClaim(ep), `SHOWN_SQL: ONE statement (${DB.statements.length}), no SCAN of a table — ${ep.join(" | ")}`);
  // whoami's plan (src/core.js whoamiPlan): the admin and a member read it whole; a Partner the plan and its limits, never the
  // org's usage (review fix 2b); a read that fails is null, the D1 quota error is thrown on
  const C = await import(pathToFileURL(join(ENGINE, "src", "core.js")).href);
  const envOf2 = (o) => asOrg({ DB: d1Of(d, o) }, 2);
  const whoClaim = async (fn) => {
    const own = await fn({ id: "t-o", role: "owner" }, envOf2()), mem = await fn({ id: "t-1", role: "member" }, envOf2()), par = await fn({ id: "t-2", role: "partner" }, envOf2());
    const ven = await fn({ id: "t-2", role: "vendor" }, envOf2());
    const lost = await fn({ id: "t-o", role: "owner" }, envOf2({ throwOn: () => true }));
    let quota = false; try { await fn({ id: "t-o", role: "owner" }, envOf2({ throwOn: () => true, error: "D1_ERROR: Exceeded maximum daily row read limit (code: 7500)" })); } catch (e) { quota = /7500/.test(String(e.message)); }
    const noUsage = (x) => x && x.plan === "free" && x.note === P.RAISE && !("storage" in x) && P.LIMIT_ORDER.every((k) => same(x.limits[k], { allowed: FREE_LIMITS[k] }));
    return same(usedOf(own), want2) && same(own.storage, { files: 1000, pictures: 24 }) && same(usedOf(mem), want2) && noUsage(par) && noUsage(ven) && !/"used"/.test(JSON.stringify(par)) && lost === null && quota;
  };
  const shownWhole = async (person, env) => { try { return await P.planShownOf(env); } catch (e) { if (/7500/.test(String(e.message))) throw e; return null; } };
  const reds8 = [];
  for (const [name, fn] of [["a Partner reads the org's usage", shownWhole], ["a lost read fails whoami", async (p, e) => P.planShownOf(e)],
    ["the quota error swallowed", async (p, e) => { try { return await C.whoamiPlan(p, e); } catch { return null; } }]]) { let r; try { r = await whoClaim(fn); } catch { r = false; } reds8.push([name, r]); }
  ok(reds8.every(([, r]) => !r), `whoamiPlan: red under every mutant (${reds8.map(([n]) => n).join("; ")})`);
  ok(await whoClaim(C.whoamiPlan), "whoamiPlan: green — the admin and a member read the plan and the usage; a Partner (and an outside label) the plan and its limits only; a lost read null; the quota error thrown");
}

console.log(`${failed ? "✗" : "✓"} plans selftest: ${checks - failed} of ${checks} checks hold`);
process.exit(failed ? 1 : 0);
