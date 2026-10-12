// csrf-selftest.mjs — the ratchet for the same-origin write check (scar 2026-09-08: under `referrer-policy:
// no-referrer` a browser sends `Origin: null` on its own form POST; the launcher's crossSite() and the engine's
// csrfRefused() compared it to the host origin and refused every real sign-in for two days, while curl — no
// Origin, no Sec-Fetch-Site — sailed through and every suite stayed green). Locks the header shapes a browser
// actually sends. Run in the gate.
import { csrfRefused } from "../src/core.js";
const url = new URL("https://org.example/respond");
const person = { id: "p", viaCookie: true };
const req = (h, method = "POST") => ({ method, headers: new Headers(h) });
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };
ok(!csrfRefused(req({ "sec-fetch-site": "same-origin", origin: "null" }), url, person), "browser form POST under no-referrer (Origin: null, SFS same-origin) is ACCEPTED");
ok(!csrfRefused(req({ "sec-fetch-site": "same-origin", origin: "https://org.example" }), url, person), "browser form POST with a real Origin is accepted");
ok(!csrfRefused(req({ "sec-fetch-site": "none" }), url, person), "a user-typed navigation (SFS none) is accepted");
ok(csrfRefused(req({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }), url, person), "a cross-site form is refused");
ok(csrfRefused(req({ "sec-fetch-site": "same-site", origin: "https://sibling.example" }), url, person), "a same-SITE sibling (workers.dev neighbour) is refused");
ok(csrfRefused(req({ "sec-fetch-site": "cross-site", origin: "https://org.example" }), url, person), "SFS cross-site wins even when Origin is spoofed to match");
ok(csrfRefused(req({ origin: "https://evil.example" }), url, person), "no SFS, foreign Origin → refused (the fallback)");
ok(csrfRefused(req({ origin: "null" }), url, person), "no SFS, Origin: null (a pre-Fetch-Metadata browser on an attacker's no-referrer page) → refused");
ok(!csrfRefused(req({}), url, person), "a script client with neither header (curl, the suites) is untouched");
ok(!csrfRefused(req({ "sec-fetch-site": "cross-site" }, "GET"), url, person), "GET is never refused");
ok(!csrfRefused(req({ "sec-fetch-site": "cross-site" }), url, { id: "p", viaCookie: false }), "a Bearer caller is never refused");
console.log(`csrf-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
