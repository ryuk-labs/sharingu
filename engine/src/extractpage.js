// src/extractpage.js — the faces of extract (sprint 3, B5). Pure renderers over src/extract.js reads, on ui.js's shared parts and
// the semantic tokens only (Paper and Ink), one accent, no em dash:
//   · renderLibraryPage(lib, found, o)  the Library, /library to a browser: a search over everything the reader may read in the
//                                       project (found: extract.js searchAnswer, the `search` tool's own answer) and, with no
//                                       words, the docs and the cards by kind, each row with its confidence, as-of date and a
//                                       "due for review" mark (knowledge/fresh.js), a card kind naming the tab it lists on.
//                                       Regions: library-head · search · results · docs · cards.
//   · renderChangesPage(ch)             What changed, /changes to a browser (the `changes` tool's own answer): since the
//                                       version (or a time), a tab's kinds as pills, each change with who, when, its refs
//                                       and what it reaches. Regions: changes-head · changes.
//   · changedChip(c)                    the quiet "3 changed since v4" chip on each tab's header (extract.js changedCountFor).
// Hooks a check reads: data-screen on each page; data-hit + data-kind on a search hit; data-group on a kind's group;
// data-doc, data-card on a Library row (data-due when due for review); data-change + data-kind on a change; data-reach on its
// reach line; data-changed + data-n on the chip.
import { esc, dateOnly } from "./ui.js";
import { card, tile, tileRow, chip, avatar, avatarStack, filterRow, group, line, lines, lineDetail, empty, pageHead, cols, stack, byDay, ago, happenedOf } from "./parts.js";
import { typeWord } from "./reach.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';
const TAB_WORD = { home: "Home", build: "Build", gtm: "GTM", goals: "Goals", decisions: "Decisions", map: "Map", broadcast: "Broadcast", control: "Control" };
const CHANGE_WORD = { contribution: "contribution", knowledge: "knowledge", grade: "grade", ruling: "ruling", answer: "answer", version: "version", broadcast: "Broadcast" };

// ---- the chip ----
export function changedChip(c) {
  if (!c) return "";
  const n = Number(c.n) || 0;
  const words = n ? `${n}${c.more ? "+" : ""} changed since ${c.since}` : `Nothing changed since ${c.since}`;
  return `<a class="u-changed" href="${esc(c.href || orgPath("/changes"))}" data-changed="${esc(c.tab || "")}" data-n="${esc(n)}"${c.more ? ' data-more="1"' : ""} title="${esc(n ? "What changed on this tab since the project's current version" : "This tab is as it was at the current version")}">${esc(words)}</a>`;
}

// ---- the Library (sprint 3, L3: the revision, docs/plan/LOOK.md) ----
// The head (Library, the search in its row), the glance (docs, cards, due for review), the ONE filter row (the card kind, Due),
// one card per card kind (each card one line: its name, its status, its as-of and a Due chip) and the docs beside them; a
// search draws one card per kind it found, each hit one line with its snippet. No sentence of the product's own.
const searchForm = (q, project) => `<form class="lx-search" method="GET" action="${orgPath(`/library`)}" role="search" data-region="search" data-door="GET /search">${SEARCH_ICON}
    <input type="search" name="q" value="${esc(q)}" data-input-exception="search" placeholder="Search this project" aria-label="Search this project: goals, questions, checks, cards, docs, the Map and contributions" autocomplete="off" spellcheck="false">${project ? `<input type="hidden" name="project" value="${esc(project)}">` : ""}
    <button type="submit" class="u-btn small">Search</button></form>`;
const fresh = (x) => `${x.confidence ? chip(String(x.confidence)) : ""}${x.dueForReview ? chip("Due", { tone: "warn", title: `due for review since ${x.dueForReview}` }) : ""}`;
const shortDate = (iso) => { const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
export function renderLibraryPage(lib, found, o = {}) {
  const L = lib || {}, q = String(o.q || "");
  const pq = o.project ? `project=${encodeURIComponent(o.project)}` : "";
  const head = `<section class="lx-head" data-region="library-head">${pageHead({ title: q ? "Search" : "Library", crumbs: q ? [{ label: "Library", href: orgPath(`/library${pq ? `?${pq}` : ""}`) }, { label: q }] : null, actions: [searchForm(q, o.project)] })}</section>`;
  if (q) return CSS + `<section class="lx" data-screen="library" data-q="${esc(q)}">${head}${resultsOf(found)}</section>`;
  if (L.error) return CSS + `<section class="lx" data-screen="library">${head}${card({ body: empty("Pick a project", { action: { href: orgPath("/projects"), label: "Projects" } }) })}</section>`;
  const docs = L.docs || [];
  const kinds = L.kinds || [];
  const cardsN = kinds.reduce((n, k) => n + (Number(k.count) || 0), 0);
  const glance = tileRow([
    tile({ label: "Docs", value: docs.length, key: "docs" }),
    // copy: off-screen (the count's title)
    tile({ label: "Cards", value: cardsN, key: "cards", sub: kinds.length ? `${kinds.length} ${kinds.length === 1 ? "kind" : "kinds"}` : "", title: L.capped ? "The Library reads the first 300 docs and 600 cards; search finds the rest" : "" }),
    tile({ label: "Due for review", value: L.dueForReview || 0, key: "due", tone: L.dueForReview ? "warn" : "" }),
  ], { region: "glance", label: "The Library" });
  const kindNow = String(L.kind || "");
  const here = (k) => orgPath(`/library?${[k ? `kind=${encodeURIComponent(k)}` : "", pq].filter(Boolean).join("&")}`).replace(/\?$/, "");
  const filters = kinds.length > 1 || kindNow ? filterRow({ label: "Filter the Library", groups: [{ key: "kind", label: "Kind", max: 6, items: [{ label: "All", count: cardsN + docs.length, href: here(""), current: !kindNow, all: true },
    ...kinds.map((k) => ({ label: k.label, count: k.count, href: here(k.key), current: kindNow === k.key }))] }] }) : "";
  // L4: a doc by its title; its path (an id) in the row's title="", never a cut "gt…" beside it
  const docLine = (d) => line({ attrs: `data-doc="${esc(d.path)}"${d.dueForReview ? ` data-due="${esc(d.dueForReview)}"` : ""} title="${esc(d.path)}"`, title: noDash(d.title), href: d.href,
    meta: `${fresh(d)}<span>${esc(d.asOf ? shortDate(d.asOf) : "")}</span>` });
  const docsCard = card({ label: "Docs", count: docs.length || "", flush: true, region: "docs", id: "lx-docs", body: docs.length ? lines(docs.map(docLine), { compact: true }) : empty("No docs yet", { action: { href: orgPath("/missing"), label: "What is missing" } }) });
  const cardLine = (c) => line({ attrs: `data-card="${esc(c.kind)}/${esc(c.id)}"${c.dueForReview ? ` data-due="${esc(c.dueForReview)}"` : ""}`, title: noDash(c.name || c.id), href: c.href,
    sub: c.status ? txt(c.status) : "", meta: `${fresh(c)}<span>${esc(c.asOf ? shortDate(c.asOf) : c.updatedAt ? shortDate(c.updatedAt) : "")}</span>` });
  const cardsCards = kinds.length ? kinds.map((k) => card({ label: k.label, count: k.count, flush: true, region: "cards", id: `lx-k-${encodeURIComponent(k.key)}`, attrs: `data-group="${esc(k.key)}"`,
    action: `${k.tab ? `<a class="u-link" href="${esc(k.tabHref || orgPath("/library"))}" data-lists-on="${esc(k.tab)}">${esc(TAB_WORD[k.tab] || k.tab)}</a>` : chip("Library only")}${k.more ? `<a class="u-link" href="${esc(k.href)}">All ${esc(k.count)}</a>` : ""}`,
    body: lines(k.cards.map(cardLine), { compact: true }) })).join("")
    : card({ label: "Cards", flush: true, region: "cards", body: empty("No cards yet", { action: { href: orgPath("/missing"), label: "What is missing" } }) });
  return CSS + `<section class="lx" data-screen="library">${head}${stack(glance, filters, cols(stack(cardsCards), docsCard))}</section>`;
}
// D6a: a check's hit is its title alone (its snippet is the probe's raw text: `then`, a status code and selectors)
function resultsOf(f) {
  if (!f) return "";
  if (f.error) return `<div data-region="results">${card({ body: empty(f.error === "project_required" ? "Pick a project" : "Search did not run", f.error === "project_required" ? { action: { href: orgPath("/projects"), label: "Projects" } } : {}) })}</div>`;
  if (!f.total) return `<div data-region="results">${card({ body: empty("Nothing matches") })}</div>`;
  const groups = (f.groups || []).map((g) => card({ label: g.label, count: g.countNote || g.count, flush: true, attrs: `data-group="${esc(g.kind)}"`,
    action: g.more ? chip("More", { title: `${g.hits.length} shown: add a word to narrow` }) : "",
    body: lines(g.hits.map((h) => line({ attrs: `data-hit="${esc(h.ref)}" data-kind="${esc(h.kind)}"${h.dueForReview ? ` data-due="${esc(h.dueForReview)}"` : ""}`, title: noDash(h.title), href: h.href,
      sub: h.snippet && h.kind !== "check" ? txt(h.snippet) : "", meta: `${h.status ? chip(noDash(h.status)) : ""}${h.kind === "card" || h.kind === "doc" ? fresh(h) : ""}<span>${esc(h.updatedAt ? shortDate(h.updatedAt) : "")}</span>`,
      detail: lineDetail({ facts: [["Ref", `<code>${esc(h.ref)}</code>`], h.asOf ? ["As of", esc(h.asOf)] : null] }) })), { attrs: 'data-list="hits"' }) })).join("");
  // L4: the tiles add up to the total: the first three kinds, then "Other" for the rest; a capped kind makes the total "N+"
  const gs = f.groups || [], capped = gs.some((g) => g.countNote);
  const shownGs = gs.length > 4 ? gs.slice(0, 3) : gs, rest = gs.slice(shownGs.length);
  const restN = rest.reduce((n, g) => n + (Number(g.count) || 0), 0), restCapped = rest.some((g) => g.countNote);
  const glance = tileRow([tile({ label: "Matches", value: `${f.total}${capped ? "+" : ""}`, key: "matches", sub: (f.words || []).join(" ") }), ...shownGs.map((g) => tile({ label: g.label, value: g.countNote || g.count })),
    ...(rest.length ? [tile({ label: "Other", value: `${restN}${restCapped ? "+" : ""}`, sub: rest.map((g) => g.label).join(" · ") })] : [])], { region: "glance", label: "Search" });
  return `<div class="lx-results p-stack" data-region="results">${glance}${groups}</div>`;
}

// ---- What changed (sprint 3, L3: the revision) ----
// The head, the glance (changes, since), the ONE filter row (the tab, the change kind), the changes by day (each one line:
// who, what, its kind as a chip, what it reaches and when; opened in place: its refs and the way to its Impact). A grade is a
// RECORD, not a change (the owner's rule on this page, sprint 3 L3): grades roll into one quiet line a day, "N checks graded";
// the JSON twin (the `changes` tool) keeps every row.
export function renderChangesPage(ch, o = {}) {
  const c = ch || {};
  const nowMs = o.nowMs || Date.now();
  const tabs = ["", "build", "gtm", "goals", "decisions", "map", "broadcast"];
  const pq = o.project ? `project=${encodeURIComponent(o.project)}` : "";
  const sinceQ = o.since ? `since=${encodeURIComponent(o.since)}` : "";
  const hrefOf = (t, k) => { const qs = [t ? `tab=${t}` : "", k ? `kinds=${encodeURIComponent(k)}` : "", sinceQ, pq].filter(Boolean).join("&"); return orgPath("/changes") + (qs ? "?" + qs : ""); };
  const head = `<section class="cx-head" data-region="changes-head">${pageHead({ title: "What changed", crumbs: [{ label: "Home", href: orgPath("/home") }, { label: c.tab ? TAB_WORD[c.tab] || "All" : "All" }] })}</section>`;
  if (c.error) return CSS + `<section class="cx" data-screen="changes">${head}${card({ region: "changes", body: empty(c.error === "project_required" ? "Pick a project" : "Not read", c.error === "project_required" ? { action: { href: orgPath("/projects"), label: "Projects" } } : {}) })}</section>`;
  const all = c.changes || [];
  // the page's read leaves the grades out and counts them (src/extract.js CHANGES_WORK_SQL, GRADED_SINCE_SQL); a grade row that
  // still reaches it (an older read) is counted the same way
  const shown = all.filter((x) => x.change !== "grade");
  const gN = (c.graded ? Number(c.graded.n) || 0 : 0) + all.length - shown.length, gMore = !!(c.graded && c.graded.more);
  const gradedWords = gN ? `${gN}${gMore ? "+" : ""} ${gN === 1 && !gMore ? "check" : "checks"} graded` : "";
  const glance = tileRow([
    tile({ label: "Changes", value: shown.length, unit: c.more ? "+" : "", key: "changes", sub: gradedWords }),
    tile({ label: "Since", value: c.since ? c.since.label : "–", key: "since", sub: c.since && c.since.version ? dateOnly(c.since.at) : "", title: c.noVersion ? "No version yet: the last days" : "" }),
  ], { region: "glance", label: "What changed" });
  const kindNow = c.kinds && (o.kinds || "") ? String(o.kinds) : "";
  const kindCount = new Map();
  for (const x of shown) kindCount.set(x.change, (kindCount.get(x.change) || 0) + 1);
  const filters = filterRow({ label: "Filter what changed", groups: [
    { key: "tab", label: "Tab", items: tabs.map((t) => ({ label: t ? TAB_WORD[t] : "All", href: hrefOf(t, ""), current: (c.tab || "") === t, all: !t })) },
    { key: "kind", label: "Kind", items: [...kindCount].map(([k, n]) => ({ label: CHANGE_WORD[k] || k, count: n, href: hrefOf(c.tab || "", kindNow === k ? "" : k), current: kindNow === k })) },
  ] });
  const changeLine = (x) => {
    const refs = (x.refs || []).slice(0, 8).map((r) => (r.href ? `<a class="u-link" href="${esc(r.href)}">${esc(r.ref)}</a>` : `<code>${esc(r.ref)}</code>`)).join(", ") + ((x.refs || []).length > 8 ? ` +${esc(x.refs.length - 8)}` : "");
    const r = x.reaches;
    return line({ attrs: `data-change="${esc(x.id)}" data-kind="${esc(x.change)}"`, lead: avatar({ name: noDash(x.by || "someone"), size: 24 }), title: noDash(x.what || x.id), href: x.href,
      meta: `${chip(CHANGE_WORD[x.change] || x.change)}${r ? reachChip(r) : ""}<span>${esc(ago(happenedOf(x), nowMs))}</span>`,
      detail: lineDetail({ facts: [["Id", `<code>${esc(x.id)}</code>`], x.by ? ["By", txt(x.by)] : null, x.happenedAt && x.at && String(x.happenedAt).slice(0, 10) !== String(x.at).slice(0, 10) ? ["Filed", esc(String(x.at).slice(0, 10))] : null, refs ? ["Refs", refs] : null, r ? ["Impact", `<a class="u-link" href="${esc(r.href)}">${esc(reachWords(r))}</a>`] : null] }) });
  };
  // L4: the same kind of knowledge write, filed in one batch (one person, seconds apart, "N renders written" each), is ONE row:
  // "30 screen pictures" (the JSON twin keeps every row; the opened row lists them)
  const BATCH_MS = 120000;
  const batchKey = (x) => { const m = x.change === "knowledge" ? /^(\d+) (renders?|docs?|cards?|goals?|nodes?|checks?|questions?) written$/.exec(String(x.what || "")) : null; return m ? { n: Number(m[1]), noun: m[2].replace(/s$/, "") } : null; };
  const folded = [];
  for (const x of shown) {
    const k = batchKey(x), prev = folded[folded.length - 1];
    if (k && prev && prev.batch && prev.batch.noun === k.noun && prev.by === x.by && Math.abs(Date.parse(prev.at) - Date.parse(x.at)) <= BATCH_MS) { prev.batch.n += k.n; prev.batch.rows.push(x); prev.at = x.at; continue; }
    folded.push(k ? { ...x, batch: { ...k, rows: [x] } } : x);
  }
  const NOUN = { render: ["screen picture", "screen pictures"], doc: ["doc", "docs"], card: ["card", "cards"], goal: ["goal", "goals"], node: ["node", "nodes"], check: ["check", "checks"], question: ["question", "questions"] };
  const batchLine = (b) => { const w = NOUN[b.batch.noun] || [b.batch.noun, `${b.batch.noun}s`];
    return line({ attrs: `data-change="${esc(b.batch.rows[0].id)}" data-kind="knowledge" data-batch="${esc(b.batch.rows.length)}"`, lead: avatar({ name: noDash(b.by || "someone"), size: 24 }),
      title: `${b.batch.n} ${b.batch.n === 1 ? w[0] : w[1]}`, href: b.batch.rows[0].href,
      meta: `${chip(CHANGE_WORD.knowledge)}<span>${esc(ago(happenedOf(b), nowMs))}</span>`,
      detail: lineDetail({ facts: [["Writes", esc(String(b.batch.rows.length))], b.by ? ["By", txt(b.by)] : null, ["Ids", b.batch.rows.map((y) => `<code>${esc(y.id)}</code>`).join(", ")]] }) }); };
  const anyLine = (x) => (x.batch && x.batch.rows.length > 1 ? batchLine(x) : changeLine(x.batch ? x.batch.rows[0] : x));
  // by the day the work happened (L4, parts.js happenedOf), the newest work first inside a day
  const hMs = (x) => Date.parse(String(happenedOf(x) || "")) || 0;
  const days = byDay(folded.slice().sort((a, b) => hMs(b) - hMs(a)), happenedOf, nowMs);
  const gradeLine = gN ? lines([line({ attrs: `data-grades="${esc(gN)}"`, lead: chip("Grades"), title: gradedWords, href: orgPath("/map"), meta: `<span>${esc(c.since ? c.since.label : "")}</span>` })]) : "";
  // D6a: a day that holds more than one kind of change says how many of each, so its count reads against Build's (the day's
  // contributions) and Home's: one window, Today, counted the same way everywhere
  const daySplit = (xs) => { const by = new Map(); for (const x of xs) by.set(x.change, (by.get(x.change) || 0) + 1);
    return by.size > 1 ? `<span data-split>${[...by].map(([k, n]) => plural(n, CHANGE_WORD[k] || k, k === "knowledge" ? "knowledge" : undefined)).map(esc).join(" · ")}</span>` : ""; };
  const body = (days.length ? days.map(([d, xs], i) => group({ title: d, count: xs.length, open: i === 0, summary: `${avatarStack([...new Set(xs.map((x) => x.by).filter(Boolean))].map((name) => ({ name })), { size: 20 })}${daySplit(xs)}`, body: lines(xs.map(anyLine)) })).join("") : empty("Nothing changed")) + gradeLine;
  const list = card({ label: "Changes", count: shown.length ? `${shown.length}${c.more ? "+" : ""}` : "", flush: true, region: "changes", action: c.more ? chip("Newest", { count: shown.length, title: "The newest are shown; narrow by tab" }) : "", body: `<div data-list="changes">${body}</div>` });
  return CSS + `<section class="cx" data-screen="changes">${head}${stack(glance, filters, list)}</section>`;
}
// a row's chip: what it reaches when the walk was read (the `changes` tool's), else what it changed (the page's: L4), else the
// checks to redo first; it opens the row's Impact view, where the whole reach is read
function reachChip(r) {
  const t = r.toRedo ? `${r.toRedo} to redo` : r.total != null ? `${r.total} reached` : `${r.touched || 0} changed`;
  return `<a class="p-chip"${r.toRedo ? ' data-tone="warn"' : ""} href="${esc(r.href)}"${r.total != null ? ` data-reach="${esc(r.total)}"` : ` data-touched="${esc(r.touched || 0)}"`} title="${esc(reachWords(r))}">${esc(t)}</a>`;
}
function reachWords(r) {
  const types = Object.entries(r.byType || {}).map(([t, n]) => `${n} ${typeWord(t, n)}`);
  const head = r.total ? `reaches ${types.length ? types.join(", ") : plural(r.total, "node")}` : `changes ${plural(r.touched || 0, "node")}`;
  return head + (r.toRedo ? ` · ${plural(r.toRedo, "check")} to redo` : "");
}

const CSS = `<style>
.lx,.cx{display:block}
.lx-search{display:flex;align-items:center;gap:8px;width:min(420px,100%);height:36px;padding:0 4px 0 12px;border:1px solid var(--line-strong);border-radius:10px;background:var(--surface)}
.lx-search:focus-within{border-color:var(--text-muted)}
.lx-search svg{flex:none;width:16px;height:16px;fill:none;stroke:var(--text-muted);stroke-width:1.75;stroke-linecap:round}
.lx-search input{flex:1;min-width:0;height:100%;padding:0;border:0;background:none;font:400 14px/1.2 var(--sans);color:var(--text)}
.lx-search input:focus{outline:none}
.lx .p-head-act{flex:1 1 320px;justify-content:flex-end}
.lx [id^="lx-"]{scroll-margin-top:16px}
@media (max-width:600px){.lx .p-head-act{flex:1 1 100%}.lx-search{width:100%}}
</style>`;
