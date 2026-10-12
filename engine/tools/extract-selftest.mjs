// tools/extract-selftest.mjs — sprint 3, B5: extract (search, read, changes, brief, the Library, the tab chip). Offline: a REAL
// SQLite built from boot.sql (node:sqlite, FTS5 included), the knowledge filed through the real write door, then the REAL
// src/index.js handler (the seam, callTool, the routes) driven with Request/Response, and src/extract.js directly.
//   A. THE INDEX: migrate-056's k_find equals the tables after random writes (inserts, updates, deletes, eval flips, a rebuild
//      by re-running the file); one project's search never reads another's.
//   B. AUTHORITY, per caller (the owner, a member, a member with the engineering access hat, a Partner seated on alpha, a
//      Partner seated nowhere, a member of beta only, a seatless member; and a seatless member of a one-project org): what
//      search, read, changes, brief, the Library page and the tab chip name, count and refuse. A doc or card a caller may not
//      read is never named, counted or snippeted, and reads not_found exactly as a missing one.
//   C. THE SHAPES: search groups and hits, read of every ref form and a kind's page, changes since a version with its reach,
//      brief for a hat and for a ref; each REST twin answers what its tool answers.
//   D. BOUNDED: every statement extract runs uses an index or the FTS index (EXPLAIN QUERY PLAN: no SCAN of a table).
//   B19 (sprint 7's review, B2): in an org at /acme, a card kind's tab link (the Library's Lists on, MCP read's lists-on) is
//      /acme/gtm, never the root's /gtm.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { contribute } from "./fixtures/door-helpers.mjs";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const X = await imp("src/extract.js");
const { writeKnowledge } = await imp("src/knowledge/write.js");
const { publishVersion } = await imp("src/knowledge/versions.js");
const { installReqMemo } = await imp("src/reqmemo.js");
const { default: handler } = await imp("src/index.js");

let passes = 0, fails = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const show = (v) => String(JSON.stringify(v)).slice(0, 500);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M056 = readFileSync(join(ENGINE, "migrate-056.sql"), "utf8");
const T0 = "2026-09-01T00:00:00.000Z";

// ---- the org: two projects, every kind of reader ----
const PEOPLE = [
  ["p-o", "Owen Park", "owner", null, "owner-key"],
  ["p-m", "Mia Member", "member", null, "mem-key"],
  ["p-e", "Eli Eng", "member", '["engineering"]', "eng-key"],
  ["p-pa", "Pat Partner", "partner", null, "partner-key"],
  ["p-pz", "Lone Partner", "partner", null, "loner-key"],
  ["p-b", "Bea Beta", "member", null, "beta-key"],
  ["p-z", "Zed Seatless", "member", null, "seatless-key"],
];
function freshDb(projects = ["alpha", "beta"], seats = [["p-m", "alpha"], ["p-e", "alpha"], ["p-pa", "alpha"], ["p-b", "beta"]]) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(BOOT);
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,access_hats,org) VALUES (?,?,?,?,?,1,?,?,1)");
  for (const [id, name, role, hats, key] of PEOPLE) P.run(id, name, `${id}@x.test`, role, sha(key), T0, hats);
  for (const k of projects) db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)").run(k, k[0].toUpperCase() + k.slice(1), T0);
  for (const [p, k] of seats) db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,'member',?)").run(p, k, T0);
  return db;
}
function d1(db, log) {
  const exec = (sql, args) => { if (log) log.push(sql); return /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; };
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const blobs = new Map();
const brain = () => ({ get: async (k) => (blobs.has(k) ? { text: async () => blobs.get(k) } : null), head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async (k, v) => { blobs.set(k, String(v)); } });
const OWNER = { id: "p-o", name: "Owen Park", role: "owner" };
const W = async (db, project, ops) => { const r = await writeKnowledge(OWNER, { project, ops }, asOrg({ DB: d1(db), [Symbol.for("sharingu.project")]: project, BRAIN: brain() })); if (r.error) throw new Error(`write ${project}: ${show(r)}`); return r; };

const ALPHA = [
  { kind: "goal", op: "upsert", data: { id: "root", title: "Ship alpha", dimensions: ["leader"] } },
  { kind: "goal", op: "upsert", data: { id: "g-pricing", parent: "root", title: "Pricing launch", dimensions: ["code"], note: "annual and monthly plans" } },
  { kind: "question", op: "upsert", data: { qid: "Q-price-1", question: "Annual pricing first?", why: "pricing decides who signs up", status: "open", options: [{ what: "Annual" }, { what: "Monthly" }], affects: ["screen:pricing"], whoOwes: "engineering" } },
  { kind: "node", op: "upsert", data: { id: "screen:pricing", type: "screen", name: "Pricing screen", data: { surface: "web" } } },
  { kind: "node", op: "upsert", data: { id: "door:GET:/prices", type: "door", name: "GET /prices" } },
  { kind: "edge", op: "upsert", data: { from: "screen:pricing", to: "door:GET:/prices", kind: "depends" } },
  { kind: "check", op: "upsert", data: { id: "AC.price", title: "The pricing page shows the annual plan", refs: ["screen:pricing"], then: "the annual price shows" } },
  { kind: "doc", op: "upsert", data: { path: "guides/pricing.md", title: "Pricing guide", body: "How pricing works: annual plans first.", asOf: "2026-01-02", confidence: "direction" } },
  { kind: "doc", op: "upsert", data: { path: "secret/pricing-terms.md", title: "Secret pricing terms", body: "The discount floor is classified pricing.", roleVisibility: ["engineering"] } },
  { kind: "doc", op: "upsert", data: { path: "capsules/engineering.md", title: "Engineering brief", body: "Start with the pricing screen.", roleVisibility: ["engineering"] } },
  { kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims", tab: "gtm" } },
  { kind: "card_kind", op: "upsert", data: { key: "deal", label: "Deals", roleVisibility: ["finance"] } },
  { kind: "card", op: "upsert", data: { kind: "claim", id: "c-open", name: "Pricing claim open", body: "teams choose annual pricing", asOf: "2026-09-30", confidence: "confirmed" } },
  { kind: "card", op: "upsert", data: { kind: "claim", id: "c-secret", name: "Pricing hidden claim", body: "only finance reads this pricing claim", roleVisibility: ["finance"] } },
  { kind: "card", op: "upsert", data: { kind: "deal", id: "d-1", name: "Pricing deal terms", body: "deal pricing", status: "live" } },
];
const BETA = [{ kind: "goal", op: "upsert", data: { id: "b-root", title: "Pricing beta goal" } }, { kind: "doc", op: "upsert", data: { path: "beta/pricing.md", title: "Beta pricing", body: "beta pricing doc" } }];

// ---- the handler ----
function door(db, projects = ["alpha", "beta"]) {
  const hbrain = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) };
  const env = asOrg({ DB: d1(db), BRAIN: hbrain });
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  let n = 0;
  const get = async (path, key, accept = "application/json") => {
    const r = await handler.fetch(new Request(`https://org.test${path}`, { headers: { accept, ...(key ? { authorization: `Bearer ${key}` } : {}) } }), env, ctx);
    const t2 = await r.text(); let j = null; try { j = JSON.parse(t2); } catch { j = null; }
    return { status: r.status, j, t: t2, location: r.headers.get("location") };
  };
  const mcp = async (name, args, key) => {
    const r = await handler.fetch(new Request("https://org.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), env, ctx);
    const j = await r.json();
    let out = null; try { out = JSON.parse(j.result.content[0].text); } catch { out = j.error || j; }
    return { isError: !!(j.result && j.result.isError), out };
  };
  return { get, mcp, env };
}

// ================= A. the index =================
{
  const db = freshDb();
  await W(db, "alpha", ALPHA); await W(db, "beta", BETA);
  const P = (k) => X.projectToken(k);
  const fts = (k, word) => db.prepare("SELECT rowid AS r FROM k_find WHERE k_find MATCH ? ORDER BY rowid").all(`p : ${P(k)} AND {title body} : "${word}"*`).map((x) => Number(x.r));
  // the recount: every row a kind's rule indexes, by its own table, whose indexed text holds the word as a token prefix
  const tok = (s, w) => String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).some((t) => t.startsWith(w));
  const recount = (k, w) => {
    const S = X.ROWID_SPAN, out = [];
    const q = (sql) => db.prepare(sql).all(k);
    for (const r of q("SELECT rowid AS r, title, id, note FROM k_goals WHERE project = ?")) if (tok(r.title, w) || tok(`${r.id} ${String(r.note || "").slice(0, 600)}`, w)) out.push(1 * S + r.r);
    for (const r of q("SELECT rowid AS r, question, qid, label, why, rationale FROM k_questions WHERE project = ?")) if (tok(r.question, w) || tok(`${r.qid} ${r.label || ""} ${String(r.why || "").slice(0, 600)} ${String(r.rationale || "").slice(0, 400)}`, w)) out.push(2 * S + r.r);
    for (const r of q("SELECT rowid AS r, title, id, then_ FROM k_checks WHERE project = ?")) if (tok(r.title, w) || tok(`${r.id} ${String(r.then_ || "").slice(0, 300)}`, w)) out.push(3 * S + r.r);
    for (const r of q("SELECT rowid AS r, name, kind, id, body_md FROM k_cards WHERE project = ?")) if (tok(r.name, w) || tok(`${r.kind} ${r.id} ${String(r.body_md || "").slice(0, 1500)}`, w)) out.push(4 * S + r.r);
    for (const r of q("SELECT rowid AS r, title, path, body_md FROM k_docs WHERE project = ?")) if (tok(r.title || r.path, w) || tok(`${r.path} ${String(r.body_md || "").slice(0, 1500)}`, w)) out.push(5 * S + r.r);
    for (const r of q("SELECT rowid AS r, name, type, id FROM k_nodes WHERE project = ?")) if (tok(r.name, w) || tok(`${r.type} ${r.id}`, w)) out.push(6 * S + r.r);
    for (const r of q("SELECT rowid AS r, * FROM transmission WHERE project = ? AND eval = 0")) {
      if (["knowledge", "grade", "answer", "rank", "round", "publish", "equip"].includes(String(r.kind || "").toLowerCase()) || /mind\//.test(`${r.gaprefs || ""}${r.components || ""}`)) continue;
      if (tok(r.what || r.id, w) || tok(`${r.id} ${r.lane} ${r.kind || ""} ${r.touches || ""} ${r.screens || ""} ${r.components || ""} ${r.gaprefs || ""} ${String(r.why || "").slice(0, 600)}`, w)) out.push(7 * S + r.r);
    }
    return out.sort((a, b) => a - b);
  };
  const same = (k, w) => JSON.stringify(fts(k, w)) === JSON.stringify(recount(k, w));
  ok(same("alpha", "pricing") && same("beta", "pricing") && fts("alpha", "pricing").length >= 9 && fts("beta", "pricing").length === 2,
    `A1 · after a fresh fill the index equals the tables: alpha ${fts("alpha", "pricing").length} rows for "pricing", beta ${fts("beta", "pricing").length} (never alpha's)`);
  // random writes
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const WORDS = ["pricing", "annual", "checkout", "billing", "refund"];
  const at = () => new Date(Date.parse(T0) + Math.floor(rnd() * 1e9)).toISOString();
  let tx = 0;
  for (let i = 0; i < 1500; i++) {
    const r = rnd(), p = pick(["alpha", "beta"]), w = pick(WORDS), id = `x${Math.floor(rnd() * 12)}`;
    const meta = "'p-o', ?, 'p-o', ?";
    try {
      if (r < 0.12) db.prepare(`INSERT OR IGNORE INTO k_goals (project,id,title,note,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,${meta})`).run(p, id, `${w} goal`, pick([null, `${pick(WORDS)} note`]), T0, T0);
      else if (r < 0.2) db.prepare("UPDATE k_goals SET title = ?, updated_at = ? WHERE project = ? AND id = ?").run(`${w} renamed`, at(), p, id);
      else if (r < 0.26) db.prepare("UPDATE k_goals SET status = ? WHERE project = ? AND id = ?").run(pick(["done", "active"]), p, id);
      else if (r < 0.32) db.prepare("DELETE FROM k_goals WHERE project = ? AND id = ?").run(p, id);
      else if (r < 0.42) db.prepare(`INSERT OR IGNORE INTO k_nodes (project,id,type,name,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,${meta})`).run(p, `screen:${id}`, "screen", `${w} screen`, T0, T0);
      else if (r < 0.5) db.prepare("UPDATE k_nodes SET name = ? WHERE project = ? AND id = ?").run(`${w} again`, p, `screen:${id}`);
      else if (r < 0.55) db.prepare("DELETE FROM k_nodes WHERE project = ? AND id = ?").run(p, `screen:${id}`);
      else if (r < 0.62) db.prepare(`INSERT OR IGNORE INTO k_docs (project,path,title,body_md,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,${meta})`).run(p, `d/${id}.md`, pick([null, `${w} doc`]), `${pick(WORDS)} body`, T0, T0);
      else if (r < 0.67) db.prepare("UPDATE k_docs SET body_md = ? WHERE project = ? AND path = ?").run(`${w} body two`, p, `d/${id}.md`);
      else if (r < 0.7) db.prepare("DELETE FROM k_docs WHERE project = ? AND path = ?").run(p, `d/${id}.md`);
      else if (r < 0.8) db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,created_at,project,gaprefs,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)")
        .run(`T-20260901-${++tx}`, "p-o", pick(["code", "leader"]), pick(["pr", "note", "knowledge", "grade"]), `${w} work`, `${pick(WORDS)} why`, pick([null, "screen:x1", "pricing"]), "auto", "graded", pick([0, 0, 1]), at(), p, pick([null, "mind/x"]));
      else if (r < 0.88 && tx) db.prepare("UPDATE transmission SET eval = ?, what = ? WHERE id = ?").run(pick([0, 1]), `${w} edited`, `T-20260901-${1 + Math.floor(rnd() * tx)}`);
      else if (r < 0.92 && tx) db.prepare("UPDATE transmission SET status = 'closed', kind = ? WHERE id = ?").run(pick(["pr", "knowledge"]), `T-20260901-${1 + Math.floor(rnd() * tx)}`);
      else if (r < 0.93) db.prepare(`INSERT OR IGNORE INTO k_checks (project,id,title,then_,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,${meta})`).run(p, `C.${id}`, `${w} check`, `${pick(WORDS)} then`, T0, T0);
      else if (r < 0.95) db.prepare("UPDATE k_checks SET then_ = ? WHERE project = ? AND id = ?").run(pick([null, `${w} then two`]), p, `C.${id}`);
      else if (r < 0.96) db.prepare("DELETE FROM k_checks WHERE project = ? AND id = ?").run(p, `C.${id}`);
      else if (r < 0.97) db.prepare(`INSERT OR IGNORE INTO k_cards (project,kind,id,name,body_md,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,${meta})`).run(p, "claim", id, `${w} card`, pick([null, `${pick(WORDS)} card body`]), T0, T0);
      else if (r < 0.98) db.prepare("UPDATE k_cards SET body_md = ?, name = ? WHERE project = ? AND kind = 'claim' AND id = ?").run(pick([null, `${w} body`]), `${pick(WORDS)} card`, p, id);
      else if (r < 0.99) db.prepare("UPDATE k_questions SET why = ?, label = ? WHERE project = ?").run(pick([null, `${w} why`]), pick([null, `${pick(WORDS)} label`]), p);
      else db.prepare("UPDATE transmission SET touches = ?, why = ? WHERE project = ? AND rowid % 3 = 0").run(pick([null, "screen:x2,refund"]), `${w} reason`, p);
    } catch (e) { if (!/FOREIGN KEY|constraint/i.test(String(e))) throw e; }
  }
  const drift = [];
  for (const k of ["alpha", "beta"]) for (const w of WORDS) if (!same(k, w)) drift.push(`${k}/${w}: index ${fts(k, w).length} tables ${recount(k, w).length}`);
  ok(!drift.length, `A2 · after 1,500 random writes (inserts, renames, deletes, eval flips, kind changes, mind/* rows) the index equals the tables for every word and project`, drift.join("; "));
  db.exec(M056);
  const drift2 = [];
  for (const k of ["alpha", "beta"]) for (const w of WORDS) if (!same(k, w)) drift2.push(`${k}/${w}`);
  ok(!drift2.length, "A3 · re-running migrate-056 (delete-all, then the backfill: the rebuild a table rebuild needs) leaves the index equal to the tables", drift2.join("; "));
  // the instrument: with one trigger dropped, A2's comparison goes red
  db.exec("DROP TRIGGER k_find_goal_au");
  db.prepare("UPDATE k_goals SET title = 'zebra stripes' WHERE project = 'alpha' AND id = 'g-pricing'").run();
  ok(!same("alpha", "zebra"), "A4 · the instrument: with k_find_goal_au dropped, a rename leaves the index behind the table (the comparison catches it)");
  // and a delete that does not hand FTS5 the values the row was indexed with leaves its old words behind (contentless: the
  // delete must repeat the insert's expressions exactly, which is what migrate-056's triggers do)
  db.exec(M056);
  db.exec(`DROP TRIGGER k_find_goal_au; CREATE TRIGGER k_find_goal_au AFTER UPDATE OF title, note ON k_goals BEGIN
    INSERT INTO k_find (k_find, rowid, p, title, body) SELECT 'delete', ${X.ROWID_SPAN} + OLD.rowid, 'p' || hex(OLD.project), OLD.title, OLD.id;
    INSERT INTO k_find (rowid, p, title, body) SELECT ${X.ROWID_SPAN} + NEW.rowid, 'p' || hex(NEW.project), NEW.title, NEW.id || ' ' || substr(COALESCE(NEW.note, ''), 1, 600); END;`);
  db.prepare("UPDATE k_goals SET note = 'quokka note' WHERE project = 'alpha' AND id = 'g-pricing'").run();
  db.prepare("UPDATE k_goals SET note = 'other words' WHERE project = 'alpha' AND id = 'g-pricing'").run();
  ok(!same("alpha", "quokka"), "A5 · the instrument: a delete that omits the note it indexed leaves \"quokka\" in the index after the note changed (the comparison catches it)");
}

// ================= B, C. the door =================
const db = freshDb();
await W(db, "alpha", ALPHA); await W(db, "beta", BETA);
const D = door(db);
// contributions through the real door: a note, a code change naming the pricing screen; one in beta
const note = await contribute(D.mcp, { project: "alpha", lane: "leader", kind: "note", what: "Pricing note from the call", why: "customers asked about annual pricing" }, "mem-key");
ok(!note.isError && /^T-/.test(note.out.id || ""), "setup · a member files a plain note through the door", show(note.out));
const betaTx = await contribute(D.mcp, { project: "beta", lane: "leader", kind: "note", what: "Beta pricing note", why: "beta" }, "beta-key");
ok(!betaTx.isError, "setup · a beta member files in beta", show(betaTx.out));
// v1, then the changes after it
const v1 = await publishVersion(OWNER, { project: "alpha", title: "First" }, asOrg({ DB: d1(db), [Symbol.for("sharingu.project")]: "alpha", BRAIN: brain() }), { via: "test" });
ok(!v1.error, "setup · the owner publishes v1 of alpha", show(v1));
db.prepare("UPDATE k_versions SET created_at = '2026-01-01T00:00:00.000Z' WHERE project = 'alpha'").run();   // v1 before every row below
db.prepare("UPDATE transmission SET created_at = '2025-12-31T00:00:00.000Z' WHERE project = 'alpha'").run();   // and the fill before v1
await W(db, "alpha", [{ kind: "node", op: "upsert", data: { id: "screen:pricing", type: "screen", name: "Pricing screen v2", data: { surface: "web" } } }]);
await W(db, "alpha", [{ kind: "card", op: "upsert", data: { kind: "claim", id: "c-secret2", name: "Second hidden pricing claim", roleVisibility: ["finance"] } }]);
await W(db, "alpha", [{ kind: "goal", op: "upsert", data: { id: "g-pricing", parent: "root", title: "Pricing launch, annual first", dimensions: ["code"] } },
  { kind: "card", op: "upsert", data: { kind: "deal", id: "d-2", name: "Deal two pricing" } }]);
const code = await contribute(D.mcp, { project: "alpha", lane: "code", kind: "pr", what: "Pricing toggle for annual", why: "the annual plan", touches: ["screen:pricing"], components: [], proof: "npm test -> exit 0, 12 passing" }, "eng-key");
ok(!code.isError && /^T-/.test(code.out.id || ""), "setup · an engineer files a code contribution touching screen:pricing", show(code.out));

const SECRETS = /Secret pricing terms|secret\/pricing-terms|Pricing hidden claim|c-secret|Pricing deal terms|d-1|Deal two|d-2|deal|classified|Second hidden/i;
const SECRETS_NO_DOC = /Pricing hidden claim|c-secret|Pricing deal terms|Deal two|d-2|classified pricing claim|Second hidden|"deal"/i;

// ---- search ----
{
  const s = async (key, args) => D.mcp("search", { project: "alpha", q: "pricing", ...args }, key);
  const own = (await s("owner-key")).out, mem = (await s("mem-key")).out, eng = (await s("eng-key")).out, par = (await s("partner-key")).out;
  const g = (a, k) => (a.groups || []).find((x) => x.kind === k) || { count: 0, hits: [] };
  ok(own.total > 0 && g(own, "doc").count === 3 && g(own, "card").count === 5 && g(own, "goal").count >= 1 && g(own, "question").count === 1 && g(own, "check").count === 1 && g(own, "node").count >= 1 && g(own, "contribution").count === 2,
    `B1 · the owner finds every kind in alpha: docs 3 (the engineering capsule names pricing too), cards 5 (claims and deals), goals, questions, checks, nodes, contributions 2`, show(own.groups && own.groups.map((x) => [x.kind, x.count])));
  ok(g(mem, "doc").count === 1 && g(mem, "card").count === 1 && !SECRETS.test(JSON.stringify(mem)) && mem.total === own.total - 2 - 4,
    `B2 · a member: docs 1, cards 1; the two engineering docs and the four hidden cards are never named, snippeted or counted (total ${mem.total} = the owner's ${own.total} - 6)`, show(mem.groups && mem.groups.map((x) => [x.kind, x.count])));
  ok(g(eng, "doc").count === 3 && g(eng, "card").count === 1 && !SECRETS_NO_DOC.test(JSON.stringify(eng)),
    "B3 · the engineering access hat reads the engineering doc and the engineering capsule (docs 3), still no finance card", show(eng.groups && eng.groups.map((x) => [x.kind, x.count])));
  ok(JSON.stringify(par.groups) === JSON.stringify(mem.groups), "B4 · a Partner seated on alpha reads exactly what a member reads", show(par.groups && par.groups.map((x) => [x.kind, x.count])));
  const parBeta = await D.mcp("search", { project: "beta", q: "pricing" }, "partner-key");
  const loner = await D.mcp("search", { project: "alpha", q: "pricing" }, "loner-key"), lonerDef = await D.mcp("search", { q: "pricing" }, "loner-key");
  const betaM = await D.mcp("search", { project: "alpha", q: "pricing" }, "beta-key"), betaOwn = (await D.mcp("search", { project: "beta", q: "pricing" }, "beta-key")).out;
  const seatless = await D.mcp("search", { project: "alpha", q: "pricing" }, "seatless-key"), seatlessDef = await D.mcp("search", { q: "pricing" }, "seatless-key");
  ok(parBeta.isError && parBeta.out.error === "project_forbidden" && loner.isError && loner.out.error === "project_forbidden" && lonerDef.isError && lonerDef.out.error === "project_required"
    && betaM.isError && betaM.out.error === "project_forbidden" && seatless.isError && seatless.out.error === "project_forbidden" && seatlessDef.isError && seatlessDef.out.error === "project_required",
    "B5 · refused, nothing read: a Partner naming another project, a Partner seated nowhere (named or not), a beta member naming alpha, a seatless member in a two-project org", show([parBeta.out.error, loner.out.error, lonerDef.out.error, betaM.out.error, seatless.out.error, seatlessDef.out.error]));
  ok(betaOwn.total === 3 && !/alpha|Pricing screen|Pricing launch/.test(JSON.stringify(betaOwn)), "B6 · a beta member's search reads beta alone (its goal, doc and note), never an alpha row", show(betaOwn.groups && betaOwn.groups.map((x) => [x.kind, x.count])));
  const rest = await D.get("/search?project=alpha&q=pricing", "mem-key");
  ok(rest.status === 200 && JSON.stringify(rest.j) === JSON.stringify(mem), "C1 · GET /search answers exactly what the search tool answers (a member)");
  const hit = g(mem, "doc").hits[0], q = (await D.mcp("search", { project: "alpha", q: "annual plans", kinds: ["doc", "goal"], limit: 1 }, "mem-key")).out;
  ok(hit && hit.ref === "doc/guides/pricing.md" && hit.href === "/doc/guides/pricing.md" && /pricing/i.test(hit.snippet) && hit.dueForReview && hit.asOf === "2026-01-02"
    && q.groups.every((x) => ["doc", "goal"].includes(x.kind)) && q.groups.every((x) => x.hits.length <= 1),
    `C2 · a hit carries its ref, href, snippet, as-of and due-for-review mark; kinds and limit narrow it`, show({ hit, q: q.groups }));
  const none = (await D.mcp("search", { project: "alpha", q: "x" }, "mem-key")).out, empty = (await D.mcp("search", { project: "alpha", q: "zzzz" }, "mem-key")).out, badK = (await D.mcp("search", { project: "alpha", q: "pricing", kinds: ["secret"] }, "mem-key")).out;
  ok(none.error === "q_required" && empty.total === 0 && /preview, then file/.test(empty.note) && badK.error === "unknown_kind", "C3 · one letter is q_required; no match names the call that fills it; an unknown kind is refused");
}

// ---- read ----
{
  const r = async (key, args) => (await D.mcp("read", { project: "alpha", ...args }, key)).out;
  const missing = await r("mem-key", { ref: "doc/nowhere.md" }), hidden = await r("mem-key", { ref: "doc/secret/pricing-terms.md" }), engDoc = await r("eng-key", { ref: "doc/secret/pricing-terms.md" });
  const strip = (o) => JSON.stringify({ ...o, ref: undefined, note: String(o.note || "").replace(/".*?"/, '""') });
  ok(hidden.error === "not_found" && missing.error === "not_found" && strip(hidden) === strip(missing) && engDoc.kind === "doc" && engDoc.item.title === "Secret pricing terms",
    "B7 · a restricted doc reads not_found for a member, exactly as a missing one; the engineering hat reads it", show({ hidden, missing }));
  const c1 = await r("mem-key", { ref: "card/claim/c-secret" }), c2 = await r("mem-key", { ref: "card/deal/d-1" }), c3 = await r("owner-key", { ref: "card/deal/d-1" }), c4 = await r("partner-key", { ref: "card/claim/c-open" });
  ok(c1.error === "not_found" && c2.error === "not_found" && c3.item && c3.item.name === "Pricing deal terms" && c4.item && c4.links[0].href === "/gtm" && c4.item.tab === "gtm",
    "B8 · a hidden card (its own list, or its kind's) reads not_found; the owner reads it; a visible card names the tab it lists on", show({ c1, c2, c4: c4.links }));
  const list = await r("mem-key", { kind: "card" }), listD = await r("mem-key", { kind: "doc" });
  ok(list.items && list.items.length === 1 && list.items[0].ref === "card/claim/c-open" && !SECRETS.test(JSON.stringify(list)) && listD.items.every((d) => !/secret|capsules/.test(d.path)),
    "B9 · a kind's page lists only what the reader may read (cards: one; docs: no restricted path)", show(list.items));
  const goal = await r("mem-key", { ref: "goal/g-pricing" }), node = await r("mem-key", { ref: "screen:pricing" }), q = await r("mem-key", { ref: "q/Q-price-1" }), ch = await r("mem-key", { ref: "check/AC.price" });
  ok(goal.item.title.startsWith("Pricing launch") && goal.links.some((l) => l.rel === "parent" && l.ref === "goal/root") && goal.href === "/goals/g-pricing"
    && node.item.name === "Pricing screen v2" && node.links.some((l) => l.ref === "door:GET:/prices" && l.dir === "out") && q.links.some((l) => l.ref === "screen:pricing")
    && ch.item.id === "AC.price" && ch.links[0].ref === "screen:pricing" && ch.href === "/map?node=screen%3Apricing",
    "C4 · read of goal/, a node id, q/ and check/: the item, its links, its page", show({ g: goal.links, n: node.links, q: q.links, c: ch.links }));
  const tx = await r("mem-key", { ref: code.out.id }), tb = await r("owner-key", { ref: betaTx.out.id }), contribs = await r("mem-key", { kind: "contribution", limit: 1 });
  const page2 = await r("mem-key", { kind: "contribution", limit: 1, after: contribs.next });
  ok(tx.kind === "contribution" && tx.links.some((l) => l.ref === "screen:pricing") && tb.error === "not_found" && contribs.items.length === 1 && page2.items.length === 1 && page2.items[0].id !== contribs.items[0].id,
    "C5 · a contribution by its id with what it touches; beta's id read on alpha is not_found (even for the owner); contributions page by after", show({ tb, c: contribs, p2: page2.items }));
  const bad = await r("mem-key", { ref: "%%" }), rr = await D.get(`/read?project=alpha&ref=${encodeURIComponent("doc/secret/pricing-terms.md")}`, "mem-key"), ro = await D.get("/read?project=alpha&ref=goal%2Fg-pricing", "mem-key");
  ok(bad.error === "bad_ref" && rr.status === 404 && rr.j.error === "not_found" && ro.status === 200 && JSON.stringify(ro.j) === JSON.stringify(goal), "C6 · a ref of no form is bad_ref; GET /read: 404 for a hidden doc, the tool's own answer otherwise");
}

// ---- changes ----
{
  const c = async (key, args = {}) => (await D.mcp("changes", { project: "alpha", ...args }, key)).out;
  const own = await c("owner-key"), mem = await c("mem-key");
  const kinds = (a) => (a.changes || []).map((x) => x.change);
  ok(own.since.label === "v1" && own.total === 4 && kinds(own).filter((k) => k === "knowledge").length === 3 && kinds(own).includes("contribution"),
    `B10 · the owner: 4 changes since v1 (three knowledge writes, one contribution)`, show(own.changes && own.changes.map((x) => [x.change, x.what])));
  const mixed = (mem.changes || []).find((x) => x.refs.some((r) => r.ref === "goal/g-pricing"));
  ok(mem.total === 3 && !SECRETS.test(JSON.stringify(mem)) && mixed && /^1 goal written$/.test(mixed.what) && !mixed.refs.some((r) => r.kind === "card"),
    `B11 · a member: the write of a hidden card alone is not listed; the mixed write shows "1 goal written" (never the deal card, never "2 items"); nothing hidden named`, show(mem.changes && mem.changes.map((x) => [x.change, x.what, x.refs.map((r) => r.ref)])));
  const contrib = own.changes.find((x) => x.change === "contribution"), nodeW = own.changes.find((x) => x.refs.some((r) => r.ref === "screen:pricing") && x.change === "knowledge");
  ok(contrib && contrib.reaches && contrib.reaches.first.includes("door:GET:/prices") && contrib.by === "Eli Eng" && nodeW && nodeW.reaches && nodeW.reaches.total >= 1,
    "C7 · a contribution and a knowledge write touching the screen carry what they reach (the door), with who filed", show({ contrib, nodeW }));
  const map = await c("mem-key", { tab: "map" }), goals = await c("mem-key", { tab: "goals" }), build = await c("mem-key", { tab: "build" });
  ok(map.changes.every((x) => x.kinds.some((k) => ["node", "edge", "check", "render", "style", "grade"].includes(k))) && map.total === 2 && goals.total === 1 && build.total === 1,
    `C8 · a tab's kinds: map 2 (the node write, the code contribution), goals 1, build 1`, show([map.total, goals.total, build.total]));
  const since = await c("owner-key", { since: "2026-01-01" }), bad = await c("owner-key", { since: "v9" }), bad2 = await c("owner-key", { since: "soon" });
  ok(since.total === own.total && bad.error === "unknown_version" && bad2.error === "bad_since", "C9 · since an ISO day or v<N>; an unknown version and a bad since are refused");
  const rest = await D.get("/changes?project=alpha", "mem-key"), page = await D.get("/changes?project=alpha", "mem-key", "text/html");
  ok(rest.status === 200 && JSON.stringify(rest.j) === JSON.stringify(mem) && page.status === 200 && /data-screen="changes"/.test(page.t) && !SECRETS.test(page.t.replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "")),
    "C10 · GET /changes answers what the tool answers; the What changed page draws for a member without a hidden name");
  const loner = await D.mcp("changes", { project: "alpha" }, "loner-key");
  ok(loner.isError && loner.out.error === "project_forbidden", "B12 · a Partner seated nowhere: project_forbidden");
  // the chip: the same count for the owner and a member (a hidden-only write is never counted), per tab
  const envOf = (p) => installReqMemo({ ...D.env, [Symbol.for("sharingu.project")]: p, BRAIN: brain() });
  const head = { n: 1, at: "2026-01-01T00:00:00.000Z" };
  const chip = async (who, tab) => X.changedCountFor(envOf("alpha"), who, tab, head);
  const MEM = { id: "p-m", role: "member" };
  const [ho, hm, mo, go, none] = [await chip(OWNER, "home"), await chip(MEM, "home"), await chip(MEM, "map"), await chip(MEM, "goals"), await X.changedCountFor(envOf("alpha"), MEM, "map", null)];
  ok(ho.n === 3 && hm.n === 3 && mo.n === 2 && go.n === 1 && none === null && ho.href === "/changes?tab=home",
    `B13 · the tab chip: Home 3 for the owner AND the member (the hidden-card-only write is never counted), Map 2, Goals 1; no version, no chip`, show([ho, hm, mo, go]));
  const homePage = await D.get("/home?project=alpha", "mem-key", "text/html"), mapPage = await D.get("/goals?project=alpha", "mem-key", "text/html");
  ok(/data-changed="home" data-n="3"/.test(homePage.t) && />3 changed since v1</.test(homePage.t) && /data-changed="goals" data-n="1"/.test(mapPage.t),
    "C11 · the chip draws on Home and Goals' headers", show([(homePage.t.match(/u-changed[^>]*>[^<]*/) || [""])[0], (mapPage.t.match(/u-changed[^>]*>[^<]*/) || [""])[0]]));
}

// ---- brief ----
{
  const b = async (key, f) => (await D.mcp("brief", { project: "alpha", for: f }, key)).out;
  const eng = await b("eng-key", "engineering"), mem = await b("mem-key", "engineering"), mgmt = await b("owner-key", "management");
  ok(eng.hat.key === "engineering" && eng.goals.some((g) => g.ref === "goal/g-pricing") && eng.questions.some((q) => q.ref === "q/Q-price-1") && eng.startHere.path === "capsules/engineering.md" && eng.changed.total >= 1,
    "C12 · brief for the engineering hat: the goals measured in code, the question it owes, its capsule, what changed", show({ g: eng.goals, q: eng.questions, s: eng.startHere, c: eng.changed && eng.changed.total }));
  ok(mem.startHere.path === "start-here.md" && !SECRETS.test(JSON.stringify(mem)), "B14 · a member without the hat is pointed at start-here, never at the engineering capsule they may not read", show(mem.startHere));
  ok(mgmt.goals.some((g) => g.ref === "goal/g-pricing") && mgmt.aim === null && /preview, then file/.test(mgmt.aimNote), "C13 · management reads the top of the tree; no aim names the call that files one", show(mgmt.goals));
  const ref = await b("mem-key", "screen:pricing");
  ok(ref.kind === "node" && ref.dependsOn.some((l) => l.ref === "door:GET:/prices") && ref.checks.some((c) => c.id === "AC.price") && ref.questions.some((q) => q.ref === "q/Q-price-1") && ref.contributions.some((t) => t.id === code.out.id),
    "C14 · brief for a ref: what it depends on, its checks, its open questions, the contribution naming it", show({ d: ref.dependsOn, c: ref.checks, q: ref.questions, t: ref.contributions }));
  const g = await b("mem-key", "goal/g-pricing"), hid = await b("mem-key", "card/deal/d-1"), none = await b("mem-key", ""), rest = await D.get("/brief?project=alpha&for=engineering", "eng-key"), legacy = await D.get("/brief", "mem-key", "text/html"), mine = await D.get("/brief?project=alpha", "mem-key");
  // D5: brief with no `for` is the role's brief: a member with none filed reads unknown_brief, and GET /brief
  // as JSON is the same answer; a browser's bare /brief still lands on Home
  ok(g.kind === "goal" && g.dependsOn.some((l) => l.ref === "goal/root") && hid.error === "not_found" && none.error === "unknown_brief" && mine.status === 404 && mine.j && mine.j.error === "unknown_brief"
    && JSON.stringify(mine.j) === JSON.stringify(none) && rest.status === 200 && JSON.stringify(rest.j) === JSON.stringify(eng) && legacy.status === 302 && legacy.location === "/home",
    "C15 · brief for a goal; a hidden card is not_found; no `for` is your role's brief (unknown_brief when none is filed), the same by GET /brief; GET /brief?for= is the tool's twin; a browser's bare /brief lands on Home", show({ none, mine: mine.j }));
  const pz = await D.mcp("brief", { project: "alpha", for: "engineering" }, "loner-key");
  ok(pz.isError && pz.out.error === "project_forbidden", "B15 · a Partner seated nowhere gets no brief");
}

// ---- P3-F: the read side's fixes (brief's blockers, a check's grade and status, the question ref, the seatless owner's note,
// the latest ruling) — on an org of its own, so the counts above stay theirs ----
{
  const fdb = freshDb();
  await W(fdb, "alpha", [
    { kind: "goal", op: "upsert", data: { id: "f-root", title: "F root" } },
    { kind: "node", op: "upsert", data: { id: "screen:f-pay", type: "screen", name: "F pay" } },
    { kind: "question", op: "upsert", data: { qid: "Q-f-vendor", question: "Which bank account?", status: "open", severity: "blocker", options: [{ what: "A" }, { what: "B" }], waitingOn: "Vendor X", blocks: ["screen:f-pay"] } },
    { kind: "question", op: "upsert", data: { qid: "Q-f-owner", question: "Ship in May?", status: "open", options: [{ what: "yes" }, { what: "no" }], whoOwes: "owner" } },
    { kind: "question", op: "upsert", data: { qid: "Q-f-none", question: "Name the plan?", status: "open", options: [{ what: "Pro" }, { what: "Plus" }] } },
    { kind: "question", op: "upsert", data: { qid: "Q-f-r1", question: "First to rule?", status: "open", options: [{ what: "one" }, { what: "two" }] } },
    { kind: "question", op: "upsert", data: { qid: "Q-f-r2", question: "Second to rule?", status: "open", options: [{ what: "one" }, { what: "two" }] } },
    { kind: "check", op: "upsert", data: { id: "C.f1", title: "F pay shows the total", refs: ["screen:f-pay"] } },
    { kind: "check", op: "upsert", data: { id: "C.f2", title: "F pay refuses a bad card", refs: ["screen:f-pay"] } },
    { kind: "check", op: "upsert", data: { id: "C.f3", title: "F pay has a receipt" } },
  ]);
  const F = door(fdb);
  const pure = [X.waitsOn({ waitingOn: "Vendor X" }), X.waitsOn({ whoOwes: "owner", waitingOn: "Vendor X" }), X.waitsOn({}), X.waitsOn({ whoOwes: "build" }), X.waitsOn({ waitingOn: "the admin" })];
  ok(JSON.stringify(pure) === JSON.stringify(["Vendor X", "owner", "owner", "code", "owner"]), "F1 · waitsOn: a named wait is someone else; the owner, an admin, nobody are the owner's; build is code", show(pure));
  const m = (await F.mcp("brief", { project: "alpha", for: "management" }, "owner-key")).out;
  const v = (m.blockers || []).find((q) => q.ref === "q/Q-f-vendor");
  ok(!m.questions.some((q) => q.ref === "q/Q-f-vendor") && m.questions.some((q) => q.ref === "q/Q-f-owner") && m.questions.some((q) => q.ref === "q/Q-f-none")
    && v && v.waitingOn === "Vendor X" && v.severity === "blocker" && JSON.stringify(v.blocks) === JSON.stringify(["screen:f-pay"]) && m.questions.every((q) => "waitingOn" in q && Array.isArray(q.blocks)),
    "F2 · management's brief: a question waiting on Vendor X is a blocker (on whom, what it blocks), not management's own; every row carries waitingOn and blocks", show({ q: m.questions, b: m.blockers }));
  const dec = (await F.mcp("decisions", { project: "alpha", status: "open" }, "owner-key")).out;
  ok(dec.whoOwes.elsewhere === 1 && dec.rows.some((x) => x.qid === "Q-f-vendor" && x.waitingOn === "Vendor X"), "F3 · decisions still counts it under elsewhere: the brief and Decisions agree", show(dec.whoOwes));
  const g1 = await F.mcp("submit_grade", { project: "alpha", checkId: "C.f2", verdict: "refused", proof: "GET /pay -> 500, the bad card was charged" }, "owner-key");
  const g2 = await F.mcp("submit_grade", { project: "alpha", checkId: "C.f1", verdict: "proven", proof: "GET /pay -> 200, total 12.00 shown" }, "owner-key");
  ok(!g1.isError && !g2.isError, "F4 · setup: C.f2 graded refused, C.f1 proven, through submit_grade", show([g1.out, g2.out]));
  fdb.prepare("INSERT OR IGNORE INTO k_check_stale (project, check_id) VALUES ('alpha', 'C.f1')").run();
  // the tool's own function: src/mcp.js and GET /read hand it their arguments (status rides with kind check)
  const r = async (args) => X.readAnswer(installReqMemo({ ...F.env, [Symbol.for("sharingu.project")]: "alpha" }), { id: "p-m", role: "member" }, { kind: "check", ...args });
  const all = (await F.mcp("read", { project: "alpha", kind: "check" }, "mem-key")).out, fail = await r({ status: "fail" }), pass = await r({ status: "pass" }), un = await r({ status: "ungraded" }), odd = await r({ status: "failed" });
  const gr = (o, id) => ((o.items || []).find((x) => x.id === id) || {}).grade;
  ok(all.items.length === 3 && gr(all, "C.f2").verdict === "refused" && gr(all, "C.f2").gradedAt && gr(all, "C.f2").stale === false && gr(all, "C.f1").stale === true && gr(all, "C.f3") === null,
    "F5 · read {kind: check} carries each check's latest grade (verdict, gradedAt, stale; null when ungraded)", show(all.items.map((x) => [x.id, x.grade])));
  ok(fail.items.length === 1 && fail.items[0].id === "C.f2" && fail.status === "fail" && pass.items.map((x) => x.id).join() === "C.f1" && un.items.map((x) => x.id).join() === "C.f3"
    && fail.items[0].ref === "check/C.f2" && odd.items.length === 3 && /pass, fail, ungraded/.test(odd.note || ""),
    "F6 · status narrows the page: fail answers exactly the refused one, pass the proven one, ungraded the third; an unknown status is said and left out", show({ fail: fail.items, odd: odd.note }));
  const keysOf = (o) => Object.keys(o).sort().join();
  ok(keysOf(fail.items[0]) === keysOf(all.items.find((x) => x.id === "C.f2")), "F7 · a filtered page's item has the same fields as the plain page's", `${keysOf(fail.items[0])} / ${keysOf(all.items.find((x) => x.id === "C.f2"))}`);
  const page1 = await r({ status: "ungraded", limit: 1 }), rest = await F.get("/read?project=alpha&kind=check", "mem-key");
  ok(page1.items.length === 1 && page1.next === null && rest.status === 200 && JSON.stringify(rest.j) === JSON.stringify(all), "F8 · a status page ends with next null; GET /read?kind=check answers what the tool answers", show({ page1, rest: rest.status }));
  const q1 = (await F.mcp("read", { project: "alpha", ref: "question/Q-f-vendor" }, "mem-key")).out, q2 = (await F.mcp("read", { project: "alpha", ref: "q/Q-f-vendor" }, "mem-key")).out;
  const q3 = (await F.mcp("read", { project: "alpha", kind: "question", ref: "question/Q-f-vendor" }, "mem-key")).out;
  ok(q1.kind === "question" && JSON.stringify(q1.item) === JSON.stringify(q2.item) && q3.item && q3.item.qid === "Q-f-vendor", "F9 · read {ref: question/<qid>} reads what q/<qid> reads (with kind question too)", show(q1));
  const r1 = await F.mcp("rule_question", { project: "alpha", qid: "Q-f-r1", choice: 0 }, "owner-key");
  await new Promise((res) => setTimeout(res, 5));
  const r2 = await F.mcp("rule_question", { project: "alpha", qid: "Q-f-r2", choice: 1, rationale: "the later one" }, "owner-key");
  const late = (await F.mcp("decisions", { project: "alpha", sort: "decided", limit: 1 }, "mem-key")).out, both = (await F.mcp("decisions", { project: "alpha", status: "in-force", sort: "decided" }, "mem-key")).out;
  const lr = await F.get("/decisions?project=alpha&sort=decided&limit=1", "mem-key");
  ok(!r1.isError && !r2.isError && late.rows.length === 1 && late.rows[0].qid === "Q-f-r2" && late.rows[0].decidedBy === "p-o" && late.rows[0].decidedAt && late.more === true && late.counts.inForce === 2
    && both.rows.map((x) => x.qid).join() === "Q-f-r2,Q-f-r1" && lr.status === 200 && JSON.stringify(lr.j) === JSON.stringify(late),
    "F10 · decisions sort decided, limit 1: the later ruling, with who ruled it and when (the counts whole, more: true); GET /decisions the same", show(late.rows));
}

// ---- the seatless owner's default read names the projects they may read (P3-F, P3 fault 5) ----
{
  const own = (await D.mcp("search", { q: "pricing" }, "owner-key")).out, named = (await D.mcp("search", { project: "alpha", q: "pricing" }, "owner-key")).out;
  ok(own.project === "alpha" && /Add `project`: one of \[alpha, beta\]/.test(own.projectNote || "") && named.projectNote === undefined,
    "F11 · a seatless owner's search with no project reads the first project and its projectNote names both; a named project carries none", show(own.projectNote));
}

// ---- the Library page ----
{
  const mem = await D.get("/library?project=alpha", "mem-key", "text/html"), own = await D.get("/library?project=alpha", "owner-key", "text/html");
  const vis = (t) => t.replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "");
  ok(mem.status === 200 && /data-screen="library"/.test(mem.t) && /data-doc="guides\/pricing.md" data-due=/.test(mem.t) && /data-card="claim\/c-open"/.test(mem.t) && /data-lists-on="gtm"/.test(mem.t) && !SECRETS.test(vis(mem.t)),
    "B16 · the Library for a member: the open doc (due for review), the open claim (lists on GTM); no hidden doc, card or kind on the page");
  ok(/data-card="deal\/d-1"/.test(own.t) && /data-doc="secret\/pricing-terms.md"/.test(own.t), "C16 · the owner's Library lists the deals and the restricted doc");
  const s = await D.get("/library?project=alpha&q=pricing", "mem-key", "text/html");
  ok(s.status === 200 && /data-hit="goal\/g-pricing"/.test(s.t) && /data-hit="doc\/guides\/pricing.md"/.test(s.t) && !SECRETS.test(vis(s.t)), "C17 · the Library's search for a member: hits by kind, nothing hidden");
  const anon = await D.get("/library", null, "text/html");
  ok(anon.status === 302 && /^\/login/.test(anon.location || ""), "B17 · a signed-out browser is sent to sign in");
  const json = await D.get("/library?project=alpha", "mem-key");
  ok(json.status === 200 && Array.isArray(json.j.docs), "C18 · a script still gets the library tool's JSON list");
}

// ---- sprint 7's review, B2: a card kind's tab link is under the org's address (the Library page and MCP read's lists-on) ----
{
  const acme = freshDb();
  acme.prepare("INSERT INTO org (id, name, created_at, updated_at) VALUES (1, 'Acme', ?, ?)").run(T0, T0);
  await W(acme, "alpha", ALPHA);
  const A = door(acme);
  const lib = await A.get("/library?project=alpha", "mem-key", "text/html");
  const href = (/<a class="u-link" href="([^"]+)" data-lists-on="gtm"/.exec(lib.t) || [])[1];
  const rd = await A.mcp("read", { project: "alpha", ref: "card/claim/c-open" }, "mem-key");
  const lo = ((rd.out && rd.out.links) || []).find((l) => l.rel === "lists-on");
  const lj = await A.get("/library?project=alpha", "mem-key");
  const kh = ((lj.j && lj.j.kinds) || []).find((k) => k.key === "claim");
  ok(acme.prepare("SELECT slug FROM org WHERE id = 1").get().slug === "acme" && href === "/acme/gtm" && lo && lo.href === "/acme/gtm" && (!kh || kh.tabHref === "/acme/gtm"),
    "B19 · the org's address on a card kind's tab link: the Library page's Lists on and MCP read's lists-on link are /acme/gtm, never the root's /gtm", show([href, lo, lj.j && Object.keys(lj.j)]));
}

// ---- a one-project org: a seatless member reads its single project ----
{
  const one = freshDb(["solo"], []);
  await W(one, "solo", [{ kind: "goal", op: "upsert", data: { id: "s-root", title: "Solo pricing" } }]);
  const S = door(one, ["solo"]);
  const z = await S.mcp("search", { q: "pricing" }, "seatless-key"), pz = await S.mcp("search", { q: "pricing" }, "loner-key");
  ok(!z.isError && z.out.project === "solo" && z.out.total === 1 && pz.isError && pz.out.error === "project_required",
    "B18 · a one-project org: a seatless member reads its single project; a Partner seated nowhere reads none", show([z.out, pz.out]));
}

// ================= D. bounded =================
{
  const plan = (sql, args) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...args).map((r) => r.detail).join(" | ");
  const scans = (p) => /(^|\| )SCAN (?!CONSTANT ROW|json_each|\(subquery|\w+ VIRTUAL TABLE|k_find VIRTUAL)/.test(p);
  const J = (a) => JSON.stringify(a);
  const checks = [
    ["CHANGES_SQL", X.CHANGES_SQL, ["alpha", T0, 10]], ["CHIP_SQL", X.CHIP_SQL, ["alpha", T0, 10]], ["CONTRIB_PAGE_SQL", X.CONTRIB_PAGE_SQL, ["alpha", "9999", "z", 10]],
    ...Object.entries(X.BACK_SQL).map(([k, s]) => [`BACK_SQL.${k}`, s, ["alpha", J([1, 2])]]),
    ["LIB_DOCS_SQL", X.LIB_DOCS_SQL, ["alpha"]], ["LIB_CARDS_SQL", X.LIB_CARDS_SQL, ["alpha"]], ["CARD_KIND_META_SQL", X.CARD_KIND_META_SQL, ["alpha"]],
    ["FIND_SQL", X.FIND_SQL, ['p : x AND {title body} : "a"*', 1, 2, 3]],
    ["CHECK_GRADES_SQL", X.CHECK_GRADES_SQL, ["alpha", J(["C.a", "C.b"])]], ["CHECK_WINDOW_SQL", X.CHECK_WINDOW_SQL, ["alpha", "", X.CHECK_SCAN, ""]],
  ];
  const bad = checks.filter(([, s, a]) => scans(plan(s, a))).map(([n, s, a]) => `${n}: ${plan(s, a)}`);
  ok(!bad.length, `D1 · every extract statement is indexed (${checks.length} plans, no SCAN of a table)`, bad.join(" ;; "));
  // a read-back is a rowid lookup, never the project's primary-key range (which reads every row of the project)
  const byRange = Object.entries(X.BACK_SQL).filter(([, s]) => !/USING INTEGER PRIMARY KEY \(rowid=\?\)/.test(plan(s, ["alpha", J([1, 2])]))).map(([k, s]) => `${k}: ${plan(s, ["alpha", J([1, 2])])}`);
  ok(!byRange.length, "D3 · each read-back looks its rowids up (USING INTEGER PRIMARY KEY), never the project's range", byRange.join(" ;; "));
  // D1 binds a JS number as REAL; FTS5 pushes only an INTEGER rowid bound into the index (else it walks every match)
  ok(/rowid >= CAST\(\?2 AS INTEGER\) AND rowid < CAST\(\?3 AS INTEGER\)/.test(X.FIND_SQL), "D4 · the kind's rowid range is bound as INTEGER (CAST), so FTS5 reads that kind's matches alone");
  const src = readFileSync(join(ENGINE, "src/extract.js"), "utf8");
  const vis = [...src.matchAll(/const (CARD_VIS_SQL|DOC_VIS_SQL|NAMES_SQL|GOAL_CONTRIBS_SQL|CONTRIB_BACK_SQL) = (`[^`]*`|"[^"]*")/g)].map((m) => [m[1], m[2].slice(1, -1).replace(/\$\{IN\((\d)\)\}/g, "(SELECT value FROM json_each(?$1))").replace(/\{org\}/g, "1")]);   // the layer's {org}: org 1's (src/data.js orgSql)
  const args = { CARD_VIS_SQL: ["alpha", J([["claim", "c-open"]])], DOC_VIS_SQL: ["alpha", J(["a"])], NAMES_SQL: [J(["p-o"])], GOAL_CONTRIBS_SQL: ["alpha", "g", 5], CONTRIB_BACK_SQL: ["alpha", J([1])] };
  const bad2 = vis.filter(([n, s]) => scans(plan(s, args[n]))).map(([n, s]) => `${n}: ${plan(s, args[n])}`);
  ok(vis.length === 5 && !bad2.length, `D2 · the visibility, names and contribution reads are indexed too (${vis.length} plans)`, bad2.join(" ;; ") || show(vis.map((x) => x[0])));
}

// ---- R2 (sprint 5) · the org roll-up: changes {org: true} answers the whole org in one bounded aggregate ----
// (dates are relative to now, so the default 30-day window holds them on any day — the review's L3)
{
  const { changesAnswer } = await imp("src/extract.js");
  const db = freshDb(["alpha", "beta", "gamma"]);
  const tx = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,'auto','landed',?,?,?,1)");
  const ago = (d, h = 0) => new Date(Date.now() - d * 864e5 - h * 36e5).toISOString();
  tx.run("T-1", "p-m", "leader", "note", "work a1", 0, "alpha", ago(5));
  tx.run("T-2", "p-m", "code", "pr", "work a2", 0, "alpha", ago(4));
  tx.run("T-3", "p-o", "leader", "knowledge", "an owner-only doc", 0, "alpha", ago(1));   // the newest alpha row: knowledge
  tx.run("T-4", "p-o", "leader", "grade", "g a", 0, "alpha", ago(3));
  tx.run("T-5", "p-b", "leader", "note", "work b1", 0, "beta", ago(3));
  tx.run("T-6", "p-o", "leader", "note", "an eval row", 1, "beta", ago(3));
  tx.run("T-7", "p-o", "leader", "note", "too old", 0, "beta", "2020-01-01T00:00:00.000Z");
  const envO = asOrg({ DB: d1(db), BRAIN: brain() });
  const since = ago(10);
  const o = await changesAnswer(envO, OWNER, { org: true, since });
  const bp = Object.fromEntries((o.byProject || []).map((r) => [r.project, r]));
  ok(o.org === true && o.byProject.length === 3 && bp.alpha.filings === 4 && bp.alpha.contributions === 2 && bp.alpha.knowledge === 1 && bp.alpha.grades === 1
    && bp.beta.filings === 1 && bp.gamma.filings === 0 && o.total === 5 && o.byProject[0].project === "alpha",
    "org roll-up (owner): three projects in one answer — the splits right, the silent project at zero, busiest first", show(o.byProject));
  const ev = await changesAnswer(envO, OWNER, { org: true, since, eval: true });
  ok(ev.total === 6 && Object.fromEntries(ev.byProject.map((r) => [r.project, r.filings])).beta === 2, "org roll-up: eval: true includes the suite row", show(ev.total));
  // H1 (the review): a member never sees knowledge writes — they may name owner-only docs or cards. No knowledge column,
  // the knowledge row not counted, and `latest` is NOT the knowledge write's time (it would leak that one happened)
  const m = await changesAnswer(envO, { id: "p-m", name: "Mia", role: "member" }, { org: true, since });
  const ma = m.byProject[0] || {};
  ok(m.byProject.length === 1 && ma.project === "alpha" && ma.filings === 3 && !("knowledge" in ma) && ma.latest.slice(0, 10) === ago(3).slice(0, 10) && ma.latest < ago(2) && /owner's to see/.test(m.note),
    "H1 · a member's roll-up counts no knowledge write, carries no knowledge column, and its latest is not the knowledge write's time", show(m.byProject));
  const z = await changesAnswer(envO, { id: "p-z", name: "Zed", role: "member" }, { org: true });
  ok(z.byProject.length === 0 && z.total === 0 && /no seat/.test(z.note || ""), "org roll-up (seatless): an honest empty", show(z));
  // M1 (the review): since is an ISO time, normalised to UTC; anything else is refused, never compared as text
  const bads = await Promise.all(["v4", "4", "1", "Oct 1 2026", "yesterday"].map((x) => changesAnswer(envO, OWNER, { org: true, since: x })));
  ok(bads.every((b) => b.error === "bad_since"), "M1 · v4, a bare 4 or 1, 'Oct 1 2026' and 'yesterday' are refused bad_since", show(bads.map((b) => b.error)));
  const off = new Date(Date.now() - 10 * 864e5);
  const p2 = (n) => String(n).padStart(2, "0");
  const offIso = `${off.getUTCFullYear()}-${p2(off.getUTCMonth() + 1)}-${p2(off.getUTCDate())}T${p2(off.getUTCHours())}:00+04:00`;
  const withOff = await changesAnswer(envO, OWNER, { org: true, since: offIso });
  ok(!withOff.error && /Z$/.test(withOff.since.at) && withOff.total === 5, "M1 · a since with an offset is normalised to UTC and counts the same rows", show(withOff.since));
  const dflt = await changesAnswer(envO, OWNER, { org: true });
  ok(dflt.since && /last 30 days/.test(dflt.since.label) && dflt.total === 5, "org roll-up: the default window is the last 30 days (the recent rows in, the 2020 row out)", show(dflt.since));
  // M2 (the review; sprint 13, 13.4: the share is ORG_ROWS_MAX = 1,000): the read is bounded — each project reads at most its
  // share of 1,000 of its newest rows; a project that reaches it is marked capped, its counts a floor
  const big = freshDb(["alpha", "beta"]);   // beta: the default seats name it
  const tb = big.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,'auto','landed',0,'alpha',?,1)");
  for (let i = 0; i < 1600; i++) tb.run(`T-b${i}`, "p-o", "leader", "note", "w", ago(0, i % 200));
  const capd = await changesAnswer(asOrg({ DB: d1(big), BRAIN: brain() }), OWNER, { org: true, since: ago(30) });
  const A1 = capd.byProject.find((r) => r.project === "alpha"), B1 = capd.byProject.find((r) => r.project === "beta");
  ok(A1.filings === 500 && A1.capped === true && !B1.capped && capd.capped === true && /newest 500 rows/.test(capd.note) && /a floor/.test(capd.note),
    "M2 · 1,600 rows in alpha, two projects: alpha reads its share (1,000 / 2 = 500), marked capped; beta not; the note says the counts are a floor", show(capd.byProject));
}

// ---- 13.4 (sprint 13) · the org-wide count inside the row budget: ONE statement a project in ONE batch, each a range of
// idx_transmission_project newest first (no sort, no correlated subquery over json_each: D1 counted that shape's rows twice,
// 2,837 rows on a 6,000-filing org), and the LIMIT bounds the rows READ: a suite row or a knowledge write the reader may not
// count is scanned and counted out, never walked past the project's share ----
{
  const { changesAnswer, ORG_COUNT_SQL, ORG_ROWS_MAX } = await imp("src/extract.js");
  ok(typeof ORG_COUNT_SQL === "string" && ORG_ROWS_MAX === 1000, "13.4 · the bound: 1,000 rows shared by the projects (at least one each: the sum never passes it)", show([typeof ORG_COUNT_SQL, ORG_ROWS_MAX]));
  // a 6,000-filing org the 12.5 measure's shape (alpha 4,000, web 1,200, growth 800 over 60 days), and a hostile alpha: its
  // newest 3,000 rows are suite rows and knowledge writes, the rows a member may not count
  const six = freshDb(["alpha", "web", "growth"], [["p-m", "alpha"], ["p-m", "web"], ["p-m", "growth"]]);
  const ins = six.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,'auto','landed',?,?,?,1)");
  const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();
  const KINDS = ["note", "pr", "grade", "note", "knowledge"];
  let i = 0;
  for (const [proj, n] of [["alpha", 4000], ["web", 1200], ["growth", 800]])
    for (let j = 0; j < n; j++, i++) {
      const hostile = proj === "alpha" && j < 3000;   // alpha's newest 3,000: suite rows and knowledge writes
      ins.run(`T-s${i}`, "p-m", "code", hostile ? (j % 2 ? "knowledge" : "note") : KINDS[j % 5], "w", hostile && !(j % 2) ? 1 : 0, proj, ago(j * (60 * 24 * 60 / n)));
    }
  const scanned = [];
  const base = d1(six);
  const spy = { prepare: (sql) => base.prepare(sql), batch: async (list) => { const out = await base.batch(list);
    list.forEach((st, k) => { if (st.sql === orgSqlOf(ORG_COUNT_SQL)) scanned.push(Number(((out[k] && out[k].results) || [])[0]?.scanned) || 0); }); return out; } };
  function orgSqlOf(sql) { return sql.replace(/\{org\}/g, "1"); }
  const env6 = asOrg({ DB: spy, BRAIN: brain() });
  const owner6 = await changesAnswer(env6, OWNER, { org: true });
  const ownerScan = scanned.splice(0).reduce((a, b) => a + b, 0);
  const mem6 = await changesAnswer(env6, { id: "p-m", name: "Mia", role: "member" }, { org: true });
  const memScan = scanned.splice(0).reduce((a, b) => a + b, 0);
  ok(!owner6.error && owner6.byProject.length === 3 && ownerScan > 0 && ownerScan <= ORG_ROWS_MAX && !mem6.error && memScan > 0 && memScan <= ORG_ROWS_MAX,
    `13.4 · a 6,000-filing org, the owner and a member (alpha's newest 3,000 rows hidden from the member): each answer scans at most ${ORG_ROWS_MAX} rows (owner ${ownerScan}, member ${memScan})`, show([owner6.byProject, mem6.byProject]));
  const ma = mem6.byProject.find((r) => r.project === "alpha") || {};
  ok(ma.capped === true && ma.filings === 0 && !("knowledge" in ma) && mem6.capped === true,
    "13.4 · the member's alpha: its scan filled with rows it may not count, so it is capped at 0 (a floor), never walked further", show(ma));
  // the plan: each statement one range of idx_transmission_project, in the index's order (no temp b-tree, nothing correlated)
  const p = six.prepare("EXPLAIN QUERY PLAN " + orgSqlOf(ORG_COUNT_SQL)).all("alpha", ago(43200), 1, 333, 0).map((r) => r.detail).join(" | ");
  ok(/SEARCH t USING INDEX idx_transmission_project \(project=\? AND created_at>\?\)/.test(p) && !/TEMP B-TREE|CORRELATED|json_each/.test(p),
    `13.4 · one project's count is one range of idx_transmission_project, no sort, nothing correlated -> ${p}`);
  // D1 counts every probe of an ephemeral b-tree as a row read (an IN list of constants is one: the sprint-5 count's NOT IN of
  // ten kinds doubled its rows, 2,837 on a 6,000-filing org, measured on workerd); the program opens none, and no sorter
  const ops = six.prepare("EXPLAIN " + orgSqlOf(ORG_COUNT_SQL)).all("alpha", ago(43200), 1, 333, 0).map((r) => r.opcode);
  ok(ops.length > 0 && !ops.some((o) => /^(OpenEphemeral|OpenAutoindex|SorterOpen)$/.test(o)), `13.4 · the program opens no ephemeral table and no sorter (${ops.length} opcodes)`,
    show(ops.filter((o) => /Ephemeral|Sorter|Autoindex/.test(o))));
  // the answer the sprint-5 read gave, by brute force over the same rows (the owner's newest `cap` of each project)
  const cap = Math.max(1, Math.floor(ORG_ROWS_MAX / 3)), since = owner6.since.at;
  const brute = (proj) => six.prepare("SELECT kind, created_at, eval FROM transmission WHERE project = ? AND created_at > ? ORDER BY created_at DESC LIMIT ?").all(proj, since, cap);
  const want = Object.fromEntries(["alpha", "web", "growth"].map((k) => { const r = brute(k).filter((x) => x.eval === 0);
    return [k, { filings: r.length, grades: r.filter((x) => x.kind === "grade").length, knowledge: r.filter((x) => x.kind === "knowledge").length }]; }));
  const got = Object.fromEntries(owner6.byProject.map((r) => [r.project, { filings: r.filings, grades: r.grades, knowledge: r.knowledge }]));
  ok(JSON.stringify(got, Object.keys(want.alpha).concat(Object.keys(want))) === JSON.stringify(want, Object.keys(want.alpha).concat(Object.keys(want))),
    "13.4 · the owner's counts are the brute-force counts of each project's newest share (eval rows counted out)", show([got, want]));
}

console.log(`\nextract-selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
