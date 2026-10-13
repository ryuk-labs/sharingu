// src/holes.js — What is missing: the checklist's reader (sprint 3, B3). The checklist itself (the items, their measures,
// the meter, the calls) is src/checklist.js; this file is the `missing` answer and the page. computeHoles is the ONE read behind
// the `missing` tool, brain://missing and GET /missing for a seat; the public page draws holesShape, which reads nothing.
//
// The answer leads with the meter (overall and per area), then the OPEN items in the order a project needs them (core, app,
// proof, gtm, agents; within an area the registry's order), each with its plain sentence of what is missing, its first
// missing thing, the exact call that fills it and where it shows; `filled` names the done ones, `next` is the first open one.
// The areas a project has not declared are listed apart (notApplicable), each with the one call that would start it, and
// never counted. Filing a call moves the item on the very next read, with no other step.
//
// Kept for every caller (additive since sprint 1): items[] with piece (the sprint-1 piece name where one maps 1:1, else the
// item's id), status "open", what, count, countText, fillPath ({tool, args}: preview then save_knowledge, rule_question or submit_grade,
// sent as it is) and shows; filled; next; summary.open / summary.filled. New: id, area, state, have, want, first, fill (the
// call as one line: a knowledge write or a grade as its preview; the first OPEN_DETAIL items), meter, areas, notApplicable,
// checklist (every item, compact).
// Cost: src/checklist.js checklistFor with firsts (at most four statements beyond the request's memoized reads).
import { isEvalSeat } from "./util.js";
import { roleClassOf } from "./hats.js";
import { orgProjectsOnce, NO_PROJECT_YET } from "./core.js";
import { esc, unreachableState } from "./ui.js";
import { card, tile, tileRow, ring, bar, chip, filterRow, hrefWith, group, line, lines, lineDetail, empty, pageHead, stack, btn, copyBtn, num, id } from "./parts.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { CHECKLIST, ITEM_LABEL, AREA_LABEL, AREA_ORDER, checklistFor, whatOf, fillOf, startOf, callText as checklistCall, holeOf, meterWords, scopeWords } from "./checklist.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const HOLE_CAP = 50;       // the countText of a large count reads as "50+" (the count itself is exact)
// every open item carries its call (fill, the one line to show, and fillPath, the call to send); the cap is on DETAIL, never on
// the call (the one-pass fix 8): past OPEN_DETAIL, when the answer would pass HOLES_BYTES_MAX, an item keeps fill and fillPath
// and drops its `shows` (the place it fills, which formats also says)
export const OPEN_DETAIL = 5;
export const HOLES_BYTES_MAX = 48 * 1024;
const countWord = (n) => (n > HOLE_CAP ? `${HOLE_CAP}+` : String(n));
// sprint 3 S3b: the checklist offers a reader ONLY a call the door lets them make (the walk's step c found start-here offered
// to a member and refused owner_only). authority: these sets follow the doors, they open nothing:
//   · OWNER_ONLY: the rulings the owner owes (rule_question: only the owner rules a question) and the project's own start-here
//     doc (src/knowledge/schema.js roleRefusal: the first doc every connecting agent is told to read, the owner's agents too,
//     so only the owner writes it; the reason holds: a member's text there would be read first by everyone's agent);
//   · NOT_PARTNER: equipping from Broadcast (src/broadcast.js: a Partner is refused publish and equip).
// An open item a reader may not fill is listed in `others` (who fills it: "owner" or "member"), with no call, and the meter
// stays the project's own (the same for every reader).
export const OWNER_ONLY = new Set(["rulings-owed", "start-here"]);
export const NOT_PARTNER = new Set(["agents-equipped"]);
// offeredTo(reader, id) -> may this reader make the call that fills item id
export const offeredTo = (reader, id) => {
  if (reader && reader.role === "owner") return true;
  if (OWNER_ONLY.has(id)) return false;
  return !(NOT_PARTNER.has(id) && roleClassOf(reader && reader.role) === "partner");
};

// what a seat's agent does with the reply (agent-facing text, never drawn on the page)
// copy: off-screen (the agent-facing intake of the `missing` answer)
export const INTAKE = [
  "Call `missing` first, with `project`: the meter says how filled the project is, and every open item says what is missing (`what`), the first missing thing (`first`) and the call that fills it (`fill`, and `fillPath` as {tool, args}).",   // vocab:allow
  "Put the real facts in the call's <placeholders>, from where the person's input lives (docs, code, chat, screenshots); never invent what the source does not say: file a question instead.",
  "Send it: a fillPath that is a `preview` carries its items; show the person the preview's text, then call the write tool each item names (`filesWith`: `save_knowledge` for these) with its previewId and the same items. A grade is submit_grade (it files at once); a ruling is rule_question, the owner's alone.",
  "Read `missing` again: a filled item moves on the very next read, and it shows where `shows` says. Repeat until nothing is open.",   // vocab:allow
  // sprint 12, 12.2: the four steps' 3 and 4 — the two fill skills walk a whole side with these same calls
  "To fill a whole side at once, run the skill `fill-the-product-side` (from the code, docs and tickets you can read) or `fill-the-gtm-side` (from the person's mail, chats, meetings and CRM: summaries and links only); each walks these same calls, every item through `preview` first.",
];

// the reader's word for a piece (an item id, or a sprint-1 piece name)
const OLD_LABEL = { goals: "The goal tree", questions: "Rulings owed", checks: "Checks", model: "The model", gtm: "The GTM template", agents: "Agents" };
export function holeLabel(id) {
  const s = String(id || "");
  return ITEM_LABEL[s] || OLD_LABEL[s] || s;
}
export const callText = checklistCall;
const shownAt = (it) => (it && it.shows) || "";

// openItem(item, project, owner, detail) -> the items[] row of one open item (detail: it carries fill as well as fillPath)
function openItem(it, project, owner, detail = true) {
  const spec = CHECKLIST.find((x) => x.id === it.id) || {};
  const f = fillOf(it, project);
  return { piece: it.piece, id: it.id, area: it.area, status: "open", state: it.state, have: it.have, want: it.want, count: it.count, countText: countWord(it.count),
    what: whatOf(it, { owner }), ...(it.first ? { first: it.first } : {}), fill: f.fillPath ? callText(f.fillPath) : `Equip on Broadcast: ${f.href}`,
    fillPath: f.fillPath, ...(f.href ? { href: f.href } : {}), ...(detail ? { shows: shownAt(spec) } : {}), ...(OWNER_ONLY.has(it.id) ? { ownerOnly: true } : {}) };
}
const bytesOf = (v) => new TextEncoder().encode(JSON.stringify(v)).length;

// completeItemsOf(h) -> the checklist items the Complete list draws: every done item `filled` names. `filled` holds item ids
// (the one-pass fix 8), so it is matched by id — D1b item 10: it was matched by holeOf(id), which drops every item whose hole
// name differs from its id (goal-tree, rulings-owed, gtm-template …), so the list showed fewer items than its count
export function completeItemsOf(h) {
  const filled = new Set(Array.isArray(h && h.filled) ? h.filled : []);
  return ((h && h.checklist) || []).filter((x) => x.state === "done" && filled.has(x.id));
}
// computeHoles(env, reader, tenant, { includeEval }) -> { generatedAt, org, project, intake, meter, areas, next, items, filled,
// notApplicable, checklist, summary, live?, note? }. The project is the request's (project.js projectOf): a read at the org
// level has none and says how to name one. A failed read answers live "unreachable" and nothing else; a D1 quota error
// propagates.
export async function computeHoles(env, reader, tenant, opts = {}) {
  const org = (tenant && tenant.brand && tenant.brand.org) || null;
  void (typeof opts.includeEval === "boolean" ? opts.includeEval : isEvalSeat(reader && reader.id));   // the checklist reads knowledge, which carries no suite mark
  const isOwner = !!(reader && reader.role === "owner");
  const c = await checklistFor(env, reader, { firsts: true });
  const project = c.project;
  const base = { generatedAt: "live", org, project, intake: INTAKE };
  const none = { meter: { done: 0, total: 0, pct: null, open: 0, words: "" }, areas: [], next: null, items: [], filled: [], notApplicable: [], checklist: [], summary: { open: 0, filled: 0 } };
  // D1b item 11: an org with no project yet is pointed at create_project (core.js NO_PROJECT_YET), never asked to name one
  if (!project) {
    const zero = !(await orgProjectsOnce(env).catch(() => [null])).length;
    return { ...base, ...none, note: zero ? NO_PROJECT_YET : "This read is at the org level: name one of your projects with `project` to see what it still needs.",   // copy: off-screen
      ...(zero ? { fillPath: { tool: "create_project", args: { key: "<a-z, 0-9 and dashes>", name: "<the project's name>" } } } : {}) };
  }
  if (c.live) return { ...base, ...none, live: "unreachable", note: "What is missing could not be read just now: read it again in a moment." };
  const mine = (it) => offeredTo(reader, it.id);
  const isOpen = (it) => it.state === "partial" || it.state === "empty";
  const open = c.items.filter((it) => isOpen(it) && mine(it));
  // the open items this reader does not fill: named, with who does, and no call
  const others = c.items.filter((it) => isOpen(it) && !mine(it)).map((it) => ({ id: it.id, area: it.area, state: it.state, have: it.have, want: it.want,
    what: whatOf(it, { owner: false }), by: OWNER_ONLY.has(it.id) ? "owner" : "member" }));
  let items = open.map((it) => openItem(it, project, isOwner, true));
  if (bytesOf(items) > HOLES_BYTES_MAX) items = open.map((it, i) => openItem(it, project, isOwner, i < OPEN_DETAIL));
  // the same ids in filled, items and checklist (the one-pass fix 8): each item by its id (items[] keeps `piece` beside it)
  const filled = c.items.filter((it) => it.state === "done" && mine(it)).map((it) => it.id);
  // the areas not started, each with the call that starts it: a Partner is not offered the agents area (equip is refused them)
  const startable = (a) => isOwner || !(a === "agents" && roleClassOf(reader && reader.role) === "partner");
  const notApplicable = AREA_ORDER.filter((a) => a !== "core" && !c.applies[a] && startable(a)).map((a) => {
    const s = startOf(a, project);
    return { area: a, label: AREA_LABEL[a], piece: s.piece, what: s.what, fill: s.fillPath ? callText(s.fillPath) : `Equip on Broadcast: ${s.href}`, fillPath: s.fillPath, ...(s.href ? { href: s.href } : {}),
      counts: `not counted yet: starting it adds its items to the meter, and the answer that starts it says how many` };   // copy: off-screen
  });
  const meter = { ...c.meter, words: meterWords(c.meter), counts: scopeWords(c.areas) };
  return { ...base, meter, areas: c.areas, next: items[0] || null, items, filled, notApplicable, ...(others.length ? { others } : {}),
    checklist: c.items.map((it) => ({ id: it.id, area: it.area, state: it.state, have: it.have, want: it.want })),
    summary: { open: items.length, filled: filled.length, done: c.meter.done, total: c.meter.total, pct: c.meter.pct } };
}

// holesShape() — the PUBLIC view (no sign-in): every item, what a good fill is and the call that fills it, with no status, no
// count and no project. Pure: reads nothing. (The owner's rulings are not a piece anyone else fills.)
export function holesShape(tenant) {
  const items = CHECKLIST.filter((it) => !OWNER_ONLY.has(it.id)).map((it) => {
    const f = fillOf({ id: it.id }, null);
    return { piece: holeOf(it.id), id: it.id, area: it.area, standard: it.fills, question: it.question, fillPath: f.fillPath, fill: f.fillPath ? callText(f.fillPath) : `Equip on Broadcast: ${f.href}`, shows: it.shows };
  });
  return { shapeOnly: true, org: (tenant && tenant.brand && tenant.brand.org) || null, intake: INTAKE, items };
}

// renderHoles(items, { brand, params }) — What is missing (sprint 3, L3: the revision, docs/plan/LOOK.md; the approved mock is
// tools/parts-gallery.mjs missing()): the glance (items filled, how filled by depth, how many open), the ONE filter row (the
// area, its open count), the open items grouped by area (each one line: its depth as a ring, its label, have of want, and ONE
// Copy button carrying the call that fills it: the one page that carries calls, in the button's hidden code and its title,
// never as prose; what is missing rides the row's title; the first missing thing and where it shows open in place), the
// complete items folded under one line, the areas not started (each with the Copy of the call that starts it). The public
// sees the same lines with the standard as their expanded body and no status. Hooks a check reads: data-hole (then
// data-status="open" | "filed", adjacent), data-item, data-area, data-state, data-next on the first open one, data-applies="no"
// on an area not started, data-region meter, data-metric + data-value on the tiles and the missing count.
const HOLES_STYLE = `
.hl{display:block}
.hl .p-li[data-next]>.p-x>.p-line .p-line-title{font-weight:600}
`;
const words = (t) => esc(String(t ?? "").replace(/\s*[—–]\s*/g, " - "));
const plain = (t) => String(t ?? "").replace(/\s*[—–]\s*/g, " - ");
// placeOf(item) -> the page a seat opens for an item: the registry's place with the item's own first missing thing put in
// (a node by its id on the Map), else the place's page with its pattern dropped (the screens of an app, a card on its tab)
function placeOf(x) {
  const path = String(x.shows || ""), first = x.first && x.first.id;
  if (x.id === "start-here") return orgPath("/doc/start-here.md");
  if (x.id === "agents-equipped") return orgPath("/broadcast");
  if (x.id === "gtm-lists" || x.id === "gtm-strategy") return orgPath("/gtm");
  if (x.id === "rulings-owed") return first ? orgPath(`/question/${encodeURIComponent(first)}`) : orgPath("/decisions");
  if (/^\/map\?node=\{/.test(path)) return first && x.id !== "screens" ? orgPath(`/map?node=${encodeURIComponent(first)}`) : orgPath("/map");
  return orgPath(path.replace(/\?.*\{.*$/, "").replace(/\/\{[^}]*\}.*$/, "") || path);   // the registry's route, under the org
}
const linkOf = (path) => (path && !/[{}<]/.test(path) && path.startsWith("/") ? `<a class="u-link" href="${esc(path)}">${esc(path)}</a>` : path ? `<code>${esc(path)}</code>` : "");
// the item's Copy: a link to the item (where it shows), so with script off the press still goes somewhere; the script copies the call
const itemHref = (x) => { const p = placeOf(x); return p && p.startsWith("/") && !/[{}<\s]/.test(p) ? p : undefined; };
// (the public shape, read signed out, has no item to open: its Copy stays a button)
const copyOf = (x, linked = true) => { const href = linked ? itemHref(x) : undefined;
  return x.fillPath ? copyBtn(callText(x.fillPath), { title: "Copy the call that fills it", attrs: 'data-button="copy-call"', href })
    : x.href ? `<a class="u-btn small ghost" href="${esc(x.href)}">Equip</a>` : x.fill ? copyBtn(x.fill, { title: "Copy the call that fills it", attrs: 'data-button="copy-call"', href }) : ""; };
function openLine(x, isNext) {
  const want = Math.max(1, Number(x.want) || 1), have = Math.max(0, Number(x.have) || 0);
  const first = x.first ? (x.first.name ? `${words(x.first.name)} ${id(x.first.id || "")}` : id(x.first.id || x.first)) : "";
  return line({ attrs: `data-hole="${esc(x.piece)}" data-status="open" data-item="${esc(x.id)}" data-area="${esc(x.area)}" data-state="${esc(x.state)}"${isNext ? " data-next" : ""}`,
    lead: ring({ value: have, max: want, size: 20, label: "Filled" }), title: holeLabel(x.id), rowAttrs: `title="${esc(plain(x.what))}"`,
    meta: `${want > 1 ? `<span data-metric="missing" data-value="${esc(x.count)}">${esc(num(have))} of ${esc(num(want))}</span>` : ""}${isNext ? chip("Next", { tone: "warn" }) : ""}${x.ownerOnly ? chip("Yours") : ""}`,
    action: copyOf(x),
    detail: lineDetail({ facts: [["Area", esc(AREA_LABEL[x.area] || x.area)], first ? ["First", first] : null, x.shows ? ["Shows on", linkOf(placeOf(x))] : null, ["Id", id(x.id)]] }) });
}
export function renderHoles(items, { brand = DEFAULT_BRAND, params = null } = {}) {
  const h = items || {};
  const list = Array.isArray(h.items) ? h.items : [];
  const get = (k) => (params && typeof params.get === "function" ? params.get(k) : params && params[k]);
  if (h.shapeOnly) {
    // the public shape: every item, the standard for it and the call that fills it, no status, no count, no project
    const groups = AREA_ORDER.map((a) => {
      const xs = list.filter((x) => x.area === a);
      if (!xs.length) return "";
      return group({ title: AREA_LABEL[a], count: xs.length, open: a === "core", body: lines(xs.map((x) => line({ attrs: `data-hole="${esc(x.piece)}" data-item="${esc(x.id)}"`, title: holeLabel(x.id),
        rowAttrs: `title="${esc(plain(x.question))}"`, action: copyOf(x, false),
        detail: lineDetail({ facts: [["A good fill", words(x.standard)], x.shows ? ["Shows on", `<code>${esc(x.shows)}</code>`] : null] }) }))) });
    }).join("");
    return `<style>${HOLES_STYLE}</style><section class="hl" data-screen="holes">${pageHead({ title: "What is missing", actions: [btn("Docs", { href: orgPath("/docs"), ghost: true })] })}${card({ label: "The checklist", count: list.length, flush: true, region: "checklist", body: groups || empty("No items yet") })}</section>`;
  }
  const head = pageHead({ title: "What is missing" });
  if (!h.project || h.live === "unreachable") {
    const body = h.live === "unreachable" ? unreachableState({ what: h.note || "What is missing could not be read just now." })
      : card({ body: h.fillPath && h.fillPath.tool === "create_project" ? empty("No project yet", { action: { html: `${btn("Control", { href: orgPath("/control") })}${copyBtn(callText(h.fillPath), { title: "Copy the call that adds a project", attrs: 'data-button="copy-call"' })}` } })
        : empty("Pick a project", { action: { href: orgPath("/projects"), label: "Projects" } }) });
    return `<style>${HOLES_STYLE}</style><section class="hl" data-screen="holes">${head}${body}</section>`;
  }
  const m = h.meter || {};
  const areas = (h.areas || []).filter((a) => a.applies && a.total);
  const glance = m.total ? tileRow([
    tile({ label: "Filled", value: m.done, unit: `of ${m.total}`, key: "done", chart: ring({ value: m.done, max: m.total, size: 36, center: "", label: "Items filled" }), title: m.words || "" }),
    tile({ label: "By depth", value: m.pct, unit: "%", key: "filled", chart: bar({ value: m.pct, max: 100, show: "", width: 64, label: "By depth" }) }),
    tile({ label: "Open", value: list.length, key: "open", tone: list.length ? "warn" : "" }),
  ], { region: "meter", label: "How filled" }) : `<span hidden data-region="meter"></span>`;
  // the filter: the area (the choice kept in the address)
  const area = AREA_ORDER.includes(String(get("area") || "")) ? String(get("area")) : "";
  const keep = { ...(get("project") ? { project: get("project") } : {}) };
  const H = (v) => hrefWith(orgPath("/missing"), keep, "area", v);
  const openIn = (a) => list.filter((x) => x.area === a).length;
  const filters = list.length ? filterRow({ label: "Filter what is missing", groups: [{ key: "area", label: "Area", items: [{ label: "All", count: list.length, href: H(""), current: !area, all: true },
    ...AREA_ORDER.map((a) => ({ label: AREA_LABEL[a], count: openIn(a), href: H(a), current: area === a }))] }] }) : "";
  const shownList = area ? list.filter((x) => x.area === area) : list;
  const nextId = h.next ? h.next.id : list.length ? list[0].id : "";
  const openGroups = AREA_ORDER.map((a) => {
    const xs = shownList.filter((x) => x.area === a);
    if (!xs.length) return "";
    const ar = areas.find((y) => y.area === a) || {};
    return group({ title: AREA_LABEL[a], count: xs.length, open: true, summary: ar.total ? bar({ value: ar.done, max: ar.total, show: "of", label: AREA_LABEL[a] }) : "", body: lines(xs.map((x) => openLine(x, x.id === nextId)), { lead: 20 }) });
  }).join("");
  const open = card({ label: "Open", count: shownList.length || "", flush: true, region: "open", body: openGroups || empty(list.length ? "Nothing in this area" : "Nothing missing") });
  const doneItems = completeItemsOf(h);
  const doneAreas = [...new Set(doneItems.map((x) => AREA_LABEL[x.area] || x.area))];
  const done = doneItems.length ? card({ label: "Complete", count: doneItems.length, flush: true, region: "complete", attrs: 'data-done-list="1"',
    body: group({ title: doneAreas.length > 4 ? `${doneAreas.slice(0, 3).join(", ")} and ${doneAreas.length - 3} more` : doneAreas.join(", "), count: doneItems.length, summary: chip("Filled", { tone: "ok" }),
      body: lines(doneItems.map((x) => { const spec = CHECKLIST.find((s) => s.id === x.id) || {}; const where = placeOf({ ...spec, first: null });
        return line({ attrs: `data-hole="${esc(holeOf(x.id))}" data-status="filed" data-item="${esc(x.id)}" data-area="${esc(x.area)}"`, lead: ring({ value: 1, max: 1, size: 20, tone: "ok", label: "Filled" }), title: holeLabel(x.id),
          href: where && !/[{}<]/.test(where) && where.startsWith("/") ? where : "" }); }), { compact: true, lead: 20 }) }) }) : "";
  const theirs = Array.isArray(h.others) && h.others.length ? card({ label: "Not yours", count: h.others.length, flush: true, region: "others",
    body: lines(h.others.map((x) => line({ attrs: `data-item="${esc(x.id)}" data-area="${esc(x.area)}" data-by="${esc(x.by)}"`, lead: ring({ value: Number(x.have) || 0, max: Math.max(1, Number(x.want) || 1), size: 20, label: "Filled" }),
      title: holeLabel(x.id), rowAttrs: `title="${esc(plain(x.what))}"`, meta: chip(x.by === "owner" ? "The owner's" : "A member's") })), { lead: 20 }) }) : "";
  const na = Array.isArray(h.notApplicable) && h.notApplicable.length ? card({ label: "Not started", count: h.notApplicable.length, flush: true, region: "not-started",
    body: lines(h.notApplicable.map((a) => line({ attrs: `data-area="${esc(a.area)}" data-applies="no"`, title: a.label, rowAttrs: `title="${esc(plain(a.what))}"`, action: copyOf(a) }))) }) : "";
  return `<style>${HOLES_STYLE}</style><section class="hl" data-screen="holes">${head}${stack(glance, filters, open, theirs, done, na)}</section>`;
}
