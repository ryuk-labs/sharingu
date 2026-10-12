// src/fonts.js — the brand's three faces, self-hosted (the look pass, sprint 2; docs/plan/LOOK.md).
//
// Manrope reads, Fredoka is the character (the wordmark, big numbers), JetBrains Mono is data. The woff2 bytes are the
// website's own (engine/assets/fonts, SIL OFL 1.1, the licences beside them), bundled as base64 by tools/make-fonts.mjs
// into src/fontdata.js. GET /fonts/:file serves them from the worker itself (src/index.js, before any auth or D1 work):
// no request to Google, the same bytes in `wrangler dev --local`, a version upload and the node selftests. A font's URL
// carries FONT_VERSION, so the response is cached for a year as immutable; a changed font is a new URL.
import { FONT_B64, FONT_VERSION } from "./fontdata.js";
import { FAVICON_SVG } from "./ui.js";

export { FONT_VERSION };
const href = (file) => `/fonts/${file}?v=${FONT_VERSION}`;

// FONT_FACE_CSS: the three @font-face rules (Latin subset, the website's unicode-range), one copy for every page that
// the worker draws (the shell, the sign-in page, the banked report). font-display swap: the fallback stack below each
// face is metric-close, and Manrope is preloaded (FONT_PRELOAD), so the swap lands before the first paint on a warm cache.
const RANGE = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
export const FONT_FACE_CSS = [
  ["Manrope", "400 800", "manrope.woff2"],
  ["Fredoka", "400 600", "fredoka.woff2"],
  ["JetBrains Mono", "400 500", "jetbrains-mono.woff2"],
].map(([family, weight, file]) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${href(file)}) format('woff2');unicode-range:${RANGE}}`).join("\n");
// the body face, asked for before the stylesheet is parsed: no late swap on the text a person reads first
export const FONT_PRELOAD = `<link rel="preload" href="${href("manrope.woff2")}" as="font" type="font/woff2" crossorigin>`;

// The favicon: U-chan (src/ui.js FAVICON_SVG, the website's own favicon.svg vector), served at GET /favicon.svg the way the
// faces are: static bytes, before any auth or D1 read. The pages link it with ?v=<hash of the bytes> (FAVICON_HREF), so that
// response is cached a year as immutable; the bare path (a browser's own probe) is cached a day.
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
export const FAVICON_HREF = `/favicon.svg?v=${fnv(FAVICON_SVG)}`;
export const FAVICON_LINK = `<link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">`;
let favBytes = null;
export function iconResponse(method = "GET", versioned = false) {
  if (!favBytes) favBytes = new TextEncoder().encode(FAVICON_SVG);
  return new Response(method === "HEAD" ? null : favBytes, {
    status: 200,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=86400",
      "content-length": String(favBytes.length), "x-content-type-options": "nosniff" },
  });
}

// fontResponse(file) -> the font's Response (GET or HEAD), or null for a name that is not one of the three
const decoded = new Map();
export function fontResponse(file, method = "GET") {
  const name = String(file || "");
  if (!Object.prototype.hasOwnProperty.call(FONT_B64, name)) return null;
  let bytes = decoded.get(name);
  if (!bytes) {
    const bin = atob(FONT_B64[name]);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decoded.set(name, bytes);
  }
  return new Response(method === "HEAD" ? null : bytes, {
    status: 200,
    headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable", "content-length": String(bytes.length),
      "x-content-type-options": "nosniff" },
  });
}
