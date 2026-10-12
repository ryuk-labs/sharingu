// src/build.js — Build (UI-B4b, the Build.dc.html artboard, wireframe wf-build): the project's filings, where each one
// is (its tempo), and the finish line. Owner rulings: Q0B546903 (everyone sees everything, scoped to the workspace) ·
// QD0A65555 (runs are a filing's tempo; a counter is the counters plus the MCP call) · QC8B94276 + QB953462F (a counter is
// a filing that names a filing by parent) · QEFC716D5 (rank is a filing: any seated reader, the newest press first, no
// table, MCP twin `rank`) · QA20249FB (rank is a person verb) · QE9178667 + Q47C9CCD3 (EMPTY per region; UNREACHABLE
// blocks writes only) · Q1E8D4C9C (no text input) · Q67288EF5 (Brand v2 decides tokens, the artboard decides regions).
//
// ONE seam, two faces: readBuild(env, reader, q) is the whole read. GET /build answers it as JSON to a script and renders
// it (renderBuild, in-process, from the SAME call) to a browser; the MCP `build` tool answers the same object. The read
// is the project's goal tree (D1, src/goalsread.js contextOf: the same tree and project GET /goals reads) and then ONE
// parallel wave beyond the memoized auth and owner lookup (src/hotsql.js BUILD_ROWS_SQL, BUILD_AGG_SQL and, only when the
// project has a goal filed, GOALS_AGG_SQL over all time, EXPLAINed by tools/d1-hot-selftest.mjs section I), plus the
// org's row (its name, src/tenant.js). The seat scope is folded into B1
// and B2, so a non-owner with no seat on the project reads EMPTY rows, never another project's rows. B3 is the Goals
// screen's own aggregate unchanged (the numbers GET /goals already shows any reader). Sprint 2 (the live budget): B2 and B3
// read migrate-042's tallies (and B2 the week's filings and decisions), never the project's whole ledger.
//
// The finish line (UI-B6b, owner MCQ Q572FF8F6): a STAGE is a LEAF of the goal tree (a node no other node names as its
// parent). done = the leaf's goal rollup (src/goals.js rollupCells over B3, period all, filings only) reaches 100;
// deferred = the leaf's status "deferred" and still below 100 (done wins); gating = the rest. It is drawn from the tree
// alone. No goal filed -> null and the EMPTY sentence; B3 failed -> the ledger did not answer (never a guessed 0 of N).
//
// renderBuild(read, opts) draws the header and three regions in the artboard's order, each with data-region and its own
// EMPTY sentence: filings · tempo · finish-line. Every button carries data-button and either the door it presses
// (data-door, a row of contracts/door.json) or data-client (tools/wire-selftest.mjs audits both against the pinned
// wf-build). The filter and sort chips are links that re-ask the same read (?kind= · ?sort=); nothing is typed.
//
// fileRank(env, reader, a) is the rank door's one seam (POST /rank and the MCP `rank` tool): ONE filing, lane leader,
// kind rank, parent <id>, filed through core.js fileTransmission like every other filing (the router routes it auto).

import { db } from "./data.js";
import { esc, unreachableState, statusChip, pills } from "./ui.js";
import { card, tile, tileRow, avatar, avatarStack, bar, segBar, miniBars, ring, chip, filterRow, hrefWith, group, line, lines, lineDetail, empty, pageHead, cols, stack, id as idCode, ago, happenedOf, kindWord } from "./parts.js";
import { readWeek, weekOf, weekFromRows, dropFixtureSeat } from "./week.js";
import { getTenantConfig, resolveOwner, ownerName } from "./tenant.js";
import { BUILD_ROWS_SQL, BUILD_AGG_SQL, GOALS_AGG_SQL, RECORD_KINDS } from "./hotsql.js";
import { rollupCells } from "./goals.js";
import { periodFrom, contextOf } from "./goalsread.js";
import { tempoOf, chipOfTempo } from "./tempo.js";
import { projectSeatsFor, fileTransmission, transmissionOneFor, EVAL_INHERITED } from "./core.js";
import { agoOf } from "./home.js";
import { verdictWord } from "./txpage.js";
import { RANK_KIND } from "./transmission.js";
import { now, isD1Quota, isEvalMark } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const BUILD_REGIONS = ["filings", "tempo", "finish-line"];
export const BUILD_LIMIT = 50;                                   // rows shown; the statement reads one more to know there is more
export const BUILD_SORTS = ["ranked", "newest", "goal"];
export const BUILD_SORT_LABELS = { ranked: "Ranked", newest: "Newest", goal: "By goal" };
export const BUILD_WHENS = ["1d", "7d"];
// the week's rows the default list reads at most (past it, THE WEEK statement counts the week instead)
export const WEEK_ROWS = 400;
// the design law's state chips a filing wears (design-law.json stateChips): exactly one per row
export const BUILD_CHIPS = ["OPEN", "REVIEW", "gap", "LANDED"];
// D2b: the words a person reads for a tempo (the data keeps tempo.js's words): a contribution filed straight through has
// LANDED, so it reads "landed", never "in"
const TEMPO_SHOWN = { in: "landed", "on the canvas": "on the Map" };
export const tempoShown = (w) => TEMPO_SHOWN[w] || w;
// the EMPTY phrases (pristine copy, owner 2026-10-02: a phrase and at most one button; the call lives on What is missing)
export const BUILD_EMPTY = () => "Nothing contributed yet";
export const TEMPO_EMPTY = "Nothing moved this week";
export const FINISH_EMPTY = "No finish line yet";
export const FINISH_DOWN = "The ledger did not answer, so the finish line is not drawn until it does.";
const DAY = 864e5;

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toMs = (v) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; };

// chipOf(row, tempo) -> the ONE state chip (design-law stateChips): with a person -> OPEN · in -> REVIEW · needs more ->
// gap · approved or on the canvas -> LANDED · rejected or sent back -> REVIEW (the verdict word rides beside it). The
// mapping lives in tempo.js chipOfTempo (UI-B5a); this names the row's decision for it.
export function chipOf(row, tempo) {
  return chipOfTempo(tempo, row && row.decision, row && row.route);
}

// goal titles by id, from the project's goal tree
function goalTitles(tree) {
  const m = new Map();
  for (const n of Array.isArray(tree) ? tree : []) if (n && n.id && n.title && !m.has(String(n.id))) m.set(String(n.id), String(n.title));
  return m;
}
// a stage deferred by the person who owns it: the goal's status "deferred" (`deferred: true` is read too)
const isDeferred = (n) => n.deferred === true || String(n.status || "").trim().toLowerCase() === "deferred";
// stagesOf(tree, rollup) -> { done, total, gating, deferred } | null — PURE (Q572FF8F6). tree: the goal node list;
// rollup: rollupCells(tree, agg)'s answer ({ nodes: [{ id, pct }] }). A stage is a leaf: a node with an id that no other
// node names as its parent. done = its rollup pct >= 100; deferred = isDeferred on the TREE node (rollupCells does not
// carry it) and below 100 (done wins, D3); gating = the rest. No leaves (or no tree) -> null.
export function stagesOf(tree, rollup) {
  const nodes = Array.isArray(tree) ? tree.filter((n) => n && n.id) : [];
  const parents = new Set(nodes.map((n) => n.parent).filter((p) => p != null && p !== "").map(String));
  const leaves = nodes.filter((n) => !parents.has(String(n.id)));
  if (!leaves.length) return null;
  const pct = new Map(((rollup && Array.isArray(rollup.nodes)) ? rollup.nodes : []).map((r) => [String(r.id), num(r.pct)]));
  let done = 0, deferred = 0;
  for (const l of leaves) {
    if ((pct.get(String(l.id)) ?? 0) >= 100) done++;
    else if (isDeferred(l)) deferred++;
  }
  return { done, total: leaves.length, gating: leaves.length - done - deferred, deferred };
}
// sortRows(rows, sort): ranked = the newest rank press first, then the newest work (QEFC716D5); newest = when the work
// happened (happenedAt, migrate-051), else when it was filed; goal = grouped by goal (titled goals by title, then refs with no
// title, then no goal), newest work first inside a group. "Newest" is always when the work happened: a contribution filed today
// about last week's work sits with last week's. The rank press's own time stays the record's.
export { happenedOf };
// rowWord(r) — a contribution's status word, the SAME on the list and on Moved this week (L4: the side card said "On the Map"
// where the list said "Landed")
const rowWord = (r) => (r.verdict ? r.verdict : r.chip === "LANDED" && (r.tempo === "in" || r.tempo === "on the canvas") ? "landed" : tempoShown(r.tempo));   // the ONE helper lives in src/parts.js (L4): every page reads a contribution's time through it
export function sortRows(rows, sort) {
  const list = rows.slice();
  const at = (r) => toMs(happenedOf(r)) ?? 0;
  if (sort === "newest") return list.sort((a, b) => at(b) - at(a));
  if (sort === "goal") {
    const key = (r) => (r.goal ? `0${String(r.goal.title || "~" + r.goal.ref).toLowerCase()}` : "1");
    return list.sort((a, b) => key(a).localeCompare(key(b)) || at(b) - at(a));
  }
  const rk = (r) => (r.rank ? toMs(r.rank) ?? 0 : null);
  return list.sort((a, b) => {
    const x = rk(a), y = rk(b);
    if (x != null && y != null) return y - x || at(b) - at(a);
    if (x != null) return -1;
    if (y != null) return 1;
    return at(b) - at(a);
  });
}

// ---- the read ----
// readBuild(env, reader, q) -> the Build read (the shape in contracts/door.declared.json `build`). q: a URLSearchParams,
// the MCP arguments, or { includeEval }. ?kind= narrows the rows to one kind (in the statement), ?sort= orders them
// (ranked · newest · goal, default ranked), ?eval=1 includes the suites' rows. Never throws for a failed D1 wave
// (live: "unreachable", the regions it fed EMPTY); a D1 quota error propagates to the honest outage page.
export async function readBuild(env, reader, q = {}) {
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : q && q[k]);
  const includeEval = q.includeEval === true || isEvalMark(get("eval"));
  const sortRaw = String(get("sort") || "").toLowerCase();
  const sort = BUILD_SORTS.includes(sortRaw) ? sortRaw : "ranked";
  const kindRaw = String(get("kind") || "").trim().toLowerCase().slice(0, 40);
  const kind = /^[a-z0-9_-]+$/.test(kindRaw) ? kindRaw : null;
  // sprint 3 L2, the filter row (each choice kept in the address): a person (?by=<their id>), a time (?when=1d | 7d) and in
  // motion (?status=motion); each narrows the SAME row statement (BUILD_ROWS_SQL's variants), never a statement of its own
  const byRaw = String(get("by") || "").trim().slice(0, 80);
  const by = /^[A-Za-z0-9@._:-]+$/.test(byRaw) ? byRaw : null;
  const whenRaw = String(get("when") || "").trim().toLowerCase();
  const when = BUILD_WHENS.includes(whenRaw) ? whenRaw : null;
  const status = String(get("status") || "").trim().toLowerCase() === "motion" ? "motion" : null;
  const isOwner = !!(reader && reader.role === "owner");
  const rid = reader && reader.id ? String(reader.id) : "";
  const nowMs = Date.now();
  const since7 = new Date(nowMs - 7 * DAY).toISOString();
  const sinceWhen = when === "1d" ? new Date(nowMs - DAY).toISOString() : when === "7d" ? since7 : null;
  // the project and its goal tree: GET /goals' own (src/goalsread.js contextOf)
  const [tenant, ctx] = await Promise.all([getTenantConfig(env), contextOf(env, reader)]);
  const { tree, project } = ctx;
  const projectKey = project.key;
  const scoped = !!projectKey, pb = scoped ? [projectKey] : [];
  const publishedAt = now();   // what is filed is live at once: the stamp a row's tempo reads is this request's time
  const scope = [isOwner ? 1 : 0, rid];
  const staged = tree.length > 0;
  // THE WAVE: B1 and B2 (and B3, the goal aggregate over all time, only when the project has a goal filed), and the
  // owner lookup beside them. Sprint 3 L2 (the week walked ONCE): with no filter, B1 reads the whole
  // week (every contribution filed in the last seven days, up to WEEK_ROWS) and the week's numbers are counted from those rows
  // (src/week.js weekFromRows); with a filter, B1 reads the filtered page and THE WEEK statement (WEEK_SQL) counts the week.
  // (the last seven days alone is the default read's own range: its rows are the week, read once)
  const weekOnly = when === "7d" && !kind && !by && !status;
  const filtered = !!(kind || by || sinceWhen || status) && !weekOnly;
  const rowsStmt = filtered
    ? db(env).prepare(BUILD_ROWS_SQL(scoped, includeEval, !!kind, { by: !!by, since: !!sinceWhen, motion: status === "motion" }))
      .bind(...pb, ...scope, ...(kind ? [kind] : []), ...(by ? [by] : []), ...(sinceWhen ? [sinceWhen] : []), ...(status === "motion" ? [since7] : []), BUILD_LIMIT + 1)
    : db(env).prepare(BUILD_ROWS_SQL(scoped, includeEval, false, { since: true })).bind(...pb, ...scope, since7, WEEK_ROWS + 1);
  const wave = [
    rowsStmt.all(),
    // the all-time counts per kind off the tally, and the week's decisions on filings older than it (on the Map this week)
    db(env).prepare(BUILD_AGG_SQL(scoped, includeEval)).bind(...pb, ...scope, since7, publishedAt || "").all(),
    ...(staged ? [db(env).prepare(GOALS_AGG_SQL(scoped, includeEval)).bind(...pb, periodFrom("all").from).all()] : []),
  ];
  const weekP = filtered ? readWeek(env, { project: projectKey, includeEval, isOwner, readerId: rid, nowMs, publishedAt: publishedAt || "" }) : Promise.resolve(null);
  const [owner, settled, weekRead] = await Promise.all([
    resolveOwner(env).catch(() => null),
    Promise.allSettled(wave),
    weekP,
  ]);
  const quota = settled.find((x) => x.status === "rejected" && isD1Quota(x.reason));
  if (quota) throw quota.reason;
  const val = (i) => (settled[i].status === "fulfilled" ? settled[i].value : null);
  let rowsRes = val(0);
  const aggRes = val(1), stagesRes = staged ? val(2) : null;
  const dropSeat = includeEval ? null : dropFixtureSeat;
  let week = null, weekDown = filtered && !weekRead;
  if (filtered) week = weekRead ? weekOf(weekRead, { nowMs, dropSeat }) : null;
  else if (rowsRes) {
    const wr = rowsRes.results || [];
    if (wr.length > WEEK_ROWS) {
      // a week busier than WEEK_ROWS: its numbers come from THE WEEK statement, the list shows the newest page of it
      const w = await readWeek(env, { project: projectKey, includeEval, isOwner, readerId: rid, nowMs, publishedAt: publishedAt || "" });
      week = w ? weekOf(w, { nowMs, dropSeat }) : null; weekDown = !w;
    } else {
      week = weekFromRows(wr, { nowMs, since: since7, publishedAt: publishedAt || "", dropSeat });
      // a quieter week than a page: the rows filed before it fill the page (the same statement, bounded before the week)
      if (wr.length < BUILD_LIMIT + 1 && !weekOnly) {
        try {
          const older = await db(env).prepare(BUILD_ROWS_SQL(scoped, includeEval, false, { before: true })).bind(...pb, ...scope, since7, BUILD_LIMIT + 1 - wr.length).all();
          rowsRes = { results: [...wr, ...((older && older.results) || [])] };
        } catch (e) { if (isD1Quota(e)) throw e; rowsRes = null; }
      }
    }
  }
  const down = settled.some((x) => x.status === "rejected") || !!ctx.down || weekDown || !rowsRes;
  const finishLine = stagesRes ? stagesOf(tree, rollupCells(tree, stagesRes.results || [])) : null;

  const ownerLabel = ownerName(owner);
  const stamp = { publishedAt };
  const titles = goalTitles(tree);
  const rawAll = (rowsRes && rowsRes.results) || [];
  // D1b item 3: a knowledge write's stored "N cards written" counts every item for every reader; a reader who is not the owner
  // gets the tally recounted from what they may read, and a write that named only what they may not read is not listed
  const X = !isOwner && scoped && rawAll.some((t) => String(t.kind) === "knowledge") ? await import("./extract.js") : null;   // loaded here: a static import cycles
  const knowledgeRowFor = X && X.knowledgeRowFor;
  const kvis = X ? await X.knowledgeVisFor(env, reader, projectKey, rawAll) : null;
  const raw = (kvis ? rawAll.map((t) => { const v = knowledgeRowFor(t, kvis); return v ? { ...t, what: v.what, touches: v.touches } : null; }).filter(Boolean) : rawAll);
  const rowOf = (t) => {
    const tempo = tempoOf(t, stamp, { ownerName: ownerLabel });
    const d = String(t.decision || "").toLowerCase();
    return {
      id: t.id, title: t.what || t.id, chip: chipOf(t, tempo), verdict: d === "reject" || d === "needs-work" ? verdictWord(d) : null, tempo,
      kind: t.kind || null, lane: t.lane || null, by: t.by_name || null, via: t.via || null,
      goal: t.goal_ref ? { ref: String(t.goal_ref), title: titles.get(String(t.goal_ref)) || null } : null,
      counters: num(t.counters), rank: t.ranked_at || null, at: t.created_at || null, happenedAt: t.happened_at || null, decidedAt: t.decided_at || null,
      ...(t.next_picked_by ? { pickedUp: { by: t.picked_name || t.next_picked_by, done: !!t.next_done_at } } : {}),
      ...(t.eval ? { eval: true } : {}),
    };
  };
  const rows = sortRows(raw.slice(0, BUILD_LIMIT).map(rowOf), sort);

  // the counts: contributions · in motion · on the Map this week, and every kind present with its count. B2's rows are summed
  // per kind (sprint 2: a kind's tally row carries its counts, and each filing of the week adds its own 0/1s to the same kind).
  // Sprint 3 (B3): the records (RECORD_KINDS: a knowledge write, a grade) are never open, in motion or a row of the default
  // list; byKind still counts them, so their filter shows how many there are
  const byKind = {};
  let total = 0, inMotion = 0, onCanvasWeek = 0;
  for (const a of (aggRes && aggRes.results) || []) {
    const k = String(a.kind || "") || "filing";
    byKind[k] = (byKind[k] || 0) + num(a.n);
    if (RECORD_KINDS.includes(k)) continue;
    total += num(a.n); inMotion += num(a.motion_n);
  }
  // the week's part (src/week.js): needs more filed in it (in motion), and what landed in it naming what it touches (on the Map)
  // (the canvas of the week's own filings, and B2's second arm: the ones filed before it and landed in it)
  if (week) { inMotion += week.totals.more; onCanvasWeek = week.totals.canvasFiled; }
  for (const a of (aggRes && aggRes.results) || []) if (!RECORD_KINDS.includes(String(a.kind || ""))) onCanvasWeek += num(a.canvas_n);
  // the list's own count: the filter's total (one filter set: its chip's number), else what the rows say
  const person = by && week ? week.people.find((p) => p.id === by) : null;
  const nFilters = [kind, by, sinceWhen, status].filter(Boolean).length;
  const shownOf = nFilters === 0 ? (aggRes ? total : null) : nFilters > 1 ? null
    : kind ? num(byKind[kind]) : status ? (aggRes && week ? inMotion : null) : by ? (person ? person.filed : 0) : when === "1d" ? (week ? week.totals.today : null) : (week ? week.totals.filed : null);
  const more = shownOf != null ? Math.max(0, shownOf - rows.length) : (raw.length > BUILD_LIMIT ? 1 : 0);

  // the tempo region: the three newest pieces of work of the week (L4: by when the work HAPPENED, happenedOf, the list's own
  // time; newest first, the id breaking a tie), whatever order the list is open in
  const hMs = (r) => toMs(happenedOf(r)) ?? 0;
  const moved = rows.filter((r) => hMs(r) >= nowMs - 7 * DAY)
    .sort((a, b) => hMs(b) - hMs(a) || (String(a.id) < String(b.id) ? 1 : String(a.id) > String(b.id) ? -1 : 0)).slice(0, 3)
    .map((r) => ({ id: r.id, title: r.title, tempo: r.tempo, ago: agoOf(happenedOf(r), nowMs) }));

  const org = (tenant.brand && tenant.brand.org) || "";
  const out = {
    project: { key: projectKey, name: project.name || org || null },
    asOf: { served: publishedAt },
    counts: aggRes && week ? { contributions: total, inMotion, onCanvasWeek, byKind, records: RECORD_KINDS.filter((k) => num(byKind[k]) > 0) } : { contributions: aggRes ? total : null, inMotion: null, onCanvasWeek: null, byKind, records: RECORD_KINDS.filter((k) => num(byKind[k]) > 0) },
    filter: { kind, sort, ...(by ? { by } : {}), ...(when ? { when } : {}), ...(status ? { status } : {}) },
    rows, more, tempo: moved,
    finishLine,
    // sprint 3 L2 (added): the week, per day (oldest first: filed, and of those landed) and per person (their id is the person
    // filter's value): the Filed bars and the person and time filters
    week: week ? { days: week.days, since: week.since, labels: week.labels, filed: week.filed, landed: week.landed, today: week.totals.today,
      people: week.people.map((p) => ({ id: p.id, name: p.name, filed: p.filed, landed: p.landed })) } : null,
    ...(shownOf != null ? { shown: shownOf } : {}),
    ...(includeEval ? { eval: true } : {}),
    ...(down ? { live: "unreachable" } : {}),
  };
  // B3 (or the tree) failed: the render says the ledger did not answer (never a guessed 0 of N). Non-enumerable, so GET
  // /build's JSON and the MCP `build` tool keep the declared shape.
  if ((staged && !stagesRes) || ctx.down) Object.defineProperty(out, "stagesDown", { value: true });
  return out;
}

// ---- the rank door (QEFC716D5) ----
// fileRank(env, reader, { id, eval, via }) -> { http, …the filing's receipt ({ id, route, status, …}), ranked } or
// { http, error, … }. `http` is the door's HTTP status (the receipt's own `status` is the ledger's, "routed").
// Any reader seated on the ranked filing's project may press it (the owner on any); for everyone else the answer is 404
// not_found, exactly like a missing id, so it never says a row exists elsewhere. A rank filing is not itself rankable.
export async function fileRank(env, reader, a = {}) {
  const id = String((a && a.id) || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 60);
  if (!id) return { http: 422, error: "id_required", note: "Name the filing to rank: {id: \"T-YYYYMMDD-NNN\"} (GET /build lists them)." };
  const isOwner = !!(reader && reader.role === "owner");
  const [row, seats] = await Promise.all([transmissionOneFor(id, env, reader), isOwner ? Promise.resolve([]) : projectSeatsFor(reader.id, env)]);
  const seated = isOwner || (row && !row.error && (row.project == null ? seats.length === 0 : seats.some((s) => s.key === row.project)));
  if (!row || row.error || !seated || String(row.kind || "").toLowerCase() === RANK_KIND) {
    return { http: 404, error: "not_found", id, note: "No filing with that id on a project you hold a seat on." };
  }
  const title = String(row.what || row.id).replace(/\s+/g, " ").trim().slice(0, 100);
  const res = await fileTransmission(reader, {
    lane: "leader", kind: "rank", parent: row.id, project: row.project || undefined,
    what: `Ranked first on Build: ${title}`,
    // copy: off-screen (the rank filing's own words, a record)
    why: "A rank press: the project's shared order puts the newest press first (QEFC716D5).",
    eval: isEvalMark(a.eval) || Number(row.eval) === 1,
    // a rank of a test row is a test row: the mark is the row's (EVAL_INHERITED), a caller's own mark still meets the rule
    ...(!isEvalMark(a.eval) && Number(row.eval) === 1 ? { [EVAL_INHERITED]: true } : {}),
    via: a.via ? String(a.via).slice(0, 60) : "build",
  }, env);
  if (res && res.error) return { http: 422, ...res };   // the door's own refusal (project_required, unknown_parent, …), nothing filed
  return { http: 200, ...res, ranked: row.id };
}

// ---- the page (sprint 3, L2: the revision, docs/plan/LOOK.md; the approved mock is tools/parts-gallery.mjs build()) ----
// The glance (contributions, in motion, filed in seven days with its bars, the finish line), the ONE filter row (in motion, the
// kinds, the people of the week, the time; each a link, the choice kept in the address, a chip that would show nothing is not
// drawn), then the contributions by day (the newest open, the settled days folded; Ranked puts the rank presses first, By goal
// groups by goal), each one line that opens in place, and beside them the kinds, the finish line and what moved this week.
// Same read, same forms and doors. Hooks a check reads: data-region (filings · tempo · finish-line, and metrics on the strip),
// data-metric + data-value on a tile (contributions · in-motion · filed-week · stages-done; on-canvas-week rides the Filed
// tile), data-id + data-kind + data-goal and one data-chip on a row, data-ranked, data-happened, data-moved on a tempo row,
// data-button + data-door / data-client on every control.
const CSS = `<style>
.bd{display:block}
.bd-n{min-width:22px;text-align:right;color:var(--text-muted)}
.bd .p-ld-act form{margin:0}
.bd .u-seg .u-pill{height:24px;padding:0 9px;font-size:12.5px}
</style>`;
// UNREACHABLE kept ready (ui.js unreachableState): an offline browser gets the block, and while it is on the page every
// POST (the rank press) is refused before the press (the shell's own CSS rule and this guard)
const OFFLINE = `<template id="bd-offline">${unreachableState({ what: "This browser is offline, so the worker cannot be reached." })}</template>
<script>(function(){var host=document.querySelector('.bd');function down(){if(!host||host.querySelector('[data-state="unreachable"]'))return;var t=document.getElementById('bd-offline');if(t)host.insertBefore(t.content.cloneNode(true),host.firstChild);}
window.addEventListener('offline',down);if(navigator.onLine===false)down();
document.addEventListener('submit',function(e){var f=e.target;if(f&&String(f.method||'').toLowerCase()==='post'&&host&&host.querySelector('[data-state="unreachable"]')){e.preventDefault();e.stopPropagation();}},true);})();</script>`;
const hidden = (n, v) => `<input type="hidden" name="${esc(n)}" value="${esc(v)}">`;
const face = (name, size) => avatar({ name: name || "someone", size: size || 24 });
const DAY_MS = 864e5;
const dayOfRow = (iso, nowMs) => {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return "Earlier";
  const today = new Date(nowMs); today.setUTCHours(0, 0, 0, 0);
  return t >= today.getTime() ? "Today" : t >= today.getTime() - DAY_MS ? "Yesterday" : "Earlier";
};
// the address of this page with one choice changed (eval kept, ranked the default order)
function paramsOf(o) {
  const p = {};
  if (o.kind) p.kind = o.kind; if (o.by) p.by = o.by; if (o.when) p.when = o.when; if (o.status) p.status = o.status;
  if (o.sort && o.sort !== "ranked") p.sort = o.sort;
  if (o.eval) p.eval = "1";
  return p;
}
const withParam = (p, k, v) => { const q = { ...p }; if (v == null || v === "" || (k === "sort" && v === "ranked")) delete q[k]; else q[k] = String(v); return q; };
export const hrefOf = (o, over = {}) => hrefWith(orgPath("/build"), Object.entries(over).reduce((p, [k, v]) => withParam(p, k, v), paramsOf(o)));
const cap = (w) => { const s = String(w || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
// "16 gating · 3 deferred" from the parts that are not zero (a zero says nothing)
const nonZero = (parts) => parts.filter(([n]) => num(n) > 0).map(([n, w]) => `${num(n)} ${w}`).join(" · ");

// one contribution: its face, its title (opening it), the goal it names, its ONE state chip and when; open: the facts and the
// two presses (Open, and Rank first while it has not landed)
function rowLine(r, o) {
  const href = orgPath(`/contribution/${encodeURIComponent(r.id)}`);
  const word = rowWord(r);
  const happened = happenedOf(r);
  const other = r.happenedAt && r.at && String(r.happenedAt).slice(0, 10) !== String(r.at).slice(0, 10);
  // D6a: a landed row has nothing left to put first: no Rank press on it
  const rank = r.chip === "LANDED" ? "" : `<form method="POST" action="${orgPath(`/rank`)}">${hidden("id", r.id)}${hidden("next", hrefOf(o))}${o.eval || r.eval ? hidden("eval", "1") : ""}<button class="u-btn small ghost" type="submit" data-button="rank" data-door="POST /rank"${o.down ? " disabled" : ""} title="Put this contribution first for everyone on the project">Rank first</button></form>`;
  const facts = [["Id", idCode(r.id)], r.kind ? ["Kind", esc(kindWord(r.kind))] : null, ["By", `${face(r.by, 20)}${txt(r.by || "someone")}`],
    r.goal ? ["Goal", `<a class="u-link" href="${orgPath(`/goals/${encodeURIComponent(r.goal.ref)}`)}">${txt(r.goal.title || r.goal.ref)}</a>`] : null,
    r.verdict ? ["Ruling", txt(r.verdict)] : null,
    happened ? ["Happened", esc(String(happened).slice(0, 10))] : null, other ? ["Filed", esc(String(r.at).slice(0, 10))] : null,
    num(r.counters) ? ["Counters", `<a class="u-link" href="${esc(href)}#counters" data-button="counters" data-door="GET /build" data-client="the counters standing on this contribution, read on its page" data-counters="${esc(num(r.counters))}">${esc(num(r.counters))}</a>`] : null,
    r.rank ? ["Ranked", esc(agoOf(r.rank, o.nowMs))] : null,
    r.pickedUp ? [r.pickedUp.done ? "Done by" : "Picked up by", txt(r.pickedUp.by)] : null];
  return line({ attrs: `data-id="${esc(r.id)}" data-kind="${esc(r.kind || "")}"${r.goal ? ` data-goal="${esc(r.goal.ref)}"` : ""}${r.rank ? ` data-ranked="${esc(r.rank)}"` : ""}${other ? ` data-happened="${esc(String(r.happenedAt).slice(0, 10))}"` : ""}${r.verdict ? ` data-verdict="${esc(r.verdict)}"` : ""}${r.pickedUp ? ` data-picked="${esc(r.pickedUp.by)}"` : ""}`,
    lead: face(r.by), title: noDash(r.title), href, linkAttrs: 'data-button="open-row" data-door="GET /contribution/:id"',
    sub: !o.grouped && r.goal ? txt(r.goal.title || r.goal.ref) : "",
    meta: `${statusChip(r.chip, cap(word))}<span>${esc(ago(happened, o.nowMs))}</span>`,
    detail: lineDetail({ facts, actions: `<a class="u-btn small" href="${esc(href)}">Open</a>${rank}` }) });
}
const peopleOf = (xs) => [...new Map(xs.filter((x) => x.by).map((x) => [x.by, { name: x.by }])).values()];
const landedIn = (xs) => xs.filter((x) => x.chip === "LANDED").length;
// D6a: the group's count is its rows; "N landed" only when some, not all, landed (never the count said twice)
const groupSum = (xs) => { const n = landedIn(xs); return `${avatarStack(peopleOf(xs), { size: 20 })}${n && n < xs.length ? `<span>${esc(n)} of ${esc(xs.length)} landed</span>` : ""}`; };

// renderBuild(read, { brand, nowMs }) -> the Build content (the route wraps it in shell()). Pure.
export function renderBuild(b, opts = {}) {
  const read = b || {};
  const f = read.filter || {};
  const o = { kind: f.kind || null, by: f.by || null, when: f.when || null, status: f.status || null, sort: f.sort || "ranked", eval: !!read.eval,
    down: read.live === "unreachable", nowMs: opts.nowMs || Date.now(), grouped: (f.sort || "ranked") === "goal" };
  const c = read.counts || {};
  const wk = read.week || null;
  const fl = read.finishLine;
  const head = pageHead({ title: "Build" });

  // ---- the glance ----
  const filedTile = wk
    ? tile({ label: "Filed · 7d", value: (wk.filed || []).reduce((a, n) => a + num(n), 0), count: true, key: "filed-week", href: hrefWith(orgPath("/build"), o.eval ? { eval: "1", when: "7d" } : { when: "7d" }),
      chart: miniBars(wk.landed, { stack: wk.filed.map((n, i) => Math.max(0, num(n) - num(wk.landed[i]))), labels: wk.labels, label: "Filed a day, landed and still open" }),
      sub: nonZero([[wk.landed.reduce((a, n) => a + num(n), 0), "landed"], [c.onCanvasWeek, "on the Map"]]),
      attrs: `data-canvas="${esc(c.onCanvasWeek ?? "")}"` })
    : tile({ label: "Filed · 7d", value: null, key: "filed-week" });
  // a project nothing has been contributed to (and nothing in motion): one phrase, never a strip of zeros (D2b item 9)
  const unfed = !o.down && c.contributions === 0 && !num(c.inMotion);
  // (the one phrase is the list's own, below: a second card saying it again would be noise)
  const metrics = unfed ? `<span hidden data-metric="contributions" data-value="0"></span>` : tileRow([
    tile({ label: "Contributions", value: c.contributions, count: true, key: "contributions" }),
    tile({ label: "In motion", value: c.inMotion, count: true, key: "in-motion", href: num(c.inMotion) ? hrefWith(orgPath("/build"), { status: "motion", ...(o.eval ? { eval: "1" } : {}) }) : "" }),
    filedTile,
    fl ? tile({ label: "Finish line", value: fl.done, unit: `of ${fl.total}`, count: true, key: "stages-done", chart: ring({ value: fl.done, max: fl.total, size: 36, center: "", label: "Stages done" }),
      sub: nonZero([[fl.gating, "gating"], [fl.deferred, "deferred"]]) })
      : tile({ label: "Finish line", value: null, key: "stages-done", sub: read.stagesDown ? "not read" : "" }),
  ], { region: "metrics", label: "How it is going" });
  // the hidden twin of "on the Map this week" (its number rides the Filed tile's sub)
  const canvasHook = `<span hidden data-metric="on-canvas-week" data-value="${esc(c.onCanvasWeek ?? "?")}"></span>`;

  // ---- the filter row ----
  const byKind = c.byKind || {};
  const isRecord = (k) => RECORD_KINDS.includes(k);
  const kinds = Object.keys(byKind).filter((k) => num(byKind[k]) > 0 && !isRecord(k)).sort((a, b) => num(byKind[b]) - num(byKind[a]) || a.localeCompare(b));
  const FILTER = 'data-button="filter" data-client="filters the list read: re-asks the same read with the choice in the address"';
  const people = (wk && wk.people) || [];
  const filters = filterRow({ clear: hrefWith(orgPath("/build"), o.eval ? { eval: "1" } : {}), label: "Filter the contributions", groups: [
    { key: "status", label: "Status", items: [
      { label: "All", count: c.contributions, href: hrefOf(o, { status: "", kind: "", by: "", when: "" }), current: !o.status && !o.kind && !o.by && !o.when, all: true, attrs: FILTER },
      { label: "In motion", count: c.inMotion, href: hrefOf(o, { status: "motion" }), current: o.status === "motion", attrs: FILTER }] },
    { key: "kind", label: "Kind", items: [...kinds.map((k) => ({ label: kindWord(k), count: byKind[k], href: hrefOf(o, { kind: o.kind === k ? "" : k }), current: o.kind === k, attrs: FILTER })),
      ...(o.kind && isRecord(o.kind) ? [{ label: o.kind === "knowledge" ? "knowledge writes" : "grades", count: byKind[o.kind], href: hrefOf(o, { kind: o.kind }), current: true, attrs: FILTER }] : [])] },
    { key: "by", label: "Person", max: 4, items: people.map((p) => ({ label: String(p.name).split(/\s+/)[0], title: `${p.name}: contributions, the last seven days`, count: p.filed, person: { name: p.name },
      href: hrefOf(o, o.by === p.id ? { by: "" } : { by: p.id, when: "7d" }), current: o.by === p.id, attrs: FILTER })) },
    { key: "when", label: "Time", items: [
      { label: "24 hours", count: wk ? wk.today : null, href: hrefOf(o, { when: o.when === "1d" ? "" : "1d" }), current: o.when === "1d", attrs: FILTER },
      { label: "7 days", count: wk ? (wk.filed || []).reduce((a, n) => a + num(n), 0) : null, href: hrefOf(o, { when: o.when === "7d" ? "" : "7d" }), current: o.when === "7d", attrs: FILTER },
      { label: "All time", href: hrefOf(o, { when: "", by: "" }), current: !o.when, all: true, attrs: FILTER }] },
  ] });

  // ---- the contributions ----
  const rowsIn = Array.isArray(read.rows) ? read.rows : [];
  // copy: off-screen (a data-client value)
  const sortWhat = "orders the list read: Ranked (the newest rank press first), Newest (when the work happened), By goal";
  const sorts = pills(BUILD_SORTS.map((x) => ({ label: BUILD_SORT_LABELS[x], href: hrefOf(o, { sort: x }), current: o.sort === x, attrs: `data-button="sort" data-client="${esc(sortWhat)}"` })), { label: "Order", segment: true });
  let body = "";
  if (rowsIn.length) {
    const L = (xs) => lines(xs.map((r) => rowLine(r, o)));
    if (o.grouped) {
      const groups = [];
      for (const r of rowsIn) { const g = r.goal ? r.goal.ref : null; if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g, goal: r.goal, rows: [] }); groups[groups.length - 1].rows.push(r); }
      body = groups.map((x, i) => group({ title: x.goal ? noDash(x.goal.title || x.goal.ref) : "No goal named", count: x.rows.length, open: i < 3, attrs: `data-goal="${esc(x.g || "")}"`, summary: groupSum(x.rows), body: L(x.rows) })).join("");
    } else {
      const ranked = o.sort === "ranked" ? rowsIn.filter((r) => r.rank) : [];
      const rest = rowsIn.filter((r) => !ranked.includes(r));
      const days = ["Today", "Yesterday", "Earlier"].map((d) => [d, rest.filter((r) => dayOfRow(happenedOf(r), o.nowMs) === d)]).filter(([, xs]) => xs.length);
      body = (ranked.length ? group({ title: "Ranked first", count: ranked.length, open: true, summary: groupSum(ranked), body: L(ranked) }) : "")
        + days.map(([d, xs], i) => group({ title: d, count: xs.length, open: !ranked.length && i === 0 || (ranked.length && i === 0 && d === "Today"), summary: groupSum(xs), body: L(xs) })).join("");
    }
    if (num(read.more)) body += `<p class="p-empty"><span title="Narrow by kind, person or time to read the older ones">${esc(num(read.more))} older</span></p>`;
  } else if (o.down) {
    body = empty("The ledger did not answer");
  } else if (o.kind || o.by || o.when || o.status) {
    body = empty("Nothing matches", { action: { href: hrefWith(orgPath("/build"), o.eval ? { eval: "1" } : {}), label: "All contributions" } });
  } else body = empty(BUILD_EMPTY(), unfed ? { action: { href: orgPath("/missing"), label: "What is missing" } } : undefined);
  const total = read.shown != null ? read.shown : rowsIn.length;
  const filings = card({ label: "Contributions", count: unfed ? "" : total, flush: true, region: "filings", action: unfed ? "" : sorts, body, attrs: 'data-reveal="2"' });

  // ---- the side: the kinds, the finish line, what moved this week ----
  const kmax = Math.max(1, ...kinds.map((k) => num(byKind[k])));
  const kindCard = kinds.length ? card({ label: "By kind", count: kinds.reduce((a, k) => a + num(byKind[k]), 0), flush: true, attrs: 'data-reveal="3"',
    body: lines(kinds.map((k) => line({ title: kindWord(k), href: hrefOf(o, { kind: k }), meta: `${bar({ value: num(byKind[k]), max: kmax, show: "", width: 120, label: kindWord(k) })}<span class="bd-n">${esc(num(byKind[k]))}</span>` })), { compact: true }) }) : "";
  const finish = card({ label: "Finish line", count: fl ? `${fl.done}/${fl.total}` : "", region: "finish-line", attrs: 'data-reveal="3"',
    body: fl ? segBar({ label: "Stages", segments: [{ label: "done", value: fl.done, tone: "done" }, { label: "gating", value: fl.gating, tone: "todo" }, { label: "deferred", value: fl.deferred, tone: "progress" }] })
      : read.stagesDown ? empty(FINISH_DOWN) : empty(FINISH_EMPTY, { action: { href: orgPath("/missing"), label: "What is missing" } }) });
  const tr = Array.isArray(read.tempo) ? read.tempo : [];
  // the newest few of the week (no count beside the label: it is not how many moved), each in the list's own words
  const tempo = card({ label: "Moved this week", flush: true, region: "tempo", attrs: 'data-reveal="3"',
    body: tr.length ? lines(tr.map((t) => { const r = rowsIn.find((x) => x.id === t.id); return line({ attrs: `data-moved="${esc(t.id)}"`, title: noDash(t.title), href: orgPath(`/contribution/${encodeURIComponent(t.id)}`),
      meta: `${r ? statusChip(r.chip, cap(rowWord(r))) : chip(cap(tempoShown(t.tempo)))}<span>${esc(r ? ago(happenedOf(r), o.nowMs) : String(t.ago || "").replace(/ ago$/, ""))}</span>` }); }), { compact: true })
      : empty(TEMPO_EMPTY) });
  const banner = o.down ? unreachableState({ what: "Build could not be read from the ledger, so ranking is off and the counts may be short." }) : "";
  return CSS + `<section class="bd" data-screen="build">${banner}${head}${stack(metrics, unfed && !o.kind && !o.by && !o.when && !o.status ? "" : filters, cols(filings, stack(kindCard, finish, tempo)))}${canvasHook}</section>` + OFFLINE;
}
