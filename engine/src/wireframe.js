// src/wireframe.js — the wireframe grammar (docs/plan/ARCHITECTURE.md §11): ONE small, closed vocabulary that any source
// layout maps to (in its importer, never here), checked by validateWireframe and drawn by drawWireframe as SVG. A screen
// node's data.wireframe and a render of format "wireframe" (its body) are the same grammar. Pure: no I/O, no imports.
//
// THE GRAMMAR. A wireframe is a JSON list of 1 to WIREFRAME_MAX_BLOCKS blocks, top to bottom; each block is an object of
// at most these fields, nothing else:
//   kind      one of WIREFRAME_BLOCKS (required): header · nav · tabbar · title · text · input · button · list · card ·
//             image · divider · spacer
//   label     a string of 1 to LABEL_MAX characters (the words the block shows: a title, a button's text, a field's name)
//   lines     a whole number 1..COUNT_MAX (how many lines of text a title, a text or a card holds; a spacer's height)
//   items     a whole number 1..COUNT_MAX (how many entries a list, a nav or a tabbar holds)
//   emphasis  true or false (the block that leads: the primary button, the highlighted card, a bold text)
// Example: [{"kind":"header","label":"Home"},{"kind":"title","label":"Your balance"},{"kind":"list","items":3},
//           {"kind":"button","label":"Add money","emphasis":true},{"kind":"tabbar","items":4}]
export const WIREFRAME_BLOCKS = ["header", "nav", "tabbar", "title", "text", "input", "button", "list", "card", "image", "divider", "spacer"];
export const WIREFRAME_MAX_BLOCKS = 80;
export const LABEL_MAX = 120;
export const COUNT_MAX = 24;
const FIELDS = ["kind", "label", "lines", "items", "emphasis"];
export const WIREFRAME_HINT = `a list of 1 to ${WIREFRAME_MAX_BLOCKS} blocks {kind, label?, lines?, items?, emphasis?}: kind one of ${WIREFRAME_BLOCKS.join(", ")}; ` +
  `label a string of at most ${LABEL_MAX} characters; lines and items whole numbers 1 to ${COUNT_MAX}; emphasis true or false`;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const count = (v) => Number.isInteger(v) && v >= 1 && v <= COUNT_MAX;

// validateWireframe(v) -> { ok: true, blocks } (a normalized copy: only the fields sent, in the grammar's own order, so the
// same wireframe always serializes to the same bytes and hashes the same) | { ok: false, at, note } (at: the block's index,
// or -1 for the list itself)
export function validateWireframe(v) {
  if (!Array.isArray(v) || v.length < 1 || v.length > WIREFRAME_MAX_BLOCKS) return { ok: false, at: -1, note: `a wireframe is ${WIREFRAME_HINT}` };
  const blocks = [];
  for (let i = 0; i < v.length; i++) {
    const b = v[i];
    if (!isObj(b)) return { ok: false, at: i, note: `block ${i} is not an object: send {kind, label?, lines?, items?, emphasis?}` };
    const extra = Object.keys(b).filter((k) => !FIELDS.includes(k));
    if (extra.length) return { ok: false, at: i, note: `block ${i} has no field ${extra.map((k) => `"${k}"`).join(", ")}: a block carries only ${FIELDS.join(", ")}` };
    if (!WIREFRAME_BLOCKS.includes(b.kind)) return { ok: false, at: i, note: `block ${i}: kind is one of ${WIREFRAME_BLOCKS.join(", ")}` };
    const out = { kind: b.kind };
    if (b.label !== undefined && b.label !== null) {
      if (typeof b.label !== "string" || !b.label.trim() || b.label.length > LABEL_MAX) return { ok: false, at: i, note: `block ${i}: label is a string of 1 to ${LABEL_MAX} characters` };
      out.label = b.label;
    }
    for (const f of ["lines", "items"]) {
      if (b[f] === undefined || b[f] === null) continue;
      if (!count(b[f])) return { ok: false, at: i, note: `block ${i}: ${f} is a whole number from 1 to ${COUNT_MAX}` };
      out[f] = b[f];
    }
    if (b.emphasis !== undefined && b.emphasis !== null) {
      if (typeof b.emphasis !== "boolean") return { ok: false, at: i, note: `block ${i}: emphasis is true or false` };
      if (b.emphasis) out.emphasis = true;
    }
    blocks.push(out);
  }
  return { ok: true, blocks };
}

// ---- the drawer: ONE drawing, on the server and in the page ----
// drawWireframe(spec, o) validates, then draws with wireframeSvg. wireframeSvg is SELF-CONTAINED (every helper and the token
// table inside its own body, nothing named outside it), so the Screens view's script embeds it by toString
// (src/atlasclient.js) and a frame on the board, the full-size viewer and this module draw the same SVG from the same blocks
// (tools/map-selftest.mjs evaluates the embedded source alone).
//
// drawWireframe(spec, { width, height, theme, inset }) -> an SVG string: the blocks stacked top to bottom in a frame of
// `width` (default 390) by `height` (default: what the blocks need, at least 1.4 times the width for a narrow frame); a
// tabbar is drawn at the foot of the frame. A spec that is not a valid wireframe draws an empty frame with a dashed outline.
export function drawWireframe(spec, o = {}) {
  const v = validateWireframe(spec);
  return wireframeSvg(v.ok ? v.blocks : [], { ...(isObj(o) ? o : {}), invalid: !v.ok });
}

// wireframeSvg(blocks, { width, height, theme, inset, invalid }) -> the SVG of blocks ALREADY VALIDATED (validateWireframe's
// own output, or a grammar the write door checked when it was filed); a block of no known kind draws nothing and a count is
// held to 1..24 (COUNT_MAX), so stray data never throws. The colours are the app's semantic NEUTRALS only (src/shell.js
// WORLDS_CSS: --surface, --well, --line, --line-strong, --text-muted, --text-faint), so an SVG drawn inline in a page follows
// Paper and Ink; a wireframe is lo-fi, so the block that leads (emphasis) is drawn solid in --text-muted, never in the
// accent, which the page keeps for its own state (the pinned frame, focus). `theme` may replace any token by name (another
// var(), or a colour for an SVG shown outside the app). `inset`: drawn inside a device frame the page already draws (a frame on the board, the viewer),
// so no outline of its own, and hidden from assistive tech (the frame's caption names the screen). `invalid`: the dashed
// outline and data-invalid (drawWireframe's refusal).
export function wireframeSvg(blocks, o) {
  o = o || {};
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const TOKENS = { surface: "var(--surface)", well: "var(--well)", line: "var(--line)", strong: "var(--line-strong)", muted: "var(--text-muted)", faint: "var(--text-faint)" };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const r1 = (n) => Math.round(n * 10) / 10;
  // a label cut to what fits in w pixels at about 0.56em a character
  const fit = (s, w, size) => { const n = Math.max(1, Math.floor(w / (size * 0.56))); const t = String(s); return t.length > n ? t.slice(0, Math.max(1, n - 1)) + "…" : t; };
  const cnt = (v, d) => (Number.isInteger(v) && v >= 1 ? Math.min(v, 24) : d);
  const W = Number.isFinite(o.width) && o.width >= 120 ? Math.min(o.width, 4000) : 390;
  const c = Object.assign({}, TOKENS, isObj(o.theme) ? o.theme : {});
  const list = Array.isArray(blocks) ? blocks : [];
  const wide = W >= 600;
  const pad = wide ? 32 : 16, inner = W - pad * 2;
  const parts = [];
  let y = 0;
  const text = (x, ty, s, size, fill, weight = 400, anchor = "start") =>
    `<text x="${r1(x)}" y="${r1(ty)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="system-ui, sans-serif">${esc(fit(s, inner, size))}</text>`;
  const bar = (x, by, w, h, fill = c.well, rx = 3) => `<rect x="${r1(x)}" y="${r1(by)}" width="${r1(Math.max(4, w))}" height="${r1(h)}" rx="${rx}" fill="${fill}"/>`;
  const tabbars = [];
  for (const b0 of list) {
    if (!isObj(b0)) continue;
    const b = { kind: b0.kind, label: typeof b0.label === "string" && b0.label ? b0.label : null, lines: cnt(b0.lines, 0), items: cnt(b0.items, 0), emphasis: b0.emphasis === true };
    const label = b.label;
    switch (b.kind) {
      case "header": {
        const h = wide ? 64 : 56;
        parts.push(`<rect x="0" y="${r1(y)}" width="${W}" height="${h}" fill="${c.surface}"/>`, `<line x1="0" y1="${r1(y + h)}" x2="${W}" y2="${r1(y + h)}" stroke="${c.line}"/>`);
        parts.push(`<circle cx="${r1(pad + 12)}" cy="${r1(y + h / 2)}" r="12" fill="${c.well}"/>`);
        parts.push(label ? text(pad + 34, y + h / 2 + 5, label, 15, c.muted, 600) : bar(pad + 34, y + h / 2 - 5, inner * 0.4, 10));
        y += h + 12;
        break;
      }
      case "nav": {
        const n = b.items || 4, h = 36, gap = 8, w = Math.min(120, (inner - gap * (n - 1)) / n);
        for (let i = 0; i < n; i++) parts.push(`<rect x="${r1(pad + i * (w + gap))}" y="${r1(y)}" width="${r1(w)}" height="${h}" rx="${h / 2}" fill="${i === 0 ? c.well : "none"}" stroke="${c.line}"/>`);
        if (label) parts.push(text(pad + w / 2, y + h / 2 + 4, label, 12, c.muted, 500, "middle"));
        y += h + 12;
        break;
      }
      case "tabbar": tabbars.push(b); break;
      case "title": {
        const n = b.lines || 1, lh = wide ? 34 : 28;
        if (label) parts.push(text(pad, y + lh - 8, label, wide ? 24 : 20, c.muted, 700));
        for (let i = label ? 1 : 0; i < n; i++) parts.push(bar(pad, y + i * lh + 6, inner * (i === n - 1 ? 0.45 : 0.75), lh - 14, c.strong, 4));
        y += n * lh + 8;
        break;
      }
      case "text": {
        const n = b.lines || 2, lh = 18;
        if (label) parts.push(text(pad, y + 13, label, 13, b.emphasis ? c.muted : c.faint, b.emphasis ? 600 : 400));
        for (let i = label ? 1 : 0; i < n; i++) parts.push(bar(pad, y + i * lh + 5, inner * (i === n - 1 && n > 1 ? 0.6 : 0.92), 8));
        y += n * lh + 8;
        break;
      }
      case "input": {
        const h = 44;
        parts.push(`<rect x="${pad}" y="${r1(y)}" width="${r1(inner)}" height="${h}" rx="8" fill="${c.surface}" stroke="${c.strong}"/>`);
        parts.push(label ? text(pad + 12, y + h / 2 + 5, label, 13, c.faint) : bar(pad + 12, y + h / 2 - 4, inner * 0.35, 8));
        y += h + 12;
        break;
      }
      case "button": {
        const h = 44, w = wide ? Math.min(inner, 240) : inner;
        parts.push(`<rect x="${pad}" y="${r1(y)}" width="${r1(w)}" height="${h}" rx="${h / 2}" fill="${b.emphasis ? c.muted : "none"}" stroke="${b.emphasis ? c.muted : c.strong}"/>`);
        if (label) parts.push(text(pad + w / 2, y + h / 2 + 5, label, 14, b.emphasis ? c.surface : c.muted, 600, "middle"));
        else parts.push(bar(pad + w * 0.35, y + h / 2 - 4, w * 0.3, 8, b.emphasis ? c.surface : c.well));
        y += h + 12;
        break;
      }
      case "list": {
        const n = b.items || 3, rh = 52;
        if (label) { parts.push(text(pad, y + 13, label, 12, c.faint, 600)); y += 22; }
        for (let i = 0; i < n; i++) {
          const ry = y + i * rh;
          parts.push(`<circle cx="${r1(pad + 16)}" cy="${r1(ry + rh / 2)}" r="16" fill="${c.well}"/>`);
          parts.push(bar(pad + 44, ry + 14, inner * 0.5, 9, c.strong), bar(pad + 44, ry + 30, inner * 0.32, 8));
          if (i < n - 1) parts.push(`<line x1="${r1(pad + 44)}" y1="${r1(ry + rh)}" x2="${r1(pad + inner)}" y2="${r1(ry + rh)}" stroke="${c.line}"/>`);
        }
        y += n * rh + 12;
        break;
      }
      case "card": {
        const n = b.lines || 3, h = 24 + (label ? 22 : 0) + n * 16;
        parts.push(`<rect x="${pad}" y="${r1(y)}" width="${r1(inner)}" height="${h}" rx="12" fill="${b.emphasis ? c.well : c.surface}" stroke="${b.emphasis ? c.muted : c.line}"/>`);
        let cy = y + 14;
        if (label) { parts.push(text(pad + 14, cy + 11, label, 13, c.muted, 600)); cy += 22; }
        for (let i = 0; i < n; i++) parts.push(bar(pad + 14, cy + i * 16 + 2, (inner - 28) * (i === n - 1 ? 0.55 : 0.9), 8));
        y += h + 12;
        break;
      }
      case "image": {
        const h = Math.round(Math.min(inner * 0.56, 220));
        parts.push(`<rect x="${pad}" y="${r1(y)}" width="${r1(inner)}" height="${h}" rx="10" fill="${c.well}" stroke="${c.line}"/>`);
        parts.push(`<path d="M${pad} ${r1(y)}L${r1(pad + inner)} ${r1(y + h)}M${r1(pad + inner)} ${r1(y)}L${pad} ${r1(y + h)}" stroke="${c.line}"/>`);
        if (label) parts.push(text(pad + inner / 2, y + h / 2 + 5, label, 12, c.faint, 500, "middle"));
        y += h + 12;
        break;
      }
      case "divider":
        parts.push(`<line x1="${pad}" y1="${r1(y + 6)}" x2="${r1(pad + inner)}" y2="${r1(y + 6)}" stroke="${c.line}"/>`);
        y += 14;
        break;
      case "spacer":
        y += 16 * (b.lines || 1);
        break;
    }
  }
  const tabH = tabbars.length ? 60 : 0;
  const needed = Math.ceil(y + tabH + 8);
  const H = Number.isFinite(o.height) && o.height >= 120 ? Math.min(o.height, 8000) : Math.max(needed, wide ? Math.round(W * 0.62) : Math.round(W * 1.4));
  if (tabbars.length) {
    const t = tabbars[tabbars.length - 1], n = t.items || 4, ty = H - tabH, w = W / n;
    parts.push(`<rect x="0" y="${ty}" width="${W}" height="${tabH}" fill="${c.surface}"/>`, `<line x1="0" y1="${ty}" x2="${W}" y2="${ty}" stroke="${c.line}"/>`);
    for (let i = 0; i < n; i++) parts.push(`<circle cx="${r1(w * i + w / 2)}" cy="${ty + 22}" r="9" fill="${i === 0 ? c.muted : c.well}"/>`, bar(w * i + w / 2 - 14, ty + 38, 28, 6));
  }
  const bad = o.invalid === true;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="wf" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"${o.inset ? ' aria-hidden="true" focusable="false"' : ' role="img" aria-label="Wireframe"'}${bad ? ' data-invalid="1"' : ""}>` +
    (o.inset ? `<rect width="${W}" height="${H}" fill="${c.surface}"/>` : `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${c.surface}" stroke="${c.line}"${bad ? ' stroke-dasharray="6 4"' : ""}/>`) +
    `<svg x="0" y="0" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="hidden">${parts.join("")}</svg></svg>`;
}
