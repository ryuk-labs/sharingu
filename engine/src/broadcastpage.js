// src/broadcastpage.js — Broadcast, the screen (UI-B11b; sprint 2, interactive: the owner's MCQs of 2026-09-30 and 2026-10-01).
// Owner rulings: Q2485A7FD (Broadcast is its own tab; publish a skill, an agent or a workflow; any user equips; updates push)
// · Q0E5A1073 (anyone publishes freely; publishing is an OFFER; every control sits on equip) · Q571B3D89 (equip per project,
// attributed, visible) · QEBB5D318 (an equip is pinned to its version; an update shows a notice and the holder chooses) ·
// QF4501CEC (Broadcast stops at the org wall) · Q60CCC574 (publish and equip were a person's press in a signed-in browser; since sprint 3 D2 they are also the `publish` and `equip` tools, previewed first: the press here is its own confirm) ·
// 2026-09-30 evening (the starter pack: six agents, three workflows, three skills) · 2026-10-01 (the live picture: the last
// week's contributions as dots flowing from people to the goals they name; the starter pack BUILT INTO the product).
//
// PURE: renderBroadcast(read, { brand, ack, partner, live }) draws exactly what readBroadcast (and, for the live picture,
// src/broadcastlive.js readLive) answered, inside the shell (the route wraps it with the Broadcast tab lit). In order:
//   the head       the title, the stat line read off stamp.counts (never typed), Publish (one form per own publishable draft;
//                  with none, disabled with its reason and the exact call that files a draft; a Partner never publishes)
//   live-picture   who contributed this week and to which goal (src/broadcastlive.js renderLive)
//   starter-shelf  the starter items, one card each (data-preset = its slug, data-kind = its kind): Equip (POST
//                  /broadcast/equip, slug preset:<slug>), or "Equipped on <project>" with its copy, or Update when the engine
//                  carries a newer version; the kind chips (kind-filter, client-side) filter this shelf and the next
//   shelf          the org's own published items, one row each (data-item = its slug, data-kind = its kind) with its version,
//                  who published it, where it is equipped, Equip (enabled exactly when can.equip, with D8's line) and, when
//                  this project is behind, Update to v<n>
//   equipped-here  what this project holds, pinned to its version, attributed, the starter ones with their copy
//   org-wall-note  the org's own name: nothing on this shelf reaches another org
// This file types no count, no item, no person and no org name. A button's door is data-door; a client-only control is
// data-client. A disabled button carries its reason.
import { esc, unreachableState, pageHeader, statusChip, breadcrumb } from "./ui.js";
import { card, tile, tileRow, chip, avatar, line, lines, empty, pageHead, cols, stack } from "./parts.js";
import { ORG_WALL, EQUIP_LINE, EMPTY_SHELF, EMPTY_HERE } from "./broadcastread.js";
import { renderLive, LIVE_CSS } from "./broadcastlive.js";
import { KIND_WORD, STARTER_NOTE, starterDoc } from "./starter.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "./project.js";   // sprint 13 (13.2): a project reads as its name, else its slug, never its org-prefixed key

export const BROADCAST_REGIONS = ["shelf", "equipped-here", "org-wall-note"];

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const known = (v) => v != null && Number.isFinite(Number(v));
const shown = (v) => (known(v) ? String(Number(v)) : "?");   // UNREACHABLE: never a guessed zero
const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
const isLink = (p) => typeof p === "string" && (/^https?:\/\//i.test(p.trim()) || p.trim().startsWith("/artifact/"));
const docHref = (path) => orgPath("/doc/") + encodeURIComponent(path);

// the page's own sheet: semantic tokens only (Paper and Ink from the same names); the live picture brings its own (LIVE_CSS)
const BC_CSS = `<style>
.bc{display:block;color:var(--text)}
.bc-pubs{position:relative}
.bc-why{align-self:center;font:400 12.5px/1.3 var(--sans);color:var(--text-muted)}
.bc-pubs>summary{list-style:none}
.bc-pubs>summary::-webkit-details-marker{display:none}
.bc-pubs .u-pop{right:0;left:auto;width:min(420px,86vw);display:flex;flex-direction:column;gap:8px}
.bc-pubs form{margin:0;display:flex;gap:10px;align-items:center;justify-content:space-between}
.bc-pubs small{font:400 12px/1.4 var(--mono);color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bc-ack{margin:0 0 16px;font-size:13px;color:var(--ok);background:var(--ok-tint);border-radius:8px;padding:8px 12px}
.bc-kinds{display:flex;gap:4px;flex-wrap:wrap}
.bc-chip[aria-pressed="true"]{background:var(--surface);border-color:var(--line-strong);color:var(--text)}
.bc .p-li[hidden]{display:none}
.bc-v{font:500 11px/1 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
.bc-slug{font:400 11.5px/1 var(--mono);color:var(--text-faint)}
.bc-foot{display:flex;align-items:center;gap:8px}
.bc-foot form,.bc .p-line-act form{margin:0}
.bc-wall{margin:0;font:400 12.5px/1.5 var(--sans);color:var(--text-faint)}
</style>`;

// the kind chips filter the starter lines and the org's lines (client-side; the script names no region and no quoted button
// attribute, so it never counts as a second one)
const BC_JS = `<script>(function(){var root=document.querySelector('.bc');if(!root)return;
root.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button[data-button=kind-filter]'):null;if(!b)return;var k=b.getAttribute('data-kind')||'';var on=b.getAttribute('aria-pressed')!=='true';
root.querySelectorAll('button[data-button=kind-filter]').forEach(function(x){x.setAttribute('aria-pressed',x===b&&on?'true':'false');});
root.querySelectorAll('[data-preset],[data-item]').forEach(function(a){a.hidden=on&&a.getAttribute('data-kind')!==k;});});})();</script>`;

const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value ?? "")}">`;
const evalField = (read) => (read && read.eval ? hidden("eval", "1") : "");
const disabledWhy = (why) => ` disabled title="${esc(why)}"`;
const whyBeside = (w) => `<span class="bc-why" data-why="publish">${esc(w)}</span>`;
const kindChip = (k) => chip(KIND_WORD[k] || k || "item");

// ---- the starter shelf: one line per built-in item ----
// starterFoot(c, read, down) -> Equip (or Update to v<n>) and Read, or "Equipped" (its whole standing in its title) with its copy
function starterFoot(c, read, down) {
  const pkey = (read.project && read.project.key) || "";
  const pname = (read.project && (read.project.name || projectSlug(read.project.key))) || "this project";
  const here = c.here || {}, can = c.can || {};
  const form = (button, label, why, on, title) => `<form method="post" action="${orgPath(`/broadcast/equip`)}">${hidden("slug", c.equipSlug)}${hidden("v", c.v)}${hidden("project", pkey)}${evalField(read)}<button type="submit" class="u-btn small" data-button="${button}" data-door="POST /broadcast/equip"${on ? (title ? ` title="${esc(title)}"` : "") : disabledWhy(why)}>${esc(label)}</button></form>`;
  if (here.state === "current") return `<span class="bc-foot">${chip("Equipped", { tone: "ok", title: `Equipped on ${noDash(pname)}` })}<a class="u-link" href="${esc(docHref(here.doc || starterDoc(c.slug)))}" title="The project's copy, a doc its AI reads">Copy</a></span>`;
  // copy: off-screen (a disabled press's reason and the press's title)
  if (here.state === "update") return `<span class="bc-foot">${form("update-version", `Update to v${shown(c.v)}`, can.reason || "Not available.", !down && !!can.update, `${pname} holds v${shown(here.v)}. Updating replaces its copy, ${here.doc || starterDoc(c.slug)}.`)}</span>`;
  const on = !down && !!can.equip;
  // copy: off-screen (a disabled press's reason and the press's title)
  return `<span class="bc-foot">${form("equip", "Equip", can.reason || (down ? "The ledger did not answer." : "Not available."), on, `Copies it into ${pname} as a doc its AI reads`)}</span>`;
}
function starterLine(c, read, down) {
  const here = c.here || {};
  return line({ attrs: `data-preset="${esc(c.slug)}" data-kind="${esc(c.kind)}" data-held="${esc(here.state || "none")}"`, lead: kindChip(c.kind), title: noDash(c.title), href: c.href,
    sub: txt(c.purpose), meta: `<span class="bc-v" title="${esc((c.calls || []).join(", "))}">v${esc(shown(c.v))}</span>`, action: starterFoot(c, read, down) });
}

// ---- the org's own shelf: one line per published slug ----
function shelfLine(c, read, down) {
  const project = read.project || {};
  const pkey = project.key || "";
  const pname = project.name || (project.key && projectSlug(project.key)) || "this project";
  const can = c.can || {}, here = c.here || {};
  const pub = (c.publisher && c.publisher.name) || "its publisher";
  const n = known(c.equippedIn) ? Number(c.equippedIn) : null;
  const equipOn = !down && !!can.equip;
  // copy: error (a disabled press's reason, in its title)
  const equipWhy = can.reason || (here.state === "update" ? `${pname} holds v${shown(here.v)}. Update it below.` : down ? "The ledger did not answer." : "Not available.");
  const equip = `<form method="post" action="${orgPath(`/broadcast/equip`)}">${hidden("slug", c.slug)}${hidden("v", c.v)}${hidden("project", pkey)}${evalField(read)}<button type="submit" class="u-btn small${equipOn ? " primary" : ""}" data-button="equip" data-door="POST /broadcast/equip"${equipOn ? ` title="${esc(EQUIP_LINE(pub, c.kind || "item", pname))}"` : disabledWhy(equipWhy)}>Equip v${esc(shown(c.v))}</button></form>`;
  const update = here.state === "update"
    ? `<form method="post" action="${orgPath(`/broadcast/equip`)}">${hidden("slug", c.slug)}${hidden("v", c.v)}${hidden("project", pkey)}${evalField(read)}<button type="submit" class="u-btn small${can.update ? " primary" : ""}" data-button="update-version" data-door="POST /broadcast/equip"${can.update ? ` title="${esc(`${pname} stays pinned to v${shown(here.v)} until someone seated here chooses`)}"` : disabledWhy(can.reason || "Not available.")}>Update to v${esc(shown(c.v))}</button></form>` : "";
  const src = c.source && isLink(String(c.source)) ? `<a class="u-link" href="${esc(String(c.source).trim())}" rel="noopener noreferrer" target="_blank">Source</a>` : "";
  return line({ attrs: `data-item="${esc(c.slug)}" data-kind="${esc(c.kind || "")}"`, lead: kindChip(c.kind), title: noDash(c.what || c.slug), href: c.href || "",
    sub: `<span class="bc-slug">${txt(c.slug)} · v${esc(shown(c.v))}</span>`,
    meta: `${here.state === "current" ? chip(`v${shown(here.v)} here`, { tone: "ok", title: `${here.by ? `equipped by ${noDash(here.by)}` : ""}${here.at ? ` on ${day(here.at)}` : ""}` }) : ""}${here.state === "update" ? chip("Update", { tone: "warn", title: `An update is available. ${pname} stays pinned to v${shown(here.v)} until someone seated here chooses.` }) : ""}<span title="projects you are seated on that equipped it">${n == null ? "?" : n} equipped</span>${avatar({ name: pub, size: 20 })}<span>${esc(c.publishedAt ? day(c.publishedAt).slice(5) : "")}</span>${src}`,
    action: `${equip}${update}` });
}

// ---- equipped here: one line per item this project holds ----
function heldLine(h) {
  const starter = h.source === "starter";
  return line({ attrs: `data-held="${esc(h.slug)}" data-source="${esc(h.source || "org")}"`, lead: kindChip(h.kind), title: noDash(h.title || h.slug), href: h.href || "",
    sub: `<span class="bc-slug">v${esc(shown(h.v))}</span> ${starter && h.doc ? `<a class="u-link" href="${esc(docHref(h.doc))}" title="its copy">${esc(h.doc)}</a>` : ""}`,
    meta: `${h.state === "update" ? statusChip("pending", `v${shown(h.latest)} available`) : ""}${chip(starter ? "Starter" : "Org shelf")}${avatar({ name: h.by || "?", size: 20 })}<span>${esc(h.at ? day(h.at).slice(5) : "")}</span>` });
}

// Publish: one form per own publishable draft (under one Publish press); with none, ONE disabled button with its reason in its
// title and, in a word, beside it (D6a: a disabled press says why where it is seen, not only on hover). A Partner (migrate-044: an outside collaborator) never publishes to the org's shelf: the door refuses it (403
// partner_refused), so the page shows the button disabled with that reason, never a press that fails after
// copy: error (a refusal: the disabled Publish's title, and the door's 403 hint)
export const PARTNER_PUBLISH_REASON = "A Partner works on the projects they are seated on; publishing to the org's shelf is a member's press.";
function publishOf(read, down, partner = false) {
  const mine = Array.isArray(read.mine) ? read.mine : [];
  if (partner) return `${whyBeside("A member's press")}<button type="button" class="u-btn small" data-button="publish" data-door="POST /broadcast/publish"${disabledWhy(PARTNER_PUBLISH_REASON)}>Publish</button>`;
  const ready = down ? [] : mine.filter((m) => m && m.publishable);
  if (ready.length) {
    return `<details class="u-details bc-pubs"><summary class="u-btn primary small">Publish <span class="p-count">${esc(ready.length)}</span></summary><div class="u-pop">${ready.map((m) => `<form method="post" action="${orgPath(`/broadcast/publish`)}">${hidden("id", m.id)}${evalField(read)}
      <small title="${esc(noDash(m.what || ""))}">${txt(m.slug || m.id)}${m.kind ? ` · ${txt(m.kind)}` : ""}</small>
      <button type="submit" class="u-btn primary small" data-button="publish" data-door="POST /broadcast/publish">Publish</button></form>`).join("")}</div></details>`;
  }
  const other = mine.find((m) => m && m.reason);
  const why = down ? "The ledger did not answer, so no draft can be read." : "No draft to publish";
  const title = other && !down ? `${why}. ${mine.filter((m) => m && m.reason).slice(0, 5).map((m) => `${m.slug || m.id}: ${m.reason}`).join(" · ")}` : why;
  return `${whyBeside(down ? "Not read" : "No draft")}<button type="button" class="u-btn small" data-button="publish" data-door="POST /broadcast/publish"${disabledWhy(title)}>Publish</button>`;
}

// renderBroadcast(read, { brand, ack, partner, live }) -> the Broadcast content (the route wraps it in shell() with the Broadcast
// tab lit). live: readLive's answer (the live picture); absent, the region is not drawn. Pure. sprint 3, L3 (the revision,
// docs/plan/LOOK.md): the head (Publish), the glance (published, equipped here, updates, the starter pack), the live picture as
// a card, the kind chips as the one filter row, then the starter pack, the org's shelf and what this project holds, each one
// line per item with its press; the org's wall one quiet line. Every form (equip, update, publish) posts what it posted.
export function renderBroadcast(r, opts = {}) {
  const read = r || {};
  const down = read.live === "unreachable";
  const regions = read.regions || {};
  const shelf = Array.isArray(regions.shelf) ? regions.shelf : [];
  const held = Array.isArray(regions["equipped-here"]) ? regions["equipped-here"] : [];
  const starter = Array.isArray(regions["starter-shelf"]) ? regions["starter-shelf"] : [];
  const wall = regions["org-wall-note"] || {};
  const org = read.org || wall.org || "";
  const c = (read.stamp && read.stamp.counts) || {};
  const kinds = (read.filter && Array.isArray(read.filter.kinds)) ? read.filter.kinds : [];
  const pname = (read.project && (read.project.name || read.project.key)) || "";

  const head = pageHead({ title: "Broadcast", actions: [publishOf(read, down, !!opts.partner)] });
  const ack = opts && opts.ack ? `<p class="bc-ack" role="status">${txt(opts.ack)}</p>` : "";
  const glance = tileRow([
    tile({ label: "Published", value: down ? null : c.published, key: "published" }),
    tile({ label: "Equipped here", value: down ? null : c.equippedHere, key: "equipped-here" }),
    tile({ label: "Updates", value: down ? null : c.updates, key: "updates", tone: Number(c.updates) ? "warn" : "" }),
    tile({ label: "Starter pack", value: c.starter ?? starter.length, key: "starter" }),
  ], { region: "glance", label: "Broadcast" });
  // the kind chips (client-side filter of the lines on this page): every kind, its count on both shelves
  const chips = kinds.length ? `<nav class="p-filter" data-region="filters" aria-label="Show one kind"><div class="bc-kinds p-fgroup" role="group" aria-label="Kind">${kinds.map((k) => {
    const n = down ? null : Number(k.count || 0) + starter.filter((x) => x.kind === k.kind).length;
    return `<button type="button" class="p-fchip bc-chip" data-button="kind-filter" data-client="shows only the items of this kind" data-kind="${esc(k.kind)}" aria-pressed="false"><span class="p-fchip-w">${esc((KIND_WORD[k.kind] || k.kind) + "s")}</span><span class="p-count">${esc(shown(n))}</span></button>`; }).join("")}</div></nav>` : "";

  const live = opts.live ? renderLive(opts.live) : "";
  const starterSec = card({ label: "Starter pack", count: starter.length, flush: true, region: "starter-shelf", attrs: `data-reveal="3" title="${esc(STARTER_NOTE.replace(/`/g, ""))}"`, body: lines(starter.map((x) => starterLine(x, read, down)), { lead: 76 }) });
  const shelfSec = card({ label: org ? `Published by ${noDash(org)}` : "Published", count: down ? "" : shelf.length || "", flush: true, region: "shelf", attrs: 'data-reveal="4"', action: read.more ? chip("Newest", { title: "More published items than the newest shown here" }) : "",
    body: shelf.length ? lines(shelf.map((x) => shelfLine(x, read, down)), { lead: 76 }) : empty(down ? "Not read" : "Nothing published yet", { title: down ? "" : (read.empty || {}).shelf || EMPTY_SHELF(org) }) });
  const heldSec = card({ label: pname ? `Equipped in ${noDash(pname)}` : "Equipped here", count: down ? "" : held.length || "", flush: true, region: "equipped-here", attrs: 'data-reveal="5"',
    body: held.length ? lines(held.map(heldLine), { lead: 76 }) : empty(down ? "Not read" : "Nothing equipped", { title: down ? "" : (read.empty || {})["equipped-here"] || EMPTY_HERE }) });
  const wallSec = `<p class="bc-wall" data-region="org-wall-note" title="${esc(wall.text || ORG_WALL(org))}">Stays inside ${txt(org || "this org")}</p>`;

  const banner = down ? unreachableState({ what: "Broadcast could not be read from the ledger, so its numbers show ? until it answers." }) : "";
  return LIVE_CSS + BC_CSS + `<section class="bc" data-screen="broadcast">${banner}${ack}${head}${stack(glance, live, chips, cols(stack(starterSec, shelfSec), heldSec), wallSec)}</section>` + BC_JS;
}

// renderStarterPage(card, read, { body, ack }) -> one starter item's page (GET /broadcast/starter/:slug to a browser): what it
// is, where this project stands on it with its Equip, the MCP calls it uses, then its full text as the AI client reads it
export function renderStarterPage(card, read, o = {}) {
  const c = card || {};
  const body = o.body || "";
  const crumbs = breadcrumb([{ label: "Broadcast", href: orgPath("/broadcast") }, { label: `The starter pack · ${KIND_WORD[c.kind] || c.kind}` }]);
  const head = crumbs + pageHeader({ eyebrow: "", title: noDash(c.title), lede: noDash(c.purpose),
    actions: `<div class="bc-foot bc-foot-page" data-preset="${esc(c.slug)}" data-kind="${esc(c.kind)}">${starterFoot(c, read, read.live === "unreachable")}</div>` });
  const calls = `<p class="bc-calls bc-calls-page">${(c.calls || []).map((x) => `<code>${esc(x)}</code>`).join(" ")}</p>`;
  return BC_CSS + `<style>.bc-sp{max-width:820px}.bc-foot-page{padding:0;max-width:340px}.bc-calls-page{white-space:normal;display:flex;flex-wrap:wrap;gap:6px;margin:0 0 22px}.bc-calls-page code{font:400 11.5px/1 var(--mono);padding:4px 7px;border-radius:5px;background:var(--well);color:var(--text-muted)}
.bc-md{font:400 14px/1.65 var(--sans);color:var(--text)}.bc-md h1{display:none}.bc-md h2{margin:26px 0 8px;font:700 15px/1.35 var(--sans)}.bc-md h3{margin:18px 0 6px;font:700 13.5px/1.35 var(--sans)}
.bc-md p,.bc-md li{color:var(--text-muted)}.bc-md li{margin:0 0 6px}.bc-md ol,.bc-md ul{padding-left:22px}.bc-md code{font:400 12px/1.5 var(--mono);color:var(--text);background:var(--well);border-radius:4px;padding:1px 5px;overflow-wrap:anywhere}.bc-md b{color:var(--text)}</style>
<section class="bc bc-sp" data-screen="broadcast-starter">${o.ack ? `<p class="bc-ack" role="status">${txt(o.ack)}</p>` : ""}${head}${calls}<article class="bc-md" data-region="starter-body">${body}</article></section>`;
}
