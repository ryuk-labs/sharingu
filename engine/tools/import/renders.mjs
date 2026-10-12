// engine/tools/import/renders.mjs — a project's screens and their renders, mapped onto THE standard (docs/plan/
// ARCHITECTURE.md §11) from whatever its source holds (import/read-renders.mjs reads them). Every source-specific mapping
// lives here, never in the engine: the engine takes ONE format, through preview then file.
//   screenData(row, src)   a screen row's node data, standardized: data.surface a string (or a list of app keys for a screen
//                          several apps share), data.lane a string, data.step a number,
//                          data.states the state NAMES (the source's richer rows kept verbatim in data.stateDetails),
//                          data.wireframe the grammar (src/wireframe.js) built from the source's own layout fields;
//                          every other field of the row verbatim
//   mapRenders(src, opts)  `style` ops (a board's CSS families) and `render` ops (a board's html fragments, keyed screen ·
//                          state · variant; sharingu's wireframes; siru's atlas shots), each naming a screen node this
//                          import files
// The mapping per source:
//   board html (saruspay, bunny): PAYLOAD.html[k] is a render. Its screen and state: the screen whose wireframes[i].pid is
//     k (state = that wireframe's name), else whose pid is k (state ""), else an "art:" key's meta.ref, a "prop:<id>" key's
//     screen <id>, a "webp:<id>" key's web twin "webd:<id>" (else <id>). Its variant: wireframe (meta.wireframe), live
//     (meta.live), screenshot (meta.shot or embedded), proposed (meta.proposed; "proposed-web" for a webp: key with no web
//     twin), design (any other: a drawn artboard); a second render on the same screen · state · variant takes " 2", " 3".
//     Its style: the meta's CSS family (a `style` op each: the board app's own variables and its animation freeze, then the
//     family's CSS), none when the family is empty. Its size: meta.w × meta.h. The body: the fragment verbatim (the door
//     sanitises it).
//   wireframes (sharingu): each spec screen (source/board/sources/wireframe.json) is one render of format wireframe
//     (variant "wireframe"), the grammar from its regions and buttons; the same grammar is the screen node's data.wireframe.
//   atlas shots (siru): each mapped canon screen's shot is one html render (variant "screenshot"): an <img> of the shot's
//     own data:image URI at its own size.
import { result, nodeId, isObj } from "./common.mjs";
import { validateWireframe, WIREFRAME_MAX_BLOCKS, COUNT_MAX, LABEL_MAX } from "../../src/wireframe.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => typeof v === "string" && v.trim() !== "";
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));
// a label for the grammar: one line, at most LABEL_MAX characters
const label = (v) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t ? (t.length > LABEL_MAX ? t.slice(0, LABEL_MAX - 1) + "…" : t) : null; };
const human = (k) => label(String(k ?? "").replace(/[-_]+/g, " "));
// a state's name as the door takes it: one line, no "|", at most 120 characters
export const stateName = (v) => { const t = String(v ?? "").replace(/\|/g, "/").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim(); return t ? t.slice(0, 120).trim() : null; };

// reprItems(v) -> the objects of a list a board wrote as a Python repr string ("[{'label': 'Go', 'type': 'button'}]") or
// as JSON: each as {field: string value}
export function reprItems(v) {
  if (Array.isArray(v)) return v.filter(isObj);
  if (typeof v !== "string") return [];
  const out = [];
  for (const m of v.matchAll(/\{([^{}]*)\}/g)) {
    const o = {};
    for (const f of m[1].matchAll(/(['"])([A-Za-z_]+)\1\s*:\s*(?:(['"])((?:\\.|(?!\3)[^\\])*)\3|(True|False|None|-?\d+(?:\.\d+)?))/g)) o[f[2]] = f[4] !== undefined ? f[4].replace(/\\(.)/g, "$1") : f[5];
    if (Object.keys(o).length) out.push(o);
  }
  return out;
}

// stateNamesOf(row) -> the screen's state names, in order, once each: its states (names, rows with a name, or a repr
// string of them), then any wireframe frame's name not already there
export function stateNamesOf(row) {
  const names = [];
  const add = (v) => { const n = stateName(v); if (n && !names.includes(n)) names.push(n); };
  const st = row.states;
  if (Array.isArray(st)) for (const x of st) add(typeof x === "string" ? x : isObj(x) ? x.name : null);
  else for (const x of reprItems(st)) add(x.name);
  for (const w of arr(row.wireframes)) if (isObj(w)) add(w.name);
  return names.slice(0, 200);
}

// ---- the wireframe grammar, from each source's own layout fields ----
const done = (blocks) => { const b = blocks.filter(Boolean).slice(0, WIREFRAME_MAX_BLOCKS); const v = validateWireframe(b); return v.ok ? v.blocks : null; };
const blk = (kind, o = {}) => {
  const out = { kind };
  if (o.label != null) { const l = label(o.label); if (l) out.label = l; }
  if (o.lines != null) out.lines = clamp(o.lines, 1, COUNT_MAX);
  if (o.items != null) out.items = clamp(o.items, 1, COUNT_MAX);
  if (o.emphasis) out.emphasis = true;
  return out;
};
// a board screen (saruspay): its copy (the first line its title), its controls by their type, its tabs. A control's type:
// button, action -> a button (the first one leads) · link, text -> a line of text · input, toggle, checkbox, select -> an
// input · row, table -> a list (consecutive ones fold into one) · filter -> a nav (folded too) · card, stat -> a card ·
// banner -> an emphasized text · tab -> the tabbar's items · auto, system, nav -> not drawn (a redirect, a server rule, the
// shell's rail: nothing on the screen itself)
const BOARD_CONTROL = { button: "button", action: "button", link: "text", text: "text", input: "input", toggle: "input", checkbox: "input", select: "input",
  row: "list", table: "list", filter: "nav", card: "card", stat: "card", banner: "banner" };
export function wireframeFromBoardScreen(row) {
  const blocks = [blk("header", { label: row.name || row.id })];
  const copy = arr(row.copy).filter(str);
  if (copy[0]) blocks.push(blk("title", { label: copy[0] }));
  for (const c of copy.slice(1, 4)) blocks.push(blk("text", { label: c, lines: 1 }));
  const controls = reprItems(row.controls);
  let lead = true, run = null, drawn = 0;
  const flush = () => { if (run) { blocks.push(blk(run.kind, { items: run.n })); run = null; } };
  for (const c of controls) {
    const kind = BOARD_CONTROL[String(c.type || "").toLowerCase()];
    if (!kind || drawn >= 14) continue;
    if (kind === "list" || kind === "nav") { if (run && run.kind === kind) run.n++; else { flush(); run = { kind, n: 1 }; drawn++; } continue; }
    flush();
    drawn++;
    if (kind === "button") { blocks.push(blk("button", { label: c.label, emphasis: lead })); lead = false; }
    else if (kind === "banner") blocks.push(blk("text", { label: c.label, lines: 1, emphasis: true }));
    else blocks.push(blk(kind, { label: c.label, ...(kind === "text" ? { lines: 1 } : kind === "card" ? { lines: 2 } : {}) }));
  }
  flush();
  if (blocks.length === 1 && str(row.layout)) blocks.push(blk("text", { lines: 4 }));
  const tabs = arr(row.tabs).length || controls.filter((x) => String(x.type || "").toLowerCase() === "tab").length;
  if (tabs) blocks.push(blk("tabbar", { items: tabs }));
  return done(blocks);
}
// a spec screen (sharingu): its regions as cards, its buttons
export function wireframeFromRegions(row) {
  const regions = arr(row.regions).map((r) => (typeof r === "string" ? r : isObj(r) ? r.kind || r.id : null)).filter(Boolean);
  const buttons = arr(row.buttons).filter(str);
  if (!regions.length && !buttons.length) return null;
  const blocks = [blk("header", { label: row.name || row.id })];
  for (const r of regions.slice(0, 16)) blocks.push(blk("card", { label: human(r), lines: 2 }));
  buttons.slice(0, 8).forEach((b, i) => blocks.push(blk("button", { label: human(b), emphasis: i === 0 })));
  return done(blocks);
}
// a board's structured wireframe (bunny's spec/wireframes.json): the shell, then each region by its kind and items
const ITEM = [
  [/^(heading|section-header|title)$/, "title"], [/^(text|caption|eyebrow|icon-text|code|progress|spinner)$/, "text"],
  [/^(button|link|icon-button|cta|upload)$/, "button"], [/^(list-row|row|table-row|switch-row)$/, "list"],
  [/^(chip|chips|day-pill|badge|choice-chips)$/, "nav"], [/^(field|text-input|input|select|textarea|search|toggle|checkbox)$/, "input"],
  [/^(image|card-art|avatar|avatar-stack|chart|map-pin|map-pin-cluster|media)$/, "image"], [/^(card|stat|component)$/, "card"],
];
const itemKind = (k) => { for (const [re, kind] of ITEM) if (re.test(String(k || ""))) return kind; return "text"; };
function itemsToBlocks(items, blocks) {
  let run = null;   // consecutive rows fold into one list, consecutive chips into one nav
  const flush = () => { if (run) { blocks.push(blk(run.kind, { items: run.n })); run = null; } };
  for (const it of items) {
    const kind = itemKind(it.k);
    if (kind === "list" || kind === "nav") { if (run && run.kind === kind) run.n++; else { flush(); run = { kind, n: 1 }; } continue; }
    flush();
    if (kind === "image") { if (!blocks.length || blocks[blocks.length - 1].kind !== "image") blocks.push(blk("image", { label: it.label })); continue; }
    blocks.push(blk(kind, { label: it.label, ...(kind === "text" ? { lines: 1 } : kind === "card" ? { lines: 2 } : {}) }));
  }
  flush();
}
export function wireframeFromLayout(spec, name, shells = {}) {
  if (!isObj(spec)) return null;
  const blocks = [];
  const shell = isObj(spec.shell) ? spec.shell : {};
  const regions = arr(spec.regions).filter(isObj);
  if (!regions.some((r) => r.kind === "header") && (shell.title || shell.back || shell.kind === "stack" || shell.kind === "sheet" || shell.kind === "modal")) blocks.push(blk("header", { label: shell.title || name }));
  if (spec.viewport === "web" || spec.viewport === "console") { const nav = arr(spec.viewport === "web" ? shells.webNav : shells.consoleNav).length; if (nav) blocks.push(blk("nav", { items: nav })); }
  for (const r of regions.slice(0, 24)) {
    const items = arr(r.items).filter(isObj);
    const first = (re) => (items.find((it) => re.test(String(it.k || ""))) || {}).label;
    switch (r.kind) {
      case "header": blocks.push(blk("header", { label: first(/heading|title/) || r.title || name })); break;
      case "banner": case "badge": case "footer": blocks.push(blk("text", { label: r.title || first(/text|heading|caption/), lines: 1, emphasis: r.kind === "banner" })); break;
      case "card": case "hero": case "stats": blocks.push(blk("card", { label: r.title || first(/heading|title|stat/), lines: clamp(items.length || 2, 1, 6), emphasis: r.kind === "hero" })); break;
      case "list": case "table": blocks.push(blk("list", { label: r.title, items: clamp(items.length || 3, 1, 8) })); break;
      case "actions": items.slice(0, 3).forEach((it, i) => blocks.push(blk("button", { label: it.label, emphasis: i === 0 }))); if (!items.length) blocks.push(blk("button", { emphasis: true })); break;
      case "tabs": case "filters": blocks.push(blk("nav", { items: clamp(items.length || 3, 1, 8) })); break;
      case "media": blocks.push(blk("image", { label: r.title || first(/image|media/) })); break;
      default:   // section, form and any other: its items, in order
        if (r.title) blocks.push(blk("title", { label: r.title }));
        itemsToBlocks(items.slice(0, 12), blocks);
    }
  }
  if (shell.kind === "tabs") blocks.push(blk("tabbar", { items: arr(shells.mobileTabs).length || 4 }));
  return blocks.length ? done(blocks) : null;
}

// wireframeOf(row, src) -> the screen's grammar from its source's own layout fields, or null
export function wireframeOf(row, src) {
  const layouts = src && src.layouts && src.layouts.byScreen;
  if (layouts && isObj(layouts[row.id])) return wireframeFromLayout(layouts[row.id], row.name || row.id, layouts._shells || {});
  // a board screen (copy, controls: their buttons are objects) before a spec screen (regions, buttons named by strings)
  if (row.copy !== undefined || row.controls !== undefined) return wireframeFromBoardScreen(row);
  if (Array.isArray(row.regions) || (Array.isArray(row.buttons) && row.buttons.some(str))) return wireframeFromRegions(row);
  return null;
}

// screenData(head, rest, src) -> a screen node's data: the row verbatim, standardized (see the header). head: {id, name}.
export function screenData(head, rest, src) {
  const row = { ...head, ...rest };
  const d = { ...rest };
  const names = stateNamesOf(row);
  if (rest.states !== undefined && !(Array.isArray(rest.states) && rest.states.every((x) => typeof x === "string" && stateName(x) === x))) d.stateDetails = rest.states;
  if (names.length) d.states = names; else delete d.states;
  if (d.step != null && typeof d.step !== "number") { const n = Number(d.step); if (Number.isFinite(n) && String(d.step).trim() !== "") d.step = n; else { d.stepSource = d.step; delete d.step; } }
  // a screen shared by several apps names them all (D1b item 20): a list of two or more distinct app keys stays a list
  if (Array.isArray(d.surface) && d.surface.length && d.surface.every((x) => typeof x === "string" && x)) {
    const apps = [...new Set(d.surface)];
    d.surface = apps.length > 1 ? apps : apps[0];
  }
  for (const f of ["surface", "lane"]) if (d[f] != null && typeof d[f] !== "string" && !(f === "surface" && Array.isArray(d[f]))) { d[`${f}Source`] = d[f]; delete d[f]; }
  if (d.wireframe !== undefined) { d.wireframeSource = d.wireframe; delete d.wireframe; }
  const wf = wireframeOf(row, src);
  if (wf) d.wireframe = wf;
  return d;
}

// ---- the renders ----
const variantOf = (k, m, twinMissing) => (m.wireframe ? "wireframe" : m.shot || m.embedded ? "screenshot" : m.live ? "live"
  : m.proposed ? (k.startsWith("webp:") && twinMissing ? "proposed-web" : "proposed") : "design");

export function mapRenders(src, { known = new Set() } = {}) {
  const r = result();
  r.notImported = [];
  r.byFormat = { html: 0, wireframe: 0, image: 0 };
  r.bytes = 0;
  const R = src.renders;
  const screens = arr(src.board && src.board.model && src.board.model.screens);
  if (!R) { r.skip("render", "this source holds no screen renders (no board html, wireframe spec or atlas shots)", "-"); return r; }
  r.from = R.from;
  const keys = new Set();
  const add = (data, srcKey) => {
    r.count("render");
    if (!known.has(data.screen)) { r.skip("render", "its screen is not a screen node this import files", srcKey); return; }
    let variant = data.variant, n = 1;
    while (keys.has(`${data.screen}|${data.state}|${variant}`)) variant = `${data.variant} ${++n}`;
    if (n > 1) r.note("render", "a second render on the same screen, state and variant takes the variant \" 2\", \" 3\" …");
    keys.add(`${data.screen}|${data.state}|${variant}`);
    r.byFormat[data.format]++;
    r.bytes += Buffer.byteLength(typeof data.body === "string" ? data.body : JSON.stringify(data.body));
    r.add("render", { ...data, variant });
  };

  if (R.kind === "board-html") {
    const P = R.payload, css = isObj(P.css) ? P.css : {};
    const byId = new Map(screens.map((s) => [String(s.id), s]));
    const owner = new Map();   // payload key -> { screen, state }
    for (const s of screens) for (const w of arr(s.wireframes)) if (isObj(w) && w.pid && !owner.has(w.pid)) owner.set(w.pid, { screen: String(s.id), state: stateName(w.name) || "" });
    for (const s of screens) if (s.pid && !owner.has(s.pid)) owner.set(s.pid, { screen: String(s.id), state: "" });
    // the styles: every CSS family a render uses, with the board app's own variables and its animation freeze
    const used = new Set(Object.values(P.meta || {}).map((m) => m && m.css).filter((c) => c && str(css[c])));
    for (const fam of used) {
      r.count("style");
      const body = [R.consts.wfvars, css[fam], R.consts.static].filter(str).join("\n");
      r.add("style", { id: fam, css: body });
    }
    if (used.size) r.note("style", "a board CSS family is one style: the board app's ink variables (WFVARS, :host read as :root), the family's CSS, then its animation freeze (STATIC)");
    for (const [k, frag] of Object.entries(P.html || {})) {
      const m = (P.meta || {})[k] || {};
      let o = owner.get(k), twinMissing = false;
      if (!o) {
        const rest = k.includes(":") ? k.slice(k.indexOf(":") + 1) : k;
        if (k.startsWith("art:") && m.ref && byId.has(String(m.ref))) o = { screen: String(m.ref), state: "" };
        else if (k.startsWith("webp:")) { const twin = `webd:${rest}`; twinMissing = !byId.has(twin); o = { screen: twinMissing ? rest : twin, state: "" }; }
        else if (byId.has(rest)) o = { screen: rest, state: "" };
        else if (/#\d+$/.test(rest) && byId.has(rest.replace(/#\d+$/, ""))) o = { screen: rest.replace(/#\d+$/, ""), state: "" };
      }
      if (!o || !byId.has(o.screen)) { r.count("render"); r.skip("render", "a payload frame that names no screen of the board's model", k); continue; }
      add({ screen: nodeId("screen", o.screen), state: o.state, variant: variantOf(k, m, twinMissing), format: "html", body: String(frag),
        ...(m.css && used.has(m.css) ? { style: m.css } : {}), ...(Number.isInteger(m.w) && m.w > 0 ? { width: m.w } : {}), ...(Number.isInteger(m.h) && m.h > 0 ? { height: m.h } : {}) }, k);
    }
    r.note("render", "board frames: screen and state from the frame's own key (a wireframe's pid names its state; a screen's pid is the screen as a whole); variant from its meta (wireframe · live · screenshot · proposed · design)");
    if (R.supersedes) r.note("node", `screens, nav edges and lanes from ${R.from} (built ${R.supersedes.built}), newer than the served model (${R.supersedes.served})`);
  } else if (R.kind === "wireframes") {
    for (const sp of arr(R.spec && R.spec.screens)) {
      const id = String(sp.id || "");
      const wf = wireframeFromRegions({ id, name: sp.name, regions: sp.regions, buttons: sp.buttons });
      if (!wf) { r.count("render"); r.skip("render", "a spec screen with no regions or buttons to draw", id || "?"); continue; }
      add({ screen: nodeId("screen", id), state: "", variant: "wireframe", format: "wireframe", body: wf }, id);
    }
    r.note("render", "the wireframe spec's screens: one wireframe render each (its regions as cards, its buttons), the same grammar as the screen node's data.wireframe");
  } else if (R.kind === "atlas-shots") {
    for (const sh of arr(R.shots)) {
      const alt = String(sh.alt || "").replace(/[<>"&]/g, " ").trim();
      const size = sh.width && sh.height ? ` width="${sh.width}" height="${sh.height}"` : "";
      add({ screen: nodeId("screen", sh.screen), state: "", variant: "screenshot", format: "html",
        body: `<img src="data:${sh.mime};base64,${sh.b64}" alt="${alt}"${size} style="display:block;width:100%;height:auto">`,
        ...(sh.width ? { width: sh.width } : {}), ...(sh.height ? { height: sh.height } : {}) }, sh.shot);
    }
    r.note("render", "an atlas shot is an html render (variant screenshot): an <img> of the shot's own data:image URI (the build files embed webp), at its own size");
    if (arr(R.missing).length) r.notImported.push({ what: `the seed builds ${R.missing.join(", ")}`, why: "not found beside the bank or on the Desktop (name the directory with --renders)" });
  }
  return r;
}
