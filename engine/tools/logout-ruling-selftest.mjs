// logout-ruling-selftest.mjs — E232g's verdict, proven BOTH WAYS against the real route (batch
// post-consolidation-suite-heal, 2026-09-25; rewritten for the launcher's deletion, P4 prune, 2026-09-27).
//
// E232g (evals.sh) was rewritten from the ruling (QC74D4892, one org worker; #162 retired the launcher,
// LAUNCHER_URL ""): signing out lands on the org's OWN /login, that /login is a live sign-in page, and no
// page offers the retired launcher's "All workspaces" link. Q6FA72180 (2026-09-27) then DELETED the
// launcher's plumbing from the engine: src/tenant.js reads no `launcher` (manifest) and no LAUNCHER_URL
// (wrangler var), and src/index.js's /login no longer defers and /logout no longer returns to one. This
// drives the real, unmodified default export of src/index.js (the artifact `sh tools/ship.sh` deploys —
// same harness as login-csrf-route-selftest.mjs: node:sqlite with boot.sql verbatim, the cf-workers stub
// loader) through GET /home (signed in) · GET /logout · GET /login:
//   1. no launcher configured anywhere                                   -> the verdict HOLDS
//   2. a stale LAUNCHER_URL var AND a served manifest `launcher` field   -> both IGNORED: the verdict still
//      HOLDS, /logout -> this org's /login, /login renders its own form (no 302), ?direct=1 is a no-op
//   3. each clause alone is load-bearing: ONE launcher-era shape (synthesized — the route can no longer
//      produce it) swapped into the otherwise-passing set FAILS the verdict
//   4. the scar: the OLD discriminator (`grep -q 'launcher-link'`) could not tell two pages apart
//   5. UI-B1a's shell-proof marker and the anchor-count clause, both ways on the real /home bytes
//   6. the org's own /login wears ITS brand (a served manifest's), and a manifest-less org the neutral
//      product fallback — never another org's name (moved here from the deleted frame-brand-selftest.mjs)
// Each observed shape is fed to the SAME shell function the eval calls (tools/lib-logout-ruling.sh) —
// never a re-typed mirror of it.
//
// Run in the gate.
import { seedOrg } from "./fixtures/org-row.mjs";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));

let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };

const ORIGIN = "https://org.example";
const KEY = "logout-ruling-selftest-owner-key";   // a fixture key for an in-memory DB, never a real credential

function makeEnv({ launcher = "", org = null } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-owner','Owner','owner@org.example','owner',?,1,'2026-09-25T00:00:00Z',1)")
    .run(createHash("sha256").update(KEY).digest("hex"));
  if (org) seedOrg(db, org);   // the org's own row (src/tenant.js), when a case supplies one; none reads the product's defaults
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
    batch: async (stmts) => Promise.all(stmts.map((s) => s.run())),
  };
  // the bucket holds nothing: the org's facts are its row
  const BRAIN = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => {} };
  return { DB, BRAIN, ...(launcher ? { LAUNCHER_URL: launcher } : {}) };
}

const ctx = { waitUntil() {}, passThroughOnException() {} };
const { default: handler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
const dir = mkdtempSync(join(tmpdir(), "logout-ruling-"));

// observe(opts) — the same four facts E232g reads live, in curl's own shapes: /home's code + body,
// /logout's "code redirect_url" (curl resolves a relative Location against the request URL), /login's
// "code content_type" + body (and /login?direct=1's body, which must be the same page).
async function observe(opts, tag) {
  const env = makeEnv(opts);
  const home = await handler.fetch(new Request(`${ORIGIN}/home`, { headers: { authorization: `Bearer ${KEY}`, accept: "text/html" } }), env, ctx);
  const homeFile = join(dir, `${tag}-home.html`); writeFileSync(homeFile, await home.text());
  const lo = await handler.fetch(new Request(`${ORIGIN}/logout`), env, ctx);
  const loc = lo.headers.get("location");
  const logout = `${lo.status} ${loc ? new URL(loc, `${ORIGIN}/logout`).href : ""}`;
  const lg = await handler.fetch(new Request(`${ORIGIN}/login?next=%2Fhome`), env, ctx);
  const loginHtml = await lg.text();
  const loginFile = join(dir, `${tag}-login.html`); writeFileSync(loginFile, loginHtml);
  const login = `${lg.status} ${lg.headers.get("content-type") || ""}`;
  const lgd = await handler.fetch(new Request(`${ORIGIN}/login?next=%2Fhome&direct=1`), env, ctx);
  const loginDirect = `${lgd.status} ${await lgd.text()}`;
  // sprint 7, 7.4b: the sign-in reached from the org's ADDRESS (an org page sends a signed-out visit to /login?next=/<org>/…)
  const slug = ((env.DB.prepare("SELECT slug FROM org WHERE id = 1").first()) || {}).slug || "";
  const orgLoginHtml = slug ? await (await handler.fetch(new Request(`${ORIGIN}/login?next=${encodeURIComponent(`/${slug}/home`)}`), env, ctx)).text() : "";
  return { homeCode: String(home.status), homeFile, logout, login, loginFile, loginHtml, orgLoginHtml, loginDirect: loginDirect === `${lg.status} ${loginHtml}` };
}

function verdict(o) {
  const r = spawnSync("sh", ["-c", '. "$1"; shift; logout_ruling_verdict "$@"', "sh",
    join(ENGINE, "tools", "lib-logout-ruling.sh"), ORIGIN, o.homeCode, o.homeFile, o.logout, o.login, o.loginFile], { encoding: "utf8" });
  return { code: r.status, why: (r.stdout || "").trim() };
}

try {
  // 1. no launcher configured anywhere
  const none = await observe({}, "none");
  const vNone = verdict(none);
  ok(vNone.code === 0, `no launcher configured: the E232g verdict HOLDS — /logout -> ${none.logout}, /login -> ${none.login.split(";")[0]}${vNone.why ? ` (${vNone.why})` : ""}`);

  // 2. the launcher's former input set again — a stale wrangler var — is READ BY NOTHING: the route answers exactly as
  // with none (the launcher plumbing is deleted, not off)
  const STALE = "https://frame.example.workers.dev";
  const set = await observe({ launcher: STALE }, "set");
  const vSet = verdict(set);
  ok(vSet.code === 0, `a stale LAUNCHER_URL var: IGNORED, the verdict still HOLDS${vSet.why ? ` (${vSet.why})` : ""}`);
  ok(set.logout === `302 ${ORIGIN}/login`, `a stale launcher never becomes /logout's Location (got ${set.logout})`);
  ok(set.login.startsWith("200 text/html") && /name="password"/.test(set.loginHtml) && !set.loginHtml.includes(STALE),
    `a stale launcher never turns GET /login into a hop — it renders this org's own form (got ${set.login.split(";")[0]})`);
  ok(/<input type="hidden" name="next" value="\/home">/.test(set.loginHtml), "GET /login?next= carries next into its own form");
  ok(none.loginDirect && set.loginDirect, "?direct=1 is a no-op: GET /login?direct=1 answers the same page as GET /login");

  // 3. each clause alone is load-bearing: swap ONE launcher-era fact (the shapes the deleted plumbing used
  // to produce, synthesized — the real route can no longer produce them) into the otherwise-passing set
  const vLogout = verdict({ ...none, logout: `302 ${STALE}/logout` });
  ok(vLogout.code === 1 && /does not land on this org's own \/login/.test(vLogout.why), `clause /logout alone: the launcher-era Location fails it — ${vLogout.why || `exit ${vLogout.code}`}`);
  const hopFile = join(dir, "hop-login.html"); writeFileSync(hopFile, "");
  const vLogin = verdict({ ...none, login: "302 ", loginFile: hopFile });
  ok(vLogin.code === 1 && /not a live sign-in page/.test(vLogin.why), `clause /login-is-live alone: the launcher-era /login (a 302 hop away) fails it — ${vLogin.why || `exit ${vLogin.code}`}`);
  const noFormFile = join(dir, "no-form-login.html"); writeFileSync(noFormFile, "<!doctype html><p>moved</p>");
  const vNoForm = verdict({ ...none, loginFile: noFormFile });
  ok(vNoForm.code === 1 && /serves no sign-in form/.test(vNoForm.why), `clause /login-has-a-form alone: a 200 page with no form fails it — ${vNoForm.why || `exit ${vNoForm.code}`}`);
  const vErr = verdict({ ...none, homeCode: "500" });
  ok(vErr.code === 1, `clause home-rendered: a /home that did not render cannot pass on an empty anchor count — ${vErr.why || `exit ${vErr.code}`}`);

  // 4. the scar the rewrite closes: the OLD discriminator could not tell two pages apart (under the old
  // shell both carried the stylesheet rule; under the Brand v2 shell neither carries the string at all)
  const oldGrep = (f) => readFileSync(f, "utf8").includes("launcher-link");
  ok(oldGrep(none.homeFile) === oldGrep(set.homeFile),
    "scar pinned: the old `grep -q 'launcher-link'` answers the SAME for both pages, so it can never tell a launcher from none");

  // 5. UI-B1a: the shell-proof marker and the anchor clause, each load-bearing on the real /home bytes
  const homeHtml = readFileSync(none.homeFile, "utf8");
  ok(homeHtml.includes('data-region="tabs"') && !homeHtml.includes(".launcher-link{"),
    "the real signed-in /home carries the shell's rail (data-region=\"tabs\") and no longer the retired .launcher-link{ rule (the old precondition would now refuse every page)");
  const notShell = join(dir, "not-shell.html"); writeFileSync(notShell, homeHtml.replace('data-region="tabs"', 'data-region="x"'));
  const vNotShell = verdict({ ...none, homeFile: notShell });
  ok(vNotShell.code === 1 && /not the shell/.test(vNotShell.why), `clause shell-proof alone: a 200 page without the top bar cannot pass on an empty anchor count — ${vNotShell.why || `exit ${vNotShell.code}`}`);
  const withLink = join(dir, "with-link.html"); writeFileSync(withLink, homeHtml.replace('<nav class="rail-nav"', `<a class="launcher-link" href="${STALE}">All workspaces</a><nav class="rail-nav"`));
  const vLink = verdict({ ...none, homeFile: withLink });
  ok(vLink.code === 1 && /All-workspaces link/.test(vLink.why), `clause no-launcher-anchor alone: a shell that renders the retired link fails it — ${vLink.why || `exit ${vLink.code}`}`);

  // 6. the org's own /login wears ITS brand (the one assertion of the deleted frame-brand-selftest.mjs
  // that is still ruled), and an org with no row the neutral product fallback, never another org's name.
  // UI-B1b re-pin, same intent: the front door names the PRODUCT (the Fredoka sharingu wordmark) with the
  // org's own name as secondary text, and never the retired "Agent R" string, even when the org row's brand
  // titles still carry it (the live defect verify-live.sh caught, 8 of 10)
  // sprint 7, 7.4b: the sign-in lives at the platform's root; reached from the org's address (next=/<org>/…) it wears THAT
  // org's brand, reached at the root the platform's own (never org 1's by default)
  const acme = await observe({ org: { name: "Acme", productTitle: "Acme · Agent R", loginTitle: "Sign in · Acme · Agent R" } }, "acme");
  ok(acme.orgLoginHtml.includes("<title>Sign in · Acme · sharingu</title>") && acme.orgLoginHtml.includes('class="wordmark"><span class="wm-product">sharingu</span> <span class="wm-org">Acme</span><')
    && !acme.orgLoginHtml.includes("Agent R"),
    "the org row's brand: the sign-in from its own address (next=/<org>/home) says that org's name beside the product, and no Agent R though its titles carry it");
  ok(acme.loginHtml.includes("<title>Sign in · sharingu</title>") && !acme.loginHtml.includes("Acme") && !acme.loginHtml.includes("Agent R"),
    "the root's sign-in (next=/home: no org's address) wears the platform's own brand, never org 1's name");
  ok(none.loginHtml.includes("<title>Sign in · sharingu</title>") && none.loginHtml.includes('class="wordmark"><span class="wm-product">sharingu</span>') && !none.loginHtml.includes('class="wm-org"')
    && !none.loginHtml.includes("Agent R"),
    "no org row: /login wears the neutral product fallback (sharingu, the product name not repeated as an org), no Agent R");
  ok(!/\bSIRU\b|\bsiru\b/i.test(none.loginHtml + readFileSync(none.homeFile, "utf8")),
    "no org row: neither /login nor /home names another org (the old SIRU fallback is gone)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`logout-ruling-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
