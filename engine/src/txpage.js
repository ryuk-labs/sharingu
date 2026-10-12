// src/txpage.js — /contribution/:id, a contribution's page (wf-filing), on the revision's parts (sprint 3, L3; docs/plan/LOOK.md).
// Content-only: it renders INSIDE shell(). renderTransmissionPage(row, opts) -> HTML string.
//   row  — a transmission row joined with people (by_name, by_role, decided_name) — core.js filingFor.
//   opts — { grade, counters, canDecide, evalView, decidedInfo, ownerName, servedStamp, side, impact, headActions }, all optional.
//          side: trusted markup at the top of the side column (the next action); impact: the Impact card (src/impactpage.js
//          impactSection); headActions: at most two buttons in the head (Show on the Map). counters: src/hotsql.js
//          FILING_COUNTERS_SQL's rows (each with its `standing` flag). canDecide: the reader is the owner.
// Its six regions (wf-filing), each non-empty: header (the facts) · ruling (the presses while it waits on the owner, the
// ruling once made, else one phrase) · envelope (the why and its facts) · refs (what it links to) · counters · trail.
// The decide pieces (VERDICTS · verdictWord · renderDecideForm) stay exported: Build reads verdictWord, and
// tools/decide-form-selftest.mjs proves the form.

import { parseRefs } from "./refs.js";
import { ROUTE } from "./rt.js";
import { tempoOf, routeWord, chipOfTempo } from "./tempo.js";
import { esc, list, statusChip } from "./ui.js";
import { card, facts, chip, avatar, line, lines, lineDetail, group, empty, words, pageHead, cols, stack, dayOf, happenedOf, kindWord } from "./parts.js";
import { QID_RE } from "./decisions.js";
import { dependForm } from "./shapes.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

// ---- the ruling, in the reader's words (M-ADR-041 WP7) ----
// value   — the ledger word the decide seam takes (core.js DECIDE_VERDICTS — one source: the selftest
//           asserts these three against the seam's `allowed` list)
// label   — the button
// past    — the word a ruling wears once made
// happens — the one line under the button: what this ruling does
// copy: off-screen (each verdict's `happens` rides its press's title; `past` is a word)
export const VERDICTS = [
  { value: "approve", label: "Approve", past: "approved",
    happens: "Filed as ruled. If it names components or screens, it lights on the canvas at the next publish." },
  { value: "needs-work", label: "Send back for one more thing", past: "sent back for one more thing",
    happens: "Goes back to the sender with your note. It stays open until they re-file." },
  { value: "reject", label: "Reject", past: "rejected",
    happens: "Closed and recorded. Nothing changes on the canvas." },
];
const TERMINAL = new Set(["approve", "reject"]);
const VERDICT_BY = Object.fromEntries(VERDICTS.map((v) => [v.value, v]));

// verdictWord(decision) — "approved" · "sent back for one more thing" · "rejected"; an unknown ledger value
// reads as itself (never invented).
export function verdictWord(decision) {
  const d = String(decision || "").toLowerCase();
  return (VERDICT_BY[d] && VERDICT_BY[d].past) || d;
}

// isTerminal(decision) — approve/reject close the row (core.js: status='closed', no re-decide); needs-work does not.
export function isTerminal(decision) { return TERMINAL.has(String(decision || "").toLowerCase()); }

// renderDecideForm({ id, next, cls }) — the decide buttons for ONE item, plain POSTs to the existing seam.
// `next` (same-origin path — the handler checks it, sameOriginPath-style) is where the owner lands after ruling;
// absent, the handler sends them to the item's own page.
// The filing page (UI-B4a): three forms, one per ruling (FILING_RULINGS: Approve · Needs work · Reject), each a hidden
// verdict + a hidden FIXED note + the hidden next — no typed note (Q1E8D4C9C). Each button carries data-button
// (approve · needs-work · reject) and data-door, audited against wf-filing. Wire body: verdict=<v>&note=<the fixed
// note>&next=<p>. It carries data-decide="<id>"; the id is an identifier (an attribute), never shown as text here.
// copy: off-screen (the fixed note is a hidden field's value; `happens` the press's title)
export const FILING_RULINGS = [
  { value: "approve", label: "Approve", note: "Approved on its page.", happens: "Filed as ruled. If it names components or screens, it lights on the canvas at the next publish." },
  { value: "needs-work", label: "Needs work", note: "Needs work: file it again with what is missing.", happens: "It goes back to the sender and stays open until they file again." },
  { value: "reject", label: "Reject", note: "Rejected on its page.", happens: "Closed and recorded. Nothing changes on the canvas." },
];
export function renderDecideForm(opts) {
  const o = opts || {};
  const id = String(o.id || "");
  if (!id) return "";
  const action = orgPath(`/contribution/${esc(id)}/decide`);
  const next = o.next ? `<input type="hidden" name="next" value="${esc(o.next)}">` : "";
  const cls = o.cls ? ` ${esc(o.cls)}` : "";
  // the look pass: the shared button (ui.js .u-btn), Approve the ONE primary; what each press does rides its title (sprint 3
  // L3, pristine copy); what each form submits is unchanged
  const forms = FILING_RULINGS.map((v) =>
    `<form class="fl-rule fl-rule-${esc(v.value)}" method="POST" action="${action}">` +
    `<input type="hidden" name="verdict" value="${esc(v.value)}"><input type="hidden" name="note" value="${esc(v.note)}">${next}` +
    `<button type="submit" class="u-btn small${v.value === "approve" ? " primary" : v.value === "reject" ? " ghost" : ""}" data-button="${esc(v.value)}" data-door="POST /contribution/:id/decide" title="${esc(v.happens)}">${esc(v.label)}</button></form>`).join("");
  return `<div class="fl-rules${cls}" data-decide="${esc(id)}">${forms}</div>`;
}

// ---- the filing page (sprint 3, L3: the revision, docs/plan/LOOK.md; the approved mock is tools/parts-gallery.mjs contribution()) ----
// The head (Build / its day / its id, what it is), the facts (status, who, filed, kind, lane, grade, counters), then the why
// in the filer's own words with its facts opening under it, its impact (from the route), and the ruling: the three presses
// ONLY while it waits on the owner (routed to them, or sent back once and open again), the ruling as made once it is decided,
// else one phrase. Beside them: the next action and its pick-up, what it links to, the counters standing and its trail. No
// sentence of the product's own (the reasons it waits are chips with the reason in their title; no counter call).
export const FILING_REGIONS = ["header", "ruling", "envelope", "refs", "counters", "trail"];   // vocab:allow: region ids (data-region), the wireframe's own names, never page copy
// the exact call a person's own Claude files a counter on THIS filing with (What is missing and the door's answers carry it;
// the page does not print it)
// copy: off-screen (the door's and the tests' call; What is missing carries the calls)
export const filingCounterCall = (id) => `preview {items: [{contribution: {lane, kind: "counter", parent: "${String(id || "")}", what, why}}]}, then file`;
// the ledger's own words carry em dashes; the voice law has none on glass (rendered text only)
const noDash = (v) => String(v ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (v) => esc(noDash(v));

// OWNER_REASON_COPY — why a filing waits on the owner: [the chip's word, the reason (its title)]
// copy: off-screen (each pair is a chip's word and its title="", never a sentence on the page)
export const OWNER_REASON_COPY = {
  "lane:vendor": ["Vendor lane", "vendor contributions always go to the owner."],
  "join-key-suspect": ["Screen number suspect", "a declared screen number needs the owner's eye before it counts."],
  "component-key-suspect": ["Component suspect", "a declared component is not in the ratified target."],
  "answers-a-question": ["Answers a question", "closing a question is ruling territory: the owner decides."],
  "counters-a-filing": ["Counters a contribution", "it disputes the contribution named as its parent, and stands until the owner rules it."],
  "counters-a-question": ["Counters a question", "it disputes the question it names, and stands until the owner rules it."],
  "counters-a-goal": ["Counters a goal", "it disputes the goal node it names, and stands until the owner rules it."],
  "critique-ruling-territory": ["A critique", "a critique is ruling territory the moment it is filed."],
  "proposal-targets-a-ghost": ["A proposal", "it proposes something not yet built."],
  "insight-proposes-understanding": ["An insight", "it proposes a change to shared understanding."],
  "asks-a-grant": ["Asks for a one-time grant", "consent for this one occasion: Grant once approves it; Not yet sends it back, and the agent files again, naming this one as parent, when the occasion returns."],
  "conflict-with-ruled-truth": ["Conflicts with ruled truth", "the brain flagged a conflict with an existing ruling."],
  "flagged-owner": ["Flagged for the owner", "the sender marked it for the owner's review."],
  "risk-surface": ["Touches a risk surface", "money, clinical, consent, RLS or cross-tenant language was found."],
};

// minimal markdown for a filed digest: ## -> h4, - bullets -> li, plain lines -> p; every line escaped first
function miniMd(src) {
  const out = []; let ul = false;
  const close = () => { if (ul) { out.push("</ul>"); ul = false; } };
  for (const raw of String(src || "").replace(/\r\n?/g, "\n").split("\n")) {
    const ln = raw.trim();
    if (!ln) { close(); continue; }
    const h = ln.match(/^#{2,3}\s+(.*)$/);
    if (h) { close(); out.push(`<h4>${txt(h[1])}</h4>`); continue; }
    const b = ln.match(/^[-*]\s+(.*)$/);
    if (b) { if (!ul) { out.push("<ul>"); ul = true; } out.push(`<li>${txt(b[1])}</li>`); continue; }
    close(); out.push(`<p>${txt(ln)}</p>`);
  }
  close();
  return out.join("");
}
const qidsOf = (row) => parseRefs(row.gaprefs ?? row.gapRefs).filter((r) => /^q\//i.test(r)).map((r) => r.slice(2)).filter((q) => QID_RE.test(q));
// what a filing touches, as links where the touch names a node of the project's model (the Map's own grammar, <kind>:<id>
// or goal/<id>, opened on the Map); any other touch stays a plain mono word
const NODE_REF = /^(screen|api|table|entity|gap|flow|dep|lane|surface|service|door|component):[^\s]+$|^goal\/[^\s]+$/i;
// namedLink(ref, names) — a node by its name when the Map holds it (names: id -> name), its id in the title; else nodeLink's
const namedLink = (ref, names) => (names && names.get && names.get(ref) && NODE_REF.test(ref) ? `<a class="fl-link" href="${orgPath(`/map?node=${encodeURIComponent(ref)}`)}" title="${esc(ref)}">${txt(names.get(ref))}</a>` : nodeLink(ref));
const nodeLink = (ref) => (NODE_REF.test(ref) ? `<a class="fl-link" href="${orgPath(`/map?node=${encodeURIComponent(ref)}`)}">${txt(ref)}</a>` : `<code>${txt(ref)}</code>`);
// a proof: a link when it is one (an http(s) link opens in a new tab; an artifact opens in the viewer), else the words
function proofOf(p) {
  const s = String(p || "").trim();
  if (/^https?:\/\/\S+$/i.test(s)) return `<a class="fl-link" href="${esc(s)}" rel="noopener noreferrer" target="_blank">${txt(s)}</a>`;
  if (/^\/artifact\/[A-Za-z0-9_-]+$/.test(s)) return `<a class="fl-link" href="${orgPath(`/view?src=${encodeURIComponent(s)}`)}">${txt(s)}</a>`;
  return txt(s);
}
const httpLink = (s) => /^https?:\/\/\S+$/i.test(String(s || "").trim());
function sourceOf(x) {
  const ref = String((x && x.ref) || "").trim(), label = String((x && x.label) || "").trim(), kind = String((x && x.kind) || "");
  const word = label || ref;
  const art = kind === "artifact" ? ref.replace(/^\/artifact\//, "") : "";
  const body = art && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(art) ? `<a class="fl-link" href="${orgPath(`/view?src=${encodeURIComponent("/artifact/" + art)}`)}">${txt(word)}</a>`
    : httpLink(ref) ? `<a class="fl-link" href="${esc(ref)}" rel="noopener noreferrer" target="_blank">${txt(word)}</a>`
    : `${label ? `${txt(label)} ` : ""}<code>${txt(ref)}</code>`;
  return `<span data-source="${esc(kind)}" title="${esc(kind)}">${body}</span>`;
}
// dependOf(ref, names) -> the link to what it depends on, by its NAME when the page read one (opts.dependNames), else its id
function dependOf(ref, names) {
  const f = dependForm(ref);
  const href = f && f.href ? f.href(String(ref)) : null;
  const word = (names && names.get(String(ref))) || String(ref);
  return href ? `<a class="fl-link" href="${esc(href)}" data-depends="${esc(f.form)}" title="${esc(ref)}">${txt(word)}</a>` : `<code data-depends="${esc(f ? f.form : "ref")}">${txt(ref)}</code>`;
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (iso) => { const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const hhmm = (iso) => { const s = String(iso || ""); return /T\d\d:\d\d/.test(s) ? s.slice(11, 16) : ""; };

// statusOf(row, ctx) -> the ONE status chip (ui.js statusChip: data-chip one of the law's 11) in a word
export function statusOf(r, ctx = {}) {
  const tempo = tempoOf(r, ctx.servedStamp, { ownerName: ctx.ownerName });
  const d = String(r.decision || "").toLowerCase();
  const c = chipOfTempo(tempo, d, r.route);
  const word = d === "approve" ? "Approved" : d === "reject" ? "Rejected" : d === "needs-work" ? "Sent back" : c === "LANDED" ? "Landed"
    : tempo === "needs more" ? "Needs more" : tempo.startsWith("with ") ? `With ${tempo.slice(5)}` : tempo.charAt(0).toUpperCase() + tempo.slice(1);
  return statusChip(c, word, c === "OPEN" ? "warn" : undefined);
}
// The three presses show while the row is not ruled for good (HEAD's rule: isTerminal) and has not landed on its own (no
// ruling, routed auto or on the canvas: its chip says Landed, nothing waits on anyone). An approved or rejected contribution
// never offers them, one sent back or still with the owner (or incomplete) can be ruled. The forms are HEAD's, unchanged.
export const landedOnItsOwn = (r, ctx = {}) => !String((r && r.decision) || "") && chipOfTempo(tempoOf(r, ctx.servedStamp, { ownerName: ctx.ownerName }), "", r && r.route) === "LANDED";
export function renderTransmissionPage(row, opts) {
  const r = row || {};
  const o = opts || {};
  const ctx = { ownerName: o.ownerName, servedStamp: o.servedStamp };
  const nowMs = o.nowMs || Date.now();
  const g = o.grade || {};
  const kind = String(r.kind || "").toLowerCase();
  const day = dayOf(happenedOf(r), nowMs);   // L4: the day the work happened (parts.js happenedOf); the filing day is a fact
  const head = pageHead({ title: noDash(r.what || r.id || ""), crumbs: [{ label: "Build", href: orgPath("/build"), attrs: 'data-button="back-to-build" data-door="GET /build"' },
    day ? { label: day, href: orgPath("/build?sort=newest") } : null, { label: r.id || "" }].filter(Boolean), actions: o.headActions || [] });
  // ---- the facts (region header) ----
  const counters = Array.isArray(o.counters) ? o.counters : [];
  const standing = counters.filter((c) => Number(c.standing) === 1).length;
  const miss = Array.isArray(g.missing) ? g.missing : [];
  // what is missing, in words and by name (HEAD's words, now the chip's title): the three lines first, then the lane's own fields
  const core = miss.filter((m) => m === "what" || m === "why" || m === "touches"), rest = miss.filter((m) => !core.includes(m));
  // copy: off-screen (the Grade chip's title)
  const missWords = [core.length ? `The three lines are incomplete: missing: ${core.join(", ")}.` : "", rest.length ? `Needs one more thing: missing: ${rest.join(", ")}.` : ""].filter(Boolean).join(" ");
  const gradeHtml = g.binding === false || miss.length ? chip("Not binding", { tone: "warn", title: missWords }) : chip("Complete", { tone: "ok" });
  // the ruling: a card while the owner owes it one (the presses) or once it is made (who, when, their note); otherwise it rides
  // the Status cell (region ruling: "No ruling needed", or who it waits on, in its title)
  const canRule = !!o.canDecide && !isTerminal(r.decision) && !landedOnItsOwn(r, ctx);
  const rulingCard = canRule || !!r.decision;
  const route0 = String(r.route || "").toLowerCase();
  const waitWord = route0 === "owner" ? `Waits on ${noDash(o.ownerName || "the owner")}` : route0 === "incomplete" ? "Waits on the sender" : "No ruling needed";
  const header = facts([
    { label: "Status", html: statusOf(r, ctx), title: rulingCard ? "" : waitWord, attrs: rulingCard ? "" : 'data-region="ruling"' },
    { label: "By", html: r.by_name ? `${avatar({ name: noDash(r.by_name), size: 20 })}${txt(r.by_name)}` : "–", title: r.by_role ? noDash(r.by_role) : "" },
    // L4: the header's "when" is when the work happened (parts.js happenedOf); the filing time is in the title and the facts below
    { label: "Happened", value: shortDay(happenedOf(r)) || "–", title: `filed ${String(r.created_at || "")}` },
    { label: "Kind", value: kindWord(kind) || "–" },
    { label: "Grade", html: gradeHtml },
    { label: "Counters", html: `<a class="u-link" href="#counters" data-button="counters" data-door="GET /contribution/:id" aria-label="${esc(`${standing} standing, ${counters.length - standing} ruled`)}">${esc(standing)}</a>` },
  ], { region: "header" });
  // ---- the ruling ----
  const reasons = (g.ownerReasons || []).map((x) => { const [w, d] = OWNER_REASON_COPY[x] || [x, ""]; return chip(noDash(w), { title: noDash(d), attrs: `data-reason="${esc(x)}"` }); }).join("");
  let rulingBody;
  if (r.decision) {
    const v = String(r.decision).toLowerCase();
    const who = noDash(r.decided_name || (o.decidedInfo && (o.decidedInfo.name || o.decidedInfo.by)) || r.decided_by || "the owner");
    const note = String(r.decision_note || r.note || "").trim();
    rulingBody = `<div class="ruling" data-ruling="${esc(r.id || "")}">${lines([line({ lead: chip(v === "approve" ? "Approved" : v === "reject" ? "Rejected" : v === "needs-work" ? "Sent back" : noDash(v), { tone: v === "approve" ? "ok" : v === "reject" ? "bad" : "warn" }),
      title: who, titleHtml: `${avatar({ name: who, size: 20 })} ${txt(who)}`, meta: `<span>${esc(shortDay(r.decided_at))}</span>` })], { compact: true })}${note ? `<div class="p-card-pad">${words(`<p>${txt(note)}</p>`)}</div>` : ""}</div>`;
  } else rulingBody = "";
  const presses = canRule ? `<div class="p-card-pad fl-press">${renderDecideForm({ id: r.id, next: orgPath(`/contribution/${String(r.id || "")}?page=1${o.evalView ? "&eval=1" : ""}`) })}</div>` : "";
  const ruling = rulingCard ? card({ label: "Ruling", tone: canRule ? "needs" : "", region: "ruling", flush: true, action: reasons ? `<span class="fl-reasons">${reasons}</span>` : "", body: `${rulingBody}${presses}` }) : "";
  // ---- the why and its facts (region envelope) ----
  const list0 = (v) => list(v);
  const touches = list0(r.touches), screens = list0(r.screens), comps = list0(r.components), tf = o.touchesFact || null;
  const hDay = String(r.happened_at || "").slice(0, 10), fDay = String(r.created_at || "").slice(0, 10);
  const route = r.route ? (ROUTE[r.route] || { label: routeWord(r.route, ctx.ownerName) }).label : "";
  const nx = r.next && r.next.what ? r.next : null;
  const fx = [
    r.lane ? ["Lane", esc(r.lane)] : null,
    route && String(r.route).toLowerCase() !== "auto" ? ["Route", esc(route)] : null,   // D6a: "Route: Filed" says nothing the status does not
    String(r.proof || "").trim() ? ["Proof", proofOf(r.proof)] : null,
    // (the header says when it happened; these two say it again only when the filing was another day)
    hDay && hDay !== fDay ? ["Happened", `<span data-field="happened-at" data-happened="${esc(hDay)}">${esc(hDay)}</span>`] : null,
    hDay && hDay !== fDay ? ["Filed", esc(fDay)] : null,
    // L4: the count is the Impact's (the nodes it changed: what it touches, its screens and components, found in the Map), so
    // this fact and Impact's "Changed" read ONE number; the raw refs ride the title
    // the fix-video step: what it touches is ONE fact (impactpage.js touchesFact), the same words as the Impact card beside it: the
    // nodes it touches, then what it names that is not on the Map ("3 files, not on the Map"); no fact when both are empty
    tf ? (tf.nodes || tf.plain.length ? ["Touches", `<span data-field="touches" data-nodes="${esc(tf.nodes)}" data-plain="${esc(tf.plain.length)}">${[
      tf.nodes ? `<a class="u-link" href="${orgPath(`/contribution/${encodeURIComponent(String(r.id || ""))}/impact`)}" title="${esc([...touches, ...screens, ...comps].join(", "))}">${esc(tf.nodeWords)}</a>` : "",
      tf.plain.length ? `<span title="${esc(tf.plain.join(", "))}">${esc(tf.plainWords)}</span>` : ""].filter(Boolean).join(" · ")}</span>`] : null)
      : touches.length ? ["Touches", touches.length > 3 ? `<span title="${esc(touches.join(", "))}">${esc(touches.length)} refs</span>` : touches.map(nodeLink).join(", ")] : null,
    // L4: screens and components by their NAMES (the Map's own, from the Impact walk), the id in the title
    screens.length ? ["Screens", screens.map((s) => namedLink(/^screen:/.test(s) ? s : "screen:" + s, o.names)).join(", ")] : null,
    comps.length ? ["Components", comps.map((c) => namedLink(c, o.names)).join(", ")] : null,
    r.audience ? ["Audience", txt(r.audience)] : null, r.claim ? ["Claim", txt(r.claim)] : null,
    r.channel ? ["Channel", txt(r.channel)] : null, r.experiment ? ["Experiment", txt(r.experiment)] : null,
    r.report ? ["Report", `<a class="fl-link" href="${orgPath(`/view?src=${encodeURIComponent("/artifact/" + r.report)}`)}" title="rt-v1.1 report artifact">${esc(r.report)}</a>`] : null,
    r.trace ? ["Trace", `<a class="fl-link" href="${orgPath(`/view?src=${encodeURIComponent("/artifact/" + r.trace)}`)}" title="trace attached">${esc(r.trace)}</a>`] : null,
    Array.isArray(r.source) && r.source.length ? ["Source", `<span data-field="source">${r.source.map(sourceOf).join(", ")}</span>`] : null,
    nx ? ["Next", `<span data-field="next">${txt(nx.what)}${nx.by ? ` <span class="fl-by">by ${esc(nx.by)}</span>` : ""}</span>`] : null,
    miss.length ? ["Missing", miss.map((m) => chip(m, { tone: "warn" })).join(" ")] : null,
  ];
  const stillOpen = Array.isArray(r.open) && r.open.length ? `<div class="fl-open" data-field="open">${group({ title: "Still open", count: r.open.length, open: true, body: lines(r.open.map((x) => line({ title: noDash(x) })), { compact: true }) })}</div>` : "";
  const digest = r.digest ? group({ title: "Digest", body: `<div class="p-card-pad">${words(miniMd(r.digest))}</div>` }) : "";
  const whyText = String(r.why || "").trim();
  const envelope = card({ label: "Why", region: "envelope", flush: true,   // vocab:allow: the region id (data-region), the wireframe's own name
    body: `<div class="p-card-pad">${whyText ? words(`<p>${txt(whyText)}</p>`) : empty("No reason filed")}${lineDetail({ facts: fx })}</div>${stillOpen}${digest}` });
  // ---- what it links to (region refs) ----
  const refs = parseRefs(r.gaprefs ?? r.gapRefs), qids = qidsOf(r), other = refs.filter((x) => !/^q\//i.test(x));
  const counterOf = kind === "counter" || kind === "critique";
  const linkRows = [
    r.parent ? line({ lead: chip(counterOf ? "Counters" : "Parent"), title: r.parent, href: orgPath(`/contribution/${encodeURIComponent(r.parent)}`), linkAttrs: 'data-door="GET /contribution/:id"' }) : "",
    ...qids.map((q) => line({ lead: chip(counterOf ? "Counters" : "Question"), title: q, href: orgPath(`/question/${encodeURIComponent(q)}`), linkAttrs: 'data-button="question-link" data-door="GET /question/:qid"' })),
    r.goal_ref ? line({ lead: chip("Goal"), title: noDash(o.goalTitle || String(r.goal_ref)), href: orgPath(`/goals/${encodeURIComponent(String(r.goal_ref))}`), attrs: `data-goal="${esc(String(r.goal_ref))}"` }) : "",
    ...other.map((x) => line({ lead: chip("Ref"), titleHtml: `<code>${txt(x)}</code>`, title: x })),
  ].filter(Boolean);
  const deps = Array.isArray(r.depends) && r.depends.length ? `<div class="p-card-pad" data-field="depends">${lineDetail({ facts: [["Depends on", r.depends.map((d) => dependOf(d, o.dependNames)).join(", ")]] })}</div>` : "";
  const linked = card({ label: "Linked to", count: linkRows.length + (deps ? r.depends.length : 0) || "", flush: true, region: "refs", body: linkRows.length || deps ? `${linkRows.length ? lines(linkRows, { compact: true, lead: 84 }) : ""}${deps}` : empty("No links") });
  // ---- the counters (region counters) ----
  const ctr = card({ label: "Counters", count: standing || "", flush: true, region: "counters", id: "counters", body: counters.length
    ? lines(counters.map((c) => line({ attrs: `data-counter="${esc(c.id)}"`, lead: avatar({ name: noDash(c.by_name || "someone"), size: 20 }), title: noDash(c.what || c.id), href: orgPath(`/contribution/${encodeURIComponent(c.id)}`),
      linkAttrs: 'data-door="GET /contribution/:id"', meta: `${statusOf(c, ctx)}<span>${esc(shortDay(c.created_at))}</span>` })), { compact: true })
    : empty("No counters") });
  // ---- the trail ----
  const steps = [
    ["Filed", r.created_at],
    [g.binding === false ? "Graded · not binding" : "Graded · complete", r.created_at],
    ...(String(r.route || "").toLowerCase() === "auto" ? [] : [[`Routed · ${noDash(routeWord(r.route, ctx.ownerName))}`, r.created_at]]),
    ...(r.decision ? [[`Decided · ${verdictWord(r.decision)}`, r.decided_at || r.created_at]] : []),
  ];
  const trail = card({ label: "Trail", flush: true, region: "trail", body: lines(steps.map(([t, at]) => line({ title: t, meta: `<span title="${esc(String(at || ""))}">${esc(hhmm(at) || shortDay(at))}</span>` })), { compact: true }) });
  return `${STYLE}<section class="fl" data-screen="filing">${head}${stack(header, cols(stack(ruling, envelope, o.impact || ""), stack(o.side || "", linked, ctr, trail)))}</section>`;
}

// the filing page's own few rules, on the semantic tokens (the parts carry the rest)
const STYLE = `<style>
.fl{display:block}
.fl-link{color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
.fl-link:hover{text-decoration-color:var(--text)}
.fl .p-ld-facts code{font:400 12px/1.4 var(--mono);color:var(--text-muted)}
.fl-by{font:400 11.5px/1 var(--mono);color:var(--text-faint)}
.fl-reasons{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
.fl-press .fl-rules{display:flex;flex-wrap:wrap;gap:8px}
.fl-press .fl-rule{margin:0}
.fl .ruling .p-line-title{display:inline-flex;align-items:center;gap:8px}
.fl-open{border-top:1px solid var(--line)}
.fl .p-card-pad>.p-ld{margin-top:14px}
.fl .p-card-pad>.p-empty:first-child{padding-top:0}
</style>`;
