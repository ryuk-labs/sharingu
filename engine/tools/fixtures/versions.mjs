// tools/fixtures/versions.mjs — the Versions fixture for tools/wire-selftest.mjs and tools/d1-hot-selftest.mjs. Not hand-typed
// rows: a REAL SQLite built from boot.sql (node:sqlite, a D1 binding whose batch is ONE transaction, as D1's is), project Alpha
// (key alpha) beside Beta in the org Northwind, the owner Owen Park (p-o) and Rae Kim seated on alpha (p-c), the knowledge
// filed through the real write door and the versions made through the real seam (src/knowledge/versions.js):
//   v1  "The first cut": a goal tree and two questions, RULED_QID open
//   v2  V2_TITLE: RULED_QID ruled (B), so v2's changes from v1 name it
// versionsFixture({ empty, sqlite }) -> { env, sqlite, v1, v2 }: env.DB the binding, env.BRAIN the tenant manifest only (the
// org root, scoped to alpha); empty: the knowledge filed and no version made.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { asOrg } from "./org.mjs";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
export const RULED_QID = "QF0000004";
export const V1_TITLE = "The first cut", V2_TITLE = "Keep the ruled versions, thin the scans later";
export const OWNER = { id: "p-o", name: "Owen Park", role: "owner", viaCookie: true };
export const SEAT = { id: "p-c", name: "Rae Kim", role: "internal-eng", viaCookie: true };

// d1(sqlite) — a D1-shaped binding: prepare(sql).bind(...).first/all/run, batch = one transaction
export function d1(sqlite) {
  const exec = (sql, args) => (/^\s*(SELECT|WITH)\b/i.test(sql) ? { results: sqlite.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } });
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { sqlite.exec("BEGIN"); try { const out = list.map((s) => s._exec()); sqlite.exec("COMMIT"); return out; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
}
export function seededVersionsDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  const T0 = "2026-09-01T00:00:00.000Z";
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)");
  P.run("p-o", "Owen Park", "owen@northwind.test", "owner", "h-o", T0);
  P.run("p-c", "Rae Kim", "rae@northwind.test", "internal-eng", "h-c", T0);
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}'),('beta','Beta',1,'${T0}')`);
  db.exec(`INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-c','alpha','member','${T0}')`);
  return db;
}
const brainOf = (extra = {}) => {
  const files = { ...extra };
  const obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t) });
  return { get: async (k) => (files[k] != null ? obj(files[k]) : null), head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) };
};
const G = (id, parent) => ({ kind: "goal", op: "upsert", data: { id, title: id.replace(/-/g, " "), parent } });
export async function versionsFixture(o = {}) {
  const { writeKnowledge } = await imp("src/knowledge/write.js");
  const { publishVersion } = await imp("src/knowledge/versions.js");
  const sqlite = o.sqlite || seededVersionsDb();
  const env = asOrg({ DB: d1(sqlite), BRAIN: brainOf(o.files), [Symbol.for("sharingu.project")]: "alpha" });   // read in alpha (src/project.js PROJECT), signed in to org 1
  const q = (status, extra = {}) => ({ kind: "question", op: "upsert", data: { qid: RULED_QID, question: "Keep every version, or thin them?", status, options: [{ what: "Keep every one" }, { what: "Keep the ruled ones, thin the scans later" }], ...extra } });
  await writeKnowledge(OWNER, { project: "alpha", ops: [G("ship-it", null), G("file-it", "ship-it"), G("see-it", "ship-it"), q("open"),
    { kind: "question", op: "upsert", data: { qid: "QF0000001", question: "One product?", status: "decided", choice: 0, label: "One product", options: [{ what: "Yes" }, { what: "No" }] } }] }, env);
  if (o.empty) return { env, sqlite, v1: null, v2: null };
  const v1 = (await publishVersion(OWNER, { project: "alpha", title: V1_TITLE }, env)).version;
  await writeKnowledge(OWNER, { project: "alpha", ops: [q("decided", { choice: 1, label: V2_TITLE })] }, env);
  const v2 = (await publishVersion(OWNER, { project: "alpha", title: V2_TITLE }, env)).version;
  return { env, sqlite, v1, v2 };
}
