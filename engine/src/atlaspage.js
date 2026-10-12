// src/atlaspage.js — the Map's Screens view, the atlas (sprint 2; docs/plan/LOOK.md "the screens atlas", ARCHITECTURE §11):
// GET /map/screens (a browser) draws it from the GET /map/screens answer (the contract, read for one app: ?surface=).
//
//   toolbar      (data-region="layers") the Map's own strip (src/mappage.js toolbar): the layers as links, the views with
//                Screens current, the version chip.
//   screens-bar  (data-region="screens-bar") one compact row: the apps (surfaces) that have a screen as pills with their
//                counts (a surface with none draws no pill), one app at a time (links: GET /map/screens?surface=); the state
//                every frame shows (the union of the app's states, the most shared first); Render / Wireframe; the light
//                filter; find; zoom and Fit.
//   canvas       (data-region="canvas") the board: each lane a row of frames (src/atlaslayout.js atlasLayout), each frame a
//                device at its proportions with its name and light above it, the transitions under them as one SVG. The
//                frames ARE the list assistive tech reads (a lane is a <section> with an <ol> of links to ?screen=<id>);
//                drawn at 100% they also work without script (the stage scrolls). src/atlasclient.js adopts the board:
//                the view (pan, zoom, pinch, fit, the minimap), what each frame shows by zoom, hover, pin, keys, find, the
//                full-size viewer. At phone width the lanes are a list of sideways-scrolling rows.
//   inspector    (data-region="inspector") the app's overview (counts, what the frames can show, the lanes, the lights,
//                the keys), or the pinned screen: the Map's ONE inspector (GET /map/node, src/mapnode.js renderInspector)
//                and under it this screen's states and renders (atlasKit block) with Open full size.
// A render's HTML is never put in this page: a frame or the viewer loads GET /render/<hash> in an <iframe sandbox> (no
// script, no same origin) or an <img>. Semantic tokens only; no em dash; every button on its door or data-client.
import { empty, copyBtn } from "./parts.js";
import { esc, unreachableState } from "./ui.js";
import { toolbar, CSS as MAP_CSS, LIGHT_WORD, STALE, LEGEND_WORD, LIGHT_TITLE } from "./mappage.js";
import { atlasKit } from "./atlaslayout.js";
import { ATLAS_CLIENT } from "./atlasclient.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "./project.js";   // sprint 13 (13.2): a page names a project by its slug, never its org-prefixed key

export const ATLAS_REGIONS = ["layers", "screens-bar", "canvas", "inspector"];
const LIGHTS = [["green", "passing"], ["amber", "partly graded"], ["red", "failing"], ["grey", "not graded"]];
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';
const plural = (n, w) => `${n} ${n === 1 ? w : w + "s"}`;
// no em dash on the page: an app's name as filed is drawn with a plain hyphen (the layout cuts every other string)
const noDash = (v) => String(v ?? "").replace(/\s*[\u2014\u2013]\s*/g, " - ");
const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
// the states the switch offers: those two or more screens share (a state one screen has is chosen in its viewer), at most 40
export const STATE_MENU = 40;
export function stateMenu(A) {
  const n = new Map();
  for (const f of A.f) for (const s of f.st) n.set(s, (n.get(s) || 0) + 1);
  const out = A.st.map((name, i) => ({ i, name, n: n.get(i) || 0 })).filter((x) => x.n > 1 || x.i === A.si || x.i === A.s0);
  // first: each screen in its own first state
  return [{ i: -1, name: "", n: A.f.length }].concat(out.slice(0, STATE_MENU), out.slice(STATE_MENU).filter((x) => x.i === A.si));
}
// the exact call that files a first screen and its render (one preview, two items; then file)
export const SCREEN_CALL = (project) => `preview {
  project: "${(project && projectSlug(project)) || "<project>"}",
  items: [
    { kind: "node", op: "upsert", data: { id: "screen:sign-in", type: "screen", name: "Sign in",
      data: { surface: "mobile", lane: "auth", step: 0, states: ["ready", "error"] } } },
    { kind: "render", op: "upsert", data: { screen: "screen:sign-in", state: "ready", format: "html", body: "<main>...</main>" } }
  ]
}, then file`;
// an app's key may be "" (the screens that name none): its surface= is kept
const qs = (o) => { const p = Object.entries(o).filter(([k, v]) => v != null && (v !== "" || k === "surface")); return p.length ? "?" + p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&amp;") : ""; };

// ---- the screens bar ----
// appsOf(board) -> the surfaces drawn as pills: those with at least one screen (the read lists every surface the project
// files; an app with no screen is noise in the bar)
export const appsOf = (board) => (board && Array.isArray(board.surfaces) ? board.surfaces : []).filter((s) => s && Number(s.screens) > 0);
function screensBar(o, A) {
  const b = o.board || {}, cur = A ? A.sf : "";
  const apps = appsOf(b).map((s) =>
    `<a class="mx-pill" href="${orgPath(`/map/screens${qs({ surface: s.key, project: o.project })}`)}" data-button="surface-switch" data-door="GET /map/:plane" data-surface="${esc(s.key)}"${s.key === cur ? ' aria-current="page"' : ""}>${esc(noDash(s.name || s.key || "Other screens"))}<b>${Number(s.screens) || 0}</b></a>`).join("");
  if (!A || !A.f.length) return `<div class="ax-bar" data-region="screens-bar"><nav class="ax-apps" aria-label="Apps">${apps || '<span class="ax-none">No app has a screen yet</span>'}</nav></div>`;
  const menu = stateMenu(A);
  const states = `<label class="ax-sel" title="The state every frame shows"><span>State</span><select id="ax-state" data-button="state-switch" data-client="shows every frame in this state" aria-label="The state every frame shows">${menu.map((x) => x.i < 0 ? `<option value=""${A.si < 0 ? " selected" : ""} title="Each screen in its own first state">first state</option>` : `<option value="${esc(A.st[x.i])}"${x.i === A.si ? " selected" : ""}>${esc(A.st[x.i])}${x.n > 1 ? ` (${x.n})` : ""}</option>`).join("")}</select></label>`;
  const mode = `<div class="mx-views ax-mode" role="group" aria-label="What the frames show">${[["render", "Render"], ["wire", "Wireframe"]].map(([k, w]) => `<button type="button" class="mx-view" data-button="render-mode" data-client="shows every frame as its ${k === "wire" ? "wireframe" : "real render"}" data-mode="${k}" aria-pressed="${A.mode === k ? "true" : "false"}">${w}</button>`).join("")}</div>`;
  const c = A.counts;
  const lights = `<div class="mx-lights" role="group" aria-label="Dim a light">${[...LIGHTS, ...(c.stale ? [STALE] : [])].map(([k, w]) => `<button type="button" class="mx-light" data-button="state-toggle" data-client="dims the screens of this light" data-show="${k}" data-light="${k}" aria-pressed="true" title="${c[k] || 0} ${w}. Press to dim them."><i></i><b>${c[k] || 0}</b><span class="u-sr"> ${w}</span></button>`).join("")}</div>`;
  const find = `<label class="mx-find">${SEARCH_ICON}<input type="search" id="ax-q" data-input-exception="search" placeholder="Find a screen" aria-label="Find a screen" autocomplete="off" spellcheck="false" value="${esc(o.find || "")}"><output id="ax-qn" class="mx-qn" aria-hidden="true"></output><kbd aria-hidden="true">F</kbd></label>`;
  const zoom = `<div class="mx-zoom" role="group" aria-label="Zoom"><button type="button" class="mx-z" data-button="zoom" data-client="zooms the board out" data-dir="out" aria-label="Zoom out">&minus;</button><output id="ax-zl" class="mx-zl">100%</output><button type="button" class="mx-z" data-button="zoom" data-client="zooms the board in" data-dir="in" aria-label="Zoom in">+</button><button type="button" class="mx-z mx-fit" data-button="fit" data-client="fits the board to the window">Fit</button></div>`;
  return `<div class="ax-bar" data-region="screens-bar"><nav class="ax-apps" aria-label="Apps">${apps}</nav>${states}${mode}${lights}${find}<span class="mx-sp"></span>${zoom}</div>`;
}

// ---- the board (the first paint: every frame placed and sized, outlines only; the client fills them by zoom) ----
function board(o, A) {
  const K = atlasKit();
  const href = (f) => orgPath(`/map/screens${qs({ surface: A.sf, screen: f.id, project: o.project })}`);
  const lanes = A.lanes.map((ln, li) => {
    const frames = ln.m.map((i) => {
      const f = A.f[i];
      const im = o.imp ? (o.imp.t[i] ? " ax-imp" : o.imp.r[i] ? " ax-imp2" : "") : "";
      return `<li class="ax-f${i === o.pin ? " ax-pin" : ""}${im}" data-i="${i}" data-light="${f.l}"${f.z ? ` data-stale="${f.z}"` : ""}${f.s ? ` data-st="${esc(f.s)}"` : ""} style="left:${f.x}px;top:${f.y}px"><a class="ax-cap" href="${href(f)}" data-i="${i}" tabindex="-1" title="${esc(f.n)}${f.s ? ` (${esc(f.s)})` : ""}${f.z ? ` (${f.z} stale)` : ""}"><i></i><span>${esc(f.n)}</span></a><div class="ax-dev"><div class="ax-plate"${f.rs.length || f.w ? "" : ' data-cover="none"'}><b>${esc(f.n)}</b>${f.rs.length || f.w ? "" : "<span>No picture yet</span>"}</div><span class="ax-tag"></span></div></li>`;
    }).join("");
    return `<section class="ax-lane" data-lane="${esc(ln.k)}" aria-labelledby="ax-l${li}"><h3 class="ax-lh" id="ax-l${li}" style="left:${ln.x}px;top:${ln.top}px"><span>${esc(ln.n)}</span><b>${ln.m.length}</b></h3><ol class="ax-row">${frames}</ol></section>`;
  }).join("");
  return `<section class="mx-stage ax-stage${o.imp ? " ax-impact" : ""}" id="ax-stage" data-region="canvas" tabindex="0" aria-roledescription="board" aria-label="The screens of ${esc(o.surfaceName || A.sf)}: ${esc(plural(A.f.length, "screen"))} in ${esc(plural(A.lanes.length, "lane"))}. Arrow keys move between them, Enter opens, Escape closes." aria-describedby="ax-keys">
  <div class="ax-world" id="ax-world" style="--fw:${A.dev.fw}px;--fh:${A.dev.fh}px;--ax-ar:${A.dev.w}/${A.dev.h};width:${A.W}px;height:${A.H}px" data-device="${A.dev.kind}">
    <svg class="ax-edges" id="ax-edges" width="${A.W}" height="${A.H}" viewBox="0 0 ${A.W} ${A.H}" aria-hidden="true" focusable="false"><g id="ax-el">${K.edges(A)}</g><g id="ax-eh"></g></svg>
    ${lanes}
    <div class="ax-lab" id="ax-lab" aria-hidden="true"></div>
  </div>
  <div class="mx-mini" id="ax-mini" aria-hidden="true"></div>
  <div class="ax-view" id="ax-view" role="dialog" aria-modal="true" aria-label="The screen, full size" hidden></div>
  <p class="u-sr" id="ax-live" aria-live="polite"></p>
</section>`;
}

// ---- the inspector's overview ----
function overview(o, A) {
  const c = A.counts, cv = A.cover, tot = Math.max(1, A.f.length);
  const bar = [["render", cv.render, "a real render"], ["wire", cv.wire, "a wireframe only"], ["none", cv.none, "nothing yet"]].filter(([, n]) => n)
    .map(([k, n, w]) => `<i class="ax-cv" data-cover="${k}" style="flex:${n}" title="${n} ${w}"></i>`).join("");
  const lanes = A.lanes.map((ln, li) => `<li><button type="button" class="mx-row" data-button="lane-pick" data-client="fits the board to this lane" data-lane="${li}" title="${esc(ln.n)}"><span class="mx-rt">${esc(ln.n)}</span><span class="mx-rm">${ln.m.length}</span></button></li>`).join("");
  return `<div class="mx-ov ax-ov">
  <p class="mx-k">The screens of ${esc((o.project && projectSlug(o.project)) || "this project")} · ${esc(o.surfaceName || A.sf)}</p>
  <p class="mx-stats"><span><b>${A.f.length}</b> ${A.f.length === 1 ? "screen" : "screens"}</span><span><b>${A.lanes.length}</b> ${A.lanes.length === 1 ? "lane" : "lanes"}</span><span><b>${A.e.length / 3}</b> ${A.e.length === 3 ? "transition" : "transitions"}</span><span><b>${A.st.length}</b> ${A.st.length === 1 ? "state" : "states"}</span></p>
  <section class="mx-sec" data-region="renders"><h4 class="mx-k" title="Far out a frame is its outline; closer, its wireframe or its picture; close, its real render${A.dev.kind === "wide" ? ", a wide screen" : ", a phone"} at ${A.dev.w} × ${A.dev.h}">What the frames can show</h4><div class="ax-cvbar">${bar}</div>
  <ul class="mx-legend ax-cvl"><li title="a real render"><i class="ax-cv" data-cover="render"></i><b>${cv.render}</b> render</li><li title="a wireframe only"><i class="ax-cv" data-cover="wire"></i><b>${cv.wire}</b> wireframe</li>${cv.none ? `<li title="nothing to show yet"><i class="ax-cv" data-cover="none"></i><b>${cv.none}</b> none</li>` : ""}</ul>
</section>
  <section class="mx-sec"><h4 class="mx-k">Lanes <span>${A.lanes.length}</span></h4><ul class="mx-rows${A.lanes.length <= 14 ? " ax-lanes" : ""}">${lanes}</ul></section>
  <section class="mx-sec"><h4 class="mx-k" title="A hollow amber ring is stale: a check was graded before the screen last changed">Lights</h4><ul class="mx-legend">${[...LIGHTS, STALE].map(([k, w]) => `<li data-light="${k}" title="${esc(LIGHT_TITLE[k] || w)}"><i class="mx-dotl" data-light="${k}"></i><b>${c[k] || 0}</b> ${esc(LEGEND_WORD[k] || w)}</li>`).join("")}</ul></section>
  <section class="mx-sec u-sr" id="ax-keys"><h4 class="mx-k">Keys</h4><p class="mx-note mx-kbd"><kbd>&larr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd> move <kbd>Enter</kbd> open, again full size <kbd>Esc</kbd> close <kbd>F</kbd> find <kbd>+</kbd><kbd>&minus;</kbd> zoom <kbd>0</kbd> fit</p></section>
</div>`;
}

// ---- the page ----
// renderAtlasPage(o) -> the page's content (the route wraps it in the shell, full width, no view bar).
//   o: { state: "ok" | "unreachable", project, head, anonymous, board (the GET /map/screens body), A (atlasLayout of it),
//        surfaceName, pin (frame index), inspector (the pinned screen's GET /map/node HTML), full (open the viewer), find,
//        since (the lights poll's start), imp ({t, r}: the frames a contribution touched and those one hop out, ?impact=),
//        impactPanel (its inspector panel) }
export function renderAtlasPage(o0 = {}) {
  const o = { ...o0, surfaceName: noDash(o0.surfaceName) };
  const A = o.A || null;
  const bar = toolbar({ ...o, view: "screens" });
  const shell = (bodyHtml, side) => `${MAP_CSS}${CSS}<div class="mx ax" id="mx" data-screen="map" data-view="screens"${A ? ` data-surface="${esc(A.sf)}"` : ""}>${bar}${screensBar(o, A)}<div class="mx-body">${bodyHtml}<div class="mx-side">${side}</div></div>`;
  const side0 = (t) => `<aside class="mx-insp" id="mx-insp" data-region="inspector" aria-label="Inspector"><p class="mx-note">${esc(t)}</p></aside>`;
  if (o.state === "unreachable" || !o.board) {
    return `${shell(`<section class="mx-stage mx-stage-state" data-region="canvas">${unreachableState({ what: "The project's screens could not be read, so no frame is drawn until they answer." })}</section>`, side0("The inspector shows a screen once the screens are read."))}</div>`;
  }
  if (!A || !A.f.length) {
    // no app with a screen (no surface at all, or surfaces with none): the project's own EMPTY; else the app asked has none
    const none = !appsOf(o.board).length;
    // copy: off-screen (the empty's title: the whole sentence; the page says the phrase)
    const what = none ? "No screen is filed for this project yet, so no app is drawn. File a screen node and its render with one call."
      : `${o.surfaceName || "This app"} has no screen yet. File one with the call.`;
    const phrase = none ? "No screen yet" : `${o.surfaceName || "This app"}: no screen yet`;
    return `${shell(`<section class="mx-stage mx-stage-state" data-region="canvas">${empty(phrase, { title: what, action: { html: copyBtn(SCREEN_CALL(o.project), { label: "Copy the call", title: "Copy the call that files a screen and its render" }) } })}</section>`, side0("One row of pills per app"))}</div>`;
  }
  const K = atlasKit();
  const pinned = o.pin != null && o.pin >= 0 && A.f[o.pin] ? o.pin : -1;
  const ov = overview(o, A);
  const insp = pinned >= 0
    ? `<aside class="mx-insp is-node" id="mx-insp" data-region="inspector" aria-label="Inspector"><div class="mx-ih"><button type="button" class="mx-x" data-button="unpin" data-client="closes the inspector (Esc)" aria-label="Close">&times;</button></div>${o.inspector || ""}${K.block(A, pinned, A.si)}</aside>`
    : `<aside class="mx-insp" id="mx-insp" data-region="inspector" aria-label="Inspector">${o.impactPanel || ""}${ov}</aside>`;
  const data = { A, pin: pinned, full: !!o.full && pinned >= 0, since: o.since || "", lightWord: LIGHT_WORD, ...(o.imp ? { imp: 1 } : {}) };
  return `${shell(board(o, A), insp)}
${pinned >= 0 ? `<template id="ax-ovt">${ov}</template>` : ""}
<script type="application/json" id="ax-data">${json(data)}</script>
<script>${ATLAS_CLIENT}</script></div>`;
}

// ---- the Screens view's own sheet: semantic tokens only; the Map's sheet (src/mappage.js) is under it ----
const CSS = `<style>
.ax{--ax-dot:color-mix(in srgb,var(--text) 15%,transparent)}
.ax-bar{flex:none;display:flex;align-items:center;gap:10px;min-height:38px;padding:4px 12px;border-bottom:1px solid var(--line);background:var(--page);position:relative;z-index:5}
.ax-apps{display:flex;align-items:center;gap:2px;flex:none}
.ax-apps .mx-pill[aria-current="page"]{background:var(--well);border-color:var(--line);color:var(--text)}
.ax-apps .mx-pill[aria-current="page"] b{color:var(--text-muted)}
.ax-none{font:400 12px/1 var(--sans);color:var(--text-faint)}
.ax-sel{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 4px 0 9px;border:1px solid var(--line);border-radius:7px;background:var(--surface);font:500 11px/1 var(--mono);color:var(--text-faint);flex:none}
.ax-sel select{max-width:170px;min-width:0;field-sizing:content;height:24px;border:0;background:none;font:500 12px/1 var(--sans);color:var(--text);cursor:pointer;outline:none}
.ax-sel:focus-within{border-color:var(--line-strong);box-shadow:0 0 0 2px var(--accent-tint)}
.ax-mode .mx-view{border:0;background:none;cursor:pointer}
.ax-mode .mx-view[aria-pressed="true"]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line-strong)}
.ax-stage{background-color:var(--page);background-image:radial-gradient(circle,var(--ax-dot) 1px,transparent 1.4px);background-size:24px 24px}
.ax-stage.ax-ready{cursor:grab}
.ax-world{position:absolute;left:0;top:0;transform-origin:0 0;--k:1}
.ax-stage:not(.ax-ready){overflow:auto}
.ax-stage:not(.ax-ready) .ax-world{position:relative}
.ax-busy .ax-world{will-change:transform}
.ax-edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.ax-e{fill:none;stroke:var(--line-strong);stroke-width:1;vector-effect:non-scaling-stroke;opacity:.3}
.ax-e.ax-en{opacity:.95}
.ax-far .ax-e:not(.ax-en){opacity:.14}
.u-motion .ax-e,.u-motion .ax-f{transition:opacity var(--dur-fast) var(--ease)}
.ax-eo,.ax-ei{fill:none;vector-effect:non-scaling-stroke}
.ax-eo{stroke:var(--text);stroke-width:1.6}
.ax-ei{stroke:var(--text-muted);stroke-width:1.3;stroke-dasharray:5 4}
.ax-lane,.ax-row{position:absolute;left:0;top:0;width:0;height:0;margin:0;padding:0;list-style:none}
.ax-lh{position:absolute;margin:0;display:flex;align-items:baseline;gap:8px;white-space:nowrap;transform:scale(var(--k)) translateY(calc(-100% - 30px));transform-origin:0 0;font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
.ax-lh b{font-weight:500;color:var(--text-faint);letter-spacing:0}
.ax-f{position:absolute;width:var(--fw);height:var(--fh);outline:none}
.ax-cap{position:absolute;left:0;bottom:100%;display:flex;align-items:center;gap:6px;width:calc(var(--fw) / var(--k));height:20px;transform:scale(var(--k));transform-origin:0 100%;font:500 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);white-space:nowrap;overflow:hidden}
.ax-cap span{overflow:hidden;text-overflow:ellipsis}
.ax-cap i{flex:none;width:6px;height:6px;border-radius:50%;background:transparent;box-shadow:inset 0 0 0 1.2px var(--stone)}
.ax-f[data-light="green"] .ax-cap i{background:var(--ok);box-shadow:none}
.ax-f[data-light="amber"] .ax-cap i{background:var(--needs);box-shadow:none}
.ax-f[data-light="red"] .ax-cap i{background:var(--err);box-shadow:none}
.ax-dev{position:absolute;inset:0;overflow:hidden;border-radius:22px;background:var(--surface);box-shadow:0 0 0 calc(1px * var(--k)) var(--line-strong),0 6px 18px color-mix(in srgb,var(--text) 7%,transparent);contain:strict;cursor:pointer}
.ax-world[data-device="wide"] .ax-dev{border-radius:8px}
.ax-f:hover .ax-dev,.ax-f.ax-on .ax-dev{box-shadow:0 0 0 calc(1.5px * var(--k)) var(--text-muted),0 8px 22px color-mix(in srgb,var(--text) 10%,transparent)}
.ax-f.ax-focus .ax-dev{box-shadow:0 0 0 calc(2px * var(--k)) var(--focus)}
.ax-f.ax-pin .ax-dev{box-shadow:0 0 0 calc(2px * var(--k)) var(--accent),0 10px 28px color-mix(in srgb,var(--text) 12%,transparent)}
.ax-f.ax-pin .ax-cap{color:var(--text)}
.ax-f[data-st="retired"]{opacity:.45}
.ax-f[data-st="retired"] .ax-cap span{text-decoration:line-through}
.ax-tag{position:absolute;right:6px;top:6px;z-index:2;max-width:calc((var(--fw) - 12px) / var(--k));padding:3px 5px;border-radius:4px;background:color-mix(in srgb,var(--page) 86%,transparent);font:500 9px/1 var(--mono);letter-spacing:.04em;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transform:scale(var(--k));transform-origin:100% 0}
.ax-tag:empty{display:none}
.ax-r{position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none;background:var(--surface)}
img.ax-r{width:100%;height:auto;transform:none;background:none}
.ax-r[hidden],.ax-dev>.wf[hidden]{display:none}
.u-motion .ax-r,.u-motion .ax-dev>.wf{animation:u-fade var(--dur) var(--ease) backwards}
iframe.ax-r:not(.ax-in),img.ax-r:not(.ax-in){opacity:0}
.ax-dev>.wf:not([hidden])~.ax-plate{display:none}
.ax-stage:focus-visible{box-shadow:none}
.u-motion iframe.ax-r{transition:opacity var(--dur) var(--ease)}
.ax-dev>.wf{position:absolute;inset:0;width:100%;height:100%}
/* D2b item 5: a screen with no wireframe is a quiet plate with its name, never a blank frame: under its picture until the
   picture loads (a page render loads only close up), with "No picture yet" when it has none */
/* L4: a short lane list shows whole (the count above it and the rows agree at a glance) */
.ax-ov .mx-rows.ax-lanes{max-height:none}
.ax-plate{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--fw) / 60);padding:8%;text-align:center;background:repeating-linear-gradient(135deg,transparent 0 calc(var(--fw) / 40),color-mix(in srgb,var(--line) 45%,transparent) calc(var(--fw) / 40) calc(var(--fw) / 20))}
/* L4: the plate's name reads at every zoom (screen-sized through --k, as the captions are), so a frame whose picture has not
   landed yet is a named plate, never a blank box; it gives way to the picture */
.ax-stage .mx-mini.ax-mini-under{opacity:0;pointer-events:none}
.ax-plate b{font:600 max(calc(var(--fw) / 18), calc(12px * var(--k, 1)))/1.2 var(--sans);color:var(--text-muted);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ax-plate span{font:400 max(calc(var(--fw) / 28), calc(10px * var(--k, 1)))/1.2 var(--sans);color:var(--text-faint);max-width:100%;white-space:normal;overflow-wrap:anywhere}
.ax-far .ax-cap,.ax-far .ax-tag,.ax-mid .ax-tag{visibility:hidden}
.ax-far .ax-lh,.ax-tight .ax-lh{transform:scale(var(--k)) translateY(calc(-100% - 7px))}
.ax-tight .ax-cap{visibility:hidden}
.ax-far .ax-dev{box-shadow:0 0 0 calc(1px * var(--k)) var(--line-strong)}
.ax-far .ax-f[data-light="green"] .ax-dev{background:var(--ok-tint);box-shadow:0 0 0 calc(1.5px * var(--k)) var(--ok)}
.ax-far .ax-f[data-light="amber"] .ax-dev{background:var(--needs-tint);box-shadow:0 0 0 calc(1.5px * var(--k)) var(--needs)}
.ax-far .ax-f[data-light="red"] .ax-dev{background:var(--err-tint);box-shadow:0 0 0 calc(1.5px * var(--k)) var(--err)}
.ax-far .ax-f.ax-pin .ax-dev{box-shadow:0 0 0 calc(2.5px * var(--k)) var(--accent)}
.ax-hov .ax-f:not(.ax-on):not(.ax-pin){opacity:.32}
.ax-hov #ax-el .ax-e{opacity:.18}
.ax-finding .ax-f:not(.ax-hit):not(.ax-pin){opacity:.18}
.ax-finding #ax-el .ax-e{opacity:.15}
.ax-f.ax-hit .ax-dev{box-shadow:0 0 0 calc(1.5px * var(--k)) var(--text-muted)}
.ax-dim-green .ax-f[data-light="green"],.ax-dim-amber .ax-f[data-light="amber"],.ax-dim-red .ax-f[data-light="red"],.ax-dim-grey .ax-f[data-light="grey"]{opacity:.14}
.ax-f[data-stale]:not([data-light="red"]) .ax-cap i{background:transparent;box-shadow:inset 0 0 0 2px var(--needs)}
.ax-far .ax-f[data-stale]:not([data-light="red"]) .ax-dev{background:var(--page);box-shadow:0 0 0 calc(1.5px * var(--k)) var(--needs)}
.ax-dim-stale .ax-f[data-stale]{opacity:.14}
.ax-impact .ax-f:not(.ax-imp):not(.ax-imp2):not(.ax-pin){opacity:.18}
.ax-impact .ax-f.ax-imp2{opacity:.62}
.ax-f.ax-imp .ax-dev{box-shadow:0 0 0 calc(2.5px * var(--k)) var(--accent)}
.u-motion .ax-f.ax-ping .ax-cap i{animation:u-ping 620ms var(--ease) 1}
.ax-lab{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
.ax-el{position:absolute;padding:3px 6px;border:1px solid var(--line);border-radius:5px;background:var(--surface);font:500 10px/1 var(--mono);color:var(--text);white-space:nowrap;transform:translate(-50%,-50%) scale(var(--k));box-shadow:var(--shadow-card)}
.ax-el.ax-elin{color:var(--text-muted)}
.ax-ov .ax-cvbar{display:flex;gap:2px;height:6px;margin:6px 0 8px;border-radius:3px;overflow:hidden}
.ax-cv{display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--line-strong)}
.ax-cvbar .ax-cv{height:6px;border-radius:0;width:auto}
.ax-cv[data-cover="render"]{background:var(--text-muted)}
.ax-cv[data-cover="wire"]{background:var(--line-strong)}
.ax-cv[data-cover="none"]{background:var(--line)}
.ax-sb .mx-k{margin-top:12px}
.ax-chips{display:flex;flex-wrap:wrap;gap:4px;max-height:132px;overflow:auto;margin:2px 0 4px}
.ax-chip{display:inline-flex;align-items:center;gap:5px;height:22px;max-width:100%;padding:0 7px;border:1px solid var(--line);border-radius:6px;background:var(--surface);font:500 11px/1 var(--sans);color:var(--text-muted);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ax-chip:hover{background:var(--hover);color:var(--text)}
.ax-chip[aria-current="true"],.ax-chip[aria-pressed="true"]{border-color:var(--line-strong);background:var(--well);color:var(--text)}
.ax-chip i{flex:none;width:6px;height:6px;border-radius:50%;background:var(--line-strong)}
.ax-chip i[data-has="render"]{background:var(--text-muted)}
.ax-chip i[data-has="none"]{background:transparent;box-shadow:inset 0 0 0 1px var(--line-strong)}
.ax-rl{list-style:none;margin:0;padding:0;max-height:180px;overflow:auto}
.ax-rl li{display:flex;align-items:baseline;gap:8px;min-height:22px;font:400 12px/1.5 var(--sans);color:var(--text)}
.ax-rl li span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-muted)}
.ax-rl li small{flex:none;font:400 10.5px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.ax-view{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;background:color-mix(in srgb,var(--page) 95%,transparent);cursor:default}
.ax-view[hidden]{display:none}
.u-motion .ax-view:not([hidden]){animation:u-fade var(--dur) var(--ease)}
.ax-vh{flex:none;display:flex;align-items:center;gap:10px;padding:8px 12px 8px 16px;border-bottom:1px solid var(--line);background:var(--page)}
.ax-vt{flex:1;min-width:0}
.ax-vt .mx-k{margin:0}
.ax-vn{margin:2px 0 0;font:700 15px/1.3 var(--sans);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ax-vbar{flex:none;display:flex;align-items:center;gap:12px;padding:8px 16px;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none}
.ax-vbar::-webkit-scrollbar{display:none}
.ax-vbar .ax-chips{flex-wrap:nowrap;max-height:none;overflow:visible;margin:0}
.ax-vbar .mx-k{margin:0;flex:none}
.ax-vz{margin-left:auto;flex:none;font:500 11px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.ax-vs{flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:22px}
.ax-vd{position:relative;flex:none;overflow:hidden;border-radius:28px;background:var(--surface);box-shadow:0 0 0 1px var(--line-strong),var(--shadow-pop)}
.ax-vd[data-device="wide"]{border-radius:10px}
.ax-vd iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;background:var(--surface)}
.ax-vd img{display:block;width:100%;height:auto}
.ax-vd>.wf{display:block;width:100%;height:100%}
.ax-vd .ax-tag{transform:none;max-width:60%;font-size:10px}
.ax-vnone{display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;font:400 12px/1.5 var(--sans);color:var(--text-muted)}
@media (max-width:1180px){.ax-sel select{max-width:120px}}
@media (max-width:1040px){.ax-bar .mx-lights{display:none}}
/* a phone: the lanes are a list of sideways-scrolling rows of frames; a tap opens the viewer, which is the page */
@media (max-width:760px){
  .ax-bar{flex-wrap:wrap;gap:6px;padding:6px 10px}
  .ax-apps{order:1;flex:1 1 100%;overflow-x:auto;scrollbar-width:none}
  .ax-sel{order:2}.ax-mode{order:3}.ax-bar .mx-find{order:4;flex:1 1 120px}.ax-bar .mx-zoom,.ax-bar .mx-sp{display:none}
  .ax-stage,.ax-stage:not(.ax-ready){height:auto;overflow:visible;cursor:default;touch-action:auto;background-image:none;border-bottom:1px solid var(--line)}
  .ax-world,.ax-stage:not(.ax-ready) .ax-world{position:static;transform:none!important;width:auto!important;height:auto!important;--k:1}
  .ax-edges,.ax-lab,.ax-stage .mx-mini{display:none}
  .ax-lane{position:static;width:auto;height:auto;padding:14px 0 0}
  .ax-lh{position:static;transform:none;padding:0 12px}
  .ax-row{position:relative;display:flex;gap:14px;width:auto;height:auto;padding:30px 12px 14px;overflow-x:auto;scroll-snap-type:x proximity;scroll-padding:0 12px;scrollbar-width:none}
  .ax-row::-webkit-scrollbar{display:none}
  .ax-f{position:relative;left:auto!important;top:auto!important;flex:none;width:132px;height:auto;aspect-ratio:var(--ax-ar,390/844);scroll-snap-align:start}
  .ax-world[data-device="wide"] .ax-f{width:260px}
  .ax-cap{width:100%;transform:none}
  .ax-tag{transform:none}
  .ax-dev{border-radius:16px}
  .ax-view{position:fixed;inset:0;z-index:70;background:var(--page)}
  .ax-vs{padding:12px}
}
</style>`;
