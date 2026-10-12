// tools/release-note.mjs — D5: the release note of the door's one vocabulary, written from tools/names.json (the ONE source:
// the vocabulary check, the authority table, the smoke's s25-names and this note all read it) and the generated contract
// (contracts/door.json: the tool list, its titles and annotations). Nothing in the note is typed twice.
//   node tools/release-note.mjs [--out <file>]     (default: .runs/d5/RELEASE-NOTE.md)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg("--out", new URL("../.runs/d5/RELEASE-NOTE.md", import.meta.url).pathname);
const N = JSON.parse(readFileSync(new URL("./names.json", import.meta.url), "utf8"));
const door = JSON.parse(readFileSync(new URL("../../contracts/door.json", import.meta.url), "utf8"));
const code = (s) => "`" + s + "`";
const by = (v) => N.tools.filter((t) => t.verdict === v);
const oldCount = new Set(N.tools.map((t) => t.old)).size, newCount = door.tools.length;
// the first calls: src/controlpage.js FIRST_CALLS (the list Control · Connect shows and the first-run guide numbers)
const first = JSON.parse((/export const FIRST_CALLS = (\[[^\]]*\])/.exec(readFileSync(new URL("../src/controlpage.js", import.meta.url), "utf8")) || [, "[]"])[1]);
if (!first.length) { console.error("✗ src/controlpage.js FIRST_CALLS not found"); process.exit(1); }

const L = [];
L.push("# sharingu: the door speaks one vocabulary", "");
L.push(`The MCP door's tools are renamed and folded **at once**: ${oldCount} tools become ${newCount}. There is no alias and no redirect: an old tool name answers \`unknown tool\`, an old REST address answers 404, an old resource is not found. A client re-reads \`tools/list\` and calls the new names.`, "");
L.push(`The first time, in order: ${first.map(code).join(" → ")}. Every session: ${code("updates")} first; ${code("ask")} asks the owner; ${code("wrap_up")} hands over at the end.`, "");
L.push(`Writing is one door: ${code("preview")} (files nothing, shows what would be filed, where it shows, how it is graded, what it reaches) then ${code("file")} (the same items, by the preview's id). Knowledge, contributions, grades and answers all go through it.`, "");

L.push("## The tools", "", "| tool | title | read-only | what it does |", "|---|---|---|---|");
for (const t of [...door.tools].sort((a, b) => a.name.localeCompare(b.name))) L.push(`| ${code(t.name)} | ${t.title} | ${t.annotations.readOnlyHint ? "yes" : "no"} | ${String(t.description).split(/(?<=\.)\s/)[0]} |`);
L.push("");

L.push("## Renamed", "", "| was | is now | how |", "|---|---|---|");
for (const t of by("renamed")) L.push(`| ${code(t.old)} | ${code(t.new)} | ${t.how || ""} |`);
L.push("");
L.push("## Folded into another tool", "", "| was | is now | how |", "|---|---|---|");
for (const t of by("folds")) L.push(`| ${code(t.old)} | ${code(t.new)} | ${t.how || ""} |`);
L.push("");
L.push("## Gone", "", "| was | why |", "|---|---|");
for (const t of by("goes")) L.push(`| ${code(t.old)} | ${t.why || ""}${t.new ? ` (the need: ${code(t.new)})` : ""} |`);
for (const t of by("rest-only")) L.push(`| ${code(t.old)} | no tool: ${t.why || t.how || "its REST door stays for its button"} |`);
L.push("");
const same = by("same").map((t) => code(t.old));
L.push(`Unchanged names (${same.length}): ${same.join(", ")}.`, "");

L.push("## REST addresses", "", "A row not listed keeps its address.", "", "| was | is now | verdict |", "|---|---|---|");
for (const r of N.rest) L.push(`| ${code(r.old)} | ${r.new ? code(r.new) : "—"} | ${r.verdict}${r.why ? `: ${r.why}` : r.how ? `: ${r.how}` : ""} |`);
L.push("");
L.push("## Resources", "", "| was | is now | |", "|---|---|---|");
for (const r of N.resources) L.push(`| ${code(r.old)} | ${r.new ? code(r.new) : "—"} | ${r.verdict}${r.why ? `: ${r.why}` : ""} |`);
L.push("");
L.push("## Fields and refusal codes in the answers", "", "| where | was | is now |", "|---|---|---|");
for (const f of N.fields || []) L.push(`| ${f.where} | ${f.old} | ${f.new} |`);
for (const e of N.errors) L.push(`| a refusal code | ${code(e.old)} | ${code(e.new)} |`);
L.push("");

L.push("## Titles and annotations", "");
L.push("Every tool carries a `title` and the four MCP annotations. The rule: `readOnlyHint` is true when the tool neither writes nor stores a row (a read-only tool is idempotent and never destructive); `destructiveHint` is true when a write can replace or remove what is there; `idempotentHint` when the same call again changes nothing more; `openWorldHint` only where a call reaches outside the org's own store (`wrap_up` may open a GitHub issue). A read-only tool, called, writes no row (tools/annotations-selftest.mjs).", "");
const ro = door.tools.filter((t) => t.annotations.readOnlyHint).map((t) => code(t.name)), wr = door.tools.filter((t) => !t.annotations.readOnlyHint);
L.push(`Read-only (${ro.length}): ${ro.join(", ")}.`, "");
L.push(`Writes (${wr.length}): ${wr.map((t) => `${code(t.name)}${t.annotations.destructiveHint ? " (destructive)" : ""}${t.annotations.idempotentHint ? " (idempotent)" : ""}${t.annotations.openWorldHint ? " (open world)" : ""}`).join(", ")}.`, "");
L.push("`GET /capabilities` serves the inventory generated from the contract: every tool and route, read or write, who may call it, and whether you may.", "");

L.push("## Words", "");
L.push(`Retired on every face (the vocabulary check bans them): ${N.words.banned.map(code).join(", ")}. The words: ${N.words.the}.`, "");
L.push(`Kept: ${N.keep.addresses}`, "");
L.push(`Internal, not renamed: ${N.keep.internal}`, "");

L.push("## What a client changes", "");
L.push("1. Re-read `tools/list` (or `GET /capabilities`); drop any cached tool list.");
L.push("2. Replace every old name in prompts, skills and scripts with the table above; a write is `preview` then `file`.");
L.push("3. Read the renamed fields (`items`/`piece` on `missing`, `openItems`, `openItemIds`); a role's brief is `brief`, refused `unknown_brief`.");
L.push("4. Links to old REST addresses (`/transmission/...`, `/pack/card/...`, `/holes`) now 404: use the new addresses.", "");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, L.join("\n"));
console.log(`✓ ${out}: ${L.length} lines (${oldCount} -> ${newCount} tools, ${N.rest.length} REST rows, ${N.resources.length} resources, ${(N.fields || []).length} fields, ${N.errors.length} codes)`);
