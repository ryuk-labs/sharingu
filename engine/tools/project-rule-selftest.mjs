// tools/project-rule-selftest.mjs — D6a Part 4: THE one project rule (src/project.js) answers what the rule it replaced
// answered, case by case. Offline: a REAL SQLite built from boot.sql (node:sqlite), the REAL src/index.js handler (the seam,
// callTool, the routes) driven with Request/Response; no R2 object at all.
//   The table: every reader below × a read (MCP `state`, its REST twin GET /state, the Goals read GET /goals), a write (MCP
//   `submit_transmission`, the row's stamped project read back) and an extract call (MCP `search`, REST GET /search) × no
//   project, `project: alpha`, `project: beta` — in a two-project org and in a one-project org. Each cell is the project the
//   call answered (or filed into), or the refusal it gave.
//   The readers: the owner; an admin without a seat (a second owner); a seated member (alpha); a member of another project
//   (beta); a member on both, a session stamped on beta; a seatless member; a Partner with a seat (alpha); a Partner without
//   one; a read-only credential (the seated member's); the owner's session stamped on beta; a member's session stamped on a
//   project they hold no seat on.
// The truth is HEAD's: tools/fixtures/project-rule-head.json was written by THIS file run against the frozen HEAD engine of
// D6a (e6dfa6683, before the rule moved off env.BRAIN.ws):
//   PROJECT_RULE_ENGINE=<frozen head>/engine node tools/project-rule-selftest.mjs --write tools/fixtures/project-rule-head.json
// A difference is a finding, never re-pinned by hand.
// THE KEY RULE (sprint 6, 6.1; src/project.js orgOfKey / projectKeyOf, migrate-067's generated projects.org and projects.slug):
// the JS twin and the SQL twin answer the same org and slug for every key (the six live keys among them); projectKeyOf makes
// org 1's keys bare and every other org's `o<org>--<slug>`, refuses a slug holding "--" and a key past 40 characters; the
// running counts bucket a row with no project in its own org ('' for org 1, `o<org>--` for another).
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { contribute } from "./fixtures/door-helpers.mjs";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const ENGINE = process.env.PROJECT_RULE_ENGINE ? resolve(process.env.PROJECT_RULE_ENGINE) : HERE;
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const { default: handler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
// the LOCAL-only plan row (sprint 8, 8.2f, main's ruling): the harness's org rides it, never the ruled free
const LOCAL_PLAN = readFileSync(join(ENGINE, "tools", "fixtures", "local-plan.sql"), "utf8");
const T0 = "2026-09-01T00:00:00.000Z", FAR = "2099-01-01T00:00:00.000Z";
const RO_SUFFIX = ":agent-r-read-only:v1";

// [id, name, role, key, seats, session stamp (a session token on that project) | undefined]
const PEOPLE = [
  ["p-o", "Owen Owner", "owner", "owner-key", []],
  ["p-ad", "Ada Admin", "owner", "admin-key", []],
  ["p-m", "Mia Member", "member", "mem-key", ["alpha"]],
  ["p-b", "Bea Beta", "member", "beta-key", ["beta"]],
  ["p-mm", "Max Both", "member", "both-key", ["alpha", "beta"]],
  ["p-z", "Zed Seatless", "member", "seatless-key", []],
  ["p-pa", "Pat Partner", "partner", "partner-key", ["alpha"]],
  ["p-pz", "Lone Partner", "partner", "loner-key", []],
];
// the readers: [label, how they present (a key, a session token, or the read-only token of a key)]
const READERS = [
  ["owner", { key: "owner-key" }],
  ["admin, no seat", { key: "admin-key" }],
  ["seated member (alpha)", { key: "mem-key" }],
  ["member of another project (beta)", { key: "beta-key" }],
  ["member on both, session stamped beta", { session: "both-sess", person: "p-mm", stamp: "beta" }],
  ["member on both, no stamp", { key: "both-key" }],
  ["seatless member", { key: "seatless-key" }],
  ["Partner with a seat (alpha)", { key: "partner-key" }],
  ["Partner without a seat", { key: "loner-key" }],
  ["read-only credential (seated member)", { readOnlyOf: "mem-key" }],
  ["owner, session stamped beta", { session: "owner-sess", person: "p-o", stamp: "beta" }],
  ["member, session stamped where they hold no seat", { session: "stale-sess", person: "p-m", stamp: "beta" }],
];

function freshDb(projects) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(BOOT);
  db.exec(LOCAL_PLAN);
  for (const k of projects) db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)").run(k, k[0].toUpperCase() + k.slice(1), T0);
  db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (1, 'Northwind', ?, ?, 'local')").run(T0, T0);
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)");
  for (const [id, name, role, key, seats] of PEOPLE) {
    P.run(id, name, `${id}@x.test`, role, sha(key), T0);
    for (const k of seats) if (projects.includes(k)) db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,'member',?)").run(id, k, T0);
  }
  for (const [, how] of READERS) if (how.session) {
    db.prepare("INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, project, org) VALUES (?,?,?,?,?,0,?,1)")
      .run(sha(how.session), how.person, "selftest", T0, FAR, projects.includes(how.stamp) ? how.stamp : null);
  }
  return db;
}
function d1(db) {
  const exec = (sql, args) => /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }),
    run: async () => exec(sql, args), raw: async () => exec(sql, args).results.map((r) => Object.values(r)), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
// an R2 binding that holds nothing (no serve/ object, no manifest: the org's facts are its D1 row)
const BRAIN = () => ({ get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}), delete: async () => {} });

function door(db) {
  const env = { DB: d1(db), BRAIN: BRAIN() };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  let n = 0;
  const get = async (path, bearer) => {
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept: "application/json", authorization: `Bearer ${bearer}` } }), env, ctx);
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
    return { status: r.status, j };
  };
  const mcp = async (name, args, bearer) => {
    const r = await handler.fetch(new Request("https://org.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), env, ctx);
    let j = null; try { j = JSON.parse(await r.text()); } catch { j = null; }
    if (r.status !== 200 || !j) return { status: r.status, out: null };
    let out = null; try { out = JSON.parse(j.result.content[0].text); } catch { out = j.error || j; }
    return { status: r.status, out };
  };
  return { get, mcp };
}
const keyOf = (p) => (p && typeof p === "object" ? (p.key ?? null) : (p ?? null));
const refusal = (o) => (o && o.error ? `refused ${o.error}` : o && o.code && o.message ? `rpc ${o.code}` : null);
const restCell = (r, pick) => (r.status !== 200 ? `${r.status}${r.j && r.j.error ? " " + r.j.error : ""}` : `project ${pick(r.j)}`);

async function table(projects) {
  const db = freshDb(projects);
  const D = door(db);
  const out = {};
  for (const [label, how] of READERS) {
    const bearer = how.key || how.session || sha(sha(how.readOnlyOf) + RO_SUFFIX);
    for (const want of [null, "alpha", "beta"]) {
      const arg = want ? { project: want } : {};
      const qs = want ? `?project=${want}` : "";
      const row = {};
      const st = await D.mcp("updates", arg, bearer);
      row["read · MCP updates"] = st.out ? (refusal(st.out) || `project ${keyOf(st.out.project)}`) : `http ${st.status}`;
      row["read · GET /updates"] = restCell(await D.get("/updates" + qs, bearer), (j) => keyOf(j.project));
      row["read · GET /goals"] = restCell(await D.get("/goals" + qs, bearer), (j) => keyOf(j.project));
      // D5: a contribution is filed through preview then file; a refusal at either step is the cell
      const w = await contribute((name, args, key) => D.mcp(name, args, key), { ...arg, lane: "leader", kind: "note", what: `a note from ${label}`, why: "the project rule's table" }, bearer);
      const id = w.out && w.out.id;
      row["write · MCP preview, file"] = !w.out ? `http ${w.status}` : refusal(w.out)
        || (id ? `filed into ${(db.prepare("SELECT project FROM transmission WHERE id = ?").get(id) || {}).project ?? null}` : `no id: ${JSON.stringify(w.out).slice(0, 80)}`);
      const s = await D.mcp("search", { ...arg, q: "pricing" }, bearer);
      row["extract · MCP search"] = s.out ? (refusal(s.out) || `project ${keyOf(s.out.project)}`) : `http ${s.status}`;
      row["extract · GET /search"] = restCell(await D.get(`/search${qs ? qs + "&" : "?"}q=pricing`, bearer), (j) => keyOf(j.project));
      out[`${label} · ${want ? "project " + want : "no project"}`] = row;
    }
  }
  return out;
}

const answers = { "two-project org (alpha, beta)": await table(["alpha", "beta"]), "one-project org (alpha)": await table(["alpha"]) };
const wi = process.argv.indexOf("--write");
if (wi > 0) {
  writeFileSync(resolve(process.argv[wi + 1]), JSON.stringify({ engine: ENGINE.endsWith("/engine") ? "frozen HEAD e6dfa6683" : ENGINE, answers }, null, 1) + "\n");
  console.log(`project-rule: wrote ${process.argv[wi + 1]}`);
  process.exit(0);
}
const HEAD0 = JSON.parse(readFileSync(join(HERE, "tools", "fixtures", "project-rule-head.json"), "utf8")).answers;
// D5: the recorded table keeps its HEAD labels; the tools it named were renamed at once (engine/tools/names.json), so each old
// label reads the new call's cell. The cells that CHANGE are listed below, each with its reason: Part 4's two narrowings and
// nothing else. A difference not listed here is a finding.
const RENAMED = { "read · MCP state": "read · MCP updates", "read · GET /state": "read · GET /updates", "write · MCP submit_transmission": "write · MCP preview, file" };
const ONE = "one-project org (alpha)";
// (b) GET /updates reaches the updates tool's own door (src/mcp.js callTool), so in a one-project org it answers the project its
// MCP twin answers (GET /state read the seam's scope: no project); a read-only key reaches the tool through the REST gate
const TWINS_AGREE = ["owner", "admin, no seat", "seated member (alpha)", "member on both, session stamped beta", "member on both, no stamp", "read-only credential (seated member)",
  "owner, session stamped beta", "member, session stamped where they hold no seat"].map((w) => [ONE, `${w} · no project`, "read · GET /state", "project null", "project alpha", "(b) the twins agree"]);
export const EXPECTED = [
  // (a) a Partner with no seat, in an org of ONE project, no longer files into that project (doorProject: the fence on writes)
  [ONE, "Partner without a seat · no project", "write · MCP submit_transmission", "filed into alpha", "refused project_forbidden", "(a) the Partner fence covers writes"],
  ...TWINS_AGREE,
  // (c) the fold, not Part 4: the direct contribution write is gone (every filing is previewed: the owner's ruling), and the
  // preview never stamps a caller seated on no project into an org's one project (src/preview.js's own rule since B2, its header):
  // a seatless member of a one-project org, and one seated only on a project that does not exist, are refused project_forbidden
  [ONE, "seatless member · no project", "write · MCP submit_transmission", "filed into alpha", "refused project_forbidden", "(c) preview's rule"],
  [ONE, "member of another project (beta) · no project", "write · MCP submit_transmission", "filed into alpha", "refused project_forbidden", "(c) preview's rule"],
];
const HEAD = JSON.parse(JSON.stringify(HEAD0));
for (const [org, who, op, was, now] of EXPECTED) { if (HEAD[org][who][op] !== was) { console.log(`  ✗ the expected change ${org} · ${who} · ${op} starts from "${HEAD[org][who][op]}", not "${was}"`); process.exitCode = 1; } HEAD[org][who][op] = now; }
for (const rows of Object.values(HEAD)) for (const cells of Object.values(rows)) for (const [o, n] of Object.entries(RENAMED)) { cells[n] = cells[o]; delete cells[o]; }
let pass = 0, fail = 0;
for (const [org, rows] of Object.entries(HEAD)) for (const [who, cells] of Object.entries(rows)) for (const [op, was] of Object.entries(cells)) {
  const now = ((answers[org] || {})[who] || {})[op];
  if (now === was) pass++;
  else { fail++; console.log(`  ✗ ${org} · ${who} · ${op}: HEAD "${was}", now "${now}"`); }
}
// a cell the new rule answers that HEAD did not have is a finding too
for (const [org, rows] of Object.entries(answers)) for (const [who, cells] of Object.entries(rows)) for (const op of Object.keys(cells))
  if (!(((HEAD[org] || {})[who] || {})[op] !== undefined)) { fail++; console.log(`  ✗ ${org} · ${who} · ${op}: not in HEAD's table`); }
// the table is not vacuous: it holds refusals, org-level reads and each project
const flat = Object.values(answers).flatMap((r) => Object.values(r).flatMap((c) => Object.values(c)));
const has = (re) => flat.some((x) => re.test(x));
for (const [re, what] of [[/refused project_forbidden/, "a project_forbidden refusal"], [/project null/, "an org-level read"], [/project alpha/, "a read of alpha"],
  [/project beta/, "a read of beta"], [/filed into alpha/, "a write into alpha"], [/filed into beta/, "a write into beta"], [/^40[13]/, "a REST refusal"]]) {
  if (has(re)) pass++; else { fail++; console.log(`  ✗ the table holds no ${what}`); }
}
// D5 Part 4 (b): for every identity, GET /updates answers the project its MCP twin answers (a refusal the same refusal; the
// MCP door refuses a read-only key outright, http 401, which the REST gate lets read — that row is the auth surface, not a scope)
for (const [org, rows] of Object.entries(answers)) for (const [who, c] of Object.entries(rows)) {
  const m = c["read · MCP updates"], r = c["read · GET /updates"].replace(/^403 /, "refused ").replace(/^422 /, "refused ");
  if (m === r || (/read-only credential/.test(who) && m === "http 401")) pass++; else { fail++; console.log(`  ✗ (b) ${org} · ${who}: MCP updates "${m}", GET /updates "${c["read · GET /updates"]}"`); }
}
// ---- THE KEY RULE: the JS twin equals the SQL twin, key by key; projectKeyOf both ways; the per-org bucket ----
{
  const { orgOfKey, projectKeyOf } = await import(pathToFileURL(join(ENGINE, "src", "project.js")).href);
  const KEYS = ["sharingu", "ryuklabs", "siru", "saruspay", "bunny", "demo", "local", "o2--web", "o12--x-y", "o2--a--b", "o1--z", "o0--a", "o2x--q",
    "o2-web", "a--b", "-a", "ab", "o99--" + "s".repeat(34)];
  const db = freshDb([]);
  const ins = db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)");
  for (const k of KEYS) ins.run(k, k, T0);
  const sqlOf = Object.fromEntries(db.prepare("SELECT key, org, slug FROM projects").all().map((r) => [r.key, { org: Number(r.org), slug: r.slug }]));
  const differ = KEYS.filter((k) => JSON.stringify(orgOfKey(k)) !== JSON.stringify(sqlOf[k]));
  if (!differ.length) pass++; else { fail++; console.log(`  ✗ key rule: the JS and SQL twins differ on ${differ.map((k) => `${k} (js ${JSON.stringify(orgOfKey(k))}, sql ${JSON.stringify(sqlOf[k])})`).join(", ")}`); }
  const six = ["sharingu", "ryuklabs", "siru", "saruspay", "bunny", "demo"];
  if (six.every((k) => orgOfKey(k).org === 1 && orgOfKey(k).slug === k && projectKeyOf(1, k) === k)) pass++; else { fail++; console.log("  ✗ key rule: a live key is not org 1's bare slug"); }
  const cases = [[1, "siru", "siru"], [2, "web", "o2--web"], [12, "x-y", "o12--x-y"], [2, "a--b", null], [1, "o2--web", null], [0, "x", null], [-1, "web", null], [1.5, "web", null],
    [2, "s".repeat(36), "o2--" + "s".repeat(36)], [2, "s".repeat(37), null], [1, "s".repeat(40), "s".repeat(40)], [1, "x", null], [2, "Web", null], [2, 7, null]];
  const bad = cases.filter(([o, sl, want]) => projectKeyOf(o, sl) !== want);
  if (!bad.length) pass++; else { fail++; console.log(`  ✗ key rule: projectKeyOf ${bad.map(([o, sl, w]) => `(${o}, ${String(sl).slice(0, 12)}) -> ${projectKeyOf(o, sl)}, want ${w}`).join("; ")}`); }
  const round = cases.filter(([, , want]) => want).filter(([o, sl, want]) => JSON.stringify(orgOfKey(want)) !== JSON.stringify({ org: o, slug: sl }));
  if (!round.length) pass++; else { fail++; console.log(`  ✗ key rule: orgOfKey(projectKeyOf(org, slug)) is not (org, slug) for ${round.map((c) => c[2]).join(", ")}`); }
  if (orgOfKey("A") === null && orgOfKey(42) === null && orgOfKey("x".repeat(41)) === null) pass++; else { fail++; console.log("  ✗ key rule: a non-key is answered"); }
  // the per-org bucket: a row with no project counts under '' in org 1 and under o2-- in org 2, never in another org's
  db.prepare("INSERT INTO org (id, name, created_at, updated_at) VALUES (2, 'Second', ?, ?)").run(T0, T0);
  db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-two','Two','two@x.test','owner','h-two',1,?,2)").run(T0);
  const TX = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,route,status,eval,created_at,org) VALUES (?,?,'leader','note','owner','routed',0,?,?)");
  TX.run("T-20990101-001", "p-o", T0, 1); TX.run("T-20990101-002", "p-two", T0, 2); TX.run("T-20990101-003", "p-two", T0, 2);
  const open = Object.fromEntries(db.prepare("SELECT project, SUM(n) AS n FROM transmission_open GROUP BY project").all().map((r) => [r.project, Number(r.n)]));
  const kinds = Object.fromEntries(db.prepare("SELECT project, SUM(n) AS n FROM transmission_kinds GROUP BY project").all().map((r) => [r.project, Number(r.n)]));
  if (open[""] === 1 && open["o2--"] === 2 && kinds[""] === 1 && kinds["o2--"] === 2) pass++; else { fail++; console.log(`  ✗ bucket: open ${JSON.stringify(open)}, kinds ${JSON.stringify(kinds)}`); }
  db.prepare("UPDATE transmission SET org = 1 WHERE id = 'T-20990101-003'").run();
  const moved = Object.fromEntries(db.prepare("SELECT project, SUM(n) AS n FROM transmission_open GROUP BY project").all().map((r) => [r.project, Number(r.n)]));
  if (moved[""] === 2 && moved["o2--"] === 1) pass++; else { fail++; console.log(`  ✗ bucket: a row moved to org 1 did not move its count: ${JSON.stringify(moved)}`); }
}
console.log(`project-rule-selftest: ${pass} pass · ${fail} fail (${flat.length} cells, each equal to HEAD's but the ${EXPECTED.length} listed changes; the updates twins agree for every identity)`);
process.exit(fail || process.exitCode ? 1 : 0);
