// src/decisions.js — UI-B2, J1 "ruling a question": the Decisions screen (GET /decisions), the QuestionCard
// (GET /question/:qid) and the round (POST /round), plus the option-only check POST /respond runs before it files.
// ONE module, two faces: the REST routes in src/index.js and the MCP twins in src/mcp.js (`decisions`, `round`,
// `respond`) call the SAME functions here, so a guarantee cannot hold on one door only.
//
// What it reads (and nothing else):
//   · the project's questions in D1 (k_questions + k_options, filed with preview then file): src/knowledge/decisions.js
//     projectDecisionRows -> src/knowledge/decisions.js decisionRows, one statement — severity, area, why, options, blocks,
//     whoOwes, implStatus, supersededBy and the ruling (status, choice, label, rationale, decidedAt);
//   · ONE D1 statement, the live overlay (src/hotsql.js DECISIONS_LIVE_SQL / QUESTION_LIVE_SQL), the project's own: the
//     undecided answer, round, counter and critique filings that name a question by gapRefs q/<qid> (QB953462F), plus
//     the answers decided approve, read off the transmission_refs index. Suite rows only with ?eval=1.
// A ruling is live: the owner's answer (and decide_contribution approve on an answer, and rule_question) sets the question
// decided in k_questions in the same request (src/knowledge/decisions.js ruleQuestion), so every face reads it decided on
// the next load. A member's answer leaves it open: answered, with the owner.
// Owner rulings it carries: the /respond hard cut, an OPTION of an open question and nothing else
// (QBDD22130); the round is a FILING, no table (Q187911C3); a counter is a filing with no door of its own and the
// card shows the exact MCP call (QC8B94276, QD0A65555); no typed input, a person only chooses (Q1E8D4C9C); EMPTY per
// screen, UNREACHABLE refuses a write before the press (QE9178667, Q47C9CCD3). Every region and button carries
// data-region / data-button / data-door (the wireframe's wf-decisions and wf-question, tools/wire-selftest.mjs).
import { db } from "./data.js";
import { esc, errorState, unreachableState, statusChip } from "./ui.js";
import { card, tile, tileRow, miniBars, chip, avatar, filterRow, hrefWith, group, line, lines, lineDetail, empty, pageHead, stack, cols, facts, optionCards, words, id as idCode, ago } from "./parts.js";
import { projectDecisionRows, NO_QUESTIONS_NOTE } from "./knowledge/decisions.js";
import { DECISIONS_LIVE_SQL, QUESTION_LIVE_SQL, ROUND_EXPORT_SQL, OWNER_OWED_LIVE_SQL, OPEN_LIVE_SQL } from "./hotsql.js";
import { fileTransmission, bankArtifact, projectArg, PROJECT_ARG_NOTE, seatsOnce } from "./core.js";
import { resolveProject, projectOf } from "./project.js";
import { tempoOf } from "./tempo.js";
import { isD1Quota, now } from "./util.js";
import { reqMemo, reqMemoPeek } from "./reqmemo.js";

// The exact MCP call a person's own Claude files a counter with (the wireframe's wires.counters.mcp, verbatim up to
// its note: a question is not a transmission, so a counter names it by gapRefs, never parent).
// copy: off-screen (the question JSON's counterCall; What is missing carries the calls)
export const COUNTER_CALL = 'preview {items: [{contribution: {lane, kind: "counter", gapRefs: ["q/<qid>"], what, why}}]}, then file';
// the typed question readers, loaded on first use: src/knowledge/decisions.js reaches this module back (QID_RE)
const knowledgeQuestions = () => import("./knowledge/decisions.js");
import { QID_RE } from "./knowledge/schema.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
export { QID_RE };
export const DECISION_STATUSES = ["open", "in-force", "superseded", "countered"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";   // a question holds at most 26 options (src/knowledge/schema.js)
const IN_FORCE = new Set(["decided", "provisional"]);
const GONE = new Set(["superseded", "moot"]);
const SEVERITY_RANK = { blocker: 0, high: 1, normal: 2 };
const STATUS_RANK = { open: 0, provisional: 1, decided: 2, superseded: 3, moot: 3 };

// The filed text carries em dashes; the voice law has none on glass. Rendered text only: the question as filed, and
// what a filing records, stay verbatim.
const noDash = (s) => String(s ?? "").replace(/\s*—\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const letterOf = (i) => LETTERS[i] || String(i + 1);
const dateOf = (s) => String(s || "").slice(0, 10);

// ---- the query ----
// filtersOf(q) — the Decisions filters, from a URLSearchParams-like object or a plain object (the MCP args). P3-F (P3 M5, F3):
// sort "decided" (the latest ruling first) and limit (at most this many rows) shape the JSON and the tool's rows only
// (decisionsJson); the page keeps its own order and pages. An unknown value is ignored, as the filters' are.
const DECISION_SORTS = ["decided"];
const DECISIONS_LIMIT_MAX = 500;
export function filtersOf(q) {
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : q && q[k]);
  const st = String(get("status") || "").toLowerCase();
  const clip = (v, n) => { const s = String(v ?? "").trim().toLowerCase(); return s && s.length <= n && /^[a-z0-9._ -]+$/.test(s) ? s : null; };
  const ev = get("eval");
  const so = String(get("sort") || "").trim().toLowerCase();
  const n = Math.floor(Number(get("limit")));
  return { status: DECISION_STATUSES.includes(st) ? st : null, severity: clip(get("severity"), 20), area: clip(get("area"), 60),
    eval: ev === true || ev === 1 || ev === "1" || ev === "true",
    sort: DECISION_SORTS.includes(so) ? so : null, limit: Number.isFinite(n) && n > 0 ? Math.min(n, DECISIONS_LIMIT_MAX) : null };
}
// byDecided(rows) -> the rows, the latest ruling first: a ruled row by when it was ruled (decidedAt, else its last write), the
// open ones after, each group by qid. Pure.
function byDecided(rows) {
  const at = (r) => (r.status === "open" ? "" : String(r.decidedAt || r.updated || ""));
  return rows.slice().sort((a, b) => at(b).localeCompare(at(a)) || String(a.qid).localeCompare(String(b.qid)));
}

// pageNumOf(q) -> the Decisions page asked for (?page=, 1 when absent or not a whole number from 1). The HTML page only:
// the JSON and the MCP tool answer every row, as before.
export function pageNumOf(q) {
  const v = q && typeof q.get === "function" ? q.get("page") : q && q.page;
  const s = String(v ?? "").trim();
  return /^[1-9]\d{0,4}$/.test(s) ? Number(s) : 1;
}
// The screen leads with every question that still needs an answer (open and provisional, all of them, on the first page)
// and shows the rest (decided, superseded, moot: newest first within each) DECIDED_PAGE at a time, with a real link to the
// next page: bunny's 552 questions on one page were 1 MB of HTML. The rows read do not change (one read, every row, as
// before): the counts, the filters and the bulk panel still cover the whole project.
export const DECIDED_PAGE = 50;
const NEEDS_ANSWER = new Set(["open", "provisional"]);
// pageRows(rows, page) -> { rows: the rows this page draws, page, pages, needs, settled, from, to } (rows already sorted)
export function pageRows(rows, page = 1) {
  const needs = rows.filter((r) => NEEDS_ANSWER.has(r.status)), settled = rows.filter((r) => !NEEDS_ANSWER.has(r.status));
  const pages = Math.max(1, Math.ceil(settled.length / DECIDED_PAGE));
  const p = Math.min(Math.max(1, page | 0), pages);
  const from = (p - 1) * DECIDED_PAGE, slice = settled.slice(from, from + DECIDED_PAGE);
  return { rows: p === 1 ? [...needs, ...slice] : slice, page: p, pages, needs: needs.length, settled: settled.length, from: slice.length ? from + 1 : 0, to: from + slice.length };
}

// ---- the live overlay: the filings on each question, grouped ----
// liveOf(sqlRows, readerId, ownerLabel) -> Map qid -> { answers[{by,at,option,provisional,tx}], inRound, counters[{id,by,what,at,tempo}],
//   ruled {option,by,at,tx} | null }
// answers, the round and counters come from UNDECIDED rows only. `ruled` is the latest answer DECIDED approve (the owner
// picked it on POST /respond, or approved it on /contribution/:id). Approving an answer rules its question in the same
// request, so on an OPEN question `ruled` only shows when that ruling did NOT apply (the option's text changed before the
// approve, the write failed, or a restore brought back the question from before the ruling). The question's own status is
// the truth: it is still open and still owed (owedBy), and the faces say "approved <L>, not applied: rule it".
export function liveOf(sqlRows, readerId, ownerLabel) {
  const out = new Map();
  const slot = (qid) => { if (!out.has(qid)) out.set(qid, { answers: [], inRound: false, rounds: 0, counters: [], ruled: null }); return out.get(qid); };
  for (const r of sqlRows || []) {
    const ref = String(r.ref || "");
    if (!ref.startsWith("q/")) continue;
    const s = slot(ref.slice(2));
    const kind = String(r.kind || "");
    const decision = String(r.decision || "");
    if (kind === "answer") {
      // the /respond filing's what: "<qid> — <A|B|C>: <the option's text>" (checkOptionAnswers below)
      const m = /^\S+ — ([A-Z]): /.exec(String(r.what || ""));
      const option = m ? LETTERS.indexOf(m[1]) : null;
      if (decision === "approve") {
        const at = r.decided_at || r.created_at;
        if (!s.ruled || String(at || "") >= String(s.ruled.at || "")) s.ruled = { option, by: r.by_name || "someone", at, tx: r.id, ...(r.eval ? { eval: true } : {}) };
        continue;
      }
      if (decision) continue;   // a rejected or sent-back answer is neither open nor the ruling (the SQL returns none)
      s.answers.push({ by: r.by_name || "someone", at: r.created_at, option,
        provisional: /^provisional\b/i.test(String(r.why || "")), tx: r.id, ...(r.eval ? { eval: true } : {}) });
    } else if (decision) {
      continue;                 // rounds and counters count while undecided only
    } else if (kind === "round") {
      s.rounds++;
      if (readerId && r.submitter === readerId) s.inRound = true;
    } else if (kind === "counter" || kind === "critique") {
      s.counters.push({ id: r.id, by: r.by_name || "someone", what: String(r.what || "").slice(0, 400), at: r.created_at,
        tempo: tempoOf(r, null, { ownerName: ownerLabel }), ...(r.eval ? { eval: true } : {}) });
    }
  }
  return out;
}
const NO_LIVE = () => ({ answers: [], inRound: false, rounds: 0, counters: [], ruled: null });
const publicLive = (l) => ({ answers: l.answers, inRound: l.inRound, counters: l.counters, ruled: l.ruled || null });
// ruledWord(live) -> "approved <L>, not applied: rule it" for an OPEN question whose answer was approved but whose ruling did
// not apply (liveOf's `ruled`), else "" (one string, three faces: Decisions, the QuestionCard and Home)
export function ruledWord(live) {
  const r = live && live.ruled;
  if (!r) return "";
  return `approved ${r.option == null ? "an option" : letterOf(r.option)}, not applied: rule it`;
}
// pendingAnswer(live) -> the latest non-provisional answer still waiting for the owner, or null
const pendingAnswer = (live) => [...((live && live.answers) || [])].reverse().find((a) => a && !a.provisional) || null;
// answeredWord(live) -> "answered <L>, with the owner" while a non-provisional answer waits for the owner's ruling, else ""
export function answeredWord(live) {
  const a = pendingAnswer(live);
  if (!a) return "";
  return `answered ${a.option == null ? "an option" : letterOf(a.option)}, with the owner`;
}

// ---- who owes the answer: ONE definition (UI-B3a F2) ----
// owedBy(row, reader, live) -> "you" | "code" | "elsewhere" | null. The Decisions "Open: yours" metric, the who-owes
// aside, the QuestionCard's "Owed by" and the MCP `decisions` tool all read it, so the numbers cannot disagree. The row's
// own status is the truth: a row owes nothing (null) only when it is not open. An open row whose approved answer did not
// apply (live.ruled), or with a non-provisional answer waiting on it (a member's), is the owner's to rule: "you" for the
// owner, "elsewhere" for anyone else. Otherwise the owner is row.whoOwes, else row.waitingOn (a named wait -> elsewhere):
// "owner" is "you" only for a caller whose role is owner (anyone else sees it as elsewhere); "code" and "build" are "code"
// (a scan settles it); any other named owner is "elsewhere"; a row that names nobody is null.
export function owedBy(row, reader, live) {
  if (!row || row.status !== "open") return null;
  if ((live && live.ruled) || pendingAnswer(live)) return reader && reader.role === "owner" ? "you" : "elsewhere";
  const w = String(row.whoOwes || "").trim().toLowerCase() || (String(row.waitingOn || "").trim() ? "elsewhere" : "");
  if (!w) return null;
  if (w === "owner") return reader && reader.role === "owner" ? "you" : "elsewhere";
  if (w === "code" || w === "build") return "code";
  return "elsewhere";
}

// ---- GET /decisions (and the MCP `decisions` tool without a qid) ----
const zeroCounts = () => ({ open: 0, yours: 0, inForce: 0, live: 0, pending: 0, superseded: 0, countered: 0, blocker: 0, high: 0 });
const zeroOwes = () => ({ you: 0, code: 0, elsewhere: 0 });
function sortRows(rows) {
  return rows.slice().sort((a, b) => ((STATUS_RANK[a.status] ?? 4) - (STATUS_RANK[b.status] ?? 4))
    || (a.status === "open" ? ((SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)) : 0)
    || String(b.updated || "").localeCompare(String(a.updated || "")) || a.qid.localeCompare(b.qid));
}
const matches = (r, f) => (!f.status
    || (f.status === "open" && r.status === "open") || (f.status === "in-force" && IN_FORCE.has(r.status))
    || (f.status === "superseded" && GONE.has(r.status)) || (f.status === "countered" && r.live.counters.length > 0))
  && (!f.severity || String(r.severity || "").toLowerCase() === f.severity)
  && (!f.area || String(r.area || "").toLowerCase() === f.area);

// readDecisions(env, reader, q, opts) -> the Decisions read, the request's project's questions (src/knowledge/decisions.js
// projectDecisionRows). No question filed yet is EMPTY (empty: "no_questions", its sentence names preview then file); a failed
// rows read is ERROR (error: "unreadable"); a failed live read keeps the rows and says so (live: "unreachable" ->
// UNREACHABLE, writes refused before the press); a D1 quota error propagates to the honest outage page.
// opts.open: the open questions only (the owner's badge reads the same memoized statement), for a face that shows only
// what is open (Home's decide rows): the counts then cover open rows only, and nothing is EMPTY.
export async function readDecisions(env, reader, q, opts = {}) {
  const f = filtersOf(q);
  const pr = opts.open ? await openDecisionRows(env) : await projectDecisionRows(env);
  // U-MCP D6 (Q0D506BBC): the answer names the project it READ (the request's project, or a single-project org's one
  // project); null at the org level
  const scope = pr.project || null;
  const base = { version: null, publishedAt: null, project: scope, counts: zeroCounts(), whoOwes: zeroOwes(), filter: f, rows: [] };
  if (pr.error) return { ...base, error: "unreadable" };
  if (!pr.rows.length) return { ...base, total: 0, areas: [], ...(opts.open ? {} : { empty: "no_questions" }) };
  let sqlRows = [], liveState = "ok";
  // the overlay statement is read ONCE per request per project and eval view (reqMemo): Home, the page's badge and the
  // owner's blockers (src/core.js ownerOwedOnce) all read it. A write in the request forgets it (src/mcp.js callTool,
  // src/knowledge/decisions.js ruleQuestion); a failed read is never memoized.
  // Sprint 2 (the live budget): the open-only face (Home) reads the overlay of the OPEN questions alone (OPEN_LIVE_SQL, its own
  // memo), never the whole q/ namespace; the lives of those questions are the same rows either way.
  try {
    sqlRows = opts.open
      ? await reqMemo(env, `decisions-live:open:${scope}:${f.eval ? 1 : 0}`, async () => (await db(env).prepare(OPEN_LIVE_SQL(f.eval)).bind(JSON.stringify(pr.rows.map((r) => String(r.qid))), scope).all()).results || [])
      : await reqMemo(env, `decisions-live:${scope}:${f.eval ? 1 : 0}`, async () => (await db(env).prepare(DECISIONS_LIVE_SQL(f.eval)).bind(scope).all()).results || []);
  }
  catch (e) { if (isD1Quota(e)) throw e; liveState = "unreachable"; }
  const live = liveOf(sqlRows, reader && reader.id, opts.ownerLabel);
  const all = pr.rows.map((r) => ({ ...r, live: live.get(r.qid) || NO_LIVE() }));
  const counts = zeroCounts(), owes = zeroOwes();
  for (const r of all) {
    if (r.status === "open") { counts.open++; if (r.severity === "blocker") counts.blocker++; if (r.severity === "high") counts.high++; }
    if (IN_FORCE.has(r.status)) { counts.inForce++; if (r.implStatus === "live") counts.live++; if (r.implStatus === "pending") counts.pending++; }
    if (GONE.has(r.status)) counts.superseded++;
    if (r.live.counters.length) counts.countered++;
    // who owes it: open rows only, through the ONE owedBy; "Open: yours" is the same count by construction
    const o = owedBy(r, reader, r.live);
    if (o) owes[o]++;
    if (o === "you") counts.yours++;
  }
  const rows = sortRows(all.filter((r) => matches(r, f)));
  const areas = [...new Set(all.map((r) => String(r.area || "").toLowerCase()).filter(Boolean))].sort();
  const out = { version: pr.version, publishedAt: pr.publishedAt, project: scope, counts, whoOwes: owes, filter: f, total: all.length, areas, rows,
    page: pageNumOf(q), ...(liveState !== "ok" ? { live: liveState } : {}) };
  // sprint 3 L2: when every ruling in force was decided (the glance's "Ruled · 7d" counts them whatever the filter); not
  // enumerable, so the JSON and the tool keep their shape
  Object.defineProperty(out, "decidedAts", { value: all.filter((r) => IN_FORCE.has(r.status)).map((r) => r.decidedAt || null) });
  return out;
}
// decisionsJson(read) — the wire shape of GET /decisions (the brief's, plus the filter, a live flag when the overlay failed,
// and, when no question is filed, empty "no_questions" with the note naming the op that files one). Each row carries who ruled
// it and when (decidedBy, decidedAt: null while open, or when the ruling did not record them); the filter's sort and limit
// order and cut the rows here, after the counts, which still cover every row (more: true when the limit cut some).
export function decisionsJson(d) {
  if (d.error) return { error: d.error, version: d.version };   // (an unreadable read names no rows and no project)
  const f = d.filter || {};
  const sorted = f.sort === "decided" ? byDecided(d.rows) : d.rows;
  const rows = f.limit ? sorted.slice(0, f.limit) : sorted;
  return { version: d.version, publishedAt: d.publishedAt, project: d.project || null, counts: d.counts, whoOwes: d.whoOwes, filter: d.filter,
    ...(d.empty ? { empty: d.empty, note: NO_QUESTIONS_NOTE } : {}), ...(d.live ? { live: d.live } : {}),
    ...(rows.length < sorted.length ? { more: true } : {}),
    rows: rows.map((r) => ({ qid: r.qid, status: r.status, choice: r.choice, label: r.label, severity: r.severity, area: r.area, question: r.question, options: r.options,
      blocks: r.blocks, whoOwes: r.whoOwes, waitingOn: r.waitingOn, implStatus: r.implStatus, supersededBy: r.supersededBy, updated: r.updated,
      decidedBy: r.decidedBy ?? null, decidedAt: r.decidedAt ?? null, live: publicLive(r.live) })) };
}

// ---- GET /question/:qid (and the MCP `decisions` tool with a qid) ----
// one question of the request's project (src/knowledge/decisions.js questionRow: its own statement on the primary key, never
// the whole list) and its overlay; 404 not_found for a qid this project has not filed
export async function readQuestion(env, reader, qid, q, opts = {}) {
  const f = filtersOf(q);
  if (!QID_RE.test(String(qid || ""))) return { status: 404, error: "not_found", qid: String(qid || "").slice(0, 64) };
  const project = await projectOf(env);
  let row;
  try { row = await (await knowledgeQuestions()).questionRow(env, project, qid); }
  catch (e) { if (isD1Quota(e)) throw e; return { status: 502, error: "unreadable", qid }; }
  if (!row) return { status: 404, error: "not_found", project: project || null, qid };
  let sqlRows = [], liveState = "ok";
  try { sqlRows = (await db(env).prepare(QUESTION_LIVE_SQL(f.eval)).bind("q/" + qid, project).all()).results || []; }
  catch (e) { if (isD1Quota(e)) throw e; liveState = "unreachable"; }
  const l = liveOf(sqlRows, reader && reader.id, opts.ownerLabel).get(qid) || NO_LIVE();
  // the fix-video step: a ruling names its decider by the person row (decidedBy holds the person's id when the door ruled it),
  // never the raw id; one primary-key row, only for a ruled question. A page-only field: the JSON keeps decision.decidedBy as stored
  const decider = row.status !== "open" && row.decidedBy ? ((await db(env).prepare("SELECT name FROM people WHERE id = ? AND org = {org}").bind(String(row.decidedBy)).first().catch((e) => { if (isD1Quota(e)) throw e; return null; })) || {}).name || null : null;
  return { status: 200, version: null, project, decision: row, live: publicLive(l), owed: owedBy(row, reader, l), counterCall: COUNTER_CALL,
    ...(decider ? { decidedByName: String(decider) } : {}), ...(liveState !== "ok" ? { liveState } : {}) };
}
export function questionJson(c) {
  if (c.error) return { error: c.error, qid: c.qid };
  return { version: c.version, project: c.project || null, decision: c.decision, live: c.live, counterCall: c.counterCall, ...(c.liveState ? { liveState: c.liveState } : {}) };
}

// openDecisionRows(env) -> projectDecisionRows' shape over the request's project's OPEN questions only
export async function openDecisionRows(env) {
  const project = (await projectOf(env)) || null;
  try { return { version: null, publishedAt: null, project, rows: await (await knowledgeQuestions()).openQuestionRows(env, project) }; }
  catch (e) { if (isD1Quota(e)) throw e; return { error: "unreadable", version: null, project }; }
}
// ownerOwed(env, { includeEval }) -> [{ id, title }]: the open questions the ONE owedBy says the owner owes, in the request's
// project: its open rows only, WITHOUT their options (src/knowledge/decisions.js openQuestionRowsLite, B1 — the badge
// draws no menu; on the (project, status) index) and their
// overlay, so the badge on every page never reads the whole list. core.js ownerOwedOnce. For the owner, owedBy reads only an
// open question's answers (one waiting on the owner, or one approved but not applied), so the overlay is the whole one when
// this request already read it (Decisions: readDecisions' memo; Home: its open questions' overlay, which holds every answer on
// them), and otherwise only the answers on the open
// questions (src/hotsql.js OWNER_OWED_LIVE_SQL, sprint 2: every other page read the project's whole q/ overlay for its badge).
// A failed read is [] rows or no overlay, never a throw (every owner page draws the badge); a D1 quota error propagates.
export async function ownerOwed(env, opts = {}) {
  const { includeEval = false } = opts;
  const project = await projectOf(env);
  if (!project) return [];
  let rows = [], sqlRows = null;
  try {
    // B1 (D5L's named cut) and sprint 8, 8.3b (every page's badge): owedBy reads no option, so the blockers never read the
    // menus. The open rows a page already read in full are reused (Home's choices, the checklist's questions-options item);
    // otherwise the open rows are read WITHOUT their options (lite: saruspay 47 rows against the full read's 117, on Control,
    // Activity and every page but Home)
    const kq = await knowledgeQuestions();
    const full = reqMemoPeek(env, `knowledge:${project}:open-question-rows`);
    rows = await (full || kq.openQuestionRowsLite(env, project));
  }
  catch (e) { if (isD1Quota(e)) throw e; return []; }
  if (!rows.length) return [];
  const e1 = includeEval ? 1 : 0, whole = reqMemoPeek(env, `decisions-live:${project}:${e1}`) || reqMemoPeek(env, `decisions-live:open:${project}:${e1}`);
  if (whole) { try { sqlRows = await whole; } catch (e) { if (isD1Quota(e)) throw e; sqlRows = null; } }
  if (!sqlRows) {
    // "decisions-live:" leads the key, so a write in the request forgets it with the whole overlay (src/mcp.js callTool)
    try { sqlRows = await reqMemo(env, `decisions-live:owed:${project}:${e1}`, async () => (await db(env).prepare(OWNER_OWED_LIVE_SQL(includeEval)).bind(JSON.stringify(rows.map((r) => String(r.qid))), project).all()).results || []); }
    catch (e) { if (isD1Quota(e)) throw e; sqlRows = []; }
  }
  const OWNER = { role: "owner" };
  const live = liveOf(sqlRows, null, null);
  return rows.filter((r) => owedBy(r, OWNER, live.get(r.qid) || NO_LIVE()) === "you").map((r) => ({ id: String(r.qid), title: String(r.question || r.label || r.qid) }));
}

// ---- POST /respond: an OPTION of an open question, nothing else (QBDD22130) ----
// entriesFrom(body) — the REST JSON body and the MCP arguments, one parse: {qid, option, provisional?, eval?, project?}
// or {answers:[…]}. Any free text (`answer`, a legacy `item`, an a_*/x_* field) marks the entry `text` and the whole
// call is refused option_required with nothing filed.
// U-MCP-tail-b D3/D5: every `project` (each entry's and the call's top-level one) is parsed by core.js projectArg. An entry
// carries its OWN project (`ownProject`, "" when it names none), the project it files under (`project`: its own, else the
// call's), the call's top-level project (`callProject`) and `projectBad` when any of them is not a string — so
// answerProjectOf (below) can hold ONE project per answer call.
export function entriesFrom(b) {
  const b0 = b && typeof b === "object" ? b : {};
  const top = projectArg(b0.project);
  const topKey = top.error ? "" : (top.project || "").slice(0, 80);
  const one = (x, dflt) => {
    const own = projectArg(x && typeof x === "object" ? x.project : undefined);
    const ownKey = own.error ? "" : (own.project || "").slice(0, 80);
    return { qid: x && x.qid != null ? String(x.qid).trim() : "", option: x ? x.option : undefined,
      provisional: !!(x && (x.provisional === true || x.provisional === 1 || x.provisional === "1" || x.provisional === "true")),
      eval: !!(x && (x.eval === true || x.eval === 1 || x.eval === "1")) || !!(dflt && dflt.eval),
      project: ownKey || (dflt && dflt.project) || "",
      ownProject: ownKey, callProject: topKey, ...(own.error || top.error ? { projectBad: true } : {}),
      text: !!(x && ((x.answer != null && String(x.answer).trim()) || x.item != null || Object.keys(x).some((k) => /^[ax]_/.test(k)))) };
  };
  const list = Array.isArray(b0.answers) ? b0.answers.slice(0, 50).map((x) => one(x, { eval: b0.eval === true, project: topKey })) : [];
  if (b0.qid != null || b0.option != null || b0.answer != null || b0.item != null || !list.length) list.unshift(one(b0));
  return list;
}
// answerProjectOf(entries) — D5 (U-MCP-tail-b): ONE project per answer call (respondOptions, fileRound; REST and MCP). The
// projects the entries name, and the call's top-level one, must be one project (or none); a non-string `project` or two
// different projects is the refusal project_forbidden, nothing filed. -> { project: string|null } | { error, note }
export function answerProjectOf(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.some((e) => e && e.projectBad)) return { error: "project_forbidden", note: PROJECT_ARG_NOTE + "." };
  const named = new Set();
  for (const e of list) {
    if (!e) continue;
    for (const k of [e.ownProject, e.callProject, e.ownProject === undefined && e.callProject === undefined ? e.project : ""]) {
      const v = typeof k === "string" ? k.trim().toLowerCase() : "";
      if (v) named.add(v);
    }
  }
  if (named.size > 1) return { error: "project_forbidden", projects: [...named].slice(0, 5),
    note: `One answer call answers in ONE project: this one names ${[...named].slice(0, 5).join(" and ")}. Send one call per project.` };
  return { project: named.size ? [...named][0] : null };
}
const optionIndex = (v) => {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  const s = String(v ?? "").trim();
  return /^\d{1,2}$/.test(s) ? Number(s) : null;
};
// checkOptionAnswers(env, entries) -> { answers: [respondAnswers items], picked: [...] } | { status, error, note, qid? }
// Every refusal files NOTHING: the whole call is checked before a single write.
export async function checkOptionAnswers(env, entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return { status: 422, error: "option_required", note: "Send qid and option (the option's index in the question), or answers: [{qid, option}, …]." };
  if (list.some((e) => e.text)) return { status: 422, error: "option_required", note: "An answer is one of the question's options, never typed text. Send qid and option (0 for A, 1 for B, 2 for C)." };
  if (list.some((e) => optionIndex(e.option) === null)) return { status: 422, error: "option_required", note: "option must be the index of one of the question's options (0 for A, 1 for B, 2 for C)." };
  const bad = list.find((e) => !QID_RE.test(e.qid));
  if (bad) return { status: 404, error: "unknown_qid", note: "Name a question by its qid (GET /decisions lists them).", qid: bad.qid.slice(0, 64) };
  const pr = await projectDecisionRows(env);
  if (pr.error) return { status: 404, error: "unknown_qid", note: "This project's questions could not be read, so nothing was filed. Try again.", qid: list[0].qid };
  const byQid = new Map(pr.rows.map((r) => [r.qid, r]));
  const answers = [], picked = [];
  for (const e of list) {
    const row = byQid.get(e.qid);
    if (!row) return { status: 404, error: "unknown_qid", note: `No question ${e.qid} in this project. GET /decisions lists them.`, qid: e.qid };
    if (row.status !== "open") return { status: 409, error: "not_open", note: `${e.qid} is ${row.status}, not open: it is ruled and takes no answer.`, qid: e.qid, questionStatus: row.status };
    const i = optionIndex(e.option), opt = row.options[i];
    if (!opt) return { status: 422, error: "unknown_option", note: `${e.qid} has ${row.options.length} option(s); option ${i} is not one of them.`, qid: e.qid, options: row.options.length };
    // the filed text is the question's own option text, never the body's; `letter` is what the owner's approve names
    // (src/qnaire.js respondAnswers: "ruled by option <L>") and what the ruling reads back (knowledge/decisions.js ruleFromAnswer)
    answers.push({ item: e.qid, answer: `${letterOf(i)}: ${opt.what}`, letter: letterOf(i), provisional: e.provisional, eval: e.eval, ...(e.project ? { project: e.project } : {}),
      // sprint 3 B2: an internal caller's idempotency key (src/preview.js file); entriesFrom never parses one from a caller
      ...(e.clientRef ? { clientRef: String(e.clientRef).slice(0, 60) } : {}) });
    picked.push({ qid: e.qid, option: i, letter: letterOf(i), what: opt.what, provisional: e.provisional });
  }
  return { answers, picked };
}

// ---- POST /round (Q187911C3: the round is a filing, no table) ----
// fileRound(env, reader, {qid, eval, project}) — "Add to the round": lane leader · kind round · gapRefs q/<qid>.
export async function fileRound(env, reader, a = {}) {
  const qid = String(a.qid || "").trim();
  // D3 + D5 (U-MCP-tail-b): `project` is parsed by projectArg (a non-string is project_forbidden, nothing filed); a NAMED
  // project goes through resolveProject (a seat; the owner: any active project) and the qid is validated against THAT
  // project's questions — the project the filing is stamped into, never the call's default read scope
  const pa = projectArg(a.project);
  if (pa.error) return { status: 403, ...pa };
  if (!QID_RE.test(qid)) return { status: 404, error: "unknown_qid", note: "Name a question by its qid (GET /decisions lists them)." };
  if (pa.project) {
    const sc = await resolveProject(reader, pa.project, await seatsOnce(env, reader.id), env);
    if (sc.error) return { status: 403, ...sc };
    env = sc.env;
  }
  const pr = await projectDecisionRows(env);
  if (pr.error || !pr.rows.some((r) => r.qid === qid)) return { status: 404, error: "unknown_qid", qid, note: `No question ${qid} in this project.` };
  const tx = await fileTransmission(reader, { lane: "leader", kind: "round", what: `${qid} added to the round`,
    // copy: off-screen (the round filing's own words, a record)
    why: "added to the round for the next bulk session via /round", touches: ["decisions"], gapRefs: ["q/" + qid],
    eval: !!a.eval, via: a.via || null, ...(pa.project ? { project: pa.project.slice(0, 80) } : {}) }, env);
  if (!tx || tx.error) return { status: 422, ...(tx || { error: "not_filed" }) };
  return { status: 200, filed: true, qid, tx: tx.id, route: tx.route };
}
// exportRound(env, reader, {eval, origin}) — "Export the round": ONE rounds-format JSON (the shape of the brain's
// source/board/rounds/*.json: [{key, question, area, severity, why, options, choice, provisional}], plus qid) built
// from the person's own undecided answer and round rows, banked through bankArtifact for the session to record.
export async function exportRound(env, reader, a = {}) {
  const includeEval = !!a.eval;
  const pr = await projectDecisionRows(env);
  const rows = pr.project ? (await db(env).prepare(ROUND_EXPORT_SQL(includeEval)).bind(reader.id, pr.project).all()).results || [] : [];
  const byQ = new Map();
  for (const r of rows) {
    const qid = String(r.ref || "").slice(2);
    const s = byQ.get(qid) || { choice: null, provisional: false };
    if (r.kind === "answer") {
      const m = /^\S+ — ([A-Z]): /.exec(String(r.what || ""));
      if (m) { s.choice = m[1].toLowerCase(); s.provisional = /^provisional\b/i.test(String(r.why || "")); }
    }
    byQ.set(qid, s);
  }
  // copy: off-screen (the round tool's note)
  if (!byQ.size) return { status: 200, artifact: null, href: null, count: 0, note: "Nothing is in your round yet: add a question to the round, or answer one." };
  const pub = new Map(((pr && pr.rows) || []).map((r) => [r.qid, r]));
  const round = [...byQ.entries()].filter(([qid]) => pub.has(qid)).map(([qid, s]) => {
    const r = pub.get(qid);
    return { key: qid, qid, question: r.question, area: r.area, severity: r.severity, why: r.why, options: r.options, choice: s.choice, provisional: s.provisional };
  });
  // copy: off-screen (the round tool's note)
  if (!round.length) return { status: 200, artifact: null, href: null, count: 0, note: "Your round names no question this project still holds." };
  const bytes = new TextEncoder().encode(JSON.stringify(round, null, 2) + "\n");
  const res = await bankArtifact(reader, env, { bytes, contentType: "application/json", title: `The round, ${now().slice(0, 10)}, ${round.length} question${round.length === 1 ? "" : "s"}`,
    group: includeEval ? "eval" : "decisions", isEval: includeEval, origin: a.origin || "" });
  if (!res || res.error || !res.id) return { status: (res && res.status) || 500, error: (res && res.error) || "not_banked", note: res && res.note };
  return { status: 200, artifact: res.id, href: orgPath("/artifact/") + res.id, count: round.length };
}

// ================================ the screens ================================
// Decisions, the question page, on the shared parts (the look pass, sprint 2; docs/plan/LOOK.md): the counts as one calm
// line under the title, the filters as quiet pills, the questions as rows (the chip, the question, then its id, area and
// provenance with the one quick pick on the right), who owes each answer beside them. The question page: the question,
// the why as the page's one pinned note, the options as cards to choose from with the pick form, the ruling when decided,
// and what it blocks, who owes it and its counters beside. Same reads, regions, forms and doors; semantic tokens only.
// Hooks a check reads: data-region, data-qid + data-status on an <article>, data-metric + data-value, data-owe + data-value,
// data-option (+ data-chosen) on an option card, data-ruled / data-answered / data-unapplied on a tag.
const CSS = `<style>
.dq{display:block}
.dq-bulk{position:relative}
.dq-panel{position:absolute;right:0;top:calc(100% + 8px);z-index:25;width:min(560px,90vw);max-height:70vh;overflow:auto;padding:6px 16px 16px;
  background:var(--surface);border:1px solid var(--line-strong);border-radius:12px;box-shadow:var(--shadow-pop);text-align:left}
.dq-panel fieldset{border:0;border-top:1px solid var(--line);margin:0;padding:12px 0}
.dq-panel fieldset:first-of-type{border-top:0}
.dq-panel legend{padding:0;font:500 13.5px/1.45 var(--sans);color:var(--text)}
.dq-panel legend .q-qid{margin-right:6px}
.dq-panel label{display:flex;gap:8px;align-items:flex-start;margin:7px 0 0;font-size:13px;color:var(--text-muted);cursor:pointer}
.dq-panel input{margin-top:3px;accent-color:var(--text)}
.q-qid{font:500 11.5px/1.55 var(--mono);color:var(--text-muted)}
.q-pick{max-width:200px}
.dq-flash{margin:0 0 16px;padding:10px 14px;border-radius:10px;font-size:13.5px;background:var(--ok-tint);color:var(--ok)}
.dq-flash.needs{background:var(--needs-tint);color:var(--needs)}
.q-press{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 0}
.q-press form{margin:0}
@media (max-width:760px){
  .dq .u-row{flex-wrap:wrap;gap:6px}.dq .u-row-lead{width:100%;padding:0}.q-pick{max-width:100%}
  .dq-panel{position:fixed;left:12px;right:12px;top:64px;width:auto}
}
</style>`;

const OFFLINE = `<template id="dq-offline">${unreachableState({ what: "This browser is offline, so the worker cannot be reached." })}</template>
<script>(function(){var host=document.querySelector('.dq');function down(){if(!host||host.querySelector('[data-state="unreachable"]'))return;var t=document.getElementById('dq-offline');if(t)host.insertBefore(t.content.cloneNode(true),host.firstChild);}
window.addEventListener('offline',down);if(navigator.onLine===false)down();
document.addEventListener('submit',function(e){var f=e.target;if(f&&String(f.method||'').toLowerCase()==='post'&&host&&host.querySelector('[data-state="unreachable"]')){e.preventDefault();e.stopPropagation();}},true);})();</script>`;

const IMPL_WORD = { live: "live in code", pending: "pending in code", unverifiable: "needs a scan to verify", contradicted: "the code says otherwise" };
// chosenOf(r) -> the ruled option's index (the choice as an index, or the letter older rulings carry), else null; checked
// against the options when the row carries them (the list's ruled rows carry none)
const chosenOf = (r) => {
  const c = r && r.choice, s = String(c ?? "").trim(), n = ((r && r.options) || []).length;
  const i = Number.isInteger(c) ? c : /^\d{1,2}$/.test(s) ? Number(s) : /^[a-z]$/i.test(s) ? s.toLowerCase().charCodeAt(0) - 97 : null;
  return i != null && i >= 0 && i < 26 && (!n || i < n) ? i : null;
};
const q = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v != null && v !== "" && v !== false) p.set(k, v === true ? "1" : String(v)); const s = p.toString(); return s ? "?" + s : ""; };
// OPTION_PRESS_MAX: an open question's options a list row (Decisions, Home's needs-you) offers as presses, each its own; past
// it, "See N options" opens the question. The one-pass fix 9 (owner, 2026-10-01): the row shows the options and pre-selects
// none — it used to offer option A alone, a default pick.
export const OPTION_PRESS_MAX = 4;
// optionPresses(qid, options, { next, project, eval, cls }) -> one POST /respond form per option (up to OPTION_PRESS_MAX), each
// recording that option; all alike, none first by default
export function optionPresses(qid, options, o = {}) {
  const list = Array.isArray(options) ? options.slice(0, OPTION_PRESS_MAX) : [];
  return list.map((op, i) => `<form method="POST" action="${orgPath(`/respond`)}"><input type="hidden" name="qid" value="${esc(qid)}"><input type="hidden" name="option" value="${i}"><input type="hidden" name="next" value="${esc(o.next || orgPath("/decisions"))}">${o.project ? `<input type="hidden" name="project" value="${esc(o.project)}">` : ""}${o.eval ? '<input type="hidden" name="eval" value="1">' : ""}<button class="u-btn small ghost ${o.cls || "q-pick"}" type="submit" data-button="choose-option" data-option="${letterOf(i)}" data-door="POST /respond" title="Record option ${letterOf(i)}: ${txt(op.what || op)}"><span class="u-letter">${letterOf(i)}</span><span class="u-trunc">${txt(op.what || op)}</span></button></form>`).join("");
}

// renderDecisionsPage(read, { flash, refused, reader, params }) — Decisions (sprint 3, L2: the revision, docs/plan/LOOK.md; the
// approved mock is tools/parts-gallery.mjs decisions()): the glance (open, in force, ruled in seven days with its bars,
// superseded), the ONE filter row (status, area, owed by, time; each a link, the choice kept in the address), the open
// questions (each one line that opens in place to its options, each its own press), and the rulings grouped by area (the
// newest open, the rest folded), each showing its RULING, not its label. Pure: the route hands it readDecisions()'s result,
// the reader (owed by) and the address (owed and time narrow the SAME rows). Hooks a check reads: data-region (metrics ·
// question-list · pager), data-qid + data-status on a row, data-metric + data-value (open · in-force · ruled-week ·
// superseded · yours · total), data-ruled / data-answered / data-unapplied, data-button + its door.
const DQ_CSS = `<style>
.dq .p-ld-act form{margin:0}
.dq .p-ld-act .u-btn{max-width:100%}
.dq .p-ld-act .u-trunc{display:inline-block;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}
.dq .u-letter{margin-right:6px;font:600 11.5px/1 var(--mono);color:var(--text-faint)}
.dq .p-pager{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;padding:10px 16px;border-top:1px solid var(--line);font:400 12px/1.4 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
</style>`;
const WEEK = 7 * 864e5;
export function renderDecisionsPage(d, o = {}) {
  const f = d.filter || filtersOf({});
  const keep = { severity: f.severity, area: f.area, eval: f.eval };
  const head = (actions) => pageHead({ title: "Decisions", actions });
  if (d.error) return CSS + `<section class="dq" data-screen="decisions">${head([])}${errorState({ what: "The project's questions did not load.", why: "They could not be read, so nothing here would be true.", retryHref: orgPath("/decisions") })}</section>`;
  const c = d.counts;
  const get = (k) => { const p = o.params; return p && typeof p.get === "function" ? p.get(k) : p && p[k]; };
  const OWED = { me: "you", code: "code", elsewhere: "elsewhere" };
  const owed = OWED[String(get("owed") || "")] ? String(get("owed")) : null;
  const when = ["7d", "30d"].includes(String(get("when") || "")) ? String(get("when")) : null;
  const nowMs = o.nowMs || Date.now();
  const params = { ...(f.status ? { status: f.status } : {}), ...(f.area ? { area: f.area } : {}), ...(f.severity ? { severity: f.severity } : {}), ...(owed ? { owed } : {}), ...(when ? { when } : {}), ...(f.eval ? { eval: "1" } : {}) };
  const H = (k, v) => hrefWith(orgPath("/decisions"), params, k, v);
  const reader = o.reader || null;
  const recent = (r, days) => { const t = Date.parse(String(r.updated || "")); return Number.isFinite(t) && t >= nowMs - days * 864e5; };
  const rowsAll = d.rows || [];
  const rowsNow = rowsAll.filter((r) => (!owed || owedBy(r, reader, r.live) === OWED[owed]) && (!when || recent(r, when === "7d" ? 7 : 30)));

  // ---- the head: Export the round, Answer in bulk ----
  const openRows = rowsAll.filter((r) => r.status === "open" && r.options.length);
  // D6a: Answer in bulk only when something is open to answer (a press with nothing to act on is absent)
  const bulk = !openRows.length ? "" : `<details class="dq-bulk u-details" data-button="answer-bulk" data-door="POST /respond" data-client="sends answers[] for more than one card"><summary class="u-btn small">Answer in bulk</summary>
    <div class="dq-panel"><form method="POST" action="${orgPath(`/respond`)}"><input type="hidden" name="next" value="${orgPath(`/decisions${esc(q(keep))}`)}">${f.eval ? '<input type="hidden" name="eval" value="1">' : ""}
      ${openRows.map((r) => `<fieldset><legend><span class="q-qid">${esc(r.qid)}</span> ${txt(r.question)}</legend>${r.options.map((op, i) => `<label><input type="radio" name="option_${esc(r.qid)}" value="${i}"><span><b>${letterOf(i)}</b> ${txt(op.what)}</span></label>`).join("")}</fieldset>`).join("")}
      <div class="q-press"><button class="u-btn primary" type="submit">Record these rulings</button></div></form></div></details>`;
  const exportForm = `<form method="POST" action="${orgPath(`/round`)}"><input type="hidden" name="export" value="1">${f.eval ? '<input type="hidden" name="eval" value="1">' : ""}<button class="u-btn small ghost" type="submit" data-button="export-round" data-door="POST /round">Export the round</button></form>`;

  // ---- the glance ----
  const DAY = 864e5;
  const ruledWeek = Array(7).fill(0);
  for (const at of d.decidedAts || rowsAll.filter((r) => IN_FORCE.has(r.status)).map((r) => r.decidedAt)) { const t = Date.parse(String(at || "")); if (!Number.isFinite(t) || t < nowMs - WEEK) continue; ruledWeek[6 - Math.min(6, Math.max(0, Math.floor((nowMs - t) / DAY)))]++; }
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], labels = ruledWeek.map((_, i) => DOW[new Date(nowMs - (6 - i) * DAY).getUTCDay()]);
  const ruledN = ruledWeek.reduce((a, n) => a + n, 0);
  const metrics = tileRow([
    tile({ label: "Open", value: c.open, tone: c.open ? "warn" : "", count: true, key: "open", href: H("status", "open"), sub: c.yours ? `${c.yours} yours` : "",
      attrs: `data-yours="${esc(c.yours)}"` }),
    tile({ label: "In force", value: c.inForce, count: true, key: "in-force", href: H("status", "in-force"), sub: c.pending ? `${c.pending} pending in code` : "" }),
    tile({ label: "Ruled · 7d", value: ruledN, count: true, key: "ruled-week", chart: miniBars(ruledWeek, { labels, label: "Ruled a day, the last seven days" }) }),
    tile({ label: "Superseded", value: c.superseded, count: true, key: "superseded", href: c.superseded ? H("status", "superseded") : "" }),
  ], { region: "metrics", label: "How it is going" });
  // the owed-by count a check reads (the ONE owedBy: "yours" is the open questions owed to the reader)
  const yoursHook = `<span hidden data-metric="yours" data-value="${esc(c.yours)}"></span><span hidden data-owe="you" data-value="${esc(d.whoOwes ? d.whoOwes.you : 0)}"></span>`;

  // ---- the filter row ----
  const FILTER = 'data-button="filter" data-client="filters the decisions read (links, never an input)"';
  const areaCount = new Map();
  for (const r of rowsNow) { const a = String(r.area || "").toLowerCase(); if (a) areaCount.set(a, (areaCount.get(a) || 0) + 1); }
  const areas = [...areaCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (f.area && !areaCount.has(f.area)) areas.unshift([f.area, 0]);
  const w = d.whoOwes || {};
  const filters = filterRow({ clear: hrefWith(orgPath("/decisions"), f.eval ? { eval: "1" } : {}), label: "Filter the decisions", groups: [
    { key: "status", label: "Status", items: [
      { label: "All", count: d.total, href: H("status", ""), current: !f.status, all: true, attrs: `${FILTER} data-metric="total" data-value="${esc(d.total)}"` },
      { label: "Open", count: c.open, href: H("status", f.status === "open" ? "" : "open"), current: f.status === "open", attrs: FILTER },
      { label: "In force", count: c.inForce, href: H("status", f.status === "in-force" ? "" : "in-force"), current: f.status === "in-force", attrs: FILTER },
      { label: "Superseded", count: c.superseded, href: H("status", f.status === "superseded" ? "" : "superseded"), current: f.status === "superseded", attrs: FILTER },
      { label: "Countered", count: c.countered, href: H("status", f.status === "countered" ? "" : "countered"), current: f.status === "countered", attrs: FILTER }] },
    { key: "area", label: "Area", max: 4, items: areas.map(([a, n]) => ({ label: a, count: n, href: H("area", f.area === a ? "" : a), current: f.area === a, attrs: FILTER })) },
    { key: "owed", label: "Owed by", items: [
      { label: "You", count: w.you, href: H("owed", owed === "me" ? "" : "me"), current: owed === "me", person: reader && reader.name ? { name: reader.name } : null, attrs: FILTER },
      { label: "Code", count: w.code, href: H("owed", owed === "code" ? "" : "code"), current: owed === "code", attrs: FILTER, title: "A scan of the code settles it" },
      { label: "Elsewhere", count: w.elsewhere, href: H("owed", owed === "elsewhere" ? "" : "elsewhere"), current: owed === "elsewhere", attrs: FILTER }] },
    { key: "when", label: "Time", items: [
      { label: "7 days", href: H("when", when === "7d" ? "" : "7d"), current: when === "7d", attrs: FILTER },
      { label: "30 days", href: H("when", when === "30d" ? "" : "30d"), current: when === "30d", attrs: FILTER },
      { label: "All time", href: H("when", ""), current: !when, all: true, attrs: FILTER }] },
  ] });

  // ---- the open questions ----
  const next = orgPath("/decisions") + q({ ...keep, status: f.status });
  const owedFace = (r) => {
    const ow = owedBy(r, reader, r.live);
    return ow === "you" ? avatar({ name: (reader && reader.name) || "You", size: 20 }) : ow === "code" ? chip("Code", { title: "A scan of the code settles it" })
      : ow === "elsewhere" ? chip(String(r.waitingOn || r.whoOwes || "Elsewhere"), { title: "Owed elsewhere" }) : "";
  };
  const openLine = (r) => {
    const href = orgPath(`/question/${encodeURIComponent(r.qid)}${esc(q({ eval: f.eval }))}`);
    const sev = String(r.severity || "").toLowerCase();
    const unapplied = ruledWord(r.live), pend = pendingAnswer(r.live);
    const counters = r.live.counters.length;
    const flag = unapplied ? `<span class="p-chip" data-tone="warn" data-unapplied="${esc(r.live.ruled.option == null ? "" : letterOf(r.live.ruled.option))}" title="${esc(unapplied)}">Approved ${esc(r.live.ruled.option == null ? "" : letterOf(r.live.ruled.option))}, not applied</span>`
      : pend ? `<span class="p-chip" data-tone="warn" data-answered="${esc(pend.option == null ? "" : letterOf(pend.option))}" title="${esc(answeredWord(r.live))}">Answered ${esc(pend.option == null ? "" : letterOf(pend.option))}</span>` : "";
    const facts = [["Id", idCode(r.qid)], r.area ? ["Area", esc(r.area)] : null, r.updated ? ["Asked", esc(dateOf(r.updated))] : null, ["Owed by", owedFace(r) || "nobody named"],
      sev && sev !== "normal" ? ["Severity", esc(sev)] : null, r.live.answers.length ? ["Answers", esc(r.live.answers.length)] : null,
      counters ? ["Counters", `<a class="u-link" href="${href}#counters" data-button="counters" data-door="GET /decisions" data-client="the counters filed on this question, read on its page">${esc(counters)}</a>`] : null,
      r.live.inRound ? ["Round", "in your round"] : null];
    // the row's ONE state chip (QB74B1B7E): open -> Open · High · Blocker by severity (the needs colour only for high and blocker);
    // provisional -> Provisional
    const lead = r.status === "open" ? statusChip(sev === "blocker" ? "BLOCKER" : sev === "high" ? "HIGH" : "OPEN", null, sev === "blocker" || sev === "high" ? "warn" : "quiet") : statusChip("REVIEW", "Provisional");
    return line({ attrs: `data-qid="${esc(r.qid)}" data-status="${esc(r.status)}"`, lead, title: noDash(r.question || r.label || r.qid), href, sub: r.area ? esc(r.area) : "",
      meta: `${flag}${owedFace(r)}<span>${esc(ago(r.updated, nowMs))}</span>`,
      action: `<a class="u-btn small" href="${href}" data-button="see-options" data-door="GET /question/:qid">Rule</a>`,
      detail: lineDetail({ facts, actions: r.status === "open" && r.options.length ? optionPresses(r.qid, r.options, { next, eval: !!(f.eval || r.eval) }) : "" }) });
  };
  // ---- the rulings, by area: the newest ruling's area open, the rest folded ----
  const ruledLine = (r) => {
    const i = chosenOf(r);
    const answer = noDash(r.label || (i != null && r.options && r.options[i] ? r.options[i].what : "") || "");
    const href = orgPath(`/question/${encodeURIComponent(r.qid)}${esc(q({ eval: f.eval }))}`);
    const facts = [["Id", idCode(r.qid)], r.decidedAt ? ["Ruled", esc(dateOf(r.decidedAt))] : null, IMPL_WORD[r.implStatus] ? ["In code", esc(IMPL_WORD[r.implStatus])] : null,
      r.supersededBy ? ["Superseded by", esc([].concat(r.supersededBy).join(", "))] : null, r.area ? ["Area", esc(r.area)] : null];
    return line({ attrs: `data-qid="${esc(r.qid)}" data-status="${esc(r.status)}"${i == null ? "" : ` data-ruled="${letterOf(i)}"`}`,
      // L4: a ruled row leads with a quiet "ruled" dot (the letter it was ruled with in its title): a lone "B" read as a code
      lead: `<i class="p-dot" data-tone="ok" title="${esc(i == null ? "Ruled in its own words" : `Ruled ${letterOf(i)}`)}"></i>`, title: noDash(r.question || r.label || r.qid), href,
      sub: answer ? txt(answer) : "", meta: `${GONE.has(r.status) ? statusChip("REVIEW", cap(r.status)) : r.status === "provisional" ? statusChip("REVIEW", "Provisional") : IN_FORCE.has(r.status) && r.implStatus === "pending" ? statusChip("pending", "Pending in code") : ""}<span>${esc(dayMonthShort(r.decidedAt || r.updated))}</span>`,
      detail: lineDetail({ facts, body: r.rationale ? `<p>${txt(r.rationale)}</p>` : "" }) });
  };
  const pg = pageRows(rowsNow, d.page || 1);
  const needs = pg.rows.filter((r) => NEEDS_ANSWER.has(r.status)), settled = pg.rows.filter((r) => !NEEDS_ANSWER.has(r.status));
  const byArea = new Map();
  for (const r of settled) { const a = String(r.area || "").toLowerCase() || "no area"; if (!byArea.has(a)) byArea.set(a, []); byArea.get(a).push(r); }
  const lastOf = (xs) => xs.reduce((m, r) => (String(r.decidedAt || r.updated || "") > m ? String(r.decidedAt || r.updated || "") : m), "");
  const areaGroups = [...byArea].sort((a, b) => lastOf(b[1]).localeCompare(lastOf(a[1])));
  // L4: a group's count is the area's TRUE total of settled rulings (every page, the filter chips' own count), and a group that
  // continues on another page says how many more there are (a link to the area, filtered)
  const areaTotal = new Map();
  for (const r of rowsNow) if (!NEEDS_ANSWER.has(r.status)) { const a = String(r.area || "").toLowerCase() || "no area"; areaTotal.set(a, (areaTotal.get(a) || 0) + 1); }
  const pageHref = (n) => orgPath(`/decisions${esc(q({ project: d.project || null, ...keep, status: f.status, owed, when, page: n > 1 ? n : null }))}`);
  const pager = pg.pages > 1 ? `<nav class="p-pager" data-region="pager" aria-label="Pages of settled decisions" data-page="${pg.page}" data-pages="${pg.pages}">
    ${pg.page > 1 ? `<a class="u-btn small ghost" href="${pageHref(pg.page - 1)}" rel="prev" data-button="page-newer">Newer</a>` : "<span></span>"}<span>${pg.from}–${pg.to} of ${pg.settled}</span>
    ${pg.page < pg.pages ? `<a class="u-btn small" href="${pageHref(pg.page + 1)}" rel="next" data-button="page-older">Older</a>` : "<span></span>"}</nav>` : "";
  // the Open card's count agrees with the Open tile: the provisional rulings it also lists are counted apart
  const openCountOf = (xs) => { const nP = xs.filter((r) => r.status === "provisional").length, nO = xs.length - nP; return nP ? `${nO} + ${nP} provisional` : nO; };
  let list;
  if (d.empty === "no_questions") list = card({ label: "Questions", flush: true, body: empty("No questions yet", { action: { href: orgPath("/missing"), label: "What is missing" } }) });
  else if (!rowsNow.length) list = card({ label: "Questions", flush: true, body: empty("Nothing matches", { action: { href: hrefWith(orgPath("/decisions"), f.eval ? { eval: "1" } : {}), label: "Every decision" } }) });
  else list = (needs.length ? card({ label: "Open", count: openCountOf(needs), tone: "needs", flush: true, region: "open", body: lines(needs.map(openLine), { lead: 72 }), attrs: 'data-reveal="2"' }) : "")
    + (settled.length || pager ? card({ label: "Ruled", count: pg.settled, flush: true, region: "ruled", attrs: 'data-reveal="3"',
      body: areaGroups.map(([a, xs], i) => { const tot = areaTotal.get(a) || xs.length, rest = tot - xs.length;
        return group({ title: a, count: tot, open: i === 0, attrs: `data-area="${esc(a)}" data-shown="${esc(xs.length)}"`, summary: `<span>last ${esc(dayMonthShort(lastOf(xs)))}</span>`,
          body: lines(xs.map(ruledLine), { lead: 28 }) + (rest > 0 && a !== "no area" ? `<p class="p-empty"><a class="u-link" href="${esc(H("area", a))}" data-more="${esc(rest)}">${esc(rest)} more</a></p>` : rest > 0 ? `<p class="p-empty"><span data-more="${esc(rest)}">${esc(rest)} more</span></p>` : "") }); }).join("") + pager }) : "");
  const banner = (d.live === "unreachable" ? unreachableState({ what: "The live answers and counters could not be read." }) : "") + flashOf(o);
  // no question filed: the list's one phrase (and the glance's hooks, hidden), never a strip of zeros
  const none = d.empty === "no_questions";
  const glance = none ? `<span hidden data-region="metrics">${metricHooks(c, d.total)}</span>` : stack(metrics, filters);
  return CSS + DQ_CSS + `<section class="dq" data-screen="decisions">${head([exportForm, bulk].filter(Boolean))}${banner}${stack(glance, `<div class="p-stack" data-region="question-list">${list}</div>`)}${yoursHook}</section>` + OFFLINE;
}
const metricHooks = (c, total) => ["open", "inForce", "superseded"].map((k) => `<span data-metric="${k === "inForce" ? "in-force" : k}" data-value="${esc(c[k] || 0)}"></span>`).join("") + `<span data-metric="total" data-value="${esc(total || 0)}"></span>`;
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMonthShort = (iso) => { const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return ""; const x = new Date(t); return `${x.getUTCDate()} ${MON3[x.getUTCMonth()]}`; };
const cap = (w) => { const s = String(w || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

const REFUSED = {
  option_required: "Pick an option first",
  unknown_option: "That option is not one of this question's options.",
  unknown_qid: "That question is not in this project.",
  not_open: "This question is already ruled, so it takes no answer.",
  project_required: "Name the project first",
  round_empty: "Nothing in your round yet",
  not_filed: "That did not file",
};
function flashOf(o) {
  if (o.refused) return errorState({ what: REFUSED[o.refused] || "Not recorded", why: "Nothing was filed." });
  if (o.txerror) return errorState({ what: REFUSED[o.txerror] || "The answer did not file as a contribution.", why: "The answer was kept, but it did not file; fix that and choose again." });
  if (o.ruled) return `<p class="dq-flash" role="status">Ruled</p>`;
  if (o.filed) return `<p class="dq-flash" role="status">Recorded, not yet ruled</p>`;
  if (o.rounded) return `<p class="dq-flash" role="status">Added to your round</p>`;
  return "";
}

// sameWords(a, b) -> true when two phrasings say the same thing (most of their words shared): the ruling's label and the
// chosen option's own words often differ by a phrase ("to the shelf"), and then the page says it once
function sameWords(a, b) {
  const w = (x) => new Set(String(x || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter(Boolean));
  const A = w(a), B = w(b);
  if (!A.size || !B.size) return false;
  let both = 0; for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both) >= 0.7;
}
// sourceLabels(source) -> where a record was recorded, in its own labels ("Ruled by the owner · B7: …"): a link keeps its
// label as the link; an entry with no label is left to `source` (a bare hash or path is not a reader's words)
function sourceLabels(src) {
  const list = (Array.isArray(src) ? src : []).filter((x) => x && typeof x.ref === "string" && x.ref.trim());
  const one = (x) => {
    const ref = x.ref.trim(), label = typeof x.label === "string" ? x.label.trim() : "", kind = String(x.kind || "");
    const art = kind === "artifact" ? ref.replace(/^\/artifact\//, "") : "";
    if (art && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(art)) return `<a class="u-link" href="${orgPath(`/view?src=${encodeURIComponent("/artifact/" + art)}`)}" data-source="artifact">${esc(label || "the artifact")}</a>`;
    if (kind === "url" && /^https?:\/\/\S+$/i.test(ref)) return `<a class="u-link" href="${esc(ref)}" rel="noopener noreferrer" target="_blank" data-source="url">${esc(label || "a link")}</a>`;
    return label ? `<span data-source="${esc(kind)}">${esc(label)}</span>` : "";
  };
  return list.map(one).filter(Boolean).join('<span class="u-source-sep" aria-hidden="true"> · </span>');
}
// renderQuestionPage(card, { flash, refused, eval, reader, nowMs }) — one question (sprint 3, L3: the revision, docs/plan/LOOK.md;
// the approved mock is tools/parts-gallery.mjs question()): the head (Decisions / area / qid, the question, Add to the round),
// the facts (status, owed by, area, asked, what waits on it, answers, counters), the options as cards side by side, each its own
// POST /respond form (the owner's press rules it, a member's files an answer; Provisional files the same answer marked
// provisional), the answers filed with faces, the why in the filer's own words with its source; beside them what it blocks and
// the counters standing. A ruled question shows its RULING first and folds the options it considered. No counter call (pristine
// copy). Hooks a check reads: the regions why · options · what-blocks · provenance · counters (and answers, ruling), data-option
// (+ data-chosen) on an option, data-ruling="label" on a ruling in its own words, data-unapplied / data-answered on the status
// chip, the record-ruling · mark-provisional · add-to-round · counters buttons on their doors. Pure.
// a person's id as the door stores it (a uuid, a seeded org-<role>-NNNN, a suites' eval-fixed-<uuid>): never shown as a name
const PERSON_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|org-[a-z]+-\d+|eval-fixed-\S+)$/i;
const Q_CSS = `<style>
.dq .dq-ruling{margin:0;font:700 17px/1.4 var(--sans);color:var(--text);letter-spacing:-.01em}
.dq .dq-ruling .u-letter{margin-right:8px;font:600 13px/1 var(--mono);color:var(--ok)}
.dq .p-opts+.p-opts{margin-top:12px}
.dq .p-group-body>.p-opts{padding:12px 16px 16px}
</style>`;
export function renderQuestionPage(c, o = {}) {
  const crumbsBase = [{ label: "Decisions", href: orgPath("/decisions") }];
  if (c.error) {
    const body = c.error === "unreadable" ? errorState({ what: "This question did not load.", why: "The project's questions could not be read.", retryHref: orgPath("/decisions") })
      : empty(`No question ${c.qid || ""} here`, { action: { href: orgPath("/decisions"), label: "Decisions" } });
    return CSS + Q_CSS + `<section class="dq" data-screen="question">${pageHead({ title: "Question", crumbs: [...crumbsBase, { label: String(c.qid || "") }] })}${card({ body })}</section>`;
  }
  const r = c.decision, live = c.live, open = r.status === "open";
  const ev = o.eval || r.eval;
  const nowMs = o.nowMs || Date.now();
  const isOwner = !!(o.reader && o.reader.role === "owner");
  const self = orgPath(`/question/${encodeURIComponent(r.qid)}${q({ eval: !!ev })}`);
  const hiddenEval = ev ? '<input type="hidden" name="eval" value="1">' : "";
  const roundForm = `<form id="dq-round" method="POST" action="${orgPath(`/round`)}" hidden><input type="hidden" name="qid" value="${esc(r.qid)}"><input type="hidden" name="next" value="${esc(self)}">${hiddenEval}</form>`;
  const roundBtn = `<button class="u-btn small" type="submit" form="dq-round" data-button="add-to-round" data-door="POST /round"${live.inRound ? " disabled" : ""}>${live.inRound ? "In the round" : "Add to the round"}</button>`;
  const head = pageHead({ title: noDash(r.question || r.label || r.qid), crumbs: [...crumbsBase, r.area ? { label: r.area, href: orgPath(`/decisions?area=${encodeURIComponent(String(r.area).toLowerCase())}`) } : null, { label: "Question" }].filter(Boolean), actions: [roundBtn] });   // L4: the last crumb is what the page is, never its raw id

  // ---- the facts (region provenance): status, owed by, area, asked, blocks, answers, counters ----
  const chosen = open ? null : chosenOf(r);
  const ruledByLabel = !open && !r.options.length && !!String(r.label || "").trim();
  const pending = open && !live.ruled ? pendingAnswer(live) : null;
  const ruledNow = open ? ruledWord(live) : "";
  const cap1 = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
  const statusHtml = ruledNow
    ? `<span class="p-chip" data-tone="warn" data-unapplied="${esc(live.ruled.option == null ? "" : letterOf(live.ruled.option))}" title="${esc(`${cap1(ruledNow)}. ${noDash(live.ruled.by)} chose it, approved ${dateOf(live.ruled.at)}`)}">Approved ${esc(live.ruled.option == null ? "" : letterOf(live.ruled.option))}, not applied</span>`
    : pending ? `<span class="p-chip" data-tone="warn" data-answered="${esc(pending.option == null ? "" : letterOf(pending.option))}" title="${esc(`${cap1(answeredWord(live))}: ${noDash(pending.by)} chose it on ${dateOf(pending.at)}`)}">Answered ${esc(pending.option == null ? "" : letterOf(pending.option))}</span>`
    : open ? statusChip(String(r.severity || "").toLowerCase() === "blocker" ? "BLOCKER" : String(r.severity || "").toLowerCase() === "high" ? "HIGH" : "OPEN", String(r.severity || "").toLowerCase() === "blocker" ? "Blocker" : String(r.severity || "").toLowerCase() === "high" ? "High" : "Open")
    : r.status === "provisional" ? statusChip("REVIEW", "Provisional")
    : IN_FORCE.has(r.status) ? statusChip("LANDED", chosen != null ? `Ruled ${letterOf(chosen)}` : "Ruled")
    : statusChip("REVIEW", cap(r.status));
  const owed = c.owed !== undefined ? c.owed : owedBy(r, null, live);
  const named = String(r.whoOwes || r.waitingOn || "").trim();
  const unapplied = open && !!live.ruled;
  // copy: off-screen (the Owed by cell's title)
  const oweWord = owed === "you" ? (unapplied ? "You: an approved answer did not apply, rule it" : pending ? "You: an answer waits for your ruling" : "You") : owed === "code" ? "Code: a scan settles it"
    : owed === "elsewhere" ? (unapplied ? "The owner: an approved answer did not apply" : pending ? "The owner: an answer is filed" : `Waiting on ${named || "something else"}`)
    : !open ? "Nobody: it is settled" : "Nobody is named";
  const owedHtml = owed === "you" ? `${avatar({ name: (o.reader && o.reader.name) || "You", size: 20 })}You` : owed === "code" ? "Code"
    : owed === "elsewhere" ? (unapplied || pending ? "The owner" : esc(noDash(named || "Elsewhere"))) : "–";
  // the decider by NAME (the person row readQuestion read), else the words the ruling was filed with; never a person's raw id
  const decider = !open ? noDash(c.decidedByName || (r.decidedBy && !PERSON_ID.test(String(r.decidedBy)) ? r.decidedBy : "")) : "";
  const counters = live.counters || [];
  const provenance = facts([
    { label: "Status", html: statusHtml, attrs: `data-status="${esc(r.status || "")}"` },
    // a ruled question owes nothing: the cell names who ruled it ("Ruled by"), or is left out when nobody is named (the parts'
    // facts pattern: a fact that does not apply is absent, never a dash)
    open ? { label: "Owed by", html: owedHtml, title: oweWord } : decider ? { label: "Ruled by", html: `${avatar({ name: decider, size: 20 })}${txt(decider)}`, attrs: 'data-field="ruled-by"' } : null,
    { label: "Area", value: r.area || "–" },
    { label: open ? "Asked" : "Ruled", value: dayMonthShort(open ? r.updated : r.decidedAt || r.updated) || "–", title: dateOf(open ? r.updated : r.decidedAt || r.updated) },
    live.answers.length ? { label: "Answers", value: String(live.answers.length) } : null,
    !open && IMPL_WORD[r.implStatus] ? { label: "In code", value: IMPL_WORD[r.implStatus] } : null,
    { label: "Counters", html: `<a class="u-link" href="#counters" data-button="counters" data-door="GET /question/:qid" data-client="jumps to the counters filed on this question">${esc(counters.length)}</a>` },
  ], { region: "provenance" });

  // ---- the options: each its own form (open), or the ruling first and the options it considered, folded ----
  const optionsOf = (withForms) => optionCards({ action: withForms ? orgPath("/respond") : "", chosen: withForms || chosen == null ? "" : letterOf(chosen), region: "",
    options: r.options.map((op, i) => ({ key: letterOf(i), label: noDash(op.what), detail: op.tradeoff ? noDash(op.tradeoff) : "",
      attrs: `data-option="${letterOf(i)}"${!withForms && chosen === i ? " data-chosen" : ""}`,
      fields: { qid: r.qid, option: String(i), next: self, ...(ev ? { eval: "1" } : {}) },
      button: isOwner ? `Rule ${letterOf(i)}` : `Answer ${letterOf(i)}`,
      buttonAttrs: `data-button="record-ruling" data-door="POST /respond" title="${esc(isOwner ? `Record option ${letterOf(i)} as the ruling` : `File option ${letterOf(i)} as your answer, with the owner`)}"`,
      extra: `<button class="u-btn small ghost" type="submit" name="provisional" value="1" data-button="mark-provisional" data-door="POST /respond" title="The same answer, marked provisional">Provisional</button>` })) });
  let options;
  if (open) options = card({ label: "Options", count: r.options.length || "", tone: "quiet", region: "options", body: r.options.length ? optionsOf(true) : empty("No options yet") });
  else {
    const i = chosen;
    // the ruling in one phrase (its label, else the chosen option's words), then the option's own words and the reason
    const optWhat = i != null && r.options[i] ? noDash(r.options[i].what) : "";
    const answer = noDash(r.label || "") || optWhat;
    const by = decider ? `${avatar({ name: decider, size: 20 })}${txt(decider)}${r.decidedAt ? ` · ${esc(dayMonthShort(r.decidedAt))}` : ""}` : r.decidedAt ? esc(dayMonthShort(r.decidedAt)) : "";
    // D6a: the chosen option's words only when they say more than the ruling's (never the ruling twice in near-same words), and
    // the options it considered only when there was more than the one it chose
    const ruling = `<div${ruledByLabel ? ' data-ruling="label" data-chosen' : ""}>${words(`<p class="dq-ruling">${i != null ? `<span class="u-letter">${letterOf(i)}</span>` : ""}${txt(answer || r.status)}</p>${optWhat && !sameWords(optWhat, answer) ? `<p>${txt(optWhat)}</p>` : ""}${r.rationale ? `<p>${txt(r.rationale)}</p>` : ""}`, { source: by })}</div>`;
    const considered = r.options.length > 1 || (r.options.length === 1 && i !== 0) ? group({ title: "Options considered", count: r.options.length, body: optionsOf(false) }) : "";
    options = card({ label: IN_FORCE.has(r.status) ? "Ruling" : cap(r.status), region: "options", flush: !!considered, body: considered ? `<div class="p-card-pad">${ruling}</div>${considered}` : ruling });
  }
  const answers = live.answers.length ? card({ label: "Answers", count: live.answers.length, flush: true, region: "answers", body: lines(live.answers.map((a) => line({ attrs: `data-answer="${a.option == null ? "" : esc(letterOf(a.option))}"${a.provisional ? " data-provisional" : ""}`, lead: avatar({ name: noDash(a.by || "someone"), size: 24 }),
    title: a.option == null ? "An option" : `${letterOf(a.option)} · ${noDash((r.options[a.option] || {}).what || "")}`, sub: txt(a.by || ""),
    meta: `${a.provisional ? chip("Provisional") : ""}<span>${esc(ago(a.at, nowMs))}</span>` })), { compact: true }) }) : "";
  // D6a: the Why says where it was recorded by the source's own words; its refs (commit hashes, paths) stay in `source` (the JSON)
  const src = sourceLabels(r.source);
  const why = card({ label: "Why", region: "why", body: r.why || src ? words(r.why ? `<p>${txt(r.why)}</p>` : "", { source: src ? `<span data-region="source">Recorded in ${src}</span>` : "" }) : empty("No reason filed") });
  // ---- beside: what waits on it, the counters ----
  const blockHref = (b) => (String(b).startsWith("goal/") ? orgPath(`/goals/${encodeURIComponent(String(b).slice(5))}`) : orgPath(`/question/${encodeURIComponent(b)}`));
  const blocks = card({ label: "Blocks", count: r.blocks.length || "", flush: true, region: "what-blocks", body: r.blocks.length
    ? lines(r.blocks.map((b) => line({ title: String(b), href: blockHref(b) })), { compact: true }) : empty("Nothing waits on it") });
  const ctr = card({ label: "Counters", count: counters.length || "", flush: true, region: "counters", id: "counters", body: counters.length
    ? lines(counters.map((k) => line({ lead: avatar({ name: noDash(k.by || "someone"), size: 20 }), title: noDash(k.what || ""), meta: `${k.tempo ? chip(cap(k.tempo)) : ""}<span>${esc(ago(k.at, nowMs))}</span>` })), { compact: true })
    : empty("No counters") });
  const banner = (c.liveState === "unreachable" ? unreachableState({ what: "The live answers and counters could not be read." }) : "") + flashOf(o);
  return CSS + Q_CSS + `<section class="dq" data-screen="question">${head}${banner}${stack(provenance, cols(stack(options, answers, why), stack(blocks, ctr)))}${roundForm}</section>` + OFFLINE;
}
