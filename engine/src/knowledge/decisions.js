// src/knowledge/decisions.js — a project's questions as the question screens draw them, and the owner's ruling.
// decisionRows is the ONE reader of k_questions + k_options behind Decisions, the question page, Home's decide rows, Goals,
// the map's trackedBy and the decisions tool (they reach it through projectDecisionRows below): one
// statement, memoized per request under "knowledge:" (the write door forgets it). ruleQuestion is the ONE ruling write:
// rule_question, POST /questions/:qid/rule and decide_contribution approve on an answer (core.js, which the owner's
// respond goes through) all rule through it, and it writes through the knowledge door (write.js), so the question rules
// hold and the ruling files ONE ledger row that says what was ruled.
import { db } from "../data.js";
import { reqMemo, forgetReqMemo } from "../reqmemo.js";
import { selectSql } from "./store.js";
import { decodeRow } from "./schema.js";
import { writeKnowledge } from "./write.js";
import { seatsOnce, doorProject } from "../core.js";
import { projectOf, projectSlug } from "../project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { QID_RE } from "./schema.js";
import { now, isD1Quota } from "../util.js";

export const DECISION_ROWS_MAX = 2000;
// every question of one project, in qid order, with the options of the OPEN ones (a correlated read of k_options on its
// primary key, which the CASE skips for a ruled question: the list draws a ruled row's choice and label, never its menu,
// and on a project of ~350 ruled questions the menus were most of the rows read). One question's own read carries its menu.
export const DECISION_ROWS_SQL = "SELECT t.*, CASE WHEN t.status = 'open' THEN (SELECT json_group_array(json_object('idx', o.idx, 'what', o.what, 'tradeoff', o.tradeoff)) " +
  "FROM k_options o WHERE o.project = t.project AND o.qid = t.qid) END AS options_json FROM k_questions t WHERE t.project = ? ORDER BY t.qid LIMIT " + DECISION_ROWS_MAX;
// the open ones only: what the owner's badge and blockers read on every page. INDEXED BY is load-bearing: left to itself
// the planner walks the primary key to serve ORDER BY qid and reads every question of the project (measured: 346 rows a
// page on a project with 2 open); on (project, status) it reads the open rows alone and sorts them.
export const OPEN_QUESTION_ROWS_SQL = selectSql("question").replace(" t WHERE ", " t INDEXED BY idx_k_questions_status WHERE ") +
  " AND t.status = 'open' ORDER BY t.qid LIMIT " + DECISION_ROWS_MAX;
// sprint 5 B1 (D5L's named cut): the open questions WITHOUT their options — what the owner's blockers read at every door
// (core.js ownerOwedOnce: the badge on every page since sprint 8's 8.3b, the owner's waitingOnYou and the project picture
// every caller gets; a request that already read the open rows reuses them) and the hat brief (extract.js hatBrief). The
// options subquery read one k_options row per option per open question (saruspay: 164 rows a call against the brief's 100),
// and neither caller draws a menu. Home renders the choices and the checklist's questions-options item counts each menu, so
// they read the full rows (checklist.js openRows).
export const OPEN_QUESTION_LITE_SQL = "SELECT t.* FROM k_questions t INDEXED BY idx_k_questions_status WHERE t.project = ?" +
  " AND t.status = 'open' ORDER BY t.qid LIMIT " + DECISION_ROWS_MAX;
// one question, on the primary key: the question page, and the ruling's fresh read
export const ONE_QUESTION_SQL = selectSql("question") + " AND t.qid = ?";

export const letterOf = (i) => (Number.isInteger(i) && i >= 0 && i < 26 ? String.fromCharCode(65 + i) : String(i + 1));
// choiceIndex(v) -> an option index from 2, "2" or "C" (any case); anything else null
export function choiceIndex(v) {
  if (Number.isInteger(v)) return v >= 0 ? v : null;
  const s = typeof v === "string" ? v.trim() : "";
  if (/^\d{1,2}$/.test(s)) return Number(s);
  if (/^[A-Za-z]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
  return null;
}

// rowOf(dbRow) -> the row every question screen draws: qid, question, status, choice, label, updated (the ruling's time,
// else the last write), severity, area, why, options [{what, tradeoff}], blocks, affects, whoOwes, waitingOn, implStatus,
// supersededBy, and the ruling's rationale, decidedBy and decidedAt. Frozen: callers share it and copy to change it.
function rowOf(r) {
  const q = decodeRow("question", r);
  const list = (v) => (Array.isArray(v) ? v.map(String) : []);
  const options = q.options.map((o) => Object.freeze({ what: o.what, tradeoff: o.tradeoff == null ? "" : o.tradeoff }));
  return Object.freeze({
    qid: q.qid, question: q.question || "", status: q.status || "open", choice: q.choice, label: q.label,
    updated: q.decidedAt || q.updatedAt || null, severity: q.severity, area: q.area, why: q.why,
    options: Object.freeze(options), blocks: Object.freeze(list(q.blocks)), affects: Object.freeze(list(q.affects)),
    whoOwes: q.whoOwes, waitingOn: q.waitingOn, implStatus: q.implStatus, supersededBy: q.supersededBy,
    rationale: q.rationale, decidedBy: q.decidedBy, decidedAt: q.decidedAt,
    // where the ruling was recorded (migrate-055, the one-pass fix 6): shown quietly on the question's page
    ...(Array.isArray(q.source) && q.source.length ? { source: Object.freeze(q.source.map((s) => Object.freeze({ ...s }))) } : {}),
  });
}

const listOf = (env, project, key, sql) => (!project ? Promise.resolve(Object.freeze([]))
  : reqMemo(env, `knowledge:${project}:${key}`, async () => Object.freeze(((await db(env).prepare(sql).bind(project).all()).results || []).map(rowOf))));
// decisionRows(env, project) -> the project's question rows (above; a ruled row's options are []), [] when none is filed or
// no project is named
export const decisionRows = (env, project) => listOf(env, project, "decision-rows", DECISION_ROWS_SQL);
// openQuestionRows(env, project) -> only the open ones (with their options: Home's open face draws the choices)
export const openQuestionRows = (env, project) => listOf(env, project, "open-question-rows", OPEN_QUESTION_ROWS_SQL);
// openQuestionRowsLite(env, project) -> the open ones WITHOUT their options (B1: the updates path's blockers and the hat
// brief; decodeRow reads an absent options_json as [])
export const openQuestionRowsLite = (env, project) => listOf(env, project, "open-question-rows-lite", OPEN_QUESTION_LITE_SQL);
// sprint 8, 8.3b (PLATFORM §3: "the Map's inspector reads every question to find the ones naming a node"): the questions whose
// affects name any of the refs (?2, a JSON list), by migrate-078's k_question_refs (the database keeps it from affects), in qid
// order, without their options (the inspector draws no menu). Rows read: the refs' rows and their questions, never the list.
export const QUESTIONS_NAMING_SQL = "SELECT t.* FROM k_questions t WHERE t.project = ?1 AND t.qid IN (SELECT r.qid FROM k_question_refs r WHERE r.project = ?1 " +
  "AND r.ref IN (SELECT value FROM json_each(?2))) ORDER BY t.qid LIMIT " + DECISION_ROWS_MAX;
// questionsNaming(env, project, refs) -> the rows (rowOf, options []) of the project's questions whose affects name a ref
export async function questionsNaming(env, project, refs) {
  const list = [...new Set((refs || []).filter((r) => typeof r === "string" && r))];
  if (!project || !list.length) return [];
  return ((await db(env).prepare(QUESTIONS_NAMING_SQL).bind(project, JSON.stringify(list)).all()).results || []).map(rowOf);
}
// questionRow(env, project, qid) -> one question's row, or null
// projectDecisionRows(env) — the decision rows every question screen draws (Decisions, the question page, Home's decide
// rows, Goals, the map's trackedBy, decisions): the request's project's questions and their options in D1
// (decisionRows above, one statement, memoized per request), for the project the request reads
// (project.js projectOf). -> { version: null, publishedAt: null, project, rows }: rows [] when no question is filed, and
// for the org level (no project); { error: "unreadable" } when the read fails (a D1 quota error propagates). Each row:
// qid, question, status, choice, label, updated, severity, area, why, options [{what, tradeoff}], blocks, affects, whoOwes,
// waitingOn, implStatus, supersededBy, rationale, decidedBy, decidedAt; frozen (callers copy to change).
// copy: off-screen (the door's JSON note beside an empty read; the page says its own phrase)
export const NO_QUESTIONS_NOTE = 'No question is filed for this project yet: file one through preview then file, an item {kind: "question", op: "upsert", data: {qid, question, options: [{what}, {what}]}} (an open question needs at least two options).';
export async function projectDecisionRows(env) {
  const project = (await projectOf(env)) || null;
  try { return { version: null, publishedAt: null, project, rows: await decisionRows(env, project) }; }
  catch (e) { if (isD1Quota(e)) throw e; return { error: "unreadable", version: null, project }; }
}

export function questionRow(env, project, qid) {
  if (!project || !QID_RE.test(String(qid || ""))) return Promise.resolve(null);
  return reqMemo(env, `knowledge:${project}:question-row:${qid}`, async () => {
    const r = await db(env).prepare(ONE_QUESTION_SQL).bind(project, qid).first();
    return r ? rowOf(r) : null;
  });
}

// ruleQuestion(person, env, { project?, qid, choice, rationale?, eval?, via, expect? }) — the owner rules an OPEN question
// with one of its options. The project is the write door's (a named one, else the caller's live or single project); the
// question is read fresh there, never from the request memo. expect (a ruling from an answer filing) is the "<L>: <text>"
// the filing recorded (respond cuts it at 400 characters): when the option no longer reads so, nothing is ruled, so an
// approve never rules an option whose text the owner did not see. ONE knowledge item sets status
// decided, choice (the option's index), label (its text), decidedBy, decidedAt and the rationale when one is sent; its
// ledger row reads "<qid> ruled <L>: <text>".
// -> { project, qid, status: "decided", choice, letter, label, decidedBy, decidedAt, ledger } | a refusal: owner_only ·
// read_only_credential · unknown_qid · unknown_option · not_open, or the write door's (project_forbidden · project_required
// · invalid_ops · write_failed). Nothing is written on a refusal.
export async function ruleQuestion(person, env, a = {}) {
  if (!person || person.role !== "owner") return { error: "owner_only", note: "Only the owner rules a question. Answer it with respond: your answer waits with the owner." };
  if (person.readOnly) return { error: "read_only_credential", note: "A read-only credential cannot rule. Use your full key." };
  const qid = String(a.qid ?? "").trim();
  if (!QID_RE.test(qid)) return { error: "unknown_qid", qid: qid.slice(0, 64), note: "Name a question by its qid (`decisions` lists them)." };
  const d = await doorProject(person, { project: a.project }, await seatsOnce(env, person.id), env);
  if (d.error) return d;
  const project = d.project;
  if (!project) return { error: "project_required", note: "Add `project`: the project the question belongs to." };
  const r = await db(env).prepare(ONE_QUESTION_SQL).bind(project, qid).first();
  if (!r) return { error: "unknown_qid", project, qid, note: `No question ${qid} in ${projectSlug(project)}. \`decisions\` lists them.` };
  const q = decodeRow("question", r);
  if (q.status !== "open") return { error: "not_open", project, qid, questionStatus: q.status, note: `${qid} is ${q.status}, not open: it is already ruled.` };
  const idx = choiceIndex(a.choice);
  const opt = idx == null ? null : q.options[idx];
  if (!opt) return { error: "unknown_option", project, qid, options: q.options.length,
    note: `${qid} has ${q.options.length} options: send choice as one of their indexes (0 for A to ${q.options.length - 1} for ${letterOf(q.options.length - 1)}).` };
  const letter = letterOf(idx);
  if (a.expect != null && String(a.expect) !== `${letter}: ${opt.what}`.slice(0, 400)) {
    return { error: "unknown_option", project, qid, note: `Option ${letter} of ${qid} no longer reads as the answer filed: rule it with rule_question.` };
  }
  const rationale = a.rationale == null ? "" : String(a.rationale).trim();
  const decidedAt = now();
  const data = { qid, status: "decided", choice: idx, label: opt.what, decidedBy: person.id, decidedAt, ...(rationale ? { rationale } : {}) };
  const w = await writeKnowledge(person, { project, ops: [{ kind: "question", op: "upsert", data }], eval: a.eval },
    env, { via: a.via || "mcp", what: `${qid} ruled ${letter}: ${opt.what}`.slice(0, 400) });
  if (w.error) return w;
  forgetReqMemo(env, "decisions-live:"); forgetReqMemo(env, "owner-owed:");
  return { project, qid, status: "decided", choice: idx, letter, label: opt.what, decidedBy: person.id, decidedAt, ledger: w.ledger };
}

// ruleFromAnswer(person, row, env, { via }) — decide_contribution approve on an answer filing (kind answer, what
// "<qid> — <L>: <the option's text>", gapRefs q/<qid>: what respond files) rules the question it answers, in the filing's
// own project. -> { ruled: {...} } | { ruleError, ruleNote } (nothing ruled; the approve stands) | {} (not such a filing)
export async function ruleFromAnswer(person, t, env, { via } = {}) {
  const m = /^(\S+) — ([A-Z]): /.exec(String((t && t.what) || ""));
  if (!t || t.kind !== "answer" || !m) return {};
  const [, qid, letter] = m;
  const refs = String(t.gaprefs || "").split(",").map((x) => x.trim());
  if (!refs.includes("q/" + qid)) return {};
  // an eval-marked answer (a suite's probe) is never a ruling: the knowledge tables carry no eval mark, so ruling here would
  // decide the REAL question for good (clean-eval removes the answer row, never the ruling) and every real screen would show a
  // test's pick. The approve stands on the eval row; the question stays open. (rule_question rules on purpose, eval or not.)
  if (t.eval === 1 || t.eval === true) return { ruleError: "eval_answer", ruleNote: `${qid} was not ruled: an eval-marked answer is test data, never a ruling.` };
  if (!t.project) return { ruleError: "project_required", ruleNote: `${qid} was not ruled: the answer names no project.` };
  const res = await ruleQuestion(person, env, { project: t.project, qid, choice: letter, eval: t.eval === 1, via,
    expect: String(t.what).slice(qid.length + 3) });
  if (res.error) return { ruleError: res.error, ruleNote: `${qid} was not ruled: ${res.note || res.error}` };
  return { ruled: res };
}
