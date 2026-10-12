// tools/presets-selftest.mjs — the starter Broadcast built into the product (sprint 2; src/presets/*.md, bundled by
// tools/make-presets.mjs into src/presetdata.js, read by src/starter.js). Offline, no worker. Exit 1 on any failure.
//   1. every file parses (front matter + body), src/presetdata.js is exactly what the files make (make-presets --check)
//   2. the ruled pack: six agents (product spec, UX design, frontend, backend and API, QA verify, release), three workflows
//      (build a web app, build a mobile app, fix a bug), ten skills (file a contribution, grade a check, ask the owner,
//      sprint 3 B2's file with a preview and B3's fill a project, sprint 4 M7's draw the architecture and file the screens,
//      sprint 12 12.4's fill the product side, fill the GTM side and the weekly review)
//   3. every slug unique and valid (src/transmission.js ITEM_SLUG), every kind one of ITEM_KINDS, orders 1..19 unique,
//      versions whole numbers from 1
//   4. every call a file names is a tool of contracts/door.json; the body names exactly the tools its front matter lists;
//      every field a written call sends (`tool {field, field: value}`) is one the tool's own registry row takes
//      (src/index.js MCP_TOOLS, read off its source)
//   5. an agent tells its AI what to read first (whoami, updates, missing); a workflow's every numbered step ends in a
//      filed contribution (a call, or the ruling); a skill carries at least one exact call; a guided first fill (M7)
//      (and 12.4's two fills) keeps the privacy rule, files what its source does not decide as a question, and previews
//      before it files
//   6. voice and scope: no em dash, no org fact (another org's or a person's name), no owner-only tool offered without
//      saying so; every body draws through the md() the starter page uses
//   7. src/starter.js: starterShelf's states and reasons; presetSlugOf / presetVersionOf read what the equip door writes
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readPresets, presetDataOf, PRESET_OUT } from "./make-presets.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(ENGINE);
const { ITEM_KINDS, ITEM_SLUG } = await import(join(ENGINE, "src", "transmission.js"));
const { md } = await import(join(ENGINE, "src", "markdown.js"));
const starter = await import(join(ENGINE, "src", "starter.js"));
const { KNOWLEDGE_FIELDS_DOC, KNOWLEDGE_KINDS, MAX_OPS } = await import(join(ENGINE, "src", "knowledge", "schema.js"));

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };

// 1 · parse and freshness
let items = [];
try { items = readPresets(); ok(items.length > 0, `every file under src/presets parses (${items.length} items)`); }
catch (e) { ok(false, `a preset file does not parse: ${e.message}`); }
ok(readFileSync(PRESET_OUT, "utf8") === presetDataOf(items), "src/presetdata.js is exactly what the files make (node tools/make-presets.mjs --check)");
const { PRESETS } = await import(join(ENGINE, "src", "presetdata.js"));
ok(JSON.stringify(PRESETS.map((p) => p.slug)) === JSON.stringify(items.map((p) => p.slug)) && PRESETS.every((p) => p.body && p.calls.length), "the bundled module carries every item, its body and its calls");

// 2 · the ruled pack
const RULED = {
  agent: ["product-spec", "ux-design", "frontend", "backend-api", "qa-verify", "release"],
  workflow: ["build-web-app", "build-mobile-app", "fix-a-bug"],
  skill: ["file-a-contribution", "grade-a-check", "ask-the-owner", "file-with-a-preview", "fill-a-project", "draw-the-architecture", "file-the-screens",
    "fill-the-product-side", "fill-the-gtm-side", "weekly-review"],   // sprint 3 B2 added the fourth, B3 the fifth; sprint 4 M7 the next two; sprint 12 12.4 the last three
};
for (const [kind, slugs] of Object.entries(RULED))
  ok(JSON.stringify(items.filter((p) => p.kind === kind).map((p) => p.slug)) === JSON.stringify(slugs), `the ${kind}s are the ruled ${slugs.length}: ${slugs.join(", ")}`);
ok(items.length === 19, `nineteen items in all (${items.length})`);

// 3 · slugs, kinds, orders, versions
const slugs = items.map((p) => p.slug);
ok(new Set(slugs).size === slugs.length, "every slug is unique");
ok(items.every((p) => ITEM_SLUG.test("item/" + p.slug)), "every slug is a valid item slug ([a-z0-9-]{2,40})");
ok(items.every((p) => ITEM_KINDS.includes(p.kind)), `every kind is one of ${ITEM_KINDS.join(", ")}`);
ok(JSON.stringify(items.map((p) => p.order)) === JSON.stringify(items.map((_, i) => i + 1)), "orders run 1..19, unique, in shelf order");
ok(items.every((p) => Number.isInteger(p.version) && p.version >= 1), "every version is a whole number from 1");
ok(items.every((p) => p.title.length <= 40 && p.purpose.length >= 40 && p.purpose.length <= 140 && /\.$/.test(p.purpose)), "every title is short and every purpose one line (40 to 140 characters, a full stop)");

// 4 · the calls: real tools, named in the body, with the fields each tool takes
const door = JSON.parse(readFileSync(join(REPO, "contracts", "door.json"), "utf8"));
const TOOLS = new Set(door.tools.map((t) => t.name));
const src = readFileSync(join(ENGINE, "src", "index.js"), "utf8");
const a = src.indexOf("const MCP_TOOLS = ["), b = src.indexOf("\n];", a);
// the registry literal evaluated with the constants it names (a name it gains later reads as an empty list: only the
// schemas' property NAMES matter here)
const REG = (() => {
  const known = { PROJECT_RULE: "p", READ_PROJECT_RULE: "p", MAX_OPS, KNOWLEDGE_FIELDS_DOC, KNOWLEDGE_KINDS };
  const lit = "return " + src.slice(a + "const MCP_TOOLS = ".length, b + 2) + ";";
  for (let i = 0; i < 20; i++) {
    try { return new Function(...Object.keys(known), lit)(...Object.values(known)); }
    catch (e) { const m = /^(\w+) is not defined$/.exec(String(e && e.message)); if (!m || !(e instanceof ReferenceError)) throw e; known[m[1]] = []; }
  }
  throw new Error("the MCP_TOOLS literal names too many outside constants");
})();
const PROPS = new Map(REG.map((t) => [t.name, new Set(Object.keys((t.schema && t.schema.properties) || {}))]));
ok(PROPS.size === TOOLS.size && [...TOOLS].every((t) => PROPS.has(t)), `the registry read off src/index.js is the contract's (${PROPS.size} tools)`);
const named = (body) => new Set([...body.matchAll(/`([a-z][a-z_]*[a-z])(?=[ `]|\s*\{)/g)].map((m) => m[1]).filter((x) => TOOLS.has(x)));
// topKeys("{a, b: 1, c: {x}}") -> ["a", "b", "c"]: the call's own fields, nested objects and lists skipped
function topKeys(obj) {
  const inner = obj.trim().replace(/^\{/, "").replace(/\}$/, "");
  const parts = []; let depth = 0, q = null, cur = "";
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if ("{[(".includes(ch)) depth++;
    if ("}])".includes(ch)) depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p && p !== "..." && !p.startsWith("...")).map((p) => p.split(":")[0].trim());
}
const badCalls = [], badFields = [], mismatch = [];
for (const p of items) {
  for (const c of p.calls) if (!TOOLS.has(c)) badCalls.push(`${p.slug}: ${c}`);
  const n = named(p.body), listed = new Set(p.calls);
  const extra = [...n].filter((x) => !listed.has(x)), unused = [...listed].filter((x) => !n.has(x));
  if (extra.length || unused.length) mismatch.push(`${p.slug}: body names [${extra.join(" ")}] not listed, lists [${unused.join(" ")}] never named`);
  for (const m of p.body.matchAll(/`([a-z_]+) (\{[^`]*\})`/g)) {
    const [, tool, obj] = m;
    if (!PROPS.has(tool)) { badCalls.push(`${p.slug}: \`${tool} {..}\``); continue; }
    for (const k of topKeys(obj)) if (!PROPS.get(tool).has(k)) badFields.push(`${p.slug}: ${tool} takes no "${k}"`);
  }
}
ok(!badCalls.length, `every call names a tool of contracts/door.json${badCalls.length ? `: ${badCalls.join("; ")}` : ""}`);
ok(!mismatch.length, `each body names exactly the tools its front matter lists${mismatch.length ? `: ${mismatch.join("; ")}` : ""}`);
ok(!badFields.length, `every field a written call sends is one its tool takes${badFields.length ? `: ${badFields.slice(0, 8).join("; ")}` : ""}`);
// both ways: the field check and the tool check go red on a wrong field and an invented tool
const probe = (body) => { const bad = []; for (const m of body.matchAll(/`([a-z_]+) (\{[^`]*\})`/g)) { if (!PROPS.has(m[1])) { bad.push(m[1]); continue; } for (const k of topKeys(m[2])) if (!PROPS.get(m[1]).has(k)) bad.push(`${m[1]}.${k}`); } return bad; };
ok(JSON.stringify(probe('`preview {project, items, goal_ref: "x"}` and `equip_item {slug}` and `submit_grade {checkId, verdict: "proven", proof}`')) === JSON.stringify(["preview.goal_ref", "equip_item"]),
  "both ways: a field a tool does not take and a tool that does not exist go red; a right call stays green");
const callsWritten = items.reduce((n, p) => n + [...p.body.matchAll(/`([a-z_]+) (\{[^`]*\})`/g)].length, 0);
ok(callsWritten >= 80, `the pack writes its calls out in full (${callsWritten} calls with their fields)`);

// 5 · the shape of each kind
for (const p of items.filter((x) => x.kind === "agent")) {
  const first = (p.body.split(/^## /m).find((s) => /^Start every session/.test(s)) || "");
  ok(["whoami", "updates", "missing"].every((t) => first.includes("`" + t + "`")) && /^## Close the session/m.test(p.body) && p.body.includes("wrap_up"),
    `agent ${p.slug}: starts with whoami, updates and missing, and closes with wrap_up`);
  ok(/^## What you file/m.test(p.body) && /`(preview|submit_grade) \{/.test(p.body), `agent ${p.slug}: says what it files, with the exact call`);
}
for (const p of items.filter((x) => x.kind === "workflow")) {
  const steps = (p.body.split(/^## The steps/m)[1] || "").split(/^## /m)[0].split(/\n(?=\d+\. )/).filter((s) => /^\d+\. /.test(s.trim()));
  ok(steps.length >= 5 && steps.every((s) => /\*\*[^*]+\*\* \(([^)]+)\)/.test(s) && (/`[a-z_]+ \{/.test(s) || /Files: the ruling/.test(s))),
    `workflow ${p.slug}: ${steps.length} numbered steps, each naming the role that takes it and ending in a filed contribution`);
}
for (const p of items.filter((x) => x.kind === "skill"))
  ok(/^## The procedure/m.test(p.body) && /`[a-z_]+ \{/.test(p.body), `skill ${p.slug}: a short procedure with the exact call`);
// sprint 4 M7, the guided first fills (and sprint 12 12.4's two): the privacy rule, what the source does not decide filed as a
// question, preview then file
for (const p of items.filter((x) => ["draw-the-architecture", "file-the-screens", "fill-the-product-side", "fill-the-gtm-side"].includes(x.slug))) {
  const b = p.body, iPrev = b.indexOf("`preview {"), iFile = b.indexOf("`file {");
  ok(/no credential/i.test(b) && /token/.test(b) && /email/.test(b) && /phone/.test(b) && /internal host/.test(b) && /machine path/.test(b)
    && /kind: "question"/.test(b) && iPrev > 0 && iFile > iPrev, `skill ${p.slug}: the privacy rule, a question for what the source does not decide, preview then file`);
}

// 6 · voice and scope
const ORG_FACTS = /\b(ryuk|ryuklabs|siru|saruspay|bunny|veil|northwind|agent r\b|batcave)\b/i;
ok(items.every((p) => !/[—–]/.test(p.body + p.title + p.purpose)), "no em dash or en dash in any item");
ok(items.every((p) => !ORG_FACTS.test(p.body + p.title + p.purpose)), "no org fact: no other org's, project's or person's name in any item");
const OWNER_ONLY = new Set(REG.filter((t) => t.owner).map((t) => t.name));
const ownerUse = items.flatMap((p) => p.calls.filter((c) => OWNER_ONLY.has(c)).filter((c) => !new RegExp(`owner[^.]{0,80}\`${c}`, "i").test(p.body) && !new RegExp(`\`${c}[^.]{0,40}by\\s+the owner`, "i").test(p.body)).map((c) => `${p.slug}: ${c}`));
ok(!ownerUse.length, `an owner-only tool is offered only as the owner's (${[...OWNER_ONLY].filter((t) => items.some((p) => p.calls.includes(t))).join(", ") || "none used"})${ownerUse.length ? `: ${ownerUse.join("; ")}` : ""}`);
ok(items.every((p) => { const h = md(p.body); return /<h1>/.test(h) && /<code>/.test(h) && !/<script/i.test(h); }), "every body draws through md(): a heading, its calls as code, nothing executable");

// 7 · src/starter.js
const sh = (h, ctx) => starter.starterShelf(new Map(h), ctx);
const none = sh([], { key: "p", pname: "P", seated: true });
const held = sh([["frontend", { v: starter.presetOf("frontend").version, by: "A", at: "2026-10-01T00:00:00Z", id: "T-1" }]], { key: "p", pname: "P", seated: true });
const old = sh([["frontend", { v: 0, by: "A", at: "x", id: "T-1" }]], { key: "p", pname: "P", seated: true });
const part = sh([], { key: "p", pname: "P", seated: true, partner: true });
const unseat = sh([], { key: "p", pname: "P", seated: false });
const f = (list) => list.find((c) => c.slug === "frontend");
ok(none.length === 19 && none.every((c) => c.can.equip && c.here.state === "none" && c.equipSlug === "preset:" + c.slug && c.href === "/broadcast/starter/" + c.slug), "starterShelf: nineteen cards, each equippable by a seated reader, on its preset: slug");
ok(f(held).here.state === "current" && f(held).here.doc === "starter/frontend.md" && f(held).here.href === "/contribution/T-1" && !f(held).can.equip && /newest/.test(f(held).can.reason),
  "starterShelf: an equipped item is current, names its copy and its filing, and offers no second Equip");
ok(f(old).here.state === "update" && f(old).can.update && !f(old).can.equip, "starterShelf: an older version is an update the project chooses");
ok(part.every((c) => !c.can.equip && c.can.reason === starter.PARTNER_EQUIP_REASON) && unseat.every((c) => !c.can.equip && /no seat/.test(c.can.reason)), "starterShelf: a Partner and a reader with no seat are refused with their reasons");
ok(starter.presetSlugOf("preset/frontend") === "frontend" && starter.presetSlugOf("item/frontend") === null && starter.presetVersionOf(starter.presetSource("frontend", 3)) === 3
  && starter.presetVersionOf("preset:frontend") === null && starter.presetRef("qa-verify") === "preset/qa-verify", "presetSlugOf / presetVersionOf read exactly what the equip door writes (gapRef preset/<slug>, proof preset:<slug>@v<n>)");

console.log(`presets-selftest: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
