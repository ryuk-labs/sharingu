// tools/canvas-selftest.mjs — the Map's model read, offline (no worker): src/knowledge/canvas.js canvasOf is the inverse of
// the importer's model mappers (tools/import/model.mjs + flows.mjs), and src/knowledge/checks.js lights a node from its
// checks' latest grades. On a REAL SQLite built from boot.sql (node:sqlite, a D1-shaped binding):
//   1. the round trip: each pinned canvas fixture (and the brain's own model.json when it is on this machine) filed through
//      the importer's mappers reads back section by section as the source (key order aside); a relation whose end is not
//      one of the model's entities is the one thing the import cannot hold;
//   2. the derived deps: the cheapest move and the counts equal the source's;
//   3. the lights (read off k_node_lights, migrate-043): grey with no grade, amber partly graded, green all passing, red one
//      failing, the latest grade winning;
//   4. k_check_refs follows k_checks.refs through the write door (an upsert that changes refs, one that leaves them, a
//      remove), and migrate-040 fills it from the checks already filed (a database the importer filled before it).
// Exit code decides.   node tools/canvas-selftest.mjs [model.json]
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { canvasOf, nodeAt } from "../src/knowledge/canvas.js";
import { countsFor, lightOf, checksFor } from "../src/knowledge/checks.js";
import { writeKnowledge } from "../src/knowledge/write.js";
import { asOrg } from "./fixtures/org.mjs";
import { seedModel, seedChecks, seedGrade } from "./fixtures/model-d1.mjs";
import { screenData } from "./import/renders.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
let passes = 0, fails = 0;
const ok = (c, label) => { if (c) passes++; else fails++; console.log(`${c ? "PASS" : "FAIL"}  ${label}`); };
const read = (p) => readFileSync(join(ENGINE, p), "utf8");
const BOOT = read("boot.sql"), M039 = read("migrate-039.sql"), M040 = read("migrate-040.sql");
const canon = (v) => (Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : v && typeof v === "object"
  ? "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v === undefined ? null : v));
function d1(db) {
  const exec = (sql, args) => (/^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args) } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } });
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => exec(sql, args), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
function fresh() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON"); db.exec(BOOT); db.exec(M039); db.exec(M040);   // both replays over boot.sql: no-ops
  db.exec("INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p-owner','Olive','owner','h1',1,'t',1)");
  db.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'t')");
  return db;
}
const envOf = (db) => asOrg({ DB: d1(db), [Symbol.for("sharingu.project")]: "alpha", BRAIN: { get: async () => null, head: async () => null, list: async () => ({ objects: [] }) } });   // signed in to org 1

// ---- 1 + 2. the round trip ----
function roundTrip(label, src, o = {}) {
  const db = fresh();
  seedModel(db, "alpha", src, { by: "p-owner", entities: o.entities });
  return canvasOf(envOf(db), "alpha").then(({ canvas: c, v }) => {
    const ents = new Set((c.entities || []).map((e) => e.id));
    const same = (name, a, b, key) => {
      const by = new Map((b || []).map((x) => [key(x), x]));
      const miss = (a || []).filter((x) => !by.has(key(x))).map(key), diff = (a || []).filter((x) => by.has(key(x)) && canon(x) !== canon(by.get(key(x)))).map(key);
      ok(!miss.length && !diff.length && (a || []).length === (b || []).length, `${label} · ${name}: ${(a || []).length} read back as filed${miss.length ? ` — missing [${miss.slice(0, 3)}]` : ""}${diff.length ? ` — differing [${diff.slice(0, 3)}]` : ""}`);
    };
    if (src.surfaces) ok(canon(c.surfaces) === canon(src.surfaces) && canon(c.surfaceLabels) === canon(src.surfaceLabels || {}), `${label} · surfaces and their labels`);
    if (src.lanes) same("lanes", src.lanes, c.lanes, (x) => x.id);
    // a screen is filed in the standard (docs/plan/ARCHITECTURE.md §11, import/renders.mjs screenData): its state names, its
    // wireframe from its layout fields; what reads back is the row as the importer filed it
    if (src.screens) same("screens", src.screens.map(({ id, name, status, ...rest }) => ({ id, name, ...(status !== undefined ? { status } : {}), ...screenData({ id, name }, rest, {}) })), c.screens, (x) => x.id);
    if (src.edges) same("nav edges", src.edges.map((e) => ({ ...e, label: e.label ?? null })), c.edges, (x) => `${x.from}>${x.to}|${x.label ?? ""}`);
    if (src.entities && src.entities.length) same("entities", src.entities, c.entities, (x) => x.id);
    if (src.tables) same("tables", src.tables, c.tables, (x) => x.name);
    if (src.api) same("api", src.api, c.api, (x) => x.id);
    if (src.flows) same("flows", src.flows, c.flows, (x) => x.id);
    if (src.relations) {
      const holdable = src.relations.filter((r) => ents.has(r.from) && ents.has(r.to));
      same(`relations (${src.relations.length - holdable.length} naming no entity of the model)`, holdable, c.relations, (x) => `${x.from}>${x.to}|${x.verb}`);
    }
    if (src.gaps) for (const k of ["missingLinks", "ambiguities", "unknowns"]) same(`gaps.${k}`, (src.gaps[k] || []).map((g) => ({ ...g, retired: !!g.retired })), c.gaps[k], (x) => x.id);
    if (src.deps) {
      same("deps.chains", src.deps.chains, c.deps.chains, (x) => x.head.qid);
      ok(canon(c.deps.cheapest) === canon(src.deps.cheapest) && canon(c.deps.counts) === canon(src.deps.counts), `${label} · deps: the cheapest move and the counts derived from the chains equal the source's ${canon(c.deps.counts)}`);
    }
    if (src.architecture) {
      for (const k of ["summary", "diagram", "crossing"]) if (k in src.architecture) ok(canon(c.architecture[k]) === canon(src.architecture[k]), `${label} · architecture.${k} verbatim`);
      if (src.architecture.services) same("architecture.services", src.architecture.services, c.architecture.services, (x) => x.id);
    }
    ok(/^[0-9a-f]{8}$/.test(v), `${label} · the stamp v${v}`);
  });
}
const fx = (n) => JSON.parse(read(`tools/fixtures/${n}.json`));
await roundTrip("map-canvas", fx("map-canvas"));
await roundTrip("model-canvas", fx("model-canvas"), { entities: true });
await roundTrip("flows-canvas", fx("flows-canvas"));
const MODEL = process.argv[2] || join(homedir(), "batcave_vm/batcave/agent-rl-sharingu-brain/source/board/model.json");
if (existsSync(MODEL)) await roundTrip("the brain's model.json", JSON.parse(readFileSync(MODEL, "utf8")));
else console.log(`SKIP  the brain's model.json (${MODEL} is not on this machine)`);

// ---- 3. the lights ----
{
  const db = fresh(), env = envOf(db);
  seedModel(db, "alpha", fx("map-canvas"), { by: "p-owner" });
  seedChecks(db, "alpha", [{ id: "c1", refs: ["screen:home"] }, { id: "c2", refs: ["screen:home", "table:people"] }, { id: "c3", refs: ["table:people"] }]);
  const light = async (id) => lightOf((await countsFor({ DB: env.DB }, "alpha", [id])).get(id));
  ok((await light("screen:home")) === "grey" && (await light("screen:decisions")) === "grey", "lights: no grade (and no check) is grey");
  seedGrade(db, "alpha", "c1", "proven", { at: "2026-09-30T01:00:00Z" });
  ok((await light("screen:home")) === "amber", "lights: one of two checks graded is amber");
  seedGrade(db, "alpha", "c2", "proven", { at: "2026-09-30T01:00:00Z" });
  ok((await light("screen:home")) === "green" && (await light("table:people")) === "amber", "lights: every check passing is green (screen:home); a node another check names stays amber (table:people)");
  seedGrade(db, "alpha", "c2", "refused", { at: "2026-09-30T02:00:00Z" });
  ok((await light("screen:home")) === "red", "lights: the latest grade wins — c2 refused after proven turns screen:home red");
  seedGrade(db, "alpha", "c2", "proven", { at: "2026-09-30T03:00:00Z" });
  ok((await light("screen:home")) === "green", "lights: ...and proven again turns it green");
  seedGrade(db, "alpha", "c3", "incomplete", { at: "2026-09-30T03:00:00Z" });
  const people = (await countsFor({ DB: env.DB }, "alpha", ["table:people"])).get("table:people");
  ok(lightOf(people) === "amber" && people.total === 2 && people.graded === 2 && people.passed === 1 && people.failed === 0, `lights: an incomplete grade is graded but not passing, amber (${canon(people)})`);
  const { checks } = await checksFor(env, "alpha", ["screen:home"]);
  ok(checks.map((c) => `${c.id}:${c.grade && c.grade.verdict}`).join() === "c1:proven,c2:proven", "checksFor: the checks naming a ref, each with its latest grade");
  const at = await nodeAt(env, "alpha", "screen", "home");
  ok(at && at.node.id === "screen:home" && at.edges.some((e) => e.other.ref === "screen:decisions") && at.edges.every((e) => e.from === "screen:home" || e.to === "screen:home"), "nodeAt: the node and every edge on it, both ways, each with its other end's map ref");
}

// ---- 4. k_check_refs follows the register ----
{
  const db = fresh(), env = envOf(db);
  const owner = { id: "p-owner", name: "Olive", role: "owner" };
  const refs = () => db.prepare("SELECT check_id || '>' || ref AS r FROM k_check_refs ORDER BY check_id, ref").all().map((x) => x.r).join(" ");
  const C = (data) => ({ kind: "check", op: "upsert", data: { title: "t", ...data } });
  const w1 = await writeKnowledge(owner, { project: "alpha", ops: [C({ id: "k1", refs: ["screen:a", "screen:b", "screen:a"] }), C({ id: "k2", refs: ["goal-x"] })] }, env);
  ok(!w1.error && refs() === "k1>screen:a k1>screen:b k2>goal-x", `the write door files checks; k_check_refs holds each ref once (${refs()})`);
  await writeKnowledge(owner, { project: "alpha", ops: [C({ id: "k1", refs: ["table:t"] })] }, env);
  ok(refs() === "k1>table:t k2>goal-x", `an upsert that changes refs replaces them (${refs()})`);
  await writeKnowledge(owner, { project: "alpha", ops: [C({ id: "k1", title: "renamed" })] }, env);
  ok(refs() === "k1>table:t k2>goal-x", "an upsert that leaves refs out keeps them");
  await writeKnowledge(owner, { project: "alpha", ops: [{ kind: "check", op: "remove", data: { id: "k2" } }] }, env);
  ok(refs() === "k1>table:t", `a removed check takes its refs with it (${refs()})`);
  // a database filled before migrate-040: the checks, then the migration
  const pre = new DatabaseSync(":memory:");
  // (a database before 040 is before 043 too: its triggers on k_check_refs and its index on it go with the table)
  pre.exec(BOOT.replace(/CREATE TRIGGER IF NOT EXISTS k_checks_refs_[\s\S]*?END;/g, "").replace(/CREATE TABLE IF NOT EXISTS k_check_refs \([\s\S]*?\n\);/, "")
    .replace(/CREATE TRIGGER IF NOT EXISTS k_node_lights_ref_[\s\S]*?END;/g, "").replace(/CREATE TRIGGER IF NOT EXISTS k_fill_ref_[\s\S]*?END;/g, "")   // migrate-050's, on the same table
    .replace(/CREATE TRIGGER IF NOT EXISTS k_stale_[\s\S]*?END;/g, "")   // migrate-054's (they read k_check_refs; three are on it)
    .replace(/CREATE INDEX IF NOT EXISTS idx_k_check_refs_check [^\n]*\n/, ""));
  pre.exec("INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p','P','owner','h',1,'t',1); INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','A',1,'t')");
  seedChecks(pre, "alpha", [{ id: "old1", refs: ["screen:x", "door:GET:/y"] }, { id: "old2", refs: [] }], { by: "p" });
  let err = null; try { pre.exec(M040); pre.exec(M040); } catch (e) { err = e; }
  const back = pre.prepare("SELECT check_id || '>' || ref AS r FROM k_check_refs ORDER BY r").all().map((x) => x.r).join(" ");
  ok(!err && back === "old1>door:GET:/y old1>screen:x", `migrate-040 fills k_check_refs from the checks already filed, and applies twice (${back || String(err)})`);
}

console.log(`${fails ? "✗" : "✓"} canvas selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
