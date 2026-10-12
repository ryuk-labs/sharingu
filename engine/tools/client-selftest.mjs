// tools/client-selftest.mjs — sprint 13 (13.1): which AI filed it (src/client.js; migrate-080's transmission.client). Offline. It
// proves:
//   A. the family table (familyOfName): every name a known client gives — the OAuth client_name it registers, the clientInfo.name
//      it sends at initialize — reads as its ONE family word; the narrower family first (Claude Code before Claude, Codex before
//      ChatGPT); any other name is `other`, no name is null; the answer is never the raw string;
//   B. the order of trust (clientFamilyOf): the OAuth client's name, then the MCP clientInfo, then the door (web, api; the MCP's
//      other); a grant's or a session's stored word reads back as itself;
//   C. the request's word (setRequestClient / requestClient): only a family word is kept, each request reads its own, outside a
//      request there is none;
//   D. the session id (src/confirm.js sessionFor / sessionOf) carries a named family between the flags and the hex — never a raw
//      name, never `other` — and a client with a named family and no flags now holds an id; an id naming no family we write reads
//      as no session at all; an OAuth grant's props (grantClientOf) keep the word alone;
//   E. the ledger (src/core.js fileTransmission and fileTransmissionsBatch, over the Home fixture's real SQLite D1): a filing in a
//      request whose door set claude-code is stored claude-code, row by row in a batch; outside a request the row is unknown (NULL);
// and runs A–D again against MUTANTS of src (a copy, one change each), each of which must turn something red.
//   node tools/client-selftest.mjs        exit 0 when every check holds and every mutant is red
//   node tools/client-selftest.mjs --src <dir>   A–D alone against another copy of src (the red run against the code before 13.1)
import { readFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

async function suite(srcDir, { quiet = false } = {}) {
  let checks = 0, failed = 0;
  const ok = (cond, label) => { checks++; if (!cond) failed++; if (!quiet) console.log(`  ${cond ? "✓" : "✗"} ${label}`); };
  const im = (f) => import(pathToFileURL(join(srcDir, f)).href);
  const C = await im("client.js"), CF = await im("confirm.js"), OP = await im("orgpath.js");

  // A. the family table
  const TABLE = [
    ["Claude", "claude"], ["claude-ai", "claude"], ["claude.ai", "claude"], ["Claude Desktop", "claude"], ["Anthropic", "claude"],
    ["Claude Code (sharingu)", "claude-code"], ["claude-code", "claude-code"], ["ClaudeCode", "claude-code"], ["CLAUDE_CODE", "claude-code"],
    ["ChatGPT", "chatgpt"], ["chatgpt.com", "chatgpt"], ["openai-mcp", "chatgpt"], ["OpenAI", "chatgpt"],
    ["Codex", "codex"], ["codex-mcp-client", "codex"], ["OpenAI Codex", "codex"],
    ["cursor-vscode", "other"], ["Visual Studio Code", "other"], ["smoke", "other"], ["mcp-inspector", "other"],
  ];
  const miss = TABLE.filter(([n, f]) => C.familyOfName(n) !== f).map(([n, f]) => `${n}: ${C.familyOfName(n)} (want ${f})`);
  ok(!miss.length, `every known name reads as its family, the narrower first (${TABLE.length} names)${miss.length ? ": " + miss.join("; ") : ""}`);
  ok([null, undefined, "", "   ", "--", 42, {}, ["Claude"]].every((v) => C.familyOfName(v) === null), "no name (empty, punctuation only, not a string) is null, never other");
  ok(C.familyOfName("x".repeat(300) + " claude") === "other", "a name is read only to its first 200 characters");
  const fams = new Set(C.CLIENT_FAMILIES);
  ok(TABLE.every(([n]) => fams.has(C.familyOfName(n))) && C.CLIENT_FAMILIES.join() === "claude,claude-code,chatgpt,codex,web,api,other" && C.NAMED_FAMILIES.join() === "claude,claude-code,chatgpt,codex",
    "the answer is always one of the seven words, never the raw string");

  // B. the order of trust
  const F = C.clientFamilyOf;
  ok(F({ oauth: "Claude", mcp: "codex-mcp-client", door: "mcp" }) === "claude", "the OAuth client's name comes first");
  ok(F({ oauth: "MCP Inspector", mcp: "claude-code", door: "mcp" }) === "claude-code" && F({ oauth: null, mcp: "Codex", door: "mcp" }) === "codex", "then the MCP clientInfo (an OAuth name we do not know says nothing)");
  ok(F({ door: "mcp" }) === "other" && F({ mcp: "smoke", door: "mcp" }) === "other", "the MCP with no known name: other");
  ok(F({ door: "web" }) === "web" && F({ door: "api" }) === "api" && F({ mcp: "Claude", door: "web" }) === "claude", "the door's own word: web (the app's forms), api (a key on REST)");
  ok(F({}) === null && F() === null && F({ mcp: "smoke" }) === "other", "no door and no name: unknown (null)");
  ok(C.NAMED_FAMILIES.every((w) => F({ oauth: w, door: "mcp" }) === w && F({ mcp: w, door: "mcp" }) === w), "a grant's or a session's stored word reads back as itself");
  ok(C.clientOfRow("claude-code") === "claude-code" && C.clientOfRow(null) === null && C.clientOfRow("Claude Desktop") === null, "a stored word reads back; NULL and anything the door never writes read as null");
  ok(C.clientWordOf("claude-code") === "Claude Code" && C.clientWordOf("chatgpt") === "ChatGPT" && C.clientWordOf(null) === "" && C.clientWordOf("gemini") === "", "the words a page shows; unknown shows nothing");

  // C. the request's word
  C.setRequestClient("codex");
  ok(C.requestClient() === null, "outside a request there is no word (the cron's rows record unknown)");
  const inside = await OP.inRequest(async () => { const a = C.requestClient(); C.setRequestClient("claude-code"); const b = C.requestClient(); C.setRequestClient("Claude Code"); return [a, b, C.requestClient()]; });
  ok(inside[0] === null && inside[1] === "claude-code" && inside[2] === null, `inside a request: none until set, a family word kept, a raw name refused -> ${JSON.stringify(inside)}`);
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const two = await Promise.all(["chatgpt", "api"].map((w) => OP.inRequest(async () => { C.setRequestClient(w); await tick(); await tick(); return C.requestClient(); })));
  ok(two.join() === "chatgpt,api", `two interleaved requests each read their own -> ${two.join()}`);

  // D. the session id and the grant's props
  const H = (v) => ({ headers: { get: (k) => (k === "Mcp-Session-Id" ? v : null) } });
  ok(/^sg1\.claude-code\.[0-9a-f]{32}$/.test(CF.sessionFor({}, "claude-code") || "") && /^sg1e\.chatgpt\.[0-9a-f]{32}$/.test(CF.sessionFor({ elicitation: {} }, "chatgpt") || ""),
    "a named family rides the session id between the flags and the hex, and earns an id with no flag");
  ok(CF.sessionFor({}, "other") === null && CF.sessionFor({}, "Claude Code") === null && CF.sessionFor({}, "web") === null && /^sg1e\.[0-9a-f]{32}$/.test(CF.sessionFor({ elicitation: {} }, "other") || ""),
    "other, a raw name or a door word earns nothing (the id is what it was)");
  const sid = CF.sessionFor({ elicitation: {} }, "codex");
  const s1 = CF.sessionOf(H(sid)), s0 = CF.sessionOf(H("sg1e." + "a".repeat(32))), sx = CF.sessionOf(H("sg1.gemini." + "a".repeat(32)));
  ok(s1 && s1.client === "codex" && s1.elicit === true && s1.ui === false && s1.id === sid && s0 && s0.client === null && s0.elicit && sx === null,
    `sessionOf reads the word back; an id from before carries none; an id naming a word we never write is no session -> ${JSON.stringify([s1, s0, sx])}`);
  ok(JSON.stringify(C.grantClientOf("Claude Code (sharingu)")) === '{"client":"claude-code"}' && JSON.stringify(C.grantClientOf("MCP Inspector")) === "{}" && JSON.stringify(C.grantClientOf(null)) === "{}",
    "an OAuth grant keeps its client's family word alone (a name we do not know keeps nothing)");
  return { checks, failed };
}

console.log("client-selftest — which AI filed it (src/client.js, src/confirm.js, src/core.js)");
const other = process.argv.indexOf("--src");
if (other > 0) {
  let r;
  try { r = await suite(process.argv[other + 1]); } catch (e) { r = { failed: 1, checks: 1 }; console.log(`  ✗ ${String(e && e.message || e).slice(0, 160)}`); }
  console.log(`\n${r.checks - r.failed}/${r.checks} checks hold (against ${process.argv[other + 1]})`);
  process.exit(r.failed ? 1 : 0);
}
const main = await suite(join(ENGINE, "src"));

// E. the ledger (the real src only)
{
  const ok = (cond, label) => { main.checks++; if (!cond) main.failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`); };
  const { homeFixtureEnv, SEAT } = await import("./fixtures/home-d1.mjs");
  const { fileTransmission, fileTransmissionsBatch } = await import("../src/core.js");
  const { inRequest } = await import("../src/orgpath.js");
  const { setRequestClient } = await import("../src/client.js");
  const fx = homeFixtureEnv();
  const clientOf = (id) => (fx.sqlite.prepare("SELECT client FROM transmission WHERE id = ?").get(id) || {}).client;
  const body = (what) => ({ lane: "leader", kind: "note", what, why: "the client is stamped at the door" });
  const one = await inRequest(async () => { setRequestClient("claude-code"); return fileTransmission(SEAT, body("filed from Claude Code"), fx.env); });
  ok(one && one.id && clientOf(one.id) === "claude-code", `a filing in a request whose door set claude-code is stored claude-code (${one && one.id}: ${one && one.id && clientOf(one.id)})`);
  const batch = await inRequest(async () => { setRequestClient("chatgpt"); return fileTransmissionsBatch(SEAT, [body("batch one"), body("batch two")], fx.env); });
  ok(Array.isArray(batch) && batch.length === 2 && batch.every((r) => r.id && clientOf(r.id) === "chatgpt"), `a batch stamps every row (${(batch || []).map((r) => `${r.id}: ${clientOf(r.id)}`).join(", ")})`);
  const bare = await fileTransmission(SEAT, body("filed outside a request"), fx.env);
  const bareB = await fileTransmissionsBatch(SEAT, [body("batch outside a request")], fx.env);
  ok(bare.id && clientOf(bare.id) === null && bareB[0].id && clientOf(bareB[0].id) === null, "outside a request (the cron, a seam with no door) the row is unknown: NULL");
  const sent = await inRequest(async () => { setRequestClient("web"); return fileTransmission(SEAT, { ...body("a body naming its own client"), client: "codex" }, fx.env); });
  ok(sent.id && clientOf(sent.id) === "web", "a body's own `client` field is never read: the door's word stands");
}

// ---- the mutants: a copy of src, one change each; each must turn a check red ----
const MUTANTS = [
  ["Claude before Claude Code", "client.js", '  [/claude ?code/, "claude-code"],\n', ""],
  ["ChatGPT before Codex", "client.js", '  [/codex/, "codex"],\n', ""],
  ["any name is other, none is null no more", "client.js", "  if (!n) return null;", "  if (!n) return \"other\";"],
  ["the raw name kept", "client.js", "  for (const [re, fam] of KNOWN_CLIENTS) if (re.test(n)) return fam;\n  return \"other\";", "  for (const [re, fam] of KNOWN_CLIENTS) if (re.test(n)) return fam;\n  return name;"],
  ["the MCP clientInfo before the OAuth name", "client.js", "for (const src of [oauth, mcp])", "for (const src of [mcp, oauth])"],
  ["the MCP with no name unknown", "client.js", 'if (door === "mcp") return "other";', ""],
  ["any word kept for the request", "client.js", "if (st) st.client = CLIENT_FAMILIES.includes(family) ? family : null;", "if (st) st.client = family;"],
  ["the request's word module-global", "client.js", "export const requestClient = () => { const st = requestStore();", "let G = null; export const requestClient = () => { const st = { client: G };"],
  ["a stored raw string read back", "client.js", "export const clientOfRow = (v) => (CLIENT_FAMILIES.includes(String(v || \"\")) ? String(v) : null);", "export const clientOfRow = (v) => v || null;"],
  ["other rides the session id", "confirm.js", "const fam = NAMED_FAMILIES.includes(family) ? family : \"\";", "const fam = family ? String(family) : \"\";"],
  ["the session's word not read back", "confirm.js", "client: m[3] || null }", "client: null }"],
  ["a grant keeps any name", "client.js", "return NAMED_FAMILIES.includes(f) ? { client: f } : {}; }", "return clientName ? { client: clientName } : {}; }"],
];
let red = 0;
for (const [label, file, from, to] of MUTANTS) {
  const dir = mkdtempSync(join(ENGINE, ".runs", "client-mutant-"));   // under engine/: the copy resolves engine/node_modules
  try {
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const p = join(dir, "src", file), text = readFileSync(p, "utf8");
    if (!text.includes(from)) { console.log(`  ✗ mutant "${label}": its text is no longer in src/${file}`); main.failed++; main.checks++; continue; }
    writeFileSync(p, text.replace(from, to));
    let r;
    try { r = await suite(join(dir, "src"), { quiet: true }); } catch (e) { r = { failed: 1, checks: 1, threw: String(e && e.message || e).slice(0, 80) }; }
    const isRed = r.failed > 0;
    if (isRed) red++;
    main.checks++; if (!isRed) main.failed++;
    console.log(`  ${isRed ? "✓" : "✗"} mutant red: ${label} (${r.threw ? "threw: " + r.threw : `${r.failed} of ${r.checks} checks fail`})`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`\n${main.checks - main.failed}/${main.checks} checks hold · ${red}/${MUTANTS.length} mutants red`);
process.exit(main.failed ? 1 : 0);
