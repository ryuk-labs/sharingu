// src/operatorpage.js — THE OPERATOR PAGE (sprint 21, slice 21.4b; its read and writes: src/operatorread.js; the route: src/index.js
// /operator, org 1's admins only). PURE: renderOperator(read, { flash, places }) draws exactly what readOperator answered, inside the
// app's shell (the shared parts, src/parts.js: the head, the glance strip, the filter row, the lines that open in place); every word
// beside a stored key (a team size, a consent box, a product answer) comes in the read.
//   the head      Operator, and the beta's places taken (places: src/requestpage.js betaWords' words, the route's)
//   the glance    the funnel: requested, verified, approved, signed up, org created (five tiles; past the read's bound: "of the newest")
//   the filter    In line · Approved · Declined (each a link: a filter is a read), the funnel's counts beside them
//   the people    one page of the status's requests in line order, each ONE line (its place or its status, the name and company, the
//                 role and team size, the source and the day it was verified) that opens in place on its profile, its consent (each
//                 box, the words' version and time), its source, its path (requested, verified, account, approved or declined, org)
//                 and, once its org stands, the product answers; an open one carries Approve and Decline, each its own POST form
//                 (same-origin: the route's guard), neither the page's orange primary (one a view: none here, the decisions are many)
//   the pager     Next page (the keyset cursor), when more follow
// Every value a person typed is escaped; the profile's addresses are the ones the door built (src/requestaccess.js readRequest), each
// opened in a new tab with no referrer.
import { esc, errorState, dateOnly } from "./ui.js";
import { card, tile, tileRow, line, lines, lineDetail, empty, pageHead, chip, filterRow, num, btn, stack } from "./parts.js";
import { orgPath } from "./orgpath.js";

const STATUS_WORDS = { open: "In line", approved: "Approved", declined: "Declined" };
const EMPTY_WORDS = { open: "No one in line", approved: "No approved requests", declined: "No declined requests" };
const SOURCE_WORDS = { site: "the website", showcase: "the showcase", direct: "direct" };
const OP_CSS = `<style>
.op-flash{margin:0 0 16px;max-width:760px}
.op-flash .flash-value{display:inline-block;margin:0;padding:8px 12px;border-radius:8px;background:var(--ok-tint);font:500 13px/1.5 var(--sans);color:var(--text)}
.op-place{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:24px;padding:0 6px;border:1px solid var(--line);border-radius:6px;
  font:600 12px/1 var(--mono);color:var(--text);font-variant-numeric:tabular-nums}
.op-acts{display:flex;flex-wrap:wrap;gap:8px}
.op-acts form{margin:0}
.op-links{display:flex;flex-wrap:wrap;gap:4px 12px}
.op-links a{color:var(--text);overflow-wrap:anywhere}
.op-boxes{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.op-boxes li[data-given="0"],.op-none,.op-meta{color:var(--text-muted)}
.op-meta{display:block;margin-top:4px;font:500 11.5px/1.4 var(--mono)}
.op-mono{font:500 12px/1.4 var(--mono);color:var(--text)}
.op-pager{display:flex;justify-content:flex-end;padding:12px 16px}
</style>`;

const day = (iso) => (iso ? `<span class="op-mono">${esc(dateOnly(iso))}</span>` : "");
const link = (href, words) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(words)}</a>`;
const NONE = `<span class="op-none">none chosen</span>`;

// the open row's two decisions: each its own small POST form, to this page under its org's address
function decisions(p, status) {
  const form = (action, label, ghost) => `<form method="POST" action="${esc(orgPath(`/operator?status=${status}`))}" data-form="${action}">` +
    `<input type="hidden" name="action" value="${action}"><input type="hidden" name="request" value="${esc(p.id)}">` +
    btn(label, { type: "submit", ghost, attrs: `data-button="${action}" data-request="${esc(p.id)}"` }) + "</form>";
  return `<div class="op-acts">${form("approve", "Approve", false)}${form("decline", "Decline", true)}</div>`;
}
// one person's open detail: the profile, the consent, the path and the product answers
function personDetail(p) {
  const L = p.links || {};
  const links = [["website", "Website"], ["linkedin", "LinkedIn"], ["x", "X"], ["github", "GitHub"]].filter(([k]) => L[k]).map(([k, w]) => link(L[k], w));
  const c = p.consent || {};
  const boxes = `<ul class="op-boxes">${(c.boxes || []).map((b) => `<li data-consent="${esc(b.key)}" data-given="${b.given ? 1 : 0}">${b.given ? "Yes" : "No"} · ${esc(b.words)}</li>`).join("")}</ul>` +
    (c.version ? `<span class="op-meta">Words of ${esc(c.version)} · given ${esc(dateOnly(c.at))}</span>` : "");
  const at = p.at || {};
  const path = [["Requested", at.requested], ["Verified", at.verified], ["Account", at.account], ["Approved", at.approved], ["Declined", at.declined], ["Org created", at.org], ["Cleared", at.cleared]]
    .filter(([, v]) => v).map(([k, v]) => `${esc(k)} ${day(v)}`).join(" · ");
  const pr = p.product;
  const facts = [
    ["Email", esc(p.email)],
    ["Role", esc(p.role)],
    ["Team size", esc(p.teamSize)],
    ["Source", esc(SOURCE_WORDS[p.source] || p.source)],
    links.length ? ["Links", `<span class="op-links">${links.join("")}</span>`] : null,
    p.aiTools ? ["AI tools", esc(p.aiTools)] : null,
    p.useCase ? ["Use case", esc(p.useCase)] : null,
    ["Consent", boxes],
    ["Path", path],
    p.org ? ["Org", `${esc(p.org.name)} <span class="op-mono">/${esc(p.org.slug)}</span>`] : null,
    pr ? ["Product", `<b>${esc(pr.product)}</b> · ${esc(pr.line)}`] : null,
    ...(pr ? pr.answers.map(([label, words]) => [label, words.length ? esc(words.join(", ")) : NONE]) : []),
  ];
  return lineDetail({ facts, actions: p.status === "open" ? decisions(p, p.status) : "" });
}
function personLine(p) {
  const cleared = !!(p.at && p.at.cleared);
  const lead = p.status === "open" && p.place ? `<span class="op-place" data-place>#${esc(p.place)}</span>`
    : chip(cleared ? "Cleared" : STATUS_WORDS[p.status] || p.status, { tone: p.status === "approved" && !cleared ? "ok" : "quiet" });
  return line({
    lead,
    title: cleared ? "A cleared request" : `${p.name} · ${p.company}`,
    sub: cleared ? "" : esc(`${p.role} · ${p.teamSize}`),
    meta: `${esc(SOURCE_WORDS[p.source] || p.source)} · ${esc(dateOnly(p.at && p.at.verified))}`,
    attrs: `data-request="${esc(p.id)}" data-status="${esc(p.status)}"${p.product ? " data-product" : ""}`,
    detail: personDetail(p),
  });
}

// renderOperator(read, { flash, places }) -> the page's content (the route wraps it in the shell). flash: { ok, kind, words } after a
// decision, or none; places: the beta's places in words, or "" when they could not be read (the head then leaves them out)
export function renderOperator(r, opts = {}) {
  const read = r || {};
  const f = read.funnel || {};
  const statuses = Array.isArray(read.statuses) ? read.statuses : Object.keys(STATUS_WORDS);
  const status = statuses.includes(read.status) ? read.status : statuses[0];
  const people = Array.isArray(read.people) ? read.people : [];
  const fl = opts.flash || null;
  const flash = !fl ? "" : fl.ok ? `<div class="op-flash" role="status" data-flash="${esc(fl.kind || "done")}"><p class="flash-value">${esc(fl.words)}</p></div>`
    : `<div class="op-flash" data-flash="refused">${errorState({ what: fl.words })}</div>`;
  const head = pageHead({ title: "Operator", region: "operator-head", aside: opts.places ? chip(opts.places, { attrs: "data-beta-count" }) : "" });
  const glance = tileRow([
    tile({ label: "Requested", value: f.requested, key: "requested", sub: f.capped ? `of the newest ${num(read.funnelRows)}` : "" }),
    tile({ label: "Verified", value: f.verified, key: "verified" }),
    tile({ label: "Approved", value: f.approved, key: "approved" }),
    tile({ label: "Signed up", value: f.signedUp, key: "signed-up", title: "Approved, then signed in again or made their org" }),
    tile({ label: "Org created", value: f.orgs, key: "orgs" }),
  ], { region: "funnel", label: "The funnel" });
  const counts = { open: f.open, approved: f.approved, declined: f.declined };
  const filter = filterRow({ label: "Requests", region: "operator-filter", groups: [{ key: "status", label: "Status",
    items: statuses.map((s) => ({ label: STATUS_WORDS[s], value: s, count: counts[s] == null ? null : counts[s], current: s === status, href: orgPath(`/operator?status=${s}`), attrs: `data-status-filter="${s}"` })) }] });
  const pager = read.more && read.next ? `<div class="op-pager">${btn("Next page", { href: orgPath(`/operator?status=${status}&after=${encodeURIComponent(read.next)}`), attrs: 'data-button="next-page"' })}</div>` : "";
  const body = people.length ? lines(people.map(personLine), { region: "operator-people" }) + pager : empty(EMPTY_WORDS[status]);
  return `${OP_CSS}${head}${flash}${stack(glance, filter, card({ label: STATUS_WORDS[status], body, flush: true, region: "operator-list", attrs: `data-screen="operator" data-list="${status}"` }))}`;
}
