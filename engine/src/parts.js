// src/parts.js — the revision's page parts (owner, 2026-10-02; docs/plan/LOOK.md "The revision").
//
// Pure functions that return HTML strings, beside ui.js's parts (they import its esc and breadcrumb and never clash with
// it: every class here starts with "p-"), and ONE stylesheet, PARTS_CSS, written on the shell's semantic tokens only
// (--page --surface --well --hover --text --text-muted --text-faint --line --line-strong --accent* --ok --needs --err
// --stone and their -tint, the presence colours for avatars, --mono --sans, --ease --dur-fast): Paper and Ink from the
// same rules, no raw colour.
//
// The grammar the parts serve: three depths (a glance strip of tiles → one-line rows, grouped, the settled folded → the
// details opening in place), a page made of a few cards (a tiny mono label, one job, never a card in a card), faces on
// rows, shapes over sentences (inline SVG, ink bars, status colours for status only, orange once per view: the rail's
// current tab already spends it, so no part here uses orange unless a caller asks for tone "accent"), one filter row for
// every list (links, the choice kept in the address), pristine copy (a part never writes a sentence of its own).
//
// Accessibility: every chart is role="img" with its numbers in its name; numbers are tabular; a cut title carries the
// whole title in title=""; focus rings are the shell's (:focus-visible); nothing moves the layout (fills are transforms,
// the motion hooks are the shell's data-count and data-progress). Without script everything works: groups, rows and the
// filter's "More" are <details>.
//
// The parts: card · tile · tileRow · avatar · avatarStack · bar · segBar · miniBars · sparkline · ring · chip · filterRow
// (+ hrefWith) · group · line · lines · lineDetail · facts · optionCards · empty · pageHead · cols · btn · id · ago · num ·
// foldToggle and foldKit (the folds a person keeps on the Map's views: M1, M5).
import { esc, breadcrumb } from "./ui.js";
import { avatarOf } from "./hats.js";

const localHref = (h) => (typeof h === "string" && h.startsWith("/") && !h.startsWith("//") ? h : "");
const attr = (k, v) => (v == null || v === "" || v === false ? "" : ` ${k}="${esc(v)}"`);
const countable = (v) => /^-?[\d,]*\.?\d+%?$/.test(String(v));
const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (x) => +Number(x).toFixed(2);
const TONES = ["quiet", "ok", "warn", "bad", "accent"];
const toneAttr = (t) => (TONES.includes(t) ? ` data-tone="${t}"` : "");

// num(n) — 1204 -> "1,204"; a non-number is returned as text
export function num(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(n ?? "");
}
// ago(iso, now) — the short mono time a row carries: "now", "23m", "5h", "3d", else "28 Sep" (this year) or "28 Sep 2025"
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function ago(iso, now = Date.now()) {
  const t = Date.parse(String(iso || "")); const n = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (n - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  const d = new Date(t), y = new Date(n).getUTCFullYear();
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${d.getUTCFullYear() === y ? "" : ` ${d.getUTCFullYear()}`}`;
}
// happenedOf(r) — THE time of a contribution (L4): when its work HAPPENED (happenedAt, migrate-051), else when it was filed.
// Every "when" a page shows on a contribution reads it (Build's list and its Moved card, a goal's contributions, Home's week
// and What changed, the contribution page, What changed, Impact); the filing time shows only in an opened row's facts.
export const happenedOf = (r) => (r && (r.happenedAt || r.happened_at || r.at || r.created_at)) || null;
// dayOf(iso, now) — a row's day as a group's title: "Today", "Yesterday", else "Mon 28 Sep" (this year) or "28 Sep 2025";
// "" when the time does not parse. byDay(rows, at, now) -> [[title, rows]], the days newest first, the rows' order kept inside
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayOf(iso, now = Date.now()) {
  const t = Date.parse(String(iso || "")); const n = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(t)) return "";
  const d0 = new Date(n); d0.setUTCHours(0, 0, 0, 0);
  if (t >= d0.getTime()) return "Today";
  if (t >= d0.getTime() - 864e5) return "Yesterday";
  const d = new Date(t), y = new Date(n).getUTCFullYear();
  return d.getUTCFullYear() === y ? `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function byDay(rows, at, now = Date.now()) {
  const get = typeof at === "function" ? at : (r) => r && r[at];
  const days = new Map();
  for (const r of rows || []) { const k = String(get(r) || "").slice(0, 10) || "~"; if (!days.has(k)) days.set(k, []); days.get(k).push(r); }
  return [...days].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).map(([k, xs]) => [k === "~" ? "Undated" : dayOf(get(xs[0]), now) || k, xs]);
}
// words(html, { source }) — a person's own words in a card (a why, a ruling's reason, a body): reading type, 72ch; source is
// trusted markup (a face, a name, where it was recorded) on a quiet line under them
export const words = (html, opts = {}) => `<div class="p-words">${html}${opts.source ? `<p class="p-src">${opts.source}</p>` : ""}</div>`;
// copyBtn(text, { label, title, attrs, href }) — ONE Copy button that carries what it copies (a call, a config, a key) in a hidden
// <code> beside it (the shell's [data-copy] handler copies its sibling code): the text never sits on the screen as prose. A
// pressed Copy reads "Copied" for two seconds, then its own label again (the shell's handler). With href it is a LINK to the
// item: the script copies instead of following it, and with script off (or no clipboard) the link opens the item
export const copyBtn = (text, opts = {}) => {
  const a = `class="u-btn small ghost" data-copy data-client="copies it to the clipboard"${attr("title", opts.title === undefined ? text : opts.title)}${opts.attrs ? ` ${opts.attrs}` : ""}`;
  const label = esc(opts.label || "Copy");
  return `<span class="p-copy"><code hidden>${esc(text)}</code>${opts.href ? `<a href="${esc(opts.href)}" ${a}>${label}</a>` : `<button type="button" ${a}>${label}</button>`}</span>`;
};
// kindWord(kind) — THE word for a contribution's kind (L4), the same on Build's chips, its By-kind card and filters and the
// contribution page: "pr" reads "code change"; a kind with no word of its own reads as filed
const KIND_WORDS = { pr: "code change", doc: "doc", note: "note", screen: "screen design", brand: "brand", knowledge: "knowledge", grade: "grade", answer: "answer",
  counter: "counter", critique: "critique", update: "vendor update", requirement: "requirement", outreach: "outreach", social: "social post", content: "content", campaign: "campaign" };
export const kindWord = (k) => KIND_WORDS[String(k || "").toLowerCase()] || String(k || "");
// id(text) — an id or a ref, in mono (it lives in an expanded row, never on the line itself)
export const id = (t) => `<code class="p-id">${esc(t)}</code>`;

// hrefWith(path, params, key, value) — the filter's address: the page's current params with one changed (value "" or null
// drops it), keys in a stable order, so a choice is always kept in the address and every chip is a plain link
export function hrefWith(path, params, key, value) {
  const p = { ...(params || {}) };
  if (key) { if (value == null || value === "") delete p[key]; else p[key] = String(value); }
  const q = Object.keys(p).filter((k) => p[k] != null && p[k] !== "").sort((a, b) => (a === "eval") - (b === "eval") || (a < b ? -1 : a > b ? 1 : 0)).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`).join("&");
  return `${path}${q ? `?${q}` : ""}`;
}

// btn(label, { href, primary, small, ghost, type, attrs, title }) — ui.js's button classes (.u-btn), as a link or a button
export function btn(label, opts) {
  const { href = "", primary = false, small = true, ghost = false, type = "button", attrs = "", title = "" } = opts || {};
  const cls = `u-btn${primary ? " primary" : ""}${small ? " small" : ""}${ghost ? " ghost" : ""}`;
  const a = `${attr("title", title)}${attrs ? ` ${attrs}` : ""}`;
  return localHref(href) ? `<a class="${cls}" href="${esc(href)}"${a}>${esc(label)}</a>` : `<button class="${cls}" type="${esc(type)}"${a}>${esc(label)}</button>`;
}

// ---- card({ label, count, action, body, region, tone, flush, attrs, id }) ----
// One region of a page with one job: a tiny mono label (and its count) on the left of the head, at most one action on
// the right (trusted markup: a link or a small button), the body under it. tone "needs" marks the card that waits on the
// reader (the label and its dot in the needs colour, nothing louder); tone "quiet" drops the ground and the edge (a side
// note that is not a region of its own). flush: the body has no padding (a list of lines draws its own gutters).
export function card(opts) {
  const { label = "", count = null, action = "", body = "", region = "", tone = "", flush = false, attrs = "", id: cid = "" } = opts || {};
  const n = count == null || count === "" ? "" : `<span class="p-count">${esc(count)}</span>`;
  const head = label || action ? `<header class="p-card-head"><h2 class="p-label">${tone === "needs" ? '<i class="p-dot" aria-hidden="true"></i>' : ""}${esc(label)}</h2>${n}${action ? `<div class="p-card-act">${action}</div>` : ""}</header>` : "";
  const cls = `p-card${tone === "needs" ? " p-card-needs" : tone === "quiet" ? " p-card-quiet" : ""}${flush ? " p-flush" : ""}`;
  return `<section class="${cls}"${attr("id", cid)}${label ? attr("aria-label", label) : ""}${attrs ? ` ${attrs}` : ""}${attr("data-region", region)}>${head}<div class="p-card-body">${body}</div></section>`;
}

// ---- tile({ label, value, unit, sub, chart, tone, href, key, count, title, attrs }) ----
// One number that answers "how is it going": the label (tiny mono), the value (tabular, large), an optional unit ("of 21",
// "%"), an optional sub (mono: "+4 this week") and an optional small chart (a sparkline, miniBars, a ring, a bar) on the
// right. tone (ok · warn · bad) is a status dot before the label, never the number's colour. href makes the tile a link
// (to the list it counts, filtered). key/value are the data-metric / data-value hooks a check reads (ui.js metric's).
// count: true counts the number up on first view (the shell's motion hook). attrs: trusted hooks of the page's own (after data-value).
export function tile(opts) {
  const { label = "", value = "", unit = "", sub = "", chart = "", tone = "", href = "", key = "", count = false, title = "", attrs = "" } = opts || {};
  const v = value == null || value === "" ? "–" : String(value);
  const dot = ["ok", "warn", "bad"].includes(tone) ? `<i class="p-dot" data-tone="${tone}" aria-hidden="true"></i>` : "";
  const inner = `<span class="p-tile-label">${dot}${esc(label)}</span><span class="p-tile-row"><span class="p-tile-v"><b${count && countable(v) ? " data-count" : ""}>${esc(v)}</b>${unit ? `<small${/^%/.test(unit) ? ' class="p-pct"' : ""}>${esc(unit)}</small>` : ""}</span>${chart ? `<span class="p-tile-chart">${chart}</span>` : ""}</span>${sub ? `<span class="p-tile-sub">${esc(sub)}</span>` : ""}`;
  const hooks = `${attr("data-metric", key)} data-value="${esc(v)}"${attrs ? ` ${attrs}` : ""}${toneAttr(tone)}${attr("title", title)}`;
  return localHref(href) ? `<a class="p-tile" href="${esc(href)}"${hooks}>${inner}</a>` : `<div class="p-tile"${hooks}>${inner}</div>`;
}
// tileRow(tiles, { region, label }) — the glance strip: the tiles side by side in ONE card, hairlines between them; two a
// row at phone width (an odd last tile takes the whole row)
export function tileRow(tiles, opts) {
  const { region = "", label = "" } = opts || {};
  const t = (tiles || []).filter(Boolean);
  return `<section class="p-card p-tiles"${attr("data-region", region)}${attr("aria-label", label)}><div class="p-tiles-grid" style="--n:${Math.max(1, t.length)}"${t.length % 2 ? " data-odd" : ""}>${t.join("")}</div></section>`;
}

// ---- avatar({ name, initials, tone, src, size, label, attrs }) and avatarStack(people, { max, size, label }) ----
// A person's face: their picture (src, a same-origin path or an https URL) when they have one, else their initials on their
// presence tone (src/hats.js avatarOf: their own choice, else a tone from their id or name). Sizes 20 · 24 · 32. The name
// rides in title=""; decorative (aria-hidden) beside a written name unless label: true names it.
export function avatar(opts) {
  const o = opts || {};
  const size = [20, 24, 32].includes(Number(o.size)) ? Number(o.size) : 24;
  const a = avatarOf({ id: o.id, name: o.name || "", avatar: o.tone && o.initials ? `${o.tone}:${o.initials}` : o.avatar });
  const initials = o.initials || a.initials || "?";
  const tone = ["stone", "gold", "sky", "violet"].includes(o.tone) ? o.tone : a.tone;
  const src = typeof o.src === "string" && (localHref(o.src) || /^https:\/\/\S+$/.test(o.src)) ? o.src : "";
  const a11y = o.label ? ` role="img" aria-label="${esc(o.name || initials)}"` : ' aria-hidden="true"';
  return `<span class="p-av" data-size="${size}" data-tone="${tone}"${attr("title", o.name)}${a11y}${o.attrs ? ` ${o.attrs}` : ""}>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : esc(String(initials).slice(0, 2))}</span>`;
}
export function avatarStack(people, opts) {
  const { max = 4, size = 24, label = "" } = opts || {};
  const list = (people || []).filter(Boolean);
  if (!list.length) return "";
  const shown = list.slice(0, list.length > max ? max - 1 : max), more = list.length - shown.length;
  const names = list.map((p) => p.name).filter(Boolean);
  const name = `${label ? `${label}: ` : ""}${names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`}`;
  return `<span class="p-avs" data-size="${[20, 24, 32].includes(size) ? size : 24}" role="img" aria-label="${esc(name)}" title="${esc(names.join(", "))}">${shown.map((p) => avatar({ ...p, size })).join("")}${more > 0 ? `<span class="p-av p-av-more" data-size="${size}" aria-hidden="true">+${more}</span>` : ""}</span>`;
}

// ---- bar({ value, max, label, show, tone, width }) ----
// A single value of a target: an ink fill on a quiet track (tone ok · warn · bad only when the fill IS a status), the value
// beside it in mono ("70%" by default; show: "of" prints "3/5", show: "" prints nothing). It fills from 0 the first time
// it is in view (the shell's data-progress hook), with no layout shift.
export function bar(opts) {
  const { value = 0, max = 1, label = "", show = "pct", tone = "", width = 0 } = opts || {};
  const m = finite(max) > 0 ? finite(max) : 1, v = Math.max(0, Math.min(m, finite(value))), p = v / m;
  const txt = show === "of" ? `${num(value)}/${num(max)}` : show === "pct" ? `${Math.round(p * 100)}%` : "";
  const name = `${label ? `${label}: ` : ""}${show === "of" ? `${num(value)} of ${num(max)}` : `${Math.round(p * 100)}%`}`;
  return `<span class="p-bar"${width ? ` style="--w:${Number(width)}px"` : ""} role="img" aria-label="${esc(name)}"><span class="p-bar-track"${toneAttr(tone)} data-progress="${p.toFixed(3)}"><i style="--p:${p.toFixed(3)}"></i></span>${txt ? `<span class="p-bar-v" aria-hidden="true">${esc(txt)}</span>` : ""}</span>`;
}

// ---- segBar({ segments, label, legend, total }) ----
// Parts of a whole side by side: segments [{ label, value, tone }] where tone is "done" (ink), "progress" (half ink),
// "todo" (the track), or a status ("ok" · "warn" · "bad"). legend: true writes the one legend line under it ("31 done ·
// 12 in progress · 12 not started", a swatch each); a zero segment draws nothing and is left out of the legend.
export function segBar(opts) {
  const { segments = [], label = "", legend = true, height = 8 } = opts || {};
  const segs = segments.filter((s) => s && finite(s.value) > 0);
  const total = segs.reduce((a, s) => a + finite(s.value), 0);
  const name = `${label ? `${label}: ` : ""}${segs.map((s) => `${num(s.value)} ${s.label}`).join(", ") || "none"}`;
  const tone = (t) => (["done", "progress", "todo", "ok", "warn", "bad"].includes(t) ? t : "done");
  const bars = total ? segs.map((s) => `<i data-seg="${tone(s.tone)}" style="flex:${finite(s.value)} 1 0"></i>`).join("") : '<i data-seg="todo" style="flex:1 1 0"></i>';
  const leg = legend && segs.length ? `<span class="p-legend" aria-hidden="true">${segs.map((s) => `<span><i data-seg="${tone(s.tone)}"></i><b>${esc(num(s.value))}</b> ${esc(s.label)}</span>`).join("")}</span>` : "";
  return `<span class="p-seg" role="img" aria-label="${esc(name)}"><span class="p-seg-bar" style="--h:${Number(height) || 8}px">${bars}</span>${leg}</span>`;
}

// ---- miniBars(values, { labels, stack, width, height, label, max }) ----
// A week (or any short run) as small bars, ink; stack: a second series drawn on top in half ink (landed under filed, say).
// labels (Mon … Sun, or "M T W T F S S") are written under the bars in mono; the last bar is today and reads full ink. A
// zero is a hairline tick, so a quiet day still shows. The numbers are the figure's name.
export function miniBars(values, opts) {
  const { labels = [], stack = null, width = 112, height = 32, label = "", max = 0, showLabels = false } = opts || {};
  const a = (values || []).map(finite), b = stack ? stack.map(finite) : null;
  const n = a.length;
  if (!n) return "";
  const tot = a.map((x, i) => x + (b ? b[i] || 0 : 0));
  const hi = Math.max(finite(max), ...tot, 1), W = Math.max(24, Number(width) || 112), H = Math.max(12, Number(height) || 32);
  const slot = W / n, bw = Math.max(2, slot * 0.62), y = (v) => (v / hi) * (H - 1);
  const rects = a.map((x, i) => {
    const bx = r2(i * slot + (slot - bw) / 2), h1 = y(x), h2 = b ? y(b[i] || 0) : 0;
    if (!x && !(b && b[i])) return `<rect class="p-mb-zero" x="${bx}" y="${H - 1}" width="${r2(bw)}" height="1"/>`;
    return `<rect class="p-mb-a${i === n - 1 ? " p-mb-now" : ""}" x="${bx}" y="${r2(H - h1)}" width="${r2(bw)}" height="${r2(Math.max(1, h1))}" rx="1"/>${h2 ? `<rect class="p-mb-b" x="${bx}" y="${r2(H - h1 - h2)}" width="${r2(bw)}" height="${r2(h2)}" rx="1"/>` : ""}`;
  }).join("");
  const read = a.map((x, i) => `${labels[i] ? `${labels[i]} ` : ""}${num(x)}${b ? ` + ${num(b[i] || 0)}` : ""}`).join(", ");
  const lab = showLabels && labels.length ? `<span class="p-mb-labels" style="--n:${n}" aria-hidden="true">${labels.map((l) => `<span>${esc(String(l).slice(0, W / n < 26 ? 1 : 3))}</span>`).join("")}</span>` : "";
  return `<span class="p-mb" role="img" aria-label="${esc(`${label ? `${label}: ` : ""}${read}`)}"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${rects}</svg>${lab}</span>`;
}

// ---- sparkline(values, { width, height, label }) ----
// A trend as one ink line with its last point marked; the run is its name ("Filed a day: 3, 5, 4, 8, 6, 9, 12").
export function sparkline(values, opts) {
  const { width = 88, height = 28, label = "" } = opts || {};
  const v = (values || []).map(Number).filter(Number.isFinite);
  if (v.length < 2) return "";
  const W = Math.max(24, Number(width) || 88), H = Math.max(12, Number(height) || 28), pad = 2.5;
  // a run that barely moves draws nearly flat: the span never reads less than 40% of the largest value
  const lo0 = Math.min(...v), hi0 = Math.max(...v), span = Math.max(hi0 - lo0, Math.abs(hi0) * 0.4, 1), lo = (lo0 + hi0) / 2 - span / 2;
  const pts = v.map((x, i) => [r2(pad + (i / (v.length - 1)) * (W - pad * 2)), r2(H - pad - ((x - lo) / span) * (H - pad * 2))]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" "), last = pts[pts.length - 1];
  return `<span class="p-spark" role="img" aria-label="${esc(`${label ? `${label}: ` : ""}${v.map((x) => num(x)).join(", ")}`)}"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path class="p-spark-area" d="${d} L${last[0]} ${H} L${pts[0][0]} ${H} Z"/><path class="p-spark-line" d="${d}"/><circle class="p-spark-end" cx="${last[0]}" cy="${last[1]}" r="2.25"/></svg></span>`;
}

// ---- ring({ value, max, size, label, center, tone }) ----
// A count of a target as a ring: the ink arc over a quiet track, the count (or center text) inside when the ring is 32px
// or more. tone ok · warn · bad only when the arc IS a status.
export function ring(opts) {
  const { value = 0, max = 1, size = 36, label = "", center, tone = "" } = opts || {};
  const m = finite(max) > 0 ? finite(max) : 1, v = Math.max(0, Math.min(m, finite(value))), p = v / m;
  const S = [16, 20, 24, 32, 36, 44].includes(Number(size)) ? Number(size) : 36, sw = S >= 32 ? 3.5 : 2.5, r = (S - sw) / 2, c = 2 * Math.PI * r;
  const mid = center !== undefined ? String(center) : S >= 32 ? num(value) : "";
  return `<span class="p-ring" data-size="${S}"${toneAttr(tone)} role="img" aria-label="${esc(`${label ? `${label}: ` : ""}${num(value)} of ${num(max)}`)}"><svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" aria-hidden="true"><circle class="p-ring-track" cx="${S / 2}" cy="${S / 2}" r="${r2(r)}" stroke-width="${sw}"/><circle class="p-ring-arc" cx="${S / 2}" cy="${S / 2}" r="${r2(r)}" stroke-width="${sw}" stroke-dasharray="${r2(c * p)} ${r2(c)}" transform="rotate(-90 ${S / 2} ${S / 2})"/></svg>${mid ? `<b aria-hidden="true">${esc(mid)}</b>` : ""}</span>`;
}

// ---- chip(text, { tone, count, title, attrs, href }) ----
// A status word: quiet (the default) · ok · warn · bad · accent (orange: once per view, and the rail's current tab has
// usually spent it). A count rides after the word in mono. A link when href is given.
export function chip(text, opts) {
  const { tone = "quiet", count = null, title = "", attrs = "", href = "" } = opts || {};
  const n = count == null || count === "" ? "" : `<span class="p-chip-n">${esc(num(count))}</span>`;
  const inner = `${esc(text)}${n}`, a = `${toneAttr(TONES.includes(tone) ? tone : "quiet")}${attr("title", title)}${attrs ? ` ${attrs}` : ""}`;
  return localHref(href) ? `<a class="p-chip" href="${esc(href)}"${a}>${inner}</a>` : `<span class="p-chip"${a}>${inner}</span>`;
}

// ---- filterRow({ groups, clear, label, region }) ----
// THE filter row of every list: groups [{ key, label, items: [{ label, value, count, href, current, person }] }] — status,
// area or lane, person, time — each item a LINK (a filter is a read; hrefWith keeps the rest of the address), the current
// one aria-current, its count in mono. An item with a zero count is left out unless it is current (no "0" to read). A
// person item leads with their face. clear: the address with every filter dropped (shown when any filter is set). At phone
// width the first group stays on the row and the others fold into "More" (a <details>: no script needed).
export function filterRow(opts) {
  const { groups = [], clear = "", label = "Filter", region = "filters" } = opts || {};
  const item = (it) => {
    if (!it || (finite(it.count) === 0 && it.count != null && !it.current)) return "";
    const face = it.person ? avatar({ ...it.person, size: 20 }) : "";
    const n = it.count == null || it.count === "" ? "" : `<span class="p-count">${esc(num(it.count))}</span>`;
    return localHref(it.href) ? `<a class="p-fchip" href="${esc(it.href)}"${it.current ? ' aria-current="true"' : ""}${attr("title", it.title)}${it.attrs ? ` ${it.attrs}` : ""}>${face}<span class="p-fchip-w">${esc(it.label)}</span>${n}</a>` : "";
  };
  // g.max: past that many items the rest fold into the group's own "+N" menu (the current one always stays on the row)
  const grp = (g) => {
    const its = (g.items || []).map((it) => [it, item(it)]).filter(([, h]) => h);
    const max = Number(g.max) > 0 ? Number(g.max) : its.length;
    const shown = its.filter(([it], i) => i < max || it.current), rest = its.filter(([it], i) => i >= max && !it.current);
    const extra = rest.length ? `<details class="p-fmore p-fmore-g"><summary class="p-fchip" title="${esc(`${rest.length} more`)}">+${rest.length}</summary><div class="p-fmenu">${rest.map(([, h]) => h).join("")}</div></details>` : "";
    const body = shown.map(([, h]) => h).join("") + extra;
    return body ? `<div class="p-fgroup" role="group"${attr("aria-label", g.label)}${attr("data-filter", g.key)}>${body}</div>` : "";
  };
  const gs = groups.map(grp).filter(Boolean);
  if (!gs.length) return "";
  const anySet = groups.some((g) => (g.items || []).some((it) => it && it.current && !it.all));
  const more = gs.length > 1 ? `<details class="p-fmore"><summary class="p-fchip">More<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg></summary><div class="p-fmenu">${gs.slice(1).join("")}</div></details>` : "";
  return `<nav class="p-filter"${attr("aria-label", label)}${attr("data-region", region)}>${gs.map((g, i) => (i ? `<span class="p-fsep" aria-hidden="true"></span>` : "") + (i ? g.replace('class="p-fgroup"', 'class="p-fgroup p-fextra"') : g)).join("")}${more}${anySet && localHref(clear) ? `<a class="p-fclear" href="${esc(clear)}">Clear</a>` : ""}</nav>`;
}

// ---- group({ title, count, summary, open, body, region, lead, attrs }) ----
// A folded group of lines: the title and its count on the left, a summary on the right (trusted markup: a bar, a segBar, an
// avatarStack, a mono count), open or folded. What is settled is a folded group: one line until asked for.
const CHEV = '<svg class="p-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="m4.5 3 3 3-3 3"/></svg>';
export function group(opts) {
  const { title = "", count = null, summary = "", open = false, body = "", region = "", lead = "", attrs = "", titleAttr = "" } = opts || {};
  const n = count == null || count === "" ? "" : `<span class="p-count">${esc(num(count))}</span>`;
  return `<details class="p-group"${open ? " open" : ""}${attr("data-region", region)}${attrs ? ` ${attrs}` : ""}><summary class="p-group-head">${CHEV}${lead ? `<span class="p-group-lead">${lead}</span>` : ""}<span class="p-group-title"${attr("title", titleAttr || title)}>${esc(title)}</span>${n}${summary ? `<span class="p-group-sum">${summary}</span>` : ""}</summary><div class="p-group-body">${body}</div></details>`;
}

// ---- line({ lead, title, href, sub, meta, action, detail, open, attrs, enter }) and lines(items, { region, attrs }) ----
// THE one-line row (40px): a lead (a chip, a face, a ring, a mark), the title (cut with an ellipsis, the whole of it in
// title=""), a quiet secondary after it, the meta right-aligned in mono, an optional action. With detail (lineDetail) the
// row opens in place (a <details>; a chevron at its end). At phone width the secondary and the meta wrap under the title.
// lead / sub / meta / action / detail are trusted markup; title is text (titleHtml for markup). linkAttrs: trusted hooks on the
// title's link (the button and door a check reads).
export function line(opts) {
  const { lead = "", title = "", titleHtml, href = "", sub = "", meta = "", action = "", detail = "", open = false, attrs = "", enter = false, rowAttrs = "", linkAttrs = "" } = opts || {};
  const t = titleHtml !== undefined ? titleHtml : esc(title);
  const tt = title ? ` title="${esc(title)}"` : "";
  const titleEl = localHref(href) ? `<a href="${esc(href)}"${linkAttrs ? ` ${linkAttrs}` : ""} class="p-line-title"${tt}>${t}</a>` : `<span class="p-line-title"${tt}>${t}</span>`;
  const row = `${lead ? `<span class="p-line-lead">${lead}</span>` : ""}<span class="p-line-main">${titleEl}${sub ? `<span class="p-line-sub">${sub}</span>` : ""}</span>${meta ? `<span class="p-line-meta">${meta}</span>` : ""}${action ? `<span class="p-line-act">${action}</span>` : ""}`;
  const li = `<li class="p-li"${attrs ? ` ${attrs}` : ""}${enter ? " data-enter" : ""}>`;
  if (!detail) return `${li}<div class="p-line"${rowAttrs ? ` ${rowAttrs}` : ""}>${row}</div></li>`;
  return `${li}<details class="p-x"${open ? " open" : ""}><summary class="p-line"${rowAttrs ? ` ${rowAttrs}` : ""}>${row}${CHEV}</summary><div class="p-detail">${detail}</div></details></li>`;
}
// opts.lead: a fixed lead width in px, so titles align when the leads differ (chips of different words)
export const lines = (items, opts = {}) => `<ul class="p-lines${opts.compact ? " p-compact" : ""}"${attr("data-region", opts.region)}${opts.lead ? ` style="--lead:${Number(opts.lead)}px"` : ""}${opts.attrs ? ` ${opts.attrs}` : ""}>${(items || []).join("")}</ul>`;

// lineDetail({ facts, body, actions }) — what an open row shows: a small grid of label + value (facts: [[label, valueHtml]],
// values trusted markup; ids and refs belong here, never on the line), an optional body (a person's own words), and the
// row's actions at its foot.
export function lineDetail(opts) {
  const { facts: f = [], body = "", actions = "" } = opts || {};
  const grid = f.filter(Boolean).length ? `<dl class="p-ld-facts">${f.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : "";
  return `<div class="p-ld">${grid}${body ? `<div class="p-ld-body">${body}</div>` : ""}${actions ? `<div class="p-ld-act">${actions}</div>` : ""}</div>`;
}

// ---- facts(items, { region, cols }) ----
// A detail page's header: a row of label + value cells ([{ label, value, html, title, attrs }], value text or html markup; attrs:
// trusted hooks on the cell, after its title), hairlines
// between, in one card; two a row at phone width.
export function facts(items, opts) {
  const { region = "facts" } = opts || {};
  const list = (items || []).filter(Boolean);
  return `<dl class="p-card p-facts"${attr("data-region", region)} style="--n:${Math.max(1, list.length)}"${list.length % 2 ? " data-odd" : ""}>${list.map((x) => `<div class="p-fact"${attr("title", x.title)}${x.attrs ? ` ${x.attrs}` : ""}><dt>${esc(x.label)}</dt><dd>${x.html !== undefined ? x.html : esc(x.value)}</dd></div>`).join("")}</dl>`;
}

// ---- optionCards({ options, action, name, chosen, disabled, region, label }) ----
// A question's options side by side, each a real POST form whose button rules it: [{ key: "A", label, detail, recommended,
// fields: { name: value }, button }]. One may be marked recommended (an ink edge and the word). chosen: the key that was
// ruled (that card reads "Ruled", the others fade; no form is drawn). disabled: the reader may not rule (the forms stay,
// their buttons disabled, the reason in title=""). The options are the filer's own words.
export function optionCards(opts) {
  const { options = [], action = "", chosen = "", disabled = "", region = "options", label = "Options", button = "data-button=\"rule\"" } = opts || {};
  const one = (o) => {
    const isChosen = chosen && chosen === o.key, faded = chosen && !isChosen;
    const head = `<span class="p-opt-head"><span class="p-opt-key">${esc(o.key)}</span>${o.recommended ? chip("Recommended", { tone: "quiet" }) : ""}${isChosen ? chip("Ruled", { tone: "ok" }) : ""}</span>`;
    const text = `<span class="p-opt-label">${esc(o.label)}</span>${o.detail ? `<span class="p-opt-detail">${esc(o.detail)}</span>` : ""}`;
    const cls = `p-opt${o.recommended ? " p-opt-rec" : ""}${isChosen ? " p-opt-chosen" : ""}${faded ? " p-opt-faded" : ""}`;
    // o.attrs: the option's own hooks (data-option, data-chosen); o.extra: a second press inside the same form (trusted markup)
    const own = o.attrs ? ` ${o.attrs}` : "";
    if (chosen || !localHref(action)) return `<div class="${cls}"${own}>${head}${text}</div>`;
    const hidden = Object.entries(o.fields || {}).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
    return `<form class="${cls}" method="POST" action="${esc(action)}"${own}>${hidden}${head}${text}<span class="p-opt-act"><button class="u-btn small${o.recommended ? " primary" : ""} p-opt-go" type="submit" ${o.buttonAttrs || button}${disabled ? ` disabled title="${esc(disabled)}"` : ""}>${esc(o.button || `Rule ${o.key}`)}</button>${o.extra || ""}</span></form>`;
  };
  return `<div class="p-opts" role="group"${attr("aria-label", label)}${attr("data-region", region)} style="--n:${Math.max(1, Math.min(4, options.length))}">${options.map(one).join("")}</div>`;
}

// ---- empty(text, { action }) ----
// An empty region: a short phrase ("No goals yet") and at most one button ({ href, label } or trusted html). data-state
// "empty" is the hook the checks read.
export function empty(text, opts) {   // opts: { action: {href,label}|{html}, title }
  const a = (opts && opts.action) || null;
  const act = a ? (a.html ? a.html : localHref(a.href) && a.label ? btn(a.label, { href: a.href }) : "") : "";
  const t = opts && opts.title ? ` title="${esc(opts.title)}"` : "";   // a read's own EMPTY sentence (D11) rides here, whole
  return `<div class="p-empty" data-state="empty"${t}><span>${esc(text || "Nothing yet")}</span>${act}</div>`;
}

// ---- pageHead({ title, crumbs, actions, aside }) ----
// The page's head: an optional breadcrumb, the title (28px), at most two actions on the right. NO subtitle sentence: what a
// page is about is its title; how it is going is its glance strip. aside: a small trusted line under the title (chips, a
// face and a name, a date) for a detail page. Keeps ui.js's class "page-head" so placeMeterChip still finds it.
export function pageHead(opts) {
  const { title = "", crumbs = null, actions = [], aside = "", region = "" } = opts || {};
  const acts = (Array.isArray(actions) ? actions : [actions]).filter(Boolean).slice(0, 2);
  return `<header class="page-head p-head"${attr("data-region", region)}>${crumbs && crumbs.length ? breadcrumb(crumbs) : ""}<div class="p-head-row"><h1>${esc(title)}</h1>${acts.length ? `<div class="p-head-act">${acts.join("")}</div>` : ""}</div>${aside ? `<div class="p-head-aside">${aside}</div>` : ""}</header>`;
}

// cols(main, side) — the page's two columns: the main cards and a 320px side column (one column under 1100px)
export const cols = (main, side) => `<div class="p-cols"><div class="p-main">${main}</div>${side ? `<div class="p-side">${side}</div>` : ""}</div>`;
// stack(...cards) — cards one under the other, 16px apart
export const stack = (...xs) => `<div class="p-stack">${xs.flat().filter(Boolean).join("")}</div>`;

// ---- foldKit() — the folds a person keeps (M1, M5): the rail and the panel of the Map's views, a lane of the Arch view, a
// column of the Map's canvas. SELF-CONTAINED (it names nothing outside its own body): the shell embeds it by its own source in
// the head of a Map view (src/shell.js FOLD_BOOT), so the rail and the panel are folded before the first paint, and the Map's
// and the Arch view's scripts use that one copy (window.SGFOLD). Kept in this browser (localStorage) under the key the page
// carries for its person (<html data-folds="sharingu-fold:<person id>">), never in a cookie: the server never reads it.
//   parse(raw) -> { rail, panel, lanes: { project: [id] }, cols: { project: [id] } }; a bad or foreign value reads as nothing
//   read(key) · write(key, s)              the browser's copy (refused storage, a private window: nothing kept, nothing thrown)
//   flip(s, part) -> s'                    the rail or the panel, folded or open
//   alone(s) -> s'                         the canvas alone: both folded, or both open again when both already are
//   shut(s, kind, project, id, on) -> s'   a lane ("lanes") or a column ("cols") of one project, folded or open
//   shutOf(s, kind, project) -> { id: 1 }  what is folded there
//   attr(s) -> "rail panel"                what <html data-fold> says
export function foldKit() {
  var CAP = 40, PROJECTS = 24, LONG = 120;
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function ids(v) {
    var out = [];
    if (!Array.isArray(v)) return out;
    for (var i = 0; i < v.length && out.length < CAP; i++) { var x = v[i]; if (typeof x === "string" && x && x.length <= LONG && out.indexOf(x) < 0) out.push(x); }
    return out;
  }
  function byProject(v) {
    var out = {}, n = 0;
    if (!v || typeof v !== "object" || Array.isArray(v)) return out;
    for (var k in v) { if (!own(v, k) || n >= PROJECTS || k.length > LONG) continue; var l = ids(v[k]); if (l.length) { out[k] = l; n++; } }
    return out;
  }
  function parse(raw) {
    var o = null;
    try { o = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { o = null; }
    if (!o || typeof o !== "object" || Array.isArray(o)) o = {};
    return { rail: o.rail === true, panel: o.panel === true, lanes: byProject(o.lanes), cols: byProject(o.cols) };
  }
  function read(key) { if (!key) return parse(null); try { return parse(localStorage.getItem(key)); } catch (e) { return parse(null); } }
  function write(key, s) { if (!key) return; try { localStorage.setItem(key, JSON.stringify(parse(s))); } catch (e) {} }
  function flip(s, part) { var t = parse(s); if (part === "rail" || part === "panel") t[part] = !t[part]; return t; }
  function alone(s) { var t = parse(s), both = t.rail && t.panel; t.rail = !both; t.panel = !both; return t; }
  function shut(s, kind, project, id, on) {
    var t = parse(s), p = String(project == null ? "" : project), k = String(id == null ? "" : id);
    if ((kind !== "lanes" && kind !== "cols") || !k) return t;
    var l = (own(t[kind], p) ? t[kind][p] : []).filter(function (x) { return x !== k; });
    if (on) l.push(k);
    if (l.length) t[kind][p] = l; else delete t[kind][p];
    return parse(t);
  }
  function shutOf(s, kind, project) {
    var t = parse(s), p = String(project == null ? "" : project), out = {};
    if ((kind === "lanes" || kind === "cols") && own(t[kind], p)) t[kind][p].forEach(function (k) { out[k] = 1; });
    return out;
  }
  function attr(s) { var t = parse(s); return [t.rail ? "rail" : "", t.panel ? "panel" : ""].filter(Boolean).join(" "); }
  return { parse: parse, read: read, write: write, flip: flip, alone: alone, shut: shut, shutOf: shutOf, attr: attr };
}

// foldToggle(part) — the toggle that folds a side of a Map view, "rail" or "panel": an icon button, its pressed look read off
// <html data-fold> (set before the first paint, so the server never needs the person's choice; the shell's script keeps
// aria-pressed true to it). Its title is its label and the key that folds both (FOLD_KEY: the canvas alone).
export const FOLD_KEY = "\\";
const FOLD_ICON = { rail: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/><path class="p-fold-side" d="M5.5 6.5h2v11h-2z"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/><path class="p-fold-side" d="M16.5 6.5h2v11h-2z"/>' };
export function foldToggle(part) {
  const p = part === "rail" ? "rail" : "panel", label = p === "rail" ? "Fold rail" : "Fold panel";
  return `<button type="button" class="p-fold" data-fold-toggle="${p}" data-button="fold-${p}" data-client="folds the ${p}, kept for this person" aria-pressed="false" aria-keyshortcuts="${esc(FOLD_KEY)}" aria-label="${label}" title="${label} · ${esc(FOLD_KEY)} folds both"><svg viewBox="0 0 24 24" aria-hidden="true">${FOLD_ICON[p]}</svg></button>`;
}

// ---- PARTS_CSS: the one stylesheet of these parts (served beside UI_CSS once the pages adopt them) ----
export const PARTS_CSS = `
  .p-stack{display:flex;flex-direction:column;gap:16px;min-width:0}
  .p-cols{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
  .p-main,.p-side{display:flex;flex-direction:column;gap:16px;min-width:0}
  @media (max-width:1100px){.p-cols{grid-template-columns:minmax(0,1fr)}}
  .p-label{display:flex;align-items:center;gap:7px;margin:0;font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint)}
  .p-count{font:500 11.5px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums;letter-spacing:0}
  .p-id{font:400 11.5px/1.4 var(--mono);color:var(--text-muted);overflow-wrap:anywhere}
  .p-dot{flex:none;display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--needs)}
  .p-dot[data-tone="ok"]{background:var(--ok)}
  .p-dot[data-tone="bad"]{background:var(--err)}

  /* card: one region, one job; a hairline edge on the surface, never a card in a card */
  .p-card{min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:12px}
  .p-card-head{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px}
  .p-card-act{margin-left:auto;display:flex;align-items:center;gap:8px;min-width:0}
  .p-card-head>.p-label,.p-card-head>.p-count{flex:none}
  .p-card-act>.p-chip{display:inline-block;line-height:20px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .p-card-act>.p-chip .p-chip-n{margin-left:5px}
  .p-card-act .u-link{font-size:12.5px}
  .p-card-body{padding:0 16px 16px}
  .p-card-head+.p-card-body{padding-top:0}
  .p-flush>.p-card-body{padding:0}
  .p-card-pad{padding:0 16px 16px}
  .p-card-needs .p-label,.p-card-needs>.p-card-head>.p-count{color:var(--needs)}
  .p-card-quiet{background:transparent;border-color:transparent}
  .p-card-quiet>.p-card-head{padding:0;min-height:32px}
  .p-card-quiet>.p-card-body{padding:0}

  /* tiles: the glance strip, hairlines between (the grid's gap shows the line under the tiles) */
  .p-tiles{overflow:hidden}
  .p-tiles-grid{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:1px;background:var(--line)}
  .p-tile{display:flex;flex-direction:column;gap:6px;min-width:0;padding:14px 16px 14px;background:var(--surface);color:var(--text);text-decoration:none;
    transition:background-color var(--dur-fast) var(--ease)}
  a.p-tile:hover{background:var(--hover)}
  .p-tile-label{display:flex;align-items:center;gap:6px;font:500 11px/1.2 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .p-tile-row{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;min-height:34px}
  .p-tile-v{display:flex;align-items:baseline;gap:5px;min-width:0;white-space:nowrap}
  .p-tile-v b{font:700 28px/1 var(--sans);letter-spacing:-.025em;color:var(--text);font-variant-numeric:tabular-nums}
  .p-tile-v small{font:500 13px/1 var(--sans);color:var(--text-muted)}
  .p-tile-v small.p-pct{margin-left:-4px;font-size:15px}
  .p-tile-chart{flex:none;display:flex;align-items:flex-end;padding-bottom:2px}
  .p-tile-chart .p-seg{width:clamp(72px,9vw,128px);padding-bottom:4px}
  .p-tile-sub{font:400 11.5px/1.3 var(--sans);color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}

  /* avatars: a picture, else initials on the presence tone; a stack overlaps on a ring of the surface */
  .p-av{display:inline-grid;place-items:center;flex:none;width:24px;height:24px;border-radius:50%;overflow:hidden;background:var(--well);color:var(--text);
    font:600 9px/1 var(--mono);letter-spacing:0;font-variant-numeric:tabular-nums}
  .p-av[data-size="20"]{width:20px;height:20px;font-size:7.5px;letter-spacing:-.02em}
  .p-av[data-size="32"]{width:32px;height:32px;font-size:11px}
  .p-av img{width:100%;height:100%;object-fit:cover;display:block}
  .p-av[data-tone="gold"]{background:color-mix(in srgb,var(--bv-gold) 26%,var(--surface))}
  .p-av[data-tone="sky"]{background:color-mix(in srgb,var(--bv-sky) 22%,var(--surface))}
  .p-av[data-tone="violet"]{background:color-mix(in srgb,var(--bv-violet) 22%,var(--surface))}
  .p-avs{display:inline-flex;align-items:center;flex:none;padding-left:4px}
  .p-avs .p-av{margin-left:-6px;box-shadow:0 0 0 2px var(--surface)}
  .p-avs[data-size="20"] .p-av{margin-left:-5px}
  .p-av-more{background:var(--well);color:var(--text-muted)}

  /* bar: an ink fill on a quiet track, the value in mono beside it */
  .p-bar{display:inline-flex;align-items:center;gap:8px;width:var(--w,100%);min-width:0;vertical-align:middle}
  .p-bar-track{position:relative;flex:1;min-width:24px;height:6px;border-radius:3px;background:var(--well);overflow:hidden}
  .p-bar-track>i{position:absolute;inset:0;border-radius:inherit;background:var(--text);transform:scaleX(var(--p,0));transform-origin:left center}
  .p-bar-track[data-tone="ok"]>i{background:var(--ok)}
  .p-bar-track[data-tone="warn"]>i{background:var(--needs)}
  .p-bar-track[data-tone="bad"]>i{background:var(--err)}
  .p-bar-v{flex:none;min-width:34px;text-align:right;font:500 11.5px/1 var(--sans);color:var(--text-muted);font-variant-numeric:tabular-nums}

  /* segBar: done · in progress · not started (or statuses), a 2px seam between, one legend line */
  .p-seg{display:flex;flex-direction:column;gap:8px;min-width:0;width:100%}
  .p-seg-bar{display:flex;gap:2px;height:var(--h,8px)}
  .p-seg-bar>i{min-width:3px;border-radius:2px}
  [data-seg="done"]{background:var(--text)}
  [data-seg="progress"]{background:color-mix(in srgb,var(--text) 38%,var(--surface))}
  [data-seg="todo"]{background:var(--well)}
  [data-seg="ok"]{background:var(--ok)}
  [data-seg="warn"]{background:var(--needs)}
  [data-seg="bad"]{background:var(--err)}
  .p-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font:400 11.5px/1.3 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
  .p-legend>span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
  .p-legend b{font-weight:500;color:var(--text-muted)}
  .p-legend i{display:inline-block;width:8px;height:8px;border-radius:2px}
  .p-legend i[data-seg="todo"]{box-shadow:inset 0 0 0 1px var(--line-strong)}

  /* miniBars and sparkline: ink, small, no axis */
  .p-mb,.p-spark{display:inline-flex;flex-direction:column;gap:3px;vertical-align:middle;line-height:0}
  .p-mb svg,.p-spark svg{display:block;overflow:visible}
  .p-mb-a{fill:color-mix(in srgb,var(--text) 72%,var(--surface))}
  .p-mb-now{fill:var(--text)}
  .p-mb-b{fill:color-mix(in srgb,var(--text) 30%,var(--surface))}
  .p-mb-zero{fill:var(--line-strong)}
  .p-mb-labels{display:grid;grid-template-columns:repeat(var(--n),1fr);font:400 9.5px/1 var(--mono);color:var(--text-faint);text-align:center;text-transform:uppercase}
  .p-spark-line{fill:none;stroke:var(--text);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
  .p-spark-area{fill:color-mix(in srgb,var(--text) 7%,transparent);stroke:none}
  .p-spark-end{fill:var(--text)}

  /* ring: a count of a target */
  .p-ring{position:relative;display:inline-grid;place-items:center;flex:none;vertical-align:middle;line-height:0}
  .p-ring svg{display:block}
  .p-ring-track{fill:none;stroke:var(--well)}
  .p-ring-arc{fill:none;stroke:var(--text);stroke-linecap:round}
  .p-ring[data-tone="ok"] .p-ring-arc{stroke:var(--ok)}
  .p-ring[data-tone="warn"] .p-ring-arc{stroke:var(--needs)}
  .p-ring[data-tone="bad"] .p-ring-arc{stroke:var(--err)}
  .p-ring>b{position:absolute;inset:0;display:grid;place-items:center;font:600 10.5px/1 var(--sans);color:var(--text);font-variant-numeric:tabular-nums}
  .p-ring[data-size="44"]>b{font-size:12px}

  /* chip: a status word */
  .p-chip{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:5px;background:var(--well);color:var(--text-muted);
    font:500 11.5px/1 var(--sans);white-space:nowrap;vertical-align:middle;text-decoration:none}
  .p-chip-n{font:500 11px/1 var(--sans);color:inherit;opacity:.8;font-variant-numeric:tabular-nums}
  .p-chip[data-tone="ok"]{background:var(--ok-tint);color:var(--ok)}
  .p-chip[data-tone="warn"]{background:var(--needs-tint);color:var(--needs)}
  .p-chip[data-tone="bad"]{background:var(--err-tint);color:var(--err)}
  .p-chip[data-tone="accent"]{background:var(--accent-tint);color:var(--accent-text)}
  a.p-chip:hover{box-shadow:inset 0 0 0 1px var(--line-strong)}

  /* filter row: chips that are links, groups apart, "More" at phone width */
  .p-filter{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
  .p-fgroup{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
  .p-fsep{width:1px;height:18px;margin:0 4px;background:var(--line)}
  .p-fchip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:7px;border:1px solid transparent;background:transparent;
    color:var(--text-muted);font:500 12.5px/1 var(--sans);white-space:nowrap;cursor:pointer;list-style:none;text-decoration:none;
    transition:background-color var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease)}
  .p-fchip::-webkit-details-marker{display:none}
  .p-fchip:hover{background:var(--hover);color:var(--text)}
  .p-fchip[aria-current="true"]{background:var(--surface);border-color:var(--line-strong);color:var(--text)}
  .p-fchip .p-av{margin-left:-4px}
  .p-fchip svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
  .p-fmore{position:relative;display:none}
  .p-fmore-g{display:block}
  .p-fmore-g .p-fmenu{flex-direction:column;align-items:stretch;gap:2px;min-width:180px}
  .p-fmenu{position:absolute;left:0;top:calc(100% + 6px);z-index:30;display:flex;flex-direction:column;gap:8px;min-width:220px;max-width:calc(100vw - 32px);padding:8px;
    background:var(--surface);border:1px solid var(--line-strong);border-radius:10px;box-shadow:var(--shadow-pop)}
  .p-fmenu .p-fgroup+.p-fgroup{padding-top:8px;border-top:1px solid var(--line)}
  .p-fclear{margin-left:4px;font:500 12.5px/1 var(--sans);color:var(--text-faint);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
  .p-fclear:hover{color:var(--text)}

  /* group: a folded run of lines */
  .p-group{border-top:1px solid var(--line)}
  .p-group:first-child{border-top:0}
  .p-group-head{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 16px;cursor:pointer;list-style:none;user-select:none;
    transition:background-color var(--dur-fast) var(--ease)}
  .p-group-head::-webkit-details-marker{display:none}
  .p-group-head:hover{background:var(--hover)}
  .p-group-head:focus-visible,.p-line:focus-visible{outline-offset:-2px}
  .p-chev{flex:none;width:12px;height:12px;fill:none;stroke:var(--text-faint);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;transition:transform var(--dur-fast) var(--ease)}
  details[open]>summary>.p-chev{transform:rotate(90deg)}
  .p-group-lead{flex:none;display:inline-flex}
  .p-group-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 13px/1.3 var(--sans);color:var(--text)}
  .p-group-sum{margin-left:auto;display:flex;align-items:center;gap:12px;flex:none;font:400 11.5px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
  .p-group-sum .p-bar{width:120px}
  .p-group-sum .p-seg{width:140px}
  .p-group-body .p-lines>.p-li:first-child{border-top:1px solid var(--line)}
  .p-group-body .p-line{padding-left:36px}

  /* line: THE one-line row */
  .p-lines{list-style:none;margin:0;padding:0}
  .p-li{border-top:1px solid var(--line)}
  .p-card-head+.p-card-body>.p-lines>.p-li:first-child,.p-card-head+.p-card-body>.p-group:first-child{border-top:1px solid var(--line)}
  .p-line{display:flex;align-items:center;gap:12px;min-height:40px;padding:6px 16px;list-style:none;transition:background-color var(--dur-fast) var(--ease)}
  .p-line::-webkit-details-marker{display:none}
  summary.p-line{cursor:pointer}
  .p-line:hover{background:var(--hover)}
  .p-line-lead{flex:none;display:inline-flex;align-items:center;min-width:20px;width:var(--lead,auto)}
  .p-line-main{flex:1;display:flex;align-items:baseline;gap:10px;min-width:0}
  .p-line-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 13.5px/1.4 var(--sans);color:var(--text)}
  a.p-line-title:hover{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
  .p-line-sub{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:400 12.5px/1.4 var(--sans);color:var(--text-faint)}
  .p-line-meta{flex:none;display:flex;align-items:center;gap:10px;font:400 11.5px/1 var(--sans);color:var(--text-faint);white-space:nowrap;font-variant-numeric:tabular-nums}
  .p-line-meta .p-bar{width:96px}
  .p-line-act{flex:none;display:flex;align-items:center;gap:6px}
  .p-line-act form{margin:0}
  .p-x>summary>.p-chev{margin-left:-2px}
  .p-x[open]>summary{background:var(--hover)}
  .p-detail{padding:4px 16px 14px 48px;background:var(--hover)}
  .p-compact .p-line{min-height:34px;padding-top:4px;padding-bottom:4px}
  .p-ld{display:flex;flex-direction:column;gap:10px}
  .p-ld-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 20px;margin:0}
  .p-ld-facts>div{min-width:0}
  .p-ld-facts dt{font:500 10.5px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint)}
  .p-ld-facts dd{margin:2px 0 0;font:500 13px/1.4 var(--sans);color:var(--text);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
  .p-ld-facts dd .p-av{vertical-align:-6px;margin-right:6px}
  .p-ld-body{font:400 13.5px/1.55 var(--sans);color:var(--text);max-width:72ch}
  .p-ld-body p{margin:0 0 6px}
  .p-ld-act{display:flex;flex-wrap:wrap;gap:8px}

  /* facts: a detail page's header cells */
  .p-facts{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:1px;margin:0;background:var(--line);overflow:hidden}
  .p-fact{min-width:0;padding:12px 16px;background:var(--surface)}
  .p-fact dt{font:500 11px/1.2 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .p-fact dd{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;min-height:24px;margin:6px 0 0;font:600 14px/1.3 var(--sans);color:var(--text);font-variant-numeric:tabular-nums;
    overflow-wrap:anywhere}

  /* option cards: a question's options, each a form */
  .p-opts{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:12px}
  .p-opt{display:flex;flex-direction:column;gap:8px;min-width:0;margin:0;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
  .p-opt-rec{border-color:var(--text)}
  .p-opt-chosen{border-color:var(--ok)}
  .p-opt-faded{opacity:.55}
  .p-opt-head{display:flex;align-items:center;gap:8px;min-height:20px}
  .p-opt-key{font:600 12px/1 var(--mono);color:var(--text-muted)}
  .p-opt-label{font:600 14px/1.4 var(--sans);color:var(--text);overflow-wrap:anywhere}
  .p-opt-detail{font:400 13px/1.5 var(--sans);color:var(--text-muted);overflow-wrap:anywhere}
  .p-opt-act{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;margin-top:auto}
  .p-opt-go{align-self:flex-start}

  /* empty: a phrase and at most one button */
  .p-empty{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px;padding:8px 0;font:400 13px/1.4 var(--sans);color:var(--text-faint)}
  .p-flush .p-empty{padding:8px 16px}
  .p-card-head+.p-card-body>.p-empty{border-top:1px solid var(--line)}
  .p-flush>.p-card-head+.p-card-body>.p-empty{border-top:1px solid var(--line)}

  /* words: a person's own (a why, a reason, a body), and where they were recorded */
  .p-words{font:400 14px/1.6 var(--sans);color:var(--text);max-width:72ch;overflow-wrap:anywhere}
  .p-words>p{margin:0 0 10px}
  .p-words>p:last-child{margin-bottom:0}
  .p-words .p-src{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:12px 0 0;font:400 12.5px/1.4 var(--sans);color:var(--text-faint)}
  .p-words .p-src code{font:400 11.5px/1.4 var(--mono)}
  .p-fact dd .u-link{font:inherit;color:inherit;text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
  .p-fact dd code{font:500 12px/1.3 var(--mono);color:var(--text-muted)}

  /* markdown in a card (a doc, a card's body): the author's words in reading type */
  .p-md{max-width:76ch}
  .p-md .pk-md{font:400 14px/1.65 var(--sans);color:var(--text)}
  .p-md .pk-md>:first-child{margin-top:0}
  .p-md .pk-md h1{font:700 18px/1.35 var(--sans);margin:18px 0 8px}
  .p-md .pk-md h2{font:700 15.5px/1.4 var(--sans);margin:18px 0 6px}
  .p-md .pk-md h3{font:600 14px/1.4 var(--sans);margin:14px 0 4px}
  .p-md .pk-md p{margin:0 0 10px}
  .p-md .pk-md ul,.p-md .pk-md ol{margin:0 0 10px;padding-left:20px}
  .p-md .pk-md code{font:400 12.5px/1.4 var(--mono);background:var(--well);border-radius:4px;padding:0 4px}
  .p-md .pk-md table{border-collapse:collapse;font-size:13px;display:block;overflow-x:auto;max-width:100%}
  .p-md .pk-md td,.p-md .pk-md th{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}

  /* page head: crumbs, the title, two actions at most */
  .p-head{margin:0 0 20px}
  .p-head .u-crumbs ol{margin:0 0 8px;font-size:12.5px}
  .p-head-row{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap}
  .p-head-row h1{flex:1 1 320px;min-width:0}
  .p-head-act{display:flex;gap:8px;align-items:center}
  .p-head-aside{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:10px;font:400 12.5px/1.3 var(--sans);color:var(--text-muted)}

  /* motion: the shell's data-progress hook fills a bar from 0 on first view (final state without script) */
  .u-motion [data-progress]:not(.u-seen)>i{transform:scaleX(0)}
  .u-motion:not(.u-js) [data-progress]:not(.u-seen)>i{transform:scaleX(var(--p,0));animation:u-fill-late 1ms 2.4s backwards}
  .u-motion [data-progress].u-seen>i{animation:u-fill-in 260ms var(--ease) backwards}

  /* phone: two tiles a row, a line's secondary and meta under its title, the filter's extra groups under More */
  @media (max-width:600px){
    .p-tiles-grid,.p-facts{grid-template-columns:repeat(2,minmax(0,1fr))}
    .p-tiles-grid[data-odd]>.p-tile:last-child,.p-facts[data-odd]>.p-fact:last-child{grid-column:span 2}
    .p-tile{padding:12px 14px}
    .p-tile-v b{font-size:24px}
    .p-tile-sub{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.35}
    /* a line becomes a small grid: the lead on the left, the title (two lines at most) and under it the secondary and the
       meta, the action and the chevron on the right; a compact list keeps one line */
    .p-lines:not(.p-compact) .p-line{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;column-gap:12px;row-gap:4px;align-items:start;padding-top:9px;padding-bottom:9px}
    .p-lines:not(.p-compact) .p-line-lead{grid-column:1;grid-row:1/span 2;padding-top:1px;width:auto}
    .p-lines:not(.p-compact) .p-line-main{grid-column:2;grid-row:1;flex-direction:column;align-items:stretch;gap:2px}
    .p-lines:not(.p-compact) .p-line-main:first-child,.p-lines:not(.p-compact) .p-line-main:first-child~.p-line-meta{grid-column:1/3}
    .p-lines:not(.p-compact) .p-line-meta{grid-column:2;grid-row:2}
    .p-lines:not(.p-compact) .p-line-act{grid-column:3;grid-row:1/span 2;align-self:center}
    .p-lines:not(.p-compact) .p-line>.p-chev{grid-column:4;grid-row:1/span 2;align-self:center}
    .p-lines:not(.p-compact) .p-line-title{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .p-lines:not(.p-compact) .p-line-sub{flex:none;white-space:nowrap}
    .p-detail{padding-left:16px}
    .p-group-body .p-line{padding-left:16px}
    .p-group-sum .p-bar,.p-group-sum .p-seg{display:none}
    /* L4: a group's summary keeps its words whole (a chip, a link, a count never cut to "Don" or "Op"); the title gives way */
    .p-group-sum{flex:none;max-width:60%;gap:8px}
    .p-group-sum>.p-chip,.p-group-sum>a,.p-group-sum>b{flex:none}
    .p-group-sum>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .p-fextra,.p-fsep{display:none}
    .p-fmore{display:block}
    .p-fmore .p-fextra{display:flex}
    .p-opts{grid-template-columns:minmax(0,1fr)}
    .p-card-head{padding:0 14px}
    .p-card-body{padding:0 14px 14px}
  }
  /* foldToggle: an icon button on the Map's toolbar; pressed (the side folded) it fills the side it folds. Under 860px the
     rail is already a bar, so only the panel's toggle shows */
  .p-fold{flex:none;display:inline-grid;place-items:center;width:28px;height:26px;padding:0;border:1px solid transparent;border-radius:7px;background:none;color:var(--text-faint);cursor:pointer;
    transition:background-color var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease)}
  .p-fold svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .p-fold .p-fold-side{fill:currentColor;stroke:none;opacity:0}
  .p-fold:hover{background:var(--hover);color:var(--text)}
  html[data-fold~="rail"] .p-fold[data-fold-toggle="rail"],html[data-fold~="panel"] .p-fold[data-fold-toggle="panel"]{background:var(--well);border-color:var(--line);color:var(--text)}
  html[data-fold~="rail"] .p-fold[data-fold-toggle="rail"] .p-fold-side,html[data-fold~="panel"] .p-fold[data-fold-toggle="panel"] .p-fold-side{opacity:1}
  @media (max-width:860px){.p-fold[data-fold-toggle="rail"]{display:none}}
`;
