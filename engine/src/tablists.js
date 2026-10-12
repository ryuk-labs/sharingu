// src/tablists.js — a card kind lists on the tab it names (sprint 3, D2 · B7; docs/plan/MCP.md §9 demand 5, BETA.md B7). A
// card kind's `tab` (k_card_kinds.tab, migrate-047) is data: ryuklabs' claims, targets and copy name `gtm`, another project's
// kinds may name Build, Goals, Decisions, the Map, Home or Broadcast. ONE shared part: tabListsFor reads the lists of one tab,
// tabListsRegion draws them. Every tab mounts the same two (src/index.js listsFor at each tab's page; the GTM read carries them
// in its JSON, so the `gtm` tool and GET /gtm answer them too). A tab no visible kind names gets no region at
// all: nothing per project, nothing GTM-only.
//
// AUTHORITY (every line that decides what a reader sees is marked "authority:"): the project is the one the door already scoped
// (project.js projectOf, the same rule `read` and the Library read by). Inside it, a card is listed and counted only when its
// own roleVisibility AND its kind's admit the reader (schema.js rolesAdmit: the owner reads all; anyone else by their role, their
// typed label and the ACCESS hats their admin set, src/hats.js readerKeys; never the hats they picked themselves). A kind the
// reader may not read is not listed with all its cards; a card they may not read is filtered IN SQL (knowledge/cards.js admits,
// the same rule), so it is never named, counted, summarised or linked: the count is of what this reader may read.
//
// FREE TIER: one small statement for the card kinds that name the tab (TAB_KINDS_SQL on migrate-060's (project, tab) index:
// a tab no kind names reads NO row, D2b), then ONE batch for the tab, one statement per listed kind on the primary key (project, kind, id): the
// first LIST_PER_KIND cards (a 400-character head of the body for the one-line summary) and two counts bounded at
// LIST_COUNT_CAP + 1 rows (the cards, and those due for review). Rows read at most: LIST_KINDS_MAX x (LIST_PER_KIND + 2 x
// (LIST_COUNT_CAP + 1)) = 1,260, and only for a project whose kinds really hold that many; past the caps the region says how
// many more and links the Library.
import { db } from "./data.js";
import { projectOf } from "./project.js";
import { visibleTo } from "./knowledge/store.js";
import { filterRole, admits } from "./knowledge/cards.js";
import { dueOf, shelfOf } from "./knowledge/fresh.js";
import { TAB_KEYS } from "./knowledge/schema.js";
import { esc, LISTS_MARK } from "./ui.js";
import { card, chip, line, lines, empty } from "./parts.js";
import { isD1Quota } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const LIST_PER_KIND = 8;      // cards shown per kind; "N more in the Library" past it
export const LIST_COUNT_CAP = 100;   // a kind's count reads at most this many + 1 rows ("100+")
export const LIST_KINDS_MAX = 6;     // kinds listed on one tab; past it the Library lists the rest
export const SUMMARY_MAX = 140;

// the one statement per kind (each part on the primary key's (project, kind) range: the due count's as_of terms are unary-plus so
// the planner never walks idx_k_cards_as_of, every dated card of the project, for one kind). Binds: ?1 project, ?2 kind, ?3 limit, ?4 the kind's shelf life in days, ?5 the reader's keys
// (a JSON list; only when filtered: everyone but the owner). n and due are bounded counts of the same visible rows.
export const LIST_SQL = (filtered) => {
  const vis = (a) => (filtered ? ` AND ${admits(`${a}.role_visibility`, "?5")}` : "");   // authority: the card's own list, in SQL
  return "SELECT c.kind, c.id, c.name, c.status, substr(c.body_md, 1, 400) AS head, c.as_of, c.confidence, " +
    `(SELECT COUNT(*) FROM (SELECT 1 FROM k_cards x WHERE x.project = ?1 AND x.kind = ?2${vis("x")} LIMIT ${LIST_COUNT_CAP + 1})) AS n, ` +
    `(SELECT COUNT(*) FROM (SELECT 1 FROM k_cards y WHERE y.project = ?1 AND y.kind = ?2 AND +y.as_of IS NOT NULL AND +y.as_of < date('now', '-' || ?4 || ' days')${vis("y")} LIMIT ${LIST_COUNT_CAP + 1})) AS due ` +
    `FROM k_cards c WHERE c.project = ?1 AND c.kind = ?2${vis("c")} ORDER BY c.id LIMIT ?3`;
};
// TAB_KINDS_SQL — the card kinds whose tab is ?2 (migrate-060's index): no row read on a tab no kind names
export const TAB_KINDS_SQL = "SELECT key, label, tab, review_after_days, role_visibility FROM k_card_kinds INDEXED BY idx_k_card_kinds_tab WHERE project = ?1 AND tab = ?2 LIMIT 500";
async function tabKinds(env, project, tab) {
  return new Map(((await db(env).prepare(TAB_KINDS_SQL).bind(project, tab).all()).results || [])
    .map((r) => [String(r.key), { label: r.label || r.key, tab: r.tab || null, reviewAfterDays: r.review_after_days ?? null, roles: rolesOfJson(r.role_visibility) }]));
}
const rolesOfJson = (v) => { if (v == null || v === "") return null; try { const x = JSON.parse(v); return Array.isArray(x) ? x.map(String) : null; } catch { return null; } };
// a kind that holds no card the reader may read answers no row from LIST_SQL: its counts are then the zero they are
const enc = (s) => encodeURIComponent(String(s));
// the card's own page (the read page of its ref, src/cardpage.js); the slashes of the ref stay readable in the query
export const cardHref = (kind, id) => orgPath(`/read?ref=card/${enc(kind)}/${enc(id)}`);
// summaryOf(head) -> the card's one-line summary: the first line of its body that says something (markdown marks dropped)
export function summaryOf(head) {
  for (const raw of String(head || "").split(/\n/)) {
    const t = raw.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s*|\d+[.)]\s+)/, "").replace(/[*_`]+/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
    if (t) return t.length > SUMMARY_MAX ? t.slice(0, SUMMARY_MAX - 1).trimEnd() + "…" : t;
  }
  return "";
}

// tabListsFor(env, reader, tab, o) -> null (no kind the reader may read names this tab) | { tab, lists: [...], more? }
//   lists: [{ key, label, count, countNote?, due, shown, more, cards: [{ ref, kind, id, name, summary, status, asOf, confidence,
//   dueForReview?, href }], href, call }]; more: kinds past LIST_KINDS_MAX (the Library lists them). o.project: the project
//   key when the caller has it (else the request's, projectOf).
export async function tabListsFor(env, reader, tab, o = {}) {
  if (!TAB_KEYS.includes(String(tab))) return null;
  const project = o.project || (await projectOf(env));
  if (!project) return null;
  // D2b item 10: only the kinds that name THIS tab, on migrate-060's (project, tab) index: a tab no kind names reads no row
  const meta = await tabKinds(env, project, tab);
  // authority: a kind is listed only when its own roleVisibility admits the reader (store.js visibleTo, the one rule)
  const kinds = [...meta].filter(([, m]) => m.tab === tab && visibleTo(reader, "card_kind", { roleVisibility: m.roles }))
    .map(([key, m]) => ({ key, ...m })).sort((a, b) => String(a.label).localeCompare(String(b.label)) || (a.key < b.key ? -1 : 1));
  if (!kinds.length) return null;
  const listed = kinds.slice(0, LIST_KINDS_MAX);
  const role = filterRole(reader);   // authority: null for the owner (reads all); anyone else their keys, the SQL filter
  const res = await db(env).batch(listed.map((k) => db(env).prepare(LIST_SQL(role != null))
    .bind(project, k.key, LIST_PER_KIND, shelfOf(k.reviewAfterDays), ...(role != null ? [role] : []))));
  const lists = listed.map((k, i) => {
    const rs = (res[i] && res[i].results) || [];
    const n = rs.length ? Number(rs[0].n) || 0 : 0, due = rs.length ? Number(rs[0].due) || 0 : 0;
    const cards = rs.map((c) => {
      const d = dueOf(c.as_of, k.reviewAfterDays);
      return { ref: `card/${c.kind}/${c.id}`, kind: c.kind, id: c.id, name: c.name, summary: summaryOf(c.head), status: c.status || null,
        asOf: c.as_of || null, confidence: c.confidence || null, ...(d && d.due ? { dueForReview: d.dueOn } : {}), href: cardHref(c.kind, c.id) };
    });
    const capped = n > LIST_COUNT_CAP;
    return { key: k.key, label: k.label || k.key, count: Math.min(n, LIST_COUNT_CAP), ...(capped ? { countNote: `${LIST_COUNT_CAP}+` } : {}),
      due: Math.min(due, LIST_COUNT_CAP), shown: cards.length, more: Math.max(0, Math.min(n, LIST_COUNT_CAP) - cards.length), ...(capped ? { moreNote: "more" } : {}),
      cards, href: orgPath(`/library?kind=${enc(k.key)}`), call: cardCallOf(project, k.key) };
  });
  return { tab, project, lists, ...(kinds.length > LIST_KINDS_MAX ? { more: kinds.length - LIST_KINDS_MAX, moreHref: orgPath("/library") } : {}) };
}
// safe(env, reader, tab, o) -> tabListsFor, or { tab, lists: [], live: "unreachable" } when the read fails (a quota error
// propagates, as every page's does): a tab never fails to draw because its lists did not answer
export async function tabListsSafe(env, reader, tab, o = {}) {
  try { return await tabListsFor(env, reader, tab, o); }
  catch (e) { if (isD1Quota(e)) throw e; return { tab, lists: [], live: "unreachable" }; }
}
// the call that files a card of a kind: a list's `call` in the read's JSON (the `gtm` tool's answer); never on a screen
// copy: off-screen
export const cardCallOf = (project, kind) => `preview {${project ? `project: ${JSON.stringify(project)}, ` : ""}items: [{kind: "card", op: "upsert", data: {kind: ${JSON.stringify(kind)}, id: "<an id>", name: "<the card's name>", body: "<what it says>", asOf: "<YYYY-MM-DD>", confidence: "confirmed"}}]}, then file`;

// tabListsRegion(r, o) -> the Lists region (or "" when r is null: a tab no kind names draws nothing), on the revision's parts
// (sprint 3, L2; src/parts.js): one card per list kind, its count and how many are due for review, each card one line (its name
// opening its page, its status, its confidence and as-of), then "N more" opening the Library. Hooks a check reads:
// data-region="lists", data-list=<kind>, data-cards, data-due on a list (never data-count: that is the motion system's
// count-up hook, which rewrites its element's text); data-card=<kind>/<id> (data-due when due for review) on a row.
export { LISTS_MARK };
const shortDate = (iso) => { const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return String(iso || ""); const d = new Date(t); return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`; };
export function tabListsRegion(r, o = {}) {
  if (!r) return "";
  if (r.live === "unreachable") return `<div class="p-stack" data-region="lists">${card({ label: "Lists", body: empty("The lists did not answer") })}</div>`;
  const lists = Array.isArray(r.lists) ? r.lists : [];
  // a card opened from a tab keeps that tab lit (shell.js tabOf: ?from=<tab>); the JSON's href stays the card's own address
  const fromHref = (h) => (r.tab && typeof h === "string" && h.startsWith("/") ? `${h}${h.includes("?") ? "&" : "?"}from=${encodeURIComponent(r.tab)}` : h);
  const one = (l) => {
    const body = l.cards.length
      ? lines(l.cards.map((c) => line({ attrs: `data-card="${esc(c.kind)}/${esc(c.id)}"${c.dueForReview ? ` data-due="${esc(c.dueForReview)}"` : ""}`, title: c.name || c.id, href: fromHref(c.href),
        meta: `${c.dueForReview ? chip("Due", { tone: "warn", title: `due for review since ${c.dueForReview}` }) : ""}${c.status ? chip(c.status) : ""}${c.asOf ? `<span title="${esc(c.confidence ? `${c.confidence}, as of ${c.asOf}` : `as of ${c.asOf}`)}">${esc(shortDate(c.asOf))}</span>` : ""}` })), { compact: true })
        + (l.more || l.moreNote ? `<p class="p-empty"><a class="u-link" href="${esc(l.href)}" data-button="open-library">${l.moreNote ? "More" : `${esc(String(l.more))} more`}</a></p>` : "")
      : empty(`No ${String(l.label).toLowerCase()} yet`);
    return card({ label: l.label, count: l.countNote || String(l.count), flush: true, action: l.due ? chip("Due", { tone: "warn", count: l.due, title: "due for review" }) : "",
      attrs: `data-list="${esc(l.key)}" data-cards="${esc(l.countNote || String(l.count))}" data-due="${esc(String(l.due || 0))}"`, body });
  };
  const moreKinds = r.more ? card({ label: "More lists", count: r.more, body: `<a class="u-link" href="${esc(r.moreHref || orgPath("/library"))}">Library</a>` }) : "";
  const cards = lists.map(one).join("") + moreKinds;
  return o.side ? `<div class="p-stack" data-region="lists">${cards}</div>`
    : `<div class="p-stack tl-cards" data-region="lists" style="margin-top:16px">${cards}</div>`;
}
// mountLists(content, r, o) -> the page's content with the Lists region where the renderer put LISTS_MARK, else appended at the
// end (o.markerOnly: only at the mark, so a full-bleed page such as the Map never grows a region under its canvas)
export function mountLists(content, r, o = {}) {
  const html = tabListsRegion(r, o);
  const c = String(content ?? "");
  if (c.includes(LISTS_MARK)) return c.replace(LISTS_MARK, html);
  return o.markerOnly || !html ? c : c + html;
}
