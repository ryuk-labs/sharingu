// tools/check-org-names.mjs — gate step (sprint 7, slice 7.3; docs/plan/PLATFORM.md §2 item 9: each org at
// agent.ryuklabs.io/<org>, "org names never take a name the platform uses (login, mcp, docs, every route of the door)").
//
// An org's address is its path name (migrate-072's org.slug). The names it may never take are DERIVED in code
// (src/orgnames.js reservedNames over src/index.js CAPABILITIES, plus the platform's fixed words), never kept by hand. This
// check proves the derivation covers the door, so a route can never be shadowed by an org that took its name first:
//   1 · every first path segment a route ANSWERS is reserved: each route table's test in src/index.js (`path === "…"`,
//       `path.startsWith("…")`, a regex over the path), the static doors before the tables, and the OAuth provider's paths in
//       src/oauth.js (OAUTH_PATHS, the well-known documents, the MCP apiRoute) — a route outside the registry included;
//   2 · the worker builds its set from the registry itself (src/index.js: reservedNames(CAPABILITIES)) and POST /orgs checks
//       a new org's address against that set;
//   3 · the platform's fixed words hold the brief's floor (login, logout, signup, mcp, oauth, .well-known, health, fonts, docs,
//       install, api, admin, static, favicon.svg), every reserved name is lower-case, and none ends in a dash and digits (a slug
//       migrate-072 derives for an operator's org, <name>-<id>, is never a route's);
//   4 · --slugs a,b,… and --sqlite <file>: the path names a database holds (each the form, none reserved): an org that
//       already holds a name a new route wants FAILS LOUDLY here. THE SHIP'S PREFLIGHT (the sprint-7 review, D2+B3): tools/ship.sh
//       reads live's `SELECT slug FROM org` right after its live read and runs this over those names BEFORE anything is uploaded
//       (red: not shipping); tools/ship-plan.sh reads and checks them in its section 1 (a gap) and prints the same check as a
//       read-only step before the code. The gate runs it with fixed names only (--prove's ryuklabs,suites,login).
//
//   node tools/check-org-names.mjs [--src <dir>] [--slugs a,b] [--sqlite <db file>]   exit 0 clean, 1 with every miss
//   node tools/check-org-names.mjs --prove   and each named mutation (a copy of src/) must turn it red
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FLOOR = ["login", "logout", "signup", "mcp", "oauth", ".well-known", "health", "fonts", "docs", "install", "api", "admin", "static", "favicon.svg"];

// the routes a source tree answers: [{ path, where }] (the path as written, its file and line)
export function routesOf(srcDir) {
  const out = [];
  const lineOf = (t, i) => t.slice(0, i).split("\n").length;
  const idx = readFileSync(join(srcDir, "index.js"), "utf8");
  const add = (path, file, t, i) => out.push({ path, where: `${file}:${lineOf(t, i)}` });
  // the route tests and the static doors: path === "…" / path.startsWith("…") / a regex literal tested on the path
  for (const m of idx.matchAll(/\bpath\s*===\s*"(\/[^"]*)"/g)) add(m[1], "src/index.js", idx, m.index);
  for (const m of idx.matchAll(/\bpath\.startsWith\(\s*"(\/[^"]*)"/g)) add(m[1], "src/index.js", idx, m.index);
  for (const m of idx.matchAll(/\/\^\\\/([A-Za-z0-9._-]+)[^/\n]*\/\.test\(\s*path\s*\)/g)) add("/" + m[1], "src/index.js", idx, m.index);
  // the OAuth provider (src/oauth.js): its three paths, the discovery documents, the MCP door
  const oa = readFileSync(join(srcDir, "oauth.js"), "utf8");
  const op = /OAUTH_PATHS\s*=\s*\[([^\]]*)\]/.exec(oa);
  for (const m of (op ? op[1] : "").matchAll(/"(\/[^"]*)"/g)) add(m[1], "src/oauth.js", oa, op.index);
  for (const m of oa.matchAll(/\bp(?:athname)?\s*(?:===|!==)\s*"(\/[^"]*)"|\bp\.startsWith\(\s*"(\/[^"]*)"|\bapiRoute:\s*"(\/[^"]*)"/g)) add(m[1] || m[2] || m[3], "src/oauth.js", oa, m.index);
  return out;
}
// the registry's rows as the contract generator reads them (tools/make-door-contract.py)
export function capabilitiesOf(srcDir) {
  const idx = readFileSync(join(srcDir, "index.js"), "utf8");
  return [...idx.matchAll(/\{\s*m:"(\w+)",\s*p:"([^"]+)",\s*auth:"([^"]+)"/g)].map((m) => ({ m: m[1], p: m[2], auth: m[3] }));
}

export async function check(srcDir, { slugs = [] } = {}) {
  const misses = [];
  const names = await import(pathToFileURL(join(srcDir, "orgnames.js")).href + `?v=${Date.now()}`);
  const caps = capabilitiesOf(srcDir);
  if (caps.length < 20) misses.push(`the registry: ${caps.length} CAPABILITIES rows read from src/index.js (the shape changed?)`);
  const reserved = names.reservedNames(caps);
  // 1 · every route's first segment
  const routes = routesOf(srcDir);
  if (routes.length < 20) misses.push(`the route tables: ${routes.length} route paths read (the shape changed?)`);
  for (const r of routes) {
    const seg = names.firstSegment(r.path);
    if (seg && !reserved.has(seg)) misses.push(`${r.where}: the route ${r.path} answers at "${seg}", a name an org's address could take — declare the route in CAPABILITIES or add "${seg}" to src/orgnames.js PLATFORM_WORDS`);
  }
  // 2 · the worker derives its set from the registry and the creation checks it
  const idx = readFileSync(join(srcDir, "index.js"), "utf8");
  if (!/const RESERVED_ORG_NAMES = reservedNames\(CAPABILITIES\);/.test(idx)) misses.push("src/index.js: RESERVED_ORG_NAMES is not reservedNames(CAPABILITIES) (the worker's set must be the registry's own)");
  if (!/orgFormProblem\(f, RESERVED_ORG_NAMES\)/.test(idx)) misses.push("src/index.js: POST /orgs does not check a new address against RESERVED_ORG_NAMES");
  // 3 · the floor, the case, no derived-slug shape
  for (const w of FLOOR) if (!reserved.has(w)) misses.push(`src/orgnames.js: "${w}" is not reserved (the brief's floor: ${FLOOR.join(", ")})`);
  for (const w of reserved) {
    if (w !== w.toLowerCase() || w.includes("/")) misses.push(`src/orgnames.js: the reserved name "${w}" is not one lower-case segment`);
    if (/-\d+$/.test(w)) misses.push(`src/orgnames.js: the reserved name "${w}" ends in a dash and digits (migrate-072's derived slugs, <name>-<id>, could take it)`);
  }
  // 4 · the slugs a database holds
  for (const s of slugs) {
    const p = names.orgSlugProblem(s, reserved);
    if (p === "reserved") misses.push(`an org holds "${s}", a name the door uses: rename that org (the operator, with its owner) before the code that adds the route ships`);
    else if (p) misses.push(`an org holds "${s}", not a path name's form (a-z, 0-9, single dashes, 2 to 40, no dash at either end)`);
  }
  return { misses, reserved: reserved.size, routes: routes.length, caps: caps.length, slugs: slugs.length };
}

const MUTATIONS = [
  { name: "a route outside the registry", file: "index.js", from: "    test: (path, method) => path === \"/orgs/new\" && method === \"GET\",",
    to: "    test: (path, method) => path === \"/zebra-door\" && method === \"GET\",\n    run: async () => undefined,\n  },\n  {\n    test: (path, method) => path === \"/orgs/new\" && method === \"GET\",",
    why: "a door the registry never declares (its name free for an org to take first)" },
  { name: "a fixed word dropped", file: "orgnames.js", from: "  \"oauth\", \".well-known\",", to: "  \".well-known\",", why: "the OAuth provider's /oauth/* answered, its name not reserved" },
  { name: "the registry not read", file: "orgnames.js", from: "for (const c of Array.isArray(capabilities) ? capabilities : [])", to: "for (const c of [])", why: "only the fixed words reserved: every route of the registry free" },
  { name: "the worker's set unhooked", file: "index.js", from: "const RESERVED_ORG_NAMES = reservedNames(CAPABILITIES);", to: "const RESERVED_ORG_NAMES = reservedNames([]);", why: "the worker's own set no longer the registry's" },
  { name: "a reserved name of a derived slug's shape", file: "orgnames.js", from: "\"operator\", \"platform\",", to: "\"operator\", \"platform\", \"app-2\",", why: "a name migrate-072 could derive for an operator's org" },
];

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const src = arg("--src") || join(ENGINE, "src");
  let slugs = (arg("--slugs") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (arg("--sqlite")) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(arg("--sqlite"), { readOnly: true });
    slugs = slugs.concat(db.prepare("SELECT slug FROM org WHERE slug IS NOT NULL ORDER BY id").all().map((r) => r.slug));
  }
  const r = await check(src, { slugs });
  if (r.misses.length) {
    for (const m of r.misses) console.log(`  ✗ ${m}`);
    console.log(`✗ org names: ${r.misses.length} miss(es)`);
  } else console.log(`✓ org names: ${r.routes} route paths answered, every first segment reserved (${r.reserved} names: the ${r.caps} registry rows' first segments and the platform's fixed words); the worker's set is the registry's; none a derived slug's shape${r.slugs ? `; ${r.slugs} held path names, none reserved` : ""}`);
  if (r.misses.length || !process.argv.includes("--prove")) process.exit(r.misses.length ? 1 : 0);
  let red = 0;
  const self = fileURLToPath(import.meta.url);
  const runOn = (dir, extra = []) => new Promise((done) => execFile(process.execPath, [self, "--src", dir, ...extra], (e, out) => done({ rc: e ? e.code : 0, out: String(out || "") })));
  for (const m of MUTATIONS) {
    const dir = mkdtempSync(join(ENGINE, ".org-names-mutation-"));
    try {
      cpSync(src, join(dir, "src"), { recursive: true });
      const f = join(dir, "src", m.file), s = readFileSync(f, "utf8");
      if (s.split(m.from).length !== 2) { console.log(`  ✗ mutation ${m.name}: its needle is not in src/${m.file} exactly once (update this check)`); continue; }
      writeFileSync(f, s.replace(m.from, m.to));
      const c = await runOn(join(dir, "src"));
      const ok = c.rc === 1;
      if (ok) red++;
      console.log(`  ${ok ? "✓" : "✗"} mutation ${m.name} (${m.why}): ${ok ? "RED" : `rc ${c.rc}, NOT red`} — ${(c.out.split("\n").find((l) => /^  ✗ /.test(l)) || "").trim().slice(0, 200)}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  // and the held names: an org that holds a route's name fails loudly
  const held = await runOn(src, ["--slugs", "ryuklabs,suites,login"]);
  const heldOk = held.rc === 1 && /holds "login"/.test(held.out);
  if (heldOk) red++;
  console.log(`  ${heldOk ? "✓" : "✗"} an org holding a route's name (--slugs ryuklabs,suites,login): ${heldOk ? "RED, naming login" : `rc ${held.rc}, NOT red`}`);
  const total = MUTATIONS.length + 1;
  console.log(`${red === total ? "✓" : "✗"} org names proof: ${red} of ${total} mutations turn it red`);
  process.exit(red === total ? 0 : 1);
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
