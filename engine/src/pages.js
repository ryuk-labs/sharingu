// src/pages.js — the in-frame document viewer (renderViewer), content-only: the caller wraps it with shell() at the route.

import { esc } from "./ui.js";

// ---------------------------------------------------------------------
// renderViewer({ src, shortName }) — ADR-090: the in-frame viewer for a banked artifact (GET /view?src=/artifact/<id>;
// index.js already validated src is a same-origin path under /artifact/ — this function only renders, it never re-validates).
//   src       — the raw internal path, e.g. "/artifact/T-xyz": the iframe src and the "open raw" href.
//   shortName — the src's last path segment, decoded, for the toolbar label.
// sandbox="allow-same-origin" only (no allow-scripts): scripts stay off, styles still apply. The pane fills the viewport
// under the shell's bar without a second scrollbar.
// ---------------------------------------------------------------------
export function renderViewer(opts) {
  const { src = "", shortName = "" } = opts || {};
  const downloadHref = src + (src.includes("?") ? "&" : "?") + "download=1";
  const label = shortName || src || "document";
  return `<style>
  .viewer-page{display:flex;flex-direction:column;gap:10px;height:calc(100vh - 118px)}
  .viewer-page .v-bar{display:flex;align-items:center;gap:10px;flex:none}
  .viewer-page .v-name{font-family:var(--mono);font-weight:600;font-size:13px;color:var(--ink);
    flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .viewer-page .v-btn{font-family:var(--mono);font-size:12px;padding:5px 11px;border:1px solid var(--line);
    border-radius:8px;background:var(--surface);color:var(--ink-soft);text-decoration:none;flex:none}
  .viewer-page .v-btn:hover{color:var(--ink);border-color:var(--ink-faint)}
  .viewer-page .v-frame{flex:1;width:100%;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
</style>
<div class="viewer-page">
  <div class="v-bar">
    <span class="v-name">${esc(label)}</span>
    <a class="v-btn" href="${esc(src)}" target="_blank" rel="noopener">open raw &#8599;</a>
    ${downloadHref ? `<a class="v-btn" href="${esc(downloadHref)}">download</a>` : ""}
  </div>
  <iframe class="v-frame" src="${esc(src)}" sandbox="allow-same-origin" title="${esc(label)}"></iframe>
</div>`;
}
