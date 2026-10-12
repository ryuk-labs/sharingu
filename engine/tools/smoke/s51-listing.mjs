// tools/smoke/s51-listing.mjs — sprint 9, 9.3 (docs/plan/MARKETPLACE.md M2): the listing kit at the repo root (listing/).
//   · the docs page is the contract's (tools/make-listing-docs.mjs --check, the gate's own step); it parses, names every tool
//     the contract holds and no tool it does not, every route, the one MCP address (plugin/.mcp.json's), the site's privacy
//     page and support contact, and loads nothing from anywhere; this worker's GET /capabilities, less what is the reader's
//     own, IS the contract's inventory (the page made from either is the same page)
//   · the reviewer org (tools/make-reviewer-org.mjs, --sample-only: the sharingu import is the local proof's, ~18,130 rows with the sample) is
//     built on THIS worker as the operator would (the operator's database: the smoke's own persisted D1): the seven accounts
//     (sprint 12, 12.8: every class of a real org) sign in with their codes, each reads as its role and its hats may, the
//     walkthrough's loop stands on its goal for every seat, the sample reads; a rerun writes nothing; the record holds no code
//   · listing/test-cases.md's five positive and three negative cases, each walked on that org by the account it names, through
//     tools/listing-walk.mjs (the operator's live walk is the same code; N1: no tool of the door deletes a project, a made-up one
//     is refused, nothing changed; P1 also a wrong code and a made-up bearer)
// The codes are held in memory, never printed; a failure message names no secret. S51_SLUG / S51_DOMAIN name another org and
// other accounts, to run this file alone against a worker that already holds the default ones.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { smoke, expect, ownerKey, BASE } from "./lib.mjs";
import { checkDocs, contractInventory, inventoryOf, sameInventory, mcpAddress, DOCS_PAGE, SITE } from "../make-listing-docs.mjs";
import { run as makeReviewerOrg, ROLES } from "../make-reviewer-org.mjs";
import { walkCases, codesOf } from "../listing-walk.mjs";

const L = {};   // what the reviewer case leaves for the walk: the codes (memory only), the org's slug
const SLUG = process.env.S51_SLUG || "sharingu-review", DOMAIN = process.env.S51_DOMAIN || "review.smoke.invalid";
const redact = (s) => String(s).replace(/code: \S+/g, "code: <code>");

smoke("listing · the docs page is the contract's (--check); it names every tool and route the contract holds and no other tool, the one MCP address, the site's privacy page and support contact, and loads nothing; this worker's GET /capabilities is the contract's inventory", async () => {
  const chk = checkDocs();
  expect(chk.ok, () => `make-listing-docs --check: ${chk.why}`);
  const page = readFileSync(DOCS_PAGE, "utf8"), inv = contractInventory();
  expect(/^<!doctype html>\n/i.test(page) && /<\/html>\n$/.test(page) && (page.match(/<table>/g) || []).length === 2, "not one whole page with its two tables");
  const named = [...page.matchAll(/<tr id="tool-([a-z_]+)">/g)].map((m) => m[1]).sort();
  const want = inv.tools.map((t) => t.name).sort();
  expect(named.join() === want.join(), () => `the page's tools ${named.join()} ≠ the contract's ${want.join()}`);
  const routes = [...page.matchAll(/<tr><td class="name"><code>([A-Z]+) ([^<]+)<\/code>/g)].map((m) => `${m[1]} ${m[2]}`).sort();
  const wantR = inv.routes.map((r) => `${r.method} ${r.path.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`).sort();
  expect(routes.join() === wantR.join(), () => `the page's routes (${routes.length}) ≠ the contract's (${wantR.length})`);
  for (const code of Object.keys(inv.failures)) expect(page.includes(`id="fail-${code}"`), `the failure class ${code} is not on the page`);
  expect(page.includes(`data-address="mcp">${mcpAddress()}<`) && page.includes(`href="${SITE.privacy}"`) && page.includes(`mailto:${SITE.supportEmail}`), "the MCP address, the privacy page or the support contact is missing");
  expect(!/<script\b|<link\b(?![^>]*rel="icon")|\ssrc="/i.test(page), "the page loads a script, a stylesheet or an asset");
  const hrefs = [...page.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]).filter((h) => !h.startsWith("data:") && !h.startsWith("mailto:"));
  expect(hrefs.every((h) => h.startsWith(SITE.home) || h === SITE.credit.href), () => `a link outside the site: ${hrefs.filter((h) => !h.startsWith(SITE.home)).join(", ")}`);
  const r = await fetch(BASE + "/capabilities", { headers: { accept: "application/json", authorization: "Bearer " + ownerKey } });
  const cap = inventoryOf(await r.json());
  expect(r.status === 200 && sameInventory(cap, inv), () => `GET /capabilities ${r.status}: not the contract's inventory (${cap.tools.length} tools, ${cap.routes.length} routes)`);
  return `--check green; ${named.length} tools and ${routes.length} routes, ${Object.keys(inv.failures).length} failure classes; the address ${mcpAddress()}; no script, stylesheet or asset; this worker's inventory = the contract's`;
});

smoke("listing · the reviewer org on this worker: seven accounts made by the operator's code, an org on the reviewer plan with the sharingu and sample projects, the sample imported, the walkthrough's loop filed by its seats; each account signs in and reads as its role and hats may; a rerun writes nothing; the record holds no code", async () => {
  const { SMOKE_D1_PERSIST: persist, SMOKE_D1_CFG: cfg } = process.env;
  expect(persist && cfg, "SMOKE_D1_PERSIST and SMOKE_D1_CFG (tools/smoke.sh sets both)");
  const recordDir = mkdtempSync(join(tmpdir(), "s51-reviewer-"));
  try {
    const argv = ["--url", BASE, "--local", persist, "--config", cfg, "--sample-only", "--slug", SLUG, "--domain", DOMAIN];
    const out = [];
    const rc = await makeReviewerOrg(argv, { say: (s) => out.push(s), err: (s) => out.push(s), recordDir });
    const text = out.join("\n");
    expect(rc === 0, () => `make-reviewer-org rc ${rc}: ${redact(text).slice(-900)}`);
    L.codes = codesOf(text);
    expect(ROLES.every((r) => L.codes[r] && L.codes[r].code.length >= 12), () => `the codes printed: ${Object.keys(L.codes).join(",")}`);
    expect(/admin: signs in, role owner/.test(text) && /member: signs in, role member, reads sharingu and the sample/.test(text) && /partner: signs in, role partner, reads the sample, refused sharingu \(project_forbidden\)/.test(text),
      () => `the proof lines: ${redact(text).slice(-600)}`);
    // 12.8: each hat's seat reads its brief with the walkthrough's goal in it, and every seat sees the loop landed on both sides
    const hatLine = (r, hat) => new RegExp(`${r}: signs in, role member, reads sharingu and the sample; hats [^;]+; its ${hat} brief: \\d+ goals?, goal/pay-by-invoice among them`);
    expect(hatLine("dev", "engineering").test(text) && hatLine("bd", "gtm").test(text) && hatLine("marketing", "gtm").test(text) && hatLine("tester", "quality").test(text) && /the checks passed: AC\.invoice\.01, AC\.invoice\.02/.test(text),
      () => `the hats' proof lines: ${redact(text).slice(-900)}`);
    expect(/proposed: the BD seat's request T-\d{8}-\d+/.test(text) && /decided: the admin approves/.test(text) && /filed done: the dev's change/.test(text) && /graded: the tester proves/.test(text) && /announced: marketing's launch/.test(text)
      && ROLES.every((r) => new RegExp(`${r}: signs in.*the loop on goal/pay-by-invoice: T-\\S+ -> T-\\S+ -> T-\\S+, cells ba [1-9]\\d* · code [1-9]\\d* · gtm [1-9]\\d*, checks 2 passed`).test(text)),
      () => `the walkthrough: ${redact(text).slice(-900)}`);
    const again = [];
    const rc2 = await makeReviewerOrg(argv, { say: (s) => again.push(s), err: (s) => again.push(s), recordDir });
    expect(rc2 === 0 && /nothing written/.test(again.join("\n")) && !/code: /.test(again.join("\n")), () => `the rerun rc ${rc2}: ${redact(again.join(" ")).slice(0, 400)}`);
    const rec = readFileSync(join(recordDir, `${String(out.join("\n").match(/on (local:[^ :]+)/)[1]).replace(/[^a-zA-Z0-9-]+/g, "_")}-${SLUG}.json`), "utf8");
    const leaked = ROLES.filter((r) => rec.includes(L.codes[r].code));
    // 13.3: an import's digest, its parts and the digest it replaced are sha256 and git hashes by design; no other field holds a hex run
    const undigested = JSON.stringify(JSON.parse(rec), (k, v) => (k === "digest" || k === "before" || k === "parts" ? undefined : v));
    expect(JSON.parse(rec).state === "complete" && !leaked.length && !/[0-9a-f]{40}/.test(undigested), () => `the record: state ${JSON.parse(rec).state}, codes in it: ${leaked.join(",") || "none"}, a 40-hex run outside the digests: ${/[0-9a-f]{40}/.test(undigested)}`);
    L.slug = SLUG;
    return `org /${SLUG} built (${ROLES.map((r) => L.codes[r].email).join(", ")}); each signs in and reads as its role may; the rerun wrote nothing; the record complete, no code in it`;
  } finally { rmSync(recordDir, { recursive: true, force: true }); }
});

smoke("listing · listing/test-cases.md: five positive and three negative cases, each walked on the reviewer org by the account it names", async () => {
  expect(L.codes, "the reviewer org case did not run");
  // the walks are tools/listing-walk.mjs's: the same code the operator runs on live after a refresh
  const { heads, results } = await walkCases({ base: BASE, codes: L.codes, slug: L.slug, device: "smoke-s51" });
  const failed = results.filter((r) => !r.ok).map((r) => `${r.id} (${r.who}): ${r.why}`);
  expect(!failed.length, () => failed.join(" | "));
  return `${heads.map((h) => `${h.id} ${h.who}`).join(" · ")} — every walk as the account its heading names`;
});
