// tools/fixtures/home-d1.mjs — a served-looking Home for the UI-B3 selftests (tools/wire-selftest.mjs,
// tools/check-vocab-selftest.mjs). Not a hand-typed render and not a hand-typed D1 answer: every caller hands this env
// to the REAL src/home.js readHomeSummary, whose five statements (src/hotsql.js) run against a REAL SQLite database
// built from boot.sql + migrate-038.sql (node:sqlite, the tools/d1-hot-selftest.mjs way), wrapped as a D1 binding. The
// questions are tools/fixtures/decisions-pack.mjs's, filed in alpha's k_questions (seedQuestions), and their live overlay
// comes from real transmission_refs rows.
//
// The full fixture (the owner's Home, every region full, every wf-home button drawn): project Alpha (key alpha) in the
// org Northwind; the owner Owen Park, seated Rae Kim and Amir, and the suite's Eval Seat (left out unless eval); two
// open questions the owner owes (the decisions pack: a blocker with a provisional answer, a counter and a round on it,
// and a high one); one approve row (a code filing with the owner) with one counter filed on it by parent; one grant row
// (lane leader, kind grant, routed owner by the real router's asks-a-grant); goal-moving filings this month for the
// leaderboard; one filing in, one with a person, one needing more. Ids are shapes, never a real ruling or person.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ROWS, OPEN_QID, HIGH_QID, seedQuestions } from "./decisions-pack.mjs";
import { asOrg } from "./org.mjs";
// the request's resolved project, as src/project.js PROJECT carries it (Symbol.for: the same symbol, no import)
const PROJECT = Symbol.for("sharingu.project");

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
// the LOCAL-only plan row (sprint 8, 8.2f, main's ruling): every org the harness makes rides it, never the ruled free or team
const LOCAL_PLAN = readFileSync(join(ENGINE, "tools", "fixtures", "local-plan.sql"), "utf8");
const M038 = readFileSync(join(ENGINE, "migrate-038.sql"), "utf8");
export const APPROVE_ID = "T-20260927-101", GRANT_ID = "T-20260927-102", COUNTER_ID = "T-20260927-103";
export const OWNER = { id: "p-o", name: "Owen Park", role: "owner", viaCookie: true };
export const SEAT = { id: "p-c", name: "Rae Kim", role: "internal-eng", viaCookie: true };
export const NEWCOMER = { id: "p-n", name: "Nia New", role: "internal-eng", viaCookie: true };
export const MEASURE = { name: "human touches per shipped unit", value: 2.8, period: "this quarter", prior: 4.2, priorPeriod: "last quarter", source: "the run record" };

// d1Of(sqlite, { throwOn }) — a D1-shaped binding over node:sqlite: prepare(sql).bind(...).first()/.all()/.run(), and
// `statements` (every SQL string run, in order). throwOn(sql) -> true makes that statement fail like a lost D1 call.
export function d1Of(sqlite, o = {}) {
  const statements = [];
  const DB = {
    statements,
    prepare(sql) {
      const wrap = (args) => ({
        bind: (...a) => wrap(a),
        first: async () => { statements.push(sql); if (o.throwOn && o.throwOn(sql)) throw new Error(o.error || "D1_ERROR: network connection lost"); return sqlite.prepare(sql).get(...args) ?? null; },
        all: async () => { statements.push(sql); if (o.throwOn && o.throwOn(sql)) throw new Error(o.error || "D1_ERROR: network connection lost"); return { results: sqlite.prepare(sql).all(...args) }; },
        run: async () => { statements.push(sql); const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      });
      return wrap([]);
    },
    batch: async (list) => Promise.all(list.map((st) => st.run())),
  };
  return DB;
}

// seededHome({ empty }) -> a node:sqlite DB on boot.sql + migrate-038, seeded as above (empty: the two projects only,
// nobody and nothing: every region that can be EMPTY is)
export function seededHome(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(BOOT); db.exec(M038); db.exec(LOCAL_PLAN);
  const now = Date.now(), at = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
  if (o.empty) { db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${at(9000)}'),('beta','Beta',1,'${at(9000)}')`); return db; }
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)");
  P.run("p-o", "Owen Park", "owen@northwind.test", "owner", "h-o", 1, at(9000));
  P.run("p-c", "Rae Kim", "rae@northwind.test", "internal-eng", "h-c", 1, at(8000));
  P.run("p-a", "Amir", "amir@northwind.test", "product", "h-a", 1, at(7000));
  P.run("p-n", "Nia New", "nia@northwind.test", "internal-eng", "h-n", 1, at(60));
  P.run("eval-fixed-seat", "Eval Seat", "eval@example.com", "internal-eng", "h-e", 1, at(7000));
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${at(9000)}'),('beta','Beta',1,'${at(9000)}')`);
  const S = db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
  for (const p of ["p-c", "p-a", "p-n", "eval-fixed-seat"]) S.run(p, "alpha", "member", at(6000));
  seedQuestions(db, "alpha", ROWS, "p-o");
  const X = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,decision,eval,project,parent,goal_ref,via,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  X.run(APPROVE_ID, "p-a", "code", "pr", "Workspace scoping: one column, one door, a check", "the plan", "engine", "owner", "routed", null, 0, "alpha", null, null, "mcp", at(120));
  X.run(GRANT_ID, "p-a", "leader", "grant", "Rotate the three OAuth tokens before the flip", "the security sweep found them", "engine", "owner", "routed", null, 0, "alpha", null, null, "mcp", at(90));
  X.run(COUNTER_ID, "p-c", "leader", "counter", "Scope it per workspace, not per column", "one door is not enough", "engine", "owner", "routed", null, 0, "alpha", APPROVE_ID, null, "mcp", at(60));
  // the leaderboard: goal-moving filings this month (auto, or decided approve; goal_ref set)
  let n = 200;
  const G = (who, lane, route, decision, minsAgo) => X.run(`T-20260927-${n++}`, who, lane, "pr", "moved a goal", "the goal", "x", route, decision ? "closed" : "routed", decision, 0, "alpha", null, "g1", "cli/0.3", at(minsAgo));
  for (let i = 0; i < 3; i++) G("p-o", "code", "auto", null, 30 + i);
  G("p-o", "gtm", "auto", null, 40);
  G("p-a", "leader", "owner", "approve", 50); G("p-a", "leader", "owner", "approve", 51);
  G("eval-fixed-seat", "code", "auto", null, 55);   // a suite seat: never on a real Home
  // in motion: one in (auto, this week, no goal), one needing more
  X.run(`T-20260927-${n++}`, "p-c", "design", "screen", "a screen pass", "the pass", "x", "auto", "routed", null, 0, "alpha", null, null, "mcp", at(20));
  X.run(`T-20260927-${n++}`, "p-c", "code", "pr", "a change with no proof", "why", "x", "incomplete", "routed", null, 0, "alpha", null, null, "cli/0.3", at(25));
  // the decisions overlay: the pack fixture's counter, provisional answer and round on the open blocker (by gapRefs)
  const R = db.prepare("INSERT INTO transmission_refs (tid, ref) VALUES (?, ?)");
  const Q = (id, who, kind, what, why, route) => { X.run(id, who, "leader", kind, what, why, "decisions", route, "routed", null, 0, "alpha", null, null, "mcp", at(15)); R.run(id, "q/" + OPEN_QID); };
  Q("T-20260927-301", "p-a", "counter", "A bare counter loses the why; file it as a filing instead", "the record must be reasoned about later", "owner");
  Q("T-20260927-302", "p-c", "answer", OPEN_QID + " — B: Pick from filed reasons", "provisional answer to " + OPEN_QID + " via /respond (response r1)", "auto");
  Q("T-20260927-303", "p-c", "round", OPEN_QID + " added to the round", "added to the round", "owner");
  return db;
}

// homeFixtureEnv({ empty, measure, filed, noGoal, throwOn, sqlite, ws }) -> { env, db, sqlite }: the env readHomeSummary
// reads (BRAIN serves the tenant manifest and the pack at the org root; DB is the SQLite above, alpha's aim filed in k_aim
// unless noGoal or empty, with its measure when `measure`; `filed`: alpha's knowledge written 3 minutes ago, its
// preview then file ledger row, which Home reads as "updated 3 minutes ago")
export function homeFixtureEnv(o = {}) {
  const sqlite = o.sqlite || seededHome({ empty: o.empty });
  if (!o.noGoal && !o.empty) {
    const at = new Date(Date.now() - 9000 * 60000).toISOString(), m = o.measure ? (o.measure === true ? MEASURE : o.measure) : null;
    sqlite.prepare("INSERT OR REPLACE INTO k_aim (project,aim,measure,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run("alpha", "Human touches per shipped unit, trending down.", m ? JSON.stringify(m) : null, "p-o", at, "p-o", at);
  }
  if (o.filed && !o.empty) {
    sqlite.prepare("INSERT OR REPLACE INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,decision,eval,project,parent,goal_ref,via,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)")
      .run("T-20260927-199", "p-o", "leader", "knowledge", "1 aim written", "The project's knowledge, written through the knowledge door (mcp).", "aim", "auto", "routed", null, 0, "alpha", null, null, "mcp", new Date(Date.now() - 3 * 60000).toISOString());
  }
  // the R2 binding holds nothing the worker reads (the org is its D1 row; the pack doors read D1)
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) };
  const DB = d1Of(sqlite, { throwOn: o.throwOn, error: o.error });
  // U-MCP-tail-b heal: the org has TWO active projects (alpha, beta), so the project seam scopes every request — the env a
  // read sees carries the seam's project, alpha (the owner's default: the first active project in key order), never an
  // unscoped one (which the ONE multi-project rule, core.js orgProjectsOnce, reads as the org level). The project rides the
  // env as src/project.js PROJECT does (a fixture that replaces BRAIN keeps it). o.ws: null hands the org root (seated nowhere).
  const ws = o.ws === undefined ? "alpha" : o.ws;
  return { env: asOrg({ BRAIN, DB, ...(ws ? { [PROJECT]: ws } : {}) }), db: DB, sqlite };   // a request signed in to org 1 (src/data.js)
}
export { OPEN_QID, HIGH_QID };
// orgAddress(sqlite) -> "/<org 1's path name>" (sprint 7, 7.4: a browser's session signs in only under its org's address,
// /<org>/…): org 1's row is made when the fixture holds none (Northwind, its address /northwind by migrate-072's trigger)
export function orgAddress(sqlite) {
  const at = new Date().toISOString();
  sqlite.prepare("INSERT OR IGNORE INTO org (id, name, created_at, updated_at, plan) VALUES (1, 'Northwind', ?, ?, 'local')").run(at, at);
  return "/" + sqlite.prepare("SELECT slug FROM org WHERE id = 1").get().slug;
}
