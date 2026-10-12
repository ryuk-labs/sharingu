// tools/versions-selftest.mjs — a project's versions: snapshots of its knowledge in D1 (src/knowledge/versions.js), offline.
// A REAL SQLite built from boot.sql (node:sqlite; a D1-shaped binding whose batch is ONE transaction, as D1's is), the
// knowledge filed through the real write door, then the real src/index.js handler and src/mcp.js callTool over it.
//   A. The statements come from the registry: every column of every knowledge table in boot.sql is in the snapshot
//      (k_options through its question), a restore replaces every knowledge table, and a column added to a table goes red.
//   B. publish_version: v1 holds every row of the project and nothing of another, its counts per kind, ONE ledger row
//      (kind knowledge) in the same batch; the head read is one row on the primary key; a batch with a failing statement
//      writes nothing; owner only, a title, a project the owner names.
//   C. What changed, worked out when a version is made (from the one before it): a changed goal ~, a new goal +, a removed
//      card -, an option change on a question ~, the counts per kind, at most 30 lines and `more`; nothing changed, nothing;
//      a table whose chunks did not change is never expanded.
//   D. restore_version: every knowledge table of the project is v1's again (every column, who and when included; the
//      options with their question's who and when; k_check_refs rebuilt by its triggers), another project untouched, a
//      restored version appended with v1's snapshot and counts; an unknown version refused with nothing written.
//   E. Chunks: rows larger than a chunk are split across k_snapshots rows and come back whole.
//   F. The doors: POST /versions/publish and /versions/restore through the handler (the owner; a seat 403 owner_only; a
//      read-only key 403; no key 401; the form 303 back to /versions), GET /versions (JSON and the page), /versions/:v,
//      ?head=1 no-store; the MCP twins answer the same.
// Exit code decides: 0 when every case holds.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const V = await imp("src/knowledge/versions.js");
const { KINDS: KINDS_REG, KNOWLEDGE_KINDS: KK, MAX_OPTIONS, OPTION_WHAT_MAX, OPTION_TRADEOFF_MAX } = await imp("src/knowledge/schema.js");
// F6's bound, from the registry (a design-time proof: the worker never needs it at run time). rowBytesMax(kind) -> the most
// bytes one row of the kind can take in a snapshot (its json_object as SQLite writes it): a text field max characters of at
// most 6 bytes each (a control character is written \u00XX), or its `bytes` cap when lower; a JSON field max characters of
// at most 3 bytes each (a quote or a backslash doubles, a character outside ASCII is 3); a number 24; who and when; a
// question's options. CHUNK_PAYLOAD_MAX: CHUNK_BYTES, the row that crosses it, and a comma per row (a row is over 40 bytes).
const D1_ROW_BYTES = 2000000;
const AUDIT_COLS = ["created_by", "created_at", "updated_by", "updated_at"];
const textMax = (chars) => 2 + 6 * chars;
const fieldMax = (c) => (c.t === "json" ? 2 + 3 * c.max : c.t === "int" || c.t === "real" ? 24 : c.t === "bool" ? 1
  : c.bytes ? Math.min(c.bytes, textMax(c.max)) : textMax(c.max));
const AUDIT_MAX = AUDIT_COLS.reduce((n, a) => n + a.length + 4, 0) + 2 * textMax(64) + 2 * textMax(40);   // people ids (uuids) and ISO times
const OPTIONS_MAX = 12 + MAX_OPTIONS * (40 + textMax(OPTION_WHAT_MAX) + textMax(OPTION_TRADEOFF_MAX));
const rowBytesMax = (kind) => 2 + KINDS_REG[kind].cols.reduce((n, c) => n + c.c.length + 4 + fieldMax(c), 0) + AUDIT_MAX + (kind === "question" ? OPTIONS_MAX : 0);
const CHUNK_PAYLOAD_MAX = V.CHUNK_BYTES + Math.max(...KK.map(rowBytesMax)) + Math.ceil(V.CHUNK_BYTES / 40) + 2;
const { writeKnowledge } = await imp("src/knowledge/write.js");
const VV = await imp("src/versionsview.js");
const { KINDS, BODY_BYTES } = await imp("src/knowledge/schema.js");

let passes = 0, fails = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const show = (v) => JSON.stringify(v).slice(0, 400);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const UTF8 = (s) => Buffer.byteLength(s);

// ---- the database ----
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const T0 = "2026-09-01T00:00:00.000Z";
function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(BOOT);
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)");
  P.run("p-o", "Owen Park", "owen@example.test", "owner", sha("owner-key"), T0);
  P.run("p-c", "Rae Kim", "rae@example.test", "internal-eng", sha("seat-key"), T0);
  db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}'),('beta','Beta',1,'${T0}')`);
  db.exec(`INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-c','alpha','member','${T0}')`);
  return db;
}
// d1(db, { failOn }) — a D1-shaped binding: batch is ONE transaction (all or nothing); failOn(sql) makes a statement throw
function d1(db, o = {}) {
  const exec = (sql, args) => {
    if (o.failOn && o.failOn(sql)) throw new Error("D1_ERROR: injected");
    return /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
  };
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
// a render's and a style's body go to R2 (src/knowledge/write.js putBodies): kept in memory here; a snapshot holds their
// INDEX rows only (the bodies are immutable and never deleted), so a restore brings back the hashes and nothing else
const blobs = new Map();
const brain = () => ({ get: async (k) => (blobs.has(k) ? { text: async () => blobs.get(k) } : null), head: async () => null, list: async () => ({ objects: [], truncated: false }),
  put: async (k, v) => { blobs.set(k, String(v)); } });
const OWNER = { id: "p-o", name: "Owen Park", role: "owner" }, SEAT = { id: "p-c", name: "Rae Kim", role: "internal-eng" };
const G = (id, parent, x = {}) => ({ kind: "goal", op: "upsert", data: { id, title: id.replace(/-/g, " "), parent, ...x } });
const GTM = { identity: {}, activityKinds: ["post", "reply"], fields: [], activityTemplate: { kinds: [{ kind: "post", holds: [{ field: "url" }], proofConcrete: "a link" }] }, proofRule: "a link", outcomeModel: {} };
const SEED = [
  { kind: "aim", op: "upsert", data: { aim: "Prove the loop", measure: { name: "loops", value: 2, period: "this week", prior: 1, priorPeriod: "last week", source: "the ledger" } } },
  G("root", null, { dimensions: ["code"], weight: 2.5, target: 10, outcomeMetric: true, owner: "Owen", due: "2026-12-31", note: "n", status: "active", sort: 1 }),
  G("file-it", "root"), G("see-it", "root", { dimensions: ["gtm"] }),
  { kind: "question", op: "upsert", data: { qid: "Q-open", question: "Which door?", why: "w", area: "a", severity: "high", options: [{ what: "preview then file", tradeoff: "one path" }, { what: "a file" }], affects: ["goal:root"], blocks: [] } },
  { kind: "question", op: "upsert", data: { qid: "Q-ruled", question: "Which db?", status: "decided", choice: 0, label: "D1", rationale: "free", decidedBy: "p-o", decidedAt: T0, options: [{ what: "D1" }, { what: "R2" }] } },
  { kind: "check", op: "upsert", data: { id: "AC.1", title: "Home shows the aim", given: "g", when: "w", then: "t", refs: ["goal:root", "screen:home"], rulings: ["Q-ruled"], kind: "e2e", method: "m", severity: "s", sourceType: "st", sourceId: "si", status: "live" } },
  { kind: "card_kind", op: "upsert", data: { key: "decision", label: "Decisions", idPattern: "^d-\\d+$", roleVisibility: ["owner"] } },
  { kind: "card", op: "upsert", data: { kind: "decision", id: "d-1", name: "One product", status: "live", body: "# One product\n", roleVisibility: ["owner"] } },
  { kind: "node", op: "upsert", data: { id: "screen:home", type: "screen", name: "Home", status: "live", data: { route: "/home" } } },
  { kind: "node", op: "upsert", data: { id: "table:k_goals", type: "table", name: "k_goals", data: { cols: [{ name: "id" }] } } },
  { kind: "edge", op: "upsert", data: { from: "screen:home", to: "table:k_goals", kind: "reads", label: "the tree", data: { why: "x" } } },
  { kind: "gtm", op: "upsert", data: { template: GTM } },
  { kind: "doc", op: "upsert", data: { path: "start-here.md", title: "Start here", body: "Read this first.", roleVisibility: ["owner"] } },
  { kind: "style", op: "upsert", data: { id: "app", css: ".home{color:#222}" } },
  { kind: "render", op: "upsert", data: { screen: "screen:home", state: "default", variant: "live", format: "html", body: "<div class=\"home\">Home</div>", style: "app", width: 390, height: 844 } },
];
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'k\\_%' ESCAPE '\\' ORDER BY name").all().map((r) => r.name);
const colsOf = (db, t) => db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map((r) => r.name);
// dump(db, project) -> every row of every knowledge table (and k_check_refs), sorted, as one comparable string
const DUMPED = [...V.RESTORED_TABLES, "k_check_refs", "k_check_ungraded"];
const dump = (db, project) => JSON.stringify(Object.fromEntries(DUMPED.map((t) => [t, db.prepare(`SELECT * FROM ${t} WHERE project = ?`).all(project).map((r) => JSON.stringify(r)).sort()])));
const count = (db, sql, ...a) => Number(db.prepare(sql).get(...a).n);
// content(db, project) -> dump() with the options' who and when left out (a restored option takes its question's)
const content = (db, project) => JSON.stringify(Object.fromEntries(DUMPED.map((t) => [t, db.prepare(`SELECT * FROM ${t} WHERE project = ?`).all(project)
  .map((r) => { if (t === "k_options") for (const c of ["created_by", "created_at", "updated_by", "updated_at"]) delete r[c]; return JSON.stringify(r); }).sort()])));

// ================= A. the registry =================
{
  const db = freshDb();
  const all = tables(db);
  // derived tables follow their sources through triggers (k_check_refs, k_check_ungraded: k_checks; migrate-043's
  // k_node_lights: k_check_refs and the grades; k_node_links: k_edges; migrate-046's k_screen_renders: k_renders), so a
  // restore of the sources restores them
  // migrate-050's k_fill (the checklist's counts: k_nodes, k_edges, k_renders, k_check_refs, k_checks, check_results, k_goals)
  // sprint 3 B4's k_node_stale and k_check_stale (migrate-054): what changed after a grade, kept by triggers on the nodes, the
  // renders, the contributions and the grades; a restore changes nodes, so it records its changes there rather than restoring them
  // sprint 3 B5's k_find (migrate-056, FTS5) and its shadow tables: search's index, kept by triggers on the sources, so a
  // restore of the sources rewrites it
  // sprint 8 8.3b's k_question_refs (migrate-078): each question's affects, kept by triggers on k_questions (a restore of the
  // questions keeps it, as k_check_refs follows the checks)
  // sprint 4 M6's k_screen_takes (migrate-065): every body a frame has held, appended by triggers on k_renders; a restore
  // changes renders, so it appends their takes there rather than restoring them (history is never rewound)
  const derived = new Set(["k_versions", "k_snapshots", "k_check_refs", "k_check_ungraded", "k_node_lights", "k_node_links", "k_screen_renders", "k_fill", "k_node_stale", "k_check_stale",
    "k_find", "k_find_config", "k_find_data", "k_find_docsize", "k_find_idx", "k_screen_takes", "k_question_refs"]);
  const knowledge = all.filter((t) => !derived.has(t));
  ok(JSON.stringify([...V.RESTORED_TABLES].sort()) === JSON.stringify(knowledge), `a restore replaces every knowledge table in boot.sql (${knowledge.length}: ${knowledge.join(", ")})`, show(V.RESTORED_TABLES));
  // coverage(db) -> the columns of a knowledge table the snapshot does not carry
  const coverage = (d) => {
    const miss = [];
    for (const s of V.SNAPSHOT) for (const c of colsOf(d, s.table)) if (c !== "project" && !s.cols.includes(c)) miss.push(`${s.table}.${c}`);
    for (const c of colsOf(d, "k_options")) if (!["project", "qid", "created_by", "created_at", "updated_by", "updated_at", ...V.OPTION_COLS].includes(c)) miss.push(`k_options.${c}`);
    for (const s of V.SNAPSHOT) for (const c of s.cols) if (!colsOf(d, s.table).includes(c)) miss.push(`${s.table}.${c} (not a column)`);
    return miss;
  };
  const miss = coverage(db);
  ok(miss.length === 0, "every column of every knowledge table is in its snapshot (the registry's columns plus who and when; k_options inside its question)", miss.join(", "));
  const d2 = freshDb();
  d2.exec("ALTER TABLE k_goals ADD COLUMN colour TEXT"); d2.exec("ALTER TABLE k_options ADD COLUMN weight REAL");
  const red = coverage(d2);
  ok(red.includes("k_goals.colour") && red.includes("k_options.weight"), `both ways: a column added to k_goals and to k_options goes red (${red.join(", ")})`);
  ok(V.SNAPSHOT.every((s) => KINDS[s.kind].table === s.table) && V.SNAPSHOT.length === Object.keys(KINDS).length, "one snapshot entry per registry kind, on the kind's own table");
}

// ================= B. publish =================
const db = freshDb();
const envOf = (ws = "alpha", o = {}) => (asOrg({ DB: d1(db, o), [Symbol.for("sharingu.project")]: ws, BRAIN: brain() }));
const w0 = await writeKnowledge(OWNER, { project: "alpha", ops: SEED }, envOf());
ok(!w0.error && w0.written === SEED.length, `the seed: every kind filed on alpha through preview then file (${SEED.length} ops)`, show(w0));
const wb = await writeKnowledge(OWNER, { project: "beta", ops: [G("beta-root", null)] }, envOf("beta"));
ok(!wb.error, "a goal on beta, the other project", show(wb));
const alphaV1 = dump(db, "alpha"), beta0 = dump(db, "beta");
const tx0 = count(db, "SELECT COUNT(*) AS n FROM transmission");
const p1 = await V.publishVersion(OWNER, { project: "alpha", title: "The first cut" }, envOf());
const v1 = p1.version || {};
const snap1 = db.prepare("SELECT table_name, chunk, payload FROM k_snapshots WHERE project='alpha' AND n=1 ORDER BY table_name").all();
const rows1 = Object.fromEntries(snap1.map((r) => [r.table_name, JSON.parse(r.payload)]));
const tx1 = db.prepare("SELECT kind, lane, what, route, project, touches FROM transmission WHERE id = ?").get(p1.ledger || "") || {};
ok(!p1.error && v1.n === 1 && v1.cause.kind === "published" && v1.title === "The first cut" && v1.by === "Owen Park"
  && JSON.stringify(v1.counts) === JSON.stringify({ aim: 1, goal: 3, question: 2, check: 1, card: 1, card_kind: 1, node: 2, edge: 1, gtm: 1, doc: 1, render: 1, style: 1 }),
  `publish_version: v1, published, by Owen Park, counts ${show(v1.counts)}`, show(p1));
ok(snap1.length === 12 && snap1.every((r) => r.chunk === 0) && rows1.k_goals.length === 3 && rows1.k_goals.every((g) => g.created_by === "p-o" && g.updated_at)
  && rows1.k_questions.find((q) => q.qid === "Q-open").options.map((o) => o.what).join() === "preview then file,a file" && !JSON.stringify(rows1).includes("beta-root"),
  `the snapshot: one row per filed table (${snap1.length}), each row with its who and when, a question's options inside it, nothing of beta`);
ok(tx1.kind === "knowledge" && tx1.lane === "leader" && tx1.route === "auto" && tx1.project === "alpha" && tx1.what === "Published v1: The first cut" && count(db, "SELECT COUNT(*) AS n FROM transmission") === tx0 + 1,
  `ONE ledger row: kind knowledge, lane leader, routed auto, "${tx1.what}"`, show(tx1));
ok(dump(db, "alpha") === alphaV1, "a publish changes no knowledge");
const plan = db.prepare("EXPLAIN QUERY PLAN " + V.VERSION_HEAD_SQL).all("alpha").map((r) => r.detail).join(" | ");
ok(/SEARCH k_versions USING INDEX sqlite_autoindex_k_versions_1 \(project=\?\)/.test(plan) && !/TEMP B-TREE|SCAN/.test(plan), `the head read (every signed-in page pays it) is one SEARCH on the primary key: ${plan}`);
const head = await V.versionHead(envOf(), "alpha");
ok(head && head.n === 1 && head.at === v1.at, "versionHead reads v1");
// refusals, each with nothing written
const snapN = () => count(db, "SELECT COUNT(*) AS n FROM k_snapshots") + count(db, "SELECT COUNT(*) AS n FROM k_versions") + count(db, "SELECT COUNT(*) AS n FROM transmission");
const n0 = snapN();
const refusals = {
  seat: await V.publishVersion(SEAT, { project: "alpha", title: "x" }, envOf()),
  noTitle: await V.publishVersion(OWNER, { project: "alpha", title: "  " }, envOf()),
  unknown: await V.publishVersion(OWNER, { project: "gamma", title: "x" }, envOf()),
  unnamed: await V.publishVersion(OWNER, { title: "x" }, envOf()),
  failing: await V.publishVersion(OWNER, { project: "alpha", title: "x" }, envOf("alpha", { failOn: (sql) => sql.startsWith("INSERT INTO k_versions") })),
};
ok(refusals.seat.error === "owner_only" && refusals.noTitle.error === "title_required" && refusals.unknown.error === "project_forbidden" && refusals.unnamed.error === "project_required"
  && refusals.failing.error === "write_failed" && snapN() === n0,
  `refusals: a seat ${refusals.seat.error}, no title ${refusals.noTitle.error}, an unknown project ${refusals.unknown.error}, none named ${refusals.unnamed.error}, a failing statement ${refusals.failing.error} (the batch rolled back: no snapshot, no version, no ledger row)`);

// ================= C. the diff =================
const w1 = await writeKnowledge(OWNER, { project: "alpha", ops: [
  { kind: "goal", op: "upsert", data: { id: "file-it", title: "file it, through the door" } }, G("prove-it", "root"),
  { kind: "card", op: "remove", data: { kind: "decision", id: "d-1" } },
  { kind: "question", op: "upsert", data: { qid: "Q-open", options: [{ what: "preview then file", tradeoff: "one path" }, { what: "a file" }, { what: "an email" }] } },
] }, envOf());
ok(!w1.error, "the change: a goal renamed, a goal filed, a card removed, an option added", show(w1));
const p2 = await V.publishVersion(OWNER, { project: "alpha", title: "The second cut" }, envOf());
const d12 = (p2.version || {}).changes || {};
const lineOf = (op, what, ref) => (d12.lines || []).find((l) => l.op === op && l.what === what && l.ref === ref);
ok(p2.version && p2.version.n === 2 && d12.from === 1 && d12.to === 2 && lineOf("~", "goal", "file-it") && lineOf("~", "goal", "file-it").label === "file it, through the door" && lineOf("+", "goal", "prove-it")
  && lineOf("-", "card", "decision|d-1") && lineOf("~", "question", "Q-open") && d12.lines.length === 4 && d12.more === 0
  && JSON.stringify(d12.byKind) === JSON.stringify({ goal: { added: 1, changed: 1, removed: 0 }, question: { added: 0, changed: 1, removed: 0 }, card: { added: 0, changed: 0, removed: 1 } }),
  `v2's changes from v1: ${(d12.lines || []).map((l) => `${l.op} ${l.what} ${l.ref}`).join(" · ")}; byKind ${show(d12.byKind)}`, show(d12));
ok((d12.lines || []).map((l) => l.what).join() === "goal,goal,question,card" && d12.lines[0].op === "+", "the lines in the registry's kind order, added before changed");
ok(p1.version.changes.from === null && p1.version.changes.lines.length === 0, "v1 has nothing before it: changes from null");
// a table whose snapshot chunks are the same on both sides is skipped whole: the comparison expands only what changed
{
  const sides = (n) => db.prepare("SELECT COUNT(*) AS n FROM k_snapshots s, json_each(s.payload) j WHERE s.project = 'alpha' AND s.n = ? AND s.payload NOT IN (SELECT o.payload FROM k_snapshots o WHERE o.project = 'alpha' AND o.n = ? AND o.table_name = s.table_name)").get(n, n === 2 ? 1 : 2).n;
  ok(sides(1) + sides(2) === 3 + 4 + 2 + 2 + 1, `v1 -> v2 expands only the changed tables' rows (goals 3+4, questions 2+2, the card 1): ${sides(1) + sides(2)} of ${count(db, "SELECT COUNT(*) AS n FROM k_snapshots s, json_each(s.payload) j WHERE s.project='alpha' AND s.n IN (1, 2)")}`);
}

// ================= D. restore =================
const beforeRestore = snapN();
const bad = await V.restoreVersion(OWNER, { project: "alpha", v: 9 }, envOf()), badSeat = await V.restoreVersion(SEAT, { project: "alpha", v: 1 }, envOf()), badV = await V.restoreVersion(OWNER, { project: "alpha", v: "one" }, envOf());
const noneYet = await V.restoreVersion(OWNER, { project: "beta", v: 1 }, envOf("beta"));
ok(bad.error === "unknown_version" && /v1 to v2/.test(bad.note) && badSeat.error === "owner_only" && badV.error === "unknown_version" && noneYet.error === "unknown_version" && /publish_version/.test(noneYet.note) && snapN() === beforeRestore,
  `refusals: v9 ${bad.error} ("${bad.note}"), a seat ${badSeat.error}, v "one" ${badV.error}, a project with no version ${noneYet.error}; nothing written`);
const rowids = () => ({ aim: db.prepare("SELECT rowid AS r FROM k_aim WHERE project='alpha'").get().r, check: db.prepare("SELECT rowid AS r FROM k_checks WHERE project='alpha' AND id='AC.1'").get().r,
  node: db.prepare("SELECT rowid AS r FROM k_nodes WHERE project='alpha' AND id='screen:home'").get().r, goal: db.prepare("SELECT rowid AS r FROM k_goals WHERE project='alpha' AND id='file-it'").get().r,
  option: db.prepare("SELECT rowid AS r FROM k_options WHERE project='alpha' AND qid='Q-ruled' AND idx=0").get().r });
const ids0 = rowids();
const r1 = await V.restoreVersion(OWNER, { project: "alpha", v: "v1" }, envOf());
const v3 = r1.version || {};
ok(!r1.error && r1.restored === 1 && v3.n === 3 && v3.cause.kind === "restored" && v3.cause.ref === "1" && v3.title === "Restored v1: The first cut" && JSON.stringify(v3.counts) === JSON.stringify(v1.counts),
  `restore_version v1: v3, restored from v1, "${v3.title}", v1's counts`, show(r1));
ok(dump(db, "alpha") === alphaV1, "every knowledge table of alpha is exactly v1's again: every column, who and when included, the options, k_check_refs rebuilt");
const d23 = v3.changes || {};
ok(d23.from === 2 && d23.lines.length === 4 && d23.byKind.goal.removed === 1 && d23.byKind.card.added === 1, `v3's changes from v2: the change undone (${(d23.lines || []).map((l) => `${l.op} ${l.ref}`).join(" · ")})`);
ok(dump(db, "beta") === beta0, "beta is untouched");
const ids1 = rowids();
ok(ids1.aim === ids0.aim && ids1.check === ids0.check && ids1.node === ids0.node && ids1.option === ids0.option && ids1.goal !== ids0.goal,
  "a restore writes only what changed: the aim, the check, the node and a ruled question's option keep their row (never rewritten); the renamed goal is rewritten");
const snap3 = db.prepare("SELECT table_name, payload FROM k_snapshots WHERE project='alpha' AND n=3 ORDER BY table_name").all();
ok(JSON.stringify(snap3) === JSON.stringify(snap1.map(({ table_name, payload }) => ({ table_name, payload }))), "v3 keeps v1's snapshot as its own");
const tx3 = db.prepare("SELECT kind, what FROM transmission WHERE id = ?").get(r1.ledger || "") || {};
ok(tx3.kind === "knowledge" && tx3.what === "Restored v1 as v3", `ONE ledger row: "${tx3.what}"`);
// a restore that fails part-way writes nothing: the project's knowledge, the versions and the ledger are as they were
const before = [dump(db, "alpha"), snapN()];
const rFail = await V.restoreVersion(OWNER, { project: "alpha", v: 2 }, envOf("alpha", { failOn: (sql) => sql.startsWith("INSERT INTO k_nodes") }));
ok(rFail.error === "write_failed" && dump(db, "alpha") === before[0] && snapN() === before[1], "both ways: a restore whose k_nodes insert fails rolls back whole (the deletes too)");
// the latest restore, then a restore of the current version (it drops what was filed since)
// F3 · a restore never loses what was filed since the newest version: it is kept as a version of its own first, in the same
// batch (the reviewer's case: v3 is current, a seat files a goal and a question, the owner rules one, then restores)
await writeKnowledge(SEAT, { project: "alpha", ops: [G("unpublished", "root"),
  { kind: "question", op: "upsert", data: { qid: "Q-since", question: "Filed after v3?", options: [{ what: "yes" }, { what: "no" }] } }] }, envOf());
await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "question", op: "upsert", data: { qid: "Q-open", status: "decided", choice: 1, label: "a file", decidedBy: "p-o", decidedAt: T0 } }] }, envOf());
const since3 = dump(db, "alpha"), content3 = content(db, "alpha");
const r3 = await V.restoreVersion(OWNER, { project: "alpha", v: 3 }, envOf());
const v4row = db.prepare("SELECT title, cause FROM k_versions WHERE project='alpha' AND n=4").get() || {};
const lines4 = ((await V.versionOne(envOf(), "alpha", 4)) || { changes: { lines: [] } }).changes.lines.map((l) => `${l.op} ${l.what} ${l.ref}`);
const tx5 = db.prepare("SELECT what, touches FROM transmission WHERE id = ?").get(r3.ledger || "") || {};
ok(!r3.error && r3.kept === 4 && r3.version.n === 5 && r3.version.cause.ref === "3" && dump(db, "alpha") === alphaV1 && v4row.title === "Before restoring v3" && v4row.cause === "published"
  && lines4.includes("+ goal unpublished") && lines4.includes("+ question Q-since") && lines4.includes("~ question Q-open") && tx5.what === "Restored v3 as v5; what the project held before is kept as v4"
  && /restore_version \{v: 4\} brings it back/.test(r3.note),
  `F3 · restoring the current version with work filed since: that work is kept as v4 "${v4row.title}" (${lines4.join(" · ")}), then v3 restored as v5; ledger "${tx5.what}"`, show(r3));
const r4 = await V.restoreVersion(OWNER, { project: "alpha", v: 4 }, envOf());
ok(!r4.error && r4.kept === null && r4.version.n === 6 && content(db, "alpha") === content3, `F3 · …and restore_version {v: 4} brings the seat's goal, its question and the ruling back, every row as it was (an option takes its question's who and when) (v6; nothing filed since v5, so nothing else kept: kept ${r4.kept})`, show(r4));
const r5 = await V.restoreVersion(OWNER, { project: "alpha", v: 5 }, envOf());
const n7 = snapN();
const cur = await V.restoreVersion(OWNER, { project: "alpha", v: 7 }, envOf());
ok(!r5.error && r5.version.n === 7 && r5.kept === null && dump(db, "alpha") === alphaV1 && cur.error === "already_current" && snapN() === n7,
  `F3 · restoring the current version with nothing filed since is refused ${cur.error}, nothing written ("${cur.note}")`);
// at most DIFF_MAX lines, the rest counted
{
  const many = Array.from({ length: 40 }, (_, i) => G(`g-${String(i).padStart(2, "0")}`, "root"));
  await writeKnowledge(OWNER, { project: "alpha", ops: many }, envOf());
  const pm = await V.publishVersion(OWNER, { project: "alpha", title: "Forty goals" }, envOf());
  const c = pm.version.changes;
  await V.restoreVersion(OWNER, { project: "alpha", v: 1 }, envOf());
  ok(c.lines.length === V.DIFF_MAX && c.more === 10 && c.byKind.goal.added === 40 && c.lines.every((l) => l.op === "+"), `forty goals filed: ${c.lines.length} lines and ${c.more} more, byKind goal added ${c.byKind.goal.added}`);
}

// ================= E. chunks =================
{
  const big = "x".repeat(400000);
  const docs = [1, 2, 3, 4, 5].map((i) => ({ kind: "doc", op: "upsert", data: { path: `big/${i}.md`, title: `Big ${i}`, body: big + i } }));
  const wd = await writeKnowledge(OWNER, { project: "alpha", ops: docs }, envOf());
  const pBig = await V.publishVersion(OWNER, { project: "alpha", title: "Big docs" }, envOf());
  const chunks = db.prepare("SELECT chunk, length(CAST(payload AS BLOB)) AS b, json_array_length(payload) AS n FROM k_snapshots WHERE project='alpha' AND n=? AND table_name='k_docs' ORDER BY chunk").all(pBig.version.n);
  const fullDocs = dump(db, "alpha");
  await writeKnowledge(OWNER, { project: "alpha", ops: [1, 2, 3, 4, 5].map((i) => ({ kind: "doc", op: "remove", data: { path: `big/${i}.md` } })) }, envOf());
  await V.restoreVersion(OWNER, { project: "alpha", v: pBig.version.n }, envOf());
  ok(!wd.error && chunks.length >= 2 && chunks.every((c) => c.b < 2000000) && chunks.reduce((s, c) => s + c.n, 0) === 6 && dump(db, "alpha") === fullDocs,
    `six docs (five of 400 KB) snapshot in ${chunks.length} chunks (${chunks.map((c) => `${c.n} rows ${Math.round(c.b / 1000)} KB`).join(", ")}), each under D1's 2 MB row, and restore whole`);
}
// F6 · a chunk can never pass D1's 2,000,000-byte row, by construction: every field is capped (a body by its bytes), so a
// row's snapshot JSON is at most rowBytesMax(kind), and CHUNK_BYTES + the largest row + a comma a row stays under the cap
{
  const worst = Math.max(...Object.keys(KINDS).map(rowBytesMax));
  ok(CHUNK_PAYLOAD_MAX + 1024 < D1_ROW_BYTES, `F6 · the largest chunk the registry allows: ${CHUNK_PAYLOAD_MAX} bytes (CHUNK_BYTES ${V.CHUNK_BYTES} + the largest row ${worst} + commas), under D1's ${D1_ROW_BYTES} with room for the row's other columns`);
  // the reviewer's case, which gave a 2,395,539-byte chunk before: docs of 499k ASCII, 399k ASCII and 499k CJK characters
  const cjk = "漢".repeat(499000);
  const three = [["r/a.md", "a".repeat(499000)], ["r/b.md", "b".repeat(399000)], ["r/c.md", cjk]].map(([path, body]) => ({ kind: "doc", op: "upsert", data: { path, body } }));
  const refused = await writeKnowledge(OWNER, { project: "alpha", ops: three }, envOf());
  const e = (refused.errors || [])[0] || {};
  const two = await writeKnowledge(OWNER, { project: "alpha", ops: three.slice(0, 2) }, envOf());
  ok(refused.error === "invalid_ops" && refused.count === 1 && e.id === "r/c.md" && e.error === "bad_field" && /500,000 bytes/.test(e.note) && !two.error,
    `F6 · the reviewer's three docs: the 499k-character CJK body (${UTF8(cjk)} bytes) is refused at the door (${e.error}: "${e.note}"); the two ASCII ones file`, show(refused));
  // the worst the door accepts: a body at the byte cap in ASCII, in CJK and in control characters (6 bytes each as JSON),
  // and questions whose every field and every option is at its cap in control characters, all in one publish
  const C = "\u0001";
  const atCap = [["w/ascii.md", "x".repeat(BODY_BYTES - 2)], ["w/cjk.md", "漢".repeat(Math.floor((BODY_BYTES - 2) / 3))], ["w/ctl.md", C.repeat(Math.floor((BODY_BYTES - 2) / 6))]];
  const qWorst = (i) => ({ kind: "question", op: "upsert", data: { qid: `Q-worst-${i}`, question: C.repeat(4000), why: C.repeat(8000), area: C.repeat(200), severity: C.repeat(40),
    options: Array.from({ length: 26 }, () => ({ what: C.repeat(2000), tradeoff: C.repeat(4000) })), whoOwes: C.repeat(200), waitingOn: C.repeat(400), implStatus: C.repeat(200), supersededBy: C.repeat(200), label: C.repeat(4000), rationale: C.repeat(8000),
    affects: [C.repeat(3300)], blocks: [C.repeat(3300)] } });
  const wW = await writeKnowledge(OWNER, { project: "alpha", ops: [...atCap.map(([path, body]) => ({ kind: "doc", op: "upsert", data: { path, title: C.repeat(400), body } })), qWorst(1), qWorst(2)] }, envOf());
  const pW = await V.publishVersion(OWNER, { project: "alpha", title: "The worst the door takes" }, envOf());
  const big = db.prepare("SELECT table_name, chunk, length(CAST(payload AS BLOB)) AS b FROM k_snapshots WHERE project='alpha' AND n=? ORDER BY b DESC").all((pW.version || {}).n || 0);
  const qRow = db.prepare("SELECT MAX(length(CAST(j.value AS BLOB))) AS b FROM k_snapshots s, json_each(s.payload) j WHERE s.project='alpha' AND s.n=? AND s.table_name='k_questions'").get((pW.version || {}).n || 0).b;
  const dRow = db.prepare("SELECT MAX(length(CAST(j.value AS BLOB))) AS b FROM k_snapshots s, json_each(s.payload) j WHERE s.project='alpha' AND s.n=? AND s.table_name='k_docs'").get((pW.version || {}).n || 0).b;
  ok(!wW.error && !pW.error && big.length && big.every((c) => c.b <= CHUNK_PAYLOAD_MAX) && qRow <= rowBytesMax("question") && dRow <= rowBytesMax("doc"),
    `F6 · the worst the door accepts publishes: the largest chunk is ${big[0] && big[0].b} bytes (${big[0] && big[0].table_name}), under the bound ${CHUNK_PAYLOAD_MAX}; a worst question row ${qRow} <= ${rowBytesMax("question")}, a worst doc row ${dRow} <= ${rowBytesMax("doc")}`, show([wW, pW.error]));
  await writeKnowledge(OWNER, { project: "alpha", ops: [...["r/a.md", "r/b.md", ...atCap.map((x) => x[0])].map((path) => ({ kind: "doc", op: "remove", data: { path } })),
    ...[1, 2].map((i) => ({ kind: "question", op: "remove", data: { qid: `Q-worst-${i}` } }))] }, envOf());
}

// ================= F13 · a publish whose events mirror fails writes nothing, and says so =================
{
  const before = [snapN(), count(db, "SELECT COUNT(*) AS n FROM events")];
  const failing = await V.publishVersion(OWNER, { project: "alpha", title: "the mirror fails" }, envOf("alpha", { failOn: (sql) => sql.startsWith("INSERT INTO events") }));
  const failW = await writeKnowledge(OWNER, { project: "alpha", ops: [G("mirror-fails", "root")] }, envOf("alpha", { failOn: (sql) => sql.startsWith("INSERT INTO events") }));
  ok(failing.error === "write_failed" && /Nothing was written/.test(failing.note) && failW.error === "write_failed" && snapN() === before[0] && count(db, "SELECT COUNT(*) AS n FROM events") === before[1]
    && !db.prepare("SELECT 1 FROM k_goals WHERE project='alpha' AND id='mirror-fails'").get(),
    `F13 · the events mirror rides the batch: when it fails, the publish (${failing.error}) and the knowledge write (${failW.error}) wrote nothing at all (no version, no snapshot, no ledger row, no goal), so "Nothing was written" is true`);
  const okP = await V.publishVersion(OWNER, { project: "alpha", title: "the mirror lands" }, envOf());
  const ev = db.prepare("SELECT json_extract(payload_json, '$.transmissionId') AS t FROM events WHERE kind = 'pr' ORDER BY rowid DESC LIMIT 1").get() || {};
  ok(!okP.error && ev.t === okP.ledger, `F13 · …and a publish that lands writes its mirror in the same batch (events row for ${okP.ledger})`);
}

// ================= F2 · the diff names a card or doc only to a reader its list admits =================
{
  const w = await writeKnowledge(OWNER, { project: "alpha", ops: [
    // the id matches its kind's idPattern ^d-\d+$ (the one-pass fix 6: the pattern is enforced; "d-7701" was accepted unchecked)
    { kind: "card", op: "upsert", data: { kind: "decision", id: "d-7701", name: "The secret plan", body: "x", roleVisibility: ["owner"] } },
    { kind: "doc", op: "upsert", data: { path: "open.md", title: "An open doc", body: "y" } },
    { kind: "doc", op: "upsert", data: { path: "secret/eng.md", title: "Only engineering", body: "z", roleVisibility: ["internal-eng"] } },
    { kind: "doc", op: "upsert", data: { path: "secret/design.md", title: "Only design", body: "z", roleVisibility: ["design"] } },
  ] }, envOf());
  const p = await V.publishVersion(OWNER, { project: "alpha", title: "Secrets" }, envOf());
  const seat = await VV.readVersionsView(envOf(), SEAT, {}), own = await VV.readVersionsView(envOf(), OWNER, {});
  const label = (d, ref) => ((d.diff.lines || []).find((l) => l.ref === ref) || {}).label;
  const seatText = JSON.stringify(seat.diff), ownText = JSON.stringify(own.diff);
  ok(!w.error && !p.error && label(own, "decision|d-7701") === "The secret plan" && label(own, "secret/design.md") === "Only design"
    && !/secret plan|d-7701|Only design|secret\/design/.test(seatText) && /a card you cannot read/.test(seatText) && /a doc you cannot read/.test(seatText)
    && label(seat, "open.md") === "An open doc" && label(seat, "secret/eng.md") === "Only engineering" && !/"roles"|internal-eng|"owner"/.test(seatText + ownText),
    `F2 · the diff for a seat (internal-eng): the owner-only card and the design-only doc are "a card/doc you cannot read", the open doc and the engineering doc keep their titles; the owner sees every name; no role list on the wire`, seatText);
}

// ================= F. the doors =================
{
  const { callTool } = await imp("src/mcp.js");
  const { default: handler } = await imp("src/index.js");
  const hdb = freshDb();
  const HD = d1(hdb);
  const hbrain = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) };
  const henv = asOrg({ DB: HD, BRAIN: hbrain });
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const RO = sha(sha("owner-key") + ":agent-r-read-only:v1");
  const call = async (method, path, key, body, form, accept = "application/json") => {
    const headers = { accept, ...(key ? { authorization: `Bearer ${key}` } : {}) };
    let payload;
    if (body) { if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(body).toString(); } else { headers["content-type"] = "application/json"; payload = JSON.stringify(body); } }
    const r = await handler.fetch(new Request(`https://org.test${path}`, { method, headers, body: payload }), henv, ctx);
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
    return { status: r.status, j, t, cc: r.headers.get("cache-control"), location: r.headers.get("location") };
  };
  await writeKnowledge(OWNER, { project: "alpha", ops: SEED }, asOrg({ DB: HD, [Symbol.for("sharingu.project")]: "alpha", BRAIN: brain() }));
  const empty = await call("GET", "/versions?project=alpha", "seat-key"), emptyPage = await call("GET", "/versions?project=alpha", "seat-key", null, false, "text/html");
  ok(empty.status === 200 && empty.j.empty === "no_versions" && /publish_version/.test(empty.j.note) && emptyPage.status === 200 && /data-state="empty"/.test(emptyPage.t)
    && /<div class="p-empty" data-state="empty" title="[^"]*publish_version[^"]*">/.test(emptyPage.t) && /Not versioned yet/.test(emptyPage.t),   // sprint 3 L3: the read's note rides the empty's title
    `no version yet: GET /versions ${empty.status} empty ${empty.j && empty.j.empty}, "${empty.j && empty.j.note}"; the page draws EMPTY naming publish_version and the chip "Not versioned yet"`);
  const hSeat = await call("POST", "/versions/publish", "seat-key", { project: "alpha", title: "x" }), hAnon = await call("POST", "/versions/publish", null, { project: "alpha", title: "x" });
  const hRo = await call("POST", "/versions/publish", RO, { project: "alpha", title: "x" }), hRoR = await call("POST", "/versions/restore", RO, { project: "alpha", v: "1" });
  const hSeatR = await call("POST", "/versions/restore", "seat-key", { project: "alpha", v: "1" });
  ok(hSeat.status === 403 && hSeat.j.error === "owner_only" && hAnon.status === 401 && hRo.status === 403 && hRo.j.error === "read_only_credential" && hRoR.status === 403 && hRoR.j.error === "read_only_credential"
    && hSeatR.status === 403 && hSeatR.j.error === "owner_only" && /Only Owen Park can restore/.test(hSeatR.j.note) && count(hdb, "SELECT COUNT(*) AS n FROM k_versions") === 0,
    `refusals through the handler: a seat ${hSeat.status} ${hSeat.j && hSeat.j.error} (restore ${hSeatR.status}), no key ${hAnon.status}, the read-only key ${hRo.status}/${hRoR.status} ${hRo.j && hRo.j.error}; nothing written`);
  const hp1 = await call("POST", "/versions/publish", "owner-key", { project: "alpha", title: "First" });
  await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "goal", op: "upsert", data: { id: "file-it", title: "Filed" } }] }, asOrg({ DB: HD, [Symbol.for("sharingu.project")]: "alpha", BRAIN: brain() }));
  const mp2 = await callTool("publish_version", { project: "alpha", title: "Second" }, OWNER, henv, new URL("https://org.test/mcp"), [{ name: "publish_version", owner: true, write: true, project: true }]);
  ok(hp1.status === 200 && hp1.j.version.n === 1 && hp1.j.project === "alpha" && !mp2.error && mp2.version.n === 2, `POST /versions/publish (the owner) -> v${hp1.j && hp1.j.version && hp1.j.version.n}; the publish_version tool -> v${mp2.version && mp2.version.n}`, show([hp1.j, mp2]));
  const gj = await call("GET", "/versions?project=alpha", "seat-key"), g1 = await call("GET", "/versions/1?project=alpha", "seat-key"), g9 = await call("GET", "/versions/9?project=alpha", "seat-key");
  const gh = await call("GET", "/versions?head=1&project=alpha", "seat-key");
  ok(gj.status === 200 && gj.j.current.n === 2 && gj.j.diff.from === 1 && gj.j.diff.to === 2 && gj.j.diff.lines.some((l) => l.ref === "file-it" && l.label === "Filed") && JSON.stringify(gj.j.counts) === '{"all":2,"published":2,"restored":0}'
    && g1.status === 200 && g1.j.viewing.n === 1 && g1.j.diff.from === null && g1.j.diff.to === 1 && g9.status === 404 && g9.j.error === "unknown_version" && gh.status === 200 && gh.cc === "no-store" && gh.j.n === 2 && gh.j.at === gj.j.current.at,
    `GET /versions: current v2, its changes from v1 name file-it; /versions/1 views v1 (nothing before it); /versions/9 ${g9.status}; ?head=1 no-store {n: ${gh.j && gh.j.n}}`);
  const mv = await callTool("versions", { project: "alpha" }, SEAT, henv, new URL("https://org.test/mcp"), [{ name: "versions", owner: false, project: true }]);
  ok(JSON.stringify(mv) === JSON.stringify(gj.j), "the versions tool answers what GET /versions answers");
  const page1 = await call("GET", "/versions/1?project=alpha", "seat-key", null, false, "text/html"), pageO = await call("GET", "/versions/1?project=alpha", "owner-key", null, false, "text/html");
  ok(page1.status === 200 && new Set(page1.t.match(/data-region="(not-current-banner|diff|timeline)"/g) || []).size === 3 && /data-state="behind"/.test(page1.t)
    && /<button[^>]*disabled[^>]*data-button="restore"/.test(page1.t) && /<form method="POST" action="\/versions\/restore"><input type="hidden" name="v" value="1"><input type="hidden" name="project" value="alpha">/.test(pageO.t)
    && /<meta name="sharingu-served" content="[^"]+" data-scope="alpha">/.test(page1.t) && />See v2</.test(page1.t) && !/data-button="version-chip"/.test(page1.t),
    "the page viewing v1: three regions, BEHIND naming v2 (See v2; D6a: no version chip on Versions' own bar), Restore disabled for a seat and a form naming v and the project for the owner, the page stamped with the head");
  const hr = await call("POST", "/versions/restore", "owner-key", { v: "1", project: "alpha" }, true);
  const goal = hdb.prepare("SELECT title FROM k_goals WHERE project='alpha' AND id='file-it'").get();
  ok(hr.status === 303 && hr.location === "/versions?project=alpha&restored=3" && goal.title === "file it", `the owner's form press: 303 to ${hr.location}; file-it's title is v1's again ("${goal.title}")`);
  const mr = await callTool("restore_version", { project: "alpha", v: "2" }, OWNER, henv, new URL("https://org.test/mcp"), [{ name: "restore_version", owner: true, write: true, project: true }]);
  const mrSeat = await callTool("restore_version", { project: "alpha", v: "2" }, SEAT, henv, new URL("https://org.test/mcp"), [{ name: "restore_version", owner: true, write: true, project: true }]);
  const flash = await call("GET", "/versions?project=alpha&restored=4", "owner-key", null, false, "text/html");
  ok(!mr.error && mr.version.n === 4 && mr.restored === 2 && mrSeat.error === "owner_only" && hdb.prepare("SELECT title FROM k_goals WHERE project='alpha' AND id='file-it'").get().title === "Filed"
    && /Restored as v4/.test(flash.t) && /restored from v2/.test(flash.t),
    `the restore_version tool: v2 back as v${mr.version && mr.version.n} (a seat: ${mrSeat.error}); the page's flash and the timeline say restored from v2`);
}

console.log(`${fails ? "✗" : "✓"} versions selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
