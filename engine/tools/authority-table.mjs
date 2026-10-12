// tools/authority-table.mjs — D5: who may call each tool and each REST address, before and after a rename, diffed by
// tools/names.json. The authority of a tool is its class (the owner only > a writing credential > any reader) and whether
// the project rule scopes it; of a REST row, its auth (owner > bearer > reader > none). Every old name is set beside the
// new name it became (same, renamed or folded); a row whose new name lets MORE callers in, or drops the project scope, is
// WIDER and fails the run: a rename never widens authority. Narrower rows are printed (they are intended, or a finding).
//   node tools/authority-table.mjs --before <old door.json> [--after ../contracts/door.json] [--md <file>]
// The before file is the contract of the head the rename started from (git show <sha>:contracts/door.json).
import { readFileSync, writeFileSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const beforePath = arg("--before");
if (!beforePath) { console.error("usage: node tools/authority-table.mjs --before <old door.json> [--after <door.json>] [--md <file>]"); process.exit(2); }
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(arg("--after", new URL("../../contracts/door.json", import.meta.url)), "utf8"));
const NAMES = JSON.parse(readFileSync(new URL("./names.json", import.meta.url), "utf8"));

const TOOL_RANK = (t) => (t.owner ? 3 : t.write ? 2 : 1);
const TOOL_WHO = ["", "any reader", "a writing credential", "the owner only"];
const AUTH_RANK = { none: 0, reader: 1, bearer: 2, owner: 3 };
const tb = new Map(before.tools.map((t) => [t.name, t])), ta = new Map(after.tools.map((t) => [t.name, t]));
const rkey = (r) => `${r.method} ${r.path}`;
const rb = new Map(before.rest.map((r) => [rkey(r), r])), ra = new Map(after.rest.map((r) => [rkey(r), r]));
const rows = [];
let wider = 0;

// tools: every tool of the head, by names.json
const toolMap = new Map(NAMES.tools.map((t) => [t.old, t]));
for (const [name, b] of tb) {
  const m = toolMap.get(name);
  if (!m) { rows.push(["tool", name, "—", "UNMAPPED (not in names.json)", "", "WIDER?"]); wider++; continue; }
  const bw = `${TOOL_WHO[TOOL_RANK(b)]}${b.project ? ", project-scoped" : ""}`;
  if (!m.new || m.verdict === "goes" || m.verdict === "rest-only") { rows.push(["tool", name, bw, m.verdict === "rest-only" ? "(no tool; REST only)" : m.new ? `(gone; the need: ${m.new})` : "(gone)", m.verdict, "narrower"]); continue; }
  const a0 = ta.get(m.new), g = m.through ? ta.get(m.through) : null;
  if (!a0 || (m.through && !g)) { rows.push(["tool", name, bw, `${m.new} MISSING`, m.verdict, "WIDER?"]); wider++; continue; }
  // a fold `through` another tool (file through preview): the caller passes both, so the stricter of the two holds
  const a = g ? { owner: a0.owner || g.owner, write: a0.write || g.write, project: a0.project || g.project } : a0;
  const aw = `${TOOL_WHO[TOOL_RANK(a)]}${a.project ? ", project-scoped" : ""}${g ? ` (through ${m.through})` : ""}`;
  const d = TOOL_RANK(a) - TOOL_RANK(b), ps = (a.project ? 1 : 0) - (b.project ? 1 : 0);
  const change = d < 0 || ps < 0 ? "WIDER" : d > 0 || ps > 0 ? "narrower" : "same";
  if (change === "WIDER") wider++;
  rows.push(["tool", name === m.new ? name : `${name} -> ${m.new}`, bw, aw, m.verdict, change]);
}
for (const [name, a] of ta) if (!tb.has(name) && !NAMES.tools.some((t) => t.new === name)) rows.push(["tool", `${name} (new)`, "—", TOOL_WHO[TOOL_RANK(a)], "new", "new"]);

// REST: every row of the head; a row names.json does not list keeps its address
const restMap = new Map(NAMES.rest.map((r) => [r.old, r]));
for (const [k, b] of rb) {
  const m = restMap.get(k);
  const newKey = m ? m.new : k;
  if (!newKey || (m && m.verdict === "goes")) { rows.push(["rest", k, b.auth, newKey ? `(gone; the need: ${newKey})` : "(gone)", m.verdict, "narrower"]); continue; }
  const a0 = ra.get(newKey), g = m && m.through ? ra.get(m.through) : null;
  if (!a0) { rows.push(["rest", k, b.auth, `${newKey} MISSING`, m ? m.verdict : "kept", "WIDER?"]); wider++; continue; }
  const a = g && AUTH_RANK[g.auth] > AUTH_RANK[a0.auth] ? g : a0;
  // the same data already served at another address before (readableBefore): the rename widens nothing below that one's auth
  const floor = m && m.readableBefore && rb.get(m.readableBefore) ? Math.min(AUTH_RANK[b.auth], AUTH_RANK[rb.get(m.readableBefore).auth]) : AUTH_RANK[b.auth];
  const d = AUTH_RANK[a.auth] - floor;
  const change = d < 0 ? "WIDER" : d > 0 ? "narrower" : "same";
  if (change === "WIDER") wider++;
  const note = m && m.readableBefore && floor < AUTH_RANK[b.auth] ? ` (${m.readableBefore} served it at ${rb.get(m.readableBefore).auth})` : g ? ` (through ${m.through})` : "";
  if (m || change !== "same") rows.push(["rest", m ? `${k} -> ${newKey}` : k, b.auth, a.auth + note, m ? m.verdict : "kept", change]);
}
for (const [k, a] of ra) if (!rb.has(k) && !NAMES.rest.some((r) => r.new === k)) rows.push(["rest", `${k} (new)`, "—", a.auth, "new", "new"]);

const kept = before.rest.filter((r) => !restMap.has(rkey(r)) && ra.has(rkey(r)) && ra.get(rkey(r)).auth === r.auth).length;
const md = ["| face | name | before | after | verdict | authority |", "|---|---|---|---|---|---|", ...rows.map((r) => `| ${r.join(" | ")} |`),
  "", `${rows.filter((r) => r[5] === "same").length} same · ${rows.filter((r) => r[5] === "narrower").length} narrower · ${rows.filter((r) => r[5] === "new").length} new · ${wider} wider; ${kept} REST rows keep their address and auth (not listed)`].join("\n");
if (arg("--md")) writeFileSync(arg("--md"), md + "\n");
console.log(md);
console.log(wider ? `✗ authority: ${wider} row(s) WIDER after the rename` : "✓ authority: no row is wider after the rename");
process.exit(wider ? 1 : 0);
