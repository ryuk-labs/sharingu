// tools/knowledge-selftest.mjs — the knowledge core, offline (no network, no worker): src/knowledge/schema.js's rules on
// fixtures (one good and one bad op per kind, the cross-row rules, the merge, the owner's ruling fields), then the write
// door and the store on a REAL SQLite built from boot.sql (node:sqlite, a D1-shaped binding whose batch is one
// transaction, as D1's is): all-or-nothing, the merge at the database, the replay, the seat rule, one ledger row per
// call, a question's options, a node's edges, the counts; and migrate-039.sql applied to a database without it.
// Exit code decides: 0 when every case holds.
//   node tools/knowledge-selftest.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const { KINDS, KNOWLEDGE_KINDS, planKnowledge, keyString, MAX_OPS } = await imp("src/knowledge/schema.js");
const { writeKnowledge } = await imp("src/knowledge/write.js");
const { readKnowledge, listKnowledge } = await imp("src/knowledge/store.js");
const { fileTransmission } = await imp("src/core.js");

let fails = 0, passes = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const show = (v) => JSON.stringify(v).slice(0, 400);
const OWNER = { isOwner: true };
const plan = (ops, stored = {}, o = OWNER) => planKnowledge(ops, stored, o);
const codes = (p) => p.errors.map((e) => e.error);
const mapOf = (kind, rows) => new Map(rows.map((r) => [keyString(kind, r), r]));

// ---- 1. one good and one bad op per kind ----
const MEASURE = { name: "weekly active teams", value: 12, period: "this week", prior: 9, priorPeriod: "last week", source: "the ledger" };
const GTM = { identity: {}, activityKinds: ["post", "reply"], fields: [], activityTemplate: { kinds: [] }, proofRule: "a link", outcomeModel: {} };
const nodesAB = { node: mapOf("node", [{ id: "screen:a", type: "screen", name: "A" }, { id: "screen:b", type: "screen", name: "B" }]) };
const FIX = {
  aim: [{ aim: "Ship the loop", measure: MEASURE }, { aim: "Ship the loop", measure: { name: "x" } }, "bad_field"],
  goal: [{ id: "grow", title: "Grow", dimensions: ["gtm"], weight: 2, due: "2026-12-31" }, { id: "grow", title: "Grow", dimensions: ["sales"] }, "bad_field"],
  question: [{ qid: "Q-price-1", question: "Which price?", options: [{ what: "Low" }, { what: "High", tradeoff: "fewer buyers" }] }, { qid: "Q-price-1", question: "Which price?", status: "maybe", options: [{ what: "a" }, { what: "b" }] }, "bad_field"],
  check: [{ id: "AC.home.01", title: "Home shows the aim", given: "an aim", when: "the page loads", then: "it shows", refs: ["goal:grow"] }, { id: "AC.home.01", given: "no title" }, "missing_field"],
  card: [{ kind: "decision", id: "decision-12", name: "One product", body: "# One product\n" }, { kind: "Decision!", id: "decision-12", name: "x" }, "bad_id"],
  card_kind: [{ key: "decision", label: "Decisions", idPattern: "^decision-\\d+$" }, { key: "decision", label: "Decisions", idPattern: "(" }, "bad_field"],
  node: [{ id: "flow:signup", type: "flow", name: "Sign up", status: "live", data: { steps: [{ actor: "visitor", does: "opens the page" }] } }, { id: "flow:signup", type: "widget", name: "Sign up" }, "bad_field"],
  edge: [{ from: "screen:a", to: "screen:b", kind: "nav", label: "next" }, { from: "screen:a", to: "screen:b", kind: "likes" }, "bad_id"],
  gtm: [{ template: GTM }, { template: { identity: {}, activityKinds: [] } }, "bad_field"],
  doc: [{ path: "start-here.md", title: "Start here", body: "Read this first." }, { path: "../etc/passwd", body: "x" }, "bad_id"],
  // a render needs its screen node (nodesAB below); its body is checked and sanitised here, hashed by the door
  render: [{ screen: "screen:a", state: "default", format: "html", body: "<div>A</div>", width: 390, height: 844 }, { screen: "screen:a", format: "video", body: "x" }, "bad_field"],
  style: [{ id: "app", css: ".a{color:red}" }, { id: "app" }, "missing_field"],
};
ok(KNOWLEDGE_KINDS.every((k) => FIX[k]), `a fixture pair for every kind (${KNOWLEDGE_KINDS.join(", ")})`);
for (const kind of KNOWLEDGE_KINDS) {
  const [good, badData, code] = FIX[kind];
  const stored = kind === "edge" || kind === "render" ? nodesAB : {};
  const g = plan([{ kind, op: "upsert", data: good }], stored);
  ok(g.errors.length === 0 && g.steps.length === 1, `${kind}: a good upsert passes`, show(g.errors));
  const b = plan([{ kind, op: "upsert", data: badData }], stored);
  const e = b.errors[0] || {};
  ok(b.errors.length >= 1 && e.error === code && e.index === 0 && e.kind === kind && typeof e.note === "string" && e.note.length > 10,
    `${kind}: a bad upsert is refused ${code}, with a note`, show(b.errors));
}
ok(codes(plan([{ kind: "goal", op: "upsert", data: { id: "g", title: "G", colour: "red" } }]))[0] === "unknown_field", "an unknown field is refused unknown_field");
ok(codes(plan([{ kind: "planet", op: "upsert", data: {} }]))[0] === "unknown_kind", "an unknown kind is refused unknown_kind");
ok(codes(plan([{ kind: "goal", op: "merge", data: { id: "g" } }]))[0] === "bad_op", "an op other than upsert/remove is refused bad_op");
ok(codes(plan([{ kind: "goal", op: "upsert", data: { id: "Not A Slug", title: "G" } }]))[0] === "bad_id", "a goal id that is not a slug is refused bad_id");
ok(codes(plan([{ kind: "goal", op: "upsert", data: { id: "g" } }]))[0] === "missing_field", "a new goal without a title is refused missing_field");
{
  const e = plan([{ kind: "goal", op: "upsert", data: { id: "ok", title: "Ok" } }, { kind: "goal", op: "upsert", data: { id: "bad", title: 7 } }]).errors;
  ok(e.length === 1 && e[0].index === 1 && e[0].id === "bad" && Object.keys(e[0]).join() === "index,kind,id,error,note", "an error names its op's index, kind and id: {index, kind, id, error, note}", show(e));
}

// ---- 2. the cross-row rules (the batch's end state) ----
const G = (id, parent = null, extra = {}) => ({ kind: "goal", op: "upsert", data: { id, title: id.toUpperCase(), parent, ...extra } });
ok(plan([G("root"), G("a", "root"), G("b", "root")]).errors.length === 0, "goals: one root and its children pass");
ok(codes(plan([G("root"), G("other")])).includes("goal_roots"), "goals: two roots are refused goal_roots");
{
  const stored = { goal: mapOf("goal", [{ id: "root", parent: null, title: "R", dimensions: [] }, { id: "a", parent: "root", title: "A", dimensions: [] }]) };
  ok(codes(plan([G("b")], stored)).includes("goal_roots"), "goals: a second root beside a stored tree is refused goal_roots");
  const cyc = plan([G("a", "b"), G("b", "a")], stored);
  ok(codes(cyc).includes("goal_cycle"), "goals: a cycle is refused goal_cycle", show(cyc.errors));
  ok(codes(plan([G("c", "nope")], stored))[0] === "missing_parent", "goals: a missing parent is refused missing_parent");
  ok(codes(plan([G("c", "d"), G("d", "root")], stored)).length === 0, "goals: a parent filed later in the same batch passes");
  const rm = plan([{ kind: "goal", op: "remove", data: { id: "root" } }], stored);
  ok(codes(rm)[0] === "has_children" && rm.errors[0].index === 0, "goals: removing a goal with children is refused has_children", show(rm.errors));
  ok(plan([{ kind: "goal", op: "remove", data: { id: "a" } }, { kind: "goal", op: "remove", data: { id: "root" } }], stored).errors.length === 0, "goals: a goal removed with its children in the same batch passes");
  ok(codes(plan([G("root", "root")], stored))[0] === "bad_field", "goals: a goal that is its own parent is refused bad_field");
}
const Q = (data) => ({ kind: "question", op: "upsert", data: { qid: "Q1", question: "Which?", ...data } });
ok(codes(plan([Q({ options: [{ what: "only" }] })]))[0] === "too_few_options", "questions: an open question with one option is refused too_few_options");
ok(codes(plan([Q({})]))[0] === "too_few_options", "questions: an open question with no options is refused too_few_options");
ok(codes(plan([Q({ choice: 0, options: [{ what: "a" }, { what: "b" }] })]))[0] === "open_has_choice", "questions: an open question carrying a choice is refused open_has_choice");
ok(codes(plan([Q({ status: "decided", options: [{ what: "a" }, { what: "b" }] })]))[0] === "no_choice", "questions: a ruled question with options and no choice or label is refused no_choice");
ok(plan([Q({ status: "decided", choice: "b", options: [{ what: "a" }, { what: "b" }] })]).errors.length === 0, "questions: a ruled question naming its choice by letter passes");
ok(plan([Q({ status: "decided", label: "ruled in the meeting" })]).errors.length === 0, "questions: a ruling with no menu passes (the kit's exemption)");
ok(codes(plan([Q({ options: Array.from({ length: 27 }, (_, i) => ({ what: "o" + i })) })]))[0] === "bad_field", "questions: more than 26 options are refused bad_field");
const E = (from, to) => ({ kind: "edge", op: "upsert", data: { from, to, kind: "reads" } });
ok(codes(plan([E("screen:a", "table:x")], nodesAB))[0] === "missing_node", "edges: an edge to a missing node is refused missing_node");
ok(plan([{ kind: "node", op: "upsert", data: { id: "table:x", type: "table", name: "X" } }, E("screen:a", "table:x")], nodesAB).errors.length === 0, "edges: an edge to a node filed in the same batch passes");
ok(codes(plan([{ kind: "node", op: "remove", data: { id: "screen:b" } }, E("screen:a", "screen:b")], nodesAB))[0] === "missing_node", "edges: an edge to a node removed in the same batch is refused missing_node");
ok(codes(plan([{ kind: "node", op: "upsert", data: { id: "gap:1", type: "gap", name: "G", status: "live" } }]))[0] === "bad_field", "nodes: a gap's status is open or closed");

// ---- 3. the merge ----
{
  const stored = { goal: mapOf("goal", [{ id: "root", parent: null, title: "Root", dimensions: ["gtm"], weight: 2, target: 10, outcomeMetric: true, owner: "Ada", due: null, note: null, status: null, sort: 1 }]) };
  const p = plan([{ kind: "goal", op: "upsert", data: { id: "root", title: "Root, renamed" } }], stored);
  const r = p.steps[0] && p.steps[0].row;
  ok(p.errors.length === 0 && r.title === "Root, renamed" && r.weight === 2 && r.target === 10 && r.dimensions[0] === "gtm" && r.owner === "Ada" && r.sort === 1,
    "merge: a field sent overwrites, every field left out keeps its stored value", show(r));
  ok(p.steps[0].present.join() === "id,title" && p.steps[0].existed === true, "merge: the step names only the fields sent (the database updates only those)");
  ok(codes(plan([{ kind: "goal", op: "upsert", data: { id: "root", title: null } }], stored))[0] === "bad_field", "merge: a required field sent as null is refused bad_field");
  const two = plan([{ kind: "goal", op: "upsert", data: { id: "root", weight: 5 } }, { kind: "goal", op: "upsert", data: { id: "root", note: "n" } }], stored);
  ok(two.errors.length === 0 && two.steps[1].row.weight === 5 && two.steps[1].row.note === "n", "merge: two ops on one id in a batch apply in order");
  const qs = { question: mapOf("question", [{ qid: "Q1", question: "Which?", status: "open", choice: null, label: null, options: [{ what: "a", tradeoff: null }, { what: "b", tradeoff: null }] }]) };
  const qp = plan([Q({ why: "because" })], qs);
  ok(qp.errors.length === 0 && qp.steps[0].row.options.length === 2 && qp.steps[0].options === false, "merge: a question upsert without options keeps its stored options", show(qp.errors));
  const nm = plan([{ kind: "goal", op: "upsert", data: { id: "fresh", title: "F", parent: "root" } }], stored);
  ok(nm.steps[0] && Array.isArray(nm.steps[0].row.dimensions) && nm.steps[0].row.dimensions.length === 0 && nm.steps[0].row.weight === null, "merge: a new row starts from the defaults (dimensions [], the rest null)");
}

// ---- 4. the owner's ruling fields ----
const MEMBER = { isOwner: false };
ok(plan([Q({ options: [{ what: "a" }, { what: "b" }] })], {}, MEMBER).errors.length === 0, "a member files an open question");
ok(codes(plan([Q({ status: "decided", choice: 0, options: [{ what: "a" }, { what: "b" }] })], {}, MEMBER))[0] === "owner_only", "a member's ruling (status decided, a choice) is refused owner_only");
{
  const ruled = { question: mapOf("question", [{ qid: "Q1", question: "Which?", status: "decided", choice: 0, label: null, options: [{ what: "a" }, { what: "b" }] }]) };
  ok(codes(plan([Q({ why: "edit" })], ruled, MEMBER))[0] === "owner_only", "a member's edit of a ruled question is refused owner_only");
  ok(codes(plan([{ kind: "question", op: "remove", data: { qid: "Q1" } }], ruled, MEMBER))[0] === "owner_only", "a member's remove of a ruled question is refused owner_only");
  ok(plan([{ kind: "question", op: "remove", data: { qid: "Q1" } }], ruled, OWNER).errors.length === 0, "the owner removes a ruled question");
}

// ---- 4b. who may touch a role-limited item (a doc, a card, a card kind): the stored list binds a non-owner, a card's kind's
// list too; roleVisibility is the owner's to set; a capsule doc is the owner's to write ----
{
  const LEADER = { isOwner: false, role: "leader" };
  const D = (path, extra = {}) => ({ kind: "doc", op: "upsert", data: { path, ...extra } });
  const C = (kind, id, extra = {}) => ({ kind: "card", op: "upsert", data: { kind, id, ...extra } });
  const stored = {
    doc: mapOf("doc", [{ path: "own.md", title: null, body: "S", roleVisibility: ["owner"] }, { path: "lead.md", title: null, body: "L", roleVisibility: ["leader"] },
      { path: "open.md", title: null, body: "O", roleVisibility: null }]),
    card_kind: mapOf("card_kind", [{ key: "secret", label: "Secret", idPattern: null, roleVisibility: ["owner"] }, { key: "open", label: "Open", idPattern: null, roleVisibility: null }]),
    card: mapOf("card", [{ kind: "secret", id: "c-1", name: "C1", status: null, body: "SC", roleVisibility: null }, { kind: "open", id: "h-1", name: "H1", status: null, body: "H", roleVisibility: ["owner"] },
      { kind: "open", id: "o-1", name: "O1", status: null, body: "O", roleVisibility: null }]),
  };
  const as = (ops, who = LEADER) => plan(ops, stored, who);
  const refused = (ops, code, who) => { const p = as(ops, who); return p.errors.length === 1 && p.errors[0].error === code && p.errors[0].index === 0 && p.steps.length === 0; };
  ok(refused([D("own.md", { roleVisibility: null })], "forbidden"), "F1 member: revealing an owner-only doc (roleVisibility null) is refused forbidden");
  ok(refused([D("own.md", { body: "planted" })], "forbidden"), "F1 member: overwriting an owner-only doc is refused forbidden");
  ok(refused([{ kind: "doc", op: "remove", data: { path: "own.md" } }], "forbidden"), "F1 member: removing an owner-only doc is refused forbidden");
  {
    const e = as([D("own.md", { body: "x" })]).errors[0] || {};
    ok(Object.keys(e).join() === "index,kind,id,error,note" && e.kind === "doc" && e.id === "own.md" && /ask the owner/.test(e.note) && !/owner-only|\["owner"\]/.test(e.note),
      "F1 member: the refusal is {index, kind, id, error, note}, the note actionable and naming no list", show(e));
  }
  ok(refused([D("capsules/owner.md", { body: "# planted" })], "owner_only") && refused([D("capsules/leader.md", { body: "# mine" })], "owner_only")
    && refused([{ kind: "doc", op: "remove", data: { path: "capsules/leader.md" } }], "owner_only"), "F1 member: writing or removing any capsule doc is refused owner_only");
  ok(refused([D("lead.md", { roleVisibility: null })], "owner_only") && refused([D("open.md", { roleVisibility: ["leader"] })], "owner_only")
    && refused([D("new.md", { body: "x", roleVisibility: ["owner"] })], "owner_only") && refused([D("new.md", { body: "x", roleVisibility: ["leader"] })], "owner_only"),
    "F1 member: widening, narrowing or setting a doc's roleVisibility (a new doc's too) is refused owner_only");
  ok(as([D("open.md", { body: "edit" }), D("lead.md", { body: "edit" }), D("lead.md", { roleVisibility: ["leader", "leader"] }), D("new.md", { body: "x" }), D("new2.md", { body: "y", roleVisibility: [] })]).errors.length === 0,
    "F1 member: edits an open doc and a doc open to their role (its list sent back unchanged passes), files a new open doc");
  ok(refused([D("lead.md", { body: "x" })], "forbidden", { isOwner: false }), "F1 a non-owner with no role reads only open items (fail closed)");
  ok(refused([C("secret", "c-1", { body: "planted" })], "forbidden") && refused([C("secret", "c-9", { name: "N", body: "x" })], "forbidden")
    && refused([{ kind: "card", op: "remove", data: { kind: "secret", id: "c-1" } }], "forbidden"), "F1 member: a card of a kind their role may not read (its own list open, or new) is refused forbidden");
  ok(refused([C("open", "h-1", { roleVisibility: null })], "forbidden") && refused([C("open", "h-1", { body: "x" })], "forbidden"), "F1 member: an owner-only card in an open kind is refused forbidden");
  ok(refused([{ kind: "card_kind", op: "upsert", data: { key: "secret", label: "S", roleVisibility: null } }], "forbidden") && refused([{ kind: "card_kind", op: "remove", data: { key: "secret" } }], "forbidden"),
    "F1 member: revealing or removing an owner-only card kind is refused forbidden");
  ok(refused([C("open", "o-1", { roleVisibility: ["owner"] })], "owner_only") && refused([{ kind: "card_kind", op: "upsert", data: { key: "fresh", label: "F", roleVisibility: ["leader"] } }], "owner_only"),
    "F1 member: setting a card's or a card kind's roleVisibility is refused owner_only");
  ok(as([C("open", "o-1", { body: "edit" }), C("open", "o-2", { name: "O2", body: "x" }), { kind: "card_kind", op: "upsert", data: { key: "fresh", label: "Fresh" } }, C("fresh", "f-1", { name: "F1" })]).errors.length === 0,
    "F1 member: edits and files open cards, and a new open kind with a card in the same batch");
  ok(as([D("own.md", { roleVisibility: null }), D("capsules/owner.md", { body: "# o" }), C("secret", "c-1", { body: "x", roleVisibility: ["leader"] }),
    { kind: "card_kind", op: "remove", data: { key: "secret" } }], OWNER).errors.length === 0, "F1 the owner writes all of it (lists, capsules, owner-only items)");
}

// ---- 5. the door and the store on a real SQLite (boot.sql) ----
function d1(db) {
  const exec = (sql, args) => (/^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: { changes: 0 } } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } });
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } },
  };
}
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const M039 = readFileSync(join(ENGINE, "migrate-039.sql"), "utf8");
const M046 = readFileSync(join(ENGINE, "migrate-046.sql"), "utf8");
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
db.exec(BOOT);
db.exec(M039);   // a replay over boot.sql: a no-op, never an error
const T0 = "2026-09-30T00:00:00.000Z";
const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)");
P.run("p-owner", "Olive", "olive@example.test", "owner", "h1", T0);
P.run("p-member", "Mo", "mo@example.test", "leader", "h2", T0);
P.run("p-out", "Oz", "oz@example.test", "leader", "h3", T0);
db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}'),('beta','Beta',1,'${T0}')`);
db.exec(`INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-member','alpha','member','${T0}'),('p-out','beta','member','${T0}')`);
// a render's or a style's body is put in R2 (src/knowledge/write.js putBodies): kept in memory here
const blobs = new Map();
const brain = () => ({ get: async (k) => (blobs.has(k) ? { text: async () => blobs.get(k), arrayBuffer: async () => new TextEncoder().encode(blobs.get(k)).buffer } : null),
  list: async () => ({ objects: [], truncated: false }), head: async () => null, put: async (k, v) => { blobs.set(k, typeof v === "string" ? v : new TextDecoder().decode(v)); } });
const envOf = (ws = "alpha") => (asOrg({ DB: d1(db), [Symbol.for("sharingu.project")]: ws, BRAIN: brain() }));
const owner = { id: "p-owner", name: "Olive", role: "owner" }, member = { id: "p-member", name: "Mo", role: "leader" }, outsider = { id: "p-out", name: "Oz", role: "leader" };
const count = (sql) => Number(db.prepare(sql).get().n);
const ledger = () => count("SELECT COUNT(*) AS n FROM transmission WHERE kind = 'knowledge'");

const w1 = await writeKnowledge(owner, { project: "alpha", clientRef: "first", ops: [
  { kind: "aim", op: "upsert", data: { aim: "Ship the loop", measure: MEASURE } },
  G("root", null, { weight: 3, dimensions: ["code"] }), G("a", "root"), G("b", "root"),
] }, envOf(), { via: "mcp" });
ok(!w1.error && w1.project === "alpha" && w1.written === 4 && w1.removed === 0 && w1.byKind.goal === 3 && w1.byKind.aim === 1 && /^T-\d{8}-\d{3}$/.test(w1.ledger), "door: the owner writes an aim and three goals", show(w1));
const tx = db.prepare("SELECT * FROM transmission WHERE id = ?").get(w1.ledger) || {};
ok(tx.kind === "knowledge" && tx.lane === "leader" && tx.route === "auto" && tx.project === "alpha" && tx.submitter === "p-owner" && tx.via === "mcp" && tx.client_ref === "first" && tx.what === "1 aim, 3 goals written" && /goal:root/.test(tx.touches || ""),
  "door: one ledger row, lane leader, kind knowledge, routed auto, attributed, with its summary and ids", show(tx));
const goals = await readKnowledge(envOf(), { kind: "goal" });
ok(goals.project === "alpha" && goals.items.map((g) => g.id).join() === "a,b,root" && goals.next === null && goals.items[2].weight === 3 && goals.items[2].createdBy === "p-owner", "store: the goals read back in key order, decoded", show(goals));
const aim = await readKnowledge(envOf(), { kind: "aim" });
ok(aim.items.length === 1 && aim.items[0].aim === "Ship the loop" && aim.items[0].measure.value === 12, "store: the aim reads back with its measure");
const one = await readKnowledge(envOf(), { kind: "goal", id: "a" });
ok(one.item && one.item.parent === "root" && one.item.title === "A", "store: one goal by id");
ok((await readKnowledge(envOf(), { kind: "goal", id: "zzz" })).error === "not_found", "store: an unknown id is not_found");
ok((await readKnowledge(envOf(), { kind: "planet" })).error === "unknown_kind", "store: an unknown kind is unknown_kind");
ok((await readKnowledge(envOf("beta"), { kind: "goal" })).items.length === 0, "store: another project reads none of it");
const pg1 = await listKnowledge(envOf(), "alpha", "goal", { limit: 2 });
const pg2 = await listKnowledge(envOf(), "alpha", "goal", { limit: 2, cursor: pg1.next });
ok(pg1.items.length === 2 && pg1.next === "b" && pg2.items.map((g) => g.id).join() === "root" && pg2.next === null, "store: the cursor pages in key order");
ok((await listKnowledge(envOf(), "alpha", "goal", { q: "ROO" })).items.map((g) => g.id).join() === "root", "store: q finds a substring in any case");

const w2 = await writeKnowledge(owner, { project: "alpha", ops: [{ kind: "goal", op: "upsert", data: { id: "root", title: "Root, renamed" } }] }, envOf());
const root = db.prepare("SELECT * FROM k_goals WHERE project='alpha' AND id='root'").get();
ok(!w2.error && root.title === "Root, renamed" && root.weight === 3 && root.dimensions === '["code"]' && root.created_at !== root.updated_at && root.created_by === "p-owner",
  "door: an upsert of one field changes only that field at the database", show(root));

const before = [count("SELECT COUNT(*) AS n FROM k_goals"), ledger()];
const bad = await writeKnowledge(owner, { project: "alpha", ops: [G("c", "root"), G("d", "nope")] }, envOf());
ok(bad.error === "invalid_ops" && bad.errors.length === 1 && bad.errors[0].index === 1 && bad.errors[0].error === "missing_parent" && count("SELECT COUNT(*) AS n FROM k_goals") === before[0] && ledger() === before[1],
  "door: a batch with one bad op writes nothing (no goal, no ledger row)", show(bad));
const W1_OPS = [{ kind: "aim", op: "upsert", data: { aim: "Ship the loop", measure: MEASURE } }, G("root", null, { weight: 3, dimensions: ["code"] }), G("a", "root"), G("b", "root")];
const replay = await writeKnowledge(owner, { project: "alpha", clientRef: "first", ops: W1_OPS }, envOf());
ok(replay.replay === true && replay.ledger === w1.ledger && ledger() === before[1], "door: the same clientRef with the same ops again is a replay, nothing written", show(replay));
// G2 item 7: the same clientRef with OTHER ops is refused saying so, never a silent replay
const other = await writeKnowledge(owner, { project: "alpha", clientRef: "first", ops: [G("zz", "root")] }, envOf());
ok(other.error === "client_ref_taken" && other.filed === w1.ledger && ledger() === before[1] && !db.prepare("SELECT 1 FROM k_goals WHERE id='zz'").get(), "door: the same clientRef with other ops is refused client_ref_taken, nothing written", show(other));
// D1b item 4: the seatless owner of a two-project org names the project (an unnamed write is refused project_required)
const note = await fileTransmission(owner, { lane: "leader", kind: "note", what: "a note", why: "why", clientRef: "taken", project: "alpha" }, envOf());
ok(!note.error, "a plain note files (the clientRef below is now taken)", show(note));
ok((await writeKnowledge(owner, { project: "alpha", clientRef: "taken", ops: [G("zz", "root")] }, envOf())).error === "client_ref_taken", "door: a clientRef that names another filing is refused client_ref_taken");
// migrate-069 (sprint 6, 6.6): (submitter, client_ref) is UNIQUE — the index refuses a second row; a filing that races past the
// replay lookup (the lookup blinded here, as a concurrent retry would see it) answers the replay, never a 500 and never a second row
{
  const { fileTransmissionsBatch } = await imp("src/core.js");
  let dupErr = null;
  try { db.prepare("INSERT INTO transmission (id, submitter, lane, route, status, client_ref, created_at, org) VALUES ('T-20260930-990', 'p-owner', 'leader', 'auto', 'routed', 'taken', ?, 1)").run(T0); } catch (e) { dupErr = e; }
  ok(dupErr && /UNIQUE/.test(String(dupErr)) && /client_ref/.test(String(dupErr)), "migrate-069: a second row under one person's clientRef is refused by the index itself", String(dupErr));
  ok(!db.prepare("SELECT 1 FROM transmission WHERE client_ref = 'taken' AND submitter = 'p-member'").get() && !(await fileTransmission(member, { lane: "leader", kind: "note", what: "m", why: "w", clientRef: "taken", project: "alpha" }, envOf())).error,
    "migrate-069: another person's same clientRef files (the scope is the person, as the lookup's)");
  const blind = (inner) => { let left = 1; return { ...inner, prepare: (sql) => { const s = inner.prepare(sql); if (left && /client_ref (=|IN)/.test(sql)) { left--; return { ...s, bind: (...a) => ({ ...s.bind(...a), first: async () => null, all: async () => ({ results: [] }) }) }; } return s; } }; };
  const racing = () => asOrg({ DB: blind(d1(db)), [Symbol.for("sharingu.project")]: "alpha", BRAIN: brain() });
  const n0 = count("SELECT COUNT(*) AS n FROM transmission");
  const settle = async (p) => { try { return await p; } catch (e) { return { thrown: String(e).slice(0, 160) }; } };
  const r1 = await settle(fileTransmission(owner, { lane: "leader", kind: "note", what: "a note", why: "why", clientRef: "taken", project: "alpha" }, racing()));
  const r2 = await settle(fileTransmission(owner, { lane: "leader", kind: "note", what: "other", why: "why", clientRef: "taken", project: "alpha" }, racing()));
  const rb = await settle(fileTransmissionsBatch(owner, [{ lane: "leader", kind: "note", what: "a note", why: "why", clientRef: "taken", project: "alpha" }], racing()));
  ok(r1.duplicate === true && r1.id === note.id && r2.error === "client_ref_taken" && Array.isArray(rb) && rb[0] && rb[0].id === note.id && rb[0].duplicate === true && count("SELECT COUNT(*) AS n FROM transmission") === n0,
    "migrate-069: a filing racing past the lookup answers the replay (the same content), client_ref_taken (other content), the batch the same; no row written", show([r1, r2, rb]));
}
ok((await fileTransmission(member, { lane: "leader", kind: " Knowledge ", what: "x", why: "y", touches: ["goal:a"] }, envOf())).error === "reserved_kind", "door: kind knowledge on the plain filing door is refused reserved_kind");

// the seat rule
const envOne = () => (asOrg({ DB: d1(db2), [Symbol.for("sharingu.project")]: null, BRAIN: brain() }));
const db2 = new DatabaseSync(":memory:");
db2.exec("PRAGMA foreign_keys = ON"); db2.exec(BOOT);
db2.exec(`INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p-owner','Olive','owner','h1',1,'${T0}',1),('p-out','Oz','leader','h3',1,'${T0}',1)`);
db2.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('solo','Solo',1,'${T0}')`);
const lone = await writeKnowledge(outsider, { ops: [G("root")] }, envOne());
ok(lone.error === "project_forbidden" && lone.project === "solo" && Number(db2.prepare("SELECT COUNT(*) AS n FROM k_goals").get().n) === 0,
  "seats: a seatless person in a single-project org is refused project_forbidden (the door would stamp them in)", show(lone));
ok(!(await writeKnowledge(owner, { ops: [G("root")] }, envOne())).error, "seats: the owner writes the single project without naming it");
ok((await writeKnowledge(outsider, { project: "alpha", ops: [G("x")] }, envOf())).error === "project_forbidden", "seats: a person with no seat on the named project is refused project_forbidden");
ok((await writeKnowledge(owner, { ops: [G("x")] }, envOf())).error === "project_required", "seats: the owner, seated nowhere in a two-project org, names the project (project_required)");
const wm = await writeKnowledge(member, { ops: [G("c", "root")] }, envOf(), { via: "http" });
ok(!wm.error && wm.project === "alpha" && db.prepare("SELECT via, submitter FROM transmission WHERE id = ?").get(wm.ledger).via === "http", "seats: a seated member writes their project (one seat, no project named)", show(wm));
ok((await writeKnowledge(member, { ops: [Q({ status: "decided", choice: 0, options: [{ what: "a" }, { what: "b" }] })] }, envOf())).error === "invalid_ops", "seats: a member's ruling is refused (invalid_ops, owner_only)");
ok((await writeKnowledge(owner, { project: "alpha", ops: [] }, envOf())).error === "ops_required", "door: no ops is ops_required");
ok((await writeKnowledge(owner, { project: "alpha", ops: Array.from({ length: MAX_OPS + 1 }, (_, i) => G("g" + i, "root")) }, envOf())).error === "too_many_ops", `door: more than ${MAX_OPS} ops is too_many_ops`);

// options, nodes and edges, removal, counts
const wq = await writeKnowledge(owner, { project: "alpha", ops: [Q({ options: [{ what: "Low", tradeoff: "thin margin" }, { what: "Mid" }, { what: "High" }] })] }, envOf());
const q1 = await readKnowledge(envOf(), { kind: "question", id: "Q1" });
ok(!wq.error && q1.item && q1.item.status === "open" && q1.item.options.map((o) => o.what).join() === "Low,Mid,High" && q1.item.options[0].tradeoff === "thin margin", "question: its options land in order and read back on the question", show(q1));
await writeKnowledge(owner, { project: "alpha", ops: [Q({ options: [{ what: "Yes" }, { what: "No" }] })] }, envOf());
ok((await readKnowledge(envOf(), { kind: "question", id: "Q1" })).item.options.map((o) => o.what).join() === "Yes,No" && count("SELECT COUNT(*) AS n FROM k_options") === 2, "question: options sent again replace the old ones");
const wn = await writeKnowledge(owner, { project: "alpha", ops: [
  { kind: "node", op: "upsert", data: { id: "screen:a", type: "screen", name: "A" } }, { kind: "node", op: "upsert", data: { id: "screen:b", type: "screen", name: "B" } },
  { kind: "edge", op: "upsert", data: { from: "screen:a", to: "screen:b", kind: "nav" } },
] }, envOf());
ok(!wn.error && wn.byKind.node === 2 && wn.byKind.edge === 1, "model: two nodes and an edge", show(wn));
const e1 = await readKnowledge(envOf(), { kind: "edge", id: "screen:a|screen:b|nav" });
ok(e1.item && e1.item.from === "screen:a" && e1.item.kind === "nav", "model: an edge read by its key (from|to|kind)");
const wr = await writeKnowledge(owner, { project: "alpha", ops: [{ kind: "node", op: "remove", data: { id: "screen:b" } }] }, envOf());
ok(!wr.error && wr.removed === 1 && count("SELECT COUNT(*) AS n FROM k_edges") === 0, "model: removing a node removes its edges", show(wr));
const gone = await writeKnowledge(owner, { project: "alpha", ops: [{ kind: "node", op: "remove", data: { id: "screen:zz" } }] }, envOf());
ok(gone.ledger === null && gone.written === 0 && gone.removed === 0, "door: removing what is not there changes nothing and files no ledger row");
ok(ledger() === 7, `door: one knowledge ledger row per call that changed something (7 here: ${ledger()} filed)`);

// every kind's good fixture lands and reads back through the door (an edge and a render need nodes: they are the model's)
const allOps = KNOWLEDGE_KINDS.filter((k) => k !== "edge" && k !== "render").map((k) => ({ kind: k, op: "upsert", data: FIX[k][0] }));
const wall = await writeKnowledge(owner, { project: "beta", ops: allOps }, envOf("beta"));
ok(!wall.error && wall.written === allOps.length, "door: every kind's good fixture writes in one batch", show(wall));
for (const k of KNOWLEDGE_KINDS.filter((x) => x !== "edge" && x !== "render")) {
  const r = await readKnowledge(envOf("beta"), { kind: k });
  ok(r.items.length === 1, `store: ${k} reads back on its own project`, show(r));
}

// F1 at the door, F2 on the read side: a member (role leader, seated on alpha) against the owner's role-limited items
{
  const seed = await writeKnowledge(owner, { project: "alpha", ops: [
    { kind: "doc", op: "upsert", data: { path: "f1/own.md", body: "OWNER DOC", roleVisibility: ["owner"] } },
    { kind: "card_kind", op: "upsert", data: { key: "secret", label: "Secret", roleVisibility: ["owner"] } },
    { kind: "card", op: "upsert", data: { kind: "secret", id: "c-1", name: "Secret one", body: "OWNER CARD" } },
    { kind: "card_kind", op: "upsert", data: { key: "open", label: "Open" } },
    { kind: "card", op: "upsert", data: { kind: "open", id: "o-1", name: "Open one", body: "open" } },
    { kind: "card", op: "upsert", data: { kind: "open", id: "h-1", name: "Hidden one", body: "OWNER HIDDEN", roleVisibility: ["owner"] } },
  ] }, envOf());
  ok(!seed.error && seed.written === 6, "F1 door: the owner files an owner-only doc, an owner-only kind with a card, an open kind with an open and an owner-only card", show(seed));
  const snap = () => JSON.stringify([db.prepare("SELECT body_md, role_visibility FROM k_docs WHERE project='alpha' AND path='f1/own.md'").get(),
    db.prepare("SELECT kind, id, body_md, role_visibility FROM k_cards WHERE project='alpha' ORDER BY kind, id").all(), db.prepare("SELECT key, role_visibility FROM k_card_kinds WHERE project='alpha' ORDER BY key").all()]);
  const before = [snap(), ledger()];
  const tries = [
    [{ kind: "doc", op: "upsert", data: { path: "f1/own.md", roleVisibility: null } }, "forbidden"],
    [{ kind: "doc", op: "upsert", data: { path: "f1/own.md", body: "planted" } }, "forbidden"],
    [{ kind: "doc", op: "remove", data: { path: "f1/own.md" } }, "forbidden"],
    [{ kind: "card", op: "upsert", data: { kind: "secret", id: "c-9", name: "planted" } }, "forbidden"],   // the kind's list, loaded by the door
    [{ kind: "card", op: "remove", data: { kind: "secret", id: "c-1" } }, "forbidden"],
    [{ kind: "card_kind", op: "upsert", data: { key: "secret", label: "Secret", roleVisibility: null } }, "forbidden"],
    [{ kind: "card", op: "upsert", data: { kind: "open", id: "h-1", body: "planted" } }, "forbidden"],
    [{ kind: "doc", op: "upsert", data: { path: "capsules/owner.md", body: "# planted" } }, "owner_only"],
  ];
  const got = [];
  for (const [op, code] of tries) { const w = await writeKnowledge(member, { project: "alpha", ops: [op] }, envOf()); got.push(w.error === "invalid_ops" && w.errors[0].error === code ? "ok" : show(w)); }
  ok(got.every((g) => g === "ok") && snap() === before[0] && ledger() === before[1], "F1 door: the member's reveal, overwrite and remove of owner-only docs, cards and kinds, and a capsule write, are refused; D1 and the ledger unchanged", got.join(" | "));
  const wm2 = await writeKnowledge(member, { project: "alpha", ops: [{ kind: "card", op: "upsert", data: { kind: "open", id: "o-2", name: "Member card", body: "m" } }] }, envOf());
  ok(!wm2.error && wm2.written === 1, "F1 door: the member files an open card in an open kind", show(wm2));
  // D5: the readers' authority proofs (src/extract.js read and search, the same role rule)
  const { readAnswer, searchAnswer } = await imp("src/extract.js");
  const ids = (r) => (r.items || []).map((c) => `${c.kind}/${c.id}`).join();
  const mc = await readKnowledge(envOf(), { kind: "card" }, member), oc = await readKnowledge(envOf(), { kind: "card" }, owner);
  const mk = await readKnowledge(envOf(), { kind: "card_kind" }, member);
  ok(ids(mc) === "open/o-1,open/o-2" && ids(oc) === "open/h-1,open/o-1,open/o-2,secret/c-1" && (mk.items || []).map((k) => k.key).join() === "open"
    && (await readKnowledge(envOf(), { kind: "card", id: "secret|c-1" }, member)).error === "not_found" && (await readKnowledge(envOf(), { kind: "card_kind", id: "secret" }, member)).error === "not_found"
    && (await readKnowledge(envOf(), { kind: "doc", id: "f1/own.md" }, member)).error === "not_found",
    "F2 store: the store's read hides a card by its own list or its kind's, and a hidden kind, from the member; the owner reads all", `${ids(mc)} · ${ids(oc)} · ${show(mk.items)}`);
  const keysOf = (r) => (r.items || []).map((k) => k.key).join();
  const rk = await readAnswer(envOf(), member, { kind: "card_kind" }), rko = await readAnswer(envOf(), owner, { kind: "card_kind" });
  const rkPage = await readAnswer(envOf(), member, { kind: "card", cardKind: "open" }), rkSecret = await readAnswer(envOf(), member, { kind: "card", cardKind: "secret" });
  ok(keysOf(rk) === "open" && keysOf(rko) === "open,secret" && ids(rkPage) === "open/o-1,open/o-2" && !(rkSecret.items || []).length,
    "F2 read {kind: card_kind | card}: the member's kinds leave out the hidden kind, a kind's page leaves out the hidden card, a hidden kind's page is empty; the owner lists all", `${keysOf(rk)} · ${keysOf(rko)} · ${ids(rkPage)} · ${ids(rkSecret)}`);
  const rcm = [await readAnswer(envOf(), member, { ref: "card/secret/c-1" }), await readAnswer(envOf(), member, { ref: "card/open/h-1" })];
  const rco = await readAnswer(envOf(), owner, { ref: "card/secret/c-1" }), rcOpen = await readAnswer(envOf(), member, { ref: "card/open/o-1" });
  ok(rcm.every((r) => r.error === "not_found" && !JSON.stringify(r).includes("OWNER")) && JSON.stringify(rco.item).includes("OWNER CARD") && rcOpen.item && rcOpen.item.id === "o-1",
    "F2 read {ref: card/…}: a card hidden by its kind or its own list is not_found to the member; the owner reads it; an open card reads", show(rcm));
  const hitsOf = (r) => ((r.groups || []).find((g) => g.kind === "card") || { hits: [] }).hits.map((h) => h.ref).sort().join();
  const fm = await searchAnswer(envOf(), member, { q: "one", kinds: ["card"], limit: 25 }), fo = await searchAnswer(envOf(), owner, { q: "one", kinds: ["card"], limit: 25 });
  ok(!fm.error && !fo.error && !/secret|h-1/.test(hitsOf(fm)) && /card\/open\/o-1/.test(hitsOf(fm)) && /card\/secret\/c-1/.test(hitsOf(fo)) && /card\/open\/h-1/.test(hitsOf(fo)),
    "F2 search {kinds: [card]}: the member finds only the cards their role reads; the owner finds all", `${hitsOf(fm)} · ${hitsOf(fo)} · ${show(fm.error || fo.error || "")}`);
}

// ---- 5b. sprint 4, F1 (migrate-064): a goal's budget and a card's refs, the rules then the door and the read ----
{
  const B = (budget) => plan([{ kind: "goal", op: "upsert", data: { id: "g", title: "G", budget } }]);
  const good = B({ allocated: 12000, spent: 3400.5, currency: "eur", source: " the Q4 plan " });
  ok(!good.errors.length && JSON.stringify(good.steps[0].row.budget) === '{"allocated":12000,"spent":3400.5,"currency":"EUR","source":"the Q4 plan"}'
    && !B({ spent: 0, currency: "USD" }).errors.length && !B(null).errors.length,
    "money: a budget passes, its currency stored in capitals and its source trimmed; spent alone and null pass too", show(good.steps[0] && good.steps[0].row.budget));
  const bad = [{ allocated: -1, currency: "EUR" }, { allocated: 1, currency: "EURO" }, { allocated: 1 }, { currency: "EUR" }, { allocated: "10", currency: "EUR" },
    { allocated: 1, currency: "EUR", owner: "x" }, { allocated: 1, currency: "EUR", source: "x".repeat(201) }, [1]].map((b) => B(b).errors[0] || {});
  ok(bad.every((e) => e.error === "bad_field" && /data\.budget/.test(e.note) && /ISO-4217/.test(e.note)),
    "money: a negative figure, a currency not of three letters, no currency, neither figure, a figure in text, an unknown key, a long source and a list are refused bad_field naming data.budget", show(bad.map((e) => e.error)));

  const C = (kind, id, extra = {}) => ({ kind: "card", op: "upsert", data: { kind, id, name: id, ...extra } });
  const stored = {
    card_kind: mapOf("card_kind", [{ key: "claim", label: "Claims", idPattern: null, roleVisibility: null }, { key: "copy", label: "Copy", idPattern: null, roleVisibility: null }, { key: "secret", label: "Secret", idPattern: null, roleVisibility: ["owner"] }]),
    card: mapOf("card", [{ kind: "claim", id: "claim-fintech", name: "Fintech claim", roleVisibility: null }, { kind: "secret", id: "claim-fintech-x", name: "Secret", roleVisibility: null }]),
  };
  Object.defineProperty(stored, "cardPool", { value: [{ kind: "claim", id: "claim-fintech", name: "Fintech claim", roleVisibility: null, kindRoles: null },
    { kind: "secret", id: "claim-fintech-x", name: "Secret", roleVisibility: null, kindRoles: ["owner"] }] });
  const as = (ops, who = OWNER) => planKnowledge(ops, stored, who);
  ok(!as([C("copy", "copy-dm", { refs: ["card/claim/claim-fintech", "card/claim/claim-fintech"] })]).errors.length
    && JSON.stringify(as([C("copy", "copy-dm", { refs: ["card/claim/claim-fintech", "card/claim/claim-fintech"] })]).steps[0].row.refs) === '["card/claim/claim-fintech"]'
    && !as([C("claim", "claim-new"), C("copy", "copy-dm", { refs: ["card/claim/claim-new"] })]).errors.length,
    "refs: a card names a stored card of the project (a repeat dropped), or one filed in the same batch");
  const shape = [["claim/claim-fintech"], ["card/Claim/x"], Array.from({ length: 13 }, (_, i) => `card/claim/c${i}`), "card/claim/claim-fintech"].map((r) => as([C("copy", "copy-dm", { refs: r })]).errors[0] || {});
  ok(shape.every((e) => e.error === "bad_field" && /data\.refs/.test(e.note)), "refs: a ref not of the form card/<kind>/<id>, more than 12, or a string for a list is refused bad_field", show(shape.map((e) => e.error)));
  const self = as([C("copy", "copy-dm", { refs: ["card/copy/copy-dm"] })]).errors[0] || {};
  ok(self.error === "bad_field" && /names itself/.test(self.note), "refs: a card never relies on itself", show(self));
  const miss = as([C("copy", "copy-dm", { refs: ["card/claim/claim-fintec"] })]).errors[0] || {};
  ok(miss.error === "missing_card" && /data\.refs/.test(miss.note) && /near card\/claim\/claim-fintech \(Fintech claim\)/.test(miss.note) && miss.near[0].near.map((x) => x.ref).join() === "card/claim/claim-fintech,card/secret/claim-fintech-x",
    "refs: a card the project does not hold is refused missing_card, the near matches named (the owner reads every card)", show(miss));
  const LEADER = { isOwner: false, role: "leader" };
  const hid = as([C("copy", "copy-dm", { refs: ["card/secret/claim-fintech-x"] })], LEADER).errors[0] || {};
  const nearM = as([C("copy", "copy-dm", { refs: ["card/claim/claim-fintec"] })], LEADER).errors[0] || {};
  ok(hid.error === "missing_card" && nearM.error === "missing_card" && !JSON.stringify(nearM).includes("secret") && !/Secret/.test(hid.note) && nearM.near[0].near.map((x) => x.ref).join() === "card/claim/claim-fintech",
    "refs: a member naming a card of a kind they may not read is refused as for a missing one, and no near match names it", show([hid, nearM]));

  // the door and the read on SQLite: alpha's claim, beta's copy naming it is refused with beta's own near match; alpha's copy reads its link
  const sa = await writeKnowledge(owner, { project: "alpha", ops: [{ kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims" } }, C("claim", "claim-pilot", { name: "The pilot runs in Thiruvallur" }),
    { kind: "goal", op: "upsert", data: { id: "a", budget: { allocated: 500, spent: 120, currency: "EUR", source: "the plan" } } }] }, envOf());
  const sb = await writeKnowledge(owner, { project: "beta", ops: [{ kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims" } }, C("claim", "claim-pilots", { name: "Beta's pilots" }),
    { kind: "card_kind", op: "upsert", data: { key: "copy", label: "Copy" } }] }, envOf("beta"));
  ok(!sa.error && !sb.error && db.prepare("SELECT budget FROM k_goals WHERE project='alpha' AND id='a'").get().budget === '{"allocated":500,"spent":120,"currency":"EUR","source":"the plan"}',
    "money door: the budget lands as JSON in k_goals.budget", show([sa, sb]));
  const xb = await writeKnowledge(owner, { project: "beta", ops: [C("copy", "copy-dm", { refs: ["card/claim/claim-pilot"] })] }, envOf("beta"));
  const xe = (xb.errors || [])[0] || {};
  ok(xb.error === "invalid_ops" && xe.error === "missing_card" && xe.near[0].near.map((x) => x.ref).join() === "card/claim/claim-pilots" && !db.prepare("SELECT 1 FROM k_cards WHERE project='beta' AND id='copy-dm'").get(),
    "refs door: a card naming another project's card is refused missing_card; the near match is the project's own card; nothing written", show(xb));
  const xa = await writeKnowledge(owner, { project: "alpha", ops: [{ kind: "card_kind", op: "upsert", data: { key: "copy", label: "Copy" } }, C("copy", "copy-dm", { refs: ["card/claim/claim-pilot", "card/open/h-1"] })] }, envOf());
  ok(!xa.error && db.prepare("SELECT refs FROM k_cards WHERE project='alpha' AND id='copy-dm'").get().refs === '["card/claim/claim-pilot","card/open/h-1"]', "refs door: a card naming its own project's cards lands", show(xa));
  const { readAnswer } = await imp("src/extract.js");
  const ro = await readAnswer(envOf(), owner, { ref: "card/copy/copy-dm" }), rm = await readAnswer(envOf(), member, { ref: "card/copy/copy-dm" });
  ok(JSON.stringify(ro.item.refs) === JSON.stringify([{ ref: "card/claim/claim-pilot", title: "The pilot runs in Thiruvallur", href: "/read?ref=card/claim/claim-pilot" }, { ref: "card/open/h-1", title: "Hidden one", href: "/read?ref=card/open/h-1" }])
    && ro.links.filter((l) => l.rel === "relies-on").length === 2 && rm.item.refs.map((x) => x.ref).join() === "card/claim/claim-pilot" && !JSON.stringify(rm).includes("Hidden one"),
    "refs read: read {ref} returns the refs as links {ref, title, href} (rel relies-on); a card the member may not read is left out as a missing one", show([ro.item.refs, rm.item.refs]));
  // sprint-4 review, H2: the LIST reads refs by the same rule (hidden = missing) — a member listing cards never sees a
  // hidden ref's kind and id, which the card's own read would not show; the owner reads them as stored
  const lm = await readKnowledge(envOf(), { kind: "card" }, member), lo = await readKnowledge(envOf(), { kind: "card" }, owner);
  const lmDm = (lm.items || []).find((c) => c.id === "copy-dm") || {}, loDm = (lo.items || []).find((c) => c.id === "copy-dm") || {};
  ok((lmDm.refs || []).join() === "card/claim/claim-pilot" && !JSON.stringify(lm).includes("card/open/h-1")
    && (loDm.refs || []).join() === "card/claim/claim-pilot,card/open/h-1",
    "refs list: a listed card's refs pass the reader's rule — the member's list never names the hidden card", show([lmDm.refs, loDm.refs]));
}

// ---- 5c. sprint 4, M3: a part another project of the org owns (ownedBy), the rules, then the door and the Map's read ----
{
  const SV = (id, ownedBy, extra = {}) => ({ kind: "node", op: "upsert", data: { id, type: "service", name: id, data: { ...(ownedBy !== undefined ? { ownedBy } : {}), ...extra } } });
  const ARCH = (parts) => ({ kind: "node", op: "upsert", data: { id: "architecture:main", type: "architecture", name: "Architecture", data: { diagram: { nodes: parts } } } });
  const form = [SV("service:x", "Beta!"), SV("service:x", "b"), SV("service:x", 7), ARCH([{ id: "db", title: "DB", ownedBy: "Beta" }])].map((op) => plan([op]).errors[0] || {});
  const archOwn = plan([{ kind: "node", op: "upsert", data: { id: "architecture:main", type: "architecture", name: "A", data: { ownedBy: "beta" } } }]).errors[0] || {};
  ok(!plan([SV("service:x", "beta"), ARCH([{ id: "db", title: "DB", ownedBy: "beta" }])]).errors.length && form.every((e) => e.error === "bad_field" && /ownedBy/.test(e.note))
    && archOwn.error === "bad_field" && /data\.diagram\.nodes\[\]\.ownedBy/.test(archOwn.note),
    "ownedBy: a project key's form on a node's data and on a diagram part passes; any other form is bad_field; an architecture itself carries none", show([form, archOwn]));
  const st = (keys, nodes = []) => { const o = { node: mapOf("node", nodes) }; Object.defineProperty(o, "owners", { value: { self: "alpha", keys } }); return o; };
  const as = (ops, stored) => planKnowledge(ops, stored, OWNER);
  const unk = as([SV("service:x", "gamma")], st(["alpha", "beta"])).errors[0] || {};
  const part = as([ARCH([{ id: "db", title: "DB", ownedBy: "gamma" }])], st(["alpha", "beta"])).errors[0] || {};
  const own = as([SV("service:x", "alpha")], st(["alpha", "beta"])).errors[0] || {};
  const none = as([SV("service:x", "beta")], st(["alpha"])).errors[0] || {};
  ok(!as([SV("service:x", "beta")], st(["alpha", "beta"])).errors.length && unk.error === "unknown_project" && unk.ownedBy === "gamma" && JSON.stringify(unk.projects) === '["beta"]' && /one of \[beta\]/.test(unk.note)
    && part.error === "unknown_project" && own.error === "bad_field" && /its own project/.test(own.note) && none.error === "unknown_project" && JSON.stringify(none.projects) === "[]",
    "ownedBy door rule: a project the writer may name passes; another is unknown_project listing the ones they may (never the project written); the project written is bad_field", show([unk, part, own, none]));
  const kept = as([SV("service:x", "gamma", { note: "renamed" })], st(["alpha", "beta"], [{ id: "service:x", type: "service", name: "x", data: { ownedBy: "gamma" } }]));
  ok(!kept.errors.length, "ownedBy: a key the stored node already names is not checked again (a project archived later never refuses the part filed as it was)", show(kept.errors));

  // the door on SQLite: the owner names beta (active) from alpha; an unknown key and a member's key they may not read are refused
  const w = await writeKnowledge(owner, { project: "alpha", ops: [SV("service:pay", "beta"), ARCH([{ id: "db", title: "Shared DB", service: "pay" }, { id: "edge", title: "Edge", ownedBy: "beta" }])] }, envOf());
  const row = db.prepare("SELECT data FROM k_nodes WHERE project='alpha' AND id='service:pay'").get() || {};
  ok(!w.error && JSON.parse(row.data || "{}").ownedBy === "beta", "ownedBy door: the owner files a service and a diagram part owned by beta; it lands in k_nodes.data", show(w));
  const wx = await writeKnowledge(owner, { project: "alpha", ops: [SV("service:pay2", "nope")] }, envOf());
  const ex = (wx.errors || [])[0] || {};
  ok(wx.error === "invalid_ops" && ex.error === "unknown_project" && JSON.stringify(ex.projects) === '["beta"]' && !db.prepare("SELECT 1 FROM k_nodes WHERE project='alpha' AND id='service:pay2'").get(),
    "ownedBy door: a key that is no active project is refused unknown_project with the keys the owner may name; nothing written", show(wx));
  const wm = await writeKnowledge(member, { project: "alpha", ops: [SV("service:pay3", "beta")] }, envOf());
  const em = (wm.errors || [])[0] || {};
  ok(wm.error === "invalid_ops" && em.error === "unknown_project" && JSON.stringify(em.projects) === "[]" && /no other project/.test(em.note),
    "ownedBy door: a member seated on alpha alone may not name beta (a project they may not read is refused as one that does not exist)", show(wm));
  db.exec(`INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-member','beta','member','${T0}')`);
  const wm2 = await writeKnowledge(member, { project: "alpha", ops: [SV("service:pay3", "beta")] }, envOf());
  ok(!wm2.error, "ownedBy door: seated on beta too, the member names it", show(wm2));

  // the Map's read: the owner reads the name and the link; a member seated on alpha alone reads the name only
  const { readMapNode, renderInspector, archOwnersOf } = await imp("src/mapnode.js");
  const ro = await readMapNode(envOf(), owner, { ref: "service:pay" });
  db.exec("DELETE FROM project_seats WHERE person_id = 'p-member' AND project_key = 'beta'");
  const rm = await readMapNode(envOf(), member, { ref: "service:pay" });
  const plain = await readMapNode(envOf(), owner, { ref: "architecture:main" });
  ok(ro.status === 200 && JSON.stringify(ro.body.ownedBy) === '{"project":"beta","name":"Beta","href":"/map?project=beta&find=pay"}'
    && rm.status === 200 && JSON.stringify(rm.body.ownedBy) === '{"project":"beta","name":"Beta","href":null}',
    "map {ref}: ownedBy {project, name, href}: the owner gets the link to beta's Map; a member seated on alpha alone the name only", show([ro.body && ro.body.ownedBy, rm.body && rm.body.ownedBy, ro.body && ro.body.error]));
  const io = renderInspector(ro.body), im = renderInspector(rm.body);
  ok(/<dt>Owned by<\/dt><dd data-owner="beta"[^>]*><a href="\/map\?project=beta&amp;find=pay" data-button="open-owner"/.test(io) && /<dd data-owner="beta"[^>]*>Beta<\/dd>/.test(im) && !/open-owner/.test(im),
    "inspector: Owned by names the project, a link for a reader who may read it", show([io.match(/Owned by.{0,160}/), im.match(/Owned by.{0,80}/)]));
  const ao = await archOwnersOf(envOf(), member, { diagram: { nodes: [{ id: "edge", ownedBy: "beta" }] }, services: [] });
  const an = await archOwnersOf(envOf(), member, { diagram: { nodes: [{ id: "edge" }] }, services: [] });
  ok(plain.status === 200 && !("ownedBy" in plain.body) && JSON.stringify(ao.owners) === '{"beta":{"name":"Beta","may":false}}' && !("owners" in an),
    "Arch read: the projects the parts name, by name and whether the reader may read each; no owner named, nothing added", show([ao.owners, plain.body && plain.body.ownedBy]));
}

// ---- 6. migrate-039 applies to a database without it ----
{
  const pre = new DatabaseSync(":memory:");
  const ddl = (t) => (BOOT.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([\\s\\S]*?\\);\\n`)) || [""])[0];
  pre.exec(ddl("people") + "\n" + ddl("projects"));
  let err = null;
  // migrate-046 adds the render and style tables (the registry's two newest kinds) over it
  try { pre.exec(M039); pre.exec(M046); } catch (e) { err = e; }
  const tables = pre.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  ok(!err && Object.values(KINDS).every((s) => tables.includes(s.table)) && tables.includes("k_options") && tables.includes("k_versions") && tables.includes("k_snapshots") && tables.includes("org"),
    "migrate-039 (and migrate-046 after it) applies to a database without the knowledge tables", String(err || tables.join(",")));
}

// ---- 7. THE REGISTRY (sprint 3, B1): every kind and every shape declares where it shows, an example that validates, a
// preview line and its checklist; formats and the contract are generated from them; the new fields are checked ----
{
  const S = await imp("src/knowledge/schema.js");
  const SH = await imp("src/shapes.js");
  const F = await imp("src/formats.js");
  const { LANES, LANE_KEYS } = await imp("src/lanes.js");
  // the eight tabs: the registry's TAB_KEYS are src/shell.js TABS' keys, in order
  const shellSrc = readFileSync(join(ENGINE, "src", "shell.js"), "utf8");
  const tabsBlock = shellSrc.slice(shellSrc.indexOf("const TABS = ["), shellSrc.indexOf("\n];", shellSrc.indexOf("const TABS = [")));
  const shellTabs = [...tabsBlock.matchAll(/^\s*\{ key: "([a-z]+)", label:/gm)].map((m) => m[1]);
  ok(shellTabs.join() === S.TAB_KEYS.join(), `registry: TAB_KEYS are the shell's eight tabs (${shellTabs.join(", ")})`);
  const ids = new Set();
  for (const kind of KNOWLEDGE_KINDS) {
    const k = KINDS[kind];
    const badPlace = (k.shows || []).find((p) => !S.TAB_KEYS.includes(p.tab) || !/^\//.test(p.path) || !p.region || !p.what);
    ok(typeof k.line === "string" && k.line.length > 10 && Array.isArray(k.shows) && k.shows.length > 0 && !badPlace, `registry ${kind}: a line, and every place a real tab, a path, a region and what shows`, show(badPlace || k.shows));
    const ops = [...(k.example.needs || []), k.example.op];
    const g = plan(ops);
    ok(k.example.op.kind === kind && g.errors.length === 0, `registry ${kind}: its example op validates (with what it needs first)`, show(g.errors));
    const line = S.previewLine(kind, k.example.op.data, {});
    ok(typeof line === "string" && line.length > 5 && line.length <= 160 && !/undefined|null|\[object/.test(line), `registry ${kind}: preview line "${line}"`);
    ok(S.showsOf(kind, k.example.op.data, { cardKindTab: "gtm" }).length > 0, `registry ${kind}: its example shows somewhere`);
    for (const it of k.checklist) {
      const real = k.shows.some((p) => p.path === it.shows);
      ok(S.CHECK_AREAS.includes(it.area) && /\?$/.test(it.question) && it.fills && real && !ids.has(it.id), `registry ${kind}: checklist ${it.id} (${it.area}) names a real place of the kind (${it.shows})`, show(it));
      ids.add(it.id);
    }
  }
  const need = ["aim", "goal-tree", "apps", "screens", "screens-in-flow", "screens-pictured", "doors", "tables", "door-table-links", "checks-screens", "checks-doors", "grades",
    "questions-options", "rulings-owed", "start-here", "gtm-template", "gtm-strategy", "gtm-lists", "agents-equipped"];
  ok(need.every((x) => ids.has(x)), `registry: the checklist covers MCP.md §1/§4/§9 (${ids.size} items)`, need.filter((x) => !ids.has(x)).join());
  ok(S.showsOf("card", { kind: "claim", id: "c1", name: "x" }, { cardKindTab: "gtm" })[0].tab === "gtm" && S.showsOf("card", { kind: "claim", id: "c1" })[0].tab === "map",
    "registry: a card shows on its card kind's tab (the Map when its kind names none)");
  ok(S.showsOf("node", { id: "flow:a", type: "flow", name: "A" }).some((p) => p.path === "/map/flows") && !S.showsOf("node", { id: "screen:a", type: "screen" }).some((p) => p.path === "/map/flows"),
    "registry: a node's places depend on its type");
  // freshness and the card kind's tab, at the door
  ok(plan([{ kind: "card", op: "upsert", data: { kind: "claim", id: "c1", name: "x", confidence: "sure" } }]).errors[0]?.error === "bad_field"
    && plan([{ kind: "doc", op: "upsert", data: { path: "a.md", body: "x", asOf: "2026-02-30" } }]).errors[0]?.error === "bad_field"
    && plan([{ kind: "card_kind", op: "upsert", data: { key: "claim", label: "C", tab: "sales" } }]).errors[0]?.error === "bad_field"
    && plan([{ kind: "card", op: "upsert", data: { kind: "claim", id: "c1", name: "x", confidence: "direction", asOf: "2026-09-30" } }]).errors.length === 0,
    "registry: a bad confidence, a bad asOf and a tab that is not one of the eight are refused bad_field; good ones pass");
  const fe = plan([{ kind: "card", op: "upsert", data: { kind: "claim", id: "c1", name: "x", confidence: "sure" } }]).errors[0] || {};
  ok(/confirmed, direction, proposal, unknown/.test(fe.note) && /formats \{kind: "card"\}/.test(fe.note) && Object.keys(fe).join() === "index,kind,id,error,note", "registry: the refusal names the field's hint and points at formats {kind}", show(fe));
  // the per-call body cap: 256 KB of carried bodies
  const big = "<p>" + "x".repeat(150000) + "</p>";
  const cap = plan([nodesAB.node && { kind: "node", op: "upsert", data: { id: "screen:a", type: "screen", name: "A" } },
    { kind: "render", op: "upsert", data: { screen: "screen:a", state: "", format: "html", body: big } }, { kind: "render", op: "upsert", data: { screen: "screen:a", state: "two", format: "html", body: big } }]);
  ok(cap.errors.length === 1 && cap.errors[0].index === 2 && cap.errors[0].error === "too_large" && /256 KB/.test(cap.errors[0].note) && /split the call/.test(cap.errors[0].note), "registry: a call whose bodies pass 256 KB is refused too_large at the op that passes it, naming the cap", show(cap.errors));
  // the shapes
  ok(SH.SHAPE_KEYS.join() === LANE_KEYS.join(), `shapes: one per lane (${SH.SHAPE_KEYS.join(", ")})`);
  const FILED = new Set(["components", "screens", "proof", "expected", "actual"]);
  for (const l of LANES) {
    const sh = SH.SHAPES[l.key], names = sh.fields.map((x) => x.name);
    ok(l.fields.filter((x) => FILED.has(x)).every((x) => names.includes(x)) && ["source", "depends", "open", "next", "goalRef", "what", "why"].every((x) => names.includes(x)), `shape ${l.key}: the common fields and its lane's own (${l.fields.join(", ") || "none"})`);
    ok(SH.checkShape(sh.example) === null && sh.example.lane === l.key, `shape ${l.key}: its example passes the door's check`, show(SH.checkShape(sh.example)));
    ok(/^Contribution \(/.test(SH.shapePreviewLine(sh.example)) && SH.shapeShowsOf({ ...sh.example, id: "T-YYYYMMDD-NNN" }).length >= 2, `shape ${l.key}: a preview line and its places`);
  }
  const refuse = (b) => SH.checkShape({ lane: "code", ...b }) || {};
  const r1 = refuse({ next: { what: "x", by: "2026-13-01" } }), r2 = refuse({ source: Array.from({ length: 11 }, () => ({ kind: "url", ref: "https://a.b" })) });
  const r3 = refuse({ source: [{ kind: "url", ref: "javascript:alert(1)" }] }), r4 = refuse({ depends: ["a b"] }), r5 = refuse({ next: { what: "x", who: "not a person!" } }), r6 = refuse({ audience: "x" });
  ok(r1.field === "next.by" && r2.field === "source" && r3.field === "source[0].ref" && r4.field === "depends[0]" && r5.field === "next.who" && r6.field === "audience"
    && [r1, r2, r3, r4, r5, r6].every((r) => r.error === "bad_field" && r.hint && r.example && /formats \{shape: "/.test(r.note)),
    "shapes: a bad next.by, an 11th source, a non-http url, a bad depends ref, a who of neither form and a GTM field off the gtm lane are refused, naming the field with a hint and an example");
  ok(SH.checkShape({ lane: "leader", kind: "note", what: "w", why: "y" }) === null && SH.shapeColumns({ lane: "leader" }).shape === null, "shapes: a filing with none of the new fields is untouched (no refusal, nothing stored)");
  // happenedAt (the owner's MCQ 2026-10-01): when the work happened, beside the filing time; both ways, on a fixed clock
  const NOW = Date.parse("2026-10-01T12:00:00.000Z");
  const hap = (v) => SH.checkShape({ lane: "leader", kind: "note", what: "w", why: "y", happenedAt: v }, NOW);
  const fine = ["2026-09-28", "2026-10-01", "2000-01-01", "2026-09-28T09:30Z", "2026-09-28T09:30:15Z", "2026-10-01T11:59:59.999Z"];
  const bad = { "2026-02-30": "impossible date", "2026-09-28T24:00Z": "impossible hour", "2026-09-28T09:30+02:00": "not UTC", "28/09/2026": "not ISO", "": "empty", 20260928: "a number",
    "2026-10-02": "a future date", "2026-10-01T12:00:01Z": "a future time", "1999-12-31": "before 2000", "1999-12-31T23:59:59Z": "before 2000 (a time)" };
  const fineOut = fine.map(hap), badOut = Object.keys(bad).map((k) => hap(/^\d+$/.test(k) ? Number(k) : k));
  ok(fineOut.every((r) => r === null) && badOut.every((r) => r && r.error === "bad_field" && r.field === "happenedAt" && r.hint && r.example && /formats \{shape: "leader"\}/.test(r.note))
    && /in the future/.test(hap("2026-10-02").hint) && /from 2000-01-01/.test(hap("1999-12-31").hint) && SH.checkShape({ lane: "leader", kind: "note", what: "w", why: "y" }, NOW) === null,
    `shapes: happenedAt takes a date or a UTC date-time up to now (${fine.join(", ")}) and refuses ${Object.values(bad).join(", ")}, naming the field with a hint and an example; absent is fine`, show(badOut.find((r) => !r || r.field !== "happenedAt") || null));
  const hc = SH.shapeColumns({ lane: "leader", happenedAt: "2026-09-28T09:30Z" }), hd = SH.shapeColumns({ lane: "leader", happenedAt: "2026-09-28" });
  ok(hc.happenedAt === "2026-09-28T09:30:00.000Z" && hc.shape === null && hd.happenedAt === "2026-09-28" && SH.shapeColumns({ lane: "leader" }).happenedAt === null
    && / happened 2026-09-28$/.test(SH.shapePreviewLine({ lane: "leader", what: "w", happenedAt: "2026-09-28T09:30Z" })) && !/happened/.test(SH.shapePreviewLine({ lane: "leader", what: "w" }))
    && SH.SHAPES.leader.fields.some((x) => x.name === "happenedAt"),
    "shapes: happenedAt is stored in its own column (a time as toISOString(), a date as sent; never inside shape), said in the preview line, a field of every shape and of preview then file's schema", show([hc, hd]));
  // formats: generated from the two registries, and the contract carries the same
  const fl = F.formatsAnswer({}), fk = F.formatsAnswer({ kind: "card" }), fs = F.formatsAnswer({ shape: "gtm" });
  ok(fl.kinds.length === KNOWLEDGE_KINDS.length && fl.shapes.length === LANE_KEYS.length && fk.fields.map((x) => x.name).join() === S.fieldDocs("card").map((x) => x.name).join()
    && fk.fields.find((x) => x.name === "confidence").values.join() === S.CONFIDENCES.join() && fs.fields.some((x) => x.name === "experiment") && fk.checklist === KINDS.card.checklist,
    "formats: the list, a kind and a shape are generated from the registries");
  ok(F.formatsAnswer({ kind: "planet" }).error === "unknown_kind" && F.formatsAnswer({ shape: "sales" }).error === "unknown_shape", "formats: an unknown kind or shape is refused with the list");
  const door = JSON.parse(readFileSync(join(ENGINE, "..", "contracts", "door.json"), "utf8"));
  const { _doc, ...gen } = door.formats || {};
  ok(JSON.stringify(gen) === JSON.stringify(F.formatsAll()), "formats: contracts/door.json carries exactly what the registries generate (regenerate with tools/make-door-contract.py)");
  // the door and the store: a card with its freshness, a card kind with its tab, a contribution with its shape
  const wc = await writeKnowledge(owner, { project: "alpha", ops: [{ kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims", tab: "gtm" } },
    { kind: "card", op: "upsert", data: { kind: "claim", id: "c-1", name: "A claim", asOf: "2026-09-30", confidence: "direction" } }] }, envOf());
  const rc = await readKnowledge(envOf(), { kind: "card", id: "claim|c-1" }), rk = await readKnowledge(envOf(), { kind: "card_kind", id: "claim" });
  ok(!wc.error && rc.item.asOf === "2026-09-30" && rc.item.confidence === "direction" && rk.item.tab === "gtm", "door: a card's asOf and confidence and a card kind's tab are stored and read back", show([wc, rc.item, rk.item]));
  const fx = await fileTransmission(owner, { lane: "gtm", kind: "outreach", ...SH.SHAPES.gtm.example, goalRef: undefined, project: "alpha" }, envOf());
  const row = db.prepare("SELECT shape, next_by, next_who FROM transmission WHERE id = ?").get(fx.id) || {};
  const { transmissionOneFor } = await imp("src/core.js");
  const back = await transmissionOneFor(fx.id, envOf(), owner);
  ok(!fx.error && row.next_by === "2026-10-15" && row.next_who === "ada@example.com" && JSON.parse(row.shape).source.length === 2 && back.next.by === "2026-10-15" && back.source.length === 2
    && back.depends.join() === "screen:pricing,q/Q-pricing-1" && back.audience && back.shape === undefined, "door: a contribution's source, depends, open, next and the GTM four are stored and read back", show([row, back.next]));
  const fh = await fileTransmission(owner, { lane: "leader", kind: "note", what: "w happened", why: "y", happenedAt: "2026-09-28", project: "alpha" }, envOf());
  const hrow = db.prepare("SELECT happened_at, created_at, shape FROM transmission WHERE id = ?").get(fh.id) || {};
  const hback = await transmissionOneFor(fh.id, envOf(), owner);
  const ffut = await fileTransmission(owner, { lane: "leader", kind: "note", what: "w future", why: "y", happenedAt: "2999-01-01", project: "alpha" }, envOf());
  ok(!fh.error && hrow.happened_at === "2026-09-28" && hrow.shape === null && hrow.created_at > "2026-09-28" && hback.happened_at === "2026-09-28" && ffut.error === "bad_field" && ffut.field === "happenedAt"
    && !db.prepare("SELECT 1 FROM transmission WHERE what = 'w future'").get(), "door: happenedAt is stored in happened_at beside a created_at of now and read back; a future one files nothing", show([hrow, ffut]));
  const fbad = await fileTransmission(owner, { lane: "leader", kind: "note", what: "w", why: "y", next: { what: "x", by: "soon" }, project: "alpha" }, envOf());
  ok(fbad.error === "bad_field" && fbad.field === "next.by", "door: a bad next.by files nothing", show(fbad));
  // migrate-047 applies over a database without it
  const pre = new DatabaseSync(":memory:");
  const ddl = (t) => (BOOT.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([\\s\\S]*?\\);\\n`)) || [""])[0];
  pre.exec(ddl("people") + "\n" + ddl("projects"));
  pre.exec("CREATE TABLE transmission (id TEXT PRIMARY KEY, project TEXT)");
  let err = null;
  try { pre.exec(M039); pre.exec(M046); pre.exec(readFileSync(join(ENGINE, "migrate-047.sql"), "utf8")); pre.exec(readFileSync(join(ENGINE, "migrate-051.sql"), "utf8")); } catch (e) { err = e; }
  const cols = (t) => pre.prepare(`PRAGMA table_info(${t})`).all().map((r) => r.name);
  ok(!err && cols("k_cards").includes("as_of") && cols("k_docs").includes("confidence") && cols("k_card_kinds").includes("tab") && ["shape", "next_by", "next_who", "happened_at"].every((c) => cols("transmission").includes(c)),
    "migrate-047 applies over a database without it (8 columns), and migrate-051 after it (happened_at)", String(err || ""));
}

// ---- 8. M6 · a screen's takes (migrate-065): the table, the triggers' append, no take for an identical hash, the backfill, and
// the registry's restore rules (a hash with no body; never with one; never a Partner's) ----
{
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = ON"); d.exec(BOOT);
  d.exec(`INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p-o','Olive','owner','h1',1,'${T0}',1),('p-m','Mo','member','h2',1,'${T0}',1)`);
  d.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}')`);
  const H = (c) => c.repeat(64);
  const at = (n) => `2026-10-05T00:00:0${n}.000Z`;
  const put = (state, format, hash, n, by = "p-o", extra = "") => d.prepare(`INSERT INTO k_renders (project,screen,state,variant,format,hash,bytes,width,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:a',?,'',?,?,10,390,?,?,?,?) ` +
    `ON CONFLICT (project,screen,state,variant) DO UPDATE SET format = excluded.format, hash = excluded.hash${extra}, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(state, format, hash, by, at(n), by, at(n));
  const takes = (state = "") => d.prepare("SELECT format, take, hash, filed_by, filed_at FROM k_screen_takes WHERE project='alpha' AND screen='screen:a' AND state=? ORDER BY rowid").all(state)
    .map((r) => `${r.format}${r.take}:${r.hash[0]}:${r.filed_by}`).join(" ");
  put("", "html", H("a"), 1);
  ok(takes() === "html1:a:p-o", "takes: a render filed is its frame's take 1 (who and when are the render's)", takes());
  put("", "html", H("a"), 2);
  d.prepare("UPDATE k_renders SET width = 1024 WHERE project='alpha' AND screen='screen:a'").run();
  ok(takes() === "html1:a:p-o", "takes: the same hash filed again, and a field-only change, append no take", takes());
  put("", "html", H("b"), 3, "p-m");
  put("", "image", H("c"), 4);
  put("", "html", H("a"), 5);
  ok(takes() === "html1:a:p-o html2:b:p-m image1:c:p-o html3:a:p-o", "takes: a new body appends the next take of its format; a format switch counts its own; an older body filed again is a new take", takes());
  put("ready", "html", H("a"), 6);
  ok(takes("ready") === "html1:a:p-o" && takes() === "html1:a:p-o html2:b:p-m image1:c:p-o html3:a:p-o", "takes: each frame (state, variant) counts its own", takes("ready"));
  d.prepare("DELETE FROM k_renders WHERE project='alpha' AND screen='screen:a' AND state=''").run();
  put("", "html", H("a"), 7);
  ok(takes() === "html1:a:p-o html2:b:p-m image1:c:p-o html3:a:p-o", "takes: a removed render keeps its takes, and its newest body filed back appends none (a restore that re-inserts the row)", takes());
  const plan1 = d.prepare("EXPLAIN QUERY PLAN SELECT t.hash FROM k_screen_takes t WHERE t.project = 'alpha' AND t.screen = 'screen:a' ORDER BY t.filed_at DESC, t.rowid DESC LIMIT 6").all().map((r) => r.detail).join(" | ");
  ok(/SEARCH t USING INDEX idx_k_screen_takes_screen \(project=\? AND screen=\?\)/.test(plan1) && !/TEMP B-TREE/.test(plan1), "takes: a screen's newest takes are one SEARCH on idx_k_screen_takes_screen, in index order", plan1);
  // the backfill: a database whose renders were filed before migrate-065 (its table and triggers gone) gets one take per render
  const pre = new DatabaseSync(":memory:");
  pre.exec("PRAGMA foreign_keys = ON"); pre.exec(BOOT);
  pre.exec("DROP TRIGGER k_screen_takes_insert; DROP TRIGGER k_screen_takes_update; DROP TABLE k_screen_takes;");
  pre.exec(`INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p-o','Olive','owner','h1',1,'${T0}',1); INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}')`);
  for (const [st, h] of [["", "a"], ["ready", "b"]]) pre.prepare(`INSERT INTO k_renders (project,screen,state,variant,format,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:a',?,'','html',?,10,'p-o',?,'p-o',?)`).run(st, H(h), at(1), at(2));
  const M065 = readFileSync(join(ENGINE, "migrate-065.sql"), "utf8");
  let err = null;
  try { pre.exec(M065); pre.exec(M065); } catch (e) { err = e; }
  const back = pre.prepare("SELECT state, take, hash, filed_at FROM k_screen_takes ORDER BY state").all();
  ok(!err && back.length === 2 && back.every((r) => r.take === 1 && r.filed_at === at(2)) && back[1].hash === H("b"), "migrate-065: the backfill files one take per render already filed (take 1, its updated_at), and a re-run writes nothing", String(err || show(back)));
  // the registry: a restore names a hash and no body; a Partner restores none (the plan, without the door: no take read)
  const node = { node: mapOf("node", [{ id: "screen:a", type: "screen", name: "A" }]) };
  // (a plan without the door reads no take, so the frame's format rides on the op: the door takes the take's own)
  const restore = { kind: "render", op: "upsert", data: { screen: "screen:a", format: "html", hash: H("a") } };
  const ok1 = plan([restore], node, { isOwner: false, role: "member" });
  const both = plan([{ kind: "render", op: "upsert", data: { screen: "screen:a", hash: H("a"), format: "html", body: "<p>x</p>" } }], node, { isOwner: false, role: "member" });
  const pa = plan([restore], node, { isOwner: false, role: "partner" });
  const vend = plan([restore], node, { isOwner: false, role: "vendor" });
  const badHash = plan([{ kind: "render", op: "upsert", data: { screen: "screen:a", hash: "abc" } }], node, { isOwner: false, role: "member" });
  ok(!ok1.errors.length && ok1.steps[0].row.hash === H("a") && codes(both).join() === "bad_field" && /not both/.test(both.errors[0].note) && codes(pa).join() === "partner_refused" && codes(vend).join() === "partner_refused" && codes(badHash).join() === "bad_field",
    "registry: render {screen, hash} with no body is a restore; a hash with a body is refused; a Partner (the role class: a typed outside label too) is refused partner_refused; a hash that is no sha256 is bad_field", show([ok1.errors, both.errors, pa.errors, badHash.errors]));
}

// sprint 1's review (closed in 6.6): a knowledge row carries its project's mark alone, so marked knowledge lands on an eval project
// only — a test seat's marked knowledge on a real project is refused (its contributions keep the seat's exception: their row is marked)
{
  P.run("eval-fixed-k", "Eval Seat K", "eval-k@example.test", "owner", "h-ek", T0);
  db.exec(`INSERT INTO projects (key,name,active,created_at,eval) VALUES ('evalp','Eval P',1,'${T0}',1)`);
  const seat = { id: "eval-fixed-k", name: "Eval Seat K", role: "owner" };
  const k0 = count("SELECT COUNT(*) AS n FROM k_goals");
  const onReal = await writeKnowledge(seat, { project: "alpha", eval: true, ops: [G("suite-goal", null)] }, envOf());
  const onEval = await writeKnowledge(seat, { project: "evalp", eval: true, ops: [G("suite-goal", null)] }, envOf("evalp"));
  const realOwner = await writeKnowledge(owner, { project: "alpha", eval: true, ops: [G("suite-goal", null)] }, envOf());
  const txSeat = await fileTransmission(seat, { lane: "leader", kind: "note", what: "suite", why: "w", project: "alpha", eval: true }, envOf());
  ok(onReal.error === "eval_mark_refused" && /eval project/.test(onReal.note) && realOwner.error === "eval_mark_refused" && !onEval.error && onEval.written === 1
    && count("SELECT COUNT(*) AS n FROM k_goals") === k0 + 1 && !db.prepare("SELECT 1 FROM k_goals WHERE project = 'alpha' AND id = 'suite-goal'").get() && !txSeat.error,
    "eval mark: marked knowledge from a test seat on a real project is refused (nothing written), on an eval project it lands; the seat's marked contribution still files", show([onReal, onEval, realOwner, txSeat]));
}

// ---- 9. the goal tree's rules INSIDE the write (sprint 8, 8.3b; sprint 1's review: two concurrent goal writes left two roots) ----
// THE INTERLEAVE, deterministic (no timing): write A plans against the tree it reads, and the moment it hands its D1 batch over,
// write B runs whole and lands; then A's batch runs. Each write alone is sound; together they break the tree. GREEN: A's batch
// carries the guard (src/knowledge/write.js GOAL_TREE_GUARD_SQL), so it rolls back whole and A answers the plan's refusal against
// the tree as it now stands. RED (the instrument): the same interleave with the guard statement dropped from A's batch — the
// batch as it was before 8.3b — lands the broken tree.
{
  const { GOAL_TREE_GUARD_SQL } = await imp("src/knowledge/write.js");
  const isGuard = (s) => s && s.sql === GOAL_TREE_GUARD_SQL;
  // raced(hook, { old }) -> an env whose FIRST batch that WRITES k_goals (never the plan's read batch) runs `hook` (write B) before it executes; old: every
  // batch without the guard statement (the instrument)
  const raced = (project, hook, { old = false } = {}) => {
    const inner = d1(db);
    let h = hook, fired = false, dropped = 0;
    const DB = { prepare: inner.prepare, batch: async (list) => {
      if (h && list.some((s) => /^(INSERT INTO|DELETE FROM) k_goals\b/.test(String(s && s.sql)))) {
        const run = h; h = null; fired = true; await run();
      }
      // the instrument drops the guard from EVERY batch: A's ledger id collides with B's (both read the day's sequence before
      // either landed), so the door retries the batch once under a fresh id (src/core.js fileTransmission)
      if (old) { const kept = list.filter((s) => !isGuard(s)); dropped += list.length - kept.length; return inner.batch(kept); }
      return inner.batch(list);
    } };
    return { env: asOrg({ DB, [Symbol.for("sharingu.project")]: project, BRAIN: brain() }), fired: () => fired, dropped: () => dropped };
  };
  const plain = (project) => asOrg({ DB: d1(db), [Symbol.for("sharingu.project")]: project, BRAIN: brain() });
  let n = 0;
  const fresh = () => { const key = `tree${++n}`; db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)").run(key, key, T0); return key; };
  const rows = (p) => db.prepare("SELECT id, parent FROM k_goals WHERE project = ? ORDER BY id").all(p);
  const roots = (p) => rows(p).filter((g) => g.parent == null).map((g) => g.id);
  const ledgerOf = (p) => count(`SELECT COUNT(*) AS n FROM transmission WHERE kind = 'knowledge' AND project = '${p}'`);
  const W = (env, project, ops) => writeKnowledge(owner, { project, ops }, env);
  // race(seed, opsA, opsB, old) -> A's answer, B's answer, the tree after
  const race = async (seed, opsA, opsB, old = false) => {
    const p = fresh();
    if (seed.length) { const s = await W(plain(p), p, seed); if (s.error) return { seedFailed: s }; }
    const l0 = ledgerOf(p);
    let b = null;
    const r = raced(p, async () => { b = await W(plain(p), p, opsB); }, { old });
    const a = await W(r.env, p, opsA);
    return { a, b, fired: r.fired(), dropped: r.dropped(), rows: rows(p), roots: roots(p), ledger: ledgerOf(p) - l0 };
  };
  const errs = (x) => (x && x.errors ? x.errors.map((e) => e.error) : []);
  const CASES = [
    ["two first roots (an empty tree, each write files its own root)", [], [G("ra")], [G("rb")], "goal_roots",
      (t) => t.roots.length === 2, (t) => t.roots.join() === "rb"],
    ["a cycle (A moves x under y while B moves y under x)", [G("root"), G("x", "root"), G("y", "root")], [G("x", "y")], [G("y", "x")], "goal_cycle",
      (t) => { const m = new Map(t.rows.map((g) => [g.id, g.parent])); return m.get("x") === "y" && m.get("y") === "x"; },
      (t) => { const m = new Map(t.rows.map((g) => [g.id, g.parent])); return m.get("y") === "x" && m.get("x") === "root"; }],
    ["an orphan (A files a child under leaf p while B removes p)", [G("root"), G("p", "root")], [G("kid", "p")], [{ kind: "goal", op: "remove", data: { id: "p" } }], "missing_parent",
      (t) => t.rows.some((g) => g.id === "kid" && g.parent === "p") && !t.rows.some((g) => g.id === "p"), (t) => !t.rows.some((g) => g.id === "kid" || g.id === "p")],
    ["a removed parent (A removes leaf p while B files a child under it)", [G("root"), G("p", "root")], [{ kind: "goal", op: "remove", data: { id: "p" } }], [G("kid", "p")], "has_children",
      (t) => t.rows.some((g) => g.id === "kid" && g.parent === "p") && !t.rows.some((g) => g.id === "p"), (t) => t.rows.some((g) => g.id === "kid" && g.parent === "p") && t.rows.some((g) => g.id === "p")],
  ];
  for (const [name, seed, opsA, opsB, code, broken, sound] of CASES) {
    const red = await race(seed, opsA, opsB, true), green = await race(seed, opsA, opsB);
    ok(red.fired && red.dropped >= 1 && !red.a.error && !red.b.error && broken(red),
      `9 · red (the instrument, the batch without the guard): ${name} — both writes answer written and the tree is broken`, show({ a: red.a, b: red.b, rows: red.rows }));
    ok(green.fired && !green.b.error && green.a.error === "invalid_ops" && errs(green.a).includes(code) && sound(green) && green.ledger === 1,
      `9 · green: ${name} — B lands, A's batch rolls back whole and A answers invalid_ops ${code}; the tree stays sound, one ledger row (B's)`, show({ a: green.a, rows: green.rows }));
  }
  // positive controls: two sound concurrent writes both land (the guard refuses only a broken tree); a write with no goal op carries
  // no guard; a sequential second root is the plan's own refusal, as before
  const both = await race([G("root")], [G("c1", "root")], [G("c2", "root")]);
  ok(both.fired && !both.a.error && !both.b.error && both.rows.map((g) => g.id).join() === "c1,c2,root" && both.ledger === 2,
    "9 · two sound concurrent goal writes (two children of the one root) both land", show(both));
  let guards = 0;
  { const inner = d1(db); const env = asOrg({ DB: { prepare: inner.prepare, batch: async (l) => { guards += l.filter(isGuard).length; return inner.batch(l); } }, [Symbol.for("sharingu.project")]: "alpha", BRAIN: brain() });
    const w = await writeKnowledge(owner, { project: "alpha", ops: [{ kind: "node", op: "upsert", data: { id: "screen:no-guard", type: "screen", name: "N" } }] }, env);
    ok(!w.error && guards === 0, "9 · a write with no goal op carries no guard statement (no row read for it)", show(w)); }
  const p2 = fresh(); await W(plain(p2), p2, [G("one")]);
  const seq = await W(plain(p2), p2, [G("two")]);
  ok(seq.error === "invalid_ops" && errs(seq).includes("goal_roots") && roots(p2).join() === "one", "9 · without an interleave a second root is the plan's own refusal, unchanged", show(seq));
}

// ---- 10. the batch door's statements (sprint 8, 8.3b; PLATFORM §3: `file` of 50 contributions was 160 statements, over a free
// account's 50 queries a call) ----
// The block's rows go in ONE statement per table (src/core.js TX_BATCH_SQL, EVENTS_BATCH_SQL; src/refs.js REFS_BATCH_SQL) and the
// tally: 50 varied filings are 4 statements in the batch (the per-row door: one filing, one mirror and one refs insert EACH). The
// rows are the SAME rows: the same 50 bodies filed one at a time through the single door (fileTransmission, whose statements this
// slice leaves alone) on a twin database land identical filings, mirrors, refs and tallies (the moments aside: created_at and the
// grade's stagedAt).
// And `file` reads the clientRefs ONCE: fileItems' own `landed` read, the batch door told which refs it found unfiled.
{
  const core = await imp("src/core.js");
  const { REFS_BATCH_SQL } = await imp("src/refs.js");
  const P = await imp("src/preview.js");
  const twin = () => {
    const d = new DatabaseSync(":memory:");
    d.exec("PRAGMA foreign_keys = ON"); d.exec(BOOT);
    d.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-owner','Olive','olive@example.test','owner','h1',1,?,1)").run(T0);
    d.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}')`);
    return d;
  };
  // counted(d) -> an env over d whose `log` holds every statement the door ran ({ sql, batched })
  const counted = (d) => { const inner = d1(d), log = [];
    const DB = { prepare: (sql) => { const s = inner.prepare(sql); const wrap = (x) => ({ ...x, bind: (...a) => wrap(x.bind(...a)),
      first: async () => { log.push({ sql, batched: false }); return x.first(); }, all: async () => { log.push({ sql, batched: false }); return x.all(); },
      run: async () => { log.push({ sql, batched: false }); return x.run(); } }); return wrap(s); },
      batch: async (list) => { for (const s of list) log.push({ sql: s.sql, batched: true }); return inner.batch(list); } };
    return { log, env: asOrg({ DB, [Symbol.for("sharingu.project")]: "alpha", BRAIN: brain() }) }; };
  const FORMS = [
    (i) => ({ lane: "code", kind: "pr", what: `pr ${i}`, why: "w", proof: "npm test: exit 0, 12 passed", components: ["svc-a"], touches: ["screen:home", "door:get-x"] }),
    (i) => ({ lane: "leader", kind: "note", what: `note ${i}`, why: "w", next: { what: "follow up", who: "Mo", by: "2026-12-01" } }),
    (i) => ({ lane: "design", kind: "screen", what: `screen ${i}`, why: "w", screens: ["01"], gapRefs: ["q/Q-1"], happenedAt: "2026-09-29T10:00:00Z" }),
    (i) => ({ lane: "leader", kind: "note", what: `goal ${i}`, why: "w", goalRef: "root", outcome: 2.5, expected: "e", actual: "a", source: [{ kind: "url", ref: "https://s.example/x" }] }),
    (i) => ({ lane: "gtm", kind: "outreach", what: `post ${i}`, why: "w", proof: "https://example.com/p", depends: ["goal/root"], digest: "d".repeat(300) }),
  ];
  const bodies = Array.from({ length: 50 }, (_, i) => ({ ...FORMS[i % 5](i), project: "alpha", clientRef: `c-${i}` }));
  const A = twin(), B = twin();
  const ca = counted(A);
  const res = await core.fileTransmissionsBatch(owner, bodies, ca.env);
  const one = [];
  for (const b of bodies) one.push(await core.fileTransmission(owner, b, asOrg({ DB: d1(B), [Symbol.for("sharingu.project")]: "alpha", BRAIN: brain() })));
  const q = (d, sql) => d.prepare(sql).all().map((r) => JSON.stringify(r));
  const same = (sql) => { const x = q(A, sql), y = q(B, sql); return x.length > 0 && x.length === y.length && x.every((r, k) => r === y[k]) ? x.length : `${x.length} vs ${y.length}: ${x.find((r, k) => r !== y[k]) || ""} | ${y.find((r, k) => r !== x[k]) || ""}`.slice(0, 600); };
  const TXC = "id, submitter, lane, kind, what, why, touches, screens, components, gaprefs, report, digest, proof, parent, json_remove(grade, '$.stagedAt') AS grade, route, status, eval, trace, about, project, via, client_ref, goal_ref, expected, actual, outcome, shape, next_by, next_who, next_due, happened_at, org, typeof(outcome) AS t_out, typeof(eval) AS t_eval";
  const checks = {
    filings: same(`SELECT ${TXC} FROM transmission ORDER BY rowid`),
    mirrors: same("SELECT session_id, person_id, kind, lane, payload_json, touches, basis, stamped, project, org FROM events ORDER BY rowid"),
    refs: same("SELECT tid, ref FROM transmission_refs ORDER BY rowid"),
    kinds: same("SELECT * FROM transmission_kinds ORDER BY project, kind"), open: same("SELECT * FROM transmission_open ORDER BY project"),
    goals: same("SELECT * FROM transmission_goals ORDER BY goal_ref, lane, kind"), usage: same("SELECT items_month FROM org_usage"),
  };
  ok(res.length === 50 && res.every((r) => r.id && !r.error) && one.every((r) => r.id && !r.error) && Object.values(checks).every((v) => typeof v === "number"),
    "10 · the batch door's 50 varied filings (shape, next, happenedAt, refs, outcome, digest) land the SAME rows as the single door's, row by row: filings, mirrors, refs and every tally", show(checks));
  const inBatch = ca.log.filter((x) => x.batched).map((x) => x.sql);
  const per = (re) => inBatch.filter((s) => re.test(s)).length;
  ok(inBatch.length === 4 && per(/^INSERT INTO transmission \(/) === 1 && per(/^INSERT INTO events /) === 1 && inBatch.includes(REFS_BATCH_SQL),
    `10 · 50 filings are ${inBatch.length} statements in the batch (one per table and the month's tally), ${ca.log.length} statements in all`, show(inBatch.map((s) => s.slice(0, 50))));
  // chunking: a block past TX_CHUNK_BYTES is cut into more statements, never one over the cap, and every row still lands
  const C = twin(), cc = counted(C);
  const big = Array.from({ length: 12 }, (_, i) => ({ lane: "leader", kind: "note", what: `big ${i}`, why: "w", digest: "x".repeat(7990), proof: "p".repeat(3990), project: "alpha" }));
  const save = core.TX_CHUNK_BYTES;
  const rb = await core.fileTransmissionsBatch(owner, big, cc.env);
  const txStmts = cc.log.filter((x) => x.batched && /^INSERT INTO transmission \(/.test(x.sql)).length;
  ok(save === 400000 && rb.every((r) => r.id) && Number(C.prepare("SELECT COUNT(*) AS n FROM transmission").get().n) === 12 && txStmts === 1,
    `10 · 12 filings of ~12 KB each fit one statement under the 400 KB cap (${txStmts}); every row lands`);
  const D = twin(), cd = counted(D);
  const huge = Array.from({ length: 60 }, (_, i) => ({ lane: "leader", kind: "note", what: `huge ${i}`, why: "w", digest: "x".repeat(7990), proof: "p".repeat(3990), project: "alpha" }));
  const rh = await core.fileTransmissionsBatch(owner, huge, cd.env);
  const hs = cd.log.filter((x) => x.batched && /^INSERT INTO transmission \(/.test(x.sql)).length;
  ok(rh.every((r) => r.id) && Number(D.prepare("SELECT COUNT(*) AS n FROM transmission").get().n) === 60 && hs >= 2
    && D.prepare("SELECT COUNT(*) AS n FROM transmission WHERE length(digest) = 7990 AND length(proof) = 3990").get().n === 60,
    `10 · 60 filings of ~12 KB each (a digest and a proof at their caps) are cut into ${hs} statements under the cap, every row whole`);
  // `file`: the clientRefs read once (fileItems' landed read), not again by the batch door
  const E = twin(), ce = counted(E);
  const items = Array.from({ length: 50 }, (_, i) => ({ contribution: { lane: "leader", kind: "note", what: `filed ${i}`, why: "w" } }));
  const pv = await P.previewItems(owner, { project: "alpha", items }, ce.env);
  const from = ce.log.length;
  // the preview reads the goal tree only to name a goalRef in a line: 50 lines that name no goal read none of it
  const { GOAL_TREE_SQL } = await imp("src/knowledge/goals.js");
  const treeReads = ce.log.slice(0, from).filter((x) => x.sql === GOAL_TREE_SQL).length;
  await writeKnowledge(owner, { project: "alpha", ops: [G("root")] }, ce.env);
  const pg = await P.previewItems(owner, { project: "alpha", items: [{ contribution: { lane: "leader", kind: "note", what: "moves it", why: "w", goalRef: "root" } }] }, ce.env);
  ok(pv.previewId && treeReads === 0 && pg.items && /, moves ROOT\b/.test(pg.items[0].line),
    `10 · a preview of 50 lines naming no goal reads the goal tree ${treeReads} time(s); a line with a goalRef still names the goal ("${pg.items && pg.items[0].line}")`);
  // sprint 12, 12.6: a decided question's preview carries its ruling's reason (the card draws it); an open one none
  const qd = await P.previewItems(owner, { project: "alpha", items: [
    { kind: "question", op: "upsert", data: { qid: "Q-why-1", question: "Do the two go together?", status: "decided", choice: 0, rationale: "One review covers both.", options: [{ what: "Together" }, { what: "Apart" }] } },
    { kind: "question", op: "upsert", data: { qid: "Q-why-2", question: "Which first?", status: "open", rationale: "not a ruling", options: [{ what: "A" }, { what: "B" }] } }] }, ce.env);
  const [qa, qb] = (qd && qd.items) || [];
  ok(qa && qa.verdict === "files" && qa.rationale === "One review covers both." && /together\? 2 options, decided$/.test(qa.line) && qb && !("rationale" in qb),
    `10 · a decided question's preview item carries its rationale ("${qa && qa.rationale}", "${qa && qa.line}"); an open one none`, show(qd && (qd.error ? qd : qd.items.map((x) => ({ v: x.verdict, r: x.rationale, why: x.reasons })))));
  const fl = await P.fileItems(owner, { previewId: pv.previewId, items }, ce.env);
  const refReads = ce.log.slice(from).filter((x) => /client_ref IN \(SELECT value FROM json_each/.test(x.sql)).length;
  ok(pv.previewId && fl.complete === true && fl.counts.filed === 50 && refReads === 1 && Number(E.prepare("SELECT COUNT(*) AS n FROM transmission WHERE kind <> 'knowledge'").get().n) === 50,
    `10 · file of 50 contributions reads the clientRefs ONCE (${refReads}); all 50 filed`, show({ complete: fl.complete, counts: fl.counts, error: fl.error }));
  // the replay still holds: the same file again files nothing (the preview is filed) and a raced ref is still the replay (section 5)
  const again = await P.fileItems(owner, { previewId: pv.previewId, items }, ce.env);
  ok(again.error === "preview_filed" && Number(E.prepare("SELECT COUNT(*) AS n FROM transmission WHERE kind <> 'knowledge'").get().n) === 50, "10 · the same file again files nothing (preview_filed)");
}

// ---- 11. the questions that name a node (sprint 8, 8.3b; PLATFORM §3: "the Map's inspector reads every question to find the
// ones naming a node") ----
// migrate-078's k_question_refs, kept by the database from each question's affects (text values of an array, as the inspector's own
// Array.isArray rule): equal to the affects after every write (insert, change, remove) and to migrate-078's backfill; the Map's
// inspector (src/mapnode.js readMapNode) answers the same trackedBy and reads only the questions that name the node — the old
// read returned the project's every question (the instrument: its own statement, still in src/knowledge/decisions.js, run on the
// same data).
{
  const { readMapNode } = await imp("src/mapnode.js");
  const KD = await imp("src/knowledge/decisions.js");
  const p = "qrefs";
  db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)").run(p, p, T0);
  const Q = (qid, affects, extra = {}) => ({ kind: "question", op: "upsert", data: { qid, question: `${qid}?`, status: "open", options: [{ what: "A", tradeoff: "a" }, { what: "B", tradeoff: "b" }], ...(affects ? { affects } : {}), ...extra } });
  const env = () => asOrg({ DB: d1(db), [Symbol.for("sharingu.project")]: p, BRAIN: brain() });
  const w1 = await writeKnowledge(owner, { project: p, ops: [
    { kind: "node", op: "upsert", data: { id: "screen:pay", type: "screen", name: "Pay", status: "live" } },
    { kind: "node", op: "upsert", data: { id: "screen:home", type: "screen", name: "Home", status: "live" } },
    Q("Q-1", ["screen:pay"]), Q("Q-2", ["screen:home", "screen:pay"]), Q("Q-3", ["screen:home"]), Q("Q-4", null),
    ...Array.from({ length: 30 }, (_, i) => Q(`Q-x${String(i).padStart(2, "0")}`, ["screen:home"])) ] }, env());
  // the inspector: the same trackedBy, and only the questions that name the node read
  const counting = () => { const inner = d1(db), seen = []; return { seen, env: asOrg({ DB: { batch: inner.batch, prepare: (sql) => { const s = inner.prepare(sql);
    const wrap = (x) => ({ ...x, bind: (...a) => wrap(x.bind(...a)), all: async () => { const r = await x.all(); seen.push({ sql, n: (r.results || []).length }); return r; },
      first: async () => { const r = await x.first(); seen.push({ sql, n: r ? 1 : 0 }); return r; } }); return wrap(s); } }, [Symbol.for("sharingu.project")]: p, BRAIN: brain() }) }; };
  const c = counting();
  const node = await readMapNode(c.env, owner, { ref: "screen:pay" });
  const qRead = c.seen.filter((x) => /FROM k_questions/.test(x.sql));
  const all = (await KD.decisionRows(env(), p)).filter((r) => Array.isArray(r.affects) && r.affects.includes("screen:pay")).map((r) => r.qid);
  ok(node.status === 200 && JSON.stringify(node.body.facts.trackedBy) === JSON.stringify(all) && all.join() === "Q-1,Q-2",
    `11 · the inspector's trackedBy on screen:pay is the old read's answer (${JSON.stringify(node.body.facts.trackedBy)})`, show(node.body && node.body.facts));
  const oldRows = db.prepare(KD.DECISION_ROWS_SQL).all(p).length;
  ok(qRead.length === 1 && qRead[0].sql === KD.QUESTIONS_NAMING_SQL && qRead[0].n === 2 && oldRows === 34,
    `11 · it reads ${qRead.map((x) => x.n).join("+")} question row(s) — the two that name it — where the old read (DECISION_ROWS_SQL) returned the project's ${oldRows}`, show(qRead));
  const plan = db.prepare("EXPLAIN QUERY PLAN " + KD.QUESTIONS_NAMING_SQL).all(p, "[]").map((r) => r.detail).join(" | ");
  ok(/SEARCH t USING INDEX sqlite_autoindex_k_questions_1 \(project=\? AND qid=\?\)/.test(plan) && /SEARCH r USING PRIMARY KEY \(project=\? AND ref=\?\)/.test(plan) && !/CORRELATED/.test(plan),
    `11 · the read is by key on both tables, never a walk of the questions: ${plan}`);
  const truth = () => db.prepare("SELECT DISTINCT q.project, j.value AS ref, q.qid FROM k_questions q, json_each(q.affects) j WHERE q.project = ? AND json_type(q.affects) = 'array' AND j.type = 'text' ORDER BY 2, 3").all(p).map((r) => `${r.ref}|${r.qid}`).join(",");
  const refs = () => db.prepare("SELECT ref, qid FROM k_question_refs WHERE project = ? ORDER BY 1, 2").all(p).map((r) => `${r.ref}|${r.qid}`).join(",");
  ok(!w1.error && refs() === truth() && refs().split(",").length === 34, "11 · the refs follow the questions' affects on insert (34 rows: one per question and ref)", show({ w1: w1.error, n: refs().split(",").length }));
  await writeKnowledge(owner, { project: p, ops: [Q("Q-1", ["screen:home"]), Q("Q-4", ["screen:pay"]), { kind: "question", op: "remove", data: { qid: "Q-3" } }] }, env());
  ok(refs() === truth() && /screen:home\|Q-1/.test(refs()) && !/screen:pay\|Q-1/.test(refs()) && /screen:pay\|Q-4/.test(refs()) && !/\|Q-3\b/.test(refs()),
    "11 · …on a change of affects (replaced), a question given affects, and a removed question (its refs go)");
  // the backfill (migrate-078's own statement) writes exactly what the triggers keep
  const M078 = readFileSync(join(ENGINE, "migrate-078.sql"), "utf8");
  const before = refs();
  db.prepare("DELETE FROM k_question_refs WHERE project = ?").run(p);
  db.exec(M078);   // re-runnable: the index, the table and the triggers stand; the backfill refills
  ok(refs() === before && refs() === truth(), "11 · migrate-078's backfill (the file run again) writes exactly the rows the triggers keep");
  const home = await readMapNode(env(), owner, { ref: "screen:home" });
  ok(home.status === 200 && home.body.facts.trackedBy.length === 32 && home.body.facts.trackedBy[0] === "Q-1", "11 · a node many questions name lists them all, in qid order (32)", show(home.body && home.body.facts.trackedBy.slice(0, 3)));
}

// ---- 12 · sprint 8, 8.5 (8.4's leftover): a render's or a style's new body checks the storage limit, as a file upload does ----
// (src/knowledge/write.js putBodies: src/plans.js checkPlan "storage_bytes" before any put). Org 9 on a plan of its own (1,000 bytes
// of storage): a body that takes it to 90% lands and the request's warning says storage_bytes; the next new body would pass the
// limit — refused plan_limit, nothing put, no row, no ledger row. RED THEN GREEN: the same case on a mutant copy of src/ with the
// one check removed must fail, then pass on the real code.
{
  const { mkdtempSync, cpSync, writeFileSync: wf, rmSync } = await import("node:fs");
  const CHECK = `    const quota = await checkPlan(env, "storage_bytes", { add: adding });\n    if (quota.refusal) return { refusal: quota.refusal };\n`;
  const run12 = async (srcDir) => {
    const W = await import(pathToFileURL(join(srcDir, "knowledge", "write.js")).href);
    const PL = await import(pathToFileURL(join(srcDir, "plans.js")).href);
    const d = new DatabaseSync(":memory:");
    d.exec("PRAGMA foreign_keys = ON"); d.exec(BOOT);
    d.exec(`INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) VALUES ('tiny-store', 10, 3, 1500, 1000, 60, 1000, '${T0}')`);
    d.exec(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (9, 'Tiny store', '${T0}', '${T0}', 'tiny-store')`);
    d.exec(`INSERT INTO projects (key, name, active, created_at) VALUES ('o9--web', 'Web', 1, '${T0}')`);
    d.exec(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('t-owner', 'Tia', 'tia@example.test', 'owner', 'ht', 1, '${T0}', 9)`);
    const store9 = new Map();
    const brain9 = { get: async (k) => (store9.has(k) ? { arrayBuffer: async () => new TextEncoder().encode(store9.get(k)).buffer } : null), list: async () => ({ objects: [], truncated: false }), head: async () => null,
      put: async (k, v) => { store9.set(k, typeof v === "string" ? v : new TextDecoder().decode(v)); } };
    const env9 = () => PL.installPlanNote(asOrg({ DB: d1(d), [Symbol.for("sharingu.project")]: "o9--web", BRAIN: brain9 }, 9));
    const tia = { id: "t-owner", name: "Tia", role: "owner" };
    const n9 = (sql) => Number(d.prepare(sql).get().n);
    const body = (len, c) => `<p>${c.repeat(len - 7)}</p>`;
    const e1 = env9();
    const a = await W.writeKnowledge(tia, { project: "o9--web", ops: [{ kind: "node", op: "upsert", data: { id: "screen:a", type: "screen", name: "A" } },
      { kind: "render", op: "upsert", data: { screen: "screen:a", state: "", format: "html", body: body(900, "a") } }] }, e1);
    const warn = PL.planNoteOf(e1);
    const before = { puts: store9.size, renders: n9("SELECT COUNT(*) AS n FROM k_renders"), ledger: n9("SELECT COUNT(*) AS n FROM transmission") };
    const e2 = env9();
    const b = await W.writeKnowledge(tia, { project: "o9--web", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:a", state: "two", format: "html", body: body(300, "b") } }] }, e2);
    const after = { puts: store9.size, renders: n9("SELECT COUNT(*) AS n FROM k_renders"), ledger: n9("SELECT COUNT(*) AS n FROM transmission") };
    return {
      warned: !a.error && a.written === 2 && !!warn && warn.limit === "storage_bytes" && warn.used === 900 && warn.allowed === 1000,
      refused: b.error === "plan_limit" && b.limit === "storage_bytes" && b.used === 900 && b.adding === 300 && b.allowed === 1000 && b.plan === "tiny-store"
        && after.puts === before.puts && after.renders === before.renders && after.ledger === before.ledger,
      detail: show({ a: { error: a.error, written: a.written }, warn, b, before, after }),
    };
  };
  const dir = mkdtempSync(join(ENGINE, ".knowledge-mutant-"));
  try {
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const wp = join(dir, "src", "knowledge", "write.js"), wt = readFileSync(wp, "utf8");
    ok(wt.includes(CHECK), "12 · the mutant: write.js holds the one storage check to remove");
    wf(wp, wt.split(CHECK).join(""));
    const red = await run12(join(dir, "src"));
    ok(!red.warned && !red.refused, "12 · RED: with the check removed, the 90% body lands without a warning and the body past the limit is stored", red.detail);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const green = await run12(join(ENGINE, "src"));
  ok(green.warned, "12 · GREEN: a render's new body taking the org to 900 of its 1,000 bytes lands, and the request's warning names storage_bytes (900/1000)", green.detail);
  ok(green.refused, "12 · GREEN: the next new body (300 bytes) would pass the limit: refused plan_limit {limit storage_bytes, used 900, adding 300, allowed 1000}, nothing put, no render row, no ledger row", green.detail);
}

// ---- 13 · sprint 8's review (B1): every refusal comes before a body is stored ----
// (src/knowledge/write.js: the month's items checked BEFORE putBodies; fileTransmission told so, itemsChecked). Org 9:
//   B · at the month's items limit: a render with a new body is refused plan_limit items_month — never put (no R2 call), no
//       row, no ledger row. RED THEN GREEN: the code before the fix (no check before the put, fileTransmission's own after it:
//       refused, but the body stored first) and the check removed with the flag kept (nothing checks: the write lands) each
//       fail it; the real code passes.
//   A · the goal guard's rollback and C · a put that fails partway (the bucket down at the second of two new bodies): genuine
//       failures after the put. Each answers its failure (invalid_ops goal_roots; write_failed) with no row and no ledger row;
//       a body stored before the failure MAY remain (bodies are never deleted: main's ruling), so nothing is asserted of it.
{
  const { mkdtempSync, cpSync, writeFileSync: wf, rmSync } = await import("node:fs");
  const run13 = async (srcDir) => {
    const W = await import(pathToFileURL(join(srcDir, "knowledge", "write.js")).href);
    const PL = await import(pathToFileURL(join(srcDir, "plans.js")).href);
    const d = new DatabaseSync(":memory:");
    d.exec("PRAGMA foreign_keys = ON"); d.exec(BOOT);
    d.exec(`INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) VALUES ('tiny-items', 10, 3, 100, 1000, 60, 10000000, '${T0}')`);
    d.exec(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (9, 'Tiny items', '${T0}', '${T0}', 'tiny-items')`);
    d.exec(`INSERT INTO projects (key, name, active, created_at) VALUES ('o9--web', 'Web', 1, '${T0}')`);
    d.exec(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('t-owner', 'Tia', 'tia@example.test', 'owner', 'ht', 1, '${T0}', 9)`);
    const objs = new Map();
    let puts = 0, failAt = 0;   // puts counts every put; failAt: the put (by its number) that fails once, as R2 down mid-write
    const bucket = { get: async (k) => (objs.has(k) ? { arrayBuffer: async () => new TextEncoder().encode(objs.get(k)).buffer, text: async () => objs.get(k) } : null), head: async () => null,
      put: async (k, v) => { puts++; if (failAt && puts === failAt) { failAt = 0; throw new Error("the bucket is down"); } objs.set(k, typeof v === "string" ? v : new TextDecoder().decode(v)); },
      list: async () => ({ objects: [], truncated: false }) };
    const envOn = (DB) => PL.installPlanNote(asOrg({ DB, [Symbol.for("sharingu.project")]: "o9--web", BRAIN: bucket }, 9));
    const plain = () => envOn(d1(d));
    const tia = { id: "t-owner", name: "Tia", role: "owner" };
    const n9 = (sql) => Number(d.prepare(sql).get().n);
    const render = (state, c) => ({ kind: "render", op: "upsert", data: { screen: "screen:a", state, format: "html", body: `<p>${c.repeat(40)}</p>` } });
    const w = (ops, env = plain()) => W.writeKnowledge(tia, { project: "o9--web", ops }, env);
    const s1 = await w([{ kind: "node", op: "upsert", data: { id: "screen:a", type: "screen", name: "A" } }, render("", "x")]);
    // A · the interleave (§9's): the first batch that writes k_goals first lands another write's root
    const inner = d1(d);
    let hook = async () => { await w([G("rb")]); };
    const raced = { prepare: inner.prepare, batch: async (list) => {
      if (hook && list.some((s) => /^(INSERT INTO|DELETE FROM) k_goals\b/.test(String(s && s.sql)))) { const run = hook; hook = null; await run(); }
      return inner.batch(list);
    } };
    const ledgerA = n9("SELECT COUNT(*) AS n FROM transmission WHERE org = 9");
    const a = await w([G("ra"), render("two", "z")], envOn(raced));
    const rolledBack = !s1.error && a.error === "invalid_ops" && (a.errors || []).some((x) => x.error === "goal_roots")
      && n9("SELECT COUNT(*) AS n FROM k_renders WHERE state = 'two'") === 0 && n9("SELECT COUNT(*) AS n FROM k_goals WHERE id = 'ra'") === 0
      && n9("SELECT COUNT(*) AS n FROM transmission WHERE org = 9") === ledgerA + 1;   // B's root only
    // C · a put that fails partway
    const rowsC = n9("SELECT COUNT(*) AS n FROM k_renders"), ledgerC = n9("SELECT COUNT(*) AS n FROM transmission WHERE org = 9");
    failAt = puts + 2;
    const c = await w([render("five", "v"), render("six", "u")]);
    const putFailed = c.error === "write_failed" && failAt === 0 && n9("SELECT COUNT(*) AS n FROM k_renders") === rowsC && n9("SELECT COUNT(*) AS n FROM transmission WHERE org = 9") === ledgerC;
    // B · the month's items at the limit
    d.exec("UPDATE plan_limits SET items_month = (SELECT items_month FROM org_usage WHERE org = 9) WHERE plan = 'tiny-items'");
    const before = { puts, objs: objs.size, renders: n9("SELECT COUNT(*) AS n FROM k_renders"), ledger: n9("SELECT COUNT(*) AS n FROM transmission") };
    const b = await w([render("four", "w")]);
    const after = { puts, objs: objs.size, renders: n9("SELECT COUNT(*) AS n FROM k_renders"), ledger: n9("SELECT COUNT(*) AS n FROM transmission") };
    return {
      rolledBack, putFailed,
      itemsFirst: b.error === "plan_limit" && b.limit === "items_month" && b.allowed === b.used && JSON.stringify(before) === JSON.stringify(after),
      detail: show({ s1: s1.error || "ok", a: { error: a.error, errors: (a.errors || []).map((x) => x.error) }, c: { error: c.error }, b: { error: b.error, limit: b.limit }, before, after }),
    };
  };
  const HOIST = `  const items = await checkPlan(env, "items_month", { add: 1 });\n  if (items.refusal) return { ...items.refusal, project };\n`;
  const FLAG = ["reserved: true, itemsChecked: true, project", "reserved: true, project"];
  const MUTANTS = [
    ["the code before the fix (no check before the put; fileTransmission's own after it)", [[HOIST, ""], FLAG]],
    ["the check before the put removed, the flag kept (nothing checks the items)", [[HOIST, ""]]],
  ];
  for (const [name, edits] of MUTANTS) {
    const dir = mkdtempSync(join(ENGINE, ".knowledge-mutant-"));
    try {
      cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
      const wp = join(dir, "src", "knowledge", "write.js");
      let wt = readFileSync(wp, "utf8");
      const holds = edits.every(([from]) => wt.includes(from));
      for (const [from, to] of edits) wt = wt.split(from).join(to);
      wf(wp, wt);
      const red = holds ? await run13(join(dir, "src")) : null;
      ok(holds && red && !red.itemsFirst, `13 · RED (${name}): the refusal stores nothing — fails`, red ? red.detail : "the mutant's text is not in write.js");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const green = await run13(join(ENGINE, "src"));
  ok(green.itemsFirst, "13 · GREEN: at the month's items limit a render's new body is refused plan_limit items_month — never put (no R2 call), no row, no ledger row", green.detail);
  ok(green.rolledBack, "13 · GREEN: the goal guard's rollback answers invalid_ops goal_roots — no row of the write, no ledger row (a body it stored may remain)", green.detail);
  ok(green.putFailed, "13 · GREEN: a put that fails partway answers write_failed — no row, no ledger row (a body stored before it may remain)", green.detail);
}

console.log(`${fails ? "✗" : "✓"} knowledge selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
