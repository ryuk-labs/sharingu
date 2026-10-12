// sharingu — the project picker (ADR-100 / workspace-prd, mission ④; served at /projects,
// renamed from /workspaces — Q5D239600/Q93B3F368).
// Content-only (no doc wrapper); the caller wraps this with shell() at the route,
// same division as src/control.js's renderControl. Served post-login at / — org is
// the hard wall (its own worker, ADR-094), project is soft scoping inside it.
// Single-project orgs never see this screen (SIRU's behaviour unchanged by one
// pixel): the route decides that upstream and auto-enters instead of calling this.
//
// Usage: renderPicker({ projects, orgEntry, personName, brand })
//   projects   — [{ key, name }] — ONLY the person's admin-assigned projects (the caller's seats).
//   orgEntry   — boolean; true for an org admin/owner, who additionally gets a
//                cross-project "All projects" rollup card.
//   personName — the greeted person's display name.
//   brand      — { org, engine, ... } from src/tenant.js DEFAULT_BRAND — may be
//                undefined (a caller mid-wiring); every field falls back gracefully
//                rather than rendering "undefined".
//
// Each project card is its own <form method="POST" action="/project"> posting the
// project key — no client JS, a plain navigation like every other form on this
// engine (src/control.js's rows are the same shape).

import { esc } from "./ui.js";
import { card, avatar, chip, empty, pageHead } from "./parts.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "./project.js";

// sprint 3, L3 (the revision, docs/plan/LOOK.md): one card of lines, each line its own POST /project form (the same form,
// the same field: key), the whole line the press; the org-wide rollup a quiet last line for an admin.
const CHEV = '<svg class="p-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="m4.5 3 3 3-3 3"/></svg>';
function projectLine(p, current) {
  const key = String(p?.key ?? "");
  // sprint 12, 12.6: a person reads the project's name and its slug, never the org-prefixed key (the form still sends the key)
  const slug = projectSlug(key);
  // L4: the project this page reads is marked (a chip; the form and its field are unchanged)
  const cur = current && key === current ? `<span class="p-line-meta">${chip("Current")}</span>` : "";
  return `<li class="p-li"${cur ? ' data-current="1"' : ""}><form method="POST" action="${orgPath(`/project`)}" class="picker-card"><input type="hidden" name="key" value="${esc(key)}"><button type="submit" class="p-line picker-row"${cur ? ' aria-current="true"' : ""}>${avatar({ name: p?.name || slug || "?", size: 24 })}<span class="p-line-main"><span class="p-line-title">${esc(p?.name || slug || "–")}</span><span class="p-line-sub"><code class="picker-key">${esc(slug)}</code></span></span>${cur}${CHEV}</button></form></li>`;
}
function allProjectsLine() {
  return `<li class="p-li"><form method="POST" action="${orgPath(`/project`)}" class="picker-card"><input type="hidden" name="key" value=""><button type="submit" class="p-line picker-row picker-all"><span class="p-line-main"><span class="p-line-title">All projects</span></span>${CHEV}</button></form></li>`;
}

export function renderPicker(opts) {
  const { projects, orgEntry, current = "" } = opts || {};
  const list = Array.isArray(projects) ? projects : [];
  const body = list.length ? `<ul class="p-lines">${list.map((p) => projectLine(p, current)).join("")}${orgEntry ? allProjectsLine() : ""}</ul>` : empty("No project yet");
  return `<div class="picker-page" data-screen="projects">${pageHead({ title: "Projects" })}
  ${card({ label: "Your projects", count: list.length || "", flush: true, region: "projects", body })}
</div>
<style>
  .picker-page .picker-card{margin:0}
  .picker-page .picker-row{width:100%;border:0;background:transparent;font:inherit;text-align:left;color:var(--text);cursor:pointer}
  .picker-page .picker-row:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}
  .picker-page .picker-key{font:400 11.5px/1 var(--mono);color:var(--text-faint)}
  .picker-page .picker-all .p-line-title{color:var(--text-muted)}
</style>`;
}
