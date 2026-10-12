// src/render.js — a screen's renders and styles (docs/plan/ARCHITECTURE.md §11), the pure half: the limits, the sanitiser
// every html body and every stylesheet passes before it is stored, the body each op stores (bodyOf), its hash, and the
// sandbox document a body is served in. No I/O and no imports beyond the wireframe grammar, so src/knowledge/schema.js
// (the registry, also loaded by the importer in plain Node) can use it. The write door (src/knowledge/write.js) puts the
// bodies in R2 and the index in D1; the body route (src/knowledge/screens.js serveRender) serves them.
//
// THE SANITISER (sanitizeHtml, sanitizeCss): what is stored is what was sent with everything that could RUN or reach the
// NETWORK taken out — and it is then only ever served sandboxed (RENDER_CSP: no script, no network), so the sanitiser is
// the second wall, not the first. It never throws and never refuses: it strips, and the write door reports what it
// stripped per op. The html sanitiser re-emits the fragment from its own tokens (a "<" that starts no tag is written
// "&lt;"), so nothing it did not parse as an allowed tag can reach the output. It removes:
//   · these elements WITH their content: script, iframe, object, applet, frameset, noscript, noembed, noframes, template,
//     title, xmp, plaintext, portal, fencedframe (an unclosed one takes the rest of the fragment with it);
//   · these tags (their content, if any, stays): embed, frame, meta, link, base, param, html, head, body;
//   · comments, doctypes, CDATA and processing instructions;
//   · every on* attribute (event handlers), and srcdoc, http-equiv, action, formaction, cite, codebase, longdesc, manifest
//     and ping;
//   · any attribute whose value, once entities, whitespace and control characters are taken out, holds javascript:,
//     vbscript:, livescript: or mocha: (so "jav&#x09;ascript:" and "&#106;avascript:" go too);
//   · href, xlink:href and usemap unless the value is "" or an in-document "#…" reference; src, poster, background,
//     lowsrc, dynsrc and data (and an SVG image's or feImage's href) unless it is a data:image/… URL; srcset and
//     imagesrcset always;
//   · an SVG animate, animateTransform, animateMotion or set element that animates an href;
//   · in a style attribute and a <style> element, what sanitizeCss removes.
// The css sanitiser drops comments, then removes: @import rules; in ONE linear scan of the function calls (cssCalls), a
// url token whose target is not data:image/… or an in-document "#…" (and an unclosed one), any string inside a function
// call (however deeply nested: image-set(), image(), cross-fade(), src(), url("…")) whose target is not one of those two,
// and a fetching call that holds a var(), env() or attr(); expression(), -moz-binding, behavior; javascript:/vbscript:.
// Every pass is linear in the sheet. Then it reads the result again with every
// escape that spells a plain ASCII character written back ("\75 rl(" is "url("): if the same rules find anything in that
// reading, that reading is what is kept. Last, every "<" is written "\3c ", so a stylesheet can never close its element.
import { validateWireframe, WIREFRAME_HINT } from "./wireframe.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const RENDER_FORMATS = ["html", "image", "wireframe"];
// the limits (§11): a body's UTF-8 bytes as sent; a call's bodies together. CALL_BODIES_MAX counts the bodies the call
// CARRIES (html, css, wireframes: sanitised and hashed at the door, the CPU a free-plan request is short of): 256 KB, the
// importer's per-call cap at the sprint-2 ship, where batches of 20 renders a call all landed (sprint 3, B1). An image
// render's picture is not carried (it names a banked artifact, copied in R2, never hashed again), so the pictures one call
// names are counted apart, against CALL_IMAGES_MAX (the old 1 MB per call).
export const HTML_MAX = 200000;
export const STYLE_MAX = 200000;
export const IMAGE_MAX = 1000000;
export const WIREFRAME_MAX = 50000;
export const CALL_BODIES_MAX = 256 * 1024;
export const CALL_IMAGES_MAX = 1000000;
// sizeWords(bytes) -> "14 KB", "1.2 MB", "900 bytes": the one way a size is said to a person or an agent
export const sizeWords = (n) => { const b = Number(n) || 0; return b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(/\.0$/, "")} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} bytes`; };
// the image types an image render serves (review fix 5, sprint 2: raster only. An SVG is a document: opened in a tab from our
// origin it can carry a working link, so the write door refuses it and the body route never serves one)
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const SVG_IMAGE_NOTE = "An image render is a raster picture (png, jpeg or webp): an SVG can carry a working link, so it is not served. File the screen as a wireframe (format \"wireframe\"), or send a png, jpeg or webp as base64 in data.body.";
// D1b item 6: a picture through the MCP. An image render's body is the picture's bytes as base64 (a bare string, or a
// data:image/png|jpeg|webp;base64, URL), checked by its MAGIC BYTES (never by what it says it is): png 89 50 4E 47 0D 0A 1A
// 0A, jpeg FF D8 FF, webp "RIFF" … "WEBP". An SVG (or anything that starts like markup) is refused (SVG_IMAGE_NOTE). The
// base64 text counts against the call's CALL_BODIES_MAX like any carried body (so a picture through the door is at most about
// 190 KB of bytes), and the decoded bytes against IMAGE_MAX.
export const IMAGE_BASE64_HINT = "the picture's bytes as base64: a png, jpeg or webp, checked by its first bytes (an SVG is refused); a bare base64 string or a data:image/png;base64,… URL. The base64 text counts against the call's 256 KB of bodies (about 190 KB of picture a call)";
// a 1 × 1 png, the example that works when copied (formats {kind: "render"})
export const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
// imageTypeOf(bytes) -> "image/png" | "image/jpeg" | "image/webp" | "svg" | null, by the first bytes only
export function imageTypeOf(b) {
  if (!b || b.length < 4) return null;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  // markup (an SVG, or html posing as a picture): the first non-space byte after an optional BOM is "<"
  let i = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  while (i < b.length && i < 64 && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++;
  if (b[i] === 0x3c) return "svg";
  return null;
}
// imageSize(bytes, type) -> { width, height } read from the picture's own header (png IHDR; jpeg the first SOF frame; webp
// VP8, VP8L or VP8X), or null when the header does not say (sprint 3 S3b: a render's declared size is never trusted over it)
export function imageSize(b, type) {
  if (!b || !b.length) return null;
  const u16be = (i) => (b[i] << 8) | b[i + 1], u32be = (i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const u24le = (i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16), u16le = (i) => b[i] | (b[i + 1] << 8);
  const ok = (w, h) => (Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 ? { width: w, height: h } : null);
  if (type === "image/png") return b.length >= 24 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52 ? ok(u32be(16), u32be(20)) : null;
  if (type === "image/jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return ok(u16be(i + 7), u16be(i + 5));
      if (m === 0xd9 || m === 0xda) return null;
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  if (type === "image/webp" && b.length >= 30) {
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
    if (fourcc === "VP8L" && b[20] === 0x2f) { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return ok((v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1); }
    if (fourcc === "VP8X") return ok(u24le(24) + 1, u24le(27) + 1);
  }
  return null;
}
// imageBody(value) -> the prepared body of an image render sent as base64: { body: Uint8Array, bytes, sent, contentType,
// removed: null } | { error: { error, note } }
export function imageBody(value) {
  if (typeof value !== "string" || !value.trim()) return { error: { error: "bad_field", note: `Send data.body as ${IMAGE_BASE64_HINT}.` } };
  const sent = utf8Bytes(value);
  let b64 = value.trim(), said = null;
  const m = /^data:([a-z0-9.+/-]+)?(;[a-z0-9=;-]*)?,/i.exec(b64);
  if (m) {
    said = (m[1] || "").toLowerCase();
    if (!/;base64/i.test(m[2] || "")) return { error: { error: "bad_field", note: "A data: URL in data.body must be base64 (data:image/png;base64,…)." } };
    if (said === "image/svg+xml") return { error: { error: "bad_field", note: SVG_IMAGE_NOTE } };
    b64 = b64.slice(m[0].length);
  }
  b64 = b64.replace(/\s+/g, "");
  if (!b64 || b64.length % 4 === 1 || !B64_RE.test(b64)) return { error: { error: "bad_field", note: `data.body is not base64. Send ${IMAGE_BASE64_HINT}.` } };
  let bytes;
  try { const bin = atob(b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
  catch { return { error: { error: "bad_field", note: `data.body is not base64. Send ${IMAGE_BASE64_HINT}.` } }; }
  const type = imageTypeOf(bytes);
  if (type === "svg") return { error: { error: "bad_field", note: SVG_IMAGE_NOTE } };
  if (!type) return { error: { error: "bad_field", note: "data.body does not decode to a png, jpeg or webp (its first bytes are not a picture's): send the picture's own bytes as base64." } };
  if (said && said !== type && IMAGE_TYPES.includes(said)) return { error: { error: "bad_field", note: `data.body says ${said} but its bytes are ${type}: send the type the bytes are (or a bare base64 string).` } };
  if (bytes.length > IMAGE_MAX) return { error: { error: "too_large", note: `This picture is ${bytes.length.toLocaleString("en-US")} bytes; an image render is at most ${IMAGE_MAX.toLocaleString("en-US")}.` } };
  const size = imageSize(bytes, type);
  return { body: bytes, bytes: bytes.length, sent, contentType: type, removed: null, ...(size ? { size } : {}) };
}
export const SHA_RE = /^[0-9a-f]{64}$/;
// the op's prepared body rides under a symbol (never JSON: a caller can never send one): { body, bytes, sent, contentType,
// removed, hash? } | { error: { error, note } } (src/knowledge/write.js sets it, src/knowledge/schema.js planKnowledge reads it)
export const PREPARED = Symbol.for("sharingu.render.prepared");

const UTF8 = new TextEncoder();
export const utf8Bytes = (s) => UTF8.encode(String(s)).length;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------------------------------
// the sanitiser
export const newRemoved = () => ({ scripts: 0, handlers: 0, jsUrls: 0, frames: 0, externalUrls: 0, imports: 0, comments: 0, tags: 0 });
export const removedAny = (r) => !!r && Object.values(r).some((n) => n > 0);

const WITH_CONTENT = new Set(["script", "iframe", "object", "applet", "frameset", "noscript", "noembed", "noframes", "template", "title", "xmp", "plaintext", "portal", "fencedframe"]);
const FRAMES = new Set(["iframe", "object", "applet", "frameset", "embed", "frame", "portal", "fencedframe"]);
const TAG_ONLY = new Set(["embed", "frame", "meta", "link", "base", "param", "html", "head", "body"]);
const ANIMATE = new Set(["animate", "animatetransform", "animatemotion", "set"]);
const DROP_ATTRS = new Set(["srcdoc", "http-equiv", "action", "formaction", "cite", "codebase", "longdesc", "manifest", "ping"]);
const LINK_ATTRS = new Set(["href", "xlink:href", "usemap"]);
const SRC_ATTRS = new Set(["src", "poster", "background", "lowsrc", "dynsrc", "data", "srcset", "imagesrcset"]);
const ATTR_NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;
const RUNS = /(?:javascript|vbscript|livescript|mocha):/;
const NAMED = { colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", sol: "/", period: ".", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", num: "#", bsol: "\\" };
// decodeEntities(v) -> the value as a browser reads it (numeric references with or without ";", the names a scheme hides in)
function decodeEntities(v) {
  return String(v)
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => { const n = parseInt(h, 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; })
    .replace(/&#([0-9]+);?/g, (_, d) => { const n = parseInt(d, 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; })
    .replace(/&([a-z]+);/gi, (m, nm) => (NAMED[nm.toLowerCase()] !== undefined ? NAMED[nm.toLowerCase()] : m));
}
// the value with entities decoded, every whitespace and control character taken out, lower case: what a scheme check reads
const probe = (v) => decodeEntities(v).replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, "").toLowerCase();
const isDataImage = (p) => p.startsWith("data:image/");
const attrValue = (v) => String(v).replace(/"/g, "&quot;").replace(/</g, "&lt;");

// sanitizeHtml(html, removed?) -> { html, removed }
export function sanitizeHtml(input, removed = newRemoved()) {
  const s = String(input ?? "");
  const out = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const lt = s.indexOf("<", i);
    if (lt < 0) { out.push(s.slice(i)); break; }
    if (lt > i) out.push(s.slice(i, lt));
    i = lt;
    // a comment, a doctype, CDATA, a processing instruction: dropped
    if (s.startsWith("<!--", i)) { const e = s.indexOf("-->", i + 4); removed.comments++; i = e < 0 ? n : e + 3; continue; }
    if (s.startsWith("<![CDATA[", i)) { const e = s.indexOf("]]>", i); removed.tags++; i = e < 0 ? n : e + 3; continue; }
    if (s[i + 1] === "!" || s[i + 1] === "?") { const e = s.indexOf(">", i); removed.tags++; i = e < 0 ? n : e + 1; continue; }
    // an end tag
    if (s[i + 1] === "/") {
      const m = /^<\/([A-Za-z][A-Za-z0-9:-]*)[^>]*>/.exec(s.slice(i, i + 300));
      if (!m) { const e = s.indexOf(">", i); i = e < 0 ? n : e + 1; continue; }   // "</ …>": a bogus comment
      const name = m[1].toLowerCase();
      if (!TAG_ONLY.has(name) && !WITH_CONTENT.has(name)) out.push(`</${m[1]}>`);
      i += m[0].length;
      continue;
    }
    const nm = /^[A-Za-z][A-Za-z0-9:-]*/.exec(s.slice(i + 1, i + 120));
    if (!nm) { out.push("&lt;"); i += 1; continue; }   // a "<" that starts no tag is text
    // a start tag: its attributes, read the way a browser reads them (quoted or not)
    const rawName = nm[0], name = rawName.toLowerCase();
    let j = i + 1 + rawName.length;
    const attrs = [];
    let selfClose = false, closed = false;
    while (j < n) {
      while (j < n && /[\s/]/.test(s[j])) { if (s[j] === "/" && s[j + 1] === ">") selfClose = true; j++; }
      if (j >= n) break;
      if (s[j] === ">") { closed = true; j++; break; }
      const an = /^[^\s"'>\/=]+/.exec(s.slice(j, j + 200));
      if (!an) { j++; continue; }
      j += an[0].length;
      let k = j;
      while (k < n && /\s/.test(s[k])) k++;
      let value = null;
      if (s[k] === "=") {
        k++;
        while (k < n && /\s/.test(s[k])) k++;
        if (s[k] === '"' || s[k] === "'") {
          const q = s[k], e = s.indexOf(q, k + 1);
          value = e < 0 ? s.slice(k + 1) : s.slice(k + 1, e);
          j = e < 0 ? n : e + 1;
        } else {
          const u = /^[^\s>]*/.exec(s.slice(k))[0];
          value = u; j = k + u.length;
        }
      }
      attrs.push([an[0], value]);
    }
    if (!closed) break;   // an unterminated tag at the end of the fragment: dropped, as a browser drops it
    i = j;
    if (WITH_CONTENT.has(name)) {
      if (name === "script") removed.scripts++; else if (FRAMES.has(name)) removed.frames++; else removed.tags++;
      const re = new RegExp(`</${name}\\s*>`, "i");
      const m = re.exec(s.slice(i));
      i = m ? i + m.index + m[0].length : n;
      continue;
    }
    if (TAG_ONLY.has(name)) { if (FRAMES.has(name)) removed.frames++; else if (!["html", "head", "body"].includes(name)) removed.tags++; continue; }
    if (ANIMATE.has(name) && attrs.some(([a, v]) => a.toLowerCase() === "attributename" && /href/i.test(String(v ?? "")))) { removed.jsUrls++; continue; }
    // <style>: its text is CSS, read raw up to </style>
    if (name === "style") {
      const m = /<\/style\s*>/i.exec(s.slice(i));
      const css = m ? s.slice(i, i + m.index) : s.slice(i);
      i = m ? i + m.index + m[0].length : n;
      out.push(`<${rawName}>${sanitizeCss(css, removed).css}</${rawName}>`);
      continue;
    }
    const kept = [];
    for (const [a, v] of attrs) {
      const an = a.toLowerCase();
      if (!ATTR_NAME.test(a)) { removed.tags++; continue; }
      if (an.startsWith("on")) { removed.handlers++; continue; }
      if (DROP_ATTRS.has(an)) { if (v != null && v !== "") removed.externalUrls++; continue; }
      if (v == null) { kept.push(` ${a}`); continue; }
      const p = probe(v);
      if (RUNS.test(p)) { removed.jsUrls++; continue; }
      // an SVG <image> or <feImage> takes its picture from href: the picture rule, not the link rule
      const picture = SRC_ATTRS.has(an) || (LINK_ATTRS.has(an) && an !== "usemap" && (name === "image" || name === "feimage"));
      if (an === "srcset" || an === "imagesrcset") { removed.externalUrls++; continue; }
      if (picture) { if (!isDataImage(p)) { removed.externalUrls++; continue; } }
      else if (LINK_ATTRS.has(an) && !(p === "" || p.startsWith("#"))) { removed.externalUrls++; continue; }
      if (an === "style") {
        // the value was read with its entities decoded, so it is written back with "&" escaped too: a browser decodes it
        // once more, and must read exactly what the sanitiser read
        const css = sanitizeCss(decodeEntities(v), removed).css.trim();
        if (css) kept.push(` style="${attrValue(css.replace(/&/g, "&amp;"))}"`);
        continue;
      }
      kept.push(` ${a}="${attrValue(v)}"`);
    }
    out.push(`<${rawName}${kept.join("")}${selfClose ? "/" : ""}>`);
  }
  return { html: out.join(""), removed };
}

// sanitizeCss(css, removed?) -> { css, removed }
// canonicalCss(s) -> the stylesheet with every escape that spells a plain ASCII letter, digit or the punctuation of a
// function call written back as itself ("\75 rl(" is "url(", "\@import" is "@import")
const canonicalCss = (s) => s.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/g, (m, hex) => {
  const cp = parseInt(hex, 16);
  return cp >= 0x21 && cp < 0x7f && /[A-Za-z0-9:()@\-_./\\]/.test(String.fromCharCode(cp)) ? String.fromCharCode(cp) : m;
}).replace(/\\([g-zG-Z:()@\-_./])/g, "$1");
export function sanitizeCss(input, removed = newRemoved()) {
  let s = cssRules(String(input ?? ""), removed);
  // a rule hidden behind escapes: the stylesheet is read again with its plain-ASCII escapes written back, and when the rules
  // find anything in that reading, that reading is what is kept (an ordinary stylesheet's escapes, such as a class name's
  // "\:", are left exactly as sent)
  if (s.includes("\\")) {
    const found = newRemoved();
    const again = cssRules(canonicalCss(s), found);
    if (removedAny(found)) { s = again; for (const k of Object.keys(found)) removed[k] += found[k]; }
  }
  // a "/" and a "*" a removal brought together never open a comment the scan did not read (" /" + "*"), and no "<" closes
  // the element
  return { css: s.replace(/\/\*/g, "/ *").replace(/</g, "\\3c "), removed };
}
// every pass is linear in the stylesheet (review fix 4: a regex over the whole sheet that could backtrack was quadratic):
// the comments (an unclosed one runs to the end, as in a browser), @import, ONE scan of the function calls (cssCalls), then
// the fixed words, each a regex that cannot backtrack across the sheet
function cssRules(s, removed) {
  s = s.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "");
  s = s.replace(/@import\b[^;]*;?/gi, () => { removed.imports++; return ""; });
  s = cssCalls(s, removed);
  s = s.replace(/expression\s*\(/gi, () => { removed.scripts++; return "blocked("; });
  s = s.replace(/-moz-binding/gi, () => { removed.scripts++; return "-blocked-binding"; });
  s = s.replace(/(^|[;{\s])behavior\s*:/gi, (m, pre) => { removed.scripts++; return `${pre}blocked:`; });
  s = s.replace(/(?:javascript|vbscript|livescript|mocha)\s*:/gi, () => { removed.jsUrls++; return "blocked:"; });
  return s;
}

// ---- cssCalls: THE function-call rule (review fixes 3 and 4), one left-to-right scan that tokenises the way a browser does
// (css-syntax: an identifier, an escape, a string that ends at its quote or an unescaped newline, a url token, and ( [ {
// nesting with their own closers, so a ")" inside "[…]" closes no call). Inside any function call, a string literal whose
// target (control characters and spaces out, lower case) is not data:image/… or an in-document "#…" is written "" (an
// external picture in image-set(), image(), cross-fade(), -webkit-image-set(), however deeply wrapped, loads nothing); a url
// token, url(…) unquoted, whose target is not one of those two becomes "none" (an unclosed one runs to the end, as in a
// browser); a fetching call (url, src, image, image-set, cross-fade and their -webkit- forms) that holds a var(), env() or
// attr() becomes "none" (a value substituted later is never read here). The only calls whose strings are kept are the
// selector's (:not(), :is(), :nth-child(), …) and counter() / counters(): none of them fetches.
const INERT_CALLS = new Set(["not", "is", "where", "has", "matches", "-webkit-any", "-moz-any", "nth-child", "nth-last-child", "nth-of-type",
  "nth-last-of-type", "nth-col", "nth-last-col", "lang", "dir", "host", "host-context", "slotted", "part", "state", "counter", "counters"]);
const FETCH_CALLS = new Set(["url", "src", "image", "image-set", "-webkit-image-set", "cross-fade", "-webkit-cross-fade"]);
const LATE_CALLS = new Set(["var", "env", "attr"]);
const CLOSER = { "(": ")", "[": "]", "{": "}" };
const isHexCh = (c) => (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isNl = (c) => c === "\n" || c === "\r" || c === "\f";
const isWsCh = (c) => c === " " || c === "\t" || isNl(c);
const isIdentCh = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "-" || c === "_" || c > "\u007f";
// escEnd(s, i) -> the index after the escape at s[i] ("\\"): up to six hex digits and one whitespace after them, or one character
function escEnd(s, i) {
  const n = s.length;
  let j = i + 1;
  if (j >= n) return n;
  if (isHexCh(s[j])) {
    for (let k = 0; k < 6 && j < n && isHexCh(s[j]); k++) j++;
    if (s[j] === "\r" && s[j + 1] === "\n") return j + 2;
    return j < n && isWsCh(s[j]) ? j + 1 : j;
  }
  if (s[j] === "\r" && s[j + 1] === "\n") return j + 2;
  return j + 1;
}
// cssTargetSafe(v) -> true when a url's or a string's target is a data:image/… picture, an in-document "#…" reference, or
// empty (an empty url loads nothing: what a neutralised string becomes, so the sanitiser's output is its own fixed point)
const cssTargetSafe = (v) => {
  if (/^[ \t\n\r\f]*$/.test(String(v))) return true;
  const p = String(v).replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, "").toLowerCase();
  return isDataImage(p) || p.startsWith("#");
};
export function cssCalls(s, removed = newRemoved()) {
  const n = s.length, out = [], stack = [];
  let live = 0, fetching = null, i = 0;
  while (i < n) {
    const c = s[i];
    if (isIdentCh(c) || c === "\\") {
      // an identifier (escapes inside it kept as sent): a function's name when "(" follows
      const at = i;
      while (i < n && (isIdentCh(s[i]) || s[i] === "\\")) i = s[i] === "\\" ? escEnd(s, i) : i + 1;
      const name = s.slice(at, i);
      if (s[i] !== "(") { out.push(name); continue; }
      const fn = name.toLowerCase(), mark = out.length;
      if (fn === "url") {
        let j = i + 1;
        while (j < n && isWsCh(s[j])) j++;
        if (s[j] !== '"' && s[j] !== "'") {
          // a url token: to the first unescaped ")" (or the end)
          let k = j;
          while (k < n && s[k] !== ")") k = s[k] === "\\" ? escEnd(s, k) : k + 1;
          const end = k < n ? k + 1 : n, target = s.slice(j, k);
          if (cssTargetSafe(target) && !/["'(]/.test(target)) out.push(s.slice(at, end));
          else { removed.externalUrls++; out.push("none"); }
          i = end;
          continue;
        }
      }
      if (LATE_CALLS.has(fn) && fetching) fetching.late = true;
      const f = { close: ")", mark, live: !INERT_CALLS.has(fn), late: false };
      if (f.live) live++;
      if (FETCH_CALLS.has(fn) && !fetching) fetching = f;
      stack.push(f);
      out.push(name, "(");
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      // a string: to its quote, or to an unescaped newline (a browser ends it there and reads on), or the end
      let j = i + 1;
      while (j < n && s[j] !== c && !isNl(s[j])) j = s[j] === "\\" ? escEnd(s, j) : j + 1;
      const closed = j < n && s[j] === c;
      const end = closed ? j + 1 : j;
      if (live > 0 && !cssTargetSafe(s.slice(i + 1, j))) { removed.externalUrls++; out.push(c + c); }
      else out.push(s.slice(i, end));
      i = end;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      stack.push({ close: CLOSER[c], mark: out.length, live: false, late: false });
      out.push(c);
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      const top = stack[stack.length - 1];
      i++;
      if (!top || top.close !== c) { out.push(c); continue; }   // it closes nothing open here: a plain token, as a browser reads it
      stack.pop();
      if (top.live) live--;
      if (top === fetching) {
        fetching = null;
        if (top.late) { out.length = top.mark; removed.externalUrls++; out.push("none"); continue; }
      }
      out.push(c);
      continue;
    }
    // anything else, up to the next character the scan reads
    const at = i;
    i++;
    while (i < n) { const d = s[i]; if (isIdentCh(d) || d === "\\" || d === '"' || d === "'" || CLOSER[d] || d === ")" || d === "]" || d === "}") break; i++; }
    out.push(s.slice(at, i));
  }
  // the end of the sheet closes every open call, as a browser closes them: an open fetching call that held a late value goes
  if (fetching && fetching.late) { out.length = fetching.mark; removed.externalUrls++; out.push("none"); }
  return out.join("");
}

// ---------------------------------------------------------------------------------------------------------------------
// bodyOf(kind, data) -> the body an op stores, checked: { body, bytes, sent, contentType, removed } | { error: { error,
// note } } | null (the op sends no body). A render sends `body` WITH its format in the same op (html: a string fragment;
// wireframe: the grammar, src/wireframe.js); an image render sends `artifact` instead (the write door resolves it). A style
// sends `css`. sent: the UTF-8 bytes as sent (what the limits count); bytes: as stored.
export function bodyOf(kind, data) {
  if (!isObj(data)) return null;
  if (kind === "style") {
    if (!("css" in data) || data.css === undefined) return null;
    if (typeof data.css !== "string" || !data.css.trim()) return { error: { error: "bad_field", note: "Send data.css as the stylesheet's text (a non-empty string)." } };
    const sent = utf8Bytes(data.css);
    if (sent > STYLE_MAX) return { error: { error: "too_large", note: `This style's css is ${sent.toLocaleString("en-US")} bytes; a style is at most ${STYLE_MAX.toLocaleString("en-US")}: split it into two styles.` } };
    const { css, removed } = sanitizeCss(data.css);
    return { body: css, bytes: utf8Bytes(css), sent, contentType: "text/css; charset=utf-8", removed };
  }
  if (kind !== "render" || !("body" in data) || data.body === undefined) return null;
  const format = data.format;
  if (format === "image") return imageBody(data.body);   // D1b item 6: the picture itself, as base64
  if (format !== "html" && format !== "wireframe") return { error: { error: "bad_field", note: `Send data.format with the body, in the same op: "html" (body a markup fragment) or "wireframe" (body the wireframe grammar).` } };
  if (format === "html") {
    if (typeof data.body !== "string" || !data.body.trim()) return { error: { error: "bad_field", note: "Send data.body as the screen's markup: an html fragment (a non-empty string)." } };
    const sent = utf8Bytes(data.body);
    if (sent > HTML_MAX) return { error: { error: "too_large", note: `This render's html is ${sent.toLocaleString("en-US")} bytes; an html render is at most ${HTML_MAX.toLocaleString("en-US")}: trim it (inline images count too).` } };
    const { html, removed } = sanitizeHtml(data.body);
    if (!html.trim()) return { error: { error: "bad_field", note: "Nothing is left of data.body once what runs is stripped (scripts, frames, event handlers): send the screen's markup." } };
    return { body: html, bytes: utf8Bytes(html), sent, contentType: "text/html; charset=utf-8", removed };
  }
  const raw = data.body;
  const sent = utf8Bytes(JSON.stringify(raw ?? null));
  if (sent > WIREFRAME_MAX) return { error: { error: "too_large", note: `This wireframe is ${sent.toLocaleString("en-US")} bytes as JSON; a wireframe is at most ${WIREFRAME_MAX.toLocaleString("en-US")}.` } };
  const v = validateWireframe(raw);
  if (!v.ok) return { error: { error: "bad_field", note: `Send data.body as ${WIREFRAME_HINT} (${v.note}).` } };
  const body = JSON.stringify(v.blocks);
  return { body, bytes: utf8Bytes(body), sent, contentType: "application/json; charset=utf-8", removed: newRemoved() };
}

// sha256Hex(string | bytes) -> the lowercase hex SHA-256 (WebCrypto: the worker's and Node's own)
export async function sha256Hex(v) {
  const bytes = typeof v === "string" ? UTF8.encode(v) : v instanceof Uint8Array ? v : new Uint8Array(v);
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// prepareBodies(ops) — every render and style upsert that sends a body: checked, sanitised and hashed ONCE, the result
// put on the op under PREPARED (an error too, which planKnowledge then reports at the op's index)
export async function prepareBodies(ops) {
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!isObj(op) || (op.kind !== "render" && op.kind !== "style") || op.op !== "upsert" || op[PREPARED] !== undefined) continue;
    const b = bodyOf(op.kind, op.data);
    if (!b) continue;
    if (!b.error) b.hash = await sha256Hex(b.body);
    op[PREPARED] = b;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the sandbox: a body is only ever served as its own document, and only to an <iframe sandbox> (src/knowledge/screens.js
// serveRender). RENDER_CSP rides as a header (the sandbox token makes the document's origin opaque and runs no script even
// opened on its own); DOC_CSP is the same policy repeated in the document (a meta CSP cannot carry sandbox).
export const DOC_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
export const RENDER_CSP = `sandbox; ${DOC_CSP}`;
export const RENDER_CACHE = "private, max-age=31536000, immutable";
// renderDocument(fragment, css) -> the complete document an html render is served as: the fragment in the body, its
// style's css inline (already sanitised when it was stored)
export function renderDocument(fragment, css) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${DOC_CSP}">` +
    `<meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:0}</style>${css ? `<style>${css}</style>` : ""}</head>` +
    `<body>${fragment}</body></html>`;
}
// renderUrl(project, hash, styleHash?) -> the body's URL: with the style's hash it names everything the answer holds, so the
// answer is cached for a year (immutable); without it, the answer revalidates
export const renderUrl = (project, hash, styleHash = null) =>
  orgPath(`/render/${hash}?project=${encodeURIComponent(project)}${styleHash ? `&style=${styleHash}` : ""}`);
