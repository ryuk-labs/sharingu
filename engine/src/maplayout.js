// src/maplayout.js — the Map's layered layout (the main tab, sprint 2; docs/plan/LOOK.md "The Map, ruled"). Two halves:
//
//   layoutOf(model) -> L, SERVER ONLY: the columns (surfaces -> screens -> doors -> data -> open decisions, each a layer's),
//     every column's GROUPS and every node's place in its group, all decided here from the model and nothing else, in a
//     deterministic order, so a map looks the same on every visit. A group is what a column's nodes share: a lane or a
//     surface for screens, a door's group or its path, a table's name stem, a chain's kind. The grouping key is CHOSEN per
//     column among the candidates the rows carry (the one whose groups come nearest ten, none over forty), never typed per
//     project. A column with more than FOLD_OVER nodes starts with its groups folded (a cluster row with its count and its
//     lights); a group opens on click, when a flow or a find reaches into it, or when the reader zooms in on it. Groups of
//     the doors and data columns are ordered by where their neighbours sit in the column before (the barycenter), so links
//     run mostly level. L is also what the page hands the browser (JSON), compact: short keys, node indices, flat links.
//
//   mapKit() -> the drawing kit, SELF-CONTAINED (it names nothing outside its own body): stack() places the groups for the
//     groups open, the columns folded (M5: a folded column is ONE cluster at its top, its title and count, its links bundled
//     to it) and the layers on; units() draws the nodes, the group heads and the folded clusters as SVG; links()
//     draws the links at rest, bundled between what is drawn (a folded group gathers its members' links, the stroke's width
//     the count); hl() draws one node's own links, every kind, for hover and pin. The server calls mapKit() for the first
//     paint and src/mapclient.js embeds mapKit.toString() for every redraw after it: ONE drawing, never two that can drift
//     (tools/map-selftest.mjs evaluates the embedded source alone and diffs its drawing against the server's).

// the columns, left to right, each drawn when its layer is on (positions never move when a layer is switched)
export const COLUMNS = [
  { k: "surface", label: "Surfaces", types: ["surface"], w: 128, layer: "screens" },
  { k: "screen", label: "Screens", types: ["screen"], w: 214, layer: "screens" },
  { k: "door", label: "Doors", types: ["door"], w: 236, layer: "doors" },
  { k: "data", label: "Data", types: ["entity", "table"], w: 196, layer: "data" },
  // D1b item 15: the column holds open questions, rulings not built and open gaps: it is named for what it holds
  { k: "work", label: "Decisions and gaps", types: ["dep", "gap"], w: 236, layer: "deps" },
];
export const LAYERS = [["screens", "Screens"], ["doors", "Doors"], ["data", "Data"], ["flows", "Flows"], ["deps", "Deps"]];
export const DEFAULT_LAYERS = ["screens", "doors", "data"];
// the link kinds drawn at rest (bundled); every other kind shows on hover and pin
export const REST_KINDS = ["on", "calls", "reads", "writes"];
export const FOLD_OVER = 30;
const COL_GAP = 84, PAD_X = 24;

// ---- grouping ----
const stem = (name) => { const t = String(name || "").split(/[_.]/)[0]; return t.length > 3 ? t.replace(/([^su])s$/, "$1") : t; };
const segsOf = (path) => { const m = /^\S+\s+(\S+)/.exec(String(path || "")); return String(m ? m[1] : path || "").split("?")[0].split("/").filter(Boolean); };
const OTHER = "\u0000other";
// a value that says "no group" is no key (a model's own sentinel: "ungrouped", "none", "misc")
const NO_KEY = /^(none|ungrouped|other|misc|n\/a|-)$/i;
// score(groups): lower is better. Near ten groups, none over forty, few of one node, and a small Other (a key that leaves
// most nodes in Other groups nothing)
function score(groups) {
  const k = groups.length;
  if (k < 2) return 99;
  const n = groups.reduce((a, g) => a + g.m.length, 0);
  const max = Math.max(...groups.map((g) => g.m.length));
  const singles = groups.filter((g) => g.m.length === 1).length;
  const other = (groups.find((g) => g.key === OTHER) || { m: [] }).m.length;
  return Math.abs(Math.log(k / 10)) + Math.max(0, max - 40) / 40 + (singles / k > 0.5 ? 1 : 0) + (other / n > 0.25 ? 2 : 0);
}
// groupBy(nodes, keyOf, labelOf) -> [{ key, label, m: [node] }] in first-appearance order; a node with no key goes to Other
function groupBy(nodes, keyOf, labelOf) {
  const by = new Map();
  for (const n of nodes) {
    const k = keyOf(n);
    const key = k == null || k === "" || NO_KEY.test(String(k)) ? OTHER : String(k);
    if (!by.has(key)) by.set(key, { key, label: key === OTHER ? "Other" : labelOf(key, n), m: [] });
    by.get(key).m.push(n);
  }
  return [...by.values()];
}
// mergeSingles(groups): three or more one-node groups become one Other group, last (past fourteen groups, the two-node
// groups too: twenty-odd pairs at fit read as noise, one Other with a count reads as one)
function mergeSingles(groups) {
  const small = groups.length > 14 ? 2 : 1;
  const singles = groups.filter((g) => g.m.length <= small && g.key !== "\u0000other");
  if (singles.length < 3 || singles.length === groups.length) return groups;
  const rest = groups.filter((g) => !singles.includes(g));
  let other = rest.find((g) => g.key === "\u0000other");
  if (!other) { other = { key: "\u0000other", label: "Other", m: [] }; rest.push(other); }
  else { rest.splice(rest.indexOf(other), 1); rest.push(other); }
  for (const g of singles) other.m.push(...g.m);
  return rest;
}
// best(nodes, candidates) -> { gs, c } the groups of the best-scoring candidate that most nodes carry, or null
function best(nodes, candidates) {
  let out = null, bestScore = Infinity;
  for (const c of candidates) {
    const carried = nodes.filter((n) => { const k = c.key(n); return k != null && k !== ""; }).length;
    if (carried < nodes.length * 0.6) continue;
    const gs = mergeSingles(groupBy(nodes, c.key, c.label));
    const sc = score(gs);
    if (sc < bestScore) { out = { gs, c }; bestScore = sc; }
  }
  return out;
}
// pick(nodes, candidates) -> the best candidate's groups, one group when none fits; a group still over BIG is split once
// more by the best of the other candidates, its parts labelled "<group> · <part>"
const BIG = 40;
function pick(nodes, candidates, secondary = []) {
  const b = best(nodes, candidates);
  if (!b) return [{ key: "", label: "", m: nodes.slice() }];
  const rest = [...candidates.filter((c) => c !== b.c), ...secondary];
  const out = [];
  for (const g of b.gs) {
    const sub = g.m.length > BIG && rest.length ? best(g.m, rest) : null;
    const singles = sub ? sub.gs.filter((x) => x.m.length === 1).length : 0;
    if (!sub || sub.gs.length < 2 || sub.gs.length > 16 || singles > sub.gs.length / 2) { out.push(g); continue; }
    for (const x of sub.gs) out.push({ key: `${g.key}\u0003${x.key}`, label: `${g.label} \u00b7 ${x.label}`, m: x.m });
  }
  return out;
}
// a door's access, its first word ("reader", "operator:platform_owner", "signed-in"): a sentence is not a key
const accessKey = (a) => { const t = String(a || "").trim().split(/[\s(|,;]/)[0].replace(/[.:]+$/, ""); return !t || t.length > 40 ? null : t === "none" ? "no auth" : t; };
function groupsFor(col, nodes, model) {
  if (!nodes.length) return [];
  if (col.k === "surface") return [{ key: "", label: "", m: nodes }];
  if (col.k === "screen") {
    const sl = (s) => (model.surfaceLabels && model.surfaceLabels[s]) || s;
    const ll = (l) => (model.lanes && model.lanes[l]) || l;
    // lane within surface only when (nearly) every screen names its surface and there are several
    const surfaces = new Set(nodes.filter((n) => n.surface).map((n) => n.surface));
    const bySurface = surfaces.size > 1 && nodes.filter((n) => n.surface).length >= nodes.length * 0.9;
    return pick(nodes, [
      ...(bySurface ? [{ key: (n) => (n.lane ? `${n.surface || ""}\u0001${n.lane}` : null), label: (k) => { const [sf, l] = k.split("\u0001"); return sf && sl(sf) !== ll(l) ? `${ll(l)} · ${sl(sf)}` : ll(l); } }] : []),   // sprint 3 L3: a lane named as its surface says it once
      { key: (n) => n.lane, label: ll },
      { key: (n) => n.surface, label: sl },
      { key: (n) => n.group, label: (k) => k },
      { key: (n) => n.band, label: (k, n) => n.bandName || k },
    ]);
  }
  if (col.k === "door") {
    // the door's own group, else its path cut at the depth that groups best (a shared /api/v1 head groups nothing)
    return pick(nodes, [
      { key: (n) => n.group, label: (k) => k },
      ...[0, 1, 2, 3].map((depth) => ({ key: (n) => { const sg = segsOf(n.path); return sg.length > depth ? "/" + sg.slice(0, depth + 1).join("/") : null; }, label: (k) => k })),
    ], [{ key: (n) => accessKey(n.access), label: (k) => k }]);
  }
  if (col.k === "data") {
    const ents = nodes.filter((n) => n.type === "entity"), tables = nodes.filter((n) => n.type === "table");
    const out = ents.length ? [{ key: "\u0002entities", label: "Entities", m: ents }] : [];
    if (!tables.length) return out;
    const tg = tables.length > FOLD_OVER
      ? pick(tables, [{ key: (n) => n.group, label: (k) => k }, { key: (n) => stem(n.name), label: (k) => k }, { key: (n) => n.scope, label: (k) => `${k} scope` }])
      : [{ key: "\u0002tables", label: "Tables", m: tables }];
    return out.concat(tg);
  }
  // work: the chains by what heads them, then the open gaps
  const deps = nodes.filter((n) => n.type === "dep"), gaps = nodes.filter((n) => n.type === "gap");
  // D1b item 15: a chain is grouped by what heads it NOW (mapmodel.js depOpen: the question's live status): an open question,
  // a question ruled since the chain was filed, a ruling not built
  const HEAD = { question: "Open questions", ruled: "Ruled since, chain kept", ruling: "Rulings not built" };
  const headOf = (n) => (n.open === undefined ? (n.headKind || "decision") : n.open ? "question" : (n.headKind === "question" ? "ruled" : (n.headKind || "decision")));
  const out = groupBy(deps, headOf, (k) => HEAD[k] || `${k[0].toUpperCase()}${k.slice(1)}s`);
  if (gaps.length) out.push({ key: "\u0002gaps", label: "Open gaps", m: gaps });
  return out;
}

// ---- the layout ----
// layoutOf(model, { lights }) -> L: { p, v, cols, groups, nodes, links, kinds, rest, flows, counts }
export function layoutOf(model) {
  const m = model || {};
  const all = Array.isArray(m.nodes) ? m.nodes : [];
  const byId = new Map(all.map((n) => [n.id, n]));
  // adjacency (both ways) for the barycenters
  const adj = new Map();
  for (const [a, b] of Array.isArray(m.links) ? m.links : []) {
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  const rank = new Map();   // node id -> its row in the columns laid out so far
  const cols = [], groups = [], nodes = [];
  let x = PAD_X;
  for (const spec of COLUMNS) {
    const inCol = all.filter((n) => spec.types.includes(n.type));
    if (!inCol.length) continue;
    let gs = groupsFor(spec, inCol, m);
    // doors and data follow the column before: groups and their members by the mean row of their laid-out neighbours
    if (spec.k === "door" || spec.k === "data") {
      const bary = (n) => { const r = (adj.get(n.id) || []).map((o) => rank.get(o)).filter((v) => v != null); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null; };
      const order = (list, f) => list.map((v, i) => ({ v, i, b: f(v) })).sort((p, q) => (p.b == null) - (q.b == null) || (p.b ?? 0) - (q.b ?? 0) || p.i - q.i).map((o) => o.v);
      gs = gs.map((g) => ({ ...g, m: order(g.m, bary) }));
      const fixed = gs.filter((g) => g.key.startsWith("\u0002entities"));
      const rest = gs.filter((g) => !fixed.includes(g) && g.key !== "\u0000other");
      const other = gs.filter((g) => g.key === "\u0000other");
      // a group split in parts keeps its parts together: the family's mean row first, then the part's own
      const mean = (list) => { const bs = list.map(bary).filter((v) => v != null); return bs.length ? bs.reduce((a, b) => a + b, 0) / bs.length : null; };
      const fam = (g) => g.key.split("\u0003")[0], famB = new Map();
      for (const g of rest) if (!famB.has(fam(g))) famB.set(fam(g), mean(rest.filter((x) => fam(x) === fam(g)).flatMap((x) => x.m)));
      const ranked = order(rest, (g) => mean(g.m));
      const famOrder = new Map(order([...famB.keys()], (f) => famB.get(f)).map((f, i) => [f, i]));
      gs = [...fixed, ...ranked.map((g, i) => ({ g, i })).sort((p, q) => famOrder.get(fam(p.g)) - famOrder.get(fam(q.g)) || p.g.key.endsWith("\u0000other") - q.g.key.endsWith("\u0000other") || p.i - q.i).map((o) => o.g), ...other];
    }
    const fold = inCol.length > FOLD_OVER;
    // D1b item 21: the apps' column is as wide as its longest name needs (up to 264px), so an app's NAME is read whole
    // ("App - attendee", "Web - manage (host console)"), never cut to "App - attend…"; the other columns keep their width
    // D2 (item 5): the screens' and the data columns are as wide as their longest GROUP label needs (up to 340px), so a split
    // group's label ("App - attendee · Other", "row-owner scope · user") is read whole, never cut to "App - attend… · Other": a folded
    // group draws its label at 7.3px a character beside its count (44px of chrome and 7.4px a digit), an open one's header at
    // 6.6px beside 60px. The other columns keep their width.
    const groupNeed = spec.k === "screen" || spec.k === "data" ? Math.max(0, ...gs.map((g) => { const n = noDash(g.label || "").length, d = String(g.m.length).length; return Math.max(44 + 7.4 * d + 7.3 * n, 60 + 6.6 * n); })) : 0;
    const w = spec.k === "surface" ? Math.max(spec.w, Math.min(264, 48 + 7.6 * Math.max(0, ...inCol.map((n) => noDash(n.name || "").length))))
      : spec.k === "screen" || spec.k === "data" ? Math.max(spec.w, Math.min(340, Math.ceil(groupNeed))) : spec.w;
    const col = { k: spec.k, label: spec.label, layer: spec.layer, x, w, n: inCol.length, g: [] };
    let row = 0;
    for (const g of gs) {
      const gi = groups.length;
      const grp = { id: `${spec.k}:${g.key.replace(/\u0003/g, "/").replace(/[\u0000-\u0002]/g, "")}`, c: cols.length, label: noDash(g.label), fold: fold && g.m.length > 1 ? 1 : 0, m: [], lc: [0, 0, 0, 0] };
      g.m.forEach((n, k) => {
        const i = nodes.length;
        const nd = { r: n.ref, t: n.type, n: noDash(n.name), l: n.light || "grey", g: gi, k };
        if (n.stale) nd.z = n.stale;   // sprint 3 B4: how many of its checks were graded before its last change (stale)
        if (n.id !== n.ref) nd.id = n.id;
        if (n.status) nd.s = n.status;
        if (n.type === "dep" && n.open !== undefined) nd.o = n.open ? 1 : 0;   // D1b item 15: an open decision now (1) or not (0)
        nodes.push(nd);
        grp.m.push(i);
        grp.lc[LIGHT_I[n.light] ?? 3]++;
        rank.set(n.id, row++);
      });
      col.g.push(gi);
      groups.push(grp);
    }
    // a door group named after a path: its members are drawn without the path they share
    if (spec.k === "door") for (const gi of col.g) { const g = groups[gi]; const pre = commonPath(g.m.map((i) => byId.get(nodes[i].id || nodes[i].r).path)); if (pre.length > 1) g.pre = "/" + pre.join("/"); }
    cols.push(col);
    x += w + COL_GAP;
  }
  const index = new Map(nodes.map((n, i) => [n.id || n.r, i]));
  const kinds = [], kindI = new Map(), links = [];
  for (const [a, b, k] of Array.isArray(m.links) ? m.links : []) {
    const ia = index.get(a), ib = index.get(b);
    if (ia == null || ib == null) continue;
    if (!kindI.has(k)) { kindI.set(k, kinds.length); kinds.push(k); }
    links.push(ia, ib, kindI.get(k));
  }
  const clip = (v, n) => { const t = noDash(v || ""); return t.length > n ? t.slice(0, n - 1) + "\u2026" : t; };
  const flows = (Array.isArray(m.flows) ? m.flows : []).map((f) => ({ id: f.id, r: f.ref, n: noDash(f.name), s: f.status || "", a: noDash(f.audience || ""), d: clip(f.desc, 240), l: f.light || "grey", ...(f.stale ? { z: f.stale } : {}),
    st: f.steps.map((s) => [s.node != null && index.has(s.node) ? index.get(s.node) : -1, s.door != null && index.has(s.door) ? index.get(s.door) : -1, clip(s.actor, 60), clip(s.text, 160), s.does && s.does !== s.text ? clip(s.does, 200) : ""]) }));
  const counts = { green: 0, amber: 0, red: 0, grey: 0, stale: 0 };
  for (const n of nodes) { counts[n.l] = (counts[n.l] || 0) + 1; if (n.z) counts.stale++; }
  const layerN = {};
  // D2b: a layer pill counts what it names, the same number as its column ("Screens 34" over a column of 33 counted the
  // surface too): the Screens pill counts screens, not the surfaces column it also toggles
  for (const c of cols) if (c.k !== "surface") layerN[c.layer] = (layerN[c.layer] || 0) + c.n;
  layerN.flows = flows.length;
  return { p: m.project || "", v: m.v || "0", cols, groups, nodes, links, kinds, rest: REST_KINDS.filter((k) => kindI.has(k)).map((k) => kindI.get(k)), flows, counts, layerN };
}
const LIGHT_I = { green: 0, amber: 1, red: 2, grey: 3 };
// no em dash in anything drawn (the law of the rendered page): a model's own names are drawn with a plain hyphen
const noDash = (s) => String(s ?? "").replace(/\s*[\u2014\u2013]\s*/g, " - ");
function commonPath(paths) {
  const segs = paths.map(segsOf);
  if (segs.length < 2) return [];
  const out = [];
  for (let i = 0; ; i++) { const v = segs[0][i]; if (v == null || !segs.every((s) => s[i] === v && s.length > i + 1)) break; out.push(v); }
  return out;
}

// ---- the drawing kit (self-contained: embedded in the page by toString) ----
export function mapKit() {
  var ROW = 26, HEAD = 26, CLUS = 34, GAP = 10, TOP = 48;
  var LIGHTS = ["green", "amber", "red", "grey"];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cut(s, w, px) { var n = Math.max(4, Math.floor(w / px)); s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  // a split group's label ("<group> · <part>") too long for its row keeps its part whole and cuts its group
  function cutGroup(s, w, px) {
    var n = Math.max(4, Math.floor(w / px)), k = s.lastIndexOf(" \u00b7 ");
    if (s.length <= n || k < 0) return cut(s, w, px);
    var part = s.slice(k + 3), room = n - part.length - 3;
    return room >= 4 ? s.slice(0, room - 1) + "…" + " \u00b7 " + part : cut(part, w, px);
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  // stack(L, S) places every group for S.open (group id -> true), S.shut (column key -> true: M5, the column folded) and S.on
  // (layer -> true): g.y, g.h, g.hd, g.op, g.sh (its column folded: every group of it sits at the column's one cluster); the
  // drawn extent in L.W, L.H (the columns whose layer is on)
  // D6a: a column drawn ALONE (one layer on: the Doors view, the Data view) wraps its groups into side-by-side columns of even
  // height (one more for every SUB_MIN of stack, at most SUB_MAX), so it fills the board instead of one long centred strip (not at
  // phone width, S.narrow: the canvas is a sideways strip there); g.dx is a group's offset from its column's x (0 elsewhere)
  var SUB_GAP = 40, SUB_MIN = 640, SUB_MAX = 4;
  function stack(L, S) {
    var W = 0, H = 0, X = Infinity, onN = 0;
    for (var c0 = 0; c0 < L.cols.length; c0++) if (S.on[L.cols[c0].layer]) onN++;
    for (var c = 0; c < L.cols.length; c++) {
      var col = L.cols[c], y = TOP, multi = col.g.length > 1, total = 0, shut = !!(S.shut && S.shut[col.k]);
      if (shut) {
        for (var j0 = 0; j0 < col.g.length; j0++) { var g0 = L.groups[col.g[j0]]; g0.sh = 1; g0.op = false; g0.hd = 0; g0.h = CLUS; g0.dx = 0; g0.y = TOP; }
        col.h = TOP + CLUS + GAP;
        if (S.on[col.layer]) { X = Math.min(X, col.x); W = Math.max(W, col.x + col.w); H = Math.max(H, col.h); }
        continue;
      }
      for (var j = 0; j < col.g.length; j++) {
        var g = L.groups[col.g[j]];
        g.sh = 0;
        g.op = !g.fold || !!(S.open && S.open[g.id]);
        g.hd = multi ? HEAD : 0;
        g.h = g.op ? g.hd + g.m.length * ROW : CLUS;
        total += g.h + GAP;
      }
      var alone = !S.narrow && onN === 1 && !!S.on[col.layer] && multi, cap = alone ? Math.ceil(total / Math.min(SUB_MAX, Math.max(1, Math.ceil(total / SUB_MIN)))) : Infinity, sub = 0, ymax = TOP;
      for (var j2 = 0; j2 < col.g.length; j2++) {
        var g2 = L.groups[col.g[j2]];
        if (alone && y > TOP && y - TOP + g2.h > cap && sub < SUB_MAX - 1) { sub++; y = TOP; }
        g2.dx = sub * (col.w + SUB_GAP);
        g2.y = y;
        y += g2.h + GAP;
        ymax = Math.max(ymax, y);
      }
      col.h = ymax;
      if (S.on[col.layer]) { X = Math.min(X, col.x); W = Math.max(W, col.x + col.w + sub * (col.w + SUB_GAP)); H = Math.max(H, ymax); }
    }
    L.X = X === Infinity ? 0 : X; L.W = W; L.H = H;
    return L;
  }
  function vis(L, S, i) { return !!S.on[L.cols[L.groups[L.nodes[i].g].c].layer]; }
  // unitOf(L, i): what node i is drawn as, itself (i), its folded group (-1 - group) or its folded column (-1 - the column's
  // first group: the cluster stands where that group would)
  function unitOf(L, i) { var n = L.nodes[i], g = L.groups[n.g]; return g.sh ? -1 - L.cols[g.c].g[0] : g.op ? i : -1 - n.g; }
  function box(L, u) {
    if (u >= 0) { var n = L.nodes[u], g = L.groups[n.g], c = L.cols[g.c]; return { x: c.x + (g.dx || 0), y: g.y + g.hd + n.k * ROW, w: c.w, h: ROW, c: g.c }; }
    var g2 = L.groups[-1 - u], c2 = L.cols[g2.c];
    return { x: c2.x + (g2.dx || 0), y: g2.y, w: c2.w, h: CLUS - 4, c: g2.c };
  }
  function path(a, b) {
    var ay = a.y + a.h / 2, by = b.y + b.h / 2, ax, bx;
    if (a.c === b.c) {
      ax = a.x + a.w + 4; var bend = Math.min(170, 26 + Math.abs(by - ay) * 0.24);
      return "M" + r1(ax) + " " + r1(ay) + "C" + r1(ax + bend) + " " + r1(ay) + " " + r1(ax + bend) + " " + r1(by) + " " + r1(ax) + " " + r1(by);
    }
    if (a.c < b.c) { ax = a.x + a.w + 4; bx = b.x - 4; } else { ax = a.x - 4; bx = b.x + b.w + 4; }
    var dx = (bx - ax) / 2;
    return "M" + r1(ax) + " " + r1(ay) + "C" + r1(ax + dx) + " " + r1(ay) + " " + r1(bx - dx) + " " + r1(by) + " " + r1(bx) + " " + r1(by);
  }
  function label(L, i, w) {
    var n = L.nodes[i], g = L.groups[n.g], s = n.n;
    if (n.t === "door" && g.pre) { var sp = s.indexOf(" "); var verb = sp > 0 ? s.slice(0, sp) : "", p = sp > 0 ? s.slice(sp + 1) : s; if (p.indexOf(g.pre) === 0) s = verb + " …" + p.slice(g.pre.length); }
    return cut(s, w - 34, 7.1);
  }
  function lightBar(lc, w) {
    var tot = lc[0] + lc[1] + lc[2] + lc[3] || 1, x = 0, out = "";
    for (var k = 0; k < 4; k++) { if (!lc[k]) continue; var ww = Math.max(2, (w * lc[k]) / tot); out += '<rect class="mx-lb" data-light="' + LIGHTS[k] + '" x="' + r1(x) + '" width="' + r1(Math.min(ww, w - x)) + '" height="3" rx="1.5"/>'; x += ww; }
    return out;
  }
  // units(L, S) -> the SVG of every group head, folded cluster and node row of the layers on (S.pin: the pinned node)
  function units(L, S) {
    var out = [];
    for (var c = 0; c < L.cols.length; c++) {
      var col = L.cols[c];
      if (!S.on[col.layer]) continue;
      // M5: a folded column is one cluster, its title and count (the find's hits of it), its lights summed
      if (L.groups[col.g[0]].sh) {
        var clc = [0, 0, 0, 0], ch = 0;
        for (var j1 = 0; j1 < col.g.length; j1++) { var G1 = L.groups[col.g[j1]]; for (var q1 = 0; q1 < 4; q1++) clc[q1] += G1.lc[q1]; if (S.hits && S.hits.g[col.g[j1]]) ch += S.hits.g[col.g[j1]]; }
        var ccnt = ch ? ch + " of " + col.n : String(col.n);
        out.push('<g class="mx-u mx-c mx-cs" data-g="' + col.g[0] + '" data-col="' + c + '" transform="translate(' + col.x + " " + TOP + ')"><title>' + esc(col.label + ": " + col.n + " nodes. Open the column.") + '</title>' +
          '<rect class="mx-cb" width="' + col.w + '" height="' + (CLUS - 4) + '" rx="7"/>' +
          '<path class="mx-chev" d="M11 11l4 4-4 4"/>' +
          '<text class="mx-ct" x="24" y="19">' + esc(cut(col.label, col.w - 44 - ccnt.length * 7.4, 7.3)) + "</text>" +
          '<text class="mx-cn' + (ch ? " mx-cnh" : "") + '" x="' + (col.w - 10) + '" y="19" text-anchor="end">' + ccnt + "</text>" +
          '<g transform="translate(10 ' + (CLUS - 10) + ')">' + lightBar(clc, col.w - 20) + "</g></g>");
        continue;
      }
      for (var j = 0; j < col.g.length; j++) {
        var gi = col.g[j], g = L.groups[gi];
        if (!g.op) {
          var cnt = S.hits && S.hits.g[gi] ? S.hits.g[gi] + " of " + g.m.length : String(g.m.length);
          // ?impact= (sprint 3 B4): a folded group holding a node one hop out of the change shows lit, as that node would
          var gimp = S.imp && g.m.some(function (i) { return S.imp.t[i] || S.imp.r[i]; }) ? " mx-imp2" : "";
          out.push('<g class="mx-u mx-c' + gimp + '" data-g="' + gi + '" transform="translate(' + (col.x + (g.dx || 0)) + " " + g.y + ')"><title>' + esc(g.label + ": " + g.m.length + " nodes. Open the group.") + '</title>' +
            '<rect class="mx-cb" width="' + col.w + '" height="' + (CLUS - 4) + '" rx="7"/>' +
            '<path class="mx-chev" d="M11 11l4 4-4 4"/>' +
            '<text class="mx-ct" x="24" y="19">' + esc(cutGroup(g.label, col.w - 44 - cnt.length * 7.4, 7.3)) + "</text>" +
            '<text class="mx-cn' + (S.hits && S.hits.g[gi] ? " mx-cnh" : "") + '" x="' + (col.w - 10) + '" y="19" text-anchor="end">' + cnt + "</text>" +
            '<g transform="translate(10 ' + (CLUS - 10) + ')">' + lightBar(g.lc, col.w - 20) + "</g></g>");
          continue;
        }
        // D1b item 21: an open group's header carries its whole name as a title (a cut label is never the only way to read it)
        if (g.hd) out.push('<g class="mx-u mx-h' + (g.fold ? " mx-fold" : "") + '" data-g="' + gi + '" transform="translate(' + (col.x + (g.dx || 0)) + " " + g.y + ')"><title>' + esc(g.label) + "</title>" +
          (g.fold ? '<rect class="mx-hb" width="' + col.w + '" height="' + (HEAD - 4) + '" rx="6"/><path class="mx-chev" d="M8 9l4 4 4-4"/>' : "") +
          '<text class="mx-ht" x="' + (g.fold ? 22 : 2) + '" y="15">' + esc(cutGroup(g.label, col.w - 60, 6.6)) + '</text><text class="mx-hn" x="' + (col.w - 6) + '" y="15" text-anchor="end">' + g.m.length + "</text></g>");
        for (var k = 0; k < g.m.length; k++) {
          var i = g.m[k], n = L.nodes[i], y = g.y + g.hd + k * ROW;
          out.push('<g class="mx-u mx-n' + (S.pin === i ? " mx-pin" : "") + (S.imp ? (S.imp.t[i] ? " mx-imp" : S.imp.r[i] ? " mx-imp2" : "") : "") + '" data-i="' + i + '" data-t="' + n.t + '" data-light="' + n.l + '"' + (n.z ? ' data-stale="' + n.z + '"' : "") + (n.s ? ' data-st="' + esc(n.s) + '"' : "") + ' transform="translate(' + (col.x + (g.dx || 0)) + " " + y + ')"><title>' + esc(n.n) + (n.z ? " (" + n.z + " stale)" : "") + "</title>" +
            '<rect class="mx-nb" x="-5" y="1" width="' + (col.w + 10) + '" height="' + (ROW - 2) + '" rx="6"/><circle class="mx-ring" cx="9" cy="' + ROW / 2 + '" r="4.5"/><circle class="mx-dot" cx="9" cy="' + ROW / 2 + '" r="4.5"/>' +
            '<text class="mx-t" x="22" y="' + (ROW / 2 + 4.5) + '">' + esc(label(L, i, col.w)) + "</text></g>");
        }
      }
    }
    return out.join("");
  }
  // links(L, S) -> the SVG of the links at rest: the kinds in L.rest between drawn ends, bundled per pair of units
  function links(L, S) {
    var rest = {}, agg = {}, keys = [];
    for (var r = 0; r < L.rest.length; r++) rest[L.rest[r]] = 1;
    for (var q = 0; q < L.links.length; q += 3) {
      var a = L.links[q], b = L.links[q + 1];
      if (!rest[L.links[q + 2]] || !vis(L, S, a) || !vis(L, S, b)) continue;
      var ua = unitOf(L, a), ub = unitOf(L, b);
      if (ua === ub) continue;
      var key = ua + " " + ub;
      if (!agg[key]) { agg[key] = 0; keys.push(key); }
      agg[key]++;
    }
    var out = [];
    for (var t = 0; t < keys.length; t++) {
      var p = keys[t].split(" "), w = agg[keys[t]];
      out.push('<path class="mx-l" d="' + path(box(L, +p[0]), box(L, +p[1])) + '" stroke-width="' + (w >= 12 ? 2.8 : w >= 4 ? 1.9 : 1.2) + '" data-a="' + p[0] + '" data-b="' + p[1] + '"/>');
    }
    return out.join("");
  }
  // hl(L, S, i, adj) -> { svg, nb }: node i's own links, every kind, to the drawn units they reach, and those units
  function hl(L, S, i, adj) {
    var ui = unitOf(L, i), bi = box(L, ui), seen = {}, out = [], nb = [];
    var list = adj[i] || [];
    for (var q = 0; q < list.length; q++) {
      var o = list[q];
      if (!vis(L, S, o)) continue;
      var uo = unitOf(L, o);
      if (uo === ui || seen[uo]) continue;
      seen[uo] = 1; nb.push(uo);
      out.push('<path class="mx-l mx-lh" d="' + path(bi, box(L, uo)) + '"/>');
    }
    return { svg: out.join(""), nb: nb };
  }
  return { ROW: ROW, HEAD: HEAD, CLUS: CLUS, GAP: GAP, TOP: TOP, esc: esc, cut: cut, stack: stack, unitOf: unitOf, box: box, path: path, units: units, links: links, hl: hl, vis: vis };
}
