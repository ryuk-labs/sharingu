// Agent R — shared render-time helpers (Pass B / mechanical hygiene).
//
// ---- MOTION: opt-in hooks (the look pass, sprint 2). The shell's one stylesheet and its small motion script run them;
// a page writes no animation of its own. 120 to 260 ms, the brand's one curve (--ease), transform and opacity only (the
// spark's line draws with stroke-dashoffset, a paint), never a layout shift. The value is ALWAYS in the markup: without JS,
// or under prefers-reduced-motion (the shell's boot script then never sets html.u-motion), the final state renders at once.
//   data-count            on the element whose text IS the number ("66", "2.8", "1,204", "42%"): counts up from 0 the first
//                         time it is in view. metric({ count: true }) and statLine items { count: true } set it.
//   data-progress         progress({ value }) sets it: the bar fills from 0 the first time it is in view.
//   data-spark            spark(values) sets it: the line draws itself in (bars grow) on first view; a hover or the arrow
//                         keys read a point out.
//   data-reveal="1".."6"  on a page's top-level blocks: each rises 6px and fades in, 40 ms apart by its number, on load.
//   data-pulse="<key>"    beside data-value: pulses once when the value differs from the one this browser saw on its last
//                         visit to the same page (localStorage, per page and key). metric({ pulse: "<key>" }) sets it.
//   data-enter            on a row that just arrived (filed minutes ago): it enters softly on load.
//   press and copy        every .u-btn, .u-pill and rail item gives a small press; a copied call (.u-copy) confirms itself.
//   u-ping (keyframes)    a thing that changed live pings once, a ring that grows and fades (the Map's lights, when a check
//                         is graded while the page is open); a page puts it on the changed element under .u-motion only.
//
// ---- The shared parts (the look pass): pageHeader · section · row/rows · metric · statLine · callLine · stateChip ·
// emptyState (+ { quiet: true }) · loadingState · errorState · unreachableState · behindState · logo · uchan · table ·
// pills · progress · placeMeterChip · breadcrumb · spark · avatar. Each is styled ONCE in shell.js (UI_CSS /
// STATE_CSS / MOTION_CSS).
//
// esc() existed 21 times before this pass (18 shown by a first-pass grep for the
// `function esc` spelling, plus 2 written as `const esc = (v) => …` — src/qnaire.js,
// src/oauth.js — and one already surfaced by that same grep's own count of 19; see the
// Pass B report for the exact tally). They were NOT identical. Measured variants:
//   - &<> only (no quotes):              agentic, audit, home, pages, understanding, shell
//   - &<>" (no apostrophe):               architecture, blueprints, control, verbs, qnaire
//   - &<>"' (the full HTML-attribute set): lanes, login, oauth, queue, rt, report, refs, txpage
//   - a no-op that didn't escape anything at all: board.js — `String(v ?? "")`, no .replace
// Per the Pass B instruction ("if any differ, the superset wins"), esc() below is the
// full &<>"' escaper (group 3). Every call site now gets it, INCLUDING board.js, which
// means board.js's rendered fields are escaped for the first time — a real, intentional
// behavior change (a latent bug closed, not a normalization risk: state.json content was
// already meant to be escaped there, same as everywhere else it's rendered).
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// list(v) — a comma-separated string or array -> trimmed, non-empty strings. Byte-identical
// across its three prior homes (src/queue.js, src/report.js, src/txpage.js) before this
// pass. NOT the same thing as src/refs.js's parseRefs() — that file already explains why the
// two stayed apart (parseRefs is ref-grammar-scoped; this is the general touches/screens/
// components CSV-or-array helper) — parseRefs is untouched here.
// renderDenied({ what, signInHref }) — the ONE 403 body for a shelled surface (product pass
// 2026-09-05, M-ADR-024). /observatory, /orchestrator, /control and the owner-only REST gate
// each carried their own inline copy of the same <div style=…> with a different voice; one
// renderer now, so a refusal reads the same everywhere. `what` is the honest one-line reason;
// signInHref (optional) appends the way back in for an anonymous visitor.
export function renderDenied(opts) {
  const { what = "This page is not available to you.", signInHref = "" } = opts || {};
  // same-origin paths only — a refusal never links off-site (and never to a scheme).
  const sign = signInHref && signInHref.startsWith("/") && !signInHref.startsWith("//")
    ? ` <a href="${esc(signInHref)}" style="color:var(--brand-ink)">Sign in &rarr;</a>` : "";
  return `<div class="denied" style="padding:2rem;text-align:center;color:var(--ink-faint)">${esc(what)}${sign}</div>`;
}

// The product's name on glass (QE7ACBBA8): ONE literal. It lives here, not in shell.js, because shell.js imports
// this file (a reverse import would be a cycle); shell.js re-exports it for login.js and productTitle.
export const PRODUCT_NAME = "sharingu";
// D2 (B7): where a page wants its Lists region (src/tablists.js mountLists); a page without it gets the region at its end
export const LISTS_MARK = "<!--tab-lists-->";
// productEyebrow(brand) — "<Org> &middot; sharingu", or "sharingu" alone when the org is unnamed or IS the product
// (never "sharingu · sharingu", the same guard as shell.js productTitle). Escaped. brand.engine is never read: the
// engine's name stays in docs and on the MCP door, never an eyebrow (UI-B3a F1).
export function productEyebrow(brand) {
  const org = String((brand && brand.org) || "").trim();
  return org && org.toLowerCase() !== PRODUCT_NAME ? `${esc(org)} &middot; ${PRODUCT_NAME}` : PRODUCT_NAME;
}

// pageHeader({ brand, title, lede, scope, eyebrow, actions }) — the ONE page header (M-ADR-024 Wave 3,
// "one page grammar"). Ten renderers used to hand-roll the same eyebrow / <h1> / lede trio with
// drifting inline styles; every shelled page now opens with this. The eyebrow names the org (from
// the tenant seam, never typed) and the product, sharingu (productEyebrow above), and — when the
// caller passes `scope` — the workspace the page is scoped to, so a reader always sees WHERE they
// are, not just what page. An explicit `eyebrow` still wins ("" drops it). `ledeHtml` (trusted markup, e.g. a statLine)
// takes the lede's place. `actions` (trusted markup: the
// page's own buttons or forms) sits on the right of the title, bottom-aligned. `.eyebrow`, `.lede` and
// `.page-head` are styled once in shell.js (UI_CSS); nothing here carries inline CSS.
export function pageHeader(opts) {
  const { brand, title = "", lede = "", ledeHtml = "", scope = "", eyebrow, actions = "" } = opts || {};
  const eb = eyebrow !== undefined ? esc(eyebrow) : productEyebrow(brand);
  const sc = scope ? `<span class="page-scope"> &middot; ${esc(scope)}</span>` : "";
  const text = `${eb || sc ? `<p class="eyebrow">${eb}${sc}</p>` : ""}
  <h1>${esc(title)}</h1>
  ${ledeHtml || (lede ? `<p class="lede">${esc(lede)}</p>` : "")}`;
  if (actions) return `<header class="page-head has-actions">
  <div class="page-head-text">${text}</div>
  <div class="page-actions">${actions}</div>
</header>`;
  return `<header class="page-head">
  ${text}
</header>`;
}

// ---- The shared parts (the look pass, sprint 2; docs/plan/LOOK.md). Styled ONCE in shell.js UI_CSS, which every page
// gets from the shell: a page composes these and keeps only its own layout. Semantic colour tokens only (--page, --surface,
// --text, --text-muted, --line, --accent-*, --ok/--needs/--err/--stone), so each part reads in Paper and in Ink. ----

// section({ title, count, aside, body, region, id, cls, label, attrs }) — a titled block: a hairline under the head, no box.
// `label` draws the head as a tiny mono label instead of a title (a quiet, secondary section). `aside` is trusted markup.
export function section(opts) {
  const { title = "", count = null, aside = "", body = "", region = "", id = "", cls = "", label = false, attrs = "" } = opts || {};
  const n = count == null || count === "" ? "" : ` <span class="u-count">${esc(count)}</span>`;
  const head = title || aside ? `<header class="u-section-head"><h2${label ? ' class="u-label"' : ""}>${esc(title)}${n}</h2>${aside ? `<div class="u-section-aside">${aside}</div>` : ""}</header>` : "";
  return `<section class="u-section${cls ? ` ${esc(cls)}` : ""}"${region ? ` data-region="${esc(region)}"` : ""}${id ? ` id="${esc(id)}"` : ""}${attrs ? ` ${attrs}` : ""}>${head}${body}</section>`;
}

// row({ lead, title, href, context, meta, actions, attrs, tag }) — the list row: one line of meaning (title), one of
// context, right-aligned mono meta, then the row's own actions. lead / context / meta / actions are trusted markup (a
// chip, a form); title is text (escaped) unless titleHtml is given. Comfortable (about 42px); a list marked `compact`
// (u-rows compact) draws 32px rows. The rows sit in rows(...) (<ul class="u-rows">).
// `foot: true` puts the context and the actions on one line UNDER the title (context left, actions right), so a long
// title keeps the row's full width: the shape of a row a person acts on (Home's needs-you, a Decisions question).
export function row(opts) {
  const { lead = "", title = "", titleHtml, href = "", context = "", meta = "", actions = "", attrs = "", tag = "li", lead0 = true, foot = false } = opts || {};
  const t = titleHtml !== undefined ? titleHtml : esc(title);
  const titleEl = href && localHref(href) ? `<a class="u-row-title" href="${esc(href)}">${t}</a>` : `<span class="u-row-title">${t}</span>`;
  const ctx = context ? `<div class="u-row-context">${context}</div>` : "";
  const act = actions ? `<div class="u-row-actions">${actions}</div>` : "";
  const body = foot ? `${titleEl}${ctx || act ? `<div class="u-row-foot">${ctx}${act}</div>` : ""}` : `${titleEl}${ctx}`;
  return `<${tag} class="u-row${foot ? " foot" : ""}"${attrs ? ` ${attrs}` : ""}>${lead0 || lead ? `<span class="u-row-lead">${lead}</span>` : ""}<div class="u-row-body">${body}</div>${meta ? `<span class="u-row-meta">${meta}</span>` : ""}${foot ? "" : act}</${tag}>`;
}
export const rows = (items, opts = {}) => { const tag = opts.tag || "ul"; return `<${tag} class="u-rows${opts.compact ? " compact" : ""}"${opts.attrs ? ` ${opts.attrs}` : ""}>${(items || []).join("")}</${tag}>`; };

// metric({ key, label, value, sub, count, pulse }) — one number that matters: Fredoka, tabular, a label above and a line
// of context under. data-metric names it and data-value carries the number, so a check reads the value, never the markup
// around it. Motion (opt-in): count: true counts the number up on first view; pulse: "<key>" pulses it once when it moved
// since this browser's last visit. A number that is not a number ("?") never counts.
const countable = (v) => /^-?[\d,]*\.?\d+%?$/.test(String(v));
export function metric(opts) {
  const { key = "", label = "", value = "", sub = "", subHtml, count = false, pulse = "" } = opts || {};
  const v = value == null ? "?" : String(value);
  // data-pulse leads: the checks read data-metric then data-value then the close of the tag, adjacent (sims.sh S10b)
  return `<div class="u-metric"${pulse ? ` data-pulse="${esc(pulse)}"` : ""}${key ? ` data-metric="${esc(key)}"` : ""} data-value="${esc(v)}"><span class="u-metric-label">${esc(label)}</span><b class="u-metric-n"${count && countable(v) ? " data-count" : ""}>${esc(v)}</b>${subHtml !== undefined ? `<span class="u-metric-sub">${subHtml}</span>` : sub ? `<span class="u-metric-sub">${esc(sub)}</span>` : ""}</div>`;
}

// statLine(items, attrs?) — the counts as one calm line (a page header's second line): [{ key, value, label, sub, count,
// pulse }] -> "<b>2</b> open, yours (0 blocker · 1 high) · <b>339</b> in force …", each item carrying data-metric + data-value
// (count / pulse: the motion hooks, as metric's).
export function statLine(items, attrs = "") {
  return `<p class="u-stats"${attrs ? ` ${attrs}` : ""}>${(items || []).map((m) => { const v = m.value == null ? "?" : String(m.value);
    return `<span class="u-stat"${m.pulse ? ` data-pulse="${esc(m.pulse)}"` : ""}${m.key ? ` data-metric="${esc(m.key)}"` : ""} data-value="${esc(v)}"><b${m.count && countable(v) ? " data-count" : ""}>${esc(v)}</b> ${esc(m.label || "")}${m.sub ? ` <small>${esc(m.sub)}</small>` : ""}</span>`; }).join("")}</p>`;
}

// callLine(text) — the exact MCP call that fills something, as one copyable mono line (the shell's script copies it)
const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>';
export function callLine(text) {
  return `<div class="u-call"><code>${esc(text)}</code><button type="button" class="u-copy" data-copy data-client="copies the call" aria-label="Copy the call" title="Copy">${COPY_ICON}</button></div>`;
}

// ---- U-chan and the logo: ONE vector, the website's own (assets/brand/u-classic.svg and favicon.svg: the same paths, the
// same order, no ids so two on a page never collide). Orange body, ink outline, peach lenses. The outline is drawn in two
// groups so each world can keep it visible: .uc-line (the silhouette: feet, body, antennae, the bridge, all on the ground)
// and .uc-rim (the lens rims, on peach). The shell points them at --uchan-line / --uchan-rim (ink in Paper; in Ink the
// silhouette's line lifts off the dark ground, the rims stay ink). The attributes keep ink, so a page without the tokens
// (the favicon file, a banked report) still draws the brand's own mascot.
const UC_ATTRS = 'fill="none" stroke="#1C1917" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"';
const UC_BODY = '<ellipse cx="94" cy="258" rx="16" ry="10" fill="#FB923C"/><ellipse cx="146" cy="258" rx="16" ry="10" fill="#FB923C"/><path d="M40 96 L40 176 C40 226 72 250 120 250 C168 250 200 226 200 176 L200 96 A24 24 0 0 0 152 96 L152 176 C152 200 140 212 120 212 C100 212 88 200 88 176 L88 96 A24 24 0 0 0 40 96 Z" fill="#FB923C"/><path d="M58 106 q-15 -3 -24 -14"/><path d="M182 106 q15 -3 24 -14"/>';
const UC_RIMS = '<circle cx="84" cy="122" r="27" fill="#FBEEE3"/><circle cx="156" cy="122" r="27" fill="#FBEEE3"/>';
const UC_BRIDGE = '<path d="M110 118 q10 -9 20 0"/>';
const UC_EYES = '<g stroke="none"><circle cx="84" cy="126" r="8.5" fill="#1C1917"/><circle cx="156" cy="126" r="8.5" fill="#1C1917"/><circle cx="88" cy="122" r="3" fill="#FFFDF8"/><circle cx="160" cy="122" r="3" fill="#FFFDF8"/></g>';
const UC_INNER = `<g class="uc-line" ${UC_ATTRS}>${UC_BODY}</g><g class="uc-rim" ${UC_ATTRS}>${UC_RIMS}</g><g class="uc-line" ${UC_ATTRS}>${UC_BRIDGE}</g>${UC_EYES}`;
export const UCHAN_VIEWBOX = "4 42 232 256";
// uchan({ size, label }) — U-chan alone. Decorative unless a label is given. (logo({ wordmark: false }) is the same mark.)
export function uchan(opts) {
  const { size = 32, label = "", cls = "" } = opts || {};
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="u-uchan${cls ? ` ${esc(cls)}` : ""}${size <= 20 ? " u-uchan-sm" : ""}" viewBox="${UCHAN_VIEWBOX}" width="${Math.round(size * 0.906)}" height="${size}" ${a11y}>${UC_INNER}</svg>`;
}
// logo({ size, mark, wordmark, label }) — THE logo, the same everywhere (the rail, the phone's top bar, sign-in, the public
// pages, the empty states that carry U-chan): U-chan beside the lowercase Fredoka wordmark "sharingu", nothing substituted
// (DESIGN.md §Identity: no substitute mark). size is the mark's height in px; the word is set at 0.78 of it, 0.3 of it
// apart (the website's header lockup: a 35px mark, a 28px word, 8px between). At 20px and under the outline is drawn a
// little heavier so it stays a line at 16px (.u-uchan-sm). mark: false is the word alone; wordmark: false is the mark
// alone (the bare <svg>, so a state that places U-chan keeps its own layout). Decorative inside a labelled link unless
// `label` is given.
export function logo(opts) {
  const { size = 24, mark = true, wordmark = true, label = "" } = opts || {};
  if (!wordmark) return uchan({ size, label, cls: "u-logo-mark" });
  const word = `<span class="u-logo-word" style="font-size:${Math.round(size * 0.78)}px">${PRODUCT_NAME}</span>`;
  const a11y = label ? ` role="img" aria-label="${esc(label)}"` : "";
  return `<span class="u-logo" style="gap:${Math.max(4, Math.round(size * 0.3))}px"${a11y}>${mark ? uchan({ size, cls: "u-logo-mark" }) : ""}${word}</span>`;
}
// FAVICON_SVG — the website's favicon.svg (U-chan, the same vector), served at GET /favicon.svg (src/fonts.js iconResponse).
// A browser that draws its tabs dark gets the silhouette's line lifted off the dark strip (the Ink rule above, in the file).
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${UCHAN_VIEWBOX}"><style>@media (prefers-color-scheme:dark){.uc-line{stroke:#A39C92}}</style>${UC_INNER}</svg>`;

// ---- The state patterns (UI-B1b, Brand v2; styled once in shell.js STATE_CSS) ----
// QE9178667: EMPTY is drawn PER SCREEN (each caller writes its own sentence and may offer the one next
// action), LOADING and ERROR are ONE pattern each, applied unchanged. Q47C9CCD3: UNREACHABLE blocks writes
// and says why (the shell refuses a POST before the press while it is on the page). BEHIND (UI-B5b, QD08A1E8F:
// a screen that is behind says so) warns and still lets you act: it never blocks a write. Voice (design-law.json
// design.voice): short declaratives, every claim with its reason, no em dash anywhere. Red belongs to ERROR
// alone, and ERROR always carries its icon.
const STATE_ICON = {
  empty: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 3"/></svg>',
  error: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
  unreachable: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.8 5.2A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 3.7-2.2M15.6 10.6A10 10 0 0 1 19 12.5M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/></svg>',
  // BEHIND's own (design-law design.behind): a clock with a return arrow, never ERROR's or UNREACHABLE's
  behind: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 3.5v4h4"/><path d="M12 7.5V12l3 2"/></svg>',
};
// ---- The ONE state chip (UI-B5a, QB74B1B7E; design-law.json design.stateChips) ----
// Every state or severity chip on glass is drawn here and nowhere else: <span class="state-chip" data-chip="<STATE>">,
// the state one of the law's 11. Its colours live once, in shell.js CHIP_CSS (--bv-* tokens): orange is identity and
// never a state; red is ERROR's alone and ERROR always carries its icon. An unknown state never becomes a 12th value:
// it falls back to REVIEW (recorded, binding on no one). The class is not `.chip` (rt.js owns that one).
export const STATE_CHIPS = ["BLOCKER", "HIGH", "OPEN", "DECIDE", "APPROVE", "GRANT", "REVIEW", "LANDED", "gap", "pending", "ERROR"];
const CHIP_SET = new Set(STATE_CHIPS);
// stateChip(state, word?) -> the chip; `word` is the text on it (default: the state's own name).
export function stateChip(state, word) {
  const s = CHIP_SET.has(state) ? state : "REVIEW";
  const w = word == null || word === "" ? s : String(word);
  return `<span class="state-chip" data-chip="${s}">${s === "ERROR" ? STATE_ICON.error : ""}${esc(w)}</span>`;
}

// statusChip(state, word, tone?) -> the same state as a quiet word in the revision's look (src/parts.js .p-chip, sprint 3 L2):
// data-chip still names one of the 11 (only ui.js writes it), the tone is the status the state is (status colours for status
// only: LANDED ok; a state that waits on a person warn; ERROR keeps the law's own chip, red beside its icon). `tone` overrides
// (a needs-you row's kind reads quiet: the card already says it waits on you).
const STATUS_TONE = { LANDED: "ok", BLOCKER: "warn", HIGH: "warn", OPEN: "warn", DECIDE: "warn", APPROVE: "warn", GRANT: "warn", gap: "warn", REVIEW: "quiet", pending: "quiet" };
export function statusChip(state, word, tone) {
  const s = CHIP_SET.has(state) ? state : "REVIEW";
  if (s === "ERROR") return stateChip("ERROR", word);
  const t = ["quiet", "ok", "warn"].includes(tone) ? tone : STATUS_TONE[s] || "quiet";
  const w = word == null || word === "" ? s.charAt(0) + s.slice(1).toLowerCase() : String(word);
  return `<span class="p-chip" data-tone="${t}" data-chip="${s}">${esc(w)}</span>`;
}

// a same-origin path only: a state never links off-site (and never to a scheme)
const localHref = (h) => (typeof h === "string" && h.startsWith("/") && !h.startsWith("//") ? h : "");
const stateAction = (href, label) => (localHref(href) && label ? `<a class="state-action" href="${esc(href)}">${esc(label)}</a>` : "");

// emptyState(text, opts?) — EMPTY: this screen's own sentence (sentence case, full stop) and, when the
// screen has one, the next action ({ action: { href, label } }) and the exact MCP call that fills it ({ call }: one
// copyable mono line, and U-chan sits beside it, small: the one EMPTY a person can act on from their own Claude). The
// one-argument call stays valid.
// { quiet: true } is the SMALL empty: one muted sentence (and at most a quiet link), no box, no icon, for a side column or a
// secondary list (Home's "No goal moved this month."). The dashed, illustrated EMPTY stays for a page's main
// region. Both carry data-state="empty".
export function emptyState(text, opts) {
  const o = opts || {};
  const a = o.action || {};
  if (o.quiet) return `<p class="state-quiet" data-state="empty">${esc(text || "Nothing here yet")}${localHref(a.href) && a.label ? ` <a class="u-link" href="${esc(a.href)}">${esc(a.label)}</a>` : ""}</p>`;
  const icon = o.call ? logo({ size: 34, wordmark: false }) : STATE_ICON.empty;
  return `<div class="state state-empty${o.call ? " has-call" : ""}" data-state="empty">${icon}<div class="state-body"><p class="state-what">${esc(text || "Nothing here yet")}</p>${o.call ? callLine(o.call) : ""}${stateAction(a.href, a.label)}</div></div>`;
}

// loadingState(text?) — LOADING, one pattern: a live region that says what is being read.
export function loadingState(text) {
  return `<div class="state state-loading" data-state="loading" role="status" aria-live="polite"><div><p class="state-what">${esc(text || "Reading")}</p><span class="state-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>`;
}

// errorState({ what, why?, retryHref? }) — ERROR, one pattern: what failed, why when known, and the way to
// try again. The only red on the product, always beside its icon.
export function errorState(opts) {
  const { what = "This did not load.", why = "", retryHref = "" } = opts || {};
  return `<div class="state state-error" data-state="error" role="alert">${STATE_ICON.error}<div><p class="state-what">${esc(what)}</p>${why ? `<p class="state-why">${esc(why)}</p>` : ""}${stateAction(retryHref, "Try again")}</div></div>`;
}

// unreachableState({ what? }) — UNREACHABLE: the worker cannot be reached, so nothing can be recorded. It
// says why writes are off; reading what is already on the page still works. Needs-a-person amber, not red:
// nothing is broken on the person's side, they have to wait.
export function unreachableState(opts) {
  const { what = "The worker cannot be reached right now." } = opts || {};
  return `<div class="state state-unreachable" data-state="unreachable" role="alert">${STATE_ICON.unreachable}<div><p class="state-what">${esc(what)}</p><p class="state-why">Saving is off until it answers again, because a change made now could not be recorded. What is already on this page stays readable.</p></div></div>`;
}

// behindState({ page, head, viewing }) — BEHIND (UI-B5b; design-law design.behind; QD08A1E8F · QE9178667 · Q47C9CCD3):
// what a person reads is older than the served set. ONE pattern, the same everywhere: data-state="behind", role=status,
// its own icon, the stone well with dark text (never orange: orange is identity; never red: red is ERROR's). It says
// what moved and that acting still works, and its one action is "See v<n>".
//   head     the current version ({ n }); viewing: the version on the page ({ n, at }) when a person is LOOKING at an
//            older one (the Versions view): its action returns to the current version, client-side, to /versions
//   page     the page's own name when the shell finds the page itself behind (the head poll): its action opens /versions
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function dayMonth(iso) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return "an earlier publish";
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function behindState(opts) {
  const { page = "", head = null, viewing = null } = opts || {};
  const n = head && Number.isFinite(Number(head.n)) ? Number(head.n) : null;
  const see = n != null ? `See v${n}` : "See the current version";
  if (viewing) {
    const what = `You are looking at v${esc(viewing.n)}, from ${esc(dayMonth(viewing.at))}. It is not the current version. Viewing changes nothing.`;
    const why = `${n != null ? `The current version is v${n}. ` : ""}Acting still works: anything you do here is recorded against the current version.`;
    return `<div class="state state-behind" data-state="behind" role="status">${STATE_ICON.behind}<div><p class="state-what">${what}</p><p class="state-why">${esc(why)}</p><a class="state-action" href="${esc(orgPath("/versions"))}" data-button="back-to-current" data-client="returns to the current version">${esc(see)}</a></div></div>`;
  }
  const what = `${page ? `${page} is` : "This page is"} behind: ${n != null ? `v${n}` : "a newer version"} was published after it was drawn.`;
  const why = "Acting still works: what you do here is recorded against the current version. Reload to read it.";
  return `<div class="state state-behind" data-state="behind" role="status">${STATE_ICON.behind}<div><p class="state-what">${esc(what)}</p><p class="state-why">${esc(why)}</p>${stateAction(orgPath("/versions"), see)}</div></div>`;
}

// ---- The long-list and control parts (the look pass: other screens move onto these; styled once in shell.js UI_CSS) ----

// table({ columns, rows, caption, empty, attrs, cls }) — a long list as a table: compact 32px rows, a sticky header, a
// column with num: true right-aligned in tabular mono, and at phone width every row stacks into a small card whose cells
// carry their column's label. columns: [{ key, label, num, width, cls }]; rows: [{ cells: { <key>: text | { html } }, attrs }].
// A cell is TEXT (escaped) unless given as { html } (trusted markup: a chip, a link). `empty` (an emptyState) is drawn in
// place of a table with no row; caption names the table for a screen reader.
export function table(opts) {
  const { columns = [], rows: rs = [], caption = "", attrs = "", empty = "", cls = "" } = opts || {};
  if (!rs.length && empty) return empty;
  const cell = (v) => (v && typeof v === "object" && "html" in v ? v.html : esc(v ?? ""));
  const tdCls = (c) => [c.num ? "num" : "", c.cls || ""].filter(Boolean).join(" ");
  const head = columns.map((c) => `<th scope="col"${tdCls(c) ? ` class="${esc(tdCls(c))}"` : ""}${c.width ? ` style="width:${esc(c.width)}"` : ""}>${esc(c.label || "")}</th>`).join("");
  const body = rs.map((r) => `<tr${r.attrs ? ` ${r.attrs}` : ""}>${columns.map((c) => `<td data-label="${esc(c.label || "")}"${tdCls(c) ? ` class="${esc(tdCls(c))}"` : ""}>${cell((r.cells || {})[c.key])}</td>`).join("")}</tr>`).join("");
  return `<div class="u-table-wrap${cls ? ` ${esc(cls)}` : ""}"><table class="u-table"${attrs ? ` ${attrs}` : ""}>${caption ? `<caption class="u-sr">${esc(caption)}</caption>` : ""}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// pills(items, { label, attrs, segment, cls }) — the quiet filter / segment control (Decisions' status filter). items:
// [{ label, href, count, current, attrs, countUp }], each a LINK (a filter is a read, never an input), the current one
// aria-current="true", its count in small mono (countUp: true counts it up on first view); or { html } for a pill-shaped
// control the page draws itself (a menu). segment: true joins them into one segmented control. label names the <nav>.
export function pills(items, opts) {
  const { label = "", attrs = "", segment = false, cls = "" } = opts || {};
  const one = (p) => {
    if (!p) return "";
    if (p.html !== undefined) return p.html;
    const n = p.count == null || p.count === "" ? "" : ` <span class="u-count"${p.countUp && countable(p.count) ? " data-count" : ""}>${esc(p.count)}</span>`;
    const cur = p.current ? ' aria-current="true"' : "";
    return localHref(p.href) ? `<a class="u-pill" href="${esc(p.href)}"${cur}${p.attrs ? ` ${p.attrs}` : ""}>${esc(p.label)}${n}</a>`
      : `<span class="u-pill"${cur}${p.attrs ? ` ${p.attrs}` : ""}>${esc(p.label)}${n}</span>`;
  };
  return `<nav class="u-pills${segment ? " u-seg" : ""}${cls ? ` ${esc(cls)}` : ""}"${label ? ` aria-label="${esc(label)}"` : ""}${attrs ? ` ${attrs}` : ""}>${(items || []).map(one).join("")}</nav>`;
}

// progress({ value, max, label, sub, tone, attrs, showValue }) — a bar: value of max (default 1), clamped, role="progressbar"
// with its numbers. The fill is a transform (scaleX), so it never moves the layout; it fills from 0 on first view (the motion
// hook data-progress). label (text) above on the left, the percentage on the right in mono, sub under it. tone: "ok"
// (reached), "needs" (behind), "stone" (not started), or none: ink, the calm default (orange is identity, never a state).
export function progress(opts) {
  const { value = 0, max = 1, label = "", sub = "", tone = "", attrs = "", showValue = true } = opts || {};
  const m = Number(max) > 0 ? Number(max) : 1, v = Math.max(0, Math.min(m, Number(value) || 0)), p = (v / m).toFixed(3), pct = Math.round((v / m) * 100);
  const head = label || showValue ? `<div class="u-progress-head"><span>${esc(label)}</span>${showValue ? `<b data-count>${pct}%</b>` : ""}</div>` : "";
  return `<div class="u-progress-block"${attrs ? ` ${attrs}` : ""}>${head}<div class="u-progress"${["ok", "needs", "stone"].includes(tone) ? ` data-tone="${tone}"` : ""} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"${label ? ` aria-label="${esc(label)}"` : ""} data-progress="${p}"><span class="u-progress-fill" style="--p:${p}"></span></div>${sub ? `<p class="u-progress-sub">${esc(sub)}</p>` : ""}</div>`;
}

// placeMeterChip(content, chip) — the chip into a page's own header: after the first page header's title (ui.js pageHeader's
// <h1>); on the Map, under the overview's first line ("The map of …", src/mappage.js), else at the end of its toolbar (a full
// toolbar clips it at 1440: the overview is where the Map names itself); a page with none of these is returned as it was
export function placeMeterChip(content, chip) {
  const html = String(content || "");
  if (!chip) return html;
  const ph = html.search(/<header class="page-head[" ]/);
  if (ph >= 0) { const h1 = html.indexOf("</h1>", ph); if (h1 > 0) return html.slice(0, h1 + 5) + chip + html.slice(h1 + 5); }
  const ov = html.indexOf('<div class="mx-ov">');
  if (ov >= 0) { const p1 = html.indexOf("</p>", ov); if (p1 > 0) return html.slice(0, p1 + 4) + chip + html.slice(p1 + 4); }
  const bar = html.search(/<header class="mx-bar"/);
  if (bar >= 0) { const end = html.indexOf("</header>", bar); if (end > 0) return html.slice(0, end) + chip + html.slice(end); }
  return html;
}

// breadcrumb(items, attrs?) — where a page sits: [{ label, href, attrs }] (attrs: trusted hooks on the link), the last one the current page (text, aria-current="page").
// Same-origin paths only.
export function breadcrumb(items, attrs = "") {
  const list = (items || []).filter((x) => x && x.label);
  return `<nav class="u-crumbs" aria-label="Breadcrumb"${attrs ? ` ${attrs}` : ""}><ol>${list.map((x, i) => (i === list.length - 1 || !localHref(x.href)
    ? `<li><span${i === list.length - 1 ? ' aria-current="page"' : ""}>${esc(x.label)}</span></li>` : `<li><a href="${esc(x.href)}"${x.attrs ? ` ${x.attrs}` : ""}>${esc(x.label)}</a></li>`)).join("")}</ol></nav>`;
}

// spark(values, { label, kind, width, height, labels }) — a small trend: a line (kind "line", the default) or a bar strip
// (kind "bars"), a fixed-size inline SVG in the text's colours (never orange), drawn in on first view (the motion hook
// data-spark), with a hover and arrow-key readout of each point ("<labels[i]>: <value>"). The whole series is the figure's
// accessible name, so nothing is lost without JS or to a screen reader. Fewer than two finite values draws nothing.
export function spark(values, opts) {
  const { label = "", kind = "line", width = 120, height = 28, labels = [] } = opts || {};
  const v = (values || []).map(Number).filter(Number.isFinite);
  if (v.length < 2) return "";
  const W = Math.max(24, Number(width) || 120), H = Math.max(12, Number(height) || 28), pad = 3;
  const lo = Math.min(0, ...v), hi = Math.max(...v), span = hi - lo || 1;
  const y = (x) => +(H - pad - ((x - lo) / span) * (H - pad * 2)).toFixed(2);
  const fmt = (x) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(2)));
  const read = v.map((x, i) => `${labels[i] != null && labels[i] !== "" ? `${String(labels[i]).replace(/\|/g, "/")}: ` : ""}${fmt(x)}`);
  const name = `${label ? `${label}: ` : ""}${v.length <= 12 ? v.map(fmt).join(", ") : `${fmt(v[0])} to ${fmt(v[v.length - 1])}, low ${fmt(Math.min(...v))}, high ${fmt(hi)}`}`;
  let body, pts;
  if (kind === "bars") {
    const bw = W / v.length;
    pts = v.map((x, i) => [+(i * bw + bw / 2).toFixed(2), y(x)]);
    body = v.map((x, i) => { const h = Math.max(1, +(H - pad - y(x)).toFixed(2)); return `<rect class="u-spark-bar" x="${(i * bw + bw * 0.14).toFixed(2)}" y="${(H - pad - h).toFixed(2)}" width="${(bw * 0.72).toFixed(2)}" height="${h}" rx="1.5" style="--i:${i}"/>`; }).join("");
  } else {
    pts = v.map((x, i) => [+((i / (v.length - 1)) * (W - pad * 2) + pad).toFixed(2), y(x)]);
    const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px} ${py}`).join(" "), last = pts[pts.length - 1];
    body = `<path class="u-spark-area" d="${d} L${last[0]} ${H - pad} L${pts[0][0]} ${H - pad} Z"/><path class="u-spark-line" pathLength="1" d="${d}"/><circle class="u-spark-end" cx="${last[0]}" cy="${last[1]}" r="2.2"/><circle class="u-spark-cursor" cx="${last[0]}" cy="${last[1]}" r="2.8"/>`;
  }
  return `<figure class="u-spark" data-spark="${kind === "bars" ? "bars" : "line"}" data-pts="${pts.map((p) => p.join(",")).join(" ")}" data-read="${esc(read.join("|"))}" tabindex="0" role="img" aria-label="${esc(name)}"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${body}</svg><span class="u-spark-read" aria-hidden="true"></span></figure>`;
}

// avatar({ initials, tone, size, label, attrs }) — a person's mark: their initials on a presence tone (src/hats.js avatarOf
// reads both off a person; people.avatar is their own choice, migrate-044). tone: stone (the quiet default) · gold · sky ·
// violet, the brand's presence colours, which are for avatars, cursors and pins only (styled once in shell.js UI_CSS). size:
// 20 · 28 (the default) · 40 · 64. Decorative (aria-hidden) unless a label is given.
export function avatar(opts) {
  const { initials = "?", tone = "stone", size = 28, label = "", attrs = "" } = opts || {};
  const t = ["stone", "gold", "sky", "violet"].includes(tone) ? tone : "stone";
  const sz = [20, 28, 40, 64].includes(Number(size)) ? Number(size) : 28;
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<span class="u-avatar" data-tone="${t}"${sz === 28 ? "" : ` data-size="${sz}"`} ${a11y}${attrs ? ` ${attrs}` : ""}>${esc(String(initials).slice(0, 3))}</span>`;
}

export function list(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// sourceRefs(source) — the same refs with no wrapper and no label (sprint 3 L3: a detail page's "Source" fact), "" when none
export function sourceRefs(src) {
  const list = (Array.isArray(src) ? src : []).filter((x) => x && typeof x.ref === "string" && x.ref.trim());
  if (!list.length) return "";
  const one = (x) => {
    const ref = x.ref.trim(), label = typeof x.label === "string" && x.label.trim() ? x.label.trim() : "", kind = String(x.kind || "");
    const art = kind === "artifact" ? ref.replace(/^\/artifact\//, "") : "";
    const body = art && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(art) ? `<a class="u-link" href="${esc(orgPath(`/view?src=${encodeURIComponent("/artifact/" + art)}`))}">${esc(label || ref)}</a>`
      : kind === "url" && /^https?:\/\/\S+$/i.test(ref) ? `<a class="u-link" href="${esc(ref)}" rel="noopener noreferrer" target="_blank">${esc(label || ref)}</a>`
      // sprint 12's review: a labelled file or commit shows its label, its ref on hover (a header cell never stacks both)
      : label ? esc(label) : `<code>${esc(ref.length > 40 ? ref.slice(0, 40) + "..." : ref)}</code>`;
    return `<span data-source="${esc(kind)}"${label && !art && kind !== "url" ? ` title="${esc(ref)}"` : ""}>${body}</span>`;
  };
  return list.map(one).join('<span class="u-source-sep" aria-hidden="true"> · </span>');
}

// dateOnly(v) — the leading YYYY-MM-DD off an ISO-ish timestamp, or the raw trimmed string
// if it doesn't start with one, or "—" if empty. Byte-identical across its three prior homes
// (src/report.js, src/queue.js, src/txpage.js).
export function dateOnly(v) {
  const s = String(v || "").trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s || "—";
}

// fmtDate(iso, opts) — "YYYY-MM-DD HH:MM:SS UTC" off an ISO-ish timestamp. Hoisted
// (M-ADR-008 T3) from its three prior near-identical homes: src/audit.js and
// src/pages.js were already byte-identical; src/board.js diverged only in its two
// edge-case fallbacks (a no-date fallback of "unknown" instead of "—", and an
// UNESCAPED invalid-date fallback — String(iso) instead of esc(iso)), both preserved
// here via opts so every existing call site renders the exact same bytes it did
// before. The core valid-date format is unchanged and unparameterized.
export function fmtDate(iso, opts) {
  const o = opts || {};
  const emptyText = o.emptyText !== undefined ? o.emptyText : "—";
  const escapeFallback = o.escapeFallback !== undefined ? o.escapeFallback : true;
  if (!iso) return emptyText;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return escapeFallback ? esc(iso) : String(iso);
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  } catch {
    return escapeFallback ? esc(iso) : String(iso);
  }
}
