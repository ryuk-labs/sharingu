// sharingu — the Audit trail (one project's; renderActivityAll below: Activity, every project's contributions), the renderer. Content-only (no doc wrapper); the
// caller wraps this with shell() at the route (owner-only page). Plain/
// neutral styling — semantic color used only for the kind chip.
//
// G5 (ADR-089 §5, 2026-08-31): Activity becomes a clean ordered TABLE with simple
// filters as query params (?person=&kind=&lane=&route=&since=), rendered as chip
// selects (kind/lane/route — closed sets) + plain inputs (person/since — open-ended)
// above the table. The data source is unchanged (src/index.js's /audit route still
// reads FROM events e JOIN people p — this file only upgrades the VIEW); index.js now
// composes the filter clauses and passes back both the filtered rows and the current
// filter values + the available chip options, so this file never re-derives either.
//
// esc() now comes from src/ui.js (Pass B de-dup). fmtDate() also now comes from
// src/ui.js (M-ADR-008 T3 de-dup) — this file's usage matched src/pages.js's byte for
// byte, so both fold into ui.js's shared fmtDate with no opts needed (its defaults
// reproduce this file's exact prior behavior).

import { esc, fmtDate, statusChip } from "./ui.js";
import { card, chip, avatar, avatarStack, filterRow, hrefWith, group, line, lines, lineDetail, empty, pageHead, stack, btn, byDay, kindWord } from "./parts.js";
import { LANE_KEYS, LANES } from "./lanes.js";
import { hatOf } from "./hats.js";
import { tempoOf, chipOfTempo, routeWord } from "./tempo.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { clientWordOf } from "./client.js";   // sprint 13, 13.1: which AI filed it

// route is a transmission-table concept (auto | owner | incomplete, schema.sql) — only
// "pr"-kind rows (the events mirror of a filed transmission) ever carry one; every other
// kind shows "—" in that column, which is correct, not missing data.
export const AUDIT_ROUTE_OPTIONS = ["auto", "owner", "incomplete"];
// The envelope lanes (src/lanes.js — the single source the transmission gate itself
// enforces), re-exported here so index.js's /audit route builds its chip options from
// the same list rather than a second hand-typed copy.
export const AUDIT_LANE_OPTIONS = LANE_KEYS;

// kind -> { label, css class }. Subtle color per kind, not loud.
const KIND_DEFS = {
  session_open: { label: "session", cls: "neutral" },
  drift: { label: "drift", cls: "bad" },
  unknown: { label: "question", cls: "warn" },
  ruling: { label: "decision", cls: "good" },
  fragment: { label: "file", cls: "neutral" },
  exit: { label: "report", cls: "good" },
  correction: { label: "correction", cls: "warn" },
  pr: { label: "contribution", cls: "neutral" },   // D1b item 14: the mirror of EVERY filed contribution (any lane), never a "PR"
  gtm: { label: "gtm", cls: "neutral" },
};

// The kind chip options for the Activity filter bar — every KIND_DEFS key except the
// two /audit's own base query already excludes (session_open/exit are Agent R session
// mechanics, not SIRU-domain activity — see index.js's WHERE e.kind NOT IN (...)).
export const AUDIT_KIND_OPTIONS = Object.keys(KIND_DEFS).filter((k) => !["session_open", "exit", "fragment", "file"].includes(k));

const KIND_TONE = { good: "ok", warn: "warn", bad: "bad", neutral: "quiet" };
function kindChip(kind) {
  const def = KIND_DEFS[kind] || { label: String(kind ?? "unknown"), cls: "neutral" };
  return chip(def.label, { tone: KIND_TONE[def.cls] || "quiet", attrs: `data-kind="${esc(kind || "")}"` });
}

// tempo (WP2): a contribution row wears the word its route derives (in · with <owner>); a ruling row is decided (a ruling:
// LANDED). Other kinds carry no tempo — nothing is invented for an item that has none.
function tempoCell(r, ctx) {
  if (r.kind === "ruling") return statusChip("LANDED", "Decided");
  if (r.kind === "pr") { const t = tempoOf({ route: r.route }, ctx && ctx.servedStamp, { ownerName: ctx && ctx.ownerName }); const c = chipOfTempo(t, null, r.route);
    return statusChip(c, c === "LANDED" ? "Landed" : t.charAt(0).toUpperCase() + t.slice(1), c === "OPEN" ? "warn" : undefined); }
  return "";
}

// renderAudit(rows, opts) — the Audit trail (sprint 3, L3: the revision, docs/plan/LOOK.md). opts: { filters, options, nowMs } (G5,
// ADR-089 §5). `rows` are already filtered + ordered by index.js's SQL (newest first) — this file only renders. filters = the
// current { person, kind, lane, route, since, mine } query-param values; options = { kinds, lanes, routes } the chip values,
// both computed by the route. The ONE filter row (kind, lane, route, person: the faces on the rows read, Mine, since: 7 or 30
// days or all), each a link carrying every other filter forward; then the trail by day, each row one line (a face, what, its
// lane, its kind, its route, when) that opens to who and where it leads. Hooks: data-screen="audit", data-region="trail",
// data-kind on a row's kind chip, data-at on a row.
// auditGradeOf(what) -> { check, node, verdict } for a grade's trail line ("grade screen:versions.loads: proven"), else null.
// A check's id is its node's id and a suffix after the last dot (screen:versions.loads -> screen:versions).
export function auditGradeOf(what) {
  const m = /^grade (\S+): (proven|refused|incomplete)\b/.exec(String(what || ""));
  if (!m) return null;
  const i = m[1].lastIndexOf(".");
  return { check: m[1], node: i > 0 ? m[1].slice(0, i) : m[1], verdict: m[2] };
}
// a node's plain name when the Map's read did not answer: the part after its type ("screen:versions" -> "versions")
const plainRef = (id) => String(id || "").replace(/^[a-z]+:/, "");
const laneWord = (l) => { const x = LANES.find((y) => y.key === l); return x ? x.label : l; };
const hhmm = (iso) => { const s = String(iso || ""); return /T\d\d:\d\d/.test(s) ? s.slice(11, 16) : ""; };
export function renderAudit(rows, opts) {
  const list = Array.isArray(rows) ? rows : [];
  const o = opts || {};
  const ctx = { ownerName: o.ownerName, servedStamp: o.servedStamp };   // WP2: threaded from the route; defaults hold without them
  const nowMs = o.nowMs || Date.now();
  const c = o.filters || {}, opt = o.options || {};
  const cur = { person: c.person || "", kind: c.kind || "", lane: c.lane || "", route: c.route || "", since: c.since || "", mine: c.mine ? "1" : "" };
  const H = (k, v) => hrefWith(orgPath("/audit"), cur, k, v);
  const day = (n) => new Date(nowMs - n * 864e5).toISOString().slice(0, 10);
  const people = [...new Set(list.map((r) => r.by).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // sprint 12 (12.5): a reader who may read more than one project chooses All projects here (renderActivityAll); o.allProjects
  // is { name } of the project this trail reads (null when it reads the org-level rows), set by the route only for such a reader
  const ap = o.allProjects || null;
  const filters = filterRow({ label: "Filter the trail", clear: orgPath("/audit"), groups: [
    ...(ap ? [{ key: "project", label: "Project", items: [{ label: "All projects", href: orgPath("/audit?all=1"), all: true, attrs: 'data-button="all-projects"' },
      ...(ap.name ? [{ label: ap.name, href: H("", ""), current: true }] : [])] }] : []),
    { key: "kind", label: "Kind", max: 3, items: [{ label: "All", href: H("kind", ""), current: !cur.kind, all: true }, ...(opt.kinds || []).map((k) => ({ label: (KIND_DEFS[k] || { label: k }).label, href: H("kind", cur.kind === k ? "" : k), current: cur.kind === k }))] },
    { key: "lane", label: "Lane", max: 3, items: (opt.lanes || []).map((l) => ({ label: laneWord(l), href: H("lane", cur.lane === l ? "" : l), current: cur.lane === l })) },
    // D6a: no Route group (its words are the router's: each row's own chip says where it stands); ?route= still narrows
    ...(cur.route ? [{ key: "route", label: "Route", items: [{ label: routeWord(cur.route, ctx.ownerName), href: H("route", ""), current: true }] }] : []),
    { key: "person", label: "Person", max: 4, items: [{ label: "Mine", href: H("mine", cur.mine ? "" : "1"), current: !!cur.mine },
      ...(cur.person && !people.some((n) => n.toLowerCase() === cur.person.toLowerCase()) ? [cur.person] : []).concat(people).map((n) => ({ label: n, person: { name: n }, href: H("person", cur.person.toLowerCase() === n.toLowerCase() ? "" : n), current: cur.person.toLowerCase() === n.toLowerCase() }))] },
    { key: "since", label: "Since", items: [{ label: "7 days", href: H("since", day(7)), current: cur.since === day(7) }, { label: "30 days", href: H("since", day(30)), current: cur.since === day(30) },
      ...(cur.since && cur.since !== day(7) && cur.since !== day(30) ? [{ label: `Since ${cur.since}`, href: H("since", cur.since), current: true }] : []), { label: "All time", href: H("since", ""), current: !cur.since, all: true }] },
  ] });
  // L4: plain words for raw ones: a grade reads "Graded <node name> · <verdict>" (its check id in the opened row), a lane its label
  const names = o.nodeNames instanceof Map ? o.nodeNames : new Map();
  const rowLine = (r) => { const g = auditGradeOf(r.what);
    return line({ attrs: `data-at="${esc(r.at || "")}"${g ? ` data-check="${esc(g.check)}"` : ""}`, lead: avatar({ name: r.by || "someone", size: 24 }),
    title: g ? `Graded ${names.get(`${r.project}|${g.node}`) || plainRef(g.node)} · ${g.verdict}` : String(r.what ?? "").replace(/\s*[—–]\s*/g, " - ") || (KIND_DEFS[r.kind] || { label: r.kind }).label, href: r.link || "",
    sub: r.lane && !g ? esc(laneWord(r.lane)) : "", meta: `${g ? chip("grade", { attrs: 'data-kind="grade"' }) : kindChip(r.kind)}${tempoCell(r, ctx)}<span title="${esc(fmtDate(r.at))}">${esc(hhmm(r.at))}</span>`,
    detail: lineDetail({ facts: [r.by ? ["By", `${esc(r.by)}${r.role ? ` · ${esc(r.role)}` : ""}`] : null, ["When", esc(fmtDate(r.at))], g ? ["Check", `<code>${esc(g.check)}</code>`] : null, r.route ? ["Route", esc(routeWord(r.route, ctx.ownerName))] : null, r.lane ? ["Lane", esc(laneWord(r.lane))] : null],
      actions: r.link ? btn("Open", { href: r.link }) : "" }) }); };
  const days = byDay(list, "at", nowMs);
  // D6a: the page holds the newest of the trail, so the last day it reaches says it goes on ("80+"), as the Trail's count does
  const body = days.length ? days.map(([d, xs], i) => group({ title: d, count: `${xs.length}${o.more && i === days.length - 1 ? "+" : ""}`, open: i < 2, summary: avatarStack([...new Set(xs.map((x) => x.by).filter(Boolean))].map((name) => ({ name })), { size: 20 }), body: lines(xs.map(rowLine)) })).join("")
    : Object.values(cur).some(Boolean) ? empty("Nothing matches", { action: { href: orgPath("/audit"), label: "The whole trail" } }) : empty("Nothing in the trail yet");
  // L4: the trail is a page of the newest; its count says so ("80+") and the next page is one link
  const lim = Number(o.limit) || 80;
  const older = o.more && lim < 200 ? `<p class="p-empty"><a class="u-link" href="${esc(hrefWith(orgPath("/audit"), { ...cur, limit: String(Math.min(200, lim * 2)) }))}">Older</a></p>` : "";
  // sprint 12's review: this one project's trail is the Audit trail; "Activity" is every project's contributions (?all=1)
  return `<div class="audit-page" data-screen="audit">${pageHead({ title: "Audit trail" })}${stack(filters, card({ label: "Trail", count: list.length ? `${list.length}${o.more ? "+" : ""}` : "", flush: true, region: "trail", body: body + older }))}</div>`;
}

// ---- Activity across every project (sprint 12, 12.5) ----
// renderActivityAll(read, opts) — the page for "All projects" (GET /audit?all=1, and the owner's rollup): src/activity.js
// activityAcross's answer, every contribution of every project the reader may read, newest first. opts: { filters: { in, who,
// lane, state, since }, ownerName, nowMs, states }. The ONE filter row (project, lane, state, person, since), each a link that
// carries the others; the list by day, each row one line (a face, what, its project and lane, its state, when) that opens to who
// (their role and hats), the project, the lane, the state, the kind, the door it came through, which AI filed it (sprint 13,
// 13.1: the client's own word, shown as its say, never proof; nothing when unknown) and when. The page goes on by
// its cursor (Older: ?before=). Hooks: data-screen="audit", data-scope="all", data-region="trail", data-project and data-state
// on a row, data-at.
const STATE_WORD = { landed: "Landed", with: "With", decided: "Decided", needs: "Needs more" };
const VERDICT_WORD = { approve: "approved", reject: "rejected", "needs-work": "sent back" };
const DOOR_WORD = { mcp: "MCP", api: "REST API", web: "Web app" };
const stateWord = (s, ownerName) => (s === "with" ? `With ${ownerName || "the owner"}` : STATE_WORD[s] || "");
function stateChipOf(item, ownerName) {
  const s = item.state, d = String(item.decision || "");
  if (s === "landed") return statusChip("LANDED", "Landed");
  if (s === "with") return statusChip("OPEN", stateWord(s, ownerName));
  if (s === "needs") return statusChip("gap", "Needs more");
  if (s === "decided") return d === "approve" ? statusChip("LANDED", "Decided") : statusChip("REVIEW", "Decided");
  return "";
}
export function renderActivityAll(read, opts) {
  const r = read || {}, o = opts || {};
  const items = Array.isArray(r.items) ? r.items : [];
  const projects = Array.isArray(r.projects) ? r.projects : [];
  const nowMs = o.nowMs || Date.now();
  const c = o.filters || {};
  const cur = { all: "1", in: c.in || "", who: c.who || "", lane: c.lane || "", state: c.state || "", since: c.since || "" };
  const H = (k, v) => hrefWith(orgPath("/audit"), cur, k, v);
  const day = (n) => new Date(nowMs - n * 864e5).toISOString().slice(0, 10);
  const people = new Map();
  for (const x of items) if (x.by && x.by.id && !people.has(x.by.id)) people.set(x.by.id, x.by);
  if (cur.who && !people.has(cur.who)) people.set(cur.who, { id: cur.who, name: o.whoName || cur.who });
  const filters = filterRow({ label: "Filter the activity", clear: orgPath("/audit?all=1"), groups: [
    { key: "project", label: "Project", max: 4, items: [{ label: "All projects", href: H("in", ""), current: !cur.in, all: true },
      ...projects.map((p) => ({ label: p.name || p.slug, href: H("in", cur.in === p.slug ? "" : p.slug), current: cur.in === p.slug, attrs: `data-project="${esc(p.slug)}"` }))] },
    { key: "lane", label: "Lane", max: 3, items: LANE_KEYS.map((l) => ({ label: laneWord(l), href: H("lane", cur.lane === l ? "" : l), current: cur.lane === l })) },
    { key: "state", label: "State", items: (o.states || Object.keys(STATE_WORD)).map((s) => ({ label: stateWord(s, o.ownerName), href: H("state", cur.state === s ? "" : s), current: cur.state === s })) },
    { key: "person", label: "Person", max: 4, items: [...people.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .map((p) => ({ label: p.name || "someone", person: { name: p.name || "", id: p.id, avatar: p.avatar }, href: H("who", cur.who === p.id ? "" : p.id), current: cur.who === p.id })) },
    { key: "since", label: "Since", items: [{ label: "7 days", href: H("since", day(7)), current: cur.since === day(7) }, { label: "30 days", href: H("since", day(30)), current: cur.since === day(30) },
      ...(cur.since && cur.since !== day(7) && cur.since !== day(30) ? [{ label: `Since ${cur.since}`, href: H("since", cur.since), current: true }] : []), { label: "All time", href: H("since", ""), current: !cur.since, all: true }] },
  ] });
  const hatWords = (hs) => (Array.isArray(hs) ? hs : []).map((h) => (hatOf(h) || { label: h }).label).join(", ");
  const rowLine = (x) => {
    const by = x.by || {};
    const who = [by.role, hatWords(by.hats)].filter(Boolean).join(" · ");
    return line({ attrs: `data-at="${esc(x.at || "")}" data-project="${esc(x.slug || "")}" data-state="${esc(x.state || "")}"`, lead: avatar({ name: by.name || "someone", id: by.id, avatar: by.avatar, size: 24 }),
      title: String(x.what ?? "").replace(/\s*[—–]\s*/g, " - ") || kindWord(x.kind || "contribution"), href: x.href || "",
      // sprint 13, 13.1: which AI filed it, in the client's own words (src/client.js); unknown (a row from before) says nothing
      sub: [esc(x.projectName || x.slug || ""), x.lane ? esc(laneWord(x.lane)) : "", x.client && clientWordOf(x.client) ? `from ${esc(clientWordOf(x.client))}` : ""].filter(Boolean).join(" · "),
      meta: `${stateChipOf(x, o.ownerName)}<span title="${esc(fmtDate(x.at))}">${esc(hhmm(x.at))}</span>`,
      detail: lineDetail({ facts: [
        by.name ? ["By", `${esc(by.name)}${who ? ` · ${esc(who)}` : ""}`] : null,
        ["Project", esc(x.projectName || x.slug || "")],
        x.lane ? ["Lane", esc(laneWord(x.lane))] : null,
        x.state ? ["State", `${esc(stateWord(x.state, o.ownerName))}${x.state === "decided" && VERDICT_WORD[x.decision] ? ` · ${esc(VERDICT_WORD[x.decision])}` : ""}`] : null,
        x.kind ? ["Kind", esc(kindWord(x.kind))] : null,
        x.door && DOOR_WORD[x.door] ? ["Through", esc(DOOR_WORD[x.door])] : null,
        // the AI's word is its own say (a label, not proof); the web app and the API are the door's (Through says them)
        x.client && x.client !== "web" && x.client !== "api" && clientWordOf(x.client) ? ["Filed with", `${esc(clientWordOf(x.client))} · as the tool names itself`] : null,
        ["When", esc(fmtDate(x.at))],
        ["Id", `<code>${esc(x.id || "")}</code>`]],
        actions: x.href ? btn("Open", { href: x.href }) : "" }) });
  };
  const days = byDay(items, "at", nowMs);
  const body = days.length ? days.map(([d, xs], i) => group({ title: d, count: `${xs.length}${r.more && i === days.length - 1 ? "+" : ""}`, open: i < 2,
    summary: avatarStack([...new Map(xs.filter((x) => x.by && x.by.name).map((x) => [x.by.id, { name: x.by.name }])).values()], { size: 20 }), body: lines(xs.map(rowLine)) })).join("")
    : empty(projects.length ? "Nothing matches" : "No projects yet", projects.length ? { action: { href: orgPath("/audit?all=1"), label: "All contributions" } } : {});
  const older = r.more && r.next ? `<p class="p-empty"><a class="u-link" href="${esc(hrefWith(orgPath("/audit"), { ...cur, before: r.next }))}" data-button="older">Older</a></p>` : "";
  return `<div class="audit-page" data-screen="audit" data-scope="all">${pageHead({ title: "Activity" })}${stack(filters, card({ label: "Contributions", count: items.length ? `${items.length}${r.more ? "+" : ""}` : "", flush: true, region: "trail", attrs: 'data-scope="all"', body: body + older }))}</div>`;
}
