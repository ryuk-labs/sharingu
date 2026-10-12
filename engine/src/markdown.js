// src/markdown.js — the markdown a card, a doc and a starter item are drawn in: md(text), escaped and small, and MD_CSS, its
// look (the detail pages add theirs in parts.js .p-md). Pure string builders.
import { esc } from "./ui.js";

export const MD_CSS = `<style>
.pk-md{font-size:.92rem;line-height:1.6;overflow-wrap:anywhere}
.pk-md h1{font-size:1.2rem;margin:.2rem 0 .6rem}.pk-md h2{font-size:1rem;margin:1.1rem 0 .4rem}.pk-md h3{font-size:.95rem;margin:.9rem 0 .3rem}
.pk-md code{font-family:var(--mono,ui-monospace,monospace);font-size:.85em;background:var(--line);border-radius:4px;padding:0 .25rem}
.pk-md table{border-collapse:collapse;font-size:.82rem;display:block;overflow-x:auto}.pk-md td,.pk-md th{border:1px solid var(--line);padding:.25rem .45rem;text-align:left;vertical-align:top}
</style>`;

// md(text) — a small, escaped markdown subset (a card's body, a doc, a starter item): headings, lists, tables, **bold**, `code`, paragraphs.
export function md(text) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>");
  const out = []; let list = null, table = null, para = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; }
    if (table) { out.push(`<table>${table.map((r, i) => `<tr>${r.map((c) => i === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</table>`); table = null; }
  };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      if (!table) { flush(); table = []; }
      table.push(line.slice(1, -1).split("|").map((c) => c.trim())); continue;
    }
    if ((m = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/))) {
      const tag = m[1] ? "ol" : "ul";
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(m[2]); continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
    if (list || table) flush();
    para.push(line.trim());
  }
  flush();
  return `<div class="pk-md">${out.join("\n")}</div>`;
}
