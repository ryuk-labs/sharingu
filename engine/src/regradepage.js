// src/regradepage.js — R1: the regrade's plan as a page: what a press on a flow's view, a Map node's inspector or the Impact
// view's proof to redo answers FIRST (POST /regrade as a form, no confirm: src/regrade.js regradeAnswer's plan, nothing
// observed or written). Its one button is the confirm (the same form, confirm=1), which observes the pages as the person,
// files each grade and sends them back where they pressed. Pure: the plan in, the HTML out, on src/parts.js and the semantic
// tokens only. Regions: regrade-head · glance · observe · needs-proof. Hooks: data-check + data-state on a check;
// data-button="regrade-confirm" on the confirm.
import { esc } from "./ui.js";
import { card, tile, tileRow, chip, line, lines, empty, pageHead, stack, copyBtn, btn } from "./parts.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const hidden = (k, v) => (v == null || v === "" ? "" : `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`);

// renderRegradePage(plan, { next }) — plan: regradeAnswer's preview (observe, needsProof, counts, scope, project, call, more)
export function renderRegradePage(plan, o = {}) {
  const p = plan || {};
  const s = p.scope || {}, n = p.counts || {};
  const observe = p.observe || [], needs = p.needsProof || [];
  const next = o.next || "";
  const scopeFields = s.kind === "flow" ? hidden("flow", s.ref) : s.kind === "node" ? hidden("node", s.ref) : hidden("checks", (s.checks || []).join(","));
  const confirm = observe.length
    ? `<form method="POST" action="${orgPath(`/regrade`)}" class="rg-go">${hidden("project", p.project)}${scopeFields}${hidden("confirm", "1")}${hidden("next", next)}${o.eval ? hidden("eval", "1") : ""}` +
      `<button class="u-btn small primary" type="submit" data-button="regrade-confirm" data-door="POST /regrade">Regrade</button></form>`
    : "";
  const back = next ? btn("Back", { href: next, ghost: true, attrs: 'data-button="regrade-back"' }) : "";
  const head = pageHead({ region: "regrade-head", title: noDash(s.name || (s.kind === "checks" ? "Proof to redo" : "Regrade")),
    crumbs: next ? [{ label: s.kind === "flow" ? "Flow" : s.kind === "node" ? "Map" : "Impact", href: next }, { label: "Regrade" }] : null, actions: [back, confirm] });
  const glance = tileRow([
    tile({ label: "From the page", value: observe.length, key: "observe", sub: p.more ? `${n.observable} in all` : "" }),
    tile({ label: "For a person", value: n.needsProof || 0, key: "needs-proof", tone: n.needsProof ? "warn" : "" }),
    tile({ label: "Stale", value: n.stale || 0, key: "stale" }),
  ], { region: "glance", label: "Regrade" });
  const state = (c) => (c.stale ? "stale" : "ungraded");
  const fromPage = card({ label: "From the page", count: observe.length || "", flush: true, region: "observe",
    action: p.more ? chip("Capped", { count: p.cap, title: `${p.cap} a press` }) : "",
    body: observe.length ? lines(observe.map((c) => line({ attrs: `data-check="${esc(c.id)}" data-state="${state(c)}"`, lead: chip(c.stale ? "Stale" : "Ungraded", { tone: c.stale ? "warn" : "quiet" }),
      title: noDash(c.title) })), { lead: 96 }) : empty("Nothing to observe") });
  const forPerson = card({ label: "For a person", count: needs.length || "", flush: true, region: "needs-proof",
    action: p.call ? copyBtn(p.call, { title: "Copy the preview call", attrs: 'data-button="copy-call"' }) : "",
    body: needs.length ? lines(needs.map((c) => line({ attrs: `data-check="${esc(c.id)}" data-state="needs-proof"`, lead: chip(c.why), title: noDash(c.title) })), { lead: 96 }) : empty("Nothing") });
  return `<section class="rg" data-screen="regrade">${head}${stack(glance, fromPage, forPerson)}</section>`;
}
