// rt.js — the executable rt-v1.1 scaffold (Pass A / shared-vocabulary de-dup).
//
// 01_META/report-template.md (the brain, READ-ONLY from here) names eight fixed sections
// for every transmission report, sender- or R-generated alike: Header · Verdict banner ·
// Envelope · Impact · Honest gaps & questions · Stamps & approvals · Event trail · Footer.
// Before this file, that standard existed only as prose plus two independent, drifting
// implementations: src/report.js (the standalone batch artifact, own brand/CSS) and
// src/txpage.js (the shell-embedded single-row page, shell tokens) — each with its own copy
// of the CSS, the ROUTE table, and the decision-stamp markup, and txpage.js was MISSING two
// of the eight sections outright (Honest gaps & questions, Event trail — measured drift).
//
// This file is the ONE executable source: RT_SECTIONS names the eight sections in order
// (so a caller builds a heading from data, never retypes template prose); RT_CSS is the
// standalone brand block, lifted verbatim from report.js — this becomes the one copy, and
// report.js now imports it instead of holding its own; and a handful of small, parameterized
// renderers hold the markup both consumers can share — each takes a class-prefix / class-fn
// hook so a consumer's OWN CSS still governs the pixels: nothing here hardcodes report.js's
// palette-driven inline styles or txpage.js's shell-token classes as the only way to render.
//
// Public API:
//   RT_SECTIONS, sectionHeading(key)
//   RT_CSS
//   ROUTE, renderVerdictBanner(row, opts)
//   STAMP_KIND, renderStampsSection(items, opts)
//   renderGapsSection(items, opts)               — Honest gaps & questions, incl. the
//                                                    explicit-"None" rule for an empty list.
//   TRAIL_TONE_CLASS, renderEventTrail(items, opts)
//   FOOTER_PROVENANCE
//
// esc() now comes from src/ui.js (Pass B de-dup) — was a local copy here, byte-identical
// to what became the shared superset.

import { esc } from "./ui.js";
import { BRAND_TOKENS_CSS, BRAND_MOTION_CSS } from "./shell.js";

// The eight sections, in fixed order (report-template.md "The eight sections, in fixed
// order"). `heading` is the literal h2 text a section renders when it carries one of its
// own — Header/Verdict banner/Footer don't get a standalone heading in either consumer's
// layout (they open/close the report), so their heading is null; a caller asks for it via
// sectionHeading(key) rather than retyping the template's prose.
export const RT_SECTIONS = [
  { key: "header", label: "Header", heading: null },
  { key: "verdict", label: "Verdict banner", heading: null },
  { key: "envelope", label: "What · why · what it touches", heading: "What · why · what it touches" },
  { key: "impact", label: "Impact", heading: "Impact" },
  { key: "gaps", label: "Honest gaps & questions", heading: "Honest gaps & questions" },
  { key: "stamps", label: "Stamps & approvals", heading: "Stamps & approvals" },
  { key: "trail", label: "Event trail", heading: "Event trail" },
  { key: "footer", label: "Footer", heading: null },
];

export function sectionHeading(key) {
  const s = RT_SECTIONS.find((x) => x.key === key);
  return s ? s.heading : null;
}

// RT_CSS: the standalone report's stylesheet (report.js renderReportShell; the batch report is a banked
// document and stays outside shell()). UI-B1b: it carries the SAME Brand v2 token block as shell()
// (BRAND_TOKENS_CSS, imported: one copy, no second skin), the Ink world only (Q2427FA26: no light/dark
// switch), and its own short names as ALIASES onto the tokens. --stamp keeps its name and maps onto
// verified-ink, as shell.js maps it (the ruling stamp is binding). The faces are Manrope + JetBrains Mono.
export const RT_CSS = `:root{${BRAND_TOKENS_CSS}}
:root{--paper:var(--bv-dark);--surface:var(--bv-dark-2);--ink:var(--bv-dark-text);--ink2:var(--bv-dark-text-2);--ink3:var(--bv-dark-text-2);--line:var(--bv-dark-3);
--accent:var(--bv-orange);--good:var(--bv-verified-ink);--goodbg:var(--bv-verified-well);--warn:var(--bv-needs-ink);--warnbg:var(--bv-needs-well);--bad:var(--bv-error-ink);--badbg:var(--bv-error-well);
--stamp:var(--bv-verified-ink);--stampbg:var(--bv-verified-well)}
${BRAND_MOTION_CSS}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.65 var(--sans);-webkit-font-smoothing:antialiased;padding:32px 18px 60px}
.wrap{max-width:760px;margin:0 auto}
h1,h2{font-family:var(--sans);font-weight:700;text-wrap:balance}
h1{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:.2rem 0 0}h2{font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink3);margin:1.6rem 0 .6rem;font-weight:600}
.mono{font-family:var(--mono)}
.eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3)}
.lede{font-size:13.5px;color:var(--ink2);margin:.6rem 0 0;max-width:64ch}
.batch-meta{font-family:var(--mono);font-size:11.5px;color:var(--ink3);margin:.5rem 0 0}
section.txn{border-top:1px solid var(--line);margin-top:2.2rem;padding-top:1.6rem}
.ref{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-family:var(--mono);font-size:11px;border:1px solid var(--line);border-radius:6px;padding:3px 9px;color:var(--ink2);background:var(--surface)}
.link{font-family:var(--mono);font-size:11px;color:var(--accent);text-decoration:none}
.thanks{font-size:14.5px;margin:.8rem 0 1rem}
.banner{border-radius:12px;padding:12px 16px;margin:12px 0;display:flex;gap:12px;align-items:flex-start}
.banner .big{font-family:var(--sans);font-weight:700;font-size:14.5px}
.banner p{margin:.2rem 0 0;font-size:13px}
.b-good{background:var(--goodbg);color:var(--good)}.b-warn{background:var(--warnbg);color:var(--warn)}.b-bad{background:var(--badbg);color:var(--bad)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.row{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px;align-items:baseline}
.row:last-child{border-bottom:0}
.row .k{font-family:var(--mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);min-width:84px;flex:none}
.row .v{flex:1;word-break:break-word}
.gapwrap{margin-top:.6rem}
.gapchip{font-family:var(--mono);font-size:10.5px;border:1px solid var(--warn);color:var(--warn);border-radius:6px;padding:2px 8px;margin:0 6px 6px 0;display:inline-block}
.gapnote{font-size:12.5px;color:var(--ink2);margin-top:.3rem}
.decision{display:flex;gap:10px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 13px;margin-top:.6rem}
.decision .ic{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:12px;flex:none}
.decision .st{font-weight:600;font-size:13px}.decision .sd{font-size:11.5px;color:var(--ink2)}
.trail{font-family:var(--mono);font-size:11.5px;color:var(--ink2);margin-top:.7rem;display:flex;flex-wrap:wrap;gap:4px 0}
.trail .tr{display:inline-flex;gap:4px}
.trail .tr:not(:first-child):before{content:"\\2192";margin-right:4px;color:var(--ink3)}
.trail .tr-good{color:var(--good)}.trail .tr-warn{color:var(--warn)}.trail .tr-bad{color:var(--bad)}.trail .tr-stamp{color:var(--stamp)}
.foot{margin-top:2.4rem;padding-top:1rem;border-top:1px solid var(--line);font-family:var(--mono);font-size:11px;color:var(--ink3);line-height:1.7}
.num{font-variant-numeric:tabular-nums}`;

// route -> { tone, label, why } (report-template.md §2, "the route, first"). tone is one
// of good/warn/bad; a caller derives its own CSS class from tone (opts.toneClass below) so
// this table carries meaning, never a specific consumer's class name.
export const ROUTE = {
  auto: { tone: "good", label: "Filed", why: "Complete, maps cleanly to canon, no conflict flagged." },
  owner: { tone: "warn", label: "With the owner", why: "Complete, but touches ruled truth, money, a risk surface, or a suspect join key — waits on one decide." },
  incomplete: { tone: "bad", label: "Needs one more thing", why: "The three lines (what · why · what it touches) were incomplete at the door — landed anyway (sharingu never blocks), but carries no binding grade until re-filed." },
};

// renderVerdictBanner(row, opts) — section 2, the verdict banner: route -> color + one
// line of why. opts lets each consumer keep its own class names (report.js: banner/b-good/
// big; txpage.js: tx-banner/tx-b-good/tx-b-big) while the route table and the copy live here
// once.
export function renderVerdictBanner(row, opts) {
  const o = opts || {};
  const r = ROUTE[row && row.route] || ROUTE.incomplete;
  const bannerClass = o.bannerClass || "banner";
  const toneClass = (o.toneClass || ((t) => `b-${t}`))(r.tone);
  const bigClass = o.bigClass || "big";
  return `<div class="${bannerClass} ${toneClass}"><div><div class="${bigClass}">${esc(r.label)}</div><p>${esc(r.why)}</p></div></div>`;
}

// STAMP_KIND — section 6, Stamps & approvals: approve/reject/needs-work are the decide-bar
// verdicts both consumers already render as a single stamp entry; ruling/question are named
// here too (report-template.md's stamped-ruling § and open-question ? cases) so a future
// caller with real ruling/question data has the vocabulary ready — unused by either consumer
// this pass.
export const STAMP_KIND = {
  approve: { tone: "good", ic: "✓", label: "Approved" },
  reject: { tone: "bad", ic: "✗", label: "Rejected" },
  "needs-work": { tone: "warn", ic: "!", label: "Needs work" },
  ruling: { tone: "stamp", ic: "§", label: "Stamped ruling" },
  question: { tone: "warn", ic: "?", label: "Open question" },
};

// renderStampsSection(items, opts) — items: [{ kind, label?, detail }]. kind picks the
// icon/tone from STAMP_KIND; an unknown kind falls back to opts.fallback (each consumer had
// its own prior default: report.js's decisionBlock defaulted an unrecognized decision to
// good/•, txpage.js's defaulted to a faint/grey •, so the fallback is a hook, not baked in).
// opts.icStyle(tone) -> inline style string (report.js's var(--<tone>bg)/var(--<tone>)
// palette) OR opts.icToneClass(tone) -> a class name (txpage.js's tx-g-<tone> shell-token
// classes) — a consumer uses whichever matches how its own CSS expresses color.
export function renderStampsSection(items, opts) {
  const list_ = Array.isArray(items) ? items : [];
  if (!list_.length) return "";
  const o = opts || {};
  const wrapClass = o.wrapClass || "decision";
  const icClass = o.icClass || "ic";
  const titleClass = o.titleClass || "st";
  const detailClass = o.detailClass || "sd";
  const fallback = o.fallback || { tone: "good", ic: "•" };
  return list_.map((it) => {
    const base = STAMP_KIND[it.kind];
    const tone = base ? base.tone : fallback.tone;
    const ic = base ? base.ic : fallback.ic;
    const label = it.label ?? (base ? base.label : it.kind);
    const icStyleAttr = o.icStyle ? ` style="${o.icStyle(tone)}"` : "";
    const icToneCls = o.icToneClass ? ` ${o.icToneClass(tone)}` : "";
    return `<div class="${wrapClass}"><div class="${icClass}${icToneCls}"${icStyleAttr}>${ic}</div><div><div class="${titleClass}">${esc(label)}</div><div class="${detailClass}">${esc(it.detail || "")}</div></div></div>`;
  }).join("");
}

// renderImpactMeta(meta, opts) — rt-v1.2 (ADR-095, ruled 2026-08-31): the three
// mandatory impact fields that deepen section 4. meta is { eagleDelta?, harmony?,
// audience? }, each a plain string R computes at report time:
//   eagleDelta — how much this data moves the canvas (refs closed/opened, axes before→after)
//   harmony    — what existing truth it touches: aligns · deepens · OVERRIDES (+ refs/ADRs);
//                override is what triggers the one-review route (ADR-095 §1)
//   audience   — which user types / business segments it affects, tied to the goal
// Returns "" when meta is absent entirely (a pre-v1.2 report stays valid v1.1); a
// present-but-partial meta renders honest "—" for the missing fields — a v1.2 report
// that hides an override is the drift class the template names. The cross-segment
// VISUALISATION of these fields is a post-Vasu track; these are the textual fields.
export function renderImpactMeta(meta, opts) {
  if (!meta || typeof meta !== "object") return "";
  const o = opts || {};
  const wrapClass = o.wrapClass || "impact-meta";
  const rowClass = o.rowClass || "im-row";
  const keyClass = o.keyClass || "im-k";
  const valClass = o.valClass || "im-v";
  const rows = [
    ["Map delta", meta.eagleDelta],
    ["Harmony depth", meta.harmony],
    ["Audience spread", meta.audience],
  ].map(([k, v]) => `<div class="${rowClass}"><div class="${keyClass}">${esc(k)}</div><div class="${valClass}">${esc(v || "—")}</div></div>`);
  return `<div class="${wrapClass}">${rows.join("")}</div>`;
}

// renderGapsSection(items, opts) — section 5, Honest gaps & questions: items are
// { title, detail?, action?, critical? }. "Gaps are first-class" (report-template.md
// Rules) — an empty section that should not be empty is exactly the drift class this
// template exists to catch, so the explicit-"None" rule lives HERE, in the shared
// renderer, not left to each consumer to remember.
export function renderGapsSection(items, opts) {
  const o = opts || {};
  const list_ = Array.isArray(items) ? items : [];
  const noneClass = o.noneClass || "gapnote";
  if (!list_.length) return `<div class="${noneClass}">None.</div>`;
  const wrapClass = o.wrapClass || "gap";
  const critClass = o.critClass || "crit";
  const titleClass = o.titleClass || "gt";
  const detailClass = o.detailClass || "gd";
  const actionClass = o.actionClass || "act";
  return list_.map((g) => {
    const cls = g.critical ? `${wrapClass} ${critClass}` : wrapClass;
    const actionAttr = o.actionStyle ? ` style="${o.actionStyle(g)}"` : "";
    const detail = g.detail ? `<div class="${detailClass}">${esc(g.detail)}</div>` : "";
    const action = g.action ? `<span class="${actionClass}"${actionAttr}>${esc(g.action)}</span>` : "";
    return `<div class="${cls}"><div class="${titleClass}">${esc(g.title)}</div>${detail}${action}</div>`;
  }).join("");
}

// TRAIL_TONE_CLASS — the four semantic tones of section 7, Event trail (report-template.md
// §7 + the color Rule: green=auto-sync · purple("s"tamp)=sync+stamp · amber("w"arn)=
// owner-queue · red("b"ad)=recorded-not-binding).
export const TRAIL_TONE_CLASS = { g: "good", s: "stamp", w: "warn", b: "bad" };

// renderEventTrail(items, opts) — items: [{ tone: g|s|w|b, time, text }]. Minimal markup —
// one element per item, tone as a class suffix — so each consumer's own CSS decides the
// layout (report.js: a single arrow-joined mono line; txpage.js: a dotted vertical
// timeline) without this file picking one look for both.
export function renderEventTrail(items, opts) {
  const list_ = Array.isArray(items) ? items : [];
  if (!list_.length) return "";
  const o = opts || {};
  const wrapClass = o.wrapClass || "trail";
  const itemClass = o.itemClass || "tr";
  const timeClass = o.timeClass || "tt";
  const textClass = o.textClass || "tx";
  const toneClassFn = o.toneClassFn || ((tone) => TRAIL_TONE_CLASS[tone] || "faint");
  const rows = list_.map((it) => {
    const toneCls = `${itemClass}-${toneClassFn(it.tone)}`;
    return `<div class="${itemClass} ${toneCls}"><span class="${timeClass} num">${esc(it.time)}</span><span class="${itemClass}-${textClass}">${esc(it.text)}</span></div>`;
  }).join("");
  return `<div class="${wrapClass}">${rows}</div>`;
}

// FOOTER_PROVENANCE — section 8's closing line, verbatim from report-template.md §8:
// "one source: the transmission row + ledger · template rt-v1.1". Both consumers carried
// their own close paraphrase before this pass (report.js said "...ledger...", txpage.js
// said "...row..." — neither matched the template exactly); a caller appends its own extra
// provenance (generated-by, ADR id, a ref line) after this constant.
export const FOOTER_PROVENANCE = "one source: the contribution row + ledger · template rt-v1.1";
