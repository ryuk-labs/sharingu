// src/week.js — the week (sprint 3, L2; owner, MCQ 2026-10-02: the revision's ONE new read): contributions per day and person
// over the last seven days, landed or not. ONE statement (src/hotsql.js WEEK_SQL, EXPLAINed by tools/d1-hot-selftest.mjs),
// run once by the page that needs it, in its own wave: Home (the Landed bars, the People card, needs more and landed in seven
// days) and Build (the Filed bars, the person and time filters, the week's part of in motion and of on the Map). The week it
// counts is the same one both pages counted before: the last 7 x 24 hours before `now`, a day being 24 hours (day 0 the last
// 24 hours), so a chart's bars always add up to the number beside them.
//
// readWeek(env, o) -> the rows (or null when the read failed: the page says it did not answer); weekOf(rows, o) -> the shape
// the pages and their JSON twins carry. PURE apart from the one statement.
import { db } from "./data.js";
import { WEEK_SQL, WEEK_DAYS } from "./hotsql.js";
import { isD1Quota, isEvalSeat } from "./util.js";

export { WEEK_DAYS };
const DAY = 864e5;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// readWeek(env, { project, includeEval, isOwner, readerId, nowMs, publishedAt }) -> { rows, now, since } | null (a failed
// read; a D1 quota error propagates to the honest outage page)
export async function readWeek(env, o = {}) {
  const nowMs = o.nowMs || Date.now();
  const now = new Date(nowMs).toISOString(), since = new Date(nowMs - WEEK_DAYS * DAY).toISOString();
  const scoped = !!o.project;
  const binds = [...(scoped ? [o.project] : []), now, since, o.isOwner ? 1 : 0, String(o.readerId || ""), o.publishedAt || ""];
  try {
    const res = await db(env).prepare(WEEK_SQL(scoped, !!o.includeEval)).bind(...binds).all();
    return { rows: (res && res.results) || [], now, since };
  } catch (e) {
    if (isD1Quota(e)) throw e;
    return null;
  }
}

// weekOf(read, { nowMs, dropSeat }) -> { days, since, labels, filed[7], landed[7], shipped[7], totals: { filed, landed, shipped,
// more, canvas, today }, people: [{ id, name, filed, landed, days[7] }] }. Arrays run oldest first (index 6 is the last 24
// hours). filed and landed (Build's: filed straight through or approved) are by the day its work HAPPENED (happenedAt, else the
// day it was filed; sprint 3 L3: the bars, the day groups and the people agree); shipped (Home's Landed)
// by the day it LANDED, over both arms. dropSeat(id, name): a suite's fixed seat is never a person on a real page.
export function weekOf(read, o = {}) {
  const nowMs = o.nowMs || Date.now();
  const idx = (slot) => (slot == null || !Number.isFinite(Number(slot)) ? -1 : WEEK_DAYS - 1 - Math.max(0, Math.min(WEEK_DAYS - 1, Number(slot))));
  const z = () => Array(WEEK_DAYS).fill(0);
  const filed = z(), landed = z(), shipped = z();
  const totals = { filed: 0, landed: 0, shipped: 0, more: 0, canvas: 0, canvasFiled: 0, earlier: 0 };
  const people = new Map();
  for (const r of (read && read.rows) || []) {
    const n = num(r.n);
    totals.more += num(r.more_n); totals.canvas += num(r.canvas_n);
    const li = idx(r.l);
    if (li >= 0 && num(r.shipped_n)) { shipped[li] += num(r.shipped_n); totals.shipped += num(r.shipped_n); }
    const fi = idx(r.f);
    if (fi < 0) continue;   // arm B: filed before the week, decided in it (it counts as landed in it, never as filed)
    // sprint 3 L3: f is the day the work HAPPENED (else filed); work filed this week that happened before it is not this week's
    // work: it leaves the bars and the week's count (totals.earlier says how much)
    if (Number(r.f) > WEEK_DAYS - 1) { totals.earlier += n; continue; }
    totals.canvasFiled += num(r.canvas_n);
    filed[fi] += n; totals.filed += n;
    if (num(r.ok)) { landed[fi] += n; totals.landed += n; }
    const id = String(r.submitter || "");
    if (!id || (o.dropSeat && o.dropSeat(id, r.name))) continue;
    const p = people.get(id) || { id, name: r.name ? String(r.name) : "someone", filed: 0, landed: 0, days: z() };
    p.filed += n; if (num(r.ok)) p.landed += n; p.days[fi] += n;
    people.set(id, p);
  }
  const labels = Array.from({ length: WEEK_DAYS }, (_, i) => DOW[new Date(nowMs - (WEEK_DAYS - 1 - i) * DAY).getUTCDay()]);
  return { days: WEEK_DAYS, since: (read && read.since) || new Date(nowMs - WEEK_DAYS * DAY).toISOString(), labels, filed, landed, shipped,
    totals: { ...totals, today: filed[WEEK_DAYS - 1] },
    people: [...people.values()].sort((a, b) => b.filed - a.filed || String(a.name).localeCompare(String(b.name))) };
}
// the suites' own seats never show as a person (src/util.js isEvalSeat, and the old fixture shapes Home already drops)
export const dropFixtureSeat = (id, name) => isEvalSeat(id) || ["Eval Seat", "Test Leader"].includes(String(name || ""));

// weekFromRows(rows, { nowMs, since, publishedAt, dropSeat }) -> weekOf's shape from the week's OWN rows (Build's default list
// reads every contribution filed in the window, src/build.js, so the week is walked once): the same groups WEEK_SQL's first
// arm makes (the day filed, landed, needs more, on the Map), in JS. shipped (Home's, by the day it landed) is not counted here.
const LANDED = (r) => String(r.decision || "") === "approve" || (r.decision == null && String(r.route || "") === "auto");
export function weekFromRows(rows, o = {}) {
  const nowMs = o.nowMs || Date.now(), pub = String(o.publishedAt || ""), since = String(o.since || "");
  const groups = new Map();
  for (const r of rows || []) {
    // the day the work happened (happenedAt), else the day it was filed: WEEK_SQL's own f (sprint 3 L3)
    const t = Date.parse(String(r.happened_at || r.created_at || ""));
    if (!Number.isFinite(t)) continue;
    const f = Math.max(0, Math.floor((nowMs - t) / DAY)), ok = LANDED(r) ? 1 : 0, k = `${f}|${ok}|${r.submitter || ""}`;
    const g = groups.get(k) || { f, l: null, ok, submitter: r.submitter || "", name: r.by_name || null, n: 0, more_n: 0, canvas_n: 0, shipped_n: 0 };
    g.n++;
    if (String(r.route || "") === "incomplete" && r.decision == null) g.more_n++;
    const at = String(r.decided_at || r.created_at || "");
    if (ok && (String(r.components || "") !== "" || String(r.screens || "") !== "") && at >= since && at < pub) g.canvas_n++;
    groups.set(k, g);
  }
  return weekOf({ rows: [...groups.values()], since: o.since }, o);
}
