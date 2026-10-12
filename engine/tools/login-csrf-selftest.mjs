// login-csrf-selftest.mjs — heal round 1 (QC74D4892 verifier, 2026-09-22): the login-CSRF guard
// every browser sign-in POST must clear BEFORE any credential is even read. frame.js's own
// crossSite() was the ONLY place this was ever checked — src/index.js's POST /login had none:
// csrfRefused() (core.js) only fires for an ALREADY-authenticated cookie session, which does not
// exist during a login attempt. Reproduced live: a cross-site POST to a standalone org's own
// /login was fully PROCESSED (401 for a bad password, not refused) while the identical shape
// against the still-live launcher answered 403. The fix hoists frame.js's own check into
// src/util.js as crossSiteLogin() — ONE shared primitive (the launcher's own copy went with frame.js,
// deleted 2026-09-27, Q6FA72180) —
// and wires it into src/index.js's POST /login (checked first, before the body is even read).
// Locks the SAME real browser header shapes csrf-selftest.mjs locks for csrfRefused (scar
// 2026-09-08: `Origin: null` under `referrer-policy: no-referrer` is a browser's OWN form POST,
// not an attacker's — Sec-Fetch-Site, a forbidden header no script can forge, is authoritative
// whenever present). Run in the gate.
import { crossSiteLogin } from "../src/util.js";
const url = new URL("https://org.example/login");
const req = (h) => ({ headers: new Headers(h) });
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };

ok(!crossSiteLogin(req({ "sec-fetch-site": "same-origin", origin: "null" }), url), "browser form POST under no-referrer (Origin: null, SFS same-origin) is ACCEPTED");
ok(!crossSiteLogin(req({ "sec-fetch-site": "same-origin", origin: "https://org.example" }), url), "browser form POST with a real Origin is accepted");
ok(!crossSiteLogin(req({ "sec-fetch-site": "none" }), url), "a user-typed navigation (SFS none) is accepted");
ok(crossSiteLogin(req({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }), url), "a cross-site sign-in POST is refused");
ok(crossSiteLogin(req({ "sec-fetch-site": "same-site", origin: "https://sibling.example" }), url), "a same-SITE sibling (workers.dev neighbour) is refused");
ok(crossSiteLogin(req({ "sec-fetch-site": "cross-site", origin: "https://org.example" }), url), "SFS cross-site wins even when Origin is spoofed to match");
ok(crossSiteLogin(req({ origin: "https://evil.example" }), url), "no SFS, foreign Origin -> refused (the fallback)");
ok(crossSiteLogin(req({ origin: "null" }), url), "no SFS, Origin: null (a pre-Fetch-Metadata browser on an attacker's no-referrer page) -> refused");
ok(!crossSiteLogin(req({}), url), "a script client with neither header (curl, the suites) is untouched");

console.log(`login-csrf-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
