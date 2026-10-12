// tools/render-selftest.mjs — screens and renders, the standard (docs/plan/ARCHITECTURE.md §11), offline: no network, no
// worker. Exit code decides: 0 when every case holds.
//   A. The html sanitiser, both ways: every hostile case carries its danger before (so the check would go red without the
//      sanitiser) and none after; every benign case comes back byte for byte.
//   B. The css sanitiser, both ways, the same; an ordinary stylesheet's escapes ("\:") are kept as sent.
//   C. bodyOf: the limits at the byte (html and css 200,000, a wireframe 50,000), format with the body, an image's body
//      refused, a fragment with nothing left once stripped refused.
//   D. The wireframe grammar: good cases normalize; every bad case is refused with a note naming the block.
//   E. drawWireframe (validate, then the ONE drawer wireframeSvg): an SVG of the asked size, semantic neutrals only (no
//      colour literal, never the accent: emphasis is solid --text-muted), labels escaped, a tabbar at the foot, an invalid
//      spec drawn dashed, a theme override, inset in a device frame (no outline, hidden from assistive tech).
//   F. Content-addressing through the REAL write door on a REAL SQLite built from boot.sql (node:sqlite, a D1-shaped
//      binding whose batch is one transaction) and an in-memory R2: a body is put once at o<org>/renders/<project>/<sha256 of the
//      stored bytes>; the same body again puts nothing and writes no row and no ledger row; a changed body puts one object
//      and writes one row; two renders sharing a body put it once; a body the project already indexes is not put again; a
//      failing D1 batch after the puts leaves the objects as orphans and no row; removing a screen removes its renders'
//      rows and leaves the bodies.
//   G. Versions: publish v1, change a render, restore v1 -> the index row is v1's again and v1's body is still there.
//   H. The screens read (src/knowledge/screens.js readScreens) answers the view's shape off the same database, and its
//      statements use their indexes (EXPLAIN QUERY PLAN: no SCAN of k_nodes, k_edges or k_renders).
//   I. M6, a screen's takes (migrate-065): every body the frames above held is a take, in order; a restore through the REAL
//      write door (a hash, no body) puts nothing, makes the take the frame's newest again with its format, size and style and
//      files ONE ledger row; the current body again writes nothing; a hash the project does not hold (another project's too)
//      is unknown_render, a Partner partner_refused; the body route serves a previous take; screenTakes reads the strip in ONE
//      statement (newest first, the current one marked); the Restore press (restoreAnswer) previews, then files.
//   node tools/render-selftest.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const R = await imp("src/render.js");
const W = await imp("src/wireframe.js");
const { writeKnowledge } = await imp("src/knowledge/write.js");
const V = await imp("src/knowledge/versions.js");
const S = await imp("src/knowledge/screens.js");

let passes = 0, fails = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const show = (v) => JSON.stringify(v).slice(0, 400);
const sha = (s) => createHash("sha256").update(s).digest("hex");

// ================= A. the html sanitiser =================
const DANGER = /<script|<iframe|<object|<embed|<frame|<applet|<base|<meta|<link|\son[a-z]+\s*=|javascript:|vbscript:|https?:\/\/|\/\/evil|srcdoc|formaction|<!--/i;
const HOSTILE = [
  ["a script element", "<p>a<script>alert(1)</script>b</p>"],
  ["a script in upper case with attributes", '<SCRIPT type="text/javascript" src="https://evil.example/x.js"></SCRIPT><p>x</p>'],
  ["an unclosed script takes the rest", "<p>x</p><script>alert(1)"],
  ["an onclick", '<button onclick="steal()">go</button>'],
  ["an onerror on an image, unquoted", "<img src=x onerror=alert(1)>"],
  ["an SVG onload", '<svg onload="alert(1)"><rect/></svg>'],
  ["a javascript: link", '<a href="javascript:alert(1)">x</a>'],
  ["a javascript: link hidden by a tab entity", '<a href="jav&#x09;ascript:alert(1)">x</a>'],
  ["a javascript: link hidden by a decimal entity", '<a href="&#106;avascript:alert(1)">x</a>'],
  ["a javascript: link in upper case with spaces", '<a href="  JAVASCRIPT:alert(1)">x</a>'],
  ["an external link", '<a href="https://evil.example">x</a>'],
  ["an iframe", '<iframe src="https://evil.example"></iframe><p>x</p>'],
  ["an iframe srcdoc", '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ["an object and an embed", '<object data="https://evil.example/x"></object><embed src="https://evil.example/y">'],
  ["a base, a meta refresh, a stylesheet link", '<base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"><link rel="stylesheet" href="https://evil.example/x.css"><p>x</p>'],
  ["an external image", '<img src="https://evil.example/t.png" alt="t">'],
  ["a protocol-relative image", '<img src="//evil.example/t.png">'],
  ["a form action and a formaction", '<form action="https://evil.example"><button formaction="https://evil.example">x</button></form>'],
  ["an SVG use of an external href", '<svg><use href="https://evil.example/s.svg#x"/></svg>'],
  ["an SVG animation of an href", '<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>'],
  ["a style attribute with an external url", '<div style="background:url(https://evil.example/p.png)">x</div>'],
  ["a style element with an @import", '<style>@import url(https://evil.example/x.css); .a{color:red}</style>'],
  ["a comment", "<p>x</p><!-- <script>alert(1)</script> -->"],
  ["a tag split by a script", "<scr<script>ipt>alert(1)</script>"],
  ["a noscript and a template", "<noscript><img src=x onerror=alert(1)></noscript><template><script>alert(1)</script></template><p>x</p>"],
];
// the danger as a browser reads it (the two entity spellings a scheme hides behind, decoded)
const dangerous = (h) => DANGER.test(h) || DANGER.test(h.replace(/&#x09;/g, "").replace(/&#106;/g, "j"));
for (const [label, input] of HOSTILE) {
  const out = R.sanitizeHtml(input);
  ok(dangerous(input) && !dangerous(out.html) && R.removedAny(out.removed), `html: ${label} is stripped`, `${show(input)} -> ${show(out.html)}`);
}
{
  const o = R.sanitizeHtml('<p onclick="x()">A<script>a()</script><a href="javascript:b()">l</a><iframe></iframe><img src="https://e.example/i.png"></p>');
  ok(o.html === "<p>A<a>l</a><img></p>" && JSON.stringify(o.removed) === JSON.stringify({ scripts: 1, handlers: 1, jsUrls: 1, frames: 1, externalUrls: 1, imports: 0, comments: 0, tags: 0 }),
    "html: what is removed is counted per class (the door's `stripped`)", `${o.html} ${show(o.removed)}`);
}
const BENIGN = [
  ["a plain fragment", '<div class="card" style="width:390px;height:844px;position:relative"><span class="tnum">9:41</span></div>'],
  ["an inline SVG with an in-document gradient", '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F4F6F5"><path d="M8 88 L52 86 Z" fill="url(#fadeA)"></path><linearGradient id="fadeA"></linearGradient></svg>'],
  ["a data:image picture", '<img src="data:image/png;base64,iVBORw0KGgo=" alt="logo">'],
  ["an in-document link and an empty one", '<a href="#top">top</a><a href="">here</a>'],
  ["a form with inputs and a label", '<form><label for="a">Amount</label><input id="a" type="text" placeholder="0.00" disabled><button type="button">Send</button></form>'],
  ["text with entities and a lone >", "<p>1 &lt; 2 &amp;&amp; 3 > 2</p>"],
  ["a style element", "<style>.a{color:red}.b:hover{opacity:.5}</style><div class=\"a\">x</div>"],
];
for (const [label, input] of BENIGN) {
  const out = R.sanitizeHtml(input);
  ok(out.html === input && !R.removedAny(out.removed), `html: ${label} comes back byte for byte`, `${show(out.html)} ${show(out.removed)}`);
}
ok(R.sanitizeHtml("1 < 2 <3").html === "1 &lt; 2 &lt;3", "html: a < that starts no tag is written &lt; (nothing the sanitiser did not parse reaches the output)");

// ================= B. the css sanitiser =================
const CSS_DANGER = /@import|url\(\s*["']?https?:|url\(\s*["']?\/\/|expression\(|-moz-binding|behavior\s*:|javascript:|<\/style|\\75 rl|image-set\("http/i;
const CSS_HOSTILE = [
  ["an @import", '@import url("https://evil.example/x.css"); .a{color:red}'],
  ["an @import of a bare string", '@import "https://evil.example/x.css";'],
  ["an external background", ".a{background:url(https://evil.example/p.png)}"],
  ["a protocol-relative font", "@font-face{font-family:x;src:url(//evil.example/f.woff2)}"],
  ["an unclosed url at the end", ".a{background:url(https://evil.example/p.png"],
  ["a url hidden by an escape", ".a{background:\\75 rl(https://evil.example/p.png)}"],
  ["an image-set of an external picture", '.a{background:image-set("https://evil.example/p.png" 1x)}'],
  ["an expression, a binding and a behavior", ".a{width:expression(alert(1));-moz-binding:url(x.xml#b);behavior:url(x.htc)}"],
  ["a javascript: url", ".a{background:url(javascript:alert(1))}"],
  ["a stylesheet that closes its element", ".a{}</style><script>alert(1)</script>"],
];
for (const [label, input] of CSS_HOSTILE) {
  const out = R.sanitizeCss(input);
  ok(CSS_DANGER.test(input) && !CSS_DANGER.test(out.css) && !/</.test(out.css), `css: ${label} is stripped`, `${show(input)} -> ${show(out.css)}`);
}
for (const [label, input] of [["an ordinary stylesheet", ".a{color:#123;padding:4px}.b{background:url(\"data:image/svg+xml;base64,PHN2Zz4=\") no-repeat}"],
  ["a class name's escape", ".md\\:flex{display:flex}"], ["an in-document url", ".a{fill:url(#g)}"], ["a content escape", '.q::before{content:"\\201C"}']]) {
  const out = R.sanitizeCss(input);
  ok(out.css === input && !R.removedAny(out.removed), `css: ${label} comes back byte for byte`, show(out));
}

// review fixes 3 and 4 (sprint 2): ONE linear scan of the function calls. The bypasses the review found (a string beside a
// url() inside image-set, the same behind a gradient or -webkit-image-set, a ")" inside "[…]", a var() a custom property
// fills) carry their external picture before and none after; selectors' and counters' strings are kept
// each comes out exactly as below, and the output is a fixed point (sanitising it again changes nothing)
const CSS_BYPASS = [
  ["image-set beside a data: url", 'a{background:image-set(url(data:image/png,a) 1x, "https://evil.example/x" 2x)}', 'a{background:image-set(url(data:image/png,a) 1x, "" 2x)}'],
  ["the same after a linear-gradient", 'a{background:linear-gradient(red,blue), image-set(url(data:image/png,a) 1x, "https://evil.example/x" 2x)}',
    'a{background:linear-gradient(red,blue), image-set(url(data:image/png,a) 1x, "" 2x)}'],
  ["-webkit-image-set beside a data: url", 'a{background:-webkit-image-set(url(data:image/png,a) 1x, "https://evil.example/x" 2x)}', 'a{background:-webkit-image-set(url(data:image/png,a) 1x, "" 2x)}'],
  ["a string wrapped twice", 'a{background:cross-fade(image(image-set("https://evil.example/x" 1x)), url(data:image/png,a))}', 'a{background:cross-fade(image(image-set("" 1x)), url(data:image/png,a))}'],
  ["a ) inside [ ] inside image-set", 'a{background:image-set([)] "https://evil.example/x" 1x)}', 'a{background:image-set([)] "" 1x)}'],
  ["a var() a custom property fills", 'a{--u:"https://evil.example/x";background:image-set(var(--u) 1x)}', 'a{--u:"https://evil.example/x";background:none}'],
  ["src() with a var()", '@font-face{font-family:x;src:src(var(--f))}', "@font-face{font-family:x;src:none}"],
  ["a url token with an escaped )", 'a{background:url(data:image/png\\)"https://evil.example/x")}', "a{background:none}"],
  // a removal that brings "/" and "*" together never opens a comment: the string a browser reads stays one string
  ["a comment brought together by a removal", 'a{content:/@import x;*"*/ b{background:image-set("https://evil.example/x" 1x)} "}', 'a{content:/ *"*/ b{background:image-set("https://evil.example/x" 1x)} "}'],
  ["a string ended by a newline", 'a{background:image-set("x\n"https://evil.example/x" 1x)}', 'a{background:image-set(""\n"" 1x)}'],
];
for (const [label, input, want] of CSS_BYPASS) {
  const out = R.sanitizeCss(input), again = R.sanitizeCss(out.css);
  ok(out.css === want && again.css === out.css && !R.removedAny(again.removed), `css: the review's bypass, ${label}, loads nothing`, `${show(input)} -> ${show(out.css)}`);
}
for (const [label, input] of [["a selector's string", 'a:not([href^="https:"]){color:red}'], ["a counters() separator", '.c::before{content:counters(item, ".")}'],
  ["an in-document url inside image-set", '.a{background:image-set(url("#g") 1x, "data:image/png;base64,iVBORw0KGgo=" 2x)}']]) {
  const out = R.sanitizeCss(input);
  ok(out.css === input && !R.removedAny(out.removed), `css: ${label} comes back byte for byte`, show(out));
}
// linear time: 198 KB of the inputs that made the old regexes backtrack (image( took 4,487 ms) each finish well under 50 ms
const timed = (f, x) => { const t = performance.now(); f(x); return performance.now() - t; };
for (const [label, x] of [["image(", "image(".repeat(33000)], ["url(", "url(".repeat(49500)], ["(", "(".repeat(198000)], ['"', '"'.repeat(198000)], ["'", "'".repeat(198000)],
  ["\\", "\\".repeat(198000)], ['image-set("', 'image-set("'.repeat(18000)], ["url(\\75 ", "url(\\75 ".repeat(25000)], ["/*", "/*".repeat(99000)]]) {
  R.sanitizeCss(x.slice(0, 2000));
  const ms = Math.min(timed(R.sanitizeCss, x), timed(R.sanitizeCss, x));
  ok(x.length >= 190000 && ms < 50, `css: ${x.length.toLocaleString("en-US")} bytes of ${JSON.stringify(label)} sanitise in ${ms.toFixed(1)} ms (linear)`);
}
for (const [label, x] of [["<", "<".repeat(198000)], ["<a <a …", "<a ".repeat(66000)], ["unquoted attributes", "<a " + "b=c ".repeat(49000)], ["unclosed quotes", '<a b="'.repeat(33000)],
  ["closed tags", "<a b=c>".repeat(28000)], ["</", "</".repeat(99000)], ["<style>", "<style>".repeat(28000)], ["style attributes", '<p style="background:image(">'.repeat(6700)], ["<a/", "<a/".repeat(66000)]]) {
  R.sanitizeHtml(x.slice(0, 2000));
  const ms = Math.min(timed(R.sanitizeHtml, x), timed(R.sanitizeHtml, x));
  ok(x.length >= 190000 && ms < 50, `html: ${x.length.toLocaleString("en-US")} bytes of ${label} sanitise in ${ms.toFixed(1)} ms (linear)`);
}
{
  // a style attribute is read with its entities decoded once, so it is written back with "&" escaped: a browser reads it as read
  const o = R.sanitizeHtml(`<p style="content:'&amp;#58;'">x</p>`);
  ok(o.html === `<p style="content:'&amp;#58;'">x</p>`, "html: a style attribute writes its & back escaped (the browser decodes it once, as the sanitiser did)", o.html);
}

// ================= C. bodyOf: the limits and the shape =================
{
  const at = (n) => "<p>" + "x".repeat(n - 7) + "</p>";
  const okMax = R.bodyOf("render", { format: "html", body: at(R.HTML_MAX) }), over = R.bodyOf("render", { format: "html", body: at(R.HTML_MAX + 1) });
  ok(!okMax.error && okMax.sent === R.HTML_MAX && over.error && over.error.error === "too_large", `html: ${R.HTML_MAX.toLocaleString("en-US")} bytes is accepted, one more is too_large`, show(over));
  const multi = R.bodyOf("render", { format: "html", body: "<p>" + "é".repeat(100000) + "</p>" });
  ok(multi.error && multi.error.error === "too_large", "html: the limit counts UTF-8 bytes (100,000 é is 200,007 bytes)");
  const css = R.bodyOf("style", { css: "a{}" + " ".repeat(R.STYLE_MAX) });
  ok(css.error && css.error.error === "too_large", "css: over 200,000 bytes is too_large");
  const wf = R.bodyOf("render", { format: "wireframe", body: Array.from({ length: 80 }, () => ({ kind: "text", label: "x".repeat(120), lines: 24, items: 24, emphasis: true })) });
  ok(!wf.error && wf.sent < R.WIREFRAME_MAX, `a wireframe at the grammar's own maximum (80 blocks) fits ${R.WIREFRAME_MAX.toLocaleString("en-US")} bytes (${wf.sent})`);
  const noFormat = R.bodyOf("render", { body: "<p>x</p>" }), image = R.bodyOf("render", { format: "image", body: "<p>x</p>" });
  const empty = R.bodyOf("render", { format: "html", body: "<script>alert(1)</script>" }), notText = R.bodyOf("render", { format: "html", body: 7 });
  ok(noFormat.error && /format/.test(noFormat.error.note) && image.error && /base64/.test(image.error.note) && empty.error && /Nothing is left/.test(empty.error.note) && notText.error,
    "a body needs its format in the same op; an image render's body must be a picture's base64 (D1b item 6: markup is refused); a fragment with nothing left once stripped is refused");
  // D1b item 6: a picture through the MCP — base64, checked by its first bytes; an SVG (bare or as a data URL) refused
  const png = R.bodyOf("render", { format: "image", body: R.TINY_PNG_BASE64 }), pngUrl = R.bodyOf("render", { format: "image", body: "data:image/png;base64," + R.TINY_PNG_BASE64 });
  const svg = R.bodyOf("render", { format: "image", body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><a href="https://x"/></svg>').toString("base64") });
  const svgUrl = R.bodyOf("render", { format: "image", body: "data:image/svg+xml;base64,PHN2Zy8+" });
  const lie = R.bodyOf("render", { format: "image", body: "data:image/jpeg;base64," + R.TINY_PNG_BASE64 });
  const jpeg = R.bodyOf("render", { format: "image", body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString("base64") });
  const webp = R.bodyOf("render", { format: "image", body: Buffer.from("RIFF\x10\0\0\0WEBPVP8 ", "latin1").toString("base64") });
  const big = R.bodyOf("render", { format: "image", body: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(R.IMAGE_MAX)]).toString("base64") });
  ok(!png.error && png.contentType === "image/png" && png.bytes === 70 && !pngUrl.error && pngUrl.bytes === 70 && svg.error && /SVG/.test(svg.error.note) && svgUrl.error && /SVG/.test(svgUrl.error.note)
    && lie.error && /bytes are image\/png/.test(lie.error.note) && jpeg.contentType === "image/jpeg" && webp.contentType === "image/webp" && big.error && big.error.error === "too_large",
    "an image render's body: a png (bare or a data URL) is taken by its bytes; jpeg and webp by theirs; an SVG refused (bare and as a data URL); a type that lies refused; over 1 MB too_large", show({ png, svg, lie, big: big.error }));
  const st = R.bodyOf("style", { css: ".a{color:red}" });
  ok(st.contentType === "text/css; charset=utf-8" && st.body === ".a{color:red}" && R.bodyOf("render", { format: "wireframe", body: [{ kind: "spacer" }] }).contentType === "application/json; charset=utf-8",
    "the content types: css text/css, a wireframe application/json, html text/html");
}

// ================= D. the wireframe grammar =================
{
  const good = W.validateWireframe([{ emphasis: true, label: "Go", kind: "button" }, { kind: "list", items: 3 }, { kind: "text", label: "Hi", emphasis: false }]);
  ok(good.ok && JSON.stringify(good.blocks) === '[{"kind":"button","label":"Go","emphasis":true},{"kind":"list","items":3},{"kind":"text","label":"Hi"}]',
    "grammar: a good wireframe normalizes (the grammar's field order, emphasis false dropped), so the same wireframe hashes the same", show(good));
  const BAD = [["not a list", { kind: "header" }], ["an empty list", []], ["81 blocks", Array.from({ length: 81 }, () => ({ kind: "spacer" }))],
    ["an unknown kind", [{ kind: "carousel" }]], ["an extra field", [{ kind: "text", colour: "red" }]], ["a label too long", [{ kind: "title", label: "x".repeat(121) }]],
    ["an empty label", [{ kind: "title", label: " " }]], ["lines 0", [{ kind: "text", lines: 0 }]], ["items 25", [{ kind: "list", items: 25 }]],
    ["lines 1.5", [{ kind: "text", lines: 1.5 }]], ["emphasis yes", [{ kind: "button", emphasis: "yes" }]], ["a block that is a string", ["header"]]];
  for (const [label, v] of BAD) { const r = W.validateWireframe(v); ok(!r.ok && typeof r.note === "string" && r.note.length > 10, `grammar: ${label} is refused`, show(r)); }
  ok(W.WIREFRAME_BLOCKS.join() === "header,nav,tabbar,title,text,input,button,list,card,image,divider,spacer", "grammar: the closed vocabulary is §11's twelve blocks");
}

// ================= E. the drawer =================
{
  const spec = [{ kind: "header", label: "Home <script>" }, { kind: "nav", items: 3 }, { kind: "title", label: "Balance", lines: 2 }, { kind: "text", lines: 3 }, { kind: "input", label: "Amount" },
    { kind: "button", label: "Send", emphasis: true }, { kind: "list", items: 2, label: "Recent" }, { kind: "card", label: "Card", lines: 2, emphasis: true }, { kind: "image" },
    { kind: "divider" }, { kind: "spacer", lines: 2 }, { kind: "tabbar", items: 4 }];
  const svg = W.drawWireframe(spec, { width: 390, height: 844 });
  ok(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="wf" viewBox="0 0 390 844" width="390" height="844"/.test(svg) && !svg.includes("data-invalid"), "drawer: an SVG of the asked size", svg.slice(0, 160));
  ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(svg.replace(/xmlns="[^"]*"/, "")) && /var\(--surface\)/.test(svg) && /fill="var\(--text-muted\)" stroke="var\(--text-muted\)"/.test(svg) && !/--accent|--on-accent/.test(svg),
    "drawer: semantic neutrals only (var(--…)), no colour literal, the emphasis solid --text-muted and never the accent: it follows Paper and Ink");
  ok(W.drawWireframe(spec, { width: 390, height: 844 }) === W.wireframeSvg(W.validateWireframe(spec).blocks, { width: 390, height: 844 }), "drawer: drawWireframe is the grammar's check, then the ONE drawer (wireframeSvg)");
  const inset = W.drawWireframe(spec, { width: 390, height: 844, inset: true });
  ok(/aria-hidden="true"/.test(inset) && !/role="img"|rx="14"/.test(inset), "drawer: inset in a device frame, no outline of its own and hidden from assistive tech (the frame's caption names the screen)");
  ok(svg.includes("Home &lt;script&gt;") && !svg.includes("<script"), "drawer: a label is escaped");
  ok(/<circle cx="[\d.]+" cy="806"/.test(svg), "drawer: the tabbar sits at the foot of the frame (844 - 60 + 22)");
  const bad = W.drawWireframe([{ kind: "carousel" }], { width: 390 });
  ok(bad.includes('data-invalid="1"') && bad.includes("stroke-dasharray"), "drawer: an invalid spec draws an empty dashed frame");
  const themed = W.drawWireframe([{ kind: "button", emphasis: true }], { width: 1440, theme: { muted: "var(--ok)" } });
  ok(themed.includes("var(--ok)") && !themed.includes("var(--text-muted)") && /viewBox="0 0 1440 /.test(themed), "drawer: a theme replaces a token; a wide frame is drawn wide");
}

// ================= F. content-addressing through the write door =================
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const T0 = "2026-10-01T00:00:00.000Z";
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
db.exec(BOOT);
db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)").run("p-o", "Owen Park", "owen@example.test", "owner", sha("owner-key"), T0);
db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${T0}'),('beta','Beta',1,'${T0}')`);
function d1(o = {}) {
  const exec = (sql, args) => {
    if (o.failOn && o.failOn(sql)) throw new Error("D1_ERROR: injected");
    return /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
  };
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const r2 = new Map();
let puts = 0;
const bucket = () => ({ get: async (k) => (r2.has(k) ? { text: async () => r2.get(k).text, arrayBuffer: async () => new TextEncoder().encode(r2.get(k).text).buffer, httpMetadata: { contentType: r2.get(k).type } } : null),
  head: async (k) => (r2.has(k) ? { httpMetadata: { contentType: r2.get(k).type } } : null), list: async () => ({ objects: [] }),
  put: async (k, v, o) => { puts++; r2.set(k, { text: typeof v === "string" ? v : new TextDecoder().decode(v), type: o && o.httpMetadata && o.httpMetadata.contentType }); } });
const envOf = (ws = "alpha", o = {}) => (asOrg({ DB: d1(o), [Symbol.for("sharingu.project")]: ws, BRAIN: bucket() }));
const OWNER = { id: "p-o", name: "Owen Park", role: "owner" };
const count = (sql, ...a) => Number(db.prepare(sql).get(...a).n);
const ledger = () => count("SELECT COUNT(*) AS n FROM transmission");
const screen = (id, data = {}) => ({ kind: "node", op: "upsert", data: { id, type: "screen", name: id, data: { surface: "mobile", lane: "start", ...data } } });
const HTML = '<div class="a" onclick="x()">Home</div>', CLEAN = '<div class="a">Home</div>';
const render = (data) => ({ kind: "render", op: "upsert", data: { screen: "screen:home", format: "html", ...data } });
{
  const w = await writeKnowledge(OWNER, { project: "alpha", ops: [screen("screen:home", { states: ["default"] }), screen("screen:next"),
    { kind: "style", op: "upsert", data: { id: "app", css: ".a{color:red}" } }, render({ state: "default", variant: "live", body: HTML, style: "app" })] }, envOf());
  const row = db.prepare("SELECT * FROM k_renders WHERE project='alpha' AND screen='screen:home'").get() || {};
  const key = `o1/renders/alpha/${row.hash}`;   // sprint 6, 6.4: under the writer's org's prefix (src/storage.js)
  ok(!w.error && w.written === 4 && w.blobs === 2 && puts === 2 && row.hash === sha(CLEAN) && r2.get(key) && r2.get(key).text === CLEAN && r2.get(key).type === "text/html; charset=utf-8"
    && row.bytes === CLEAN.length && row.state === "default" && row.variant === "live" && w.stripped && w.stripped[0].removed.handlers === 1,
    "F: a body is stored SANITISED at o<org>/renders/<project>/<sha256 of the stored bytes>, with its content type; the index row names it; the reply says what was stripped", show({ w, row }));
  const t0 = ledger(), u0 = row.updated_at;
  const again = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ state: "default", variant: "live", body: HTML, style: "app" }), { kind: "style", op: "upsert", data: { id: "app", css: ".a{color:red}" } }] }, envOf());
  const row2 = db.prepare("SELECT updated_at FROM k_renders WHERE project='alpha' AND screen='screen:home'").get();
  ok(!again.error && again.written === 0 && again.unchanged === 2 && again.ledger === null && again.blobs === 0 && puts === 2 && ledger() === t0 && row2.updated_at === u0,
    "F: the same body (and the same style) again: nothing put, no row written (updated_at unchanged), no ledger row", show(again));
  const merge = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ state: "default", variant: "live", width: 390 })].map((o) => { delete o.data.format; return o; }) }, envOf());
  ok(!merge.error && merge.written === 1 && puts === 2 && db.prepare("SELECT width, hash FROM k_renders WHERE project='alpha'").get().width === 390, "F: a field-only change writes the row and puts nothing (the body is unchanged)", show(merge));
  const changed = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ state: "default", variant: "live", body: "<div>Home 2</div>" })] }, envOf());
  const row3 = db.prepare("SELECT hash, style, width FROM k_renders WHERE project='alpha' AND screen='screen:home'").get();
  ok(!changed.error && changed.written === 1 && changed.blobs === 1 && puts === 3 && row3.hash === sha("<div>Home 2</div>") && row3.style === "app" && row3.width === 390 && r2.has(key),
    "F: a changed body puts ONE object and writes ONE row; the old body stays in R2", show(changed));
  const twin = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ screen: "screen:next", variant: "a", body: "<p>same</p>" }), render({ screen: "screen:next", variant: "b", body: "<p>same</p>" })] }, envOf());
  ok(!twin.error && twin.written === 2 && twin.blobs === 1 && puts === 4, "F: two renders with the same body in one call put it once", show(twin));
  const third = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ screen: "screen:next", variant: "c", body: "<p>same</p>" })] }, envOf());
  ok(!third.error && third.written === 1 && third.blobs === 0 && puts === 4, "F: a body the project already indexes (another render holds it) is not put again", show(third));
  const other = await writeKnowledge(OWNER, { project: "beta", ops: [screen("screen:x"), render({ screen: "screen:x", body: "<p>same</p>" })] }, envOf("beta"));
  ok(!other.error && other.blobs === 1 && puts === 5 && r2.has(`o1/renders/beta/${sha("<p>same</p>")}`), "F: content-addressing is per project: the same bytes in another project are its own object", show(other));
  const p0 = puts, rows0 = count("SELECT COUNT(*) AS n FROM k_renders"), t1 = ledger();
  const failing = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ screen: "screen:next", variant: "d", body: "<p>orphan</p>" })] }, envOf("alpha", { failOn: (sql) => sql.startsWith("INSERT INTO k_renders") }));
  ok(failing.error === "write_failed" && puts === p0 + 1 && r2.has(`o1/renders/alpha/${sha("<p>orphan</p>")}`) && count("SELECT COUNT(*) AS n FROM k_renders") === rows0 && ledger() === t1,
    "F: a D1 batch that fails after the put leaves the object as an orphan (harmless) and writes no row and no ledger row", show(failing));
  const retry = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ screen: "screen:next", variant: "d", body: "<p>orphan</p>" })] }, envOf());
  ok(!retry.error && retry.written === 1 && retry.blobs === 1, "F: the retry lands (the same key is put again: idempotent)", show(retry));
  const missing = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ screen: "screen:none", body: "<p>x</p>" }), render({ screen: "screen:next", variant: "s", body: "<p>x</p>", style: "nope" })] }, envOf());
  ok(missing.error === "invalid_ops" && missing.errors.map((e) => e.error).join() === "missing_node,missing_style", "F: a render naming no screen node, or no style, is refused (missing_node, missing_style)", show(missing));
  const typed = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "node", op: "upsert", data: { id: "table:t", type: "table", name: "t" } }, render({ screen: "table:t", body: "<p>x</p>" })] }, envOf());
  ok(typed.error === "invalid_ops" && typed.errors[0].error === "missing_node" && /not a screen/.test(typed.errors[0].note), "F: a render of a node that is not a screen is refused");
  // M6: a hash a caller sends is a take to RESTORE (section I), never the hash of the body it sends: both together are refused
  const derived = await writeKnowledge(OWNER, { project: "alpha", ops: [render({ screen: "screen:next", variant: "h", body: "<p>x</p>", hash: sha("evil") })] }, envOf());
  ok(derived.error === "invalid_ops" && derived.errors[0].error === "bad_field" && /not both/.test(derived.errors[0].note), "F: a caller cannot send a hash with a body (a body's hash is the door's, derived from it)", show(derived));
  const badStates = await writeKnowledge(OWNER, { project: "alpha", ops: [screen("screen:y", { states: [{ name: "x" }] })] }, envOf());
  const badWf = await writeKnowledge(OWNER, { project: "alpha", ops: [screen("screen:y", { wireframe: [{ kind: "carousel" }] })] }, envOf());
  ok(badStates.error === "invalid_ops" && badWf.error === "invalid_ops" && /data\.states/.test(badStates.errors[0].note) && /data\.wireframe/.test(badWf.errors[0].note),
    "F: a screen's data.states are names and its data.wireframe the grammar (each refused otherwise)");
  const before = r2.size;
  const rm = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "node", op: "remove", data: { id: "screen:next" } }] }, envOf());
  ok(!rm.error && count("SELECT COUNT(*) AS n FROM k_renders WHERE project='alpha' AND screen='screen:next'") === 0 && r2.size === before,
    "F: removing a screen removes its renders' index rows; the bodies stay (never deleted)", show(rm));
}

// review fixes 5 and 6 (sprint 2): an image render names a png/jpeg/webp artifact that is the writer's own or public, the
// owner too (an SVG is refused naming a wireframe; someone else's private picture is missing_artifact); the body route serves
// only a raster type, so a body stored as an SVG before is refused
{
  db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)").run("p-m", "Mae Lin", "mae@example.test", "member", sha("member-key"), T0);
  const art = (id, person, kind, type, group = "s9") => {
    // banked under org 1's prefix (src/storage.js: o<org>/<the row's r2_key>)
    db.prepare("INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,1)").run(id, person, kind, id, `inbox/artifacts/t/${id}`, sha(id), id.length, group, T0);
    r2.set(`o1/inbox/artifacts/t/${id}`, { text: id, type });
  };
  art("a-own", "p-o", "image", "image/png"); art("a-mem", "p-m", "image", "image/png"); art("a-pub", "p-m", "image", "image/png", "public");
  art("a-svg", "p-o", "svg", "image/svg+xml"); art("a-svg2", "p-o", "image", "image/svg+xml");
  const img = (variant, artifact) => ({ kind: "render", op: "upsert", data: { screen: "screen:x", state: "default", variant, format: "image", artifact } });
  const one = async (variant, artifact) => writeKnowledge(OWNER, { project: "beta", ops: [img(variant, artifact)] }, envOf("beta"));
  const svg = await one("svg", "a-svg"), svg2 = await one("svg2", "a-svg2"), theirs = await one("theirs", "a-mem");
  const e = (w) => (w.errors || [])[0] || {};
  ok(svg.error === "invalid_ops" && e(svg).error === "bad_field" && /SVG/.test(e(svg).note) && /wireframe/.test(e(svg).note) && e(svg2).error === "bad_field" && /SVG/.test(e(svg2).note),
    "F: an SVG image render is refused (by its kind, and by its stored type), the note naming a wireframe or a png, jpeg or webp", show([svg, svg2]));
  ok(theirs.error === "invalid_ops" && e(theirs).error === "missing_artifact", "F: the owner naming a member's PRIVATE picture as a render is missing_artifact (the owner may read it, never publish it)", show(theirs));
  const own = await one("own", "a-own"), pub = await one("pub", "a-pub");
  ok(!own.error && own.written === 1 && !pub.error && pub.written === 1, "F: the owner's own picture and a public one are filed (their bytes read from o1/ and put under o1/)", show([own, pub]));
  // the body route: the raster one served; a body whose stored type is an SVG (filed before this rule) refused
  const req = (hash) => new Request(`https://org.example/render/${hash}?project=beta`, { headers: { authorization: "Bearer owner-key" } });
  const serve = (hash) => S.serveRender(req(hash), envOf("beta"), new URL(`https://org.example/render/${hash}?project=beta`), `/render/${hash}`);
  const png = await serve(sha("a-own"));
  ok(png.status === 200 && png.headers.get("content-type") === "image/png", `F: an image render's raster body is served as itself (${png.status} ${png.headers.get("content-type")})`);
  ok(r2.has(`o1/renders/beta/${sha("a-own")}`) && !r2.has(`renders/beta/${sha("a-own")}`), "F: the render's body is put under org 1's prefix, never the bare key");
  r2.get(`o1/renders/beta/${sha("a-own")}`).type = "image/svg+xml";
  const old = await serve(sha("a-own"));
  const oj = await old.json().catch(() => ({}));
  ok(old.status === 410 && oj.error === "unsupported_image" && /wireframe/.test(oj.note || ""), `F: a stored body whose type is an SVG is never served from our origin (${old.status} ${show(oj)})`);
  r2.get(`o1/renders/beta/${sha("a-own")}`).type = "image/png";
  // sprint 7, 7.0a: a body under a bare key (no org prefix, as the code before 6.4 wrote) is no org's: org 1 is served none of it
  r2.set(`renders/beta/${sha("a-own")}`, r2.get(`o1/renders/beta/${sha("a-own")}`)); r2.delete(`o1/renders/beta/${sha("a-own")}`);
  const bare = await serve(sha("a-own"));
  const bareText = await bare.text();
  ok(bare.status >= 400 && !bareText.includes("a-own"), `F: a body under a bare key (no org prefix) is never served, not even to org 1 (${bare.status})`);
  r2.set(`o1/renders/beta/${sha("a-own")}`, r2.get(`renders/beta/${sha("a-own")}`)); r2.delete(`renders/beta/${sha("a-own")}`);
}

// k_screen_renders (migrate-046) is k_renders folded per screen, kept by triggers: recomputed here, it must be equal
const AGG = "json_group_array(json_array(r.state, r.variant, r.format, r.hash, r.bytes, r.width, r.height, r.style))";
const aggExact = () => {
  const want = db.prepare(`SELECT r.project, r.screen, ${AGG} AS renders FROM (SELECT * FROM k_renders ORDER BY project, screen, state, variant) r GROUP BY r.project, r.screen ORDER BY 1, 2`).all();
  const got = db.prepare("SELECT project, screen, renders FROM k_screen_renders ORDER BY 1, 2").all();
  return JSON.stringify(want) === JSON.stringify(got) ? null : `want ${show(want)} got ${show(got)}`;
};
{
  const d = aggExact();
  ok(!d && count("SELECT COUNT(*) AS n FROM k_screen_renders") > 0, "F: k_screen_renders is every screen's renders folded into one row, exact after inserts, updates (a merge, a new body) and deletes (a removed screen)", d || "");
}

// ================= G. versions: the index round-trips =================
{
  const hashOf = () => db.prepare("SELECT hash FROM k_renders WHERE project='alpha' AND screen='screen:home'").get().hash;
  const h1 = hashOf();
  const p1 = await V.publishVersion(OWNER, { project: "alpha", title: "renders v1" }, envOf());
  const snap = db.prepare("SELECT payload FROM k_snapshots WHERE project='alpha' AND n=? AND table_name='k_renders'").get(p1.version && p1.version.n);
  await writeKnowledge(OWNER, { project: "alpha", ops: [render({ state: "default", variant: "live", body: "<div>Home 3</div>" }), { kind: "style", op: "upsert", data: { id: "app", css: ".a{color:blue}" } }] }, envOf());
  const h2 = hashOf();
  const rs = await V.restoreVersion(OWNER, { project: "alpha", v: p1.version.n }, envOf());
  const styleNow = db.prepare("SELECT hash FROM k_styles WHERE project='alpha' AND id='app'").get().hash;
  ok(!p1.error && p1.version.counts.render === 1 && p1.version.counts.style === 1 && snap && JSON.parse(snap.payload)[0].hash === h1 && h2 !== h1 && !rs.error && hashOf() === h1
    && styleNow === sha(".a{color:red}") && r2.has(`o1/renders/alpha/${h1}`) && r2.has(`o1/renders/alpha/${h2}`),
    "G: publish snapshots the render and style index rows; a changed render restored to v1 names v1's hash again, its body still in R2 (and the newer one too)", show({ p1: p1.version && p1.version.counts, rs: rs.error }));
  const d = aggExact();
  ok(!d, "G: after the restore, k_screen_renders follows k_renders (the same triggers)", d || "");
}

// ================= H. the screens read =================
{
  await writeKnowledge(OWNER, { project: "alpha", ops: [screen("screen:two", { step: 2, states: ["default", "empty"], wireframe: [{ kind: "header", label: "Two" }] }),
    { kind: "node", op: "upsert", data: { id: "surface:mobile", type: "surface", name: "Mobile app" } }, { kind: "node", op: "upsert", data: { id: "lane:start", type: "lane", name: "Getting started" } },
    { kind: "edge", op: "upsert", data: { from: "screen:home", to: "screen:two", kind: "nav", label: "Next" } },
    { kind: "node", op: "upsert", data: { id: "screen:web", type: "screen", name: "Web home", data: { surface: "web" } } },
    { kind: "edge", op: "upsert", data: { from: "screen:home", to: "screen:web", kind: "nav", label: "across" } }] }, envOf());
  const a = await S.readScreens(envOf(), "alpha", null);
  const b = a.body;
  const home = b.screens.find((x) => x.id === "screen:home") || {};
  ok(a.status === 200 && b.surface === "mobile" && b.surfaces.map((x) => `${x.key}:${x.name}:${x.screens}`).join() === "mobile:Mobile app:2,web:web:1" && b.lanes.map((l) => `${l.key}:${l.name}`).join() === "start:Getting started"
    && home.renders.length === 1 && home.renders[0].style === "app" && home.states.join() === "default" && b.edges.length === 1 && b.edges[0].label === "Next" && b.styles.app === sha(".a{color:red}")
    && b.screens.find((x) => x.id === "screen:two").wireframe[0].label === "Two",
    "H: readScreens answers the view's shape: the surfaces (a node's name, a surface named by screens alone), the lanes, the screens with renders, states and wireframe, the nav edges within the surface, the styles", show(b));
  const web = await S.readScreens(envOf(), "alpha", "web"), none = await S.readScreens(envOf(), "alpha", "tv"), empty = await S.readScreens(envOf("beta"), "gamma", null);
  ok(web.body.screens.length === 1 && web.body.edges.length === 0 && none.status === 404 && none.body.error === "unknown_surface" && empty.status === 200 && empty.body.screens.length === 0 && /\bpreview\b/.test(empty.body.note),
    "H: another surface by its key; an unknown surface 404s naming the surfaces; a project with no screen answers empty with the op that files one");
  const plan = (sql, ...a) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...a).map((r) => r.detail).join(" | ");
  const p1 = plan(S.SCREENS_OF_SQL, "alpha", "mobile"), p2 = plan(S.SCREENS_COUNTS_SQL, "alpha"), p3 = plan(S.SCREENS_EDGES_SQL(2), "alpha", "a", "b"), p4 = plan(S.SCREENS_RENDERS_SQL(2), "alpha", "a", "b"), p5 = plan(S.RENDER_BODY_SQL, "alpha", "h", null);
  ok(!aggExact(), "H: k_screen_renders still exact after the screens read's writes");
  // D1b item 20: a second arm reads the screens naming the surface in a LIST, off migrate-057's partial index (only those
  // screens); its json_each scans one row's own list, never a table
  ok(/SEARCH n USING INDEX idx_k_nodes_screen_surface \(project=\? AND <expr>=\?\)/.test(p1) && /SEARCH n USING INDEX idx_k_nodes_screen_multi \(project=\?\)/.test(p1) && /SEARCH l USING INDEX sqlite_autoindex_k_node_lights_1/.test(p1) && !/SCAN (?!json_each)/.test(p1),
    `H: one surface's screens: idx_k_nodes_screen_surface (migrate-046), the list screens off idx_k_nodes_screen_multi (migrate-057), each light a primary-key probe: ${p1}`);
  ok(/USING (COVERING )?INDEX idx_k_nodes_screen_surface \(project=\?\)/.test(p2) && !/SCAN k_nodes/.test(p2), `H: the screens per surface: the partial index only, never the model: ${p2}`);
  ok(/SEARCH e USING INDEX sqlite_autoindex_k_edges_1 \(project=\? AND from_id=\?\)/.test(p3) && /SEARCH k_screen_renders USING INDEX sqlite_autoindex_k_screen_renders_1 \(project=\? AND screen=\?\)/.test(p4) && /SEARCH r USING INDEX idx_k_renders_hash/.test(p5),
    `H: the edges by the screens' ids, their render index ONE row a screen (k_screen_renders), the body route by hash: ${p3} · ${p4} · ${p5}`);
}

// ================= I. M6 · a screen's takes =================
{
  const frame = (screen, state, variant) => db.prepare("SELECT format, take, hash FROM k_screen_takes WHERE project='alpha' AND screen=? AND state=? AND variant=? ORDER BY rowid").all(screen, state, variant);
  const hashes = frame("screen:home", "default", "live").map((t) => t.hash);
  ok(JSON.stringify(hashes) === JSON.stringify([sha(CLEAN), sha("<div>Home 2</div>"), sha("<div>Home 3</div>"), sha("<div>Home 2</div>")]),
    "I: every body the frame held is a take, in order (the same body again and a field-only change appended none; the version restore appended the restored one)", show(frame("screen:home", "default", "live")));
  const p0 = puts, t0 = ledger();
  const back = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:home", state: "default", variant: "live", hash: sha(CLEAN) } }] }, envOf());
  const row = db.prepare("SELECT format, hash, bytes, style FROM k_renders WHERE project='alpha' AND screen='screen:home' AND state='default'").get();
  const tk = frame("screen:home", "default", "live");
  ok(!back.error && back.written === 1 && back.blobs === 0 && puts === p0 && ledger() === t0 + 1 && row.hash === sha(CLEAN) && row.bytes === CLEAN.length && row.style === "app" && tk.length === 5 && tk[4].take === 5 && tk[4].hash === sha(CLEAN),
    "I: a restore (a take's hash, no body) puts nothing, makes the take the frame's newest again (take 5) with its size and style, and files ONE ledger row", show({ back, row }));
  const same = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:home", state: "default", variant: "live", hash: sha(CLEAN) } }] }, envOf());
  ok(!same.error && same.written === 0 && same.unchanged === 1 && ledger() === t0 + 1, "I: restoring the frame's current body writes nothing", show(same));
  // a format switch: an image take restored onto a frame that is html now takes the picture's format and size, and no style
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAGX8C/V8+/0LAAAAAElFTkSuQmCC";
  const pic = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:two", variant: "pic", format: "image", body: PNG } }] }, envOf());
  const picHash = db.prepare("SELECT hash FROM k_renders WHERE project='alpha' AND screen='screen:two' AND variant='pic'").get().hash;
  await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:two", variant: "pic", format: "html", body: "<p>now html</p>", style: "app", width: 390 } }] }, envOf());
  const sw = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:two", variant: "pic", hash: picHash } }] }, envOf());
  const prow = db.prepare("SELECT format, hash, style, width, height FROM k_renders WHERE project='alpha' AND screen='screen:two' AND variant='pic'").get();
  const wrong = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:two", variant: "pic", format: "html", hash: sha("<p>now html</p>") } }] }, envOf());
  ok(!pic.error && !sw.error && sw.written === 1 && prow.format === "image" && prow.hash === picHash && prow.style === null && prow.width === 2 && prow.height === 2 && !wrong.error && wrong.written === 1,
    "I: an image take restored onto a frame that is html now: the picture's format and size, no style; an html take back with its format named", show({ sw, prow, wrong }));
  const t2 = ledger();
  const none = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:home", state: "default", variant: "live", hash: sha("never filed") } }] }, envOf());
  const theirs = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:home", state: "default", variant: "live", hash: sha("a-own") } }] }, envOf());
  ok(none.error === "invalid_ops" && none.errors[0].error === "unknown_render" && theirs.error === "invalid_ops" && theirs.errors[0].error === "unknown_render" && ledger() === t2,
    "I: a hash no take of this project holds is refused unknown_render: one never filed, and one another project (beta) holds", show([none.errors, theirs.errors]));
  db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)").run("p-pa", "Pat", "pat@example.test", "partner", sha("pat"), T0);
  db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-pa','alpha','partner',?)").run(T0);
  const PAT = { id: "p-pa", name: "Pat", role: "partner" };
  const pat = await writeKnowledge(PAT, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:home", state: "default", variant: "live", hash: sha("<div>Home 3</div>") } }] }, envOf());
  const press = await S.restoreAnswer(envOf(), PAT, { project: "alpha", screen: "screen:home", state: "default", variant: "live", hash: sha("<div>Home 3</div>") }, { press: true });
  ok(pat.error === "invalid_ops" && pat.errors[0].error === "partner_refused" && press.http === 403 && press.error === "partner_refused" && ledger() === t2, "I: a Partner is refused partner_refused (the door's plan, and the press before anything is read)", show([pat, press]));
  // the press: a script is answered the preview and nothing is written; confirm (or a browser's press) files
  const pv = await S.restoreAnswer(envOf(), OWNER, { project: "alpha", screen: "screen:home", state: "default", variant: "live", hash: sha("<div>Home 3</div>") });
  const t1 = ledger();
  const go = await S.restoreAnswer(envOf(), OWNER, { project: "alpha", screen: "screen:home", state: "default", variant: "live", hash: sha("<div>Home 3</div>"), confirm: true }, { via: "map" });
  const miss = await S.restoreAnswer(envOf(), OWNER, { project: "alpha", screen: "screen:home", state: "default", variant: "live", hash: sha("never filed"), confirm: true });
  ok(pv.http === 200 && pv.preview === true && t1 === t2 && go.http === 200 && go.written === 1 && ledger() === t1 + 1 && db.prepare("SELECT via FROM transmission WHERE id = ?").get(go.ledger).via === "map"
    && db.prepare("SELECT hash FROM k_renders WHERE project='alpha' AND screen='screen:home' AND state='default'").get().hash === sha("<div>Home 3</div>") && miss.http === 404 && miss.error === "unknown_render",
    "I: the Restore press: a script's first call is the preview (nothing written), confirm files ONE ledger row; an unknown hash 404 unknown_render", show([pv, go, miss]));
  // the strip: ONE statement, newest first, the current take marked once (an older take of the same body is held, not current)
  const list = await S.screenTakes(envOf(), "alpha", "screen:home");
  ok(list.length === S.TAKES_MAX && list[0].current && list[0].hash === sha("<div>Home 3</div>") && list[0].take === 6 && list.slice(1).every((t) => !t.current) && list[0].by.name === "Owen Park"
    && list.find((t) => t.take === 3).held && !list.find((t) => t.take === 5).held && list[0].styleHash === sha(".a{color:red}"),
    "I: screenTakes: the last 6 takes newest first, who filed each, the current one marked once, an older take of the current body held", show(list.map((t) => [t.take, t.current, t.held])));
  // the body route serves a previous take (its hash is in no render now)
  const req = new Request(`https://org.example/render/${sha(CLEAN)}?project=alpha`, { headers: { authorization: "Bearer owner-key" } });
  const prev = await S.serveRender(req, envOf(), new URL(`https://org.example/render/${sha(CLEAN)}?project=alpha`), `/render/${sha(CLEAN)}`);
  ok(prev.status === 200 && (await prev.text()).includes(CLEAN), `I: GET /render/:hash serves a previous take (${prev.status})`);
  const plan = (sql, ...a) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...a).map((r) => r.detail).join(" | ");
  const W2 = await imp("src/knowledge/write.js");
  const q1 = plan(S.SCREEN_TAKES_SQL, "alpha", "screen:home"), q2 = plan(W2.TAKES_OF_SQL, "alpha", "[]"), q3 = plan(S.RENDER_BODY_SQL, "alpha", "h", null);
  ok(/SEARCH t USING INDEX idx_k_screen_takes_screen \(project=\? AND screen=\?\)/.test(q1) && !/TEMP B-TREE|SCAN t/.test(q1) && /USING INDEX idx_k_screen_takes_hash \(project=\? AND hash=\?\)/.test(q2)
    && /SEARCH t USING INDEX idx_k_screen_takes_hash/.test(q3), `I: the strip, the restore's take and the body route each SEARCH their index: ${q1} · ${q2} · ${q3}`);
  // sprint-4 review, L1: the guard compares against the frame's LAST APPENDED take (rowid), never the newest by filed_at —
  // a version restore re-files the render DATED IN THE PAST (its snapshotted updated_at), so by filed_at a later restore of
  // the take that was current before the version restore compared against itself and appended nothing
  const LA = "<div>L1 a</div>", LB = "<div>L1 b</div>";
  await writeKnowledge(OWNER, { project: "alpha", ops: [screen("screen:l1"), { kind: "render", op: "upsert", data: { screen: "screen:l1", body: LA, format: "html" } }] }, envOf());
  await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:l1", body: LB, format: "html" } }] }, envOf());
  // the version restore's write, as versions.js makes it: the row deleted and re-inserted with its snapshotted dates (T0)
  db.prepare("DELETE FROM k_renders WHERE project='alpha' AND screen='screen:l1'").run();
  db.prepare("INSERT INTO k_renders (project, screen, state, variant, format, hash, bytes, created_by, created_at, updated_by, updated_at) VALUES ('alpha','screen:l1','','','html',?,?, 'p-o', ?, 'p-o', ?)")
    .run(sha(LA), LA.length, T0, T0);
  const l1r = await writeKnowledge(OWNER, { project: "alpha", ops: [{ kind: "render", op: "upsert", data: { screen: "screen:l1", hash: sha(LB) } }] }, envOf());
  ok(!l1r.error && l1r.written === 1 && JSON.stringify(frame("screen:l1", "", "").map((t) => [t.take, t.hash])) === JSON.stringify([[1, sha(LA)], [2, sha(LB)], [3, sha(LA)], [4, sha(LB)]]),
    "I: after a version restore dated in the past, a person's restore of the take that was current before it still appends (the guard reads the last APPENDED take)", show(frame("screen:l1", "", "")));
}

// sprint 3 S3b: an image render's size is the picture's own (its header), never the declared one
{
  const png = readFileSync(join(ENGINE, "tools", "walk", "fixtures", "screenshot-pricing.png"));
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);   // 600 x 300
  const riff = (four, body) => Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), ...Buffer.from(four), body.length, 0, 0, 0, ...body]);
  const vp8x = riff("VP8X", [0, 0, 0, 0, 0x7f, 0x02, 0x00, 0xef, 0x00, 0x00]);   // 640 x 240
  const vp8l = riff("VP8L", [0x2f, 0x3f, 0xc0, 0x3b, 0x00, 0, 0, 0, 0, 0]);   // 64 x 240: (w-1)=63, (h-1)=239 packed in 14 bits each
  const ok1 = (x, w, h) => x && x.width === w && x.height === h;
  ok(ok1(R.imageSize(png, "image/png"), 240, 150) && ok1(R.imageSize(jpeg, "image/jpeg"), 600, 300) && ok1(R.imageSize(vp8x, "image/webp"), 640, 240) && ok1(R.imageSize(vp8l, "image/webp"), 64, 240),
    `S3b: imageSize reads png ${JSON.stringify(R.imageSize(png, "image/png"))}, jpeg ${JSON.stringify(R.imageSize(jpeg, "image/jpeg"))}, webp VP8X ${JSON.stringify(R.imageSize(vp8x, "image/webp"))} and VP8L ${JSON.stringify(R.imageSize(vp8l, "image/webp"))} from their headers`);
  ok(R.imageSize(Uint8Array.from([0x89, 0x50]), "image/png") === null && R.imageSize(jpeg.slice(0, 12), "image/jpeg") === null, "S3b: a header that does not say gives no size (never a guess)");
  const { planKnowledge } = await imp("src/knowledge/schema.js");
  const stored = { node: new Map([["screen:pricing", { id: "screen:pricing", type: "screen", name: "Pricing" }]]) };
  const op = (extra) => [{ kind: "render", op: "upsert", data: { screen: "screen:pricing", format: "image", body: png.toString("base64"), ...extra } }];
  const lied = planKnowledge(op({ width: 1, height: 1 }), stored, { isOwner: true }), none = planKnowledge(op({}), stored, { isOwner: true });
  const rowOf = (p) => (p.steps || []).find((x) => x.kind === "render") || {};
  const rl = rowOf(lied).row || rowOf(lied).data || {}, rn = rowOf(none).row || rowOf(none).data || {};
  ok(!lied.errors.length && rl.width === 240 && rl.height === 150 && rn.width === 240 && rn.height === 150,
    `S3b: a declared 1 x 1 on a 240 x 150 picture files as 240 x 150 (${rl.width} x ${rl.height}); an undeclared size is filled in (${rn.width} x ${rn.height})`);
}

console.log(`${fails ? "✗" : "✓"} render selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
