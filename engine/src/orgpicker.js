// src/orgpicker.js — the org picker (sprint 7, slice 7.4b; docs/plan/PLATFORM.md §2 item 8: "sign-in lists the person's orgs").
// GET /orgs at the platform's root: an ACCOUNT session whose account holds seats in several orgs picks one, each a link to
// /<org>/<page> (its Home, or the page an old bookmark asked for). The same front door as the sign-in, the sign-up and creating
// an org (src/login.js authPage: one card, both worlds, the platform's own brand: the page belongs to no org). No statement
// here: the list is src/accounts.js orgsOfAccount (the session's own account's seats), the route src/index.js.
//
// renderOrgPicker({ orgs, pending, to, host, said }) -> the page. orgs: [{ slug, name, role }] in org order; to: the in-org page each
// link opens (src/orgpath.js orgAt: default Home); host: the request's own host, shown before each org's path name.
// pending (sprint 7's review, A1; migrate-074): [{ id, slug, name, role }] — the seats an org's admin added that WAIT for this
// account's yes: each with Accept and Decline, two POST forms to /orgs/seat (the holder's own account session, same-origin: src/
// index.js; src/accounts.js answerSeat). Above the orgs, so a person who was just invited sees it first. said: the last answer's
// word (accepted · declined · not_yours · already_seated), shown once as the flash.
import { esc, errorState } from "./ui.js";
import { SEAT_ANSWER_WORDS } from "./accounts.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { authPage, authBrand } from "./login.js";
import { orgAt } from "./orgpath.js";
import { roleWordOf } from "./hats.js";

// the list: one row per org (its name, its address, the person's role there), a hairline between rows, hover a tint
const PICKER_CSS = `
  .orgs{display:flex;flex-direction:column;margin:0;padding:0;list-style:none;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--page)}
  .orgs li+li{border-top:1px solid var(--line)}
  .org-pick{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;color:var(--text);text-decoration:none;
    transition:background-color var(--dur-fast) var(--ease)}
  .org-pick:hover{background:var(--hover)}
  .org-pick:focus-visible{outline:2px solid var(--text);outline-offset:-2px}
  .org-pick-text{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
  .org-pick-name{font:600 15px/1.25 var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .org-pick-addr{font:500 12px/1.3 var(--mono);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .org-pick-role{flex:none;font:500 12px/1 var(--sans);color:var(--text-faint)}
  .org-pick svg{flex:none;width:16px;height:16px;fill:none;stroke:var(--text-faint);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
`;
const GO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>';
// the seats waiting for a yes: one row each (the org's name and address, the role offered), Accept (the accent) and Decline (quiet)
const PENDING_CSS = `
  .pend-head{margin:0 0 8px;font:600 12.5px/1.3 var(--sans);color:var(--text-muted)}
  .pend{display:flex;flex-direction:column;margin:0 0 18px;padding:0;list-style:none;border:1px solid var(--line-strong);border-radius:10px;overflow:hidden;background:var(--page)}
  .pend li+li{border-top:1px solid var(--line)}
  .pend-row{display:flex;flex-direction:column;gap:10px;padding:12px 14px}
  .pend-what{margin:0;font:400 13.5px/1.45 var(--sans);color:var(--text-muted)}
  .pend-what b{font-weight:600;color:var(--text)}
  .pend-acts{display:flex;gap:8px}
  .pend-acts form{flex:1;display:block;gap:0}
  .pend-acts button{width:100%;height:36px;margin:0;font-size:13.5px}
  .pend-acts .pend-no{color:var(--text);background:transparent;border:1px solid var(--line-strong)}
  .pend-acts .pend-no:hover{background:var(--hover);filter:none}
  .pick-said{margin:0 0 14px;font:500 13px/1.45 var(--sans);color:var(--text-muted);text-align:center}
`;

// a pending seat's two answers: each its own POST form (the seat's id, the word), no script
function pendingRow(p, host) {
  const form = (answer, label, cls) => `<form method="POST" action="/orgs/seat"><input type="hidden" name="seat" value="${esc(p.id)}"><input type="hidden" name="answer" value="${answer}"><button type="submit"${cls ? ` class="${cls}"` : ""} data-answer="${answer}">${label}</button></form>`;
  return `<li class="pend-row" data-pending="${esc(p.slug)}">
        <p class="pend-what"><b>${esc(p.name)}</b> (${esc(host)}/${esc(p.slug)}) added you as ${esc(roleWordOf(p.role).toLowerCase())}. Until you accept, it cannot sign you in and nothing of yours reaches it.</p>
        <div class="pend-acts">${form("accept", "Accept", "")}${form("decline", "Decline", "pend-no")}</div></li>`;
}
export function renderOrgPicker(opts) {
  const { orgs = [], pending = [], to = "", host = "", said = "" } = opts || {};
  const { wordmark } = authBrand(DEFAULT_BRAND);
  const list = (orgs || []).map((o) => `<li><a class="org-pick" href="${esc(orgAt(o.slug, to))}" data-org="${esc(o.slug)}">
        <span class="org-pick-text"><span class="org-pick-name">${esc(o.name)}</span><span class="org-pick-addr">${esc(host)}/${esc(o.slug)}</span></span>
        <span class="org-pick-role">${esc(roleWordOf(o.role))}</span>${GO}</a></li>`).join("\n      ");
  const flash = !SEAT_ANSWER_WORDS[said] ? "" : said === "accepted" || said === "declined" || said === "reset"
    ? `<p class="pick-said" data-said="${esc(said)}" role="status">${esc(SEAT_ANSWER_WORDS[said])}</p>`
    : errorState({ what: SEAT_ANSWER_WORDS[said] });
  const waiting = pending.length ? `<p class="pend-head">Waiting for your yes</p>
    <ul class="pend" data-region="org-pending" aria-label="Seats waiting for your yes">
      ${pending.map((p) => pendingRow(p, host)).join("\n      ")}
    </ul>` : "";
  const mine = orgs.length
    ? `<ul class="orgs" data-region="org-picker" aria-label="Your orgs">
      ${list}
    </ul>`
    : pending.length ? ""
    : `<div class="done" data-region="org-picker" data-state="empty"><p class="done-what">No org yet</p><a class="done-action" href="/orgs/new">Create your org</a></div>`;
  return authPage({
    title: `Your orgs · ${DEFAULT_BRAND.org}`,
    wordmark,
    lede: orgs.length ? "Choose an org" : "Your orgs",
    body: `<div data-screen="org-picker">${flash}${waiting}${mine}</div>`,
    footnote: `<a href="/logout">Sign out</a>`,
    css: PICKER_CSS + PENDING_CSS,
  });
}
