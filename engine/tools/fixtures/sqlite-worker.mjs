// tools/fixtures/sqlite-worker.mjs — the REAL worker (src/index.js, the artifact the ship deploys) over a node:sqlite D1
// built from boot.sql and an in-memory R2, driven through Request/Response. An offline selftest that files through the door
// uses this instead of a hand-written fake, so a wrong argument, a changed answer or a broken rule goes red where it is
// tested (tools/import/selftest.mjs, the importer's door). Each statement reports its rows in meta (rows_read: the rows it
// answered; rows_written: the rows it changed), so the worker's own `d1-rows` Server-Timing count works as on D1.
//
//   const w = await sqliteWorker({ projects: ["alpha"], people: [["p-o", "Owen", "owner", "owner-key", []]] });
//   const res = await w.fetch(new Request(w.origin + "/mcp", { … }));
// Sprint 6 (6.6, the second org everywhere): `orgs` seeds more orgs beside org 1 in the same database (each its id, name, project
// slugs — keyed o<id>--<slug>, src/project.js — and people), and `src` loads the worker from another copy of src/ (a mutant: the
// cross-org attack's proof that it can fail, tools/attack-xorg.mjs).
// Sprint 8 (8.2f, main's rulings): every org it makes rides the LOCAL-only plan (tools/fixtures/local-plan.sql, seeded here as
// lib-r-local.sh seeds it), so a selftest never trips the ruled limits — `plan` (and an org's own `plan`) names another for a
// selftest of the plans themselves; and `changes()` counts the rows changed OUTSIDE org_usage, the plan's running counters: every
// door call writes its org's counter row (metering, not the call's effect), so a "no row changed" pin measures with it.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const handlers = new Map();
// handlerOf(src) -> the worker's default export, loaded once per src directory
async function handlerOf(src = join(ENGINE, "src")) {
  if (!handlers.has(src)) handlers.set(src, (await import(pathToFileURL(join(src, "index.js")).href)).default);
  return handlers.get(src);
}
export const sha = (s) => createHash("sha256").update(s).digest("hex");
const T0 = "2026-09-01T00:00:00.000Z";

// USAGE_WRITE: a statement that writes org_usage (src/plans.js: the call count, the items tally); d1(db).usageChanges() sums
// the rows such statements changed (org_usage carries no trigger, and none of its writes fires one)
const USAGE_WRITE = /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+org_usage\b/i;
export function d1(db) {
  let usage = 0;
  const exec = (sql, args) => {
    if (/^\s*(SELECT|WITH)\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) {
      const results = db.prepare(sql).all(...args);
      return { results, meta: { rows_read: results.length, rows_written: 0, changes: 0 } };
    }
    const r = db.prepare(sql).run(...args);
    const n = Number(r.changes) || 0;
    if (USAGE_WRITE.test(sql)) usage += n;
    return { results: [], meta: { rows_read: 0, rows_written: n, changes: n, last_row_id: Number(r.lastInsertRowid) || 0 } };
  };
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async (col) => { const row = exec(sql, args).results[0] ?? null; return col && row ? row[col] : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args), raw: async () => exec(sql, args).results.map((r) => Object.values(r)), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), exec: async (sql) => { db.exec(sql); return { count: 1 }; }, usageChanges: () => usage,
    batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
// an R2 binding held in memory (the artifacts and the renders' bodies land here)
export function r2() {
  const m = new Map();
  const obj = (key, v) => ({ key, size: v.bytes.byteLength, uploaded: new Date(), httpMetadata: v.meta || {}, text: async () => new TextDecoder().decode(v.bytes),
    arrayBuffer: async () => v.bytes.buffer.slice(v.bytes.byteOffset, v.bytes.byteOffset + v.bytes.byteLength), json: async () => JSON.parse(new TextDecoder().decode(v.bytes)), body: v.bytes });
  const bytesOf = async (b) => (typeof b === "string" ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : new TextEncoder().encode(String(b ?? "")));
  return {
    get: async (k) => (m.has(k) ? obj(k, m.get(k)) : null), head: async (k) => (m.has(k) ? obj(k, m.get(k)) : null),
    put: async (k, b, o = {}) => { m.set(k, { bytes: await bytesOf(b), meta: o.httpMetadata }); return { key: k }; },
    delete: async (k) => { for (const x of [].concat(k)) m.delete(x); },
    list: async (o = {}) => ({ objects: [...m.keys()].filter((k) => k.startsWith(o.prefix || "")).sort().map((k) => obj(k, m.get(k))), truncated: false }),
    _map: m,
  };
}

// a KV binding held in memory (the OAuth provider's grants and clients)
export function kv() {
  const m = new Map();
  return {
    get: async (k, o) => { const v = m.has(k) ? m.get(k) : null; return v != null && (o === "json" || (o && o.type === "json")) ? JSON.parse(v) : v; },
    put: async (k, v) => { m.set(k, typeof v === "string" ? v : JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async (o = {}) => ({ keys: [...m.keys()].filter((k) => k.startsWith(o.prefix || "")).sort().map((name) => ({ name })), list_complete: true }),
  };
}
import { orgKey } from "./two-orgs.mjs";
// sqliteWorker({ projects, people, org, orgs, src, plan }) -> { fetch, db, env, origin, mcp(name, args, key), changes() }
//   plan: org 1's plan and every org's that names none (default 'local'); changes(): total_changes() less org_usage's
//   people: [id, name, role, key, seats[], email?] — the key is stored as its sha256, as the worker keeps it; the email
//   defaults to <id>@x.test (sprint 7: a seat's email is set once, at its insert, and names its account: migrate-070)
//   orgs: [{ id, name, projects: [slug], people: [[id, name, role, key, seats (slugs)]], plan? }] — more orgs in the same database
const LOCAL_PLAN_SQL = readFileSync(join(ENGINE, "tools", "fixtures", "local-plan.sql"), "utf8");
export async function sqliteWorker({ projects = [], people = [], org = "Northwind", orgs = [], src, plan = "local" } = {}) {
  const handler = await handlerOf(src);
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  db.exec(LOCAL_PLAN_SQL);
  for (const k of projects) db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)").run(k, k[0].toUpperCase() + k.slice(1), T0);
  db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (1, ?, ?, ?, ?)").run(org, T0, T0, plan);
  for (const [id, name, role, key, seats, email] of people) {
    db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)").run(id, name, email || `${id}@x.test`, role, sha(key), T0);
    for (const k of seats || []) db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,'member',?)").run(id, k, T0);
  }
  for (const o of orgs) {
    db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (?, ?, ?, ?, ?)").run(o.id, o.name, T0, T0, o.plan || plan);
    for (const slug of o.projects || []) db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)").run(orgKey(o.id, slug), slug[0].toUpperCase() + slug.slice(1), T0);
    for (const [id, name, role, key, seats, email] of o.people || []) {
      db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,?)").run(id, name, email || `${id}@x.test`, role, sha(key), T0, o.id);
      for (const k of seats || []) db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,'member',?)").run(id, orgKey(o.id, k), T0);
    }
  }
  const env = { DB: d1(db), BRAIN: r2(), OAUTH_KV: kv() };
  const changes = () => Number(db.prepare("SELECT total_changes() AS n").get().n) - env.DB.usageChanges();
  // a fresh ctx per request, as the runtime gives one: the OAuth provider writes the grant's props onto the ctx it is handed
  // (ctx.props), so a shared one would carry one request's grant into every later request (sprint 7, 7.5a)
  const origin = "https://org.test";
  const fetch = (req) => handler.fetch(req, env, { waitUntil() {}, passThroughOnException() {} });
  let n = 0;
  const mcp = async (name, args, key) => {
    const r = await fetch(new Request(origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }));
    let j = null; try { j = JSON.parse(await r.text()); } catch { j = null; }
    let out = null; try { out = JSON.parse(j.result.content[0].text); } catch { out = j && (j.error || j); }
    return { status: r.status, out, isError: !!(j && j.result && j.result.isError) };
  };
  return { fetch, db, env, origin, mcp, changes };
}
