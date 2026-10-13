// src/atlaslayout.js — the Map's Screens view, the atlas (sprint 2; docs/plan/LOOK.md "the screens atlas", ARCHITECTURE §11):
// every screen of ONE app (a surface) of the project as a frame at its device's proportions, in lanes (rows) by step
// (columns), the transitions drawn between them. Two halves, like src/maplayout.js:
//
//   atlasLayout(board, opts) -> A, SERVER ONLY: from the GET /map/screens answer (the contract: { project, surfaces, surface,
//     lanes, screens, edges, styles }) and nothing else. The device (phone or wide) from the renders' own width and height,
//     else from the surface's key, else a phone; every frame of a surface the same size. A lane is a row; inside a lane a
//     screen's column is the dense rank of its step (a sparse 0, 30, 55 draws as three columns side by side) and two screens
//     on one step stack. A lane whose screens mostly carry no step (or a surface whose screens mostly carry no lane, which
//     then draws as ONE lane) is laid out from its nav edges: a breadth-first layering from the screens nothing leads to,
//     in the order the screens came, each column ordered by where its predecessors sit (stable between visits). A is also
//     what the page hands the browser (JSON, compact: short keys, frame indices, flat edges); every string drawn is cut of
//     its em dashes here, so neither the page nor its data carries one.
//
//   atlasKit() -> SELF-CONTAINED helpers (they name nothing outside their own body): the server calls it for the first
//     paint and src/atlasclient.js embeds atlasKit.toString(), so the frames' fallbacks, the level of detail and the
//     transitions' curves are ONE code on both sides (tools/map-selftest.mjs evaluates the embedded source alone):
//       show(A, f, si, mode)  what a frame shows for state si in mode "render" | "wire": the render of that state, else
//                             another state's, else the wireframe, else nothing; with its corner tag ("default",
//                             "wireframe", "no render") so the person always knows what they look at
//       lod(px)               the level of detail of a frame px wide on screen: 0 an outline (no network), 1 the wireframe
//                             as inline SVG (no request), 2 the real render
//       path(a, b) / mid(a,b) a transition's curve between two frames' boxes, and where its label sits
//       flow(A, i)            the frames of i's lane in reading order (the viewer's previous / next)

// the device frames, in world units (CSS px at 100%): every frame of a surface the same size, its device's proportions
export const PHONE = { w: 390, h: 844, fw: 200 }, WIDE = { w: 1440, h: 900, fw: 440 };
const GAP = { phone: 88, wide: 120 };   // between columns: room for the transitions' curves
const LABEL = 22, STACK = 40, HEAD = 40, ROWGAP = 96, CONT = 56, PAD = 40, ASPECT = 1.5, TALL = 4;
const WIDE_KEY = /web|admin|console|ops|desktop|dashboard|site|portal|back.?office|cms|tenant/i;
const PHONE_KEY = /mobile|ios|android|phone|app\b|watch|tablet/i;
const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
// clean(v): a wireframe's grammar as filed, every string in it cut of its em dashes (the page carries no em dash), at most
// 200 items a list and six levels deep
const clean = (v, d = 0) => (typeof v === "string" ? noDash(v) : Array.isArray(v) ? v.slice(0, 200).map((x) => clean(x, d + 1))
  : v && typeof v === "object" && d < 6 ? Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, clean(x, d + 1)])) : v);
const isNum = (v) => typeof v === "number" ? Number.isFinite(v) : (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
const WIRE_VARIANT = /wire|wf|sketch|lo-?fi/i;

// deviceOf(surfaceKey, screens) -> { kind: "phone" | "wide", w, h, fw, fh, from }: the most common render size of the surface
// (width over 700 is wide), else the surface's key, else a phone
export function deviceOf(key, screens) {
  const sizes = new Map();
  for (const s of screens || []) for (const r of Array.isArray(s.renders) ? s.renders : []) {
    const w = Number(r.width), h = Number(r.height);
    if (!(w > 0 && h > 0) || r.format === "wireframe") continue;
    const k = `${Math.round(w)}x${Math.round(h)}`;
    sizes.set(k, (sizes.get(k) || 0) + 1);
  }
  let best = null, n = 0;
  for (const [k, c] of sizes) if (c > n) { best = k; n = c; }
  let kind, w, h, from;
  if (best) { [w, h] = best.split("x").map(Number); kind = w > 700 ? "wide" : "phone"; from = "renders"; }
  else if (WIDE_KEY.test(String(key || "")) && !PHONE_KEY.test(String(key || ""))) { kind = "wide"; ({ w, h } = WIDE); from = "surface"; }
  else { kind = "phone"; ({ w, h } = PHONE); from = PHONE_KEY.test(String(key || "")) ? "surface" : "default"; }
  const fw = kind === "wide" ? WIDE.fw : PHONE.fw;
  const ratio = Math.max(0.4, Math.min(2.4, h / w));
  return { kind, w, h, fw, fh: Math.round(fw * ratio), gap: GAP[kind], from };
}

// columnsOf(members, edges, byId) -> Map(id -> { c, k }): a lane's columns and stacks. Steps when most members carry one
// (their dense rank; a member without one goes after the last), else the nav edges' breadth-first layering
function columnsOf(members, edges) {
  const out = new Map();
  const stepped = members.filter((s) => isNum(s.step));
  if (members.length && stepped.length >= members.length * 0.6) {
    const steps = [...new Set(stepped.map((s) => Number(s.step)))].sort((a, b) => a - b);
    const rank = new Map(steps.map((v, i) => [v, i]));
    let extra = steps.length;
    for (const s of members) out.set(s.id, { c: isNum(s.step) ? rank.get(Number(s.step)) : extra++ });
  } else {
    // breadth-first from the members nothing in the lane leads to, in the order they came; a cycle with no way in starts
    // at its first member
    const ids = new Set(members.map((s) => s.id)), next = new Map(), indeg = new Map();
    for (const s of members) { next.set(s.id, []); indeg.set(s.id, 0); }
    for (const e of edges) if (ids.has(e.from) && ids.has(e.to) && e.from !== e.to) { next.get(e.from).push(e.to); indeg.set(e.to, indeg.get(e.to) + 1); }
    const depth = new Map();
    const run = (starts) => {
      const q = [];
      for (const id of starts) if (!depth.has(id)) { depth.set(id, 0); q.push(id); }
      for (let h = 0; h < q.length; h++) for (const t of next.get(q[h])) if (!depth.has(t)) { depth.set(t, depth.get(q[h]) + 1); q.push(t); }
    };
    run(members.filter((s) => indeg.get(s.id) === 0).map((s) => s.id));
    for (const s of members) if (!depth.has(s.id)) run([s.id]);
    // a layer of more than TALL screens is spread over several columns side by side, so the board never grows a tower
    const layers = new Map();
    for (const s of members) { const d = depth.get(s.id); if (!layers.has(d)) layers.set(d, []); layers.get(d).push(s.id); }
    let c = 0;
    for (const d of [...layers.keys()].sort((a, b) => a - b)) {
      const ids = layers.get(d);
      for (let i = 0; i < ids.length; i++) out.set(ids[i], { c: c + Math.floor(i / TALL) });
      c += Math.ceil(ids.length / TALL);
    }
  }
  // stacks: members sharing a column, ordered by where their predecessors (in this lane) sit, then as they came
  const cols = new Map();
  for (const s of members) { const c = out.get(s.id).c; if (!cols.has(c)) cols.set(c, []); cols.get(c).push(s); }
  const prev = new Map();
  for (const e of edges) if (out.has(e.from) && out.has(e.to)) { if (!prev.has(e.to)) prev.set(e.to, []); prev.get(e.to).push(e.from); }
  for (const c of [...cols.keys()].sort((a, b) => a - b)) {
    const list = cols.get(c);
    const bary = (s) => { const p = (prev.get(s.id) || []).map((id) => out.get(id)).filter((o) => o.c < c && o.k != null); return p.length ? p.reduce((a, o) => a + o.k, 0) / p.length : null; };
    list.map((s, i) => ({ s, i, b: bary(s) })).sort((p, q) => (p.b == null) - (q.b == null) || (p.b ?? 0) - (q.b ?? 0) || p.i - q.i).forEach((o, k) => { out.get(o.s.id).k = k; });
  }
  return out;
}

// atlasLayout(board, { state ("*": each screen's own first), mode }) -> A: { p, sf, dev, W, H, lanes, f, e, el, st, s0, si, mode, dm, by, counts, cover }
//   lanes  [{ k, n, y, h, m: [frame index] }]   f  [{ r, id, n, l, s, x, y, ln, c, k, st: [state index], rs: [[state
//   index, variant, format, hash, width, height, bytes, style index into sty]], w: grammar|null }]   sty [style hash]   e  [from, to, label index, ...]
const modeOf = (asked, cover) => (asked === "wire" || asked === "render" ? asked : !cover.render && cover.wire ? "wire" : "render");
export function atlasLayout(board, opts = {}) {
  const b = board || {};
  const screens = (Array.isArray(b.screens) ? b.screens : []).filter((s) => s && s.id != null && String(s.id) !== "");
  const sf = String(b.surface || "");
  const dev = deviceOf(sf, screens);
  const gap = GAP[dev.kind];
  // the states: the union of the surface's, the most common first (then as they came); "ready" when there is one, else
  // the first, is the default
  const stN = new Map();
  for (const s of screens) {
    const names = [...(Array.isArray(s.states) ? s.states : []), ...(Array.isArray(s.renders) ? s.renders.map((r) => r && r.state) : [])];
    for (const n of new Set(names.filter((x) => x != null && x !== "").map((x) => noDash(x)))) stN.set(n, (stN.get(n) || 0) + 1);
  }
  const st = [...stN.keys()].map((n, i) => ({ n, i, c: stN.get(n) })).sort((p, q) => q.c - p.c || p.i - q.i).map((o) => o.n);
  // the default: "ready" when the app has one, else each screen in its own first state (-1)
  const s0 = st.includes("ready") ? st.indexOf("ready") : -1;
  const want = opts.state != null && opts.state !== "" ? noDash(opts.state) : null;
  const si = opts.state === "*" ? -1 : want != null && st.includes(want) ? st.indexOf(want) : s0;
  const stI = new Map(st.map((n, i) => [n, i]));
  // the lanes: the board's order, then a lane a screen names that the board does not, then the screens of no lane
  const laneName = new Map((Array.isArray(b.lanes) ? b.lanes : []).filter((l) => l && l.key != null).map((l) => [String(l.key), noDash(l.name || l.key)]));
  const carried = screens.filter((s) => s.lane != null && s.lane !== "").length;
  const byLane = carried >= screens.length * 0.6 && carried > 0;
  const order = [];
  const laneOf = (s) => (byLane && s.lane != null && s.lane !== "" ? String(s.lane) : "\u0000");
  for (const k of laneName.keys()) if (screens.some((s) => laneOf(s) === k)) order.push(k);
  for (const s of screens) { const k = laneOf(s); if (!order.includes(k) && k !== "\u0000") order.push(k); }
  if (screens.some((s) => laneOf(s) === "\u0000")) order.push("\u0000");
  // a render's style: its hash rides the body's URL (GET /render/<hash>?style=<hash>), so the browser keeps the body for good
  const styles = b.styles && typeof b.styles === "object" ? b.styles : {};
  // each style's hash once (sty), a render naming its index: one stylesheet serves hundreds of renders
  const sty = [], styI = new Map();
  const styleI = (h) => { if (!styI.has(h)) { styI.set(h, sty.length); sty.push(h); } return styI.get(h); };
  const edges = (Array.isArray(b.edges) ? b.edges : []).filter((e) => e && e.from != null && e.to != null).map((e) => ({ from: String(e.from), to: String(e.to), label: noDash(e.label || "") }));
  // pass 1: each lane's columns and stacks
  const plan = order.map((k) => {
    const members = screens.filter((s) => laneOf(s) === k).map((s) => ({ ...s, id: String(s.id) }));
    const cols = columnsOf(members, edges);
    const n = Math.max(0, ...[...cols.values()].map((o) => o.c)) + 1;
    const stackOf = new Map();
    for (const o of cols.values()) stackOf.set(o.c, Math.max(stackOf.get(o.c) || 0, o.k + 1));
    return { k, members, cols, n, stackOf };
  });
  // the wrap: a lane longer than `per` columns continues on the next row, its columns spread evenly over its rows; `per` is
  // chosen so the board's shape comes nearest a wide screen's (a long single lane is not drawn as a thin strip)
  const block = (stack) => stack * (LABEL + dev.fh) + (stack - 1) * STACK;
  const shape = (N) => {
    let H = PAD, cols = 1;
    const rows = plan.map((l) => {
      const r = Math.max(1, Math.ceil(l.n / N)), per = Math.ceil(l.n / r);
      cols = Math.max(cols, per);
      const hs = Array.from({ length: r }, (_, i) => { let s = 1; for (let c = i * per; c < (i + 1) * per; c++) s = Math.max(s, l.stackOf.get(c) || 0); return block(s); });
      const h = HEAD + hs.reduce((a, v) => a + v, 0) + (r - 1) * CONT;
      H += h + ROWGAP;
      return { per, hs, h };
    });
    return { W: cols * (dev.fw + gap) - gap + 2 * PAD, H: H - ROWGAP + PAD, rows };
  };
  const maxN = Math.max(1, ...plan.map((l) => l.n));
  let best = null, bestD = Infinity;
  for (let N = Math.min(maxN, 4); N <= maxN; N++) {
    const s = shape(N), d = Math.abs(Math.log(s.W / s.H / ASPECT));
    if (d <= bestD + 1e-9) { best = s; bestD = d; }
  }
  const lanes = [], f = [], index = new Map();
  let y = PAD, W = 0;
  plan.forEach((pl, li) => {
    const { k, members, cols } = pl, lay = best.rows[li];
    const lane = { k: k === "\u0000" ? "" : k, n: k === "\u0000" ? (byLane ? "No lane" : "Every screen") : (laneName.get(k) || noDash(k)), x: PAD, y, h: lay.h, top: y + HEAD + LABEL, m: [] };
    const rowY = [];
    for (let r = 0, yy = y + HEAD; r < lay.hs.length; r++) { rowY.push(yy); yy += lay.hs[r] + CONT; }
    // reading order: by column, then stack
    const ordered = members.map((s, i) => ({ s, i, o: cols.get(s.id) })).sort((p, q) => p.o.c - q.o.c || p.o.k - q.o.k || p.i - q.i);
    for (const { s, o } of ordered) {
      const fi = f.length;
      const row = Math.floor(o.c / lay.per), cc = o.c % lay.per;
      const x = PAD + cc * (dev.fw + gap), fy = rowY[row] + LABEL + o.k * (LABEL + dev.fh + STACK);
      const rs = (Array.isArray(s.renders) ? s.renders : []).filter((r) => r && r.hash).map((r) => [
        r.state != null && r.state !== "" && stI.has(noDash(r.state)) ? stI.get(noDash(r.state)) : -1,
        noDash(r.variant || ""), ["html", "image", "wireframe"].includes(r.format) ? r.format : "html", String(r.hash),
        Number(r.width) || 0, Number(r.height) || 0, Number(r.bytes) || 0, r.style != null && styles[r.style] ? styleI(String(styles[r.style])) : -1]);
      const states = [...new Set((Array.isArray(s.states) ? s.states : []).filter((x) => x != null && x !== "").map((x) => stI.get(noDash(x))))];
      for (const r of rs) if (r[0] >= 0 && !states.includes(r[0])) states.push(r[0]);
      f.push({ r: /^screen:/.test(s.id) ? s.id : "screen:" + s.id, id: s.id.replace(/^screen:/, ""), n: noDash(s.name || s.id), l: ["green", "amber", "red", "grey"].includes(s.light) ? s.light : "grey",
        s: s.status ? noDash(s.status) : "", x, y: fy, ln: lanes.length, c: o.c, k: o.k, st: states, rs, w: s.wireframe && typeof s.wireframe === "object" ? clean(s.wireframe) : null,
        ...(Number(s.stale) > 0 ? { z: Number(s.stale) } : {}) });
      index.set(s.id, fi);
      lane.m.push(fi);
      W = Math.max(W, x + dev.fw);
    }
    lanes.push(lane);
    y += lay.h + ROWGAP;
  });
  const labels = [], labelI = new Map(), e = [];
  const seen = new Set();
  for (const ed of edges) {
    const a = index.get(ed.from), c = index.get(ed.to);
    if (a == null || c == null || a === c) continue;
    const key = a + " " + c;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!labelI.has(ed.label)) { labelI.set(ed.label, labels.length); labels.push(ed.label); }
    e.push(a, c, labelI.get(ed.label));
  }
  const counts = { green: 0, amber: 0, red: 0, grey: 0, stale: 0 };
  for (const x of f) { counts[x.l]++; if (x.z) counts.stale++; }
  // what the frames can show at all: a real render (any state), a wireframe only, nothing
  const cover = { render: 0, wire: 0, none: 0 };
  for (const x of f) { if (x.rs.some((r) => r[2] !== "wireframe" && !WIRE_VARIANT.test(r[1]))) cover.render++; else if (x.w || x.rs.length) cover.wire++; else cover.none++; }
  return { p: String(b.project || ""), sf, dev, W: Math.max(W + PAD, 600), H: Math.max(y - ROWGAP + PAD, 400), lanes, f, e, el: labels, st, s0, si, sty,
    // the mode: the one asked, else Render — or Wireframe when no frame of this app has a real render to show (sprint 12's
    // review: Render then drew wireframes under a "no render" note); dm the default, which the address leaves unsaid
    mode: modeOf(opts.mode, cover), dm: modeOf(null, cover), byLane, counts, cover, gy: ROWGAP + HEAD + LABEL };
}

// ---- the kit (self-contained: embedded in the page by toString) ----
export function atlasKit() {
  var WIRE_V = /wire|wf|sketch|lo-?fi/i;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function wireR(r) { return r[2] === "wireframe" || WIRE_V.test(r[1]); }
  // pick(rs, test): the first render that passes, in the order they were filed
  function pick(rs, test) { for (var i = 0; i < rs.length; i++) if (test(rs[i])) return rs[i]; return null; }
  function as(r, tag) { return { k: r[2] === "wireframe" ? "wire" : r[2], r: r, h: r[3], rw: r[4], rh: r[5], tag: tag }; }
  // show(A, f, si, mode) -> { k: "html" | "image" | "wire" | "none", r, h, rw, rh, spec, tag }
  //   render mode: this state's render -> another state's (the default state's first) -> the wireframe (this state's, the
  //   screen's grammar, another state's) -> nothing; wire mode: the wireframe in the same order -> nothing
  function show(A, f, si, mode) {
    var rs = f.rs || [], st = A.st || [], r, own = (f.st || [])[0];
    // si -1: each screen in its own first state (the default unless the app has a "ready")
    if (si == null || si < 0) si = own == null ? -2 : own;
    var real = function (x) { return !wireR(x); };
    var tagOf = function (x) { return x[0] >= 0 ? st[x[0]] : ""; };
    var at = function (s, test) { return pick(rs, function (x) { return x[0] === s && test(x); }); };
    // this state's, else the screen's as a whole (a render filed with no state fits every state)
    var here = function (test) { return at(si, test) || at(-1, test); };
    // another state's: the app's default, then the screen's own first, then any
    var other = function (test) { return (A.s0 >= 0 && A.s0 !== si ? at(A.s0, test) : null) || (own !== si ? at(own, test) : null) || pick(rs, function (x) { return x[0] !== si && test(x); }); };
    if (mode !== "wire") {
      if ((r = here(real))) return as(r, "");
      if ((r = other(real))) return as(r, tagOf(r));
    }
    var wt = function (x) { return mode === "wire" ? (x[0] === si || x[0] === -1 ? "" : tagOf(x)) : "wireframe"; };
    // the wireframe: this state's, the screen's own first state's, the screen's grammar (any state), another state's
    if ((r = here(wireR)) || (own !== si && (r = at(own, wireR)))) return as(r, wt(r));
    if (f.w) return { k: "wire", spec: f.w, tag: mode === "wire" ? "" : "wireframe" };
    if ((r = other(wireR))) return as(r, wt(r));
    return { k: "none", tag: mode === "wire" ? "no wireframe" : "no render" };
  }
  // lod(px): 0 an outline (far), 1 the wireframe or an IMAGE render (closer: both cost no document, a wireframe is inline SVG
  // and a picture one <img>), 2 an html render too (close: an <iframe> is a whole document), by the frame's width on screen.
  // Sprint 3 B4 (found while recording the walkthrough): was 56 and 150 px, an image held back with the html; a big app at
  // fit (bunny's web app, 440 px frames at 29%: 128 px; saruspay's phone app fits at 13%: 26 px) showed empty outlines until a
  // deep zoom
  var LOD_WIRE = 20, LOD_HTML = 110;
  function lod(px) { return px < LOD_WIRE ? 0 : px < LOD_HTML ? 1 : 2; }
  // plan(A, v, z, live, si, mode, liveImg) -> { lv, near: [{ k, may }], out: [k] }: what the frames hold for the view v = {s, tx,
  // ty} over a stage z = {w, h}: lv the level of detail; near the frames in the view or near it (the view grown by half its
  // size on each side), the nearest first, each allowed a network render (may): at level 2 an html or image render while
  // fewer than `live` hold one, at level 1 an image render while fewer than `liveImg` (default 2 x live) do; out the frames
  // to release (far from the view)
  function plan(A, v, z, live, si, mode, liveImg) {
    var s = v.s, lv = lod(A.dev.fw * s), fw = A.dev.fw, fh = A.dev.fh, near = [], out = [], used = 0, usedImg = 0;
    var x0 = -v.tx / s, y0 = -v.ty / s, x1 = x0 + z.w / s, y1 = y0 + z.h / s, mx = (x1 - x0) / 2, my = (y1 - y0) / 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (var k = 0; k < A.f.length; k++) {
      var f = A.f[k];
      if (!(f.x + fw > x0 - mx && f.x < x1 + mx && f.y + fh > y0 - my && f.y < y1 + my)) { out.push(k); continue; }
      var vis = f.x + fw > x0 && f.x < x1 && f.y + fh > y0 && f.y < y1;
      near.push({ k: k, d: Math.hypot(f.x + fw / 2 - cx, f.y + fh / 2 - cy) + (vis ? 0 : 1e6) });
    }
    near.sort(function (a, b) { return a.d - b.d || a.k - b.k; });
    var capImg = liveImg == null ? 2 * live : liveImg;
    return { lv: lv, out: out, near: near.map(function (o) {
      var sh = lv >= 1 ? show(A, A.f[o.k], si, mode) : null;
      // L4: a picture (one <img>) is cheap at every level: up to capImg of them load, nearest first; an html render (a whole
      // document) only close up (level 2), up to `live`
      var img = !!sh && sh.k === "image", doc = !!sh && lv === 2 && sh.k === "html";
      var may = (img && usedImg < capImg) || (doc && used < live);
      if (may && img) usedImg++; else if (may) used++;
      return { k: o.k, may: may };
    }) };
  }
  // path(a, b): a transition between two frames' boxes {x, y, w, h}: forward from a's right to b's left; back (b left of a)
  // under both, from bottom to bottom; in one column, out of the right side and back in
  function path(a, b) {
    var ay = a.y + a.h / 2, by = b.y + b.h / 2, ax, bx, d;
    if (b.x >= a.x + a.w) { ax = a.x + a.w + 2; bx = b.x - 2; d = Math.max(24, (bx - ax) / 2); return "M" + r1(ax) + " " + r1(ay) + "C" + r1(ax + d) + " " + r1(ay) + " " + r1(bx - d) + " " + r1(by) + " " + r1(bx) + " " + r1(by); }
    if (b.x + b.w <= a.x) {
      ax = a.x + a.w / 2; bx = b.x + b.w / 2; var y0 = a.y + a.h + 2, y1 = b.y + b.h + 2;
      d = Math.min(150, 34 + Math.abs(ax - bx) * 0.12);
      return "M" + r1(ax) + " " + r1(y0) + "C" + r1(ax) + " " + r1(y0 + d) + " " + r1(bx) + " " + r1(y1 + d) + " " + r1(bx) + " " + r1(y1);
    }
    ax = a.x + a.w + 2; d = Math.min(140, 30 + Math.abs(by - ay) * 0.2);
    return "M" + r1(ax) + " " + r1(ay) + "C" + r1(ax + d) + " " + r1(ay) + " " + r1(ax + d) + " " + r1(by) + " " + r1(ax) + " " + r1(by);
  }
  // mid(a, b): the curve's middle (t = 0.5), where its label sits
  function mid(a, b) {
    var p = path(a, b).replace(/[MC]/g, " ").trim().split(/\s+/).map(Number);
    return { x: r1((p[0] + 3 * p[2] + 3 * p[4] + p[6]) / 8), y: r1((p[1] + 3 * p[3] + 3 * p[5] + p[7]) / 8) };
  }
  function box(A, i) { var f = A.f[i]; return { x: f.x, y: f.y, w: A.dev.fw, h: A.dev.fh }; }
  // edges(A) -> the transitions' SVG at rest (one path each, its two frames on it): a step to the frame beside it in the same
  // row is drawn plain (ax-en, the flow you read), a longer reach faint (it shows whole on hover and pin)
  function edges(A) {
    var out = [], step = A.dev.fw + (A.dev.gap || 0) + 1;
    for (var q = 0; q < A.e.length; q += 3) {
      var a = box(A, A.e[q]), b = box(A, A.e[q + 1]), near = Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) <= step;
      out.push('<path class="ax-e' + (near ? " ax-en" : "") + '" d="' + path(a, b) + '" data-a="' + A.e[q] + '" data-b="' + A.e[q + 1] + '"/>');
    }
    return out.join("");
  }
  // flow(A, i) -> the frames of i's lane in reading order (column, then stack)
  function flow(A, i) { var ln = A.lanes[A.f[i].ln]; return ln ? ln.m.slice() : [i]; }
  // has(A, f, s) -> what state s of frame f can show: "render" (a real one), "wire" (a wireframe only) or "none"
  function has(f, s) { var w = null; for (var k = 0; k < f.rs.length; k++) if (f.rs[k][0] === s || f.rs[k][0] === -1) { if (!wireR(f.rs[k])) return "render"; w = "wire"; } return w || (f.w ? "wire" : "none"); }
  // block(A, i, si) -> the pinned screen's own part of the side panel, under the Map's inspector: its states (each opens
  // the viewer in it), its renders and Open full size
  function block(A, i, si) {
    var f = A.f[i]; if (!f) return "";
    var kb = function (n) { return n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B"; };
    var cur = si == null || si < 0 ? f.st[0] : si;
    var chips = f.st.map(function (s) { return '<button type="button" class="ax-chip" data-button="open-full" data-client="opens the screen full size in this state" data-i="' + i + '" data-state="' + s + '"' + (s === cur ? ' aria-current="true"' : "") + ' title="' + esc(A.st[s]) + '"><i data-has="' + has(f, s) + '"></i>' + esc(A.st[s]) + "</button>"; }).join("");
    var rows = f.rs.slice(0, 12).map(function (r) { return "<li><b>" + esc(r[1] || r[2]) + "</b><span>" + esc(r[0] >= 0 ? A.st[r[0]] : "every state") + "</span><small>" + esc(r[2]) + (r[4] ? " " + r[4] + "x" + r[5] : "") + (r[6] ? " " + kb(r[6]) : "") + "</small></li>"; }).join("");
    return '<section class="mx-sec ax-sb" data-region="screen-renders" data-screen-id="' + esc(f.id) + '">' +
      '<h4 class="mx-k">States <span>' + f.st.length + "</span></h4>" + (chips ? '<div class="ax-chips">' + chips + "</div>" : '<p class="mx-note">No state is named.</p>') +
      '<h4 class="mx-k">Renders <span>' + f.rs.length + "</span></h4>" + (rows ? '<ul class="ax-rl">' + rows + (f.rs.length > 12 ? "<li><span>and " + (f.rs.length - 12) + " more</span></li>" : "") + "</ul>"
        : '<p class="mx-note">No render is filed for it' + (f.w ? ", only its wireframe" : "") + ': file one through preview then save_knowledge, an item {kind: "render"} (screen ' + esc(f.r) + ", a state, html, a picture as base64, or a wireframe).</p>") +
      '<div class="mx-acts"><button type="button" class="mx-b mx-b-go" data-button="open-full" data-client="opens the screen full size" data-i="' + i + '">Open full size</button></div></section>';
  }
  return { esc: esc, show: show, lod: lod, plan: plan, path: path, mid: mid, box: box, edges: edges, flow: flow, wireR: wireR, has: has, block: block };
}
