// tools/clean-eval-check-results-selftest.mjs — release-heal (2026-09-22, Q5992857D).
//
// #159 (heal0922:B3-heal) fixed a real FK gap in src/admin.js's clean-eval action (check_results.
// transmission_id is a real FK onto transmission(id) as of migrate-032.sql) by adding a DELETE
// against check_results itself — which is a regression against a STANDING owner ruling (Q5992857D,
// 2026-09-18): "check_results is authored — every grade kept as history, never overwritten." This
// selftest proves the FIX for that regression against a REAL SQLite DB (node:sqlite, boot.sql applied
// verbatim — the same shape gate.sh's tools/fk-enforce-selftest.py already proves the schema against)
// running the ACTUAL `runControlAction` export from src/admin.js, never a hand-typed mirror of its SQL
// — "the verifier is never the author" cuts both ways: a test that reimplements the fix under test
// would prove nothing but its own reimplementation.
//
// Two cases the ruling requires, plus a third proving the split is per-row:
//   1. an eval transmission a check_results row still references survives clean-eval, its grade intact,
//      and so do its approval_audit / transmission_refs rows (exactly as a REAL, non-eval row would).
//   2. an eval transmission with no check_results row pointing at it is removed, exactly as before.
//   3. both in the same sweep — the kept one survives, the unreferenced one still goes.
//
//   4. (sprint 6, 6.3: an owner owns one org) two orgs in one database: each admin's sweep removes its OWN org's marked rows
//      only — the other org's eval events, files, ledger rows and sign-in attempts stay — and (sprint 6, 6.4) the suites'
//      handoff objects in R2 under its own org's prefix only: org 2's sweep deletes o2/… alone; org 1's o1/… alone — a key
//      with no org prefix (a bare key, as the code before 6.4 wrote) is no org's, org 1's included, and no sweep touches it.
//
// This is the code-level proof; the board's own RLC.Q5992857D probe (a static grep for any
// UPDATE/DELETE against check_results in engine/src) is the belt gate.sh does not run directly but
// the land door and this batch's own acceptance both check.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runControlAction } from "../src/admin.js";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const boot = readFileSync(join(ENGINE, "boot.sql"), "utf8");

// A thin D1 shim over node:sqlite — only the surface runControlAction's clean-eval branch calls:
// env.DB.prepare(sql).bind(...).run()/.first()/.all(), plus env.BRAIN.list/delete (R2 — an in-memory bucket, `objects`, empty
// unless a case fills it, so `handoffs` reads 0; list honours its prefix). The env is signed in to `org` (src/data.js:
// the admin's sign-in names the org every statement acts on).
function makeEnv(db, org = 1, objects = new Map()) {
  const DB = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      // D1's real Prepared Statement lets a caller `.run()/.first()/.all()` straight off `prepare()`
      // (no params) OR chain through `.bind(...)` first (params) — admin.js's clean-eval branch uses
      // both shapes (`.bind(...).run()` for the deletes, a bare `.first()` for the kept-count query),
      // so this shim must answer to both.
      const wrap = (args) => ({
        run: () => { const info = stmt.run(...args); return { meta: { changes: info.changes } }; },
        first: () => stmt.get(...args),
        all: () => ({ results: stmt.all(...args) }),
      });
      return { ...wrap([]), bind: (...args) => wrap(args) };
    },
  };
  const BRAIN = { objects, list: async ({ prefix }) => ({ objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
    delete: async (k) => { objects.delete(k); } };
  return asOrg({ DB, BRAIN }, org);
}

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(boot);
  return db;
}

function seedPerson(db, id = "p1") {
  db.prepare("INSERT INTO people (id,name,role,key_hash,created_at,org) VALUES (?,?,?,?,?,1)")
    .run(id, "Test Person", "owner", `hash-${id}`, "2026-09-22T00:00:00.000Z");
}
function seedProject(db, key = "proj1") {
  db.prepare("INSERT INTO projects (key,name,created_at) VALUES (?,?,?)")
    .run(key, "Test Project", "2026-09-22T00:00:00.000Z");
}
function seedEvalTransmission(db, id) {
  db.prepare("INSERT INTO transmission (id,submitter,lane,route,status,eval,created_at,org) VALUES (?,?,?,?,?,1,?,1)")
    .run(id, "p1", "code", "auto", "received", "2026-09-22T00:00:00.000Z");
}

let fail = 0, checks = 0;
const eq = (got, want, label) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    fail = 1;
  }
};

// case 1 — an eval transmission a check_results row still references survives, grade intact
{
  const db = freshDb();
  seedPerson(db); seedProject(db);
  seedEvalTransmission(db, "T-eval-kept");
  db.prepare("INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)")
    .run("AA-1", "T-eval-kept", "approve", "p1", "2026-09-22T00:00:00.000Z");
  db.prepare("INSERT INTO transmission_refs (tid,ref) VALUES (?,?)").run("T-eval-kept", "note-1");
  db.prepare("INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by) VALUES (?,?,?,?,?,?)")
    .run("proj1", "v1", "AC.01", "proven", "T-eval-kept", "p1");

  const env = makeEnv(db);
  const flash = await runControlAction({ action: "clean-eval", fd: null, personId: null, env, reader: null });

  const grade = db.prepare("SELECT * FROM check_results WHERE check_id='AC.01'").get();
  eq(!!grade, true, "case 1: the check_results grade itself is never deleted");
  eq(grade && grade.status, "proven", "case 1: the grade's own status is untouched");
  eq(!!db.prepare("SELECT * FROM transmission WHERE id='T-eval-kept'").get(), true,
    "case 1: the eval transmission a check_results row references is KEPT, not swept");
  eq(!!db.prepare("SELECT * FROM approval_audit WHERE transmission_id='T-eval-kept'").get(), true,
    "case 1: its approval_audit row is kept alongside it");
  eq(!!db.prepare("SELECT * FROM transmission_refs WHERE tid='T-eval-kept'").get(), true,
    "case 1: its transmission_refs row is kept alongside it");
  eq(flash.includes("check_results kept 1"), true, `case 1: the flash names the kept count by name — got: ${flash}`);
}

// case 2 — an eval transmission with no check_results row pointing at it is removed, exactly as before
{
  const db = freshDb();
  seedPerson(db); seedProject(db);
  seedEvalTransmission(db, "T-eval-gone");
  db.prepare("INSERT INTO approval_audit (id,transmission_id,verdict,decided_by,created_at,org) VALUES (?,?,?,?,?,1)")
    .run("AA-2", "T-eval-gone", "approve", "p1", "2026-09-22T00:00:00.000Z");
  db.prepare("INSERT INTO transmission_refs (tid,ref) VALUES (?,?)").run("T-eval-gone", "note-2");

  const env = makeEnv(db);
  const flash = await runControlAction({ action: "clean-eval", fd: null, personId: null, env, reader: null });

  eq(db.prepare("SELECT * FROM transmission WHERE id='T-eval-gone'").get(), undefined,
    "case 2: an eval transmission with no check_results reference is removed");
  eq(db.prepare("SELECT * FROM approval_audit WHERE transmission_id='T-eval-gone'").get(), undefined,
    "case 2: its approval_audit row goes with it");
  eq(db.prepare("SELECT * FROM transmission_refs WHERE tid='T-eval-gone'").get(), undefined,
    "case 2: its transmission_refs row goes with it");
  eq(flash.includes("check_results kept 0"), true, `case 2: the flash names zero kept — got: ${flash}`);
}

// case 3 — both in the SAME sweep: the split is per-row, never all-or-nothing
{
  const db = freshDb();
  seedPerson(db); seedProject(db);
  seedEvalTransmission(db, "T-eval-kept-2");
  seedEvalTransmission(db, "T-eval-gone-2");
  db.prepare("INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by) VALUES (?,?,?,?,?,?)")
    .run("proj1", "v1", "AC.02", "proven", "T-eval-kept-2", "p1");

  const env = makeEnv(db);
  await runControlAction({ action: "clean-eval", fd: null, personId: null, env, reader: null });

  eq(!!db.prepare("SELECT * FROM transmission WHERE id='T-eval-kept-2'").get(), true,
    "case 3: the referenced one survives");
  eq(db.prepare("SELECT * FROM transmission WHERE id='T-eval-gone-2'").get(), undefined,
    "case 3: the unreferenced one is still removed in the same sweep");
}

// case 4 — two orgs: each admin sweeps its own org's marked rows only (sprint 6, 6.3)
{
  const db = freshDb();
  seedPerson(db); seedProject(db);
  db.prepare("INSERT INTO people (id,name,role,key_hash,created_at,org) VALUES ('q1','Org Two Owner','owner','hash-q1','2026-09-22T00:00:00.000Z',2)").run();
  db.prepare("INSERT INTO projects (key,name,created_at) VALUES ('o2--shop','Shop','2026-09-22T00:00:00.000Z')").run();
  const T = db.prepare("INSERT INTO transmission (id,submitter,lane,route,status,eval,created_at,org,project) VALUES (?,?,?,?,?,1,?,?,?)");
  T.run("T-eval-one", "p1", "code", "auto", "received", "2026-09-22T00:00:00.000Z", 1, "proj1");
  T.run("T-eval-two", "q1", "code", "auto", "received", "2026-09-22T00:00:00.000Z", 2, "o2--shop");
  const E = db.prepare("INSERT INTO events (id,person_id,kind,payload_json,created_at,org) VALUES (?,?,'note','{\"eval\":1}','2026-09-22T00:00:00.000Z',?)");
  E.run("ev-one", "p1", 1); E.run("ev-two", "q1", 2);
  const A = db.prepare("INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,org) VALUES (?,?,'doc','x','k','s',1,'eval','2026-09-22T00:00:00.000Z',?)");
  A.run("art-one", "p1", 1); A.run("art-two", "q1", 2);
  const L = db.prepare("INSERT INTO login_attempts (id,email,ok,at,org) VALUES (?,?,0,'2026-09-22T00:00:00.000Z',?)");
  L.run("la-one", "x@one.invalid", 1); L.run("la-two", "x@two.invalid", 2);
  const left = () => ({
    tx: db.prepare("SELECT id FROM transmission ORDER BY id").all().map((r) => r.id),
    ev: db.prepare("SELECT id FROM events ORDER BY id").all().map((r) => r.id),
    art: db.prepare("SELECT id FROM artifacts ORDER BY id").all().map((r) => r.id),
    la: db.prepare("SELECT id FROM login_attempts ORDER BY id").all().map((r) => r.id),
  });
  // the suites' handoffs: org 1's and org 2's under their prefixes, one under a bare key (no org's); a real handoff of each
  const bucket = new Map(["o1/inbox/handoffs/eval/2026-09/h1.json", "inbox/handoffs/eval/2026-09/h0.json", "o2/inbox/handoffs/eval/2026-09/h2.json",
    "o1/inbox/handoffs/2026-09/real1.json", "o2/inbox/handoffs/2026-09/real2.json", "inbox/handoffs/2026-09/real0.json"].map((k) => [k, "{}"]));
  const two = makeEnv(db, 2, bucket);
  const f2 = await runControlAction({ action: "clean-eval", fd: null, personId: null, env: two, reader: null });
  eq(left(), { tx: ["T-eval-one"], ev: ["ev-one"], art: ["art-one"], la: ["la-one"] }, `case 4: org 2's sweep removes org 2's marked rows and leaves org 1's (${f2})`);
  eq([[...bucket.keys()].sort(), f2.includes("handoffs 1")], [["inbox/handoffs/2026-09/real0.json", "inbox/handoffs/eval/2026-09/h0.json", "o1/inbox/handoffs/2026-09/real1.json",
    "o1/inbox/handoffs/eval/2026-09/h1.json", "o2/inbox/handoffs/2026-09/real2.json"], true], "case 4: org 2's sweep deletes its own suites' handoff (o2/…) alone");
  const one = makeEnv(db, 1, bucket);
  const f1 = await runControlAction({ action: "clean-eval", fd: null, personId: null, env: one, reader: null });
  eq(left(), { tx: [], ev: [], art: [], la: [] }, "case 4: org 1's sweep removes org 1's");
  eq([[...bucket.keys()].sort(), f1.includes("handoffs 1")], [["inbox/handoffs/2026-09/real0.json", "inbox/handoffs/eval/2026-09/h0.json", "o1/inbox/handoffs/2026-09/real1.json",
    "o2/inbox/handoffs/2026-09/real2.json"], true],
    "case 4: org 1's sweep deletes its suites' handoff under o1/ alone — never the bare key (no org's), never org 2's, never a real handoff");
}

if (fail) {
  console.log(`  → clean-eval/check_results case(s) failed (${checks} checks run)`);
  process.exit(1);
}
console.log(`  ✓ clean-eval never deletes check_results and keeps every eval transmission (and its approval_audit/transmission_refs rows) a grade still references (${checks} checks)`);
