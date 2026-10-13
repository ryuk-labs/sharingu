// src/knowledge/write.js — the knowledge write door: save_knowledge and remove_knowledge (MCP) and their REST twins call
// writeKnowledge. One call is one project's batch of 1-200 ops: every op is checked first (src/knowledge/schema.js
// planKnowledge, against the stored rows it names), and only a batch with no error is applied, in ONE D1 batch that also
// carries the call's ONE ledger row (lane leader, kind knowledge, filed through core.js fileTransmission), so the change
// is attributed, shows on Build, and either all of it lands or none of it does. A write that applies a goal op carries the goal
// tree's rules inside that same batch too (GOAL_TREE_GUARD_SQL), so a concurrent goal write can never leave two roots.
// A render's or a style's BODY (docs/plan/ARCHITECTURE.md §11) is not a D1 row: every body in the call is checked,
// sanitised and hashed first (src/render.js prepareBodies; an image render's artifact by prepareArtifacts below), the plan
// then checks every op as before, and only then are the NEW bodies put in R2 at renders/<project>/<sha256>
// (content-addressed: the same bytes are one object, so a put is never repeated for a hash the project already indexes and
// a retry is harmless), right BEFORE the D1 batch. If that batch fails after the puts, the bodies stay in R2 unindexed:
// orphans, harmless (nothing reads a body the index does not name, and the next try puts the same keys). An upsert that
// changes nothing (the same hash, every field the same) writes nothing at all: no put, no row, and no ledger row when the
// whole call is such. A removed render leaves its body in R2 (another render, or a version's snapshot of the index, may
// name the same hash): bodies are never deleted yet — there is no garbage collection of render bodies.
// M6 (migrate-065): every body a frame has held is one of its takes (k_screen_takes, appended by the database). A render upsert
// naming a take's hash and no body RESTORES it (prepareTakes finds it in this project's takes, one statement): no body is put,
// the index row takes the take's hash, format, size and style, the trigger files it as the frame's newest take, and the call
// files its ONE ledger row like any render write. A hash this project's takes do not hold is refused unknown_render; a Partner
// is refused partner_refused (schema.js planKnowledge).
import { db } from "../data.js";
import { KINDS, KNOWLEDGE_KINDS, MAX_OPS, planKnowledge, keyOf, keyString, decodeRow, encodeValue, nounOf, cardRefOf, CARD_REFS_MAX, ownedByIn } from "./schema.js";
import { store, renderKey } from "../storage.js";   // sprint 6, 6.4: the writer's org's objects
import { PREPARED, prepareBodies, IMAGE_MAX, IMAGE_TYPES, SVG_IMAGE_NOTE, SHA_RE, removedAny } from "../render.js";
import { selectSql } from "./store.js";
import { seatsOnce, doorProject, fileTransmission, evalMarkRefused, refDigestOf, clientRefClash, activeKeysOnce } from "../core.js";
import { KNOWLEDGE_KIND } from "../transmission.js";
import { now, isEvalMark, isD1Quota } from "../util.js";
import { forgetReqMemo } from "../reqmemo.js";
import { projectSlug } from "../project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { checkPlan } from "../plans.js";   // sprint 8, 8.5 (8.4's leftover): a render's or a style's new body checks the storage limit

const IN_CHUNK = 90;           // ids per IN (…) list: D1 binds at most 100 parameters per statement
const TOUCHES_MAX = 30;        // ids the ledger row names
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const chunks = (a) => { const out = []; for (let i = 0; i < a.length; i += IN_CHUNK) out.push(a.slice(i, i + IN_CHUNK)); return out; };
// F1: the project's own cards, read only when a card's refs name one this project does not hold (the near matches: their key,
// name and who may read them, the card's list and its kind's; schema.js crossRules filters them by the writer's read rule).
// Capped at the row budget's line (sprint-4 review, L2): past it the near matches just thin out, the refusal stands.
export const CARD_POOL_MAX = 1500;
export const CARD_POOL_SQL = "SELECT c.kind, c.id, c.name, c.role_visibility, k.role_visibility AS kind_roles FROM k_cards c " +
  `LEFT JOIN k_card_kinds k ON k.project = c.project AND k.key = c.kind WHERE c.project = ?1 LIMIT ${CARD_POOL_MAX}`;
const jsonOr = (v) => { try { return v == null ? null : JSON.parse(v); } catch { return null; } };
const REPLAY_SQL = "SELECT id, kind, project, json_extract(grade, '$.refDigest') AS rd FROM transmission WHERE submitter = ? AND client_ref = ? LIMIT 1";

// writeProjectOf(person, args, env) -> { project } | a refusal. The door's own rule (core.js doorProject, as `ask` uses it),
// then the knowledge rule on top: a non-owner writes only a project they hold a seat on — doorProject stamps a seatless
// person into a single-project org's one project, which a knowledge write refuses. The owner writes any active project.
async function writeProjectOf(person, a, env) {
  const seats = await seatsOnce(env, person.id);
  const keys = seats.map((s) => s.key);
  const example = keys.length ? { example: { project: keys[0] } } : {};
  const d = await doorProject(person, { project: a.project }, seats, env);
  if (d.error) return d;
  if (!d.project) return { error: "project_required", seats: keys, ...example, note: "Add `project`: the key of the project this knowledge belongs to (`whoami` lists your projects)." };
  if (person.role !== "owner" && !keys.includes(d.project)) {
    return { error: "project_forbidden", project: d.project, seats: keys, ...example,
      note: keys.length ? `You hold no seat on "${projectSlug(d.project)}", so you cannot write its knowledge. Use \`project\`: one of [${keys.map(projectSlug).join(", ")}].`
        : `You hold no seat on "${projectSlug(d.project)}", so you cannot write its knowledge. Ask the owner for a seat.` };
  }
  return { project: d.project };
}

// loadStored(env, project, ops) -> { <kind>: Map(key -> decoded row) }: every stored row an op names, read in ONE D1
// batch — all of the project's goals when any op is a goal (the tree rules need the whole tree), every node an edge
// names (an edge's two nodes must exist), and the kind of every card named (a card's kind's roleVisibility binds it); F1: every
// card a card's refs name, and its kind (the refs must be the project's own cards, which the writer may read). Only when a
// ref names a card the project does not hold (and the batch does not file), ONE more statement reads the project's cards for
// the near matches (CARD_POOL_SQL -> stored.cardPool).
async function loadStored(env, project, ops) {
  const want = Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, new Set()]));
  const edgeFrom = new Set(), refKeys = new Set(), filed = new Set();
  for (const op of ops) {
    if (!isObj(op) || !KINDS[op.kind]) continue;
    const id = keyOf(op.kind, op.data);
    if (id == null) continue;
    want[op.kind].add(id);
    if (op.kind === "card" && op.op === "upsert") filed.add(id);
    if (op.kind === "edge") { want.node.add(op.data.from); want.node.add(op.data.to); edgeFrom.add(op.data.from); }
    if (op.kind === "card") want.card_kind.add(op.data.kind);
    // (a list longer than the cap is refused by the plan: none of it is read)
    if (op.kind === "card" && op.op === "upsert" && Array.isArray(op.data.refs) && op.data.refs.length <= CARD_REFS_MAX) for (const r of op.data.refs) {
      const c = cardRefOf(r);
      if (c) { want.card.add(c.key); want.card_kind.add(c.kind); refKeys.add(c.key); }
    }
    // a render's screen must be a screen node, and the style it names a filed style
    if (op.kind === "render") { want.node.add(op.data.screen); if (typeof op.data.style === "string" && op.data.style) want.style.add(op.data.style); }
    // a check's refs, so the preview names what it grades (a node by its id, a goal by goal/<id>, a question by q/<qid>)
    if (op.kind === "check" && Array.isArray(op.data.refs)) for (const r of op.data.refs) {
      if (typeof r !== "string") continue;
      if (r.startsWith("goal/")) want.goal.add(r.slice(5)); else if (r.startsWith("q/")) want.question.add(r.slice(2)); else want.node.add(r);
    }
  }
  const reads = [];   // [kind, statement]
  const add = (kind, where, args) => reads.push([kind, db(env).prepare(selectSql(kind) + where).bind(project, ...args)]);
  for (const kind of KNOWLEDGE_KINDS) {
    const ids = [...want[kind]];
    if (!ids.length) continue;
    const spec = KINDS[kind];
    if (!spec.key.length || kind === "goal") { add(kind, "", []); continue; }
    // one key column: its own IN list. A card (kind, id) is read by id, an edge by its from_id and a render by its screen
    // (every render of the screen: the primary key's prefix), then matched on the key.
    const [colName, vals] = kind === "card" ? ["id", ids.map((k) => k.split("|")[1])] : kind === "edge" ? ["from_id", [...edgeFrom]]
      : kind === "render" ? ["screen", ids.map((k) => k.split("|")[0])] : [spec.key[0].c, ids];
    for (const part of chunks([...new Set(vals)])) add(kind, ` AND t.${colName} IN (${part.map(() => "?").join(", ")})`, part);
  }
  const stored = Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, new Map()]));
  if (!reads.length) return stored;
  const res = await db(env).batch(reads.map((r) => r[1]));
  reads.forEach(([kind], n) => {
    for (const row of (res[n] && res[n].results) || []) {
      const item = decodeRow(kind, row);
      const id = keyString(kind, item);
      if (kind === "goal" || kind === "node" || want[kind].has(id)) stored[kind].set(id, item);
    }
  });
  if ([...refKeys].some((k) => !stored.card.has(k) && !filed.has(k))) {
    // not enumerable: every reader that walks stored by its kinds (the preview's state) never meets it
    Object.defineProperty(stored, "cardPool", { value: ((await db(env).prepare(CARD_POOL_SQL).bind(project).all()).results || [])
      .map((r) => ({ kind: r.kind, id: r.id, name: r.name, roleVisibility: jsonOr(r.role_visibility), kindRoles: jsonOr(r.kind_roles) })) });
  }
  return stored;
}

// sameAs(c, a, b) — the column holds the same stored value either way (its encoded form, as written to D1). A null is never
// "the same" (a stored value that failed to decode reads as null too), so a null is always written.
const sameAs = (c, a, b) => { const x = encodeValue(c, a); return x !== null && x === encodeValue(c, b); };

// the statements that apply one step, in order. cur: the row as stored right before this step (null when there is none),
// so an upsert's SET names only the columns whose value CHANGES: a column written with its own value would still count as
// an update of it, firing every `AFTER UPDATE OF <col>` trigger and rewriting every index on it (rows written for nothing:
// a check filed again with the same refs deleted and re-inserted every k_check_refs row and moved its lights twice, 25 rows
// written a check instead of 1). The stored row ends the same either way; updated_by and updated_at still move.
function stepStatements(env, project, who, at, s, cur = null) {
  const spec = KINDS[s.kind];
  const keyWhere = spec.key.map((c) => ` AND ${c.c} = ?`).join("");
  const keyArgs = spec.key.map((c) => s.key[c.f]);
  if (s.op === "remove") {
    const out = [];
    // a removed node takes its edges; a removed screen its renders' index rows too, by migrate-046's trigger
    // (k_nodes_screen_renders_delete: the database's own cascade, so this statement list is the same before that file runs)
    if (s.kind === "node") out.push(db(env).prepare("DELETE FROM k_edges WHERE project = ? AND (from_id = ? OR to_id = ?)").bind(project, s.id, s.id));
    out.push(db(env).prepare(`DELETE FROM ${spec.table} WHERE project = ?${keyWhere}`).bind(project, ...keyArgs));
    return out;
  }
  // an upsert merges at the database too: a new row gets every column, an existing one only the fields this op sent
  const cols = spec.cols.map((c) => c.c);
  const set = spec.cols.filter((c) => !c.key && s.present.includes(c.f) && !(cur && sameAs(c, s.row[c.f], cur[c.f]))).map((c) => `${c.c} = excluded.${c.c}`);
  const sql = `INSERT INTO ${spec.table} (project, ${cols.join(", ")}, created_by, created_at, updated_by, updated_at) ` +
    `VALUES (${Array(cols.length + 5).fill("?").join(", ")}) ` +
    `ON CONFLICT (project${spec.key.map((c) => ", " + c.c).join("")}) DO UPDATE SET ${[...set, "updated_by = excluded.updated_by", "updated_at = excluded.updated_at"].join(", ")}`;
  const out = [db(env).prepare(sql).bind(project, ...spec.cols.map((c) => encodeValue(c, s.row[c.f])), who, at, who, at)];
  return out;
}

// optionStatements(env, project, who, at, applied) — every question's options for the WHOLE batch in two statements (a
// delete and an insert over json_each), not two per question: the free plan caps the D1 queries a request may run, and
// a batch of 50 questions was 150 statements. A question's options are replaced together (the list sent is the list
// stored, A first); a removed question loses its options; the last op on a qid in the batch decides.
const OPTIONS_CHUNK_BYTES = 400000;   // a bound parameter stays far under D1's 2 MB row cap
// A question whose options end the batch exactly as stored (the same list, in order) is left alone: nothing to replace.
function optionStatements(env, project, who, at, applied, stored = null) {
  const last = new Map();   // qid -> the options it ends the batch with
  for (const s of applied) {
    if (s.kind !== "question") continue;
    if (s.op === "remove") last.set(s.id, []);
    else if (s.options) last.set(s.id, s.row.options);
  }
  const before = stored && stored.question;
  for (const [qid, options] of last) {
    const had = before && before.get(qid);
    if (had && JSON.stringify(had.options || []) === JSON.stringify(options)) last.delete(qid);
  }
  if (!last.size) return [];
  const chunks = [];
  let cur = [], bytes = 0;
  for (const [qid, options] of last) {
    const n = JSON.stringify(options).length + qid.length + 24;
    if (cur.length && bytes + n > OPTIONS_CHUNK_BYTES) { chunks.push(cur); cur = []; bytes = 0; }
    cur.push({ qid, options }); bytes += n;
  }
  chunks.push(cur);
  const out = [];
  for (const c of chunks) {
    out.push(db(env).prepare("DELETE FROM k_options WHERE project = ? AND qid IN (SELECT value FROM json_each(?))").bind(project, JSON.stringify(c.map((x) => x.qid))));
    const filled = c.filter((x) => x.options.length);
    if (filled.length) {
      out.push(db(env).prepare("INSERT INTO k_options (project, qid, idx, what, tradeoff, created_by, created_at, updated_by, updated_at) " +
        "SELECT ?, json_extract(q.value, '$.qid'), CAST(o.key AS INTEGER), json_extract(o.value, '$.what'), json_extract(o.value, '$.tradeoff'), ?, ?, ?, ? " +
        "FROM json_each(?) q, json_each(q.value, '$.options') o").bind(project, who, at, who, at, JSON.stringify(filled)));
    }
  }
  return out;
}

// ---- the goal tree's rules INSIDE the write (sprint 8, 8.3b; sprint 1's review: checked only before the batch, two concurrent
// goal writes could each pass against the tree they read and land two roots) ----
// planKnowledge checks the tree against the rows read before the write; this statement checks it again AGAINST THE ROWS AS THEY
// STAND, inside the write's own D1 batch (one transaction), right after its goal statements. A broken tree makes it ERROR — json()
// of a word that is not JSON — so the whole batch rolls back and nothing of the write lands; a sound tree reads '0' and writes
// nothing. The rules, as the plan's (schema.js): exactly one root when the project holds a goal; every parent a goal of the
// project, for the goals this write upserts (?2) and the children of the goals it removes (?3); no cycle through a goal it upserts
// (each walked up its parents, at most GOAL_TREE_MAX steps: a tree that was sound before this write can only gain a cycle through
// a parent this write set). Rows read: the roots (idx_k_goals_parent), the touched goals and their ancestors.
export const GOAL_TREE_GUARD_SQL = "SELECT json(CASE WHEN " +
  "(EXISTS (SELECT 1 FROM k_goals WHERE project = ?1) AND (SELECT COUNT(*) FROM k_goals INDEXED BY idx_k_goals_parent WHERE project = ?1 AND parent IS NULL) <> 1) " +
  "OR EXISTS (SELECT 1 FROM json_each(?2) j CROSS JOIN k_goals g ON g.project = ?1 AND g.id = j.value WHERE +g.parent IS NOT NULL " +
  "AND NOT EXISTS (SELECT 1 FROM k_goals p WHERE p.project = ?1 AND p.id = g.parent)) " +
  "OR EXISTS (SELECT 1 FROM json_each(?3) j CROSS JOIN k_goals c INDEXED BY idx_k_goals_parent ON c.project = ?1 AND c.parent = j.value " +
  "WHERE NOT EXISTS (SELECT 1 FROM k_goals p WHERE p.project = ?1 AND p.id = c.parent)) " +
  "OR EXISTS (WITH RECURSIVE up(start, id, n) AS (SELECT value, value, 0 FROM json_each(?2) UNION ALL " +
  "SELECT up.start, g.parent, up.n + 1 FROM up JOIN k_goals g ON g.project = ?1 AND g.id = up.id " +
  "WHERE g.parent IS NOT NULL AND up.n < 500 AND (up.n = 0 OR up.id <> up.start)) SELECT 1 FROM up WHERE up.n > 0 AND up.id = up.start) " +
  "THEN 'goal_tree' ELSE '0' END) AS ok";
// goalGuard(env, project, applied) -> the guard statement for a write that applies a goal op, else null
function goalGuard(env, project, applied) {
  const up = [], gone = [];
  for (const s of applied) if (s.kind === "goal") (s.op === "remove" ? gone : up).push(String(s.id));
  if (!up.length && !gone.length) return null;
  return db(env).prepare(GOAL_TREE_GUARD_SQL).bind(project, JSON.stringify([...new Set(up)]), JSON.stringify([...new Set(gone)]));
}

const tally = (m) => KNOWLEDGE_KINDS.filter((k) => m[k]).map((k) => `${m[k]} ${nounOf(k, m[k])}`).join(", ");

// planKnowledgeCall(person, { project?, ops }, env) — everything writeKnowledge checks before it writes, NOTHING written
// (sprint 3 B2: the preview). The same project rule (writeProjectOf), the same bodies prepared (sanitised and hashed, an
// image render's artifact resolved), the same stored rows read in ONE batch (loadStored) and the same plan (planKnowledge).
// -> { project, stored, plan } | the project refusal. ops must be a list (the caller checks its length).
export async function planKnowledgeCall(person, a, env) {
  const pr = await writeProjectOf(person, a, env);
  if (pr.error) return pr;
  await prepareBodies(a.ops);
  await prepareArtifacts(env, person, a.ops);
  await prepareTakes(env, pr.project, a.ops);
  const stored = await loadStored(env, pr.project, a.ops);
  await prepareOwners(env, person, pr.project, a.ops, stored);
  return { project: pr.project, stored, plan: planKnowledge(a.ops, stored, { isOwner: person.role === "owner", role: person.role || null, reader: person }) };
}
// replan(person, ops, stored) -> planKnowledge again over ops already prepared, against the SAME stored rows (pure): the
// preview re-plans without the ops that failed, to tell an op that is ready from one that relies on a failed one
export const replan = (person, ops, stored) => planKnowledge(ops, stored, { isOwner: person.role === "owner", role: person.role || null, reader: person });

// writeKnowledge(person, args, env, { via, what }) — args { project?, ops: [{ kind, op, data }], clientRef?, eval? }; via is the
// door the call came through ("mcp" | "http"), never the caller's word; what (internal callers only: a ruling, which names
// what it ruled) replaces the ledger row's counted summary. -> { project, written, removed, byKind, ledger }
// | { replay: true, project, ledger } | a refusal ({ error: "invalid_ops", errors: [...] } when any op fails its rules).
export async function writeKnowledge(person, args, env, { via = "mcp", what: summary = null } = {}) {
  const a = isObj(args) ? args : {};
  if (!Array.isArray(a.ops) || !a.ops.length) return { error: "ops_required", note: `Send ops: a list of 1 to ${MAX_OPS} {kind, op: "upsert" | "remove", data}.` };
  if (a.ops.length > MAX_OPS) return { error: "too_many_ops", max: MAX_OPS, got: a.ops.length, note: `Send at most ${MAX_OPS} ops in one call: split the batch.` };
  const pr = await writeProjectOf(person, a, env);
  if (pr.error) return pr;
  const project = pr.project;
  // G2: the eval mark only where it hides everything it marks — for knowledge, an eval project alone (core.js evalMarkRefused:
  // a knowledge row's mark is its project's) — refused before a body is stored or a row written
  if (isEvalMark(a.eval)) { const er = await evalMarkRefused(person, project, env, { knowledge: true }); if (er) return er; }

  // idempotent: this person already filed a knowledge row under this clientRef -> that row, nothing written
  const clientRef = a.clientRef != null && String(a.clientRef).trim() !== "" ? String(a.clientRef).trim().slice(0, 60) : null;
  // G2 item 7: the ops' digest rides the ledger row; the same clientRef with OTHER ops is refused, never a silent replay
  const refDigest = clientRef ? await refDigestOf({ ops: a.ops }) : null;
  if (clientRef) {
    const dup = await db(env).prepare(REPLAY_SQL).bind(person.id, clientRef).first();
    if (dup && dup.kind === KNOWLEDGE_KIND && dup.rd && dup.rd !== refDigest) return { ...clientRefClash(clientRef, dup), ledger: dup.id };
    if (dup && dup.kind === KNOWLEDGE_KIND) return { replay: true, project: dup.project ?? project, ledger: dup.id, note: "Already written under this clientRef: nothing was written again." };
    if (dup) return { error: "client_ref_taken", clientRef, ledger: dup.id, note: `This clientRef already names another of your filings (${dup.id}): send a new clientRef.` };
  }

  // the bodies: every render's and style's checked, sanitised and hashed once; an image render's artifact resolved (one
  // statement); the plan reads both off the ops (src/render.js PREPARED)
  await prepareBodies(a.ops);
  await prepareArtifacts(env, person, a.ops);
  await prepareTakes(env, project, a.ops);
  const stored = await loadStored(env, project, a.ops);
  await prepareOwners(env, person, project, a.ops, stored);
  const plan = planKnowledge(a.ops, stored, { isOwner: person.role === "owner", role: person.role || null, reader: person });
  if (plan.errors.length) {
    return { error: "invalid_ops", project, count: plan.errors.length, errors: plan.errors.slice(0, 100),
      note: "Nothing was written. Fix every op named in errors and send the whole batch again." };
  }

  const at = now();
  // a render or a style that changes nothing (the same hash and fields as stored) is not applied: no put, no row
  const unchanged = plan.steps.filter((s) => s.unchanged).length;
  const applied = plan.steps.filter((s) => (s.op === "upsert" && !s.unchanged) || (s.op === "remove" && s.existed));
  // what the sanitiser took out of the bodies, per op (the reply names it; nothing is refused for it)
  const stripped = plan.steps.filter((s) => s.prepared && removedAny(s.prepared.removed)).slice(0, 20)
    .map((s) => ({ index: s.i, kind: s.kind, id: s.id, removed: Object.fromEntries(Object.entries(s.prepared.removed).filter(([, n]) => n > 0)) }));
  const written = {}, removed = {}, byKind = {};
  for (const s of applied) {
    const m = s.op === "upsert" ? written : removed;
    m[s.kind] = (m[s.kind] || 0) + 1;
    byKind[s.kind] = (byKind[s.kind] || 0) + 1;
  }
  const nWritten = Object.values(written).reduce((x, y) => x + y, 0), nRemoved = Object.values(removed).reduce((x, y) => x + y, 0);
  const extra = { ...(unchanged ? { unchanged } : {}), ...(stripped.length ? { stripped } : {}) };
  if (!applied.length) {
    return { project, written: 0, removed: 0, byKind: {}, ledger: null, blobs: 0, ...extra,
      note: unchanged ? `Nothing changed: ${unchanged === 1 ? "the render or style sent is" : `all ${unchanged} renders and styles sent are`} stored already with the same body (the same hash) and fields.` : "Nothing changed: every remove named a row that is not there." };
  }

  // sprint 8's review (B1): the month's items, checked BEFORE any body is stored (src/plans.js checkPlan "items_month": ONE read of
  // the tally; a knowledge write is ONE ledger row, so it adds 1). At the limit nothing is put and nothing written, so a refused
  // write never leaves a body in R2 that no row names; fileTransmission is told the check ran (itemsChecked) and does not read it again
  const items = await checkPlan(env, "items_month", { add: 1 });
  if (items.refusal) return { ...items.refusal, project };
  // the new bodies, in R2 before the index rows that name them (an orphan is harmless; a row naming a missing body is not). Every
  // refusal comes before this put, so only a genuine failure after it (a put that fails partway, a failed batch, the goal guard's
  // rollback) can leave a body no row names: bodies are never deleted (that orphan is uncounted and never read)
  let blobs = 0;
  try {
    const put = await putBodies(env, project, applied);
    if (put.refusal) return { ...put.refusal, project };   // the storage limit: nothing put, nothing written
    blobs = put.put;
  } catch (e) {
    if (isD1Quota(e)) throw e;
    return { error: "write_failed", project, note: `The bodies could not be stored (${String((e && e.message) || e).slice(0, 200)}); nothing was written to the index. Send the same call again.` };
  }
  // each step against the row as it stands when its statement runs: stored, then as the steps before it leave it
  const cur = Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, new Map(stored[k])]));
  const stmts = [...applied.flatMap((s) => {
    const m = cur[s.kind], k = s.id ?? "";
    const out = stepStatements(env, project, person.id, at, s, m.get(k) || null);
    if (s.op === "remove") m.delete(k); else m.set(k, s.row);
    return out;
  }), ...optionStatements(env, project, person.id, at, applied, stored)];
  const guard = goalGuard(env, project, applied);
  if (guard) stmts.push(guard);
  const what = summary || [nWritten && `${tally(written)} written`, nRemoved && `${tally(removed)} removed`].filter(Boolean).join("; ");
  // a render is touched as its screen (its state and variant are free text: a comma in one would split the touches list)
  // sprint 7, 7.5b: the ledger row carries `at`, the moment every row of this write carries (updated_at), as its grade's batchAt
  // (src/core.js fileTransmission; its created_at is when it lands, sprint 7's review C3): a row past the first TOUCHES_MAX names
  // is still this write's by (submitter, batchAt), for as long as it holds this write (tools/ship/prune-plan.mjs)
  const touches = [...new Set(applied.map((s) => (s.id == null ? s.kind : s.kind === "render" ? `render:${s.key.screen}` : `${s.kind}:${s.id}`)))].slice(0, TOUCHES_MAX);
  let res;
  try {
    res = await fileTransmission(person, {
      lane: "leader", kind: KNOWLEDGE_KIND, what, touches, clientRef, via, eval: isEvalMark(a.eval),
      why: `The project's knowledge, written through the knowledge door (${via}).`,
    }, env, { reserved: true, itemsChecked: true, project, batch: stmts, at, ...(refDigest ? { refDigest } : {}) });
  } catch (e) {
    if (isD1Quota(e)) throw e;
    // a goal write whose batch failed: the tree may have moved under it (another write landed between this write's read and its
    // batch, and the guard above refused the batch). Planned again against the rows as they stand now, it answers the plan's own
    // refusal (goal_roots, missing_parent, goal_cycle, has_children), the answer it would have had after the other write
    if (guard) {
      const fresh = await loadStored(env, project, a.ops);
      await prepareOwners(env, person, project, a.ops, fresh);
      const again = planKnowledge(a.ops, fresh, { isOwner: person.role === "owner", role: person.role || null, reader: person });
      if (again.errors.length) return { error: "invalid_ops", project, count: again.errors.length, errors: again.errors.slice(0, 100),
        note: "Nothing was written: the goal tree changed while this write was checked (another write landed first). Fix every op named in errors against the tree as it stands (read {kind: \"goal\"}) and send the whole batch again." };
    }
    return { error: "write_failed", project, note: `The write did not complete (${String((e && e.message) || e).slice(0, 200)}). Read the kinds back before you retry; a retry with the same clientRef is safe.` };
  }
  if (res && res.error) return res;
  if (res && res.duplicate) return { replay: true, project, ledger: res.id, note: "Already written under this clientRef: nothing was written again." };
  forgetReqMemo(env, "knowledge:");   // a later read in this request (a JSON-RPC batch) sees the write
  return { project, written: nWritten, removed: nRemoved, byKind, ledger: res.id, ...(blobs || applied.some((s) => s.prepared) ? { blobs } : {}), ...extra };
}

// prepareArtifacts(env, person, ops) — every image render op naming an artifact: the artifacts read in ONE statement, then
// per op either its body (the artifact's own hash and size, and where its bytes are) or the refusal planKnowledge reports.
// The artifact must be the writer's OWN or a public one — for everyone, the owner too (review fix 6, sprint 2: the owner may
// READ any artifact, but a render publishes it to every reader of the project, so it never publishes someone else's private
// dump); anything else reads as missing_artifact (the same answer as an id that does not exist). Its type must be a raster
// picture (png, jpeg or webp: review fix 5, an SVG is refused with SVG_IMAGE_NOTE), its size at most IMAGE_MAX.
const IMAGE_KINDS = new Set(["image", "other"]);
async function prepareArtifacts(env, person, ops) {
  const want = (Array.isArray(ops) ? ops : []).filter((op) => isObj(op) && op.kind === "render" && op.op === "upsert" && isObj(op.data)
    && op.data.format === "image" && typeof op.data.artifact === "string" && op.data.artifact && op[PREPARED] === undefined);
  if (!want.length) return;
  const ids = [...new Set(want.map((op) => op.data.artifact))].slice(0, IN_CHUNK);
  const rows = (await db(env).prepare(`SELECT id, person_id, kind, r2_key, sha256, bytes, group_tag FROM artifacts WHERE id IN (${ids.map(() => "?").join(", ")}) AND org = {org}`).bind(...ids).all()).results || [];
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  for (const op of want) {
    const r = byId.get(op.data.artifact);
    const mayUse = r && (r.person_id === person.id || r.group_tag === "public");
    if (!mayUse) { op[PREPARED] = { error: { error: "missing_artifact", note: `No artifact "${String(op.data.artifact).slice(0, 80)}" that you banked: bank the picture first (save_file, or POST /artifact with its image content type) and send its id.` } }; continue; }
    if (r.kind === "svg") { op[PREPARED] = { error: { error: "bad_field", note: `Artifact ${r.id} is an SVG. ${SVG_IMAGE_NOTE}` } }; continue; }
    if (!IMAGE_KINDS.has(r.kind)) { op[PREPARED] = { error: { error: "bad_field", note: `Artifact ${r.id} is not a picture (${r.kind}): an image render names a png, jpeg or webp artifact.` } }; continue; }
    if (Number(r.bytes) > IMAGE_MAX) { op[PREPARED] = { error: { error: "too_large", note: `Artifact ${r.id} is ${Number(r.bytes).toLocaleString("en-US")} bytes; an image render is at most ${IMAGE_MAX.toLocaleString("en-US")}: bank a smaller picture.` } }; continue; }
    const head = await store(env).head(r.r2_key);   // the artifact is the writer's org's (the statement above: org = {org})
    const type = String((head && head.httpMetadata && head.httpMetadata.contentType) || "").split(";")[0].trim().toLowerCase();
    if (type === "image/svg+xml") { op[PREPARED] = { error: { error: "bad_field", note: `Artifact ${r.id} is stored as an SVG. ${SVG_IMAGE_NOTE}` } }; continue; }
    if (!head || !IMAGE_TYPES.includes(type)) { op[PREPARED] = { error: { error: "bad_field", note: `Artifact ${r.id} is not stored as a picture (${type || "its bytes are missing"}): an image render names a png, jpeg or webp artifact.` } }; continue; }
    op[PREPARED] = { hash: String(r.sha256), bytes: Number(r.bytes), sent: Number(r.bytes), contentType: type, source: r.r2_key, removed: null };
  }
}

// prepareTakes(env, project, ops) — M6 · every render upsert that restores a take (data.hash, no body, no artifact): the takes
// those hashes name in THIS project read in ONE statement (k_screen_takes on idx_k_screen_takes_hash, migrate-065; the newest
// take of each hash first), then per op either the take (its format, size and style, and the body's hash and bytes: it is in
// R2 already, renders/<project>/<hash>, so nothing is put) or the refusal planKnowledge reports: unknown_render, the same answer
// for a hash another project holds as for one nobody does (the project scope is the write's own, writeProjectOf).
export const TAKES_OF_SQL = "SELECT hash, format, bytes, width, height, style FROM k_screen_takes WHERE project = ?1 AND hash IN (SELECT value FROM json_each(?2)) ORDER BY filed_at DESC, rowid DESC";
async function prepareTakes(env, project, ops) {
  const want = (Array.isArray(ops) ? ops : []).filter((op) => isObj(op) && op.kind === "render" && op.op === "upsert" && isObj(op.data)
    && typeof op.data.hash === "string" && SHA_RE.test(op.data.hash) && op[PREPARED] === undefined && !("body" in op.data && op.data.body !== undefined) && op.data.artifact == null);
  if (!want.length) return;
  const hashes = [...new Set(want.map((op) => op.data.hash))].slice(0, IN_CHUNK);
  const rows = (await db(env).prepare(TAKES_OF_SQL).bind(project, JSON.stringify(hashes)).all()).results || [];
  const byHash = new Map();
  for (const r of rows) if (!byHash.has(String(r.hash))) byHash.set(String(r.hash), r);
  for (const op of want) {
    const r = byHash.get(op.data.hash);
    if (!r) { op[PREPARED] = { error: { error: "unknown_render", note: `No take with hash ${op.data.hash.slice(0, 12)}… is held by ${projectSlug(project)}: send the hash of one of this project's takes (map {ref: "${String(op.data.screen ?? "screen:<id>").slice(0, 80)}"} lists a screen's), or a body.` } }; continue; }
    op[PREPARED] = { hash: String(r.hash), bytes: Number(r.bytes) || 0, sent: 0, removed: null, held: true,
      take: { format: String(r.format), width: r.width == null ? null : Number(r.width), height: r.height == null ? null : Number(r.height), style: r.style == null ? null : String(r.style) } };
  }
}

// prepareOwners(env, person, project, ops, stored) — M3 · when a node op names a project in ownedBy (its own data.ownedBy, or a
// diagram part's), the projects the writer may name ride on stored.owners for the plan (schema.js crossRules): the ones they
// may READ, the rule doorProject and the switcher keep (the owner: every active project, activeKeysOnce, one statement; anyone
// else: their seats, already read for this call by writeProjectOf). A name check on the org's projects table only: nothing of
// another project is read, and a key the writer may not read is refused as one that does not exist.
async function prepareOwners(env, person, project, ops, stored) {
  const named = (Array.isArray(ops) ? ops : []).some((op) => isObj(op) && op.kind === "node" && op.op === "upsert" && isObj(op.data) && ownedByIn(op.data).length);
  if (!named) return;
  const keys = person.role === "owner" ? await activeKeysOnce(env) : (await seatsOnce(env, person.id)).map((s) => String(s.key));
  // not enumerable: every reader that walks stored by its kinds (the preview's state) never meets it
  Object.defineProperty(stored, "owners", { value: { self: project, keys } });
}

// putBodies(env, project, applied) -> { put } (how many objects were put) | { refusal }. The bodies the applied render and style
// upserts bring that are NEW to their row (a hash other than the stored one), once per hash, minus the hashes the project already
// indexes (another render or style holds the same bytes, so they are in R2: one statement), each put at renders/<project>/<hash>
// with its content type, six at a time. An image's bytes are copied from its artifact.
// THE STORAGE LIMIT (sprint 8, 8.5 — 8.4's leftover; PLATFORM §4: "the storage limit counts files and screen pictures"): before
// any put, the bodies about to be stored check the org's plan as a file upload does (src/plans.js checkPlan "storage_bytes", ONE
// read: THE storage definition, add = their bytes as stored) — this is the one place a render's or a style's body is stored.
// Past the limit nothing is put and the write is refused plan_limit (nothing of the call written); past 80% it lands and the
// door's answer carries planWarning (src/plans.js PLAN_NOTE). A body whose hash an older take of the project already holds is
// added again here (its object is put again under the same key): the check errs toward refusing, never toward over-filling.
const PUT_AT_ONCE = 6;
async function putBodies(env, project, applied) {
  const fresh = new Map();
  for (const s of applied) {
    // a restored take's body is in R2 already (M6: prepareTakes found it in this project's takes)
    if (s.op !== "upsert" || !s.prepared || !s.prepared.hash || s.prepared.hash === s.prevHash || s.prepared.held) continue;
    if (!fresh.has(s.prepared.hash)) fresh.set(s.prepared.hash, s.prepared);
  }
  if (!fresh.size) return { put: 0 };
  const hashes = JSON.stringify([...fresh.keys()]);
  const held = ((await db(env).prepare("SELECT hash FROM k_renders WHERE project = ?1 AND hash IN (SELECT value FROM json_each(?2)) " +
    "UNION SELECT hash FROM k_styles WHERE project = ?1 AND hash IN (SELECT value FROM json_each(?2))").bind(project, hashes).all()).results || []).map((r) => r.hash);
  for (const h of held) fresh.delete(h);
  const list = [...fresh.entries()];
  const adding = list.reduce((sum, [, p]) => sum + (Number(p.bytes) || 0), 0);
  if (adding > 0) {
    const quota = await checkPlan(env, "storage_bytes", { add: adding });
    if (quota.refusal) return { refusal: quota.refusal };
  }
  for (let k = 0; k < list.length; k += PUT_AT_ONCE) {
    await Promise.all(list.slice(k, k + PUT_AT_ONCE).map(async ([hash, p]) => {
      let bytes = p.body;
      if (p.source) {
        const o = await store(env).get(p.source);
        if (!o) throw new Error(`the artifact's bytes are missing (${p.source})`);
        bytes = await o.arrayBuffer();
      }
      await store(env).put(renderKey(project, hash), bytes, { httpMetadata: { contentType: p.contentType } });
    }));
  }
  return { put: list.length };
}
