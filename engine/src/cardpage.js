// src/cardpage.js — one card's own page (sprint 3, D2 · B7): GET /read?ref=card/<kind>/<id> to a browser. The SAME read the
// `read` tool and GET /read answer as JSON (src/extract.js readAnswer: the card, its kind's label, tab and shelf life, and who
// may read it), drawn in the shell with the tab its card kind names lit (else the Library's). The old path's URL is gone
// (D5: renamed at once, no redirect).
//
// What it shows, by the card format the registry declares (src/knowledge/schema.js KINDS.card): its name; its card kind (the
// label, and the list it sits in on its tab); its status; its confidence, as-of date and the due-for-review mark (B4's shelf
// life); where it was recorded (source, migrate-059; ui.js sourceRefs); who may read it (the card's own
// roleVisibility AND its kind's: everyone seated, or the hats named, the admin always); the cards it relies on (F1, migrate-064:
// its refs as `read` resolves them, each a link to that card's page, under "Relies on"); its body as markdown; then the call
// that updates it. A card the reader may not read never reaches this page: readAnswer answers not_found exactly as for a
// missing one (authority), and the route draws the usual 404.
//
// PURE: renderCardPage(read, o) draws what readAnswer answered. Shared parts and tokens only (ui.js). Hooks a check reads:
// data-region="card" on the page; data-field=<name> on each field; data-confidence, data-as-of, data-due; data-ref on each card
// it relies on.
import { esc, sourceRefs, dateOnly } from "./ui.js";
import { card, facts, chip, empty, pageHead, stack, btn, line, lines } from "./parts.js";
import { md, MD_CSS } from "./markdown.js";
import { hatOf } from "./hats.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

const TAB_WORD = { home: "Home", build: "Build", gtm: "GTM", goals: "Goals", decisions: "Decisions", map: "Map", broadcast: "Broadcast", control: "Control" };
const TAB_HREF = { home: "/home", build: "/build", gtm: "/gtm", goals: "/goals", decisions: "/decisions", map: "/map", broadcast: "/broadcast", control: "/control" };
// the rail item a card's page lights: the tab its kind names, else the Library (Home's)
export const cardTabOf = (item) => (item && TAB_HREF[item.tab] ? item.tab : "library");
const roleWord = (k) => { const h = hatOf(k); return h ? h.label : String(k); };
const listOf = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
// whoMayRead(card, kindRoles) -> the sentence: both lists must admit a reader (schema.js rolesAdmit), so a reader needs one key
// of each non-empty list; the admin reads everything
// copy: off-screen (the Who reads it cell's title)
export function whoMayRead(roles, kindRoles) {
  const a = listOf(roles), b = listOf(kindRoles);
  if (!a.length && !b.length) return "Everyone seated on this project.";
  const words = (l) => l.map(roleWord).join(" or ");
  if (a.length && b.length) return `Only who holds ${words(a)}, and ${words(b)} for its kind; the admin always.`;
  return `Only who holds ${words(a.length ? a : b)}; the admin always.`;
}

// renderCardPage(read, o) -> the page's content (the route wraps it in the shell). read: readAnswer's one-item answer for a card.
// sprint 3, L3 (the revision, docs/plan/LOOK.md): the head (its tab / its kind / its name, Open in Library), the facts (kind,
// status, confidence, as of with a Due chip, where it lists, who may read it in a word and the whole rule in its title,
// updated, its source), then its body in its author's words. No sentence of the product's own: the call that updates it is an
// item on What is missing once the card falls due.
export function renderCardPage(read, o = {}) {
  const r = read || {};
  const c = r.item || {};
  const project = r.project || null;
  const label = c.kindLabel || c.kind || "Card";
  const tab = c.tab && TAB_HREF[c.tab] ? c.tab : null;
  const pq = project ? `project=${encodeURIComponent(project)}` : "";
  const libHref = orgPath(`/library?kind=${encodeURIComponent(String(c.kind || ""))}${pq ? `&${pq}` : ""}`);
  const head = pageHead({ title: c.name || c.id || "Card", crumbs: [
    tab ? { label: TAB_WORD[tab], href: orgPath(`${TAB_HREF[tab]}${pq ? `?${pq}` : ""}`) } : { label: "Library", href: orgPath(`/library${pq ? `?${pq}` : ""}`) },
    { label, href: libHref }, { label: c.id || "" }], actions: [btn("Open in Library", { href: libHref, ghost: true })] });
  const due = c.review && c.review.due ? c.review : null;
  const roles = [...listOf(c.roleVisibility), ...listOf(c.kindRoles)];
  const src = sourceRefs(c.source);
  const relies = (Array.isArray(c.refs) ? c.refs : []).filter((x) => x && typeof x === "object" && x.href);
  const withProject = (h) => (pq ? `${h}${h.includes("?") ? "&" : "?"}${pq}` : h);
  const fields = facts([
    { label: "Kind", value: label, title: String(c.kind || ""), attrs: 'data-field="kind"' },
    c.status ? { label: "Status", html: chip(String(c.status)), attrs: 'data-field="status"' } : null,
    { label: "Confidence", html: c.confidence ? chip(String(c.confidence)) : "Not said", attrs: `data-field="confidence"${c.confidence ? ` data-confidence="${esc(c.confidence)}"` : ""}` },
    { label: "As of", html: `${c.asOf ? esc(c.asOf) : "Not said"}${due ? chip("Due", { tone: "warn", title: `due for review since ${due.dueOn} (a ${due.days}-day shelf life)` }) : ""}`,
      attrs: `data-field="as-of"${c.asOf ? ` data-as-of="${esc(c.asOf)}"` : ""}${due ? ` data-due="${esc(due.dueOn || "")}"` : ""}` },
    { label: "Lists on", html: tab ? `<a class="u-link" href="${esc(orgPath(TAB_HREF[tab] + (pq ? `?${pq}` : "")))}">${esc(TAB_WORD[tab])}</a>` : "Library only", attrs: 'data-field="lists-on"' },
    { label: "Who reads it", value: roles.length ? [...new Set(roles.map(roleWord))].join(", ") : "Everyone seated", title: whoMayRead(c.roleVisibility, c.kindRoles), attrs: 'data-field="who"' },
    c.updatedAt ? { label: "Updated", value: dateOnly(c.updatedAt), attrs: 'data-field="updated"' } : null,
    src ? { label: "Source", html: `<span data-region="source">${src}</span>`, attrs: 'data-field="source"' } : null,
  ], { region: "card-facts" });
  // F1: the cards it relies on, as the read resolved them (a card the reader may not read is not among them), one line each
  const reliesOn = relies.length ? card({ label: "Relies on", count: relies.length, flush: true, attrs: 'data-field="relies-on"',
    body: lines(relies.map((x) => line({ attrs: `data-ref="${esc(x.ref)}"`, title: x.title || x.ref, href: withProject(x.href), sub: esc(x.ref) })), { compact: true }) }) : "";
  const body = card({ label: "Body", flush: !String(c.body || "").trim(), attrs: 'data-field="body"', body: String(c.body || "").trim() ? `<div class="p-md">${md(String(c.body))}</div>` : empty("No body yet") });
  return MD_CSS + `<section class="cp" data-region="card" data-card="${esc(c.kind)}/${esc(c.id)}">${head}${stack(fields, reliesOn, body)}</section>`;
}
