// src/impactpage.js — the faces of impact and carry-forward (sprint 3, B4; the revision's parts, sprint 3 L3, docs/plan/LOOK.md).
// Pure renderers over src/impact.js and src/pickup.js reads, on src/parts.js and the semantic tokens only (Paper and Ink):
//   · renderImpactPage(imp)        the Impact view, /contribution/:id/impact: the glance (changed, reaches, proof to redo, goals),
//                                  what changed, the proof to redo (each check with its state and ONE Copy button carrying the
//                                  regrade call), what it reaches folded by type, the decisions and goals it names, Show on the
//                                  Map. Regions: impact-head · changed · proof · reaches · decisions · goals.
//   · impactSection(lite, id)      the contribution page's Impact card (data-region="impact"): what changed and what it reaches.
//   · nextRegion(state, o)         the contribution page's next action and its pick-up (data-region="next-action").
//   · mapImpactPanel(imp)          the Map's and the Screens view's inspector panel for ?impact=<id>.
// IMPACT_CSS is the sheet the panel and the cards need; a page that draws one carries it once.
// Hooks a check reads: data-region; data-impact on the view; data-node + data-how on a touched node; data-reached on a
// reached node; data-check + data-state on a check to redo; data-qid on a decision; data-goal on a goal; data-picked +
// data-done on the next action.
import { esc } from "./ui.js";
import { typeWord } from "./reach.js";
import { card, tile, tileRow, chip, avatar, line, lines, group, empty, pageHead, cols, stack, copyBtn, ago, happenedOf } from "./parts.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const typesLine = (byType) => Object.entries(byType || {}).map(([t, n]) => `${n} ${typeWord(t, n)}`).join(" · ");
const nodeHref = (id) => orgPath(`/map?node=${encodeURIComponent(id)}`);
const VERDICT = { proven: "passed", refused: "failed", incomplete: "incomplete" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (iso) => { const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const typeChip = (t) => chip(typeWord(t, 1));
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");
// how a record names what it changed (src/impact.js refsOfRow), as a group's heading
const HOW_WORD = { "named in what it touches": "What it touches", "a screen it names": "Screens it names", "a component it names": "Components it names",
  "what it depends on": "What it depends on", "a ref it addresses": "Refs it addresses", written: "Written", "a render added or replaced": "Pictures added or replaced" };
const mapActs = (id, project, t, o = {}) => {
  const q = project ? `&project=${encodeURIComponent(project)}` : "";
  if (!id || !t || !t.total) return [];
  return [`<a class="u-btn small${o.ghost ? " ghost" : ""}" href="${orgPath(`/map?impact=${encodeURIComponent(id)}${q}`)}" data-button="show-on-map" data-door="GET /map">Show on the Map</a>`,
    ...((t.names || []).some((n) => n.type === "screen") && !o.mapOnly ? [`<a class="u-btn small ghost" href="${orgPath(`/map/screens?impact=${encodeURIComponent(id)}${q}`)}" data-button="show-on-screens" data-door="GET /map/screens">On the Screens view</a>`] : [])];
};

// ---- the Impact view ----
export function renderImpactPage(imp, o = {}) {
  const i = imp || {};
  const id = String(i.id || "");
  const nowMs = o.nowMs || Date.now();
  const t = i.touched || { total: 0, names: [] }, r = i.reached || { total: 0, names: [] }, p = i.proof || { toRedo: [], regraded: [], ungraded: 0, total: 0 };
  const g = i.goals || {};
  const goalIds = [...new Set([...(g.moved || []), ...(g.named || []).map((x) => x.id)])];
  const head = pageHead({ region: "impact-head", title: noDash(i.what || "Impact"), crumbs: [{ label: "Build", href: orgPath("/build") },
    { label: id, href: orgPath(`/contribution/${encodeURIComponent(id)}?page=1`), attrs: 'data-button="back-to-contribution" data-door="GET /contribution/:id"' }, { label: "Impact" }],
    actions: mapActs(id, i.project, t) });
  // L4: ONE count each, the same on the tile, the card and the contribution page: what changed is the touched nodes (a "+" only
  // when touched refs were left unwalked), what it reaches is the walk's total by type (a "+" only when the walk hit its cap);
  // the names listed are the first of those, the rest said as "N more"
  const tN = `${t.total || 0}${t.unwalked ? "+" : ""}`, rN = `${r.total || 0}${r.countCapped ? "+" : ""}`;
  const rTypes = [typesLine(r.byType), r.unnamed ? `${r.unnamed} more` : ""].filter(Boolean).join(" · ");
  const glance = tileRow([
    tile({ label: "Changed", value: tN, key: "changed" }),
    tile({ label: "Reaches", value: rN, key: "reaches", sub: rTypes }),
    tile({ label: "Proof to redo", value: p.toRedo.length, key: "to-redo", tone: p.toRedo.length ? "warn" : "" }),
    tile({ label: "Goals", value: goalIds.length, key: "goals" }),
  ], { region: "glance", label: "Impact" });
  const unknown = [...new Set([...(i.unknown || []), ...((t.unknown) || [])])];   // D6a: the same list rides twice on the read: once each
  const unknownChip = unknown.length ? chip("Not on the Map", { count: unknown.length, tone: "warn", title: unknown.slice(0, 12).join(", ") }) : "";
  // what changed, grouped by how the record names it (one heading per way, never the same words on every row)
  const byHow = new Map();
  for (const n of t.names || []) { const k = n.how || ""; if (!byHow.has(k)) byHow.set(k, []); byHow.get(k).push(n); }
  const nodeLine = (n) => line({ attrs: `data-node="${esc(n.id)}" data-how="${esc(n.how || "")}"`, lead: typeChip(n.type), title: noDash(n.name), href: nodeHref(n.id), meta: n.isNew ? chip("New") : "" });
  const moreLine = (n) => (n > 0 ? `<p class="p-empty"><span>${esc(n)} more</span></p>` : "");
  const changedBody = !(t.names || []).length ? empty("Touches nothing")
    : byHow.size === 1 && [...byHow.keys()][0] === "" ? lines(t.names.map(nodeLine), { lead: 84 }) + moreLine((t.total || 0) - t.names.length)
    : [...byHow].map(([how, xs], i) => group({ title: HOW_WORD[how] || cap(noDash(how)) || "Changed", count: xs.length, open: i < 3, body: lines(xs.map(nodeLine), { lead: 84 }) })).join("") + moreLine((t.total || 0) - t.names.length);
  const changed = card({ label: "Changed", count: t.total ? tN : "", flush: true, region: "changed", action: unknownChip, body: changedBody });
  const callOf = new Map((p.calls || []).map((x) => [x.checkId, x.call]));
  // R1: the proof to redo regrades from here, as the person (a form: the first press answers the plan, src/regradepage.js,
  // whose confirm observes the pages and files; then back here, where the checks read "Graded since")
  const redoIds = i.changesProof && i.project ? p.toRedo.map((c) => c.id).slice(0, 60) : [];
  const regrade = redoIds.length ? `<form method="POST" action="${orgPath(`/regrade`)}">${[["project", i.project], ["checks", redoIds.join(",")], ["next", orgPath(`/contribution/${encodeURIComponent(id)}/impact?project=${encodeURIComponent(i.project)}`)]]
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("")}<button class="u-btn small" type="submit" data-button="regrade" data-door="POST /regrade">Regrade</button></form>` : "";
  const proofTail = [p.regraded.length ? chip("Graded since", { count: p.regraded.length, tone: "ok" }) : "", p.ungraded ? chip("Ungraded", { count: p.ungraded }) : "",
    (i.capped || []).length ? chip("Capped", { title: (i.capped || []).map(noDash).join(". ") }) : "", regrade].join("");
  const proof = card({ label: "Proof to redo", count: p.toRedo.length || "", tone: p.toRedo.length ? "needs" : "", flush: true, region: "proof", action: proofTail,
    body: !i.changesProof ? empty("No proof in question")
      : p.toRedo.length ? lines(p.toRedo.map((c) => line({ attrs: `data-check="${esc(c.id)}" data-state="${c.stale ? "stale" : "fresh"}"`,
        lead: chip(c.stale ? "Stale" : VERDICT[c.verdict] ? VERDICT[c.verdict].charAt(0).toUpperCase() + VERDICT[c.verdict].slice(1) : "Graded", { tone: c.stale ? "warn" : "quiet" }),
        title: noDash(c.title), sub: `${esc(VERDICT[c.verdict] || "graded")} ${esc(shortDay(c.gradedAt))}`,
        action: callOf.has(c.id) ? copyBtn(callOf.get(c.id), { title: "Copy the regrade call", attrs: 'data-button="copy-call"' }) : "" })), { lead: 84 })
      : empty(p.total ? "Nothing to redo" : "No check names it") });
  const byType = new Map();
  for (const n of r.names || []) { if (!byType.has(n.type)) byType.set(n.type, []); byType.get(n.type).push(n); }
  // a group per type with that type's TRUE count (the tile's sub): the names read are listed, the rest said as "N more"
  const typeN = r.byType || {};
  const reaches = card({ label: "Reaches", count: r.total ? rN : "", flush: true, region: "reaches",
    body: r.total ? Object.keys(typeN).sort((a, b) => typeN[b] - typeN[a]).map((ty) => { const xs = byType.get(ty) || [];
      return group({ title: cap(typeWord(ty, typeN[ty])), count: typeN[ty], body: lines(xs.map((n) => line({ attrs: `data-reached="${esc(n.id)}"`, title: noDash(n.name), href: nodeHref(n.id) })), { compact: true }) + moreLine(typeN[ty] - xs.length) }); }).join("")
      + (r.unnamed ? group({ title: "Not named", count: r.unnamed, body: "" }) : "")
      : empty("Nothing one hop out") });
  const d = i.decisions || {};
  const qs = [...(d.named || []).map((q) => ({ ...q, why: "Named" })), ...(d.asks || []).filter((q) => !(d.named || []).some((x) => x.qid === q.qid)).map((q) => ({ ...q, why: "Open" }))];
  const decisions = card({ label: "Decisions", count: qs.length || "", flush: true, region: "decisions", body: qs.length
    ? lines(qs.map((q) => line({ attrs: `data-qid="${esc(q.qid)}"`, lead: chip(q.why, { tone: q.why === "Open" ? "warn" : "quiet" }), title: noDash(q.question || q.qid), href: orgPath(`/question/${encodeURIComponent(q.qid)}`) })), { compact: true, lead: 64 })
    : empty("No decision") });
  const gNamed = new Map((g.named || []).map((x) => [x.id, x]));
  const goals = card({ label: "Goals", count: goalIds.length || "", flush: true, region: "goals", body: goalIds.length
    ? lines(goalIds.map((gid) => line({ attrs: `data-goal="${esc(gid)}"`, lead: chip((g.moved || []).includes(gid) ? "Moved" : "Named", { tone: (g.moved || []).includes(gid) ? "ok" : "quiet" }), title: noDash((gNamed.get(gid) || {}).title || gid), href: orgPath(`/goals/${encodeURIComponent(gid)}`) })), { compact: true, lead: 64 })
    : empty("No goal") });
  const meta = [i.by ? `${avatar({ name: noDash(i.by), size: 20 })}<span>${txt(i.by)}</span>` : "", i.lane ? chip(i.lane) : "", happenedOf(i) ? `<span class="im-mono" title="${esc(happenedOf(i))}">${esc(ago(happenedOf(i), nowMs))}</span>` : ""].filter(Boolean).join("");
  const top = head.replace("</header>", meta ? `<div class="p-head-aside">${meta}</div></header>` : "</header>");
  // D6a: a contribution that changes nothing on the Map (a doc-only one) reads as ONE fact, never four zeros and four empty
  // cards: what it names that the Map does not hold, and the goal it moved
  if (!t.total && !r.total && !p.toRedo.length && !qs.length) {
    const fact = line({ attrs: 'data-fact="nothing-on-the-map"', title: "Nothing on the Map changed", meta: unknownChip,
      sub: unknown.length ? unknown.slice(0, 12).map((u) => `<code>${esc(u)}</code>`).join(", ") + (unknown.length > 12 ? ` +${esc(unknown.length - 12)}` : "") : "" });
    const moved = goalIds.map((gid) => line({ attrs: `data-goal="${esc(gid)}"`, lead: chip((g.moved || []).includes(gid) ? "Moved" : "Named", { tone: (g.moved || []).includes(gid) ? "ok" : "quiet" }), title: noDash((gNamed.get(gid) || {}).title || gid), href: orgPath(`/goals/${encodeURIComponent(gid)}`) }));
    return CSS + `<section class="im" data-screen="impact" data-impact="${esc(id)}" data-quiet="1">${top}${card({ label: "Impact", flush: true, region: "changed", body: lines([fact, ...moved], { lead: 64 }) })}</section>`;
  }
  return CSS + `<section class="im" data-screen="impact" data-impact="${esc(id)}">${top}${stack(glance, cols(stack(changed, proof), stack(reaches, decisions, goals)))}</section>`;
}

// ---- what a contribution touches: ONE fact, read by the page's Touches fact and its Impact card ----
// touchesFact(lite) -> { nodes, plain, nodeWords, plainWords } | null (no lite: the reader does not read the project's model).
// nodes: the Map's nodes it touches (impactLines' touched); plain: what it names that is not a node (a file path, a plain area,
// a screen the Map no longer holds), said "3 files, not on the Map". Nothing only when both are empty.
const FILE_LIKE = (x) => /[/.]/.test(x) && !/^[a-z]+:/.test(x);
export function touchesFact(lite) {
  if (!lite) return null;
  const nodes = (lite.touched && lite.touched.total) || 0, plain = Array.isArray(lite.notOnMap) ? lite.notOnMap : [];
  const word = plain.length && plain.every(FILE_LIKE) ? ["file", "files"] : ["area", "areas"];
  return { nodes, plain, nodeWords: nodes ? `${nodes} ${nodes === 1 ? "node" : "nodes"}` : "",
    plainWords: plain.length ? `${plain.length} ${word[plain.length === 1 ? 0 : 1]}, not on the Map` : "" };
}
// notOnMapLine(fact) -> the one line naming what is not on the Map (its count, then the first names as code), or ""
const notOnMapLine = (f) => (f && f.plain.length ? line({ attrs: `data-fact="not-on-the-map" data-plain="${esc(f.plain.length)}"`, title: f.plainWords,
  sub: f.plain.slice(0, 6).map((u) => `<code>${esc(u)}</code>`).join(", ") + (f.plain.length > 6 ? ` +${esc(f.plain.length - 6)}` : "") }) : "");

// ---- the contribution page: the Impact card (what changed, what it reaches, the checks to redo, and the way to the view) ----
export function impactSection(lite, id, o = {}) {
  const l = lite || null;
  const href = orgPath(`/contribution/${encodeURIComponent(id)}/impact`);
  const open = `<a class="u-link" href="${esc(href)}" data-button="open-impact" data-door="GET /contribution/:id/impact">Open</a>`;
  const f = touchesFact(l);
  if (!l || !l.touched || !l.touched.total) return card({ label: "Impact", region: "impact", flush: true, action: open, body: f && f.plain.length ? lines([notOnMapLine(f)], { compact: true }) : empty("Touches nothing") });
  const t = l.touched;
  const changed = group({ title: "Changed", count: t.total, open: true, summary: l.toRedo ? chip("To redo", { tone: "warn", count: l.toRedo, attrs: `data-redo="${esc(l.toRedo)}"` }) : `<span data-redo="0"></span>`,
    body: lines(t.names.slice(0, 6).map((n) => line({ attrs: `data-node="${esc(n.id)}"`, lead: typeChip(n.type), title: noDash(n.name), href: nodeHref(n.id), meta: n.isNew ? chip("New") : "" })), { lead: 84 })
      + (t.total > 6 ? lines([line({ title: `${t.total - 6} more`, href })]) : "") });
  // L4 (one count): this card says what changed (the same count as the Impact view's "Changed" and the page's "Touches"); what
  // it reaches is the Impact view's own number, read there (the lighter walk here counted fewer and disagreed)
  return card({ label: "Impact", region: "impact", flush: true, action: `${mapActs(id, o.project, t, { ghost: true, mapOnly: true }).join("")}${open}`, body: changed + (f.plain.length ? lines([notOnMapLine(f)], { compact: true }) : "") });
}

// ---- the contribution page: the next action and its pick-up ----
export function nextRegion(st, o = {}) {
  const s = st || {};
  if (!s.next) return "";
  const id = String(s.id || "");
  const form = (action, label, primary, title) => `<form method="POST" action="${orgPath(`/contribution/${encodeURIComponent(id)}/pick-up`)}" class="nx-form"><input type="hidden" name="action" value="${esc(action)}"><button type="submit" class="u-btn small${primary ? "" : " ghost"}" data-button="${esc(action === "pick" ? "pick-up" : action === "done" ? "mark-done" : "release")}" data-door="POST /contribution/:id/pick-up"${title ? ` title="${esc(title)}"` : ""}>${esc(label)}</button></form>`;
  const me = o.readerId ? String(o.readerId) : "";
  const holder = s.pickedUp && s.pickedUp.by ? String(s.pickedUp.by.id) : "";
  let state = "", acts = "";
  if (s.done) {
    const by = s.done.byContribution ? `<a class="u-link" href="${orgPath(`/contribution/${encodeURIComponent(s.done.by)}?page=1`)}">${esc(s.done.by)}</a>` : s.done.name ? txt(s.done.name) : "";
    state = `<span class="nx-state" data-done="1">${chip("Done", { tone: "ok", title: s.done.note ? noDash(s.done.note) : "" })}${by ? `<span>${by}</span>` : ""}<span class="im-mono">${esc(shortDay(s.done.at))}</span></span>`;
  } else if (holder) {
    const name = (s.pickedUp.by && s.pickedUp.by.name) || holder;
    state = `<span class="nx-state" data-picked="${esc(holder)}">${avatar({ name: noDash(name), size: 20 })}<span>Picked up by <b>${txt(name)}</b></span><span class="im-mono">${esc(shortDay(s.pickedUp.at))}</span></span>`;
    if (o.canAct && holder === me) acts = form("done", "Mark done", true) + form("release", "Release", false);
    else if (o.canAct && (o.isOwner || o.isContributor)) acts = form("release", "Release", false);
  // copy: off-screen (the press's title)
  } else if (o.canAct) acts = form("pick", "Pick it up", true, "Takes the next action, never the work: anyone may still file on it") + form("done", "Mark done", false);
  // the person the next action names: their name and face when the id resolves (pickStateOf's whoName), else the typed text
  const who = s.next.who ? String(s.next.who) : "", whoName = s.whoName ? String(s.whoName) : "";
  const body = lines([line({ lead: who ? avatar({ name: noDash(whoName || who), size: 24 }) : chip("Anyone"), title: noDash(s.next.what), sub: who ? txt(whoName || who) : "",
    meta: s.next.by ? `<span>${esc(s.next.by)}</span>` : "", action: acts })]) + (state ? `<div class="nx-foot">${state}</div>` : "");
  return card({ label: "Next", count: 1, flush: true, region: "next-action", body });
}

// ---- the Map's and the Screens view's panel for ?impact=<id> ----
export function mapImpactPanel(imp, o = {}) {
  const i = imp || {};
  const id = String(i.id || "");
  const clear = `${o.base || orgPath("/map")}${i.project ? `?project=${encodeURIComponent(i.project)}` : ""}`;
  return `<div class="mx-ov mx-impact-panel" data-impact="${esc(id)}"><p class="mx-k">Impact of ${esc(id)}</p><h3 class="mx-title" title="${esc(noDash(i.what || ""))}">${txt(i.what || id)}</h3>`
    + `<p class="mx-note">${txt(i.line || "")}</p>`
    + `<ul class="mx-legend"><li><i class="mx-dotl mx-imp-key" data-imp="touched"></i><b>${esc(i.touched || 0)}</b> touched</li><li><i class="mx-dotl mx-imp-key" data-imp="reached"></i><b>${esc(i.reached || 0)}</b> one hop out</li>${i.toRedo ? `<li><i class="mx-dotl" data-light="amber"></i><b>${esc(i.toRedo)}</b> checks to redo</li>` : ""}</ul>`
    + `<div class="mx-acts"><a class="mx-b mx-b-go" href="${orgPath(`/contribution/${encodeURIComponent(id)}/impact`)}" data-button="open-impact" data-door="GET /contribution/:id/impact">Open the impact</a><a class="mx-b" href="${esc(clear)}" data-button="clear-impact" data-door="GET /map">Clear</a></div></div>`;
}

const CSS = `<style>
.im{display:block}
.im-mono{font:400 11.5px/1 var(--mono);color:var(--text-faint)}
.nx-form{margin:0}
.nx-foot{padding:8px 16px 12px;border-top:1px solid var(--line)}
.nx-state{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:13px;color:var(--text)}
.nx-state a{color:var(--text)}
</style>`;
export const IMPACT_CSS = CSS;
