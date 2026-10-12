// src/previewtext.js — the preview and the receipt as a TERMINAL block (sprint 3, B2; docs/plan/MCP.md §4 "How the person
// sees it"): a fixed-width render a CLI client (Claude Code, Codex) shows verbatim. Plain ASCII only (no box drawing, no
// colour codes, "..." for a cut), at most WIDTH columns; its plain part stays near 30 lines however many items there
// are, and every item a person must see is listed with its reason however long that makes it (up to MUST_LIST_MAX). Pure: it reads
// the preview's own answer (src/preview.js) and nothing else; tools/preview-selftest.mjs holds its widths, its cuts, its
// grouping and that every item the person must see (needs, refused, waits for the owner) is shown.
//
//   sharingu  <org> / <project>              Preview, nothing filed yet
//   ----------------------------------------------------------------------
//    1  contribution  New pricing tiers (P...  Build     files at once
//    2  question      Annual discount: 15...   Decisions waits for the owner
//    -  left out      10 messages with no fact or decision
//   ----------------------------------------------------------------------
//    reaches  1 screen, 1 flow, 2 doors, 1 goal; 5 graded checks in question
//    open     <url>
//    file     file {previewId: "<id>"} with the same items
export const WIDTH = 72;
export const GROUP_AT = 12;          // more items than this: the plain ones are grouped by (kind, verdict, effect)
export const MUST_LIST_MAX = 40;     // must-show items listed one by one, each with its reason; past it, "and N more on the page"
const COL = { idx: 3, kind: 12, line: 22, tab: 9, effect: 19 };   // "  1" + "  " + kind + "  " + line + "  " + tab + " " + effect = 72
export const MUST_SHOW = ["needs", "refused", "waits_for_owner"];
const TAB_WORD = { home: "Home", build: "Build", gtm: "GTM", goals: "Goals", decisions: "Decisions", map: "Map", broadcast: "Broadcast", control: "Control" };
const REASON_INDENT = 7;             // a must-show row's reason sits under its kind column

// ascii(v) -> v as one-column text: the common typographic marks mapped to ASCII, any other one-column character kept
const MAP = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " ", "·": "-", "→": "->" };
// D1b item 14: a character a terminal draws one column wide is kept as it is ("§0" stays "§0", "café" stays "café"); only a
// control character, a combining mark left alone, or a wide one (CJK, emoji: two columns would break the 72) becomes "?"
const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|[\ud800-\udbff][\udc00-\udfff]/g;
export function ascii(v) {
  return String(v ?? "").replace(/[‘’“”–—… ·→]/g, (c) => MAP[c]).normalize("NFC")
    .replace(/\s+/g, " ").replace(WIDE, "?").replace(/[\u0000-\u001f\u007f-\u009f\u0300-\u036f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, "?").trim();
}
// cut(v, n) -> at most n columns: a longer text ends in "..."
export function cut(v, n) {
  const s = ascii(v);
  if (n <= 0) return "";
  if (s.length <= n) return s;
  return n <= 3 ? s.slice(0, n) : s.slice(0, n - 3).replace(/[\s,;:.]+$/, "") + "...";
}
const pad = (v, n) => { const s = cut(v, n); return s + " ".repeat(Math.max(0, n - s.length)); };
const rule = "-".repeat(WIDTH);
// lineBody(line) -> the registry's preview line without its leading kind word ("Goal: Paid orders" -> "Paid orders"): the
// kind has its own column
export const lineBody = (line) => String(line || "").replace(/^[A-Z][^:]{0,40}: /, "");
export const tabWord = (t) => TAB_WORD[t] || (t ? String(t) : "");
// placeWord(place) -> where an item shows, as the person names it: a Map view by its own name (Screens, API, Data, Flows,
// Deps, Arch), else the tab
const VIEW_WORD = [[/^\/map\/screens/, "Screens"], [/^\/map\/api/, "API"], [/^\/map\/data/, "Data"], [/^\/map\/flows/, "Flows"], [/^\/map\/deps/, "Deps"], [/^\/map\/arch/, "Arch"], [/^\/versions/, "Versions"]];
export function placeWord(p) {
  if (!p) return "";
  const v = VIEW_WORD.find(([re]) => re.test(String(p.path || "")));
  return v ? v[1] : tabWord(p.tab);
}
// the place a row names: a GTM item's GTM place, else the most specific (a Map view over the Map itself), else the first
export function rowPlace(places) {
  const list = Array.isArray(places) ? places : [];
  return list.find((p) => p.tab === "gtm") || list.find((p) => VIEW_WORD.some(([re]) => re.test(String(p.path || "")))) || list[0] || null;
}

function row(idx, kind, line, tab, effect) {
  const out = `${String(idx).padStart(COL.idx)}  ${pad(kind, COL.kind)}  ${pad(line, COL.line)}  ${pad(tab, COL.tab)} ${cut(effect, COL.effect)}`;
  return out.replace(/\s+$/, "");
}
// wrap(label, text) -> " label    text" lines, the text wrapped at WIDTH under its own indent
function wrap(label, text, max = 3) {
  const head = ` ${pad(label, 7)}  `;
  const room = WIDTH - head.length;
  const words = ascii(text).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur ? cur.length + 1 : 0) + w.length > room && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, max);
  if (lines.length > max) shown[max - 1] = cut(shown[max - 1] + " " + lines.slice(max).join(" "), room);
  return shown.map((l, i) => (i ? " ".repeat(head.length) : head) + cut(l, room));
}

// the effect word of one row: a receipt says what happened, a preview what will
function effectOf(it, receipt) {
  if (!receipt) return it.effect || it.verdict || "";
  if (it.filed && it.filed.id) return it.filed.id;   // the header says Filed; the id is what it became
  if (it.filed && it.filed.status === "filed") return "filed";
  if (it.filed && it.filed.status === "unchanged") return "unchanged";
  if (it.filed && it.filed.status === "left") return "left, not filed";
  if (it.filed && it.filed.status === "not_filed") return "NOT filed";
  return it.effect || "";
}
// a group's effect, said of every item in it: "all 71 file at once", "all 3 update", "all 18 filed" (one group = one effect)
const GROUP_WORD = { "files at once": "file at once", "updates 1": "update", "replaces 1": "replace", "removes 1": "remove", "counts at once": "count at once",
  "rules it at once": "rule it at once", unchanged: "unchanged, nothing changes", filed: "filed", "see the page": "filed" };
export function groupEffect(effect, n, receipt) {
  const w = GROUP_WORD[effect] || effect;
  return `${n === 1 ? "" : n === 2 ? "both " : `all ${n} `}${n === 1 && GROUP_WORD[effect] ? effect : w}`.trim();
}
// the noun of a kind, for a count ("71 questions", "1 GTM template")
const nounOf = (k, n) => { const w = String(k || "item"); if (n === 1) return w; return /(?:s|x|ch|sh)$/.test(w) ? w + "es" : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ies" : w + "s"; };
// wrapAt(text, indent, max) -> the text wrapped at WIDTH under `indent` spaces, at most max lines (a cut ends in "...")
function wrapAt(text, indent, max = 2) {
  const room = WIDTH - indent, words = ascii(text).split(" "), lines = [];
  let cur = "";
  for (const w of words) { if (cur && cur.length + 1 + w.length > room) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, max);
  if (lines.length > max) shown[max - 1] = cut(shown[max - 1] + " " + lines.slice(max).join(" "), room);
  return shown.map((l) => " ".repeat(indent) + cut(l, room));
}
// groupLines(text, mark) -> "  *  <text>" wrapped under its own indent (a group, or "+" for the must-show list's rest)
const groupLines = (text, mark = "*") => wrapAt(text, 5, 2).map((l, i) => (i ? l : `  ${mark}  ` + l.slice(5)));
// the reason a must-show row carries under it: what it needs (each thing, exactly), why it waits, why it is refused, or (a
// receipt) why it was left or not filed
function reasonOf(it, receipt) {
  const r = (Array.isArray(it.reasons) ? it.reasons : []).filter(Boolean);
  if (receipt && it.filed && it.filed.status === "not_filed") return it.filed.note || r.join(" ");
  return r.join(" ");
}

import { PROOF_FORMS } from "./transmission.js";
import { projectSlug } from "./project.js";

// previewText(answer, { mode: "preview" | "receipt", org, url, previewId }) -> the block, lines joined by "\n". The one-pass
// fix 7 (owner, 2026-10-01): the text never hides what a person confirms. Every item that needs something, waits for the
// owner or is refused (a receipt: left or not filed) is listed one by one with its own reason, up to MUST_LIST_MAX, past which
// the text says how many more and names the page; the plain items of a long preview are grouped by (kind, verdict, effect),
// each group saying its count and its one effect exactly, and the text says that every line is on the page.
export function previewText(a, o = {}) {
  const receipt = o.mode === "receipt";
  const items = Array.isArray(a && a.items) ? a.items : [];
  const leftOut = Array.isArray(a && a.leftOut) ? a.leftOut : [];
  const right = receipt ? (a.complete === false ? "Filed in part" : "Filed") : a && a.readOnly ? "Preview, read-only key" : "Preview, nothing filed yet";
  const left = `sharingu  ${ascii(o.org || "")}${o.org ? " / " : ""}${ascii(projectSlug((a && a.project) || ""))}`;   // the slug, never the org-prefixed key (12.6)
  const head = left.length + 2 + right.length > WIDTH ? `${cut(left, WIDTH - right.length - 2)}  ${right}` : left + " ".repeat(WIDTH - left.length - right.length) + right;
  const out = [head, rule];

  const must = (it) => (receipt ? !!(it.filed && (it.filed.status === "not_filed" || it.filed.status === "left")) : MUST_SHOW.includes(it.verdict));
  // D1b item 14: an update names the fields it changes, IN its effect ("updates status"); the fix-video step: the columns are
  // fixed, so an effect longer than its column is cut with "..." (the page says it whole), never wrapped onto a line of its own
  const changedEffect = (it) => (!receipt && it.effect === "updates 1" && Array.isArray(it.changes) && it.changes.length ? `updates ${it.changes.join(", ")}` : effectOf(it, receipt));
  const shownRow = (it) => row(it.i + 1, it.kindWord || it.kind, lineBody(it.line), placeWord(rowPlace(it.places)) || tabWord(it.tab), changedEffect(it));
  const withReason = (it) => { const r = must(it) ? reasonOf(it, receipt) : ""; return [shownRow(it), ...(r ? wrapAt(r, REASON_INDENT, 2) : [])]; };
  const grouped = items.length > GROUP_AT;
  let groupedItems = 0;
  if (!grouped) {
    for (const it of items) out.push(...withReason(it));
  } else {
    // every must-show item one by one, each with its reason (up to the cap: then how many more, and where they all are)
    const mustRows = items.filter(must);
    for (const it of mustRows.slice(0, MUST_LIST_MAX)) out.push(...withReason(it));
    if (mustRows.length > MUST_LIST_MAX) out.push(...groupLines(`and ${mustRows.length - MUST_LIST_MAX} more that ${receipt ? "were not filed" : "need something, wait for the owner or are refused"}: every one is on the page`, "+"));
    // the plain items by (kind, verdict, effect): one group says one effect, with its exact count
    const groups = new Map();
    for (const it of items.filter((x) => !must(x))) {
      const eff = receipt ? `${(it.filed && it.filed.status) || "filed"}${it.verdict === "waits_for_owner" ? ", waiting for the owner" : ""}` : effectOf(it, false);
      const k = `${it.kindWord || it.kind}|${it.verdict}|${eff}`;
      if (!groups.has(k)) groups.set(k, { kind: it.kindWord || it.kind, eff, list: [] });
      groups.get(k).list.push(it);
    }
    for (const g of groups.values()) {
      const it0 = g.list[0], n = g.list.length, where = placeWord(rowPlace(it0.places)) || tabWord(it0.tab);
      const first = g.list.slice(0, 2).map((x) => lineBody(x.line)).join("; ");
      out.push(...groupLines(`${n} ${nounOf(g.kind, n)}: ${groupEffect(g.eff, n, receipt)}${where ? ` (${where})` : ""}${n > 1 ? `, e.g. ${first}` : `: ${first}`}`));
      groupedItems += n;
    }
  }
  // a preview stored GROUPED (src/preview.js fitSummary: past its 64 KB cap) carries its plain items as groups
  for (const g of Array.isArray(a && a.groups) ? a.groups : []) {
    const n = Number(g.count) || 0, where = placeWord(rowPlace(g.places)) || tabWord(g.tab);
    out.push(...groupLines(`${n} ${nounOf(g.kindWord || "item", n)}: ${groupEffect(g.verdict === "unchanged" ? "unchanged" : receipt ? "filed" : "files at once", n, receipt)}${where ? ` (${where})` : ""}${(g.lines || []).length ? `, e.g. ${(g.lines || []).slice(0, 2).map(lineBody).join("; ")}` : ""}`));
    groupedItems += n;
  }
  if (leftOut.length) {
    const shown = leftOut.slice(0, 3);
    const room = WIDTH - COL.idx - 2 - COL.kind - 2;
    for (const l of shown) out.push(`${"-".padStart(COL.idx)}  ${pad("left out", COL.kind)}  ${cut([l.what, l.why].filter(Boolean).join(": "), room)}`.replace(/\s+$/, ""));
    if (leftOut.length > shown.length) out.push(`${"-".padStart(COL.idx)}  ${pad("left out", COL.kind)}  and ${leftOut.length - shown.length} more`);
  }
  if (!items.length && !leftOut.length && !(a && a.groups && a.groups.length)) out.push(" (no item)");
  out.push(rule);
  const c = (a && a.counts && a.counts.byVerdict) || {};
  if (!receipt) {
    const tally = [["files", "file at once"], ["waits_for_owner", "wait for the owner"], ["needs", "need one more thing"], ["unchanged", "unchanged"], ["refused", "refused"]]
      .filter(([k]) => c[k]).map(([k, w]) => `${c[k]} ${k === "files" && c[k] === 1 ? "files at once" : k === "waits_for_owner" && c[k] === 1 ? "waits for the owner" : k === "needs" && c[k] === 1 ? "needs one more thing" : w}`);
    if (grouped && tally.length) out.push(...wrap("items", tally.join(", ")));
    out.push(...wrap("reaches", (a && a.reachLine) || "nothing in the model yet", 2));
  } else {
    const f = (a && a.filedCount) || 0, left = (a && a.leftCount) || 0, notFiled = (a && a.notFiledCount) || 0;
    out.push(...wrap("filed", `${f} item${f === 1 ? "" : "s"}${left ? `; ${left} left, as asked` : ""}${notFiled ? `; ${notFiled} NOT filed, see each` : ""}`, 2));
  }
  // the accepted forms of proof, said ONCE when any item listed needs proof (each row's own reason stays short)
  if (items.some((it) => must(it) && it.needs && (it.needs.field === "proof" || (Array.isArray(it.needs.fields) && it.needs.fields.includes("proof")))))
    out.push(...wrap("proof", PROOF_FORMS.replace(/^proof /, ""), 6));
  if (groupedItems) out.push(...wrap("shown", `${groupedItems} item${groupedItems === 1 ? "" : "s"} in groups above; every line is on the page${o.url ? ` (open, below)` : ""}`, 2));
  if (o.url) out.push(...wrap("open", o.url, 2));
  if (!receipt && o.previewId) out.push(...wrap("file", `file {previewId: "${o.previewId}"} with the same items`, 2));
  if (receipt && a && a.complete === false && o.previewId) out.push(...wrap("retry", `file {previewId: "${o.previewId}"} again: it files only what did not land`, 2));
  if (!receipt && a && a.readOnly) out.push(...wrap("note", "a read-only key previews; it never files. Use your full key.", 2));
  if (a && a.meterNote) out.push(...wrap("meter", a.meterNote, 2));
  // last: when the work happened (a contribution's happenedAt): the items are filed now, the record keeps both
  const hs = items.map((it) => String(it.happenedAt || "").slice(0, 10)).filter(Boolean).sort();
  if (hs.length) out.push(...wrap("when", `happened ${hs[0]}${hs[hs.length - 1] !== hs[0] ? ` to ${hs[hs.length - 1]}` : ""}${hs.length < items.length ? ` (${hs.length} of ${items.length} items say when)` : ""}; filed ${receipt ? "now" : "when you file"}`, 2));
  return out.join("\n");
}
