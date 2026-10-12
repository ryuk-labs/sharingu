// tools/names-check.mjs — BETA gate line 6 (honest docs), its D5 half: docs/INSTALL.md, Control · Connect and the built-in
// start-here guide name ONLY the new tool names (tools/names.json), and each names the first calls (src/controlpage.js
// FIRST_CALLS). Read-only: one GET /control on the org named; the file from the repo; the built-in guide from src/starthere.js
// (startHereText: what `read` {ref: "doc/start-here.md"} answers in a project that files no guide of its own).
//   NAMES_URL=http://127.0.0.1:<port> NAMES_KEY=<owner key> node tools/names-check.mjs [--json <file>]
// The key is read from the environment and never printed. Exit 1 when any face names an old name or misses a first call.
import { readFileSync, writeFileSync } from "node:fs";

const URL_ = String(process.env.NAMES_URL || "").replace(/\/+$/, ""), KEY = process.env.NAMES_KEY || "";
if (!URL_ || !KEY) { console.error("usage: NAMES_URL=<org url> NAMES_KEY=<owner key> node tools/names-check.mjs [--json <file>]"); process.exit(2); }
const N = JSON.parse(readFileSync(new URL("./names.json", import.meta.url), "utf8"));
const FIRST = JSON.parse((/export const FIRST_CALLS = (\[[^\]]*\])/.exec(readFileSync(new URL("../src/controlpage.js", import.meta.url), "utf8")) || [, "[]"])[1]);
// an old name: every renamed or folded tool; a snake name anywhere, a one-word name only as a call (in backticks or <code>)
const olds = [...new Set(N.tools.filter((t) => t.old !== t.new).map((t) => t.old))];
const snake = olds.filter((n) => n.includes("_")), word = olds.filter((n) => !n.includes("_"));
const oldIn = (text) => {
  const t = String(text || "").replace(/&quot;/g, '"').replace(/&#96;|&#x60;/g, "`");
  const hits = new Set();
  for (const n of snake) if (new RegExp(`\\b${n}\\b`).test(t)) hits.add(n);
  for (const n of word) if (new RegExp(`(\`${n}\`|<code>${n}</code>|"name":\\s*"${n}")`).test(t)) hits.add(n);
  return [...hits];
};
const named = (text) => FIRST.filter((n) => !new RegExp(`(\`${n}\`|<code>${n}</code>|\\b${n}\\b)`).test(String(text || "")));
const get = async (path, accept) => { const r = await fetch(URL_ + path, { headers: { authorization: "Bearer " + KEY, accept } }); return { status: r.status, text: await r.text() }; };

const control = await get("/control", "text/html");
const { startHereText } = await import("../src/starthere.js");
const shBody = startHereText({ org: "Northwind", owner: "the owner" });
let install = ""; try { install = readFileSync(new URL("../../docs/INSTALL.md", import.meta.url), "utf8"); } catch { install = ""; }
const faces = [
  { face: "docs/INSTALL.md", ok: !!install, old: oldIn(install), missing: named(install) },
  { face: "Control · Connect (GET /control)", ok: control.status === 200, old: oldIn(control.text), missing: named(control.text) },
  { face: "the built-in start-here guide (src/starthere.js)", ok: !!shBody, old: oldIn(shBody), missing: named(shBody) },
];
let bad = 0;
for (const f of faces) {
  const good = f.ok && !f.old.length && !f.missing.length;
  if (!good) bad++;
  console.log(`  ${good ? "✓" : "✗"} ${f.face}: ${f.ok ? "" : "not read; "}old names ${f.old.length ? f.old.join(", ") : "none"}; first calls missing ${f.missing.length ? f.missing.join(", ") : "none"}`);
}
const i = process.argv.indexOf("--json");
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ firstCalls: FIRST, faces }, null, 2));
console.log(bad ? `✗ names: ${bad} face(s) name an old tool or miss a first call` : `✓ names: the three faces name only the new names and every first call (${FIRST.join(", ")})`);
process.exit(bad ? 1 : 0);
