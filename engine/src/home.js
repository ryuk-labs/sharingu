// src/home.js — Home (UI-B3, the Home.dc.html artboard, wireframe wf-home): the project, how filled it is (its checklist's
// meter, sprint 3 B3), its aim, what is moving, what needs you, the goals moved and who is here. Owner rulings: Q935B7970 (Home = the project, its aim, who is
// here, the leaderboard, what needs you) · QF4CC7033 (the leaderboard ranks goal movement per area) · Q1E8D4C9C +
// QA20249FB (no keyboard: every verb is a button) · QD0A65555 (in motion is a filing's tempo; a counter is the MCP
// call) · QB953462F (a question is named by gapRefs, a filing by parent) · QE9178667 + Q47C9CCD3 (EMPTY per region;
// UNREACHABLE blocks writes only) · QB1623583 + QC2F3082A (the project's name, never its key) · Q57988E56 (the aim's
// number is exported by the brain) · Q45D29B33 ("Not yet" on a grant is terminal, no snooze). Sprint 3 (B3, docs/plan/MCP.md
// §9 demand 11, owner 2026-10-01) supersedes QF4CC7033: Home leads with the goals moved and who contributed, never a ranking
// of people (the monthly per-person leaderboard is gone); and a knowledge write or a grade with proof is the record of a
// write, never an open or in-motion contribution.
//
// ONE seam, two faces: readHomeSummary(env, reader, q) is the whole read, and GET /home/summary (JSON), the MCP `home`
// tool and GET /home (this page, rendered in-process from the SAME call) all answer from it, so the page and the JSON
// cannot disagree. The read is AT MOST SIX D1 statements beyond the memoized auth, in ONE parallel wave (their SQL
// lives in src/hotsql.js, EXPLAINed by tools/d1-hot-selftest.mjs section G, and the aim's in src/knowledge/goals.js
// AIM_SQL: the aim and its measure are D1 knowledge, filed with preview then save_knowledge kind "aim"), plus the open questions
// (readDecisions, memoized per request). S1 also carries "shipped this week" and "as of" (the project's newest knowledge
// write). The org's name is its org row (src/tenant.js, one primary-key read). The decide rows are the open questions the ONE
// owedBy says are yours, so the Needs-you decide count equals the Decisions "Open: yours" count by construction.
//
// renderHome(summary, opts) draws six regions in the artboard's order, each carrying data-region and its own EMPTY
// sentence: identity (with the meter) · aim · metrics · needs-you · goals-moved · who-is-here; sprint 3 B4 adds what-changed
// (under needs-you) and follow-ups (heading the side column), src/impactpage.js. Every button carries data-button and
// either the door it presses (data-door, a row of contracts/door.json) or data-client (tools/wire-selftest.mjs audits
// both against the pinned wf-home). No text input, no em dash, Brand v2 tokens only. (The owner's Desk, GET /orchestrator,
// is retired in UI-B12b: Home carries what needs you, Build the queue.)

import { db } from "./data.js";
import { esc, unreachableState, statusChip } from "./ui.js";
import { checklistFor, meterWords } from "./checklist.js";
import { card, tile, tileRow, avatar, avatarStack, bar, miniBars, ring, chip, group, line, lines, lineDetail, empty, pageHead, cols, stack, btn, id as idCode, ago, happenedOf } from "./parts.js";
import { readWeek, weekOf, dropFixtureSeat } from "./week.js";
import { DEFAULT_BRAND, getTenantConfig } from "./tenant.js";
import { projectOf } from "./project.js";
import { readDecisions, owedBy, ruledWord, optionPresses, OPTION_PRESS_MAX } from "./decisions.js";
import { HOME_TX_AGG_SQL, HOME_OWNER_ROWS_SQL, HOME_FIRST5_SQL, HOME_GOALS_MOVED_SQL, HOME_SEATS_SQL } from "./hotsql.js";
import { AREA_OF_LANE } from "./lanes.js";
import { deriveFirstFive } from "./first5.js";
import { aimOf } from "./knowledge/goals.js";
import { isD1Quota, isEvalMark, isEvalSeat } from "./util.js";
import { hatsOf } from "./hats.js";
import { whatChangedFor } from "./impact.js";
import { followUpsFor } from "./pickup.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

// the needs-you row's ONE state chip by its kind (design-law stateChips, UI-B5a QB74B1B7E): a human act is owed
const KIND_CHIP = { decide: "DECIDE", approve: "APPROVE", grant: "GRANT" };
const KIND_WORD = { decide: "Decide", approve: "Approve", grant: "Grant" };

export const HOME_REGIONS = ["identity", "aim", "metrics", "needs-you", "goals-moved", "who-is-here"];
const NEEDS_ROWS = 4;

// The filed text and the ledger's own words carry em dashes; the voice law has none on glass (rendered text only).
const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const LETTERS = "ABCDEFGHIJ";
const letterOf = (i) => (i == null ? "" : LETTERS[i] || String(i + 1));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
export function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const two = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return two.toUpperCase();
}
// the suites' own seats (the old leaderboard's two fixture shapes, plus the minted fixed seats): never on a real Home
const isFixtureSeat = (p) => !!p && (/@example\.com$/i.test(String(p.email || "")) || ["Eval Seat", "Test Leader"].includes(String(p.name || "")) || isEvalSeat(p.id || p.submitter));
// agoOf(iso, nowMs) -> "3 minutes ago" | "2 hours ago" | "4 days ago" | "just now" | "" (unparseable)
export function agoOf(iso, nowMs = Date.now()) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${plural(m, "minute")} ago`;
  const h = Math.round(m / 60); if (h < 48) return `${plural(h, "hour")} ago`;
  return `${plural(Math.round(h / 24), "day")} ago`;
}
// the aim's and its measure's EMPTY phrases (pristine copy, owner 2026-10-02: a phrase; What is missing holds the call)
export const AIM_EMPTY = "No aim yet";
export const MEASURE_EMPTY = "No measure";
// the aim's number (Q57988E56): the aim's measure (k_aim), {name, value, period, prior, priorPeriod, source}; anything
// malformed reads as no measure (the EMPTY sentence), never as a guess. D1b item 18: a measure RULED absent ({none, why}) reads
// as that ruling, never as missing
function measureOf(m) {
  if (m && typeof m === "object" && m.none === true) return { none: true, why: String(m.why || "").slice(0, 400) };
  if (!m || typeof m !== "object" || !String(m.name || "").trim()) return null;
  const n = (v) => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return { name: String(m.name).slice(0, 200), value: n(m.value), period: String(m.period || "").slice(0, 60), prior: n(m.prior),
    priorPeriod: String(m.priorPeriod || "").slice(0, 60), source: String(m.source || "").slice(0, 200) };
}
export const SHIPPED_DAYS = 7;

// ---- the read ----
// readHomeSummary(env, reader, q) -> the Home summary (the shape in contracts/door.declared.json `home`). q: a
// URLSearchParams, the MCP arguments, or { includeEval }. ?eval=1 includes the suites' rows, as /decisions does.
// Never throws for a project with no question (no decide rows) or a failed D1 wave (live: "unreachable", the regions it fed EMPTY);
// a D1 quota error propagates to the honest outage page.
export async function readHomeSummary(env, reader, q = {}) {
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : q && q[k]);
  const includeEval = q.includeEval === true || isEvalMark(get("eval"));
  const isOwner = !!(reader && reader.role === "owner");
  const nowMs = Date.now();
  // the project: the request's (src/project.js projectOf, THE one rule): the resolved project, else the org's one active
  // project, else none (the rows no project stamps)
  const tenant = await getTenantConfig(env);
  const projectKey = await projectOf(env);
  const scoped = !!projectKey, pb = scoped ? [projectKey] : [];
  const d0 = new Date(nowMs), monthStart = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)).toISOString();
  const st = (sql, args) => db(env).prepare(sql).bind(...args);
  // THE WAVE: S1..S5 (S3 inside readDecisions, the same statement /decisions runs) and the aim (S6, D1 knowledge)
  const wave = [
    st(HOME_TX_AGG_SQL(scoped, includeEval), pb).first(),   // the all-time tallies and "as of" (?1 the project, when scoped)
    isOwner ? st(HOME_OWNER_ROWS_SQL(scoped, includeEval), pb).all() : st(HOME_FIRST5_SQL, [reader.id, reader.id, reader.id]).first(),
    st(HOME_GOALS_MOVED_SQL(scoped, includeEval), [...pb, monthStart, monthStart.slice(0, 10)]).all(),   // created_at range, then when it happened
    st(HOME_SEATS_SQL(scoped), scoped ? [projectKey] : []).all(),
    aimOf(env, projectKey),
    // sprint 3 B4: What changed (the newest code and design contributions, each with the one line of what it reached: two
    // statements, then ONE batch of four for all of them, src/impact.js whatChangedFor) and the follow-ups due (two bounded
    // ranges of idx_transmission_followups, yours first, src/pickup.js followUpsFor)
    scoped ? whatChangedFor(env, { project: projectKey, includeEval }) : Promise.resolve({ rows: [] }),
    scoped ? followUpsFor(env, reader, { project: projectKey, includeEval, nowMs }) : Promise.resolve({ rows: [], more: false }),
    // sprint 3 L2: THE WEEK (src/week.js, hotsql.js WEEK_SQL): contributions per day and person over the last seven days, the
    // ONE walk of the week's filings (needs more and landed in seven days are its sums: HOME_TX_AGG_SQL no longer walks them)
    readWeek(env, { project: projectKey, includeEval, isOwner, readerId: reader && reader.id, nowMs }).then((w) => { if (!w) throw new Error("week"); return w; }),
  ];
  // the checklist's meter (src/checklist.js: k_fill and a few probes, the open questions and the owner's owed set) runs once
  // the open questions are read, so it reuses this request's reads of them (the owed set peeks the overlay readDecisions read)
  const decP = readDecisions(env, reader, { eval: includeEval ? "1" : "" }, { open: true });   // Home draws open questions only
  const clP = scoped ? decP.then(() => checklistFor(env, reader, { project: projectKey }), () => checklistFor(env, reader, { project: projectKey })) : Promise.resolve(null);
  const [dec, settled, cl] = await Promise.all([decP, Promise.allSettled(wave), clP.catch((e) => { if (isD1Quota(e)) throw e; return null; })]);
  const quota = settled.find((x) => x.status === "rejected" && isD1Quota(x.reason));
  if (quota) throw quota.reason;
  const down = settled.some((x) => x.status === "rejected") || dec.live === "unreachable";
  const val = (i) => (settled[i].status === "fulfilled" ? settled[i].value : null);
  const agg = val(0), second = val(1), gmRes = val(2), seatsRes = val(3), aim = val(4) || { text: null, measure: null };
  const changed = val(5) || { rows: [] }, followUps = val(6) || { rows: [], more: false };
  const weekRead = val(7), week = weekRead ? weekOf(weekRead, { nowMs, dropSeat: includeEval ? null : dropFixtureSeat }) : null;

  // needs you: decide rows = the open questions the ONE owedBy says are yours (so decide == /decisions "Open: yours")
  const decRows = Array.isArray(dec.rows) ? dec.rows : [];
  const decide = decRows.filter((r) => owedBy(r, reader, r.live) === "you").map((r) => ({
    kind: "decide", qid: r.qid, title: r.question || r.label || r.qid, severity: r.severity || null, options: r.options.length,
    // the options themselves, none picked (the one-pass fix 9: it used to carry option A alone as its pick)
    choices: r.options.slice(0, OPTION_PRESS_MAX).map((op, i) => ({ letter: String.fromCharCode(65 + i), what: op.what })), counters: r.live.counters.length, ...(r.eval ? { eval: true } : {}) }));
  const ownerRows = isOwner && second && Array.isArray(second.results) ? second.results : [];
  const filingRow = (t) => ({ kind: t.kind === "grant" ? "grant" : "approve", id: t.id, title: t.what || t.id, lane: t.lane || null,
    by: t.by_name || null, at: t.created_at || null, happenedAt: t.happened_at || null, counters: num(t.counters) });
  const approveRows = ownerRows.filter((t) => t.kind !== "grant").map(filingRow);
  const grantRows = ownerRows.filter((t) => t.kind === "grant").map(filingRow);
  const decideN = decide.length;
  const approveN = isOwner && agg ? num(agg.approve_n) : 0, grantN = isOwner && agg ? num(agg.grant_n) : 0;
  const rows = [...decide, ...approveRows, ...grantRows].slice(0, NEEDS_ROWS);
  const total = decideN + approveN + grantN;
  // an approved answer ruled it in this request's overlay while the row still reads open: Home says so at once, as Decisions does
  const ruled = decRows.filter((r) => r.status === "open" && r.live && r.live.ruled).slice(0, 3)
    .map((r) => ({ qid: r.qid, title: r.question || r.qid, option: letterOf(r.live.ruled.option), word: ruledWord(r.live) }));
  // a seat with no contribution yet: the first five steps are the EMPTY's next action (never the owner's)
  let firstFive = null;
  if (!isOwner && second && !down) {
    const f5 = deriveFirstFive({ tokens: second.tokens, events: second.events, transmissions: second.transmissions });
    if (f5.show) firstFive = { steps: f5.steps.map((s) => ({ key: s.key, label: noDash(s.label), detail: noDash(s.detail), done: !!s.done })), done: f5.done, total: f5.total };
  }

  // the goals moved: this project, this month, per goal (how far: its contributions this month, and by area), with the people
  // who contributed to it (names only, in name order: no per-person count, no rank)
  const byGoal = new Map();
  for (const r of (gmRes && gmRes.results) || []) {
    if (!includeEval && isFixtureSeat(r)) continue;
    const ref = String(r.goal_ref || "");
    if (!ref) continue;
    const g = byGoal.get(ref) || { goal: ref, title: r.title != null ? String(r.title) : ref, known: r.title != null, n: 0, areas: { build: 0, gtm: 0, plans: 0 }, people: new Map() };
    const area = AREA_OF_LANE[String(r.lane || "").toLowerCase()];
    g.n += num(r.n);
    if (area) g.areas[area] += num(r.n);
    if (r.submitter && !g.people.has(r.submitter)) g.people.set(r.submitter, r.name || "someone");
    byGoal.set(ref, g);
  }
  const gmRows = [...byGoal.values()].filter((g) => g.n > 0)
    .sort((a, b) => b.n - a.n || String(a.title).localeCompare(String(b.title)))
    .map((g) => ({ goal: g.goal, title: g.title, known: g.known, n: g.n, areas: g.areas,
      contributors: [...g.people.values()].sort((a, b) => String(a).localeCompare(String(b))).map((name) => ({ name, initials: initialsOf(name) })) }));
  const contributors = new Set(gmRows.flatMap((g) => g.contributors.map((c) => c.name)));
  // the meter: overall and per area (the areas this project has), the same numbers What is missing leads with
  const meter = cl && cl.project && !cl.live ? { done: cl.meter.done, total: cl.meter.total, pct: cl.meter.pct, open: cl.meter.open, words: meterWords(cl.meter),
    areas: cl.areas.map((a) => ({ area: a.area, label: a.label, applies: a.applies, done: a.done, total: a.total, pct: a.pct })) } : null;

  // who is here: the admin (the org's owner) and the project's seated people; no machines (QA78C4808). A Partner never reads
  // the org's whole roster (migrate-044): with no project in scope (the unscoped read lists every active person) they see
  // only themselves
  const seatRows = (seatsRes && seatsRes.results) || [];
  const head = seatRows.find((r) => r.project_name != null || r.projects != null) || {};
  const people = [], seen = new Set();
  const partnerAlone = !scoped && !!reader && reader.role === "partner";
  for (const r of seatRows) {
    if (!r.id || !r.name || seen.has(r.id)) continue;
    if (partnerAlone && r.id !== reader.id) continue;
    if (!includeEval && isFixtureSeat(r)) continue;
    seen.add(r.id);
    people.push({ name: r.name, initials: initialsOf(r.name), role: r.role === "owner" ? "admin" : "seated" });
  }
  people.sort((a, b) => (a.role === b.role ? String(a.name).localeCompare(String(b.name)) : a.role === "admin" ? -1 : 1));
  const projectCount = head.projects != null ? num(head.projects) : null;

  // sprint 3 L3: a follow-up's person (next.who, typed as an id or an email) by name when it resolves to someone seated here,
  // from the seats this read already holds (no statement of its own); carried off the JSON (not enumerable: the home tool
  // and GET /home/summary keep their shape)
  const whoOf = new Map();
  for (const r of seatRows) { if (r.id && r.name) { whoOf.set(String(r.id).toLowerCase(), String(r.name)); if (r.email) whoOf.set(String(r.email).toLowerCase(), String(r.name)); } }
  Object.defineProperty(followUps, "whoNames", { value: Object.fromEntries((followUps.rows || []).filter((x) => x.who && whoOf.has(String(x.who).toLowerCase())).map((x) => [x.id, whoOf.get(String(x.who).toLowerCase())])) });
  const org = (tenant.brand && tenant.brand.org) || "";
  return {
    project: { key: projectKey, name: (head.project_name && String(head.project_name)) || org || null },
    org,
    asOf: { knowledge: (agg && agg.knowledge_at) || null },
    aim: { text: aim.text ? String(aim.text) : null, measure: measureOf(aim.measure), ...(aim.asOf ? { asOf: aim.asOf } : {}), ...(aim.confidence ? { confidence: aim.confidence } : {}) },
    metrics: {
      needsYou: { total, decide: decideN, approve: approveN, grant: grantN },
      // D2b: what has not landed (a landed contribution is never in motion); Build's count, the same definition
      inMotion: agg && week ? { total: num(agg.with_n) + week.totals.more, withPerson: num(agg.with_n), needsMore: week.totals.more }
        : { total: null, withPerson: null, needsMore: null },
      contributions: agg ? { total: num(agg.contrib_n), byKind: contribKinds(agg.contrib_kinds) } : { total: null, byKind: [] },
      // L4: landed in the last seven days by the day the work HAPPENED (week.js landed: Build's bars, the same day groups)
      shipped: week ? { days: SHIPPED_DAYS, landed: week.totals.landed } : null,
    },
    needsYou: { rows, more: Math.max(0, total - rows.length), open: dec.counts ? dec.counts.open : 0, ruled, firstFive },
    goalsMoved: { period: monthStart.slice(0, 7), rows: gmRows, people: contributors.size },
    meter,
    whoIsHere: { people, count: people.length, projects: projectCount },
    whatChanged: changed, followUps,
    // sprint 3 L2 (added): the week, per day (oldest first) and per person: the Landed bars and the People card
    week: week ? { days: week.days, since: week.since, labels: week.labels, filed: week.filed, landed: week.landed, people: week.people.map((p) => ({ name: p.name, initials: initialsOf(p.name), filed: p.filed, days: p.days })) } : null,
    ...(includeEval ? { eval: true } : {}),
    ...(down ? { live: "unreachable" } : {}),
  };
}



// contribKinds(json) -> [{kind, n}] most first (the tally's [[kind, n], …]; a kind of '' reads "filing")
function contribKinds(j) {
  let a = [];
  try { a = JSON.parse(j || "[]"); } catch { a = []; }
  return (Array.isArray(a) ? a : []).map(([k, n]) => ({ kind: String(k || "") || "filing", n: num(n) })).filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n || x.kind.localeCompare(y.kind));
}

// ---- the page (sprint 3, L2: the revision, docs/plan/LOOK.md; the approved mock is tools/parts-gallery.mjs home()) ----
// Three depths on the shared parts (src/parts.js): the glance (one tile strip: needs you, in motion, landed in seven days with
// its bars, the goals moved, how filled), then the cards (Needs you and What changed; beside them the aim, the goals moved,
// the people of the week and the follow-ups), each row one line that opens in place. No sentence of the product's own: a
// title, a label, a value, a name, a button (pristine copy). The reader's hats pick which card leads (an engineering, a
// partner or a quality hat leads with what changed). Same read, same forms and doors. Hooks a check reads: every data-region of the
// artboard (identity, aim, metrics, needs-you, goals-moved, who-is-here, what-changed, follow-ups), data-metric + data-value
// on a tile, data-kind + data-qid / data-id and one data-chip on a needs row, data-goal + data-moved on a goal, data-person +
// data-role on a person, data-meter + data-pct + data-open on the Filled tile, data-measure on the aim's chip.
const OFFLINE = `<template id="hm-offline">${unreachableState({ what: "This browser is offline, so the worker cannot be reached." })}</template>
<script>(function(){var host=document.querySelector('.hm');function down(){if(!host||host.querySelector('[data-state="unreachable"]'))return;var t=document.getElementById('hm-offline');if(t)host.insertBefore(t.content.cloneNode(true),host.firstChild);}
window.addEventListener('offline',down);if(navigator.onLine===false)down();
document.addEventListener('submit',function(e){var f=e.target;if(f&&String(f.method||'').toLowerCase()==='post'&&host&&host.querySelector('[data-state="unreachable"]')){e.preventDefault();e.stopPropagation();}},true);})();</script>`;
const CSS = `<style>
.hm{display:block}
.hm-aim{margin:0;font:600 15px/1.5 var(--sans);color:var(--text);text-wrap:pretty;overflow-wrap:anywhere}
.hm-n{min-width:22px;text-align:right;color:var(--text-muted)}
.hm .p-ld-act form{margin:0}
.hm .p-ld-act .u-btn{max-width:100%}
.hm .p-ld-act .u-trunc{display:inline-block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}
.hm .u-letter{margin-right:6px;font:600 11.5px/1 var(--mono);color:var(--text-faint)}
</style>`;

const hidden = (n, v) => `<input type="hidden" name="${esc(n)}" value="${esc(v)}">`;
const nonZero = (parts) => parts.filter(([n]) => num(n) > 0).map(([n, w]) => `${num(n)} ${w}`).join(" · ");
const DAY_MS = 864e5;
// a row's day: Today (the last 24 hours as the day it is), Yesterday, Earlier (the settled ones fold)
function dayOf(iso, nowMs) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return "Earlier";
  const today = new Date(nowMs); today.setUTCHours(0, 0, 0, 0);
  if (t >= today.getTime()) return "Today";
  if (t >= today.getTime() - DAY_MS) return "Yesterday";
  return "Earlier";
}
const face = (name, size) => avatar({ name: name || "someone", size: size || 24 });
const counterChip = (n, href, id) => (num(n) ? chip(`${num(n)} ${num(n) === 1 ? "counter" : "counters"}`, { tone: "warn", href, attrs: `data-button="counters" data-door="GET /home/summary" data-client="the counters standing on this row, read on its own page" aria-label="Counters on ${esc(id || "")}"` }) : "");

// a needs-you row: one line (the kind, the title, where it is, when), the one press on the right, the rest in place
function needsLine(r, o) {
  const next = o.eval ? orgPath("/home?eval=1") : orgPath("/home");
  const lead = statusChip(KIND_CHIP[r.kind] || "REVIEW", KIND_WORD[r.kind] || "Review", "quiet");
  if (r.kind === "decide") {
    const href = orgPath(`/question/${encodeURIComponent(r.qid)}${o.eval || r.eval ? "?eval=1" : ""}`);
    const picks = Array.isArray(r.choices) && r.choices.length ? optionPresses(r.qid, r.choices, { next, project: o.projectKey || null, eval: !!(o.eval || r.eval), cls: "hm-pick" }) : "";
    return line({ attrs: `data-kind="decide" data-qid="${esc(r.qid)}"`, lead, title: noDash(r.title), href, sub: r.severity ? esc(r.severity) : "",
      meta: `${counterChip(r.counters, `${href}#counters`, r.qid)}<span>${esc(num(r.options))} ${num(r.options) === 1 ? "option" : "options"}</span>`,
      action: `<a class="u-btn small" href="${esc(href)}" data-button="see-options" data-door="GET /question/:qid">Rule</a>`,
      detail: lineDetail({ facts: [["Id", idCode(r.qid)], r.severity ? ["Severity", esc(r.severity)] : null], actions: picks }) });
  }
  const href = orgPath(`/contribution/${encodeURIComponent(r.id)}`);
  const facts = [["Id", idCode(r.id)], r.lane ? ["Lane", esc(r.lane)] : null, r.by ? ["By", `${face(r.by, 20)}${txt(r.by)}`] : null];
  const meta = `${counterChip(r.counters, `${href}#counters`, r.id)}${r.by ? face(r.by, 20) : ""}<span>${esc(ago(happenedOf(r), o.nowMs))}</span>`;
  if (r.kind === "approve") {
    const approve = `<form method="POST" action="${esc(href)}/decide">${hidden("verdict", "approve")}${hidden("next", next)}<button class="u-btn small" type="submit" data-button="approve" data-door="POST /contribution/:id/decide">Approve</button></form>`;
    return line({ attrs: `data-kind="approve" data-id="${esc(r.id)}"`, lead, title: noDash(r.title), href, sub: r.lane ? esc(r.lane) : "", meta, action: approve,
      detail: lineDetail({ facts, actions: `<a class="u-btn small ghost" href="${esc(href)}" data-button="see-diff" data-door="GET /contribution/:id">Open</a>` }) });
  }
  const grant = `<form method="POST" action="${esc(href)}/decide">${hidden("verdict", "approve")}${hidden("note", "granted once")}${hidden("next", next)}<button class="u-btn small" type="submit" data-button="grant-once" data-door="POST /contribution/:id/decide">Grant once</button></form>`;
  const notYet = `<form method="POST" action="${esc(href)}/decide">${hidden("verdict", "needs-work")}${hidden("note", "not yet")}${hidden("next", next)}<button class="u-btn small ghost" type="submit" data-button="not-yet" data-door="POST /contribution/:id/decide">Not yet</button></form>`;
  return line({ attrs: `data-kind="grant" data-id="${esc(r.id)}"`, lead, title: noDash(r.title), href, sub: r.lane ? esc(r.lane) : "", meta, action: grant,
    detail: lineDetail({ facts, actions: notYet }) });
}

// renderHome(summary, { owner, brand, reader, eval, nowMs }) -> the Home content (the route wraps it in shell()). Pure.
export function renderHome(s, opts = {}) {
  const o = { ...opts, eval: !!(opts.eval || (s && s.eval)), projectKey: (s && s.project && s.project.key) || null, nowMs: opts.nowMs || Date.now() };
  const sum = s || {};
  const brand = o.brand || DEFAULT_BRAND;
  const m = sum.metrics || {}, ny = sum.needsYou || { rows: [] }, gmv = sum.goalsMoved || { rows: [] }, who = sum.whoIsHere || { people: [] };
  const down = sum.live === "unreachable";
  const wk = sum.week || null;
  const title = noDash((sum.project && sum.project.name) || sum.org || brand.org || "Home");
  // the head: the project's NAME (never its key); the Library and What changed open from it (sprint 3 B5)
  const head = pageHead({ title, region: "identity", actions: [
    btn("Library", { href: orgPath("/library"), ghost: true, attrs: 'data-button="library" data-door="GET /library"' }),
    btn("What changed", { href: orgPath("/changes"), attrs: 'data-button="what-changed" data-door="GET /changes"' })] });

  // ---- the glance ----
  const nyM = m.needsYou || {}, im = m.inMotion || {}, ct = m.contributions || {}, sh = m.shipped;
  const mt = sum.meter;
  const gmRows = Array.isArray(gmv.rows) ? gmv.rows : [];
  // "Filled" means ONE thing everywhere: the checklist's items done of all (What is missing says the same; its depth is "By depth")
  const fillTile = mt && mt.total ? tile({ label: "Filled", value: mt.done, unit: `of ${mt.total}`, count: true, chart: bar({ value: mt.done, max: mt.total, show: "", width: 64, label: "The checklist" }),
    sub: nonZero([[mt.open, "open"]]), href: orgPath("/missing"), title: mt.words, key: "filled",
    attrs: `data-meter="home" data-pct="${esc(mt.pct)}" data-open="${esc(mt.open)}" data-done="${esc(mt.done)}" data-total="${esc(mt.total)}"` }) : "";
  // D2b item 9: a project nothing has been contributed to reads "Nothing contributed yet" (and how filled it is), never a
  // strip of zeros; the moment one contribution lands, or something needs the reader, the numbers come back
  const unfed = !down && ct.total != null && num(ct.total) === 0 && !num(nyM.total);
  // (how filled the project is rides the card's head: the checklist is what a project with nothing contributed fills first)
  const fillChip = mt && mt.total ? chip(`Filled ${mt.done} of ${mt.total}`, { href: orgPath("/missing"), title: mt.words, attrs: `data-meter="home" data-pct="${esc(mt.pct)}" data-open="${esc(mt.open)}" data-done="${esc(mt.done)}" data-total="${esc(mt.total)}"` }) : "";
  const metrics = unfed
    ? card({ region: "metrics", label: "Contributions", action: fillChip, body: empty("Nothing contributed yet", { action: { href: orgPath("/missing"), label: "What is missing" } }), attrs: 'data-reveal="1"' })
    : tileRow([
      tile({ label: "Needs you", value: nyM.total, tone: num(nyM.total) ? "warn" : "", count: true, key: "needs-you", href: orgPath("/decisions?status=open"),
        sub: nonZero([[nyM.decide, "decide"], [nyM.approve, "approve"], [nyM.grant, "grant"]]) }),
      tile({ label: "In motion", value: im.total, count: true, key: "in-motion", href: num(im.total) ? orgPath("/build?status=motion") : orgPath("/build"),
        sub: nonZero([[im.withPerson, "with a person"], [im.needsMore, "need more"]]) }),
      tile({ label: "Landed · 7d", value: sh ? sh.landed : null, count: true, key: "shipped", href: orgPath("/build?when=7d"),
        chart: wk ? miniBars(wk.landed, { labels: wk.labels, label: "Landed a day, the last seven days" }) : "" }),
      tile({ label: "Goals moved", value: gmRows.length, count: true, key: "goals-moved", href: orgPath("/goals"), sub: gmRows.length ? "this month" : "" }),
      fillTile,
    ], { region: "metrics", label: "How it is going" });

  // ---- Needs you ----
  const rowsIn = Array.isArray(ny.rows) ? ny.rows : [];
  const ruled = (ny.ruled || []).map((r) => line({ attrs: `data-qid="${esc(r.qid)}" data-ruled="${esc(r.option)}"`, lead: chip("Not applied", { tone: "warn", title: r.word }),
    title: noDash(r.title), href: orgPath(`/question/${encodeURIComponent(r.qid)}`), meta: `<span>${esc(r.option)}</span>` }));
  const f5 = ny.firstFive;
  const firstFive = f5 ? lines(f5.steps.map((x) => line({ attrs: `data-step="${esc(x.key)}"${x.done ? ' data-done="1"' : ""}`, lead: ring({ value: x.done ? 1 : 0, max: 1, size: 20, label: x.label }),
    title: noDash(x.label), href: x.key === "connect" && !x.done ? orgPath("/docs") : "", meta: x.done ? chip("Done", { tone: "ok" }) : "" })), { attrs: 'data-steps="first-five"' }) : "";
  const needsBody = rowsIn.length || ruled.length
    ? lines([...rowsIn.map((r) => needsLine(r, o)), ...ruled]) + (num(ny.more) ? `<p class="p-empty"><span>${esc(num(ny.more))} more</span></p>` : "")
    : firstFive || empty("Nothing needs you");
  const needs = card({ label: "Needs you", count: num(nyM.total) || "", tone: num(nyM.total) ? "needs" : "", flush: true, region: "needs-you", attrs: 'data-reveal="2"',
    action: `<a class="u-link" href="${orgPath(`/decisions${o.eval ? "?eval=1" : ""}`)}" data-button="all-open" data-client="opens the Decisions tab">Decisions</a>`, body: needsBody });

  // ---- What changed: the newest code and design contributions, by day; the settled days fold ----
  const wc = (sum.whatChanged && sum.whatChanged.rows) || [];
  const byDay = new Map();
  for (const r of wc) { const d = dayOf(happenedOf(r), o.nowMs); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); }
  const wcLine = (r) => line({ attrs: `data-change="${esc(r.id)}" data-redo="${esc(r.toRedo || 0)}"`, lead: face(r.by), title: noDash(r.what), href: r.href,
    rowAttrs: "", meta: `${num(r.touched && r.touched.total) ? chip(`${num(r.touched.total)} changed`, { title: r.line ? noDash(r.line) : "" }) : ""}${num(r.toRedo) ? chip(`${num(r.toRedo)} to redo`, { tone: "warn" }) : ""}<span>${esc(ago(happenedOf(r), o.nowMs))}</span>`,
    detail: lineDetail({ facts: [["Id", idCode(r.id)], r.lane ? ["Lane", esc(r.lane)] : null, r.by ? ["By", `${face(r.by, 20)}${txt(r.by)}`] : null,
      ["Changed", esc(num(r.touched && r.touched.total))]],
      actions: `<a class="u-btn small" href="${esc(r.href)}" data-button="open-impact" data-door="GET /contribution/:id/impact">Impact</a>` }) });
  const groups = ["Today", "Yesterday", "Earlier"].filter((d) => byDay.has(d)).map((d, i) => {
    const xs = byDay.get(d);
    const people = [...new Map(xs.filter((x) => x.by).map((x) => [x.by, { name: x.by }])).values()];
    // D6a: no count on a day here: the card holds the latest few, so a count read as the day's (Build and What changed count it)
    return group({ title: d, open: i === 0, summary: avatarStack(people, { size: 20 }), body: lines(xs.map(wcLine)) });
  }).join("");
  // L4: the card holds the LATEST few code and design contributions, labelled so (no count that reads as the total); All opens
  // What changed, which counts everything
  const changed = card({ label: "Latest changes", flush: true, region: "what-changed", attrs: 'data-reveal="2"',
    action: `<a class="u-link" href="${orgPath(`/changes`)}">All</a>`, body: groups || empty("No code or design change yet") });

  // ---- the side: the aim, the goals moved, the people of the week, the follow-ups ----
  const aim = sum.aim || {};
  const ms = aim.measure;
  const measureChip = !ms ? chip(MEASURE_EMPTY, { href: orgPath("/missing"), title: "What is missing names it", attrs: 'data-measure="missing"' })
    : ms.none ? chip("No measure, by decision", { title: ms.why || "", attrs: 'data-measure="none"' })
    : chip(`${noDash(ms.name)}${ms.value == null ? "" : `: ${ms.value}`}`, { title: [noDash(ms.name), ms.value == null ? "not measured yet" : "", ms.period, ms.prior == null ? "" : `${ms.prior} ${ms.priorPeriod || "before"}`, ms.source ? `counted from ${ms.source}` : ""].filter(Boolean).join(" · "),
      attrs: `data-measure="set" data-value="${esc(ms.value == null ? "" : ms.value)}"${ms.prior == null ? "" : ` data-prior="${esc(ms.prior)}"`}` });
  const sure = aim.confidence === "proposal" || aim.confidence === "direction" ? chip(aim.confidence, { title: aim.asOf ? `as of ${aim.asOf}` : "", attrs: `data-confidence="${esc(aim.confidence)}"${aim.asOf ? ` data-as-of="${esc(aim.asOf)}"` : ""}` }) : "";
  const aimCard = card({ label: "Aim", region: "aim", attrs: 'data-reveal="3"', action: aim.text ? `${sure}${measureChip}` : "",
    body: aim.text ? `<p class="hm-aim">${txt(aim.text)}</p>` : empty(AIM_EMPTY, { action: { href: orgPath("/missing"), label: "What is missing" } }) });
  const maxMoved = Math.max(1, ...gmRows.map((g) => num(g.n)));
  const moved = card({ label: "Goals moved", count: gmRows.length || "", flush: true, region: "goals-moved", attrs: 'data-reveal="3"', action: `<a class="u-link" href="${orgPath(`/goals`)}">Goals</a>`,
    body: gmRows.length ? goalsMovedBody(gmRows, maxMoved) : empty("No goal moved this month") });
  // the people: who is here (the admin and the seated), each with their week (contributions a day); a contributor of the week
  // who holds no seat any more still shows (their work is on the page)
  const weekBy = new Map(((wk && wk.people) || []).map((p) => [p.name, p]));
  const ppl = (Array.isArray(who.people) ? who.people : []).map((p) => ({ ...p, w: weekBy.get(p.name) || null }));
  for (const p of (wk && wk.people) || []) if (!ppl.some((x) => x.name === p.name)) ppl.push({ name: p.name, initials: p.initials, role: "contributor", w: p });
  ppl.sort((a, b) => num(b.w && b.w.filed) - num(a.w && a.w.filed) || (a.role === "admin" ? -1 : b.role === "admin" ? 1 : String(a.name).localeCompare(String(b.name))));
  // L4: the card is the week's: a person is on it for what they contributed in it (no row reads 0); nobody seated is its own phrase
  const pplWeek = ppl.filter((p) => num(p.w && p.w.filed) > 0);
  const people = card({ label: "People · 7 days", count: pplWeek.length || "", flush: true, region: "who-is-here", attrs: 'data-reveal="3"',
    body: pplWeek.length ? lines(pplWeek.map((p) => line({ attrs: `data-person="${esc(p.name)}" data-role="${esc(p.role)}"`, lead: face(p.name), title: noDash(p.name), sub: p.role === "admin" ? "admin" : "",
      meta: `${p.w && wk ? miniBars(p.w.days, { width: 56, height: 16, labels: wk.labels, label: `${p.name}, contributions a day` }) : ""}<span class="hm-n" title="contributions, the last seven days">${esc(p.w ? p.w.filed : 0)}</span>` })), { compact: true })
      : empty(ppl.length ? "No contribution this week" : "Nobody seated yet") });
  const fu = sum.followUps || { rows: [] };
  const fuRows = Array.isArray(fu.rows) ? fu.rows : [];
  const follow = card({ label: "Follow-ups", count: fuRows.length || "", flush: true, region: "follow-ups", attrs: 'data-reveal="3"',
    // the face is the person the follow-up names (their name when it resolves, else what was typed), else "Anyone"
    body: fuRows.length ? lines(fuRows.map((r) => { const wn = r.whoName || (fu.whoNames || {})[r.id] || (r.who ? String(r.who) : "");
      return line({ attrs: `data-followup="${esc(r.id)}" data-due="${esc(r.by)}" data-mine="${r.mine ? 1 : 0}" data-overdue="${r.overdue ? 1 : 0}"`,
      lead: wn ? avatar({ name: noDash(wn), size: 24 }) : chip("Anyone"), title: noDash(r.next), href: r.href, sub: wn ? txt(wn) : "",
      meta: `${r.overdue ? chip("Overdue", { tone: "bad" }) : ""}${r.mine ? chip("Yours") : ""}<span>${esc(r.by)}</span>` }); }), { compact: true })
      + (fu.more ? `<p class="p-empty"><span>More due</span></p>` : "")
      : empty("No follow-up due") });

  // the reader's hats pick the card that leads: an engineering, a partner or a quality hat leads with what changed (a tester's
  // next run is what changed since the last grade)
  const hats = hatsOf(o.reader && o.reader.hats);
  const changedFirst = hats.length && ["engineering", "partner", "quality"].includes(hats[0]);
  const main = changedFirst ? stack(changed, needs) : stack(needs, changed);
  const banner = down ? unreachableState({ what: "Part of Home could not be read from the ledger, so the counts may be short." }) : "";
  return CSS + `<section class="hm" data-screen="home">${banner}${head}${stack(metrics, cols(main, stack(aimCard, moved, people, follow)))}</section>` + OFFLINE;
}
// the goals moved: the five that moved most, the rest folded under one line
const MOVED_SHOWN = 5;
function goalsMovedBody(rows, max) {
  const one = (g) => line({ attrs: `data-goal="${esc(g.goal)}" data-moved="${esc(g.n)}"`, lead: ring({ value: g.n, max, size: 20, label: "contributions this month" }),
    title: noDash(g.title), href: g.known ? orgPath(`/goals/${encodeURIComponent(g.goal)}`) : "",
    meta: `${avatarStack((g.contributors || []).map((c) => ({ name: c.name })), { size: 20, label: "Contributed" })}<span class="hm-n" title="contributions this month">${esc(g.n)}</span>` });
  const rest = rows.slice(MOVED_SHOWN);
  return lines(rows.slice(0, MOVED_SHOWN).map(one), { compact: true }) + (rest.length ? group({ title: "More", count: rest.length, body: lines(rest.map(one), { compact: true }) }) : "");
}

