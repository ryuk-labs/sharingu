// src/previewcard.js — the preview's summary block, drawn ONCE for two places (sprint 3, D3; docs/plan/MCP.md §4 "How the
// person sees it": one preview, three renders of the same data). The app's page GET /preview/:id (src/previewpage.js) and
// the card in the chat (MCP Apps: the ui:// resource below, rendered by a host that supports the extension) both draw the
// glance (one tile per verdict, or what was filed), the items grouped by verdict (each with what it needs and where it
// lands), what was left out and what it reaches from summaryParts(), so the two cannot drift. Pure: HTML strings from the
// preview's own data, on the shared parts (src/parts.js) and the shell's semantic tokens only.
//
// The card (MCP Apps 2026-01-26, notes in engine/.runs/d3/SPEC-NOTES.md):
//   · CARD_URI ui://sharingu/card is ONE static template (a host may prefetch and cache it): the brand tokens and the parts'
//     stylesheet inlined, no external request of any kind (the host's default CSP: no network, inline style and script
//     only), and one small script that is only the Apps bridge (ui/initialize → ui/notifications/initialized; the
//     tool-input and tool-result notifications; tools/call through the host for the File press; ui/open-link for a link;
//     ui/notifications/size-changed). It holds no key, no session, nothing of the person's: only what the tool's result
//     already gave the chat.
//   · What it draws arrives with the tool's result: the card fragment, rendered by the server (cardFragment, the same
//     summaryParts as the page), rides the result's _meta["sharingu/card"] for a client that declared the extension (it is
//     not model context); else the bridge asks the host to read brain://card/<previewId> (the same fragment, read from the
//     preview's row as the page reads it); else it shows the result's own text block. Theme: the host's (light → Paper,
//     dark → Ink), else the system's.
//   · File: a press is ordinary tools/calls, one per part of the preview (sprint 19: file_contribution, save_knowledge,
//     remove_knowledge, each with the preview's id and ITS items, picked by their numbers from the SAME items the host handed the
//     view: ui/notifications/tool-input), in turn, through the host, which shows its own consent; publish and equip previews call
//     their own tool with confirm: true (their `next`). The door's checks are unchanged: the card adds no authority.
import { esc, statusChip } from "./ui.js";
import { card, tile, tileRow, chip, group, line, lines, lineDetail, empty, stack } from "./parts.js";
import { PARTS_CSS } from "./parts.js";
import { WORLDS_CSS, BASE_CSS, UI_CSS, STATE_CSS } from "./shell.js";
import { lineBody, tabWord, placeWord } from "./previewtext.js";
import { typeWord } from "./reach.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { CARD_FONT_B64 } from "./fontdata.js";
import { projectSlug } from "./project.js";

export const CARD_URI = "ui://sharingu/card";
export const CARD_MIME = "text/html;profile=mcp-app";
export const CARD_META_KEY = "sharingu/card";
export const CARD_FRAGMENT_PREFIX = "brain://card/";
// the tools whose result the card draws (tools/list carries _meta.ui.resourceUri on each)
export const CARD_TOOLS = ["preview", "file_contribution", "save_knowledge", "remove_knowledge", "publish", "equip"];
// the template's own CSP, repeated in the document (the host's default is the same or stricter); font-src data: alone lets the
// card's inlined faces load (sprint 12, 12.6) and nothing from the network
// copy: off-screen (a meta tag's content, never on the screen)
export const CARD_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
// the template's size budget: no spec limit binds a ui:// resource, but a host reads it whole (Claude cuts a tool result near
// 150,000 characters); the card stays well inside, its inlined faces included (tools/confirm-card-selftest.mjs pins it)
export const CARD_TEMPLATE_MAX = 96 * 1024;
// the brand's three faces, cut to what the card draws (tools/make-card-fonts.py) and inlined as data: URIs: the sandbox has
// no network, so /fonts/ is out of reach. A host whose own CSP refuses data: fonts gets each stack's system face.
export const CARD_FONT_CSS = [["Manrope", "400 800", "manrope.woff2"], ["JetBrains Mono", "400 600", "jetbrains-mono.woff2"], ["Fredoka", "600", "fredoka.woff2"]]
  .map(([family, weight, file]) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${CARD_FONT_B64[file]}) format('woff2')}`).join("\n");
export const CARD_FRAGMENT_MAX = 64 * 1024;    // a fragment past this draws the first 60 items and counts the rest (Claude cuts a result near 150,000 characters)

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, ", ");
const txt = (s) => esc(noDash(s));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
// a place's link carries the preview's project, so it opens on the project the item files into
export function withProject(path, project) {
  const p = String(path || "");
  if (!p.startsWith("/") || p.startsWith("//") || /\{[\w.]+\}/.test(p)) return "";
  if (!project || /[?&]project=/.test(p)) return p;
  return p + (p.includes("?") ? "&" : "?") + "project=" + encodeURIComponent(project);
}
export const VERDICT_CHIP = { files: "LANDED", waits_for_owner: "APPROVE", needs: "gap", unchanged: "pending", refused: "ERROR" };
export const VERDICT_WORD = { files: "Files", waits_for_owner: "Waits for the owner", needs: "Needs one more", unchanged: "Unchanged", refused: "Refused" };
export const FILED_CHIP = { filed: ["LANDED", "Filed"], unchanged: ["pending", "Unchanged"], left: ["gap", "Left"], not_filed: ["ERROR", "Not filed"] };

// hrefOf(o, path) -> the link as the place draws it: the app's own path on the page; on the card the absolute address (the
// bridge opens it through the host: a sandboxed card navigates nowhere itself)
const hrefOf = (o, path) => (path ? (o.origin ? o.origin + path : path) : "");
const openAttr = (o) => (o.origin ? " data-open" : "");

// placeLinks(places, project, o, wordOf) -> at most three links, ONE per place word: two places on the same tab ("Broadcast",
// "Broadcast") read as one (the first one's link)
function placeLinks(places, project, o, wordOf = placeWord) {
  const seen = new Set();
  const out = [];
  for (const p of places || []) {
    const label = wordOf(p);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const href = withProject(p.path, project);
    out.push(href ? `<a class="pv-place" href="${esc(hrefOf(o, href))}"${openAttr(o)} data-place="${esc(p.region || "")}" title="${esc(p.what || "")}">${txt(label)}</a>` : `<span class="pv-place">${txt(label)}</span>`);
    if (out.length >= 3) break;
  }
  return out;
}
// isEcho(reason, needs) -> the reason only says again what the Needs fact names ("It needs touches (…)." beside Needs
// touches): the row shows that sentence once, as Needs (sprint 12, 12.6). A reason naming more than the one field stays.
export function isEcho(reason, needs) {
  const w = String(reason || "").trim();
  if (!needs || !needs.field) return false;
  if (needs.hint && w === String(needs.hint).trim()) return true;
  const m = /^It needs (.+?)(?: \([^()]*\))?\.$/.exec(w);
  if (!m) return false;
  const named = m[1].split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
  return named.length === 1 && named[0] === String(needs.field);
}
const sizeOf = (b) => { const n = Number(b) || 0; return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`; };

// one item: one line (its kind, its line, where it lands, its verdict or what it became), and opened in place, the reasons the
// door gave (the door's own words: why it waits or was refused) and the one field it needs
function itemLine(it, view, o) {
  const filed = it.filed;
  // an expired preview files nothing: every chip says so, the verdict it had stays on the row (data-verdict)
  const [st, word] = filed ? (FILED_CHIP[filed.status] || ["REVIEW", filed.status]) : view.state === "expired" ? ["pending", "Not filed"] : [VERDICT_CHIP[it.verdict] || "REVIEW", VERDICT_WORD[it.verdict] || it.effect || it.verdict];
  const places = placeLinks(it.places, view.project, o);
  const needs = it.needs && it.verdict === "needs" && !filed ? it.needs : null;
  const why = [...(it.reasons || []), ...(filed && filed.note ? [filed.note] : [])].filter((w) => !isEcho(w, needs || it.needs));
  const facts = [needs && needs.field ? ["Needs", `<code>${txt(needs.field)}</code>${needs.hint ? ` ${txt(needs.hint)}` : ""}`] : null,
    needs && needs.formats && (needs.formats.kind || needs.formats.shape) ? ["Format", `<code>${needs.formats.kind ? `kind ${esc(needs.formats.kind)}` : `shape ${esc(needs.formats.shape)}`}</code>`] : null,
    // an update's fields, whole (the terminal text cuts them to its effect column)
    it.effect === "updates 1" && Array.isArray(it.changes) && it.changes.length ? ["Changes", it.changes.map((c) => `<code>${txt(c)}</code>`).join(", ")] : null,
    ...why.map((w, i) => [i ? "" : "Why", txt(w)])].filter(Boolean);
  const idHref = filed && filed.id ? orgPath(`/contribution/${encodeURIComponent(filed.id)}?page=1&project=${encodeURIComponent(view.project)}`) : "";
  // the card shows the verdict on every row (it has no page title saying the state); the page shows it once filed or expired
  const chipNow = filed || view.state === "expired" || o.card;
  return line({ attrs: `data-i="${esc(it.i)}" data-verdict="${esc(it.verdict)}"${filed ? ` data-filed="${esc(filed.status)}"` : ""}`, lead: chip(txt(it.kindWord || it.kind)),
    // a decided question's reason: one line under its own line, the whole of it on hover
    title: noDash(lineBody(it.line)), sub: it.rationale ? `<span class="pv-why" data-region="rationale" title="${txt(it.rationale)}"><span class="pv-k">Why</span>${txt(it.rationale)}</span>${places.length ? `<span class="pv-at">${places.join(" · ")}</span>` : ""}` : places.join(" · "),
    meta: `${it.body && it.body.bytes != null ? `<span>${esc(sizeOf(it.body.bytes))}</span>` : ""}${filed && filed.id ? `<a class="pv-id" href="${esc(hrefOf(o, idHref))}"${openAttr(o)} data-filed-id="${esc(filed.id)}">${esc(filed.id)}</a>` : ""}${chipNow ? statusChip(st, word) : ""}`,
    detail: facts.length ? lineDetail({ facts }) : "" });
}
function groupLine(g, i) {
  return line({ attrs: `data-group="${esc(i)}" data-verdict="${esc(g.verdict)}"`, lead: chip(txt(tabWord(g.tab))), title: `${(g.lines || []).slice(0, 3).map(lineBody).map(noDash).join(", ")}${g.count > 3 ? ", …" : ""}`,
    meta: `<span title="stored grouped: a preview over 64 KB keeps its plain items as a count">${esc(g.count)}</span>${statusChip(VERDICT_CHIP[g.verdict] || "REVIEW", g.verdict === "unchanged" ? "Unchanged" : "Files")}` });
}

function reachCard(view, o) {
  const r = view.reach;
  const link = (href, name) => { const h = withProject(href, view.project); return h ? `<a class="u-link" href="${esc(hrefOf(o, h))}"${openAttr(o)}>${txt(name)}</a>` : txt(name); };
  const names = (list, more) => (list || []).slice(0, 6).map((n) => link(n.href, n.name || n.title || n.question || n.id || n.qid)).join(", ") + (more > 0 || (list || []).length > 6 ? ` +${esc(more + Math.max(0, (list || []).length - 6))}` : "");
  const types = (bt) => Object.entries(bt || {}).map(([t, n]) => plural(n, typeWord(t, 1), typeWord(t, 2))).join(", ");
  const rows0 = [];
  if (r && r.touched && r.touched.total) rows0.push(["Touched", `${esc(types(r.touched.byType))}<br>${names(r.touched.names, r.touched.more)}`, "touched"]);
  // sprint 12's review: what a change REACHES names its screens, doors and flows; its tables are counted, never listed, so the
  // card never prints a schema's own identifier (k_aim) as if it were a name. Touched keeps every name: the items' own
  if (r && r.reached && r.reached.total) {
    const bt = r.reached.byType || {}, named = (r.reached.names || []).filter((n) => n.type !== "table");
    const rest = Object.entries(bt).reduce((s0, [t, n]) => s0 + (t === "table" ? 0 : n), 0);
    const shown = Math.min(named.length, 6), more = Math.max(0, rest - shown);
    rows0.push(["Reached", `${esc(types(bt))}${r.reached.unnamed ? ` +${esc(r.reached.unnamed)}` : ""}${named.length ? `<br>${named.slice(0, 6).map((n) => link(n.href, n.name || n.id)).join(", ")}${more ? ` +${esc(more)}` : ""}` : ""}`, "reached"]);
  }
  const c = (r && r.checks) || {};
  if (c.total) rows0.push(["Checks", `${esc(c.graded)} of ${esc(c.total)} graded`, "checks"]);
  if (r && (r.goals || []).length) rows0.push(["Goals", names(r.goals.map((g) => ({ ...g, name: g.title })), Number(r.goalsMore) || 0), "goals"]);   // D1b: "+N", never cut
  const qs = r ? [...(r.questions || []), ...(r.asks || []).filter((a) => !(r.questions || []).some((q) => q.qid === a.qid))] : [];
  if (qs.length) rows0.push(["Questions", names(qs.map((q) => ({ ...q, name: q.question })), 0), "questions"]);
  const first = r && r.touched && r.touched.names && r.touched.names[0];
  const firstHref = first ? withProject(first.href, view.project) : "";
  const map = firstHref ? `<a class="u-link" href="${esc(hrefOf(o, firstHref))}"${openAttr(o)} data-button="show-on-map" title="Opens the first node it touches">Show on the Map</a>` : "";
  const capped = r && (r.capped || []).length ? chip("Capped", { title: r.capped.map(noDash).join(". ") }) : "";
  return card({ label: "Reach", region: "reach", flush: !rows0.length, action: `${capped}${map}`,
    body: rows0.length ? `<dl class="pv-reach">${rows0.map(([k, v, key]) => `<div data-reach="${esc(key)}"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : empty("Reaches nothing") });
}

// summaryParts(view, { origin, card }) -> { glance, items, left, reach, state, n }: the summary block the page and the card
// both draw. view: src/preview.js readPreviewView's answer (the page, brain://card) or cardViewOf(answer) (the tool's own
// answer). origin set: the links are absolute and marked data-open (the card); else app paths (the page).
export function summaryParts(v, o = {}) {
  const shown = v.items || [];
  const state = !shown.length && !(v.groups || []).length && v.state === "open" ? "empty" : v.state;
  const n = shown.length + (v.groups || []).reduce((s, g) => s + (g.count || 0), 0) + (v.hidden || 0);
  const bv = (v.counts && v.counts.byVerdict) || {};
  const fc = v.fileCounts || {};
  const tiles = state === "expired" ? [tile({ label: "Not filed", value: n, key: "not-filed" })]
    : state === "filed" || state === "partial" ? [tile({ label: "Filed", value: fc.filed || 0, key: "filed", tone: "ok" }), fc.notFiled ? tile({ label: "Not filed", value: fc.notFiled, key: "not-filed", tone: "bad" }) : "",
      fc.left ? tile({ label: "Left", value: fc.left, key: "left", tone: "warn" }) : "", fc.unchanged ? tile({ label: "Unchanged", value: fc.unchanged, key: "unchanged" }) : ""]
    : [["files", "Files", "ok"], ["waits_for_owner", "Waits for the owner", "warn"], ["needs", "Needs one more", "warn"], ["unchanged", "Unchanged", ""], ["refused", "Refused", "bad"]]
      .filter(([k]) => bv[k]).map(([k, w, t]) => tile({ label: w, value: bv[k], key: k.replace(/_/g, "-"), tone: t }));
  const glance = tiles.filter(Boolean).length ? tileRow(tiles, { region: "verdicts", label: "Verdicts" }) : "";
  // the items, grouped by verdict (each group open; a long preview's plain items stored as counts follow)
  const byV = new Map();
  for (const it of shown) { const k = it.filed ? `filed:${it.filed.status}` : it.verdict; if (!byV.has(k)) byV.set(k, []); byV.get(k).push(it); }
  const gWord = (k) => (k.startsWith("filed:") ? (FILED_CHIP[k.slice(6)] || [null, k.slice(6)])[1] : VERDICT_WORD[k] || k);
  const groups = [...byV].map(([k, xs]) => group({ title: gWord(k), count: xs.length, open: true, attrs: `data-group-verdict="${esc(k)}"`, body: lines(xs.map((it) => itemLine(it, v, o)), { lead: 96 }) })).join("")
    + ((v.groups || []).length ? group({ title: "Stored grouped", count: (v.groups || []).reduce((s0, g) => s0 + (g.count || 0), 0), body: lines((v.groups || []).map(groupLine), { lead: 96 }) }) : "");
  const hidden = v.hidden ? chip("Not open to your role", { count: v.hidden }) : "";
  const note = v.note ? chip("Note", { title: noDash(v.note) }) : "";
  const items = card({ label: "Items", count: n, flush: true, region: "items", action: `${note}${hidden}`, body: groups || empty("Not open to your role") });
  const left = (v.leftOut || []).length ? card({ label: "Left out", count: v.leftOut.length, flush: true, region: "left-out",
    body: lines(v.leftOut.map((l) => line({ title: noDash(l.what), sub: l.why ? txt(l.why) : "" })), { compact: true }) }) : "";
  return { glance, items, left, reach: reachCard(v, o), state, n };
}

export const SUMMARY_CSS = `
.pv-place{color:var(--text-muted)}
a.pv-place:hover{color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
.pv-id{font:500 11.5px/1 var(--mono);color:var(--text)}
.pv-reach{margin:0}
.pv-reach>div{padding:9px 0;border-top:1px solid var(--line)}
.pv-reach>div:first-child{border-top:0}
.pv-reach dt{font:500 10.5px/1.4 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint);margin:0 0 4px}
.pv-reach dd{margin:0;font-size:13px;line-height:1.55;color:var(--text);overflow-wrap:anywhere}
.pv-why,.pv-at{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv-why{color:var(--text-muted)}
.pv-k{font:500 10.5px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint);margin-right:6px}
[data-region="items"] .p-ld-facts>div:only-child{grid-column:1/-1}
[data-region="items"]>.p-card-body{overflow:hidden;border-radius:0 0 11px 11px}
[data-region="items"] .p-detail{padding-bottom:18px}`;

// ---- the card ----
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
// cardViewOf(answer) -> the view summaryParts draws, from the tool's own answer: a preview (preview), a receipt (a write tool's),
// or null for anything else (a refusal, an answer of another tool)
export function cardViewOf(a) {
  if (!isObj(a) || a.error || !Array.isArray(a.items)) return null;
  const receipt = "complete" in a && !!a.results;
  const countsOf = (items) => { const byVerdict = {}; for (const it of items) byVerdict[it.verdict] = (byVerdict[it.verdict] || 0) + 1; return { byVerdict }; };
  return { id: a.previewId || "", project: a.project || "", author: true, state: receipt ? (a.complete ? "filed" : "partial") : "open", items: a.items, groups: a.groups || null,
    counts: receipt ? countsOf(a.items) : a.counts || countsOf(a.items), reach: a.reach || null, leftOut: a.leftOut || [], note: a.note || "", hidden: 0,
    fileCounts: receipt ? a.counts || {} : {}, ready: Number(a.ready) || 0, notReady: Number(a.notReady) || 0, url: a.url || "", parts: receipt ? [] : Array.isArray(a.parts) ? a.parts : [] };
}
const STATE_WORD = { open: "Not filed yet", partial: "Filed in part", filed: "Filed", expired: "Expired", empty: "Not filed yet" };

// cardFragment(answer, { origin, tool }) -> the card's body HTML for one tool answer (a preview, a receipt, a publish or an
// equip preview), or "" when the answer is not one the card draws. Pristine copy: titles, labels, values and buttons.
export function cardFragment(a, o = {}) {
  const origin = String(o.origin || "");
  if (isObj(a) && a.preview === true && (a.verb === "publish" || a.verb === "equip")) return verbFragment(a, { origin, card: true });
  // a readPreviewView answer (brain://card: the row, as the page reads it) is drawn as it is; a tool's answer is mapped
  const v0 = isObj(a) && a.id && a.state && !("previewId" in a) ? a : cardViewOf(a);
  if (!v0) return "";
  const bv0 = (v0.counts && v0.counts.byVerdict) || {};
  const v = { ...v0, ready: v0.ready != null ? v0.ready : (Number(bv0.files) || 0) + (Number(bv0.waits_for_owner) || 0), notReady: v0.notReady != null ? v0.notReady : (Number(bv0.needs) || 0) + (Number(bv0.refused) || 0) };
  const parts = summaryParts(v, { origin, card: true });
  const page = v.id ? withProject(orgPath(`/preview/${encodeURIComponent(v.id)}`), "") : "";
  const open = page ? `<a class="u-btn small ghost" href="${esc(hrefOf({ origin }, page))}" data-open data-button="open-preview">Open in the app</a>` : "";
  // the File press is the author's (a write tool reads a preview for its author only): a reader of the project sees no button.
  // It files each part not filed yet with its own tool (data-parts: each tool and its items' numbers)
  const press = (Array.isArray(v.parts) ? v.parts : []).filter((p) => p && !p.filed && Array.isArray(p.items) && p.items.length).map((p) => ({ tool: p.tool, items: p.items }));
  const canFile = parts.state === "open" && !!v.id && v.author !== false && !(v.notReady > 0) && v.ready > 0 && press.length > 0;
  const fileBtn = canFile && o.tool !== "page" ? `<button class="u-btn small primary" type="button" data-file data-tool="parts" data-parts="${esc(JSON.stringify(press))}" data-preview-id="${esc(v.id)}" hidden>File</button>` : "";
  const notReady = parts.state === "open" && v.notReady > 0 ? chip("Not ready", { tone: "warn", count: v.notReady }) : "";
  const head = `<header class="sg-head"><span class="sg-mark">sharingu</span><span class="sg-title" data-region="state">${esc(STATE_WORD[parts.state] || "Preview")}</span><span class="sg-proj">${txt(v.projectName || projectSlug(v.project || ""))}</span><span class="sg-act">${notReady}${open}${fileBtn}</span></header>`;
  const body = `<div class="sg-body" data-screen="card" data-state="${esc(parts.state)}" data-preview="${esc(v.id || "")}">${head}${stack(parts.glance, parts.items, parts.left, v.reach ? parts.reach : "")}<p class="sg-done" data-region="file-result" hidden></p></div>`;
  if (body.length <= CARD_FRAGMENT_MAX) return body;
  // past the cap: the first items stay, the rest is a count (the page has them all)
  const items = (v.items || []).slice(0, 60);
  const more = (v.items || []).length - items.length;
  const p2 = summaryParts({ ...v, items, hidden: (v.hidden || 0) + more }, { origin, card: true });
  return `<div class="sg-body" data-screen="card" data-state="${esc(parts.state)}" data-preview="${esc(v.id || "")}" data-cut="${esc(more)}">${head}${stack(p2.glance, p2.items, p2.left, v.reach ? p2.reach : "")}<p class="sg-done" data-region="file-result" hidden></p></div>`;
}
// verbFragment(answer) -> a publish or equip preview as a card: its one line, where it shows, who it reaches, and the button
// that calls the same tool with confirm: true (its `next`)
function verbFragment(a, o) {
  const places = placeLinks((a.shows || []).filter((p) => withProject(p.path, a.project || "")), a.project || "", o, (p) => placeWord(p) || tabWord(p.tab));
  const item = line({ attrs: `data-verdict="files"`, lead: chip(a.verb === "publish" ? "publish" : "equip"), title: noDash(a.line), sub: places.join(" · "), meta: statusChip("LANDED", "Files"),
    detail: lineDetail({ facts: [["Reaches", txt(a.reaches)]] }) });
  const next = isObj(a.next) && (a.next.tool === "publish" || a.next.tool === "equip") && isObj(a.next.args) && a.next.args.confirm === true ? a.next : null;
  const btn = next ? `<button class="u-btn small primary" type="button" data-file data-tool="${esc(next.tool)}" data-args="${esc(JSON.stringify(next.args))}" hidden>${a.verb === "publish" ? "Publish" : a.from ? "Update" : "Equip"}</button>` : "";
  const head = `<header class="sg-head"><span class="sg-mark">sharingu</span><span class="sg-title" data-region="state">${a.verb === "publish" ? "Publish" : a.from ? "Update" : "Equip"}</span><span class="sg-proj">${txt(a.project ? projectSlug(a.project) : a.slug || "")}</span><span class="sg-act">${btn}</span></header>`;
  return `<div class="sg-body" data-screen="card" data-state="open" data-verb="${esc(a.verb)}">${head}${stack(card({ label: "Items", count: 1, flush: true, region: "items", body: lines([item], { lead: 96 }) }))}<p class="sg-done" data-region="file-result" hidden></p></div>`;
}

const CARD_CSS = `
html,body{background:transparent}
body{padding:0;margin:0;font-size:13.5px}
.sg-body{padding:12px;max-width:760px}
.sg-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.sg-mark{font:600 15px/1 var(--display);color:var(--text)}
.sg-title{font:700 14px/1.3 var(--sans);color:var(--text)}
.sg-proj{font:500 12px/1 var(--mono);color:var(--text-muted)}
.sg-act{margin-left:auto;display:flex;gap:8px;align-items:center}
.sg-done{margin:10px 0 0;font:500 12.5px/1.5 var(--mono);color:var(--text-muted)}
.sg-wait{padding:16px;color:var(--text-muted);font:500 12px/1 var(--mono)}
.sg-text{margin:0;padding:12px;font:400 12px/1.45 var(--mono);white-space:pre;overflow:auto;color:var(--text)}
@media (max-width:520px){.sg-act{margin-left:0;width:100%}}`;

// THE BRIDGE: the only script the card carries. JSON-RPC 2.0 over postMessage with the host (MCP Apps 2026-01-26): it never
// talks to the network (the CSP forbids it), never reads a cookie or storage, and holds only what the host hands it.
const BRIDGE = `(function(){
var host=window.parent&&window.parent!==window?window.parent:null;var root=document.getElementById('sg-card');var nid=1,wait={},args=null,result=null,caps={},busy=false;
function send(m){if(host)host.postMessage(m,'*')}
function req(method,params){var id=nid++;send({jsonrpc:'2.0',id:id,method:method,params:params||{}});return new Promise(function(ok,no){wait[id]={ok:ok,no:no}})}
function note(method,params){send({jsonrpc:'2.0',method:method,params:params||{}})}
function theme(t){if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}
function size(){note('ui/notifications/size-changed',{height:Math.ceil(document.documentElement.getBoundingClientRect().height)})}
function cardOf(r){var m=r&&r._meta&&r._meta['${CARD_META_KEY}'];return m&&typeof m.html==='string'?m.html:''}
function dataOf(r){try{var t=r&&r.content&&r.content[0]&&r.content[0].text;return t?JSON.parse(t):null}catch(e){return null}}
function textOf(r){var d=dataOf(r);if(d&&typeof d.text==='string')return d.text;var t=r&&r.content&&r.content[0]&&r.content[0].text;return typeof t==='string'?t:''}
function draw(html){root.innerHTML=html;wire();size()}
function drawText(t){var p=document.createElement('pre');p.className='sg-text';p.textContent=t;root.replaceChildren(p);size()}
function show(r){result=r;var h=cardOf(r);if(h)return draw(h);var d=dataOf(r);var id=d&&(d.previewId||(d.receipt&&d.receipt.previewId));
 if(id&&caps.serverResources){req('resources/read',{uri:'${CARD_FRAGMENT_PREFIX}'+id}).then(function(x){var c=x&&x.contents&&x.contents[0];if(c&&typeof c.text==='string'&&c.text)draw(c.text);else drawText(textOf(r))},function(){drawText(textOf(r))});return}
 drawText(textOf(r))}
function wire(){var b=root.querySelector('[data-file]');if(b){var tool=b.getAttribute('data-tool');var calls=null;
 if(tool==='parts'){var ps=null;try{ps=JSON.parse(b.getAttribute('data-parts'))}catch(e){ps=null}var pid=b.getAttribute('data-preview-id');
  if(ps&&args&&Array.isArray(args.items))calls=ps.map(function(p){return{name:p.tool,arguments:{previewId:pid,items:p.items.map(function(n){return args.items[n-1]})}}})}
 else{var a=null;try{a=JSON.parse(b.getAttribute('data-args'))}catch(e){a=null}if(a)calls=[{name:tool,arguments:a}]}
 if(calls&&caps.serverTools){b.hidden=false;b.addEventListener('click',function(){if(busy)return;busy=true;b.disabled=true;
  function done(r){busy=false;var h=cardOf(r);if(h)return draw(h);var o=root.querySelector('[data-region="file-result"]');if(o){o.hidden=false;o.textContent=(r&&r.isError?'Not filed: ':'')+(textOf(r).split('\\n')[0]||'')}size()}
  function failed(){busy=false;b.disabled=false;var o=root.querySelector('[data-region="file-result"]');if(o){o.hidden=false;o.textContent='Not filed'}size()}
  function step(k,last){if(k>=calls.length)return done(last);req('tools/call',calls[k]).then(function(r){if(r&&r.isError)return done(r);step(k+1,r)},failed)}
  step(0,null)})}}}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;e.preventDefault();var u=a.getAttribute('href');if(/^https?:/.test(u))req('ui/open-link',{url:u}).catch(function(){})});
window.addEventListener('message',function(e){if(host&&e.source!==host)return;var m=e.data;if(!m||m.jsonrpc!=='2.0')return;
 if(m.id!=null&&wait[m.id]&&!m.method){var w=wait[m.id];delete wait[m.id];if(m.error)w.no(m.error);else w.ok(m.result);return}
 if(m.method==='ui/notifications/tool-input'){args=(m.params&&m.params.arguments)||null;if(result)wire();return}
 if(m.method==='ui/notifications/tool-result'){show(m.params);return}
 if(m.method==='ui/notifications/host-context-changed'){theme(m.params&&m.params.theme);size();return}
 if(m.method==='ui/resource-teardown'&&m.id!=null){send({jsonrpc:'2.0',id:m.id,result:{}});return}
 if(m.method==='ping'&&m.id!=null){send({jsonrpc:'2.0',id:m.id,result:{}})}});
if(host){req('ui/initialize',{appInfo:{name:'sharingu card',version:'1'},appCapabilities:{availableDisplayModes:['inline']},protocolVersion:'2026-01-26'}).then(function(r){
 caps=(r&&r.hostCapabilities)||{};var c=r&&r.hostContext;if(c)theme(c.theme);note('ui/notifications/initialized',{});size()},function(){})}
if(root.firstElementChild)wire();
if(window.ResizeObserver)new ResizeObserver(size).observe(document.body);})();`;

// cardDocument({ fragment, theme }) -> the ONE HTML document: the template (no fragment: what resources/read serves for
// CARD_URI) or, for a standalone look (the shots, the selftest), the same document with a fragment already drawn.
export function cardDocument(o = {}) {
  const t = o.theme === "light" || o.theme === "dark" ? ` data-theme="${o.theme}"` : "";
  return `<!doctype html>
<html lang="en"${t}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="${CARD_CSP}">
<title>sharingu</title>
<style>
${CARD_FONT_CSS}
${WORLDS_CSS}
${BASE_CSS}
${UI_CSS}
${PARTS_CSS}
${STATE_CSS}
${SUMMARY_CSS}
${CARD_CSS}
</style>
</head>
<body>
<main id="sg-card">${o.fragment || '<div class="sg-wait" data-state="loading">sharingu</div>'}</main>
<script>${BRIDGE}</script>
</body>
</html>`;
}
let TEMPLATE = null;
export const cardTemplate = () => (TEMPLATE ||= cardDocument());
// the resource's _meta: no CSP domain is declared (the host's default: no network at all); prefersBorder for a card look
export const CARD_RESOURCE_META = { ui: { prefersBorder: true } };
// the tool's _meta in tools/list: the current key and the deprecated flat one the SDK still writes
export const CARD_TOOL_META = { ui: { resourceUri: CARD_URI }, "ui/resourceUri": CARD_URI };
