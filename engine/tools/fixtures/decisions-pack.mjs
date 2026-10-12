// tools/fixtures/decisions-pack.mjs — a project's questions and their live overlay for the Decisions selftests
// (tools/wire-selftest.mjs, tools/check-vocab-selftest.mjs, tools/decide-form-selftest.mjs, tools/ruling-link-selftest.mjs,
// tools/d1-hot-selftest.mjs, tools/fixtures/home-d1.mjs). Not a hand-typed render and not a hand-typed D1 answer: the rows
// below are seeded into k_questions + k_options of a REAL SQLite built from boot.sql (node:sqlite), as preview then file
// files them (seedQuestions), and every caller hands that database to the REAL src/decisions.js readers.
//
// The rows (the UI-B2 brief, item 15): one open blocker with three options, one decided and pending in code, one
// superseded, and one counter filed on the open blocker. Ids are shapes (Q + 8 hex), never a real ruling.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { asOrg } from "./org.mjs";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
export const OPEN_QID = "QA0000001", RULED_QID = "QB0000002", GONE_QID = "QC0000003", HIGH_QID = "QD0000004";
export const ROWS = [
  { qid: OPEN_QID, question: "How does a counter carry its reasoning when nothing is typed?", status: "open", updated: "2026-09-26",
    severity: "blocker", area: "ia", why: "A counter with no reasoning records disagreement but not why, and why is the part a later reader acts on.",
    options: [{ what: "A bare counter", tradeoff: "trivial, but it is a thumbs-down" }, { what: "Pick from filed reasons", tradeoff: "structured, but an unforeseen objection cannot be said" },
      { what: "An agent drafts it, you approve", tradeoff: "full reasoning, one round trip per disagreement" }],
    blocks: [RULED_QID], whoOwes: "owner", implStatus: null, supersededBy: null },
  { qid: HIGH_QID, question: "Does the blessing gate still have a reason to exist?", status: "open", updated: "2026-09-25",
    severity: "high", area: "security", why: "Its justification was removed by a later ruling.", options: [{ what: "Keep it", tradeoff: "one more step" }, { what: "Drop it", tradeoff: "one less guard" }],
    blocks: [], whoOwes: "owner", implStatus: null, supersededBy: null },
  { qid: RULED_QID, question: "One org, one worker, many workspaces?", status: "decided", choice: "a", label: "One worker per org; workspaces are a soft scope.", updated: "2026-09-18",
    severity: "high", area: "architecture", why: "The estate had one worker per project.", options: [{ what: "One worker per org", tradeoff: "one deploy" }, { what: "One per project", tradeoff: "many deploys" }],
    blocks: [], whoOwes: "build", implStatus: "pending", supersededBy: null },
  { qid: GONE_QID, question: "Can a person move between orgs?", status: "superseded", updated: "2026-09-10", severity: "normal", area: "org-and-r",
    why: "Replaced by a later ruling.", options: [], blocks: [], whoOwes: null, implStatus: null, supersededBy: RULED_QID },
];
// one undecided counter on the open blocker, one answer (provisional) on it, and the reader's round filing
export const OVERLAY = [
  { ref: "q/" + OPEN_QID, id: "T-20260927-001", kind: "counter", what: "A bare counter loses the why; file it as a filing instead", why: "the record must be reasoned about later",
    route: "owner", submitter: "p-amir", by_name: "Amir", created_at: "2026-09-27T08:00:00.000Z", eval: 0 },
  { ref: "q/" + OPEN_QID, id: "T-20260927-002", kind: "answer", what: OPEN_QID + " — B: Pick from filed reasons", why: "provisional answer to " + OPEN_QID + " via /respond (response r1)",
    route: "auto", submitter: "p-c", by_name: "Rae Kim", created_at: "2026-09-27T09:00:00.000Z", eval: 0 },
  { ref: "q/" + OPEN_QID, id: "T-20260927-003", kind: "round", what: OPEN_QID + " added to the round", why: "added to the round",
    route: "owner", submitter: "p-c", by_name: "Rae Kim", created_at: "2026-09-27T09:05:00.000Z", eval: 0 },
];

// seedQuestions(sqlite, project, rows, by) — the rows above into k_questions + k_options, as preview then file files them:
// `updated` is the ruling's time for a ruled row (decided_at) and the last write's otherwise. The project and the person
// `by` must exist (the foreign keys hold).
export function seedQuestions(sqlite, project = "alpha", rows = ROWS, by = "p-o") {
  const Q = sqlite.prepare("INSERT INTO k_questions (project, qid, question, why, area, severity, status, choice, label, decided_at, affects, blocks, who_owes, waiting_on, impl_status, superseded_by, created_by, created_at, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const O = sqlite.prepare("INSERT INTO k_options (project, qid, idx, what, tradeoff, created_by, created_at, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const r of rows) {
    const at = r.updated || "2026-09-01", n = (v) => (v === undefined ? null : v);
    Q.run(project, r.qid, r.question, n(r.why), n(r.area), n(r.severity), r.status || "open", n(r.choice), n(r.label), r.status && r.status !== "open" ? at : null,
      JSON.stringify(r.affects || []), JSON.stringify(r.blocks || []), n(r.whoOwes), n(r.waitingOn), n(r.implStatus),
      Array.isArray(r.supersededBy) ? r.supersededBy.join(",") : n(r.supersededBy), by, at, by, at);
    (r.options || []).forEach((o, i) => O.run(project, r.qid, i, o.what, n(o.tradeoff), by, at, by, at));
  }
}

// the statements the fixture's DB answers as a lost D1 call when asked to
const IS_OVERLAY = (sql) => /FROM transmission_refs r CROSS JOIN transmission t/.test(sql);
const IS_QUESTIONS = (sql) => /FROM k_questions t/.test(sql);

// d1(sqlite, { fails }) -> { DB, statements }: a D1-shaped binding over node:sqlite — prepare(sql).bind(...).first() / all()
// / run(), and batch(list) as ONE transaction (as D1's is) whose SELECTs answer their rows (the knowledge write door reads
// in a batch). `statements` lists every SQL string run; fails(sql) -> true makes that statement fail like a lost D1 call.
export function d1(sqlite, o = {}) {
  const statements = [];
  const exec = (sql, args) => {
    statements.push(sql);
    if (o.fails && o.fails(sql)) throw new Error("D1_ERROR: network connection lost");
    return /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: sqlite.prepare(sql).all(...args), meta: { changes: 0 } }
      : { results: [], meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } };
  };
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null,
    all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  const DB = { prepare: (sql) => stmt(sql),
    batch: async (list) => { sqlite.exec("BEGIN"); try { const out = list.map((st) => st._exec()); sqlite.exec("COMMIT"); return out; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
  return { DB, statements };
}

// fixtureEnv({ empty, rows, overlay, overlayThrows, rowsThrow }) -> { BRAIN, DB, statements, sqlite }: an env the real
// readers accept. The org has ONE active project, alpha (so a read with no scope reads alpha, project.js projectOf), the
// owner Owen Park (p-o) and the people the overlay names; the rows are alpha's questions (none with `empty`), the overlay
// rows are real filings in alpha with their transmission_refs. `statements` lists every SQL string run; overlayThrows /
// rowsThrow make the overlay / the questions read fail like a lost D1 call.
export function fixtureEnv(o = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(BOOT);
  const at = "2026-09-01T00:00:00.000Z";
  const P = sqlite.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)");
  P.run("p-o", "Owen Park", "owen@northwind.test", "owner", "h-o", at);
  P.run("p-c", "Rae Kim", "rae@northwind.test", "internal-eng", "h-c", at);
  P.run("p-amir", "Amir", "amir@northwind.test", "product", "h-amir", at);
  sqlite.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${at}')`);
  if (!o.empty) seedQuestions(sqlite, "alpha", o.rows || ROWS);
  const X = sqlite.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,decision,eval,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  const R = sqlite.prepare("INSERT INTO transmission_refs (tid, ref) VALUES (?, ?)");
  for (const r of o.overlay || OVERLAY) { X.run(r.id, r.submitter, "leader", r.kind, r.what, r.why, "decisions", r.route, "routed", null, r.eval ? 1 : 0, "alpha", r.created_at); R.run(r.id, r.ref); }
  const { DB, statements } = d1(sqlite, { fails: (sql) => (o.overlayThrows && IS_OVERLAY(sql)) || (o.rowsThrow && IS_QUESTIONS(sql)) });
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) };
  return asOrg({ BRAIN, DB, statements, sqlite });   // a request signed in to org 1 (src/data.js)
}
