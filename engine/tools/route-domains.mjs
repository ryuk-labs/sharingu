#!/usr/bin/env node
// tools/route-domains.mjs [--config <wrangler.jsonc>] — the worker's Custom Domains, READ from its config (sprint 10, 10.4):
// every `routes` entry with `custom_domain: true`, one host per line, in the config's order. tools/verify-live.sh runs its
// D4 checks for each, so no domain is typed there (the sprint-9 ship detached agent.sharingu.xyz and the check, typing
// only the other domain, never saw it). The config is JSONC: comments (// and /* */), then trailing commas, are dropped
// OUTSIDE strings, then it is plain JSON.
// Exit 0 with at least one host; exit 1 (the reason on stderr, nothing on stdout) when the config is missing or does not
// parse, lists no Custom Domain, or a Custom Domain's pattern is not a bare host name. Proven offline by tools/ship-selftest.sh.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const at = argv.indexOf("--config");
if (argv.length && (at !== 0 || argv.length !== 2)) {
  process.stderr.write("usage: node tools/route-domains.mjs [--config <wrangler.jsonc>]\n");
  process.exit(2);
}
const config = at === 0 ? argv[1] : join(dirname(fileURLToPath(import.meta.url)), "..", "wrangler.jsonc");
const fail = (why) => { process.stderr.write(`✗ route-domains: ${why} (${config})\n`); process.exit(1); };

// JSONC -> JSON in two passes, each knowing when it is inside a string (so a "//" or a "," in a value is kept): the comments
// first, then the trailing commas — a comma followed by a comment and then the close (`}, // x\n]`) is trailing too (the
// sprint-10 review, L3: one pass looked past blanks only, met the comment, and kept the comma)
// eachOutsideStrings(t, f) -> t rebuilt: every string literal copied whole, f(t, i) -> [text to emit, next index] elsewhere
function eachOutsideStrings(t, f) {
  let out = "", i = 0;
  while (i < t.length) {
    if (t[i] === '"') {
      let j = i + 1;
      while (j < t.length && t[j] !== '"') j += t[j] === "\\" ? 2 : 1;
      out += t.slice(i, j + 1); i = j + 1;
    } else { const [emit, next] = f(t, i); out += emit; i = next; }
  }
  return out;
}
const stripComments = (t) => eachOutsideStrings(t, (s, i) => {
  if (s[i] === "/" && s[i + 1] === "/") { let j = i; while (j < s.length && s[j] !== "\n") j++; return ["", j]; }
  if (s[i] === "/" && s[i + 1] === "*") { const e = s.indexOf("*/", i + 2); if (e < 0) fail("an unclosed /* comment"); return [" ", e + 2]; }
  return [s[i], i + 1];
});
const stripTrailingCommas = (t) => eachOutsideStrings(t, (s, i) => {
  if (s[i] !== ",") return [s[i], i + 1];
  let j = i + 1;
  while (j < s.length && /\s/.test(s[j])) j++;
  return [s[j] === "}" || s[j] === "]" ? "" : ",", i + 1];   // a trailing comma (only blanks before the close) is dropped
});
const stripJsonc = (t) => stripTrailingCommas(stripComments(t));

let text;
try { text = readFileSync(config, "utf8"); } catch (e) { fail(`the config does not read: ${e.code || e.message}`); }
let cfg;
try { cfg = JSON.parse(stripJsonc(text)); } catch (e) { fail(`the config does not parse: ${e.message}`); }
const routes = Array.isArray(cfg?.routes) ? cfg.routes : [];
const hosts = routes.filter((r) => r && typeof r === "object" && r.custom_domain === true).map((r) => r.pattern);
if (!hosts.length) fail("no Custom Domain: no routes entry carries custom_domain: true");
for (const h of hosts) {
  if (typeof h !== "string" || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) {
    fail(`a Custom Domain's pattern is not a bare host name: ${JSON.stringify(h)}`);
  }
}
process.stdout.write(hosts.join("\n") + "\n");
