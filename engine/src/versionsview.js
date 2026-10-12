// src/versionsview.js — Versions, a Map view (the Versions.dc.html artboard, wireframe wf-versions): why each version of the
// project's knowledge exists, what changed between two of them, and the owner's restore. A version is a snapshot in D1
// (src/knowledge/versions.js): the owner makes one with publish_version, and restore_version puts one back, live at once.
//
// ONE seam per door, two faces each (the /decisions pattern): readVersionsView(env, reader, q) is the whole read — GET
// /versions and GET /versions/:v answer it as JSON to a script and render it (renderVersions, from the SAME call) to a
// browser; the MCP `versions` tool answers the same JSON. readVersionHead(env) is the BEHIND poll (GET /versions?head=1, the
// tool with head:true). filePublish / fileRestore are POST /versions/publish and POST /versions/restore (the MCP
// publish_version and restore_version call the knowledge seam directly). The read is the version list, one statement (a
// version older than the list, one more): each version carries what changed from the one before it, worked out when it was
// made, so viewing never diffs.
//
// renderVersions(read, opts) draws the header and three regions in the artboard's order, each with data-region:
// not-current-banner · diff · timeline. Every button carries data-button and either the door it presses (data-door) or
// data-client. Viewing an older version is the BEHIND pattern (ui.js behindState); the current one says so with LANDED.
import { esc, errorState, behindState, stateChip, dayMonth } from "./ui.js";
import { card, tile, tileRow, chip, avatar, filterRow, line, lines, empty, pageHead, cols, stack } from "./parts.js";
import { resolveOwner, ownerName } from "./tenant.js";
import { projectOf, projectSlug } from "./project.js";
import { nounOf } from "./knowledge/schema.js";
import { versionHead, versionList, versionOne, publishVersion, restoreVersion, redactChanges, nOf, VERSION_CAUSES, VERSIONS_MAX } from "./knowledge/versions.js";
import { isD1Quota } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const VERSIONS_REGIONS = ["not-current-banner", "diff", "timeline"];
export const VERSIONS_FILTERS = ["all", ...VERSION_CAUSES];
export const VERSIONS_FILTER_LABELS = { all: "All", published: "Published", restored: "Restored" };
export const DIFF_TITLE = (from, to) => `Changes v${from} → v${to}`;
export const DIFF_EMPTY_ONE = "Nothing to compare";
export const DIFF_FIRST = (n) => `v${n} is the first`;
export const DIFF_EMPTY_NONE = "Nothing to compare";
// copy: off-screen (the versions JSON's note)
export const NO_VERSION_NOTE = "No version yet: the owner makes v1 with publish_version {project, title}.";
export const TIMELINE_EMPTY = () => "No version yet";   // D6a: the head's chip says "Not versioned yet": the page says it once
// copy: error (a refusal: the disabled Restore's title and its screen-reader reason)
export const RESTORE_REASON = (owner) => `Only ${owner} can restore a version. Viewing is free and changes nothing.`;
// what the owner's Restore does, said on the button's page: nothing filed since the newest version is lost
// copy: off-screen (the Restore press's title and its screen-reader description)
export const RESTORE_KEEPS = "What the project holds now is kept as a version first, so nothing is lost and the restore can be undone.";

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const NO_DIFF = { from: null, to: null, lines: [], more: 0, byKind: {} };

// ---- the head (the BEHIND poll) ----
// readVersionHead(env) -> { n, at, title, cause } | { n: null, at: null, empty: "no_versions" }
export async function readVersionHead(env) {
  const h = await versionHead(env, await projectOf(env));
  return h ? { n: h.n, at: h.at, title: noDash(h.title), cause: h.cause.kind } : { n: null, at: null, empty: "no_versions" };
}

// ---- the read ----
// readVersionsView(env, reader, q) -> { project: {key, name}, filter: {cause}, current, viewing, versions, counts: {all,
// published, restored}, diff: {from, to, lines, more, byKind} } (+ empty, note, status/error, live). q: a URLSearchParams,
// the MCP arguments, or { v, cause }; v = n (12 or v12); absent = the current version.
export async function readVersionsView(env, reader, q = {}) {
  const get = (k) => (q && typeof q.get === "function" ? q.get(k) : q && q[k]);
  const causeRaw = String(get("cause") || "").toLowerCase();
  const cause = VERSIONS_FILTERS.includes(causeRaw) ? causeRaw : "all";
  const v = get("v") != null && String(get("v")).trim() !== "" ? String(get("v")).trim().slice(0, 40) : null;
  const key = await projectOf(env);
  const isOwner = !!(reader && reader.role === "owner");
  const none = { current: null, viewing: null, versions: [], counts: { all: 0, published: 0, restored: 0 }, diff: NO_DIFF };
  let read;
  try { read = await versionList(env, key); }
  catch (e) { if (isD1Quota(e)) throw e; return { project: { key, name: key ? projectSlug(key) : key }, filter: { cause }, isOwner, ...none, live: "unreadable" }; }
  const project = { key: key || null, name: read.name || (key ? projectSlug(key) : null) };
  const base = { project, filter: { cause }, isOwner };
  const list = read.rows;
  const counts = { all: list.length, published: list.filter((x) => x.cause.kind === "published").length, restored: list.filter((x) => x.cause.kind === "restored").length };
  const unknown = { status: 404, error: "unknown_version", v, note: `No version ${v} in ${project.name || "this project"}: GET /versions lists them.` };
  if (!list.length) return { ...base, ...none, empty: "no_versions", note: NO_VERSION_NOTE, ...(v ? unknown : {}) };
  const current = list[0];
  let viewing = current;
  if (v != null) {
    const n = nOf(v);
    viewing = n == null ? null : list.find((r) => r.n === n) || (await versionOne(env, project.key, n));
    if (!viewing) return { ...base, ...unknown, current, viewing: null, versions: [], counts, diff: NO_DIFF };
  }
  // the diff: what changed in the version on the page, from the one before it (its row carries it); a card, a doc or a card
  // kind this reader may not read is named by its kind alone (versions.js redactChanges)
  const diff = redactChanges(viewing.changes, reader) || { ...NO_DIFF, to: viewing.n };
  // the list carries each version's change counts; its lines ride on the version viewed only
  const slim = (r) => { const c = r.changes || {}; return { ...r, changes: { from: c.from ?? null, to: r.n, total: (c.lines || []).length + (Number(c.more) || 0), byKind: c.byKind || {} } }; };
  const versions = (cause === "all" ? list : list.filter((x) => x.cause.kind === cause)).map(slim);
  return { ...base, current: slim(current), viewing: slim(viewing), versions, counts, diff, ...(list.length >= VERSIONS_MAX ? { more: true } : {}) };
}

// versionsJson(read) — the door's JSON (and the MCP tool's): the read without the render-only fields
export function versionsJson(read) {
  const { isOwner, status, ...out } = read || {};
  return out;
}

// ---- the two owner doors ----
const HTTP_OF = { owner_only: 403, project_forbidden: 403, unknown_version: 404, already_current: 409, write_failed: 500 };
async function ownerOnly(env) {
  let owner = "the owner"; try { owner = ownerName(await resolveOwner(env)); } catch { /* the plain word */ }
  return { http: 403, error: "owner_only", note: RESTORE_REASON(owner) };
}
// filePublish(env, reader, { project, title, eval, via }) -> { http, project, version, ledger } | { http, error, … }
export async function filePublish(env, reader, a = {}) {
  if (!reader || reader.role !== "owner") return { http: 403, error: "owner_only", note: "Only the owner publishes a version. Viewing is free and changes nothing." };
  const out = await publishVersion(reader, a, env, { via: a.via ? String(a.via).slice(0, 60) : "http" });
  return { http: out.error ? HTTP_OF[out.error] || 422 : 200, ...out };
}
// fileRestore(env, reader, { project, v, eval, via }) -> { http, project, restored, version, ledger } | { http, error, … }
export async function fileRestore(env, reader, a = {}) {
  if (!reader || reader.role !== "owner") return ownerOnly(env);
  const out = await restoreVersion(reader, a, env, { via: a.via ? String(a.via).slice(0, 60) : "http" });
  return { http: out.error ? HTTP_OF[out.error] || 422 : 200, ...out };
}

// ---- the page (sprint 3, L3: the revision, docs/plan/LOOK.md) ----
// The head (Map / Versions), the banner (the current version says so with LANDED; an older one is the BEHIND pattern, with the
// owner's Restore, or for anyone else the press disabled with its reason in its title), the glance (current, versions,
// published, restored), the ONE filter row (the cause, links and the client-side filter), the timeline (each version one line:
// v<n>, its title, why it exists, who made it, when; opened in place: what it changed, by kind) and the changes of the version
// on the page (each one line: added, changed or removed, its kind, its name). Same read, same three regions in the artboard's
// order, same forms and doors. Hooks a check reads: data-region; data-n, data-cause and aria-current on a timeline row;
// data-viewing on its tag; data-op and data-ref on a change line; data-cause on a filter chip.
const CSS = `<style>
.vs{display:block}
.vs-banner .state{margin:0}
.vs-restore{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin:12px 0 0}
.vs-restore form{margin:0}
.vs-viewing{flex:none;display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:5px;font:600 10.5px/1 var(--mono);letter-spacing:.04em;background:var(--accent-tint);color:var(--accent-text)}
.vs .p-li[hidden]{display:none}
</style>`;

// the cause filter: client-side, it shows the timeline rows of one cause (the chips are links too, so the read's own ?cause=
// answers without a script)
const FILTER_JS = `<script>(function(){var host=document.querySelector('.vs');if(!host)return;
host.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-button="filter"]');if(!a)return;e.preventDefault();var c=a.getAttribute('data-cause')||'all';
[].forEach.call(host.querySelectorAll('[data-button="filter"]'),function(x){if(x===a)x.setAttribute('aria-current','true');else x.removeAttribute('aria-current');});
[].forEach.call(host.querySelectorAll('[data-region="timeline"] li[data-cause]'),function(r){r.hidden=c!=='all'&&r.getAttribute('data-cause')!==c;});});})();</script>`;

const hidden = (n, v) => `<input type="hidden" name="${esc(n)}" value="${esc(v)}">`;
const plural = (n, kind) => `${n} ${nounOf(kind, n)}`;
const refHref = (line) => (line.what === "question" ? orgPath(`/question/${encodeURIComponent(line.ref)}`) : line.what === "goal" ? orgPath(`/goals/${encodeURIComponent(line.ref)}`) : "");
// "2 goals changed · 1 question added": the diff's counts per kind
function byKindLine(byKind) {
  const out = [];
  for (const [kind, c] of Object.entries(byKind || {})) for (const [k, w] of [["added", "added"], ["changed", "changed"], ["removed", "removed"]]) if (c[k]) out.push(`${plural(c[k], kind)} ${w}`);
  return out.join(" · ");
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortAt = (at) => { const t = Date.parse(String(at || "")); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${String(at).slice(11, 16)}`.trim(); };
function countsMeta(r) {
  const c = r.counts || {};
  return Object.keys(c).filter((k) => Number(c[k]) > 0).map((k) => plural(Number(c[k]), k)).join(" · ");
}
const OP = { "+": ["Added", "ok"], "-": ["Removed", "bad"] };

// renderVersions(read, { brand, ownerLabel, flash, eval, path }) -> the Versions content (the route wraps it in shell()). Pure.
export function renderVersions(read, opts = {}) {
  const d = read || {};
  const projectKey = (d.project && d.project.key) || "";
  const cur = d.current, view = d.viewing;
  const all = d.counts ? d.counts.all : 0;
  const base = opts.path || orgPath("/versions");
  const qs = (extra) => { const p = new URLSearchParams(); if (projectKey) p.set("project", projectKey); for (const [k, v] of Object.entries(extra)) p.set(k, v); if (opts.eval) p.set("eval", "1"); return p.toString(); };
  const owner = opts.ownerLabel || "the owner";
  const head = pageHead({ title: "Versions", crumbs: [{ label: "Map", href: orgPath("/map") }, { label: "Versions" }],
    aside: !cur && d.live !== "unreadable" ? `<span data-region="not-current-banner">${stateChip("pending", "Not versioned yet")}</span>` : "" });
  // not-current-banner: BEHIND when the page shows an older version (with Restore, the owner's press, or disabled with its
  // reason in its title); the current one says so with the LANDED chip
  const unreadable = d.live === "unreadable";
  const older = !unreadable && cur && view && view.n !== cur.n;
  let banner;
  if (unreadable) banner = `<div data-region="not-current-banner">${errorState({ what: "The versions list did not read.", why: "Reload to try again." })}</div>`;
  else if (!cur) banner = "";
  else if (older) {
    const restore = d.isOwner
      ? `<form method="POST" action="${orgPath(`/versions/restore`)}">${hidden("v", view.n)}${projectKey ? hidden("project", projectKey) : ""}${opts.eval ? hidden("eval", "1") : ""}<button class="u-btn" type="submit" data-button="restore" data-door="POST /versions/restore" aria-describedby="vs-restore-keeps" title="Makes the project's knowledge v${esc(view.n)}'s again, on every screen at once. ${esc(RESTORE_KEEPS)}">Restore v${esc(view.n)}, keeping the current state</button></form><span class="u-sr" id="vs-restore-keeps">${esc(RESTORE_KEEPS)}</span>`
      : `<button class="u-btn" type="button" disabled data-button="restore" data-door="POST /versions/restore" aria-describedby="vs-restore-why" title="${esc(RESTORE_REASON(owner))}">Restore v${esc(view.n)}</button><span class="u-sr" id="vs-restore-why">${esc(RESTORE_REASON(owner))}</span>`;
    banner = `<div class="vs-banner" data-region="not-current-banner">${behindState({ head: cur, viewing: { n: view.n, at: view.at } })}<div class="vs-restore">${restore}</div></div>`;
  } else banner = card({ region: "not-current-banner", flush: true, body: lines([line({ lead: stateChip("LANDED", "current"), title: `v${cur.n} · ${noDash(cur.title || "")}`, rowAttrs: `title="${esc(`You are looking at v${cur.n}, the current version, made ${dayMonth(cur.at)}`)}"`, meta: `<span>${esc(shortAt(cur.at))}</span>` })], { compact: true }) });
  const counts = d.counts || { all: 0, published: 0, restored: 0 };
  const glance = cur && !unreadable ? tileRow([
    tile({ label: "Current", value: `v${cur.n}`, key: "current", sub: dayMonth(cur.at) }),
    tile({ label: "Versions", value: counts.all, key: "versions" }),
    tile({ label: "Published", value: counts.published, key: "published" }),
    tile({ label: "Restored", value: counts.restored, key: "restored" }),
  ], { region: "glance", label: "Versions" }) : "";
  // diff: what changed in the version on the page, from the one before it
  const df = d.diff || {};
  let diffTitle = "Changes", dbody, dcount = "";
  if (unreadable) dbody = empty("Not read");
  else if (!cur) dbody = empty(DIFF_EMPTY_NONE);
  else if (df.from == null) dbody = empty(all === 1 ? DIFF_EMPTY_ONE : DIFF_FIRST(df.to));
  else if (df.unreadable) { diffTitle = DIFF_TITLE(df.from, df.to); dbody = errorState({ what: "The two versions did not read, so the diff is not drawn.", why: "Reload to try again." }); }
  else {
    diffTitle = DIFF_TITLE(df.from, df.to);
    const ls = Array.isArray(df.lines) ? df.lines : [];
    dcount = ls.length + (Number(df.more) || 0) || "";
    dbody = ls.length ? lines(ls.map((l) => { const [w, t] = OP[l.op] || ["Changed", "quiet"]; return line({ attrs: `data-op="${esc(l.op)}" data-ref="${esc(l.ref)}"`, lead: chip(w, { tone: t }), title: noDash(l.label), href: refHref(l), meta: chip(l.what) }); }), { lead: 76 })
      + (Number(df.more) ? lines([line({ title: `${df.more} more` })], { compact: true }) : "")
      : empty(`Nothing changed between v${df.from} and v${df.to}`);
  }
  const diff = card({ label: diffTitle, count: dcount, flush: true, region: "diff", action: df.byKind ? `<span class="p-count">${esc(byKindLine(df.byKind))}</span>` : "", body: dbody });
  // timeline: every version as a line, the one on the page marked; the cause filter as the one filter row
  const f = (d.filter && d.filter.cause) || "all";
  const filters = cur && !unreadable ? filterRow({ label: "Filter the timeline", groups: [{ key: "cause", label: "Cause", items: VERSIONS_FILTERS.map((c) => ({ label: VERSIONS_FILTER_LABELS[c], count: counts[c] ?? 0, href: `${base}?${qs({ cause: c })}`, current: c === f, all: c === "all",
    attrs: `data-cause="${c}" data-button="filter" data-client="filters the timeline"` })) }] }) : "";
  const tl = (Array.isArray(d.versions) ? d.versions : []).map((r) => {
    const viewed = view && r.n === view.n;
    const c = r.cause || {};
    const why = c.kind === "restored" && c.ref ? `restored from v${c.ref}` : "published";
    const cm = byKindLine(r.changes && r.changes.byKind) || (r.changes && r.changes.from != null ? "nothing changed" : countsMeta(r));
    return line({ attrs: `data-n="${esc(r.n)}" data-cause="${esc(c.kind)}"${viewed ? ' aria-current="true"' : ""}`, lead: chip(`v${r.n}`), title: noDash(r.title || `v${r.n}`),
      href: viewed ? "" : orgPath(`/versions/${r.n}${projectKey || opts.eval ? `?${qs({})}` : ""}`), linkAttrs: `data-button="view" data-door="GET /versions/:v"`, sub: cm ? esc(cm) : esc(why),
      meta: `${viewed ? `<span class="vs-viewing" data-viewing title="the version on this page">viewing</span>` : ""}${r.by ? avatar({ name: noDash(r.by), size: 20 }) : ""}<span title="${esc(why)}">${esc(shortAt(r.at))}</span>` });
  });
  const fl = opts.flash || {};
  const flash = fl.restored ? `<p class="dq-flash vs-flash" role="status" title="${esc(fl.kept ? `What it held just before is kept as v${fl.kept}` : "")}">${chip(`Restored as v${fl.restored}`, { tone: "ok" })}</p>` : "";
  // a list that does not read is ERROR, never an EMPTY that looks true (the Decisions rule)
  const tbody = unreadable ? errorState({ what: "The versions list did not read, so no version is listed.", why: "Reload to try again." })
    : !cur ? empty(TIMELINE_EMPTY(), { title: d.note || NO_VERSION_NOTE, action: { href: orgPath("/missing"), label: "What is missing" } })
    : tl.length ? lines(tl, { lead: 44 }) : empty(`No ${f} version yet`, { action: { href: `${base}?${qs({})}`, label: "Every version" } });
  const timeline = card({ label: "Timeline", count: tl.length || "", flush: true, region: "timeline", body: `${flash}${tbody}` });
  return CSS + `<section class="vs" data-screen="versions">${head}${stack(banner, glance, filters, cols(diff, timeline))}</section>` + FILTER_JS;
}
