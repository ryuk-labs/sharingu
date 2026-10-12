// src/broadcastlive.js — Broadcast's live picture (sprint 2; the owner's MCQ of 2026-10-01: "the last week's contributions
// as dots flowing from people to the goals they name, replayed on open and live after; hover follows one person or goal; a
// dot opens its filing").
//
//   readLive(env, reader, q)   the read: ONE D1 statement (src/hotsql.js BROADCAST_LIVE_SQL: the project's landed
//                              contributions of the last LIVE_DAYS days, newest LIVE_LIMIT, each with its person and its
//                              goal's title by primary key); with q.since the poll (BROADCAST_POLL_SQL: only what landed from
//                              then on, LIVE_POLL_LIMIT at most). GET /broadcast/live answers it as JSON; the Broadcast page
//                              reads it in-process for its first paint. A failed statement is live:'unreachable'; a quota
//                              error propagates.
//   liveKit()                  the drawing, pure and self-contained (no closure over this module): the server draws the
//                              first paint with it and the client embeds its own source (liveKit.toString(), the Map's
//                              pattern), so a redraw in the browser and the server's markup are the same code.
//   renderLive(m, o)           the region (data-region="live-picture"): the SVG (people left, the goals they named right,
//                              one curve per person and goal, every contribution a dot that sits at its goal, a goal-less
//                              one on the quiet "unaligned" row), the same picture as a list (people, their goals, the
//                              counts and each filing as a link: what assistive tech reads, and a phone's whole surface, the
//                              curves hidden), and the client.
//   LIVE_CLIENT                adopts the drawing at the real width; under html.u-motion replays the week (each dot travels
//                              its curve from its person to its goal, staggered by filing time, under a second in all, the
//                              goal pinging as dots land); hover or focus on a person or a goal dims the rest; then polls
//                              GET /broadcast/live?since= on focus and every 30 s while the tab is visible (never on load)
//                              and flies what is new. Reduced motion: no travel, the dots sit at their goals.
import { db } from "./data.js";
import { BROADCAST_LIVE_SQL, BROADCAST_POLL_SQL, LIVE_DAYS, LIVE_LIMIT, LIVE_POLL_LIMIT } from "./hotsql.js";
import { withProfile } from "./core.js";
import { projectOf } from "./project.js";
import { avatarOf } from "./hats.js";
import { isD1Quota, isEvalMark } from "./util.js";
import { esc, unreachableState } from "./ui.js";
import { orgPath, ORG_PATH_CLIENT } from "./orgpath.js";   // sprint 7, 7.4: liveKit draws its links with it (on the server this import, in the page the client twin, src/orgpath.js ORG_PATH_CLIENT)

export const LIVE_EMPTY = "Nothing landed this week";
export const LIVE_DOWN = "The live picture could not be read from the ledger, so it draws nothing until it answers.";
export const UNALIGNED = "Unaligned";
// the voice rule (no em dash anywhere on glass): every word the picture draws passes here
const noDash = (v) => String(v ?? "").replace(/\s*[\u2014\u2013]\s*/g, " - ");
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const WHAT_MAX = 140;

// modelOfRows(rows) -> { people, goals, dots } (pure): one person per submitter (initials and tone off src/hats.js avatarOf),
// one goal per goal_ref ('' none: the unaligned row; a ref with no title is not in the goal tree), one dot per filing
export function modelOfRows(rows) {
  const people = new Map(), goals = new Map(), dots = [];
  for (const r of rows || []) {
    const pid = String(r.submitter || "?");
    if (!people.has(pid)) { const a = avatarOf({ id: pid, name: r.by_name || "", avatar: r.avatar || null }); people.set(pid, { id: pid, name: noDash(r.by_name || "Someone"), initials: a.initials, tone: a.tone, n: 0 }); }
    people.get(pid).n++;
    const ref = r.goal_ref ? String(r.goal_ref) : null;
    const gk = ref || "";
    if (!goals.has(gk)) goals.set(gk, { ref, title: noDash(ref ? (r.goal_title || ref) : UNALIGNED), known: !!(ref && r.goal_title), n: 0 });
    goals.get(gk).n++;
    // the dot sits at when the work happened (happenedAt, migrate-051), else when it was filed
    dots.push({ id: String(r.id), by: pid, goal: ref, at: r.happened_at || r.created_at || null, kind: r.kind || null, what: noDash(r.what || "").slice(0, WHAT_MAX) });
  }
  const byN = (a, b) => b.n - a.n || String(a.name || a.title).localeCompare(String(b.name || b.title));
  const gs = [...goals.values()];
  return {
    people: [...people.values()].sort(byN),
    goals: [...gs.filter((g) => g.ref && g.known).sort(byN), ...gs.filter((g) => g.ref && !g.known).sort(byN), ...gs.filter((g) => !g.ref)],
    dots: dots.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1)),
  };
}

// readLive(env, reader, q) -> { project, days, since, at, limit, more, people, goals, dots, poll?, eval?, live?:'unreachable' }
//   q: { eval?, since? } (a URLSearchParams or an object). since: an ISO time, the poll (only what landed from then on).
export async function readLive(env, reader, q = {}) {
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : q && q[k]);
  const includeEval = isEvalMark(get("eval"));
  const key = await projectOf(env).catch((e) => { if (isD1Quota(e)) throw e; return null; });
  const cutoff = new Date(Date.now() - LIVE_DAYS * 86400000).toISOString();
  const sinceArg = String(get("since") || "");
  const poll = ISO.test(sinceArg);
  const since = poll && sinceArg > cutoff ? sinceArg : cutoff;
  const base = { project: key ? { key } : null, days: LIVE_DAYS, since, limit: poll ? LIVE_POLL_LIMIT : LIVE_LIMIT, ...(poll ? { poll: true } : {}), ...(includeEval ? { eval: true } : {}) };
  if (!key) return { ...base, at: since, more: false, people: [], goals: [], dots: [] };
  const limit = poll ? LIVE_POLL_LIMIT : LIVE_LIMIT;
  let rows;
  try {
    const res = await withProfile((cols) => db(env).prepare((poll ? BROADCAST_POLL_SQL : BROADCAST_LIVE_SQL)(includeEval, cols)).bind(key, since, cutoff, limit + 1).all(), ", p.avatar");
    rows = (res && res.results) || [];
  } catch (e) {
    if (isD1Quota(e)) throw e;
    return { ...base, at: since, more: false, people: [], goals: [], dots: [], live: "unreachable" };
  }
  const more = rows.length > limit;
  const kept = rows.slice(0, limit);   // the newest (the page) or the oldest new ones (the poll: `more` asks for the rest next time)
  const m = modelOfRows(kept);
  const at = kept.reduce((x, r) => (r.created_at && r.created_at > x ? r.created_at : x), since);
  return { ...base, at, more, ...m };
}

// ---- the kit: layout + drawing, shared by the server and the client (embedded by its own source; keep it self-contained) ----
export function liveKit() {
  var RH = 40, PAD = 10, PITCH = 7, DR = 2.6, MAXP = 10, MAXG = 10;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cut(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, Math.max(1, n - 1)).replace(/\s+$/, "") + "…" : s; }
  function two(n) { return n < 10 ? "0" + n : "" + n; }
  // a date-only time (a happenedAt sent as YYYY-MM-DD) is shown as its day, never as a made-up 00:00
  function when(iso) { var d = new Date(iso); if (isNaN(d.getTime())) return ""; return d.getUTCDate() + " " + MON[d.getUTCMonth()] + (String(iso).length === 10 ? "" : " " + two(d.getUTCHours()) + ":" + two(d.getUTCMinutes())); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function plural(n, w) { return n + " " + (n === 1 ? w : w + "s"); }
  // layout(m, W) -> L: rows, anchors, curves and every drawn dot's resting place, for a drawing W wide
  function layout(m, W) {
    W = Math.max(600, Math.round(W || 1100));
    var PW = Math.round(clamp(W * 0.24, 190, 260)), GW = Math.round(clamp(W * 0.33, 240, 380));
    var PA = PW + 12, GX = W - GW;
    var people = (m.people || []).slice(), goals = (m.goals || []).slice(), dots = (m.dots || []).slice();
    // people: the first MAXP-1 and one folded row for the rest
    var P = [], pIx = {}, i;
    var pShow = people.length > MAXP ? MAXP - 1 : people.length;
    for (i = 0; i < pShow; i++) { P.push({ id: people[i].id, name: people[i].name, initials: people[i].initials, tone: people[i].tone, n: people[i].n }); pIx[people[i].id] = i; }
    if (people.length > pShow) { var rest = people.slice(pShow), rn = 0; rest.forEach(function (p) { rn += p.n; pIx[p.id] = pShow; }); P.push({ id: "", fold: rest.length, name: "+" + rest.length + " more " + (rest.length === 1 ? "person" : "people"), initials: "+" + rest.length, tone: "stone", n: rn }); }
    // goals: the named ones (the most fed first), one folded row past MAXG, the unaligned row always last
    var named = goals.filter(function (g) { return g.ref; }), un = goals.filter(function (g) { return !g.ref; })[0] || null;
    var room = MAXG - (un ? 1 : 0), G = [], gIx = {};
    var gShow = named.length > room ? room - 1 : named.length;
    for (i = 0; i < gShow; i++) { G.push({ key: named[i].ref, ref: named[i].ref, title: named[i].title, known: !!named[i].known, n: named[i].n }); gIx[named[i].ref] = i; }
    if (named.length > gShow) { var gr = named.slice(gShow), gn = 0; gr.forEach(function (g) { gn += g.n; gIx[g.ref] = gShow; }); G.push({ key: "~more", fold: gr.length, title: "+" + gr.length + " more goals", known: true, n: gn }); }
    if (un) { gIx[""] = G.length; G.push({ key: "", ref: null, title: un.title, unaligned: true, known: false, n: un.n }); }
    var rows = Math.max(P.length, G.length, 1), H = PAD * 2 + rows * RH;
    var oP = PAD + (rows - P.length) * RH / 2, oG = PAD + (rows - G.length) * RH / 2;
    P.forEach(function (p, k) { p.y = Math.round(oP + k * RH + RH / 2); });
    G.forEach(function (g, k) { g.y = Math.round(oG + k * RH + RH / 2); g.dots = []; });
    // the dots: each on its person's row and its goal's row; a goal keeps the newest `cap` drawn (the rest are counted)
    var cap = Math.max(6, Math.floor((W - (GX + 16) - 40) / PITCH));
    var pairs = {}, D = [];
    dots.forEach(function (d) {
      var p = pIx[d.by], g = gIx[d.goal || ""];
      if (p == null || g == null) return;
      var key = p + "-" + g;
      if (!pairs[key]) pairs[key] = { p: p, g: g, n: 0 };
      pairs[key].n++;
      var o = { id: d.id, p: p, g: g, at: d.at, what: d.what, by: P[p] && !P[p].fold ? P[p].name : (people.filter(function (x) { return x.id === d.by; })[0] || {}).name || "" };
      G[g].dots.push(o); D.push(o);
    });
    G.forEach(function (g) {
      g.dots.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
      var shown = g.dots.slice(Math.max(0, g.dots.length - cap));
      g.over = g.dots.length - shown.length;
      shown.forEach(function (o, k) { o.x = GX + 16 + DR + k * PITCH; o.y = g.y + 9; o.drawn = 1; });
    });
    var dx = GX - PA, C = [];
    Object.keys(pairs).forEach(function (k) {
      var q = pairs[k], y1 = P[q.p].y, y2 = G[q.g].y;
      q.d = "M" + PA + " " + y1 + "C" + (PA + dx * 0.46).toFixed(1) + " " + y1 + " " + (GX - dx * 0.46).toFixed(1) + " " + y2 + " " + GX + " " + y2;
      var un = !!G[q.g].unaligned;
      q.w = +(1 + Math.min(un ? 1 : 4.5, Math.log(q.n) / Math.LN2 * (un ? 0.5 : 1.2))).toFixed(2);
      q.key = k; C.push(q);
    });
    return { W: W, H: H, PW: PW, GW: GW, PA: PA, GX: GX, RH: RH, P: P, G: G, C: C, D: D, cap: cap, total: dots.length };
  }
  // svg(L) -> the inner markup of the drawing (curves, people, goals, dots), every hook a data attribute
  function svg(L) {
    var o = [];
    o.push('<g class="lv-cs" aria-hidden="true">');
    L.C.forEach(function (c) { o.push('<path class="lv-c' + (L.G[c.g].unaligned ? " lv-cu" : "") + '" id="lv-c-' + c.key + '" data-p="' + c.p + '" data-g="' + c.g + '" d="' + c.d + '" style="stroke-width:' + c.w + 'px"/>'); });
    o.push("</g><g class=\"lv-ps\">");
    var nameMax = Math.max(8, Math.floor((L.PW - 34 - 34) / 6.9));
    L.P.forEach(function (p, i) {
      o.push('<g class="lv-p' + (p.fold ? " lv-fold" : "") + '" data-hp="' + i + '" tabindex="0" role="button" aria-label="' + esc(p.name + ", " + plural(p.n, "contribution")) + '">' +
        '<rect class="lv-hit" x="-6" y="' + (p.y - L.RH / 2) + '" width="' + (L.PA + 10) + '" height="' + L.RH + '" rx="8"/>' +
        '<circle class="lv-av u-av-fill" data-tone="' + esc(p.tone || "stone") + '" cx="13" cy="' + p.y + '" r="13"/>' +
        '<text class="lv-ini" x="13" y="' + (p.y + 3.6) + '" text-anchor="middle">' + esc(String(p.initials || "?").slice(0, 3)) + "</text>" +
        '<text class="lv-pn" x="34" y="' + (p.y + 4.5) + '">' + esc(cut(p.name, nameMax)) + "</text>" +
        '<text class="lv-n" x="' + L.PW + '" y="' + (p.y + 4) + '" text-anchor="end" data-n="p' + i + '">' + p.n + "</text>" +
        '<circle class="lv-pa" cx="' + L.PA + '" cy="' + p.y + '" r="2.6"/></g>');
    });
    o.push("</g><g class=\"lv-gs\">");
    var titleMax = Math.max(10, Math.floor((L.W - (L.GX + 16) - 40) / 6.9));
    L.G.forEach(function (g, j) {
      o.push('<g class="lv-g' + (g.unaligned ? " lv-un" : "") + (g.fold ? " lv-fold" : "") + (!g.known && !g.unaligned && !g.fold ? " lv-unknown" : "") + '" data-hg="' + j + '" tabindex="0" role="button" aria-label="' + esc(g.title + ", " + plural(g.n, "contribution")) + '">' +
        '<rect class="lv-hit" x="' + (L.GX - 10) + '" y="' + (g.y - L.RH / 2) + '" width="' + (L.W - L.GX + 16) + '" height="' + L.RH + '" rx="8"/>' +
        '<circle class="lv-ga" cx="' + L.GX + '" cy="' + g.y + '" r="4.5"/><circle class="lv-ring" cx="' + L.GX + '" cy="' + g.y + '" r="4.5"/>' +
        '<text class="lv-gt" x="' + (L.GX + 16) + '" y="' + (g.y - 3) + '">' + esc(cut(g.title, titleMax)) + (!g.known && !g.unaligned && !g.fold ? '<tspan class="lv-gq"> not in the tree</tspan>' : "") + "</text>" +
        '<text class="lv-n" x="' + L.W + '" y="' + (g.y - 3) + '" text-anchor="end" data-n="g' + j + '">' + g.n + "</text>" +
        (g.over ? '<text class="lv-over" x="' + (L.W) + '" y="' + (g.y + 12) + '" text-anchor="end">+' + g.over + "</text>" : "") + "</g>");
    });
    o.push("</g><g class=\"lv-ds\" aria-hidden=\"true\">");
    L.D.forEach(function (d) {
      if (!d.drawn) return;
      o.push('<a class="lv-d' + (L.G[d.g].unaligned ? " lv-du" : "") + '" href="' + orgPath('/contribution/') + encodeURIComponent(d.id) + '" data-id="' + esc(d.id) + '" data-p="' + d.p + '" data-g="' + d.g + '" data-at="' + esc(d.at || "") + '" tabindex="-1">' +
        "<title>" + esc(cut(d.what || "A contribution", 90) + " · " + d.by + " · " + when(d.at)) + "</title>" +
        '<circle cx="' + d.x.toFixed(1) + '" cy="' + d.y + '" r="' + DR + '"/></a>');
    });
    o.push("</g>");
    return o.join("");
  }
  // list(m) -> the same picture as a list: every person, the goals they fed with the count, each filing a link (what
  // assistive tech reads; a phone's whole surface)
  function list(m) {
    var goals = {}; (m.goals || []).forEach(function (g) { goals[g.ref || ""] = g; });
    var SHOW = 8;
    var dot = function (d, g) { var t = cut(d.what || "A contribution", 90); return '<a class="lv-ld' + (g.ref ? "" : " lv-du") + '" href="' + orgPath('/contribution/') + encodeURIComponent(d.id) + '" title="' + esc(t + " \u00b7 " + when(d.at)) + '"><span class="u-sr">' + esc(t + ", " + when(d.at)) + "</span></a>"; };
    var item = function (p) {
      var mine = (m.dots || []).filter(function (d) { return d.by === p.id; }), byG = {}, order = [];
      mine.forEach(function (d) { var k = d.goal || ""; if (!byG[k]) { byG[k] = []; order.push(k); } byG[k].push(d); });
      order.sort(function (a, b) { return (a === "" ? 1 : 0) - (b === "" ? 1 : 0) || byG[b].length - byG[a].length; });
      return '<li class="lv-li"><div class="lv-lh"><span class="u-avatar" data-tone="' + esc(p.tone || "stone") + '" aria-hidden="true">' + esc(String(p.initials || "?").slice(0, 3)) + "</span>" +
        '<span class="lv-lname">' + esc(p.name) + '</span><span class="lv-ln">' + plural(p.n, "contribution") + "</span></div><ul>" +
        order.map(function (k) {
          var g = goals[k] || { title: k || "Unaligned", ref: k || null, known: false }, ds = byG[k];
          var label = g.ref && g.known ? '<a class="lv-lg" href="' + orgPath('/goals/') + encodeURIComponent(g.ref) + '">' + esc(g.title) + "</a>" : '<span class="lv-lg' + (g.ref ? "" : " lv-lgu") + '">' + esc(g.title) + (g.ref && !g.known ? " (not in the tree)" : "") + "</span>";
          return '<li><div class="lv-lgrow">' + label + '<span class="lv-ln">' + ds.length + '</span></div><div class="lv-ldots">' + ds.map(function (d) { return dot(d, g); }).join("") + "</div></li>";
        }).join("") + "</ul></li>";
    };
    var ps = m.people || [], rest = ps.length - SHOW;
    return '<ol class="lv-list">' + ps.slice(0, SHOW).map(item).join("") + "</ol>" +
      (rest > 0 ? '<details class="lv-rest"><summary class="lv-ls">' + rest + " more " + (rest === 1 ? "person" : "people") + '</summary><ol class="lv-list">' + ps.slice(SHOW).map(item).join("") + "</ol></details>" : "");
  }
  return { layout: layout, svg: svg, list: list, esc: esc, cut: cut, when: when, plural: plural, RH: RH };
}

// the stat line of the region's head (the client keeps it current on a poll)
const plural = (n, w) => `${n} ${n === 1 ? w : w + "s"}`;
function statsOf(m) {
  const goals = (m.goals || []).filter((g) => g.ref).length;
  return `<span data-lv="n">${esc(plural((m.dots || []).length, "contribution"))}</span> · <span data-lv="p">${esc(plural((m.people || []).length, "person").replace("persons", "people"))}</span> · <span data-lv="g">${esc(plural(goals, "goal"))} named</span>`;
}
const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// renderLive(m, { project }) -> the region: its head, the drawing, the list and the client (or its EMPTY / UNREACHABLE)
export function renderLive(m, o = {}) {
  const r = m || {};
  // sprint 3 L3 (the revision): a card (its tiny label, the counts and the live dot on the right); no hover legend on the page (the
  // drawing's own name says it, and the list under it names every contribution)
  const head = (aside) => `<header class="p-card-head"><h2 class="p-label">This week</h2><div class="p-card-act lv-aside">${aside}</div></header>`;
  const SEC = '<section class="p-card lv-sec" aria-label="This week" data-region="live-picture" data-reveal="2">';
  if (r.live === "unreachable") return `${SEC}${head("")}<div class="p-card-body">${unreachableState({ what: LIVE_DOWN })}</div></section>`;
  if (!r.project) return `${SEC}${head("")}<div class="p-card-body"><div class="p-empty" data-state="empty"><span>Pick a project</span></div></div></section>`;
  if (!(r.dots || []).length) {
    const data = { m: { people: [], goals: [], dots: [] }, at: r.at || "", project: r.project.key, eval: !!r.eval };
    return `${SEC}${head(`<span class="lv-live" title="New contributions appear here as they land">live</span>`)}
<div class="lv p-card-body" id="lv" data-empty="1"><div class="p-empty" data-state="empty"><span>${esc(LIVE_EMPTY)}</span></div><div class="lv-stage" hidden><svg class="lv-svg" id="lv-svg" aria-hidden="true" focusable="false"></svg></div>
<details class="lv-wrap" id="lv-wrap" hidden><summary class="lv-ls">Every contribution, as a list</summary><div id="lv-list"></div></details></div>
<script type="application/json" id="lv-data">${json(data)}</script><script>${LIVE_CLIENT}</script></section>`;
  }
  const K = liveKit();
  const L = K.layout(r, 1100);
  const more = r.more ? `<span class="lv-more">the newest ${esc(String(r.limit))}</span> · ` : "";
  const data = { m: { people: r.people, goals: r.goals, dots: r.dots }, at: r.at || "", project: r.project.key, eval: !!r.eval };
  return `${SEC}${head(`${more}${statsOf(r)} <span class="lv-live" title="New contributions appear here as they land">live</span>`)}
<div class="lv p-card-body" id="lv" data-replay="1">
  <div class="lv-stage"><svg class="lv-svg" id="lv-svg" viewBox="0 0 ${L.W} ${L.H}" width="100%" preserveAspectRatio="xMinYMin meet" role="group" aria-label="${esc(`This week: ${plural((r.dots || []).length, "contribution")} from ${plural((r.people || []).length, "person").replace("persons", "people")}. Focus a person or a goal to follow it; the list below names every contribution.`)}">${K.svg(L)}</svg></div>
  <details class="lv-wrap" id="lv-wrap"><summary class="lv-ls">Every contribution, as a list <b>${(r.dots || []).length}</b></summary><div id="lv-list">${K.list(r)}</div></details>
  <p class="u-sr" id="lv-say" aria-live="polite"></p>
</div>
<script type="application/json" id="lv-data">${json(data)}</script><script>${LIVE_CLIENT}</script></section>`;
}

// the region's own sheet: semantic tokens only (Paper and Ink from the same names)
export const LIVE_CSS = `<style>
.lv-sec .u-section-head{margin-bottom:10px}
.lv-aside{flex-wrap:wrap;justify-content:flex-end;font:400 12.5px/1.4 var(--sans);color:var(--text-muted)}
.lv-aside [data-lv]{color:var(--text-muted)}
.lv-more{color:var(--text-faint)}
.lv-live{display:inline-flex;align-items:center;gap:5px;font:500 11px/1 var(--mono);color:var(--text-faint);letter-spacing:.04em}
.lv-live::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--ok)}
.lv{position:relative}
.lv-stage{position:relative;margin:0 -6px;padding:0 6px}
.lv-svg{display:block;width:100%;height:auto;overflow:visible}
.lv-c{fill:none;stroke:var(--line-strong);stroke-linecap:round;opacity:.85}
.lv-cu{stroke:var(--stone);stroke-dasharray:1 4;opacity:.5}
.lv-hit{fill:transparent}
.lv-p,.lv-g{cursor:default;outline:none}
.lv-p:hover .lv-hit,.lv-g:hover .lv-hit,.lv-p:focus-visible .lv-hit,.lv-g:focus-visible .lv-hit{fill:var(--hover)}
.lv-p:focus-visible .lv-hit,.lv-g:focus-visible .lv-hit{stroke:var(--focus);stroke-width:1.5}
.lv-ini{font:600 9.5px/1 var(--mono);fill:var(--text);letter-spacing:.02em}
.lv-pn{font:500 13px/1 var(--sans);fill:var(--text)}
.lv-fold .lv-pn,.lv-fold .lv-gt{fill:var(--text-muted)}
.lv-n{font:500 11.5px/1 var(--sans);fill:var(--text-faint);font-variant-numeric:tabular-nums}
.lv-over{font:500 10.5px/1 var(--sans);fill:var(--text-faint);font-variant-numeric:tabular-nums}
.lv-pa{fill:var(--line-strong)}
.lv-ga{fill:var(--page);stroke:var(--text-muted);stroke-width:1.5}
.lv-un .lv-ga{stroke:var(--stone);stroke-dasharray:2 2}
.lv-ring{fill:none;stroke:none;opacity:0}
.lv-gt{font:600 13px/1 var(--sans);fill:var(--text)}
.lv-un .lv-gt{font-weight:500;fill:var(--text-muted)}
.lv-unknown .lv-gt{font-weight:500}
.lv-gq{font:400 11px/1 var(--mono);fill:var(--text-faint)}
.lv-d circle{fill:var(--text);stroke:var(--page);stroke-width:.8}
.lv-du circle{fill:var(--stone)}
.lv-d{cursor:pointer}
.lv-d:hover circle{stroke:var(--text);stroke-width:1.4}
.lv-svg .lv-p,.lv-svg .lv-g,.lv-svg .lv-c,.lv-svg .lv-d{transition:opacity var(--dur-fast) var(--ease)}
.lv-hov .lv-c:not(.on){opacity:.12}
.lv-hov .lv-p:not(.on),.lv-hov .lv-g:not(.on){opacity:.32}
.lv-hov .lv-d:not(.on){opacity:.16}
.lv-hov .lv-c.on{stroke:var(--text-muted);opacity:1}
.lv-hov .lv-cu.on{stroke:var(--stone)}
.u-motion .lv[data-replay] .lv-d{opacity:0}
.u-motion:not(.u-js) .lv[data-replay] .lv-d{animation:u-show 1ms 2.4s forwards}
.u-motion .lv-g.lv-ping .lv-ring{stroke:var(--accent);stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:u-ping 520ms var(--ease) 1}
.lv-wrap{margin:10px 0 0;border-top:1px solid var(--line)}
.lv-ls{display:flex;align-items:center;gap:8px;padding:9px 0;font:500 12.5px/1.3 var(--sans);color:var(--text-muted);cursor:pointer;list-style:none}
.lv-ls::-webkit-details-marker{display:none}
.lv-ls b{font:500 11px/1 var(--mono);color:var(--text-faint)}
.lv-ls:hover{color:var(--text)}
.lv-list{list-style:none;margin:0;padding:0;columns:2 320px;column-gap:40px}
.lv-li{break-inside:avoid;padding:8px 0 10px;border-top:1px solid var(--line)}
.lv-lh{display:flex;align-items:center;gap:10px;min-height:30px}
.lv-lname{flex:1;min-width:0;font:600 13.5px/1.3 var(--sans);color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lv-ln{flex:none;font:500 11.5px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.lv-li ul{list-style:none;margin:4px 0 0;padding:0 0 0 38px}
.lv-li li{padding:3px 0 5px;font:400 12.5px/1.4 var(--sans);color:var(--text-muted)}
.lv-lgrow{display:flex;align-items:baseline;gap:10px}
.lv-lg{flex:1;min-width:0;color:var(--text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
a.lv-lg:hover{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
.lv-lgu{color:var(--text-muted)}
.lv-ldots{display:flex;flex-wrap:wrap;gap:3px;margin:4px 0 0}
.lv-rest>.lv-ls{border-top:1px solid var(--line)}
.lv-ld{display:block;width:8px;height:8px;border-radius:50%;background:var(--text-muted)}
.lv-ld.lv-du{background:var(--stone)}
.lv-ld:hover,.lv-ld:focus-visible{box-shadow:0 0 0 2px var(--surface),0 0 0 3.5px var(--text)}
@media (max-width:760px){
  .lv-sec .u-section-head{flex-direction:column;align-items:flex-start;gap:4px}
  .lv-aside{justify-content:flex-start}
  .lv-stage{display:none}
  .lv-wrap{border-top:0;margin:0}
  .lv-wrap>.lv-ls{display:none}
  .lv-list{columns:1}
  .lv-li ul{padding-left:38px}
  .lv-ldots{gap:7px}
  .lv-ld{position:relative;width:10px;height:10px}
  .lv-ld::after{content:"";position:absolute;inset:-6px}
}
</style>`;

// ---- the client ----
const strip = (src) => src.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
const CLIENT = strip(`
(function(){
  var root=document.getElementById('lv'),dataEl=document.getElementById('lv-data');if(!root||!dataEl)return;
  var D;try{D=JSON.parse(dataEl.textContent);}catch(e){return;}
  var K=LIVEKIT(),M=document.documentElement.classList.contains('u-motion');
  var svg=document.getElementById('lv-svg'),stage=root.querySelector('.lv-stage'),wrap=document.getElementById('lv-wrap'),listEl=document.getElementById('lv-list'),say=document.getElementById('lv-say');
  var phone=window.matchMedia?window.matchMedia('(max-width:760px)'):{matches:false};
  var m=D.m||{people:[],goals:[],dots:[]},L=null,since=D.at||'',seen={};
  m.dots.forEach(function(d){seen[d.id]=1;});
  var sec=root.closest?root.closest('[data-region="live-picture"]'):null;
  function width(){return Math.round((stage&&stage.clientWidth)||root.clientWidth||1100);}
  function draw(){if(!svg||!m.dots.length)return;L=K.layout(m,width());svg.setAttribute('viewBox','0 0 '+L.W+' '+L.H);svg.innerHTML=K.svg(L);}
  function lists(){if(listEl)listEl.innerHTML=K.list(m);var b=wrap&&wrap.querySelector('.lv-ls b');if(b)b.textContent=String(m.dots.length);}
  function stats(){if(!sec)return;var g=m.goals.filter(function(x){return x.ref;}).length,set=function(k,t){var e=sec.querySelector('[data-lv="'+k+'"]');if(e&&e.textContent!==t){e.textContent=t;}};
    set('n',K.plural(m.dots.length,'contribution'));set('p',K.plural(m.people.length,'person').replace('persons','people'));set('g',K.plural(g,'goal')+' named');}
  // ---- hover follows one person or one goal ----
  function follow(kind,i){
    if(!svg)return;var on={p:{},g:{}};
    if(kind==='p'){on.p[i]=1;L.C.forEach(function(c){if(c.p===i)on.g[c.g]=1;});}
    else{on.g[i]=1;L.C.forEach(function(c){if(c.g===i)on.p[c.p]=1;});}
    svg.classList.add('lv-hov');
    [].forEach.call(svg.querySelectorAll('[data-hp]'),function(e){e.classList.toggle('on',!!on.p[+e.getAttribute('data-hp')]);});
    [].forEach.call(svg.querySelectorAll('[data-hg]'),function(e){e.classList.toggle('on',!!on.g[+e.getAttribute('data-hg')]);});
    [].forEach.call(svg.querySelectorAll('.lv-c,.lv-d'),function(e){var p=+e.getAttribute('data-p'),g=+e.getAttribute('data-g');e.classList.toggle('on',kind==='p'?p===i:g===i);});
  }
  function unfollow(){if(!svg)return;svg.classList.remove('lv-hov');[].forEach.call(svg.querySelectorAll('.on'),function(e){e.classList.remove('on');});}
  var cur=null;
  function target(e){var t=e.target&&e.target.closest?e.target.closest('[data-hp],[data-hg]'):null;return t?(t.hasAttribute('data-hp')?'p'+t.getAttribute('data-hp'):'g'+t.getAttribute('data-hg')):null;}
  function hover(k){if(k===cur)return;cur=k;if(!k){unfollow();return;}follow(k[0],+k.slice(1));}
  if(svg){
    svg.addEventListener('pointerover',function(e){var k=target(e);if(k)hover(k);else if(e.target&&e.target.closest&&e.target.closest('.lv-d')){var d=e.target.closest('.lv-d');hover('p'+d.getAttribute('data-p'));}});
    svg.addEventListener('pointerleave',function(){hover(null);});
    svg.addEventListener('focusin',function(e){var k=target(e);if(k)hover(k);});
    svg.addEventListener('focusout',function(){hover(null);});
    svg.addEventListener('keydown',function(e){if(e.key!=='Enter'&&e.key!==' ')return;var k=target(e);if(!k)return;e.preventDefault();var ds=[].filter.call(svg.querySelectorAll('.lv-d'),function(d){return d.getAttribute(k[0]==='p'?'data-p':'data-g')===k.slice(1);});var last=ds[ds.length-1];if(last)location.href=last.getAttribute('href');});
  }
  // ---- the replay: each dot travels its curve, staggered by filing time, under a second in all ----
  // window.__lvSlow (a screenshot's hook, tools/shots.mjs broadcast-flight) stretches the replay to catch it mid-flight
  var SLOW=Math.max(1,+(window.__lvSlow||1))||1,SPREAD=380*SLOW,DUR=560*SLOW;
  function samples(path){var n=28,len=path.getTotalLength(),out=[];for(var k=0;k<=n;k++){var p=path.getPointAtLength(len*k/n);out.push([p.x,p.y]);}return out;}
  function at(s,f){var x=f*(s.length-1),i=Math.min(s.length-2,Math.floor(x)),r=x-i;return [s[i][0]+(s[i+1][0]-s[i][0])*r,s[i][1]+(s[i+1][1]-s[i][1])*r];}
  function ease(t){return 1-Math.pow(1-t,3);}
  function fly(only,countUp){
    if(!svg||!M)return;
    var ds=[].slice.call(svg.querySelectorAll('.lv-d')).filter(function(e){return !only||only[e.getAttribute('data-id')];});
    ds.sort(function(a,b){var x=a.getAttribute('data-at'),y=b.getAttribute('data-at');return x<y?-1:x>y?1:0;});
    if(!ds.length){root.removeAttribute('data-replay');return;}
    var cache={},left={};
    ds.forEach(function(e,i){var c=e.querySelector('circle'),key=e.getAttribute('data-p')+'-'+e.getAttribute('data-g'),path=document.getElementById('lv-c-'+key);
      if(!cache[key])cache[key]=path?samples(path):[[+c.getAttribute('cx'),+c.getAttribute('cy')],[+c.getAttribute('cx'),+c.getAttribute('cy')]];
      e.__a={c:c,s:cache[key],fx:+c.getAttribute('cx'),fy:+c.getAttribute('cy'),d:ds.length>1?SPREAD*i/(ds.length-1):0,g:e.getAttribute('data-g')};
      var p0=cache[key][0];c.setAttribute('cx',p0[0].toFixed(1));c.setAttribute('cy',p0[1].toFixed(1));e.style.opacity='0';
      left[e.__a.g]=(left[e.__a.g]||0)+1;});
    var counts={};
    if(countUp)Object.keys(left).forEach(function(g){var n=svg.querySelector('[data-n="g'+g+'"]');if(n){counts[g]={el:n,fin:+n.textContent,v:Math.max(0,+n.textContent-left[g])};n.textContent=String(counts[g].v);}});
    root.removeAttribute('data-replay');
    var t0=performance.now();
    function land(a){a.c.setAttribute('cx',a.fx.toFixed(1));a.c.setAttribute('cy',String(a.fy));
      var g=svg.querySelector('[data-hg="'+a.g+'"]');if(g){g.classList.remove('lv-ping');void g.getBoundingClientRect();g.classList.add('lv-ping');}
      var k=counts[a.g];if(k){k.v=Math.min(k.fin,k.v+1);k.el.textContent=String(k.v);}}
    (function frame(t){var busy=false;
      ds.forEach(function(e){var a=e.__a;if(a.done)return;var k=(t-t0-a.d)/DUR;if(k<0){busy=true;return;}
        if(k>=1){a.done=1;e.style.opacity='';land(a);return;}busy=true;e.style.opacity='1';
        var q;if(k<0.84){q=at(a.s,ease(k/0.84));}else{var h=ease((k-0.84)/0.16),end=a.s[a.s.length-1];q=[end[0]+(a.fx-end[0])*h,end[1]+(a.fy-end[1])*h];}
        a.c.setAttribute('cx',q[0].toFixed(1));a.c.setAttribute('cy',q[1].toFixed(1));});
      if(busy)requestAnimationFrame(frame);})(t0);
  }
  // ---- the poll: what landed since, on focus and every 30 s while the tab is visible (never on load) ----
  var last=Date.now();
  function merge(x){
    var fresh={},n=0,byId={};m.people.forEach(function(p){byId[p.id]=p;});var gk={};m.goals.forEach(function(g){gk[g.ref||'']=g;});
    (x.people||[]).forEach(function(p){if(!byId[p.id]){byId[p.id]={id:p.id,name:p.name,initials:p.initials,tone:p.tone,n:0};m.people.push(byId[p.id]);}});
    (x.goals||[]).forEach(function(g){var k=g.ref||'';if(!gk[k]){gk[k]={ref:g.ref,title:g.title,known:g.known,n:0};if(g.ref)m.goals.splice(m.goals.filter(function(y){return y.ref;}).length,0,gk[k]);else m.goals.push(gk[k]);}});
    (x.dots||[]).forEach(function(d){if(seen[d.id])return;seen[d.id]=1;m.dots.push(d);fresh[d.id]=1;n++;if(byId[d.by])byId[d.by].n++;var g=gk[d.goal||''];if(g)g.n++;});
    if(!n)return 0;
    m.people.sort(function(a,b){return b.n-a.n||String(a.name).localeCompare(String(b.name));});
    var named=m.goals.filter(function(g){return g.ref;}).sort(function(a,b){return (b.known?1:0)-(a.known?1:0)||b.n-a.n;}),un=m.goals.filter(function(g){return !g.ref;});m.goals=named.concat(un);
    if(root.hasAttribute('data-empty')){root.removeAttribute('data-empty');var es=root.querySelector('[data-state="empty"]');if(es)es.remove();if(stage)stage.hidden=false;if(wrap)wrap.hidden=false;}
    draw();lists();stats();if(!phone.matches)fly(fresh,false);
    if(say)say.textContent=n+' new contribution'+(n===1?'':'s')+' landed.';
    return n;
  }
  function poll(){
    if(document.visibilityState!=='visible'||Date.now()-last<5000||!window.fetch)return;last=Date.now();
    fetch(orgPath('/broadcast/live?since=')+encodeURIComponent(since)+(D.project?'&project='+encodeURIComponent(D.project):'')+(D.eval?'&eval=1':''),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}})
      .then(function(r){return r.ok?r.json():null;}).then(function(x){if(!x||x.live)return;if(x.at&&x.at>since)since=x.at;merge(x);}).catch(function(){});
  }
  window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll);setInterval(poll,30000);
  // ---- boot: adopt the drawing at the real width, then replay the week ----
  if(phone.matches&&wrap){wrap.open=true;root.removeAttribute('data-replay');}
  else if(m.dots.length){draw();fly(null,true);}
  else root.removeAttribute('data-replay');
  var lastW=width();
  if(window.ResizeObserver&&stage)new ResizeObserver(function(){var w=width();if(Math.abs(w-lastW)<2||phone.matches)return;lastW=w;draw();}).observe(stage);
  if(phone.addEventListener)phone.addEventListener('change',function(){if(!phone.matches)draw();});
})();
`);
// LIVE_CLIENT: the region's script: the kit's own source, then the client. __name is esbuild's keepNames helper (wrangler
// bundles with it); the kit's source may carry calls to it, so it is defined here too (src/mapclient.js MAP_CLIENT).
export const LIVE_CLIENT = `${ORG_PATH_CLIENT}var __name=function(t){return t;};var LIVEKIT=${liveKit.toString()};\n${CLIENT}`;
