// tools/measures-selftest.mjs — the beta measures (sprint 3, S3b; src/measures.js) against a RECOUNT. A real SQLite database
// from boot.sql (node:sqlite, as a D1 binding: tools/fixtures/home-d1.mjs d1Of) is seeded with a random org — people invited
// over ten weeks (some removed, one of the suites' seats), contributions landed and not, eval-marked rows, goals real and
// removed, pick-ups by the contributor and by others, some marked done — and readMeasures' numbers must equal the same
// numbers counted here by plain loops over the raw rows (no SQL of the measures' own). Then the cases a measure must refuse:
// an eval-marked row never counts, a self pick-up is no handoff, a handoff on a removed goal never activates the org, a
// removed person and a suite seat are never in a cohort. Also: each measure has a one-sentence definition; the three
// statements read on their indexes (EXPLAIN); the export holds no person. D5L: the lanes-per-goal measure is ONE row counted
// in SQL, each project's goal range of the tally (never its rows that name no goal), and a tally group emptied by a delete
// counts no more. sprint 6, 6.3 (an owner owns one org): every world also holds a SECOND org (its people, its project, its
// ledger with handoffs on a real goal, its goals tally) and the measures read as org 1 equal org 1's recount, never moved by org
// 2's rows; read as org 2 they are org 2's own. Exit 1 on any fail. Run in the gate.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const { d1Of } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "home-d1.mjs")).href);
const M = await import(pathToFileURL(join(ENGINE, "src", "measures.js")).href);
const { asOrg, org1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "org.mjs")).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const NOW = Date.parse("2026-10-02T12:00:00.000Z"), DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString();
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

function world(o = {}) {
  const d = new DatabaseSync(":memory:"); d.exec(BOOT);
  d.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${iso(NOW - 90 * DAY)}'),('beta','Beta',1,'${iso(NOW - 90 * DAY)}')`);
  const P = d.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)");
  const people = [], since = {};
  const add = (id, name, role, active, at) => { P.run(id, name, `${id}@x`, role, `h-${id}`, active, iso(at)); people.push(id); since[id] = at; };
  add("p-own", "Owner", "owner", 1, NOW - 80 * DAY);
  for (let i = 0; i < (o.people || 14); i++) add(`p-${i}`, `P${i}`, rnd() < 0.2 ? "partner" : "member", rnd() < 0.15 ? 0 : 1, NOW - Math.floor(rnd() * 70) * DAY - Math.floor(rnd() * DAY));
  add("eval-fixed-seat", "Eval", "member", 1, NOW - 60 * DAY);
  const G = d.prepare("INSERT INTO k_goals (project,id,parent,title,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,'p-own',?,'p-own',?)");
  const goals = [];
  for (const p of ["alpha", "beta"]) { G.run(p, `${p}-root`, null, "root", iso(NOW - 80 * DAY), iso(NOW - 80 * DAY)); goals.push([p, `${p}-root`]); for (let i = 0; i < 5; i++) { G.run(p, `${p}-g${i}`, `${p}-root`, `g${i}`, iso(NOW - 80 * DAY), iso(NOW - 80 * DAY)); goals.push([p, `${p}-g${i}`]); } }
  const X = d.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,goal_ref,decision,shape,created_at,next_picked_by,next_picked_at,next_done_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  let n = 0;
  for (let i = 0; i < (o.rows || 400); i++) {
    const who = pick(people), [proj, goal] = pick(goals);
    // work happens after the person was invited (an imported row may precede it: one in a hundred), and is picked up before now
    const from = rnd() < 0.01 ? NOW - 75 * DAY : since[who];
    const at = from + Math.floor(rnd() * (NOW - from - DAY));
    const created = iso(at);
    const route = pick(["auto", "auto", "owner", "incomplete"]), decision = route === "owner" && rnd() < 0.5 ? "approve" : null;
    const ev = who === "eval-fixed-seat" || rnd() < 0.08 ? 1 : 0;
    const g = rnd() < 0.7 ? goal : null;
    let by = null, pat = null, done = null;
    if (rnd() < 0.25) { by = rnd() < 0.3 ? who : pick(people); pat = iso(Math.min(NOW - 60e3, at + Math.floor(rnd() * 5 * DAY))); if (rnd() < 0.5) done = iso(Math.min(NOW - 30e3, at + Math.floor(rnd() * 9 * DAY))); }
    X.run(`T-${String(++n).padStart(6, "0")}`, who, pick(["code", "design", "gtm", "leader", "finance"]), pick(["pr", "note", "screen", "knowledge", "counter"]), "x", route, "closed", ev, proj, g, decision,
      by ? '{"next":{"what":"do it"}}' : null, created, by, pat, done);
  }
  // a goal removed after the work that named it: its rows stay, it is no real goal any more
  d.exec("DELETE FROM k_goals WHERE project = 'beta' AND id = 'beta-g4'");
  // the SECOND org (sprint 6, 6.3): its own people, project, goal and ledger — handoffs by another person, done on a real goal, in
  // lanes of their own — whose every row org 1's measures must leave out
  if (o.org2 !== false) {
    const at = (dd) => iso(NOW - dd * DAY);
    d.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('o2--shop','Shop',1,'${at(50)}')`);
    d.exec(`INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('q-own','Q','q@y','owner','h-q-own',1,'${at(50)}',2),('q-mem','R','r@y','member','h-q-mem',1,'${at(49)}',2)`);
    G.run("o2--shop", "sell", null, "Sell", at(50), at(50));
    const Y = d.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,goal_ref,decision,shape,created_at,next_picked_by,next_picked_at,next_done_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,2)");
    for (let i = 0; i < 12; i++) Y.run(`T-q${String(i).padStart(4, "0")}`, i % 2 ? "q-mem" : "q-own", ["code", "gtm", "finance"][i % 3], "pr", "x", "auto", "closed", 0, "o2--shop", "sell", null,
      '{"next":{"what":"do it"}}', at(48 - i * 3), i % 2 ? "q-own" : "q-mem", at(47.5 - i * 3), i % 4 === 0 ? at(47 - i * 3) : null);
  }
  return d;
}

// the RECOUNT: plain loops over the raw rows
function recount(d) {
  const T = d.prepare("SELECT * FROM transmission WHERE org = 1").all(), people = d.prepare("SELECT * FROM people WHERE org = 1").all();
  const goals = new Set(d.prepare("SELECT project, id FROM k_goals").all().map((g) => `${g.project}|${g.id}`));
  const hand = T.filter((t) => t.eval === 0 && t.next_picked_by && t.next_picked_by !== t.submitter);
  const firstH = hand.map((t) => t.next_picked_at).sort()[0] || null;
  const perWeek = Array.from({ length: 8 }, (_, i) => hand.filter((t) => Math.floor((NOW - Date.parse(t.next_picked_at)) / (7 * DAY)) === 7 - i).length);
  const act = hand.filter((t) => t.next_done_at && t.goal_ref && goals.has(`${t.project}|${t.goal_ref}`)).map((t) => t.next_done_at).sort()[0] || null;
  const cohort = people.filter((p) => p.active === 1 && !p.id.startsWith("eval-fixed-"));
  const real = (p) => T.filter((t) => t.submitter === p.id && t.eval === 0).map((t) => t.created_at).sort();
  const landed = (p) => T.filter((t) => t.submitter === p.id && t.eval === 0 && (t.route === "auto" || t.decision === "approve")).map((t) => t.created_at).sort();
  const back = (p, a, b) => { const f = Date.parse(real(p)[0]); return real(p).some((c) => Date.parse(c) >= f + a * DAY && Date.parse(c) < f + b * DAY); };
  const w1 = cohort.filter((p) => real(p).length && NOW - Date.parse(real(p)[0]) >= 14 * DAY), w4 = cohort.filter((p) => real(p).length && NOW - Date.parse(real(p)[0]) >= 35 * DAY);
  const invited = cohort.filter((p) => p.role !== "owner");
  const days = invited.filter((p) => landed(p).length).map((p) => Math.max(0, (Date.parse(landed(p)[0]) - Date.parse(p.created_at)) / DAY)).sort((a, b) => a - b);
  const med = days.length ? (days.length % 2 ? days[days.length >> 1] : (days[days.length / 2 - 1] + days[days.length / 2]) / 2) : null;
  const lanes = new Map();
  for (const t of T) {
    if (t.eval !== 0 || !t.goal_ref || !(t.route === "auto" || t.decision === "approve") || !goals.has(`${t.project}|${t.goal_ref}`)) continue;
    if (["counter", "critique", "rank", "restore", "item", "publish", "equip"].includes(t.kind)) continue;
    const k = `${t.project}|${t.goal_ref}`; if (!lanes.has(k)) lanes.set(k, new Set()); lanes.get(k).add(String(t.lane).toLowerCase());
  }
  return {
    first_handoff: firstH, handoffs: hand.length, perWeek, activated: act,
    w1: [w1.filter((p) => back(p, 7, 14)).length, w1.length], w4: [w4.filter((p) => back(p, 28, 35)).length, w4.length],
    median: med == null ? null : Math.round(med * 10) / 10, usefulPeople: days.length, invited: invited.length,
    cross: [[...lanes.values()].filter((s) => s.size >= 2).length, lanes.size],
  };
}

const val = (read, k) => read.measures.find((m) => m.key === k).value;
for (const s of [7, 21, 99]) {
  seed = s;
  const d = world();
  const read = await M.readMeasures(asOrg({ DB: d1Of(d) }), { nowMs: NOW });
  const want = recount(d);
  const got = {
    first_handoff: val(read, "first_handoff").at, handoffs: val(read, "repeat_handoffs").handoffs, perWeek: val(read, "repeat_handoffs").perWeek, activated: val(read, "activated").at,
    w1: [val(read, "week1_return").returned, val(read, "week1_return").of], w4: [val(read, "week4_return").returned, val(read, "week4_return").of],
    median: val(read, "first_useful").medianDays, usefulPeople: val(read, "first_useful").people, invited: val(read, "first_useful").of,
    cross: [val(read, "cross_role").goals, val(read, "cross_role").of],
  };
  const off = Object.keys(want).filter((k) => JSON.stringify(want[k]) !== JSON.stringify(got[k]));
  ok(!off.length, `seed ${s}: every measure equals the recount (handoffs ${got.handoffs}, first ${got.first_handoff}, week-1 ${got.w1.join("/")}, week-4 ${got.w4.join("/")}, cross-role ${got.cross.join("/")}, first useful ${got.median} d over ${got.usefulPeople}/${got.invited}, activated ${got.activated})${off.length ? ` — off: ${off.map((k) => `${k} want ${JSON.stringify(want[k])} got ${JSON.stringify(got[k])}`).join("; ")}` : ""}`);
  ok(read.measures.every((m) => m.definition && !/\n/.test(m.definition) && m.definition.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length === 1), `seed ${s}: each of the ${read.measures.length} measures carries a one-sentence definition`);
}

// the second org's own measures: read as org 2, its handoffs, its people and its goal alone (never org 1's)
{
  seed = 7;
  const d = world();
  const two = await M.readMeasures(asOrg({ DB: d1Of(d) }, 2), { nowMs: NOW });
  seed = 7;
  const solo = await M.readMeasures(asOrg({ DB: d1Of(world({ org2: false })) }), { nowMs: NOW });
  seed = 7;
  const one = await M.readMeasures(asOrg({ DB: d1Of(world()) }), { nowMs: NOW });
  ok(val(two, "repeat_handoffs").handoffs === 12 && val(two, "first_useful").of === 1 && val(two, "activated").project === "o2--shop" && val(two, "activated").goal === "sell"
    && JSON.stringify(val(two, "cross_role")) === JSON.stringify({ goals: 1, of: 1, mostLanes: 3 }) && String(val(two, "first_handoff").project) === "o2--shop",
    `org 2 reads its own: 12 handoffs, 1 invited person, activated on o2--shop/sell, its one goal drew 3 lanes (${JSON.stringify(val(two, "cross_role"))})`);
  ok(JSON.stringify(one.measures.map((m) => m.value)) === JSON.stringify(solo.measures.map((m) => m.value)),
    "org 1 reads the same measures with org 2 in the database as without it");
}

// the refusals, on a small world built by hand
{
  const d = new DatabaseSync(":memory:"); d.exec(BOOT);
  d.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('a','A',1,'${iso(NOW - 40 * DAY)}')`);
  const P = d.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)");
  P.run("o", "O", "o@x", "owner", "h1", 1, iso(NOW - 40 * DAY)); P.run("m", "M", "m@x", "member", "h2", 1, iso(NOW - 30 * DAY)); P.run("gone", "G", "g@x", "member", "h3", 0, iso(NOW - 30 * DAY)); P.run("eval-fixed-x", "E", "e@x", "member", "h4", 1, iso(NOW - 30 * DAY));
  d.exec(`INSERT INTO k_goals (project,id,title,created_by,created_at,updated_by,updated_at) VALUES ('a','g','G','o','${iso(NOW)}','o','${iso(NOW)}')`);
  const X = d.prepare("INSERT INTO transmission (id,submitter,lane,kind,route,status,eval,project,goal_ref,created_at,next_picked_by,next_picked_at,next_done_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  X.run("T-1", "m", "code", "pr", "auto", "closed", 1, "a", "g", iso(NOW - 10 * DAY), "o", iso(NOW - 9 * DAY), iso(NOW - 8 * DAY));     // eval-marked
  X.run("T-2", "m", "code", "pr", "auto", "closed", 0, "a", "g", iso(NOW - 10 * DAY), "m", iso(NOW - 9 * DAY), iso(NOW - 8 * DAY));     // picked by its own contributor
  X.run("T-3", "m", "code", "pr", "auto", "closed", 0, "a", "nogoal", iso(NOW - 10 * DAY), "o", iso(NOW - 9 * DAY), iso(NOW - 8 * DAY)); // a goal the project does not hold
  X.run("T-4", "gone", "code", "pr", "auto", "closed", 0, "a", null, iso(NOW - 20 * DAY), null, null, null);                              // a removed person
  X.run("T-5", "eval-fixed-x", "code", "pr", "auto", "closed", 0, "a", null, iso(NOW - 20 * DAY), null, null, null);                      // a suite seat
  const r1 = await M.readMeasures(asOrg({ DB: d1Of(d) }), { nowMs: NOW });
  ok(val(r1, "repeat_handoffs").handoffs === 1 && val(r1, "first_handoff").at === iso(NOW - 9 * DAY), "an eval-marked pick-up and a self pick-up are no handoff (1 handoff: T-3's)");
  ok(val(r1, "activated").yes === false, "a handoff done on a goal the project does not hold never activates the org");
  X.run("T-6", "m", "design", "screen", "auto", "closed", 0, "a", "g", iso(NOW - 6 * DAY), "o", iso(NOW - 5 * DAY), null);
  const r2 = await M.readMeasures(asOrg({ DB: d1Of(d) }), { nowMs: NOW });
  ok(val(r2, "activated").yes === false && val(r2, "repeat_handoffs").count === 1, "a handoff on a real goal not marked done does not activate it (2 handoffs, 1 repeat)");
  d.exec(`UPDATE transmission SET next_done_at = '${iso(NOW - 4 * DAY)}' WHERE id = 'T-6'`);
  const r3 = await M.readMeasures(asOrg({ DB: d1Of(d) }), { nowMs: NOW });
  ok(val(r3, "activated").yes === true && val(r3, "activated").at === iso(NOW - 4 * DAY) && val(r3, "activated").goal === "g" && val(r3, "activated").project === "a", `done on a real goal by another person: activated on ${val(r3, "activated").at}`);
  ok(val(r3, "first_useful").of === 1 && val(r3, "week1_return").of === 0, "a removed person and a suite seat are in no cohort (1 invited person: m)");
  const ex = M.exportOf(r3, { org: "A" });
  const text = JSON.stringify(ex);
  ok(ex.measures.length === 7 && ex.measures.every((m) => m.definition && m.value !== undefined) && !/"(m|o|gone|eval-fixed-x)"/.test(text) && !/@x/.test(text), "the export: seven measures with their definitions and values, no person's id or address");
  // D5L: the lanes are counted in SQL, one row; a landed contribution deleted leaves its tally group at zero, which never counts
  ok(JSON.stringify(val(r3, "cross_role")) === JSON.stringify({ goals: 1, of: 1, mostLanes: 2 }) && d.prepare(org1(M.MEASURES_ROLES_SQL)).all().length === 1,
    `cross-role: goal g drew code and design (one row answered: ${JSON.stringify(val(r3, "cross_role"))})`);
  d.exec("DELETE FROM transmission WHERE id = 'T-6'");
  const r4 = await M.readMeasures(asOrg({ DB: d1Of(d) }), { nowMs: NOW });
  const zero = d.prepare("SELECT COUNT(*) AS n FROM transmission_goals WHERE n = 0 AND goal_ref = '=g'").get().n;
  const kept = d.prepare(org1(M.MEASURES_ROLES_SQL).replace(" AND tg.n > 0", "")).get();
  ok(zero >= 1 && JSON.stringify(val(r4, "cross_role")) === JSON.stringify({ goals: 0, of: 1, mostLanes: 1 }) && kept.cross_goals === 1,
    `cross-role: T-6 deleted, its design group stays as a row of zeros (${zero}) and counts no more: ${JSON.stringify(val(r4, "cross_role"))} (both ways: counting the zero rows says ${kept.cross_goals} cross-role goal)`);
  const plan = (sql, ...b) => d.prepare("EXPLAIN QUERY PLAN " + org1(sql)).all(...b).map((r) => r.detail).join(" | ");
  const pr = plan(M.MEASURES_ROLES_SQL);
  ok(/SCAN pr\b(?! USING)/.test(pr) && /SEARCH tg USING INDEX sqlite_autoindex_transmission_goals_1 \(project=\? AND clean=\? AND goal_ref>\?\)/.test(pr)
    && /SEARCH g EXISTS USING COVERING INDEX sqlite_autoindex_k_goals_1 \(project=\? AND id=\?\)/.test(pr) && !/SCAN tg\b/.test(pr),
    `the lanes per goal: the projects (the table: their org is generated from the key), then each one's goal range of the tally's primary key, one k_goals probe a goal — never the whole tally: ${pr}`);
  const pr0 = plan(M.MEASURES_ROLES_SQL.replace("CROSS JOIN", "JOIN").replace(" NOT INDEXED", ""));
  ok(/SCAN tg\b/.test(pr0), `both ways: without CROSS JOIN and NOT INDEXED (each alone keeps the projects first) the planner walks the whole tally (${pr0.split(" | ").find((x) => /tg\b/.test(x))})`);
  ok(/idx_transmission_handoffs/.test(plan(M.MEASURES_HANDOFFS_SQL, iso(NOW))) && /idx_people_active/.test(plan(M.MEASURES_PEOPLE_SQL)) && /idx_transmission_submitter/.test(plan(M.MEASURES_PEOPLE_SQL)) && !/SCAN t\b/.test(plan(M.MEASURES_PEOPLE_SQL)),
    "the statements read on their indexes: handoffs on idx_transmission_handoffs, people on idx_people_active and idx_transmission_submitter (no scan of the ledger)");
}

console.log(`${failed ? "✗" : "✓"} measures selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
