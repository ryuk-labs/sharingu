// login-csrf-route-selftest.mjs — heal round 2 (this batch, 2026-09-23, following #162's verifier
// finding, named non-blocking in next-batch-login-csrf-wiring.md).
//
// The gap this closes: tools/login-csrf-selftest.mjs unit-tests crossSiteLogin() (src/util.js) in
// total isolation and never drives POST /login itself. #162's verifier replaced the guard's call
// site in src/index.js with `if (false && crossSiteLogin(request, url))` — same line count, so the
// atlas and door-contract drift checks stayed silent too — and the WHOLE gate, login-csrf-selftest
// included, stayed green. The wiring is correct today (proven live: cross-site 403, same-origin and
// script-initiated 401); this was a check that CANNOT FAIL, the "absence is not evidence" class.
//
// This test drives the ROUTE: the real, unmodified default export of src/index.js (buildEntry(
// workerHandler) — the exact artifact `sh tools/ship.sh` deploys) through an actual `fetch(Request,
// env, ctx)` call, against a real in-memory SQLite DB (node:sqlite, boot.sql applied verbatim — the
// same shape tools/clean-eval-check-results-selftest.mjs already proves the schema against). Never a
// hand-typed mirror of the route or of crossSiteLogin() itself — "the verifier is never the author"
// cuts both ways: a test that reimplements the guard under test would prove nothing but its own
// reimplementation.
//
// src/index.js's own module graph reaches `cloudflare:workers` (via src/oauth.js's import of
// @cloudflare/workers-oauth-provider) — a Workers-runtime-only binding plain Node has no loader for.
// tools/cf-workers-stub-loader.mjs stubs that scheme just enough for the graph to load; see that
// file's own header for why it is safe (nothing this test exercises calls into OAuthProvider).
//
// Three request shapes, real browser header semantics (crossSiteLogin: Sec-Fetch-Site first, Origin
// fallback — scar 2026-09-08's Origin:null-under-no-referrer lesson, same as csrf-selftest.mjs and
// login-csrf-selftest.mjs already lock for the primitive alone):
//   - cross-site Origin           -> 403 (refused before the body is even read)
//   - same-origin                 -> 401 (guard clears; falls through to the real credential check,
//                                    which fails on a nonexistent person — proving the request
//                                    actually reached the route body, not just "didn't 403")
//   - script-initiated (no SFS,
//     no Origin — curl, suites)   -> 401 (guard clears; same as above)
//
// "Prove every new check both ways" (this batch's own instrument law): the second half of this file
// re-runs the SAME three-shape probe against a MUTATED copy of the real source — the guard's call
// site replaced with `if (false && crossSiteLogin(request, url))`, the EXACT shape #162's verifier
// used — copied into a scratch src/ tree inside engine/ (so @cloudflare/workers-oauth-provider still
// resolves via node_modules) and removed after. If the mutated copy still 403s the cross-site
// request, this check is not load-bearing and fails BY NAME, same pattern as
// tools/teardown-guard-selftest.sh's own embedded mutation proof. This runs on every gate.sh pass,
// not just once for this PR — a future edit that silently strips the guard again turns THIS check
// red, not just the primitive-only unit test that could never see it.
//
// Run in the gate.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const boot = readFileSync(join(ENGINE, "boot.sql"), "utf8");

// Registered ONCE, before any dynamic import of src/index.js below — a static top-level `import`
// in this file would resolve before this line ever runs, so every target import here is dynamic.
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));

let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(boot);
  return db;
}

// A thin D1 shim over node:sqlite — only the surface POST /login's handler calls:
// env.DB.prepare(sql).bind(...).run()/.first()/.all() (no LOGIN_LIMIT/BRAIN binding — the route
// treats an absent LOGIN_LIMIT as "running unlimited" and never touches BRAIN before returning).
function makeEnv(db) {
  const DB = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const wrap = (args) => ({
        run: () => { const info = stmt.run(...args); return { meta: { changes: info.changes } }; },
        first: () => stmt.get(...args) ?? null,
        all: () => ({ results: stmt.all(...args) }),
      });
      return { ...wrap([]), bind: (...args) => wrap(args) };
    },
  };
  return { DB };
}

async function postLogin(handler, env, headers) {
  const req = new Request("https://org.example/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
  });
  return handler.fetch(req, env, {});
}

// The same three-shape probe, run against whichever handler is passed in (the real one, then the
// mutated one) — never duplicated by hand between the two.
async function probe(handler, label, assert) {
  const db = freshDb();
  const env = makeEnv(db);
  const crossSite = await postLogin(handler, env, { "sec-fetch-site": "cross-site", origin: "https://evil.example" });
  const sameOrigin = await postLogin(handler, env, { "sec-fetch-site": "same-origin", origin: "https://org.example" });
  const scripted = await postLogin(handler, env, {});
  if (assert) {
    ok(crossSite.status === 403, `${label}: a cross-site sign-in POST is refused (403) — got ${crossSite.status}`);
    ok(sameOrigin.status === 401, `${label}: a same-origin sign-in POST reaches the credential check (401, bad password) — got ${sameOrigin.status}`);
    ok(scripted.status === 401, `${label}: a script client (no Sec-Fetch-Site, no Origin — curl, the suites) reaches the credential check (401) — got ${scripted.status}`);
  }
  return { crossSite: crossSite.status, sameOrigin: sameOrigin.status, scripted: scripted.status };
}

// ---- 1. the real, unmodified route: the guard wired exactly as it ships ----
const { default: wiredHandler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
await probe(wiredHandler, "wired route", true);

// ---- 2. the mutation proof: #162's own shape, `if (false && crossSiteLogin(...))` ----
const mutDir = mkdtempSync(join(ENGINE, ".login-csrf-mutation-"));
try {
  cpSync(join(ENGINE, "src"), join(mutDir, "src"), { recursive: true });
  const indexPath = join(mutDir, "src", "index.js");
  const original = readFileSync(indexPath, "utf8");
  const NEEDLE = "if (crossSiteLogin(request, url)) {";
  const MUTATED = "if (false && crossSiteLogin(request, url)) {";
  if (!original.includes(NEEDLE)) {
    ok(false, `mutation: the guard's call site no longer reads "${NEEDLE}" in src/index.js — this selftest is stale against its current shape and must be updated`);
  } else {
    writeFileSync(indexPath, original.replace(NEEDLE, MUTATED));
    const { default: mutatedHandler } = await import(pathToFileURL(indexPath).href);
    const mutResult = await probe(mutatedHandler, "mutated route", false);
    ok(mutResult.crossSite !== 403,
      mutResult.crossSite !== 403
        ? `mutation: with the guard's call site replaced by "if (false && crossSiteLogin(...))" a cross-site sign-in POST is NO LONGER refused (got ${mutResult.crossSite}, not 403) — this check is load-bearing`
        : `mutation: with the guard's call site replaced by "if (false && crossSiteLogin(...))" a cross-site sign-in POST STILL got 403 — this check is NOT load-bearing`);
  }
} finally {
  rmSync(mutDir, { recursive: true, force: true });
}

console.log(`login-csrf-route-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
