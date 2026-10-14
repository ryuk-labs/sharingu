// tools/d1-hot-selftest.mjs — build0925:d1-hot-queries (2026-09-25). Offline gate step: no wrangler, no network.
//
// Pins the fixes for the engine-owned D1 hot readers from the 2026-09-25 d1QueriesAdaptiveGroups list. Every
// SQL string checked here is IMPORTED from the module the worker runs it from (src/hotsql.js, src/tenant.js,
// src/core.js), never a hand-typed copy. It runs against a REAL SQLite DB (node:sqlite) built from boot.sql, with
// migrate-037.sql replayed on top (idempotent), seeded with enough rows that the planner has a real choice.
//
//   A. PLANS: EXPLAIN QUERY PLAN for #5 devices, #6 open-loops count, #7 owner lookup and #4 /audit (bare, and with
//      the person filter) use migrate-037's indexes. No bare `SCAN tokens|loops|people|events` and no temp b-tree sort
//      on the LIMIT queries. (#2, the all-time org leaderboard, is gone with the old Home, UI-B3: its checks moved to
//      Home's S4, the project's goal movement this month, in section G.)
//   B. INSTRUMENT: the same assertions run on the PRE-037 schema (boot.sql with migrate-037's five indexes
//      dropped) with the PRE-CHANGE SQL, and each must FAIL there. A plan check that cannot fail is not a check.
//   C. SAME ROWS: /audit returns exactly what the pre-change SQL returns on the same data, and the /audit result is
//      identical with and without the partial index.
//   D. PER REQUEST: resolveOwner and resolveReadOnly make exactly ONE D1 call per request across repeated calls
//      (and across the workspace seam's `{ ...env }` copy), a fresh env reads again, an env with no memo reads
//      every time, a failed read is not memoized, clearReqMemo re-reads, a malformed read-only token costs ZERO
//      reads, and a person deactivated between two requests is refused on the second.
//   E. REAL HANDLER: GET /home through src/index.js's default export (the cf-workers stub loader, as
//      tools/logout-ruling-selftest.mjs does) runs the owner lookup at most once per request, and a read-only
//      visit to a multi-workspace org (the seam AND the route both resolve the reader) runs the roster scan once.
//   F. UI-B2, the Decisions overlay: the two live SQL strings (src/hotsql.js DECISIONS_LIVE_SQL · QUESTION_LIVE_SQL)
//      SEARCH idx_transmission_refs_ref and never SCAN transmission; the same check FAILS on a `gaprefs LIKE` form of
//      the read (the instrument), and no live string carries `gaprefs LIKE`. The overlay keeps the request's project's
//      filings only (the same qid in another project never shows). Through the real handler, GET /decisions and GET
//      /question/:qid (JSON and HTML) each run exactly ONE D1 statement beyond the same request with no question filed
//      (the auth, the router, the shell and the questions read cost the same on both), and that one statement is the
//      overlay; a handler that read twice would go red (proven by injection). UI-B3: the overlay also returns the
//      answers decided approve, and still never scans transmission.
//   G. UI-B3, Home: EXPLAIN on the exact strings src/home.js runs (src/hotsql.js HOME_TX_AGG_SQL · HOME_OWNER_ROWS_SQL ·
//      HOME_FIRST5_SQL · HOME_GOALS_MOVED_SQL · HOME_SEATS_SQL) SEARCHes an index and never SCANs transmission; S2's
//      counter count FAILS on the pre-038 schema (migrate-038's idx_transmission_parent is what serves it), and each of
//      S1 / S4 / S5 FAILS with its own index dropped (every plan check can fail). S4's rows equal a plain aggregation
//      of the seeded rows (and a variant without its goal filter differs). Through the real handler, GET /home (HTML)
//      and GET /home/summary (JSON) each run the SAME number of D1 statements beyond the same request's baseline
//      (GET /decisions with no pack: the auth, the router and the shell, nothing of its own), at most six (the five and
//      the aim, src/knowledge/goals.js AIM_SQL), and they are exactly Home's own statements, for the owner and for a
//      seat; a handler with a seventh read goes red.
//   H. UI-B4a, the filing page: EXPLAIN on the exact strings it runs (src/hotsql.js FILING_COUNTERS_SQL, owner and
//      scoped, with and without suite rows, and TX_ONE_SQL): the counters SEARCH idx_transmission_parent and never SCAN
//      transmission, and the same check FAILS on the pre-038 schema and on the counters statement written without its
//      unary + (the planner then walks idx_transmission_eval_created). Through the real handler, GET /contribution/:id
//      (the page) runs at most TWO D1 statements beyond the same request's baseline (GET /decisions with no pack: the
//      auth, the router and the shell) and the memoized owner lookup, and they are exactly the row and the counters, for
//      the owner and for a seat; a handler with a third read goes red.
//   I. UI-B4b, Build (the Build half of section H): EXPLAIN on the exact strings src/build.js runs (src/hotsql.js
//      BUILD_ROWS_SQL, with and without suite rows and ?kind=, scoped and unscoped, and BUILD_AGG_SQL): B1 walks
//      idx_transmission_project newest first with no sort of its own (it stops at the LIMIT) and its two correlated
//      subqueries (the standing counters, the latest rank press) SEARCH idx_transmission_parent; B2 and B3 (UI-B6b, the
//      finish line: GOALS_AGG_SQL over all time, bound from the epoch) SEARCH idx_transmission_project; none SCANs
//      transmission. Each check FAILS on the pre-038 schema, with idx_transmission_project dropped (B1, B2 and B3), and on
//      B1 written without its unary + (the rank subquery then walks idx_transmission_kind_eval). B1's counters and rank
//      columns equal a plain computation over the seeded rows. Through the real handler, with a goal tree FILED (k_goals),
//      GET /build (HTML) and GET /build (JSON) each run the SAME D1 statements beyond the same request's baseline (GET
//      /decisions with no pack) and the memoized owner lookup: the tree, B1, B2 and B3 (and, for the owner, the project's
//      name), for the owner and for a seat; a handler with one read more goes red; with NO goal filed the same door runs
//      the tree, B1 and B2 (no B3).
//   J. Versions (section I is Build's): a version is a snapshot in D1, so through the real handler GET /versions (the page
//      and the JSON) and GET /versions/:v run exactly ONE statement of their own (the list, the project's name on it), the
//      BEHIND poll GET /versions?head=1 exactly the head, and every other signed-in page the head once (the shell); each
//      SEARCHes its primary key. The counting instrument leaves these version reads out of every other section's sums, so
//      each section below counts what its own page runs
//      beyond the same request's baseline (GET /decisions with no question filed, less its own questions read: the auth, the
//      router and the shell), for the owner and for a seat; the instrument: a handler whose spine read also ran one D1
//      statement counts one, so the check goes red.
//   K. UI-B6a, Goals: EXPLAIN on the exact strings src/goalsread.js runs (src/hotsql.js GOALS_AGG_SQL · GOALS_COUNTERS_SQL ·
//      GOAL_COUNTERS_SQL · GOAL_ROWS_SQL, scoped and unscoped, with and without suite rows): the aggregate SEARCHes
//      idx_transmission_project (project, created_at), the goal/ counters SEARCH idx_transmission_refs_ref (one range, and
//      one ref), a goal's rows SEARCH idx_transmission_goalref; none SCANs transmission. Each check FAILS with its own index
//      dropped, and G4 FAILS without its unary + (the planner then walks idx_transmission_project). G1's groups and G2's
//      counts equal a plain computation over the seeded rows (a knowledge row never feeds G1). Slice 1: the goal tree
//      (k_goals, by its primary key) and the project's name (projects by key) SEARCH too. Through the real handler, with
//      the tree FILED in k_goals, GET /goals (page and JSON) runs exactly the tree, G1, G2 and C1 beyond the same request's
//      baseline (GET /decisions with no pack) and the memoized owner lookup; GET /goals/:ref the tree, G1, G3 and G4; the
//      owner (seated nowhere) also the project's name; an unknown ref is 404 unknown_goal after the tree read alone; for
//      the owner and for a seat; a handler reading G1 twice goes red; with no goal filed, declared:false, the note naming
//      preview then file, the tree read alone (no ledger statement).
//   L. slice 3, the Map reads D1: EXPLAIN on the exact strings src/knowledge/canvas.js and checks.js run, over a model filed
//      through the importer's own mappers: the typed node and edge reads SEARCH idx_k_nodes_type / idx_k_edges_kind in the
//      index's own order (no sort), one node its primary key, its edges the primary key and idx_k_edges_to, a light
//      k_check_refs by (project, ref) and each check's latest grade idx_check_results_latest; each FAILS with its index
//      dropped, and the pre-migrate-040 light (derived from k_checks.refs) walks the register. The lights equal the seeds.
//      The Map (sprint 2, migrate-043): its compact node read SEARCHes idx_k_nodes_type, its links k_node_links' key, its lit
//      probes idx_k_node_lights_lit, the lights poll idx_k_node_lights_at and one node's light k_node_lights' key; each
//      FAILS with its index dropped.
//   M. slice 3, through the real handler: GET /map (the Map page: the compact nodes, the links and the lit
//      probes, once each), GET /map/lights (its one statement), GET /canvas.json, GET /map/node (a gap, a table, a goal: its
//      light off k_node_lights) and every plane (JSON: its own parts; a model plane's page is the Map page) run their own
//      model statements exactly once beyond the same request's baseline (GET /versions, JSON or page), counted by text, for
//      the owner and for a seat; Map · MCP none, and exactly one statement, BROADCAST_SQL; Map · Arch beside its model read
//      exactly the shell's own two (the active count and the seats, the seats once). The answers match the seeded model.
//   N. UI-B10a, GTM: EXPLAIN on the exact strings src/gtmread.js runs (src/hotsql.js GTM_ROWS_SQL X1 · GTM_KINDS_SQL X2, scoped
//      and unscoped, with and without suite rows): X1 walks idx_transmission_project (project, created_at) newest first with no
//      sort of its own and its standing-counter subquery SEARCHes idx_transmission_parent; X2 SEARCHes idx_transmission_project;
//      neither SCANs transmission. Each FAILS with idx_transmission_project dropped, and X1 on the pre-038 schema. X1's rows
//      (gtm lane, this project, counters and ranks out, suite rows out, each row's standing count) and X2's per-kind counts equal
//      a plain computation over the seeded rows, and the seat scope holds (a reader with no seat on the project reads none).
//      Through the real handler, GET /gtm (JSON and the page) runs EXACTLY the goal tree (k_goals), G1 (the SAME
//      text GET /goals runs, once), X1 and X2 beyond the same request's baseline (GET /versions in the same face) and the
//      memoized owner lookup, and the owner (seated nowhere) the project's name too; with no goal filed the tree, X1 and X2,
//      no G1; the instrument: a handler reading G1 twice counts one more, so the check goes red.
//   O. UI-B11a, Broadcast: EXPLAIN on the exact string src/broadcastread.js runs (src/hotsql.js BROADCAST_SQL, with and
//      without suite rows): the three kinds' rows SEARCH idx_transmission_kind_eval (kind=? AND eval=?; kind=? with ?eval=1),
//      the seat arm SEARCHes project_seats' own key, people by its key; transmission is never SCANned and the ledger is never
//      walked on idx_transmission_eval_created. It FAILS with idx_transmission_kind_eval dropped, and written without the
//      ORDER BY's unary + (the planner then walks idx_transmission_eval_created). Its rows equal a plain computation over the
//      seeded rows: every item and publish of the org, an equip only in a project the reader holds a seat on (the owner: every
//      active project), suite rows out, the reader's active seats as its seat rows. Through the real handler GET /broadcast
//      (JSON, and ?eval=1) runs EXACTLY that statement beyond the same request's baseline (GET /versions as JSON) and the
//      memoized owner lookup, for a seat, and it and the project's name (projects by key) for the owner, who holds no seat
//      (the brief's budget is at most two); the instrument: a handler reading it twice counts one more, so the check goes
//      red. GET /map/mcp's one statement (Map · MCP at
//      most one, the same BROADCAST_SQL) is section M's. O5 (sprint 2, the live picture): BROADCAST_LIVE_SQL and
//      BROADCAST_POLL_SQL SEARCH idx_transmission_project (project=? AND created_at>?) in order with no sort, people and
//      k_goals by their keys, and FAIL with that index dropped; GET /broadcast/live runs exactly one of them beyond the
//      baseline (the owner naming a project also pays the scope's own project lookup).
//   P. U-MCP (Q0D506BBC), the project named per call: through the real handler, a reader seated on the org's SECOND project
//      (by key) only runs EXACTLY the same statements for home, goals and build naming it as with no project (+0), the owner
//      naming an active project it holds no seat on at most one more (the primary-key lookup), brain://goals?project= the
//      same as the goals tool and GET /home/summary?project= the same as without; the seats statement runs exactly once per
//      request (src/core.js seatsOnce, D9) on the tools, the GET twin and the resource; a named project the reader holds no
//      seat on is refused project_forbidden before any filing is read. The instruments: the seats read twice, the owner's
//      lookup read twice, and the comparison seeing one statement, each red. (Section M's /map/arch is +1 since D9.)
//   Q. U-MCP-tail-a (QE6B9CEBA Fork 1 (1)), what waits on the owner: the owner's heartbeat (REST and MCP) and `state` (every
//      caller) run EXACTLY ONE more statement with a pack published, the Decisions overlay (src/core.js ownerOwedOnce), a
//      member's heartbeat none, and the owner's /home page reads that overlay ONCE for Home and the shell badge (reqMemo);
//      the instrument: the overlay read twice, red. (Section F: the owner's QuestionCard page is +2 since, its own overlay
//      and the badge's.)
//   R. U-MCP-tail-b (QE6B9CEBA D7 + D4): the thread brief's pending rulings and GET /missing' ledger counts carry the request scope's clause, captured from the real handler (a seated key: project =
//      its seat; seated nowhere: project IS NULL, never org-wide) and EXPLAINed (each SEARCHes an index); the clause adds no
//      statement (+0); the owner's live-stamp check (activeKeysOnce) runs at most once and costs no statement beyond an
//      unstamped owner's, an archived stamp reads the default, a member's seat stamp costs none; the instruments: the
//      active-keys statement read twice, and a clause-less (org-wide) statement, each red.
//   S. the U-MCP-tail-b heal (finding 1): the seam and projectScopeOf read ONE "multi-project" rule (core.js orgProjectsOnce:
//      the D1 ACTIVE projects, one memo keyed by the binding, pinned per request) — the reviewer's worlds (one active project of
//      two, and the mirror) and the stale-memo window: every REST read and its tool bind the same clause for each caller.
//   T. the heal (finding 2, D6): the pack file's own `project` never binds — a seatless caller's brief {for} reads no
//      project's register and its changes never the root pack's claimed project, its grade is refused with nothing filed;
//      a grade of a check the register does not hold is unknown_check; a scoped caller still grades its project.
//   U. U-MCP-tail-c (QE6B9CEBA): REST POST /grade scopes by its body `project` like submit_grade; Map · Arch's chip.
//   V. UI-B12a, Control's ONE read: GET /control/people's three statements (X1 people + seats, X2 active projects with
//      seat counts, X3 live devices) SEARCH by key and FAIL with their index dropped; the rows equal a plain computation
//      (the admin every active non-eval person, a seat only who shares an ACTIVE project); through the real handler exactly
//      three beyond the GET /versions JSON baseline for the owner, a seat, ?eval=1 and a one-project org; a fourth read red.
//   Y. sprint 2, the live budget (migrate-042): the heartbeat's landed read walks idx_events_landed (FAILS with the index
//      dropped, and without its unary +); the badge's counts, whoami's and the owner's queue counts read their tally on its
//      primary key; the owner's blockers and Home's open overlay SEARCH idx_transmission_refs_ref once per open question.
//      Sections G, I, K, N, Q and V above were re-pinned to migrate-042's tallies and indexes in the same sprint (Home S1 on
//      the tallies + the week's two ranges, S4 on idx_transmission_goal_month, S5 on idx_people_active; Build B2 on the kinds
//      tally + the week, B3 and G1 on the goals tally; GTM on idx_transmission_lane with X2 counted from X1; Control on
//      idx_people_active and idx_tokens_person_live). The tallies' exactness is tools/tally-selftest.mjs's.
//   D5L. `updates`' own items (src/thread.js, src/hotsql.js THREAD_*_SQL): your filings with their rulings walk
//      idx_transmission_submitter to the LIMIT (each ruling one idx_approval_audit_tx probe), the owner's queue walks
//      idx_transmission_owner_open newest first from the cut, your reports and questions idx_events_person_kind; no SCAN of a
//      table, no sort. Each FAILS without its unary + / its INDEXED BY. Through the real handler the owner's GET /updates reads
//      the open items once (the heartbeat's read, handed to the thread) and the queue once, its LIMIT the answer's `limit`.
//   M4. The Arch view's marks (src/hotsql.js ARCH_MARKS_SQL): the diagram's ids probe k_node_lights and k_node_stale on their
//      keys, a failing or stale check on that id's k_check_refs range; no SCAN of a table (it scans lights with no key). Through
//      the real handler GET /map/arch (page and JSON) runs it once, and the page's diagram carries what it says.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
// sprint 6 (6.2): every statement this check names is the text org 1's request runs (src/data.js writes the reader's org into
// {org} and {orgbucket}; the fixtures are org 1's), so each src module's exports are read through org1 (tools/fixtures/org.mjs)
const { org1, asOrg } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "org.mjs")).href);
const imo = async (u) => { const m = await import(u); return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, k === "default" ? v : org1(v)])); };
const { AUDIT_BASE_CLAUSES, auditEventsSql, DECISIONS_LIVE_SQL, QUESTION_LIVE_SQL,
  HOME_TX_AGG_SQL, HOME_OWNER_ROWS_SQL, HOME_FIRST5_SQL, HOME_GOALS_MOVED_SQL, HOME_SEATS_SQL, FILING_COUNTERS_SQL, TX_ONE_SQL, CHECKLIST_SQL, CHECKLIST_FIRSTS_SQL,
  BUILD_ROWS_SQL, BUILD_AGG_SQL, GOALS_AGG_SQL: GOALS_AGG_SQL_B3, OWNER_OWED_LIVE_SQL, OPEN_LIVE_SQL, WEEK_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
const { OWNER_SQL, resolveOwner } = await imo(pathToFileURL(join(ENGINE, "src", "tenant.js")).href);
const { ROSTER_SQL, resolveReadOnly } = await imo(pathToFileURL(join(ENGINE, "src", "core.js")).href);
const { installReqMemo: installMemo, clearReqMemo } = await imo(pathToFileURL(join(ENGINE, "src", "reqmemo.js")).href);
// a request's env carries the memo AND its org slot, both installed at the worker's entry (src/index.js workerHandler.fetch)
const { installOrgSlot, installAddress, platformEnv } = await import(pathToFileURL(join(ENGINE, "src", "data.js")).href);
const installReqMemo = (e) => installOrgSlot(installMemo(e));
// a page under org 1's address before a sign-in (sprint 7, 7.4b: the root before a sign-in is no org's, and names no owner)
const atOrg1 = (DB) => { const e = installReqMemo({ DB }); installAddress(e, { org: 1, slug: "org-1" }); return e; };
const { AIM_SQL, GOAL_TREE_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "goals.js")).href);
const { DECISION_ROWS_SQL, OPEN_QUESTION_ROWS_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "decisions.js")).href);
const { PROJECT_NAME_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
const ST = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "stale.js")).href);   // sprint 3 (B4): stale proof by change
// seedTree(db, project, tree) — a goal tree filed as preview then file files it (k_goals, by the seeded owner); tree null clears
function seedTree(db, project, tree) {
  db.prepare("DELETE FROM k_goals WHERE project = ?").run(project);
  const G = db.prepare("INSERT INTO k_goals (project,id,parent,title,dimensions,weight,target,status,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const n of tree || []) G.run(project, n.id, n.parent ?? null, n.title, JSON.stringify(n.dimensions || []), n.weight ?? null, n.target ?? null, n.status ?? null, "p-owner", "2026-09-01T00:00:00Z", "p-owner", "2026-09-01T00:00:00Z");
}

const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M037 = readFileSync(join(ENGINE, "migrate-037.sql"), "utf8");
const M038 = readFileSync(join(ENGINE, "migrate-038.sql"), "utf8");
const NEW_INDEXES = [...M037.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);

let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const RO_SUFFIX = ":agent-r-read-only:v1";   // src/core.js READ_ONLY_SUFFIX

// ---- a seeded DB -------------------------------------------------------------------------------------------------
function seeded({ pre037 = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(BOOT);
  db.exec(M037);   // a replay on top of boot.sql: must be a no-op, never an error
  // the LIVE path: a tenant on the pre-037 schema, then migrate-037.sql applied (tools/migrate.sh). The indexes the
  // checks see are migrate-037's own text, never boot.sql's copy of it.
  for (const i of NEW_INDEXES) db.exec(`DROP INDEX ${i}`);
  if (!pre037) db.exec(M037);
  const at = (n) => new Date(Date.UTC(2026, 8, 1) + n * 60000).toISOString();
  // sprint 7's review (A1): the sign-in's SEATS_OF_SQL joins org (each seat's org name and path name), so the org row must
  // exist; named as the product so every page reads as before this row existed (the M walk pins data-worker="sharingu")
  db.prepare("INSERT INTO org (id, name, slug, created_at, updated_at) VALUES (1, 'sharingu', 'org', ?, ?)").run(at(0), at(0));
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)");
  P.run("p-owner", "Owner", "owner@org.test", "owner", sha("owner-key"), 1, at(0));
  for (let i = 0; i < 60; i++) P.run(`p-${i}`, `Person ${i}`, i % 5 === 0 ? `e${i}@example.com` : `p${i}@org.test`, i % 3 ? "product" : "design", sha(`key-${i}`), i % 10 === 9 ? 0 : 1, at(i + 1));
  const ids = ["p-owner", ...Array.from({ length: 60 }, (_, i) => `p-${i}`)];
  const T = db.prepare("INSERT INTO tokens (token_hash,person_id,device,created_at,expires_at,revoked,org) VALUES (?,?,?,?,?,?,1)");
  for (let i = 0; i < 1200; i++) T.run(sha(`tok-${i}`), ids[i % ids.length], `dev-${i}`, at(i), at(i + 99999), i % 4 === 0 ? 0 : 1);
  const L = db.prepare("INSERT INTO loops (id,person_id,title,status,opened_at,ref,org) VALUES (?,?,?,?,?,?,1)");
  for (let i = 0; i < 1500; i++) L.run(`l-${i}`, ids[i % ids.length], `loop ${i}`, i % 10 === 0 ? "open" : "closed", at(i), i % 3 ? `ref/${i}` : null);
  const X = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,decision,status,eval,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,1)");
  const kinds = ["answer", "critique", "proposal", "insight", "pr"];
  for (let i = 0; i < 800; i++) X.run(`T-${i}`, ids[i % ids.length], "code", kinds[i % 5], i % 17 === 0 ? "[EVAL PROBE] x" : `work ${i}`, i % 2 ? "auto" : "owner", i % 3 ? "approve" : null, "received", i % 4 === 0 ? 1 : 0, at(i));
  const A = db.prepare("INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)");
  for (let i = 0; i < 400; i++) A.run(`aa-${i}`, `T-${i}`, "approve", i % 7 ? "p-owner" : ids[i % ids.length], at(i));
  const E = db.prepare("INSERT INTO events (id,person_id,kind,payload_json,created_at,org) VALUES (?,?,?,?,?,1)");
  const ek = ["session_open", "fragment", "file", "ruling", "drift", "correction", "exit", "unknown"];
  for (let i = 0; i < 4000; i++) {
    const pl = i % 5 === 0 ? { eval: 1, what: "eval noise" } : i % 11 === 0 ? { mind: 1 } : i % 13 === 0 ? { what: "[eval probe] leak" } : { what: `thing ${i}` };
    E.run(`e-${i}`, ids[i % ids.length], ek[i % ek.length], JSON.stringify(pl), at(i));
  }
  return db;
}
const plan = (db, sql, args = []) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...args).map((r) => r.detail).join(" | ");
const bareScan = (p, alias) => new RegExp(`SCAN ${alias}(?! USING)\\b`).test(p);

// The assertions both schemas face (B runs them on pre-037 and expects each to fail).
function planChecks(db, { audit = AUDIT_BASE_CLAUSES } = {}) {
  const r = {};
  const own = plan(db, OWNER_SQL);
  r.owner = [/idx_people_owner \(role=\? AND active=\?\)/.test(own) && !/TEMP B-TREE/.test(own), own];
  const au = plan(db, auditEventsSql(audit), [80]);
  r.audit = [/SCAN e USING INDEX idx_events_audit/.test(au) && !/TEMP B-TREE/.test(au), au];
  const auP = plan(db, auditEventsSql([...audit, "lower(p.name) = ?"]), ["owner", 80]);
  r.auditPerson = [/SCAN e USING INDEX idx_events_audit/.test(auP) && !/TEMP B-TREE/.test(auP), auP];
  return r;
}

// ---- A · plans on the migrate-037 schema -------------------------------------------------------------------------
const db = seeded();
const after = planChecks(db);
const LABEL = {
  owner: "#7 owner lookup is a one-row read on idx_people_owner",
  audit: "#4 /audit walks the partial idx_events_audit to the LIMIT (no sort)",
  auditPerson: "#4 /audit with ?person= still walks idx_events_audit",
};
for (const [k, [pass, p]] of Object.entries(after)) ok(pass, `${LABEL[k]} — ${p}`);
ok(NEW_INDEXES.length === 5 && /^(\s*(--[^\n]*)?\n)*(\s*CREATE INDEX IF NOT EXISTS [^\n]+\n?)+\s*$/.test(M037.replace(/^--[^\n]*\n/gm, "")),
  `migrate-037 is expand-only: exactly ${NEW_INDEXES.length} CREATE INDEX IF NOT EXISTS and nothing else (${NEW_INDEXES.join(", ")})`);
for (const line of M037.split("\n").filter((l) => l.startsWith("CREATE INDEX"))) {
  ok(BOOT.split("\n").includes(line), `boot.sql carries migrate-037's line verbatim (a fresh tenant gets the same index): ${line.slice(27, 90)}…`);
}

// The pre-change SQL: /audit's original clause order.
// the pre-change /audit clause list, in its original order (the text src/index.js carried before this batch)
const OLD_AUDIT = [AUDIT_BASE_CLAUSES[0], AUDIT_BASE_CLAUSES[1], AUDIT_BASE_CLAUSES[3], AUDIT_BASE_CLAUSES[4], AUDIT_BASE_CLAUSES[5], AUDIT_BASE_CLAUSES[2], ...AUDIT_BASE_CLAUSES.slice(6)];

// ---- B · the instrument: the same checks FAIL on the pre-037 schema + pre-change SQL ------------------------------------------------
const pre = planChecks(seeded({ pre037: true }), { audit: OLD_AUDIT });
for (const [k, [pass, p]] of Object.entries(pre)) ok(!pass, `pre-037 schema + pre-change SQL FAILS the ${k} check (it could fail) — ${p}`);

// ---- C · same rows as before ---------------------------------------------------------------------------------------
ok(OLD_AUDIT.length === AUDIT_BASE_CLAUSES.length && new Set(OLD_AUDIT).size === AUDIT_BASE_CLAUSES.length, "the /audit clause set is the same nine clauses, reordered only");
const auNew = db.prepare(auditEventsSql(AUDIT_BASE_CLAUSES)).all(80);
const auOld = seeded({ pre037: true }).prepare(auditEventsSql(OLD_AUDIT)).all(80);
ok(auNew.length === 80 && JSON.stringify(auNew) === JSON.stringify(auOld), `#4 /audit: the same 80 rows, same order, with the partial index as with the pre-037 schema and old clause order`);
ok(!auNew.some((r) => /eval|"mind"/i.test(r.payload_json || "") || ["session_open", "exit", "fragment", "file"].includes(r.kind)), "#4 /audit: no eval/mind/plumbing row leaks through (the eval-noise invariant)");

// ---- D · one D1 read per request ----------------------------------------------------------------------------------
// counting(sqlite, { versions }) — the D1 binding every handler section runs on, counting each SQL string's calls. The
// version reads (the shell's head on every signed-in page, the Versions list) are section J's to count: left out of the
// other sections' sums unless `versions` is set.
let VERSION_READS = new Set();
// batchOf(sqlite) -> D1's batch() for the hand-made mocks (8.2f: a plain filing lands its row and its month's tally in ONE batch,
// src/core.js): one transaction, each statement run through its own mock wrapper (so the mock logs and counts it), each result
// { results, meta: { changes } } (changes by total_changes(), so a statement that wrote nothing reads 0); a failure rolls back
const batchOf = (sqlite) => async (stmts) => {
  const total = () => Number(sqlite.prepare("SELECT total_changes() AS n").get().n);
  sqlite.exec("BEGIN");
  try {
    const out = [];
    for (const st of stmts) { const t0 = total(); const r = await st.all(); out.push({ results: (r && r.results) || [], meta: { changes: total() - t0 } }); }
    sqlite.exec("COMMIT");
    return out;
  } catch (e) { try { sqlite.exec("ROLLBACK"); } catch { /* already rolled back */ } throw e; }
};
function counting(sqlite, { versions = false } = {}) {
  const calls = new Map();
  let failNext = false;
  const DB = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const hit = () => { if (versions || !VERSION_READS.has(sql)) calls.set(sql, (calls.get(sql) || 0) + 1); if (failNext) { failNext = false; throw new Error("D1_ERROR: boom"); } };
      const wrap = (a) => ({ first: async () => { hit(); return stmt.get(...a) ?? null; }, all: async () => { hit(); return { results: stmt.all(...a) }; }, run: async () => { hit(); return { meta: { changes: stmt.run(...a).changes } }; } });
      return { ...wrap([]), bind: (...a) => wrap(a) };
    },
  };
  return { DB, n: (sql) => calls.get(sql) || 0, failOnce: () => { failNext = true; } };
}
const ro = (id) => sha(sqlite1.prepare("SELECT key_hash FROM people WHERE id=?").get(id).key_hash + RO_SUFFIX);
const sqlite1 = seeded();
{
  const c = counting(sqlite1);
  const root = installReqMemo({ DB: c.DB });
  ok((await resolveOwner(root)) === null && c.n(OWNER_SQL) === 0, "resolveOwner at the root before a sign-in (no org): no owner named, no D1 read (7.4b: never org 1's by default)");
  const env = atOrg1(c.DB);
  const o = await Promise.all([resolveOwner(env), resolveOwner(env), resolveOwner({ ...env, BRAIN: {} })]);
  await resolveOwner(env);
  ok(c.n(OWNER_SQL) === 1 && o.every((x) => x && x.name === "Owner"), `resolveOwner: 4 calls in one request (one via the seam's {...env}) = ${c.n(OWNER_SQL)} D1 read`);
  o[0].name = "mutated"; ok((await resolveOwner(env)).name === "Owner", "resolveOwner: a caller mutating its result cannot change another caller's");
  const t = ro("p-3");
  const r = await Promise.all([resolveReadOnly(t, env), resolveReadOnly(t, env), resolveReadOnly(ro("p-4"), { ...env })]);
  ok(c.n(ROSTER_SQL) === 1 && r[0]?.id === "p-3" && r[0].readOnly === true && r[2]?.id === "p-4" && !("key_hash" in r[0]), `resolveReadOnly: 3 calls in one request = ${c.n(ROSTER_SQL)} roster read, right person, key_hash never returned`);
  const c2 = counting(sqlite1);
  const e2 = installReqMemo({ DB: c2.DB });
  for (const junk of ["", "not-a-token", "A".repeat(64), "key-3", sha("x").slice(0, 63)]) ok((await resolveReadOnly(junk, e2)) === null, `resolveReadOnly: malformed token ${JSON.stringify(junk.slice(0, 12))}… refused`);
  ok(c2.n(ROSTER_SQL) === 0, `resolveReadOnly: malformed tokens cost ${c2.n(ROSTER_SQL)} D1 reads`);
  ok((await resolveReadOnly(sha("well-formed-but-nobody"), e2)) === null && c2.n(ROSTER_SQL) === 1, "resolveReadOnly: a well-formed unknown token still scans (once) and is refused");
  // a fresh request reads again
  await resolveOwner(atOrg1(c.DB));
  ok(c.n(OWNER_SQL) === 2, `a NEW request's env reads the owner again (${c.n(OWNER_SQL)} reads total)`);
  // no memo slot (the cron, any caller that never installed one): every call reads
  const bare = platformEnv({ DB: c.DB }, 1);
  await resolveOwner(bare); await resolveOwner(bare);
  ok(c.n(OWNER_SQL) === 4, "no memo installed: every call reads D1 (nothing module-global)");
  // clearReqMemo within the request re-reads
  const e3 = atOrg1(c.DB);
  await resolveOwner(e3); sqlite1.prepare("UPDATE people SET title='Founder' WHERE id='p-owner'").run(); clearReqMemo(e3);
  ok((await resolveOwner(e3)).roleLabel === "Founder" && c.n(OWNER_SQL) === 6, "clearReqMemo: after a people write in the same request, the next read sees it");
  // a failed read is not memoized
  const c4 = counting(sqlite1); const e4 = installReqMemo({ DB: c4.DB });
  c4.failOnce();
  let threw = false; try { await resolveReadOnly(t, e4); } catch { threw = true; }
  ok(threw && (await resolveReadOnly(t, e4))?.id === "p-3" && c4.n(ROSTER_SQL) === 2, "a failed roster read is not memoized: this caller sees the error, the next one retries");
  // deactivated between two requests: refused on the next
  const e5 = installReqMemo({ DB: c.DB });
  ok((await resolveReadOnly(t, e5))?.id === "p-3", "p-3's read-only token works on request 1");
  sqlite1.prepare("UPDATE people SET active=0 WHERE id='p-3'").run();
  ok((await resolveReadOnly(t, installReqMemo({ DB: c.DB }))) === null, "p-3 deactivated: the SAME token is refused on request 2 (no cross-request roster cache)");
}

// ---- E · the real handler -----------------------------------------------------------------------------------------
{
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const sq = seeded();
  // two active projects: the org has workspaces, so the workspace seam resolves the reader BEFORE the route does
  // (src/index.js orgHasWorkspaces). That is the double roster read the request memo removes.
  sq.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-25T00:00:00Z'),('beta','Beta',1,'2026-09-25T00:00:00Z')");
  const c = counting(sq);
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const env = { DB: c.DB, BRAIN };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const home = async (h, q = "") => handler.fetch(new Request(`https://org.test/home${q}`, { headers: { accept: "text/html", ...h } }), env, ctx);
  const r1 = await home({ authorization: "Bearer owner-key" });
  const o1 = c.n(OWNER_SQL);
  const r2 = await home({ authorization: "Bearer owner-key" });
  ok(r1.status === 200 && r2.status === 200 && o1 <= 1 && c.n(OWNER_SQL) - o1 <= 1, `GET /home (real handler): owner lookup ${o1} then ${c.n(OWNER_SQL) - o1} per request (at most one each)`);
  ok(!("Symbol(sharingu.reqmemo)" in env) && Object.getOwnPropertySymbols(env).length === 0, "the memo slot never lands on the worker's shared env");
  const tok = sha(sq.prepare("SELECT key_hash FROM people WHERE id='p-6'").get().key_hash + RO_SUFFIX);
  const before = c.n(ROSTER_SQL);
  const r3 = await home({ authorization: "Bearer " + tok });   // G2 M2: the read-only credential rides a Bearer header (a key in an address signs no one in)
  ok(r3.status === 200 && c.n(ROSTER_SQL) - before <= 1, `GET /home with the read-only credential as a Bearer (real handler): ${r3.status}, roster scan ${c.n(ROSTER_SQL) - before} time(s) in the request`);
}

// ---- F · UI-B2: the Decisions overlay -----------------------------------------------------------------------------
{
  const sq = seeded();
  // every seeded transmission names a question or a screen, the way core.js indexes gapRefs at filing time
  const R = sq.prepare("INSERT INTO transmission_refs (tid, ref) VALUES (?, ?)");
  for (let i = 0; i < 800; i++) R.run(`T-${i}`, i % 3 ? `q/Q${String(i % 50).padStart(7, "0")}` : `screen:${i % 40}`);
  const liveCheck = (sql, args = []) => { const p = plan(sq, sql, args); return [/SEARCH r USING (?:COVERING )?INDEX idx_transmission_refs_ref/.test(p) && !bareScan(p, "t") && !/SCAN transmission\b/.test(p) && !/gaprefs\s+LIKE/i.test(sql), p]; };
  for (const [label, sql, args] of [["GET /decisions (suite rows out)", DECISIONS_LIVE_SQL(false), ["alpha"]], ["GET /decisions?eval=1", DECISIONS_LIVE_SQL(true), ["alpha"]],
    ["GET /question/:qid", QUESTION_LIVE_SQL(false), ["q/Q0000001", "alpha"]], ["GET /question/:qid?eval=1", QUESTION_LIVE_SQL(true), ["q/Q0000001", "alpha"]]]) {
    const [pass, p] = liveCheck(sql, args);
    ok(pass, `${label}: the overlay SEARCHes idx_transmission_refs_ref and never scans transmission — ${p}`);
  }
  // the instrument: the read written the old way (a gaprefs LIKE over transmission) must FAIL the same check
  const likeForm = "SELECT t.id, t.kind, t.what, t.created_at FROM transmission t WHERE t.gaprefs LIKE '%q/%' AND t.kind IN ('answer','round','counter','critique') AND t.decision IS NULL AND t.eval = 0 ORDER BY t.created_at";
  const likeOne = "SELECT t.id FROM transmission t WHERE (',' || t.gaprefs || ',') LIKE ? AND t.decision IS NULL";
  ok(!liveCheck(likeForm)[0] && !liveCheck(likeOne, ["%,q/Q0000001,%"])[0], `the instrument: a gaprefs LIKE form of the overlay FAILS the check — ${liveCheck(likeForm)[1]}`);
  ok(![DECISIONS_LIVE_SQL(false), DECISIONS_LIVE_SQL(true), QUESTION_LIVE_SQL(false), QUESTION_LIVE_SQL(true)].some((x) => /gaprefs\s+LIKE|\bLIKE\b/i.test(x)), "no live overlay string carries a LIKE");
  // the rows the overlay returns: the project's own, undecided only, the four kinds only, suite rows only when asked. ONE
  // active project (alpha, a single-project org), so the handler below reads alpha with no scope; beta is archived.
  sq.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',0,'2026-09-01T00:00:00Z')");
  sq.exec("INSERT INTO transmission (id,submitter,lane,kind,what,route,decision,status,eval,created_at,project,org) VALUES ('T-a','p-1','leader','answer','x','auto',NULL,'received',0,'2026-09-27','alpha',1),('T-b','p-1','leader','answer','x','auto','approve','received',0,'2026-09-27','alpha',1),('T-c','p-1','leader','note','x','auto',NULL,'received',0,'2026-09-27','alpha',1),('T-d','p-1','leader','counter','x','owner',NULL,'received',1,'2026-09-27','alpha',1),('T-g','p-1','leader','answer','x','auto',NULL,'received',0,'2026-09-27','beta',1)");
  sq.exec("INSERT INTO transmission_refs (tid, ref) VALUES ('T-a','q/QZ'),('T-b','q/QZ'),('T-c','q/QZ'),('T-d','q/QZ'),('T-g','q/QZ')");
  const ids = (sql, a) => sq.prepare(sql).all(...a).filter((r) => r.ref === "q/QZ").map((r) => r.id).sort().join(",");
  sq.exec("INSERT INTO transmission (id,submitter,lane,kind,what,route,decision,status,eval,created_at,project,org) VALUES ('T-e','p-1','leader','answer','x','auto','reject','closed',0,'2026-09-27','alpha',1),('T-f','p-1','leader','counter','x','owner','approve','closed',0,'2026-09-27','alpha',1)");
  sq.exec("INSERT INTO transmission_refs (tid, ref) VALUES ('T-e','q/QZ'),('T-f','q/QZ')");
  ok(ids(DECISIONS_LIVE_SQL(false), ["alpha"]) === "T-a,T-b" && ids(DECISIONS_LIVE_SQL(true), ["alpha"]) === "T-a,T-b,T-d" && ids(QUESTION_LIVE_SQL(false), ["q/QZ", "alpha"]) === "T-a,T-b",
    `the overlay rows: undecided and of the four kinds, plus (UI-B3) the answer decided approve, the ruling (${ids(DECISIONS_LIVE_SQL(false), ["alpha"])}); never a rejected answer or a decided counter; the suite's counter only with eval (${ids(DECISIONS_LIVE_SQL(true), ["alpha"])})`);
  ok(ids(DECISIONS_LIVE_SQL(false), ["beta"]) === "T-g" && ids(QUESTION_LIVE_SQL(false), ["q/QZ", "beta"]) === "T-g",
    "the overlay is the project's own: beta's answer on the same qid is beta's alone, never alpha's (and alpha's never beta's)");

  // through the real handler: one statement beyond the same request with no pack published
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const fx = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "decisions-pack.mjs")).href);
  const c = counting(sq);
  let extraRead = false;   // the injection: a handler that reads the overlay twice
  const DB = { prepare(sql) { const st = c.DB.prepare(sql); if (!extraRead || !/transmission_refs r CROSS JOIN/.test(sql)) return st;
    const again = () => c.DB.prepare(sql);
    const w = (a) => ({ ...st, all: async () => { await (a ? again().bind(...a) : again()).all(); return (a ? st.bind(...a) : st).all(); } });
    return { ...w(null), bind: (...a) => w(a) }; } };
  // `pack` is now "questions filed": alpha's questions (the decisions fixture) are in k_questions, or none are
  const filed = (on) => { sq.exec("DELETE FROM k_options; DELETE FROM k_questions"); if (on) fx.seedQuestions(sq, "alpha", fx.ROWS, "p-owner"); };
  const brainWith = () => ({ get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} });
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const sqlCalls = () => { let n = 0; for (const sql of seen) n += c.n(sql); return n; };
  const seen = new Set();
  const DBseen = { prepare(sql) { seen.add(sql); return DB.prepare(sql); } };
  const hit = async (path, pack, accept) => {
    filed(pack);
    const before = sqlCalls();
    const before2 = new Map([...seen].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, authorization: "Bearer owner-key" } }), { DB: DBseen, BRAIN: brainWith(pack) }, ctx);
    const ran = [...seen].filter((q) => c.n(q) > (before2.get(q) || 0));
    return { status: r.status, n: sqlCalls() - before, ran };
  };
  // re-pinned by name (U-MCP-tail-a, QE6B9CEBA Fork 1 (1), measured): an owner's PAGE also draws the badge, whose blockers are
  // the open questions the owner owes (src/core.js ownerOwedOnce). Sprint 2 (the live budget): the badge reuses the Decisions
  // overlay when the page read it (reqMemoPeek), else reads only the answers on the open questions (OWNER_OWED_LIVE_SQL). So
  // /decisions as a page still runs exactly one more (the page and the badge share its overlay), and the QuestionCard page
  // runs two (its own one-question overlay + the badge's answers); JSON draws no badge and runs one. The questions reads
  // themselves (the list, one question, the open ones) run on both sides, filed or not.
  for (const accept of ["application/json", "text/html"]) {
    for (const [path, sql] of [["/decisions", DECISIONS_LIVE_SQL(false)], [`/question/${fx.OPEN_QID}`, QUESTION_LIVE_SQL(false)]]) {
      const want = accept === "text/html" && sql !== DECISIONS_LIVE_SQL(false) ? [sql, OWNER_OWED_LIVE_SQL(false)] : [sql];
      await hit(path, false, accept); await hit(path, true, accept);   // warm the isolate's own caches (the workspace count memo)
      const base = await hit(path, false, accept), withPack = await hit(path, true, accept);
      const extra = withPack.ran.filter((q) => !base.ran.includes(q));
      ok(withPack.status === 200 && withPack.n - base.n === want.length && extra.length === want.length && want.every((q) => extra.includes(q)),
        `GET ${path} (${accept.split("/")[1]}, real handler): ${withPack.n} D1 statement(s) with questions filed, ${base.n} with none (${base.status}); exactly ${want.length} more — ${want.length === 1 ? "the overlay" : "its overlay + the owner badge's blockers (the open questions' answers)"}`);
      extraRead = true;
      const twice = await hit(path, true, accept);
      extraRead = false;
      ok(twice.n - base.n === 2 * want.length, `the instrument: a handler reading each overlay twice counts ${twice.n - base.n} beyond the request with no question filed, so the check above would go red`);
    }
  }
}

// ---- G · UI-B3: Home, one composed read --------------------------------------------------------------------------
{
  // G1 · plans: every Home statement on boot.sql + migrate-038 (the live path: a pre-038 tenant, then the migration)
  const M038_INDEXES = [...M038.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  ok(M038_INDEXES.length === 1 && M038_INDEXES[0] === "idx_transmission_parent" && /^(\s*(--[^\n]*)?\n)*\s*CREATE INDEX IF NOT EXISTS idx_transmission_parent ON transmission\(parent\);\s*$/.test(M038.replace(/^--[^\n]*\n/gm, "")),
    "migrate-038 is expand-only: exactly one CREATE INDEX IF NOT EXISTS (idx_transmission_parent) and nothing else");
  for (const line of M038.split("\n").filter((l) => l.startsWith("CREATE INDEX"))) ok(BOOT.split("\n").includes(line), `boot.sql carries migrate-038's line verbatim: ${line}`);
  const homeDb = ({ pre038 = false, drop = [] } = {}) => {
    const d = seeded();
    for (const i of M038_INDEXES) d.exec(`DROP INDEX ${i}`);
    if (!pre038) d.exec(M038);
    for (const i of drop) d.exec(`DROP INDEX ${i}`);
    d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z')");
    d.exec("UPDATE transmission SET project = CASE WHEN rowid % 2 = 0 THEN 'alpha' ELSE 'beta' END, goal_ref = CASE WHEN rowid % 3 = 0 THEN 'g1' ELSE NULL END, parent = CASE WHEN rowid % 5 = 0 THEN 'T-' || (rowid - 1) ELSE NULL END");
    const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
    for (let i = 0; i < 40; i++) S.run(`p-${i}`, i % 2 ? "alpha" : "beta", "member", "2026-09-01T00:00:00Z");
    return d;
  };
  const noScanTx = (p) => !bareScan(p, "transmission") && !bareScan(p, "t") && !bareScan(p, "c") && !/SCAN transmission\b/.test(p);
  const homePlans = (d) => {
    const r = {};
    for (const ev of [false, true]) {
      const k = ev ? " ?eval=1" : "";
      // sprint 2: the all-time counts off the tallies (their primary keys); sprint 3 L2: the week is THE WEEK's (WEEK_SQL, below),
      // so S1 walks no filing at all
      const s1 = plan(d, HOME_TX_AGG_SQL(true, ev), ["alpha"]);
      // D2b: the contributions and their kinds ride the kinds tally (transmission_open, the old "open filings", is no longer read)
      r["S1" + k] = [/SEARCH transmission_kinds USING (?:COVERING )?INDEX sqlite_autoindex_transmission_kinds_1 \(project=\?/.test(s1) && !/transmission_open/.test(s1)
        && !/created_at>\?|decided_at>\?/.test(s1.replace(/SEARCH transmission USING (?:COVERING )?INDEX idx_transmission_knowledge[^|]*/g, "")) && noScanTx(s1), s1];
      // sprint 3 L2, THE WEEK: what was filed in it (idx_transmission_project) and what was filed before it and decided in it
      // (idx_transmission_decided), two ranges, one people probe per group
      const sw = plan(d, WEEK_SQL(true, ev), ["alpha", "2026-09-28", "2026-09-20", 1, "p-owner", ""]);
      // sprint 3 L3 (migrate-061): arm A walks idx_transmission_contrib (the contributions alone, never a grade or a knowledge write)
      r["week" + k] = [/SEARCH t USING INDEX idx_transmission_contrib \(project=\? AND created_at>\?\)/.test(sw) && !/idx_transmission_project/.test(sw) && /SEARCH t USING INDEX idx_transmission_decided \(project=\? AND decided_at>\?\)/.test(sw)
        && /SEARCH p USING INDEX sqlite_autoindex_people_1 \(id=\?\)/.test(sw) && noScanTx(sw), sw];
      const s2 = plan(d, HOME_OWNER_ROWS_SQL(true, ev), ["alpha"]);
      r["S2" + k] = [/SEARCH t USING (?:COVERING )?INDEX idx_transmission_(?:queue \(route=\?|route \(route=\?|project \(project=\?)/.test(s2) && /SEARCH c USING INDEX idx_transmission_parent \(parent=\?\)/.test(s2) && noScanTx(s2), s2];
      const s4 = plan(d, HOME_GOALS_MOVED_SQL(true, ev), ["alpha", "2026-09-01", "2026-09-01"]);
      // sprint 2: the month's goal-naming filings only; sprint 3 (B3): each goal's title one probe of k_goals' primary key
      r["S4" + k] = [/SEARCH t USING INDEX idx_transmission_goal_month \(project=\? AND created_at>\?\)/.test(s4) && /SEARCH g USING INDEX sqlite_autoindex_k_goals_1 \(project=\? AND id=\?\)/.test(s4) && noScanTx(s4), s4];
    }
    // sprint 2: the ACTIVE people (idx_people_active), one seat probe each on project_seats' primary key
    const s5 = plan(d, HOME_SEATS_SQL(true), ["alpha"]);
    r.S5 = [/SEARCH p USING (?:COVERING )?INDEX idx_people_active \(active=\?\)/.test(s5) && /SEARCH s USING (?:COVERING )?INDEX sqlite_autoindex_project_seats_1 \(person_id=\? AND project_key=\?\)/.test(s5) && !/SCAN (?:s|p|x|project_seats|people)\b(?! USING)/.test(s5) && noScanTx(s5), s5];
    const f5 = plan(d, HOME_FIRST5_SQL, ["p-3", "p-3", "p-3"]);
    r.first5 = [/idx_transmission_submitter/.test(f5) && /idx_events_person/.test(f5) && /idx_tokens_person/.test(f5) && noScanTx(f5) && !/SCAN (?:tokens|events)\b(?! USING)/.test(f5), f5];
    return r;
  };
  for (const [k, [pass, p]] of Object.entries(homePlans(homeDb()))) ok(pass, `Home ${k}: SEARCHes its index, never SCANs transmission — ${p}`);
  // G2 · the instrument: S2 on the pre-038 schema, and S1/S4/S5 each with its own index dropped, FAIL the same checks
  const pre = homePlans(homeDb({ pre038: true }));
  ok(!pre.S2[0] && !pre["S2 ?eval=1"][0], `pre-038 schema FAILS the S2 check (the counter count scans without idx_transmission_parent) — ${pre.S2[1]}`);
  // sprint 3 L3: THE WEEK's arm A names idx_transmission_contrib (INDEXED BY: without it the statement is refused, section L3),
  // so the instrument drops arm B's index
  const noProj = homePlans(homeDb({ drop: ["idx_transmission_decided", "idx_transmission_goal_month"] }));
  ok(!noProj.week[0] && !noProj.S4[0], `with idx_transmission_decided and idx_transmission_goal_month dropped, THE WEEK and S4 FAIL their checks — ${noProj.week[1]} || ${noProj.S4[1]}`);
  const noSeats = homePlans(homeDb({ drop: ["idx_people_active"] }));
  ok(!noSeats.S5[0], `with idx_people_active dropped, S5 FAILS its check — ${noSeats.S5[1]}`);
  // G3 · S4's rows: a plain aggregation of the seeded rows, and the goal filter is load-bearing
  const d = homeDb();
  // sprint 3 (B3): the goals moved, per goal, person and lane (never a per-person ranking: src/home.js keeps no per-person count)
  const gmSql = HOME_GOALS_MOVED_SQL(true, false), month = "2026-09-01";
  // sprint 3 (happenedAt, migrate-051): "this month" is when the work happened. Some of the month's rows say their work happened
  // last month (left out), some say the month's first day as a bare date (kept: the date-only edge), each never later than
  // its created_at, as the door guarantees
  d.exec(`UPDATE transmission SET happened_at = CASE WHEN rowid % 4 = 0 THEN '2026-08-15' ELSE '2026-09-01' END WHERE created_at >= '${month}' AND rowid % 4 IN (0, 1)`);
  const sum = (rows) => rows.reduce((a, r) => a + r.n, 0);
  const got = d.prepare(gmSql).all("alpha", month, month).map((r) => `${r.goal_ref}/${r.submitter}/${r.lane}/${r.n}`).sort();
  const want = new Map();
  for (const r of d.prepare("SELECT submitter, lane, route, decision, goal_ref, eval, project, created_at, happened_at FROM transmission").all())
    if (r.project === "alpha" && r.created_at >= month && (r.happened_at || r.created_at) >= month && (r.route === "auto" || r.decision === "approve") && r.goal_ref != null && r.eval === 0)
      want.set(`${r.goal_ref}/${r.submitter}/${r.lane}`, (want.get(`${r.goal_ref}/${r.submitter}/${r.lane}`) || 0) + 1);
  const wantRows = [...want.entries()].map(([k, n]) => `${k}/${n}`).sort();
  const loose = sum(d.prepare(gmSql.replace(" AND t.goal_ref IS NOT NULL", "")).all("alpha", month, month));
  const filedOnly = sum(d.prepare(gmSql.replace(" AND COALESCE(t.happened_at, t.created_at) >= ?", "")).all("alpha", month));
  const n4 = got.reduce((a, x) => a + Number(x.split("/")[3]), 0);
  ok(got.length > 3 && JSON.stringify(got) === JSON.stringify(wantRows) && loose > n4 && filedOnly > n4,
    `Home S4: ${got.length} goal/person/lane rows, equal to a plain aggregation of the seeded rows (goal-moving: landed and aimed, this project, work that happened this month, no suite rows); without the goal filter it counts ${loose}, and by filing time alone ${filedOnly} (work that happened last month), so both filters are load-bearing`);

  // G4 · the real handler: /home and /home/summary run the same Home statements, at most six, for the owner and a seat
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const fx = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "decisions-pack.mjs")).href);
  const hq = homeDb();
  const c = counting(hq);
  let extraRead = null;   // the injection: a handler that runs one Home statement a second time
  const DB = { prepare(sql) { const st = c.DB.prepare(sql); if (sql !== extraRead) return st;
    const w = (a) => { const one = a ? st.bind(...a) : st; const again = () => (a ? c.DB.prepare(sql).bind(...a) : c.DB.prepare(sql));
      return { ...one, all: async () => { await again().all(); return one.all(); }, first: async () => { await again().first(); return one.first(); } }; };
    return { ...w(null), bind: (...a) => w(a) }; } };
  const seen = new Set();
  const DBseen = { prepare(sql) { seen.add(sql); return DB.prepare(sql); } };
  // `pack` is now "questions filed": alpha's questions (the decisions fixture) are in k_questions, or none are
  const filed = (on) => { hq.exec("DELETE FROM k_options; DELETE FROM k_questions"); if (on) fx.seedQuestions(hq, "alpha", fx.ROWS, "p-owner"); };
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const brainWith = () => ({ get: async () => null,
    head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} });
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const hit = async (path, pack, accept, key) => {
    filed(pack);
    const before = new Map([...seen].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, authorization: `Bearer ${key}` } }), { DB: DBseen, BRAIN: brainWith(pack) }, ctx);
    const body = await r.text();
    let n = 0; const ran = [];
    for (const q of seen) { const k = c.n(q) - (before.get(q) || 0); if (k > 0) { n += k; ran.push(q); } }
    return { status: r.status, n, ran, body };
  };
  // sprint 2: Home's decide rows read the overlay of the OPEN questions alone (OPEN_LIVE_SQL), and the owner's badge reuses it
  // sprint 3 (B3): and the checklist's meter (CHECKLIST_SQL, one statement); a seat's owed set (the checklist's rulings-owed:
  // the owner's blockers, which the owner's badge already reads) is one more overlay read, the open questions' answers only
  // sprint 3 L2: and THE WEEK (WEEK_SQL: the week's needs more, landed and the people's days; S1 no longer walks it)
  const HOME_OWNER_SET = [HOME_TX_AGG_SQL(true, false), HOME_OWNER_ROWS_SQL(true, false), OPEN_LIVE_SQL(false), HOME_GOALS_MOVED_SQL(true, false), HOME_SEATS_SQL(true), AIM_SQL, CHECKLIST_SQL, WEEK_SQL(true, false)];
  const HOME_SEAT_SET = [HOME_TX_AGG_SQL(true, false), HOME_FIRST5_SQL, OPEN_LIVE_SQL(false), HOME_GOALS_MOVED_SQL(true, false), HOME_SEATS_SQL(true), AIM_SQL, CHECKLIST_SQL, WEEK_SQL(true, false)];
  // Home also reads the open questions (OPEN_QUESTION_ROWS_SQL): the owner page's baseline already ran it for the badge,
  // the JSON and a seat's page did not, so it may or may not be among "own"
  const sameSet = (a, b) => { const g = a.filter((x) => x !== OPEN_QUESTION_ROWS_SQL); return g.length === b.length && g.every((x) => b.includes(x)); };
  for (const [who, key, want] of [["the owner", "owner-key", HOME_OWNER_SET], ["a seat", "key-3", HOME_SEAT_SET]]) {
    const run = async () => {
      const out = {};
      for (const [door, path, accept, basePath] of [["GET /home", "/home", "text/html", "/decisions"], ["GET /home/summary", "/home/summary", "application/json", "/decisions"]]) {
        await hit(basePath, false, accept, key); await hit(path, true, accept, key);   // warm the isolate's own caches (the workspace count memo)
        const base = await hit(basePath, false, accept, key), home = await hit(path, true, accept, key);
        out[door] = { status: home.status, extra: home.n - base.n, own: home.ran.filter((q) => !base.ran.includes(q)), base };
      }
      return out;
    };
    const out = await run();
    const a = out["GET /home"], b = out["GET /home/summary"];
    ok(a.status === 200 && b.status === 200 && a.extra <= 8 && b.extra <= 8 && sameSet(a.own, want) && sameSet(b.own, want),
      `Home for ${who} (real handler): GET /home runs ${a.extra} and GET /home/summary ${b.extra} D1 statement(s) beyond the baseline (GET /decisions, no pack: ${a.base.n} html / ${b.base.n} json), at most eight, and they are exactly Home's own [${a.own.length === want.length ? "S1 S2 S3 S4 S5, the aim, the meter and the week" : a.own.length + " statements"}]`);
    extraRead = HOME_GOALS_MOVED_SQL(true, false);
    const twice = await run();
    extraRead = null;
    ok(twice["GET /home"].extra === a.extra + 1 && twice["GET /home/summary"].extra === b.extra + 1,
      `the instrument (${who}): a handler reading S4 twice counts ${twice["GET /home"].extra} / ${twice["GET /home/summary"].extra} beyond the baseline, one read more, so the check above would go red`);
  }
}

// ---- H · UI-B4a: the filing page, the row plus one counters statement ---------------------------------------------
{
  // H1 · plans: the exact strings, on boot.sql + migrate-038 (the live path), seeded with parents and counters
  const M038_INDEXES = [...M038.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  const filingDb = ({ pre038 = false } = {}) => {
    const d = seeded();
    for (const i of M038_INDEXES) d.exec(`DROP INDEX ${i}`);
    if (!pre038) d.exec(M038);
    d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z')");
    d.exec("UPDATE transmission SET project = CASE WHEN rowid % 2 = 0 THEN 'alpha' ELSE 'beta' END, parent = CASE WHEN rowid % 5 = 0 THEN 'T-' || (rowid - 1) ELSE NULL END, kind = CASE WHEN rowid % 5 = 0 THEN 'counter' ELSE kind END");
    const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
    for (let i = 0; i < 40; i++) S.run(`p-${i}`, i % 2 ? "alpha" : "beta", "member", "2026-09-01T00:00:00Z");
    return d;
  };
  const noScanTx = (p) => !bareScan(p, "transmission") && !bareScan(p, "t") && !bareScan(p, "c") && !/SCAN transmission\b/.test(p);
  const filingPlans = (d, counters = FILING_COUNTERS_SQL) => {
    const r = {};
    for (const ev of [false, true]) for (const sc of [false, true]) {
      const pl = plan(d, counters(ev, sc), sc ? ["T-9", "p-3", "p-3"] : ["T-9"]);
      r[`counters${ev ? " ?eval=1" : ""}${sc ? " (a seat, scoped)" : " (the owner)"}`] = [/SEARCH c USING INDEX idx_transmission_parent \(parent=\?\)/.test(pl) && noScanTx(pl), pl];
    }
    for (const sc of [false, true]) {
      const pl = plan(d, TX_ONE_SQL(sc), sc ? ["T-9", "p-3", "p-3"] : ["T-9"]);
      r[`the row${sc ? " (a seat, scoped)" : " (the owner)"}`] = [/SEARCH t USING INDEX sqlite_autoindex_transmission_1 \(id=\?\)/.test(pl) && noScanTx(pl), pl];
    }
    return r;
  };
  for (const [k, [pass, p]] of Object.entries(filingPlans(filingDb()))) ok(pass, `the filing page, ${k}: SEARCHes its index, never SCANs transmission — ${p}`);
  // H2 · the instrument: the pre-038 schema, and the counters statement without its unary +, each FAIL the same check
  const pre = filingPlans(filingDb({ pre038: true }));
  ok(!pre["counters (the owner)"][0] && !pre["counters (a seat, scoped)"][0], `pre-038 schema FAILS the counters check (no idx_transmission_parent: it scans) — ${pre["counters (the owner)"][1]}`);
  const noPlus = (ev, sc) => FILING_COUNTERS_SQL(ev, sc).replace("+c.kind", "c.kind").replace("+c.eval", "c.eval");
  const np = filingPlans(filingDb(), noPlus);
  ok(noPlus(false, false) !== FILING_COUNTERS_SQL(false, false) && !np["counters (the owner)"][0], `the counters statement without its unary + FAILS the check (the planner walks another index) — ${np["counters (the owner)"][1]}`);
  // H3 · the rows: standing and ruled counters of ONE parent, the flag is the STANDING_COUNTER definition
  const d = filingDb();
  d.exec("INSERT INTO transmission (id,submitter,lane,kind,what,route,decision,status,eval,project,parent,created_at,org) VALUES ('T-F','p-3','code','pr','the filing','owner',NULL,'routed',0,'alpha',NULL,'2026-09-28',1),('T-F1','p-5','leader','counter','stands','owner',NULL,'routed',0,'alpha','T-F','2026-09-28',1),('T-F2','p-5','leader','counter','ruled','owner','approve','closed',0,'alpha','T-F','2026-09-28',1),('T-F3','p-5','leader','critique','critique stands','owner',NULL,'routed',0,'alpha','T-F','2026-09-28',1),('T-F4','p-5','leader','note','an update, not a counter','auto',NULL,'routed',0,'alpha','T-F','2026-09-28', 1),('T-F5','p-5','leader','counter','a suite counter','owner',NULL,'routed',1,'alpha','T-F','2026-09-28',1),('T-F6','p-4','leader','counter','beta counter','owner',NULL,'routed',0,'beta','T-F','2026-09-28',1)");
  const rows = (ev, sc, who) => d.prepare(FILING_COUNTERS_SQL(ev, sc)).all(...(sc ? ["T-F", who, who] : ["T-F"])).map((r) => `${r.id}:${r.standing}`).join(",");
  ok(rows(false, false) === "T-F1:1,T-F2:0,T-F3:1,T-F6:1" && rows(true, false) === "T-F1:1,T-F2:0,T-F3:1,T-F5:1,T-F6:1" && rows(false, true, "p-3") === "T-F1:1,T-F2:0,T-F3:1",
    `the counters rows: counter and critique by parent, each flagged standing by STANDING_COUNTER (owner ${rows(false, false)}; with suite rows ${rows(true, false)}); a seat on alpha is not shown the beta counter (${rows(false, true, "p-3")})`);

  // H4 · the real handler: GET /contribution/:id (the page) runs the row and the counters, nothing more
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const c = counting(d);
  let extraRead = null;   // the injection: a handler that runs the counters statement a second time
  const DB = { prepare(sql) { const st = c.DB.prepare(sql); if (sql !== extraRead) return st;
    const w = (a) => { const one = a ? st.bind(...a) : st; const again = () => (a ? c.DB.prepare(sql).bind(...a) : c.DB.prepare(sql));
      return { ...one, all: async () => { await again().all(); return one.all(); }, first: async () => { await again().first(); return one.first(); } }; };
    return { ...w(null), bind: (...a) => w(a) }; } };
  const seen = new Set();
  const DBseen = { prepare(sql) { seen.add(sql); return DB.prepare(sql); } };
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const hit = async (path, key) => {
    const before = new Map([...seen].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept: "text/html", authorization: `Bearer ${key}` } }), { DB: DBseen, BRAIN }, ctx);
    const body = await r.text();
    const ran = new Map();
    for (const q of seen) { const k = c.n(q) - (before.get(q) || 0); if (k > 0) ran.set(q, k); }
    return { status: r.status, ran, body };
  };
  // the owner reads every counter on the filing (org-wide: 3 standing, one of them in beta); the seat on alpha, alpha's
  const AUTH_SQL = (q) => q.startsWith("SELECT id, name, email, role, title, capture_mode, lane FROM people WHERE key_hash = ?") || /FROM tokens t JOIN people p ON p\.id = t\.person_id WHERE t\.token_hash = \?/.test(q);
  for (const [who, key, want, heading] of [["the owner", "owner-key", [TX_ONE_SQL(false), FILING_COUNTERS_SQL(false, false)], 'aria-label="3 standing, 1 ruled">3<'], ["a seat (p-3, alpha)", "key-3", [TX_ONE_SQL(true), FILING_COUNTERS_SQL(false, true)], 'aria-label="2 standing, 1 ruled">2<']]) {
    const run = async () => {
      await hit("/decisions", key); await hit("/contribution/T-F", key);   // warm the isolate's own caches
      const base = await hit("/decisions", key), page = await hit("/contribution/T-F", key);
      // every statement the page runs MORE often than the baseline, by count (so a seats or projects read hidden behind
      // the baseline's own copy still counts), less the auth (the /contribution/ prefix gate resolves the reader once
      // more than /decisions does) and the owner lookup, memoized per request (section D)
      const delta = [...page.ran].map(([q, k]) => [q, k - (base.ran.get(q) || 0)]).filter(([, k]) => k > 0);
      const own = delta.filter(([q]) => !AUTH_SQL(q) && q !== OWNER_SQL);
      const auth = delta.filter(([q]) => AUTH_SQL(q)).reduce((a, [, k]) => a + k, 0);
      return { status: page.status, n: own.reduce((a, [, k]) => a + k, 0), own: own.map(([q]) => q), auth, body: page.body, base };
    };
    const out = await run();
    // sprint 3 B4: the page also shows its Impact (src/impact.js impactLines, only when it touches something in the model: this
    // fixture touches nothing, so no walk) and its next action; the Impact region reads only on the reader's scope of the row's
    // project, whose check is the owner's one probe that the project is active (a seat's rides its seats read, memoized)
    const extra = who === "the owner" ? ["SELECT key FROM projects WHERE key = ? AND active = 1 AND org = 1"] : [];
    const n0 = want.length + extra.length;
    ok(out.status === 200 && out.n <= n0 && out.own.length === n0 && out.auth <= 1 && [...want, ...extra].every((q) => out.own.includes(q)) && /data-region="counters"/.test(out.body) && out.body.includes(heading) && /data-region="impact"/.test(out.body),
      `GET /contribution/:id as ${who} (the page, real handler): ${out.n} D1 statement(s) beyond the baseline (GET /decisions, no pack: ${[...out.base.ran.values()].reduce((a, k) => a + k, 0)}) and the memoized owner lookup (and ${out.auth} more auth read for the prefix gate), at most ${n0}, and they are exactly the row and the counters (${heading.replace(/^aria-label="([^"]*)".*$/, "$1")})${extra.length ? " and the project's active probe (the Impact region's scope)" : ""}`);
    extraRead = want[1];
    const twice = await run();
    extraRead = null;
    ok(twice.n === n0 + 1, `the instrument (${who}): a handler reading the counters twice counts ${twice.n} beyond the baseline, one more read, so the check above would go red`);
  }
  // a row the seat may not see: the same 404 a missing id gets, and no counters statement runs for it
  const other = await hit("/contribution/T-F", "key-4"), none = await hit("/contribution/T-19700101-999", "key-4");
  ok(other.status === 404 && none.status === 404 && JSON.parse(other.body).error === "not_found" && JSON.parse(none.body).error === "not_found" && ![...other.ran.keys()].some((q) => q.startsWith(FILING_COUNTERS_SQL(false, true).slice(0, 40))),
    `a seat on beta (p-4) asking for an alpha filing: ${other.status} ${JSON.parse(other.body).error}, the same as a missing id (${none.status}), and no counters read`);
}

// ---- I · UI-B4b + UI-B6b: Build, three statements in one wave (two with no declared tree) ------------------------------------------------------------------
{
  // I1 · plans: the exact strings, on boot.sql + migrate-038 (the live path), seeded with projects, parents and rank presses
  const M038_INDEXES = [...M038.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  const buildDb = ({ pre038 = false, drop = [] } = {}) => {
    const d = seeded();
    for (const i of M038_INDEXES) d.exec(`DROP INDEX ${i}`);
    if (!pre038) d.exec(M038);
    for (const i of drop) d.exec(`DROP INDEX ${i}`);
    d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z')");
    // rowid n is T-(n-1), in alpha when n is even; a rank press (n % 10 = 0) or a counter (n % 10 = 4, standing when
    // n % 20 = 4, ruled when n % 20 = 14) names the row two before it (T-(n-3), the same project by parity)
    d.exec("UPDATE transmission SET project = CASE WHEN rowid % 2 = 0 THEN 'alpha' ELSE 'beta' END, parent = CASE WHEN rowid % 10 IN (0, 4) THEN 'T-' || (rowid - 3) ELSE NULL END, " +
      "kind = CASE WHEN rowid % 10 = 0 THEN 'rank' WHEN rowid % 10 = 4 THEN 'counter' ELSE kind END, decision = CASE WHEN rowid % 20 = 4 THEN NULL WHEN rowid % 20 = 14 THEN 'approve' ELSE decision END, " +
      "created_at = CASE WHEN rowid > 700 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || (800 - rowid) || ' minutes') ELSE created_at END");
    const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
    for (let i = 0; i < 40; i++) S.run(`p-${i}`, i % 2 ? "alpha" : "beta", "member", "2026-09-01T00:00:00Z");
    return d;
  };
  const noScanTx = (p) => !bareScan(p, "transmission") && !bareScan(p, "t") && !bareScan(p, "c") && !bareScan(p, "r") && !/SCAN transmission\b/.test(p);
  const EPOCH_B3 = new Date(0).toISOString();   // src/goalsread.js periodFrom("all").from: the finish line reads all time (D2)
  const buildPlans = (d, rowsSql = BUILD_ROWS_SQL) => {
    const r = {};
    for (const ev of [false, true]) for (const k of [false, true]) for (const sc of [true, false]) {
      const pl = plan(d, rowsSql(sc, ev, k), [...(sc ? ["alpha"] : []), 0, "p-3", ...(k ? ["pr"] : []), 51]);
      r[`B1${ev ? " ?eval=1" : ""}${k ? " ?kind=" : ""}${sc ? "" : " (no project axis)"}`] = [/SEARCH t USING INDEX idx_transmission_project \(project=\?\)/.test(pl) && !/TEMP B-TREE FOR ORDER BY/.test(pl)
        && /SEARCH c USING INDEX idx_transmission_parent \(parent=\?\)/.test(pl) && /SEARCH r USING INDEX idx_transmission_parent \(parent=\?\)/.test(pl) && noScanTx(pl), pl];
    }
    for (const ev of [false, true]) {
      // sprint 2 (the live budget): B2 = the kinds tally on its primary key + the week on two ranges (filed in it on
      // idx_transmission_project, decided in it on idx_transmission_decided); B3 = the goals tally on its primary key, in the
      // GROUP BY's order (no sort) for the default view
      // sprint 3 L2: the week's FILINGS are walked once (the default list reads the week itself; a filtered one, THE WEEK), so B2
      // keeps the tally and the week's decisions on filings older than it (idx_transmission_decided), never the filed range
      const pl = plan(d, BUILD_AGG_SQL(true, ev), ["alpha", 0, "p-3", "2026-09-20", "2026-09-28"]);
      r[`B2${ev ? " ?eval=1" : ""}`] = [/SEARCH transmission_kinds USING (?:COVERING )?INDEX sqlite_autoindex_transmission_kinds_1 \(project=\?/.test(pl)
        && !/idx_transmission_project/.test(pl) && /SEARCH transmission USING INDEX idx_transmission_decided \(project=\? AND decided_at>\?\)/.test(pl) && noScanTx(pl), pl];
      // the default list's week (B1 bounded to the week: the index's own range) and its older rows (bounded before it)
      for (const [nm, o, a] of [["B1 the week", { since: true }, ["2026-09-20"]], ["B1 before the week", { before: true }, ["2026-09-20"]]]) {
        const pw = plan(d, BUILD_ROWS_SQL(true, ev, false, o), ["alpha", 0, "p-3", ...a, 51]);
        r[`${nm}${ev ? " ?eval=1" : ""}`] = [/SEARCH t USING INDEX idx_transmission_project \(project=\? AND created_at[<>]\?\)/.test(pw) && !/TEMP B-TREE FOR ORDER BY/.test(pw) && noScanTx(pw), pw];
      }
      const p3 = plan(d, GOALS_AGG_SQL_B3(true, ev), ["alpha", EPOCH_B3]);
      r[`B3 finish-line aggregate${ev ? " ?eval=1" : ""}`] = [/SEARCH transmission_goals USING (?:COVERING )?INDEX sqlite_autoindex_transmission_goals_1 \(project=\?/.test(p3) && (ev || !/TEMP B-TREE/.test(p3)) && noScanTx(p3), p3];
    }
    return r;
  };
  for (const [k, [pass, p]] of Object.entries(buildPlans(buildDb()))) ok(pass, `Build ${k}: SEARCHes its index, never SCANs transmission — ${p}`);
  // I2 · the instrument: the pre-038 schema, idx_transmission_project dropped, and B1 without its unary + each FAIL
  const pre = buildPlans(buildDb({ pre038: true }));
  ok(!pre.B1[0] && !pre["B1 ?eval=1"][0], `pre-038 schema FAILS the B1 check (the counters and rank subqueries scan without idx_transmission_parent) — ${pre.B1[1]}`);
  const noProj = buildPlans(buildDb({ drop: ["idx_transmission_project", "idx_transmission_decided"] }));
  ok(!noProj.B1[0] && !noProj.B2[0], `with idx_transmission_project and idx_transmission_decided dropped, B1 and B2 FAIL their checks — ${noProj.B1[1]} || ${noProj.B2[1]}`);
  // B3's instrument: the ledger statement the goals tally replaced (the pre-sprint-2 G1) walks transmission, so the B3 check
  // FAILS on it
  const G1_LEDGER = "SELECT goal_ref, LOWER(lane) AS lane, COUNT(*) AS n FROM transmission WHERE project = ? AND created_at >= ? AND (route = 'auto' OR decision = 'approve') GROUP BY goal_ref, LOWER(lane)";
  const g1Old = plan(buildDb(), G1_LEDGER, ["alpha", EPOCH_B3]);
  ok(!/SEARCH transmission_goals/.test(g1Old), `the pre-sprint-2 goal aggregate (the ledger itself) FAILS the B3 check — ${g1Old}`);
  const noPlus = (sc, ev, k) => BUILD_ROWS_SQL(sc, ev, k).replace("+r.kind = 'rank'", "r.kind = 'rank'").replace("+r.eval", "r.eval");
  const np = buildPlans(buildDb(), noPlus);
  ok(noPlus(true, false, false) !== BUILD_ROWS_SQL(true, false, false) && !np.B1[0], `B1 without its unary + FAILS the check (the rank subquery walks another index) — ${np.B1[1]}`);
  // I3 · the rows: each row's standing-counter count and latest rank press equal a plain computation; no rank row, no suite row
  const d = buildDb();
  const got = d.prepare(BUILD_ROWS_SQL(true, false, false)).all("alpha", 1, "p-owner", 51);
  const all = d.prepare("SELECT id, kind, decision, eval, project, parent, created_at FROM transmission").all();
  const want = (id) => ({ counters: all.filter((c) => c.parent === id && ["counter", "critique"].includes(c.kind) && c.decision == null && c.eval === 0).length,
    ranked: all.filter((c) => c.parent === id && c.kind === "rank" && c.eval === 0).map((c) => c.created_at).sort().pop() || null });
  const mism = got.filter((r) => { const w = want(r.id); return w.counters !== r.counters || w.ranked !== r.ranked_at; });
  ok(got.length === 51 && mism.length === 0 && got.every((r) => r.kind !== "rank" && r.eval === 0 && r.project === "alpha") && got.some((r) => r.counters > 0) && got.some((r) => r.ranked_at),
    `B1 rows (the owner, alpha): ${got.length}, newest first, no rank filing and no suite row among them, each row's counters and ranked_at equal a plain computation (${mism.length} mismatch(es); ${got.filter((r) => r.counters > 0).length} row(s) with standing counters, ${got.filter((r) => r.ranked_at).length} ranked)`);
  const seat = d.prepare(BUILD_ROWS_SQL(true, false, false)).all("alpha", 0, "p-3", 51), notSeated = d.prepare(BUILD_ROWS_SQL(true, false, false)).all("alpha", 0, "p-4", 51);
  const aggNot = d.prepare(BUILD_AGG_SQL(true, false)).all("alpha", 0, "p-4", "2026-09-20", "2026-09-28");
  ok(seat.length === 51 && notSeated.length === 0 && aggNot.length === 0, `the seat scope in the WHERE: p-3 (seated on alpha) reads ${seat.length} alpha row(s); p-4 (seated on beta) reads ${notSeated.length} row(s) and ${aggNot.length} count row(s)`);

  // I4 · the real handler: GET /build (HTML and JSON) runs the goal tree, B1, B2 and B3 (the owner: the project's name too)
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const c = counting(d);
  let extraRead = null;   // the injection: a handler that runs B1 a second time
  const DB = { prepare(sql) { const st = c.DB.prepare(sql); if (sql !== extraRead) return st;
    const w = (a) => { const one = a ? st.bind(...a) : st; const again = () => (a ? c.DB.prepare(sql).bind(...a) : c.DB.prepare(sql));
      return { ...one, all: async () => { await again().all(); return one.all(); }, first: async () => { await again().first(); return one.first(); } }; };
    return { ...w(null), bind: (...a) => w(a) }; } };
  const seen = new Set();
  const DBseen = { prepare(sql) { seen.add(sql); return DB.prepare(sql); } };
  // a goal tree filed on alpha (root + two leaves, one deferred), so the finish line's B3 runs; seedTree(d, "alpha", null) files none
  const stageTree = [{ id: "g-root", title: "The release", parent: null, dimensions: [] }, { id: "g-0", title: "Stage 0", parent: "g-root", dimensions: ["code"] }, { id: "g-1", title: "Stage 1", parent: "g-root", dimensions: ["code"], status: "deferred" }];
  seedTree(d, "alpha", stageTree);
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const hit = async (path, key, accept) => {
    const before = new Map([...seen].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, authorization: `Bearer ${key}` } }), { DB: DBseen, BRAIN }, ctx);
    const body = await r.text();
    const ran = new Map();
    for (const q of seen) { const k = c.n(q) - (before.get(q) || 0); if (k > 0) ran.set(q, k); }
    return { status: r.status, ran, body, type: r.headers.get("content-type") || "" };
  };
  for (const [who, key] of [["the owner", "owner-key"], ["a seat (p-3, alpha)", "key-3"]]) {
    // the tree read always; the project's name only for the owner (a seat's name rides its own seat)
    // sprint 3 L2: the default list reads the WEEK (B1 bounded to it: the week's numbers are counted from its rows) and, the
    // week holding fewer than a page, the rows before it (B1 bounded before it); never the week twice
    const B1W = BUILD_ROWS_SQL(true, false, false, { since: true }), B1O = BUILD_ROWS_SQL(true, false, false, { before: true });
    const want2 = [GOAL_TREE_SQL, B1W, B1O, BUILD_AGG_SQL(true, false), ...(key === "owner-key" ? [PROJECT_NAME_SQL] : [])];
    const want3 = [...want2, GOALS_AGG_SQL_B3(true, false)];
    const B1 = B1W, B3 = GOALS_AGG_SQL_B3(true, false);
    const run = async () => {
      const out = {};
      for (const [door, accept] of [["html", "text/html"], ["json", "application/json"]]) {
        await hit("/decisions", key, accept); await hit("/build", key, accept);   // warm the isolate's own caches
        const base = await hit("/decisions", key, accept), page = await hit("/build", key, accept);
        const delta = [...page.ran].map(([q, k]) => [q, k - (base.ran.get(q) || 0)]).filter(([q, k]) => k > 0 && q !== OWNER_SQL);
        out[door] = { status: page.status, n: delta.reduce((a, [, k]) => a + k, 0), own: delta.map(([q]) => q), body: page.body, type: page.type, base };
      }
      return out;
    };
    const out = await run();
    const h = out.html, j = out.json;
    let jb = {}; try { jb = JSON.parse(j.body); } catch { jb = {}; }
    const fl = jb.finishLine || {};
    ok(h.status === 200 && j.status === 200 && h.n === j.n && h.n === want3.length && want3.every((q) => h.own.includes(q) && j.own.includes(q)) && h.own.length === want3.length && j.own.length === want3.length
      && (h.body.match(/data-region="(filings|tempo|finish-line)"/g) || []).length === 3 && /application\/json/.test(j.type) && Array.isArray(jb.rows) && jb.counts && jb.rows.length > 0
      && fl.total === 2 && fl.deferred === 1 && fl.done + fl.gating + fl.deferred === 2 && JSON.stringify(Object.keys(fl).sort()) === '["deferred","done","gating","total"]',
      `GET /build as ${who} (real handler, a filed tree): the page runs ${h.n} and the JSON ${j.n} D1 statement(s) beyond the baseline (GET /decisions, no pack) and the memoized owner lookup, exactly ${want3.length}: the tree, B1 (the week, then before it), B2 and B3${want3.length > 5 ? " and the project's name" : ""}; the page has the 3 regions, the JSON ${jb.rows ? jb.rows.length : "no"} rows, its counts and finishLine ${JSON.stringify(jb.finishLine)}`);
    extraRead = B1;
    const twice = await run();
    extraRead = null;
    ok(twice.html.n === want3.length + 1 && twice.json.n === want3.length + 1, `the instrument (${who}): a handler reading B1 twice counts ${twice.html.n} / ${twice.json.n} beyond the baseline, one read too many, so the check above would go red`);
    seedTree(d, "alpha", null);
    const und = await run();
    seedTree(d, "alpha", stageTree);
    let ub = {}; try { ub = JSON.parse(und.json.body); } catch { ub = {}; }
    ok(und.html.status === 200 && und.json.status === 200 && und.html.n === want2.length && und.json.n === want2.length && want2.every((q) => und.html.own.includes(q) && und.json.own.includes(q)) && !und.html.own.includes(B3) && ub.finishLine === null,
      `GET /build as ${who} with NO goal filed: ${und.html.n} / ${und.json.n} D1 statement(s), exactly the tree, B1 (the week, then before it) and B2${want2.length > 4 ? " and the name" : ""} (the goal aggregate never runs), finishLine ${JSON.stringify(ub.finishLine)}`);
  }
}

// ---- J · Versions: GET /versions and /versions/:v run ONE statement of their own, ?head=1 the head, every other page the head ----
{
  const VK = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "versions.js")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z')");
  d.exec("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-3','alpha','member','2026-09-01T00:00:00Z')");
  const V = d.prepare("INSERT INTO k_versions (project,n,title,cause,cause_ref,counts,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  V.run("alpha", 1, "The first cut", "published", null, JSON.stringify({ goal: 3, changes: null }), "p-owner", "2026-09-12T09:00:00.000Z", "p-owner", "2026-09-12T09:00:00.000Z");
  V.run("alpha", 2, "The second", "published", null, JSON.stringify({ goal: 4, changes: { from: 1, total: 1, byKind: [["k_goals", "+", 1]], lines: [["+", "k_goals", "g-4", "a goal"]] } }), "p-owner", "2026-09-20T09:00:00.000Z", "p-owner", "2026-09-20T09:00:00.000Z");
  for (let n = 3; n <= 60; n++) V.run("beta", n - 2, `beta v${n - 2}`, "published", null, null, "p-owner", "2026-09-20T09:00:00.000Z", "p-owner", "2026-09-20T09:00:00.000Z");
  // the plans: each read on its primary key, no temp b-tree
  for (const [name, sql, args] of [["the head", VK.VERSION_HEAD_SQL, ["alpha"]], ["the list", VK.VERSION_LIST_SQL, ["alpha"]], ["one version", VK.VERSION_ONE_SQL, ["alpha", 1]]]) {
    const p = plan(d, sql, args);
    ok(/USING INDEX sqlite_autoindex_k_versions_1 \(project=\?/.test(p) && !/TEMP B-TREE/.test(p) && !bareScan(p, "k_versions") && !bareScan(p, "v"), `J · ${name} SEARCHes k_versions on its primary key, no temp b-tree: ${p}`);
  }
  VERSION_READS = new Set([VK.VERSION_HEAD_SQL, VK.VERSION_LIST_SQL, VK.VERSION_ONE_SQL]);
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const c = counting(d, { versions: true });
  const BRAIN = { get: async () => null,
    head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const hit = async (path, key, accept) => {
    const before = new Map([...VERSION_READS].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, authorization: `Bearer ${key}` } }), { DB: c.DB, BRAIN }, ctx);
    const body = await r.text();
    const got = Object.fromEntries([...VERSION_READS].map((q) => [q === VK.VERSION_HEAD_SQL ? "head" : q === VK.VERSION_LIST_SQL ? "list" : "one", c.n(q) - before.get(q)]));
    return { status: r.status, got, body, cc: r.headers.get("cache-control") || "" };
  };
  const DOORS = [["GET /versions (page)", "/versions?project=alpha", "text/html", { head: 0, list: 1, one: 0 }], ["GET /versions (JSON)", "/versions?project=alpha", "application/json", { head: 0, list: 1, one: 0 }],
    ["GET /versions/1 (page)", "/versions/1?project=alpha", "text/html", { head: 0, list: 1, one: 0 }], ["GET /versions/1 (JSON)", "/versions/1?project=alpha", "application/json", { head: 0, list: 1, one: 0 }],
    ["GET /versions?head=1", "/versions?head=1&project=alpha", "application/json", { head: 1, list: 0, one: 0 }], ["GET /decisions (a page)", "/decisions?project=alpha", "text/html", { head: 1, list: 0, one: 0 }],
    ["GET /decisions (JSON)", "/decisions?project=alpha", "application/json", { head: 0, list: 0, one: 0 }]];
  for (const [who, key] of [["the owner", "owner-key"], ["a seat (p-3, alpha)", "key-3"]]) {
    const m = [];
    for (const [label, path, accept, want] of DOORS) { const x = await hit(path, key, accept); m.push({ label, ...x, ok: x.status === 200 && JSON.stringify(x.got) === JSON.stringify(want) }); }
    const headJ = (() => { try { return JSON.parse(m[4].body); } catch { return {}; } })(), listJ = (() => { try { return JSON.parse(m[1].body); } catch { return {}; } })();
    ok(m.every((x) => x.ok) && headJ.n === 2 && m[4].cc === "no-store" && listJ.project && listJ.project.name === "Alpha" && listJ.current.n === 2 && listJ.diff.lines[0].ref === "g-4"
      && new Set(m[0].body.match(/data-region="(not-current-banner|diff|timeline)"/g) || []).size === 3 && /data-state="behind"/.test(m[2].body) && /<meta name="sharingu-served" content="2026-09-20T09:00:00.000Z" data-scope="alpha">/.test(m[5].body),
      `J · ${who}: ${m.map((x) => `${x.label} ${x.status} ${JSON.stringify(x.got)}`).join(" · ")}; the list names the project (Alpha), the head poll no-store v${headJ.n}, a page stamped with the head`);
  }
  // the instrument: a Versions read that also ran the head would count it, so the check above would go red
  const twice = await (async () => { const b = c.n(VK.VERSION_HEAD_SQL); await c.DB.prepare(VK.VERSION_HEAD_SQL).bind("alpha").first(); return c.n(VK.VERSION_HEAD_SQL) - b; })();
  ok(twice === 1, "J · the instrument counts a version read it did not expect (a stray head read is +1)");
}

// ---- K · UI-B6a + slice 1 + slice 4b, Goals: the D1 tree, then G1 G2 C1 in one wave; one goal: the tree, G1 G3 G4 C2 ----
{
  const { GOALS_AGG_SQL, GOALS_COUNTERS_SQL, GOAL_COUNTERS_SQL, GOAL_ROWS_SQL, GOALS_WAITING_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  const M038_INDEXES = [...M038.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  // the seeded DB (A's), on the migrate-038 path, with two projects, goal refs on the rows and goal/ counters in the refs index:
  // rowid n is in alpha when n is even; n % 7 names a goal (g-0 … g-3, n % 7 in 0..3); n % 50 in (5, 6) is a counter
  // naming goal/g-(n % 4) by gapRefs (standing when n % 100 is 5 or 6, ruled when it is 55 or 56): beta's and alpha's
  const goalsDb = ({ drop = [] } = {}) => {
    const d = seeded();
    for (const i of M038_INDEXES) d.exec(`DROP INDEX ${i}`);
    d.exec(M038);
    for (const i of drop) d.exec(`DROP INDEX ${i}`);
    d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z')");
    d.exec("UPDATE transmission SET project = CASE WHEN rowid % 2 = 0 THEN 'alpha' ELSE 'beta' END, goal_ref = CASE WHEN rowid % 7 < 4 THEN 'g-' || (rowid % 7) ELSE NULL END, " +
      "kind = CASE WHEN rowid % 50 IN (5, 6) THEN 'counter' ELSE kind END, decision = CASE WHEN rowid % 100 IN (5, 6) THEN NULL WHEN rowid % 100 IN (55, 56) THEN 'reject' ELSE decision END, " +
      "created_at = CASE WHEN rowid > 700 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || (800 - rowid) || ' minutes') ELSE created_at END");
    d.exec("INSERT INTO transmission_refs (tid, ref) SELECT id, 'goal/g-' || (rowid % 4) FROM transmission WHERE rowid % 50 IN (5, 6)");
    d.exec("INSERT INTO transmission_refs (tid, ref) SELECT id, 'q/Q' || rowid FROM transmission WHERE rowid % 9 = 0");   // the q/ namespace beside it
    // one preview then file call's ledger row on alpha, landed and aimed at no goal: G1 leaves it out
    d.exec("INSERT INTO transmission (id,submitter,lane,kind,what,touches,route,status,eval,project,created_at,org) VALUES ('T-know-1','p-owner','leader','knowledge','5 goals written','goal:g-1,goal:g-2,goal:g-3,goal:g-4,goal:g-5','auto','received',0,'alpha',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minutes'),1)");
    const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
    for (let i = 0; i < 40; i++) S.run(`p-${i}`, i % 2 ? "alpha" : "beta", "member", "2026-09-01T00:00:00Z");
    return d;
  };
  const noScanTx = (p) => !bareScan(p, "transmission") && !bareScan(p, "t") && !bareScan(p, "r") && !/SCAN transmission\b/.test(p);
  const from = new Date(Date.UTC(2026, 6, 1)).toISOString();
  const goalsPlans = (d, rowsSql = GOAL_ROWS_SQL) => {
    const r = {};
    for (const ev of [false, true]) for (const sc of [true, false]) {
      const tag = `${ev ? " ?eval=1" : ""}${sc ? "" : " (no project axis)"}`;
      const pb = sc ? ["alpha"] : [];
      const g1 = plan(d, GOALS_AGG_SQL(sc, ev), [...pb, from]);
      // sprint 2 (the live budget): G1 reads migrate-042's transmission_goals tally on its primary key, in the GROUP BY's order
      // (no sort) for the default view; ?eval=1 (both clean values) sorts its few rows
      r[`G1 aggregate${tag}`] = [/SEARCH transmission_goals USING (?:COVERING )?INDEX sqlite_autoindex_transmission_goals_1 \(project=\?/.test(g1) && (ev || !/TEMP B-TREE/.test(g1)) && noScanTx(g1), g1];
      const g2 = plan(d, GOALS_COUNTERS_SQL(sc, ev), pb);
      r[`G2 goal/ counters${tag}`] = [/SEARCH r USING (?:COVERING )?INDEX idx_transmission_refs_ref \(ref>\? AND ref<\?\)/.test(g2) && /SEARCH t USING (?:INDEX sqlite_autoindex_transmission_1|INTEGER PRIMARY KEY) \(id=\?\)/.test(g2) && noScanTx(g2), g2];
      const g3 = plan(d, GOAL_COUNTERS_SQL(sc, ev), ["goal/g-1", ...pb]);
      r[`G3 one goal's counters${tag}`] = [/SEARCH r USING (?:COVERING )?INDEX idx_transmission_refs_ref \(ref=\?\)/.test(g3) && noScanTx(g3), g3];
      const g4 = plan(d, rowsSql(sc, ev), ["g-1", ...pb, from, 0, "p-3", 26]);
      r[`G4 one goal's rows${tag}`] = [/SEARCH t USING INDEX idx_transmission_goalref \(goal_ref=\?\)/.test(g4) && noScanTx(g4), g4];
    }
    const tree = plan(d, GOAL_TREE_SQL, ["alpha"]);
    r["the goal tree (k_goals)"] = [/SEARCH t USING (?:COVERING )?INDEX (?:sqlite_autoindex_k_goals_1|idx_k_goals_parent) \(project=\?\)/.test(tree) && !/SCAN t\b/.test(tree), tree];
    const nm = plan(d, PROJECT_NAME_SQL, ["alpha"]);
    r["the project's name"] = [/SEARCH projects USING INDEX sqlite_autoindex_projects_1 \(key=\?\)/.test(nm), nm];
    return r;
  };
  const plans = goalsPlans(goalsDb());
  for (const [k, [pass, p]] of Object.entries(plans)) ok(pass, `K · Goals ${k}: SEARCHes its index, never SCANs its table — ${p}`);
  // K2 · the instrument: each index dropped fails its own check; G4 without its unary + walks another index
  const noProj = goalsPlans(goalsDb({ drop: ["idx_transmission_project"] }));
  const noRefs = goalsPlans(goalsDb({ drop: ["idx_transmission_refs_ref"] }));
  const noGoal = goalsPlans(goalsDb({ drop: ["idx_transmission_goalref"] }));
  const g1Ledger = plan(goalsDb(), "SELECT goal_ref, LOWER(lane) AS lane, COUNT(*) AS n FROM transmission WHERE project = ? AND created_at >= ? AND (route = 'auto' OR decision = 'approve') GROUP BY goal_ref, LOWER(lane)", ["alpha", from]);
  ok(!/SEARCH transmission_goals/.test(g1Ledger), `K · the ledger form of G1 (before the tally) FAILS the G1 check — ${g1Ledger}`);
  ok(!noRefs["G2 goal/ counters"][0] && !noRefs["G3 one goal's counters"][0], `K · with idx_transmission_refs_ref dropped, G2 and G3 FAIL their checks — ${noRefs["G2 goal/ counters"][1]} || ${noRefs["G3 one goal's counters"][1]}`);
  ok(!noGoal["G4 one goal's rows"][0], `K · with idx_transmission_goalref dropped, G4 FAILS its check — ${noGoal["G4 one goal's rows"][1]}`);
  const noPlus = (sc, ev) => GOAL_ROWS_SQL(sc, ev).replace("+t.project", "t.project").replace("+t.created_at", "t.created_at");
  const np = goalsPlans(goalsDb(), noPlus);
  ok(noPlus(true, false) !== GOAL_ROWS_SQL(true, false) && !np["G4 one goal's rows"][0], `K · G4 without its unary + FAILS the check (the planner walks idx_transmission_project instead) — ${np["G4 one goal's rows"][1]}`);
  // K3 · the rows: G1's groups and G2's counts equal a plain computation over the seeded rows
  const d = goalsDb();
  const all = d.prepare("SELECT t.id, t.lane, t.kind, t.route, t.decision, t.eval, t.project, t.goal_ref, t.what, t.gaprefs, t.components, t.created_at FROM transmission t").all();
  const refs = d.prepare("SELECT tid, ref FROM transmission_refs").all();
  const landed = (t) => t.project === "alpha" && t.created_at >= from && (t.route === "auto" || t.decision === "approve") && !["counter", "critique", "rank", "restore", "knowledge"].includes(t.kind || "")
    && t.eval === 0 && !/eval probe|\[eval/i.test(t.what || "");
  const want1 = new Map();
  for (const t of all.filter(landed)) { const k = `${t.goal_ref}|${String(t.lane).toLowerCase()}`; want1.set(k, (want1.get(k) || 0) + 1); }
  const got1 = new Map(d.prepare(GOALS_AGG_SQL(true, false)).all("alpha", from).map((r) => [`${r.goal_ref}|${r.lane}`, r.n]));
  ok(got1.size > 0 && got1.size === want1.size && [...want1].every(([k, n]) => got1.get(k) === n), `K · G1 (alpha, since ${from.slice(0, 10)}): ${got1.size} (goal, lane) group(s), each count equal to a plain computation over the seeded rows (suite rows, counters and beta out)`);
  const byId = new Map(all.map((t) => [t.id, t]));
  const want2 = new Map();
  for (const r of refs.filter((x) => x.ref.startsWith("goal/"))) {
    const t = byId.get(r.tid); if (!t || t.project !== "alpha" || t.eval !== 0 || !["counter", "critique"].includes(t.kind)) continue;
    const w = want2.get(r.ref) || { standing: 0, ruled: 0 }; if (t.decision == null) w.standing++; else w.ruled++; want2.set(r.ref, w);
  }
  const got2 = d.prepare(GOALS_COUNTERS_SQL(true, false)).all("alpha");
  ok(got2.length > 0 && got2.length === want2.size && got2.every((r) => want2.get(r.ref) && want2.get(r.ref).standing === r.standing && want2.get(r.ref).ruled === r.ruled) && got2.every((r) => r.ref.startsWith("goal/")),
    `K · G2 (alpha): ${got2.length} goal ref(s), standing and ruled equal to a plain computation; no q/ ref leaks into the goal/ range (${got2.map((r) => `${r.ref} ${r.standing}/${r.ruled}`).join(", ")})`);

  // K4 · the real handler: GET /goals (page and JSON) runs the tree, G1, G2 and C1 (the goals' lights, k_node_lights);
  // GET /goals/:ref the tree, G1, G3, G4 and C2 (the goal's checks, CHECKS_FOR_SQL); the owner (seated nowhere) reads the
  // project's name too
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  // C1 reads the goals' lights off k_node_lights (migrate-043), one row per goal, never the checks that name them
  const { NODE_LIGHTS_SQL, CHECKS_FOR_SQL: C2_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "checks.js")).href);
  const C1_SQL = () => NODE_LIGHTS_SQL;
  const c = counting(d);
  let extraRead = null;   // the injection: a handler that runs G1 a second time
  const DB = { prepare(sql) { const st = c.DB.prepare(sql); if (sql !== extraRead) return st;
    const w = (a) => { const one = a ? st.bind(...a) : st; const again = () => (a ? c.DB.prepare(sql).bind(...a) : c.DB.prepare(sql));
      return { ...one, all: async () => { await again().all(); return one.all(); }, first: async () => { await again().first(); return one.first(); } }; };
    return { ...w(null), bind: (...a) => w(a) }; } };
  const seen = new Set();
  const DBseen = { prepare(sql) { seen.add(sql); return DB.prepare(sql); } };
  const tree = [{ id: "g-root", title: "The quarter", parent: null, dimensions: [] }, ...[0, 1, 2, 3].map((i) => ({ id: `g-${i}`, title: `Goal ${i}`, parent: "g-root", dimensions: ["code"] }))];
  seedTree(d, "alpha", tree);
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const hit = async (path, key, accept) => {
    const before = new Map([...seen].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, authorization: `Bearer ${key}` } }), { DB: DBseen, BRAIN }, ctx);
    const body = await r.text();
    const ran = new Map();
    for (const q of seen) { const k = c.n(q) - (before.get(q) || 0); if (k > 0) ran.set(q, k); }
    return { status: r.status, ran, body, type: r.headers.get("content-type") || "" };
  };
  const measure = async (path, key) => {
    const out = {};
    for (const [door, accept] of [["html", "text/html"], ["json", "application/json"]]) {
      await hit("/decisions", key, accept); await hit(path, key, accept);   // warm the isolate's own caches
      const base = await hit("/decisions", key, accept), page = await hit(path, key, accept);
      const delta = [...page.ran].map(([q, k]) => [q, k - (base.ran.get(q) || 0)]).filter(([q, k]) => k > 0 && q !== OWNER_SQL);
      out[door] = { status: page.status, n: delta.reduce((a, [, k]) => a + k, 0), own: delta.map(([q]) => q), body: page.body, type: page.type };
    }
    return out;
  };
  for (const [who, key] of [["the owner", "owner-key"], ["a seat (p-3, alpha)", "key-3"]]) {
    const name = key === "owner-key" ? [PROJECT_NAME_SQL] : [];   // a seat's project name rides its own seat
    // + sprint 3 B4: how many stale checks name each goal (ST.STALE_BY_REF_SQL, read from the stale checks outward)
    // + the one-pass fix 4b: G5, what waits for the owner per goal (GOALS_WAITING_SQL, one range of idx_transmission_owner_open)
    const wantTree = [GOAL_TREE_SQL, GOALS_AGG_SQL(true, false), GOALS_COUNTERS_SQL(true, false), C1_SQL(), ST.STALE_BY_REF_SQL, GOALS_WAITING_SQL(false), ...name];
    const wantNode = [GOAL_TREE_SQL, GOALS_AGG_SQL(true, false), GOAL_COUNTERS_SQL(true, false), GOAL_ROWS_SQL(true, false), C2_SQL(), GOALS_WAITING_SQL(false), ...name];
    const same = (got, want) => { const g = got.filter((q) => q !== OPEN_QUESTION_ROWS_SQL); return g.length === want.length && want.every((q) => g.includes(q)); };
    const upTo = (n, want) => n === want.length || n === want.length + 1;   // + the open-questions read where the baseline did not run it
    const t = await measure("/goals", key);
    let tj = {}; try { tj = JSON.parse(t.json.body); } catch { tj = {}; }
    // L4: no tab reads its checklist (the fill chip is gone): the page runs exactly what the JSON runs
    const wantTreePage = [...wantTree];
    ok(t.html.status === 200 && t.json.status === 200 && upTo(t.html.n, wantTreePage) && upTo(t.json.n, wantTree) && same(t.html.own, wantTreePage) && same(t.json.own, wantTree)
      && (t.html.body.match(/data-region="(goal-tree|what-fed|blocked)"/g) || []).length === 3 && /application\/json/.test(t.json.type) && Array.isArray(tj.nodes) && tj.nodes.length === 5 && tj.whatFed && tj.period
      && tj.declared === true && tj.project.name === "Alpha",
      `K · GET /goals as ${who} (real handler): the page runs ${t.html.n} and the JSON ${t.json.n} D1 statement(s) beyond the baseline (GET /decisions, no pack) and the memoized owner lookup, exactly the tree, G1, G2, C1, the stale counts and G5 (what waits for the owner)${name.length ? " and the project's name" : ""} (the page: the same, no fill chip since L4); the page has the 3 regions, the JSON ${tj.nodes ? tj.nodes.length : "no"} nodes`);
    const n = await measure("/goals/g-1", key);
    let nj = {}; try { nj = JSON.parse(n.json.body); } catch { nj = {}; }
    // L4: the /decisions baseline no longer runs the fill chip's open-questions read, so a seat's goal page may count that one
    // memoized read (the open questions naming the goal) beyond it: upTo, as the tree's check above
    ok(n.html.status === 200 && n.json.status === 200 && upTo(n.html.n, wantNode) && n.json.n === wantNode.length && same(n.html.own, wantNode) && same(n.json.own, wantNode)
      && (n.html.body.match(/data-region="(node|cells|filings|children|counters)"/g) || []).length === 5 && nj.node && nj.node.id === "g-1" && Array.isArray((nj.filings || {}).rows) && nj.filings.rows.length > 0,
      `K · GET /goals/g-1 as ${who} (real handler): the page runs ${n.html.n} and the JSON ${n.json.n} D1 statement(s) beyond the baseline, exactly the tree, G1, G3, G4, C2 and G5${name.length ? " and the project's name" : ""}; the page has the 5 regions, the JSON ${nj.filings && nj.filings.rows ? nj.filings.rows.length : "no"} filing row(s)`);
    const u = await measure("/goals/no-such-goal", key);
    ok(u.json.status === 404 && /"unknown_goal"/.test(u.json.body) && u.json.n === 1 && same(u.json.own, [GOAL_TREE_SQL]) && u.html.status === 404,
      `K · GET /goals/no-such-goal as ${who}: 404 unknown_goal after the tree read alone (${u.json.n} run), before any ledger statement`);
    extraRead = GOALS_AGG_SQL(true, false);
    const twice = await measure("/goals", key);
    extraRead = null;
    ok(twice.html.n === t.html.n + 1 && twice.json.n === t.json.n + 1, `K · the instrument (${who}): a handler reading G1 twice counts ${twice.html.n} / ${twice.json.n} beyond the baseline, one read too many, so the check above would go red`);
  }
  // K5 · no goal filed: GET /goals answers declared:false with the note naming preview then file, and runs the tree read alone
  seedTree(d, "alpha", null);
  const e = await measure("/goals", "key-3");
  let ej = {}; try { ej = JSON.parse(e.json.body); } catch { ej = {}; }
  ok(e.json.status === 200 && ej.declared === false && ej.nodes.length === 0 && /\bpreview\b/.test(ej.note || "") && e.json.n <= 2 && e.json.own.includes(GOAL_TREE_SQL)
    && e.json.own.every((q) => q === GOAL_TREE_SQL || q === OPEN_QUESTION_ROWS_SQL) && /data-state="empty"[\s\S]*?No goals yet/.test(e.html.body) && !/data-state="empty"[^]*?preview \{/.test(e.html.body),
    `K · no goal filed: declared ${ej.declared}, note "${ej.note}" (the JSON names preview), ${e.json.n} statement(s) (the tree and the open questions, no ledger statement), the page's EMPTY a phrase (D2b, pristine copy)`);
  seedTree(d, "alpha", tree);
}

// ---- L · slice 3, the Map reads D1: the model's own statements (src/knowledge/canvas.js, checks.js) SEARCH their index ----
// A model filed into alpha through the importer's own mappers (tools/fixtures/model-d1.mjs over the pinned map, model and
// flows canvases), three checks naming two screens and a table, one of them graded. EXPLAIN on the exact strings: a typed
// node read SEARCHes idx_k_nodes_type and a typed edge read idx_k_edges_kind, both in the index's own order (no sort); one
// node SEARCHes the primary key; its edges SEARCH the primary key (from) and idx_k_edges_to (to); a light SEARCHes
// k_check_refs by (project, ref) and each check's latest grade idx_check_results_latest. Each FAILS with its index dropped,
// and the light as it read before migrate-040 (derived from k_checks.refs) walks the whole register.
const { NODES_SQL, EDGES_SQL, NODE_SQL, NODE_EDGES_SQL, PARTS: MAP_PARTS, ALL_PARTS: MAP_ALL } = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "canvas.js")).href);
const { LIGHTS_SQL, CHECKS_FOR_SQL, NODE_LIGHTS_SQL: NODE_LIGHTS } = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "checks.js")).href);
const { MODEL_NODES_SQL, MODEL_LINKS_SQL, MODEL_LIT_SQL, LIGHTS_SINCE_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "mapmodel.js")).href);
const { seedModel, seedChecks, seedGrade } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "model-d1.mjs")).href);
const MAP_T = [...new Set(MAP_ALL.flatMap((p) => MAP_PARTS[p].types))], MAP_K = [...new Set(MAP_ALL.flatMap((p) => MAP_PARTS[p].kinds || []))];
const MAP_CV = JSON.parse(readFileSync(join(ENGINE, "tools", "fixtures", "map-canvas.json"), "utf8"));
const mapWorld = () => {
  const d = seeded();
  d.exec("INSERT OR IGNORE INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z')");
  d.exec("INSERT OR IGNORE INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-3','alpha','member','2026-09-01T00:00:00Z')");
  const model = JSON.parse(readFileSync(join(ENGINE, "tools", "fixtures", "model-canvas.json"), "utf8"));
  const flows = JSON.parse(readFileSync(join(ENGINE, "tools", "fixtures", "flows-canvas.json"), "utf8"));
  seedModel(d, "alpha", { ...MAP_CV, architecture: model.architecture, flows: flows.flows, deps: flows.deps });
  seedTree(d, "alpha", [{ id: "global", title: "Ship the quarter", parent: null }, { id: "engine", title: "The engine", parent: "global", dimensions: ["code"] }]);
  const scr = MAP_CV.screens.map((s) => "screen:" + s.id);
  seedChecks(d, "alpha", [{ id: "AC.l.1", refs: [scr[0]] }, { id: "AC.l.2", refs: [scr[0], scr[1]] }, { id: "AC.l.3", refs: ["table:" + MAP_CV.tables[0].name] }]);
  seedGrade(d, "alpha", "AC.l.1", "proven");
  return { d, scr };
};
{
  const { d, scr } = mapWorld();
  const DERIVED = "(SELECT c.project AS project, j.value AS ref, c.id AS check_id FROM k_checks c, json_each(COALESCE(c.refs, '[]')) j WHERE c.project = ?1)";
  const checksOf = (db) => ({
    nodes: plan(db, NODES_SQL(MAP_T.length), ["alpha", ...MAP_T]), edges: plan(db, EDGES_SQL(MAP_K.length), ["alpha", ...MAP_K]),
    node: plan(db, NODE_SQL, ["alpha", scr[0], "x"]), nodeEdges: plan(db, NODE_EDGES_SQL, ["alpha", scr[0]]),
    lights: plan(db, LIGHTS_SQL(), ["alpha", JSON.stringify(scr)]), checksFor: plan(db, CHECKS_FOR_SQL(), ["alpha", JSON.stringify([scr[0]]), 10]),
    // the Map (sprint 2, migrate-043): its model's nodes, its links, its lit nodes, the lights poll and one node's light
    model: plan(db, MODEL_NODES_SQL, ["alpha"]), links: plan(db, MODEL_LINKS_SQL, ["alpha"]),
    lit: (() => { try { return plan(db, MODEL_LIT_SQL(2), ["alpha", scr[0], scr[1]]); } catch (e) { return String(e.message); } })(),   // INDEXED BY: no index, no plan
    since: plan(db, LIGHTS_SINCE_SQL, ["alpha", "2026-01-01T00:00:00.000Z"]), nodeLight: plan(db, NODE_LIGHTS, ["alpha", JSON.stringify(scr)]),
  });
  const pass = {
    nodes: (p) => /SEARCH k_nodes USING INDEX idx_k_nodes_type \(project=\? AND type=\?\)/.test(p) && !/TEMP B-TREE/.test(p),
    edges: (p) => /SEARCH k_edges USING INDEX idx_k_edges_kind \(project=\? AND kind=\?\)/.test(p) && !/TEMP B-TREE/.test(p),
    node: (p) => /sqlite_autoindex_k_nodes_1 \(project=\? AND id=\?\)/.test(p),
    nodeEdges: (p) => /sqlite_autoindex_k_edges_1 \(project=\? AND from_id=\?\)/.test(p) && /idx_k_edges_to \(project=\? AND to_id=\?\)/.test(p),
    lights: (p) => /k_check_refs_1 \(project=\? AND ref=\?\)/.test(p) && /idx_check_results_latest \(project=\? AND check_id=\?\)/.test(p) && !/SCAN (r|c)\b(?! USING)/.test(p),
    checksFor: (p) => /k_check_refs_1 \(project=\? AND ref=\?\)/.test(p) && /sqlite_autoindex_k_checks_1 \(project=\? AND id=\?\)/.test(p) && /idx_check_results_latest/.test(p),
    model: (p) => /SEARCH k_nodes USING INDEX idx_k_nodes_type \(project=\? AND type=\?\)/.test(p) && !/TEMP B-TREE/.test(p),
    links: (p) => /SEARCH k_node_links USING INDEX sqlite_autoindex_k_node_links_1 \(project=\?\)/.test(p),
    lit: (p) => /SEARCH k_node_lights USING INDEX idx_k_node_lights_lit \(project=\? AND node_id=\?\)/.test(p),
    since: (p) => /SEARCH k_node_lights USING INDEX idx_k_node_lights_at \(project=\? AND updated_at>\?\)/.test(p),
    nodeLight: (p) => /SEARCH k_node_lights USING INDEX sqlite_autoindex_k_node_lights_1 \(project=\? AND node_id=\?\)/.test(p),
  };
  const got = checksOf(d);
  for (const [k, p] of Object.entries(got)) ok(pass[k](p), `L · the Map's ${k} read SEARCHes its index${/nodes|edges/.test(k) ? ", in the index's own order (no sort)" : ""} — ${p.slice(0, 220)}`);
  const dropped = mapWorld().d;
  for (const i of ["idx_k_nodes_type", "idx_k_edges_kind", "idx_k_edges_to", "idx_check_results_latest", "idx_k_node_lights_lit", "idx_k_node_lights_at"]) dropped.exec(`DROP INDEX ${i}`);
  const off = checksOf(dropped);
  ok(!pass.model(off.model) && !pass.lit(off.lit) && !pass.since(off.since), `L · the instrument: with idx_k_nodes_type, idx_k_node_lights_lit and idx_k_node_lights_at dropped, the Map's model, lit and poll checks FAIL — ${off.lit.slice(0, 90)} || ${off.since.slice(0, 90)}`);
  ok(!pass.nodes(off.nodes) && !pass.edges(off.edges) && !pass.nodeEdges(off.nodeEdges) && !pass.lights(off.lights),
    `L · the instrument: with idx_k_nodes_type, idx_k_edges_kind, idx_k_edges_to and idx_check_results_latest dropped, the nodes, edges, node-edges and light checks FAIL — ${off.nodes.slice(0, 90)} || ${off.lights.slice(-80)}`);
  const pre = plan(d, LIGHTS_SQL(DERIVED), ["alpha", JSON.stringify(scr)]);
  ok(!pass.lights(pre) && /SEARCH c USING INDEX sqlite_autoindex_k_checks_1 \(project=\?\)/.test(pre), `L · the light before migrate-040 (derived from k_checks.refs) walks the project's whole register, so the check above FAILS it — ${pre.slice(0, 120)}`);
  const L = d.prepare(LIGHTS_SQL()).all("alpha", JSON.stringify([...scr, "table:" + MAP_CV.tables[0].name])).map((r) => `${r.ref}:${r.total}/${r.graded}/${r.passed}/${r.failed}`).sort().join(" ");
  ok(L === [`${scr[0]}:2/1/1/0`, `${scr[1]}:1/0/0/0`, `table:${MAP_CV.tables[0].name}:1/0/0/0`].sort().join(" "), `L · the lights' counts equal the seeded checks (total/graded/passed/failed): ${L}`);
}

// ---- M · slice 3, through the real handler: each Map read runs the model's own statements ONCE ----
// The same world. Beyond the same request's baseline (GET /versions: JSON for a JSON read, the page for a page, which run
// nothing of their own), counted by statement text: GET /map runs the whole model (the typed node read and edge read), the
// page's lights and the inspector's node and edges once each (the inspector's gaps and light are the page's, memoized);
// GET /canvas.json the typed node and edge reads and the architecture's marks (M4, one statement); GET /map/node its gaps, the node, its edges and its light (a table
// its relations too; a goal its gaps and light); each model plane its own parts (Arch also its marks, M4); Map · MCP none of them and exactly ONE
// statement, its workspace-shelf (BROADCAST_SQL); Map · Arch also the shell's own two (the active count and the seats, the
// seats once).
{
  const { d, scr } = mapWorld();
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const c = counting(d);
  const seen = new Set();
  const DB = { prepare(sql) { seen.add(sql); return c.DB.prepare(sql); } };
  const BRAIN = { get: async () => null,
    head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const hit = async (path, key, accept) => {
    const before = new Map([...seen].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, authorization: `Bearer ${key}` } }), { DB, BRAIN }, ctx);
    const body = await r.text();
    const per = new Map(); for (const q of seen) { const k = c.n(q) - (before.get(q) || 0); if (k) per.set(q, k); }
    return { status: r.status, per, body, type: r.headers.get("content-type") || "" };
  };
  const { BROADCAST_SQL: BSQL, ARCH_MARKS_SQL: MARKS } = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  const LIT = MODEL_LIT_SQL(Number(d.prepare("SELECT COUNT(*) AS n FROM k_nodes WHERE project = 'alpha' AND type IN ('surface','screen','door','table','entity','dep','flow') OR (project = 'alpha' AND type = 'gap' AND COALESCE(status, '') <> 'closed')").get().n));
  const MINE = new Set([...Array.from({ length: 16 }, (_, i) => NODES_SQL(i + 1)), ...Array.from({ length: 8 }, (_, i) => EDGES_SQL(i + 1)), NODE_SQL, NODE_EDGES_SQL, LIGHTS_SQL(), CHECKS_FOR_SQL(),
    NODE_LIGHTS, MODEL_NODES_SQL, MODEL_LINKS_SQL, LIGHTS_SINCE_SQL, MARKS, ...Array.from({ length: 91 }, (_, i) => MODEL_LIT_SQL(i + 1))]);
  // the Map page (GET /map and the model planes to a browser): the compact model, the lit probes of what it draws
  const MAPPAGE = [[MODEL_NODES_SQL, 1], [MODEL_LINKS_SQL, 1], [LIT, 1]];
  const N = (n) => NODES_SQL(n), E = (n) => EDGES_SQL(n);
  const J = "application/json", H = "text/html";
  const tbl = encodeURIComponent("table:" + MAP_CV.tables[0].name);
  // [label, path, accept, the model statements it runs (text -> times)]
  const DOORS = [
    ["GET /map (the page)", "/map", H, MAPPAGE],
    ["GET /map/lights?since=", "/map/lights?since=2099-01-01T00:00:00.000Z", J, [[LIGHTS_SINCE_SQL, 1]]],
    ["GET /canvas.json", "/canvas.json", J, [[N(MAP_T.length), 1], [E(MAP_K.length), 1], [MARKS, 1]]],
    ["GET /map/node?gap=1 (JSON)", "/map/node?gap=1", J, [[N(1), 1], [NODE_SQL, 1], [NODE_EDGES_SQL, 1], [NODE_LIGHTS, 1]]],
    ["GET /map/node?gap=1 (the inspector, HTML)", "/map/node?gap=1", H, [[N(1), 1], [NODE_SQL, 1], [NODE_EDGES_SQL, 1], [NODE_LIGHTS, 1]]],
    ["GET /map/node?ref=table:<t> (JSON)", `/map/node?ref=${tbl}`, J, [[N(1), 2], [E(1), 1], [NODE_SQL, 1], [NODE_EDGES_SQL, 1], [NODE_LIGHTS, 1]]],
    ["GET /map/node?ref=goal/engine (JSON)", "/map/node?ref=goal%2Fengine", J, [[N(1), 1], [NODE_LIGHTS, 1]]],
    ["GET /map/arch (JSON)", "/map/arch", J, [[N(2), 1], [MARKS, 1]]], ["GET /map/arch (the page)", "/map/arch", H, [[N(2), 1], [MARKS, 1]]],
    ["GET /map/data (JSON)", "/map/data", J, [[N(2), 1], [E(1), 1]]], ["GET /map/data (the page)", "/map/data", H, MAPPAGE],
    ["GET /map/api (JSON)", "/map/api", J, [[N(1), 1]]], ["GET /map/api (the page)", "/map/api", H, MAPPAGE],
    ["GET /map/flows (JSON)", "/map/flows", J, [[N(1), 1]]], ["GET /map/flows (the page)", "/map/flows", H, MAPPAGE],
    ["GET /map/deps (JSON)", "/map/deps", J, [[N(1), 1], [E(2), 1]]], ["GET /map/deps (the page)", "/map/deps", H, MAPPAGE],
    ["GET /map/mcp (JSON)", "/map/mcp", J, []], ["GET /map/mcp (the page)", "/map/mcp", H, []],
    ["GET /contract", "/contract", J, []],
  ];
  const measure = async (key) => {
    const out = [];
    for (const [label, path, accept, want] of DOORS) {
      await hit("/versions", key, accept); await hit(path, key, accept);   // warm the isolate's own memos
      const base = await hit("/versions", key, accept), got = await hit(path, key, accept);
      const extra = [...got.per].flatMap(([q, k]) => Array(Math.max(0, k - (base.per.get(q) || 0))).fill(q));
      const mine = new Map(); for (const q of extra) if (MINE.has(q)) mine.set(q, (mine.get(q) || 0) + 1);
      const wantM = new Map(want);
      const same = mine.size === wantM.size && [...wantM].every(([q, k]) => mine.get(q) === k);
      out.push({ label, status: got.status, base: base.status, same, extra, body: got.body, per: got.per,
        mine: [...mine].map(([q, k]) => `${q.replace(/\s+/g, " ").slice(0, 34)}…×${k}`).join(", ") || "none" });
    }
    return out;
  };
  for (const [who, key] of [["the owner", "owner-key"], ["a seat (p-3, alpha)", "key-3"]]) {
    const m = await measure(key);
    const byL = Object.fromEntries(m.map((x) => [x.label, x]));
    const bad = m.filter((x) => x.status !== 200 || x.base !== 200 || !x.same);
    ok(!bad.length, `M · ${who}: every Map read runs its own model statements once each${bad.length ? ` — off: ${bad.map((x) => `${x.label} ${x.status} [${x.mine}]`).join(" · ")}` : ""}`);
    let node = {}, page = ""; try { node = JSON.parse(byL["GET /map/node?gap=1 (JSON)"].body); page = byL["GET /map (the page)"].body; } catch { /* red below */ }
    // the Map's light filter counts every drawn node: one screen amber (one of its two checks graded), none green
    const cnt = (light) => Number((new RegExp(`data-show="${light}"[^>]*><i></i><b>(\\d+)</b>`).exec(page) || [])[1] ?? -1);
    const drawn = Number((/Every node, as a list <b>(\d+)<\/b>/.exec(page) || [])[1] ?? -1);
    ok(node.walk && node.walk.n === 4 && /data-region="inspector"/.test(page) && cnt("amber") === 1 && cnt("green") === 0 && cnt("grey") === drawn - 1
      && /data-screen="map" data-view="canvas"/.test(byL["GET /map/data (the page)"].body) && /data-layer="data" aria-pressed="true"/.test(byL["GET /map/data (the page)"].body)
      && /data-worker="sharingu"/.test(byL["GET /map/arch (the page)"].body)   /* the org worker named from the org's row (this world has none: the product's name), never the worker's (sprint 6, 6.3) */ && /data-lane="/.test(byL["GET /map/arch (the page)"].body)
      && /data-layer="flows" aria-pressed="true"/.test(byL["GET /map/flows (the page)"].body) && /data-button="flow-pick"/.test(byL["GET /map/flows (the page)"].body)
      && /data-layer="deps" aria-pressed="true"/.test(byL["GET /map/deps (the page)"].body) && /"lights":\s*\[\s*\]/.test(byL["GET /map/lights?since="].body),
      `M · ${who}: the reads answer the seeded model — walk.n ${node.walk ? node.walk.n : "?"}, the Map's lights amber ${cnt("amber")} · green ${cnt("green")} · grey ${cnt("grey")} of ${drawn}, every old plane opens the Map on its layer` +
      ` [data ${/data-layer="data" aria-pressed="true"/.test(byL["GET /map/data (the page)"].body)} arch ${/data-lane="/.test(byL["GET /map/arch (the page)"].body)} flows ${/data-button="flow-pick"/.test(byL["GET /map/flows (the page)"].body)} deps ${/data-layer="deps" aria-pressed="true"/.test(byL["GET /map/deps (the page)"].body)} lights ${byL["GET /map/lights?since="].body.replace(/\s+/g, "").slice(0, 60)}]`);
    // L4: no fill chip on the Map, so the page runs exactly the JSON's one statement
    const pageX = byL["GET /map/mcp (the page)"].extra;
    const mx = [...byL["GET /map/mcp (JSON)"].extra, ...pageX];
    ok(mx.length === 2 && mx.every((q) => q === BSQL(false)),
      `M · ${who}: GET /map/mcp's one statement (JSON and page) is the Broadcast read, BROADCAST_SQL: ${[...byL["GET /map/mcp (JSON)"].extra, ...pageX].map((q) => q.replace(/\s+/g, " ").slice(0, 60)).join(" | ") || "none"}`);
    const ax = byL["GET /map/arch (JSON)"].extra.filter((q) => !MINE.has(q));
    const seatsRuns = [...(byL["GET /map/arch (JSON)"].per || new Map())].filter(([q]) => /FROM project_seats/.test(q)).reduce((n, [, k]) => n + k, 0);
    ok(ax.length === 2 && ax.some((q) => /COUNT\(\*\) AS n FROM projects WHERE active = 1/.test(q)) && ax.some((q) => /FROM project_seats/.test(q)) && seatsRuns === 1,
      `M · ${who}: GET /map/arch runs, beside its model read, exactly the shell's own active count and seats (${ax.map((q) => q.replace(/\s+/g, " ").slice(0, 48)).join(" | ")}), the seats once (${seatsRuns})`);
  }
}

// ---- N · UI-B10a, GTM: GET /gtm in two statements (G1, X1; X2 only when X1 is cut, sprint 2) and the template (k_gtm), no G1 with no declared tree; the page too ----
{
  const { GOALS_AGG_SQL, GTM_ROWS_SQL, GTM_KINDS_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  const M038_INDEXES = [...M038.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  // A's seeded DB on the migrate-038 path, two projects: rowid n is in alpha when n is even; n % 3 = 0 is a gtm filing (its kind
  // social, outreach, content or webinar by (n / 12) % 4; n % 6 = 0 names goal g-reach; n % 12 = 0 is a suite row); n % 50 in
  // (5, 6) is a counter naming the newest alpha gtm row before it by parent (standing when n % 100 is 5 or 6); n % 50 = 8 is a rank press
  const gtmDb = ({ pre038 = false, drop = [] } = {}) => {
    const d = seeded();
    for (const i of M038_INDEXES) d.exec(`DROP INDEX ${i}`);
    if (!pre038) d.exec(M038);
    for (const i of drop) d.exec(`DROP INDEX ${i}`);
    d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z')");
    d.exec("UPDATE transmission SET project = CASE WHEN rowid % 2 = 0 THEN 'alpha' ELSE 'beta' END, " +
      "lane = CASE WHEN rowid % 3 = 0 OR rowid % 50 IN (5, 6, 8) THEN 'gtm' ELSE lane END, eval = CASE WHEN rowid % 12 = 0 THEN 1 ELSE eval END, " +
      "kind = CASE WHEN rowid % 50 IN (5, 6) THEN 'counter' WHEN rowid % 50 = 8 THEN 'rank' WHEN rowid % 3 = 0 THEN (CASE (rowid / 12) % 4 WHEN 0 THEN 'social' WHEN 1 THEN 'outreach' WHEN 2 THEN 'content' ELSE 'webinar' END) ELSE kind END, " +
      "parent = NULL, " +
      "decision = CASE WHEN rowid % 100 IN (5, 6) THEN NULL ELSE decision END, " +
      "goal_ref = CASE WHEN rowid % 6 = 0 THEN 'g-reach' ELSE NULL END, " +
      "created_at = CASE WHEN rowid > 700 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || (800 - rowid) || ' minutes') ELSE created_at END");
    d.exec("UPDATE transmission SET parent = (SELECT p.id FROM transmission p WHERE p.rowid < transmission.rowid AND p.lane = 'gtm' AND p.project = 'alpha' AND p.eval = 0 AND p.kind NOT IN ('counter','rank') ORDER BY p.rowid DESC LIMIT 1) WHERE kind = 'counter'");
    const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
    for (let i = 0; i < 40; i++) S.run(`p-${i}`, i % 2 ? "alpha" : "beta", "member", "2026-09-01T00:00:00Z");
    return d;
  };
  const noScanTx = (p) => !bareScan(p, "transmission") && !bareScan(p, "t") && !bareScan(p, "c") && !/SCAN transmission\b/.test(p);
  const from = new Date(Date.UTC(2026, 6, 1)).toISOString();
  const gtmPlans = (d) => {
    const r = {};
    for (const ev of [false, true]) for (const sc of [true, false]) {
      const tag = `${ev ? " ?eval=1" : ""}${sc ? "" : " (no project axis)"}`;
      const pb = sc ? ["alpha"] : [];
      const x1 = plan(d, GTM_ROWS_SQL(sc, ev), [...pb, from, 0, "p-3", 201]);
      // sprint 2 (the live budget): the gtm lane's filings only, on migrate-042's idx_transmission_lane (project, lower(lane), created_at)
      r[`X1 rows${tag}`] = [/SEARCH t USING INDEX idx_transmission_lane \(project=\? AND <expr>=\? AND created_at>\?\)/.test(x1) && !/TEMP B-TREE FOR ORDER BY/.test(x1)
        && /SEARCH c USING INDEX idx_transmission_parent \(parent=\?\)/.test(x1) && noScanTx(x1), x1];
      const x2 = plan(d, GTM_KINDS_SQL(sc, ev), [...pb, from, 0, "p-3"]);
      r[`X2 kinds${tag}`] = [/SEARCH transmission USING INDEX idx_transmission_lane \(project=\? AND <expr>=\? AND created_at>\?\)/.test(x2) && noScanTx(x2), x2];
    }
    return r;
  };
  for (const [k, [pass, p]] of Object.entries(gtmPlans(gtmDb()))) ok(pass, `N · GTM ${k}: SEARCHes its index, never SCANs transmission — ${p}`);
  // N2 · the instrument: idx_transmission_project dropped fails X1 and X2; the pre-038 schema fails X1 (its counters subquery)
  const noProj = gtmPlans(gtmDb({ drop: ["idx_transmission_lane"] }));
  ok(!noProj["X1 rows"][0] && !noProj["X2 kinds"][0] && !noProj["X1 rows ?eval=1"][0] && !noProj["X2 kinds ?eval=1"][0],
    `N · with idx_transmission_lane dropped, X1 and X2 FAIL their checks (the whole period of the project is walked) — ${noProj["X1 rows"][1]} || ${noProj["X2 kinds"][1]}`);
  const pre = gtmPlans(gtmDb({ pre038: true }));
  ok(!pre["X1 rows"][0], `N · the pre-038 schema FAILS the X1 check (the standing-counter subquery scans without idx_transmission_parent) — ${pre["X1 rows"][1]}`);
  // N3 · the rows: X1 and X2 equal a plain computation over the seeded rows; the seat scope holds
  const d = gtmDb();
  const all = d.prepare("SELECT id, lane, kind, route, decision, eval, project, parent, gaprefs, components, created_at FROM transmission").all();
  const NOT = ["counter", "critique", "rank", "restore"];
  const isRow = (t) => t.project === "alpha" && t.created_at >= from && String(t.lane || "").toLowerCase() === "gtm" && !NOT.includes(t.kind || "") && t.eval === 0;
  const standingOf = (id) => all.filter((c) => c.parent === id && ["counter", "critique"].includes(c.kind) && c.decision == null && c.eval === 0).length;
  const want = all.filter(isRow).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const got = d.prepare(GTM_ROWS_SQL(true, false)).all("alpha", from, 1, "p-owner", 201);
  const mism = got.filter((r) => r.standing !== standingOf(r.id));
  ok(want.length > 20 && got.length === Math.min(201, want.length) && got.every((r, i) => r.id === want[i].id) && mism.length === 0 && got.some((r) => r.standing > 0)
    && all.some((t) => t.project === "alpha" && t.lane === "gtm" && NOT.includes(t.kind)) && all.some((t) => t.project === "alpha" && t.lane === "gtm" && t.eval === 1),
    `N · X1 rows (the owner, alpha): ${got.length} of ${want.length} wanted, newest first, the same ids; no counter, rank, suite row or beta row among them; each standing count equal to a plain computation (${mism.length} mismatch(es); ${got.filter((r) => r.standing > 0).length} row(s) with standing counters)`);
  const wantK = new Map();
  for (const t of want) { const k = t.kind || ""; const w = wantK.get(k) || { n: 0, landed: 0 }; w.n++; if (t.route === "auto" || t.decision === "approve") w.landed++; wantK.set(k, w); }
  const gotK = d.prepare(GTM_KINDS_SQL(true, false)).all("alpha", from, 1, "p-owner");
  ok(gotK.length === wantK.size && gotK.every((r) => wantK.get(r.kind) && wantK.get(r.kind).n === r.n && wantK.get(r.kind).landed === r.landed),
    `N · X2 (the owner, alpha): ${gotK.map((r) => `${r.kind} ${r.n}/${r.landed}`).join(", ")} filed/landed per kind, each equal to a plain computation`);
  const seat = d.prepare(GTM_ROWS_SQL(true, false)).all("alpha", from, 0, "p-3", 201), notSeated = d.prepare(GTM_ROWS_SQL(true, false)).all("alpha", from, 0, "p-4", 201);
  const kNot = d.prepare(GTM_KINDS_SQL(true, false)).all("alpha", from, 0, "p-4");
  ok(seat.length === got.length && notSeated.length === 0 && kNot.length === 0, `N · the seat scope in the WHERE: p-3 (seated on alpha) reads ${seat.length} alpha gtm row(s); p-4 (seated on beta) reads ${notSeated.length} row(s) and ${kNot.length} kind row(s)`);

  // N4 · the real handler: GET /gtm (JSON) runs the goal tree, G1, X1, X2 and the template (the owner: the project's
  // name too); with no goal filed the tree, X1, X2 and the template
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const c = counting(d);
  let extraRead = null;   // the injection: a handler that runs G1 a second time
  const DB = { prepare(sql) { const st = c.DB.prepare(sql); if (sql !== extraRead) return st;
    const w = (a) => { const one = a ? st.bind(...a) : st; const again = () => (a ? c.DB.prepare(sql).bind(...a) : c.DB.prepare(sql));
      return { ...one, all: async () => { await again().all(); return one.all(); }, first: async () => { await again().first(); return one.first(); } }; };
    return { ...w(null), bind: (...a) => w(a) }; } };
  const seen = new Set();
  const DBseen = { prepare(sql) { seen.add(sql); return DB.prepare(sql); } };
  const tree = [{ id: "g-root", title: "The quarter", parent: null, dimensions: [] }, { id: "g-reach", title: "Reach", parent: "g-root", dimensions: ["gtm"], target: 5 }, { id: "g-ship", title: "Ship", parent: "g-root", dimensions: ["code"], target: 2 }];
  const withTree = (on) => seedTree(d, "alpha", on ? tree : null);   // the tree filed on alpha (k_goals), or none
  const files = () => ({});   // the R2 binding holds nothing the worker reads (the org is its D1 row)
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const BRAIN = { get: async (k) => (files()[k] != null ? r2obj(files()[k]) : null), head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const hit = async (path, key, accept = "application/json") => {
    const before = new Map([...seen].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, authorization: `Bearer ${key}` } }), { DB: DBseen, BRAIN }, ctx);
    const body = await r.text();
    const ran = new Map();
    for (const q of seen) { const k = c.n(q) - (before.get(q) || 0); if (k > 0) ran.set(q, k); }
    return { status: r.status, type: r.headers.get("content-type") || "", ran, body };
  };
  // measure(key, accept): the baseline is GET /versions in the SAME face (its JSON for the JSON, its page for the page: the
  // shell's own reads cancel out), so what is left is what the GTM read itself runs
  const measure = async (key, accept = "application/json") => {
    await hit("/versions", key, accept); await hit("/gtm", key, accept);   // warm the isolate's own caches
    const base = await hit("/versions", key, accept), page = await hit("/gtm", key, accept);
    const delta = [...page.ran].map(([q, k]) => [q, k - (base.ran.get(q) || 0)]).filter(([q, k]) => k > 0 && q !== OWNER_SQL);
    return { status: page.status, type: page.type, base: base.status, n: delta.reduce((a, [, k]) => a + k, 0), per: new Map(delta), body: page.body };
  };
  const G1 = GOALS_AGG_SQL(true, false), X1 = GTM_ROWS_SQL(true, false), X2 = GTM_KINDS_SQL(true, false);
  // the one-pass fix 9: the Strategy section's ONE bounded read (the docs under gtm/, a range of k_docs' primary key)
  const { GTM_STRATEGY_SQL: ST1 } = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "docs.js")).href);
  const TPL = (await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "store.js")).href)).selectSql("gtm");   // the project's template, k_gtm
  // sprint 3 D2 (B7): the Lists region's first read, the project's card kinds (ONE small statement, memoized per request); with
  // no kind naming GTM (this fixture files none) the region reads nothing more
  // D2b item 10: the Lists read only the kinds that name the tab (migrate-060's index), never every kind of the project
  const { TAB_KINDS_SQL: KM } = await imo(pathToFileURL(join(ENGINE, "src", "tablists.js")).href);
  for (const [who, key] of [["the owner", "owner-key"], ["a seat (p-3, alpha)", "key-3"]]) {
    const own = key === "owner-key" ? 1 : 0;   // the owner (seated nowhere) reads the project's name; a seat's rides its seat
    const nameOk = (x) => (x.per.get(PROJECT_NAME_SQL) || 0) === own;
    withTree(true);
    const m = await measure(key);
    let j = {}; try { j = JSON.parse(m.body); } catch { j = {}; }
    const rows = ((j.regions || {}).lanes || []).reduce((a, l) => a + (l.rows || []).length, 0);
    // sprint 2: X2's counts are X1's own rows while X1 is not cut at GTM_ROWS_LIMIT, so X2 does not run here
    ok(m.status === 200 && m.base === 200 && m.n === 6 + own && m.per.get(KM) === 1 && m.per.get(ST1) === 1 && m.per.get(GOAL_TREE_SQL) === 1 && m.per.get(G1) === 1 && m.per.get(X1) === 1 && !m.per.has(X2) && m.per.get(TPL) === 1 && nameOk(m) && j.declared === true && rows > 0 && (j.regions.metrics || []).length === 1 && j.regions.metrics[0].id === "g-reach",
      `N · GET /gtm as ${who} (real handler, JSON): ${m.n} D1 statement(s) beyond the baseline (GET /versions, JSON) and the memoized owner lookup, exactly the tree, G1 (the text GET /goals runs, once), X1 (X2 counted from its rows), the template, the Strategy read and the card kinds (the Lists)${own ? " and the project's name" : ""}; ${rows} row(s), metrics ${(j.regions && j.regions.metrics || []).map((x) => x.id).join(",")}`);
    withTree(false);
    const u = await measure(key);
    let uj = {}; try { uj = JSON.parse(u.body); } catch { uj = {}; }
    ok(u.status === 200 && u.n === 5 + own && u.per.get(KM) === 1 && u.per.get(ST1) === 1 && !u.per.has(G1) && u.per.get(GOAL_TREE_SQL) === 1 && u.per.get(X1) === 1 && !u.per.has(X2) && u.per.get(TPL) === 1 && nameOk(u) && uj.declared === false && (uj.regions || {}).metrics.length === 0,
      `N · GET /gtm as ${who} with no goal filed: ${u.n} D1 statement(s) beyond the baseline, exactly the tree, X1, the template, the Strategy read and the card kinds${own ? " and the name" : ""}, no G1`);
    withTree(true);
    extraRead = G1;
    const twice = await measure(key);
    extraRead = null;
    ok(twice.n === 7 + own, `N · the instrument (${who}): a handler reading G1 twice counts ${twice.n} beyond the baseline, one read too many, so the check above would go red`);
    // N5 · UI-B10b, the page: GET /gtm to a browser is the SAME read inside the shell (G1 exactly once), no G1 with no
    // goal filed; L4: the shell adds no statement of its own (the fill chip is gone)
    const pg = await measure(key, "text/html");
    ok(pg.status === 200 && /text\/html/.test(pg.type) && pg.base === 200 && pg.n === 6 + own && pg.per.get(KM) === 1 && pg.per.get(ST1) === 1 && pg.per.get(G1) === 1 && pg.per.get(TPL) === 1 && pg.per.get(X1) === 1 && !pg.per.has(X2) && nameOk(pg) && /data-region="lanes"/.test(pg.body),
      `N · the GTM page as ${who} (real handler, HTML): ${pg.n} D1 statement(s) beyond the /versions page baseline and the memoized owner lookup, the tree, G1 exactly once, X1, the template, the Strategy read and the card kinds${own ? " and the name" : ""} (no fill chip since L4); the page draws its lanes`);
    withTree(false);
    const pu = await measure(key, "text/html");
    ok(pu.status === 200 && /text\/html/.test(pu.type) && pu.n === 5 + own && !pu.per.has(G1),   // L4: no fill chip
      `N · the GTM page as ${who} with no goal filed: ${pu.n} D1 statement(s) beyond the /versions page, no G1`);
    withTree(true);
    extraRead = G1;
    const ptwice = await measure(key, "text/html");
    extraRead = null;
    ok(ptwice.n === 7 + own, `N · the instrument (${who}, the page): a handler reading G1 twice counts ${ptwice.n} beyond the /versions page, one read too many, so the page check above would go red`);
  }
}

// ---- O · UI-B11a, Broadcast: GET /broadcast in ONE statement (BROADCAST_SQL) ----
{
  const { BROADCAST_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  // A's seeded DB plus projects alpha and beta (active) and gamma (inactive); p-3 seated on alpha, p-4 on beta and gamma.
  // 120 rows of the three kinds on top of A's 800: item k by p-(k % 6), in alpha when k is even (else beta), slug s-(k % 10),
  // a suite row when k % 7 = 0; a publish of every third item; an equip of every publish into alpha, beta and gamma in turn
  const bcDb = ({ drop = [] } = {}) => {
    const d = seeded();
    for (const i of drop) d.exec(`DROP INDEX ${i}`);
    d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z'),('gamma','Gamma',0,'2026-09-01T00:00:00Z')");
    const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
    S.run("p-3", "alpha", "member", "2026-09-01T00:00:00Z"); S.run("p-4", "beta", "member", "2026-09-01T00:00:00Z"); S.run("p-4", "gamma", "member", "2026-09-01T00:00:00Z");
    const X = d.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,gaprefs,proof,parent,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
    const at = (n) => new Date(Date.UTC(2026, 8, 20) + n * 60000).toISOString();
    let n = 0, e = 0;
    for (let k = 0; k < 60; k++) {
      const item = `B-item-${k}`, ev = k % 7 === 0 ? 1 : 0;
      X.run(item, `p-${k % 6}`, "leader", "item", `kit ${k}`, "a kit", ["skill", "agent", "workflow"][k % 3], `item/s-${k % 10}`, "https://src.example/" + k, null, "auto", "routed", ev, k % 2 ? "beta" : "alpha", at(n++));
      if (k % 3) continue;
      const pub = `B-pub-${k}`;
      X.run(pub, `p-${k % 6}`, "leader", "publish", "published", "a press", "skill", `item/s-${k % 10}`, null, item, "auto", "routed", ev, k % 2 ? "beta" : "alpha", at(n++));
      X.run(`B-eq-${k}`, `p-${(k + 1) % 6}`, "leader", "equip", "equipped", "a press", "skill", `item/s-${k % 10}`, null, pub, "auto", "routed", ev, ["alpha", "beta", "gamma"][e++ % 3], at(n++));
    }
    return d;
  };
  const noScanTx = (p) => !bareScan(p, "transmission") && !bareScan(p, "t") && !/SCAN transmission\b/.test(p) && !/idx_transmission_eval_created/.test(p);
  const bcPlans = (d, sqlOf = BROADCAST_SQL) => {
    const r = {};
    for (const ev of [false, true]) {
      const p = plan(d, sqlOf(ev), [0, "p-3", 2001, "p-3"]);
      const want = ev ? /SEARCH t USING INDEX idx_transmission_kind_eval \(kind=\?\)/ : /SEARCH t USING INDEX idx_transmission_kind_eval \(kind=\? AND eval=\?\)/;
      r[`the shelf read${ev ? " ?eval=1" : ""}`] = [want.test(p) && /SEARCH s USING COVERING INDEX sqlite_autoindex_project_seats_1 \(person_id=\?\)/.test(p)
        && /SEARCH p USING INDEX sqlite_autoindex_people_1 \(id=\?\)/.test(p) && noScanTx(p), p];
    }
    return r;
  };
  for (const [k, [pass, p]] of Object.entries(bcPlans(bcDb()))) ok(pass, `O · Broadcast ${k}: SEARCHes idx_transmission_kind_eval, the seats and people by key, never SCANs transmission nor walks idx_transmission_eval_created — ${p}`);
  // O2 · the instrument: idx_transmission_kind_eval dropped fails both; the ORDER BY without its unary + fails the default read
  const noKind = bcPlans(bcDb({ drop: ["idx_transmission_kind_eval"] }));
  ok(!noKind["the shelf read"][0] && !noKind["the shelf read ?eval=1"][0], `O · with idx_transmission_kind_eval dropped, the read FAILS its check — ${noKind["the shelf read"][1]}`);
  const noPlus = bcPlans(bcDb(), (ev) => BROADCAST_SQL(ev).replace("ORDER BY +t.created_at", "ORDER BY t.created_at"));
  ok(BROADCAST_SQL(false).includes("ORDER BY +t.created_at") && !noPlus["the shelf read"][0], `O · written without the ORDER BY's unary +, the default read FAILS its check (the planner walks idx_transmission_eval_created) — ${noPlus["the shelf read"][1]}`);
  // O3 · the rows equal a plain computation over the seeded rows
  const d = bcDb();
  const all = d.prepare("SELECT id, kind, submitter, project, eval FROM transmission WHERE kind IN ('item','publish','equip')").all();
  const active = new Set(["alpha", "beta"]);
  const seatsOf = { "p-3": ["alpha"], "p-4": ["beta"], "p-owner": [] };
  const want = (rid, owner, ev) => all.filter((t) => (ev || t.eval === 0) && (t.kind !== "equip" || (owner ? active.has(t.project) : seatsOf[rid].includes(t.project)))).map((t) => t.id).sort();
  const got = (rid, owner, ev) => { const rows = d.prepare(BROADCAST_SQL(ev)).all(owner ? 1 : 0, rid, 2001, rid); return { ids: rows.filter((r) => r.kind !== "seat").map((r) => r.id).sort(), seats: rows.filter((r) => r.kind === "seat").map((r) => r.project).sort() }; };
  const cases = [["the owner", "p-owner", true, false], ["the owner, ?eval=1", "p-owner", true, true], ["p-3 (alpha)", "p-3", false, false], ["p-4 (beta; gamma inactive)", "p-4", false, false]];
  const res = cases.map(([label, rid, owner, ev]) => { const g = got(rid, owner, ev), w = want(rid, owner, ev); return { label, ok: JSON.stringify(g.ids) === JSON.stringify(w) && JSON.stringify(g.seats) === JSON.stringify(seatsOf[rid]), n: g.ids.length, eq: g.ids.filter((x) => x.startsWith("B-eq-")).length, seats: g.seats }; });
  ok(res.every((x) => x.ok) && all.some((t) => t.kind === "equip" && t.project === "gamma") && all.some((t) => t.eval === 1) && res[0].eq > res[2].eq,
    `O · the rows equal a plain computation: ${res.map((x) => `${x.label} ${x.n} rows (${x.eq} equips, seats [${x.seats.join(",")}])`).join(" · ")}; an inactive project's equip and every suite row are out by default`);

  // O4 · the real handler: GET /broadcast (JSON) runs BROADCAST_SQL, nothing more
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const c = counting(d);
  let extraRead = null;   // the injection: a handler that runs the shelf read a second time
  const DB = { prepare(sql) { const st = c.DB.prepare(sql); if (sql !== extraRead) return st;
    const w = (a) => { const one = a ? st.bind(...a) : st; const again = () => (a ? c.DB.prepare(sql).bind(...a) : c.DB.prepare(sql));
      return { ...one, all: async () => { await again().all(); return one.all(); }, first: async () => { await again().first(); return one.first(); } }; };
    return { ...w(null), bind: (...a) => w(a) }; } };
  const seen = new Set();
  const DBseen = { prepare(sql) { seen.add(sql); return DB.prepare(sql); } };
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const hit = async (path, key) => {
    const before = new Map([...seen].map((q) => [q, c.n(q)]));
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept: "application/json", authorization: `Bearer ${key}` } }), { DB: DBseen, BRAIN }, ctx);
    const body = await r.text();
    const ran = new Map();
    for (const q of seen) { const k = c.n(q) - (before.get(q) || 0); if (k > 0) ran.set(q, k); }
    return { status: r.status, ran, body };
  };
  const measure = async (key, path = "/broadcast") => {
    await hit("/versions", key); await hit(path, key);   // warm the isolate's own caches
    const base = await hit("/versions", key), got = await hit(path, key);
    const delta = [...got.ran].map(([q, k]) => [q, k - (base.ran.get(q) || 0)]).filter(([q, k]) => k > 0 && q !== OWNER_SQL);
    return { status: got.status, base: base.status, n: delta.reduce((a, [, k]) => a + k, 0), per: new Map(delta), body: got.body };
  };
  for (const [who, key] of [["the owner", "owner-key"], ["a seat (p-3, alpha)", "key-3"]]) {
    const own = key === "owner-key" ? 1 : 0;   // the owner (seated nowhere) reads the project's name; a seat's rides its seat
    const m = await measure(key);
    let j = {}; try { j = JSON.parse(m.body); } catch { j = {}; }
    ok(m.status === 200 && m.base === 200 && m.n === 1 + own && m.per.get(BROADCAST_SQL(false)) === 1 && (m.per.get(PROJECT_NAME_SQL) || 0) === own && Array.isArray((j.regions || {}).shelf) && j.regions.shelf.length > 0 && !j.live && j.project && j.project.name === "Alpha",
      `O · GET /broadcast as ${who} (real handler, JSON): ${m.n} D1 statement(s) beyond the baseline (GET /versions, JSON) and the memoized owner lookup, exactly BROADCAST_SQL${own ? " and the project's name" : ""} (at most two allowed); the shelf holds ${((j.regions || {}).shelf || []).length} slug(s)`);
    const me = await measure(key, "/broadcast?eval=1");
    ok(me.status === 200 && me.n === 1 + own && me.per.get(BROADCAST_SQL(true)) === 1, `O · GET /broadcast?eval=1 as ${who}: ${me.n} statement(s) beyond the baseline, exactly BROADCAST_SQL with suite rows${own ? " and the name" : ""}`);
    extraRead = BROADCAST_SQL(false);
    const twice = await measure(key);
    extraRead = null;
    ok(twice.n === 2 + own, `O · the instrument (${who}): a handler reading BROADCAST_SQL twice counts ${twice.n} beyond the baseline, so the check above would go red`);
  }

  // O5 · sprint 2, Broadcast's live picture: BROADCAST_LIVE_SQL (the page's first paint) and BROADCAST_POLL_SQL (the poll) walk
  // the project's range of idx_transmission_project (project, created_at) from the cutoff, people and k_goals by primary key,
  // never a SCAN of transmission and never idx_transmission_eval_created; GET /broadcast/live runs exactly ONE statement
  // beyond the baseline (the page's, or the poll's with ?since=), and the instrument (the index dropped) goes red
  const { BROADCAST_LIVE_SQL, BROADCAST_POLL_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  const livePlans = (dd) => {
    const r = {};
    for (const [name, sqlOf] of [["the picture", BROADCAST_LIVE_SQL], ["the poll", BROADCAST_POLL_SQL]]) for (const ev of [false, true]) {
      const p = plan(dd, sqlOf(ev), ["alpha", "2026-09-24T00:00:00.000Z", "2026-09-24T00:00:00.000Z", 201]);
      r[`${name}${ev ? " ?eval=1" : ""}`] = [/SEARCH t USING INDEX idx_transmission_project \(project=\? AND created_at>\?\)/.test(p)
        && /SEARCH p USING INDEX sqlite_autoindex_people_1 \(id=\?\)/.test(p) && /SEARCH g USING INDEX sqlite_autoindex_k_goals_1 \(project=\? AND id=\?\)/.test(p)
        && !/USE TEMP B-TREE FOR ORDER BY/.test(p) && noScanTx(p), p];
    }
    return r;
  };
  for (const [k, [pass, p]] of Object.entries(livePlans(bcDb()))) ok(pass, `O5 · Broadcast's live picture, ${k}: SEARCHes idx_transmission_project from the cutoff in order (no sort), people and k_goals by key, never SCANs transmission — ${p}`);
  const noProj = livePlans(bcDb({ drop: ["idx_transmission_project"] }));
  ok(!noProj["the picture"][0] && !noProj["the poll"][0], `O5 · the instrument: with idx_transmission_project dropped, both FAIL their check — ${noProj["the picture"][1]}`);
  for (const [who, key] of [["the owner", "owner-key"], ["a seat (p-3, alpha)", "key-3"]]) {
    const m = await measure(key, "/broadcast/live?project=alpha");
    const mp = await measure(key, "/broadcast/live?project=alpha&since=2026-09-30T00%3A00%3A00.000Z");
    let j = {}; try { j = JSON.parse(m.body); } catch { j = {}; }
    // the owner naming a project they hold no seat on pays the scope seam's own primary-key lookup (section P2), never Broadcast's
    const scope = "SELECT key FROM projects WHERE key = ? AND active = 1 AND org = 1", own = key === "owner-key" ? 1 : 0;
    ok(m.status === 200 && m.n === 1 + own && (m.per.get(scope) || 0) === own && m.per.get(BROADCAST_LIVE_SQL(false)) === 1 && mp.status === 200 && mp.n === 1 + own && mp.per.get(BROADCAST_POLL_SQL(false)) === 1
      && j.project && j.project.key === "alpha" && Array.isArray(j.dots) && j.days === 7,
      `O5 · GET /broadcast/live as ${who} (real handler): ${m.n} statement(s) beyond the baseline, exactly BROADCAST_LIVE_SQL${own ? " and the scope's own project lookup" : ""}; with ?since= ${mp.n}, exactly BROADCAST_POLL_SQL`);
  }
}

// ---- P · U-MCP (batch:mcp-project-scope, Q0D506BBC): naming the project costs nothing for a seated reader ----------------
// A's seeded DB plus projects alpha and beta (active, in key order), gamma (inactive) and delta (active);
// p-3 is seated on beta ONLY (the org's SECOND project by key), p-4 on alpha and beta. Through the real
// handler (POST /mcp tools/call and resources/read, GET /home/summary), every statement of every request is logged in order:
//   P1 · p-3's home, goals and build naming beta run EXACTLY the statements the same call with no project runs (the seam's
//        default IS beta, the seats are memoized: +0);
//   P2 · the owner naming delta (an active project the owner holds no seat on) runs at most ONE statement beyond naming none
//        (doorProject's primary-key lookup);
//   P3 · resources/read brain://goals?project=beta runs exactly what the goals tool naming beta runs;
//   P4 · GET /home/summary?project=beta runs exactly what GET /home/summary runs;
//   P5 · the seats statement (projectSeatsFor's) runs EXACTLY once per request: home, state, holes, goals, decisions,
//        map naming beta, the GET twin and the resource (src/core.js seatsOnce, D9);
//   P6 · p-3 naming alpha is refused project_forbidden and the refusal reads no filing (no statement touches transmission);
//   the instruments: a handler reading the seats twice goes red on P5; the owner's lookup read twice goes red on P2; and the
//   statement-for-statement comparison sees one statement (the owner naming delta vs none differs).
{
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z'),('gamma','Gamma',0,'2026-09-01T00:00:00Z'),('delta','Delta',1,'2026-09-01T00:00:00Z')");
  const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
  S.run("p-3", "beta", "member", "2026-09-01T00:00:00Z"); S.run("p-4", "alpha", "member", "2026-09-01T00:00:00Z"); S.run("p-4", "beta", "member", "2026-09-01T00:00:00Z");
  const SEATS = "SELECT s.project_key AS key";   // projectSeatsFor's own statement (src/core.js)
  let extraRead = null;   // the injection: a handler that runs one statement (by prefix) a second time
  const log = [];
  const DB = { prepare(sql) {
    const st = d.prepare(sql);
    const w = (a) => { const once = () => { log.push(sql); if (extraRead && sql.startsWith(extraRead)) log.push(sql); };
      return { first: async () => { once(); return st.get(...a) ?? null; }, all: async () => { once(); return { results: st.all(...a) }; }, run: async () => { once(); return { meta: { changes: st.run(...a).changes } }; } }; };
    return { ...w([]), bind: (...a) => w(a) }; } };
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const req = async (path, key, { body = null, accept = "application/json" } = {}) => {
    const from = log.length;
    const r = await handler.fetch(new Request(`https://org.test${path}`, { method: body ? "POST" : "GET", headers: { accept, authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }), { DB, BRAIN }, ctx);
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { j = null; }
    return { status: r.status, j, d1: log.slice(from) };
  };
  const tool = async (key, name, args) => { const r = await req("/mcp", key, { body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
    let v = null; try { v = JSON.parse(r.j.result.content[0].text); } catch { v = null; } return { ...r, isError: !!(r.j && r.j.result && r.j.result.isError), v }; };
  const resource = async (key, uri) => { const r = await req("/mcp", key, { body: { jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri } } }); return { ...r, error: r.j && r.j.error }; };
  const bag = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return m; };
  const sameBag = (a, b) => { const A = bag(a), B = bag(b); return A.size === B.size && [...A].every(([k, n]) => B.get(k) === n); };
  const seatsN = (d1) => d1.filter((q) => q.startsWith(SEATS)).length;
  await tool("key-3", "home", {}); await tool("owner-key", "home", {});   // warm the isolate's own caches (the project-count memo)
  const measure = async () => {
    const o = { p1: {}, p2: {}, seats: {} };
    for (const t of ["home", "goals", "build"]) {
      o.p1[t] = { with: await tool("key-3", t, { project: "beta" }), without: await tool("key-3", t, {}) };
      o.p2[t] = { none: await tool("owner-key", t, {}), delta: await tool("owner-key", t, { project: "delta" }) };
    }
    o.p3 = { res: await resource("key-3", "brain://goals?project=beta"), tool: await tool("key-3", "goals", { project: "beta" }) };
    o.p4 = { with: await req("/home/summary?project=beta", "key-3"), without: await req("/home/summary", "key-3") };
    for (const t of ["home", "updates", "missing", "goals", "decisions", "map"]) o.seats[t] = await tool("key-3", t, { project: "beta", ...(t === "map" ? { plane: "arch" } : {}) });
    o.seats["GET /home/summary?project=beta"] = o.p4.with; o.seats["brain://goals?project=beta"] = o.p3.res;
    o.p6 = await tool("key-3", "home", { project: "alpha" });
    return o;
  };
  const o = await measure();
  for (const t of ["home", "goals", "build"]) {
    const { with: w, without: wo } = o.p1[t];
    ok(!w.isError && !wo.isError && sameBag(w.d1, wo.d1), `P1 · p-3 (seated on beta only) calling ${t} naming beta runs the same ${w.d1.length} statement(s) as with no project (${wo.d1.length}): +0 for a seated reader`);
    const { none, delta } = o.p2[t];
    ok(!none.isError && !delta.isError && delta.d1.length - none.d1.length <= 1, `P2 · the owner naming delta (active, no seat) on ${t}: ${delta.d1.length - none.d1.length} statement(s) beyond naming none (at most one)`);
  }
  ok(!o.p3.res.error && !o.p3.tool.isError && sameBag(o.p3.res.d1, o.p3.tool.d1), `P3 · brain://goals?project=beta runs the same ${o.p3.res.d1.length} statement(s) as the goals tool naming beta (${o.p3.tool.d1.length})`);
  ok(o.p4.with.status === 200 && o.p4.without.status === 200 && sameBag(o.p4.with.d1, o.p4.without.d1), `P4 · GET /home/summary?project=beta runs the same ${o.p4.with.d1.length} statement(s) as GET /home/summary (${o.p4.without.d1.length})`);
  const sn = Object.entries(o.seats).map(([t, r]) => [t, seatsN(r.d1)]);
  ok(Object.values(o.seats).every((r) => !r.isError || (r.v && r.v.error !== undefined && !/unknown tool/.test(JSON.stringify(r.v)))) && sn.every(([, n]) => n === 1), `P5 · the seats statement runs exactly once per request: ${sn.map(([t, n]) => `${t} ${n}`).join(" · ")}`);
  ok(o.p6.isError && o.p6.v && o.p6.v.error === "project_forbidden" && JSON.stringify(o.p6.v.seats) === '["beta"]' && !o.p6.d1.some((q) => /\btransmission\b/.test(q)),
    `P6 · p-3 naming alpha: project_forbidden with seats ["beta"], and the refusal reads no filing (${o.p6.d1.length} statement(s), none on transmission)`);
  // the instruments
  const own = o.p2.home;
  ok(!sameBag(own.delta.d1, own.none.d1), "P · the instrument: the statement-for-statement comparison sees ONE statement (the owner naming delta vs none differs), so P1/P3/P4 could go red");
  extraRead = SEATS;
  const twice = await measure();
  extraRead = "SELECT key FROM projects WHERE key = ? AND active = 1 AND org = 1";
  const lookup2 = await measure();
  extraRead = null;
  ok(Object.values(twice.seats).every((r) => seatsN(r.d1) === 2), `P · the instrument: a handler reading the seats twice counts ${Object.values(twice.seats).map((r) => seatsN(r.d1)).join("/")} seats statements, so P5 would go red`);
  ok(["home", "goals", "build"].some((t) => lookup2.p2[t].delta.d1.length - lookup2.p2[t].none.d1.length > 1), "P · the instrument: an owner's project lookup read twice runs two statements beyond naming none, so P2 would go red");
}

// ---- Q · U-MCP-tail-a (QE6B9CEBA Fork 1 (1), measured): what waits on the owner is the project's owner-owed open questions, read ---
// with ONE overlay statement (src/core.js ownerOwedOnce -> src/decisions.js ownerOwed), ONCE per request (reqMemo). Sprint 2 (the
// live budget): that statement is OWNER_OWED_LIVE_SQL, the answers on the open questions only, unless the request already read
// a whole overlay (Home's OPEN_LIVE_SQL, the Decisions page's DECISIONS_LIVE_SQL), which the badge reuses.
// Through the real handler, questions filed in D1 vs none (the same seeded DB, the same requests):
//   Q1 · the owner's GET /updates runs exactly ONE statement more — OWNER_OWED_LIVE_SQL(false) — and the MCP updates too;
//   Q2 · a member's GET /updates runs exactly ONE more too: the project's picture lists the owner-owed rows for everyone
//        (blockers), while what waits on the member (waitingOnYou.blockers) stays [];
//   Q3 · the MCP `updates` tool (a member, naming beta) runs exactly ONE more and lists the owner-owed rows;
//   Q4 · the owner's GET /home page (Home's own S3 + the shell badge's blockers) runs Home's open-question overlay ONCE and the
//        badge's own statement never (it reuses Home's);
//   the instrument: a handler reading the overlay twice goes red on Q1 and Q4.
{
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const fx = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "decisions-pack.mjs")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z')");
  const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
  S.run("p-3", "beta", "member", "2026-09-01T00:00:00Z");
  const LIVE = OWNER_OWED_LIVE_SQL(false), OPEN = OPEN_LIVE_SQL(false);
  let extraRead = null;   // a Set of statements the injected handler reads twice
  const log = [];
  const DB = { prepare(sql) {
    const st = d.prepare(sql);
    const w = (a) => { const once = () => { log.push(sql); if (extraRead && extraRead.has(sql)) log.push(sql); };
      return { first: async () => { once(); return st.get(...a) ?? null; }, all: async () => { once(); return { results: st.all(...a) }; }, run: async () => { once(); return { meta: { changes: st.run(...a).changes } }; } }; };
    return { ...w([]), bind: (...a) => w(a) }; } };
  const files = {};   // the R2 binding holds nothing the worker reads (the org is its D1 row)
  // `pack` is now "questions filed": each project's questions (the decisions fixture, in alpha and in beta) are in k_questions, or none are
  const filed = (on) => { d.exec("DELETE FROM k_options; DELETE FROM k_questions"); if (on) for (const p of ["alpha", "beta"]) fx.seedQuestions(d, p, fx.ROWS, "p-owner"); };
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const brainWith = () => ({ get: async (k) => (files[k] != null ? r2obj(files[k]) : null), head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} });
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const req = async (path, key, pack, { body = null, accept = "application/json" } = {}) => {
    filed(pack);
    const from = log.length;
    const r = await handler.fetch(new Request(`https://org.test${path}`, { method: body ? "POST" : "GET", headers: { accept, authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }), { DB, BRAIN: brainWith(pack) }, ctx);
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { j = null; }
    return { status: r.status, j, text, d1: log.slice(from) };
  };
  const tool = async (key, name, args, pack) => { const r = await req("/mcp", key, pack, { body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
    let v = null; try { v = JSON.parse(r.j.result.content[0].text); } catch { v = null; } return { ...r, v }; };
  const lives = (r) => r.d1.filter((q) => q === LIVE).length;
  const rest = (r) => r.d1.filter((q) => q !== LIVE).sort().join("\n");
  const measure = async () => {
    const o = {};
    for (const pack of [false, true]) { await req("/updates", "owner-key", pack); await req("/updates", "key-3", pack); }   // warm the isolate's caches
    o.hbO = { none: await req("/updates", "owner-key", false), pack: await req("/updates", "owner-key", true) };
    o.hbOmcp = { none: await tool("owner-key", "updates", {}, false), pack: await tool("owner-key", "updates", {}, true) };
    o.hbM = { none: await req("/updates", "key-3", false), pack: await req("/updates", "key-3", true) };
    o.stM = { none: await tool("key-3", "updates", { project: "beta" }, false), pack: await tool("key-3", "updates", { project: "beta" }, true) };
    o.homeO = await req("/home", "owner-key", true, { accept: "text/html" });
    // sprint 8, 8.3b: the pages that draw no menu (Control, Activity) — the badge's blockers alone read the open questions there
    o.ctlO = await req("/control?project=beta", "owner-key", true, { accept: "text/html" });
    o.audO = await req("/audit?project=beta", "owner-key", true, { accept: "text/html" });
    return o;
  };
  const o = await measure();
  const owedN = fx.ROWS.filter((r) => r.status === "open" && r.whoOwes === "owner").length;
  // B1 (sprint 5, D5L's named cut): the updates path reads the open questions WITHOUT their options — the LITE
  // statement, whose plan never touches k_options — while /home keeps the full read (its choices need the menu).
  const kq = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "decisions.js")).href);
  const LITE = kq.OPEN_QUESTION_LITE_SQL, FULL = kq.OPEN_QUESTION_ROWS_SQL;
  const liteN = (r) => r.d1.filter((q) => q === LITE).length, fullN = (r) => r.d1.filter((q) => q === FULL).length;
  const planOf = (sql) => d.prepare("EXPLAIN QUERY PLAN " + sql).all("beta").map((r) => r.detail).join(" | ");
  ok(liteN(o.hbO.pack) === 1 && fullN(o.hbO.pack) === 0 && liteN(o.hbM.pack) === 1 && fullN(o.hbM.pack) === 0,
    `B1 · updates reads the open questions LITE (owner ${liteN(o.hbO.pack)}/${fullN(o.hbO.pack)} lite/full, member ${liteN(o.hbM.pack)}/${fullN(o.hbM.pack)})`);
  ok(!/k_options/.test(planOf(LITE)) && /k_options/.test(planOf(FULL)) && /idx_k_questions_status/.test(planOf(LITE)),
    `B1 · the LITE plan never touches k_options and stays on the (project, status) index: ${planOf(LITE)}`);
  ok(fullN(o.homeO) + o.homeO.d1.filter((q) => q === OPEN).length >= 1 && liteN(o.homeO) === 0,
    `B1 · /home keeps the full open read (lite ${liteN(o.homeO)} on the page)`);
  // sprint 8, 8.3b (PLATFORM §3, the pages' blockers read): every page's badge reads the open questions LITE (owedBy reads no
  // option), reusing a page's own full read where it made one — so a page that draws no menu reads no k_options row for the
  // badge, and Home reads the open questions once, in full
  ok([o.ctlO, o.audO].every((r) => r.status === 200 && liteN(r) === 1 && fullN(r) === 0),
    `B1 · Control and Activity: the badge reads the open questions LITE, never the full menus (Control ${liteN(o.ctlO)}/${fullN(o.ctlO)}, Activity ${liteN(o.audO)}/${fullN(o.audO)} lite/full; HTTP ${o.ctlO.status}, ${o.audO.status})`);
  ok(fullN(o.homeO) === 1, `B1 · /home reads the full open rows ONCE, for its choices and the badge together (${fullN(o.homeO)})`);
  ok(o.hbO.pack.status === 200 && lives(o.hbO.none) === 0 && lives(o.hbO.pack) === 1 && o.hbO.pack.d1.length - o.hbO.none.d1.length === 1 && rest(o.hbO.pack) === rest(o.hbO.none)
    && Array.isArray(o.hbO.pack.j.waitingOnYou.blockers) && o.hbO.pack.j.waitingOnYou.blockers.length === owedN,
    `Q1 · the owner's GET /updates: ${o.hbO.pack.d1.length} statement(s) with questions filed, ${o.hbO.none.d1.length} with none — exactly one more, the open questions' answers (${o.hbO.pack.j && o.hbO.pack.j.waitingOnYou.blockers.length} owner-owed row(s))`);
  ok(lives(o.hbOmcp.pack) === 1 && o.hbOmcp.pack.d1.length - o.hbOmcp.none.d1.length === 1 && o.hbOmcp.pack.v && o.hbOmcp.pack.v.waitingOnYou.blockers.length === owedN,
    `Q1 · the owner's MCP updates: exactly one more (${o.hbOmcp.pack.d1.length} vs ${o.hbOmcp.none.d1.length})`);
  ok(o.hbM.pack.status === 200 && lives(o.hbM.pack) === 1 && o.hbM.pack.d1.length - o.hbM.none.d1.length === 1 && JSON.stringify(o.hbM.pack.j.waitingOnYou.blockers) === "[]" && o.hbM.pack.j.blockers.length === owedN,
    `Q2 · a member's GET /updates runs exactly one more statement with questions filed (${o.hbM.pack.d1.length} vs ${o.hbM.none.d1.length}): the project's blockers, read once; nothing waits on the member`);
  ok(lives(o.stM.pack) === 1 && o.stM.pack.d1.length - o.stM.none.d1.length === 1 && o.stM.pack.v && o.stM.pack.v.blockers.length === owedN,
    `Q3 · a member's MCP updates naming beta: exactly one more (${o.stM.pack.d1.length} vs ${o.stM.none.d1.length}), listing the ${owedN} owner-owed row(s)`);
  const opens = (r) => r.d1.filter((q) => q === OPEN).length;
  ok(o.homeO.status === 200 && opens(o.homeO) === 1 && lives(o.homeO) === 0 && !o.homeO.d1.includes(DECISIONS_LIVE_SQL(false)),
    `Q4 · the owner's GET /home page reads the open questions' overlay once for Home and the badge together -> ${opens(o.homeO)} (the badge's own: ${lives(o.homeO)})`);
  extraRead = new Set([LIVE, OPEN]);
  const twice = await measure();
  extraRead = null;
  ok(twice.hbO.pack.d1.length - twice.hbO.none.d1.length === 2 && opens(twice.homeO) === 2, `Q · the instrument: a handler reading the overlay twice counts ${twice.hbO.pack.d1.length - twice.hbO.none.d1.length} more on the heartbeat and ${opens(twice.homeO)} on /home, so Q1 and Q4 would go red`);
}

// ---- R · U-MCP-tail-b (QE6B9CEBA D7 + D4, measured): the reads that read the raw stamp now read the scope ----------------
// A's seeded DB plus projects alpha, beta (active), gamma (ARCHIVED) and delta (active);
// p-3 is seated on beta only, p-5 nowhere. Through the real handler every statement is logged with its bound arguments:
//   R1 · the reads U-MCP left on the raw stamp — the owner's brief of their items (briefFor's pending rulings, GET /updates) and GET
//        /missing (sprint 3: the checklist's meter, src/hotsql.js CHECKLIST_SQL) — carry the
//        scope, captured from the run (never hand-typed): p-3 (a key, no stamp) binds `project = 'beta'`, p-5 (seated nowhere)
//        `project IS NULL` (and GET /missing reads nothing at all: a project's knowledge is never read org-wide), the owner
//        naming beta `project = 'beta'`; each captured statement is EXPLAINed and SEARCHes an index (it never SCANs
//        transmission bare);
//   R2 · D7 adds no statement: p-3's and p-5's requests run the same statements, the project clause aside (+0; GET /missing:
//        the scoped read's one statement aside);
//   R3 · D4 costs the owner at most ONE statement and nobody else any: an owner session stamped on delta (active, no seat)
//        reads delta and runs the active-keys statement (activeKeysOnce) exactly once, no more statements than an unstamped
//        owner session (whose default reads the same memo); stamped on gamma (archived) it reads the default, the same count;
//        p-3's session stamped on beta (a seat) runs the active-keys statement zero times;
//   the instruments: the active-keys statement read twice goes red on R3; a clause-less statement (org-wide) goes red on R1.
{
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z'),('gamma','Gamma',0,'2026-09-01T00:00:00Z'),('delta','Delta',1,'2026-09-01T00:00:00Z')");
  d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)").run("p-3", "beta", "member", "2026-09-01T00:00:00Z");
  d.exec("UPDATE transmission SET project = CASE WHEN rowid % 3 = 0 THEN 'alpha' WHEN rowid % 3 = 1 THEN 'beta' ELSE NULL END");
  d.exec("UPDATE transmission SET components = 'c-' || (rowid % 7) WHERE rowid % 2 = 0");
  d.exec("UPDATE transmission SET kind = 'question', status = 'received' WHERE rowid % 9 = 0");
  const TK = d.prepare("INSERT INTO tokens (token_hash,person_id,device,created_at,expires_at,revoked,project,org) VALUES (?,?,?,?,?,?,?,1)");
  for (const [k, who, proj] of [["s-o-delta", "p-owner", "delta"], ["s-o-gamma", "p-owner", "gamma"], ["s-o-none", "p-owner", null], ["s-3-beta", "p-3", "beta"]])
    TK.run(sha(k), who, "d1hot", "2026-09-01T00:00:00Z", "2099-01-01T00:00:00Z", 0, proj);
  const ACTIVE_KEYS = "SELECT key FROM projects WHERE active = 1 AND org = 1 ORDER BY slug";   // activeKeysOnce's own statement (src/core.js), org 1's
  let extraRead = null;
  const log = [];
  const DB = { prepare(sql) {
    const st = d.prepare(sql);
    const w = (a) => { const once = () => { if (VERSION_READS.has(sql)) return; log.push({ sql, a }); if (extraRead && sql === extraRead) log.push({ sql, a }); };   // the shell's version head: section J's
      return { first: async () => { once(); return st.get(...a) ?? null; }, all: async () => { once(); return { results: st.all(...a) }; }, run: async () => { once(); return { meta: { changes: st.run(...a).changes } }; } }; };
    return { ...w([]), bind: (...a) => w(a) }; } };
  const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const req = async (path, key, { body = null, accept = "application/json" } = {}) => {
    const from = log.length;
    const r = await handler.fetch(new Request(`https://org.test${path}`, { method: body ? "POST" : "GET", headers: { accept, authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }), { DB, BRAIN }, ctx);
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { j = null; }
    return { status: r.status, j, text, d1: log.slice(from) };
  };
  const tool = async (key, name, args) => { const r = await req("/mcp", key, { body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
    let v = null; try { v = JSON.parse(r.j.result.content[0].text); } catch { v = null; } return { ...r, v }; };
  // the four sites' statements, picked out of the run by what they read (never by the clause under test)
  const SITES = {
    "the brief's pending rulings": (q) => /t\.route='owner' AND t\.status != 'closed'/.test(q.sql),
    "/missing": (q) => q.sql === CHECKLIST_SQL,   // sprint 3 (B3): What is missing reads the checklist; its meter binds the project (D2b: then the reader's keys)
  };
  // the checklist's other reads (the first missing things, the open questions, the owed set) bind the same project; they read
  // nothing at the org level either, so R2 sets them aside with the meter
  const CHECKLIST_READS = new Set([CHECKLIST_SQL, CHECKLIST_FIRSTS_SQL, OPEN_QUESTION_ROWS_SQL, OWNER_OWED_LIVE_SQL(false), OWNER_OWED_LIVE_SQL(true)]);
  // (D2b: the checklist's reads bind the project FIRST, ?1, and the reader's keys after it: their project is the first bind)
  const clauseOf = (q) => (/project = \?1/.test(q.sql) && (q.sql === CHECKLIST_SQL || q.sql === CHECKLIST_FIRSTS_SQL) ? "eq:" + q.a[0]
    : /project = \?/.test(q.sql) ? "eq:" + q.a[q.a.length - 1] : /project IS NULL/.test(q.sql) ? "null" : "none");
  const norm = (d1) => d1.map((q) => q.sql.replace(/ AND (t\.)?project (= \?|IS NULL( AND (t\.)?org = 1)?)/g, "")).sort().join("\n");   // the null scope's org (6.2) is the clause's
  const measure = async () => {
    const o = {};
    for (const [who, key] of [["p-3", "key-3"], ["p-5", "key-5"]]) {
      o[who] = { ho: await req("/missing", key, { accept: "text/html" }) };
    }
    o.owner = { th: await req("/updates?project=beta", "owner-key") };
    o.stamp = {};
    for (const k of ["s-o-delta", "s-o-gamma", "s-o-none", "s-3-beta"]) o.stamp[k] = await tool(k, "home", {});
    return o;
  };
  await req("/missing", "key-3", { accept: "text/html" });   // warm the isolate's own caches (the project-count memo)
  const o = await measure();
  const cap = [];
  for (const [who, want] of [["p-3", "eq:beta"], ["p-5", "null"]]) for (const [rt, r] of Object.entries(o[who])) {
    const got = r.d1.filter((q) => Object.values(SITES).some((f) => f(q)));
    if (rt === "ho" && want === "null") { ok(r.status === 200 && got.length === 0, `R1 · ${who} (seated nowhere) ho: GET /missing reads no project's knowledge at the org level (${got.length} statement(s))`); continue; }
    ok(r.status === 200 && got.length > 0 && got.every((q) => clauseOf(q) === want), `R1 · ${who} (${want === "null" ? "seated nowhere" : "a key seated on beta, no stamp"}) ${rt}: ${got.length} site statement(s), each ${want === "null" ? "project IS NULL (never org-wide)" : "project = 'beta'"} -> ${got.map(clauseOf).join(",") || "none captured"}`);
    cap.push(...got);
  }
  const thR = o.owner.th.d1.filter(SITES["the brief's pending rulings"]);
  ok(o.owner.th.status === 200 && thR.length === 1 && clauseOf(thR[0]) === "eq:beta", `R1 · the owner's GET /updates?project=beta: the brief's pending rulings read project = 'beta' (${thR.map(clauseOf).join(",")})`);
  cap.push(...thR);
  const seen = new Set();
  for (const q of cap) {
    const site = Object.keys(SITES).find((k) => SITES[k](q));
    const key = site + "|" + clauseOf(q).split(":")[0];
    if (seen.has(key)) continue; seen.add(key);
    const p = plan(d, q.sql, q.a);
    ok(/USING (COVERING )?INDEX/.test(p) && !bareScan(p, "t") && !bareScan(p, "transmission"), `R1 · EXPLAIN ${site} (${clauseOf(q).split(":")[0]}): ${p}`);
  }
  ok(norm(o["p-3"].ho.d1.filter((q) => !CHECKLIST_READS.has(q.sql))) === norm(o["p-5"].ho.d1.filter((q) => !CHECKLIST_READS.has(q.sql))),
    `R2 · D7 adds no statement: p-3 (scoped) and p-5 (null scope) run the same statements on GET /missing, the clause aside and the scoped read's checklist aside (${o["p-3"].ho.d1.length})`);
  const ak = (r) => r.d1.filter((q) => q.sql === ACTIVE_KEYS).length;
  const S = o.stamp;
  ok(!S["s-o-delta"].j.result.isError && S["s-o-delta"].v.project && S["s-o-delta"].v.project.key === "delta" && ak(S["s-o-delta"]) === 1 && S["s-o-delta"].d1.length <= S["s-o-none"].d1.length,
    `R3 · D4: the owner's session stamped on delta (active, no seat) reads delta with ONE active-keys statement, ${S["s-o-delta"].d1.length} in all vs ${S["s-o-none"].d1.length} unstamped (the default reads the same memo): at most +1, owner only`);
  ok(S["s-o-gamma"].v && S["s-o-gamma"].v.project && S["s-o-gamma"].v.project.key !== "gamma" && ak(S["s-o-gamma"]) === 1 && S["s-o-gamma"].d1.length === S["s-o-none"].d1.length,
    `R3 · D4: stamped on gamma (archived) the owner reads the default (${S["s-o-gamma"].v && S["s-o-gamma"].v.project && S["s-o-gamma"].v.project.key}), the same ${S["s-o-gamma"].d1.length} statement(s) as unstamped`);
  ok(S["s-3-beta"].v && S["s-3-beta"].v.project && S["s-3-beta"].v.project.key === "beta" && ak(S["s-3-beta"]) === 0, `R3 · D4: a member's stamp on a seat is live for free (0 active-keys statements)`);
  // the instruments
  extraRead = ACTIVE_KEYS;
  const twice = await measure();
  extraRead = null;
  ok(ak(twice.stamp["s-o-delta"]) === 2, `R · the instrument: the active-keys statement read twice counts ${ak(twice.stamp["s-o-delta"])}, so R3 would go red`);
  const orgWide = { sql: (cap.find(SITES["the brief's pending rulings"]) || cap[0]).sql.replace(/ AND (t\.)?project (= \?|IS NULL)/, ""), a: [] };
  ok(clauseOf(orgWide) === "none", "R · the instrument: a site statement without its clause reads as org-wide ('none'), so R1 would go red");
}

// ---- S · the U-MCP-tail-b heal (the adversarial review's finding 1): ONE "multi-project" rule for the seam and the reads ----
// The seam (src/index.js orgHasWorkspaces — scope this request?) and projectScopeOf (a null scope's filter) read ONE rule,
// core.js orgProjectsOnce: the D1 ACTIVE projects through one memo (a minute per isolate, keyed by the D1 binding, pinned per
// request). The reviewer's worlds, through the real handler, every statement logged with its bound arguments:
//   S1 · D1 active alpha only (/control archived beta):
//        a member's session stamped alpha, a member's key seated on alpha and the owner read alpha (`project = 'alpha'`) on
//        the REST reads (the thread brief's pending rulings — owner only — and GET /missing' one statement), never
//        `project IS NULL`; the thread and holes TOOLS bind exactly what their GET
//        twins bind; where a read is at the org level (IS NULL), GET /missing and the holes tool read nothing;
//   S2 · the mirror — D1 active alpha AND beta: the same callers read alpha on every REST read and tool;
//        a caller seated nowhere reads the org-level rows only (`project IS NULL`) at the REST read AND the tool;
//   S3 · the stale-memo window: the memo warmed on one population, then D1 changed underneath it (another isolate's
//        /control write): within the minute the seam and the reads still agree — two active warmed, beta archived: the
//        seated-nowhere caller reads IS NULL at REST and tool (never org-wide); one active warmed, beta re-activated: the
//        member reads alpha at REST and tool (never IS NULL) — and /control's own write in THIS isolate drops the memo
//        (core.js forgetOrgProjects), so the writer's isolate answers the new population on its next request.
{
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const SITES = {
    brief: (q) => /t\.route='owner' AND t\.status != 'closed'/.test(q.sql),
    holes: (q) => q.sql === CHECKLIST_SQL,   // sprint 3 (B3): the checklist's meter, which binds the project alone
  };
  // (D2b: the checklist's reads bind the project FIRST, ?1, and the reader's keys after it)
  const clauseOf = (q) => (/project = \?1/.test(q.sql) && (q.sql === CHECKLIST_SQL || q.sql === CHECKLIST_FIRSTS_SQL) ? "eq:" + q.a[0]
    : /project = \?/.test(q.sql) ? "eq:" + q.a[q.a.length - 1] : /project IS NULL/.test(q.sql) ? "null" : "none");
  const clauses = (r, site) => [...new Set(r.d1.filter(SITES[site]).map(clauseOf))];
  const world = (active, files = {}, heads = false) => {   // heads: R2 head answers for `files` (U3: the canvas read heads first)
    const d = seeded();
    const all = ["alpha", "beta"];
    const PR = d.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,?,?)");
    for (const k of all) PR.run(k, k, active.includes(k) ? 1 : 0, "2026-09-01T00:00:00Z");
    d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)").run("p-3", "alpha", "member", "2026-09-01T00:00:00Z");
    d.exec("UPDATE transmission SET project = CASE WHEN rowid % 3 = 0 THEN 'alpha' WHEN rowid % 3 = 1 THEN 'beta' ELSE NULL END");
    d.exec("UPDATE transmission SET components = 'c-' || (rowid % 7) WHERE rowid % 2 = 0");
    d.exec("UPDATE transmission SET kind = 'question', status = 'received' WHERE rowid % 9 = 0");
    d.prepare("INSERT INTO tokens (token_hash,person_id,device,created_at,expires_at,revoked,project,org) VALUES (?,?,?,?,?,?,?,1)").run(sha("s-3-alpha"), "p-3", "d1hot", "2026-09-01T00:00:00Z", "2099-01-01T00:00:00Z", 0, "alpha");
    const log = [];
    const DB = { batch: batchOf(d), prepare(sql) {
      const st = d.prepare(sql);
      const w = (a) => ({ first: async () => { log.push({ sql, a }); return st.get(...a) ?? null; }, all: async () => { log.push({ sql, a }); return { results: st.all(...a) }; }, run: async () => { log.push({ sql, a }); return { meta: { changes: st.run(...a).changes } }; } });
      return { ...w([]), bind: (...a) => w(a) }; } };
    const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
    const BRAIN = { get: async (k) => (files[k] != null ? r2obj(files[k]) : null), head: async (k) => (heads && files[k] != null ? { size: files[k].length, etag: sha(files[k]).slice(0, 16) } : null), list: async () => ({ objects: [], truncated: false }), put: async () => {} };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const req = async (path, key, { body = null, accept = "application/json" } = {}) => {
      const from = log.length;
      const r = await handler.fetch(new Request(`https://org.test${path}`, { method: body ? "POST" : "GET", headers: { accept, authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }), { DB, BRAIN }, ctx);
      const text = await r.text();
      let j = null; try { j = JSON.parse(text); } catch { j = null; }
      return { status: r.status, j, text, d1: log.slice(from) };
    };
    const tool = async (key, name, args = {}) => { const r = await req("/mcp", key, { body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
      let v = null; try { v = JSON.parse(r.j.result.content[0].text); } catch { v = null; } return { ...r, v }; };
    // every read the caller can reach: the four REST sites and the two tools that are twins of two of them
    const reads = async (key) => ({
      thread: await req("/updates", key), holes: await req("/missing", key), threadTool: await tool(key, "updates"), holesTool: await tool(key, "missing"),
    });
    return { d, DB, req, tool, reads };
  };
  // want: the ONE clause every read of this caller binds; owner: the brief's pending rulings run (owner only)
  const expectAll = (tag, who, r, want, owner) => {
    const got = { holes: clauses(r.holes, "holes"), holesTool: clauses(r.holesTool, "holes"),
                  ...(owner ? { brief: clauses(r.thread, "brief"), briefTool: clauses(r.threadTool, "brief") } : {}) };
    const statuses = [r.thread, r.holes, r.threadTool, r.holesTool].map((x) => x.status);
    // holes at the org level reads nothing (a project's knowledge is never read org-wide); every other read binds `want`
    const wantOf = (k) => ((k === "holes" || k === "holesTool") && want === "null" ? [] : [want]);
    ok(statuses.every((s) => s === 200) && Object.entries(got).every(([k, c]) => JSON.stringify(c) === JSON.stringify(wantOf(k))),
      `${tag} · ${who}: every read binds ${want} (REST /missing${owner ? " · the thread brief" : ""} and the holes${owner ? "/thread" : ""} tool) -> ${Object.entries(got).map(([k, c]) => `${k}=${c.join("|") || "none"}`).join(" ")} [${statuses.join(",")}]`);
    ok(JSON.stringify(got.holes) === JSON.stringify(got.holesTool) && (!owner || JSON.stringify(got.brief) === JSON.stringify(got.briefTool)),
      `${tag} · ${who}: the tool binds what its GET twin binds (holes${owner ? ", thread" : ""})`);
  };
  // S1 — two projects, one active
  {
    const W = world(["alpha"]);
    await W.req("/missing", "key-3", { accept: "text/html" });   // warm this binding's memo
    expectAll("S1 (D1 active alpha, beta archived)", "a member's session stamped alpha", await W.reads("s-3-alpha"), "eq:alpha", false);
    expectAll("S1 (D1 active alpha, beta archived)", "a member's key seated on alpha", await W.reads("key-3"), "eq:alpha", false);
    expectAll("S1 (D1 active alpha, beta archived)", "the owner", await W.reads("owner-key"), "eq:alpha", true);
    // one ACTIVE project: a caller seated nowhere writes into it (doorProject's zero-seat rule), so reads it at REST and tool
    expectAll("S1 (D1 active alpha, beta archived)", "a caller seated nowhere (a one-project org)", await W.reads("key-5"), "eq:alpha", false);
  }
  // S2 — the mirror: both active
  {
    const W = world(["alpha", "beta"]);
    await W.req("/missing", "key-3", { accept: "text/html" });
    expectAll("S2 (D1 active alpha+beta)", "a member's session stamped alpha", await W.reads("s-3-alpha"), "eq:alpha", false);
    expectAll("S2 (D1 active alpha+beta)", "the owner", await W.reads("owner-key"), "eq:alpha", true);
    expectAll("S2 (D1 active alpha+beta)", "a caller seated nowhere", await W.reads("key-5"), "null", false);
  }
  // S3 — the stale-memo window (a direct D1 write stands for another isolate's /control write: this isolate's memo is stale)
  {
    const W = world(["alpha", "beta"]);
    await W.req("/missing", "key-5", { accept: "text/html" });   // the memo: two active
    W.d.exec("UPDATE projects SET active = 0 WHERE key = 'beta'");
    expectAll("S3 (warmed two active, beta archived within the minute)", "a caller seated nowhere", await W.reads("key-5"), "null", false);
    expectAll("S3 (warmed two active, beta archived within the minute)", "a member's session stamped alpha", await W.reads("s-3-alpha"), "eq:alpha", false);
  }
  {
    const W = world(["alpha"]);
    await W.req("/missing", "key-3", { accept: "text/html" });   // the memo: one active
    W.d.exec("UPDATE projects SET active = 1 WHERE key = 'beta'");
    expectAll("S3 (warmed one active, beta re-activated within the minute)", "a member's session stamped alpha", await W.reads("s-3-alpha"), "eq:alpha", false);
    expectAll("S3 (warmed one active, beta re-activated within the minute)", "the owner", await W.reads("owner-key"), "eq:alpha", true);
    // this isolate's own /control write drops the memo: the next request answers the new population (two active)
    const { forgetOrgProjects, orgIsMultiProject } = await imo(pathToFileURL(join(ENGINE, "src", "core.js")).href);
    const stale = await orgIsMultiProject(asOrg({ DB: W.DB }));
    forgetOrgProjects(asOrg({ DB: W.DB }));
    const fresh = await orgIsMultiProject(asOrg({ DB: W.DB }));
    ok(stale === false && fresh === true, `S3 · within the minute this binding's memo still answers one active (${stale}); /control's forgetOrgProjects drops it and the next read answers two (${fresh})`);
    const other = asOrg({ DB: { prepare: (sql) => ({ all: async () => ({ results: W.d.prepare(sql).all() }) }) } });
    ok(await orgIsMultiProject(other) === true, "S3 · a different D1 binding never reads another binding's memo (keyed by the binding, never isolate-wide)");
  }

  // ---- T · D6: a read or a grade is the request scope's, never the pack file's claim; slice 3: the checks are the D1 register ----
  // A multi-project org (D1 active alpha + beta) whose ORG-ROOT pack claims alpha (the brain kit writes `project` into every
  // pack.json). alpha's register holds c1 and c2 (both naming screen:home), check_results alpha's grade of c1 (proven), and
  // the ledger alpha, beta and org-level rows.
  //   T1 · p-5 (seated nowhere, not the owner) through MCP: `read` of a check is refused project_required (the checks are one
  //        project's), never alpha's; `changes` is refused project_required too (D5:
  //        changes reads one project's ledger or nothing), never an alpha or beta row; submit_grade is
  //        refused project_required with nothing filed and nothing counted (check_results.project is NOT NULL: a grade counts
  //        against one project, and this caller's scope is the org level) — never counted against alpha; the seatless OWNER's
  //        unnamed grade (read scope alpha, write stamp org-level) is refused naming alpha, and naming alpha its grade row
  //        (pack_version "live") and filing agree; a grade of a check alpha's register does not hold is unknown_check, nothing
  //        filed;
  //   T2 · the passing case stays passing: p-3 (seated on alpha, the scope alpha) reads alpha's grade and its own grade
  //        lands check_results.project = 'alpha', the same as its filing;
  //   T3 · the GET twins (/read, /changes) answer what the tools answer for p-5.
  {
    const files = {};   // no served pack: the pack doors read D1
    const W = world(["alpha", "beta"], files);
    seedChecks(W.d, "alpha", [{ id: "c1", then: "it shows", refs: ["screen:home"] }, { id: "c2", then: "it loads", refs: ["screen:home"] }]);
    W.d.prepare("INSERT INTO check_results (project, pack_version, check_id, status, transmission_id, graded_by, graded_at) VALUES (?,?,?,?,?,?,?)").run("alpha", "live", "c1", "proven", null, "p-3", "2026-09-02T00:00:00Z");
    W.d.exec("UPDATE transmission SET touches = 'screen:home', eval = 0, client_ref = NULL WHERE rowid % 5 = 0");
    const projOf = (id) => (id ? (W.d.prepare("SELECT project FROM transmission WHERE id = ?").get(id) || {}).project ?? null : null);
    const lastGrade = () => W.d.prepare("SELECT project, transmission_id FROM check_results WHERE pack_version = 'live' ORDER BY rowid DESC LIMIT 1").get();
    await W.req("/missing", "key-5", { accept: "text/html" });
    // T1
    const ck = await W.tool("key-5", "read", { ref: "check/c1" });
    ok(ck.v && ck.v.error === "project_required" && !ck.v.item, `T1 · a seatless caller's read of a check reads no project's register (never alpha's): ${ck.v && ck.v.error}`);
    const lv = await W.tool("key-5", "changes", {});
    ok(lv.v && lv.v.error === "project_required" && !lv.v.changes, `T1 · a seatless caller's changes reads no project's ledger (never alpha's or beta's): ${lv.v && lv.v.error}`);
    const nTx = () => W.d.prepare("SELECT COUNT(*) AS n FROM transmission").get().n, nCr = () => W.d.prepare("SELECT COUNT(*) AS n FROM check_results").get().n;
    const [tx0, cr0] = [nTx(), nCr()];
    const gr = await W.tool("key-5", "submit_grade", { checkId: "c2", verdict: "proven", proof: "ran it: exit 0" });
    ok(gr.v && gr.v.error === "project_required" && nTx() === tx0 && nCr() === cr0,
      `T1 · a seatless caller's grade has no project to count against (its read scope is the org level; check_results.project is NOT NULL) -> ${gr.v && gr.v.error}, nothing filed (${nTx() - tx0}) and nothing counted (${nCr() - cr0}) — never the root pack's claim`);
    // the seatless OWNER: the read scope defaults to alpha, an unnamed write would stamp the org level -> refused, names alpha
    const go = await W.tool("owner-key", "submit_grade", { checkId: "c2", verdict: "proven", proof: "ran it: exit 0" });
    ok(go.v && go.v.error === "project_required" && go.v.example && go.v.example.project === "alpha" && nTx() === tx0 && nCr() === cr0,
      `T1 · the seatless owner's unnamed grade (read scope alpha, write stamp org-level) is refused naming alpha -> ${go.v && go.v.error} ${go.v && JSON.stringify(go.v.example)}, nothing filed`);
    const go2 = await W.tool("owner-key", "submit_grade", { checkId: "c2", verdict: "proven", proof: "ran it: exit 0", project: "alpha" });
    const gO = lastGrade();
    ok(go2.v && go2.v.counted === true && gO && gO.project === "alpha" && gO.transmission_id === go2.v.transmission && projOf(go2.v.transmission) === "alpha",
      `T1 · ...naming alpha, the owner's grade row and its filing agree (check_results ${gO && gO.project}, filing ${go2.v && projOf(go2.v.transmission)})`);
    const [tx1, cr1] = [nTx(), nCr()];
    const gu = await W.tool("owner-key", "submit_grade", { checkId: "c9", verdict: "proven", proof: "ran it: exit 0", project: "alpha" });
    ok(gu.v && gu.v.error === "unknown_check" && /`read`/.test(gu.v.note || "") && nTx() === tx1 && nCr() === cr1,
      `T1 · a grade of a check alpha's register does not hold -> ${gu.v && gu.v.error}, nothing filed (${nTx() - tx1}) or counted (${nCr() - cr1})`);
    // T3
    const ckR = await W.req("/read?ref=check/c1", "key-5");
    const lvR = await W.req("/changes", "key-5");
    ok(ckR.j && ckR.j.error === ck.v.error && lvR.j && lvR.j.error === lv.v.error, `T3 · the GET twins answer the tools' reads for the seatless caller (/read ${ckR.status} ${ckR.j && ckR.j.error}; /changes ${lvR.status} ${lvR.j && lvR.j.error})`);
    // T2
    const ck3 = await W.tool("key-3", "read", { ref: "check/c1" });
    const c13 = ck3.v && ck3.v.item;
    const v13 = c13 && c13.grade ? (c13.grade.verdict || c13.grade.status) : null;
    ok(v13 === "proven" && ck3.v.project === "alpha", `T2 · a caller scoped to alpha reads alpha's grade (c1 ${v13}) ${JSON.stringify(c13 && c13.grade)}`);
    const gr3 = await W.tool("key-3", "submit_grade", { checkId: "c2", verdict: "refused", proof: "ran it: exit 1" });
    const g3 = lastGrade();
    ok(gr3.v && gr3.v.counted === true && g3 && g3.project === "alpha" && projOf(gr3.v.transmission) === "alpha", `T2 · a caller scoped to alpha grades into alpha (check_results ${g3 && g3.project}, filing ${gr3.v && projOf(gr3.v.transmission)})`);
  }
  // ---- U · U-MCP-tail-c (QE6B9CEBA): N2 — REST POST /grade scopes by its body `project` like submit_grade; N0 — Map · Arch's chip ----
  // A multi-project org (D1 active alpha + beta); the owner holds no seat (default scope alpha), p-3 is
  // seated on alpha only. Through the real handler:
  //   U1 · the owner names the NON-default project beta: REST POST /grade and the submit_grade tool give the same outcome
  //        (counted, the grade row and its filing in beta); unnamed, both refuse project_required naming the same example
  //        project (alpha); both reach the ONE helper (core.js projectCallScope);
  //   U2 · p-3 names beta (no seat): project_forbidden on both — REST 403 with the tool's own body — nothing filed or counted;
  //   U3 · N0: GET /map/arch?project=beta (text/html) by a member seated on alpha and beta: the chip names beta and its
  //        options are the arch plane's org-worker `projects` (the handed-over seatsRead) — never an empty list, which drew
  //        the static "Projects" link (the live walk's one red view: the shell read the pre-D11 field `workspaces`).
  {
    const files = {};   // no served pack: the pack doors read D1
    const W = world(["alpha", "beta"], files, true);
    for (const p of ["alpha", "beta"]) seedChecks(W.d, p, [{ id: "c1", then: "it shows", refs: ["screen:home"] }, { id: "c2", then: "it loads", refs: ["screen:home"] }]);
    const projOf = (id) => (W.d.prepare("SELECT project FROM transmission WHERE id = ?").get(id) || {}).project ?? null;
    const gradeOf = (tx) => (W.d.prepare("SELECT project FROM check_results WHERE transmission_id = ?").get(tx) || {}).project ?? null;
    const nTx = () => W.d.prepare("SELECT COUNT(*) AS n FROM transmission").get().n, nCr = () => W.d.prepare("SELECT COUNT(*) AS n FROM check_results").get().n;
    const G = (extra) => ({ checkId: "c2", verdict: "proven", proof: "ran it: exit 0", ...extra });
    const shape = (v) => v ? { error: v.error || null, counted: v.counted ?? null, example: (v.example && v.example.project) || null, filed: v.transmission ? projOf(v.transmission) : null, graded: v.transmission ? gradeOf(v.transmission) : null } : null;
    // U1 — the owner names beta (the default scope is alpha)
    const rest = await W.req("/grade", "owner-key", { body: G({ project: "beta" }) });
    const mcp = await W.tool("owner-key", "submit_grade", G({ project: "beta" }));
    const sR = shape(rest.j), sM = shape(mcp.v);
    ok(rest.status === 200 && sR && sR.counted === true && sR.filed === "beta" && sR.graded === "beta" && JSON.stringify(sR) === JSON.stringify(sM),
      `U1 · the owner naming beta (not the default alpha): REST POST /grade == submit_grade -> REST ${rest.status} ${JSON.stringify(sR)} · MCP ${JSON.stringify(sM)}`);
    const restU = await W.req("/grade", "owner-key", { body: G({}) });
    const mcpU = await W.tool("owner-key", "submit_grade", G({}));
    ok(restU.status === 422 && restU.j && restU.j.error === "project_required" && JSON.stringify(shape(restU.j)) === JSON.stringify(shape(mcpU.v)) && shape(restU.j).example === "alpha",
      `U1 · unnamed, both refuse project_required with the same example project -> REST ${restU.status} ${JSON.stringify(shape(restU.j))} · MCP ${JSON.stringify(shape(mcpU.v))}`);
    // U2 — p-3 (seated on alpha only) names beta
    const [tx0, cr0] = [nTx(), nCr()];
    const restF = await W.req("/grade", "key-3", { body: G({ project: "beta" }) });
    const mcpF = await W.tool("key-3", "submit_grade", G({ project: "beta" }));
    ok(restF.status === 403 && restF.j && restF.j.error === "project_forbidden" && mcpF.v && mcpF.v.error === "project_forbidden"
       && JSON.stringify(restF.j) === JSON.stringify(mcpF.v) && nTx() === tx0 && nCr() === cr0,
      `U2 · a seat outside the named project: REST ${restF.status} ${restF.j && restF.j.error} == MCP ${mcpF.v && mcpF.v.error} (same body: ${JSON.stringify(restF.j) === JSON.stringify(mcpF.v)}), nothing filed (${nTx() - tx0}) or counted (${nCr() - cr0})`);
    const restA = await W.req("/grade", "key-3", { body: G({ project: "alpha" }) });
    ok(restA.status === 200 && restA.j && restA.j.counted === true && gradeOf(restA.j.transmission) === "alpha", `U2 · ...naming its own seat (alpha) the REST grade counts in alpha (${restA.status} ${restA.j && gradeOf(restA.j.transmission)})`);
    // U3 — N0: Map · Arch's chip reads the region's `projects` (p-5 seated on alpha AND beta: a reader with real choice)
    const SEAT = W.d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
    for (const k of ["alpha", "beta"]) SEAT.run("p-5", k, "member", "2026-09-01T00:00:00Z");
    const arch = await W.req("/map/arch?project=beta", "key-5");
    const regionKeys = arch.j && arch.j.regions ? (arch.j.regions["org-worker"].projects || []).map((p) => p.name) : null;
    const page = await W.req("/map/arch?project=beta", "key-5", { accept: "text/html" });
    const sw = (/data-region="project-switcher"[\s\S]*?<\/details>/.exec(page.text) || [""])[0];
    const span = (/<summary[^>]*><span>([^<]*)<\/span>/.exec(sw) || [])[1] || null;
    const opts = [...sw.matchAll(/<button type="submit"[^>]*>([^<]*)</g)].map((m) => m[1]).filter((x) => x !== "All projects");
    ok(page.status === 200 && Array.isArray(regionKeys) && regionKeys.length >= 2 && span === "beta" && JSON.stringify(opts) === JSON.stringify(regionKeys),
      `U3 · N0: a two-seat member's /map/arch?project=beta names beta on the chip (span "${span}"), its options are the arch region's projects [${opts.join(", ")}] = [${(regionKeys || []).join(", ")}] (${page.status})`);
    // U4 · sprint 12, 12.6: the owner, seated on nothing, names beta: the chip reads beta's NAME from its row (one statement on
    //      its primary key), never the key (the rail showed "o3--sharingu" on the reviewer world)
    W.d.prepare("UPDATE projects SET name = 'Beta Launch' WHERE key = 'beta'").run();
    const pageO = await W.req("/map/arch?project=beta", "owner-key", { accept: "text/html" });
    const swO = (/data-region="project-switcher"[\s\S]*?<\/details>/.exec(pageO.text) || [""])[0];
    const spanO = (/<summary[^>]*><span>([^<]*)<\/span>/.exec(swO) || [])[1] || null;
    const nameReads = pageO.d1.filter((q) => q.sql === PROJECT_NAME_SQL && q.a[0] === "beta").length;
    ok(pageO.status === 200 && spanO === "Beta Launch" && nameReads >= 1,
      `U4 · the seatless owner's /map/arch?project=beta names "${spanO}" on the chip (its name, not its key), ${nameReads} name read(s) (${pageO.status})`);
  }
}

// ---- V · UI-B12a, Control's ONE read: GET /control/people in THREE statements (X1 X2 X3), in every org ----
// (U is U-MCP-tail-c's.) The world: A's seeded DB plus projects alpha and beta (active) and gamma (archived); p-3 seated on
// alpha, p-4 on alpha and beta, p-5 on gamma ONLY (an archived project: seated nowhere live), the owner on none; the suites'
// fixed owner (eval-fixed-owner, an admin during a run) and fixed seat (eval-fixed-seat, on alpha) active. Through EXPLAIN
// on the exact strings src/controlread.js runs (src/hotsql.js):
//   V1 · X1 (people LEFT JOIN seats LEFT JOIN active projects) SEARCHes project_seats and projects by key and the admin name
//        on idx_people_owner; scoped (a non-admin), the people too by key (the reader's seats a subquery on the seats' key),
//        never a SCAN of project_seats; X2's per-project seat count SEARCHes idx_project_seats_project; X3 walks
//        idx_tokens_live newest first to the LIMIT for the admin (no sort) and SEARCHes idx_tokens_person for a non-admin
//        (never idx_tokens_live: the org's every live token walked for one person's). Each FAILS with its own index dropped,
//        and the scoped X3 without the ORDER BY's unary +.
//   V2 · the rows equal a plain computation: the admin reads every active non-eval person with their ACTIVE seats (gamma
//        never), ?eval=1 adds both fixed people; p-3 reads p-3 and p-4 (never the owner, who holds no seat) with p-4's chips
//        [alpha] only, workspaces [alpha], its own devices; p-5 reads only itself, no workspace.
//   V3 · through the real handler, GET /control/people runs EXACTLY X1, X2 and X3 once each beyond the same request's baseline
//        (GET /versions as JSON, zero of its own: section J), for the owner, for a seat, for the owner with ?eval=1, and in a
//        ONE-project org (where the workspace seam reads no seats, so the read must not either); the instrument: X2 read twice
//        counts four, so the check goes red. A failed statement answers 200 live:'unreachable'; anonymous 401.
// (The page equals the JSON is UI-B12b's: section W below.)
// ---- W · UI-B12b, Control the screen: GET /control in the SAME three statements; Reissue revokes the person's sessions ----
// Same world and handler as V.
//   W1 · rotate-key's revoke (src/admin.js REVOKE_SESSIONS_SQL, one UPDATE in the same action, the fold from B12a's adversarial
//        review) SEARCHes idx_tokens_person (person_id=? AND revoked=?), never a SCAN of tokens; with the index dropped it FAILS.
//   W2 · through the real handler, GET /control (the page, text/html) runs EXACTLY X1, X2 and X3 once each beyond the same
//        reader's GET /versions page, and no statement the JSON (GET /control/people) does not: the owner and a seat
//        (the probe control_people.py's "the page equals the JSON"); the instrument: X2 read twice counts four. The admin's
//        page alone adds the Measures card's three, the last backup and the plan's one read (sprint 8, 8.4: the Plan card);
//        a seat's reads none of them and draws neither card.
//   W3 · p-3's live session (a tokens row, its secret as a Bearer) answers /whoami 200; the owner reissues p-3's key
//        (POST /control rotate-key) and the same session answers 401, every tokens row of p-3's revoked, the owner's own
//        session still 200; the instrument: the key rotated WITHOUT the revoke (the people row alone) leaves the session 200.
// ---- X · U-REISSUE (N1, UI-B12b's adversarial review 7f0788c8): a sign-in in flight across a Reissue mints NO live session ----
//   X1 · POST /login's session INSERT (src/accounts.js LOGIN_SESSION_SQL, conditional on the hashes the sign-in read) probes
//        people on a UNIQUE key, never a SCAN; with both keys unary-plussed it FAILS.
//   X2 · the deterministic interleave, no timing loop: a D1 binding whose `INSERT INTO tokens` runs a hook FIRST (after the real
//        handler read the hashes and awaited pbkdf2, before the INSERT executes). The hook runs each REAL rotate path on the same
//        DB, the admin's Reissue (runControlAction rotate-key: people + REVOKE_SESSIONS_SQL) and the holder's rotate-my-key
//        (runSecretAction: key_hash + its revoke). The sign-in answers the wrong-key 401 (JSON invalid_login; the web form's
//        "That email and passphrase do not match.", no Set-Cookie), no tokens row is added, p-3 holds 0 live sessions, the
//        attempt is counted failed. With no rotate the same sign-in mints a live session (a key-equal passphrase, and one of
//        its own); a wrong passphrase runs no INSERT.
//   X3 · the instrument: the same interleave with the OLD unconditional INSERT yields a token that answers /whoami 200 after
//        the rotate — the race, reproduced on each path.
//   X4 · the mutation proof: the handler's zero-row check removed (a scratch src/) answers 200 with a dead token, so X2's
//        401 is that check's own.
{
  const { CONTROL_PEOPLE_SQL, CONTROL_PROJECTS_SQL, CONTROL_DEVICES_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const at0 = "2026-09-01T00:00:00Z";
  const ctlDb = ({ drop = [], active = ["alpha", "beta"] } = {}) => {
    const d = seeded();
    for (const i of drop) d.exec(`DROP INDEX ${i}`);
    const PR = d.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,?,?)");
    for (const k of ["alpha", "beta", "gamma"]) PR.run(k, k[0].toUpperCase() + k.slice(1), active.includes(k) ? 1 : 0, at0);
    const S = d.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
    for (const [pid, k] of [["p-3", "alpha"], ["p-4", "alpha"], ["p-4", "beta"], ["p-5", "gamma"], ["eval-fixed-seat", "alpha"]]) {
      if (pid.startsWith("eval-") && !d.prepare("SELECT 1 FROM people WHERE id = ?").get(pid)) d.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)").run(pid, "Eval Seat", "eval-seat@example.com", "internal-eng", sha("eval-seat-key"), 1, at0);
      S.run(pid, k, "member", at0);
    }
    d.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)").run("eval-fixed-owner", "Eval Owner", "eval-owner@example.com", "owner", sha("eval-owner-key"), 1, "2026-09-02T00:00:00Z");
    return d;
  };
  // V1 · plans
  const V1 = (d, x3Scoped = CONTROL_DEVICES_SQL(true, false)) => {
    const r = {};
    const x1a = plan(d, CONTROL_PEOPLE_SQL(false, false), ["p-owner"]);
    // sprint 2 (the live budget): the ACTIVE people on idx_people_active, their seats by key, no projects probe per seat (X2
    // names them). Control simple: ONE row per person, the seats and the newest filing as correlated probes by key
    // (project_seats' primary key, idx_transmission_submitter's min/max)
    r["X1, the admin"] = [/SEARCH p USING (?:COVERING )?INDEX idx_people_active \(active=\?\)/.test(x1a) && /SEARCH s USING COVERING INDEX sqlite_autoindex_project_seats_1 \(person_id=\?\)/.test(x1a) && !/SEARCH pr\b/.test(x1a)
      && /SEARCH t USING COVERING INDEX idx_transmission_submitter \(submitter=\?\)/.test(x1a)
      && /SEARCH o USING INDEX idx_people_owner \(role=\? AND active=\?\)/.test(x1a) && !/SCAN (p|s|x|m|pr)\b/.test(x1a) && !/MATERIALIZE/.test(x1a), x1a];
    const x1s = plan(d, CONTROL_PEOPLE_SQL(true, false), ["p-3", "p-3", "p-3", "p-3"]);
    r["X1, a seat"] = [/SEARCH p USING INDEX sqlite_autoindex_people_1 \(id=\?\)/.test(x1s) && /SEARCH x USING INDEX idx_project_seats_project \(project_key=\?\)/.test(x1s)
      && /SEARCH m USING COVERING INDEX sqlite_autoindex_project_seats_1 \(person_id=\?\)/.test(x1s) && /SEARCH o USING INDEX idx_people_owner/.test(x1s) && !/SCAN (p|s|x|m|pr)\b/.test(x1s), x1s];
    // sprint 2: X2 is the active projects alone (the seat counts are counted from X1): never a seat or a person read
    const x2 = plan(d, CONTROL_PROJECTS_SQL, []);
    r["X2"] = [/(SCAN|SEARCH) pr\b/.test(x2) && !/\b(s|sp|project_seats|people)\b USING/.test(x2), x2];
    // sprint 2: the admin's devices are the ACTIVE people's LIVE keys (idx_people_active, then idx_tokens_person_live), unsorted
    const x3a = plan(d, CONTROL_DEVICES_SQL(false, false), ["2026-09-01", "p-owner"]);
    r["X3, the admin"] = [/SEARCH p USING (?:COVERING )?INDEX idx_people_active \(active=\?\)/.test(x3a) && /SEARCH t USING INDEX idx_tokens_person_live \(person_id=\? AND revoked=\? AND expires_at>\?\)/.test(x3a) && !/TEMP B-TREE/.test(x3a) && !bareScan(x3a, "t"), x3a];
    const x3s = plan(d, x3Scoped, ["p-3", "2026-09-01"]);
    r["X3, a seat"] = [/SEARCH t USING INDEX idx_tokens_person(?:_live)? \(person_id=\? AND revoked=\?/.test(x3s) && !/idx_tokens_live/.test(x3s), x3s];
    return r;
  };
  for (const [k, [pass, p]] of Object.entries(V1(ctlDb()))) ok(pass, `V1 · Control ${k} SEARCHes by key (never a SCAN of the seats) — ${p}`);
  const dropped = [[["idx_people_owner"], "X1, the admin"], [["idx_people_active"], "X1, the admin"], [["idx_transmission_submitter"], "X1, the admin"], [["idx_project_seats_project"], "X1, a seat"], [["idx_people_active"], "X3, the admin"],
    [["idx_tokens_person_live"], "X3, the admin"], [["idx_tokens_person", "idx_tokens_person_live"], "X3, a seat"]];
  for (const [ix, k] of dropped) { const r = V1(ctlDb({ drop: ix }))[k]; ok(!r[0], `V1 · the instrument: with ${ix.join(" and ")} dropped, ${k} FAILS its check — ${r[1]}`); }
  const noPlus = V1(ctlDb({ drop: ["idx_tokens_person_live"] }), CONTROL_DEVICES_SQL(true, false).replace("ORDER BY +t.created_at", "ORDER BY t.created_at"))["X3, a seat"];
  ok(CONTROL_DEVICES_SQL(true, false).includes("ORDER BY +t.created_at") && !noPlus[0], `V1 · the instrument: the scoped X3 without its unary + FAILS (the planner walks idx_tokens_live) — ${noPlus[1]}`);

  // the real handler over a DB, every statement logged; injected: a statement run twice
  const W = (d) => {
    const log = []; let twice = null, fail = null;
    const DB = { prepare(sql) {
      const st = d.prepare(sql);
      const w = (a) => ({
        first: async () => { if (!VERSION_READS.has(sql)) log.push(sql); if (sql === fail) throw new Error("D1_ERROR: boom"); return st.get(...a) ?? null; },
        all: async () => { if (!VERSION_READS.has(sql)) log.push(sql); if (sql === fail) throw new Error("D1_ERROR: boom"); if (sql === twice) { log.push(sql); st.all(...a); } return { results: st.all(...a) }; },
        run: async () => { log.push(sql); return { meta: { changes: st.run(...a).changes } }; } });
      return { ...w([]), bind: (...a) => w(a) }; } };
    const r2obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
    const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const req = async (path, key, accept = "application/json", init = {}) => {
      const from = log.length;
      const r = await handler.fetch(new Request(`https://org.test${path}`, { ...init, headers: { accept, ...(key ? { authorization: `Bearer ${key}` } : {}), ...(init.headers || {}) } }), { DB, BRAIN }, ctx);
      const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { j = null; }
      return { status: r.status, j, text, d1: log.slice(from) };
    };
    return { req, set: (o) => { twice = o.twice ?? null; fail = o.fail ?? null; } };
  };
  const count = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return m; };
  const measure = async (w, key, path = "/control/people") => {
    await w.req("/versions", key); await w.req(path, key);   // warm the isolate's own caches
    const base = await w.req("/versions", key), got = await w.req(path, key);
    const bc = count(base.d1), delta = new Map();
    for (const [q, n] of count(got.d1)) { const k = n - (bc.get(q) || 0); if (k > 0) delta.set(q, k); }
    return { status: got.status, base: base.status, j: got.j, n: [...delta.values()].reduce((a, b) => a + b, 0), delta };
  };
  const exactly = (m, x1) => m.n === 3 && m.delta.get(x1) === 1 && m.delta.get(CONTROL_PROJECTS_SQL) === 1 && [...m.delta.keys()].some((q) => q.startsWith("SELECT t.person_id"));

  // V2 + V3 · the owner, a seat, a seat whose only project is archived, the owner with ?eval=1
  const d = ctlDb();
  const w = W(d);
  const activeNonEval = d.prepare("SELECT id FROM people WHERE active = 1 AND id NOT LIKE 'eval-fixed-%' ORDER BY id").all().map((r) => r.id);
  const ids = (j) => ((j && j.people) || []).map((p) => p.id).sort();
  const mO = await measure(w, "owner-key");
  const seatsOf = (j, id) => (((j && j.people) || []).find((p) => p.id === id) || { seats: [] }).seats.map((s) => s.project).sort();
  ok(mO.status === 200 && mO.base === 200 && exactly(mO, CONTROL_PEOPLE_SQL(false, false)),
    `V3 · GET /control/people as the owner (real handler): ${mO.n} D1 statements beyond the baseline (GET /versions, JSON), exactly X1, X2 and X3 once each`);
  ok(JSON.stringify(ids(mO.j)) === JSON.stringify(activeNonEval) && JSON.stringify(seatsOf(mO.j, "p-4")) === '["alpha","beta"]' && seatsOf(mO.j, "p-5").length === 0
     && JSON.stringify(mO.j.workspaces.map((x) => x.key)) === '["alpha","beta"]' && mO.j.admin.name === "Owner" && mO.j.people.every((p) => p.email),
    `V2 · the owner reads the ${activeNonEval.length} active non-eval people with their emails, p-4's ACTIVE seats [${seatsOf(mO.j, "p-4")}] (gamma never), workspaces [${mO.j && mO.j.workspaces.map((x) => x.key)}], the admin ${mO.j && mO.j.admin.name} (never the fixed owner)`);
  const mE = await measure(w, "owner-key", "/control/people?eval=1");
  ok(mE.status === 200 && exactly(mE, CONTROL_PEOPLE_SQL(false, true)) && mE.j.eval === true && ["eval-fixed-owner", "eval-fixed-seat"].every((x) => ids(mE.j).includes(x)),
    `V3 · ...?eval=1: ${mE.n} statements beyond the baseline, exactly X1 (with the suites' people), X2 and X3; both fixed people listed, eval:true`);
  const m3 = await measure(w, "key-3");
  ok(m3.status === 200 && exactly(m3, CONTROL_PEOPLE_SQL(true, false)),
    `V3 · GET /control/people as a seat (p-3, alpha): ${m3.n} D1 statements beyond the baseline, exactly X1 (scoped), X2 and X3 (its own)`);
  const own3 = d.prepare("SELECT COUNT(*) AS n FROM tokens WHERE person_id = 'p-3' AND revoked = 0 AND expires_at > ?").get(new Date().toISOString()).n;
  ok(JSON.stringify(ids(m3.j)) === '["p-3","p-4"]' && JSON.stringify(seatsOf(m3.j, "p-4")) === '["alpha"]' && JSON.stringify(m3.j.workspaces.map((x) => x.key)) === '["alpha"]'
     && m3.j.people.every((p) => (p.id === "p-3") === !!p.email) && m3.j.keys.every((k) => k.person === "p-3") && (m3.j.keys[0] || { devices: [] }).devices.length === own3
     && m3.j.people.every((p) => !p.can.role && !p.can.remove && /Only an admin can .*Owner is this org's admin\./.test(p.can.reason)),
    `V2 · p-3 reads [${ids(m3.j)}] (never the seatless owner nor the fixed seat), p-4's chips [${seatsOf(m3.j, "p-4")}] only, its own email and ${own3} own device(s), every can.* false with the reason`);
  // sprint 2: a workspace's seat count is counted from X1 (no per-project count statement): it equals the ACTIVE non-eval people
  // seated there, for the admin (every active project) and for a seat (its own)
  const seatN = (k) => d.prepare("SELECT COUNT(*) AS n FROM project_seats s JOIN people p ON p.id = s.person_id AND p.active = 1 WHERE s.project_key = ? AND s.person_id NOT LIKE 'eval-fixed-%'").get(k).n;
  const wsOk = (j) => ((j && j.workspaces) || []).length > 0 && j.workspaces.every((x) => x.seats === seatN(x.key));
  ok(wsOk(mO.j) && wsOk(mE.j) && wsOk(m3.j), `V2 · each workspace's seats equal the active non-eval people seated there: the owner [${mO.j.workspaces.map((x) => x.key + " " + x.seats)}], ?eval=1 the same, p-3 [${m3.j.workspaces.map((x) => x.key + " " + x.seats)}]`);
  const m5 = await measure(w, "key-5");
  ok(m5.status === 200 && JSON.stringify(ids(m5.j)) === '["p-5"]' && m5.j.workspaces.length === 0 && m5.n <= 3,
    `V2 · p-5 (seated only on the archived gamma) reads only itself, no workspace (${m5.n} statements)`);
  // V3 · a ONE-project org: the seam reads no seats, the read still runs exactly three
  {
    const w1 = W(ctlDb({ active: ["alpha"] }));
    const m1 = await measure(w1, "key-3");
    ok(m1.status === 200 && exactly(m1, CONTROL_PEOPLE_SQL(true, false)), `V3 · in a ONE-project org a seat's read is still exactly X1, X2 and X3 (${m1.n}): its seats ride X1, never a fourth read`);
  }
  // the instrument, a failed statement, anonymous
  w.set({ twice: CONTROL_PROJECTS_SQL });
  const m4 = await measure(w, "owner-key");
  w.set({});
  ok(m4.n === 4, `V3 · the instrument: a handler reading X2 twice counts ${m4.n} beyond the baseline, so the check above would go red`);
  w.set({ fail: CONTROL_PROJECTS_SQL });
  const down = await w.req("/control/people", "owner-key");
  w.set({});
  ok(down.status === 200 && down.j && down.j.live === "unreachable" && Array.isArray(down.j.workspaces) && down.j.workspaces.length === 0, `V3 · a failed statement answers ${down.status} live:'${down.j && down.j.live}' with its region empty`);
  const anon = await w.req("/control/people", null);
  ok(anon.status === 401 && anon.j && !anon.j.people, `V3 · anonymous GET /control/people -> ${anon.status} JSON`);

  // ---- W (UI-B12b) ----
  const { REVOKE_SESSIONS_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "admin.js")).href);
  const pw = (d0) => plan(d0, REVOKE_SESSIONS_SQL, ["p-3"]);
  // sprint 7's review (B1): the revoke is seat sessions only (account_id IS NULL); the planner serves it from
  // idx_tokens_person_live's (person_id, revoked) prefix — still a SEARCH keyed on the person, never a SCAN
  const pwOk = (x) => /SEARCH tokens USING INDEX idx_tokens_person(?:_live)? \(person_id=\? AND revoked=\?\)/.test(x) && !/SCAN tokens/.test(x);
  const pw1 = pw(ctlDb()), pw0 = pw(ctlDb({ drop: ["idx_tokens_person", "idx_tokens_person_live"] }));
  ok(REVOKE_SESSIONS_SQL === "UPDATE tokens SET revoked = 1 WHERE person_id = ? AND account_id IS NULL AND revoked = 0" && pwOk(pw1), `W1 · Reissue's session revoke SEARCHes a person-keyed tokens index, never a SCAN of tokens — ${pw1}`);
  ok(!pwOk(pw0), `W1 · the instrument: with the person-keyed indexes dropped the revoke's check FAILS — ${pw0}`);
  // W2 · the page's statements: beyond the /versions PAGE (same reader), exactly X1 X2 X3, and none the JSON does not run
  const measureH = async (ww, key) => {
    await ww.req("/versions", key, "text/html"); await ww.req("/control", key, "text/html");
    const base = await ww.req("/versions", key, "text/html"), got = await ww.req("/control", key, "text/html");
    const bc = count(base.d1), delta = new Map();
    for (const [q, n] of count(got.d1)) { const k = n - (bc.get(q) || 0); if (k > 0) delta.set(q, k); }
    return { status: got.status, base: base.status, html: /data-region="people"/.test(got.text || ""), n: [...delta.values()].reduce((a, b) => a + b, 0), delta };
  };
  const pageOnly = (mh, mj) => [...mh.delta.keys()].filter((q) => !mj.delta.has(q));
  const hO = await measureH(w, "owner-key"), h3 = await measureH(w, "key-3");
  // sprint 3 S3b: the admin's page also reads the beta measures (src/measures.js: three statements, the admin's alone; the JSON
  // never runs them): the page is exactly X1, X2, X3 and those three, once each
  const MS = await imo(pathToFileURL(join(ENGINE, "src", "measures.js")).href);
  // G2 item 9: the admin's page also reads the newest backup run (src/backup.js LAST_BACKUP_SQL, one statement, the admin's alone)
  const BK = await imo(pathToFileURL(join(ENGINE, "src", "backup.js")).href);
  // sprint 8, 8.4: the admin's page also reads the plan and its usage (src/plans.js SHOWN_SQL, ONE statement, the admin's alone)
  const PL = await imo(pathToFileURL(join(ENGINE, "src", "plans.js")).href);
  const MEAS = [MS.MEASURES_HANDOFFS_SQL, MS.MEASURES_PEOPLE_SQL, MS.MEASURES_ROLES_SQL, BK.LAST_BACKUP_SQL, PL.SHOWN_SQL];
  const withoutMeasures = (m) => { const delta = new Map([...m.delta].filter(([q]) => !MEAS.includes(q))); return { ...m, delta, n: [...delta.values()].reduce((a, b) => a + b, 0) }; };
  const oPage = (await w.req("/control", "owner-key", "text/html")).text || "";
  ok(hO.status === 200 && hO.base === 200 && hO.html && hO.n === 8 && MEAS.every((q) => hO.delta.get(q) === 1) && exactly(withoutMeasures(hO), CONTROL_PEOPLE_SQL(false, false))
    && pageOnly(hO, mO).every((q) => MEAS.includes(q)) && /<section[^>]*data-region="measures"/.test(oPage) && /<section[^>]*data-region="plan"/.test(oPage),
    `W2 · GET /control (the page) as the owner: ${hO.n} D1 statements beyond the /versions page, exactly X1, X2, X3, the three measures (the Measures card), the last backup (Admin) and the plan's one read (the Plan card) once each, none other the JSON does not run`);
  const p3 = await w.req("/control", "key-3", "text/html");
  ok(!MEAS.some((q) => h3.delta.has(q)) && p3.status === 200 && /data-region="people"/.test(p3.text || "") && !/<section[^>]*data-region="measures"/.test(p3.text || "") && !/<section[^>]*data-region="plan"/.test(p3.text || ""),
    `W2 · a seat's Control page reads no measure and no plan, and draws neither card (${p3.status}, admin-only reads in delta: ${MEAS.filter((q) => h3.delta.has(q)).length})`);
  ok(h3.status === 200 && h3.html && exactly(h3, CONTROL_PEOPLE_SQL(true, false)) && pageOnly(h3, m3).length === 0,
    `W2 · GET /control (the page) as a seat (p-3): ${h3.n} D1 statements beyond the /versions page, exactly X1 (scoped), X2 and X3, none the JSON does not run`);
  w.set({ twice: CONTROL_PROJECTS_SQL });
  const h4 = await measureH(w, "owner-key");
  w.set({});
  ok(h4.n === 9 && !exactly(withoutMeasures(h4), CONTROL_PEOPLE_SQL(false, false)), `W2 · the instrument: a page reading X2 twice counts ${h4.n} beyond the /versions page, so the check above would go red`);
  // W3 · Reissue revokes that person's sessions (tok-4 is p-3's live session row in the seeded world; tok-0 the owner's)
  {
    const dd = ctlDb(), ww = W(dd);
    const liveOf = (pid) => dd.prepare("SELECT COUNT(*) AS n FROM tokens WHERE person_id = ? AND revoked = 0 AND expires_at > ?").get(pid, new Date().toISOString()).n;
    const before = (await ww.req("/whoami", "tok-4")).status, live0 = liveOf("p-3");
    const post = await ww.req("/control", "owner-key", "text/html", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "action=rotate-key&personId=p-3" });
    const after = (await ww.req("/whoami", "tok-4")).status, own = (await ww.req("/whoami", "tok-0")).status;
    ok(before === 200 && live0 >= 1 && post.status === 200 && /New secret for Person 3/.test(post.text || "") && after === 401 && liveOf("p-3") === 0 && own === 200 && liveOf("p-owner") >= 1,
      `W3 · p-3's session answered ${before} (${live0} live row(s)); the owner's Reissue (${post.status}) leaves it ${after}, ${liveOf("p-3")} live row(s) of p-3's; the owner's own session still ${own}`);
    // the instrument: the key rotated the way rotate-key rotates it, WITHOUT the revoke statement: the old session still answers
    const d2 = ctlDb(), w2 = W(d2);
    d2.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-3'").run(sha("a-new-key"));
    ok((await w2.req("/whoami", "tok-4")).status === 200, "W3 · the instrument: the key rotated without the revoke leaves p-3's old session answering 200, so W3's 401 is the revoke's own");
  }

  // ---- X (U-REISSUE, N1): a sign-in in flight across a Reissue mints NO live session ----
  {
    const { runControlAction } = await imo(pathToFileURL(join(ENGINE, "src", "admin.js")).href);
    const { LOGIN_SESSION_SQL } = await imo(pathToFileURL(join(ENGINE, "src", "accounts.js")).href);   // sprint 7, 7.1
    const { runSecretAction } = await imo(pathToFileURL(join(ENGINE, "src", "secrets.js")).href);
    const { pbkdf2 } = await imo(pathToFileURL(join(ENGINE, "src", "util.js")).href);
    // X1 · the plan: the EXISTS is one probe of a UNIQUE key of people (id, or key_hash: NOT NULL UNIQUE), never a SCAN; the
    // instrument (both keys unary-plussed, so no index can serve) scans people and FAILS the check
    const px = (d0, sql) => plan(d0, sql, ["t", "p-3", "dev", "a", "b", "p-3", "kh", "ph", "ah"]);   // sprint 7: + the account's passphrase
    // sprint 6 (6.1): the row's org is read by the person's id beside it (a second unique probe), so the check names the EXISTS line
    const pxOk = (x) => /SEARCH people EXISTS USING INDEX sqlite_autoindex_people_[12] \((id|key_hash)=\?\)/.test(x) && !/SCAN people/.test(x);
    const px1 = px(ctlDb(), LOGIN_SESSION_SQL), px0 = px(ctlDb(), LOGIN_SESSION_SQL.replace("WHERE id = ? AND key_hash = ?", "WHERE +id = ? AND +key_hash = ?"));
    ok(pxOk(px1), `X1 · the sign-in's conditional session INSERT SEARCHes people on a unique key, never a SCAN — ${px1}`);
    ok(px0 !== px1 && !pxOk(px0), `X1 · the instrument: the same EXISTS on +id and +key_hash FAILS the check — ${px0}`);

    // the world: p-3 (p3@org.test) holds a passphrase equal to its key (S-019: rotate-key and add-person set pass_hash =
    // pbkdf2(key)); p-6 (p6@org.test) a passphrase of its own, set apart from its key (set-password / set-my-passphrase)
    const SALT = "00112233445566778899aabbccddeeff";
    const PH3 = await pbkdf2("key-3", SALT), PH6 = await pbkdf2("pass-6", SALT);
    const loginDb = () => {
      const d0 = ctlDb();
      d0.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = 'p-3'").run(PH3, SALT);
      d0.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = 'p-6'").run(PH6, SALT);
      return d0;
    };
    // a D1 binding over the DB; `hook` (once) runs the moment the handler RUNS its first `INSERT INTO tokens` — after the
    // sign-in read the hashes and awaited pbkdf2, before the INSERT executes: the deterministic interleave, no timing. A hook
    // that returns a result REPLACES the statement (the instrument's old unconditional text).
    const D1 = (d0, hook = null) => ({ fired: false, prepare(sql) {
      const self = this, st = d0.prepare(sql);
      const w = (a) => ({
        first: async () => st.get(...a) ?? null,
        all: async () => ({ results: st.all(...a) }),
        run: async () => {
          if (hook && sql.startsWith("INSERT INTO tokens")) { const h = hook; hook = null; self.fired = true; const r = await h(sql, a); if (r) return r; }
          return { meta: { changes: st.run(...a).changes } };
        } });
      return { ...w([]), bind: (...a) => w(a) }; } });
    const BRAIN = { get: async () => null,
      head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
    const cx = { waitUntil() {}, passThroughOnException() {} };
    const login = async (h, db, email, password, web = false) => {
      const init = web
        ? { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" }, body: new URLSearchParams({ email, password, web: "1", next: "/home" }).toString() }
        : { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ email, password, device: "x-selftest" }) };
      const r = await h.fetch(new Request("https://org.test/login", { ...init, redirect: "manual" }), { DB: db, BRAIN }, cx);
      const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { j = null; }
      const cookie = r.headers.get("set-cookie") || "";
      return { status: r.status, j, text, cookie, token: (j && j.token) || (/__Host-ar_session=([^;]+)/.exec(cookie) || [])[1] || null };
    };
    const whoami = async (h, d0, tok) => (await h.fetch(new Request("https://org.test/whoami", { headers: { accept: "application/json", authorization: `Bearer ${tok}` } }), { DB: D1(d0), BRAIN }, cx)).status;
    const n = (d0, sql, ...a) => d0.prepare(sql).get(...a).n;
    const liveOf = (d0, pid) => n(d0, "SELECT COUNT(*) AS n FROM tokens WHERE person_id = ? AND revoked = 0 AND expires_at > ?", pid, new Date().toISOString());
    // the two REAL rotate paths, run on the same DB inside the window
    const ROTATE = {
      "the admin's Reissue (rotate-key)": (d0) => runControlAction({ action: "rotate-key", fd: new URLSearchParams(), personId: "p-3", env: asOrg({ DB: D1(d0) }), reader: { id: "p-owner" } }).then((f) => /New secret for/.test(f)),
      "the holder's rotate-my-key": (d0) => runSecretAction({ env: asOrg({ DB: D1(d0) }), reader: { id: "p-3" }, action: "rotate-my-key", current: "key-3", isEval: true }).then((r) => r.status === 200 && r.code === "key"),
    };
    // race(h, rotate, { web, old }) -> one sign-in of p-3 on its CURRENT secret with the rotate run inside its window
    const race = async (h, rotate, { web = false, old = false } = {}) => {
      const d0 = loginDb();
      const kh0 = n(d0, "SELECT COUNT(*) AS n FROM people WHERE id = 'p-3' AND key_hash = ?", sha("key-3"));
      const rows0 = n(d0, "SELECT COUNT(*) AS n FROM tokens");
      let rotated = false;
      const db = D1(d0, async (sql, a) => {
        rotated = await rotate(d0);
        // the instrument: the pre-U-REISSUE statement, unconditional, with the same five values
        if (old) { const r = d0.prepare("INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, org) VALUES (?,?,?,?,?,0,1)").run(...a.slice(0, 5)); return { meta: { changes: r.changes } }; }
        return null;
      });
      const r = await login(h, db, "p3@org.test", "key-3", web);
      const last = d0.prepare("SELECT ok FROM login_attempts WHERE email = 'p3@org.test' ORDER BY at DESC, rowid DESC LIMIT 1").get() || {};
      return { ...r, fired: db.fired, rotated, keyWas: kh0, keyMoved: n(d0, "SELECT COUNT(*) AS n FROM people WHERE id = 'p-3' AND key_hash = ?", sha("key-3")) === 0,
        live: liveOf(d0, "p-3"), grew: n(d0, "SELECT COUNT(*) AS n FROM tokens") - rows0, attemptOk: last.ok,
        who: r.token ? await whoami(h, d0, r.token) : null };
    };
    const XP = async (h) => {
      const out = {};
      for (const [k, rot] of Object.entries(ROTATE)) {
        out[k] = { json: await race(h, rot), web: await race(h, rot, { web: true }), old: await race(h, rot, { old: true }) };
      }
      // the positive controls: with no rotate in the window, the same sign-in mints a live session (a key-equal passphrase, and
      // a passphrase of its own); a wrong passphrase is still the plain 401, with no INSERT run at all
      const d0 = loginDb(), d6 = loginDb(), d7 = loginDb();
      const plain = await login(h, D1(d0), "p3@org.test", "key-3");
      out.plain = { status: plain.status, who: plain.token ? await whoami(h, d0, plain.token) : null };
      const own = await login(h, D1(d6), "p6@org.test", "pass-6");
      out.ownPass = { status: own.status, who: own.token ? await whoami(h, d6, own.token) : null };
      const wdb = D1(d7, async () => null), wrong = await login(h, wdb, "p3@org.test", "not-the-key");
      out.wrong = { status: wrong.status, error: wrong.j && wrong.j.error, inserted: wdb.fired };
      return out;
    };
    const X = await XP(handler);
    for (const [k, v] of Object.entries(ROTATE).map(([k]) => [k, X[k]])) {
      const J = v.json, H = v.web, O = v.old;
      ok(J.fired && J.rotated && J.keyWas === 1 && J.keyMoved && J.status === 401 && J.j && J.j.error === "invalid_login" && !J.token && J.live === 0 && J.grew === 0 && J.attemptOk === 0,
        `X2 · ${k} run INSIDE a JSON sign-in's window (after the hash read and pbkdf2, before the INSERT): the sign-in answers ${J.status} ${J.j && J.j.error}, no token, ${J.grew} tokens row(s) added, ${J.live} live session(s) of p-3's, the attempt recorded ok=${J.attemptOk}`);
      ok(H.fired && H.rotated && H.status === 401 && /That email and passphrase do not match\./.test(H.text) && !H.cookie && H.live === 0 && H.grew === 0,
        `X2 · ...the web form sign-in the same: ${H.status} "That email and passphrase do not match.", no Set-Cookie, ${H.live} live session(s)`);
      ok(O.fired && O.rotated && O.status === 200 && !!O.token && O.live === 1 && O.who === 200,
        `X3 · the instrument (${k}): the same interleave with the old UNCONDITIONAL INSERT answers ${O.status} with a token that answers /whoami ${O.who} after the rotate (${O.live} live) — the race this closes`);
    }
    ok(X.plain.status === 200 && X.plain.who === 200, `X2 · with no rotate in the window the conditional INSERT mints as before: ${X.plain.status}, the session answers /whoami ${X.plain.who}`);
    ok(X.ownPass.status === 200 && X.ownPass.who === 200, `X2 · a passphrase of its own (not the key) signs in the same: ${X.ownPass.status}, /whoami ${X.ownPass.who}`);
    ok(X.wrong.status === 401 && X.wrong.error === "invalid_login" && !X.wrong.inserted, `X2 · a wrong passphrase answers ${X.wrong.status} ${X.wrong.error} and runs no session INSERT (${X.wrong.inserted ? "one ran" : "none"})`);

    // X4 · the mutation proof: the handler's zero-row check removed (a scratch copy of src/) -> the raced sign-in answers 200 with a
    // token that is DEAD — so X2's 401 is the check's own, and never a live token (the statement still refuses the row)
    // (21.P E2: the check lives in src/accounts.js openSession, THE one mint every sign-in door calls)
    const needle = `  return ((minted && minted.meta && minted.meta.changes) || 0) >= 1 ? { token, expires } : null;\n`;
    const mutDir = mkdtempSync(join(ENGINE, ".d1-hot-mutation-"));
    try {
      cpSync(join(ENGINE, "src"), join(mutDir, "src"), { recursive: true });
      const p = join(mutDir, "src", "accounts.js"), orig = readFileSync(p, "utf8");
      if (orig.split(needle).length !== 2) ok(false, "X4 · the zero-row check is not found exactly once in src/accounts.js — this selftest is stale against its shape");
      else {
        writeFileSync(p, orig.replace(needle, "  return { token, expires };\n"));
        const { default: mutated } = await import(pathToFileURL(join(mutDir, "src", "index.js")).href);
        const m = await race(mutated, ROTATE["the admin's Reissue (rotate-key)"]);
        ok(m.fired && m.status === 200 && !!m.token && m.who === 401 && m.live === 0,
          `X4 · the mutation: the zero-row check removed, the raced sign-in answers ${m.status} with a token that answers /whoami ${m.who} (${m.live} live) — the 401 above is the check's own, load-bearing`);
      }
    } finally { rmSync(mutDir, { recursive: true, force: true }); }
  }
}

// ---- Y · sprint 2, the live budget (migrate-042): the reads every page and every agent session pay ----
//   Y1 · the heartbeat's landed read (HEARTBEAT_LANDED_SQL) walks idx_events_landed newest first to its LIMIT, no sort; with the
//        index dropped it walks idx_events_created_at (every kind), and written without its unary + it walks
//        idx_events_stamped (every row of the four kinds, then a sort): each FAILS the check.
//   Y2 · the badge's counts (OWNER_OPEN_COUNT_SQL, LOOPS_OPEN_SQL) read their
//        tally on its primary key; the owner's blockers (OWNER_OWED_LIVE_SQL) and Home's open overlay (OPEN_LIVE_SQL) SEARCH
//        idx_transmission_refs_ref once per open question, never a range of the whole q/ namespace, never a scan of the ledger.
//        (The tallies' exactness and the reads' answers are tools/tally-selftest.mjs's.)
{
  const Y = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  const d = seeded();
  const since = new Date(Date.UTC(2026, 8, 3)).toISOString();
  const landed = (db, sql) => plan(db, sql, [since, "p-owner"]);
  const y1 = landed(d, Y.HEARTBEAT_LANDED_SQL(false, 0)), y1e = landed(d, Y.HEARTBEAT_LANDED_SQL(true, 0));
  const good = (p) => /SEARCH e USING INDEX idx_events_landed \(created_at>\?\)/.test(p) && !/TEMP B-TREE/.test(p) && !bareScan(p, "e");
  ok(good(y1) && good(y1e), `Y1 · the heartbeat's landed read walks idx_events_landed newest first to its LIMIT, no sort — ${y1}`);
  const noIdx = seeded(); noIdx.exec("DROP INDEX idx_events_landed");
  const y1n = landed(noIdx, Y.HEARTBEAT_LANDED_SQL(false, 0));
  ok(!good(y1n) && /idx_events_created_at/.test(y1n), `Y1 · the instrument: with idx_events_landed dropped the read FAILS the check (and falls back to idx_events_created_at, never an error) — ${y1n}`);
  const y1p = landed(d, Y.HEARTBEAT_LANDED_SQL(false, 0).replace("+e.kind IN", "e.kind IN"));
  ok(!good(y1p), `Y1 · the instrument: the read without its unary + FAILS the check (the planner takes idx_events_stamped) — ${y1p}`);
  const y1s = plan(d, Y.HEARTBEAT_LANDED_SQL(false, 2), [since, "p-owner", "a", "b", "a", "b"]);
  ok(good(y1s), `Y1 · with declared eval seats the read still walks idx_events_landed — ${y1s}`);
  // review fix 2c (sprint 2): a Partner's read names their seated projects (bound last); the walk is the same index
  const y1q = plan(d, Y.HEARTBEAT_LANDED_SQL(false, 2, 2), [since, "p-owner", "a", "b", "a", "b", "alpha", "beta"]);
  const y1qs = Y.HEARTBEAT_LANDED_SQL(false, 2, 2);
  ok(good(y1q) && /AND \+e\.project IN \(\?,\?\) ORDER BY/.test(y1qs) && !/e\.project/.test(Y.HEARTBEAT_LANDED_SQL(false, 2)),
    `Y1 · a Partner's landed read keeps to their projects (+e.project IN, after the eval seats) and still walks idx_events_landed; nobody else's read names a project — ${y1q}`);
  const tallyPlans = [
    ["the badge's pending rulings (OWNER_OPEN_COUNT_SQL eq)", Y.OWNER_OPEN_COUNT_SQL("eq", false), ["alpha"], /SEARCH transmission_open USING (?:COVERING )?INDEX sqlite_autoindex_transmission_open_1 \(project=\? AND eval=\? AND mind=\? AND route=\?\)/],
    ["the badge's open loops (LOOPS_OPEN_SQL)", Y.LOOPS_OPEN_SQL(false), ["p-owner"], /SEARCH loops_open USING (?:COVERING )?INDEX sqlite_autoindex_loops_open_1 \(person_id=\? AND mind=\?\)/],
    ["whoami's open loops (LOOPS_OPEN_SQL, every ref)", Y.LOOPS_OPEN_SQL(true), ["p-owner"], /SEARCH loops_open USING (?:COVERING )?INDEX sqlite_autoindex_loops_open_1 \(person_id=\?\)/],
  ];
  for (const [label, sql, args, re] of tallyPlans) { const p = plan(d, sql, args); ok(re.test(p) && !/SCAN (?:transmission|loops)\b/.test(p), `Y2 · ${label} reads its tally on its primary key — ${p}`); }
  for (const [label, sql] of [["the owner's blockers (OWNER_OWED_LIVE_SQL)", Y.OWNER_OWED_LIVE_SQL(false)], ["Home's open overlay (OPEN_LIVE_SQL)", Y.OPEN_LIVE_SQL(false)]]) {
    const p = plan(d, sql, [JSON.stringify(["Q1", "Q2"]), "alpha"]);
    ok(/SEARCH r USING (?:COVERING )?INDEX idx_transmission_refs_ref \(ref=\?\)/.test(p) && !/ref>\?/.test(p) && !bareScan(p, "t") && !bareScan(p, "r") && !/SCAN transmission\b/.test(p),
      `Y2 · ${label} SEARCHes idx_transmission_refs_ref once per open question, never the q/ range — ${p}`);
  }
}

// ---- Z · sprint 3 (B3): the checklist's statements — every one SEARCHes an index, none SCANs a table ----
// CHECKLIST_SQL (the meter: k_fill and a few probes) and CHECKLIST_FIRSTS_SQL (What is missing's first missing things, every
// flag set), the exact strings src/checklist.js runs, EXPLAINed on boot.sql (migrate-050 included); the to-side nav probe is
// held to idx_k_edges_to (INDEXED BY: left to itself the planner walks the k_edges primary key's whole project range for each
// screen, measured at 7,282 rows on one project), and the instrument shows the same probe without it goes red.
{
  const d = seeded();
  // (D2b item 10: the GTM card kinds' role rule walks two json_each lists, `j` a kind's roles and `r` the reader's keys: a few
  // values each, never a table)
  const isScan = (p) => /(^|\| )SCAN (?!CONSTANT ROW|json_each|j VIRTUAL TABLE|r VIRTUAL TABLE)/.test(p);
  const z1 = plan(d, CHECKLIST_SQL, ["alpha"]);
  // sprint 3 B4: the freshness part reads the dated cards and docs on their partial indexes (idx_k_cards_as_of,
  // idx_k_docs_as_of) as one UNION ALL, whose own rows are then summed: a SCAN of that subquery is of the rows just read, never
  // of a table
  const z1t = z1.replace(/\| SCAN \(subquery-\d+\)/g, "");
  ok(!isScan(z1t) && /SEARCH c USING INDEX idx_k_cards_as_of \(project=\? AND as_of>\?\)/.test(z1) && /SEARCH d USING INDEX idx_k_docs_as_of \(project=\? AND as_of>\?\)/.test(z1) && /SEARCH k_fill USING INDEX sqlite_autoindex_k_fill_1 \(project=\?\)/.test(z1) && /SEARCH x USING INDEX idx_k_nodes_screen_surface \(project=\? AND <expr>=\?\)/.test(z1)
    && /SEARCH s USING INDEX idx_k_nodes_type \(project=\? AND type=\?\)/.test(z1) && /SEARCH transmission_kinds USING INDEX sqlite_autoindex_transmission_kinds_1 \(project=\? AND eval=\? AND mind=\? AND kind=\?\)/.test(z1),
    `Z · the meter (CHECKLIST_SQL): k_fill on its primary key, a surface's screens on idx_k_nodes_screen_surface, the equips on their tally, no SCAN — ${z1}`);
  const z2 = plan(d, CHECKLIST_FIRSTS_SQL, ["alpha", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  ok(!isScan(z2) && /SEARCH e USING INDEX idx_k_edges_to \(project=\? AND to_id=\?\)/.test(z2) && !/SEARCH e USING COVERING INDEX sqlite_autoindex_k_edges_1 \(project=\?\)/.test(z2)
    && /SEARCH u USING (?:COVERING )?INDEX sqlite_autoindex_k_check_ungraded_1 \(project=\?\)/.test(z2) && /SEARCH n USING INDEX idx_k_nodes_type \(project=\? AND type=\?\)/.test(z2),
    `Z · the first missing things (CHECKLIST_FIRSTS_SQL, every flag): each walk on idx_k_nodes_type with its probes on their keys, a nav edge to a screen on idx_k_edges_to, the first ungraded check on its key, no SCAN — ${z2}`);
  const z3 = plan(d, CHECKLIST_FIRSTS_SQL.replace(" INDEXED BY idx_k_edges_to", ""), ["alpha", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  ok(/SEARCH e USING COVERING INDEX sqlite_autoindex_k_edges_1 \(project=\?\)/.test(z3), `Z · the instrument: without INDEXED BY the to-side probe walks the k_edges primary key's project range (the check above would go red) — ${z3.split(" | ").filter((x) => /k_edges_1 \(project=\?\)$/.test(x)).join(" | ")}`);
  const z4 = plan(d, HOME_GOALS_MOVED_SQL(true, false), ["alpha", "2026-09-01"]);
  ok(/SEARCH g USING INDEX sqlite_autoindex_k_goals_1 \(project=\? AND id=\?\)/.test(z4) && !bareScan(z4, "t") && !bareScan(z4, "g"), `Z · the goals moved (HOME_GOALS_MOVED_SQL): each goal's title one k_goals primary-key probe — ${z4}`);
  const z5 = plan(d, BUILD_ROWS_SQL(true, false, false), ["alpha", 1, "p-owner", 51]);
  ok(/SEARCH t USING INDEX idx_transmission_project \(project=\?\)/.test(z5) && !bareScan(z5, "t") && BUILD_ROWS_SQL(true, false, false).includes("COALESCE(+t.kind,'') <> 'knowledge' AND COALESCE(+t.kind,'') <> 'grade'") && !BUILD_ROWS_SQL(true, false, true).includes("<> 'knowledge'"),
    `Z · Build's default list leaves out the records (a knowledge write, a grade) on the same walk of idx_transmission_project; a kind filter keeps them — ${z5}`);
}

// ---- B4 · impact and carry-forward (sprint 3): every new hot statement on its key or a partial index, no SCAN of a table ----
{
  const IM = await imo(pathToFileURL(join(ENGINE, "src", "impact.js")).href);
  const PU = await imo(pathToFileURL(join(ENGINE, "src", "pickup.js")).href);
  const MM = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "mapmodel.js")).href);
  const d = seeded();
  // a SCAN of a json_each list (a virtual table, however aliased) walks the bound ids, never a table
  const tableScan = (p) => /(^|\| )SCAN (?!CONSTANT ROW|json_each|\(subquery|\w+ VIRTUAL TABLE)/.test(p);
  const J = JSON.stringify;
  const cases = [
    ["the stale marks (the Map, the Screens view)", ST.STALE_MARKS_SQL, ["alpha"], /SEARCH k_node_stale USING (COVERING )?INDEX idx_k_node_stale_on \(project=\?\)/],
    ["a node's stale row (the inspector)", ST.STALE_OF_SQL, ["alpha", J(["screen:a"])], /SEARCH k_node_stale USING PRIMARY KEY \(project=\? AND node_id=\?\)/],
    ["the stale marks that moved (the lights poll)", ST.STALE_SINCE_SQL, ["alpha", "2026-01-01"], /SEARCH k_node_stale USING INDEX idx_k_node_stale_at \(project=\? AND updated_at>\?\)/],
    ["some checks' stale flags", ST.CHECKS_STALE_SQL, ["alpha", J(["c1"])], /SEARCH k_check_stale USING PRIMARY KEY \(project=\? AND check_id=\?\)/],
    ["stale checks per goal (Goals): the stale checks outward, then each one's refs, never every check ref", ST.STALE_BY_REF_SQL, ["alpha"], /SEARCH z USING PRIMARY KEY \(project=\?\)[\s\S]*SEARCH r USING COVERING INDEX idx_k_check_refs_check \(project=\? AND check_id=\?\)/],
    ["the proof to redo (the Impact view)", IM.PROOF_SQL, ["alpha", J(["screen:a"])], /SEARCH c USING INDEX sqlite_autoindex_k_checks_1 \(project=\? AND id=\?\)/],
    ["the light walk: nodes", IM.LITE_SQL.nodes, ["alpha", J(["screen:a"])], /SEARCH k_nodes USING INDEX sqlite_autoindex_k_nodes_1 \(project=\? AND id=\?\)/],
    ["the light walk: links out", IM.LITE_SQL.out, ["alpha", J(["screen:a"])], /SEARCH k_node_links USING INDEX sqlite_autoindex_k_node_links_1 \(project=\? AND node_id=\?\)/],
    ["the light walk: links in", IM.LITE_SQL.in, ["alpha", J(["screen:a"])], /SEARCH k_edges USING INDEX idx_k_edges_to \(project=\? AND to_id=\?\)/],
    ["the light walk: the checks naming it", IM.LITE_SQL.checks, ["alpha", J(["screen:a"])], /SEARCH r USING (COVERING )?INDEX sqlite_autoindex_k_check_refs_1 \(project=\? AND ref=\?\)/],
    ["Home's What changed (one lane)", IM.WHAT_CHANGED_SQL(false), ["alpha", "code", 3], /SEARCH t USING INDEX idx_transmission_lane \(project=\? AND <expr>=\?\)/],
    ["the follow-ups due", PU.FOLLOWUPS_SQL(false, false, false), ["alpha", 7], /SEARCH t USING INDEX idx_transmission_followups \(project=\? AND next_due>\?\)/],
    ["the follow-ups due, yours", PU.FOLLOWUPS_SQL(false, false, true), ["alpha", "p-1", "a@b", 6], /SEARCH t USING INDEX idx_transmission_followups \(project=\? AND next_due>\?\)/],
    ["GTM's follow-ups due", PU.FOLLOWUPS_SQL(true, false, false), ["alpha", 7], /SEARCH t USING INDEX idx_transmission_followups \(project=\? AND next_due>\?\)/],
    ["a pick-up's row (scoped)", PU.PICKUP_ROW_SQL(true), ["T-1", "p-1", "p-1"], /SEARCH t USING INDEX sqlite_autoindex_transmission_1 \(id=\?\)/],
    ["the handover measure (slice C)", PU.HANDOFFS_SQL, ["alpha"], /SEARCH transmission USING INDEX idx_transmission_handoffs \(project=\?\)/],
    ["the lights poll", MM.LIGHTS_SINCE_SQL, ["alpha", "2026-01-01"], /SEARCH k_node_lights USING INDEX idx_k_node_lights_at \(project=\? AND updated_at>\?\)/],
    ["the doors naming a touched screen (the reach's callers: the project's doors, one row each, no json_each per door)", (await imo(pathToFileURL(join(ENGINE, "src", "reach.js")).href)).REACH_SQL.callers, ["alpha", ...(await imo(pathToFileURL(join(ENGINE, "src", "reach.js")).href)).callerArgs(["screen:a"])], /^SEARCH d USING INDEX idx_k_nodes_type \(project=\? AND type=\?\)$/],
  ];
  for (const [what, sql, args, want] of cases) {
    // READER_SCOPE's own "no active project at all" probe scans the projects table (a handful of rows), as TX_ONE_SQL does
    const p = plan(d, sql, args), p0 = p.replace(/\| SCAN projects\b/g, "");
    ok(want.test(p) && !tableScan(p0), `B4 · ${what}: ${p}`);
  }
}

// ---- L3 · migrate-061: the contributions' own index (sprint 3, L3 item 3) ----------------------------------------------
// expand-only, carried verbatim by boot.sql; THE WEEK (Home and Build) and the What changed page walk it (the page beside
// idx_transmission_knowledge), so grades and knowledge writes cost the week nothing; a database without it REFUSES the
// statements (they name it with INDEXED BY): the migration is live before the code. Rows: on a week of 300 grades, 40
// knowledge writes and 20 contributions, the week's walk reads the 20 (the step counter of the range, not an estimate).
{
  const M061 = readFileSync(join(ENGINE, "migrate-061.sql"), "utf8");
  const creates = M061.split("\n").filter((l) => /^\s*[A-Z]/.test(l));
  ok(creates.length === 1 && /^CREATE INDEX IF NOT EXISTS idx_transmission_contrib ON transmission\(project, created_at\) WHERE COALESCE\(kind,''\) NOT IN \('grade','knowledge'\);$/.test(creates[0]) && BOOT.split("\n").includes(creates[0]),
    `migrate-061 is expand-only (one CREATE INDEX IF NOT EXISTS, nothing else) and boot.sql carries it verbatim: ${creates[0] || "none"}`);
  const EX = await imo(pathToFileURL(join(ENGINE, "src", "extract.js")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z')");
  const T = d.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,1)");
  let i = 0;
  const at = (h) => new Date(Date.parse("2026-10-02T12:00:00Z") - h * 36e5).toISOString();
  for (let k = 0; k < 300; k++) T.run(`T-L3-${i++}`, "p-1", "code", "grade", "a grade", "auto", "closed", 0, "alpha", at(k % 100));
  for (let k = 0; k < 40; k++) T.run(`T-L3-${i++}`, "p-1", "leader", "knowledge", "a knowledge write", "auto", "closed", 0, "alpha", at(k % 100));
  for (let k = 0; k < 20; k++) T.run(`T-L3-${i++}`, "p-1", "code", "pr", "a contribution", "auto", "closed", 0, "alpha", at(k * 3));
  const pw = plan(d, WEEK_SQL(true, false), ["alpha", "2026-10-02T12:00:00Z", "2026-09-25T12:00:00Z", 1, "p-owner", ""]);
  ok(/SEARCH t USING INDEX idx_transmission_contrib \(project=\? AND created_at>\?\)/.test(pw) && !/idx_transmission_project/.test(pw), `L3 · THE WEEK's arm A walks idx_transmission_contrib: ${pw.split(" | ").filter((x) => /SEARCH t /.test(x)).join(" | ")}`);
  // the range it walks: the index's own rows in the window (the contributions alone)
  const walked = d.prepare("SELECT COUNT(*) AS n FROM transmission t INDEXED BY idx_transmission_contrib WHERE t.project = 'alpha' AND t.created_at >= '2026-09-25T12:00:00Z' AND " + "COALESCE(t.kind,'') NOT IN ('grade','knowledge')").get().n;
  const before = d.prepare("SELECT COUNT(*) AS n FROM transmission t INDEXED BY idx_transmission_project WHERE t.project = 'alpha' AND t.created_at >= '2026-09-25T12:00:00Z'").get().n;
  ok(walked === 20 && before === 360, `L3 · the week's range: ${walked} index rows on idx_transmission_contrib where idx_transmission_project's range holds ${before} (300 grades and 40 knowledge writes left out)`);
  const pc = plan(d, EX.CHANGES_WORK_SQL, ["alpha", "2026-09-25T12:00:00Z", 51]);
  ok(/SEARCH t USING INDEX idx_transmission_contrib \(project=\? AND created_at>\?\)/.test(pc) && /SEARCH t USING INDEX idx_transmission_knowledge \(project=\? AND created_at>\?\)/.test(pc) && !/SCAN t\b(?! USING)/.test(pc),
    `L3 · the What changed page reads the work and the knowledge writes on their two partial indexes, never a grade: ${pc.split(" | ").filter((x) => /SEARCH t /.test(x)).join(" | ")}`);
  const work = d.prepare(EX.CHANGES_WORK_SQL).all("alpha", "2026-09-25T12:00:00Z", 51);
  ok(work.length === 51 && work.every((r) => r.kind !== "grade") && work.some((r) => r.kind === "pr") && work.some((r) => r.kind === "knowledge") && work.every((r, j) => !j || work[j - 1].created_at >= r.created_at),
    `L3 · the page's rows: 51 newest, no grade, the work and the knowledge writes merged newest first`);
  const pg = plan(d, EX.GRADED_SINCE_SQL, ["alpha", "2026-09-25T12:00:00Z"]);
  const gn = d.prepare(EX.GRADED_SINCE_SQL).get("alpha", "2026-09-25T12:00:00Z").n;
  ok(/SEARCH t USING INDEX idx_transmission_project \(project=\? AND created_at>\?\)/.test(pg) && gn === EX.GRADED_MAX + 1, `L3 · the grades counted apart, bounded (${gn} = GRADED_MAX + 1, the page says "99+"): ${pg.split(" | ").filter((x) => /SEARCH/.test(x)).join(" | ")}`);
  d.exec("DROP INDEX idx_transmission_contrib");
  let refused = "";
  try { d.prepare(WEEK_SQL(true, false)); } catch (e) { refused = String(e && e.message); }
  ok(/no such index: idx_transmission_contrib/.test(refused), `L3 · both ways: without migrate-061 the week's statement is refused (${refused || "it ran"}): the index is live BEFORE the code`);
}

// ---- F1 (sprint 4, migrate-064): a card's refs read by the cards' primary key; the near-match pool bounded to one project ----
// The refs statement (src/extract.js CARD_REFS_SQL, the card's page and `read`) SEARCHes k_cards by its primary key (project, kind,
// id) and reads the named cards only; the pool (src/knowledge/write.js CARD_POOL_SQL, read only when a ref misses) walks one
// project's range of the primary key, LIMIT CARD_POOL_MAX. Both ways: the same refs statement over a copy of k_cards with no
// key SCANs it.
{
  const EX = await imo(pathToFileURL(join(ENGINE, "src", "extract.js")).href);
  const WR = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "write.js")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z'),('beta','Beta',1,'2026-09-01T00:00:00Z')");
  const C = d.prepare("INSERT INTO k_cards (project,kind,id,name,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,'p-owner','2026-09-01','p-owner','2026-09-01')");
  for (let k = 0; k < 600; k++) C.run(k % 3 ? "alpha" : "beta", ["claim", "copy", "target"][k % 3], `c-${k}`, `card ${k}`);
  const want = JSON.stringify([["claim", "c-3"], ["copy", "c-1"], ["claim", "c-999"]]);
  const pr = plan(d, EX.CARD_REFS_SQL, ["alpha", want]);
  const rows = d.prepare(EX.CARD_REFS_SQL).all("alpha", want);
  ok(/SEARCH k_cards USING INDEX sqlite_autoindex_k_cards_1 \(project=\? AND kind=\? AND id=\?\)/.test(pr) && !bareScan(pr, "k_cards") && rows.map((r) => `${r.kind}/${r.id}`).sort().join() === "copy/c-1",
    `F1 · a card's refs read by the primary key, the named cards only (c-3 is beta's, c-999 is none): ${pr}`);
  d.exec("CREATE TABLE k_cards_nokey AS SELECT * FROM k_cards");
  const pn = plan(d, EX.CARD_REFS_SQL.replace("FROM k_cards", "FROM k_cards_nokey"), ["alpha", want]);
  ok(bareScan(pn, "k_cards_nokey"), `F1 · both ways: the same statement over a table with no key scans it (${pn})`);
  const pp = plan(d, WR.CARD_POOL_SQL, ["alpha"]);
  const pool = d.prepare(WR.CARD_POOL_SQL).all("alpha");
  ok(/SEARCH c USING INDEX sqlite_autoindex_k_cards_1 \(project=\?\)/.test(pp) && !bareScan(pp, "c") && pool.length === 400 && pool.length <= WR.CARD_POOL_MAX,
    `F1 · the near-match pool walks one project's cards on the primary key, bounded (${pool.length} of alpha's, LIMIT ${WR.CARD_POOL_MAX}): ${pp}`);
}

// ---- M6 (sprint 4, migrate-065): a screen's takes, the strip on its inspector, one SEARCH ----------------------------------------
// The strip (src/knowledge/screens.js SCREEN_TAKES_SQL) SEARCHes idx_k_screen_takes_screen in its order (newest first, no sort)
// and probes people, k_styles and k_renders by their keys; the restore's take (src/knowledge/write.js TAKES_OF_SQL) and the body
// route (RENDER_BODY_SQL) SEARCH idx_k_screen_takes_hash. Both ways: with the screen index dropped, the strip sorts.
{
  const SC = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "screens.js")).href);
  const WR = await imo(pathToFileURL(join(ENGINE, "src", "knowledge", "write.js")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z')");
  const T = d.prepare("INSERT INTO k_screen_takes (project,screen,state,variant,format,take,hash,bytes,filed_at,filed_by) VALUES ('alpha',?,?,'','html',?,?,10,?,'p-owner')");
  for (let k = 0; k < 900; k++) T.run(`screen:s${k % 30}`, `st${k % 4}`, Math.floor(k / 60) + 1, String(k % 10).repeat(63) + (k % 16).toString(16), `2026-09-${String(1 + (k % 28)).padStart(2, "0")}T00:00:00Z`);
  const ps = plan(d, SC.SCREEN_TAKES_SQL, ["alpha", "screen:s3"]);
  ok(/SEARCH t USING INDEX idx_k_screen_takes_screen \(project=\? AND screen=\?\)/.test(ps) && !/TEMP B-TREE/.test(ps) && !bareScan(ps, "t") && d.prepare(SC.SCREEN_TAKES_SQL).all("alpha", "screen:s3").length === SC.TAKES_MAX,
    `M6 · a screen's last ${SC.TAKES_MAX} takes: one SEARCH on idx_k_screen_takes_screen in index order, each join a key probe: ${ps}`);
  const ph = plan(d, WR.TAKES_OF_SQL, ["alpha", "[]"]), pb = plan(d, SC.RENDER_BODY_SQL, ["alpha", "a".repeat(64), null]);
  ok(/SEARCH k_screen_takes USING INDEX idx_k_screen_takes_hash \(project=\? AND hash=\?\)/.test(ph) && /SEARCH t USING INDEX idx_k_screen_takes_hash \(project=\? AND hash=\?\)/.test(pb) && !bareScan(ph, "k_screen_takes"),
    `M6 · the restore's take and the body route find a take by its hash on idx_k_screen_takes_hash: ${ph} · ${pb}`);
  d.exec("DROP INDEX idx_k_screen_takes_screen");
  const pn = plan(d, SC.SCREEN_TAKES_SQL, ["alpha", "screen:s3"]);
  ok(/TEMP B-TREE/.test(pn) || bareScan(pn, "t"), `M6 · both ways: without idx_k_screen_takes_screen the strip sorts or scans (${pn})`);
}

// ---- D5L (sprint 4): `updates`' own items, every region a window with the answer's `limit` in its SQL ------------------------
// The four statements src/thread.js runs (src/hotsql.js THREAD_YOURS_SQL · THREAD_WAITING_SQL · THREAD_REPORTS_SQL ·
// THREAD_QUESTIONS_SQL), EXPLAINed on boot.sql: each SEARCHes an index in the order it reads, no sort, no SCAN of a table (a
// project-less org's queue, no filter at all, walks the partial index of open owner rows alone). Both ways: your filings without
// the unary + walk idx_transmission_eval_created (every unmarked filing of the org), the queue without INDEXED BY walks
// idx_transmission_project (every filing of the project). Through the real handler: the owner's GET /updates and the bell's
// ?limit=1 read the open items ONCE (the heartbeat's statement; the thread takes them from it), the queue ONCE with the
// answer's limit, and never the rulings by a sort of the owner's whole ledger; the instrument: the open items read twice, red.
{
  const D = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z')");
  d.exec("UPDATE transmission SET project = CASE WHEN rowid % 3 = 0 THEN NULL ELSE 'alpha' END");
  const cut = "2026-09-01T05:00:00.000Z";
  const noTableScan = (p) => !/(^|\| )SCAN (?!t USING INDEX idx_transmission_owner_open\b)/.test(p) && !/TEMP B-TREE/.test(p);
  for (const ev of [false, true]) {
    const y = plan(d, D.THREAD_YOURS_SQL(ev), ["p-owner", 20]);
    ok(/^SEARCH t USING INDEX idx_transmission_submitter \(submitter=\?\)/.test(y) && /SEARCH a USING INDEX idx_approval_audit_tx \(transmission_id=\?\)/.test(y) && noTableScan(y),
      `D5L · your filings${ev ? " (suite rows in)" : ""} walk idx_transmission_submitter newest first to the LIMIT, each one's rulings a probe: ${y}`);
  }
  const y0 = plan(d, D.THREAD_YOURS_SQL(false).replace("+t.eval", "t.eval"), ["p-owner", 20]);
  ok(!/^SEARCH t USING INDEX idx_transmission_submitter/.test(y0), `D5L · both ways: your filings without the unary + walk another index (${y0.split(" | ")[0]})`);
  for (const [label, sql, args, re] of [
    ["the owner's queue in a project, from the cut", D.THREAD_WAITING_SQL(false, "eq", cut, 20), [cut, "alpha"], /^SEARCH t USING INDEX idx_transmission_owner_open \(project=\? AND created_at>\?\)/],
    ["the owner's queue in a project, no cut", D.THREAD_WAITING_SQL(true, "eq", null, 1), ["alpha"], /^SEARCH t USING INDEX idx_transmission_owner_open \(project=\?\)/],
    ["the org-level queue (project IS NULL)", D.THREAD_WAITING_SQL(false, "null", cut, 20), [cut], /^SEARCH t USING INDEX idx_transmission_owner_open \(project=\? AND created_at>\?\)/],
    ["a project-less org's queue (no filter)", D.THREAD_WAITING_SQL(false, "none", null, 20), [], /^SCAN t USING INDEX idx_transmission_owner_open\b/],
    ["your reports", D.THREAD_REPORTS_SQL(false), ["p-owner", 20], /^SEARCH events USING INDEX idx_events_person_kind \(person_id=\? AND kind=\?\)$/],
    ["your questions", D.THREAD_QUESTIONS_SQL(false), ["p-owner", 20], /^SEARCH events USING INDEX idx_events_person_kind \(person_id=\? AND kind=\?\)$/],
  ]) {
    const p = plan(d, sql, args);
    ok(re.test(p) && (label.includes("no filter") || noTableScan(p)), `D5L · ${label}: ${p}`);
  }
  const w0 = plan(d, D.THREAD_WAITING_SQL(false, "eq", cut, 20).replace(" INDEXED BY idx_transmission_owner_open", ""), [cut, "alpha"]);
  ok(!/idx_transmission_owner_open/.test(w0), `D5L · both ways: the queue without INDEXED BY walks another index (${w0.split(" | ")[0]})`);
  ok(/ LIMIT 20$/.test(D.THREAD_WAITING_SQL(false, "eq", cut, 20)) && / LIMIT 1$/.test(D.THREAD_WAITING_SQL(false, "eq", cut, "1; DROP TABLE x")) && /t\.project = \? ORDER BY/.test(D.THREAD_WAITING_SQL(false, "eq", cut, 5)),
    "D5L · the queue's LIMIT is a clamped integer in the text, so the project is its last bind");
  // through the real handler
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const LOOPS = /^SELECT id, title, opened_at, ref FROM loops /;
  let twiceLoops = false;
  const log = [];
  const DB = { prepare(sql) {
    const st = d.prepare(sql);
    const w = (a) => { const once = () => { if (VERSION_READS.has(sql)) return; log.push({ sql, a }); if (twiceLoops && LOOPS.test(sql)) log.push({ sql, a }); };
      return { first: async () => { once(); return st.get(...a) ?? null; }, all: async () => { once(); return { results: st.all(...a) }; }, run: async () => { once(); return { meta: { changes: st.run(...a).changes } }; } }; };
    return { ...w([]), bind: (...a) => w(a) }; } };
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const req = async (path) => {
    const from = log.length;
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept: "application/json", authorization: "Bearer owner-key" } }), { DB, BRAIN }, { waitUntil() {}, passThroughOnException() {} });
    let j = null; try { j = JSON.parse(await r.text()); } catch { j = null; }
    return { status: r.status, j, d1: log.slice(from) };
  };
  const queue = (r) => r.d1.filter((q) => /INDEXED BY idx_transmission_owner_open/.test(q.sql));
  const loops = (r) => r.d1.filter((q) => LOOPS.test(q.sql)).length;
  const oldRulings = (r) => r.d1.filter((q) => /FROM approval_audit a JOIN transmission t/.test(q.sql)).length;
  await req("/updates?project=alpha");   // warm the isolate's own caches
  for (const [path, limit] of [["/updates?project=alpha", 20], ["/updates?project=alpha&limit=1", 1]]) {
    const r = await req(path);
    const qs = queue(r), ys = r.d1.filter((q) => q.sql === D.THREAD_YOURS_SQL(false));
    ok(r.status === 200 && loops(r) === 1 && qs.length === 1 && new RegExp(` LIMIT ${limit}$`).test(qs[0].sql) && qs[0].a[qs[0].a.length - 1] === "alpha"
      && ys.length === 1 && ys[0].a[1] === limit && oldRulings(r) === 0 && r.j && r.j.yours.items.length <= limit,
      `D5L · the owner's GET ${path}: the open items read once (${loops(r)}), the queue once with LIMIT ${limit} on alpha, your filings once with ${limit}, no sort of the whole ledger (${r.d1.length} statements, ${r.j && r.j.yours.count} item(s))`);
  }
  twiceLoops = true;
  const t2 = await req("/updates?project=alpha");
  twiceLoops = false;
  ok(loops(t2) === 2, `D5L · the instrument: a handler reading the open items twice counts ${loops(t2)}, so the check above would go red`);
}

// ---- M4 (sprint 4): the Arch view's marks, ONE statement per diagram, bounded by its ids ---------------------------------------
// src/hotsql.js ARCH_MARKS_SQL (src/knowledge/canvas.js archMarksOf, read with the arch part): each id of the diagram (its parts and
// the service nodes they run on, a json_each list) probes k_node_lights and k_node_stale on their primary keys; the failing and
// stale checks are read only for an id that has one, each on that id's k_check_refs range. No SCAN of a table, whatever else
// the project holds lit (2,000 other lit refs here). Both ways: over a copy of k_node_lights with no key, it scans it. Through
// the real handler: the Arch page runs it exactly ONCE (the arch plane and the page share the canvas read), and the diagram's
// JSON carries what it says: the red part, its failing links, the stale part on its service, the change, the blocked journey.
{
  const D = await imo(pathToFileURL(join(ENGINE, "src", "hotsql.js")).href);
  const d = seeded();
  d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z')");
  const now = new Date().toISOString(), N = d.prepare("INSERT INTO k_nodes (project,id,type,name,status,data,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,NULL,?,'p-owner',?,'p-owner',?)");
  const old = "2026-09-01T00:00:00Z";
  N.run("architecture:main", "architecture", "Architecture", JSON.stringify({ diagram: {
    nodes: [{ id: "app", kind: "client", title: "App" }, { id: "door", kind: "worker", title: "Door", service: "edge" }, { id: "core", kind: "worker", title: "Core" }, { id: "db", kind: "data", title: "DB", service: "store" }],
    edges: [{ from: "app", to: "door" }, { from: "door", to: "core" }, { from: "core", to: "db" }],
    paths: [{ name: "A write", steps: [{ from: "app", to: "door" }, { from: "door", to: "core" }, { from: "core", to: "db" }] }] } }), old, old);
  N.run("service:edge", "service", "Edge", "{}", old, now);   // the service a part runs on, filed this week
  N.run("service:store", "service", "Store", "{}", old, old);
  const C = d.prepare("INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,'p-owner',?,'p-owner',?)");
  C.run("AC.core", "The core writes once", JSON.stringify(["core"]), old, old);
  C.run("AC.store", "The store keeps it", JSON.stringify(["service:store"]), old, old);
  for (let k = 0; k < 2000; k++) C.run(`AC.x${k}`, `other ${k}`, JSON.stringify([`screen:x${k}`]), old, old);
  const R = d.prepare("INSERT INTO check_results (project,pack_version,check_id,status,graded_by,graded_at) VALUES ('alpha','live',?,?,'p-owner',?)");
  R.run("AC.core", "refused", "2026-09-02T00:00:00Z"); R.run("AC.store", "proven", "2026-09-02T00:00:00Z");
  for (let k = 0; k < 2000; k++) R.run(`AC.x${k}`, k % 3 ? "proven" : "refused", "2026-09-02T00:00:00Z");
  // a change naming the graded store after its grade: its check goes stale (migrate-054's trigger)
  d.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,touches,created_at,org) VALUES ('T-M4','p-owner','code','pr','a change','auto','closed',0,'alpha','service:store',?,1)").run(now);
  const ids = JSON.stringify(["app", "door", "service:edge", "core", "db", "service:store"]);
  const pm = plan(d, D.ARCH_MARKS_SQL, ["alpha", ids]);
  const tableScan = (p) => /(^|\| )SCAN (?!j VIRTUAL TABLE|q\b|CONSTANT ROW)/.test(p);
  ok(/SEARCH l USING INDEX sqlite_autoindex_k_node_lights_1 \(project=\? AND node_id=\?\)/.test(pm) && /SEARCH z USING PRIMARY KEY \(project=\? AND node_id=\?\)/.test(pm)
    && /SEARCH r USING COVERING INDEX sqlite_autoindex_k_check_refs_1 \(project=\? AND ref=\?\)/.test(pm) && /SEARCH x USING INDEX idx_check_results_latest \(project=\? AND check_id=\?\)/.test(pm)
    && /SEARCH s USING PRIMARY KEY \(project=\? AND check_id=\?\)/.test(pm) && /SEARCH c USING INDEX sqlite_autoindex_k_checks_1 \(project=\? AND id=\?\)/.test(pm) && !tableScan(pm),
    `M4 · the marks: the diagram's ids probe the lights and the stale rows on their keys, a failing or stale check on its id's refs, no SCAN of a table: ${pm}`);
  const rows = d.prepare(D.ARCH_MARKS_SQL).all("alpha", ids), by = Object.fromEntries(rows.map((r) => [r.id, r]));
  ok(rows.length === 2 && by.core.light === "red" && /^AC\.core\u001fThe core writes once$/.test(by.core.failing) && by["service:store"].stale === 1 && /^AC\.store\u001fThe store keeps it$/.test(by["service:store"].stale_checks) && by["service:store"].changed_by === "T-M4",
    `M4 · its rows: the ids with a light or a stale row only (${rows.length} of 6 asked, 2,000 other lit refs never read): core red with its failing check, the store stale with its check and the change`);
  d.exec("CREATE TABLE k_node_lights_nokey AS SELECT * FROM k_node_lights");
  const pn = plan(d, D.ARCH_MARKS_SQL.replace("LEFT JOIN k_node_lights l", "LEFT JOIN k_node_lights_nokey l"), ["alpha", ids]);
  ok(/SCAN l\b|BLOOM FILTER ON l|AUTOMATIC/.test(pn), `M4 · both ways: over lights with no key the statement scans them (${pn.split(" | ").filter((x) => / l\b/.test(x)).join(" | ")})`);
  d.exec("DROP TABLE k_node_lights_nokey");
  // through the real handler
  const { default: handler } = await imo(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const log = [];
  const DB = { prepare(sql) {
    const st = d.prepare(sql);
    const w = (a) => { const once = () => { log.push(sql); };
      return { first: async () => { once(); return st.get(...a) ?? null; }, all: async () => { once(); return { results: st.all(...a) }; }, run: async () => { once(); return { meta: { changes: st.run(...a).changes } }; } }; };
    return { ...w([]), bind: (...a) => w(a) }; } };
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  const get = async (path, accept) => {
    const from = log.length;
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, authorization: "Bearer owner-key" } }), { DB, BRAIN }, { waitUntil() {}, passThroughOnException() {} });
    return { status: r.status, text: await r.text(), d1: log.slice(from) };
  };
  await get("/map/arch?project=alpha", "text/html");
  const pg = await get("/map/arch?project=alpha", "text/html");
  const marks = pg.d1.filter((q) => q === D.ARCH_MARKS_SQL).length;
  const data = JSON.parse((/<script type="application\/json" id="ar-data">([\s\S]*?)<\/script>/.exec(pg.text) || [, "null"])[1]);
  const M = data && data.M, at = (id) => M.nodes.findIndex((n) => n.id === id);
  ok(pg.status === 200 && marks === 1 && M && M.nodes[at("core")].light === "red" && M.nodes[at("core")].check.title === "The core writes once" && M.links.filter((l) => l.fail).length === 2
    && M.nodes[at("db")].stale === 1 && M.nodes[at("db")].regrade.join() === "AC.store" && M.nodes[at("door")].changed && M.nodes[at("db")].changed && !M.nodes[at("app")].changed
    && M.paths[0].block && M.paths[0].block.step === 1 && M.paths[0].block.part === at("core"),
    `M4 · GET /map/arch (the page) runs the marks ONCE (${marks}) and its diagram says it: core red (2 failing links), db stale on its service, door and db changed this week, the write blocked at step 2 — ${pg.status} ${JSON.stringify(M && M.lit)}`);
  const js = await get("/map/arch?project=alpha", "application/json");
  ok(js.status === 200 && js.d1.filter((q) => q === D.ARCH_MARKS_SQL).length === 1, `M4 · the arch plane's JSON reads the same one statement (${js.d1.filter((q) => q === D.ARCH_MARKS_SQL).length})`);
}

console.log(`d1-hot-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
