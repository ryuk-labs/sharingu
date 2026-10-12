// src/docpage.js — one of the project's docs to a browser (GET /doc/:path, Accept: text/html; sprint 3 B1).
import { esc } from "./ui.js";
import { card, facts, chip, pageHead, stack } from "./parts.js";
import { md, MD_CSS } from "./markdown.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

// renderDocPage(doc) — one of the project's docs to a browser (GET /doc/:path, Accept: text/html; sprint 3 B1): its title,
// its path, its confidence and as-of date (a quiet chip and a mono date, nothing when neither is filed) and its markdown.
// data-region="doc". A script still gets the markdown itself.
export function renderDocPage(doc) {
  const d = doc || {};
  // a body that opens with its own title as a heading is not drawn twice
  const body = String(d.body || "").replace(/^\s*#\s+(.+)\n?/, (all, h) => (d.title && h.trim() === String(d.title).trim() ? "" : all));
  const path = String(d.path || "");
  const due = d.review && d.review.due ? d.review : null;
  const head = pageHead({ title: d.title || path.split("/").pop() || "Doc", crumbs: [{ label: "Library", href: orgPath("/library") }, { label: path }] });
  const f = facts([
    { label: "Path", html: `<code>${esc(path)}</code>` },
    { label: "Confidence", html: d.confidence ? chip(String(d.confidence)) : "Not said", attrs: d.confidence ? `data-confidence="${esc(d.confidence)}"` : "" },
    { label: "As of", html: `${d.asOf ? `<span title="as of ${esc(d.asOf)}">${esc(d.asOf)}</span>` : "Not said"}${due ? chip("Due", { tone: "warn", title: `due for review since ${due.dueOn}` }) : ""}`, attrs: d.asOf ? `data-as-of="${esc(d.asOf)}"` : "" },
  ], { region: "doc-facts" });
  return MD_CSS + `<section data-region="doc">${head}${stack(f, card({ label: "Doc", body: `<div class="p-md">${md(body)}</div>` }))}</section>`;
}
