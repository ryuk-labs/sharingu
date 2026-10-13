// src/archview.js — the Map's Arch view (sprint 3): the project's architecture drawn as a living diagram, the same for every
// project (one product: what differs is the data). Read off the architecture node (k_nodes type architecture, its
// data.diagram and data.crossing) and the project's service nodes, both already in the arch part the page reads
// (src/knowledge/canvas.js PARTS.architecture): this view adds no read.
//
//   archModel(architecture) -> M   the diagram normalised: bands (the diagram's groups in the order filed, or their
//                                   `order`; a part in no group lands in a band named by its kind), parts, links (from/to, or
//                                   the older "a->b" and drawn paths joined to the parts at their two ends), the journeys
//                                   Play walks (data.diagram.paths, else the longest chain of links), the crossing rules and
//                                   the parts each names, the seam, the services. Pure.
//   archKit()                       SELF-CONTAINED (src/archclient.js embeds it by its own source, so the server's first paint
//                                   and a phone's redraw are the same code): layout(M, {narrow}) -> L, a layered layout (bands
//                                   as horizontal rows top to bottom, parts placed in their band, crossings lowered, links as
//                                   cubic curves between spread ports; M5: a lane folded is one bar, its title and count, the
//                                   links to its parts ending at it); draw(M, L, {still}) -> the SVG's inner markup; jset(M, p)
//                                   -> the parts and links of journey p (the filter).
//   walkOf(M)                       the fallback journey: the longest chain of links (by count), deterministic.
//   meaningOf(M, marks, nowMs)      M4: what the dots say, from the marks the arch part reads (src/knowledge/canvas.js
//                                   archMarksOf, ONE statement): a part's light (its own, or the service it runs on: the worse),
//                                   its stale checks, the check that fails or went stale (its title), whether it changed this
//                                   week (the week of src/week.js: the last 7 x 24 hours); a link to a red part fails; a journey
//                                   blocks at its first step touching a red or stale part. Pure; archModel runs it.
//   renderArchView(o)               the page part under the Map's toolbar: the stage (data-region lanes), the side (the
//                                   journeys, data-region crossing-rules, seam and org-worker), the data and the client.
// Motion is the shared system's (src/shell.js MOTION_CSS keyframes u-rise and u-draw-in), all of it behind html.u-motion:
// under reduced motion, or without script, the diagram is drawn complete and nothing moves.
import { empty, copyBtn } from "./parts.js";
import { esc, unreachableState } from "./ui.js";
import { ownerHref } from "./mapnode.js";   // M3
import { WEEK_DAYS } from "./hotsql.js";
import { ARCH_NODES_MAX, nodeIdOf } from "./knowledge/canvas.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "./project.js";   // sprint 13 (13.2): a page names a project by its slug, never its org-prefixed key

export const ARCH_REGIONS = ["lanes", "seam", "org-worker", "crossing-rules"];
export const ARCH_CALL = 'preview { items: [{ kind: "node", op: "upsert", data: { id: "architecture:main", type: "architecture", name: "Architecture", data: { diagram: { groups, nodes, edges, paths }, crossing } } }] }, then file';
export const NO_ARCH = 'No architecture is drawn yet: file it through preview then save_knowledge (an item of kind "node", type "architecture", its data.diagram).';
export const NO_LINKS = "No link is filed yet, so nothing moves and there is nothing to play: add data.diagram.edges {from, to, label}.";
export const ARCH_DOWN = "The project's architecture could not be read, so the diagram draws nothing until it answers.";
// the bands a part with no group lands in, by its kind (a kind not listed names its own band)
export const KIND_BAND = { client: "Clients", clients: "Clients", user: "Clients", browser: "Clients", agent: "Clients", external: "Outside services", "external-key": "Outside services",
  service: "Services", data: "Stores", store: "Stores", seam: "The seam", local: "Local tools" };
const TOP_BANDS = ["Clients"];
export const LIMITS = { bands: 24, nodes: ARCH_NODES_MAX, links: 400, paths: 12, steps: 40, rules: 40 };

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const str = (v) => typeof v === "string" && v.trim() !== "";
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ").replace(/\s+/g, " ").trim();
const clip = (s, n) => { const t = noDash(s); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const capWord = (s) => { const t = String(s || "").replace(/[-_]+/g, " ").trim(); return t ? t[0].toUpperCase() + t.slice(1) : ""; };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- the model ----
export function archModel(arch, o = {}) {
  const a = isObj(arch) ? arch : {}, d = isObj(a.diagram) ? a.diagram : {};
  const services = servicesOf(a.services, d.nodes)
    .map((s) => ({ id: String(s.id), name: clip(s.name || s.id, 80), uses: list(s.uses).filter(str).slice(0, 6).map((u) => clip(u, 280)) }));
  const groups = [], seenG = new Set();
  for (const g of list(d.groups)) {
    if (!isObj(g) || !str(g.id) || seenG.has(String(g.id)) || groups.length >= LIMITS.bands) continue;
    seenG.add(String(g.id));
    groups.push({ id: String(g.id), label: clip(g.label || g.id, 90), order: num(g.order), x: num(g.x), y: num(g.y), w: num(g.w), h: num(g.h), i: groups.length });
  }
  let raw = [];
  const seenN = new Set();
  for (const n of list(d.nodes)) {
    if (!isObj(n) || !str(n.id) || seenN.has(String(n.id)) || raw.length >= LIMITS.nodes) continue;
    seenN.add(String(n.id)); raw.push(n);
  }
  // no part drawn but services filed: the services are the parts (one band), so a project with only its services still shows
  const fromServices = !raw.length && services.length > 0;
  if (fromServices) raw = services.map((s) => ({ id: s.id, title: s.name, sub: s.uses[0] || "", kind: "service", service: s.id }));
  const hasXY = groups.some((g) => g.y != null) || raw.some((n) => num(n.y) != null);
  const ordered = groups.some((g) => g.order != null);
  const rect = (n) => ({ x: num(n.x), y: num(n.y), w: num(n.w) || 160, h: num(n.h) || 44 });
  const inRect = (n, g) => { const r = rect(n); return r.x != null && r.y != null && g.x != null && g.y != null && g.w != null && g.h != null && r.x >= g.x && r.y >= g.y && r.x < g.x + g.w && r.y < g.y + g.h; };
  const bands = groups.map((g) => ({ id: g.id, label: g.label, syn: false, g, members: [] }));
  const bandOf = new Map(bands.map((b) => [b.id, b]));
  const nodes = raw.map((n, i) => {
    const kind = clip(String(n.kind || ""), 40);
    let band = str(n.group) && bandOf.has(String(n.group)) ? bandOf.get(String(n.group)) : null;
    if (!band) { const g = groups.find((x) => inRect(n, x)); if (g) band = bandOf.get(g.id); }
    if (!band) {
      const label = fromServices ? "Services" : KIND_BAND[kind] || (kind ? capWord(kind) : "Other parts");
      const id = "kind:" + slug(label);
      band = bandOf.get(id);
      if (!band) { band = { id, label, syn: true, members: [], first: i }; bands.push(band); bandOf.set(id, band); }
    }
    const r = rect(n);
    const node = { id: String(n.id), title: clip(n.title || n.name || n.id, 80), sub: clip(n.sub || "", 200), about: clip(n.about || "", 600), kind,
      service: str(n.service) ? String(n.service) : "", x: r.x, y: r.y, w: r.w, h: r.h, i, owner: ownerOfPart(a, n) };
    band.members.push(node);
    node.band = band;
    return node;
  });
  // the bands' order: `order` when any group declares one, else the diagram's own top-to-bottom, else the order filed; a band
  // made for a kind sits first when it holds clients, else last
  const rank = (b) => {
    const top = TOP_BANDS.includes(b.label);
    if (b.syn) {
      if (!ordered && hasXY && b.members.every((m) => m.y != null)) return b.members.reduce((s, m) => s + m.y, 0) / Math.max(1, b.members.length);
      return (top ? -1e6 : 1e6) + b.first;
    }
    if (ordered) return b.g.order != null ? b.g.order : 1000 + b.g.i;
    if (hasXY && b.g.y != null) return b.g.y;
    return b.g.i;
  };
  const sorted = bands.map((b, k) => ({ b, k, r: rank(b) })).sort((x, y) => x.r - y.r || x.k - y.k).map((x) => x.b);
  sorted.forEach((b, bi) => { b.idx = bi; });
  // a band's parts in the diagram's own left-to-right when it is drawn with coordinates, else in the order filed
  for (const b of sorted) if (hasXY && b.members.every((m) => m.x != null)) b.members.sort((p, q) => (p.y - q.y > 20 ? 1 : q.y - p.y > 20 ? -1 : 0) || p.x - q.x || p.i - q.i);
  const order = sorted.flatMap((b) => b.members);
  const index = new Map(order.map((n, i) => [n.id, i]));
  const outNodes = order.map((n) => ({ id: n.id, title: n.title, sub: n.sub, about: n.about, kind: n.kind, service: n.service, b: n.band.idx, ...(n.owner ? { owner: n.owner } : {}) }));
  // links: {from, to} (or the older "a->b"; a drawn path is joined to the parts at its two ends)
  const near = (x, y) => {
    let best = null, bd = 31;
    for (const n of nodes) { if (n.x == null || n.y == null) continue; const dx = Math.max(n.x - x, 0, x - n.x - n.w), dy = Math.max(n.y - y, 0, y - n.y - n.h), dd = Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = n.id; } }
    return best;
  };
  const links = [], seenL = new Map();
  for (const e of [...list(d.edges), ...list(d.links)]) {
    if (!isObj(e) || links.length >= LIMITS.links) continue;
    let f = null, t = null;
    if (str(e.from) && str(e.to)) { f = String(e.from); t = String(e.to); }
    else if (str(e.d)) {
      const m = /^\s*([\w.:-]+)\s*->\s*([\w.:-]+)\s*$/.exec(e.d);
      if (m) { f = m[1]; t = m[2]; }
      else { const ns = (String(e.d).match(/-?\d+(?:\.\d+)?/g) || []).map(Number); if (ns.length >= 4) { f = near(ns[0], ns[1]); t = near(ns[ns.length - 2], ns[ns.length - 1]); } }
    }
    if (!f || !t || f === t || !index.has(f) || !index.has(t)) continue;
    const k = f + ">" + t;
    if (seenL.has(k)) { if (e.main === true) links[seenL.get(k)].main = true; continue; }
    seenL.set(k, links.length);
    links.push({ a: index.get(f), b: index.get(t), label: clip(e.label || e.says || "", 140), main: e.main === true });
  }
  // the journeys: filed paths, else the longest chain
  const title = (i) => outNodes[i].title;
  const says = (a, b, li) => `${title(a)} to ${title(b)}${li >= 0 && links[li].label ? ": " + links[li].label : ""}`;
  const M = { bands: sorted.map((b) => ({ id: b.id, label: b.label, syn: b.syn, product: b.members.some((m) => m.kind === "worker"), n: b.members.length })),
    nodes: outNodes, links, paths: [], rules: [], seam: null, seamNode: -1, services, summary: clip(a.summary || "", 600), fromServices, filedPaths: false };
  let paths = [];
  for (const p of list(d.paths)) {
    if (!isObj(p) || !str(p.name) || paths.length >= LIMITS.paths) continue;
    const steps = list(p.steps).filter((s) => isObj(s) && index.has(String(s.from)) && index.has(String(s.to)) && String(s.from) !== String(s.to)).slice(0, LIMITS.steps).map((s) => {
      const a2 = index.get(String(s.from)), b2 = index.get(String(s.to)), li = seenL.has(`${s.from}>${s.to}`) ? seenL.get(`${s.from}>${s.to}`) : -1;
      return { a: a2, b: b2, l: li, says: clip(s.says || "", 160) || says(a2, b2, li) };
    });
    if (steps.length) paths.push({ name: clip(p.name, 80), steps });
  }
  M.filedPaths = paths.length > 0;
  if (!paths.length) {
    const w = walkOf(M);
    if (w.length) paths = [{ name: "The longest chain", auto: true, steps: w.map((li) => ({ a: links[li].a, b: links[li].b, l: li, says: says(links[li].a, links[li].b, li) })) }];
  }
  M.paths = paths;
  meaningOf(M, a.marks, o.nowMs);
  // the crossing rules, each with the parts it names (its own data.nodes, else the parts whose title it says as a word)
  M.rules = list(a.crossing).filter((r) => isObj(r) && str(r.rule)).slice(0, LIMITS.rules).map((r) => {
    const text = clip(r.rule, 400);
    let ns = list(r.nodes).map(String).filter((id) => index.has(id)).map((id) => index.get(id));
    if (!ns.length) {
      const low = text.toLowerCase();
      ns = outNodes.map((n, i) => [n.title.toLowerCase(), i]).filter(([t]) => t.length >= 2 && new RegExp(`(^|[^a-z0-9])${reEsc(t)}([^a-z0-9]|$)`).test(low)).map(([, i]) => i);
    }
    return { rule: text, because: list(r.because).filter(str).slice(0, 6).map(String), nodes: [...new Set(ns)].slice(0, 16) };
  });
  // the seam: a band the diagram names (data.diagram.seam {group, label}), else a part of kind "seam"
  const sm = isObj(d.seam) ? d.seam : null;
  const sb = sm && str(sm.group) ? M.bands.findIndex((b) => b.id === String(sm.group)) : -1;
  if (sb >= 0) M.seam = { b: sb, label: clip(sm.label || "The seam", 90) };
  else M.seamNode = outNodes.findIndex((n) => n.kind === "seam");
  return M;
}

// ownerOfPart(arch, part) -> M3: the project that owns a part, { key, name, href } (href: its Map, finding the part, only when the
// reader may read it, else null), or null: the part's own ownedBy, else the ownedBy of the service it runs on, named from
// arch.owners (src/mapnode.js archOwnersOf, the page's one read of the projects table)
function ownerOfPart(a, n) {
  const sv = str(n.service) ? list(a.services).find((x) => isObj(x) && String(x.id) === String(n.service)) : null;
  const key = str(n.ownedBy) ? String(n.ownedBy) : sv && str(sv.ownedBy) ? String(sv.ownedBy) : "";
  const o = key && isObj(a.owners) && isObj(a.owners[key]) ? a.owners[key] : null;
  return o ? { key, name: clip(o.name || key, 80), href: o.may ? ownerHref(key, String(n.id)) : null } : null;
}

// servicesOf(services, parts) -> the services the view keeps, in the order filed: every one a drawn part names (its "Runs on"),
// then the others up to SERVICES in all (M2 found siru's 156 services cut at the first 60, so its parts showed no "Runs on")
export const SERVICES = 60;
export function servicesOf(services, parts) {
  const all = list(services).filter((s) => isObj(s) && str(s.id));
  const named = new Set(list(parts).slice(0, LIMITS.nodes).filter((n) => isObj(n) && str(n.service)).map((n) => String(n.service)));
  let room = Math.max(0, SERVICES - all.filter((s) => named.has(String(s.id))).length);
  return all.filter((s) => named.has(String(s.id)) || room-- > 0);
}

// walkOf(M) -> [link index]: the longest chain of links, followed in their direction, no part twice (a bounded search:
// the first longest found wins, so the same model walks the same chain)
export function walkOf(M) {
  const out = M.nodes.map(() => []);
  M.links.forEach((l, i) => out[l.a].push(i));
  let best = [], budget = 40000;
  const seen = new Set();
  const dfs = (n, path) => {
    if (--budget < 0) return;
    if (path.length > best.length) best = path.slice();
    for (const li of out[n]) { const t = M.links[li].b; if (seen.has(t)) continue; seen.add(t); path.push(li); dfs(t, path); path.pop(); seen.delete(t); }
  };
  for (let s = 0; s < M.nodes.length && budget > 0; s++) { seen.clear(); seen.add(s); dfs(s, []); }
  return best;
}

// meaningOf(M, marks, nowMs) -> M, marked in place (only what says something is added, so a diagram with nothing graded and
// nothing changed carries what it carried before): a part {light (red · amber · green), stale (the stale checks naming it or
// its service), check {id, title, stale} (the first failing check, else the first stale one), regrade [stale check ids],
// changed (the day, when it changed this week)}; a link {fail: true} (a red part at either end); a journey {block: {step,
// part}} (its first step touching a blocked part: red, or stale); M.lit {fail, changed, blocked} the counts.
const RANK = { red: 3, amber: 2, green: 1, grey: 0 };
export function meaningOf(M, marks, nowMs) {
  const mk = isObj(marks) ? marks : {};
  const since = new Date((nowMs || Date.now()) - WEEK_DAYS * 864e5).toISOString();
  const of = (id) => (isObj(mk[id]) ? mk[id] : null);
  M.nodes.forEach((n) => {
    const own = [of(n.id), n.service ? of(nodeIdOf("service", n.service)) : null].filter(Boolean);
    if (!own.length) return;
    const light = own.map((m) => String(m.light || "grey")).reduce((x, y) => ((RANK[y] || 0) > (RANK[x] || 0) ? y : x), "grey");
    if (light !== "grey" && RANK[light]) n.light = light;
    const stale = own.reduce((t, m) => t + (Number(m.stale) || 0), 0);
    if (stale) n.stale = stale;
    const fail = own.map((m) => m.failing).find((c) => isObj(c) && str(c.id));
    const zc = [...new Map(own.flatMap((m) => list(m.staleChecks)).filter((c) => isObj(c) && str(c.id)).map((c) => [String(c.id), c])).values()].slice(0, 12);
    if (n.light === "red" && fail) n.check = { id: String(fail.id), title: clip(fail.title || fail.id, 160), stale: false };
    else if (stale && zc.length) n.check = { id: String(zc[0].id), title: clip(zc[0].title || zc[0].id, 160), stale: true };
    if (stale && zc.length) n.regrade = zc.map((c) => String(c.id));
    const at = own.map((m) => (str(m.changedAt) ? String(m.changedAt) : "")).sort().pop();
    if (at && at >= since) n.changed = at.slice(0, 10);
  });
  const blocked = (i) => M.nodes[i].light === "red" || !!M.nodes[i].stale;
  M.links.forEach((l) => { if (M.nodes[l.a].light === "red" || M.nodes[l.b].light === "red") l.fail = true; });
  M.paths.forEach((p) => {
    const k = p.steps.findIndex((s) => blocked(s.a) || blocked(s.b));
    if (k >= 0) p.block = { step: k, part: blocked(p.steps[k].b) && !(k === 0 && blocked(p.steps[k].a)) ? p.steps[k].b : p.steps[k].a };
  });
  M.lit = { fail: M.links.filter((l) => l.fail).length, changed: M.nodes.filter((n) => n.changed).length, blocked: M.paths.filter((p) => p.block).length };
  return M;
}

// ---- the kit: the layout and the drawing, self-contained (embedded by its own source in src/archclient.js) ----
export function archKit() {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var cut = function (s, n) { s = String(s || ""); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s; };
  var f1 = function (v) { return Math.round(v * 10) / 10; };
  // wrap(s, n) -> at most two lines of at most n characters, broken between words, the second cut when it runs over
  var wrap = function (s, n) {
    var w = String(s || "").split(" "), a = "", i = 0;
    while (i < w.length && (a + (a ? " " : "") + w[i]).length <= n) { a += (a ? " " : "") + w[i]; i++; }
    if (!a) return [cut(s, n)];
    var b = w.slice(i).join(" ");
    return b ? [a, cut(b, n)] : [a];
  };
  // the order of the parts in each band: the order given, then barycentre sweeps (each part toward the mean place of its
  // neighbours in the bands above, then below), kept only when they lower the crossings
  function bands(M) { var by = M.bands.map(function () { return []; }); M.nodes.forEach(function (n, i) { by[n.b].push(i); }); return by; }
  function crossings(M, by) {
    var at = []; by.forEach(function (ids) { ids.forEach(function (n, k) { at[n] = (k + 0.5) / ids.length; }); });
    var ls = M.links.filter(function (l) { return M.nodes[l.a].b !== M.nodes[l.b].b; }).map(function (l) {
      var p = M.nodes[l.a].b < M.nodes[l.b].b; return { u: p ? l.a : l.b, v: p ? l.b : l.a, bu: Math.min(M.nodes[l.a].b, M.nodes[l.b].b), bv: Math.max(M.nodes[l.a].b, M.nodes[l.b].b) }; });
    var c = 0;
    for (var i = 0; i < ls.length; i++) for (var j = i + 1; j < ls.length; j++) { var x = ls[i], y = ls[j]; if (x.bu !== y.bu || x.bv !== y.bv) continue; if ((at[x.u] - at[y.u]) * (at[x.v] - at[y.v]) < 0) c++; }
    return c;
  }
  function order(M) {
    var by = bands(M);
    if (M.links.length > 300 || M.nodes.length > 160) return by;
    var nb = M.nodes.map(function () { return []; });
    M.links.forEach(function (l) { nb[l.a].push(l.b); nb[l.b].push(l.a); });
    var best = by.map(function (r) { return r.slice(); }), bc = crossings(M, by), cur = best.map(function (r) { return r.slice(); });
    function sweep(b, up) {
      var at = []; cur.forEach(function (ids) { ids.forEach(function (n, k) { at[n] = (k + 0.5) / ids.length; }); });
      var key = cur[b].map(function (n) { var s = 0, c = 0; nb[n].forEach(function (m) { var mb = M.nodes[m].b; if (up ? mb > b : mb < b) { s += at[m]; c++; } }); return { n: n, k: c ? s / c : at[n] }; });
      key.sort(function (p, q) { return p.k - q.k || at[p.n] - at[q.n]; });
      cur[b] = key.map(function (x) { return x.n; });
    }
    for (var it = 0; it < 4; it++) {
      for (var b = 1; b < cur.length; b++) sweep(b, false);
      for (var b2 = cur.length - 2; b2 >= 0; b2--) sweep(b2, true);
      var c = crossings(M, cur); if (c < bc) { bc = c; best = cur.map(function (r) { return r.slice(); }); }
    }
    return best;
  }
  // layout(M, {narrow, per, nw, sy, shut}) -> L: {W, H, narrow, per, mx, top, sk, bands: [{y, h, s}], nodes: [{x, y, w, h, s}], links:
  // [{c: the cubic's 8 numbers, d, h}]}; per: the most parts a row holds (default 6), nw a part's width (default 200), sy how much
  // room the links get between the bands (1 to 2.2): the client picks what fits its stage best. shut (band index -> 1, M5): a
  // lane folded to one bar (s), its parts all standing at the bar so their links end at it, a link inside it not drawn (h)
  function layout(M, o) {
    o = o || {};
    var shut = o.shut || {}, sk = Object.keys(shut).filter(function (k) { return shut[k]; }).sort().join(",");
    var narrow = !!o.narrow, NW = narrow ? 158 : Math.max(140, Math.min(240, o.nw || 200)), NH = narrow ? 66 : 72, GX = narrow ? 12 : NW >= 190 ? 36 : NW >= 165 ? 28 : 22, GY = 24, PER = narrow ? 2 : Math.max(2, Math.min(8, o.per || 6)), MX = narrow ? 12 : 52, SY = narrow ? 1 : Math.max(1, Math.min(2.2, o.sy || 1)), TOP = narrow ? 46 : Math.round(60 * Math.min(SY, 1.4)), BOT = narrow ? 36 : Math.round(62 * SY), EMPTY = 30;
    var by = order(M), most = 1, SH = narrow ? 44 : 56;
    // a band wider than PER wraps into balanced rows (7 at 6 a row: 4 and 3, never 6 and 1)
    var per = function (n) { return Math.ceil(n / Math.max(1, Math.ceil(n / PER))); };
    var isShut = function (bi) { return !!shut[bi] && by[bi].length > 0; };
    by.forEach(function (ids, bi) { if (!isShut(bi)) most = Math.max(most, per(ids.length)); });
    var W = Math.max(narrow ? 340 : 960, MX * 2 + most * NW + (most - 1) * GX), pos = [], bs = [], y = 0;
    by.forEach(function (ids, bi) {
      if (isShut(bi)) {
        var bar = { x: f1(MX - 10), y: y + 10, w: f1(W - 2 * MX + 20), h: SH - 20, s: 1 };
        for (var q = 0; q < ids.length; q++) pos[ids[q]] = bar;
        bs.push({ y: y, h: SH, s: 1 }); y += SH; return;
      }
      var pr = per(ids.length), rows = Math.ceil(ids.length / Math.max(1, pr)), h = ids.length ? TOP + rows * NH + (rows - 1) * GY + BOT : TOP + EMPTY;
      for (var k = 0; k < ids.length; k++) {
        var r = Math.floor(k / pr), inRow = Math.min(pr, ids.length - r * pr), c = k - r * pr, rowW = inRow * NW + (inRow - 1) * GX;
        pos[ids[k]] = { x: f1((W - rowW) / 2 + c * (NW + GX)), y: y + TOP + r * (NH + GY), w: NW, h: NH };
      }
      bs.push({ y: y, h: h }); y += h;
    });
    // each link leaves one side of a part and enters one side of the other (below: bottom to top; above: top to bottom; side
    // by side: an arch over the top); the ports on one side spread in the order of the other ends, so links do not cross there
    // (a folded lane's bar is one place: its ports are the bar's, spread across it)
    var ports = {}, ends = [];
    var portOf = function (n, side) { return (pos[n].s ? "b" + M.nodes[n].b : n) + side; };
    M.links.forEach(function (l, i) {
      var A = pos[l.a], B = pos[l.b], sa, sb;
      if (A === B) { ends.push(null); return; }
      if (A.y + A.h <= B.y - 1) { sa = "b"; sb = "t"; } else if (B.y + B.h <= A.y - 1) { sa = "t"; sb = "b"; } else { sa = "t"; sb = "t"; }
      ends.push([sa, sb]);
      var ka = portOf(l.a, sa), kb = portOf(l.b, sb);
      (ports[ka] = ports[ka] || { P: A, l: [] }).l.push({ i: i, end: 0, o: B.x + B.w / 2 });
      (ports[kb] = ports[kb] || { P: B, l: [] }).l.push({ i: i, end: 1, o: A.x + A.w / 2 });
    });
    var px = M.links.map(function () { return [0, 0]; });
    Object.keys(ports).forEach(function (k) {
      var ps = ports[k].l, P = ports[k].P, sp = ps.length > 1 ? Math.min(18, (P.w - 48) / (ps.length - 1)) : 0;
      ps.sort(function (p, q) { return p.o - q.o || p.i - q.i; });
      ps.forEach(function (p, j) { px[p.i][p.end] = P.x + P.w / 2 + (j - (ps.length - 1) / 2) * sp; });
    });
    var ls = M.links.map(function (l, i) {
      if (!ends[i]) return { c: null, d: "", h: 1 };
      var A = pos[l.a], B = pos[l.b], s = ends[i], x0 = px[i][0], x3 = px[i][1];
      var y0 = s[0] === "b" ? A.y + A.h : A.y, y3 = s[1] === "b" ? B.y + B.h : B.y, c1, c2;
      if (s[0] === "t" && s[1] === "t") { var lift = 34 + Math.abs(x3 - x0) * 0.12; c1 = Math.min(y0, y3) - lift; c2 = c1; }
      else { var dy = Math.max(36, Math.abs(y3 - y0) * 0.5); c1 = s[0] === "b" ? y0 + dy : y0 - dy; c2 = s[1] === "t" ? y3 - dy : y3 + dy; }
      var c = [f1(x0), f1(y0), f1(x0), f1(c1), f1(x3), f1(c2), f1(x3), f1(y3)];
      return { c: c, d: "M" + c[0] + " " + c[1] + "C" + c[2] + " " + c[3] + " " + c[4] + " " + c[5] + " " + c[6] + " " + c[7] };
    });
    return { W: f1(W), H: y, narrow: narrow, per: narrow ? 2 : PER, nw: NW, sy: SY, sk: sk, wrap: by.some(function (ids, bi) { return !isShut(bi) && ids.length > PER; }), mx: MX, top: TOP, bands: bs, nodes: pos, links: ls };
  }
  // draw(M, L, {still}) -> the SVG's inner markup (a band per lane with its hairline and label, the label its fold; a folded lane
  // its bar; the links; the seam, the ONE accented line; the dots' and the journey's layers; the parts). `still` leaves out the
  // open animation's delays.
  function draw(M, L, o) {
    o = o || {};
    var t = function (ms) { return o.still ? "" : ' style="--t:' + Math.round(ms) + 'ms"'; };
    var tc = Math.floor((L.nodes.length ? L.nodes[0].w : 200) / 8.6) - 1, sc = Math.floor(((L.nodes.length ? L.nodes[0].w : 200) - 28) / 6.1);
    var bandsSvg = M.bands.map(function (b, i) {
      var B = L.bands[i], seam = M.seam && M.seam.b === i, lab = cut(String(b.label).toUpperCase(), L.narrow ? 34 : 70);
      return '<g class="ar-band' + (B.s ? " ar-shut" : "") + '" data-lane="' + esc(b.id) + '" data-product="' + (b.product ? "yes" : "no") + '" data-b="' + i + '"' + t(i * 80) + '>' +
        '<rect class="ar-bandbg" x="0" y="' + B.y + '" width="' + L.W + '" height="' + B.h + '"/>' +
        (B.s ? '<rect class="ar-shutb" x="' + f1(L.mx - 10) + '" y="' + (B.y + 10) + '" width="' + f1(L.W - 2 * L.mx + 20) + '" height="' + (B.h - 20) + '" rx="10"/>' : "") +
        (seam || i === 0 ? "" : '<line class="ar-bandl" x1="0" y1="' + B.y + '" x2="' + L.W + '" y2="' + B.y + '"/>') +
        (b.n ? "" : '<text class="ar-bande" x="' + L.mx + '" y="' + (B.y + L.top + 12) + '">Nothing is filed in this lane yet.</text>') + "</g>";
    }).join("");
    // the bands' labels sit over the links (a halo of the page under each), so a link passing never cuts one
    // M5: a lane with parts folds from its label (a chevron before it, one hit area over both); folded, the label sits in its bar
    var labelsSvg = M.bands.map(function (b, i) {
      var B = L.bands[i], lab = cut(String(b.label).toUpperCase(), L.narrow ? 34 : 70), lx = L.mx + (b.n ? 18 : 0);
      var text = '<text class="ar-bandt' + (b.product ? " ar-bandtp" : "") + (B.s ? " ar-bandts" : "") + '" x="' + lx + '" y="' + (B.y + 28) + '">' + esc(lab) + '<tspan class="ar-bandn" dx="10">' + b.n + "</tspan></text>";
      if (!b.n) return '<g' + t(i * 80) + '>' + text + "</g>";
      return '<g class="ar-fold" data-b="' + i + '" tabindex="0" role="button" aria-expanded="' + (B.s ? "false" : "true") + '" aria-label="' + (B.s ? "Open lane " : "Fold lane ") + esc(lab) + '"' + t(i * 80) + '><title>' + (B.s ? "Open lane" : "Fold lane") + '</title><rect class="ar-foldhit" x="' + (L.mx - 6) + '" y="' + (B.y + 13) + '" width="' + f1((lab.length + 2 + String(b.n).length) * 7.6 + 34) + '" height="22" rx="6"/>' +
        '<path class="ar-chev" d="' + (B.s ? "M" + (L.mx + 2) + " " + (B.y + 20) + "l4 4-4 4" : "M" + L.mx + " " + (B.y + 21) + "l4 4 4-4") + '"/>' + text + "</g>";
    }).join("");
    var linksSvg = M.links.map(function (l, i) {
      if (L.links[i].h) return "";
      // M4: a link to a part with a failing check is drawn in the danger ink (its dots too)
      return '<path class="ar-l' + (l.main ? " ar-main" : "") + (l.fail ? " ar-fail" : "") + '" data-l="' + i + '" d="' + L.links[i].d + '" pathLength="1" marker-end="url(#ar-arrow)"' + t(420 + Math.min(380, i * 18)) + "/>";
    }).join("");
    var seamSvg = "";
    if (M.seam) {
      var sy = L.bands[M.seam.b].y;
      seamSvg = '<g class="ar-seam"' + t(300) + '><line class="ar-seaml" x1="0" y1="' + sy + '" x2="' + L.W + '" y2="' + sy + '"/><text class="ar-seamt" x="' + (L.W - L.mx) + '" y="' + (L.narrow ? sy - 9 : sy + 28) + '" text-anchor="end">' + esc(cut(M.seam.label, L.narrow ? 40 : 90)) + "</text></g>";
    }
    var seenB = {};
    var nodesSvg = M.nodes.map(function (n, i) {
      var P = L.nodes[i], k = seenB[n.b] = (seenB[n.b] || 0) + 1;
      if (P.s) return "";
      // M4: a part's light (red, amber, green), its stale checks and a change this week ride on it as marks: the outline in the
      // status ink, a "changed" mark in its title line and, under motion, one pulse of its ring when the diagram opens (a redraw
      // is still: no ring, so a fold or a resize never pulses it again)
      return '<g class="ar-n" data-i="' + i + '" data-kind="' + esc(n.kind) + '"' + (i === M.seamNode ? ' data-seam="1"' : "") + (n.light ? ' data-light="' + esc(n.light) + '"' : "") + (n.stale ? ' data-stale="' + n.stale + '"' : "") + (n.changed ? ' data-changed="' + esc(n.changed) + '"' : "") + ' transform="translate(' + P.x + " " + P.y + ')"><g class="ar-nin"' + t(120 + n.b * 80 + Math.min(8, k - 1) * 26) + '>' +
        (n.changed && !o.still ? '<rect class="ar-ring" x="-3" y="-3" width="' + (P.w + 6) + '" height="' + (P.h + 6) + '" rx="13"/>' : "") +
        '<rect class="ar-nb" width="' + P.w + '" height="' + P.h + '" rx="10"/>' +
        // D2b: a title longer than the part wraps to two lines (it read "The grade at th…"); its sub then keeps one line
        (function () {
          var tl = wrap(n.title, n.changed ? tc - 8 : tc), two = tl.length > 1;
          var ty = n.sub || n.owner ? (two ? 22 : 25) : (two ? P.h / 2 - 3 : P.h / 2 + 5);
          var title = '<text class="ar-nt" x="14" y="' + ty + '">' + tl.map(function (ln, j) { return '<tspan x="14" dy="' + (j ? 17 : 0) + '">' + esc(ln) + "</tspan>"; }).join("") + "</text>";
          var sl = n.sub && !(two && n.owner) ? (two || n.owner ? [cut(n.sub, sc)] : wrap(n.sub, sc)) : [];
          // M3: the project that owns the part, its last line (the link is the pinned side's)
          if (n.owner) title += '<text class="ar-no" x="14" y="' + (two ? 58 : sl.length ? 59 : 44) + '">' + esc(cut("Owned by " + n.owner.name, sc)) + "</text>";
          var mark = n.changed ? '<text class="ar-chg" x="' + (P.w - 12) + '" y="' + ty + '" text-anchor="end">changed</text>' : "";
          return title + mark + (sl.length ? '<text class="ar-ns" x="14" y="' + (two ? 58 : 44) + '">' + sl.map(function (ln, j) { return '<tspan x="14" dy="' + (j ? 15 : 0) + '">' + esc(ln) + "</tspan>"; }).join("") + "</text>" : "");
        })() + "</g></g>";
    }).join("");
    return '<defs><marker id="ar-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ar-arrowp" d="M2 2L8.5 5L2 8"/></marker></defs>' +
      '<g class="ar-bands">' + bandsSvg + '</g><g class="ar-links" id="ar-links">' + linksSvg + '</g><g class="ar-bandls">' + labelsSvg + "</g>" + seamSvg +
      '<g class="ar-dots" id="ar-dots"></g><g class="ar-pl" id="ar-pl"></g><g class="ar-nodes" id="ar-nodes">' + nodesSvg + '</g><g class="ar-ll" id="ar-ll"></g>';
  }
  // bez(c, s) -> [x, y] on the cubic c at s (0..1 of its length, through a small length table kept on c)
  function bez(c, s) {
    if (!c.t) { var t0 = [0], px = c[0], py = c[1], tot = 0; for (var i = 1; i <= 24; i++) { var q = at(c, i / 24); tot += Math.hypot(q[0] - px, q[1] - py); t0.push(tot); px = q[0]; py = q[1]; } c.t = t0; c.len = tot; }
    var want = s * c.len, j = 1; while (j < 24 && c.t[j] < want) j++;
    var seg = c.t[j] - c.t[j - 1], f = seg > 0 ? (want - c.t[j - 1]) / seg : 0;
    return at(c, (j - 1 + f) / 24);
  }
  // jset(M, p) -> { n: {part: 1}, l: {link: 1} }: the parts and the links journey p walks (the filter keeps them), or null
  function jset(M, p) {
    var J = M.paths[p], n = {}, l = {};
    if (!J) return null;
    J.steps.forEach(function (s) { n[s.a] = 1; n[s.b] = 1; if (s.l >= 0) l[s.l] = 1; });
    return { n: n, l: l };
  }
  function at(c, u) { var v = 1 - u, a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u; return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]]; }
  return { layout: layout, draw: draw, bez: bez, jset: jset, esc: esc, cut: cut, crossings: crossings, order: order };
}

// ---- the page part ----
const plural = (n, w) => `${n} ${n === 1 ? w : w + "s"}`;
// stageOf(M, L) -> the world box the first paint fits by itself (preserveAspectRatio), so nothing moves when the script comes
export const boxOf = (L) => ({ x: -24, y: -14, w: L.W + 48, h: L.H + 28 });

// renderArchView(o) -> the Arch view under the Map's toolbar. o: { arch (the arch plane's body, null when it failed),
// architecture (the canvas's architecture part: summary, diagram, crossing, services), project, client (the view's script,
// src/archclient.js ARCH_CLIENT: handed in, so this module and the script that embeds its kit never import each other) }
export function renderArchView(o = {}) {
  const b = o.arch, R = (b && b.regions) || {};
  const seam = R.seam || {}, ow = R["org-worker"] || {}, sc = seam.counts || {};
  if (!b) {
    return `${ARCH_CSS}<div class="mx-body ar-body"><section class="ar-stage ar-state" data-region="lanes">${unreachableState({ what: ARCH_DOWN })}</section>
<div class="mx-side"><aside class="mx-insp">${sideRegions([], seam, ow, sc)}</aside></div></div>`;
  }
  const M = archModel(o.architecture, { nowMs: o.nowMs });
  const K = archKit();
  const has = M.nodes.length > 0;
  const L = has ? K.layout(M, {}) : null;
  const box = L ? boxOf(L) : null;
  const stage = has
    ? `<svg class="mx-archsvg" id="ar-svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(`The architecture: ${plural(M.bands.length, "lane")}, ${plural(M.nodes.length, "part")}, ${plural(M.links.length, "link")}`)}"><g id="ar-world" class="ar-open">${K.draw(M, L, {})}</g></svg>`
    : empty("No architecture yet", { title: NO_ARCH, action: { html: copyBtn(ARCH_CALL, { label: "Copy the call", title: "Copy the call that files the architecture" }) } });
  const paths = M.paths;
  // M5: a journey's pill filters the diagram to it (its parts and links stay, the rest dims) and Play walks it; pressed again, or
  // Escape, the filter clears
  const pills = paths.length ? paths.slice(0, 4).map((p, i) => `<button type="button" class="ar-pill" data-button="path-pick" data-client="filters the diagram to this journey" data-path="${i}" aria-pressed="false" title="${esc(p.name)}">${esc(p.name)}</button>`).join("") : "";
  const strip = has ? `<div class="ar-strip" id="ar-strip">
  ${paths.length ? `<button type="button" class="ar-play" id="ar-play" data-button="play-journey" data-client="plays the journey step by step (Space)" aria-pressed="false"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2L10 6L3 10Z"/></svg><span>Play</span><kbd aria-hidden="true">Space</kbd></button><div class="ar-pills" role="group" aria-label="Journeys">${pills}</div>` : `<span class="ar-nolink" title="${esc(NO_LINKS)}">No link yet</span>`}
  <span class="ar-sp"></span>
  <div class="mx-zoom ar-zoom" role="group" aria-label="Zoom"><button type="button" class="mx-z" data-button="zoom" data-client="zooms the diagram out" data-dir="out" aria-label="Zoom out">&minus;</button><output id="ar-zl" class="mx-zl">100%</output><button type="button" class="mx-z" data-button="zoom" data-client="zooms the diagram in" data-dir="in" aria-label="Zoom in">+</button><button type="button" class="mx-z mx-fit" data-button="fit" data-client="fits the diagram to the window">Fit</button></div>
</div>` : "";
  const sr = has ? `<ol class="u-sr">${M.bands.map((bd, bi) => `<li>${esc(bd.label)}: ${M.nodes.filter((n) => n.b === bi).map((n) => esc(n.title + (n.sub ? ", " + n.sub : "") + (n.owner ? ", owned by " + n.owner.name : ""))).join("; ") || "nothing filed"}</li>`).join("")}</ol>` : "";
  const data = has ? { M, L, project: o.project || "" } : null;
  return `${ARCH_CSS}<div class="mx-body ar-body" id="ar">
<section class="ar-stage${has ? "" : " ar-state"}" id="ar-stage" data-region="lanes" tabindex="0" aria-label="The architecture diagram. Hover or tab to a part, Enter pins it, Space plays a journey, Escape closes." aria-describedby="ar-keys">
  ${strip}${stage}
  <div class="ar-tip" id="ar-tip" hidden></div>
  <div class="ar-cap" id="ar-cap" hidden></div>
  ${has ? '<div class="mx-mini ar-mini" id="ar-mini" aria-hidden="true"></div>' : ""}
  <p class="u-sr" id="ar-live" aria-live="polite"></p>${sr}
</section>
<div class="mx-side ar-side"><div class="mx-insp ar-insp" id="ar-insp" hidden></div><aside class="mx-insp ar-ov" id="ar-ov" aria-label="The architecture">${overview(M, o)}${sideRegions(M.rules, seam, ow, sc, has)}</aside></div>
</div>${data ? `<script type="application/json" id="ar-data">${json(data)}</script>${o.client ? `<script>${o.client}</script>` : ""}` : ""}`;
}

// clampWords(text, cls) — a project's own paragraph (its architecture's summary) at three lines, "more" opening the rest in place
// (a <details>: no script); a short one is drawn whole
export const clampWords = (t, cls = "") => (String(t || "").length > 160
  ? `<details class="mx-clamp${cls ? ` ${cls}` : ""}"><summary><span class="mx-what">${esc(t)}</span><span class="mx-more" aria-hidden="true"></span></summary></details>`
  : `<p class="mx-what${cls ? ` ${cls}` : ""}">${esc(t)}</p>`);
function overview(M, o) {
  const stat = [[M.bands.length, "lane"], [M.nodes.length, "part"], [M.links.length, "link"]].map(([n, w]) => `<span><b>${n}</b> ${esc(n === 1 ? w : w + "s")}</span>`).join("");
  // M4: what the marks say, counted (only what is there)
  const lit = M.lit || {};
  const marks = [[lit.fail, "failing", "err", "Links to a part with a failing check"], [lit.changed, "changed", "", "Parts changed in the last seven days"], [lit.blocked, "blocked", "err", "Journeys with a blocked step"]]
    .filter(([n]) => n).map(([n, w, tone, t]) => `<span title="${esc(t)}" data-mark="${w}"><b>${n}</b> ${tone ? `<span class="ar-tag ${tone}">${w}</span>` : w}</span>`).join("");
  const journeys = M.paths.length ? `<section class="mx-sec" data-region="journeys"><h4 class="mx-k">${M.filedPaths ? "Journeys" : "The longest chain"} <span>${M.paths.length}</span></h4><ul class="mx-rows">${M.paths.map((p, i) =>
    `<li><button type="button" class="mx-row" data-button="path-play" data-client="plays this journey on the diagram" data-path="${i}" title="${esc(p.name)}"><span class="ar-tri" aria-hidden="true"></span><span class="mx-rt">${esc(p.name)}</span><span class="mx-rm">${p.block ? `<span class="ar-tag ${M.nodes[p.block.part].light === "red" ? "err" : "needs"}" data-blocked="${p.block.step}" title="${esc(`Blocked at step ${p.block.step + 1}: ${M.nodes[p.block.part].title}`)}">blocked</span> ` : ""}${plural(p.steps.length, "step")}</span></button></li>`).join("")}</ul></section>` : "";
  return `<p class="mx-k">The architecture of ${esc((o.project && projectSlug(o.project)) || "this project")}</p>
  <p class="mx-stats">${stat}</p>${marks ? `<p class="mx-stats ar-lit">${marks}</p>` : ""}
  ${M.summary ? clampWords(M.summary, "ar-sum") : ""}
  ${journeys}`;
}

function sideRegions(rules, seam, ow, sc, keys) {
  const ps = ow.projects || [];
  return `<section class="mx-sec" data-region="crossing-rules"><h4 class="mx-k">What crosses a wall <span>${rules.length}</span></h4>${rules.length ? `<ul class="mx-rules ar-rules">${rules.map((r, i) => `<li data-r="${i}" data-nodes="${r.nodes.join(" ")}" tabindex="0" data-rule>${esc(r.rule)}${r.because.length ? ` <small>${r.because.map((q) => `<a href="${orgPath(`/question/${encodeURIComponent(q)}`)}" data-button="open-question" data-door="GET /question/:qid">${esc(q)}</a>`).join(" ")}</small>` : ""}</li>`).join("")}</ul>` : `<p class="state-quiet" data-state="empty" title="${esc('No crossing rule yet: file them through preview then save_knowledge (an item of kind "node", type "architecture", its data.crossing).')}">No crossing rule</p>`}</section>
  <section class="mx-sec" data-region="seam"><h4 class="mx-k" title="The door every project's items are filed and read through: sharingu's own contract, generated from this worker's registries, the same beside any project's architecture">sharingu's door</h4><p class="mx-stats"><span><b>${esc(seam.door || "contracts/door.json")}</b></span><span><b>${esc(Number(sc.rest) || 0)}</b> ${Number(sc.rest) === 1 ? "route" : "routes"}</span><span><b>${esc(Number(sc.tools) || 0)}</b> MCP ${Number(sc.tools) === 1 ? "tool" : "tools"}</span></p><a class="mx-b" href="${orgPath(`/contract`)}" data-button="open-contract" data-door="GET /contract">Open the contract</a></section>
  <section class="mx-sec" data-region="org-worker"><h4 class="mx-k" title="Each project is a soft scope inside the one worker, never a second worker">One org, one worker</h4><p class="mx-stats" data-worker="${esc(ow.name || "")}" title="${esc(ow.name || "")}"><span><b>${esc(Number(ow.active) || 0)}</b> ${Number(ow.active) === 1 ? "project" : "projects"}</span></p>${ps.length ? `<p class="mx-tags">${ps.map((p) => `<span class="mx-tag" data-project="${esc(p.key)}">${esc(p.name || p.key)}</span>`).join("")}</p>` : ""}</section>
  ${keys ? `<section class="mx-sec u-sr" id="ar-keys"><h4 class="mx-k">Keys</h4><p class="mx-note mx-kbd"><kbd>Space</kbd> play <kbd>&larr;</kbd><kbd>&rarr;</kbd> step <kbd>Tab</kbd> a part <kbd>Enter</kbd> pin <kbd>Esc</kbd> close, then the filter <kbd>+</kbd><kbd>&minus;</kbd> zoom <kbd>0</kbd> fit <kbd>\\</kbd> canvas alone</p></section>` : ""}`;
}

// ---- the view's sheet: semantic tokens only; every animation and transition behind html.u-motion ----
export const ARCH_CSS = `<style>
.ar-body{position:relative}
.ar-stage{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--page);cursor:grab;touch-action:none;outline:none}
.ar-stage:focus-visible{box-shadow:inset 0 0 0 1.5px var(--focus)}
.ar-stage.mx-drag{cursor:grabbing}
.ar-state{cursor:default;padding:28px;touch-action:auto;overflow:auto}
.mx-archsvg{display:block;flex:1;width:100%;min-height:0;user-select:none;-webkit-user-select:none}
.ar-bandbg{fill:transparent}
.ar-band[data-product="yes"] .ar-bandbg{fill:var(--well);opacity:.55}
.ar-bandl{stroke:var(--line);stroke-width:1}
.ar-bandt{font:500 11px/1 var(--mono);letter-spacing:.08em;fill:var(--text-faint);paint-order:stroke;stroke:var(--page);stroke-width:6px;stroke-linejoin:round}
.ar-bandtp{stroke:color-mix(in srgb,var(--well) 55%,var(--page))}
.ar-bandn{fill:var(--text-faint);opacity:.75;letter-spacing:0}
.ar-bande{font:400 12px/1 var(--sans);fill:var(--text-faint)}
.ar-fold{cursor:pointer}
.ar-foldhit{fill:transparent}
.ar-fold:hover .ar-foldhit{fill:var(--hover)}
.ar-fold:focus{outline:none}
.ar-fold:focus-visible .ar-foldhit{fill:var(--hover);stroke:var(--focus);stroke-width:1.5}
.ar-fold:hover .ar-bandt{fill:var(--text-muted)}
.ar-chev{fill:none;stroke:var(--text-faint);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.ar-shutb{fill:var(--surface);stroke:var(--line-strong);stroke-width:1}
.ar-bandts{stroke:var(--surface)}
.ar-l{fill:none;stroke:var(--line-strong);stroke-width:1.2;stroke-linecap:round}
.ar-l.ar-main{stroke:color-mix(in srgb,var(--line-strong) 55%,var(--text-muted));stroke-width:1.6}
.ar-arrowp{fill:none;stroke:var(--line-strong);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ar-seaml{stroke:var(--accent);stroke-width:1.5}
.ar-seamt{font:600 11px/1 var(--mono);letter-spacing:.04em;fill:var(--accent-text)}
.ar-n{cursor:pointer}
.ar-nb{fill:var(--surface);stroke:var(--line-strong);stroke-width:1}
.ar-n[data-kind="worker"] .ar-nb{stroke:var(--text-muted);stroke-width:1.4}
.ar-n[data-seam] .ar-nb{stroke:var(--accent);stroke-width:1.5}
.ar-nt{font:600 14px/1 var(--sans);fill:var(--text);letter-spacing:-.005em}
.ar-ns{font:400 12px/1 var(--sans);fill:var(--text-muted)}
.ar-no{font:500 11px/1 var(--mono);fill:var(--text-faint)}
.ar-n:hover .ar-nb,.ar-n.ar-on .ar-nb{stroke:var(--text-muted)}
.ar-n.ar-focus .ar-nb{stroke:var(--focus);stroke-width:1.6}
.ar-n.ar-pin .ar-nb{fill:var(--hover);stroke:var(--text);stroke-width:1.6}
.ar-dot{fill:var(--text-muted)}
.ar-dot.ar-dm{fill:var(--text)}
.ar-pulse{fill:var(--accent)}
.ar-trail{fill:none;stroke:var(--accent);stroke-width:2.2;stroke-linecap:round}
.ar-done{fill:none;stroke:var(--text);stroke-width:1.8;opacity:.85}
.ar-llt{font:500 12px/1 var(--mono);fill:var(--text);paint-order:stroke;stroke:var(--page);stroke-width:5px;stroke-linejoin:round}
.ar-stage.ar-hov .ar-n:not(.ar-on):not(.ar-pin){opacity:.26}
.ar-stage.ar-hov .ar-l:not(.ar-lon){opacity:.18}
.ar-stage.ar-hov .ar-l.ar-lon{stroke:var(--text-muted);stroke-width:1.8}
.ar-stage.ar-hov .ar-dots{opacity:.35}
.ar-stage.ar-playing .ar-n:not(.ar-vis){opacity:.24}
.ar-stage.ar-playing .ar-l{opacity:.2}
.ar-stage.ar-playing .ar-dots{opacity:0}
.ar-n.ar-cur .ar-nb{fill:var(--accent-tint);stroke:var(--accent);stroke-width:1.6}
/* M4: what is real. A part with a failing check reads red, one with a stale check amber and dashed; a link to a red part and
   its dots in the danger ink; a part changed this week carries "changed" in its title line and pulses its ring once on open;
   a journey's blocked step tints its part. Status inks only; the still drawing keeps every mark but the pulse. */
.ar-n[data-stale] .ar-nb{stroke:var(--needs);stroke-width:1.6;stroke-dasharray:5 3}
.ar-n[data-light="red"] .ar-nb{stroke:var(--err);stroke-width:1.6;stroke-dasharray:none}
.ar-l.ar-fail,.ar-stage.ar-hov .ar-l.ar-fail.ar-lon,.ar-stage.ar-filter .ar-l.ar-jl.ar-fail{stroke:var(--err);stroke-width:1.6}
.ar-dot.ar-df{fill:var(--err)}
.ar-chg{font:500 10px/1 var(--mono);fill:var(--text-muted)}
.ar-ring{fill:none;stroke:var(--text-muted);stroke-width:1.5;opacity:0}
.ar-n.ar-blk .ar-nb{fill:var(--err-tint);stroke:var(--err)}
.ar-n.ar-blk[data-stale]:not([data-light="red"]) .ar-nb{fill:var(--needs-tint);stroke:var(--needs)}
.ar-tag{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;font:600 10px/1 var(--mono);letter-spacing:.04em;white-space:nowrap}
.ar-tag.err{background:var(--err-tint);color:var(--err)}
.ar-tag.needs{background:var(--needs-tint);color:var(--needs)}
.ar-capx{display:flex;align-items:center;gap:8px;margin-top:6px;min-width:0}
.ar-capc{font:500 12px/1.3 var(--sans);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-chk{color:var(--text)}
.ar-mark .mx-k span{font-variant-numeric:tabular-nums}
/* M5: one journey filtered: its parts and links keep their ink, the rest goes to the muted ink */
.ar-stage.ar-filter .ar-n:not(.ar-jn) .ar-nb{fill:var(--page);stroke:var(--line)}
.ar-stage.ar-filter .ar-n:not(.ar-jn) .ar-nt,.ar-stage.ar-filter .ar-n:not(.ar-jn) .ar-ns{fill:var(--text-faint)}
.ar-stage.ar-filter .ar-l:not(.ar-jl){stroke:var(--line)}
.ar-stage.ar-filter .ar-l.ar-jl{stroke:var(--text-muted);stroke-width:1.6}
.ar-strip{position:relative;z-index:3;flex:none;display:flex;align-items:center;gap:8px;min-height:46px;padding:8px 12px 6px}
.ar-sp{flex:1}
.ar-play{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 10px 0 9px;border:1px solid var(--text);border-radius:7px;background:var(--text);color:var(--page);font:600 12px/1 var(--sans);cursor:pointer}
.ar-play svg{width:10px;height:10px;fill:currentColor}
.ar-play kbd{font:500 10px/1 var(--mono);opacity:.6;border:1px solid currentColor;border-radius:4px;padding:2px 4px}
.ar-pills{display:flex;gap:2px;padding:2px;border:1px solid var(--line);border-radius:8px;background:color-mix(in srgb,var(--surface) 92%,transparent);min-width:0;overflow:hidden}
.ar-pill{height:22px;padding:0 9px;border:0;border-radius:6px;background:none;font:500 12px/1 var(--sans);color:var(--text-muted);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.ar-pill:hover{color:var(--text)}
.ar-pill[aria-pressed="true"]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line-strong)}
.ar-nolink{font:400 12px/1.4 var(--sans);color:var(--text-muted);background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:5px 9px}
.ar-zoom{display:flex;align-items:center;background:var(--surface)}
.ar-tip{position:absolute;z-index:4;max-width:280px;padding:9px 11px;border:1px solid var(--line-strong);border-radius:9px;background:var(--surface);box-shadow:var(--shadow-pop);pointer-events:none}
.ar-tip b{display:block;font:600 13px/1.3 var(--sans);color:var(--text)}
.ar-tip p{margin:3px 0 0;font:400 12px/1.45 var(--sans);color:var(--text-muted)}
.ar-tip small{display:block;margin-top:5px;font:500 11px/1 var(--mono);color:var(--text-faint)}
.ar-cap[hidden],.ar-tip[hidden]{display:none}
.ar-cap{position:absolute;left:50%;bottom:18px;z-index:4;transform:translateX(-50%);display:flex;align-items:center;gap:12px;max-width:min(760px,calc(100% - 220px));padding:10px 12px 10px 16px;border:1px solid var(--line-strong);border-radius:12px;background:var(--surface);box-shadow:var(--shadow-pop)}
.ar-capn{flex:none;font:600 12px/1 var(--sans);color:var(--accent-text);font-variant-numeric:tabular-nums}
.ar-capb{min-width:0;flex:1}
.ar-capk{display:block;margin:0 0 3px;font:500 11px/1.2 var(--mono);color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-capt{display:block;font:600 16px/1.35 var(--sans);color:var(--text)}
.ar-capb2{display:flex;gap:4px;flex:none}
.ar-capb2 .mx-b{height:26px;min-width:28px;padding:0 8px}
.ar-mini{left:auto;right:12px}
.ar-side .ar-insp{border-bottom:1px solid var(--line)}
.ar-insp>.mx-k:first-of-type{margin-right:30px}
.ar-sum{-webkit-line-clamp:5}
.ar-tri{flex:none;width:0;height:0;border-left:7px solid var(--text-muted);border-top:4.5px solid transparent;border-bottom:4.5px solid transparent;margin:0 2px}
.ar-rules li{cursor:default;border-radius:4px}
.ar-rules li:hover,.ar-rules li:focus-visible,.ar-rules li.ar-ron{background:var(--hover);outline:none}
.ar-rules li{padding:6px 6px;margin:0 -6px}
.ar-ilinks{list-style:none;margin:0 0 6px;padding:0}
.ar-ilinks li{display:flex;align-items:baseline;gap:8px;min-height:24px}
.ar-ilinks button{flex:none;max-width:52%;border:0;background:none;padding:0;font:500 12px/1.6 var(--sans);color:var(--text);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
.ar-ilinks button:hover{text-decoration:underline;text-decoration-color:var(--line-strong)}
.ar-ilinks small{flex:1;min-width:0;font:400 11px/1.6 var(--mono);color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-uses{margin:4px 0 0;padding:0 0 0 14px;font:400 12px/1.5 var(--sans);color:var(--text-muted)}
/* the open: bands rise top to bottom, the parts settle, the links draw themselves (about 1.2 s, once) */
.u-motion .ar-open .ar-band,.u-motion .ar-open .ar-seam,.u-motion .ar-open .ar-bandt{animation:u-fade 300ms var(--ease) backwards;animation-delay:var(--t,0ms)}
.u-motion .ar-open .ar-arrowp{animation:u-fade 260ms var(--ease) 900ms backwards}
.u-motion .ar-open .ar-nin{animation:u-rise 300ms var(--ease) backwards;animation-delay:var(--t,0ms)}
.u-motion .ar-open .ar-l{stroke-dasharray:1 1;animation:u-draw-in 480ms var(--ease) backwards;animation-delay:var(--t,0ms)}
.u-motion .ar-n,.u-motion .ar-l{transition:opacity var(--dur-fast) var(--ease)}
.u-motion .ar-dots{transition:opacity var(--dur) var(--ease)}
.u-motion .ar-cap{animation:u-rise 220ms var(--ease) backwards}
.u-motion .ar-ring{animation:u-pulse 1000ms var(--ease) 900ms 1}
@media (max-width:760px){
  .ar-body{display:flex;flex-direction:column}
  .ar-stage{overflow:visible;touch-action:auto;cursor:default;border-bottom:1px solid var(--line)}
  .mx-archsvg{flex:none;height:auto}
  .ar-strip{padding:8px 10px 4px}
  .ar-zoom,.ar-mini{display:none}
  .ar-pills{overflow-x:auto;scrollbar-width:none}
  .ar-play kbd{display:none}
  .ar-cap{position:sticky;left:auto;bottom:10px;transform:none;margin:8px 10px 10px;max-width:none}
  .ar-tip{display:none}
  .ar-side{border-left:0;overflow:visible;background:var(--page)}
}
</style>`;
