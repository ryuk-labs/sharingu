// src/mappage.js — the Map, the main tab (sprint 2; docs/plan/LOOK.md "The Map, ruled"): ONE page for the seven old ones.
// GET /map draws it; GET /eagle and GET /map/:plane draw the same page opened on that layer or view (src/mapread.js).
//
//   toolbar   (data-region="layers") one compact strip: the rail's fold, the layer pills (Screens · Doors · Data · Flows ·
//             Deps, each with its count), the views (Canvas · Screens · Arch · MCP), the light filter with its counts, find, the
//             flow being played, zoom and Fit, the version chip and the panel's fold (M1: src/parts.js foldToggle; "\" folds
//             both and leaves the canvas alone, kept for the person: src/shell.js FOLD_BOOT).
//   canvas    (data-region="canvas") the layered columns (src/maplayout.js), drawn as SVG in a viewBox the browser fits by
//             itself, so the first paint is the final one; src/mapclient.js adopts it (pan, zoom, hover, pin, keys,
//             folds, find, flows, live lights, a minimap).
//   inspector (data-region="inspector") the overview (the model's counts, the lights, the walk over the open gaps, the
//             flows to play, the cheapest move, the keys), or the pinned node (src/mapnode.js renderInspector, the ONE
//             inspector renderer, which GET /map/node also answers), or the flow being played. A bottom sheet on a phone.
//   node-list (data-region="node-list") every node as a list, grouped by column and group: what assistive tech reads, the
//             main surface on a phone (the canvas is then a sideways strip above it). Each is a plain link to /map?node=<ref>
//             (a pin without script); the client pins it in place by its data-i.
// Views: Screens (the atlas: src/atlaspage.js draws it under this same toolbar, with this page's sheet under its own),
// Arch (src/archview.js: the architecture as a layered, living diagram, its lanes, the one seam, the org worker, the
// crossing rules and the journeys Play walks) and MCP (the worker's tools as a list of lines, and this project's shelf). Semantic tokens only; no
// em dash in anything drawn; every button carries data-button and its door (data-door) or data-client.
import { empty, copyBtn, card, chip, line, lines, lineDetail, foldToggle } from "./parts.js";
import { esc, emptyState, unreachableState, LISTS_MARK } from "./ui.js";
import { versionChip } from "./shell.js";
import { mapKit, LAYERS } from "./maplayout.js";
import { walkBar, MAP_EMPTY, MAP_DOWN } from "./mapnode.js";
import { MAP_CLIENT } from "./mapclient.js";
import { renderArchView } from "./archview.js";
import { ARCH_CLIENT } from "./archclientdata.js";   // the shipped (minified) build of src/archclient.js
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "./project.js";   // sprint 13 (13.2): a page names a project by its slug, never its org-prefixed key

export const MAP_REGIONS = ["layers", "canvas", "inspector", "node-list"];
// the views (sprint 2): the Canvas, the Screens atlas (src/atlaspage.js), Arch and MCP
export const VIEWS = [["canvas", "Canvas", "/map"], ["screens", "Screens", "/map/screens"], ["arch", "Arch", "/map/arch"], ["mcp", "MCP", "/map/mcp"]];
const LIGHTS = [["green", "passing"], ["amber", "partly graded"], ["red", "failing"], ["grey", "not graded"]];
// sprint 3 B4: a light is STALE when a check that names the node was graded before the node last changed
export const STALE = ["stale", "stale: graded before a change"];
export const LIGHT_WORD = Object.fromEntries([...LIGHTS, STALE]);
// sprint 3 L3 (pristine copy): the legend is labelled dots; what each light means rides its title
export const LEGEND_WORD = { green: "passing", amber: "partly graded", red: "failing", grey: "not graded", stale: "stale" };
export const LIGHT_TITLE = { green: "Every check that names it passes", amber: "Some of its checks are graded", red: "One of its checks fails", grey: "None of its checks is graded yet", stale: "A check was graded before it last changed" };
const KIND_WORD = { surface: "Surface", screen: "Screen", door: "Door", table: "Table", entity: "Entity", dep: "Decision", gap: "Gap" };
// the smallest world box the first paint fits (a model of three nodes is not drawn at 400%)
export const MIN_W = 980, MIN_H = 600;
const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const plural = (n, w) => `${n} ${n === 1 ? w : w + "s"}`;
const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';

// ---- the toolbar (the Screens view draws the same one: src/atlaspage.js) ----
export function toolbar(o) {
  const L = o.L, view = o.view, on = o.on || {};
  const layerN = (L && L.layerN) || {};
  const layers = LAYERS.map(([k, label]) => {
    const n = k === "deps" ? layerN.deps || 0 : layerN[k] || 0;
    if (view !== "canvas") return `<a class="mx-pill" href="${orgPath(`/map?layer=${k}${o.project ? `&amp;project=${encodeURIComponent(o.project)}` : ""}`)}" data-button="layer-toggle" data-door="GET /map" data-layer="${k}">${label}</a>`;
    return `<button type="button" class="mx-pill" data-button="layer-toggle" data-client="shows or hides a layer of the canvas" data-layer="${k}" aria-pressed="${on[k] ? "true" : "false"}"${n ? "" : ' data-empty="1"'}>${label}<b>${n}</b></button>`;
  }).join("");
  const views = VIEWS.map(([k, label, href]) => `<a class="mx-view" href="${orgPath(href + (o.project ? `?project=${encodeURIComponent(o.project)}` : ""))}" data-button="view-switch" data-door="${k === "canvas" ? "GET /map" : "GET /map/:plane"}" data-view="${k}"${k === view ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const c = (L && L.counts) || { green: 0, amber: 0, red: 0, grey: 0 };
  // sprint 3 B4: STALE is its own state beside the four lights (a ring, not a fifth colour), toggled only when a node is stale
  const lights = view === "canvas" ? `<div class="mx-lights" role="group" aria-label="Dim a light">${[...LIGHTS, ...(c.stale ? [STALE] : [])].map(([k, w]) =>
    `<button type="button" class="mx-light" data-button="state-toggle" data-client="dims the nodes of this light" data-show="${k}" data-light="${k}" aria-pressed="true" title="${c[k] || 0} ${w}. Press to dim them."><i></i><b>${c[k] || 0}</b><span class="u-sr"> ${w}</span></button>`).join("")}</div>` : "";
  const find = view === "canvas" ? `<label class="mx-find">${SEARCH_ICON}<input type="search" id="mx-q" data-input-exception="search" placeholder="Find a node" aria-label="Find a node on the map" autocomplete="off" spellcheck="false"><output id="mx-qn" class="mx-qn" aria-hidden="true"></output><kbd aria-hidden="true">F</kbd></label>` : "";
  const flow = view === "canvas" && L && L.flows.length ? `<div class="mx-flowbar" id="mx-flowbar" hidden><button type="button" class="mx-b mx-b-go" data-button="play-flow" data-client="plays the flow step by step" aria-pressed="false" data-flow-name>Play flow</button></div>` : "";
  const zoom = view === "canvas" ? `<div class="mx-zoom" role="group" aria-label="Zoom"><button type="button" class="mx-z" data-button="zoom" data-client="zooms the canvas out" data-dir="out" aria-label="Zoom out">&minus;</button><output id="mx-zl" class="mx-zl">100%</output><button type="button" class="mx-z" data-button="zoom" data-client="zooms the canvas in" data-dir="in" aria-label="Zoom in">+</button><button type="button" class="mx-z mx-fit" data-button="fit" data-client="fits the canvas to the window">Fit</button></div>` : "";
  return `<header class="mx-bar" data-region="layers">
  ${o.anonymous ? "" : foldToggle("rail")}<nav class="mx-layers" aria-label="Layers">${layers}</nav>
  <nav class="mx-views" aria-label="Map views">${views}</nav>
  ${lights}${find}${flow}<span class="mx-sp"></span>${zoom}${o.anonymous ? "" : versionChip(o.head) + foldToggle("panel")}
</header>`;
}

// ---- the canvas (the first paint: the kit's own drawing) ----
function worldBox(L) {
  const x0 = L.X - 24, w = L.W - L.X + 48, h = L.H + 24, vw = Math.max(w, MIN_W), vh = Math.max(h, MIN_H);
  return { x: x0 - (vw - w) / 2, y: 0, w: vw, h: vh };
}
function canvas(o) {
  const L = o.L, K = mapKit(), S = { open: o.open || {}, on: o.on || {}, pin: o.pin == null ? -1 : o.pin, imp: o.imp || null };
  K.stack(L, S);
  const b = worldBox(L);
  // M5: a column's head folds it (src/mapclient.js toggleCol): its title and count, a chevron after them, one hit area over
  // all three (transparent: the hover inks the title and the chevron)
  const heads = L.cols.map((c, ci) => { const cx = c.label.length * 7.6 + 8, vx = cx + String(c.n).length * 7 + 7;
    return `<g class="mx-colh" data-col="${ci}" transform="translate(${c.x} 14)"${S.on[c.layer] ? "" : ' style="display:none"'}><text class="mx-colt" y="0">${esc(c.label.toUpperCase())}</text><text class="mx-colc" x="${esc(String(cx))}" y="0">${c.n}</text><path class="mx-chev mx-colv" d="M${vx.toFixed(1)} -7l3.5 3.5 3.5-3.5"/><rect class="mx-colhit" x="-6" y="-13" width="${(vx + 16).toFixed(1)}" height="19"/><title>Fold column</title></g>`; }).join("");
  return `<section class="mx-stage${S.imp ? " mx-impact" : ""}" id="mx-stage" data-region="canvas" tabindex="0" role="application" aria-roledescription="map" aria-label="The map canvas: ${esc(plural(L.nodes.length, "node"))} in ${esc(plural(L.cols.length, "column"))}. Arrow keys move between them, Enter opens, Escape closes." aria-describedby="mx-keys">
  <svg class="mx-svg" id="mx-svg" viewBox="${b.x.toFixed(1)} ${b.y} ${b.w.toFixed(1)} ${b.h.toFixed(1)}" preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false">
    <g id="mx-world"><g id="mx-links" class="mx-links">${K.links(L, S)}</g><g id="mx-fl"></g><g id="mx-hl"></g><g id="mx-units">${K.units(L, S)}</g><g id="mx-heads"><rect id="mx-headbg" class="mx-headbg" x="${b.x.toFixed(1)}" y="0" width="${b.w.toFixed(1)}" height="28"/>${heads}</g></g>
  </svg>
  <div class="mx-mini" id="mx-mini" aria-hidden="true"></div>
  <p class="u-sr" id="mx-live" aria-live="polite"></p>
</section>`;
}

// ---- the inspector's overview ----
export function overviewOf(o) {
  const L = o.L, m = o.model || {};
  const counts = (L && L.counts) || { green: 0, amber: 0, red: 0, grey: 0 };
  const byType = {};
  // D1b item 15: "open decisions" counts only the chains whose question is open now; the rest are rulings not built
  for (const n of (L && L.nodes) || []) { const t = n.t === "dep" && n.o === 0 ? "ruled" : n.t; byType[t] = (byType[t] || 0) + 1; }
  const stat = [["screen", "screen"], ["door", "door"], ["table", "table"], ["entity", "entity"], ["dep", "open decision"], ["ruled", "ruling not built"], ["gap", "open gap"]]
    .filter(([t]) => byType[t]).map(([t, w]) => `<span><b>${byType[t]}</b> ${esc(byType[t] === 1 ? w : w === "entity" ? "entities" : w === "ruling not built" ? "rulings not built" : w + "s")}</span>`);
  if (L && L.flows.length) stat.push(`<span><b>${L.flows.length}</b> ${L.flows.length === 1 ? "flow" : "flows"}</span>`);
  const flows = L && L.flows.length ? `<section class="mx-sec" data-region="flows"><h4 class="mx-k">Flows <span>${L.flows.length}</span></h4><ul class="mx-rows">${L.flows.map((f, i) =>
    `<li><button type="button" class="mx-row" data-button="flow-pick" data-client="plays this flow on the canvas" data-flow="${i}" title="${esc(f.n)}"><i class="mx-dotl" data-light="${esc(f.l)}"></i><span class="mx-rt">${txt(f.n)}</span><span class="mx-rm">${f.st.length} ${f.st.length === 1 ? "step" : "steps"}</span></button></li>`).join("")}</ul></section>` : "";
  const mv = m.deps && m.deps.cheapest && Array.isArray(m.deps.cheapest.qids) && m.deps.cheapest.qids.length ? m.deps.cheapest : null;
  const move = mv ? `<section class="mx-sec" data-region="cheapest-move"><h4 class="mx-k" title="Answering these questions reaches the most surfaces and unblocks the most rulings">The cheapest move</h4><p class="mx-tags">${mv.qids.slice(0, 4).map((q) => `<a class="mx-tag" href="${orgPath(`/question/${encodeURIComponent(q)}`)}" data-button="open-question" data-door="GET /question/:qid">${esc(q)}</a>`).join("")}${mv.qids.length > 4 ? `<span class="mx-tag">+${mv.qids.length - 4}</span>` : ""}</p><p class="mx-stats"><span><b>${esc(Number(mv.surfaces) || 0)}</b> ${Number(mv.surfaces) === 1 ? "surface" : "surfaces"}</span><span><b>${esc(Number(mv.blocks) || 0)}</b> ${Number(mv.blocks) === 1 ? "ruling" : "rulings"} unblocked</span></p></section>` : "";
  return `<div class="mx-ov">
  <p class="mx-k">The map of ${esc((o.project && projectSlug(o.project)) || "this project")}</p>
  <p class="mx-stats">${stat.join("") || "<span>Nothing is filed yet</span>"}</p>
  ${walkBar(null, (m.gaps || []).length)}
  <section class="mx-sec"><h4 class="mx-k" title="A dot is the light of the checks that name the node: green when every one passes, red when one fails, amber when some are graded, grey before a grade; a hollow amber ring is stale (graded before the node last changed)">Lights</h4><ul class="mx-legend">${[...LIGHTS, STALE].map(([k, w]) => `<li data-light="${k}" title="${esc(LIGHT_TITLE[k] || w)}"><i class="mx-dotl" data-light="${k}"></i><b>${counts[k] || 0}</b> ${esc(LEGEND_WORD[k] || w)}</li>`).join("")}</ul></section>
  ${flows}${move}${LISTS_MARK}
  <section class="mx-sec u-sr" id="mx-keys"><h4 class="mx-k">Keys</h4><p class="mx-note mx-kbd"><kbd>&larr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close <kbd>F</kbd> find <kbd>+</kbd><kbd>&minus;</kbd> zoom <kbd>0</kbd> fit <kbd>\\</kbd> canvas alone</p></section>
  ${o.version ? `<p class="mx-model">Published v${esc(o.version.n)}</p>` : ""}
</div>`;
}

// ---- the node list (assistive tech; a phone's main surface) ----
function nodeList(L, pinned) {
  const cols = L.cols.map((c) => {
    const groups = c.g.map((gi) => {
      const g = L.groups[gi];
      const items = g.m.map((i) => { const n = L.nodes[i]; return `<li><a href="${orgPath(`/map?node=${encodeURIComponent(n.r)}`)}" data-i="${i}" data-light="${n.l}"${i === pinned ? ' aria-current="true"' : ""}><i></i>${txt(n.n)}</a></li>`; }).join("");
      const label = g.label || c.label;
      return c.g.length > 1 || g.fold
        ? `<details class="mx-lg" data-g="${gi}"${g.m.includes(pinned) ? " open" : ""}><summary><span>${txt(label)}</span><b>${g.m.length}</b></summary><ul>${items}</ul></details>`
        : `<ul>${items}</ul>`;
    }).join("");
    return `<section class="mx-lc" data-col="${esc(c.k)}" data-layer="${esc(c.layer)}"><h3 class="mx-k">${esc(c.label)} <span>${c.n}</span></h3>${groups}</section>`;
  }).join("");
  return `<details class="mx-listwrap" id="mx-listwrap" data-region="node-list"><summary class="mx-ls">Every node, as a list <b>${L.nodes.length}</b></summary><nav class="mx-list" aria-label="Every node on the map">${cols}</nav></details>`;
}

// ---- the page ----
// renderMapPage(o) -> the page's content (the route wraps it in the shell, full width, no view bar).
//   o: { view: "canvas" | "arch" | "mcp", state: "ok" | "unreachable", project, head, version, anonymous,
//        L (layoutOf), model, on (layers), open (group ids), pin (node index), inspector (the pinned node's HTML), flow (index),
//        since (the lights poll's start), arch (the arch plane body), architecture (the canvas's architecture part: its
//        diagram, crossing rules, summary and services; `diagram` alone still draws), mcp (body) }
// noModelState(o) -> the canvas of a project that declares it holds no product model (D1b item 19): the sentence, the ruling's
// own words, and what the project does hold, each a link to where it shows; one quiet way to undo the declaration
function noModelState(o) {
  const h = o.holds || {}, n = (k) => Number(h[k]) || 0, P = (k) => (o.project ? `?project=${encodeURIComponent(o.project)}` : "");
  const plural = (v, one, many) => `${v} ${v === 1 ? one : many}`;
  const held = [
    n("flows") ? `<li><a class="u-link" href="${orgPath(`/map/flows${P()}`)}">${esc(plural(n("flows"), "flow", "flows"))}</a> on the Flows view</li>` : "",
    n("goals") ? `<li><a class="u-link" href="${orgPath(`/goals${P()}`)}">${esc(plural(n("goals"), "goal", "goals"))}</a> on Goals</li>` : "",
    n("gtm") || n("gtm_docs") || n("cards") ? `<li><a class="u-link" href="${orgPath(`/gtm${P()}`)}">its go-to-market</a>${n("gtm_docs") ? `: ${esc(plural(n("gtm_docs"), "strategy doc", "strategy docs"))}` : ""}${n("cards") ? `${n("gtm_docs") ? "," : ":"} ${esc(plural(n("cards"), "card", "cards"))}` : ""}${n("gtm") ? ", its GTM template" : ""}</li>` : "",
  ].filter(Boolean).join("");
  return `<div class="state state-empty" data-state="declared"><div class="state-body"><p class="state-what" title="This project holds no product model, by design.">No product model, by design</p>`
    + (o.noModel.why ? `<p class="mx-note">${txt(o.noModel.why)}</p>` : "")
    + (held ? `<p class="mx-note">What it holds:</p><ul class="mx-holds">${held}</ul>` : `<p class="mx-note">Nothing else is filed here yet: <a class="u-link" href="${orgPath(`/missing`)}">What is missing</a> lists what it needs.</p>`)
    + `</div></div>`;   // (the how-to sentence removed: pristine copy, owner 2026-10-02)
}
export function renderMapPage(o = {}) {
  const view = VIEWS.some(([k]) => k === o.view) ? o.view : "canvas";
  const bar = toolbar({ ...o, view });
  if (view === "arch") return `${CSS}<div class="mx mx-v" id="mx" data-screen="map" data-view="arch">${bar}${renderArchView({ arch: o.arch, architecture: o.architecture || (o.diagram ? { diagram: o.diagram } : null), project: o.project, client: ARCH_CLIENT })}</div>`;
  if (view === "mcp") return `${CSS}<div class="mx mx-v" id="mx" data-screen="map" data-view="mcp">${bar}${mcpView(o)}</div>`;
  if (o.state === "unreachable" || !o.L) {
    return `${CSS}<div class="mx" id="mx" data-screen="map" data-view="canvas">${bar}<div class="mx-body"><section class="mx-stage mx-stage-state" data-region="canvas">${unreachableState({ what: MAP_DOWN })}</section>
    <div class="mx-side"><aside class="mx-insp" id="mx-insp" data-region="inspector"><p class="mx-note">The inspector shows a node once the map is read.</p></aside></div></div></div>`;
  }
  const L = o.L;
  const ov = overviewOf(o);
  const pinned = o.pin == null ? -1 : o.pin;
  const insp = o.inspector
    ? `<aside class="mx-insp is-node" id="mx-insp" data-region="inspector" aria-label="Inspector"><div class="mx-ih"><button type="button" class="mx-x" data-button="unpin" data-client="closes the inspector (Esc)" aria-label="Close">&times;</button></div>${o.inspector}</aside>`
    : `<aside class="mx-insp" id="mx-insp" data-region="inspector" aria-label="Inspector">${o.impactPanel || ""}${ov}</aside>`;
  if (o.noModel) return `${CSS}<div class="mx" id="mx" data-screen="map" data-view="canvas">${bar}<div class="mx-body"><section class="mx-stage mx-stage-state" data-region="canvas" data-model="none">${noModelState(o)}</section>
    <div class="mx-side">${insp}</div></div></div>`;
  if (!L.nodes.length) {
    return `${CSS}<div class="mx" id="mx" data-screen="map" data-view="canvas">${bar}<div class="mx-body"><section class="mx-stage mx-stage-state" data-region="canvas">${empty("No screen yet", { title: MAP_EMPTY, action: { html: copyBtn('preview { items: [{ kind: "node", op: "upsert", data: { id: "screen:<id>", type: "screen", name } }] }, then file', { label: "Copy the call", title: "Copy the call that files a screen" }) } })}</section>
    <div class="mx-side">${insp}</div></div></div>`;
  }
  const data = { L, on: o.on, open: o.open || {}, pin: pinned >= 0 ? pinned : null, flow: o.flow == null ? -1 : o.flow, since: o.since || "",
    minW: MIN_W, minH: MIN_H, kinds: KIND_WORD, lightWord: LIGHT_WORD, ...(o.imp ? { imp: o.imp } : {}) };
  return `${CSS}<div class="mx" id="mx" data-screen="map" data-view="canvas">${bar}
<div class="mx-body">${canvas({ L, on: o.on, open: o.open, pin: pinned, imp: o.imp })}
<div class="mx-side">${insp}${nodeList(L, pinned)}</div></div>
${o.inspector ? `<template id="mx-ovt">${ov}</template>` : ""}
<script type="application/json" id="mx-data">${json(data)}</script>
<script>${MAP_CLIENT}</script></div>`;
}

// ---- the Arch view: src/archview.js (the layered diagram, alive: the open, the dots, hover, pin, Play) ----

// ---- the MCP view: the worker's tools as a list of the parts (L4): one line each (its name, who may call it, read or write),
// opened in place to what it takes and what it does (the registry's own description, its backticks dropped) ----
const unTick = (s) => noDash(String(s || "").replace(/`([^`]*)`/g, "$1"));
function mcpView(o) {
  const b = o.mcp || {}, R = b.regions || {};
  const tools = R["mcp-tools"] || [], shelf = R["workspace-shelf"] || [], presets = R["global-presets"] || [];
  const toolLine = (t) => line({ attrs: `data-tool="${esc(t.name)}" data-callable="${t.callable ? "yes" : "no"}"`, titleHtml: `<code class="mx-tool">${esc(t.name)}</code>`, title: t.name,
    meta: `${chip(t.owner ? "Owner" : "Anyone seated", { title: t.owner ? "Only the org's owner may call it" : "Anyone seated on the project may call it" })}${chip(t.write ? "Write" : "Read")}${t.callable ? "" : chip("Not for you", { tone: "bad" })}`,
    detail: lineDetail({ facts: [["Takes", (t.args || []).length ? `<code>${esc((t.args || []).join(", "))}</code>` : "nothing"]], body: t.desc ? `<p>${esc(unTick(t.desc))}</p>` : "" }) });
  const tbl = tools.length ? lines(tools.map(toolLine), { compact: true }) : empty("No tool");
  const shelfRows = shelf.length ? `<ul class="mx-rows">${shelf.map((x) => `<li class="mx-shelf" data-item="${esc(x.slug)}" data-state="${esc(x.state)}"><a href="${esc(x.href)}" data-button="open-item" data-door="GET /contribution/:id">${esc(x.slug)}</a><span class="mx-rm">${esc(x.kind || "")} v${esc(x.v)}</span></li>`).join("")}</ul>` : emptyState("Nothing equipped", { quiet: true });
  // the starter pack (sprint 2): the items built into the engine, each with the same Equip as Broadcast (POST /broadcast/equip)
  const pkey = (b.project && (b.project.key || b.project)) || "";
  const presetRows = presets.length ? `<ul class="mx-rows mx-presets">${presets.map((x) => {
    const h = x.here || {}, can = x.can || {};
    const act = h.state === "current" ? `<span class="mx-rm mx-held">equipped v${esc(h.v)}</span>`
      : `<form method="post" action="${orgPath(`/broadcast/equip`)}"><input type="hidden" name="slug" value="${esc(x.equipSlug)}"><input type="hidden" name="v" value="${esc(x.v)}"><input type="hidden" name="project" value="${esc(typeof pkey === "string" ? pkey : "")}"><button type="submit" class="mx-b mx-b-sm" data-button="${h.state === "update" ? "update-version" : "equip-preset"}" data-door="POST /broadcast/equip"${can.equip || can.update ? "" : ` disabled title="${esc(can.reason || "Not available.")}"`}>${h.state === "update" ? `Update to v${esc(x.v)}` : "Equip"}</button></form>`;
    return `<li class="mx-preset" data-preset="${esc(x.slug)}" data-kind="${esc(x.kind)}" data-state="${esc(h.state || "none")}"><span class="mx-pk">${esc(x.kind)}</span><a href="${esc(x.href)}" data-button="open-preset" data-door="GET /broadcast/starter/:slug" title="${esc(x.purpose || "")}">${esc(x.title)}</a>${act}</li>`;
  }).join("")}</ul>` : emptyState("No starter item", { quiet: true });
  return `<div class="mx-page">
  <div class="mx-panel mx-mcpmain">${card({ label: "MCP tools", count: tools.length, flush: true, region: "mcp-tools", attrs: 'title="Every tool this worker serves, read off its own registry: what it takes, what it does and whether you can call it"',
    action: copyBtn("claude mcp add --transport http sharingu <this worker>/mcp", { label: "Copy the connect line", title: "Adds this worker to Claude Code" }), body: tbl })}</div>
  <aside class="mx-panel mx-archside"><section class="mx-sec" data-region="workspace-shelf"><h4 class="mx-k">This project's shelf${shelf.length ? ` <span>${shelf.length}</span>` : ""}</h4>${shelfRows}</section>
  <section class="mx-sec" data-region="global-presets"><h4 class="mx-k" title="Built into sharingu, the same for every org. Equip copies one into this project as a doc its AI reads.">The starter pack <span>${presets.length}</span></h4>${presetRows}</section></aside>
</div>`;
}

// ---- the page's own sheet: semantic tokens only (Paper and Ink from the same names); the Screens view carries it too ----
export const CSS = `<style>
.mx{--mx-side:300px;--mx-bar:40px;display:flex;flex-direction:column;flex:1;min-height:0;height:100%;color:var(--text);background:var(--page)}
.mx-bar{flex:none;display:flex;align-items:center;gap:10px;min-height:var(--mx-bar);padding:5px 12px;border-bottom:1px solid var(--line);background:var(--page);position:relative;z-index:5}
.mx-layers,.mx-views,.mx-lights,.mx-zoom{display:flex;align-items:center;gap:2px;flex:none}
.mx-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border:1px solid transparent;border-radius:7px;background:none;font:500 12px/1 var(--sans);color:var(--text-muted);cursor:pointer;white-space:nowrap;transition:background-color var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease)}
.mx-pill b{font:500 11px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.mx-pill:hover{background:var(--hover);color:var(--text)}
.mx-pill[aria-pressed="true"]{background:var(--well);border-color:var(--line);color:var(--text)}
.mx-pill[aria-pressed="true"] b{color:var(--text-muted)}
.mx-pill[data-empty]{opacity:.55}
.mx-views{padding:2px;border:1px solid var(--line);border-radius:8px;background:var(--well)}
.mx-view{height:22px;display:inline-flex;align-items:center;padding:0 9px;border-radius:6px;font:500 12px/1 var(--sans);color:var(--text-muted)}
.mx-view:hover{color:var(--text)}
.mx-view[aria-current="page"]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line-strong)}
.mx-light{position:relative;isolation:isolate;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 6px;border:0;border-radius:6px;background:none;font:500 11px/1 var(--sans);color:var(--text-muted);cursor:pointer;font-variant-numeric:tabular-nums}
.mx-light:hover{background:var(--hover);color:var(--text)}
.mx-light i,.mx-dotl{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:var(--stone)}
.mx-light[aria-pressed="false"]{opacity:.45}
.mx-light[aria-pressed="false"] b{text-decoration:line-through}
[data-light="green"]>i,.mx-dotl[data-light="green"]{background:var(--ok)}
[data-light="amber"]>i,.mx-dotl[data-light="amber"]{background:var(--needs)}
[data-light="red"]>i,.mx-dotl[data-light="red"]{background:var(--err)}
.mx-dotl[data-light="grey"],[data-light="grey"]>i{background:transparent;box-shadow:inset 0 0 0 1.5px var(--stone)}
.mx-find{position:relative;display:flex;align-items:center;flex:0 1 200px;min-width:96px;height:26px;border:1px solid var(--line);border-radius:7px;background:var(--surface)}
.mx-find:focus-within{border-color:var(--line-strong);box-shadow:0 0 0 2px var(--accent-tint)}
.mx-find svg{width:13px;height:13px;margin:0 0 0 8px;flex:none;fill:none;stroke:var(--text-faint);stroke-width:2;stroke-linecap:round}
.mx-find input{flex:1;min-width:0;height:100%;border:0;background:none;padding:0 6px;font:400 11px/1 var(--mono);color:var(--text);outline:none}
.mx-find input::-webkit-search-cancel-button{display:none}
.mx-find input::placeholder{color:var(--text-faint)}
.mx-find kbd,.mx-kbd kbd{font:500 10px/1 var(--mono);color:var(--text-faint);border:1px solid var(--line);border-radius:4px;padding:2px 4px;margin:0 6px 0 0}
.mx-qn{font:500 10.5px/1 var(--sans);color:var(--text-muted);margin:0 6px 0 0;font-variant-numeric:tabular-nums}
.mx-qn:empty{display:none}
.mx-sp{flex:1}
.mx-zoom{gap:0;border:1px solid var(--line);border-radius:7px;background:var(--surface)}
.mx-z{height:24px;min-width:24px;padding:0 6px;border:0;background:none;font:500 13px/1 var(--sans);color:var(--text-muted);cursor:pointer;border-radius:6px}
.mx-z:hover{background:var(--hover);color:var(--text)}
.mx-fit{font-size:12px;border-left:1px solid var(--line);border-radius:0 6px 6px 0}
.mx-zl{min-width:38px;text-align:center;font:500 11px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.mx-flowbar{display:flex;align-items:center;gap:8px;min-width:0}
.mx-flowbar[hidden]{display:none}
/* D2b: with the sheet beside the canvas, the flow's own Play and steps are in it: the bar's copy crowded the find box */
@media (min-width:861px){.mx-flowbar{display:none}}
.mx-flowbar .mx-b{height:26px}
.mx .version-chip{flex:none}
.mx-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) var(--mx-side);grid-template-rows:minmax(0,1fr)}
.mx-stage{position:relative;min-width:0;min-height:0;overflow:hidden;background:var(--page);cursor:grab;touch-action:none;outline:none}
.mx-stage:focus-visible{box-shadow:inset 0 0 0 1.5px var(--focus)}
.mx-stage.mx-drag{cursor:grabbing}
.mx-stage-state{cursor:default;padding:28px;touch-action:auto}
.mx-svg{display:block;width:100%;height:100%;user-select:none;-webkit-user-select:none}
.mx-l{fill:none}
.mx-links .mx-l{stroke:var(--line-strong);opacity:.75}
.mx-l.mx-lh{stroke:var(--text-muted);stroke-width:1.4;opacity:.9}
.mx-l.mx-lf{stroke:var(--text);stroke-width:2.2;opacity:.95;stroke-dasharray:5 4}
.mx-u{cursor:pointer}
.u-motion .mx-u{transition:opacity var(--dur-fast) var(--ease)}
.mx-nb{fill:transparent;stroke:none}
.mx-n:hover .mx-nb,.mx-n.mx-on .mx-nb{fill:var(--hover)}
.mx-n.mx-focus .mx-nb{fill:var(--hover);stroke:var(--focus);stroke-width:1.5}
.mx-n.mx-pin .mx-nb{fill:var(--accent-tint);stroke:var(--accent);stroke-width:1.5}
.mx-dot{fill:var(--stone)}
.mx-ring{fill:none;stroke:none}
.mx-n[data-light="grey"] .mx-dot{fill:var(--page);stroke:var(--stone);stroke-width:1.6}
.mx-n[data-light="green"] .mx-dot{fill:var(--ok)}
.mx-n[data-light="amber"] .mx-dot{fill:var(--needs)}
.mx-n[data-light="red"] .mx-dot{fill:var(--err)}
.mx-n[data-stale]:not([data-light="red"]) .mx-dot{fill:var(--page);stroke:var(--needs);stroke-width:2.4}
.mx-light[data-light="stale"]>i,.mx-dotl[data-light="stale"]{background:transparent;box-shadow:inset 0 0 0 2px var(--needs)}
.mx-dim-stale .mx-n[data-stale]{opacity:.14}
.mx-impact .mx-u:not(.mx-imp):not(.mx-imp2):not(.mx-pin){opacity:.16}
.mx-impact .mx-n.mx-imp2,.mx-impact .mx-c.mx-imp2{opacity:.62}
.mx-n.mx-imp .mx-nb{fill:var(--accent-tint);stroke:var(--accent);stroke-width:2}
.mx-imp-key[data-imp="touched"]{background:var(--accent)}
.mx-imp-key[data-imp="reached"]{background:var(--accent-tint);box-shadow:inset 0 0 0 1.5px var(--accent)}
.mx-impact-panel{margin:0 0 18px;padding:0 0 14px;border-bottom:1px solid var(--line)}
.mx-stale{margin:8px 0 0;font-size:12.5px;line-height:1.5;color:var(--text)}
.mx-stale a{color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
.mx-impact-panel .mx-acts{display:flex;gap:8px;margin:10px 0 0}
.mx-t{font:500 13px/1 var(--sans);fill:var(--text)}
.mx-n[data-st="planned"] .mx-t,.mx-n[data-st="retired"] .mx-t{fill:var(--text-muted)}
.mx-n[data-st="retired"] .mx-t{text-decoration:line-through}
.mx-cb{fill:var(--surface);stroke:var(--line);stroke-width:1}
.mx-c:hover .mx-cb,.mx-c.mx-on .mx-cb{stroke:var(--line-strong);fill:var(--hover)}
.mx-c.mx-focus .mx-cb{stroke:var(--focus);stroke-width:1.5}
.mx-ct{font:600 13px/1 var(--sans);fill:var(--text)}
.mx-cn{font:500 11.5px/1 var(--sans);fill:var(--text-muted);font-variant-numeric:tabular-nums}
.mx-cn.mx-cnh{fill:var(--text);font-weight:600}
.mx-chev{fill:none;stroke:var(--text-faint);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.mx-lb{fill:var(--stone);opacity:.5}
.mx-lb[data-light="green"]{fill:var(--ok);opacity:1}
.mx-lb[data-light="amber"]{fill:var(--needs);opacity:1}
.mx-lb[data-light="red"]{fill:var(--err);opacity:1}
.mx-hb{fill:transparent}
.mx-fold:hover .mx-hb{fill:var(--hover)}
.mx-ht{font:600 12px/1 var(--sans);fill:var(--text-muted)}
.mx-hn{font:500 10.5px/1 var(--sans);fill:var(--text-faint);font-variant-numeric:tabular-nums}
.mx-h:not(.mx-fold){cursor:default}
.mx-headbg{fill:var(--page);opacity:.94}
.mx-colt{font:500 11px/1 var(--mono);letter-spacing:.08em;fill:var(--text-faint)}
.mx-colc{font:500 11px/1 var(--sans);fill:var(--text-faint);opacity:.7;font-variant-numeric:tabular-nums}
.mx-colh{cursor:pointer}
.mx-colhit{fill:transparent}
.mx-colh:hover .mx-colt{fill:var(--text-muted)}
.mx-colh:hover .mx-colv{stroke:var(--text-muted)}
.mx-colv{stroke-width:1.4}
.mx-colh.mx-shut .mx-colv{transform-box:fill-box;transform-origin:center;transform:rotate(-90deg)}
.u-motion .mx-colv{transition:transform var(--dur-fast) var(--ease)}
.mx-c.mx-cs .mx-cb{fill:var(--well)}
.mx-far .mx-t,.mx-far .mx-ht,.mx-far .mx-hn,.mx-far .mx-ct,.mx-far .mx-cn,.mx-far .mx-chev{display:none}
.mx-far .mx-dot{transform-box:fill-box;transform-origin:center;transform:scale(1.5)}
.mx-hov .mx-u:not(.mx-on):not(.mx-pin){opacity:.28}
.mx-hov .mx-links{opacity:.25}
.mx-finding .mx-u:not(.mx-hit):not(.mx-pin){opacity:.16}
.mx-finding .mx-links{opacity:.2}
.mx-u.mx-hit .mx-nb,.mx-u.mx-hit .mx-cb{stroke:var(--text-muted);stroke-width:1.2}
.mx-dim-green .mx-n[data-light="green"],.mx-dim-amber .mx-n[data-light="amber"],.mx-dim-red .mx-n[data-light="red"],.mx-dim-grey .mx-n[data-light="grey"]{opacity:.14}
.mx-flowing .mx-u:not(.mx-fp):not(.mx-pin){opacity:.22}
.mx-flowing .mx-links{opacity:.18}
.mx-u.mx-fp .mx-nb,.mx-u.mx-fp .mx-cb{stroke:var(--text-muted);stroke-width:1.2}
.mx-fnum circle{fill:var(--surface);stroke:var(--text-muted);stroke-width:1.2}
.mx-fnum text{font:600 10px/1 var(--sans);fill:var(--text);font-variant-numeric:tabular-nums}
.mx-fnum.mx-fnow circle{fill:var(--accent);stroke:var(--accent)}
.mx-fnum.mx-fnow text{fill:var(--on-accent)}
.mx-u.mx-fcur .mx-nb,.mx-u.mx-fcur .mx-cb{fill:var(--accent-tint);stroke:var(--accent);stroke-width:1.8}
.u-motion .mx-ping .mx-ring{stroke:var(--accent);stroke-width:2;transform-box:fill-box;transform-origin:center;animation:u-ping 620ms var(--ease) 1}
.u-motion .mx-c.mx-ping .mx-cb{animation:u-fade 400ms var(--ease) 1}
.mx-mini{position:absolute;right:12px;bottom:12px;width:168px;height:108px;border:1px solid var(--line);border-radius:8px;background:color-mix(in srgb,var(--surface) 88%,transparent);box-shadow:var(--shadow-card);overflow:hidden;cursor:crosshair}
.mx-mini svg{display:block}
.mx-mr{fill:var(--line-strong);opacity:.8}
.mx-mr[data-light="green"]{fill:var(--ok)}.mx-mr[data-light="amber"]{fill:var(--needs)}.mx-mr[data-light="red"]{fill:var(--err)}
.mx-mv{fill:none;stroke:var(--text-muted);stroke-width:1.2}
.mx-mini.mx-mini-off{opacity:0;pointer-events:none}
.u-motion .mx-mini{transition:opacity var(--dur) var(--ease)}
.mx-side{min-width:0;min-height:0;overflow:auto;border-left:1px solid var(--line);background:var(--surface);overscroll-behavior:contain}
.mx-insp{padding:10px 14px 14px;font:400 13px/1.5 var(--sans);color:var(--text)}
.mx-insp[aria-busy="true"]{opacity:.85}
.mx-ih{display:flex;justify-content:flex-end;margin:-4px -6px 0 0;height:0;position:relative;z-index:1}
.mx-x{width:26px;height:26px;border:0;border-radius:6px;background:none;font:400 18px/1 var(--sans);color:var(--text-faint);cursor:pointer}
.mx-x:hover{background:var(--hover);color:var(--text)}
.mx-k{margin:0 0 4px;font:500 11px/1.4 var(--mono);letter-spacing:.04em;color:var(--text-faint)}
.mx-k span{margin-left:4px;color:var(--text-faint);opacity:.8}
.mx-title{margin:0 28px 6px 0;font:700 15px/1.3 var(--sans);letter-spacing:-.005em;color:var(--text);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.mx-what{margin:6px 0 8px;font:400 13px/1.5 var(--sans);color:var(--text-muted);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.mx-clamp>summary{display:block;list-style:none;cursor:pointer}
.mx-clamp>summary::-webkit-details-marker{display:none}
.mx-clamp .mx-what{-webkit-line-clamp:3;margin-bottom:2px}
.mx-clamp[open] .mx-what{display:block;overflow:visible}
.mx-more::after{content:"more";font:500 12px/1.4 var(--sans);color:var(--text-faint);text-decoration:underline;text-underline-offset:2px}
.mx-clamp[open] .mx-more::after{content:"less"}
.mx-note{margin:4px 0 8px;font:400 12px/1.5 var(--sans);color:var(--text-muted);overflow-wrap:anywhere}
.mx-note a,.mx-at a{color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:2px}
.mx-stats{display:flex;flex-wrap:wrap;gap:2px 10px;margin:2px 0 10px;font:400 12px/1.5 var(--sans);color:var(--text-muted)}
.mx-stats b{font:600 12px/1 var(--sans);color:var(--text);font-variant-numeric:tabular-nums}
.mx-sec{margin:12px 0 0;padding:10px 0 0;border-top:1px solid var(--line)}
.mx-legend{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font:400 12px/1.6 var(--sans);color:var(--text-muted)}
.mx-legend li{display:flex;align-items:center;gap:6px}
.mx-legend b{font:600 12px/1 var(--sans);color:var(--text);font-variant-numeric:tabular-nums}
.mx-rows{list-style:none;margin:0;padding:0;max-height:260px;overflow:auto}
.mx-row{display:flex;align-items:center;gap:8px;width:100%;min-height:28px;padding:4px 6px;margin:0 -6px;border:0;border-radius:6px;background:none;text-align:left;cursor:pointer;font:500 12px/1.3 var(--sans);color:var(--text)}
.mx-row:hover{background:var(--hover)}
.mx-rt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-rm{flex:none;font:400 11px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.mx-kbd{line-height:2}
.mx-kbd kbd{margin:0 1px}
.mx-model{margin:12px 0 0;font:400 11px/1.4 var(--mono);color:var(--text-faint)}
.mx-walk{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 0;padding:4px 8px;border:1px solid var(--line);border-radius:7px;background:var(--well);font:500 12px/1.3 var(--sans)}
.mx-walk .mx-step{font:500 12px/1.3 var(--sans);color:var(--text);background:none;border:0;padding:3px 0;cursor:pointer}
.mx-walk .mx-step[disabled]{color:var(--text-faint);cursor:default}
.mx-walk-n{font:500 11px/1 var(--sans);color:var(--text-muted);font-variant-numeric:tabular-nums}
.mx-node .state-chip{margin:0 6px 0 0}
.mx-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 4px;font:400 11px/1.4 var(--mono);color:var(--text-faint)}
.mx-checks{margin:4px 0 8px;font:400 12px/1.5 var(--sans);color:var(--text-muted)}
.mx-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 10px;margin:8px 0;font-size:12px}
.mx-facts dt{font:500 11px/1.6 var(--mono);color:var(--text-faint)}
.mx-facts dd{margin:0;font:400 12px/1.6 var(--mono);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-edges{list-style:none;margin:0 0 6px;padding:0}
.mx-edges li{display:flex;align-items:baseline;gap:8px;min-height:24px}
.mx-edges a{flex:1;min-width:0;font:400 12px/1.6 var(--sans);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:4px}
.mx-edges a:hover{text-decoration:underline;text-decoration-color:var(--line-strong)}
.mx-edges small{flex:0 1 auto;min-width:0;max-width:45%;font:400 11px/1.6 var(--mono);color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-acts{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}
.mx-acts form{margin:0}
.mx-b{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--line-strong);border-radius:7px;background:var(--surface);font:500 12px/1 var(--sans);color:var(--text);cursor:pointer;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.mx-b:hover{background:var(--hover)}
.mx-b[disabled]{opacity:.45;cursor:not-allowed}
.mx-b-go{background:var(--text);border-color:var(--text);color:var(--page)}
.mx-b-go:hover{background:color-mix(in srgb,var(--text) 84%,var(--page))}
.mx-play{display:flex;align-items:center;gap:6px;margin:10px 0}
.mx-stepn{margin-left:auto;font:500 11px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.mx-stepcard{padding:8px 10px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:7px;background:var(--well)}
.mx-steptext{margin:2px 0 4px;font:600 13px/1.45 var(--sans);color:var(--text);overflow-wrap:anywhere}
.mx-at{margin:2px 0;font:400 12px/1.5 var(--sans);color:var(--text-muted)}
.mx-steps{list-style:none;margin:10px 0 0;padding:0;max-height:300px;overflow:auto}
.mx-stp{display:flex;align-items:baseline;gap:8px;width:100%;padding:4px 6px;border:0;border-radius:6px;background:none;text-align:left;cursor:pointer;font:400 12px/1.4 var(--sans);color:var(--text-muted)}
.mx-stp b{flex:none;width:18px;font:500 11px/1.4 var(--sans);color:var(--text-faint);text-align:right;font-variant-numeric:tabular-nums}
.mx-stp:hover{background:var(--hover);color:var(--text)}
.mx-steps li[aria-current="step"] .mx-stp{background:var(--accent-tint);color:var(--text)}
.mx-listwrap{border-top:1px solid var(--line);padding:0 14px 14px}
.mx-ls{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;font:500 12px/1.3 var(--sans);color:var(--text-muted);cursor:pointer;list-style:none}
.mx-ls::-webkit-details-marker,.mx-lg>summary::-webkit-details-marker{display:none}
.mx-ls b,.mx-lg>summary b{font:500 11px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.mx-lc{margin:6px 0 10px}
.mx-lc ul{list-style:none;margin:0;padding:0}
.mx-lg>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px;padding:4px 6px;margin:0 -6px;border-radius:6px;font:600 12px/1.3 var(--sans);color:var(--text);cursor:pointer;list-style:none}
.mx-lg>summary span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-lg>summary:hover{background:var(--hover)}
.mx-list a{display:block;height:28px;padding:0 6px 0 22px;margin:0 -6px;border-radius:6px;font:400 12px/28px var(--sans);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative}
.mx-list a>i{position:absolute;left:7px;top:50%;margin-top:-4px;width:8px;height:8px;border-radius:50%}
.mx-list a:hover,.mx-list a[aria-current="true"]{background:var(--hover)}
.mx-page{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:0}
.mx-panel{min-width:0;padding:18px 20px}
.mx-archside{border-left:1px solid var(--line);background:var(--surface)}
.mx-rules{list-style:none;margin:0;padding:0}
.mx-rules li{padding:6px 0;border-top:1px solid var(--line);font:400 12.5px/1.5 var(--sans);color:var(--text)}
.mx-rules li:first-child{border-top:0}
.mx-rules small a{font:400 11px/1 var(--mono);color:var(--text-faint)}
.mx-tags{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 0}
.mx-tag{font:500 11px/1 var(--mono);padding:3px 7px;border-radius:999px;background:var(--well);color:var(--text-muted)}
.mx-mcpmain .mx-tool{font:500 12.5px/1.4 var(--mono);color:var(--text)}
.mx-shelf{display:flex;justify-content:space-between;gap:8px;padding:4px 0;font:400 12px/1.4 var(--mono)}
.mx-presets{max-height:none}
.mx-preset{display:flex;align-items:center;gap:8px;min-height:32px;padding:2px 0;border-top:1px solid var(--line)}
.mx-preset:first-child{border-top:0}
.mx-preset form{margin:0 0 0 auto}
.mx-preset>a{flex:1;min-width:0;font:500 12.5px/1.3 var(--sans);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-preset>a:hover{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:2px}
.mx-pk{flex:none;width:58px;font:500 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint)}
.mx-held{margin-left:auto;color:var(--ok)}
.mx-b-sm{height:24px;padding:0 9px;font-size:11.5px}
@media (max-width:1180px){.mx{--mx-side:280px}.mx-find{flex-basis:150px}.mx-zl{display:none}}
@media (max-width:1040px){.mx-lights{display:none}}
/* a phone: the toolbar wraps, the canvas is a sideways strip, the list is the page, the pinned node a bottom sheet */
@media (max-width:760px){
  .mx{height:auto;min-height:0}
  .mx-bar{flex-wrap:wrap;gap:6px;padding:6px 10px}
  .mx-layers{order:1;flex:1 1 100%;overflow-x:auto;scrollbar-width:none;margin:0 -10px;padding:0 10px}
  .mx-layers::-webkit-scrollbar{display:none}
  .mx-views{order:2}.mx-find{order:3;flex:1 1 120px}.mx-zoom,.mx-sp,.mx-lights,.mx .version-chip{display:none}
  .mx-flowbar{order:5}
  .mx-body{display:flex;flex-direction:column}
  .mx-stage{height:232px;overflow:auto;touch-action:pan-x pan-y;cursor:default;border-bottom:1px solid var(--line);-webkit-overflow-scrolling:touch}
  .mx-stage.mx-strip .mx-svg{max-width:none}
  .mx-side{display:flex;flex-direction:column}
  .mx-listwrap{order:-1;border-top:0;border-bottom:1px solid var(--line);padding:0 12px 10px}
  .mx-ls{display:none}
  .mx-stage-state{height:auto}
  .mx-mini{display:none}
  .mx-side{border-left:0;overflow:visible;background:var(--page)}
  .mx-insp{border-bottom:1px solid var(--line)}
  .mx-insp.is-node{position:fixed;left:0;right:0;bottom:0;z-index:60;max-height:72dvh;overflow:auto;background:var(--surface);border-radius:14px 14px 0 0;box-shadow:var(--shadow-pop);border:1px solid var(--line-strong);padding-top:16px}
  .mx-insp.is-node::before{content:"";position:absolute;top:6px;left:50%;width:36px;height:4px;margin-left:-18px;border-radius:2px;background:var(--line-strong)}
  .mx-list a{height:40px;line-height:40px;font-size:13.5px}
  .mx-lg>summary{min-height:42px}
  .mx-page{grid-template-columns:1fr}
  .mx-archside{border-left:0;border-top:1px solid var(--line)}
  .mx-panel{padding:14px 12px}
}
/* M1: the panel folded (html[data-fold~="panel"], src/shell.js FOLD_BOOT): the canvas takes the width, on every view */
html[data-fold~="panel"] .mx-body,html[data-fold~="panel"] .mx-page{grid-template-columns:minmax(0,1fr)}
html[data-fold~="panel"] .mx-body>.mx-side,html[data-fold~="panel"] .mx-archside{display:none}
/* a phone: the panel's fold ends the layers' row (the rail is a bar already, its fold hidden) */
@media (max-width:760px){.mx-bar>.p-fold{order:1}.mx-bar>.mx-layers{flex-basis:calc(100% - 44px);margin-right:0}}
.mx-holds{margin:4px 0 10px;padding:0 0 0 18px;font:500 13px/1.7 var(--sans);color:var(--text)}
[data-state="declared"] .mx-note{max-width:44em}
</style>`;
